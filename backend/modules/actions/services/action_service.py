"""
Action Service
Business logic for managing and executing actions
"""
from motor.motor_asyncio import AsyncIOMotorDatabase
from typing import List, Dict, Optional, Any
from datetime import datetime
import logging
import re

from ..models.action_model import (
    ActionConfig,
    ActionCreateRequest,
    ActionUpdateRequest,
    ActionType,
    ActionPlacement,
    ActionContext,
    ValueType
)

logger = logging.getLogger(__name__)


class ActionService:
    """Service for managing action configurations and execution"""
    
    COLLECTION_NAME = "actions"
    
    # System action definitions
    SYSTEM_ACTIONS = [
        {
            "type": ActionType.SYSTEM_CREATE,
            "label": "New",  # Changed from "Create" to "New" per UI requirements
            "api_name": "system_create",
            "icon": "Plus",
            "sort_order": -3
        },
        {
            "type": ActionType.SYSTEM_EDIT,
            "label": "Edit",
            "api_name": "system_edit",
            "icon": "Edit",
            "sort_order": -2
        },
        {
            "type": ActionType.SYSTEM_DELETE,
            "label": "Delete",
            "api_name": "system_delete",
            "icon": "Trash2",
            "sort_order": -1
        }
    ]
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.collection = db[self.COLLECTION_NAME]
    
    # ============================================
    # System Actions Helper
    # ============================================
    
    def _get_system_actions(self, tenant_id: str, object_api_name: str) -> List[ActionConfig]:
        """Generate system actions for an object (Create, Edit, Delete)"""
        system_actions = []
        for action_def in self.SYSTEM_ACTIONS:
            action = ActionConfig(
                id=f"sys-{action_def['api_name']}-{object_api_name}",
                tenant_id=tenant_id,
                object_api_name=object_api_name.lower(),
                type=action_def["type"],
                label=action_def["label"],
                api_name=action_def["api_name"],
                icon=action_def["icon"],
                placement=ActionPlacement.RECORD_HEADER,
                is_active=True,
                is_system=True,
                config_json={},
                sort_order=action_def["sort_order"],
                created_by="system"
            )
            system_actions.append(action)
        return system_actions
    
    # ============================================
    # CRUD Operations
    # ============================================
    
    async def create_action(
        self,
        tenant_id: str,
        request: ActionCreateRequest,
        created_by: str = None
    ) -> ActionConfig:
        """Create a new action configuration"""
        
        # Generate API name if not provided
        api_name = request.api_name
        if not api_name:
            api_name = self._generate_api_name(request.label)
        
        # Check for duplicate API name
        existing = await self.collection.find_one({
            "tenant_id": tenant_id,
            "object_api_name": request.object_api_name.lower(),
            "api_name": api_name
        })
        if existing:
            raise ValueError(f"Action with API name '{api_name}' already exists for this object")
        
        # Get next sort order if not provided
        sort_order = request.sort_order
        if sort_order is None:
            max_order = await self.collection.find_one(
                {"tenant_id": tenant_id, "object_api_name": request.object_api_name.lower()},
                sort=[("sort_order", -1)]
            )
            sort_order = (max_order.get("sort_order", 0) + 1) if max_order else 0
        
        action = ActionConfig(
            tenant_id=tenant_id,
            object_api_name=request.object_api_name.lower(),
            type=request.type,
            label=request.label,
            api_name=api_name,
            icon=request.icon or "Zap",
            placement=request.placement,
            action_context=request.action_context,
            is_active=request.is_active,
            config_json=request.config_json,
            sort_order=sort_order,
            created_by=created_by
        )
        
        await self.collection.insert_one(action.dict())
        logger.info(f"Created action '{action.label}' ({action.id}) for {request.object_api_name}")
        
        return action
    
    async def get_action(
        self,
        action_id: str,
        tenant_id: str
    ) -> Optional[ActionConfig]:
        """Get a specific action by ID"""
        doc = await self.collection.find_one(
            {"id": action_id, "tenant_id": tenant_id},
            {"_id": 0}
        )
        if doc:
            return ActionConfig(**doc)
        return None
    
    async def get_actions_for_object(
        self,
        tenant_id: str,
        object_api_name: str,
        active_only: bool = False,
        placement: Optional[ActionPlacement] = None,
        action_context: Optional[str] = None,
        include_system: bool = True
    ) -> List[ActionConfig]:
        """Get all actions for an object, optionally filtered by context"""
        query = {
            "tenant_id": tenant_id,
            "object_api_name": object_api_name.lower()
        }
        
        if active_only:
            query["is_active"] = True
        
        if placement:
            query["placement"] = placement.value
        
        # Handle action_context filter - include documents where field is missing (defaults to RECORD_DETAIL)
        if action_context:
            if action_context == "RECORD_DETAIL":
                # Match either explicit RECORD_DETAIL or missing field (defaults to RECORD_DETAIL)
                query["$or"] = [
                    {"action_context": "RECORD_DETAIL"},
                    {"action_context": {"$exists": False}},
                    {"action_context": None}
                ]
            else:
                query["action_context"] = action_context
        
        cursor = self.collection.find(query, {"_id": 0}).sort("sort_order", 1)
        docs = await cursor.to_list(length=100)
        
        custom_actions = [ActionConfig(**doc) for doc in docs]
        
        # Prepend system actions if requested (only for record detail context or if no context filter)
        if include_system and (action_context is None or action_context == "RECORD_DETAIL"):
            system_actions = await self._get_system_actions_async(tenant_id, object_api_name)
            if active_only:
                system_actions = [a for a in system_actions if a.is_active]
            return system_actions + custom_actions
        
        return custom_actions
    
    async def update_action(
        self,
        action_id: str,
        tenant_id: str,
        request: ActionUpdateRequest
    ) -> Optional[ActionConfig]:
        """Update an action configuration"""
        update_data = {"updated_at": datetime.utcnow().isoformat()}
        
        if request.label is not None:
            update_data["label"] = request.label
        if request.icon is not None:
            update_data["icon"] = request.icon
        if request.placement is not None:
            update_data["placement"] = request.placement.value
        if request.action_context is not None:
            update_data["action_context"] = request.action_context.value
        if request.is_active is not None:
            update_data["is_active"] = request.is_active
        if request.config_json is not None:
            update_data["config_json"] = request.config_json
        if request.sort_order is not None:
            update_data["sort_order"] = request.sort_order
        
        result = await self.collection.find_one_and_update(
            {"id": action_id, "tenant_id": tenant_id},
            {"$set": update_data},
            return_document=True
        )
        
        if result:
            result.pop("_id", None)
            return ActionConfig(**result)
        return None
    
    async def delete_action(
        self,
        action_id: str,
        tenant_id: str
    ) -> bool:
        """Delete an action (system actions cannot be deleted)"""
        # Check if it's a system action
        if action_id.startswith("sys-"):
            raise ValueError("System actions cannot be deleted")
        
        result = await self.collection.delete_one({
            "id": action_id,
            "tenant_id": tenant_id
        })
        return result.deleted_count > 0
    
    async def clone_action(
        self,
        action_id: str,
        tenant_id: str,
        created_by: str = None
    ) -> Optional[ActionConfig]:
        """Clone an existing action"""
        original = await self.get_action(action_id, tenant_id)
        if not original:
            return None
        
        # Generate new label and API name
        new_label = f"{original.label} (Copy)"
        new_api_name = f"{original.api_name}_copy"
        
        # Ensure unique API name
        counter = 1
        base_api_name = new_api_name
        while True:
            existing = await self.collection.find_one({
                "tenant_id": tenant_id,
                "object_api_name": original.object_api_name,
                "api_name": new_api_name
            })
            if not existing:
                break
            counter += 1
            new_api_name = f"{base_api_name}_{counter}"
        
        request = ActionCreateRequest(
            object_api_name=original.object_api_name,
            type=original.type,
            label=new_label,
            api_name=new_api_name,
            icon=original.icon,
            placement=original.placement,
            is_active=False,  # Cloned actions start inactive
            config_json=original.config_json
        )
        
        return await self.create_action(tenant_id, request, created_by)
    
    async def toggle_active(
        self,
        action_id: str,
        tenant_id: str
    ) -> Optional[ActionConfig]:
        """Toggle the active status of an action"""
        action = await self.get_action(action_id, tenant_id)
        if not action:
            return None
        
        result = await self.collection.find_one_and_update(
            {"id": action_id, "tenant_id": tenant_id},
            {"$set": {
                "is_active": not action.is_active,
                "updated_at": datetime.utcnow().isoformat()
            }},
            return_document=True
        )
        
        if result:
            result.pop("_id", None)
            return ActionConfig(**result)
        return None
    
    async def update_system_action_label(
        self,
        action_id: str,
        tenant_id: str,
        new_label: str
    ) -> Optional[ActionConfig]:
        """
        Update the label of a system action.
        
        System actions are stored in the database when their label is customized.
        This allows admins to rename "Create" to "New", "Edit" to "Modify", etc.
        """
        # Parse the action_id to get type and object (e.g., "sys-system_create-lead")
        if not action_id.startswith("sys-"):
            return None
        
        parts = action_id.split("-", 2)
        if len(parts) < 3:
            return None
        
        _, api_name, object_api_name = parts
        
        # Find the system action definition
        system_action_def = None
        for action_def in self.SYSTEM_ACTIONS:
            if action_def["api_name"] == api_name:
                system_action_def = action_def
                break
        
        if not system_action_def:
            return None
        
        # Check if there's already a custom label stored in the database
        existing = await self.db["system_action_labels"].find_one({
            "action_id": action_id,
            "tenant_id": tenant_id
        })
        
        now = datetime.utcnow().isoformat()
        
        if existing:
            # Update existing customization
            await self.db["system_action_labels"].update_one(
                {"action_id": action_id, "tenant_id": tenant_id},
                {"$set": {
                    "label": new_label,
                    "updated_at": now
                }}
            )
        else:
            # Store the original label for reset functionality
            await self.db["system_action_labels"].insert_one({
                "action_id": action_id,
                "tenant_id": tenant_id,
                "object_api_name": object_api_name,
                "api_name": api_name,
                "original_label": system_action_def["label"],
                "label": new_label,
                "created_at": now,
                "updated_at": now
            })
        
        # Return an ActionConfig with the updated label
        return ActionConfig(
            id=action_id,
            tenant_id=tenant_id,
            object_api_name=object_api_name,
            type=system_action_def["type"],
            label=new_label,
            api_name=api_name,
            icon=system_action_def["icon"],
            placement=ActionPlacement.RECORD_HEADER,
            is_active=True,
            is_system=True,
            config_json={},
            sort_order=system_action_def["sort_order"],
            created_by="system"
        )
    
    def _get_system_actions(self, tenant_id: str, object_api_name: str) -> List[ActionConfig]:
        """Generate system actions for an object (Create, Edit, Delete)"""
        # This is synchronous, we'll need to fetch custom labels separately
        system_actions = []
        for action_def in self.SYSTEM_ACTIONS:
            action = ActionConfig(
                id=f"sys-{action_def['api_name']}-{object_api_name}",
                tenant_id=tenant_id,
                object_api_name=object_api_name.lower(),
                type=action_def["type"],
                label=action_def["label"],  # Default label
                api_name=action_def["api_name"],
                icon=action_def["icon"],
                placement=ActionPlacement.RECORD_HEADER,
                is_active=True,
                is_system=True,
                config_json={},
                sort_order=action_def["sort_order"],
                created_by="system"
            )
            system_actions.append(action)
        return system_actions
    
    async def _get_system_actions_async(self, tenant_id: str, object_api_name: str) -> List[ActionConfig]:
        """
        Generate system actions for an object with custom labels.
        Fetches any customized labels from the database.
        """
        system_actions = []
        
        # Fetch any custom labels for this tenant's system actions
        custom_labels = {}
        cursor = self.db["system_action_labels"].find({
            "tenant_id": tenant_id,
            "object_api_name": object_api_name.lower()
        })
        async for doc in cursor:
            custom_labels[doc["action_id"]] = doc["label"]
        
        for action_def in self.SYSTEM_ACTIONS:
            action_id = f"sys-{action_def['api_name']}-{object_api_name}"
            
            # Use custom label if available, otherwise use default
            label = custom_labels.get(action_id, action_def["label"])
            
            action = ActionConfig(
                id=action_id,
                tenant_id=tenant_id,
                object_api_name=object_api_name.lower(),
                type=action_def["type"],
                label=label,
                api_name=action_def["api_name"],
                icon=action_def["icon"],
                placement=ActionPlacement.RECORD_HEADER,
                is_active=True,
                is_system=True,
                config_json={},
                sort_order=action_def["sort_order"],
                created_by="system"
            )
            system_actions.append(action)
        
        return system_actions
    
    async def reorder_actions(
        self,
        tenant_id: str,
        object_api_name: str,
        action_ids: List[str]
    ) -> bool:
        """Reorder actions for an object"""
        for index, action_id in enumerate(action_ids):
            await self.collection.update_one(
                {"id": action_id, "tenant_id": tenant_id, "object_api_name": object_api_name.lower()},
                {"$set": {"sort_order": index, "updated_at": datetime.utcnow().isoformat()}}
            )
        return True
    
    # ============================================
    # Runtime / Execution
    # ============================================
    
    async def get_runtime_actions(
        self,
        tenant_id: str,
        object_api_name: str,
        placement: ActionPlacement = ActionPlacement.RECORD_HEADER
    ) -> List[ActionConfig]:
        """Get active actions for runtime display"""
        return await self.get_actions_for_object(
            tenant_id=tenant_id,
            object_api_name=object_api_name,
            active_only=True,
            placement=placement
        )
    
    async def execute_action(
        self,
        action_id: str,
        tenant_id: str,
        record_id: str,
        record_data: Dict[str, Any],
        form_data: Optional[Dict[str, Any]] = None,
        user_id: str = None
    ) -> Dict[str, Any]:
        """Execute an action"""
        action = await self.get_action(action_id, tenant_id)
        if not action:
            return {"success": False, "message": "Action not found"}
        
        if not action.is_active:
            return {"success": False, "message": "Action is not active"}
        
        config = action.config_json
        
        if action.type == ActionType.CREATE_RECORD:
            return await self._execute_create_record(
                action, config, record_id, record_data, form_data, tenant_id, user_id
            )
        elif action.type == ActionType.UPDATE_RECORD:
            return await self._execute_update_record(
                action, config, record_id, record_data, tenant_id, user_id
            )
        elif action.type == ActionType.OPEN_URL:
            return await self._execute_open_url(
                action, config, record_id, record_data
            )
        elif action.type == ActionType.RUN_FLOW:
            return await self._execute_run_flow(
                action, config, record_id, record_data, tenant_id, user_id
            )
        
        return {"success": False, "message": f"Unknown action type: {action.type}"}
    
    async def _execute_create_record(
        self,
        action: ActionConfig,
        config: Dict[str, Any],
        source_record_id: str,
        source_record_data: Dict[str, Any],
        form_data: Optional[Dict[str, Any]],
        tenant_id: str,
        user_id: str
    ) -> Dict[str, Any]:
        """Execute a Create Record action"""
        target_object = config.get("target_object")
        if not target_object:
            return {"success": False, "message": "Target object not configured"}
        
        # Build record data from field mappings and form data
        new_record_data = {}
        fields = config.get("fields", [])
        
        for field_config in fields:
            field_name = field_config.get("field_api_name")
            value_type = field_config.get("value_type", "STATIC")
            value = field_config.get("value")
            
            # Check if user provided value in form
            if form_data and field_name in form_data:
                new_record_data[field_name] = form_data[field_name]
            elif value_type == "FIELD_REF" and value:
                # Get value from source record
                ref_value = self._resolve_field_ref(value, source_record_data, source_record_id)
                if ref_value is not None:
                    new_record_data[field_name] = ref_value
            elif value_type == "STATIC" and value is not None:
                new_record_data[field_name] = value
        
        # Create the record using the records collection
        records_collection = self.db["object_records"]
        
        import uuid
        prefix_map = {
            "lead": "led", "contact": "con", "account": "acc",
            "opportunity": "opp", "task": "tsk", "event": "evt"
        }
        prefix = prefix_map.get(target_object.lower(), target_object[:3].lower())
        
        new_record = {
            "id": str(uuid.uuid4()),
            "series_id": f"{prefix}-{uuid.uuid4().hex[:12]}",
            "tenant_id": tenant_id,
            "object_name": target_object.lower(),
            "data": new_record_data,
            "created_at": datetime.utcnow().isoformat(),
            "updated_at": datetime.utcnow().isoformat(),
            "owner_id": user_id,
            "created_by": user_id
        }
        
        await records_collection.insert_one(new_record)
        new_record.pop("_id", None)
        
        logger.info(f"Action '{action.label}' created {target_object} record: {new_record['series_id']}")
        
        return {
            "success": True,
            "message": f"{target_object.title()} created successfully",
            "action_type": action.type.value,
            "result": {
                "created_record": new_record,
                "target_object": target_object
            }
        }
    
    async def _execute_update_record(
        self,
        action: ActionConfig,
        config: Dict[str, Any],
        record_id: str,
        record_data: Dict[str, Any],
        tenant_id: str,
        user_id: str
    ) -> Dict[str, Any]:
        """Execute an Update Record action"""
        field_updates = config.get("field_updates", [])
        if not field_updates:
            return {"success": False, "message": "No field updates configured"}
        
        # Build update data
        update_data = {}
        for field_config in field_updates:
            field_name = field_config.get("field_api_name")
            value_type = field_config.get("value_type", "STATIC")
            value = field_config.get("value")
            
            if value_type == "FIELD_REF" and value:
                resolved = self._resolve_field_ref(value, record_data, record_id)
                if resolved is not None:
                    update_data[field_name] = resolved
            elif value_type == "STATIC" and value is not None:
                update_data[field_name] = value
        
        if not update_data:
            return {"success": False, "message": "No valid updates to apply"}
        
        # Update the record
        records_collection = self.db["object_records"]
        
        # Try to find by series_id first, then by id
        record = await records_collection.find_one({
            "tenant_id": tenant_id,
            "$or": [{"series_id": record_id}, {"id": record_id}]
        })
        
        if not record:
            return {"success": False, "message": "Record not found"}
        
        # Update data fields
        result = await records_collection.update_one(
            {"id": record["id"], "tenant_id": tenant_id},
            {"$set": {
                **{f"data.{k}": v for k, v in update_data.items()},
                "updated_at": datetime.utcnow().isoformat()
            }}
        )
        
        if result.modified_count > 0:
            logger.info(f"Action '{action.label}' updated record {record_id}: {list(update_data.keys())}")
            return {
                "success": True,
                "message": "Record updated successfully",
                "action_type": action.type.value,
                "result": {
                    "updated_fields": update_data
                }
            }
        
        return {"success": False, "message": "No changes made to record"}
    
    async def _execute_open_url(
        self,
        action: ActionConfig,
        config: Dict[str, Any],
        record_id: str,
        record_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Execute an Open URL action - returns URL for frontend to open"""
        url_template = config.get("url_template", "")
        if not url_template:
            return {"success": False, "message": "URL template not configured"}
        
        # Resolve tokens in URL
        resolved_url = self._resolve_url_tokens(url_template, record_data, record_id)
        
        return {
            "success": True,
            "message": "URL generated",
            "action_type": action.type.value,
            "redirect_url": resolved_url,
            "result": {
                "open_in_new_tab": config.get("open_in_new_tab", True)
            }
        }
    
    async def _execute_run_flow(
        self,
        action: ActionConfig,
        config: Dict[str, Any],
        record_id: str,
        record_data: Dict[str, Any],
        tenant_id: str,
        user_id: str
    ) -> Dict[str, Any]:
        """Execute a Run Flow action - triggers a flow with input mappings"""
        flow_id = config.get("flow_id")
        if not flow_id:
            return {"success": False, "message": "Flow ID not configured"}
        
        # Get the flow from database
        flows_collection = self.db["flows"]
        flow_data = await flows_collection.find_one({
            "id": flow_id,
            "tenant_id": tenant_id
        }, {"_id": 0})
        
        if not flow_data:
            return {"success": False, "message": f"Flow '{flow_id}' not found"}
        
        flow_name = flow_data.get("name", flow_id)
        flow_status = flow_data.get("status", "draft")
        
        # Check if flow is active (allow running inactive flows too, but warn)
        if flow_status != "active":
            logger.warning(f"Running flow '{flow_name}' which is not active (status: {flow_status})")
        
        # Build input values from field mappings
        input_values = {}
        input_mappings = config.get("input_mappings", [])
        
        for mapping in input_mappings:
            var_name = mapping.get("field_api_name")  # This maps to flow variable name
            value_type = mapping.get("value_type", "STATIC")
            value = mapping.get("value")
            
            if value_type == "FIELD_REF" and value:
                resolved = self._resolve_field_ref(value, record_data, record_id)
                if resolved is not None:
                    input_values[var_name] = resolved
            elif value_type == "STATIC" and value is not None:
                input_values[var_name] = value
        
        # Import and execute the flow using FlowRuntimeEngine
        try:
            from modules.flow_builder.models.flow import Flow
            from modules.flow_builder.runtime.flow_runtime import FlowRuntimeEngine
            
            flow = Flow(**flow_data)
            runtime = FlowRuntimeEngine(self.db)
            
            execution_context = {
                "triggered_by_action": True,
                "action_id": action.id,
                "action_label": action.label,
                "source_record_id": record_id,
                "source_object": action.object_api_name,
                "started_by": user_id,
                "input": input_values
            }
            
            logger.info(f"Action '{action.label}' triggering flow '{flow_name}' with inputs: {list(input_values.keys())}")
            
            execution = await runtime.execute_flow(
                flow=flow,
                trigger_data={"record_id": record_id, "record_data": record_data},
                context=execution_context
            )
            
            # Check execution result
            execution_status = getattr(execution, 'status', 'unknown')
            
            if execution_status in ['success', 'completed']:
                return {
                    "success": True,
                    "message": f"Flow '{flow_name}' executed successfully",
                    "action_type": action.type.value,
                    "result": {
                        "flow_id": flow_id,
                        "flow_name": flow_name,
                        "execution_id": getattr(execution, 'id', None),
                        "execution_status": execution_status
                    }
                }
            elif execution_status == 'running':
                return {
                    "success": True,
                    "message": f"Flow '{flow_name}' started",
                    "action_type": action.type.value,
                    "result": {
                        "flow_id": flow_id,
                        "flow_name": flow_name,
                        "execution_id": getattr(execution, 'id', None),
                        "execution_status": execution_status
                    }
                }
            else:
                error_msg = getattr(execution, 'error', 'Unknown error')
                return {
                    "success": False,
                    "message": f"Flow execution failed: {error_msg}",
                    "action_type": action.type.value,
                    "result": {
                        "flow_id": flow_id,
                        "flow_name": flow_name,
                        "execution_id": getattr(execution, 'id', None),
                        "execution_status": execution_status,
                        "error": error_msg
                    }
                }
                
        except ImportError as e:
            logger.error(f"Failed to import flow modules: {e}")
            return {"success": False, "message": "Flow execution module not available"}
        except Exception as e:
            logger.error(f"Error executing flow '{flow_name}': {e}")
            return {"success": False, "message": f"Flow execution error: {str(e)}"}
    
    # ============================================
    # Helper Methods
    # ============================================
    
    def _generate_api_name(self, label: str) -> str:
        """Generate API name from label"""
        # Convert to lowercase, replace spaces with underscores, remove special chars
        api_name = label.lower().strip()
        api_name = re.sub(r'[^a-z0-9\s]', '', api_name)
        api_name = re.sub(r'\s+', '_', api_name)
        return api_name
    
    def _resolve_field_ref(
        self,
        field_ref: str,
        record_data: Dict[str, Any],
        record_id: str
    ) -> Any:
        """Resolve a field reference like 'Record.Name' or 'Record.Id'"""
        if not field_ref:
            return None
        
        # Handle Record.Id specially
        if field_ref.lower() in ["record.id", "record.series_id", "currentrecord.id"]:
            return record_id
        
        # Parse field reference (e.g., "Record.Name" -> "Name")
        parts = field_ref.split(".")
        if len(parts) >= 2:
            field_name = parts[-1]
            # Look in record data
            if field_name in record_data:
                return record_data[field_name]
            # Look in nested data object
            if "data" in record_data and field_name in record_data.get("data", {}):
                return record_data["data"][field_name]
        
        return None
    
    def _resolve_url_tokens(
        self,
        url_template: str,
        record_data: Dict[str, Any],
        record_id: str
    ) -> str:
        """Resolve {{tokens}} in URL template"""
        # Pattern to match {{Token.Field}} or {{Token}}
        token_pattern = r'\{\{([^}]+)\}\}'
        
        def replace_token(match):
            token = match.group(1)
            
            # Handle special tokens
            if token.lower() in ["record.id", "recordid"]:
                return record_id
            
            # Parse token (e.g., "Record.Name")
            parts = token.split(".")
            if len(parts) >= 2:
                field_name = parts[-1]
                # Check in record data
                value = record_data.get(field_name)
                if value is None and "data" in record_data:
                    value = record_data.get("data", {}).get(field_name)
                if value is not None:
                    return str(value)
            
            # Return empty string for unresolved tokens
            return ""
        
        return re.sub(token_pattern, replace_token, url_template)
