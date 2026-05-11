"""Phase 81.62 — Security SMS link dispatch for the Security Check flow.

When a recipient clicks "Continue to Document" in the Security Check popup,
the frontend calls `POST /api/docflow/security/send-sms-link` with the
signing link + recipient phone. This endpoint:

    • Validates phone + link.
    • Enforces a 30-second cooldown per (recipient_id | phone | link) tuple
      so rapid-click spam doesn't re-send the same SMS multiple times.
    • Uses `sms_service.send_link_sms` (Twilio) with a single retry.
    • Writes an audit log row to `docflow_sms_audit` (masked phone only).
    • ALWAYS returns 200 — the frontend gates the user flow on the `success`
      boolean, not the HTTP status.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel, Field

from modules.docflow.services import sms_service
from shared.database import db

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/docflow/security", tags=["DocFlow Security SMS"])


class SendSmsLinkRequest(BaseModel):
    # Phase 81.62 — Frontend posts token + scope so the backend resolves the
    # recipient phone itself (never exposed on the wire). If `phone` is
    # provided directly (e.g., admin testing), it takes precedence.
    token: Optional[str] = Field(None, description="Public signing token from the URL")
    scope: Optional[str] = Field("package", description="'package' | 'document' | 'package_public_link'")
    recipient_id: Optional[str] = Field(None)
    phone: Optional[str] = Field(None, description="E.164 phone; resolved from token when missing")
    link: str = Field(..., description="Signing / public link to send")
    document_type: Optional[str] = Field("document")
    document_name: Optional[str] = Field(None)


class SendSmsLinkResponse(BaseModel):
    success: bool
    stubbed: Optional[bool] = None
    cooldown: Optional[bool] = None
    masked_phone: Optional[str] = None
    message: Optional[str] = None


# 30-second cooldown window (spec).
COOLDOWN_SECONDS = 30


def _cooldown_key(req: SendSmsLinkRequest, phone: str) -> str:
    """Stable key used to dedupe repeat sends within the cooldown window."""
    rid = req.recipient_id or req.token or ""
    return f"{rid}|{phone}|{req.link}"


async def _resolve_phone_from_token(scope: str, token: str) -> tuple[Optional[str], Optional[str], Optional[str], Optional[str]]:
    """Return (phone, recipient_id, tenant_id, recipient_name) for the active
    recipient on the given token. Works for package flow
    (docflow_package_runs.recipients) and document flow
    (docflow_documents.recipients). Phase 81.81 — also resolves tenant_id +
    recipient_name so SMS templates can use {{user_name}} / {{company_name}}."""
    if not token:
        return (None, None, None, None)
    try:
        if (scope or "").startswith("pkg") or scope == "package":
            run = await db.docflow_package_runs.find_one(
                {"$or": [{"public_token": token}, {"recipients.public_token": token}]},
                {"_id": 0, "recipients": 1, "tenant_id": 1},
            )
            if not run:
                return (None, None, None, None)
            tenant_id = run.get("tenant_id")
            for r in run.get("recipients", []) or []:
                if r.get("public_token") == token:
                    return (r.get("phone"), r.get("id"), tenant_id, r.get("name"))
            return (None, None, tenant_id, None)
        # Document scope
        doc = await db.docflow_documents.find_one(
            {"recipients.public_token": token},
            {"_id": 0, "recipients": 1, "tenant_id": 1},
        )
        if not doc:
            return (None, None, None, None)
        tenant_id = doc.get("tenant_id")
        for r in doc.get("recipients", []) or []:
            if r.get("public_token") == token:
                return (r.get("phone"), r.get("id"), tenant_id, r.get("name"))
    except Exception as e:
        logger.warning(f"[SMS link] resolve_phone failed: {e}")
    return (None, None, None, None)


async def _check_cooldown(key: str) -> bool:
    """Return True if the last send was within COOLDOWN_SECONDS."""
    last = await db.docflow_sms_audit.find_one(
        {"cooldown_key": key},
        sort=[("sent_at", -1)],
        projection={"_id": 0, "sent_at": 1},
    )
    if not last:
        return False
    try:
        ts = last.get("sent_at")
        if isinstance(ts, str):
            sent_at = datetime.fromisoformat(ts.replace("Z", "+00:00"))
        else:
            sent_at = ts
        if sent_at.tzinfo is None:
            sent_at = sent_at.replace(tzinfo=timezone.utc)
        age = (datetime.now(timezone.utc) - sent_at).total_seconds()
        return age < COOLDOWN_SECONDS
    except Exception:
        return False


async def _write_audit(
    req: SendSmsLinkRequest,
    phone: str,
    key: str,
    result: dict,
) -> None:
    """Best-effort audit row — never raises."""
    try:
        await db.docflow_sms_audit.insert_one(
            {
                "cooldown_key": key,
                "recipient_id": req.recipient_id,
                "token": req.token,
                "scope": req.scope,
                "phone_masked": sms_service.mask_phone(phone),
                "document_type": req.document_type,
                "document_name": req.document_name,
                "sent_at": datetime.now(timezone.utc).isoformat(),
                "success": bool(result.get("success")),
                "stubbed": bool(result.get("stubbed")),
                "sid": result.get("sid"),
                "error": result.get("error"),
            }
        )
    except Exception as e:
        logger.warning(f"[SMS audit] soft-failed to write row: {e}")


@router.post("/send-sms-link", response_model=SendSmsLinkResponse)
async def send_sms_link(req: SendSmsLinkRequest) -> SendSmsLinkResponse:
    link = (req.link or "").strip()
    if not link:
        return SendSmsLinkResponse(success=False, message="Signing link is required.")

    # Resolve phone: explicit payload.phone > backend lookup by token.
    phone = (req.phone or "").strip()
    resolved_rid = None
    tenant_id: Optional[str] = None
    recipient_name: Optional[str] = None
    if req.token:
        phone_t, resolved_rid, tenant_id, recipient_name = await _resolve_phone_from_token(
            req.scope or "package", req.token
        )
        if not phone:
            phone = phone_t or ""
    if not phone:
        return SendSmsLinkResponse(
            success=False,
            message="Recipient phone number is missing. SMS cannot be sent.",
        )
    if resolved_rid and not req.recipient_id:
        req.recipient_id = resolved_rid

    key = _cooldown_key(req, phone)
    if await _check_cooldown(key):
        return SendSmsLinkResponse(
            success=True,
            cooldown=True,
            masked_phone=sms_service.mask_phone(phone),
            message="SMS was recently sent. Cooldown active.",
        )

    # Phase 81.81 — Render the SMS body from the tenant's default SMS template
    # (falls back to the legacy hardcoded body inside sms_service if no
    # tenant_id can be resolved or no default template is configured).
    body_override: Optional[str] = None
    if tenant_id:
        try:
            from modules.docflow.services.sms_template_service import (
                SmsTemplateService, render_sms,
            )
            svc = SmsTemplateService(db)
            tmpl = await svc.get_default(tenant_id)
            if tmpl and tmpl.get("content"):
                tenant_name = ""
                try:
                    t = await db.tenants.find_one({"id": tenant_id}, {"_id": 0, "name": 1})
                    tenant_name = (t or {}).get("name") or ""
                except Exception:
                    pass
                last4 = "".join(ch for ch in phone if ch.isdigit())[-4:]
                vars_map = {
                    "user_name": recipient_name or "",
                    "document_name": req.document_name or "",
                    "company_name": tenant_name,
                    "phone_last4": last4,
                    "link": link,
                }
                body_override = render_sms(tmpl["content"], vars_map)
        except Exception as e:
            logger.warning(f"[SMS link] template render failed: {e}")

    result = await sms_service.send_link_sms(
        to_phone=phone,
        link=link,
        document_name=req.document_name,
        document_type=req.document_type or "document",
        body_override=body_override,
    )
    await _write_audit(req, phone, key, result)

    return SendSmsLinkResponse(
        success=bool(result.get("success")),
        stubbed=bool(result.get("stubbed")),
        masked_phone=sms_service.mask_phone(phone),
        message=result.get("error"),
    )
