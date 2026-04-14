"""
Email API Routes - Send emails, manage drafts
Supports Gmail SMTP for actual email delivery
"""
from fastapi import APIRouter, Depends, HTTPException, File, UploadFile, Form
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
from pydantic import BaseModel
import uuid
import sys
import os
import re
import smtplib
import ssl
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
from email import encoders
import base64

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))))

from config.settings import settings
from server import db
from shared.models import User
from modules.auth.api.auth_routes import get_current_user

router = APIRouter(prefix="/email", tags=["Email"])
logger = logging.getLogger(__name__)

# Email validation regex
EMAIL_REGEX = re.compile(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$')

# Attachment storage directory
ATTACHMENT_STORAGE_DIR = os.path.join(settings.STORAGE_BASE_DIR, "uploads", "email_attachments")
os.makedirs(ATTACHMENT_STORAGE_DIR, exist_ok=True)


def parse_email_list(email_string: str) -> List[str]:
    """
    Parse a comma-separated email string into a clean list.
    Handles trailing commas, extra spaces, and empty values.
    """
    if not email_string:
        return []
    
    # Split by comma, strip whitespace, filter empty strings
    emails = [e.strip() for e in email_string.split(',') if e.strip()]
    return emails


def validate_emails(emails: List[str]) -> tuple[List[str], List[str]]:
    """
    Validate a list of email addresses.
    Returns (valid_emails, invalid_emails)
    """
    valid = []
    invalid = []
    
    for email in emails:
        if EMAIL_REGEX.match(email):
            valid.append(email)
        else:
            invalid.append(email)
    
    return valid, invalid


async def send_email_smtp(
    to_emails: List[str],
    cc_emails: List[str],
    bcc_emails: List[str],
    subject: str,
    body: str,
    attachments: List[Dict] = None,
    sender_email: str = None
) -> Dict[str, Any]:
    """
    Send email using Gmail SMTP.
    Returns success status and message ID or error.
    """
    # Get SMTP credentials from environment
    # Support multiple env var names for flexibility
    smtp_email = os.environ.get('GMAIL_SENDER_EMAIL') or os.environ.get('SMTP_USER') or os.environ.get('SMTP_EMAIL')
    smtp_password = os.environ.get('GMAIL_APP_PASSWORD') or os.environ.get('SMTP_PASSWORD')
    smtp_host = os.environ.get('SMTP_HOST', 'smtp.gmail.com')
    smtp_port = int(os.environ.get('SMTP_PORT', '587'))
    
    if not smtp_email or not smtp_password:
        logger.warning("SMTP credentials not configured, email will be logged but not sent")
        return {
            "success": True,
            "message_id": f"mock-{uuid.uuid4()}",
            "status": "logged",
            "note": "SMTP not configured - email logged but not actually sent"
        }
    
    try:
        # Create message
        msg = MIMEMultipart('mixed')
        msg['From'] = sender_email or smtp_email
        msg['To'] = ', '.join(to_emails)
        if cc_emails:
            msg['Cc'] = ', '.join(cc_emails)
        msg['Subject'] = subject
        
        # Create HTML body
        html_part = MIMEText(body, 'html', 'utf-8')
        msg.attach(html_part)
        
        # Add attachments
        if attachments:
            for att in attachments:
                part = MIMEBase('application', 'octet-stream')
                part.set_payload(att['content'])
                encoders.encode_base64(part)
                part.add_header(
                    'Content-Disposition',
                    f'attachment; filename="{att["filename"]}"'
                )
                msg.attach(part)
        
        # All recipients
        all_recipients = to_emails + cc_emails + bcc_emails
        
        # Connect and send
        context = ssl.create_default_context()
        
        with smtplib.SMTP(smtp_host, smtp_port) as server:
            server.ehlo()
            server.starttls(context=context)
            server.ehlo()
            server.login(smtp_email, smtp_password)
            server.sendmail(smtp_email, all_recipients, msg.as_string())
            
        logger.info(f"Email sent successfully to {all_recipients}")
        return {
            "success": True,
            "message_id": msg.get('Message-ID', f"sent-{uuid.uuid4()}"),
            "status": "sent"
        }
        
    except smtplib.SMTPAuthenticationError as e:
        logger.error(f"SMTP authentication failed: {e}")
        return {
            "success": False,
            "error": "SMTP authentication failed. Check email credentials.",
            "status": "failed"
        }
    except smtplib.SMTPException as e:
        logger.error(f"SMTP error: {e}")
        return {
            "success": False,
            "error": str(e),
            "status": "failed"
        }
    except Exception as e:
        logger.error(f"Error sending email: {e}")
        return {
            "success": False,
            "error": str(e),
            "status": "failed"
        }


class EmailDraftCreate(BaseModel):
    to_email: str
    cc_email: Optional[str] = None
    bcc_email: Optional[str] = None
    subject: Optional[str] = None
    body: Optional[str] = None
    related_record_id: Optional[str] = None
    related_record_type: Optional[str] = None
    related_record_name: Optional[str] = None
    attachments: Optional[List[Dict[str, Any]]] = None  # Store attachment metadata


class EmailDraftUpdate(BaseModel):
    to_email: Optional[str] = None
    cc_email: Optional[str] = None
    bcc_email: Optional[str] = None
    subject: Optional[str] = None
    body: Optional[str] = None
    related_record_id: Optional[str] = None
    related_record_type: Optional[str] = None
    related_record_name: Optional[str] = None
    attachments: Optional[List[Dict[str, Any]]] = None  # Store attachment metadata


@router.post("/drafts")
async def create_email_draft(
    draft: EmailDraftCreate,
    current_user: User = Depends(get_current_user)
) -> Dict[str, Any]:
    """Create a new email draft with optional attachment metadata"""
    draft_id = str(uuid.uuid4())
    
    draft_doc = {
        "id": draft_id,
        "tenant_id": current_user.tenant_id,
        "user_id": current_user.id,
        "to_email": draft.to_email,
        "cc_email": draft.cc_email,
        "bcc_email": draft.bcc_email,
        "subject": draft.subject,
        "body": draft.body,
        "related_record_id": draft.related_record_id,
        "related_record_type": draft.related_record_type,
        "related_record_name": draft.related_record_name,
        "attachments": draft.attachments or [],  # Store attachment metadata
        "status": "draft",
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc)
    }
    
    await db.email_drafts.insert_one(draft_doc)
    
    return {
        "id": draft_id,
        "message": "Draft saved successfully"
    }


