"""
Generate Links API v2 - Complete document generation with routing, delivery, and field assignment
Supports: sequential/parallel routing, email/public_link/both delivery, assigned_components per recipient
"""
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, field_validator
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
import os
import logging

logger = logging.getLogger(__name__)

import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))))

from shared.database import db
from shared.models import User
from shared.auth import get_current_user
from ..models.document_model import DeliveryChannel
from ..services.document_service_enhanced import EnhancedDocumentService
from ..services.activity_log_service import ActivityLogService
from ..services.package_service import PackageService
from ..services.webhook_service import WebhookService
import hashlib
from fastapi import Header

router = APIRouter(prefix="/v1/documents", tags=["DocFlow External APIs"])

enhanced_document_service = EnhancedDocumentService(db)
activity_log_service = ActivityLogService(db)
package_service = PackageService(db)
webhook_service_gl = WebhookService(db)


def _hash_api_key(raw_key: str) -> str:
    return hashlib.sha256(raw_key.encode()).hexdigest()


async def get_user_or_api_key(
    authorization: Optional[str] = Header(None),
    x_api_key: Optional[str] = Header(None),
) -> User:
    """
    Dual auth: Accept either JWT Bearer token or API Key (X-API-Key / Bearer dfk_*).
    Returns a User object in both cases.
    """
    # Check if this is an API key (starts with dfk_ prefix)
    raw_key = None
    if x_api_key:
        raw_key = x_api_key.strip()
    elif authorization and authorization.startswith("Bearer dfk_"):
        raw_key = authorization[7:].strip()

    if raw_key and raw_key.startswith("dfk_"):
        # API Key auth
        key_hash = _hash_api_key(raw_key)
        key_record = await db.docflow_api_keys.find_one(
            {"key_hash": key_hash, "is_active": True},
            {"_id": 0},
        )
        if not key_record:
            raise HTTPException(status_code=401, detail="Invalid or revoked API key.")

        await db.docflow_api_keys.update_one(
            {"id": key_record["id"]},
            {"$set": {"last_used_at": datetime.now(timezone.utc).isoformat()}},
        )

        # Return a synthetic User object from the API key
        return User(
            id=key_record.get("id", "api-key-user"),
            email="api-key@docflow",
            first_name="API",
            last_name="Key",
            tenant_id=key_record["tenant_id"],
            role_id=None,
        )

    # Fall back to JWT auth
    from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=401,
            detail="Not authenticated. Provide JWT token via 'Authorization: Bearer <token>' or API key via 'X-API-Key: <key>'.",
        )
    # Use standard JWT auth
    from shared.auth import get_current_user as _get_jwt_user
    from fastapi import Request
    import jwt as pyjwt

    token = authorization[7:].strip()
    try:
        secret = os.environ.get("JWT_SECRET", os.environ.get("SECRET_KEY", "default-secret"))
        payload = pyjwt.decode(token, secret, algorithms=["HS256"])
        user_id = payload.get("user_id")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")
        user_doc = await db.users.find_one({"id": user_id}, {"_id": 0})
        if not user_doc:
            raise HTTPException(status_code=401, detail="User not found")
        return User(**user_doc)
    except pyjwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except pyjwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


class RecipientInput(BaseModel):
    name: str = Field(..., description="Full name")
    email: Optional[str] = Field(default="", description="Email (required for email delivery)")
    role: str = Field(default="signer", description="Role: signer, approver, viewer")
    role_type: Optional[str] = Field(default=None, description="Package role: SIGN, VIEW_ONLY, APPROVE_REJECT, RECEIVE_COPY")
    routing_order: int = Field(default=1, ge=1)
    assigned_components: Optional[List[str]] = Field(default_factory=list, description="IDs of template fields assigned to this recipient (basic mode)")
    assigned_components_map: Optional[Dict[str, List[str]]] = Field(default=None, description="Package mode: {template_id: [field_ids]}")
    email_template_id: Optional[str] = Field(default=None, description="Custom email template ID to use when notifying this recipient")


class PackageDocumentInput(BaseModel):
    template_id: str
    document_name: str = ""
    order: int = 1
    merge_fields: Dict[str, Any] = Field(default_factory=dict)


