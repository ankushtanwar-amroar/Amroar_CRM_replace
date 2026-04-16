"""
Email Template API Routes for DocFlow.
CRUD operations + variables listing + default management.
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional

from shared.auth import get_current_user
from shared.models import User
from modules.docflow.services.email_template_service import EmailTemplateService, TEMPLATE_TYPES

import os
from motor.motor_asyncio import AsyncIOMotorClient

mongo_url = os.environ.get("MONGO_URL")
db_name = os.environ.get("DB_NAME", "crm_database")
client = AsyncIOMotorClient(mongo_url)
db = client[db_name]

router = APIRouter(prefix="/docflow/email-templates", tags=["DocFlow Email Templates"])
service = EmailTemplateService(db)


class EmailTemplateCreate(BaseModel):
    name: str
    subject: str = ""
    body_html: str = ""
    template_type: str = "signer_notification"


class EmailTemplateUpdate(BaseModel):
    name: Optional[str] = None
    subject: Optional[str] = None
    body_html: Optional[str] = None
    template_type: Optional[str] = None


@router.get("")
async def list_email_templates(current_user: User = Depends(get_current_user)):
    """List all email templates for the tenant."""
    templates = await service.list_templates(current_user.tenant_id)
    return {"templates": templates, "template_types": TEMPLATE_TYPES}


@router.get("/variables")
async def get_variables(current_user: User = Depends(get_current_user)):
    """Get all available template variables."""
    return {"variables": service.get_available_variables()}


@router.get("/{template_id}")
async def get_email_template(template_id: str, current_user: User = Depends(get_current_user)):
    tmpl = await service.get_template(template_id, current_user.tenant_id)
    if not tmpl:
        raise HTTPException(status_code=404, detail="Template not found")
    return tmpl


@router.post("")
async def create_email_template(req: EmailTemplateCreate, current_user: User = Depends(get_current_user)):
    if req.template_type not in TEMPLATE_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid template_type. Must be one of: {TEMPLATE_TYPES}")
    tmpl = await service.create_template(req.dict(), current_user.tenant_id)
    return tmpl


@router.put("/{template_id}")
async def update_email_template(template_id: str, req: EmailTemplateUpdate, current_user: User = Depends(get_current_user)):
    data = {k: v for k, v in req.dict().items() if v is not None}
    tmpl = await service.update_template(template_id, data, current_user.tenant_id)
    if not tmpl:
        raise HTTPException(status_code=404, detail="Template not found")
    return tmpl


@router.delete("/{template_id}")
async def delete_email_template(template_id: str, current_user: User = Depends(get_current_user)):
    ok = await service.delete_template(template_id, current_user.tenant_id)
    if not ok:
        raise HTTPException(status_code=400, detail="Cannot delete system default template")
    return {"success": True}


@router.post("/preview")
async def preview_email(req: EmailTemplateCreate, current_user: User = Depends(get_current_user)):
    """Render a template with sample variables for preview."""
    sample_vars = {
        "recipient_name": "John Doe",
        "recipient_email": "john@example.com",
        "document_name": "NDA Agreement",
        "package_name": "Subscription Documents",
        "signing_link": "https://example.com/sign/abc123",
        "sender_name": f"{current_user.first_name} {current_user.last_name}".strip() or current_user.email,
        "company_name": "Your Company",
        "status": "Pending",
        "due_date": "2026-05-01",
        "signed_date": "2026-04-15",
        "download_link": "https://example.com/download/doc123",
    }
    rendered = service.render_template(req.body_html, sample_vars)
    return {"rendered_html": rendered, "subject": service.render_template(req.subject, sample_vars)}



class SendTestEmailRequest(BaseModel):
    to_email: str
    subject: str
    html_content: str


@router.post("/send-test")
async def send_test_email(req: SendTestEmailRequest, current_user: User = Depends(get_current_user)):
    """Send a test email with rendered template content."""
    try:
        from modules.docflow.services.system_email_service import SystemEmailService
        email_svc = SystemEmailService()
        result = await email_svc.send_generic_email(
            to_email=req.to_email,
            subject=req.subject,
            html_content=req.html_content,
        )
        if result.get("success"):
            return {"success": True, "message": f"Test email sent to {req.to_email}"}
        return {"success": False, "message": result.get("error", "Failed to send")}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{template_id}/clone")
async def clone_email_template(template_id: str, current_user: User = Depends(get_current_user)):
    clone = await service.clone_template(template_id, current_user.tenant_id)
    if not clone:
        raise HTTPException(status_code=404, detail="Template not found")
    return clone


@router.post("/{template_id}/set-default")
async def set_default_template(template_id: str, current_user: User = Depends(get_current_user)):
    ok = await service.set_default(template_id, current_user.tenant_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Template not found")
    return {"success": True}
