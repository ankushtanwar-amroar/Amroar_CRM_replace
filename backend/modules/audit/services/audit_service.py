"""
Audit Service

Core service for logging audit events. This service is designed to:
1. Be completely isolated from existing CRM logic
2. Never block record saves (all operations are wrapped in try/catch)
3. Support all CRM objects (standard and custom)
4. Track field-level changes with old/new values

Safety: All methods in this service catch exceptions internally and log errors
rather than propagating them. This ensures audit failures never break CRM operations.
"""

import logging
import uuid
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List, Tuple
from motor.motor_asyncio import AsyncIOMotorDatabase
import traceback

from ..models import (
    AuditEventCreate, AuditEventResponse, AuditFieldChangeCreate, AuditFieldChangeResponse,
    AuditEventQuery, AuditEventListResponse, AuditContext, AuditOperation, 
    AuditChangeSource, AuditChangedByType
)

logger = logging.getLogger(__name__)


class AuditService:
    """
    Core audit logging service.
    
    All methods are designed to be non-blocking and safe:
    - Exceptions are caught and logged
    - Failures never propagate to callers
    - Operations run asynchronously where possible
    """
    
    # Collections
    EVENTS_COLLECTION = "audit_events"
    FIELD_CHANGES_COLLECTION = "audit_field_changes"
    CONFIG_COLLECTION = "audit_config"
    
    # Fields to always ignore (system fields)
    SYSTEM_NOISE_FIELDS = {
        '_id', 'id', 'created_at', 'updated_at', 'created_by', 'updated_by',
        'tenant_id', '__v', '_class'
    }
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self._ensure_indexes_created = False
    
    async def ensure_indexes(self):
        """Create indexes for efficient querying"""
        if self._ensure_indexes_created:
            return
        
        try:
            # Audit events indexes
            events = self.db[self.EVENTS_COLLECTION]
            await events.create_index([("target_object", 1), ("target_record_id", 1), ("occurred_at", -1)])
            await events.create_index([("occurred_at", -1)])
            await events.create_index([("correlation_id", 1)])
            await events.create_index([("changed_by_user_id", 1)])
            await events.create_index([("change_source", 1)])
            await events.create_index([("operation", 1)])
            await events.create_index([("tenant_id", 1), ("occurred_at", -1)])
            
            # Field changes indexes
            changes = self.db[self.FIELD_CHANGES_COLLECTION]
            await changes.create_index([("audit_event_id", 1)])
            await changes.create_index([("field_key", 1)])
            
            self._ensure_indexes_created = True
            logger.info("Audit indexes created successfully")
        except Exception as e:
            logger.error(f"Failed to create audit indexes: {e}")
    
    # =========================================================================
    # MAIN LOGGING METHODS
    # =========================================================================
    
    async def log_create(
        self,
        target_object: str,
        record_id: str,
        record_data: Dict[str, Any],
        context: AuditContext,
        tenant_id: str,
        record_label: str = None
    ) -> Optional[str]:
        """
        Log a CREATE operation.
        
        Args:
            target_object: Object API name (e.g., 'account')
            record_id: ID of the created record
            record_data: The created record data
            context: Audit context (who, source, etc.)
            tenant_id: Tenant ID
            record_label: Display label for the record
            
        Returns:
            Event ID if successful, None if failed
        """
        try:
            # Check if audit is enabled for this object
            config = await self._get_config(target_object, tenant_id)
            if not config or not config.get('is_enabled') or not config.get('log_create'):
                return None
            
            # Check if source is enabled
            if not self._is_source_enabled(context.change_source, config):
                return None
            
            # Get trackable fields
            fields_to_track = self._get_trackable_fields(record_data, config)
            
            # Create field changes for initial values
            field_changes = []
            for field_key, new_value in fields_to_track.items():
                if new_value is not None:
                    field_changes.append({
                        'field_key': field_key,
                        'field_label': self._to_display_label(field_key),
                        'old_value': None,
                        'new_value': new_value,
                        'old_display': None,
                        'new_display': self._to_display_value(new_value),
                        'is_significant': True
                    })
            
            # Create event
            event_id = await self._create_event(
                target_object=target_object,
                record_id=record_id,
                record_label=record_label or self._get_record_label(record_data),
                operation=AuditOperation.CREATE,
                field_changes=field_changes,
                context=context,
                tenant_id=tenant_id
            )
            
            return event_id
            
        except Exception as e:
            logger.error(f"Audit log_create failed for {target_object}/{record_id}: {e}\n{traceback.format_exc()}")
            return None
    
    async def log_update(
        self,
        target_object: str,
        record_id: str,
        old_record: Dict[str, Any],
        new_record: Dict[str, Any],
        context: AuditContext,
        tenant_id: str,
        record_label: str = None
    ) -> Optional[str]:
        """
        Log an UPDATE operation.
        
        Args:
            target_object: Object API name
            record_id: ID of the updated record
            old_record: Record state before update
            new_record: Record state after update
            context: Audit context
            tenant_id: Tenant ID
            record_label: Display label for the record
            
        Returns:
            Event ID if successful, None if failed or no changes
        """
        try:
            # Check if audit is enabled
            config = await self._get_config(target_object, tenant_id)
            if not config or not config.get('is_enabled') or not config.get('log_update'):
                return None
            
            # Check if source is enabled
            if not self._is_source_enabled(context.change_source, config):
                return None
            
            # Calculate field changes
            field_changes = self._calculate_changes(old_record, new_record, config)
            
            # No changes to log
            if not field_changes:
                return None
            
            # Create event
            event_id = await self._create_event(
                target_object=target_object,
                record_id=record_id,
                record_label=record_label or self._get_record_label(new_record),
                operation=AuditOperation.UPDATE,
                field_changes=field_changes,
                context=context,
                tenant_id=tenant_id
            )
            
            return event_id
            
        except Exception as e:
            logger.error(f"Audit log_update failed for {target_object}/{record_id}: {e}\n{traceback.format_exc()}")
            return None
    
    async def log_delete(
        self,
        target_object: str,
        record_id: str,
        record_data: Dict[str, Any],
        context: AuditContext,
        tenant_id: str,
        record_label: str = None
    ) -> Optional[str]:
        """
        Log a DELETE operation.
        
        Returns:
            Event ID if successful, None if failed
        """
        try:
            # Check if audit is enabled
            config = await self._get_config(target_object, tenant_id)
            if not config or not config.get('is_enabled') or not config.get('log_delete'):
                return None
            
            # Check if source is enabled
            if not self._is_source_enabled(context.change_source, config):
                return None
            
            # Create event (no field changes for delete)
            event_id = await self._create_event(
                target_object=target_object,
                record_id=record_id,
                record_label=record_label or self._get_record_label(record_data),
                operation=AuditOperation.DELETE,
                field_changes=[],
                context=context,
                tenant_id=tenant_id
            )
            
            return event_id
            
        except Exception as e:
            logger.error(f"Audit log_delete failed for {target_object}/{record_id}: {e}\n{traceback.format_exc()}")
            return None
    
    async def log_merge(
        self,
        target_object: str,
        master_record_id: str,
        merged_record_ids: List[str],
        field_changes: List[Dict[str, Any]],
        context: AuditContext,
        tenant_id: str,
        record_label: str = None
    ) -> Optional[str]:
        """
        Log a MERGE operation.
        
        Returns:
            Event ID if successful, None if failed
        """
        try:
            # Check if audit is enabled
            config = await self._get_config(target_object, tenant_id)
            if not config or not config.get('is_enabled') or not config.get('log_merge'):
                return None
            
            # Add merge metadata to context
            context.reason_notes = f"Merged records: {', '.join(merged_record_ids)}"
            
            # Create event
            event_id = await self._create_event(
                target_object=target_object,
                record_id=master_record_id,
                record_label=record_label,
                operation=AuditOperation.MERGE,
                field_changes=field_changes,
                context=context,
                tenant_id=tenant_id
            )
            
            return event_id
            
        except Exception as e:
            logger.error(f"Audit log_merge failed for {target_object}/{master_record_id}: {e}\n{traceback.format_exc()}")
            return None
    
    async def log_bulk_update(
        self,
        target_object: str,
        record_ids: List[str],
        changes: Dict[str, Tuple[Any, Any]],  # field_key -> (old, new)
        context: AuditContext,
        tenant_id: str
    ) -> List[str]:
        """
        Log a BULK_UPDATE operation.
        Creates one event per record affected.
        
        Returns:
            List of event IDs created
        """
        event_ids = []
        
        try:
            # Check if audit is enabled
            config = await self._get_config(target_object, tenant_id)
            if not config or not config.get('is_enabled') or not config.get('log_update'):
                return event_ids
            
            # Create field changes list
            field_changes = []
            for field_key, (old_val, new_val) in changes.items():
                field_changes.append({
                    'field_key': field_key,
                    'field_label': self._to_display_label(field_key),
                    'old_value': old_val,
                    'new_value': new_val,
                    'old_display': self._to_display_value(old_val),
                    'new_display': self._to_display_value(new_val),
                    'is_significant': True
                })
            
            # Create event for each record
            for record_id in record_ids:
                event_id = await self._create_event(
                    target_object=target_object,
                    record_id=record_id,
                    record_label=None,
                    operation=AuditOperation.BULK_UPDATE,
                    field_changes=field_changes,
                    context=context,
                    tenant_id=tenant_id
                )
                if event_id:
                    event_ids.append(event_id)
            
            return event_ids
            
        except Exception as e:
            logger.error(f"Audit log_bulk_update failed for {target_object}: {e}\n{traceback.format_exc()}")
            return event_ids
    
    # =========================================================================
    # QUERY METHODS
    # =========================================================================
    
    async def get_events(
        self,
        query: AuditEventQuery,
        tenant_id: str
    ) -> AuditEventListResponse:
        """
        Query audit events with filtering and pagination.
        """
        try:
            await self.ensure_indexes()
            
            # Build query filter
            filter_query = {"tenant_id": tenant_id}
            
            if query.target_object:
                filter_query["target_object"] = query.target_object
            if query.target_record_id:
                filter_query["target_record_id"] = query.target_record_id
            if query.operation:
                filter_query["operation"] = query.operation
            if query.change_source:
                filter_query["change_source"] = query.change_source
            if query.changed_by_user_id:
                filter_query["changed_by_user_id"] = query.changed_by_user_id
            if query.correlation_id:
                filter_query["correlation_id"] = query.correlation_id
            
            # Date range
            if query.start_date or query.end_date:
                date_filter = {}
                if query.start_date:
                    date_filter["$gte"] = query.start_date
                if query.end_date:
                    date_filter["$lte"] = query.end_date
                filter_query["occurred_at"] = date_filter
            
            # Field search - requires join with field_changes collection
            if query.field_search:
                # Get event IDs that have matching field changes
                field_change_events = await self.db[self.FIELD_CHANGES_COLLECTION].distinct(
                    "audit_event_id",
                    {"field_key": {"$regex": query.field_search, "$options": "i"}}
                )
                if field_change_events:
                    filter_query["id"] = {"$in": field_change_events}
                else:
                    # No matching field changes
                    return AuditEventListResponse(
                        events=[], total=0, page=query.page, 
                        page_size=query.page_size, total_pages=0
                    )
            
            # Get total count
            total = await self.db[self.EVENTS_COLLECTION].count_documents(filter_query)
            
            # Calculate pagination
            skip = (query.page - 1) * query.page_size
            total_pages = (total + query.page_size - 1) // query.page_size
            
            # Sort direction
            sort_dir = -1 if query.sort_order == "desc" else 1
            
            # Fetch events
            cursor = self.db[self.EVENTS_COLLECTION].find(
                filter_query,
                {"_id": 0}
            ).sort(query.sort_by, sort_dir).skip(skip).limit(query.page_size)
            
            events = []
            async for doc in cursor:
                event = AuditEventResponse(**doc)
                
                # Generate summary
                event.summary = await self._generate_summary(doc["id"])
                
                # Include field changes if requested
                if query.include_field_changes:
                    event.field_changes = await self._get_field_changes(doc["id"])
                
                events.append(event)
            
            return AuditEventListResponse(
                events=events,
                total=total,
                page=query.page,
                page_size=query.page_size,
                total_pages=total_pages
            )
            
        except Exception as e:
            logger.error(f"Audit get_events failed: {e}\n{traceback.format_exc()}")
            return AuditEventListResponse(
                events=[], total=0, page=query.page,
                page_size=query.page_size, total_pages=0
            )
    
    async def get_event(self, event_id: str, tenant_id: str) -> Optional[AuditEventResponse]:
        """Get a single audit event with its field changes"""
        try:
            doc = await self.db[self.EVENTS_COLLECTION].find_one(
                {"id": event_id, "tenant_id": tenant_id},
                {"_id": 0}
            )
            
            if not doc:
                return None
            
            event = AuditEventResponse(**doc)
            event.field_changes = await self._get_field_changes(event_id)
            event.summary = await self._generate_summary(event_id)
            
            return event
            
        except Exception as e:
            logger.error(f"Audit get_event failed for {event_id}: {e}")
            return None
    
    async def get_record_history(
        self,
        target_object: str,
        record_id: str,
        tenant_id: str,
        limit: int = 50
    ) -> List[AuditEventResponse]:
        """Get audit history for a specific record"""
        query = AuditEventQuery(
            target_object=target_object,
            target_record_id=record_id,
            page_size=limit,
            include_field_changes=True
        )
        result = await self.get_events(query, tenant_id)
        return result.events
    
    # =========================================================================
    # INTERNAL HELPER METHODS
    # =========================================================================
    
    async def _create_event(
        self,
        target_object: str,
        record_id: str,
        record_label: Optional[str],
        operation: AuditOperation,
        field_changes: List[Dict[str, Any]],
        context: AuditContext,
        tenant_id: str
    ) -> str:
        """Create an audit event with its field changes"""
        await self.ensure_indexes()
        
        event_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc)
        
        # Create event document
        event_doc = {
            "id": event_id,
            "tenant_id": tenant_id,
            "target_object": target_object,
            "target_record_id": record_id,
            "target_record_label": record_label,
            "operation": operation.value,
            "change_count": len(field_changes),
            "changed_by_type": context.changed_by_type.value,
            "changed_by_user_id": context.changed_by_user_id,
            "changed_by_user_name": context.changed_by_user_name,
            "changed_by_display": context.changed_by_user_name or context.changed_by_type.value,
            "change_source": context.change_source.value,
            "source_name": context.source_name,
            "source_reference_id": context.source_reference_id,
            "source_client_id": context.source_client_id,
            "correlation_id": context.correlation_id,
            "request_id": context.request_id,
            "reason_code": context.reason_code,
            "reason_notes": context.reason_notes,
            "occurred_at": context.changed_by_user_id and now or now,  # Use current time
            "created_at": now
        }
        
        # Insert event
        await self.db[self.EVENTS_COLLECTION].insert_one(event_doc)
        
        # Insert field changes
        if field_changes:
            change_docs = []
            for change in field_changes:
                change_doc = {
                    "id": str(uuid.uuid4()),
                    "audit_event_id": event_id,
                    "field_key": change.get("field_key"),
                    "field_label": change.get("field_label"),
                    "data_type": change.get("data_type"),
                    "old_value": self._serialize_value(change.get("old_value")),
                    "new_value": self._serialize_value(change.get("new_value")),
                    "old_display": change.get("old_display"),
                    "new_display": change.get("new_display"),
                    "is_significant": change.get("is_significant", True)
                }
                change_docs.append(change_doc)
            
            await self.db[self.FIELD_CHANGES_COLLECTION].insert_many(change_docs)
        
        logger.info(f"Audit event created: {operation.value} on {target_object}/{record_id} ({len(field_changes)} changes)")
        return event_id
    
    async def _get_config(self, target_object: str, tenant_id: str) -> Optional[Dict[str, Any]]:
        """Get audit configuration for an object"""
        try:
            config = await self.db[self.CONFIG_COLLECTION].find_one(
                {"target_object": target_object, "tenant_id": tenant_id},
                {"_id": 0}
            )
            return config
        except Exception as e:
            logger.error(f"Failed to get audit config for {target_object}: {e}")
            return None
    
    async def _get_field_changes(self, event_id: str) -> List[AuditFieldChangeResponse]:
        """Get field changes for an event"""
        try:
            changes = []
            cursor = self.db[self.FIELD_CHANGES_COLLECTION].find(
                {"audit_event_id": event_id},
                {"_id": 0}
            )
            async for doc in cursor:
                changes.append(AuditFieldChangeResponse(**doc))
            return changes
        except Exception as e:
            logger.error(f"Failed to get field changes for event {event_id}: {e}")
            return []
    
    async def _generate_summary(self, event_id: str) -> str:
        """Generate a human-readable summary of changes"""
        try:
            changes = await self._get_field_changes(event_id)
            if not changes:
                return "No field changes"
            
            # Take first significant change
            first_change = changes[0]
            summary = f"{first_change.field_label or first_change.field_key}: {first_change.old_display or 'empty'} → {first_change.new_display or 'empty'}"
            
            if len(changes) > 1:
                summary += f" (+{len(changes) - 1} more)"
            
            return summary
        except Exception as e:
            logger.error(f"Failed to generate summary for event {event_id}: {e}")
            return "Changes recorded"
    
    def _is_source_enabled(self, source: AuditChangeSource, config: Dict[str, Any]) -> bool:
        """Check if a source is enabled in config"""
        enabled_sources = config.get('enabled_sources', [])
        if not enabled_sources:
            return True  # If no sources specified, allow all
        return source.value in enabled_sources
    
    def _get_trackable_fields(self, record: Dict[str, Any], config: Dict[str, Any]) -> Dict[str, Any]:
        """Get fields that should be tracked based on config"""
        tracking_mode = config.get('tracking_mode', 'ALL_FIELDS')
        tracked_fields = set(config.get('tracked_fields', []))
        noise_fields = set(config.get('noise_fields', []))
        
        result = {}
        for key, value in record.items():
            # Skip system fields
            if key in self.SYSTEM_NOISE_FIELDS:
                continue
            
            # Skip noise fields
            if key in noise_fields:
                continue
            
            # For selected fields mode, only include tracked fields
            if tracking_mode == 'SELECTED_FIELDS' and key not in tracked_fields:
                continue
            
            result[key] = value
        
        return result
    
    def _calculate_changes(
        self, 
        old_record: Dict[str, Any], 
        new_record: Dict[str, Any],
        config: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """Calculate field-level changes between old and new record"""
        changes = []
        
        # Get trackable fields from both records
        old_fields = self._get_trackable_fields(old_record, config)
        new_fields = self._get_trackable_fields(new_record, config)
        
        # All keys that might have changed
        all_keys = set(old_fields.keys()) | set(new_fields.keys())
        
        for key in all_keys:
            old_val = old_fields.get(key)
            new_val = new_fields.get(key)
            
            # Check if values are different
            if not self._values_equal(old_val, new_val):
                changes.append({
                    'field_key': key,
                    'field_label': self._to_display_label(key),
                    'old_value': old_val,
                    'new_value': new_val,
                    'old_display': self._to_display_value(old_val),
                    'new_display': self._to_display_value(new_val),
                    'is_significant': True
                })
        
        return changes
    
    def _values_equal(self, val1: Any, val2: Any) -> bool:
        """Compare two values for equality (handles None, empty strings, etc.)"""
        # Normalize None and empty strings
        if val1 is None or val1 == '':
            val1 = None
        if val2 is None or val2 == '':
            val2 = None
        
        # Compare
        if val1 == val2:
            return True
        
        # Handle dict comparison
        if isinstance(val1, dict) and isinstance(val2, dict):
            return val1 == val2
        
        # Handle list comparison
        if isinstance(val1, list) and isinstance(val2, list):
            return val1 == val2
        
        return False
    
    def _to_display_label(self, field_key: str) -> str:
        """Convert field key to display label"""
        # Convert snake_case to Title Case
        return field_key.replace('_', ' ').title()
    
    def _to_display_value(self, value: Any) -> str:
        """Convert value to display string"""
        if value is None:
            return None
        if isinstance(value, bool):
            return "Yes" if value else "No"
        if isinstance(value, (list, dict)):
            return str(value)
        if isinstance(value, datetime):
            return value.strftime("%Y-%m-%d %H:%M:%S")
        return str(value)
    
    def _serialize_value(self, value: Any) -> Any:
        """Serialize value for storage"""
        if isinstance(value, datetime):
            return value.isoformat()
        return value
    
    def _get_record_label(self, record: Dict[str, Any]) -> Optional[str]:
        """Extract a display label from record"""
        # Try common label fields
        for field in ['name', 'title', 'subject', 'email', 'first_name', 'company']:
            if field in record and record[field]:
                return str(record[field])
        return None
