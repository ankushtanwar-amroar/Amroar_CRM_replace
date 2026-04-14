"""
CLU-BOT Activity MCP Service
Handles write operations: Create Lead, Add Note, Create Task, Update Record.
Implements deterministic execution through existing CRM APIs.
"""
import logging
import uuid
from typing import Dict, Any, Optional
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorDatabase

from ..models import (
    ActionType, ExecutionStatus, ExecutionJournalEntry,
    CreateLeadPayload, AddNotePayload, CreateTaskPayload,
    UpdateRecordPayload, CreateListViewPayload
)

logger = logging.getLogger(__name__)


class ActivityMCPService:
    """
    Activity MCP - Executes write operations through existing CRM APIs.
    All operations are journaled for undo support.
    Uses the same validation as direct API calls.
    """
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
    
    async def create_lead(
        self,
        tenant_id: str,
        user_id: str,
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
            # Prepare lead data
            lead_data = {
                "first_name": payload.first_name,
                "last_name": payload.last_name,
                "name": f"{payload.first_name} {payload.last_name}",
            }
            
            # Add optional fields
            if payload.email:
                lead_data["email"] = payload.email
            if payload.phone:
                lead_data["phone"] = payload.phone
            if payload.company:
                lead_data["company"] = payload.company
            if payload.lead_source:
                lead_data["lead_source"] = payload.lead_source
            if payload.description:
                lead_data["description"] = payload.description
            lead_data["status"] = payload.status or "New"
            
            # Create journal entry for undo support
            journal_entry = await self._create_journal_entry(
                tenant_id=tenant_id,
                user_id=user_id,
                conversation_id=conversation_id,
                action_type=ActionType.CREATE_LEAD,
                action_payload=lead_data
            )
            
            # Generate record IDs
            record_id = str(uuid.uuid4())
            series_id = await self._generate_series_id(tenant_id, "lead", record_id)
            
            now = datetime.now(timezone.utc)
            
            # Create the record document
            record = {
                "id": record_id,
                "tenant_id": tenant_id,
                "object_name": "lead",
                "series_id": series_id,
                "data": lead_data,
                "owner_id": user_id,
                "created_by": user_id,
                "updated_by": user_id,
                "created_at": now.isoformat(),
                "updated_at": now.isoformat(),
                "system_timestamp": now.isoformat(),
                "is_deleted": False
            }
            
            # Insert into database
            await self.db.object_records.insert_one(record)
            
            # Update journal entry with success
            await self._update_journal_entry(
                journal_entry["id"],
                status=ExecutionStatus.EXECUTED,
                created_record_id=record_id,
                undo_payload={"record_id": record_id, "object_name": "lead"},
                is_undoable=True
            )
            
            # Remove _id for response
            record.pop("_id", None)
            
            return {
                "success": True,
                "record": record,
                "journal_entry_id": journal_entry["id"],
                "message": f"Lead '{payload.first_name} {payload.last_name}' created successfully."
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
            # Prepare task data
            task_data = {
                "subject": payload.subject,
                "status": payload.status or "Not Started",
                "priority": payload.priority or "Normal"
            }
            
            # Add optional fields
            if payload.description:
                task_data["description"] = payload.description
            if payload.due_date:
                task_data["due_date"] = payload.due_date
            if payload.assigned_to:
                task_data["assigned_to"] = payload.assigned_to
            
            # Handle related record
            if payload.related_to:
                task_data["related_to"] = payload.related_to
                if payload.related_type:
                    task_data["related_type"] = payload.related_type
                    task_data[f"{payload.related_type}_id"] = payload.related_to
            
            # Create journal entry
            journal_entry = await self._create_journal_entry(
                tenant_id=tenant_id,
                user_id=user_id,
                conversation_id=conversation_id,
                action_type=ActionType.CREATE_TASK,
                action_payload=task_data
            )
            
            # Generate record IDs
            record_id = str(uuid.uuid4())
            series_id = await self._generate_series_id(tenant_id, "task", record_id)
            
            now = datetime.now(timezone.utc)
            
            # Create the record document
            record = {
                "id": record_id,
                "tenant_id": tenant_id,
                "object_name": "task",
                "series_id": series_id,
                "data": task_data,
                "owner_id": user_id,
                "created_by": user_id,
                "updated_by": user_id,
                "created_at": now.isoformat(),
                "updated_at": now.isoformat(),
                "system_timestamp": now.isoformat(),
                "is_deleted": False
            }
            
            # Insert into database
            await self.db.object_records.insert_one(record)
            
            # Update journal entry with success
            await self._update_journal_entry(
                journal_entry["id"],
                status=ExecutionStatus.EXECUTED,
                created_record_id=record_id,
                undo_payload={"record_id": record_id, "object_name": "task"},
                is_undoable=True
            )
            
            # Remove _id for response
            record.pop("_id", None)
            
            return {
                "success": True,
                "record": record,
                "journal_entry_id": journal_entry["id"],
                "message": f"Task '{payload.subject}' created successfully."
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
    
    async def update_record(
        self,
        tenant_id: str,
        user_id: str,
        payload: UpdateRecordPayload,
        conversation_id: str
    ) -> Dict[str, Any]:
        """
        Update an existing record (contact, account, opportunity).
        Stores previous values for undo support.
        
        Includes entity resolution: if record_id doesn't look like an ID,
        it will search by name to find the actual record.
        
        Returns:
            {
                "success": bool,
                "record": {...},
                "journal_entry_id": str,
                "message": str,
                "changes": {...}
            }
        """
        journal_entry = None
        
        try:
            object_type = payload.object_type.lower()
            
            # Validate object type - only contact, account, opportunity can be updated
            allowed_types = ["contact", "account", "opportunity"]
            if object_type not in allowed_types:
                return {
                    "success": False,
                    "error": f"Cannot update {object_type}. Only {', '.join(allowed_types)} can be updated.",
                    "message": f"Record updates are only supported for: {', '.join(allowed_types)}."
                }
            
            # Entity Resolution: Find the record by ID, series_id, or name
            record = await self._resolve_record(
                tenant_id=tenant_id,
                object_type=object_type,
                identifier=payload.record_id
            )
            
            if not record:
                return {
                    "success": False,
                    "error": f"Record not found: {payload.record_id}",
                    "message": f"Could not find {object_type} named or with ID '{payload.record_id}'."
                }
            
            record_id = record.get("id")
            current_data = record.get("data", {})
            
            # Store previous values for undo
            previous_values = {}
            for field in payload.updates.keys():
                if field in current_data:
                    previous_values[field] = current_data[field]
                else:
                    previous_values[field] = None  # Field didn't exist
            
            # Create journal entry
            journal_entry = await self._create_journal_entry(
                tenant_id=tenant_id,
                user_id=user_id,
                conversation_id=conversation_id,
                action_type=ActionType.UPDATE_RECORD,
                action_payload={
                    "object_type": object_type,
                    "record_id": record_id,
                    "updates": payload.updates
                }
            )
            
            # Apply updates
            update_data = {}
            for field, value in payload.updates.items():
                update_data[f"data.{field}"] = value
            
            update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
            update_data["updated_by"] = user_id
            
            # Execute update
            await self.db.object_records.update_one(
                {"id": record_id, "tenant_id": tenant_id},
                {"$set": update_data}
            )
            
            # Get updated record
            updated_record = await self.db.object_records.find_one(
                {"id": record_id},
                {"_id": 0}
            )
            
            # Update journal entry with success
            await self._update_journal_entry(
                journal_entry["id"],
                status=ExecutionStatus.EXECUTED,
                created_record_id=record_id,
                undo_payload={
                    "record_id": record_id,
                    "object_name": object_type,
                    "previous_values": previous_values
                },
                is_undoable=True
            )
            
            # Build changes summary
            changes_summary = []
            for field, new_value in payload.updates.items():
                old_value = previous_values.get(field, "empty")
                changes_summary.append(f"{field}: {old_value} → {new_value}")
            
            return {
                "success": True,
                "record": updated_record,
                "journal_entry_id": journal_entry["id"],
                "changes": payload.updates,
                "message": f"Updated {object_type}: " + ", ".join(changes_summary)
            }
            
        except Exception as e:
            logger.error(f"Update record error: {str(e)}")
            
            if journal_entry:
                await self._update_journal_entry(
                    journal_entry["id"],
                    status=ExecutionStatus.FAILED,
                    error=str(e)
                )
            
            return {
                "success": False,
                "error": str(e),
                "message": f"Failed to update record: {str(e)}"
            }
    
    async def create_list_view(
        self,
        tenant_id: str,
        user_id: str,
        payload: CreateListViewPayload,
        conversation_id: str
    ) -> Dict[str, Any]:
        """
        Create a new list view with filters.
        
        Returns:
            {
                "success": bool,
                "list_view": {...},
                "journal_entry_id": str,
                "message": str
            }
        """
        journal_entry = None
        
        try:
            object_type = payload.object_type.lower()
            
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
            
            # Generate list view ID
            list_view_id = str(uuid.uuid4())
            now = datetime.now(timezone.utc)
            
            # Convert filter conditions to the format used by the CRM
            filter_conditions = []
            for filter_cond in payload.filters:
                filter_conditions.append({
                    "field": filter_cond.field,
                    "operator": filter_cond.operator,
                    "value": filter_cond.value
                })
            
            # Create the list view document
            list_view = {
                "id": list_view_id,
                "tenant_id": tenant_id,
                "object_name": object_type,
                "name": payload.name,
                "description": payload.description or "",
                "api_name": payload.name.lower().replace(" ", "_"),
                "is_default": False,
                "is_system": False,
                "is_pinned": False,
                "created_by": user_id,
                "owner_id": user_id,
                "visibility": "private",
                "filter_conditions": filter_conditions,
                "filter_logic": payload.filter_logic or "AND",
                "columns": payload.columns or [],
                "sort_field": payload.sort_field or "created_at",
                "sort_order": payload.sort_order or "desc",
                "created_at": now.isoformat(),
                "updated_at": now.isoformat()
            }
            
            # Insert into database
            await self.db.list_views.insert_one(list_view)
            
            # Update journal entry with success
            await self._update_journal_entry(
                journal_entry["id"],
                status=ExecutionStatus.EXECUTED,
                created_record_id=list_view_id,
                undo_payload={"list_view_id": list_view_id},
                is_undoable=True
            )
            
            # Remove _id for response
            list_view.pop("_id", None)
            
            # Build filter description
            filter_desc = ""
            if filter_conditions:
                filter_parts = []
                for fc in filter_conditions:
                    filter_parts.append(f"{fc['field']} {fc['operator']} {fc['value']}")
                filter_desc = f" with filters: {' ' + payload.filter_logic + ' '.join(filter_parts)}"
            
            return {
                "success": True,
                "list_view": list_view,
                "journal_entry_id": journal_entry["id"],
                "message": f"List view '{payload.name}' created for {object_type}s{filter_desc}."
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
            if action_type in [ActionType.CREATE_LEAD.value, ActionType.CREATE_TASK.value]:
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
                
                if record_id and object_name and previous_values:
                    update_data = {}
                    for field, value in previous_values.items():
                        if value is None:
                            # Field didn't exist before, remove it
                            update_data[f"data.{field}"] = None
                        else:
                            update_data[f"data.{field}"] = value
                    
                    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
                    
                    await self.db.object_records.update_one(
                        {"id": record_id, "tenant_id": tenant_id, "object_name": object_name},
                        {"$set": update_data}
                    )
            
            # Phase 2A: Undo list view creation by deleting it
            elif action_type == ActionType.CREATE_LIST_VIEW.value:
                list_view_id = undo_payload.get("list_view_id")
                if list_view_id:
                    await self.db.list_views.delete_one({
                        "id": list_view_id,
                        "tenant_id": tenant_id
                    })
            
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
        1. Try exact match by id (UUID)
        2. Try exact match by series_id (e.g., con-1234)
        3. Try name-based search (first_name, last_name, name, account_name, etc.)
        
        Returns the record dict if found, None otherwise.
        """
        import re
        
        # Check if identifier looks like an ID (UUID or series_id pattern)
        uuid_pattern = r'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
        series_pattern = r'^[a-z]{3}-[a-z0-9]+(-[a-z0-9]+)?$'
        
        is_uuid = bool(re.match(uuid_pattern, identifier))
        is_series_id = bool(re.match(series_pattern, identifier.lower()))
        
        # Step 1 & 2: Try to find by id or series_id
        if is_uuid or is_series_id:
            record = await self.db.object_records.find_one({
                "tenant_id": tenant_id,
                "object_name": object_type,
                "$or": [
                    {"id": identifier},
                    {"series_id": identifier.lower()}
                ]
            }, {"_id": 0})
            
            if record:
                return record
        
        # Step 3: Search by name
        # Build search conditions based on object type
        name_fields = self._get_name_fields(object_type)
        search_conditions = []
        
        for field in name_fields:
            search_conditions.append({
                f"data.{field}": {"$regex": f"^{re.escape(identifier)}$", "$options": "i"}
            })
            # Also try partial match
            search_conditions.append({
                f"data.{field}": {"$regex": re.escape(identifier), "$options": "i"}
            })
        
        if search_conditions:
            # Try exact match first
            record = await self.db.object_records.find_one({
                "tenant_id": tenant_id,
                "object_name": object_type,
                "$or": search_conditions[:len(name_fields)]  # Only exact matches
            }, {"_id": 0})
            
            if record:
                return record
            
            # Try partial match
            record = await self.db.object_records.find_one({
                "tenant_id": tenant_id,
                "object_name": object_type,
                "$or": search_conditions
            }, {"_id": 0})
            
            if record:
                return record
        
        # Also try direct series_id search as fallback
        record = await self.db.object_records.find_one({
            "tenant_id": tenant_id,
            "object_name": object_type,
            "series_id": {"$regex": re.escape(identifier), "$options": "i"}
        }, {"_id": 0})
        
        return record
    
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
        error: Optional[str] = None
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
