"""
Notes API Routes

RESTful API for Notes module following Salesforce Enhanced Notes pattern.

Endpoints:
- POST   /api/notes                    - Create note
- GET    /api/notes/{id}               - Get note
- PUT    /api/notes/{id}               - Update note
- DELETE /api/notes/{id}               - Delete note (soft)
- GET    /api/records/{type}/{id}/notes - Get notes for record
- POST   /api/notes/{id}/link          - Link note to record
- DELETE /api/notes/{id}/link/{record_id} - Unlink note from record
- POST   /api/notes/{id}/share         - Create public share
- DELETE /api/notes/share/{share_id}   - Revoke share
- GET    /api/notes/share/{token}      - Public access (no auth)
"""
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request, Query
import logging

from ..models.note_models import (
    NoteCreate, NoteUpdate, NoteResponse,
    NoteLinkCreate, NoteLinkResponse,
    NoteShareCreate, NoteShareResponse,
    NotesListResponse, ShareType, Visibility
)
from ..services.notes_service import NotesService

# Import db from server module
from server import db

logger = logging.getLogger(__name__)

notes_router = APIRouter(prefix="/api/notes", tags=["Notes"])


# =============================================================================
# Helpers & Dependencies
# =============================================================================

def get_current_user_dependency():
    """Get current user dependency from server"""
    from server import get_current_user
    return get_current_user


def user_to_dict(user) -> dict:
    """Convert User model to dict for easier access"""
    if isinstance(user, dict):
        return user
    return {
        "id": getattr(user, 'id', None) or getattr(user, 'user_id', None),
        "name": f"{getattr(user, 'first_name', '')} {getattr(user, 'last_name', '')}".strip() or getattr(user, 'name', 'Unknown'),
        "email": getattr(user, 'email', None),
        "tenant_id": getattr(user, 'tenant_id', 'default'),
    }


def get_service() -> NotesService:
    """Get NotesService instance"""
    return NotesService(db)


# =============================================================================
# Note CRUD Endpoints
# =============================================================================

@notes_router.post("", response_model=NoteResponse)
async def create_note(
    data: NoteCreate,
    request: Request,
    current_user = Depends(get_current_user_dependency())
):
    """
    Create a new note.
    
    - **title**: Required. Note title.
    - **body_rich_text**: Optional. HTML content.
    - **linked_entity_type**: Optional. Object type to link (account, contact, etc.)
    - **linked_entity_id**: Optional. Record ID to link.
    """
    try:
        user = user_to_dict(current_user)
        service = get_service()
        note = await service.create_note(
            data=data,
            user_id=user["id"],
            tenant_id=user.get("tenant_id", "default")
        )
        return note
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating note: {e}")
        raise HTTPException(status_code=500, detail="Failed to create note")


@notes_router.get("/{note_id}", response_model=NoteResponse)
async def get_note(
    note_id: str,
    request: Request,
    current_user = Depends(get_current_user_dependency())
):
    """Get a note by ID"""
    user = user_to_dict(current_user)
    service = get_service()
    note = await service.get_note(
        note_id=note_id,
        user_id=user["id"],
        tenant_id=user.get("tenant_id", "default")
    )
    
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    
    return note


