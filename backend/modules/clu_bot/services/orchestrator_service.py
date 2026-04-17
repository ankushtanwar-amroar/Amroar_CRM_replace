"""
CLU-BOT Orchestrator Service
Main orchestrator that coordinates intent routing, execution, and responses.
Implements the deterministic execution flow.
"""
import logging
import re
import asyncio
from typing import Dict, Any, Optional, Union, List, Callable, Awaitable
from datetime import datetime
from motor.motor_asyncio import AsyncIOMotorDatabase

from fastapi import HTTPException

from modules.records.api.records_routes import check_permission, normalize_object_name
from shared.models import User

from ..models import (
    ActionType, RiskLevel, MessageRole, ActionPayload, Conversation,
    ChatRequest, ChatResponse, ParsedIntent,
    SearchRecordsPayload, RecordSummaryPayload,
    CreateLeadPayload, AddNotePayload, CreateTaskPayload,
    UpdateRecordPayload, CreateListViewPayload,
    UpdateListViewPayload,
    BulkUpdateRecordsPayload, BulkCreateTasksPayload, BulkCreateRecordsPayload,
    SendEmailPayload, DraftEmailPayload,
    GenerateReportPayload, CompareMetricsPayload, FindInsightsPayload,
    CreateDashboardPayload, TrendAnalysisPayload, PipelineForecastPayload,
    ReadFilePayload, FetchUrlPayload, AnalyzeWithContextPayload,
    CreateRecordPayload
)
from .intent_router_service import get_intent_router_service
from .crm_core_mcp_service import get_crm_core_mcp_service
from .activity_mcp_service import get_activity_mcp_service
from .analytics_mcp_service import get_analytics_mcp_service
from .external_context_mcp_service import get_external_context_mcp_service
from .conversation_service import get_conversation_service
from .create_record_metadata import load_enriched_object_for_create, analyze_create_gaps
from .entity_lookup_normalize import account_lookup_variants

logger = logging.getLogger(__name__)

# Fallback when object metadata cannot be loaded (should be rare)
REQUIRED_FIELDS_FALLBACK = {
    "contact": ["first_name", "last_name"],
    "account": ["account_name"],
    "opportunity": ["opportunity_name", "stage"],
    "task": ["subject"],
    "lead": ["first_name", "last_name"],
    "event": ["subject", "start_date"],
}

