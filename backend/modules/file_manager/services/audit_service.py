"""
File Manager - Audit Service
Handles audit logging for all file operations.
"""

from typing import Optional, List, Dict, Any
from datetime import datetime
from motor.motor_asyncio import AsyncIOMotorDatabase
import logging

from ..models.sharing_models import (
    AuditEvent, AuditEventType, AuditEventCreate, AuditLogFilter
)

logger = logging.getLogger(__name__)

# Collection name
AUDIT_COLLECTION = "fm_audit_events"


class AuditService:
    """Service for managing audit logs"""
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.collection = db[AUDIT_COLLECTION]
    
    async def log_event(
        self,
        tenant_id: str,
        event_type: AuditEventType,
        description: str,
        user_id: Optional[str] = None,
        user_name: Optional[str] = None,
        user_email: Optional[str] = None,
        file_id: Optional[str] = None,
        file_name: Optional[str] = None,
        folder_id: Optional[str] = None,
        library_id: Optional[str] = None,
        public_link_id: Optional[str] = None,
        record_id: Optional[str] = None,
        object_name: Optional[str] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        details: Dict[str, Any] = None
    ) -> AuditEvent:
        """Create an audit log entry"""
        event = AuditEvent(
            tenant_id=tenant_id,
            event_type=event_type,
            event_description=description,
            user_id=user_id,
            user_name=user_name,
            user_email=user_email,
            file_id=file_id,
            file_name=file_name,
            folder_id=folder_id,
            library_id=library_id,
            public_link_id=public_link_id,
            record_id=record_id,
            object_name=object_name,
            ip_address=ip_address,
            user_agent=user_agent,
            details=details or {}
        )
        
        await self.collection.insert_one(event.dict())
        
        logger.info(f"[Audit] {event_type}: {description} by {user_name or 'anonymous'}")
        
        return event
    
    async def get_events(
        self,
        tenant_id: str,
        filters: AuditLogFilter
    ) -> List[Dict[str, Any]]:
        """Get audit events with filters"""
        query = {"tenant_id": tenant_id}
        
        if filters.event_types:
            query["event_type"] = {"$in": [et.value for et in filters.event_types]}
        
        if filters.file_id:
            query["file_id"] = filters.file_id
        
        if filters.user_id:
            query["user_id"] = filters.user_id
        
        if filters.start_date:
            query["created_at"] = {"$gte": filters.start_date}
        
        if filters.end_date:
            if "created_at" in query:
                query["created_at"]["$lte"] = filters.end_date
            else:
                query["created_at"] = {"$lte": filters.end_date}
        
        cursor = self.collection.find(
            query,
            {"_id": 0}
        ).sort("created_at", -1).skip(filters.offset).limit(filters.limit)
        
        return await cursor.to_list(length=filters.limit)
    
    async def get_file_history(
        self,
        tenant_id: str,
        file_id: str,
        limit: int = 50
    ) -> List[Dict[str, Any]]:
        """Get audit history for a specific file"""
        cursor = self.collection.find(
            {"tenant_id": tenant_id, "file_id": file_id},
            {"_id": 0}
        ).sort("created_at", -1).limit(limit)
        
        return await cursor.to_list(length=limit)
    
    async def get_user_activity(
        self,
        tenant_id: str,
        user_id: str,
        limit: int = 50
    ) -> List[Dict[str, Any]]:
        """Get audit history for a specific user"""
        cursor = self.collection.find(
            {"tenant_id": tenant_id, "user_id": user_id},
            {"_id": 0}
        ).sort("created_at", -1).limit(limit)
        
        return await cursor.to_list(length=limit)
    
    async def get_public_link_access_log(
        self,
        tenant_id: str,
        public_link_id: str,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """Get access log for a public link"""
        cursor = self.collection.find(
            {
                "tenant_id": tenant_id,
                "public_link_id": public_link_id,
                "event_type": AuditEventType.PUBLIC_LINK_ACCESSED.value
            },
            {"_id": 0}
        ).sort("created_at", -1).limit(limit)
        
        return await cursor.to_list(length=limit)
    
    async def get_stats(
        self,
        tenant_id: str,
        days: int = 30
    ) -> Dict[str, Any]:
        """Get audit statistics for dashboard"""
        from datetime import timedelta
        
        start_date = datetime.utcnow() - timedelta(days=days)
        
        pipeline = [
            {
                "$match": {
                    "tenant_id": tenant_id,
                    "created_at": {"$gte": start_date}
                }
            },
            {
                "$group": {
                    "_id": "$event_type",
                    "count": {"$sum": 1}
                }
            }
        ]
        
        result = await self.collection.aggregate(pipeline).to_list(length=100)
        
        stats = {
            "period_days": days,
            "total_events": sum(r["count"] for r in result),
            "events_by_type": {r["_id"]: r["count"] for r in result}
        }
        
        return stats
    
    # Convenience methods for common events
    
    async def log_file_upload(
        self,
        tenant_id: str,
        user_id: str,
        user_name: str,
        file_id: str,
        file_name: str,
        details: Dict[str, Any] = None
    ):
        """Log file upload event"""
        return await self.log_event(
            tenant_id=tenant_id,
            event_type=AuditEventType.FILE_UPLOADED,
            description=f"File '{file_name}' uploaded",
            user_id=user_id,
            user_name=user_name,
            file_id=file_id,
            file_name=file_name,
            details=details
        )
    
    async def log_file_download(
        self,
        tenant_id: str,
        user_id: Optional[str],
        user_name: Optional[str],
        file_id: str,
        file_name: str,
        ip_address: Optional[str] = None
    ):
        """Log file download event"""
        return await self.log_event(
            tenant_id=tenant_id,
            event_type=AuditEventType.FILE_DOWNLOADED,
            description=f"File '{file_name}' downloaded",
            user_id=user_id,
            user_name=user_name,
            file_id=file_id,
            file_name=file_name,
            ip_address=ip_address
        )
    
    async def log_version_created(
        self,
        tenant_id: str,
        user_id: str,
        user_name: str,
        file_id: str,
        file_name: str,
        version_number: int
    ):
        """Log version creation event"""
        return await self.log_event(
            tenant_id=tenant_id,
            event_type=AuditEventType.VERSION_CREATED,
            description=f"Version {version_number} created for '{file_name}'",
            user_id=user_id,
            user_name=user_name,
            file_id=file_id,
            file_name=file_name,
            details={"version_number": version_number}
        )
    
    async def log_file_linked(
        self,
        tenant_id: str,
        user_id: str,
        user_name: str,
        file_id: str,
        file_name: str,
        record_id: str,
        object_name: str
    ):
        """Log file-record link event"""
        return await self.log_event(
            tenant_id=tenant_id,
            event_type=AuditEventType.FILE_LINKED,
            description=f"File '{file_name}' linked to {object_name} record",
            user_id=user_id,
            user_name=user_name,
            file_id=file_id,
            file_name=file_name,
            record_id=record_id,
            object_name=object_name
        )
    
    async def log_public_link_created(
        self,
        tenant_id: str,
        user_id: str,
        user_name: str,
        file_id: str,
        file_name: str,
        public_link_id: str
    ):
        """Log public link creation"""
        return await self.log_event(
            tenant_id=tenant_id,
            event_type=AuditEventType.PUBLIC_LINK_CREATED,
            description=f"Public link created for '{file_name}'",
            user_id=user_id,
            user_name=user_name,
            file_id=file_id,
            file_name=file_name,
            public_link_id=public_link_id
        )
    
    async def log_public_link_accessed(
        self,
        tenant_id: str,
        file_id: str,
        file_name: str,
        public_link_id: str,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None
    ):
        """Log public link access (anonymous)"""
        return await self.log_event(
            tenant_id=tenant_id,
            event_type=AuditEventType.PUBLIC_LINK_ACCESSED,
            description=f"Public link accessed for '{file_name}'",
            file_id=file_id,
            file_name=file_name,
            public_link_id=public_link_id,
            ip_address=ip_address,
            user_agent=user_agent
        )
    
    async def log_file_shared(
        self,
        tenant_id: str,
        user_id: str,
        user_name: str,
        file_id: str,
        file_name: str,
        shared_with: List[str]
    ):
        """Log internal file sharing event"""
        return await self.log_event(
            tenant_id=tenant_id,
            event_type=AuditEventType.FILE_SHARED,
            description=f"File '{file_name}' shared internally with {len(shared_with)} user(s)",
            user_id=user_id,
            user_name=user_name,
            file_id=file_id,
            file_name=file_name,
            details={"shared_with_user_ids": shared_with}
        )
    
    async def log_file_deleted(
        self,
        tenant_id: str,
        user_id: str,
        user_name: str,
        file_id: str,
        file_name: str,
        permanent: bool = False
    ):
        """Log file deletion event"""
        return await self.log_event(
            tenant_id=tenant_id,
            event_type=AuditEventType.FILE_DELETED,
            description=f"File '{file_name}' {'permanently deleted' if permanent else 'deleted'}",
            user_id=user_id,
            user_name=user_name,
            file_id=file_id,
            file_name=file_name,
            details={"permanent": permanent}
        )
