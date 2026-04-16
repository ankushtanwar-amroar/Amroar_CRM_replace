"""
DocFlow Public API — Package Creation for External Systems

Provides a REST API for third-party platforms (Salesforce, etc.) to create
full DocFlow packages with multi-template support, mixed routing, field
assignment, delivery modes, and webhook configuration.

Authentication: API Key via `Authorization: Bearer <key>` or `X-API-Key: <key>` header.
"""
import hashlib
import logging
import os
import secrets
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Header, Request
from pydantic import BaseModel, Field

import sys
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..')))

from shared.database import db
from ..services.package_service import PackageService
from ..services.webhook_service import WebhookService

router = APIRouter(prefix="/public/packages", tags=["DocFlow Public API"])
logger = logging.getLogger(__name__)

package_service = PackageService(db)
webhook_service = WebhookService(db)


# ── API Key Auth ──

def _hash_key(raw_key: str) -> str:
    return hashlib.sha256(raw_key.encode()).hexdigest()


async def verify_api_key(
    authorization: Optional[str] = Header(None),
    x_api_key: Optional[str] = Header(None),
) -> dict:
    """
    Extract and validate API key from Authorization header or X-API-Key header.
    Returns the API key record containing tenant_id.
    """
    raw_key = None

    if authorization and authorization.startswith("Bearer "):
        raw_key = authorization[7:].strip()
    elif x_api_key:
        raw_key = x_api_key.strip()

    if not raw_key:
        raise HTTPException(
            status_code=401,
            detail="API key required. Provide via 'Authorization: Bearer <key>' or 'X-API-Key: <key>' header.",
        )

    key_hash = _hash_key(raw_key)
    key_record = await db.docflow_api_keys.find_one(
        {"key_hash": key_hash, "is_active": True},
        {"_id": 0},
    )
    if not key_record:
        raise HTTPException(status_code=401, detail="Invalid or revoked API key.")

    # Update last_used_at
    await db.docflow_api_keys.update_one(
        {"id": key_record["id"]},
        {"$set": {"last_used_at": datetime.now(timezone.utc).isoformat()}},
    )

    return key_record


# ── Request Models ──

class TemplateInput(BaseModel):
    template_id: str
    version: Optional[int] = None  # None = use latest active version


class RecipientInput(BaseModel):
    id: Optional[str] = None  # External ID for field assignment mapping
    name: str
    email: Optional[str] = ""
    role: str = Field(default="signer", description="signer | approver | viewer | receive_copy")
    routing_order: int = Field(default=1, ge=1)
    wave: Optional[int] = None  # Optional wave grouping for mixed routing


class FieldAssignmentField(BaseModel):
    field_id: str
    recipient_id: str


class FieldAssignmentInput(BaseModel):
    template_id: str
    fields: List[FieldAssignmentField] = []


class WebhookInput(BaseModel):
    enabled: bool = False
    url: Optional[str] = None
    events: List[str] = []
    secret: Optional[str] = None


class AuthenticationInput(BaseModel):
    otp_required: bool = True


class CreatePackageRequest(BaseModel):
    tenant_id: Optional[str] = None  # Override; defaults to API key's tenant
    package_name: str = Field(..., min_length=1, max_length=200)

    templates: List[TemplateInput] = Field(..., min_length=1)

    routing_mode: str = Field(default="sequential", description="sequential | parallel | mixed")

    recipients: List[RecipientInput] = Field(default_factory=list)

    delivery_mode: str = Field(default="email", description="email | public_link | email_link")

    authentication: Optional[AuthenticationInput] = None

    field_assignments: Optional[List[FieldAssignmentInput]] = None

    webhook: Optional[WebhookInput] = None


# ── Role Mapping ──

ROLE_MAP = {
    "signer": "SIGN",
    "approver": "APPROVE_REJECT",
    "viewer": "VIEW_ONLY",
    "receive_copy": "RECEIVE_COPY",
    # Also accept internal role types
    "SIGN": "SIGN",
    "APPROVE_REJECT": "APPROVE_REJECT",
    "VIEW_ONLY": "VIEW_ONLY",
    "RECEIVE_COPY": "RECEIVE_COPY",
}


