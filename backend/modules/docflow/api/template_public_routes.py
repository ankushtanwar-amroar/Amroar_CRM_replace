"""
DocFlow Public Template Routes

Public API to fetch active templates for a given tenant.

Phase 81.64 — Tenant resolution priority:
  1. `X-API-Key` header (validated against `docflow_api_keys`)
  2. `Authorization: Bearer <key>` header (same store)
  3. `tenant_id` query param (backward compatibility)

If the API key is provided AND a tenant_id query param is also present, the
API-key tenant takes precedence — the query param can never override what
the key authorizes (anti-spoofing).
"""
import hashlib
import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, Header

import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..')))

from shared.database import db
from ..services.document_service import DocumentService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/docflow/public", tags=["DocFlow Public"])

document_service = DocumentService(db)


def _hash_key(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


async def _resolve_tenant_from_headers(
    authorization: Optional[str],
    x_api_key: Optional[str],
) -> Optional[str]:
    """Look up the API key in either header and return its bound tenant_id.
    Returns None when no header is provided. Raises 401 only when a key
    *was* provided but is invalid / inactive — preserves the back-compat
    fallback to the query param when neither header is present.
    """
    raw_key = None
    if authorization and authorization.lower().startswith("bearer "):
        raw_key = authorization[7:].strip()
    elif x_api_key:
        raw_key = x_api_key.strip()

    if not raw_key:
        return None

    key_hash = _hash_key(raw_key)
    key_record = await db.docflow_api_keys.find_one(
        {"key_hash": key_hash, "is_active": True},
        {"_id": 0, "tenant_id": 1},
    )
    if not key_record:
        # User explicitly tried to authenticate — reject the spoofed key
        # rather than silently downgrading to the query param.
        raise HTTPException(status_code=401, detail="Invalid or revoked API key.")
    return key_record.get("tenant_id")


# Normalize field types to standard names
FIELD_TYPE_MAP = {
    "text": "text_input",
    "signature": "signature",
    "date": "date",
    "checkbox": "checkbox",
    "radio": "radio",
    "merge": "merge_field",
    "initials": "initials",
    "text_input": "text_input",
    "merge_field": "merge_field",
}


def _normalize_field_type(raw_type: str) -> str:
    return FIELD_TYPE_MAP.get(raw_type, raw_type)


def _map_field_placement(field: dict) -> dict:
    raw_type = field.get("type", "")
    normalized = _normalize_field_type(raw_type)
    # Phase 81.65 — Public-facing label for merge fields is "merge"
    # (consistent with the package public API).
    public_type = "merge" if normalized in ("merge", "merge_field") else normalized

    result = {
        "id": field.get("id", ""),
        "name": field.get("label") or field.get("name") or "",
        "type": public_type,
        "required": bool(field.get("required", False)),
    }
    if field.get("assigned_to"):
        result["assigned_to"] = field["assigned_to"]

    # Phase 81.65 — Attach merge source so external CRM integrations can
    # map data without parsing template patterns.
    if public_type == "merge":
        merge_object = field.get("merge_object") or field.get("mergeObject") or ""
        merge_field_name = field.get("merge_field") or field.get("mergeField") or ""
        if not merge_object or not merge_field_name:
            pattern = (
                field.get("mergePattern")
                or field.get("merge_pattern")
                or field.get("merge_token")
                or field.get("mergeToken")
                or ""
            )
            cleaned = str(pattern or "").strip().strip("{}").strip()
            if cleaned and "." in cleaned:
                obj_part, _, fld_part = cleaned.partition(".")
                merge_object = merge_object or obj_part
                merge_field_name = merge_field_name or fld_part
        if merge_object or merge_field_name:
            result["merge_source"] = {
                "object": merge_object or None,
                "field_name": merge_field_name or None,
            }

    return result


@router.get("/templates")
async def get_public_templates(
    tenant_id: Optional[str] = Query(None, description="Tenant ID (optional when X-API-Key/Bearer header is provided)"),
    authorization: Optional[str] = Header(None),
    x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
):
    """
    Fetch active templates (latest version only) for a given tenant.

    Phase 81.64 — Tenant resolution:
      • Prefer `X-API-Key` / `Authorization: Bearer <key>` header (auto-resolves tenant).
      • Falls back to `?tenant_id=<id>` query param when no header is provided.
      • API-key tenant always wins to prevent query-param spoofing.

    Returns template metadata with field placements, suitable for
    Salesforce or other external integrations.
    """
    header_tenant = await _resolve_tenant_from_headers(authorization, x_api_key)

    # Header-bound tenant takes precedence over query param.
    resolved_tenant_id = header_tenant or (tenant_id.strip() if tenant_id else None)

    if not resolved_tenant_id:
        raise HTTPException(
            status_code=400,
            detail=(
                "tenant_id is required. Provide via X-API-Key header, "
                "Authorization: Bearer <key>, or ?tenant_id=<id> query param."
            ),
        )

    # Validate tenant exists
    tenant = await db.tenants.find_one({"id": resolved_tenant_id}, {"_id": 0, "id": 1})
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    # Query: active + latest version only
    cursor = db.docflow_templates.find(
        {
            "tenant_id": resolved_tenant_id,
            "status": "active",
            "is_latest": True,
        },
        {
            "_id": 0,
            "id": 1,
            "name": 1,
            "version": 1,
            "template_group_id": 1,
            "status": 1,
            "created_at": 1,
            "updated_at": 1,
            "field_placements": 1,
        },
    )
    templates = await cursor.to_list(length=500)

    data = []
    for t in templates:
        version = t.get("version", 1)
        base_name = t.get("name", "Untitled")
        field_placements = t.get("field_placements") or []

        data.append({
            "template_id": t["id"],
            "template_name": f"{base_name} (v{version})",
            "version": version,
            "template_group_id": t.get("template_group_id", t["id"]),
            "status": t.get("status", "active"),
            "created_at": t.get("created_at"),
            "updated_at": t.get("updated_at"),
            "field_placements": [_map_field_placement(f) for f in field_placements],
        })

    return {"success": True, "data": data}


@router.get("/documents")
async def list_public_documents(
    tenant_id: Optional[str] = Query(None, description="Tenant ID (optional when X-API-Key/Bearer header is provided)"),
    authorization: Optional[str] = Header(None),
    x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
    template_id: Optional[str] = Query(None, description="Filter by template ID."),
    status: Optional[str] = Query(None, description="Filter by document status."),
    search: Optional[str] = Query(None, description="Search by document id, template name, CRM type, or recipient name/email."),
    page: int = Query(1, ge=1, description="Page number."),
    limit: int = Query(50, ge=1, le=200, description="Page size."),
    sort_order: str = Query("newest", description="Sort order: newest or oldest."),
):
    """
    List documents for a tenant.

    Phase 81.64 — Tenant resolution:
      • Prefer `X-API-Key` / `Authorization: Bearer <key>` header (auto-resolves tenant).
      • Falls back to `?tenant_id=<id>` query param when no header is provided.
      • API-key tenant always wins to prevent query-param spoofing.

    Returns paginated document summaries. The tenant is derived from the
    authenticated API key and cannot be spoofed by the query param.
    """
    header_tenant = await _resolve_tenant_from_headers(authorization, x_api_key)
    resolved_tenant_id = header_tenant or (tenant_id.strip() if tenant_id else None)

    if not resolved_tenant_id:
        raise HTTPException(
            status_code=400,
            detail=(
                "tenant_id is required. Provide via X-API-Key header, "
                "Authorization: Bearer <key>, or ?tenant_id=<id> query param."
            ),
        )

    tenant = await db.tenants.find_one({"id": resolved_tenant_id}, {"_id": 0, "id": 1})
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    result = await document_service.list_documents(
        resolved_tenant_id,
        template_id=template_id,
        status=status,
        search=search,
        page=page,
        limit=limit,
        sort_order=sort_order,
    )

    return {
        "success": True,
        "tenant_id": resolved_tenant_id,
        "documents": result["documents"],
        "total": result["total"],
        "page": result["page"],
        "limit": result["limit"],
        "pages": result["pages"],
    }
