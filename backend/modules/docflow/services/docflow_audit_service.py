"""
DocFlow Audit Service — Phase 1

Dual-write: writes to docflow_audit_events collection AND
appends to the document's embedded audit_trail[] for backward compat.
"""
import logging
from typing import Optional, Dict, Any
from datetime import datetime, timezone
from uuid import uuid4

logger = logging.getLogger(__name__)


class DocFlowAuditService:
    def __init__(self, db):
        self.db = db

    async def log_event(
        self,
        tenant_id: str,
        package_id: str,
        event_type: str,
        actor: str = "system",
        document_id: Optional[str] = None,
        recipient_id: Optional[str] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> str:
        """
        Log a structured audit event.
        Returns the event ID.
        """
        now = datetime.now(timezone.utc)
        event_id = str(uuid4())

        event = {
            "id": event_id,
            "tenant_id": tenant_id,
            "package_id": package_id,
            "document_id": document_id,
            "recipient_id": recipient_id,
            "event_type": event_type,
            "actor": actor,
            "ip_address": ip_address,
            "user_agent": user_agent,
            "metadata": metadata or {},
            "timestamp": now.isoformat(),
        }

        try:
            await self.db.docflow_audit_events.insert_one(event)
        except Exception as e:
            logger.error(f"[AuditService] Failed to write audit event: {e}")

        # Dual-write: also append to document's embedded audit_trail if document_id is set
        if document_id:
            try:
                await self.db.docflow_documents.update_one(
                    {"id": document_id},
                    {"$push": {"audit_trail": {
                        "event": event_type,
                        "timestamp": now.isoformat(),
                        "user": actor,
                        "package_id": package_id,
                        "recipient_id": recipient_id,
                        **(metadata or {}),
                    }}}
                )
            except Exception as e:
                logger.warning(f"[AuditService] Dual-write to document audit_trail failed: {e}")

        return event_id

    async def get_package_events(
        self,
        package_id: str,
        tenant_id: str,
        limit: int = 100,
        skip: int = 0,
    ) -> list:
        """Get all audit events for a package, ordered chronologically (oldest first)."""
        cursor = self.db.docflow_audit_events.find(
            {"package_id": package_id, "tenant_id": tenant_id},
            {"_id": 0},
        ).sort("timestamp", 1).skip(skip).limit(limit)
        return await cursor.to_list(length=limit)

    async def get_document_events(
        self,
        document_id: str,
        tenant_id: str,
        limit: int = 100,
    ) -> list:
        """Get audit events for a specific document within a package."""
        cursor = self.db.docflow_audit_events.find(
            {"document_id": document_id, "tenant_id": tenant_id},
            {"_id": 0},
        ).sort("timestamp", 1).limit(limit)
        return await cursor.to_list(length=limit)
