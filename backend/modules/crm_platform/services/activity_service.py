from motor.motor_asyncio import AsyncIOMotorDatabase
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone
from uuid import uuid4
from ..models.activity_models import Activity, ActivityType, ActivityStatus, TimelineFilter

class ActivityService:
    """Service to manage activities and timeline"""
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.collection = db.crm_activities
    
    async def create_activity(self, activity_data: Dict[str, Any]) -> Dict[str, Any]:
        """Create a new activity"""
        activity = {
            "id": str(uuid4()),
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
            **activity_data
        }
        
        await self.collection.insert_one(activity)
        return activity
    
    async def get_activities(
        self,
        object_type: str,
        record_id: str,
        tenant_id: str,
        filters: Optional[TimelineFilter] = None,
        limit: int = 50,
        skip: int = 0
    ) -> List[Dict[str, Any]]:
        """Get activities for a record"""
        query = {
            "object_type": object_type,
            "record_id": record_id,
            "tenant_id": tenant_id
        }
        
        if filters:
            if filters.activity_types:
                query["type"] = {"$in": filters.activity_types}
            if filters.status:
                query["status"] = {"$in": filters.status}
            if filters.start_date or filters.end_date:
                query["activity_date"] = {}
                if filters.start_date:
                    query["activity_date"]["$gte"] = filters.start_date
                if filters.end_date:
                    query["activity_date"]["$lte"] = filters.end_date
            if filters.assigned_to:
                query["assigned_to"] = filters.assigned_to
        
        cursor = self.collection.find(query, {"_id": 0}).sort(
            "activity_date", -1
        ).skip(skip).limit(limit)
        
        return await cursor.to_list(length=limit)
    
    async def update_activity(self, activity_id: str, tenant_id: str, updates: Dict[str, Any]) -> bool:
        """Update an activity"""
        updates["updated_at"] = datetime.now(timezone.utc)
        
        result = await self.collection.update_one(
            {"id": activity_id, "tenant_id": tenant_id},
            {"$set": updates}
        )
        
        return result.modified_count > 0
    
    async def delete_activity(self, activity_id: str, tenant_id: str) -> bool:
        """Delete an activity"""
        result = await self.collection.delete_one({
            "id": activity_id,
            "tenant_id": tenant_id
        })
        
        return result.deleted_count > 0
    
    async def get_activity_summary(self, object_type: str, record_id: str, tenant_id: str) -> Dict[str, Any]:
        """Get activity summary for a record"""
        pipeline = [
            {
                "$match": {
                    "object_type": object_type,
                    "record_id": record_id,
                    "tenant_id": tenant_id
                }
            },
            {
                "$group": {
                    "_id": "$type",
                    "count": {"$sum": 1}
                }
            }
        ]
        
        cursor = self.collection.aggregate(pipeline)
        results = await cursor.to_list(length=100)
        
        summary = {item["_id"]: item["count"] for item in results}
        summary["total"] = sum(summary.values())
        
        return summary
