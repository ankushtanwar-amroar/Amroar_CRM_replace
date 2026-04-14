"""
Stage Definitions API Routes
CRUD operations for stage/status metadata configuration.
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional
import logging

from modules.auth.api.auth_routes import get_current_user
from shared.models import User
from ..models.stage_definition_model import (
    StageDefinitionCreate,
    StageDefinitionUpdate,
    StageDefinitionResponse
)
from ..services.stage_definition_service import get_stage_definition_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/stage-definitions", tags=["Stage Definitions"])


@router.get("", response_model=List[dict])
async def get_stage_definitions(
    object_name: Optional[str] = None,
    field_name: Optional[str] = None,
    include_inactive: bool = False,
    current_user: User = Depends(get_current_user)
):
    """
    Get stage definitions.
    
    - If object_name is provided, returns stages for that object only
    - If include_inactive is True, includes deactivated stages
    """
    service = get_stage_definition_service()
    
    if object_name:
        stages = await service.get_stages_for_object(
            current_user.tenant_id,
            object_name,
            field_name,
            active_only=not include_inactive
        )
        return stages
    
    # Get all stages for tenant
    from config.database import db
    query = {"tenant_id": current_user.tenant_id}
    if not include_inactive:
        query["is_active"] = True
    
    stages = await db.stage_definitions.find(
        query,
        {"_id": 0}
    ).sort([("object_name", 1), ("sort_order", 1)]).to_list(None)
    
    return stages


@router.get("/{object_name}")
async def get_stages_for_object(
    object_name: str,
    include_inactive: bool = False,
    current_user: User = Depends(get_current_user)
):
    """Get all stage definitions for a specific object"""
    service = get_stage_definition_service()
    
    stages = await service.get_stages_for_object(
        current_user.tenant_id,
        object_name,
        active_only=not include_inactive
    )
    
    return {
        "object_name": object_name,
        "stages": stages,
        "total": len(stages)
    }


@router.get("/{object_name}/{stage_name}")
async def get_stage_by_name(
    object_name: str,
    stage_name: str,
    current_user: User = Depends(get_current_user)
):
    """Get a specific stage definition by name"""
    service = get_stage_definition_service()
    
    stage = await service.get_stage_by_name(
        current_user.tenant_id,
        object_name,
        stage_name
    )
    
    if not stage:
        raise HTTPException(status_code=404, detail="Stage not found")
    
    return stage


@router.post("")
async def create_stage_definition(
    stage_data: StageDefinitionCreate,
    current_user: User = Depends(get_current_user)
):
    """Create a new stage definition"""
    service = get_stage_definition_service()
    
    try:
        stage = await service.create_stage(
            current_user.tenant_id,
            stage_data,
            current_user.id
        )
        return stage
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/{stage_id}")
async def update_stage_definition(
    stage_id: str,
    stage_data: StageDefinitionUpdate,
    current_user: User = Depends(get_current_user)
):
    """Update a stage definition"""
    service = get_stage_definition_service()
    
    stage = await service.update_stage(
        current_user.tenant_id,
        stage_id,
        stage_data,
        current_user.id
    )
    
    if not stage:
        raise HTTPException(status_code=404, detail="Stage not found")
    
    return stage


@router.delete("/{stage_id}")
async def delete_stage_definition(
    stage_id: str,
    current_user: User = Depends(get_current_user)
):
    """Delete a stage definition"""
    service = get_stage_definition_service()
    
    success = await service.delete_stage(
        current_user.tenant_id,
        stage_id
    )
    
    if not success:
        raise HTTPException(status_code=404, detail="Stage not found")
    
    return {"message": "Stage deleted successfully"}


@router.post("/seed")
async def seed_default_stages(
    current_user: User = Depends(get_current_user)
):
    """
    Seed default stage definitions for the current tenant.
    Only creates stages that don't already exist.
    """
    service = get_stage_definition_service()
    
    results = await service.seed_default_stages(
        current_user.tenant_id,
        current_user.id
    )
    
    return {
        "message": "Default stages seeded successfully",
        "created": results
    }


@router.get("/{object_name}/computed/{stage_value}")
async def get_computed_fields(
    object_name: str,
    stage_value: str,
    current_user: User = Depends(get_current_user)
):
    """
    Get computed field values for a given stage.
    Used for Opportunity to get probability_percent, forecast_category, etc.
    """
    service = get_stage_definition_service()
    
    computed = await service.get_computed_fields_for_stage(
        current_user.tenant_id,
        object_name,
        stage_value
    )
    
    return computed
