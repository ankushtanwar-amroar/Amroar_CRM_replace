"""
Conversation Models
"""
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime
from enum import Enum


class MessageRole(str, Enum):
    USER = "user"
    BOT = "bot"
    SYSTEM = "system"


class ConversationStatus(str, Enum):
    ACTIVE = "active"
    RESOLVED = "resolved"
    ESCALATED = "escalated"
    ABANDONED = "abandoned"


class Message(BaseModel):
    id: str
    role: MessageRole
    content: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    metadata: Dict[str, Any] = {}


class Conversation(BaseModel):
    id: str
    bot_id: str
    tenant_id: str
    channel: str
    user_identifier: Optional[str] = None  # email, phone, or session ID
    
    messages: List[Message] = []
    
    status: ConversationStatus = ConversationStatus.ACTIVE
    
    # Analytics
    intent_detected: Optional[str] = None
    confidence_score: Optional[float] = None
    handoff_requested: bool = False
    handoff_reason: Optional[str] = None
    csat_score: Optional[int] = None  # 1-5
    
    # Context
    user_context: Dict[str, Any] = {}  # Detected CRM record info
    collected_data: Dict[str, Any] = {}  # Data collected via conversational forms
    
    # Metadata
    started_at: datetime = Field(default_factory=datetime.utcnow)
    ended_at: Optional[datetime] = None
    duration_seconds: Optional[int] = None


class ConversationCreate(BaseModel):
    bot_id: str
    channel: str
    user_identifier: Optional[str] = None
    initial_message: Optional[str] = None


class ConversationMetrics(BaseModel):
    total_conversations: int
    active_conversations: int
    resolved_count: int
    resolved_percentage: float
    handoff_count: int
    handoff_percentage: float
    avg_csat: Optional[float]
    avg_duration_seconds: Optional[float]
    top_intents: List[Dict[str, Any]]
    failed_queries: int
    
    period_start: datetime
    period_end: datetime
