"""
Chatter API Routes - REST endpoints for Salesforce-like Chatter
"""
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from typing import Optional, List
from config.settings import settings
import logging
import os
import uuid
from datetime import datetime

from ..models.chatter_models import (
    ChatterPost, ChatterPostCreate, ChatterPostUpdate,
    ChatterComment, ChatterCommentCreate, ChatterCommentUpdate,
    Reaction, ReactionCreate, ReactionType,
    ChatterNotification, Author, Attachment,
    FeedQuery, FeedFilter, FeedResponse
)
from ..services.chatter_service import ChatterService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/chatter", tags=["Chatter"])


def get_chatter_service():
    """Get chatter service instance"""
    from server import db
    return ChatterService(db)


def get_current_user_dependency():
    """Get current authenticated user dependency"""
    from server import get_current_user
    return get_current_user


def user_to_dict(user) -> dict:
    """Convert User model to dict for easier access"""
    if isinstance(user, dict):
        return user
    return {
        "user_id": getattr(user, 'id', None) or getattr(user, 'user_id', None),
        "name": f"{getattr(user, 'first_name', '')} {getattr(user, 'last_name', '')}".strip() or getattr(user, 'name', 'Unknown'),
        "email": getattr(user, 'email', None),
        "tenant_id": getattr(user, 'tenant_id', None),
        "role": getattr(user, 'role_id', None),
        "avatar_url": getattr(user, 'avatar_url', None),
    }


# ============================================================================
# POST ENDPOINTS
# ============================================================================
@router.post("/posts", response_model=ChatterPost)
async def create_post(
    post_data: ChatterPostCreate,
    current_user = Depends(get_current_user_dependency())
):
    """Create a new chatter post"""
    service = get_chatter_service()
    user = user_to_dict(current_user)
    
    author = Author(
        user_id=user["user_id"],
        name=user["name"],
        email=user["email"],
        avatar_url=user["avatar_url"]
    )
    
    post = await service.create_post(
        tenant_id=user["tenant_id"],
        author=author,
        post_data=post_data
    )
    
    return post


@router.get("/posts/{post_id}", response_model=ChatterPost)
async def get_post(
    post_id: str,
    current_user = Depends(get_current_user_dependency())
):
    """Get a single post by ID"""
    service = get_chatter_service()
    user = user_to_dict(current_user)
    
    post = await service.get_post(
        tenant_id=user["tenant_id"],
        post_id=post_id
    )
    
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    
    return post


@router.put("/posts/{post_id}", response_model=ChatterPost)
async def update_post(
    post_id: str,
    update_data: ChatterPostUpdate,
    current_user = Depends(get_current_user_dependency())
):
    """Update a post (owner only)"""
    service = get_chatter_service()
    user = user_to_dict(current_user)
    
    post = await service.update_post(
        tenant_id=user["tenant_id"],
        post_id=post_id,
        user_id=user["user_id"],
        update_data=update_data
    )
    
    if not post:
        raise HTTPException(status_code=404, detail="Post not found or not authorized")
    
    return post


@router.delete("/posts/{post_id}")
async def delete_post(
    post_id: str,
    current_user = Depends(get_current_user_dependency())
):
    """Delete a post (owner or admin)"""
    service = get_chatter_service()
    user = user_to_dict(current_user)
    
    is_admin = user["role"] == "system_administrator"
    
    success = await service.delete_post(
        tenant_id=user["tenant_id"],
        post_id=post_id,
        user_id=user["user_id"],
        is_admin=is_admin
    )
    
    if not success:
        raise HTTPException(status_code=404, detail="Post not found or not authorized")
    
    return {"message": "Post deleted successfully"}


