"""
CLU-BOT Activity MCP Service
Handles write operations: Create Lead, Add Note, Create Task, Update Record.
Implements deterministic execution through existing CRM APIs.
"""
import logging
import uuid
import re
from typing import Dict, Any, Optional, List, Tuple
from datetime import datetime, timezone, timedelta
from motor.motor_asyncio import AsyncIOMotorDatabase

from shared.models import User

from ..models import (
    ActionType, ExecutionStatus, ExecutionJournalEntry,
    CreateLeadPayload, AddNotePayload, CreateTaskPayload,
    UpdateRecordPayload, CreateListViewPayload, UpdateListViewPayload,
    BulkUpdateRecordsPayload, BulkCreateTasksPayload, BulkCreateRecordsPayload,
    SendEmailPayload, DraftEmailPayload,
)
from .crm_record_create_bridge import create_via_records_route, update_via_records_route
from shared.services.email_service import get_email_service

logger = logging.getLogger(__name__)


class ActivityMCPService:
    """
    Activity MCP - Executes write operations through existing CRM APIs.
    All operations are journaled for undo support.
    Uses the same validation as direct API calls.
    """
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db

    @staticmethod
    def _extract_primary_email_from_record(record: Dict[str, Any]) -> Optional[str]:
        data = record.get("data") or {}
        for key in ("email", "work_email", "personal_email", "primary_email", "contact_email", "billing_email"):
            value = data.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
        return None
    
    async def create_lead(
        self,
        tenant_id: str,
        user_id: str,
        current_user: User,
        payload: CreateLeadPayload,
        conversation_id: str
    ) -> Dict[str, Any]:
        """
        Create a new lead record.
        Executed through the same logic as /api/objects/lead/records POST.
        
        Returns:
            {
                "success": bool,
                "record": {...},
                "journal_entry_id": str,
                "message": str
            }
        """
        journal_entry = None
        
        try:
            # Prepare lead data — omit empty keys so records API + validation behave like the UI
            lead_data = payload.model_dump(exclude_none=True)
            lead_data = {k: v for k, v in lead_data.items() if v != ""}
            
            if "name" not in lead_data and (payload.first_name or payload.last_name):
                lead_data["name"] = (
                    f"{payload.first_name or ''} {payload.last_name or ''}".strip()
                )
            
            if not lead_data.get("status"):
                lead_data["status"] = "New"
            
            # Create journal entry for undo support
            journal_entry = await self._create_journal_entry(
                tenant_id=tenant_id,
                user_id=user_id,
                conversation_id=conversation_id,
                action_type=ActionType.CREATE_LEAD,
                action_payload=lead_data
            )
            
            api_result = await create_via_records_route(
                "lead",
                dict(lead_data),
                current_user,
            )
            if not api_result.get("success"):
                err = api_result.get("error", api_result.get("message", "Create failed"))
                await self._update_journal_entry(
                    journal_entry["id"],
                    status=ExecutionStatus.FAILED,
                    error=err,
                )
                return {
                    "success": False,
                    "error": err,
                    "message": api_result.get("message", err),
                    "journal_entry_id": journal_entry["id"],
                }
            
            record = api_result["record"]
            record_id = record.get("id")
            await self._update_journal_entry(
                journal_entry["id"],
                status=ExecutionStatus.EXECUTED,
                created_record_id=record_id,
                undo_payload={"record_id": record_id, "object_name": "lead"},
                is_undoable=True,
            )
            disp = (
                f"{lead_data.get('first_name') or ''} {lead_data.get('last_name') or ''}".strip()
                or record.get("data", {}).get("name", "Lead")
            )
            return {
                "success": True,
                "record": record,
                "journal_entry_id": journal_entry["id"],
                "message": f"Lead '{disp}' created successfully.",
            }
            
        except Exception as e:
            logger.error(f"Create lead error: {str(e)}")
            
            # Update journal entry with failure
            if journal_entry:
                await self._update_journal_entry(
                    journal_entry["id"],
                    status=ExecutionStatus.FAILED,
                    error=str(e)
                )
            
            return {
                "success": False,
                "error": str(e),
                "message": f"Failed to create lead: {str(e)}"
            }
    
    async def add_note(
        self,
        tenant_id: str,
        user_id: str,
        payload: AddNotePayload,
        conversation_id: str
    ) -> Dict[str, Any]:
        """
        Add a note to an existing record.
        
        Returns:
            {
                "success": bool,
                "note": {...},
                "journal_entry_id": str,
                "message": str
            }
        """
        journal_entry = None
        
        try:
            # Verify linked record exists
            linked_record = await self.db.object_records.find_one({
                "tenant_id": tenant_id,
                "object_name": payload.linked_entity_type.lower(),
                "$or": [
                    {"id": payload.linked_entity_id},
                    {"series_id": payload.linked_entity_id}
                ]
            }, {"_id": 0})
            
            if not linked_record:
                return {
                    "success": False,
                    "error": f"Record not found: {payload.linked_entity_id}",
                    "message": f"Cannot add note: The {payload.linked_entity_type} record was not found."
                }
            
            # Create journal entry
            journal_entry = await self._create_journal_entry(
                tenant_id=tenant_id,
                user_id=user_id,
                conversation_id=conversation_id,
                action_type=ActionType.ADD_NOTE,
                action_payload={
                    "title": payload.title,
                    "body": payload.body,
                    "linked_entity_type": payload.linked_entity_type,
                    "linked_entity_id": linked_record.get("id")
                }
            )
            
            # Generate note ID
            note_id = str(uuid.uuid4())
            now = datetime.now(timezone.utc)
            
            # Create the note document
            note = {
                "id": note_id,
                "tenant_id": tenant_id,
                "title": payload.title,
                "body_text": payload.body or "",
                "body_rich_text": payload.body or "",
                "owner_id": user_id,
                "created_by": user_id,
                "is_archived": False,
                "is_pinned": False,
                "is_deleted": False,
                "linked_records": [{
                    "entity_type": payload.linked_entity_type.lower(),
                    "entity_id": linked_record.get("id")
                }],
                "created_at": now.isoformat(),
                "updated_at": now.isoformat()
            }
            
            # Insert into database
            await self.db.notes.insert_one(note)
            
            # Update journal entry with success
            await self._update_journal_entry(
                journal_entry["id"],
                status=ExecutionStatus.EXECUTED,
                created_record_id=note_id,
                undo_payload={"note_id": note_id},
                is_undoable=True
            )
            
            # Remove _id for response
            note.pop("_id", None)
            
            return {
                "success": True,
                "note": note,
                "journal_entry_id": journal_entry["id"],
                "message": f"Note '{payload.title}' added to {payload.linked_entity_type}."
            }
            
        except Exception as e:
            logger.error(f"Add note error: {str(e)}")
            
            if journal_entry:
                await self._update_journal_entry(
                    journal_entry["id"],
                    status=ExecutionStatus.FAILED,
                    error=str(e)
                )
            
            return {
                "success": False,
                "error": str(e),
                "message": f"Failed to add note: {str(e)}"
            }
    
    async def create_task(
        self,
        tenant_id: str,
        user_id: str,
        current_user: User,
        payload: CreateTaskPayload,
        conversation_id: str
    ) -> Dict[str, Any]:
        """
        Create a new task record.
        
        Returns:
            {
                "success": bool,
                "record": {...},
                "journal_entry_id": str,
                "message": str
            }
        """
        journal_entry = None
        
        try:
            task_data = payload.model_dump(exclude_none=True)
            task_data = {k: v for k, v in task_data.items() if v != ""}
            task_data.setdefault("status", "Not Started")
            task_data.setdefault("priority", "Normal")
            if payload.related_to and payload.related_type:
                resolved = await self._resolve_record(
                    tenant_id=tenant_id,
                    object_type=payload.related_type,
                    identifier=payload.related_to,
                )
                if not resolved:
                    return {
                        "success": False,
                        "error": "Related record not found",
                        "message": f"Could not find {payload.related_type} '{payload.related_to}' to link this task.",
                    }
                related_id = resolved.get("id")
                task_data["related_to"] = related_id
                task_data["related_type"] = payload.related_type
                task_data[f"{payload.related_type}_id"] = related_id
            
            # Create journal entry
            journal_entry = await self._create_journal_entry(
                tenant_id=tenant_id,
                user_id=user_id,
                conversation_id=conversation_id,
                action_type=ActionType.CREATE_TASK,
                action_payload=task_data
            )
            
            api_result = await create_via_records_route(
                "task",
                dict(task_data),
                current_user,
            )
            if not api_result.get("success"):
                err = api_result.get("error", api_result.get("message", "Create failed"))
                await self._update_journal_entry(
                    journal_entry["id"],
                    status=ExecutionStatus.FAILED,
                    error=err,
                )
                return {
                    "success": False,
                    "error": err,
                    "message": api_result.get("message", err),
                    "journal_entry_id": journal_entry["id"],
                }
            
            record = api_result["record"]
            record_id = record.get("id")
            await self._update_journal_entry(
                journal_entry["id"],
                status=ExecutionStatus.EXECUTED,
                created_record_id=record_id,
                undo_payload={"record_id": record_id, "object_name": "task"},
                is_undoable=True,
            )
            return {
                "success": True,
                "record": record,
                "journal_entry_id": journal_entry["id"],
                "message": f"Task '{task_data.get('subject', 'Task')}' created successfully.",
            }
            
        except Exception as e:
            logger.error(f"Create task error: {str(e)}")
            
            if journal_entry:
                await self._update_journal_entry(
                    journal_entry["id"],
                    status=ExecutionStatus.FAILED,
                    error=str(e)
                )
            
            return {
                "success": False,
                "error": str(e),
                "message": f"Failed to create task: {str(e)}"
            }
    
    def _strip_empty_updates(self, raw: Dict[str, Any]) -> Dict[str, Any]:
        out: Dict[str, Any] = {}
        for k, v in (raw or {}).items():
            if v is None or v == "" or v == "required":
                continue
            out[k] = v
        return out

    async def _resolve_owner_user_id(
        self, tenant_id: str, hint: str
    ) -> Tuple[Optional[str], Optional[str]]:
        """
        Resolve a tenant user id from free text or UUID.
        Returns (user_id, warning) — warning set when multiple users match.
        """
        hint = (hint or "").strip()
        if not hint:
            return None, None
        uuid_pattern = r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
        if re.match(uuid_pattern, hint):
            return hint, None

        cursor = self.db.users.find(
            {"tenant_id": tenant_id, "is_active": True},
            {"_id": 0, "id": 1, "first_name": 1, "last_name": 1, "email": 1},
        )
        users = await cursor.to_list(length=500)
        hint_low = hint.lower()
        matches: List[Dict[str, Any]] = []

        for u in users:
            fn = (u.get("first_name") or "").strip()
            ln = (u.get("last_name") or "").strip()
            full = f"{fn} {ln}".strip().lower()
            email = (u.get("email") or "").lower()
            if not full and not email:
                continue
            if (
                full == hint_low
                or fn.lower() == hint_low
                or ln.lower() == hint_low
                or hint_low in full
                or (email and hint_low in email)
            ):
                matches.append(u)

        if not matches:
            return None, None
        if len(matches) > 1:
            # Prefer exact full-name match
            exact = [
                u
                for u in matches
                if f'{(u.get("first_name") or "").strip()} {(u.get("last_name") or "").strip()}'.strip().lower()
                == hint_low
            ]
            if len(exact) == 1:
                return exact[0].get("id"), None
            return matches[0].get("id"), (
                "Several users matched that name; using the first match. "
                "Confirm the owner or pick a user by email/ID if needed."
            )
        return matches[0].get("id"), None

    async def update_record(
        self,
        tenant_id: str,
        user_id: str,
        current_user: User,
        payload: UpdateRecordPayload,
        conversation_id: str
    ) -> Dict[str, Any]:
        """
        Update a record through update_object_record (permissions, FLS, validation, hooks).
        """
        journal_entry = None

        try:
            object_type = payload.object_type.lower()

            record = await self._resolve_record(
                tenant_id=tenant_id,
                object_type=object_type,
                identifier=payload.record_id,
            )
            if not record:
                return {
                    "success": False,
                    "error": "Record not found",
                    "message": f"Could not find {object_type} '{payload.record_id}'.",
                }

            record_id = record.get("id")
            series_key = record.get("series_id") or record_id
            current_data = dict(record.get("data") or {})

            raw_updates = dict(payload.updates or {})
            ow_id = (payload.owner_id or "").strip() or None
            ow_name = (payload.owner_name or "").strip() or None
            if not ow_id:
                oi = raw_updates.get("owner_id")
                if isinstance(oi, str) and oi.strip():
                    ow_id = oi.strip()
            if not ow_name:
                on = raw_updates.get("owner_name")
                if isinstance(on, str) and on.strip():
                    ow_name = on.strip()

            data_updates = self._strip_empty_updates(raw_updates)
            for k in list(data_updates.keys()):
                if k in ("owner_id", "owner_name", "new_owner"):
                    data_updates.pop(k, None)

            own_warn: Optional[str] = None
            if ow_id:
                resolved_ow, own_warn = await self._resolve_owner_user_id(
                    tenant_id, ow_id
                )
                ow_id = resolved_ow or ow_id
            elif ow_name:
                ow_id, own_warn = await self._resolve_owner_user_id(tenant_id, ow_name)
                if not ow_id:
                    return {
                        "success": False,
                        "error": "Owner not found",
                        "message": f"I couldn't find an active user matching '{ow_name}'.",
                    }

            if not data_updates and not ow_id:
                return {
                    "success": False,
                    "error": "Nothing to update",
                    "message": "There were no field values or owner change to apply.",
                }

            previous_values: Dict[str, Any] = {}
            for field in data_updates.keys():
                previous_values[field] = current_data.get(field)

            prev_owner_id = record.get("owner_id")
            prev_owner_type = record.get("owner_type") or "USER"

            journal_entry = await self._create_journal_entry(
                tenant_id=tenant_id,
                user_id=user_id,
                conversation_id=conversation_id,
                action_type=ActionType.UPDATE_RECORD,
                action_payload={
                    "object_type": object_type,
                    "record_id": record_id,
                    "updates": {**data_updates},
                    "owner_id": ow_id,
                },
            )

            api_result = await update_via_records_route(
                object_name=object_type,
                record_id=str(series_key),
                data=data_updates,
                current_user=current_user,
                owner_id=ow_id,
                owner_type="USER",
            )

            if not api_result.get("success"):
                err = api_result.get("error", "Update failed")
                await self._update_journal_entry(
                    journal_entry["id"],
                    status=ExecutionStatus.FAILED,
                    error=err,
                )
                return {
                    "success": False,
                    "error": err,
                    "message": api_result.get("message", err),
                    "journal_entry_id": journal_entry["id"],
                    "http_status": api_result.get("http_status"),
                }

            updated = api_result.get("record") or {}
            new_data = (updated.get("data") or {}) if isinstance(updated, dict) else {}

            field_changes: List[Dict[str, Any]] = []
            for field, new_value in data_updates.items():
                field_changes.append(
                    {
                        "field": field,
                        "old": previous_values.get(field, None),
                        "new": new_value,
                    }
                )
            if ow_id and str(ow_id) != str(prev_owner_id or ""):
                field_changes.append(
                    {
                        "field": "owner_id",
                        "old": prev_owner_id,
                        "new": ow_id,
                    }
                )

            warnings: List[str] = []
            if own_warn:
                warnings.append(own_warn)
            stage_new = new_data.get("stage") or data_updates.get("stage")
            stage_old = current_data.get("stage")
            if object_type == "opportunity" and stage_new and stage_new != stage_old:
                closed_vals = (
                    "closed won",
                    "closed lost",
                    "won",
                    "lost",
                )
                if str(stage_new).lower() in closed_vals:
                    warnings.append(
                        "Stage is now closed — verify amount, close date, and forecast category."
                    )
                else:
                    warnings.append(
                        "Optional: set or refresh **close date** and **next step** for this stage."
                    )

            updated_at = updated.get("updated_at") if isinstance(updated, dict) else None

            await self._update_journal_entry(
                journal_entry["id"],
                status=ExecutionStatus.EXECUTED,
                created_record_id=record_id,
                undo_payload={
                    "record_id": record_id,
                    "object_name": object_type,
                    "previous_values": previous_values,
                    "previous_owner_id": prev_owner_id,
                    "previous_owner_type": prev_owner_type,
                },
                is_undoable=True,
            )

            msg_parts = [
                f"Updated **{object_type}** ({series_key}):",
                *(f"- **{c['field'].replace('_', ' ').title()}**: {c['old']!r} → {c['new']!r}" for c in field_changes),
            ]
            if updated_at:
                msg_parts.append(f"\n_Updated at: {updated_at}_")
            if warnings:
                msg_parts.append("\n**Notes:**\n" + "\n".join(f"- {w}" for w in warnings))

            return {
                "success": True,
                "record": updated,
                "journal_entry_id": journal_entry["id"],
                "changes": {c["field"]: c["new"] for c in field_changes},
                "field_changes": field_changes,
                "warnings": warnings,
                "updated_at": updated_at,
                "message": "\n".join(msg_parts),
            }

        except Exception as e:
            logger.error(f"Update record error: {str(e)}")

            if journal_entry:
                await self._update_journal_entry(
                    journal_entry["id"],
                    status=ExecutionStatus.FAILED,
                    error=str(e),
                )

            return {
                "success": False,
                "error": str(e),
                "message": f"Failed to update record: {str(e)}",
            }

    @staticmethod
    def _bulk_filter_to_mongo(filters: Dict[str, Any]) -> Dict[str, Any]:
        query: Dict[str, Any] = {}
        for field, value in (filters or {}).items():
            field_key = field if field in ("id", "series_id", "owner_id", "created_at", "updated_at") else f"data.{field}"
            if isinstance(value, dict):
                cond: Dict[str, Any] = {}
                for op, op_val in value.items():
                    if op == "gt":
                        cond["$gt"] = op_val
                    elif op == "lt":
                        cond["$lt"] = op_val
                    elif op == "in":
                        cond["$in"] = op_val if isinstance(op_val, list) else [op_val]
                    elif op == "nin":
                        cond["$nin"] = op_val if isinstance(op_val, list) else [op_val]
                    elif op in ("ne", "not_equals"):
                        cond["$ne"] = op_val
                    elif op == "contains":
                        cond["$regex"] = re.escape(str(op_val))
                        cond["$options"] = "i"
                    elif op == "starts_with":
                        cond["$regex"] = f"^{re.escape(str(op_val))}"
                        cond["$options"] = "i"
                    elif op == "exists":
                        cond["$exists"] = bool(op_val)
                    elif op == "lt_days":
                        cutoff = datetime.now(timezone.utc).timestamp() - (int(op_val) * 86400)
                        cutoff_iso = datetime.fromtimestamp(cutoff, tz=timezone.utc).isoformat()
                        # For date-like string fields (created_at, updated_at, due_date, close_date), lexical compare works on ISO-like values.
                        cond["$lt"] = cutoff_iso
                if cond:
                    query[field_key] = cond
            else:
                # Use case-insensitive exact match for string filters to avoid misses
                # like "Proposal" vs "proposal" for stage/status fields.
                if isinstance(value, str):
                    exact = value.strip()
                    query[field_key] = {"$regex": f"^{re.escape(exact)}$", "$options": "i"}
                else:
                    query[field_key] = value
        return query

    @staticmethod
    def _render_template(template: str, record: Dict[str, Any]) -> str:
        data = record.get("data") or {}
        name = (
            data.get("name")
            or data.get("opportunity_name")
            or data.get("account_name")
            or f"{data.get('first_name', '')} {data.get('last_name', '')}".strip()
            or record.get("series_id")
            or "record"
        )
        return (template or "").replace("{name}", str(name))

    async def bulk_update_records(
        self,
        tenant_id: str,
        user_id: str,
        current_user: User,
        payload: BulkUpdateRecordsPayload,
        conversation_id: str,
    ) -> Dict[str, Any]:
        journal_entry = None
        try:
            object_type = (payload.object_type or "").lower().strip()
            if not object_type:
                return {"success": False, "message": "Missing object type for bulk update."}

            filters = dict(payload.filters or {})
            updates = self._strip_empty_updates(dict(payload.updates or {}))
            owner_id = (payload.owner_id or "").strip() or None
            owner_name = (payload.owner_name or "").strip() or None
            if not updates and not owner_id and not owner_name:
                return {"success": False, "message": "No updates were provided for bulk update."}

            owner_warn = None
            if not owner_id and owner_name:
                owner_id, owner_warn = await self._resolve_owner_user_id(tenant_id, owner_name)
                if not owner_id:
                    return {"success": False, "message": f"I could not find an active user matching '{owner_name}'."}

            mongo_query = {"tenant_id": tenant_id, "object_name": object_type}
            mongo_query.update(self._bulk_filter_to_mongo(filters))
            targets = await self.db.object_records.find(mongo_query, {"_id": 0}).limit(payload.limit).to_list(length=payload.limit)
            if not targets and object_type == "task":
                # Fallback: if due_date-based age filter returns none, try created_at age to avoid false negatives.
                due_age = (filters.get("due_date") or {}).get("lt_days") if isinstance(filters.get("due_date"), dict) else None
                if due_age is not None:
                    fallback_filters = dict(filters)
                    fallback_filters.pop("due_date", None)
                    fallback_filters["created_at"] = {"lt_days": due_age}
                    fallback_query = {"tenant_id": tenant_id, "object_name": object_type}
                    fallback_query.update(self._bulk_filter_to_mongo(fallback_filters))
                    targets = await self.db.object_records.find(fallback_query, {"_id": 0}).limit(payload.limit).to_list(length=payload.limit)
            if not targets:
                return {"success": False, "message": "No records matched your bulk update filters."}

            journal_entry = await self._create_journal_entry(
                tenant_id=tenant_id,
                user_id=user_id,
                conversation_id=conversation_id,
                action_type=ActionType.BULK_UPDATE_RECORDS,
                action_payload={
                    "object_type": object_type,
                    "filters": filters,
                    "updates": updates,
                    "owner_id": owner_id,
                    "limit": payload.limit,
                },
            )

            updated_count = 0
            failed: List[Dict[str, str]] = []
            previous_records: List[Dict[str, Any]] = []
            for rec in targets:
                series_key = rec.get("series_id") or rec.get("id")
                previous_records.append(
                    {
                        "record_id": rec.get("id"),
                        "object_name": object_type,
                        "previous_values": {k: (rec.get("data") or {}).get(k) for k in updates.keys()},
                        "previous_owner_id": rec.get("owner_id"),
                        "previous_owner_type": rec.get("owner_type") or "USER",
                    }
                )
                api_result = await update_via_records_route(
                    object_name=object_type,
                    record_id=str(series_key),
                    data=updates,
                    current_user=current_user,
                    owner_id=owner_id,
                    owner_type="USER" if owner_id else None,
                )
                if api_result.get("success"):
                    updated_count += 1
                else:
                    failed.append({"record": str(series_key), "error": str(api_result.get("error") or api_result.get("message") or "Update failed")})

            status = ExecutionStatus.EXECUTED if updated_count > 0 else ExecutionStatus.FAILED
            await self._update_journal_entry(
                journal_entry["id"],
                status=status,
                result={"updated_count": updated_count, "failed_count": len(failed)},
                undo_payload={"records": previous_records},
                is_undoable=True,
            )

            msg = f"Bulk update finished: updated {updated_count}/{len(targets)} {object_type} records."
            if owner_warn:
                msg += f" Note: {owner_warn}"
            if failed:
                msg += f" {len(failed)} failed."
            return {
                "success": updated_count > 0,
                "updated_count": updated_count,
                "matched_count": len(targets),
                "failed": failed[:20],
                "journal_entry_id": journal_entry["id"] if journal_entry else None,
                "message": msg,
            }
        except Exception as e:
            logger.error(f"Bulk update error: {str(e)}")
            if journal_entry:
                await self._update_journal_entry(journal_entry["id"], status=ExecutionStatus.FAILED, error=str(e), is_undoable=False)
            return {"success": False, "error": str(e), "message": f"Failed bulk update: {str(e)}"}

    async def bulk_create_tasks(
        self,
        tenant_id: str,
        user_id: str,
        current_user: User,
        payload: BulkCreateTasksPayload,
        conversation_id: str,
    ) -> Dict[str, Any]:
        journal_entry = None
        try:
            target_object_type = (payload.target_object_type or "").lower().strip()
            if not target_object_type:
                return {"success": False, "message": "Missing target object for bulk task creation."}

            assigned_to = (payload.assigned_to or "").strip() or None
            owner_name = (payload.owner_name or "").strip() or None
            if not assigned_to and owner_name:
                assigned_to, _ = await self._resolve_owner_user_id(tenant_id, owner_name)
                if not assigned_to:
                    return {"success": False, "message": f"I could not find an active user matching '{owner_name}'."}

            mongo_query = {"tenant_id": tenant_id, "object_name": target_object_type}
            mongo_query.update(self._bulk_filter_to_mongo(dict(payload.target_filters or {})))
            targets = await self.db.object_records.find(mongo_query, {"_id": 0}).limit(payload.limit).to_list(length=payload.limit)
            if not targets:
                return {"success": False, "message": "No records matched your bulk task filters."}

            journal_entry = await self._create_journal_entry(
                tenant_id=tenant_id,
                user_id=user_id,
                conversation_id=conversation_id,
                action_type=ActionType.BULK_CREATE_TASKS,
                action_payload={
                    "target_object_type": target_object_type,
                    "target_filters": payload.target_filters,
                    "subject_template": payload.subject_template,
                    "limit": payload.limit,
                },
            )

            created = 0
            failed: List[Dict[str, str]] = []
            created_ids: List[str] = []
            for rec in targets:
                subject = self._render_template(payload.subject_template, rec)
                task_data: Dict[str, Any] = {
                    "subject": subject,
                    "status": payload.status,
                    "priority": payload.priority,
                    "related_to": rec.get("id"),
                    "related_type": target_object_type,
                }
                if payload.description_template:
                    task_data["description"] = self._render_template(payload.description_template, rec)
                if payload.due_date:
                    task_data["due_date"] = payload.due_date
                if assigned_to:
                    task_data["assigned_to"] = assigned_to

                api_result = await create_via_records_route("task", task_data, current_user)
                if api_result.get("success"):
                    created += 1
                    rid = (api_result.get("record") or {}).get("id")
                    if rid:
                        created_ids.append(str(rid))
                else:
                    failed.append({"record": str(rec.get("series_id") or rec.get("id")), "error": str(api_result.get("error") or api_result.get("message") or "Create failed")})

            status = ExecutionStatus.EXECUTED if created > 0 else ExecutionStatus.FAILED
            await self._update_journal_entry(
                journal_entry["id"],
                status=status,
                result={"created_count": created, "failed_count": len(failed)},
                undo_payload={"record_ids": created_ids, "object_name": "task"},
                is_undoable=True,
            )

            return {
                "success": created > 0,
                "created_count": created,
                "matched_count": len(targets),
                "failed": failed[:20],
                "journal_entry_id": journal_entry["id"] if journal_entry else None,
                "message": f"Bulk task creation finished: created {created}/{len(targets)} tasks.",
            }
        except Exception as e:
            logger.error(f"Bulk create tasks error: {str(e)}")
            if journal_entry:
                await self._update_journal_entry(journal_entry["id"], status=ExecutionStatus.FAILED, error=str(e), is_undoable=False)
            return {"success": False, "error": str(e), "message": f"Failed bulk task creation: {str(e)}"}

    async def bulk_create_records(
        self,
        tenant_id: str,
        user_id: str,
        current_user: User,
        payload: BulkCreateRecordsPayload,
        conversation_id: str,
    ) -> Dict[str, Any]:
        journal_entry = None
        try:
            object_type = (payload.object_type or "").lower().strip()
            if not object_type:
                return {"success": False, "message": "Missing object type for bulk create."}
            if not payload.records:
                return {"success": False, "message": "No records were provided for bulk create."}

            records = list(payload.records)[: payload.limit]
            journal_entry = await self._create_journal_entry(
                tenant_id=tenant_id,
                user_id=user_id,
                conversation_id=conversation_id,
                action_type=ActionType.BULK_CREATE_RECORDS,
                action_payload={"object_type": object_type, "records_count": len(records), "limit": payload.limit},
            )

            created = 0
            failed: List[Dict[str, str]] = []
            created_ids: List[str] = []

            for raw in records:
                rec = {k: v for k, v in dict(raw).items() if v not in (None, "", "required")}
                if "name" not in rec:
                    if object_type in ("lead", "contact"):
                        rec["name"] = f"{rec.get('first_name', '')} {rec.get('last_name', '')}".strip() or rec.get("email")
                    elif object_type == "account":
                        rec["name"] = rec.get("account_name")
                    elif object_type == "opportunity":
                        rec["name"] = rec.get("opportunity_name")
                api_result = await create_via_records_route(object_type, rec, current_user)
                if api_result.get("success"):
                    created += 1
                    rid = (api_result.get("record") or {}).get("id")
                    if rid:
                        created_ids.append(str(rid))
                else:
                    failed.append({"record": str(rec.get("name") or rec.get("email") or "unknown"), "error": str(api_result.get("error") or api_result.get("message") or "Create failed")})

            status = ExecutionStatus.EXECUTED if created > 0 else ExecutionStatus.FAILED
            await self._update_journal_entry(
                journal_entry["id"],
                status=status,
                result={"created_count": created, "failed_count": len(failed)},
                undo_payload={"record_ids": created_ids, "object_name": object_type},
                is_undoable=True,
            )
            return {
                "success": created > 0,
                "created_count": created,
                "requested_count": len(records),
                "failed": failed[:20],
                "journal_entry_id": journal_entry["id"] if journal_entry else None,
                "message": f"Bulk create finished: created {created}/{len(records)} {object_type} record(s).",
            }
        except Exception as e:
            logger.error(f"Bulk create records error: {str(e)}")
            if journal_entry:
                await self._update_journal_entry(journal_entry["id"], status=ExecutionStatus.FAILED, error=str(e), is_undoable=False)
            return {"success": False, "error": str(e), "message": f"Failed bulk create: {str(e)}"}

    async def send_email_action(
        self,
        tenant_id: str,
        user_id: str,
        current_user: User,
        payload: SendEmailPayload,
        conversation_id: str,
    ) -> Dict[str, Any]:
        journal_entry = None
        try:
            to_emails = list(payload.to_emails or [])
            cc_emails = list(payload.cc_emails or [])
            bcc_emails = list(payload.bcc_emails or [])
            related_record_type = payload.related_record_type
            related_record_id = payload.related_record_id

            if payload.email_all_open_opportunity_owners:
                open_q = {
                    "tenant_id": tenant_id,
                    "object_name": "opportunity",
                    "data.stage": {"$nin": ["Won", "Lost", "Closed Won", "Closed Lost"]},
                    "data.status": {"$nin": ["Won", "Lost", "Closed Won", "Closed Lost"]},
                }
                opps = await self.db.object_records.find(open_q, {"_id": 0, "owner_id": 1, "data": 1}).limit(500).to_list(length=500)
                owner_ids = sorted({str(o.get("owner_id")) for o in opps if o.get("owner_id")})
                if owner_ids:
                    users = await self.db.users.find(
                        {"tenant_id": tenant_id, "id": {"$in": owner_ids}, "is_active": True},
                        {"_id": 0, "email": 1},
                    ).to_list(length=500)
                    to_emails.extend([u.get("email") for u in users if u.get("email")])
                if payload.include_next_steps and not payload.body:
                    lines = ["Open opportunities and next steps:"]
                    for o in opps[:30]:
                        d = o.get("data") or {}
                        name = d.get("opportunity_name") or d.get("name") or "Opportunity"
                        step = d.get("next_step") or "No next step"
                        lines.append(f"- {name}: {step}")
                    payload.body = "\n".join(lines)

            if related_record_type and related_record_id:
                related = await self._resolve_record(tenant_id, related_record_type, related_record_id)
                if not related:
                    return {"success": False, "message": f"Could not find {related_record_type} '{related_record_id}' for email."}
                related_record_id = related.get("id")
                related_record_type = related_record_type.lower()
                if payload.send_to_owner:
                    owner_id = related.get("owner_id")
                    if owner_id:
                        owner_user = await self.db.users.find_one(
                            {"tenant_id": tenant_id, "id": str(owner_id), "is_active": True},
                            {"_id": 0, "email": 1},
                        )
                        if owner_user and owner_user.get("email"):
                            to_emails.append(owner_user["email"])
                else:
                    primary_email = self._extract_primary_email_from_record(related)
                    if primary_email:
                        to_emails.append(primary_email)

            to_emails = sorted({e.strip().lower() for e in to_emails if isinstance(e, str) and e.strip()})
            cc_emails = sorted({e.strip().lower() for e in cc_emails if isinstance(e, str) and e.strip()})
            bcc_emails = sorted({e.strip().lower() for e in bcc_emails if isinstance(e, str) and e.strip()})
            if not to_emails:
                return {"success": False, "message": "No recipients found for email."}

            subject = (payload.subject or "CRM Follow-up").strip()
            body = (payload.body or "Hello,\n\nPlease see this CRM update.\n\nRegards,").strip()

            journal_entry = await self._create_journal_entry(
                tenant_id=tenant_id,
                user_id=user_id,
                conversation_id=conversation_id,
                action_type=ActionType.SEND_EMAIL,
                action_payload={"to_emails": to_emails, "subject": subject, "related_record_id": related_record_id, "related_record_type": related_record_type},
            )

            email_service = get_email_service(self.db)
            first_to = to_emails[0]
            send_result = await email_service.send_email(
                to_email=first_to,
                subject=subject,
                html_content=body,
                plain_text=body,
                email_type="clu_bot",
                metadata={"source": "clu_bot"},
                cc=cc_emails,
                bcc=bcc_emails,
                attachments=[],
            )
            if len(to_emails) > 1:
                for extra_to in to_emails[1:]:
                    await email_service.send_email(
                        to_email=extra_to,
                        subject=subject,
                        html_content=body,
                        plain_text=body,
                        email_type="clu_bot",
                        metadata={"source": "clu_bot", "batch": True},
                        cc=[],
                        bcc=[],
                        attachments=[],
                    )

            if send_result.get("status") == "failed":
                await self._update_journal_entry(journal_entry["id"], status=ExecutionStatus.FAILED, error=send_result.get("error") or "Failed to send email")
                return {"success": False, "message": send_result.get("error") or "Failed to send email"}

            email_log = {
                "id": str(uuid.uuid4()),
                "tenant_id": tenant_id,
                "user_id": user_id,
                "to_email": ", ".join(to_emails),
                "cc_email": ", ".join(cc_emails) if cc_emails else None,
                "bcc_email": ", ".join(bcc_emails) if bcc_emails else None,
                "subject": subject,
                "body": body,
                "related_record_id": related_record_id,
                "related_record_type": related_record_type,
                "attachments": [],
                "status": send_result.get("status", "sent"),
                "message_id": send_result.get("message_id"),
                "sent_at": datetime.now(timezone.utc),
                "created_at": datetime.now(timezone.utc),
            }
            await self.db.email_logs.insert_one(email_log)
            if related_record_id and related_record_type:
                activity = {
                    "id": str(uuid.uuid4()),
                    "tenant_id": tenant_id,
                    "record_type": related_record_type,
                    "record_id": related_record_id,
                    "type": "email",
                    "status": "completed",
                    "subject": email_log.get("subject", "(No Subject)"),
                    "description": f"To: {email_log.get('to_email')}",
                    "activity_date": email_log.get("sent_at") or datetime.now(timezone.utc),
                    "created_by": user_id,
                    "created_at": datetime.now(timezone.utc),
                    "updated_at": datetime.now(timezone.utc),
                }
                await self.db.crm_activities.insert_one(activity)
            await self._update_journal_entry(journal_entry["id"], status=ExecutionStatus.EXECUTED, result={"email_id": email_log["id"]}, is_undoable=False)
            return {"success": True, "email_id": email_log["id"], "recipients": to_emails, "message": f"Email sent to {len(to_emails)} recipient(s)."}
        except Exception as e:
            logger.error(f"Send email action error: {str(e)}")
            if journal_entry:
                await self._update_journal_entry(journal_entry["id"], status=ExecutionStatus.FAILED, error=str(e))
            return {"success": False, "message": f"Failed to send email: {str(e)}"}

    async def draft_email_action(
        self,
        tenant_id: str,
        user_id: str,
        payload: DraftEmailPayload,
        conversation_id: str,
    ) -> Dict[str, Any]:
        journal_entry = None
        try:
            to_emails = list(payload.to_emails or [])
            related_record_type = payload.related_record_type
            related_record_id = payload.related_record_id
            if related_record_type and related_record_id:
                related = await self._resolve_record(tenant_id, related_record_type, related_record_id)
                if related:
                    related_record_id = related.get("id")
                    if payload.send_to_owner:
                        owner_id = related.get("owner_id")
                        if owner_id:
                            owner_user = await self.db.users.find_one(
                                {"tenant_id": tenant_id, "id": str(owner_id), "is_active": True},
                                {"_id": 0, "email": 1},
                            )
                            if owner_user and owner_user.get("email"):
                                to_emails.append(owner_user["email"])
                    else:
                        e = self._extract_primary_email_from_record(related)
                        if e:
                            to_emails.append(e)

            to_email = ", ".join(sorted({e.strip().lower() for e in to_emails if isinstance(e, str) and e.strip()}))
            draft_doc = {
                "id": str(uuid.uuid4()),
                "tenant_id": tenant_id,
                "user_id": user_id,
                "to_email": to_email,
                "cc_email": ", ".join(payload.cc_emails or []) if payload.cc_emails else None,
                "bcc_email": ", ".join(payload.bcc_emails or []) if payload.bcc_emails else None,
                "subject": payload.subject or "CRM Draft",
                "body": payload.body or "",
                "related_record_id": related_record_id,
                "related_record_type": related_record_type,
                "status": "draft",
                "attachments": [],
                "created_at": datetime.now(timezone.utc),
                "updated_at": datetime.now(timezone.utc),
            }

            journal_entry = await self._create_journal_entry(
                tenant_id=tenant_id,
                user_id=user_id,
                conversation_id=conversation_id,
                action_type=ActionType.DRAFT_EMAIL,
                action_payload={"to_email": to_email, "subject": draft_doc["subject"]},
            )
            await self.db.email_drafts.insert_one(draft_doc)
            await self._update_journal_entry(
                journal_entry["id"],
                status=ExecutionStatus.EXECUTED,
                created_record_id=draft_doc["id"],
                undo_payload={"draft_id": draft_doc["id"]},
                is_undoable=True,
            )
            return {"success": True, "draft_id": draft_doc["id"], "message": "Email draft saved successfully."}
        except Exception as e:
            logger.error(f"Draft email action error: {str(e)}")
            if journal_entry:
                await self._update_journal_entry(journal_entry["id"], status=ExecutionStatus.FAILED, error=str(e))
            return {"success": False, "message": f"Failed to save draft: {str(e)}"}

    @staticmethod
    def _relative_period_to_regex(token: str) -> Optional[str]:
        """
        Convert relative date token into a regex pattern over ISO date strings.
        This keeps list-view filtering compatible with the records module's regex
        behavior while supporting tokens like this_month from CLU-BOT.
        """
        t = (token or "").strip().lower()
        if not t:
            return None

        now = datetime.now(timezone.utc)
        today = now.date()

        def month_pattern(y: int, m: int) -> str:
            return f"^{y:04d}-{m:02d}-"

        if t in ("this_month", "last_month", "next_month"):
            year, month = today.year, today.month
            if t == "last_month":
                month -= 1
                if month == 0:
                    month = 12
                    year -= 1
            elif t == "next_month":
                month += 1
                if month == 13:
                    month = 1
                    year += 1
            return month_pattern(year, month)

        if t in ("this_year", "last_year", "next_year"):
            year = today.year + (-1 if t == "last_year" else 1 if t == "next_year" else 0)
            return f"^{year:04d}-"

        if t in ("this_week", "last_week", "next_week"):
            start = today - timedelta(days=today.weekday())
            if t == "last_week":
                start -= timedelta(days=7)
            elif t == "next_week":
                start += timedelta(days=7)
            days = [(start + timedelta(days=i)).isoformat() for i in range(7)]
            return "^(?:" + "|".join(re.escape(d) for d in days) + ")"

        if t in ("this_quarter", "last_quarter", "next_quarter"):
            q = (today.month - 1) // 3 + 1
            year = today.year
            if t == "last_quarter":
                q -= 1
                if q == 0:
                    q = 4
                    year -= 1
            elif t == "next_quarter":
                q += 1
                if q == 5:
                    q = 1
                    year += 1
            months = [(q - 1) * 3 + 1, (q - 1) * 3 + 2, (q - 1) * 3 + 3]
            month_patterns = [f"{year:04d}-{m:02d}-" for m in months]
            return "^(?:" + "|".join(re.escape(mp) for mp in month_patterns) + ")"

        return None

    @staticmethod
    def _is_date_like_filter_field(field_name: str) -> bool:
        f = (field_name or "").strip().lower()
        return f.endswith("_date") or f in {"created_at", "updated_at", "close_date", "due_date"}

    @staticmethod
    def _list_view_filters_to_filter_criteria(
        filters: list,
    ) -> Dict[str, Any]:
        """
        Same shape as GET /api/list-views expects: filter_criteria[field] = {condition, value}.
        See records_routes list_view_filters handling and list_view_routes create.
        """
        criteria: Dict[str, Any] = {}
        op_map = {
            "equals": "equals",
            "not_equals": "not_equals",
            "contains": "contains",
            "starts_with": "starts_with",
            "ends_with": "ends_with",
            "greater_than": "equals",
            "less_than": "equals",
            "is_empty": "is_empty",
            "is_not_empty": "is_not_empty",
        }
        for filter_cond in filters or []:
            field = (filter_cond.field or "").strip()
            if not field:
                continue
            raw_op = (filter_cond.operator or "equals").strip().lower()
            condition = op_map.get(raw_op, "equals")
            val = filter_cond.value
            if condition in ("is_empty", "is_not_empty"):
                criteria[field] = {"condition": condition, "value": val if val is not None else ""}
                continue
            if val is None or val == "":
                continue
            # Handle relative date tokens (e.g., this_month) inside CLU-BOT only.
            # We rewrite them to regex and use contains so records module can apply them.
            if condition == "equals" and isinstance(val, str) and ActivityMCPService._is_date_like_filter_field(field):
                rel_regex = ActivityMCPService._relative_period_to_regex(val)
                if rel_regex:
                    criteria[field] = {"condition": "contains", "value": rel_regex}
                    continue
            criteria[field] = {"condition": condition, "value": val}
        return criteria
    
    async def create_list_view(
        self,
        tenant_id: str,
        user_id: str,
        payload: CreateListViewPayload,
        conversation_id: str
    ) -> Dict[str, Any]:
        """
        Create a list view in **user_list_views** (same collection as /api/list-views).
        CLU-BOT previously wrote to **list_views**, which the UI never reads.
        """
        journal_entry = None
        
        try:
            object_type = payload.object_type.lower()

            # Relationship filters in list views often come from NL like:
            # - "opportunities for Google account" (account_name)
            # - "contacts for John Doe" (contact_name)
            # But data is frequently stored as <entity>_id lookups. If we filter on *_name, the
            # view can show zero rows even though matching records exist.
            #
            # Convert supported "*_name" relationship filters -> "*_id" by resolving the referenced
            # record and using an OR-regex of (id|series_id) that the list-view filter engine supports.
            if payload.filters:
                # Map: incoming filter field -> (lookup_object_name, id_field_to_filter)
                lookup_map = {
                    "account_name": ("account", "account_id"),
                    "account": ("account", "account_id"),
                    "contact_name": ("contact", "contact_id"),
                    "contact": ("contact", "contact_id"),
                    "lead_name": ("lead", "lead_id"),
                    "lead": ("lead", "lead_id"),
                    "opportunity_name": ("opportunity", "opportunity_id"),
                    "opportunity": ("opportunity", "opportunity_id"),
                    "owner_name": ("user", "owner_id"),
                    "owner": ("user", "owner_id"),
                }

                normalized_filters: List[Any] = list(payload.filters or [])
                for idx, f in enumerate(list(normalized_filters)):
                    try:
                        raw_field = (getattr(f, "field", None) or "").strip()
                        field_l = raw_field.lower()
                        op = (getattr(f, "operator", None) or "equals").strip().lower()
                        val = getattr(f, "value", None)
                    except Exception:
                        continue

                    if not raw_field:
                        continue
                    if val is None or str(val).strip() == "":
                        continue

                    # If already filtering on an id field, leave it alone.
                    if field_l.endswith("_id"):
                        continue

                    # Detect the lookup target based on known field aliases
                    lookup_target = lookup_map.get(field_l)
                    if not lookup_target and field_l.endswith("_name"):
                        base = field_l[: -len("_name")]
                        # Only attempt safe built-ins (avoid guessing custom objects)
                        if base in ("account", "contact", "lead", "opportunity", "owner", "user"):
                            lookup_target = lookup_map.get(field_l)
                    if not lookup_target:
                        continue

                    lookup_object, id_field = lookup_target
                    raw_identifier = str(val).strip()

                    # Resolve referenced record by name/series/id.
                    rec = await self._resolve_record(tenant_id, lookup_object, raw_identifier)
                    if not rec:
                        continue

                    rid = str(rec.get("id") or "").strip()
                    rseries = str(rec.get("series_id") or "").strip()
                    if not rid and not rseries:
                        continue

                    parts = []
                    if rid:
                        parts.append(re.escape(rid))
                    if rseries:
                        parts.append(re.escape(rseries))
                    regex_value = "(?:" + "|".join(parts) + ")"

                    # Replace with *_id equals (id|series) regex
                    f.field = id_field
                    f.operator = "equals" if op in ("equals", "contains", "starts_with", "ends_with") else op
                    f.value = regex_value
                    normalized_filters[idx] = f

                payload.filters = normalized_filters
            
            # Create journal entry
            journal_entry = await self._create_journal_entry(
                tenant_id=tenant_id,
                user_id=user_id,
                conversation_id=conversation_id,
                action_type=ActionType.CREATE_LIST_VIEW,
                action_payload={
                    "object_type": object_type,
                    "name": payload.name,
                    "filters": [f.model_dump() for f in payload.filters] if payload.filters else []
                }
            )
            
            list_view_id = str(uuid.uuid4())
            now = datetime.now(timezone.utc)
            
            filter_criteria = self._list_view_filters_to_filter_criteria(
                list(payload.filters or [])
            )
            
            filter_conditions: List[Dict[str, Any]] = [
                {
                    "field": filter_cond.field,
                    "operator": filter_cond.operator,
                    "value": filter_cond.value,
                }
                for filter_cond in (payload.filters or [])
            ]
            
            list_view_doc: Dict[str, Any] = {
                "id": list_view_id,
                "user_id": user_id,
                "tenant_id": tenant_id,
                "object_name": object_type,
                "name": payload.name,
                "filter_criteria": filter_criteria,
                "columns": list(payload.columns or []),
                "sort_field": payload.sort_field,
                "sort_order": payload.sort_order or "desc",
                "visibility": payload.visibility or "private",
                "is_pinned": False,
                "is_default": bool(payload.is_default),
                "loading_mode": "pagination",
                "page_size": 20,
                "created_at": now.isoformat(),
            }

            if list_view_doc["is_default"]:
                await self.db.user_list_views.update_many(
                    {
                        "tenant_id": tenant_id,
                        "user_id": user_id,
                        "object_name": object_type,
                        "is_default": True,
                    },
                    {"$set": {"is_default": False}},
                )
            
            await self.db.user_list_views.insert_one(list_view_doc)
            
            await self._update_journal_entry(
                journal_entry["id"],
                status=ExecutionStatus.EXECUTED,
                created_record_id=list_view_id,
                undo_payload={"list_view_id": list_view_id},
                is_undoable=True
            )
            
            list_view_doc.pop("_id", None)
            
            filter_desc = ""
            if filter_conditions:
                logic = (payload.filter_logic or "AND").upper()
                parts = [
                    f"{fc['field']} {fc['operator']} {fc['value']}"
                    for fc in filter_conditions
                ]
                filter_desc = f" with filters ({logic}): " + "; ".join(parts)
            
            plural_map = {
                "opportunity": "opportunities",
                "company": "companies",
                "activity": "activities",
                "category": "categories",
                "inventory": "inventory",
                "history": "histories",
            }
            plural_object = plural_map.get(object_type.lower(), f"{object_type}s")

            return {
                "success": True,
                "list_view": list_view_doc,
                "journal_entry_id": journal_entry["id"],
                "message": f"List view '{payload.name}' created for {plural_object}{filter_desc}. Open the **{object_type}** list in the CRM and pick it from the list view dropdown.",
            }
            
        except Exception as e:
            logger.error(f"Create list view error: {str(e)}")
            
            if journal_entry:
                await self._update_journal_entry(
                    journal_entry["id"],
                    status=ExecutionStatus.FAILED,
                    error=str(e)
                )
            
            return {
                "success": False,
                "error": str(e),
                "message": f"Failed to create list view: {str(e)}"
            }

    async def _resolve_list_view(
        self,
        tenant_id: str,
        user_id: str,
        list_view_id: Optional[str] = None,
        object_type: Optional[str] = None,
        current_name: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        base = {"tenant_id": tenant_id, "user_id": user_id}
        if list_view_id:
            return await self.db.user_list_views.find_one(
                {**base, "id": str(list_view_id)},
                {"_id": 0},
            )
        if current_name:
            query: Dict[str, Any] = {
                **base,
                "name": {"$regex": f"^{re.escape(current_name.strip())}$", "$options": "i"},
            }
            if object_type:
                query["object_name"] = object_type.lower()
            return await self.db.user_list_views.find_one(
                query,
                {"_id": 0},
                sort=[("created_at", -1)],
            )
        return None

    async def update_list_view(
        self,
        tenant_id: str,
        user_id: str,
        payload: UpdateListViewPayload,
        conversation_id: str,
    ) -> Dict[str, Any]:
        """Update an existing list view owned by the user."""
        journal_entry = None
        try:
            target = await self._resolve_list_view(
                tenant_id=tenant_id,
                user_id=user_id,
                list_view_id=payload.list_view_id,
                object_type=payload.object_type,
                current_name=payload.current_name,
            )
            if not target:
                label = payload.current_name or payload.list_view_id or "that list view"
                return {
                    "success": False,
                    "message": f"I couldn't find {label}. Please share the exact list view name or ID.",
                }

            update_data: Dict[str, Any] = {}
            if payload.name is not None and payload.name.strip():
                update_data["name"] = payload.name.strip()
            if payload.description is not None:
                update_data["description"] = payload.description
            if payload.filters is not None:
                update_data["filter_criteria"] = self._list_view_filters_to_filter_criteria(
                    list(payload.filters or [])
                )
            if payload.columns is not None:
                update_data["columns"] = list(payload.columns)
            if payload.sort_field is not None:
                update_data["sort_field"] = payload.sort_field
            if payload.sort_order is not None:
                update_data["sort_order"] = payload.sort_order
            if payload.visibility is not None:
                update_data["visibility"] = payload.visibility
            if payload.is_default is not None:
                update_data["is_default"] = bool(payload.is_default)

            if not update_data:
                return {
                    "success": False,
                    "message": "Please tell me what to change: name, filters, columns, sort, visibility, or default.",
                }

            journal_entry = await self._create_journal_entry(
                tenant_id=tenant_id,
                user_id=user_id,
                conversation_id=conversation_id,
                action_type=ActionType.UPDATE_LIST_VIEW,
                action_payload={
                    "list_view_id": target.get("id"),
                    "current_name": target.get("name"),
                    "updates": update_data,
                },
            )

            if update_data.get("is_default") is True:
                await self.db.user_list_views.update_many(
                    {
                        "tenant_id": tenant_id,
                        "user_id": user_id,
                        "object_name": target.get("object_name"),
                        "is_default": True,
                        "id": {"$ne": target.get("id")},
                    },
                    {"$set": {"is_default": False}},
                )

            update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
            await self.db.user_list_views.update_one(
                {"id": target.get("id"), "tenant_id": tenant_id, "user_id": user_id},
                {"$set": update_data},
            )
            updated = await self.db.user_list_views.find_one(
                {"id": target.get("id"), "tenant_id": tenant_id, "user_id": user_id},
                {"_id": 0},
            )

            await self._update_journal_entry(
                journal_entry["id"],
                status=ExecutionStatus.EXECUTED,
                created_record_id=target.get("id"),
                undo_payload={
                    "list_view_id": target.get("id"),
                    "previous_values": {
                        "name": target.get("name"),
                        "description": target.get("description"),
                        "filter_criteria": target.get("filter_criteria"),
                        "columns": target.get("columns"),
                        "sort_field": target.get("sort_field"),
                        "sort_order": target.get("sort_order"),
                        "visibility": target.get("visibility"),
                        "is_default": target.get("is_default", False),
                    },
                    "object_name": target.get("object_name"),
                },
                is_undoable=True,
            )

            return {
                "success": True,
                "list_view": updated,
                "journal_entry_id": journal_entry["id"],
                "message": f"List view '{updated.get('name', target.get('name', 'list view'))}' updated successfully.",
            }
        except Exception as e:
            logger.error(f"Update list view error: {str(e)}")
            if journal_entry:
                await self._update_journal_entry(
                    journal_entry["id"],
                    status=ExecutionStatus.FAILED,
                    error=str(e),
                )
            return {
                "success": False,
                "error": str(e),
                "message": f"Failed to update list view: {str(e)}",
            }
    
    async def create_record(
        self,
        tenant_id: str,
        user_id: str,
        current_user: User,
        payload: Any, # CreateRecordPayload
        conversation_id: str
    ) -> Dict[str, Any]:
        """
        Create a new generic record (contact, account, opportunity).
        """
        journal_entry = None
        try:
            object_name = payload.object_type.lower()
            fields = {
                k: v
                for k, v in dict(payload.fields).items()
                if v not in (None, "", "required")
            }
            
            # Auto-set 'name' if not present for common objects
            if "name" not in fields:
                if object_name in ["contact", "lead"]:
                    fields["name"] = f"{fields.get('first_name', '')} {fields.get('last_name', '')}".strip()
                elif object_name == "account":
                    fields["name"] = fields.get("account_name")
                elif object_name == "opportunity":
                    fields["name"] = fields.get("opportunity_name")
            
            # Create journal entry
            journal_entry = await self._create_journal_entry(
                tenant_id=tenant_id,
                user_id=user_id,
                conversation_id=conversation_id,
                action_type=ActionType.CREATE_RECORD,
                action_payload={"object_type": object_name, "fields": fields}
            )
            
            api_result = await create_via_records_route(
                object_name,
                fields,
                current_user,
            )
            if not api_result.get("success"):
                err = api_result.get("error", api_result.get("message", "Create failed"))
                await self._update_journal_entry(
                    journal_entry["id"],
                    status=ExecutionStatus.FAILED,
                    error=err,
                )
                return {
                    "success": False,
                    "error": err,
                    "message": api_result.get("message", err),
                    "journal_entry_id": journal_entry["id"],
                }
            
            record = api_result["record"]
            record_id = record.get("id")
            await self._update_journal_entry(
                journal_entry["id"],
                status=ExecutionStatus.EXECUTED,
                created_record_id=record_id,
                undo_payload={"record_id": record_id, "object_name": object_name},
                is_undoable=True,
            )
            return {
                "success": True,
                "record": record,
                "journal_entry_id": journal_entry["id"],
                "message": f"{object_name.title()} created successfully.",
            }
        except Exception as e:
            logger.error(f"Create record error: {str(e)}")
            if journal_entry:
                await self._update_journal_entry(journal_entry["id"], status=ExecutionStatus.FAILED, error=str(e))
            return {"success": False, "error": str(e), "message": f"Failed to create {payload.object_type}: {str(e)}"}

    async def undo_action(
        self,
        tenant_id: str,
        user_id: str,
        journal_entry_id: str
    ) -> Dict[str, Any]:
        """
        Undo a previously executed action.
        
        Returns:
            {
                "success": bool,
                "message": str
            }
        """
        try:
            # Get journal entry
            entry = await self.db.clu_bot_execution_journal.find_one({
                "id": journal_entry_id,
                "tenant_id": tenant_id,
                "user_id": user_id
            }, {"_id": 0})
            
            if not entry:
                return {
                    "success": False,
                    "message": "Undo entry not found."
                }
            
            if not entry.get("is_undoable"):
                return {
                    "success": False,
                    "message": "This action cannot be undone."
                }
            
            if entry.get("status") == ExecutionStatus.ROLLED_BACK.value:
                return {
                    "success": False,
                    "message": "This action has already been undone."
                }
            
            undo_payload = entry.get("undo_payload", {})
            action_type = entry.get("action_type")
            
            # Execute undo based on action type
            if action_type in [ActionType.CREATE_LEAD.value, ActionType.CREATE_TASK.value, ActionType.CREATE_RECORD.value]:
                record_id = undo_payload.get("record_id")
                object_name = undo_payload.get("object_name")
                
                if record_id and object_name:
                    await self.db.object_records.delete_one({
                        "id": record_id,
                        "tenant_id": tenant_id,
                        "object_name": object_name
                    })
            
            elif action_type == ActionType.ADD_NOTE.value:
                note_id = undo_payload.get("note_id")
                if note_id:
                    await self.db.notes.delete_one({
                        "id": note_id,
                        "tenant_id": tenant_id
                    })
            
            # Phase 2A: Undo record update by restoring previous values
            elif action_type == ActionType.UPDATE_RECORD.value:
                record_id = undo_payload.get("record_id")
                object_name = undo_payload.get("object_name")
                previous_values = undo_payload.get("previous_values", {})
                previous_owner_id = undo_payload.get("previous_owner_id")
                previous_owner_type = undo_payload.get("previous_owner_type") or "USER"

                if record_id and object_name:
                    update_data: Dict[str, Any] = {}
                    for field, value in (previous_values or {}).items():
                        if value is None:
                            update_data[f"data.{field}"] = None
                        else:
                            update_data[f"data.{field}"] = value

                    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
                    if previous_owner_id is not None:
                        update_data["owner_id"] = previous_owner_id
                        update_data["owner_type"] = previous_owner_type

                    await self.db.object_records.update_one(
                        {
                            "id": record_id,
                            "tenant_id": tenant_id,
                            "object_name": object_name,
                        },
                        {"$set": update_data},
                    )
            
            # Phase 2A: Undo list view creation by deleting it
            elif action_type == ActionType.CREATE_LIST_VIEW.value:
                list_view_id = undo_payload.get("list_view_id")
                if list_view_id:
                    await self.db.user_list_views.delete_one({
                        "id": list_view_id,
                        "tenant_id": tenant_id,
                        "user_id": user_id,
                    })

            # Phase 2A: Undo list view update by restoring previous values
            elif action_type == ActionType.UPDATE_LIST_VIEW.value:
                list_view_id = undo_payload.get("list_view_id")
                previous_values = undo_payload.get("previous_values", {}) or {}
                object_name = undo_payload.get("object_name")
                if list_view_id:
                    if previous_values.get("is_default") is True and object_name:
                        await self.db.user_list_views.update_many(
                            {
                                "tenant_id": tenant_id,
                                "user_id": user_id,
                                "object_name": object_name,
                                "is_default": True,
                                "id": {"$ne": list_view_id},
                            },
                            {"$set": {"is_default": False}},
                        )
                    previous_values["updated_at"] = datetime.now(timezone.utc).isoformat()
                    await self.db.user_list_views.update_one(
                        {"id": list_view_id, "tenant_id": tenant_id, "user_id": user_id},
                        {"$set": previous_values},
                    )

            # Phase 5: Undo bulk update by restoring previous values on each record
            elif action_type == ActionType.BULK_UPDATE_RECORDS.value:
                records = undo_payload.get("records", []) or []
                for rec in records:
                    record_id = rec.get("record_id")
                    object_name = rec.get("object_name")
                    previous_values = rec.get("previous_values", {}) or {}
                    previous_owner_id = rec.get("previous_owner_id")
                    previous_owner_type = rec.get("previous_owner_type") or "USER"
                    if not record_id or not object_name:
                        continue
                    update_data: Dict[str, Any] = {
                        "updated_at": datetime.now(timezone.utc).isoformat()
                    }
                    for field, value in previous_values.items():
                        update_data[f"data.{field}"] = value
                    update_data["owner_id"] = previous_owner_id
                    update_data["owner_type"] = previous_owner_type
                    await self.db.object_records.update_one(
                        {"id": record_id, "tenant_id": tenant_id, "object_name": object_name},
                        {"$set": update_data},
                    )

            # Phase 5: Undo bulk creates by deleting created records
            elif action_type in [ActionType.BULK_CREATE_TASKS.value, ActionType.BULK_CREATE_RECORDS.value]:
                record_ids = undo_payload.get("record_ids", []) or []
                object_name = undo_payload.get("object_name")
                if record_ids and object_name:
                    await self.db.object_records.delete_many(
                        {
                            "tenant_id": tenant_id,
                            "object_name": object_name,
                            "id": {"$in": record_ids},
                        }
                    )

            elif action_type == ActionType.DRAFT_EMAIL.value:
                draft_id = undo_payload.get("draft_id")
                if draft_id:
                    await self.db.email_drafts.delete_one(
                        {"id": draft_id, "tenant_id": tenant_id, "user_id": user_id}
                    )
            
            # Update journal entry
            await self.db.clu_bot_execution_journal.update_one(
                {"id": journal_entry_id},
                {"$set": {"status": ExecutionStatus.ROLLED_BACK.value}}
            )
            
            return {
                "success": True,
                "message": "Action undone successfully."
            }
            
        except Exception as e:
            logger.error(f"Undo error: {str(e)}")
            return {
                "success": False,
                "message": f"Failed to undo: {str(e)}"
            }
    
    def _normalize_object_type_for_lookup(self, object_type: str) -> str:
        ot = (object_type or "").lower().strip()
        if len(ot) > 1 and ot.endswith("s"):
            singular = ot[:-1]
            if singular in (
                "lead",
                "contact",
                "account",
                "opportunity",
                "task",
                "event",
            ):
                return singular
        return ot

    def _record_identifier_variants(self, object_type: str, identifier: str) -> List[str]:
        """
        Some clients/LLMs prefix API object name to series_id (e.g. lead-led-abc).
        Real series_ids use a 3-letter prefix only (led-abc).
        """
        raw = (identifier or "").strip()
        out: List[str] = []
        seen: set = set()

        def add(s: str) -> None:
            s = (s or "").strip()
            if not s or s.lower() in seen:
                return
            seen.add(s.lower())
            out.append(s)

        add(raw)
        ot = (object_type or "").lower().strip()
        if ot and raw.lower().startswith(f"{ot}-"):
            add(raw[len(ot) + 1 :])
        # Handle doubly-prefixed series ids produced by some clients/LLMs:
        # e.g. lead-led-abc123, opportunity-opp-xyz
        m = re.match(
            r"^(?:lead|contact|account|opportunity|task|event)-([a-z]{3}-[a-z0-9]+(?:-[a-z0-9]+)*)$",
            raw.lower(),
        )
        if m:
            add(m.group(1))
        return out

    def _looks_like_record_id(self, s: str) -> bool:
        if not s or not s.strip():
            return False
        s = s.strip()
        uuid_pattern = r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
        # 3-letter prefix + suffix (optional extra hyphen segment for collisions)
        series_pattern = r"^[a-z]{3}-[a-z0-9]+(?:-[a-z0-9]+)*$"
        return bool(re.match(uuid_pattern, s)) or bool(
            re.match(series_pattern, s.lower())
        )

    async def _try_resolve_lead_contact_full_name(
        self,
        tenant_id: str,
        object_type: str,
        identifier: str,
    ) -> Optional[Dict[str, Any]]:
        """Match 'Ravi Gupta' against first_name + last_name (and name)."""
        if (object_type or "").lower() not in ("lead", "contact"):
            return None
        if " " not in identifier.strip():
            return None
        parts = identifier.split()
        if len(parts) < 2:
            return None
        first = parts[0].strip()
        last = " ".join(parts[1:]).strip()
        if not first or not last:
            return None

        base = {"tenant_id": tenant_id, "object_name": object_type}
        and_q = {
            "$and": [
                {
                    "data.first_name": {
                        "$regex": f"^{re.escape(first)}$",
                        "$options": "i",
                    }
                },
                {
                    "data.last_name": {
                        "$regex": f"^{re.escape(last)}$",
                        "$options": "i",
                    }
                },
            ]
        }
        rec = await self.db.object_records.find_one({**base, **and_q}, {"_id": 0})
        if rec:
            return rec
        # Single `name` / `full_name` field often stores "First Last"
        full_pat = re.escape(f"{first} {last}")
        for fld in ("name", "full_name"):
            rec = await self.db.object_records.find_one(
                {
                    **base,
                    f"data.{fld}": {"$regex": f"^{full_pat}$", "$options": "i"},
                },
                {"_id": 0},
            )
            if rec:
                return rec
        return None

    async def _resolve_by_name_heuristics(
        self,
        tenant_id: str,
        object_type: str,
        identifier: str,
        name_fields: list,
    ) -> Optional[Dict[str, Any]]:
        # Lead/contact: First Last
        rec = await self._try_resolve_lead_contact_full_name(
            tenant_id, object_type, identifier
        )
        if rec:
            return rec

        exact_conds = []
        partial_conds = []
        for field in name_fields:
            exact_conds.append(
                {
                    f"data.{field}": {
                        "$regex": f"^{re.escape(identifier)}$",
                        "$options": "i",
                    }
                }
            )
            partial_conds.append(
                {
                    f"data.{field}": {
                        "$regex": re.escape(identifier),
                        "$options": "i",
                    }
                }
            )

        base = {"tenant_id": tenant_id, "object_name": object_type}
        if exact_conds:
            rec = await self.db.object_records.find_one(
                {**base, "$or": exact_conds},
                {"_id": 0},
            )
            if rec:
                return rec
        if partial_conds:
            rec = await self.db.object_records.find_one(
                {**base, "$or": partial_conds},
                {"_id": 0},
            )
            if rec:
                return rec

        search_terms = identifier.split()
        if search_terms:
            significant = sorted(
                [w for w in search_terms if len(w) > 2],
                key=len,
                reverse=True,
            )
            if not significant:
                significant = search_terms
            for word in significant:
                rec = await self.db.object_records.find_one(
                    {
                        **base,
                        "$or": [
                            {
                                f"data.{field}": {
                                    "$regex": f"^{re.escape(word)}$",
                                    "$options": "i",
                                }
                            }
                            for field in name_fields
                        ],
                    },
                    {"_id": 0},
                )
                if rec:
                    return rec

        async for rec in self.db.object_records.find(
            base,
            {"_id": 0, "id": 1, "data": 1},
        ):
            data = rec.get("data", {})
            id_low = identifier.lower()
            for field in name_fields:
                rec_name = str(data.get(field, "")).lower()
                if rec_name and len(rec_name) > 2:
                    if rec_name in id_low or id_low in rec_name:
                        return rec
        return None

    async def _resolve_record(
        self,
        tenant_id: str,
        object_type: str,
        identifier: str
    ) -> Optional[Dict[str, Any]]:
        """
        Resolve a record by ID, series_id, or name.
        This implements entity resolution for natural language references.
        
        Resolution order:
        1. Try exact match by id (UUID) or series_id for each identifier variant
        2. Name-based search (incl. first+last for lead/contact)
        """
        object_type = self._normalize_object_type_for_lookup(object_type)
        variants = self._record_identifier_variants(object_type, identifier)
        name_fields = self._get_name_fields(object_type)

        for vid in variants:
            if self._looks_like_record_id(vid):
                record = await self.db.object_records.find_one(
                    {
                        "tenant_id": tenant_id,
                        "object_name": object_type,
                        "$or": [
                            {"id": vid},
                            {"series_id": vid.lower()},
                        ],
                    },
                    {"_id": 0},
                )
                if record:
                    return record

        for vid in variants:
            if self._looks_like_record_id(vid):
                continue
            rec = await self._resolve_by_name_heuristics(
                tenant_id, object_type, vid, name_fields
            )
            if rec:
                return rec

        return None
    
    def _get_name_fields(self, object_type: str) -> list:
        """Get the name fields to search for a given object type"""
        NAME_FIELDS = {
            "contact": ["first_name", "last_name", "name", "full_name"],
            "account": ["account_name", "name"],
            "opportunity": ["opportunity_name", "name"],
            "lead": ["first_name", "last_name", "name", "company"],
            "task": ["subject", "name"],
            "event": ["subject", "name"]
        }
        return NAME_FIELDS.get(object_type.lower(), ["name"])
    
    async def _create_journal_entry(
        self,
        tenant_id: str,
        user_id: str,
        conversation_id: str,
        action_type: ActionType,
        action_payload: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Create an execution journal entry"""
        entry = {
            "id": str(uuid.uuid4()),
            "tenant_id": tenant_id,
            "user_id": user_id,
            "conversation_id": conversation_id,
            "action_type": action_type.value,
            "action_payload": action_payload,
            "status": ExecutionStatus.PENDING.value,
            "is_undoable": False,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        
        await self.db.clu_bot_execution_journal.insert_one(entry)
        return entry
    
    async def _update_journal_entry(
        self,
        entry_id: str,
        status: ExecutionStatus,
        created_record_id: Optional[str] = None,
        undo_payload: Optional[Dict] = None,
        is_undoable: bool = False,
        error: Optional[str] = None,
        result: Optional[Dict[str, Any]] = None,
    ):
        """Update a journal entry"""
        update_data = {
            "status": status.value,
            "executed_at": datetime.now(timezone.utc).isoformat()
        }
        
        if created_record_id:
            update_data["created_record_id"] = created_record_id
        if undo_payload:
            update_data["undo_payload"] = undo_payload
        if is_undoable:
            update_data["is_undoable"] = is_undoable
        if error:
            update_data["error"] = error
        if result is not None:
            update_data["result"] = result
        
        await self.db.clu_bot_execution_journal.update_one(
            {"id": entry_id},
            {"$set": update_data}
        )
    
    async def _generate_series_id(self, tenant_id: str, object_name: str, record_id: str) -> str:
        """Generate a series_id for a new record"""
        import random
        import string
        
        prefix_map = {
            "lead": "led", "task": "tsk", "contact": "con", "event": "evt",
            "opportunity": "opp", "account": "acc", "note": "not", "call": "cal"
        }
        prefix = prefix_map.get(object_name.lower(), "rec")
        uuid_suffix = record_id.split('-')[-1]
        series_id = f"{prefix}-{uuid_suffix}"
        
        # Check for collision
        existing = await self.db.object_records.find_one({
            "tenant_id": tenant_id,
            "object_name": object_name,
            "series_id": series_id
        })
        
        if existing:
            random_suffix = ''.join(random.choices(string.ascii_lowercase + string.digits, k=4))
            series_id = f"{prefix}-{uuid_suffix}-{random_suffix}"
        
        return series_id


# Factory function
def get_activity_mcp_service(db: AsyncIOMotorDatabase) -> ActivityMCPService:
    """Get ActivityMCPService instance"""
    return ActivityMCPService(db)
