from fastapi import APIRouter, Depends, HTTPException, Query
from motor.motor_asyncio import AsyncIOMotorDatabase, AsyncIOMotorClient
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import os
import sys

# Add backend directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))))

from modules.crm_platform.services.config_service import ConfigService

# Database setup
mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
mongo_client = AsyncIOMotorClient(mongo_url)
db_name = os.environ.get('DB_NAME', 'crm_db')
db = mongo_client[db_name]

router = APIRouter(prefix="/api/crm-platform/config", tags=["Configuration"])

class CreateConfigRequest(BaseModel):
    object_type_id: str
    tenant_id: str
    fields: List[Dict[str, Any]] = []
    highlighted_fields: List[str] = []
    standard_buttons: List[Dict[str, Any]] = []
    custom_buttons: List[Dict[str, Any]] = []
    record_types: List[Dict[str, Any]] = []
    validation_rules: List[Dict[str, Any]] = []
    enable_files: bool = True
    enable_timeline: bool = True
    enable_activities: bool = True

class AddFieldRequest(BaseModel):
    field_config: Dict[str, Any]

class AddValidationRuleRequest(BaseModel):
    rule: Dict[str, Any]

@router.post("")
async def create_or_update_config(
    request: CreateConfigRequest
):
    """Create or update object configuration"""
    service = ConfigService(db)
    config = await service.create_or_update_config(request.dict())
    return config

@router.get("")
async def get_config(
    object_type_id: str = Query(...),
    tenant_id: str = Query(...)
):
    """Get object configuration"""
    service = ConfigService(db)
    config = await service.get_config(object_type_id, tenant_id)
    
    if not config:
        # Return default config
        return {
            "object_type_id": object_type_id,
            "tenant_id": tenant_id,
            "fields": [],
            "highlighted_fields": [],
            "standard_buttons": [],
            "custom_buttons": [],
            "record_types": [],
            "validation_rules": [],
            "enable_files": True,
            "enable_timeline": True,
            "enable_activities": True
        }
    
    return config

@router.post("/field")
async def add_field(
    request: AddFieldRequest,
    object_type_id: str = Query(...),
    tenant_id: str = Query(...)
):
    """Add a field configuration"""
    service = ConfigService(db)
    success = await service.add_field_config(
        object_type_id, tenant_id, request.field_config
    )
    
    if not success:
        raise HTTPException(status_code=400, detail="Failed to add field")
    
    return {"status": "field_added"}

@router.post("/validation-rule")
async def add_validation_rule(
    request: AddValidationRuleRequest,
    object_type_id: str = Query(...),
    tenant_id: str = Query(...)
):
    """Add a validation rule"""
    service = ConfigService(db)
    success = await service.add_validation_rule(
        object_type_id, tenant_id, request.rule
    )
    
    if not success:
        raise HTTPException(status_code=400, detail="Failed to add validation rule")
    
    return {"status": "rule_added"}
