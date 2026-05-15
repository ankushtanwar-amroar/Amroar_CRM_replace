"""
DocFlow Package Public Routes — Phase 2 + Phase 4

Public endpoints for package recipients (no auth required):
- View package by recipient token
- Mark package as reviewed (VIEW_ONLY recipients)
- Approve / Reject (APPROVE_REJECT recipients)
- OTP verification with session management (Phase 4)
"""
import io
import base64
import logging
import secrets
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, HTTPException, Request, Header
from pydantic import BaseModel
from typing import Optional, Dict, List, Any

import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..')))

from shared.database import db
from ..services.package_service import PackageService
from ..services.docflow_audit_service import DocFlowAuditService
from ..services.routing_engine import RoutingEngine
from ..services.session_service import SessionService
from ..services.webhook_service import WebhookService
from ..utils.request_utils import build_request_metadata, get_client_ip

router = APIRouter(prefix="/docflow/packages/public", tags=["DocFlow Package Public"])

audit_service = DocFlowAuditService(db)
webhook_service = WebhookService(db)
routing_engine = RoutingEngine(db, audit_service=audit_service, webhook_service=webhook_service)
session_service = SessionService(db)

logger = logging.getLogger(__name__)


# ──────────────────────────────────────────────────────────────────────────
# Phase 81 — SMS verification endpoints for PACKAGE recipients (public, token-scoped)
# Mirrors the template-flow endpoints but operates on docflow_packages /
# docflow_package_runs collections.
# ──────────────────────────────────────────────────────────────────────────


class _PkgSmsVerifyRequest(BaseModel):
    code: str


async def _find_pkg_run_by_token(token: str):
    """Look up a package run + active recipient by recipient public_token.
    Searches both `docflow_package_runs` and the duplicated `docflow_packages`
    collection (where runs are stored with `_type='run'`)."""
    run = await db.docflow_package_runs.find_one(
        {"recipients.public_token": token}, {"_id": 0}
    )
    if not run:
        run = await db.docflow_packages.find_one(
            {"recipients.public_token": token, "_type": "run"}, {"_id": 0}
        )
    if not run:
        return None, None
    rec = next(
        (r for r in (run.get("recipients") or []) if r.get("public_token") == token),
        None,
    )
    return run, rec


@router.post("/{token}/sms/send-otp")
async def package_sms_send_otp(token: str):
    """Generate + send a 6-digit OTP for a package recipient. Idempotent
    inside a 60-second window. Returns `stubbed: true` if Twilio not configured."""
    from ..services.sms_service import generate_otp, send_otp_sms

    run, recipient = await _find_pkg_run_by_token(token)
    if not run:
        raise HTTPException(status_code=404, detail="Invalid signing link")
    if not run.get("sms_mode"):
        raise HTTPException(status_code=400, detail="SMS verification is not enabled for this package")
    if not recipient:
        raise HTTPException(status_code=404, detail="Recipient not found")

    phone = recipient.get("phone")
    if not phone:
        raise HTTPException(status_code=400, detail="Recipient has no phone number on file")

    now = datetime.now(timezone.utc)
    existing = recipient.get("sms_otp")
    existing_at_raw = recipient.get("sms_otp_issued_at")
    existing_at = None
    if existing_at_raw:
        try:
            existing_at = datetime.fromisoformat(str(existing_at_raw).replace("Z", "+00:00"))
        except Exception:
            existing_at = None

    if existing and existing_at and (now - existing_at).total_seconds() < 60:
        otp = existing
    else:
        otp = generate_otp(6)
        update_payload = {
            "$set": {
                "recipients.$.sms_otp": otp,
                "recipients.$.sms_otp_issued_at": now.isoformat(),
                "recipients.$.sms_otp_attempts": 0,
            }
        }
        # Write to BOTH copies of the run (package_runs + packages duplicate).
        await db.docflow_package_runs.update_one(
            {"id": run["id"], "recipients.public_token": token}, update_payload
        )
        await db.docflow_packages.update_one(
            {"id": run["id"], "recipients.public_token": token, "_type": "run"}, update_payload
        )

    result = await send_otp_sms(phone, otp, document_name=run.get("name"))
    return {
        "success": result.get("success", False),
        "stubbed": bool(result.get("stubbed")),
        "expires_in_seconds": 600,
    }


@router.post("/{token}/sms/verify-otp")
async def package_sms_verify_otp(token: str, body: _PkgSmsVerifyRequest):
    """Verify the OTP and mark the package recipient as sms_verified=true."""
    run, recipient = await _find_pkg_run_by_token(token)
    if not run:
        raise HTTPException(status_code=404, detail="Invalid signing link")
    if not run.get("sms_mode"):
        raise HTTPException(status_code=400, detail="SMS verification is not enabled for this package")
    if not recipient:
        raise HTTPException(status_code=404, detail="Recipient not found")
    if recipient.get("sms_verified"):
        return {"success": True, "already_verified": True}

    issued_raw = recipient.get("sms_otp_issued_at")
    issued_at = None
    if issued_raw:
        try:
            issued_at = datetime.fromisoformat(str(issued_raw).replace("Z", "+00:00"))
        except Exception:
            issued_at = None
    if not recipient.get("sms_otp") or not issued_at:
        raise HTTPException(status_code=400, detail="No active code. Request a new one.")
    if (datetime.now(timezone.utc) - issued_at).total_seconds() > 600:
        raise HTTPException(status_code=400, detail="Code has expired. Request a new one.")

    attempts = int(recipient.get("sms_otp_attempts") or 0)
    if attempts >= 5:
        raise HTTPException(status_code=429, detail="Too many attempts. Request a new code.")

    submitted = (body.code or "").strip()
    if submitted != recipient.get("sms_otp"):
        bump = {"$inc": {"recipients.$.sms_otp_attempts": 1}}
        await db.docflow_package_runs.update_one(
            {"id": run["id"], "recipients.public_token": token}, bump
        )
        await db.docflow_packages.update_one(
            {"id": run["id"], "recipients.public_token": token, "_type": "run"}, bump
        )
        raise HTTPException(status_code=400, detail="Incorrect code")

    now_iso = datetime.now(timezone.utc).isoformat()
    success_payload = {
        "$set": {
            "recipients.$.sms_verified": True,
            "recipients.$.sms_verified_at": now_iso,
            "recipients.$.sms_otp": None,
            "recipients.$.sms_otp_issued_at": None,
            "recipients.$.sms_otp_attempts": 0,
        }
    }
    await db.docflow_package_runs.update_one(
        {"id": run["id"], "recipients.public_token": token}, success_payload
    )
    await db.docflow_packages.update_one(
        {"id": run["id"], "recipients.public_token": token, "_type": "run"}, success_payload
    )
    # Also propagate to the child docflow_documents recipients so the
    # template-flow signing endpoint (which checks document.sms_mode +
    # recipient.sms_verified) accepts the signature.
    try:
        for pkg_doc in run.get("documents", []):
            doc_id = pkg_doc.get("document_id")
            if not doc_id:
                continue
            child = await db.docflow_documents.find_one(
                {"id": doc_id},
                {"_id": 0, "recipients": 1},
            )
            if not child:
                continue
            for cr in child.get("recipients") or []:
                if (cr.get("email") or "").lower() == (recipient.get("email") or "").lower():
                    await db.docflow_documents.update_one(
                        {"id": doc_id, "recipients.id": cr["id"]},
                        {
                            "$set": {
                                "recipients.$.sms_verified": True,
                                "recipients.$.sms_verified_at": now_iso,
                            }
                        },
                    )
                    break
    except Exception as _propagate_err:
        logger.warning(f"Package→child SMS verified propagation failed: {_propagate_err}")

    return {"success": True, "verified_at": now_iso}


@router.get("/{token}/status")
async def get_package_status(token: str):
    """Lightweight endpoint for real-time status polling."""
    package = await db.docflow_packages.find_one(
        {"recipients.public_token": token},
        {"_id": 0, "status": 1, "void_reason": 1}
    )
    if not package:
        # Check package_runs too
        package = await db.docflow_package_runs.find_one(
            {"recipients.public_token": token},
            {"_id": 0, "status": 1, "void_reason": 1}
        )
    if not package:
        return {"status": "not_found"}
    return {"status": package.get("status", "unknown"), "void_reason": package.get("void_reason")}


async def _find_package_by_recipient_token(token: str):
    """Find package and active recipient by the recipient's public_token."""
    package = await db.docflow_packages.find_one(
        {"recipients.public_token": token},
        {"_id": 0},
    )
    if not package:
        return None, None

    active_recipient = None
    for r in package.get("recipients", []):
        if r.get("public_token") == token:
            active_recipient = r
            break

    return package, active_recipient


def _assert_recipient_not_voided(active_recipient: dict):
    """Phase 81.43 — central guard. Raises 410 when the active recipient has
    been voided by the sender. Called from every public write endpoint
    (sign/approve/review/decline/mark-*) to prevent voided recipients from
    performing any action. The package-wide void is handled separately."""
    if not active_recipient:
        return
    if active_recipient.get("voided") is True or active_recipient.get("status") == "voided":
        raise HTTPException(
            status_code=410,
            detail="Your access to this package has been voided by the sender. Please contact the sender if you believe this is a mistake.",
        )


async def _validate_session_for_request(
    token: str,
    x_session_token: Optional[str] = None,
) -> Optional[dict]:
    """
    Validate session for a request. Returns session data if valid.
    If package doesn't require auth, returns a stub session.
    """
    package, recipient = await _find_package_by_recipient_token(token)
    if not package or not recipient:
        return None

    require_auth = package.get("security_settings", {}).get("require_auth", True)
    if not require_auth:
        # No auth required — return a stub
        return {"package_id": package["id"], "recipient_id": recipient["id"], "recipient_email": recipient.get("email", ""), "no_auth": True}

    if not x_session_token:
        return None

    session = await session_service.validate_session(x_session_token)
    if not session:
        return None

    # Ensure session belongs to this recipient+package
    if session["package_id"] != package["id"] or session["recipient_id"] != recipient["id"]:
        return None

    return session


# ── OTP & Session Endpoints ──

class SendOtpRequest(BaseModel):
    name: str
    email: str

class VerifyOtpRequest(BaseModel):
    email: str
    otp_code: str

