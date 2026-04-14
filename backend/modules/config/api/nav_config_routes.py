"""
Navigation Config Routes
Extracted from server.py as part of Step 5 refactoring.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import List, Dict, Any
from datetime import datetime, timezone

from config.database import db
from modules.auth.api.auth_routes import get_current_user
from shared.constants import DEFAULT_NAV_ORDER, LOCKED_OBJECTS

router = APIRouter()


class NavConfigItem(BaseModel):
    object_name: str
    visible: bool = True
    order: int
    is_locked: bool = False


class NavConfig(BaseModel):
    user_id: str
    tenant_id: str
    items: List[NavConfigItem]
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


@router.get("/nav-config")
async def get_nav_config(current_user = Depends(get_current_user)):
    """
    Get user's navigation configuration (object order and visibility).
    If no config exists, returns default configuration based on available objects.
    """
    try:
        # Try to get existing config
        existing_config = await db.nav_config.find_one({
            "user_id": current_user.id,
            "tenant_id": current_user.tenant_id
        }, {"_id": 0})
        
        if existing_config:
            return existing_config
        
        # No config exists, generate default from available objects
        objects = await db.tenant_objects.find({
            "tenant_id": current_user.tenant_id
        }, {"_id": 0}).to_list(None)
        
        # Sort objects: core objects first (in DEFAULT_NAV_ORDER), then others alphabetically
        def get_sort_key(obj):
            obj_name = obj["object_name"]
            if obj_name in DEFAULT_NAV_ORDER:
                return (0, DEFAULT_NAV_ORDER.index(obj_name))
            return (1, obj_name.lower())
        
        sorted_objects = sorted(objects, key=get_sort_key)
        
        # Create default config
        items = []
        for idx, obj in enumerate(sorted_objects):
            obj_name = obj["object_name"]
            items.append({
                "object_name": obj_name,
                "visible": True,
                "order": idx,
                "is_locked": obj_name in LOCKED_OBJECTS
            })
        
        default_config = {
            "user_id": current_user.id,
            "tenant_id": current_user.tenant_id,
            "items": items,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        
        return default_config
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching nav config: {str(e)}")


@router.put("/nav-config")
async def update_nav_config(
    config: Dict[str, Any],
    current_user = Depends(get_current_user)
):
    """
    Save user's navigation configuration (object order and visibility).
    """
    try:
        # Prepare config document
        nav_config = {
            "user_id": current_user.id,
            "tenant_id": current_user.tenant_id,
            "items": config.get("items", []),
            "updated_at": datetime.now(timezone.utc)
        }
        
        # Upsert (update or insert)
        result = await db.nav_config.update_one(
            {
                "user_id": current_user.id,
                "tenant_id": current_user.tenant_id
            },
            {"$set": nav_config},
            upsert=True
        )
        
        return {"success": True, "message": "Navigation configuration saved"}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error saving nav config: {str(e)}")


@router.post("/nav-config/reset")
async def reset_nav_config(current_user = Depends(get_current_user)):
    """
    Reset user's navigation configuration to default (based on available objects).
    """
    try:
        # Delete existing config
        await db.nav_config.delete_one({
            "user_id": current_user.id,
            "tenant_id": current_user.tenant_id
        })
        
        # Generate default config (same logic as get_nav_config)
        objects = await db.tenant_objects.find({
            "tenant_id": current_user.tenant_id
        }, {"_id": 0}).to_list(None)
        
        # Sort objects: core objects first (in DEFAULT_NAV_ORDER), then others alphabetically
        def get_sort_key(obj):
            obj_name = obj["object_name"]
            if obj_name in DEFAULT_NAV_ORDER:
                return (0, DEFAULT_NAV_ORDER.index(obj_name))
            return (1, obj_name.lower())
        
        sorted_objects = sorted(objects, key=get_sort_key)
        
        items = []
        for idx, obj in enumerate(sorted_objects):
            obj_name = obj["object_name"]
            items.append({
                "object_name": obj_name,
                "visible": True,
                "order": idx,
                "is_locked": obj_name in LOCKED_OBJECTS
            })
        
        return {
            "message": "Navigation reset to default",
            "items": items
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error resetting nav config: {str(e)}")
