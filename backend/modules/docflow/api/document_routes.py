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
from datetime import datetime, timezone

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


async def _resolve_sender_info(user_id: Optional[str]) -> Optional[dict]:
    """Phase 74: Resolve `created_by` user id → {name, email} for public
    signing-view header. Returns None when user_id is missing or the user
    record cannot be found (caller must treat as optional)."""
    if not user_id:
        return None
    try:
        user = await db.users.find_one(
            {"id": user_id},
            {"_id": 0, "email": 1, "first_name": 1, "last_name": 1, "name": 1, "full_name": 1},
        )
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


@router.get("/documents/{document_id}/detail")
async def get_document_detail(
    document_id: str,
    current_user: User = Depends(get_current_user)
):
    """Phase 79 — enriched detail payload for the new Documents detail page.

    Returns the document's full state:
      * metadata (name, send id, template, routing mode, channels, timestamps)
      * sender info (resolved from created_by)
      * recipients / submissions array with per-row status + download links
      * aggregated counters (total / completed / pending / viewed / voided)
      * download urls (original unsigned + final signed when available)
      * audit trail
      * per-recipient children if a parent-child split was used
    """
    document = await db.docflow_documents.find_one(
        {"id": document_id, "tenant_id": current_user.tenant_id},
        {"_id": 0},
    )
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    # Children (per-recipient split) — only when parent has explicit child list
    child_ids = document.get("child_document_ids") or []
    children = []
    if child_ids:
        cursor = db.docflow_documents.find(
            {"id": {"$in": child_ids}, "tenant_id": current_user.tenant_id},
            {"_id": 0},
        )
        async for c in cursor:
            children.append(c)

    # Effective recipients: prefer the parent's recipients[] (that's where
    # current send flow stores state). Fall back to the children array.
    recipients = document.get("recipients") or []
    if not recipients and children:
        # Synthesize a minimal recipient row per child so the detail UI has
        # something to show even for older split documents.
        for c in children:
            recipients.append({
                "id": c.get("id"),
                "name": c.get("recipient_name"),
                "email": c.get("recipient_email"),
                "status": c.get("status"),
                "public_token": c.get("public_token"),
                "signed_at": c.get("signed_at"),
                "viewed_at": c.get("viewed_at"),
            })

    # Counters
    total = len(recipients)
    signed = sum(1 for r in recipients if r.get("status") in ("signed", "completed") or r.get("signed_at"))
    viewed = sum(1 for r in recipients if r.get("status") == "viewed")
    voided = sum(1 for r in recipients if r.get("voided") or r.get("status") == "voided")
    pending = max(0, total - signed - voided)

    # Type detection
    channels = document.get("delivery_channels") or []
    send_type = (
        "public_link" if ("public_link" in channels and "email" not in channels)
        else ("email" if "email" in channels else (channels[0] if channels else "email"))
    )

    # Sender info
    sender = await _resolve_sender_info(document.get("created_by"))

    # Download URLs (when present)
    downloads = {
        "original": document.get("unsigned_file_url") or document.get("document_url"),
        "signed": document.get("signed_file_url"),
    }

    # Aggregate status for the detail header chip (same logic as listing)
    raw_status = (document.get("status") or "").lower()
    if send_type == "public_link":
        if raw_status in ("voided", "cancelled", "closed"):
            aggregate_status = "closed"
        else:
            aggregate_status = "active_with_submissions" if signed else "active"
    else:
        if total == 0:
            aggregate_status = raw_status or "pending"
        elif voided == total:
            aggregate_status = "voided"
        elif signed == total:
            aggregate_status = "completed"
        elif signed > 0 or viewed > 0:
            aggregate_status = "in_progress"
        else:
            aggregate_status = "pending"

    return {
        "id": document.get("id"),
        "send_id": document.get("id"),
        "template_id": document.get("template_id"),
        "template_name": document.get("template_name"),
        "status": document.get("status"),
        "aggregate_status": aggregate_status,
        "send_type": send_type,
        "routing_mode": document.get("routing_mode") or "parallel",
        "delivery_channels": channels,
        "created_at": document.get("created_at"),
        "updated_at": document.get("updated_at"),
        "sent_at": document.get("sent_at"),
        "completed_at": document.get("completed_at"),
        "expires_at": document.get("expires_at"),
        "sender": sender,
        "recipients": recipients,
        "counters": {
            "total": total,
            "signed": signed,
            "viewed": viewed,
            "voided": voided,
            "pending": pending,
        },
        "downloads": downloads,
        "public_token": document.get("public_token"),
        "audit_trail": document.get("audit_trail") or [],
    }


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

        # Phase 74: Resolve sender info (document.created_by → user record)
        # for the public signing-view header. Falls back silently if missing.
        sender_info = await _resolve_sender_info(result.get("created_by"))
        if sender_info:
            result["sender"] = sender_info

        # Phase 80: surface voided state so the signing page can block actions
        # and show the "access revoked" popup. Frontend polls this endpoint to
        # detect mid-session voids.
        active = result.get("active_recipient") or {}
        if active.get("voided") or active.get("status") == "voided":
            result["recipient_voided"] = True
            result["can_sign"] = False
            result["voided_at"] = active.get("voided_at")

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

        # Phase 80: block signing attempts from voided recipients server-side.
        # Frontend will also hide controls, but this is the authoritative check.
        if recipient_token:
            _doc = await db.docflow_documents.find_one(
                {"id": document_id},
                {"_id": 0, "recipients": 1},
            )
            if _doc:
                _r = next(
                    (r for r in (_doc.get("recipients") or []) if r.get("public_token") == recipient_token),
                    None,
                )
                if _r and (_r.get("voided") or _r.get("status") == "voided"):
                    raise HTTPException(status_code=403, detail="This signing request has been voided by the sender")

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