class VoidFromPublicRequest(BaseModel):
    reason: str


@router.post("/{token}/send-otp")
async def send_package_otp(token: str, req: SendOtpRequest):
    """
    Generate and send OTP to the recipient for package access verification.
    """
    package, recipient = await _find_package_by_recipient_token(token)
    if not package or not recipient:
        raise HTTPException(status_code=404, detail="Package not found or link expired")

    if package.get("status") in ("voided", "expired"):
        raise HTTPException(status_code=410, detail=f"Package is {package['status']}")

    # Generate 6-digit OTP
    otp_code = "".join([str(secrets.randbelow(10)) for _ in range(6)])
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=10)

    # Clean up old OTPs for this recipient
    await db.docflow_package_otps.delete_many({
        "package_id": package["id"],
        "recipient_id": recipient["id"],
        "verified": False,
    })

    # Store OTP
    await db.docflow_package_otps.insert_one({
        "package_id": package["id"],
        "recipient_id": recipient["id"],
        "recipient_token": token,
        "email": req.email.lower().strip(),
        "name": req.name.strip(),
        "otp_code": otp_code,
        "expires_at": expires_at.isoformat(),
        "verified": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })

    # Send OTP via email service
    try:
        from ..services.email_notification_service import EmailNotificationService
        email_svc = EmailNotificationService(db)
        await email_svc.send_otp_email(
            recipient_email=req.email.lower().strip(),
            recipient_name=req.name.strip(),
            otp_code=otp_code,
            package_name=package.get("name", "Document Package"),
        )
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"[OTP] Failed to send OTP email to {req.email}: {e}")

    return {"success": True, "message": "Verification code sent to your email"}


@router.post("/{token}/verify-otp")
async def verify_package_otp(token: str, req: VerifyOtpRequest):
    """
    Verify OTP and create a session for the recipient.
    Returns session_token on success.
    """
    package, recipient = await _find_package_by_recipient_token(token)
    if not package or not recipient:
        raise HTTPException(status_code=404, detail="Package not found or link expired")

    now = datetime.now(timezone.utc)

    otp_record = await db.docflow_package_otps.find_one({
        "package_id": package["id"],
        "recipient_id": recipient["id"],
        "email": req.email.lower().strip(),
        "otp_code": req.otp_code.strip(),
        "verified": False,
    })

    if not otp_record:
        raise HTTPException(status_code=401, detail="Invalid verification code")

    # Check expiration
    expires_at = datetime.fromisoformat(otp_record["expires_at"])
    if now > expires_at:
        raise HTTPException(status_code=401, detail="Verification code has expired")

    # Mark OTP as verified
    await db.docflow_package_otps.update_one(
        {"_id": otp_record["_id"]},
        {"$set": {"verified": True, "verified_at": now.isoformat()}},
    )

    # Get session timeout from package security settings
    timeout = package.get("security_settings", {}).get("session_timeout_minutes", 15)

    # Create session
    session_token = await session_service.create_session(
        package_id=package["id"],
        recipient_id=recipient["id"],
        recipient_email=req.email.lower().strip(),
        timeout_minutes=timeout,
    )

    return {
        "success": True,
        "session_token": session_token,
        "expires_in_minutes": timeout,
        "message": "Verified successfully",
    }


@router.post("/{token}/session/validate")
async def validate_session(
    token: str,
    x_session_token: Optional[str] = Header(None),
):
    """Check if the current session is still valid."""
    session = await _validate_session_for_request(token, x_session_token)
    if not session:
        raise HTTPException(status_code=401, detail="Session expired or invalid")
    return {"valid": True, "expires_at": session.get("expires_at")}


@router.post("/{token}/session/logout")
async def logout_session(
    token: str,
    x_session_token: Optional[str] = Header(None),
):
    """Invalidate the current session."""
    if x_session_token:
        await session_service.invalidate_session(x_session_token)
    return {"success": True, "message": "Session ended"}


@router.get("/{token}")
async def get_package_public(
    token: str,
    x_session_token: Optional[str] = Header(None),
):
    """
    Get package info by recipient's public token.
    Returns package metadata, documents list, and the active recipient's info.
    If require_auth=true and no valid session, returns limited info with session_required flag.
    """
    package, active_recipient = await _find_package_by_recipient_token(token)

    if not package:
        raise HTTPException(status_code=404, detail="Package not found or link expired")

    if not active_recipient:
        raise HTTPException(status_code=404, detail="Recipient not found")

    # Check package is accessible
    if package.get("status") == "voided":
        # Phase 81.67 — structured detail for void; viewer renders banner.
        raise HTTPException(
            status_code=410,
            detail={
                "code": "package_voided",
                "message": "This package has been voided by the sender.",
                "voided_at": package.get("voided_at"),
                "void_reason": package.get("void_reason") or "",
                "package_name": package.get("name") or "",
            },
        )
    if package.get("status") == "expired":
        raise HTTPException(status_code=410, detail="This package has expired")

    # Phase 81.43 — Per-recipient void guard. If the sender voided THIS
    # recipient (even though the package is still in progress), block their
    # signing link entirely so they can't open the package, sign, approve,
    # review or decline. Other active recipients continue normally.
    if active_recipient.get("voided") is True or active_recipient.get("status") == "voided":
        raise HTTPException(
            status_code=410,
            detail="Your access to this package has been voided by the sender. Please contact the sender if you believe this is a mistake.",
        )

    require_auth = package.get("security_settings", {}).get("require_auth", True)
    has_valid_session = False

    if require_auth:
        session = await _validate_session_for_request(token, x_session_token)
        if session and not session.get("no_auth"):
            has_valid_session = True
        else:
            # Return limited info — prompt for OTP verification
            return {
                "package_id": package["id"],
                "package_name": package.get("name", ""),
                "package_status": package.get("status", "draft"),
                "session_required": True,
                "active_recipient": {
                    "id": active_recipient.get("id"),
                    "name": active_recipient.get("name", ""),
                    "email": active_recipient.get("email", ""),
                    "role_type": active_recipient.get("role_type", "SIGN"),
                    "status": active_recipient.get("status", "pending"),
                    "action_taken": active_recipient.get("action_taken"),
                },
                "security_settings": {
                    "require_auth": True,
                    "session_timeout_minutes": package.get("security_settings", {}).get("session_timeout_minutes", 15),
                },
            }
    else:
        has_valid_session = True

    # Full response with documents — session is valid
    documents = []
    for doc in package.get("documents", []):
        doc_id = doc.get("document_id")
        doc_detail = None
        if doc_id:
            doc_detail = await db.docflow_documents.find_one(
                {"id": doc_id}, {"_id": 0, "id": 1, "status": 1, "unsigned_pdf_url": 1, "signed_file_url": 1, "signed_s3_key": 1, "field_data": 1, "merge_field_values": 1}
            )
        documents.append({
            "document_id": doc_id,
            "template_id": doc.get("template_id"),
            "document_name": doc.get("document_name", ""),
            "order": doc.get("order", 1),
            "status": doc_detail.get("status", "generated") if doc_detail else "generated",
            "has_pdf": bool(doc_detail.get("unsigned_pdf_url") or doc_detail.get("signed_file_url")) if doc_detail else False,
            "signed_file_url": doc_detail.get("signed_file_url") if doc_detail else None,
            "has_signed_version": bool(doc_detail.get("signed_file_url") or doc_detail.get("signed_s3_key")) if doc_detail else False,
            "merge_field_values": doc_detail.get("merge_field_values", {}) if doc_detail else {},
            "field_data": doc_detail.get("field_data", {}) if doc_detail else {},
            "field_placements": doc.get("field_placements", []),
        })

    # Fire "opened" webhook when recipient views the package
    try:
        await webhook_service.fire_package_event(
            package_id=package["id"],
            event_type="opened",
            tenant_id=package.get("tenant_id", ""),
            extra_data={
                "recipient_name": active_recipient.get("name", ""),
                "recipient_email": active_recipient.get("email", ""),
            },
        )
    except Exception as e:
        logger.warning(f"Webhook fire_package_event (opened) failed: {e}")

    # Phase 74 + API sender override: Resolve sender info for the public signing-view header.
    # Priority 1: sender_name/sender_email on the package/run (set by API custom sender or API key owner auto-resolution).
    # Priority 2: created_by user record (portal UI senders).
    sender_info = None
    try:
        pkg_sender_name = package.get("sender_name")
        pkg_sender_email = package.get("sender_email")
        if pkg_sender_name or pkg_sender_email:
            sender_info = {"name": pkg_sender_name or "", "email": pkg_sender_email or ""}
        else:
            sender_user_id = package.get("created_by")
            if sender_user_id:
                user = await db.users.find_one(
                    {"id": sender_user_id},
                    {"_id": 0, "email": 1, "first_name": 1, "last_name": 1, "name": 1, "full_name": 1},
                )
                if not user:
                    # created_by may be an API key ID — resolve through the key owner.
                    key_rec = await db.docflow_api_keys.find_one({"id": sender_user_id}, {"_id": 0, "created_by": 1})
                    if key_rec and key_rec.get("created_by"):
                        user = await db.users.find_one(
                            {"id": key_rec["created_by"]},
                            {"_id": 0, "email": 1, "first_name": 1, "last_name": 1, "name": 1, "full_name": 1},
                        )
                if user:
                    name = (
                        user.get("full_name")
                        or user.get("name")
                        or " ".join(filter(None, [user.get("first_name"), user.get("last_name")])).strip()
                        or (user.get("email") or "").split("@")[0]
                    )
                    email = user.get("email") or ""
                    if name or email:
                        sender_info = {"name": name, "email": email}
    except Exception as e:
        logger.warning(f"Sender resolution failed for package {package.get('id')}: {e}")

    # Determine if all SIGN recipients in earlier waves have completed
    recipients = package.get("recipients", [])
    sign_recipients = [r for r in recipients if r.get("role_type") == "SIGN"]
    all_signing_complete = all(r.get("status") == "completed" for r in sign_recipients) if sign_recipients else False

    # Phase 81 — surface SMS state to the package signing UI.
    # sms_required is driven by sms_consent (popup visibility), not sms_mode.
    # Phase 81.4 — only flag `sms_required=true` when the active recipient
    # still has a pending action (signer or approver). Viewers, completed
    # signers, decided approvers, voided/declined/expired recipients, and
    # terminal package runs never trigger the disclaimer popup.
    sms_required = False
    sms_verified = False
    recipient_phone_masked = ""
    if package.get("sms_consent"):
        try:
            from ..services.sms_service import mask_phone
            ar_role = str(active_recipient.get("role_type") or active_recipient.get("role") or "SIGN").upper()
            ar_status = str(active_recipient.get("status") or "").lower()
            pkg_status = str(package.get("status") or "").lower()
            actionable_role = ar_role in {"SIGN", "SIGNER", "APPROVE_REJECT", "APPROVER"}
            terminal_recipient = ar_status in {"signed", "completed", "approved", "rejected", "declined", "voided", "expired", "skipped"}
            terminal_pkg = pkg_status in {"completed", "signed", "voided", "expired", "declined", "cancelled"}
            should_show = (
                actionable_role
                and not terminal_recipient
                and not terminal_pkg
                and not all_signing_complete
                and not active_recipient.get("voided")
            )
            if should_show:
                sms_required = True
                sms_verified = bool(active_recipient.get("sms_verified"))
                recipient_phone_masked = mask_phone(active_recipient.get("phone"))
        except Exception as _sms_err:
            logger.warning(f"Package SMS state resolution failed: {_sms_err}")

    return {
        "package_id": package["id"],
        "package_name": package.get("name", ""),
        "package_status": package.get("status", "draft"),
        "session_required": False,
        "session_active": has_valid_session,
        "total_documents": len(documents),
        "documents": documents,
        "all_signing_complete": all_signing_complete,
        "delivery_mode": package.get("delivery_mode", "email"),
        "sender": sender_info,
        "sms_required": sms_required,
        "sms_mode": bool(package.get("sms_mode", False)),
        "sms_verified": sms_verified,
        "recipient_phone_masked": recipient_phone_masked,
        "active_recipient": {
            "id": active_recipient.get("id"),
            "name": active_recipient.get("name", ""),
            "email": active_recipient.get("email", ""),
            "role_type": active_recipient.get("role_type", "SIGN"),
            "status": active_recipient.get("status", "pending"),
            "action_taken": active_recipient.get("action_taken"),
            "routing_order": active_recipient.get("routing_order", 1),
            "assigned_components": active_recipient.get("assigned_components", {}),
        },
        "security_settings": {
            "require_auth": require_auth,
            "session_timeout_minutes": package.get("security_settings", {}).get("session_timeout_minutes", 15),
        },
    }


