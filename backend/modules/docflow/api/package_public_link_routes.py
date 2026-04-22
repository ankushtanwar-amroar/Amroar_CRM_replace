"""
DocFlow Package Public Link Routes — Multi-User Public Link Flow

Endpoints for reusable public links that support multiple independent submissions:
- Get package info by public link token
- Check if email already submitted
- Submit with field data (creates signed PDFs per submission)
- Download signed document for a submission
- List submissions (admin)
"""
import io
import base64
import logging
import secrets
from datetime import datetime, timezone
from uuid import uuid4
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Optional, Dict, Any

import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..')))

from shared.database import db
from ..services.docflow_audit_service import DocFlowAuditService
from ..services.webhook_service import WebhookService

router = APIRouter(prefix="/docflow/packages/public-link", tags=["DocFlow Public Link"])

logger = logging.getLogger(__name__)
audit_service = DocFlowAuditService(db)
webhook_service = WebhookService(db)


async def _find_package_by_public_link_token(token: str):
    """Find package by its public_link_token."""
    package = await db.docflow_packages.find_one(
        {"public_link_token": token},
        {"_id": 0},
    )
    return package


@router.get("/{token}")
async def get_public_link_package(token: str):
    """
    Get package info for a public link. Returns package metadata and documents.
    No authentication required — this is the multi-user entry point.
    """
    package = await _find_package_by_public_link_token(token)
    if not package:
        raise HTTPException(status_code=404, detail="Package not found or link expired")

    if package.get("status") == "voided":
        raise HTTPException(status_code=410, detail="This package has been voided")
    if package.get("status") == "expired":
        raise HTTPException(status_code=410, detail="This package has expired")

    # Build documents list with template info
    documents = []
    for doc in package.get("documents", []):
        doc_id = doc.get("document_id")
        doc_detail = None
        if doc_id:
            doc_detail = await db.docflow_documents.find_one(
                {"id": doc_id},
                {"_id": 0, "id": 1, "status": 1, "unsigned_pdf_url": 1}
            )
        documents.append({
            "document_id": doc_id,
            "template_id": doc.get("template_id"),
            "document_name": doc.get("document_name", ""),
            "order": doc.get("order", 1),
            "status": doc_detail.get("status", "generated") if doc_detail else "generated",
            "has_pdf": bool(doc_detail.get("unsigned_pdf_url")) if doc_detail else False,
        })

    require_otp = package.get("security_settings", {}).get("require_auth", True)

    return {
        "package_id": package["id"],
        "package_name": package.get("name", ""),
        "package_status": package.get("status", "draft"),
        "require_otp": require_otp,
        "total_documents": len(documents),
        "documents": documents,
    }


class CheckSubmissionRequest(BaseModel):
    email: str


@router.post("/{token}/check-submission")
async def check_submission(token: str, req: CheckSubmissionRequest):
    """Check if a user with this email has already submitted for this package."""
    package = await _find_package_by_public_link_token(token)
    if not package:
        raise HTTPException(status_code=404, detail="Package not found or link expired")

    existing = await db.docflow_public_submissions.find_one(
        {
            "package_id": package["id"],
            "email": req.email.lower().strip(),
            "status": "completed",
        },
        {"_id": 0, "id": 1, "name": 1, "email": 1, "submitted_at": 1,
         "signed_documents": 1, "status": 1}
    )

    if existing:
        return {
            "already_submitted": True,
            "submission": existing,
        }

    return {"already_submitted": False}


class PublicLinkOtpRequest(BaseModel):
    name: str
    email: str