@router.post("/documents/{document_id}/recipients/{recipient_id}/resend")
async def resend_recipient_email(
    document_id: str,
    recipient_id: str,
    current_user: User = Depends(get_current_user),
):
    """Phase 79 — resend the signing invitation email to a single recipient.

    Re-renders the signing URL (recipient.public_token) and pushes a fresh
    email through the existing EmailService. Updates the recipient's
    `resent_at` timestamp on success for auditing.
    """
    document = await db.docflow_documents.find_one(
        {"id": document_id, "tenant_id": current_user.tenant_id},
        {"_id": 0},
    )
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    recipient = next(
        (r for r in (document.get("recipients") or []) if r.get("id") == recipient_id),
        None,
    )
    if not recipient:
        raise HTTPException(status_code=404, detail="Recipient not found")
    if not recipient.get("email"):
        raise HTTPException(status_code=400, detail="Recipient has no email to send to")

    # Build signing URL using existing EmailService helper pattern
    try:
        from ..services.system_email_service import SystemEmailService
        email_service = SystemEmailService()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Email service unavailable: {e}")

    public_token = recipient.get("public_token")
    if not public_token:
        raise HTTPException(status_code=400, detail="Recipient has no public_token")

    # Resolve a sensible frontend base URL (same logic used on initial send)
    frontend_base = os.environ.get("FRONTEND_URL") or os.environ.get("PUBLIC_BASE_URL") or ""
    recipient_url = f"{frontend_base.rstrip('/')}/docflow/view/{public_token}" if frontend_base else f"/docflow/view/{public_token}"

    try:
        result = await email_service.send_document_email(
            recipient_email=recipient.get("email"),
            recipient_name=recipient.get("name") or recipient.get("email"),
            template_name=document.get("template_name") or "Document",
            document_url=recipient_url,
            pdf_content=None,
            sender_name="DocFlow CRM"
        )
    except Exception as e:
        logger.error(f"Error resending email: {e}")
        raise HTTPException(status_code=500, detail="Unable to resend email. Please try again.")

    if not result.get("success"):
        raise HTTPException(status_code=502, detail=result.get("error") or "Unable to resend email. Please try again.")

    # Audit: stamp resent_at on the recipient + push audit_trail event
    now_iso = datetime.now(timezone.utc).isoformat()
    await db.docflow_documents.update_one(
        {"id": document_id, "recipients.id": recipient_id},
        {
            "$set": {"recipients.$.resent_at": now_iso, "updated_at": now_iso},
            "$push": {
                "audit_trail": {
                    "event": "email_resent",
                    "actor": current_user.email,
                    "recipient_id": recipient_id,
                    "recipient_email": recipient.get("email"),
                    "at": now_iso,
                }
            },
        },
    )

    return {"success": True, "resent_at": now_iso}