class MarkReviewedRequest(BaseModel):
    reviewer_name: Optional[str] = None
    reviewer_email: Optional[str] = None


class MarkSignedRequest(BaseModel):
    signer_name: Optional[str] = None
    signer_email: Optional[str] = None


@router.post("/{token}/mark-signed")
async def mark_signed(
    token: str,
    req: MarkSignedRequest,
    request: Request,
    x_session_token: Optional[str] = Header(None),
):
    """
    Mark a SIGN recipient as signed at the package level.
    Validates session (if require_auth), role and status before completing the action.
    Calls routing_engine.on_recipient_action to advance waves and complete package.
    """
    package, active_recipient = await _find_package_by_recipient_token(token)

    if not package:
        raise HTTPException(status_code=404, detail="Package not found or link expired")
    if not active_recipient:
        raise HTTPException(status_code=404, detail="Recipient not found")

    # Phase 81.43 — block voided recipient from performing any action.
    _assert_recipient_not_voided(active_recipient)

    # Session validation
    require_auth = package.get("security_settings", {}).get("require_auth", True)
    if require_auth:
        session = await _validate_session_for_request(token, x_session_token)
        if not session:
            raise HTTPException(status_code=401, detail="Session expired. Please verify again.")

    # Validate package status
    if package.get("status") != "in_progress":
        raise HTTPException(
            status_code=400,
            detail=f"Package is '{package.get('status')}', cannot sign"
        )

    # Validate recipient role
    if active_recipient.get("role_type") != "SIGN":
        raise HTTPException(
            status_code=400,
            detail=f"Recipient role is '{active_recipient.get('role_type')}', not SIGN"
        )

    # Validate recipient status (must be an active pre-signing state).
    # Phase 81.45 — broadened from {notified, in_progress} to include
    # pending/sent/viewed. Email-delivered recipients often stay in
    # `pending` until they click their link, and some delivery backends
    # never flip to `notified`; the old guard rejected legitimate sign
    # attempts with "Recipient already 'pending'". Terminal / voided
    # statuses (signed/completed/approved/rejected/reviewed/declined/voided)
    # remain blocked correctly since they're not in this whitelist.
    if active_recipient.get("status") not in ("pending", "sent", "notified", "viewed", "in_progress"):
        raise HTTPException(
            status_code=400,
            detail=f"Recipient already '{active_recipient.get('status')}'"
        )

    # Complete the recipient action via routing engine
    actor = active_recipient.get("email") or active_recipient.get("name") or "anonymous"
    success = await routing_engine.on_recipient_action(
        package_id=package["id"],
        recipient_id=active_recipient["id"],
        action="signed",
        actor=actor,
        metadata={
            "role_type": "SIGN",
            **build_request_metadata(request),
            "signer_name": req.signer_name or active_recipient.get("name"),
            "signer_email": req.signer_email or active_recipient.get("email"),
        },
    )

    if not success:
        raise HTTPException(status_code=400, detail="Failed to update recipient status")

    return {
        "success": True,
        "message": "Package signed successfully",
        "recipient_id": active_recipient["id"],
        "action": "signed",
    }


class SignWithFieldsRequest(BaseModel):
    signer_name: Optional[str] = None
    signer_email: Optional[str] = None
    documents_field_data: Dict[str, Dict[str, Any]] = {}  # { doc_id: { field_id: value } }


