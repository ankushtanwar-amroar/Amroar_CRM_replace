"""
Template API Routes
"""
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Body
from pydantic import BaseModel
from typing import List, Optional
import sys
import os
import requests
import io
from pdfminer.high_level import extract_pages
from pdfminer.layout import LTTextContainer, LTTextLine, LAParams

router = APIRouter(prefix="/docflow", tags=["DocFlow Templates"])

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))))

from shared.database import db
from shared.models import User
from shared.auth import get_current_user
from ..models.template_model import Template, TemplateCreate, TemplateUpdate
from ..services.template_service import TemplateService
from ..services.ai_template_service import AITemplateService
from ..services.cluebot_lifecycle_service import ClueBotLifecycleService
from ..services.file_parser_service import FileParserService
from ..services.system_email_service import SystemEmailService
from ..services.email_history_service import EmailHistoryService
from ..services.validation_service import ValidationService
import uuid
from datetime import datetime, timezone
import subprocess
import tempfile
import logging

logger = logging.getLogger(__name__)


def _convert_docx_to_pdf(docx_bytes: bytes) -> bytes:
    """Convert DOCX to PDF using LibreOffice headless. Returns PDF bytes or None."""
    with tempfile.TemporaryDirectory() as tmpdir:
        docx_path = os.path.join(tmpdir, "input.docx")
        with open(docx_path, "wb") as f:
            f.write(docx_bytes)

        result = subprocess.run(
            ["/usr/bin/libreoffice", "--headless", "--convert-to", "pdf", "--outdir", tmpdir, docx_path],
            capture_output=True, timeout=60
        )
        if result.returncode != 0:
            logger.warning(f"LibreOffice conversion failed: {result.stderr.decode()}")
            return None

        pdf_path = os.path.join(tmpdir, "input.pdf")
        if not os.path.exists(pdf_path):
            logger.warning("LibreOffice did not produce a PDF output")
            return None

        with open(pdf_path, "rb") as f:
            return f.read()



# Models
class AIGenerateRequest(BaseModel):
    prompt: Optional[str] = ""
    industry: Optional[str] = "General"
    selected_doc_type: Optional[str] = None
    
    class Config:
        extra = "allow"

class VisualAssistantRequest(BaseModel):
    instruction: str
    fields: List[dict]
    page_count: int

# Services
template_service = TemplateService(db)
ai_service = AITemplateService()
lifecycle_ai_service = ClueBotLifecycleService(db)
file_parser = FileParserService()
email_service = SystemEmailService()
email_history_service = EmailHistoryService(db)
validation_service = ValidationService(db)

def pdf_url_to_html(pdf_url: str) -> str:
    """Download PDF from URL and convert it into simple HTML."""
    # Step 1 — Download PDF
    response = requests.get(pdf_url)
    if response.status_code != 200:
        raise Exception("Unable to download PDF from URL")

    pdf_bytes = io.BytesIO(response.content)

    # Step 2 — Extract text using pdfminer.six
    html_output = "<html><body>"
    laparams = LAParams()

    for page_layout in extract_pages(pdf_bytes, laparams=laparams):
        html_output += '<div class="page">'

        for element in page_layout:
            if isinstance(element, LTTextContainer):
                for text_line in element:
                    if isinstance(text_line, LTTextLine):
                        text = text_line.get_text().strip()
                        if text:
                            html_output += f"<p>{text}</p>"

        html_output += "</div>"

    html_output += "</body></html>"
    return html_output

