"""
Notifications Module - Bell Icon Notification Center

A complete, isolated notification system supporting:
- Real-time notifications via WebSocket
- Multiple notification types (Mention, Ownership, Assignment, Reminder, Custom)
- User preferences
- Grouping and snooze functionality
- Deep linking to target records

This module is intentionally isolated from other CRM components.
"""

from .api.notification_routes import router as notifications_router

__all__ = ['notifications_router']
