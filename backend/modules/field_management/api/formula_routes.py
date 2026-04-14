"""Formula Field API Routes"""
from fastapi import APIRouter, Depends, HTTPException, Query
from typing import List, Optional, Dict, Any
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))))

from modules.field_management.models.formula_field import (
    FormulaFieldConfig, FormulaFieldCreate, FormulaFieldUpdate,
    FormulaValidationRequest, FormulaValidationResult,
    FormulaTestRequest, FormulaTestResult,
    STANDARD_FUNCTIONS
)
from modules.field_management.services.formula_service import FormulaFieldService
from shared.auth import get_current_user_dict
from shared.database import db

router = APIRouter(prefix="/api/fields/formula", tags=["Formula Fields"])


@router.get("/functions", response_model=List[Dict[str, Any]])
async def list_formula_functions():
    """List all available formula functions"""
    return [f.model_dump() for f in STANDARD_FUNCTIONS]


@router.get("/{object_name}", response_model=List[Dict[str, Any]])
async def list_formula_fields(
    object_name: str,
    user: dict = Depends(get_current_user_dict)
):
    """List all formula fields for an object"""
    service = FormulaFieldService(db)
    
    fields = await service.list_formula_fields(object_name, user["tenant_id"])
    return [f.model_dump() for f in fields]


@router.get("/{object_name}/{field_id}", response_model=Dict[str, Any])
async def get_formula_field(
    object_name: str,
    field_id: str,
    user: dict = Depends(get_current_user_dict)
):
    """Get a specific formula field"""
    
    service = FormulaFieldService(db)
    
    field = await service.get_formula_field(field_id, user["tenant_id"])
    if not field:
        raise HTTPException(status_code=404, detail="Formula field not found")
    
    return field.model_dump()


# IMPORTANT: Static routes (/validate, /test) must be defined BEFORE dynamic routes (/{object_name})
# to prevent FastAPI from matching "validate" or "test" as object_name

@router.post("/validate", response_model=Dict[str, Any])
async def validate_formula(
    request: FormulaValidationRequest,
    user: dict = Depends(get_current_user_dict)
):
    """Validate a formula expression"""
    
    service = FormulaFieldService(db)
    
    result = await service.validate_formula(request, user["tenant_id"])
    return result.model_dump()


@router.post("/test", response_model=Dict[str, Any])
async def test_formula(
    request: FormulaTestRequest,
    user: dict = Depends(get_current_user_dict)
):
    """Test a formula with a specific record"""
    
    service = FormulaFieldService(db)
    
    result = await service.test_formula(request, user["tenant_id"])
    return result.model_dump()


@router.post("/{object_name}", response_model=Dict[str, Any])
async def create_formula_field(
    object_name: str,
    field_data: FormulaFieldCreate,
    user: dict = Depends(get_current_user_dict)
):
    """Create a new formula field"""
    
    service = FormulaFieldService(db)
    
    try:
        field = await service.create_formula_field(
            object_name,
            user["tenant_id"],
            field_data,
            user["user_id"]
        )
        return {"success": True, "field": field.model_dump()}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/{object_name}/{field_id}", response_model=Dict[str, Any])
async def update_formula_field(
    object_name: str,
    field_id: str,
    field_data: FormulaFieldUpdate,
    user: dict = Depends(get_current_user_dict)
):
    """Update a formula field"""
    
    service = FormulaFieldService(db)
    
    try:
        field = await service.update_formula_field(
            field_id,
            user["tenant_id"],
            field_data,
            user["user_id"]
        )
        if not field:
            raise HTTPException(status_code=404, detail="Formula field not found")
        
        return {"success": True, "field": field.model_dump()}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{object_name}/{field_id}")
async def delete_formula_field(
    object_name: str,
    field_id: str,
    user: dict = Depends(get_current_user_dict)
):
    """Delete a formula field"""
    
    service = FormulaFieldService(db)
    
    success = await service.delete_formula_field(field_id, user["tenant_id"])
    if not success:
        raise HTTPException(status_code=404, detail="Formula field not found")
    
    return {"success": True, "message": "Formula field deleted"}
