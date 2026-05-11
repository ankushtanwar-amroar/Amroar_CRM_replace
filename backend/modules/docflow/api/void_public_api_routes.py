"""
DocFlow Public API — Void endpoints (Phase 81.67)

Public REST endpoints for external systems to void documents and packages
via X-API-Key header authentication. Cascading state, audit logging,
recipient notifications, and reminder cancellation are delegated to
`VoidService` so behavior matches the internal UI flows exactly.
"""
import logging
import os
import sys
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..")))

from shared.database import db
from ..services.void_service import VoidService
from ..services.docflow_audit_service import DocFlowAuditService
from ..services.system_email_service import SystemEmailService
from .package_public_api_routes import verify_api_key

router = APIRouter(prefix="/public", tags=["DocFlow Public API"])
logger = logging.getLogger(__name__)


class VoidBody(BaseModel):
    reason: Optional[str] = None


def _build_void_service() -> VoidService:
    return VoidService(
        db,
        audit_service=DocFlowAuditService(db),
        system_email_service=SystemEmailService(),
    )


def _client_ip(request: Request) -> Optional[str]:
    # Honor X-Forwarded-For first (Kubernetes ingress sets this).
    fwd = request.headers.get("x-forwarded-for") or ""
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else None


@router.post("/documents/{document_id}/void")
async def public_void_document(
    document_id: str,
    body: VoidBody,
    request: Request,
    api_key: dict = Depends(verify_api_key),
):
    """Void a document via the Public API.

    Auth: X-API-Key header (or Authorization: Bearer <key>).
    Body:  { "reason": "..." }   (optional)
    """
    tenant_id = api_key.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=400, detail="API key has no tenant_id")

    void_service = _build_void_service()
    actor_label = f"api_key:{api_key.get('key_prefix') or api_key.get('id', 'unknown')}"

    try:
        result = await void_service.void_document(
            document_id=document_id,
            tenant_id=tenant_id,
            reason=body.reason,
            actor=api_key.get("created_by") or "api",
            actor_email=actor_label,
            ip_address=_client_ip(request),
            user_agent=request.headers.get("user-agent", ""),
        )
    except LookupError:
        raise HTTPException(status_code=404, detail="Document not found")

    return {"success": True, **result}


@router.post("/packages/{package_id}/void")
async def public_void_package(
    package_id: str,
    body: VoidBody,
    request: Request,
    api_key: dict = Depends(verify_api_key),
):
    """Void a package (and cascade to all child runs/documents/recipients).

    Auth: X-API-Key header (or Authorization: Bearer <key>).
    Body:  { "reason": "..." }   (optional)
    """
    tenant_id = api_key.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=400, detail="API key has no tenant_id")

    void_service = _build_void_service()
    actor_label = f"api_key:{api_key.get('key_prefix') or api_key.get('id', 'unknown')}"

    try:
        result = await void_service.void_package(
            package_id=package_id,
            tenant_id=tenant_id,
            reason=body.reason,
            actor=api_key.get("created_by") or "api",
            actor_email=actor_label,
            ip_address=_client_ip(request),
            user_agent=request.headers.get("user-agent", ""),
        )
    except LookupError:
        raise HTTPException(status_code=404, detail="Package not found")

    return {"success": True, **result}
