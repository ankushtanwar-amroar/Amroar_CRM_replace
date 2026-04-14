"""
Action Data Models
Pydantic models for action configuration and execution
"""
from pydantic import BaseModel, Field
from typing import Dict, List, Optional, Any
from datetime import datetime
from enum import Enum
import uuid


class ActionType(str, Enum):
    """Types of actions that can be configured"""
    CREATE_RECORD = "CREATE_RECORD"
    UPDATE_RECORD = "UPDATE_RECORD"
    OPEN_URL = "OPEN_URL"
    RUN_FLOW = "RUN_FLOW"
    # System action types (non-deletable, auto-generated)
    SYSTEM_CREATE = "SYSTEM_CREATE"
    SYSTEM_EDIT = "SYSTEM_EDIT"
    SYSTEM_DELETE = "SYSTEM_DELETE"


class ActionPlacement(str, Enum):
    """Where the action button appears"""
    RECORD_HEADER = "RECORD_HEADER"
    RELATED_LIST = "RELATED_LIST"
    LAYOUT = "LAYOUT"  # Layout-driven placement via Lightning App Builder


class ActionContext(str, Enum):
    """The context in which the action is available"""
    RECORD_DETAIL = "RECORD_DETAIL"  # Available on record detail pages (single record)
    LIST_VIEW = "LIST_VIEW"  # Available on list view pages (single or multiple records)


class ValueType(str, Enum):
    """How field values are determined"""
    STATIC = "STATIC"
    FIELD_REF = "FIELD_REF"


# ============================================
# Type-specific config models
# ============================================

class FieldMapping(BaseModel):
    """Single field mapping for create/update actions"""
    field_api_name: str
    value_type: ValueType = ValueType.STATIC
    value: Optional[str] = None  # Static value or field reference
    required: bool = False
    show_in_modal: bool = True  # For create record - show in form


class CreateRecordConfig(BaseModel):
    """Configuration for Create Record action"""
    target_object: str
    fields: List[FieldMapping] = Field(default_factory=list)
    modal_title: Optional[str] = None


class UpdateRecordConfig(BaseModel):
    """Configuration for Update Record action"""
    field_updates: List[FieldMapping] = Field(default_factory=list)
    show_confirmation: bool = True
    confirmation_message: Optional[str] = "Are you sure you want to update this record?"


class OpenUrlConfig(BaseModel):
    """Configuration for Open URL action"""
    url_template: str  # Supports {{Record.FieldName}}, {{User.Id}} tokens
    open_in_new_tab: bool = True


class RunFlowConfig(BaseModel):
    """Configuration for Run Flow action (Phase 2)"""
    flow_id: str
    flow_name: Optional[str] = None
    input_mappings: List[FieldMapping] = Field(default_factory=list)


# ============================================
# Main Action models
# ============================================

class ActionConfig(BaseModel):
    """Complete action configuration stored in DB"""
    id: str = Field(default_factory=lambda: f"act-{uuid.uuid4().hex[:12]}")
    tenant_id: str
    object_api_name: str
    type: ActionType
    label: str
    api_name: str
    icon: Optional[str] = "Zap"  # Lucide icon name
    placement: ActionPlacement = ActionPlacement.RECORD_HEADER
    action_context: ActionContext = ActionContext.RECORD_DETAIL  # Record Detail or List View
    is_active: bool = True
    is_system: bool = False  # True for system-generated actions (Create, Edit, Delete)
    config_json: Dict[str, Any] = Field(default_factory=dict)  # Type-specific config
    sort_order: int = 0
    created_by: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())


# ============================================
# API Request/Response models
# ============================================

class ActionCreateRequest(BaseModel):
    """Request to create a new action"""
    object_api_name: str
    type: ActionType
    label: str
    api_name: Optional[str] = None  # Auto-generated if not provided
    icon: Optional[str] = "Zap"
    placement: ActionPlacement = ActionPlacement.RECORD_HEADER
    action_context: ActionContext = ActionContext.RECORD_DETAIL
    is_active: bool = True
    config_json: Dict[str, Any] = Field(default_factory=dict)
    sort_order: Optional[int] = None


class ActionUpdateRequest(BaseModel):
    """Request to update an action"""
    label: Optional[str] = None
    icon: Optional[str] = None
    placement: Optional[ActionPlacement] = None
    action_context: Optional[ActionContext] = None
    is_active: Optional[bool] = None
    config_json: Optional[Dict[str, Any]] = None
    sort_order: Optional[int] = None


class ActionResponse(BaseModel):
    """Response model for action"""
    id: str
    object_api_name: str
    type: ActionType
    label: str
    api_name: str
    icon: Optional[str]
    placement: ActionPlacement
    action_context: ActionContext = ActionContext.RECORD_DETAIL
    is_active: bool
    is_system: bool = False
    config_json: Dict[str, Any]
    sort_order: int
    created_by: Optional[str]
    created_at: str
    updated_at: str


class ActionExecuteRequest(BaseModel):
    """Request to execute an action"""
    record_id: str
    record_data: Optional[Dict[str, Any]] = None  # Current record data for field refs
    form_data: Optional[Dict[str, Any]] = None  # User-entered data for create actions


class ActionExecuteResponse(BaseModel):
    """Response from action execution"""
    success: bool
    message: str
    action_type: ActionType
    result: Optional[Dict[str, Any]] = None  # Created record, updated fields, etc.
    redirect_url: Optional[str] = None  # For Open URL actions
