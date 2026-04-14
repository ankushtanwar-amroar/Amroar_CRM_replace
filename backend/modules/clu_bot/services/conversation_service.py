"""
CLU-BOT Conversation Service
Manages conversation state and message history.
"""
import logging
import uuid
from typing import Dict, Any, Optional, List
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorDatabase

from ..models import (
    Conversation, ConversationMessage, MessageRole,
    ActionPayload, ConversationListResponse
)

logger = logging.getLogger(__name__)


class ConversationService:
    """
    Manages CLU-BOT conversation sessions.
    Stores conversation history for context awareness.
    """
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
    
    async def get_or_create_conversation(
        self,
        conversation_id: Optional[str],
        tenant_id: str,
        user_id: str
    ) -> Conversation:
        """
        Get existing conversation or create a new one.
        """
        if conversation_id:
            # Try to get existing conversation
            conv_doc = await self.db.clu_bot_conversations.find_one({
                "id": conversation_id,
                "tenant_id": tenant_id,
                "user_id": user_id,
                "is_active": True
            }, {"_id": 0})
            
            if conv_doc:
                return Conversation(**conv_doc)
        
        # Create new conversation
        conversation = Conversation(
            tenant_id=tenant_id,
            user_id=user_id
        )
        
        await self.db.clu_bot_conversations.insert_one(conversation.model_dump())
        
        return conversation
    
    async def add_message(
        self,
        conversation_id: str,
        role: MessageRole,
        content: str,
        action_payload: Optional[ActionPayload] = None,
        execution_result: Optional[Dict[str, Any]] = None
    ) -> ConversationMessage:
        """
        Add a message to a conversation.
        """
        message = ConversationMessage(
            role=role,
            content=content,
            action_payload=action_payload,
            execution_result=execution_result
        )
        
        await self.db.clu_bot_conversations.update_one(
            {"id": conversation_id},
            {
                "$push": {"messages": message.model_dump()},
                "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}
            }
        )
        
        return message
    
    async def get_conversation_history(
        self,
        conversation_id: str,
        limit: int = 10
    ) -> List[Dict[str, Any]]:
        """
        Get recent message history for a conversation.
        Used for LLM context.
        """
        conv_doc = await self.db.clu_bot_conversations.find_one(
            {"id": conversation_id},
            {"messages": {"$slice": -limit}, "_id": 0}
        )
        
        if not conv_doc:
            return []
        
        messages = conv_doc.get("messages", [])
        return [
            {"role": m.get("role"), "content": m.get("content")}
            for m in messages
        ]
    
    async def get_user_conversations(
        self,
        tenant_id: str,
        user_id: str,
        limit: int = 20,
        offset: int = 0
    ) -> ConversationListResponse:
        """
        Get a list of user's conversations.
        """
        query = {
            "tenant_id": tenant_id,
            "user_id": user_id,
            "is_active": True
        }
        
        total = await self.db.clu_bot_conversations.count_documents(query)
        
        cursor = self.db.clu_bot_conversations.find(query, {"_id": 0})
        cursor = cursor.sort("updated_at", -1).skip(offset).limit(limit)
        
        conversations = await cursor.to_list(length=limit)
        
        # Format for display (summarize each conversation)
        formatted = []
        for conv in conversations:
            messages = conv.get("messages", [])
            
            # Get first user message as title
            title = "New Conversation"
            for msg in messages:
                if msg.get("role") == "user":
                    title = msg.get("content", "")[:50]
                    if len(msg.get("content", "")) > 50:
                        title += "..."
                    break
            
            formatted.append({
                "id": conv.get("id"),
                "title": title,
                "message_count": len(messages),
                "created_at": conv.get("created_at"),
                "updated_at": conv.get("updated_at")
            })
        
        return ConversationListResponse(
            conversations=formatted,
            total=total
        )
    
    async def get_conversation(
        self,
        conversation_id: str,
        tenant_id: str,
        user_id: str
    ) -> Optional[Conversation]:
        """
        Get a specific conversation with full message history.
        """
        conv_doc = await self.db.clu_bot_conversations.find_one({
            "id": conversation_id,
            "tenant_id": tenant_id,
            "user_id": user_id
        }, {"_id": 0})
        
        if not conv_doc:
            return None
        
        return Conversation(**conv_doc)
    
    async def update_context(
        self,
        conversation_id: str,
        context: Dict[str, Any]
    ):
        """
        Update conversation context (e.g., current record being viewed).
        """
        await self.db.clu_bot_conversations.update_one(
            {"id": conversation_id},
            {
                "$set": {
                    "context": context,
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }
            }
        )
    
    async def close_conversation(self, conversation_id: str):
        """
        Mark a conversation as inactive.
        """
        await self.db.clu_bot_conversations.update_one(
            {"id": conversation_id},
            {
                "$set": {
                    "is_active": False,
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }
            }
        )
    
    async def delete_conversation(
        self,
        conversation_id: str,
        tenant_id: str,
        user_id: str
    ) -> bool:
        """
        Delete a conversation permanently.
        """
        result = await self.db.clu_bot_conversations.delete_one({
            "id": conversation_id,
            "tenant_id": tenant_id,
            "user_id": user_id
        })
        
        return result.deleted_count > 0


# Factory function
def get_conversation_service(db: AsyncIOMotorDatabase) -> ConversationService:
    """Get ConversationService instance"""
    return ConversationService(db)
