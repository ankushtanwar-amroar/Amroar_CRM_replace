"""
Flow Runtime Engine
Executes flow graphs sequentially with retry and error handling

Enhanced with detailed execution tracing for debugging and verification.
"""
import asyncio
import uuid
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
from motor.motor_asyncio import AsyncIOMotorDatabase
import logging
import time

from ..models.flow import (
    Flow, FlowExecution, NodeExecution, ExecutionStatus, 
    NodeType, Node, Edge
)

logger = logging.getLogger(__name__)


class FlowCustomError(Exception):
    """
    Custom exception raised by Custom Error nodes (Salesforce-like Add Error).
    This exception terminates the flow and surfaces a user-configured error message.
    """
    def __init__(self, message: str, error_label: str = None, api_name: str = None, node_id: str = None):
        super().__init__(message)
        self.message = message
        self.error_label = error_label or "Custom Error"
        self.api_name = api_name
        self.node_id = node_id
    
    def __str__(self):
        return f"[{self.error_label}] {self.message}"


class FlowFaultPathError(Exception):
    """
    Exception that triggers fault path routing.
    When an action node fails and has a fault path configured,
    this exception carries context for the fault path branch.
    """
    def __init__(self, message: str, node_id: str = None, original_error: Exception = None):
        super().__init__(message)
        self.message = message
        self.node_id = node_id
        self.original_error = original_error


class ExecutionTracer:
    """Detailed execution tracing for flow debugging"""
    
    def __init__(self, flow_id: str, execution_id: str, trigger_record_id: str = None):
        self.flow_id = flow_id
        self.execution_id = execution_id
        self.trigger_record_id = trigger_record_id
        self.start_time = time.time()
        self.trace_entries: List[Dict[str, Any]] = []
        self.dml_counts = {"create": 0, "update": 0, "delete": 0}
        self.loop_stats = {}
        self.decision_results = {}
        self.variable_snapshots = {}
        self.node_durations = {}
        self.collection_sizes = {}
        self.is_bulk = False
        self.bulk_batch_size = 0
        self.recursion_guard_hits = 0
    
    def log_trigger(self, record_id: str, entity: str, event: str, data: Dict):
        """Log trigger activation"""
        entry = {
            "timestamp": time.time() - self.start_time,
            "type": "TRIGGER",
            "record_id": record_id,
            "entity": entity,
            "event": event,
            "fields": list(data.keys()) if data else []
        }
        self.trace_entries.append(entry)
        logger.info(f"📍 TRACE [{self.execution_id[:8]}] TRIGGER: {entity}.{event} record={record_id}")
    
    def log_assignment(self, node_id: str, variable: str, value: Any, formula: str = None):
        """Log assignment node execution"""
        entry = {
            "timestamp": time.time() - self.start_time,
            "type": "ASSIGNMENT",
            "node_id": node_id,
            "variable": variable,
            "value": str(value)[:200],  # Truncate long values
            "formula": formula
        }
        self.trace_entries.append(entry)
        self.variable_snapshots[variable] = value
        logger.info(f"📍 TRACE [{self.execution_id[:8]}] ASSIGN: {variable} = {str(value)[:100]}")
        if formula:
            logger.info(f"   Formula: {formula}")
    
    def log_decision(self, node_id: str, condition: str, result: bool, path_taken: str):
        """Log decision node evaluation"""
        entry = {
            "timestamp": time.time() - self.start_time,
            "type": "DECISION",
            "node_id": node_id,
            "condition": condition,
            "result": result,
            "path_taken": path_taken
        }
        self.trace_entries.append(entry)
        self.decision_results[node_id] = {"result": result, "path": path_taken}
        logger.info(f"📍 TRACE [{self.execution_id[:8]}] DECISION: {condition}")
        logger.info(f"   Result: {'✅ TRUE' if result else '❌ FALSE'} → Path: {path_taken}")
    
    def log_dml(self, operation: str, object_type: str, count: int, record_ids: List[str] = None):
        """Log DML operation (create/update/delete)"""
        self.dml_counts[operation] = self.dml_counts.get(operation, 0) + count
        entry = {
            "timestamp": time.time() - self.start_time,
            "type": "DML",
            "operation": operation.upper(),
            "object_type": object_type,
            "count": count,
            "record_ids": record_ids[:5] if record_ids else []  # First 5 IDs only
        }
        self.trace_entries.append(entry)
        logger.info(f"📍 TRACE [{self.execution_id[:8]}] DML: {operation.upper()} {count} {object_type}(s)")
    
    def log_loop_start(self, node_id: str, collection_name: str, collection_size: int):
        """Log loop iteration start"""
        self.loop_stats[node_id] = {"total": collection_size, "processed": 0}
        self.collection_sizes[collection_name] = collection_size
        entry = {
            "timestamp": time.time() - self.start_time,
            "type": "LOOP_START",
            "node_id": node_id,
            "collection": collection_name,
            "size": collection_size
        }
        self.trace_entries.append(entry)
        logger.info(f"📍 TRACE [{self.execution_id[:8]}] LOOP START: {collection_name} ({collection_size} items)")
    
    def log_loop_iteration(self, node_id: str, iteration: int, item_id: str = None):
        """Log individual loop iteration"""
        if node_id in self.loop_stats:
            self.loop_stats[node_id]["processed"] = iteration
        logger.debug(f"📍 TRACE [{self.execution_id[:8]}] LOOP ITER: #{iteration} item={item_id}")
    
    def log_loop_end(self, node_id: str, iterations_completed: int):
        """Log loop completion"""
        if node_id in self.loop_stats:
            self.loop_stats[node_id]["completed"] = iterations_completed
        entry = {
            "timestamp": time.time() - self.start_time,
            "type": "LOOP_END",
            "node_id": node_id,
            "iterations": iterations_completed
        }
        self.trace_entries.append(entry)
        logger.info(f"📍 TRACE [{self.execution_id[:8]}] LOOP END: {iterations_completed} iterations completed")
    
    def log_node_duration(self, node_id: str, node_type: str, duration_ms: float):
        """Log node execution duration"""
        self.node_durations[node_id] = {"type": node_type, "duration_ms": duration_ms}
    
    def log_recursion_guard_hit(self, flow_id: str, record_id: str):
        """Log when recursion guard prevents execution"""
        self.recursion_guard_hits += 1
        entry = {
            "timestamp": time.time() - self.start_time,
            "type": "RECURSION_GUARD",
            "flow_id": flow_id,
            "record_id": record_id
        }
        self.trace_entries.append(entry)
        logger.warning(f"🛡️ TRACE [{self.execution_id[:8]}] RECURSION GUARD HIT: flow={flow_id} record={record_id}")
    
    def log_bulk_info(self, batch_size: int):
        """Log bulk execution information"""
        self.is_bulk = True
        self.bulk_batch_size = batch_size
        logger.info(f"📍 TRACE [{self.execution_id[:8]}] BULK EXECUTION: {batch_size} records")
    
    def log_formula_evaluation(self, expression: str, result: Any, context_snapshot: Dict = None):
        """Log formula evaluation for debugging"""
        entry = {
            "timestamp": time.time() - self.start_time,
            "type": "FORMULA",
            "expression": expression[:200],
            "result": str(result)[:200]
        }
        self.trace_entries.append(entry)
        logger.debug(f"📍 TRACE [{self.execution_id[:8]}] FORMULA: '{expression}' = '{result}'")
    
    def get_summary(self) -> Dict[str, Any]:
        """Get execution trace summary"""
        total_duration = time.time() - self.start_time
        return {
            "execution_id": self.execution_id,
            "flow_id": self.flow_id,
            "trigger_record_id": self.trigger_record_id,
            "duration_seconds": round(total_duration, 3),
            "is_bulk": self.is_bulk,
            "bulk_batch_size": self.bulk_batch_size,
            "dml_counts": self.dml_counts,
            "total_dml_operations": sum(self.dml_counts.values()),
            "loop_stats": self.loop_stats,
            "decision_results": self.decision_results,
            "recursion_guard_hits": self.recursion_guard_hits,
            "collection_sizes": self.collection_sizes,
            "node_durations": self.node_durations,
            "variable_count": len(self.variable_snapshots),
            "trace_entry_count": len(self.trace_entries)
        }
    
    def print_summary(self):
        """Print formatted execution summary"""
        summary = self.get_summary()
        logger.info("=" * 80)
        logger.info(f"📊 EXECUTION TRACE SUMMARY")
        logger.info("=" * 80)
        logger.info(f"   Execution ID: {summary['execution_id']}")
        logger.info(f"   Flow ID: {summary['flow_id']}")
        logger.info(f"   Trigger Record: {summary['trigger_record_id']}")
        logger.info(f"   Duration: {summary['duration_seconds']}s")
        logger.info(f"   Is Bulk: {summary['is_bulk']} (batch size: {summary['bulk_batch_size']})")
        logger.info(f"   DML Counts: CREATE={summary['dml_counts']['create']}, UPDATE={summary['dml_counts']['update']}, DELETE={summary['dml_counts']['delete']}")
        logger.info(f"   Total DML Operations: {summary['total_dml_operations']}")
        logger.info(f"   Recursion Guard Hits: {summary['recursion_guard_hits']}")
        for node_id, stats in summary['loop_stats'].items():
            logger.info(f"   Loop [{node_id}]: {stats.get('completed', stats.get('processed', 0))}/{stats.get('total', 0)} iterations")
        for node_id, result in summary['decision_results'].items():
            logger.info(f"   Decision [{node_id}]: {'TRUE' if result['result'] else 'FALSE'} → {result['path']}")
        logger.info("=" * 80)


# Global tracer registry for debugging
_active_tracers: Dict[str, ExecutionTracer] = {}


def get_tracer(execution_id: str) -> Optional[ExecutionTracer]:
    """Get active tracer by execution ID"""
    return _active_tracers.get(execution_id)


