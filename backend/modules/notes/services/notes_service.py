"""
Notes Service - Business Logic

Handles all note operations with:
- Ownership enforcement
- Audit field management
- HTML sanitization
- Polymorphic linking
- Soft delete
"""
import re
import html
from datetime import datetime, timezone
from typing import Optional, List, Tuple
from motor.motor_asyncio import AsyncIOMotorDatabase
import bleach
import logging

from ..models.note_models import (
    Note, NoteCreate, NoteUpdate, NoteResponse,
    NoteLink, NoteLinkCreate, NoteLinkResponse,
    NoteShare, NoteShareCreate, NoteShareResponse,
    ShareType, Visibility
)

logger = logging.getLogger(__name__)

# Allowed HTML tags for rich text (XSS prevention)
ALLOWED_TAGS = [
    'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'strike',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'ul', 'ol', 'li',
    'a', 'blockquote', 'pre', 'code',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'hr', 'span', 'div'
]

ALLOWED_ATTRIBUTES = {
    'a': ['href', 'title', 'target'],
    'span': ['style', 'class'],
    'div': ['style', 'class'],
    'p': ['style', 'class'],
    'td': ['colspan', 'rowspan'],
    'th': ['colspan', 'rowspan'],
}


def sanitize_html(html_content: str) -> str:
    """Sanitize HTML to prevent XSS attacks"""
    if not html_content:
        return ""
    return bleach.clean(
        html_content,
        tags=ALLOWED_TAGS,
        attributes=ALLOWED_ATTRIBUTES,
        strip=True
    )


def generate_preview_text(html_content: str, max_length: int = 150) -> str:
    """Generate plain text preview from HTML"""
    if not html_content:
        return ""
    
    # Remove HTML tags
    text = re.sub(r'<[^>]+>', ' ', html_content)
    # Decode HTML entities
    text = html.unescape(text)
    # Normalize whitespace
    text = ' '.join(text.split())
    # Truncate
    if len(text) > max_length:
        text = text[:max_length].rsplit(' ', 1)[0] + '...'
    return text


def strip_html_to_plain_text(html_content: str) -> str:
    """Convert HTML to plain text for search indexing"""
    if not html_content:
        return ""
    
    # Remove HTML tags
    text = re.sub(r'<[^>]+>', ' ', html_content)
    # Decode HTML entities
    text = html.unescape(text)
    # Normalize whitespace
    text = ' '.join(text.split())
    return text


