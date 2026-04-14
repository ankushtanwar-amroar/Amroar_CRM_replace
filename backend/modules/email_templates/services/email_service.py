import smtplib
import os
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.base import MIMEBase
from email import encoders
from typing import Optional
import logging
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)


class EmailService:
    def __init__(self):
        self.smtp_host = os.environ.get('SMTP_HOST', 'smtp.gmail.com')
        self.smtp_port = int(os.environ.get('SMTP_PORT', 587))
        self.smtp_user = os.environ.get('SMTP_USER')
        self.smtp_password = os.environ.get('SMTP_PASSWORD')
        self.from_email = os.environ.get('FROM_EMAIL')
        self.from_name = os.environ.get('FROM_NAME', 'CRM System')
    
    async def send_email(
        self,
        to_email: str,
        subject: str,
        html_content: str = "",
        plain_text_content: str = "",
        to_name: Optional[str] = None,
        reply_to: Optional[str] = None
    ) -> dict:
        """Send an email using Gmail SMTP with multipart/alternative"""
        try:
            # Create message
            msg = MIMEMultipart('alternative')
            msg['Subject'] = subject
            msg['From'] = f"{self.from_name} <{self.from_email}>"
            msg['To'] = f"{to_name} <{to_email}>" if to_name else to_email
            
            if reply_to:
                msg['Reply-To'] = reply_to
            
            # Auto-generate plain text if not provided
            if html_content and not plain_text_content:
                plain_text_content = self._html_to_plain_text(html_content)
            
            # Attach plain text first (email clients prefer the last part)
            if plain_text_content:
                part1 = MIMEText(plain_text_content, 'plain', 'utf-8')
                msg.attach(part1)
            
            # Attach HTML
            if html_content:
                part2 = MIMEText(html_content, 'html', 'utf-8')
                msg.attach(part2)
            
            # Connect and send
            with smtplib.SMTP(self.smtp_host, self.smtp_port) as server:
                server.starttls()
                server.login(self.smtp_user, self.smtp_password)
                server.sendmail(self.from_email, to_email, msg.as_string())
            
            logger.info(f"Email sent successfully to {to_email}")
            return {"success": True, "message": "Email sent successfully"}
            
        except Exception as e:
            logger.error(f"Failed to send email: {str(e)}")
            return {"success": False, "message": str(e)}
    
    def _html_to_plain_text(self, html: str) -> str:
        """Convert HTML to plain text for fallback"""
        import re
        
        # Remove style and script tags
        text = re.sub(r'<style[^>]*>.*?</style>', '', html, flags=re.DOTALL | re.IGNORECASE)
        text = re.sub(r'<script[^>]*>.*?</script>', '', text, flags=re.DOTALL | re.IGNORECASE)
        
        # Replace common HTML elements
        text = re.sub(r'<br\s*/?>', '\n', text, flags=re.IGNORECASE)
        text = re.sub(r'</p>', '\n\n', text, flags=re.IGNORECASE)
        text = re.sub(r'</div>', '\n', text, flags=re.IGNORECASE)
        text = re.sub(r'</h[1-6]>', '\n\n', text, flags=re.IGNORECASE)
        text = re.sub(r'</li>', '\n', text, flags=re.IGNORECASE)
        text = re.sub(r'<li[^>]*>', '• ', text, flags=re.IGNORECASE)
        
        # Extract href from links
        text = re.sub(r'<a[^>]*href=["\']([^"\']*)["\'][^>]*>([^<]*)</a>', r'\2 (\1)', text, flags=re.IGNORECASE)
        
        # Remove all remaining HTML tags
        text = re.sub(r'<[^>]+>', '', text)
        
        # Decode HTML entities
        import html
        text = html.unescape(text)
        
        # Clean up whitespace
        text = re.sub(r'\n\s*\n\s*\n', '\n\n', text)
        text = text.strip()
        
        return text


email_service = EmailService()
