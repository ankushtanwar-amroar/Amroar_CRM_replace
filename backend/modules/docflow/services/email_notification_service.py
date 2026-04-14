"""
DocFlow Email Notification Service

Sends "Action Required" emails when recipients are activated in a package wave.
Sends OTP emails for session verification.
Uses the existing email_service.send_email() function (SMTP/SendGrid).
"""
import os
import logging
from typing import Optional

logger = logging.getLogger(__name__)

# Frontend base URL for building recipient access links
FRONTEND_URL = os.environ.get('FRONTEND_URL', '')

ROLE_LABELS = {
    "SIGN": "Signer",
    "VIEW_ONLY": "Reviewer",
    "APPROVE_REJECT": "Approver",
    "RECEIVE_COPY": "Copy Recipient",
}

ACTION_DESCRIPTIONS = {
    "SIGN": "sign the documents",
    "VIEW_ONLY": "review the documents",
    "APPROVE_REJECT": "approve or reject the documents",
    "RECEIVE_COPY": "view the completed documents",
}

CTA_LABELS = {
    "SIGN": "Open & Sign",
    "VIEW_ONLY": "Review Documents",
    "APPROVE_REJECT": "Approve / Reject",
    "RECEIVE_COPY": "View Documents",
}


def _build_action_required_html(
    recipient_name: str,
    recipient_email: str,
    role_type: str,
    package_name: str,
    document_count: int,
    access_url: str,
    sender_name: Optional[str] = None,
) -> str:
    """Build the HTML email body for an 'Action Required' notification."""
    role_label = ROLE_LABELS.get(role_type, "Recipient")
    action_desc = ACTION_DESCRIPTIONS.get(role_type, "take action on the documents")
    cta_text = CTA_LABELS.get(role_type, "Open & Sign")

    return f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;padding:40px 20px;">
<tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;border:1px solid #e2e5ea;overflow:hidden;">

<!-- Header -->
<tr><td style="background:linear-gradient(135deg,#4f46e5 0%,#6366f1 100%);padding:32px 40px;text-align:center;">
  <h1 style="color:#fff;font-size:20px;font-weight:700;margin:0;">Action Required</h1>
  <p style="color:rgba(255,255,255,0.85);font-size:13px;margin:8px 0 0;">You have a document package awaiting your action</p>
</td></tr>

<!-- Body -->
<tr><td style="padding:32px 40px;">
  <p style="color:#374151;font-size:15px;margin:0 0 20px;">Hi {recipient_name},</p>
  <p style="color:#374151;font-size:15px;margin:0 0 24px;">
    {f'{sender_name} has' if sender_name else 'You have been'} requested you to <strong>{action_desc}</strong> in the following package:
  </p>

  <!-- Package Info Card -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;margin:0 0 24px;">
  <tr><td style="padding:16px 20px;">
    <p style="color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 4px;">Package</p>
    <p style="color:#111827;font-size:16px;font-weight:600;margin:0 0 12px;">{package_name}</p>
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td style="padding-right:16px;">
        <p style="color:#6b7280;font-size:12px;margin:0;">Role</p>
        <p style="color:#4f46e5;font-size:13px;font-weight:600;margin:2px 0 0;">{role_label}</p>
      </td>
      <td>
        <p style="color:#6b7280;font-size:12px;margin:0;">Documents</p>
        <p style="color:#111827;font-size:13px;font-weight:600;margin:2px 0 0;">{document_count}</p>
      </td>
    </tr></table>
  </td></tr></table>

  <!-- CTA Button -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
  <tr><td align="center" style="padding:0 0 8px;">
    <a href="{access_url}" style="display:inline-block;background:#4f46e5;color:#fff;font-size:15px;font-weight:600;text-decoration:none;padding:12px 32px;border-radius:8px;">
      {cta_text}
    </a>
  </td></tr></table>

  <p style="color:#9ca3af;font-size:12px;text-align:center;margin:16px 0 0;">
    If the button doesn't work, copy this link:<br>
    <a href="{access_url}" style="color:#4f46e5;word-break:break-all;">{access_url}</a>
  </p>
</td></tr>

<!-- Footer -->
<tr><td style="padding:20px 40px;border-top:1px solid #e5e7eb;text-align:center;">
  <p style="color:#9ca3af;font-size:11px;margin:0;">
    This is an automated notification from DocFlow. Please do not reply to this email.
  </p>
