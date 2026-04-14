"""
CLU-BOT API Routes
RESTful API for the AI-powered CRM Assistant.
"""
import os
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from typing import Optional
import logging

from ..models import (
    ChatRequest, ChatResponse, PreviewConfirmRequest,
    ConversationListResponse, ALLOWED_FILE_TYPES, MAX_FILE_SIZE_MB
)
from ..services import get_clu_bot_orchestrator, get_conversation_service

# Import auth from server
from modules.auth.api.auth_routes import get_current_user
from shared.models import User
from config.database import db

from config.settings import settings
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/clu-bot", tags=["CLU-BOT"])

# File upload storage directory
CLU_BOT_UPLOAD_DIR = os.path.join(settings.STORAGE_BASE_DIR, "uploads", "clu_bot")
os.makedirs(CLU_BOT_UPLOAD_DIR, exist_ok=True)


# =============================================================================
# Chat Endpoints
# =============================================================================

@router.post("/chat", response_model=ChatResponse)
async def send_message(
    request: ChatRequest,
    current_user: User = Depends(get_current_user)
):
    """
    Send a message to CLU-BOT and get a response.
    
    This is the main interaction endpoint. The bot will:
    1. Parse your intent (search, create, summarize, etc.)
    2. For read operations: Execute immediately and return results
    3. For write operations: Preview the action and ask for confirmation
    
    **Examples:**
    - "Find leads from Acme Corp"
    - "Show me John Smith's contact details"
    - "Create a lead for Jane Doe, email jane@example.com"
    - "Add a note to the Acme account"
    - "Create a task to follow up tomorrow"
    """
    try:
        orchestrator = get_clu_bot_orchestrator(db)
        
        response = await orchestrator.process_message(
            tenant_id=current_user.tenant_id,
            user_id=current_user.id,
            request=request
        )
        
        return response
        
    except Exception as e:
        logger.error(f"Chat error: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to process message: {str(e)}"
        )


@router.post("/chat/confirm", response_model=ChatResponse)
async def confirm_action(
    request: PreviewConfirmRequest,
    current_user: User = Depends(get_current_user)
):
    """
    Confirm or cancel a previewed action.
    
    When CLU-BOT previews an action (create, update), use this endpoint
    to confirm or cancel the action.
    
    **Request:**
    - `conversation_id`: The conversation ID
    - `action_id`: The action ID from the preview
    - `confirmed`: true to proceed, false to cancel
    """
    try:
        orchestrator = get_clu_bot_orchestrator(db)
        
        response = await orchestrator.confirm_preview(
            tenant_id=current_user.tenant_id,
            user_id=current_user.id,
            conversation_id=request.conversation_id,
            action_id=request.action_id,
            confirmed=request.confirmed
        )
        
        return response
        
    except Exception as e:
        logger.error(f"Confirm error: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to confirm action: {str(e)}"
        )


@router.post("/undo/{journal_entry_id}")
async def undo_action(
    journal_entry_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Undo a previously executed action.
    
    Only actions that support undo (create operations) can be undone.
    The journal_entry_id is returned in the result_data after execution.
    """
    try:
        orchestrator = get_clu_bot_orchestrator(db)
        
        result = await orchestrator.undo_action(
            tenant_id=current_user.tenant_id,
            user_id=current_user.id,
            journal_entry_id=journal_entry_id
        )
        
        return result
        
    except Exception as e:
        logger.error(f"Undo error: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to undo action: {str(e)}"
        )


# =============================================================================
# Conversation Management Endpoints
# =============================================================================

@router.get("/conversations", response_model=ConversationListResponse)
async def list_conversations(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    current_user: User = Depends(get_current_user)
):
    """
    Get a list of your CLU-BOT conversations.
    
    Returns conversations sorted by most recently active.
    """
    try:
        conversation_service = get_conversation_service(db)
        
        result = await conversation_service.get_user_conversations(
            tenant_id=current_user.tenant_id,
            user_id=current_user.id,
            limit=limit,
            offset=offset
        )
        
        return result
        
    except Exception as e:
        logger.error(f"List conversations error: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to list conversations: {str(e)}"
        )


@router.get("/conversations/{conversation_id}")
async def get_conversation(
    conversation_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Get a specific conversation with full message history.
    """
    try:
        conversation_service = get_conversation_service(db)
        
        conversation = await conversation_service.get_conversation(
            conversation_id=conversation_id,
            tenant_id=current_user.tenant_id,
            user_id=current_user.id
        )
        
        if not conversation:
            raise HTTPException(status_code=404, detail="Conversation not found")
        
        return conversation.model_dump()
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get conversation error: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get conversation: {str(e)}"
        )