# ── Package Listing Endpoints ──

@router.get("")
async def list_packages(
    api_key: dict = Depends(verify_api_key),
    status: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
):
    """
    List all packages (blueprints) for the tenant.
    Each package includes its templates with full field placement data.

    Query params:
      - status: filter by package status (active, draft, archived). Omit for all.
      - skip / limit: pagination.

    Authentication: API Key via `Authorization: Bearer <key>` or `X-API-Key: <key>`.
    """
    tenant_id = api_key.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=400, detail="API key has no tenant_id")

    query = {"tenant_id": tenant_id, "_type": {"$ne": "run"}}
    if status:
        query["status"] = status

    cursor = db.docflow_packages.find(
        query,
        {"_id": 0, "id": 1, "name": 1, "status": 1, "documents": 1, "created_at": 1},
    ).sort("created_at", -1).skip(skip).limit(limit)

    packages_raw = await cursor.to_list(length=limit)
    total = await db.docflow_packages.count_documents(query)

    # Enrich each package with template + field placement data
    packages = []
    for pkg in packages_raw:
        enriched_docs = []
        for doc in pkg.get("documents", []):
            tmpl_id = doc.get("template_id")
            if not tmpl_id:
                continue

            # Find the latest active version of this template
            template = await db.docflow_templates.find_one(
                {"id": tmpl_id, "tenant_id": tenant_id, "status": "active", "is_latest": True},
                {"_id": 0, "id": 1, "name": 1, "version": 1, "is_latest": 1, "field_placements": 1},
            )
            if not template:
                # Fallback: highest version for this tenant
                template = await db.docflow_templates.find_one(
                    {"id": tmpl_id, "tenant_id": tenant_id, "status": "active"},
                    {"_id": 0, "id": 1, "name": 1, "version": 1, "is_latest": 1, "field_placements": 1},
                    sort=[("version", -1)],
                )

            fields = []
            if template:
                for fp in template.get("field_placements", []):
                    fields.append({
                        "field_id": fp.get("id"),
                        "field_name": fp.get("label") or fp.get("name", ""),
                        "field_type": fp.get("type", "text"),
                        "page": fp.get("page", 1),
                        "position": {
                            "x": fp.get("x", 0),
                            "y": fp.get("y", 0),
                            "width": fp.get("width", 150),
                            "height": fp.get("height", 40),
                        },
                        "required": fp.get("required", False),
                        "assigned_role": fp.get("assigned_to") or fp.get("recipient_id") or None,
                    })

            enriched_docs.append({
                "template_id": tmpl_id,
                "document_name": doc.get("document_name", ""),
                "order": doc.get("order", 1),
                "template_name": template.get("name", "") if template else "",
                "template_version": template.get("version") if template else None,
                "is_latest_version": template.get("is_latest", False) if template else False,
                "fields": fields,
            })

        packages.append({
            "package_id": pkg["id"],
            "package_name": pkg.get("name", ""),
            "status": pkg.get("status", "draft"),
            "created_at": pkg.get("created_at"),
            "templates": enriched_docs,
        })

    return {
        "packages": packages,
        "total": total,
        "skip": skip,
        "limit": limit,
    }


# ── API Key Management Endpoints (Admin JWT Auth) ──
# MUST be defined BEFORE /{package_id} to avoid route shadowing