@router.put("/drafts/{draft_id}")
async def update_email_draft(
    draft_id: str,
    draft: EmailDraftUpdate,
    current_user: User = Depends(get_current_user)
) -> Dict[str, Any]:
    """Update an existing email draft including attachments"""
    existing = await db.email_drafts.find_one({
        "id": draft_id,
        "user_id": current_user.id,
        "tenant_id": current_user.tenant_id
    })
    
    if not existing:
        raise HTTPException(status_code=404, detail="Draft not found")
    
    # Build update data, including attachments if provided
    update_data = {}
    for k, v in draft.dict().items():
        if v is not None:
            update_data[k] = v
    
    update_data["updated_at"] = datetime.now(timezone.utc)
    
    await db.email_drafts.update_one(
        {"id": draft_id},
        {"$set": update_data}
    )
    
    return {
        "id": draft_id,
        "message": "Draft updated successfully"
    }


@router.get("/drafts")
async def list_email_drafts(
    current_user: User = Depends(get_current_user)
) -> List[Dict[str, Any]]:
    """List all email drafts for the current user"""
    drafts = await db.email_drafts.find({
        "user_id": current_user.id,
        "tenant_id": current_user.tenant_id,
        "status": "draft"
    }, {"_id": 0}).sort("updated_at", -1).to_list(100)
    
    return drafts


@router.get("/drafts/{draft_id}")
async def get_email_draft(
    draft_id: str,
    current_user: User = Depends(get_current_user)
) -> Dict[str, Any]:
    """Get a specific email draft"""
    draft = await db.email_drafts.find_one({
        "id": draft_id,
        "user_id": current_user.id,
        "tenant_id": current_user.tenant_id
    }, {"_id": 0})
    
    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found")
    
    return draft


