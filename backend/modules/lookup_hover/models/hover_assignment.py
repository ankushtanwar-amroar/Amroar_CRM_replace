"""
Lookup Hover Assignment Models
Per-lookup-field hover preview configuration
"""
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime, timezone


class LookupHoverAssignment(BaseModel):
    """Configuration for hover preview on a specific lookup field"""
    object_name: str = Field(..., description="Object containing the lookup field (e.g., 'contact')")
    field_name: str = Field(..., description="API name of the lookup field (e.g., 'account_id')")
    related_object: str = Field(..., description="Object that the lookup points to (e.g., 'account')")
    enabled: bool = Field(default=True, description="Whether hover preview is enabled for this lookup field")
    preview_fields: List[str] = Field(default_factory=list, description="Fields to show in hover preview from the related object")
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    
    class Config:
        json_schema_extra = {
            "example": {
                "object_name": "contact",
                "field_name": "account_id",
                "related_object": "account",
                "enabled": True,
                "preview_fields": ["phone", "website", "industry", "type"]
            }
        }


class LookupHoverAssignmentCreate(BaseModel):
    """Request model for creating/updating a lookup hover assignment"""
    enabled: bool = True
    preview_fields: List[str] = Field(default_factory=list)


class LookupHoverAssignmentResponse(BaseModel):
    """Response model for a lookup hover assignment"""
    object_name: str
    field_name: str
    related_object: str
    enabled: bool
    preview_fields: List[str]
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class LookupFieldInfo(BaseModel):
    """Information about a lookup field on an object"""
    field_name: str
    field_label: str
    related_object: str
    related_object_label: str
    has_hover_config: bool = False
    hover_enabled: bool = False