@router.post("/{token}/sign-with-fields")
async def sign_with_fields(
    token: str,
    req: SignWithFieldsRequest,
    request: Request,
    x_session_token: Optional[str] = Header(None),
):
    """
    Sign all documents in a package with field data.
    Embeds field values (signatures, text, dates, etc.) into each document's PDF,
    uploads the signed versions, and advances the routing engine.
    """
    package, active_recipient = await _find_package_by_recipient_token(token)

    if not package:
        raise HTTPException(status_code=404, detail="Package not found or link expired")
    if not active_recipient:
        raise HTTPException(status_code=404, detail="Recipient not found")

    # Phase 81.43 — block voided recipient from performing any action.
    _assert_recipient_not_voided(active_recipient)

    # Session validation
    require_auth = package.get("security_settings", {}).get("require_auth", True)
    if require_auth:
        session = await _validate_session_for_request(token, x_session_token)
        if not session:
            raise HTTPException(status_code=401, detail="Session expired. Please verify again.")

    # Validate package status
    if package.get("status") != "in_progress":
        raise HTTPException(status_code=400, detail=f"Package is '{package.get('status')}', cannot sign")

    # Validate recipient role
    if active_recipient.get("role_type") != "SIGN":
        raise HTTPException(status_code=400, detail=f"Recipient role is '{active_recipient.get('role_type')}', not SIGN")

    # Validate recipient status — Phase 81.45 broadened whitelist.
    if active_recipient.get("status") not in ("pending", "sent", "notified", "viewed", "in_progress"):
        raise HTTPException(status_code=400, detail=f"Recipient already '{active_recipient.get('status')}'")

    # Phase 81.7 — SMS verification block removed. Disclaimer popup is the
    # only SMS-related UX gate; signing endpoints no longer enforce OTP
    # verification at the API layer.

    signer_name = req.signer_name or active_recipient.get("name", "")
    signer_email = req.signer_email or active_recipient.get("email", "")
    recipient_id = active_recipient["id"]
    assigned_components = active_recipient.get("assigned_components", {})
    now = datetime.now(timezone.utc)

    # Process each document in the package
    signed_doc_count = 0
    for pkg_doc in package.get("documents", []):
        doc_id = pkg_doc.get("document_id")
        template_id = pkg_doc.get("template_id")
        if not doc_id:
            continue

        field_data_for_doc = req.documents_field_data.get(doc_id, {})
        if not field_data_for_doc and not template_id:
            continue

        try:
            # Load document
            document = await db.docflow_documents.find_one({"id": doc_id}, {"_id": 0})
            if not document:
                continue

            # ─── Phase 64: Strict recipient ownership (package flow) ───
            # Drop any submitted field values for fields assigned to OTHER
            # recipients (whose ownership must be preserved regardless of a
            # malformed/malicious client payload). We still accept writes for
            # fields that are either (a) owned by the active recipient,
            # (b) fully unassigned, or (c) already-signed (read-only pass-through
            # via existing field_data).
            try:
                # Look up field placements for ownership validation.
                # Prefer package-level overrides stored on the run document;
                # fall back to the master template only when none exist.
                _pkg_fps = pkg_doc.get("field_placements", [])
                if _pkg_fps:
                    _placements = _pkg_fps
                else:
                    _tpl_preview = await db.docflow_templates.find_one(
                        {"id": template_id},
                        {"_id": 0, "field_placements": 1}
                    )
                    _placements = (_tpl_preview or {}).get("field_placements", []) or []
                _placements_by_id = {p.get("id"): p for p in _placements if p.get("id")}
                active_tpl_rid = active_recipient.get("template_recipient_id")
                all_recipients_on_pkg = package.get("recipients", []) or []
                signed_tpl_rids = {
                    r.get("template_recipient_id")
                    for r in all_recipients_on_pkg
                    if r.get("status") in ("signed", "completed") and r.get("template_recipient_id")
                }
                # Phase 81.30 — Per-recipient `assigned_components` (set at
                # send time) is the authoritative ownership signal. Build a
                # field_id → tpl_rid map for THIS template/document so we can
                # block cross-recipient writes even when the template-level
                # `assigned_to` is empty (the common case for checkbox/radio).
                active_assigned_set = set(
                    (active_recipient.get("assigned_components") or {}).get(template_id, [])
                )
                ownership_by_field_id = {}
                for r in all_recipients_on_pkg:
                    tpl_rid = r.get("template_recipient_id")
                    fids = (r.get("assigned_components") or {}).get(template_id, [])
                    for fid in (fids or []):
                        if fid and tpl_rid:
                            ownership_by_field_id.setdefault(fid, tpl_rid)
                existing_fd_preview = document.get("field_data", {}) or {}
                filtered = {}
                for fid, val in (field_data_for_doc or {}).items():
                    p = _placements_by_id.get(fid)
                    if not p:
                        filtered[fid] = val  # unknown placement — pass through
                        continue
                    assigned_to = p.get("assigned_to") or p.get("recipient_id")
                    runtime_owner = ownership_by_field_id.get(fid)
                    effective_owner = assigned_to or runtime_owner
                    if not effective_owner:
                        filtered[fid] = val
                        continue
                    if effective_owner == active_tpl_rid or fid in active_assigned_set:
                        filtered[fid] = val
                    elif effective_owner in signed_tpl_rids and fid in existing_fd_preview:
                        filtered[fid] = existing_fd_preview[fid]  # preserve signed owner
                    else:
                        logger.warning(
                            f"Package sign: rejected cross-recipient write "
                            f"doc={doc_id} field={fid} owner={effective_owner} "
                            f"active={active_tpl_rid}"
                        )
                field_data_for_doc = filtered
            except Exception as _ownership_err:
                logger.warning(f"Ownership filter soft-failed: {_ownership_err}")

            # Merge pre-existing field_data (from document generation merge fields)
            # with user-submitted field_data (signatures, text, dates)
            existing_doc_field_data = document.get("field_data", {}) or {}
            existing_merge_values = document.get("merge_field_values", {}) or {}
            combined_field_data = {**existing_merge_values, **existing_doc_field_data, **field_data_for_doc}

            # Load field placements for PDF overlay.
            # Package-level overrides (saved in the run document by the Virtual
            # Builder) take priority.  Only fall back to the master template when
            # no package overrides exist so the original template is NEVER
            # mutated by package-specific edits.
            _pkg_fps_for_doc = pkg_doc.get("field_placements", [])
            if _pkg_fps_for_doc:
                field_placements = _pkg_fps_for_doc
                # Still need template metadata (tenant_id, name, group) for
                # downstream logic; skip the field_placements projection.
                template = await db.docflow_templates.find_one(
                    {"id": template_id},
                    {"_id": 0, "template_group_id": 1, "name": 1, "tenant_id": 1}
                )
            else:
                template = await db.docflow_templates.find_one(
                    {"id": template_id},
                    {"_id": 0, "field_placements": 1, "template_group_id": 1, "name": 1, "tenant_id": 1}
                )
                field_placements = (template or {}).get("field_placements", [])

                # If no field placements on this template version, resolve from latest
                if not field_placements and template:
                    from ..services.document_service_enhanced import EnhancedDocumentService
                    _doc_svc = EnhancedDocumentService(db)
                    field_placements = await _doc_svc._resolve_latest_field_placements(template)
                    if field_placements:
                        logger.info(f"sign-with-fields: Resolved {len(field_placements)} fields from latest template version")

            # Phase 81.71 — populate missing radio-group selections from the
            # authored `defaultChecked: True` option so the PDF matches the
            # signing-UI preview even when the signer never interacted.
            from ..services.field_defaults import apply_radio_defaults
            combined_field_data = apply_radio_defaults(field_placements, combined_field_data)

            # Filter fields: assigned fields + truly document-level types
            # (merge fields = CRM data, label = static doc text). Phase 81.30 —
            # checkbox + radio are now per-recipient assignable; they're no
            # longer in NON_ASSIGNABLE_TYPES so each signing pass only stamps
            # the boxes/options the active recipient actually owns. Prior
            # signers' picks are already burned into the previously-signed PDF
            # we just downloaded as `base_key`, so cumulative output is intact.
            assigned_field_ids = set(assigned_components.get(template_id, []))
            NON_ASSIGNABLE_TYPES = {"merge", "label"}
            if assigned_field_ids:
                relevant_fields = [
                    f for f in field_placements
                    if f.get("id") in assigned_field_ids or f.get("type") in NON_ASSIGNABLE_TYPES
                ]
            else:
                # No assignment map — check template-level assigned_to
                has_any_assignment = any(f.get("assigned_to") or f.get("recipient_id") for f in field_placements)
                if has_any_assignment:
                    # Only embed unassigned fields (fields with no assigned_to)
                    relevant_fields = [
                        f for f in field_placements
                        if not f.get("assigned_to") and not f.get("recipient_id")
                    ]
                else:
                    # No assignments at all — embed all fields (backward compat)
                    relevant_fields = field_placements

            # Get the existing S3 service for PDF operations
            from ..services.s3_service import S3Service
            s3_service = S3Service()

            # Issue 3 fix — resolve a usable base PDF with legacy fallbacks.
            unsigned_key = document.get("unsigned_s3_key")
            signed_key = document.get("signed_s3_key")
            base_key = (
                signed_key
                or unsigned_key
                or document.get("s3_key")
                or document.get("pdf_file_path")
            )
            if not base_key:
                logger.error(
                    f"package sign-with-fields: document {doc_id} has no usable S3 key "
                    f"(keys={list(document.keys())[:20]})"
                )
                continue

            pdf_bytes = s3_service.download_file(base_key)
            if not pdf_bytes:
                logger.error(f"package sign-with-fields: failed to download base PDF for {doc_id} (key={base_key})")
                continue

            # Embed field values into PDF using PyMuPDF
            import fitz  # PyMuPDF
            pdf_doc = fitz.open(stream=pdf_bytes, filetype="pdf")

            for field in relevant_fields:
                field_id = field.get("id")
                field_type = field.get("type")
                field_value = combined_field_data.get(field_id)

                # For merge fields, also check by merge pattern keys (e.g., "Account.name")
                if not field_value and field_type == "merge":
                    merge_obj = field.get("merge_object") or field.get("mergeObject", "")
                    merge_fld = field.get("merge_field") or field.get("mergeField", "")
                    full_key = f"{merge_obj}.{merge_fld}" if merge_obj and merge_fld else ""
                    field_value = (combined_field_data.get(full_key)
                                   or combined_field_data.get(merge_fld)
                                   or "")

                # If exact match not found, try prefix match (handles truncated IDs from frontend)
                if not field_value and field_value is not False:
                    for k, v in combined_field_data.items():
                        if field_id.startswith(k) or k.startswith(field_id):
                            if v:
                                field_value = v
                                break

                if not field_value and field_value is not False:
                    # Fallback to defaultValue for Read-Only or static fields
                    # to ensure they are burned into the final signed PDF.
                    field_value = field.get("defaultValue") or field.get("default_value")
                    if not field_value and field_value is not False:
                        continue

                page_num = (field.get("page", 1) or 1) - 1
                if page_num < 0 or page_num >= len(pdf_doc):
                    continue

                page = pdf_doc[page_num]
                page_rect = page.rect
                pdf_w = page_rect.width

                # Scale from 800px canvas coordinate system to PDF points
                scale = pdf_w / 800
                x = field.get("x", 0) * scale
                y = field.get("y", 0) * scale
                w = field.get("width", 100) * scale
                h = field.get("height", 30) * scale

                if field_type in ("signature", "initials") and field_value:
                    # Embed base64 image at EXACTLY the configured fontSize
                    # height (in PDF units), width auto by image aspect.
                    # Previously aspect-fit to the full box made all
                    # signatures look the same size regardless of the
                    # Visual Builder fontSize setting. Now a 24px sig is
                    # twice as tall as a 12px one (matching the signing UI).
                    try:
                        if isinstance(field_value, str) and field_value.startswith("data:image"):
                            b64_data = field_value.split(",", 1)[1]
                            img_bytes = base64.b64decode(b64_data)
                            # Determine native image size via Pixmap (PyMuPDF)
                            try:
                                pm = fitz.Pixmap(img_bytes)
                                img_w, img_h = pm.width, pm.height
                                pm = None
                            except Exception:
                                img_w = img_h = 0
                            align = (field.get("style") or {}).get("textAlign") or "center"
                            # Resolve configured fontSize → PDF height.
                            try:
                                _raw_fs = (field.get("style") or {}).get("fontSize")
                                if _raw_fs:
                                    _fs_css = float(str(_raw_fs).replace("px", ""))
                                else:
                                    _fs_css = 18.0
                            except Exception:
                                _fs_css = 18.0
                            target_h = max(6.0, _fs_css * scale)
                            # Cap at field box so we never overflow.
                            target_h = min(target_h, h)
                            if img_w > 0 and img_h > 0:
                                aspect = img_w / img_h
                                fit_h = target_h
                                fit_w = fit_h * aspect
                                if fit_w > w:
                                    fit_w = w
                                    fit_h = fit_w / aspect
                            else:
                                fit_w, fit_h = w, target_h
                            # Horizontal alignment
                            if align == "left":
                                sub_x = x
                            elif align == "right":
                                sub_x = x + (w - fit_w)
                            else:
                                sub_x = x + (w - fit_w) / 2
                            # Vertical center inside field box
                            sub_y = y + (h - fit_h) / 2
                            img_rect = fitz.Rect(sub_x, sub_y, sub_x + fit_w, sub_y + fit_h)
                            page.insert_image(img_rect, stream=img_bytes)
                    except Exception as e:
                        logger.warning(f"Failed to embed {field_type} for field {field_id}: {e}")

                elif field_type in ("text", "date") and field_value:
                    try:
                        # Issue 2 fix — date values are reformatted to honor
                        # the field's configured `dateFormat` (default
                        # MM/DD/YYYY). This guarantees the final signed PDF
                        # matches the Visual Builder configuration even when
                        # the signer typed in a different format or when the
                        # value came from a merge source / ISO timestamp.
                        if field_type == "date":
                            from ..services.date_format_util import reformat_date_value
                            field_value = reformat_date_value(
                                field_value, field.get("dateFormat")
                            )
                        base_fs = float(field.get("style", {}).get("fontSize", 10) or 10)
                        # Phase 81.70 — mirror frontend signing-UI font math:
                        #   baseFs = css_px * scale
                        #   hCap   = max(6, (h - 4) * 0.70)
                        #   wCap   = max(6, w / 3)   (single-line only)
                        #   final  = max(6, min(base, hCap, wCap, 24))
                        font_size = base_fs * scale
                        height_cap = max(6, (h - 4) * 0.70)
                        is_multiline_text = (
                            field_type == "text"
                            and (
                                field.get("fieldSubType") == "multi-line"
                                or field.get("field_sub_type") == "multi-line"
                                or field.get("multiline") is True
                            )
                        )
                        if is_multiline_text:
                            font_size = max(6, min(font_size, height_cap, 24))
                        else:
                            width_cap = max(6, w / 3)
                            font_size = max(6, min(font_size, height_cap, width_cap, 24))
                        text_str = str(field_value)
                        align_str = (field.get("style") or {}).get("textAlign") or "left"
                        align_map = {"left": 0, "center": 1, "right": 2}

                        # Phase 81.70 — VERTICAL CENTERING FIX:
                        # PyMuPDF's `insert_textbox` renders from the TOP of the
                        # rect, which caused values to "float above the line"
                        # vs the frontend preview (which centers). Single-line
                        # fields now use `insert_text` with an explicit baseline
                        # at `y + h/2 + fs*0.35` (matches the frontend's
                        # `y + ptHeight/2 - fs*0.35` in pdf-lib's bottom-up
                        # coord system). Multi-line keeps `insert_textbox` for
                        # word-wrap but shrinks the rect to a centered band
                        # sized for the clamped font.
                        if is_multiline_text:
                            # Centered multi-line band: start from middle-top.
                            line_h = max(font_size * 1.2, font_size + 2)
                            est_lines = max(1, int((h - 4 * scale) / line_h))
                            band_h = min(h - 4 * scale, est_lines * line_h)
                            band_top = y + (h - band_h) / 2
                            rect = fitz.Rect(
                                x + 5 * scale,
                                band_top,
                                x + w - 5 * scale,
                                band_top + band_h,
                            )
                            page.insert_textbox(
                                rect,
                                text_str,
                                fontsize=font_size,
                                fontname="helv",
                                color=(0, 0, 0),
                                align=align_map.get(align_str, 0),
                            )
                        else:
                            # Single-line: compute centered baseline + manual
                            # alignment so output matches the signing preview
                            # pixel-for-pixel.
                            try:
                                text_w = fitz.get_text_length(text_str, fontname="helv", fontsize=font_size)
                            except Exception:
                                text_w = 0
                            pad = 5 * scale
                            if align_str == "center":
                                tx = x + max(pad, (w - text_w) / 2)
                            elif align_str == "right":
                                tx = x + max(pad, w - text_w - pad)
                            else:
                                tx = x + pad
                            baseline_y = y + h / 2 + font_size * 0.35
                            page.insert_text(
                                fitz.Point(tx, baseline_y),
                                text_str,
                                fontsize=font_size,
                                fontname="helv",
                                color=(0, 0, 0),
                            )
                    except Exception as e:
                        logger.warning(f"Failed to embed text for field {field_id}: {e}")

                elif field_type == "checkbox":
                    try:
                        is_checked = field_value in (True, "true", "True")
                        # Phase 81.70 — match frontend signing-UI checkbox glyph:
                        box_size = max(6.0, min(14.0 * scale, h - 4.0 * scale))
                        if w > 0:
                            box_size = min(box_size, w - 2.0 * scale)
                        box_size = max(6.0, box_size)
                        bx = x + (w - box_size) / 2
                        by = y + (h - box_size) / 2
                        box_rect = fitz.Rect(bx, by, bx + box_size, by + box_size)

                        # Phase 81.73 — Tight centered mask (not full rect) so
                        # label text adjacent to the box is preserved when the
                        # author drew the field wider than the glyph itself.
                        mask_size = max(box_size + 2.0 * scale, 14.0 * scale)
                        mask_size = min(mask_size, w, h)
                        cx = x + w / 2
                        cy = y + h / 2
                        mx = cx - mask_size / 2
                        my = cy - mask_size / 2
                        page.draw_rect(
                            fitz.Rect(mx, my, mx + mask_size, my + mask_size),
                            color=None, fill=(1, 1, 1), width=0,
                        )

                        page.draw_rect(box_rect, color=(0.13, 0.13, 0.16), width=0.4)
                        if is_checked:
                            # Hairline check stroke — kept slightly heavier than border.
                            p1 = fitz.Point(bx + box_size * 0.22, by + box_size * 0.50)
                            p2 = fitz.Point(bx + box_size * 0.44, by + box_size * 0.72)
                            p3 = fitz.Point(bx + box_size * 0.78, by + box_size * 0.28)
                            shape = page.new_shape()
                            shape.draw_line(p1, p2)
                            shape.draw_line(p2, p3)
                            shape.finish(color=(0.13, 0.13, 0.16), width=0.7)
                            shape.commit()
                    except Exception as e:
                        logger.warning(f"Failed to embed checkbox for field {field_id}: {e}")

                elif field_type == "merge" and field_value:
                    try:
                        base_fs = float(field.get("style", {}).get("fontSize", 10) or 10)
                        # Phase 81.70 — same font-size clamp as text/date.
                        font_size = base_fs * scale
                        height_cap = max(6, (h - 4) * 0.70)
                        width_cap  = max(6, w / 3)
                        font_size = max(6, min(font_size, height_cap, width_cap, 24))
                        text_str = str(field_value)
                        align = (field.get("style") or {}).get("textAlign") or "left"
                        try:
                            text_w = fitz.get_text_length(text_str, fontname="helv", fontsize=font_size)
                        except Exception:
                            text_w = 0
                        pad = 2 * scale
                        if align == "center":
                            tx = x + max(pad, (w - text_w) / 2)
                        elif align == "right":
                            tx = x + max(pad, w - text_w - pad)
                        else:
                            tx = x + pad
                        # Phase 81.70 — CENTER baseline to match frontend preview.
                        # Previously `y + h - 4*scale` planted text near the BOTTOM
                        # of the rect (DocuSign-style anchor), diverging from the
                        # signing UI which centers vertically.
                        baseline_y = y + h / 2 + font_size * 0.35
                        page.insert_text(
                            fitz.Point(tx, baseline_y),
                            text_str,
                            fontsize=font_size,
                            fontname="helv",
                            color=(0.05, 0.05, 0.15),
                        )
                    except Exception as e:
                        logger.warning(f"Failed to embed merge field {field_id}: {e}")

                elif field_type == "radio":
                    # Radio: multiple fields share a group (field.groupName).
                    # Phase 81.73 — mask only the glyph area (centered square),
                    # NOT the full rect, so adjacent label text isn't erased
                    # when the author drew the field rect wider than needed.
                    try:
                        group = field.get("groupName") or field.get("group_name")
                        option_value = field.get("optionValue") or field.get("option_value") or field_id
                        selected_val = None
                        if group:
                            selected_val = combined_field_data.get(group)
                        if selected_val is None:
                            selected_val = combined_field_data.get(field_id)
                        is_selected = (selected_val == option_value)

                        # Phase 81.70 — match frontend glyph size.
                        opt_size = max(6.0, min(12.0 * scale, h - 4.0 * scale))
                        if w > 0:
                            opt_size = min(opt_size, w - 2.0 * scale)
                        opt_size = max(6.0, opt_size)
                        radius = opt_size / 2
                        cx = x + w / 2
                        cy = y + h / 2

                        # Phase 81.73 — Centered tight mask: just big enough to
                        # cover any baked-in native ○/● glyph in the source PDF
                        # without erasing adjacent label text.
                        mask_size = max(opt_size + 2.0 * scale, 14.0 * scale)
                        mask_size = min(mask_size, w, h)
                        mx = cx - mask_size / 2
                        my = cy - mask_size / 2
                        page.draw_rect(
                            fitz.Rect(mx, my, mx + mask_size, my + mask_size),
                            color=None, fill=(1, 1, 1), width=0,
                        )

                        # Outer ring — always drawn so unselected shows empty ○.
                        page.draw_circle(fitz.Point(cx, cy), radius, color=(0.13, 0.13, 0.16), width=0.4)
                        if is_selected:
                            inner_r = max(0.5, radius - 2.5 * scale)
                            page.draw_circle(fitz.Point(cx, cy), inner_r, color=(0.13, 0.13, 0.16), fill=(0.13, 0.13, 0.16), width=0)

                        # Phase 56: Option label is NEVER drawn in the final PDF
                        # (DocuSign-style — circle-only, clean output).
                    except Exception as e:
                        logger.warning(f"Failed to embed radio field {field_id}: {e}")

                elif field_type == "dropdown" and field_value:
                    # Phase 81.16 — render dropdown selection as text in PDF.
                    # Phase 81.70 — centered baseline to match frontend preview.
                    try:
                        base_fs = float(field.get("style", {}).get("fontSize", 10) or 10)
                        font_size = base_fs * scale
                        height_cap = max(6, (h - 4) * 0.70)
                        width_cap  = max(6, w / 3)
                        font_size = max(6, min(font_size, height_cap, width_cap, 24))
                        text_str = str(field_value)
                        align_str = (field.get("style") or {}).get("textAlign") or "left"
                        try:
                            text_w = fitz.get_text_length(text_str, fontname="helv", fontsize=font_size)
                        except Exception:
                            text_w = 0
                        pad = 5 * scale
                        if align_str == "center":
                            tx = x + max(pad, (w - text_w) / 2)
                        elif align_str == "right":
                            tx = x + max(pad, w - text_w - pad)
                        else:
                            tx = x + pad
                        baseline_y = y + h / 2 + font_size * 0.35
                        page.insert_text(
                            fitz.Point(tx, baseline_y),
                            text_str,
                            fontsize=font_size,
                            fontname="helv",
                            color=(0, 0, 0),
                        )
                    except Exception as e:
                        logger.warning(f"Failed to embed dropdown for field {field_id}: {e}")

            # Phase 81 — verification ID stamp applied to EVERY page of the PDF
            # to ensure auditability across the entire document.
            try:
                package_verification_id = str(package.get("id") or "").upper()
                if package_verification_id and len(pdf_doc) > 0:
                    stamp_text = f"Package Verification ID: {package_verification_id}"
                    fontsize = 8
                    try:
                        text_w = fitz.get_text_length(stamp_text, fontname="helv", fontsize=fontsize)
                    except Exception:
                        text_w = len(stamp_text) * 4.2

                    for page_idx in range(len(pdf_doc)):
                        page = pdf_doc[page_idx]
                        pw = page.rect.width
                        ph = page.rect.height
                        page.insert_text(
                            fitz.Point(max(18, pw - text_w - 18), ph - 12),
                            stamp_text,
                            fontname="helv",
                            fontsize=fontsize,
                            color=(0.4, 0.4, 0.4),
                        )
            except Exception as stamp_err:
                logger.warning(f"Verification stamp failed for package {package.get('id')}: {stamp_err}")

            # Save modified PDF
            signed_pdf_bytes = pdf_doc.tobytes()
            pdf_doc.close()

            # Upload signed PDF
            new_signed_key = s3_service.upload_document(
                file_bytes=signed_pdf_bytes,
                tenant_id=document["tenant_id"],
                document_id=doc_id,
                filename="signed.pdf",
                is_signed=True,
            )

            if new_signed_key:
                signed_url = s3_service.get_document_url(new_signed_key, expiration=604800)
                # Merge field data cumulatively
                existing_field_data = document.get("field_data", {}) or {}
                merged_field_data = {**existing_field_data, **combined_field_data}

                # Phase 81.7 — Merge field "convert to text fallback" persistence.
                # Mirror the template-flow behaviour: persist signer-typed values
                # under both `field_data[merge_id]` AND `merge_field_values[<alias>]`
                # so the final PDF render and webhook payload both surface them.
                updated_merge_values = dict(document.get("merge_field_values") or {})
                try:
                    for _p in (relevant_fields or []):
                        if (_p.get("type") or "").lower() != "merge":
                            continue
                        _pid = _p.get("id")
                        if not _pid:
                            continue
                        _typed = merged_field_data.get(_pid)
                        if _typed in (None, ""):
                            continue
                        _m_obj = _p.get("merge_object") or _p.get("mergeObject") or ""
                        _m_fld = _p.get("merge_field") or _p.get("mergeField") or ""
                        _alias = (
                            f"{_m_obj}.{_m_fld}".strip(".")
                            if (_m_obj and _m_fld)
                            else (_m_fld or _p.get("merge_token") or _p.get("mergePattern") or "").strip("{}").strip()
                        )
                        if _alias:
                            updated_merge_values[_alias] = _typed
                except Exception as _mv_err:
                    logger.warning(f"Package merge-value persistence soft-failed: {_mv_err}")

                # Update document record
                update_data = {
                    "signed_s3_key": new_signed_key,
                    "signed_file_url": signed_url,
                    "field_data": merged_field_data,
                    "merge_field_values": updated_merge_values,
                    "updated_at": now.isoformat(),
                }

                await db.docflow_documents.update_one(
                    {"id": doc_id},
                    {"$set": update_data}
                )

                # Phase 81.49 / Phase 2 — Interlinked Fields fanout. After
                # persisting this document's field_data, propagate values to
                # sibling documents in the same package_run whose placements
                # carry `linked_to.field_id` referencing a field in THIS doc
                # AND whose owner matches the source field's owner
                # (same-recipient scope).
                #
                # Phase 2 additions:
                #   • Radio: source/target storage key is the placement's
                #     groupName (not its id) because the renderer reads
                #     field_data[groupName] for new-model radios. We compute
                #     a `value_key_for(p)` helper that returns groupName for
                #     radios, else the placement id.
                #   • Checkbox: storage key is the placement id; values are
                #     plain booleans (passthrough).
                #   • Two-way reverse: when this doc's saved field_data
                #     contains a value for a placement that is itself a
                #     two-way TARGET (linked_to.direction === 'two_way'),
                #     also write that value into the SOURCE doc's field_data
                #     (same-recipient scope), then forward-fanout from the
                #     source so other targets stay in sync.
                try:
                    def value_key_for(p):
                        t = (p or {}).get("type") or (p or {}).get("field_type") or ""
                        if (t or "").lower() == "radio":
                            return p.get("groupName") or p.get("group_name") or p.get("id")
                        return p.get("id")

                    sibling_doc_ids = [
                        d.get("document_id") for d in package.get("documents", [])
                        if d.get("document_id") and d.get("document_id") != doc_id
                    ]
                    # Always run if the saved doc has linked-source candidates,
                    # even if no sibling docs (defensive for single-doc edge).
                    sibling_docs = []
                    if sibling_doc_ids:
                        sibling_docs = await db.docflow_documents.find(
                            {"id": {"$in": sibling_doc_ids}},
                            {"_id": 0}
                        ).to_list(length=None)

                    # Build a lookup of package-level field overrides keyed by
                    # template_id so forward/reverse fanout uses the correct
                    # (possibly overridden) placements for every sibling doc.
                    _pkg_fps_map = {
                        d.get("template_id"): d.get("field_placements", [])
                        for d in package.get("documents", [])
                        if d.get("template_id") and d.get("field_placements")
                    }

                    # Load this doc's placements — prefer package override.
                    tpl_cache = {}
                    _this_pkg_fps = _pkg_fps_map.get(template_id, [])
                    if _this_pkg_fps:
                        _this_tpl_meta = await db.docflow_templates.find_one(
                            {"id": template_id}, {"_id": 0, "recipients": 1}
                        )
                        tpl_cache[template_id] = {"field_placements": _this_pkg_fps, **(_this_tpl_meta or {})}
                    else:
                        this_tpl = await db.docflow_templates.find_one(
                            {"id": template_id},
                            {"_id": 0, "field_placements": 1, "recipients": 1}
                        )
                        tpl_cache[template_id] = this_tpl or {}
                    source_placements = tpl_cache[template_id].get("field_placements", []) or []
                    source_placements_by_id = {p.get("id"): p for p in source_placements}

                    # Build "source value" map keyed by placement id. For
                    # radios we read field_data[groupName]; for the rest the
                    # placement id IS the storage key.
                    source_values_by_pid = {}
                    for sp in source_placements:
                        pid = sp.get("id")
                        if not pid:
                            continue
                        vk = value_key_for(sp)
                        if vk in field_data_for_doc:
                            source_values_by_pid[pid] = field_data_for_doc[vk]

                    # FORWARD FANOUT: this doc as SOURCE → siblings as TARGETS.
                    for sib in sibling_docs:
                        sib_tpl_id = sib.get("template_id")
                        if not sib_tpl_id:
                            continue
                        if sib_tpl_id not in tpl_cache:
                            _sib_pkg_fps = _pkg_fps_map.get(sib_tpl_id, [])
                            if _sib_pkg_fps:
                                tpl_cache[sib_tpl_id] = {"field_placements": _sib_pkg_fps}
                            else:
                                t = await db.docflow_templates.find_one(
                                    {"id": sib_tpl_id},
                                    {"_id": 0, "field_placements": 1}
                                )
                                tpl_cache[sib_tpl_id] = t or {}
                        sib_placements = tpl_cache[sib_tpl_id].get("field_placements", []) or []
                        sib_updates = {}
                        for p in sib_placements:
                            link = p.get("linked_to") or {}
                            if not (link.get("enabled") and link.get("field_id")):
                                continue
                            src_fid = link["field_id"]
                            if src_fid not in source_values_by_pid:
                                continue
                            src_placement = source_placements_by_id.get(src_fid) or {}
                            src_owner = src_placement.get("assigned_to") or src_placement.get("recipient_id")
                            tgt_owner = p.get("assigned_to") or p.get("recipient_id")
                            if src_owner and tgt_owner and src_owner != tgt_owner:
                                continue
                            tgt_key = value_key_for(p)
                            sib_updates[f"field_data.{tgt_key}"] = source_values_by_pid[src_fid]
                        if sib_updates:
                            sib_updates["updated_at"] = now.isoformat()
                            await db.docflow_documents.update_one(
                                {"id": sib["id"]},
                                {"$set": sib_updates}
                            )
                            logger.info(f"[Interlink] Forward fanout {len(sib_updates)-1} value(s) from doc={doc_id[:8]} → doc={sib['id'][:8]}")

                    # REVERSE FANOUT: this doc has TWO-WAY targets → write back
                    # to source doc(s) and propagate from there.
                    two_way_triggers = []
                    for p in source_placements:
                        link = p.get("linked_to") or {}
                        if not (link.get("enabled") and link.get("field_id")):
                            continue
                        if link.get("direction") != "two_way":
                            continue
                        if link.get("read_only_target") is True:
                            continue  # locked target; reverse not allowed
                        vk = value_key_for(p)
                        if vk not in field_data_for_doc:
                            continue
                        two_way_triggers.append({
                            "target_placement": p,
                            "value": field_data_for_doc[vk],
                            "source_field_id": link["field_id"],
                        })

                    for trig in two_way_triggers:
                        # Find which sibling doc holds the source field id.
                        for sib in sibling_docs:
                            sib_tpl_id = sib.get("template_id")
                            if not sib_tpl_id:
                                continue
                            sib_placements = tpl_cache.get(sib_tpl_id, {}).get("field_placements", []) or []
                            src_p = next((sp for sp in sib_placements if sp.get("id") == trig["source_field_id"]), None)
                            if not src_p:
                                continue
                            tgt_owner = (trig["target_placement"] or {}).get("assigned_to") or (trig["target_placement"] or {}).get("recipient_id")
                            src_owner = src_p.get("assigned_to") or src_p.get("recipient_id")
                            if src_owner and tgt_owner and src_owner != tgt_owner:
                                break  # cross-recipient → silently skip
                            src_key = value_key_for(src_p)
                            new_val = trig["value"]
                            # Write back to source.
                            reverse_updates = {
                                f"field_data.{src_key}": new_val,
                                "updated_at": now.isoformat(),
                            }
                            await db.docflow_documents.update_one(
                                {"id": sib["id"]},
                                {"$set": reverse_updates}
                            )
                            logger.info(f"[Interlink] Reverse fanout (two-way) doc={doc_id[:8]} → source doc={sib['id'][:8]} key={src_key}")
                            # Forward-fanout from the source to any other
                            # targets pointing at the same source field.
                            for other_sib in sibling_docs:
                                if other_sib.get("id") == sib.get("id"):
                                    continue
                                other_tpl_id = other_sib.get("template_id")
                                other_placements = tpl_cache.get(other_tpl_id, {}).get("field_placements", []) or []
                                other_updates = {}
                                for op in other_placements:
                                    olink = op.get("linked_to") or {}
                                    if not (olink.get("enabled") and olink.get("field_id") == trig["source_field_id"]):
                                        continue
                                    o_tgt_owner = op.get("assigned_to") or op.get("recipient_id")
                                    if src_owner and o_tgt_owner and src_owner != o_tgt_owner:
                                        continue
                                    other_updates[f"field_data.{value_key_for(op)}"] = new_val
                                if other_updates:
                                    other_updates["updated_at"] = now.isoformat()
                                    await db.docflow_documents.update_one(
                                        {"id": other_sib["id"]},
                                        {"$set": other_updates}
                                    )
                                    logger.info(f"[Interlink] Two-way cascade from source doc={sib['id'][:8]} → doc={other_sib['id'][:8]}")
                            break  # found source doc; move to next trigger
                except Exception as _link_err:
                    logger.warning(f"Interlink fanout soft-failed: {_link_err}")

                # Log audit event
                await audit_service.log_event(
                    tenant_id=document["tenant_id"],
                    package_id=package["id"],
                    document_id=doc_id,
                    event_type="document_signed",
                    actor=signer_email or signer_name,
                    metadata={
                        "signer_name": signer_name,
                        "signer_email": signer_email,
                        "recipient_id": recipient_id,
                        "fields_filled": list(field_data_for_doc.keys()),
                    },
                )
                signed_doc_count += 1

        except Exception:
            logger.exception(
                f"package sign-with-fields: exception while processing document "
                f"{doc_id} (template={template_id}) for package {package['id']}"
            )
            continue

    # Collect signed document URLs for webhook & email
    signed_doc_urls = []
    for pkg_doc in package.get("documents", []):
        doc_id = pkg_doc.get("document_id")
        if doc_id:
            doc = await db.docflow_documents.find_one({"id": doc_id}, {"_id": 0, "signed_file_url": 1, "template_name": 1})
            if doc and doc.get("signed_file_url"):
                signed_doc_urls.append({
                    "document_id": doc_id,
                    "template_name": doc.get("template_name", pkg_doc.get("document_name", "")),
                    "signed_document_url": doc["signed_file_url"],
                })

    # Check if this is public_recipients mode — independent signing, no routing
    delivery_mode = package.get("delivery_mode", "email")
    actor = signer_email or signer_name or "anonymous"
    all_done = True  # default: routing engine handles progression for non-public_recipients

    if delivery_mode == "public_recipients":
        # ── Independent signing: skip routing engine wave logic ──
        now_iso = now.isoformat()

        # 1. Mark this recipient as completed directly
        await db.docflow_packages.update_one(
            {"id": package["id"], "recipients.id": recipient_id},
            {"$set": {
                "recipients.$.status": "completed",
                "recipients.$.action_taken": "signed",
                "recipients.$.action_at": now_iso,
                "updated_at": now_iso,
            }}
        )
        await db.docflow_package_runs.update_one(
            {"id": package["id"], "recipients.id": recipient_id},
            {"$set": {
                "recipients.$.status": "completed",
                "recipients.$.action_taken": "signed",
                "recipients.$.action_at": now_iso,
                "updated_at": now_iso,
            }}
        )

        # 2. Mark all documents as "signed" (not partially_signed)
        for pkg_doc in package.get("documents", []):
            did = pkg_doc.get("document_id")
            if did:
                await db.docflow_documents.update_one(
                    {"id": did},
                    {"$set": {"status": "signed", "updated_at": now_iso}}
                )

        # 3. Check if ALL recipients have completed → mark package as completed
        updated_pkg = await db.docflow_packages.find_one({"id": package["id"]}, {"_id": 0})
        all_done = all(
            r.get("status") in ("completed", "signed")
            for r in (updated_pkg or {}).get("recipients", [])
            if r.get("role_type") != "RECEIVE_COPY"
        )
        if all_done:
            await db.docflow_packages.update_one(
                {"id": package["id"]},
                {"$set": {"status": "completed", "completed_at": now_iso, "updated_at": now_iso}}
            )
            await db.docflow_package_runs.update_one(
                {"id": package["id"]},
                {"$set": {"status": "completed", "completed_at": now_iso, "updated_at": now_iso}}
            )

        # 4. Log audit event
        await audit_service.log_event(
            tenant_id=package.get("tenant_id", ""),
            package_id=package["id"],
            event_type="document_signed",
            recipient_id=recipient_id,
            actor=actor,
            metadata={
                "delivery_mode": "public_recipients",
                "signer_name": signer_name,
                "signer_email": signer_email,
                "documents_signed": signed_doc_count,
                "independent_signing": True,
            },
        )

        # 5. Fire webhook with status=signed (not partial)
        if webhook_service:
            try:
                await webhook_service.fire_package_event(
                    package_id=package["id"],
                    event_type="document_signed",
                    tenant_id=package.get("tenant_id", ""),
                    extra_data={
                        "recipient_id": recipient_id,
                        "action": "signed",
                        "status": "signed",
                        "signed_documents": signed_doc_urls,
                        "recipient_details": {"name": signer_name, "email": signer_email},
                        "timestamp": now_iso,
                    },
                )
            except Exception as e:
                logger.warning(f"Webhook failed: {e}")

        success = True
    else:
        # ── Standard routing engine flow for email/public_link/both ──
        success = await routing_engine.on_recipient_action(
            package_id=package["id"],
            recipient_id=recipient_id,
            action="signed",
            actor=actor,
            metadata={
                "role_type": "SIGN",
                **build_request_metadata(request),
                "signer_name": signer_name,
                "signer_email": signer_email,
                "documents_signed": signed_doc_count,
                "signed_documents": signed_doc_urls,
            },
        )

    if not success:
        raise HTTPException(status_code=400, detail="Failed to update recipient status")

    # Send signed document confirmation email to signer (skipped for public_recipients — no email workflow)
    if delivery_mode != "public_recipients" and signer_email and signed_doc_urls:
        try:
            from ..services.system_email_service import SystemEmailService
            email_svc = SystemEmailService()
            doc_links_html = "".join(
                f'<li><a href="{d["signed_document_url"]}">{d["template_name"] or "Document"}</a></li>'
                for d in signed_doc_urls
            )
            await email_svc.send_generic_email(
                to_email=signer_email,
                subject=f"Signing Complete — {package.get('name', 'Package')}",
                html_content=f"""
                <p>Hi {signer_name or 'there'},</p>
                <p>You have successfully signed the following documents in <strong>{package.get('name', 'Package')}</strong>:</p>
                <ul>{doc_links_html}</ul>
                <p>You can download the signed copies from the links above.</p>
                <p>Thank you,<br/>DocFlow</p>
                """,
            )
        except Exception as e:
            logger.warning(f"Failed to send signed doc email to {signer_email}: {e}")

    return {
        "success": True,
        "message": f"Package signed successfully ({signed_doc_count} documents)",
        "recipient_id": recipient_id,
        "action": "signed",
        "status": "signed" if delivery_mode == "public_recipients" else "processing",
        "documents_signed": signed_doc_count,
        "signed_documents": signed_doc_urls,
        "all_recipients_completed": all_done,
    }
