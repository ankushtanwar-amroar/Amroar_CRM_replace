from fastapi import APIRouter, Depends, HTTPException
from typing import Dict, Any, Optional, List
from motor.motor_asyncio import AsyncIOMotorDatabase
import os
import sys
import logging

logger = logging.getLogger(__name__)

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))))

from shared.auth import get_current_user_dict
from shared.database import db

from ..services.lightning_layout_service import LightningLayoutService

router = APIRouter(prefix="/api/lightning", tags=["Lightning Page Builder"])

async def get_db() -> AsyncIOMotorDatabase:
    """Dependency to get database connection"""
    return db

@router.post("/layouts")
async def create_layout(
    layout_data: Dict[str, Any],
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: Dict = Depends(get_current_user_dict)
):
    """Create a new Lightning page layout"""
    service = LightningLayoutService(db)
    
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant ID required")
    
    object_name = layout_data.get("object_name")
    if not object_name:
        raise HTTPException(status_code=400, detail="Object name required")
    
    layout = await service.create_layout(
        tenant_id=tenant_id,
        object_name=object_name,
        layout_data=layout_data,
        user_id=current_user["user_id"]
    )
    
    return {"layout": layout, "message": "Layout created successfully"}

@router.get("/layouts/{object_name}")
async def get_layouts_for_object(
    object_name: str,
    page_type: Optional[str] = None,  # Filter by "detail" or "new"
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: Dict = Depends(get_current_user_dict)
):
    """Get ALL Lightning layouts for a specific object (multi-page support)
    
    Auto-generates default layouts for custom objects if none exist.
    This ensures backward compatibility with objects created before the
    auto-layout feature was implemented.
    """
    service = LightningLayoutService(db)
    
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant ID required")
    
    user_id = current_user.get("user_id", "system")
    
    # Return all layouts for this object (not just active one)
    layouts = await service.get_all_layouts_for_object(tenant_id, object_name)
    
    # If no layouts exist, check if this is a custom object and auto-generate layouts
    if not layouts:
        layouts = await _auto_generate_layouts_if_needed(db, tenant_id, object_name, user_id, service)
    
    # Filter by page_type if specified
    if page_type:
        layouts = [layout for layout in layouts if layout.get("page_type", "detail") == page_type]
    
    # For backward compatibility, also return single layout if only one exists
    if len(layouts) == 1:
        return {"layout": layouts[0], "has_custom_layout": True, "all_layouts": layouts, "layouts": layouts}
    
    return {"layouts": layouts, "has_custom_layout": len(layouts) > 0}


async def _auto_generate_layouts_if_needed(
    db: AsyncIOMotorDatabase,
    tenant_id: str,
    object_name: str,
    user_id: str,
    service: LightningLayoutService
) -> List[Dict]:
    """Auto-generate default layouts for custom objects that don't have any.
    
    This ensures backward compatibility with objects created before the
    automatic layout generation feature was added.
    """
    import uuid
    from datetime import datetime, timezone
    
    # Check if this is a custom object
    schema_object = await db.schema_objects.find_one({
        "tenant_id": tenant_id,
        "api_name": object_name,
        "is_custom": True
    }, {"_id": 0})
    
    if not schema_object:
        # Not a custom object - don't auto-generate
        return []
    
    logger.info(f"Auto-generating default layouts for custom object: {object_name}")
    
    object_id = schema_object.get("id")
    object_label = schema_object.get("label", object_name)
    
    # Get all fields for this object
    system_fields = {"id", "created_at", "updated_at", "created_by", "updated_by", "is_deleted"}
    fields = await db.schema_fields.find({
        "tenant_id": tenant_id,
        "object_id": object_id,
        "is_active": True
    }, {"_id": 0}).sort("sort_order", 1).to_list(None)
    
    # Filter out system fields and build field items
    user_fields = [f for f in fields if f.get("api_name", "").lower() not in system_fields]
    
    # Build field items for Record Detail component
    field_items = []
    for field in user_fields:
        field_items.append({
            "id": f"field-{field['api_name']}-{len(field_items)}",
            "type": "field",
            "key": field["api_name"],
            "label": field.get("label", field["api_name"])
        })
    
    # If no custom fields yet, add a placeholder
    if not field_items:
        field_items = [
            {"id": "field-name-0", "type": "field", "key": "name", "label": "Name"}
        ]
    
    # Create Record Detail section
    record_detail_section = {
        "id": f"section-{object_name}-info",
        "type": "field_section",
        "label": f"{object_label} Information",
        "collapsed": False,
        "fields": field_items
    }
    
    now = datetime.now(timezone.utc)
    layouts_collection = db.lightning_page_layouts
    
    # Create Detail Layout
    detail_layout_id = str(uuid.uuid4())
    detail_layout = {
        "id": detail_layout_id,
        "tenant_id": tenant_id,
        "object_name": object_name,
        "layout_name": f"{object_label} Record Page",
        "api_name": f"{object_label.replace(' ', '_')}_Record_Page",
        "description": f"Default record detail layout for {object_label}",
        "page_type": "detail",
        "is_system": False,
        "is_default": True,
        "is_active": True,
        "selected_layout": "header_left_main",
        "template_type": "header_left_main",
        "placed_components": {
            "header": [],
            "left": [],
            "main": [{
                "id": "record_detail",
                "instanceId": f"record_detail-{detail_layout_id[:8]}",
                "name": "Record Detail",
                "regionId": "main",
                "config": {
                    "items": [record_detail_section]
                }
            }],
            "right": []
        },
        "sections": [{
            "name": f"{object_label} Information",
            "columns": 2,
            "fields": [f["key"] for f in field_items]
        }],
        "created_at": now,
        "updated_at": now,
        "created_by": user_id
    }
    
    # Create New Record Layout
    new_layout_id = str(uuid.uuid4())
    new_layout = {
        "id": new_layout_id,
        "tenant_id": tenant_id,
        "object_name": object_name,
        "layout_name": f"{object_label} New Record",
        "api_name": f"{object_label.replace(' ', '_')}_New_Record",
        "description": f"Default new record layout for {object_label}",
        "page_type": "new",
        "is_system": False,
        "is_default": True,
        "is_active": True,
        "selected_layout": "single_column",
        "template_type": "form",
        "placed_components": {
            "header": [],
            "left": [],
            "main": [{
                "id": "record_detail",
                "instanceId": f"record_detail-new-{new_layout_id[:8]}",
                "name": "Record Detail",
                "regionId": "main",
                "config": {
                    "items": [record_detail_section]
                }
            }],
            "right": []
        },
        "sections": [{
            "name": f"{object_label} Information",
            "columns": 2,
            "fields": [f["key"] for f in field_items]
        }],
        "required_fields": [],
        "default_values": {},
        "created_at": now,
        "updated_at": now,
        "created_by": user_id
    }
    
    # Insert layouts
    await layouts_collection.insert_many([detail_layout, new_layout])
    logger.info(f"Auto-generated default layouts for custom object: {object_name}")
    
    # Convert datetime objects to ISO strings for JSON serialization
    def serialize_layout(layout):
        serialized = {}
        for key, value in layout.items():
            if hasattr(value, 'isoformat'):  # datetime objects
                serialized[key] = value.isoformat()
            else:
                serialized[key] = value
        return serialized
    
    # Return the generated layouts (serialized for JSON response)
    return [serialize_layout(detail_layout), serialize_layout(new_layout)]

