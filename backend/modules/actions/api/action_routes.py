"""
Actions API Routes
Endpoints for managing and executing configurable actions
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging

from shared.auth import get_current_user_dict
from ..models.action_model import (
    ActionType,
    ActionPlacement,
    ActionContext,
    ActionCreateRequest,
    ActionUpdateRequest,
    ActionResponse,
    ActionExecuteRequest,
    ActionExecuteResponse
)
from ..services.action_service import ActionService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/actions", tags=["Actions"])

# Database connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]


def get_service() -> ActionService:
    """Get action service instance"""
    return ActionService(db)


# ============================================
# Helper Endpoints
# ============================================

@router.get("/flows/record-detail")
async def get_record_detail_flows(
    object_name: Optional[str] = None,
    current_user: dict = Depends(get_current_user_dict)
):
    """
    Get Screen Flows that can be used for Run Flow actions on record detail pages.
    
    Returns flows with:
    - flow_type = "screen"
    - status = "active"
    - launch_mode = "record_detail" (matching the object) OR "basic" (Use Anywhere)
    
    Does NOT return:
    - list_view flows (not applicable for record header actions)
    - draft/inactive flows
    """
    tenant_id = current_user.get("tenant_id")
    
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant ID required")
    
    # Build query for eligible flows
    # We need: Screen flows that are active AND (record_detail for this object OR basic/use anywhere)
    base_conditions = {
        "tenant_id": tenant_id,
        "flow_type": "screen",
        "status": "active"
    }
    
    # Build the $or condition for launch modes
    launch_mode_conditions = [
        {"launch_mode": "basic"},  # Use Anywhere - no object filtering needed
        {"launch_mode": {"$exists": False}},  # Legacy flows without launch_mode default to "basic"
        {"launch_mode": None},  # Null launch_mode also treated as "basic"
    ]
    
    # For record_detail mode, filter by object
    if object_name:
        # Add record_detail flows matching this object
        launch_mode_conditions.append({
            "launch_mode": "record_detail",
            "screen_flow_object": object_name.lower()
        })
    else:
        # If no object specified, include all record_detail flows
        launch_mode_conditions.append({"launch_mode": "record_detail"})
    
    query = {
        **base_conditions,
        "$or": launch_mode_conditions
    }
    
    logger.info(f"Querying flows for actions with: {query}")
    
    cursor = db["flows"].find(query, {
        "_id": 0,
        "id": 1,
        "name": 1,
        "description": 1,
        "status": 1,
        "version": 1,
        "screen_flow_object": 1,
        "input_variables": 1,
        "flow_type": 1,
        "launch_mode": 1
    })
    
    flows = await cursor.to_list(length=100)
    
    logger.info(f"Found {len(flows)} eligible flows for actions")
    
    return {
        "flows": flows,
        "total": len(flows)
    }


@router.get("/flows/list-view")
async def get_list_view_flows(
    object_name: Optional[str] = None,
    current_user: dict = Depends(get_current_user_dict)
):
    """
    Get Screen Flows that can be used for List View actions.
    
    Returns flows with:
    - flow_type = "screen"
    - status = "active"
    - launch_mode = "list_view"
    
    These flows can work with multiple selected records.
    """
    tenant_id = current_user.get("tenant_id")
    
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant ID required")
    
    # Build query for List View flows
    query = {
        "tenant_id": tenant_id,
        "flow_type": "screen",
        "status": "active",
        "launch_mode": "list_view"
    }
    
    # Optionally filter by object
    if object_name:
        query["screen_flow_object"] = object_name.lower()
    
    logger.info(f"Querying list view flows with: {query}")
    
    cursor = db["flows"].find(query, {
        "_id": 0,
        "id": 1,
        "name": 1,
        "description": 1,
        "status": 1,
        "version": 1,
        "screen_flow_object": 1,
        "input_variables": 1,
        "flow_type": 1,
        "launch_mode": 1
    })
    
    flows = await cursor.to_list(length=100)
    
    logger.info(f"Found {len(flows)} list view flows for actions")
    
    return {
        "flows": flows,
        "total": len(flows)
    }


# ============================================
# Admin / Setup Endpoints
# ============================================

@router.get("", response_model=List[ActionResponse])
async def get_actions(
    object: Optional[str] = None,
    placement: Optional[ActionPlacement] = None,
    action_context: Optional[str] = None,  # RECORD_DETAIL or LIST_VIEW
    active_only: bool = False,
    current_user: dict = Depends(get_current_user_dict)
):
    """Get all actions, optionally filtered by object, placement, and context"""
    service = get_service()
    tenant_id = current_user.get("tenant_id")
    
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant ID required")
    
    if object:
        actions = await service.get_actions_for_object(
            tenant_id=tenant_id,
            object_api_name=object,
            active_only=active_only,
            placement=placement,
            action_context=action_context
        )
    else:
        # Get actions for all objects (admin view)
        actions = []
        query = {"tenant_id": tenant_id}
        if action_context:
            query["action_context"] = action_context
        cursor = db["actions"].find(
            query,
            {"_id": 0}
        ).sort("sort_order", 1)
        async for doc in cursor:
            from ..models.action_model import ActionConfig
            actions.append(ActionConfig(**doc))
    
    return [
        ActionResponse(
            id=a.id,
            object_api_name=a.object_api_name,
            type=a.type,
            label=a.label,
            api_name=a.api_name,
            icon=a.icon,
            placement=a.placement,
            action_context=getattr(a, 'action_context', 'RECORD_DETAIL'),
            is_active=a.is_active,
            is_system=a.is_system,
            config_json=a.config_json,
            sort_order=a.sort_order,
            created_by=a.created_by,
            created_at=a.created_at,
            updated_at=a.updated_at
        )
        for a in actions
    ]


@router.get("/{action_id}", response_model=ActionResponse)
async def get_action(
    action_id: str,
    current_user: dict = Depends(get_current_user_dict)
):
    """Get a specific action by ID"""
    service = get_service()
    tenant_id = current_user.get("tenant_id")
    
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant ID required")
    
    action = await service.get_action(action_id, tenant_id)
    if not action:
        raise HTTPException(status_code=404, detail="Action not found")
    
    return ActionResponse(
        id=action.id,
        object_api_name=action.object_api_name,
        type=action.type,
        label=action.label,
        api_name=action.api_name,
        icon=action.icon,
        placement=action.placement,
        action_context=getattr(action, 'action_context', ActionContext.RECORD_DETAIL),
        is_active=action.is_active,
        is_system=getattr(action, 'is_system', False),
        config_json=action.config_json,
        sort_order=action.sort_order,
        created_by=action.created_by,
        created_at=action.created_at,
        updated_at=action.updated_at
    )


@router.post("", response_model=ActionResponse)
async def create_action(
    request: ActionCreateRequest,
    current_user: dict = Depends(get_current_user_dict)
):
    """Create a new action"""
    service = get_service()
    tenant_id = current_user.get("tenant_id")
    user_id = current_user.get("user_id")
    
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant ID required")
    
    try:
        action = await service.create_action(tenant_id, request, user_id)
        
        return ActionResponse(
            id=action.id,
            object_api_name=action.object_api_name,
            type=action.type,
            label=action.label,
            api_name=action.api_name,
            icon=action.icon,
            placement=action.placement,
            is_active=action.is_active,
            is_system=getattr(action, 'is_system', False),
            config_json=action.config_json,
            sort_order=action.sort_order,
            created_by=action.created_by,
            created_at=action.created_at,
            updated_at=action.updated_at
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/{action_id}", response_model=ActionResponse)
async def update_action(
    action_id: str,
    request: ActionUpdateRequest,
    current_user: dict = Depends(get_current_user_dict)
):
    """Update an action"""
    service = get_service()
    tenant_id = current_user.get("tenant_id")
    
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant ID required")
    
    action = await service.update_action(action_id, tenant_id, request)
    if not action:
        raise HTTPException(status_code=404, detail="Action not found")
    
    return ActionResponse(
        id=action.id,
        object_api_name=action.object_api_name,
        type=action.type,
        label=action.label,
        api_name=action.api_name,
        icon=action.icon,
        placement=action.placement,
        action_context=getattr(action, 'action_context', ActionContext.RECORD_DETAIL),
        is_active=action.is_active,
        is_system=getattr(action, 'is_system', False),
        config_json=action.config_json,
        sort_order=action.sort_order,
        created_by=action.created_by,
        created_at=action.created_at,
        updated_at=action.updated_at
    )


@router.delete("/{action_id}")
async def delete_action(
    action_id: str,
    current_user: dict = Depends(get_current_user_dict)
):
    """Delete an action (system actions cannot be deleted)"""
    service = get_service()
    tenant_id = current_user.get("tenant_id")
    
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant ID required")
    
    try:
        deleted = await service.delete_action(action_id, tenant_id)
        if not deleted:
            raise HTTPException(status_code=404, detail="Action not found")
        
        return {"success": True, "message": "Action deleted"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{action_id}/clone", response_model=ActionResponse)
async def clone_action(
    action_id: str,
    current_user: dict = Depends(get_current_user_dict)
):
    """Clone an existing action"""
    service = get_service()
    tenant_id = current_user.get("tenant_id")
    user_id = current_user.get("user_id")
    
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant ID required")
    
    action = await service.clone_action(action_id, tenant_id, user_id)
    if not action:
        raise HTTPException(status_code=404, detail="Action not found")
    
    return ActionResponse(
        id=action.id,
        object_api_name=action.object_api_name,
        type=action.type,
        label=action.label,
        api_name=action.api_name,
        icon=action.icon,
        placement=action.placement,
        action_context=getattr(action, 'action_context', ActionContext.RECORD_DETAIL),
        is_active=action.is_active,
        is_system=getattr(action, 'is_system', False),
        config_json=action.config_json,
        sort_order=action.sort_order,
        created_by=action.created_by,
        created_at=action.created_at,
        updated_at=action.updated_at
    )


@router.patch("/{action_id}/toggle-active", response_model=ActionResponse)
async def toggle_action_active(
    action_id: str,
    current_user: dict = Depends(get_current_user_dict)
):
    """Toggle the active status of an action"""
    service = get_service()
    tenant_id = current_user.get("tenant_id")
    
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant ID required")
    
    action = await service.toggle_active(action_id, tenant_id)
    if not action:
        raise HTTPException(status_code=404, detail="Action not found")
    
    return ActionResponse(
        id=action.id,
        object_api_name=action.object_api_name,
        type=action.type,
        label=action.label,
        api_name=action.api_name,
        icon=action.icon,
        placement=action.placement,
        action_context=getattr(action, 'action_context', ActionContext.RECORD_DETAIL),
        is_active=action.is_active,
        is_system=getattr(action, 'is_system', False),
        config_json=action.config_json,
        sort_order=action.sort_order,
        created_by=action.created_by,
        created_at=action.created_at,
        updated_at=action.updated_at
    )


from pydantic import BaseModel


class SystemActionLabelUpdate(BaseModel):
    """Request model for updating system action label only"""
    label: str


@router.patch("/{action_id}/label", response_model=ActionResponse)
async def update_system_action_label(
    action_id: str,
    request: SystemActionLabelUpdate,
    current_user: dict = Depends(get_current_user_dict)
):
    """
    Update the label of a system action.
    
    System actions (Create, Edit, Delete) can ONLY have their label changed.
    This endpoint is specifically for system actions - use PUT for custom actions.
    """
    service = get_service()
    tenant_id = current_user.get("tenant_id")
    
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant ID required")
    
    # Validate label is not empty
    if not request.label or not request.label.strip():
        raise HTTPException(status_code=400, detail="Label cannot be empty")
    
    # Check if this is a system action
    if not action_id.startswith("sys-"):
        raise HTTPException(
            status_code=400, 
            detail="This endpoint is for system actions only. Use PUT /actions/{id} for custom actions."
        )
    
    # Update the system action label
    action = await service.update_system_action_label(action_id, tenant_id, request.label.strip())
    
    if not action:
        raise HTTPException(status_code=404, detail="Action not found")
    
    return ActionResponse(
        id=action.id,
        object_api_name=action.object_api_name,
        type=action.type,
        label=action.label,
        api_name=action.api_name,
        icon=action.icon,
        placement=action.placement,
        is_active=action.is_active,
        is_system=getattr(action, 'is_system', True),
        config_json=action.config_json,
        sort_order=action.sort_order,
        created_by=action.created_by,
        created_at=action.created_at,
        updated_at=action.updated_at
    )


@router.post("/reorder")
async def reorder_actions(
    object_api_name: str,
    action_ids: List[str],
    current_user: dict = Depends(get_current_user_dict)
):
    """Reorder actions for an object"""
    service = get_service()
    tenant_id = current_user.get("tenant_id")
    
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant ID required")
    
    success = await service.reorder_actions(tenant_id, object_api_name, action_ids)
    return {"success": success}


# ============================================
# Runtime Endpoints
# ============================================

@router.get("/runtime/{object_api_name}", response_model=List[ActionResponse])
async def get_runtime_actions(
    object_api_name: str,
    placement: ActionPlacement = ActionPlacement.RECORD_HEADER,
    current_user: dict = Depends(get_current_user_dict)
):
    """Get active actions for runtime display on record pages"""
    service = get_service()
    tenant_id = current_user.get("tenant_id")
    
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant ID required")
    
    actions = await service.get_runtime_actions(tenant_id, object_api_name, placement)
    
    return [
        ActionResponse(
            id=a.id,
            object_api_name=a.object_api_name,
            type=a.type,
            label=a.label,
            api_name=a.api_name,
            icon=a.icon,
            placement=a.placement,
            is_active=a.is_active,
            is_system=getattr(a, 'is_system', False),
            config_json=a.config_json,
            sort_order=a.sort_order,
            created_by=a.created_by,
            created_at=a.created_at,
            updated_at=a.updated_at
        )
        for a in actions
    ]


@router.post("/{action_id}/execute", response_model=ActionExecuteResponse)
async def execute_action(
    action_id: str,
    request: ActionExecuteRequest,
    current_user: dict = Depends(get_current_user_dict)
):
    """Execute an action"""
    service = get_service()
    tenant_id = current_user.get("tenant_id")
    user_id = current_user.get("user_id")
    
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant ID required")
    
    # Get the current record data if not provided
    record_data = request.record_data or {}
    if not record_data and request.record_id:
        # Fetch record data
        records_collection = db["object_records"]
        record = await records_collection.find_one({
            "tenant_id": tenant_id,
            "$or": [
                {"series_id": request.record_id},
                {"id": request.record_id}
            ]
        })
        if record:
            record.pop("_id", None)
            record_data = record
    
    result = await service.execute_action(
        action_id=action_id,
        tenant_id=tenant_id,
        record_id=request.record_id,
        record_data=record_data,
        form_data=request.form_data,
        user_id=user_id
    )
    
    return ActionExecuteResponse(
        success=result.get("success", False),
        message=result.get("message", ""),
        action_type=result.get("action_type", ActionType.UPDATE_RECORD),
        result=result.get("result"),
        redirect_url=result.get("redirect_url")
    )