@router.post("/templates", status_code=status.HTTP_201_CREATED)
async def create_template(
    template_data: TemplateCreate,
    current_user: User = Depends(get_current_user)
):
    """Create new template"""
    template_payload = template_data.dict()
    validation = await validation_service.validate_template_obj(
        template_payload,
        tenant_id=current_user.tenant_id
    )
    
    # Set status and validation based on validation result
    is_valid = validation.get("valid", False)
    template_payload["is_validated"] = is_valid
    template_payload["status"] = "active" if is_valid else "draft"

    template = await template_service.create_template(
        template_payload,
        current_user.id,
        current_user.tenant_id
    )
    
    # Store HTML content in S3
    html_content = template_payload.get("html_content")
    if html_content:
        from ..services.s3_service import S3Service
        s3_service = S3Service()
        s3_key = s3_service.upload_template(
            file_bytes=html_content.encode('utf-8'),
            tenant_id=current_user.tenant_id,
            template_id=template["id"],
            file_extension="html"
        )
        if s3_key:
            update_data = {
                "s3_html_key": s3_key,
                "html_content": None  # Clear from DB
            }
            if not template.get("file_type"):
                update_data["file_type"] = "html"
                
            template = await template_service.update_template(
                template["id"], current_user.tenant_id, update_data, current_user.id
            )
            template["html_content"] = html_content  # Restore for response

    # Clean template for response
    if "_id" in template:
        del template["_id"]
    
    return template


@router.get("/templates")
async def list_templates(
    status: Optional[str] = None,
    search: Optional[str] = None,
    page: int = 1,
    limit: int = 10,
    current_user: User = Depends(get_current_user)
):
    """List templates with pagination and search"""
    result = await template_service.list_templates(
        current_user.tenant_id,
        status,
        search,
        page,
        limit
    )

    # Clean templates for response
    for template in result["templates"]:
        if "_id" in template:
            del template["_id"]

    return result


@router.get("/templates-active-latest")
async def list_latest_active_templates(
    search: Optional[str] = None,
    page: int = 1,
    limit: int = 20,
    current_user: User = Depends(get_current_user)
):
    """List only the highest-version ACTIVE template per group.
    Used by Create Package to show a clean, deduplicated list."""
    result = await template_service.list_latest_active_templates(
        current_user.tenant_id,
        search,
        page,
        limit
    )

    for template in result["templates"]:
        if "_id" in template:
            del template["_id"]

    return result




