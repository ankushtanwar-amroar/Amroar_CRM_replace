"""
Flow Builder - Execution Routes
Handles flow execution, deployment, versioning, and validation
"""
from fastapi import APIRouter, Depends, HTTPException, status, Body
from typing import Optional, Dict, Any
from pydantic import BaseModel
import uuid
import copy
import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

# Import from parent modules
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))))

from server import db, User
from shared.auth import get_current_user
from ..models.flow import (
    Flow, FlowExecution, FlowExecutionCreate, ExecutionListResponse,
    FlowStatus, ExecutionStatus
)
from ..runtime.flow_runtime import FlowRuntimeEngine
from ..validators.flow_validator import FlowValidator
from ..scheduler.scheduled_trigger_service import get_scheduled_trigger_service

router = APIRouter()


async def deactivate_sibling_versions(flow_id: str, tenant_id: str, exclude_flow_id: str = None):
    """
    Deactivate ALL other versions of a flow when one is being activated.
    This ensures only ONE active version exists per flow at any time.
    
    Salesforce Rule: When activating a flow, automatically deactivate ALL other versions.
    
    Args:
        flow_id: The flow ID (or parent_flow_id) to find related versions
        tenant_id: Tenant ID for isolation
        exclude_flow_id: The flow_id being activated (to exclude from deactivation)
    
    Returns:
        int: Number of versions deactivated
    """
    # Get the flow to find parent_flow_id
    flow_data = await db.flows.find_one({"id": flow_id, "tenant_id": tenant_id}, {"_id": 0})
    
    if not flow_data:
        return 0
    
    # Determine the root parent ID
    parent_id = flow_data.get("parent_flow_id") or flow_id
    
    # Build query to find ALL related versions (same flow family)
    query = {
        "tenant_id": tenant_id,
        "status": "active",  # Only deactivate currently active ones
        "$or": [
            {"id": parent_id},              # The parent flow itself
            {"parent_flow_id": parent_id},  # All child versions
        ]
    }
    
    # Exclude the flow being activated
    if exclude_flow_id:
        query["id"] = {"$ne": exclude_flow_id}
    
    # Perform deactivation
    result = await db.flows.update_many(
        query,
        {
            "$set": {
                "status": "inactive",
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
        }
    )
    
    if result.modified_count > 0:
        logger.info(f"🔄 AUTO-DEACTIVATED {result.modified_count} sibling version(s) for flow family {parent_id}")
    
    return result.modified_count


class ManualRunRequest(BaseModel):
    """Request model for manual flow execution"""
    version_id: Optional[str] = None
    input_values: Optional[Dict[str, Any]] = None


@router.post("/flows/{flow_id}/deploy", response_model=Flow)
async def deploy_flow(
    flow_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Deploy a flow (set status to active)
    Salesforce Rule: When activating a flow, automatically deactivate ALL other versions
    """
    from ..triggers.schedule_trigger import ScheduleTriggerHandler
    
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
    
    # CRITICAL: Deactivate ALL other versions before activating this one
    deactivated_count = await deactivate_sibling_versions(flow_id, tenant_id, exclude_flow_id=flow_id)
    logger.info(f"✅ Deactivated {deactivated_count} sibling version(s) before deploying flow {flow_id}")
    
    # Update status to active
    await db.flows.update_one(
        {"id": flow_id, "tenant_id": tenant_id},
        {"$set": {"status": FlowStatus.ACTIVE, "updated_at": datetime.now(timezone.utc)}}
    )
    
    # Get updated flow
    updated_flow_data = await db.flows.find_one({
        "id": flow_id,
        "tenant_id": tenant_id
    }, {"_id": 0})
    
    flow = Flow(**updated_flow_data)
    
    # Register with schedulers
    schedule_handler = ScheduleTriggerHandler(db)
    scheduled_trigger_service = get_scheduled_trigger_service(db)
    
    await schedule_handler.register_flow(flow)
    await scheduled_trigger_service.register_scheduled_flow(flow)
    
    logger.info(f"Flow {flow_id} deployed and registered with schedulers")
    
    return flow


@router.post("/flows/{flow_id}/run", response_model=FlowExecution)
async def run_flow(
    flow_id: str,
    execution_data: Optional[FlowExecutionCreate] = None,
    current_user: User = Depends(get_current_user)
):
    """Manually run a flow via n8n or fallback to CRM runtime"""
    from ..integrations.n8n_service import n8n_service
    
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
    
    flow = Flow(**flow_data)
    
    n8n_workflow_id = flow_data.get("metadata", {}).get("n8n_workflow_id")
    
    if n8n_workflow_id:
        try:
            trigger_data = execution_data.trigger_data if execution_data else {}
            context = execution_data.context if execution_data else {}
            input_data = {**trigger_data, **context}
            
            n8n_execution = await n8n_service.execute_workflow(n8n_workflow_id, input_data)
            
            execution = FlowExecution(
                id=str(n8n_execution.get("id", uuid.uuid4())),
                flow_id=flow_id,
                tenant_id=tenant_id,
                status=ExecutionStatus.SUCCESS if n8n_execution.get("finished") else ExecutionStatus.RUNNING,
                trigger_type="manual",
                trigger_data=trigger_data,
                context=context,
                result=n8n_execution.get("data", {}),
                error=n8n_execution.get("error"),
                started_at=datetime.now(timezone.utc),
                completed_at=datetime.now(timezone.utc) if n8n_execution.get("finished") else None
            )
            
            await db.flow_executions.insert_one(execution.dict())
            
            logger.info(f"Executed flow {flow_id} via n8n workflow {n8n_workflow_id}")
            return execution
            
        except Exception as e:
            logger.error(f"n8n execution failed: {e}. Falling back to CRM runtime")
    
    # Execute flow using CRM runtime
    runtime = FlowRuntimeEngine(db)
    
    trigger_data = execution_data.trigger_data if execution_data else {}
    context = execution_data.context if execution_data else {}
    
    execution = await runtime.execute_flow(
        flow=flow,
        trigger_data=trigger_data,
        context=context
    )
    
    return execution


@router.post("/flows/{flow_id}/run-manually")
async def run_flow_manually(
    flow_id: str,
    request: ManualRunRequest,
    current_user: User = Depends(get_current_user)
):
    """Run a flow manually with input variables"""
    tenant_id = current_user.tenant_id
    version_id = request.version_id
    input_values = request.input_values or {}
    
    target_flow_id = version_id or flow_id
    
    flow_data = await db.flows.find_one({
        "id": target_flow_id,
        "tenant_id": tenant_id
    }, {"_id": 0})
    
    if not flow_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Flow version not found: {target_flow_id}"
        )
    
    flow = Flow(**flow_data)
    
    logger.info(f"🎯 MANUAL RUN: Flow '{flow.name}' v{flow.version} (Status: {flow.status})")
    
    # Validate and process input variables
    validated_inputs = {}
    
    if flow.input_variables:
        logger.info(f"   📝 Validating {len(flow.input_variables)} input variables...")
        
        for var in flow.input_variables:
            var_name = var.name
            provided_value = input_values.get(var_name)
            
            if var.required and (provided_value is None or provided_value == ""):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Required input variable '{var.label or var_name}' is missing"
                )
            
            final_value = provided_value if provided_value is not None else var.defaultValue
            
            if final_value is not None:
                try:
                    if var.dataType == "Number":
                        final_value = float(final_value) if isinstance(final_value, str) else final_value
                    elif var.dataType == "Boolean":
                        if isinstance(final_value, str):
                            final_value = final_value.lower() in ['true', '1', 'yes']
                    elif var.dataType == "String":
                        final_value = str(final_value)
                except (ValueError, TypeError) as e:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Invalid type for input variable '{var.label or var_name}': expected {var.dataType}"
                    )
            
            validated_inputs[var_name] = final_value
            logger.info(f"      ✅ {var.label or var_name}: {final_value}")
    
    # Execute flow with input variables
    runtime = FlowRuntimeEngine(db)
    
    execution_context = {
        "manual_run": True,
        "started_by": current_user.email,
        "input": validated_inputs
    }
    
    logger.info(f"   🚀 Starting execution with input context...")
    
    execution = await runtime.execute_flow(
        flow=flow,
        trigger_data={},
        context=execution_context
    )
    
    execution.trigger_type = "manual"
    execution.input_variables = validated_inputs
    
    await db.flow_executions.update_one(
        {"id": execution.id},
        {"$set": {
            "trigger_type": "manual",
            "input_variables": validated_inputs,
            "manual_run_metadata": {
                "started_by": current_user.email,
                "started_by_user_id": current_user.id,
                "selected_version": flow.version,
                "flow_status_at_run": flow.status
            }
        }}
    )
    
    logger.info(f"✅ Manual run complete: Execution ID = {execution.id}")
    
    return execution


@router.post("/flows/{flow_id}/validate")
async def validate_flow(
    flow_id: str,
    current_user: User = Depends(get_current_user)
):
    """Validate flow before activation"""
    tenant_id = current_user.tenant_id
    user_id = current_user.id
    
    flow_data = await db.flows.find_one({
        "id": flow_id,
        "tenant_id": tenant_id
    }, {"_id": 0})
    
    if not flow_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Flow not found"
        )
    
    validator = FlowValidator(db)
    result = await validator.validate_flow(flow_data, user_id)
    
    logger.info(f"Validation complete for flow {flow_id}: {len(result.errors)} errors, {len(result.warnings)} warnings")
    
    return result.to_dict()


@router.get("/flows/executions/{execution_id}/debug-trace")
async def get_execution_debug_trace(
    execution_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Get detailed debug trace for a flow execution.
    Returns comprehensive execution trace including:
    - Trigger record ID
    - Variable values after each assignment
    - Decision evaluation results
    - Loop iteration counts
    - Collection sizes before DML
    - Execution duration per node
    - DML counts (create/update/delete)
    """
    tenant_id = current_user.tenant_id
    
    execution_data = await db.flow_executions.find_one({
        "id": execution_id,
        "tenant_id": tenant_id
    }, {"_id": 0})
    
    if not execution_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Execution not found"
        )
    
    # Extract trace summary from execution context
    context = execution_data.get("context", {})
    trace_summary = context.get("_trace_summary", {})
    
    # Build detailed debug view
    debug_trace = {
        "execution_id": execution_id,
        "flow_id": execution_data.get("flow_id"),
        "status": execution_data.get("status"),
        "started_at": execution_data.get("started_at"),
        "completed_at": execution_data.get("completed_at"),
        "trigger_type": execution_data.get("trigger_type"),
        "trigger_data": execution_data.get("trigger_data"),
        
        # Trace summary from ExecutionTracer
        "trace_summary": trace_summary,
        
        # Extract node executions with timing - SORTED by step_number for correct order
        "node_executions": sorted([
            {
                "node_id": ne.get("node_id"),
                "node_type": ne.get("node_type"),
                "display_name": ne.get("display_name"),
                "status": ne.get("status"),
                "started_at": ne.get("started_at"),
                "completed_at": ne.get("completed_at"),
                "step_number": ne.get("step_number"),
                "output_summary": str(ne.get("output", {}))[:200] if ne.get("output") else None,
                "error": ne.get("error")
            }
            for ne in execution_data.get("node_executions", [])
        ], key=lambda x: (x.get("step_number") or 0, x.get("started_at") or "")),
        
        # Extract key variables from context (exclude internal ones)
        "context_variables": {
            k: str(v)[:200] if not k.startswith("_") and not k.startswith("trigger_") else None
            for k, v in context.items()
            if not k.startswith("_") and v is not None
        }
    }
    
    return debug_trace


@router.get("/flows/debug/active-tracers")
async def get_active_tracers(
    current_user: User = Depends(get_current_user)
):
    """Get list of currently active execution tracers (for debugging)"""
    from ..runtime.flow_runtime import _active_tracers
    
    return {
        "active_tracers": list(_active_tracers.keys()),
        "count": len(_active_tracers)
    }


@router.patch("/flows/{flow_id}/status", response_model=Flow)
async def update_flow_status(
    flow_id: str,
    status_update: dict = Body(...),
    validate_before_activate: bool = False,
    current_user: User = Depends(get_current_user)
):
    """
    Update flow status (activate/deactivate)
    Salesforce Rule: When activating a flow, automatically deactivate ALL other versions
    """
    from ..triggers.schedule_trigger import ScheduleTriggerHandler
    
    tenant_id = current_user.tenant_id
    user_id = current_user.id
    
    flow_data = await db.flows.find_one({
        "id": flow_id,
        "tenant_id": tenant_id
    }, {"_id": 0})
    
    if not flow_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Flow not found"
        )
    
    new_status = status_update.get("status")
    if new_status not in [FlowStatus.ACTIVE, FlowStatus.INACTIVE]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Status must be 'active' or 'inactive'"
        )
    
    # Run validation before activation if requested
    if new_status == FlowStatus.ACTIVE and validate_before_activate:
        logger.info(f"🔍 Running validation before activating flow {flow_id}")
        
        validator = FlowValidator(db)
        validation_result = await validator.validate_flow(flow_data, user_id)
        
        if not validation_result.is_valid:
            logger.error(f"❌ Validation failed for flow {flow_id}: {len(validation_result.errors)} errors")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "message": "Flow validation failed. Cannot activate flow with errors.",
                    "validation_result": validation_result.to_dict()
                }
            )
        
        logger.info(f"✅ Validation passed for flow {flow_id}")
    
    # CRITICAL: Deactivate other versions when activating
    if new_status == FlowStatus.ACTIVE:
        deactivated_count = await deactivate_sibling_versions(flow_id, tenant_id, exclude_flow_id=flow_id)
        logger.info(f"✅ Deactivated {deactivated_count} sibling version(s) before activating flow {flow_id}")
    
    # Update status in database
    await db.flows.update_one(
        {"id": flow_id, "tenant_id": tenant_id},
        {"$set": {"status": new_status, "updated_at": datetime.now(timezone.utc)}}
    )
    
    # Get updated flow
    updated_flow_data = await db.flows.find_one({
        "id": flow_id,
        "tenant_id": tenant_id
    }, {"_id": 0})
    
    flow = Flow(**updated_flow_data)
    
    # Update scheduler based on status
    schedule_handler = ScheduleTriggerHandler(db)
    scheduled_trigger_service = get_scheduled_trigger_service(db)
    
    if new_status == FlowStatus.ACTIVE:
        await schedule_handler.register_flow(flow)
        await scheduled_trigger_service.register_scheduled_flow(flow)
        logger.info(f"Flow {flow_id} v{flow.version} activated and registered with schedulers")
    else:
        await schedule_handler.unregister_flow(flow_id)
        await scheduled_trigger_service.unregister_scheduled_flow(flow_id)
        logger.info(f"Flow {flow_id} deactivated and unregistered from scheduler")
    
    return flow


