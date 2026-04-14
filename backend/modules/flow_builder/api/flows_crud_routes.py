"""
Flow Builder - CRUD Routes
Handles flow Create, Read, Update, Delete operations
"""
from fastapi import APIRouter, Depends, HTTPException, status, Body
from typing import List, Optional, Dict, Any
import uuid
import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

# Import from parent modules
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))))

from server import db, User
from shared.auth import get_current_user
from shared.services.license_enforcement import require_module_license, ModuleKey
from ..models.flow import (
    Flow, FlowCreate, FlowUpdate, FlowListResponse, FlowStatus
)

router = APIRouter()


@router.get("/flows", response_model=FlowListResponse)
@require_module_license(ModuleKey.FLOW_BUILDER)
async def list_flows(
    page: int = 1,
    limit: int = 10,
    status: Optional[str] = None,
    search: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """List all flows for current tenant with pagination and search"""
    tenant_id = current_user.tenant_id
    
    # Build query
    query = {"tenant_id": tenant_id}
    if status:
        query["status"] = status
    
    # Search functionality - case-insensitive search across multiple fields
    if search and search.strip():
        search_regex = {"$regex": search.strip(), "$options": "i"}
        query["$or"] = [
            {"name": search_regex},
            {"flow_type": search_regex},
            {"triggers.type": search_regex},
            {"created_by": search_regex}
        ]
    
    # Get total count for pagination
    total = await db.flows.count_documents(query)
    total_pages = (total + limit - 1) // limit  # Ceiling division
    
    # Validate page bounds
    if page < 1:
        page = 1
    if page > total_pages and total_pages > 0:
        page = total_pages
    
    skip = (page - 1) * limit
    flows_data = await db.flows.find(query, {"_id": 0}).skip(skip).limit(limit).sort("created_at", -1).to_list(length=None)
    
    flows = [Flow(**flow_data) for flow_data in flows_data]
    
    return FlowListResponse(
        flows=flows,
        total=total,
        page=page,
        limit=limit,
        total_pages=total_pages
    )


@router.post("/flows", response_model=Flow, status_code=status.HTTP_201_CREATED)
@require_module_license(ModuleKey.FLOW_BUILDER)
async def create_flow(
    flow_data: FlowCreate,
    current_user: User = Depends(get_current_user),
):
    """Create a new flow and sync with n8n"""
    from ..integrations.n8n_service import n8n_service
    from ..integrations.n8n_mapper import N8nMapper
    from ..screen_flow_modes import get_system_variables_for_mode
    
    tenant_id = current_user.tenant_id
    user_id = current_user.id
    
    # Unique flow name validation
    if flow_data.name:
        existing_flow = await db.flows.find_one({
            "tenant_id": tenant_id,
            "name": {"$regex": f"^{flow_data.name}$", "$options": "i"}
        })
        if existing_flow:
            raise HTTPException(
                status_code=409,
                detail=f"A flow with the name '{flow_data.name}' already exists. Please choose a different name."
            )
    
    # Auto-generate webhook secret for incoming webhook triggers
    triggers = []
    if flow_data.triggers:
        for trigger in flow_data.triggers:
            trigger_dict = trigger.dict() if hasattr(trigger, 'dict') else dict(trigger)
            
            trigger_type = trigger_dict.get("type")
            if trigger_type in ["incoming_webhook", "incoming_webhook_trigger", "webhook_trigger"]:
                if "config" not in trigger_dict:
                    trigger_dict["config"] = {}
                if "webhook_secret" not in trigger_dict["config"]:
                    trigger_dict["config"]["webhook_secret"] = str(uuid.uuid4())
                    logger.info("✅ Auto-generated webhook secret for incoming webhook trigger")
                if "rate_limit" not in trigger_dict["config"]:
                    trigger_dict["config"]["rate_limit"] = 10
                if "enabled" not in trigger_dict["config"]:
                    trigger_dict["config"]["enabled"] = True
            
            elif trigger_type == "scheduled_trigger":
                if "config" not in trigger_dict:
                    trigger_dict["config"] = {}
                if "enabled" not in trigger_dict["config"]:
                    trigger_dict["config"]["enabled"] = True
                if "timezone" not in trigger_dict["config"]:
                    trigger_dict["config"]["timezone"] = "UTC"
                logger.info("✅ Scheduled trigger configured for flow")
            
            triggers.append(trigger_dict)
    
    logger.info(f"📦 Creating flow with {len(triggers)} triggers")
    
    # Auto-create system variables for Screen Flows
    variables = list(flow_data.variables) if flow_data.variables else []
    flow_type = flow_data.flow_type or "trigger"
    launch_mode = flow_data.launch_mode
    
    if flow_type == "screen" and launch_mode:
        system_vars = get_system_variables_for_mode(launch_mode)
        if system_vars:
            logger.info(f"✅ Auto-creating {len(system_vars)} system variables for {launch_mode} mode")
            variables = system_vars + variables
    
    # Get screen_flow_object for record_detail and list_view modes
    screen_flow_object = flow_data.screen_flow_object
    
    # Create flow
    flow = Flow(
        id=str(uuid.uuid4()),
        tenant_id=tenant_id,
        name=flow_data.name,
        description=flow_data.description,
        flow_type=flow_type,
        launch_mode=launch_mode,
        screen_flow_object=screen_flow_object,
        version=1,
        status=FlowStatus.DRAFT,
        triggers=triggers,
        nodes=flow_data.nodes,
        edges=flow_data.edges,
        variables=variables,
        input_variables=flow_data.input_variables,
        batch_size=flow_data.batch_size,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
        created_by=user_id,
        updated_by=user_id
    )
    
    # Decision Node Validation
    for node in flow_data.nodes:
        if node.type == 'decision':
            outcomes = node.config.get('outcomes', [])
            has_default = any(outcome.get('isDefault', False) for outcome in outcomes)
            if not has_default:
                raise HTTPException(
                    status_code=400,
                    detail=f"Decision node '{node.id}' must have at least one default outcome with isDefault=true"
                )
    
    # Batch Size Validation
    if flow_data.batch_size is not None:
        from ..batch_size_config import BatchSizeConfig
        is_valid, error_msg, warning_msg = BatchSizeConfig.validate_batch_size(flow_data.batch_size)
        if not is_valid:
            raise HTTPException(status_code=400, detail=f"Invalid batch size: {error_msg}")
    
    flow_dict = flow.dict()
    
    # Sync with n8n if nodes exist
    n8n_workflow_id = None
    try:
        if flow_data.nodes and len(flow_data.nodes) > 0:
            n8n_workflow = N8nMapper.crm_to_n8n_workflow(flow_dict, tenant_id)
            n8n_result = await n8n_service.create_workflow(n8n_workflow)
            n8n_workflow_id = n8n_result.get("id")
            
            if "metadata" not in flow_dict:
                flow_dict["metadata"] = {}
            flow_dict["metadata"]["n8n_workflow_id"] = n8n_workflow_id
            
            logger.info(f"Created n8n workflow {n8n_workflow_id} for flow {flow.id}")
    except Exception as e:
        logger.warning(f"Failed to sync flow with n8n: {e}. Continuing with CRM-only flow.")
    
    await db.flows.insert_one(flow_dict)
    
    return flow


@router.get("/flows/{flow_id}", response_model=Flow)
async def get_flow(
    flow_id: str,
    current_user: User = Depends(get_current_user),
):
    """Get a single flow by ID"""
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
    
    # Filter out any None/null nodes
    if flow_data.get('nodes'):
        flow_data['nodes'] = [node for node in flow_data['nodes'] if node is not None]
        logger.info(f"🔍 GET FLOW {flow_id} - Returning {len(flow_data['nodes'])} nodes")
    
    return Flow(**flow_data)


@router.put("/flows/{flow_id}", response_model=Flow)
async def update_flow(
    flow_id: str,
    flow_update: FlowUpdate,
    current_user: User = Depends(get_current_user)
):
    """Update a flow and sync with n8n"""
    from ..integrations.n8n_service import n8n_service
    from ..integrations.n8n_mapper import N8nMapper
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
    
    # Unique flow name validation (if name is being changed)
    if flow_update.name and flow_update.name != flow_data.get('name'):
        existing_flow = await db.flows.find_one({
            "tenant_id": tenant_id,
            "name": {"$regex": f"^{flow_update.name}$", "$options": "i"},
            "id": {"$ne": flow_id}  # Exclude current flow
        })
        if existing_flow:
            raise HTTPException(
                status_code=409,
                detail=f"A flow with the name '{flow_update.name}' already exists. Please choose a different name."
            )
    
    # Version control enforcement
    current_status = flow_data.get('status', 'draft')
    
    if current_status == 'active':
        raise HTTPException(
            status_code=400,
            detail="Cannot edit active flow. Use POST /api/flow-builder/flows/{flow_id}/create-version to create a new draft version."
        )
    
    if current_status == 'archived':
        raise HTTPException(
            status_code=400,
            detail="Cannot edit archived flow. Archived versions are read-only."
        )
    
    if current_status not in ['draft', FlowStatus.DRAFT]:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot edit flow with status '{current_status}'. Only draft flows are editable."
        )
    
    # Prepare update
    update_data = flow_update.dict(exclude_unset=True)
    update_data["updated_at"] = datetime.now(timezone.utc)
    update_data["updated_by"] = user_id
    
    # Decision Node Validation
    if flow_update.nodes is not None:
        for node in flow_update.nodes:
            node_dict = node.dict() if hasattr(node, 'dict') else node
            if node_dict and isinstance(node_dict, dict) and node_dict.get('type') == 'decision':
                outcomes = node_dict.get('config', {}).get('outcomes', [])
                has_default = any(outcome.get('isDefault', False) for outcome in outcomes)
                if not has_default:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Decision node '{node_dict.get('id')}' must have at least one default outcome with isDefault=true"
                    )
    
    # Batch Size Validation
    if flow_update.batch_size is not None:
        from ..batch_size_config import BatchSizeConfig
        is_valid, error_msg, warning_msg = BatchSizeConfig.validate_batch_size(flow_update.batch_size)
        if not is_valid:
            raise HTTPException(status_code=400, detail=f"Invalid batch size: {error_msg}")
    
    # Sync with n8n
    n8n_workflow_id = flow_data.get("metadata", {}).get("n8n_workflow_id")
    try:
        updated_flow = {**flow_data, **update_data}
        n8n_workflow = N8nMapper.crm_to_n8n_workflow(updated_flow, tenant_id)
        
        if n8n_workflow_id:
            await n8n_service.update_workflow(n8n_workflow_id, n8n_workflow)
            logger.info(f"Updated n8n workflow {n8n_workflow_id} for flow {flow_id}")
        else:
            n8n_result = await n8n_service.create_workflow(n8n_workflow)
            n8n_workflow_id = n8n_result.get("id")
            
            if "metadata" not in update_data:
                update_data["metadata"] = flow_data.get("metadata", {})
            update_data["metadata"]["n8n_workflow_id"] = n8n_workflow_id
            
            logger.info(f"Created n8n workflow {n8n_workflow_id} for flow {flow_id}")
    except Exception as e:
        logger.warning(f"Failed to sync flow with n8n: {e}")
    
    # Update in database
    await db.flows.update_one(
        {"id": flow_id, "tenant_id": tenant_id},
        {"$set": update_data}
    )
    
    # Get updated flow
    updated_flow_data = await db.flows.find_one({
        "id": flow_id,
        "tenant_id": tenant_id
    }, {"_id": 0})
    
    updated_flow = Flow(**updated_flow_data)
    
    # Update scheduler if needed
    schedule_handler = ScheduleTriggerHandler(db)
    if update_data.get("status") == FlowStatus.ACTIVE:
        await schedule_handler.register_flow(updated_flow)
    elif update_data.get("status") in [FlowStatus.INACTIVE, FlowStatus.ARCHIVED]:
        await schedule_handler.unregister_flow(flow_id)
    
    return updated_flow


