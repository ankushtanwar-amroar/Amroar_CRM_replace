"""
File Manager - Folder and Library Models
"""

from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum
import uuid


class LibraryRole(str, Enum):
    """Library member roles"""
    VIEWER = "viewer"  # Can view/download files
    CONTRIBUTOR = "contributor"  # Can upload/edit own files
    MANAGER = "manager"  # Can manage all files in library


class FolderType(str, Enum):
    """Folder types"""
    STANDARD = "standard"  # Manual folder
    SMART = "smart"  # Auto-populated (Phase 2)
    SYSTEM = "system"  # System-created folders


# ============================================================================
# FOLDER MODEL
# ============================================================================

class Folder(BaseModel):
    """Folders for organizing files within libraries"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    name: str
    description: Optional[str] = None
    
    # Hierarchy
    parent_folder_id: Optional[str] = None
    library_id: str
    path: str = "/"  # Full path like "/Documents/Contracts"
    depth: int = 0
    
    # Type and settings
    folder_type: FolderType = FolderType.STANDARD
    color: Optional[str] = None
    icon: Optional[str] = None
    
    # Smart folder criteria (Phase 2)
    smart_criteria: Optional[Dict[str, Any]] = None
    
    # Stats (denormalized)
    file_count: int = 0
    subfolder_count: int = 0
    total_size_bytes: int = 0
    
    is_active: bool = True
    
    created_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.utcnow())
    updated_at: Optional[datetime] = None

    class Config:
        use_enum_values = True


class FolderCreate(BaseModel):
    """Create folder request"""
    name: str
    description: Optional[str] = None
    parent_folder_id: Optional[str] = None
    library_id: str
    color: Optional[str] = None
    icon: Optional[str] = None


class FolderUpdate(BaseModel):
    """Update folder request"""
    name: Optional[str] = None
    description: Optional[str] = None
    parent_folder_id: Optional[str] = None
    color: Optional[str] = None
    icon: Optional[str] = None


class FolderResponse(BaseModel):
    """Folder response with hierarchy info"""
    id: str
    name: str
    description: Optional[str]
    parent_folder_id: Optional[str]
    library_id: str
    path: str
    depth: int
    folder_type: str
    color: Optional[str]
    icon: Optional[str]
    file_count: int
    subfolder_count: int
    total_size_bytes: int
    created_by: str
    created_at: datetime
    
    # Expanded
    library_name: Optional[str] = None
    parent_folder_name: Optional[str] = None
    children: List['FolderResponse'] = Field(default_factory=list)


# ============================================================================
# LIBRARY MODEL
# ============================================================================

class Library(BaseModel):
    """Libraries for grouping folders with access control"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    name: str
    description: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None
    
    # Access control
    is_public: bool = True  # If false, requires explicit membership
    default_role: LibraryRole = LibraryRole.VIEWER
    allowed_roles: List[str] = Field(default_factory=list)  # CRM roles that can access
    
    # Settings
    allow_external_sharing: bool = True
    auto_version: bool = True  # Auto-create versions on replace
    require_category: bool = False
    require_tags: bool = False
    default_sensitivity_id: Optional[str] = None
    
    # Stats (denormalized)
    file_count: int = 0
    folder_count: int = 0
    total_size_bytes: int = 0
    member_count: int = 0
    
    is_active: bool = True
    is_default: bool = False  # Default library for uploads
    
    created_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.utcnow())
    updated_at: Optional[datetime] = None

    class Config:
        use_enum_values = True


class LibraryCreate(BaseModel):
    """Create library request"""
    name: str
    description: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None
    is_public: bool = True
    default_role: LibraryRole = LibraryRole.VIEWER
    allowed_roles: List[str] = Field(default_factory=list)
    allow_external_sharing: bool = True
    auto_version: bool = True
    require_category: bool = False
    require_tags: bool = False
    default_sensitivity_id: Optional[str] = None
    is_default: bool = False


class LibraryUpdate(BaseModel):
    """Update library request"""
    name: Optional[str] = None
    description: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None
    is_public: Optional[bool] = None
    default_role: Optional[LibraryRole] = None
    allowed_roles: Optional[List[str]] = None
    allow_external_sharing: Optional[bool] = None
    auto_version: Optional[bool] = None
    require_category: Optional[bool] = None
    require_tags: Optional[bool] = None
    default_sensitivity_id: Optional[str] = None
    is_active: Optional[bool] = None
    is_default: Optional[bool] = None


class LibraryResponse(BaseModel):
    """Library response model"""
    id: str
    name: str
    description: Optional[str]
    icon: Optional[str]
    color: Optional[str]
    is_public: bool
    default_role: str
    allowed_roles: List[str]
    allow_external_sharing: bool
    file_count: int
    folder_count: int
    total_size_bytes: int
    member_count: int
    is_default: bool
    created_by: str
    created_at: datetime
    
    # Computed
    user_role: Optional[str] = None  # Current user's role in library


# ============================================================================
# LIBRARY MEMBER MODEL
# ============================================================================

class LibraryMember(BaseModel):
    """Library membership for access control"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    library_id: str
    user_id: str
    role: LibraryRole
    
    added_by: str
    added_at: datetime = Field(default_factory=lambda: datetime.utcnow())
    updated_at: Optional[datetime] = None

    class Config:
        use_enum_values = True


class LibraryMemberCreate(BaseModel):
    """Add library member request"""
    library_id: str
    user_id: str
    role: LibraryRole = LibraryRole.VIEWER


class LibraryMemberUpdate(BaseModel):
    """Update library member role"""
    role: LibraryRole
