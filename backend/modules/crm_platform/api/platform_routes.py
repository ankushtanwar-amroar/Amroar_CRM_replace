from fastapi import APIRouter, Depends, HTTPException, Query
from motor.motor_asyncio import AsyncIOMotorDatabase, AsyncIOMotorClient
from typing import List, Dict, Any, Optional
from pydantic import BaseModel
import os
import sys

# Add backend directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))))

from modules.crm_platform.services.object_registry_service import ObjectRegistryService
from modules.crm_platform.middleware.object_adapter import ObjectAdapter

# Database setup
mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
mongo_client = AsyncIOMotorClient(mongo_url)
db_name = os.environ.get('DB_NAME', 'crm_db')
db = mongo_client[db_name]

router = APIRouter(prefix="/api/crm-platform", tags=["CRM Platform"])

class InitializeRequest(BaseModel):
    tenant_id: str

class CreateGlobalIDRequest(BaseModel):
    object_type: str
    legacy_id: Optional[str] = None
    tenant_id: str

@router.post("/initialize")
async def initialize_platform(request: InitializeRequest):
    """Initialize CRM Platform for a tenant"""
    registry = ObjectRegistryService(db)
    await registry.initialize_default_objects(request.tenant_id)
    return {"status": "initialized", "tenant_id": request.tenant_id}

@router.get("/object-types")
async def list_object_types(tenant_id: str = Query(...)):
    """List all object types"""
    registry = ObjectRegistryService(db)
    object_types = await registry.list_object_types(tenant_id)
    return {"object_types": object_types}

@router.get("/object-types/{object_type_id}")
async def get_object_type(object_type_id: str, tenant_id: str = Query(...)):
    """Get specific object type"""
    registry = ObjectRegistryService(db)
    obj_type = await registry.get_object_type(object_type_id, tenant_id)
    if not obj_type:
        raise HTTPException(status_code=404, detail="Object type not found")
    return obj_type

@router.post("/global-id")
async def create_global_id(request: CreateGlobalIDRequest):
    """Create a global ID for a record"""
    registry = ObjectRegistryService(db)
    result = await registry.create_global_id(
        request.object_type,
        request.legacy_id,
        request.tenant_id
    )
    return result

@router.get("/resolve/{public_id}")
async def resolve_public_id(public_id: str, tenant_id: str = Query(...)):
    """Resolve public ID to record"""
    adapter = ObjectAdapter(db, tenant_id)
    record = await adapter.get_record_by_public_id(public_id)
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")
    return record

@router.get("/records/{object_type}")
async def list_records(object_type: str, 
                      tenant_id: str = Query(...),
                      limit: int = Query(50, le=100),
                      skip: int = Query(0, ge=0)):
    """List records for an object type"""
    adapter = ObjectAdapter(db, tenant_id)
    records = await adapter.list_records(object_type, limit=limit, skip=skip)
    total = await adapter.count_records(object_type)
    return {
        "records": records,
        "total": total,
        "limit": limit,
        "skip": skip
    }

@router.get("/records/{object_type}/{record_id}")
async def get_record(object_type: str, record_id: str,
                    tenant_id: str = Query(...)):
    """Get specific record"""
    adapter = ObjectAdapter(db, tenant_id)
    record = await adapter.get_record(object_type, record_id)
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")
    return record