async def _advance_sequential_routing(document_id: str, tenant_id: str, voided_recipient_id: str) -> Optional[dict]:
    """Phase 80 — for sequential routing, when the ACTIVE recipient is voided,
    advance to the next non-voided, non-signed recipient in order and send
    them a fresh signing email. Returns the newly-activated recipient dict
    (with side-effect email sent) or None if no next recipient exists."""
    doc = await db.docflow_documents.find_one(
        {"id": document_id, "tenant_id": tenant_id},
        {"_id": 0},
    )
    if not doc:
        return None
    if (doc.get("routing_mode") or "parallel").lower() != "sequential":
        return None

    recipients = sorted(
        doc.get("recipients") or [],
        key=lambda r: r.get("routing_order") if r.get("routing_order") is not None else 9999,
    )
    # Find next candidate after the voided recipient's order
    voided = next((r for r in recipients if r.get("id") == voided_recipient_id), None)
    if not voided:
        return None
    voided_order = voided.get("routing_order") or 0

    next_r = next(
        (
            r for r in recipients
            if (r.get("routing_order") or 0) > voided_order
            and not r.get("voided")
            and r.get("status") not in ("signed", "completed", "voided")
        ),
        None,
    )
    if not next_r:
        return None

    # Send signing email to the next recipient
    try:
        from ..services.system_email_service import SystemEmailService
        email_service = SystemEmailService()
    except Exception as e:
        logger.warning(f"EmailService unavailable for sequential advance: {e}")
        return next_r

    public_token = next_r.get("public_token")
    frontend_base = os.environ.get("FRONTEND_URL") or os.environ.get("PUBLIC_BASE_URL") or ""
    recipient_url = f"{frontend_base.rstrip('/')}/docflow/view/{public_token}" if frontend_base and public_token else (f"/docflow/view/{public_token}" if public_token else "")

    try:
        if recipient_url and next_r.get("email"):
            await email_service.send_document_email(
                recipient_email=next_r.get("email"),
                recipient_name=next_r.get("name") or next_r.get("email"),
                template_name=doc.get("template_name") or "Document",
                document_url=recipient_url,
                pdf_content=None,
                sender_name="DocFlow CRM"
            )
    except Exception as e:
        logger.warning(f"Sequential advance email failed: {e}")

    # Stamp sent_at on the advanced recipient
    now_iso = datetime.now(timezone.utc).isoformat()
    await db.docflow_documents.update_one(
        {"id": document_id, "recipients.id": next_r.get("id")},
        {
            "$set": {
                "recipients.$.sent_at": now_iso,
                "recipients.$.status": "sent",
                "updated_at": now_iso,
            },
            "$push": {
                "audit_trail": {
                    "event": "sequential_advanced",
                    "recipient_id": next_r.get("id"),
                    "recipient_email": next_r.get("email"),
                    "at": now_iso,
                }
            },
        },
    )
    return next_r


