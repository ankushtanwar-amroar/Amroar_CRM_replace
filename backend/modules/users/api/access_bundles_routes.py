"""
Access Bundles Routes
Permission set bundles management and user assignment.
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import Dict, Any
from datetime import datetime, timezone
import uuid
import logging

from config.database import db
from shared.models import User
from modules.auth.api.auth_routes import get_current_user
from modules.users.services import log_audit_event

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Access Bundles"])


@router.post("/access-bundles")
async def create_access_bundle(bundle_data: Dict[str, Any], current_user: User = Depends(get_current_user)):
    """Create a new access bundle that groups multiple permission sets."""
    try:
        name = bundle_data.get("name")
        if not name:
            raise HTTPException(status_code=400, detail="Bundle name is required")
        
        existing = await db.access_bundles.find_one({
            "tenant_id": current_user.tenant_id,
            "name": name
        })
        if existing:
            raise HTTPException(status_code=400, detail="A bundle with this name already exists")
        
        bundle = {
            "id": str(uuid.uuid4()),
            "tenant_id": current_user.tenant_id,
            "name": name,
            "description": bundle_data.get("description", ""),
            "permission_set_ids": bundle_data.get("permission_set_ids", []),
            "is_active": bundle_data.get("is_active", True),
            "created_at": datetime.now(timezone.utc).isoformat(),
            "created_by": current_user.id,
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "updated_by": current_user.id
        }
        
        await db.access_bundles.insert_one(bundle)
        
        await log_audit_event(
            current_user.tenant_id,
            current_user.id,
            "access_bundle_created",
            "access_bundle",
            bundle["id"],
            {"name": name, "permission_set_count": len(bundle["permission_set_ids"])}
        )
        
        logger.info(f"Access bundle '{name}' created by user {current_user.id}")
        
        bundle.pop("_id", None)
        return bundle
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating access bundle: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to create access bundle")


@router.get("/access-bundles")
async def list_access_bundles(current_user: User = Depends(get_current_user)):
    """Get all access bundles for the tenant."""
    try:
        bundles = await db.access_bundles.find(
            {"tenant_id": current_user.tenant_id},
            {"_id": 0}
        ).to_list(None)
        
        for bundle in bundles:
            perm_set_ids = bundle.get("permission_set_ids", [])
            if perm_set_ids:
                perm_sets = await db.permission_sets.find(
                    {"id": {"$in": perm_set_ids}},
                    {"_id": 0, "id": 1, "role_name": 1}
                ).to_list(None)
                bundle["permission_sets"] = perm_sets
            else:
                bundle["permission_sets"] = []
            
            assigned_count = await db.user_access_bundles.count_documents({
                "bundle_id": bundle["id"]
            })
            bundle["assigned_user_count"] = assigned_count
        
        return bundles
        
    except Exception as e:
        logger.error(f"Error listing access bundles: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to list access bundles")


@router.get("/access-bundles/{bundle_id}")
async def get_access_bundle(bundle_id: str, current_user: User = Depends(get_current_user)):
    """Get a specific access bundle by ID."""
    try:
        bundle = await db.access_bundles.find_one(
            {"id": bundle_id, "tenant_id": current_user.tenant_id},
            {"_id": 0}
        )
        
        if not bundle:
            raise HTTPException(status_code=404, detail="Access bundle not found")
        
        perm_set_ids = bundle.get("permission_set_ids", [])
        if perm_set_ids:
            perm_sets = await db.permission_sets.find(
                {"id": {"$in": perm_set_ids}},
                {"_id": 0}
            ).to_list(None)
            bundle["permission_sets"] = perm_sets
        else:
            bundle["permission_sets"] = []
        
        user_assignments = await db.user_access_bundles.find(
            {"bundle_id": bundle_id},
            {"_id": 0}
        ).to_list(None)
        
        user_ids = [a["user_id"] for a in user_assignments]
        if user_ids:
            users = await db.users.find(
                {"id": {"$in": user_ids}},
                {"_id": 0, "id": 1, "email": 1, "first_name": 1, "last_name": 1}
            ).to_list(None)
            bundle["assigned_users"] = users
        else:
            bundle["assigned_users"] = []
        
        return bundle
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting access bundle: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to get access bundle")


@router.put("/access-bundles/{bundle_id}")
async def update_access_bundle(
    bundle_id: str, 
    bundle_data: Dict[str, Any], 
    current_user: User = Depends(get_current_user)
):
    """Update an access bundle."""
    try:
        existing = await db.access_bundles.find_one({
            "id": bundle_id,
            "tenant_id": current_user.tenant_id
        })
        
        if not existing:
            raise HTTPException(status_code=404, detail="Access bundle not found")
        
        new_name = bundle_data.get("name")
        if new_name and new_name != existing.get("name"):
            duplicate = await db.access_bundles.find_one({
                "tenant_id": current_user.tenant_id,
                "name": new_name,
                "id": {"$ne": bundle_id}
            })
            if duplicate:
                raise HTTPException(status_code=400, detail="A bundle with this name already exists")
        
        update = {
            "$set": {
                "name": bundle_data.get("name", existing.get("name")),
                "description": bundle_data.get("description", existing.get("description")),
                "permission_set_ids": bundle_data.get("permission_set_ids", existing.get("permission_set_ids")),
                "is_active": bundle_data.get("is_active", existing.get("is_active")),
                "updated_at": datetime.now(timezone.utc).isoformat(),
                "updated_by": current_user.id
            }
        }
        
        await db.access_bundles.update_one({"id": bundle_id}, update)
        
        await log_audit_event(
            current_user.tenant_id,
            current_user.id,
            "access_bundle_updated",
            "access_bundle",
            bundle_id,
            {"changes": list(bundle_data.keys())}
        )
        
        logger.info(f"Access bundle {bundle_id} updated by user {current_user.id}")
        
        updated = await db.access_bundles.find_one({"id": bundle_id}, {"_id": 0})
        return updated
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating access bundle: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to update access bundle")


@router.delete("/access-bundles/{bundle_id}")
async def delete_access_bundle(bundle_id: str, current_user: User = Depends(get_current_user)):
    """Delete an access bundle."""
    try:
        existing = await db.access_bundles.find_one({
            "id": bundle_id,
            "tenant_id": current_user.tenant_id
        })
        
        if not existing:
            raise HTTPException(status_code=404, detail="Access bundle not found")
        
        await db.user_access_bundles.delete_many({"bundle_id": bundle_id})
        await db.access_bundles.delete_one({"id": bundle_id})
        
        await log_audit_event(
            current_user.tenant_id,
            current_user.id,
            "access_bundle_deleted",
            "access_bundle",
            bundle_id,
            {"name": existing.get("name")}
        )
        
        logger.info(f"Access bundle {bundle_id} deleted by user {current_user.id}")
        
        return {"message": "Access bundle deleted successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting access bundle: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to delete access bundle")


@router.post("/access-bundles/{bundle_id}/assign")
async def assign_bundle_to_users(
    bundle_id: str,
    assignment_data: Dict[str, Any],
    current_user: User = Depends(get_current_user)
):
    """Assign an access bundle to one or more users."""
    try:
        bundle = await db.access_bundles.find_one({
            "id": bundle_id,
            "tenant_id": current_user.tenant_id
        })
        if not bundle:
            raise HTTPException(status_code=404, detail="Access bundle not found")
        
        user_ids = assignment_data.get("user_ids", [])
        if not user_ids:
            raise HTTPException(status_code=400, detail="No users specified")
        
        assigned_count = 0
        for user_id in user_ids:
            user = await db.users.find_one({
                "id": user_id,
                "tenant_id": current_user.tenant_id
            })
            if not user:
                continue
            
            existing = await db.user_access_bundles.find_one({
                "user_id": user_id,
                "bundle_id": bundle_id
            })
            if existing:
                continue
            
            assignment = {
                "id": str(uuid.uuid4()),
                "user_id": user_id,
                "bundle_id": bundle_id,
                "assigned_at": datetime.now(timezone.utc).isoformat(),
                "assigned_by": current_user.id
            }
            await db.user_access_bundles.insert_one(assignment)
            assigned_count += 1
        
        await log_audit_event(
            current_user.tenant_id,
            current_user.id,
            "access_bundle_assigned",
            "access_bundle",
            bundle_id,
            {"assigned_users": assigned_count, "bundle_name": bundle.get("name")}
        )
        
        logger.info(f"Access bundle {bundle_id} assigned to {assigned_count} users by {current_user.id}")
        
        return {"message": f"Bundle assigned to {assigned_count} user(s)", "assigned_count": assigned_count}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error assigning access bundle: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to assign access bundle")


@router.delete("/access-bundles/{bundle_id}/users/{user_id}")
async def unassign_bundle_from_user(
    bundle_id: str,
    user_id: str,
    current_user: User = Depends(get_current_user)
):
    """Remove an access bundle assignment from a user."""
    try:
        result = await db.user_access_bundles.delete_one({
            "bundle_id": bundle_id,
            "user_id": user_id
        })
        
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Assignment not found")
        
        logger.info(f"Access bundle {bundle_id} removed from user {user_id} by {current_user.id}")
        
        return {"message": "Bundle assignment removed successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error removing access bundle assignment: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to remove assignment")


@router.get("/users/{user_id}/access-bundles")
async def get_user_access_bundles(user_id: str, current_user: User = Depends(get_current_user)):
    """Get all access bundles assigned to a user."""
    try:
        user = await db.users.find_one({
            "id": user_id,
            "tenant_id": current_user.tenant_id
        })
        
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        assignments = await db.user_access_bundles.find(
            {"user_id": user_id},
            {"_id": 0}
        ).to_list(None)
        
        bundle_ids = [a["bundle_id"] for a in assignments]
        
        if not bundle_ids:
            return []
        
        bundles = await db.access_bundles.find(
            {"id": {"$in": bundle_ids}, "tenant_id": current_user.tenant_id},
            {"_id": 0}
        ).to_list(None)
        
        for bundle in bundles:
            assignment = next((a for a in assignments if a["bundle_id"] == bundle["id"]), None)
            if assignment:
                bundle["assigned_at"] = assignment.get("assigned_at")
                bundle["assigned_by"] = assignment.get("assigned_by")
            
            perm_set_ids = bundle.get("permission_set_ids", [])
            if perm_set_ids:
                perm_sets = await db.permission_sets.find(
                    {"id": {"$in": perm_set_ids}},
                    {"_id": 0, "id": 1, "role_name": 1}
                ).to_list(None)
                bundle["permission_sets"] = perm_sets
            else:
                bundle["permission_sets"] = []
        
        return bundles
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting user access bundles: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to get user access bundles")
