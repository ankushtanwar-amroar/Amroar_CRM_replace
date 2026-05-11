"""
Document Service - Handles document generation and management
"""
import uuid
from typing import Optional, Dict, Any, List
from datetime import datetime, timezone, timedelta
import secrets
import re
import os
from .system_email_service import SystemEmailService
from .email_history_service import EmailHistoryService
from .webhook_service import WebhookService
import logging

logger = logging.getLogger(__name__)


class DocumentService:
    def __init__(self, db):
        self.db = db
        self.collection = db.docflow_documents
        self.email_service = SystemEmailService()
        self.email_history_service = EmailHistoryService(db)
        self.webhook_service = WebhookService(db)
    
    async def generate_document(self, template_id: str, crm_object_id: str, 
                               crm_object_type: str, user_id: str, tenant_id: str,
                               delivery_channels: List[str], recipient_email: Optional[str] = None,
                               recipient_name: Optional[str] = None) -> dict:
        """Generate document from template and CRM data"""
        
        # Get template
        template = await self.db.docflow_templates.find_one({
            "id": template_id,
            "tenant_id": tenant_id
        })
        
        if not template:
            raise ValueError("Template not found")
        
        # Get CRM record data if not manual send
        crm_data = {}
        if crm_object_type.lower() != "manual" and crm_object_id != "manual-send":
            crm_collection = self.db[f"{crm_object_type.lower()}s"]
            if crm_object_type.lower() == "opportunity":
                crm_collection = self.db.opportunities
            elif crm_object_type.lower() == "account":
                crm_collection = self.db.accounts
            else:
                crm_collection = self.db.object_records  # Generic CRM objects
            
            crm_record = await crm_collection.find_one({"id": crm_object_id})
            if crm_record:
                crm_data = crm_record
        
        # Generate public token
        public_token = secrets.token_urlsafe(32)
        
        # Get frontend URL for user-facing document link
        frontend_url = os.environ.get("FRONTEND_URL", "")
        document_url = f"{frontend_url}/docflow/view/{public_token}"
        
        # Create document
        now = datetime.now(timezone.utc)
        document = {
            "id": str(uuid.uuid4()),
            "tenant_id": tenant_id,
            "template_id": template_id,
            "template_name": template["name"],
            "crm_object_id": crm_object_id,
            "crm_object_type": crm_object_type,
            "status": "generated",
            "public_token": public_token,
            "document_url": document_url,
            "delivery_channels": delivery_channels,
            "recipient_email": recipient_email,
            "recipient_name": recipient_name,
            "signatures": [],
            "audit_trail": [{
                "event": "generated",
                "timestamp": now.isoformat(),
                "user_id": user_id
            }],
            "generated_at": now.isoformat(),
            "expires_at": (now + timedelta(days=30)).isoformat(),
            "created_by": user_id,
            "created_at": now.isoformat(),
            "updated_at": now.isoformat()
        }
        
        await self.collection.insert_one(document)
        
        # Send email if email delivery is enabled
        if "email" in delivery_channels and recipient_email:
            logger.info(f"Sending document email to {recipient_email}")
            email_result = await self.email_service.send_document_email(
                recipient_email=recipient_email,
                recipient_name=recipient_name or "Recipient",
                template_name=template["name"],
                document_url=document_url,
                pdf_content=None,  # Optional: Add PDF attachment
                sender_name="DocFlow CRM"
            )
            
            if email_result.get("success"):
                # Update document status to sent
                await self.collection.update_one(
                    {"id": document["id"]},
                    {
                        "$set": {"status": "sent", "sent_at": datetime.now(timezone.utc).isoformat()},
                        "$push": {
                            "audit_trail": {
                                "event": "sent",
                                "timestamp": datetime.now(timezone.utc).isoformat(),
                                "method": "email",
                                "recipient": recipient_email
                            }
                        }
                    }
                )
                document["status"] = "sent"
                logger.info(f"Document sent successfully to {recipient_email}")
                
                # Log email history
                await self.email_history_service.log_email(
                    template_id=template_id,
                    template_name=template["name"],
                    document_id=document["id"],
                    recipient_email=recipient_email,
                    recipient_name=recipient_name or "Recipient",
                    crm_object_type=crm_object_type,
                    crm_object_id=crm_object_id,
                    tenant_id=tenant_id,
                    status="sent",
                    error_message=None
                )
            else:
                logger.error(f"Failed to send email: {email_result.get('error')}")
                
                # Log failed email
                await self.email_history_service.log_email(
                    template_id=template_id,
                    template_name=template["name"],
                    document_id=document["id"],
                    recipient_email=recipient_email,
                    recipient_name=recipient_name or "Recipient",
                    crm_object_type=crm_object_type,
                    crm_object_id=crm_object_id,
                    tenant_id=tenant_id,
                    status="failed",
                    error_message=email_result.get("error")
                )
        
        return document
    
    async def get_document(self, document_id: str, tenant_id: Optional[str] = None) -> Optional[dict]:
        """Get document by ID"""
        query = {"id": document_id}
        if tenant_id:
            query["tenant_id"] = tenant_id
        return await self.collection.find_one(query)
    
    async def get_document_by_token(self, token: str) -> Optional[dict]:
        """Get document by public token (for signing)"""
        document = await self.collection.find_one({"public_token": token})
        
        if document:
            # Record view event
            if document.get("status") in ["generated", "sent"]:
                await self.add_audit_event(document["id"], "viewed", None)
                await self.collection.update_one(
                    {"id": document["id"]},
                    {
                        "$set": {
                            "status": "viewed",
                            "viewed_at": datetime.now(timezone.utc).isoformat()
                        }
                    }
                )
                # Trigger webhook event
                await self.webhook_service.fire_document_event(document["id"], "viewed", document["tenant_id"])
                
                # Update email history status
                try:
                    from .email_history_service import EmailHistoryService
                    ehs = EmailHistoryService(self.db)
                    recipient_email = ""
                    for r in document.get("recipients", []):
                        if r.get("public_token") == token:
                            recipient_email = r.get("email", "")
                            break
                    if not recipient_email:
                        recipient_email = document.get("recipient_email", "")
                    if recipient_email:
                        await ehs.update_status(document["id"], recipient_email, "viewed", document.get("tenant_id"))
                except Exception:
                    pass
        
        return document
    
    async def list_documents(self, tenant_id: str, template_id: Optional[str] = None,
                           status: Optional[str] = None, search: Optional[str] = None,
                           page: int = 1, limit: int = 10, sort_order: str = "newest",
                           include_children: bool = False) -> Dict[str, Any]:
        """List documents with pagination and search

        OPTIMIZED: Uses projection and parallel queries

        Phase 79 — rollup: by default, filters out documents that have a
        `parent_document_id` set. These are generated per-recipient child
        records that inflate the listing (e.g., one template sent to 3
        recipients would show 4 rows: 1 parent + 3 children). The parent
        row already aggregates all recipient state; children can be fetched
        via the detail endpoint. Pass `include_children=True` to see them.
        """
        query = {"tenant_id": tenant_id}
        if template_id:
            query["template_id"] = template_id
        # Phase 81.85 — Status filter is applied AFTER aggregate_status is
        # computed (see below). DB-level status filter was previously a
        # different code path that didn't match the UI's aggregate_status
        # chip — e.g., a doc with raw status='generated' but a recipient
        # marked 'viewed' shows "In Progress" in the UI but the
        # `in_progress` filter required `doc.status IN [partially_signed,
        # in_progress, sent, pending]` which excluded it. We now mirror the
        # UI's logic exactly.
        ui_status = (status or "").lower().strip()
        if ui_status in ("all", ""):
            ui_status = None
        if search:
            # Phase 81.34 — broaden search across send id, template name, CRM
            # object type, AND nested recipient name/email arrays so the
            # Documents tab finds matches by any signer's name/email too.
            query["$or"] = [
                {"id": {"$regex": search, "$options": "i"}},
                {"template_name": {"$regex": search, "$options": "i"}},
                {"crm_object_type": {"$regex": search, "$options": "i"}},
                {"recipient_email": {"$regex": search, "$options": "i"}},
                {"recipient_name": {"$regex": search, "$options": "i"}},
                {"recipients.name": {"$regex": search, "$options": "i"}},
                {"recipients.email": {"$regex": search, "$options": "i"}},
            ]
        if not include_children:
            # Phase 79: exclude per-recipient children (their parent covers them)
            query["$and"] = (query.get("$and") or []) + [
                {"$or": [
                    {"parent_document_id": None},
                    {"parent_document_id": {"$exists": False}},
                    {"parent_document_id": ""},
                ]}
            ]

        # Sort direction
        sort_dir = -1 if sort_order == "newest" else 1

        # OPTIMIZATION: Use projection to exclude large fields
        projection = {
            "_id": 0,
            "id": 1,
            "template_id": 1,
            "template_name": 1,
            "crm_object_id": 1,
            "crm_object_type": 1,
            "status": 1,
            "recipient_email": 1,
            "recipient_name": 1,
            "created_at": 1,
            "updated_at": 1,
            "sent_at": 1,
            "viewed_at": 1,
            "signed_at": 1,
            "completed_at": 1,
            "expires_at": 1,
            "document_url": 1,
            # Phase 79 — rollup extras for enterprise listing
            "recipients": 1,
            "delivery_channels": 1,
            "delivery_mode": 1,
            "routing_mode": 1,
            "parent_document_id": 1,
            "child_document_ids": 1,
            "public_token": 1,
            # Rejection fields for comment icon display
            "reject_reason": 1,
            "rejected_by": 1,
            "rejected_at": 1
            # Exclude: audit_trail, signatures, field_data (large fields)
        }
        
        # OPTIMIZATION: Use projection to exclude large fields (audit_trail, signatures, field_data)
        # Phase 81.85 — Fetch ALL matching docs (no pagination yet), enrich,
        # then filter by ui_status (matches the UI's aggregate_status chip),
        # then paginate the filtered set. The DB-level status filter approach
        # diverged from the UI's chip and caused mismatched filter results.
        documents = await self.collection.find(query, projection).sort(
            "created_at", sort_dir
        ).to_list(length=None)

        # Phase 81.34 — Treat approve/reject/review as terminal "done" states
        # alongside signed/completed when computing rollup counters and the
        # aggregate status chip. This matches the user's spec: a doc whose
        # final routing step is approved/rejected/reviewed is "Completed".
        TERMINAL_DONE = ("signed", "completed", "approved", "rejected", "reviewed")

        # Phase 79 — enrich each doc with derived rollup fields for the UI.
        for doc in documents:
            recipients = doc.get("recipients") or []
            total_recipients = len(recipients)
            signed_count = sum(1 for r in recipients if r.get("status") in TERMINAL_DONE or r.get("signed_at"))
            viewed_count = sum(1 for r in recipients if r.get("status") == "viewed")
            voided_count = sum(1 for r in recipients if r.get("voided") or r.get("status") == "voided")
            pending_count = max(0, total_recipients - signed_count - voided_count)

            channels = doc.get("delivery_channels") or []
            is_public_link = "public_link" in channels and "email" not in channels
            is_email = "email" in channels
            doc["send_type"] = "public_link" if is_public_link else ("email" if is_email else (channels[0] if channels else "email"))
            doc["total_recipients"] = total_recipients
            doc["signed_count"] = signed_count
            doc["viewed_count"] = viewed_count
            doc["voided_count"] = voided_count
            doc["pending_count"] = pending_count

            # Aggregate status (for UI chip). Uses recipients when present;
            # falls back to the doc's own status for single-recipient legacy rows.
            raw_status = (doc.get("status") or "").lower()
            if doc["send_type"] == "public_link":
                # Public link: Active (always, until closed). Submissions appear on detail page.
                if raw_status in ("voided", "cancelled", "closed"):
                    agg = "closed"
                else:
                    agg = "active" if not signed_count else "active_with_submissions"
            else:
                if total_recipients == 0:
                    agg = raw_status or "pending"
                elif voided_count == total_recipients:
                    agg = "voided"
                elif signed_count == total_recipients:
                    agg = "completed"
                elif signed_count > 0 or viewed_count > 0:
                    agg = "in_progress"
                else:
                    agg = "pending"
            doc["aggregate_status"] = agg

            # Best-effort last_updated: completed_at || signed_at || viewed_at || sent_at || updated_at || created_at
            doc["last_updated"] = (
                doc.get("completed_at")
                or doc.get("signed_at")
                or doc.get("viewed_at")
                or doc.get("sent_at")
                or doc.get("updated_at")
                or doc.get("created_at")
            )

        # Phase 81.85 — Apply UI-level status filter AFTER aggregation so the
        # filter chip on the dashboard always matches the badges shown.
        # ui_status values come from the UI: all / in_progress / pending /
        # completed / voided. We also accept legacy values like 'sent',
        # 'viewed', 'signed', 'declined', 'closed', 'active' for callers that
        # still pass raw statuses.
        if ui_status:
            def matches(d):
                agg = (d.get("aggregate_status") or "").lower()
                if ui_status in ("in_progress", "in-progress"):
                    return agg == "in_progress"
                if ui_status == "pending":
                    return agg == "pending"
                if ui_status == "completed":
                    return agg == "completed"
                if ui_status == "voided":
                    return agg in ("voided", "closed")
                if ui_status == "active":
                    return agg in ("active", "active_with_submissions")
                if ui_status == "declined":
                    return agg == "declined"
                # Fallback: equality on aggregate_status OR raw doc.status
                return agg == ui_status or (d.get("status") or "").lower() == ui_status
            documents = [d for d in documents if matches(d)]

        total = len(documents)
        skip = (page - 1) * limit
        documents = documents[skip: skip + limit]

        return {
            "documents": documents,
            "total": total,
            "page": page,
            "limit": limit,
            "pages": (total + limit - 1) // limit
        }
    
    async def add_signature(self, document_id: str, signature_data: dict) -> bool:
        """Add signature to document"""
        now = datetime.now(timezone.utc)
        result = await self.collection.update_one(
            {"id": document_id},
            {
                "$push": {"signatures": signature_data},
                "$set": {
                    "status": "signed",
                    "signed_at": now.isoformat(),
                    "updated_at": now.isoformat()
                }
            }
        )
        
        if result.matched_count > 0:
            await self.add_audit_event(
                document_id,
                "signed",
                signature_data.get("signer_name"),
                {"ip": signature_data.get("ip_address")}
            )
        
        return result.matched_count > 0
    
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
    
    def merge_template_data(self, template_html: str, crm_data: dict) -> str:
        """Merge CRM data into template"""
        # Simple merge - replace {{Object.Field}} with actual values
        result = template_html
        
        for key, value in crm_data.items():
            if isinstance(value, dict):
                for subkey, subvalue in value.items():
                    pattern = "{{" + f"{key}.{subkey}" + "}}"
                    result = result.replace(pattern, str(subvalue))
            else:
                pattern = "{{" + key + "}}"
                result = result.replace(pattern, str(value))
        
        return result
