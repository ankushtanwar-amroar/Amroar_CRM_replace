"""
DocFlow Template Models
"""
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime
from enum import Enum


class TemplateType(str, Enum):
    QUOTATION = "quotation"
    NDA = "nda"
    INVOICE = "invoice"
    CONTRACT = "contract"
    PROPOSAL = "proposal"
    CUSTOM = "custom"


class TemplateSource(str, Enum):
    UPLOAD = "upload"
    AI_GENERATED = "ai_generated"
    MANUAL = "manual"


class RoutingMode(str, Enum):
    SEQUENTIAL = "sequential"
    PARALLEL = "parallel"


class RecipientTemplate(BaseModel):
    id: str
    placeholder_name: str  # e.g., "Signer 1", "Client", "Manager"
    routing_order: int = 1
    is_required: bool = True


class SignatureField(BaseModel):
    id: str
    type: str  # signature, initials, date, text
    recipient_id: str  # Tied to RecipientTemplate.id
    page: int
    x: float
    y: float
    width: float
    height: float
    required: bool = True


class MergeField(BaseModel):
    field_path: str  # e.g., "Account.Name", "Opportunity.Amount"
    label: str
    field_type: str  # text, number, date, currency
    required: bool = False
    default_value: Optional[str] = None


class ObjectMapping(BaseModel):
    parent_object: str  # Lead, Account, Opportunity, etc.
    child_object: Optional[str] = None  # LineItems, etc.
    merge_fields: List[MergeField] = []


class TriggerConfig(BaseModel):
    enabled: bool = False
    trigger_type: str = "field_change"  # field_change, schedule, webhook, onCreate, onUpdate, onStageChange
    object_type: str  # lead, opportunity, account, task, event
    email_field: Optional[str] = None  # The email field to use for sending documents
    conditions: List[Dict[str, str]] = []  # [{"field": "Status", "operator": "equals", "value": "Lost"}]


class Template(BaseModel):
    id: str
    tenant_id: str
    name: str
    description: Optional[str] = ""
    template_type: TemplateType
    source: TemplateSource
    file_url: Optional[str] = None
    file_type: Optional[str] = None  # pdf, docx, html
    html_content: Optional[str] = None
    object_mapping: Optional[ObjectMapping] = None
    recipients: List[RecipientTemplate] = []
    routing_mode: RoutingMode = RoutingMode.SEQUENTIAL
    signature_fields: List[SignatureField] = []  # Structured signature fields
    trigger_config: Optional[TriggerConfig] = None  # Automatic trigger configuration
    status: str = "draft"  # draft, active, archived
    is_validated: bool = False
    created_by: str
    updated_by: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    version: int = 1
    template_group_id: Optional[str] = None
    is_latest: bool = True
    created_from_version: Optional[int] = None
    ai_prompt: Optional[str] = None  # Store original AI prompt


class TemplateCreate(BaseModel):
    name: str
    description: Optional[str] = ""
    template_type: TemplateType
    source: TemplateSource = TemplateSource.MANUAL
    html_content: Optional[str] = None
    ai_prompt: Optional[str] = None
    is_validated: bool = False

    class Config:
        # Allow UI to send additional template configuration fields
        # (e.g. webhook_config, crm_connection, field_placements).
        extra = "allow"


class TemplateUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    html_content: Optional[str] = None
    object_mapping: Optional[ObjectMapping] = None
    recipients: Optional[List[RecipientTemplate]] = None
    routing_mode: Optional[RoutingMode] = None
    signature_fields: Optional[List[SignatureField]] = None
    trigger_config: Optional[TriggerConfig] = None
    status: Optional[str] = None
    is_validated: Optional[bool] = None

    class Config:
        # Allow partial updates that include extra configuration keys
        # your UI already maintains (e.g. webhook_config, crm_connection, field_placements).
        extra = "allow"
