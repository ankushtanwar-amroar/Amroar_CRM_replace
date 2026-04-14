"""
DocFlow Audit Event Models — Phase 1

Structured audit events stored in a dedicated collection.
Replaces embedded audit_trail[] arrays for new packages.
Dual-write during transition: new events go to both places.
"""
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any
from datetime import datetime, timezone
from enum import Enum


class AuditEventType(str, Enum):
    # Package lifecycle
    PACKAGE_CREATED = "package_created"
    PACKAGE_SENT = "package_sent"
    PACKAGE_COMPLETED = "package_completed"
    PACKAGE_VOIDED = "package_voided"
    PACKAGE_EXPIRED = "package_expired"
    PACKAGE_DECLINED = "package_declined"

    # Document events
    DOCUMENT_GENERATED = "document_generated"
    DOCUMENT_VIEWED = "document_viewed"
    DOCUMENT_DOWNLOADED = "document_downloaded"

    # Recipient events
    RECIPIENT_NOTIFIED = "recipient_notified"
    RECIPIENT_VIEWED = "recipient_viewed"
    SIGNATURE_APPLIED = "signature_applied"
    APPROVED = "approved"
    REJECTED = "rejected"
    REVIEWED = "reviewed"

    # Routing events
    ROUTING_WAVE_STARTED = "routing_wave_started"
    ROUTING_WAVE_COMPLETED = "routing_wave_completed"
    ROUTING_ADVANCED = "routing_advanced"

    # Session events (Phase 4)
    SESSION_CREATED = "session_created"
    SESSION_EXPIRED = "session_expired"
    OTP_SENT = "otp_sent"
    OTP_VERIFIED = "otp_verified"


class AuditEvent(BaseModel):
    id: str
    tenant_id: str
    package_id: str
    document_id: Optional[str] = None      # null = package-level event
    recipient_id: Optional[str] = None     # null = system event
    event_type: AuditEventType
    actor: str = "system"                  # email or "system"
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    metadata: Dict[str, Any] = {}          # event-specific data
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