@router.get("/templates/{template_id}")
async def get_template(
    template_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get template by ID"""
    template = await template_service.get_template(template_id, current_user.tenant_id)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    
    # Clean template for response
    if "_id" in template:
        del template["_id"]
    
    # Refresh presigned URLs for S3 files
    from ..services.s3_service import S3Service
    s3_service = S3Service()
    if template.get("s3_key"):
        template["file_url"] = s3_service.get_template_url(template["s3_key"], expiration=604800)
    if template.get("uploaded_pdf_s3_key"):
        template["uploaded_pdf_url"] = s3_service.get_template_url(template["uploaded_pdf_s3_key"], expiration=604800)
    
    return template


@router.put("/templates/{template_id}")
async def update_template(
    template_id: str,
    update_data: TemplateUpdate,
    current_user: User = Depends(get_current_user)
):
    """Update template"""
    existing = await template_service.get_template(template_id, current_user.tenant_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Template not found")

    update_payload = update_data.dict(exclude_unset=True)
    merged_payload = {**existing, **update_payload}

    validation = await validation_service.validate_template_obj(
        merged_payload,
        tenant_id=current_user.tenant_id
    )
    
    # Set status and validation state
    is_backend_valid = validation.get("valid", False)
    ui_is_validated = update_payload.get("is_validated")
    
    # If UI explicitly sends is_validated: true, we trust it for activation
    # following the "validate then save" workflow.
    final_is_validated = ui_is_validated if ui_is_validated is not None else is_backend_valid
    
    print(f"Template Update Debug - ID: {template_id}")
    print(f"Backend valid: {is_backend_valid}, UI validated: {ui_is_validated}, Final: {final_is_validated}")
    
    update_payload["is_validated"] = final_is_validated
    
    # Do NOT auto-change status — status is managed explicitly:
    # - Draft templates stay draft until user clicks "Activate"
    # - Active templates stay active (version control handles edits)
    # Only honour an explicit status in the payload from the frontend
    if "status" in update_payload and update_payload["status"] in ("draft", "active", "archived"):
        pass  # Keep the explicitly-sent status
    else:
        update_payload.pop("status", None)  # Don't change status implicitly

    template = await template_service.update_template(
        template_id,
        current_user.tenant_id,
        update_payload,
        current_user.id
    )
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
        
    # Handle HTML content update
    html_content = update_payload.get("html_content")
    if html_content is not None:
        if html_content:
            from ..services.s3_service import S3Service
            s3_service = S3Service()
            s3_key = s3_service.upload_template(
                file_bytes=html_content.encode('utf-8'),
                tenant_id=current_user.tenant_id,
                template_id=template_id,
                file_extension="html"
            )
            if s3_key:
                html_update_data = {
                    "s3_html_key": s3_key,
                    "html_content": None  # Clear from DB
                }
                template = await template_service.update_template(
                    template_id, current_user.tenant_id, html_update_data, current_user.id
                )
                template["html_content"] = html_content  # Restore for response
        else:
            # Clear from S3 if set to empty
            from ..services.s3_service import S3Service
            s3_service = S3Service()
            if existing.get("s3_html_key"):
                s3_service.delete_file(existing["s3_html_key"])
            html_update_data = {"s3_html_key": None, "html_content": None}
            template = await template_service.update_template(
                template_id, current_user.tenant_id, html_update_data, current_user.id
            )
            template["html_content"] = None
    
    # Clean template for response
    if "_id" in template:
        del template["_id"]
    
    return template


@router.delete("/templates/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_template(
    template_id: str,
    current_user: User = Depends(get_current_user)
):
    """Delete template"""
    success = await template_service.delete_template(template_id, current_user.tenant_id)
    if not success:
        raise HTTPException(status_code=404, detail="Template not found")
    return None


# ── Version Control Endpoints ───────────────────────────

@router.get("/templates/{template_id}/versions")
async def get_template_versions(
    template_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get all versions of a template group."""
    template = await template_service.get_template(template_id, current_user.tenant_id)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    group_id = template.get("template_group_id", template["id"])
    versions = await template_service.get_version_history(group_id, current_user.tenant_id)
    return {"versions": versions, "template_group_id": group_id}


@router.post("/templates/{template_id}/create-version")
async def create_template_version(
    template_id: str,
    payload: dict = Body(default={}),
    current_user: User = Depends(get_current_user)
):
    """Create a new version by cloning the specified template.
    Optionally accepts update_data in the body to apply edits to the new version."""
    try:
        update_data = payload.get("update_data")
        new_template = await template_service.create_new_version(
            source_template_id=template_id,
            tenant_id=current_user.tenant_id,
            user_id=current_user.id,
            update_data=update_data,
        )
        if "_id" in new_template:
            del new_template["_id"]
        return {"success": True, "template": new_template}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Create version failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to create version: {str(e)}")


@router.post("/templates/migrate-versions")
async def migrate_template_versions(
    current_user: User = Depends(get_current_user)
):
    """One-time migration to backfill version fields on legacy templates."""
    count = await template_service.migrate_version_fields()
    return {"success": True, "migrated": count}


@router.post("/templates/ai-generate")
async def ai_generate_template(
    payload: dict = Body(...),
    current_user: User = Depends(get_current_user)
):
    """Generate template using AI"""
    prompt = payload.get("prompt", "")
    industry = payload.get("industry", "General")
    selected_doc_type = payload.get("selected_doc_type")
    base_prompt = payload.get("base_prompt", "")

    context = {
        "industry": industry,
        "selected_doc_type": selected_doc_type,
        "base_prompt": base_prompt
    }
    # Old method (kept for fallback/reference):
    result = await ai_service.generate_template(prompt, context)
    # result = await lifecycle_ai_service.generate_template_parallel(prompt, context)

    if not result["success"]:
        error_type = result.get("error_type", "generation_failed")
        if error_type == "quota_exceeded":
            raise HTTPException(
                status_code=429,
                detail=result.get("error"),
                headers={"Retry-After": str(result.get("retry_after", 60))}
            )
        else:
            raise HTTPException(status_code=500, detail=result.get("error"))

    return result


@router.post("/templates/{template_id}/parse-fields")
async def parse_template_fields(
    template_id: str,
    current_user: User = Depends(get_current_user)
):
    """Parse merge fields from a template PDF by converting PDF → HTML."""
    
    template = await template_service.get_template(template_id, current_user.tenant_id)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    pdf_url = template.get("file_url")
    if not pdf_url:
        raise HTTPException(status_code=400, detail="Template does not contain a PDF URL")

    try:
        # Step 1 — Convert PDF → HTML
        html_content = pdf_url_to_html(pdf_url)

        # Step 2 — Extract merge fields like {{lead.email}}
        merge_fields = template_service.parse_merge_fields(html_content)

        # Step 3 — Validate fields (you can pass object data here)
        validation = template_service.validate_merge_fields(merge_fields, {})

        return {
            "success": True,
            "html_content": html_content,
            "merge_fields": merge_fields,
            "validation": validation
        }

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to process PDF: {str(e)}"
        )



