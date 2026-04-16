"""
Email Template Service for DocFlow.
Manages custom email templates with variables, defaults, and HTML support.
"""
import uuid
import logging
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List

logger = logging.getLogger(__name__)

# Default template types
TEMPLATE_TYPES = [
    "signer_notification",
    "approver_notification",
    "reviewer_notification",
    "package_send",
    "document_signed",
    "reminder",
]

# Available variables for email templates
AVAILABLE_VARIABLES = [
    {"key": "{{recipient_name}}", "label": "Recipient Name", "description": "Name of the recipient"},
    {"key": "{{recipient_email}}", "label": "Recipient Email", "description": "Email of the recipient"},
    {"key": "{{document_name}}", "label": "Document Name", "description": "Name of the document/template"},
    {"key": "{{package_name}}", "label": "Package Name", "description": "Name of the package"},
    {"key": "{{signing_link}}", "label": "Signing Link", "description": "URL for the recipient to sign/view"},
    {"key": "{{sender_name}}", "label": "Sender Name", "description": "Name of the person who sent"},
    {"key": "{{company_name}}", "label": "Company Name", "description": "Organization name"},
    {"key": "{{status}}", "label": "Status", "description": "Current document/package status"},
    {"key": "{{due_date}}", "label": "Due Date", "description": "Expiry/due date if set"},
    {"key": "{{signed_date}}", "label": "Signed Date", "description": "Date when document was signed"},
    {"key": "{{download_link}}", "label": "Download Link", "description": "Link to download signed document"},
]

