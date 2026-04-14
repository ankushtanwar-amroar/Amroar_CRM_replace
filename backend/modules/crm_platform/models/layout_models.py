from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum

class LayoutItemType(str, Enum):
    FIELD = "field"
    SECTION = "section"
    RELATED_LIST = "related_list"
    TIMELINE = "timeline"
    FILES = "files"
    CUSTOM_COMPONENT = "custom_component"

class LayoutItem(BaseModel):
    """Individual layout item"""
    id: str
    type: LayoutItemType
    label: Optional[str] = None
    
    # For field items
    field_api_name: Optional[str] = None
    
    # For related list items
    related_object: Optional[str] = None
    relationship_field: Optional[str] = None
    
    # For custom components
    component_type: Optional[str] = None
    component_config: Optional[Dict[str, Any]] = None
    
    # Conditional visibility
    visible_when: Optional[str] = None  # Formula expression
    
class LayoutSection(BaseModel):
    """Layout section"""
    id: str
    label: str
    columns: int = 2  # 1 or 2
    collapsible: bool = False
    collapsed_by_default: bool = False
    items: List[LayoutItem] = []
    display_order: int = 0
    
class LayoutTab(BaseModel):
    """Layout tab"""
    id: str
    label: str
    sections: List[LayoutSection] = []
    display_order: int = 0
    
class PageLayout(BaseModel):
    """Complete page layout configuration"""
    id: str
    name: str
    object_type_id: str
    tenant_id: str
    
    # Layout structure
    tabs: List[LayoutTab] = []
    
    # Assignments
    is_default: bool = False
    assigned_record_types: List[str] = []  # Record type IDs
    assigned_profiles: List[str] = []  # Profile IDs (if user management exists)
    
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    created_by: Optional[str] = None
