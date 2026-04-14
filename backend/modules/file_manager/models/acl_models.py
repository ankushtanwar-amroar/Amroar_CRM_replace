"""
File Manager - Access Control Models
Phase 3: Security & ACL Implementation
"""

from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum
import uuid


class LibraryRole(str, Enum):
    """Library role levels - hierarchical permissions"""
    ADMIN = "admin"           # Full control including settings
    MANAGER = "manager"       # Manage files, folders, members
    CONTRIBUTOR = "contributor"  # Upload, edit own files
    VIEWER = "viewer"         # Read-only access


class VisibilityMode(str, Enum):
    """File visibility mode"""
    INHERIT = "inherit"       # Inherit from linked record access
    RESTRICTED = "restricted"  # Only explicit ACL grants access


class PrincipalType(str, Enum):
    """Type of principal in ACL"""
    USER = "user"
    TEAM = "team"
    ROLE = "role"


class Permission(str, Enum):
    """ACL permission levels"""
    VIEW = "view"             # Read-only access
    EDIT = "edit"             # View + modify metadata/tags
    FULL = "full"             # Edit + delete + share


# ============================================================================
# PERMISSION MATRIX - Source of truth for library roles
# ============================================================================

LIBRARY_PERMISSION_MATRIX = {
    # Action: {role: allowed}
    "view_file": {
        LibraryRole.ADMIN: True,
        LibraryRole.MANAGER: True,
        LibraryRole.CONTRIBUTOR: True,
        LibraryRole.VIEWER: True,
    },
    "upload": {
        LibraryRole.ADMIN: True,
        LibraryRole.MANAGER: True,
        LibraryRole.CONTRIBUTOR: True,
        LibraryRole.VIEWER: False,
    },
    "replace_version": {
        LibraryRole.ADMIN: True,
        LibraryRole.MANAGER: True,
        LibraryRole.CONTRIBUTOR: True,
        LibraryRole.VIEWER: False,
    },
    "delete": {
        LibraryRole.ADMIN: True,
        LibraryRole.MANAGER: True,
        LibraryRole.CONTRIBUTOR: False,  # Cannot delete
        LibraryRole.VIEWER: False,
    },
    "share": {
        LibraryRole.ADMIN: True,
        LibraryRole.MANAGER: True,
        LibraryRole.CONTRIBUTOR: False,  # Cannot share
        LibraryRole.VIEWER: False,
    },
    "manage_folders": {
        LibraryRole.ADMIN: True,
        LibraryRole.MANAGER: True,
        LibraryRole.CONTRIBUTOR: False,
        LibraryRole.VIEWER: False,
    },
    "manage_library": {
        LibraryRole.ADMIN: True,
        LibraryRole.MANAGER: False,
        LibraryRole.CONTRIBUTOR: False,
        LibraryRole.VIEWER: False,
    },
    "manage_members": {
        LibraryRole.ADMIN: True,
        LibraryRole.MANAGER: True,
        LibraryRole.CONTRIBUTOR: False,
        LibraryRole.VIEWER: False,
    },
    "create_public_link": {
        LibraryRole.ADMIN: True,
        LibraryRole.MANAGER: True,
        LibraryRole.CONTRIBUTOR: False,
        LibraryRole.VIEWER: False,
    },
    "link_to_record": {
        LibraryRole.ADMIN: True,
        LibraryRole.MANAGER: True,
        LibraryRole.CONTRIBUTOR: True,
        LibraryRole.VIEWER: False,
    },
}


def check_library_permission(role: str, action: str) -> bool:
    """Check if a role has permission for an action"""
    if action not in LIBRARY_PERMISSION_MATRIX:
        return False
    
    try:
        role_enum = LibraryRole(role.lower())
    except ValueError:
        return False
    
    return LIBRARY_PERMISSION_MATRIX[action].get(role_enum, False)


# ============================================================================
# FILE ACL MODEL
# ============================================================================

class FileACL(BaseModel):
    """
    File-level Access Control List entry.
    Grants explicit access to a file for a user/team/role.
    """
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    file_id: str
    
    # Principal (who gets access)
    principal_type: PrincipalType
    principal_id: str  # user_id, team_id, or role_id
    principal_name: Optional[str] = None  # Cached name for display
    
    # Permission level
    permission: Permission = Permission.VIEW
    
    # Audit
    granted_by: str
    granted_by_name: Optional[str] = None
    granted_at: datetime = Field(default_factory=datetime.utcnow)
    expires_at: Optional[datetime] = None
    
    # Notes
    notes: Optional[str] = None
    
    class Config:
        use_enum_values = True


class FileACLCreate(BaseModel):
    """Create ACL entry request"""
    file_id: str
    principal_type: PrincipalType
    principal_id: str
    permission: Permission = Permission.VIEW
    expires_at: Optional[datetime] = None
    notes: Optional[str] = None
    
    class Config:
        use_enum_values = True


class FileACLUpdate(BaseModel):
    """Update ACL entry request"""
    permission: Optional[Permission] = None
    expires_at: Optional[datetime] = None
    notes: Optional[str] = None
    
    class Config:
        use_enum_values = True


# ============================================================================
# LIBRARY MEMBER MODEL
# ============================================================================

class LibraryMember(BaseModel):
    """Library membership with role"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    library_id: str
    user_id: str
    user_name: Optional[str] = None
    user_email: Optional[str] = None
    role: LibraryRole = LibraryRole.VIEWER
    added_by: str
    added_at: datetime = Field(default_factory=datetime.utcnow)
    
    class Config:
        use_enum_values = True


# ============================================================================
# ACCESS CHECK RESULT
# ============================================================================

class AccessCheckResult(BaseModel):
    """Result of an access check"""
    allowed: bool
    reason: str
    effective_role: Optional[str] = None
    access_source: Optional[str] = None  # "library_role", "file_acl", "record_access", "owner"
    details: Dict[str, Any] = Field(default_factory=dict)


# ============================================================================
# SHARE REQUEST MODELS
# ============================================================================

class ShareWithUserRequest(BaseModel):
    """Share file with specific users"""
    user_ids: List[str]
    permission: Permission = Permission.VIEW
    notify: bool = True
    message: Optional[str] = None
    
    class Config:
        use_enum_values = True


class ShareWithTeamRequest(BaseModel):
    """Share file with team"""
    team_id: str
    permission: Permission = Permission.VIEW
    notify: bool = True
    
    class Config:
        use_enum_values = True


class ShareWithRoleRequest(BaseModel):
    """Share file with role"""
    role_id: str
    permission: Permission = Permission.VIEW
    
    class Config:
        use_enum_values = True
