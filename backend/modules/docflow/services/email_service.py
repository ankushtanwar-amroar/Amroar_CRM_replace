"""
Email Delivery Service for DocFlow
Integrates with SendGrid for sending documents
"""
import os
from typing import Optional, List
import sendgrid
from sendgrid.helpers.mail import Mail, Email, To, Content, Attachment, FileContent, FileName, FileType, Disposition
import base64


class EmailService:
    def __init__(self):
        self.sendgrid_key = os.environ.get("SENDGRID_API_KEY")
        self.sg = sendgrid.SendGridAPIClient(api_key=self.sendgrid_key) if self.sendgrid_key else None
    
    async def send_document_email(
        self,
        recipient_email: str,
        recipient_name: str,
        template_name: str,
        document_url: str,
        pdf_content: Optional[bytes] = None,
        sender_name: str = "DocFlow"
    ) -> bool:
        """
        Send document via email with link or attachment
        """
        if not self.sg:
            print("SendGrid not configured, skipping email")
            return False
        
        try:
            # Build email
            from_email = Email("noreply@docflow.com", sender_name)
            to_email = To(recipient_email, recipient_name)
            subject = f"Your {template_name} is ready to review and sign"
            
            html_content = f"""
            <html>
            <body style="font-family: Arial, sans-serif;">
                <h2>Document Ready for Review</h2>
                <p>Hello {recipient_name},</p>
                <p>Your {template_name} document is ready for your review and signature.</p>
                <p><a href="{document_url}" style="background: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">View & Sign Document</a></p>
                <p>This link will expire in 30 days.</p>
                <p>Best regards,<br>{sender_name}</p>
            </body>
            </html>
            """
            
            mail = Mail(
                from_email=from_email,
                to_emails=to_email,
                subject=subject,
                html_content=html_content
            )
            
            # Attach PDF if provided
            if pdf_content:
                encoded_file = base64.b64encode(pdf_content).decode()
                attachment = Attachment(
                    FileContent(encoded_file),
                    FileName(f"{template_name}.pdf"),
                    FileType("application/pdf"),
                    Disposition("attachment")
                )
                mail.attachment = attachment
            
            # Send
            response = self.sg.send(mail)
            return response.status_code == 202
        
        except Exception as e:
            print(f"Error sending email: {e}")
            return False
