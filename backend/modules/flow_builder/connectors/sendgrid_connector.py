"""
SendGrid Email Connector
Sends emails using SendGrid API
"""
import os
import logging
from typing import Dict, Any
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail, Email, To, Content
from motor.motor_asyncio import AsyncIOMotorDatabase

logger = logging.getLogger(__name__)


class SendGridConnector:
    """SendGrid email connector for flow builder"""
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.api_key = os.getenv("SENDGRID_API_KEY")
        self.sender_email = os.getenv("SENDGRID_SENDER_EMAIL", "mohit.sh0801@gmail.com")
        
        if not self.api_key:
            logger.warning("SENDGRID_API_KEY not found in environment")
    
    async def execute(self, config: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
        """Execute email sending"""
        
        # Get email parameters from config and context
        to_email = config.get("to") or config.get("to_email") or context.get("email")
        subject = config.get("subject", "Notification")
        body = config.get("body", "")
        
        # Apply variable substitution to all fields including recipient email
        to_email = self._substitute_variables(str(to_email), context) if to_email else None
        subject = self._substitute_variables(subject, context)
        body = self._substitute_variables(body, context)
        
        if not to_email:
            raise ValueError("No recipient email provided")
        
        try:
            # Create SendGrid client
            sg = SendGridAPIClient(self.api_key)
            
            # Create email message
            message = Mail(
                from_email=Email(self.sender_email),
                to_emails=To(to_email),
                subject=subject,
                plain_text_content=Content("text/plain", body)
            )
            
            # Send email
            response = sg.send(message)
            
            logger.info(f"Email sent to {to_email}: status {response.status_code}")
            
            return {
                "connector": "sendgrid",
                "action": "send_email",
                "to_email": to_email,
                "subject": subject,
                "status_code": response.status_code,
                "success": response.status_code in [200, 201, 202]
            }
            
        except Exception as e:
            logger.error(f"SendGrid error: {str(e)}", exc_info=True)
            raise Exception(f"Failed to send email: {str(e)}")
    
    def _substitute_variables(self, text: str, context: Dict[str, Any]) -> str:
        """Replace {{variable}} placeholders with context values"""
        import re
        
        def replace_var(match):
            var_name = match.group(1).strip()
            return str(context.get(var_name, match.group(0)))
        
        return re.sub(r'\{\{([^}]+)\}\}', replace_var, text)
