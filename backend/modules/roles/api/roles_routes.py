"""
Roles API Routes
Comprehensive role management with hierarchy support.
"""
from fastapi import APIRouter, Depends, HTTPException
from typing import List
from datetime import datetime, timezone
import uuid
import logging

from ..models.role_models import (
    RoleCreate,
    RoleUpdate,
    RoleResponse,
    RoleHierarchyNode,
    DataVisibility
)
from config.database import db
from modules.auth.api.auth_routes import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/roles", tags=["Roles"])


@router.get("", response_model=List[RoleResponse])
async def list_roles(current_user: dict = Depends(get_current_user)):
    """List all roles for the tenant"""
    tenant_id = current_user.get("tenant_id")
    
    cursor = db.roles.find(
        {"tenant_id": tenant_id},
        {"_id": 0}
    ).sort("name", 1)
    
    roles = await cursor.to_list(length=100)
    
    # Get parent role names and user counts
    for role in roles:
        if role.get("parent_role_id"):
            parent = await db.roles.find_one(
                {"id": role["parent_role_id"], "tenant_id": tenant_id},
                {"_id": 0, "name": 1}
            )
            role["parent_role_name"] = parent.get("name") if parent else None
        
        # Count assigned users
        user_count = await db.users.count_documents({
            "tenant_id": tenant_id,
            "role_id": role["id"]
        })
        role["assigned_users_count"] = user_count
    
    return roles


@router.get("/hierarchy", response_model=List[RoleHierarchyNode])
async def get_role_hierarchy(current_user: dict = Depends(get_current_user)):
    """Get roles as hierarchical tree structure"""
    tenant_id = current_user.get("tenant_id")
    
    cursor = db.roles.find(
        {"tenant_id": tenant_id},
        {"_id": 0}
    )
    roles = await cursor.to_list(length=100)
    
    # Build lookup and count users
    role_map = {}
    for role in roles:
        user_count = await db.users.count_documents({
            "tenant_id": tenant_id,
            "role_id": role["id"]
        })
        role["assigned_users_count"] = user_count
        role["user_count"] = user_count  # For frontend compatibility
        role["children"] = []
        role_map[role["id"]] = role
    
    # Build tree
    root_nodes = []
    for role in roles:
        parent_id = role.get("parent_role_id")
        if parent_id and parent_id in role_map:
            role_map[parent_id]["children"].append(role)
        else:
            root_nodes.append(role)
    
    # Set levels recursively
    def set_levels(nodes, level=0):
        for node in nodes:
            node["level"] = level
            set_levels(node.get("children", []), level + 1)
    
    set_levels(root_nodes)
    
    return root_nodes


@router.get("/{role_id}", response_model=RoleResponse)
async def get_role(role_id: str, current_user: dict = Depends(get_current_user)):
    """Get role by ID"""
    tenant_id = current_user.get("tenant_id")
    
    role = await db.roles.find_one(
        {"id": role_id, "tenant_id": tenant_id},
        {"_id": 0}
    )
    
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    
    # Get parent role name
    if role.get("parent_role_id"):
        parent = await db.roles.find_one(
            {"id": role["parent_role_id"], "tenant_id": tenant_id},
            {"_id": 0, "name": 1}
        )
        role["parent_role_name"] = parent.get("name") if parent else None
    
    # Count assigned users
    user_count = await db.users.count_documents({
        "tenant_id": tenant_id,
        "role_id": role["id"]
    })
    role["assigned_users_count"] = user_count
    
    return role


