"""
Audit Trail Models

Database models for the audit trail system:
- AuditEvent: Main event record (one per operation)
- AuditFieldChange: Field-level changes for an event
- AuditConfig: Per-object configuration settings
"""

from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum


# ============================================================================
# ENUMS
# ============================================================================

class AuditOperation(str, Enum):
    """Types of operations that can be audited"""
    CREATE = "CREATE"
    UPDATE = "UPDATE"
    DELETE = "DELETE"
    MERGE = "MERGE"
    UPSERT = "UPSERT"
    BULK_UPDATE = "BULK_UPDATE"
    BULK_DELETE = "BULK_DELETE"
    RESTORE = "RESTORE"


class AuditChangeSource(str, Enum):
    """Source of the change"""
    UI = "UI"
    API = "API"
    FLOW = "FLOW"
    IMPORT = "IMPORT"
    INTEGRATION = "INTEGRATION"
    MERGE_ENGINE = "MERGE_ENGINE"
    SYSTEM = "SYSTEM"
    SCHEDULED_JOB = "SCHEDULED_JOB"


class AuditChangedByType(str, Enum):
    """Type of entity that made the change"""
    USER = "USER"
    SYSTEM = "SYSTEM"
    INTEGRATION = "INTEGRATION"
    FLOW = "FLOW"


class AuditTrackingMode(str, Enum):
    """Tracking policy mode"""
    ALL_FIELDS = "ALL_FIELDS"
    SELECTED_FIELDS = "SELECTED_FIELDS"


# ============================================================================
# AUDIT EVENT MODELS
# ============================================================================

class AuditEventCreate(BaseModel):
    """Model for creating an audit event"""
    # Target record
    target_object: str = Field(..., description="Object API name (e.g., 'account', 'contact')")
    target_record_id: str = Field(..., description="ID of the record being audited")
    target_record_label: Optional[str] = Field(None, description="Display label of the record")
    
    # Operation
    operation: AuditOperation = Field(..., description="Type of operation")
    change_count: int = Field(0, description="Number of fields changed")
    
    # Who changed it
    changed_by_type: AuditChangedByType = Field(AuditChangedByType.USER)
    changed_by_user_id: Optional[str] = None
    changed_by_user_name: Optional[str] = None
    changed_by_display: Optional[str] = None
    
    # Source information
    change_source: AuditChangeSource = Field(AuditChangeSource.UI)
    source_name: Optional[str] = Field(None, description="Name of the source (e.g., 'Account Record Page')")
    source_reference_id: Optional[str] = Field(None, description="Reference ID from source (e.g., flow run ID)")
    source_client_id: Optional[str] = Field(None, description="Client/integration ID")
    source_channel: Optional[str] = Field(None, description="Channel identifier")
    
    # Tracking
    correlation_id: Optional[str] = Field(None, description="Correlation ID for tracking related events")
    request_id: Optional[str] = Field(None, description="HTTP request ID")
    parent_event_id: Optional[str] = Field(None, description="Parent event ID for nested operations")
    
    # Reason
    reason_code: Optional[str] = None
    reason_notes: Optional[str] = None
    
    # Timestamps
    occurred_at: Optional[datetime] = None


class AuditEventResponse(BaseModel):
    """Response model for an audit event"""
    id: str
    target_object: str
    target_record_id: str
    target_record_label: Optional[str] = None
    
    operation: str
    change_count: int
    
    changed_by_type: str
    changed_by_user_id: Optional[str] = None
    changed_by_user_name: Optional[str] = None
    changed_by_display: Optional[str] = None
    
    change_source: str
    source_name: Optional[str] = None
    source_reference_id: Optional[str] = None
    source_client_id: Optional[str] = None
    source_channel: Optional[str] = None
    
    correlation_id: Optional[str] = None
    request_id: Optional[str] = None
    parent_event_id: Optional[str] = None
    
    reason_code: Optional[str] = None
    reason_notes: Optional[str] = None
    
    occurred_at: datetime
    created_at: datetime
    
    # Field changes (populated when fetching single event or expanded)
    field_changes: Optional[List['AuditFieldChangeResponse']] = None
    
    # Summary for display
    summary: Optional[str] = None


# ============================================================================
# AUDIT FIELD CHANGE MODELS
# ============================================================================

class AuditFieldChangeCreate(BaseModel):
    """Model for creating a field change record"""
    audit_event_id: str
    field_key: str = Field(..., description="Field API name")
    field_label: Optional[str] = Field(None, description="Field display label")
    data_type: Optional[str] = Field(None, description="Field data type (text, number, date, etc.)")
    
    # Values
    old_value: Optional[Any] = None
    new_value: Optional[Any] = None
    old_display: Optional[str] = Field(None, description="Human-readable old value")
    new_display: Optional[str] = Field(None, description="Human-readable new value")
    
    # Flags
    is_significant: bool = Field(True, description="Whether this is a significant change")


