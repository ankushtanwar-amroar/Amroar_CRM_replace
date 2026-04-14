"""
Notes Module

Enterprise-grade Enhanced Notes system for CRM.
"""
from .api.notes_routes import notes_router
from .services.notes_service import NotesService
from .models.note_models import (
    Note, NoteCreate, NoteUpdate, NoteResponse,
    NoteLink, NoteLinkCreate, NoteLinkResponse,
    NoteShare, NoteShareCreate, NoteShareResponse,
    ShareType, Visibility
)

__all__ = [
    "notes_router",
    "NotesService",
    "Note",
    "NoteCreate",
    "NoteUpdate",
    "NoteResponse",
    "NoteLink",
    "NoteLinkCreate",
    "NoteLinkResponse",
    "NoteShare",
    "NoteShareCreate",
    "NoteShareResponse",
    "ShareType",
    "Visibility"
]