@router.post("/{token}/send-otp")
async def send_public_link_otp(token: str, req: PublicLinkOtpRequest):
    """Send OTP for public link email verification with rate limiting."""
    package = await _find_package_by_public_link_token(token)
    if not package:
        raise HTTPException(status_code=404, detail="Package not found")

    email = req.email.lower().strip()
    name = req.name.strip()
    if not email or not name:
        raise HTTPException(status_code=400, detail="Name and email are required")

    now = datetime.now(timezone.utc)
    from datetime import timedelta

    # --- Rate limiting: 60-second cooldown ---
    last_otp = await db.docflow_public_link_otps.find_one(
        {"package_id": package["id"], "email": email},
        sort=[("created_at", -1)],
    )
    if last_otp:
        last_created = datetime.fromisoformat(last_otp["created_at"])
        if last_created.tzinfo is None:
            last_created = last_created.replace(tzinfo=timezone.utc)
        elapsed = (now - last_created).total_seconds()
        if elapsed < 60:
            remaining = int(60 - elapsed)
            raise HTTPException(
                status_code=429,
                detail=f"Please wait {remaining} seconds before requesting another code",
            )

    # --- Rate limiting: max 5 per hour ---
    one_hour_ago = (now - timedelta(hours=1)).isoformat()
    recent_count = await db.docflow_public_link_otps.count_documents({
        "package_id": package["id"],
        "email": email,
        "created_at": {"$gte": one_hour_ago},
    })
    if recent_count >= 5:
        raise HTTPException(
            status_code=429,
            detail="Too many verification attempts. Please try again later.",
        )

    import random
    otp_code = f"{random.randint(100000, 999999)}"
    expires_at = now + timedelta(minutes=10)

    # Send OTP email BEFORE storing — only persist if delivery succeeds
    try:
        from modules.docflow.services.email_notification_service import send_otp_email
        result = send_otp_email(
            recipient_email=email,
            otp_code=otp_code,
            recipient_name=name,
            package_name=package.get("name", "Document Package"),
        )
        if not result:
            raise HTTPException(
                status_code=502,
                detail="Failed to send verification email. Please try again.",
            )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[Public Link OTP] Failed to send OTP to {email}: {e}")
        raise HTTPException(
            status_code=502,
            detail="Failed to send verification email. Please try again.",
        )

    # Email sent successfully — now persist the OTP record
    await db.docflow_public_link_otps.insert_one({
        "package_id": package["id"],
        "email": email,
        "otp_code": otp_code,
        "verified": False,
        "created_at": now.isoformat(),
        "expires_at": expires_at.isoformat(),
    })

    return {"success": True, "message": "Verification code sent to your email"}


class PublicLinkVerifyOtpRequest(BaseModel):
    email: str
    otp_code: str


@router.post("/{token}/verify-otp")
async def verify_public_link_otp(token: str, req: PublicLinkVerifyOtpRequest):
    """Verify OTP for public link access."""
    package = await _find_package_by_public_link_token(token)
    if not package:
        raise HTTPException(status_code=404, detail="Package not found")

    email = req.email.lower().strip()
    now = datetime.now(timezone.utc)

    otp_record = await db.docflow_public_link_otps.find_one({
        "package_id": package["id"],
        "email": email,
        "otp_code": req.otp_code.strip(),
        "verified": False,
    })

    if not otp_record:
        raise HTTPException(status_code=401, detail="Invalid verification code")

    expires_at = datetime.fromisoformat(otp_record["expires_at"])
    if now > expires_at:
        raise HTTPException(status_code=401, detail="Verification code has expired")

    await db.docflow_public_link_otps.update_one(
        {"_id": otp_record["_id"]},
        {"$set": {"verified": True, "verified_at": now.isoformat()}},
    )

    return {"success": True, "verified": True}


class PublicLinkSubmitRequest(BaseModel):
    name: str
    email: str
    documents_field_data: Dict[str, Dict[str, Any]] = {}


