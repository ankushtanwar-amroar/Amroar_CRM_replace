"""Rollup (Parent Summary) Field Models"""
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any, Literal
from datetime import datetime, timezone
from enum import Enum
from .base import AdvancedFieldBase, FieldType
import uuid


class RollupType(str, Enum):
    """Types of rollup calculations"""
    COUNT = "COUNT"
    SUM = "SUM"
    MIN = "MIN"
    MAX = "MAX"
    AVERAGE = "AVERAGE"


class RollupResultType(str, Enum):
    """Return type for rollup result - Only Number and Currency are supported"""
    NUMBER = "Number"
    CURRENCY = "Currency"


class FilterOperator(str, Enum):
    """Filter operators for rollup filters"""
    EQUALS = "="
    NOT_EQUALS = "!="
    CONTAINS = "contains"
    GREATER_THAN = ">"
    LESS_THAN = "<"
    GREATER_OR_EQUAL = ">="
    LESS_OR_EQUAL = "<="
    IS_NULL = "is_null"
    IS_NOT_NULL = "is_not_null"
    IN = "in"


class RollupFilterRule(BaseModel):
    """Filter rule for rollup calculation"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    field: str  # Field on child object
    operator: FilterOperator
    value: Any
    
    class Config:
        use_enum_values = True


class RollupFilter(BaseModel):
    """Filter configuration for rollup"""
    is_enabled: bool = False
    rules: List[RollupFilterRule] = []
    logic: str = "AND"  # AND, OR, or custom
    
    # Advanced formula filter (alternative to basic rules)
    use_formula: bool = False
    formula: str = ""  # Advanced formula expression
    
    # Parent field references used in filter
    parent_field_refs: List[str] = []  # e.g., ["Account.Industry", "Account.Type"]


class PostCalculationFormula(BaseModel):
    """Post-calculation formula configuration"""
    is_enabled: bool = False
    expression: str = ""  # e.g., "ROLLUP_VALUE * 0.18" or "ROLLUP_VALUE - PARENT.Discount"
    

class RecalculationMode(str, Enum):
    """When to recalculate rollup"""
    ASYNC = "async"  # Async recalculation on child changes (default)
    SYNC = "sync"  # Synchronous (blocking) - not recommended for large datasets
    SCHEDULED = "scheduled"  # Scheduled rebuild (Phase 2)


class RollupFieldConfig(AdvancedFieldBase):
    """Complete configuration for a Rollup field"""
    field_type: FieldType = FieldType.ROLLUP
    
    # Result type
    result_type: RollupResultType = RollupResultType.NUMBER
    decimal_places: int = 2
    currency_symbol: str = "$"
    
    # Relationship configuration
    child_object: str  # Child object API name (only valid related objects)
    relationship_field: str  # Field on child that references this parent
    
    # Rollup type and field
    rollup_type: RollupType
    summarize_field: Optional[str] = None  # Required for SUM, MIN, MAX
    
    # Filter criteria
    filter_config: RollupFilter = Field(default_factory=RollupFilter)
    
    # Post-calculation formula
    post_formula: PostCalculationFormula = Field(default_factory=PostCalculationFormula)
    
    # Recalculation settings
    recalculation_mode: RecalculationMode = RecalculationMode.ASYNC
    
    class Config:
        use_enum_values = True


# Request/Response models
class RollupFieldCreate(BaseModel):
    """Request model for creating a rollup field"""
    label: str
    api_key: Optional[str] = None
    description: Optional[str] = None
    help_text: Optional[str] = None
    
    result_type: RollupResultType = RollupResultType.NUMBER
    decimal_places: int = 2
    currency_symbol: str = "$"
    
    child_object: str
    relationship_field: str
    rollup_type: RollupType
    summarize_field: Optional[str] = None
    
    filter_config: Optional[RollupFilter] = None
    post_formula: Optional[PostCalculationFormula] = None
    recalculation_mode: RecalculationMode = RecalculationMode.ASYNC
    
    layout_assignments: List[str] = []
    add_to_all_layouts: bool = False


class RollupFieldUpdate(BaseModel):
    """Request model for updating a rollup field"""
    label: Optional[str] = None
    description: Optional[str] = None
    help_text: Optional[str] = None
    
    result_type: Optional[RollupResultType] = None
    decimal_places: Optional[int] = None
    currency_symbol: Optional[str] = None
    
    summarize_field: Optional[str] = None
    filter_config: Optional[RollupFilter] = None
    post_formula: Optional[PostCalculationFormula] = None
    recalculation_mode: Optional[RecalculationMode] = None
    
    layout_assignments: Optional[List[str]] = None


class RollupRecalculateRequest(BaseModel):
    """Request to manually recalculate rollup"""
    parent_id: Optional[str] = None  # Specific parent to recalculate, or all if None
