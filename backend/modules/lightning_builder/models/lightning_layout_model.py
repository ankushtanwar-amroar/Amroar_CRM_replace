from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
from datetime import datetime

class ComponentConfig(BaseModel):
    """Configuration for a single component in the layout"""
    id: str
    type: str  # 'field', 'related_list', 'activity', 'custom_html', 'section', 'tabs'
    label: Optional[str] = None
    field_name: Optional[str] = None  # For field components
    properties: Dict[str, Any] = Field(default_factory=dict)
    visibility_rules: Optional[Dict[str, Any]] = None
    order: int = 0

class LayoutRegion(BaseModel):
    """A region/column in the layout that can contain components"""
    id: str
    name: str  # 'left', 'main', 'right', 'full_width'
    width: str  # 'w-64', 'flex-1', 'w-80'
    components: List[ComponentConfig] = Field(default_factory=list)
    order: int = 0

class LightningLayoutModel(BaseModel):
    """Model for Lightning page layouts stored in DB"""
    id: Optional[str] = None
    tenant_id: str
    object_name: str  # 'lead', 'contact', 'account', etc.
    layout_name: str = "Default Layout"
    template_type: str = "three_column"  # 'one_column', 'two_column', 'three_column', 'custom'
    regions: List[LayoutRegion] = Field(default_factory=list)
    created_by: str
    updated_by: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    is_active: bool = True

class LightningLayoutCreate(BaseModel):
    """Request model for creating a new Lightning layout"""
    object_name: str
    layout_name: str = "Default Layout"
    template_type: str = "three_column"
    regions: List[LayoutRegion] = Field(default_factory=list)

class LightningLayoutUpdate(BaseModel):
    """Request model for updating a Lightning layout"""
    layout_name: Optional[str] = None
    template_type: Optional[str] = None
    regions: Optional[List[LayoutRegion]] = None
    is_active: Optional[bool] = None