# Default email templates
def _build_professional_template(heading, sub_text, cta_text, cta_link_var="{{signing_link}}"):
    """Build the professional Cluvik DocFlow email HTML matching the system design."""
    return f'''<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{heading}</title>
  <style>
    body, table, td, a {{ -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }}
    table, td {{ mso-table-lspace: 0pt; mso-table-rspace: 0pt; }}
    img {{ border: 0; outline: none; text-decoration: none; }}
    table {{ border-collapse: collapse !important; }}
    body {{ margin: 0 !important; padding: 0 !important; width: 100% !important; background-color: #f4f7fb; }}
    a {{ text-decoration: none; }}
    @media screen and (max-width: 640px) {{
      .container {{ width: 100% !important; }}
      .mobile-padding {{ padding-left: 20px !important; padding-right: 20px !important; }}
    }}
  </style>
</head>
<body style="margin:0; padding:0; background-color:#f4f7fb;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f7fb;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="640" cellpadding="0" cellspacing="0" border="0" class="container" style="width:640px; max-width:640px; background-color:#ffffff; border-radius:18px; overflow:hidden; box-shadow:0 8px 30px rgba(17,24,39,0.06);">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg, #5b4bff 0%, #7b6dff 100%); padding:28px 32px;" class="mobile-padding">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="left" style="vertical-align:middle;">
                    <div style="display:inline-block; background-color:rgba(255,255,255,0.16); border:1px solid rgba(255,255,255,0.22); border-radius:12px; padding:10px 14px;">
                      <span style="font-family:Arial, Helvetica, sans-serif; font-size:22px; line-height:22px; font-weight:700; color:#ffffff; letter-spacing:0.2px;">Cluvik</span>
                    </div>
                  </td>
                  <td align="right" style="vertical-align:middle; font-family:Arial, Helvetica, sans-serif; color:#e9e7ff; font-size:13px; line-height:20px;">
                    DocFlow Secure Delivery
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:36px 40px 18px 40px;" class="mobile-padding">
              <p style="margin:0 0 12px 0; font-family:Arial, Helvetica, sans-serif; font-size:15px; line-height:24px; color:#4b5563;">
                Hello {{{{recipient_name}}}},
              </p>
              <h1 style="margin:0 0 14px 0; font-family:Arial, Helvetica, sans-serif; font-size:28px; line-height:36px; color:#111827; font-weight:700;">
                {heading}
              </h1>
              <p style="margin:0 0 22px 0; font-family:Arial, Helvetica, sans-serif; font-size:16px; line-height:26px; color:#374151;">
                {sub_text}
              </p>
              <!-- Document Info Card -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e5e7eb; border-radius:14px; background-color:#fafbff; margin-bottom:24px;">
                <tr>
                  <td style="padding:20px 22px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="padding-bottom:10px; font-family:Arial, Helvetica, sans-serif; font-size:13px; line-height:20px; color:#6b7280;">Document</td>
                      </tr>
                      <tr>
                        <td style="padding-bottom:18px; font-family:Arial, Helvetica, sans-serif; font-size:18px; line-height:28px; color:#111827; font-weight:700;">{{{{document_name}}}}</td>
                      </tr>
                      <tr>
                        <td>
                          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                            <tr>
                              <td width="50%" style="padding:0 10px 10px 0; vertical-align:top;">
                                <div style="font-family:Arial, Helvetica, sans-serif; font-size:12px; line-height:18px; color:#6b7280;">Requested by</div>
                                <div style="font-family:Arial, Helvetica, sans-serif; font-size:14px; line-height:22px; color:#111827; font-weight:600;">{{{{sender_name}}}}</div>
                              </td>
                              <td width="50%" style="padding:0 0 10px 10px; vertical-align:top;">
                                <div style="font-family:Arial, Helvetica, sans-serif; font-size:12px; line-height:18px; color:#6b7280;">Recipient</div>
                                <div style="font-family:Arial, Helvetica, sans-serif; font-size:14px; line-height:22px; color:#111827; font-weight:600;">{{{{recipient_email}}}}</div>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 24px 0; font-family:Arial, Helvetica, sans-serif; font-size:15px; line-height:25px; color:#374151;">
                To continue, click the button below. Your secure session will open the document directly and guide you through the required actions.
              </p>
              <!-- CTA Button -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:18px;">
                <tr>
                  <td align="center" bgcolor="#5b4bff" style="border-radius:12px;">
                    <a href="{cta_link_var}" target="_blank" style="display:inline-block; padding:16px 28px; font-family:Arial, Helvetica, sans-serif; font-size:16px; line-height:20px; font-weight:700; color:#ffffff; background-color:#5b4bff; border-radius:12px; text-decoration:none;">
                      {cta_text}
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 26px 0; font-family:Arial, Helvetica, sans-serif; font-size:13px; line-height:22px; color:#6b7280;">
                Button not working? Copy and paste this secure link into your browser:<br />
                <a href="{cta_link_var}" target="_blank" style="color:#5b4bff; word-break:break-all;">{cta_link_var}</a>
              </p>
              <!-- Security Notice -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f8fafc; border:1px solid #e5e7eb; border-radius:12px; margin-bottom:22px;">
                <tr>
                  <td style="padding:16px 18px; font-family:Arial, Helvetica, sans-serif; font-size:13px; line-height:21px; color:#4b5563;">
                    <strong style="color:#111827;">Security notice:</strong>
                    This link is intended for <strong>{{{{recipient_email}}}}</strong> and may be tied to your active session, token, or verification step. Please do not forward this email unless sharing is intended by the sender.
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 10px 0; font-family:Arial, Helvetica, sans-serif; font-size:14px; line-height:24px; color:#374151;">Need help accessing the document?</p>
              <p style="margin:0 0 26px 0; font-family:Arial, Helvetica, sans-serif; font-size:14px; line-height:24px; color:#374151;">
                Contact us at <a href="mailto:support@cluvik.com" style="color:#5b4bff;">support@cluvik.com</a> or visit <a href="https://cluvik.com/support" target="_blank" style="color:#5b4bff;">https://cluvik.com/support</a>.
              </p>
              <p style="margin:0; font-family:Arial, Helvetica, sans-serif; font-size:14px; line-height:24px; color:#374151;">
                Regards,<br /><strong>Cluvik DocFlow</strong>
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:18px 40px 34px 40px;" class="mobile-padding">
              <div style="height:1px; background-color:#e5e7eb; margin-bottom:18px;"></div>
              <p style="margin:0 0 8px 0; font-family:Arial, Helvetica, sans-serif; font-size:12px; line-height:20px; color:#6b7280;">
                This email was sent regarding <strong>{{{{document_name}}}}</strong> for {{{{recipient_email}}}}.
              </p>
              <p style="margin:0 0 8px 0; font-family:Arial, Helvetica, sans-serif; font-size:12px; line-height:20px; color:#6b7280;">
                Sent via Cluvik DocFlow on behalf of {{{{company_name}}}}.
              </p>
              <p style="margin:0 0 8px 0; font-family:Arial, Helvetica, sans-serif; font-size:12px; line-height:20px; color:#9ca3af;">
                If you were not expecting this document, you can safely ignore this message or contact the sender directly.
              </p>
              <p style="margin:0; font-family:Arial, Helvetica, sans-serif; font-size:11px; line-height:18px; color:#9ca3af;">
                &copy; 2026 Cluvik. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>'''


