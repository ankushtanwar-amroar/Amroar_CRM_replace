"""
Notification Service

Core service for managing notifications:
- CRUD operations
- Preference management
- Grouping logic
- Snooze functionality
"""

import logging
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List, Optional
from motor.motor_asyncio import AsyncIOMotorDatabase
import uuid

from ..models import (
    Notification,
    NotificationCreate,
    NotificationType,
    NotificationPriority,
    NotificationPreference,
    NotificationPreferenceUpdate,
    SnoozeOption,
    NotificationGroup
)

logger = logging.getLogger(__name__)


class NotificationService:
    """Service for notification operations"""
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.notifications_collection = db.notifications
        self.preferences_collection = db.notification_preferences
    
    # =========================================================================
    # NOTIFICATION CRUD
    # =========================================================================
    
    async def create_notification(
        self,
        tenant_id: str,
        notification_data: NotificationCreate
    ) -> Notification:
        """Create a new notification"""
        
        # Check user preferences before creating
        if not await self._should_create_notification(
            tenant_id, 
            notification_data.recipient_user_id, 
            notification_data.type
        ):
            logger.info(f"Notification skipped due to user preferences: {notification_data.type}")
            return None
        
        # Generate group key if not provided
        group_key = notification_data.group_key
        if not group_key and notification_data.target_object_type and notification_data.target_object_id:
            group_key = f"{notification_data.target_object_type}:{notification_data.target_object_id}:{notification_data.type}"
        
        # Generate target URL if not provided
        target_url = notification_data.target_url
        if not target_url and notification_data.target_object_type and notification_data.target_object_id:
            # Use the standard CRM record view URL pattern
            target_url = f"/{notification_data.target_object_type}/{notification_data.target_object_id}/view"
        
        notification = Notification(
            id=str(uuid.uuid4()),
            tenant_id=tenant_id,
            recipient_user_id=notification_data.recipient_user_id,
            type=notification_data.type,
            title=notification_data.title,
            message=notification_data.message,
            target_object_type=notification_data.target_object_type,
            target_object_id=notification_data.target_object_id,
            target_url=target_url,
            priority=notification_data.priority,
            group_key=group_key,
            expires_at=notification_data.expires_at,
            created_by=notification_data.created_by,
            created_at=datetime.now(timezone.utc)
        )
        
        # Insert into database
        notification_dict = notification.dict()
        notification_dict['_id'] = notification_dict['id']
        await self.notifications_collection.insert_one(notification_dict)
        
        logger.info(f"Created notification {notification.id} for user {notification.recipient_user_id}")
        
        return notification
    
    async def _should_create_notification(
        self,
        tenant_id: str,
        user_id: str,
        notification_type: NotificationType
    ) -> bool:
        """Check if notification should be created based on user preferences"""
        prefs = await self.get_user_preferences(tenant_id, user_id)
        
        if notification_type == NotificationType.MENTION:
            return prefs.mentions_enabled
        elif notification_type == NotificationType.OWNER_CHANGE:
            return prefs.ownership_enabled
        elif notification_type == NotificationType.ASSIGNMENT:
            return prefs.assignments_enabled
        elif notification_type == NotificationType.REMINDER:
            return prefs.reminders_enabled
        elif notification_type == NotificationType.CUSTOM:
            return True  # Custom notifications always allowed
        
        return True
    
    async def get_notifications(
        self,
        tenant_id: str,
        user_id: str,
        notification_type: Optional[str] = None,
        limit: int = 20,
        skip: int = 0,
        include_read: bool = True
    ) -> Dict[str, Any]:
        """Get notifications for a user with optional filtering"""
        
        query = {
            "tenant_id": tenant_id,
            "recipient_user_id": user_id,
            "$or": [
                {"snoozed_until": {"$exists": False}},
                {"snoozed_until": None},
                {"snoozed_until": {"$lte": datetime.now(timezone.utc)}}
            ]
        }
        
        if notification_type and notification_type != "ALL":
            query["type"] = notification_type
        
        if not include_read:
            query["is_read"] = False
        
        # Sort: unread first, then by created_at descending
        sort = [("is_read", 1), ("created_at", -1)]
        
        # Get total count
        total = await self.notifications_collection.count_documents(query)
        
        # Get notifications
        cursor = self.notifications_collection.find(query, {"_id": 0})
        cursor = cursor.sort(sort).skip(skip).limit(limit)
        notifications = await cursor.to_list(length=limit)
        
        # Get unread count
        unread_query = {**query, "is_read": False}
        unread_count = await self.notifications_collection.count_documents(unread_query)
        
        return {
            "notifications": notifications,
            "total": total,
            "unread_count": unread_count,
            "has_more": skip + limit < total
        }
    
    async def get_grouped_notifications(
        self,
        tenant_id: str,
        user_id: str,
        notification_type: Optional[str] = None,
        limit: int = 20
    ) -> List[NotificationGroup]:
        """Get notifications grouped by group_key"""
        
        match_stage = {
            "tenant_id": tenant_id,
            "recipient_user_id": user_id,
            "$or": [
                {"snoozed_until": {"$exists": False}},
                {"snoozed_until": None},
                {"snoozed_until": {"$lte": datetime.now(timezone.utc)}}
            ]
        }
        
        if notification_type and notification_type != "ALL":
            match_stage["type"] = notification_type
        
        pipeline = [
            {"$match": match_stage},
            {"$sort": {"created_at": -1}},
            {
                "$group": {
                    "_id": "$group_key",
                    "count": {"$sum": 1},
                    "latest_notification": {"$first": "$$ROOT"},
                    "notifications": {"$push": "$$ROOT"},
                    "unread_count": {
                        "$sum": {"$cond": [{"$eq": ["$is_read", False]}, 1, 0]}
                    }
                }
            },
            {"$sort": {"latest_notification.created_at": -1}},
            {"$limit": limit}
        ]
        
        cursor = self.notifications_collection.aggregate(pipeline)
        groups = await cursor.to_list(length=limit)
        
        result = []
        for group in groups:
            # Create group title
            latest = group["latest_notification"]
            if group["count"] > 1:
                title = f"{group['count']} {latest['type'].lower().replace('_', ' ')}s on {latest.get('target_object_type', 'record')}"
            else:
                title = latest["title"]
            
            result.append({
                "group_key": group["_id"] or str(uuid.uuid4()),
                "count": group["count"],
                "unread_count": group["unread_count"],
                "latest_notification": latest,
                "notifications": group["notifications"][:5],  # Limit expanded notifications
                "title": title
            })
        
        return result
    
    async def get_unread_count(self, tenant_id: str, user_id: str) -> int:
        """Get unread notification count for a user"""
        query = {
            "tenant_id": tenant_id,
            "recipient_user_id": user_id,
            "is_read": False,
            "$or": [
                {"snoozed_until": {"$exists": False}},
                {"snoozed_until": None},
                {"snoozed_until": {"$lte": datetime.now(timezone.utc)}}
            ]
        }
        return await self.notifications_collection.count_documents(query)
    
    async def mark_as_read(
        self,
        tenant_id: str,
        user_id: str,
        notification_id: str
    ) -> bool:
        """Mark a notification as read"""
        result = await self.notifications_collection.update_one(
            {
                "id": notification_id,
                "tenant_id": tenant_id,
                "recipient_user_id": user_id
            },
            {
                "$set": {
                    "is_read": True,
                    "read_at": datetime.now(timezone.utc)
                }
            }
        )
        return result.modified_count > 0
    
    async def mark_as_unread(
        self,
        tenant_id: str,
        user_id: str,
        notification_id: str
    ) -> bool:
        """Mark a notification as unread"""
        result = await self.notifications_collection.update_one(
            {
                "id": notification_id,
                "tenant_id": tenant_id,
                "recipient_user_id": user_id
            },
            {
                "$set": {
                    "is_read": False,
                    "read_at": None
                }
            }
        )
        return result.modified_count > 0
    
    async def mark_all_as_read(
        self,
        tenant_id: str,
        user_id: str,
        notification_type: Optional[str] = None
    ) -> int:
        """Mark all notifications as read for a user"""
        query = {
            "tenant_id": tenant_id,
            "recipient_user_id": user_id,
            "is_read": False
        }
        
        if notification_type and notification_type != "ALL":
            query["type"] = notification_type
        
        result = await self.notifications_collection.update_many(
            query,
            {
                "$set": {
                    "is_read": True,
                    "read_at": datetime.now(timezone.utc)
                }
            }
        )
        return result.modified_count
    
    async def snooze_notification(
        self,
        tenant_id: str,
        user_id: str,
        notification_id: str,
        snooze_option: SnoozeOption
    ) -> bool:
        """Snooze a notification (typically reminders)"""
        
        # Calculate snooze until time
        now = datetime.now(timezone.utc)
        if snooze_option == SnoozeOption.TEN_MINUTES:
            snoozed_until = now + timedelta(minutes=10)
        elif snooze_option == SnoozeOption.THIRTY_MINUTES:
            snoozed_until = now + timedelta(minutes=30)
        elif snooze_option == SnoozeOption.ONE_HOUR:
            snoozed_until = now + timedelta(hours=1)
        elif snooze_option == SnoozeOption.TOMORROW_9AM:
            tomorrow = now + timedelta(days=1)
            snoozed_until = tomorrow.replace(hour=9, minute=0, second=0, microsecond=0)
        else:
            snoozed_until = now + timedelta(minutes=10)
        
        result = await self.notifications_collection.update_one(
            {
                "id": notification_id,
                "tenant_id": tenant_id,
                "recipient_user_id": user_id
            },
            {
                "$set": {
                    "snoozed_until": snoozed_until,
                    "is_read": False  # Snoozing makes it appear as unread again
                }
            }
        )
        return result.modified_count > 0
    
    async def delete_notification(
        self,
        tenant_id: str,
        user_id: str,
        notification_id: str
    ) -> bool:
        """Delete a notification"""
        result = await self.notifications_collection.delete_one({
            "id": notification_id,
            "tenant_id": tenant_id,
            "recipient_user_id": user_id
        })
        return result.deleted_count > 0
    
    # =========================================================================
    # USER PREFERENCES
    # =========================================================================
    
    async def get_user_preferences(
        self,
        tenant_id: str,
        user_id: str
    ) -> NotificationPreference:
        """Get or create user notification preferences"""
        
        prefs = await self.preferences_collection.find_one(
            {"tenant_id": tenant_id, "user_id": user_id},
            {"_id": 0}
        )
        
        if prefs:
            return NotificationPreference(**prefs)
        
        # Create default preferences
        default_prefs = NotificationPreference(
            id=str(uuid.uuid4()),
            tenant_id=tenant_id,
            user_id=user_id
        )
        
        prefs_dict = default_prefs.dict()
        prefs_dict['_id'] = prefs_dict['id']
        await self.preferences_collection.insert_one(prefs_dict)
        
        return default_prefs
    
    async def update_user_preferences(
        self,
        tenant_id: str,
        user_id: str,
        updates: NotificationPreferenceUpdate
    ) -> NotificationPreference:
        """Update user notification preferences"""
        
        # Ensure preferences exist
        await self.get_user_preferences(tenant_id, user_id)
        
        # Build update dict
        update_data = {k: v for k, v in updates.dict().items() if v is not None}
        update_data["updated_at"] = datetime.now(timezone.utc)
        
        await self.preferences_collection.update_one(
            {"tenant_id": tenant_id, "user_id": user_id},
            {"$set": update_data}
        )
        
        return await self.get_user_preferences(tenant_id, user_id)


# =========================================================================
# SINGLETON INSTANCE
# =========================================================================

_notification_service_instance = None


def get_notification_service(db: AsyncIOMotorDatabase) -> NotificationService:
    """Get or create notification service instance"""
    global _notification_service_instance
    if _notification_service_instance is None:
        _notification_service_instance = NotificationService(db)
    return _notification_service_instance