class RoutingConfigInput(BaseModel):
    mode: str = "sequential"
    on_reject: str = "void"


class SecurityInput(BaseModel):
    require_auth: bool = True
    session_timeout_minutes: int = 15


class SourceContext(BaseModel):
    record_id: str = Field(default="", description="CRM record ID")
    object_type: str = Field(default="", description="CRM object type")
    salesforce_org_id: Optional[str] = Field(default=None)
    fields: Optional[Dict[str, Any]] = Field(default_factory=dict)


class GenerateLinksRequest(BaseModel):
    # Basic mode fields (backward compatible)
    template_id: Optional[str] = Field(default=None, description="Template ID for basic mode")
    document_name: Optional[str] = ""
    routing_type: str = Field(default="sequential", description="sequential or parallel")
    delivery_mode: str = Field(default="email", description="email, public_link, both, or public_recipients")
    send_email: bool = Field(default=True, description="Whether to actually send emails")
    source_context: Optional[SourceContext] = None
    recipients: Optional[List[RecipientInput]] = Field(default_factory=list)
    merge_fields: Optional[Dict[str, Any]] = Field(default_factory=dict)
    expires_at: Optional[str] = Field(default=None, description="ISO datetime string for expiry, null for no expiry")
    require_auth: bool = Field(default=True, description="Whether OTP authentication is required for document access")

    # Package mode fields (new)
    send_mode: str = Field(default="basic", description="basic (single doc) or package (multi doc)")
    package_name: Optional[str] = Field(default=None, description="Package name (package mode)")
    documents: Optional[List[PackageDocumentInput]] = Field(default=None, description="Documents in package (package mode)")
    routing_config: Optional[RoutingConfigInput] = Field(default=None, description="Routing config (package mode)")
    output_mode: Optional[str] = Field(default="separate", description="separate, combined, both (package mode)")
    security: Optional[SecurityInput] = Field(default=None, description="Security settings (package mode)")
    webhook_config: Optional[Dict[str, Any]] = Field(default=None, description="Webhook configuration (url, events, secret)")

    @field_validator('routing_type')
    @classmethod
    def validate_routing_type(cls, v):
        if v not in ('sequential', 'parallel'):
            raise ValueError("routing_type must be 'sequential' or 'parallel'")
        return v

    @field_validator('delivery_mode')
    @classmethod
    def validate_delivery_mode(cls, v):
        if v not in ('email', 'public_link', 'both', 'public_recipients'):
            raise ValueError("delivery_mode must be 'email', 'public_link', 'both', or 'public_recipients'")
        return v

    @field_validator('send_mode')
    @classmethod
    def validate_send_mode(cls, v):
        if v not in ('basic', 'package'):
            raise ValueError("send_mode must be 'basic' or 'package'")
        return v


def error_response(msg: str, errors: List[str] = None, code: int = 400):
    return JSONResponse(
        status_code=code,
        content={
            "success": False,
            "message": msg,
            "document_id": None,
            "status": None,
            "recipient_links": [],
            "public_link": None,
            "errors": errors or []
        }
    )