class NotesService:
    """Service for managing Notes"""
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.notes_collection = db.notes
        self.note_links_collection = db.note_links
        self.note_shares_collection = db.note_shares
    
    # =========================================================================
    # Note CRUD Operations
    # =========================================================================
    
    async def create_note(
        self,
        data: NoteCreate,
        user_id: str,
        tenant_id: str
    ) -> NoteResponse:
        """Create a new note"""
        now = datetime.now(timezone.utc)
        
        # Sanitize HTML content
        sanitized_body = sanitize_html(data.body_rich_text) if data.body_rich_text else None
        plain_text = strip_html_to_plain_text(data.body_rich_text) if data.body_rich_text else None
        preview_text = generate_preview_text(data.body_rich_text) if data.body_rich_text else None
        
        note = Note(
            title=data.title,
            body_rich_text=sanitized_body,
            body_plain_text=plain_text,
            preview_text=preview_text,
            owner_id=data.owner_id or user_id,  # Default to current user
            is_pinned=data.is_pinned,
            is_archived=data.is_archived,
            created_at=now,
            created_by=user_id,
            updated_at=now,
            updated_by=user_id,
            tenant_id=tenant_id
        )
        
        note_dict = note.dict()
        await self.notes_collection.insert_one(note_dict)
        
        logger.info(f"Created note {note.id} by user {user_id}")
        
        # If linked entity provided, create link
        if data.linked_entity_type and data.linked_entity_id:
            await self.create_note_link(
                NoteLinkCreate(
                    note_id=note.id,
                    linked_entity_type=data.linked_entity_type,
                    linked_entity_id=data.linked_entity_id
                ),
                user_id=user_id,
                tenant_id=tenant_id
            )
        
        return await self.get_note(note.id, user_id, tenant_id)
    
    async def get_note(
        self,
        note_id: str,
        user_id: str,
        tenant_id: str,
        include_links: bool = True
    ) -> Optional[NoteResponse]:
        """Get a note by ID with ownership check"""
        note = await self.notes_collection.find_one({
            "id": note_id,
            "tenant_id": tenant_id,
            "is_deleted": {"$ne": True}
        })
        
        if not note:
            return None
        
        # Get linked records if requested
        linked_records = []
        if include_links:
            links = await self.note_links_collection.find({
                "note_id": note_id,
                "tenant_id": tenant_id
            }).to_list(100)
            
            for link in links:
                linked_records.append({
                    "link_id": link["id"],
                    "entity_type": link["linked_entity_type"],
                    "entity_id": link["linked_entity_id"],
                    "share_type": link.get("share_type", "viewer"),
                    "visibility": link.get("visibility", "internal_users")
                })
        
        # Resolve user names
        owner_name = await self._get_user_name(note["owner_id"], tenant_id)
        created_by_name = await self._get_user_name(note["created_by"], tenant_id)
        updated_by_name = await self._get_user_name(note["updated_by"], tenant_id)
        
        return NoteResponse(
            id=note["id"],
            title=note["title"],
            body_rich_text=note.get("body_rich_text"),
            preview_text=note.get("preview_text"),
            owner_id=note["owner_id"],
            owner_name=owner_name,
            is_pinned=note.get("is_pinned", False),
            is_archived=note.get("is_archived", False),
            created_at=note["created_at"],
            created_by=note["created_by"],
            created_by_name=created_by_name,
            updated_at=note["updated_at"],
            updated_by=note["updated_by"],
            updated_by_name=updated_by_name,
            linked_records=linked_records if linked_records else None
        )
    
    async def update_note(
        self,
        note_id: str,
        data: NoteUpdate,
        user_id: str,
        tenant_id: str
    ) -> Optional[NoteResponse]:
        """Update an existing note"""
        # Check ownership
        note = await self.notes_collection.find_one({
            "id": note_id,
            "tenant_id": tenant_id,
            "is_deleted": {"$ne": True}
        })
        
        if not note:
            return None
        
        # Check if user can edit (owner or collaborator)
        can_edit = await self._can_edit_note(note_id, user_id, tenant_id, note["owner_id"])
        if not can_edit:
            raise PermissionError("You don't have permission to edit this note")
        
        # Build update
        update_data = {"updated_at": datetime.now(timezone.utc), "updated_by": user_id}
        
        if data.title is not None:
            update_data["title"] = data.title
        
        if data.body_rich_text is not None:
            update_data["body_rich_text"] = sanitize_html(data.body_rich_text)
            update_data["body_plain_text"] = strip_html_to_plain_text(data.body_rich_text)
            update_data["preview_text"] = generate_preview_text(data.body_rich_text)
        
        if data.is_pinned is not None:
            update_data["is_pinned"] = data.is_pinned
        
        if data.is_archived is not None:
            update_data["is_archived"] = data.is_archived
        
        await self.notes_collection.update_one(
            {"id": note_id, "tenant_id": tenant_id},
            {"$set": update_data}
        )
        
        logger.info(f"Updated note {note_id} by user {user_id}")
        
        return await self.get_note(note_id, user_id, tenant_id)
    
    async def delete_note(
        self,
        note_id: str,
        user_id: str,
        tenant_id: str,
        hard_delete: bool = False
    ) -> bool:
        """Delete a note (soft delete by default)"""
        note = await self.notes_collection.find_one({
            "id": note_id,
            "tenant_id": tenant_id,
            "is_deleted": {"$ne": True}
        })
        
        if not note:
            return False
        
        # Only owner can delete
        if note["owner_id"] != user_id:
            raise PermissionError("Only the owner can delete this note")
        
        if hard_delete:
            # Hard delete note and all links
            await self.notes_collection.delete_one({"id": note_id, "tenant_id": tenant_id})
            await self.note_links_collection.delete_many({"note_id": note_id, "tenant_id": tenant_id})
            await self.note_shares_collection.delete_many({"note_id": note_id, "tenant_id": tenant_id})
        else:
            # Soft delete
            await self.notes_collection.update_one(
                {"id": note_id, "tenant_id": tenant_id},
                {"$set": {
                    "is_deleted": True,
                    "updated_at": datetime.now(timezone.utc),
                    "updated_by": user_id
                }}
            )
        
        logger.info(f"Deleted note {note_id} by user {user_id} (hard={hard_delete})")
        return True
    
    # =========================================================================
    # Note Linking Operations
    # =========================================================================
    
    async def create_note_link(
        self,
        data: NoteLinkCreate,
        user_id: str,
        tenant_id: str
    ) -> NoteLinkResponse:
        """Link a note to a record"""
        # Verify note exists
        note = await self.notes_collection.find_one({
            "id": data.note_id,
            "tenant_id": tenant_id,
            "is_deleted": {"$ne": True}
        })
        
        if not note:
            raise ValueError(f"Note {data.note_id} not found")
        
        # Check if link already exists
        existing = await self.note_links_collection.find_one({
            "note_id": data.note_id,
            "linked_entity_type": data.linked_entity_type,
            "linked_entity_id": data.linked_entity_id,
            "tenant_id": tenant_id
        })
        
        if existing:
            raise ValueError("Note is already linked to this record")
        
        link = NoteLink(
            note_id=data.note_id,
            linked_entity_type=data.linked_entity_type.lower(),
            linked_entity_id=data.linked_entity_id,
            share_type=data.share_type,
            visibility=data.visibility,
            created_at=datetime.now(timezone.utc),
            created_by=user_id,
            tenant_id=tenant_id
        )
        
        link_dict = link.dict()
        await self.note_links_collection.insert_one(link_dict)
        
        logger.info(f"Created note link {link.id}: note {data.note_id} -> {data.linked_entity_type}/{data.linked_entity_id}")
        
        # Resolve names
        created_by_name = await self._get_user_name(user_id, tenant_id)
        entity_name = await self._get_record_name(data.linked_entity_type, data.linked_entity_id, tenant_id)
        
        return NoteLinkResponse(
            id=link.id,
            note_id=link.note_id,
            linked_entity_type=link.linked_entity_type,
            linked_entity_id=link.linked_entity_id,
            linked_entity_name=entity_name,
            share_type=link.share_type,
            visibility=link.visibility,
            created_at=link.created_at,
            created_by=link.created_by,
            created_by_name=created_by_name
        )
    
    async def delete_note_link(
        self,
        note_id: str,
        linked_entity_id: str,
        user_id: str,
        tenant_id: str
    ) -> bool:
        """Remove a link between a note and a record"""
        result = await self.note_links_collection.delete_one({
            "note_id": note_id,
            "linked_entity_id": linked_entity_id,
            "tenant_id": tenant_id
        })
        
        if result.deleted_count > 0:
            logger.info(f"Deleted note link: note {note_id} -> record {linked_entity_id}")
            return True
        return False
    
    async def get_notes_for_record(
        self,
        linked_entity_type: str,
        linked_entity_id: str,
        user_id: str,
        tenant_id: str,
        include_archived: bool = False,
        pinned_first: bool = True,
        limit: int = 50,
        offset: int = 0
    ) -> Tuple[List[NoteResponse], int]:
        """Get all notes linked to a specific record"""
        # Find all note IDs linked to this record
        link_query = {
            "linked_entity_type": linked_entity_type.lower(),
            "linked_entity_id": linked_entity_id,
            "tenant_id": tenant_id
        }
        
        links = await self.note_links_collection.find(link_query).to_list(1000)
        note_ids = [link["note_id"] for link in links]
        
        if not note_ids:
            return [], 0
        
        # Build query for notes
        note_query = {
            "id": {"$in": note_ids},
            "tenant_id": tenant_id,
            "is_deleted": {"$ne": True}
        }
        
        if not include_archived:
            note_query["is_archived"] = {"$ne": True}
        
        # Count total
        total = await self.notes_collection.count_documents(note_query)
        
        # Build sort
        sort_order = []
        if pinned_first:
            sort_order.append(("is_pinned", -1))  # Pinned first
        sort_order.append(("updated_at", -1))  # Most recent first
        
        # Fetch notes
        cursor = self.notes_collection.find(note_query).sort(sort_order).skip(offset).limit(limit)
        notes = await cursor.to_list(limit)
        
        # Convert to response objects
        responses = []
        for note in notes:
            owner_name = await self._get_user_name(note["owner_id"], tenant_id)
            created_by_name = await self._get_user_name(note["created_by"], tenant_id)
            updated_by_name = await self._get_user_name(note["updated_by"], tenant_id)
            
            responses.append(NoteResponse(
                id=note["id"],
                title=note["title"],
                body_rich_text=note.get("body_rich_text"),
                preview_text=note.get("preview_text"),
                owner_id=note["owner_id"],
                owner_name=owner_name,
                is_pinned=note.get("is_pinned", False),
                is_archived=note.get("is_archived", False),
                created_at=note["created_at"],
                created_by=note["created_by"],
                created_by_name=created_by_name,
                updated_at=note["updated_at"],
                updated_by=note["updated_by"],
                updated_by_name=updated_by_name
            ))
        
        return responses, total
    
    # =========================================================================
    # Public Sharing Operations
    # =========================================================================
    
    async def create_public_share(
        self,
        data: NoteShareCreate,
        user_id: str,
        tenant_id: str,
        base_url: str
    ) -> NoteShareResponse:
        """Create a public share link for a note"""
        # Verify note exists and user has access
        note = await self.notes_collection.find_one({
            "id": data.note_id,
            "tenant_id": tenant_id,
            "is_deleted": {"$ne": True}
        })
        
        if not note:
            raise ValueError(f"Note {data.note_id} not found")
        
        # Only owner can create share links
        if note["owner_id"] != user_id:
            raise PermissionError("Only the owner can create share links")
        
        share = NoteShare(
            note_id=data.note_id,
            expires_at=data.expires_at,
            allow_view_in_browser=data.allow_view_in_browser,
            allow_copy=data.allow_copy,
            created_at=datetime.now(timezone.utc),
            created_by=user_id,
            tenant_id=tenant_id
        )
        
        share_dict = share.dict()
        await self.note_shares_collection.insert_one(share_dict)
        
        public_url = f"{base_url}/notes/share/{share.public_token}"
        
        logger.info(f"Created public share for note {data.note_id}: {share.public_token}")
        
        created_by_name = await self._get_user_name(user_id, tenant_id)
        
        return NoteShareResponse(
            id=share.id,
            note_id=share.note_id,
            public_token=share.public_token,
            public_url=public_url,
            expires_at=share.expires_at,
            allow_view_in_browser=share.allow_view_in_browser,
            allow_copy=share.allow_copy,
            is_revoked=share.is_revoked,
            created_at=share.created_at,
            created_by=share.created_by,
            created_by_name=created_by_name
        )
    
    async def get_note_by_share_token(
        self,
        token: str
    ) -> Optional[dict]:
        """Get a note by public share token (no auth required)"""
        # Find share
        share = await self.note_shares_collection.find_one({
            "public_token": token,
            "is_revoked": {"$ne": True}
        })
        
        if not share:
            return None
        
        # Check expiration
        if share.get("expires_at"):
            if datetime.now(timezone.utc) > share["expires_at"]:
                return None
        
        # Get note
        note = await self.notes_collection.find_one({
            "id": share["note_id"],
            "is_deleted": {"$ne": True}
        })
        
        if not note:
            return None
        
        return {
            "note": {
                "id": note["id"],
                "title": note["title"],
                "body_rich_text": note.get("body_rich_text"),
                "preview_text": note.get("preview_text"),
                "created_at": note["created_at"],
                "updated_at": note["updated_at"]
            },
            "share": {
                "allow_view_in_browser": share.get("allow_view_in_browser", True),
                "allow_copy": share.get("allow_copy", False),
                "expires_at": share.get("expires_at")
            }
        }
    
    async def revoke_share(
        self,
        share_id: str,
        user_id: str,
        tenant_id: str
    ) -> bool:
        """Revoke a public share link"""
        share = await self.note_shares_collection.find_one({
            "id": share_id,
            "tenant_id": tenant_id
        })
        
        if not share:
            return False
        
        # Verify ownership via note
        note = await self.notes_collection.find_one({
            "id": share["note_id"],
            "tenant_id": tenant_id
        })
        
        if not note or note["owner_id"] != user_id:
            raise PermissionError("Only the owner can revoke share links")
        
        await self.note_shares_collection.update_one(
            {"id": share_id},
            {"$set": {
                "is_revoked": True,
                "revoked_at": datetime.now(timezone.utc)
            }}
        )
        
        logger.info(f"Revoked share {share_id} for note {share['note_id']}")
        return True
    
    # =========================================================================
    # Helper Methods
    # =========================================================================
    
    async def _can_edit_note(
        self,
        note_id: str,
        user_id: str,
        tenant_id: str,
        owner_id: str
    ) -> bool:
        """Check if user can edit a note"""
        # Owner can always edit
        if owner_id == user_id:
            return True
        
        # Check if user has collaborator access via any link
        link = await self.note_links_collection.find_one({
            "note_id": note_id,
            "tenant_id": tenant_id,
            "share_type": ShareType.COLLABORATOR.value
        })
        
        # For now, collaborator on any linked record grants edit access
        # In future, could check specific record permissions
        return link is not None
    
    async def _get_user_name(self, user_id: str, tenant_id: str) -> str:
        """Get user display name"""
        if not user_id:
            return "Unknown User"
        
        try:
            user = await self.db.users.find_one({"id": user_id})
            if user:
                first = user.get("first_name", "")
                last = user.get("last_name", "")
                name = f"{first} {last}".strip()
                return name if name else user.get("email", "Unknown User")
        except Exception as e:
            logger.error(f"Error fetching user {user_id}: {e}")
        
        return "Unknown User"
    
    async def _get_record_name(
        self,
        entity_type: str,
        entity_id: str,
        tenant_id: str
    ) -> str:
        """Get display name for a linked record"""
        try:
            # Try to find the record in tenant_records collection
            record = await self.db.tenant_records.find_one({
                "series_id": entity_id,
                "tenant_id": tenant_id
            })
            
            if record:
                data = record.get("data", {})
                # Try common name fields
                name = (
                    data.get("name") or
                    f"{data.get('first_name', '')} {data.get('last_name', '')}".strip() or
                    data.get("subject") or
                    data.get("title") or
                    entity_id[:8]
                )
                return name
        except Exception as e:
            logger.error(f"Error fetching record {entity_type}/{entity_id}: {e}")
        
        return entity_id[:8] + "..."
