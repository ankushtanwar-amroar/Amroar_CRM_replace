"""
CLU-BOT Pydantic Models
Defines schemas for conversations, actions, and execution journal.
"""
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List, Literal
from datetime import datetime
from enum import Enum
import uuid


class ActionType(str, Enum):
    """Supported CLU-BOT action types"""
    # Phase 1
    SEARCH_RECORDS = "search_records"
    RECORD_SUMMARY = "record_summary"
    CREATE_LEAD = "create_lead"
    ADD_NOTE = "add_note"
    CREATE_TASK = "create_task"
    CREATE_RECORD = "create_record"
    CLARIFICATION = "clarification"
    NO_ACTION = "no_action"
    # Phase 2A
    UPDATE_RECORD = "update_record"
    CREATE_LIST_VIEW = "create_list_view"
    UPDATE_LIST_VIEW = "update_list_view"
    # Phase 2B - Analytics
    GENERATE_REPORT = "generate_report"
    COMPARE_METRICS = "compare_metrics"
    FIND_INSIGHTS = "find_insights"
    # Phase 3 - Dashboards, Trends, Forecasting
    CREATE_DASHBOARD = "create_dashboard"
    TREND_ANALYSIS = "trend_analysis"
    PIPELINE_FORECAST = "pipeline_forecast"
    # Phase 4 - External Context & Connectors
    READ_FILE = "read_file"
    FETCH_URL = "fetch_url"
    ANALYZE_WITH_CONTEXT = "analyze_with_context"
    # Phase 5 - Bulk Operations
    BULK_UPDATE_RECORDS = "bulk_update_records"
    BULK_CREATE_TASKS = "bulk_create_tasks"
    BULK_CREATE_RECORDS = "bulk_create_records"
    SEND_EMAIL = "send_email"
    DRAFT_EMAIL = "draft_email"


class RiskLevel(str, Enum):
    """Risk levels for actions requiring preview"""
    LOW = "low"        # Direct execution (search, view)
    MEDIUM = "medium"  # Preview recommended (create)
    HIGH = "high"      # Preview required (update, delete - Phase 2)


class ExecutionStatus(str, Enum):
    """Status of action execution"""
    PENDING = "pending"
    PREVIEWING = "previewing"
    CONFIRMED = "confirmed"
    EXECUTED = "executed"
    CANCELLED = "cancelled"
    FAILED = "failed"
    ROLLED_BACK = "rolled_back"


# =============================================================================
# Action Payload Models (Deterministic Execution)
# =============================================================================

class SearchRecordsPayload(BaseModel):
    """Payload for searching records"""
    object_type: str = Field(..., description="Object to search: lead, contact, account, opportunity, task, event, file, note")
    query: str = Field(default="", description="Search query text")
    filters: Optional[Dict[str, Any]] = Field(default=None, description="Additional filters")
    limit: int = Field(default=10, ge=1, le=50)


class RecordSummaryPayload(BaseModel):
    """Payload for getting a record summary"""
    object_type: str = Field(..., description="Object type")
    record_id: str = Field(..., description="Record ID or series_id")
    user_query: Optional[str] = Field(default=None, description="The user's specific question about the record")
    include_all: bool = Field(default=False, description="Whether to include all related records (deep summary)")
    skip_discovery: bool = Field(default=False, description="Whether to skip the proactive discovery question and just give the standard summary")


class CreateLeadPayload(BaseModel):
    """Payload for creating a lead"""
    model_config = {"extra": "allow"}
    # Optional during multi-turn; orchestrator enforces metadata-required fields before execute.
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    company: Optional[str] = None
    lead_source: Optional[str] = None
    status: str = Field(default="New")
    description: Optional[str] = None


class AddNotePayload(BaseModel):
    """Payload for adding a note to a record"""
    model_config = {"extra": "allow"}
    title: str = Field(..., min_length=1)
    body: Optional[str] = None
    linked_entity_type: str = Field(..., description="Object type to link: lead, contact, account, opportunity")
    linked_entity_id: str = Field(..., description="Record ID to link note to")