@router.get("/feed", response_model=FeedResponse)
async def get_feed(
    record_id: Optional[str] = None,
    record_type: Optional[str] = None,
    filter: FeedFilter = FeedFilter.ALL,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=50),
    search: Optional[str] = None,
    current_user = Depends(get_current_user_dependency())
):
    """Get paginated chatter feed"""
    service = get_chatter_service()
    user = user_to_dict(current_user)
    
    query = FeedQuery(
        record_id=record_id,
        record_type=record_type,
        filter=filter,
        page=page,
        page_size=page_size,
        search=search
    )
    
    return await service.get_feed(
        tenant_id=user["tenant_id"],
        user_id=user["user_id"],
        query=query
    )


# ============================================================================
# COMMENT ENDPOINTS
# ============================================================================
@router.post("/comments", response_model=ChatterComment)
async def create_comment(
    comment_data: ChatterCommentCreate,
    current_user = Depends(get_current_user_dependency())
):
    """Create a new comment"""
    service = get_chatter_service()
    user = user_to_dict(current_user)
    
    author = Author(
        user_id=user["user_id"],
        name=user["name"],
        email=user["email"],
        avatar_url=user["avatar_url"]
    )
    
    comment = await service.create_comment(
        tenant_id=user["tenant_id"],
        author=author,
        comment_data=comment_data
    )
    
    return comment


@router.get("/posts/{post_id}/comments", response_model=List[ChatterComment])
async def get_comments(
    post_id: str,
    parent_comment_id: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    current_user = Depends(get_current_user_dependency())
):
    """Get comments for a post"""
    service = get_chatter_service()
    user = user_to_dict(current_user)
    
    return await service.get_comments(
        tenant_id=user["tenant_id"],
        post_id=post_id,
        parent_comment_id=parent_comment_id,
        page=page,
        page_size=page_size
    )


@router.put("/comments/{comment_id}", response_model=ChatterComment)
async def update_comment(
    comment_id: str,
    update_data: ChatterCommentUpdate,
    current_user = Depends(get_current_user_dependency())
):
    """Update a comment"""
    service = get_chatter_service()
    user = user_to_dict(current_user)
    
    comment = await service.update_comment(
        tenant_id=user["tenant_id"],
        comment_id=comment_id,
        user_id=user["user_id"],
        update_data=update_data
    )
    
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found or not authorized")
    
    return comment


@router.delete("/comments/{comment_id}")
async def delete_comment(
    comment_id: str,
    current_user = Depends(get_current_user_dependency())
):
    """Delete a comment"""
    service = get_chatter_service()
    user = user_to_dict(current_user)
    
    is_admin = user["role"] == "system_administrator"
    
    success = await service.delete_comment(
        tenant_id=user["tenant_id"],
        comment_id=comment_id,
        user_id=user["user_id"],
        is_admin=is_admin
    )
    
    if not success:
        raise HTTPException(status_code=404, detail="Comment not found or not authorized")
    
    return {"message": "Comment deleted successfully"}


# ============================================================================
# REACTION ENDPOINTS
# ============================================================================
@router.post("/reactions", response_model=Reaction)
async def add_reaction(
    reaction_data: ReactionCreate,
    current_user = Depends(get_current_user_dependency())
):
    """Add a reaction (like) to a post or comment"""
    service = get_chatter_service()
    user = user_to_dict(current_user)
    
    reaction = await service.add_reaction(
        tenant_id=user["tenant_id"],
        user_id=user["user_id"],
        user_name=user["name"],
        reaction_data=reaction_data
    )
    
    return reaction


@router.delete("/reactions/{target_type}/{target_id}")
async def remove_reaction(
    target_type: str,
    target_id: str,
    current_user = Depends(get_current_user_dependency())
):
    """Remove a reaction"""
    service = get_chatter_service()
    user = user_to_dict(current_user)
    
    success = await service.remove_reaction(
        tenant_id=user["tenant_id"],
        user_id=user["user_id"],
        target_type=target_type,
        target_id=target_id
    )
    
    if not success:
        raise HTTPException(status_code=404, detail="Reaction not found")
    
    return {"message": "Reaction removed"}


