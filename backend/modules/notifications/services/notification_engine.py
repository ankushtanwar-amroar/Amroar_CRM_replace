"""
Notification Engine

Handles automatic notification creation from system events:
- Mentions (from Chatter)
- Owner changes
- Assignments
- Event reminders

This engine is called by other modules to create notifications.
"""

import logging
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
from motor.motor_asyncio import AsyncIOMotorDatabase

from ..models import NotificationCreate, NotificationType, NotificationPriority
from .notification_service import get_notification_service
from .websocket_manager import notification_manager

logger = logging.getLogger(__name__)


class NotificationEngine:
    """Engine for creating notifications from system events"""
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.notification_service = get_notification_service(db)
    
    async def notify_mention(
        self,
        tenant_id: str,
        mentioned_user_id: str,
        mentioning_user_name: str,
        target_object_type: Optional[str],
        target_object_id: Optional[str],
        record_name: str,
        message_preview: str,
        created_by: str,
        target_url: Optional[str] = None
    ):
        """Create notification for a mention"""
        
        notification_data = NotificationCreate(
            recipient_user_id=mentioned_user_id,
            type=NotificationType.MENTION,
            title=f"{mentioning_user_name} mentioned you",
            message=f"In {record_name}: \"{message_preview[:100]}...\"" if len(message_preview) > 100 else f"In {record_name}: \"{message_preview}\"",
            target_object_type=target_object_type,
            target_object_id=target_object_id,
            target_url=target_url,
            priority=NotificationPriority.NORMAL,
            created_by=created_by
        )
        
        notification = await self.notification_service.create_notification(tenant_id, notification_data)
        
        if notification:
            # Send real-time update
            await notification_manager.send_notification(
                tenant_id,
                mentioned_user_id,
                notification.dict()
            )
        
        return notification
    
    async def notify_owner_change(
        self,
        tenant_id: str,
        new_owner_id: str,
        previous_owner_name: str,
        target_object_type: str,
        target_object_id: str,
        record_name: str,
        changed_by: str,
        changed_by_name: str
    ):
        """Create notification for ownership change"""
        
        notification_data = NotificationCreate(
            recipient_user_id=new_owner_id,
            type=NotificationType.OWNER_CHANGE,
            title="You are now the owner",
            message=f"{changed_by_name} transferred {target_object_type.title()} \"{record_name}\" to you",
            target_object_type=target_object_type,
            target_object_id=target_object_id,
            priority=NotificationPriority.NORMAL,
            created_by=changed_by
        )
        
        notification = await self.notification_service.create_notification(tenant_id, notification_data)
        
        if notification:
            # Send real-time update
            await notification_manager.send_notification(
                tenant_id,
                new_owner_id,
                notification.dict()
            )
        
        return notification
    
    async def notify_assignment(
        self,
        tenant_id: str,
        assigned_user_id: str,
        assigner_name: str,
        target_object_type: str,
        target_object_id: str,
        record_name: str,
        created_by: str
    ):
        """Create notification for record assignment"""
        
        notification_data = NotificationCreate(
            recipient_user_id=assigned_user_id,
            type=NotificationType.ASSIGNMENT,
            title=f"New {target_object_type.title()} assigned",
            message=f"{assigner_name} assigned \"{record_name}\" to you",
            target_object_type=target_object_type,
            target_object_id=target_object_id,
            priority=NotificationPriority.NORMAL,
            created_by=created_by
        )
        
        notification = await self.notification_service.create_notification(tenant_id, notification_data)
        
        if notification:
            # Send real-time update
            await notification_manager.send_notification(
                tenant_id,
                assigned_user_id,
                notification.dict()
            )
        
        return notification
    
    async def notify_event_reminder(
        self,
        tenant_id: str,
        user_id: str,
        event_id: str,
        event_name: str,
        event_start_time: datetime,
        minutes_until: int
    ):
        """Create notification for event reminder"""
        
        time_str = f"in {minutes_until} minutes" if minutes_until > 0 else "now"
        
        notification_data = NotificationCreate(
            recipient_user_id=user_id,
            type=NotificationType.REMINDER,
            title=f"Event starting {time_str}",
            message=f"\"{event_name}\" begins at {event_start_time.strftime('%I:%M %p')}",
            target_object_type="event",
            target_object_id=event_id,
            priority=NotificationPriority.CRITICAL,
            created_by="system"
        )
        
        notification = await self.notification_service.create_notification(tenant_id, notification_data)
        
        if notification:
            # Send real-time update
            await notification_manager.send_notification(
                tenant_id,
                user_id,
                notification.dict()
            )
        
        return notification
    
    async def notify_custom(
        self,
        tenant_id: str,
        recipient_user_id: str,
        title: str,
        message: str,
        target_object_type: Optional[str] = None,
        target_object_id: Optional[str] = None,
        target_url: Optional[str] = None,
        priority: str = "NORMAL",
        created_by: Optional[str] = None
    ):
        """Create custom notification (used by Flow Builder action)"""
        
        priority_enum = NotificationPriority.NORMAL
        if priority.upper() == "CRITICAL":
            priority_enum = NotificationPriority.CRITICAL
        elif priority.upper() == "FYI":
            priority_enum = NotificationPriority.FYI
        
        notification_data = NotificationCreate(
            recipient_user_id=recipient_user_id,
            type=NotificationType.CUSTOM,
            title=title,
            message=message,
            target_object_type=target_object_type,
            target_object_id=target_object_id,
            target_url=target_url,
            priority=priority_enum,
            created_by=created_by
        )
        
        notification = await self.notification_service.create_notification(tenant_id, notification_data)
        
        if notification:
            # Send real-time update
            await notification_manager.send_notification(
                tenant_id,
                recipient_user_id,
                notification.dict()
            )
        
        return notification


# =========================================================================
# SINGLETON INSTANCE
# =========================================================================

_notification_engine_instance = None


def get_notification_engine(db: AsyncIOMotorDatabase) -> NotificationEngine:
    """Get or create notification engine instance"""
    global _notification_engine_instance
    if _notification_engine_instance is None:
        _notification_engine_instance = NotificationEngine(db)
    return _notification_engine_instance
