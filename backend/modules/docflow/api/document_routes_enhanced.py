"""Enhanced Document API Routes with Download Support"""
from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.responses import StreamingResponse
from typing import List, Optional
import sys
import os
import io

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))))

from shared.database import db
from shared.models import User
from shared.auth import get_current_user
from shared.services.license_enforcement import require_module_license, ModuleKey
from ..models.document_model import Document, DocumentGenerate
from ..services.document_service_enhanced import EnhancedDocumentService
from ..services.activity_log_service import ActivityLogService

router = APIRouter(prefix="/docflow", tags=["DocFlow Documents Enhanced"])

# Service
document_service = EnhancedDocumentService(db)
activity_log_service = ActivityLogService(db)


async def _resolve_sender_info(user_id: Optional[str]) -> Optional[dict]:
    """Phase 74: Resolve `created_by` user id → {name, email} for public
    signing-view header. Returns None when user_id is missing or the user
    record cannot be found (caller must treat as optional)."""
    if not user_id:
        return None
    try:
        user = await db.users.find_one({"id": user_id}, {"_id": 0, "email": 1, "first_name": 1, "last_name": 1, "name": 1, "full_name": 1})
        if not user:
            return None
        name = (
            user.get("full_name")
            or user.get("name")
            or " ".join(filter(None, [user.get("first_name"), user.get("last_name")])).strip()
            or (user.get("email") or "").split("@")[0]
        )
        email = user.get("email") or ""
        if not name and not email:
            return None
        return {"name": name, "email": email}
    except Exception:
        return None


@router.post("/documents/generate", response_model=Document, status_code=status.HTTP_201_CREATED)
@require_module_license(ModuleKey.DOCFLOW)
async def generate_document(
    doc_data: DocumentGenerate,
    current_user: User = Depends(get_current_user)
):
    """Generate document from template"""
    try:
        document = await document_service.generate_document(
            template_id=doc_data.template_id,
            crm_object_id=doc_data.crm_object_id,
            crm_object_type=doc_data.crm_object_type,
            user_id=current_user.id,
            tenant_id=current_user.tenant_id,
            delivery_channels=doc_data.delivery_channels,
            recipient_email=doc_data.recipient_email,
            recipient_name=doc_data.recipient_name,
            expires_in_days=doc_data.expires_in_days
        )
        return Document(**document)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/documents")
