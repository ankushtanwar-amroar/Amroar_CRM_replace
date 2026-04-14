"""
Audit Cleanup Service

Handles retention policy enforcement by cleaning up old audit logs.
Runs as a scheduled job to delete audit events older than the configured retention period.
"""

import logging
from datetime import datetime, timezone, timedelta
from typing import Dict, Any
from motor.motor_asyncio import AsyncIOMotorDatabase

logger = logging.getLogger(__name__)


class AuditCleanupService:
    """
    Service for cleaning up old audit logs based on retention policies.
    
    This service should be run periodically (e.g., daily via a scheduled job)
    to delete audit records that exceed the retention period.
    """
    
    EVENTS_COLLECTION = "audit_events"
    FIELD_CHANGES_COLLECTION = "audit_field_changes"
    CONFIG_COLLECTION = "audit_config"
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
    
    async def run_cleanup(self) -> Dict[str, Any]:
        """
        Run the cleanup job for all tenants.
        
        Returns:
            Summary of cleanup results
        """
        logger.info("Starting audit cleanup job")
        
        results = {
            "started_at": datetime.now(timezone.utc).isoformat(),
            "tenants_processed": 0,
            "events_deleted": 0,
            "field_changes_deleted": 0,
            "errors": []
        }
        
        try:
            # Get all unique tenant_ids with audit configs
            tenant_ids = await self.db[self.CONFIG_COLLECTION].distinct("tenant_id")
            
            for tenant_id in tenant_ids:
                try:
                    tenant_result = await self._cleanup_tenant(tenant_id)
                    results["tenants_processed"] += 1
                    results["events_deleted"] += tenant_result.get("events_deleted", 0)
                    results["field_changes_deleted"] += tenant_result.get("field_changes_deleted", 0)
                except Exception as e:
                    error_msg = f"Cleanup failed for tenant {tenant_id}: {str(e)}"
                    logger.error(error_msg)
                    results["errors"].append(error_msg)
            
            results["completed_at"] = datetime.now(timezone.utc).isoformat()
            logger.info(f"Audit cleanup completed: {results['events_deleted']} events deleted")
            
        except Exception as e:
            logger.error(f"Audit cleanup job failed: {e}")
            results["errors"].append(str(e))
        
        return results
    
    async def _cleanup_tenant(self, tenant_id: str) -> Dict[str, int]:
        """
        Clean up audit logs for a specific tenant based on their retention policies.
        """
        result = {
            "events_deleted": 0,
            "field_changes_deleted": 0
        }
        
        # Get all configs for this tenant
        configs_cursor = self.db[self.CONFIG_COLLECTION].find(
            {"tenant_id": tenant_id},
            {"target_object": 1, "retention_days": 1}
        )
        
        async for config in configs_cursor:
            target_object = config["target_object"]
            retention_days = config.get("retention_days", 365)
            
            # Calculate cutoff date
            cutoff_date = datetime.now(timezone.utc) - timedelta(days=retention_days)
            
            # Find events to delete
            events_to_delete = []
            events_cursor = self.db[self.EVENTS_COLLECTION].find(
                {
                    "tenant_id": tenant_id,
                    "target_object": target_object,
                    "occurred_at": {"$lt": cutoff_date}
                },
                {"id": 1}
            )
            
            async for event in events_cursor:
                events_to_delete.append(event["id"])
            
            if events_to_delete:
                # Delete field changes first (foreign key reference)
                field_delete_result = await self.db[self.FIELD_CHANGES_COLLECTION].delete_many(
                    {"audit_event_id": {"$in": events_to_delete}}
                )
                result["field_changes_deleted"] += field_delete_result.deleted_count
                
                # Delete events
                event_delete_result = await self.db[self.EVENTS_COLLECTION].delete_many(
                    {"id": {"$in": events_to_delete}}
                )
                result["events_deleted"] += event_delete_result.deleted_count
                
                logger.info(
                    f"Cleaned up {event_delete_result.deleted_count} events for "
                    f"{target_object} in tenant {tenant_id}"
                )
        
        return result
    
    async def cleanup_object(
        self, 
        target_object: str, 
        tenant_id: str,
        retention_days: int = None
    ) -> Dict[str, int]:
        """
        Clean up audit logs for a specific object.
        
        Args:
            target_object: Object API name
            tenant_id: Tenant ID
            retention_days: Override retention days (uses config if not provided)
            
        Returns:
            Cleanup results
        """
        result = {
            "events_deleted": 0,
            "field_changes_deleted": 0
        }
        
        try:
            # Get retention days from config if not provided
            if retention_days is None:
                config = await self.db[self.CONFIG_COLLECTION].find_one(
                    {"target_object": target_object, "tenant_id": tenant_id}
                )
                retention_days = config.get("retention_days", 365) if config else 365
            
            # Calculate cutoff date
            cutoff_date = datetime.now(timezone.utc) - timedelta(days=retention_days)
            
            # Find events to delete
            events_to_delete = []
            events_cursor = self.db[self.EVENTS_COLLECTION].find(
                {
                    "tenant_id": tenant_id,
                    "target_object": target_object,
                    "occurred_at": {"$lt": cutoff_date}
                },
                {"id": 1}
            )
            
            async for event in events_cursor:
                events_to_delete.append(event["id"])
            
            if events_to_delete:
                # Delete field changes
                field_result = await self.db[self.FIELD_CHANGES_COLLECTION].delete_many(
                    {"audit_event_id": {"$in": events_to_delete}}
                )
                result["field_changes_deleted"] = field_result.deleted_count
                
                # Delete events
                event_result = await self.db[self.EVENTS_COLLECTION].delete_many(
                    {"id": {"$in": events_to_delete}}
                )
                result["events_deleted"] = event_result.deleted_count
            
            logger.info(
                f"Cleaned up {result['events_deleted']} events for {target_object}"
            )
            
        except Exception as e:
            logger.error(f"Cleanup failed for {target_object}: {e}")
        
        return result
    
    async def get_storage_stats(self, tenant_id: str) -> Dict[str, Any]:
        """
        Get storage statistics for audit logs.
        
        Returns:
            Statistics including event count, field change count, oldest event, etc.
        """
        try:
            # Count events
            event_count = await self.db[self.EVENTS_COLLECTION].count_documents(
                {"tenant_id": tenant_id}
            )
            
            # Count field changes for this tenant's events
            event_ids = await self.db[self.EVENTS_COLLECTION].distinct(
                "id", {"tenant_id": tenant_id}
            )
            field_change_count = await self.db[self.FIELD_CHANGES_COLLECTION].count_documents(
                {"audit_event_id": {"$in": event_ids}}
            )
            
            # Get oldest event
            oldest_event = await self.db[self.EVENTS_COLLECTION].find_one(
                {"tenant_id": tenant_id},
                sort=[("occurred_at", 1)]
            )
            
            # Get newest event
            newest_event = await self.db[self.EVENTS_COLLECTION].find_one(
                {"tenant_id": tenant_id},
                sort=[("occurred_at", -1)]
            )
            
            # Get counts by object
            pipeline = [
                {"$match": {"tenant_id": tenant_id}},
                {"$group": {"_id": "$target_object", "count": {"$sum": 1}}},
                {"$sort": {"count": -1}}
            ]
            object_counts = []
            async for doc in self.db[self.EVENTS_COLLECTION].aggregate(pipeline):
                object_counts.append({"object": doc["_id"], "count": doc["count"]})
            
            return {
                "total_events": event_count,
                "total_field_changes": field_change_count,
                "oldest_event": self._safe_datetime_to_iso(oldest_event.get("occurred_at")) if oldest_event else None,
                "newest_event": self._safe_datetime_to_iso(newest_event.get("occurred_at")) if newest_event else None,
                "events_by_object": object_counts
            }
            
        except Exception as e:
            logger.error(f"Failed to get storage stats: {e}")
            return {
                "total_events": 0,
                "total_field_changes": 0,
                "error": str(e)
            }
    
    def _safe_datetime_to_iso(self, value) -> str:
        """Safely convert datetime or string to ISO format string"""
        if value is None:
            return None
        if isinstance(value, datetime):
            return value.isoformat()
        if isinstance(value, str):
            return value  # Already a string
        return str(value)
