"""
System Email Service - Email Sending for DocFlow
Supports SendGrid (primary) and SMTP (fallback)
"""
import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
from email import encoders
from typing import Optional, Dict, Any
import base64
import logging
import httpx

logger = logging.getLogger(__name__)

# SendGrid configuration (primary)
SENDGRID_API_KEY = os.environ.get("SENDGRID_API_KEY")
SENDGRID_SENDER_EMAIL = os.environ.get("SENDGRID_SENDER_EMAIL", "noreply@docflow.com")

# System email configuration (fallback)
SYSTEM_EMAIL = os.environ.get("SYSTEM_EMAIL", "ankush.t@amroar.com")
SYSTEM_EMAIL_PASSWORD = os.environ.get("SYSTEM_EMAIL_PASSWORD", "")
SMTP_HOST = "smtp.gmail.com"
SMTP_PORT = 587


class SystemEmailService:
    def __init__(self):
        # SendGrid config
        self.sendgrid_api_key = SENDGRID_API_KEY
        self.sendgrid_sender = SENDGRID_SENDER_EMAIL
        
        # SMTP fallback config
        self.smtp_host = SMTP_HOST
        self.smtp_port = SMTP_PORT
        self.smtp_username = SYSTEM_EMAIL
        self.smtp_password = SYSTEM_EMAIL_PASSWORD
        self.from_email = SYSTEM_EMAIL
        self.from_name = "DocFlow CRM"
    
    async def send_document_email(
        self,
        recipient_email: str,
        recipient_name: str,
        template_name: str,
        document_url: str,
        pdf_content: Optional[bytes] = None,
        sender_name: str = "DocFlow",
        expires_in_days: Optional[int] = None,
        subject_template: Optional[str] = None,
        html_body_template: Optional[str] = None,
        sender_company: str = "Cluvik",
        document_reference_id: str = "",
        message_from_sender: str = "",
        support_email: str = "support@cluvik.com",
        support_url: str = "https://cluvik.com/support",
    ) -> Dict[str, Any]:
        """
        Send document via email - tries SendGrid first, then SMTP fallback
        """
        import datetime
        
        if expires_in_days is None:
            expires_in_days = 30
        
        # Calculate expiration date
        expiration_date = (datetime.datetime.now() + datetime.timedelta(days=expires_in_days)).strftime("%B %d, %Y")
        current_year = datetime.datetime.now().year
        
        # Generate reference ID if not provided
        if not document_reference_id:
            import uuid
            document_reference_id = f"DOC-{str(uuid.uuid4())[:8].upper()}"

        tokens = {
            "{{recipient_name}}": recipient_name,
            "{recipient_name}": recipient_name,
            "{{recipient_email}}": recipient_email,
            "{recipient_email}": recipient_email,
            "{{document_name}}": template_name,
            "{document_name}": template_name,
            "{{sender_name}}": sender_name,
            "{sender_name}": sender_name,
            "{{sender_company}}": sender_company,
            "{sender_company}": sender_company,
            "{{public_link}}": document_url,
            "{public_link}": document_url,
            "{{secure_document_url}}": document_url,
            "{secure_document_url}": document_url,
            "{{expires_in_days}}": str(expires_in_days),
            "{expires_in_days}": str(expires_in_days),
            "{{expiration_date}}": expiration_date,
            "{expiration_date}": expiration_date,
            "{{document_reference_id}}": document_reference_id,
            "{document_reference_id}": document_reference_id,
            "{{message_from_sender}}": message_from_sender,
            "{message_from_sender}": message_from_sender,
            "{{support_email}}": support_email,
            "{support_email}": support_email,
            "{{support_url}}": support_url,
            "{support_url}": support_url,
            "{{current_year}}": str(current_year),
            "{current_year}": str(current_year),
        }

        def render_with_tokens(s: str) -> str:
            if not s:
                return s
            rendered = s
            for k, v in tokens.items():
                rendered = rendered.replace(k, v if v is not None else "")
            # Handle conditional blocks for message_from_sender
            if not message_from_sender:
                import re
                rendered = re.sub(r'\{\{#if message_from_sender\}\}.*?\{\{/if\}\}', '', rendered, flags=re.DOTALL)
            else:
                rendered = rendered.replace('{{#if message_from_sender}}', '').replace('{{/if}}', '')
            return rendered

        # Build email content (merge-token aware)
        subject = render_with_tokens(
            subject_template
            or f"Action Required: Review and Sign {template_name}"
        )

        html_body = render_with_tokens(
            html_body_template
            or self._get_document_email_template()
        )
        
        # Try SendGrid first
        if self.sendgrid_api_key:
            result = await self._send_via_sendgrid(
                recipient_email, recipient_name, subject, html_body, pdf_content, template_name
            )
            if result.get("success"):
                return result
            logger.warning(f"SendGrid failed, trying SMTP fallback: {result.get('error')}")
        
        # Fallback to SMTP
        return await self._send_via_smtp(
            recipient_email, recipient_name, subject, html_body, pdf_content, template_name, document_url, sender_name
        )

    def _get_document_email_template(self) -> str:
        """Get the professional Cluvik DocFlow email template"""
        return '''<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="x-ua-compatible" content="ie=edge" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="format-detection" content="telephone=no, date=no, address=no, email=no, url=no" />
  <title>Action Required: Review and Sign Your Document</title>
  <style>
    body, table, td, a {
      -webkit-text-size-adjust: 100%;
      -ms-text-size-adjust: 100%;
    }
    table, td {
      mso-table-lspace: 0pt;
      mso-table-rspace: 0pt;
    }
    img {
      -ms-interpolation-mode: bicubic;
      border: 0;
      outline: none;
      text-decoration: none;
    }
    table {
      border-collapse: collapse !important;
    }
    body {
      margin: 0 !important;
      padding: 0 !important;
      width: 100% !important;
      height: 100% !important;
      background-color: #f4f7fb;
    }
    a {
      text-decoration: none;
    }
    @media screen and (max-width: 640px) {
      .container {
        width: 100% !important;
      }
      .mobile-padding {
        padding-left: 20px !important;
        padding-right: 20px !important;
      }
      .mobile-stack {
        display: block !important;
        width: 100% !important;
      }
      .button {
        width: 100% !important;
      }
    }
  </style>
</head>
<body style="margin:0; padding:0; background-color:#f4f7fb;">
  <div style="display:none; max-height:0; overflow:hidden; opacity:0; mso-hide:all; font-size:1px; line-height:1px; color:#f4f7fb;">
    {{recipient_name}}, {{sender_name}} has requested your signature on {{document_name}}.
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f7fb;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="640" cellpadding="0" cellspacing="0" border="0" class="container" style="width:640px; max-width:640px; background-color:#ffffff; border-radius:18px; overflow:hidden; box-shadow:0 8px 30px rgba(17,24,39,0.06);">
          <tr>
            <td style="background:linear-gradient(135deg, #5b4bff 0%, #7b6dff 100%); padding:28px 32px;" class="mobile-padding">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="left" class="mobile-stack" style="vertical-align:middle;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="vertical-align:middle;">
                          <div style="display:inline-block; background-color:rgba(255,255,255,0.16); border:1px solid rgba(255,255,255,0.22); border-radius:12px; padding:10px 14px;">
                            <span style="font-family:Arial, Helvetica, sans-serif; font-size:22px; line-height:22px; font-weight:700; color:#ffffff; letter-spacing:0.2px;">
                              Cluvik
                            </span>
                          </div>
                        </td>
                      </tr>
                    </table>
                  </td>
                  <td align="right" class="mobile-stack" style="vertical-align:middle; font-family:Arial, Helvetica, sans-serif; color:#e9e7ff; font-size:13px; line-height:20px;">
                    DocFlow Secure Delivery
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:36px 40px 18px 40px;" class="mobile-padding">
              <p style="margin:0 0 12px 0; font-family:Arial, Helvetica, sans-serif; font-size:15px; line-height:24px; color:#4b5563;">
                Hello {{recipient_name}},
              </p>
              <h1 style="margin:0 0 14px 0; font-family:Arial, Helvetica, sans-serif; font-size:28px; line-height:36px; color:#111827; font-weight:700;">
                Please review and sign your document
              </h1>
              <p style="margin:0 0 22px 0; font-family:Arial, Helvetica, sans-serif; font-size:16px; line-height:26px; color:#374151;">
                <strong>{{sender_name}}</strong> from <strong>{{sender_company}}</strong> has sent you a document for review and signature through <strong>Cluvik DocFlow</strong>.
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e5e7eb; border-radius:14px; background-color:#fafbff; margin-bottom:24px;">
                <tr>
                  <td style="padding:20px 22px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="padding-bottom:10px; font-family:Arial, Helvetica, sans-serif; font-size:13px; line-height:20px; color:#6b7280;">
                          Document
                        </td>
                      </tr>
                      <tr>
                        <td style="padding-bottom:18px; font-family:Arial, Helvetica, sans-serif; font-size:18px; line-height:28px; color:#111827; font-weight:700;">
                          {{document_name}}
                        </td>
                      </tr>
                      <tr>
                        <td>
                          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                            <tr>
                              <td width="50%" style="padding:0 10px 10px 0; vertical-align:top;">
                                <div style="font-family:Arial, Helvetica, sans-serif; font-size:12px; line-height:18px; color:#6b7280;">Requested by</div>
                                <div style="font-family:Arial, Helvetica, sans-serif; font-size:14px; line-height:22px; color:#111827; font-weight:600;">{{sender_name}}</div>
                              </td>
                              <td width="50%" style="padding:0 0 10px 10px; vertical-align:top;">
                                <div style="font-family:Arial, Helvetica, sans-serif; font-size:12px; line-height:18px; color:#6b7280;">Recipient</div>
                                <div style="font-family:Arial, Helvetica, sans-serif; font-size:14px; line-height:22px; color:#111827; font-weight:600;">{{recipient_email}}</div>
                              </td>
                            </tr>
                            <tr>
                              <td width="50%" style="padding:0 10px 0 0; vertical-align:top;">
                                <div style="font-family:Arial, Helvetica, sans-serif; font-size:12px; line-height:18px; color:#6b7280;">Reference ID</div>
                                <div style="font-family:Arial, Helvetica, sans-serif; font-size:14px; line-height:22px; color:#111827; font-weight:600;">{{document_reference_id}}</div>
                              </td>
                              <td width="50%" style="padding:0 0 0 10px; vertical-align:top;">
                                <div style="font-family:Arial, Helvetica, sans-serif; font-size:12px; line-height:18px; color:#6b7280;">Expires on</div>
                                <div style="font-family:Arial, Helvetica, sans-serif; font-size:14px; line-height:22px; color:#111827; font-weight:600;">{{expiration_date}}</div>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                      {{#if message_from_sender}}
                      <tr>
                        <td style="padding-top:18px;">
                          <div style="font-family:Arial, Helvetica, sans-serif; font-size:12px; line-height:18px; color:#6b7280; margin-bottom:6px;">
                            Message from sender
                          </div>
                          <div style="font-family:Arial, Helvetica, sans-serif; font-size:14px; line-height:24px; color:#374151; background-color:#ffffff; border:1px solid #e5e7eb; border-radius:10px; padding:14px 16px;">
                            {{message_from_sender}}
                          </div>
                        </td>
                      </tr>
                      {{/if}}
                    </table>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 24px 0; font-family:Arial, Helvetica, sans-serif; font-size:15px; line-height:25px; color:#374151;">
                To continue, click the button below. Your secure session will open the document directly and guide you through the required actions.
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:18px;">
                <tr>
                  <td align="center" bgcolor="#5b4bff" style="border-radius:12px;">
                    <a href="{{secure_document_url}}" target="_blank" class="button" style="display:inline-block; padding:16px 28px; font-family:Arial, Helvetica, sans-serif; font-size:16px; line-height:20px; font-weight:700; color:#ffffff; background-color:#5b4bff; border-radius:12px;">
                      Review &amp; Sign Document
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 26px 0; font-family:Arial, Helvetica, sans-serif; font-size:13px; line-height:22px; color:#6b7280;">
                Button not working? Copy and paste this secure link into your browser:<br />
                <a href="{{secure_document_url}}" target="_blank" style="color:#5b4bff; word-break:break-all;">{{secure_document_url}}</a>
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f8fafc; border:1px solid #e5e7eb; border-radius:12px; margin-bottom:22px;">
                <tr>
                  <td style="padding:16px 18px; font-family:Arial, Helvetica, sans-serif; font-size:13px; line-height:21px; color:#4b5563;">
                    <strong style="color:#111827;">Security notice:</strong>
                    This link is intended for <strong>{{recipient_email}}</strong> and may be tied to your active session, token, or verification step. Please do not forward this email unless sharing is intended by the sender.
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 10px 0; font-family:Arial, Helvetica, sans-serif; font-size:14px; line-height:24px; color:#374151;">
                Need help accessing the document?
              </p>
              <p style="margin:0 0 26px 0; font-family:Arial, Helvetica, sans-serif; font-size:14px; line-height:24px; color:#374151;">
                Contact us at <a href="mailto:{{support_email}}" style="color:#5b4bff;">{{support_email}}</a> or visit <a href="{{support_url}}" target="_blank" style="color:#5b4bff;">{{support_url}}</a>.
              </p>
              <p style="margin:0; font-family:Arial, Helvetica, sans-serif; font-size:14px; line-height:24px; color:#374151;">
                Regards,<br />
                <strong>Cluvik DocFlow</strong>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 40px 34px 40px;" class="mobile-padding">
              <div style="height:1px; background-color:#e5e7eb; margin-bottom:18px;"></div>
              <p style="margin:0 0 8px 0; font-family:Arial, Helvetica, sans-serif; font-size:12px; line-height:20px; color:#6b7280;">
                This email was sent regarding <strong>{{document_name}}</strong> for {{recipient_email}}.
              </p>
              <p style="margin:0 0 8px 0; font-family:Arial, Helvetica, sans-serif; font-size:12px; line-height:20px; color:#6b7280;">
                Sent via Cluvik DocFlow on behalf of {{sender_company}}.
              </p>
              <p style="margin:0 0 8px 0; font-family:Arial, Helvetica, sans-serif; font-size:12px; line-height:20px; color:#9ca3af;">
                If you were not expecting this document, you can safely ignore this message or contact the sender directly.
              </p>
              <p style="margin:0; font-family:Arial, Helvetica, sans-serif; font-size:11px; line-height:18px; color:#9ca3af;">
                © {{current_year}} Cluvik. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>'''

    async def send_otp_email(
        self,
        recipient_email: str,
        recipient_name: str,
        otp_code: str,
        template_name: str
    ) -> Dict[str, Any]:
        """
        Send verification OTP to recipient
        """
        subject = f"Verification Code for {template_name}"
        html_body = f"""
        <html>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: #4F46E5; padding: 20px; text-align: center;">
                <h2 style="color: white; margin: 0;">Verification Code</h2>
            </div>
            <div style="padding: 30px; background: white; border: 1px solid #eee;">
                <p>Hello {recipient_name},</p>
                <p>Please use the following verification code to access and sign the document <strong>{template_name}</strong>:</p>
                <div style="text-align: center; margin: 30px 0;">
                    <span style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #4F46E5; 
                                 background: #EEF2FF; padding: 10px 20px; border-radius: 8px;">
                        {otp_code}
                    </span>
                </div>
                <p style="color: #666; font-size: 14px;">This code will expire in 10 minutes.</p>
                <p style="color: #999; font-size: 12px; margin-top: 30px;">
                    If you did not request this code, please ignore this email.
                </p>
            </div>
        </body>
        </html>
        """
        
        # Try SendGrid first
        if self.sendgrid_api_key:
            result = await self._send_via_sendgrid(
                recipient_email, recipient_name, subject, html_body, None, template_name
            )
            if result.get("success"):
                return result
        
        # Fallback to SMTP
        return await self._send_via_smtp(
            recipient_email, recipient_name, subject, html_body, None, template_name, "", "DocFlow"
        )
    

    async def send_generic_email(
        self,
        to_email: str,
        subject: str,
        html_content: str,
    ) -> Dict[str, Any]:
        """Send a generic HTML email. Tries SendGrid first, falls back to SMTP."""
        try:
            result = await self._send_via_sendgrid(to_email, "", subject, html_content, None, "")
            if result.get("success"):
                return result
        except Exception:
            pass
        return await self._send_via_smtp(to_email, "", subject, html_content, None, "", "", "DocFlow")

    async def _send_via_sendgrid(
        self, 
        recipient_email: str,
        recipient_name: str,
        subject: str,
        html_body: str,
        pdf_content: Optional[bytes],
        template_name: str
    ) -> Dict[str, Any]:
        """Send email using SendGrid API"""
        try:
            logger.info(f"Sending document email via SendGrid to {recipient_email}")
            
            # Build SendGrid payload
            payload = {
                "personalizations": [{
                    "to": [{"email": recipient_email, "name": recipient_name}],
                    "subject": subject
                }],
                "from": {"email": self.sendgrid_sender, "name": self.from_name},
                "content": [{"type": "text/html", "value": html_body}]
            }
            
            # Add attachment if provided
            if pdf_content:
                payload["attachments"] = [{
                    "content": base64.b64encode(pdf_content).decode(),
                    "filename": f"{template_name}.pdf",
                    "type": "application/pdf"
                }]
            
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    "https://api.sendgrid.com/v3/mail/send",
                    headers={
                        "Authorization": f"Bearer {self.sendgrid_api_key}",
                        "Content-Type": "application/json"
                    },
                    json=payload,
                    timeout=30.0
                )
            
            if response.status_code in [200, 202]:
                logger.info(f"Email sent successfully via SendGrid to {recipient_email}")
                return {
                    "success": True,
                    "message": "Email sent successfully via SendGrid",
                    "email_log": {
                        "to": recipient_email,
                        "to_name": recipient_name,
                        "subject": subject,
                        "status": "sent",
                        "method": "sendgrid"
                    }
                }
            else:
                logger.error(f"SendGrid error: {response.status_code} - {response.text}")
                return {
                    "success": False,
                    "error": f"SendGrid error: {response.status_code}",
                    "details": response.text
                }
                
        except Exception as e:
            logger.error(f"SendGrid sending error: {str(e)}")
            return {
                "success": False,
                "error": str(e)
            }
    
    async def _send_via_smtp(
        self,
        recipient_email: str,
        recipient_name: str,
        subject: str,
        html_body: str,
        pdf_content: Optional[bytes],
        template_name: str,
        document_url: str,
        sender_name: str
    ) -> Dict[str, Any]:
        """Send email using SMTP (fallback)"""
        try:
            logger.info(f"Sending document email via SMTP to {recipient_email}")
            
            # Create MIME message
            message = MIMEMultipart('alternative')
            message['From'] = f"{self.from_name} <{self.from_email}>"
            message['To'] = recipient_email
            message['Subject'] = subject
            
            # Attach HTML body
            html_part = MIMEText(html_body, 'html')
            message.attach(html_part)
            
            # Attach PDF if provided
            if pdf_content:
                pdf_part = MIMEBase('application', 'pdf')
                pdf_part.set_payload(pdf_content)
                encoders.encode_base64(pdf_part)
                pdf_part.add_header(
                    'Content-Disposition',
                    f'attachment; filename="{template_name}.pdf"'
                )
                message.attach(pdf_part)
            
            # Send email via SMTP
            logger.info(f"Connecting to SMTP server {self.smtp_host}:{self.smtp_port}")
            
            with smtplib.SMTP(self.smtp_host, self.smtp_port) as server:
                server.starttls()
                server.login(self.smtp_username, self.smtp_password)
                server.send_message(message)
            
            logger.info(f"Email sent successfully via SMTP to {recipient_email}")
            
            return {
                "success": True,
                "message": "Email sent successfully via SMTP",
                "email_log": {
                    "to": recipient_email,
                    "to_name": recipient_name,
                    "subject": subject,
                    "document_url": document_url,
                    "has_attachment": pdf_content is not None,
                    "status": "sent",
                    "method": "smtp"
                }
            }
            
        except smtplib.SMTPAuthenticationError as e:
            logger.error(f"SMTP Authentication Error: {str(e)}")
            return {
                "success": False,
                "error": "Email authentication failed",
                "details": str(e)
            }
        except smtplib.SMTPException as e:
            logger.error(f"SMTP Error: {str(e)}")
            return {
                "success": False,
                "error": "Failed to send email",
                "details": str(e)
            }
        except Exception as e:
            logger.error(f"Email sending error: {str(e)}")
            return {
                "success": False,
                "error": str(e)
            }
