"""
Flow Builder Models
MongoDB schemas for flows and executions
"""
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum


class FlowStatus(str, Enum):
    DRAFT = "draft"
    ACTIVE = "active"
    INACTIVE = "inactive"
    ARCHIVED = "archived"


class TriggerType(str, Enum):
    DB = "db"
    WEBHOOK = "webhook"
    SCHEDULE = "schedule"
    MANUAL = "manual"


class NodeType(str, Enum):
    # Core
    ACTION = "action"
    CONNECTOR = "connector"
    MCP = "mcp"
    AI_PROMPT = "ai_prompt"
    END = "end"
    # Logic & Control Flow
    CONDITION = "condition"
    DECISION = "decision"
    ASSIGNMENT = "assignment"
    LOOP = "loop"
    WAIT = "wait"
    DELAY = "delay"  # NEW: Salesforce-like delay/pause
    MERGE = "merge"
    # Error Handling (Salesforce parity)
    CUSTOM_ERROR = "custom_error"  # NEW: Custom Error node - terminates flow with error message
    # Data Operations
    TRANSFORM = "transform"
    COLLECTION_SORT = "collection_sort"
    COLLECTION_FILTER = "collection_filter"
    # External Integrations
    HTTP_REQUEST = "http_request"
    WEBHOOK = "webhook"
    DATABASE = "database"
    GOOGLE_SHEETS = "google_sheets"
    SLACK = "slack"
    TEAMS = "teams"
    # Records
    GET_RECORDS = "get_records"
    # Custom
    FUNCTION = "function"


class ExecutionStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    WAITING = "waiting"  # NEW: For delayed executions
    SUCCESS = "success"
    FAILED = "failed"
    PARTIAL = "partial"


# Trigger Models
class DbTrigger(BaseModel):
    entity: str  # Lead, Contact, Account, etc.
    event: str  # afterInsert, afterUpdate, afterDelete
    filter_conditions: Optional[Dict[str, Any]] = None  # e.g., {"source": "Website"}


class WebhookTrigger(BaseModel):
    slug: str  # Unique webhook identifier (for outgoing webhooks)
    method: str = "POST"  # HTTP method


class IncomingWebhookTrigger(BaseModel):
    """Incoming Webhook Trigger - allows external systems to trigger flows"""
    webhook_secret: str  # Auto-generated secret for validation
    rate_limit: int = 10  # Requests per minute
    enabled: bool = True  # Allow enable/disable
    last_triggered_at: Optional[datetime] = None


class ScheduledTriggerConfig(BaseModel):
    """Scheduled Trigger Configuration - runs flows on schedule"""
    schedule_type: str  # "one_time" or "recurring"
    
    # One-time schedule fields
    scheduled_date: Optional[str] = None  # ISO date string
    scheduled_time: Optional[str] = None  # HH:MM format
    
    # Recurring schedule fields
    frequency: Optional[str] = None  # "daily", "weekly", "monthly"
    interval: int = 1  # Every X days/weeks/months
    days_of_week: Optional[List[int]] = None  # [0-6] for Monday-Sunday (weekly only)
    time_of_day: Optional[str] = None  # HH:MM format
    
    # Common fields
    timezone: str = "UTC"
    enabled: bool = True
    last_executed_at: Optional[datetime] = None
    next_execution_at: Optional[datetime] = None


class ScheduleTrigger(BaseModel):
    cron: str  # Cron expression
    timezone: str = "UTC"


class Trigger(BaseModel):
    id: str
    type: str  # Changed from TriggerType enum to string for flexibility
    config: Dict[str, Any]  # DbTrigger, WebhookTrigger, or ScheduleTrigger
    match_mode: str = "every_time"  # NEW: "every_time" or "first_time_only"


# Node Models
class Node(BaseModel):
    id: str
    type: str  # Changed from NodeType enum to string for flexibility
    label: str
    config: Dict[str, Any]  # Configuration specific to node type
    position: Dict[str, float] = {"x": 0, "y": 0}  # For UI positioning
    data: Optional[Dict[str, Any]] = None  # Additional node data (includes loopContext)
    loopContext: Optional[Dict[str, Any]] = None  # Loop context for For Each branch nodes


class Edge(BaseModel):
    id: str
    source: str  # Source node ID
    target: str  # Target node ID
    sourceHandle: Optional[str] = None
    targetHandle: Optional[str] = None
    label: Optional[str] = None


class FlowVariable(BaseModel):
    name: str
    type: str  # string, number, boolean, object
    default_value: Optional[Any] = None
    description: Optional[str] = None


class InputVariable(BaseModel):
    """Input variables for Manual Run execution"""
    name: str  # Variable name (unique within flow)
    label: str  # UI display label
    dataType: str  # String, Number, Boolean, Date, DateTime
    required: bool = False
    defaultValue: Optional[Any] = None
    description: Optional[str] = None


