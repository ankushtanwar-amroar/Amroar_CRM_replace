"""DocFlow SMS service — Phase 81.

Production-ready Twilio integration with graceful no-op fallback when Twilio
credentials are not configured. Used by the SMS-verification ("Security Check")
flow to deliver one-time codes to recipients before they can sign a document
when the document is sent with `sms_mode=true`.

Environment variables (set in backend/.env to enable real SMS delivery):
    TWILIO_ACCOUNT_SID   — Twilio account SID
    TWILIO_AUTH_TOKEN    — Twilio auth token
    TWILIO_FROM_NUMBER   — Sender phone number, in E.164 format (e.g., +12025551234)

If any of these are missing, the service still functions in "stub mode": it
logs the OTP and returns success so the rest of the pipeline (DB writes, audit
trail, frontend flow) is exercisable in lower environments without spending
money on real SMS. Production deployments MUST set the env vars.
"""

from __future__ import annotations

import logging
import os
import secrets
from typing import Optional

logger = logging.getLogger(__name__)


def _is_configured() -> bool:
    return bool(
        os.environ.get("TWILIO_ACCOUNT_SID")
        and os.environ.get("TWILIO_AUTH_TOKEN")
        and os.environ.get("TWILIO_FROM_NUMBER")
    )


def generate_otp(length: int = 6) -> str:
    """Generate a numeric OTP using `secrets` (cryptographically secure)."""
    if length < 4:
        length = 4
    return "".join(str(secrets.randbelow(10)) for _ in range(length))


def mask_phone(phone: Optional[str]) -> str:
    """Return `+••• ••• ••12` style mask for UI safe-display."""
    if not phone:
        return ""
    digits = "".join(c for c in phone if c.isdigit())
    if len(digits) <= 4:
        return f"•••{digits}"
    return f"•••{digits[-4:]}"


async def send_otp_sms(to_phone: str, otp: str, document_name: Optional[str] = None) -> dict:
    """Send the OTP via Twilio. Returns `{success, sid?, error?, stubbed?}`.

    NEVER raises — caller can rely on success boolean for branching.
    """
    if not to_phone:
        return {"success": False, "error": "Recipient phone number missing"}

    body = (
        f"Your verification code for {document_name or 'your document'} is: {otp}. "
        f"This code expires in 10 minutes."
    )
    return await _send(to_phone, body)


async def send_link_sms(
    to_phone: str,
    link: str,
    document_name: Optional[str] = None,
    document_type: str = "document",
    body_override: Optional[str] = None,
) -> dict:
    """Phase 81.62 — Send the signing link via SMS after the recipient
    confirms the Security Check popup. Separate from OTP SMS so message
    body + audit log category stay distinct.

    Phase 81.81 — When a tenant has configured an SMS template, the caller
    passes the rendered template body via `body_override` so the customised
    copy is sent. If absent, falls back to the original hardcoded body.
    """
    if not to_phone:
        return {"success": False, "error": "Recipient phone number missing"}
    if not link:
        return {"success": False, "error": "Signing link missing"}

    if body_override and body_override.strip():
        body = body_override
    else:
        body = (
            f"DocFlow Secure Access\n\n"
            f"Your signing link:\n{link}\n\n"
            f"{document_type.capitalize()}: {document_name or 'your document'}\n\n"
            f"This is an automated secure message."
        )
    return await _send(to_phone, body, retry=1)


async def _send(to_phone: str, body: str, retry: int = 0) -> dict:
    """Internal sender with optional single retry for transient failures."""
    if not _is_configured():
        logger.warning(
            f"[SMS STUB] Twilio not configured. Would send to {to_phone}: {body[:80]}..."
        )
        return {"success": True, "stubbed": True, "to": to_phone}

    try:
        from twilio.rest import Client  # type: ignore
    except Exception as e:
        logger.error(f"twilio package not installed: {e}")
        return {"success": False, "error": "Twilio SDK not installed on server"}

    attempts = 0
    last_error = None
    while attempts <= retry:
        attempts += 1
        try:
            client = Client(
                os.environ["TWILIO_ACCOUNT_SID"],
                os.environ["TWILIO_AUTH_TOKEN"],
            )
            msg = client.messages.create(
                body=body,
                from_=os.environ["TWILIO_FROM_NUMBER"],
                to=to_phone,
            )
            return {"success": True, "sid": msg.sid}
        except Exception as e:
            last_error = str(e)
            logger.error(f"Twilio send failed (attempt {attempts}): {e}")

    return {"success": False, "error": last_error or "Twilio send failed"}
