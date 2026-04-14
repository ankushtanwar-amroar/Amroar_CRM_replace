"""
User License Routes - CRM Side
API for assigning/revoking user licenses (seat consumption)
This is part of the CRM data plane, not the Admin Portal control plane.
"""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from typing import Optional
import logging

from config.database import db
from modules.admin.services.tenant_license_service import get_tenant_license_service, TenantLicenseService
from shared.auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/user-licenses", tags=["User Licenses"])


def get_license_service() -> TenantLicenseService:
    return get_tenant_license_service(db)


@router.get("")
async def get_my_licenses(
    current_user = Depends(get_current_user),
    service: TenantLicenseService = Depends(get_license_service)
):
    """
    Get all licenses assigned to the current user
    """
    return await service.get_user_licenses(
        user_id=current_user.id,
        tenant_id=current_user.tenant_id
    )


@router.get("/available")
async def get_available_licenses(
    current_user = Depends(get_current_user),
    service: TenantLicenseService = Depends(get_license_service)
):
    """
    Get all licenses available for assignment in the tenant
    Shows seat availability for each license
    """
    tenant_licenses = await service.get_tenant_licenses(
        tenant_id=current_user.tenant_id,
        active_only=True
    )
    
    # Get user's current licenses
    user_licenses = await service.get_user_licenses(
        user_id=current_user.id,
        tenant_id=current_user.tenant_id
    )
    user_license_ids = {ul["license_id"] for ul in user_licenses}
    
    # Enrich with user's assignment status
    for lic in tenant_licenses:
        lic["user_has_license"] = lic["license_id"] in user_license_ids
    
    return tenant_licenses


@router.get("/user/{user_id}")
async def get_user_licenses(
    user_id: str,
    current_user = Depends(get_current_user),
    service: TenantLicenseService = Depends(get_license_service)
):
    """
    Get all licenses assigned to a specific user
    Requires admin role in tenant or viewing own licenses
    """
    # Check if current user has permission to view other users' licenses
    is_admin = (
        getattr(current_user, 'is_super_admin', False) or 
        getattr(current_user, 'role_id', None) in ["admin", "manager", "system_administrator"]
    )
    if current_user.id != user_id and not is_admin:
        raise HTTPException(status_code=403, detail="Not authorized to view other users' licenses")
    
    # Verify user belongs to same tenant
    user = await db.users.find_one({"id": user_id, "tenant_id": current_user.tenant_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    return await service.get_user_licenses(
        user_id=user_id,
        tenant_id=current_user.tenant_id
    )


@router.post("/user/{user_id}/assign")
async def assign_license_to_user(
    user_id: str,
    license_id: str = Query(..., description="License catalog ID to assign"),
    current_user = Depends(get_current_user),
    service: TenantLicenseService = Depends(get_license_service)
):
    """
    Assign a license to a user (consumes a seat)
    Requires admin role in tenant or super admin
    """
    # Check admin permission - allow super admins or system administrators
    is_admin = (
        getattr(current_user, 'is_super_admin', False) or 
        getattr(current_user, 'role_id', None) in ["admin", "system_administrator"]
    )
    if not is_admin:
        raise HTTPException(status_code=403, detail="Only admins can assign licenses")
    
    # Verify user belongs to same tenant
    user = await db.users.find_one({"id": user_id, "tenant_id": current_user.tenant_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Verify user is active
    if not user.get("is_active", True):
        raise HTTPException(status_code=400, detail="Cannot assign license to inactive user")
    
    try:
        return await service.assign_user_license(
            user_id=user_id,
            tenant_id=current_user.tenant_id,
            license_id=license_id,
            assigned_by=current_user.id,
            actor_email=getattr(current_user, 'email', None)
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/user/{user_id}/revoke/{user_license_id}")
async def revoke_user_license(
    user_id: str,
    user_license_id: str,
    current_user = Depends(get_current_user),
    service: TenantLicenseService = Depends(get_license_service)
):
    """
    Revoke a license from a user (frees a seat)
    Requires admin role in tenant or super admin
    """
    # Check admin permission - allow super admins or system administrators
    is_admin = (
        getattr(current_user, 'is_super_admin', False) or 
        getattr(current_user, 'role_id', None) in ["admin", "system_administrator"]
    )
    if not is_admin:
        raise HTTPException(status_code=403, detail="Only admins can revoke licenses")
    
    try:
        result = await service.revoke_user_license(
            user_license_id=user_license_id,
            revoked_by=current_user.id,
            actor_email=getattr(current_user, 'email', None)
        )
        if not result:
            raise HTTPException(status_code=404, detail="User license not found")
        return {"success": True, "message": "License revoked"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/check/{license_code}")
async def check_user_has_license(
    license_code: str,
    current_user = Depends(get_current_user),
    service: TenantLicenseService = Depends(get_license_service)
):
    """
    Check if the current user has a specific license
    Used by frontend to determine feature access
    """
    has_license = await service.user_has_license(
        user_id=current_user.id,
        tenant_id=current_user.tenant_id,
        license_code=license_code
    )
    
    return {
        "license_code": license_code,
        "has_license": has_license
    }


@router.get("/check-seat-availability")
async def check_seat_availability(
    license_id: str = Query(..., description="License catalog ID"),
    current_user = Depends(get_current_user),
    service: TenantLicenseService = Depends(get_license_service)
):
    """
    Check if a seat is available for a license
    """
    return await service.check_seat_availability(
        tenant_id=current_user.tenant_id,
        license_id=license_id
    )
