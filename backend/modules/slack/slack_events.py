"""
Slack Events API Integration
Handles incoming messages from Slack and forwards to chatbot
"""
import os
import hmac
import hashlib
import time
import logging
from fastapi import APIRouter, Request, HTTPException
from typing import Dict, Any
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/slack", tags=["Slack Integration"])

# Get Slack signing secret from environment
SLACK_SIGNING_SECRET = os.environ.get("SLACK_SIGNING_SECRET", "")
SLACK_BOT_USER_ID = os.environ.get("SLACK_BOT_USER_ID", "")

def verify_slack_signature(request_body: bytes, timestamp: str, signature: str) -> bool:
    """
    Verify that the request came from Slack using signature validation
    """
    if not SLACK_SIGNING_SECRET:
        logger.warning("SLACK_SIGNING_SECRET not set, skipping signature verification")
        return True  # Allow in development, but should be set in production
    
    # Prevent replay attacks - reject requests older than 5 minutes
    current_timestamp = int(time.time())
    if abs(current_timestamp - int(timestamp)) > 60 * 5:
        logger.warning(f"Timestamp too old: {timestamp}")
        return False
    
    # Create signature base string
    sig_basestring = f"v0:{timestamp}:{request_body.decode('utf-8')}"
    
    # Calculate expected signature
    expected_signature = 'v0=' + hmac.new(
        SLACK_SIGNING_SECRET.encode(),
        sig_basestring.encode(),
        hashlib.sha256
    ).hexdigest()
    
    # Compare signatures
    return hmac.compare_digest(expected_signature, signature)


@router.post("/events")
async def slack_events(request: Request):
    """
    Main endpoint for Slack Event Subscriptions
    Handles:
    - URL verification challenge
    - Message events from Slack
    - Signature verification
    """
    from server import db
    
    # Get raw body for signature verification
    body = await request.body()
    
    # Get Slack headers
    timestamp = request.headers.get("X-Slack-Request-Timestamp", "")
    signature = request.headers.get("X-Slack-Signature", "")
    
    # Verify Slack signature
    if signature and timestamp:
        if not verify_slack_signature(body, timestamp, signature):
            logger.error("Invalid Slack signature")
            raise HTTPException(status_code=403, detail="Invalid signature")
    
    # Parse JSON body
    try:
        data = await request.json()
    except Exception as e:
        logger.error(f"Error parsing JSON: {e}")
        raise HTTPException(status_code=400, detail="Invalid JSON")
    
    event_type = data.get("type")
    
    # Handle URL verification challenge
    if event_type == "url_verification":
        challenge = data.get("challenge")
        logger.info(f"Slack URL verification challenge received: {challenge}")
        return {"challenge": challenge}
    
    # Handle event callbacks
    if event_type == "event_callback":
        event = data.get("event", {})
        event_subtype = event.get("type")
        
        # Only process message events
        if event_subtype == "message":
            # Extract event details
            channel_id = event.get("channel")
            text = event.get("text", "")
            user_id = event.get("user")
            bot_id = event.get("bot_id")
            ts = event.get("ts")
            subtype = event.get("subtype")
            
            # Ignore bot messages to prevent loops
            if bot_id or user_id == SLACK_BOT_USER_ID:
                logger.debug(f"Ignoring bot message from {bot_id or user_id}")
                return {"status": "ok", "message": "Bot message ignored"}
            
            # Ignore message subtypes like message_changed, message_deleted
            if subtype and subtype in ["message_changed", "message_deleted", "bot_message"]:
                logger.debug(f"Ignoring message subtype: {subtype}")
                return {"status": "ok", "message": "Subtype ignored"}
            
            # Ignore empty messages
            if not text or not text.strip():
                logger.debug("Ignoring empty message")
                return {"status": "ok", "message": "Empty message ignored"}
            
            logger.info(f"Processing Slack message from channel {channel_id}: {text[:50]}...")
            
            try:
                # Look up chatbot session for this Slack channel
                mapping = await db.slack_chatbot_mappings.find_one({
                    "slack_channel_id": channel_id
                })
                
                if not mapping:
                    logger.warning(f"No chatbot session found for Slack channel {channel_id}")
                    return {
                        "status": "ok",
                        "message": "No mapping found - channel not connected to chatbot"
                    }
                
                conversation_id = mapping.get("conversation_id")
                bot_id = mapping.get("bot_id")
                
                logger.info(f"Found mapping: channel {channel_id} -> conversation {conversation_id}")
                
                # Forward message to chatbot
                await forward_to_chatbot(
                    conversation_id=conversation_id,
                    bot_id=bot_id,
                    message=text,
                    slack_channel_id=channel_id,
                    slack_user_id=user_id,
                    slack_ts=ts,
                    db=db
                )
                
                return {"status": "ok", "message": "Message processed"}
                
            except Exception as e:
                logger.error(f"Error processing Slack message: {e}", exc_info=True)
                return {"status": "error", "message": str(e)}
    
    # Acknowledge other events
    return {"status": "ok"}


