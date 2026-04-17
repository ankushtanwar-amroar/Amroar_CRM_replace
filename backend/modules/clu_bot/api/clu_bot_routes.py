"""
CLU-BOT API Routes
RESTful API for the AI-powered CRM Assistant.
"""
import os
import uuid
import io
import csv
import json
import asyncio
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import StreamingResponse
from typing import Optional, List, Dict, Any, AsyncGenerator
import logging

from ..models import (
    ChatRequest, ChatResponse, PreviewConfirmRequest,
    ConversationListResponse, ExportReportRequest, ALLOWED_FILE_TYPES, MAX_FILE_SIZE_MB
)
from ..services import get_clu_bot_orchestrator, get_conversation_service

# Import auth from server
from modules.auth.api.auth_routes import get_current_user
from shared.models import User
from config.database import db

from config.settings import settings
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/clu-bot", tags=["CLU-BOT"])

# File upload storage: env override for Docker (`/app/uploads/clu_bot`), else under backend/uploads (local Windows/macOS/Linux)
_CLU_BOT_API_DIR = os.path.dirname(os.path.abspath(__file__))
_BACKEND_ROOT = os.path.abspath(os.path.join(_CLU_BOT_API_DIR, "..", "..", ".."))
_DEFAULT_UPLOAD_DIR = os.path.join(_BACKEND_ROOT, "uploads", "clu_bot")
CLU_BOT_UPLOAD_DIR = os.environ.get("CLU_BOT_UPLOAD_DIR", _DEFAULT_UPLOAD_DIR)
os.makedirs(CLU_BOT_UPLOAD_DIR, exist_ok=True)
STREAM_CHUNK_SIZE = max(1, int(os.environ.get("CLU_BOT_STREAM_CHUNK_SIZE", "4")))
STREAM_CHUNK_DELAY_SEC = max(0.0, float(os.environ.get("CLU_BOT_STREAM_CHUNK_DELAY_SEC", "0.08")))


