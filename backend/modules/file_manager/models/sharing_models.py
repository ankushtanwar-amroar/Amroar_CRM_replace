"""
File Manager - Sharing and Audit Models
"""

from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum
import uuid
import secrets


class AuditEventType(str, Enum):
    """Types of audit events to track"""
    FILE_UPLOADED = "file_uploaded"
    FILE_DOWNLOADED = "file_downloaded"
    FILE_VIEWED = "file_viewed"
    FILE_UPDATED = "file_updated"
    FILE_DELETED = "file_deleted"
    FILE_RESTORED = "file_restored"
    FILE_SHARED = "file_shared"
    VERSION_CREATED = "version_created"
    FILE_LINKED = "file_linked"
    FILE_UNLINKED = "file_unlinked"
    METADATA_UPDATED = "metadata_updated"
    PUBLIC_LINK_CREATED = "public_link_created"
    PUBLIC_LINK_ACCESSED = "public_link_accessed"
    PUBLIC_LINK_REVOKED = "public_link_revoked"
    FOLDER_CREATED = "folder_created"
    FOLDER_DELETED = "folder_deleted"
    LIBRARY_CREATED = "library_created"
    MEMBER_ADDED = "member_added"
    MEMBER_REMOVED = "member_removed"
    PERMISSION_CHANGED = "permission_changed"


class PublicLinkStatus(str, Enum):
    """Public link status"""
    ACTIVE = "active"
    EXPIRED = "expired"
    REVOKED = "revoked"


# ============================================================================
# PUBLIC LINK MODEL
# ============================================================================

class PublicLink(BaseModel):
    """Public shareable link for files"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    file_id: str
    
    # Link details
    link_token: str = Field(default_factory=lambda: secrets.token_urlsafe(32))
    link_url: Optional[str] = None  # Full URL (constructed on response)
    
    # Settings
    password_hash: Optional[str] = None  # Hashed password if protected
    is_password_protected: bool = False
    allow_download: bool = True
    
    # Expiry
    expires_at: Optional[datetime] = None
    max_access_count: Optional[int] = None  # Limit number of accesses
    
    # Stats
    access_count: int = 0
    last_accessed_at: Optional[datetime] = None
    last_accessed_by_ip: Optional[str] = None
    
    status: PublicLinkStatus = PublicLinkStatus.ACTIVE
    
    created_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.utcnow())
    revoked_at: Optional[datetime] = None
    revoked_by: Optional[str] = None

    class Config:
        use_enum_values = True


class PublicLinkCreate(BaseModel):
    """Create public link request"""
    file_id: str
    password: Optional[str] = None  # Plain password, will be hashed
    allow_download: bool = True
    expires_at: Optional[datetime] = None
    max_access_count: Optional[int] = None


class PublicLinkUpdate(BaseModel):
    """Update public link request"""
    password: Optional[str] = None
    allow_download: Optional[bool] = None
    expires_at: Optional[datetime] = None
    max_access_count: Optional[int] = None


class PublicLinkResponse(BaseModel):
    """Public link response"""
    id: str
    file_id: str
    file_name: Optional[str] = None
    link_url: str
    is_password_protected: bool
    allow_download: bool
    expires_at: Optional[datetime]
    max_access_count: Optional[int]
    access_count: int
    last_accessed_at: Optional[datetime]
    status: str
    created_by: str
    created_at: datetime


class PublicLinkAccessRequest(BaseModel):
    """Request to access a public link"""
    password: Optional[str] = None


# ============================================================================
# AUDIT EVENT MODEL
# ============================================================================

class AuditEvent(BaseModel):
    """Audit log entry for file operations"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    
    # Event info
    event_type: AuditEventType
    event_description: str
    
    # Subject
    file_id: Optional[str] = None
    file_name: Optional[str] = None
    folder_id: Optional[str] = None
    library_id: Optional[str] = None
    public_link_id: Optional[str] = None
    
    # Actor
    user_id: Optional[str] = None  # Null for anonymous (public link access)
    user_name: Optional[str] = None
    user_email: Optional[str] = None
    
    # Context
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    record_id: Optional[str] = None  # If linked to a CRM record
    object_name: Optional[str] = None
    
    # Additional details
    details: Dict[str, Any] = Field(default_factory=dict)
    
    # Metadata
    created_at: datetime = Field(default_factory=lambda: datetime.utcnow())

    class Config:
        use_enum_values = True


class AuditEventCreate(BaseModel):
    """Create audit event"""
    event_type: AuditEventType
    event_description: str
    file_id: Optional[str] = None
    file_name: Optional[str] = None
    folder_id: Optional[str] = None
    library_id: Optional[str] = None
    public_link_id: Optional[str] = None
    record_id: Optional[str] = None
    object_name: Optional[str] = None
    details: Dict[str, Any] = Field(default_factory=dict)


class AuditEventResponse(BaseModel):
    """Audit event response"""
    id: str
    event_type: str
    event_description: str
    file_id: Optional[str]
    file_name: Optional[str]
    user_id: Optional[str]
    user_name: Optional[str]
    ip_address: Optional[str]
    details: Dict[str, Any]
    created_at: datetime


class AuditLogFilter(BaseModel):
    """Filter for audit log queries"""
    event_types: Optional[List[AuditEventType]] = None
    file_id: Optional[str] = None
    user_id: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    limit: int = 50
    offset: int = 0
