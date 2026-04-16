"""
DocFlow Document Models
"""
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime
from enum import Enum


class DocumentStatus(str, Enum):
    DRAFT = "draft"
    GENERATED = "generated"
    SENT = "sent"
    VIEWED = "viewed"
    SIGNED = "signed"
    COMPLETED = "completed"
    EXPIRED = "expired"
    FAILED = "failed"
    DECLINED = "declined"
    PARTIALLY_SIGNED = "partially_signed"


class DeliveryChannel(str, Enum):
    EMAIL = "email"
    PUBLIC_LINK = "public_link"
    SMS = "sms"
    IN_APP = "in_app"


class RecipientStatus(str, Enum):
    PENDING = "pending"
    SENT = "sent"
    VIEWED = "viewed"
    SIGNED = "signed"
    DECLINED = "declined"
    COMPLETED = "completed"
    APPROVED = "approved"
    REVIEWED = "reviewed"
    REJECTED = "rejected"
    RECEIVE_COPY = "receive_copy"


class Recipient(BaseModel):
    id: str
    template_recipient_id: Optional[str] = None  # Reference to RecipientTemplate.id
    name: str
    email: str
    role: Optional[str] = None
    role_type: Optional[str] = None  # Normalized role: SIGN, APPROVE_REJECT, VIEW_ONLY, RECEIVE_COPY
    status: RecipientStatus = RecipientStatus.PENDING
    routing_order: int = 1
    is_required: bool = True
    assigned_field_ids: List[str] = []  # List of component IDs assigned to this recipient
    public_token: Optional[str] = None  # Individual token for signing link
    sent_at: Optional[datetime] = None
    viewed_at: Optional[datetime] = None
    signed_at: Optional[datetime] = None
    declined_at: Optional[datetime] = None
    decline_reason: Optional[str] = None
    action_taken: Optional[str] = None  # approved, rejected, reviewed
    action_at: Optional[datetime] = None
    # Metadata captured on role-action
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    reject_reason: Optional[str] = None  # Rejection reason for this recipient


class Signature(BaseModel):
    id: str
    field_id: str  # Reference to SignatureField.id
    recipient_id: str  # Reference to Recipient.id
    signature_data: str  # Base64 or text
    signed_at: datetime = Field(default_factory=datetime.utcnow)
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None


class Document(BaseModel):
    id: str
    tenant_id: str
    template_id: str
    template_name: str
    crm_object_id: str  # The CRM record this document is for
    crm_object_type: str  # Lead, Opportunity, etc.
    status: DocumentStatus = DocumentStatus.DRAFT
    generated_pdf_url: Optional[str] = None
    public_token: Optional[str] = None
    delivery_channels: List[DeliveryChannel] = []
    recipients: List[Recipient] = []
    signatures: List[Signature] = []  # Collected signatures
    audit_trail: List[Dict[str, Any]] = []  # All events
    generated_at: Optional[datetime] = None
    sent_at: Optional[datetime] = None
    viewed_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None
    # Rejection fields
    reject_reason: Optional[str] = None
    rejected_by: Optional[str] = None
    rejected_at: Optional[datetime] = None
    created_by: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class DocumentGenerate(BaseModel):
    template_id: str
    crm_object_id: str
    crm_object_type: str
    delivery_channels: List[DeliveryChannel] = [DeliveryChannel.EMAIL]
    recipients: List[Dict[str, Any]] = []  # List of {name, email, role, routing_order}
    routing_mode: Optional[str] = None  # sequential or parallel
    expires_in_days: Optional[int] = None
    expires_at: Optional[datetime] = None
    custom_data: Optional[Dict[str, Any]] = None
    salesforce_context: Optional[Dict[str, Any]] = None

    # Backwards-compatible single-recipient fields used by the current UI.
    # Multi-recipient signing will use the `recipients` list.
    recipient_email: Optional[str] = None
    recipient_name: Optional[str] = None
