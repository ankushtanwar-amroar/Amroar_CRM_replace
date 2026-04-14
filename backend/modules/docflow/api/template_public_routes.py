"""
DocFlow Public Template Routes

Public API to fetch active templates (latest version only) for a given tenant_id.
No authentication required — secured by tenant_id validation.
"""
import logging
from fastapi import APIRouter, HTTPException, Query

import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..')))

from shared.database import db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/docflow/public", tags=["DocFlow Public"])

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
    result = {
        "id": field.get("id", ""),
        "name": field.get("label") or field.get("name") or "",
        "type": _normalize_field_type(field.get("type", "")),
    }
    if field.get("assigned_to"):
        result["assigned_to"] = field["assigned_to"]
    return result


@router.get("/templates")
async def get_public_templates(
    tenant_id: str = Query(..., description="Tenant ID (required)"),
):
    """
    Fetch active templates (latest version only) for a given tenant.

    Returns template metadata with field placements, suitable for
    Salesforce or other external integrations.
    """
    if not tenant_id or not tenant_id.strip():
        raise HTTPException(status_code=400, detail="tenant_id is required")

    # Validate tenant exists
    tenant = await db.tenants.find_one({"id": tenant_id}, {"_id": 0, "id": 1})
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    # Query: active + latest version only
    cursor = db.docflow_templates.find(
        {
            "tenant_id": tenant_id,
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