@router.post("/{token}/mark-reviewed")
async def mark_reviewed(
    token: str,
    req: MarkReviewedRequest,
    request: Request,
    x_session_token: Optional[str] = Header(None),
):
    """
    Mark a VIEW_ONLY recipient as reviewed.
    Validates session (if require_auth), role and status before completing the action.
    """
    package, active_recipient = await _find_package_by_recipient_token(token)

    if not package:
        raise HTTPException(status_code=404, detail="Package not found or link expired")
    if not active_recipient:
        raise HTTPException(status_code=404, detail="Recipient not found")

    # Phase 81.43 — block voided recipient from performing any action.
    _assert_recipient_not_voided(active_recipient)

    # Session validation
    require_auth = package.get("security_settings", {}).get("require_auth", True)
    if require_auth:
        session = await _validate_session_for_request(token, x_session_token)
        if not session:
            raise HTTPException(status_code=401, detail="Session expired. Please verify again.")

    # Validate package status
    if package.get("status") != "in_progress":
        raise HTTPException(
            status_code=400,
            detail=f"Package is '{package.get('status')}', cannot mark as reviewed"
        )

    # Validate recipient role
    if active_recipient.get("role_type") not in ("VIEW_ONLY", "REVIEWER"):
        raise HTTPException(
            status_code=400,
            detail=f"Recipient role is '{active_recipient.get('role_type')}', not VIEW_ONLY or REVIEWER"
        )

    # Validate recipient status (must be an active pre-signing state).
    # Phase 81.45 — broadened from {notified, in_progress} to include
    # pending/sent/viewed. Email-delivered recipients often stay in
    # `pending` until they click their link, and some delivery backends
    # never flip to `notified`; the old guard rejected legitimate sign
    # attempts with "Recipient already 'pending'". Terminal / voided
    # statuses (signed/completed/approved/rejected/reviewed/declined/voided)
    # remain blocked correctly since they're not in this whitelist.
    if active_recipient.get("status") not in ("pending", "sent", "notified", "viewed", "in_progress"):
        raise HTTPException(
            status_code=400,
            detail=f"Recipient already '{active_recipient.get('status')}'"
        )

    # Complete the recipient action via routing engine
    actor = active_recipient.get("email") or active_recipient.get("name") or "anonymous"
    success = await routing_engine.on_recipient_action(
        package_id=package["id"],
        recipient_id=active_recipient["id"],
        action="reviewed",
        actor=actor,
        metadata={
            "role_type": "VIEW_ONLY",
            **build_request_metadata(request),
            "reviewer_name": req.reviewer_name or active_recipient.get("name"),
        },
    )

    if not success:
        raise HTTPException(status_code=400, detail="Failed to update recipient status")

    # Fire review webhook
    try:
        await webhook_service.fire_package_event(
            package_id=package["id"],
            event_type="reviewed",
            tenant_id=package.get("tenant_id", ""),
            extra_data={
                "action": "reviewed",
                "recipient_name": active_recipient.get("name", ""),
                "recipient_email": active_recipient.get("email", ""),
                "reviewer_name": req.reviewer_name or active_recipient.get("name"),
                **build_request_metadata(request),
            },
        )
    except Exception as e:
        logger.warning(f"Webhook fire_package_event (reviewed) failed: {e}")

    return {
        "success": True,
        "message": "Package marked as reviewed",
        "recipient_id": active_recipient["id"],
        "action": "reviewed",
    }



