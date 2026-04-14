from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List
from datetime import datetime
from enum import Enum

class ActivityType(str, Enum):
    CALL = "call"
    EMAIL = "email"
    SMS = "sms"
    WHATSAPP = "whatsapp"
    MEETING = "meeting"
    NOTE = "note"
    TASK = "task"
    EVENT = "event"
    CUSTOM = "custom"

class ActivityStatus(str, Enum):
    PLANNED = "planned"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"

class Activity(BaseModel):
    """Activity record for timeline"""
    id: str
    tenant_id: str
    
    # Related record
    object_type: str
    record_id: str
    
    # Activity details
    type: ActivityType
    status: ActivityStatus = ActivityStatus.PLANNED
    subject: str
    description: Optional[str] = None
    
    # Dates
    activity_date: datetime
    due_date: Optional[datetime] = None
    completed_date: Optional[datetime] = None
    
    # People
    assigned_to: Optional[str] = None
    created_by: Optional[str] = None
    
    # Additional data
    metadata: Optional[Dict[str, Any]] = None
    
    # Timestamps
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class TimelineFilter(BaseModel):
    """Timeline filter options"""
    activity_types: Optional[List[ActivityType]] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    assigned_to: Optional[str] = None
    status: Optional[List[ActivityStatus]] = None
