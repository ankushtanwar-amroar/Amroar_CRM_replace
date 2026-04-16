"""
Email History Service - Track all document emails with lifecycle status tracking
"""
from datetime import datetime, timezone
import uuid
from typing import List, Dict, Any, Optional


# Valid email statuses in lifecycle order
EMAIL_STATUSES = ["sent", "delivered", "opened", "viewed", "signed", "completed", "failed", "bounced", "expired"]

# Status priority for updates (higher = later in lifecycle, can only move forward)
STATUS_PRIORITY = {s: i for i, s in enumerate(EMAIL_STATUSES)}


class EmailHistoryService:
    def __init__(self, db):
        self.db = db
        self.collection = db.docflow_email_history
    
    async def log_email(
        self,
        template_id: str,
        template_name: str,
        document_id: str,
        recipient_email: str,
        recipient_name: str,
        crm_object_type: str,
        crm_object_id: str,
        tenant_id: str,
        status: str = "sent",
        error_message: Optional[str] = None,
        source: str = "template",
        package_id: Optional[str] = None,
        package_name: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Log email send event"""
        now = datetime.now(timezone.utc)
        email_log = {
            "id": str(uuid.uuid4()),
            "template_id": template_id,
            "template_name": template_name,
            "document_id": document_id,
            "recipient_email": recipient_email,
            "recipient_name": recipient_name or "",
            "crm_object_type": crm_object_type,
            "crm_object_id": crm_object_id,
            "tenant_id": tenant_id,
            "status": status,
            "error_message": error_message,
            "source": source,
            "package_id": package_id,
            "package_name": package_name,
            "subject": f"Your {template_name} is ready to review and sign",
            "sent_at": now.isoformat(),
            "delivered_at": None,
            "opened_at": None,
            "viewed_at": None,
            "signed_at": None,
            "failed_at": now.isoformat() if status == "failed" else None,
            "created_at": now.isoformat(),
            "status_history": [
                {"status": status, "timestamp": now.isoformat()}
            ]
        }
        
        await self.collection.insert_one(email_log)
        email_log.pop("_id", None)
        return email_log
    
    async def update_status(
        self,
        document_id: str,
        recipient_email: str,
        new_status: str,
        tenant_id: Optional[str] = None
    ) -> bool:
        """
        Update email status. Only moves forward in lifecycle.
        Returns True if status was updated.
        """
        if new_status not in STATUS_PRIORITY:
            return False
        
        query = {"document_id": document_id, "recipient_email": recipient_email}
        if tenant_id:
            query["tenant_id"] = tenant_id
        
        email = await self.collection.find_one(query, {"_id": 0, "status": 1})
        if not email:
            return False
        
        current_priority = STATUS_PRIORITY.get(email.get("status", "sent"), 0)
        new_priority = STATUS_PRIORITY.get(new_status, 0)
        
        # Only allow forward movement (except failed/bounced which can happen anytime)
        if new_status not in ("failed", "bounced") and new_priority <= current_priority:
            return False
        
        now = datetime.now(timezone.utc).isoformat()
        update = {
            "$set": {
                "status": new_status,
                f"{new_status}_at": now
            },
            "$push": {
                "status_history": {"status": new_status, "timestamp": now}
            }
        }
        
        result = await self.collection.update_one(query, update)
        return result.modified_count > 0
    
    async def update_status_by_document(
        self,
        document_id: str,
        new_status: str,
        tenant_id: Optional[str] = None
    ) -> int:
        """
        Update status for ALL emails related to a document.
        Used when document status changes (e.g., signed, completed).
        Returns count of updated records.
        """
        query = {"document_id": document_id}
        if tenant_id:
            query["tenant_id"] = tenant_id
        
        emails = await self.collection.find(query, {"_id": 0, "id": 1, "recipient_email": 1}).to_list(100)
        updated = 0
        for email in emails:
            if await self.update_status(document_id, email["recipient_email"], new_status, tenant_id):
                updated += 1
        return updated
    
    async def get_history_for_record(
        self,
        crm_object_type: str,
        crm_object_id: str,
        tenant_id: str,
        limit: int = 50
    ) -> List[Dict[str, Any]]:
        """Get email history for a specific CRM record"""
        history = await self.collection.find({
            "crm_object_type": crm_object_type,
            "crm_object_id": crm_object_id,
            "tenant_id": tenant_id
        }).sort("sent_at", -1).limit(limit).to_list(length=limit)
        
        for item in history:
            item.pop("_id", None)
            self._normalize_dates(item)
        
        return history
    
    async def get_all_history(
        self,
        tenant_id: str,
        status: Optional[str] = None,
        page: int = 1,
        limit: int = 20
    ) -> Dict[str, Any]:
        """Get all email history for tenant with pagination"""
        query = {"tenant_id": tenant_id}
        if status and status != "all":
            query["status"] = status
        
        skip = (page - 1) * limit
        total = await self.collection.count_documents(query)
        
        cursor = self.collection.find(query).sort("sent_at", -1).skip(skip).limit(limit)
        history = await cursor.to_list(length=limit)
        
        # Get status counts for filter badges
        pipeline = [
            {"$match": {"tenant_id": tenant_id}},
            {"$group": {"_id": "$status", "count": {"$sum": 1}}}
        ]
        status_counts_raw = await self.collection.aggregate(pipeline).to_list(20)
        status_counts = {s["_id"]: s["count"] for s in status_counts_raw}
        
        for item in history:
            item.pop("_id", None)
            self._normalize_dates(item)
                        
        return {
            "history": history,
            "total": total,
            "page": page,
            "limit": limit,
            "pages": (total + limit - 1) // limit,
            "status_counts": status_counts
        }
    
    async def retry_failed_email(self, email_id: str) -> bool:
        """Mark failed email for retry"""
        result = await self.collection.update_one(
            {"id": email_id},
            {
                "$set": {
                    "status": "pending",
                    "retry_at": datetime.now(timezone.utc).isoformat()
                },
                "$push": {
                    "status_history": {
                        "status": "pending",
                        "timestamp": datetime.now(timezone.utc).isoformat()
                    }
                }
            }
        )
        return result.modified_count > 0
    
    def _normalize_dates(self, item):
        """Normalize date fields to ISO string format"""
        date_fields = ["sent_at", "created_at", "retry_at", "delivered_at", 
                       "opened_at", "viewed_at", "signed_at", "failed_at"]
        for dt_field in date_fields:
            if item.get(dt_field) and not isinstance(item[dt_field], str):
                try:
                    item[dt_field] = item[dt_field].isoformat()
                except Exception:
                    item[dt_field] = str(item[dt_field])
