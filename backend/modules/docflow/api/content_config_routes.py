"""
DocFlow Content Configuration Routes — Phase 81.80

Centralised CRUD for the three consent / disclaimer surfaces shown to public
signers (consent_disclosure, review_continue, sms_disclaimer). Storage lives
in `docflow_content_config` keyed on (tenant_id, section_type). When a tenant
has no document for a section, GET returns the default copy from
`content_config_defaults.py`.

Public endpoint resolves the tenant from a public token (package run / doc).
"""
from datetime import datetime, timezone
from typing import Optional, Dict, Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..')))

from shared.database import db
from shared.models import User
from shared.auth import get_current_user
from ..services.content_config_defaults import (
    get_default, get_all_defaults, VALID_SECTION_TYPES,
)

router = APIRouter(prefix="/docflow/content-config", tags=["DocFlow Content Config"])


# ── Helpers ──

async def _get_section(tenant_id: str, section_type: str) -> Dict[str, Any]:
    if section_type not in VALID_SECTION_TYPES:
        raise HTTPException(status_code=400, detail=f"Unknown section type: {section_type}")
    doc = await db.docflow_content_config.find_one(
        {"tenant_id": tenant_id, "section_type": section_type},
        {"_id": 0},
    )
    if doc and doc.get("content"):
        return {
            "section_type": section_type,
            "content": doc["content"],
            "is_default": False,
            "updated_at": doc.get("updated_at"),
            "updated_by": doc.get("updated_by"),
        }
    # Fallback to default
    return {
        "section_type": section_type,
        "content": get_default(section_type),
        "is_default": True,
        "updated_at": None,
        "updated_by": None,
    }


async def _resolve_tenant_from_token(
    token: Optional[str],
    package_id: Optional[str],
    document_id: Optional[str],
) -> Optional[str]:
    """Public endpoint helper: derive tenant_id from a public-link context."""
    if package_id:
        run = await db.docflow_package_runs.find_one({"id": package_id}, {"_id": 0, "tenant_id": 1})
        if run:
            return run.get("tenant_id")
    if document_id:
        doc = await db.docflow_documents.find_one({"id": document_id}, {"_id": 0, "tenant_id": 1})
        if doc:
            return doc.get("tenant_id")
    if token:
        # Try package run-level public link token
        run = await db.docflow_package_runs.find_one(
            {"public_link_token": token},
            {"_id": 0, "tenant_id": 1},
        )
        if run:
            return run.get("tenant_id")
        # Phase 81.82 — Also check legacy recipient-level tokens stored on the
        # package run document. The `/docflow/package/{id}/view/{token}` URL
        # carries a recipient.public_token, NOT a run-level public_link_token,
        # so the previous lookup missed and the public consent UI fell back to
        # static defaults.
        run = await db.docflow_package_runs.find_one(
            {"recipients.public_token": token},
            {"_id": 0, "tenant_id": 1},
        )
        if run:
            return run.get("tenant_id")
        # Try document recipient public token
        doc = await db.docflow_documents.find_one(
            {"$or": [
                {"public_token": token},
                {"recipients.public_token": token},
            ]},
            {"_id": 0, "tenant_id": 1},
        )
        if doc:
            return doc.get("tenant_id")
    return None


# ── Auth: list all sections ──

@router.get("")
async def get_content_config(current_user: User = Depends(get_current_user)):
    """Return all 3 sections for the current tenant (with defaults filled in)."""
    sections = {}
    for stype in VALID_SECTION_TYPES:
        sections[stype] = await _get_section(current_user.tenant_id, stype)
    return {"tenant_id": current_user.tenant_id, "sections": sections}


# ── Auth: get one section ──

@router.get("/{section_type}")
async def get_content_section(section_type: str, current_user: User = Depends(get_current_user)):
    return await _get_section(current_user.tenant_id, section_type)


# ── Auth: update one section ──

class UpdateSectionRequest(BaseModel):
    content: Dict[str, Any]


@router.put("/{section_type}")
async def update_content_section(
    section_type: str,
    body: UpdateSectionRequest,
    current_user: User = Depends(get_current_user),
):
    if section_type not in VALID_SECTION_TYPES:
        raise HTTPException(status_code=400, detail=f"Unknown section type: {section_type}")
    if not body.content or not isinstance(body.content, dict):
        raise HTTPException(status_code=400, detail="content must be a non-empty object")
    now = datetime.now(timezone.utc)
    await db.docflow_content_config.update_one(
        {"tenant_id": current_user.tenant_id, "section_type": section_type},
        {
            "$set": {
                "tenant_id": current_user.tenant_id,
                "section_type": section_type,
                "content": body.content,
                "updated_at": now,
                "updated_by": current_user.email,
            }
        },
        upsert=True,
    )
    return await _get_section(current_user.tenant_id, section_type)


# ── Auth: reset one section to default ──

@router.post("/{section_type}/reset")
async def reset_content_section(section_type: str, current_user: User = Depends(get_current_user)):
    if section_type not in VALID_SECTION_TYPES:
        raise HTTPException(status_code=400, detail=f"Unknown section type: {section_type}")
    await db.docflow_content_config.delete_one(
        {"tenant_id": current_user.tenant_id, "section_type": section_type}
    )
    return await _get_section(current_user.tenant_id, section_type)


# ── Public read (no auth) — resolves tenant from token / package_id / document_id ──

# Use a separate router so the public endpoint sits on a stable path.
public_router = APIRouter(prefix="/docflow/public/content-config", tags=["DocFlow Content Config"])


@public_router.get("")
async def get_public_content_config(
    token: Optional[str] = Query(default=None),
    package_id: Optional[str] = Query(default=None),
    document_id: Optional[str] = Query(default=None),
):
    """Public: returns all 3 sections for the tenant referenced by the
    provided context. If no tenant can be resolved, returns the system defaults
    so the signing UI never blanks out."""
    tenant_id = await _resolve_tenant_from_token(token, package_id, document_id)
    if not tenant_id:
        return {
            "tenant_id": None,
            "is_default_only": True,
            "sections": {
                stype: {
                    "section_type": stype,
                    "content": get_default(stype),
                    "is_default": True,
                }
                for stype in VALID_SECTION_TYPES
            },
        }
    sections = {}
    for stype in VALID_SECTION_TYPES:
        sections[stype] = await _get_section(tenant_id, stype)
    return {"tenant_id": tenant_id, "is_default_only": False, "sections": sections}


# Defaults endpoint (auth — used by the editor "Reset" preview)
@router.get("/_defaults/all")
async def get_all_default_content(current_user: User = Depends(get_current_user)):
    return {"defaults": get_all_defaults()}
