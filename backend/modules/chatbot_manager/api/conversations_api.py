"""
Conversations API
"""
from fastapi import APIRouter, Depends, HTTPException, status, Body
from typing import List, Optional
import uuid
from datetime import datetime, timezone

# Import from server.py
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))))

from server import db, User
from shared.auth import get_current_user
from ..models.conversation import (
    Conversation, ConversationCreate, Message, MessageRole,
    ConversationStatus
)

router = APIRouter(prefix="/chatbot-manager", tags=["Chatbot Conversations"])


@router.post("/conversations", response_model=Conversation, status_code=status.HTTP_201_CREATED)
async def create_conversation(
    conv_data: ConversationCreate,
    current_user: User = Depends(get_current_user)
):
    """Start a new conversation"""
    tenant_id = current_user.tenant_id
    
    # Verify bot exists
    bot = await db.chatbots.find_one({"id": conv_data.bot_id, "tenant_id": tenant_id})
    if not bot:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Chatbot not found"
        )
    
    conversation = Conversation(
        id=str(uuid.uuid4()),
        tenant_id=tenant_id,
        **conv_data.dict()
    )
    
    # Add welcome message
    welcome_msg = Message(
        id=str(uuid.uuid4()),
        role=MessageRole.BOT,
        content=bot["welcome_message"]
    )
    conversation.messages.append(welcome_msg)
    
    # Add initial user message if provided
    if conv_data.initial_message:
        user_msg = Message(
            id=str(uuid.uuid4()),
            role=MessageRole.USER,
            content=conv_data.initial_message
        )
        conversation.messages.append(user_msg)
    
    await db.chatbot_conversations.insert_one(conversation.dict())
    
    # Update bot's last activity
    await db.chatbots.update_one(
        {"id": conv_data.bot_id, "tenant_id": tenant_id},
        {"$set": {"last_activity": datetime.now(timezone.utc)}, "$inc": {"total_conversations": 1}}
    )
    
    return conversation


@router.get("/conversations/{conversation_id}", response_model=Conversation)
async def get_conversation(
    conversation_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get conversation by ID"""
    tenant_id = current_user.tenant_id
    
    conv = await db.chatbot_conversations.find_one({
        "id": conversation_id,
        "tenant_id": tenant_id
    })
    if not conv:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found"
        )
    
    return Conversation(**conv)


@router.get("/bots/{bot_id}/conversations", response_model=List[Conversation])
async def list_bot_conversations(
    bot_id: str,
    limit: int = 50,
    status: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """List conversations for a bot"""
    tenant_id = current_user.tenant_id
    
    query = {"bot_id": bot_id, "tenant_id": tenant_id}
    if status:
        query["status"] = status
    
    convs = await db.chatbot_conversations.find(query).sort("started_at", -1).limit(limit).to_list(length=limit)
    return [Conversation(**conv) for conv in convs]


@router.post("/conversations/{conversation_id}/messages", response_model=Message)
async def send_message(
    conversation_id: str,
    content: str = Body(..., embed=True),
    current_user: User = Depends(get_current_user)
):
    """Send a message in conversation"""
    tenant_id = current_user.tenant_id
    
    conv = await db.chatbot_conversations.find_one({
        "id": conversation_id,
        "tenant_id": tenant_id
    })
    if not conv:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found"
        )
    
    # Create user message
    user_msg = Message(
        id=str(uuid.uuid4()),
        role=MessageRole.USER,
        content=content
    )
    
    # Add to conversation
    await db.chatbot_conversations.update_one(
        {"id": conversation_id, "tenant_id": tenant_id},
        {"$push": {"messages": user_msg.dict()}}
    )
    
    # TODO: Process message with NLP and generate bot response
    # For now, just add a placeholder response
    bot = await db.chatbots.find_one({"id": conv["bot_id"], "tenant_id": tenant_id})
    bot_response = Message(
        id=str(uuid.uuid4()),
        role=MessageRole.BOT,
        content=bot["fallback_message"]
    )
    
    await db.chatbot_conversations.update_one(
        {"id": conversation_id, "tenant_id": tenant_id},
        {"$push": {"messages": bot_response.dict()}}
    )
    
    return bot_response


@router.patch("/conversations/{conversation_id}/status")
async def update_conversation_status(
    conversation_id: str,
    new_status: ConversationStatus,
    current_user: User = Depends(get_current_user)
):
    """Update conversation status"""
    tenant_id = current_user.tenant_id
    
    update_data = {"status": new_status}
    if new_status in [ConversationStatus.RESOLVED, ConversationStatus.ABANDONED]:
        update_data["ended_at"] = datetime.now(timezone.utc)
    
    result = await db.chatbot_conversations.update_one(
        {"id": conversation_id, "tenant_id": tenant_id},
        {"$set": update_data}
    )
    
    if result.matched_count == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found"
        )
    
    return {"success": True, "status": new_status}


@router.post("/conversations/{conversation_id}/csat")
async def submit_csat(
    conversation_id: str,
    score: int = Body(..., ge=1, le=5, embed=True),
    current_user: User = Depends(get_current_user)
):
    """Submit CSAT score for conversation"""
    tenant_id = current_user.tenant_id
    
    result = await db.chatbot_conversations.update_one(
        {"id": conversation_id, "tenant_id": tenant_id},
        {"$set": {"csat_score": score}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found"
        )
    
    return {"success": True, "score": score}


@router.get("/conversations/search")
async def search_conversations(
    q: str,
    bot_id: Optional[str] = None,
    limit: int = 20,
    current_user: User = Depends(get_current_user)
):
    """Search conversations by content"""
    tenant_id = current_user.tenant_id
    
    query = {"tenant_id": tenant_id}
    if bot_id:
        query["bot_id"] = bot_id
    
    # Simple text search in messages
    query["messages.content"] = {"$regex": q, "$options": "i"}
    
    convs = await db.chatbot_conversations.find(query).limit(limit).to_list(length=limit)
    return [Conversation(**conv) for conv in convs]
