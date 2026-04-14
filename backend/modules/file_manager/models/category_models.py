"""
File Manager - Category, Tag, and Sensitivity Models
"""

from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum
import uuid


class TagType(str, Enum):
    """Tag types"""
    SYSTEM = "system"  # Created by system
    USER = "user"  # Created by users
    AI_SUGGESTED = "ai_suggested"  # Suggested by AI


# ============================================================================
# CATEGORY MODEL
# ============================================================================

class Category(BaseModel):
    """File categories - can be object-specific or global"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    name: str
    description: Optional[str] = None
    icon: Optional[str] = None  # Icon identifier
    color: Optional[str] = None  # Hex color code
    
    # Object association
    object_name: Optional[str] = None  # If null, applies to all objects
    
    # Validation rules
    required_tags: List[str] = Field(default_factory=list)  # Tag IDs that must be applied
    allowed_extensions: List[str] = Field(default_factory=list)  # e.g., [".pdf", ".docx"]
    max_file_size_mb: Optional[int] = None
    
    # UI ordering
    sort_order: int = 0
    is_active: bool = True
    is_default: bool = False  # Default category for the object
    
    created_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.utcnow())
    updated_at: Optional[datetime] = None

    class Config:
        use_enum_values = True


class CategoryCreate(BaseModel):
    """Create category request"""
    name: str
    description: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None
    object_name: Optional[str] = None
    required_tags: List[str] = Field(default_factory=list)
    allowed_extensions: List[str] = Field(default_factory=list)
    max_file_size_mb: Optional[int] = None
    sort_order: int = 0
    is_default: bool = False


class CategoryUpdate(BaseModel):
    """Update category request"""
    name: Optional[str] = None
    description: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None
    object_name: Optional[str] = None
    required_tags: Optional[List[str]] = None
    allowed_extensions: Optional[List[str]] = None
    max_file_size_mb: Optional[int] = None
    sort_order: Optional[int] = None
    is_active: Optional[bool] = None
    is_default: Optional[bool] = None


# ============================================================================
# TAG MODEL
# ============================================================================

class Tag(BaseModel):
    """Tags for file classification"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    name: str
    description: Optional[str] = None
    color: Optional[str] = None  # Hex color code
    tag_type: TagType = TagType.USER
    
    # Usage tracking
    usage_count: int = 0
    
    is_active: bool = True
    is_required: bool = False  # If true, must be applied to files in certain categories
    
    created_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.utcnow())
    updated_at: Optional[datetime] = None

    class Config:
        use_enum_values = True


class TagCreate(BaseModel):
    """Create tag request"""
    name: str
    description: Optional[str] = None
    color: Optional[str] = None
    tag_type: TagType = TagType.USER
    is_required: bool = False


class TagUpdate(BaseModel):
    """Update tag request"""
    name: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = None
    is_active: Optional[bool] = None
    is_required: Optional[bool] = None


# ============================================================================
# SENSITIVITY MODEL
# ============================================================================

class Sensitivity(BaseModel):
    """File sensitivity levels for access control"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    name: str  # e.g., "Public", "Internal", "Confidential", "Restricted"
    description: Optional[str] = None
    level: int = 0  # Higher = more restricted
    color: Optional[str] = None
    icon: Optional[str] = None
    
    # Access rules
    allowed_roles: List[str] = Field(default_factory=list)  # Empty = all roles
    requires_password_for_download: bool = False
    requires_audit_acknowledgment: bool = False
    watermark_enabled: bool = False
    
    is_active: bool = True
    is_default: bool = False
    
    created_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.utcnow())
    updated_at: Optional[datetime] = None


class SensitivityCreate(BaseModel):
    """Create sensitivity level request"""
    name: str
    description: Optional[str] = None
    level: int = 0
    color: Optional[str] = None
    icon: Optional[str] = None
    allowed_roles: List[str] = Field(default_factory=list)
    requires_password_for_download: bool = False
    requires_audit_acknowledgment: bool = False
    watermark_enabled: bool = False
    is_default: bool = False


class SensitivityUpdate(BaseModel):
    """Update sensitivity level request"""
    name: Optional[str] = None
    description: Optional[str] = None
    level: Optional[int] = None
    color: Optional[str] = None
    icon: Optional[str] = None
    allowed_roles: Optional[List[str]] = None
    requires_password_for_download: Optional[bool] = None
    requires_audit_acknowledgment: Optional[bool] = None
    watermark_enabled: Optional[bool] = None
    is_active: Optional[bool] = None
    is_default: Optional[bool] = None
