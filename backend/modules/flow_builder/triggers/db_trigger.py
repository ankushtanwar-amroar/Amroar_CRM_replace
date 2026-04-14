"""
Database Trigger Handler
Handles DB triggers when CRM entities are created/updated/deleted
"""
import logging
import asyncio
from typing import Dict, Any, List, Set
from motor.motor_asyncio import AsyncIOMotorDatabase
from contextvars import ContextVar

from ..models.flow import Flow, TriggerType
from ..runtime.flow_runtime import FlowRuntimeEngine

logger = logging.getLogger(__name__)

# Context variable to track active executions (prevents recursion)
# Key format: "{flow_id}:{record_id}" to prevent the same flow from re-triggering on the same record
_active_executions: ContextVar[Set[str]] = ContextVar('active_executions', default=set())


class DbTriggerHandler:
    """Handle database triggers for CRM entities"""
    
    # Class-level execution tracker for cross-request recursion prevention
    _execution_locks: Dict[str, asyncio.Lock] = {}
    _recent_executions: Dict[str, float] = {}  # {flow_id:record_id: timestamp}
    _execution_cooldown = 2.0  # seconds - prevent re-trigger within this window
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.runtime = FlowRuntimeEngine(db)
    
    async def handle_entity_event(
        self, 
        entity: str,  # Lead, Contact, Account, etc.
        event: str,   # afterInsert, afterUpdate, afterDelete
        record: Dict[str, Any],
        tenant_id: str,
        records: List[Dict[str, Any]] = None  # Support bulk operations
    ):
        """Handle entity event and trigger matching flows
        
        Supports both single record and bulk operations.
        Includes recursion guard to prevent infinite trigger loops.
        """
        import time
        
        # Handle both single record and bulk records
        records_to_process = records if records else [record]
        
        logger.info(f"🎯 DB trigger: {entity}.{event} for tenant {tenant_id}")
        logger.info(f"   Records to process: {len(records_to_process)}")
        if len(records_to_process) == 1:
            logger.info(f"   Record ID: {records_to_process[0].get('id')}")
            logger.info(f"   Record name: {records_to_process[0].get('data', {}).get('name')}")
        
        # Find matching flows
        matching_flows = await self._find_matching_flows(
            entity, event, records_to_process[0], tenant_id  # Use first record for flow matching
        )
        
        logger.info(f"📋 Found {len(matching_flows)} matching flow(s)")
        
        # Execute each matching flow
        for flow in matching_flows:
            flow_id = flow.get('id')
            logger.info(f"⚡ Executing flow: {flow.get('name')} (ID: {flow_id})")
            
            # Process each record (supports bulk)
            for rec in records_to_process:
                record_id = rec.get('id')
                execution_key = f"{flow_id}:{record_id}"
                
                try:
                    # RECURSION GUARD: Check if this exact flow+record is already executing
                    current_active = _active_executions.get()
                    if execution_key in current_active:
                        logger.warning(f"🔄 RECURSION BLOCKED: Flow {flow_id} already executing for record {record_id}")
                        continue
                    
                    # COOLDOWN GUARD: Check if this flow+record was recently executed
                    current_time = time.time()
                    last_execution = self._recent_executions.get(execution_key, 0)
                    if current_time - last_execution < self._execution_cooldown:
                        logger.warning(f"⏳ COOLDOWN ACTIVE: Flow {flow_id} for record {record_id} executed {current_time - last_execution:.2f}s ago")
                        continue
                    
                    # Check trigger match mode (first-time-only logic)
                    should_execute = await self._should_execute_trigger(flow, rec, entity, event, tenant_id)
                    if not should_execute:
                        logger.info(f"⏭️  Trigger skipped: First-time-only condition already satisfied for record {record_id}")
                        continue
                    
                    # Mark as active BEFORE execution
                    new_active = current_active | {execution_key}
                    _active_executions.set(new_active)
                    self._recent_executions[execution_key] = current_time
                    
                    try:
                        await self._execute_flow_for_trigger(flow, rec, is_bulk=(len(records_to_process) > 1), all_records=records_to_process)
                    finally:
                        # Remove from active set after execution completes
                        final_active = _active_executions.get()
                        _active_executions.set(final_active - {execution_key})
                        
                except Exception as e:
                    logger.error(f"❌ Error executing flow {flow_id} for record {record_id}: {str(e)}", exc_info=True)
    
    async def _find_matching_flows(
        self, 
        entity: str, 
        event: str, 
        record: Dict[str, Any],
        tenant_id: str
    ) -> List[Dict[str, Any]]:
        """Find flows that match this trigger"""
        
        # Normalize entity name (case-insensitive)
        entity_lower = entity.lower()
        
        logger.info(f"🔎 Searching for flows with trigger: entity={entity} ({entity_lower}), event={event}")
        
        # Query flows with matching DB triggers - use case-insensitive regex
        # Support both "db" and "record_trigger" types for backward compatibility
        query = {
            "tenant_id": tenant_id,
            "status": "active",
            "triggers": {
                "$elemMatch": {
                    "type": {"$in": ["db", "record_trigger"]},
                    "config.entity": {"$regex": f"^{entity}$", "$options": "i"},  # Case-insensitive
                    "config.event": event
                }
            }
        }
        
        logger.info(f"   MongoDB query: {query}")
        
        flows = await self.db.flows.find(query).to_list(length=None)
        
        logger.info(f"   Found {len(flows)} flows with matching trigger config")
        
        # Filter by conditions
        matching = []
        for flow in flows:
            logger.info(f"   Checking flow: {flow.get('name')} (ID: {flow.get('id')})")
            if self._check_trigger_conditions(flow, record):
                matching.append(flow)
                logger.info("      ✅ Flow matched!")
            else:
                logger.info("      ❌ Flow conditions not met")
        
        return matching
    
    def _check_trigger_conditions(self, flow: Dict[str, Any], record: Dict[str, Any]) -> bool:
        """Check if record matches trigger filter conditions"""
        import json
        
        flow_id = flow.get('id')
        flow_name = flow.get('name')
        
        # Get DB trigger
        db_trigger = None
        for trigger in flow.get("triggers", []):
            if trigger.get("type") == "db":
                db_trigger = trigger
                break
        
        if not db_trigger:
            logger.info(f"✅ No DB trigger found, flow {flow_id} will execute")
            return True
        
        # Get entity/object type from trigger config
        trigger_entity = db_trigger.get("config", {}).get("entity", "").lower()
        
        # Get filter conditions and logic
        filter_conditions = db_trigger.get("config", {}).get("filter_conditions", [])
        filter_logic = db_trigger.get("config", {}).get("filter_logic", "and")
        
        logger.info(f"🔍 Checking trigger conditions for flow: {flow_name} ({flow_id})")
        logger.info(f"   Trigger entity: {trigger_entity}")
        logger.info(f"   Filter logic: {filter_logic}")
        logger.info(f"   Number of conditions: {len(filter_conditions)}")
        logger.info(f"   Full trigger config: {json.dumps(db_trigger, indent=2)}")
        
        if not filter_conditions or filter_logic == "none" or filter_logic == "":
            logger.info("✅ No filter conditions or logic='none', flow will execute")
            return True  # No conditions = always match
        
        # Check each condition
        record_data = record.get("data", {})
        results = []
        
        logger.info(f"📦 Record data fields: {list(record_data.keys())}")
        logger.info(f"📦 Record data values: {json.dumps(record_data, indent=2)}")
        
        # Define field mappings for common name fields by object type
        name_field_mappings = {
            "account": "account_name",
            "lead": "first_name",  # or combine first_name + last_name
            "contact": "first_name",
            "opportunity": "name"
        }
        
        for idx, condition in enumerate(filter_conditions):
            field = condition.get("field", "")
            operator = condition.get("operator", "equals")
            expected_value = condition.get("value", "")
            
            logger.info(f"   Condition {idx + 1}:")
            logger.info(f"      Field: {field}")
            logger.info(f"      Operator: {operator}")
            logger.info(f"      Expected value: '{expected_value}'")
            
            # Get actual value from record - try multiple strategies
            actual_value = None
            
            # Strategy 1: Exact field match
            actual_value = record_data.get(field)
            
            # Strategy 2: If field is "name" and object has a name field mapping, use that
            if actual_value is None and field.lower() == "name" and trigger_entity in name_field_mappings:
                mapped_field = name_field_mappings[trigger_entity]
                actual_value = record_data.get(mapped_field)
                logger.info(f"      Mapped 'name' to '{mapped_field}' for {trigger_entity}")
            
            # Strategy 3: Case-insensitive field name match
            if actual_value is None:
                for key in record_data.keys():
                    if key.lower() == field.lower():
                        actual_value = record_data[key]
                        logger.info(f"      Found field with different case: {key}")
                        break
            
            logger.info(f"      Actual value: '{actual_value}'")
            
            # Evaluate condition based on operator
            result = self._evaluate_trigger_condition(actual_value, operator, expected_value)
            results.append(result)
            
            logger.info(f"      Result: {'✅ MATCH' if result else '❌ NO MATCH'}")
        
        # Apply logic (AND or OR)
        if filter_logic == "and":
            final_result = all(results) if results else True
        elif filter_logic == "or":
            final_result = any(results) if results else True
        else:  # custom or other
            final_result = all(results) if results else True
        
        logger.info(f"🎯 Final trigger result: {'✅ EXECUTE' if final_result else '❌ SKIP'}")
        
        return final_result
    
    def _evaluate_trigger_condition(self, actual_value: Any, operator: str, expected_value: Any) -> bool:
        """Evaluate a single trigger condition"""
        try:
            # Normalize operator format (handle both camelCase and snake_case)
            operator = operator.lower()
            
            if operator in ["equals", "="]:
                return str(actual_value) == str(expected_value)
            elif operator in ["does_not_equal", "doesnotequal", "notequals", "!="]:
                return str(actual_value) != str(expected_value)
            elif operator in ["greater_than", "greaterthan", ">"]:
                try:
                    return float(actual_value) > float(expected_value)
                except (ValueError, TypeError):
                    return False
            elif operator in ["less_than", "lessthan", "<"]:
                try:
                    return float(actual_value) < float(expected_value)
                except (ValueError, TypeError):
                    return False
            elif operator in ["greater_than_or_equal", "greaterthanorequal", ">="]:
                try:
                    return float(actual_value) >= float(expected_value)
                except (ValueError, TypeError):
                    return False
            elif operator in ["less_than_or_equal", "lessthanorequal", "<="]:
                try:
                    return float(actual_value) <= float(expected_value)
                except (ValueError, TypeError):
                    return False
            elif operator in ["contains"]:
                return str(expected_value).lower() in str(actual_value).lower()
            elif operator in ["starts_with", "startswith", "startsWith"]:
                return str(actual_value).lower().startswith(str(expected_value).lower())
            elif operator in ["ends_with", "endswith", "endsWith"]:
                return str(actual_value).lower().endswith(str(expected_value).lower())
            elif operator in ["is_null", "isnull", "isNull"]:
                return actual_value is None or actual_value == ""
            elif operator in ["is_not_null", "isnotnull", "isNotNull", "not_null", "notNull", "notnull"]:
                return actual_value is not None and actual_value != ""
            elif operator in ["is_not_empty", "isnotempty", "isNotEmpty", "not_empty", "notEmpty", "notempty"]:
                # Also check for empty arrays/lists
                if isinstance(actual_value, (list, tuple)):
                    return len(actual_value) > 0
                return actual_value is not None and actual_value != ""
            else:
                # Default to equals
                logger.warning(f"Unknown operator '{operator}', defaulting to equals")
                return str(actual_value) == str(expected_value)
        except Exception as e:
            logger.error(f"Error evaluating trigger condition: {e}")
            return False
    
    async def _execute_flow_for_trigger(self, flow_data: Dict[str, Any], record: Dict[str, Any], is_bulk: bool = False, all_records: List[Dict[str, Any]] = None):
        """Execute a flow triggered by DB event
        
        Args:
            flow_data: Flow configuration
            record: Current record being processed
            is_bulk: Whether this is a bulk operation
            all_records: All records in bulk operation (for context)
        """
        
        # Convert dict to Flow model
        flow = Flow(**flow_data)
        
        # Prepare trigger data - pass the actual record data with ID
        # This will be used to populate Trigger.Object.Field format
        record_data = record.get("data", {})
        record_data["id"] = record.get("id")  # Add record ID to data
        
        trigger_data = record_data  # Pass actual data directly
        
        logger.info(f"🎯 Trigger data prepared for {record.get('object_name')}: {list(record_data.keys())}")
        if is_bulk:
            logger.info(f"   📦 BULK MODE: Processing record {record.get('id')} (1 of {len(all_records)} records)")
        
        # Build initial context with record data
        context = {
            "trigger_type": "db",
            "entity": record.get("object_name"),
            "is_bulk_trigger": is_bulk,
            "bulk_record_count": len(all_records) if all_records else 1,
            **record.get("data", {})
        }
        
        # Add specific IDs to context
        object_name = record.get("object_name", "").lower()
        context[f"{object_name}_id"] = record.get("id")
        
        # Legacy support
        if object_name == "lead":
            context["lead_id"] = record.get("id")
        elif object_name == "contact":
            context["contact_id"] = record.get("id")
        elif object_name == "account":
            context["account_id"] = record.get("id")
        elif object_name == "opportunity":
            context["opportunity_id"] = record.get("id")
        
        # For bulk operations, also store all records in context
        if is_bulk and all_records:
            context["_bulk_trigger_records"] = all_records
        
        # Execute flow
        execution = await self.runtime.execute_flow(
            flow=flow,
            trigger_data=trigger_data,
            context=context
        )
        
        logger.info(f"Flow {flow.id} execution completed with status: {execution.status}")
        
        return execution
    
    async def _should_execute_trigger(
        self, 
        flow: Dict[str, Any], 
        record: Dict[str, Any],
        entity: str,
        event: str,
        tenant_id: str
    ) -> bool:
        """Check if trigger should execute based on match_mode (every_time vs first_time_only)"""
        from uuid import uuid4
        from datetime import datetime, timezone
        
        # Get the trigger for this flow that matches the event
        triggers = flow.get('triggers', [])
        matching_trigger = None
        for trigger in triggers:
            if trigger.get('type') == 'db' and \
               trigger.get('config', {}).get('event') == event:
                matching_trigger = trigger
                break
        
        if not matching_trigger:
            return True  # No matching trigger found, allow execution
        
        # Check match_mode (default is "every_time")
        match_mode = matching_trigger.get('match_mode', 'every_time')
        
        if match_mode == 'every_time':
            # Default behavior - always execute
            logger.info(f"   🔄 Trigger match mode: Every Time - executing")
            return True
        
        elif match_mode == 'first_time_only':
            # Check if this record has already triggered this flow
            record_id = record.get('id')
            flow_id = flow.get('id')
            trigger_id = matching_trigger.get('id')
            flow_version = flow.get('version', 1)
            
            logger.info(f"   🔍 Trigger match mode: First Time Only - checking history")
            logger.info(f"      Flow: {flow_id} v{flow_version}")
            logger.info(f"      Trigger: {trigger_id}")
            logger.info(f"      Record: {record_id}")
            
            # Check trigger fire history
            existing = await self.db.trigger_fire_history.find_one({
                "flow_id": flow_id,
                "flow_version": flow_version,
                "trigger_id": trigger_id,
                "record_id": record_id,
                "tenant_id": tenant_id
            })
            
            if existing:
                logger.info(f"      ❌ Record already triggered this flow - SKIPPING")
                return False
            else:
                logger.info(f"      ✅ First time for this record - EXECUTING and recording")
                
                # Record this trigger fire
                fire_record = {
                    "id": str(uuid4()),
                    "flow_id": flow_id,
                    "flow_version": flow_version,
                    "trigger_id": trigger_id,
                    "record_id": record_id,
                    "fired_at": datetime.now(timezone.utc),
                    "tenant_id": tenant_id
                }
                
                await self.db.trigger_fire_history.insert_one(fire_record)
                logger.info(f"      📝 Trigger fire recorded")
                
                return True
        
        # Unknown match_mode - default to allow
        return True
