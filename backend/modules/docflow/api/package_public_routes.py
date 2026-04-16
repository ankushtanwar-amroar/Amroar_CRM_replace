"""
DocFlow Package Public Routes — Phase 2 + Phase 4

Public endpoints for package recipients (no auth required):
- View package by recipient token
- Mark package as reviewed (VIEW_ONLY recipients)
- Approve / Reject (APPROVE_REJECT recipients)
- OTP verification with session management (Phase 4)
"""
import io
import base64
import logging
import secrets
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, HTTPException, Request, Header
from pydantic import BaseModel
from typing import Optional, Dict, List, Any

import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..')))

from shared.database import db
from ..services.package_service import PackageService
from ..services.docflow_audit_service import DocFlowAuditService
from ..services.routing_engine import RoutingEngine
from ..services.session_service import SessionService
from ..services.webhook_service import WebhookService

router = APIRouter(prefix="/docflow/packages/public", tags=["DocFlow Package Public"])

audit_service = DocFlowAuditService(db)
webhook_service = WebhookService(db)
routing_engine = RoutingEngine(db, audit_service=audit_service, webhook_service=webhook_service)
session_service = SessionService(db)


async def _find_package_by_recipient_token(token: str):
    """Find package and active recipient by the recipient's public_token."""
    package = await db.docflow_packages.find_one(
        {"recipients.public_token": token},
        {"_id": 0},
    )
    if not package:
        return None, None

    active_recipient = None
    for r in package.get("recipients", []):
        if r.get("public_token") == token:
            active_recipient = r
            break

    return package, active_recipient


async def _validate_session_for_request(
    token: str,
    x_session_token: Optional[str] = None,
) -> Optional[dict]:
    """
    Validate session for a request. Returns session data if valid.
    If package doesn't require auth, returns a stub session.
    """
    package, recipient = await _find_package_by_recipient_token(token)
    if not package or not recipient:
        return None

    require_auth = package.get("security_settings", {}).get("require_auth", True)
    if not require_auth:
        # No auth required — return a stub
        return {"package_id": package["id"], "recipient_id": recipient["id"], "recipient_email": recipient.get("email", ""), "no_auth": True}

    if not x_session_token:
        return None

    session = await session_service.validate_session(x_session_token)
    if not session:
        return None

    # Ensure session belongs to this recipient+package
    if session["package_id"] != package["id"] or session["recipient_id"] != recipient["id"]:
        return None

    return session


# ── OTP & Session Endpoints ──

class SendOtpRequest(BaseModel):
    name: str
    email: str

class VerifyOtpRequest(BaseModel):
    email: str
    otp_code: str

class VoidFromPublicRequest(BaseModel):
    reason: str


@router.post("/{token}/send-otp")
async def send_package_otp(token: str, req: SendOtpRequest):
    """
    Generate and send OTP to the recipient for package access verification.
    """
    package, recipient = await _find_package_by_recipient_token(token)
    if not package or not recipient:
        raise HTTPException(status_code=404, detail="Package not found or link expired")

    if package.get("status") in ("voided", "expired"):
        raise HTTPException(status_code=410, detail=f"Package is {package['status']}")

    # Generate 6-digit OTP
    otp_code = "".join([str(secrets.randbelow(10)) for _ in range(6)])
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=10)

    # Clean up old OTPs for this recipient
    await db.docflow_package_otps.delete_many({
        "package_id": package["id"],
        "recipient_id": recipient["id"],
        "verified": False,
    })

    # Store OTP
    await db.docflow_package_otps.insert_one({
        "package_id": package["id"],
        "recipient_id": recipient["id"],
        "recipient_token": token,
        "email": req.email.lower().strip(),
        "name": req.name.strip(),
        "otp_code": otp_code,
        "expires_at": expires_at.isoformat(),
        "verified": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })

    # Send OTP via email service
    try:
        from ..services.email_notification_service import EmailNotificationService
        email_svc = EmailNotificationService(db)
        await email_svc.send_otp_email(
            recipient_email=req.email.lower().strip(),
            recipient_name=req.name.strip(),
            otp_code=otp_code,
            package_name=package.get("name", "Document Package"),
        )
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"[OTP] Failed to send OTP email to {req.email}: {e}")

    return {"success": True, "message": "Verification code sent to your email"}


