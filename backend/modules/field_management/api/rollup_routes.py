"""Rollup Field API Routes"""
from fastapi import APIRouter, Depends, HTTPException, Query, Body
from typing import List, Optional, Dict, Any
from pydantic import BaseModel
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))))

from modules.field_management.models.rollup_field import (
    RollupFieldConfig, RollupFieldCreate, RollupFieldUpdate,
    RollupRecalculateRequest
)
from modules.field_management.services.rollup_service import RollupFieldService
from shared.auth import get_current_user_dict
from shared.database import db

router = APIRouter(prefix="/api/fields/rollup", tags=["Rollup Fields"])


# ========================================
# STATIC ROUTES (MUST BE DEFINED FIRST)
# ========================================

@router.get("/scheduler/status")
async def get_rollup_scheduler_status(
    user: dict = Depends(get_current_user_dict)
):
    """Get current rollup scheduler status"""
    from modules.field_management.services.rollup_scheduler import get_rollup_scheduler
    
    
    scheduler = get_rollup_scheduler(db)
    
    return await scheduler.get_scheduler_status()


class FormulaValidationRequest(BaseModel):
    formula: str


@router.post("/validate-filter-formula")
async def validate_filter_formula(
    request: FormulaValidationRequest,
    user: dict = Depends(get_current_user_dict)
):
    """Validate a rollup filter formula expression"""
    from modules.field_management.services.rollup_formula_evaluator import formula_evaluator
    
    
    
    is_valid, error = formula_evaluator.validate_formula(request.formula)
    child_fields, parent_fields = formula_evaluator.extract_field_references(request.formula)
    
    return {
        "valid": is_valid,
        "error": error,
        "child_field_refs": child_fields,
        "parent_field_refs": parent_fields
    }


# ========================================
# PARAMETERIZED ROUTES
# ========================================

@router.get("/{object_name}", response_model=List[Dict[str, Any]])
async def list_rollup_fields(
    object_name: str,
    user: dict = Depends(get_current_user_dict)
):
    """List all rollup fields for an object"""
    
    service = RollupFieldService(db)
    
    fields = await service.list_rollup_fields(object_name, user["tenant_id"])
    return [f.model_dump() for f in fields]


@router.get("/{object_name}/relationships/children")
async def get_child_relationships(
    object_name: str,
    user: dict = Depends(get_current_user_dict)
):
    """Get all child objects that have a relationship to this object"""
    
    
    # Find all lookup fields that point to this object
    cursor = db.advanced_fields.find({
        "tenant_id": user["tenant_id"],
        "field_type": "lookup",
        "target_object": object_name,
        "is_active": True
    }, {"_id": 0})
    
    relationships = []
    async for field in cursor:
        relationships.append({
            "child_object": field["object_name"],
            "child_object_label": field.get("object_label", field["object_name"]),
            "relationship_field": field["api_key"],
            "field_label": field["label"]
        })
    
    return {"relationships": relationships}


@router.get("/{object_name}/{field_id}", response_model=Dict[str, Any])
async def get_rollup_field(
    object_name: str,
    field_id: str,
    user: dict = Depends(get_current_user_dict)
):
    """Get a specific rollup field"""
    
    service = RollupFieldService(db)
    
    field = await service.get_rollup_field(field_id, user["tenant_id"])
    if not field:
        raise HTTPException(status_code=404, detail="Rollup field not found")
    
    return field.model_dump()


@router.post("/{object_name}", response_model=Dict[str, Any])
async def create_rollup_field(
    object_name: str,
    field_data: RollupFieldCreate,
    user: dict = Depends(get_current_user_dict)
):
    """Create a new rollup field"""
    
    service = RollupFieldService(db)
    
    try:
        field = await service.create_rollup_field(
            object_name,
            user["tenant_id"],
            field_data,
            user["user_id"]
        )
        return {"success": True, "field": field.model_dump()}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/{object_name}/{field_id}", response_model=Dict[str, Any])
async def update_rollup_field(
    object_name: str,
    field_id: str,
    field_data: RollupFieldUpdate,
    user: dict = Depends(get_current_user_dict)
):
    """Update a rollup field"""
    
    service = RollupFieldService(db)
    
    try:
        field = await service.update_rollup_field(
            field_id,
            user["tenant_id"],
            field_data,
            user["user_id"]
        )
        if not field:
            raise HTTPException(status_code=404, detail="Rollup field not found")
        
        return {"success": True, "field": field.model_dump()}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{object_name}/{field_id}")
async def delete_rollup_field(
    object_name: str,
    field_id: str,
    user: dict = Depends(get_current_user_dict)
):
    """Delete a rollup field"""
    
    service = RollupFieldService(db)
    
    success = await service.delete_rollup_field(field_id, user["tenant_id"])
    if not success:
        raise HTTPException(status_code=404, detail="Rollup field not found")
    
    return {"success": True, "message": "Rollup field deleted"}


@router.post("/{object_name}/{field_id}/recalculate")
async def recalculate_rollup(
    object_name: str,
    field_id: str,
    request: RollupRecalculateRequest = None,
    user: dict = Depends(get_current_user_dict)
):
    """Manually recalculate rollup values"""
    
    service = RollupFieldService(db)
    
    field = await service.get_rollup_field(field_id, user["tenant_id"])
    if not field:
        raise HTTPException(status_code=404, detail="Rollup field not found")
    
    if request and request.parent_id:
        # Recalculate for specific parent
        await service.update_parent_rollup(field, request.parent_id)
        return {"success": True, "message": "Rollup recalculated for specified parent"}
    else:
        # Recalculate for all parents
        await service._recalculate_all_parents(field)
        return {"success": True, "message": "Rollup recalculation started for all parents"}


# ========================================
# SCHEDULER ENDPOINTS
# ========================================

@router.post("/{object_name}/{field_id}/schedule")
async def schedule_rollup_recalculation(
    object_name: str,
    field_id: str,
    cron_expression: str = None,
    user: dict = Depends(get_current_user_dict)
):
    """Schedule periodic recalculation for a rollup field"""
    from modules.field_management.services.rollup_scheduler import get_rollup_scheduler
    
    
    scheduler = get_rollup_scheduler(db)
    
    try:
        await scheduler.schedule_rollup(field_id, user["tenant_id"], cron_expression)
        return {
            "success": True,
            "message": "Rollup scheduled for periodic recalculation"
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.delete("/{object_name}/{field_id}/schedule")
async def unschedule_rollup_recalculation(
    object_name: str,
    field_id: str,
    user: dict = Depends(get_current_user_dict)
):
    """Remove scheduled recalculation for a rollup field"""
    from modules.field_management.services.rollup_scheduler import get_rollup_scheduler
    
    
    scheduler = get_rollup_scheduler(db)
    
    await scheduler.unschedule_rollup(field_id)
    return {"success": True, "message": "Rollup schedule removed"}


@router.post("/{object_name}/{field_id}/trigger-recalc")
async def trigger_rollup_recalculation_now(
    object_name: str,
    field_id: str,
    request: RollupRecalculateRequest = None,
    user: dict = Depends(get_current_user_dict)
):
    """Trigger immediate rollup recalculation via scheduler"""
    from modules.field_management.services.rollup_scheduler import get_rollup_scheduler
    
    
    scheduler = get_rollup_scheduler(db)
    
    try:
        parent_id = request.parent_id if request else None
        result = await scheduler.trigger_recalculation_now(
            field_id, user["tenant_id"], parent_id
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