@router.post("/api-keys/generate")
async def generate_api_key(
    request: Request,
    authorization: Optional[str] = Header(None),
):
    """
    Generate a new API key for a tenant. Requires admin JWT auth.
    """
    from shared.auth import JWT_SECRET, ALGORITHM
    import jwt

    token = None
    if authorization and authorization.startswith("Bearer "):
        token = authorization[7:].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Admin authentication required")

    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[ALGORITHM])
        user_id = payload.get("user_id")
        tenant_id = payload.get("tenant_id")
        if not user_id or not tenant_id:
            raise HTTPException(status_code=401, detail="Invalid token")
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

    body = await request.json()
    key_name = body.get("name", "Default API Key")

    # Generate a secure API key
    raw_key = f"dfk_{secrets.token_urlsafe(32)}"
    key_hash = _hash_key(raw_key)
    now = datetime.now(timezone.utc).isoformat()

    key_record = {
        "id": str(uuid4()),
        "tenant_id": tenant_id,
        "key_hash": key_hash,
        "key_prefix": raw_key[:12],
        "name": key_name,
        "is_active": True,
        "created_by": user_id,
        "created_at": now,
        "last_used_at": None,
    }

    await db.docflow_api_keys.insert_one(key_record)

    return {
        "success": True,
        "api_key": raw_key,
        "key_id": key_record["id"],
        "key_prefix": key_record["key_prefix"],
        "name": key_name,
        "message": "API key generated. Store it securely — it will not be shown again.",
    }


@router.get("/api-keys")
async def list_api_keys(
    authorization: Optional[str] = Header(None),
):
    """List all API keys for the tenant (shows prefix only, not full key)."""
    from shared.auth import JWT_SECRET, ALGORITHM
    import jwt

    token = None
    if authorization and authorization.startswith("Bearer "):
        token = authorization[7:].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Admin authentication required")

    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[ALGORITHM])
        tenant_id = payload.get("tenant_id")
        if not tenant_id:
            raise HTTPException(status_code=401, detail="Invalid token")
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
        raise HTTPException(status_code=401, detail="Invalid token")

    cursor = db.docflow_api_keys.find(
        {"tenant_id": tenant_id},
        {"_id": 0, "key_hash": 0}
    ).sort("created_at", -1)

    keys = await cursor.to_list(length=100)
    return {"api_keys": keys}


@router.delete("/api-keys/{key_id}")
async def revoke_api_key(
    key_id: str,
    authorization: Optional[str] = Header(None),
):
    """Revoke an API key."""
    from shared.auth import JWT_SECRET, ALGORITHM
    import jwt

    token = None
    if authorization and authorization.startswith("Bearer "):
        token = authorization[7:].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Admin authentication required")

    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[ALGORITHM])
        tenant_id = payload.get("tenant_id")
        if not tenant_id:
            raise HTTPException(status_code=401, detail="Invalid token")
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
        raise HTTPException(status_code=401, detail="Invalid token")

    result = await db.docflow_api_keys.update_one(
        {"id": key_id, "tenant_id": tenant_id},
        {"$set": {"is_active": False, "revoked_at": datetime.now(timezone.utc).isoformat()}},
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="API key not found")

    return {"success": True, "message": "API key revoked"}


# ── Send Package (Public API) ──

class SendPackageRecipient(BaseModel):
    id: Optional[str] = None
    name: str
    email: Optional[str] = None
    role: str = "signer"  # signer, approver, reviewer, receive_copy
    routing_order: int = 1
    wave: Optional[int] = None
    email_template_id: Optional[str] = None

class SendPackageFieldAssignment(BaseModel):
    field_id: str
    recipient_id: str

class SendPackageTemplateAssignment(BaseModel):
    template_id: str
    fields: List[SendPackageFieldAssignment] = []

class SendPackageAuth(BaseModel):
    otp_required: bool = True

class TemplateMergeFields(BaseModel):
    template_id: str
    merge_fields: Dict[str, Any] = {}

class SendPackageRequest(BaseModel):
    package_id: str
    recipients: List[SendPackageRecipient] = []
    routing_mode: str = "sequential"  # sequential, parallel, mixed
    delivery_mode: str = "email"  # email, public_link, both, public_recipients
    field_assignments: List[SendPackageTemplateAssignment] = []
    authentication: Optional[SendPackageAuth] = None
    template_merge_fields: Optional[List[TemplateMergeFields]] = None


