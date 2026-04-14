"""
Flow Builder - Webhook Routes
Handles incoming webhook triggers and webhook configuration
"""
from fastapi import APIRouter, Depends, HTTPException, status, Body, Header, Request
from typing import List, Optional, Dict, Any
import uuid
import time
import logging
from datetime import datetime, timezone
from collections import defaultdict

logger = logging.getLogger(__name__)

# Import from parent modules
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))))

from server import db, User
from shared.auth import get_current_user
from ..models.flow import Flow, FlowStatus
from ..runtime.flow_runtime import FlowRuntimeEngine
from ..triggers.webhook_trigger import WebhookTriggerHandler

router = APIRouter()

# Rate limiting storage (in-memory)
rate_limit_store = defaultdict(list)


@router.post("/webhooks/flows/{flow_id}", include_in_schema=True)
async def incoming_webhook_trigger(
    flow_id: str,
    request: Request,
    payload: dict = Body(...),
    x_webhook_secret: Optional[str] = Header(None, alias="X-Webhook-Secret")
):
    """
    Incoming Webhook Trigger - Allows external systems to trigger flows
    
    Security: 
    - Validates X-Webhook-Secret header
    - Validates custom auth headers (configurable per flow)
    Rate Limiting: 10 requests/minute per flow
    Payload: Mapped to WebhookBody.* and Trigger.* variables in flow execution
    """
    global rate_limit_store
    
    start_time = time.time()
    
    # Get flow
    flow_data = await db.flows.find_one({
        "id": flow_id,
        "status": FlowStatus.ACTIVE
    }, {"_id": 0})
    
    if not flow_data:
        await db.webhook_execution_logs.insert_one({
            "id": str(uuid.uuid4()),
            "flow_id": flow_id,
            "flow_name": "Unknown",
            "webhook_url": f"/api/webhooks/flows/{flow_id}",
            "payload": payload,
            "headers": {"X-Webhook-Secret": "***"},
            "status": "failed",
            "http_status": 404,
            "error_message": "Flow not found or not active",
            "execution_time_ms": int((time.time() - start_time) * 1000),
            "timestamp": datetime.now(timezone.utc),
            "tenant_id": "unknown"
        })
        
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Flow not found or not active"
        )
    
    # Check if flow has incoming webhook trigger configured
    incoming_webhook_config = None
    for trigger in flow_data.get("triggers", []):
        trigger_type = trigger.get("type")
        if trigger_type in ["incoming_webhook", "incoming_webhook_trigger", "webhook_trigger"]:
            incoming_webhook_config = trigger.get("config", {})
            break
    
    if not incoming_webhook_config:
        await db.webhook_execution_logs.insert_one({
            "id": str(uuid.uuid4()),
            "flow_id": flow_id,
            "flow_name": flow_data.get("name", "Unknown"),
            "webhook_url": f"/api/webhooks/flows/{flow_id}",
            "payload": payload,
            "headers": {"X-Webhook-Secret": "***"},
            "status": "failed",
            "http_status": 400,
            "error_message": "Flow does not have incoming webhook trigger configured",
            "execution_time_ms": int((time.time() - start_time) * 1000),
            "timestamp": datetime.now(timezone.utc),
            "tenant_id": flow_data.get("tenant_id", "unknown")
        })
        
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Flow does not have incoming webhook trigger configured"
        )
    
    # Validate webhook secret
    expected_secret = incoming_webhook_config.get("webhook_secret")
    if not x_webhook_secret or x_webhook_secret != expected_secret:
        # Clear log message for debugging
        if not x_webhook_secret:
            error_detail = "Missing X-Webhook-Secret header - webhook request blocked"
            logger.warning(f"⛔ Webhook blocked for flow {flow_id} ({flow_data.get('name', 'Unknown')}): No X-Webhook-Secret header provided")
        else:
            error_detail = "Invalid X-Webhook-Secret header value - webhook request blocked"
            logger.warning(f"⛔ Webhook blocked for flow {flow_id} ({flow_data.get('name', 'Unknown')}): X-Webhook-Secret value mismatch")
        
        await db.webhook_execution_logs.insert_one({
            "id": str(uuid.uuid4()),
            "flow_id": flow_id,
            "flow_name": flow_data.get("name", "Unknown"),
            "webhook_url": f"/api/webhooks/flows/{flow_id}",
            "payload": payload,
            "headers": {"X-Webhook-Secret": "missing" if not x_webhook_secret else "invalid"},
            "status": "failed",
            "http_status": 401,
            "error_message": error_detail,
            "execution_time_ms": int((time.time() - start_time) * 1000),
            "timestamp": datetime.now(timezone.utc),
            "tenant_id": flow_data.get("tenant_id", "unknown")
        })
        
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=error_detail
        )
    
    # B4 FIX: Validate custom auth headers if configured
    # auth_headers config: [{"header_name": "X-API-KEY", "expected_value": "secret123", "required": true}]
    auth_headers = incoming_webhook_config.get("auth_headers", [])
    if auth_headers:
        logger.info(f"🔐 Validating {len(auth_headers)} custom auth header(s)")
        
        for auth_header in auth_headers:
            header_name = auth_header.get("header_name", "").strip()
            expected_value = auth_header.get("expected_value", "").strip()
            is_required = auth_header.get("required", True)
            
            if not header_name:
                continue
            
            # Get actual header value from request (case-insensitive)
            actual_value = None
            if request:
                # FastAPI/Starlette headers are case-insensitive
                actual_value = request.headers.get(header_name)
            
            # Also check common alternatives passed via Header() params
            if not actual_value:
                # Try to get from common header name patterns
                header_lower = header_name.lower().replace("-", "_")
                # Check payload for header pass-through (some clients send headers in body)
                actual_value = payload.get(f"_header_{header_lower}")
            
            # Clear logging for auth header validation
            if actual_value:
                logger.info(f"   Header '{header_name}': provided='{actual_value[:20]}...' (verifying...)")
            else:
                logger.warning(f"   ⚠️ Header '{header_name}': NOT PROVIDED in request")
            
            # Validate
            if is_required and not actual_value:
                error_msg = f"Missing required auth header: {header_name}"
                logger.warning(f"⛔ Webhook blocked for flow {flow_id} ({flow_data.get('name', 'Unknown')}): {error_msg}")
                await db.webhook_execution_logs.insert_one({
                    "id": str(uuid.uuid4()),
                    "flow_id": flow_id,
                    "flow_name": flow_data.get("name", "Unknown"),
                    "webhook_url": f"/api/webhooks/flows/{flow_id}",
                    "payload": payload,
                    "headers": {"auth_header_failed": header_name, "reason": "missing"},
                    "status": "failed",
                    "http_status": 401,
                    "error_message": error_msg,
                    "execution_time_ms": int((time.time() - start_time) * 1000),
                    "timestamp": datetime.now(timezone.utc),
                    "tenant_id": flow_data.get("tenant_id", "unknown")
                })
                
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail=error_msg
                )
            
            if actual_value and expected_value and actual_value != expected_value:
                error_msg = f"Invalid auth header value for: {header_name}"
                logger.warning(f"⛔ Webhook blocked for flow {flow_id} ({flow_data.get('name', 'Unknown')}): {error_msg}")
                await db.webhook_execution_logs.insert_one({
                    "id": str(uuid.uuid4()),
                    "flow_id": flow_id,
                    "flow_name": flow_data.get("name", "Unknown"),
                    "webhook_url": f"/api/webhooks/flows/{flow_id}",
                    "payload": payload,
                    "headers": {"auth_header_failed": header_name, "reason": "value_mismatch"},
                    "status": "failed",
                    "http_status": 403,
                    "error_message": error_msg,
                    "execution_time_ms": int((time.time() - start_time) * 1000),
                    "timestamp": datetime.now(timezone.utc),
                    "tenant_id": flow_data.get("tenant_id", "unknown")
                })
                
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=error_msg
                )
        
        logger.info(f"   ✅ All auth headers validated successfully")
    
    # Rate limiting
    rate_limit = incoming_webhook_config.get("rate_limit", 10)
    now = time.time()
    minute_ago = now - 60
    
    # Clean old entries
    rate_limit_store[flow_id] = [
        t for t in rate_limit_store[flow_id] if t > minute_ago
    ]
    
    if len(rate_limit_store[flow_id]) >= rate_limit:
        await db.webhook_execution_logs.insert_one({
            "id": str(uuid.uuid4()),
            "flow_id": flow_id,
            "flow_name": flow_data.get("name", "Unknown"),
            "webhook_url": f"/api/webhooks/flows/{flow_id}",
            "payload": payload,
            "headers": {"X-Webhook-Secret": "***"},
            "status": "failed",
            "http_status": 429,
            "error_message": f"Rate limit exceeded: {rate_limit} requests per minute",
            "execution_time_ms": int((time.time() - start_time) * 1000),
            "timestamp": datetime.now(timezone.utc),
            "tenant_id": flow_data.get("tenant_id", "unknown")
        })
        
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Rate limit exceeded: {rate_limit} requests per minute"
        )
    
    rate_limit_store[flow_id].append(now)
    
    # Validate body fields if configured
    body_fields = incoming_webhook_config.get("body_fields", [])
    if body_fields:
        for field in body_fields:
            if field.get("required", False) and field.get("name") not in payload:
                await db.webhook_execution_logs.insert_one({
                    "id": str(uuid.uuid4()),
                    "flow_id": flow_id,
                    "flow_name": flow_data.get("name", "Unknown"),
                    "webhook_url": f"/api/webhooks/flows/{flow_id}",
                    "payload": payload,
                    "headers": {"X-Webhook-Secret": "***"},
                    "status": "failed",
                    "http_status": 400,
                    "error_message": f"Missing required field: {field.get('name')}",
                    "execution_time_ms": int((time.time() - start_time) * 1000),
                    "timestamp": datetime.now(timezone.utc),
                    "tenant_id": flow_data.get("tenant_id", "unknown")
                })
                
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Missing required field: {field.get('name')}"
                )
    
    # Execute flow with webhook payload
    try:
        runtime = FlowRuntimeEngine(db)
        
        webhook_context = {
            "webhook": payload,
            "WebhookBody": payload,
            "trigger_type": "incoming_webhook",
            "triggered_by": "webhook"
        }
        
        execution = await runtime.execute_flow(
            flow=Flow(**flow_data),
            trigger_data={},
            context=webhook_context
        )
        
        execution_time_ms = int((time.time() - start_time) * 1000)
        
        await db.webhook_execution_logs.insert_one({
            "id": str(uuid.uuid4()),
            "flow_id": flow_id,
            "flow_name": flow_data.get("name", "Unknown"),
            "webhook_url": f"/api/webhooks/flows/{flow_id}",
            "payload": payload,
            "headers": {"X-Webhook-Secret": "***"},
            "status": "success",
            "http_status": 200,
            "execution_id": execution.id,
            "error_message": None,
            "execution_time_ms": execution_time_ms,
            "timestamp": datetime.now(timezone.utc),
            "tenant_id": flow_data["tenant_id"]
        })
        
        # Update last triggered timestamp
        await db.flows.update_one(
            {"id": flow_id},
            {"$set": {"triggers.$[elem].config.last_triggered_at": datetime.now(timezone.utc)}},
            array_filters=[{"elem.type": "incoming_webhook"}]
        )
        
        logger.info(f"✅ Webhook triggered flow {flow_id}, execution: {execution.id}")
        
        return {
            "success": True,
            "execution_id": execution.id,
            "status": execution.status
        }
        
    except Exception as e:
        execution_time_ms = int((time.time() - start_time) * 1000)
        
        await db.webhook_execution_logs.insert_one({
            "id": str(uuid.uuid4()),
            "flow_id": flow_id,
            "flow_name": flow_data.get("name", "Unknown"),
            "webhook_url": f"/api/webhooks/flows/{flow_id}",
            "payload": payload,
            "headers": {"X-Webhook-Secret": "***"},
            "status": "failed",
            "http_status": 500,
            "execution_id": None,
            "error_message": str(e),
            "execution_time_ms": execution_time_ms,
            "timestamp": datetime.now(timezone.utc),
            "tenant_id": flow_data["tenant_id"]
        })
        
        logger.error(f"❌ Webhook execution failed for flow {flow_id}: {e}")
        
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Flow execution failed: {str(e)}"
        )