@router.post("", response_model=RoleResponse)
async def create_role(role_data: RoleCreate, current_user: dict = Depends(get_current_user)):
    """Create a new role"""
    tenant_id = current_user.get("tenant_id")
    
    # Check for duplicate name
    existing = await db.roles.find_one({
        "tenant_id": tenant_id,
        "name": {"$regex": f"^{role_data.name}$", "$options": "i"}
    })
    if existing:
        raise HTTPException(status_code=400, detail="Role with this name already exists")
    
    # Validate parent role if provided
    if role_data.parent_role_id:
        parent = await db.roles.find_one({
            "id": role_data.parent_role_id,
            "tenant_id": tenant_id
        })
        if not parent:
            raise HTTPException(status_code=400, detail="Parent role not found")
    
    now = datetime.now(timezone.utc)
    role = {
        "id": str(uuid.uuid4()),
        "tenant_id": tenant_id,
        "name": role_data.name,
        "description": role_data.description,
        "parent_role_id": role_data.parent_role_id,
        "data_visibility": role_data.data_visibility.value,
        "permission_set_ids": role_data.permission_set_ids,
        "is_system_role": False,
        "created_at": now,
        "updated_at": now,
        "created_by": current_user.get("user_id")
    }
    
    await db.roles.insert_one(role)
    
    # Get parent name for response
    role["assigned_users_count"] = 0
    if role_data.parent_role_id:
        parent = await db.roles.find_one(
            {"id": role_data.parent_role_id, "tenant_id": tenant_id},
            {"_id": 0, "name": 1}
        )
        role["parent_role_name"] = parent.get("name") if parent else None
    
    logger.info(f"Created role: {role['name']} by user {current_user.get('user_id')}")
    return role


@router.put("/{role_id}", response_model=RoleResponse)
async def update_role(role_id: str, role_data: RoleUpdate, current_user: dict = Depends(get_current_user)):
    """Update an existing role"""
    tenant_id = current_user.get("tenant_id")
    
    role = await db.roles.find_one({
        "id": role_id,
        "tenant_id": tenant_id
    })
    
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    
    # Check if system role
    if role.get("is_system_role"):
        raise HTTPException(status_code=403, detail="Cannot modify system roles")
    
    # Check for duplicate name if changing
    if role_data.name and role_data.name != role.get("name"):
        existing = await db.roles.find_one({
            "tenant_id": tenant_id,
            "name": {"$regex": f"^{role_data.name}$", "$options": "i"},
            "id": {"$ne": role_id}
        })
        if existing:
            raise HTTPException(status_code=400, detail="Role with this name already exists")
    
    # Validate parent role if changing
    if role_data.parent_role_id is not None:
        if role_data.parent_role_id:
            # Cannot set self as parent
            if role_data.parent_role_id == role_id:
                raise HTTPException(status_code=400, detail="Role cannot report to itself")
            
            parent = await db.roles.find_one({
                "id": role_data.parent_role_id,
                "tenant_id": tenant_id
            })
            if not parent:
                raise HTTPException(status_code=400, detail="Parent role not found")
            
            # Check for circular reference
            async def would_create_cycle(parent_id, target_id):
                if parent_id == target_id:
                    return True
                parent_role = await db.roles.find_one({
                    "id": parent_id,
                    "tenant_id": tenant_id
                })
                if parent_role and parent_role.get("parent_role_id"):
                    return await would_create_cycle(parent_role["parent_role_id"], target_id)
                return False
            
            if await would_create_cycle(role_data.parent_role_id, role_id):
                raise HTTPException(status_code=400, detail="Cannot create circular hierarchy")
    
    # Build update
    update_data = {"updated_at": datetime.now(timezone.utc)}
    
    if role_data.name is not None:
        update_data["name"] = role_data.name
    if role_data.description is not None:
        update_data["description"] = role_data.description
    if role_data.parent_role_id is not None:
        update_data["parent_role_id"] = role_data.parent_role_id or None
    if role_data.data_visibility is not None:
        update_data["data_visibility"] = role_data.data_visibility.value
    if role_data.permission_set_ids is not None:
        update_data["permission_set_ids"] = role_data.permission_set_ids
    
    await db.roles.update_one(
        {"id": role_id, "tenant_id": tenant_id},
        {"$set": update_data}
    )
    
    # Fetch updated role
    updated_role = await db.roles.find_one(
        {"id": role_id, "tenant_id": tenant_id},
        {"_id": 0}
    )
    
    # Get parent name
    if updated_role.get("parent_role_id"):
        parent = await db.roles.find_one(
            {"id": updated_role["parent_role_id"], "tenant_id": tenant_id},
            {"_id": 0, "name": 1}
        )
        updated_role["parent_role_name"] = parent.get("name") if parent else None
    
    # Count users
    user_count = await db.users.count_documents({
        "tenant_id": tenant_id,
        "role_id": role_id
    })
    updated_role["assigned_users_count"] = user_count
    
    logger.info(f"Updated role: {role_id} by user {current_user.get('user_id')}")
    return updated_role


