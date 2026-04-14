"""
User Permission Sets API Routes
Manages direct assignment of permission sets to users.
Part of Salesforce-style security architecture refactoring.

This module enables:
- Assigning permission sets directly to users (independent of roles)
- Listing user's permission set assignments
- Revoking permission set assignments
- Creating custom permission sets
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone
from pydantic import BaseModel, Field
import uuid
import logging

from config.database import db
from shared.models import User, PermissionSet, UserPermissionSetAssignment, ObjectPermission
from modules.auth.api.auth_routes import get_current_user
from modules.users.services import log_audit_event
from modules.users.services.permission_cache import (
    invalidate_user_permission_cache,
    invalidate_permission_set_cache,
    get_cache_stats
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Permission Sets"])


# ========================================
# REQUEST/RESPONSE MODELS
# ========================================

class CreatePermissionSetRequest(BaseModel):
    """Request model for creating a new permission set"""
    name: str
    api_name: Optional[str] = None
    description: Optional[str] = None
    permissions: List[Dict[str, Any]]  # List of ObjectPermission dicts
    system_permissions: Optional[Dict[str, bool]] = None
    field_permissions: Optional[Dict[str, List[Dict[str, Any]]]] = None  # FLS: {object_name: [{field_name, hidden, editable}]}


class UpdatePermissionSetRequest(BaseModel):
    """Request model for updating a permission set"""
    name: Optional[str] = None
    description: Optional[str] = None
    permissions: Optional[List[Dict[str, Any]]] = None
    system_permissions: Optional[Dict[str, bool]] = None
    field_permissions: Optional[Dict[str, List[Dict[str, Any]]]] = None  # FLS: {object_name: [{field_name, hidden, editable}]}


class AssignPermissionSetRequest(BaseModel):
    """Request model for assigning a permission set to a user"""
    permission_set_id: str


class PermissionSetResponse(BaseModel):
    """Response model for permission set"""
    id: str
    name: str
    api_name: Optional[str] = None
    description: Optional[str] = None
    permissions: List[Dict[str, Any]]
    system_permissions: Optional[Dict[str, bool]] = None
    is_custom: bool = False
    is_system_permission_set: bool = False
    tenant_id: Optional[str] = None
    created_at: Optional[datetime] = None
    created_by: Optional[str] = None
    # Legacy fields for backward compatibility
    role_id: Optional[str] = None
    role_name: Optional[str] = None


class UserPermissionSetResponse(BaseModel):
    """Response model for user permission set assignment"""
    id: str
    user_id: str
    permission_set_id: str
    permission_set_name: str
    assigned_at: datetime
    assigned_by: Optional[str] = None
    source: str = "direct"  # "direct" | "bundle" | "role"


# ========================================
# PERMISSION SET CRUD ROUTES
# ========================================

@router.get("/permission-sets")
async def list_permission_sets(
    include_system: bool = True,
    current_user: User = Depends(get_current_user)
):
    """
    List all permission sets available in the tenant.
    Includes both system (role-based) and custom permission sets.
    """
    try:
        query = {}
        
        # Include tenant-specific custom permission sets
        tenant_query = {"tenant_id": current_user.tenant_id}
        
        # Include system permission sets (no tenant_id or matching tenant)
        if include_system:
            query = {
                "$or": [
                    tenant_query,
                    {"tenant_id": None},
                    {"tenant_id": {"$exists": False}}
                ]
            }
        else:
            query = tenant_query
        
        permission_sets = await db.permission_sets.find(
            query,
            {"_id": 0}
        ).to_list(None)
        
        # Transform for response
        result = []
        for ps in permission_sets:
            result.append({
                "id": ps.get("id"),
                "name": ps.get("name") or ps.get("role_name", "Unnamed"),
                "api_name": ps.get("api_name"),
                "description": ps.get("description"),
                "permissions": ps.get("permissions", []),
                "system_permissions": ps.get("system_permissions"),
                "field_permissions": ps.get("field_permissions", {}),  # FLS
                "is_custom": ps.get("is_custom", False),
                "is_system_permission_set": ps.get("is_system_permission_set", False),
                "role_id": ps.get("role_id"),  # Legacy
                "role_name": ps.get("role_name"),  # Legacy
                "tenant_id": ps.get("tenant_id"),
                "created_at": ps.get("created_at"),
                "created_by": ps.get("created_by")
            })
        
        return result
        
    except Exception as e:
        logger.error(f"Error listing permission sets: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to list permission sets")


@router.get("/permission-sets/{permission_set_id}")
async def get_permission_set(
    permission_set_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get a specific permission set by ID."""
    try:
        ps = await db.permission_sets.find_one(
            {"id": permission_set_id},
            {"_id": 0}
        )
        
        if not ps:
            raise HTTPException(status_code=404, detail="Permission set not found")
        
        # Check access (system permission sets are visible to all, custom only to tenant)
        if ps.get("tenant_id") and ps.get("tenant_id") != current_user.tenant_id:
            raise HTTPException(status_code=404, detail="Permission set not found")
        
        return {
            "id": ps.get("id"),
            "name": ps.get("name") or ps.get("role_name", "Unnamed"),
            "api_name": ps.get("api_name"),
            "description": ps.get("description"),
            "permissions": ps.get("permissions", []),
            "system_permissions": ps.get("system_permissions"),
            "field_permissions": ps.get("field_permissions", {}),  # FLS
            "is_custom": ps.get("is_custom", False),
            "is_system_permission_set": ps.get("is_system_permission_set", False),
            "role_id": ps.get("role_id"),
            "role_name": ps.get("role_name"),
            "tenant_id": ps.get("tenant_id"),
            "created_at": ps.get("created_at"),
            "created_by": ps.get("created_by")
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting permission set: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to get permission set")


@router.post("/permission-sets")
async def create_permission_set(
    request: CreatePermissionSetRequest,
    current_user: User = Depends(get_current_user)
):
    """
    Create a new custom permission set.
    Custom permission sets can be assigned directly to users.
    """
    try:
        # Generate API name if not provided
        api_name = request.api_name or request.name.lower().replace(" ", "_")
        
        # Check for duplicate api_name in tenant
        existing = await db.permission_sets.find_one({
            "tenant_id": current_user.tenant_id,
            "api_name": api_name
        })
        
        if existing:
            raise HTTPException(
                status_code=400, 
                detail=f"Permission set with API name '{api_name}' already exists"
            )
        
        permission_set_id = str(uuid.uuid4())
        
        new_permission_set = {
            "id": permission_set_id,
            "tenant_id": current_user.tenant_id,
            "name": request.name,
            "api_name": api_name,
            "description": request.description,
            "permissions": request.permissions,
            "system_permissions": request.system_permissions or {},
            "field_permissions": request.field_permissions or {},  # FLS
            "is_custom": True,
            "is_system_permission_set": False,
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
            "created_by": current_user.id
        }
        
        await db.permission_sets.insert_one(new_permission_set)
        
        # Audit log
        await log_audit_event(
            tenant_id=current_user.tenant_id,
            event_type="security",
            action="permission_set_created",
            actor_user_id=current_user.id,
            actor_email=current_user.email,
            details={"permission_set_id": permission_set_id, "name": request.name}
        )
        
        logger.info(f"Created custom permission set '{request.name}' for tenant {current_user.tenant_id}")
        
        return {
            "message": f"Permission set '{request.name}' created successfully",
            "id": permission_set_id,
            "name": request.name,
            "api_name": api_name
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating permission set: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to create permission set")


@router.put("/permission-sets/{permission_set_id}")
async def update_permission_set(
    permission_set_id: str,
    request: UpdatePermissionSetRequest,
    current_user: User = Depends(get_current_user)
):
    """
    Update an existing permission set.
    Only custom permission sets can be modified.
    """
    try:
        ps = await db.permission_sets.find_one({
            "id": permission_set_id,
            "tenant_id": current_user.tenant_id
        })
        
        if not ps:
            raise HTTPException(status_code=404, detail="Permission set not found")
        
        if ps.get("is_system_permission_set"):
            raise HTTPException(
                status_code=403, 
                detail="System permission sets cannot be modified"
            )
        
        update_data = {"updated_at": datetime.now(timezone.utc)}
        
        if request.name is not None:
            update_data["name"] = request.name
        if request.description is not None:
            update_data["description"] = request.description
        if request.permissions is not None:
            update_data["permissions"] = request.permissions
        if request.system_permissions is not None:
            update_data["system_permissions"] = request.system_permissions
        if request.field_permissions is not None:
            update_data["field_permissions"] = request.field_permissions
        
        await db.permission_sets.update_one(
            {"id": permission_set_id},
            {"$set": update_data}
        )
        
        # Invalidate cache for all users with this permission set (immediate effect)
        await invalidate_permission_set_cache(current_user.tenant_id, permission_set_id)
        
        # Audit log
        await log_audit_event(
            tenant_id=current_user.tenant_id,
            event_type="security",
            action="permission_set_updated",
            actor_user_id=current_user.id,
            actor_email=current_user.email,
            details={"permission_set_id": permission_set_id, "changes": list(update_data.keys())}
        )
        
        return {"message": "Permission set updated successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating permission set: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to update permission set")


@router.delete("/permission-sets/{permission_set_id}")
async def delete_permission_set(
    permission_set_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Delete a custom permission set.
    System permission sets cannot be deleted.
    Removes all user assignments for this permission set.
    """
    try:
        ps = await db.permission_sets.find_one({
            "id": permission_set_id,
            "tenant_id": current_user.tenant_id
        })
        
        if not ps:
            raise HTTPException(status_code=404, detail="Permission set not found")
        
        if ps.get("is_system_permission_set"):
            raise HTTPException(
                status_code=403, 
                detail="System permission sets cannot be deleted"
            )
        
        # Remove all user assignments
        delete_result = await db.user_permission_sets.delete_many({
            "permission_set_id": permission_set_id
        })
        
        # Delete the permission set
        await db.permission_sets.delete_one({"id": permission_set_id})
        
        # Audit log
        await log_audit_event(
            tenant_id=current_user.tenant_id,
            event_type="security",
            action="permission_set_deleted",
            actor_user_id=current_user.id,
            actor_email=current_user.email,
            details={
                "permission_set_id": permission_set_id, 
                "name": ps.get("name"),
                "assignments_removed": delete_result.deleted_count
            }
        )
        
        return {
            "message": "Permission set deleted successfully",
            "assignments_removed": delete_result.deleted_count
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting permission set: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to delete permission set")


# ========================================
# USER PERMISSION SET ASSIGNMENT ROUTES
# ========================================

@router.get("/users/{user_id}/permission-sets")
async def get_user_permission_sets(
    user_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Get all permission sets assigned to a user.
    Returns permission sets from all sources: direct, bundles, and role (legacy).
    """
    try:
        # Verify user exists in tenant
        user = await db.users.find_one({
            "id": user_id,
            "tenant_id": current_user.tenant_id
        }, {"_id": 0})
        
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        result = {
            "user_id": user_id,
            "user_email": user.get("email"),
            "permission_sets": [],
            "summary": {
                "direct": 0,
                "bundle": 0,
                "role": 0
            }
        }
        
        # 1. Direct permission set assignments
        direct_assignments = await db.user_permission_sets.find({
            "user_id": user_id,
            "is_active": True
        }, {"_id": 0}).to_list(None)
        
        for assignment in direct_assignments:
            ps_id = assignment.get("permission_set_id")
            ps = await db.permission_sets.find_one({"id": ps_id}, {"_id": 0})
            
            if ps:
                result["permission_sets"].append({
                    "assignment_id": assignment.get("id"),
                    "permission_set_id": ps_id,
                    "permission_set_name": ps.get("name") or ps.get("role_name", "Unnamed"),
                    "source": "direct",
                    "assigned_at": assignment.get("assigned_at"),
                    "assigned_by": assignment.get("assigned_by"),
                    "permissions": ps.get("permissions", []),
                    "system_permissions": ps.get("system_permissions")
                })
                result["summary"]["direct"] += 1
        
        # 2. Permission sets via bundles
        bundle_assignments = await db.user_access_bundles.find({
            "user_id": user_id
        }, {"_id": 0}).to_list(None)
        
        for ba in bundle_assignments:
            bundle = await db.access_bundles.find_one({
                "id": ba.get("bundle_id"),
                "is_active": True
            }, {"_id": 0})
            
            if bundle:
                for ps_id in bundle.get("permission_set_ids", []):
                    ps = await db.permission_sets.find_one({"id": ps_id}, {"_id": 0})
                    if ps:
                        result["permission_sets"].append({
                            "assignment_id": ba.get("id"),
                            "permission_set_id": ps_id,
                            "permission_set_name": ps.get("name") or ps.get("role_name", "Unnamed"),
                            "source": f"bundle:{bundle.get('name')}",
                            "bundle_id": bundle.get("id"),
                            "bundle_name": bundle.get("name"),
                            "assigned_at": ba.get("assigned_at"),
                            "permissions": ps.get("permissions", []),
                            "system_permissions": ps.get("system_permissions")
                        })
                        result["summary"]["bundle"] += 1
        
        # 3. Permission set from role (legacy)
        if user.get("role_id"):
            role_ps = await db.permission_sets.find_one({
                "role_id": user.get("role_id")
            }, {"_id": 0})
            
            if role_ps:
                result["permission_sets"].append({
                    "assignment_id": None,
                    "permission_set_id": role_ps.get("id"),
                    "permission_set_name": role_ps.get("name") or role_ps.get("role_name", "Unnamed"),
                    "source": "role",
                    "role_id": user.get("role_id"),
                    "role_name": role_ps.get("role_name"),
                    "permissions": role_ps.get("permissions", []),
                    "system_permissions": role_ps.get("system_permissions")
                })
                result["summary"]["role"] += 1
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting user permission sets: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to get user permission sets")


@router.post("/users/{user_id}/permission-sets")
async def assign_permission_set_to_user(
    user_id: str,
    request: AssignPermissionSetRequest,
    current_user: User = Depends(get_current_user)
):
    """
    Assign a permission set directly to a user.
    This creates a user_permission_sets record.
    """
    try:
        # Verify user exists in tenant
        user = await db.users.find_one({
            "id": user_id,
            "tenant_id": current_user.tenant_id
        }, {"_id": 0})
        
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        # Verify permission set exists
        ps = await db.permission_sets.find_one({
            "id": request.permission_set_id
        }, {"_id": 0})
        
        if not ps:
            raise HTTPException(status_code=404, detail="Permission set not found")
        
        # Check if already assigned
        existing = await db.user_permission_sets.find_one({
            "user_id": user_id,
            "permission_set_id": request.permission_set_id,
            "is_active": True
        })
        
        if existing:
            raise HTTPException(
                status_code=400, 
                detail="Permission set is already assigned to this user"
            )
        
        assignment_id = str(uuid.uuid4())
        
        assignment = {
            "id": assignment_id,
            "tenant_id": current_user.tenant_id,
            "user_id": user_id,
            "permission_set_id": request.permission_set_id,
            "assigned_at": datetime.now(timezone.utc),
            "assigned_by": current_user.id,
            "is_active": True
        }
        
        await db.user_permission_sets.insert_one(assignment)
        
        # Invalidate permission cache for this user (immediate effect)
        await invalidate_user_permission_cache(current_user.tenant_id, user_id)
        
        # Audit log
        await log_audit_event(
            tenant_id=current_user.tenant_id,
            event_type="security",
            action="permission_set_assigned",
            actor_user_id=current_user.id,
            actor_email=current_user.email,
            target_user_id=user_id,
            target_email=user.get("email"),
            details={
                "permission_set_id": request.permission_set_id,
                "permission_set_name": ps.get("name") or ps.get("role_name")
            }
        )
        
        ps_name = ps.get("name") or ps.get("role_name", "Unnamed")
        logger.info(f"Assigned permission set '{ps_name}' to user {user.get('email')}")
        
        return {
            "message": f"Permission set '{ps_name}' assigned to user successfully",
            "assignment_id": assignment_id,
            "user_id": user_id,
            "permission_set_id": request.permission_set_id
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error assigning permission set: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to assign permission set")


@router.delete("/users/{user_id}/permission-sets/{assignment_id}")
async def revoke_permission_set_from_user(
    user_id: str,
    assignment_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Revoke a permission set assignment from a user.
    Only direct assignments can be revoked through this endpoint.
    """
    try:
        # Find the assignment
        assignment = await db.user_permission_sets.find_one({
            "id": assignment_id,
            "user_id": user_id,
            "tenant_id": current_user.tenant_id
        }, {"_id": 0})
        
        if not assignment:
            raise HTTPException(status_code=404, detail="Permission set assignment not found")
        
        # Get user and permission set details for audit
        user = await db.users.find_one({"id": user_id}, {"_id": 0, "email": 1})
        ps = await db.permission_sets.find_one(
            {"id": assignment.get("permission_set_id")}, 
            {"_id": 0, "name": 1, "role_name": 1}
        )
        
        # Delete the assignment
        await db.user_permission_sets.delete_one({"id": assignment_id})
        
        # Invalidate permission cache for this user (immediate effect)
        await invalidate_user_permission_cache(current_user.tenant_id, user_id)
        
        # Audit log
        await log_audit_event(
            tenant_id=current_user.tenant_id,
            event_type="security",
            action="permission_set_revoked",
            actor_user_id=current_user.id,
            actor_email=current_user.email,
            target_user_id=user_id,
            target_email=user.get("email") if user else None,
            details={
                "permission_set_id": assignment.get("permission_set_id"),
                "permission_set_name": ps.get("name") or ps.get("role_name") if ps else None
            }
        )
        
        ps_name = (ps.get("name") or ps.get("role_name", "Unknown")) if ps else "Unknown"
        logger.info(f"Revoked permission set '{ps_name}' from user {user_id}")
        
        return {
            "message": "Permission set revoked from user successfully",
            "user_id": user_id,
            "assignment_id": assignment_id
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error revoking permission set: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to revoke permission set")


# ========================================
# EFFECTIVE PERMISSIONS ROUTE
# ========================================

@router.get("/users/{user_id}/effective-permissions")
async def get_user_effective_permissions(
    user_id: str,
    force_refresh: bool = False,
    current_user: User = Depends(get_current_user)
):
    """
    Calculate and return the effective permissions for a user.
    Uses cached aggregation for performance.
    
    Query params:
    - force_refresh: If true, bypasses cache and recomputes permissions
    """
    from modules.users.services.permission_cache import get_effective_permissions
    
    try:
        # Verify user exists in tenant
        user = await db.users.find_one({
            "id": user_id,
            "tenant_id": current_user.tenant_id
        }, {"_id": 0, "id": 1, "email": 1})
        
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        # Get effective permissions from cache service
        effective = await get_effective_permissions(
            tenant_id=current_user.tenant_id,
            user_id=user_id,
            force_refresh=force_refresh
        )
        
        # Add user info to response
        effective["user_id"] = user_id
        effective["user_email"] = user.get("email")
        
        # Add note for super admin
        if effective.get("is_super_admin"):
            effective["note"] = "Super Admin - bypasses all permission checks"
        
        return effective
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting effective permissions: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to get effective permissions")


# ========================================
# CACHE MANAGEMENT ROUTES
# ========================================

@router.get("/permission-cache/stats")
async def get_permission_cache_stats(
    current_user: User = Depends(get_current_user)
):
    """
    Get permission cache statistics.
    Useful for monitoring cache performance.
    """
    try:
        stats = await get_cache_stats()
        return {
            "cache_stats": stats,
            "cache_config": {
                "ttl_seconds": 300,
                "max_size": 10000,
                "invalidation_strategy": "immediate"
            }
        }
    except Exception as e:
        logger.error(f"Error getting cache stats: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to get cache stats")


@router.post("/permission-cache/invalidate/{user_id}")
async def invalidate_user_cache(
    user_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Manually invalidate permission cache for a specific user.
    Use this if permission changes are not being reflected immediately.
    """
    try:
        await invalidate_user_permission_cache(current_user.tenant_id, user_id)
        return {"message": f"Permission cache invalidated for user {user_id}"}
    except Exception as e:
        logger.error(f"Error invalidating cache: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to invalidate cache")



# ========================================
# MIGRATION ROUTES
# ========================================

@router.get("/permission-migration/status")
async def get_migration_status(
    current_user: User = Depends(get_current_user)
):
    """
    Check the permission migration status.
    Shows how many users need migration from role-based to direct permission sets.
    """
    from modules.users.services.permission_migration import check_migration_status
    
    try:
        if not getattr(current_user, 'is_super_admin', False):
            raise HTTPException(status_code=403, detail="Only Super Admins can check migration status")
        
        status = await check_migration_status()
        return status
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error checking migration status: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to check migration status")


@router.post("/permission-migration/run")
async def run_permission_migration(
    current_user: User = Depends(get_current_user)
):
    """
    Run the permission migration from role-based to direct assignments.
    This converts all role-based permission sets to direct user assignments.
    
    NOTE: This should only be run once after deploying the new architecture.
    Super Admin only.
    """
    from modules.users.services.permission_migration import (
        migrate_role_permissions_to_direct,
        add_visible_flag_to_existing_permission_sets
    )
    
    try:
        if not getattr(current_user, 'is_super_admin', False):
            raise HTTPException(status_code=403, detail="Only Super Admins can run migration")
        
        # First, add visible flag to existing permission sets
        visible_result = await add_visible_flag_to_existing_permission_sets()
        
        # Then run the main migration
        migration_result = await migrate_role_permissions_to_direct()
        
        # Audit log
        await log_audit_event(
            tenant_id=current_user.tenant_id,
            event_type="security",
            action="permission_migration_executed",
            actor_user_id=current_user.id,
            actor_email=current_user.email,
            details={
                "users_migrated": migration_result.get("users_migrated", 0),
                "visible_flag_updates": visible_result.get("updated_count", 0)
            }
        )
        
        return {
            "migration_result": migration_result,
            "visible_flag_result": visible_result
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error running migration: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to run migration")


# ========================================
# VISIBLE OBJECTS ROUTE
# ========================================

@router.get("/users/{user_id}/visible-objects")
async def get_user_visible_objects(
    user_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Get list of objects visible to a user.
    Used by frontend to filter navigation and menus.
    """
    from modules.users.services.permission_cache import get_visible_objects
    
    try:
        # Users can check their own visible objects, admins can check anyone
        if user_id != current_user.id and not getattr(current_user, 'is_super_admin', False):
            raise HTTPException(status_code=403, detail="Cannot view other users' permissions")
        
        # Verify user exists in tenant
        user = await db.users.find_one({
            "id": user_id,
            "tenant_id": current_user.tenant_id
        }, {"_id": 0, "is_super_admin": 1})
        
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        visible = await get_visible_objects(
            tenant_id=current_user.tenant_id,
            user_id=user_id,
            is_super_admin=user.get("is_super_admin", False)
        )
        
        return {
            "user_id": user_id,
            "visible_objects": visible,
            "total": len(visible)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting visible objects: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to get visible objects")


@router.put("/users/{user_id}/permission-set-ids")
async def update_user_permission_set_ids(
    user_id: str,
    request: Dict[str, Any],
    current_user: User = Depends(get_current_user)
):
    """
    Update a user's direct permission set IDs.
    This is the primary way to assign permission sets in the new architecture.
    """
    try:
        if not getattr(current_user, 'is_super_admin', False):
            raise HTTPException(status_code=403, detail="Only Super Admins can assign permission sets")
        
        # Verify user exists in tenant
        user = await db.users.find_one({
            "id": user_id,
            "tenant_id": current_user.tenant_id
        }, {"_id": 0, "email": 1})
        
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        permission_set_ids = request.get("permission_set_ids", [])
        
        # Validate all permission set IDs exist
        for ps_id in permission_set_ids:
            ps = await db.permission_sets.find_one({"id": ps_id})
            if not ps:
                raise HTTPException(status_code=400, detail=f"Permission set '{ps_id}' not found")
        
        # Update user
        await db.users.update_one(
            {"id": user_id},
            {"$set": {"permission_set_ids": permission_set_ids}}
        )
        
        # Invalidate cache
        await invalidate_user_permission_cache(current_user.tenant_id, user_id)
        
        # Audit log
        await log_audit_event(
            tenant_id=current_user.tenant_id,
            event_type="security",
            action="user_permission_sets_updated",
            actor_user_id=current_user.id,
            actor_email=current_user.email,
            target_user_id=user_id,
            target_email=user.get("email"),
            details={"permission_set_ids": permission_set_ids}
        )
        
        return {
            "message": "Permission sets updated successfully",
            "user_id": user_id,
            "permission_set_ids": permission_set_ids
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating user permission sets: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to update permission sets")



# ========================================
# CURRENT USER CONVENIENCE ROUTES
# ========================================

@router.get("/me/visible-objects")
async def get_my_visible_objects(
    current_user: User = Depends(get_current_user)
):
    """
    Get list of objects visible to the current user.
    Used by frontend to filter navigation and menus.
    
    This is a convenience endpoint that returns the same data
    as /users/{user_id}/visible-objects but for the current user.
    """
    from modules.users.services.permission_cache import get_visible_objects, get_effective_permissions
    
    try:
        visible = await get_visible_objects(
            tenant_id=current_user.tenant_id,
            user_id=current_user.id,
            is_super_admin=getattr(current_user, 'is_super_admin', False)
        )
        
        # Also get the full effective permissions for UI use
        effective = await get_effective_permissions(current_user.tenant_id, current_user.id)
        
        return {
            "user_id": current_user.id,
            "is_super_admin": getattr(current_user, 'is_super_admin', False),
            "visible_objects": visible,
            "object_permissions": effective.get("object_permissions", {}),
            "total": len(visible)
        }
        
    except Exception as e:
        logger.error(f"Error getting visible objects: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to get visible objects")


@router.get("/me/effective-permissions")
async def get_my_effective_permissions(
    current_user: User = Depends(get_current_user)
):
    """
    Get the current user's effective permissions.
    Aggregated from all permission sources (direct assignments + bundles).
    """
    from modules.users.services.permission_cache import get_effective_permissions
    
    try:
        effective = await get_effective_permissions(current_user.tenant_id, current_user.id)
        
        return {
            "user_id": current_user.id,
            "is_super_admin": effective.get("is_super_admin", False),
            "object_permissions": effective.get("object_permissions", {}),
            "system_permissions": effective.get("system_permissions", {}),
            "permission_sources": effective.get("permission_sources", [])
        }
        
    except Exception as e:
        logger.error(f"Error getting effective permissions: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to get effective permissions")



# ========================================
# FIELD-LEVEL SECURITY ROUTES
# ========================================

@router.get("/me/field-permissions")
async def get_my_field_permissions(
    object_name: Optional[str] = Query(None, description="Filter by object name"),
    current_user: User = Depends(get_current_user)
):
    """
    Get field-level permissions for the current user.
    Returns which fields are hidden/read-only for each object.
    
    Used by frontend to:
    - Hide fields marked as hidden
    - Disable editing for read-only fields
    """
    from modules.users.services.field_level_security import get_user_field_permissions
    
    try:
        result = await get_user_field_permissions(
            tenant_id=current_user.tenant_id,
            user_id=current_user.id,
            object_name=object_name
        )
        
        return result
        
    except Exception as e:
        logger.error(f"Error getting field permissions: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to get field permissions")


@router.get("/users/{user_id}/field-permissions")
async def get_user_field_permissions_endpoint(
    user_id: str,
    object_name: Optional[str] = Query(None, description="Filter by object name"),
    current_user: User = Depends(get_current_user)
):
    """
    Get field-level permissions for a specific user.
    Admins can view any user's field permissions.
    """
    from modules.users.services.field_level_security import get_user_field_permissions
    
    try:
        # Users can check their own, admins can check anyone
        if user_id != current_user.id and not getattr(current_user, 'is_super_admin', False):
            raise HTTPException(status_code=403, detail="Cannot view other users' field permissions")
        
        # Verify user exists in tenant
        user = await db.users.find_one({
            "id": user_id,
            "tenant_id": current_user.tenant_id
        }, {"_id": 0})
        
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        result = await get_user_field_permissions(
            tenant_id=current_user.tenant_id,
            user_id=user_id,
            object_name=object_name
        )
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting user field permissions: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to get field permissions")