@router.delete("/conversations/{conversation_id}")
async def delete_conversation(
    conversation_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Delete a conversation.
    """
    try:
        conversation_service = get_conversation_service(db)
        
        success = await conversation_service.delete_conversation(
            conversation_id=conversation_id,
            tenant_id=current_user.tenant_id,
            user_id=current_user.id
        )
        
        if not success:
            raise HTTPException(status_code=404, detail="Conversation not found")
        
        return {"message": "Conversation deleted successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Delete conversation error: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to delete conversation: {str(e)}"
        )


# =============================================================================
# Execution Journal Endpoints
# =============================================================================

@router.get("/journal")
async def get_execution_journal(
    conversation_id: Optional[str] = None,
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    current_user: User = Depends(get_current_user)
):
    """
    Get the execution journal entries.
    
    Shows a history of actions executed by CLU-BOT, useful for undo and auditing.
    """
    try:
        query = {
            "tenant_id": current_user.tenant_id,
            "user_id": current_user.id
        }
        
        if conversation_id:
            query["conversation_id"] = conversation_id
        
        total = await db.clu_bot_execution_journal.count_documents(query)
        
        cursor = db.clu_bot_execution_journal.find(query, {"_id": 0})
        cursor = cursor.sort("created_at", -1).skip(offset).limit(limit)
        
        entries = await cursor.to_list(length=limit)
        
        return {
            "entries": entries,
            "total": total,
            "limit": limit,
            "offset": offset
        }
        
    except Exception as e:
        logger.error(f"Get journal error: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get execution journal: {str(e)}"
        )


# =============================================================================
# File Upload Endpoint
# =============================================================================

@router.post("/upload")
async def upload_file_for_context(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user)
):
    """
    Upload a file for CLU-BOT context analysis.
    Supports: PDF, DOCX, TXT, CSV, XLSX (max 10MB).
    """
    try:
        # Validate file type
        file_ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
        if file_ext not in ALLOWED_FILE_TYPES:
            raise HTTPException(
                status_code=400,
                detail=f"File type '.{file_ext}' is not supported. Allowed: {', '.join(ALLOWED_FILE_TYPES)}"
            )

        # Read content and validate size
        content = await file.read()
        size_mb = len(content) / (1024 * 1024)
        if size_mb > MAX_FILE_SIZE_MB:
            raise HTTPException(
                status_code=400,
                detail=f"File size ({size_mb:.1f}MB) exceeds the {MAX_FILE_SIZE_MB}MB limit."
            )

        # Generate file ID and save to disk
        file_id = str(uuid.uuid4())[:12]
        safe_filename = f"{file_id}_{file.filename.replace('/', '_').replace('..', '_')}"
        storage_path = os.path.join(CLU_BOT_UPLOAD_DIR, safe_filename)

        with open(storage_path, "wb") as f:
            f.write(content)

        # Store metadata in clu_bot_file_uploads
        tenant_id = current_user.tenant_id
        user_id = str(current_user.id)

        file_record = {
            "id": file_id,
            "tenant_id": tenant_id,
            "user_id": user_id,
            "file_name": file.filename,
            "file_type": file_ext,
            "storage_path": storage_path,
            "size_bytes": len(content),
            "uploaded_at": datetime.now(timezone.utc).isoformat()
        }

        await db.clu_bot_file_uploads.insert_one(file_record)

        logger.info(f"[CLU-BOT] File uploaded: {file.filename} ({len(content)} bytes) by user {user_id}")

        return {
            "success": True,
            "file_id": file_id,
            "file_name": file.filename,
            "file_type": file_ext,
            "size_bytes": len(content),
            "message": f"File '{file.filename}' uploaded successfully. You can now ask me about its content."
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"File upload error: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to upload file: {str(e)}"
        )


@router.get("/files")
async def get_uploaded_files(
    current_user: User = Depends(get_current_user)
):
    """Get list of files uploaded by the current user for CLU-BOT context"""
    try:
        tenant_id = current_user.tenant_id
        user_id = str(current_user.id)

        cursor = db.clu_bot_file_uploads.find(
            {"tenant_id": tenant_id, "user_id": user_id},
            {"_id": 0}
        ).sort("uploaded_at", -1).limit(20)

        files = await cursor.to_list(20)
        return {"files": files, "total": len(files)}

    except Exception as e:
        logger.error(f"Get files error: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get uploaded files: {str(e)}"
        )


# =============================================================================
# Health & Status Endpoints
# =============================================================================

@router.get("/status")
async def get_status(
    current_user: User = Depends(get_current_user)
):
    """
    Get CLU-BOT status and capabilities.
    
    Returns information about available actions and current configuration.
    """
    return {
        "status": "operational",
        "phase": "4",
        "capabilities": {
            # Phase 1
            "search_records": {
                "enabled": True,
                "objects": ["lead", "contact", "account", "opportunity", "task", "event", "file", "note"]
            },
            "record_summary": {
                "enabled": True,
                "objects": ["lead", "contact", "account", "opportunity"]
            },
            "create_lead": {
                "enabled": True,
                "requires_preview": True
            },
            "add_note": {
                "enabled": True,
                "requires_preview": True
            },
            "create_task": {
                "enabled": True,
                "requires_preview": True
            },
            # Phase 2A
            "update_record": {
                "enabled": True,
                "objects": ["contact", "account", "opportunity"],
                "requires_preview": True,
                "risk_level": "high"
            },
            "create_list_view": {
                "enabled": True,
                "objects": ["lead", "contact", "account", "opportunity", "task"],
                "requires_preview": True,
                "filter_operators": ["equals", "not_equals", "contains", "starts_with", "greater_than", "less_than", "is_empty", "is_not_empty"]
            },
            # Phase 2B
            "generate_report": {
                "enabled": True,
                "report_types": ["revenue", "pipeline", "leads", "opportunities", "activities", "conversion"],
                "periods": ["day", "week", "month", "quarter", "year", "custom"],
                "risk_level": "low"
            },
            "compare_metrics": {
                "enabled": True,
                "metric_types": ["revenue", "pipeline_value", "lead_count", "opportunity_count", "conversion_rate", "win_rate"],
                "periods": ["this_month", "last_month", "this_quarter", "last_quarter", "this_year", "last_year"],
                "risk_level": "low"
            },
            "find_insights": {
                "enabled": True,
                "insight_types": ["inactive_leads", "stale_opportunities", "slipping_deals", "overdue_tasks", "high_value_leads", "top_performers", "at_risk_accounts"],
                "risk_level": "low"
            },
            # Phase 3
            "create_dashboard": {
                "enabled": True,
                "dashboard_types": ["sales_performance", "pipeline_overview", "lead_management", "activity_tracker", "custom"],
                "requires_preview": True,
                "risk_level": "medium"
            },
            "trend_analysis": {
                "enabled": True,
                "metrics": ["revenue", "leads", "opportunities", "pipeline_value", "activities", "conversion_rate", "win_rate"],
                "period_types": ["day", "week", "month", "quarter"],
                "risk_level": "low"
            },
            "pipeline_forecast": {
                "enabled": True,
                "forecast_periods": ["month", "quarter", "year"],
                "risk_level": "low"
            },
            # Phase 4
            "read_file": {
                "enabled": True,
                "supported_types": ["pdf", "docx", "txt", "csv", "xlsx"],
                "max_size_mb": 10,
                "risk_level": "low"
            },
            "fetch_url": {
                "enabled": True,
                "requires_preview": True,
                "risk_level": "medium"
            },
            "analyze_with_context": {
                "enabled": True,
                "risk_level": "low"
            }
        },
        "model": "gemini-2.5-flash",
        "preview_required": ["create_lead", "add_note", "create_task", "update_record", "create_list_view", "create_dashboard", "fetch_url"],
        "undo_supported": ["create_lead", "add_note", "create_task", "update_record", "create_list_view", "create_dashboard"]
    }