def _flatten_export_rows(report_data: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Build tabular rows from analytics result payload for file exports.
    Keeps a generic fallback so all report shapes can be exported.
    """
    data = report_data.get("data")
    report_type = str(report_data.get("report_type", "report"))
    rows: List[Dict[str, Any]] = []

    if isinstance(data, list):
        for item in data:
            if isinstance(item, dict):
                rows.append(item)
            else:
                rows.append({"value": item})
    elif isinstance(data, dict):
        # Nested dict report (e.g. leads by status/source)
        if "by_status" in data and isinstance(data["by_status"], list):
            for item in data["by_status"]:
                rows.append({
                    "section": "by_status",
                    "label": item.get("_id"),
                    "count": item.get("count")
                })
        if "by_source" in data and isinstance(data["by_source"], list):
            for item in data["by_source"]:
                rows.append({
                    "section": "by_source",
                    "label": item.get("_id"),
                    "count": item.get("count")
                })
        if not rows:
            # Flat dict fallback
            rows.append({k: v for k, v in data.items() if not isinstance(v, (dict, list))})
    else:
        rows.append({"value": data})

    if not rows:
        rows = [{"report_type": report_type, "summary": report_data.get("summary", "")}]

    return rows


def _normalize_filename(prefix: str, ext: str) -> str:
    safe = "".join(ch if ch.isalnum() or ch in ("_", "-") else "_" for ch in (prefix or "crm_analytics_report"))
    return f"{safe}.{ext}"


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
            current_user=current_user,
            request=request
        )
        
        return response
        
    except Exception as e:
        logger.error(f"Chat error: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to process message: {str(e)}"
        )


@router.post("/chat/stream")
async def send_message_stream(
    request: ChatRequest,
    current_user: User = Depends(get_current_user)
):
    """
    Stream CLU-BOT response as Server-Sent Events (SSE).
    Emits `chunk` events for incremental message text and a final payload event.
    """
    async def event_generator() -> AsyncGenerator[str, None]:
        try:
            orchestrator = get_clu_bot_orchestrator(db)
            stream_queue: asyncio.Queue[str] = asyncio.Queue()
            streamed_any = False

            async def stream_callback(token: str) -> None:
                if token:
                    await stream_queue.put(token)

            response_task = asyncio.create_task(
                orchestrator.process_message(
                    tenant_id=current_user.tenant_id,
                    user_id=current_user.id,
                    current_user=current_user,
                    request=request,
                    stream_callback=stream_callback
                )
            )

            while not response_task.done() or not stream_queue.empty():
                try:
                    token = await asyncio.wait_for(stream_queue.get(), timeout=0.1)
                    streamed_any = True
                    yield f"data: {json.dumps({'type': 'chunk', 'delta': token})}\n\n"
                except asyncio.TimeoutError:
                    continue

            response = await response_task

            # Fallback: if action path had no token stream, keep progressive UX
            if not streamed_any:
                message_text = response.message or ""
                for i in range(0, len(message_text), STREAM_CHUNK_SIZE):
                    chunk = message_text[i:i + STREAM_CHUNK_SIZE]
                    yield f"data: {json.dumps({'type': 'chunk', 'delta': chunk})}\n\n"
                    await asyncio.sleep(STREAM_CHUNK_DELAY_SEC)

            final_payload = response.model_dump(mode="json")
            yield f"data: {json.dumps({'type': 'final', 'data': final_payload})}\n\n"
            yield "data: [DONE]\n\n"
        except Exception as e:
            logger.error(f"Chat stream error: {str(e)}")
            err_payload = {"type": "error", "message": f"Failed to process message: {str(e)}"}
            yield f"data: {json.dumps(err_payload)}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
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
            current_user=current_user,
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


@router.post("/export")
async def export_report(
    request: ExportReportRequest,
    current_user: User = Depends(get_current_user)
):
    """
    Export CLU-BOT analytics response payload as CSV, XLSX, or PDF summary.
    """
    try:
        export_format = request.format.lower()
        report_data = request.report_data or {}
        rows = _flatten_export_rows(report_data)
        report_name = request.report_name or report_data.get("report_type") or "crm_analytics_report"
        period = report_data.get("period", "")
        summary = report_data.get("summary", "")

        if export_format == "csv":
            csv_buffer = io.StringIO()
            headers: List[str] = []
            for row in rows:
                for key in row.keys():
                    if key not in headers:
                        headers.append(key)
            writer = csv.DictWriter(csv_buffer, fieldnames=headers or ["value"])
            writer.writeheader()
            for row in rows:
                writer.writerow(row)
            payload = io.BytesIO(csv_buffer.getvalue().encode("utf-8"))
            filename = _normalize_filename(report_name, "csv")
            return StreamingResponse(
                payload,
                media_type="text/csv",
                headers={"Content-Disposition": f'attachment; filename="{filename}"'}
            )

        if export_format == "xlsx":
            from openpyxl import Workbook
            wb = Workbook()
            ws = wb.active
            ws.title = "Report"

            headers: List[str] = []
            for row in rows:
                for key in row.keys():
                    if key not in headers:
                        headers.append(key)
            ws.append(headers or ["value"])
            for row in rows:
                ws.append([row.get(h, "") for h in (headers or ["value"])])

            xlsx_buffer = io.BytesIO()
            wb.save(xlsx_buffer)
            xlsx_buffer.seek(0)
            filename = _normalize_filename(report_name, "xlsx")
            return StreamingResponse(
                xlsx_buffer,
                media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                headers={"Content-Disposition": f'attachment; filename="{filename}"'}
            )

        if export_format == "pdf":
            from reportlab.lib.pagesizes import letter
            from reportlab.pdfgen import canvas
            pdf_buffer = io.BytesIO()
            c = canvas.Canvas(pdf_buffer, pagesize=letter)
            width, height = letter
            y = height - 50

            c.setFont("Helvetica-Bold", 14)
            c.drawString(40, y, "CLU-BOT CRM Analytics Summary")
            y -= 22
            c.setFont("Helvetica", 10)
            c.drawString(40, y, f"Report: {report_data.get('report_type', 'report')}")
            y -= 16
            if period:
                c.drawString(40, y, f"Period: {period}")
                y -= 16

            if summary:
                c.setFont("Helvetica-Bold", 11)
                c.drawString(40, y, "Summary")
                y -= 16
                c.setFont("Helvetica", 10)
                for line in str(summary).splitlines():
                    if y < 60:
                        c.showPage()
                        y = height - 50
                        c.setFont("Helvetica", 10)
                    c.drawString(40, y, line[:120])
                    y -= 14

            y -= 6
            c.setFont("Helvetica-Bold", 11)
            c.drawString(40, y, "Data")
            y -= 16
            c.setFont("Helvetica", 9)
            for row in rows[:120]:
                if y < 60:
                    c.showPage()
                    y = height - 50
                    c.setFont("Helvetica", 9)
                line = json.dumps(row, default=str)[:140]
                c.drawString(40, y, line)
                y -= 12

            c.save()
            pdf_buffer.seek(0)
            filename = _normalize_filename(report_name, "pdf")
            return StreamingResponse(
                pdf_buffer,
                media_type="application/pdf",
                headers={"Content-Disposition": f'attachment; filename="{filename}"'}
            )

        raise HTTPException(status_code=400, detail="Unsupported export format. Use csv, xlsx, or pdf.")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Export report error: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to export report: {str(e)}"
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
                "objects": ["lead", "contact", "account", "opportunity", "task", "event"],
                "requires_preview": True,
                "risk_level": "high"
            },
            "create_list_view": {
                "enabled": True,
                "objects": ["lead", "contact", "account", "opportunity", "task"],
                "requires_preview": True,
                "filter_operators": ["equals", "not_equals", "contains", "starts_with", "greater_than", "less_than", "is_empty", "is_not_empty"]
            },
            "update_list_view": {
                "enabled": True,
                "requires_preview": True,
                "editable_fields": ["name", "filters", "columns", "sort_field", "sort_order", "visibility", "is_default"]
            },
            # Phase 2B
            "generate_report": {
                "enabled": True,
                "report_types": ["revenue", "pipeline", "leads", "opportunities", "activities", "conversion", "kpi", "sentiment"],
                "periods": ["day", "week", "month", "quarter", "year", "custom"],
                "risk_level": "low"
            },
            "compare_metrics": {
                "enabled": True,
                "metric_types": ["revenue", "pipeline_value", "lead_count", "opportunity_count", "account_count", "activity_count", "won_deals", "conversion_rate", "win_rate"],
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
                "metrics": ["revenue", "leads", "opportunities", "accounts", "pipeline_value", "activities", "won_deals", "conversion_rate", "win_rate"],
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
            },
            "bulk_update_records": {
                "enabled": True,
                "objects": ["lead", "contact", "account", "opportunity", "task", "event"],
                "requires_preview": True,
                "risk_level": "high"
            },
            "bulk_create_tasks": {
                "enabled": True,
                "target_objects": ["lead", "contact", "account", "opportunity"],
                "requires_preview": True,
                "risk_level": "high"
            },
            "bulk_create_records": {
                "enabled": True,
                "objects": ["lead", "contact", "account", "opportunity", "task", "event"],
                "requires_preview": True,
                "risk_level": "high"
            },
            "send_email": {
                "enabled": True,
                "requires_preview": True,
                "risk_level": "high"
            },
            "draft_email": {
                "enabled": True,
                "requires_preview": False,
                "risk_level": "low"
            }
        },
        "model": "gemini-2.5-flash",
        "preview_required": ["create_lead", "add_note", "create_task", "update_record", "create_list_view", "update_list_view", "create_dashboard", "fetch_url", "bulk_update_records", "bulk_create_tasks", "bulk_create_records", "send_email"],
        "undo_supported": ["create_lead", "add_note", "create_task", "update_record", "create_list_view", "update_list_view", "create_dashboard", "bulk_update_records", "bulk_create_tasks", "bulk_create_records", "draft_email"]
    }
