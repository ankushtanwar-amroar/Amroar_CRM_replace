"""
DocFlow Package Models — Phase 1

Package = optional parent entity wrapping one or more documents.
PackageTemplate = reusable blueprint for creating packages.
"""
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
from enum import Enum


# ── Enums ──

class PackageStatus(str, Enum):
    DRAFT = "draft"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    VOIDED = "voided"
    EXPIRED = "expired"
    DECLINED = "declined"


class RecipientRoleType(str, Enum):
    SIGN = "SIGN"
    VIEW_ONLY = "VIEW_ONLY"
    APPROVE_REJECT = "APPROVE_REJECT"
    RECEIVE_COPY = "RECEIVE_COPY"


class RecipientWorkflowStatus(str, Enum):
    PENDING = "pending"
    NOTIFIED = "notified"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    DECLINED = "declined"
    SKIPPED = "skipped"
    FAILED = "failed"


class OnRejectPolicy(str, Enum):
    VOID = "void"
    REWORK = "rework"   # Phase 3
    DRAFT = "draft"     # Phase 3


class OutputMode(str, Enum):
    SEPARATE = "separate"
    COMBINED = "combined"   # Phase 3
    BOTH = "both"           # Phase 3


# ── Embedded Sub-Models ──

class RoutingConfig(BaseModel):
    mode: str = "sequential"  # sequential | parallel | mixed (Phase 2)
    on_reject: OnRejectPolicy = OnRejectPolicy.VOID


class SecuritySettings(BaseModel):
    require_auth: bool = True
    session_timeout_minutes: int = 15
    allow_reassign: bool = False


class PackageRecipient(BaseModel):
    id: str
    name: str
    email: str = ""
    role_type: RecipientRoleType = RecipientRoleType.SIGN
    routing_order: int = 1
    status: RecipientWorkflowStatus = RecipientWorkflowStatus.PENDING
    action_taken: Optional[str] = None        # signed | approved | rejected | reviewed
    action_at: Optional[datetime] = None
    reject_reason: Optional[str] = None
    assigned_components: Dict[str, List[str]] = {}  # {doc_id: [field_ids]}
    public_token: Optional[str] = None
    notified_at: Optional[datetime] = None


class PackageDocument(BaseModel):
    """Reference to a document within a package (stored in the package for ordering)."""
    template_id: str
    document_id: Optional[str] = None  # Populated after generation
    document_name: str = ""
    order: int = 1
    merge_fields: Dict[str, Any] = {}


# ── Package Model ──

class Package(BaseModel):
    id: str
    tenant_id: str
    name: str
    status: PackageStatus = PackageStatus.DRAFT
    send_mode: str = "package"  # "basic" for single-doc wrapping, "package" for multi-doc
    documents: List[PackageDocument] = []
    recipients: List[PackageRecipient] = []
    routing_config: RoutingConfig = Field(default_factory=RoutingConfig)
    output_mode: OutputMode = OutputMode.SEPARATE
    security_settings: SecuritySettings = Field(default_factory=SecuritySettings)
    source_context: Optional[Dict[str, Any]] = None
    void_reason: Optional[str] = None
    voided_by: Optional[str] = None
    voided_at: Optional[datetime] = None
    certificate_url: Optional[str] = None
    created_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    completed_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None


# ── Package Template Model ──

class PackageTemplateRecipient(BaseModel):
    id: str
    placeholder_name: str = "Signer 1"
    role_type: RecipientRoleType = RecipientRoleType.SIGN
    routing_order: int = 1
    is_required: bool = True


class PackageTemplateDocument(BaseModel):
    template_id: str
    label: str = ""  # Display name override
    order: int = 1


class PackageTemplate(BaseModel):
    id: str
    tenant_id: str
    name: str
    description: str = ""
    template_documents: List[PackageTemplateDocument] = []
    default_recipients: List[PackageTemplateRecipient] = []
    default_routing_config: RoutingConfig = Field(default_factory=RoutingConfig)
    default_output_mode: OutputMode = OutputMode.SEPARATE
    default_security_settings: SecuritySettings = Field(default_factory=SecuritySettings)
    status: str = "draft"  # draft | active
    created_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# ── API Request/Response Models ──

class PackageTemplateCreate(BaseModel):
    name: str
    description: str = ""
    template_documents: List[PackageTemplateDocument] = []
    default_recipients: List[PackageTemplateRecipient] = []
    default_routing_config: Optional[RoutingConfig] = None
    default_output_mode: OutputMode = OutputMode.SEPARATE
    default_security_settings: Optional[SecuritySettings] = None


class PackageTemplateUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    template_documents: Optional[List[PackageTemplateDocument]] = None
    default_recipients: Optional[List[PackageTemplateRecipient]] = None
    default_routing_config: Optional[RoutingConfig] = None
    default_output_mode: Optional[OutputMode] = None
    default_security_settings: Optional[SecuritySettings] = None
    status: Optional[str] = None
