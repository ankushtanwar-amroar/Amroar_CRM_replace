"""
WebSocket Manager for Notifications

Handles real-time notification delivery via WebSocket connections.
Each user maintains a connection that receives instant notification updates.
"""

import logging
import json
from typing import Dict, Set, Any
from fastapi import WebSocket, WebSocketDisconnect
from datetime import datetime, timezone

logger = logging.getLogger(__name__)


class NotificationWebSocketManager:
    """Manages WebSocket connections for real-time notifications"""
    
    def __init__(self):
        # Map: tenant_id -> user_id -> set of WebSocket connections
        self.connections: Dict[str, Dict[str, Set[WebSocket]]] = {}
    
    async def connect(self, websocket: WebSocket, tenant_id: str, user_id: str):
        """Register a new WebSocket connection"""
        await websocket.accept()
        
        if tenant_id not in self.connections:
            self.connections[tenant_id] = {}
        
        if user_id not in self.connections[tenant_id]:
            self.connections[tenant_id][user_id] = set()
        
        self.connections[tenant_id][user_id].add(websocket)
        logger.info(f"WebSocket connected: tenant={tenant_id}, user={user_id}")
    
    def disconnect(self, websocket: WebSocket, tenant_id: str, user_id: str):
        """Remove a WebSocket connection"""
        if tenant_id in self.connections:
            if user_id in self.connections[tenant_id]:
                self.connections[tenant_id][user_id].discard(websocket)
                if not self.connections[tenant_id][user_id]:
                    del self.connections[tenant_id][user_id]
                if not self.connections[tenant_id]:
                    del self.connections[tenant_id]
        
        logger.info(f"WebSocket disconnected: tenant={tenant_id}, user={user_id}")
    
    async def send_notification(self, tenant_id: str, user_id: str, notification: Dict[str, Any]):
        """Send a notification to a specific user"""
        if tenant_id not in self.connections:
            return
        
        if user_id not in self.connections[tenant_id]:
            return
        
        message = {
            "type": "NEW_NOTIFICATION",
            "payload": self._serialize_notification(notification),
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        
        disconnected = set()
        for websocket in self.connections[tenant_id][user_id]:
            try:
                await websocket.send_json(message)
            except Exception as e:
                logger.warning(f"Failed to send notification via WebSocket: {e}")
                disconnected.add(websocket)
        
        # Clean up disconnected sockets
        for ws in disconnected:
            self.connections[tenant_id][user_id].discard(ws)
    
    async def send_unread_count_update(self, tenant_id: str, user_id: str, count: int):
        """Send updated unread count to a user"""
        if tenant_id not in self.connections:
            return
        
        if user_id not in self.connections[tenant_id]:
            return
        
        message = {
            "type": "UNREAD_COUNT_UPDATE",
            "payload": {"unread_count": count},
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        
        disconnected = set()
        for websocket in self.connections[tenant_id][user_id]:
            try:
                await websocket.send_json(message)
            except Exception as e:
                logger.warning(f"Failed to send count update via WebSocket: {e}")
                disconnected.add(websocket)
        
        # Clean up disconnected sockets
        for ws in disconnected:
            self.connections[tenant_id][user_id].discard(ws)
    
    async def broadcast_to_user(self, tenant_id: str, user_id: str, message_type: str, payload: Dict[str, Any]):
        """Broadcast a message to all connections of a user"""
        if tenant_id not in self.connections:
            return
        
        if user_id not in self.connections[tenant_id]:
            return
        
        message = {
            "type": message_type,
            "payload": payload,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        
        disconnected = set()
        for websocket in self.connections[tenant_id][user_id]:
            try:
                await websocket.send_json(message)
            except Exception as e:
                logger.warning(f"Failed to broadcast via WebSocket: {e}")
                disconnected.add(websocket)
        
        # Clean up disconnected sockets
        for ws in disconnected:
            self.connections[tenant_id][user_id].discard(ws)
    
    def _serialize_notification(self, notification: Dict[str, Any]) -> Dict[str, Any]:
        """Serialize notification for JSON transmission"""
        result = {}
        for key, value in notification.items():
            if isinstance(value, datetime):
                result[key] = value.isoformat()
            else:
                result[key] = value
        return result
    
    def get_connected_users(self, tenant_id: str) -> list:
        """Get list of connected user IDs for a tenant"""
        if tenant_id not in self.connections:
            return []
        return list(self.connections[tenant_id].keys())


# Global singleton instance
notification_manager = NotificationWebSocketManager()