class CreateTaskPayload(BaseModel):
    """Payload for creating a task"""
    model_config = {"extra": "allow"}
    subject: Optional[str] = None
    description: Optional[str] = None
    due_date: Optional[str] = None
    priority: str = Field(default="Normal")
    status: str = Field(default="Not Started")
    related_to: Optional[str] = Field(default=None, description="Record ID to relate task to")
    related_type: Optional[str] = Field(default=None, description="Object type of related record")
    assigned_to: Optional[str] = Field(default=None, description="User ID to assign task to")


class CreateRecordPayload(BaseModel):
    """Payload for creating a generic record (contact, account, opportunity, event)"""
    model_config = {"extra": "allow"}
    object_type: str = Field(..., description="Object type: contact, account, opportunity, event")
    fields: Dict[str, Any] = Field(
        default_factory=dict,
        description="Field-value pairs for the new record",
    )


class ClarificationPayload(BaseModel):
    """Payload when CLU-BOT needs more information"""
    question: str = Field(..., description="Question to ask the user")
    options: Optional[List[str]] = Field(default=None, description="Suggested options if applicable")


# =============================================================================
# Phase 2A Payload Models
# =============================================================================

class UpdateRecordPayload(BaseModel):
    """Payload for updating a CRM record via the same path as PUT /api/objects/.../records/..."""
    object_type: str = Field(
        ...,
        description="Object API name: lead, contact, account, opportunity, task, event",
    )
    record_id: str = Field(..., description="Record ID, series_id, or resolvable name")
    updates: Dict[str, Any] = Field(
        default_factory=dict,
        description="data.* fields to merge into the record",
    )
    owner_id: Optional[str] = Field(
        default=None,
        description="New record owner user id (top-level owner, not task assignee)",
    )
    owner_name: Optional[str] = Field(
        default=None,
        description="New owner name to resolve to a user in the tenant",
    )

class BulkUpdateRecordsPayload(BaseModel):
    """Payload for bulk updating matching records"""
    object_type: str = Field(..., description="Object API name: lead, contact, account, opportunity, task, event")
    filters: Dict[str, Any] = Field(default_factory=dict, description="Search filters used to select target records")
    updates: Dict[str, Any] = Field(default_factory=dict, description="Field updates to apply to all matched records")
    owner_id: Optional[str] = Field(default=None, description="Optional new owner user id")
    owner_name: Optional[str] = Field(default=None, description="Optional owner name to resolve to a tenant user")
    limit: int = Field(default=100, ge=1, le=500, description="Safety cap for number of records to update")


class BulkCreateTasksPayload(BaseModel):
    """Payload for creating tasks for a set of matched records"""
    target_object_type: str = Field(..., description="Object to create tasks for: lead, contact, account, opportunity")
    target_filters: Dict[str, Any] = Field(default_factory=dict, description="Filters to select target records")
    subject_template: str = Field(default="Follow up: {name}", description="Task subject template; supports {name}")
    description_template: Optional[str] = Field(default=None, description="Optional task description template")
    due_date: Optional[str] = Field(default=None, description="YYYY-MM-DD")
    priority: str = Field(default="Normal", description="High|Normal|Low")
    status: str = Field(default="Not Started", description="Not Started|In Progress|Completed")
    assigned_to: Optional[str] = Field(default=None, description="Optional user id to assign all tasks")
    owner_name: Optional[str] = Field(default=None, description="Optional owner name to resolve if assigned_to is absent")
    limit: int = Field(default=100, ge=1, le=500, description="Safety cap for number of tasks to create")


class BulkCreateRecordsPayload(BaseModel):
    """Payload for bulk creating CRM records"""
    object_type: str = Field(..., description="Object API name: lead, contact, account, opportunity, task, event")
    records: List[Dict[str, Any]] = Field(default_factory=list, description="List of field maps to create")
    limit: int = Field(default=100, ge=1, le=500, description="Safety cap for number of records to create")


