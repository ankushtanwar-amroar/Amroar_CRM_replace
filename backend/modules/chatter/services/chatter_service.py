"""
Chatter Service - Business logic for Salesforce-like Chatter
"""
from typing import Optional, List, Dict, Any
from datetime import datetime
from motor.motor_asyncio import AsyncIOMotorDatabase
import logging
import re

from ..models.chatter_models import (
    ChatterPost, ChatterPostCreate, ChatterPostUpdate,
    ChatterComment, ChatterCommentCreate, ChatterCommentUpdate,
    Reaction, ReactionCreate, ReactionType,
    ChatterNotification, NotificationType,
    Author, Mention, FeedQuery, FeedFilter, FeedResponse
)

logger = logging.getLogger(__name__)


async def send_to_notification_center(db, tenant_id: str, recipient_user_id: str, 
                                       actor_name: str, preview_text: str,
                                       target_object_type: str = None, target_object_id: str = None):
    """Send notification to the new Notification Center"""
    try:
        from modules.notifications.services import get_notification_engine
        engine = get_notification_engine(db)
        
        # Determine record name for the notification message
        record_name = target_object_type.title() if target_object_type else "Chatter Post"
        
        # Build the target URL - this is critical for the "Open" button to work
        target_url = None
        if target_object_type and target_object_id:
            # Link to the record page where the mention occurred
            target_url = f"/{target_object_type.lower()}/{target_object_id}/view"
        
        await engine.notify_mention(
            tenant_id=tenant_id,
            mentioned_user_id=recipient_user_id,
            mentioning_user_name=actor_name,
            target_object_type=target_object_type,
            target_object_id=target_object_id,
            target_url=target_url,
            record_name=record_name,
            message_preview=preview_text,
            created_by="chatter"
        )
    except Exception as e:
        logger.error(f"Error sending to notification center: {str(e)}")