class ApproveRequest(BaseModel):
    approver_name: Optional[str] = None


class RejectRequest(BaseModel):
    reason: str
    rejector_name: Optional[str] = None


@router.post("/{token}/approve")
async def approve_package(
    token: str,
    req: ApproveRequest,
    request: Request,
    x_session_token: Optional[str] = Header(None),
):
    """
    Approve a package as an APPROVE_REJECT recipient.
    Validates session, then completes the recipient's action and triggers next routing step.
    """
    package, active_recipient = await _find_package_by_recipient_token(token)

    if not package:
        raise HTTPException(status_code=404, detail="Package not found or link expired")
    if not active_recipient:
        raise HTTPException(status_code=404, detail="Recipient not found")

    # Phase 81.43 — block voided recipient from performing any action.
    _assert_recipient_not_voided(active_recipient)

    # Session validation
    require_auth = package.get("security_settings", {}).get("require_auth", True)
    if require_auth:
        session = await _validate_session_for_request(token, x_session_token)
        if not session:
            raise HTTPException(status_code=401, detail="Session expired. Please verify again.")

    if package.get("status") != "in_progress":
        raise HTTPException(
            status_code=400,
            detail=f"Package is '{package.get('status')}', cannot approve"
        )

    if active_recipient.get("role_type") != "APPROVE_REJECT":
        raise HTTPException(
            status_code=400,
            detail=f"Recipient role is '{active_recipient.get('role_type')}', not APPROVE_REJECT"
        )

    # Phase 81.45 — broadened whitelist to include pending/sent/viewed.
    if active_recipient.get("status") not in ("pending", "sent", "notified", "viewed", "in_progress"):
        raise HTTPException(
            status_code=400,
            detail=f"Recipient already '{active_recipient.get('status')}'"
        )

    actor = active_recipient.get("email") or active_recipient.get("name") or "anonymous"
    success = await routing_engine.on_recipient_action(
        package_id=package["id"],
        recipient_id=active_recipient["id"],
        action="approved",
        actor=actor,
        metadata={
            "role_type": "APPROVE_REJECT",
            **build_request_metadata(request),
            "approver_name": req.approver_name or active_recipient.get("name"),
        },
    )

    if not success:
        raise HTTPException(status_code=400, detail="Failed to update recipient status")

    # Fire approve_reject webhook
    try:
        await webhook_service.fire_package_event(
            package_id=package["id"],
            event_type="approved",
            tenant_id=package.get("tenant_id", ""),
            extra_data={
                "action": "approved",
                "recipient_name": active_recipient.get("name", ""),
                "recipient_email": active_recipient.get("email", ""),
                "approver_name": req.approver_name or active_recipient.get("name"),
                **build_request_metadata(request),
            },
        )
    except Exception as e:
        logger.warning(f"Webhook fire_package_event (approved) failed: {e}")

    # Send approval notification email to other recipients
    try:
        from ..services.system_email_service import SystemEmailService
        email_svc = SystemEmailService()
        pkg_name = package.get("package_name") or package.get("name", "Package")
        for r in package.get("recipients", []):
            if r.get("email") and r.get("id") != active_recipient.get("id"):
                if r.get("status") in ("signed", "completed", "approved", "reviewed", "notified", "sent"):
                    await email_svc.send_workflow_notification_email(
                        to_email=r["email"], to_name=r.get("name", ""),
                        document_name=pkg_name, notification_type="approved",
                        extra={"actor_name": active_recipient.get("name", "")},
                    )
        logger.info(f"Sent approval notification emails for package {package['id']}")
    except Exception as ae:
        logger.warning(f"Failed to send approval notification emails: {ae}")

    return {
        "success": True,
        "message": "Package approved",
        "recipient_id": active_recipient["id"],
        "action": "approved",
    }


