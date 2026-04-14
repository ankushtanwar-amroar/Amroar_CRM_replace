"""Base models for advanced field types"""
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
from enum import Enum
import uuid


class FieldType(str, Enum):
    """Advanced field types"""
    LOOKUP = "lookup"
    ROLLUP = "rollup"
    FORMULA = "formula"


class LayoutAssignment(BaseModel):
    """Page layout assignment for fields"""
    layout_id: str
    layout_name: str
    is_assigned: bool = True


class AdvancedFieldBase(BaseModel):
    """Base model for all advanced field types"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    label: str
    api_key: str  # Auto-generated, editable
    field_type: FieldType
    description: Optional[str] = None
    help_text: Optional[str] = None
    is_required: bool = False
    is_unique: bool = False
    is_indexed: bool = True  # Searchable/Indexed
    is_active: bool = True
    
    # Object association
    object_name: str
    tenant_id: str
    
    # Layout assignments
    layout_assignments: List[str] = []  # List of layout IDs
    add_to_all_layouts: bool = False
    
    # Audit fields
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    created_by: Optional[str] = None
    updated_by: Optional[str] = None

    class Config:
        use_enum_values = True
