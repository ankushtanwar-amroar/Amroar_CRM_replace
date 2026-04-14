"""
Chatter Models - Pydantic models for Salesforce-like Chatter functionality
"""
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum
import uuid


class PostVisibility(str, Enum):
    PUBLIC = "PUBLIC"
    TEAM = "TEAM"
    PRIVATE = "PRIVATE"


class ReactionType(str, Enum):
    LIKE = "LIKE"
    LOVE = "LOVE"
    CELEBRATE = "CELEBRATE"
    INSIGHTFUL = "INSIGHTFUL"
    CURIOUS = "CURIOUS"


class MentionType(str, Enum):
    USER = "USER"
    GROUP = "GROUP"
    RECORD = "RECORD"


# ============================================================================
# MENTION MODELS
# ============================================================================
class Mention(BaseModel):
    """Represents a @mention in a post or comment"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4())[:8])
    type: MentionType = MentionType.USER
    user_id: Optional[str] = None
    group_id: Optional[str] = None
    record_id: Optional[str] = None
    display_name: str
    start_index: int = 0  # Position in text
    end_index: int = 0


# ============================================================================
# ATTACHMENT MODELS
# ============================================================================
class Attachment(BaseModel):
    """File or image attachment"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4())[:12])
    filename: str
    file_type: str  # image/png, application/pdf, etc.
    file_size: int  # bytes
    url: str
    thumbnail_url: Optional[str] = None
    uploaded_at: datetime = Field(default_factory=datetime.utcnow)


# ============================================================================
# AUTHOR MODEL (Embedded in posts/comments)
# ============================================================================
class Author(BaseModel):
    """Author information embedded in posts/comments"""
    user_id: str
    name: str
    email: Optional[str] = None
    avatar_url: Optional[str] = None
    role: Optional[str] = None


# ============================================================================
# POST MODELS
# ============================================================================
class ChatterPostCreate(BaseModel):
    """Create a new chatter post"""
    content: str  # HTML content from rich text editor
    plain_text: str  # Plain text version for search
    record_id: Optional[str] = None  # Related record ID
    record_type: Optional[str] = None  # Related object type (lead, account, etc.)
    visibility: PostVisibility = PostVisibility.PUBLIC
    mentions: List[Mention] = []
    attachments: List[Attachment] = []
    parent_post_id: Optional[str] = None  # For shared/quoted posts


class ChatterPostUpdate(BaseModel):
    """Update an existing post"""
    content: Optional[str] = None
    plain_text: Optional[str] = None
    visibility: Optional[PostVisibility] = None
    mentions: Optional[List[Mention]] = None
    attachments: Optional[List[Attachment]] = None


class ChatterPost(BaseModel):
    """Full chatter post model"""
    id: str = Field(default_factory=lambda: f"post-{uuid.uuid4().hex[:12]}")
    tenant_id: str
    author: Author
    content: str
    plain_text: str
    record_id: Optional[str] = None
    record_type: Optional[str] = None
    visibility: PostVisibility = PostVisibility.PUBLIC
    mentions: List[Mention] = []
    attachments: List[Attachment] = []
    parent_post_id: Optional[str] = None
    
    # Engagement metrics
    like_count: int = 0
    comment_count: int = 0
    share_count: int = 0
    
    # Reactions breakdown
    reactions: Dict[str, int] = Field(default_factory=lambda: {
        "LIKE": 0, "LOVE": 0, "CELEBRATE": 0, "INSIGHTFUL": 0, "CURIOUS": 0
    })
    
    # Metadata
    is_edited: bool = False
    is_pinned: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    class Config:
        json_encoders = {datetime: lambda v: v.isoformat()}


# ============================================================================
# COMMENT MODELS
# ============================================================================
class ChatterCommentCreate(BaseModel):
    """Create a new comment"""
    post_id: str
    content: str  # HTML content
    plain_text: str
    parent_comment_id: Optional[str] = None  # For nested comments
    mentions: List[Mention] = []
    attachments: List[Attachment] = []


class ChatterCommentUpdate(BaseModel):
    """Update a comment"""
    content: Optional[str] = None
    plain_text: Optional[str] = None
    mentions: Optional[List[Mention]] = None


class ChatterComment(BaseModel):
    """Full comment model"""
    id: str = Field(default_factory=lambda: f"comment-{uuid.uuid4().hex[:12]}")
    tenant_id: str
    post_id: str
    parent_comment_id: Optional[str] = None
    author: Author
    content: str
    plain_text: str
    mentions: List[Mention] = []
    attachments: List[Attachment] = []
    
    # Engagement
    like_count: int = 0
    reactions: Dict[str, int] = Field(default_factory=lambda: {
        "LIKE": 0, "LOVE": 0, "CELEBRATE": 0, "INSIGHTFUL": 0, "CURIOUS": 0
    })
    
    # Nested replies
    reply_count: int = 0
    
    # Metadata
    is_edited: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    class Config:
        json_encoders = {datetime: lambda v: v.isoformat()}


# ============================================================================
# REACTION/LIKE MODELS
# ============================================================================
class ReactionCreate(BaseModel):
    """Create a reaction (like)"""
    target_type: str  # "post" or "comment"
    target_id: str
    reaction_type: ReactionType = ReactionType.LIKE


class Reaction(BaseModel):
    """Full reaction model"""
    id: str = Field(default_factory=lambda: f"reaction-{uuid.uuid4().hex[:12]}")
    tenant_id: str
    user_id: str
    user_name: str
    target_type: str
    target_id: str
    reaction_type: ReactionType
    created_at: datetime = Field(default_factory=datetime.utcnow)


# ============================================================================
# NOTIFICATION MODELS
# ============================================================================
class NotificationType(str, Enum):
    MENTION = "MENTION"
    COMMENT = "COMMENT"
    LIKE = "LIKE"
    REPLY = "REPLY"
    SHARE = "SHARE"


class ChatterNotification(BaseModel):
    """Notification for mentions, likes, comments"""
    id: str = Field(default_factory=lambda: f"notif-{uuid.uuid4().hex[:12]}")
    tenant_id: str
    user_id: str  # Recipient
    type: NotificationType
    
    # Source info
    actor_id: str  # Who triggered the notification
    actor_name: str
    actor_avatar: Optional[str] = None
    
    # Target info
    post_id: Optional[str] = None
    comment_id: Optional[str] = None
    record_id: Optional[str] = None
    record_type: Optional[str] = None
    
    # Content preview
    preview_text: str
    
    # Status
    is_read: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    class Config:
        json_encoders = {datetime: lambda v: v.isoformat()}


# ============================================================================
# FEED/QUERY MODELS
# ============================================================================
class FeedFilter(str, Enum):
    ALL = "ALL"
    MY_ACTIVITY = "MY_ACTIVITY"
    MENTIONS = "MENTIONS"
    FOLLOWING = "FOLLOWING"


class FeedQuery(BaseModel):
    """Query parameters for feed"""
    record_id: Optional[str] = None
    record_type: Optional[str] = None
    filter: FeedFilter = FeedFilter.ALL
    page: int = 1
    page_size: int = 20
    search: Optional[str] = None


class FeedResponse(BaseModel):
    """Paginated feed response"""
    posts: List[ChatterPost]
    total: int
    page: int
    page_size: int
    has_more: bool