@router.post("/{token}/verify-otp")
async def verify_package_otp(token: str, req: VerifyOtpRequest):
    """
    Verify OTP and create a session for the recipient.
    Returns session_token on success.
    """
    package, recipient = await _find_package_by_recipient_token(token)
    if not package or not recipient:
        raise HTTPException(status_code=404, detail="Package not found or link expired")

    now = datetime.now(timezone.utc)

    otp_record = await db.docflow_package_otps.find_one({
        "package_id": package["id"],
        "recipient_id": recipient["id"],
        "email": req.email.lower().strip(),
        "otp_code": req.otp_code.strip(),
        "verified": False,
    })

    if not otp_record:
        raise HTTPException(status_code=401, detail="Invalid verification code")

    # Check expiration
    expires_at = datetime.fromisoformat(otp_record["expires_at"])
    if now > expires_at:
        raise HTTPException(status_code=401, detail="Verification code has expired")

    # Mark OTP as verified
    await db.docflow_package_otps.update_one(
        {"_id": otp_record["_id"]},
        {"$set": {"verified": True, "verified_at": now.isoformat()}},
    )

    # Get session timeout from package security settings
    timeout = package.get("security_settings", {}).get("session_timeout_minutes", 15)

    # Create session
    session_token = await session_service.create_session(
        package_id=package["id"],
        recipient_id=recipient["id"],
        recipient_email=req.email.lower().strip(),
        timeout_minutes=timeout,
    )

    return {
        "success": True,
        "session_token": session_token,
        "expires_in_minutes": timeout,
        "message": "Verified successfully",
    }


@router.post("/{token}/session/validate")
async def validate_session(
    token: str,
    x_session_token: Optional[str] = Header(None),
):
    """Check if the current session is still valid."""
    session = await _validate_session_for_request(token, x_session_token)
    if not session:
        raise HTTPException(status_code=401, detail="Session expired or invalid")
    return {"valid": True, "expires_at": session.get("expires_at")}


@router.post("/{token}/session/logout")
async def logout_session(
    token: str,
    x_session_token: Optional[str] = Header(None),
):
    """Invalidate the current session."""
    if x_session_token:
        await session_service.invalidate_session(x_session_token)
    return {"success": True, "message": "Session ended"}


@router.get("/{token}")
async def get_package_public(
    token: str,
    x_session_token: Optional[str] = Header(None),
):
    """
    Get package info by recipient's public token.
    Returns package metadata, documents list, and the active recipient's info.
    If require_auth=true and no valid session, returns limited info with session_required flag.
    """
    package, active_recipient = await _find_package_by_recipient_token(token)

    if not package:
        raise HTTPException(status_code=404, detail="Package not found or link expired")

    if not active_recipient:
        raise HTTPException(status_code=404, detail="Recipient not found")

    # Check package is accessible
    if package.get("status") == "voided":
        raise HTTPException(status_code=410, detail="This package has been voided")
    if package.get("status") == "expired":
        raise HTTPException(status_code=410, detail="This package has expired")

    require_auth = package.get("security_settings", {}).get("require_auth", True)
    has_valid_session = False

    if require_auth:
        session = await _validate_session_for_request(token, x_session_token)
        if session and not session.get("no_auth"):
            has_valid_session = True
        else:
            # Return limited info — prompt for OTP verification
            return {
                "package_id": package["id"],
                "package_name": package.get("name", ""),
                "package_status": package.get("status", "draft"),
                "session_required": True,
                "active_recipient": {
                    "id": active_recipient.get("id"),
                    "name": active_recipient.get("name", ""),
                    "email": active_recipient.get("email", ""),
                    "role_type": active_recipient.get("role_type", "SIGN"),
                    "status": active_recipient.get("status", "pending"),
                    "action_taken": active_recipient.get("action_taken"),
                },
                "security_settings": {
                    "require_auth": True,
                    "session_timeout_minutes": package.get("security_settings", {}).get("session_timeout_minutes", 15),
                },
            }
    else:
        has_valid_session = True

    # Full response with documents — session is valid
    documents = []
    for doc in package.get("documents", []):
        doc_id = doc.get("document_id")
        doc_detail = None
        if doc_id:
            doc_detail = await db.docflow_documents.find_one(
                {"id": doc_id}, {"_id": 0, "id": 1, "status": 1, "unsigned_pdf_url": 1, "signed_file_url": 1, "signed_s3_key": 1, "field_data": 1, "merge_field_values": 1}
            )
        documents.append({
            "document_id": doc_id,
            "template_id": doc.get("template_id"),
            "document_name": doc.get("document_name", ""),
            "order": doc.get("order", 1),
            "status": doc_detail.get("status", "generated") if doc_detail else "generated",
            "has_pdf": bool(doc_detail.get("unsigned_pdf_url") or doc_detail.get("signed_file_url")) if doc_detail else False,
            "signed_file_url": doc_detail.get("signed_file_url") if doc_detail else None,
            "has_signed_version": bool(doc_detail.get("signed_file_url") or doc_detail.get("signed_s3_key")) if doc_detail else False,
            "merge_field_values": doc_detail.get("merge_field_values", {}) if doc_detail else {},
            "field_data": doc_detail.get("field_data", {}) if doc_detail else {},
        })

    # Fire "opened" webhook when recipient views the package
    try:
        await webhook_service.fire_package_event(
            package_id=package["id"],
            event_type="opened",
            tenant_id=package.get("tenant_id", ""),
            extra_data={
                "recipient_name": active_recipient.get("name", ""),
                "recipient_email": active_recipient.get("email", ""),
            },
        )
    except Exception as e:
        logger.warning(f"Webhook fire_package_event (opened) failed: {e}")

    # Determine if all SIGN recipients in earlier waves have completed
    recipients = package.get("recipients", [])
    sign_recipients = [r for r in recipients if r.get("role_type") == "SIGN"]
    all_signing_complete = all(r.get("status") == "completed" for r in sign_recipients) if sign_recipients else False

    return {
        "package_id": package["id"],
        "package_name": package.get("name", ""),
        "package_status": package.get("status", "draft"),
        "session_required": False,
        "session_active": has_valid_session,
        "total_documents": len(documents),
        "documents": documents,
        "all_signing_complete": all_signing_complete,
        "active_recipient": {
            "id": active_recipient.get("id"),
            "name": active_recipient.get("name", ""),
            "email": active_recipient.get("email", ""),
            "role_type": active_recipient.get("role_type", "SIGN"),
            "status": active_recipient.get("status", "pending"),
            "action_taken": active_recipient.get("action_taken"),
            "routing_order": active_recipient.get("routing_order", 1),
            "assigned_components": active_recipient.get("assigned_components", {}),
        },
        "security_settings": {
            "require_auth": require_auth,
            "session_timeout_minutes": package.get("security_settings", {}).get("session_timeout_minutes", 15),
        },
    }


