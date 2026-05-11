"""
DocFlow SMS Template API Routes — Phase 81.81

Mirror of the email-template routes for SMS templates. CRUD + set-default +
preview, scoped to the current tenant.
"""
import os
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from motor.motor_asyncio import AsyncIOMotorClient

from shared.auth import get_current_user
from shared.models import User
from modules.docflow.services.sms_template_service import (
    SmsTemplateService, render_sms, VARIABLES,
)

mongo_url = os.environ.get("MONGO_URL")
db_name = os.environ.get("DB_NAME", "crm_database")
client = AsyncIOMotorClient(mongo_url)
db = client[db_name]

router = APIRouter(prefix="/docflow/sms-templates", tags=["DocFlow SMS Templates"])
service = SmsTemplateService(db)


class SmsTemplateCreate(BaseModel):
    name: str
    content: str = ""
    is_default: bool = False


class SmsTemplateUpdate(BaseModel):
    name: Optional[str] = None
    content: Optional[str] = None
    is_default: Optional[bool] = None


class SmsPreviewRequest(BaseModel):
    content: str


@router.get("")
async def list_sms_templates(current_user: User = Depends(get_current_user)):
    templates = await service.list_templates(current_user.tenant_id)
    return {"templates": templates}


@router.get("/variables")
async def get_sms_variables(current_user: User = Depends(get_current_user)):
    return {"variables": VARIABLES}


@router.get("/default")
async def get_default_sms_template(current_user: User = Depends(get_current_user)):
    tmpl = await service.get_default(current_user.tenant_id)
    if not tmpl:
        raise HTTPException(status_code=404, detail="No default SMS template")
    return tmpl


@router.get("/{template_id}")
async def get_sms_template(template_id: str, current_user: User = Depends(get_current_user)):
    tmpl = await service.get_template(template_id, current_user.tenant_id)
    if not tmpl:
        raise HTTPException(status_code=404, detail="Template not found")
    return tmpl


@router.post("")
async def create_sms_template(
    req: SmsTemplateCreate, current_user: User = Depends(get_current_user)
):
    if not (req.name or "").strip():
        raise HTTPException(status_code=400, detail="Template name is required")
    if not (req.content or "").strip():
        raise HTTPException(status_code=400, detail="Template content is required")
    return await service.create_template(req.dict(), current_user.tenant_id)


@router.put("/{template_id}")
async def update_sms_template(
    template_id: str,
    req: SmsTemplateUpdate,
    current_user: User = Depends(get_current_user),
):
    data = {k: v for k, v in req.dict().items() if v is not None}
    tmpl = await service.update_template(template_id, data, current_user.tenant_id)
    if not tmpl:
        raise HTTPException(status_code=404, detail="Template not found")
    return tmpl


@router.delete("/{template_id}")
async def delete_sms_template(
    template_id: str, current_user: User = Depends(get_current_user)
):
    ok = await service.delete_template(template_id, current_user.tenant_id)
    if not ok:
        raise HTTPException(status_code=400, detail="Template cannot be deleted")
    return {"success": True}


@router.post("/{template_id}/set-default")
async def set_default_sms_template(
    template_id: str, current_user: User = Depends(get_current_user)
):
    ok = await service.set_default(template_id, current_user.tenant_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Template not found")
    return {"success": True}


@router.post("/preview")
async def preview_sms_template(
    req: SmsPreviewRequest, current_user: User = Depends(get_current_user)
):
    sample = {
        "user_name": "Jordan Reeves",
        "document_name": "NDA Agreement",
        "company_name": (
            f"{current_user.first_name} {current_user.last_name}".strip()
            or current_user.email
        ),
        "phone_last4": "3210",
        "link": "https://example.com/sign/abc123",
    }
    rendered = render_sms(req.content, sample)
    return {"rendered": rendered, "length": len(rendered), "sample_vars": sample}
