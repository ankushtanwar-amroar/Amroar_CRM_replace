"""
Activity Linking Service

Handles updating last_activity_date on core CRM objects when activities
(Task, Event, Call, Email) are created or completed.

This service is called by:
- Record creation hooks
- Task completion events
- Activity logging

The last_activity_date field is stored directly on records, not calculated dynamically.
"""
from datetime import datetime, timezone
from typing import Optional, List
from motor.motor_asyncio import AsyncIOMotorDatabase
import logging

logger = logging.getLogger(__name__)

# Activity types that trigger last_activity_date updates
ACTIVITY_TYPES = {"task", "event", "call", "email"}

# Core objects that have last_activity_date tracking
TRACKED_OBJECTS = {"lead", "account", "contact", "opportunity"}


class ActivityLinkingService:
    """Service for updating last_activity_date on linked records"""
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
    
    async def update_last_activity_date(
        self,
        tenant_id: str,
        record_id: str,
        object_type: str,
        activity_date: Optional[datetime] = None
    ) -> bool:
        """
        Update the last_activity_date on a specific record.
        
        Args:
            tenant_id: Tenant ID
            record_id: ID of the record to update
            object_type: Type of the record (lead, account, contact, opportunity)
            activity_date: Date of the activity (defaults to now)
        
        Returns:
            True if updated, False otherwise
        """
        if object_type not in TRACKED_OBJECTS:
            return False
        
        if activity_date is None:
            activity_date = datetime.now(timezone.utc)
        
        result = await self.db.object_records.update_one(
            {
                "id": record_id,
                "tenant_id": tenant_id,
                "object_name": object_type
            },
            {
                "$set": {
                    "data.last_activity_date": activity_date.isoformat(),
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }
            }
        )
        
        if result.modified_count > 0:
            logger.info(f"Updated last_activity_date for {object_type} {record_id}")
            return True
        
        return False
    
    async def process_activity_creation(
        self,
        tenant_id: str,
        activity_type: str,
        activity_data: dict,
        activity_date: Optional[datetime] = None
    ) -> List[str]:
        """
        Process an activity creation and update linked records.
        
        Called when a Task, Event, Call, or Email is created.
        Updates last_activity_date on all linked core objects.
        
        Args:
            tenant_id: Tenant ID
            activity_type: Type of activity (task, event, call, email)
            activity_data: The activity record data
            activity_date: Override activity date (defaults to now)
        
        Returns:
            List of updated record IDs
        """
        if activity_type not in ACTIVITY_TYPES:
            return []
        
        updated_records = []
        
        if activity_date is None:
            activity_date = datetime.now(timezone.utc)
        
        # Get linked record info from various field names
        linked_records = self._extract_linked_records(activity_data)
        
        for linked_type, linked_id in linked_records:
            if linked_type in TRACKED_OBJECTS and linked_id:
                success = await self.update_last_activity_date(
                    tenant_id, linked_id, linked_type, activity_date
                )
                if success:
                    updated_records.append(linked_id)
        
        return updated_records
    
    async def process_activity_completion(
        self,
        tenant_id: str,
        activity_type: str,
        activity_data: dict
    ) -> List[str]:
        """
        Process an activity completion and update linked records.
        
        Called when a Task is marked complete, Event ends, etc.
        Updates last_activity_date to the completion time.
        
        Args:
            tenant_id: Tenant ID
            activity_type: Type of activity (task, event, call, email)
            activity_data: The activity record data
        
        Returns:
            List of updated record IDs
        """
        return await self.process_activity_creation(
            tenant_id, 
            activity_type, 
            activity_data,
            activity_date=datetime.now(timezone.utc)
        )
    
    def _extract_linked_records(self, activity_data: dict) -> List[tuple]:
        """
        Extract linked record references from activity data.
        
        Handles various field naming conventions:
        - related_to_type / related_to_id
        - what_type / what_id (Salesforce convention)
        - who_type / who_id (Salesforce convention for contacts)
        - account_id, contact_id, lead_id, opportunity_id (direct links)
        """
        linked = []
        data = activity_data.get("data", activity_data)
        
        # Standard related_to fields
        related_type = data.get("related_to_type") or data.get("what_type")
        related_id = data.get("related_to_id") or data.get("what_id")
        if related_type and related_id:
            linked.append((related_type.lower(), related_id))
        
        # Who field (contacts/leads)
        who_type = data.get("who_type")
        who_id = data.get("who_id")
        if who_type and who_id:
            linked.append((who_type.lower(), who_id))
        
        # Direct reference fields
        direct_fields = [
            ("account", "account_id"),
            ("contact", "contact_id"),
            ("lead", "lead_id"),
            ("opportunity", "opportunity_id")
        ]
        
        for obj_type, field_name in direct_fields:
            field_value = data.get(field_name)
            if field_value:
                linked.append((obj_type, field_value))
        
        return linked
    
    async def backfill_last_activity_dates(
        self,
        tenant_id: str,
        object_type: Optional[str] = None,
        batch_size: int = 100
    ) -> dict:
        """
        Backfill last_activity_date for existing records.
        
        Calculates the most recent activity for each record and sets last_activity_date.
        This is a one-time migration utility.
        
        Args:
            tenant_id: Tenant ID
            object_type: Specific object type to backfill (or all if None)
            batch_size: Number of records to process per batch
        
        Returns:
            Statistics about the backfill operation
        """
        objects_to_process = [object_type] if object_type else list(TRACKED_OBJECTS)
        
        stats = {
            "processed": 0,
            "updated": 0,
            "errors": 0,
            "by_object": {}
        }
        
        for obj_type in objects_to_process:
            obj_stats = {"processed": 0, "updated": 0}
            
            # Get all records of this type without last_activity_date
            cursor = self.db.object_records.find({
                "tenant_id": tenant_id,
                "object_name": obj_type,
                "$or": [
                    {"data.last_activity_date": {"$exists": False}},
                    {"data.last_activity_date": None}
                ]
            }, {"_id": 0, "id": 1})
            
            async for record in cursor:
                record_id = record.get("id")
                obj_stats["processed"] += 1
                
                # Find most recent activity linked to this record
                latest_activity = await self._find_latest_activity(tenant_id, record_id, obj_type)
                
                if latest_activity:
                    success = await self.update_last_activity_date(
                        tenant_id, record_id, obj_type, latest_activity
                    )
                    if success:
                        obj_stats["updated"] += 1
                        stats["updated"] += 1
                
                stats["processed"] += 1
            
            stats["by_object"][obj_type] = obj_stats
        
        return stats
    
    async def _find_latest_activity(
        self,
        tenant_id: str,
        record_id: str,
        object_type: str
    ) -> Optional[datetime]:
        """Find the most recent activity date for a record"""
        
        # Build query to find activities linked to this record
        query = {
            "tenant_id": tenant_id,
            "object_name": {"$in": list(ACTIVITY_TYPES)},
            "$or": [
                {"data.related_to_id": record_id},
                {"data.what_id": record_id},
                {"data.who_id": record_id},
                {f"data.{object_type}_id": record_id}
            ]
        }
        
        # Get most recent activity
        activity = await self.db.object_records.find_one(
            query,
            {"_id": 0, "created_at": 1, "data.activity_date": 1}
        ).sort("created_at", -1)
        
        if not activity:
            return None
        
        # Use activity_date if available, otherwise created_at
        activity_date = activity.get("data", {}).get("activity_date") or activity.get("created_at")
        
        if isinstance(activity_date, str):
            try:
                return datetime.fromisoformat(activity_date.replace('Z', '+00:00'))
            except:
                return None
        
        return activity_date


# Singleton instance getter
_service_instance = None

def get_activity_linking_service(db: AsyncIOMotorDatabase) -> ActivityLinkingService:
    """Get or create the ActivityLinkingService singleton"""
    global _service_instance
    if _service_instance is None:
        _service_instance = ActivityLinkingService(db)
    return _service_instance
