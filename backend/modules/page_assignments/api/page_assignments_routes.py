"""
Page Assignments Routes
API for configuring Lightning Page assignments for New/Detail views
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timezone
import uuid

from config.database import db
from modules.auth.api.auth_routes import get_current_user

router = APIRouter(tags=["Page Assignments"])


class RecordTypeOverride(BaseModel):
    """Page override for a specific record type"""
    record_type_id: str
    record_type_name: Optional[str] = None
    new_page_id: Optional[str] = None
    detail_page_id: Optional[str] = None


class PageAssignmentsUpdate(BaseModel):
    """Request body for updating page assignments"""
    default_new_page_id: Optional[str] = None
    default_detail_page_id: Optional[str] = None
    record_type_overrides: Optional[List[RecordTypeOverride]] = []


@router.get("/page-assignments/{object_name}")
async def get_page_assignments(
    object_name: str,
    current_user = Depends(get_current_user)
):
    """
    Get page assignments for an object.
    Returns:
    - has_assignments: boolean indicating if any assignments exist
    - default_new_page_id: Lightning page ID for New Record view
    - default_detail_page_id: Lightning page ID for Detail view
    - record_type_overrides: Array of record type-specific page assignments
    """
    # Get existing assignments
    assignments = await db.page_assignments.find_one({
        "object_name": object_name,
        "tenant_id": current_user.tenant_id
    }, {"_id": 0})
    
    if assignments:
        return {
            "has_assignments": True,
            "object_name": object_name,
            "default_new_page_id": assignments.get("default_new_page_id"),
            "default_detail_page_id": assignments.get("default_detail_page_id"),
            "record_type_overrides": assignments.get("record_type_overrides", []),
            "updated_at": assignments.get("updated_at")
        }
    
    # No assignments exist - return empty state
    return {
        "has_assignments": False,
        "object_name": object_name,
        "default_new_page_id": None,
        "default_detail_page_id": None,
        "record_type_overrides": []
    }


@router.put("/page-assignments/{object_name}")
async def save_page_assignments(
    object_name: str,
    data: PageAssignmentsUpdate,
    current_user = Depends(get_current_user)
):
    """
    Save page assignments for an object.
    Allows setting:
    - Default Lightning page for New Record view
    - Default Lightning page for Detail view
    - Record type-specific overrides
    
    VALIDATION:
    - New Page slot ONLY accepts layouts with page_type='new'
    - Detail Page slot ONLY accepts layouts with page_type='detail'
    """
    # Verify object exists
    obj = await db.tenant_objects.find_one({
        "tenant_id": current_user.tenant_id,
        "object_name": object_name
    })
    if not obj:
        raise HTTPException(status_code=404, detail=f"Object '{object_name}' not found")
    
    # Helper function to validate layout page_type
    async def validate_layout_type(layout_id: str, expected_type: str, slot_name: str):
        """Validate that a layout ID matches the expected page_type"""
        if not layout_id:
            return  # Empty is allowed
        
        layout = await db.lightning_page_layouts.find_one({
            "id": layout_id,
            "tenant_id": current_user.tenant_id
        }, {"_id": 0, "page_type": 1, "layout_name": 1})
        
        if not layout:
            raise HTTPException(
                status_code=400, 
                detail=f"Layout '{layout_id}' not found for {slot_name}"
            )
        
        actual_type = layout.get("page_type", "detail")  # Default to 'detail' for legacy layouts
        layout_name = layout.get("layout_name", "Unknown")
        
        if actual_type != expected_type:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid assignment: '{layout_name}' is a '{actual_type}' page, but {slot_name} requires a '{expected_type}' page. Please select a layout with page_type='{expected_type}'."
            )
    
    # Validate default assignments
    await validate_layout_type(data.default_new_page_id, "new", "Default New Page")
    await validate_layout_type(data.default_detail_page_id, "detail", "Default Detail Page")
    
    # Validate record type overrides
    if data.record_type_overrides:
        for override in data.record_type_overrides:
            rt_name = override.record_type_name or override.record_type_id
            await validate_layout_type(
                override.new_page_id, 
                "new", 
                f"Record Type '{rt_name}' New Page"
            )
            await validate_layout_type(
                override.detail_page_id, 
                "detail", 
                f"Record Type '{rt_name}' Detail Page"
            )
    
    # Prepare assignment document
    assignment_doc = {
        "object_name": object_name,
        "tenant_id": current_user.tenant_id,
        "default_new_page_id": data.default_new_page_id,
        "default_detail_page_id": data.default_detail_page_id,
        "record_type_overrides": [o.model_dump() for o in data.record_type_overrides] if data.record_type_overrides else [],
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "updated_by": current_user.id
    }
    
    # Upsert
    result = await db.page_assignments.update_one(
        {
            "object_name": object_name,
            "tenant_id": current_user.tenant_id
        },
        {"$set": assignment_doc},
        upsert=True
    )
    
    return {
        "success": True,
        "message": "Page assignments saved successfully",
        "has_assignments": True,
        **assignment_doc
    }


@router.get("/page-assignments/{object_name}/resolve")
async def resolve_page_assignment(
    object_name: str,
    context: str = Query(..., description="'new' or 'detail'"),
    record_type_id: Optional[str] = Query(None, description="Optional record type ID"),
    current_user = Depends(get_current_user)
):
    """
    Resolve which Lightning page to use at runtime.
    Resolution priority:
    1. Record Type override (if record_type_id provided and override exists)
    2. Global default for the context
    3. None (use system default)
    """
    # Get assignments
    assignments = await db.page_assignments.find_one({
        "object_name": object_name,
        "tenant_id": current_user.tenant_id
    }, {"_id": 0})
    
    if not assignments:
        return {
            "page_id": None,
            "resolution_source": "none"
        }
    
    resolved_page_id = None
    resolution_source = "none"
    
    # Step 1: Check Record Type override if provided
    if record_type_id and assignments.get("record_type_overrides"):
        for override in assignments["record_type_overrides"]:
            if override.get("record_type_id") == record_type_id:
                if context == "new" and override.get("new_page_id"):
                    resolved_page_id = override["new_page_id"]
                    resolution_source = "record_type_override"
                elif context == "detail" and override.get("detail_page_id"):
                    resolved_page_id = override["detail_page_id"]
                    resolution_source = "record_type_override"
                break
    
    # Step 2: Fall back to Global Default
    if not resolved_page_id:
        if context == "new" and assignments.get("default_new_page_id"):
            resolved_page_id = assignments["default_new_page_id"]
            resolution_source = "global_default"
        elif context == "detail" and assignments.get("default_detail_page_id"):
            resolved_page_id = assignments["default_detail_page_id"]
            resolution_source = "global_default"
    
    return {
        "page_id": resolved_page_id,
        "resolution_source": resolution_source
    }
