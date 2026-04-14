"""
Phase 1: Email Service
Handles sending invitation and password reset emails.
Supports both SMTP and SendGrid.
Falls back to logging if neither is configured (dev mode).
"""
import os
import smtplib
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

# Email configuration from environment variables
# SMTP Configuration
SMTP_HOST = os.environ.get('SMTP_HOST')
SMTP_PORT = int(os.environ.get('SMTP_PORT', '587'))
# Support both SMTP_USERNAME and SMTP_USER for backward compatibility
SMTP_USERNAME = os.environ.get('SMTP_USERNAME') or os.environ.get('SMTP_USER')
SMTP_PASSWORD = os.environ.get('SMTP_PASSWORD')
SMTP_FROM_ADDRESS = os.environ.get('SMTP_FROM_ADDRESS', 'noreply@crm.example.com')
SMTP_FROM_NAME = os.environ.get('SMTP_FROM_NAME', 'CRM Team')

# SendGrid Configuration
SENDGRID_API_KEY = os.environ.get('SENDGRID_API_KEY')
SENDGRID_SENDER_EMAIL = os.environ.get('SENDGRID_SENDER_EMAIL', SMTP_FROM_ADDRESS)
SENDGRID_SENDER_NAME = os.environ.get('SENDGRID_SENDER_NAME', SMTP_FROM_NAME)

# Frontend URL for links
# For email links, we need the frontend URL (without /api)
# In Emergent/deployed environments, use the public URL from frontend .env
# In local dev, use localhost:3000
FRONTEND_ENV_URL = os.environ.get('FRONTEND_URL')  # Dedicated env var if exists
BACKEND_ENV_URL = os.environ.get('BACKEND_URL', 'http://localhost:8001')

if FRONTEND_ENV_URL:
    # Use explicit frontend URL if provided
    FRONTEND_URL = FRONTEND_ENV_URL
elif BACKEND_ENV_URL and 'emergentagent.com' in BACKEND_ENV_URL:
    # For Emergent deployments, strip /api suffix from backend URL
    FRONTEND_URL = BACKEND_ENV_URL.replace('/api', '')
elif BACKEND_ENV_URL and BACKEND_ENV_URL.endswith('/api'):
    # Generic case: remove /api suffix
    FRONTEND_URL = BACKEND_ENV_URL[:-4]
else:
    # Development fallback
    FRONTEND_URL = 'http://localhost:3000'

logger.info(f"Frontend URL for emails: {FRONTEND_URL}")

# Check which email service is configured
SMTP_CONFIGURED = all([SMTP_HOST, SMTP_USERNAME, SMTP_PASSWORD])
SENDGRID_CONFIGURED = SENDGRID_API_KEY is not None

# Log configuration status
if SENDGRID_CONFIGURED:
    logger.info("✅ SendGrid configured - emails will be sent via SendGrid")
    EMAIL_PROVIDER = "sendgrid"
elif SMTP_CONFIGURED:
    logger.info(f"✅ SMTP configured - emails will be sent via {SMTP_HOST}")
    EMAIL_PROVIDER = "smtp"
else:
    logger.warning("⚠️  No email service configured - emails will be logged to console only")
    EMAIL_PROVIDER = "mock"

# Template directory
TEMPLATE_DIR = Path(__file__).parent.parent / 'templates'


def load_template(template_name: str) -> str:
    """Load an email template from the templates directory."""
    template_path = TEMPLATE_DIR / template_name
    if not template_path.exists():
        raise FileNotFoundError(f"Email template not found: {template_name}")
    
    with open(template_path, 'r', encoding='utf-8') as f:
        return f.read()


