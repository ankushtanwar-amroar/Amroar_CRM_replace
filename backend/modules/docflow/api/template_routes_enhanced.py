"""Enhanced Template Routes with PDF Upload Support"""
import logging
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
logger = logging.getLogger(__name__)

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
    """Upload PDF / DOC / DOCX file as template with S3 storage.

    Phase 81 — DOC and DOCX uploads are now supported end-to-end:
      * File is stored as-is in S3 with its native extension.
      * Frontend triggers `/templates/{id}/convert-to-blocks` after upload,
        which uses `document_conversion_service` to extract editable content
        blocks (works for both PDF and DOCX).
      * Builder/visual editor renders from content blocks for DOC/DOCX
        templates, so no eager PDF conversion is required.
      * Final-signed PDF generation reads from blocks at sign time.
    """
    # Validate file type — PDF, DOC, DOCX accepted.
    allowed_extensions = ['.pdf', '.docx', '.doc']
    file_ext = os.path.splitext(file.filename)[1].lower()

    if file_ext not in allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail="Only PDF, DOC, or DOCX files are allowed."
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
        # Phase 81.11 — every upload starts a brand-new version tree. We
        # explicitly set template_group_id = template_id so re-uploading the
        # same source file (after a previous template was deleted) NEVER
        # rejoins an old group_id and never inherits old fields/versions.
        "template_group_id": template_id,
        "version": 1,
        "is_latest": True,
        "status": "draft",
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