@router.delete("/drafts/{draft_id}")
async def delete_email_draft(
    draft_id: str,
    current_user: User = Depends(get_current_user)
) -> Dict[str, Any]:
    """Delete an email draft and its attachments"""
    # Get draft to find attachments
    draft = await db.email_drafts.find_one({
        "id": draft_id,
        "user_id": current_user.id,
        "tenant_id": current_user.tenant_id
    })
    
    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found")
    
    # Delete attachment files
    if draft.get("attachments"):
        for att in draft["attachments"]:
            if att.get("storage_path"):
                try:
                    os.remove(att["storage_path"])
                except Exception as e:
                    logger.warning(f"Failed to delete attachment file: {e}")
    
    # Delete draft from database
    await db.email_drafts.delete_one({"id": draft_id})
    
    return {"message": "Draft deleted successfully"}


@router.post("/drafts/{draft_id}/attachments")
async def upload_draft_attachment(
    draft_id: str,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user)
) -> Dict[str, Any]:
    """Upload an attachment file for a draft"""
    # Verify draft exists and belongs to user
    draft = await db.email_drafts.find_one({
        "id": draft_id,
        "user_id": current_user.id,
        "tenant_id": current_user.tenant_id
    })
    
    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found")
    
    # Read file content
    content = await file.read()
    
    # Check file size (10MB limit)
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File exceeds 10MB limit")
    
    # Generate unique filename
    file_id = str(uuid.uuid4())
    file_ext = os.path.splitext(file.filename)[1] if file.filename else ""
    storage_filename = f"{draft_id}_{file_id}{file_ext}"
    storage_path = os.path.join(ATTACHMENT_STORAGE_DIR, storage_filename)
    
    # Save file to disk
    with open(storage_path, "wb") as f:
        f.write(content)
    
    # Create attachment metadata
    attachment = {
        "id": file_id,
        "name": file.filename,
        "size": len(content),
        "type": file.content_type,
        "storage_path": storage_path,
        "uploaded_at": datetime.now(timezone.utc).isoformat()
    }
    
    # Add attachment to draft
    await db.email_drafts.update_one(
        {"id": draft_id},
        {
            "$push": {"attachments": attachment},
            "$set": {"updated_at": datetime.now(timezone.utc)}
        }
    )
    
    logger.info(f"Uploaded attachment {file.filename} for draft {draft_id}")
    
    return {
        "id": file_id,
        "name": file.filename,
        "size": len(content),
        "type": file.content_type,
        "message": "Attachment uploaded successfully"
    }


@router.delete("/drafts/{draft_id}/attachments/{attachment_id}")
async def delete_draft_attachment(
    draft_id: str,
    attachment_id: str,
    current_user: User = Depends(get_current_user)
) -> Dict[str, Any]:
    """Delete an attachment from a draft"""
    # Get draft
    draft = await db.email_drafts.find_one({
        "id": draft_id,
        "user_id": current_user.id,
        "tenant_id": current_user.tenant_id
    })
    
    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found")
    
    # Find attachment
    attachment = None
    for att in draft.get("attachments", []):
        if att.get("id") == attachment_id:
            attachment = att
            break
    
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")
    
    # Delete file from disk
    if attachment.get("storage_path") and os.path.exists(attachment["storage_path"]):
        try:
            os.remove(attachment["storage_path"])
        except Exception as e:
            logger.warning(f"Failed to delete attachment file: {e}")
    
    # Remove attachment from draft
    await db.email_drafts.update_one(
        {"id": draft_id},
        {
            "$pull": {"attachments": {"id": attachment_id}},
            "$set": {"updated_at": datetime.now(timezone.utc)}
        }
    )
    
    return {"message": "Attachment deleted successfully"}


