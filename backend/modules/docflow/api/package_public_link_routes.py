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
from ..utils.request_utils import build_request_metadata

router = APIRouter(prefix="/docflow/packages/public-link", tags=["DocFlow Public Link"])

logger = logging.getLogger(__name__)
audit_service = DocFlowAuditService(db)
webhook_service = WebhookService(db)


def _resolve_pdf_font_size(field: dict, h_pdf: float, w_pdf: float, scale: float,
                            default_pt: float = 10.0) -> float:
    """Compute font size in PDF points matching the frontend resolveResponsiveFontSize.

    Parses "12pt" / "12px" / bare-number fontSize, converts to CSS-px, applies
    height/width caps in CSS-px space (same as the browser), then converts back
    to PDF points.  Prevents the builder→PDF scale factor from shrinking text.
    """
    style = field.get("style") or {}
    raw_fs = str(style.get("fontSize") or f"{default_pt}pt").strip()
    is_pt = raw_fs.endswith("pt")
    try:
        fs_num = float(raw_fs.rstrip("pt").rstrip("px").strip())
    except (ValueError, TypeError):
        fs_num = default_pt
        is_pt = True

    _CSS_PT_TO_PX = 4.0 / 3.0
    base_fs_px = fs_num * _CSS_PT_TO_PX if is_pt else fs_num

    _safe_scale = scale if scale > 0 else 1.0
    h_px = h_pdf / _safe_scale
    w_px = (w_pdf / _safe_scale) if w_pdf > 0 else 0.0
    h_cap_px = max(6.0, (h_px - 2.0) * 0.85)
    w_cap_px = max(6.0, w_px / 2.5) if w_px > 0 else 1e9

    capped_px = max(6.0, min(base_fs_px, h_cap_px, w_cap_px))
    return max(6.0, min(capped_px * (3.0 / 4.0), 72.0))


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
            "field_placements": doc.get("field_placements", []),
        })

    require_otp = package.get("security_settings", {}).get("require_auth", True)

    # Resolve sender info for the signing-view FROM header.
    # Priority 1: sender_name/sender_email on the package (set by API custom sender or API key owner auto-resolution).
    # Priority 2: created_by user record lookup.
    sender_info = None
    try:
        pkg_sender_name = package.get("sender_name")
        pkg_sender_email = package.get("sender_email")
        if pkg_sender_name or pkg_sender_email:
            sender_info = {"name": pkg_sender_name or "", "email": pkg_sender_email or ""}
        else:
            sender_user_id = package.get("created_by")
            if sender_user_id:
                user = await db.users.find_one(
                    {"id": sender_user_id},
                    {"_id": 0, "email": 1, "first_name": 1, "last_name": 1, "name": 1, "full_name": 1},
                )
                if not user:
                    # created_by may be an API key ID — resolve through the key owner.
                    key_rec = await db.docflow_api_keys.find_one({"id": sender_user_id}, {"_id": 0, "created_by": 1})
                    if key_rec and key_rec.get("created_by"):
                        user = await db.users.find_one(
                            {"id": key_rec["created_by"]},
                            {"_id": 0, "email": 1, "first_name": 1, "last_name": 1, "name": 1, "full_name": 1},
                        )
                if user:
                    name = (
                        user.get("full_name")
                        or user.get("name")
                        or " ".join(filter(None, [user.get("first_name"), user.get("last_name")])).strip()
                        or (user.get("email") or "").split("@")[0]
                    )
                    email = user.get("email") or ""
                    if name or email:
                        sender_info = {"name": name, "email": email}
    except Exception as _e:
        logger.warning(f"Sender resolution failed for public-link package {package.get('id')}: {_e}")

    return {
        "package_id": package["id"],
        "package_name": package.get("name", ""),
        "package_status": package.get("status", "draft"),
        "require_otp": require_otp,
        "total_documents": len(documents),
        "documents": documents,
        "sender": sender_info,
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
    failed_documents = []  # Issue 3 — surface per-doc failures in response

    # Process each document — embed field data into PDF
    for pkg_doc in package.get("documents", []):
        doc_id = pkg_doc.get("document_id")
        template_id = pkg_doc.get("template_id")
        doc_name_dbg = pkg_doc.get("document_name", "") or template_id or doc_id or "?"
        if not doc_id:
            logger.error(f"public-link submit: pkg_doc missing document_id (pkg={package['id']}, tpl={template_id})")
            failed_documents.append({
                "document_id": None,
                "document_name": doc_name_dbg,
                "reason": "document_id missing on package",
            })
            continue

        field_data_for_doc = req.documents_field_data.get(doc_id, {})

        try:
            document = await db.docflow_documents.find_one({"id": doc_id}, {"_id": 0})
            if not document:
                logger.error(f"public-link submit: document {doc_id} not found in DB")
                failed_documents.append({
                    "document_id": doc_id,
                    "document_name": doc_name_dbg,
                    "reason": "document record not found",
                })
                continue

            # Load field placements — package-level overrides take priority
            # over the master template so Virtual Builder changes are honoured.
            _pkg_fps = pkg_doc.get("field_placements", [])
            if _pkg_fps:
                field_placements = _pkg_fps
            else:
                template = await db.docflow_templates.find_one(
                    {"id": template_id},
                    {"_id": 0, "field_placements": 1}
                )
                field_placements = (template or {}).get("field_placements", [])

            # Phase 81.71 — apply authored radio defaults.
            from ..services.field_defaults import apply_radio_defaults
            field_data_for_doc = apply_radio_defaults(field_placements, field_data_for_doc)

            from ..services.s3_service import S3Service
            s3_service = S3Service()

            # Issue 3 fix — resolve a usable base PDF even when some legacy /
            # variant key names are present. Order of preference:
            #   1. unsigned_s3_key (canonical for package-generated docs)
            #   2. signed_s3_key   (a prior submission produced a signed copy)
            #   3. s3_key          (legacy single-key documents)
            #   4. pdf_file_path   (very old fallback)
            unsigned_key = (
                document.get("unsigned_s3_key")
                or document.get("signed_s3_key")
                or document.get("s3_key")
                or document.get("pdf_file_path")
            )
            if not unsigned_key:
                logger.error(
                    f"public-link submit: document {doc_id} has no usable S3 key "
                    f"(keys={list(document.keys())[:20]})"
                )
                failed_documents.append({
                    "document_id": doc_id,
                    "document_name": doc_name_dbg,
                    "reason": "source PDF missing in storage",
                })
                continue

            pdf_bytes = s3_service.download_file(unsigned_key)
            if not pdf_bytes:
                logger.error(f"public-link submit: failed to download base PDF for {doc_id} (key={unsigned_key})")
                failed_documents.append({
                    "document_id": doc_id,
                    "document_name": doc_name_dbg,
                    "reason": "failed to download source PDF",
                })
                continue

            # Embed field values into PDF using PyMuPDF
            import fitz
            pdf_doc = fitz.open(stream=pdf_bytes, filetype="pdf")

            for field in field_placements:
                field_id = field.get("id")
                field_type = field.get("type")
                field_value = field_data_for_doc.get(field_id)

                # Phase 81.16 — merge field key fallbacks. The signing UI
                # may store the value under the field id OR under the
                # `Object.field` merge key; honour both.
                if not field_value and field_type == "merge":
                    merge_obj = field.get("merge_object") or field.get("mergeObject", "")
                    merge_fld = field.get("merge_field") or field.get("mergeField", "")
                    full_key = f"{merge_obj}.{merge_fld}" if merge_obj and merge_fld else ""
                    field_value = (field_data_for_doc.get(full_key)
                                   or field_data_for_doc.get(merge_fld)
                                   or "")

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
                            # Render at EXACTLY the configured fontSize so
                            # different sigs sized differently in Visual
                            # Builder are visibly distinguishable on the PDF.
                            try:
                                pm = fitz.Pixmap(img_bytes)
                                img_w, img_h = pm.width, pm.height
                                pm = None
                            except Exception:
                                img_w = img_h = 0
                            align = (field.get("style") or {}).get("textAlign") or "center"
                            target_h = min(_resolve_pdf_font_size(field, h, 0.0, scale, default_pt=18.0), h)
                            if img_w > 0 and img_h > 0:
                                aspect = img_w / img_h
                                fit_h = target_h
                                fit_w = fit_h * aspect
                                if fit_w > w:
                                    fit_w = w
                                    fit_h = fit_w / aspect
                            else:
                                fit_w, fit_h = w, target_h
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
                        # Issue 2 fix — reformat date values to the field's
                        # configured `dateFormat` (default MM/DD/YYYY) so the
                        # final signed PDF matches the Visual Builder.
                        if field_type == "date":
                            from ..services.date_format_util import reformat_date_value
                            field_value = reformat_date_value(
                                field_value, field.get("dateFormat")
                            )
                        # Phase 81.70 — mirror frontend signing-UI centered
                        # baseline: single-line uses `insert_text` at
                        # `y + h/2 + fs*0.35`; multi-line uses a centered band
                        # rect to keep `insert_textbox` word-wrap while still
                        # vertically centering the content.
                        is_multiline_text = (
                            field_type == "text"
                            and (
                                field.get("fieldSubType") == "multi-line"
                                or field.get("field_sub_type") == "multi-line"
                                or field.get("multiline") is True
                            )
                        )
                        font_size = _resolve_pdf_font_size(
                            field, h, w if not is_multiline_text else 0.0, scale
                        )
                        text_str = str(field_value)
                        align_str = (field.get("style") or {}).get("textAlign") or "left"
                        align_map = {"left": 0, "center": 1, "right": 2}

                        if is_multiline_text:
                            line_h = max(font_size * 1.2, font_size + 2)
                            est_lines = max(1, int((h - 4 * scale) / line_h))
                            band_h = min(h - 4 * scale, est_lines * line_h)
                            band_top = y + (h - band_h) / 2
                            rect = fitz.Rect(
                                x + 5 * scale,
                                band_top,
                                x + w - 5 * scale,
                                band_top + band_h,
                            )
                            page.insert_textbox(
                                rect, text_str, fontsize=font_size, fontname="helv",
                                color=(0, 0, 0), align=align_map.get(align_str, 0),
                            )
                        else:
                            try:
                                text_w = fitz.get_text_length(text_str, fontname="helv", fontsize=font_size)
                            except Exception:
                                text_w = 0
                            pad = 5 * scale
                            if align_str == "center":
                                tx = x + max(pad, (w - text_w) / 2)
                            elif align_str == "right":
                                tx = x + max(pad, w - text_w - pad)
                            else:
                                tx = x + pad
                            baseline_y = y + h / 2 + font_size * 0.35
                            page.insert_text(
                                fitz.Point(tx, baseline_y),
                                text_str,
                                fontsize=font_size,
                                fontname="helv",
                                color=(0, 0, 0),
                            )
                    except Exception as e:
                        logger.warning(f"Failed to embed text for field {field_id}: {e}")

                elif field_type == "radio":
                    try:
                        group = field.get("groupName") or field.get("group_name")
                        option_value = field.get("optionValue") or field.get("option_value") or field_id
                        selected_val = field_data_for_doc.get(group) if group else None
                        if selected_val is None:
                            selected_val = field_data_for_doc.get(field_id)
                        is_selected = (selected_val == option_value)

                        # Phase 81.73 — tight centered mask (not full rect) so
                        # adjacent label text is preserved.
                        opt_size = max(6.0, min(12.0 * scale, h - 4.0 * scale))
                        if w > 0:
                            opt_size = min(opt_size, w - 2.0 * scale)
                        opt_size = max(6.0, opt_size)
                        radius = opt_size / 2
                        cx = x + w / 2
                        cy = y + h / 2
                        mask_size = max(opt_size + 2.0 * scale, 14.0 * scale)
                        mask_size = min(mask_size, w, h)
                        mx = cx - mask_size / 2
                        my = cy - mask_size / 2
                        page.draw_rect(
                            fitz.Rect(mx, my, mx + mask_size, my + mask_size),
                            color=None, fill=(1, 1, 1), width=0,
                        )
                        page.draw_circle(fitz.Point(cx, cy), radius, color=(0.13, 0.13, 0.16), width=0.4)
                        if is_selected:
                            inner_r = max(0.5, radius - 2.5 * scale)
                            page.draw_circle(fitz.Point(cx, cy), inner_r, color=(0.13, 0.13, 0.16), fill=(0.13, 0.13, 0.16), width=0)
                    except Exception as e:
                        logger.warning(f"Failed to embed radio field {field_id}: {e}")

                elif field_type == "checkbox":
                    try:
                        is_checked = field_value in (True, "true", "True")
                        # Phase 81.70 — match frontend glyph size.
                        box_size = max(6.0, min(14.0 * scale, h - 4.0 * scale))
                        if w > 0:
                            box_size = min(box_size, w - 2.0 * scale)
                        box_size = max(6.0, box_size)
                        bx = x + (w - box_size) / 2
                        by = y + (h - box_size) / 2
                        box_rect = fitz.Rect(bx, by, bx + box_size, by + box_size)

                        # Phase 81.73 — tight centered mask.
                        mask_size = max(box_size + 2.0 * scale, 14.0 * scale)
                        mask_size = min(mask_size, w, h)
                        cx = x + w / 2
                        cy = y + h / 2
                        mx = cx - mask_size / 2
                        my = cy - mask_size / 2
                        page.draw_rect(
                            fitz.Rect(mx, my, mx + mask_size, my + mask_size),
                            color=None, fill=(1, 1, 1), width=0,
                        )

                        page.draw_rect(box_rect, color=(0.13, 0.13, 0.16), width=0.4)
                        if is_checked:
                            p1 = fitz.Point(bx + box_size * 0.22, by + box_size * 0.50)
                            p2 = fitz.Point(bx + box_size * 0.44, by + box_size * 0.72)
                            p3 = fitz.Point(bx + box_size * 0.78, by + box_size * 0.28)
                            shape = page.new_shape()
                            shape.draw_line(p1, p2)
                            shape.draw_line(p2, p3)
                            shape.finish(color=(0.13, 0.13, 0.16), width=0.7)
                            shape.commit()
                    except Exception as e:
                        logger.warning(f"Failed to embed checkbox for field {field_id}: {e}")

                elif field_type == "merge" and field_value:
                    # Phase 81.70 — centered baseline to match signing UI.
                    try:
                        font_size = _resolve_pdf_font_size(field, h, w, scale)
                        text_str = str(field_value)
                        align_str = (field.get("style") or {}).get("textAlign") or "left"
                        try:
                            text_w = fitz.get_text_length(text_str, fontname="helv", fontsize=font_size)
                        except Exception:
                            text_w = 0
                        pad = 2 * scale
                        if align_str == "center":
                            tx = x + max(pad, (w - text_w) / 2)
                        elif align_str == "right":
                            tx = x + max(pad, w - text_w - pad)
                        else:
                            tx = x + pad
                        baseline_y = y + h / 2 + font_size * 0.35
                        page.insert_text(
                            fitz.Point(tx, baseline_y),
                            text_str,
                            fontsize=font_size,
                            fontname="helv",
                            color=(0.05, 0.05, 0.15),
                        )
                    except Exception as e:
                        logger.warning(f"Failed to embed merge field {field_id}: {e}")

                elif field_type == "dropdown" and field_value:
                    # Phase 81.70 — centered baseline to match signing UI.
                    try:
                        font_size = _resolve_pdf_font_size(field, h, w, scale)
                        text_str = str(field_value)
                        align_str = (field.get("style") or {}).get("textAlign") or "left"
                        try:
                            text_w = fitz.get_text_length(text_str, fontname="helv", fontsize=font_size)
                        except Exception:
                            text_w = 0
                        pad = 5 * scale
                        if align_str == "center":
                            tx = x + max(pad, (w - text_w) / 2)
                        elif align_str == "right":
                            tx = x + max(pad, w - text_w - pad)
                        else:
                            tx = x + pad
                        baseline_y = y + h / 2 + font_size * 0.35
                        page.insert_text(
                            fitz.Point(tx, baseline_y),
                            text_str,
                            fontsize=font_size,
                            fontname="helv",
                            color=(0, 0, 0),
                        )
                    except Exception as e:
                        logger.warning(f"Failed to embed dropdown for field {field_id}: {e}")

            # Phase 81 — verification ID stamp applied to EVERY page of the PDF
            # to ensure auditability across the entire document.
            try:
                package_verification_id = str(package.get("id") or "").upper()
                if package_verification_id and len(pdf_doc) > 0:
                    stamp_text = f"DocFlow Package Verification ID: {package_verification_id}"
                    fontsize = 8
                    try:
                        text_w = fitz.get_text_length(stamp_text, fontname="helv", fontsize=fontsize)
                    except Exception:
                        text_w = len(stamp_text) * 4.2

                    for page_idx in range(len(pdf_doc)):
                        page = pdf_doc[page_idx]
                        pw = page.rect.width
                        ph = page.rect.height
                        page.insert_text(
                            fitz.Point(max(18, pw - text_w - 18), ph - 12),
                            stamp_text,
                            fontname="helv",
                            fontsize=fontsize,
                            color=(0.4, 0.4, 0.4),
                        )
            except Exception as stamp_err:
                logger.warning(f"Verification stamp failed for package {package.get('id')}: {stamp_err}")

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
            else:
                # Issue 3 — S3 upload failed; record it so the response is honest.
                logger.error(f"public-link submit: signed PDF upload returned no key for {doc_id}")
                failed_documents.append({
                    "document_id": doc_id,
                    "document_name": pkg_doc.get("document_name", ""),
                    "reason": "failed to upload signed PDF to storage",
                })
                continue

            signed_documents.append({
                "document_id": doc_id,
                "document_name": pkg_doc.get("document_name", ""),
                "signed_s3_key": signed_key or "",
                "signed_file_url": signed_url,
            })

        except Exception as e:
            # Issue 3 — capture full traceback + the broken doc id so we can
            # diagnose later runs, and surface the failure to the caller
            # instead of returning a misleading "success" with empty list.
            logger.exception(
                f"public-link submit: exception while processing document "
                f"{doc_id} (template={template_id}) for package {package['id']}"
            )
            failed_documents.append({
                "document_id": doc_id,
                "document_name": pkg_doc.get("document_name", "") or template_id or doc_id,
                "reason": f"unexpected error: {type(e).__name__}: {str(e)[:200]}",
            })
            continue

    # Issue 3 — if NOTHING signed, fail fast with structured detail so the
    # signer sees an actionable error instead of a silent empty response.
    if not signed_documents:
        raise HTTPException(
            status_code=500,
            detail={
                "code": "no_documents_signed",
                "message": "No documents were generated. Please contact support.",
                "failed_documents": failed_documents,
            },
        )

    # Create submission record
    submission = {
        "id": submission_id,
        "package_id": package["id"],
        "tenant_id": package.get("tenant_id", ""),
        "name": name,
        "email": email,
        "status": "completed" if not failed_documents else "partial",
        "field_data": req.documents_field_data,
        "signed_documents": signed_documents,
        "failed_documents": failed_documents,
        "submitted_at": now.isoformat(),
        "created_at": now.isoformat(),
        **build_request_metadata(request),
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
            "documents_failed": len(failed_documents),
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
        "failed_documents": failed_documents,
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
