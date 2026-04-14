"""
Document API Routes
"""
from fastapi import APIRouter, Depends, HTTPException, status, Request, File, Form
from fastapi.responses import StreamingResponse
from typing import List, Optional
import sys
import os
import io
import json
import logging
from datetime import datetime

logger = logging.getLogger(__name__)

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))))

from shared.database import db
from shared.models import User
from shared.auth import get_current_user
from ..models.document_model import Document, DocumentGenerate
from ..services.document_service import DocumentService
from ..services.document_service_enhanced import EnhancedDocumentService

router = APIRouter(prefix="/docflow", tags=["DocFlow Documents"])

# Services
document_service = DocumentService(db)
enhanced_document_service = EnhancedDocumentService(db)


@router.post("/documents/generate", response_model=Document, status_code=status.HTTP_201_CREATED)
async def generate_document(
    doc_data: DocumentGenerate,
    current_user: User = Depends(get_current_user)
):
    """Generate document from template with PDF generation"""
    try:
        # Use enhanced service that actually generates PDFs
        document = await enhanced_document_service.generate_document(
            template_id=doc_data.template_id,
            crm_object_id=doc_data.crm_object_id,
            crm_object_type=doc_data.crm_object_type,
            user_id=current_user.id,
            tenant_id=current_user.tenant_id,
            delivery_channels=doc_data.delivery_channels,
            recipient_email=doc_data.recipient_email,
            recipient_name=doc_data.recipient_name,
            recipients=doc_data.recipients,
            routing_mode=doc_data.routing_mode,
            expires_in_days=doc_data.expires_in_days
        )
        return Document(**document)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/documents")
async def list_documents(
    template_id: Optional[str] = None,
    status: Optional[str] = None,
    search: Optional[str] = None,
    page: int = 1,
    limit: int = 10,
    current_user: User = Depends(get_current_user)
):
    """List documents with pagination and search"""
    result = await document_service.list_documents(
        current_user.tenant_id,
        template_id,
        status,
        search,
        page,
        limit
    )

    # Clean documents for response
    for doc in result["documents"]:
        if "_id" in doc:
            del doc["_id"]

    return result


