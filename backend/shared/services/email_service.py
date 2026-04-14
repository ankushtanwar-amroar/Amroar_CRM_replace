"""
Email Service - SendGrid and SMTP Integration
Handles all transactional email sending for the CRM platform.

Supported email types:
- Tenant admin welcome emails
- Password reset emails  
- User invitation emails
- Billing notifications

Configuration (SendGrid):
- SENDGRID_API_KEY: SendGrid API key
- SENDGRID_SENDER_EMAIL: Verified sender email address

Configuration (SMTP):
- SMTP_HOST: SMTP server hostname
- SMTP_PORT: SMTP server port
- SMTP_USER: SMTP username
- SMTP_PASSWORD: SMTP password
- FROM_EMAIL: Sender email address
- FROM_NAME: Sender display name

Priority: SendGrid > SMTP > Mock (development)
"""
import os
import logging
import smtplib
import ssl
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List

logger = logging.getLogger(__name__)

# SendGrid Configuration
SENDGRID_API_KEY = os.environ.get("SENDGRID_API_KEY")
SENDGRID_SENDER_EMAIL = os.environ.get("SENDGRID_SENDER_EMAIL", "noreply@crm.example.com")
SENDGRID_SENDER_NAME = os.environ.get("SENDGRID_SENDER_NAME", "CRM Platform")

# SMTP Configuration
SMTP_HOST = os.environ.get("SMTP_HOST")
SMTP_PORT = int(os.environ.get("SMTP_PORT", "587"))
SMTP_USER = os.environ.get("SMTP_USER")
SMTP_PASSWORD = os.environ.get("SMTP_PASSWORD")
FROM_EMAIL = os.environ.get("FROM_EMAIL", os.environ.get("SMTP_USER", "noreply@crm.example.com"))
FROM_NAME = os.environ.get("FROM_NAME", "CRM Platform")
APP_NAME = os.environ.get("APP_NAME", FROM_NAME)

# Email Provider Priority
EMAIL_PROVIDER = os.environ.get("EMAIL_PROVIDER", "auto")  # 'sendgrid', 'smtp', 'auto', or 'mock'

CRM_BASE_URL = os.environ.get("CRM_BASE_URL", os.environ.get("BACKEND_URL", "https://app.crm.com"))


class EmailDeliveryError(Exception):
    """Raised when email delivery fails"""
    pass