@router.post("/flows/{flow_id}/create-version", response_model=Flow, status_code=status.HTTP_201_CREATED)
async def create_new_version(
    flow_id: str,
    updated_flow_data: Optional[Dict[str, Any]] = None,
    current_user: User = Depends(get_current_user)
):
    """
    Create a new version of a flow (Salesforce-like versioning)
    - Clones the selected flow version
    - Assigns the next sequential version number
    - Sets new version to DRAFT status
    """
    tenant_id = current_user.tenant_id
    
    logger.info(f"📦 Creating new version of flow {flow_id}")
    
    # Get the source flow
    source_flow_data = await db.flows.find_one({
        "id": flow_id,
        "tenant_id": tenant_id
    }, {"_id": 0})
    
    if not source_flow_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Source flow not found"
        )
    
    # Determine the parent_flow_id
    parent_id = source_flow_data.get("parent_flow_id") or flow_id
    
    # Find the highest version number
    pipeline = [
        {
            "$match": {
                "tenant_id": tenant_id,
                "$or": [
                    {"id": parent_id},
                    {"parent_flow_id": parent_id}
                ]
            }
        },
        {
            "$group": {
                "_id": None,
                "max_version": {"$max": "$version"}
            }
        }
    ]
    
    result = await db.flows.aggregate(pipeline).to_list(length=1)
    current_max_version = result[0]["max_version"] if result else source_flow_data.get("version", 1)
    
    next_version = current_max_version + 1
    
    logger.info(f"📦 Creating version {next_version} of flow '{source_flow_data['name']}' (parent: {parent_id})")
    
    # Use updated_flow_data if provided, otherwise clone from database
    if updated_flow_data:
        logger.info(f"📦 Using updated flow data from frontend (includes unsaved changes)")
        base_flow_data = {
            **source_flow_data,
            **updated_flow_data,
            "name": source_flow_data.get("name"),
            "description": source_flow_data.get("description"),
            "flow_type": source_flow_data.get("flow_type"),
            "launch_mode": source_flow_data.get("launch_mode"),
        }
    else:
        logger.info(f"📦 No updated data provided, cloning from database")
        base_flow_data = source_flow_data
    
    # Clone the flow with new ID and version
    new_flow_id = str(uuid.uuid4())
    cloned_flow_data = copy.deepcopy(base_flow_data)
    
    new_flow_data = {
        **cloned_flow_data,
        "id": new_flow_id,
        "version": next_version,
        "status": FlowStatus.DRAFT,
        "parent_flow_id": parent_id,
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
        "created_by": current_user.email,
        "updated_by": current_user.email
    }
    
    # Remove n8n-specific metadata from new version
    if "metadata" in new_flow_data:
        new_flow_data["metadata"].pop("n8n_workflow_id", None)
    
    # Insert new version
    await db.flows.insert_one(new_flow_data)
    
    # Fetch and return the new version
    created_flow_data = await db.flows.find_one({
        "id": new_flow_id,
        "tenant_id": tenant_id
    }, {"_id": 0})
    
    logger.info(f"✅ Created flow version {next_version} with ID: {new_flow_id}")
    
    return Flow(**created_flow_data)