@router.get("/documents/{document_id}", response_model=Document)
async def get_document(
    document_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get document by ID"""
    document = await document_service.get_document(document_id, current_user.tenant_id)
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    return Document(**document)


@router.get("/documents/public/{token}")
async def get_document_public(token: str):
    """Get document by public token (for signing - no auth required)"""
    try:
        doc_result = await enhanced_document_service.get_document_public_by_recipient_token(token)
        if not doc_result:
            raise HTTPException(status_code=404, detail="Document not found or expired")

        if doc_result.get("expired"):
            raise HTTPException(status_code=410, detail="Document has expired")

        # Generator documents return minimal info — user must call /instantiate first
        if doc_result.get("is_generator"):
            return doc_result

        # Convert datetime objects to ISO strings for JSON serialization
        result = {}
        for key, value in doc_result.items():
            if isinstance(value, datetime):
                result[key] = value.isoformat()
            else:
                result[key] = value
        
        # Flags for version availability
        unsigned_present = bool(result.get("unsigned_s3_key") or result.get("unsigned_pdf_path"))
        signed_present = bool(result.get("signed_s3_key") or result.get("signed_pdf_path"))
        result["has_unsigned_version"] = unsigned_present
        result["has_signed_version"] = signed_present
        result["is_signed"] = result.get("status") in ["signed", "completed"]

        # Add view URLs for both versions
        doc_id = result.get("id")
        if doc_id:
            result["unsigned_view_url"] = f"/api/docflow/documents/{doc_id}/view/unsigned"
            if result["has_signed_version"]:
                result["signed_view_url"] = f"/api/docflow/documents/{doc_id}/view/signed"
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error in get_document_public: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/documents/public/instantiate")
async def instantiate_public_document(data: dict):
    """Create a new document instance from a reusable public link.
    User provides name + email, gets their own document copy."""
    token = data.get("token")
    name = data.get("name", "").strip()
    email = data.get("email", "").strip()

    if not token or not name or not email:
        raise HTTPException(status_code=400, detail="Token, name, and email are required")

    try:
        result = await enhanced_document_service.instantiate_public_document(token, name, email)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error in instantiate_public_document: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/documents/public/verify/send-otp")
async def send_signing_otp(
    data: dict # {token, name, email}
):
    """Generate and send OTP to recipient email"""
    token = data.get("token")
    name = data.get("name")
    email = data.get("email")
    
    if not all([token, name, email]):
        raise HTTPException(status_code=400, detail="Missing required verification data")
        
    success = await enhanced_document_service.send_otp(token, name, email)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to send verification code")
        
    return {"success": True, "message": "Verification code sent"}


@router.post("/documents/public/verify/check-otp")
async def check_signing_otp(
    data: dict # {token, email, otp}
):
    """Verify OTP provided by recipient"""
    token = data.get("token")
    email = data.get("email")
    otp = data.get("otp")
    
    if not all([token, email, otp]):
        raise HTTPException(status_code=400, detail="Missing verification code")
        
    is_valid = await enhanced_document_service.verify_otp(token, email, otp)
    if not is_valid:
        raise HTTPException(status_code=401, detail="Invalid or expired verification code")
        
    return {"success": True, "message": "Verified successfully"}


@router.post("/documents/{document_id}/sign")
async def sign_document(
    document_id: str,
    signed_pdf: bytes = File(...),
    signer_name: str = Form(...),
    signer_email: str = Form(...),
    field_data: str = Form(...),
    recipient_token: Optional[str] = Form(None),
    request: Request = None
):
    """Add signature to document by uploading signed PDF (public endpoint)"""
    try:
        if await enhanced_document_service.mark_expired_if_needed(document_id):
            raise HTTPException(status_code=410, detail="Document has expired")

        # Parse field data
        field_data_dict = {}
        if field_data:
            field_data_dict = json.loads(field_data)

        # Create signature data
        signature_data = {
            "signer_name": signer_name,
            "signer_email": signer_email,
            "ip_address": request.client.host if request else None,
            "user_agent": request.headers.get("user-agent") if request else None
        }

        success = await enhanced_document_service.add_signature_with_pdf(
            document_id,
            signed_pdf,
            signature_data,
            field_data_dict,
            recipient_token=recipient_token
        )
        if not success:
            raise HTTPException(status_code=404, detail="Document not found")

        return {"success": True, "message": "Signature added successfully"}
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid field data format")
    except Exception as e:
        logger.error(f"Error in sign_document: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/documents/{document_id}/view/{version}")
async def view_document(
    document_id: str,
    version: str
):
    """View document PDF in browser (signed or unsigned) - Public endpoint"""
    if version not in ["signed", "unsigned"]:
        raise HTTPException(status_code=400, detail="Version must be 'signed' or 'unsigned'")
    
    if await enhanced_document_service.mark_expired_if_needed(document_id):
        raise HTTPException(status_code=410, detail="Document has expired")

    # Get document
    document = await db.docflow_documents.find_one({"id": document_id})
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    
    pdf_bytes = await enhanced_document_service.get_document_pdf(document_id, version)
    
    if not pdf_bytes:
        raise HTTPException(
            status_code=404,
            detail=f"{version.capitalize()} document not found"
        )
    
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"inline; filename={document.get('template_name', 'document')}_{version}.pdf"
        }
    )


@router.get("/documents/{document_id}/download/{version}")
async def download_document(
    document_id: str,
    version: str,
    current_user: User = Depends(get_current_user)
):
    """Download document PDF (signed or unsigned) - Authenticated endpoint"""
    if version not in ["signed", "unsigned"]:
        raise HTTPException(status_code=400, detail="Version must be 'signed' or 'unsigned'")
    
    if await enhanced_document_service.mark_expired_if_needed(document_id):
        raise HTTPException(status_code=410, detail="Document has expired")

    pdf_bytes = await enhanced_document_service.get_document_pdf(document_id, version)
    
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


@router.get("/email-history")
async def get_email_history(
    template_id: Optional[str] = None,
    document_id: Optional[str] = None,
    page: int = 1,
    limit: int = 20,
    current_user: User = Depends(get_current_user)
):
    """Get email history with pagination and optional filters"""
    query = {"tenant_id": current_user.tenant_id}
    if template_id:
        query["template_id"] = template_id
    if document_id:
        query["document_id"] = document_id
    
    # Calculate pagination
    skip = (page - 1) * limit
    
    # Get total count
    total = await db.docflow_email_history.count_documents(query)
    
    # Get paginated data
    cursor = db.docflow_email_history.find(query).sort("sent_at", -1).skip(skip).limit(limit)
    emails = await cursor.to_list(length=limit)
    
    # Convert datetime objects for JSON serialization
    for email in emails:
        if "_id" in email:
            del email["_id"]
        if "sent_at" in email and not isinstance(email["sent_at"], str):
            email["sent_at"] = email["sent_at"].isoformat()
        if "created_at" in email and not isinstance(email["created_at"], str):
            email["created_at"] = email["created_at"].isoformat()
    
    return {
        "history": emails,
        "total": total,
        "page": page,
        "limit": limit,
        "pages": (total + limit - 1) // limit
    }


@router.get("/analytics/summary")
async def get_analytics_summary(current_user: User = Depends(get_current_user)):
    """Get analytics summary for all documents"""
    try:
        # Fetch documents safely - list_documents returns a dict with "documents" key
        documents_result = await document_service.list_documents(current_user.tenant_id)
        documents = documents_result.get("documents", [])

        if not documents:
            return {
                "total_documents": 0,
                "by_status": {"generated": 0, "sent": 0, "viewed": 0, "signed": 0},
                "avg_time_to_sign_hours": 0,
                "by_template": {}
            }

        # Calculate metrics
        total = len(documents)
        generated = len([d for d in documents if d.get("status") == "generated"])
        sent = len([d for d in documents if d.get("status") == "sent"])
        viewed = len([d for d in documents if d.get("status") == "viewed"])
        signed = len([d for d in documents if d.get("status") == "signed"])

        # Calculate average time to sign (handle missing datetimes)
        sign_times = []
        for doc in documents:
            generated_at = doc.get("generated_at")
            signed_at = doc.get("signed_at")

            if generated_at and signed_at:
                try:
                    delta = signed_at - generated_at
                    sign_times.append(delta.total_seconds() / 3600)  # hours
                except Exception:
                    continue

        avg_time_to_sign = sum(sign_times) / len(sign_times) if sign_times else 0

        # Group by template
        by_template = {}
        for doc in documents:
            template_name = doc.get("template_name", "Unknown")
            if template_name not in by_template:
                by_template[template_name] = {"generated": 0, "signed": 0}

            by_template[template_name]["generated"] += 1
            if doc.get("status") == "signed":
                by_template[template_name]["signed"] += 1

        return {
            "total_documents": total,
            "by_status": {
                "generated": generated,
                "sent": sent,
                "viewed": viewed,
                "signed": signed,
            },
            "avg_time_to_sign_hours": round(avg_time_to_sign, 1),
            "by_template": by_template,
        }

    except Exception as e:
        print(f"Error in analytics summary: {e}")
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {str(e)}")