@router.delete("/flows/{flow_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_flow(
    flow_id: str,
    current_user: User = Depends(get_current_user)
):
    """Delete a flow and its n8n workflow"""
    from ..integrations.n8n_service import n8n_service
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
    
    # Delete from n8n if workflow exists
    n8n_workflow_id = flow_data.get("metadata", {}).get("n8n_workflow_id")
    if n8n_workflow_id:
        try:
            await n8n_service.delete_workflow(n8n_workflow_id)
            logger.info(f"Deleted n8n workflow {n8n_workflow_id}")
        except Exception as e:
            logger.warning(f"Failed to delete n8n workflow: {e}")
    
    # Unregister from scheduler
    schedule_handler = ScheduleTriggerHandler(db)
    await schedule_handler.unregister_flow(flow_id)
    
    # Delete flow
    await db.flows.delete_one({
        "id": flow_id,
        "tenant_id": tenant_id
    })
    
    return None


@router.post("/flows/ai-generate")
async def ai_generate_flow(
    prompt: str = Body(..., embed=True),
    current_user: User = Depends(get_current_user)
):
    """Generate flow from natural language using AI (Gemini)"""
    from ..ai_flow_generator import generate_flow_from_prompt, validate_flow_structure
    
    try:
        result = await generate_flow_from_prompt(prompt)
        
        if not result.get("success"):
            error_detail = result.get("message", "Failed to generate flow")
            if result.get("error"):
                error_detail = f"{error_detail}: {result.get('error')}"
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=error_detail)
        
        flow_data = result["flow"]
        
        is_valid, error_msg = validate_flow_structure(flow_data)
        if not is_valid:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"AI generated invalid flow structure: {error_msg}. Please try rephrasing your request."
            )
        
        return {
            "success": True,
            "flow": flow_data,
            "message": "Flow generated successfully by AI"
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error in ai_generate_flow: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal server error while generating flow: {str(e)}"
        )


