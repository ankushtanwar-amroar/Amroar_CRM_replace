"""
Survey Builder V2 Models
Complete survey system with all question types, logic, and AI integration
"""
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any, Literal
from datetime import datetime
from enum import Enum


class QuestionType(str, Enum):
    SHORT_TEXT = "short_text"
    LONG_TEXT = "long_text"
    MULTIPLE_CHOICE = "multiple_choice"
    CHECKBOX = "checkbox"
    DROPDOWN = "dropdown"
    RATING = "rating"
    NPS = "nps"
    LIKERT = "likert"
    YES_NO = "yes_no"
    DATE = "date"
    FILE_UPLOAD = "file_upload"
    MATRIX = "matrix"
    PAGE_BREAK = "page_break"


class SurveyStatus(str, Enum):
    DRAFT = "draft"
    ACTIVE = "active"
    PAUSED = "paused"
    CLOSED = "closed"


class LogicOperator(str, Enum):
    EQUALS = "equals"
    NOT_EQUALS = "not_equals"
    CONTAINS = "contains"
    GREATER_THAN = "greater_than"
    LESS_THAN = "less_than"
    IS_ANSWERED = "is_answered"
    IS_NOT_ANSWERED = "is_not_answered"


class QuestionOption(BaseModel):
    id: str
    label: str
    value: str


class LogicRule(BaseModel):
    """Conditional branching and skip logic"""
    id: str
    condition_question_id: str
    operator: LogicOperator
    value: Any
    action: Literal["show", "hide", "skip_to", "end_survey"]
    target_question_id: Optional[str] = None
    target_page: Optional[int] = None


class Question(BaseModel):
    id: str
    type: QuestionType
    label: str
    description: Optional[str] = None
    required: bool = False
    order: int
    page: int = 1
    
    # Options for choice-based questions
    options: List[QuestionOption] = []
    
    # Rating/NPS config
    min_value: int = 0
    max_value: int = 10
    min_label: Optional[str] = None
    max_label: Optional[str] = None
    
    # Likert scale labels
    likert_labels: List[str] = ["Strongly Disagree", "Disagree", "Neutral", "Agree", "Strongly Agree"]
    
    # Matrix config
    matrix_rows: List[str] = []
    matrix_columns: List[str] = []
    
    # Logic rules for this question
    logic_rules: List[LogicRule] = []
    
    # Validation
    min_length: Optional[int] = None
    max_length: Optional[int] = None
    
    # File upload config
    allowed_file_types: List[str] = []
    max_file_size_mb: int = 10


class Branding(BaseModel):
    logo_url: Optional[str] = None
    backgroundColor: str = "#f8fafc"
    cardBackgroundColor: str = "#ffffff"
    primaryColor: str = "#4f46e5"
    textColor: str = "#1e293b"
    buttonColor: str = "#10b981"
    fontFamily: str = "Inter, system-ui, sans-serif"
    layout: str = "1-column"  # 1-column, 2-column, 3-column
    header_text: Optional[str] = None
    footer_text: Optional[str] = None


class Distribution(BaseModel):
    public_link: Optional[str] = None
    qr_code_url: Optional[str] = None
    allow_anonymous: bool = True
    require_crm_contact: bool = False
    max_responses: Optional[int] = None
    close_date: Optional[str] = None
    is_expired: bool = False
    embed_code: Optional[str] = None


class NotificationSettings(BaseModel):
    email_alerts: bool = False
    email_recipients: List[str] = []
    slack_webhook: Optional[str] = None
    teams_webhook: Optional[str] = None
    low_score_alert: bool = False
    low_score_threshold: int = 5
    daily_digest: bool = False
    weekly_digest: bool = False


class CRMIntegration(BaseModel):
    enabled: bool = False
    link_to_contacts: bool = False
    create_tasks_on_negative: bool = False
    negative_threshold: int = 5
    trigger_workflows: bool = False
    workflow_ids: List[str] = []
    auto_tag: bool = False
    tag_rules: Dict[str, Any] = {}


class ProFeatures(BaseModel):
    expiry_date: Optional[str] = None
    response_quota: Optional[int] = None
    team_collaboration: bool = False
    team_members: List[str] = []
    version_history: bool = False
    ab_testing: bool = False
    ab_variants: List[Dict[str, Any]] = []


class SurveyStep(BaseModel):
    id: str
    title: str
    questions: List[Question] = []

class Survey(BaseModel):
    id: str
    tenant_id: str
    created_by: str
    title: str
    description: Optional[str] = None
    status: SurveyStatus = SurveyStatus.DRAFT
    
    # Multi-step support (like Form Builder)
    steps: List[SurveyStep] = []
    
    # Legacy support
    questions: List[Question] = []
    
    settings: Dict[str, Any] = {}  # Contains theme and layout
    branding: Branding = Branding()
    distribution: Distribution = Distribution()
    notifications: NotificationSettings = NotificationSettings()
    crm_integration: CRMIntegration = CRMIntegration()
    pro_features: ProFeatures = ProFeatures()
    
    # Multi-page support
    total_pages: int = 1
    
    # Stats
    total_responses: int = 0
    completed_responses: int = 0
    completion_rate: float = 0.0
    drop_off_rate: float = 0.0
    average_time_seconds: int = 0
    
    # AI metadata
    ai_generated: bool = False
    ai_prompt: Optional[str] = None
    ai_insights: Optional[Dict[str, Any]] = None
    
    created_at: str
    updated_at: str


class SurveyResponse(BaseModel):
    id: str
    survey_id: str
    tenant_id: str
    
    answers: Dict[str, Any]  # question_id -> answer
    
    respondent_email: Optional[str] = None
    respondent_name: Optional[str] = None
    crm_contact_id: Optional[str] = None
    
    completed: bool = False
    completion_time_seconds: Optional[int] = None
    
    # Analytics
    started_at: str
    completed_at: Optional[str] = None
    last_page_reached: int = 1
    
    # AI sentiment analysis
    ai_sentiment: Optional[str] = None  # positive, neutral, negative
    ai_tags: List[str] = []
    
    # Metadata
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    referrer: Optional[str] = None


class AICommand(BaseModel):
    command: str
    survey_id: Optional[str] = None
    context: Optional[Dict[str, Any]] = None