@router.post("/templates/{template_id}/replace-file")
async def replace_template_source_file(
    template_id: str,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    """Phase 81.76 — Replace the source PDF/DOC/DOCX of an existing template.

    - Accepts the same file types as `/templates/upload-pdf` (PDF / DOC / DOCX).
    - Generates a fresh unique S3 key (no overwrite of previous file).
    - For DOC/DOCX: runs LibreOffice conversion and stores both original + PDF.
    - For PDF: stores as-is, no conversion.
    - Best-effort deletes the PREVIOUS S3 files to avoid orphaned storage.
    - Returns the refreshed template document.
    """
    import io
    from .template_routes import _convert_doc_to_pdf

    allowed_extensions = [".pdf", ".docx", ".doc"]
    file_ext = os.path.splitext(file.filename or "")[1].lower()
    if file_ext not in allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail="Only PDF, DOC, or DOCX files are allowed.",
        )

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")
    if len(content) > 100 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File size exceeds 100MB limit.")

    template = await db.docflow_templates.find_one(
        {"id": template_id, "tenant_id": current_user.tenant_id}
    )
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    prev_s3_key = template.get("s3_key")
    prev_converted_key = template.get("uploaded_pdf_s3_key")

    # Upload primary source file with a fresh UUID key.
    new_s3_key = s3_service.upload_template_file(
        file_bytes=content,
        tenant_id=current_user.tenant_id,
        filename=file.filename,
    )
    if not new_s3_key:
        raise HTTPException(
            status_code=500,
            detail="Failed to upload replacement file to storage. Please retry.",
        )
    new_file_url = s3_service.get_template_url(new_s3_key, expiration=604800)

    update_fields = {
        "s3_key": new_s3_key,
        "file_url": new_file_url,
        "original_filename": file.filename,
        "file_type": file_ext.lstrip("."),
        "updated_at": datetime.utcnow().isoformat(),
        # Legacy flags cleared so old cached states are not used.
        "pdf_file_path": None,
        "pdf_filename": file.filename,
    }

    # DOC / DOCX: convert to PDF and store alongside. PDF uploads reuse the
    # primary key for the `uploaded_pdf_*` twin so downstream code that prefers
    # the "converted PDF" path still works.
    new_converted_key = None
    if file_ext in (".docx", ".doc"):
        try:
            pdf_bytes = _convert_doc_to_pdf(content, file_ext.lstrip("."))
            if not pdf_bytes:
                raise HTTPException(
                    status_code=422,
                    detail=(
                        f"Failed to convert {file_ext.upper().lstrip('.')} to PDF. "
                        "Try opening it in Word and re-saving as PDF, then upload again."
                    ),
                )
            pdf_filename = os.path.splitext(file.filename)[0] + ".pdf"
            new_converted_key = s3_service.upload_template_file(
                file_bytes=pdf_bytes,
                tenant_id=current_user.tenant_id,
                filename=pdf_filename,
            )
            if new_converted_key:
                update_fields["uploaded_pdf_s3_key"] = new_converted_key
                update_fields["uploaded_pdf_url"] = s3_service.get_template_url(
                    new_converted_key, expiration=604800
                )
                try:
                    from PyPDF2 import PdfReader
                    reader = PdfReader(io.BytesIO(pdf_bytes))
                    update_fields["page_count"] = len(reader.pages)
                except Exception:
                    pass
        except HTTPException:
            # If conversion failed: roll back the primary upload so we don't
            # leave the template in a half-replaced state.
            try:
                s3_service.delete_file(new_s3_key)
            except Exception:
                pass
            raise
    else:
        # PDF — twin points at same key for consistency with upload-pdf flow.
        update_fields["uploaded_pdf_s3_key"] = new_s3_key
        update_fields["uploaded_pdf_url"] = new_file_url
        try:
            from PyPDF2 import PdfReader
            reader = PdfReader(io.BytesIO(content))
            update_fields["page_count"] = len(reader.pages)
        except Exception:
            pass

    # Persist the template update.
    await db.docflow_templates.update_one(
        {"id": template_id, "tenant_id": current_user.tenant_id},
        {"$set": update_fields},
    )

    # Best-effort: purge the PREVIOUS S3 files so replaced files don't linger.
    for old_key in {prev_s3_key, prev_converted_key}:
        if old_key and old_key != new_s3_key and old_key != new_converted_key:
            try:
                s3_service.delete_file(old_key)
            except Exception as _del_err:
                logger.warning(f"replace-file: failed to delete old key {old_key}: {_del_err}")

    refreshed = await db.docflow_templates.find_one(
        {"id": template_id, "tenant_id": current_user.tenant_id}, {"_id": 0}
    )
    return {"success": True, "template": refreshed}


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
            raise HTTPException(
                status_code=410,
                detail={
                    "code": "template_file_not_uploaded",
                    "message": "Template was saved without a PDF file. Please re-upload the source document.",
                    "template_id": template_id,
                    "template_name": template.get("name") or "",
                },
            )

    # Download from S3 and return
    file_bytes = s3_service.download_file(s3_key)

    # Phase 81.75 — Automatic recovery: if the primary s3_key is missing
    # from storage but the template ALSO has `uploaded_pdf_s3_key` (the
    # converted PDF stored alongside DOC/DOCX uploads), fall back to it.
    # Prevents the "Template PDF missing" error for templates whose primary
    # file was accidentally deleted but the converted twin is still there.
    if not file_bytes:
        fallback_key = template.get("uploaded_pdf_s3_key") or template.get("pdf_s3_key")
        if fallback_key and fallback_key != s3_key:
            try:
                file_bytes = s3_service.download_file(fallback_key)
                if file_bytes:
                    logger.info(
                        f"Template {template_id}: primary s3_key missing, "
                        f"serving from fallback key {fallback_key}"
                    )
            except Exception as _fb_err:
                logger.warning(f"Template {template_id} fallback also failed: {_fb_err}")

    if not file_bytes:
        # Phase 81.74 — structured error so frontend can show an actionable
        # "template file missing in storage" banner instead of the generic
        # "Failed to load template file" toast + blind retry loop.
        raise HTTPException(
            status_code=410,
            detail={
                "code": "template_file_missing",
                "message": "Template PDF file is missing from storage. Please re-upload the source document to restore this template.",
                "template_id": template_id,
                "template_name": template.get("name") or "",
                "s3_key": s3_key,
            },
        )
    
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
        "fields": template.get("fields", []),
        "template_group_id": template.get("template_group_id") or template_id,
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
    """Find field_placements from the latest template version that has fields.

    Issue 1 fix — fields are now ONLY inherited from prior versions in the
    SAME template_group_id (intentional version chain). The previous
    "same name + tenant" fallback caused fresh uploads with a matching
    filename to silently inherit fields from an unrelated older template,
    which corrupted layouts when the new file's text positions differed.

    Every fresh upload gets a unique template_id AND its own
    template_group_id (defaulted to its own id), so it never picks up
    another upload's placements. Only explicit "Save as New Version"
    flows — which preserve template_group_id — will inherit fields.
    """
    group_id = template.get("template_group_id")
    tid = template.get("tenant_id") or tenant_id
    if not group_id:
        return []

    # Restrict to the SAME template_group_id only. Different uploads
    # (even with identical filenames) get different group ids on creation,
    # so they remain fully isolated.
    query = {
        "template_group_id": group_id,
        "id": {"$ne": template.get("id")},
        "field_placements.0": {"$exists": True},
    }
    if tid:
        query["tenant_id"] = tid

    latest = await db.docflow_templates.find_one(
        query, {"_id": 0, "field_placements": 1},
        sort=[("version", -1), ("created_at", -1)]
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
