"""
Dependent Picklist Data Models
Updated: Dependencies are now GLOBAL (object-level), not per record type
"""
from pydantic import BaseModel, Field
from typing import Dict, List, Optional
from datetime import datetime
from enum import Enum
import uuid


class DependentPicklistMapping(BaseModel):
    """Single mapping of controlling value to dependent values"""
    controlling_value: str
    dependent_values: List[str] = Field(default_factory=list)


class DependentPicklistConfig(BaseModel):
    """Configuration for a dependent picklist pair - GLOBAL (object-level)"""
    id: str = Field(default_factory=lambda: f"dpc-{uuid.uuid4().hex[:12]}")
    tenant_id: str
    object_name: str
    # record_type_id removed - dependencies are now global
    controlling_field_api: str
    controlling_field_label: str = ""
    dependent_field_api: str
    dependent_field_label: str = ""
    # Mapping: controlling_value -> list of allowed dependent values
    mapping: Dict[str, List[str]] = Field(default_factory=dict)
    is_active: bool = True
    created_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
    created_by: Optional[str] = None


class DependentPicklistCreateRequest(BaseModel):
    """Request to create a dependent picklist configuration"""
    controlling_field_api: str = Field(..., description="API name of the controlling picklist field")
    controlling_field_label: str = Field(default="", description="Label of the controlling field")
    dependent_field_api: str = Field(..., description="API name of the dependent picklist field")
    dependent_field_label: str = Field(default="", description="Label of the dependent field")
    mapping: Dict[str, List[str]] = Field(
        default_factory=dict,
        description="Mapping of controlling values to allowed dependent values"
    )


class DependentPicklistUpdateRequest(BaseModel):
    """Request to update a dependent picklist configuration"""
    controlling_field_label: Optional[str] = None
    dependent_field_label: Optional[str] = None
    mapping: Optional[Dict[str, List[str]]] = None
    is_active: Optional[bool] = None


class DependentPicklistResponse(BaseModel):
    """Response model for dependent picklist configuration"""
    id: str
    object_name: str
    controlling_field_api: str
    controlling_field_label: str
    dependent_field_api: str
    dependent_field_label: str
    mapping: Dict[str, List[str]]
    is_active: bool
    created_at: str
    updated_at: str


class RuntimeDependencyRequest(BaseModel):
    """Request to get filtered dependent values at runtime"""
    object_name: str
    controlling_field_api: str
    controlling_value: str
    dependent_field_api: str


class RuntimeDependencyResponse(BaseModel):
    """Response with filtered dependent values"""
    controlling_field_api: str
    controlling_value: str
    dependent_field_api: str
    allowed_values: List[str]
    has_dependency: bool