</td></tr>

</table>
</td></tr></table>
</body>
</html>"""


def send_action_required_email(
    recipient_name: str,
    recipient_email: str,
    role_type: str,
    package_name: str,
    package_id: str,
    public_token: str,
    document_count: int,
    sender_name: Optional[str] = None,
) -> bool:
    """
    Send an 'Action Required' email to a package recipient.
    Returns True if sent successfully, False otherwise.
    """
    try:
        from services.email_service import send_email, FRONTEND_URL as EMAIL_FRONTEND_URL

        base_url = EMAIL_FRONTEND_URL or FRONTEND_URL
        access_url = f"{base_url}/docflow/package/{package_id}/view/{public_token}"

        role_label = ROLE_LABELS.get(role_type, "Recipient")
        subject = f"Action Required: {role_label} — {package_name}"

        html = _build_action_required_html(
            recipient_name=recipient_name,
            recipient_email=recipient_email,
            role_type=role_type,
            package_name=package_name,
            document_count=document_count,
            access_url=access_url,
            sender_name=sender_name,
        )

        logger.info(f"[DocFlowEmail] Sending action-required email to {recipient_email} (role={role_type})")
        result = send_email(
            to_email=recipient_email,
            subject=subject,
            html_content=html,
            from_name="DocFlow",
        )
        if result:
            logger.info(f"[DocFlowEmail] Action-required email sent to {recipient_email}")
        else:
            logger.error(f"[DocFlowEmail] Action-required email FAILED for {recipient_email}")
        return result
    except Exception as e:
        logger.error(f"[DocFlowEmail] Exception sending action email to {recipient_email}: {e}")
        return False


def send_otp_email(
    recipient_email: str,
    recipient_name: str,
    otp_code: str,
    package_name: str = "Document Package",
) -> bool:
    """Send OTP verification email for package access. Standalone function (not a class method)."""
    try:
        from services.email_service import send_email

        subject = f"Your Verification Code — {package_name}"
        html = f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;padding:40px 20px;">
<tr><td align="center">
<table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;border:1px solid #e2e5ea;overflow:hidden;">
<tr><td style="background:#4f46e5;padding:20px 24px;text-align:center;">
  <h2 style="color:#fff;margin:0;font-size:18px;font-weight:700;">Verification Code</h2>
</td></tr>
<tr><td style="padding:28px 32px;">
  <p style="color:#374151;font-size:14px;margin:0 0 12px;">Hi {recipient_name},</p>
  <p style="color:#374151;font-size:14px;margin:0 0 20px;">Use the code below to verify your identity and access <strong>{package_name}</strong>:</p>
  <div style="background:#f3f4f6;padding:20px;border-radius:8px;text-align:center;margin:0 0 20px;">
    <span style="font-size:36px;font-weight:700;letter-spacing:8px;color:#111827;">{otp_code}</span>
  </div>
  <p style="color:#6b7280;font-size:12px;margin:0;">This code expires in 10 minutes. If you didn't request this, you can safely ignore this email.</p>
</td></tr>
<tr><td style="padding:16px 32px;border-top:1px solid #e5e7eb;text-align:center;">
  <p style="color:#9ca3af;font-size:11px;margin:0;">This is an automated notification from DocFlow.</p>
</td></tr>
</table>
</td></tr></table>
</body>
</html>"""

        logger.info(f"[DocFlowEmail] Sending OTP email to {recipient_email}")
        result = send_email(
            to_email=recipient_email,
            subject=subject,
            html_content=html,
            from_name="DocFlow",
        )
        if result:
            logger.info(f"[DocFlowEmail] OTP email sent to {recipient_email}")
        else:
            logger.error(f"[DocFlowEmail] OTP email FAILED for {recipient_email}")
        return result
    except Exception as e:
        logger.error(f"[DocFlowEmail] Exception sending OTP to {recipient_email}: {e}")
        return False


class EmailNotificationService:
    """Wrapper class for backwards compatibility with code that instantiates EmailNotificationService(db)."""

    def __init__(self, db):
        self.db = db

    async def send_otp_email(self, **kwargs) -> bool:
        return send_otp_email(**kwargs)

    async def send_action_required_email(self, **kwargs) -> bool:
        return send_action_required_email(**kwargs)