class AuditFieldChangeResponse(BaseModel):
    """Response model for a field change"""
    id: str
    audit_event_id: str
    field_key: str
    field_label: Optional[str] = None
    data_type: Optional[str] = None
    
    old_value: Optional[Any] = None
    new_value: Optional[Any] = None
    old_display: Optional[str] = None
    new_display: Optional[str] = None
    
    is_significant: bool = True


# ============================================================================
# AUDIT CONFIG MODELS
# ============================================================================

class AuditConfigCreate(BaseModel):
    """Model for creating/updating audit configuration"""
    target_object: str = Field(..., description="Object API name")
    
    # Tracking settings
    tracking_mode: AuditTrackingMode = Field(AuditTrackingMode.ALL_FIELDS)
    tracked_fields: Optional[List[str]] = Field(default_factory=list, description="Fields to track when mode is SELECTED_FIELDS")
    noise_fields: Optional[List[str]] = Field(default_factory=list, description="Fields to always ignore")
    
    # Retention
    retention_days: int = Field(365, ge=1, le=3650, description="Days to keep audit logs")
    
    # Sources enabled
    enabled_sources: Optional[List[str]] = Field(
        default_factory=lambda: ["UI", "API", "FLOW", "IMPORT", "INTEGRATION"],
        description="Sources to record"
    )
    
    # Operation toggles
    log_create: bool = Field(True, description="Log CREATE operations")
    log_update: bool = Field(True, description="Log UPDATE operations")
    log_delete: bool = Field(True, description="Log DELETE operations")
    log_merge: bool = Field(True, description="Log MERGE operations")
    log_import: bool = Field(True, description="Log IMPORT operations")
    
    # Status
    is_enabled: bool = Field(True, description="Whether audit is enabled for this object")


class AuditConfigResponse(BaseModel):
    """Response model for audit configuration"""
    id: str
    target_object: str
    
    tracking_mode: str
    tracked_fields: List[str] = []
    noise_fields: List[str] = []
    
    retention_days: int
    enabled_sources: List[str] = []
    
    log_create: bool
    log_update: bool
    log_delete: bool
    log_merge: bool
    log_import: bool
    
    is_enabled: bool
    
    created_at: datetime
    updated_at: datetime


# ============================================================================
# QUERY MODELS
# ============================================================================

class AuditEventQuery(BaseModel):
    """Query parameters for fetching audit events"""
    target_object: Optional[str] = None
    target_record_id: Optional[str] = None
    operation: Optional[str] = None
    change_source: Optional[str] = None
    changed_by_user_id: Optional[str] = None
    correlation_id: Optional[str] = None
    field_search: Optional[str] = Field(None, description="Search for changes to specific field")
    
    # Date range
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    
    # Pagination
    page: int = Field(1, ge=1)
    page_size: int = Field(50, ge=1, le=200)
    
    # Sorting
    sort_by: str = Field("occurred_at", description="Field to sort by")
    sort_order: str = Field("desc", description="Sort order (asc/desc)")
    
    # Include field changes in response
    include_field_changes: bool = Field(False)


class AuditEventListResponse(BaseModel):
    """Paginated list response for audit events"""
    events: List[AuditEventResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


# ============================================================================
# AUDIT CONTEXT MODEL
# ============================================================================

class AuditContext(BaseModel):
    """Context passed with each auditable operation"""
    # Who
    changed_by_type: AuditChangedByType = AuditChangedByType.USER
    changed_by_user_id: Optional[str] = None
    changed_by_user_name: Optional[str] = None
    
    # Source
    change_source: AuditChangeSource = AuditChangeSource.UI
    source_name: Optional[str] = None
    source_reference_id: Optional[str] = None
    source_client_id: Optional[str] = None
    
    # Tracking
    correlation_id: Optional[str] = None
    request_id: Optional[str] = None
    
    # Reason
    reason_code: Optional[str] = None
    reason_notes: Optional[str] = None
    
    @classmethod
    def from_user(cls, user_id: str, user_name: str, source: AuditChangeSource = AuditChangeSource.UI, 
                  source_name: str = None, correlation_id: str = None):
        """Create context from user information"""
        return cls(
            changed_by_type=AuditChangedByType.USER,
            changed_by_user_id=user_id,
            changed_by_user_name=user_name,
            change_source=source,
            source_name=source_name,
            correlation_id=correlation_id
        )
    
    @classmethod
    def system(cls, source_name: str = "System", correlation_id: str = None):
        """Create context for system operations"""
        return cls(
            changed_by_type=AuditChangedByType.SYSTEM,
            change_source=AuditChangeSource.SYSTEM,
            source_name=source_name,
            correlation_id=correlation_id
        )


# ============================================================================
# SOURCE INFO MODEL
# ============================================================================

class AuditSourceInfo(BaseModel):
    """Information about an audit source"""
    id: str
    name: str
    description: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None
