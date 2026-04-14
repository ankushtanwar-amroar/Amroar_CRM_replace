"""
Chatter Module - Salesforce-like Chatter for CRM

Features:
- Rich text posts with formatting
- @Mention user tagging
- Activity feed
- Comments with threading
- Likes and reactions
- File attachments
- Notifications
"""
from .api.chatter_routes import router as chatter_router
from .services.chatter_service import ChatterService
from .models.chatter_models import (
    ChatterPost, ChatterPostCreate, ChatterPostUpdate,
    ChatterComment, ChatterCommentCreate,
    Reaction, ReactionCreate,
    ChatterNotification
)

__all__ = [
    "chatter_router",
    "ChatterService",
    "ChatterPost",
    "ChatterPostCreate",
    "ChatterPostUpdate",
    "ChatterComment",
    "ChatterCommentCreate",
    "Reaction",
    "ReactionCreate",
    "ChatterNotification"
]