class MarkReviewedRequest(BaseModel):
    reviewer_name: Optional[str] = None
    reviewer_email: Optional[str] = None


class MarkSignedRequest(BaseModel):
    signer_name: Optional[str] = None
    signer_email: Optional[str] = None


@router.post("/{token}/mark-signed")
async def mark_signed(
    token: str,
    req: MarkSignedRequest,
    request: Request,
    x_session_token: Optional[str] = Header(None),
):
    """
    Mark a SIGN recipient as signed at the package level.
    Validates session (if require_auth), role and status before completing the action.
    Calls routing_engine.on_recipient_action to advance waves and complete package.
    """
    package, active_recipient = await _find_package_by_recipient_token(token)

    if not package:
        raise HTTPException(status_code=404, detail="Package not found or link expired")
    if not active_recipient:
        raise HTTPException(status_code=404, detail="Recipient not found")

    # Session validation
    require_auth = package.get("security_settings", {}).get("require_auth", True)
    if require_auth:
        session = await _validate_session_for_request(token, x_session_token)
        if not session:
            raise HTTPException(status_code=401, detail="Session expired. Please verify again.")

    # Validate package status
    if package.get("status") != "in_progress":
        raise HTTPException(
            status_code=400,
            detail=f"Package is '{package.get('status')}', cannot sign"
        )

    # Validate recipient role
    if active_recipient.get("role_type") != "SIGN":
        raise HTTPException(
            status_code=400,
            detail=f"Recipient role is '{active_recipient.get('role_type')}', not SIGN"
        )

    # Validate recipient status (must be notified or in_progress)
    if active_recipient.get("status") not in ("notified", "in_progress"):
        raise HTTPException(
            status_code=400,
            detail=f"Recipient already '{active_recipient.get('status')}'"
        )

    # Complete the recipient action via routing engine
    actor = active_recipient.get("email") or active_recipient.get("name") or "anonymous"
    success = await routing_engine.on_recipient_action(
        package_id=package["id"],
        recipient_id=active_recipient["id"],
        action="signed",
        actor=actor,
        metadata={
            "role_type": "SIGN",
            "ip_address": request.client.host if request.client else None,
            "user_agent": request.headers.get("user-agent"),
            "signer_name": req.signer_name or active_recipient.get("name"),
            "signer_email": req.signer_email or active_recipient.get("email"),
        },
    )

    if not success:
        raise HTTPException(status_code=400, detail="Failed to update recipient status")

    return {
        "success": True,
        "message": "Package signed successfully",
        "recipient_id": active_recipient["id"],
        "action": "signed",
    }


class SignWithFieldsRequest(BaseModel):
    signer_name: Optional[str] = None
    signer_email: Optional[str] = None
    documents_field_data: Dict[str, Dict[str, Any]] = {}  # { doc_id: { field_id: value } }


logger = logging.getLogger(__name__)