SEND_ROLE_MAP = {
    "signer": "SIGN",
    "approver": "APPROVE_REJECT",
    "reviewer": "VIEW_ONLY",
    "receive_copy": "RECEIVE_COPY",
    "viewer": "VIEW_ONLY",
}


@router.post("/send")
async def send_package(
    req: SendPackageRequest,
    api_key: dict = Depends(verify_api_key),
):
    """
    Send a package — creates a new run from an existing package blueprint.
    Reuses the same internal logic as the UI "Send Package" flow.

    Supports email, public_link, or both delivery modes.
    Supports sequential, parallel, and mixed routing.
    """
    tenant_id = api_key.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=400, detail="API key has no tenant_id")

    # ── 1. Validate package exists and belongs to tenant ──
    package = await db.docflow_packages.find_one(
        {"id": req.package_id, "tenant_id": tenant_id, "_type": {"$ne": "run"}},
        {"_id": 0},
    )
    if not package:
        raise HTTPException(status_code=404, detail="Package not found")

    if package.get("status") == "voided":
        raise HTTPException(status_code=400, detail="Cannot send a voided package")

    errors = []

    # ── 2. Validate routing_mode ──
    if req.routing_mode not in ("sequential", "parallel", "mixed"):
        errors.append("routing_mode must be 'sequential', 'parallel', or 'mixed'")

    # ── 3. Validate delivery_mode ──
    delivery_mode = req.delivery_mode
    if delivery_mode not in ("email", "public_link", "both", "public_recipients"):
        errors.append("delivery_mode must be 'email', 'public_link', 'both', or 'public_recipients'")

    # ── 4. Validate recipients ──
    needs_email = delivery_mode in ("email", "both")
    needs_recipients = delivery_mode in ("email", "both", "public_recipients")
    if needs_recipients and not req.recipients:
        errors.append("At least one recipient is required for this delivery mode")

    for i, r in enumerate(req.recipients):
        role = SEND_ROLE_MAP.get(r.role)
        if not role:
            errors.append(f"Recipient '{r.name}' has invalid role '{r.role}'. Valid: signer, approver, reviewer, receive_copy")
        if needs_email and not r.email and r.role != "receive_copy":
            errors.append(f"Recipient '{r.name}': email required for email delivery mode")

    # ── 5. Validate field_assignments ──
    template_ids = {d.get("template_id") for d in package.get("documents", [])}
    ext_recipient_ids = {(r.id or f"_auto_{i}") for i, r in enumerate(req.recipients)}
    for fa in req.field_assignments:
        if fa.template_id not in template_ids:
            errors.append(f"Field assignment references unknown template '{fa.template_id}'")
        for f in fa.fields:
            if f.recipient_id not in ext_recipient_ids:
                errors.append(f"Field '{f.field_id}' assigned to unknown recipient '{f.recipient_id}'")

    # ── 6. Validate template_merge_fields ──
    # Build lookups for flexible template matching:
    # - template_group_id -> package template_id
    # - template name -> package template_id
    group_to_pkg_template = {}
    name_to_pkg_template = {}
    for doc_entry in package.get("documents", []):
        tid = doc_entry.get("template_id")
        if tid:
            tmpl = await db.docflow_templates.find_one(
                {"id": tid}, {"_id": 0, "template_group_id": 1, "name": 1}
            )
            if tmpl:
                if tmpl.get("template_group_id"):
                    group_to_pkg_template[tmpl["template_group_id"]] = tid
                if tmpl.get("name"):
                    name_to_pkg_template[tmpl["name"]] = tid

    # Also check if the provided ID is a template that shares the same name
    async def _resolve_template_id(provided_id):
        """Resolve provided template ID to the actual ID in the package."""
        if provided_id in template_ids:
            return provided_id
        if provided_id in group_to_pkg_template:
            return group_to_pkg_template[provided_id]
        # Check if provided ID is a template whose name matches one in the package
        ext_tmpl = await db.docflow_templates.find_one(
            {"id": provided_id}, {"_id": 0, "name": 1}
        )
        if ext_tmpl and ext_tmpl.get("name") in name_to_pkg_template:
            return name_to_pkg_template[ext_tmpl["name"]]
        return None

    merge_fields_map: Dict[str, Dict[str, Any]] = {}
    if req.template_merge_fields:
        for tmf in req.template_merge_fields:
            resolved_id = await _resolve_template_id(tmf.template_id)
            if not resolved_id:
                errors.append(f"template_merge_fields references unknown template '{tmf.template_id}'")
                continue
            merge_fields_map[resolved_id] = tmf.merge_fields

    if errors:
        raise HTTPException(status_code=400, detail={"errors": errors, "message": "Validation failed"})

    # ── Build recipient data (same as internal send flow) ──
    assignment_map = {}
    for fa in req.field_assignments:
        for f in fa.fields:
            if f.recipient_id not in assignment_map:
                assignment_map[f.recipient_id] = {}
            if fa.template_id not in assignment_map[f.recipient_id]:
                assignment_map[f.recipient_id][fa.template_id] = []
            assignment_map[f.recipient_id][fa.template_id].append(f.field_id)

    pkg_recipients = []
    for i, r in enumerate(req.recipients):
        ext_id = r.id or f"_auto_{i}"
        role = SEND_ROLE_MAP.get(r.role, "SIGN")
        routing_order = r.routing_order
        if req.routing_mode == "parallel":
            routing_order = 1
        elif req.routing_mode == "mixed" and r.wave is not None:
            routing_order = r.wave

        pkg_recipients.append({
            "name": r.name,
            "email": r.email or "",
            "role_type": role,
            "routing_order": routing_order,
            "assigned_components": assignment_map.get(ext_id, {}),
            "email_template_id": r.email_template_id,
        })

    routing_config = {
        "mode": req.routing_mode if req.routing_mode != "mixed" else "sequential",
        "on_reject": "void",
    }

    otp_required = True
    if req.authentication:
        otp_required = req.authentication.otp_required
    security = {"require_auth": otp_required, "session_timeout_minutes": 15}

    # ── Execute Send via PackageService (same as internal flow) ──
    try:
        run = await package_service.send_package_run(
            package_id=req.package_id,
            package=package,
            recipients=pkg_recipients,
            routing_config=routing_config,
            security=security,
            delivery_mode=delivery_mode,
            send_email=needs_email,
            user_id=api_key.get("created_by", "api"),
            tenant_id=tenant_id,
            template_merge_fields=merge_fields_map,
        )
    except Exception as e:
        logger.error(f"Public API send_package failed: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to send package: {str(e)}")

    # ── Build response ──
    frontend_url = os.environ.get("FRONTEND_URL", "")
    public_link = None
    public_link_token = run.get("public_link_token", "")
    if delivery_mode in ("public_link", "both") and public_link_token:
        public_link = f"{frontend_url}/docflow/package/{run['id']}/public/{public_link_token}"

    # Build recipient links for email mode
    recipient_links = []
    for r in run.get("recipients", []):
        if r.get("role_type") == "RECEIVE_COPY":
            continue
        link = f"{frontend_url}/docflow/package/{run['id']}/view/{r['public_token']}" if r.get("public_token") else None
        entry = {
            "name": r.get("name"),
            "email": r.get("email"),
            "role": r.get("role_type"),
            "routing_order": r.get("routing_order"),
            "status": r.get("status", "pending"),
            "access_link": link,
        }
        # For public_recipients mode, include signing_link explicitly
        if delivery_mode == "public_recipients":
            entry["signing_link"] = link
            entry["recipient_id"] = r.get("id")
        recipient_links.append(entry)

    # Document details
    documents = []
    for d in run.get("documents", []):
        documents.append({
            "document_id": d.get("document_id"),
            "template_id": d.get("template_id"),
            "document_name": d.get("document_name", ""),
            "order": d.get("order", 1),
        })

    return {
        "success": True,
        "run_id": run["id"],
        "package_id": req.package_id,
        "status": run.get("status", "in_progress"),
        "delivery_mode": delivery_mode,
        "public_link": public_link,
        "recipient_links": recipient_links,
        "documents": documents,
        "message": "Package sent successfully",
    }