class ChatterService:
    """Service for managing Chatter posts, comments, and interactions"""
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.posts_collection = db["chatter_posts"]
        self.comments_collection = db["chatter_comments"]
        self.reactions_collection = db["chatter_reactions"]
        self.notifications_collection = db["chatter_notifications"]
    
    # ========================================================================
    # POST OPERATIONS
    # ========================================================================
    async def create_post(
        self,
        tenant_id: str,
        author: Author,
        post_data: ChatterPostCreate
    ) -> ChatterPost:
        """Create a new chatter post"""
        post = ChatterPost(
            tenant_id=tenant_id,
            author=author,
            content=post_data.content,
            plain_text=post_data.plain_text,
            record_id=post_data.record_id,
            record_type=post_data.record_type,
            visibility=post_data.visibility,
            mentions=post_data.mentions,
            attachments=post_data.attachments,
            parent_post_id=post_data.parent_post_id
        )
        
        await self.posts_collection.insert_one(post.dict())
        
        # Create notifications for mentions
        for mention in post_data.mentions:
            if mention.user_id and mention.user_id != author.user_id:
                # Legacy internal notification
                await self._create_notification(
                    tenant_id=tenant_id,
                    user_id=mention.user_id,
                    type=NotificationType.MENTION,
                    actor_id=author.user_id,
                    actor_name=author.name,
                    actor_avatar=author.avatar_url,
                    post_id=post.id,
                    preview_text=f"{author.name} mentioned you in a post"
                )
                # NEW: Send to Notification Center
                await send_to_notification_center(
                    self.db,
                    tenant_id=tenant_id,
                    recipient_user_id=mention.user_id,
                    actor_name=author.name,
                    preview_text=f"{author.name} mentioned you in a post",
                    target_object_type=post_data.record_type,
                    target_object_id=post_data.record_id
                )
        
        logger.info(f"Created chatter post {post.id} by {author.name}")
        return post
    
    async def get_post(self, tenant_id: str, post_id: str) -> Optional[ChatterPost]:
        """Get a single post by ID"""
        doc = await self.posts_collection.find_one({
            "tenant_id": tenant_id,
            "id": post_id
        }, {"_id": 0})
        
        if doc:
            return ChatterPost(**doc)
        return None
    
    async def update_post(
        self,
        tenant_id: str,
        post_id: str,
        user_id: str,
        update_data: ChatterPostUpdate
    ) -> Optional[ChatterPost]:
        """Update an existing post"""
        # First verify ownership
        existing = await self.posts_collection.find_one({
            "tenant_id": tenant_id,
            "id": post_id,
            "author.user_id": user_id
        })
        
        if not existing:
            return None
        
        update_dict = {k: v for k, v in update_data.dict().items() if v is not None}
        update_dict["is_edited"] = True
        update_dict["updated_at"] = datetime.utcnow()
        
        await self.posts_collection.update_one(
            {"tenant_id": tenant_id, "id": post_id},
            {"$set": update_dict}
        )
        
        return await self.get_post(tenant_id, post_id)
    
    async def delete_post(
        self,
        tenant_id: str,
        post_id: str,
        user_id: str,
        is_admin: bool = False
    ) -> bool:
        """Delete a post (owner or admin only)"""
        query = {"tenant_id": tenant_id, "id": post_id}
        
        if not is_admin:
            query["author.user_id"] = user_id
        
        result = await self.posts_collection.delete_one(query)
        
        if result.deleted_count > 0:
            # Also delete related comments and reactions
            await self.comments_collection.delete_many({
                "tenant_id": tenant_id,
                "post_id": post_id
            })
            await self.reactions_collection.delete_many({
                "tenant_id": tenant_id,
                "target_type": "post",
                "target_id": post_id
            })
            return True
        
        return False
    
    async def get_feed(
        self,
        tenant_id: str,
        user_id: str,
        query: FeedQuery
    ) -> FeedResponse:
        """Get paginated feed of posts"""
        filter_query = {"tenant_id": tenant_id}
        
        # Apply record filter
        if query.record_id:
            filter_query["record_id"] = query.record_id
        if query.record_type:
            filter_query["record_type"] = query.record_type
        
        # Apply feed filter
        if query.filter == FeedFilter.MY_ACTIVITY:
            filter_query["author.user_id"] = user_id
        elif query.filter == FeedFilter.MENTIONS:
            filter_query["mentions.user_id"] = user_id
        
        # Apply search
        if query.search:
            filter_query["$or"] = [
                {"plain_text": {"$regex": query.search, "$options": "i"}},
                {"author.name": {"$regex": query.search, "$options": "i"}}
            ]
        
        # Get total count
        total = await self.posts_collection.count_documents(filter_query)
        
        # Get paginated posts
        skip = (query.page - 1) * query.page_size
        cursor = self.posts_collection.find(
            filter_query,
            {"_id": 0}
        ).sort("created_at", -1).skip(skip).limit(query.page_size)
        
        docs = await cursor.to_list(length=query.page_size)
        posts = [ChatterPost(**doc) for doc in docs]
        
        # Enrich posts with user's reaction status
        for post in posts:
            user_reaction = await self.reactions_collection.find_one({
                "tenant_id": tenant_id,
                "user_id": user_id,
                "target_type": "post",
                "target_id": post.id
            }, {"_id": 0, "reaction_type": 1})
            if user_reaction:
                post.__dict__["user_reaction"] = user_reaction.get("reaction_type")
        
        return FeedResponse(
            posts=posts,
            total=total,
            page=query.page,
            page_size=query.page_size,
            has_more=(skip + len(posts)) < total
        )
    
    # ========================================================================
    # COMMENT OPERATIONS
    # ========================================================================
    async def create_comment(
        self,
        tenant_id: str,
        author: Author,
        comment_data: ChatterCommentCreate
    ) -> ChatterComment:
        """Create a new comment on a post"""
        comment = ChatterComment(
            tenant_id=tenant_id,
            post_id=comment_data.post_id,
            parent_comment_id=comment_data.parent_comment_id,
            author=author,
            content=comment_data.content,
            plain_text=comment_data.plain_text,
            mentions=comment_data.mentions,
            attachments=comment_data.attachments
        )
        
        await self.comments_collection.insert_one(comment.dict())
        
        # Update post comment count
        await self.posts_collection.update_one(
            {"tenant_id": tenant_id, "id": comment_data.post_id},
            {"$inc": {"comment_count": 1}}
        )
        
        # Update parent comment reply count if nested
        if comment_data.parent_comment_id:
            await self.comments_collection.update_one(
                {"tenant_id": tenant_id, "id": comment_data.parent_comment_id},
                {"$inc": {"reply_count": 1}}
            )
        
        # Get post to determine target record
        post = await self.get_post(tenant_id, comment_data.post_id)
        target_object_type = post.record_type if post else None
        target_object_id = post.record_id if post else None
        
        # Notify post author
        if post and post.author.user_id != author.user_id:
            await self._create_notification(
                tenant_id=tenant_id,
                user_id=post.author.user_id,
                type=NotificationType.COMMENT,
                actor_id=author.user_id,
                actor_name=author.name,
                actor_avatar=author.avatar_url,
                post_id=comment_data.post_id,
                comment_id=comment.id,
                preview_text=f"{author.name} commented on your post"
            )
        
        # Notify mentioned users
        for mention in comment_data.mentions:
            if mention.user_id and mention.user_id != author.user_id:
                # Legacy internal notification
                await self._create_notification(
                    tenant_id=tenant_id,
                    user_id=mention.user_id,
                    type=NotificationType.MENTION,
                    actor_id=author.user_id,
                    actor_name=author.name,
                    actor_avatar=author.avatar_url,
                    post_id=comment_data.post_id,
                    comment_id=comment.id,
                    preview_text=f"{author.name} mentioned you in a comment"
                )
                # NEW: Send to Notification Center
                await send_to_notification_center(
                    self.db,
                    tenant_id=tenant_id,
                    recipient_user_id=mention.user_id,
                    actor_name=author.name,
                    preview_text=f"{author.name} mentioned you in a comment",
                    target_object_type=target_object_type,
                    target_object_id=target_object_id
                )
        
        logger.info(f"Created comment {comment.id} on post {comment_data.post_id}")
        return comment
    
    async def get_comments(
        self,
        tenant_id: str,
        post_id: str,
        parent_comment_id: Optional[str] = None,
        page: int = 1,
        page_size: int = 50
    ) -> List[ChatterComment]:
        """Get comments for a post"""
        query = {
            "tenant_id": tenant_id,
            "post_id": post_id
        }
        
        if parent_comment_id:
            query["parent_comment_id"] = parent_comment_id
        else:
            query["parent_comment_id"] = None  # Get top-level comments only
        
        skip = (page - 1) * page_size
        cursor = self.comments_collection.find(
            query,
            {"_id": 0}
        ).sort("created_at", 1).skip(skip).limit(page_size)
        
        docs = await cursor.to_list(length=page_size)
        return [ChatterComment(**doc) for doc in docs]
    
    async def update_comment(
        self,
        tenant_id: str,
        comment_id: str,
        user_id: str,
        update_data: ChatterCommentUpdate
    ) -> Optional[ChatterComment]:
        """Update a comment"""
        existing = await self.comments_collection.find_one({
            "tenant_id": tenant_id,
            "id": comment_id,
            "author.user_id": user_id
        })
        
        if not existing:
            return None
        
        update_dict = {k: v for k, v in update_data.dict().items() if v is not None}
        update_dict["is_edited"] = True
        update_dict["updated_at"] = datetime.utcnow()
        
        await self.comments_collection.update_one(
            {"tenant_id": tenant_id, "id": comment_id},
            {"$set": update_dict}
        )
        
        doc = await self.comments_collection.find_one(
            {"tenant_id": tenant_id, "id": comment_id},
            {"_id": 0}
        )
        return ChatterComment(**doc) if doc else None
    
    async def delete_comment(
        self,
        tenant_id: str,
        comment_id: str,
        user_id: str,
        is_admin: bool = False
    ) -> bool:
        """Delete a comment"""
        # Get comment first to update post count
        comment_doc = await self.comments_collection.find_one({
            "tenant_id": tenant_id,
            "id": comment_id
        })
        
        if not comment_doc:
            return False
        
        query = {"tenant_id": tenant_id, "id": comment_id}
        if not is_admin:
            query["author.user_id"] = user_id
        
        result = await self.comments_collection.delete_one(query)
        
        if result.deleted_count > 0:
            # Update post comment count
            await self.posts_collection.update_one(
                {"tenant_id": tenant_id, "id": comment_doc["post_id"]},
                {"$inc": {"comment_count": -1}}
            )
            
            # Delete reactions
            await self.reactions_collection.delete_many({
                "tenant_id": tenant_id,
                "target_type": "comment",
                "target_id": comment_id
            })
            return True
        
        return False
    
    # ========================================================================
    # REACTION/LIKE OPERATIONS
    # ========================================================================
    async def add_reaction(
        self,
        tenant_id: str,
        user_id: str,
        user_name: str,
        reaction_data: ReactionCreate
    ) -> Reaction:
        """Add a reaction (like) to a post or comment"""
        # Check if user already reacted
        existing = await self.reactions_collection.find_one({
            "tenant_id": tenant_id,
            "user_id": user_id,
            "target_type": reaction_data.target_type,
            "target_id": reaction_data.target_id
        })
        
        if existing:
            # Update existing reaction if different type
            if existing.get("reaction_type") != reaction_data.reaction_type.value:
                old_type = existing.get("reaction_type")
                await self.reactions_collection.update_one(
                    {"_id": existing["_id"]},
                    {"$set": {"reaction_type": reaction_data.reaction_type.value}}
                )
                
                # Update target counts
                collection = self.posts_collection if reaction_data.target_type == "post" else self.comments_collection
                await collection.update_one(
                    {"tenant_id": tenant_id, "id": reaction_data.target_id},
                    {
                        "$inc": {
                            f"reactions.{old_type}": -1,
                            f"reactions.{reaction_data.reaction_type.value}": 1
                        }
                    }
                )
            
            return Reaction(**{**existing, "_id": None, "reaction_type": reaction_data.reaction_type})
        
        # Create new reaction
        reaction = Reaction(
            tenant_id=tenant_id,
            user_id=user_id,
            user_name=user_name,
            target_type=reaction_data.target_type,
            target_id=reaction_data.target_id,
            reaction_type=reaction_data.reaction_type
        )
        
        await self.reactions_collection.insert_one(reaction.dict())
        
        # Update target counts
        collection = self.posts_collection if reaction_data.target_type == "post" else self.comments_collection
        await collection.update_one(
            {"tenant_id": tenant_id, "id": reaction_data.target_id},
            {
                "$inc": {
                    "like_count": 1,
                    f"reactions.{reaction_data.reaction_type.value}": 1
                }
            }
        )
        
        # Notify post/comment author
        if reaction_data.target_type == "post":
            post = await self.get_post(tenant_id, reaction_data.target_id)
            if post and post.author.user_id != user_id:
                await self._create_notification(
                    tenant_id=tenant_id,
                    user_id=post.author.user_id,
                    type=NotificationType.LIKE,
                    actor_id=user_id,
                    actor_name=user_name,
                    post_id=reaction_data.target_id,
                    preview_text=f"{user_name} liked your post"
                )
        
        return reaction
    
    async def remove_reaction(
        self,
        tenant_id: str,
        user_id: str,
        target_type: str,
        target_id: str
    ) -> bool:
        """Remove a reaction"""
        existing = await self.reactions_collection.find_one({
            "tenant_id": tenant_id,
            "user_id": user_id,
            "target_type": target_type,
            "target_id": target_id
        })
        
        if not existing:
            return False
        
        reaction_type = existing.get("reaction_type", "LIKE")
        
        result = await self.reactions_collection.delete_one({
            "tenant_id": tenant_id,
            "user_id": user_id,
            "target_type": target_type,
            "target_id": target_id
        })
        
        if result.deleted_count > 0:
            collection = self.posts_collection if target_type == "post" else self.comments_collection
            await collection.update_one(
                {"tenant_id": tenant_id, "id": target_id},
                {
                    "$inc": {
                        "like_count": -1,
                        f"reactions.{reaction_type}": -1
                    }
                }
            )
            return True
        
        return False
    
    async def get_reactions(
        self,
        tenant_id: str,
        target_type: str,
        target_id: str,
        reaction_type: Optional[str] = None
    ) -> List[Reaction]:
        """Get all reactions for a target"""
        query = {
            "tenant_id": tenant_id,
            "target_type": target_type,
            "target_id": target_id
        }
        
        if reaction_type:
            query["reaction_type"] = reaction_type
        
        cursor = self.reactions_collection.find(query, {"_id": 0})
        docs = await cursor.to_list(length=100)
        return [Reaction(**doc) for doc in docs]
    
    # ========================================================================
    # NOTIFICATION OPERATIONS
    # ========================================================================
    async def _create_notification(
        self,
        tenant_id: str,
        user_id: str,
        type: NotificationType,
        actor_id: str,
        actor_name: str,
        preview_text: str,
        actor_avatar: Optional[str] = None,
        post_id: Optional[str] = None,
        comment_id: Optional[str] = None,
        record_id: Optional[str] = None,
        record_type: Optional[str] = None
    ):
        """Create a notification"""
        notification = ChatterNotification(
            tenant_id=tenant_id,
            user_id=user_id,
            type=type,
            actor_id=actor_id,
            actor_name=actor_name,
            actor_avatar=actor_avatar,
            post_id=post_id,
            comment_id=comment_id,
            record_id=record_id,
            record_type=record_type,
            preview_text=preview_text
        )
        
        await self.notifications_collection.insert_one(notification.dict())
    
    async def get_notifications(
        self,
        tenant_id: str,
        user_id: str,
        unread_only: bool = False,
        page: int = 1,
        page_size: int = 20
    ) -> List[ChatterNotification]:
        """Get notifications for a user"""
        query = {
            "tenant_id": tenant_id,
            "user_id": user_id
        }
        
        if unread_only:
            query["is_read"] = False
        
        skip = (page - 1) * page_size
        cursor = self.notifications_collection.find(
            query,
            {"_id": 0}
        ).sort("created_at", -1).skip(skip).limit(page_size)
        
        docs = await cursor.to_list(length=page_size)
        return [ChatterNotification(**doc) for doc in docs]
    
    async def mark_notifications_read(
        self,
        tenant_id: str,
        user_id: str,
        notification_ids: Optional[List[str]] = None
    ) -> int:
        """Mark notifications as read"""
        query = {
            "tenant_id": tenant_id,
            "user_id": user_id,
            "is_read": False
        }
        
        if notification_ids:
            query["id"] = {"$in": notification_ids}
        
        result = await self.notifications_collection.update_many(
            query,
            {"$set": {"is_read": True}}
        )
        
        return result.modified_count
    
    async def get_unread_count(self, tenant_id: str, user_id: str) -> int:
        """Get count of unread notifications"""
        return await self.notifications_collection.count_documents({
            "tenant_id": tenant_id,
            "user_id": user_id,
            "is_read": False
        })
    
    # ========================================================================
    # USER SEARCH (for @mentions)
    # ========================================================================
    async def search_users(
        self,
        tenant_id: str,
        query: str,
        limit: int = 10
    ) -> List[Dict[str, Any]]:
        """Search users for @mention suggestions"""
        users_collection = self.db["users"]
        
        # Search by first_name, last_name, or email
        search_query = {
            "tenant_id": tenant_id,
            "$or": [
                {"first_name": {"$regex": query, "$options": "i"}},
                {"last_name": {"$regex": query, "$options": "i"}},
                {"email": {"$regex": query, "$options": "i"}}
            ]
        }
        
        cursor = users_collection.find(
            search_query,
            {"_id": 0, "id": 1, "first_name": 1, "last_name": 1, "email": 1, "avatar_url": 1, "role_name": 1}
        ).limit(limit)
        
        docs = await cursor.to_list(length=limit)
        
        # Build display name from first_name + last_name
        results = []
        for doc in docs:
            first_name = doc.get("first_name", "")
            last_name = doc.get("last_name", "")
            display_name = f"{first_name} {last_name}".strip() or "Unknown"
            
            results.append({
                "id": doc.get("id"),
                "name": display_name,
                "email": doc.get("email"),
                "avatar_url": doc.get("avatar_url"),
                "role": doc.get("role_name")
            })
        
        return results
