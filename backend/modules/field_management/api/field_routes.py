"""Unified Field Management API Routes"""
from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))))

from modules.field_management.services.field_manager import FieldManagerService
from modules.field_management.models.base import FieldType
from shared.auth import get_current_user
from shared.database import db

router = APIRouter(prefix="/api/fields", tags=["Field Management"])


@router.get("/advanced/{object_name}")
async def get_all_advanced_fields(
    object_name: str,
    field_type: Optional[str] = None,
    current_user = Depends(get_current_user)
):
    """Get all advanced fields (lookup, rollup, formula) for an object"""
    service = FieldManagerService(db)
    
    if field_type:
        try:
            ft = FieldType(field_type)
            fields = await service.get_fields_by_type(object_name, current_user.tenant_id, ft)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid field type: {field_type}")
    else:
        fields = await service.get_all_advanced_fields(object_name, current_user.tenant_id)
    
    return {"fields": fields, "count": len(fields)}


@router.get("/advanced/{object_name}/{field_id}")
async def get_advanced_field(
    object_name: str,
    field_id: str,
    current_user = Depends(get_current_user)
):
    """Get a specific advanced field by ID"""
    service = FieldManagerService(db)
    
    field = await service.get_field_by_id(field_id, current_user.tenant_id)
    if not field:
        raise HTTPException(status_code=404, detail="Field not found")
    
    return field


@router.get("/complete/{object_name}")
async def get_complete_fields(
    object_name: str,
    current_user = Depends(get_current_user)
):
    """Get all fields (standard + custom + advanced) for an object"""
    service = FieldManagerService(db)
    
    return await service.get_object_fields(object_name, current_user.tenant_id)


@router.get("/objects")
async def get_available_objects(
    current_user = Depends(get_current_user)
):
    """Get all available objects for relationship creation"""
    service = FieldManagerService(db)
    
    objects = await service.get_related_objects(current_user.tenant_id)
    return {"objects": objects}


@router.get("/{object_name}/relationships")
async def get_object_relationships(
    object_name: str,
    current_user = Depends(get_current_user)
):
    """Get all relationships (children) for an object"""
    service = FieldManagerService(db)
    
    relationships = await service.get_child_relationships(object_name, current_user.tenant_id)
    return {"relationships": relationships}


@router.get("/{object_name}/layouts")
async def get_object_layouts(
    object_name: str,
    current_user = Depends(get_current_user)
):
    """Get all page layouts for an object"""
    service = FieldManagerService(db)
    
    layouts = await service.get_layouts_for_object(object_name, current_user.tenant_id)
    return {"layouts": layouts}


@router.get("/validate-api-key")
async def validate_api_key(
    object_name: str = Query(...),
    api_key: str = Query(...),
    exclude_field_id: Optional[str] = None,
    current_user = Depends(get_current_user)
):
    """Check if an API key is available for a new field"""
    service = FieldManagerService(db)
    
    is_unique = await service.validate_api_key_unique(
        object_name, api_key, current_user.tenant_id, exclude_field_id
    )
    
    return {"is_available": is_unique}


@router.get("/types")
async def get_field_types():
    """Get available advanced field types"""
    return {
        "types": [
            {
                "value": "lookup",
                "label": "Lookup (Relationship)",
                "description": "References another record in the system"
            },
            {
                "value": "rollup",
                "label": "Rollup Summary",
                "description": "Calculates aggregated values from related records"
            },
            {
                "value": "formula",
                "label": "Formula",
                "description": "Computed field using expressions and functions"
            }
        ]
    }