@router.get("/reactions/{target_type}/{target_id}", response_model=List[Reaction])
async def get_reactions(
    target_type: str,
    target_id: str,
    reaction_type: Optional[str] = None,
    current_user = Depends(get_current_user_dependency())
):
    """Get all reactions for a post or comment"""
    service = get_chatter_service()
    user = user_to_dict(current_user)
    
    return await service.get_reactions(
        tenant_id=user["tenant_id"],
        target_type=target_type,
        target_id=target_id,
        reaction_type=reaction_type
    )


# ============================================================================
# NOTIFICATION ENDPOINTS
# ============================================================================
@router.get("/notifications", response_model=List[ChatterNotification])
async def get_notifications(
    unread_only: bool = False,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=50),
    current_user = Depends(get_current_user_dependency())
):
    """Get user notifications"""
    service = get_chatter_service()
    user = user_to_dict(current_user)
    
    return await service.get_notifications(
        tenant_id=user["tenant_id"],
        user_id=user["user_id"],
        unread_only=unread_only,
        page=page,
        page_size=page_size
    )


@router.get("/notifications/unread-count")
async def get_unread_count(
    current_user = Depends(get_current_user_dependency())
):
    """Get count of unread notifications"""
    service = get_chatter_service()
    user = user_to_dict(current_user)
    
    count = await service.get_unread_count(
        tenant_id=user["tenant_id"],
        user_id=user["user_id"]
    )
    
    return {"unread_count": count}


@router.post("/notifications/mark-read")
async def mark_notifications_read(
    notification_ids: Optional[List[str]] = None,
    current_user = Depends(get_current_user_dependency())
):
    """Mark notifications as read"""
    service = get_chatter_service()
    user = user_to_dict(current_user)
    
    count = await service.mark_notifications_read(
        tenant_id=user["tenant_id"],
        user_id=user["user_id"],
        notification_ids=notification_ids
    )
    
    return {"marked_read": count}


# ============================================================================
# USER SEARCH (for @mentions)
# ============================================================================
@router.get("/users/search")
async def search_users(
    q: str = Query(..., min_length=1),
    limit: int = Query(10, ge=1, le=20),
    current_user = Depends(get_current_user_dependency())
):
    """Search users for @mention suggestions"""
    service = get_chatter_service()
    user = user_to_dict(current_user)
    
    users = await service.search_users(
        tenant_id=user["tenant_id"],
        query=q,
        limit=limit
    )
    
    return {"users": users}


# ============================================================================
# FILE UPLOAD ENDPOINT
# ============================================================================
UPLOAD_DIR = os.path.join(settings.STORAGE_BASE_DIR, "uploads", "chatter")

@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    current_user = Depends(get_current_user_dependency())
):
    """Upload a file attachment for chatter posts"""
    # Ensure upload directory exists
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    
    # Validate file size (10MB max)
    contents = await file.read()
    if len(contents) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 10MB)")
    
    # Generate unique filename
    ext = os.path.splitext(file.filename)[1]
    unique_name = f"{uuid.uuid4().hex}{ext}"
    file_path = os.path.join(UPLOAD_DIR, unique_name)
    
    # Save file
    with open(file_path, "wb") as f:
        f.write(contents)
    
    # Generate URL
    backend_url = os.environ.get("BACKEND_URL", "")
    file_url = f"{backend_url}/api/chatter/files/{unique_name}"
    
    # Generate thumbnail for images
    thumbnail_url = None
    if file.content_type and file.content_type.startswith("image/"):
        thumbnail_url = file_url  # Use same URL for now
    
    return {
        "id": unique_name.split(".")[0],
        "filename": file.filename,
        "file_type": file.content_type,
        "file_size": len(contents),
        "url": file_url,
        "thumbnail_url": thumbnail_url
    }


@router.get("/files/{filename}")
async def get_file(filename: str):
    """Serve uploaded file"""
    from fastapi.responses import FileResponse
    
    file_path = os.path.join(UPLOAD_DIR, filename)
    
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")
    
    return FileResponse(file_path)