@router.post("/documents/{document_id}/recipients/{recipient_id}/void")
async def void_recipient(
    document_id: str,
    recipient_id: str,
    current_user: User = Depends(get_current_user),
):
    """Phase 80 — void a single recipient (EMAIL flow only).

    Blocks the recipient from opening their signing link, advances sequential
    routing to the next recipient, and sends a cancellation email. Already-
    signed recipients cannot be voided (returns 409).
    """
    document = await db.docflow_documents.find_one(
        {"id": document_id, "tenant_id": current_user.tenant_id},
        {"_id": 0},
    )
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    recipient = next(
        (r for r in (document.get("recipients") or []) if r.get("id") == recipient_id),
        None,
    )
    if not recipient:
        raise HTTPException(status_code=404, detail="Recipient not found")

    # Public link docs don't have per-recipient void semantics
    channels = document.get("delivery_channels") or []
    if "public_link" in channels and "email" not in channels:
        raise HTTPException(status_code=400, detail="Void is only supported for Email flow documents")

    if recipient.get("status") in ("signed", "completed") or recipient.get("signed_at"):
        raise HTTPException(status_code=409, detail="Cannot void a recipient who has already signed")
    if recipient.get("voided"):
        raise HTTPException(status_code=409, detail="Recipient is already voided")

    now_iso = datetime.now(timezone.utc).isoformat()
    await db.docflow_documents.update_one(
        {"id": document_id, "recipients.id": recipient_id},
        {
            "$set": {
                "recipients.$.voided": True,
                "recipients.$.voided_at": now_iso,
                "recipients.$.voided_by": current_user.email,
                "recipients.$.status": "voided",
                "updated_at": now_iso,
            },
            "$push": {
                "audit_trail": {
                    "event": "recipient_voided",
                    "actor": current_user.email,
                    "recipient_id": recipient_id,
                    "recipient_email": recipient.get("email"),
                    "at": now_iso,
                }
            },
        },
    )

    # Send cancellation email (best-effort, never blocks the void)
    try:
        from ..services.email_service import EmailService
        email_service = EmailService()
        if recipient.get("email") and email_service.smtp_user and email_service.smtp_password:
            subject = f"Signing request cancelled: {document.get('template_name') or 'Document'}"
            body_html = f"""
            <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
              <h2 style="color:#b91c1c; margin:0 0 12px;">Signing request cancelled</h2>
              <p>Hello {recipient.get('name') or recipient.get('email')},</p>
              <p>Your signing request for <strong>{document.get('template_name') or 'Document'}</strong> has been cancelled by the sender. You will no longer be able to access or sign the document.</p>
              <p>If you believe this was a mistake, please contact the sender directly.</p>
              <hr style="border:none; border-top:1px solid #e5e7eb; margin:24px 0;" />
              <p style="color:#9ca3af; font-size:12px;">Sent by DocFlow CRM</p>
            </div>
            """
            await email_service._send_email(
                to_email=recipient.get("email"),
                subject=subject,
                html_body=body_html,
            )
    except Exception as e:
        logger.warning(f"Void cancellation email failed: {e}")

    # Sequential routing: advance to next if applicable
    advanced = await _advance_sequential_routing(document_id, current_user.tenant_id, recipient_id)

    return {
        "success": True,
        "voided_at": now_iso,
        "advanced_to": {
            "id": advanced.get("id"),
            "name": advanced.get("name"),
            "email": advanced.get("email"),
        } if advanced else None,
    }


@router.post("/documents/{document_id}/recipients/{recipient_id}/unvoid")
async def unvoid_recipient(
    document_id: str,
    recipient_id: str,
    current_user: User = Depends(get_current_user),
):
    """Phase 80 — unvoid (restore) a previously voided recipient.

    Flips `voided=False`, restores status back to `pending` (or `sent` if the
    recipient had been sent already), clears void stamps, and re-sends a
    fresh signing email so the recipient has a working link.
    """
    document = await db.docflow_documents.find_one(
        {"id": document_id, "tenant_id": current_user.tenant_id},
        {"_id": 0},
    )
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    recipient = next(
        (r for r in (document.get("recipients") or []) if r.get("id") == recipient_id),
        None,
    )
    if not recipient:
        raise HTTPException(status_code=404, detail="Recipient not found")

    if not recipient.get("voided") and recipient.get("status") != "voided":
        raise HTTPException(status_code=409, detail="Recipient is not voided")

    # Decide the restored status: pending if never sent, else sent
    restored_status = "sent" if recipient.get("sent_at") else "pending"

    now_iso = datetime.now(timezone.utc).isoformat()
    await db.docflow_documents.update_one(
        {"id": document_id, "recipients.id": recipient_id},
        {
            "$set": {
                "recipients.$.voided": False,
                "recipients.$.voided_at": None,
                "recipients.$.voided_by": None,
                "recipients.$.status": restored_status,
                "recipients.$.unvoided_at": now_iso,
                "recipients.$.unvoided_by": current_user.email,
                "updated_at": now_iso,
            },
            "$push": {
                "audit_trail": {
                    "event": "recipient_unvoided",
                    "actor": current_user.email,
                    "recipient_id": recipient_id,
                    "recipient_email": recipient.get("email"),
                    "at": now_iso,
                }
            },
        },
    )

    # Send fresh signing email so the recipient has a working link
    try:
        from ..services.email_service import EmailService
        email_service = EmailService()
        public_token = recipient.get("public_token")
        frontend_base = os.environ.get("FRONTEND_URL") or os.environ.get("PUBLIC_BASE_URL") or ""
        recipient_url = (
            f"{frontend_base.rstrip('/')}/docflow/view/{public_token}"
            if frontend_base and public_token
            else (f"/docflow/view/{public_token}" if public_token else "")
        )
        if recipient_url and recipient.get("email"):
            await email_service.send_document_email(
                recipient_email=recipient.get("email"),
                recipient_name=recipient.get("name") or recipient.get("email"),
                template_name=document.get("template_name") or "Document",
                document_url=recipient_url,
                pdf_content=None,
                sender_name="DocFlow CRM",
                expires_in_days=None,
            )
    except Exception as e:
        logger.warning(f"Unvoid signing email failed: {e}")

    return {"success": True, "unvoided_at": now_iso, "status": restored_status}



