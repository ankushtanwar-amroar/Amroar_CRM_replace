"""
CLU-BOT Orchestrator Service
Main orchestrator that coordinates intent routing, execution, and responses.
Implements the deterministic execution flow.
"""
import logging
from typing import Dict, Any, Optional
from datetime import datetime
from motor.motor_asyncio import AsyncIOMotorDatabase

from ..models import (
    ActionType, RiskLevel, MessageRole, ActionPayload,
    ChatRequest, ChatResponse, ParsedIntent,
    SearchRecordsPayload, RecordSummaryPayload,
    CreateLeadPayload, AddNotePayload, CreateTaskPayload,
    UpdateRecordPayload, CreateListViewPayload,
    GenerateReportPayload, CompareMetricsPayload, FindInsightsPayload,
    CreateDashboardPayload, TrendAnalysisPayload, PipelineForecastPayload,
    ReadFilePayload, FetchUrlPayload, AnalyzeWithContextPayload
)
from .intent_router_service import get_intent_router_service
from .crm_core_mcp_service import get_crm_core_mcp_service
from .activity_mcp_service import get_activity_mcp_service
from .analytics_mcp_service import get_analytics_mcp_service
from .external_context_mcp_service import get_external_context_mcp_service
from .conversation_service import get_conversation_service

logger = logging.getLogger(__name__)


