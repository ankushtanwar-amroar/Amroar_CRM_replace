"""
Rollup Trigger Handler - Handles automatic rollup recalculation on child record changes
"""
from motor.motor_asyncio import AsyncIOMotorDatabase
from typing import Optional, Dict, Any, List, Set
import asyncio
import logging

from .rollup_service import RollupFieldService
from ..models.rollup_field import RollupFieldConfig
from ..models.base import FieldType

logger = logging.getLogger(__name__)


class RollupTriggerHandler:
    """
    Handles automatic rollup recalculation when child records are created, updated, or deleted.
    Supports LOOKUP relationships (not only master-detail).
    """
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.rollup_service = RollupFieldService(db)
        self._rollup_cache: Dict[str, List[RollupFieldConfig]] = {}  # tenant_id:child_object -> rollups
        self._cache_ttl = 300  # 5 minutes
        self._cache_timestamps: Dict[str, float] = {}
    
    async def _get_rollups_for_child_object(
        self,
        child_object: str,
        tenant_id: str
    ) -> List[RollupFieldConfig]:
        """Get all active rollup fields that reference this child object (with caching)"""
        import time
        
        cache_key = f"{tenant_id}:{child_object}"
        current_time = time.time()
        
        # Check cache
        if cache_key in self._rollup_cache:
            if current_time - self._cache_timestamps.get(cache_key, 0) < self._cache_ttl:
                return self._rollup_cache[cache_key]
        
        # Query database
        cursor = self.db.advanced_fields.find({
            "tenant_id": tenant_id,
            "field_type": FieldType.ROLLUP.value,
            "child_object": child_object,
            "is_active": True
        }, {"_id": 0})
        
        fields = await cursor.to_list(length=100)
        rollups = [RollupFieldConfig(**f) for f in fields]
        
        # Update cache
        self._rollup_cache[cache_key] = rollups
        self._cache_timestamps[cache_key] = current_time
        
        return rollups
    
    def invalidate_cache(self, tenant_id: str = None, child_object: str = None):
        """Invalidate rollup cache"""
        if tenant_id and child_object:
            cache_key = f"{tenant_id}:{child_object}"
            self._rollup_cache.pop(cache_key, None)
            self._cache_timestamps.pop(cache_key, None)
        elif tenant_id:
            # Invalidate all caches for this tenant
            keys_to_remove = [k for k in self._rollup_cache if k.startswith(f"{tenant_id}:")]
            for key in keys_to_remove:
                self._rollup_cache.pop(key, None)
                self._cache_timestamps.pop(key, None)
        else:
            # Invalidate all
            self._rollup_cache.clear()
            self._cache_timestamps.clear()
    
    async def on_record_create(
        self,
        object_name: str,
        record: Dict[str, Any],
        tenant_id: str
    ):
        """
        Handle record creation - trigger rollup recalculation for affected parent records.
        
        Args:
            object_name: The object type of the created record (e.g., 'opportunity')
            record: The full record data including 'data' field
            tenant_id: The tenant ID
        """
        try:
            rollups = await self._get_rollups_for_child_object(object_name, tenant_id)
            
            if not rollups:
                return  # No rollups reference this child object
            
            record_data = record.get("data", {})
            
            for rollup in rollups:
                relationship_field = rollup.relationship_field
                parent_id = record_data.get(relationship_field)
                
                if parent_id:
                    logger.info(f"Triggering rollup recalc for {rollup.api_key} on parent {parent_id} (child created)")
                    
                    if rollup.recalculation_mode == "async":
                        asyncio.create_task(
                            self._safe_update_parent_rollup(rollup, parent_id)
                        )
                    else:
                        await self._safe_update_parent_rollup(rollup, parent_id)
        
        except Exception as e:
            logger.error(f"Error in on_record_create rollup trigger: {str(e)}")
    
    async def on_record_update(
        self,
        object_name: str,
        old_record: Dict[str, Any],
        new_record: Dict[str, Any],
        tenant_id: str
    ):
        """
        Handle record update - trigger rollup recalculation for affected parent records.
        If the relationship field changed, recalculate both old and new parent.
        
        Args:
            object_name: The object type of the updated record
            old_record: The record data before update
            new_record: The record data after update  
            tenant_id: The tenant ID
        """
        try:
            rollups = await self._get_rollups_for_child_object(object_name, tenant_id)
            
            if not rollups:
                return
            
            old_data = old_record.get("data", {})
            new_data = new_record.get("data", {})
            
            for rollup in rollups:
                relationship_field = rollup.relationship_field
                old_parent_id = old_data.get(relationship_field)
                new_parent_id = new_data.get(relationship_field)
                
                # Collect unique parent IDs that need recalculation
                parent_ids_to_update: Set[str] = set()
                
                if old_parent_id:
                    parent_ids_to_update.add(old_parent_id)
                if new_parent_id:
                    parent_ids_to_update.add(new_parent_id)
                
                # Also check if any field used in rollup filter or summarize changed
                fields_to_check = set()
                if rollup.summarize_field:
                    fields_to_check.add(rollup.summarize_field)
                if rollup.filter_config and rollup.filter_config.is_enabled:
                    for rule in rollup.filter_config.rules:
                        fields_to_check.add(rule.field)
                
                # If relevant fields changed, ensure parent is recalculated
                for field in fields_to_check:
                    if old_data.get(field) != new_data.get(field):
                        if new_parent_id:
                            parent_ids_to_update.add(new_parent_id)
                        break
                
                # Recalculate for all affected parents
                for parent_id in parent_ids_to_update:
                    logger.info(f"Triggering rollup recalc for {rollup.api_key} on parent {parent_id} (child updated)")
                    
                    if rollup.recalculation_mode == "async":
                        asyncio.create_task(
                            self._safe_update_parent_rollup(rollup, parent_id)
                        )
                    else:
                        await self._safe_update_parent_rollup(rollup, parent_id)
        
        except Exception as e:
            logger.error(f"Error in on_record_update rollup trigger: {str(e)}")
    
    async def on_record_delete(
        self,
        object_name: str,
        record: Dict[str, Any],
        tenant_id: str
    ):
        """
        Handle record deletion - trigger rollup recalculation for affected parent records.
        
        Args:
            object_name: The object type of the deleted record
            record: The record data that was deleted
            tenant_id: The tenant ID
        """
        try:
            rollups = await self._get_rollups_for_child_object(object_name, tenant_id)
            
            if not rollups:
                return
            
            record_data = record.get("data", {})
            
            for rollup in rollups:
                relationship_field = rollup.relationship_field
                parent_id = record_data.get(relationship_field)
                
                if parent_id:
                    logger.info(f"Triggering rollup recalc for {rollup.api_key} on parent {parent_id} (child deleted)")
                    
                    if rollup.recalculation_mode == "async":
                        asyncio.create_task(
                            self._safe_update_parent_rollup(rollup, parent_id)
                        )
                    else:
                        await self._safe_update_parent_rollup(rollup, parent_id)
        
        except Exception as e:
            logger.error(f"Error in on_record_delete rollup trigger: {str(e)}")
    
    async def _safe_update_parent_rollup(
        self,
        rollup: RollupFieldConfig,
        parent_id: str
    ):
        """Safely update parent rollup with error handling"""
        try:
            await self.rollup_service.update_parent_rollup(rollup, parent_id)
        except Exception as e:
            logger.error(f"Error updating rollup {rollup.api_key} for parent {parent_id}: {str(e)}")


# Global instance for easy access
_trigger_handler: Optional[RollupTriggerHandler] = None


def get_rollup_trigger_handler(db: AsyncIOMotorDatabase) -> RollupTriggerHandler:
    """Get or create the global rollup trigger handler instance"""
    global _trigger_handler
    if _trigger_handler is None:
        _trigger_handler = RollupTriggerHandler(db)
    return _trigger_handler