@notes_router.put("/{note_id}", response_model=NoteResponse)
async def update_note(
    note_id: str,
    data: NoteUpdate,
    request: Request,
    current_user = Depends(get_current_user_dependency())
):
    """
    Update an existing note.
    
    Only the owner or collaborators can edit.
    """
    try:
        user = user_to_dict(current_user)
        service = get_service()
        note = await service.update_note(
            note_id=note_id,
            data=data,
            user_id=user["id"],
            tenant_id=user.get("tenant_id", "default")
        )
        
        if not note:
            raise HTTPException(status_code=404, detail="Note not found")
        
        return note
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating note {note_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to update note")


@notes_router.delete("/{note_id}")
async def delete_note(
    note_id: str,
    request: Request,
    hard_delete: bool = Query(False, description="Permanently delete instead of soft delete"),
    current_user = Depends(get_current_user_dependency())
):
    """
    Delete a note.
    
    By default, performs soft delete. Use hard_delete=true for permanent removal.
    Only the owner can delete.
    """
    try:
        user = user_to_dict(current_user)
        service = get_service()
        success = await service.delete_note(
            note_id=note_id,
            user_id=user["id"],
            tenant_id=user.get("tenant_id", "default"),
            hard_delete=hard_delete
        )
        
        if not success:
            raise HTTPException(status_code=404, detail="Note not found")
        
        return {"message": "Note deleted successfully", "id": note_id}
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except Exception as e:
        logger.error(f"Error deleting note {note_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete note")


# =============================================================================
# Note Linking Endpoints
# =============================================================================

@notes_router.post("/{note_id}/link", response_model=NoteLinkResponse)
async def link_note_to_record(
    note_id: str,
    linked_entity_type: str = Query(..., description="Object type (account, contact, lead, etc.)"),
    linked_entity_id: str = Query(..., description="Record ID"),
    share_type: ShareType = Query(ShareType.VIEWER, description="Access level"),
    visibility: Visibility = Query(Visibility.INTERNAL_USERS, description="Visibility scope"),
    request: Request = None,
    current_user = Depends(get_current_user_dependency())
):
    """
    Link a note to a record.
    
    A note can be linked to multiple records (many-to-many).
    """
    try:
        user = user_to_dict(current_user)
        service = get_service()
        link = await service.create_note_link(
            data=NoteLinkCreate(
                note_id=note_id,
                linked_entity_type=linked_entity_type,
                linked_entity_id=linked_entity_id,
                share_type=share_type,
                visibility=visibility
            ),
            user_id=user["id"],
            tenant_id=user.get("tenant_id", "default")
        )
        return link
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error linking note {note_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to link note")


@notes_router.delete("/{note_id}/link/{record_id}")
async def unlink_note_from_record(
    note_id: str,
    record_id: str,
    request: Request,
    current_user = Depends(get_current_user_dependency())
):
    """Remove a link between a note and a record"""
    user = user_to_dict(current_user)
    service = get_service()
    success = await service.delete_note_link(
        note_id=note_id,
        linked_entity_id=record_id,
        user_id=user["id"],
        tenant_id=user.get("tenant_id", "default")
    )
    
    if not success:
        raise HTTPException(status_code=404, detail="Link not found")
    
    return {"message": "Link removed successfully"}


# =============================================================================
# Get Notes for Record Endpoint
# =============================================================================

@notes_router.get("/for-record/{entity_type}/{entity_id}", response_model=NotesListResponse)
async def get_notes_for_record(
    entity_type: str,
    entity_id: str,
    request: Request,
    include_archived: bool = Query(False, description="Include archived notes"),
    pinned_first: bool = Query(True, description="Sort pinned notes first"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    current_user = Depends(get_current_user_dependency())
):
    """
    Get all notes linked to a specific record.
    
    - **entity_type**: Object type (account, contact, lead, deal, case, etc.)
    - **entity_id**: Record ID
    """
    user = user_to_dict(current_user)
    service = get_service()
    notes, total = await service.get_notes_for_record(
        linked_entity_type=entity_type,
        linked_entity_id=entity_id,
        user_id=user["id"],
        tenant_id=user.get("tenant_id", "default"),
        include_archived=include_archived,
        pinned_first=pinned_first,
        limit=limit,
        offset=offset
    )
    
    return NotesListResponse(
        notes=notes,
        total=total,
        limit=limit,
        offset=offset
    )


# =============================================================================
# Public Share Endpoints
# =============================================================================

@notes_router.post("/{note_id}/share", response_model=NoteShareResponse)
async def create_public_share(
    note_id: str,
    request: Request,
    expires_at: Optional[datetime] = Query(None, description="Expiration time"),
    allow_view_in_browser: bool = Query(True, description="Allow viewing in browser"),
    allow_copy: bool = Query(False, description="Allow copying content"),
    current_user = Depends(get_current_user_dependency())
):
    """
    Create a public share link for a note.
    
    Only the owner can create share links.
    """
    try:
        user = user_to_dict(current_user)
        # Get base URL from request
        base_url = str(request.base_url).rstrip('/')
        
        service = get_service()
        share = await service.create_public_share(
            data=NoteShareCreate(
                note_id=note_id,
                expires_at=expires_at,
                allow_view_in_browser=allow_view_in_browser,
                allow_copy=allow_copy
            ),
            user_id=user["id"],
            tenant_id=user.get("tenant_id", "default"),
            base_url=base_url
        )
        return share
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating share for note {note_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to create share link")


@notes_router.delete("/share/{share_id}")
async def revoke_public_share(
    share_id: str,
    request: Request,
    current_user = Depends(get_current_user_dependency())
):
    """
    Revoke a public share link.
    
    Only the owner can revoke share links.
    """
    try:
        user = user_to_dict(current_user)
        service = get_service()
        success = await service.revoke_share(
            share_id=share_id,
            user_id=user["id"],
            tenant_id=user.get("tenant_id", "default")
        )
        
        if not success:
            raise HTTPException(status_code=404, detail="Share not found")
        
        return {"message": "Share revoked successfully"}
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))


@notes_router.get("/share/{token}")
async def get_public_note(
    token: str,
    request: Request
):
    """
    Get a note via public share token.
    
    No authentication required.
    Returns note content if token is valid and not expired/revoked.
    """
    service = get_service()
    result = await service.get_note_by_share_token(token)
    
    if not result:
        raise HTTPException(status_code=404, detail="Share not found or expired")
    
    return result
