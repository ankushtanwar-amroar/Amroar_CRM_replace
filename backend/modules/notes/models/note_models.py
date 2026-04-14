"""
Notes Module - Data Models

Enterprise-grade Notes system following Salesforce Enhanced Notes pattern.
Supports:
- Rich text notes with HTML body
- Polymorphic linking to any CRM record
- Public sharing with expiration
- Full ownership and audit tracking
"""
from datetime import datetime, timezone
from typing import Optional, List
from enum import Enum
from pydantic import BaseModel, Field
import uuid


class ShareType(str, Enum):
    """Access level for linked record"""
    VIEWER = "viewer"
    COLLABORATOR = "collaborator"


class Visibility(str, Enum):
    """Note visibility scope"""
    INTERNAL_USERS = "internal_users"
    ALL_USERS = "all_users"
    SHARED_USERS = "shared_users"


# =============================================================================
# Note - Main Rich Text Record
# =============================================================================

class NoteBase(BaseModel):
    """Base fields for Note"""
    title: str = Field(..., min_length=1, max_length=255, description="Note title (required)")
    body_rich_text: Optional[str] = Field(None, description="HTML content of the note")
    body_plain_text: Optional[str] = Field(None, description="Plain text for search indexing")
    is_pinned: bool = Field(default=False, description="Pin note to top of list")
    is_archived: bool = Field(default=False, description="Archive note (hide from default view)")


class NoteCreate(NoteBase):
    """Create a new note"""
    # owner_id will be set to current user if not provided
    owner_id: Optional[str] = None
    # Optional: link to a record on creation
    linked_entity_type: Optional[str] = None
    linked_entity_id: Optional[str] = None


class NoteUpdate(BaseModel):
    """Update an existing note"""
    title: Optional[str] = Field(None, min_length=1, max_length=255)
    body_rich_text: Optional[str] = None
    body_plain_text: Optional[str] = None
    is_pinned: Optional[bool] = None
    is_archived: Optional[bool] = None


class Note(NoteBase):
    """Full Note model with all fields"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    preview_text: Optional[str] = Field(None, description="Auto-generated preview from body")
    owner_id: str = Field(..., description="User who owns this note")
    is_deleted: bool = Field(default=False, description="Soft delete flag")
    
    # Audit fields
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    created_by: str = Field(..., description="User who created this note")
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_by: str = Field(..., description="User who last modified this note")
    
    # Tenant isolation
    tenant_id: str = Field(..., description="Tenant ID for multi-tenancy")

    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }


class NoteResponse(BaseModel):
    """API response for Note"""
    id: str
    title: str
    body_rich_text: Optional[str] = None
    preview_text: Optional[str] = None
    owner_id: str
    owner_name: Optional[str] = None  # Resolved user name
    is_pinned: bool = False
    is_archived: bool = False
    created_at: datetime
    created_by: str
    created_by_name: Optional[str] = None  # Resolved user name
    updated_at: datetime
    updated_by: str
    updated_by_name: Optional[str] = None  # Resolved user name
    linked_records: Optional[List[dict]] = None  # Linked entities

    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }


# =============================================================================
# NoteLink - Polymorphic Linking Table
# =============================================================================

class NoteLinkBase(BaseModel):
    """Base fields for NoteLink"""
    linked_entity_type: str = Field(..., description="Object type (account, contact, lead, etc.)")
    linked_entity_id: str = Field(..., description="Record ID")
    share_type: ShareType = Field(default=ShareType.VIEWER, description="Access level")
    visibility: Visibility = Field(default=Visibility.INTERNAL_USERS, description="Visibility scope")


class NoteLinkCreate(NoteLinkBase):
    """Create a new note link"""
    note_id: str = Field(..., description="Note to link")


class NoteLink(NoteLinkBase):
    """Full NoteLink model"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    note_id: str = Field(..., description="Reference to Note")
    
    # Audit fields
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    created_by: str = Field(..., description="User who created this link")
    
    # Tenant isolation
    tenant_id: str = Field(..., description="Tenant ID for multi-tenancy")

    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }


class NoteLinkResponse(BaseModel):
    """API response for NoteLink"""
    id: str
    note_id: str
    linked_entity_type: str
    linked_entity_id: str
    linked_entity_name: Optional[str] = None  # Resolved record name
    share_type: ShareType
    visibility: Visibility
    created_at: datetime
    created_by: str
    created_by_name: Optional[str] = None

    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }


# =============================================================================
# NoteShare - Public Sharing
# =============================================================================

class NoteShareCreate(BaseModel):
    """Create a public share link"""
    note_id: str = Field(..., description="Note to share")
    expires_at: Optional[datetime] = Field(None, description="Expiration time (optional)")
    allow_view_in_browser: bool = Field(default=True, description="Allow viewing in browser")
    allow_copy: bool = Field(default=False, description="Allow copying content")


class NoteShare(BaseModel):
    """Full NoteShare model"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    note_id: str = Field(..., description="Reference to Note")
    public_token: str = Field(default_factory=lambda: str(uuid.uuid4()), description="Unique share token")
    expires_at: Optional[datetime] = Field(None, description="Expiration time")
    allow_view_in_browser: bool = Field(default=True)
    allow_copy: bool = Field(default=False)
    is_revoked: bool = Field(default=False, description="Revocation flag")
    revoked_at: Optional[datetime] = Field(None, description="When revoked")
    
    # Audit fields
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    created_by: str = Field(..., description="User who created this share")
    
    # Tenant isolation
    tenant_id: str = Field(..., description="Tenant ID for multi-tenancy")

    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }


class NoteShareResponse(BaseModel):
    """API response for NoteShare"""
    id: str
    note_id: str
    public_token: str
    public_url: str  # Full URL for sharing
    expires_at: Optional[datetime] = None
    allow_view_in_browser: bool = True
    allow_copy: bool = False
    is_revoked: bool = False
    created_at: datetime
    created_by: str
    created_by_name: Optional[str] = None

    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }


# =============================================================================
# List/Query Models
# =============================================================================

class NotesListParams(BaseModel):
    """Query parameters for listing notes"""
    include_archived: bool = Field(default=False, description="Include archived notes")
    pinned_first: bool = Field(default=True, description="Sort pinned notes first")
    limit: int = Field(default=50, ge=1, le=200)
    offset: int = Field(default=0, ge=0)


class NotesListResponse(BaseModel):
    """Response for notes list"""
    notes: List[NoteResponse]
    total: int
    limit: int
    offset: int