@router.get("/webhook-logs", response_model=List[Dict[str, Any]])
async def list_webhook_logs(
    flow_id: Optional[str] = None,
    limit: int = 50,
    current_user: User = Depends(get_current_user)
):
    """List webhook execution logs"""
    tenant_id = current_user.tenant_id
    
    query = {"tenant_id": tenant_id}
    if flow_id:
        query["flow_id"] = flow_id
    
    logs = await db.webhook_execution_logs.find(
        query,
        {"_id": 0}
    ).sort("timestamp", -1).limit(limit).to_list(length=None)
    
    return logs


@router.get("/flows/{flow_id}/webhook-config")
async def get_webhook_config(
    flow_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get webhook configuration for a flow"""
    tenant_id = current_user.tenant_id
    
    flow_data = await db.flows.find_one({
        "id": flow_id,
        "tenant_id": tenant_id
    }, {"_id": 0})
    
    if not flow_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Flow not found"
        )
    
    # Find incoming webhook trigger
    incoming_webhook_config = None
    for trigger in flow_data.get("triggers", []):
        trigger_type = trigger.get("type")
        if trigger_type in ["incoming_webhook", "incoming_webhook_trigger", "webhook_trigger"]:
            incoming_webhook_config = trigger.get("config", {})
            break
    
    if not incoming_webhook_config:
        return {
            "has_webhook": False,
            "webhook_url": None,
            "secret": None
        }
    
    backend_url = os.getenv("BACKEND_URL") or os.getenv("BACKEND_URL", "http://localhost:8001")
    backend_url = backend_url.rstrip('/')
    
    return {
        "has_webhook": True,
        "webhook_url": f"{backend_url}/api/flow-builder/webhooks/flows/{flow_id}",
        "secret": incoming_webhook_config.get("webhook_secret"),
        "rate_limit": incoming_webhook_config.get("rate_limit", 10),
        "enabled": incoming_webhook_config.get("enabled", True),
        "last_triggered_at": incoming_webhook_config.get("last_triggered_at")
    }


@router.post("/hooks/{slug}")
async def webhook_handler(
    slug: str,
    payload: dict = Body(...),
    current_user: User = Depends(get_current_user)
):
    """Handle incoming webhook (legacy outgoing webhook handler)"""
    tenant_id = current_user.tenant_id
    
    wh_handler = WebhookTriggerHandler(db)
    execution = await wh_handler.handle_webhook(
        slug=slug,
        payload=payload,
        tenant_id=tenant_id,
        method="POST"
    )
    
    if not execution:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No active flow found for webhook: {slug}"
        )
    
    return {
        "status": "success",
        "execution_id": execution.id,
        "execution_status": execution.status
    }
