"""
Role Models
Pydantic models for role management.
"""
from pydantic import BaseModel, Field
from typing import Optional, List
from enum import Enum
from datetime import datetime


class DataVisibility(str, Enum):
    """Data visibility options for roles"""
    VIEW_OWN = "view_own"
    VIEW_SUBORDINATE = "view_subordinate"
    VIEW_ALL = "view_all"


class RoleCreate(BaseModel):
    """Create role request"""
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = None
    parent_role_id: Optional[str] = None  # Reports To
    data_visibility: DataVisibility = DataVisibility.VIEW_SUBORDINATE
    permission_set_ids: List[str] = []
    
    class Config:
        json_schema_extra = {
            "example": {
                "name": "Sales Manager",
                "description": "Manages sales team",
                "parent_role_id": "vp_sales_role_id",
                "data_visibility": "view_subordinate",
                "permission_set_ids": ["sales_access"]
            }
        }


class RoleUpdate(BaseModel):
    """Update role request"""
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = None
    parent_role_id: Optional[str] = None
    data_visibility: Optional[DataVisibility] = None
    permission_set_ids: Optional[List[str]] = None


class RoleResponse(BaseModel):
    """Role response"""
    id: str
    name: str
    description: Optional[str] = None
    parent_role_id: Optional[str] = None
    parent_role_name: Optional[str] = None
    data_visibility: str
    permission_set_ids: List[str] = []
    assigned_users_count: int = 0
    is_system_role: bool = False
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class RoleHierarchyNode(BaseModel):
    """Role node in hierarchy tree"""
    id: str
    name: str
    description: Optional[str] = None
    parent_role_id: Optional[str] = None
    data_visibility: str
    assigned_users_count: int = 0
    is_system_role: bool = False
    children: List["RoleHierarchyNode"] = []
    level: int = 0
    
    class Config:
        from_attributes = True


# Enable self-referencing
RoleHierarchyNode.model_rebuild()