@router.post("/{token}/sign-with-fields")
async def sign_with_fields(
    token: str,
    req: SignWithFieldsRequest,
    request: Request,
    x_session_token: Optional[str] = Header(None),
):
    """
    Sign all documents in a package with field data.
    Embeds field values (signatures, text, dates, etc.) into each document's PDF,
    uploads the signed versions, and advances the routing engine.
    """
    package, active_recipient = await _find_package_by_recipient_token(token)

    if not package:
        raise HTTPException(status_code=404, detail="Package not found or link expired")
    if not active_recipient:
        raise HTTPException(status_code=404, detail="Recipient not found")

    # Session validation
    require_auth = package.get("security_settings", {}).get("require_auth", True)
    if require_auth:
        session = await _validate_session_for_request(token, x_session_token)
        if not session:
            raise HTTPException(status_code=401, detail="Session expired. Please verify again.")

    # Validate package status
    if package.get("status") != "in_progress":
        raise HTTPException(status_code=400, detail=f"Package is '{package.get('status')}', cannot sign")

    # Validate recipient role
    if active_recipient.get("role_type") != "SIGN":
        raise HTTPException(status_code=400, detail=f"Recipient role is '{active_recipient.get('role_type')}', not SIGN")

    # Validate recipient status
    if active_recipient.get("status") not in ("notified", "in_progress"):
        raise HTTPException(status_code=400, detail=f"Recipient already '{active_recipient.get('status')}'")

    signer_name = req.signer_name or active_recipient.get("name", "")
    signer_email = req.signer_email or active_recipient.get("email", "")
    recipient_id = active_recipient["id"]
    assigned_components = active_recipient.get("assigned_components", {})
    now = datetime.now(timezone.utc)

    # Process each document in the package
    signed_doc_count = 0
    for pkg_doc in package.get("documents", []):
        doc_id = pkg_doc.get("document_id")
        template_id = pkg_doc.get("template_id")
        if not doc_id:
            continue

        field_data_for_doc = req.documents_field_data.get(doc_id, {})
        if not field_data_for_doc and not template_id:
            continue

        try:
            # Load document
            document = await db.docflow_documents.find_one({"id": doc_id}, {"_id": 0})
            if not document:
                continue

            # Merge pre-existing field_data (from document generation merge fields)
            # with user-submitted field_data (signatures, text, dates)
            existing_doc_field_data = document.get("field_data", {}) or {}
            existing_merge_values = document.get("merge_field_values", {}) or {}
            combined_field_data = {**existing_merge_values, **existing_doc_field_data, **field_data_for_doc}

            # Load template field placements
            template = await db.docflow_templates.find_one(
                {"id": template_id},
                {"_id": 0, "field_placements": 1, "template_group_id": 1, "name": 1, "tenant_id": 1}
            )
            field_placements = (template or {}).get("field_placements", [])

            # If no field placements on this template version, resolve from latest
            if not field_placements and template:
                from ..services.document_service_enhanced import EnhancedDocumentService
                _doc_svc = EnhancedDocumentService(db)
                field_placements = await _doc_svc._resolve_latest_field_placements(template)
                if field_placements:
                    logger.info(f"sign-with-fields: Resolved {len(field_placements)} fields from latest template version")

            # Filter fields: assigned fields + non-assignable fields (merge, checkbox, radio, label)
            assigned_field_ids = set(assigned_components.get(template_id, []))
            NON_ASSIGNABLE_TYPES = {"merge", "checkbox", "radio", "label"}
            if assigned_field_ids:
                relevant_fields = [
                    f for f in field_placements
                    if f.get("id") in assigned_field_ids or f.get("type") in NON_ASSIGNABLE_TYPES
                ]
            else:
                # No assignment map — check template-level assigned_to
                has_any_assignment = any(f.get("assigned_to") or f.get("recipient_id") for f in field_placements)
                if has_any_assignment:
                    # Only embed unassigned fields (fields with no assigned_to)
                    relevant_fields = [
                        f for f in field_placements
                        if not f.get("assigned_to") and not f.get("recipient_id")
                    ]
                else:
                    # No assignments at all — embed all fields (backward compat)
                    relevant_fields = field_placements

            # Get the existing S3 service for PDF operations
            from ..services.s3_service import S3Service
            s3_service = S3Service()

            # Get the unsigned PDF bytes
            unsigned_key = document.get("unsigned_s3_key")
            signed_key = document.get("signed_s3_key")
            base_key = signed_key or unsigned_key
            if not base_key:
                continue

            pdf_bytes = s3_service.download_file(base_key)
            if not pdf_bytes:
                continue

            # Embed field values into PDF using PyMuPDF
            import fitz  # PyMuPDF
            pdf_doc = fitz.open(stream=pdf_bytes, filetype="pdf")

            for field in relevant_fields:
                field_id = field.get("id")
                field_type = field.get("type")
                field_value = combined_field_data.get(field_id)

                # For merge fields, also check by merge pattern keys (e.g., "Account.name")
                if not field_value and field_type == "merge":
                    merge_obj = field.get("merge_object") or field.get("mergeObject", "")
                    merge_fld = field.get("merge_field") or field.get("mergeField", "")
                    full_key = f"{merge_obj}.{merge_fld}" if merge_obj and merge_fld else ""
                    field_value = (combined_field_data.get(full_key)
                                   or combined_field_data.get(merge_fld)
                                   or "")

                # If exact match not found, try prefix match (handles truncated IDs from frontend)
                if not field_value and field_value is not False:
                    for k, v in combined_field_data.items():
                        if field_id.startswith(k) or k.startswith(field_id):
                            if v:
                                field_value = v
                                break

                if not field_value and field_value is not False:
                    continue

                page_num = (field.get("page", 1) or 1) - 1
                if page_num < 0 or page_num >= len(pdf_doc):
                    continue

                page = pdf_doc[page_num]
                page_rect = page.rect
                pdf_w = page_rect.width

                # Scale from 800px canvas coordinate system to PDF points
                scale = pdf_w / 800
                x = field.get("x", 0) * scale
                y = field.get("y", 0) * scale
                w = field.get("width", 100) * scale
                h = field.get("height", 30) * scale

                if field_type in ("signature", "initials") and field_value:
                    # Embed base64 image
                    try:
                        if isinstance(field_value, str) and field_value.startswith("data:image"):
                            b64_data = field_value.split(",", 1)[1]
                            img_bytes = base64.b64decode(b64_data)
                            img_rect = fitz.Rect(x, y, x + w, y + h)
                            page.insert_image(img_rect, stream=img_bytes)
                    except Exception as e:
                        logger.warning(f"Failed to embed {field_type} for field {field_id}: {e}")

                elif field_type in ("text", "date") and field_value:
                    try:
                        font_size = float(field.get("style", {}).get("fontSize", 10) or 10) * scale
                        font_size = max(6, min(font_size, 24))
                        text_point = fitz.Point(x + 2 * scale, y + h - 4 * scale)
                        page.insert_text(
                            text_point,
                            str(field_value),
                            fontsize=font_size,
                            color=(0, 0, 0)
                        )
                    except Exception as e:
                        logger.warning(f"Failed to embed text for field {field_id}: {e}")

                elif field_type == "checkbox":
                    try:
                        is_checked = field_value in (True, "true", "True")
                        box_size = min(14 * scale, h - 4 * scale)
                        bx = x + 2 * scale
                        by = y + (h - box_size) / 2
                        box_rect = fitz.Rect(bx, by, bx + box_size, by + box_size)
                        page.draw_rect(box_rect, color=(0, 0, 0), width=1)
                        if is_checked:
                            # Draw checkmark
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

                elif field_type == "merge" and field_value:
                    try:
                        # White background to cover placeholder text
                        bg_rect = fitz.Rect(x, y, x + w, y + h)
                        page.draw_rect(bg_rect, color=None, fill=(1, 1, 1))
                        font_size = float(field.get("style", {}).get("fontSize", 10) or 10) * scale
                        font_size = max(6, min(font_size, 24))
                        text_point = fitz.Point(x + 2 * scale, y + h - 4 * scale)
                        page.insert_text(
                            text_point,
                            str(field_value),
                            fontsize=font_size,
                            color=(0.05, 0.05, 0.15)
                        )
                    except Exception as e:
                        logger.warning(f"Failed to embed merge field {field_id}: {e}")

            # Save modified PDF
            signed_pdf_bytes = pdf_doc.tobytes()
            pdf_doc.close()

            # Upload signed PDF
            new_signed_key = s3_service.upload_document(
                file_bytes=signed_pdf_bytes,
                tenant_id=document["tenant_id"],
                document_id=doc_id,
                filename="signed.pdf",
                is_signed=True,
            )

            if new_signed_key:
                signed_url = s3_service.get_document_url(new_signed_key, expiration=604800)
                # Merge field data cumulatively
                existing_field_data = document.get("field_data", {}) or {}
                merged_field_data = {**existing_field_data, **combined_field_data}

                # Update document record
                update_data = {
                    "signed_s3_key": new_signed_key,
                    "signed_file_url": signed_url,
                    "field_data": merged_field_data,
                    "updated_at": now.isoformat(),
                }

                await db.docflow_documents.update_one(
                    {"id": doc_id},
                    {"$set": update_data}
                )

                # Log audit event
                await audit_service.log_event(
                    tenant_id=document["tenant_id"],
                    package_id=package["id"],
                    document_id=doc_id,
                    event_type="document_signed",
                    actor=signer_email or signer_name,
                    metadata={
                        "signer_name": signer_name,
                        "signer_email": signer_email,
                        "recipient_id": recipient_id,
                        "fields_filled": list(field_data_for_doc.keys()),
                    },
                )
                signed_doc_count += 1

        except Exception as e:
            logger.error(f"Failed to sign document {doc_id} in package: {e}")
            continue

    # Collect signed document URLs for webhook & email
    signed_doc_urls = []
    for pkg_doc in package.get("documents", []):
        doc_id = pkg_doc.get("document_id")
        if doc_id:
            doc = await db.docflow_documents.find_one({"id": doc_id}, {"_id": 0, "signed_file_url": 1, "template_name": 1})
            if doc and doc.get("signed_file_url"):
                signed_doc_urls.append({
                    "document_id": doc_id,
                    "template_name": doc.get("template_name", pkg_doc.get("document_name", "")),
                    "signed_document_url": doc["signed_file_url"],
                })

    # Check if this is public_recipients mode — independent signing, no routing
    delivery_mode = package.get("delivery_mode", "email")
    actor = signer_email or signer_name or "anonymous"

    if delivery_mode == "public_recipients":
        # ── Independent signing: skip routing engine wave logic ──
        now_iso = now.isoformat()

        # 1. Mark this recipient as completed directly
        await db.docflow_packages.update_one(
            {"id": package["id"], "recipients.id": recipient_id},
            {"$set": {
                "recipients.$.status": "completed",
                "recipients.$.action_taken": "signed",
                "recipients.$.action_at": now_iso,
                "updated_at": now_iso,
            }}
        )
        await db.docflow_package_runs.update_one(
            {"id": package["id"], "recipients.id": recipient_id},
            {"$set": {
                "recipients.$.status": "completed",
                "recipients.$.action_taken": "signed",
                "recipients.$.action_at": now_iso,
                "updated_at": now_iso,
            }}
        )

        # 2. Mark all documents as "signed" (not partially_signed)
        for pkg_doc in package.get("documents", []):
            did = pkg_doc.get("document_id")
            if did:
                await db.docflow_documents.update_one(
                    {"id": did},
                    {"$set": {"status": "signed", "updated_at": now_iso}}
                )

        # 3. Check if ALL recipients have completed → mark package as completed
        updated_pkg = await db.docflow_packages.find_one({"id": package["id"]}, {"_id": 0})
        all_done = all(
            r.get("status") in ("completed", "signed")
            for r in (updated_pkg or {}).get("recipients", [])
            if r.get("role_type") != "RECEIVE_COPY"
        )
        if all_done:
            await db.docflow_packages.update_one(
                {"id": package["id"]},
                {"$set": {"status": "completed", "completed_at": now_iso, "updated_at": now_iso}}
            )
            await db.docflow_package_runs.update_one(
                {"id": package["id"]},
                {"$set": {"status": "completed", "completed_at": now_iso, "updated_at": now_iso}}
            )

        # 4. Log audit event
        await audit_service.log_event(
            tenant_id=package.get("tenant_id", ""),
            package_id=package["id"],
            event_type="document_signed",
            recipient_id=recipient_id,
            actor=actor,
            metadata={
                "delivery_mode": "public_recipients",
                "signer_name": signer_name,
                "signer_email": signer_email,
                "documents_signed": signed_doc_count,
                "independent_signing": True,
            },
        )

        # 5. Fire webhook with status=signed (not partial)
        if webhook_service:
            try:
                await webhook_service.fire_package_event(
                    package_id=package["id"],
                    event_type="document_signed",
                    tenant_id=package.get("tenant_id", ""),
                    extra_data={
                        "recipient_id": recipient_id,
                        "action": "signed",
                        "status": "signed",
                        "signed_documents": signed_doc_urls,
                        "recipient_details": {"name": signer_name, "email": signer_email},
                        "timestamp": now_iso,
                    },
                )
            except Exception as e:
                logger.warning(f"Webhook failed: {e}")

        success = True
    else:
        # ── Standard routing engine flow for email/public_link/both ──
        success = await routing_engine.on_recipient_action(
            package_id=package["id"],
            recipient_id=recipient_id,
            action="signed",
            actor=actor,
            metadata={
                "role_type": "SIGN",
                "ip_address": request.client.host if request.client else None,
                "user_agent": request.headers.get("user-agent"),
                "signer_name": signer_name,
                "signer_email": signer_email,
                "documents_signed": signed_doc_count,
                "signed_documents": signed_doc_urls,
            },
        )

    if not success:
        raise HTTPException(status_code=400, detail="Failed to update recipient status")

    # Send signed document confirmation email to signer
    if signer_email and signed_doc_urls:
        try:
            from ..services.system_email_service import SystemEmailService
            email_svc = SystemEmailService()
            doc_links_html = "".join(
                f'<li><a href="{d["signed_document_url"]}">{d["template_name"] or "Document"}</a></li>'
                for d in signed_doc_urls
            )
            await email_svc.send_generic_email(
                to_email=signer_email,
                subject=f"Signing Complete — {package.get('name', 'Package')}",
                html_content=f"""
                <p>Hi {signer_name or 'there'},</p>
                <p>You have successfully signed the following documents in <strong>{package.get('name', 'Package')}</strong>:</p>
                <ul>{doc_links_html}</ul>
                <p>You can download the signed copies from the links above.</p>
                <p>Thank you,<br/>DocFlow</p>
                """,
            )
        except Exception as e:
            logger.warning(f"Failed to send signed doc email to {signer_email}: {e}")

    return {
        "success": True,
        "message": f"Package signed successfully ({signed_doc_count} documents)",
        "recipient_id": recipient_id,
        "action": "signed",
        "status": "signed" if delivery_mode == "public_recipients" else "processing",
        "documents_signed": signed_doc_count,
        "signed_documents": signed_doc_urls,
    }