def send_email(
    to_email: str,
    subject: str,
    html_content: str,
    from_email: Optional[str] = None,
    from_name: Optional[str] = None
) -> bool:
    """
    Send an email. Uses SendGrid if configured, falls back to SMTP, then logging.
    
    Args:
        to_email: Recipient email address
        subject: Email subject
        html_content: HTML content of the email
        from_email: Sender email (defaults to configured sender)
        from_name: Sender name (defaults to configured sender name)
    
    Returns:
        True if sent successfully, False otherwise
    """
    from_email = from_email or SENDGRID_SENDER_EMAIL or SMTP_FROM_ADDRESS
    from_name = from_name or SENDGRID_SENDER_NAME or SMTP_FROM_NAME
    
    # Try SendGrid first
    if SENDGRID_CONFIGURED:
        try:
            from sendgrid import SendGridAPIClient
            from sendgrid.helpers.mail import Mail, Email, To, HtmlContent as SGHtmlContent
            
            message = Mail(
                from_email=Email(from_email, from_name),
                to_emails=To(to_email),
                subject=subject,
                html_content=SGHtmlContent(html_content)
            )
            
            sg = SendGridAPIClient(SENDGRID_API_KEY)
            response = sg.send(message)
            
            if response.status_code in [200, 202]:
                logger.info(f"✅ Email sent via SendGrid to {to_email}")
                return True
            else:
                logger.error(f"❌ SendGrid returned status {response.status_code} — falling back to SMTP")
                
        except Exception as e:
            logger.error(f"❌ SendGrid error: {str(e)} — falling back to SMTP")
    
    # Fall back to SMTP (also used when SendGrid fails)
    if SMTP_CONFIGURED:
        try:
            # For SMTP (especially Gmail), use the authenticated email as sender
            smtp_from = SMTP_USERNAME if SMTP_USERNAME else from_email
            msg = MIMEMultipart('alternative')
            msg['Subject'] = subject
            msg['From'] = f"{from_name} <{smtp_from}>"
            msg['To'] = to_email
            
            html_part = MIMEText(html_content, 'html')
            msg.attach(html_part)
            
            with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
                server.starttls()
                server.login(SMTP_USERNAME, SMTP_PASSWORD)
                server.send_message(msg)
            
            logger.info(f"✅ Email sent via SMTP to {to_email}")
            return True
            
        except Exception as e:
            logger.error(f"❌ SMTP error: {str(e)}")
            return False
    
    # Development mode: Log email instead of sending
    logger.info("=" * 80)
    logger.info("📧 EMAIL (DEV MODE - NOT SENT)")
    logger.info(f"To: {to_email}")
    logger.info(f"From: {from_name} <{from_email}>")
    logger.info(f"Subject: {subject}")
    logger.info("-" * 80)
    logger.info(html_content)
    logger.info("=" * 80)
    return True


def send_invitation_email(
    email: str,
    first_name: str,
    token: str,
    company_name: str,
    inviter_name: str,
    is_docflow: bool = False
) -> bool:
    """
    Send an invitation email to a new user.
    Uses DocFlow-specific template when is_docflow=True.
    """
    accept_url = f"{FRONTEND_URL}/accept-invite/{token}"

    if is_docflow:
        return _send_docflow_invite(email, first_name, company_name, accept_url, inviter_name)

    template = load_template('email_invite.html')
    html_content = template.replace('{{first_name}}', first_name)
    html_content = html_content.replace('{{inviter_name}}', inviter_name)
    html_content = html_content.replace('{{company_name}}', company_name)
    html_content = html_content.replace('{{accept_url}}', accept_url)
    
    subject = f"You've been invited to join {company_name}"
    
    return send_email(email, subject, html_content)


def _send_docflow_invite(
    email: str,
    first_name: str,
    company_name: str,
    accept_url: str,
    inviter_name: str = ""
) -> bool:
    """DocFlow-specific invitation email for invited users."""

    html_content = f"""
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background: linear-gradient(135deg, #0ea5e9 0%, #2563eb 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 28px;">You're Invited to Cluvic Docuflow</h1>
    </div>
    <div style="background: #fff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
        <p style="font-size: 16px;">Hi {first_name},</p>
        <p style="font-size: 16px;"><strong>{inviter_name}</strong> has invited you to join <strong>{company_name}</strong>'s DocFlow workspace.</p>
        <p style="font-size: 16px;">Click the button below to set your password and get started:</p>
        <div style="text-align: center; margin: 30px 0;">
            <a href="{accept_url}" style="background: linear-gradient(135deg, #0ea5e9 0%, #2563eb 100%); color: white; padding: 14px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block; font-size: 16px;">Accept Invitation</a>
        </div>
        <p style="font-size: 14px; color: #666;">Or copy and paste this link into your browser:</p>
        <p style="font-size: 13px; word-break: break-all;"><a href="{accept_url}" style="color: #2563eb;">{accept_url}</a></p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 25px 0;">
        <p style="font-size: 14px; color: #666;">This invitation expires in <strong>7 days</strong>.</p>
        <p style="font-size: 13px; color: #888;">If you didn't expect this invitation, you can safely ignore this email.</p>
    </div>
    <div style="text-align: center; padding: 20px; font-size: 12px; color: #888;">
        <p>{company_name} DocFlow Team</p>
    </div>
</body>
</html>
"""

    subject = f"You've been invited to join {company_name} on DocFlow"
    return send_email(email, subject, html_content, from_name="DocFlow Team")


def send_reset_password_email(
    email: str,
    first_name: str,
    token: str,
    company_name: str
) -> bool:
    """
    Send a password reset email.
    
    Args:
        email: User's email address
        first_name: User's first name
        token: Password reset token
        company_name: Name of the company/tenant
    
    Returns:
        True if sent successfully
    """
    reset_url = f"{FRONTEND_URL}/reset-password/{token}"
    app_name = f"{company_name} CRM"
    
    template = load_template('email_reset_password.html')
    html_content = template.replace('{{first_name}}', first_name)
    html_content = html_content.replace('{{app_name}}', app_name)
    html_content = html_content.replace('{{company_name}}', company_name)
    html_content = html_content.replace('{{reset_url}}', reset_url)
    
    subject = f"Reset your password for {app_name}"
    
    return send_email(email, subject, html_content)