@router.post("/generate-links")
async def generate_links(
    req: GenerateLinksRequest,
    current_user: User = Depends(get_user_or_api_key)
) -> Dict[str, Any]:
    """
    Generate document with full workflow support.
    
    Basic mode (send_mode="basic"): Single-document generation (backward compatible).
    Package mode (send_mode="package"): Multi-document package workflow.
    """

    # ── PACKAGE MODE ──
    if req.send_mode == "package":
        return await _handle_package_mode(req, current_user)

    # ── BASIC MODE (existing logic, unchanged) ──
    if not req.template_id:
        return error_response("template_id is required for basic mode.", ["Missing template_id"])

    errors: List[str] = []
    frontend_url = os.environ.get("FRONTEND_URL", "")

    try:
        logger.info(f"[generate-links] template={req.template_id} delivery={req.delivery_mode} routing={req.routing_type} by {current_user.email}")

        # ── 1. Validate template ──
        template = await db.docflow_templates.find_one(
            {"id": req.template_id, "tenant_id": current_user.tenant_id},
            {"_id": 0}
        )
        if not template:
            return error_response("Template not found.", [f"Template ID: {req.template_id}"], 404)

        template_field_ids = {fp.get("id") for fp in (template.get("field_placements") or []) if fp.get("id")}

        # ── 2. Validate delivery mode vs recipients ──
        needs_email = req.delivery_mode in ("email", "both")
        needs_public_link = req.delivery_mode in ("public_link", "both")
        is_public_recipients = req.delivery_mode == "public_recipients"

        if needs_email and not req.recipients:
            errors.append("Recipients are required for email delivery mode.")
        if is_public_recipients and not req.recipients:
            errors.append("Recipients are required for public_recipients delivery mode.")

        if needs_email:
            for i, r in enumerate(req.recipients or []):
                if not r.email or not r.email.strip():
                    errors.append(f"Recipient {i+1} ({r.name}): email is required for email delivery.")

        # ── 3. Validate assigned_components ──
        assigned_registry: Dict[str, str] = {}
        for i, r in enumerate(req.recipients or []):
            for comp_id in (r.assigned_components or []):
                if comp_id not in template_field_ids:
                    errors.append(f"Recipient {i+1} ({r.name}): assigned component '{comp_id}' not found in template.")
                if comp_id in assigned_registry:
                    errors.append(f"Component '{comp_id}' assigned to both '{assigned_registry[comp_id]}' and '{r.name}'. Each component can only be assigned to one recipient.")
                assigned_registry[comp_id] = r.name

        # ── 4. Validate routing_order uniqueness for sequential ──
        if req.routing_type == "sequential" and req.recipients:
            orders = [r.routing_order for r in req.recipients]
            if len(set(orders)) != len(orders):
                errors.append("Routing orders must be unique for sequential routing.")

        if errors:
            return error_response("Validation failed.", errors)

        # ── 5. Build delivery channels ──
        delivery_channels = []
        if needs_email:
            delivery_channels.append("email")
        if needs_public_link:
            delivery_channels.append("public_link")
        if is_public_recipients:
            delivery_channels.append("email")  # Reuse email channel for recipient token generation

        # ── 6. Build recipients for service ──
        recipients_data = []
        for r in (req.recipients or []):
            recipients_data.append({
                "name": r.name,
                "email": r.email or "",
                "role": r.role,
                "routing_order": r.routing_order,
                "is_required": True,
                "assigned_field_ids": r.assigned_components or [],
                "email_template_id": r.email_template_id,
            })

        # For public_link only with no recipients, create a placeholder
        if not recipients_data and needs_public_link:
            recipients_data = [{
                "name": "",
                "email": "",
                "routing_order": 1,
                "is_required": True,
                "assigned_field_ids": [],
            }]

        # ── 7. Generate document ──
        sf_context = None
        if req.source_context:
            sf_context = {
                **req.source_context.model_dump(),
                "fields": req.merge_fields or {}
            }
        elif req.merge_fields:
            # Pass merge_fields even without source_context
            sf_context = {"fields": req.merge_fields}

        # ── Parse expiry ──
        parsed_expires_at = None
        if req.expires_at:
            try:
                parsed_expires_at = datetime.fromisoformat(req.expires_at.replace("Z", "+00:00"))
            except (ValueError, AttributeError):
                errors.append(f"Invalid expires_at format: {req.expires_at}")

        document = await enhanced_document_service.generate_document(
            template_id=req.template_id,
            crm_object_id=(req.source_context.record_id if req.source_context else "") or "api-call",
            crm_object_type=(req.source_context.object_type if req.source_context else "") or "manual",
            user_id=current_user.id,
            tenant_id=current_user.tenant_id,
            delivery_channels=delivery_channels,
            recipients=recipients_data,
            routing_mode=req.routing_type,
            send_email=req.send_email if needs_email else False,  # public_recipients skips emails
            salesforce_context=sf_context,
            expires_at=parsed_expires_at,
            require_auth=req.require_auth,
            delivery_mode=req.delivery_mode,
        )

        # ── 8. Build response ──
        doc_recipients = document.get("recipients", [])
        recipient_links = []
        for dr in doc_recipients:
            token = dr.get("public_token", "")
            link = f"{frontend_url}/docflow/view/{token}" if token else ""
            entry = {
                "name": dr.get("name", ""),
                "email": dr.get("email", ""),
                "status": dr.get("status", "pending"),
                "routing_order": dr.get("routing_order", 1),
                "assigned_components": dr.get("assigned_field_ids", []),
                "access_link": link,
            }
            if is_public_recipients:
                entry["signing_link"] = link
                entry["recipient_id"] = dr.get("id", "")
            recipient_links.append(entry)

        # Public link = first recipient's link (or document_url)
        public_link = document.get("document_url") or ""
        if not public_link and recipient_links:
            public_link = recipient_links[0].get("access_link", "")
        if public_link and not public_link.startswith("http"):
            public_link = f"{frontend_url}{public_link}"

        # ── 9. Activity Logging ──
        try:
            doc_id = document.get("id", "")
            await activity_log_service.log_document_created(
                tenant_id=current_user.tenant_id,
                template_id=req.template_id,
                document_id=doc_id,
                doc_name=req.document_name or document.get("template_name", ""),
                user_id=current_user.id,
            )
            if needs_public_link and public_link:
                await activity_log_service.log_public_link_generated(
                    tenant_id=current_user.tenant_id,
                    template_id=req.template_id,
                    document_id=doc_id,
                    link=public_link,
                    user_id=current_user.id,
                )
            if needs_email and req.send_email:
                for rl in recipient_links:
                    if rl.get("email"):
                        await activity_log_service.log_document_sent(
                            tenant_id=current_user.tenant_id,
                            template_id=req.template_id,
                            document_id=doc_id,
                            recipient_email=rl["email"],
                            user_id=current_user.id,
                        )
        except Exception as log_err:
            logger.warning(f"[generate-links] Activity log failed (non-critical): {log_err}")

        return {
            "success": True,
            "message": "Document generated successfully.",
            "document_id": document.get("id"),
            "document_name": req.document_name or document.get("template_name", ""),
            "status": "generated",
            "routing_type": req.routing_type,
            "delivery_mode": req.delivery_mode,
            "recipient_links": recipient_links,
            "public_link": public_link,
            "errors": []
        }

    except ValueError as e:
        logger.warning(f"[generate-links] Validation error: {e}")
        return error_response("Processing failed.", [str(e)])
    except Exception as e:
        logger.exception(f"[generate-links] Error: {e}")
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "message": "Internal server error.",
                "document_id": None,
                "status": None,
                "recipient_links": [],
                "public_link": None,
                "errors": [str(e)]
            }
        )