@router.get("/drafts/{draft_id}/attachments/{attachment_id}")
async def download_draft_attachment(
    draft_id: str,
    attachment_id: str,
    current_user: User = Depends(get_current_user)
):
    """Download an attachment file from a draft"""
    from fastapi.responses import FileResponse
    
    # Get draft
    draft = await db.email_drafts.find_one({
        "id": draft_id,
        "user_id": current_user.id,
        "tenant_id": current_user.tenant_id
    })
    
    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found")
    
    # Find attachment
    attachment = None
    for att in draft.get("attachments", []):
        if att.get("id") == attachment_id:
            attachment = att
            break
    
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")
    
    if not attachment.get("storage_path") or not os.path.exists(attachment["storage_path"]):
        raise HTTPException(status_code=404, detail="Attachment file not found")
    
    return FileResponse(
        attachment["storage_path"],
        filename=attachment.get("name", "attachment"),
        media_type=attachment.get("type", "application/octet-stream")
    )


async def create_email_activity(
    tenant_id: str,
    user_id: str,
    email_log: Dict[str, Any]
) -> Optional[str]:
    """Create an activity record for a sent email to show in timeline.
    
    Writes to crm_activities collection for compatibility with Timeline component.
    """
    try:
        if not email_log.get("related_record_id") or not email_log.get("related_record_type"):
            return None
        
        # Create email activity record in crm_activities collection
        activity_id = str(uuid.uuid4())
        
        # Build email description preview
        body_text = email_log.get("body", "")
        # Strip HTML tags for preview
        import re
        body_preview = re.sub(r'<[^>]+>', '', body_text)[:200]
        if len(body_text) > 200:
            body_preview += "..."
        
        activity = {
            "id": activity_id,
            "tenant_id": tenant_id,
            "object_type": email_log.get("related_record_type"),
            "record_id": email_log.get("related_record_id"),
            "type": "email",
            "status": "completed",
            "subject": email_log.get("subject", "(No Subject)"),
            "description": f"To: {email_log.get('to_email')}\n{body_preview}",
            "activity_date": email_log.get("sent_at") or datetime.now(timezone.utc),
            "created_by": user_id,
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
            # Additional email-specific metadata
            "email_data": {
                "to": email_log.get("to_email"),
                "cc": email_log.get("cc_email"),
                "bcc": email_log.get("bcc_email"),
                "email_log_id": email_log.get("id"),
                "attachments_count": len(email_log.get("attachments", [])),
            }
        }
        
        await db.crm_activities.insert_one(activity)
        logger.info(f"Created email activity {activity_id} for record {email_log.get('related_record_id')}")
        
        return activity_id
    except Exception as e:
        logger.error(f"Failed to create email activity: {e}")
        return None