# ── Package Detail (catch-all, must come AFTER specific routes) ──

@router.get("/{package_id}")
async def get_package(
    package_id: str,
    api_key: dict = Depends(verify_api_key),
):
    """
    Get a single package with full template and field placement data.

    Authentication: API Key via `Authorization: Bearer <key>` or `X-API-Key: <key>`.
    """
    tenant_id = api_key.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=400, detail="API key has no tenant_id")

    pkg = await db.docflow_packages.find_one(
        {"id": package_id, "tenant_id": tenant_id, "_type": {"$ne": "run"}},
        {"_id": 0, "id": 1, "name": 1, "status": 1, "documents": 1, "created_at": 1,
         "webhook_config": 1, "security_settings": 1},
    )
    if not pkg:
        raise HTTPException(status_code=404, detail="Package not found")

    enriched_docs = []
    for doc in pkg.get("documents", []):
        tmpl_id = doc.get("template_id")
        if not tmpl_id:
            continue

        template = await db.docflow_templates.find_one(
            {"id": tmpl_id, "tenant_id": tenant_id, "status": "active", "is_latest": True},
            {"_id": 0, "id": 1, "name": 1, "version": 1, "is_latest": 1, "field_placements": 1},
        )
        if not template:
            template = await db.docflow_templates.find_one(
                {"id": tmpl_id, "tenant_id": tenant_id, "status": "active"},
                {"_id": 0, "id": 1, "name": 1, "version": 1, "is_latest": 1, "field_placements": 1},
                sort=[("version", -1)],
            )

        fields = []
        if template:
            for fp in template.get("field_placements", []):
                fields.append({
                    "field_id": fp.get("id"),
                    "field_name": fp.get("label") or fp.get("name", ""),
                    "field_type": fp.get("type", "text"),
                    "page": fp.get("page", 1),
                    "position": {
                        "x": fp.get("x", 0),
                        "y": fp.get("y", 0),
                        "width": fp.get("width", 150),
                        "height": fp.get("height", 40),
                    },
                    "required": fp.get("required", False),
                    "assigned_role": fp.get("assigned_to") or fp.get("recipient_id") or None,
                    "placeholder": fp.get("placeholder", ""),
                    "validation": fp.get("validation", "none"),
                    "default_value": fp.get("defaultValue", ""),
                })

        enriched_docs.append({
            "template_id": tmpl_id,
            "document_name": doc.get("document_name", ""),
            "order": doc.get("order", 1),
            "template_name": template.get("name", "") if template else "",
            "template_version": template.get("version") if template else None,
            "is_latest_version": template.get("is_latest", False) if template else False,
            "field_count": len(fields),
            "fields": fields,
        })

    # Get run stats for this package
    runs_count = await db.docflow_package_runs.count_documents({"package_id": package_id})
    completed_runs = await db.docflow_package_runs.count_documents(
        {"package_id": package_id, "status": "completed"}
    )

    return {
        "package_id": pkg["id"],
        "package_name": pkg.get("name", ""),
        "status": pkg.get("status", "draft"),
        "created_at": pkg.get("created_at"),
        "templates": enriched_docs,
        "total_templates": len(enriched_docs),
        "runs_count": runs_count,
        "completed_runs": completed_runs,
    }



