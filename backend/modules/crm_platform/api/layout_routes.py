from fastapi import APIRouter, Depends, HTTPException, Query
from motor.motor_asyncio import AsyncIOMotorDatabase, AsyncIOMotorClient
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import os
import sys

# Add backend directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))))

from modules.crm_platform.services.layout_service import LayoutService

# Database setup
mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
mongo_client = AsyncIOMotorClient(mongo_url)
db_name = os.environ.get('DB_NAME', 'crm_db')
db = mongo_client[db_name]

router = APIRouter(prefix="/api/crm-platform/layouts", tags=["Layouts"])

class CreateLayoutRequest(BaseModel):
    name: str
    object_type_id: str
    tenant_id: str
    tabs: List[Dict[str, Any]] = []
    is_default: bool = False

class UpdateLayoutRequest(BaseModel):
    name: Optional[str] = None
    tabs: Optional[List[Dict[str, Any]]] = None
    is_default: Optional[bool] = None

@router.post("")
async def create_layout(request: CreateLayoutRequest):
    """Create a new page layout"""
    service = LayoutService(db)
    layout = await service.create_layout(request.dict())
    return layout

@router.get("")
async def get_layouts(
    object_type_id: str = Query(...),
    tenant_id: str = Query(...)
):
    """Get all layouts for an object type"""
    service = LayoutService(db)
    layouts = await service.get_layouts_for_object(object_type_id, tenant_id)
    return {"layouts": layouts}

@router.get("/default")
async def get_default_layout(
    object_type_id: str = Query(...),
    tenant_id: str = Query(...)
):
    """Get default layout for an object type"""
    service = LayoutService(db)
    layout = await service.get_default_layout(object_type_id, tenant_id)
    
    if not layout:
        raise HTTPException(status_code=404, detail="No default layout found")
    
    return layout

@router.get("/{layout_id}")
async def get_layout(
    layout_id: str,
    tenant_id: str = Query(...)
):
    """Get a specific layout"""
    service = LayoutService(db)
    layout = await service.get_layout(layout_id, tenant_id)
    
    if not layout:
        raise HTTPException(status_code=404, detail="Layout not found")
    
    return layout

@router.patch("/{layout_id}")
async def update_layout(
    layout_id: str,
    request: UpdateLayoutRequest,
    tenant_id: str = Query(...)
):
    """Update a layout"""
    service = LayoutService(db)
    updates = {k: v for k, v in request.dict().items() if v is not None}
    success = await service.update_layout(layout_id, tenant_id, updates)
    
    if not success:
        raise HTTPException(status_code=404, detail="Layout not found")
    
    return {"status": "updated"}

@router.post("/{layout_id}/set-default")
async def set_default_layout(
    layout_id: str,
    object_type_id: str = Query(...),
    tenant_id: str = Query(...)
):
    """Set a layout as default"""
    service = LayoutService(db)
    success = await service.set_default_layout(layout_id, object_type_id, tenant_id)
    
    if not success:
        raise HTTPException(status_code=404, detail="Layout not found")
    
    return {"status": "set_as_default"}

@router.delete("/{layout_id}")
async def delete_layout(
    layout_id: str,
    tenant_id: str = Query(...)
):
    """Delete a layout"""
    service = LayoutService(db)
    success = await service.delete_layout(layout_id, tenant_id)
    
    if not success:
        raise HTTPException(status_code=404, detail="Layout not found")
    
    return {"status": "deleted"}