async def mark_reviewed(
    token: str,
    req: MarkReviewedRequest,
    request: Request,
    x_session_token: Optional[str] = Header(None),
):
    """
    Mark a VIEW_ONLY recipient as reviewed.
    Validates session (if require_auth), role and status before completing the action.
    """
    package, active_recipient = await _find_package_by_recipient_token(token)

    if not package:
        raise HTTPException(status_code=404, detail="Package not found or link expired")
    if not active_recipient:
        raise HTTPException(status_code=404, detail="Recipient not found")

    # Session validation
    require_auth = package.get("security_settings", {}).get("require_auth", True)
    if require_auth:
        session = await _validate_session_for_request(token, x_session_token)
        if not session:
            raise HTTPException(status_code=401, detail="Session expired. Please verify again.")

    # Validate package status
    if package.get("status") != "in_progress":
        raise HTTPException(
            status_code=400,
            detail=f"Package is '{package.get('status')}', cannot mark as reviewed"
        )

    # Validate recipient role
    if active_recipient.get("role_type") not in ("VIEW_ONLY", "REVIEWER"):
        raise HTTPException(
            status_code=400,
            detail=f"Recipient role is '{active_recipient.get('role_type')}', not VIEW_ONLY or REVIEWER"
        )

    # Validate recipient status (must be notified or in_progress)
    if active_recipient.get("status") not in ("notified", "in_progress"):
        raise HTTPException(
            status_code=400,
            detail=f"Recipient already '{active_recipient.get('status')}'"
        )

    # Complete the recipient action via routing engine
    actor = active_recipient.get("email") or active_recipient.get("name") or "anonymous"
    success = await routing_engine.on_recipient_action(
        package_id=package["id"],
        recipient_id=active_recipient["id"],
        action="reviewed",
        actor=actor,
        metadata={
            "role_type": "VIEW_ONLY",
            "ip_address": request.client.host if request.client else None,
            "user_agent": request.headers.get("user-agent"),
            "reviewer_name": req.reviewer_name or active_recipient.get("name"),
        },
    )

    if not success:
        raise HTTPException(status_code=400, detail="Failed to update recipient status")

    return {
        "success": True,
        "message": "Package marked as reviewed",
        "recipient_id": active_recipient["id"],
        "action": "reviewed",
    }