DEFAULT_TEMPLATES = {
    "signer_notification": {
        "name": "Signer Notification",
        "subject": "Action Required: Please sign {{document_name}}",
        "body_html": _build_professional_template(
            heading="Please review and sign your document",
            sub_text="<strong>{{sender_name}}</strong> from <strong>{{company_name}}</strong> has sent you a document for review and signature through <strong>Cluvik DocFlow</strong>.",
            cta_text="Review &amp; Sign Document",
            cta_link_var="{{signing_link}}",
        ),
        "template_type": "signer_notification",
    },
    "approver_notification": {
        "name": "Approver Notification",
        "subject": "Approval Required: {{document_name}}",
        "body_html": _build_professional_template(
            heading="Please review and approve the document",
            sub_text="<strong>{{sender_name}}</strong> from <strong>{{company_name}}</strong> has sent you a document that requires your approval through <strong>Cluvik DocFlow</strong>.",
            cta_text="Review &amp; Approve",
            cta_link_var="{{signing_link}}",
        ),
        "template_type": "approver_notification",
    },
    "reviewer_notification": {
        "name": "Reviewer Notification",
        "subject": "Review Required: {{document_name}}",
        "body_html": _build_professional_template(
            heading="Please review the document",
            sub_text="<strong>{{sender_name}}</strong> from <strong>{{company_name}}</strong> has sent you a document for your review through <strong>Cluvik DocFlow</strong>.",
            cta_text="Review Document",
            cta_link_var="{{signing_link}}",
        ),
        "template_type": "reviewer_notification",
    },
    "package_send": {
        "name": "Package Send Notification",
        "subject": "{{sender_name}} sent you {{package_name}}",
        "body_html": _build_professional_template(
            heading="A document package has been sent to you",
            sub_text="<strong>{{sender_name}}</strong> from <strong>{{company_name}}</strong> has sent you a document package for your action through <strong>Cluvik DocFlow</strong>.",
            cta_text="Open Package",
            cta_link_var="{{signing_link}}",
        ),
        "template_type": "package_send",
    },
    "document_signed": {
        "name": "Document Signed Confirmation",
        "subject": "{{document_name}} has been signed",
        "body_html": _build_professional_template(
            heading="Your document has been signed",
            sub_text="<strong>{{document_name}}</strong> has been successfully signed. You can download the completed document using the link below.",
            cta_text="Download Signed Document",
            cta_link_var="{{download_link}}",
        ),
        "template_type": "document_signed",
    },
    "reminder": {
        "name": "Signing Reminder",
        "subject": "Reminder: Please sign {{document_name}}",
        "body_html": _build_professional_template(
            heading="Reminder: Your signature is still needed",
            sub_text="This is a friendly reminder that <strong>{{document_name}}</strong> is still waiting for your signature. Please complete the signing process at your earliest convenience.",
            cta_text="Sign Now",
            cta_link_var="{{signing_link}}",
        ),
        "template_type": "reminder",
    },
}