@router.post("/{token}/reject")
async def reject_package(
    token: str,
    req: RejectRequest,
    request: Request,
    x_session_token: Optional[str] = Header(None),
):
    """
    Reject a package as an APPROVE_REJECT recipient.
    Validates session, then voids the entire package with the rejection reason.
    """
    package, active_recipient = await _find_package_by_recipient_token(token)

    if not package:
        raise HTTPException(status_code=404, detail="Package not found or link expired")
    if not active_recipient:
        raise HTTPException(status_code=404, detail="Recipient not found")

    # Phase 81.43 — block voided recipient from performing any action.
    _assert_recipient_not_voided(active_recipient)

    # Session validation
    require_auth = package.get("security_settings", {}).get("require_auth", True)
    if require_auth:
        session = await _validate_session_for_request(token, x_session_token)
        if not session:
            raise HTTPException(status_code=401, detail="Session expired. Please verify again.")

    if package.get("status") != "in_progress":
        raise HTTPException(
            status_code=400,
            detail=f"Package is '{package.get('status')}', cannot reject"
        )

    if active_recipient.get("role_type") != "APPROVE_REJECT":
        raise HTTPException(
            status_code=400,
            detail=f"Recipient role is '{active_recipient.get('role_type')}', not APPROVE_REJECT"
        )

    # Phase 81.45 — broadened whitelist to include pending/sent/viewed.
    if active_recipient.get("status") not in ("pending", "sent", "notified", "viewed", "in_progress"):
        raise HTTPException(
            status_code=400,
            detail=f"Recipient already '{active_recipient.get('status')}'"
        )

    if not req.reason.strip():
        raise HTTPException(status_code=400, detail="Rejection reason is required")

    actor = active_recipient.get("email") or active_recipient.get("name") or "anonymous"

    # Mark the recipient as completed with "rejected" action
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc).isoformat()
    recipients = package.get("recipients", [])
    for r in recipients:
        if r["id"] == active_recipient["id"]:
            r["status"] = "completed"
            r["action_taken"] = "rejected"
            r["action_at"] = now
            r["completed_at"] = now
            r["reject_reason"] = req.reason.strip()
            break

    await db.docflow_packages.update_one(
        {"id": package["id"]},
        {"$set": {"recipients": recipients, "updated_at": now}}
    )
    # Dual-write to runs collection
    await db.docflow_package_runs.update_one(
        {"id": package["id"]},
        {"$set": {"recipients": recipients, "updated_at": now}}
    )

    # Log the rejection event
    if audit_service:
        await audit_service.log_event(
            tenant_id=package.get("tenant_id", ""),
            package_id=package["id"],
            recipient_id=active_recipient["id"],
            event_type="recipient_rejected",
            actor=actor,
            metadata={
                "role_type": "APPROVE_REJECT",
                "reject_reason": req.reason.strip(),
                **build_request_metadata(request),
            },
        )

    # Void the entire package
    await routing_engine._void_package(
        package_id=package["id"],
        reason=f"Rejected by {actor}: {req.reason.strip()}",
        actor=actor,
    )

    # Fire approve_reject webhook (rejected)
    try:
        await webhook_service.fire_package_event(
            package_id=package["id"],
            event_type="rejected",
            tenant_id=package.get("tenant_id", ""),
            extra_data={
                "action": "rejected",
                "recipient_name": active_recipient.get("name", ""),
                "recipient_email": active_recipient.get("email", ""),
                "reason": req.reason.strip(),
                "reject_reason": req.reason.strip(),
                **build_request_metadata(request),
            },
        )
    except Exception as e:
        logger.warning(f"Webhook fire_package_event (rejected) failed: {e}")

    # Send rejection notification email to other recipients
    try:
        from ..services.system_email_service import SystemEmailService
        email_svc = SystemEmailService()
        pkg_name = package.get("package_name") or package.get("name", "Package")
        for r in package.get("recipients", []):
            if r.get("email") and r.get("id") != active_recipient.get("id"):
                if r.get("status") in ("signed", "completed", "approved", "reviewed", "notified", "sent"):
                    await email_svc.send_workflow_notification_email(
                        to_email=r["email"], to_name=r.get("name", ""),
                        document_name=pkg_name, notification_type="rejected",
                        extra={"actor_name": active_recipient.get("name", ""), "reason": req.reason.strip()},
                    )
        logger.info(f"Sent rejection notification emails for package {package['id']}")
    except Exception as re_err:
        logger.warning(f"Failed to send rejection notification emails: {re_err}")

    return {
        "success": True,
        "message": "Package rejected and voided",
        "recipient_id": active_recipient["id"],
        "action": "rejected",
        "void_reason": req.reason.strip(),
    }