@router.post("/send")
async def send_email(
    to: str = Form(...),
    subject: str = Form(...),
    body: str = Form(...),
    cc: Optional[str] = Form(None),
    bcc: Optional[str] = Form(None),
    related_record_id: Optional[str] = Form(None),
    related_record_type: Optional[str] = Form(None),
    draft_id: Optional[str] = Form(None),
    attachments: List[UploadFile] = File(default=[]),
    current_user: User = Depends(get_current_user)
) -> Dict[str, Any]:
    """
    Send an email with optional attachments.
    
    This endpoint:
    1. Validates and cleans email addresses (handles trailing commas, spaces)
    2. Sends the email via SMTP (Gmail)
    3. Logs the email activity
    4. Deletes the draft if one was used
    """
    
    # Parse and clean email lists (handles trailing commas, extra spaces)
    to_emails = parse_email_list(to)
    cc_emails = parse_email_list(cc) if cc else []
    bcc_emails = parse_email_list(bcc) if bcc else []
    
    # Validate that we have at least one recipient
    if not to_emails:
        raise HTTPException(status_code=400, detail="At least one recipient email is required")
    
    # Validate all email addresses
    all_emails = to_emails + cc_emails + bcc_emails
    valid_emails, invalid_emails = validate_emails(all_emails)
    
    if invalid_emails:
        raise HTTPException(
            status_code=400, 
            detail=f"Invalid email address: {invalid_emails[0]}"
        )
    
    # Process attachments
    attachment_list = []
    for file in attachments:
        content = await file.read()
        if len(content) > 10 * 1024 * 1024:  # 10MB limit per file
            raise HTTPException(
                status_code=400,
                detail=f"Attachment {file.filename} exceeds 10MB limit"
            )
        attachment_list.append({
            "filename": file.filename,
            "content_type": file.content_type,
            "size": len(content),
            "content": content
        })
        logger.info(f"Processing attachment: {file.filename} ({len(content)} bytes)")
    
    # Send email via SMTP
    send_result = await send_email_smtp(
        to_emails=to_emails,
        cc_emails=cc_emails,
        bcc_emails=bcc_emails,
        subject=subject,
        body=body,
        attachments=attachment_list
    )
    
    # Log email activity (without attachment content)
    email_log = {
        "id": str(uuid.uuid4()),
        "tenant_id": current_user.tenant_id,
        "user_id": current_user.id,
        "to_email": ', '.join(to_emails),
        "cc_email": ', '.join(cc_emails) if cc_emails else None,
        "bcc_email": ', '.join(bcc_emails) if bcc_emails else None,
        "subject": subject,
        "body": body,
        "related_record_id": related_record_id,
        "related_record_type": related_record_type,
        "attachments": [{"filename": a["filename"], "size": a["size"]} for a in attachment_list],
        "status": send_result.get("status", "sent"),
        "message_id": send_result.get("message_id"),
        "sent_at": datetime.now(timezone.utc),
        "created_at": datetime.now(timezone.utc)
    }
    
    await db.email_logs.insert_one(email_log)
    
    # Create activity for timeline if linked to a record
    activity_id = None
    if related_record_id and related_record_type:
        activity_id = await create_email_activity(
            current_user.tenant_id,
            current_user.id,
            email_log
        )
    
    # Delete draft if one was used
    if draft_id:
        # Also delete draft attachments from storage
        draft = await db.email_drafts.find_one({"id": draft_id})
        if draft and draft.get("attachments"):
            for att in draft["attachments"]:
                if att.get("storage_path") and os.path.exists(att["storage_path"]):
                    try:
                        os.remove(att["storage_path"])
                    except Exception as e:
                        logger.warning(f"Failed to delete draft attachment: {e}")
        
        await db.email_drafts.delete_one(
            {"id": draft_id, "user_id": current_user.id}
        )
    
    if not send_result.get("success"):
        raise HTTPException(
            status_code=500,
            detail=send_result.get("error", "Failed to send email")
        )
    
    logger.info(f"Email sent: To={to_emails}, CC={cc_emails}, BCC={bcc_emails}, Subject={subject}")
    
    return {
        "success": True,
        "message": "Email sent successfully",
        "email_id": email_log["id"],
        "activity_id": activity_id,
        "message_id": send_result.get("message_id"),
        "recipients": {
            "to": to_emails,
            "cc": cc_emails,
            "bcc": bcc_emails
        },
        "attachments_count": len(attachment_list),
        "note": send_result.get("note")
    }


@router.get("/history")
async def get_email_history(
    related_record_id: Optional[str] = None,
    include_body: bool = False,
    limit: int = 50,
    current_user: User = Depends(get_current_user)
) -> List[Dict[str, Any]]:
    """Get email history, optionally filtered by related record"""
    query = {
        "tenant_id": current_user.tenant_id,
        "user_id": current_user.id
    }
    
    if related_record_id:
        query["related_record_id"] = related_record_id
    
    # Projection - exclude body unless requested
    projection = {"_id": 0}
    if not include_body:
        projection["body"] = 0
    
    emails = await db.email_logs.find(
        query, 
        projection
    ).sort("sent_at", -1).to_list(limit)
    
    return emails


@router.get("/history/{email_id}")
async def get_email_detail(
    email_id: str,
    current_user: User = Depends(get_current_user)
) -> Dict[str, Any]:
    """Get full email details including body"""
    email = await db.email_logs.find_one({
        "id": email_id,
        "tenant_id": current_user.tenant_id,
        "user_id": current_user.id
    }, {"_id": 0})
    
    if not email:
        raise HTTPException(status_code=404, detail="Email not found")
    
    return email


