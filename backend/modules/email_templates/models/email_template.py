from pydantic import BaseModel, Field
from typing import Optional, List, Any, Dict
from datetime import datetime, timezone
import uuid


# Block types for the visual editor
class EmailBlock(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    type: str  # text, button, image, divider, spacer, footer, signature, custom_html
    content: Dict[str, Any] = {}
    styles: Dict[str, Any] = {}


# Email Template Model
class EmailTemplate(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    name: str
    subject: str
    description: Optional[str] = None
    
    # Content
    html_content: str = ""
    plain_text_content: str = ""
    
    # Block-based content for Design View
    blocks: List[EmailBlock] = []
    
    # Template settings
    email_type: str = "rich"  # "rich" or "plain"
    folder: Optional[str] = None
    is_active: bool = True
    
    # Related object for merge fields
    related_object: Optional[str] = None  # lead, contact, account, opportunity
    
    # Metadata
    created_by: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# Create/Update models
class EmailTemplateCreate(BaseModel):
    name: str
    subject: str
    description: Optional[str] = None
    html_content: str = ""
    plain_text_content: str = ""
    blocks: List[Dict[str, Any]] = []
    email_type: str = "rich"
    folder: Optional[str] = None
    related_object: Optional[str] = None


class EmailTemplateUpdate(BaseModel):
    name: Optional[str] = None
    subject: Optional[str] = None
    description: Optional[str] = None
    html_content: Optional[str] = None
    plain_text_content: Optional[str] = None
    blocks: Optional[List[Dict[str, Any]]] = None
    email_type: Optional[str] = None
    folder: Optional[str] = None
    is_active: Optional[bool] = None
    related_object: Optional[str] = None


# Email Draft Model (for composer)
class EmailDraft(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    user_id: str
    
    # Source
    template_id: Optional[str] = None
    record_id: Optional[str] = None
    record_type: Optional[str] = None  # lead, contact
    
    # Email content (edited)
    to_email: str
    to_name: Optional[str] = None
    subject: str
    html_content: str = ""
    plain_text_content: str = ""
    blocks: List[Dict[str, Any]] = []
    
    # Status
    status: str = "draft"  # draft, sent
    sent_at: Optional[datetime] = None
    
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class EmailDraftCreate(BaseModel):
    template_id: Optional[str] = None
    record_id: Optional[str] = None
    record_type: Optional[str] = None
    to_email: str
    to_name: Optional[str] = None
    subject: str
    html_content: str = ""
    plain_text_content: str = ""
    blocks: List[Dict[str, Any]] = []


class EmailDraftUpdate(BaseModel):
    to_email: Optional[str] = None
    to_name: Optional[str] = None
    subject: Optional[str] = None
    html_content: Optional[str] = None
    plain_text_content: Optional[str] = None
    blocks: Optional[List[Dict[str, Any]]] = None


# Send Email Request
class SendEmailRequest(BaseModel):
    to_email: Optional[str] = None  # Optional - falls back to user's email for test sends
    to_name: Optional[str] = None
    subject: str
    html_content: str = ""
    plain_text_content: str = ""
    record_id: Optional[str] = None
    record_type: Optional[str] = None
    draft_id: Optional[str] = None
    is_test: bool = False


# AI Generation Request
class AIGenerateRequest(BaseModel):
    purpose: str
    tone: str = "professional"  # professional, friendly, direct, casual
    cta: Optional[str] = None
    related_object: Optional[str] = None
    additional_context: Optional[str] = None


class AIRewriteRequest(BaseModel):
    content: str
    style: str = "professional"  # professional, friendly, direct, shorter


class AISubjectRequest(BaseModel):
    email_content: str
    count: int = 5


class AIGrammarRequest(BaseModel):
    content: str


# HTML to Blocks conversion request
class HTMLToBlocksRequest(BaseModel):
    html: str
