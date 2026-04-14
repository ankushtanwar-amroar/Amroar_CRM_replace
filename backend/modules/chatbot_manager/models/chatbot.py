"""
Chatbot Models
Pydantic models for chatbot manager
"""
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime
from enum import Enum


class BotStatus(str, Enum):
    ACTIVE = "active"
    PAUSED = "paused"
    DRAFT = "draft"


class BotTone(str, Enum):
    PROFESSIONAL = "professional"
    FRIENDLY = "friendly"
    CONVERSATIONAL = "conversational"


class ChannelType(str, Enum):
    WEB = "web"
    WHATSAPP = "whatsapp"
    SLACK = "slack"
    TEAMS = "teams"


class KnowledgeSourceType(str, Enum):
    WEBSITE = "website"
    FILE = "file"
    CRM_OBJECT = "crm_object"
    FAQ = "faq"


class ResponseStrategy(str, Enum):
    KNOWLEDGE = "knowledge"
    CRM_ACTION = "crm_action"
    ESCALATE = "escalate"
    COLLECT_DETAILS = "collect_details"


class IdentitySource(str, Enum):
    LEAD = "lead"
    CONTACT = "contact"
    ACCOUNT = "account"


class KnowledgeSource(BaseModel):
    id: str
    type: KnowledgeSourceType
    name: str
    config: Dict[str, Any] = {}
    indexed_at: Optional[datetime] = None
    index_status: str = "pending"  # pending, indexing, indexed, failed
    document_count: int = 0


class KnowledgeSourceCreate(BaseModel):
    source_type: KnowledgeSourceType
    name: str
    config: Dict[str, Any] = {}


class Intent(BaseModel):
    id: str
    name: str
    example_phrases: List[str] = []
    response_strategy: ResponseStrategy
    response_config: Dict[str, Any] = {}
    confidence_threshold: float = 0.7
    enabled: bool = True


class Channel(BaseModel):
    type: ChannelType
    enabled: bool = False
    config: Dict[str, Any] = {}


class ConversationalField(BaseModel):
    name: str
    label: str
    type: str  # text, email, phone, number, date
    required: bool = True
    validation: Optional[str] = None
    crm_field: Optional[str] = None


class PersonaConfig(BaseModel):
    identity_source: IdentitySource = IdentitySource.CONTACT
    readable_fields: List[str] = []
    identity_detection_fields: List[str] = ["email", "phone"]


class Chatbot(BaseModel):
    id: str
    tenant_id: str
    name: str
    description: Optional[str] = ""
    avatar_url: Optional[str] = None
    tone: BotTone = BotTone.CONVERSATIONAL
    welcome_message: str = "Hello! How can I help you today?"
    fallback_message: str = "I'm not sure I understand. Could you rephrase that?"
    status: BotStatus = BotStatus.DRAFT
    
    # Model Settings
    model: str = "gemini-2.5-flash"
    temperature: float = 0.7
    max_tokens: int = 500
    
    # Persona & Data Context
    persona: PersonaConfig = PersonaConfig()
    
    # Knowledge Sources
    knowledge_sources: List[KnowledgeSource] = []
    
    # Channels
    channels: List[Channel] = []
    
    # Intents
    intents: List[Intent] = []
    
    # Settings
    handoff_config: Dict[str, Any] = {}
    escalation_enabled: bool = False
    daily_summary_email: Optional[str] = None
    
    # Metrics
    total_conversations: int = 0
    resolved_count: int = 0
    handoff_count: int = 0
    avg_csat: Optional[float] = None
    last_activity: Optional[datetime] = None
    
    # Metadata
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    created_by: str
    updated_by: str


class ChatbotCreate(BaseModel):
    name: str
    description: Optional[str] = ""
    avatar_url: Optional[str] = None
    tone: BotTone = BotTone.CONVERSATIONAL
    welcome_message: str = "Hello! How can I help you today?"
    fallback_message: str = "I'm not sure I understand. Could you rephrase that?"
    model: str = "gemini-2.5-flash"
    temperature: float = 0.7
    max_tokens: int = 500


class ChatbotUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    avatar_url: Optional[str] = None
    tone: Optional[BotTone] = None
    welcome_message: Optional[str] = None
    fallback_message: Optional[str] = None
    status: Optional[BotStatus] = None
    model: Optional[str] = None
    temperature: Optional[float] = None
    max_tokens: Optional[int] = None
    persona: Optional[PersonaConfig] = None
    knowledge_sources: Optional[List[KnowledgeSource]] = None
    channels: Optional[List[Channel]] = None
    intents: Optional[List[Intent]] = None
    handoff_config: Optional[Dict[str, Any]] = None
    escalation_enabled: Optional[bool] = None
    daily_summary_email: Optional[str] = None
