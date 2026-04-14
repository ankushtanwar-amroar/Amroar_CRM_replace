"""Lookup (Relationship) Field Models"""
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any, Literal
from datetime import datetime, timezone
from enum import Enum
from .base import AdvancedFieldBase, FieldType
import uuid


class FilterOperator(str, Enum):
    """Filter operators for lookup filters"""
    EQUALS = "="
    NOT_EQUALS = "!="
    CONTAINS = "contains"
    NOT_CONTAINS = "not_contains"
    STARTS_WITH = "starts_with"
    ENDS_WITH = "ends_with"
    IN = "in"
    NOT_IN = "not_in"
    GREATER_THAN = ">"
    LESS_THAN = "<"
    GREATER_OR_EQUAL = ">="
    LESS_OR_EQUAL = "<="
    IS_NULL = "is_null"
    IS_NOT_NULL = "is_not_null"


class FilterValueType(str, Enum):
    """Type of filter value"""
    STATIC = "static"  # Static value
    CURRENT_RECORD = "current_record"  # Value from current record field


class EnforcementMode(str, Enum):
    """How lookup filter is enforced"""
    FILTER_ONLY = "filter_only"  # Just filter results
    BLOCK_SAVE = "block_save"  # Block save if invalid (strict)


class LookupFilterRule(BaseModel):
    """Individual filter rule for lookup field"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    target_field: str  # Field on target object (supports 1-level related: "account.industry")
    operator: FilterOperator
    value_type: FilterValueType = FilterValueType.STATIC
    static_value: Optional[Any] = None  # Used when value_type is STATIC
    source_field: Optional[str] = None  # Used when value_type is CURRENT_RECORD
    
    class Config:
        use_enum_values = True


class LookupFilter(BaseModel):
    """Complete lookup filter configuration"""
    is_enabled: bool = False
    rules: List[LookupFilterRule] = []
    logic: str = "AND"  # AND, OR, or custom like "(1 AND 2) OR 3"
    enforcement_mode: EnforcementMode = EnforcementMode.FILTER_ONLY
    error_message: Optional[str] = None  # Custom error message for BLOCK_SAVE mode
    
    class Config:
        use_enum_values = True


class LookupFieldConfig(AdvancedFieldBase):
    """Complete configuration for a Lookup field"""
    field_type: FieldType = FieldType.LOOKUP
    
    # Relationship configuration
    target_object: str  # Target object API name (e.g., "account", "contact")
    display_field: str = "name"  # Field to display from target (default = Name/primary field)
    
    # Lookup filter configuration
    filter_config: LookupFilter = Field(default_factory=LookupFilter)
    
    # Storage - the actual value stored
    # Value stored as: <api_key>_id (e.g., account_id)
    
    # Referential integrity
    on_delete_action: Literal["set_null", "restrict", "cascade"] = "set_null"
    
    class Config:
        use_enum_values = True


# Request/Response models for API
class LookupFieldCreate(BaseModel):
    """Request model for creating a lookup field"""
    label: str
    api_key: Optional[str] = None  # Auto-generated if not provided
    description: Optional[str] = None
    help_text: Optional[str] = None
    is_required: bool = False
    is_unique: bool = False
    is_indexed: bool = True
    
    target_object: str
    display_field: str = "name"
    filter_config: Optional[LookupFilter] = None
    
    layout_assignments: List[str] = []
    add_to_all_layouts: bool = False
    
    on_delete_action: Literal["set_null", "restrict", "cascade"] = "set_null"


class LookupFieldUpdate(BaseModel):
    """Request model for updating a lookup field"""
    label: Optional[str] = None
    description: Optional[str] = None
    help_text: Optional[str] = None
    is_required: Optional[bool] = None
    display_field: Optional[str] = None
    filter_config: Optional[LookupFilter] = None
    layout_assignments: Optional[List[str]] = None
    on_delete_action: Optional[Literal["set_null", "restrict", "cascade"]] = None


class LookupSearchRequest(BaseModel):
    """Request for lookup search"""
    object: str  # Target object to search
    query: str  # Search query
    context: Optional[Dict[str, Any]] = None  # Current record context for filtering
    field_id: Optional[str] = None  # Lookup field ID for filter application
    source_object: Optional[str] = None  # Source object containing the lookup field (for config lookup)
    field_name: Optional[str] = None  # API name of the lookup field (for config lookup)
    limit: int = 20


class LookupSearchResult(BaseModel):
    """Single lookup search result"""
    id: str
    display_value: str
    secondary_value: Optional[str] = None  # Additional info like email
    record: Dict[str, Any]  # Full record data