@router.get("/layouts/{object_name}/{layout_id}")
async def get_layout_by_id(
    object_name: str,
    layout_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: Dict = Depends(get_current_user_dict)
):
    """Get a specific Lightning layout by ID"""
    service = LightningLayoutService(db)
    
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant ID required")
    
    layout = await service.get_layout_by_id(tenant_id, layout_id)
    
    if not layout:
        raise HTTPException(status_code=404, detail="Layout not found")
    
    return {"layout": layout}

@router.put("/layouts/{layout_id}")
async def update_layout(
    layout_id: str,
    update_data: Dict[str, Any],
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: Dict = Depends(get_current_user_dict)
):
    """Update an existing Lightning layout"""
    service = LightningLayoutService(db)
    
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant ID required")
    
    layout = await service.update_layout(
        tenant_id=tenant_id,
        layout_id=layout_id,
        update_data=update_data,
        user_id=current_user["user_id"]
    )
    
    if not layout:
        raise HTTPException(status_code=404, detail="Layout not found")
    
    return {"layout": layout, "message": "Layout updated successfully"}

@router.delete("/layouts/{layout_id}")
async def delete_layout(
    layout_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: Dict = Depends(get_current_user_dict)
):
    """Delete a Lightning layout"""
    service = LightningLayoutService(db)
    
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant ID required")
    
    deleted = await service.delete_layout(tenant_id, layout_id)
    
    if not deleted:
        raise HTTPException(status_code=404, detail="Layout not found")
    
    return {"message": "Layout deleted successfully"}

@router.get("/layouts")
async def list_layouts(
    object_name: Optional[str] = None,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: Dict = Depends(get_current_user_dict)
):
    """List all Lightning layouts for the tenant"""
    service = LightningLayoutService(db)
    
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant ID required")
    
    layouts = await service.list_layouts(tenant_id, object_name)
    
    return {"layouts": layouts, "count": len(layouts)}

@router.get("/templates/{template_type}")
async def get_template(
    template_type: str,
    object_name: str,
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """Get a default layout template"""
    service = LightningLayoutService(db)
    
    template = await service.get_default_layout_template(object_name, template_type)
    
    return {"template": template}


# ============================================
# Phase 2B: Layout Resolution Endpoints
# ============================================

@router.get("/resolve/{object_name}")
async def resolve_layout(
    object_name: str,
    page_type: str = "detail",  # "detail" or "new"
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: Dict = Depends(get_current_user_dict)
):
    """
    Resolve the appropriate layout for an object and page type.
    
    This endpoint implements the resolution order:
    1. Custom tenant layout
    2. System default layout
    3. Default template (for Lead/Opportunity)
    4. Legacy fallback
    
    Always returns a layout - never fails.
    """
    service = LightningLayoutService(db)
    
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant ID required")
    
    if page_type not in ["detail", "new"]:
        raise HTTPException(status_code=400, detail="page_type must be 'detail' or 'new'")
    
    result = await service.resolve_layout(tenant_id, object_name, page_type)
    
    return result


@router.post("/layouts/seed")
async def seed_system_layouts(
    object_names: List[str] = None,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: Dict = Depends(get_current_user_dict)
):
    """
    Seed system default layouts for Lead and Opportunity.
    Only creates layouts that don't already exist.
    """
    service = LightningLayoutService(db)
    
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant ID required")
    
    results = await service.seed_system_layouts(
        tenant_id=tenant_id,
        object_names=object_names,
        user_id=current_user.get("user_id")
    )
    
    return {
        "message": "System layouts seeded successfully",
        "created": results
    }