class SendEmailPayload(BaseModel):
    """Payload for sending email through CRM email module"""
    to_emails: Optional[List[str]] = Field(default=None, description="Primary recipients")
    cc_emails: Optional[List[str]] = Field(default=None, description="CC recipients")
    bcc_emails: Optional[List[str]] = Field(default=None, description="BCC recipients")
    subject: Optional[str] = Field(default=None, description="Email subject")
    body: Optional[str] = Field(default=None, description="Email body (HTML/text)")
    related_record_type: Optional[str] = Field(default=None, description="Related record object type")
    related_record_id: Optional[str] = Field(default=None, description="Related record id/name/series id")
    send_to_owner: bool = Field(default=False, description="Send to related record owner email")
    email_all_open_opportunity_owners: bool = Field(default=False, description="Send to all owners of open opportunities")
    include_next_steps: bool = Field(default=False, description="Include opportunity next-step summary in body")


class DraftEmailPayload(BaseModel):
    """Payload for drafting email through CRM email module"""
    to_emails: Optional[List[str]] = Field(default=None, description="Primary recipients")
    cc_emails: Optional[List[str]] = Field(default=None, description="CC recipients")
    bcc_emails: Optional[List[str]] = Field(default=None, description="BCC recipients")
    subject: Optional[str] = Field(default=None, description="Email subject")
    body: Optional[str] = Field(default=None, description="Email body")
    related_record_type: Optional[str] = Field(default=None, description="Related record object type")
    related_record_id: Optional[str] = Field(default=None, description="Related record id/name/series id")
    send_to_owner: bool = Field(default=False, description="Draft for record owner recipient")


class ListViewFilterCondition(BaseModel):
    """A single filter condition for a list view"""
    field: str = Field(..., description="Field name to filter on")
    operator: str = Field(..., description="Operator: equals, not_equals, contains, starts_with, greater_than, less_than, is_empty, is_not_empty")
    value: Optional[Any] = Field(default=None, description="Value to compare against")


class CreateListViewPayload(BaseModel):
    """Payload for creating a list view"""
    object_type: str = Field(..., description="Object type for the list view")
    name: str = Field(..., min_length=1, description="Name of the list view")
    description: Optional[str] = Field(default=None, description="Description of the list view")
    filters: List[ListViewFilterCondition] = Field(default_factory=list, description="Filter conditions")
    filter_logic: str = Field(default="AND", description="Logic for combining filters: AND, OR")
    columns: Optional[List[str]] = Field(default=None, description="Columns to display")
    sort_field: Optional[str] = Field(default=None, description="Field to sort by")
    sort_order: str = Field(default="desc", description="Sort order: asc, desc")
    visibility: str = Field(default="private", description="Visibility: private, shared, team")
    is_default: bool = Field(default=False, description="Whether this should be the default list view")


class UpdateListViewPayload(BaseModel):
    """Payload for updating an existing user list view"""
    list_view_id: Optional[str] = Field(default=None, description="List view ID")
    object_type: Optional[str] = Field(default=None, description="Object type context for name lookup")
    current_name: Optional[str] = Field(default=None, description="Existing list view name to locate")
    name: Optional[str] = Field(default=None, description="New list view name")
    description: Optional[str] = Field(default=None, description="Description")
    filters: Optional[List[ListViewFilterCondition]] = Field(default=None, description="Replace filter conditions")
    filter_logic: Optional[str] = Field(default=None, description="AND or OR")
    columns: Optional[List[str]] = Field(default=None, description="Replace selected columns")
    sort_field: Optional[str] = Field(default=None, description="Sort field")
    sort_order: Optional[str] = Field(default=None, description="asc or desc")
    visibility: Optional[str] = Field(default=None, description="private, shared, team")
    is_default: Optional[bool] = Field(default=None, description="Set/unset as default view")


# =============================================================================
# Phase 2B Payload Models - Analytics
# =============================================================================

class GenerateReportPayload(BaseModel):
    """Payload for generating analytics reports"""
    report_type: str = Field(..., description="Type: revenue, pipeline, leads, opportunities, activities, conversion, kpi, sentiment")
    period: str = Field(default="month", description="Period: day, week, month, quarter, year, custom")
    start_date: Optional[str] = Field(default=None, description="Start date for custom period (YYYY-MM-DD)")
    end_date: Optional[str] = Field(default=None, description="End date for custom period (YYYY-MM-DD)")
    group_by: Optional[str] = Field(default=None, description="Group by: owner, stage, source, status, month, week")
    object_type: Optional[str] = Field(default=None, description="Object type to report on")
    filters: Optional[Dict[str, Any]] = Field(default=None, description="Additional filters")


