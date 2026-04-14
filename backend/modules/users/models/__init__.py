"""
Users Module Models
Pydantic models for user, role, and permission operations.
"""
from pydantic import BaseModel, EmailStr
from typing import Optional, Dict, Any, List
from datetime import datetime


class UserResponse(BaseModel):
    """Response model for user data (excludes sensitive fields)"""
    id: str
    email: str
    first_name: str
    last_name: str
    tenant_id: str
    is_active: bool = True
    invited_at: Optional[datetime] = None
    last_login: Optional[datetime] = None
    created_at: Optional[datetime] = None  # Made optional for legacy users
    role_id: Optional[str] = None
    role_name: Optional[str] = None
    is_frozen: bool = False
    frozen_until: Optional[datetime] = None
    freeze_reason: Optional[str] = None
    account_status: Optional[str] = None
    # Fields for lookup compatibility
    display_value: Optional[str] = None
    name: Optional[str] = None


class InviteUserRequest(BaseModel):
    email: EmailStr
    first_name: str
    last_name: str
    role_id: Optional[str] = None


class FreezeUserRequest(BaseModel):
    frozen_until: Optional[str] = None
    reason: Optional[str] = "Temporary suspension"


class RoleCreate(BaseModel):
    name: str
    description: Optional[str] = ""
    parent_role_id: Optional[str] = None


class PermissionEntry(BaseModel):
    object_name: str
    create: bool = False
    read: bool = True
    edit: bool = False
    delete: bool = False
    view_all: bool = False
    modify_all: bool = False


class PermissionSet(BaseModel):
    id: str
    role_id: str
    role_name: str
    permissions: List[PermissionEntry]
    is_system_permission_set: bool = False
    created_at: datetime
    updated_at: datetime
