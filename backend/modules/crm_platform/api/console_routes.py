from fastapi import APIRouter, Query, HTTPException
from motor.motor_asyncio import AsyncIOMotorClient
from typing import Optional, Dict, Any
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))))

from modules.crm_platform.services.console_adapter_service import ConsoleAdapterService

# Database setup
mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
mongo_client = AsyncIOMotorClient(mongo_url)
db_name = os.environ.get('DB_NAME', 'crm_db')
db = mongo_client[db_name]

router = APIRouter(prefix="/api/console", tags=["Console"])

@router.get("/objects")
async def get_console_objects(tenant_id: str = Query(...)):
    """Get all available objects for console"""
    service = ConsoleAdapterService(db)
    objects = await service.get_all_objects(tenant_id)
    return {"objects": objects}

@router.get("/list-view/{object_api_name}")
async def get_console_list_view(
    object_api_name: str,
    tenant_id: str = Query(...),
    limit: int = Query(50, le=100),
    skip: int = Query(0, ge=0),
    search: Optional[str] = Query(None),
    sort_by: Optional[str] = Query(None),
    sort_order: Optional[str] = Query("asc")
):
    """
    Universal dynamic list view for ANY CRM object.
    Works with: lead, account, contact, opportunity, task, event, etc.
    """
    service = ConsoleAdapterService(db)
    
    result = await service.get_console_list_view(
        object_api_name=object_api_name,
        tenant_id=tenant_id,
        limit=limit,
        skip=skip,
        search=search
    )
    
    if result.get("error"):
        raise HTTPException(status_code=404, detail=result["error"])
    
    return result

@router.get("/record/{public_id}")
async def get_console_record(
    public_id: str,
    tenant_id: str = Query(...)
):
    """
    Universal dynamic record fetcher by public ID.
    Examples: LEA-abc123, ACC-xyz789, OPP-def456
    """
    service = ConsoleAdapterService(db)
    
    record = await service.get_console_record(public_id, tenant_id)
    
    if not record:
        raise HTTPException(
            status_code=404, 
            detail=f"Record not found: {public_id}"
        )
    
    return record

@router.get("/object-metadata/{object_api_name}")
async def get_object_metadata(object_api_name: str):
    """Get metadata for a specific object"""
    service = ConsoleAdapterService(db)
    metadata = service.get_object_metadata(object_api_name)
    
    if not metadata:
        raise HTTPException(
            status_code=404,
            detail=f"Object metadata not found: {object_api_name}"
        )
    
    return metadata
