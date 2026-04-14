"""
Activity Log Service — Centralized logging for all DocFlow events.
Logs are stored in the docflow_activity_logs collection.
"""
import logging
from datetime import datetime, timezone
from typing import Optional, Dict, Any

logger = logging.getLogger(__name__)


class ActivityLogService:
    def __init__(self, db):
        self.db = db
        self.collection = db.docflow_activity_logs

    async def log(
        self,
        tenant_id: str,
        event_type: str,
        message: str,
        template_id: Optional[str] = None,
        document_id: Optional[str] = None,
        recipient: Optional[str] = None,
        details: Optional[Dict[str, Any]] = None,
        user_id: Optional[str] = None,
    ):
        """Insert a single activity log entry."""
        try:
            entry = {
                "tenant_id": tenant_id,
                "event_type": event_type,
                "message": message,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
            if template_id:
                entry["template_id"] = template_id
            if document_id:
                entry["document_id"] = document_id
            if recipient:
                entry["recipient"] = recipient
            if details:
                entry["details"] = details
            if user_id:
                entry["user_id"] = user_id

            await self.collection.insert_one(entry)
        except Exception as e:
            logger.error(f"Failed to write activity log: {e}")

    # ── Convenience helpers ──────────────────────────

    async def log_document_created(self, tenant_id, template_id, document_id, doc_name, user_id=None):
        await self.log(
            tenant_id=tenant_id,
            event_type="document_created",
            message=f"Document '{doc_name}' created",
            template_id=template_id,
            document_id=document_id,
            user_id=user_id,
        )

    async def log_document_sent(self, tenant_id, template_id, document_id, recipient_email, user_id=None):
        await self.log(
            tenant_id=tenant_id,
            event_type="sent",
            message=f"Document sent to {recipient_email}",
            template_id=template_id,
            document_id=document_id,
            recipient=recipient_email,
            user_id=user_id,
        )

    async def log_public_link_generated(self, tenant_id, template_id, document_id, link, user_id=None):
        await self.log(
            tenant_id=tenant_id,
            event_type="public_link_generated",
            message="Public link generated for document",
            template_id=template_id,
            document_id=document_id,
            details={"link": link},
            user_id=user_id,
        )

    async def log_document_viewed(self, tenant_id, template_id, document_id, viewer=None):
        await self.log(
            tenant_id=tenant_id,
            event_type="viewed",
            message=f"Document viewed{' by ' + viewer if viewer else ''}",
            template_id=template_id,
            document_id=document_id,
            recipient=viewer,
        )

    async def log_document_signed(self, tenant_id, template_id, document_id, signer):
        await self.log(
            tenant_id=tenant_id,
            event_type="signed",
            message=f"Document signed by {signer}",
            template_id=template_id,
            document_id=document_id,
            recipient=signer,
        )

    async def log_connection_event(self, tenant_id, event_type, provider, status, error=None, user_id=None):
        await self.log(
            tenant_id=tenant_id,
            event_type=event_type,
            message=f"Connection {event_type.replace('connection_', '')}: {provider} — {status}",
            details={"provider": provider, "status": status, "error": error},
            user_id=user_id,
        )
