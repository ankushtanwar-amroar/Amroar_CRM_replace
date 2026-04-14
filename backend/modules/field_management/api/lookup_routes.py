"""Lookup Field API Routes"""
from fastapi import APIRouter, Depends, HTTPException, Query
from typing import List, Optional, Dict, Any
import os
import sys

# Add backend to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))))

from modules.field_management.models.lookup_field import (
    LookupFieldConfig, LookupFieldCreate, LookupFieldUpdate,
    LookupSearchRequest, LookupSearchResult
)
from modules.field_management.services.lookup_service import LookupFieldService
from shared.auth import get_current_user_dict
from shared.database import db

router = APIRouter(prefix="/api/fields/lookup", tags=["Lookup Fields"])


# IMPORTANT: Static routes must come BEFORE dynamic routes to avoid conflicts
@router.post("/search", response_model=List[Dict[str, Any]])
async def search_lookup_records(
    request: LookupSearchRequest,
    user: dict = Depends(get_current_user_dict)
):
    """Search records for lookup field dropdown"""
    
    service = LookupFieldService(db)
    
    results = await service.search_lookup_records(
        request,
        user["tenant_id"],
        request.context
    )
    
    return [r.model_dump() for r in results]


@router.get("/{object_name}", response_model=List[Dict[str, Any]])
async def list_lookup_fields(
    object_name: str,
    user: dict = Depends(get_current_user_dict)
):
    """List all lookup fields for an object"""
    
    service = LookupFieldService(db)
    
    fields = await service.list_lookup_fields(object_name, user["tenant_id"])
    return [f.model_dump() for f in fields]


@router.get("/{object_name}/{field_id}", response_model=Dict[str, Any])
async def get_lookup_field(
    object_name: str,
    field_id: str,
    user: dict = Depends(get_current_user_dict)
):
    """Get a specific lookup field"""
    
    service = LookupFieldService(db)
    
    field = await service.get_lookup_field(field_id, user["tenant_id"])
    if not field:
        raise HTTPException(status_code=404, detail="Lookup field not found")
    
    return field.model_dump()


@router.post("/{object_name}", response_model=Dict[str, Any])
async def create_lookup_field(
    object_name: str,
    field_data: LookupFieldCreate,
    user: dict = Depends(get_current_user_dict)
):
    """Create a new lookup field"""
    
    service = LookupFieldService(db)
    
    try:
        field = await service.create_lookup_field(
            object_name,
            user["tenant_id"],
            field_data,
            user["user_id"]
        )
        return {"success": True, "field": field.model_dump()}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/{object_name}/{field_id}", response_model=Dict[str, Any])
async def update_lookup_field(
    object_name: str,
    field_id: str,
    field_data: LookupFieldUpdate,
    user: dict = Depends(get_current_user_dict)
):
    """Update a lookup field"""
    
    service = LookupFieldService(db)
    
    try:
        field = await service.update_lookup_field(
            field_id,
            user["tenant_id"],
            field_data,
            user["user_id"]
        )
        if not field:
            raise HTTPException(status_code=404, detail="Lookup field not found")
        
        return {"success": True, "field": field.model_dump()}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{object_name}/{field_id}")
async def delete_lookup_field(
    object_name: str,
    field_id: str,
    user: dict = Depends(get_current_user_dict)
):
    """Delete a lookup field"""
    
    service = LookupFieldService(db)
    
    success = await service.delete_lookup_field(field_id, user["tenant_id"])
    if not success:
        raise HTTPException(status_code=404, detail="Lookup field not found")
    
    return {"success": True, "message": "Lookup field deleted"}
