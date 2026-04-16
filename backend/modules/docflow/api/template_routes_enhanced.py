"""Enhanced Template Routes with PDF Upload Support"""
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from pydantic import BaseModel
from typing import Optional, List, Any
import uuid
import os
from datetime import datetime, timezone
import sys

router = APIRouter(prefix="/docflow", tags=["DocFlow Templates Enhanced"])

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))))

from shared.database import db
from shared.models import User
from shared.auth import get_current_user
from ..services.s3_service import S3Service
from ..services.validation_service import ValidationService

# Initialize S3 Service
s3_service = S3Service()
validation_service = ValidationService(db)

# Pydantic models
class FieldPlacementsUpdate(BaseModel):
    field_placements: List[Any]


@router.post("/templates/upload-pdf")
async def upload_template_pdf(
    file: UploadFile = File(...),
    name: str = Form(...),
    description: str = Form(""),
    template_type: str = Form("contract"),
    current_user: User = Depends(get_current_user)
):
    """Upload PDF or DOCX file as template with S3 storage"""
    # Validate file type - only PDF files accepted (DOCX conversion moved to frontend)
    allowed_extensions = ['.pdf']
    file_ext = os.path.splitext(file.filename)[1].lower()

    if file_ext not in allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail="Only PDF files are allowed. DOCX files should be converted to PDF in frontend before upload."
        )
    
    # Validate file size (100MB max)
    content = await file.read()
    if len(content) > 100 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File size exceeds 100MB limit")
    
    # Generate template ID
    template_id = str(uuid.uuid4())
    
    # Upload to S3
    s3_key = s3_service.upload_template(
        file_bytes=content,
        tenant_id=current_user.tenant_id,
        template_id=template_id,
        file_extension=file_ext.replace('.', '')
    )
    
    if not s3_key:
        raise HTTPException(status_code=500, detail="Failed to upload template to S3")
    
    # Generate pre-signed URL (valid for 7 days)
    file_url = s3_service.get_template_url(s3_key, expiration=604800)  # 7 days
    
    # Create template record
    now = datetime.now(timezone.utc)
    template = {
        "id": template_id,
        "tenant_id": current_user.tenant_id,
        "name": name,
        "description": description,
        "type": template_type,
        "source": "upload",
        "s3_key": s3_key,
        "file_url": file_url,  # Store pre-signed URL
        "file_type": file_ext.replace('.', ''),
        "original_filename": file.filename,
        "fields": [],
        "field_placements": [],
        "trigger_config": {
            "enabled": False,
            "object_type": "lead",
            "conditions": []
        },
        "created_by": current_user.id,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    
    await db.docflow_templates.insert_one(template)
    
    if "_id" in template:
        del template["_id"]
    
    return {
        "success": True,
        "template": template
    }


@router.get("/templates/{template_id}/pdf")
async def get_template_pdf(
    template_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get template file from S3 (returns presigned URL or file bytes)"""
    from fastapi.responses import Response
    
    template = await db.docflow_templates.find_one({
        "id": template_id,
        "tenant_id": current_user.tenant_id
    })
    
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    
    s3_key = template.get("s3_key")
    if not s3_key:
        # Check for legacy pdf_file_path
        pdf_path = template.get("pdf_file_path")
        if pdf_path and os.path.exists(pdf_path):
            # Return local file for backwards compatibility
            from fastapi.responses import FileResponse
            return FileResponse(pdf_path, media_type="application/pdf", 
                              filename=template.get("original_filename", "template.pdf"))
        else:
            raise HTTPException(status_code=404, detail="Template file not found")
    
    # Download from S3 and return
    file_bytes = s3_service.download_file(s3_key)
    if not file_bytes:
        raise HTTPException(status_code=404, detail="Failed to download template from S3")
    
    # Determine content type
    file_type = template.get("file_type", "pdf")
    content_type = "application/pdf" if file_type == "pdf" else "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    
    return Response(
        content=file_bytes,
        media_type=content_type,
        headers={
            "Content-Disposition": f'attachment; filename="{template.get("original_filename", "template." + file_type)}"'
        }
    )


@router.put("/templates/{template_id}/field-placements")
async def update_template_field_placements(
    template_id: str,
    data: FieldPlacementsUpdate,
    current_user: User = Depends(get_current_user)
):
    """Update field placements for template"""
    template = await db.docflow_templates.find_one({
        "id": template_id,
        "tenant_id": current_user.tenant_id
    })
    
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    
    # Validate (do not allow committing field placements that fail validation)
    merged_payload = {**template, "field_placements": data.field_placements}
    validation = await validation_service.validate_template_obj(
        merged_payload,
        tenant_id=current_user.tenant_id
    )
    if not validation.get("valid"):
        raise HTTPException(status_code=400, detail=validation.get("errors", validation))

    # Regenerate pre-signed URL if S3 key exists
    s3_key = template.get("s3_key")
    file_url = None
    if s3_key:
        file_url = s3_service.get_template_url(s3_key, expiration=604800)  # 7 days
    
    # Update field placements
    now = datetime.now(timezone.utc)
    update_data = {
        "field_placements": data.field_placements,
        "updated_at": now.isoformat()
    }
    
    if file_url:
        update_data["file_url"] = file_url  # Update pre-signed URL
    
    result = await db.docflow_templates.update_one(
        {"id": template_id, "tenant_id": current_user.tenant_id},
        {"$set": update_data}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=400, detail="Failed to update field placements")
    
    return {
        "success": True,
        "message": "Field placements updated successfully",
        "field_count": len(data.field_placements),
        "file_url": file_url
    }


@router.get("/templates/{template_id}/field-placements")
async def get_template_field_placements(
    template_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get field placements for template. Falls back to latest version with fields if current has none."""
    template = await db.docflow_templates.find_one({
        "id": template_id,
        "tenant_id": current_user.tenant_id
    })
    
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    
    placements = template.get("field_placements", [])

    # If no fields on this version, try finding latest version in same group or same name
    if not placements:
        placements = await _resolve_latest_field_placements(template, current_user.tenant_id)

    return {
        "field_placements": placements,
        "fields": template.get("fields", [])
    }



@router.get("/templates/{template_id}/field-placements-public")
async def get_template_field_placements_public(template_id: str):
    """Get field placements for template (public - no auth required for signing). Falls back to latest version with fields."""
    template = await db.docflow_templates.find_one({"id": template_id})
    
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    
    placements = template.get("field_placements", [])

    # If no fields on this version, try finding latest version in same group or same name
    if not placements:
        placements = await _resolve_latest_field_placements(template)

    return {
        "field_placements": placements,
        "fields": template.get("fields", [])
    }


async def _resolve_latest_field_placements(template: dict, tenant_id: str = None) -> list:
    """Find field_placements from the latest template version that has fields."""
    # Strategy 1: Same template_group_id, latest version
    group_id = template.get("template_group_id")
    tid = template.get("tenant_id") or tenant_id
    if group_id:
        query = {"template_group_id": group_id, "field_placements.0": {"$exists": True}}
        if tid:
            query["tenant_id"] = tid
        latest = await db.docflow_templates.find_one(
            query, {"_id": 0, "field_placements": 1},
            sort=[("version", -1), ("created_at", -1)]
        )
        if latest and latest.get("field_placements"):
            return latest["field_placements"]

    # Strategy 2: Same name + tenant, latest with fields
    name = template.get("name")
    if name and tid:
        latest = await db.docflow_templates.find_one(
            {"name": name, "tenant_id": tid, "field_placements.0": {"$exists": True}},
            {"_id": 0, "field_placements": 1},
            sort=[("created_at", -1)]
        )
        if latest and latest.get("field_placements"):
            return latest["field_placements"]

    return []



@router.post("/templates/convert-document")
async def convert_document_to_blocks(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user)
):
    """Convert an uploaded PDF/DOCX file to editable content blocks."""
    from ..services.document_conversion_service import DocumentConversionService

    allowed_ext = ['.pdf', '.docx', '.doc']
    file_ext = os.path.splitext(file.filename)[1].lower()
    if file_ext not in allowed_ext:
        raise HTTPException(status_code=400, detail=f"Unsupported file type. Allowed: {', '.join(allowed_ext)}")

    content = await file.read()
    if len(content) > 100 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File size exceeds 100MB limit")

    try:
        converter = DocumentConversionService()
        result = converter.convert(content, file.filename)
        return {
            "success": True,
            "blocks": result["blocks"],
            "total_pages": result["total_pages"],
            "source_format": result["source_format"],
            "block_count": result["block_count"],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Conversion failed: {str(e)}")