_AMBIGUOUS_RECORD_TOKENS = frozenset(
    {"this", "current", "here", "it", "that", "the", "record", ""}
)


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

    def _record_display_name(self, object_type: str, data: Dict[str, Any], fallback: str) -> str:
        ot = (object_type or "").lower()
        if ot in ("contact", "lead"):
            name = f"{data.get('first_name', '')} {data.get('last_name', '')}".strip()
        elif ot == "account":
            name = data.get("account_name") or data.get("name") or ""
        elif ot == "opportunity":
            name = data.get("opportunity_name") or data.get("name") or ""
        elif ot in ("task", "event"):
            name = data.get("subject") or data.get("name") or ""
        else:
            name = data.get("name") or ""
        return name or fallback

    async def _emit_text_stream(
        self,
        text: str,
        stream_callback: Optional[Callable[[str], Awaitable[None]]]
    ) -> None:
        if not stream_callback or not text:
            return
        chunk_size = 10
        for i in range(0, len(text), chunk_size):
            await stream_callback(text[i:i + chunk_size])
            await asyncio.sleep(0)

    def _apply_conversation_context_to_update(
        self, conversation: Conversation, intent: ParsedIntent
    ) -> None:
        """Fill record target from UI context when user says 'this' / omits id."""
        pl = intent.payload or {}
        ctx = conversation.context or {}
        cr = ctx.get("current_record") or {}
        if not cr.get("id"):
            return

        rid_raw = str(pl.get("record_id") or "").strip()
        rid_low = rid_raw.lower()
        ambiguous = (
            not rid_raw
            or rid_low in _AMBIGUOUS_RECORD_TOKENS
            or "this " in rid_low
            or rid_low.endswith(" this record")
        )
        ctx_ot = (cr.get("object_type") or "").lower().strip()
        pay_ot = (pl.get("object_type") or "").lower().strip()

        if ambiguous:
            pl["record_id"] = cr.get("id") or cr.get("series_id")
        if not pay_ot and ctx_ot:
            pl["object_type"] = cr["object_type"]
        elif pay_ot and ctx_ot and pay_ot != ctx_ot and ambiguous:
            # Likely wrong object typed against the open page — prefer the open record
            pl["object_type"] = cr["object_type"]

        intent.payload = pl

    def _sanitize_update_record_payload(self, payload: Dict[str, Any]) -> None:
        """
        Strip mistaken object prefix from series_id (e.g. lead-led-xxx → led-xxx).
        Normalize plural object_type (leads → lead).
        """
        ot = (payload.get("object_type") or "").strip()
        if not ot:
            return
        ot_low = ot.lower()
        if len(ot_low) > 1 and ot_low.endswith("s"):
            sing = ot_low[:-1]
            if sing in (
                "lead",
                "contact",
                "account",
                "opportunity",
                "task",
                "event",
            ):
                payload["object_type"] = sing
                ot_low = sing
        rid = payload.get("record_id")
        if not isinstance(rid, str):
            return
        r = rid.strip()
        if r.lower().startswith(f"{ot_low}-"):
            payload["record_id"] = r[len(ot_low) + 1 :].lstrip()

    def _apply_conversation_context_to_email(
        self, conversation: Conversation, intent: ParsedIntent
    ) -> None:
        pl = intent.payload or {}
        ctx = conversation.context or {}
        cr = ctx.get("current_record") or {}
        if not cr.get("id"):
            return
        rid_raw = str(pl.get("related_record_id") or "").strip().lower()
        if rid_raw in ("this", "current", "this record", "current record"):
            pl["related_record_id"] = cr.get("id") or cr.get("series_id")
        if not (pl.get("related_record_type") or "").strip() and cr.get("object_type"):
            pl["related_record_type"] = str(cr.get("object_type")).lower()
        intent.payload = pl

    def _apply_conversation_context_to_list_view_update(
        self, conversation: Conversation, intent: ParsedIntent
    ) -> None:
        pl = intent.payload or {}
        ctx = conversation.context or {}
        lv = ctx.get("current_list_view") or {}
        if not lv:
            return
        cur = str(pl.get("current_name") or "").strip().lower()
        if cur in ("this", "this list view", "current", "current list view", "this list liew"):
            if lv.get("name"):
                pl["current_name"] = lv.get("name")
            elif lv.get("id"):
                pl["list_view_id"] = lv.get("id")
        if not pl.get("object_type") and lv.get("object_type"):
            pl["object_type"] = lv.get("object_type")
        intent.payload = pl

    @staticmethod
    def _has_context_reference(text: str) -> bool:
        msg_l = (text or "").lower()
        return any(
            k in msg_l
            for k in (
                " this ",
                "this ",
                " current ",
                "current ",
                " that ",
                "that ",
                "this record",
                "current record",
                "this task",
                "this list view",
                "this list liew",
            )
        )

    def _context_clarification_if_needed(
        self,
        conversation: Conversation,
        intent: ParsedIntent,
        user_message: str,
    ) -> Optional[ParsedIntent]:
        """
        For context-dependent intents, ask clarification if user references
        "this/current/that" but conversation context is missing.
        """
        if not self._has_context_reference(user_message):
            return None

        payload = intent.payload or {}
        ctx = conversation.context or {}
        current_record = ctx.get("current_record") or {}
        current_list_view = ctx.get("current_list_view") or {}
        has_record_ctx = bool(current_record.get("id") or current_record.get("series_id"))
        has_list_view_ctx = bool(current_list_view.get("id") or current_list_view.get("name"))

        action = intent.action_type
        if action in (ActionType.UPDATE_RECORD, ActionType.RECORD_SUMMARY, ActionType.ADD_NOTE):
            rid = str(payload.get("record_id") or payload.get("linked_entity_id") or "").strip().lower()
            if rid in ("", "this", "current", "this record", "current record", "that", "that record") and not has_record_ctx:
                return self.intent_router._build_intent(
                    ActionType.CLARIFICATION,
                    {
                        "question": "Which record are you referring to? Open it and say 'this record', or share the object type + name/ID.",
                        "options": ["Use current opened record", "I will share object + name", "Search first"],
                    },
                    confidence=0.92,
                )

        if action == ActionType.CREATE_TASK:
            rel_to = str(payload.get("related_to") or "").strip().lower()
            if rel_to in ("this", "current", "this record", "current record", "that", "that record") and not has_record_ctx:
                return self.intent_router._build_intent(
                    ActionType.CLARIFICATION,
                    {
                        "question": "Which record should this task be linked to?",
                        "options": ["Use current opened record", "Provide related record name", "Create task without linking"],
                    },
                    confidence=0.9,
                )

        if action in (ActionType.SEND_EMAIL, ActionType.DRAFT_EMAIL):
            rel_to = str(payload.get("related_record_id") or "").strip().lower()
            if rel_to in ("this", "current", "this record", "current record", "that", "that record") and not has_record_ctx:
                return self.intent_router._build_intent(
                    ActionType.CLARIFICATION,
                    {
                        "question": "Which record should this email be linked to?",
                        "options": ["Use current opened record", "Share record name/ID", "Send without linking"],
                    },
                    confidence=0.9,
                )

        if action == ActionType.UPDATE_LIST_VIEW:
            cur_name = str(payload.get("current_name") or "").strip().lower()
            if cur_name in ("", "this", "this list view", "this list liew", "current list view", "current", "that list view") and not has_list_view_ctx:
                return self.intent_router._build_intent(
                    ActionType.CLARIFICATION,
                    {
                        "question": "Which list view do you want to update? Share its current name or ID.",
                        "options": ["Use currently selected list view", "Share list view name", "Share list view ID"],
                    },
                    confidence=0.92,
                )

        return None

    async def _persist_post_action_context(
        self,
        conversation_id: str,
        tenant_id: str,
        user_id: str,
        action_type: ActionType,
        payload: Dict[str, Any],
        result_data: Optional[Dict[str, Any]],
    ) -> None:
        """Persist current record/list-view context after successful actions."""
        if not isinstance(result_data, dict) or not result_data.get("success"):
            return
        conversation = await self.conversation_service.get_conversation(
            conversation_id=conversation_id,
            tenant_id=tenant_id,
            user_id=user_id,
        )
        if not conversation:
            return
        ctx = dict(conversation.context or {})
        changed = False

        rec = result_data.get("record")
        if isinstance(rec, dict) and action_type in (
            ActionType.CREATE_LEAD,
            ActionType.CREATE_TASK,
            ActionType.CREATE_RECORD,
            ActionType.UPDATE_RECORD,
        ):
            ot = (rec.get("object_name") or payload.get("object_type") or "").lower()
            if action_type == ActionType.CREATE_LEAD and not ot:
                ot = "lead"
            rid = rec.get("id")
            if rid:
                rec_name = self._display_name_from_record(
                    ot or "record",
                    rec.get("data") or {},
                    rec.get("series_id") or str(rid),
                )
                ctx["current_record"] = {
                    "id": rid,
                    "series_id": rec.get("series_id"),
                    "object_type": ot or "record",
                    "name": rec_name,
                }
                changed = True

        # Also persist context from search/list when there is exactly one result.
        # This helps follow-ups like "update this lead" after "list Monkey D.Luffy lead".
        if action_type == ActionType.SEARCH_RECORDS and not changed:
            records = result_data.get("records") or []
            if isinstance(records, list) and len(records) == 1 and isinstance(records[0], dict):
                only = records[0]
                ot = (result_data.get("object_type") or payload.get("object_type") or only.get("object_name") or "").lower()
                rid = only.get("id")
                if rid:
                    rec_name = self._display_name_from_record(
                        ot or "record",
                        only.get("data") or {},
                        only.get("series_id") or str(rid),
                    )
                    ctx["current_record"] = {
                        "id": rid,
                        "series_id": only.get("series_id"),
                        "object_type": ot or "record",
                        "name": rec_name,
                    }
                    changed = True

        # Persist summary target as current context when available.
        if action_type == ActionType.RECORD_SUMMARY and not changed:
            summary_record = result_data.get("record")
            if isinstance(summary_record, dict):
                ot = (summary_record.get("object_type") or payload.get("object_type") or "").lower()
                rid = summary_record.get("id")
                if rid:
                    rec_name = summary_record.get("name") or self._display_name_from_record(
                        ot or "record",
                        summary_record.get("data") or {},
                        summary_record.get("series_id") or str(rid),
                    )
                    ctx["current_record"] = {
                        "id": rid,
                        "series_id": summary_record.get("series_id"),
                        "object_type": ot or "record",
                        "name": rec_name,
                    }
                    changed = True

        lv = result_data.get("list_view")
        if isinstance(lv, dict) and action_type in (
            ActionType.CREATE_LIST_VIEW,
            ActionType.UPDATE_LIST_VIEW,
        ):
            lvid = lv.get("id")
            if lvid:
                ctx["current_list_view"] = {
                    "id": lvid,
                    "name": lv.get("name"),
                    "object_type": lv.get("object_name") or payload.get("object_type"),
                }
                changed = True

        if changed:
            await self.conversation_service.update_context(conversation_id, ctx)

    @staticmethod
    def _standard_crm_object_names() -> tuple:
        return ("lead", "contact", "account", "opportunity", "task", "event")

    def _merge_update_record_from_history(
        self,
        history: List[Dict[str, Any]],
        current_message: str,
        payload: Dict[str, Any],
    ) -> None:
        """
        Restore object_type / record_id when the model drops them on short follow-ups
        (e.g. after user says only a name).
        """
        if not payload:
            return
        objs = self._standard_crm_object_names()
        blob = " ".join(
            (m.get("content") or "")
            for m in (history or [])
            if m.get("role") == "user"
        )
        blob = f"{blob} {current_message or ''}".lower()

        ot = (payload.get("object_type") or "").strip()
        if not ot:
            pat = r"(?:" + "|".join([
                r"(?:i\s+)?want\s+to\s+update\s+(?:a\s+)?(" + "|".join(objs) + r")\b",
                r"update\s+(?:a\s+)?(" + "|".join(objs) + r")\b",
                r"change\s+(?:a\s+)?(" + "|".join(objs) + r")\b",
            ]) + r")"
            m = re.search(pat, blob)
            if m:
                payload["object_type"] = m.group(1)

        cm = (current_message or "").strip()
        cm_l = cm.lower()
        if not (payload.get("object_type") or "").strip() and cm_l in objs:
            payload["object_type"] = cm_l

        rid = (payload.get("record_id") or "").strip()
        if not rid or rid.lower() in _AMBIGUOUS_RECORD_TOKENS:
            m = re.match(
                r"(?i)^(?:name\s+is|it'?s|it\s+is|called)\s+(.+)$",
                cm,
            )
            if m:
                payload["record_id"] = m.group(1).strip().rstrip(".")

        if not (payload.get("record_id") or "").strip():
            skip_verbs = ("update", "change", "set ", "move ", "edit ", "with ")
            if (payload.get("object_type") or "").strip() and not any(
                cm_l.startswith(v.strip()) or v in cm_l for v in skip_verbs
            ):
                if len(cm.split()) >= 2 and cm_l not in objs:
                    payload["record_id"] = cm.strip().rstrip(".")

    @staticmethod
    def _update_payload_has_identified_record(payload: Dict[str, Any]) -> bool:
        return bool(
            (payload.get("object_type") or "").strip()
            and (payload.get("record_id") or "").strip()
        )

    @staticmethod
    def _update_payload_has_meaningful_changes(payload: Dict[str, Any]) -> bool:
        has_updates = any(
            v not in (None, "", "required")
            for v in (payload.get("updates") or {}).values()
        )
        has_owner = bool(
            (payload.get("owner_id") or "").strip()
            or (payload.get("owner_name") or "").strip()
        )
        return has_updates or has_owner

    def _update_followup_hints(self, object_type: str, updates: Dict[str, Any]) -> list:
        """Short optional prompts after a field update (preview only)."""
        ot = (object_type or "").lower()
        hints: list = []
        if ot == "opportunity" and updates.get("stage"):
            hints.append(
                "Do you also want me to set or refresh **close date** or **next step**? "
                "(Say the values in your next message.)"
            )
        if ot == "opportunity" and updates.get("amount") and not updates.get("stage"):
            hints.append(
                "**Amount** changed — confirm **stage** and **close date** still look right."
            )
        if ot == "account" and any(
            k.startswith("billing_") for k in (updates or {}).keys()
        ):
            hints.append(
                "If **shipping** should mirror billing, say so and I can update that too."
            )
        return hints

    async def _format_update_preview(
        self,
        resolved_payload: Dict[str, Any],
        resolved_record: Optional[Dict[str, Any]],
        resolved_record_name: Optional[str],
        tenant_id: str,
    ) -> str:
        object_type = resolved_payload.get("object_type", "record")
        updates = resolved_payload.get("updates") or {}
        series_id = resolved_payload.get("series_id") or resolved_payload.get("record_id", "")
        display = resolved_record_name or series_id

        lines = [
            f"I'll update **{object_type}** **{display}** (`{series_id}`):",
        ]

        data = (resolved_record or {}).get("data") or {}
        ow_id = (resolved_payload.get("owner_id") or "").strip()
        ow_name = (resolved_payload.get("owner_name") or "").strip()
        if resolved_record and (updates or ow_id or ow_name):
            for field, new_v in updates.items():
                if new_v in (None, "", "required"):
                    continue
                old_v = data.get(field, "—")
                label = str(field).replace("_", " ").title()
                lines.append(f"- **{label}**: {old_v!r} → {new_v!r}")
            if ow_id or ow_name:
                prev_o = (resolved_record or {}).get("owner_id")
                label_new = ow_name or ow_id or "—"
                lines.append(f"- **Owner**: {prev_o!r} → {label_new!r}")
        else:
            for field, value in updates.items():
                if value not in (None, "", "required"):
                    lines.append(f"- Set **{field}** → {value!r}")

        for h in self._update_followup_hints(object_type, updates):
            lines.append(f"\n_{h}_")

        lines.append(
            "\n⚠️ This will modify the existing record. "
            "**Confirm** to apply, or ask what will change if anything is unclear."
        )
        return "\n".join(lines)

    def _object_name_for_records_create(self, intent: ParsedIntent) -> Optional[str]:
        """Object API name for intents that use POST /api/objects/{object}/records."""
        if intent.action_type == ActionType.CREATE_LEAD:
            return "lead"
        if intent.action_type == ActionType.CREATE_TASK:
            return "task"
        if intent.action_type == ActionType.CREATE_RECORD:
            ot = (intent.payload or {}).get("object_type", "")
            return ot.lower().strip() if ot else None
        return None

    async def _records_api_create_permission_message(
        self,
        current_user: User,
        object_name: str,
    ) -> Optional[str]:
        """
        Same create permission gate as create_object_record (standard objects only).
        Returns user-facing message if denied, else None.
        """
        on = normalize_object_name(object_name)
        if on not in ["lead", "contact", "account", "opportunity", "task", "event"]:
            return None
        try:
            await check_permission(current_user, on, "create")
            return None
        except HTTPException as e:
            detail: Union[str, Dict[str, Any]] = e.detail
            if isinstance(detail, dict):
                return str(detail.get("message") or detail.get("detail") or detail)
            return str(detail)

    def _flat_create_payload(self, intent: ParsedIntent) -> tuple[str, Dict[str, Any]]:
        """(object_api_name, flat_field_dict) for create_lead / create_task / create_record."""
        payload = intent.payload or {}
        if intent.action_type == ActionType.CREATE_LEAD:
            return "lead", dict(payload)
        if intent.action_type == ActionType.CREATE_TASK:
            return "task", dict(payload)
        if intent.action_type == ActionType.CREATE_RECORD:
            ot = (payload.get("object_type") or "").lower().strip()
            return ot, dict(payload.get("fields") or {})
        return "", {}

    async def _metadata_missing_for_create(
        self,
        tenant_id: str,
        intent: ParsedIntent,
    ) -> Optional[str]:
        """
        Build clarification from tenant field metadata (required + optional prompts).
        Returns message string if blocking required fields are missing; else None.
        """
        if intent.action_type not in (
            ActionType.CREATE_LEAD,
            ActionType.CREATE_TASK,
            ActionType.CREATE_RECORD,
        ):
            return None
        obj_name, flat = self._flat_create_payload(intent)
        if not obj_name:
            return None
        obj_doc = await load_enriched_object_for_create(self.db, tenant_id, obj_name)
        fields_meta = (obj_doc or {}).get("fields") or {}
        label = (obj_doc or {}).get("object_label") or obj_name.replace("_", " ").title()

        if fields_meta:
            gaps = analyze_create_gaps(obj_name, label, fields_meta, flat)
            if gaps:
                return gaps.build_message()
            return None

        # Metadata unavailable — minimal fallback
        reqs = REQUIRED_FIELDS_FALLBACK.get(obj_name, [])
        missing = []
        for rf in reqs:
            v = flat.get(rf)
            if not v or v == "required":
                missing.append(rf.replace("_", " ").title())
        if not missing:
            return None
        req = ", ".join(f"**{m}**" for m in missing)
        return (
            f"I need {req} before I can create this {label}.\n\n"
            f"You can also add more details in your next message if you like."
        )

    async def _resolve_account_for_lookup(
        self,
        tenant_id: str,
        raw_account_name: str,
    ):
        for candidate in account_lookup_variants(raw_account_name):
            rec = await self.activity_mcp._resolve_record(tenant_id, "account", candidate)
            if rec:
                return rec, candidate
        return None, raw_account_name

    async def _resolve_related_record_for_lookup(
        self,
        tenant_id: str,
        rel_type: str,
        raw_identifier: str,
    ):
        rl = (rel_type or "").lower()
        if rl == "account":
            for candidate in account_lookup_variants(raw_identifier):
                rec = await self.activity_mcp._resolve_record(tenant_id, "account", candidate)
                if rec:
                    return rec, candidate
            return None, raw_identifier
        rec = await self.activity_mcp._resolve_record(tenant_id, rel_type, raw_identifier)
        if rec:
            return rec, raw_identifier
        return None, raw_identifier

    async def process_message(
        self,
        tenant_id: str,
        user_id: str,
        current_user: User,
        request: ChatRequest,
        stream_callback: Optional[Callable[[str], Awaitable[None]]] = None
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
        
        # Update context if provided (mirror attachment id → file_id for intent + read_file)
        if request.context:
            normalized_ctx = self._normalize_request_context(request.context)
            await self.conversation_service.update_context(
                conversation.id,
                normalized_ctx
            )
            conversation.context = normalized_ctx
        
        # Get conversation history for LLM context
        history = await self.conversation_service.get_conversation_history(
            conversation.id,
            limit=10
        )
        
        # Step 2: Parse intent (with deterministic interception for button clicks)
        intent = await self._intercept_follow_up_button(conversation, request.message)
        
        if not intent:
            # Fallback to LLM if not a deterministic follow-up
            intent = await self.intent_router.parse_intent(
                user_message=request.message,
                conversation_history=history,
                context=conversation.context
            )

        if intent and intent.action_type == ActionType.UPDATE_RECORD and intent.payload:
            self._merge_update_record_from_history(
                history, request.message, intent.payload
            )
            self._apply_conversation_context_to_update(conversation, intent)
            self._sanitize_update_record_payload(intent.payload)
        if intent and intent.action_type == ActionType.UPDATE_LIST_VIEW and intent.payload:
            self._apply_conversation_context_to_list_view_update(conversation, intent)
        if intent and intent.action_type in (ActionType.SEND_EMAIL, ActionType.DRAFT_EMAIL) and intent.payload:
            self._apply_conversation_context_to_email(conversation, intent)

        self._enrich_file_intent_from_context(intent, conversation.context, request.message)

        # Global context guard: if user says "this/current/that" but context is missing,
        # ask clarification before running potentially wrong actions.
        if intent:
            clarification_intent = self._context_clarification_if_needed(
                conversation=conversation,
                intent=intent,
                user_message=request.message,
            )
            if clarification_intent:
                intent = clarification_intent
        
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
            
            meta_clarification: Optional[str] = None
            # Metadata-driven required / optional prompts for record creates
            if is_valid and intent.action_type in (
                ActionType.CREATE_LEAD,
                ActionType.CREATE_TASK,
                ActionType.CREATE_RECORD,
            ):
                meta_clarification = await self._metadata_missing_for_create(
                    tenant_id, intent
                )
                if meta_clarification:
                    is_valid = False
                    error_msg = meta_clarification

            # Cross-object dependency validation (only if basic fields are OK)
            if is_valid and intent.payload:
                payload = intent.payload
                dep_ok, dep_msg = await self._validate_dependencies(
                    tenant_id, intent.action_type, payload
                )
                if not dep_ok:
                    is_valid = False
                    error_msg = dep_msg

            if not is_valid:
                clarification_msg = meta_clarification if meta_clarification else None
                clarification_msg = clarification_msg or self._get_user_friendly_validation_message(
                    intent.action_type,
                    error_msg,
                    intent.payload,
                )
                response = ChatResponse(
                    conversation_id=conversation.id,
                    message=clarification_msg,
                    action_type=ActionType.CLARIFICATION,
                    requires_confirmation=False
                )
                await self._store_assistant_message(conversation.id, response)
                return response

        if (
            intent
            and intent.action_type == ActionType.UPDATE_RECORD
            and intent.payload
            and self._update_payload_has_identified_record(intent.payload)
            and not self._update_payload_has_meaningful_changes(intent.payload)
        ):
            pl = intent.payload
            response = ChatResponse(
                conversation_id=conversation.id,
                message=(
                    f"I’ve got **{pl.get('object_type')}** **{pl.get('record_id')}**. "
                    "What should I change? For example: **company**, **status**, **email**, **phone**, or **owner**."
                ),
                action_type=ActionType.CLARIFICATION,
                requires_confirmation=False,
            )
            await self._store_assistant_message(conversation.id, response)
            return response
        
        create_object = self._object_name_for_records_create(intent)
        if create_object:
            perm_msg = await self._records_api_create_permission_message(
                current_user, create_object
            )
            if perm_msg:
                response = ChatResponse(
                    conversation_id=conversation.id,
                    message=perm_msg,
                    action_type=ActionType.CLARIFICATION,
                    requires_confirmation=False,
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
                current_user=current_user,
                intent=intent,
                stream_callback=stream_callback
            )
        
        # Step 6: Store assistant message
        await self._store_assistant_message(conversation.id, response)
        
        return response

    @staticmethod
    def _normalize_request_context(context: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        if not context:
            return {}
        out = dict(context)
        aid = out.get("attached_file_id")
        if aid is not None and not out.get("file_id"):
            out["file_id"] = str(aid)
        return out

    def _enrich_file_intent_from_context(
        self,
        intent: ParsedIntent,
        context: Optional[Dict[str, Any]],
        user_message: str,
    ) -> None:
        """Fill read_file.file_id from attachment context; route obvious file Q&A away from no_action."""
        if not context:
            return
        fid = context.get("file_id") or context.get("attached_file_id")
        if not fid:
            return
        fid = str(fid)

        if intent.action_type == ActionType.READ_FILE:
            pl = dict(intent.payload or {})
            if not pl.get("file_id"):
                pl["file_id"] = fid
            intent.payload = pl
            return

        if intent.action_type != ActionType.NO_ACTION:
            return

        msg = (user_message or "").strip().lower()
        if not msg:
            return

        crm_prefixes = (
            "find ", "search ", "create ", "update ", "delete ", "show all",
            "list all", "how many", "add lead", "new lead", "create lead",
            "create a", "add a ", "add note", "create task", "create contact",
            "create account", "create opportunity", "convert ",
        )
        if any(msg.startswith(p) for p in crm_prefixes):
            return

        file_markers = (
            "summar", "summary", "tl;dr", "tldr", "file", "attach", "document",
            "pdf", "upload", "spreadsheet", "csv", "what ", "what's", "whats",
            "explain", "extract", "content", "mean ", "about the", "this doc",
            "the doc", "in the ",
        )
        looks_file = (
            "?" in msg
            or any(m in msg for m in file_markers)
            or len(msg.split()) >= 5
        )
        if not looks_file:
            return

        risk, preview = self.intent_router._get_risk_level(ActionType.READ_FILE)
        raw_q = (user_message or "").strip()
        query: Optional[str] = raw_q or None
        if query and query.lower() in ("summarize", "summary", "summarise", "summarize this", "tl;dr", "tldr"):
            query = None

        intent.action_type = ActionType.READ_FILE
        intent.payload = {"file_id": fid, "query": query}
        intent.risk_level = risk
        intent.requires_preview = preview
    
    async def _intercept_follow_up_button(
        self,
        conversation: Conversation,
        message: str
    ) -> Optional[ParsedIntent]:
        """
        Intercept deterministic follow-up button clicks to bypass LLM context errors.
        This ensures that when a user clicks "Summarize everything" or similar,
        we use the exact record from the previous message instead of letting the LLM guess.
        """
        if not conversation.messages:
            return None
            
        # Look for the last assistant message with discovery data
        last_assistant_msg = None
        for msg in reversed(conversation.messages):
            if msg.role == MessageRole.ASSISTANT:
                last_assistant_msg = msg
                break
        
        if not last_assistant_msg or not last_assistant_msg.execution_result:
            return None
            
        result_data = last_assistant_msg.execution_result
        discovery = result_data.get("discovery")
        record = result_data.get("record")
        
        # We only intercept if the previous turn was a RECORD_SUMMARY with discovery options
        if not record or not discovery:
            return None
            
        msg_clean = message.strip()
        record_id = record.get("id") or record.get("series_id")
        object_type = record.get("object_type")
        record_name = record.get("name", "this record")
        
        if not record_id or not object_type:
            return None

        # 1. Handle "Summarize everything"
        if msg_clean == "Summarize everything":
            return ParsedIntent(
                action_type=ActionType.RECORD_SUMMARY,
                confidence=1.0,
                payload={
                    "object_type": object_type,
                    "record_id": record_id,
                    "include_all": True,
                    "user_query": message
                },
                reasoning="Deterministic interception: User clicked 'Summarize everything' follow-up."
            )
            
        # 2. Handle "Just standard summary of ..."
        if msg_clean == f"Just standard summary of {record_name}" or msg_clean.startswith("Just standard summary of"):
            return ParsedIntent(
                action_type=ActionType.RECORD_SUMMARY,
                confidence=1.0,
                payload={
                    "object_type": object_type,
                    "record_id": record_id,
                    "include_all": False,
                    "skip_discovery": True,
                    "user_query": message
                },
                reasoning=f"Deterministic interception: User clicked standard summary for {record_name}."
            )

        # 3. Handle "Include tasks" or "Include opportunities"
        # These are shorthand for showing specific related data.
        # For simplicity, we route them to include_all=True which handles all discovered items.
        if msg_clean.startswith("Include "):
            return ParsedIntent(
                action_type=ActionType.RECORD_SUMMARY,
                confidence=1.0,
                payload={
                    "object_type": object_type,
                    "record_id": record_id,
                    "include_all": True,
                    "user_query": message
                },
                reasoning=f"Deterministic interception: User requested to include specific details for {record_name}."
            )
            
        return None

    async def confirm_preview(
        self,
        tenant_id: str,
        user_id: str,
        current_user: User,
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
        if intent.action_type == ActionType.UPDATE_RECORD and intent.payload:
            self._sanitize_update_record_payload(intent.payload)
        
        response = await self._execute_action(
            conversation_id=conversation_id,
            tenant_id=tenant_id,
            user_id=user_id,
            current_user=current_user,
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
        
        resolved_payload = dict(intent.payload) if intent.payload else {}
        resolved_record_name = None
        resolved_record: Optional[Dict[str, Any]] = None

        if intent.action_type == ActionType.UPDATE_RECORD:
            ot = (resolved_payload.get("object_type") or "").strip()
            rid = (resolved_payload.get("record_id") or "").strip()
            if not ot or not rid:
                return ChatResponse(
                    conversation_id=conversation_id,
                    message=(
                        "To update a record I need **which object** (lead, contact, account, opportunity, task, event), "
                        "**which record** (name, ID, or open the record and say *this one*), and **what to change**. "
                        "Bulk update on multiple matches isn’t supported yet — narrow down to one record first."
                    ),
                    action_type=ActionType.CLARIFICATION,
                    requires_confirmation=False,
                )
            resolved_record = await self.activity_mcp._resolve_record(
                tenant_id=tenant_id,
                object_type=ot,
                identifier=rid,
            )
            if not resolved_record:
                return ChatResponse(
                    conversation_id=conversation_id,
                    message=(
                        f"I couldn't find a **{ot}** named or with ID **{rid}**. "
                        "Please confirm the record, or open it in the CRM so I can use the current page context."
                    ),
                    action_type=ActionType.CLARIFICATION,
                    requires_confirmation=False,
                )
            resolved_payload["record_id"] = resolved_record.get("id")
            resolved_payload["series_id"] = resolved_record.get("series_id")
            data = resolved_record.get("data", {})
            resolved_record_name = self._record_display_name(
                ot,
                data,
                resolved_record.get("series_id", "Unknown"),
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
        
        if intent.action_type == ActionType.UPDATE_RECORD:
            preview_message = await self._format_update_preview(
                resolved_payload,
                resolved_record,
                resolved_record_name,
                tenant_id,
            )
        else:
            preview_message = self._format_preview_message(
                intent, resolved_record_name
            )
        
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
        current_user: User,
        intent: ParsedIntent,
        stream_callback: Optional[Callable[[str], Awaitable[None]]] = None
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
        streamed_live = False
        
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
                
                # If there's a specific question (e.g. "how many?"), generate a natural language response using AI
                if payload.get("user_query") and result.get("success"):
                    if stream_callback:
                        streamed_parts: List[str] = []
                        async for token in self.intent_router.generate_ai_response_stream(
                            user_query=payload["user_query"],
                            data_context={"total": result.get("total", 0), "records": result.get("records", [])}
                        ):
                            streamed_parts.append(token)
                            await stream_callback(token)
                        streamed_live = True
                        message = "".join(streamed_parts).strip() or message
                    else:
                        ai_answer = await self.intent_router.generate_ai_response(
                            user_query=payload["user_query"],
                            data_context={"total": result.get("total", 0), "records": result.get("records", [])}
                        )
                        # Let the AI generate the full response including a natural mention of the total count.
                        message = ai_answer
                
            elif action_type == ActionType.RECORD_SUMMARY:
                summary_payload = RecordSummaryPayload(**payload)
                result = await self.crm_core.get_record_summary(
                    tenant_id=tenant_id,
                    user_id=user_id,
                    payload=summary_payload
                )
                result_data = result
                
                # Proactive Discovery Logic: If there's related data and inclusion hasn't been confirmed/skipped
                discovery = result.get("discovery")
                if discovery and not summary_payload.include_all and not summary_payload.skip_discovery:
                    # Construct the proactive question
                    record_name = result.get("record", {}).get("name", "this record")
                    items = []
                    if discovery.get("opportunities"): items.append(f"{discovery['opportunities']} opportunities")
                    if discovery.get("tasks"): items.append(f"{discovery['tasks']} tasks")
                    if discovery.get("events"): items.append(f"{discovery['events']} events")
                    if discovery.get("notes"): items.append(f"{discovery['notes']} notes")
                    if discovery.get("contacts"): items.append(f"{discovery['contacts']} contacts")
                    
                    items_str = ", ".join(items)
                    message = f"I found **{record_name}**. Do you want me to cover every single thing I am able to do? To find out, you have {items_str} as well. Should I include all of these in the summary?"
                    
                    # Store discovery in suggestions for easier selection
                    suggestions = ["Summarize everything", f"Just standard summary of {record_name}"]
                    if discovery.get("opportunities"): suggestions.append("Include opportunities")
                    if discovery.get("tasks"): suggestions.append("Include tasks")
                    
                    # Return early with the question
                    if stream_callback and message and not streamed_live:
                        await self._emit_text_stream(message, stream_callback)
                    return ChatResponse(
                        conversation_id=conversation_id,
                        message=message,
                        action_type=action_type,
                        requires_confirmation=False,
                        result_data={"discovery": discovery, "record": result.get("record")},
                        suggestions=suggestions
                    )

                message = self._format_summary_result(result)
                
                # If there's a specific question, generate a natural language response using AI
                if payload.get("user_query") and result.get("success"):
                    ai_context = {
                        "record": result.get("record"),
                        "summary": result.get("summary"),
                        "related": result.get("related", {}),
                        "discovery": result.get("discovery")
                    }
                    ai_answer = ""
                    if stream_callback and not (
                        summary_payload.include_all
                        or any(kw in payload.get("user_query", "").lower() for kw in ["include", "everything", "all"])
                    ):
                        streamed_parts: List[str] = []
                        async for token in self.intent_router.generate_ai_response_stream(
                            user_query=payload["user_query"],
                            data_context=ai_context
                        ):
                            streamed_parts.append(token)
                            await stream_callback(token)
                        streamed_live = True
                        ai_answer = "".join(streamed_parts).strip()
                    else:
                        ai_answer = await self.intent_router.generate_ai_response(
                            user_query=payload["user_query"],
                            data_context=ai_context
                        )
                    
                    # For summaries with deep data (include_all), always combine AI intro with structured results.
                    # This ensures we don't lose the tasks/opportunities lists that the formatter provides.
                    if summary_payload.include_all or any(kw in payload.get("user_query", "").lower() for kw in ["include", "everything", "all"]):
                        message = f"{ai_answer}\n\n{message}"
                    else:
                        message = ai_answer
                
            elif action_type == ActionType.CREATE_LEAD:
                lead_payload = CreateLeadPayload(**payload)
                result = await self.activity_mcp.create_lead(
                    tenant_id=tenant_id,
                    user_id=user_id,
                    current_user=current_user,
                    payload=lead_payload,
                    conversation_id=conversation_id
                )
                result_data = result
                message = result.get("message", "Lead created.")
                if result.get("success"):
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
                    current_user=current_user,
                    payload=task_payload,
                    conversation_id=conversation_id
                )
                result_data = result
                message = result.get("message", "Task created.")
                if result.get("success"):
                    suggestions = ["View my tasks", "Create another task"]
            
            elif action_type == ActionType.CREATE_RECORD:
                result = await self.activity_mcp.create_record(
                    tenant_id=tenant_id,
                    user_id=user_id,
                    current_user=current_user,
                    payload=CreateRecordPayload(**payload),
                    conversation_id=conversation_id
                )
                result_data = result
                message = result.get("message", f"{payload.get('object_type', 'Record')} created.")
                if result.get("success"):
                    suggestions = ["View the record", "Create another record"]
            
            # Phase 2A Actions
            elif action_type == ActionType.UPDATE_RECORD:
                update_payload = UpdateRecordPayload(**payload)
                result = await self.activity_mcp.update_record(
                    tenant_id=tenant_id,
                    user_id=user_id,
                    current_user=current_user,
                    payload=update_payload,
                    conversation_id=conversation_id,
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

            elif action_type == ActionType.UPDATE_LIST_VIEW:
                list_view_payload = UpdateListViewPayload(**payload)
                result = await self.activity_mcp.update_list_view(
                    tenant_id=tenant_id,
                    user_id=user_id,
                    payload=list_view_payload,
                    conversation_id=conversation_id
                )
                result_data = result
                message = result.get("message", "List view updated.")
                if result.get("success"):
                    suggestions = ["Update another list view", "Show list views", "Search for records"]

            elif action_type == ActionType.BULK_UPDATE_RECORDS:
                bulk_payload = BulkUpdateRecordsPayload(**payload)
                result = await self.activity_mcp.bulk_update_records(
                    tenant_id=tenant_id,
                    user_id=user_id,
                    current_user=current_user,
                    payload=bulk_payload,
                    conversation_id=conversation_id,
                )
                result_data = result
                message = result.get("message", "Bulk update completed.")
                if result.get("success"):
                    suggestions = ["Search updated records", "Run another bulk update"]

            elif action_type == ActionType.BULK_CREATE_TASKS:
                bulk_task_payload = BulkCreateTasksPayload(**payload)
                result = await self.activity_mcp.bulk_create_tasks(
                    tenant_id=tenant_id,
                    user_id=user_id,
                    current_user=current_user,
                    payload=bulk_task_payload,
                    conversation_id=conversation_id,
                )
                result_data = result
                message = result.get("message", "Bulk task creation completed.")
                if result.get("success"):
                    suggestions = ["View created tasks", "Create another bulk follow-up"]

            elif action_type == ActionType.BULK_CREATE_RECORDS:
                bulk_create_payload = BulkCreateRecordsPayload(**payload)
                result = await self.activity_mcp.bulk_create_records(
                    tenant_id=tenant_id,
                    user_id=user_id,
                    current_user=current_user,
                    payload=bulk_create_payload,
                    conversation_id=conversation_id,
                )
                result_data = result
                message = result.get("message", "Bulk record creation completed.")
                if result.get("success"):
                    suggestions = ["Search created records", "Run another bulk create"]

            elif action_type == ActionType.SEND_EMAIL:
                email_payload = SendEmailPayload(**payload)
                result = await self.activity_mcp.send_email_action(
                    tenant_id=tenant_id,
                    user_id=user_id,
                    current_user=current_user,
                    payload=email_payload,
                    conversation_id=conversation_id,
                )
                result_data = result
                message = result.get("message", "Email sent.")
                if result.get("success"):
                    suggestions = ["View email history", "Send another email"]

            elif action_type == ActionType.DRAFT_EMAIL:
                draft_payload = DraftEmailPayload(**payload)
                result = await self.activity_mcp.draft_email_action(
                    tenant_id=tenant_id,
                    user_id=user_id,
                    payload=draft_payload,
                    conversation_id=conversation_id,
                )
                result_data = result
                message = result.get("message", "Draft saved.")
                if result.get("success"):
                    suggestions = ["Open drafts", "Send email now"]
            
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
                message = "I encountered an issue while validating your request. Could you please provide more details?"
        except Exception as e:
            logger.error(f"Action execution error: {str(e)}")
            message = "I encountered an unexpected error while processing your request. Please try again in a moment."

        if stream_callback and message and not streamed_live:
            await self._emit_text_stream(message, stream_callback)

        try:
            await self._persist_post_action_context(
                conversation_id=conversation_id,
                tenant_id=tenant_id,
                user_id=user_id,
                action_type=action_type,
                payload=payload,
                result_data=result_data,
            )
        except Exception as ctx_err:
            logger.warning(f"Context persist skipped: {ctx_err}")
        
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
            
            # Dynamically list all provided fields except name components
            skip_fields = ["first_name", "last_name", "name"]
            for field, value in payload.items():
                if field not in skip_fields and value:
                    label = field.replace('_', ' ').title()
                    lines.append(f"- {label}: {value}")
                    
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
        
        elif action_type == ActionType.CREATE_LIST_VIEW:
            name = payload.get("name", "List View")
            object_type = payload.get("object_type", "records")
            filters = payload.get("filters", [])
            plural_map = {
                "opportunity": "opportunities",
                "company": "companies",
                "activity": "activities",
                "category": "categories",
                "inventory": "inventory",
                "history": "histories",
            }
            plural_object = plural_map.get(str(object_type).lower(), f"{object_type}s")
            lines = [f"I'll create a list view called **\"{name}\"** for {plural_object}"]
            if filters:
                lines.append("With filters:")
                for f in filters[:3]:
                    lines.append(f"- {f.get('field', '?')} {f.get('operator', '?')} {f.get('value', '?')}")
                if len(filters) > 3:
                    lines.append(f"- ...and {len(filters) - 3} more filters")
            lines.append("\nDo you want me to proceed?")
            return "\n".join(lines)

        elif action_type == ActionType.UPDATE_LIST_VIEW:
            current_name = payload.get("current_name") or payload.get("list_view_id") or "that list view"
            lines = [f"I'll update list view **\"{current_name}\"**"]
            if payload.get("name"):
                lines.append(f"- Rename to: **{payload.get('name')}**")
            if payload.get("filters") is not None:
                lines.append(f"- Update filters: {len(payload.get('filters') or [])} rule(s)")
            if payload.get("columns") is not None:
                lines.append(f"- Columns: {', '.join(payload.get('columns') or []) or '(clear columns)'}")
            if payload.get("sort_field"):
                lines.append(f"- Sort: {payload.get('sort_field')} ({payload.get('sort_order', 'asc')})")
            if payload.get("visibility"):
                lines.append(f"- Visibility: {payload.get('visibility')}")
            if payload.get("is_default") is not None:
                lines.append(f"- Default view: {'Yes' if payload.get('is_default') else 'No'}")
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
        
        elif action_type == ActionType.CREATE_RECORD:
            object_type = payload.get("object_type", "record")
            fields = payload.get("fields", {})
            
            # Prioritize first_name + last_name for contacts/leads, otherwise use specific name fields
            if object_type in ["contact", "lead"]:
                name = f"{fields.get('first_name', '')} {fields.get('last_name', '')}".strip()
                if not name:
                    name = fields.get("name") or "New Contact"
            elif object_type == "event":
                name = fields.get("subject") or fields.get("name") or "New Event"
            else:
                name = fields.get("name") or fields.get("opportunity_name") or fields.get("account_name") or "New Record"
            
            lines = [f"I'll create a new **{object_type}**: **{name}**"]
            for field, value in fields.items():
                # Skip naming fields in the detail list
                if field not in ["name", "first_name", "last_name", "opportunity_name", "account_name"]:
                    # Also skip internal ID fields
                    if field.endswith("_id") and (value and len(str(value)) > 20):
                        continue
                    label = field.replace('_', ' ').title()
                    lines.append(f"- {label}: {value}")
            lines.append("\nDo you want me to proceed?")
            return "\n".join(lines)

        elif action_type == ActionType.BULK_UPDATE_RECORDS:
            object_type = payload.get("object_type", "record")
            filters = payload.get("filters", {}) or {}
            updates = payload.get("updates", {}) or {}
            lines = [f"I'll bulk update **{object_type}** records with:"]
            for k, v in filters.items():
                lines.append(f"- Filter `{k}`: {v}")
            for k, v in updates.items():
                lines.append(f"- Set **{k}**: {v}")
            if payload.get("owner_name") or payload.get("owner_id"):
                lines.append(f"- New owner: {payload.get('owner_name') or payload.get('owner_id')}")
            lines.append(f"- Safety limit: {payload.get('limit', 100)} records")
            lines.append("\nThis may update multiple records. Do you want me to proceed?")
            return "\n".join(lines)

        elif action_type == ActionType.BULK_CREATE_TASKS:
            lines = [f"I'll create tasks for matching **{payload.get('target_object_type', 'records')}**:"]
            for k, v in (payload.get("target_filters") or {}).items():
                lines.append(f"- Filter `{k}`: {v}")
            lines.append(f"- Subject: {payload.get('subject_template', 'Follow up: {name}')}")
            if payload.get("due_date"):
                lines.append(f"- Due date: {payload.get('due_date')}")
            lines.append(f"- Priority: {payload.get('priority', 'Normal')}")
            lines.append(f"- Safety limit: {payload.get('limit', 100)} tasks")
            lines.append("\nThis may create multiple tasks. Do you want me to proceed?")
            return "\n".join(lines)

        elif action_type == ActionType.BULK_CREATE_RECORDS:
            object_type = payload.get("object_type", "record")
            records = payload.get("records") or []
            lines = [f"I'll bulk create **{len(records)} {object_type}** record(s)."]
            for i, rec in enumerate(records[:3], 1):
                label = rec.get("name") or rec.get("account_name") or rec.get("opportunity_name") or rec.get("email") or f"record {i}"
                lines.append(f"- {i}. {label}")
            if len(records) > 3:
                lines.append(f"- ...and {len(records) - 3} more")
            lines.append(f"- Safety limit: {payload.get('limit', 100)} records")
            lines.append("\nThis will create multiple records. Do you want me to proceed?")
            return "\n".join(lines)

        elif action_type == ActionType.SEND_EMAIL:
            lines = ["I'll send this email:"]
            if payload.get("to_emails"):
                lines.append(f"- To: {', '.join(payload.get('to_emails') or [])}")
            if payload.get("email_all_open_opportunity_owners"):
                lines.append("- Recipients: all owners of open opportunities")
            if payload.get("related_record_type") and payload.get("related_record_id"):
                lines.append(f"- Linked record: {payload.get('related_record_type')} {payload.get('related_record_id')}")
            lines.append(f"- Subject: {payload.get('subject') or '(no subject)'}")
            lines.append("\nDo you want me to proceed?")
            return "\n".join(lines)

        elif action_type == ActionType.DRAFT_EMAIL:
            lines = ["I'll save this email draft:"]
            if payload.get("to_emails"):
                lines.append(f"- To: {', '.join(payload.get('to_emails') or [])}")
            if payload.get("related_record_type") and payload.get("related_record_id"):
                lines.append(f"- Linked record: {payload.get('related_record_type')} {payload.get('related_record_id')}")
            lines.append(f"- Subject: {payload.get('subject') or '(no subject)'}")
            return "\n".join(lines)
            
        return "Do you want me to proceed with this action?"
    
    def _format_search_results(self, result: Dict[str, Any]) -> str:
        """Format search results for display"""
        if result.get("error"):
            object_type = result.get("object_type", "record")
            return f"I encountered an issue while searching for {object_type}s. Could you try rephrasing your search or using different criteria?"
        
        records = result.get("records", [])
        total = result.get("total", 0)
        object_type = result.get("object_type", "record")
        query = result.get("query", "")
        
        # Better pluralization for CRM objects
        plural_map = {
            "opportunity": "opportunities",
            "company": "companies",
            "activity": "activities",
            "category": "categories",
            "inventory": "inventory",
            "history": "histories"
        }
        plural_type = plural_map.get(object_type.lower(), f"{object_type}s")
        
        if not records:
            if query:
                return f"I couldn't find any {plural_type} matching '{query}'."
            return f"I couldn't find any {plural_type}."
        
        if query:
            lines = [f"Found **{total}** {plural_type} matching '{query}':"]
        else:
            lines = [f"Found **{total}** {plural_type}:"]
        
        for i, record in enumerate(records[:5], 1):
            name = record.get("name", "Unknown")
            series_id = record.get("series_id", "")
            data = record.get("data", {})
            
            # Show stage/status in the result list for better clarity
            status_info = ""
            if data.get("status"):
                status_info = f" | Status: **{data['status']}**"
            elif data.get("stage"):
                status_info = f" | Stage: **{data['stage']}**"
                
            lines.append(f"{i}. **[[{name}|{object_type}|{series_id}]]** ({series_id}){status_info}")
        
        if total > 5:
            lines.append(f"\n...and {total - 5} more.")
        
        return "\n".join(lines)
    
    def _format_summary_result(self, result: Dict[str, Any]) -> str:
        """Format record summary for display"""
        if result.get("error"):
            return "I couldn't find that record to summarize. Please double check the name or ID and try again."
        
        if not result.get("success"):
            return "I couldn't find that record."
        
        summary = result.get("summary", "")
        related = result.get("related", {})
        
        lines = [summary]
        
        # Add related info
        if related.get("tasks"):
            lines.append(f"\n**Related Tasks** ({len(related['tasks'])}):")
            for t in related['tasks'][:3]:
                lines.append(f"- [[{t.get('name')}|task|{t.get('series_id')}]] | Status: {t.get('data', {}).get('status', 'Unknown')}")
        
        if related.get("events"):
            lines.append(f"\n**Recent Events** ({len(related['events'])}):")
            for e in related['events'][:3]:
                lines.append(f"- [[{e.get('name')}|event|{e.get('series_id')}]]")
        
        if related.get("opportunities"):
            lines.append(f"\n**Opportunities** ({len(related['opportunities'])}):")
            for o in related['opportunities'][:3]:
                lines.append(f"- [[{o.get('name')}|opportunity|{o.get('series_id')}]] | Stage: {o.get('data', {}).get('stage', 'Unknown')}")

        if related.get("contacts"):
            lines.append(f"\n**Contacts** ({len(related['contacts'])}):")
            for c in related['contacts'][:3]:
                lines.append(f"- [[{c.get('name')}|contact|{c.get('series_id')}]]")

        if related.get("notes"):
            lines.append(f"\n**Notes**: {len(related['notes'])}")
        
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
    
    def _get_user_friendly_validation_message(self, action_type: ActionType, error_msg: str, payload: Optional[Dict[str, Any]] = None) -> str:
        """Convert validation errors to user-friendly messages"""
        payload = payload or {}
        fields = payload.get("fields", payload) if action_type == ActionType.CREATE_RECORD else payload
        
        # Extract a name for personalization if possible
        person_name = fields.get("first_name") or fields.get("name")
        if person_name == "required": person_name = None
            
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
        
        if action_type in [ActionType.CREATE_LEAD, ActionType.CREATE_TASK, ActionType.CREATE_RECORD, ActionType.ADD_NOTE]:
            object_type = payload.get("object_type", "").lower() if action_type == ActionType.CREATE_RECORD else action_type.value.split('_')[-1]
            if not object_type: object_type = "record"
            
            if "missing:" in error_msg.lower() or "missing required" in error_msg.lower() or error_msg.startswith("Missing:"):
                # Extract the field names from the error message
                missing_str = error_msg.split(":")[-1].strip()
                return f"I still need a few more details to create this {object_type}. Specifically, the following fields are required: **{missing_str}**."
            
            # If the error message is already a descriptive sentence from _validate_dependencies, return it directly
            if error_msg.endswith("?") or error_msg.endswith(".") or "exist" in error_msg.lower():
                return error_msg
            
            if "not found" in error_msg.lower():
                return f"I need a few more details to create this {object_type}: {error_msg}. Could you provide that?"

            # Object-specific specific field prompts (keep for single field questions)
            if action_type == ActionType.CREATE_LEAD:
                if "first_name" in error_msg.lower():
                    return "To create a lead, I need a first name. What's the person's first name?"
                if "last_name" in error_msg.lower():
                    prefix = f"What is {person_name}'s" if person_name else "What's the"
                    return f"To create a lead, I need a last name. {prefix} last name?"

            if action_type == ActionType.CREATE_RECORD:
                if "account_name" in error_msg.lower():
                    return "What's the name of the account you'd like to create?"
                if "opportunity_name" in error_msg.lower():
                    return "What should we name this opportunity?"
                if "stage" in error_msg.lower():
                    return "What stage is this opportunity in? (e.g. Prospecting, Qualification, etc.)"
                if "subject" in error_msg.lower() and payload.get("object_type", "").lower() == "event":
                    return "What is the event subject or title?"
                if "start_date" in error_msg.lower() and payload.get("object_type", "").lower() == "event":
                    return "When should this event start? Please share the start date/time."
            
            return f"I still need a few more details to create this {object_type}. Specifically, the following fields are required: {error_msg.split(':')[-1] if ':' in error_msg else error_msg}"
        
        # Phase 2A validation messages
        if action_type == ActionType.UPDATE_RECORD:
            if "object_type" in error_msg.lower():
                return (
                    "Which type of record should I update? "
                    "I support **lead**, **contact**, **account**, **opportunity**, **task**, and **event**."
                )
            if "record_id" in error_msg.lower():
                return (
                    "Which **one** record should I update? Share a name or ID, "
                    "or open the record in the app and say **this record**."
                )
            if "owner" in error_msg.lower() or "field" in error_msg.lower() or "at least one" in error_msg.lower():
                return (
                    "What should change? Name the **field(s)** and **new value(s)**, "
                    "or say who should **own** the record (e.g. *owner Rishabh*)."
                )
            if "updates" in error_msg.lower():
                return "What fields would you like to update and to what values?"
        
        if action_type == ActionType.CREATE_LIST_VIEW:
            if "object_type" in error_msg.lower():
                return "Which type of records should this list view show? For example: leads, contacts, accounts."
            if "name" in error_msg.lower():
                return "What would you like to name this list view?"
        
        if action_type == ActionType.UPDATE_LIST_VIEW:
            if "identifier" in error_msg.lower() or "current_name" in error_msg.lower() or "list_view_id" in error_msg.lower():
                return "Which list view should I update? Share its current name or list view ID."
            if "changes" in error_msg.lower() or "at least one" in error_msg.lower():
                return (
                    "What should I change in that list view? You can update **name**, **filters**, "
                    "**columns**, **sort**, **visibility**, or **default**."
                )

        if action_type == ActionType.BULK_UPDATE_RECORDS:
            if "object_type" in error_msg.lower():
                return "Which object should I bulk update? Use lead, contact, account, opportunity, task, or event."
            if "missing changes" in error_msg.lower() or "changes" in error_msg.lower():
                return "Tell me what to change in bulk (fields and values, or owner)."

        if action_type == ActionType.BULK_CREATE_TASKS:
            if "target_object_type" in error_msg.lower():
                return "Which records should receive tasks in bulk? Use lead, contact, account, or opportunity."
            if "subject_template" in error_msg.lower():
                return "What should the task subject be? You can use {name} in the template."
        if action_type == ActionType.BULK_CREATE_RECORDS:
            if "object_type" in error_msg.lower():
                return "Which object should I bulk create? Use lead, contact, account, opportunity, task, or event."
            if "records" in error_msg.lower():
                return (
                    "Please provide the records to create. Example format:\n"
                    "[{\"first_name\":\"Ravi\",\"last_name\":\"Shah\",\"company\":\"Infosys\"}, "
                    "{\"first_name\":\"Sonali\",\"last_name\":\"Iyer\",\"company\":\"TCS\"}]"
                )
        if action_type == ActionType.SEND_EMAIL:
            return "Who should receive this email? Provide recipients directly, or reference a CRM record/contact."
        if action_type == ActionType.DRAFT_EMAIL:
            return "What should the draft include (recipient, subject, and body)?"
        
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
    
    async def _validate_dependencies(
        self,
        tenant_id: str,
        action_type: ActionType,
        payload: Dict[str, Any]
    ) -> tuple[bool, Optional[str]]:
        """
        Validate that related records exist in the CRM.
        Returns (is_valid, error_msg)
        """
        fields = payload.get("fields", payload) if action_type == ActionType.CREATE_RECORD else payload
        object_type = payload.get("object_type", "").lower() if action_type == ActionType.CREATE_RECORD else action_type.value.split('_')[-1]

        # 1. Contact -> Account dependency
        if object_type == "contact" or (action_type == ActionType.CREATE_RECORD and object_type == "contact"):
            account_name = fields.get("account_name") or fields.get("company")
            if account_name and account_name != "required":
                account, _ = await self._resolve_account_for_lookup(tenant_id, account_name)
                if not account:
                    return False, f"I need an existing account named '{account_name}' to link this contact to. I couldn't find this account in your CRM data. Should I create the account first, or would you like to link it to a different one?"
                
                # INJECT: Link the contact to the account by ID
                fields["account_id"] = account.get("id")
                fields["account_name"] = account.get("data", {}).get("account_name") or account.get("data", {}).get("name")

        # 2. Opportunity -> Account dependency
        if object_type == "opportunity":
            account_name = fields.get("account_name")
            if account_name and account_name != "required":
                account, _ = await self._resolve_account_for_lookup(tenant_id, account_name)
                if not account:
                    return False, f"To create an opportunity for '{account_name}', that account must first exist in the CRM. I don't see an account with that name. Shall we create it?"
                
                # INJECT: Link the opportunity to the account by ID
                fields["account_id"] = account.get("id")
                fields["account_name"] = account.get("data", {}).get("account_name") or account.get("data", {}).get("name")

        # 3. Task -> Related Record dependency
        if action_type == ActionType.CREATE_TASK:
            rel_id = fields.get("related_to")
            rel_type = fields.get("related_type")
            if rel_id and rel_type and rel_id != "required":
                rel_record, _ = await self._resolve_related_record_for_lookup(
                    tenant_id, rel_type, rel_id
                )
                if not rel_record:
                    return False, f"I can't find a {rel_type} record named or with ID '{rel_id}' to link this task to. Please check the name or provide a different record."

        return True, None
    
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
                label = item.get("label") or item.get("stage") or item.get("owner_id") or item.get("_id", "Unknown")
                value = item.get("total_value")
                if value is None:
                    value = item.get("total_revenue")
                count = item.get("count") or item.get("deal_count")
                if value is not None and count is not None:
                    lines.append(f"- **{label}**: ${float(value):,.2f} ({int(count)} records)")
                elif count is not None:
                    lines.append(f"- **{label}**: {int(count)}")
                else:
                    lines.append(f"- **{label}**")
        elif isinstance(data, dict):
            if "by_status" in data:
                lines.append("\n**By Status:**")
                for item in data["by_status"][:5]:
                    lines.append(f"- {item.get('_id', 'Unknown')}: {item.get('count', 0)}")
            if "tasks" in data:
                lines.append(f"\n- Tasks: {data['tasks']}")
                lines.append(f"- Events: {data.get('events', 0)}")
                lines.append(f"- Notes: {data.get('notes', 0)}")
            if "revenue" in data or "pipeline_value" in data:
                lines.append(f"\n- Revenue: ${float(data.get('revenue', 0)):,.2f}")
                lines.append(f"- Pipeline: ${float(data.get('pipeline_value', 0)):,.2f}")
                lines.append(f"- Leads: {int(data.get('lead_count', 0))}")
                lines.append(f"- Opportunities: {int(data.get('opportunity_count', 0))}")
                lines.append(f"- Lead Conversion: {float(data.get('lead_conversion_rate', 0)):.1f}%")
                lines.append(f"- Win Rate: {float(data.get('win_rate', 0)):.1f}%")

        if result.get("trend_statement"):
            lines.append(f"\nTrend: {result['trend_statement']}")
        if result.get("biggest_jump"):
            j = result["biggest_jump"]
            lines.append(f"Biggest jump: {j.get('from')} → {j.get('to')} ({j.get('change', 0):+,.0f})")
        if result.get("biggest_drop"):
            d = result["biggest_drop"]
            lines.append(f"Biggest drop: {d.get('from')} → {d.get('to')} ({d.get('change', 0):+,.0f})")

        exports = result.get("exports") or []
        if exports:
            labels = [e.get("label", "").strip() for e in exports if e.get("label")]
            if labels:
                lines.append(f"\nExports: {', '.join(labels)}")
        
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
                # Detect object type for insights
                obj_type = "lead"
                if result.get("insight_type") in ["stale_opportunities", "slipping_deals"]:
                    obj_type = "opportunity"
                elif result.get("insight_type") in ["at_risk_accounts"]:
                    obj_type = "account"
                elif result.get("insight_type") in ["overdue_tasks"]:
                    obj_type = "task"
                
                sid = r.get("series_id", r.get("id", ""))
                lines.append(f"{i}. **[[{name}|{obj_type}|{sid}]]**{' - ' + detail if detail else ''}")
            
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