async def document_role_action(document_id: str, request: Request):
    """Handle Approver/Reviewer actions on a template-level document."""
    from datetime import timezone
    body = await request.json()
    action = body.get("action")  # approve, reject, review
    recipient_token = body.get("recipient_token")
    rejection_reason = body.get("reason", "").strip() if action == "reject" else None

    if action not in ("approve", "reject", "review"):
        raise HTTPException(status_code=400, detail="Invalid action. Must be approve, reject, or review.")

    if action == "reject" and not rejection_reason:
        raise HTTPException(status_code=400, detail="Rejection reason is required.")

    document = await db.docflow_documents.find_one({"id": document_id})
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    # Find the matching recipient by token
    recipients = document.get("recipients", [])
    matched = None
    for r in recipients:
        if r.get("public_token") == recipient_token:
            matched = r
            break
    if not matched:
        raise HTTPException(status_code=404, detail="Recipient not found")

    role = matched.get("role_type", matched.get("role", "SIGN")).upper()
    if action in ("approve", "reject") and role != "APPROVE_REJECT":
        raise HTTPException(status_code=400, detail=f"Recipient role is {role}, not APPROVE_REJECT")
    if action == "review" and role not in ("VIEW_ONLY", "REVIEWER"):
        raise HTTPException(status_code=400, detail=f"Recipient role is {role}, not REVIEWER")

    # Extract metadata
    ip_address = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent", "")

    now = datetime.now(timezone.utc).isoformat()
    action_taken = action + "ed" if action == "reject" else (action + "d" if action != "review" else "reviewed")  # approved, rejected, reviewed

    # Update recipient status with metadata
    update_set = {
        "recipients.$.status": action_taken,
        "recipients.$.action_taken": action_taken,
        "recipients.$.action_at": now,
        "recipients.$.ip_address": ip_address,
        "recipients.$.user_agent": user_agent,
        "updated_at": now,
    }
    if rejection_reason:
        update_set["recipients.$.reject_reason"] = rejection_reason

    await db.docflow_documents.update_one(
        {"id": document_id, "recipients.public_token": recipient_token},
        {"$set": update_set}
    )

    # If rejected, mark document as declined with reason
    if action == "reject":
        await db.docflow_documents.update_one(
            {"id": document_id},
            {"$set": {
                "status": "declined",
                "reject_reason": rejection_reason,
                "rejected_by": matched.get("name", ""),
                "rejected_at": now,
                "updated_at": now,
            }}
        )

    # Check if all recipients are done
    updated_doc = await db.docflow_documents.find_one({"id": document_id}, {"_id": 0, "recipients": 1, "status": 1, "tenant_id": 1, "delivery_channels": 1, "routing_mode": 1, "template_name": 1})
    all_done = all(
        r.get("status") in ("signed", "completed", "approved", "reviewed", "receive_copy")
        for r in updated_doc.get("recipients", [])
        if r.get("role_type", r.get("role", "SIGN")).upper() != "RECEIVE_COPY"
    )
    if all_done and updated_doc.get("status") != "declined":
        await db.docflow_documents.update_one(
            {"id": document_id},
            {"$set": {"status": "completed", "completed_at": now, "updated_at": now}}
        )
        # Send completion email to ALL recipients
        try:
            from ..services.system_email_service import SystemEmailService
            email_svc = SystemEmailService()
            doc_name = updated_doc.get("template_name", "Document")
            frontend_url = os.environ.get("FRONTEND_URL", "")
            if not frontend_url:
                try:
                    from services.email_service import FRONTEND_URL
                    frontend_url = FRONTEND_URL or ""
                except Exception:
                    pass
            for r in updated_doc.get("recipients", []):
                if r.get("email"):
                    view_url = f"{frontend_url}/docflow/view/{r.get('public_token')}" if r.get("public_token") else ""
                    await email_svc.send_workflow_notification_email(
                        to_email=r["email"], to_name=r.get("name", ""),
                        document_name=doc_name, notification_type="completed",
                        extra={"view_url": view_url},
                    )
            logger.info(f"Sent completion emails to all recipients for document {document_id}")
        except Exception as ce:
            logger.warning(f"Failed to send completion emails: {ce}")

    # Send approval/rejection notification to previous recipients
    if action in ("approve", "reject"):
        try:
            from ..services.system_email_service import SystemEmailService
            email_svc = SystemEmailService()
            doc_name = updated_doc.get("template_name", "Document")
            notify_type = "approved" if action == "approve" else "rejected"
            extra_info = {
                "actor_name": matched.get("name", ""),
                "reason": rejection_reason if action == "reject" else None,
            }
            for r in updated_doc.get("recipients", []):
                if r.get("email") and r.get("public_token") != recipient_token:
                    if r.get("status") in ("signed", "completed", "approved", "reviewed"):
                        await email_svc.send_workflow_notification_email(
                            to_email=r["email"], to_name=r.get("name", ""),
                            document_name=doc_name, notification_type=notify_type,
                            extra=extra_info,
                        )
            logger.info(f"Sent {notify_type} notification emails for document {document_id}")
        except Exception as ne:
            logger.warning(f"Failed to send {action} notification emails: {ne}")

    # Sequential routing: activate next recipient after approve/review
    if action in ("approve", "review") and not all_done and updated_doc.get("status") != "declined":
        recipients_latest = updated_doc.get("recipients", [])
        required_sorted = sorted(
            [r for r in recipients_latest if r.get("is_required", True)],
            key=lambda r: int(r.get("routing_order", 1) or 1)
        )
        matched_index = next((i for i, r in enumerate(required_sorted) if r.get("public_token") == recipient_token), None)
        if matched_index is not None:
            next_recipient = None
            for r in required_sorted[matched_index + 1:]:
                if r.get("status") not in ("signed", "completed", "approved", "reviewed", "declined"):
                    next_recipient = r
                    break
            if next_recipient:
                next_id = next_recipient.get("id")
                await db.docflow_documents.update_one(
                    {"id": document_id, "recipients.id": next_id},
                    {"$set": {"recipients.$.status": "sent", "recipients.$.sent_at": now}}
                )
                logger.info(f"Advanced workflow: activated next recipient {next_recipient.get('name')} ({next_recipient.get('email')})")

                # Send email to next recipient
                try:
                    from ..services.document_service_enhanced import EnhancedDocumentService
                    doc_svc = EnhancedDocumentService(db)
                    frontend_url = os.environ.get("FRONTEND_URL", "")
                    if not frontend_url:
                        from services.email_service import FRONTEND_URL
                        frontend_url = FRONTEND_URL or ""
                    if "email" in (updated_doc.get("delivery_channels") or []) and next_recipient.get("email"):
                        recipient_url = f"{frontend_url}/docflow/view/{next_recipient.get('public_token')}"
                        await doc_svc.email_service.send_document_email(
                            recipient_email=next_recipient.get("email"),
                            recipient_name=next_recipient.get("name"),
                            template_name=updated_doc.get("template_name", "Document"),
                            document_url=recipient_url,
                            pdf_content=None,
                            sender_name="DocFlow CRM",
                        )
                        logger.info(f"Sent notification email to next recipient: {next_recipient.get('email')}")
                except Exception as email_err:
                    logger.warning(f"Failed to email next recipient: {email_err}")

    # Fire template-level webhook for approve/reject/review
    try:
        from ..services.webhook_service import WebhookService
        wh = WebhookService(db)
        wh_event = action
        await wh.fire_document_event(
            document_id=document_id,
            event_type=wh_event,
            tenant_id=document.get("tenant_id", ""),
            extra_data={
                "action": action_taken,
                "recipient_name": matched.get("name", ""),
                "recipient_email": matched.get("email", ""),
                "role_type": role,
                "reason": rejection_reason if action == "reject" else None,
                "metadata": {
                    "ip_address": ip_address,
                    "user_agent": user_agent,
                    "performed_by": body.get("name") or matched.get("name", ""),
                    "performed_by_email": body.get("email") or matched.get("email", ""),
                },
            },
        )
    except Exception as e:
        logger.warning(f"Webhook fire for role-action failed: {e}")

    return {"success": True, "action": action_taken, "message": f"Document {action_taken} successfully"}
