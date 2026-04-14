from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List
from datetime import datetime
from enum import Enum

class FieldType(str, Enum):
    TEXT = "text"
    TEXTAREA = "textarea"
    NUMBER = "number"
    EMAIL = "email"
    PHONE = "phone"
    URL = "url"
    DATE = "date"
    DATETIME = "datetime"
    CHECKBOX = "checkbox"
    PICKLIST = "picklist"
    MULTIPICKLIST = "multipicklist"
    CURRENCY = "currency"
    PERCENT = "percent"
    LOOKUP = "lookup"
    MASTER_DETAIL = "master_detail"
    FORMULA = "formula"
    GEOLOCATION = "geolocation"
    FILE = "file"

class FieldConfig(BaseModel):
    """Field configuration for Object Manager"""
    api_name: str
    label: str
    type: FieldType
    required: bool = False
    unique: bool = False
    default_value: Optional[Any] = None
    help_text: Optional[str] = None
    
    # For picklist/multipicklist
    picklist_values: Optional[List[str]] = None
    
    # For lookup/master-detail
    reference_object: Optional[str] = None
    
    # For formula
    formula_expression: Optional[str] = None
    
    # For geolocation
    latitude_field: Optional[str] = None
    longitude_field: Optional[str] = None
    
    # UI config
    is_highlighted: bool = False  # Show prominently
    display_order: int = 0
    
class ButtonConfig(BaseModel):
    """Button configuration"""
    id: str
    label: str
    type: str  # 'standard', 'custom'
    action: str  # 'edit', 'delete', 'custom_action'
    icon: Optional[str] = None
    url: Optional[str] = None
    display_order: int = 0
    
class RecordType(BaseModel):
    """Record type configuration"""
    id: str
    name: str
    description: Optional[str] = None
    is_active: bool = True
    is_default: bool = False
    picklist_value_mappings: Optional[Dict[str, List[str]]] = None
    
class ValidationRule(BaseModel):
    """Validation rule"""
    id: str
    name: str
    description: Optional[str] = None
    error_message: str
    formula_expression: str  # Boolean expression
    is_active: bool = True
    
class ObjectConfiguration(BaseModel):
    """Complete object configuration"""
    object_type_id: str
    tenant_id: str
    
    # Fields
    fields: List[FieldConfig] = []
    highlighted_fields: List[str] = []  # Field API names
    
    # Buttons
    standard_buttons: List[ButtonConfig] = []
    custom_buttons: List[ButtonConfig] = []
    
    # Record types
    record_types: List[RecordType] = []
    
    # Validation rules
    validation_rules: List[ValidationRule] = []
    
    # Features
    enable_files: bool = True
    enable_timeline: bool = True
    enable_activities: bool = True
    
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