@router.post("/{token}/void")
async def void_package_public(
    token: str,
    req: VoidFromPublicRequest,
    request: Request,
    x_session_token: Optional[str] = Header(None),
):
    """
    Void a package from the public view.
    Requires a valid session (if auth required) and the package must be in a voidable state.
    """
    package, active_recipient = await _find_package_by_recipient_token(token)

    if not package:
        raise HTTPException(status_code=404, detail="Package not found or link expired")
    if not active_recipient:
        raise HTTPException(status_code=404, detail="Recipient not found")

    # Phase 81.43 — block voided recipient from performing any action.
    _assert_recipient_not_voided(active_recipient)

    # Session validation
    require_auth = package.get("security_settings", {}).get("require_auth", True)
    if require_auth:
        session = await _validate_session_for_request(token, x_session_token)
        if not session:
            raise HTTPException(status_code=401, detail="Session expired. Please verify again.")

    # Only allow void on active packages
    if package.get("status") not in ("in_progress", "draft"):
        raise HTTPException(
            status_code=400,
            detail=f"Package is '{package.get('status')}', cannot void"
        )

    if not req.reason.strip():
        raise HTTPException(status_code=400, detail="Void reason is required")

    actor = active_recipient.get("email") or active_recipient.get("name") or "anonymous"
    reason = f"Voided by {actor} (public): {req.reason.strip()}"

    # Void the package
    await routing_engine._void_package(
        package_id=package["id"],
        reason=reason,
        actor=actor,
    )

    # Invalidate session after void
    if x_session_token:
        await session_service.invalidate_session(x_session_token)

    return {
        "success": True,
        "message": "Package has been voided",
        "void_reason": req.reason.strip(),
    }