class ApproveRequest(BaseModel):
    approver_name: Optional[str] = None


class RejectRequest(BaseModel):
    reason: str
    rejector_name: Optional[str] = None


@router.post("/{token}/approve")
async def approve_package(
    token: str,
    req: ApproveRequest,
    request: Request,
    x_session_token: Optional[str] = Header(None),
):
    """
    Approve a package as an APPROVE_REJECT recipient.
    Validates session, then completes the recipient's action and triggers next routing step.
    """
    package, active_recipient = await _find_package_by_recipient_token(token)

    if not package:
        raise HTTPException(status_code=404, detail="Package not found or link expired")
    if not active_recipient:
        raise HTTPException(status_code=404, detail="Recipient not found")

    # Session validation
    require_auth = package.get("security_settings", {}).get("require_auth", True)
    if require_auth:
        session = await _validate_session_for_request(token, x_session_token)
        if not session:
            raise HTTPException(status_code=401, detail="Session expired. Please verify again.")

    if package.get("status") != "in_progress":
        raise HTTPException(
            status_code=400,
            detail=f"Package is '{package.get('status')}', cannot approve"
        )

    if active_recipient.get("role_type") != "APPROVE_REJECT":
        raise HTTPException(
            status_code=400,
            detail=f"Recipient role is '{active_recipient.get('role_type')}', not APPROVE_REJECT"
        )

    if active_recipient.get("status") not in ("notified", "in_progress"):
        raise HTTPException(
            status_code=400,
            detail=f"Recipient already '{active_recipient.get('status')}'"
        )

    actor = active_recipient.get("email") or active_recipient.get("name") or "anonymous"
    success = await routing_engine.on_recipient_action(
        package_id=package["id"],
        recipient_id=active_recipient["id"],
        action="approved",
        actor=actor,
        metadata={
            "role_type": "APPROVE_REJECT",
            "ip_address": request.client.host if request.client else None,
            "user_agent": request.headers.get("user-agent"),
            "approver_name": req.approver_name or active_recipient.get("name"),
        },
    )

    if not success:
        raise HTTPException(status_code=400, detail="Failed to update recipient status")

    # Fire approve_reject webhook
    try:
        await webhook_service.fire_package_event(
            package_id=package["id"],
            event_type="approved",
            tenant_id=package.get("tenant_id", ""),
            extra_data={
                "action": "approved",
                "recipient_name": active_recipient.get("name", ""),
                "recipient_email": active_recipient.get("email", ""),
                "approver_name": req.approver_name or active_recipient.get("name"),
            },
        )
    except Exception as e:
        logger.warning(f"Webhook fire_package_event (approved) failed: {e}")

    return {
        "success": True,
        "message": "Package approved",
        "recipient_id": active_recipient["id"],
        "action": "approved",
    }