@router.get("/flows/{flow_id}/executions", response_model=ExecutionListResponse)
async def list_flow_executions(
    flow_id: str,
    page: int = 1,
    limit: int = 20,
    current_user: User = Depends(get_current_user),
):
    """List executions for a flow (includes webhook auth failures)"""
    user_tenant_id = current_user.tenant_id
    
    # First get the flow - allow access if:
    # 1. Flow belongs to user's tenant, OR
    # 2. User created the flow, OR
    # 3. Flow exists (for viewing execution logs of any flow the user has access to)
    flow_data = await db.flows.find_one({
        "id": flow_id
    }, {"_id": 0, "id": 1, "tenant_id": 1})
    
    if not flow_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Flow not found"
        )
    
    # Use the flow's tenant_id for execution queries
    flow_tenant_id = flow_data.get("tenant_id", user_tenant_id)
    
    query = {
        "flow_id": flow_id,
        "tenant_id": flow_tenant_id
    }
    
    total = await db.flow_executions.count_documents(query)
    
    skip = (page - 1) * limit
    executions_data = await db.flow_executions.find(query, {"_id": 0}).skip(skip).limit(limit).sort("started_at", -1).to_list(length=None)
    
    logger.info(f"📋 Flow {flow_id}: Found {len(executions_data)} executions from flow_executions (tenant: {flow_tenant_id})")
    
    # FIX: Also fetch webhook authentication failures (ONLY failures, not successes)
    # These are logged when X-Webhook-Secret is missing/invalid
    # Successful webhook calls already have entries in flow_executions, so we don't duplicate
    webhook_query = {"flow_id": flow_id, "status": "failed"}
    webhook_failures = await db.webhook_execution_logs.find(
        webhook_query,
        {"_id": 0}
    ).sort("timestamp", -1).limit(limit).to_list(length=limit)
    
    logger.info(f"📋 Flow {flow_id}: Found {len(webhook_failures)} webhook auth failures")
    
    # Transform webhook logs to FlowExecution format
    for wlog in webhook_failures:
        error_msg = wlog.get("error_message")
        webhook_exec = {
            "id": wlog.get("id"),
            "flow_id": wlog.get("flow_id"),
            "flow_version": 1,
            "tenant_id": wlog.get("tenant_id"),
            "trigger_type": "webhook",
            "trigger_data": wlog.get("payload", {}),
            "input_variables": None,
            "status": "failed" if wlog.get("status") == "failed" else wlog.get("status"),
            "started_at": wlog.get("timestamp"),
            "completed_at": wlog.get("timestamp"),
            "error_message": error_msg,  # Clear error message at top level
            "node_executions": [{
                "node_id": "webhook_auth",
                "node_type": "webhook_validation",
                "step_number": 1,
                "display_name": "Webhook Authentication",
                "category": "Authentication",
                "started_at": wlog.get("timestamp"),
                "completed_at": wlog.get("timestamp"),
                "status": "failed" if wlog.get("status") == "failed" else "success",
                "input": {"headers": wlog.get("headers", {})},
                "output": {},
                "error": error_msg  # Also in node execution
            }] if wlog.get("status") == "failed" else [],
            "context_snapshot": {},
            "execution_time_ms": wlog.get("execution_time_ms"),
            "is_webhook_auth_failure": True
        }
        executions_data.append(webhook_exec)
    
    # Sort combined results by started_at/timestamp
    executions_data.sort(
        key=lambda x: x.get('started_at') or x.get('timestamp') or '', 
        reverse=True
    )
    
    # Deduplicate by id
    seen_ids = set()
    unique_executions = []
    for ex in executions_data:
        ex_id = ex.get('id')
        if ex_id and ex_id not in seen_ids:
            seen_ids.add(ex_id)
            unique_executions.append(ex)
    
    # Apply pagination to combined results
    paginated = unique_executions[skip:skip + limit]
    
    executions = []
    for exec_data in paginated:
        try:
            # Debug: Log node_executions before conversion
            ne_count = len(exec_data.get('node_executions', []))
            logger.info(f"📋 Converting execution {exec_data.get('id', 'unknown')[:12]}... with {ne_count} node_executions")
            
            flow_exec = FlowExecution(**exec_data)
            
            # Debug: Verify node_executions after conversion
            logger.info(f"   -> Converted: {len(flow_exec.node_executions)} node_executions")
            
            executions.append(flow_exec)
        except Exception as e:
            # For webhook auth failures, create a minimal FlowExecution
            logger.warning(f"Could not create FlowExecution from data: {e}")
            logger.warning(f"   Data keys: {list(exec_data.keys())}")
            # Still include it in raw form
            executions.append(exec_data)
    
    return ExecutionListResponse(
        executions=executions,
        total=len(unique_executions),
        page=page,
        limit=limit
    )