class CluBotOrchestrator:
    """
    Main orchestrator for CLU-BOT.
    Coordinates the flow: Intent → Validation → Permission → Preview → Execution → Response
    """
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.intent_router = get_intent_router_service()
        self.crm_core = get_crm_core_mcp_service(db)
        self.activity_mcp = get_activity_mcp_service(db)
        self.analytics_mcp = get_analytics_mcp_service(db)
        self.external_context = get_external_context_mcp_service(db)
        self.conversation_service = get_conversation_service(db)
        
        # Pending previews awaiting confirmation (keyed by action_id)
        self._pending_previews: Dict[str, Dict[str, Any]] = {}
    
    async def process_message(
        self,
        tenant_id: str,
        user_id: str,
        request: ChatRequest
    ) -> ChatResponse:
        """
        Process a user message and return a response.
        This is the main entry point for CLU-BOT interactions.
        
        Flow:
        1. Get/create conversation
        2. Parse intent using LLM
        3. Validate payload
        4. Check permissions
        5. Execute or preview
        6. Store messages
        7. Return response
        """
        # Step 1: Get or create conversation
        conversation = await self.conversation_service.get_or_create_conversation(
            conversation_id=request.conversation_id,
            tenant_id=tenant_id,
            user_id=user_id
        )
        
        # Update context if provided
        if request.context:
            await self.conversation_service.update_context(
                conversation.id,
                request.context
            )
            conversation.context = request.context
        
        # Get conversation history for LLM context
        history = await self.conversation_service.get_conversation_history(
            conversation.id,
            limit=10
        )
        
        # Step 2: Parse intent
        intent = await self.intent_router.parse_intent(
            user_message=request.message,
            conversation_history=history,
            context=conversation.context
        )
        
        # Store user message
        await self.conversation_service.add_message(
            conversation_id=conversation.id,
            role=MessageRole.USER,
            content=request.message
        )
        
        # Step 3 & 4: Validate payload and check permissions
        if intent.action_type not in [ActionType.NO_ACTION, ActionType.CLARIFICATION]:
            is_valid, error_msg = self.intent_router.validate_payload(
                intent.action_type,
                intent.payload or {}
            )
            
            if not is_valid:
                # Ask for clarification if payload is invalid - don't expose validation details
                clarification_msg = self._get_user_friendly_validation_message(intent.action_type, error_msg)
                response = ChatResponse(
                    conversation_id=conversation.id,
                    message=clarification_msg,
                    action_type=ActionType.CLARIFICATION,
                    requires_confirmation=False
                )
                await self._store_assistant_message(conversation.id, response)
                return response
        
        # Check permissions (simplified - can be expanded)
        permission_ok = await self._check_permissions(
            tenant_id, user_id, intent.action_type
        )
        
        if not permission_ok:
            response = ChatResponse(
                conversation_id=conversation.id,
                message="I'm sorry, but you don't have permission to perform this action.",
                action_type=intent.action_type,
                requires_confirmation=False
            )
            await self._store_assistant_message(conversation.id, response)
            return response
        
        # Step 5: Execute or preview
        if intent.requires_preview and intent.action_type != ActionType.NO_ACTION:
            # Generate preview
            response = await self._generate_preview(
                conversation_id=conversation.id,
                tenant_id=tenant_id,
                user_id=user_id,
                intent=intent
            )
        else:
            # Execute directly
            response = await self._execute_action(
                conversation_id=conversation.id,
                tenant_id=tenant_id,
                user_id=user_id,
                intent=intent
            )
        
        # Step 6: Store assistant message
        await self._store_assistant_message(conversation.id, response)
        
        return response
    
    async def confirm_preview(
        self,
        tenant_id: str,
        user_id: str,
        conversation_id: str,
        action_id: str,
        confirmed: bool
    ) -> ChatResponse:
        """
        Handle confirmation of a previewed action.
        """
        # Get pending preview from database
        pending = await self.db.clu_bot_pending_previews.find_one({
            "action_id": action_id,
            "conversation_id": conversation_id,
            "tenant_id": tenant_id,
            "user_id": user_id
        }, {"_id": 0})
        
        if not pending:
            return ChatResponse(
                conversation_id=conversation_id,
                message="This action preview has expired. Please try again.",
                requires_confirmation=False
            )
        
        # Remove from pending
        await self.db.clu_bot_pending_previews.delete_one({
            "action_id": action_id,
            "conversation_id": conversation_id
        })
        
        if not confirmed:
            response = ChatResponse(
                conversation_id=conversation_id,
                message="Got it, I've cancelled that action. Let me know if you need anything else.",
                requires_confirmation=False
            )
            await self._store_assistant_message(conversation_id, response)
            return response
        
        # Reconstruct the intent from stored data
        intent_data = pending.get("intent_data", {})
        intent = ParsedIntent(
            action_type=ActionType(intent_data.get("action_type", "no_action")),
            confidence=intent_data.get("confidence", 0.8),
            payload=intent_data.get("payload", {}),
            risk_level=RiskLevel(intent_data.get("risk_level", "low")),
            requires_preview=intent_data.get("requires_preview", False)
        )
        
        response = await self._execute_action(
            conversation_id=conversation_id,
            tenant_id=tenant_id,
            user_id=user_id,
            intent=intent
        )
        
        await self._store_assistant_message(conversation_id, response)
        return response
    
    async def undo_action(
        self,
        tenant_id: str,
        user_id: str,
        journal_entry_id: str
    ) -> Dict[str, Any]:
        """
        Undo a previously executed action.
        """
        return await self.activity_mcp.undo_action(
            tenant_id=tenant_id,
            user_id=user_id,
            journal_entry_id=journal_entry_id
        )
    
    async def _generate_preview(
        self,
        conversation_id: str,
        tenant_id: str,
        user_id: str,
        intent: ParsedIntent
    ) -> ChatResponse:
        """
        Generate a preview for a medium/high risk action.
        Store in database for persistence across hot-reloads.
        For update_record, resolves entity name to record ID first.
        """
        import uuid
        from datetime import timezone
        
        # For update_record, resolve the entity first
        resolved_payload = dict(intent.payload) if intent.payload else {}
        resolved_record_name = None
        
        if intent.action_type == ActionType.UPDATE_RECORD and resolved_payload.get("record_id"):
            # Try to resolve the record
            resolved_record = await self.activity_mcp._resolve_record(
                tenant_id=tenant_id,
                object_type=resolved_payload.get("object_type", ""),
                identifier=resolved_payload.get("record_id", "")
            )
            
            if resolved_record:
                # Update payload with actual record ID
                resolved_payload["record_id"] = resolved_record.get("id")
                resolved_payload["series_id"] = resolved_record.get("series_id")
                
                # Get display name for preview
                data = resolved_record.get("data", {})
                object_type = resolved_payload.get("object_type", "")
                if object_type in ["contact", "lead"]:
                    resolved_record_name = f"{data.get('first_name', '')} {data.get('last_name', '')}".strip()
                elif object_type == "account":
                    resolved_record_name = data.get("account_name") or data.get("name", "")
                elif object_type == "opportunity":
                    resolved_record_name = data.get("opportunity_name") or data.get("name", "")
                
                if not resolved_record_name:
                    resolved_record_name = data.get("name", resolved_record.get("series_id", "Unknown"))
            else:
                # Record not found - return error instead of preview
                return ChatResponse(
                    conversation_id=conversation_id,
                    message=f"I couldn't find a {resolved_payload.get('object_type', 'record')} named or with ID '{resolved_payload.get('record_id')}'. Please check the name or ID and try again.",
                    action_type=ActionType.CLARIFICATION,
                    requires_confirmation=False
                )
        
        action_id = str(uuid.uuid4())[:8]
        preview_data = {
            "action_id": action_id,
            "action_type": intent.action_type.value,
            "payload": resolved_payload,
            "resolved_record_name": resolved_record_name
        }
        
        # Store for confirmation in database (persistent) with resolved payload
        await self.db.clu_bot_pending_previews.insert_one({
            "action_id": action_id,
            "conversation_id": conversation_id,
            "tenant_id": tenant_id,
            "user_id": user_id,
            "intent_data": {
                "action_type": intent.action_type.value,
                "confidence": intent.confidence,
                "payload": resolved_payload,  # Use resolved payload with actual ID
                "risk_level": intent.risk_level.value,
                "requires_preview": intent.requires_preview
            },
            "created_at": datetime.now(timezone.utc).isoformat()
        })
        
        # Generate preview message with resolved name
        preview_message = self._format_preview_message(intent, resolved_record_name)
        
        return ChatResponse(
            conversation_id=conversation_id,
            message=preview_message,
            action_type=intent.action_type,
            requires_confirmation=True,
            preview_data=preview_data
        )
    
    async def _execute_action(
        self,
        conversation_id: str,
        tenant_id: str,
        user_id: str,
        intent: ParsedIntent
    ) -> ChatResponse:
        """
        Execute an action and return the response.
        """
        action_type = intent.action_type
        payload = intent.payload or {}
        user_id = str(user_id)  # Ensure string for DB queries
        
        result_data = None
        message = ""
        suggestions = None
        
        try:
            if action_type == ActionType.SEARCH_RECORDS:
                search_payload = SearchRecordsPayload(**payload)
                result = await self.crm_core.search_records(
                    tenant_id=tenant_id,
                    user_id=user_id,
                    payload=search_payload
                )
                result_data = result
                message = self._format_search_results(result)
                
            elif action_type == ActionType.RECORD_SUMMARY:
                summary_payload = RecordSummaryPayload(**payload)
                result = await self.crm_core.get_record_summary(
                    tenant_id=tenant_id,
                    user_id=user_id,
                    payload=summary_payload
                )
                result_data = result
                message = self._format_summary_result(result)
                
            elif action_type == ActionType.CREATE_LEAD:
                lead_payload = CreateLeadPayload(**payload)
                result = await self.activity_mcp.create_lead(
                    tenant_id=tenant_id,
                    user_id=user_id,
                    payload=lead_payload,
                    conversation_id=conversation_id
                )
                result_data = result
                message = result.get("message", "Lead created.")
                suggestions = ["View the lead", "Create another lead", "Add a note to this lead"]
                
            elif action_type == ActionType.ADD_NOTE:
                note_payload = AddNotePayload(**payload)
                result = await self.activity_mcp.add_note(
                    tenant_id=tenant_id,
                    user_id=user_id,
                    payload=note_payload,
                    conversation_id=conversation_id
                )
                result_data = result
                message = result.get("message", "Note added.")
                
            elif action_type == ActionType.CREATE_TASK:
                task_payload = CreateTaskPayload(**payload)
                result = await self.activity_mcp.create_task(
                    tenant_id=tenant_id,
                    user_id=user_id,
                    payload=task_payload,
                    conversation_id=conversation_id
                )
                result_data = result
                message = result.get("message", "Task created.")
                suggestions = ["View my tasks", "Create another task"]
            
            # Phase 2A Actions
            elif action_type == ActionType.UPDATE_RECORD:
                update_payload = UpdateRecordPayload(**payload)
                result = await self.activity_mcp.update_record(
                    tenant_id=tenant_id,
                    user_id=user_id,
                    payload=update_payload,
                    conversation_id=conversation_id
                )
                result_data = result
                message = result.get("message", "Record updated.")
                if result.get("success"):
                    suggestions = ["View the record", "Make another update", "Search for records"]
                
            elif action_type == ActionType.CREATE_LIST_VIEW:
                list_view_payload = CreateListViewPayload(**payload)
                result = await self.activity_mcp.create_list_view(
                    tenant_id=tenant_id,
                    user_id=user_id,
                    payload=list_view_payload,
                    conversation_id=conversation_id
                )
                result_data = result
                message = result.get("message", "List view created.")
                if result.get("success"):
                    suggestions = ["Create another list view", "Search for records"]
            
            # Phase 2B Analytics Actions
            elif action_type == ActionType.GENERATE_REPORT:
                report_payload = GenerateReportPayload(**payload)
                result = await self.analytics_mcp.generate_report(
                    tenant_id=tenant_id,
                    user_id=user_id,
                    payload=report_payload
                )
                result_data = result
                message = self._format_report_result(result)
                if result.get("success"):
                    suggestions = ["Generate another report", "Compare metrics", "Find insights"]
            
            elif action_type == ActionType.COMPARE_METRICS:
                compare_payload = CompareMetricsPayload(**payload)
                result = await self.analytics_mcp.compare_metrics(
                    tenant_id=tenant_id,
                    user_id=user_id,
                    payload=compare_payload
                )
                result_data = result
                message = self._format_comparison_result(result)
                if result.get("success"):
                    suggestions = ["Compare different metrics", "Generate a report", "Find insights"]
            
            elif action_type == ActionType.FIND_INSIGHTS:
                insights_payload = FindInsightsPayload(**payload)
                result = await self.analytics_mcp.find_insights(
                    tenant_id=tenant_id,
                    user_id=user_id,
                    payload=insights_payload
                )
                result_data = result
                message = self._format_insights_result(result)
                if result.get("success"):
                    suggestions = ["Find other insights", "Generate a report", "Search for records"]
            
            # Phase 3 Actions
            elif action_type == ActionType.CREATE_DASHBOARD:
                dashboard_payload = CreateDashboardPayload(**payload)
                result = await self.analytics_mcp.create_dashboard(
                    tenant_id=tenant_id,
                    user_id=user_id,
                    payload=dashboard_payload,
                    conversation_id=conversation_id
                )
                result_data = result
                message = self._format_dashboard_result(result)
                if result.get("success"):
                    suggestions = ["Create another dashboard", "Show revenue trend", "Forecast pipeline"]
            
            elif action_type == ActionType.TREND_ANALYSIS:
                trend_payload = TrendAnalysisPayload(**payload)
                result = await self.analytics_mcp.analyze_trend(
                    tenant_id=tenant_id,
                    user_id=user_id,
                    payload=trend_payload
                )
                result_data = result
                message = self._format_trend_result(result)
                if result.get("success"):
                    suggestions = ["Analyze a different trend", "Forecast pipeline", "Generate a report"]
            
            elif action_type == ActionType.PIPELINE_FORECAST:
                forecast_payload = PipelineForecastPayload(**payload)
                result = await self.analytics_mcp.forecast_pipeline(
                    tenant_id=tenant_id,
                    user_id=user_id,
                    payload=forecast_payload
                )
                result_data = result
                message = self._format_forecast_result(result)
                if result.get("success"):
                    suggestions = ["Show pipeline trend", "Find at-risk accounts", "Generate a report"]
            
            # Phase 4 External Context Actions
            elif action_type == ActionType.READ_FILE:
                # Always verify file_id exists, fallback to latest uploaded file
                provided_id = payload.get("file_id")
                resolved_file = None
                
                if provided_id:
                    resolved_file = await self.db.clu_bot_file_uploads.find_one(
                        {"id": provided_id, "tenant_id": tenant_id}, {"_id": 0}
                    )
                
                if not resolved_file:
                    resolved_file = await self.external_context.get_latest_file(tenant_id, user_id)
                
                if resolved_file:
                    payload["file_id"] = resolved_file["id"]
                else:
                        message = "No files have been uploaded yet. Please upload a file first using the attach button."
                        result_data = {"success": False}
                        suggestions = ["Upload a file"]
                        raise ValueError("skip_execution")
                
                read_payload = ReadFilePayload(**payload)
                result = await self.external_context.read_file(
                    tenant_id=tenant_id,
                    user_id=user_id,
                    payload=read_payload
                )
                result_data = result
                message = self._format_file_result(result)
                if result.get("success"):
                    suggestions = ["Ask a question about this file", "Analyze with CRM data", "Upload another file"]
            
            elif action_type == ActionType.FETCH_URL:
                fetch_payload = FetchUrlPayload(**payload)
                result = await self.external_context.fetch_url(
                    tenant_id=tenant_id,
                    user_id=user_id,
                    payload=fetch_payload
                )
                result_data = result
                message = self._format_url_result(result)
                if result.get("success"):
                    suggestions = ["Analyze another URL", "Combine with CRM data", "Generate a report"]
            
            elif action_type == ActionType.ANALYZE_WITH_CONTEXT:
                # Verify file_id if provided, fallback to latest
                if payload.get("file_id"):
                    exists = await self.db.clu_bot_file_uploads.find_one(
                        {"id": payload["file_id"], "tenant_id": tenant_id}, {"_id": 0}
                    )
                    if not exists:
                        latest_file = await self.external_context.get_latest_file(tenant_id, user_id)
                        if latest_file:
                            payload["file_id"] = latest_file["id"]
                        else:
                            payload.pop("file_id", None)
                elif not payload.get("url"):
                    latest_file = await self.external_context.get_latest_file(tenant_id, user_id)
                    if latest_file:
                        payload["file_id"] = latest_file["id"]
                
                context_payload = AnalyzeWithContextPayload(**payload)
                result = await self.external_context.analyze_with_context(
                    tenant_id=tenant_id,
                    user_id=user_id,
                    payload=context_payload
                )
                result_data = result
                message = self._format_context_analysis_result(result)
                if result.get("success"):
                    suggestions = ["Ask another question", "Generate a report", "Search for records"]
                
            elif action_type == ActionType.CLARIFICATION:
                message = payload.get("question", "Could you please provide more details?")
                
            elif action_type == ActionType.NO_ACTION:
                message = payload.get("response", "I'm here to help with your CRM tasks. What would you like to do?")
                
            else:
                message = "I'm not sure how to handle that request. Could you try rephrasing?"
                
        except ValueError as ve:
            if str(ve) == "skip_execution":
                pass  # message and result_data already set
            else:
                logger.error(f"Action validation error: {str(ve)}")
                message = f"I encountered a validation error: {str(ve)}. Please try again."
        except Exception as e:
            logger.error(f"Action execution error: {str(e)}")
            message = f"I encountered an error: {str(e)}. Please try again."
        
        return ChatResponse(
            conversation_id=conversation_id,
            message=message,
            action_type=action_type,
            requires_confirmation=False,
            result_data=result_data,
            suggestions=suggestions
        )
    
    def _format_preview_message(self, intent: ParsedIntent, resolved_record_name: str = None) -> str:
        """Format a preview message for the user"""
        action_type = intent.action_type
        payload = intent.payload or {}
        
        if action_type == ActionType.CREATE_LEAD:
            name = f"{payload.get('first_name', '')} {payload.get('last_name', '')}".strip()
            lines = [f"I'll create a new lead for **{name}**:"]
            if payload.get("email"):
                lines.append(f"- Email: {payload['email']}")
            if payload.get("company"):
                lines.append(f"- Company: {payload['company']}")
            if payload.get("phone"):
                lines.append(f"- Phone: {payload['phone']}")
            lines.append("\nDo you want me to proceed?")
            return "\n".join(lines)
        
        elif action_type == ActionType.ADD_NOTE:
            return f"I'll add a note titled **\"{payload.get('title', 'Note')}\"** to the {payload.get('linked_entity_type', 'record')}.\n\nDo you want me to proceed?"
        
        elif action_type == ActionType.CREATE_TASK:
            lines = [f"I'll create a task: **\"{payload.get('subject', 'Task')}\"**"]
            if payload.get("due_date"):
                lines.append(f"- Due: {payload['due_date']}")
            if payload.get("priority"):
                lines.append(f"- Priority: {payload['priority']}")
            lines.append("\nDo you want me to proceed?")
            return "\n".join(lines)
        
        # Phase 2A preview messages
        elif action_type == ActionType.UPDATE_RECORD:
            object_type = payload.get("object_type", "record")
            series_id = payload.get("series_id", payload.get("record_id", ""))
            updates = payload.get("updates", {})
            
            # Use resolved name if available
            display_name = resolved_record_name or series_id
            lines = [f"I'll update the **{object_type}** **{display_name}** ({series_id}):"]
            for field, value in updates.items():
                lines.append(f"- Set **{field}** to: {value}")
            lines.append("\n⚠️ This will modify the existing record. Do you want me to proceed?")
            return "\n".join(lines)
        
        elif action_type == ActionType.CREATE_LIST_VIEW:
            name = payload.get("name", "List View")
            object_type = payload.get("object_type", "records")
            filters = payload.get("filters", [])
            lines = [f"I'll create a list view called **\"{name}\"** for {object_type}s"]
            if filters:
                lines.append("With filters:")
                for f in filters[:3]:
                    lines.append(f"- {f.get('field', '?')} {f.get('operator', '?')} {f.get('value', '?')}")
                if len(filters) > 3:
                    lines.append(f"- ...and {len(filters) - 3} more filters")
            lines.append("\nDo you want me to proceed?")
            return "\n".join(lines)
        
        elif action_type == ActionType.CREATE_DASHBOARD:
            name = payload.get("name", "Dashboard")
            dashboard_type = payload.get("dashboard_type", "custom").replace("_", " ").title()
            period = payload.get("period", "month")
            lines = [f"I'll create a **{dashboard_type}** dashboard called **\"{name}\"**"]
            lines.append(f"- Default period: {period}")
            lines.append("\nThis will generate widgets with live CRM data. Do you want me to proceed?")
            return "\n".join(lines)
        
        elif action_type == ActionType.FETCH_URL:
            url = payload.get("url", "")
            query = payload.get("query", "")
            lines = [f"I'll fetch and analyze content from **{url}**"]
            if query:
                lines.append(f"Question: {query}")
            lines.append("\nThis will make a network request to the URL. Do you want me to proceed?")
            return "\n".join(lines)
        
        return "Do you want me to proceed with this action?"
    
    def _format_search_results(self, result: Dict[str, Any]) -> str:
        """Format search results for display"""
        if result.get("error"):
            return f"Search failed: {result['error']}"
        
        records = result.get("records", [])
        total = result.get("total", 0)
        object_type = result.get("object_type", "records")
        query = result.get("query", "")
        
        if not records:
            return f"I couldn't find any {object_type}s matching '{query}'."
        
        lines = [f"Found **{total}** {object_type}(s) matching '{query}':"]
        
        for i, record in enumerate(records[:5], 1):
            name = record.get("name", "Unknown")
            series_id = record.get("series_id", "")
            lines.append(f"{i}. **{name}** ({series_id})")
        
        if total > 5:
            lines.append(f"\n...and {total - 5} more.")
        
        return "\n".join(lines)
    
    def _format_summary_result(self, result: Dict[str, Any]) -> str:
        """Format record summary for display"""
        if result.get("error"):
            return f"Couldn't get summary: {result['error']}"
        
        if not result.get("success"):
            return "I couldn't find that record."
        
        summary = result.get("summary", "")
        related = result.get("related", {})
        
        lines = [summary]
        
        # Add related info
        if related.get("tasks"):
            lines.append(f"\n**Related Tasks**: {len(related['tasks'])}")
        if related.get("notes"):
            lines.append(f"**Notes**: {len(related['notes'])}")
        
        return "\n".join(lines)
    
    async def _check_permissions(
        self,
        tenant_id: str,
        user_id: str,
        action_type: ActionType
    ) -> bool:
        """
        Check if user has permission for the action.
        Simplified for Phase 1 - can be expanded to use full permission system.
        """
        # Phase 1: Allow all read operations
        if action_type in [ActionType.SEARCH_RECORDS, ActionType.RECORD_SUMMARY, 
                          ActionType.CLARIFICATION, ActionType.NO_ACTION,
                          ActionType.GENERATE_REPORT, ActionType.COMPARE_METRICS,
                          ActionType.FIND_INSIGHTS, ActionType.TREND_ANALYSIS,
                          ActionType.PIPELINE_FORECAST,
                          ActionType.READ_FILE, ActionType.FETCH_URL,
                          ActionType.ANALYZE_WITH_CONTEXT]:
            return True
        
        # For write operations, check if user exists and is active
        user = await self.db.users.find_one({
            "id": user_id,
            "tenant_id": tenant_id,
            "is_active": True
        }, {"_id": 0})
        
        return user is not None
    
    def _get_user_friendly_validation_message(self, action_type: ActionType, error_msg: str) -> str:
        """Convert validation errors to user-friendly messages"""
        if action_type == ActionType.SEARCH_RECORDS:
            if "object_type" in error_msg.lower():
                return "What type of records would you like to search? For example: leads, contacts, accounts, or tasks."
            if "query" in error_msg.lower():
                return "What would you like to search for?"
        
        if action_type == ActionType.RECORD_SUMMARY:
            if "object_type" in error_msg.lower():
                return "Which type of record do you want a summary of?"
            if "record_id" in error_msg.lower():
                return "Which specific record would you like me to summarize? Please provide the name or ID."
        
        if action_type == ActionType.CREATE_LEAD:
            if "first_name" in error_msg.lower() or "last_name" in error_msg.lower():
                return "To create a lead, I need at least a name. What's the person's name?"
        
        if action_type == ActionType.ADD_NOTE:
            if "title" in error_msg.lower():
                return "What should the note title be?"
            if "linked_entity" in error_msg.lower():
                return "Which record should I add this note to?"
        
        if action_type == ActionType.CREATE_TASK:
            if "subject" in error_msg.lower():
                return "What should the task be about?"
        
        # Phase 2A validation messages
        if action_type == ActionType.UPDATE_RECORD:
            if "object_type" in error_msg.lower():
                return "Which type of record do you want to update? I can update contacts, accounts, or opportunities."
            if "record_id" in error_msg.lower():
                return "Which record should I update? Please provide the record ID or name."
            if "updates" in error_msg.lower():
                return "What fields would you like to update and to what values?"
        
        if action_type == ActionType.CREATE_LIST_VIEW:
            if "object_type" in error_msg.lower():
                return "Which type of records should this list view show? For example: leads, contacts, accounts."
            if "name" in error_msg.lower():
                return "What would you like to name this list view?"
        
        # Phase 2B validation messages
        if action_type == ActionType.GENERATE_REPORT:
            if "report_type" in error_msg.lower():
                return "What type of report would you like? Options: revenue, pipeline, leads, opportunities, activities, or conversion."
        
        if action_type == ActionType.COMPARE_METRICS:
            if "metric_type" in error_msg.lower():
                return "Which metric would you like to compare? Options: revenue, pipeline value, lead count, opportunity count, conversion rate, or win rate."
            if "period" in error_msg.lower():
                return "Which two periods would you like to compare? For example: this month vs last month."
        
        if action_type == ActionType.FIND_INSIGHTS:
            if "insight_type" in error_msg.lower():
                return "What kind of insights are you looking for? Options: inactive leads, stale opportunities, slipping deals, overdue tasks, or high-value leads."
        
        # Phase 3 validation messages
        if action_type == ActionType.CREATE_DASHBOARD:
            if "name" in error_msg.lower():
                return "What would you like to name this dashboard?"
            if "dashboard_type" in error_msg.lower():
                return "What type of dashboard would you like? Options: sales performance, pipeline overview, lead management, or activity tracker."
        
        if action_type == ActionType.TREND_ANALYSIS:
            if "metric" in error_msg.lower():
                return "Which metric would you like to see the trend for? Options: revenue, leads, opportunities, pipeline value, activities, conversion rate, or win rate."
        
        if action_type == ActionType.PIPELINE_FORECAST:
            if "forecast_period" in error_msg.lower():
                return "What period would you like to forecast? Options: next month, next quarter, or next year."
        
        # Phase 4 validation messages
        if action_type == ActionType.READ_FILE:
            if "file_id" in error_msg.lower():
                return "Which file would you like me to read? Please upload a file first using the attach button."
        
        if action_type == ActionType.FETCH_URL:
            if "url" in error_msg.lower():
                return "Please provide the full URL you'd like me to fetch (e.g., https://example.com)."
        
        if action_type == ActionType.ANALYZE_WITH_CONTEXT:
            if "query" in error_msg.lower():
                return "What would you like me to analyze? Please describe your question."
        
        # Generic fallback
        return "Could you provide more details for me to complete this action?"
    
    def _format_report_result(self, result: Dict[str, Any]) -> str:
        """Format analytics report result for display"""
        if not result.get("success"):
            return result.get("message", "Failed to generate report.")
        
        lines = [f"**{result.get('report_type', 'Report').title()} Report**"]
        if result.get("period"):
            lines.append(f"Period: {result['period']}")
        lines.append("")
        lines.append(result.get("summary", ""))
        
        # Add data details based on report type
        data = result.get("data", {})
        if isinstance(data, list):
            for item in data[:5]:
                stage = item.get("stage") or item.get("_id", "Unknown")
                value = item.get("total_value") or item.get("total_revenue", 0)
                count = item.get("count") or item.get("deal_count", 0)
                lines.append(f"- **{stage}**: ${value:,.2f} ({count} records)")
        elif isinstance(data, dict):
            if "by_status" in data:
                lines.append("\n**By Status:**")
                for item in data["by_status"][:5]:
                    lines.append(f"- {item.get('_id', 'Unknown')}: {item.get('count', 0)}")
            if "tasks" in data:
                lines.append(f"\n- Tasks: {data['tasks']}")
                lines.append(f"- Events: {data.get('events', 0)}")
                lines.append(f"- Notes: {data.get('notes', 0)}")
        
        return "\n".join(lines)
    
    def _format_comparison_result(self, result: Dict[str, Any]) -> str:
        """Format metrics comparison result for display"""
        if not result.get("success"):
            return result.get("message", "Failed to compare metrics.")
        
        return result.get("summary", "Comparison complete.")
    
    def _format_insights_result(self, result: Dict[str, Any]) -> str:
        """Format CRM insights result for display"""
        if not result.get("success"):
            return result.get("message", "Failed to find insights.")
        
        lines = [result.get("summary", "")]
        
        records = result.get("records", [])
        if records:
            lines.append("")
            for i, r in enumerate(records[:5], 1):
                name = r.get("name") or r.get("subject", "Unknown")
                detail_parts = []
                if r.get("days_inactive"):
                    detail_parts.append(f"{r['days_inactive']}d inactive")
                if r.get("days_stale"):
                    detail_parts.append(f"{r['days_stale']}d stale")
                if r.get("days_overdue"):
                    detail_parts.append(f"{r['days_overdue']}d overdue")
                if r.get("amount"):
                    detail_parts.append(f"${r['amount']:,.2f}")
                if r.get("total_revenue"):
                    detail_parts.append(f"${r['total_revenue']:,.2f}")
                if r.get("stage"):
                    detail_parts.append(r["stage"])
                if r.get("status"):
                    detail_parts.append(r["status"])
                detail = " | ".join(detail_parts) if detail_parts else ""
                lines.append(f"{i}. **{name}**{' - ' + detail if detail else ''}")
            
            if len(records) > 5:
                lines.append(f"\n...and {len(records) - 5} more.")
        
        return "\n".join(lines)
    
    def _format_dashboard_result(self, result: Dict[str, Any]) -> str:
        """Format dashboard creation result for display"""
        if not result.get("success"):
            return result.get("message", "Failed to create dashboard.")
        
        lines = [f"**Dashboard Created: {result.get('name', 'Dashboard')}**"]
        lines.append(f"Type: {result.get('dashboard_type', '').replace('_', ' ').title()}")
        lines.append(f"Widgets: {result.get('widget_count', 0)}")
        lines.append("")
        
        widgets = result.get("widgets", [])
        for w in widgets:
            data = w.get("data", {})
            title = w.get("title", "")
            wtype = w.get("widget_type", "")
            
            if wtype == "metric_card":
                value = data.get("value", 0)
                fmt = data.get("format", "number")
                if fmt == "currency":
                    lines.append(f"- **{title}**: ${value:,.2f}")
                elif fmt == "percentage":
                    lines.append(f"- **{title}**: {value:.1f}%")
                else:
                    lines.append(f"- **{title}**: {int(value):,}")
            elif wtype in ["bar_chart", "pie_chart"]:
                items = data.get("items", [])
                lines.append(f"- **{title}**: {len(items)} categories")
            elif wtype in ["table", "list"]:
                items = data.get("items", [])
                lines.append(f"- **{title}**: {len(items)} items")
        
        return "\n".join(lines)
    
    def _format_trend_result(self, result: Dict[str, Any]) -> str:
        """Format trend analysis result for display"""
        if not result.get("success"):
            return result.get("message", "Failed to analyze trend.")
        
        lines = [result.get("summary", "")]
        lines.append("")
        
        data_points = result.get("data_points", [])
        metric = result.get("metric", "")
        
        for dp in data_points:
            value = dp.get("value", 0)
            label = dp.get("label", "")
            if metric in ["revenue", "pipeline_value"]:
                lines.append(f"- {label}: ${value:,.2f}")
            elif metric in ["conversion_rate", "win_rate"]:
                lines.append(f"- {label}: {value:.1f}%")
            else:
                lines.append(f"- {label}: {int(value):,}")
        
        peak = result.get("peak")
        low = result.get("low")
        if peak and low:
            lines.append("")
            if metric in ["revenue", "pipeline_value"]:
                lines.append(f"Peak: {peak['label']} (${peak['value']:,.2f}) | Low: {low['label']} (${low['value']:,.2f})")
            else:
                lines.append(f"Peak: {peak['label']} ({peak['value']}) | Low: {low['label']} ({low['value']})")
        
        return "\n".join(lines)
    
    def _format_forecast_result(self, result: Dict[str, Any]) -> str:
        """Format pipeline forecast result for display"""
        if not result.get("success"):
            return result.get("message", "Failed to forecast pipeline.")
        
        lines = [f"**Pipeline Forecast ({result.get('forecast_period', 'period')})**"]
        lines.append("")
        lines.append(f"- Total Pipeline: ${result.get('total_pipeline', 0):,.2f}")
        lines.append(f"- Weighted Pipeline: ${result.get('weighted_pipeline', 0):,.2f}")
        lines.append(f"- Open Opportunities: {result.get('open_opportunities', 0)}")
        lines.append(f"- Historical Win Rate: {result.get('historical_win_rate', 0):.1f}%")
        
        # Stage breakdown
        stages = result.get("stages", [])
        if stages:
            lines.append("\n**By Stage:**")
            for s in stages[:6]:
                lines.append(f"- {s['stage']}: ${s['value']:,.2f} ({s['count']} deals, {s['probability']}% probability)")
        
        # Likely to close
        likely = result.get("likely_to_close", [])
        if likely:
            total_likely = sum(d["amount"] for d in likely)
            lines.append(f"\n**Likely to Close ({len(likely)} deals, ${total_likely:,.2f}):**")
            for d in likely[:5]:
                lines.append(f"- {d['name']}: ${d['amount']:,.2f} ({d['stage']}, {d['probability']}%)")
        
        # At risk deals
        at_risk = result.get("at_risk_deals", [])
        if at_risk:
            total_risk = sum(d["amount"] for d in at_risk)
            lines.append(f"\n**At Risk ({len(at_risk)} deals, ${total_risk:,.2f}):**")
            for d in at_risk[:5]:
                risks = ", ".join(d.get("risk_factors", []))
                lines.append(f"- {d['name']}: ${d['amount']:,.2f} ({risks})")
        
        return "\n".join(lines)
    
    def _format_file_result(self, result: Dict[str, Any]) -> str:
        """Format file read result for display"""
        if not result.get("success"):
            return result.get("message", "Failed to read file.")
        
        lines = [f"**File: {result.get('file_name', 'document')}** ({result.get('file_type', '').upper()})"]
        if result.get("truncated"):
            lines.append("_(Content was truncated due to length)_")
        lines.append("")
        lines.append(result.get("summary", result.get("answer", "No content extracted.")))
        return "\n".join(lines)
    
    def _format_url_result(self, result: Dict[str, Any]) -> str:
        """Format URL fetch result for display"""
        if not result.get("success"):
            return result.get("message", "Failed to fetch URL.")
        
        lines = [f"**Content from:** {result.get('url', 'URL')}"]
        if result.get("truncated"):
            lines.append("_(Content was truncated due to length)_")
        lines.append("")
        lines.append(result.get("summary", result.get("answer", "No content extracted.")))
        return "\n".join(lines)
    
    def _format_context_analysis_result(self, result: Dict[str, Any]) -> str:
        """Format context analysis result for display"""
        if not result.get("success"):
            return result.get("message", "Failed to analyze with context.")
        
        sources = result.get("sources", [])
        lines = ["**Analysis Results**"]
        if sources:
            lines.append(f"Sources: {', '.join(sources)}")
        lines.append("")
        lines.append(result.get("analysis", result.get("summary", "Analysis complete.")))
        return "\n".join(lines)
    
    async def _store_assistant_message(
        self,
        conversation_id: str,
        response: ChatResponse
    ):
        """Store the assistant's response in conversation history"""
        await self.conversation_service.add_message(
            conversation_id=conversation_id,
            role=MessageRole.ASSISTANT,
            content=response.message,
            action_payload=ActionPayload(
                action_type=response.action_type or ActionType.NO_ACTION,
                payload=response.result_data or {},
                risk_level=RiskLevel.LOW,
                requires_preview=response.requires_confirmation
            ) if response.action_type else None,
            execution_result=response.result_data
        )


# Factory function
def get_clu_bot_orchestrator(db: AsyncIOMotorDatabase) -> CluBotOrchestrator:
    """Get CluBotOrchestrator instance"""
    return CluBotOrchestrator(db)