@router.get("/record/{record_type}/{record_id}/emails")
async def get_record_emails(
    record_type: str,
    record_id: str,
    limit: int = 20,
    current_user: User = Depends(get_current_user)
) -> List[Dict[str, Any]]:
    """Get email history for a specific record (for activity timeline)"""
    emails = await db.email_logs.find({
        "tenant_id": current_user.tenant_id,
        "related_record_id": record_id,
        "related_record_type": record_type
    }, {"_id": 0, "body": 0}).sort("sent_at", -1).to_list(limit)
    
    return emails



# ============================================================================
# EMAIL PROVIDER STATUS AND TEST ENDPOINTS
# ============================================================================

class TestEmailRequest(BaseModel):
    """Request to send a test email"""
    to_email: str
    subject: Optional[str] = "Test Email from CRM Platform"
    message: Optional[str] = "This is a test email to verify your email configuration is working correctly."


@router.get("/provider/status")
async def get_email_provider_status(current_user: User = Depends(get_current_user)):
    """
    Get current email provider configuration status.
    Shows which provider is active (SendGrid, SMTP, or Mock).
    """
    from shared.services.email_service import get_email_service
    
    email_service = get_email_service(db)
    status = email_service.get_provider_status()
    
    return {
        "provider": status["provider"],
        "sendgrid": {
            "configured": status["sendgrid_configured"],
            "sender_email": os.environ.get("SENDGRID_SENDER_EMAIL") if status["sendgrid_configured"] else None
        },
        "smtp": {
            "configured": status["smtp_configured"],
            "host": status["smtp_host"],
            "port": os.environ.get("SMTP_PORT"),
            "from_email": os.environ.get("FROM_EMAIL") or os.environ.get("SMTP_USER")
        },
        "active_from_email": status["from_email"],
        "message": f"Emails will be sent via {status['provider'].upper()}"
    }


@router.post("/test/send")
async def send_test_email(
    request: TestEmailRequest,
    current_user: User = Depends(get_current_user)
):
    """
    Send a test email to verify email configuration.
    Uses the active email provider (SendGrid or SMTP).
    """
    from shared.services.email_service import get_email_service
    
    email_service = get_email_service(db)
    
    # Create test email HTML
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 24px;">✓ Email Configuration Test</h1>
        </div>
        
        <div style="background: #fff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
            <p style="font-size: 16px; color: #10b981; font-weight: bold;">Success! Your email is working.</p>
            
            <p style="font-size: 15px;">{request.message}</p>
            
            <hr style="border: none; border-top: 1px solid #eee; margin: 25px 0;">
            
            <p style="font-size: 14px; color: #666;"><strong>Provider:</strong> {email_service.provider.upper()}</p>
            <p style="font-size: 14px; color: #666;"><strong>Sent by:</strong> {current_user.email}</p>
            <p style="font-size: 14px; color: #666;"><strong>Timestamp:</strong> {datetime.now(timezone.utc).isoformat()}</p>
        </div>
        
        <div style="text-align: center; padding: 20px; font-size: 12px; color: #888;">
            <p>CRM Platform - Email Configuration Test</p>
        </div>
    </body>
    </html>
    """
    
    plain_text = f"""
Email Configuration Test - Success!

{request.message}

Provider: {email_service.provider.upper()}
Sent by: {current_user.email}
Timestamp: {datetime.now(timezone.utc).isoformat()}

- CRM Platform
"""
    
    result = await email_service.send_email(
        to_email=request.to_email,
        subject=request.subject,
        html_content=html_content,
        plain_text=plain_text,
        email_type="test_email",
        metadata={
            "sent_by": current_user.email,
            "tenant_id": current_user.tenant_id
        }
    )
    
    if result["status"] == "sent":
        return {
            "success": True,
            "message": f"Test email sent successfully via {email_service.provider.upper()}",
            "to": request.to_email,
            "provider": email_service.provider,
            "provider_response": result.get("provider_response")
        }
    elif result["status"] == "mocked":
        return {
            "success": True,
            "message": "Email logged (no email provider configured)",
            "to": request.to_email,
            "provider": "mock",
            "note": "Configure SendGrid or SMTP credentials to send real emails"
        }
    else:
        raise HTTPException(
            status_code=500,
            detail={
                "error": "Email delivery failed",
                "message": result.get("error", "Unknown error"),
                "provider": email_service.provider
            }
        )