@router.get("/executions/{execution_id}", response_model=FlowExecution)
async def get_execution(
    execution_id: str,
    current_user: User = Depends(get_current_user),
):
    """Get a single execution by ID"""
    tenant_id = current_user.tenant_id
    
    execution_data = await db.flow_executions.find_one({
        "id": execution_id,
        "tenant_id": tenant_id
    }, {"_id": 0})
    
    if not execution_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Execution not found"
        )
    
    return FlowExecution(**execution_data)


@router.get("/flows/{flow_id}/executions-with-filter")
async def get_flow_executions(
    flow_id: str,
    current_user: User = Depends(get_current_user),
    limit: int = 20,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None
):
    """Get execution logs for a flow with optional date filtering"""
    from ..integrations.n8n_service import n8n_service
    
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
    
    n8n_workflow_id = flow_data.get("metadata", {}).get("n8n_workflow_id")
    
    executions = []
    
    # Get n8n executions if workflow exists
    if n8n_workflow_id:
        try:
            n8n_executions = await n8n_service.list_executions(n8n_workflow_id, limit)
            executions = n8n_executions
        except Exception as e:
            logger.error(f"Failed to fetch n8n executions: {e}")
    
    # Build date filter query
    date_filter = {}
    if start_date:
        try:
            start_dt = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
            date_filter["$gte"] = start_dt
        except ValueError as e:
            logger.warning(f"Invalid start_date format: {start_date} - {e}")
    
    if end_date:
        try:
            end_dt = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
            date_filter["$lte"] = end_dt
        except ValueError as e:
            logger.warning(f"Invalid end_date format: {end_date} - {e}")
    
    mongo_query = {
        "flow_id": flow_id,
        "tenant_id": tenant_id
    }
    
    if date_filter:
        mongo_query["started_at"] = date_filter
    
    crm_executions = await db.flow_executions.find(
        mongo_query,
        {"_id": 0}
    ).sort("started_at", -1).limit(limit).to_list(length=limit)
    
    # FIX: Also fetch webhook authentication failures from webhook_execution_logs
    # These are logged when X-Webhook-Secret is missing/invalid or auth headers fail
    webhook_query = {"flow_id": flow_id}
    if date_filter:
        webhook_query["timestamp"] = date_filter
    
    logger.info(f"📋 Fetching webhook logs for flow {flow_id} with query: {webhook_query}")
    
    webhook_failures = await db.webhook_execution_logs.find(
        webhook_query,
        {"_id": 0}
    ).sort("timestamp", -1).limit(limit).to_list(length=limit)
    
    logger.info(f"📋 Found {len(webhook_failures)} webhook execution logs")
    
    # Transform webhook logs to match execution log format
    webhook_executions = []
    for wlog in webhook_failures:
        webhook_executions.append({
            "id": wlog.get("id"),
            "flow_id": wlog.get("flow_id"),
            "flow_name": wlog.get("flow_name"),
            "tenant_id": wlog.get("tenant_id"),
            "status": "failed" if wlog.get("status") == "failed" else wlog.get("status"),
            "started_at": wlog.get("timestamp"),
            "completed_at": wlog.get("timestamp"),
            "trigger_type": "webhook",
            "error_message": wlog.get("error_message"),
            "http_status": wlog.get("http_status"),
            "execution_time_ms": wlog.get("execution_time_ms"),
            "is_webhook_auth_failure": True,  # Flag to identify these in UI
            "headers": wlog.get("headers", {}),
            "steps": [{
                "node_id": "webhook_auth",
                "node_type": "webhook_validation",
                "node_label": "Webhook Authentication",
                "status": "failed",
                "error": wlog.get("error_message"),
                "started_at": wlog.get("timestamp"),
                "completed_at": wlog.get("timestamp")
            }] if wlog.get("status") == "failed" else []
        })
    
    all_executions = crm_executions + webhook_executions + executions
    
    all_executions.sort(
        key=lambda x: x.get('started_at', '') or x.get('startedAt', '') or x.get('timestamp', ''), 
        reverse=True
    )
    
    # Deduplicate by id (in case same execution appears in multiple sources)
    seen_ids = set()
    unique_executions = []
    for ex in all_executions:
        ex_id = ex.get('id') or ex.get('execution_id')
        if ex_id and ex_id not in seen_ids:
            seen_ids.add(ex_id)
            unique_executions.append(ex)
        elif not ex_id:
            unique_executions.append(ex)
    
    return {
        "flow_id": flow_id,
        "executions": unique_executions[:limit],
        "total": len(unique_executions),
        "crm_count": len(crm_executions),
        "webhook_auth_failures": len(webhook_executions),
        "n8n_count": len(executions)
    }