@router.post("/{token}/reject")
async def reject_package(
    token: str,
    req: RejectRequest,
    request: Request,
    x_session_token: Optional[str] = Header(None),
):
    """
    Reject a package as an APPROVE_REJECT recipient.
    Validates session, then voids the entire package with the rejection reason.
    """
    package, active_recipient = await _find_package_by_recipient_token(token)

    if not package:
        raise HTTPException(status_code=404, detail="Package not found or link expired")
    if not active_recipient:
        raise HTTPException(status_code=404, detail="Recipient not found")

    # Session validation
    require_auth = package.get("security_settings", {}).get("require_auth", True)
    if require_auth:
        session = await _validate_session_for_request(token, x_session_token)
        if not session:
            raise HTTPException(status_code=401, detail="Session expired. Please verify again.")

    if package.get("status") != "in_progress":
        raise HTTPException(
            status_code=400,
            detail=f"Package is '{package.get('status')}', cannot reject"
        )

    if active_recipient.get("role_type") != "APPROVE_REJECT":
        raise HTTPException(
            status_code=400,
            detail=f"Recipient role is '{active_recipient.get('role_type')}', not APPROVE_REJECT"
        )

    if active_recipient.get("status") not in ("notified", "in_progress"):
        raise HTTPException(
            status_code=400,
            detail=f"Recipient already '{active_recipient.get('status')}'"
        )

    if not req.reason.strip():
        raise HTTPException(status_code=400, detail="Rejection reason is required")

    actor = active_recipient.get("email") or active_recipient.get("name") or "anonymous"

    # Mark the recipient as completed with "rejected" action
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc).isoformat()
    recipients = package.get("recipients", [])
    for r in recipients:
        if r["id"] == active_recipient["id"]:
            r["status"] = "completed"
            r["action_taken"] = "rejected"
            r["action_at"] = now
            r["completed_at"] = now
            r["reject_reason"] = req.reason.strip()
            break

    await db.docflow_packages.update_one(
        {"id": package["id"]},
        {"$set": {"recipients": recipients, "updated_at": now}}
    )
    # Dual-write to runs collection
    await db.docflow_package_runs.update_one(
        {"id": package["id"]},
        {"$set": {"recipients": recipients, "updated_at": now}}
    )

    # Log the rejection event
    if audit_service:
        await audit_service.log_event(
            tenant_id=package.get("tenant_id", ""),
            package_id=package["id"],
            recipient_id=active_recipient["id"],
            event_type="recipient_rejected",
            actor=actor,
            metadata={
                "role_type": "APPROVE_REJECT",
                "reject_reason": req.reason.strip(),
                "ip_address": request.client.host if request.client else None,
            },
        )

    # Void the entire package
    await routing_engine._void_package(
        package_id=package["id"],
        reason=f"Rejected by {actor}: {req.reason.strip()}",
        actor=actor,
    )

    # Fire approve_reject webhook (rejected)
    try:
        await webhook_service.fire_package_event(
            package_id=package["id"],
            event_type="rejected",
            tenant_id=package.get("tenant_id", ""),
            extra_data={
                "action": "rejected",
                "recipient_name": active_recipient.get("name", ""),
                "recipient_email": active_recipient.get("email", ""),
                "reason": req.reason.strip(),
                "reject_reason": req.reason.strip(),
            },
        )
    except Exception as e:
        logger.warning(f"Webhook fire_package_event (rejected) failed: {e}")

    return {
        "success": True,
        "message": "Package rejected and voided",
        "recipient_id": active_recipient["id"],
        "action": "rejected",
        "void_reason": req.reason.strip(),
    }


