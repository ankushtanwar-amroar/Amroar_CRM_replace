"""
Notification API Routes

REST API endpoints for the Notification Center:
- GET /notifications - List notifications with filtering
- GET /notifications/unread-count - Get unread count
- POST /notifications/{id}/read - Mark as read
- POST /notifications/{id}/unread - Mark as unread
- POST /notifications/mark-all-read - Mark all as read
- POST /notifications/{id}/snooze - Snooze a notification
- DELETE /notifications/{id} - Delete notification
- GET /notification-preferences - Get user preferences
- POST /notification-preferences - Update preferences
- WebSocket /notifications/ws - Real-time updates
"""

import logging
import os
import jwt
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect, Header
from pydantic import BaseModel
from motor.motor_asyncio import AsyncIOMotorClient

from ..services import (
    get_notification_service,
    notification_manager,
    get_notification_engine
)
from ..models import (
    NotificationPreferenceUpdate,
    SnoozeOption,
    NotificationCreate,
    NotificationType,
    NotificationPriority
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/notifications", tags=["notifications"])


# =========================================================================
# DEPENDENCY INJECTION
# =========================================================================

async def get_db():
    """Get database connection"""
    mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
    db_name = os.environ.get("DB_NAME", "crm_platform")
    client = AsyncIOMotorClient(mongo_url)
    return client[db_name]


async def get_current_user(authorization: str = Header(None, alias="Authorization")):
    """Extract user info from authorization header"""
    if not authorization:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    token = authorization.replace("Bearer ", "") if authorization.startswith("Bearer ") else authorization
    
    try:
        secret = os.environ.get("JWT_SECRET", "your-secret-key-change-in-production")
        payload = jwt.decode(token, secret, algorithms=["HS256"])
        return {
            "user_id": payload.get("user_id"),
            "tenant_id": payload.get("tenant_id")
        }
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


# =========================================================================
# REQUEST/RESPONSE MODELS
# =========================================================================

class SnoozeRequest(BaseModel):
    option: SnoozeOption


class CustomNotificationRequest(BaseModel):
    recipient_user_id: str
    title: str
    message: str
    target_object_type: Optional[str] = None
    target_object_id: Optional[str] = None
    target_url: Optional[str] = None
    priority: str = "NORMAL"


# =========================================================================
# NOTIFICATION ENDPOINTS
# =========================================================================

@router.get("")
async def list_notifications(
    filter: Optional[str] = Query(None, description="Filter by type: MENTION, OWNER_CHANGE, ASSIGNMENT, REMINDER, CUSTOM"),
    limit: int = Query(20, ge=1, le=100),
    skip: int = Query(0, ge=0),
    grouped: bool = Query(False, description="Return grouped notifications"),
    user: dict = Depends(get_current_user),
    db = Depends(get_db)
):
    """List notifications for the current user"""
    service = get_notification_service(db)
    
    if grouped:
        result = await service.get_grouped_notifications(
            tenant_id=user["tenant_id"],
            user_id=user["user_id"],
            notification_type=filter,
            limit=limit
        )
        return {"groups": result}
    
    result = await service.get_notifications(
        tenant_id=user["tenant_id"],
        user_id=user["user_id"],
        notification_type=filter,
        limit=limit,
        skip=skip
    )
    
    return result


@router.get("/unread-count")
async def get_unread_count(
    user: dict = Depends(get_current_user),
    db = Depends(get_db)
):
    """Get unread notification count"""
    service = get_notification_service(db)
    
    count = await service.get_unread_count(
        tenant_id=user["tenant_id"],
        user_id=user["user_id"]
    )
    
    return {"unread_count": count}


@router.post("/{notification_id}/read")
async def mark_as_read(
    notification_id: str,
    user: dict = Depends(get_current_user),
    db = Depends(get_db)
):
    """Mark a notification as read"""
    service = get_notification_service(db)
    
    success = await service.mark_as_read(
        tenant_id=user["tenant_id"],
        user_id=user["user_id"],
        notification_id=notification_id
    )
    
    if not success:
        raise HTTPException(status_code=404, detail="Notification not found")
    
    # Send updated count via WebSocket
    count = await service.get_unread_count(user["tenant_id"], user["user_id"])
    await notification_manager.send_unread_count_update(
        user["tenant_id"],
        user["user_id"],
        count
    )
    
    return {"success": True}


@router.post("/{notification_id}/unread")
async def mark_as_unread(
    notification_id: str,
    user: dict = Depends(get_current_user),
    db = Depends(get_db)
):
    """Mark a notification as unread"""
    service = get_notification_service(db)
    
    success = await service.mark_as_unread(
        tenant_id=user["tenant_id"],
        user_id=user["user_id"],
        notification_id=notification_id
    )
    
    if not success:
        raise HTTPException(status_code=404, detail="Notification not found")
    
    # Send updated count via WebSocket
    count = await service.get_unread_count(user["tenant_id"], user["user_id"])
    await notification_manager.send_unread_count_update(
        user["tenant_id"],
        user["user_id"],
        count
    )
    
    return {"success": True}


@router.post("/mark-all-read")
async def mark_all_as_read(
    filter: Optional[str] = Query(None, description="Filter by type"),
    user: dict = Depends(get_current_user),
    db = Depends(get_db)
):
    """Mark all notifications as read"""
    service = get_notification_service(db)
    
    count = await service.mark_all_as_read(
        tenant_id=user["tenant_id"],
        user_id=user["user_id"],
        notification_type=filter
    )
    
    # Send updated count via WebSocket
    await notification_manager.send_unread_count_update(
        user["tenant_id"],
        user["user_id"],
        0
    )
    
    return {"success": True, "marked_count": count}


@router.post("/{notification_id}/snooze")
async def snooze_notification(
    notification_id: str,
    snooze_request: SnoozeRequest,
    user: dict = Depends(get_current_user),
    db = Depends(get_db)
):
    """Snooze a notification (typically reminders)"""
    service = get_notification_service(db)
    
    success = await service.snooze_notification(
        tenant_id=user["tenant_id"],
        user_id=user["user_id"],
        notification_id=notification_id,
        snooze_option=snooze_request.option
    )
    
    if not success:
        raise HTTPException(status_code=404, detail="Notification not found")
    
    # Send updated count via WebSocket
    count = await service.get_unread_count(user["tenant_id"], user["user_id"])
    await notification_manager.send_unread_count_update(
        user["tenant_id"],
        user["user_id"],
        count
    )
    
    return {"success": True}


@router.delete("/{notification_id}")
async def delete_notification(
    notification_id: str,
    user: dict = Depends(get_current_user),
    db = Depends(get_db)
):
    """Delete a notification"""
    service = get_notification_service(db)
    
    success = await service.delete_notification(
        tenant_id=user["tenant_id"],
        user_id=user["user_id"],
        notification_id=notification_id
    )
    
    if not success:
        raise HTTPException(status_code=404, detail="Notification not found")
    
    return {"success": True}


# =========================================================================
# CUSTOM NOTIFICATION ENDPOINT (for Flow Builder)
# =========================================================================

@router.post("/send")
async def send_custom_notification(
    request: CustomNotificationRequest,
    user: dict = Depends(get_current_user),
    db = Depends(get_db)
):
    """Send a custom notification (used by Flow Builder)"""
    engine = get_notification_engine(db)
    
    notification = await engine.notify_custom(
        tenant_id=user["tenant_id"],
        recipient_user_id=request.recipient_user_id,
        title=request.title,
        message=request.message,
        target_object_type=request.target_object_type,
        target_object_id=request.target_object_id,
        target_url=request.target_url,
        priority=request.priority,
        created_by=user["user_id"]
    )
    
    if notification:
        return {"success": True, "notification_id": notification.id}
    else:
        return {"success": False, "message": "Notification not sent due to user preferences"}


# =========================================================================
# PREFERENCE ENDPOINTS
# =========================================================================

@router.get("/preferences")
async def get_preferences(
    user: dict = Depends(get_current_user),
    db = Depends(get_db)
):
    """Get notification preferences for current user"""
    service = get_notification_service(db)
    
    prefs = await service.get_user_preferences(
        tenant_id=user["tenant_id"],
        user_id=user["user_id"]
    )
    
    return prefs.dict()


@router.post("/preferences")
async def update_preferences(
    updates: NotificationPreferenceUpdate,
    user: dict = Depends(get_current_user),
    db = Depends(get_db)
):
    """Update notification preferences"""
    service = get_notification_service(db)
    
    prefs = await service.update_user_preferences(
        tenant_id=user["tenant_id"],
        user_id=user["user_id"],
        updates=updates
    )
    
    return prefs.dict()


# =========================================================================
# WEBSOCKET ENDPOINT
# =========================================================================

@router.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    token: str = Query(...)
):
    """WebSocket endpoint for real-time notification updates"""
    try:
        secret = os.environ.get("JWT_SECRET", "your-secret-key-change-in-production")
        payload = jwt.decode(token, secret, algorithms=["HS256"])
        user_id = payload.get("user_id")
        tenant_id = payload.get("tenant_id")
        
        if not user_id or not tenant_id:
            await websocket.close(code=4001)
            return
        
    except jwt.ExpiredSignatureError:
        await websocket.close(code=4002)
        return
    except jwt.InvalidTokenError:
        await websocket.close(code=4003)
        return
    
    # Connect
    await notification_manager.connect(websocket, tenant_id, user_id)
    
    try:
        # Send initial unread count
        db = await get_db()
        service = get_notification_service(db)
        count = await service.get_unread_count(tenant_id, user_id)
        await websocket.send_json({
            "type": "INITIAL_COUNT",
            "payload": {"unread_count": count}
        })
        
        # Keep connection alive
        while True:
            try:
                data = await websocket.receive_text()
                # Handle ping/pong or other client messages
                if data == "ping":
                    await websocket.send_text("pong")
            except WebSocketDisconnect:
                break
                
    except WebSocketDisconnect:
        pass
    finally:
        notification_manager.disconnect(websocket, tenant_id, user_id)
