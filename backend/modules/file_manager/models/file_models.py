"""
File Manager - Core File Models
Handles File, FileVersion, FileRecordLink, FileTag
"""

from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum
import uuid


class StorageProvider(str, Enum):
    """Supported storage providers"""
    LOCAL = "local"
    S3 = "s3"
    GOOGLE_DRIVE = "google_drive"


class FileStatus(str, Enum):
    """File status states"""
    ACTIVE = "active"
    ARCHIVED = "archived"
    DELETED = "deleted"
    PROCESSING = "processing"


# ============================================================================
# FILE VERSION MODEL
# ============================================================================

class FileVersion(BaseModel):
    """Represents a single version of a file"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    file_id: str
    version_number: int
    storage_provider: StorageProvider = StorageProvider.S3
    storage_key: str  # Key/path in storage system
    storage_url: Optional[str] = None  # Direct URL if available
    size_bytes: int
    mime_type: str
    checksum: Optional[str] = None  # MD5 or SHA256
    is_current: bool = True
    uploaded_by: str
    uploaded_at: datetime = Field(default_factory=lambda: datetime.utcnow())
    metadata: Dict[str, Any] = Field(default_factory=dict)

    class Config:
        use_enum_values = True


class FileVersionResponse(BaseModel):
    """Response model for file version"""
    id: str
    file_id: str
    version_number: int
    storage_provider: str
    size_bytes: int
    mime_type: str
    is_current: bool
    uploaded_by: str
    uploaded_at: datetime
    download_url: Optional[str] = None


# ============================================================================
# FILE MODEL
# ============================================================================

class File(BaseModel):
    """Main file entity"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    name: str  # Display name
    original_filename: str  # Original uploaded filename
    description: Optional[str] = None
    
    # Current version info (denormalized for quick access)
    current_version_id: Optional[str] = None
    current_version_number: int = 1
    size_bytes: int = 0
    mime_type: str = "application/octet-stream"
    file_extension: Optional[str] = None
    
    # Organization
    folder_id: Optional[str] = None
    library_id: Optional[str] = None
    category_id: Optional[str] = None
    sensitivity_id: Optional[str] = None
    
    # Metadata
    tags: List[str] = Field(default_factory=list)  # Tag IDs
    custom_metadata: Dict[str, Any] = Field(default_factory=dict)
    
    # AI suggestions (stored for reference)
    ai_suggested_category: Optional[str] = None
    ai_suggested_tags: List[str] = Field(default_factory=list)
    ai_confidence_score: Optional[float] = None
    
    # Status and audit
    status: FileStatus = FileStatus.ACTIVE
    created_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.utcnow())
    updated_by: Optional[str] = None
    updated_at: Optional[datetime] = None
    deleted_at: Optional[datetime] = None
    deleted_by: Optional[str] = None
    
    # Sharing
    is_shared_internally: bool = False
    shared_with_users: List[str] = Field(default_factory=list)
    shared_with_roles: List[str] = Field(default_factory=list)
    
    class Config:
        use_enum_values = True


class FileCreate(BaseModel):
    """Create file request"""
    name: str
    original_filename: str
    description: Optional[str] = None
    folder_id: Optional[str] = None
    library_id: Optional[str] = None
    category_id: Optional[str] = None
    sensitivity_id: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    custom_metadata: Dict[str, Any] = Field(default_factory=dict)
    
    # Initial version info
    size_bytes: int
    mime_type: str
    storage_provider: StorageProvider = StorageProvider.S3
    storage_key: str


class FileUpdate(BaseModel):
    """Update file request"""
    name: Optional[str] = None
    description: Optional[str] = None
    folder_id: Optional[str] = None
    library_id: Optional[str] = None
    category_id: Optional[str] = None
    sensitivity_id: Optional[str] = None
    tags: Optional[List[str]] = None
    custom_metadata: Optional[Dict[str, Any]] = None
    is_shared_internally: Optional[bool] = None
    shared_with_users: Optional[List[str]] = None
    shared_with_roles: Optional[List[str]] = None


class FileResponse(BaseModel):
    """Response model for file"""
    id: str
    tenant_id: str
    name: str
    original_filename: str
    description: Optional[str]
    current_version_number: int
    size_bytes: int
    mime_type: str
    file_extension: Optional[str]
    folder_id: Optional[str]
    library_id: Optional[str]
    category_id: Optional[str]
    sensitivity_id: Optional[str]
    tags: List[str]
    status: str
    created_by: str
    created_at: datetime
    updated_at: Optional[datetime]
    is_shared_internally: bool
    download_url: Optional[str] = None
    
    # Expanded info (optional)
    category_name: Optional[str] = None
    folder_name: Optional[str] = None
    library_name: Optional[str] = None
    created_by_name: Optional[str] = None
    tag_names: List[str] = Field(default_factory=list)
    version_count: int = 1
    linked_records_count: int = 0


# ============================================================================
# FILE RECORD LINK MODEL
# ============================================================================

class FileRecordLink(BaseModel):
    """Links files to CRM records (many-to-many)"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    file_id: str
    record_id: str  # The CRM record ID
    object_name: str  # e.g., "lead", "account", "deal"
    is_primary: bool = False  # Primary file for this record
    linked_by: str
    linked_at: datetime = Field(default_factory=lambda: datetime.utcnow())
    notes: Optional[str] = None


class FileRecordLinkCreate(BaseModel):
    """Create file-record link"""
    file_id: str
    record_id: str
    object_name: str
    is_primary: bool = False
    notes: Optional[str] = None


# ============================================================================
# FILE TAG JUNCTION MODEL
# ============================================================================

class FileTag(BaseModel):
    """Junction table for file-tag many-to-many relationship"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    file_id: str
    tag_id: str
    added_by: str
    added_at: datetime = Field(default_factory=lambda: datetime.utcnow())