class FlowRuntimeEngine:
    """Execute flows with retry logic and error handling"""
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.max_retries = 3
        self.retry_delay = 2  # seconds
    
    async def execute_flow(
        self, 
        flow: Flow, 
        trigger_data: Optional[Dict[str, Any]] = None,
        context: Optional[Dict[str, Any]] = None
    ) -> FlowExecution:
        """Execute a complete flow with detailed tracing"""
        
        logger.info("=" * 80)
        logger.info(f"🚀 STARTING FLOW EXECUTION: {flow.name} (ID: {flow.id})")
        logger.info("=" * 80)
        
        # Create execution record
        execution = FlowExecution(
            id=str(uuid.uuid4()),
            flow_id=flow.id,
            flow_version=flow.version,
            tenant_id=flow.tenant_id,
            trigger_type=flow.triggers[0].type if flow.triggers else "manual",
            trigger_data=trigger_data or {},
            status=ExecutionStatus.RUNNING,
            started_at=datetime.now(timezone.utc),
            context=context or {},
            node_executions=[]
        )
        
        # Initialize execution tracer
        trigger_record_id = trigger_data.get("id") if trigger_data else None
        tracer = ExecutionTracer(flow.id, execution.id, trigger_record_id)
        _active_tracers[execution.id] = tracer
        
        # Store tracer in context for access by node executors
        execution.context["_tracer"] = tracer
        
        # Store tenant_id in context for cross-object field resolution
        execution.context["tenant_id"] = execution.tenant_id
        
        # Check for bulk execution
        if context and context.get("is_bulk_trigger"):
            tracer.log_bulk_info(context.get("bulk_record_count", 1))
        
        logger.info(f"📋 Execution ID: {execution.id}")
        logger.info(f"🎯 Trigger Type: {execution.trigger_type}")
        
        # Format trigger data for easy access (Trigger.Object.Field format)
        trigger_display_name = "Trigger Start"
        if trigger_data and flow.triggers:
            trigger_config = flow.triggers[0].config
            object_type = trigger_config.get("entity", trigger_config.get("object", ""))
            event_type = trigger_config.get("event", "")
            if object_type and isinstance(trigger_data, dict):
                # Log trigger to tracer
                tracer.log_trigger(
                    record_id=trigger_data.get("id", "unknown"),
                    entity=object_type,
                    event=event_type,
                    data=trigger_data
                )
                # Capitalize object type to match UI format (e.g., "Opportunity" not "opportunity")
                object_type_capitalized = object_type.capitalize()
                
                # Make trigger data accessible as Trigger.Object.Field
                # Add Id alias for the lowercase 'id' field
                trigger_data_with_id = trigger_data.copy()
                if 'id' in trigger_data_with_id:
                    trigger_data_with_id['Id'] = trigger_data_with_id['id']  # Add capitalized alias
                
                execution.context["Trigger"] = {
                    object_type_capitalized: trigger_data_with_id,
                    "Id": trigger_data.get("id", "")
                }
                
                # Create display name for trigger
                trigger_event = trigger_config.get("event", "")
                event_label = {
                    "afterInsert": "Created",
                    "afterUpdate": "Updated", 
                    "afterDelete": "Deleted"
                }.get(trigger_event, trigger_event)
                trigger_display_name = f"{object_type_capitalized} {event_label}"
                
                logger.info(f"✅ STEP 1: TRIGGER - {trigger_display_name}")
                logger.info(f"   Trigger data fields: {list(trigger_data.keys())}")
                
                # Also store flat for {{trigger_field}} access
                for key, value in trigger_data.items():
                    execution.context[f"trigger_{key}"] = value
        
        # Add Trigger as Step 1 in node_executions
        trigger_execution = NodeExecution(
            node_id=flow.triggers[0].id if flow.triggers else "trigger_start",
            node_type="trigger",
            step_number=1,
            display_name=trigger_display_name,
            category="Trigger",
            started_at=execution.started_at,
            completed_at=execution.started_at,
            status=ExecutionStatus.SUCCESS,
            input={"trigger_data": trigger_data},
            output={"trigger_context_set": True},
            retry_count=0
        )
        execution.node_executions.append(trigger_execution)
        
        # Save initial execution (remove tracer before saving - not serializable)
        save_context = {k: v for k, v in execution.context.items() if k != "_tracer"}
        execution_dict = execution.dict()
        execution_dict["context"] = save_context
        await self.db.flow_executions.insert_one(execution_dict)
        
        try:
            # Build execution graph
            logger.info(f"\n📊 Building execution order...")
            execution_order = self._build_execution_order(flow.nodes, flow.edges)
            logger.info(f"\n🎬 Flow will execute {len(execution_order)} nodes in sequence")
            
            # Track global step number across ALL nodes (including loop children)
            execution.context['_global_step_number'] = 2  # Start from 2 since trigger is step 1
            execution.context['_skipped_nodes'] = []  # Track nodes to skip based on decisions (use list not set)
            execution.context['_decision_paths'] = {}  # Map decision node to selected path
            
            # Execute nodes in order
            for node_id in execution_order:
                node = next((n for n in flow.nodes if n.id == node_id), None)
                if not node:
                    continue
                
                # Skip nodes that are on non-selected decision paths
                if node_id in execution.context['_skipped_nodes']:
                    logger.info(f"\n⏭️  SKIPPING NODE: {node_id} (not on selected decision path)")
                    continue
                
                # Get current step number
                step_number = execution.context.get('_global_step_number', 2)
                
                node_label = node.data.get('label', 'Unnamed') if hasattr(node, 'data') and node.data else 'Unnamed'
                node_type = node.type
                
                logger.info(f"\n{'=' * 80}")
                logger.info(f"✅ STEP {step_number}: {node_type.upper()} - {node_label}")
                logger.info(f"   Node ID: {node_id}")
                logger.info(f"{'=' * 80}")
                
                # Execute node with retry
                node_result = await self._execute_node_with_retry(
                    node, execution, flow, step_number
                )
                execution.node_executions.append(node_result)
                
                # Increment step number
                execution.context['_global_step_number'] = step_number + 1
                
                # Handle decision node outcomes - mark paths to skip
                if node.type == NodeType.DECISION and node_result.output:
                    self._handle_decision_outcome(node, node_result.output, flow.edges, execution)
                
                # Handle delay node - stop execution here
                if (node.type == NodeType.DELAY or node.type == "delay") and node_result.output:
                    delay_status = node_result.output.get('status')
                    if delay_status == "waiting":
                        logger.info(f"   ⏸️  Execution PAUSED at delay node - will resume later")
                        execution.status = ExecutionStatus.WAITING
                        break  # Stop execution loop here
                
                # Special handling for loop nodes: add "After Last" node executions after loop
                if node.type == NodeType.LOOP and node_result.output:
                    after_last_execs = node_result.output.get('_after_last_node_executions', [])
                    if after_last_execs:
                        logger.info(f"   📝 Adding {len(after_last_execs)} 'After Last' node execution records")
                        execution.node_executions.extend(after_last_execs)
                        # Remove from output to keep it clean
                        node_result.output.pop('_after_last_node_executions', None)
                
                logger.info(f"   ✅ Step {step_number} completed: {node_result.status}")
                if node_result.output:
                    logger.info(f"   📤 Output: {list(node_result.output.keys())}")
                
                # Update context with node output
                if node_result.output:
                    execution.context.update(node_result.output)
                    
                    # B5 FIX: Store action outputs with node label as key for downstream reference
                    # This enables patterns like {{CreateContact.Id}}, {{GetAccount.Name}}
                    if node.type in [NodeType.MCP, 'mcp', 'create_record', 'update_record', 'get_records', 'mcp_create_record', 'mcp_update_record', 'mcp_get_records']:
                        # Get a clean label for the variable name (remove spaces, use CamelCase)
                        node_label_raw = node_label.replace(" ", "").replace("-", "").replace("_", "")
                        if node_label_raw:
                            # Build the output record for this node
                            action_output = {}
                            
                            # For Create actions: store Id and all created fields
                            if node_result.output.get('action') in ['crm.record.create', 'create'] or node_result.output.get('record_id'):
                                record_id = node_result.output.get('record_id')
                                record_data = node_result.output.get('record_data', {})
                                action_output = {
                                    'Id': record_id,
                                    'id': record_id,
                                    **record_data
                                }
                                logger.info(f"   💾 Stored as: {{{{{node_label_raw}.Id}}}} = {record_id}")
                            
                            # For Get actions: store BOTH first record fields AND collection data
                            elif node_result.output.get('action') in ['crm.record.get', 'get'] or node_result.output.get('record_count') is not None:
                                object_type = node_result.output.get('object_type', '')
                                records = node_result.output.get('records', [])
                                record_count = len(records)
                                
                                # Always store collection data (count and records array)
                                action_output = {
                                    'count': record_count,
                                    'records': []
                                }
                                
                                # Process all records for collection access
                                for rec in records:
                                    rec_data = rec.get('data', {})
                                    action_output['records'].append({
                                        'Id': rec.get('id'),
                                        'id': rec.get('id'),
                                        **rec_data
                                    })
                                
                                # Also store first record fields at root level for backward compatibility
                                if records and len(records) > 0:
                                    first_record = records[0]
                                    record_data = first_record.get('data', {})
                                    action_output['Id'] = first_record.get('id')
                                    action_output['id'] = first_record.get('id')
                                    # Merge first record data at root for {{GetRecords.Name}} access
                                    for key, value in record_data.items():
                                        action_output[key] = value
                                
                                logger.info(f"   💾 Collection stored: {{{{{node_label_raw}.count}}}} = {record_count}")
                                logger.info(f"   💾 First record: {{{{{node_label_raw}.Id}}}} = {action_output.get('Id')}")
                            
                            # For Update actions: store updated count and IDs
                            elif node_result.output.get('action') in ['crm.record.update', 'update'] or node_result.output.get('records_updated') is not None:
                                action_output = {
                                    'updated_count': node_result.output.get('records_updated', 0),
                                    'updated_ids': node_result.output.get('updated_ids', [])
                                }
                            
                            # Store with node label key
                            if action_output:
                                execution.context[node_label_raw] = action_output
                                # Also store with original label (with spaces) for flexibility
                                execution.context[node_label] = action_output
                
                # Check if node failed
                if node_result.status == ExecutionStatus.FAILED:
                    logger.error(f"   ❌ Step {step_number} FAILED: {node_result.error}")
                    
                    # Check for fault path - if node has a fault edge, route to it instead of failing
                    fault_edge = self._get_fault_edge(node.id, flow.edges)
                    if fault_edge:
                        fault_target = fault_edge.target
                        logger.info(f"   🔀 FAULT PATH DETECTED: Routing to {fault_target}")
                        
                        # Store fault info in context for fault path nodes to access
                        execution.context['$Fault'] = {
                            'errorMessage': node_result.error,
                            'errorNodeId': node.id,
                            'errorNodeLabel': node_label,
                            'errorNodeType': node_type,
                            'timestamp': datetime.now(timezone.utc).isoformat()
                        }
                        
                        # Add fault target to execution order (if not already there)
                        # Skip remaining nodes on the normal path
                        # Mark this as a fault path execution
                        execution.context['_fault_path_active'] = True
                        execution.context['_fault_target_node'] = fault_target
                        
                        # Continue execution from fault target
                        # We need to find and execute the fault branch
                        fault_execution_order = self._build_fault_path_order(fault_target, flow.nodes, flow.edges)
                        logger.info(f"   🔀 Fault path execution order: {fault_execution_order}")
                        
                        # Execute fault path nodes
                        for fault_node_id in fault_execution_order:
                            fault_node = next((n for n in flow.nodes if n.id == fault_node_id), None)
                            if not fault_node:
                                continue
                            
                            fault_step = execution.context.get('_global_step_number', 2)
                            execution.context['_global_step_number'] = fault_step + 1
                            
                            fault_node_label = fault_node.data.get('label', 'Unnamed') if hasattr(fault_node, 'data') and fault_node.data else 'Unnamed'
                            logger.info(f"\n   🔀 FAULT PATH STEP {fault_step}: {fault_node.type.upper()} - {fault_node_label}")
                            
                            fault_result = await self._execute_node_with_retry(
                                fault_node, execution, flow, fault_step
                            )
                            execution.node_executions.append(fault_result)
                            
                            if fault_result.output:
                                execution.context.update(fault_result.output)
                            
                            # If fault path node also fails, stop
                            if fault_result.status == ExecutionStatus.FAILED:
                                execution.status = ExecutionStatus.FAILED
                                execution.error = f"Fault path node {fault_node.id} failed: {fault_result.error}"
                                break
                        
                        # After fault path, mark as partial success (flow handled the error)
                        if execution.status != ExecutionStatus.FAILED:
                            execution.status = ExecutionStatus.PARTIAL
                            execution.error = f"Flow completed via fault path after error in node {node.id}"
                        break
                    else:
                        # No fault path - fail the flow
                        execution.status = ExecutionStatus.FAILED
                        execution.error = f"Node {node.id} failed: {node_result.error}"
                        break
            
            # Mark as success if all nodes passed
            if execution.status == ExecutionStatus.RUNNING:
                execution.status = ExecutionStatus.SUCCESS
                
                # Add End step to execution logs
                final_step = execution.context.get('_global_step_number', 2)
                end_execution = NodeExecution(
                    node_id="end_node",
                    node_type="end",
                    step_number=final_step,
                    display_name="End",
                    category="End",
                    started_at=datetime.now(timezone.utc),
                    completed_at=datetime.now(timezone.utc),
                    status=ExecutionStatus.SUCCESS,
                    input={},
                    output={"flow_completed": True},
                    retry_count=0
                )
                execution.node_executions.append(end_execution)
                
                logger.info(f"\n{'=' * 80}")
                logger.info(f"🎉 FLOW EXECUTION COMPLETED SUCCESSFULLY")
                logger.info(f"   Total steps executed: {final_step}")
                logger.info(f"{'=' * 80}\n")
            
        except Exception as e:
            logger.error(f"\n{'=' * 80}")
            logger.error(f"❌ FLOW EXECUTION ERROR")
            logger.error(f"   Error: {str(e)}")
            logger.error(f"{'=' * 80}\n", exc_info=True)
            execution.status = ExecutionStatus.FAILED
            execution.error = str(e)
            
            # Add Failed End step to execution logs
            final_step = execution.context.get('_global_step_number', 2)
            end_execution = NodeExecution(
                node_id="end_node",
                node_type="end",
                step_number=final_step,
                display_name="End (Failed)",
                category="End",
                started_at=datetime.now(timezone.utc),
                completed_at=datetime.now(timezone.utc),
                status=ExecutionStatus.FAILED,
                input={},
                output={},
                error=str(e),
                retry_count=0
            )
            execution.node_executions.append(end_execution)
        
        finally:
            # Print execution trace summary
            tracer = execution.context.get("_tracer")
            if tracer:
                tracer.print_summary()
                # Store trace summary in execution record
                execution.context["_trace_summary"] = tracer.get_summary()
                # Cleanup tracer
                if execution.id in _active_tracers:
                    del _active_tracers[execution.id]
            
            # Remove tracer from context before saving (not serializable)
            if "_tracer" in execution.context:
                del execution.context["_tracer"]
            
            # Update execution record
            execution.completed_at = datetime.now(timezone.utc)
            await self.db.flow_executions.update_one(
                {"id": execution.id},
                {"$set": execution.dict(exclude={'id'})}
            )
        
        return execution
    
    def _handle_decision_outcome(self, decision_node: Node, output: Dict[str, Any], edges: List[Edge], execution: FlowExecution):
        """
        Handle decision node outcome - mark non-selected paths for skipping
        For simple IF: result=True means take first edge, False means take second edge (or remaining edges)
        """
        decision_type = output.get('decision_type')
        
        # Get all edges from this decision node
        decision_edges = [e for e in edges if e.source == decision_node.id]
        
        if not decision_edges:
            logger.warning(f"   ⚠️  Decision node {decision_node.id} has no outgoing edges!")
            return
        
        logger.info(f"\n   🔀 Decision Outcome Processing:")
        logger.info(f"      Decision Type: {decision_type}")
        logger.info(f"      Outgoing edges: {len(decision_edges)}")
        
        # Simple IF decision (true/false paths)
        if decision_type == "simple_if":
            result = output.get('result', False)
            logger.info(f"      Result: {result}")
            
            # Convention: First edge is TRUE path, remaining edges are FALSE/DEFAULT path
            # Skip the path that was NOT selected
            if result:
                # TRUE: Execute first edge target, skip rest
                selected_edge = decision_edges[0]
                skipped_edges = decision_edges[1:]
                logger.info(f"      ✅ Selected Path: TRUE (edge to {selected_edge.target})")
            else:
                # FALSE: Execute second edge target (or all except first), skip first
                selected_edge = decision_edges[1] if len(decision_edges) > 1 else None
                skipped_edges = [decision_edges[0]] if decision_edges else []
                if selected_edge:
                    logger.info(f"      ✅ Selected Path: FALSE/DEFAULT (edge to {selected_edge.target})")
                else:
                    logger.warning(f"      ⚠️  No FALSE path found!")
            
            # Mark nodes on non-selected paths to skip
            for edge in skipped_edges:
                target_id = edge.target
                if target_id not in execution.context['_skipped_nodes']:
                    execution.context['_skipped_nodes'].append(target_id)
                    logger.info(f"      ⏭️  Marking node {target_id} to SKIP")
        
        # Multi-outcome decision
        elif decision_type == "multi_outcome":
            matched_outcome = output.get('matched_outcome')
            logger.info(f"      Matched Outcome: {matched_outcome}")
            
            # In multi-outcome, edges should be labeled with outcome names
            # Find the edge with the matching label
            selected_edge = None
            for edge in decision_edges:
                edge_label = edge.label or ''
                if edge_label == matched_outcome or edge_label.lower() == matched_outcome.lower():
                    selected_edge = edge
                    break
            
            # If no matching label found, try matching by sourceHandle
            if not selected_edge:
                for edge in decision_edges:
                    if edge.sourceHandle == matched_outcome:
                        selected_edge = edge
                        break
            
            # If still no match, use first edge as fallback
            if not selected_edge and decision_edges:
                selected_edge = decision_edges[0]
                logger.warning(f"      ⚠️  No edge labeled '{matched_outcome}', using first edge")
            
            if selected_edge:
                logger.info(f"      ✅ Selected Path: {matched_outcome} (edge to {selected_edge.target})")
                
                # Mark all other paths to skip
                for edge in decision_edges:
                    if edge != selected_edge:
                        execution.context['_skipped_nodes'].append(edge.target)
                        logger.info(f"      ⏭️  Marking node {edge.target} to SKIP")
            else:
                logger.warning(f"      ⚠️  No edges found from decision node!")
    
    def _get_fault_edge(self, node_id: str, edges: List[Edge]) -> Optional[Edge]:
        """
        Get the fault path edge for a node if one exists.
        Fault edges have sourceHandle='fault'.
        
        Args:
            node_id: The ID of the source node
            edges: List of all edges in the flow
            
        Returns:
            The fault edge if found, None otherwise
        """
        for edge in edges:
            if edge.source == node_id:
                # Check if this is a fault edge
                source_handle = edge.sourceHandle if hasattr(edge, 'sourceHandle') else None
                if source_handle == 'fault':
                    logger.info(f"   🔀 Found fault edge: {edge.source} --[fault]--> {edge.target}")
                    return edge
        return None
    
    def _build_fault_path_order(self, start_node_id: str, nodes: List[Node], edges: List[Edge]) -> List[str]:
        """
        Build execution order for the fault path branch starting from a given node.
        Uses BFS to traverse the fault path until reaching an END node or terminal.
        
        Args:
            start_node_id: The starting node of the fault path
            nodes: List of all nodes in the flow
            edges: List of all edges in the flow
            
        Returns:
            List of node IDs in execution order for the fault path
        """
        order = []
        visited = set()
        queue = [start_node_id]
        
        # Build a quick lookup for node types
        node_map = {n.id: n for n in nodes}
        
        while queue:
            current_id = queue.pop(0)
            
            if current_id in visited:
                continue
            
            visited.add(current_id)
            
            # Skip END nodes from the order (they're terminal)
            current_node = node_map.get(current_id)
            if current_node and current_node.type not in ['end', 'END']:
                order.append(current_id)
            
            # Find outgoing edges (non-fault edges only, follow normal path)
            for edge in edges:
                if edge.source == current_id:
                    # Skip fault edges from the fault path itself
                    source_handle = edge.sourceHandle if hasattr(edge, 'sourceHandle') else None
                    if source_handle != 'fault':
                        if edge.target not in visited:
                            queue.append(edge.target)
        
        return order
    
    def _build_execution_order(self, nodes: List[Node], edges: List[Edge]) -> List[str]:
        """Build topological order for node execution - respects loop contexts"""
        
        logger.info(f"\n📊 Building execution order...")
        logger.info(f"   Total nodes: {len(nodes)}")
        logger.info(f"   Total edges: {len(edges)}")
        
        # Log all edges for debugging
        if edges:
            logger.info(f"   Edges in flow:")
            for edge in edges:
                logger.info(f"      {edge.source} → {edge.target}")
        else:
            logger.warning(f"   ⚠️  NO EDGES FOUND! All nodes are disconnected!")
        
        # Create a map of nodes by ID for quick lookup
        node_map = {node.id: node for node in nodes}
        
        # Identify nodes that are inside loops (these will be executed BY the loop node)
        nodes_in_loops = set()  # Nodes inside "For Each" branch - executed during iterations
        nodes_after_loops = set()  # Nodes in "After Last" branch - executed after iterations
        
        for node in nodes:
            loop_ctx = getattr(node, 'loopContext', None) or (node.data.get("loopContext") if hasattr(node, 'data') and node.data else None)

            if loop_ctx and isinstance(loop_ctx, dict):
                loop_node_id = loop_ctx.get("loopNodeId")
                is_inside_loop = loop_ctx.get("isInsideLoop", False)

                if loop_node_id:
                    if is_inside_loop and node.type != "loop":
                        # This node is in "For Each" branch
                        nodes_in_loops.add(node.id)
                        logger.info(f"   Node {node.id} ({node.data.get('label', 'Unnamed') if hasattr(node, 'data') and node.data else 'Unnamed'}) is INSIDE loop {loop_node_id} - will be executed during iterations")
                    elif not is_inside_loop and node.type != "loop":
                        # This node is in "After Last" branch
                        nodes_after_loops.add(node.id)
                        logger.info(f"   Node {node.id} ({node.data.get('label', 'Unnamed') if hasattr(node, 'data') and node.data else 'Unnamed'}) is in AFTER LAST of loop {loop_node_id} - will be executed after iterations")
        
        logger.info(f"📊 Loop context analysis:")
        logger.info(f"   Nodes inside loop iterations: {nodes_in_loops}")
        logger.info(f"   Nodes in After Last: {nodes_after_loops}")
        
        # IMPORTANT: Only exclude nodes that are IN loops (For Each or After Last)
        # Regular nodes that come AFTER a loop should still be in main execution order
        excluded_from_main_order = nodes_in_loops | nodes_after_loops
        
        # Build incoming edges map (excluding loop-context nodes that will be handled by loop)
        incoming = {node.id: [] for node in nodes if node.id not in excluded_from_main_order}
        for edge in edges:
            # Only add edge if both source and target are in main execution
            # Skip edges where target is inside a loop (those are handled by loop node)
            if edge.target not in excluded_from_main_order and edge.source not in excluded_from_main_order:
                incoming[edge.target].append(edge.source)
            # Special case: If source is a loop node and target is NOT in loop context,
            # the target should execute after the loop in main flow
            elif edge.source in node_map and node_map[edge.source].type == "loop" and edge.target not in excluded_from_main_order:
                incoming[edge.target].append(edge.source)
        
        # Find start nodes (no incoming edges or trigger nodes)
        start_nodes = [nid for nid, inc in incoming.items() if not inc and nid not in excluded_from_main_order]
        
        logger.info(f"   Start nodes (no incoming edges): {start_nodes}")
        
        # SPECIAL CASE: If ALL nodes are start nodes (no edges at all), use position-based ordering
        if len(start_nodes) >= len(nodes) - len(excluded_from_main_order) - 1:
            logger.warning(f"   ⚠️  ALL or most nodes are disconnected ({len(start_nodes)} start nodes) - using position-based ordering")
            
            # Sort nodes by Y position (top to bottom) for visual order
            position_sorted_nodes = []
            for node in nodes:
                if node.id in excluded_from_main_order:
                    continue
                # Skip end nodes - they should be last
                if node.type == "end" or node.id.startswith("end_"):
                    continue
                    
                y_pos = 0
                if hasattr(node, "position") and node.position:
                    y_pos = node.position.get("y", 0) if isinstance(node.position, dict) else getattr(node.position, 'y', 0)
                elif hasattr(node, "data") and node.data:
                    pos = node.data.get("position", {})
                    y_pos = pos.get("y", 0) if isinstance(pos, dict) else 0
                
                position_sorted_nodes.append((node.id, y_pos, node.type))
            
            # Sort by Y position (ascending - top to bottom)
            position_sorted_nodes.sort(key=lambda x: x[1])
            
            # Extract just the node IDs in position order
            order = [n[0] for n in position_sorted_nodes]
            
            # Add end nodes at the end
            for node in nodes:
                if (node.type == "end" or node.id.startswith("end_")) and node.id not in excluded_from_main_order:
                    order.append(node.id)
            
            logger.info(f"📋 Final execution order (position-based): {order}")
            logger.info(f"   Node positions: {[(n[0], n[1]) for n in position_sorted_nodes]}")
            return order
        
        if not start_nodes:
            # Look for trigger or start node
            for node in nodes:
                if (node.type == "trigger" or node.type == "start" or node.type == "webhook_trigger" or node.type == "scheduled_trigger") and node.id not in excluded_from_main_order:
                    start_nodes = [node.id]
                    break
        
        if not start_nodes and nodes:
            # If no clear start and minimal/no edges, use position-based ordering
            logger.warning("   ⚠️  No start nodes found - using position-based ordering")
            
            # Sort nodes by Y position (top to bottom) for visual order
            position_sorted_nodes = []
            for node in nodes:
                if node.id in excluded_from_main_order:
                    continue
                # Skip end nodes - they should be last
                if node.type == "end" or node.id.startswith("end_"):
                    continue
                
                y_pos = 0
                if hasattr(node, "position") and node.position:
                    y_pos = node.position.get("y", 0) if isinstance(node.position, dict) else getattr(node.position, 'y', 0)
                elif hasattr(node, "data") and node.data:
                    pos = node.data.get("position", {})
                    y_pos = pos.get("y", 0) if isinstance(pos, dict) else 0
                
                position_sorted_nodes.append((node.id, y_pos, node.type))
            
            # Sort by Y position (ascending - top to bottom)
            position_sorted_nodes.sort(key=lambda x: x[1])
            
            # Extract just the node IDs in position order
            order = [n[0] for n in position_sorted_nodes]
            
            # Add end nodes at the end
            for node in nodes:
                if (node.type == "end" or node.id.startswith("end_")) and node.id not in excluded_from_main_order:
                    order.append(node.id)
            
            logger.info(f"📋 Final execution order (position-based, no start): {order}")
            logger.info(f"   Node positions: {[(n[0], n[1]) for n in position_sorted_nodes]}")
            return order
        
        logger.info(f"🎬 Flow execution will start from: {start_nodes}")
        
        # Build execution order using BFS (excluding only nodes that are inside loops)
        visited = set()
        order = []
        queue = start_nodes.copy()
        
        while queue:
            current = queue.pop(0)
            if current in visited or current in excluded_from_main_order:
                continue
            
            visited.add(current)
            order.append(current)
            
            # Find outgoing edges from current node
            for edge in edges:
                if edge.source == current:
                    target = edge.target
                    # Skip if target is inside a loop (will be executed by loop node)
                    if target not in excluded_from_main_order and target not in visited:
                        queue.append(target)
        
        # Handle disconnected nodes (nodes with no edges)
        # CRITICAL FIX: Add disconnected nodes LAST, not during BFS
        # This ensures they run after all connected flow logic completes
        disconnected_nodes = []
        for node in nodes:
            if node.id not in visited and node.id not in excluded_from_main_order:
                logger.warning(f"   ⚠️  Node {node.id} ({node.data.get('label', 'Unnamed') if hasattr(node, 'data') and node.data else 'Unnamed'}) is disconnected - will execute LAST")
                disconnected_nodes.append(node.id)
        
        # Add disconnected nodes at the END
        order.extend(disconnected_nodes)
        
        logger.info(f"📋 Final execution order: {order}")
        logger.info(f"   (Excludes {len(excluded_from_main_order)} nodes that are inside loops)")
        if disconnected_nodes:
            logger.info(f"   ({len(disconnected_nodes)} disconnected nodes added at end)")
        return order
    
    def _build_query_condition(self, field_path: str, operator: str, value: str, 
                                substitute_fn, context: dict, is_array_path: bool = False) -> dict:
        """
        Build a MongoDB query condition for a field with given operator and value.
        
        Args:
            field_path: The MongoDB field path (e.g., "data.name" or "_related_account_0.data.name")
            operator: The comparison operator (equals, contains, etc.)
            value: The value to compare against
            substitute_fn: Function to substitute variables in value
            context: Flow execution context for variable substitution
            is_array_path: Whether the path points to an array (for $lookup results)
            
        Returns:
            MongoDB query condition dict
        """
        if is_array_path:
            # For array paths (lookup results), we need to match any element in the array
            # Use $elemMatch for the array element
            array_field = field_path.rsplit('.', 1)[0] if '.' in field_path else field_path
            inner_field = field_path.rsplit('.', 1)[1] if '.' in field_path else ''
            
            # Build inner condition
            inner_condition = self._build_simple_condition(inner_field, operator, value, substitute_fn, context)
            if inner_condition:
                # Wrap in $elemMatch for the related array
                elem_match_path = array_field.split('.')[0]
                remaining_path = '.'.join(array_field.split('.')[1:])
                if remaining_path:
                    return {elem_match_path: {"$elemMatch": {f"{remaining_path}.{inner_field}": inner_condition.get(inner_field, inner_condition)}}}
                else:
                    return {elem_match_path: {"$exists": True, "$ne": []}}  # At minimum ensure the lookup has results
            return {}
        else:
            return self._build_simple_condition(field_path, operator, value, substitute_fn, context)
    
    def _build_simple_condition(self, field_path: str, operator: str, value: str,
                                 substitute_fn, context: dict) -> dict:
        """Build a simple (non-array) MongoDB query condition."""
        import re
        from datetime import datetime, timezone, timedelta
        
        if operator == "isNull":
            return {field_path: {"$in": [None, ""]}}
        elif operator == "equals" and value:
            substituted_value = substitute_fn(str(value), context)
            # Make status field case-insensitive for better matching
            if field_path.lower().endswith("status"):
                return {field_path: {"$regex": f"^{re.escape(substituted_value)}$", "$options": "i"}}
            else:
                return {field_path: substituted_value}
        elif operator == "not_equals" and value:
            return {field_path: {"$ne": substitute_fn(str(value), context)}}
        elif operator == "notEquals" and value:
            return {field_path: {"$ne": substitute_fn(str(value), context)}}
        elif operator == "contains" and value:
            return {field_path: {"$regex": substitute_fn(str(value), context), "$options": "i"}}
        elif operator == "starts_with" and value:
            substituted_value = substitute_fn(str(value), context)
            return {field_path: {"$regex": f"^{substituted_value}", "$options": "i"}}
        elif operator == "startsWith" and value:
            substituted_value = substitute_fn(str(value), context)
            return {field_path: {"$regex": f"^{substituted_value}", "$options": "i"}}
        elif operator == "endsWith" and value:
            return {field_path: {"$regex": f"{substitute_fn(str(value), context)}$", "$options": "i"}}
        elif operator == "greaterThan" and value:
            return {field_path: {"$gt": substitute_fn(str(value), context)}}
        elif operator == "greater_than" and value:
            return {field_path: {"$gt": substitute_fn(str(value), context)}}
        elif operator == "lessThan" and value:
            return {field_path: {"$lt": substitute_fn(str(value), context)}}
        elif operator == "less_than" and value:
            return {field_path: {"$lt": substitute_fn(str(value), context)}}
        elif operator == "greaterThanOrEqual" and value:
            return {field_path: {"$gte": substitute_fn(str(value), context)}}
        elif operator == "greater_than_or_equal" and value:
            return {field_path: {"$gte": substitute_fn(str(value), context)}}
        elif operator == "lessThanOrEqual" and value:
            return {field_path: {"$lte": substitute_fn(str(value), context)}}
        elif operator == "less_than_or_equal" and value:
            return {field_path: {"$lte": substitute_fn(str(value), context)}}
        # DATE OPERATORS: Last X Days / Next X Days
        elif operator == "last_x_days" and value:
            try:
                days = int(value)
                cutoff_date = datetime.now(timezone.utc) - timedelta(days=days)
                cutoff_str = cutoff_date.isoformat()
                logger.info(f"   📅 LAST_X_DAYS: {days} days, cutoff: {cutoff_str}")
                return {field_path: {"$gte": cutoff_str}}
            except (ValueError, TypeError):
                logger.warning(f"   ⚠️ Invalid value for last_x_days: {value}")
                return {}
        elif operator == "next_x_days" and value:
            try:
                days = int(value)
                now = datetime.now(timezone.utc)
                future_date = now + timedelta(days=days)
                now_str = now.isoformat()
                future_str = future_date.isoformat()
                logger.info(f"   📅 NEXT_X_DAYS: {days} days, range: {now_str} to {future_str}")
                return {field_path: {"$gte": now_str, "$lte": future_str}}
            except (ValueError, TypeError):
                logger.warning(f"   ⚠️ Invalid value for next_x_days: {value}")
                return {}
        return {}
    
    def _get_node_display_name(self, node: Node) -> str:
        """
        Get display name for a node: use label if available, otherwise format node type
        
        Examples:
            - If label exists: "Calculate Priority"
            - If no label: "Assignment" (formatted from node type)
        """
        # Priority 1: Use user-provided label
        if hasattr(node, 'label') and node.label and node.label.strip():
            return node.label.strip()
        
        # Priority 2: Check in node.data dict
        if hasattr(node, 'data') and node.data and isinstance(node.data, dict):
            if 'label' in node.data and node.data['label']:
                return node.data['label'].strip()
        
        # Priority 3: Fall back to formatted node type
        return self._format_node_type_name(node.type)
    
    def _format_node_type_name(self, node_type: str) -> str:
        """
        Format node type into human-readable name
        
        Examples:
            assignment -> Assignment
            mcp -> CRM Action
            http_request -> HTTP Request
            collection_filter -> Collection Filter
        """
        # Special cases
        special_names = {
            'mcp': 'CRM Action',
            'ai_prompt': 'AI Prompt',
            'http_request': 'HTTP Request',
            'google_sheets': 'Google Sheets',
            'collection_sort': 'Collection Sort',
            'collection_filter': 'Collection Filter',
            'create_record': 'Create Record',
            'mcp_create_record': 'Create Record',
            'update_record': 'Update Record',
            'mcp_update_record': 'Update Record',
            'delete_record': 'Delete Record',
            'mcp_delete_record': 'Delete Record',
            'get_records': 'Get Records',
            'mcp_get_records': 'Get Records'
        }
        
        if node_type in special_names:
            return special_names[node_type]
        
        # Default: capitalize and replace underscores with spaces
        return node_type.replace('_', ' ').title()
    
    def _get_node_category(self, node_type: str) -> str:
        """
        Get category for a node type for better log organization
        
        Categories: Trigger, Decision, Assignment, Get, Loop, Update, Create, Delete, Delay, Hook, etc.
        """
        category_map = {
            # CRM Record Operations
            'mcp': 'CRM',
            'create_record': 'CRM',
            'mcp_create_record': 'CRM',
            'update_record': 'CRM',
            'mcp_update_record': 'CRM',
            'delete_record': 'CRM',
            'mcp_delete_record': 'CRM',
            'get_records': 'CRM',
            'mcp_get_records': 'CRM',
            
            # Logic & Control
            'decision': 'Decision',
            'condition': 'Decision',
            'assignment': 'Assignment',
            'loop': 'Loop',
            'wait': 'Delay',
            'delay': 'Delay',
            'merge': 'Logic',
            
            # User Interaction
            'screen': 'Screen',
            'add_error': 'Error',
            
            # Data Operations
            'transform': 'Data',
            'collection_sort': 'Data',
            'collection_filter': 'Data',
            
            # External Integrations
            'http_request': 'Hook',
            'webhook': 'Hook',
            'database': 'Data',
            'google_sheets': 'Integration',
            'slack': 'Integration',
            'teams': 'Integration',
            
            # Triggers
            'trigger': 'Trigger',
            'webhook_trigger': 'Trigger',
            'scheduled_trigger': 'Trigger',
            
            # Other
            'ai_prompt': 'AI',
            'function': 'Custom',
            'action': 'Action',
            'connector': 'Connector',
            'end': 'End'
        }
        
        return category_map.get(node_type, 'Other')

    
    async def _execute_node_with_retry(
        self, 
        node: Node, 
        execution: FlowExecution,
        flow: Flow,
        step_number: Optional[int] = None
    ) -> NodeExecution:
        """Execute a node with retry logic and enhanced logging"""
        
        # Get display name: use label if available, otherwise fall back to formatted node type
        display_name = self._get_node_display_name(node)
        
        # Get category from node type
        category = self._get_node_category(node.type)
        
        node_execution = NodeExecution(
            node_id=node.id,
            node_type=node.type,
            step_number=step_number,
            display_name=display_name,
            category=category,
            started_at=datetime.now(timezone.utc),
            status=ExecutionStatus.RUNNING,
            input={"config": node.config, "context": execution.context},
            retry_count=0
        )
        
        logger.info(f"\n{'─' * 60}")
        if step_number:
            logger.info(f"📍 STEP {step_number}: {display_name} [{category}]")
        else:
            logger.info(f"📍 {display_name} [{category}]")
        logger.info(f"   Node ID: {node.id}")
        logger.info(f"   Type: {node.type}")
        logger.info(f"{'─' * 60}")
        
        for attempt in range(self.max_retries):
            try:
                node_execution.retry_count = attempt
                
                # Execute based on node type
                output = await self._execute_node_by_type(node, execution, flow)
                
                node_execution.status = ExecutionStatus.SUCCESS
                node_execution.output = output
                node_execution.completed_at = datetime.now(timezone.utc)
                
                logger.info(f"✅ {display_name} — Completed")
                break
                
            except Exception as e:
                logger.error(f"Node {node.id} execution error (attempt {attempt + 1}): {str(e)}")
                
                if attempt < self.max_retries - 1:
                    await asyncio.sleep(self.retry_delay * (attempt + 1))
                else:
                    node_execution.status = ExecutionStatus.FAILED
                    node_execution.error = str(e)
                    node_execution.completed_at = datetime.now(timezone.utc)
        
        return node_execution
    
    async def _execute_node_by_type(
        self,
        node: Node,
        execution: FlowExecution,
        flow: Flow
    ) -> Dict[str, Any]:
        """Execute node based on its type"""

        try:
            if node.type == NodeType.ACTION:
                return await self._execute_action_node(node, execution)

            elif node.type == NodeType.CONNECTOR:
                return await self._execute_connector_node(node, execution)

            elif node.type == NodeType.MCP:
                return await self._execute_mcp_node(node, execution)

            elif node.type == NodeType.AI_PROMPT:
                return await self._execute_ai_prompt_node(node, execution)

            elif node.type == NodeType.CONDITION:
                return await self._execute_condition_node(node, execution)

            elif node.type == NodeType.ASSIGNMENT:
                return await self._execute_assignment_node(node, execution)

            elif node.type == NodeType.DECISION:
                return await self._execute_decision_node(node, execution)

            elif node.type == NodeType.LOOP:
                return await self._execute_loop_node(node, execution, flow)
            
            elif node.type == NodeType.DELAY or node.type == "delay":
                return await self._execute_delay_node(node, execution, flow)

            elif node.type == NodeType.TRANSFORM:
                return await self._execute_transform_node(node, execution)

            elif node.type == NodeType.COLLECTION_SORT:
                return await self._execute_collection_sort_node(node, execution)

            elif node.type == NodeType.COLLECTION_FILTER:
                return await self._execute_collection_filter_node(node, execution)

            elif node.type == NodeType.WEBHOOK or node.type == "webhook":
                # Webhook nodes - call external APIs
                return await self._execute_webhook(node.config, execution)

            elif node.type == NodeType.END:
                return {"status": "flow_completed"}

            # Custom Error node - terminates flow with configured error message
            elif node.type == NodeType.CUSTOM_ERROR or node.type == "add_error" or node.type == "custom_error":
                return await self._execute_custom_error_node(node, execution)

            elif node.type == NodeType.MERGE:
                return await self._execute_merge_node(node, execution, flow)
            
            # Start/Trigger nodes - these are entry points, not executed
            elif node.type == "trigger" or node.type == "start" or node.type == "webhook_trigger" or node.type == "scheduled_trigger":
                logger.info(f"Skipping start/trigger node: {node.id} (entry point)")
                return {"status": "skipped", "message": "Entry point node"}
            
            # Screen nodes - these are UI interaction points, skip during execution
            elif node.type == "screen":
                logger.info(f"Skipping screen node: {node.id} (UI interaction point)")
                return {"status": "skipped", "message": "Screen interaction node"}
            
            # CRM Record Operations - map to MCP actions
            elif node.type in ["create_record", "mcp_create_record"]:
                logger.info(f"Executing CRM Create Record node: {node.id}")
                # Map to MCP create action
                node.config["action_type"] = "create"
                return await self._mcp_record_create(node.config, execution)
            
            elif node.type in ["update_record", "mcp_update_record"]:
                logger.info(f"Executing CRM Update Record node: {node.id}")
                # Map to MCP update action
                node.config["action_type"] = "update"
                return await self._mcp_record_update(node.config, execution)
            
            elif node.type in ["delete_record", "mcp_delete_record"]:
                logger.info(f"Executing CRM Delete Record node: {node.id}")
                # Map to MCP delete action
                node.config["action_type"] = "delete"
                return await self._mcp_record_delete(node.config, execution)
            
            elif node.type in ["get_records", "mcp_get_records"]:
                logger.info(f"Executing CRM Get Records node: {node.id}")
                # Map to MCP get action
                node.config["action_type"] = "get"
                return await self._mcp_record_get(node.config, execution)
            
            # Send Email node - map to connector
            elif node.type == "send_email" or node.type == "email":
                logger.info(f"Executing Send Email node: {node.id}")
                # Ensure connector_type is set
                if not node.config.get("connector_type"):
                    node.config["connector_type"] = "sendgrid"
                return await self._execute_connector_node(node, execution)
            
            # Send Notification node - create in-app notification
            elif node.type == "send_notification":
                logger.info(f"Executing Send Notification node: {node.id}")
                return await self._execute_send_notification_node(node, execution)

            else:
                raise ValueError(f"Unknown node type: {node.type}")
        except Exception as e:
            logger.error(f"Error executing node {node.id} of type {node.type}: {str(e)}")
            raise  # Re-raise to maintain original error handling behavior
    
    async def _execute_action_node(self, node: Node, execution: FlowExecution) -> Dict[str, Any]:
        """Execute generic action node"""
        logger.info(f"Executing action node: {node.id}")
        
        action = node.config.get("action", "unknown")
        
        # Execute action based on configuration
        return {
            "action": action,
            "executed_at": datetime.now(timezone.utc).isoformat(),
            "result": "success"
        }
    
    async def _execute_custom_error_node(self, node: Node, execution: FlowExecution) -> Dict[str, Any]:
        """
        Execute Custom Error node (Salesforce-like Add Error)
        This is a TERMINAL node that stops the flow and surfaces an error message.
        
        Salesforce-style schema: Each error message has its own type and field:
        errorMessages: [
          { type: "window", field: null, message: "..." },
          { type: "inline", field: "email", message: "..." }
        ]
        
        Also supports legacy schema for backwards compatibility.
        """
        logger.info(f"\n   {'─' * 60}")
        logger.info(f"   ⚠️  CUSTOM ERROR NODE: {node.id}")
        logger.info(f"   {'─' * 60}")
        
        # Get error configuration
        error_label = node.config.get("label", "Custom Error")
        api_name = node.config.get("api_name", node.id)
        
        # Support new Salesforce-style schema and legacy schema
        error_messages = node.config.get("errorMessages", [])
        if not error_messages:
            # Fallback to legacy single message
            legacy_message = node.config.get("errorMessage", node.config.get("error_message", "An error occurred in the flow"))
            legacy_mode = node.config.get("displayMode", "window")
            legacy_field = node.config.get("targetField")
            error_messages = [{"type": legacy_mode, "field": legacy_field, "message": legacy_message}]
        
        # Process and substitute variables in all error messages
        processed_errors = []
        for err_msg in error_messages:
            msg_text = err_msg.get("message", "")
            msg_type = err_msg.get("type", "window")
            msg_field = err_msg.get("field")
            
            if msg_text:
                # Substitute variables (supports both {!var} and {{var}} syntax)
                substituted_msg = self._substitute_variables(msg_text, execution.context)
                processed_errors.append({
                    "type": msg_type,
                    "field": msg_field,
                    "message": substituted_msg
                })
        
        # Combine all messages for the exception (use first error's message as primary)
        combined_message = " | ".join([e["message"] for e in processed_errors]) if processed_errors else "An error occurred in the flow"
        
        logger.error(f"   ❌ Custom Error Triggered: {error_label}")
        logger.error(f"   ❌ Error Messages ({len(processed_errors)}):")
        for i, err in enumerate(processed_errors):
            logger.error(f"      {i+1}. [{err['type']}] {err['message']}")
            if err['field']:
                logger.error(f"         → Field: {err['field']}")
        
        # Get tracer for logging
        tracer = execution.context.get("_tracer")
        if tracer:
            tracer.trace_entries.append({
                "timestamp": time.time() - tracer.start_time,
                "type": "CUSTOM_ERROR",
                "node_id": node.id,
                "error_label": error_label,
                "errors": processed_errors,
                "message_count": len(processed_errors)
            })
        
        # Raise a custom exception to stop the flow
        # This will be caught by the main execution loop and marked as FAILED
        raise FlowCustomError(
            message=combined_message,
            error_label=error_label,
            api_name=api_name,
            node_id=node.id
        )
    
    async def _execute_connector_node(self, node: Node, execution: FlowExecution) -> Dict[str, Any]:
        """Execute external connector node (e.g., Send Email)"""
        logger.info(f"\n   {'─' * 60}")
        logger.info(f"   📧 Executing Connector Node: {node.id}")
        logger.info(f"   {'─' * 60}")
        
        connector_type = node.config.get("connector_type")
        email_service = node.config.get("email_service", "system")  # Default to system SMTP
        
        logger.info(f"   Connector Type: {connector_type}")
        logger.info(f"   Email Service: {email_service}")
        
        # Get tracer for logging
        tracer = execution.context.get("_tracer")
        
        # FIX #4: Validate Send Email node configuration before execution
        if connector_type == "sendgrid":
            recipients = node.config.get("recipients", [])
            subject = node.config.get("subject", "").strip()
            body = node.config.get("body", "").strip()
            
            logger.info(f"   Recipients configured: {len(recipients)}")
            logger.info(f"   Subject: {subject[:50]}..." if len(subject) > 50 else f"   Subject: {subject}")
            logger.info(f"   Body length: {len(body)} chars")
            
            if not recipients or not subject or not body:
                missing_fields = []
                if not recipients:
                    missing_fields.append("recipients")
                if not subject:
                    missing_fields.append("subject")
                if not body:
                    missing_fields.append("body")
                
                error_msg = f"Send Email node not configured — missing required fields: {', '.join(missing_fields)}. Execution skipped."
                logger.error(f"   ❌ {error_msg}")
                raise ValueError(error_msg)
        
        if connector_type == "sendgrid":
            # Check which email service to use
            if email_service == "system":
                logger.info(f"   📤 Sending via System SMTP...")
                from ..connectors.system_email_connector import send_email_via_system
                # Pass db for cross-object merge field resolution (e.g., {{Account.Name}})
                result = await send_email_via_system(node.config, execution.context, db=self.db)
                
                # Log to tracer
                if tracer:
                    tracer.trace_entries.append({
                        "timestamp": time.time() - tracer.start_time,
                        "type": "EMAIL_SENT",
                        "service": "system",
                        "recipients": result.get("recipients", []),
                        "subject": result.get("subject", ""),
                        "status": result.get("status", "unknown")
                    })
                
                logger.info(f"   ✅ Email result: {result.get('status', 'unknown')}")
                return result
            else:
                logger.info(f"   📤 Sending via SendGrid API...")
                from ..connectors.sendgrid_connector import SendGridConnector
                connector = SendGridConnector(self.db)
                result = await connector.execute(node.config, execution.context)
                
                # Log to tracer
                if tracer:
                    tracer.trace_entries.append({
                        "timestamp": time.time() - tracer.start_time,
                        "type": "EMAIL_SENT",
                        "service": "sendgrid",
                        "to_email": result.get("to_email", ""),
                        "subject": result.get("subject", ""),
                        "success": result.get("success", False)
                    })
                
                logger.info(f"   ✅ SendGrid result: {result.get('success', False)}")
                return result
        
        else:
            raise ValueError(f"Unknown connector type: {connector_type}")
    
    async def _execute_send_notification_node(self, node: Node, execution: FlowExecution) -> Dict[str, Any]:
        """
        Execute Send Notification node - creates an in-app notification.
        
        Config expected:
        - recipient_user_id: str - User ID to receive notification (can be dynamic like {!Record.OwnerId})
        - title: str - Notification title
        - message: str - Notification message body
        - target_object_type: str (optional) - Object type for deep linking
        - target_object_id: str (optional) - Object ID for deep linking  
        - target_url: str (optional) - Custom URL for deep linking
        - priority: str (optional) - CRITICAL, NORMAL, FYI (default: NORMAL)
        """
        logger.info(f"\n   {'─' * 60}")
        logger.info(f"   🔔 SEND NOTIFICATION NODE: {node.id}")
        logger.info(f"   {'─' * 60}")
        
        config = node.config
        context = execution.context
        
        # Get recipient - support variable substitution
        recipient = config.get("recipient_user_id", "")
        if recipient.startswith("{!") and recipient.endswith("}"):
            var_name = recipient[2:-1]
            recipient = context.get(var_name, context.get("variables", {}).get(var_name, ""))
        
        # Get title and message - support variable substitution
        title = config.get("title", "Notification")
        message = config.get("message", "")
        
        # Substitute variables in title and message
        for key, value in context.items():
            if isinstance(value, str):
                title = title.replace(f"{{!{key}}}", value).replace(f"{{{{{key}}}}}", value)
                message = message.replace(f"{{!{key}}}", value).replace(f"{{{{{key}}}}}", value)
        
        # Get optional fields
        target_object_type = config.get("target_object_type")
        target_object_id = config.get("target_object_id")
        target_url = config.get("target_url")
        priority = config.get("priority", "NORMAL")
        
        # Substitute variables in target fields
        if target_object_id and target_object_id.startswith("{!"):
            var_name = target_object_id[2:-1]
            target_object_id = context.get(var_name, context.get("variables", {}).get(var_name, ""))
        
        if not recipient:
            raise ValueError("Send Notification node requires recipient_user_id")
        
        logger.info(f"   Recipient: {recipient}")
        logger.info(f"   Title: {title}")
        logger.info(f"   Message: {message[:50]}..." if len(message) > 50 else f"   Message: {message}")
        
        # Create notification using the notification engine
        try:
            from modules.notifications.services import get_notification_engine
            
            notification_engine = get_notification_engine(self.db)
            tenant_id = context.get("tenant_id", "default")
            created_by = context.get("current_user_id", "flow")
            
            notification = await notification_engine.notify_custom(
                tenant_id=tenant_id,
                recipient_user_id=recipient,
                title=title,
                message=message,
                target_object_type=target_object_type,
                target_object_id=target_object_id,
                target_url=target_url,
                priority=priority,
                created_by=created_by
            )
            
            if notification:
                logger.info(f"   ✅ Notification created: {notification.id}")
                return {
                    "success": True,
                    "notification_id": notification.id,
                    "recipient": recipient
                }
            else:
                logger.info(f"   ⚠️ Notification not created (user preferences)")
                return {
                    "success": False,
                    "reason": "User preferences disabled",
                    "recipient": recipient
                }
                
        except Exception as e:
            logger.error(f"   ❌ Failed to send notification: {str(e)}")
            raise ValueError(f"Failed to send notification: {str(e)}")
    
    async def _execute_mcp_node(self, node: Node, execution: FlowExecution) -> Dict[str, Any]:
        """Execute MCP (CRM internal) node"""
        logger.info(f"\n   {'─' * 60}")
        logger.info(f"   📊 Executing CRM Action")
        logger.info(f"   {'─' * 60}")
        
        mcp_action = node.config.get("mcp_action")
        action_type = node.config.get("action_type")
        object_type = node.config.get("object", "").lower()
        
        # Get tracer for DML logging
        tracer = execution.context.get("_tracer")
        
        # Handle both old mcp_action format and new action_type format
        if action_type:
            logger.info(f"   Action: {action_type.upper()}")
            logger.info(f"   Object: {object_type.capitalize()}")
            
            if action_type == "create":
                logger.info(f"   ➕ Creating new {object_type} record...")
                result = await self._mcp_record_create(node.config, execution)
                record_id = result.get('record_id', 'N/A')
                logger.info(f"   ✅ Record created: ID = {record_id}")
                
                # Log DML to tracer
                if tracer:
                    tracer.log_dml("create", object_type, 1, [record_id] if record_id != 'N/A' else [])
                
                return result
                
            elif action_type == "get":
                logger.info(f"   🔍 Querying {object_type} records...")
                result = await self._mcp_record_get(node.config, execution)
                record_count = len(result.get(f"{object_type}_records", []))
                logger.info(f"   ✅ Found {record_count} record(s)")
                if record_count > 0:
                    logger.info(f"   📤 Stored in: {{{object_type}_records}}")
                return result
                
            elif action_type == "update":
                logger.info(f"   ✏️  Updating {object_type} record(s)...")
                result = await self._mcp_record_update(node.config, execution)
                updated_count = result.get('records_updated', 0)
                update_mode = result.get('update_mode', 'filter')
                
                # Log DML to tracer
                if tracer:
                    tracer.log_dml("update", object_type, updated_count, result.get('updated_ids', []))
                
                if update_mode == 'collection':
                    collection = result.get('collection_variable', 'unknown')
                    logger.info(f"   ✅ Bulk updated {updated_count} record(s) from collection {collection}")
                else:
                    logger.info(f"   ✅ Updated {updated_count} record(s) matching filter conditions")
                return result
                
            elif action_type == "delete":
                logger.info(f"   🗑️  Deleting {object_type} record...")
                result = await self._mcp_record_delete(node.config, execution)
                deleted_count = result.get('deleted_count', 1)
                logger.info(f"   ✅ Record deleted")
                
                # Log DML to tracer
                if tracer:
                    tracer.log_dml("delete", object_type, deleted_count, [])
                
                return result
        
        # Handle old mcp_action format
        if mcp_action == "crm.lead.update":
            logger.info(f"   ✏️  Updating Lead...")
            result = await self._mcp_lead_update(node.config, execution)
            logger.info(f"   ✅ Lead updated")
            return result
        
        elif mcp_action == "crm.activity.create":
            logger.info(f"   ➕ Creating Activity...")
            result = await self._mcp_activity_create(node.config, execution)
            logger.info(f"   ✅ Activity created")
            return result
        
        elif mcp_action == "crm.contact.create":
            logger.info(f"   ➕ Creating Contact...")
            result = await self._mcp_contact_create(node.config, execution)
            logger.info(f"   ✅ Contact created")
            return result
        
        elif mcp_action == "crm.record.create":
            # Generic record creation - supports any object
            logger.info(f"   ➕ Creating record...")
            result = await self._mcp_record_create(node.config, execution)
            logger.info(f"   ✅ Record created")
            return result
        
        elif mcp_action == "crm.record.update":
            # Generic record update
            logger.info(f"   ✏️  Updating record...")
            result = await self._mcp_record_update(node.config, execution)
            logger.info(f"   ✅ Record updated")
            return result
        
        elif mcp_action == "crm.record.get":
            # Generic record get/query
            logger.info(f"   🔍 Querying records...")
            result = await self._mcp_record_get(node.config, execution)
            logger.info(f"   ✅ Query completed")
            return result
        
        elif mcp_action == "crm.record.delete":
            # Generic record delete
            return await self._mcp_record_delete(node.config, execution)
        
        elif mcp_action == "system.webhook":
            # Webhook - external API call
            return await self._execute_webhook(node.config, execution)
        
        else:
            raise ValueError(f"Unknown MCP action: {mcp_action}")
    
    async def _mcp_lead_update(self, config: Dict[str, Any], execution: FlowExecution) -> Dict[str, Any]:
        """Update a lead in CRM"""
        import re
        
        lead_id = config.get("lead_id") or execution.context.get("lead_id")
        updates = config.get("updates", {})
        
        if not lead_id:
            raise ValueError("No lead_id provided for update")
        
        # Apply variable substitution using self method
        def substitute_variables(text, context):
            return self._substitute_variables(text, context) if isinstance(text, str) else text
        
        for key, value in updates.items():
            updates[key] = substitute_variables(value, execution.context)
        
        result = await self.db.object_records.update_one(
            {"id": lead_id, "tenant_id": execution.tenant_id},
            {"$set": {f"data.{k}": v for k, v in updates.items()}}
        )
        
        return {
            "action": "crm.lead.update",
            "lead_id": lead_id,
            "updates": updates,
            "matched": result.matched_count,
            "modified": result.modified_count
        }
    
    async def _mcp_activity_create(self, config: Dict[str, Any], execution: FlowExecution) -> Dict[str, Any]:
        """Create a task/activity in CRM"""
        import re
        
        activity_data = config.get("activity_data", {})
        
        # Apply variable substitution using self method
        def substitute_variables(text, context):
            return self._substitute_variables(text, context) if isinstance(text, str) else text
        
        # Substitute variables in all activity_data fields
        for key, value in activity_data.items():
            activity_data[key] = substitute_variables(value, execution.context)
        
        task_id = str(uuid.uuid4())
        
        # Create as a task (which exists in CRM)
        task_record = {
            "id": task_id,
            "object_name": "task",
            "tenant_id": execution.tenant_id,
            "data": {
                **activity_data,
                "subject": activity_data.get("subject", "Flow Task"),
                "status": activity_data.get("status", "Completed"),
                "priority": activity_data.get("priority", "Normal"),
                "description": activity_data.get("description", "Created by Flow Builder"),
                "created_from_flow": True,
                "flow_id": execution.flow_id,
                "execution_id": execution.id
            },
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        
        await self.db.object_records.insert_one(task_record)
        
        return {
            "action": "crm.activity.create",
            "task_id": task_id,
            "activity_data": activity_data
        }
    
    async def _mcp_contact_create(self, config: Dict[str, Any], execution: FlowExecution) -> Dict[str, Any]:
        """Create a contact in CRM"""
        import re
        
        contact_data = config.get("contact_data", {})
        
        # Apply variable substitution using self method
        def substitute_variables(text, context):
            return self._substitute_variables(text, context) if isinstance(text, str) else text
        
        for key, value in contact_data.items():
            contact_data[key] = substitute_variables(value, execution.context)
        
        contact_id = str(uuid.uuid4())
        contact_record = {
            "id": contact_id,
            "object_name": "contact",
            "tenant_id": execution.tenant_id,
            "data": {
                **contact_data,
                "created_from_flow": True,
                "flow_id": execution.flow_id
            },
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        
        await self.db.object_records.insert_one(contact_record)

        return {
            "action": "crm.contact.create",
            "contact_id": contact_id,
            "contact_data": contact_data
        }


    async def _mcp_record_create(self, config: Dict[str, Any], execution: FlowExecution) -> Dict[str, Any]:
        """Create a generic CRM record (Account, Contact, Lead, Task, etc.)"""
        
        # Get object type and field values from config
        object_type = config.get("object", "").lower()
        field_values = config.get("field_values", [])
        
        if not object_type:
            raise ValueError("No object type specified for record creation")
        
        # Build record data from field_values array with variable substitution
        record_data = {}
        for field_mapping in field_values:
            field_name = field_mapping.get("field")
            field_value = field_mapping.get("value")
            
            if field_name and field_value:
                # Apply variable substitution and formula evaluation
                if isinstance(field_value, str):
                    field_value = self._substitute_variables(field_value, execution.context)
                record_data[field_name] = field_value
        
        record_id = str(uuid.uuid4())
        
        # Generate series_id
        series_id = await self._generate_series_id(execution.tenant_id, object_type, record_id)
        
        # Create the record
        new_record = {
            "id": record_id,
            "series_id": series_id,
            "object_name": object_type,
            "tenant_id": execution.tenant_id,
            "data": {
                **record_data,
                "created_from_flow": True,
                "flow_id": execution.flow_id,
                "execution_id": execution.id
            },
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        
        await self.db.object_records.insert_one(new_record)
        
        logger.info(f"Created {object_type} record with ID: {record_id}, series_id: {series_id}")
        
        # Store in context for later reference
        execution.context[f"{object_type}_id"] = record_id
        execution.context[f"created_{object_type}"] = record_data
        
        return {
            "action": "crm.record.create",
            "object_type": object_type,
            "record_id": record_id,
            "series_id": series_id,
            "record_data": record_data
        }
    
    async def _generate_series_id(self, tenant_id: str, object_name: str, record_id: str) -> str:
        """Generate series_id using UUID-based format"""
        import random
        import string
        
        # Define prefixes for each object type
        prefix_map = {
            "lead": "led",
            "task": "tsk",
            "contact": "con",
            "event": "evt",
            "opportunity": "opp",
            "account": "acc",
            "note": "not",
            "call": "cal"
        }
        
        prefix = prefix_map.get(object_name.lower(), "rec")
        
        # Extract last part of UUID (after last dash)
        uuid_suffix = record_id.split('-')[-1]
        
        # Generate base series_id
        series_id = f"{prefix}-{uuid_suffix}"
        
        # Check for uniqueness - if exists, append random suffix
        existing = await self.db.object_records.find_one({
            "tenant_id": tenant_id,
            "object_name": object_name,
            "series_id": series_id
        })
        
        if existing:
            random_suffix = ''.join(random.choices(string.ascii_lowercase + string.digits, k=4))
            series_id = f"{prefix}-{uuid_suffix}-{random_suffix}"
        
        return series_id
        

    async def _mcp_record_update(self, config: Dict[str, Any], execution: FlowExecution) -> Dict[str, Any]:
        """Update an existing CRM record using filter conditions OR bulk update from collection
        
        Includes safeguards to prevent infinite trigger loops by marking records as
        updated by flow, which db_trigger can check via the _updated_by_flow flag.
        """
        import re
        
        object_type = config.get("object", "").lower()
        update_mode = config.get("update_mode", "filter")  # 'filter' or 'collection'
        
        if not object_type:
            raise ValueError("No object type specified for record update")
        
        # Handle bulk update from collection
        if update_mode == "collection":
            collection_variable = config.get("collection_variable", "")
            
            if not collection_variable:
                raise ValueError("No collection variable specified for bulk update")
            
            # Get collection from context - handle malformed variable names
            # Clean: {{{var}}}, {{var}}, {var}, or var -> var
            collection_var_clean = collection_variable
            # Remove all { and } characters
            collection_var_clean = collection_var_clean.replace('{', '').replace('}', '').strip()
            
            collection = execution.context.get(collection_var_clean, [])
            
            logger.info(f"\n{'=' * 80}")
            logger.info(f"🔍 BULK UPDATE DEBUG - START")
            logger.info(f"{'=' * 80}")
            logger.info(f"Collection Variable: {collection_variable} (cleaned: {collection_var_clean})")
            logger.info(f"Collection Type: {type(collection)}")
            logger.info(f"Collection Length: {len(collection) if isinstance(collection, list) else 'N/A'}")
            logger.info(f"Available Context Keys: {[k for k in execution.context.keys() if not k.startswith('trigger_')][:20]}")
            
            if not isinstance(collection, list):
                logger.error(f"❌ Collection '{collection_variable}' is not a list or doesn't exist")
                raise ValueError(f"Collection variable '{collection_variable}' is not a list or doesn't exist")
            
            if len(collection) == 0:
                logger.info("⚠️ Collection is empty, no records to update")
                return {
                    "action": "crm.record.update",
                    "update_mode": "collection",
                    "object_type": object_type,
                    "records_updated": 0
                }
            
            logger.info(f"\n📦 BULK UPDATE: Processing {len(collection)} {object_type} record(s)")
            logger.info(f"{'─' * 80}\n")
            
            # Update each record in the collection
            updated_count = 0
            for idx, item in enumerate(collection):
                logger.info(f"\n📝 Item {idx + 1}/{len(collection)}:")
                logger.info(f"   Type: {type(item)}")
                logger.info(f"   Has 'id': {'id' in item if isinstance(item, dict) else False}")
                
                if isinstance(item, dict):
                    logger.info(f"   Keys: {list(item.keys())}")
                    if 'id' in item:
                        logger.info(f"   ID: {item.get('id')}")
                    if 'data' in item:
                        logger.info(f"   Data Keys: {list(item.get('data', {}).keys())}")
                
                if isinstance(item, dict) and 'id' in item:
                    record_id = item.get('id')
                    
                    # Build update data from item's data field
                    update_data = {}
                    if 'data' in item and isinstance(item['data'], dict):
                        update_data = item['data']
                        logger.info(f"   ✅ Using item.data fields: {list(update_data.keys())}")
                        # Log actual values for debugging
                        for k, v in list(update_data.items())[:5]:
                            logger.info(f"      {k} = {str(v)[:100]}")
                    else:
                        # Use the item directly if it doesn't have a 'data' field
                        update_data = {k: v for k, v in item.items() if k not in ['id', 'object_name', 'tenant_id', 'created_at', 'updated_at', 'series_id']}
                        logger.info(f"   ⚠️  No 'data' field, using item fields: {list(update_data.keys())}")
                    
                    if not update_data:
                        logger.warning(f"   ⚠️  No update data extracted from item, skipping")
                        continue
                    
                    logger.info(f"   🔄 Updating record_id={record_id}")
                    logger.info(f"   📝 Fields to update: {list(update_data.keys())}")
                    
                    # Update the record in database
                    result = await self.db.object_records.update_one(
                        {
                            "id": record_id,
                            "object_name": object_type,
                            "tenant_id": execution.tenant_id
                        },
                        {
                            "$set": {
                                f"data.{key}": value for key, value in update_data.items()
                            }
                        }
                    )
                    
                    logger.info(f"   💾 MongoDB Result: matched={result.matched_count}, modified={result.modified_count}")
                    
                    if result.matched_count == 0:
                        logger.warning(f"   ⚠️  Record not found in database!")
                    elif result.modified_count == 0:
                        logger.info(f"   ℹ️  Record matched but no changes made (values already same)")
                    else:
                        logger.info(f"   ✅ Record updated successfully!")
                    
                    if result.modified_count > 0 or result.matched_count > 0:
                        updated_count += 1
                else:
                    logger.warning(f"   ⚠️  Item {idx + 1} skipped: not a dict or missing 'id'")
            
            logger.info(f"\n{'─' * 80}")
            logger.info(f"✅ BULK UPDATE COMPLETE: {updated_count}/{len(collection)} {object_type} record(s) updated")
            logger.info(f"{'=' * 80}\n")
            
            return {
                "action": "crm.record.update",
                "update_mode": "collection",
                "object_type": object_type,
                "collection_size": len(collection),
                "records_updated": updated_count,
                "collection_variable": collection_variable
            }
        
        # Original filter-based update logic
        filter_conditions = config.get("filter_conditions", [])
        field_values = config.get("field_values", [])
        fields = config.get("fields", [])  # Alternative field mapping
        record_id = config.get("record_id", "")  # Direct record ID
        
        # NEW: Handle reference-based record targeting (e.g., Opportunity.AccountId → Account)
        record_source = config.get("record_source", "")  # "reference", "direct", "filter"
        reference_field = config.get("reference_field", "")  # e.g., "Trigger.Opportunity.AccountId"
        target_object = config.get("target_object", object_type)  # Object type to update
        
        if record_source == "reference" and reference_field:
            logger.info(f"🔗 REFERENCE-BASED UPDATE")
            logger.info(f"   Reference Field: {reference_field}")
            logger.info(f"   Target Object: {target_object}")
            
            # Resolve the reference field to get the target record ID
            resolved_ref_id = self._substitute_variables(reference_field, execution.context)
            
            # If substitution didn't work, try manual resolution
            if resolved_ref_id == reference_field or not resolved_ref_id:
                resolved_ref_id = await self._resolve_reference_field(reference_field, execution.context)
            
            logger.info(f"   Resolved Reference ID: {resolved_ref_id}")
            
            if not resolved_ref_id or resolved_ref_id == reference_field:
                logger.warning(f"   ⚠️ Could not resolve reference field: {reference_field}")
                return {
                    "action": "crm.record.update",
                    "record_source": "reference",
                    "object_type": target_object,
                    "records_updated": 0,
                    "error": f"Could not resolve reference field: {reference_field}",
                    "message": "Reference field resolved to null or empty - parent record may not be set"
                }
            
            # Build update data from field_values
            update_data = {}
            for fv in field_values:
                field_name = fv.get("field")
                field_value = fv.get("value", "")
                if field_name:
                    resolved_value = self._substitute_variables(str(field_value), execution.context)
                    update_data[field_name] = resolved_value
            
            # Also check 'fields' config
            for f in fields:
                field_name = f.get("field") or f.get("name")
                field_value = f.get("value", "")
                if field_name:
                    resolved_value = self._substitute_variables(str(field_value), execution.context)
                    update_data[field_name] = resolved_value
            
            if not update_data:
                logger.warning(f"   ⚠️ No fields to update specified")
                return {
                    "action": "crm.record.update",
                    "record_source": "reference",
                    "object_type": target_object,
                    "reference_id": resolved_ref_id,
                    "records_updated": 0,
                    "message": "No fields specified for update"
                }
            
            logger.info(f"   📝 Fields to update: {list(update_data.keys())}")
            
            # Update the referenced record
            result = await self.db.object_records.update_one(
                {
                    "id": resolved_ref_id,
                    "object_name": target_object.lower(),
                    "tenant_id": execution.tenant_id
                },
                {
                    "$set": {f"data.{k}": v for k, v in update_data.items()}
                }
            )
            
            logger.info(f"   ✅ Updated {target_object} via reference: matched={result.matched_count}, modified={result.modified_count}")
            
            # Log DML operation for tracing
            if execution.context.get("_tracer") and result.modified_count > 0:
                execution.context["_tracer"].log_dml("update", target_object, result.modified_count, [resolved_ref_id])
            
            return {
                "action": "crm.record.update",
                "record_source": "reference",
                "object_type": target_object,
                "reference_field": reference_field,
                "reference_id": resolved_ref_id,
                "records_updated": result.modified_count,
                "fields_updated": list(update_data.keys())
            }
        
        # NEW: Handle "Record from Loop" - update current item in loop iteration
        if record_source == "loop" or config.get("update_mode") == "loop":
            logger.info(f"🔁 LOOP-BASED UPDATE (Current Item from Loop)")
            
            # Get current loop context
            loop_context = execution.context.get("_loop_context", {})
            current_item = loop_context.get("current_item") or execution.context.get("$CurrentItem") or execution.context.get("currentItem")
            
            if not current_item:
                logger.warning(f"   ⚠️ No current item in loop context")
                return {
                    "action": "crm.record.update",
                    "record_source": "loop",
                    "object_type": object_type,
                    "records_updated": 0,
                    "error": "Not inside a loop or no current item available"
                }
            
            # Get the record ID from the current item
            record_id_from_loop = None
            if isinstance(current_item, dict):
                record_id_from_loop = current_item.get('id') or current_item.get('Id')
            
            if not record_id_from_loop:
                logger.warning(f"   ⚠️ Current item has no 'id' field")
                return {
                    "action": "crm.record.update",
                    "record_source": "loop",
                    "object_type": object_type,
                    "records_updated": 0,
                    "error": "Current loop item has no 'id' field"
                }
            
            logger.info(f"   📍 Current Item ID: {record_id_from_loop}")
            
            # Build update data from field_values
            update_data = {}
            for fv in field_values:
                field_name = fv.get("field")
                field_value = fv.get("value", "")
                if field_name:
                    resolved_value = self._substitute_variables(str(field_value), execution.context)
                    update_data[field_name] = resolved_value
            
            # Also check 'fields' config
            for f in fields:
                field_name = f.get("field") or f.get("name")
                field_value = f.get("value", "")
                if field_name:
                    resolved_value = self._substitute_variables(str(field_value), execution.context)
                    update_data[field_name] = resolved_value
            
            if not update_data:
                logger.warning(f"   ⚠️ No fields to update specified")
                return {
                    "action": "crm.record.update",
                    "record_source": "loop",
                    "object_type": object_type,
                    "record_id": record_id_from_loop,
                    "records_updated": 0,
                    "message": "No fields specified for update"
                }
            
            logger.info(f"   📝 Fields to update: {list(update_data.keys())}")
            
            # Update the current loop item record
            result = await self.db.object_records.update_one(
                {
                    "id": record_id_from_loop,
                    "object_name": object_type.lower(),
                    "tenant_id": execution.tenant_id
                },
                {
                    "$set": {f"data.{k}": v for k, v in update_data.items()}
                }
            )
            
            logger.info(f"   ✅ Updated {object_type} from loop: matched={result.matched_count}, modified={result.modified_count}")
            
            # Log DML operation for tracing
            if execution.context.get("_tracer") and result.modified_count > 0:
                execution.context["_tracer"].log_dml("update", object_type, result.modified_count, [record_id_from_loop])
            
            return {
                "action": "crm.record.update",
                "record_source": "loop",
                "object_type": object_type,
                "record_id": record_id_from_loop,
                "records_updated": result.modified_count,
                "fields_updated": list(update_data.keys()),
                "loop_iteration": loop_context.get("current_index", 0) + 1
            }
        
        # Handle direct record_id (e.g., from trigger)
        if record_id:
            # Resolve variable reference
            resolved_id = self._substitute_variables(str(record_id), execution.context)
            logger.info(f"🔍 Update using direct record_id: {record_id} → {resolved_id}")
            
            # Check if we have the trigger record ID - handle various reference formats
            if not resolved_id or resolved_id == record_id:
                # Try common trigger ID variable names
                trigger_data = execution.context.get('Trigger', {})
                
                # Handle {!trigger_id} reference
                if record_id in ['{!trigger_id}', '{!Trigger.Id}', '$trigger_id', '$record.id']:
                    resolved_id = trigger_data.get('Id') or execution.context.get('id') or execution.context.get('trigger_id')
                    logger.info(f"📌 Resolved trigger_id reference: {resolved_id}")
                
                # Fallback: try to get 'id' from context directly
                if not resolved_id:
                    resolved_id = execution.context.get('id')
                    logger.info(f"📌 Using context id: {resolved_id}")
            
            if resolved_id and resolved_id != record_id:
                # Build update data from field_values or fields
                update_data = {}
                for fv in field_values:
                    field_name = fv.get("field")
                    field_value = fv.get("value", "")
                    if field_name:
                        resolved_value = self._substitute_variables(str(field_value), execution.context)
                        update_data[field_name] = resolved_value
                
                # Also check 'fields' config
                for f in fields:
                    field_name = f.get("field") or f.get("name")
                    field_value = f.get("value", "")
                    if field_name:
                        resolved_value = self._substitute_variables(str(field_value), execution.context)
                        update_data[field_name] = resolved_value
                
                if not update_data:
                    logger.warning(f"⚠️ No fields to update specified")
                    return {
                        "action": "crm.record.update",
                        "object_type": object_type,
                        "record_id": resolved_id,
                        "records_updated": 0,
                        "message": "No fields specified for update"
                    }
                
                # Update the record directly
                result = await self.db.object_records.update_one(
                    {
                        "id": resolved_id,
                        "object_name": object_type,
                        "tenant_id": execution.tenant_id
                    },
                    {
                        "$set": {f"data.{k}": v for k, v in update_data.items()}
                    }
                )
                
                logger.info(f"✅ Updated record {resolved_id}: matched={result.matched_count}, modified={result.modified_count}")
                
                return {
                    "action": "crm.record.update",
                    "object_type": object_type,
                    "record_id": resolved_id,
                    "records_updated": result.modified_count,
                    "fields_updated": list(update_data.keys())
                }
        
        if not filter_conditions or len(filter_conditions) == 0:
            raise ValueError("No filter conditions specified to find record for update")
        
        # Apply variable substitution using self method
        def substitute_variables(text, context):
            return self._substitute_variables(text, context) if isinstance(text, str) else text
        
        # Build query from filter conditions
        query = {
            "object_name": object_type,
            "tenant_id": execution.tenant_id
        }
        
        logger.info(f"🔍 Building update query for {object_type}")
        logger.info(f"📦 Execution context keys: {list(execution.context.keys())}")
        if 'Trigger' in execution.context:
            logger.info(f"⚡ Trigger data: {execution.context['Trigger']}")
        
        for condition in filter_conditions:
            field_name = condition.get("field")
            operator = condition.get("operator", "equals")
            value = condition.get("value", "")

            logger.info(f"🔎 Processing condition: {field_name} {operator} '{value}'")

            if field_name:
                # Handle 'id' field specially - it's at the top level, not in data
                if field_name.lower() == 'id':
                    field_path = "id"
                else:
                    field_path = f"data.{field_name}"

                # Substitute variables in the value BEFORE comparing
                substituted_value = substitute_variables(str(value), execution.context)
                logger.info(f"✅ After substitution: '{value}' → '{substituted_value}'")

                if operator == "isNull":
                    query[field_path] = {"$in": [None, ""]}
                elif operator == "isNotNull" or operator == "is_not_null":
                    query[field_path] = {"$nin": [None, ""], "$exists": True}
                elif operator == "equals" and value:
                    # Make status field case-insensitive for better matching
                    if field_name.lower() == "status":
                        query[field_path] = {"$regex": f"^{re.escape(substituted_value)}$", "$options": "i"}
                    else:
                        query[field_path] = substituted_value
                elif operator == "notEquals" and value:
                    query[field_path] = {"$ne": substituted_value}
                elif operator == "contains" and value:
                    query[field_path] = {"$regex": substituted_value, "$options": "i"}
                elif operator == "startsWith" and value:
                    query[field_path] = {"$regex": f"^{substituted_value}", "$options": "i"}
                elif operator == "endsWith" and value:
                    query[field_path] = {"$regex": f"{substituted_value}$", "$options": "i"}
                elif operator == "greaterThan" and value:
                    query[field_path] = {"$gt": substituted_value}
                elif operator == "lessThan" and value:
                    query[field_path] = {"$lt": substituted_value}
                elif operator == "greaterThanOrEqual" and value:
                    query[field_path] = {"$gte": substituted_value}
                elif operator == "lessThanOrEqual" and value:
                    query[field_path] = {"$lte": substituted_value}
        
        # Find the record(s) first
        records = await self.db.object_records.find(query, {"_id": 0}).to_list(length=100)
        
        # Handle case when no records found - gracefully return 0 updates instead of failing
        if len(records) == 0:
            logger.info(f"⚠️ No {object_type} records found matching filter conditions - skipping update")
            return {
                "action": "crm.record.update",
                "object_type": object_type,
                "records_updated": 0,
                "message": f"No {object_type} records matched the filter conditions",
                "query_used": query
            }
        
        logger.info(f"Found {len(records)} {object_type} record(s) matching filter conditions for update")
        
        # Process field values - handles both direct and parent field updates
        processed_updates = await self._process_parent_field_updates(
            field_values, 
            execution,
            records[0] if records else None  # Pass first matching record for reference resolution
        )
        
        direct_updates = processed_updates["direct_updates"]
        parent_updates = processed_updates["parent_updates"]
        
        # Log what we're updating
        logger.info(f"📝 Direct updates: {direct_updates}")
        logger.info(f"🔗 Parent updates: {parent_updates}")
        
        # Update direct fields on matching records
        direct_result_count = 0
        if direct_updates:
            logger.info(f"🔄 Updating {len(records)} record(s) with direct fields: {direct_updates}")
            
            result = await self.db.object_records.update_many(
                query,
                {
                    "$set": {
                        f"data.{key}": value for key, value in direct_updates.items()
                    }
                }
            )
            direct_result_count = result.modified_count
            logger.info(f"✅ Updated {direct_result_count} {object_type} record(s)")
        
        # Execute parent record updates
        parent_results = []
        if parent_updates:
            parent_results = await self._execute_parent_updates(parent_updates, execution)
            logger.info(f"✅ Completed {len(parent_results)} parent record update(s)")
        
        return {
            "action": "crm.record.update",
            "update_mode": "filter",
            "object_type": object_type,
            "records_found": len(records),
            "records_updated": direct_result_count,
            "updated_fields": direct_updates,
            "parent_updates": parent_results,
            "filter_conditions": filter_conditions
        }
    
    async def _mcp_record_get(self, config: Dict[str, Any], execution: FlowExecution) -> Dict[str, Any]:
        """Get/Query CRM records with advanced filtering and sorting"""
        import re
        
        object_type = config.get("object", "").lower()
        filter_conditions = config.get("filter_conditions", [])
        output_variable = config.get("output_variable", "")  # Custom variable name for results
        # If output_variable is set, default to "all" records (typical for loop usage)
        records_to_store = config.get("records_to_store", "all" if output_variable else "first")  # 'first' or 'all'
        store_mode = config.get("store_mode", "automatic")  # 'automatic' or 'manual'
        fields_to_store = config.get("fields_to_store", [])  # List of field names
        sort_field = config.get("sort_field", "")
        sort_direction = config.get("sort_direction", "asc")  # 'asc' or 'desc'
        no_records_action = config.get("no_records_action", "continue")  # 'continue' or 'stop'
        
        if not object_type:
            raise ValueError("No object type specified for record query")
        
        # Apply variable substitution using self method
        def substitute_variables(text, context):
            return self._substitute_variables(text, context) if isinstance(text, str) else text
        
        # Build query from filter conditions
        query = {
            "object_name": object_type,
            "tenant_id": execution.tenant_id
        }
        
        # Track if we need aggregation pipeline for dot-walk queries
        needs_aggregation = False
        aggregation_lookups = []
        aggregation_match = {"$and": []}
        
        logger.info(f"📝 Building Get Records query for {object_type}")
        logger.info(f"   Filter conditions: {filter_conditions}")
        
        for condition in filter_conditions:
            field_name = condition.get("field")
            operator = condition.get("operator", "equals")
            value = condition.get("value", "")
            
            logger.info(f"   Processing: field='{field_name}', operator='{operator}', value='{value}'")
            
            if field_name:
                # Check if this is a dot-walk path (e.g., "account_id.name" or "owner_id.email")
                if '.' in field_name:
                    needs_aggregation = True
                    parts = field_name.split('.')
                    # First part is the reference field, rest is the path in related object
                    ref_field = parts[0]
                    related_path = '.'.join(parts[1:])
                    
                    # Generate unique alias for this lookup
                    lookup_alias = f"_related_{ref_field}_{len(aggregation_lookups)}"
                    
                    # Add lookup stage (join with related collection)
                    # The ref_field should contain the ID of the related record
                    aggregation_lookups.append({
                        "$lookup": {
                            "from": "object_records",
                            "let": {"ref_id": f"$data.{ref_field}"},
                            "pipeline": [
                                {"$match": {
                                    "$expr": {"$eq": ["$id", "$$ref_id"]},
                                    "tenant_id": execution.tenant_id
                                }}
                            ],
                            "as": lookup_alias
                        }
                    })
                    
                    # Build the condition for the related field
                    related_field_path = f"{lookup_alias}.data.{related_path}"
                    condition_match = self._build_query_condition(
                        related_field_path, operator, value, 
                        lambda v, ctx: substitute_variables(v, ctx), execution.context,
                        is_array_path=True
                    )
                    if condition_match:
                        aggregation_match["$and"].append(condition_match)
                    
                    logger.info(f"   Added dot-walk lookup: {ref_field} -> {related_path}")
                else:
                    # Regular field - direct query
                    field_path = f"data.{field_name}"
                    condition_match = self._build_query_condition(
                        field_path, operator, value,
                        lambda v, ctx: substitute_variables(v, ctx), execution.context
                    )
                    if condition_match:
                        if needs_aggregation:
                            aggregation_match["$and"].append(condition_match)
                        else:
                            query.update(condition_match)
        
        logger.info(f"   Needs aggregation: {needs_aggregation}")
        
        # Execute query - use aggregation if dot-walk, otherwise simple find
        if needs_aggregation:
            # Build aggregation pipeline
            pipeline = [
                {"$match": {"object_name": object_type, "tenant_id": execution.tenant_id}}
            ]
            pipeline.extend(aggregation_lookups)
            
            # Add match stage for conditions if we have any
            if aggregation_match["$and"]:
                pipeline.append({"$match": aggregation_match})
            
            # Remove the lookup arrays from output to clean up results
            projection = {"_id": 0}
            for lookup in aggregation_lookups:
                alias = lookup["$lookup"]["as"]
                projection[alias] = 0
            pipeline.append({"$project": projection})
            
            logger.info(f"   Aggregation pipeline: {pipeline}")
            
            # Apply sorting if specified
            if sort_field:
                sort_dir = -1 if sort_direction == "desc" else 1
                pipeline.append({"$sort": {f"data.{sort_field}": sort_dir}})
            
            # Determine record limit
            if records_to_store == "first":
                limit = 1
            else:
                limit = 200
            pipeline.append({"$limit": limit})
            
            # Execute aggregation
            records = await self.db.object_records.aggregate(pipeline).to_list(length=limit)
            logger.info(f"   Aggregation returned {len(records)} records")
        else:
            # Standard find query (no dot-walk)
            logger.info(f"   Final MongoDB query: {query}")
            
            # Build cursor
            cursor = self.db.object_records.find(query, {"_id": 0})
            
            # Apply sorting if specified
            if sort_field:
                sort_dir = -1 if sort_direction == "desc" else 1
                cursor = cursor.sort(f"data.{sort_field}", sort_dir)
            
            # Determine record limit based on records_to_store setting
            if records_to_store == "first":
                limit = 1
            else:  # 'all'
                limit = 200  # Max 200 records for safety (Salesforce-like behavior)
            
            # Query records
            records = await cursor.limit(limit).to_list(length=limit)
        
        logger.info(f"Found {len(records)} {object_type} record(s) matching filters")
        
        # Handle no records found
        if len(records) == 0 and no_records_action == "stop":
            raise ValueError(f"No {object_type} records found matching the filter conditions")
        
        # Process records based on store_mode
        if store_mode == "manual" and fields_to_store:
            # Store only selected fields
            filtered_records = []
            for record in records:
                filtered_record = {
                    "id": record.get("id"),
                    "series_id": record.get("series_id"),
                    "object_name": record.get("object_name"),
                }
                # Add only selected fields from data
                filtered_data = {}
                for field_name in fields_to_store:
                    if field_name and field_name in record.get("data", {}):
                        filtered_data[field_name] = record["data"][field_name]
                filtered_record["data"] = filtered_data
                filtered_records.append(filtered_record)
            records = filtered_records
        
        # CRITICAL FIX: Merge trigger record with query results for After Insert triggers
        # This solves the visibility issue where newly inserted records may not be
        # immediately queryable due to transaction timing
        if execution.trigger_type == "db" and len(records) >= 0:
            logger.info(f"\n{'─' * 60}")
            logger.info(f"🔍 CHECKING FOR TRIGGER RECORD MERGE")
            logger.info(f"{'─' * 60}")
            logger.info(f"   Trigger Type: {execution.trigger_type}")
            logger.info(f"   Query returned: {len(records)} records")

            # Check if there's a trigger record in context
            trigger_data = execution.context.get('Trigger', {})
            if trigger_data and isinstance(trigger_data, dict):
                # Get the trigger record for the current object type
                object_type_capitalized = object_type.capitalize()
                trigger_record_data = trigger_data.get(object_type_capitalized, {})

                logger.info(f"   Trigger has {object_type_capitalized}: {bool(trigger_record_data)}")

                if trigger_record_data:
                    try:
                        if isinstance(trigger_record_data, list):
                            # Handle bulk insert - trigger_record_data is a list of records
                            logger.info(f"   📦 Handling bulk insert with {len(trigger_record_data)} records")
                            merged_count = 0
                            for trigger_item in trigger_record_data:
                                if isinstance(trigger_item, dict):
                                    # Check if trigger_item matches the filter conditions
                                    trigger_matches = True

                                    for condition in filter_conditions:
                                        field_name = condition.get("field")
                                        operator = condition.get("operator", "equals")
                                        expected_value = condition.get("value", "")

                                        # Get actual value from trigger record
                                        actual_value = trigger_item.get(field_name)

                                        # Substitute variables in expected value
                                        if isinstance(expected_value, str):
                                            expected_value = self._substitute_variables(expected_value, execution.context)

                                        # Check condition (case-insensitive for status field)
                                        if operator == "equals":
                                            if field_name and field_name.lower() == "status":
                                                if str(actual_value).lower() != str(expected_value).lower():
                                                    trigger_matches = False
                                                    break
                                            else:
                                                if str(actual_value) != str(expected_value):
                                                    trigger_matches = False
                                                    break
                                        elif operator == "contains":
                                            if expected_value and expected_value.lower() not in str(actual_value).lower():
                                                trigger_matches = False
                                                break
                                        elif operator == "startsWith":
                                            if expected_value and not str(actual_value).startswith(expected_value):
                                                trigger_matches = False
                                                break
                                        # Add more operators as needed

                                    if trigger_matches:
                                        # Check if trigger record is already in results
                                        trigger_id = trigger_item.get('id', trigger_item.get('Id'))
                                        already_in_results = any(r.get('id') == trigger_id for r in records)

                                        if not already_in_results and trigger_id:
                                            logger.info(f"   ✅ MERGING TRIGGER RECORD (ID: {trigger_id})")

                                            # Build a proper record structure
                                            trigger_record = {
                                                "id": trigger_id,
                                                "object_name": object_type,
                                                "tenant_id": execution.tenant_id,
                                                "data": trigger_item
                                            }

                                            # Add to beginning of records list
                                            records.insert(0, trigger_record)
                                            merged_count += 1

                            logger.info(f"   📦 Merged {merged_count} trigger records")
                            logger.info(f"   📦 New collection size: {len(records)}")

                        elif isinstance(trigger_record_data, dict):
                            # Handle single insert (existing code)
                            # Check if trigger record matches the filter conditions
                            trigger_matches = True

                            logger.info(f"   Checking if trigger record matches filters...")
                            for condition in filter_conditions:
                                field_name = condition.get("field")
                                operator = condition.get("operator", "equals")
                                expected_value = condition.get("value", "")

                                # Get actual value from trigger record
                                actual_value = trigger_record_data.get(field_name)

                                # Substitute variables in expected value
                                if isinstance(expected_value, str):
                                    expected_value = self._substitute_variables(expected_value, execution.context)

                                logger.info(f"      {field_name}: actual={actual_value}, expected={expected_value}, operator={operator}")

                                # Check condition
                                if operator == "equals":
                                    if str(actual_value) != str(expected_value):
                                        trigger_matches = False
                                        logger.info(f"         ❌ Mismatch")
                                        break
                                elif operator == "contains":
                                    if expected_value and expected_value.lower() not in str(actual_value).lower():
                                        trigger_matches = False
                                        logger.info(f"         ❌ Doesn't contain")
                                        break
                                elif operator == "startsWith":
                                    if expected_value and not str(actual_value).startswith(expected_value):
                                        trigger_matches = False
                                        logger.info(f"         ❌ Doesn't start with")
                                        break
                                # Add more operators as needed

                                logger.info(f"         ✅ Match")

                            if trigger_matches:
                                # Check if trigger record is already in results
                                trigger_id = trigger_record_data.get('id', trigger_data.get('Id'))
                                already_in_results = any(r.get('id') == trigger_id for r in records)

                                if not already_in_results and trigger_id:
                                    logger.info(f"   ✅ MERGING TRIGGER RECORD (ID: {trigger_id})")

                                    # Build a proper record structure
                                    trigger_record = {
                                        "id": trigger_id,
                                        "object_name": object_type,
                                        "tenant_id": execution.tenant_id,
                                        "data": trigger_record_data
                                    }

                                    # Add to beginning of records list
                                    records.insert(0, trigger_record)
                                    logger.info(f"   📦 New collection size: {len(records)}")
                                else:
                                    logger.info(f"   ℹ️  Trigger record already in query results or missing ID")
                            else:
                                logger.info(f"   ❌ Trigger record doesn't match filter conditions")
                        else:
                            logger.info(f"   ℹ️  Trigger record data is neither list nor dict")
                    except Exception as e:
                        logger.warning(f"   ⚠️  Error during trigger record merge: {e}")
                        logger.warning(f"   Continuing with original records without merge")
                else:
                    logger.info(f"   ℹ️  No trigger record data found")
            else:
                logger.info(f"   ℹ️  No trigger context available")

            logger.info(f"{'─' * 60}\n")
        
        # Store in execution context for use in next steps
        execution.context[f"{object_type}_records"] = records
        
        # Also store with custom output_variable name if provided
        if output_variable:
            clean_var_name = output_variable.strip().replace('{', '').replace('}', '')
            execution.context[clean_var_name] = records
            logger.info(f"   💾 Stored {len(records)} items in context: {{{{{clean_var_name}}}}}")
        
        if len(records) > 0:
            # Store first record for easy access
            execution.context[f"{object_type}_record"] = records[0]
            
            # IMPORTANT: Store the record's ID as {object_type}_id for easy access
            # The ID is at the top level of the record, not in 'data'
            record_id = records[0].get("id")
            if record_id:
                execution.context[f"{object_type}_id"] = record_id
                # Also store with capitalized form for case-insensitive access
                execution.context[f"{object_type}_Id"] = record_id
                logger.info(f"   💾 Stored record ID: {{{{{object_type}_id}}}} = {record_id}")
            
            # Also store individual fields from first record for easy variable access
            first_record_data = records[0].get("data", {})
            for field_name, field_value in first_record_data.items():
                execution.context[f"{object_type}_{field_name}"] = field_value
        
        logger.info(f"Stored {len(records)} record(s) in context with keys: {object_type}_records, {object_type}_record, {object_type}_id")
        
        return {
            "action": "crm.record.get",
            "object_type": object_type,
            "record_count": len(records),
            "records_to_store_mode": records_to_store,
            "store_mode": store_mode,
            "fields_stored": fields_to_store if store_mode == "manual" else "all",
            "records": records[:5]  # Return only first 5 in result for logging
        }
    
    async def _mcp_record_delete(self, config: Dict[str, Any], execution: FlowExecution) -> Dict[str, Any]:
        """Delete CRM records using filter conditions or by record ID"""
        import re
        
        object_type = config.get("object", "").lower()
        delete_mode = config.get("delete_mode", "filter")  # 'filter' or 'current_item'
        record_id_variable = config.get("record_id_variable", "")
        filter_conditions = config.get("filter_conditions", [])
        
        if not object_type:
            raise ValueError("No object type specified for record deletion")
        
        # Apply variable substitution using self method
        def substitute_variables(text, context):
            return self._substitute_variables(text, context) if isinstance(text, str) else text
        
        # Handle current_item mode (for deleting in loops)
        if delete_mode == "current_item" and record_id_variable:
            logger.info(f"🗑️  Delete mode: current_item, variable: {record_id_variable}")
            logger.info(f"   Context keys available: {list(execution.context.keys())[:20]}")
            
            # Get the record ID from context
            record_id = substitute_variables(record_id_variable, execution.context)
            logger.info(f"   After substitution: {type(record_id)} = {record_id if not isinstance(record_id, dict) else f'dict with keys: {list(record_id.keys())}'}")
            
            # If it's still in {{}} format, try to extract
            if isinstance(record_id, str) and record_id.startswith('{{'):
                clean_var = record_id.strip('{}').strip()
                record_id = execution.context.get(clean_var)
                logger.info(f"   Extracted from context['{clean_var}']: {type(record_id)}")
            
            # If record_id is a dict (currentItem), get its 'id' field
            if isinstance(record_id, dict):
                record_id = record_id.get('id')
                logger.info(f"   Extracted 'id' from dict: {record_id}")
            
            logger.info(f"🗑️  Final record_id to delete: {record_id}")
            
            if not record_id:
                logger.error(f"   ❌ Could not resolve record ID")
                logger.error(f"   Variable: {record_id_variable}")
                logger.error(f"   Available context: {list(execution.context.keys())[:30]}")
                raise ValueError("Could not resolve record ID for deletion")
            
            # Delete by ID
            result = await self.db.object_records.delete_one({
                "id": record_id,
                "object_name": object_type,
                "tenant_id": execution.tenant_id
            })
            
            logger.info(f"✅ Deleted {result.deleted_count} {object_type} record (ID: {record_id})")
            
            return {
                "action": "crm.record.delete",
                "object_type": object_type,
                "delete_mode": "current_item",
                "record_id": record_id,
                "deleted_count": result.deleted_count
            }
        
        # Handle filter mode (original behavior)
        if not filter_conditions or len(filter_conditions) == 0:
            raise ValueError("No filter conditions specified to find record for deletion")
        
        # Build query from filter conditions
        query = {
            "object_name": object_type,
            "tenant_id": execution.tenant_id
        }
        
        logger.info(f"🔍 Building delete query for {object_type}")
        logger.info(f"   Filter conditions: {filter_conditions}")
        
        for condition in filter_conditions:
            field_name = condition.get("field")
            operator = condition.get("operator", "equals")
            value = condition.get("value", "")
            
            logger.info(f"   Processing filter: field='{field_name}', operator='{operator}', value='{value}'")
            
            if field_name:
                # Special handling for 'id' field - it's at root level, not in data
                if field_name == "id":
                    field_path = "id"
                else:
                    field_path = f"data.{field_name}"
                
                if operator == "isNull":
                    query[field_path] = {"$in": [None, ""]}
                elif operator == "equals" and value:
                    resolved_value = substitute_variables(str(value), execution.context)
                    query[field_path] = resolved_value
                    logger.info(f"   Query: {field_path} = {resolved_value}")
                elif operator == "notEquals" and value:
                    query[field_path] = {"$ne": substitute_variables(str(value), execution.context)}
                elif operator == "contains" and value:
                    query[field_path] = {"$regex": substitute_variables(str(value), execution.context), "$options": "i"}
                elif operator == "greaterThan" and value:
                    query[field_path] = {"$gt": substitute_variables(str(value), execution.context)}
                elif operator == "lessThan" and value:
                    query[field_path] = {"$lt": substitute_variables(str(value), execution.context)}
        
        logger.info(f"   Final delete query: {query}")
        
        # Find the records first to log what will be deleted
        records = await self.db.object_records.find(query, {"_id": 0}).to_list(length=100)
        
        # Handle case when no records found - gracefully return 0 deletes instead of failing
        if len(records) == 0:
            logger.info(f"⚠️ No {object_type} records found matching filter conditions for deletion - skipping delete")
            return {
                "action": "crm.record.delete",
                "object_type": object_type,
                "delete_mode": "filter",
                "records_found": 0,
                "deleted_count": 0,
                "message": f"No {object_type} records matched the filter conditions",
                "filter_conditions": filter_conditions
            }
        
        logger.info(f"Found {len(records)} {object_type} record(s) matching filter conditions for deletion")
        
        # Delete all matching records
        result = await self.db.object_records.delete_many(query)
        
        logger.info(f"Deleted {result.deleted_count} {object_type} record(s)")
        
        return {
            "action": "crm.record.delete",
            "object_type": object_type,
            "delete_mode": "filter",
            "records_found": len(records),
            "deleted_count": result.deleted_count,
            "filter_conditions": filter_conditions
        }
    
    async def _execute_webhook(self, config: Dict[str, Any], execution: FlowExecution) -> Dict[str, Any]:
        """Execute webhook - make external API call with full variable substitution support"""
        import re
        import httpx
        import json
        
        url = config.get("url", "")
        http_method = config.get("http_method", "POST").upper()
        data_format = config.get("data_format", "json")
        headers_config = config.get("headers", [])
        payload_config = config.get("payload", [])
        
        if not url:
            raise ValueError("No URL specified for webhook")
        
        # Enhanced variable substitution - supports {{field_name}} syntax
        def substitute_variables(text, context):
            """Replace {{variable_name}} with values from execution context"""
            if not isinstance(text, str):
                return text
            
            def replace_var(match):
                var_path = match.group(1).strip()
                
                # Support nested paths: {{record.name}} or {{Get_Records.Id}}
                if '.' in var_path:
                    parts = var_path.split('.')
                    value = context
                    for part in parts:
                        if isinstance(value, dict):
                            value = value.get(part)
                        else:
                            return match.group(0)  # Keep original if can't resolve
                    return str(value) if value is not None else match.group(0)
                else:
                    # Simple variable lookup
                    value = context.get(var_path, match.group(0))
                    return str(value) if value is not None else match.group(0)
            
            return re.sub(r'\{\{([^}]+)\}\}', replace_var, text)
        
        # Substitute variables in URL
        processed_url = substitute_variables(url, execution.context)
        
        # Build headers with variable substitution
        headers = {}
        for header_item in headers_config:
            key = header_item.get("key", "")
            value = header_item.get("value", "")
            if key and value:
                processed_key = substitute_variables(key, execution.context)
                processed_value = substitute_variables(value, execution.context)
                headers[processed_key] = processed_value
        
        # Set default content-type if not provided
        if data_format == "json" and "Content-Type" not in headers and "content-type" not in {k.lower() for k in headers.keys()}:
            headers["Content-Type"] = "application/json"
        elif data_format == "xml" and "Content-Type" not in headers and "content-type" not in {k.lower() for k in headers.keys()}:
            headers["Content-Type"] = "application/xml"
        elif data_format == "form" and "Content-Type" not in headers and "content-type" not in {k.lower() for k in headers.keys()}:
            headers["Content-Type"] = "application/x-www-form-urlencoded"
        
        # Build payload with variable substitution
        payload_dict = {}
        for payload_item in payload_config:
            key = payload_item.get("key", "")
            value = payload_item.get("value", "")
            if key:  # Allow empty values
                processed_key = substitute_variables(key, execution.context)
                processed_value = substitute_variables(value, execution.context) if value else ""
                
                # Try to parse as JSON if value looks like JSON
                if processed_value and processed_value.strip().startswith('{') or processed_value.strip().startswith('['):
                    try:
                        payload_dict[processed_key] = json.loads(processed_value)
                    except:
                        payload_dict[processed_key] = processed_value
                else:
                    payload_dict[processed_key] = processed_value
        
        # Prepare request body based on format
        request_body = None
        params_for_get = None
        
        if http_method == "GET":
            # For GET, use payload as query parameters
            params_for_get = payload_dict
        elif http_method in ["POST", "PUT", "PATCH"]:
            if data_format == "json":
                request_body = json.dumps(payload_dict)
            elif data_format == "xml":
                # Simple XML conversion
                xml_items = [f"<{k}>{v}</{k}>" for k, v in payload_dict.items()]
                request_body = f"<?xml version='1.0' encoding='UTF-8'?><request>{''.join(xml_items)}</request>"
            elif data_format == "form":
                request_body = payload_dict  # httpx will handle form encoding
        
        logger.info(f"🔗 Executing webhook: {http_method} {processed_url}")
        logger.info(f"📋 Headers: {headers}")
        logger.info(f"📦 Payload: {payload_dict}")
        
        try:
            # Use 60 second timeout
            async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
                response = None
                
                if http_method == "GET":
                    response = await client.get(processed_url, headers=headers, params=params_for_get)
                elif http_method == "POST":
                    if data_format == "form":
                        response = await client.post(processed_url, headers=headers, data=payload_dict)
                    else:
                        response = await client.post(processed_url, headers=headers, content=request_body)
                elif http_method == "PUT":
                    if data_format == "form":
                        response = await client.put(processed_url, headers=headers, data=payload_dict)
                    else:
                        response = await client.put(processed_url, headers=headers, content=request_body)
                elif http_method == "PATCH":
                    if data_format == "form":
                        response = await client.patch(processed_url, headers=headers, data=payload_dict)
                    else:
                        response = await client.patch(processed_url, headers=headers, content=request_body)
                elif http_method == "DELETE":
                    response = await client.delete(processed_url, headers=headers)
                else:
                    raise ValueError(f"Unsupported HTTP method: {http_method}")
                
                # Parse response
                response_text = response.text
                response_data = None
                
                # Try to parse as JSON
                try:
                    response_data = response.json()
                except:
                    # If not JSON, use text
                    response_data = response_text
                
                logger.info(f"✅ Webhook response: Status {response.status_code}")
                logger.info(f"📥 Response data: {response_data}")
                
                # Store response in execution context for use in subsequent nodes
                # This allows next nodes to access webhook response data
                execution.context["webhook_response"] = response_data
                execution.context["webhook_status_code"] = response.status_code
                execution.context["webhook_success"] = 200 <= response.status_code < 300
                
                # Also store with node-specific key if available
                node_label = config.get("label", "webhook")
                execution.context[f"{node_label}_response"] = response_data
                execution.context[f"{node_label}_status"] = response.status_code
                
                return {
                    "action": "system.webhook",
                    "url": processed_url,
                    "method": http_method,
                    "status_code": response.status_code,
                    "response": response_data,
                    "success": 200 <= response.status_code < 300,
                    "headers_sent": headers,
                    "payload_sent": payload_dict
                }
        
        except httpx.TimeoutException as e:
            logger.error(f"⏱️ Webhook timeout: {e}")
            raise ValueError(f"Webhook request timed out after 60 seconds: {str(e)}")
        except httpx.ConnectError as e:
            logger.error(f"🔌 Webhook connection error: {e}")
            raise ValueError(f"Failed to connect to webhook URL: {str(e)}")
        except httpx.HTTPError as e:
            logger.error(f"🌐 Webhook HTTP error: {e}")
            raise ValueError(f"HTTP error occurred: {str(e)}")
        except Exception as e:
            logger.error(f"❌ Webhook unexpected error: {e}")
            raise ValueError(f"Webhook request failed: {str(e)}")
        finally:
            # Ensure response data is stored even if there was an error
            if 'response_data' not in locals():
                response_data = {"error": "Request failed"}
            execution.context["webhook_response"] = response_data
            execution.context["webhook_status_code"] = getattr(response, 'status_code', 0) if 'response' in locals() else 0
            execution.context["webhook_success"] = 'response' in locals() and response.status_code < 400
    
    async def _execute_ai_prompt_node(self, node: Node, execution: FlowExecution) -> Dict[str, Any]:
        """Execute AI prompt node (stub for now)"""
        logger.info(f"Executing AI prompt node: {node.id}")
        
        prompt = node.config.get("prompt", "")
        
        # Stub - can be integrated with LLM later
        return {
            "prompt": prompt,
            "response": "AI response (not implemented yet)",
            "executed_at": datetime.now(timezone.utc).isoformat()
        }
    
    async def _execute_condition_node(self, node: Node, execution: FlowExecution) -> Dict[str, Any]:
        """Execute condition/branch node"""
        logger.info(f"Executing condition node: {node.id}")
        
        condition = node.config.get("condition", {})
        field = condition.get("field")
        operator = condition.get("operator")
        value = condition.get("value")
        
        context_value = execution.context.get(field)
        
        result = self._evaluate_condition(context_value, operator, value)
        
        return {
            "condition": condition,
            "result": result,
            "context_value": context_value
        }

    async def _resolve_reference_field(self, reference_field: str, context: dict) -> Optional[str]:
        """
        Resolve a reference field path to get the actual ID value.
        
        Examples:
        - Trigger.Opportunity.AccountId -> returns the AccountId value from the Opportunity
        - Opportunity.AccountId -> same as above
        - AccountId -> looks for AccountId in trigger context
        
        Args:
            reference_field: The field path to resolve
            context: The execution context
            
        Returns:
            The resolved ID string, or None if not found
        """
        if not reference_field:
            return None
            
        logger.info(f"🔗 Resolving reference field: {reference_field}")
        
        parts = reference_field.split('.')
        
        # Get trigger context
        trigger_ctx = context.get("Trigger", {})
        
        # Determine the path structure
        if len(parts) == 1:
            # Simple field name like "AccountId"
            # Look in trigger entity data
            for key, value in trigger_ctx.items():
                if key != "Id" and isinstance(value, dict):
                    if parts[0] in value:
                        result = value.get(parts[0])
                        logger.info(f"   Found {parts[0]} = {result}")
                        return result
            # Also check flat context
            result = context.get(parts[0])
            if result:
                logger.info(f"   Found in context: {parts[0]} = {result}")
                return result
                
        elif len(parts) == 2:
            # Object.Field like "Opportunity.AccountId"
            entity_name = parts[0]
            field_name = parts[1]
            
            # Check in trigger context
            if entity_name in trigger_ctx:
                entity_data = trigger_ctx.get(entity_name, {})
                if isinstance(entity_data, dict):
                    result = entity_data.get(field_name)
                    if result:
                        logger.info(f"   Found {entity_name}.{field_name} = {result}")
                        return result
            
            # Also check flat context for entity data
            entity_data = context.get(entity_name, {})
            if isinstance(entity_data, dict):
                result = entity_data.get(field_name)
                if result:
                    logger.info(f"   Found {entity_name}.{field_name} in flat context = {result}")
                    return result
                    
        elif len(parts) == 3 and parts[0] == "Trigger":
            # Trigger.Object.Field like "Trigger.Opportunity.AccountId"
            entity_name = parts[1]
            field_name = parts[2]
            
            if entity_name in trigger_ctx:
                entity_data = trigger_ctx.get(entity_name, {})
                if isinstance(entity_data, dict):
                    result = entity_data.get(field_name)
                    if result:
                        logger.info(f"   Found Trigger.{entity_name}.{field_name} = {result}")
                        return result
                        
            # Also check if entity data is directly in trigger context
            for key, value in trigger_ctx.items():
                if key != "Id" and isinstance(value, dict):
                    if field_name in value:
                        result = value.get(field_name)
                        logger.info(f"   Found {field_name} in Trigger.{key} = {result}")
                        return result
        
        # Fallback: try variable substitution on the reference
        substituted = self._substitute_variables(f"{{{{{reference_field}}}}}", context)
        if substituted and substituted != f"{{{{{reference_field}}}}}":
            logger.info(f"   Substitution fallback: {substituted}")
            return substituted
            
        logger.warning(f"   Could not resolve reference field: {reference_field}")
        return None

    async def _process_parent_field_updates(
        self, 
        field_values: list, 
        execution: FlowExecution,
        current_record: dict = None
    ) -> dict:
        """
        Process field values that contain dot-notation paths (e.g., Account.Notes)
        Groups updates by target object and performs parent record updates.
        
        Returns:
            Dict with 'direct_updates' (for current record) and 'parent_updates' (for related records)
        """
        direct_updates = {}  # Updates to apply to the current record
        parent_updates = {}  # Updates grouped by parent object: {object_name: {record_id: {field: value}}}
        
        for fv in field_values:
            field_path = fv.get("field", "")
            field_value = fv.get("value", "")
            
            if not field_path:
                continue
            
            # Resolve the value (variable substitution)
            resolved_value = self._substitute_variables(str(field_value), execution.context)
            
            # Check if this is a parent field update (contains a dot)
            if '.' in field_path:
                parts = field_path.split('.')
                if len(parts) >= 2:
                    # First part is the parent object, rest is the field path
                    parent_object = parts[0].lower()  # e.g., "Account"
                    parent_field = '.'.join(parts[1:])  # e.g., "Notes" or "Owner.Email"
                    
                    logger.info(f"🔗 Parent field update detected: {parent_object}.{parent_field} = '{resolved_value}'")
                    
                    # Try to resolve the parent record ID from the current record or context
                    parent_id = None
                    
                    # Map common parent objects to their reference field names
                    reference_field_candidates = [
                        f"{parts[0]}Id",  # e.g., AccountId
                        f"{parts[0]}_id",  # e.g., account_id
                        f"{parts[0].lower()}_id",
                        f"{parts[0].lower()}Id",
                    ]
                    
                    # Check current record first
                    if current_record and isinstance(current_record, dict):
                        record_data = current_record.get('data', current_record)
                        for ref_field in reference_field_candidates:
                            if ref_field in record_data:
                                parent_id = record_data[ref_field]
                                logger.info(f"   Found parent ID from current record: {ref_field} = {parent_id}")
                                break
                    
                    # Check Trigger context
                    if not parent_id:
                        trigger_data = execution.context.get('Trigger', {})
                        for entity_key in trigger_data:
                            if isinstance(trigger_data[entity_key], dict):
                                entity_data = trigger_data[entity_key]
                                for ref_field in reference_field_candidates:
                                    if ref_field in entity_data:
                                        parent_id = entity_data[ref_field]
                                        logger.info(f"   Found parent ID from trigger: {entity_key}.{ref_field} = {parent_id}")
                                        break
                            if parent_id:
                                break
                    
                    # Check direct context
                    if not parent_id:
                        for ref_field in reference_field_candidates:
                            if ref_field in execution.context:
                                parent_id = execution.context[ref_field]
                                logger.info(f"   Found parent ID from context: {ref_field} = {parent_id}")
                                break
                    
                    if parent_id:
                        # Group by object and record ID
                        if parent_object not in parent_updates:
                            parent_updates[parent_object] = {}
                        if parent_id not in parent_updates[parent_object]:
                            parent_updates[parent_object][parent_id] = {}
                        parent_updates[parent_object][parent_id][parent_field] = resolved_value
                    else:
                        logger.warning(f"   ⚠️ Could not resolve parent ID for {parent_object}")
            else:
                # Direct field update on current record
                direct_updates[field_path] = resolved_value
        
        return {
            "direct_updates": direct_updates,
            "parent_updates": parent_updates
        }

    async def _execute_parent_updates(
        self, 
        parent_updates: dict, 
        execution: FlowExecution
    ) -> list:
        """
        Execute updates to parent records.
        
        Args:
            parent_updates: Dict of {object_name: {record_id: {field: value}}}
            execution: Current flow execution
            
        Returns:
            List of update results
        """
        results = []
        
        for parent_object, records in parent_updates.items():
            for record_id, field_updates in records.items():
                if not field_updates:
                    continue
                
                logger.info(f"🔄 Updating parent {parent_object} record {record_id}: {field_updates}")
                
                try:
                    result = await self.db.object_records.update_one(
                        {
                            "id": record_id,
                            "object_name": parent_object,
                            "tenant_id": execution.tenant_id
                        },
                        {
                            "$set": {f"data.{k}": v for k, v in field_updates.items()}
                        }
                    )
                    
                    logger.info(f"   ✅ Updated parent {parent_object}: matched={result.matched_count}, modified={result.modified_count}")
                    
                    results.append({
                        "object": parent_object,
                        "record_id": record_id,
                        "matched": result.matched_count,
                        "modified": result.modified_count,
                        "fields": list(field_updates.keys())
                    })
                    
                    # Log DML for tracing
                    if execution.context.get("_tracer") and result.modified_count > 0:
                        execution.context["_tracer"].log_dml("update", parent_object, result.modified_count, [record_id])
                        
                except Exception as e:
                    logger.error(f"   ❌ Failed to update parent {parent_object} record {record_id}: {e}")
                    results.append({
                        "object": parent_object,
                        "record_id": record_id,
                        "error": str(e)
                    })
        
        return results

    def _evaluate_condition(self, context_value: Any, operator: str, expected_value: Any) -> bool:
        """Evaluate a condition"""
        # Convert to appropriate types for comparison
        try:
            if operator == "equals":
                return str(context_value) == str(expected_value)
            elif operator == "notEquals" or operator == "not_equals":
                return str(context_value) != str(expected_value)
            elif operator == "greaterThan" or operator == "greater_than":
                # Try numeric comparison first
                try:
                    return float(context_value) > float(expected_value)
                except (ValueError, TypeError):
                    return str(context_value) > str(expected_value)
            elif operator == "lessThan" or operator == "less_than":
                try:
                    return float(context_value) < float(expected_value)
                except (ValueError, TypeError):
                    return str(context_value) < str(expected_value)
            elif operator == "greaterThanOrEqual" or operator == "greater_than_or_equal":
                try:
                    return float(context_value) >= float(expected_value)
                except (ValueError, TypeError):
                    return str(context_value) >= str(expected_value)
            elif operator == "lessThanOrEqual" or operator == "less_than_or_equal":
                try:
                    return float(context_value) <= float(expected_value)
                except (ValueError, TypeError):
                    return str(context_value) <= str(expected_value)
            elif operator == "contains":
                return str(expected_value).lower() in str(context_value).lower()
            elif operator == "doesNotContain":
                return str(expected_value).lower() not in str(context_value).lower()
            elif operator == "startsWith":
                return str(context_value).startswith(str(expected_value))
            elif operator == "endsWith":
                return str(context_value).endswith(str(expected_value))
            elif operator == "isNull":
                return context_value is None or context_value == ""
            elif operator == "isNotNull":
                return context_value is not None and context_value != ""
            else:
                return False
        except Exception as e:
            logger.error(f"Error evaluating condition: {e}")
            return False
    
    def _parse_function_args(self, args_str: str) -> list:
        """
        Parse function arguments, handling nested parentheses and quotes.
        Returns list of argument strings.
        """
        args = []
        current_arg = ""
        paren_depth = 0
        in_quotes = False
        quote_char = None
        
        for char in args_str:
            if char in ['"', "'"]:
                if not in_quotes:
                    in_quotes = True
                    quote_char = char
                elif char == quote_char:
                    in_quotes = False
                    quote_char = None
                current_arg += char
            elif char == '(' and not in_quotes:
                paren_depth += 1
                current_arg += char
            elif char == ')' and not in_quotes:
                paren_depth -= 1
                current_arg += char
            elif char == ',' and paren_depth == 0 and not in_quotes:
                args.append(current_arg.strip())
                current_arg = ""
            else:
                current_arg += char
        
        if current_arg.strip():
            args.append(current_arg.strip())
        
        return args
    
    def _resolve_variable_path(self, path: str, context: Dict[str, Any]) -> Any:
        """
        Resolve a variable path like 'Trigger.Lead.firstName' or 'Screen.email' from context.
        Handles nested paths and various naming conventions.
        """
        if not path:
            return None
        
        # First try direct lookup
        if path in context:
            return context[path]
        
        # Try with dots as key (for Screen.fieldName style)
        if '.' in path:
            # Try exact dotted key first
            if path in context:
                return context[path]
            
            # Navigate the path
            parts = path.split('.')
            value = context.get(parts[0])
            
            # Try case-insensitive for first part
            if value is None:
                for key in context.keys():
                    if key.lower() == parts[0].lower():
                        value = context[key]
                        break
            
            if value is None:
                return None
            
            # Navigate through remaining parts
            for part in parts[1:]:
                if isinstance(value, dict):
                    # Try exact match
                    if part in value:
                        value = value[part]
                    else:
                        # Try case-insensitive
                        found = False
                        for k in value.keys():
                            if k.lower() == part.lower():
                                value = value[k]
                                found = True
                                break
                        if not found:
                            return None
                elif hasattr(value, part):
                    value = getattr(value, part)
                else:
                    return None
            
            return value
        
        # Try case-insensitive lookup for simple names
        for key in context.keys():
            if key.lower() == path.lower():
                return context[key]
        
        return None
    
    def _substitute_variables(self, text: str, context: Dict[str, Any]) -> str:
        """
        Substitute variables and evaluate formulas in text.
        Supports:
        - {{variable}} - Simple variable substitution
        - Trigger.Object.Field - Trigger record field access
        - loopVar.property - Loop item property access (e.g., acc.description)
        - TODAY() - Current date
        - NOW() - Current datetime
        - String concatenation with + operator
        - CONCAT(val1, val2, ...) - Concatenate multiple values
        - JOIN(collection, separator) - Join collection items
        - TEXT(value) - Convert to text/string
        - SUBSTITUTE(text, old, new) - Replace substring
        - Basic arithmetic operations (+, -, *, /)
        - LEN(text) - Length of string
        - FIND(search, text) - Find position of substring
        - RIGHT(text, n) - Get rightmost n characters
        - LEFT(text, n) - Get leftmost n characters
        - UPPER(text) - Convert to uppercase
        - LOWER(text) - Convert to lowercase
        - TRIM(text) - Remove leading/trailing whitespace
        - CONTAINS(text, search) - Check if text contains search string
        - ISBLANK(text) - Check if text is blank/null
        - ISNULL(text) - Check if text is null
        - value1 OR value2 - Fallback/coalesce operator
        
        Expression examples:
        - {{Trigger.firstName}} {{Trigger.lastName}} -> "John Doe"
        - CONCAT({{Trigger.firstName}}, " ", {{Trigger.lastName}}) -> "John Doe"
        - "Hello " + {{Name}} -> "Hello John"
        - JOIN({{contacts.names}}, ", ") -> "John, Jane, Bob"
        """
        import re
        from datetime import datetime, timezone, timedelta

        if not isinstance(text, str):
            return text
        
        # Handle OR operator for fallback values (e.g., "1000 OR LEN(x) * 100")
        # This needs to be handled early before other substitutions
        if ' OR ' in text.upper():
            parts = re.split(r'\s+OR\s+', text, flags=re.IGNORECASE)
            for part in parts:
                try:
                    # Try to evaluate each part
                    result = self._evaluate_expression(part.strip(), context)
                    # If result is not null/empty/error, use it
                    if result is not None and str(result).strip() and str(result) != part.strip():
                        logger.info(f"   OR operator: using '{result}' from '{part}'")
                        return str(result)
                    # Try direct numeric evaluation
                    try:
                        numeric_result = eval(str(result), {"__builtins__": {}}, {})
                        if numeric_result is not None:
                            return str(numeric_result)
                    except:
                        pass
                except Exception as e:
                    logger.debug(f"   OR operator: '{part}' failed ({e}), trying next")
                    continue
            # If all parts fail, return original
            logger.warning(f"   OR operator: all parts failed, returning original: {text}")

        # Replace TODAY() with current date
        text = re.sub(r'TODAY\(\)', lambda m: datetime.now(timezone.utc).strftime('%Y-%m-%d'), text)

        # Replace NOW() with current datetime (simplified format)
        text = re.sub(r'NOW\(\)', lambda m: datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'), text)

        # Replace {{variable}} with context value (but skip if it has property access like {{var.property}})
        def replace_var(match):
            var_path = match.group(1).strip()

            # If it contains a dot, it's property access - handle it later
            if '.' in var_path:
                parts = var_path.split('.')
                base_var = parts[0]

                # Get base object - try exact match first
                value = context.get(base_var)
                
                # B5 FIX: Try case-insensitive and no-spaces variants for base var
                if value is None:
                    base_var_no_spaces = base_var.replace(" ", "")
                    value = context.get(base_var_no_spaces)
                    if value is not None:
                        logger.debug(f"   No-spaces base match: {base_var} -> {base_var_no_spaces}")
                
                if value is None:
                    base_var_lower = base_var.lower()
                    for key in context.keys():
                        if key.lower() == base_var_lower or key.lower().replace(" ", "") == base_var_lower.replace(" ", ""):
                            value = context.get(key)
                            logger.debug(f"   Case-insensitive base match: {base_var} -> {key}")
                            break
                
                if value is None:
                    return match.group(0)

                # Navigate properties safely - try multiple case variants
                for prop in parts[1:]:
                    if isinstance(value, dict):
                        # Try exact match first
                        if prop in value:
                            value = value.get(prop)
                        else:
                            # Try case-insensitive match
                            found = False
                            prop_lower = prop.lower()
                            for k in value.keys():
                                if k.lower() == prop_lower:
                                    value = value.get(k)
                                    found = True
                                    break
                            if not found:
                                return match.group(0)
                    elif hasattr(value, prop):
                        value = getattr(value, prop)
                    else:
                        return match.group(0)

                return str(value) if value is not None else match.group(0)

            # Simple variable - escape special regex chars in var_path
            escaped_var_path = re.escape(var_path)
            value = context.get(var_path)
            
            # If not found directly, try case-insensitive lookup
            if value is None:
                var_path_lower = var_path.lower()
                for key in context.keys():
                    if key.lower() == var_path_lower:
                        value = context.get(key)
                        logger.debug(f"   Case-insensitive match: {var_path} -> {key} = {value}")
                        break
            
            # B5 FIX: Try with spaces removed (for node labels like "Create Contact" -> "CreateContact")
            if value is None:
                var_path_no_spaces = var_path.replace(" ", "")
                if var_path_no_spaces != var_path:
                    value = context.get(var_path_no_spaces)
                    if value is not None:
                        logger.debug(f"   No-spaces match: {var_path} -> {var_path_no_spaces}")
            
            # If not found directly, check in input variables (for manual run)
            if value is None and 'input' in context:
                input_vars = context.get('input', {})
                if isinstance(input_vars, dict):
                    value = input_vars.get(var_path)
                    # Also try case-insensitive for input vars
                    if value is None:
                        var_path_lower = var_path.lower()
                        for key in input_vars.keys():
                            if key.lower() == var_path_lower:
                                value = input_vars.get(key)
                                break
            
            # If still not found, return original placeholder
            if value is None:
                return match.group(0)
            
            return str(value)

        text = re.sub(r'\{\{([^}]+)\}\}', replace_var, text)

        # Replace Trigger.Object.Field with trigger record field
        def replace_trigger(match):
            full_path = match.group(0)
            parts = full_path.split('.')
            if len(parts) >= 3:  # Trigger.Object.Field
                trigger_data = context.get('Trigger', {})
                if isinstance(trigger_data, dict):
                    obj_data = trigger_data.get(parts[1], {})
                    if isinstance(obj_data, dict):
                        field_value = obj_data.get(parts[2], full_path)
                        logger.info(f"🔄 Substituting {full_path} → {field_value}")
                        return str(field_value)
                    else:
                        logger.warning(f"⚠️ Object data for {parts[1]} is not a dict: {obj_data}")
                else:
                    logger.warning(f"⚠️ Trigger data is not a dict: {trigger_data}")
            logger.warning(f"⚠️ Could not substitute {full_path}")
            return full_path
        text = re.sub(r'Trigger\.\w+\.\w+', replace_trigger, text)

        # Replace loopVar.property with loop item property (e.g., acc.description, item.name)
        def replace_loop_var_property(match):
            full_path = match.group(0)
            parts = full_path.split('.')
            if len(parts) >= 2:  # varName.property
                var_name = parts[0]
                property_name = parts[1]

                # Check if var_name exists in context and is a dict/object
                var_value = context.get(var_name)
                if isinstance(var_value, dict):
                    # For MongoDB records, check both top-level and data sub-object
                    if property_name in var_value:
                        result = var_value.get(property_name)
                        logger.info(f"🔄 Substituting {full_path} → {result}")
                        return str(result)
                    elif 'data' in var_value and isinstance(var_value['data'], dict):
                        result = var_value['data'].get(property_name, full_path)
                        logger.info(f"🔄 Substituting {full_path} (from data) → {result}")
                        return str(result)
            return full_path

        # Match variable.property pattern (but not Trigger.Object.Field which has 3 parts)
        text = re.sub(r'\b(?!Trigger\.)(\w+)\.(\w+)\b', replace_loop_var_property, text)

        # ENHANCED: Replace plain variable names (not in quotes, not after Trigger.)
        # This helps with expressions like: "Score=" + score + " FollowUp=" + nextDate
        # Where score and nextDate are variables in context
        for var_name, var_value in context.items():
            # Skip internal/special variables
            if var_name in ['Trigger', '__builtins__']:
                continue
            # Only replace if it's a word boundary (not part of another word)
            # and not inside quotes (we'll handle that in expression evaluation)
            pattern = r'\b' + re.escape(var_name) + r'\b'
            # Check if the variable appears outside of quotes
            if re.search(pattern, text) and not self._is_inside_quotes(text, var_name):
                # Only substitute if it looks like it's used as a variable reference
                # (not as part of a string literal)
                pass  # Will be handled in _evaluate_expression

        # Try to evaluate as expression if it contains operators
        if any(op in text for op in ['+', '-', '*', '/', 'LEN(', 'FIND(', 'RIGHT(', 'CONTAINS(']):
            try:
                result = self._evaluate_expression(text, context)
                return str(result)
            except Exception as e:
                logger.warning(f"Failed to evaluate expression '{text}': {e}")
                pass

        return text
    
    def _is_inside_quotes(self, text: str, substring: str) -> bool:
        """Check if a substring appears inside quotes in text"""
        in_quotes = False
        quote_char = None
        i = 0
        
        while i < len(text):
            char = text[i]
            
            if char in ['"', "'"]:
                if not in_quotes:
                    in_quotes = True
                    quote_char = char
                elif char == quote_char:
                    in_quotes = False
                    quote_char = None
            
            # Check if we're at the start of the substring
            if text[i:i+len(substring)] == substring and in_quotes:
                return True
            
            i += 1
        
        return False
    
    def _evaluate_expression(self, expr: str, context: Dict[str, Any]) -> Any:
        """Evaluate expressions including formulas and arithmetic"""
        import re
        from datetime import datetime, timezone, timedelta
        
        expr = expr.strip()
        
        logger.info(f"🔢 Evaluating expression: '{expr}'")
        logger.info(f"📦 Context keys available: {list(context.keys())}")
        
        # If expression has no function calls and no operators, just return it as-is
        # This prevents "BULK-" from being treated as "BULK minus nothing"
        # Check if it looks like a simple string (no meaningful operators or functions)
        has_functions = bool(re.search(r'\b(TODAY|NOW|LEN|FIND|RIGHT|LEFT|UPPER|LOWER|TRIM|ISBLANK|ISNULL|CONTAINS)\s*\(', expr))
        has_operators = bool(re.search(r'[\+\*/]', expr))  # Don't include - in the check
        
        if not has_functions and not has_operators:
            logger.info(f"   ℹ️  Simple string value, returning as-is")
            return expr
        
        # Handle LEN(text)
        def eval_len(match):
            inner = match.group(1).strip()
            # Strip quotes if it's a literal string
            inner_clean = inner.strip('"\'')
            inner_val = self._substitute_variables(inner_clean, context)
            # Handle null-safe evaluation
            if inner_val is None or inner_val == 'None' or inner_val == inner_clean:
                # If the value didn't change, it might be a literal - check if variable exists
                if inner_clean not in context:
                    # It's a literal string or non-existent variable - return length of inner_clean
                    # But also check nested context
                    is_null = True
                    if '.' in inner_clean:
                        parts = inner_clean.split('.')
                        val = context.get(parts[0])
                        for part in parts[1:]:
                            if isinstance(val, dict):
                                val = val.get(part)
                            else:
                                val = None
                                break
                        if val is not None:
                            inner_val = val
                            is_null = False
                    if is_null:
                        return str(len(inner_clean))
            # Handle case where inner was originally quotes only (empty string)
            if inner in ['""', "''"]:
                return "0"
            return str(len(str(inner_val)))
        expr = re.sub(r'LEN\(([^)]+)\)', eval_len, expr)
        
        # Handle FIND(search, text)
        def eval_find(match):
            args = match.group(1).split(',')
            if len(args) >= 2:
                search = self._substitute_variables(args[0].strip().strip('"\''), context)
                text = self._substitute_variables(args[1].strip().strip('"\''), context)
                # Null-safe
                if text is None or search is None:
                    return "0"
                pos = str(text).find(str(search))
                return str(pos + 1 if pos >= 0 else 0)
            return "0"
        expr = re.sub(r'FIND\(([^)]+)\)', eval_find, expr)
        
        # Handle RIGHT(text, n)
        def eval_right(match):
            args = match.group(1).split(',')
            if len(args) >= 2:
                text = self._substitute_variables(args[0].strip().strip('"\''), context)
                n_expr = self._substitute_variables(args[1].strip(), context)
                # Null-safe
                if text is None:
                    return '""'
                # Evaluate arithmetic in n if needed
                try:
                    n = int(eval(str(n_expr)))
                except:
                    try:
                        n = int(n_expr)
                    except:
                        n = 0
                result = str(text)[-n:] if n > 0 else ""
                logger.info(f"   RIGHT('{text}', {n}) = '{result}'")
                return f'"{result}"'
            return '""'
        expr = re.sub(r'RIGHT\(([^)]+)\)', eval_right, expr)
        
        # Handle LEFT(text, n)
        def eval_left(match):
            args = match.group(1).split(',')
            if len(args) >= 2:
                text = self._substitute_variables(args[0].strip().strip('"\''), context)
                n_expr = self._substitute_variables(args[1].strip(), context)
                # Null-safe
                if text is None:
                    return '""'
                try:
                    n = int(eval(str(n_expr)))
                except:
                    try:
                        n = int(n_expr)
                    except:
                        n = 0
                result = str(text)[:n] if n > 0 else ""
                logger.info(f"   LEFT('{text}', {n}) = '{result}'")
                return f'"{result}"'
            return '""'
        expr = re.sub(r'LEFT\(([^)]+)\)', eval_left, expr)
        
        # Handle UPPER(text)
        def eval_upper(match):
            inner = match.group(1).strip()
            inner_val = self._substitute_variables(inner, context)
            if inner_val is None:
                return '""'
            return f'"{str(inner_val).upper()}"'
        expr = re.sub(r'UPPER\(([^)]+)\)', eval_upper, expr)
        
        # Handle LOWER(text)
        def eval_lower(match):
            inner = match.group(1).strip()
            inner_val = self._substitute_variables(inner, context)
            if inner_val is None:
                return '""'
            return f'"{str(inner_val).lower()}"'
        expr = re.sub(r'LOWER\(([^)]+)\)', eval_lower, expr)
        
        # Handle TRIM(text)
        def eval_trim(match):
            inner = match.group(1).strip()
            # Remove surrounding quotes from the argument
            inner_clean = inner.strip('"\'')
            inner_val = self._substitute_variables(inner_clean, context)
            if inner_val is None:
                return '""'
            # Trim whitespace from the value
            trimmed = str(inner_val).strip()
            return f'"{trimmed}"'
        expr = re.sub(r'TRIM\(([^)]+)\)', eval_trim, expr)
        
        # Handle ISBLANK(text)
        def eval_isblank(match):
            inner = match.group(1).strip()
            # Remove surrounding quotes
            inner_clean = inner.strip('"\'')
            inner_val = self._substitute_variables(inner_clean, context)
            # Check if the inner was originally an empty quoted string
            is_empty_quoted = inner.strip() in ['""', "''"]
            is_blank = is_empty_quoted or inner_val is None or str(inner_val).strip() == ""
            return "true" if is_blank else "false"
        expr = re.sub(r'ISBLANK\(([^)]+)\)', eval_isblank, expr)
        
        # Handle ISNULL(text)
        def eval_isnull(match):
            inner = match.group(1).strip()
            inner_val = self._substitute_variables(inner, context)
            is_null = inner_val is None or inner_val == "None"
            return "true" if is_null else "false"
        expr = re.sub(r'ISNULL\(([^)]+)\)', eval_isnull, expr)
        
        # Handle CONTAINS(text, search)
        def eval_contains(match):
            args = match.group(1).split(',')
            if len(args) >= 2:
                text = self._substitute_variables(args[0].strip().strip('"\''), context)
                search = self._substitute_variables(args[1].strip().strip('"\''), context)
                # Null-safe
                if text is None or search is None:
                    return "false"
                return "true" if str(search) in str(text) else "false"
            return "false"
        expr = re.sub(r'CONTAINS\(([^)]+)\)', eval_contains, expr)
        
        # Handle CONCAT(value1, value2, ...) - concatenate multiple values
        def eval_concat(match):
            """Concatenate multiple values/variables into a single string"""
            args_str = match.group(1)
            # Parse arguments, handling nested function calls
            args = self._parse_function_args(args_str)
            
            result_parts = []
            for arg in args:
                arg = arg.strip()
                # Remove surrounding quotes if present
                if (arg.startswith('"') and arg.endswith('"')) or (arg.startswith("'") and arg.endswith("'")):
                    result_parts.append(arg[1:-1])
                elif arg.startswith('{{') and arg.endswith('}}'):
                    # Variable reference
                    var_name = arg[2:-2].strip()
                    val = self._resolve_variable_path(var_name, context)
                    result_parts.append(str(val) if val is not None else '')
                else:
                    # Try to resolve as variable or evaluate as expression
                    val = self._substitute_variables(arg, context)
                    if val == arg:
                        # Not substituted, might be direct variable name
                        val = self._resolve_variable_path(arg, context)
                    result_parts.append(str(val) if val is not None else '')
            
            result = ''.join(result_parts)
            logger.info(f"   CONCAT({args}) = '{result}'")
            return f'"{result}"'
        expr = re.sub(r'CONCAT\((.+)\)', eval_concat, expr, flags=re.IGNORECASE)
        expr = re.sub(r'concat\((.+)\)', eval_concat, expr)
        
        # Handle JOIN(collection, separator) - join collection items with separator
        def eval_join(match):
            """Join collection/array items with a separator"""
            args_str = match.group(1)
            args = self._parse_function_args(args_str)
            
            if len(args) < 1:
                return '""'
            
            # Get the collection
            collection_ref = args[0].strip()
            separator = args[1].strip().strip('"\'') if len(args) > 1 else ', '
            
            # Resolve collection
            if collection_ref.startswith('{{') and collection_ref.endswith('}}'):
                var_name = collection_ref[2:-2].strip()
                collection = self._resolve_variable_path(var_name, context)
            else:
                collection = self._resolve_variable_path(collection_ref, context)
            
            if collection is None:
                return '""'
            
            # If collection is a list of dicts, extract a specific field
            if isinstance(collection, list):
                items = []
                for item in collection:
                    if isinstance(item, dict):
                        # Try common name fields
                        for name_field in ['name', 'Name', 'first_name', 'firstName', 'title', 'label']:
                            if name_field in item:
                                items.append(str(item[name_field]))
                                break
                        else:
                            items.append(str(item))
                    else:
                        items.append(str(item))
                result = separator.join(items)
            elif isinstance(collection, str):
                result = collection
            else:
                result = str(collection)
            
            logger.info(f"   JOIN({collection_ref}, '{separator}') = '{result}'")
            return f'"{result}"'
        expr = re.sub(r'JOIN\((.+)\)', eval_join, expr, flags=re.IGNORECASE)
        expr = re.sub(r'join\((.+)\)', eval_join, expr)
        
        # Handle TEXT(value) - convert to text/string
        def eval_text(match):
            inner = match.group(1).strip()
            inner_val = self._substitute_variables(inner.strip('"\''), context)
            return f'"{str(inner_val) if inner_val is not None else ""}"'
        expr = re.sub(r'TEXT\(([^)]+)\)', eval_text, expr, flags=re.IGNORECASE)
        
        # Handle SUBSTITUTE(text, old, new) - replace substring
        def eval_substitute(match):
            args = self._parse_function_args(match.group(1))
            if len(args) >= 3:
                text = self._substitute_variables(args[0].strip().strip('"\''), context)
                old_str = args[1].strip().strip('"\'')
                new_str = args[2].strip().strip('"\'')
                if text is None:
                    return '""'
                result = str(text).replace(old_str, new_str)
                return f'"{result}"'
            return '""'
        expr = re.sub(r'SUBSTITUTE\((.+)\)', eval_substitute, expr, flags=re.IGNORECASE)
        
        # Handle date arithmetic (TODAY() + 7)
        date_match = re.match(r'(\d{4}-\d{2}-\d{2})\s*([+\-])\s*(\d+)', expr)
        if date_match:
            date_str, op, days = date_match.groups()
            date_obj = datetime.fromisoformat(date_str)
            if op == '+':
                result_date = date_obj + timedelta(days=int(days))
            else:
                result_date = date_obj - timedelta(days=int(days))
            return result_date.strftime('%Y-%m-%d')
        
        # Handle pure arithmetic FIRST (expressions with no quotes, only numbers and operators)
        # This prevents "(5 * 10) + 5" from being treated as string concatenation
        if any(op in expr for op in ['*', '/', '(', ')']) or ('+' in expr and '"' not in expr and "'" not in expr):
            # Check if this looks like arithmetic (mostly numbers and operators)
            arithmetic_pattern = r'^[\d\s\+\-\*\/\(\)\.]+$'
            if re.match(arithmetic_pattern, expr.strip()):
                try:
                    result = eval(expr, {"__builtins__": {}}, {})
                    logger.debug(f"   Arithmetic: '{expr}' = {result}")
                    return result
                except Exception as e:
                    logger.debug(f"   Arithmetic failed for '{expr}': {e}")
                    pass
        
        # Handle string concatenation - only if there are quotes involved
        # Changed: removed '+' from the initial check to avoid false positives with arithmetic
        if '"' in expr or "'" in expr:
            parts = []
            current = ""
            in_quotes = False
            quote_char = None
            
            for char in expr:
                if char in ['"', "'"]:
                    if not in_quotes:
                        in_quotes = True
                        quote_char = char
                    elif char == quote_char:
                        in_quotes = False
                        quote_char = None
                    current += char
                elif char == '+' and not in_quotes:
                    if current.strip():
                        parts.append(current.strip())
                    current = ""
                else:
                    current += char
            
            if current.strip():
                parts.append(current.strip())
            
            result_parts = []
            for part in parts:
                part = part.strip()
                if part.startswith('"') or part.startswith("'"):
                    # String literal - remove quotes
                    result_parts.append(part.strip('"\''))
                else:
                    # Variable or expression - substitute it
                    val = self._substitute_variables(part, context)
                    
                    # If still looks like a variable name and exists in context, use it
                    if val == part and part in context:
                        val = str(context[part])
                    
                    result_parts.append(str(val))
            
            return ''.join(result_parts)
        
        # Handle arithmetic - FIXED: Substitute Trigger.* references FIRST before eval
        if any(op in expr for op in ['+', '-', '*', '/', '(', ')']):
            try:
                # First, replace ALL Trigger.Object.Field references with their values
                def replace_trigger_in_arithmetic(match):
                    full_path = match.group(0)
                    parts = full_path.split('.')
                    if len(parts) >= 3:  # Trigger.Object.Field
                        trigger_data = context.get('Trigger', {})
                        if isinstance(trigger_data, dict):
                            obj_data = trigger_data.get(parts[1], {})
                            if isinstance(obj_data, dict):
                                field_value = obj_data.get(parts[2], full_path)
                                # Return numeric value directly for arithmetic
                                return str(field_value)
                    return full_path
                
                expr = re.sub(r'Trigger\.\w+\.\w+', replace_trigger_in_arithmetic, expr)
                
                # Then replace simple variable names from context
                for var_name, var_value in context.items():
                    if var_name in expr and isinstance(var_value, (int, float, str)):
                        # Only replace if it's a standalone variable name (word boundary)
                        expr = re.sub(r'\b' + re.escape(var_name) + r'\b', str(var_value), expr)
                
                # Now evaluate the arithmetic expression
                result = eval(expr, {"__builtins__": {}}, {})
                return result
            except Exception as e:
                logger.warning(f"Failed to evaluate arithmetic expression '{expr}': {e}")
                pass
        
        return self._substitute_variables(expr, context)

    async def _execute_assignment_node(self, node: Node, execution: FlowExecution) -> Dict[str, Any]:
        """Execute assignment node - assign values to variables"""
        logger.info(f"✏️ Executing assignment node: {node.id}")
        
        assignments = node.config.get("assignments", [])
        results = {}
        
        logger.info(f"📝 Processing {len(assignments)} assignment(s)")
        logger.info(f"📦 Available context keys: {list(execution.context.keys())}")
        
        for assignment in assignments:
            var_name = assignment.get("variable")
            var_value = assignment.get("value")
            operator = assignment.get("operator", "equals")
            
            if not var_name:
                logger.warning("⚠️ Assignment has no variable name, skipping")
                continue
            
            # Clean variable name: remove ALL { } characters for consistency
            var_name_clean = var_name.replace('{', '').replace('}', '').strip()
            logger.info(f"📌 Assignment: {var_name} -> cleaned to: {var_name_clean} {operator} '{var_value}'")
            
            # Handle "add_to_collection" operator BEFORE variable substitution
            # This operator expects a value (variable, expression, or literal) to add to a collection
            if operator == "add_to_collection":
                logger.info(f"📦 ADD TO COLLECTION: {var_name_clean}")
                logger.info(f"   Value to add: {var_value}")

                # Initialize collection if it doesn't exist
                collection = execution.context.get(var_name_clean, [])
                if not isinstance(collection, list):
                    collection = []

                # Evaluate the value expression to get the actual item
                item_to_add = var_value

                # If value is a string, it could be:
                # 1. An expression to evaluate: "runTag + \" Priority=\" + 15"
                # 2. A variable name: "currentItem"
                # 3. A literal: "some value"
                if isinstance(var_value, str):
                    original_value = var_value

                    # First: Try to evaluate as expression (handles concatenation, math, etc)
                    # Check if it contains operators or function calls
                    if any(indicator in var_value for indicator in ['+', '-', '*', '/', 'LEN(', 'TODAY(', 'NOW(', 'FIND(']):
                        logger.info(f"   Detected expression, evaluating...")
                        # Substitute variables first
                        var_value = self._substitute_variables(var_value, execution.context)
                        # Then evaluate the expression
                        var_value = self._evaluate_expression(var_value, execution.context)
                        logger.info(f"   Expression result: {var_value}")

                        # CRITICAL FIX: If result is a string/scalar and we're inside a loop,
                        # this is likely a field value, not an object to add.
                        # We should add currentItem with this field updated.
                        if isinstance(var_value, (str, int, float)) and 'currentItem' in execution.context:
                            currentItem = execution.context.get('currentItem')
                            if isinstance(currentItem, dict):
                                logger.info(f"   ⚙️  Inside loop: updating currentItem with evaluated value")

                                # Clone the current item to avoid mutating the original
                                import copy
                                item_to_add = copy.deepcopy(currentItem)

                                # Determine field name from variable name
                                # e.g., "!Lead_description" -> field is "description"
                                # Extract the field name after the object type
                                field_name = None
                                var_lower = var_name_clean.lower()

                                # Try to extract field name - improved logic
                                if '_' in var_name_clean:
                                    # Format: "{!ObjectType_fieldname}" -> fieldname
                                    parts = var_name_clean.split('_', 1)
                                    if len(parts) > 1:
                                        field_name = parts[1]
                                        logger.info(f"      Extracted field name: {field_name}")
                                elif var_name_clean.startswith('!'):
                                    # Handle Salesforce-style variables like "!Lead_description"
                                    parts = var_name_clean[1:].split('_', 1)  # Remove ! and split
                                    if len(parts) > 1:
                                        field_name = parts[1]
                                        logger.info(f"      Extracted field name from SF format: {field_name}")

                                if field_name:
                                    # Update the field in the cloned item
                                    if 'data' in item_to_add and isinstance(item_to_add['data'], dict):
                                        item_to_add['data'][field_name] = var_value
                                        logger.info(f"      Updated item['data']['{field_name}'] = {str(var_value)[:50]}")
                                    else:
                                        item_to_add[field_name] = var_value
                                        logger.info(f"      Updated item['{field_name}'] = {str(var_value)[:50]}")
                                else:
                                    # Fallback: just use the evaluated value
                                    logger.warning(f"      Could not extract field name, adding value as-is")
                                    item_to_add = var_value
                            else:
                                item_to_add = var_value
                        else:
                            item_to_add = var_value
                    else:
                        # Second: Try to resolve as variable name
                        clean_var = var_value.replace('{', '').replace('}', '').strip()
                        logger.info(f"   Looking for variable '{clean_var}' in context")

                        if clean_var in execution.context:
                            item_to_add = execution.context[clean_var]
                            logger.info(f"   ✅ Resolved to: type={type(item_to_add)}")
                            if isinstance(item_to_add, dict) and 'id' in item_to_add:
                                logger.info(f"      Item ID: {item_to_add.get('id')}")
                        else:
                            # Third: Use as literal value
                            logger.info(f"   Using as literal value")
                            item_to_add = var_value

                # Add item to collection
                collection.append(item_to_add)
                execution.context[var_name_clean] = collection
                results[var_name_clean] = f"Added item to collection (now {len(collection)} items)"

                logger.info(f"✅ Added to collection '{var_name_clean}'. Now has {len(collection)} items")
                continue
            
            # Handle "remove_from_collection" operator
            if operator == "remove_from_collection":
                logger.info(f"📤 REMOVE FROM COLLECTION: {var_name_clean}")
                logger.info(f"   Item to remove: {var_value}")
                
                # Get existing collection
                collection = execution.context.get(var_name_clean, [])
                if not isinstance(collection, list):
                    logger.warning(f"   ⚠️ '{var_name_clean}' is not a collection")
                    results[var_name_clean] = "Not a collection"
                    continue
                
                # Resolve the item to remove
                item_to_remove = var_value
                if isinstance(var_value, str):
                    clean_var = var_value.replace('{', '').replace('}', '').strip()
                    if clean_var in execution.context:
                        item_to_remove = execution.context[clean_var]
                
                # Remove item by ID match or direct equality
                original_length = len(collection)
                if isinstance(item_to_remove, dict) and 'id' in item_to_remove:
                    remove_id = item_to_remove.get('id')
                    collection = [item for item in collection if not (isinstance(item, dict) and item.get('id') == remove_id)]
                else:
                    collection = [item for item in collection if item != item_to_remove]
                
                execution.context[var_name_clean] = collection
                removed_count = original_length - len(collection)
                results[var_name_clean] = f"Removed {removed_count} item(s) from collection (now {len(collection)} items)"
                logger.info(f"✅ Removed {removed_count} item(s) from '{var_name_clean}'. Now has {len(collection)} items")
                continue
            
            # Handle "clear_collection" operator
            if operator == "clear_collection":
                logger.info(f"🗑️ CLEAR COLLECTION: {var_name_clean}")
                
                # Get existing collection for logging
                existing = execution.context.get(var_name_clean, [])
                existing_count = len(existing) if isinstance(existing, list) else 0
                
                # Clear the collection
                execution.context[var_name_clean] = []
                results[var_name_clean] = f"Cleared collection (removed {existing_count} items)"
                logger.info(f"✅ Cleared '{var_name_clean}'. Removed {existing_count} items")
                continue
            
            # Handle "assign_collection" operator (copy one collection to another)
            if operator == "assign_collection":
                logger.info(f"📋 ASSIGN COLLECTION: {var_name_clean}")
                logger.info(f"   Source collection: {var_value}")
                
                # Resolve the source collection
                source_collection = []
                if isinstance(var_value, str):
                    clean_var = var_value.replace('{', '').replace('}', '').strip()
                    if clean_var in execution.context:
                        source = execution.context[clean_var]
                        if isinstance(source, list):
                            source_collection = source.copy()
                        else:
                            logger.warning(f"   ⚠️ Source '{clean_var}' is not a collection")
                elif isinstance(var_value, list):
                    source_collection = var_value.copy()
                
                execution.context[var_name_clean] = source_collection
                results[var_name_clean] = f"Assigned collection with {len(source_collection)} items"
                logger.info(f"✅ Assigned to '{var_name_clean}' with {len(source_collection)} items")
                continue
            
            # For other operators, do variable substitution AND formula evaluation
            if isinstance(var_value, str):
                original_value = var_value
                # First substitute variables
                var_value = self._substitute_variables(var_value, execution.context)
                # Then evaluate formulas if present
                if any(func in str(var_value) for func in ['FIND(', 'LEN(', 'RIGHT(', 'LEFT(', 'CONTAINS(', 'TODAY(', 'NOW(', 'Trigger.']):
                    var_value = self._evaluate_expression(str(var_value), execution.context)
                logger.info(f"✅ After substitution & evaluation: '{original_value}' → '{var_value}'")
            
            # Check if var_name_clean is a property assignment (e.g., acc.description)
            if '.' in var_name_clean:
                parts = var_name_clean.split('.')
                if len(parts) == 2:
                    obj_name = parts[0]
                    property_name = parts[1]
                    
                    # Get the object from context
                    obj = execution.context.get(obj_name)
                    if isinstance(obj, dict):
                        # Update the property in the object
                        if 'data' in obj and isinstance(obj['data'], dict):
                            obj['data'][property_name] = var_value
                            logger.info(f"💾 Updated {obj_name}.data.{property_name} = {var_value}")
                        else:
                            obj[property_name] = var_value
                            logger.info(f"💾 Updated {obj_name}.{property_name} = {var_value}")
                        
                        # Store the updated object back in context
                        execution.context[obj_name] = obj
                        results[var_name_clean] = var_value
                        continue
                    else:
                        logger.warning(f"⚠️ {obj_name} is not an object, treating as simple variable")
            
            # Store in context (simple variable)
            execution.context[var_name_clean] = var_value
            results[var_name_clean] = var_value
            
            logger.info(f"💾 Stored in context: {var_name_clean} = {var_value}")
            
            # Log to tracer
            tracer = execution.context.get("_tracer")
            if tracer:
                tracer.log_assignment(node.id, var_name_clean, var_value, str(assignment.get("value", "")))
        
        return {
            "assignments": results,
            "message": f"Assigned {len(results)} variable(s)"
        }
    
    async def _execute_decision_node(self, node: Node, execution: FlowExecution) -> Dict[str, Any]:
        """Execute decision node - Salesforce-like multi-way branching with detailed logging"""
        logger.info(f"\n   {'═' * 60}")
        logger.info(f"   🔀 DECISION NODE: Evaluating Conditions")
        logger.info(f"   {'═' * 60}")
        
        # Support two config formats:
        # 1. outcomes[] format (multi-way branching - Salesforce-like)
        # 2. conditions[] format (simple IF with true/false paths)
        
        outcomes = node.config.get("outcomes", [])
        conditions = node.config.get("conditions", [])
        logic_type = node.config.get("logic", "and")
        
        # NEW: Get evaluation target (Triggered Record vs Resource)
        evaluation_target = node.config.get("evaluationTarget", {})
        target_type = evaluation_target.get("type", "triggeredRecord")  # "triggeredRecord" or "resource"
        target_resource = evaluation_target.get("resource", "")  # Resource variable name
        
        logger.info(f"   Evaluation Target Type: {target_type}")
        if target_type == "resource":
            logger.info(f"   Resource: {target_resource}")
        
        # Ensure default outcome exists
        if outcomes and not any(o.get("isDefault") for o in outcomes):
            outcomes.append({
                "name": "default",
                "label": "Otherwise",
                "isDefault": True,
                "conditions": []
            })
        
        # Simple IF format (Use Case 2 style)
        if conditions and not outcomes:
            logger.info(f"   Decision Type: Simple IF/ELSE")
            logger.info(f"   Logic: {logic_type.upper()}")
            logger.info(f"   Conditions to evaluate: {len(conditions)}")
            
            results = []
            for idx, condition in enumerate(conditions, 1):
                field = condition.get("field", "")
                operator = condition.get("operator", "equals")
                value = condition.get("value", "")
                
                # Substitute variables in field and value
                if isinstance(field, str):
                    field = self._substitute_variables(field, execution.context)
                if isinstance(value, str):
                    value = self._substitute_variables(value, execution.context)
                
                # Get the actual value to compare from context or trigger data
                context_value = execution.context.get(field)
                if context_value is None and field.startswith("Trigger."):
                    parts = field.split(".")
                    if len(parts) >= 3:
                        trigger_obj = execution.context.get("Trigger", {}).get(parts[1], {})
                        context_value = trigger_obj.get(parts[2])
                
                # Evaluate the condition
                condition_result = self._evaluate_condition(context_value, operator, value)
                
                logger.info(f"   Condition {idx}:")
                logger.info(f"      Field: {field}")
                logger.info(f"      Operator: {operator}")
                logger.info(f"      Expected: {value}")
                logger.info(f"      Actual: {context_value}")
                logger.info(f"      Result: {'✅ TRUE' if condition_result else '❌ FALSE'}")
                
                results.append({
                    "field": field,
                    "operator": operator,
                    "expected": value,
                    "actual": context_value,
                    "result": condition_result
                })
            
            # Combine results based on logic type
            if logic_type == "and":
                final_result = all(r["result"] for r in results)
            else:
                final_result = any(r["result"] for r in results)
            
            # Store decision result in context
            execution.context[f"{node.id}_decision"] = final_result
            execution.context["last_decision_result"] = final_result
            
            logger.info(f"   {'─' * 60}")
            logger.info(f"   📊 Final Decision: {'✅ TRUE Path' if final_result else '❌ FALSE Path'}")
            logger.info(f"   {'═' * 60}")
            
            return {
                "decision_type": "simple_if",
                "result": final_result,
                "matched_path": "true" if final_result else "false",
                "conditions_evaluated": results,
                "logic_type": logic_type
            }
        
        # Multi-way outcomes format (Salesforce-like)
        logger.info(f"   Decision Type: Multi-Outcome Branching")
        logger.info(f"   Total Outcomes: {len(outcomes)}")
        
        matched_outcome = None
        matched_outcome_label = None
        evaluation_log = []
        
        for outcome_idx, outcome in enumerate(outcomes, 1):
            outcome_name = outcome.get("name", f"Outcome {outcome_idx}")
            outcome_label = outcome.get("label", outcome_name)
            is_default = outcome.get("isDefault", False)
            outcome_conditions = outcome.get("conditions", [])
            
            logger.info(f"\n   Evaluating Outcome {outcome_idx}: '{outcome_label}'")
            if is_default:
                logger.info(f"      Type: DEFAULT (fallback)")
            else:
                logger.info(f"      Conditions: {len(outcome_conditions)}")
            
            # Default outcome has no conditions
            if is_default:
                evaluation_log.append({
                    "outcome": outcome_label,
                    "is_default": True,
                    "result": "skipped"
                })
                continue
            
            # Evaluate all conditions for this outcome
            outcome_match_type = outcome.get("matchType", "all")  # "all" (AND), "any" (OR), or "custom"
            custom_logic = outcome.get("customLogic", "")  # Custom logic expression like "(1 AND 2) OR 3"
            condition_results = []
            
            logger.info(f"      Match Type: {outcome_match_type}")
            if outcome_match_type == "custom":
                logger.info(f"      Custom Logic: {custom_logic}")
            
            for cond_idx, condition in enumerate(outcome_conditions, 1):
                field = condition.get("field")
                operator = condition.get("operator")
                value = condition.get("value")
                
                # Substitute variables
                if isinstance(field, str):
                    field = self._substitute_variables(field, execution.context)
                if isinstance(value, str):
                    value = self._substitute_variables(value, execution.context)
                
                # Get context value - support both Triggered Record and Resource
                context_value = None
                
                if target_type == "resource" and target_resource:
                    # Evaluate against a resource variable (e.g., from Get Records)
                    resource_data = execution.context.get(target_resource)
                    if resource_data and isinstance(field, str):
                        # Extract field from resource (e.g., "Status" from accountRecord.Status)
                        field_name = field.split(".")[-1] if "." in field else field
                        if isinstance(resource_data, dict):
                            context_value = resource_data.get(field_name)
                        elif isinstance(resource_data, list) and len(resource_data) > 0:
                            # If resource is a list, use first item
                            context_value = resource_data[0].get(field_name) if isinstance(resource_data[0], dict) else None
                else:
                    # Default: Evaluate against Triggered Record
                    context_value = execution.context.get(field)
                    if context_value is None and field and field.startswith("Trigger."):
                        parts = field.split(".")
                        if len(parts) >= 3:
                            trigger_obj = execution.context.get("Trigger", {}).get(parts[1], {})
                            context_value = trigger_obj.get(parts[2])
                
                # Evaluate condition
                condition_met = self._evaluate_condition(context_value, operator, value)
                condition_results.append(condition_met)
                
                logger.info(f"      Condition {cond_idx}: {field} {operator} {value}")
                logger.info(f"         Actual value: {context_value}")
                logger.info(f"         Result: {'✅ Match' if condition_met else '❌ No match'}")
            
            # Apply match type logic (including custom logic)
            if outcome_match_type == "custom" and custom_logic:
                # Use custom logic parser
                try:
                    from ..utils.condition_logic_parser import ConditionLogicParser
                    parser = ConditionLogicParser()
                    
                    # Validate expression
                    validation = parser.validate_expression(custom_logic, len(outcome_conditions))
                    if not validation["valid"]:
                        logger.error(f"      ❌ Invalid custom logic: {validation['error']}")
                        logger.error(f"         {validation['message']}")
                        # Fallback to AND logic
                        all_match = all(condition_results)
                    else:
                        # Parse and evaluate
                        ast = validation["ast"]
                        all_match = parser.evaluate(ast, condition_results)
                        logger.info(f"      ✅ Custom logic evaluated: {custom_logic} = {all_match}")
                
                except Exception as e:
                    logger.error(f"      ❌ Error evaluating custom logic: {e}")
                    # Fallback to AND logic
                    all_match = all(condition_results)
            
            elif outcome_match_type == "any":
                # OR logic - at least one condition must match
                all_match = any(condition_results)
            else:
                # AND logic (default) - all conditions must match
                all_match = all(condition_results)
            
            evaluation_log.append({
                "outcome": outcome_label,
                "is_default": False,
                "match_type": outcome_match_type,
                "custom_logic": custom_logic if outcome_match_type == "custom" else None,
                "all_conditions_met": all_match,
                "conditions": condition_results
            })
            
            if all_match:
                matched_outcome = outcome_name
                matched_outcome_label = outcome_label
                logger.info(f"   ✅ MATCHED: '{outcome_label}'")
                break
        
        # If no outcome matched, use default
        if not matched_outcome:
            default_outcome = next((o for o in outcomes if o.get("isDefault")), None)
            if default_outcome:
                matched_outcome = default_outcome.get("name", "default")
                matched_outcome_label = default_outcome.get("label", "Default")
                logger.info(f"   ⚠️  No conditions matched - using DEFAULT: '{matched_outcome_label}'")
            else:
                logger.error(f"   ❌ ERROR: No outcome matched and no default defined!")
                matched_outcome = "default"
                matched_outcome_label = "Default"
        
        # Store result in context
        execution.context[f"{node.id}_outcome"] = matched_outcome
        execution.context["last_decision_outcome"] = matched_outcome
        
        # Log to tracer
        tracer = execution.context.get("_tracer")
        if tracer:
            condition_str = str(evaluation_log[-1] if evaluation_log else "")[:100]
            tracer.log_decision(node.id, condition_str, bool(matched_outcome and matched_outcome != "default"), matched_outcome_label)
        
        logger.info(f"   {'═' * 60}")
        logger.info(f"   📌 Outcome Selected: {matched_outcome_label}")
        logger.info(f"   {'═' * 60}")
        
        return {
            "decision_type": "multi_outcome",
            "matched_outcome": matched_outcome,
            "matched_outcome_label": matched_outcome_label,
            "total_outcomes": len(outcomes),
            "evaluation_log": evaluation_log
        }
    
    async def _execute_loop_node(self, node: Node, execution: FlowExecution, flow: Flow) -> Dict[str, Any]:
        """Execute loop node - iterate through collection and execute child nodes"""
        logger.info(f"🔁 Executing loop node: {node.id}")
        
        # Support both 'collection' and 'collection_variable' keys for flexibility
        collection_var = node.config.get("collection_variable") or node.config.get("collection", "")
        iteration_var = node.config.get("iterationVariable", "currentItem")
        
        # Clean up collection variable (remove {{ }} if present)
        if collection_var:
            collection_var_clean = collection_var.strip('{}').strip()
        else:
            logger.warning("No collection variable specified")
            return {"error": "No collection variable specified", "iterations": 0}
        
        # Get collection from context (case-insensitive lookup)
        collection = execution.context.get(collection_var_clean, [])
        
        # If not found, try case-insensitive lookup
        if not collection or not isinstance(collection, list):
            # Try to find with different case
            for key in execution.context.keys():
                if key.lower() == collection_var_clean.lower():
                    collection = execution.context.get(key, [])
                    if isinstance(collection, list):
                        logger.info(f"   Found collection with different case: '{key}' instead of '{collection_var_clean}'")
                        collection_var_clean = key  # Update to actual key name
                        break
        
        if not isinstance(collection, list):
            logger.warning(f"Collection '{collection_var_clean}' is not a list or doesn't exist. Context keys: {list(execution.context.keys())}")
            return {
                "error": f"Collection '{collection_var_clean}' is not a list",
                "iterations": 0
            }
        
        logger.info(f"🔁 Looping through {len(collection)} items from '{collection_var_clean}'")
        
        # Log loop start to tracer
        tracer = execution.context.get("_tracer")
        if tracer:
            tracer.log_loop_start(node.id, collection_var_clean, len(collection))

        iteration_results = []
        updated_items = []  # Accumulate updated items

        # Find child nodes that should execute inside the loop
        # These are nodes with loopContext indicating they're in "for_each" branch
        child_nodes = []
        after_last_nodes = []

        logger.info(f"   🔍 Searching for child nodes of loop: {node.id}")
        logger.info(f"   Total nodes in flow: {len(flow.nodes)}")

        for n in flow.nodes:
            # Try multiple ways to get loopContext
            loop_ctx = None
            
            # Method 1: Direct attribute
            if hasattr(n, 'loopContext') and n.loopContext:
                loop_ctx = n.loopContext
                logger.info(f"      Found loopContext via attribute for {n.id}")
            
            # Method 2: From data dict
            elif n.data and isinstance(n.data, dict) and 'loopContext' in n.data:
                loop_ctx = n.data.get('loopContext')
                logger.info(f"      Found loopContext via data dict for {n.id}")
            
            if loop_ctx:
                logger.info(f"      Node {n.id} has loopContext: loopNodeId={loop_ctx.get('loopNodeId')}, isInsideLoop={loop_ctx.get('isInsideLoop')}")
                
                if loop_ctx.get("loopNodeId") == node.id:
                    node_label = n.data.get('label', 'Unnamed') if n.data else 'Unnamed'
                    
                    if loop_ctx.get("isInsideLoop"):
                        child_nodes.append(n)
                        logger.info(f"      ✅ Added FOR EACH child: {n.type} ({node_label})")
                    else:
                        after_last_nodes.append(n)
                        logger.info(f"      ✅ Added AFTER LAST child: {n.type} ({node_label})")

        logger.info(f"\n   🔄 FOR EACH ITERATION: Will execute {len(child_nodes)} nodes per item")

        if after_last_nodes:
            logger.info(f"   ⏭️  AFTER LAST: Will execute {len(after_last_nodes)} nodes after loop completes")
            for n in after_last_nodes:
                node_label = n.data.get('label', 'Unnamed') if n.data else 'Unnamed'
                logger.info(f"      ↳ {n.type}: {node_label}")
        
        # Execute loop iterations (FOR EACH)
        logger.info(f"\n   {'─' * 60}")
        logger.info(f"   🔄 STARTING FOR EACH ITERATIONS")
        logger.info(f"   {'─' * 60}")

        for index, item in enumerate(collection):
            # Create a deep copy of the item to avoid mutations affecting the original collection
            import copy
            current_item = copy.deepcopy(item)

            # Set current item in context with multiple access patterns
            execution.context[iteration_var] = current_item
            execution.context[f"{iteration_var}_index"] = index
            
            # Standard "Current Item from Loop" naming
            execution.context["$CurrentItem"] = current_item
            execution.context["CurrentItem"] = current_item
            execution.context["current_item"] = current_item
            
            # Store the current item's ID for easy access
            if isinstance(current_item, dict):
                current_item_id = current_item.get('id') or current_item.get('Id')
                if current_item_id:
                    execution.context["$CurrentItem_Id"] = current_item_id
                    execution.context["current_item_id"] = current_item_id

            # Also set as 'acc' for common Salesforce naming
            execution.context["acc"] = current_item
            
            # Store loop metadata for child nodes
            execution.context["_loop_context"] = {
                "collection_variable": collection_var_clean,
                "iteration_variable": iteration_var,
                "current_index": index,
                "total_items": len(collection),
                "current_item": current_item
            }

            item_id = current_item.get('id') if isinstance(current_item, dict) else str(current_item)[:20]
            logger.info(f"\n   🔁 Iteration {index + 1}/{len(collection)} - Item: {item_id}")

            # Execute each child node in the loop
            iteration_output = {}
            for child_idx, child_node in enumerate(child_nodes):
                child_label = child_node.data.get('label', 'Unnamed') if child_node.data else 'Unnamed'
                logger.info(f"      ↳ Executing: {child_node.type} - {child_label}")

                # Only create node execution record on FIRST iteration to avoid duplicates
                if index == 0:
                    # Get current step number WITHOUT incrementing (loop children share loop's step space)
                    step_number = execution.context.get('_global_step_number', 2)
                    
                    display_name = self._get_node_display_name(child_node)
                    category = self._get_node_category(child_node.type)
                    
                    node_execution = NodeExecution(
                        node_id=child_node.id,
                        node_type=child_node.type,
                        step_number=step_number,  # Use parent loop's step number
                        display_name=display_name,
                        category=category,
                        status=ExecutionStatus.RUNNING,
                        started_at=datetime.now(timezone.utc)
                    )

                try:
                    child_result = await self._execute_node_by_type(child_node, execution, flow)
                    iteration_output[child_node.id] = child_result

                    # Update context with child node output
                    if isinstance(child_result, dict):
                        execution.context.update(child_result)

                    # Update node execution record on FIRST iteration
                    if index == 0:
                        node_execution.status = ExecutionStatus.SUCCESS
                        node_execution.completed_at = datetime.now(timezone.utc)
                        node_execution.output = child_result
                        execution.node_executions.append(node_execution)

                    logger.info(f"         ✅ Completed")

                except Exception as e:
                    logger.error(f"         ❌ Error: {str(e)}")
                    iteration_output[child_node.id] = {"error": str(e)}

                    # Mark as failed on FIRST iteration
                    if index == 0:
                        node_execution.status = ExecutionStatus.FAILED
                        node_execution.completed_at = datetime.now(timezone.utc)
                        node_execution.error = str(e)
                        execution.node_executions.append(node_execution)

            # After processing, get the potentially modified item from context
            # The item might have been updated through assignments in child nodes
            modified_item = execution.context.get(iteration_var, current_item)

            # Ensure we have a valid item (deep copy to prevent reference issues)
            if isinstance(modified_item, dict):
                updated_items.append(copy.deepcopy(modified_item))
            else:
                updated_items.append(modified_item)

            iteration_results.append({
                "index": index,
                "item": current_item,  # Original item for reference
                "modified_item": modified_item,  # What it became after processing
                "output": iteration_output
            })
        
        logger.info(f"\n   {'─' * 60}")
        logger.info(f"   ✅ FOR EACH COMPLETED: {len(iteration_results)} iterations")
        logger.info(f"   {'─' * 60}")
        
        # Execute "After Last" nodes (but store their execution records separately)
        after_last_executions = []
        if after_last_nodes:
            logger.info(f"\n   {'─' * 60}")
            logger.info(f"   ⏭️  EXECUTING AFTER LAST NODES ({len(after_last_nodes)} nodes)")
            logger.info(f"   Collection size before 'After Last': {len(collection)}")
            logger.info(f"   Context keys: {[k for k in execution.context.keys() if not k.startswith('trigger_')]}")
            logger.info(f"   {'─' * 60}")
            
            for after_node in after_last_nodes:
                after_label = after_node.data.get('label', 'Unnamed') if after_node.data else 'Unnamed'
                logger.info(f"      ↳ Executing: {after_node.type} - {after_label}")
                
                # Get and increment global step number for after_last nodes
                step_number = execution.context.get('_global_step_number', 2)
                execution.context['_global_step_number'] = step_number + 1
                
                # Create node execution record for after_last node
                display_name = self._get_node_display_name(after_node)
                category = self._get_node_category(after_node.type)
                
                node_execution = NodeExecution(
                    node_id=after_node.id,
                    node_type=after_node.type,
                    step_number=step_number,
                    display_name=display_name,
                    category=category,
                    status=ExecutionStatus.RUNNING,
                    started_at=datetime.now(timezone.utc)
                )
                
                try:
                    # Log collection state before execution
                    if after_node.type == 'mcp' and after_node.config.get('action_type') == 'update':
                        collection_var = after_node.config.get('collection_variable', '')
                        if collection_var:
                            collection_name = collection_var.strip('{}').strip()
                            coll = execution.context.get(collection_name, [])
                            logger.info(f"         Collection '{collection_name}' has {len(coll) if isinstance(coll, list) else 0} items")
                    
                    after_result = await self._execute_node_by_type(after_node, execution, flow)
                    if isinstance(after_result, dict):
                        execution.context.update(after_result)
                    
                    # Record successful execution
                    node_execution.status = ExecutionStatus.SUCCESS
                    node_execution.completed_at = datetime.now(timezone.utc)
                    node_execution.output = after_result
                    # Store for later addition (after loop node execution record)
                    after_last_executions.append(node_execution)
                    
                    logger.info(f"         ✅ Completed: {after_result.get('records_updated', 'N/A')} records updated" if 'records_updated' in after_result else "         ✅ Completed")
                except Exception as e:
                    logger.error(f"         ❌ Error: {str(e)}")
                    
                    # Record failed execution
                    node_execution.status = ExecutionStatus.FAILED
                    node_execution.completed_at = datetime.now(timezone.utc)
                    node_execution.error = str(e)
                    # Store for later addition (after loop node execution record)
                    after_last_executions.append(node_execution)
            
            logger.info(f"\n   {'─' * 60}")
            logger.info(f"   ✅ AFTER LAST COMPLETED")
            logger.info(f"   {'─' * 60}")
        
        # Store updated items collection in context for bulk operations
        collection_name_parts = collection_var.split('_')
        if len(collection_name_parts) >= 2:
            # If collection is "account_records", store as "accountsToUpdate"
            object_type = collection_name_parts[0]
            execution.context[f"{object_type}sToUpdate"] = updated_items
            logger.info(f"\n   💾 Stored {len(updated_items)} items in context: {object_type}sToUpdate")
        
        # Also store with generic name
        execution.context["updatedItemsFromLoop"] = updated_items
        
        logger.info(f"\n🔁 Loop node completed: {len(iteration_results)} iterations total")
        
        # Log loop end to tracer
        tracer = execution.context.get("_tracer")
        if tracer:
            tracer.log_loop_end(node.id, len(iteration_results))
        
        return {
            "iterations": len(iteration_results),
            "collection_size": len(collection),
            "results": iteration_results,
            "collection_var": collection_var,
            "updated_items_count": len(updated_items),
            "after_last_executed": len(after_last_nodes),
            "_after_last_node_executions": after_last_executions
        }
    
    async def _execute_transform_node(self, node: Node, execution: FlowExecution) -> Dict[str, Any]:
        """Execute transform node - transform data"""
        logger.info(f"Executing transform node: {node.id}")
        
        transformations = node.config.get("transformations", [])
        results = {}
        
        for transformation in transformations:
            source_field = transformation.get("source")
            target_field = transformation.get("target")
            transform_type = transformation.get("type", "copy")
            
            source_value = execution.context.get(source_field)
            
            if transform_type == "copy":
                transformed_value = source_value
            elif transform_type == "uppercase":
                transformed_value = str(source_value).upper() if source_value else ""
            elif transform_type == "lowercase":
                transformed_value = str(source_value).lower() if source_value else ""
            elif transform_type == "trim":
                transformed_value = str(source_value).strip() if source_value else ""
            elif transform_type == "to_number":
                try:
                    transformed_value = float(source_value)
                except:
                    transformed_value = 0
            else:
                transformed_value = source_value
            
            execution.context[target_field] = transformed_value
            results[target_field] = transformed_value
        
        return {
            "transformations": results,
            "count": len(results)
        }
    
    async def _execute_collection_sort_node(self, node: Node, execution: FlowExecution) -> Dict[str, Any]:
        """Execute collection sort node - sort a collection"""
        logger.info(f"Executing collection sort node: {node.id}")
        
        collection_var = node.config.get("collection", "")
        sort_field = node.config.get("sortField", "")
        sort_order = node.config.get("sortOrder", "asc")
        
        collection = execution.context.get(collection_var, [])
        
        if not isinstance(collection, list):
            return {
                "error": f"Collection '{collection_var}' is not a list",
                "sorted_count": 0
            }
        
        # Sort the collection
        try:
            reverse = (sort_order == "desc")
            
            if sort_field:
                sorted_collection = sorted(
                    collection,
                    key=lambda x: x.get(sort_field) if isinstance(x, dict) else x,
                    reverse=reverse
                )
            else:
                sorted_collection = sorted(collection, reverse=reverse)
            
            # Store sorted collection back
            execution.context[f"{collection_var}_sorted"] = sorted_collection
            
            return {
                "sorted_count": len(sorted_collection),
                "sort_field": sort_field,
                "sort_order": sort_order
            }
        except Exception as e:
            logger.error(f"Error sorting collection: {e}")
            return {
                "error": str(e),
                "sorted_count": 0
            }
    
    async def _execute_collection_filter_node(self, node: Node, execution: FlowExecution) -> Dict[str, Any]:
        """Execute collection filter node - filter records from collection"""
        logger.info(f"Executing collection filter node: {node.id}")
        
        collection_var = node.config.get("collection", "")
        filter_conditions = node.config.get("filterConditions", [])
        
        collection = execution.context.get(collection_var, [])
        
        if not isinstance(collection, list):
            return {
                "error": f"Collection '{collection_var}' is not a list",
                "filtered_count": 0
            }
        
        filtered_collection = []
        
        for item in collection:
            all_match = True
            
            for condition in filter_conditions:
                field = condition.get("field")
                operator = condition.get("operator")
                value = condition.get("value")
                
                item_value = item.get(field) if isinstance(item, dict) else item
                
                if not self._evaluate_condition(item_value, operator, value):
                    all_match = False
                    break
            
            if all_match:
                filtered_collection.append(item)
        
        # Store filtered collection
        execution.context[f"{collection_var}_filtered"] = filtered_collection
        
        return {
            "original_count": len(collection),
            "filtered_count": len(filtered_collection),
            "conditions_applied": len(filter_conditions)
        }
    
    def _get_node_display_name(self, node: Node) -> str:
        """Get display name for a node - use label if available, otherwise format node type"""
        if hasattr(node, 'data') and node.data and isinstance(node.data, dict):
            label = node.data.get('label', '').strip()
            if label:
                return label
        
        # Fall back to formatted node type
        return self._format_node_type_name(node.type)
    
    def _get_node_category(self, node_type: str) -> str:
        """Get category for a node type"""
        category_map = {
            "action": "Action",
            "connector": "Connector", 
            "mcp": "CRM",
            "ai_prompt": "AI",
            "condition": "Logic",
            "assignment": "Data",
            "decision": "Logic",
            "loop": "Logic",
            "delay": "Logic",
            "wait": "Logic",
            "transform": "Data",
            "collection_sort": "Data",
            "collection_filter": "Data",
            "webhook": "Connector",
            "end": "Control",
            "merge": "Logic",
            "trigger": "Trigger",
            "start": "Control"
        }
        return category_map.get(node_type.lower(), "Other")
    
    async def _execute_delay_node(self, node: Node, execution: FlowExecution, flow: Flow) -> Dict[str, Any]:
        """
        Execute delay node - pause execution for specified duration, fixed date/time, or until date field value
        
        Supports three modes matching Salesforce Flow behavior:
        1. Duration - Pause for specified duration (minutes, hours, days, weeks)
        2. Fixed Date & Time - Pause until specific date/time
        3. Date Field (Advanced) - Pause until value of a Date/DateTime field on source object
        """
        from datetime import timedelta
        from uuid import uuid4
        
        logger.info(f"\n   {'═' * 60}")
        logger.info(f"   ⏱️  DELAY NODE: Pausing Execution")
        logger.info(f"   {'═' * 60}")
        
        # Get delay mode (duration, fixed, or field)
        delay_mode = node.config.get("delay_mode", "duration")
        logger.info(f"   Delay Mode: {delay_mode}")
        
        # Calculate resume time based on mode
        if delay_mode == "field":
            # Date Field (Advanced) mode - Salesforce "Wait Until Date Field" behavior
            field_reference = node.config.get("fieldReference")
            offset_config = node.config.get("offset", {})
            
            if not field_reference:
                logger.error(f"   ❌ Date field mode requires fieldReference")
                # Route to fault path if configured - return error for now
                return {
                    "status": "error",
                    "error": "Missing field reference for date field delay mode"
                }
            
            # Resolve field value from trigger context
            try:
                # Get trigger context (record data)
                trigger_context = execution.context.get("trigger", {}) or execution.context.get("record", {})
                
                # Parse field reference (e.g., "Lead.Follow_Up_Date__c" or just "Follow_Up_Date__c")
                field_parts = field_reference.split(".")
                field_name = field_parts[-1]  # Get last part (the field name)
                
                logger.info(f"   Field Reference: {field_reference}")
                logger.info(f"   Field Name: {field_name}")
                
                # Get field value from trigger context
                field_value = trigger_context.get(field_name)
                
                if field_value is None:
                    logger.error(f"   ❌ Field '{field_name}' is NULL or not found in trigger context")
                    # Route to fault path - Salesforce behavior for null date fields
                    return {
                        "status": "error",
                        "error": f"Date field '{field_name}' is null"
                    }
                
                # Parse the field value as datetime
                if isinstance(field_value, str):
                    # Try parsing ISO format or common date formats
                    try:
                        field_datetime = datetime.fromisoformat(field_value.replace('Z', '+00:00'))
                    except:
                        # Try parsing other formats
                        from dateutil import parser
                        field_datetime = parser.parse(field_value)
                else:
                    field_datetime = field_value
                
                # Ensure timezone-aware
                if field_datetime.tzinfo is None:
                    field_datetime = field_datetime.replace(tzinfo=timezone.utc)
                
                logger.info(f"   Field Value (parsed): {field_datetime.strftime('%Y-%m-%d %H:%M:%S UTC')}")
                
                # Apply offset if configured
                if offset_config and offset_config.get("value"):
                    offset_value = int(offset_config.get("value", 0))
                    offset_unit = offset_config.get("unit", "days")
                    
                    unit_seconds = {
                        "minutes": 60,
                        "hours": 3600,
                        "days": 86400
                    }
                    
                    offset_seconds = offset_value * unit_seconds.get(offset_unit, 86400)
                    field_datetime = field_datetime + timedelta(seconds=offset_seconds)
                    
                    offset_sign = "+" if offset_value >= 0 else ""
                    logger.info(f"   Offset Applied: {offset_sign}{offset_value} {offset_unit}")
                    logger.info(f"   Final Resume Time: {field_datetime.strftime('%Y-%m-%d %H:%M:%S UTC')}")
                
                resume_at = field_datetime
                
                # Check if resume time is in the past - continue immediately (Salesforce behavior)
                now = datetime.now(timezone.utc)
                if resume_at <= now:
                    logger.info(f"   ⚡ Resume time is in the past - continuing immediately")
                    return {
                        "delay_seconds": 0,
                        "status": "immediate",
                        "delay_mode": "field",
                        "field_reference": field_reference
                    }
                
                delay_seconds = int((resume_at - now).total_seconds())
                
            except Exception as e:
                logger.error(f"   ❌ Failed to resolve date field: {e}")
                # Route to fault path
                return {
                    "status": "error",
                    "error": f"Failed to resolve date field: {str(e)}"
                }
                
        elif delay_mode == "dynamic_datetime":
            # Dynamic DateTime mode - NEW - Salesforce "Wait Until DateTime (Dynamic)" behavior
            # Supports: Trigger fields, Get Records outputs, Variables, Inputs, Formulas
            from modules.flow_builder.utils.datetime_resolver import DateTimeResolver
            
            source_config = node.config.get("source", {})
            override_time_config = node.config.get("overrideTime", {})
            offset_config = node.config.get("offset", {})
            
            if not source_config or not source_config.get("type") or not source_config.get("ref"):
                logger.error(f"   ❌ Dynamic DateTime mode requires source configuration")
                return {
                    "status": "error",
                    "error": "Missing source configuration for dynamic datetime delay mode"
                }
            
            logger.info(f"   Source Type: {source_config.get('type')}")
            logger.info(f"   Source Ref: {source_config.get('ref')}")
            
            # Resolve DateTime from source
            try:
                resolved_datetime, error = DateTimeResolver.resolve_datetime_source(
                    source_config,
                    execution.context
                )
                
                if error or resolved_datetime is None:
                    logger.error(f"   ❌ Failed to resolve DateTime source: {error}")
                    return {
                        "status": "error",
                        "error": error or "Failed to resolve DateTime source"
                    }
                
                logger.info(f"   Resolved DateTime: {resolved_datetime.strftime('%Y-%m-%d %H:%M:%S UTC')}")
                
                # Apply optional time override (convert date to specific time in local timezone)
                if override_time_config.get("enabled") and override_time_config.get("time"):
                    override_time = override_time_config.get("time")  # Format: "HH:MM"
                    
                    # Replace time component while keeping date
                    time_parts = override_time.split(":")
                    if len(time_parts) == 2:
                        hour = int(time_parts[0])
                        minute = int(time_parts[1])
                        
                        # Create new datetime with override time (assume local timezone for now, convert to UTC)
                        resolved_datetime = resolved_datetime.replace(hour=hour, minute=minute, second=0, microsecond=0)
                        logger.info(f"   Time Override Applied: {override_time}")
                        logger.info(f"   New DateTime: {resolved_datetime.strftime('%Y-%m-%d %H:%M:%S UTC')}")
                
                # Apply optional offset
                if offset_config and offset_config.get("value"):
                    offset_value = int(offset_config.get("value", 0))
                    offset_unit = offset_config.get("unit", "days")
                    
                    unit_seconds = {
                        "minutes": 60,
                        "hours": 3600,
                        "days": 86400
                    }
                    
                    offset_seconds = offset_value * unit_seconds.get(offset_unit, 86400)
                    resolved_datetime = resolved_datetime + timedelta(seconds=offset_seconds)
                    
                    offset_sign = "+" if offset_value >= 0 else ""
                    logger.info(f"   Offset Applied: {offset_sign}{offset_value} {offset_unit}")
                    logger.info(f"   Final Resume Time: {resolved_datetime.strftime('%Y-%m-%d %H:%M:%S UTC')}")
                
                resume_at = resolved_datetime
                
                # Check if resume time is in the past - continue immediately (Salesforce behavior)
                now = datetime.now(timezone.utc)
                if resume_at <= now:
                    logger.info(f"   ⚡ Resume time is in the past - continuing immediately")
                    return {
                        "delay_seconds": 0,
                        "status": "immediate",
                        "delay_mode": "dynamic_datetime",
                        "source": source_config
                    }
                
                delay_seconds = int((resume_at - now).total_seconds())
                
            except Exception as e:
                logger.error(f"   ❌ Failed to resolve dynamic DateTime: {e}")
                import traceback
                traceback.print_exc()
                # Route to fault path
                return {
                    "status": "error",
                    "error": f"Failed to resolve dynamic DateTime: {str(e)}"
                }
                
        elif delay_mode == "fixed":
            # Fixed Date & Time mode
            execute_date = node.config.get("execute_date")  # YYYY-MM-DD
            execute_time = node.config.get("execute_time")  # HH:MM
            
            if not execute_date or not execute_time:
                logger.error(f"   ❌ Fixed date/time mode requires both execute_date and execute_time")
                return {
                    "status": "error",
                    "error": "Missing execute_date or execute_time for fixed delay mode"
                }
            
            # Parse the fixed date/time
            try:
                # Combine date and time into ISO format
                fixed_datetime_str = f"{execute_date}T{execute_time}:00"
                resume_at = datetime.fromisoformat(fixed_datetime_str)
                
                # Ensure timezone-aware (assume UTC if no timezone provided)
                if resume_at.tzinfo is None:
                    resume_at = resume_at.replace(tzinfo=timezone.utc)
                
                logger.info(f"   Fixed Date/Time: {execute_date} {execute_time}")
                logger.info(f"   Resume at: {resume_at.strftime('%Y-%m-%d %H:%M:%S UTC')}")
                
                # Validate that the time is in the future
                now = datetime.now(timezone.utc)
                if resume_at <= now:
                    logger.error(f"   ❌ Resume time {resume_at} is in the past (current: {now})")
                    return {
                        "status": "error",
                        "error": "Resume time must be in the future"
                    }
                
                delay_seconds = int((resume_at - now).total_seconds())
                
            except Exception as e:
                logger.error(f"   ❌ Failed to parse fixed date/time: {e}")
                return {
                    "status": "error",
                    "error": f"Invalid date/time format: {str(e)}"
                }
        else:
            # Duration mode (existing behavior)
            duration_value = node.config.get("duration_value", 1)
            duration_unit = node.config.get("duration_unit", "hours")  # minutes, hours, days, weeks
            
            # Convert to seconds
            unit_seconds = {
                "minutes": 60,
                "hours": 3600,
                "days": 86400,
                "weeks": 604800
            }
            
            delay_seconds = int(duration_value) * unit_seconds.get(duration_unit, 3600)
            
            # Handle zero delay - immediate continue
            if delay_seconds == 0:
                logger.info(f"   \u23e9 Delay duration is 0 - continuing immediately")
                return {
                    "delay_seconds": 0,
                    "status": "immediate"
                }
            
            # Calculate resume time
            resume_at = datetime.now(timezone.utc) + timedelta(seconds=delay_seconds)
            
            logger.info(f"   Duration: {duration_value} {duration_unit} ({delay_seconds} seconds)")
            logger.info(f"   Resume at: {resume_at.strftime('%Y-%m-%d %H:%M:%S UTC')}")
        
        # Store delayed execution in database
        delayed_exec = {
            "id": str(uuid4()),
            "execution_id": execution.id,
            "flow_id": flow.id,
            "tenant_id": execution.tenant_id,
            "current_node_id": node.id,
            "resume_at": resume_at,
            "delay_duration_seconds": delay_seconds,
            "delay_mode": delay_mode,
            "created_at": datetime.now(timezone.utc),
            "status": "waiting"
        }
        
        await self.db.delayed_executions.insert_one(delayed_exec)
        logger.info(f"   \u2705 Delayed execution stored: {delayed_exec['id']}")
        
        # Update execution status to WAITING
        await self.db.flow_executions.update_one(
            {"id": execution.id},
            {"$set": {"status": "waiting"}}
        )
        
        logger.info(f"   {'═' * 60}")
        logger.info(f"   ⏸️  Execution PAUSED - waiting for delay to expire")
        logger.info(f"   {'═' * 60}")
        
        # Return delay info (execution will be paused here)
        return {
            "delay_seconds": delay_seconds,
            "resume_at": resume_at.isoformat(),
            "delayed_execution_id": delayed_exec["id"],
            "delay_mode": delay_mode,
            "status": "waiting"
        }
    
    async def resume_execution_after_delay(self, flow: Flow, execution: FlowExecution, delay_node_id: str):
        """Resume execution after delay expires"""
        logger.info(f"\n   {'═' * 60}")
        logger.info(f"   \u23e9 RESUMING EXECUTION after delay")
        logger.info(f"   Execution ID: {execution.id}")
        logger.info(f"   Delay Node: {delay_node_id}")
        logger.info(f"   {'═' * 60}")
        
        # Find the delay node
        delay_node = next((n for n in flow.nodes if n.id == delay_node_id), None)
        if not delay_node:
            logger.error(f"   \u274c Delay node {delay_node_id} not found")
            return
        
        # Find the next node after delay
        next_edges = [e for e in flow.edges if e.source == delay_node_id]
        if not next_edges:
            logger.info(f"   \u2139\ufe0f  No edges from delay node - flow complete")
            execution.status = ExecutionStatus.SUCCESS
            execution.completed_at = datetime.now(timezone.utc)
            await self.db.flow_executions.update_one(
                {"id": execution.id},
                {"$set": {
                    "status": "success",
                    "completed_at": execution.completed_at
                }}
            )
            return
        
        next_node_id = next_edges[0].target
        next_node = next((n for n in flow.nodes if n.id == next_node_id), None)
        
        if not next_node:
            logger.error(f"   \u274c Next node {next_node_id} not found")
            return
        
        logger.info(f"   \u27a1\ufe0f  Continuing to next node: {next_node.id} ({next_node.type})")
        
        # Get current step number
        step_number = execution.context.get('_global_step_number', len(execution.node_executions) + 2)
        
        # Execute the next node
        node_result = await self._execute_node_with_retry(next_node, execution, flow, step_number)
        execution.node_executions.append(node_result)
        
        # Update step number
        execution.context['_global_step_number'] = step_number + 1
        
        # Continue with remaining nodes (simplified - just marks as success for now)
        execution.status = ExecutionStatus.SUCCESS
        execution.completed_at = datetime.now(timezone.utc)
        
        # Update execution in database
        await self.db.flow_executions.update_one(
            {"id": execution.id},
            {"$set": {
                "status": "success",
                "completed_at": execution.completed_at,
                "node_executions": [ne.dict() for ne in execution.node_executions],
                "context": execution.context
            }}
        )
        
        logger.info(f"   \u2705 Execution resumed and completed successfully")
    
    def _format_node_type_name(self, node_type: str) -> str:
        """Format node type into a readable display name"""
        if not node_type:
            return "Unknown"
        
        # Handle special cases
        type_map = {
            "mcp": "CRM Action",
            "ai_prompt": "AI Prompt",
            "collection_sort": "Sort Collection",
            "collection_filter": "Filter Collection"
        }
        
        if node_type.lower() in type_map:
            return type_map[node_type.lower()]
        
        # Default: capitalize and replace underscores with spaces
        return node_type.replace('_', ' ').title()

