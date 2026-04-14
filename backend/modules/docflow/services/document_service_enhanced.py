"""
Enhanced Document Service - Handles signed/unsigned versions and downloads with S3 storage
Includes merge field support and proper PDF generation
"""
import uuid
from typing import Optional, Dict, Any, List
from datetime import datetime, timezone, timedelta
import secrets
import os
from .system_email_service import SystemEmailService
from .email_history_service import EmailHistoryService
from .pdf_generation_service import PDFGenerationService
from .pdf_generation_service_enhanced import EnhancedPDFGenerationService
from .pdf_overlay_service_enhanced import PDFOverlayService
from .s3_service import S3Service
from .merge_field_service import MergeFieldService
from .webhook_service import WebhookService
from .validation_service import ValidationService
from ..models.document_model import DeliveryChannel
import logging

logger = logging.getLogger(__name__)


class EnhancedDocumentService:
    def __init__(self, db):
        self.db = db
        self.collection = db.docflow_documents
        self.validation_service = ValidationService(db)
        self.email_service = SystemEmailService()
        self.email_history_service = EmailHistoryService(db)
        self.pdf_service = PDFGenerationService()
        self.enhanced_pdf_service = EnhancedPDFGenerationService()
        self.pdf_overlay_service = PDFOverlayService()
        self.s3_service = S3Service()
        self.merge_field_service = MergeFieldService(db)
        self.webhook_service = WebhookService(db)
    
    async def generate_document(self, template_id: str, crm_object_id: str, 
                               crm_object_type: str, user_id: str, tenant_id: str,
                               delivery_channels: List[str], recipient_email: Optional[str] = None,
                               recipient_name: Optional[str] = None,
                               recipients: Optional[List[Dict[str, Any]]] = None,
                               routing_mode: Optional[str] = None,
                               expires_in_days: Optional[int] = None,
                               expires_at: Optional[datetime] = None,
                               salesforce_context: Optional[Dict[str, Any]] = None,
                               send_email: bool = True,
                               require_auth: bool = True,
                               delivery_mode: Optional[str] = None) -> dict:
        """Generate document from template and CRM data with PDF creation"""
        
        # Get template
        template = await self.db.docflow_templates.find_one({
            "id": template_id,
            "tenant_id": tenant_id
        })
        
        if not template:
            raise ValueError("Template not found")

        # Enforce template validation before generating/sending
        validation = await self.validation_service.validate_template_obj(template, tenant_id=tenant_id)
        if not validation.get("valid"):
            raise ValueError("Template validation failed: " + "; ".join(validation.get("errors", [])))

        # Recipient/routing preparation (multi-recipient supported)
        template_recipients: List[Dict[str, Any]] = template.get("recipients", []) or []
        # if not template_recipients:
        #     # Signing fields should be invalid without recipients (ValidationService should catch this),
        #     # but we guard here as well so document generation can never proceed.
        #     raise ValueError("Template must define at least one recipient")

        # Use routing mode from request if provided, otherwise from template
        final_routing_mode = routing_mode or template.get("routing_mode", "sequential")
        if final_routing_mode not in ["sequential", "parallel"]:
            final_routing_mode = "sequential"

        # Calculate exact expiry timestamp
        final_expires_at = None
        if expires_at:
            final_expires_at = expires_at
        elif expires_in_days is not None and expires_in_days > 0:
            final_expires_at = datetime.now(timezone.utc) + timedelta(days=expires_in_days)
        # If both are None/0, no expiry is set (document never expires)

        now = datetime.now(timezone.utc)
        frontend_url = os.environ.get("FRONTEND_URL", "")

        recipient_inputs = recipients or []

        # Determine if this is a public_link-only delivery (used in multiple places below)
        is_public_link_only = (
            delivery_channels and
            all(c in ("public_link", DeliveryChannel.PUBLIC_LINK) for c in delivery_channels)
        )

        # Backwards-compat fallback: legacy UI sends a single recipient_name/email.
        if not recipient_inputs:
            if is_public_link_only:
                recipient_inputs = [{
                    "template_recipient_id": None,
                    "name": recipient_name or "",
                    "email": recipient_email or "",
                    "routing_order": 1,
                    "is_required": True
                }]
            else:
                sorted_template_recipients = sorted(
                    template_recipients,
                    key=lambda r: int(r.get("routing_order", 1) or 1)
                )
                selected = None
                for tr in sorted_template_recipients:
                    if tr.get("is_required", True) and tr.get("role") == "signer":
                        selected = tr
                        break
                if not selected and sorted_template_recipients:
                    selected = sorted_template_recipients[0]

                if selected:
                    recipient_inputs = [{
                        "template_recipient_id": selected.get("id"),
                        "name": recipient_name or selected.get("placeholder_name") or "Recipient",
                        "email": recipient_email or "",
                        "routing_order": selected.get("routing_order", 1),
                        "is_required": selected.get("is_required", True)
                    }]

        # Index template recipients for easy lookup
        template_recipients_by_id = {tr.get("id"): tr for tr in template_recipients if tr.get("id")}
        template_recipients_by_order = {tr.get("routing_order"): tr for tr in template_recipients if tr.get("routing_order")}

        recipient_instances: List[Dict[str, Any]] = []
        
        # We'll process all provided recipient inputs
        # To decide which one is "active" first, we'll sort them by routing_order later
        processed_template_ids = set()

        for inp in recipient_inputs:
            tid = inp.get("template_recipient_id") or inp.get("id")
            tr = template_recipients_by_id.get(tid)
            
            if not tr and not tid:
                # Try matching by routing_order if no ID
                ro = inp.get("routing_order")
                tr = template_recipients_by_order.get(ro)

            if tr:
                processed_template_ids.add(tr.get("id"))
                name = (inp.get("name") or "").strip() or tr.get("placeholder_name") or ""
                email = (inp.get("email") or "").strip()
                routing_order = inp.get("routing_order") or tr.get("routing_order") or 1
                is_required = inp.get("is_required") if inp.get("is_required") is not None else tr.get("is_required", True)
                template_recipient_id = tr.get("id")
            else:
                # Ad-hoc recipient
                name = (inp.get("name") or "").strip()
                email = (inp.get("email") or "").strip()
                routing_order = inp.get("routing_order") or 1
                is_required = inp.get("is_required") if inp.get("is_required") is not None else True
                template_recipient_id = None

            if not name and not is_public_link_only:
                raise ValueError("Recipient name is required")

            if "email" in delivery_channels and is_required and not email:
                raise ValueError(f"Recipient email is required for recipient '{name}'")

            recipient_instances.append({
                "id": str(uuid.uuid4()),
                "template_recipient_id": template_recipient_id,
                "name": name,
                "email": email,
                "status": "pending", # Initial status, will be activated below
                "routing_order": int(routing_order),
                "is_required": bool(is_required),
                "assigned_field_ids": inp.get("assigned_field_ids", []),
                "public_token": secrets.token_urlsafe(32),
                "sent_at": None,
                "viewed_at": None,
                "signed_at": None,
                "declined_at": None,
                "decline_reason": None
            })

        # Prevent overlapping field assignments
        assigned_field_registry = {}
        for inst in recipient_instances:
            for fid in inst.get("assigned_field_ids", []):
                if fid in assigned_field_registry:
                    raise ValueError("Component is assigned to multiple recipients. Each component can only be assigned to one recipient.")
                assigned_field_registry[fid] = inst.get("name", "Unknown")

        # Check if any required template recipients were missed
        # Skip this check for public_link only delivery (no recipients needed)
        if not is_public_link_only:
            for tr in template_recipients:
                if tr.get("is_required", True) and tr.get("id") not in processed_template_ids:
                    raise ValueError(f"Missing required recipient from template: '{tr.get('placeholder_name')}'")

        # if not recipient_instances:
        #     raise ValueError("At least one recipient is required")

        # Sort instances by routing order to determine activation
        recipient_instances.sort(key=lambda x: x["routing_order"])
        
        # Determine active recipients based on routing mode
        required_instances = [r for r in recipient_instances if r["is_required"]]
        first_required = None
        if required_instances:
            first_required = required_instances[0]
        elif recipient_instances:
            first_required = recipient_instances[0]

        for r in recipient_instances:
            if not r["is_required"]:
                continue
                
            if final_routing_mode == "parallel":
                r["status"] = "sent"
                r["sent_at"] = now.isoformat()
            else:
                # sequential
                if first_required and r["id"] == first_required["id"]:
                    r["status"] = "sent"
                    r["sent_at"] = now.isoformat()

        doc_active_token = None
        for inst in recipient_instances:
            if inst.get("status") == "sent":
                doc_active_token = inst.get("public_token")
                break
        if not doc_active_token and recipient_instances:
            doc_active_token = recipient_instances[0].get("public_token")

        document_url = f"{frontend_url}/docflow/view/{doc_active_token}" if doc_active_token else None
        
        # Generate unsigned PDF with merge fields
        logger.info(f"Generating unsigned PDF for template {template_id}")
        document_id = str(uuid.uuid4())
        
        # Get CRM object data for merge fields
        object_data = {}
        if crm_object_id and crm_object_type:
            logger.info(f"Fetching CRM object data: {crm_object_type} {crm_object_id}")
            object_data = await self.merge_field_service.get_crm_object_data(
                crm_object_type,
                crm_object_id,
                tenant_id
            ) or {}
        
        # Merge salesforce_context if available (for Salesforce templates)
        if salesforce_context:
            sf_fields = salesforce_context.get("fields", {}) or salesforce_context
            object_data.update(sf_fields)
        
        # Check if template has uploaded file in S3
        s3_key = template.get("s3_key")
        template_pdf_path = template.get("pdf_file_path")  # Legacy local path
        field_placements = template.get("field_placements", [])
        
        # Replace merge fields in field placements (like default values)
        # Also build merge_field_values dict for storing in document
        merge_field_values = {}
        if object_data:
            field_placements = self.merge_field_service.replace_merge_fields_in_dict(
                {"placements": field_placements},
                object_data,
                crm_object_type
            ).get("placements", [])
            
            # Build merge_field_values from field_placements for frontend rendering
            for fp in field_placements:
                if fp.get("type") == "merge":
                    field_id = fp.get("id")
                    merge_obj = fp.get("merge_object") or fp.get("mergeObject", "")
                    merge_field = fp.get("merge_field") or fp.get("mergeField", "")
                    merge_pattern = fp.get("mergePattern", f"{{{{{merge_obj}.{merge_field}}}}}")
                    
                    # Try to get the value from object_data using different key formats
                    value = None
                    # Format 1: "Object.field" (as sent from Salesforce)
                    full_key = f"{merge_obj}.{merge_field}"
                    if full_key in object_data:
                        value = object_data[full_key]
                    # Format 2: just "field" (direct field name)
                    elif merge_field in object_data:
                        value = object_data[merge_field]
                    # Format 3: nested in 'fields' dict
                    elif 'fields' in object_data and merge_field in object_data['fields']:
                        value = object_data['fields'][merge_field]
                    
                    if value is not None:
                        merge_field_values[field_id] = str(value)
                        logger.info(f"Merge field {field_id} ({merge_pattern}): '{value}'")
            
            # Also store values by merge pattern for easier lookup
            for key, value in object_data.items():
                if '.' in key or not isinstance(value, dict):
                    merge_field_values[key] = str(value) if value is not None else ""
        
        if s3_key:
            # Check if user has explicitly edited content blocks
            content_blocks_modified = template.get("content_blocks_modified", False)
            content_blocks = template.get("content_blocks", [])

            if content_blocks_modified and content_blocks:
                # User edited the content blocks → render from blocks
                logger.info("Template has user-edited content blocks — rendering edited version")
                from modules.docflow.services.content_blocks_renderer import render_content_blocks_to_pdf
                unsigned_pdf_bytes = render_content_blocks_to_pdf(content_blocks)
                logger.info(f"Rendered content blocks to PDF: {len(unsigned_pdf_bytes)} bytes")
            else:
                # No user edits → use original uploaded PDF for pixel-perfect fidelity
                logger.info(f"Downloading original template from S3: {s3_key}")
                template_bytes = self.s3_service.download_file(s3_key)
                if not template_bytes:
                    raise ValueError("Failed to download template from S3")
                unsigned_pdf_bytes = template_bytes
                logger.info(f"Using original S3 template as base PDF: {len(unsigned_pdf_bytes)} bytes")
                    
        elif template_pdf_path and os.path.exists(template_pdf_path):
            # Legacy: Use local template PDF
            logger.info(f"Using legacy local template PDF: {template_pdf_path}")
            with open(template_pdf_path, 'rb') as f:
                unsigned_pdf_bytes = f.read()
        else:
            # No S3 key, no local PDF — render from content blocks or generate basic PDF
            content_blocks = template.get("content_blocks", [])
            if content_blocks:
                logger.info(f"No S3 key — rendering from {len(content_blocks)} content blocks")
                from modules.docflow.services.content_blocks_renderer import render_content_blocks_to_pdf
                unsigned_pdf_bytes = render_content_blocks_to_pdf(content_blocks)
            else:
                unsigned_pdf_bytes = self.pdf_service.generate_unsigned_pdf(template)
        
        # Upload unsigned PDF to S3
        unsigned_filename = "unsigned.pdf"
        unsigned_s3_key = self.s3_service.upload_document(
            file_bytes=unsigned_pdf_bytes,
            tenant_id=tenant_id,
            document_id=document_id,
            filename=unsigned_filename,
            is_signed=False
        )
        
        if not unsigned_s3_key:
            raise ValueError("Failed to upload unsigned document to S3")
            
        logger.info(f"Unsigned PDF uploaded to S3: {unsigned_s3_key}")
        
        # Generate pre-signed URL for unsigned document (valid for 7 days)
        unsigned_file_url = self.s3_service.get_document_url(unsigned_s3_key, expiration=604800)
        
        # Create document
        first_recipient = recipient_instances[0] if recipient_instances else {}
        document = {
            "id": document_id,
            "tenant_id": tenant_id,
            "template_id": template_id,
            "template_name": template["name"],
            "crm_object_id": crm_object_id,
            "crm_object_type": crm_object_type,
            "status": "generated",
            "routing_mode": routing_mode,
            # Backwards compatibility: document-level token points to the first active signer.
            "public_token": doc_active_token,
            "document_url": document_url,
            "delivery_channels": delivery_channels,
            "delivery_mode": delivery_mode,
            "recipient_email": first_recipient.get("email"),
            "recipient_name": first_recipient.get("name"),
            "recipients": recipient_instances,
            "unsigned_s3_key": unsigned_s3_key,
            "unsigned_file_url": unsigned_file_url,  # Store pre-signed URL
            "signed_s3_key": None,
            "signed_file_url": None,
            "signatures": [],
            "field_data": merge_field_values,  # Store merge field values for frontend rendering
            "merge_field_values": merge_field_values,  # Also store separately for clarity
            "audit_trail": [{
                "event": "generated",
                "timestamp": now.isoformat(),
                "user_id": user_id
            }],
            "completed_at": None,
            "generated_at": now.isoformat(),
            "expires_at": final_expires_at,
            "require_auth": require_auth,
            "is_public_generator": is_public_link_only,
            "child_document_ids": [],
            "parent_document_id": None,
            "created_by": user_id,
            "created_at": now,
            "updated_at": now,
            "salesforce_context": salesforce_context
        }
        
        await self.collection.insert_one(document)
        logger.info(f"Document {document['id']} created in database")
        
        # Send email to initially-active recipients (routing-aware)
        email_sent_any = False
        if "email" in delivery_channels and send_email:
            for r in recipient_instances:
                if r.get("status") != "sent":
                    continue
                if not r.get("email"):
                    # In public_link-only mode we allow empty emails; for email delivery this should be prevented earlier.
                    continue

                recipient_url = f"{frontend_url}/docflow/view/{r.get('public_token')}"
                logger.info(f"Sending document email to {r.get('email')} (recipient token={r.get('public_token')})")
                email_result = await self.email_service.send_document_email(
                    recipient_email=r.get("email"),
                    recipient_name=r.get("name"),
                    template_name=template["name"],
                    document_url=recipient_url,
                    pdf_content=None,
                    sender_name="DocFlow CRM",
                    expires_in_days=expires_in_days,
                )

                if email_result.get("success"):
                    email_sent_any = True
                    await self.collection.update_one(
                        {"id": document["id"]},
                        {
                            "$push": {
                                "audit_trail": {
                                    "event": "sent",
                                    "timestamp": datetime.now(timezone.utc).isoformat(),
                                    "method": "email",
                                    "recipient": r.get("email")
                                }
                            }
                        }
                    )

                    await self.email_history_service.log_email(
                        template_id=template_id,
                        template_name=template["name"],
                        document_id=document["id"],
                        recipient_email=r.get("email"),
                        recipient_name=r.get("name"),
                        crm_object_type=crm_object_type,
                        crm_object_id=crm_object_id,
                        tenant_id=tenant_id,
                        status="sent",
                        error_message=None
                    )

                    # Trigger webhook event (recipient-aware via extra_data)
                    await self.webhook_service.fire_document_event(
                        document["id"],
                        "sent",
                        tenant_id,
                        extra_data={"recipient_email": r.get("email"), "recipient_name": r.get("name")}
                    )
                else:
                    logger.error(f"Failed to send email: {email_result.get('error')}")
                    await self.email_history_service.log_email(
                        template_id=template_id,
                        template_name=template["name"],
                        document_id=document["id"],
                        recipient_email=r.get("email"),
                        recipient_name=r.get("name"),
                        crm_object_type=crm_object_type,
                        crm_object_id=crm_object_id,
                        tenant_id=tenant_id,
                        status="failed",
                        error_message=email_result.get("error")
                    )

            if email_sent_any:
                await self.collection.update_one(
                    {"id": document["id"]},
                    {
                        "$set": {"status": "sent", "sent_at": now.isoformat()}
                    }
                )
                document["status"] = "sent"
        
        return document
    
    async def instantiate_public_document(self, parent_token: str, name: str, email: str) -> dict:
        """Create a new child document instance from a public link generator."""
        # Find parent by public_token or recipients.public_token
        parent = await self.collection.find_one({
            "$or": [
                {"public_token": parent_token, "is_public_generator": True},
                {"recipients.public_token": parent_token, "is_public_generator": True}
            ]
        })
        if not parent:
            raise ValueError("Public link not found or is not a reusable link")

        # Check expiry
        if await self.mark_expired_if_needed(parent["id"], document=parent):
            raise ValueError("This link has expired")

        # Check if child already exists for this email + parent (not expired/completed)
        existing_child = await self.collection.find_one({
            "parent_document_id": parent["id"],
            "recipients.email": email,
            "status": {"$nin": ["expired"]}
        }, {"_id": 0})

        if existing_child:
            child_recipients = existing_child.get("recipients", [])
            child_token = child_recipients[0].get("public_token") if child_recipients else None
            # Update name if changed
            if child_recipients and child_recipients[0].get("name") != name:
                await self.collection.update_one(
                    {"id": existing_child["id"], "recipients.email": email},
                    {"$set": {"recipients.$.name": name, "recipient_name": name}}
                )
            return {
                "child_token": child_token,
                "document_id": existing_child["id"],
                "require_auth": parent.get("require_auth", True),
                "already_exists": True,
                "status": existing_child.get("status")
            }

        # Clone parent into new child document
        now = datetime.now(timezone.utc)
        child_id = str(uuid.uuid4())
        child_token = secrets.token_urlsafe(32)
        frontend_url = os.environ.get("FRONTEND_URL", "")

        child_recipient = {
            "id": str(uuid.uuid4()),
            "template_recipient_id": None,
            "name": name,
            "email": email,
            "status": "sent",
            "routing_order": 1,
            "is_required": True,
            "assigned_field_ids": [],
            "public_token": child_token,
            "sent_at": now.isoformat(),
            "source": "public_link"
        }

        child_doc = {
            "id": child_id,
            "tenant_id": parent["tenant_id"],
            "template_id": parent["template_id"],
            "template_name": parent["template_name"],
            "crm_object_id": parent.get("crm_object_id", ""),
            "crm_object_type": parent.get("crm_object_type", ""),
            "status": "sent",
            "routing_mode": "sequential",
            "public_token": child_token,
            "document_url": f"{frontend_url}/docflow/view/{child_token}",
            "delivery_channels": ["public_link"],
            "recipient_email": email,
            "recipient_name": name,
            "recipients": [child_recipient],
            "unsigned_s3_key": parent.get("unsigned_s3_key"),
            "unsigned_file_url": parent.get("unsigned_file_url"),
            "signed_s3_key": None,
            "signed_file_url": None,
            "signatures": [],
            "field_data": dict(parent.get("field_data", {})),
            "merge_field_values": dict(parent.get("merge_field_values", {})),
            "audit_trail": [{
                "event": "instantiated_from_public_link",
                "timestamp": now.isoformat(),
                "parent_document_id": parent["id"],
                "recipient_name": name,
                "recipient_email": email
            }],
            "completed_at": None,
            "generated_at": now.isoformat(),
            "expires_at": parent.get("expires_at"),
            "require_auth": parent.get("require_auth", True),
            "is_public_generator": False,
            "child_document_ids": [],
            "parent_document_id": parent["id"],
            "created_by": parent.get("created_by"),
            "created_at": now,
            "updated_at": now,
            "salesforce_context": parent.get("salesforce_context")
        }

        await self.collection.insert_one(child_doc)

        # Track child in parent
        await self.collection.update_one(
            {"id": parent["id"]},
            {
                "$push": {"child_document_ids": child_id},
                "$set": {"updated_at": now}
            }
        )

        logger.info(f"Instantiated child document {child_id} from parent {parent['id']} for {email}")

        return {
            "child_token": child_token,
            "document_id": child_id,
            "require_auth": parent.get("require_auth", True),
            "already_exists": False,
            "status": "sent"
        }

    async def add_signature_with_pdf(
        self,
        document_id: str,
        signed_pdf: bytes,
        signature_data: dict,
        field_data: dict = None,
        recipient_token: Optional[str] = None
    ) -> bool:
        """Add a recipient's signing input by uploading the cumulatively signed PDF."""
        try:
            document = await self.collection.find_one({"id": document_id})
            if not document:
                return False

            tenant_id = document.get("tenant_id")

            # Disallow signing expired documents
            if await self.mark_expired_if_needed(document_id, document=document):
                return False

            recipients = document.get("recipients", []) or []
            if not recipients:
                return False

            # Resolve recipient by token (preferred) - fallback to first active recipient.
            active_recipient = None
            if recipient_token:
                active_recipient = next((r for r in recipients if r.get("public_token") == recipient_token), None)
            if not active_recipient:
                active_recipient = next((r for r in recipients if r.get("status") == "sent"), None) or recipients[0]

            if not active_recipient:
                return False

            routing_mode = document.get("routing_mode") or "sequential"
            required_sorted = sorted(
                [r for r in recipients if r.get("is_required", True)],
                key=lambda r: int(r.get("routing_order", 1) or 1)
            )
            next_required_first = next(
                (r for r in required_sorted if r.get("status") not in ["signed", "completed", "declined"]),
                None
            )

            # Enforce routing rules strictly
            if active_recipient.get("status") in ["signed", "completed", "declined"]:
                return False
            if routing_mode == "sequential" and next_required_first:
                if active_recipient.get("id") != next_required_first.get("id"):
                    return False

            # Template fields for strict signing validation
            template = await self.db.docflow_templates.find_one({"id": document.get("template_id"), "tenant_id": tenant_id})
            field_placements = (template or {}).get("field_placements", []) if template else []

            signing_field_types = ["signature", "initials", "date"]
            signing_fields_for_recipient = [
                f for f in field_placements
                if (f.get("type") in signing_field_types and
                    (not (f.get("assigned_to") or f.get("recipient_id")) or
                     (f.get("assigned_to") or f.get("recipient_id")) == active_recipient.get("template_recipient_id")))
            ]

            # Ensure signing fields exist (after validation this should always be true)
            required_signing_fields = [f for f in signing_fields_for_recipient if f.get("required", True) and f.get("id")]

            field_data = field_data or {}

            # Note: field_data is cumulative (previous signers' values are included).
            # We therefore do NOT reject signing values for other recipients here.

            # Validate required signing fields for this recipient
            for f in required_signing_fields:
                fid = f.get("id")
                if fid not in field_data:
                    return False
                val = field_data.get(fid)
                if f.get("type") in ["signature", "initials"]:
                    if not val:
                        return False
                else:
                    if val is None or str(val).strip() == "":
                        return False

            # Merge field data cumulatively for subsequent signers
            existing_field_data = document.get("field_data", {}) or {}
            merged_field_data = {**existing_field_data, **field_data}

            now = datetime.now(timezone.utc)

            # Upload signed PDF to S3 (frontend sends a cumulative PDF)
            signed_filename = "signed.pdf"
            signed_s3_key = self.s3_service.upload_document(
                file_bytes=signed_pdf,
                tenant_id=document["tenant_id"],
                document_id=document_id,
                filename=signed_filename,
                is_signed=True
            )
            if not signed_s3_key:
                logger.error("Failed to upload signed document to S3")
                return False

            signed_file_url = self.s3_service.get_document_url(signed_s3_key, expiration=604800)

            # Update recipient status
            active_recipient_id = active_recipient.get("id")
            signed_at_iso = now.isoformat()
            signer_name = signature_data.get("signer_name")
            signer_email = signature_data.get("signer_email")

            # Update the recipient in the embedded recipients array
            await self.collection.update_one(
                {"id": document_id, "tenant_id": tenant_id, "recipients.id": active_recipient_id},
                {
                    "$set": {
                        "recipients.$.status": "signed",
                        "recipients.$.signed_at": signed_at_iso,
                        "recipients.$.signer_name": signer_name,
                        "recipients.$.signer_email": signer_email,
                    },
                    "$setOnInsert": {}
                }
            )

            # Append signature records for signature + initials fields
            existing_signatures = document.get("signatures", []) or []
            signatures_to_add: List[Dict[str, Any]] = []
            for f in field_placements:
                if f.get("type") not in ["signature", "initials"]:
                    continue
                recipient_id_on_field = f.get("assigned_to") or f.get("recipient_id")
                if recipient_id_on_field and recipient_id_on_field != active_recipient.get("template_recipient_id"):
                    continue  # Field belongs to a different recipient
                fid = f.get("id")
                if not fid or fid not in merged_field_data:
                    continue
                sig_value = merged_field_data.get(fid)
                if not sig_value:
                    continue
                signatures_to_add.append({
                    "id": str(uuid.uuid4()),
                    "field_id": fid,
                    "recipient_id": active_recipient_id,
                    "signer_name": signer_name,
                    "signer_email": signer_email,
                    "signature_data": sig_value,
                    "signed_at": signed_at_iso,
                    "ip_address": signature_data.get("ip_address"),
                    "user_agent": signature_data.get("user_agent"),
                })

            # Determine completion
            updated_doc = await self.collection.find_one({"id": document_id, "tenant_id": tenant_id})
            recipients_latest = updated_doc.get("recipients", []) if updated_doc else recipients
            required_latest = sorted(
                [r for r in recipients_latest if r.get("is_required", True)],
                key=lambda r: int(r.get("routing_order", 1) or 1)
            )
            all_required_done = all(
                r.get("status") in ["signed", "completed"] for r in required_latest
            )

            # Check if this document belongs to a public_recipients package
            # In public_recipients mode, each signer is independent — signing
            # should immediately mark the document as "signed" for that signer,
            # not "partially_signed" waiting for others.
            is_public_recipients = False
            pkg_id = document.get("package_id")
            # Check document-level delivery_mode first (set by generate-links API)
            doc_delivery_mode = document.get("delivery_mode")
            if doc_delivery_mode == "public_recipients":
                is_public_recipients = True
            elif pkg_id:
                # Fall back to checking the parent package
                parent_pkg = await self.db.docflow_packages.find_one(
                    {"id": pkg_id}, {"_id": 0, "delivery_mode": 1}
                )
                if parent_pkg and parent_pkg.get("delivery_mode") == "public_recipients":
                    is_public_recipients = True

            if is_public_recipients:
                new_status = "signed"
                completed_at = signed_at_iso
            else:
                new_status = "completed" if all_required_done else "partially_signed"
                completed_at = signed_at_iso if all_required_done else None

            # Update document fields in one go
            await self.collection.update_one(
                {"id": document_id, "tenant_id": tenant_id},
                {
                    "$set": {
                        "status": new_status,
                        "signed_s3_key": signed_s3_key,
                        "signed_file_url": signed_file_url,
                        "field_data": merged_field_data,
                        "signed_at": signed_at_iso,
                        "updated_at": signed_at_iso,
                        "completed_at": completed_at
                    },
                    "$setOnInsert": {},
                    "$push": {
                        "audit_trail": {
                            "event": "signed",
                            "timestamp": signed_at_iso,
                            "recipient": signer_email or signer_name
                        }
                    }
                }
            )

            if signatures_to_add:
                await self.collection.update_one(
                    {"id": document_id, "tenant_id": tenant_id},
                    {"$set": {"signatures": (existing_signatures + signatures_to_add)}}
                )

            # Audit + webhooks
            await self.add_audit_event(document_id, "recipient_signed", signer_email)
            await self.webhook_service.fire_document_event(
                document_id,
                "signed",
                tenant_id,
                extra_data={"recipient_email": signer_email, "recipient_name": signer_name}
            )
            
            # Update email history status
            try:
                from .email_history_service import EmailHistoryService
                ehs = EmailHistoryService(self.db)
                await ehs.update_status(document_id, signer_email or "", "signed", tenant_id)
                if all_required_done:
                    await ehs.update_status_by_document(document_id, "completed", tenant_id)
            except Exception:
                pass

            if all_required_done:
                await self.webhook_service.fire_document_event(
                    document_id,
                    "completed",
                    tenant_id,
                    extra_data={"recipient_email": signer_email, "recipient_name": signer_name}
                )

            # For public_recipients mode, sync the signing status back to the
            # package/run level so the admin UI reflects the correct state.
            if is_public_recipients and pkg_id:
                try:
                    await self._sync_public_recipients_signing(
                        pkg_id, recipient_token, signer_name, signer_email, signed_at_iso
                    )
                except Exception as e:
                    logger.warning(f"Failed to sync public_recipients status to package: {e}")

            # Sequential: activate and notify the next recipient after this signer completes.
            if routing_mode == "sequential" and not all_required_done and not is_public_recipients:
                # Recompute active "next" recipient in order.
                recipients_after = (await self.collection.find_one({"id": document_id, "tenant_id": tenant_id})).get("recipients", [])
                required_after_sorted = sorted(
                    [r for r in recipients_after if r.get("is_required", True)],
                    key=lambda r: int(r.get("routing_order", 1) or 1)
                )
                # Find the next pending after active recipient.
                active_index = next((i for i, r in enumerate(required_after_sorted) if r.get("id") == active_recipient_id), None)
                next_recipient = None
                if active_index is not None:
                    for r in required_after_sorted[active_index + 1:]:
                        if r.get("status") not in ["signed", "completed", "declined"]:
                            next_recipient = r
                            break
                if next_recipient:
                    next_recipient_id = next_recipient.get("id")
                    next_sent_at = now.isoformat()
                    await self.collection.update_one(
                        {"id": document_id, "tenant_id": tenant_id, "recipients.id": next_recipient_id},
                        {"$set": {"recipients.$.status": "sent", "recipients.$.sent_at": next_sent_at}}
                    )

                    await self.webhook_service.fire_document_event(
                        document_id,
                        "sent",
                        tenant_id,
                        extra_data={"recipient_email": next_recipient.get("email"), "recipient_name": next_recipient.get("name")}
                    )

                    # Send email for next recipient if requested
                    if "email" in (document.get("delivery_channels") or []) and next_recipient.get("email"):
                        recipient_url = f"{os.environ.get('FRONTEND_URL', '')}/docflow/view/{next_recipient.get('public_token')}"
                        email_result = await self.email_service.send_document_email(
                            recipient_email=next_recipient.get("email"),
                            recipient_name=next_recipient.get("name"),
                            template_name=document.get("template_name"),
                            document_url=recipient_url,
                            pdf_content=None,
                            sender_name="DocFlow CRM",
                        )
                        if email_result.get("success"):
                            await self.email_history_service.log_email(
                                template_id=document.get("template_id"),
                                template_name=document.get("template_name"),
                                document_id=document_id,
                                recipient_email=next_recipient.get("email"),
                                recipient_name=next_recipient.get("name"),
                                crm_object_type=document.get("crm_object_type"),
                                crm_object_id=document.get("crm_object_id"),
                                tenant_id=tenant_id,
                                status="sent",
                                error_message=None
                            )

            logger.info(f"Recipient signing recorded for document={document_id} recipient={active_recipient_id}")
            return True
        except Exception as e:
            logger.error(f"Error in add_signature_with_pdf: {e}", exc_info=True)
            return False


    async def _sync_public_recipients_signing(
        self, package_id: str, recipient_token: str,
        signer_name: str, signer_email: str, signed_at_iso: str
    ):
        """
        For public_recipients mode: sync individual signing back to the package/run level.
        Marks the matching recipient as completed and checks if all recipients are done.
        """
        now_iso = signed_at_iso

        # Find the matching recipient in the package by recipient_token
        # The document recipient has a public_token, the package recipient also has a public_token
        # We need to map from document-level recipient token to package-level recipient
        pkg = await self.db.docflow_packages.find_one({"id": package_id}, {"_id": 0})
        if not pkg:
            return

        # Try to find the package-level recipient by email match
        matched_recipient_id = None
        for r in pkg.get("recipients", []):
            if r.get("email") == signer_email or r.get("name") == signer_name:
                if r.get("status") not in ("completed", "signed"):
                    matched_recipient_id = r.get("id")
                    break

        if not matched_recipient_id:
            return

        # Mark this recipient as completed in both collections
        recipient_update = {
            "$set": {
                "recipients.$.status": "completed",
                "recipients.$.action_taken": "signed",
                "recipients.$.action_at": now_iso,
                "updated_at": now_iso,
            }
        }
        await self.db.docflow_packages.update_one(
            {"id": package_id, "recipients.id": matched_recipient_id},
            recipient_update
        )
        await self.db.docflow_package_runs.update_one(
            {"id": package_id, "recipients.id": matched_recipient_id},
            recipient_update
        )

        # Check if ALL active recipients have now completed
        updated_pkg = await self.db.docflow_packages.find_one(
            {"id": package_id}, {"_id": 0, "recipients": 1}
        )
        if updated_pkg:
            active_recipients = [
                r for r in updated_pkg.get("recipients", [])
                if r.get("role_type") != "RECEIVE_COPY"
            ]
            all_done = all(
                r.get("status") in ("completed", "signed")
                for r in active_recipients
            )
            if all_done:
                complete_update = {"$set": {
                    "status": "completed",
                    "completed_at": now_iso,
                    "updated_at": now_iso,
                }}
                await self.db.docflow_packages.update_one(
                    {"id": package_id}, complete_update
                )
                await self.db.docflow_package_runs.update_one(
                    {"id": package_id}, complete_update
                )


    async def add_signature(self, document_id: str, signature_data: dict, field_data: dict = None) -> bool:
        """Add signature to document and generate signed PDF with S3 storage"""
        try:
            document = await self.collection.find_one({"id": document_id})
            if not document:
                return False

            # Disallow signing expired documents
            if await self.mark_expired_if_needed(document_id, document=document):
                return False

            now = datetime.now(timezone.utc)
            signed_at = now.isoformat()

            # Update document metadata; this endpoint doesn't include PDF bytes,
            # so we only record signature data + field_data.
            update_data: Dict[str, Any] = {
                "status": "signed",
                "field_data": field_data or {},
                "signed_at": signed_at,
                "updated_at": signed_at,
            }

            signature_record = {
                "signer_name": signature_data.get("signer_name"),
                "signer_email": signature_data.get("signer_email"),
                "ip_address": signature_data.get("ip_address"),
                "user_agent": signature_data.get("user_agent"),
                "timestamp": signed_at,
            }
            update_data["signatures"] = [signature_record]

            result = await self.collection.update_one(
                {"id": document_id},
                {"$set": update_data}
            )

            if result.matched_count > 0:
                await self.add_audit_event(document_id, "signed", signature_data.get("signer_email"))
                await self.webhook_service.fire_document_event(document_id, "signed", document.get("tenant_id"))
                return True

            return False
        except Exception as e:
            logger.error(f"Error in add_signature: {e}")
            return False

    async def mark_expired_if_needed(self, document_id: str, document: Optional[dict] = None) -> bool:
        """
        Mark a document as expired (idempotent) and fire `expired` webhook.
        Returns True if the document is expired.
        """
        try:
            if document is None:
                document = await self.collection.find_one({"id": document_id})
                if not document:
                    return False

            expires_at = document.get("expires_at")
            if not expires_at:
                return False

            # Parse ISO strings if necessary
            from datetime import datetime, timezone
            if isinstance(expires_at, str):
                expires_at = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
            if getattr(expires_at, "tzinfo", None) is None:
                expires_at = expires_at.replace(tzinfo=timezone.utc)

            if expires_at >= datetime.now(timezone.utc):
                return False

            if document.get("status") == "expired":
                return True

            now = datetime.now(timezone.utc).isoformat()
            tenant_id = document.get("tenant_id")

            update_result = await self.collection.update_one(
                {"id": document_id, "tenant_id": tenant_id},
                {
                    "$set": {"status": "expired", "updated_at": now, "completed_at": None},
                    "$push": {
                        "audit_trail": {
                            "event": "expired",
                            "timestamp": now,
                            "method": "expiry_check"
                        }
                    }
                }
            )

            # Fire webhook only when we transition to expired.
            if update_result.modified_count > 0:
                await self.webhook_service.fire_document_event(document_id, "expired", tenant_id)

            return True
        except Exception as e:
            logger.error(f"Error in mark_expired_if_needed: {e}")
            # Never block core logic because of expiry marking failures.
            return False

    async def get_document_public_by_recipient_token(self, recipient_token: str) -> Optional[Dict[str, Any]]:
        """
        Public doc fetch for multi-recipient signing.
        `recipient_token` matches `document.recipients[].public_token`.
        Returns document JSON plus `active_recipient` and routing flags.
        For generator documents, returns minimal info with is_generator flag.
        """
        try:
            document = await self.collection.find_one({
                "$or": [
                    {"recipients.public_token": recipient_token},
                    {"public_token": recipient_token}
                ]
            })
            if not document:
                return None

            # If expired, return None so route can map to 410
            if await self.mark_expired_if_needed(document["id"], document=document):
                return {"expired": True, "document_id": document["id"]}

            # Generator documents return minimal info - user must instantiate first
            if document.get("is_public_generator"):
                return {
                    "is_generator": True,
                    "template_name": document.get("template_name", ""),
                    "require_auth": document.get("require_auth", True),
                    "parent_token": recipient_token,
                    "expires_at": document.get("expires_at"),
                    "id": document.get("id"),
                }

            recipients = document.get("recipients", []) or []
            active_recipient = next((r for r in recipients if r.get("public_token") == recipient_token), None)
            if not active_recipient:
                return None

            # Add more context to result
            result = dict(document)
            result["active_recipient"] = active_recipient
            result["can_sign"] = active_recipient.get("status") == "sent"
            
            # Check if this recipient is already verified (OTP)
            otp_record = await self.db.docflow_otps.find_one({
                "token": recipient_token,
                "email": active_recipient.get("email"),
                "verified": True
            })
            result["is_verified"] = bool(otp_record)

            # Mark recipient as viewed (best-effort)
            now = datetime.now(timezone.utc).isoformat()
            if active_recipient.get("status") in ["pending", "sent"]:
                await self.collection.update_one(
                    {"id": document["id"], "recipients.public_token": recipient_token},
                    {
                        "$set": {
                            "recipients.$.status": "viewed",
                            "recipients.$.viewed_at": now,
                        }
                    }
                )
                # Update doc-level status for backwards compatibility
                if document.get("status") in ["generated", "sent"]:
                    await self.collection.update_one(
                        {"id": document["id"]},
                        {"$set": {"status": "viewed", "viewed_at": now}}
                    )
                    document["status"] = "viewed"
                    document["viewed_at"] = now
                
                # Update email history status
                try:
                    from .email_history_service import EmailHistoryService
                    ehs = EmailHistoryService(self.db)
                    await ehs.update_status(document["id"], active_recipient.get("email", ""), "viewed", document.get("tenant_id"))
                except Exception:
                    pass

                # Webhook (recipient-aware via extra_data)
                try:
                    await self.webhook_service.fire_document_event(
                        document["id"],
                        "viewed",
                        document.get("tenant_id"),
                        extra_data={
                            "recipient_email": active_recipient.get("email"),
                            "recipient_name": active_recipient.get("name"),
                        },
                    )
                except Exception:
                    # Never break viewing for webhook issues
                    pass

            # Determine routing mode and signing eligibility
            routing_mode = document.get("routing_mode") or "sequential"
            required = [
                r for r in recipients
                if r.get("is_required", True)
            ]
            required_sorted = sorted(required, key=lambda r: int(r.get("routing_order", 1) or 1))
            active_first = next((r for r in required_sorted if r.get("status") not in ["signed", "completed", "declined"]), None)

            can_sign = True
            if active_recipient.get("status") in ["signed", "completed", "declined"]:
                can_sign = False
            elif routing_mode == "sequential":
                if not active_first or active_recipient.get("id") != active_first.get("id"):
                    can_sign = False

            is_completed = all(
                r.get("status") in ["signed", "completed"] for r in required_sorted
            ) if required_sorted else False

            # Return a copy without Mongo _id (if present)
            result = {k: v for k, v in document.items() if k != "_id"}
            result["active_recipient"] = active_recipient
            result["can_sign"] = can_sign
            result["is_completed"] = is_completed
            result["routing_mode"] = routing_mode
            result["active_recipient_id"] = active_recipient.get("id")
            result["next_recipient_id"] = active_first.get("id") if active_first else None

            return result
        except Exception as e:
            logger.error(f"Error in get_document_public_by_recipient_token: {e}")
            return None

    async def get_document_pdf(self, document_id: str, version: str = "unsigned") -> Optional[bytes]:
        """Get PDF bytes for download from S3"""
        document = await self.collection.find_one({"id": document_id})
        
        if not document:
            return None

        # If expired, treat as not found for signing purposes.
        if await self.mark_expired_if_needed(document_id, document=document):
            return None
        
        if version == "signed":
            s3_key = document.get("signed_s3_key")
            pdf_path = document.get("signed_pdf_path")  # Legacy
        else:
            s3_key = document.get("unsigned_s3_key")
            pdf_path = document.get("unsigned_pdf_path")  # Legacy
        
        # Try S3 first
        if s3_key:
            logger.info(f"Downloading {version} PDF from S3: {s3_key}")
            pdf_bytes = self.s3_service.download_file(s3_key)
            if pdf_bytes:
                return pdf_bytes
            else:
                logger.error(f"Failed to download {version} PDF from S3")
        
        # Fallback to local file (legacy)
        if pdf_path and os.path.exists(pdf_path):
            logger.info(f"Reading {version} PDF from local: {pdf_path}")
            with open(pdf_path, 'rb') as f:
                return f.read()
        
        logger.error(f"{version} PDF not found")
        return None
        
    async def send_otp(self, token: str, name: str, email: str) -> bool:
        """Generate and send OTP to recipient. Also updates recipient name/email in the document."""
        try:
            document = await self.collection.find_one({"recipients.public_token": token})
            if not document:
                return False

            # Update the recipient's name and email in the document record
            # This replaces "Public Viewer" or any placeholder with the real identity
            await self.collection.update_one(
                {"recipients.public_token": token},
                {"$set": {
                    "recipients.$.name": name,
                    "recipients.$.email": email,
                    "recipients.$.source": "public_link",
                    "recipients.$.accessed_at": datetime.now(timezone.utc).isoformat()
                }}
            )
                
            template_name = document.get("template_name", "Document")
            otp_code = "".join([str(secrets.randbelow(10)) for _ in range(6)])
            
            # Store OTP with 10 min expiration
            expires_at = datetime.now(timezone.utc) + timedelta(minutes=10)
            
            # Delete any existing unverified OTPs for this email/token combo
            await self.db.docflow_otps.delete_many({
                "token": token,
                "email": email,
                "verified": False
            })
            
            await self.db.docflow_otps.insert_one({
                "token": token,
                "email": email,
                "otp_code": otp_code,
                "expires_at": expires_at,
                "verified": False,
                "created_at": datetime.now(timezone.utc)
            })
            
            # Send email
            email_result = await self.email_service.send_otp_email(
                recipient_email=email,
                recipient_name=name,
                otp_code=otp_code,
                template_name=template_name
            )
            
            return email_result.get("success", False)
        except Exception as e:
            logger.error(f"Error sending OTP: {e}")
            return False

    async def verify_otp(self, token: str, email: str, otp_code: str) -> bool:
        """Verify recipient OTP and update document recipient status"""
        try:
            now = datetime.now(timezone.utc)
            otp_record = await self.db.docflow_otps.find_one({
                "token": token,
                "email": email,
                "otp_code": otp_code,
                "verified": False,
                "expires_at": {"$gt": now}
            })
            
            if not otp_record:
                return False
                
            # Mark OTP verified
            await self.db.docflow_otps.update_one(
                {"_id": otp_record["_id"]},
                {"$set": {"verified": True, "verified_at": now}}
            )

            # Update the recipient's verification status in the document
            await self.collection.update_one(
                {"recipients.public_token": token},
                {"$set": {
                    "recipients.$.status": "viewed",
                    "recipients.$.verified_at": now.isoformat(),
                    "recipients.$.email": email
                }}
            )
            
            return True
        except Exception as e:
            logger.error(f"Error verifying OTP: {e}")
            return False
            
    async def add_audit_event(self, document_id: str, event: str, user: Optional[str] = None,
                             metadata: Optional[dict] = None) -> bool:
        """Add audit trail event"""
        event_data = {
            "event": event,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "user": user,
            "metadata": metadata or {}
        }
        
        result = await self.collection.update_one(
            {"id": document_id},
            {"$push": {"audit_trail": event_data}}
        )
        
        return result.matched_count > 0