class CompareMetricsPayload(BaseModel):
    """Payload for comparing metrics between periods"""
    metric_type: str = Field(..., description="Metric: revenue, pipeline_value, lead_count, opportunity_count, account_count, activity_count, won_deals, conversion_rate, win_rate")
    period_1: str = Field(..., description="First period: this_month, last_month, this_quarter, last_quarter, this_year, last_year")
    period_2: str = Field(..., description="Second period to compare against")
    object_type: Optional[str] = Field(default=None, description="Object type for the comparison")
    group_by: Optional[str] = Field(default=None, description="Group by: owner, stage, source")


class InsightType(str, Enum):
    """Types of CRM insights"""
    INACTIVE_LEADS = "inactive_leads"
    STALE_OPPORTUNITIES = "stale_opportunities"
    SLIPPING_DEALS = "slipping_deals"
    TOP_PERFORMERS = "top_performers"
    AT_RISK_ACCOUNTS = "at_risk_accounts"
    OVERDUE_TASKS = "overdue_tasks"
    UPCOMING_RENEWALS = "upcoming_renewals"
    HIGH_VALUE_LEADS = "high_value_leads"


class FindInsightsPayload(BaseModel):
    """Payload for finding CRM insights"""
    insight_type: str = Field(..., description="Type of insight to find")
    days_threshold: int = Field(default=30, ge=1, le=365, description="Days threshold for inactivity/staleness")
    limit: int = Field(default=10, ge=1, le=100, description="Maximum results to return")
    filters: Optional[Dict[str, Any]] = Field(default=None, description="Additional filters")


# =============================================================================
# Phase 3 Payload Models - Dashboards, Trends, Forecasting
# =============================================================================

class DashboardWidgetConfig(BaseModel):
    """Configuration for a single dashboard widget"""
    widget_type: str = Field(..., description="Type: metric_card, bar_chart, line_chart, pie_chart, table, list")
    title: str = Field(..., description="Widget title")
    data_source: str = Field(..., description="Data source: revenue, pipeline, leads, opportunities, activities, conversion")
    period: str = Field(default="month", description="Data period")
    group_by: Optional[str] = Field(default=None, description="Group by dimension")


class CreateDashboardPayload(BaseModel):
    """Payload for creating an AI-generated dashboard"""
    name: str = Field(..., min_length=1, description="Dashboard name")
    dashboard_type: str = Field(..., description="Type: sales_performance, pipeline_overview, lead_management, activity_tracker, custom")
    description: Optional[str] = Field(default=None, description="Dashboard description")
    period: str = Field(default="month", description="Default period for widgets")
    widgets: Optional[List[Dict[str, Any]]] = Field(default=None, description="Custom widget configs (auto-generated if omitted)")


class TrendAnalysisPayload(BaseModel):
    """Payload for time-series trend analysis"""
    metric: str = Field(..., description="Metric: revenue, leads, opportunities, accounts, pipeline_value, activities, won_deals, conversion_rate, win_rate")
    period_count: int = Field(default=6, ge=2, le=24, description="Number of periods to analyze")
    period_type: str = Field(default="month", description="Period granularity: day, week, month, quarter")
    object_type: Optional[str] = Field(default=None, description="Object type filter")
    filters: Optional[Dict[str, Any]] = Field(default=None, description="Additional filters")


class PipelineForecastPayload(BaseModel):
    """Payload for pipeline forecasting"""
    forecast_period: str = Field(default="quarter", description="Forecast horizon: month, quarter, year")
    include_weighted: bool = Field(default=True, description="Include weighted pipeline forecast")
    include_risk_analysis: bool = Field(default=True, description="Include deal risk analysis")
    filters: Optional[Dict[str, Any]] = Field(default=None, description="Additional filters")


# =============================================================================
# Phase 4 Payload Models - External Context & Connectors
# =============================================================================