class EmailTemplateService:
    def __init__(self, db):
        self.db = db
        self.collection = db.docflow_email_templates

    async def ensure_defaults(self, tenant_id: str):
        """Create or update default templates for a tenant."""
        for ttype, tdata in DEFAULT_TEMPLATES.items():
            exists = await self.collection.find_one(
                {"tenant_id": tenant_id, "template_type": ttype, "is_default": True, "is_system": True}
            )
            if not exists:
                await self.collection.insert_one({
                    "id": str(uuid.uuid4()),
                    "tenant_id": tenant_id,
                    "name": tdata["name"],
                    "subject": tdata["subject"],
                    "body_html": tdata["body_html"],
                    "template_type": tdata["template_type"],
                    "is_default": True,
                    "is_system": True,
                    "created_at": datetime.now(timezone.utc).isoformat(),
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                })
            else:
                # Update existing system defaults to latest HTML design
                if exists.get("body_html") != tdata["body_html"]:
                    await self.collection.update_one(
                        {"tenant_id": tenant_id, "template_type": ttype, "is_default": True, "is_system": True},
                        {"$set": {
                            "subject": tdata["subject"],
                            "body_html": tdata["body_html"],
                            "updated_at": datetime.now(timezone.utc).isoformat(),
                        }}
                    )

    async def list_templates(self, tenant_id: str) -> List[dict]:
        """List all email templates for a tenant."""
        await self.ensure_defaults(tenant_id)
        cursor = self.collection.find(
            {"tenant_id": tenant_id},
            {"_id": 0}
        ).sort("template_type", 1)
        return await cursor.to_list(length=100)

    async def get_template(self, template_id: str, tenant_id: str) -> Optional[dict]:
        return await self.collection.find_one(
            {"id": template_id, "tenant_id": tenant_id},
            {"_id": 0}
        )

    async def create_template(self, data: dict, tenant_id: str) -> dict:
        now = datetime.now(timezone.utc).isoformat()
        template = {
            "id": str(uuid.uuid4()),
            "tenant_id": tenant_id,
            "name": data.get("name", "Custom Template"),
            "subject": data.get("subject", ""),
            "body_html": data.get("body_html", ""),
            "template_type": data.get("template_type", "signer_notification"),
            "is_default": False,
            "is_system": False,
            "created_at": now,
            "updated_at": now,
        }
        await self.collection.insert_one(template)
        template.pop("_id", None)
        return template

    async def update_template(self, template_id: str, data: dict, tenant_id: str) -> Optional[dict]:
        now = datetime.now(timezone.utc).isoformat()
        update_data = {"updated_at": now}
        for field in ("name", "subject", "body_html", "template_type"):
            if field in data:
                update_data[field] = data[field]

        result = await self.collection.update_one(
            {"id": template_id, "tenant_id": tenant_id},
            {"$set": update_data}
        )
        if result.modified_count:
            return await self.get_template(template_id, tenant_id)
        return None

    async def delete_template(self, template_id: str, tenant_id: str) -> bool:
        tmpl = await self.get_template(template_id, tenant_id)
        if not tmpl:
            return False
        if tmpl.get("is_system") and tmpl.get("is_default"):
            return False  # Can't delete system defaults
        result = await self.collection.delete_one({"id": template_id, "tenant_id": tenant_id})
        return result.deleted_count > 0

    async def clone_template(self, template_id: str, tenant_id: str) -> Optional[dict]:
        source = await self.get_template(template_id, tenant_id)
        if not source:
            return None
        now = datetime.now(timezone.utc).isoformat()
        clone = {
            **source,
            "id": str(uuid.uuid4()),
            "name": f"{source['name']} (Copy)",
            "is_default": False,
            "is_system": False,
            "created_at": now,
            "updated_at": now,
        }
        clone.pop("_id", None)
        await self.collection.insert_one(clone)
        clone.pop("_id", None)
        return clone

    async def set_default(self, template_id: str, tenant_id: str) -> bool:
        tmpl = await self.get_template(template_id, tenant_id)
        if not tmpl:
            return False
        ttype = tmpl.get("template_type")
        # Unset current default for this type
        await self.collection.update_many(
            {"tenant_id": tenant_id, "template_type": ttype, "is_default": True},
            {"$set": {"is_default": False}}
        )
        # Set new default
        await self.collection.update_one(
            {"id": template_id, "tenant_id": tenant_id},
            {"$set": {"is_default": True}}
        )
        return True

    async def get_default_for_type(self, template_type: str, tenant_id: str) -> Optional[dict]:
        await self.ensure_defaults(tenant_id)
        return await self.collection.find_one(
            {"tenant_id": tenant_id, "template_type": template_type, "is_default": True},
            {"_id": 0}
        )

    def get_available_variables(self):
        return AVAILABLE_VARIABLES

    def render_template(self, body_html: str, variables: Dict[str, str]) -> str:
        """Replace variables in template with actual values."""
        rendered = body_html
        for key, value in variables.items():
            placeholder = f"{{{{{key}}}}}" if not key.startswith("{{") else key
            rendered = rendered.replace(placeholder, str(value or ""))
        return rendered

    async def resolve_for_sending(
        self,
        tenant_id: str,
        role_type: str,
        email_template_id: Optional[str] = None,
    ) -> Optional[Dict[str, str]]:
        """
        Resolve the email template to use when sending notifications.
        Priority: explicit email_template_id > tenant default for role type > None (use system fallback).
        Returns {"subject": ..., "body_html": ...} or None.
        """
        # Map role_type to template_type
        role_to_type = {
            "SIGN": "signer_notification",
            "APPROVE_REJECT": "approver_notification",
            "REVIEWER": "reviewer_notification",
            "VIEW_ONLY": "reviewer_notification",
            "RECEIVE_COPY": "document_signed",
        }

        # 1. Try explicit template
        if email_template_id:
            tmpl = await self.get_template(email_template_id, tenant_id)
            if tmpl:
                return {"subject": tmpl["subject"], "body_html": tmpl["body_html"]}

        # 2. Try tenant default for this role type
        template_type = role_to_type.get(role_type, "signer_notification")
        default_tmpl = await self.get_default_for_type(template_type, tenant_id)
        if default_tmpl:
            return {"subject": default_tmpl["subject"], "body_html": default_tmpl["body_html"]}

        return None
