"""
Chatbot CRUD API
"""
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta
from motor.motor_asyncio import AsyncIOMotorDatabase

# Import from server.py
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))))

from server import db, User
from shared.auth import get_current_user
from shared.services.license_enforcement import require_module_license, ModuleKey
from ..models.chatbot import (
    Chatbot, ChatbotCreate, ChatbotUpdate, BotStatus,
    KnowledgeSource, Intent, Channel
)
from ..models.conversation import ConversationMetrics, Conversation, Message
from ..services.knowledge_retrieval_service import KnowledgeRetrievalService
from pydantic import BaseModel
import google.generativeai as genai

# Configure Gemini
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)

router = APIRouter(prefix="/chatbot-manager", tags=["Chatbot Manager"])

# Initialize knowledge retrieval service
knowledge_service = KnowledgeRetrievalService(db)


class ChatMessage(BaseModel):
    content: str


class ChatResponse(BaseModel):
    message: str
    conversation_id: str


@router.get("/bots", response_model=List[Chatbot])
@require_module_license(ModuleKey.CHATBOT_MANAGER)
async def list_bots(
    current_user: User = Depends(get_current_user),
    status: Optional[str] = None
):
    """List all chatbots for current tenant"""
    tenant_id = current_user.tenant_id
    
    query = {"tenant_id": tenant_id}
    if status:
        query["status"] = status
    
    bots = await db.chatbots.find(query).sort("created_at", -1).to_list(length=None)
    return [Chatbot(**bot) for bot in bots]


@router.post("/bots", response_model=Chatbot, status_code=status.HTTP_201_CREATED)
async def create_bot(
    bot_data: ChatbotCreate,
    current_user: User = Depends(get_current_user)
):
    """Create a new chatbot"""
    tenant_id = current_user.tenant_id
    user_id = current_user.id
    
    bot = Chatbot(
        id=str(uuid.uuid4()),
        tenant_id=tenant_id,
        created_by=user_id,
        updated_by=user_id,
        **bot_data.dict()
    )
    
    await db.chatbots.insert_one(bot.dict())
    return bot