ALLOWED_FILE_TYPES = {"pdf", "docx", "txt", "csv", "xlsx"}
MAX_FILE_SIZE_MB = 10
MAX_CONTENT_CHARS = 15000  # Safe token limit for LLM context


class ReadFilePayload(BaseModel):
    """Payload for reading and extracting content from an uploaded file"""
    file_id: str = Field(..., min_length=1, description="ID of the uploaded file")
    query: Optional[str] = Field(default=None, description="Specific question about the file content")


class FetchUrlPayload(BaseModel):
    """Payload for fetching and summarizing content from a URL"""
    url: str = Field(..., min_length=1, description="URL to fetch content from")
    query: Optional[str] = Field(default=None, description="Specific question about the URL content")


class AnalyzeWithContextPayload(BaseModel):
    """Payload for combining CRM data with external context"""
    query: str = Field(..., min_length=1, description="Analysis question")
    file_id: Optional[str] = Field(default=None, description="File ID for context")
    url: Optional[str] = Field(default=None, description="URL for context")
    crm_object_type: Optional[str] = Field(default=None, description="CRM object to include: lead, contact, account, opportunity")
    crm_search_term: Optional[str] = Field(default=None, description="Search term for CRM records")


# =============================================================================
# Intent & Action Models
# =============================================================================

class ParsedIntent(BaseModel):
    """Result of intent parsing from user message"""
    action_type: ActionType
    confidence: float = Field(ge=0.0, le=1.0)
    payload: Optional[Dict[str, Any]] = None
    risk_level: RiskLevel = RiskLevel.LOW
    requires_preview: bool = False
    raw_response: Optional[str] = None


class ActionPayload(BaseModel):
    """Validated action payload for execution"""
    action_type: ActionType
    payload: Dict[str, Any]
    risk_level: RiskLevel
    requires_preview: bool
    preview_message: Optional[str] = None


# =============================================================================
# Conversation Models
# =============================================================================

class MessageRole(str, Enum):
    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"


class ConversationMessage(BaseModel):
    """Single message in a conversation"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    role: MessageRole
    content: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    action_payload: Optional[ActionPayload] = None
    execution_result: Optional[Dict[str, Any]] = None


class Conversation(BaseModel):
    """CLU-BOT conversation session"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    user_id: str
    messages: List[ConversationMessage] = Field(default_factory=list)
    context: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    is_active: bool = True


# =============================================================================
# Execution Journal Models (Undo Support)
# =============================================================================

class ExecutionJournalEntry(BaseModel):
    """Entry in the execution journal for undo support"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    user_id: str
    conversation_id: str
    action_type: ActionType
    action_payload: Dict[str, Any]
    status: ExecutionStatus = ExecutionStatus.PENDING
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    created_record_id: Optional[str] = None
    undo_payload: Optional[Dict[str, Any]] = None
    is_undoable: bool = False
    executed_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


# =============================================================================
# API Request/Response Models
# =============================================================================

class ChatRequest(BaseModel):
    """Request to send a message to CLU-BOT"""
    message: str = Field(..., min_length=1, max_length=2000)
    conversation_id: Optional[str] = None
    context: Optional[Dict[str, Any]] = None


class PreviewConfirmRequest(BaseModel):
    """Request to confirm a previewed action"""
    conversation_id: str
    action_id: str
    confirmed: bool


class ChatResponse(BaseModel):
    """Response from CLU-BOT"""
    conversation_id: str
    message: str
    action_type: Optional[ActionType] = None
    requires_confirmation: bool = False
    preview_data: Optional[Dict[str, Any]] = None
    result_data: Optional[Dict[str, Any]] = None
    suggestions: Optional[List[str]] = None


class ExportReportRequest(BaseModel):
    """Request payload for exporting analytics result data."""
    format: Literal["csv", "xlsx", "pdf"] = Field(..., description="Export file format")
    report_data: Dict[str, Any] = Field(..., description="Analytics response payload to export")
    report_name: Optional[str] = Field(default="crm_analytics_report", description="Optional report filename prefix")


class ConversationListResponse(BaseModel):
    """List of user's conversations"""
    conversations: List[Dict[str, Any]]
    total: int
