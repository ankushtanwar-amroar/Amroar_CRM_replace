"""
DocFlow Signature Models
"""
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from enum import Enum


class SignerRole(str, Enum):
    CLIENT = "client"
    INTERNAL_APPROVER = "internal_approver"
    WITNESS = "witness"
    CUSTOM = "custom"


class SignatureType(str, Enum):
    FULL_SIGNATURE = "full_signature"
    INITIALS = "initials"
    DATE = "date"
    TEXT = "text"


class SignatureField(BaseModel):
    id: str
    field_type: SignatureType
    role: SignerRole
    role_label: Optional[str] = None
    position: dict  # {x, y, width, height, page}
    required: bool = True
    placeholder: Optional[str] = None


class SignatureData(BaseModel):
    id: str
    document_id: str
    field_id: str
    signer_name: str
    signer_email: Optional[str] = None
    signature_image: str  # Base64 encoded signature
    signed_at: datetime = Field(default_factory=datetime.utcnow)
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    signature_hash: Optional[str] = None
