from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime

class TabData(BaseModel):
    """Single tab data"""
    id: str
    title: str
    type: str  # 'record', 'list', 'custom'
    object_type: Optional[str] = None
    record_id: Optional[str] = None
    public_id: Optional[str] = None
    icon: Optional[str] = None
    url: Optional[str] = None
    closeable: bool = True
    is_active: bool = False

class WorkspaceState(BaseModel):
    """User workspace state"""
    id: str
    user_id: str
    tenant_id: str
    app_id: Optional[str] = None
    
    # Primary tabs
    primary_tabs: List[TabData] = []
    active_primary_tab_id: Optional[str] = None
    
    # Subtabs organized by primary tab
    subtabs: Dict[str, List[TabData]] = {}  # {primary_tab_id: [subtabs]}
    active_subtab_ids: Dict[str, str] = {}  # {primary_tab_id: active_subtab_id}
    
    # Metadata
    last_updated: datetime = Field(default_factory=datetime.utcnow)
    created_at: datetime = Field(default_factory=datetime.utcnow)

class WorkspaceAction(BaseModel):
    """Workspace action request"""
    action: str  # 'open_primary', 'open_subtab', 'close_tab', 'reorder', 'set_active'
    tab_data: Optional[Dict[str, Any]] = None
    tab_id: Optional[str] = None
    parent_tab_id: Optional[str] = None
    new_order: Optional[List[str]] = None