@router.post("/templates/upload")
async def upload_template_file(
    file: UploadFile = File(...),
    name: str = "",
    description: str = "",
    template_type: str = "custom",
    current_user: User = Depends(get_current_user)
):
    """Upload PDF or DOCX file as template"""
    # Validate file type
    allowed_extensions = ['.pdf', '.docx']
    file_ext = os.path.splitext(file.filename)[1].lower()

    if file_ext not in allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type. Only {', '.join(allowed_extensions)} files allowed."
        )

    try:
        # Read file content
        content = await file.read()

        # Validate file size (100MB max)
        if len(content) > 100 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="File size exceeds 100MB limit")

            # Accept both PDF and DOCX files — store as-is in S3
        final_content = content
        final_file_type = file_ext.lstrip('.')
        final_filename = file.filename

        # Upload PDF to S3
        from ..services.s3_service import S3Service
        s3_service = S3Service()

        s3_key = s3_service.upload_template_file(
            file_bytes=final_content,
            tenant_id=current_user.tenant_id,
            filename=final_filename
        )

        if not s3_key:
            raise HTTPException(
                status_code=500,
                detail="Failed to upload template to storage"
            )

        # Parse file for metadata (page count, text preview)
        # Non-critical: if parsing fails, template still works via S3 file
        parse_result = {"success": True, "pages": 1, "text_content": "", "html_content": ""}
        try:
            parse_result = await file_parser.parse_file(final_content, file.filename, file.content_type)
        except Exception:
            pass

        # Generate pre-signed URL (valid for 7 days)
        file_url = s3_service.get_template_url(s3_key, expiration=604800)

        # Create template — file content is in S3, only metadata in MongoDB
        template_data = {
            "name": name or os.path.splitext(file.filename)[0],
            "description": description,
            "template_type": template_type,
            "source": "upload",
            "s3_key": s3_key,
            "file_url": file_url,
            "file_type": final_file_type,
            "original_filename": file.filename,
            "page_count": parse_result.get("pages", 1),
        }
        # Only store html_content if it's small (< 5MB) to avoid BSON limit
        html_content = parse_result.get("html_content", "")
        if html_content and len(html_content) < 5 * 1024 * 1024:
            template_data["html_content"] = html_content

        # For DOCX uploads, convert to PDF using LibreOffice for pixel-perfect rendering
        uploaded_pdf_s3_key = None
        if file_ext == '.docx':
            try:
                pdf_bytes = _convert_docx_to_pdf(content)
                if pdf_bytes:
                    pdf_filename = os.path.splitext(file.filename)[0] + '.pdf'
                    uploaded_pdf_s3_key = s3_service.upload_template_file(
                        file_bytes=pdf_bytes,
                        tenant_id=current_user.tenant_id,
                        filename=pdf_filename
                    )
                    if uploaded_pdf_s3_key:
                        template_data["uploaded_pdf_s3_key"] = uploaded_pdf_s3_key
                        template_data["uploaded_pdf_url"] = s3_service.get_template_url(uploaded_pdf_s3_key, expiration=604800)
                        # Update page count from converted PDF
                        try:
                            from PyPDF2 import PdfReader
                            reader = PdfReader(io.BytesIO(pdf_bytes))
                            template_data["page_count"] = len(reader.pages)
                        except Exception:
                            pass
                        logger.info(f"DOCX converted to PDF and uploaded: {uploaded_pdf_s3_key}")
            except Exception as e:
                logger.warning(f"DOCX to PDF conversion failed (non-critical): {e}")

        # For PDF uploads, also set uploaded_pdf_s3_key for consistency
        if file_ext == '.pdf':
            template_data["uploaded_pdf_s3_key"] = s3_key
            template_data["uploaded_pdf_url"] = file_url

        template = await template_service.create_template(
            template_data,
            current_user.id,
            current_user.tenant_id
        )

        return {
            "success": True,
            "template": Template(**template),
            "parse_info": {
                "pages": template_data.get("page_count", 1),
                "text_preview": parse_result.get("text_content", "")[:200],
                "converted": bool(uploaded_pdf_s3_key)
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Upload failed: {str(e)}"
        )


@router.post("/templates/{template_id}/generate-pdf")
async def generate_pdf_from_docx(
    template_id: str,
    current_user: User = Depends(get_current_user)
):
    """Convert an existing DOCX template to PDF using LibreOffice for pixel-perfect rendering."""
    template = await db.docflow_templates.find_one(
        {"id": template_id, "tenant_id": current_user.tenant_id},
        {"_id": 0}
    )
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    # If already has a PDF version, return the existing URL
    if template.get("uploaded_pdf_s3_key"):
        from ..services.s3_service import S3Service
        s3_service = S3Service()
        pdf_url = s3_service.get_template_url(template["uploaded_pdf_s3_key"], expiration=604800)
        return {"success": True, "pdf_url": pdf_url, "uploaded_pdf_s3_key": template["uploaded_pdf_s3_key"]}

    if template.get("file_type") != "docx" or not template.get("s3_key"):
        raise HTTPException(status_code=400, detail="Template is not a DOCX file or has no S3 key")

    from ..services.s3_service import S3Service
    s3_service = S3Service()

    # Download DOCX from S3
    docx_bytes = s3_service.download_file(template["s3_key"])
    if not docx_bytes:
        raise HTTPException(status_code=500, detail="Failed to download DOCX from storage")

    # Convert to PDF
    pdf_bytes = _convert_docx_to_pdf(docx_bytes)
    if not pdf_bytes:
        raise HTTPException(status_code=500, detail="DOCX to PDF conversion failed")

    # Upload PDF to S3
    pdf_filename = os.path.splitext(template.get("original_filename", "document.docx"))[0] + ".pdf"
    uploaded_pdf_s3_key = s3_service.upload_template_file(
        file_bytes=pdf_bytes,
        tenant_id=current_user.tenant_id,
        filename=pdf_filename
    )
    if not uploaded_pdf_s3_key:
        raise HTTPException(status_code=500, detail="Failed to upload converted PDF to storage")

    pdf_url = s3_service.get_template_url(uploaded_pdf_s3_key, expiration=604800)

    # Update page count from the PDF
    page_count = 1
    try:
        from PyPDF2 import PdfReader
        reader = PdfReader(io.BytesIO(pdf_bytes))
        page_count = len(reader.pages)
    except Exception:
        pass

    # Update template in DB
    await db.docflow_templates.update_one(
        {"id": template_id, "tenant_id": current_user.tenant_id},
        {"$set": {
            "uploaded_pdf_s3_key": uploaded_pdf_s3_key,
            "uploaded_pdf_url": pdf_url,
            "page_count": page_count,
        }}
    )

    return {"success": True, "pdf_url": pdf_url, "uploaded_pdf_s3_key": uploaded_pdf_s3_key, "page_count": page_count}




class SendManualRequest(BaseModel):
    """Request model for manually sending a template"""
    crm_object_type: str
    crm_object_id: str
    recipient_email: str
    recipient_name: str


@router.post("/templates/{template_id}/send-manual")
async def send_template_manually(
    template_id: str,
    request: SendManualRequest,
    current_user: User = Depends(get_current_user)
):
    """Manually send template for a CRM record"""
    try:
        # Get template
        template = await template_service.get_template(template_id, current_user.tenant_id)
        if not template:
            raise HTTPException(status_code=404, detail="Template not found")
        
        # Import enhanced document service for proper email delivery
        from ..services.document_service_enhanced import EnhancedDocumentService
        doc_service = EnhancedDocumentService(db)
        
        # Generate document and send email
        document = await doc_service.generate_document(
            template_id=template_id,
            crm_object_id=request.crm_object_id,
            crm_object_type=request.crm_object_type,
            user_id=current_user.id,
            tenant_id=current_user.tenant_id,
            delivery_channels=["email", "public_link"],
            recipient_email=request.recipient_email,
            recipient_name=request.recipient_name
        )
        
        # Build proper public document URL (frontend route)
        frontend_url = os.environ.get("FRONTEND_URL", "")
        public_url = f"{frontend_url}/docflow/view/{document['public_token']}"
        
        return {
            "success": True,
            "message": "Document generated and sent successfully",
            "document_id": document["id"],
            "public_url": public_url,
            "status": document.get("status", "sent")
        }
    
    except Exception as e:
        # Log error
        await db.docflow_errors.insert_one({
            "error_type": "manual_send_failed",
            "template_id": template_id,
            "crm_object_id": request.crm_object_id,
            "error": str(e),
            "timestamp": datetime.now(timezone.utc)
        })
        
        raise HTTPException(
            status_code=500,
            detail=f"Failed to send document: {str(e)}"
        )


@router.get("/email-history/{crm_object_type}/{crm_object_id}")
async def get_email_history_for_record(
    crm_object_type: str,
    crm_object_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get email history for a specific CRM record"""
    history = await email_history_service.get_history_for_record(
        crm_object_type=crm_object_type,
        crm_object_id=crm_object_id,
        tenant_id=current_user.tenant_id
    )
    return {"history": history}


@router.get("/email-history")
async def get_all_email_history(
    status: Optional[str] = None,
    page: int = 1,
    limit: int = 20,
    current_user: User = Depends(get_current_user)
):
    """Get all email history for tenant with pagination"""
    result = await email_history_service.get_all_history(
        tenant_id=current_user.tenant_id,
        status=status,
        page=page,
        limit=limit
    )
    return result


# ============================================================
# Validation & Logs Endpoints
# ============================================================

@router.post("/templates/{template_id}/validate")
async def validate_template(
    template_id: str,
    current_user: User = Depends(get_current_user)
):
    """Run comprehensive validation on a template"""
    result = await validation_service.validate_template(
        template_id=template_id,
        tenant_id=current_user.tenant_id
    )
    return result


@router.get("/templates/{template_id}/logs")
async def get_template_logs(
    template_id: str,
    event_type: Optional[str] = None,
    days: Optional[int] = None,
    limit: int = 100,
    current_user: User = Depends(get_current_user)
):
    """Get activity logs for a template with optional date range filter"""
    query = {
        "template_id": template_id,
        "tenant_id": current_user.tenant_id
    }

    if event_type and event_type != "all":
        if event_type == "connection":
            query["event_type"] = {"$regex": "^connection_"}
        else:
            query["event_type"] = event_type

    if days:
        from datetime import timedelta
        cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
        query["timestamp"] = {"$gte": cutoff}

    logs = await db.docflow_activity_logs.find(
        query, {"_id": 0}
    ).sort("timestamp", -1).limit(limit).to_list(None)

    return {"logs": logs, "total": len(logs)}


@router.post("/templates/visual-assistant")
async def visual_assistant_command(
    request: VisualAssistantRequest,
    current_user: User = Depends(get_current_user)
):
    """Process visual builder AI commands"""
    result = await ai_service.process_visual_command(
        request.instruction,
        request.fields,
        request.page_count
    )

    if not result["success"]:
        error_type = result.get("error_type")
        if error_type == "quota_exceeded":
            raise HTTPException(
                status_code=429,
                detail=result.get("error"),
                headers={"Retry-After": "60"}
            )
        else:
            raise HTTPException(status_code=500, detail=result.get("error"))

    return result



# ── Content Blocks API ─────────────────────────────

from ..services.content_block_service import html_to_blocks, blocks_to_html


@router.post("/templates/{template_id}/convert-to-blocks")
async def convert_template_to_blocks(
    template_id: str,
    current_user: User = Depends(get_current_user)
):
    """Convert a template's content (HTML or PDF) to structured content blocks."""
    template = await db.docflow_templates.find_one(
        {"id": template_id, "tenant_id": current_user.tenant_id},
        {"_id": 0}
    )
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    blocks = []

    # For uploaded files, convert from the original file in S3
    is_uploaded_file = template.get("source") == "upload" and template.get("s3_key")

    # Try 1: If NOT an uploaded file, convert from html_content
    if not is_uploaded_file:
        html = template.get("html_content", "")
        if not html and template.get("s3_html_key"):
            try:
                from ..services.s3_service import S3Service
                s3_service = S3Service()
                html_bytes = s3_service.download_file(template["s3_html_key"])
                if html_bytes:
                    html = html_bytes.decode('utf-8')
            except Exception as e:
                import logging
                logging.getLogger(__name__).warning(f"Failed to fetch HTML from S3: {e}")

        if html:
            blocks = html_to_blocks(html)

    # Try 2: Convert from the uploaded PDF/DOCX file (primary path for uploaded PDFs)
    if not blocks and template.get("s3_key"):
        try:
            from ..services.s3_service import S3Service
            from ..services.document_conversion_service import DocumentConversionService
            s3_service = S3Service()
            file_bytes = s3_service.download_file(template["s3_key"])
            if file_bytes:
                import logging
                logging.getLogger(__name__).info(
                    f"Converting {template.get('s3_key')} ({len(file_bytes)} bytes) to blocks"
                )
                converter = DocumentConversionService()
                filename = template.get("original_filename", "document.pdf")
                result = converter.convert(
                    file_bytes, filename,
                    s3_service=s3_service,
                    tenant_id=current_user.tenant_id,
                    template_id=template_id
                )
                blocks = result.get("blocks", [])
            else:
                import logging
                logging.getLogger(__name__).warning(
                    f"S3 download returned empty for key: {template.get('s3_key')}"
                )
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(f"PDF/DOCX conversion failed: {e}", exc_info=True)

    # Try 3: If still no blocks, try downloading via file_url (presigned URL)
    if not blocks and template.get("file_url"):
        try:
            import logging
            logging.getLogger(__name__).info("Attempting conversion via file_url download")
            resp = requests.get(template["file_url"], timeout=30)
            if resp.status_code == 200 and resp.content:
                from ..services.document_conversion_service import DocumentConversionService
                from ..services.s3_service import S3Service
                s3_svc = S3Service()
                converter = DocumentConversionService()
                filename = template.get("original_filename", "document.pdf")
                result = converter.convert(
                    resp.content, filename,
                    s3_service=s3_svc,
                    tenant_id=current_user.tenant_id,
                    template_id=template_id
                )
                blocks = result.get("blocks", [])
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(f"file_url conversion failed: {e}")

    if not blocks:
        detail = "Could not extract text from this document. "
        if template.get("file_type") == "pdf":
            detail += "The PDF may be scanned/image-based. Try re-uploading a text-based PDF."
        else:
            detail += "The file may not contain extractable text content."
        raise HTTPException(status_code=400, detail=detail)

    # Normalize block types for DocumentContentEditor compatibility
    for block in blocks:
        if block.get("type") == "subheading":
            block["type"] = "heading"
            block["level"] = 3
        elif block.get("type") == "heading" and "level" not in block:
            block["level"] = 1
        elif block.get("type") == "list_item":
            block["type"] = "paragraph"
        elif block.get("type") == "table":
            # Normalize table: ensure `rows` field exists for frontend
            if "rows" not in block and isinstance(block.get("content"), list):
                block["rows"] = block.pop("content")

    # Persist the blocks
    new_html = blocks_to_html(blocks)
    await db.docflow_templates.update_one(
        {"id": template_id, "tenant_id": current_user.tenant_id},
        {"$set": {"content_blocks": blocks, "html_content": new_html}}
    )

    return {"success": True, "content_blocks": blocks, "block_count": len(blocks)}


@router.get("/templates/{template_id}/content-blocks")
async def get_content_blocks(
    template_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get content blocks for a template. Auto-converts from HTML if needed."""
    template = await db.docflow_templates.find_one(
        {"id": template_id, "tenant_id": current_user.tenant_id},
        {"_id": 0}
    )
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    blocks = template.get("content_blocks")

    # Auto-convert from html_content if blocks don't exist yet
    if not blocks:
        html = template.get("html_content", "")
        
        # If html_content is not in DB, try to fetch from S3
        if not html and template.get("s3_html_key"):
            try:
                from ..services.s3_service import S3Service
                s3_service = S3Service()
                html_bytes = s3_service.download_file(template["s3_html_key"])
                if html_bytes:
                    html = html_bytes.decode('utf-8')
            except Exception as e:
                import logging
                logging.getLogger(__name__).warning(f"Failed to fetch HTML from S3: {e}")
        
        if html:
            blocks = html_to_blocks(html)
            await db.docflow_templates.update_one(
                {"id": template_id, "tenant_id": current_user.tenant_id},
                {"$set": {"content_blocks": blocks}}
            )

    # Refresh presigned URLs for image blocks (they expire after 7 days)
    if blocks:
        refreshed = False
        for block in blocks:
            if block.get("type") == "image" and block.get("s3_key"):
                try:
                    from ..services.s3_service import S3Service
                    s3_svc = S3Service()
                    fresh_url = s3_svc.get_file_url(block["s3_key"], expiration=604800)
                    if fresh_url and fresh_url != block.get("src"):
                        block["src"] = fresh_url
                        refreshed = True
                except Exception:
                    pass
        if refreshed:
            await db.docflow_templates.update_one(
                {"id": template_id, "tenant_id": current_user.tenant_id},
                {"$set": {"content_blocks": blocks}}
            )

    return {"success": True, "content_blocks": blocks or [], "block_count": len(blocks or [])}


@router.put("/templates/{template_id}/content-blocks")
async def update_content_blocks(
    template_id: str,
    payload: dict = Body(...),
    current_user: User = Depends(get_current_user)
):
    """Update content blocks and regenerate html_content."""
    template = await db.docflow_templates.find_one(
        {"id": template_id, "tenant_id": current_user.tenant_id},
        {"_id": 0}
    )
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    blocks = payload.get("content_blocks", [])
    new_html = blocks_to_html(blocks)

    await db.docflow_templates.update_one(
        {"id": template_id, "tenant_id": current_user.tenant_id},
        {"$set": {
            "content_blocks": blocks,
            "html_content": new_html,
            "content_blocks_modified": True,
        }}
    )

    return {"success": True, "content_blocks": blocks, "html_content": new_html}



@router.post("/templates/convert-html-to-blocks")
async def convert_html_to_blocks(
    payload: dict = Body(...),
    current_user: User = Depends(get_current_user)
):
    """Convert raw HTML to structured content blocks (no template required)."""
    html = payload.get("html", "")
    if not html:
        raise HTTPException(status_code=400, detail="No HTML provided")

    blocks = html_to_blocks(html)
    return {"success": True, "content_blocks": blocks, "block_count": len(blocks)}
