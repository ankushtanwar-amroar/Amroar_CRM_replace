"""
Notification Data Models

Clean, isolated models for the Notification Center:
- Notification: Individual notification record
- NotificationPreference: User preferences for notifications
"""

from pydantic import BaseModel, Field
from typing import Optional, List, Literal
from datetime import datetime
from enum import Enum


class NotificationType(str, Enum):
    """Notification types supported by the system"""
    MENTION = "MENTION"
    OWNER_CHANGE = "OWNER_CHANGE"
    ASSIGNMENT = "ASSIGNMENT"
    REMINDER = "REMINDER"
    CUSTOM = "CUSTOM"


class NotificationPriority(str, Enum):
    """Notification priority levels"""
    CRITICAL = "CRITICAL"
    NORMAL = "NORMAL"
    FYI = "FYI"


class Notification(BaseModel):
    """Notification record model"""
    id: str = Field(..., description="Unique notification ID")
    tenant_id: str = Field(..., description="Tenant ID")
    recipient_user_id: str = Field(..., description="User who receives this notification")
    type: NotificationType = Field(..., description="Notification type")
    title: str = Field(..., description="Notification title")
    message: str = Field(..., description="Notification message body")
    target_object_type: Optional[str] = Field(None, description="Type of target object (e.g., lead, account)")
    target_object_id: Optional[str] = Field(None, description="ID of the target object")
    target_url: Optional[str] = Field(None, description="Deep link URL to the target")
    is_read: bool = Field(default=False, description="Whether notification has been read")
    read_at: Optional[datetime] = Field(None, description="When notification was read")
    priority: NotificationPriority = Field(default=NotificationPriority.NORMAL, description="Priority level")
    group_key: Optional[str] = Field(None, description="Key for grouping similar notifications")
    created_at: datetime = Field(default_factory=lambda: datetime.now(), description="Creation timestamp")
    expires_at: Optional[datetime] = Field(None, description="When notification expires")
    snoozed_until: Optional[datetime] = Field(None, description="Snooze until this time (for reminders)")
    created_by: Optional[str] = Field(None, description="User who triggered this notification")
    
    class Config:
        use_enum_values = True


class NotificationCreate(BaseModel):
    """Model for creating a new notification"""
    recipient_user_id: str
    type: NotificationType
    title: str
    message: str
    target_object_type: Optional[str] = None
    target_object_id: Optional[str] = None
    target_url: Optional[str] = None
    priority: NotificationPriority = NotificationPriority.NORMAL
    group_key: Optional[str] = None
    expires_at: Optional[datetime] = None
    created_by: Optional[str] = None


class NotificationPreference(BaseModel):
    """User notification preferences model"""
    id: str = Field(..., description="Unique preference ID")
    tenant_id: str = Field(..., description="Tenant ID")
    user_id: str = Field(..., description="User ID (unique per tenant)")
    mentions_enabled: bool = Field(default=True, description="Receive mention notifications")
    ownership_enabled: bool = Field(default=True, description="Receive ownership change notifications")
    assignments_enabled: bool = Field(default=True, description="Receive assignment notifications")
    reminders_enabled: bool = Field(default=True, description="Receive reminder notifications")
    # Placeholder fields for v1.1
    email_mentions: bool = Field(default=False, description="Email for mentions (v1.1)")
    email_ownership: bool = Field(default=False, description="Email for ownership changes (v1.1)")
    email_assignments: bool = Field(default=False, description="Email for assignments (v1.1)")
    email_reminders: bool = Field(default=False, description="Email for reminders (v1.1)")
    mobile_mentions: bool = Field(default=False, description="Mobile push for mentions (v1.1)")
    mobile_ownership: bool = Field(default=False, description="Mobile push for ownership changes (v1.1)")
    mobile_assignments: bool = Field(default=False, description="Mobile push for assignments (v1.1)")
    mobile_reminders: bool = Field(default=False, description="Mobile push for reminders (v1.1)")
    updated_at: datetime = Field(default_factory=lambda: datetime.now(), description="Last update timestamp")
    
    class Config:
        use_enum_values = True


class NotificationPreferenceUpdate(BaseModel):
    """Model for updating notification preferences"""
    mentions_enabled: Optional[bool] = None
    ownership_enabled: Optional[bool] = None
    assignments_enabled: Optional[bool] = None
    reminders_enabled: Optional[bool] = None
    email_mentions: Optional[bool] = None
    email_ownership: Optional[bool] = None
    email_assignments: Optional[bool] = None
    email_reminders: Optional[bool] = None
    mobile_mentions: Optional[bool] = None
    mobile_ownership: Optional[bool] = None
    mobile_assignments: Optional[bool] = None
    mobile_reminders: Optional[bool] = None


class SnoozeOption(str, Enum):
    """Available snooze duration options"""
    TEN_MINUTES = "10_MINUTES"
    THIRTY_MINUTES = "30_MINUTES"
    ONE_HOUR = "1_HOUR"
    TOMORROW_9AM = "TOMORROW_9AM"


class NotificationGroup(BaseModel):
    """Grouped notifications for display"""
    group_key: str
    count: int
    latest_notification: Notification
    notifications: List[Notification]
    title: str  # e.g., "3 new mentions on Case #C-1032"


class NotificationListResponse(BaseModel):
    """Response model for listing notifications"""
    notifications: List[Notification]
    total: int
    unread_count: int
    has_more: bool
