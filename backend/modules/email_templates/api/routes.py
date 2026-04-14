from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from motor.motor_asyncio import AsyncIOMotorClient
from typing import List, Optional
from datetime import datetime, timezone
from config.settings import settings
import os
import uuid
import logging
import aiofiles

from ..models.email_template import (
    EmailTemplate, EmailTemplateCreate, EmailTemplateUpdate,
    EmailDraft, EmailDraftCreate, EmailDraftUpdate,
    SendEmailRequest, AIGenerateRequest, AIRewriteRequest,
    AISubjectRequest, AIGrammarRequest, HTMLToBlocksRequest
)
from ..services.email_service import email_service
from ..services.ai_service import email_ai_service
from ..services.html_converter import html_to_blocks, blocks_to_html

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/email-templates", tags=["Email Templates"])

security = HTTPBearer()

# Database connection
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
client = AsyncIOMotorClient(MONGO_URL)
db = client["crm_database"]

# Storage path for uploaded images
STORAGE_PATH = os.path.join(settings.STORAGE_BASE_DIR, "storage", "email_images")
os.makedirs(STORAGE_PATH, exist_ok=True)


# Template CRUD Routes
@router.get("/templates")
async def list_templates(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """List all email templates"""
    try:
        templates = await db.email_templates.find({}).to_list(100)
        # Convert ObjectId to string
        for template in templates:
            if '_id' in template:
                template['id'] = str(template['_id'])
                del template['_id']
        return templates
    except Exception as e:
        logger.error(f"Error listing templates: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/templates/list")
async def list_templates_alt(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """List all email templates (alternate endpoint)"""
    return await list_templates(credentials)


@router.get("/templates/{template_id}")
async def get_template(template_id: str, credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Get a single email template by ID"""
    try:
        from bson import ObjectId
        template = await db.email_templates.find_one({"_id": ObjectId(template_id)})
        if not template:
            raise HTTPException(status_code=404, detail="Template not found")
        template['id'] = str(template['_id'])
        del template['_id']
        return template
    except Exception as e:
        logger.error(f"Error getting template: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/templates")
async def create_template(template: EmailTemplateCreate, credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Create a new email template"""
    try:
        template_data = template.dict()
        template_data['created_at'] = datetime.now(timezone.utc)
        template_data['updated_at'] = datetime.now(timezone.utc)
        result = await db.email_templates.insert_one(template_data)
        # Remove _id and add string id for JSON serialization
        if '_id' in template_data:
            del template_data['_id']
        template_data['id'] = str(result.inserted_id)
        return template_data
    except Exception as e:
        logger.error(f"Error creating template: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/templates/{template_id}")
async def update_template(template_id: str, template: EmailTemplateUpdate, credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Update an existing email template"""
    try:
        from bson import ObjectId
        template_data = template.dict(exclude_unset=True)
        template_data['updated_at'] = datetime.now(timezone.utc)
        result = await db.email_templates.update_one(
            {"_id": ObjectId(template_id)},
            {"$set": template_data}
        )
        if result.modified_count == 0:
            raise HTTPException(status_code=404, detail="Template not found")
        return {"message": "Template updated", "id": template_id}
    except Exception as e:
        logger.error(f"Error updating template: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/templates/{template_id}")
async def delete_template(template_id: str, credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Delete an email template"""
    try:
        from bson import ObjectId
        result = await db.email_templates.delete_one({"_id": ObjectId(template_id)})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Template not found")
        return {"message": "Template deleted", "id": template_id}
    except Exception as e:
        logger.error(f"Error deleting template: {e}")
        raise HTTPException(status_code=500, detail=str(e))


