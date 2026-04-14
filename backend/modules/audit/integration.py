"""
Audit Integration Helper

Provides a simple interface for integrating audit logging with existing CRM modules.
This helper is designed to be called from record create/update/delete operations
without modifying the core logic.

Usage:
    from modules.audit.integration import audit_helper
    
    # In record update handler:
    await audit_helper.log_record_update(
        object_name="account",
        record_id=record_id,
        old_record=old_record,
        new_record=new_record,
        user_id=current_user.id,
        user_name=current_user.first_name,
        tenant_id=current_user.tenant_id
    )

Safety: All operations are non-blocking and wrapped in try/catch.
If audit logging fails, the caller continues normally.
"""

import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Dict, Any, Optional, List
from motor.motor_asyncio import AsyncIOMotorClient

from .services import AuditService
from .models import AuditContext, AuditChangeSource, AuditChangedByType

logger = logging.getLogger(__name__)


class AuditIntegrationHelper:
    """
    Helper class for integrating audit logging with CRM operations.
    
    This class provides a simple interface and handles all the complexity
    of audit context creation and service instantiation internally.
    """
    
    _db = None
    _service = None
    
    @classmethod
    def _get_db(cls):
        """Get database connection (lazy initialization)"""
        if cls._db is None:
            mongo_url = os.environ.get("MONGO_URL")
            db_name = os.environ.get("DB_NAME", "crm_platform")
            client = AsyncIOMotorClient(mongo_url)
            cls._db = client[db_name]
        return cls._db
    
    @classmethod
    def _get_service(cls) -> AuditService:
        """Get audit service instance (lazy initialization)"""
        if cls._service is None:
            cls._service = AuditService(cls._get_db())
        return cls._service
    
    @classmethod
    def _create_context(
        cls,
        user_id: Optional[str] = None,
        user_name: Optional[str] = None,
        source: AuditChangeSource = AuditChangeSource.API,
        source_name: Optional[str] = None,
        correlation_id: Optional[str] = None
    ) -> AuditContext:
        """Create an audit context from parameters"""
        return AuditContext(
            changed_by_type=AuditChangedByType.USER if user_id else AuditChangedByType.SYSTEM,
            changed_by_user_id=user_id,
            changed_by_user_name=user_name,
            change_source=source,
            source_name=source_name or f"CRM {source.value}",
            correlation_id=correlation_id or f"{source.value}-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:6]}"
        )
    
    @classmethod
    async def log_record_create(
        cls,
        object_name: str,
        record_id: str,
        record_data: Dict[str, Any],
        user_id: str,
        user_name: str,
        tenant_id: str,
        record_label: str = None,
        source: AuditChangeSource = AuditChangeSource.UI,
        source_name: str = None
    ) -> Optional[str]:
        """
        Log a record creation event.
        
        Args:
            object_name: Object API name (e.g., 'account', 'contact')
            record_id: ID of the created record
            record_data: The record data
            user_id: ID of the user who created the record
            user_name: Name of the user
            tenant_id: Tenant ID
            record_label: Optional display label for the record
            source: Source of the change (UI, API, etc.)
            source_name: Optional source name (e.g., "Account Record Page")
            
        Returns:
            Event ID if successful, None if failed
        """
        try:
            service = cls._get_service()
            context = cls._create_context(
                user_id=user_id,
                user_name=user_name,
                source=source,
                source_name=source_name
            )
            
            return await service.log_create(
                target_object=object_name,
                record_id=record_id,
                record_data=record_data,
                context=context,
                tenant_id=tenant_id,
                record_label=record_label
            )
        except Exception as e:
            logger.error(f"Audit log_record_create failed: {e}")
            return None
    
    @classmethod
    async def log_record_update(
        cls,
        object_name: str,
        record_id: str,
        old_record: Dict[str, Any],
        new_record: Dict[str, Any],
        user_id: str,
        user_name: str,
        tenant_id: str,
        record_label: str = None,
        source: AuditChangeSource = AuditChangeSource.UI,
        source_name: str = None
    ) -> Optional[str]:
        """
        Log a record update event.
        
        Args:
            object_name: Object API name
            record_id: ID of the updated record
            old_record: Record state before update
            new_record: Record state after update
            user_id: ID of the user who updated the record
            user_name: Name of the user
            tenant_id: Tenant ID
            record_label: Optional display label for the record
            source: Source of the change
            source_name: Optional source name
            
        Returns:
            Event ID if successful, None if failed or no changes
        """
        try:
            service = cls._get_service()
            context = cls._create_context(
                user_id=user_id,
                user_name=user_name,
                source=source,
                source_name=source_name
            )
            
            return await service.log_update(
                target_object=object_name,
                record_id=record_id,
                old_record=old_record,
                new_record=new_record,
                context=context,
                tenant_id=tenant_id,
                record_label=record_label
            )
        except Exception as e:
            logger.error(f"Audit log_record_update failed: {e}")
            return None
    
    @classmethod
    async def log_record_delete(
        cls,
        object_name: str,
        record_id: str,
        record_data: Dict[str, Any],
        user_id: str,
        user_name: str,
        tenant_id: str,
        record_label: str = None,
        source: AuditChangeSource = AuditChangeSource.UI,
        source_name: str = None
    ) -> Optional[str]:
        """
        Log a record deletion event.
        
        Args:
            object_name: Object API name
            record_id: ID of the deleted record
            record_data: The record data before deletion
            user_id: ID of the user who deleted the record
            user_name: Name of the user
            tenant_id: Tenant ID
            record_label: Optional display label for the record
            source: Source of the change
            source_name: Optional source name
            
        Returns:
            Event ID if successful, None if failed
        """
        try:
            service = cls._get_service()
            context = cls._create_context(
                user_id=user_id,
                user_name=user_name,
                source=source,
                source_name=source_name
            )
            
            return await service.log_delete(
                target_object=object_name,
                record_id=record_id,
                record_data=record_data,
                context=context,
                tenant_id=tenant_id,
                record_label=record_label
            )
        except Exception as e:
            logger.error(f"Audit log_record_delete failed: {e}")
            return None
    
    @classmethod
    async def log_bulk_update(
        cls,
        object_name: str,
        record_ids: List[str],
        changes: Dict[str, tuple],  # field_key -> (old, new)
        user_id: str,
        user_name: str,
        tenant_id: str,
        source: AuditChangeSource = AuditChangeSource.UI,
        source_name: str = None
    ) -> List[str]:
        """
        Log a bulk update event.
        
        Returns:
            List of event IDs created
        """
        try:
            service = cls._get_service()
            context = cls._create_context(
                user_id=user_id,
                user_name=user_name,
                source=source,
                source_name=source_name
            )
            
            return await service.log_bulk_update(
                target_object=object_name,
                record_ids=record_ids,
                changes=changes,
                context=context,
                tenant_id=tenant_id
            )
        except Exception as e:
            logger.error(f"Audit log_bulk_update failed: {e}")
            return []


# Singleton instance for easy import
audit_helper = AuditIntegrationHelper()