@router.post("/{token}/submit")
async def submit_public_link(
    token: str,
    req: PublicLinkSubmitRequest,
    request: Request,
):
    """
    Submit a new signing via public link. Each submission is independent.
    Creates signed PDFs per document and stores the submission record.
    """
    package = await _find_package_by_public_link_token(token)
    if not package:
        raise HTTPException(status_code=404, detail="Package not found or link expired")

    if package.get("status") in ("voided", "expired"):
        raise HTTPException(status_code=410, detail=f"Package is {package.get('status')}")

    if not req.name.strip() or not req.email.strip():
        raise HTTPException(status_code=400, detail="Name and email are required")

    email = req.email.lower().strip()
    name = req.name.strip()

    # Check for duplicate submission
    existing = await db.docflow_public_submissions.find_one(
        {"package_id": package["id"], "email": email, "status": "completed"},
        {"_id": 0, "id": 1}
    )
    if existing:
        raise HTTPException(status_code=409, detail="You have already submitted for this package")

    submission_id = str(uuid4())
    now = datetime.now(timezone.utc)
    signed_documents = []

    # Process each document — embed field data into PDF
    for pkg_doc in package.get("documents", []):
        doc_id = pkg_doc.get("document_id")
        template_id = pkg_doc.get("template_id")
        if not doc_id:
            continue

        field_data_for_doc = req.documents_field_data.get(doc_id, {})

        try:
            document = await db.docflow_documents.find_one({"id": doc_id}, {"_id": 0})
            if not document:
                continue

            # Load template field placements
            template = await db.docflow_templates.find_one(
                {"id": template_id},
                {"_id": 0, "field_placements": 1}
            )
            field_placements = (template or {}).get("field_placements", [])

            from ..services.s3_service import S3Service
            s3_service = S3Service()

            # Get the unsigned PDF as base
            unsigned_key = document.get("unsigned_s3_key")
            if not unsigned_key:
                continue

            pdf_bytes = s3_service.download_file(unsigned_key)
            if not pdf_bytes:
                continue

            # Embed field values into PDF using PyMuPDF
            import fitz
            pdf_doc = fitz.open(stream=pdf_bytes, filetype="pdf")

            for field in field_placements:
                field_id = field.get("id")
                field_type = field.get("type")
                field_value = field_data_for_doc.get(field_id)
                if not field_value and field_value is not False:
                    continue

                page_num = (field.get("page", 1) or 1) - 1
                if page_num < 0 or page_num >= len(pdf_doc):
                    continue

                page = pdf_doc[page_num]
                page_rect = page.rect
                pdf_w = page_rect.width
                scale = pdf_w / 800

                x = field.get("x", 0) * scale
                y = field.get("y", 0) * scale
                w = field.get("width", 100) * scale
                h = field.get("height", 30) * scale

                if field_type in ("signature", "initials") and field_value:
                    try:
                        if isinstance(field_value, str) and field_value.startswith("data:image"):
                            b64_data = field_value.split(",", 1)[1]
                            img_bytes = base64.b64decode(b64_data)
                            # Aspect-fit + align inside the author's box (Phase 56).
                            try:
                                pm = fitz.Pixmap(img_bytes)
                                img_w, img_h = pm.width, pm.height
                                pm = None
                            except Exception:
                                img_w = img_h = 0
                            align = (field.get("style") or {}).get("textAlign") or "center"
                            if img_w > 0 and img_h > 0:
                                aspect = img_w / img_h
                                fit_w, fit_h = h * aspect, h
                                if fit_w > w:
                                    fit_w, fit_h = w, w / aspect
                            else:
                                fit_w, fit_h = w, h
                            if align == "left":
                                sub_x = x
                            elif align == "right":
                                sub_x = x + (w - fit_w)
                            else:
                                sub_x = x + (w - fit_w) / 2
                            sub_y = y + (h - fit_h) / 2
                            page.insert_image(fitz.Rect(sub_x, sub_y, sub_x + fit_w, sub_y + fit_h), stream=img_bytes)
                    except Exception as e:
                        logger.warning(f"Failed to embed {field_type} for field {field_id}: {e}")

                elif field_type in ("text", "date") and field_value:
                    try:
                        base_fs = float(field.get("style", {}).get("fontSize", 10) or 10)
                        font_size = base_fs * scale
                        height_cap = max(6, (h - 4 * scale) * 0.70)
                        width_cap  = max(6, w / 3)
                        font_size = max(6, min(font_size, height_cap, width_cap, 24))
                        text_str = str(field_value)
                        align = (field.get("style") or {}).get("textAlign") or "left"
                        try:
                            text_w = fitz.get_text_length(text_str, fontname="helv", fontsize=font_size)
                        except Exception:
                            text_w = 0
                        if align == "center":
                            tx = x + max(0, (w - text_w) / 2)
                        elif align == "right":
                            tx = x + max(0, w - text_w - 2 * scale)
                        else:
                            tx = x + 2 * scale
                        page.insert_text(fitz.Point(tx, y + h - 4 * scale), text_str, fontsize=font_size, color=(0, 0, 0))
                    except Exception as e:
                        logger.warning(f"Failed to embed text for field {field_id}: {e}")

                elif field_type == "radio":
                    try:
                        group = field.get("groupName") or field.get("group_name")
                        option_value = field.get("optionValue") or field.get("option_value") or field_id
                        selected_val = field_data_for_doc.get(group) if group else None
                        if selected_val is None:
                            selected_val = field_data_for_doc.get(field_id)
                        if selected_val != option_value:
                            continue
                        radius = min(7 * scale, (h / 2) - 2 * scale)
                        # Phase 73: Center the radio circle horizontally
                        # within the field bounding box (matches signing view).
                        cx = x + w / 2
                        cy = y + h / 2
                        page.draw_circle(fitz.Point(cx, cy), radius, color=(0, 0, 0), width=1 * scale)
                        page.draw_circle(fitz.Point(cx, cy), radius * 0.55, color=(0, 0, 0), fill=(0, 0, 0), width=0)
                        # Phase 56: option labels never drawn in final PDF.
                    except Exception as e:
                        logger.warning(f"Failed to embed radio field {field_id}: {e}")

                elif field_type == "checkbox":
                    try:
                        is_checked = field_value in (True, "true", "True")
                        box_size = min(14 * scale, h - 4 * scale)
                        # Phase 73: Center the checkbox horizontally within the
                        # field bounding box (matches signing view's justify-center).
                        bx = x + (w - box_size) / 2
                        by = y + (h - box_size) / 2
                        box_rect = fitz.Rect(bx, by, bx + box_size, by + box_size)
                        page.draw_rect(box_rect, color=(0, 0, 0), width=1)
                        if is_checked:
                            p1 = fitz.Point(bx + 2 * scale, by + box_size * 0.5)
                            p2 = fitz.Point(bx + box_size * 0.4, by + box_size - 2 * scale)
                            p3 = fitz.Point(bx + box_size - 2 * scale, by + 2 * scale)
                            shape = page.new_shape()
                            shape.draw_line(p1, p2)
                            shape.draw_line(p2, p3)
                            shape.finish(color=(0, 0, 0), width=1.5)
                            shape.commit()
                    except Exception as e:
                        logger.warning(f"Failed to embed checkbox for field {field_id}: {e}")

            signed_pdf_bytes = pdf_doc.tobytes()
            pdf_doc.close()

            # Upload signed PDF under submission-specific path
            signed_key = s3_service.upload_document(
                file_bytes=signed_pdf_bytes,
                tenant_id=package["tenant_id"],
                document_id=f"{doc_id}/submissions/{submission_id}",
                filename="signed.pdf",
                is_signed=True,
            )

            signed_url = ""
            if signed_key:
                signed_url = s3_service.get_document_url(signed_key, expiration=604800)

            signed_documents.append({
                "document_id": doc_id,
                "document_name": pkg_doc.get("document_name", ""),
                "signed_s3_key": signed_key or "",
                "signed_file_url": signed_url,
            })

        except Exception as e:
            logger.error(f"Failed to process document {doc_id} for submission: {e}")
            continue

    # Create submission record
    submission = {
        "id": submission_id,
        "package_id": package["id"],
        "tenant_id": package.get("tenant_id", ""),
        "name": name,
        "email": email,
        "status": "completed",
        "field_data": req.documents_field_data,
        "signed_documents": signed_documents,
        "submitted_at": now.isoformat(),
        "created_at": now.isoformat(),
        "ip_address": request.client.host if request.client else None,
        "user_agent": request.headers.get("user-agent"),
    }

    await db.docflow_public_submissions.insert_one(submission)

    # Audit log
    await audit_service.log_event(
        tenant_id=package.get("tenant_id", ""),
        package_id=package["id"],
        event_type="public_link_submission",
        actor=email,
        metadata={
            "submission_id": submission_id,
            "signer_name": name,
            "signer_email": email,
            "documents_signed": len(signed_documents),
        },
    )

    return {
        "success": True,
        "message": f"Submitted successfully ({len(signed_documents)} documents signed)",
        "submission_id": submission_id,
        "signed_documents": [
            {"document_id": sd["document_id"], "document_name": sd["document_name"], "signed_file_url": sd["signed_file_url"]}
            for sd in signed_documents
        ],
    }


@router.get("/{token}/submission/{submission_id}")
async def get_submission(token: str, submission_id: str):
    """Get a specific submission's details and download links."""
    package = await _find_package_by_public_link_token(token)
    if not package:
        raise HTTPException(status_code=404, detail="Package not found")

    submission = await db.docflow_public_submissions.find_one(
        {"id": submission_id, "package_id": package["id"]},
        {"_id": 0}
    )
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")

    # Refresh signed URLs if needed
    from ..services.s3_service import S3Service
    s3_service = S3Service()
    refreshed_docs = []
    for sd in submission.get("signed_documents", []):
        s3_key = sd.get("signed_s3_key")
        url = sd.get("signed_file_url", "")
        if s3_key:
            url = s3_service.get_document_url(s3_key, expiration=604800)
        refreshed_docs.append({
            "document_id": sd["document_id"],
            "document_name": sd.get("document_name", ""),
            "signed_file_url": url,
        })

    return {
        "id": submission["id"],
        "name": submission.get("name", ""),
        "email": submission.get("email", ""),
        "status": submission.get("status", ""),
        "submitted_at": submission.get("submitted_at"),
        "signed_documents": refreshed_docs,
    }
