from fastapi import APIRouter, Query, HTTPException
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))))

from modules.crm_platform.services.workspace_service import WorkspaceService

# Database setup
mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
mongo_client = AsyncIOMotorClient(mongo_url)
db_name = os.environ.get('DB_NAME', 'crm_db')
db = mongo_client[db_name]

router = APIRouter(prefix="/api/crm-platform/workspace", tags=["Workspace"])

class TabDataRequest(BaseModel):
    id: str
    title: str
    type: str
    object_type: Optional[str] = None
    record_id: Optional[str] = None
    public_id: Optional[str] = None
    icon: Optional[str] = None
    closeable: bool = True

@router.get("")
async def get_workspace(
    user_id: str = Query(...),
    tenant_id: str = Query(...)
):
    """Get user's workspace state"""
    service = WorkspaceService(db)
    workspace = await service.get_workspace(user_id, tenant_id)
    
    if not workspace:
        workspace = await service.create_workspace(user_id, tenant_id)
    
    return workspace

@router.post("/open-primary-tab")
async def open_primary_tab(
    tab_data: TabDataRequest,
    user_id: str = Query(...),
    tenant_id: str = Query(...)
):
    """Open a primary tab"""
    service = WorkspaceService(db)
    workspace = await service.open_primary_tab(user_id, tenant_id, tab_data.dict())
    return workspace

@router.post("/open-subtab")
async def open_subtab(
    tab_data: TabDataRequest,
    primary_tab_id: str = Query(...),
    user_id: str = Query(...),
    tenant_id: str = Query(...)
):
    """Open a subtab"""
    service = WorkspaceService(db)
    workspace = await service.open_subtab(user_id, tenant_id, primary_tab_id, tab_data.dict())
    
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")
    
    return workspace

@router.delete("/close-primary-tab/{tab_id}")
async def close_primary_tab(
    tab_id: str,
    user_id: str = Query(...),
    tenant_id: str = Query(...)
):
    """Close a primary tab"""
    service = WorkspaceService(db)
    workspace = await service.close_primary_tab(user_id, tenant_id, tab_id)
    return workspace

@router.delete("/close-subtab/{subtab_id}")
async def close_subtab(
    subtab_id: str,
    primary_tab_id: str = Query(...),
    user_id: str = Query(...),
    tenant_id: str = Query(...)
):
    """Close a subtab"""
    service = WorkspaceService(db)
    workspace = await service.close_subtab(user_id, tenant_id, primary_tab_id, subtab_id)
    return workspace

@router.post("/reorder-tabs")
async def reorder_tabs(
    new_order: List[str],
    user_id: str = Query(...),
    tenant_id: str = Query(...)
):
    """Reorder primary tabs"""
    service = WorkspaceService(db)
    workspace = await service.reorder_tabs(user_id, tenant_id, new_order)
    return workspace

@router.post("/set-active-tab")
async def set_active_tab(
    tab_id: str = Query(...),
    user_id: str = Query(...),
    tenant_id: str = Query(...)
):
    """Set active primary tab"""
    service = WorkspaceService(db)
    await service.update_workspace(user_id, tenant_id, {
        "active_primary_tab_id": tab_id
    })
    return {"status": "updated", "active_tab_id": tab_id}