class EmailService:
    """
    Email service for sending transactional emails via SendGrid or SMTP.
    Falls back to logging if neither is configured (for development).
    
    Priority: SendGrid > SMTP > Mock
    """
    
    def __init__(self, db=None):
        self.db = db
        self.base_url = CRM_BASE_URL
        self.provider = None
        self.sendgrid_client = None
        self.smtp_config = None
        
        # Initialize email providers based on configuration
        self._initialize_providers()
    
    def _initialize_providers(self):
        """Initialize available email providers"""
        # Force specific provider if configured
        if EMAIL_PROVIDER == 'sendgrid' and SENDGRID_API_KEY:
            try:
                from sendgrid import SendGridAPIClient
                self.sendgrid_client = SendGridAPIClient(SENDGRID_API_KEY)
                self.provider = 'sendgrid'
                logger.info("Email service initialized with SendGrid (forced)")
                return
            except Exception as e:
                logger.warning(f"Failed to initialize SendGrid: {e}")
        
        if EMAIL_PROVIDER == 'smtp' and SMTP_HOST and SMTP_USER and SMTP_PASSWORD:
            self.smtp_config = {
                'host': SMTP_HOST,
                'port': SMTP_PORT,
                'user': SMTP_USER,
                'password': SMTP_PASSWORD,
                'from_email': FROM_EMAIL,
                'from_name': FROM_NAME
            }
            self.provider = 'smtp'
            logger.info("Email service initialized with SMTP (forced)")
            return
        
        # Auto mode - try SMTP first (more reliable), then SendGrid
        if EMAIL_PROVIDER == 'auto':
            # Try SMTP first
            if SMTP_HOST and SMTP_USER and SMTP_PASSWORD:
                self.smtp_config = {
                    'host': SMTP_HOST,
                    'port': SMTP_PORT,
                    'user': SMTP_USER,
                    'password': SMTP_PASSWORD,
                    'from_email': FROM_EMAIL,
                    'from_name': FROM_NAME
                }
                self.provider = 'smtp'
                logger.info(f"Email service initialized with SMTP ({SMTP_HOST}:{SMTP_PORT})")
                return
            
            # Then try SendGrid
            if SENDGRID_API_KEY:
                try:
                    from sendgrid import SendGridAPIClient
                    self.sendgrid_client = SendGridAPIClient(SENDGRID_API_KEY)
                    self.provider = 'sendgrid'
                    logger.info("Email service initialized with SendGrid")
                    return
                except Exception as e:
                    logger.warning(f"Failed to initialize SendGrid: {e}")
        
        # No provider available - mock mode
        self.provider = 'mock'
        logger.warning("No email provider configured - emails will be logged only")
    
    async def send_email(
        self,
        to_email: str,
        subject: str,
        html_content: str,
        plain_text: Optional[str] = None,
        email_type: str = "general",
        metadata: Optional[Dict] = None,
        cc: Optional[List[str]] = None,
        bcc: Optional[List[str]] = None,
        attachments: Optional[List[Dict]] = None,
        from_name: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Send an email via the configured provider (SendGrid or SMTP).
        
        Args:
            to_email: Recipient email address
            subject: Email subject line
            html_content: HTML email body
            plain_text: Plain text fallback (optional)
            email_type: Type of email for logging
            metadata: Additional metadata to store with log
            cc: CC recipients list
            bcc: BCC recipients list
            attachments: List of attachment dicts with 'filename', 'content', 'type'
            from_name: Override sender display name (defaults to APP_NAME)
        
        Returns:
            Dict with status and details
        """
        result = {
            "to": to_email,
            "subject": subject,
            "type": email_type,
            "status": "pending",
            "provider": self.provider,
            "sent_at": datetime.now(timezone.utc),
            "metadata": metadata or {}
        }
        
        try:
            if self.provider == 'sendgrid':
                result = await self._send_via_sendgrid(
                    to_email, subject, html_content, plain_text, 
                    result, cc, bcc, attachments, from_name=from_name
                )
            elif self.provider == 'smtp':
                result = await self._send_via_smtp(
                    to_email, subject, html_content, plain_text,
                    result, cc, bcc, attachments, from_name=from_name
                )
            else:
                # Mock mode - just log
                result["status"] = "mocked"
                logger.info(f"[MOCKED EMAIL] To: {to_email}, Subject: {subject}")
                
        except Exception as e:
            result["status"] = "failed"
            result["error"] = str(e)
            logger.error(f"Email delivery failed to {to_email}: {e}")
        
        # Log to database if available
        if self.db is not None:
            await self._log_email(result, html_content)
        
        return result
    
    async def _send_via_sendgrid(
        self,
        to_email: str,
        subject: str,
        html_content: str,
        plain_text: Optional[str],
        result: Dict,
        cc: Optional[List[str]] = None,
        bcc: Optional[List[str]] = None,
        attachments: Optional[List[Dict]] = None,
        from_name: Optional[str] = None
    ) -> Dict:
        """Send email via SendGrid"""
        from sendgrid.helpers.mail import Mail, Email, To, Content, HtmlContent, Cc, Bcc, Attachment
        import base64
        
        sender_name = from_name or APP_NAME or SENDGRID_SENDER_NAME
        
        message = Mail(
            from_email=Email(SENDGRID_SENDER_EMAIL, sender_name),
            to_emails=To(to_email),
            subject=subject,
            html_content=HtmlContent(html_content)
        )
        
        if plain_text:
            message.add_content(Content("text/plain", plain_text))
        
        if cc:
            for cc_email in cc:
                message.add_cc(Cc(cc_email))
        
        if bcc:
            for bcc_email in bcc:
                message.add_bcc(Bcc(bcc_email))
        
        if attachments:
            for att in attachments:
                attachment = Attachment()
                attachment.file_content = base64.b64encode(att['content']).decode() if isinstance(att['content'], bytes) else att['content']
                attachment.file_name = att.get('filename', 'attachment')
                attachment.file_type = att.get('type', 'application/octet-stream')
                attachment.disposition = 'attachment'
                message.add_attachment(attachment)
        
        response = self.sendgrid_client.send(message)
        
        if response.status_code in [200, 202]:
            result["status"] = "sent"
            result["provider_response"] = {
                "status_code": response.status_code,
                "message_id": response.headers.get("X-Message-Id")
            }
            logger.info(f"Email sent via SendGrid to {to_email}: {subject}")
        else:
            result["status"] = "failed"
            result["error"] = f"SendGrid returned status {response.status_code}"
            logger.error(f"SendGrid failed for {to_email}: status {response.status_code}")
        
        return result
    
    async def _send_via_smtp(
        self,
        to_email: str,
        subject: str,
        html_content: str,
        plain_text: Optional[str],
        result: Dict,
        cc: Optional[List[str]] = None,
        bcc: Optional[List[str]] = None,
        attachments: Optional[List[Dict]] = None,
        from_name: Optional[str] = None
    ) -> Dict:
        """Send email via SMTP"""
        from email.mime.base import MIMEBase
        from email import encoders
        
        sender_name = from_name or APP_NAME or self.smtp_config['from_name']
        
        # Create message
        msg = MIMEMultipart('alternative')
        msg['Subject'] = subject
        msg['From'] = f"{sender_name} <{self.smtp_config['from_email']}>"
        msg['To'] = to_email
        
        if cc:
            msg['Cc'] = ', '.join(cc)
        
        # Add plain text if available
        if plain_text:
            part1 = MIMEText(plain_text, 'plain', 'utf-8')
            msg.attach(part1)
        
        # Add HTML content
        part2 = MIMEText(html_content, 'html', 'utf-8')
        msg.attach(part2)
        
        # Add attachments
        if attachments:
            for att in attachments:
                part = MIMEBase('application', 'octet-stream')
                content = att['content'] if isinstance(att['content'], bytes) else att['content'].encode()
                part.set_payload(content)
                encoders.encode_base64(part)
                part.add_header(
                    'Content-Disposition',
                    f'attachment; filename="{att.get("filename", "attachment")}"'
                )
                msg.attach(part)
        
        # Build recipient list
        recipients = [to_email]
        if cc:
            recipients.extend(cc)
        if bcc:
            recipients.extend(bcc)
        
        # Send via SMTP
        context = ssl.create_default_context()
        
        with smtplib.SMTP(self.smtp_config['host'], self.smtp_config['port']) as server:
            server.ehlo()
            server.starttls(context=context)
            server.ehlo()
            server.login(self.smtp_config['user'], self.smtp_config['password'])
            server.sendmail(
                self.smtp_config['from_email'],
                recipients,
                msg.as_string()
            )
        
        result["status"] = "sent"
        result["provider_response"] = {
            "smtp_host": self.smtp_config['host'],
            "recipients": recipients
        }
        logger.info(f"Email sent via SMTP to {to_email}: {subject}")
        
        return result
    
    async def _log_email(self, email_data: Dict, html_content: str = None):
        """Store email record in database for audit/tracking"""
        try:
            import uuid
            log_entry = {
                "id": str(uuid.uuid4()),
                "to": email_data["to"],
                "subject": email_data["subject"],
                "type": email_data["type"],
                "status": email_data["status"],
                "provider": email_data.get("provider"),
                "sent_at": email_data["sent_at"],
                "metadata": email_data.get("metadata", {}),
                "error": email_data.get("error"),
                "provider_response": email_data.get("provider_response"),
                "created_at": datetime.now(timezone.utc)
            }
            # Store HTML content for ALL emails (for verification/debugging)
            if html_content:
                log_entry["html_content"] = html_content
            
            await self.db.email_logs.insert_one(log_entry)
        except Exception as e:
            logger.warning(f"Failed to log email: {e}")
    
    def get_provider_status(self) -> Dict[str, Any]:
        """Get current email provider status"""
        return {
            "provider": self.provider,
            "sendgrid_configured": bool(SENDGRID_API_KEY),
            "smtp_configured": bool(SMTP_HOST and SMTP_USER and SMTP_PASSWORD),
            "smtp_host": SMTP_HOST,
            "from_email": FROM_EMAIL if self.provider == 'smtp' else SENDGRID_SENDER_EMAIL
        }
    
    # =========================================================================
    # TENANT ADMIN WELCOME EMAIL
    # =========================================================================
    
    async def send_tenant_admin_welcome(
        self,
        to_email: str,
        first_name: str,
        tenant_name: str,
        reset_token: str,
        is_docflow: bool = False
    ) -> Dict[str, Any]:
        """
        Send welcome email to new tenant administrator.
        Uses DocFlow-specific template when is_docflow=True.
        
        Args:
            to_email: Admin email address
            first_name: Admin's first name
            tenant_name: Organization name
            reset_token: Password reset token
            is_docflow: Whether this is a DocFlow-only tenant
        """
        password_reset_url = f"{self.base_url}/reset-password?token={reset_token}"
        login_url = f"{self.base_url}/login"

        if is_docflow:
            return await self._send_docflow_welcome(
                to_email, first_name, tenant_name,
                password_reset_url, login_url
            )

        subject = f"Welcome to {tenant_name} - Set Up Your Account"
        
        html_content = f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 28px;">Welcome to {tenant_name}!</h1>
    </div>
    
    <div style="background: #fff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
        <p style="font-size: 16px;">Hello {first_name},</p>
        
        <p style="font-size: 16px;">Your organization <strong>{tenant_name}</strong> has been set up in the CRM platform.</p>
        
        <p style="font-size: 16px;">As the <strong>Tenant Administrator</strong>, you have full access to:</p>
        <ul style="font-size: 15px; color: #555;">
            <li>Create and manage users</li>
            <li>Assign licenses and permissions</li>
            <li>Configure CRM settings</li>
            <li>Access all modules based on your plan</li>
        </ul>
        
        <div style="text-align: center; margin: 30px 0;">
            <a href="{password_reset_url}" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 14px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block; font-size: 16px;">Set Your Password</a>
        </div>
        
        <p style="font-size: 14px; color: #666;">This link will expire in <strong>72 hours</strong>.</p>
        
        <hr style="border: none; border-top: 1px solid #eee; margin: 25px 0;">
        
        <p style="font-size: 14px; color: #666;">Once your password is set, you can log in at:</p>
        <p style="font-size: 14px;"><a href="{login_url}" style="color: #667eea;">{login_url}</a></p>
        
        <hr style="border: none; border-top: 1px solid #eee; margin: 25px 0;">
        
        <p style="font-size: 13px; color: #888;">If you didn't request this email, please contact support immediately.</p>
    </div>
    
    <div style="text-align: center; padding: 20px; font-size: 12px; color: #888;">
        <p>&copy; {datetime.now().year} {tenant_name}. All rights reserved.</p>
    </div>
</body>
</html>
"""
        
        plain_text = f"""
Hello {first_name},

Welcome to {tenant_name}! Your organization has been set up in the CRM platform.

As the Tenant Administrator, you have full access to create users, assign licenses, 
and configure settings.

To get started, please set your password by visiting:
{password_reset_url}

This link will expire in 72 hours.

Once your password is set, you can log in at:
{login_url}

If you didn't request this email, please contact support immediately.

- {tenant_name} Team
"""
        
        return await self.send_email(
            to_email=to_email,
            subject=subject,
            html_content=html_content,
            plain_text=plain_text,
            email_type="tenant_admin_welcome",
            metadata={
                "tenant_name": tenant_name,
                "password_reset_token": reset_token[:8] + "..."  # Truncated for security
            },
            from_name=tenant_name
        )

    async def _send_docflow_welcome(
        self,
        to_email: str,
        first_name: str,
        tenant_name: str,
        password_reset_url: str,
        login_url: str
    ) -> Dict[str, Any]:
        """DocFlow-specific welcome email for tenant administrators."""
        subject = "Welcome to Cluvic Docuflow - Set Up Your Account"

        html_content = f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background: linear-gradient(135deg, #0ea5e9 0%, #2563eb 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 28px;">Welcome to Cluvic Docuflow!</h1>
    </div>

    <div style="background: #fff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
        <p style="font-size: 16px;">Hi {first_name},</p>

        <p style="font-size: 16px;">Welcome to Cluvic Docuflow!</p>

        <p style="font-size: 16px;">Your organization, <strong>{tenant_name}</strong>, has been successfully set up on our platform.</p>

        <p style="font-size: 16px;">As the <strong>Tenant Administrator</strong>, you will have full access to:</p>
        <ul style="font-size: 15px; color: #555;">
            <li>Create and manage users</li>
            <li>Create and manage templates</li>
            <li>Upload documents</li>
            <li>Generate and send documents for e-signatures</li>
            <li>Manage system integrations and connections</li>
            <li>Access all platform functionalities</li>
        </ul>

        <p style="font-size: 16px;">To get started, please set up your password using the link below:</p>

        <div style="text-align: center; margin: 30px 0;">
            <a href="{password_reset_url}" style="background: linear-gradient(135deg, #0ea5e9 0%, #2563eb 100%); color: white; padding: 14px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block; font-size: 16px;">Set Your Password</a>
        </div>

        <p style="font-size: 14px; color: #666;"><strong>Note:</strong> This link will expire in <strong>48 hours</strong>.</p>

        <hr style="border: none; border-top: 1px solid #eee; margin: 25px 0;">

        <p style="font-size: 14px; color: #666;">Once your password is set, you can log in at:</p>
        <p style="font-size: 14px;"><a href="{login_url}" style="color: #2563eb;">{login_url}</a></p>

        <hr style="border: none; border-top: 1px solid #eee; margin: 25px 0;">

        <p style="font-size: 14px; color: #555;">Looking forward to helping you streamline your document workflows!</p>

        <p style="font-size: 13px; color: #888;">If you didn't request this email, please contact support immediately.</p>
    </div>

    <div style="text-align: center; padding: 20px; font-size: 12px; color: #888;">
        <p>&copy; {datetime.now().year} Cluvic Docuflow. All rights reserved.</p>
    </div>
</body>
</html>
"""

        plain_text = f"""
Hi {first_name},

Welcome to Cluvic Docuflow!

Your organization, {tenant_name}, has been successfully set up on our platform.

As the Tenant Administrator, you will have full access to:
- Create and manage users
- Create and manage templates
- Upload documents
- Generate and send documents for e-signatures
- Manage system integrations and connections
- Access all platform functionalities

To get started, please set up your password by visiting:
{password_reset_url}

Note: This link will expire in 48 hours.

Once your password is set, you can log in at:
{login_url}

Looking forward to helping you streamline your document workflows!

If you didn't request this email, please contact support immediately.

- Cluvic Docuflow Team
"""

        return await self.send_email(
            to_email=to_email,
            subject=subject,
            html_content=html_content,
            plain_text=plain_text,
            email_type="docflow_admin_welcome",
            metadata={
                "tenant_name": tenant_name,
            },
            from_name="Cluvic Docuflow"
        )
    
    # =========================================================================
    # PASSWORD RESET EMAIL
    # =========================================================================
    
    async def send_password_reset(
        self,
        to_email: str,
        first_name: str,
        reset_token: str,
        expires_hours: int = 24
    ) -> Dict[str, Any]:
        """
        Send password reset email.
        
        Args:
            to_email: User email address
            first_name: User's first name
            reset_token: Password reset token
            expires_hours: Hours until token expires
        """
        reset_url = f"{self.base_url}/reset-password?token={reset_token}"
        
        subject = "Reset Your Password"
        
        html_content = f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background: #f8f9fa; padding: 30px; border-radius: 10px; text-align: center;">
        <h1 style="color: #333; margin: 0 0 10px 0; font-size: 24px;">Password Reset Request</h1>
    </div>
    
    <div style="padding: 30px 20px;">
        <p style="font-size: 16px;">Hello {first_name},</p>
        
        <p style="font-size: 16px;">We received a request to reset your password. Click the button below to create a new password:</p>
        
        <div style="text-align: center; margin: 30px 0;">
            <a href="{reset_url}" style="background: #4f46e5; color: white; padding: 14px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block; font-size: 16px;">Reset Password</a>
        </div>
        
        <p style="font-size: 14px; color: #666;">This link will expire in <strong>{expires_hours} hours</strong>.</p>
        
        <p style="font-size: 14px; color: #666;">If you didn't request a password reset, you can safely ignore this email. Your password will not be changed.</p>
        
        <hr style="border: none; border-top: 1px solid #eee; margin: 25px 0;">
        
        <p style="font-size: 12px; color: #888;">For security, this link can only be used once.</p>
    </div>
</body>
</html>
"""
        
        plain_text = f"""
Hello {first_name},

We received a request to reset your password. To create a new password, visit:
{reset_url}

This link will expire in {expires_hours} hours.

If you didn't request a password reset, you can safely ignore this email.

- CRM Platform Team
"""
        
        return await self.send_email(
            to_email=to_email,
            subject=subject,
            html_content=html_content,
            plain_text=plain_text,
            email_type="password_reset",
            metadata={"expires_hours": expires_hours}
        )
    
    # =========================================================================
    # USER INVITATION EMAIL
    # =========================================================================
    
    async def send_user_invitation(
        self,
        to_email: str,
        first_name: str,
        inviter_name: str,
        tenant_name: str,
        invite_token: str,
        role_name: str = "User"
    ) -> Dict[str, Any]:
        """
        Send invitation email to new user.
        
        Args:
            to_email: Invited user email
            first_name: Invited user's first name
            inviter_name: Name of person sending invite
            tenant_name: Organization name
            invite_token: Invitation token
            role_name: Role being assigned
        """
        invite_url = f"{self.base_url}/accept-invite?token={invite_token}"
        
        subject = f"You've been invited to join {tenant_name}"
        
        html_content = f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background: linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 24px;">You're Invited!</h1>
    </div>
    
    <div style="background: #fff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
        <p style="font-size: 16px;">Hello {first_name},</p>
        
        <p style="font-size: 16px;"><strong>{inviter_name}</strong> has invited you to join <strong>{tenant_name}</strong> on the CRM platform.</p>
        
        <p style="font-size: 15px; background: #f0f9ff; padding: 12px; border-radius: 6px; border-left: 4px solid #3b82f6;">
            <strong>Your Role:</strong> {role_name}
        </p>
        
        <div style="text-align: center; margin: 30px 0;">
            <a href="{invite_url}" style="background: linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%); color: white; padding: 14px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block; font-size: 16px;">Accept Invitation</a>
        </div>
        
        <p style="font-size: 14px; color: #666;">This invitation will expire in <strong>7 days</strong>.</p>
        
        <hr style="border: none; border-top: 1px solid #eee; margin: 25px 0;">
        
        <p style="font-size: 13px; color: #888;">If you weren't expecting this invitation, please contact the sender.</p>
    </div>
</body>
</html>
"""
        
        plain_text = f"""
Hello {first_name},

{inviter_name} has invited you to join {tenant_name} on the CRM platform.

Your Role: {role_name}

To accept this invitation, visit:
{invite_url}

This invitation will expire in 7 days.

If you weren't expecting this invitation, please contact the sender.

- CRM Platform Team
"""
        
        return await self.send_email(
            to_email=to_email,
            subject=subject,
            html_content=html_content,
            plain_text=plain_text,
            email_type="user_invitation",
            metadata={
                "inviter_name": inviter_name,
                "tenant_name": tenant_name,
                "role_name": role_name
            },
            from_name=tenant_name
        )


# Singleton instance
_email_service = None


def get_email_service(db=None):
    """Get or create the email service instance"""
    global _email_service
    if _email_service is None:
        _email_service = EmailService(db)
    return _email_service