async def _handle_package_mode(
    req: GenerateLinksRequest,
    current_user: User,
) -> Dict[str, Any]:
    """Handle package mode: create package, generate all documents, initialize routing."""
    errors: List[str] = []
    frontend_url = os.environ.get("FRONTEND_URL", "")

    try:
        # Validate package-specific fields
        if not req.documents or len(req.documents) == 0:
            errors.append("At least one document is required for package mode.")

        if not req.recipients or len(req.recipients) == 0:
            if req.delivery_mode not in ("public_link",):
                errors.append("At least one recipient is required for package mode.")

        package_name = req.package_name or req.document_name or "Untitled Package"

        # Validate each document's template exists
        if req.documents:
            for i, doc in enumerate(req.documents):
                template = await db.docflow_templates.find_one(
                    {"id": doc.template_id, "tenant_id": current_user.tenant_id},
                    {"_id": 0, "id": 1, "name": 1}
                )
                if not template:
                    errors.append(f"Document {i+1}: Template '{doc.template_id}' not found.")

        # Validate recipients for email delivery
        needs_email = req.delivery_mode in ("email", "both")
        if needs_email:
            for i, r in enumerate(req.recipients or []):
                if not r.email or not r.email.strip():
                    role = r.role_type or r.role
                    if role != "RECEIVE_COPY":
                        errors.append(f"Recipient {i+1} ({r.name}): email is required for email delivery.")

        if errors:
            return error_response("Package validation failed.", errors)

        # Parse expiry
        parsed_expires_at = None
        if req.expires_at:
            try:
                parsed_expires_at = datetime.fromisoformat(req.expires_at.replace("Z", "+00:00"))
            except (ValueError, AttributeError):
                return error_response("Invalid expires_at format.", [f"Invalid: {req.expires_at}"])

        # Build recipient data for package service
        pkg_recipients = []
        for r in req.recipients:
            pkg_recipients.append({
                "name": r.name,
                "email": r.email or "",
                "role_type": r.role_type or r.role.upper() if r.role else "SIGN",
                "routing_order": r.routing_order,
                "assigned_components": r.assigned_components_map or {},
            })

        # Build document data
        pkg_documents = []
        for doc in req.documents:
            pkg_documents.append({
                "template_id": doc.template_id,
                "document_name": doc.document_name,
                "order": doc.order,
                "merge_fields": doc.merge_fields,
            })

        # Build routing config
        routing_config = {"mode": "sequential", "on_reject": "void"}
        if req.routing_config:
            routing_config = {
                "mode": req.routing_config.mode,
                "on_reject": req.routing_config.on_reject,
            }

        # Build security settings
        security = {"require_auth": req.require_auth, "session_timeout_minutes": 15}
        if req.security:
            security = {
                "require_auth": req.security.require_auth,
                "session_timeout_minutes": req.security.session_timeout_minutes,
            }

        # Source context
        source_ctx = None
        if req.source_context:
            source_ctx = req.source_context.model_dump()

        # Create and send package
        package = await package_service.create_and_send_package(
            name=package_name,
            documents=pkg_documents,
            recipients=pkg_recipients,
            routing_config=routing_config,
            output_mode=req.output_mode or "separate",
            security=security,
            source_context=source_ctx,
            expires_at=parsed_expires_at,
            send_email=req.send_email if needs_email else False,
            delivery_mode=req.delivery_mode,
            user_id=current_user.id,
            tenant_id=current_user.tenant_id,
            webhook_config=req.webhook_config,
        )

        # Build response
        recipient_links = []
        for pr in package.get("recipients", []):
            token = pr.get("public_token", "")
            link = f"{frontend_url}/docflow/package/{package['id']}/view/{token}" if token else ""
            recipient_links.append({
                "name": pr.get("name", ""),
                "email": pr.get("email", ""),
                "status": pr.get("status", "pending"),
                "routing_order": pr.get("routing_order", 1),
                "role_type": pr.get("role_type", "SIGN"),
                "access_link": link,
            })

        # Public link: use package-level token for public_link mode (multi-user)
        public_link_token = package.get("public_link_token", "")
        if req.delivery_mode in ("public_link", "both") and public_link_token:
            public_link = f"{frontend_url}/docflow/package/{package['id']}/public/{public_link_token}"
        elif recipient_links:
            public_link = recipient_links[0]["access_link"]
        else:
            public_link = ""

        # Fire webhook: package_created
        try:
            await webhook_service_gl.fire_package_event(
                package_id=package["id"],
                event_type="package_created",
                tenant_id=current_user.tenant_id,
                extra_data={
                    "document_count": len(package.get("documents", [])),
                    "recipient_count": len(package.get("recipients", [])),
                    "delivery_mode": req.delivery_mode,
                },
            )
        except Exception:
            pass  # Webhook failure should not block package creation

        documents_summary = []
        for d in package.get("documents", []):
            documents_summary.append({
                "document_id": d.get("document_id"),
                "template_id": d.get("template_id"),
                "document_name": d.get("document_name", ""),
                "order": d.get("order", 1),
            })

        return {
            "success": True,
            "message": "Package created and sent successfully.",
            "send_mode": "package",
            "package_id": package.get("id"),
            "document_id": None,
            "documents": documents_summary,
            "status": package.get("status", "in_progress"),
            "routing_type": routing_config.get("mode", "sequential"),
            "delivery_mode": req.delivery_mode,
            "recipient_links": recipient_links,
            "public_link": public_link,
            "errors": [],
        }

    except ValueError as e:
        logger.warning(f"[generate-links/package] Validation error: {e}")
        return error_response("Package processing failed.", [str(e)])
    except Exception as e:
        logger.exception(f"[generate-links/package] Error: {e}")
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "message": "Internal server error during package creation.",
                "package_id": None,
                "document_id": None,
                "documents": [],
                "status": None,
                "recipient_links": [],
                "public_link": None,
                "errors": [str(e)]
            }
        )