async def forward_to_chatbot(
    conversation_id: str,
    bot_id: str,
    message: str,
    slack_channel_id: str,
    slack_user_id: str,
    slack_ts: str,
    db
):
    """
    Forward Slack message to chatbot and send bot response back to Slack
    """
    from modules.chatbot_manager.services.knowledge_retrieval_service import KnowledgeRetrievalService
    import httpx
    from datetime import datetime, timezone
    
    logger.info(f"Forwarding message to chatbot conversation {conversation_id}")
    
    try:
        # Get bot configuration
        bot = await db.chatbots.find_one({"id": bot_id})
        if not bot:
            logger.error(f"Bot {bot_id} not found")
            return
        
        # Store user message in conversation history
        user_message = {
            "role": "user",
            "content": message,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "source": "slack",
            "slack_user_id": slack_user_id,
            "slack_ts": slack_ts
        }
        
        await db.chatbot_conversations.update_one(
            {"id": conversation_id},
            {
                "$push": {"messages": user_message},
                "$set": {"last_message_at": datetime.now(timezone.utc).isoformat()}
            }
        )
        
        # Generate bot response using knowledge retrieval
        knowledge_service = KnowledgeRetrievalService(db)
        
        # Get conversation history for context
        conversation = await db.chatbot_conversations.find_one({"id": conversation_id})
        conversation_history = conversation.get("messages", [])[-10:]  # Last 10 messages
        
        # Generate response
        bot_response = await knowledge_service.get_response(
            bot_id=bot_id,
            user_query=message,
            conversation_history=conversation_history
        )
        
        # Store bot response
        bot_message = {
            "role": "assistant",
            "content": bot_response,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "source": "chatbot"
        }
        
        await db.chatbot_conversations.update_one(
            {"id": conversation_id},
            {
                "$push": {"messages": bot_message},
                "$set": {"last_message_at": datetime.now(timezone.utc).isoformat()}
            }
        )
        
        # Send bot response back to Slack
        await send_message_to_slack(slack_channel_id, bot_response)
        
        logger.info(f"Successfully processed message and sent response to Slack")
        
    except Exception as e:
        logger.error(f"Error in forward_to_chatbot: {e}", exc_info=True)
        # Send error message to Slack
        await send_message_to_slack(
            slack_channel_id,
            "Sorry, I encountered an error processing your message. Please try again."
        )


async def send_message_to_slack(channel_id: str, message: str):
    """
    Send a message to Slack channel using Slack Web API
    """
    import httpx
    
    slack_token = os.environ.get("SLACK_BOT_TOKEN", "")
    
    if not slack_token:
        logger.error("SLACK_BOT_TOKEN not set, cannot send message to Slack")
        return
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://slack.com/api/chat.postMessage",
                headers={
                    "Authorization": f"Bearer {slack_token}",
                    "Content-Type": "application/json"
                },
                json={
                    "channel": channel_id,
                    "text": message
                },
                timeout=10.0
            )
            
            result = response.json()
            
            if not result.get("ok"):
                logger.error(f"Failed to send message to Slack: {result.get('error')}")
            else:
                logger.info(f"Successfully sent message to Slack channel {channel_id}")
                
    except Exception as e:
        logger.error(f"Error sending message to Slack: {e}", exc_info=True)


class SlackMappingRequest(BaseModel):
    conversation_id: str
    bot_id: str
    slack_channel_id: str

@router.post("/create-mapping")
async def create_slack_mapping(request: SlackMappingRequest):
    """
    Create a mapping between Slack channel and chatbot conversation
    Called from the Connect to Slack flow in the widget
    """
    from server import db
    from datetime import datetime, timezone
    
    try:
        # Check if mapping already exists
        existing = await db.slack_chatbot_mappings.find_one({
            "slack_channel_id": request.slack_channel_id
        })
        
        if existing:
            # Update existing mapping with new conversation_id
            await db.slack_chatbot_mappings.update_one(
                {"slack_channel_id": request.slack_channel_id},
                {
                    "$set": {
                        "conversation_id": request.conversation_id,
                        "bot_id": request.bot_id,
                        "updated_at": datetime.now(timezone.utc).isoformat()
                    }
                }
            )
            logger.info(f"Updated existing mapping for channel {request.slack_channel_id}")
            return {
                "success": True,
                "message": "Mapping updated successfully",
                "mapping_id": existing.get("id")
            }
        
        # Create new mapping
        mapping = {
            "id": f"mapping_{int(time.time())}_{request.slack_channel_id}",
            "conversation_id": request.conversation_id,
            "bot_id": request.bot_id,
            "slack_channel_id": request.slack_channel_id,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        
        await db.slack_chatbot_mappings.insert_one(mapping)
        
        logger.info(f"Created mapping: {request.slack_channel_id} -> {request.conversation_id}")
        
        return {
            "success": True,
            "message": "Mapping created successfully",
            "mapping_id": mapping["id"]
        }
        
    except Exception as e:
        logger.error(f"Error creating Slack mapping: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/test")
async def test_slack_endpoint():
    """
    Test endpoint to verify Slack integration is working
    """
    return {
        "status": "ok",
        "message": "Slack Events API is running",
        "signing_secret_set": bool(SLACK_SIGNING_SECRET),
        "bot_token_set": bool(os.environ.get("SLACK_BOT_TOKEN")),
        "bot_user_id_set": bool(SLACK_BOT_USER_ID)
    }