@require_module_license(ModuleKey.DOCFLOW)
async def list_documents(
    template_id: Optional[str] = None,
    status: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """List documents with enriched recipient info"""
    query = {"tenant_id": current_user.tenant_id}
    if template_id:
        query["template_id"] = template_id
    if status:
        query["status"] = status

    docs = await db.docflow_documents.find(query, {"_id": 0}).sort("created_at", -1).to_list(length=None)
    
    # Enrich each document with top-level recipient fields for display
    for doc in docs:
        recipients = doc.get("recipients", [])
        if recipients:
            first = recipients[0]
            name = first.get("name") or ""
            # Replace placeholder names with actual data or empty
            if name in ("Public Viewer", ""):
                name = first.get("email") or ""
            doc["recipient_name"] = name
            doc["recipient_email"] = first.get("email") or ""
            doc["public_token"] = first.get("public_token") or doc.get("public_token") or ""
            if len(recipients) > 1:
                first_name = name or "Recipient"
                doc["recipient_name"] = f"{first_name} (+{len(recipients)-1} more)"
        else:
            rn = doc.get("recipient_name") or ""
            if rn == "Public Viewer":
                rn = ""
            doc["recipient_name"] = rn
            doc["recipient_email"] = doc.get("recipient_email") or ""
            doc["public_token"] = doc.get("public_token") or ""
    
    return {
        "documents": docs,
        "total": len(docs),
        "page": 1,
        "limit": len(docs),
        "pages": 1
    }


@router.get("/documents/{document_id}")
async def get_document(
    document_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get document by ID"""
    document = await db.docflow_documents.find_one({
        "id": document_id,
        "tenant_id": current_user.tenant_id
    }, {"_id": 0})
    
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    
    return document


@router.get("/documents/public/{token}")
async def get_document_public(token: str):
    """Get document by public token (for signing - no auth required)"""
    try:
        # Search by document-level public_token OR by recipient's public_token
        document = await db.docflow_documents.find_one(
            {"$or": [
                {"public_token": token},
                {"recipients.public_token": token}
            ]},
            {"_id": 0}
        )
        
        if not document:
            raise HTTPException(status_code=404, detail="Document not found or expired")
        
        # Check if expired
        if await document_service.mark_expired_if_needed(document["id"], document=document):
            raise HTTPException(status_code=410, detail="Document has expired")
        
        # Find the active recipient matching the token
        active_recipient = None
        for r in document.get("recipients", []):
            if r.get("public_token") == token:
                active_recipient = {
                    "name": r.get("name", ""),
                    "email": r.get("email", ""),
                    "status": r.get("status", "pending"),
                    "routing_order": r.get("routing_order", 1),
                    "assigned_field_ids": r.get("assigned_field_ids", []),
                    "template_recipient_id": r.get("template_recipient_id", ""),
                    "role_type": r.get("role_type", r.get("role", "SIGN")).upper(),
                }
                break
        
        document["active_recipient"] = active_recipient or {}

        # Phase 74: Enrich with sender info (from document.created_by) for the
        # signing-view header. Falls back silently if user record is missing.
        sender_info = await _resolve_sender_info(document.get("created_by"))
        if sender_info:
            document["sender"] = sender_info

        # Log view event
        try:
            viewer = active_recipient.get("name", "") if active_recipient else ""
            await activity_log_service.log_document_viewed(
                tenant_id=document.get("tenant_id", ""),
                template_id=document.get("template_id", ""),
                document_id=document.get("id", ""),
                viewer=viewer or "Anonymous"
            )
        except Exception:
            pass

        return document
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error in get_document_public: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/documents/{document_id}/download/{version}")
async def download_document(
    document_id: str,
    version: str,
    current_user: User = Depends(get_current_user)
):
    """Download document PDF (signed or unsigned)"""
    if version not in ["signed", "unsigned"]:
        raise HTTPException(status_code=400, detail="Version must be 'signed' or 'unsigned'")
    
    if await document_service.mark_expired_if_needed(document_id):
        raise HTTPException(status_code=410, detail="Document has expired")

    pdf_bytes = await document_service.get_document_pdf(document_id, version)
    
    if not pdf_bytes:
        raise HTTPException(
            status_code=404,
            detail=f"{version.capitalize()} document not found"
        )
    
    # Get document info for filename
    document = await db.docflow_documents.find_one({"id": document_id})
    filename = f"{document.get('template_name', 'document')}_{version}.pdf"
    
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename={filename}"
        }
    )


@router.get("/documents/{document_id}/view/{version}")
async def view_document_public(document_id: str, version: str):
    """View document PDF (public - no auth required for signing view)"""
    if version not in ["signed", "unsigned"]:
        raise HTTPException(status_code=400, detail="Version must be 'signed' or 'unsigned'")
    
    if await document_service.mark_expired_if_needed(document_id):
        raise HTTPException(status_code=410, detail="Document has expired")

    pdf_bytes = await document_service.get_document_pdf(document_id, version)
    
    if not pdf_bytes:
        raise HTTPException(
            status_code=404,
            detail=f"{version.capitalize()} document not found"
        )
    
    # Get document info for filename
    document = await db.docflow_documents.find_one({"id": document_id})
    filename = f"{document.get('template_name', 'document')}_{version}.pdf"
    
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"inline; filename={filename}",
            "Access-Control-Allow-Origin": "*"
        }
    )



@router.post("/documents/{document_id}/sign")
async def sign_document(
    document_id: str,
    signature_data: dict,
    request: Request
):
    """Add signature to document (public endpoint)"""
    if await document_service.mark_expired_if_needed(document_id):
        raise HTTPException(status_code=410, detail="Document has expired")

    # Add metadata
    signature_data["ip_address"] = request.client.host
    signature_data["user_agent"] = request.headers.get("user-agent")
    
    # Extract field data if present
    field_data = signature_data.pop("field_data", None)
    
    success = await document_service.add_signature(document_id, signature_data, field_data)
    if not success:
        raise HTTPException(status_code=404, detail="Document not found")

    # Log signing event
    try:
        doc = await db.docflow_documents.find_one({"id": document_id}, {"_id": 0, "tenant_id": 1, "template_id": 1})
        if doc:
            signer_name = signature_data.get("recipient_name", signature_data.get("signer_name", "Unknown"))
            await activity_log_service.log_document_signed(
                tenant_id=doc.get("tenant_id", ""),
                template_id=doc.get("template_id", ""),
                document_id=document_id,
                signer=signer_name
            )
    except Exception:
        pass

    return {"success": True, "message": "Signature added successfully"}


@router.get("/email-history")
async def get_email_history(
    template_id: Optional[str] = None,
    status: Optional[str] = None,
    page: int = 1,
    limit: int = 15,
    current_user: User = Depends(get_current_user)
):
    """Get email history with pagination and status filtering"""
    from modules.docflow.services.email_history_service import EmailHistoryService
    ehs = EmailHistoryService(db)
    result = await ehs.get_all_history(
        tenant_id=current_user.tenant_id,
        status=status,
        page=page,
        limit=limit
    )
    
    # If template_id filter, apply it
    if template_id and result.get("history"):
        result["history"] = [e for e in result["history"] if e.get("template_id") == template_id]
        result["total"] = len(result["history"])
    
    return result



@router.post("/documents/{document_id}/regenerate-urls")
async def regenerate_document_urls(
    document_id: str,
    current_user: User = Depends(get_current_user)
):
    """Regenerate pre-signed URLs for document (useful when URLs expire)"""
    from ..services.s3_service import S3Service
    
    document = await db.docflow_documents.find_one({
        "id": document_id,
        "tenant_id": current_user.tenant_id
    })
    
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    
    s3_service = S3Service()
    updates = {}
    
    # Regenerate unsigned URL
    unsigned_s3_key = document.get("unsigned_s3_key")
    if unsigned_s3_key:
        unsigned_url = s3_service.get_document_url(unsigned_s3_key, expiration=604800)
        updates["unsigned_file_url"] = unsigned_url
    
    # Regenerate signed URL if it exists
    signed_s3_key = document.get("signed_s3_key")
    if signed_s3_key:
        signed_url = s3_service.get_document_url(signed_s3_key, expiration=604800)
        updates["signed_file_url"] = signed_url
    
    if updates:
        await db.docflow_documents.update_one(
            {"id": document_id},
            {"$set": updates}
        )
    
    return {
        "success": True,
        "message": "Document URLs regenerated successfully",
        "unsigned_file_url": updates.get("unsigned_file_url"),
        "signed_file_url": updates.get("signed_file_url")
    }


@router.post("/templates/{template_id}/regenerate-url")
async def regenerate_template_url(
    template_id: str,
    current_user: User = Depends(get_current_user)
):
    """Regenerate pre-signed URL for template (useful when URL expires)"""
    from ..services.s3_service import S3Service
    
    template = await db.docflow_templates.find_one({
        "id": template_id,
        "tenant_id": current_user.tenant_id
    })
    
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    
    s3_key = template.get("s3_key")
    if not s3_key:
        raise HTTPException(status_code=400, detail="Template does not have S3 key")
    
    s3_service = S3Service()
    file_url = s3_service.get_template_url(s3_key, expiration=604800)
    
    await db.docflow_templates.update_one(
        {"id": template_id},
        {"$set": {"file_url": file_url}}
    )
    
    return {
        "success": True,
        "message": "Template URL regenerated successfully",
        "file_url": file_url
    }


@router.get("/templates/{template_id}/merge-fields")
async def get_template_merge_fields(
    template_id: str,
    current_user: User = Depends(get_current_user)
):
    """Extract merge fields from template PDF"""
    from ..services.s3_service import S3Service
    from ..services.merge_field_service import MergeFieldService
    
    template = await db.docflow_templates.find_one({
        "id": template_id,
        "tenant_id": current_user.tenant_id
    })
    
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    
    s3_key = template.get("s3_key")
    if not s3_key:
        raise HTTPException(status_code=400, detail="Template does not have S3 key")
    
    # Download PDF from S3
    s3_service = S3Service()
    pdf_bytes = s3_service.download_file(s3_key)
    
    if not pdf_bytes:
        raise HTTPException(status_code=404, detail="Failed to download template from S3")
    
    # Extract merge fields
    merge_service = MergeFieldService(db)
    merge_fields = merge_service.extract_merge_fields_from_pdf(pdf_bytes)
    
    return {
        "success": True,
        "template_id": template_id,
        "template_name": template.get("name"),
        "merge_fields": merge_fields,
        "count": len(merge_fields)
    }

