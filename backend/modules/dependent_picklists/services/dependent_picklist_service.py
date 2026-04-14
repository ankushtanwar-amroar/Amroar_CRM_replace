"""
Dependent Picklist Service
Business logic for managing dependent picklist configurations
Updated: Dependencies are now GLOBAL (object-level), not per record type
"""
from motor.motor_asyncio import AsyncIOMotorDatabase
from typing import List, Dict, Optional, Any
from datetime import datetime
import logging

from ..models.dependent_picklist_model import (
    DependentPicklistConfig,
    DependentPicklistCreateRequest,
    DependentPicklistUpdateRequest
)

logger = logging.getLogger(__name__)


class DependentPicklistService:
    """Service for managing dependent picklist configurations - GLOBAL (object-level)"""
    
    COLLECTION_NAME = "dependent_picklist_configs"
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.collection = db[self.COLLECTION_NAME]
    
    async def create_config(
        self,
        tenant_id: str,
        object_name: str,
        request: DependentPicklistCreateRequest,
        created_by: str = None
    ) -> DependentPicklistConfig:
        """Create a new dependent picklist configuration (global for object)"""
        
        # Validate: controlling and dependent must be different
        if request.controlling_field_api == request.dependent_field_api:
            raise ValueError("Controlling and dependent fields must be different")
        
        # Check for duplicate config (same controlling + dependent for this object)
        existing = await self.collection.find_one({
            "tenant_id": tenant_id,
            "object_name": object_name,
            "controlling_field_api": request.controlling_field_api,
            "dependent_field_api": request.dependent_field_api
        })
        
        if existing:
            raise ValueError(
                f"Dependency already exists between {request.controlling_field_api} "
                f"and {request.dependent_field_api} for this object"
            )
        
        config = DependentPicklistConfig(
            tenant_id=tenant_id,
            object_name=object_name,
            controlling_field_api=request.controlling_field_api,
            controlling_field_label=request.controlling_field_label,
            dependent_field_api=request.dependent_field_api,
            dependent_field_label=request.dependent_field_label,
            mapping=request.mapping,
            created_by=created_by
        )
        
        await self.collection.insert_one(config.dict())
        logger.info(f"Created global dependent picklist config {config.id} for {object_name}")
        
        return config
    
    async def get_config(
        self,
        config_id: str,
        tenant_id: str
    ) -> Optional[DependentPicklistConfig]:
        """Get a specific dependent picklist configuration"""
        doc = await self.collection.find_one({
            "id": config_id,
            "tenant_id": tenant_id
        }, {"_id": 0})
        
        if doc:
            # Remove record_type_id if present (migration compatibility)
            doc.pop("record_type_id", None)
            return DependentPicklistConfig(**doc)
        return None
    
    async def get_configs_for_object(
        self,
        tenant_id: str,
        object_name: str,
        active_only: bool = True
    ) -> List[DependentPicklistConfig]:
        """Get all dependent picklist configs for an object (GLOBAL)"""
        query = {
            "tenant_id": tenant_id,
            "object_name": object_name
        }
        
        if active_only:
            query["is_active"] = True
        
        cursor = self.collection.find(query, {"_id": 0})
        docs = await cursor.to_list(length=500)
        
        # Remove record_type_id if present (migration compatibility)
        configs = []
        for doc in docs:
            doc.pop("record_type_id", None)
            configs.append(DependentPicklistConfig(**doc))
        
        return configs
    
    async def update_config(
        self,
        config_id: str,
        tenant_id: str,
        request: DependentPicklistUpdateRequest
    ) -> Optional[DependentPicklistConfig]:
        """Update a dependent picklist configuration"""
        
        update_data = {
            "updated_at": datetime.utcnow().isoformat()
        }
        
        if request.controlling_field_label is not None:
            update_data["controlling_field_label"] = request.controlling_field_label
        if request.dependent_field_label is not None:
            update_data["dependent_field_label"] = request.dependent_field_label
        if request.mapping is not None:
            update_data["mapping"] = request.mapping
        if request.is_active is not None:
            update_data["is_active"] = request.is_active
        
        result = await self.collection.find_one_and_update(
            {"id": config_id, "tenant_id": tenant_id},
            {"$set": update_data},
            return_document=True
        )
        
        if result:
            result.pop("_id", None)
            result.pop("record_type_id", None)  # Migration compatibility
            return DependentPicklistConfig(**result)
        return None
    
    async def delete_config(
        self,
        config_id: str,
        tenant_id: str
    ) -> bool:
        """Delete a dependent picklist configuration"""
        result = await self.collection.delete_one({
            "id": config_id,
            "tenant_id": tenant_id
        })
        return result.deleted_count > 0
    
    async def get_dependency_for_field(
        self,
        tenant_id: str,
        object_name: str,
        dependent_field_api: str
    ) -> Optional[DependentPicklistConfig]:
        """Get the dependency config for a specific dependent field (global)"""
        doc = await self.collection.find_one({
            "tenant_id": tenant_id,
            "object_name": object_name,
            "dependent_field_api": dependent_field_api,
            "is_active": True
        }, {"_id": 0})
        
        if doc:
            doc.pop("record_type_id", None)  # Migration compatibility
            return DependentPicklistConfig(**doc)
        return None
    
    async def get_filtered_dependent_values(
        self,
        tenant_id: str,
        object_name: str,
        controlling_field_api: str,
        controlling_value: str,
        dependent_field_api: str
    ) -> Dict[str, Any]:
        """
        Get filtered dependent values based on controlling field value (global).
        Used at runtime when user selects a controlling value.
        """
        config = await self.collection.find_one({
            "tenant_id": tenant_id,
            "object_name": object_name,
            "controlling_field_api": controlling_field_api,
            "dependent_field_api": dependent_field_api,
            "is_active": True
        }, {"_id": 0})
        
        if not config:
            return {
                "has_dependency": False,
                "controlling_field_api": controlling_field_api,
                "controlling_value": controlling_value,
                "dependent_field_api": dependent_field_api,
                "allowed_values": []
            }
        
        mapping = config.get("mapping", {})
        allowed_values = mapping.get(controlling_value, [])
        
        return {
            "has_dependency": True,
            "controlling_field_api": controlling_field_api,
            "controlling_value": controlling_value,
            "dependent_field_api": dependent_field_api,
            "allowed_values": allowed_values
        }
    
    async def get_all_dependencies_for_object(
        self,
        tenant_id: str,
        object_name: str
    ) -> Dict[str, Dict]:
        """
        Get all dependencies for an object in a format suitable for runtime use.
        Returns a dict keyed by dependent_field_api with full config.
        This is GLOBAL - applies to all records regardless of record type.
        """
        configs = await self.get_configs_for_object(
            tenant_id, object_name, active_only=True
        )
        
        result = {}
        for config in configs:
            result[config.dependent_field_api] = {
                "controlling_field_api": config.controlling_field_api,
                "mapping": config.mapping
            }
        
        return result
    
    async def validate_dependent_value(
        self,
        tenant_id: str,
        object_name: str,
        controlling_field_api: str,
        controlling_value: str,
        dependent_field_api: str,
        dependent_value: str
    ) -> bool:
        """
        Validate if a dependent value is allowed for the given controlling value (global).
        Returns True if valid or no dependency exists.
        """
        config = await self.collection.find_one({
            "tenant_id": tenant_id,
            "object_name": object_name,
            "controlling_field_api": controlling_field_api,
            "dependent_field_api": dependent_field_api,
            "is_active": True
        }, {"_id": 0})
        
        if not config:
            return True  # No dependency, any value is valid
        
        mapping = config.get("mapping", {})
        allowed_values = mapping.get(controlling_value, [])
        
        # If controlling value has no mapping, allow all values
        if controlling_value not in mapping:
            return True
        
        return dependent_value in allowed_values

    # ============================================
    # Migration / Backward Compatibility
    # ============================================
    
    async def migrate_record_type_configs_to_global(
        self,
        tenant_id: str,
        object_name: str
    ) -> Dict[str, Any]:
        """
        Migration helper: Merge record-type-based configs into global configs.
        For each unique controlling/dependent pair, takes the first config found.
        """
        # Find all configs with record_type_id for this object
        cursor = self.collection.find({
            "tenant_id": tenant_id,
            "object_name": object_name,
            "record_type_id": {"$exists": True, "$ne": None}
        }, {"_id": 0})
        docs = await cursor.to_list(length=500)
        
        if not docs:
            return {"migrated": 0, "message": "No record-type-based configs found"}
        
        # Group by controlling/dependent pair
        pair_configs = {}
        for doc in docs:
            pair_key = f"{doc['controlling_field_api']}|{doc['dependent_field_api']}"
            if pair_key not in pair_configs:
                pair_configs[pair_key] = doc
        
        # Remove record_type_id from merged configs
        migrated = 0
        for pair_key, config in pair_configs.items():
            config_id = config.get("id")
            
            # Update this config to remove record_type_id (make it global)
            await self.collection.update_one(
                {"id": config_id, "tenant_id": tenant_id},
                {"$unset": {"record_type_id": ""}}
            )
            migrated += 1
        
        # Delete duplicate configs (those with record_type_id that weren't selected)
        deleted = await self.collection.delete_many({
            "tenant_id": tenant_id,
            "object_name": object_name,
            "record_type_id": {"$exists": True, "$ne": None}
        })
        
        return {
            "migrated": migrated,
            "duplicates_removed": deleted.deleted_count,
            "message": f"Migrated {migrated} configs to global, removed {deleted.deleted_count} duplicates"
        }