@router.get("/n8n/test-connection")
async def test_n8n_connection(current_user: User = Depends(get_current_user)):
    """Test connection to n8n API"""
    from ..integrations.n8n_service import n8n_service
    
    try:
        is_connected = await n8n_service.test_connection()
        return {
            "connected": is_connected,
            "message": "n8n connection successful" if is_connected else "n8n connection failed"
        }
    except Exception as e:
        return {
            "connected": False,
            "message": f"n8n connection failed: {str(e)}"
        }


@router.post("/flows/{flow_id}/sync-n8n")
async def sync_flow_with_n8n(
    flow_id: str,
    current_user: User = Depends(get_current_user)
):
    """Manually sync a flow with n8n"""
    from ..integrations.n8n_service import n8n_service
    from ..integrations.n8n_mapper import N8nMapper
    
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
    
    try:
        n8n_workflow = N8nMapper.crm_to_n8n_workflow(flow_data, tenant_id)
        n8n_workflow_id = flow_data.get("metadata", {}).get("n8n_workflow_id")
        
        if n8n_workflow_id:
            result = await n8n_service.update_workflow(n8n_workflow_id, n8n_workflow)
            message = f"Updated n8n workflow {n8n_workflow_id}"
        else:
            result = await n8n_service.create_workflow(n8n_workflow)
            n8n_workflow_id = result.get("id")
            
            await db.flows.update_one(
                {"id": flow_id, "tenant_id": tenant_id},
                {"$set": {"metadata.n8n_workflow_id": n8n_workflow_id}}
            )
            message = f"Created n8n workflow {n8n_workflow_id}"
        
        return {
            "success": True,
            "message": message,
            "n8n_workflow_id": n8n_workflow_id
        }
        
    except Exception as e:
        logger.error(f"Failed to sync flow with n8n: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to sync with n8n: {str(e)}"
        )
