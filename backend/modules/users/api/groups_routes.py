"""
Groups Routes
Group management and membership operations.
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Dict, Any, Optional
from datetime import datetime, timezone
import uuid
import logging

from config.database import db
from shared.models import User
from modules.auth.api.auth_routes import get_current_user
from modules.users.api.dependencies import require_admin

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Groups"])


class GroupMemberRequest(BaseModel):
    """Schema for adding group member"""
    member_type: str  # 'user' or 'role'
    member_id: str


@router.get("/groups")
async def list_groups(
    group_type: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """List all groups for the tenant."""
    try:
        query = {"tenant_id": current_user.tenant_id}
        if group_type:
            query["group_type"] = group_type
        
        cursor = db.groups.find(query, {"_id": 0}).sort("name", 1)
        groups = await cursor.to_list(100)
        
        for group in groups:
            member_count = await db.group_members.count_documents({
                "group_id": group["id"]
            })
            group["member_count"] = member_count
        
        return groups
    except Exception as e:
        logger.error(f"Error listing groups: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch groups")


@router.get("/groups/{group_id}")
async def get_group(group_id: str, current_user: User = Depends(get_current_user)):
    """Get group details by ID."""
    try:
        group = await db.groups.find_one(
            {"id": group_id, "tenant_id": current_user.tenant_id},
            {"_id": 0}
        )
        
        if not group:
            raise HTTPException(status_code=404, detail="Group not found")
        
        members = await db.group_members.find(
            {"group_id": group_id},
            {"_id": 0}
        ).to_list(1000)
        
        enriched_members = []
        for member in members:
            member_info = {"id": member["id"], "member_type": member["member_type"], "member_id": member["member_id"]}
            if member["member_type"] == "user":
                user = await db.users.find_one(
                    {"id": member["member_id"]},
                    {"_id": 0, "id": 1, "first_name": 1, "last_name": 1, "email": 1}
                )
                if user:
                    member_info["name"] = f"{user.get('first_name', '')} {user.get('last_name', '')}".strip()
                    member_info["email"] = user.get("email")
            elif member["member_type"] == "role":
                role = await db.roles.find_one(
                    {"id": member["member_id"]},
                    {"_id": 0, "id": 1, "name": 1}
                )
                if role:
                    member_info["name"] = role.get("name")
            enriched_members.append(member_info)
        
        group["members"] = enriched_members
        group["member_count"] = len(enriched_members)
        
        return group
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching group: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch group")


@router.post("/groups")
async def create_group(group_data: Dict[str, Any], current_user: User = Depends(require_admin)):
    """Create a new group."""
    tenant_id = current_user.tenant_id
    name = group_data.get("name")
    
    if not name:
        raise HTTPException(status_code=400, detail="Group name required")
    
    existing = await db.groups.find_one({
        "tenant_id": tenant_id,
        "name": {"$regex": f"^{name}$", "$options": "i"}
    })
    if existing:
        raise HTTPException(status_code=400, detail="Group with this name already exists")
    
    group_type = group_data.get("group_type", "public")
    if group_type not in ["public", "private"]:
        raise HTTPException(status_code=400, detail="Invalid group type. Must be 'public' or 'private'")
    
    now = datetime.now(timezone.utc)
    new_group = {
        "id": str(uuid.uuid4()),
        "tenant_id": tenant_id,
        "name": name,
        "description": group_data.get("description", ""),
        "group_type": group_type,
        "created_at": now,
        "updated_at": now,
        "created_by": current_user.id
    }
    
    await db.groups.insert_one(new_group)
    new_group.pop("_id", None)
    new_group["member_count"] = 0
    new_group["members"] = []
    
    logger.info(f"Created group: {name} by user {current_user.id}")
    return new_group


@router.put("/groups/{group_id}")
async def update_group(group_id: str, group_data: Dict[str, Any], current_user: User = Depends(require_admin)):
    """Update an existing group."""
    tenant_id = current_user.tenant_id
    
    group = await db.groups.find_one({"id": group_id, "tenant_id": tenant_id})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    new_name = group_data.get("name")
    if new_name and new_name != group.get("name"):
        existing = await db.groups.find_one({
            "tenant_id": tenant_id,
            "name": {"$regex": f"^{new_name}$", "$options": "i"},
            "id": {"$ne": group_id}
        })
        if existing:
            raise HTTPException(status_code=400, detail="Group with this name already exists")
    
    update_data = {"updated_at": datetime.now(timezone.utc)}
    
    if "name" in group_data:
        update_data["name"] = group_data["name"]
    if "description" in group_data:
        update_data["description"] = group_data["description"]
    if "group_type" in group_data:
        if group_data["group_type"] not in ["public", "private"]:
            raise HTTPException(status_code=400, detail="Invalid group type")
        update_data["group_type"] = group_data["group_type"]
    
    await db.groups.update_one(
        {"id": group_id, "tenant_id": tenant_id},
        {"$set": update_data}
    )
    
    updated_group = await db.groups.find_one({"id": group_id, "tenant_id": tenant_id}, {"_id": 0})
    member_count = await db.group_members.count_documents({"group_id": group_id})
    updated_group["member_count"] = member_count
    
    logger.info(f"Updated group: {group_id} by user {current_user.id}")
    return updated_group


@router.delete("/groups/{group_id}")
async def delete_group(group_id: str, current_user: User = Depends(require_admin)):
    """Delete a group."""
    tenant_id = current_user.tenant_id
    
    group = await db.groups.find_one({"id": group_id, "tenant_id": tenant_id})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    await db.group_members.delete_many({"group_id": group_id})
    await db.groups.delete_one({"id": group_id, "tenant_id": tenant_id})
    
    logger.info(f"Deleted group: {group_id} by user {current_user.id}")
    return {"message": "Group deleted successfully"}


@router.get("/groups/{group_id}/members")
async def get_group_members(group_id: str, current_user: User = Depends(get_current_user)):
    """Get all members of a group."""
    tenant_id = current_user.tenant_id
    
    group = await db.groups.find_one({"id": group_id, "tenant_id": tenant_id})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    members = await db.group_members.find(
        {"group_id": group_id},
        {"_id": 0}
    ).to_list(1000)
    
    enriched_members = []
    for member in members:
        member_info = {
            "id": member["id"],
            "member_type": member["member_type"],
            "member_id": member["member_id"],
            "added_at": member.get("added_at")
        }
        if member["member_type"] == "user":
            user = await db.users.find_one(
                {"id": member["member_id"]},
                {"_id": 0, "id": 1, "first_name": 1, "last_name": 1, "email": 1, "is_active": 1}
            )
            if user:
                member_info["name"] = f"{user.get('first_name', '')} {user.get('last_name', '')}".strip()
                member_info["email"] = user.get("email")
                member_info["is_active"] = user.get("is_active", True)
        elif member["member_type"] == "role":
            role = await db.roles.find_one(
                {"id": member["member_id"]},
                {"_id": 0, "id": 1, "name": 1, "description": 1}
            )
            if role:
                member_info["name"] = role.get("name")
                member_info["description"] = role.get("description")
        enriched_members.append(member_info)
    
    return enriched_members


@router.post("/groups/{group_id}/members")
async def add_group_member(
    group_id: str,
    member_data: GroupMemberRequest,
    current_user: User = Depends(require_admin)
):
    """Add a member (user or role) to a group."""
    tenant_id = current_user.tenant_id
    
    group = await db.groups.find_one({"id": group_id, "tenant_id": tenant_id})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    member_type = member_data.member_type
    member_id = member_data.member_id
    
    if member_type not in ["user", "role"]:
        raise HTTPException(status_code=400, detail="Invalid member type. Must be 'user' or 'role'")
    
    if member_type == "user":
        user = await db.users.find_one({"id": member_id, "tenant_id": tenant_id})
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
    else:
        role = await db.roles.find_one({"id": member_id})
        if not role:
            raise HTTPException(status_code=404, detail="Role not found")
    
    existing = await db.group_members.find_one({
        "group_id": group_id,
        "member_type": member_type,
        "member_id": member_id
    })
    if existing:
        raise HTTPException(status_code=400, detail="Already a member of this group")
    
    new_member = {
        "id": str(uuid.uuid4()),
        "group_id": group_id,
        "member_type": member_type,
        "member_id": member_id,
        "added_at": datetime.now(timezone.utc),
        "added_by": current_user.id
    }
    
    await db.group_members.insert_one(new_member)
    
    logger.info(f"Added {member_type} {member_id} to group {group_id} by {current_user.id}")
    return {"message": "Member added successfully", "member_id": new_member["id"]}


@router.delete("/groups/{group_id}/members/{member_id}")
async def remove_group_member(
    group_id: str,
    member_id: str,
    current_user: User = Depends(require_admin)
):
    """Remove a member from a group."""
    tenant_id = current_user.tenant_id
    
    group = await db.groups.find_one({"id": group_id, "tenant_id": tenant_id})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    result = await db.group_members.delete_one({
        "id": member_id,
        "group_id": group_id
    })
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Member not found in this group")
    
    logger.info(f"Removed member {member_id} from group {group_id} by {current_user.id}")
    return {"message": "Member removed successfully"}