# ── Create Package Endpoint ──

@router.post("/create")
async def create_package(
    req: CreatePackageRequest,
    api_key: dict = Depends(verify_api_key),
):
    """
    Create a full DocFlow package from an external system.

    Supports: multiple templates, mixed routing (parallel + sequential),
    field-level assignment per template, delivery modes (email / public_link),
    and webhook configuration.
    """
    tenant_id = req.tenant_id or api_key.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=400, detail="tenant_id is required")

    frontend_url = os.environ.get("FRONTEND_URL", "")
    errors = []

    # ── 1. Validate templates ──
    validated_templates = []
    for t_input in req.templates:
        query = {"tenant_id": tenant_id, "status": "active"}
        if t_input.version:
            query["id"] = t_input.template_id
            query["version"] = t_input.version
        else:
            # Find latest active version by template ID
            query["id"] = t_input.template_id
            query["is_latest"] = True

        template = await db.docflow_templates.find_one(query, {"_id": 0, "id": 1, "name": 1, "version": 1})
        if not template:
            # Try without is_latest (fallback)
            fallback_query = {"id": t_input.template_id, "tenant_id": tenant_id, "status": "active"}
            if t_input.version:
                fallback_query["version"] = t_input.version
            template = await db.docflow_templates.find_one(
                fallback_query, {"_id": 0, "id": 1, "name": 1, "version": 1},
                sort=[("version", -1)],
            )
        if not template:
            errors.append(f"Template '{t_input.template_id}' (v{t_input.version or 'latest'}) not found or not active.")
        else:
            validated_templates.append({
                "template_id": template["id"],
                "template_name": template.get("name", ""),
                "version": template.get("version"),
            })

    # ── 2. Validate routing_mode ──
    if req.routing_mode not in ("sequential", "parallel", "mixed"):
        errors.append("routing_mode must be 'sequential', 'parallel', or 'mixed'.")

    # ── 3. Validate delivery_mode ──
    delivery_mode = req.delivery_mode
    if delivery_mode == "email_link":
        delivery_mode = "both"
    if delivery_mode not in ("email", "public_link", "both"):
        errors.append("delivery_mode must be 'email', 'public_link', or 'email_link'.")

    # ── 4. Validate recipients ──
    if not req.recipients and delivery_mode != "public_link":
        errors.append("At least one recipient is required for email delivery mode.")

    # Build external_id -> internal mapping
    recipient_id_map = {}  # external_id -> internal_uuid
    for r in req.recipients:
        ext_id = r.id or str(uuid4())
        recipient_id_map[ext_id] = str(uuid4())

    for r in req.recipients:
        if delivery_mode in ("email", "both") and not r.email:
            errors.append(f"Recipient '{r.name}' requires an email for email delivery mode.")
        role = ROLE_MAP.get(r.role)
        if not role:
            errors.append(f"Recipient '{r.name}' has invalid role '{r.role}'. Valid: signer, approver, viewer, receive_copy.")

    # ── 5. Validate field_assignments ──
    if req.field_assignments:
        template_ids = {t.template_id for t in req.templates}
        ext_recipient_ids = {(r.id or f"_auto_{i}") for i, r in enumerate(req.recipients)}
        for fa in req.field_assignments:
            if fa.template_id not in template_ids:
                errors.append(f"Field assignment references unknown template '{fa.template_id}'.")
            for f in fa.fields:
                if f.recipient_id not in ext_recipient_ids:
                    errors.append(f"Field '{f.field_id}' assigned to unknown recipient '{f.recipient_id}'.")

    if errors:
        raise HTTPException(status_code=400, detail={"errors": errors, "message": "Validation failed."})

    # ── Build Package Data ──

    # Documents
    pkg_documents = []
    for i, vt in enumerate(validated_templates):
        pkg_documents.append({
            "template_id": vt["template_id"],
            "document_name": vt["template_name"] or f"Document {i + 1}",
            "order": i + 1,
            "merge_fields": {},
        })

    # Build assigned_components_map per recipient: { template_id: [field_ids] }
    assignment_map = {}  # ext_recipient_id -> { template_id: [field_ids] }
    if req.field_assignments:
        for fa in req.field_assignments:
            for f in fa.fields:
                if f.recipient_id not in assignment_map:
                    assignment_map[f.recipient_id] = {}
                if fa.template_id not in assignment_map[f.recipient_id]:
                    assignment_map[f.recipient_id][fa.template_id] = []
                assignment_map[f.recipient_id][fa.template_id].append(f.field_id)

    # Recipients
    pkg_recipients = []
    for i, r in enumerate(req.recipients):
        ext_id = r.id or f"_auto_{i}"
        role = ROLE_MAP.get(r.role, "SIGN")
        routing_order = r.routing_order
        if req.routing_mode == "parallel":
            routing_order = 1  # All parallel
        elif req.routing_mode == "mixed" and r.wave is not None:
            routing_order = r.wave  # Use wave as routing_order for mixed

        pkg_recipients.append({
            "name": r.name,
            "email": r.email or "",
            "role_type": role,
            "routing_order": routing_order,
            "assigned_components": assignment_map.get(ext_id, {}),
            "email_template_id": getattr(r, 'email_template_id', None),
        })

    # Routing config
    routing_config = {
        "mode": req.routing_mode if req.routing_mode != "mixed" else "sequential",
        "on_reject": "void",
    }
    # For mixed mode, the routing engine uses routing_order to determine waves
    # (same routing_order = parallel within wave, different = sequential between waves)

    # Security
    otp_required = True
    if req.authentication:
        otp_required = req.authentication.otp_required
    security = {"require_auth": otp_required, "session_timeout_minutes": 15}

    # Webhook
    webhook_config = {}
    if req.webhook and req.webhook.enabled and req.webhook.url:
        webhook_config = {
            "url": req.webhook.url,
            "events": req.webhook.events,
            "secret": req.webhook.secret or "",
        }

    # Should we send emails?
    send_email = delivery_mode in ("email", "both")

    # ── Create Package via Service ──
    try:
        package = await package_service.create_and_send_package(
            name=req.package_name,
            documents=pkg_documents,
            recipients=pkg_recipients,
            routing_config=routing_config,
            output_mode="separate",
            security=security,
            source_context={"source": "public_api", "api_key_id": api_key.get("id")},
            expires_at=None,
            send_email=send_email,
            delivery_mode=delivery_mode,
            user_id=api_key.get("created_by", "api"),
            tenant_id=tenant_id,
            webhook_config=webhook_config,
        )
    except Exception as e:
        logger.error(f"Public API: Failed to create package: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to create package: {str(e)}")

    # ── Build Response ──
    package_id = package.get("id", "")

    # Public link
    public_link = None
    public_link_token = package.get("public_link_token", "")
    if public_link_token:
        public_link = f"{frontend_url}/docflow/package/{package_id}/public/{public_link_token}"

    # Recipient links
    recipient_links = []
    for pr in package.get("recipients", []):
        token = pr.get("public_token", "")
        link = f"{frontend_url}/docflow/package/{package_id}/view/{token}" if token else ""
        recipient_links.append({
            "name": pr.get("name", ""),
            "email": pr.get("email", ""),
            "role": pr.get("role_type", "SIGN"),
            "routing_order": pr.get("routing_order", 1),
            "status": pr.get("status", "pending"),
            "access_link": link,
        })

    # Document IDs
    document_ids = []
    for doc in package.get("documents", []):
        document_ids.append({
            "document_id": doc.get("document_id"),
            "template_id": doc.get("template_id"),
            "document_name": doc.get("document_name", ""),
            "order": doc.get("order", 1),
        })

    # Trigger webhook for package_created
    if webhook_config.get("url") and "package_created" in webhook_config.get("events", []):
        try:
            await webhook_service.trigger_webhook(
                tenant_id=tenant_id,
                package_id=package_id,
                event="package_created",
                payload={
                    "package_id": package_id,
                    "package_name": req.package_name,
                    "status": package.get("status", "in_progress"),
                    "documents": len(document_ids),
                    "recipients": len(recipient_links),
                },
            )
        except Exception as e:
            logger.warning(f"Failed to trigger package_created webhook: {e}")

    return {
        "success": True,
        "package_id": package_id,
        "status": package.get("status", "in_progress"),
        "public_link": public_link,
        "recipient_links": recipient_links,
        "documents": document_ids,
        "message": "Package created successfully",
    }


# Note: API Key management endpoints (generate, list, revoke) are defined
# above the /{package_id} catch-all route to prevent route shadowing.
