"""
Lookup Hover API Routes
Endpoints for managing per-lookup-field hover preview assignments
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import List, Dict
from pydantic import BaseModel, Field

from modules.lookup_hover.services.hover_service import LookupHoverService
from shared.auth import get_current_user

router = APIRouter(prefix="/lookup-hover-assignments", tags=["Lookup Hover Preview"])


class HoverAssignmentRequest(BaseModel):
    """Request to create/update a hover assignment"""
    related_object: str = Field(..., description="Object that the lookup points to")
    enabled: bool = True
    preview_fields: List[str] = Field(default_factory=list)
    primary_display_field: str = Field(default="name", description="Main field to display as link text")
    searchable_fields: List[str] = Field(default_factory=lambda: ["name"], description="Fields to include in search")
    show_recent_records: bool = Field(default=True, description="Show recently viewed records")
    enable_quick_create: bool = Field(default=False, description="Allow creating new records from dropdown")


class HoverAssignmentResponse(BaseModel):
    """Response for a hover assignment"""
    object_name: str
    field_name: str
    related_object: str
    enabled: bool
    preview_fields: List[str]
    primary_display_field: str = "name"
    searchable_fields: List[str] = []
    show_recent_records: bool = True
    enable_quick_create: bool = False
    created_at: str = None
    updated_at: str = None


class LookupFieldInfo(BaseModel):
    """Information about a lookup field"""
    field_name: str
    field_label: str
    related_object: str
    related_object_label: str
    has_hover_config: bool
    hover_enabled: bool
    is_required: bool = False
    is_searchable: bool = True
    is_custom: bool = False


class EnabledFieldsResponse(BaseModel):
    """Response with enabled lookup fields for an object"""
    object_name: str
    enabled_fields: Dict


# ============================================
# Admin Endpoints (for Object Manager)
# ============================================

@router.get("/object/{object_name}/lookup-fields", response_model=List[LookupFieldInfo])
async def get_lookup_fields_for_object(
    object_name: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Get all lookup fields for an object with their hover preview status
    Used by admin UI to show which lookup fields can be configured
    """
    # Handle both User object and dict
    if hasattr(current_user, 'tenant_id'):
        tenant_id = current_user.tenant_id
    else:
        tenant_id = current_user.get("tenant_id")
    
    fields = await LookupHoverService.get_lookup_fields_for_object(object_name, tenant_id)
    return fields


@router.get("/object/{object_name}/assignments", response_model=List[HoverAssignmentResponse])
async def get_hover_assignments_for_object(
    object_name: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Get all hover assignments for an object
    """
    assignments = await LookupHoverService.get_assignments_for_object(object_name)
    return assignments


@router.get("/object/{object_name}/field/{field_name}")
async def get_hover_assignment(
    object_name: str,
    field_name: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Get hover assignment for a specific lookup field
    """
    assignment = await LookupHoverService.get_assignment(object_name, field_name)
    if not assignment:
        return {"configured": False, "enabled": False}
    return {"configured": True, **assignment}


@router.put("/object/{object_name}/field/{field_name}")
async def upsert_hover_assignment(
    object_name: str,
    field_name: str,
    request: HoverAssignmentRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Create or update hover assignment for a lookup field
    """
    assignment = await LookupHoverService.upsert_assignment(
        object_name=object_name,
        field_name=field_name,
        related_object=request.related_object,
        enabled=request.enabled,
        preview_fields=request.preview_fields,
        primary_display_field=request.primary_display_field,
        searchable_fields=request.searchable_fields,
        show_recent_records=request.show_recent_records,
        enable_quick_create=request.enable_quick_create
    )
    return assignment


@router.delete("/object/{object_name}/field/{field_name}")
async def delete_hover_assignment(
    object_name: str,
    field_name: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Delete hover assignment for a lookup field
    This will disable hover preview for this field
    """
    deleted = await LookupHoverService.delete_assignment(object_name, field_name)
    if not deleted:
        raise HTTPException(status_code=404, detail="Assignment not found")
    return {"success": True, "message": f"Hover assignment deleted for {object_name}.{field_name}"}


# ============================================
# Runtime Endpoints (for record views)
# ============================================

@router.get("/object/{object_name}/enabled-fields")
async def get_enabled_lookup_fields(
    object_name: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Get all enabled lookup field hover configs for an object
    
    This is the key endpoint for frontend runtime use.
    Frontend calls this when loading a record view to know which
    lookup fields should show hover preview.
    
    Returns dict mapping field_name -> {related_object, preview_fields}
    Only includes fields where hover is explicitly enabled.
    """
    enabled_fields = await LookupHoverService.get_enabled_lookup_fields_for_object(object_name)
    return {
        "object_name": object_name,
        "enabled_fields": enabled_fields
    }


@router.get("/check/{object_name}/{field_name}")
async def check_hover_enabled(
    object_name: str,
    field_name: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Quick check if hover preview is enabled for a specific lookup field
    
    Returns False unless the field is explicitly configured with enabled=True
    This enforces the "no hover unless explicitly configured" requirement
    """
    enabled = await LookupHoverService.is_hover_enabled(object_name, field_name)
    return {"enabled": enabled}


# ============================================
# Global Endpoints
# ============================================

@router.get("/all")
async def get_all_hover_assignments(
    current_user: dict = Depends(get_current_user)
):
    """
    Get all hover assignments across all objects
    Useful for admin overview
    """
    assignments = await LookupHoverService.get_all_assignments()
    return {"assignments": assignments, "total": len(assignments)}
