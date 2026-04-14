"""
Schema Builder - Data Models
============================
Pydantic models for Schema Builder entities.
Stored in dedicated collections: schema_objects, schema_fields, schema_relationships
"""

from pydantic import BaseModel, Field
from typing import Optional, List, Any
from datetime import datetime
from enum import Enum


class FieldType(str, Enum):
    """Supported field types in Schema Builder"""
    TEXT = "text"
    NUMBER = "number"
    EMAIL = "email"
    PHONE = "phone"
    DATE = "date"
    DATETIME = "datetime"
    CHECKBOX = "checkbox"
    PICKLIST = "picklist"
    LONG_TEXT = "long_text"
    LOOKUP = "lookup"


class SchemaObjectBase(BaseModel):
    """Base model for Schema Object"""
    label: str = Field(..., description="Display label (e.g., 'Lead')")
    api_name: str = Field(..., description="API name (auto-generated, e.g., 'lead')")
    description: Optional[str] = Field(None, description="Optional description")
    plural_label: Optional[str] = Field(None, description="Plural form (e.g., 'Leads')")
    icon: Optional[str] = Field(None, description="Icon identifier")


class SchemaObjectCreate(SchemaObjectBase):
    """Model for creating a new Schema Object"""
    pass


class SchemaObjectUpdate(BaseModel):
    """Model for updating a Schema Object"""
    label: Optional[str] = None
    description: Optional[str] = None
    plural_label: Optional[str] = None
    icon: Optional[str] = None


class SchemaObject(SchemaObjectBase):
    """Full Schema Object model with system fields"""
    id: str
    tenant_id: str
    is_custom: bool = True
    is_active: bool = True
    created_at: datetime
    updated_at: datetime
    created_by: Optional[str] = None
    
    class Config:
        from_attributes = True


class SchemaFieldBase(BaseModel):
    """Base model for Schema Field"""
    label: str = Field(..., description="Display label")
    api_name: str = Field(..., description="API name")
    field_type: FieldType = Field(..., description="Field type")
    is_required: bool = Field(False, description="Whether field is required")
    is_searchable: bool = Field(False, description="Include in Global Search")
    default_value: Optional[Any] = Field(None, description="Default value")
    is_unique: bool = Field(False, description="Whether value must be unique")
    help_text: Optional[str] = Field(None, description="Help text for users")
    # For picklist fields
    picklist_values: Optional[List[str]] = Field(None, description="Values for picklist")
    # For lookup fields
    lookup_object: Optional[str] = Field(None, description="Target object for lookup")


class SchemaFieldCreate(SchemaFieldBase):
    """Model for creating a new Schema Field"""
    object_id: str = Field(..., description="Parent object ID")


class SchemaFieldUpdate(BaseModel):
    """Model for updating a Schema Field - type cannot be changed if data exists"""
    label: Optional[str] = None
    is_required: Optional[bool] = None
    is_searchable: Optional[bool] = None
    default_value: Optional[Any] = None
    is_unique: Optional[bool] = None
    help_text: Optional[str] = None
    picklist_values: Optional[List[str]] = None
    # Note: field_type and api_name cannot be changed after creation
    sort_order: Optional[int] = None


class SchemaField(SchemaFieldBase):
    """Full Schema Field model"""
    id: str
    tenant_id: str
    object_id: str
    is_system: bool = False  # System fields like id, createdAt cannot be deleted
    is_active: bool = True
    sort_order: int = 0
    created_at: datetime
    updated_at: datetime
    created_by: Optional[str] = None
    
    class Config:
        from_attributes = True


class SchemaRelationshipBase(BaseModel):
    """Base model for Schema Relationship (Lookup)"""
    label: str = Field(..., description="Relationship label")
    api_name: str = Field(..., description="API name for the lookup field")
    source_object_id: str = Field(..., description="Source object ID")
    target_object_id: str = Field(..., description="Target object ID")
    is_required: bool = Field(False, description="Whether relationship is required")


class SchemaRelationshipCreate(SchemaRelationshipBase):
    """Model for creating a new Schema Relationship"""
    pass


class SchemaRelationship(SchemaRelationshipBase):
    """Full Schema Relationship model"""
    id: str
    tenant_id: str
    is_active: bool = True
    created_at: datetime
    updated_at: datetime
    created_by: Optional[str] = None
    
    class Config:
        from_attributes = True


# Response models
class SchemaObjectResponse(BaseModel):
    """Response model for Schema Object with fields"""
    object: SchemaObject
    fields: List[SchemaField] = []
    relationships: List[SchemaRelationship] = []


class SchemaObjectListResponse(BaseModel):
    """Response model for list of Schema Objects"""
    objects: List[SchemaObject]
    total: int


class FieldReorderRequest(BaseModel):
    """Request model for reordering fields"""
    field_ids: List[str] = Field(..., description="Ordered list of field IDs")