@router.post("/{token}/void")
async def void_package_public(
    token: str,
    req: VoidFromPublicRequest,
    request: Request,
    x_session_token: Optional[str] = Header(None),
):
    """
    Void a package from the public view.
    Requires a valid session (if auth required) and the package must be in a voidable state.
    """
    package, active_recipient = await _find_package_by_recipient_token(token)

    if not package:
        raise HTTPException(status_code=404, detail="Package not found or link expired")
    if not active_recipient:
        raise HTTPException(status_code=404, detail="Recipient not found")

    # Session validation
    require_auth = package.get("security_settings", {}).get("require_auth", True)
    if require_auth:
        session = await _validate_session_for_request(token, x_session_token)
        if not session:
            raise HTTPException(status_code=401, detail="Session expired. Please verify again.")

    # Only allow void on active packages
    if package.get("status") not in ("in_progress", "draft"):
        raise HTTPException(
            status_code=400,
            detail=f"Package is '{package.get('status')}', cannot void"
        )

    if not req.reason.strip():
        raise HTTPException(status_code=400, detail="Void reason is required")

    actor = active_recipient.get("email") or active_recipient.get("name") or "anonymous"
    reason = f"Voided by {actor} (public): {req.reason.strip()}"

    # Void the package
    await routing_engine._void_package(
        package_id=package["id"],
        reason=reason,
        actor=actor,
    )

    # Invalidate session after void
    if x_session_token:
        await session_service.invalidate_session(x_session_token)

    return {
        "success": True,
        "message": "Package has been voided",
        "void_reason": req.reason.strip(),
    }