@router.delete("/{role_id}")
async def delete_role(role_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a role"""
    tenant_id = current_user.get("tenant_id")
    
    role = await db.roles.find_one({
        "id": role_id,
        "tenant_id": tenant_id
    })
    
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    
    # Check if system role
    if role.get("is_system_role"):
        raise HTTPException(status_code=403, detail="Cannot delete system roles")
    
    # Check for assigned users
    user_count = await db.users.count_documents({
        "tenant_id": tenant_id,
        "role_id": role_id
    })
    if user_count > 0:
        raise HTTPException(
            status_code=400, 
            detail=f"Cannot delete role with {user_count} assigned user(s). Reassign users first."
        )
    
    # Check for child roles
    child_count = await db.roles.count_documents({
        "tenant_id": tenant_id,
        "parent_role_id": role_id
    })
    if child_count > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete role with {child_count} subordinate role(s). Reassign or delete them first."
        )
    
    await db.roles.delete_one({"id": role_id, "tenant_id": tenant_id})
    
    logger.info(f"Deleted role: {role_id} by user {current_user.get('user_id')}")
    return {"message": "Role deleted successfully"}


@router.get("/{role_id}/users")
async def get_role_users(role_id: str, current_user: dict = Depends(get_current_user)):
    """Get users assigned to a role"""
    tenant_id = current_user.get("tenant_id")
    
    role = await db.roles.find_one({
        "id": role_id,
        "tenant_id": tenant_id
    })
    
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    
    cursor = db.users.find(
        {"tenant_id": tenant_id, "role_id": role_id},
        {"_id": 0, "id": 1, "email": 1, "first_name": 1, "last_name": 1, "is_active": 1}
    )
    
    users = await cursor.to_list(length=1000)
    return users


@router.post("/{role_id}/users/{user_id}")
async def assign_user_to_role(role_id: str, user_id: str, current_user: dict = Depends(get_current_user)):
    """Assign a user to a role"""
    tenant_id = current_user.get("tenant_id")
    
    # Verify role exists
    role = await db.roles.find_one({
        "id": role_id,
        "tenant_id": tenant_id
    })
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    
    # Verify user exists
    user = await db.users.find_one({
        "id": user_id,
        "tenant_id": tenant_id
    })
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Update user's role
    await db.users.update_one(
        {"id": user_id, "tenant_id": tenant_id},
        {"$set": {
            "role_id": role_id,
            "role_name": role["name"],
            "updated_at": datetime.now(timezone.utc)
        }}
    )
    
    logger.info(f"Assigned user {user_id} to role {role_id} by {current_user.get('user_id')}")
    return {"message": "User assigned to role successfully"}


@router.delete("/{role_id}/users/{user_id}")
async def remove_user_from_role(role_id: str, user_id: str, current_user: dict = Depends(get_current_user)):
    """Remove a user from a role"""
    tenant_id = current_user.get("tenant_id")
    
    # Verify user exists and is in this role
    user = await db.users.find_one({
        "id": user_id,
        "tenant_id": tenant_id,
        "role_id": role_id
    })
    if not user:
        raise HTTPException(status_code=404, detail="User not found in this role")
    
    # Remove role from user
    await db.users.update_one(
        {"id": user_id, "tenant_id": tenant_id},
        {"$set": {
            "role_id": None,
            "role_name": None,
            "updated_at": datetime.now(timezone.utc)
        }}
    )
    
    logger.info(f"Removed user {user_id} from role {role_id} by {current_user.get('user_id')}")
    return {"message": "User removed from role successfully"}


@router.get("/{role_id}/subordinates")
async def get_subordinate_roles(role_id: str, current_user: dict = Depends(get_current_user)):
    """Get all subordinate roles (direct and indirect)"""
    tenant_id = current_user.get("tenant_id")
    
    role = await db.roles.find_one({
        "id": role_id,
        "tenant_id": tenant_id
    })
    
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    
    # Recursively get all subordinates
    async def get_subordinates(parent_id):
        cursor = db.roles.find(
            {"tenant_id": tenant_id, "parent_role_id": parent_id},
            {"_id": 0, "id": 1, "name": 1}
        )
        children = await cursor.to_list(length=100)
        
        all_subordinates = list(children)
        for child in children:
            child_subordinates = await get_subordinates(child["id"])
            all_subordinates.extend(child_subordinates)
        
        return all_subordinates
    
    subordinates = await get_subordinates(role_id)
    return subordinates