@router.get("/bots/{bot_id}", response_model=Chatbot)
async def get_bot(
    bot_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get chatbot by ID"""
    tenant_id = current_user.tenant_id
    
    bot = await db.chatbots.find_one({"id": bot_id, "tenant_id": tenant_id})
    if not bot:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Chatbot not found"
        )
    
    return Chatbot(**bot)


@router.put("/bots/{bot_id}", response_model=Chatbot)
async def update_bot(
    bot_id: str,
    bot_update: ChatbotUpdate,
    current_user: User = Depends(get_current_user)
):
    """Update chatbot"""
    tenant_id = current_user.tenant_id
    user_id = current_user.id
    
    bot = await db.chatbots.find_one({"id": bot_id, "tenant_id": tenant_id})
    if not bot:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Chatbot not found"
        )
    
    update_data = bot_update.dict(exclude_unset=True)
    update_data["updated_at"] = datetime.now(timezone.utc)
    update_data["updated_by"] = user_id
    
    await db.chatbots.update_one(
        {"id": bot_id, "tenant_id": tenant_id},
        {"$set": update_data}
    )
    
    updated_bot = await db.chatbots.find_one({"id": bot_id, "tenant_id": tenant_id})
    return Chatbot(**updated_bot)


@router.delete("/bots/{bot_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_bot(
    bot_id: str,
    current_user: User = Depends(get_current_user)
):
    """Delete chatbot"""
    tenant_id = current_user.tenant_id
    
    result = await db.chatbots.delete_one({"id": bot_id, "tenant_id": tenant_id})
    if result.deleted_count == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Chatbot not found"
        )
    
    # Also delete associated conversations
    await db.chatbot_conversations.delete_many({"bot_id": bot_id, "tenant_id": tenant_id})
    
    return None


@router.post("/bots/{bot_id}/duplicate", response_model=Chatbot)
async def duplicate_bot(
    bot_id: str,
    current_user: User = Depends(get_current_user)
):
    """Duplicate a chatbot"""
    tenant_id = current_user.tenant_id
    user_id = current_user.id
    
    bot = await db.chatbots.find_one({"id": bot_id, "tenant_id": tenant_id})
    if not bot:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Chatbot not found"
        )
    
    # Create duplicate
    new_bot = Chatbot(**bot)
    new_bot.id = str(uuid.uuid4())
    new_bot.name = f"{bot['name']} (Copy)"
    new_bot.status = BotStatus.DRAFT
    new_bot.created_at = datetime.now(timezone.utc)
    new_bot.updated_at = datetime.now(timezone.utc)
    new_bot.created_by = user_id
    new_bot.updated_by = user_id
    new_bot.total_conversations = 0
    new_bot.resolved_count = 0
    new_bot.handoff_count = 0
    new_bot.avg_csat = None
    new_bot.last_activity = None
    
    await db.chatbots.insert_one(new_bot.dict())
    return new_bot


@router.patch("/bots/{bot_id}/toggle-status", response_model=Chatbot)
async def toggle_bot_status(
    bot_id: str,
    current_user: User = Depends(get_current_user)
):
    """Toggle bot between active and paused"""
    tenant_id = current_user.tenant_id
    
    bot = await db.chatbots.find_one({"id": bot_id, "tenant_id": tenant_id})
    if not bot:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Chatbot not found"
        )
    
    current_status = bot["status"]
    new_status = BotStatus.PAUSED if current_status == BotStatus.ACTIVE else BotStatus.ACTIVE
    
    await db.chatbots.update_one(
        {"id": bot_id, "tenant_id": tenant_id},
        {"$set": {"status": new_status, "updated_at": datetime.now(timezone.utc)}}
    )
    
    updated_bot = await db.chatbots.find_one({"id": bot_id, "tenant_id": tenant_id})
    return Chatbot(**updated_bot)


@router.get("/bots/{bot_id}/metrics", response_model=ConversationMetrics)
async def get_bot_metrics(
    bot_id: str,
    days: int = 7,
    current_user: User = Depends(get_current_user)
):
    """Get bot metrics for specified period"""
    tenant_id = current_user.tenant_id
    
    bot = await db.chatbots.find_one({"id": bot_id, "tenant_id": tenant_id})
    if not bot:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Chatbot not found"
        )
    
    period_start = datetime.now(timezone.utc) - timedelta(days=days)
    period_end = datetime.now(timezone.utc)
    
    # Get conversations in period
    conversations = await db.chatbot_conversations.find({
        "bot_id": bot_id,
        "tenant_id": tenant_id,
        "started_at": {"$gte": period_start, "$lte": period_end}
    }).to_list(length=None)
    
    total = len(conversations)
    active = len([c for c in conversations if c.get("status") == "active"])
    resolved = len([c for c in conversations if c.get("status") == "resolved"])
    handoffs = len([c for c in conversations if c.get("handoff_requested", False)])
    
    # Calculate averages
    csat_scores = [c.get("csat_score") for c in conversations if c.get("csat_score")]
    avg_csat = sum(csat_scores) / len(csat_scores) if csat_scores else None
    
    durations = [c.get("duration_seconds") for c in conversations if c.get("duration_seconds")]
    avg_duration = sum(durations) / len(durations) if durations else None
    
    # Top intents
    intents = {}
    for conv in conversations:
        intent = conv.get("intent_detected")
        if intent:
            intents[intent] = intents.get(intent, 0) + 1
    
    top_intents = [
        {"name": intent, "count": count}
        for intent, count in sorted(intents.items(), key=lambda x: x[1], reverse=True)[:5]
    ]
    
    failed = len([c for c in conversations if c.get("confidence_score", 1.0) < 0.5])


@router.get("/bots/{bot_id}/public")
async def get_bot_public(bot_id: str):
    """Public endpoint to get bot info (no auth required)"""
    bot = await db.chatbots.find_one({"id": bot_id})
    if not bot or bot.get("status") != "active":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Chatbot not found or inactive"
        )
    
    # Return only necessary public info
    return {
        "id": bot["id"],
        "name": bot["name"],
        "avatar_url": bot.get("avatar_url"),
        "welcome_message": bot.get("welcome_message", "Hello! How can I help you today?"),
        "fallback_message": bot.get("fallback_message", "I'm not sure I understand."),
        "model": bot.get("model", "gemini-2.5-flash"),
        "temperature": bot.get("temperature", 0.7),
        "max_tokens": bot.get("max_tokens", 500)
    }


@router.post("/bots/{bot_id}/chat", response_model=ChatResponse)
async def chat_with_bot(
    bot_id: str,
    message: ChatMessage,
    conversation_id: Optional[str] = None
):
    """Public chat endpoint (no auth required for embedded widget)"""
    # Get bot
    bot = await db.chatbots.find_one({"id": bot_id})
    if not bot or bot.get("status") != "active":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Chatbot not found or inactive"
        )
    
    # Get or create conversation
    if conversation_id:
        conversation = await db.chatbot_conversations.find_one({"id": conversation_id})
        if not conversation:
            raise HTTPException(status_code=404, detail="Conversation not found")
    else:
        # Create new conversation
        conversation_id = str(uuid.uuid4())
        conversation = {
            "id": conversation_id,
            "bot_id": bot_id,
            "tenant_id": bot["tenant_id"],
            "status": "active",
            "started_at": datetime.now(timezone.utc),
            "messages": [],
            "intent_detected": None,
            "confidence_score": 0.8,
            "handoff_requested": False,
            "csat_score": None,
            "user_metadata": {},
            "tags": []
        }
        await db.chatbot_conversations.insert_one(conversation)
    
    # Add user message
    user_msg = {
        "id": str(uuid.uuid4()),
        "role": "user",
        "content": message.content,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
    
    await db.chatbot_conversations.update_one(
        {"id": conversation_id},
        {"$push": {"messages": user_msg}}
    )
    
    # Generate AI response using Gemini with Knowledge Retrieval (RAG)
    try:
        if not GEMINI_API_KEY:
            raise Exception("Gemini API key not configured")
        
        # Build conversation context
        conversation = await db.chatbot_conversations.find_one({"id": conversation_id})
        messages = conversation.get("messages", [])
        
        # **RETRIEVE RELEVANT KNOWLEDGE FROM KNOWLEDGE SOURCES**
        relevant_knowledge = await knowledge_service.retrieve_relevant_knowledge(
            bot_id=bot_id,
            user_query=message.content,
            max_sources=3
        )
        
        # Create context from bot knowledge and recent messages
        context_parts = [
            f"You are {bot['name']}, a helpful assistant.",
            f"Description: {bot.get('description', '')}"
        ]
        
        # **ADD KNOWLEDGE SOURCES CONTEXT (RAG)**
        if relevant_knowledge:
            context_parts.append("\n=== KNOWLEDGE BASE ===")
            context_parts.append("Use the following information to answer the user's question accurately:")
            for idx, knowledge in enumerate(relevant_knowledge, 1):
                context_parts.append(f"\nSource {idx} ({knowledge['source_name']} - {knowledge['source_type']}):")
                context_parts.append(knowledge['content'])
            context_parts.append("\n=== END KNOWLEDGE BASE ===")
            context_parts.append("\nIMPORTANT: Base your answer primarily on the knowledge base above. Be specific and cite information from these sources.")
        
        # Check for matching intents
        intents = bot.get("intents", [])
        matched_intent = None
        if intents:
            for intent in intents:
                training_phrases = intent.get("example_phrases", [])
                user_query_lower = message.content.lower()
                # Simple keyword matching
                if any(phrase.lower() in user_query_lower for phrase in training_phrases if phrase):
                    matched_intent = intent
                    break
        
        if matched_intent:
            context_parts.append(f"\nDetected Intent: {matched_intent.get('name')}")
            if matched_intent.get("response_strategy") == "scripted":
                # Use scripted response
                scripted_response = matched_intent.get("scripted_response", "")
                if scripted_response:
                    context_parts.append(f"Use this response: {scripted_response}")
        
        context_parts.append("\nRecent conversation:")
        
        # Add last 5 messages for context (reduced to focus on knowledge)
        for msg in messages[-5:]:
            role = "User" if msg["role"] == "user" else "Assistant"
            context_parts.append(f"{role}: {msg['content']}")
        
        context_parts.append(f"\nUser: {message.content}")
        context_parts.append("Assistant:")
        
        # Use Gemini to generate response
        model_name = bot.get("model", "gemini-pro")
        # Map old model names to new ones
        if model_name in ["gemini-pro", "gemini-1.5-flash", "gemini-1.5-pro"]:
            model_name = "gemini-2.5-flash"
        model = genai.GenerativeModel(model_name)
        response = model.generate_content(
            "\n".join(context_parts),
            generation_config=genai.types.GenerationConfig(
                temperature=bot.get("temperature", 0.7),
                max_output_tokens=bot.get("max_tokens", 500)
            )
        )
        
        bot_response = response.text
        
    except Exception as e:
        print(f"Error generating AI response: {e}")
        bot_response = bot.get("fallback_message", "I'm having trouble understanding. Could you rephrase that?")
    
    # Add bot message
    bot_msg = {
        "id": str(uuid.uuid4()),
        "role": "assistant",
        "content": bot_response,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
    
    await db.chatbot_conversations.update_one(
        {"id": conversation_id},
        {
            "$push": {"messages": bot_msg},
            "$set": {"last_activity": datetime.now(timezone.utc)}
        }
    )
    
    return ChatResponse(
        message=bot_response,
        conversation_id=conversation_id
    )

    
    return ConversationMetrics(
        total_conversations=total,
        active_conversations=active,
        resolved_count=resolved,
        resolved_percentage=(resolved / total * 100) if total > 0 else 0,
        handoff_count=handoffs,
        handoff_percentage=(handoffs / total * 100) if total > 0 else 0,
        avg_csat=avg_csat,
        avg_duration_seconds=avg_duration,
        top_intents=top_intents,
        failed_queries=failed,
        period_start=period_start,
        period_end=period_end
    )
