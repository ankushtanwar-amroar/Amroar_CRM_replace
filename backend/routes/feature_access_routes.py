"""
Feature Access API Routes - Runtime License Enforcement
API endpoints for CRM feature access resolution.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional
import logging

from config.database import db
from shared.auth import get_current_user
from shared.services.feature_access_service import get_feature_access_service, FeatureAccessService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/feature-access", tags=["Feature Access"])


def get_access_service() -> FeatureAccessService:
    """Get feature access service instance"""
    return get_feature_access_service(db)


@router.get("/check/{module_key}")
async def check_module_access(
    module_key: str,
    current_user = Depends(get_current_user),
    service: FeatureAccessService = Depends(get_access_service)
):
    """
    Check if current user can access a specific module.
    
    Used by frontend to determine if a module should be accessible.
    
    Returns:
        {
            "allowed": true/false,
            "reason": "..." (if not allowed),
            "reason_code": "missing_license" / "missing_permission" / etc.
        }
    """
    result = await service.check_feature_access(
        user_id=current_user.id,
        tenant_id=current_user.tenant_id,
        module_key=module_key,
        log_blocked=True  # Log blocked access for auditing
    )
    
    return result.to_dict()


@router.get("/modules")
async def get_accessible_modules(
    current_user = Depends(get_current_user),
    service: FeatureAccessService = Depends(get_access_service)
):
    """
    Get all modules with their access status for the current user.
    
    Used by frontend navigation to determine which modules to show/hide.
    
    Returns:
        {
            "user_id": "...",
            "tenant_id": "...",
            "modules": {
                "flow_builder": {"allowed": true, "reason": null},
                "form_builder": {"allowed": false, "reason": "..."},
                ...
            }
        }
    """
    return await service.get_user_accessible_modules(
        user_id=current_user.id,
        tenant_id=current_user.tenant_id
    )


@router.get("/effective-access")
async def get_effective_access(
    current_user = Depends(get_current_user),
    service: FeatureAccessService = Depends(get_access_service)
):
    """
    Get detailed effective access summary for the current user.
    
    Shows each module with:
    - Final access result
    - Tenant version check status
    - Tenant license status
    - User license status
    - Permission status
    
    Used by the Effective Access UI to show comprehensive access details.
    
    Returns:
        Detailed access summary for all modules
    """
    return await service.get_effective_access_summary(
        user_id=current_user.id,
        tenant_id=current_user.tenant_id
    )


@router.get("/user/{user_id}/effective-access")
async def get_user_effective_access(
    user_id: str,
    current_user = Depends(get_current_user),
    service: FeatureAccessService = Depends(get_access_service)
):
    """
    Get detailed effective access summary for a specific user.
    
    Requires admin privileges to view other users' access.
    
    Returns:
        Detailed access summary for all modules
    """
    # Check if current user has permission to view other users
    is_admin = (
        getattr(current_user, 'is_super_admin', False) or 
        getattr(current_user, 'role_id', None) in ["admin", "system_administrator"]
    )
    
    # Allow viewing own access or if admin
    if current_user.id != user_id and not is_admin:
        raise HTTPException(status_code=403, detail="Not authorized to view other users' access")
    
    # Verify user belongs to same tenant
    user = await db.users.find_one(
        {"id": user_id, "tenant_id": current_user.tenant_id},
        {"_id": 0, "id": 1}
    )
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    return await service.get_effective_access_summary(
        user_id=user_id,
        tenant_id=current_user.tenant_id
    )


@router.post("/validate-action")
async def validate_feature_action(
    module_key: str = Query(..., description="Module key to validate"),
    action: Optional[str] = Query(None, description="Specific action within module"),
    current_user = Depends(get_current_user),
    service: FeatureAccessService = Depends(get_access_service)
):
    """
    Validate if current user can perform an action in a module.
    
    Called before performing actions to ensure access is allowed.
    Returns 403 if access denied.
    
    Args:
        module_key: Module to check (e.g., 'flow_builder')
        action: Optional specific action (e.g., 'create', 'delete')
    
    Returns:
        {"allowed": true} or raises 403
    """
    result = await service.check_feature_access(
        user_id=current_user.id,
        tenant_id=current_user.tenant_id,
        module_key=module_key,
        log_blocked=True
    )
    
    if not result.allowed:
        raise HTTPException(
            status_code=403,
            detail={
                "error": "feature_access_denied",
                "message": result.reason,
                "reason_code": result.reason_code,
                "module_key": module_key
            }
        )
    
    return {"allowed": True, "module_key": module_key, "action": action}
