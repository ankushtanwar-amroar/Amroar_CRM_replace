"""
Roles Routes
Role management, hierarchy, and user role assignments.
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import Dict, Any
from datetime import datetime, timezone
import uuid
import logging

from config.database import db
from shared.models import User
from modules.auth.api.auth_routes import get_current_user
from modules.users.api.dependencies import require_admin

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Roles"])


@router.get("/roles")
async def list_roles(current_user: User = Depends(get_current_user)):
    """List all available roles with user counts."""
    try:
        tenant_id = current_user.tenant_id
        cursor = db.roles.find(
            {"$or": [{"tenant_id": tenant_id}, {"tenant_id": None}, {"tenant_id": {"$exists": False}}]},
            {"_id": 0}
        ).sort("name", 1)
        roles = await cursor.to_list(100)
        
        for role in roles:
            if role.get("parent_role_id"):
                parent = await db.roles.find_one(
                    {"id": role["parent_role_id"]},
                    {"_id": 0, "name": 1}
                )
                role["parent_role_name"] = parent.get("name") if parent else None
            
            user_count = await db.users.count_documents({
                "tenant_id": tenant_id,
                "role_id": role["id"]
            })
            role["assigned_users_count"] = user_count
            role["user_count"] = user_count
        
        return roles
    except Exception as e:
        logger.error(f"Error listing roles: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch roles")


@router.get("/roles/hierarchy")
async def get_roles_hierarchy(current_user: User = Depends(get_current_user)):
    """Get all roles as hierarchical tree structure."""
    try:
        tenant_id = current_user.tenant_id
        cursor = db.roles.find(
            {"$or": [{"tenant_id": tenant_id}, {"tenant_id": None}, {"tenant_id": {"$exists": False}}]},
            {"_id": 0}
        )
        roles = await cursor.to_list(100)
        
        role_map = {}
        for role in roles:
            user_count = await db.users.count_documents({
                "tenant_id": tenant_id,
                "role_id": role["id"]
            })
            role["assigned_users_count"] = user_count
            role["user_count"] = user_count
            role["children"] = []
            role_map[role["id"]] = role
        
        root_nodes = []
        for role in roles:
            parent_id = role.get("parent_role_id")
            if parent_id and parent_id in role_map:
                role_map[parent_id]["children"].append(role)
            else:
                root_nodes.append(role)
        
        def set_levels(nodes, level=0):
            for node in nodes:
                node["level"] = level
                set_levels(node.get("children", []), level + 1)
        
        set_levels(root_nodes)
        return root_nodes
    except Exception as e:
        logger.error(f"Error fetching role hierarchy: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch role hierarchy")


@router.get("/roles/{role_id}")
async def get_role(role_id: str, current_user: User = Depends(get_current_user)):
    """Get role details by ID with parent name and user count."""
    try:
        tenant_id = current_user.tenant_id
        role = await db.roles.find_one(
            {"id": role_id, "$or": [{"tenant_id": tenant_id}, {"tenant_id": None}, {"tenant_id": {"$exists": False}}]},
            {"_id": 0}
        )
        
        if not role:
            raise HTTPException(status_code=404, detail="Role not found")
        
        if role.get("parent_role_id"):
            parent = await db.roles.find_one(
                {"id": role["parent_role_id"]},
                {"_id": 0, "name": 1}
            )
            role["parent_role_name"] = parent.get("name") if parent else None
        
        user_count = await db.users.count_documents({
            "tenant_id": tenant_id,
            "role_id": role["id"]
        })
        role["assigned_users_count"] = user_count
        role["user_count"] = user_count
        
        return role
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching role: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch role")


@router.post("/roles")
async def create_role(role_data: Dict[str, Any], current_user: User = Depends(require_admin)):
    """Create a new role."""
    tenant_id = current_user.tenant_id
    name = role_data.get("name")
    
    if not name:
        raise HTTPException(status_code=400, detail="Role name required")
    
    existing = await db.roles.find_one({
        "tenant_id": tenant_id,
        "name": {"$regex": f"^{name}$", "$options": "i"}
    })
    if existing:
        raise HTTPException(status_code=400, detail="Role with this name already exists")
    
    parent_role_id = role_data.get("parent_role_id")
    if parent_role_id:
        parent = await db.roles.find_one({"id": parent_role_id, "tenant_id": tenant_id})
        if not parent:
            raise HTTPException(status_code=400, detail="Parent role not found")
    
    now = datetime.now(timezone.utc)
    new_role = {
        "id": str(uuid.uuid4()),
        "tenant_id": tenant_id,
        "name": name,
        "description": role_data.get("description", ""),
        "is_system_role": False,
        "parent_role_id": parent_role_id,
        "data_visibility": role_data.get("data_visibility", "view_subordinate"),
        "permission_set_ids": role_data.get("permission_set_ids", []),
        "created_at": now,
        "updated_at": now,
        "created_by": current_user.id
    }
    await db.roles.insert_one(new_role)
    
    if parent_role_id:
        parent = await db.roles.find_one({"id": parent_role_id}, {"_id": 0, "name": 1})
        new_role["parent_role_name"] = parent.get("name") if parent else None
    
    new_role["assigned_users_count"] = 0
    new_role["user_count"] = 0
    new_role.pop("_id", None)
    
    logger.info(f"Created role: {name} by user {current_user.id}")
    return new_role


@router.put("/roles/{role_id}")
async def update_role(role_id: str, role_data: Dict[str, Any], current_user: User = Depends(require_admin)):
    """Update an existing role."""
    tenant_id = current_user.tenant_id
    
    role = await db.roles.find_one({"id": role_id, "tenant_id": tenant_id})
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    
    if role.get("is_system_role"):
        raise HTTPException(status_code=403, detail="Cannot modify system roles")
    
    new_name = role_data.get("name")
    if new_name and new_name != role.get("name"):
        existing = await db.roles.find_one({
            "tenant_id": tenant_id,
            "name": {"$regex": f"^{new_name}$", "$options": "i"},
            "id": {"$ne": role_id}
        })
        if existing:
            raise HTTPException(status_code=400, detail="Role with this name already exists")
    
    parent_role_id = role_data.get("parent_role_id")
    if parent_role_id is not None and parent_role_id:
        if parent_role_id == role_id:
            raise HTTPException(status_code=400, detail="Role cannot report to itself")
        
        parent = await db.roles.find_one({"id": parent_role_id, "tenant_id": tenant_id})
        if not parent:
            raise HTTPException(status_code=400, detail="Parent role not found")
    
    update_data = {"updated_at": datetime.now(timezone.utc)}
    
    if "name" in role_data:
        update_data["name"] = role_data["name"]
    if "description" in role_data:
        update_data["description"] = role_data["description"]
    if "parent_role_id" in role_data:
        update_data["parent_role_id"] = role_data["parent_role_id"] or None
    if "data_visibility" in role_data:
        update_data["data_visibility"] = role_data["data_visibility"]
    if "permission_set_ids" in role_data:
        update_data["permission_set_ids"] = role_data["permission_set_ids"]
    
    await db.roles.update_one(
        {"id": role_id, "tenant_id": tenant_id},
        {"$set": update_data}
    )
    
    updated_role = await db.roles.find_one({"id": role_id, "tenant_id": tenant_id}, {"_id": 0})
    
    if updated_role.get("parent_role_id"):
        parent = await db.roles.find_one(
            {"id": updated_role["parent_role_id"], "tenant_id": tenant_id},
            {"_id": 0, "name": 1}
        )
        updated_role["parent_role_name"] = parent.get("name") if parent else None
    
    user_count = await db.users.count_documents({"tenant_id": tenant_id, "role_id": role_id})
    updated_role["assigned_users_count"] = user_count
    updated_role["user_count"] = user_count
    
    logger.info(f"Updated role: {role_id} by user {current_user.id}")
    return updated_role


@router.delete("/roles/{role_id}")
async def delete_role(role_id: str, current_user: User = Depends(require_admin)):
    """Delete a role."""
    tenant_id = current_user.tenant_id
    
    role = await db.roles.find_one({"id": role_id, "tenant_id": tenant_id})
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    
    if role.get("is_system_role"):
        raise HTTPException(status_code=403, detail="Cannot delete system roles")
    
    user_count = await db.users.count_documents({"tenant_id": tenant_id, "role_id": role_id})
    if user_count > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete role with {user_count} assigned user(s). Reassign users first."
        )
    
    child_count = await db.roles.count_documents({"tenant_id": tenant_id, "parent_role_id": role_id})
    if child_count > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete role with {child_count} subordinate role(s)."
        )
    
    await db.roles.delete_one({"id": role_id, "tenant_id": tenant_id})
    
    logger.info(f"Deleted role: {role_id} by user {current_user.id}")
    return {"message": "Role deleted successfully"}


@router.get("/roles/{role_id}/users")
async def get_role_users(role_id: str, current_user: User = Depends(get_current_user)):
    """Get users assigned to a role."""
    tenant_id = current_user.tenant_id
    
    role = await db.roles.find_one(
        {"id": role_id, "$or": [{"tenant_id": tenant_id}, {"tenant_id": None}, {"tenant_id": {"$exists": False}}]}
    )
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    
    cursor = db.users.find(
        {"tenant_id": tenant_id, "role_id": role_id},
        {"_id": 0, "id": 1, "email": 1, "first_name": 1, "last_name": 1, "is_active": 1}
    )
    
    users = await cursor.to_list(length=1000)
    return users


@router.post("/roles/{role_id}/users/{user_id}")
async def assign_user_to_role(role_id: str, user_id: str, current_user: User = Depends(require_admin)):
    """Assign a user to a role."""
    tenant_id = current_user.tenant_id
    
    role = await db.roles.find_one({"id": role_id, "tenant_id": tenant_id})
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    
    user = await db.users.find_one({"id": user_id, "tenant_id": tenant_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    await db.users.update_one(
        {"id": user_id, "tenant_id": tenant_id},
        {"$set": {
            "role_id": role_id,
            "role_name": role["name"],
            "updated_at": datetime.now(timezone.utc)
        }}
    )
    
    logger.info(f"Assigned user {user_id} to role {role_id} by {current_user.id}")
    return {"message": "User assigned to role successfully"}


@router.delete("/roles/{role_id}/users/{user_id}")
async def remove_user_from_role(role_id: str, user_id: str, current_user: User = Depends(require_admin)):
    """Remove a user from a role."""
    tenant_id = current_user.tenant_id
    
    user = await db.users.find_one({
        "id": user_id,
        "tenant_id": tenant_id,
        "role_id": role_id
    })
    if not user:
        raise HTTPException(status_code=404, detail="User not found in this role")
    
    await db.users.update_one(
        {"id": user_id, "tenant_id": tenant_id},
        {"$set": {
            "role_id": None,
            "role_name": None,
            "updated_at": datetime.now(timezone.utc)
        }}
    )
    
    logger.info(f"Removed user {user_id} from role {role_id} by {current_user.id}")
    return {"message": "User removed from role successfully"}


@router.get("/roles/{role_id}/hierarchy")
async def get_role_hierarchy_tree(role_id: str, current_user: User = Depends(get_current_user)):
    """Get role hierarchy tree starting from a specific role."""
    tenant_id = current_user.tenant_id
    
    async def build_tree(rid):
        role = await db.roles.find_one({"id": rid, "tenant_id": tenant_id}, {"_id": 0})
        if not role:
            return None
        children = await db.roles.find({"parent_role_id": rid, "tenant_id": tenant_id}, {"_id": 0}).to_list(100)
        role["children"] = []
        for c in children:
            child_tree = await build_tree(c["id"])
            if child_tree:
                role["children"].append(child_tree)
        role["user_count"] = await db.users.count_documents({"role_id": rid, "tenant_id": tenant_id})
        return role
    
    return await build_tree(role_id) or {}


@router.get("/roles/{role_id}/permission-set")
async def get_permission_set_for_role(role_id: str, current_user: User = Depends(get_current_user)):
    """Get permission set for a specific role."""
    try:
        permission_set = await db.permission_sets.find_one({"role_id": role_id}, {"_id": 0})
        
        if not permission_set:
            raise HTTPException(status_code=404, detail="Permission set not found for this role")
        
        return permission_set
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching permission set: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch permission set")
