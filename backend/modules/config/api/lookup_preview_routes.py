"""
Lookup Preview Config Routes
Extracted from server.py as part of Step 5 refactoring.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

from config.database import db
from modules.auth.api.auth_routes import get_current_user

router = APIRouter()


class LookupPreviewConfigRequest(BaseModel):
    enabled: bool = True
    preview_fields: List[str]
    field_order: Optional[List[str]] = None  # Optional: order of fields


@router.get("/lookup-preview-config/{object_name}")
async def get_lookup_preview_config(
    object_name: str,
    current_user = Depends(get_current_user)
):
    """Get lookup preview field configuration for an object"""

    config = await db.lookup_preview_configs.find_one({
        "tenant_id": current_user.tenant_id,
        "object_name": object_name
    }, {"_id": 0})
    
    if config:
        return config
    
    # Return default configuration if none exists
    return {
        "object_name": object_name,
        "tenant_id": current_user.tenant_id,
        "enabled": True,
        "preview_fields": [],  # Empty means use default/hardcoded fields
        "field_order": []
    }


@router.put("/lookup-preview-config/{object_name}")
async def save_lookup_preview_config(
    object_name: str,
    config: LookupPreviewConfigRequest,
    current_user = Depends(get_current_user)
):
    """Save lookup preview field configuration for an object"""

    # Only allow admins to change this configuration
    # For now, allow all authenticated users for testing
    
    config_data = {
        "tenant_id": current_user.tenant_id,
        "object_name": object_name,
        "enabled": config.enabled,
        "preview_fields": config.preview_fields,
        "field_order": config.field_order or config.preview_fields,
        "updated_by": current_user.id,
        "updated_at": datetime.utcnow().isoformat()
    }
    
    result = await db.lookup_preview_configs.update_one(
        {
            "tenant_id": current_user.tenant_id,
            "object_name": object_name
        },
        {"$set": config_data},
        upsert=True
    )
    
    return {
        "success": True,
        "message": "Lookup preview configuration saved",
        "config": config_data
    }


@router.get("/lookup-preview-configs")
async def get_all_lookup_preview_configs(
    current_user = Depends(get_current_user)
):
    """Get all lookup preview configurations for the tenant"""

    configs = await db.lookup_preview_configs.find(
        {"tenant_id": current_user.tenant_id},
        {"_id": 0}
    ).to_list(None)
    
    return {"configs": configs}
