"""
Audit Configuration Service

Manages per-object audit trail configurations including:
- Tracking policies (all fields vs selected fields)
- Retention policies
- Enabled sources and operations
"""

import logging
import uuid
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from motor.motor_asyncio import AsyncIOMotorDatabase

from ..models import AuditConfigCreate, AuditConfigResponse, AuditTrackingMode

logger = logging.getLogger(__name__)


class AuditConfigService:
    """Service for managing audit configurations"""
    
    CONFIG_COLLECTION = "audit_config"
    
    # Default configuration for new objects
    DEFAULT_CONFIG = {
        "tracking_mode": AuditTrackingMode.ALL_FIELDS.value,
        "tracked_fields": [],
        "noise_fields": [],
        "retention_days": 365,
        "enabled_sources": ["UI", "API", "FLOW", "IMPORT", "INTEGRATION"],
        "log_create": True,
        "log_update": True,
        "log_delete": True,
        "log_merge": True,
        "log_import": True,
        "is_enabled": True
    }
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
    
    async def ensure_indexes(self):
        """Create indexes for config collection"""
        try:
            collection = self.db[self.CONFIG_COLLECTION]
            await collection.create_index([("target_object", 1), ("tenant_id", 1)], unique=True)
        except Exception as e:
            logger.error(f"Failed to create audit config indexes: {e}")
    
    async def get_config(
        self, 
        target_object: str, 
        tenant_id: str,
        create_default: bool = False
    ) -> Optional[AuditConfigResponse]:
        """
        Get audit configuration for an object.
        
        Args:
            target_object: Object API name
            tenant_id: Tenant ID
            create_default: If True, create default config if not exists
            
        Returns:
            Configuration or None if not found
        """
        try:
            await self.ensure_indexes()
            
            doc = await self.db[self.CONFIG_COLLECTION].find_one(
                {"target_object": target_object, "tenant_id": tenant_id},
                {"_id": 0}
            )
            
            if doc:
                return AuditConfigResponse(**doc)
            
            # Create default config if requested
            if create_default:
                return await self.create_config(
                    AuditConfigCreate(target_object=target_object),
                    tenant_id
                )
            
            return None
            
        except Exception as e:
            logger.error(f"Failed to get audit config for {target_object}: {e}")
            return None
    
    async def create_config(
        self, 
        data: AuditConfigCreate, 
        tenant_id: str
    ) -> AuditConfigResponse:
        """
        Create audit configuration for an object.
        """
        try:
            await self.ensure_indexes()
            
            now = datetime.now(timezone.utc)
            config_id = str(uuid.uuid4())
            
            doc = {
                "id": config_id,
                "tenant_id": tenant_id,
                "target_object": data.target_object,
                "tracking_mode": data.tracking_mode.value,
                "tracked_fields": data.tracked_fields or [],
                "noise_fields": data.noise_fields or [],
                "retention_days": data.retention_days,
                "enabled_sources": data.enabled_sources or self.DEFAULT_CONFIG["enabled_sources"],
                "log_create": data.log_create,
                "log_update": data.log_update,
                "log_delete": data.log_delete,
                "log_merge": data.log_merge,
                "log_import": data.log_import,
                "is_enabled": data.is_enabled,
                "created_at": now,
                "updated_at": now
            }
            
            await self.db[self.CONFIG_COLLECTION].insert_one(doc)
            
            logger.info(f"Audit config created for {data.target_object}")
            return AuditConfigResponse(**{k: v for k, v in doc.items() if k != '_id'})
            
        except Exception as e:
            logger.error(f"Failed to create audit config for {data.target_object}: {e}")
            raise
    
    async def update_config(
        self, 
        target_object: str, 
        data: AuditConfigCreate, 
        tenant_id: str
    ) -> Optional[AuditConfigResponse]:
        """
        Update audit configuration for an object.
        """
        try:
            await self.ensure_indexes()
            
            now = datetime.now(timezone.utc)
            
            update_doc = {
                "tracking_mode": data.tracking_mode.value,
                "tracked_fields": data.tracked_fields or [],
                "noise_fields": data.noise_fields or [],
                "retention_days": data.retention_days,
                "enabled_sources": data.enabled_sources or [],
                "log_create": data.log_create,
                "log_update": data.log_update,
                "log_delete": data.log_delete,
                "log_merge": data.log_merge,
                "log_import": data.log_import,
                "is_enabled": data.is_enabled,
                "updated_at": now
            }
            
            result = await self.db[self.CONFIG_COLLECTION].find_one_and_update(
                {"target_object": target_object, "tenant_id": tenant_id},
                {"$set": update_doc},
                return_document=True
            )
            
            if result:
                logger.info(f"Audit config updated for {target_object}")
                return AuditConfigResponse(**{k: v for k, v in result.items() if k != '_id'})
            
            # Config doesn't exist, create it
            return await self.create_config(data, tenant_id)
            
        except Exception as e:
            logger.error(f"Failed to update audit config for {target_object}: {e}")
            return None
    
    async def delete_config(self, target_object: str, tenant_id: str) -> bool:
        """Delete audit configuration for an object."""
        try:
            result = await self.db[self.CONFIG_COLLECTION].delete_one(
                {"target_object": target_object, "tenant_id": tenant_id}
            )
            return result.deleted_count > 0
        except Exception as e:
            logger.error(f"Failed to delete audit config for {target_object}: {e}")
            return False
    
    async def list_configs(self, tenant_id: str) -> List[AuditConfigResponse]:
        """List all audit configurations for a tenant."""
        try:
            configs = []
            cursor = self.db[self.CONFIG_COLLECTION].find(
                {"tenant_id": tenant_id},
                {"_id": 0}
            )
            async for doc in cursor:
                configs.append(AuditConfigResponse(**doc))
            return configs
        except Exception as e:
            logger.error(f"Failed to list audit configs: {e}")
            return []
    
    async def enable_audit(self, target_object: str, tenant_id: str) -> bool:
        """Enable audit for an object."""
        try:
            result = await self.db[self.CONFIG_COLLECTION].update_one(
                {"target_object": target_object, "tenant_id": tenant_id},
                {"$set": {"is_enabled": True, "updated_at": datetime.now(timezone.utc)}}
            )
            return result.modified_count > 0
        except Exception as e:
            logger.error(f"Failed to enable audit for {target_object}: {e}")
            return False
    
    async def disable_audit(self, target_object: str, tenant_id: str) -> bool:
        """Disable audit for an object."""
        try:
            result = await self.db[self.CONFIG_COLLECTION].update_one(
                {"target_object": target_object, "tenant_id": tenant_id},
                {"$set": {"is_enabled": False, "updated_at": datetime.now(timezone.utc)}}
            )
            return result.modified_count > 0
        except Exception as e:
            logger.error(f"Failed to disable audit for {target_object}: {e}")
            return False
    
    async def get_available_sources(self) -> List[Dict[str, Any]]:
        """Get list of available audit sources."""
        return [
            {"id": "UI", "name": "User Interface", "description": "Changes made via the web UI", "icon": "Monitor", "color": "blue"},
            {"id": "API", "name": "API", "description": "Changes made via REST API", "icon": "Code", "color": "green"},
            {"id": "FLOW", "name": "Flow", "description": "Changes made by automated flows", "icon": "Zap", "color": "purple"},
            {"id": "IMPORT", "name": "Import", "description": "Changes from data imports", "icon": "Upload", "color": "orange"},
            {"id": "INTEGRATION", "name": "Integration", "description": "Changes from external integrations", "icon": "Link", "color": "teal"},
            {"id": "MERGE_ENGINE", "name": "Merge Engine", "description": "Changes from record merges", "icon": "GitMerge", "color": "pink"},
            {"id": "SYSTEM", "name": "System", "description": "Automated system changes", "icon": "Settings", "color": "gray"},
            {"id": "SCHEDULED_JOB", "name": "Scheduled Job", "description": "Changes from scheduled jobs", "icon": "Clock", "color": "indigo"}
        ]
    
    async def get_available_operations(self) -> List[Dict[str, Any]]:
        """Get list of available audit operations."""
        return [
            {"id": "CREATE", "name": "Create", "description": "Record creation", "color": "green"},
            {"id": "UPDATE", "name": "Update", "description": "Record update", "color": "blue"},
            {"id": "DELETE", "name": "Delete", "description": "Record deletion", "color": "red"},
            {"id": "MERGE", "name": "Merge", "description": "Record merge", "color": "purple"},
            {"id": "BULK_UPDATE", "name": "Bulk Update", "description": "Mass record update", "color": "orange"},
            {"id": "BULK_DELETE", "name": "Bulk Delete", "description": "Mass record deletion", "color": "pink"},
            {"id": "RESTORE", "name": "Restore", "description": "Record restoration", "color": "teal"}
        ]