# Main Flow Model
class Flow(BaseModel):
    id: Optional[str] = None
    tenant_id: str
    name: str
    description: Optional[str] = None
    flow_type: Optional[str] = "trigger"  # trigger, screen, scheduled, webhook
    launch_mode: Optional[str] = None  # For Screen Flows: basic, record_detail, list_view
    screen_flow_object: Optional[str] = None  # For record_detail/list_view modes: Lead, Contact, Account, etc.
    version: int = 1
    status: FlowStatus = FlowStatus.DRAFT
    triggers: List[Trigger] = []
    nodes: List[Node] = []
    edges: List[Edge] = []
    variables: List[FlowVariable] = []
    input_variables: List[InputVariable] = []  # NEW: Input variables for manual run
    batch_size: Optional[int] = None  # NEW: Batch size for flow execution (1-500, default 50)
    permissions: Dict[str, List[str]] = {}  # role: [actions]
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    created_by: Optional[str] = None
    updated_by: Optional[str] = None
    
    # Version Control Fields (Salesforce-like)
    parent_flow_id: Optional[str] = None  # Links all versions together (null for v1)
    version_label: Optional[str] = None  # Optional: "v1", "v2", etc.


class FlowCreate(BaseModel):
    name: str
    description: Optional[str] = None
    flow_type: Optional[str] = "trigger"  # trigger, screen, scheduled, webhook
    launch_mode: Optional[str] = None  # For Screen Flows: basic, record_detail, list_view
    screen_flow_object: Optional[str] = None  # For record_detail/list_view modes
    triggers: List[Trigger] = []
    nodes: List[Node] = []
    edges: List[Edge] = []
    variables: List[FlowVariable] = []
    input_variables: List[InputVariable] = []  # NEW
    batch_size: Optional[int] = None  # NEW: Batch size for flow execution


class FlowUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    flow_type: Optional[str] = None
    launch_mode: Optional[str] = None
    screen_flow_object: Optional[str] = None  # For record_detail/list_view modes
    status: Optional[FlowStatus] = None
    triggers: Optional[List[Trigger]] = None
    nodes: Optional[List[Node]] = None
    edges: Optional[List[Edge]] = None
    variables: Optional[List[FlowVariable]] = None
    input_variables: Optional[List[InputVariable]] = None  # NEW
    batch_size: Optional[int] = None  # NEW: Batch size for flow execution


# Execution Models
class NodeExecution(BaseModel):
    node_id: str
    node_type: str  # Changed from NodeType enum to string
    step_number: Optional[int] = None  # Sequential execution order (1, 2, 3...)
    display_name: Optional[str] = None  # User label OR fallback to node name
    category: Optional[str] = None  # Trigger, Get, Assignment, Loop, Update, etc.
    started_at: datetime
    completed_at: Optional[datetime] = None
    status: str  # Changed from ExecutionStatus enum to string
    input: Optional[Dict[str, Any]] = None
    output: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    retry_count: int = 0


class FlowExecution(BaseModel):
    id: Optional[str] = None
    flow_id: str
    flow_version: int
    tenant_id: str
    trigger_type: str  # Changed from TriggerType enum to string
    trigger_data: Optional[Dict[str, Any]] = None
    input_variables: Optional[Dict[str, Any]] = None  # NEW: Stores input values for manual runs
    status: str  # Changed from ExecutionStatus enum to string
    started_at: datetime
    completed_at: Optional[datetime] = None
    node_executions: List[NodeExecution] = []
    context: Dict[str, Any] = {}  # Runtime variables
    error: Optional[str] = None
    retry_count: int = 0


class FlowExecutionCreate(BaseModel):
    flow_id: str
    trigger_type: str  # Changed from TriggerType enum to string
    trigger_data: Optional[Dict[str, Any]] = None
    context: Optional[Dict[str, Any]] = {}


# Response Models
class FlowListResponse(BaseModel):
    flows: List[Flow]
    total: int
    page: int
    limit: int
    total_pages: Optional[int] = None


class ExecutionListResponse(BaseModel):
    executions: List[FlowExecution]
    total: int
    page: int
    limit: int


# NEW: Delayed Execution Model (for pause/resume)
class DelayedExecution(BaseModel):
    id: str
    execution_id: str
    flow_id: str
    tenant_id: str
    current_node_id: str
    resume_at: datetime
    delay_duration_seconds: int
    created_at: datetime
    status: str = "waiting"  # waiting, resumed, cancelled


# NEW: Trigger Fire History (for first-time-only mode)
class TriggerFireHistory(BaseModel):
    id: str
    flow_id: str
    flow_version: int
    trigger_id: str
    record_id: str  # The record that triggered the flow
    fired_at: datetime
    tenant_id: str


# NEW: Webhook Execution Log (for incoming webhook triggers)
class WebhookExecutionLog(BaseModel):
    """Log entry for incoming webhook triggers"""
    id: str
    flow_id: str
    flow_name: str
    webhook_url: str
    payload: Dict[str, Any]
    headers: Dict[str, str]
    status: str  # success, failed
    http_status: int  # 200, 400, 500, etc.
    execution_id: Optional[str] = None  # Link to flow execution
    error_message: Optional[str] = None
    execution_time_ms: int  # Milliseconds
    timestamp: datetime
    tenant_id: str
