from enum import Enum
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field
from datetime import datetime

class JobStatus(str, Enum):
    DRAFT = "draft"
    VALIDATING = "validating"
    READY = "ready"
    RUNNING = "running"
    COMPLETED = "completed"
    COMPLETED_WITH_ERRORS = "completed_with_errors"
    FAILED = "failed"
    ROLLED_BACK = "rolled_back"

class ImportType(str, Enum):
    INSERT = "insert"
    UPDATE = "update"
    UPSERT = "upsert"

class MatchKeyConfig(BaseModel):
    """Configuration for matching records in Update/Upsert operations"""
    mode: str = "id"  # "id", "field", "composite"
    fields: List[str] = []  # ["Id"] or ["Email"] or ["Email", "Company"]
    
class DuplicateHandling(BaseModel):
    match_fields: List[str] = []
    action: str = "skip"  # skip, merge, flag

class FieldMapping(BaseModel):
    csv_column: str
    field_name: str
    field_type: Optional[str] = None

class MappingTemplate(BaseModel):
    id: str
    name: str
    object_name: str
    mappings: List[FieldMapping]
    created_by: str
    created_at: datetime
    tenant_id: str

class ImportJob(BaseModel):
    id: str
    tenant_id: str
    job_name: str
    object_name: str
    import_type: ImportType
    status: JobStatus = JobStatus.DRAFT
    
    # File references
    source_file_path: Optional[str] = None
    success_file_path: Optional[str] = None
    error_file_path: Optional[str] = None
    
    # Mapping
    mapping_template_id: Optional[str] = None
    field_mappings: List[FieldMapping] = []
    
    # Match configuration for Update/Upsert
    match_config: Optional[MatchKeyConfig] = None
    
    # Duplicate handling
    duplicate_handling: Optional[DuplicateHandling] = None
    
    # Statistics
    total_rows: int = 0
    processed_rows: int = 0
    success_count: int = 0
    error_count: int = 0
    
    # Timestamps
    created_by: str
    created_at: datetime
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    
    # Rollback data
    is_rollback_available: bool = False
    rollback_snapshot: Optional[Dict[str, Any]] = None
    rolled_back_at: Optional[datetime] = None
    rolled_back_by: Optional[str] = None
    rollback_reason: Optional[str] = None
    
    # Parent/child relationship for retry
    parent_job_id: Optional[str] = None
    
    # Email notification
    notify_on_completion: bool = False
    notification_email: Optional[str] = None

class ExportTemplate(BaseModel):
    id: str
    name: str
    object_name: str
    selected_fields: List[str]
    filters: List[Dict[str, Any]] = []
    output_format: str = "csv"  # csv, excel
    encoding: str = "utf-8"
    created_by: str
    created_at: datetime
    tenant_id: str
    
    # Scheduling
    is_scheduled: bool = False
    schedule_frequency: Optional[str] = None  # daily, weekly, monthly
    last_run_at: Optional[datetime] = None

class ExportJob(BaseModel):
    id: str
    tenant_id: str
    job_name: str
    object_name: str
    status: JobStatus = JobStatus.DRAFT
    
    # Configuration
    selected_fields: List[str]
    filters: List[Dict[str, Any]] = []
    output_format: str = "csv"
    encoding: str = "utf-8"
    
    # Template reference
    template_id: Optional[str] = None
    
    # Output
    output_file_path: Optional[str] = None
    output_filename: Optional[str] = None
    file_size_bytes: Optional[int] = None
    
    # Statistics
    total_records: int = 0
    
    # Error tracking
    error_message: Optional[str] = None
    
    # Timestamps
    created_by: str
    created_at: datetime
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    
    # Incremental export
    is_incremental: bool = False
    last_export_timestamp: Optional[datetime] = None

class ValidationResult(BaseModel):
    is_valid: bool
    total_rows: int
    valid_rows: int
    invalid_rows: int
    errors: List[Dict[str, Any]] = []
    warnings: List[Dict[str, Any]] = []
    validation_file_path: Optional[str] = None

class JobAuditLog(BaseModel):
    id: str
    job_id: str
    job_type: str  # import or export
    action: str  # created, started, completed, failed, rolled_back, retried
    performed_by: str
    performed_at: datetime
    details: Dict[str, Any] = {}
    tenant_id: str
