"""
Queues Routes
Queue management and membership operations.
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Dict, Any
from datetime import datetime, timezone
import uuid
import logging

from config.database import db
from shared.models import User
from modules.auth.api.auth_routes import get_current_user
from modules.users.api.dependencies import require_admin

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Queues"])


class QueueMemberRequest(BaseModel):
    """Schema for adding queue member"""
    member_type: str  # 'user', 'role', or 'group'
    member_id: str


@router.get("/queues")
async def list_queues(current_user: User = Depends(get_current_user)):
    """List all queues for the tenant."""
    try:
        query = {"tenant_id": current_user.tenant_id}
        
        cursor = db.queues.find(query, {"_id": 0}).sort("name", 1)
        queues = await cursor.to_list(100)
        
        for queue in queues:
            member_count = await db.queue_members.count_documents({
                "queue_id": queue["id"]
            })
            queue["member_count"] = member_count
            queue["supported_objects"] = queue.get("supported_objects", [])
        
        return queues
    except Exception as e:
        logger.error(f"Error listing queues: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch queues")


@router.get("/queues/{queue_id}")
async def get_queue(queue_id: str, current_user: User = Depends(get_current_user)):
    """Get queue details by ID."""
    try:
        queue = await db.queues.find_one(
            {"id": queue_id, "tenant_id": current_user.tenant_id},
            {"_id": 0}
        )
        
        if not queue:
            raise HTTPException(status_code=404, detail="Queue not found")
        
        members = await db.queue_members.find(
            {"queue_id": queue_id},
            {"_id": 0}
        ).to_list(1000)
        
        enriched_members = []
        for member in members:
            member_info = {
                "id": member["id"],
                "member_type": member["member_type"],
                "member_id": member["member_id"]
            }
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
            elif member["member_type"] == "group":
                group = await db.groups.find_one(
                    {"id": member["member_id"]},
                    {"_id": 0, "id": 1, "name": 1}
                )
                if group:
                    member_info["name"] = group.get("name")
            enriched_members.append(member_info)
        
        queue["members"] = enriched_members
        queue["member_count"] = len(enriched_members)
        
        return queue
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching queue: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch queue")


@router.post("/queues")
async def create_queue(queue_data: Dict[str, Any], current_user: User = Depends(require_admin)):
    """Create a new queue."""
    tenant_id = current_user.tenant_id
    name = queue_data.get("name")
    
    if not name:
        raise HTTPException(status_code=400, detail="Queue name required")
    
    existing = await db.queues.find_one({
        "tenant_id": tenant_id,
        "name": {"$regex": f"^{name}$", "$options": "i"}
    })
    if existing:
        raise HTTPException(status_code=400, detail="Queue with this name already exists")
    
    supported_objects = queue_data.get("supported_objects", [])
    if not isinstance(supported_objects, list):
        supported_objects = []
    
    now = datetime.now(timezone.utc)
    new_queue = {
        "id": str(uuid.uuid4()),
        "tenant_id": tenant_id,
        "name": name,
        "description": queue_data.get("description", ""),
        "supported_objects": supported_objects,
        "email": queue_data.get("email"),
        "created_at": now,
        "updated_at": now,
        "created_by": current_user.id
    }
    
    await db.queues.insert_one(new_queue)
    new_queue.pop("_id", None)
    new_queue["member_count"] = 0
    new_queue["members"] = []
    
    logger.info(f"Created queue: {name} by user {current_user.id}")
    return new_queue


@router.put("/queues/{queue_id}")
async def update_queue(queue_id: str, queue_data: Dict[str, Any], current_user: User = Depends(require_admin)):
    """Update an existing queue."""
    tenant_id = current_user.tenant_id
    
    queue = await db.queues.find_one({"id": queue_id, "tenant_id": tenant_id})
    if not queue:
        raise HTTPException(status_code=404, detail="Queue not found")
    
    new_name = queue_data.get("name")
    if new_name and new_name != queue.get("name"):
        existing = await db.queues.find_one({
            "tenant_id": tenant_id,
            "name": {"$regex": f"^{new_name}$", "$options": "i"},
            "id": {"$ne": queue_id}
        })
        if existing:
            raise HTTPException(status_code=400, detail="Queue with this name already exists")
    
    update_data = {"updated_at": datetime.now(timezone.utc)}
    
    if "name" in queue_data:
        update_data["name"] = queue_data["name"]
    if "description" in queue_data:
        update_data["description"] = queue_data["description"]
    if "supported_objects" in queue_data:
        update_data["supported_objects"] = queue_data["supported_objects"]
    if "email" in queue_data:
        update_data["email"] = queue_data["email"]
    
    await db.queues.update_one(
        {"id": queue_id, "tenant_id": tenant_id},
        {"$set": update_data}
    )
    
    updated_queue = await db.queues.find_one({"id": queue_id, "tenant_id": tenant_id}, {"_id": 0})
    member_count = await db.queue_members.count_documents({"queue_id": queue_id})
    updated_queue["member_count"] = member_count
    
    logger.info(f"Updated queue: {queue_id} by user {current_user.id}")
    return updated_queue


@router.delete("/queues/{queue_id}")
async def delete_queue(queue_id: str, current_user: User = Depends(require_admin)):
    """Delete a queue."""
    tenant_id = current_user.tenant_id
    
    queue = await db.queues.find_one({"id": queue_id, "tenant_id": tenant_id})
    if not queue:
        raise HTTPException(status_code=404, detail="Queue not found")
    
    await db.queue_members.delete_many({"queue_id": queue_id})
    await db.queues.delete_one({"id": queue_id, "tenant_id": tenant_id})
    
    logger.info(f"Deleted queue: {queue_id} by user {current_user.id}")
    return {"message": "Queue deleted successfully"}


@router.get("/queues/{queue_id}/members")
async def get_queue_members(queue_id: str, current_user: User = Depends(get_current_user)):
    """Get all members of a queue."""
    tenant_id = current_user.tenant_id
    
    queue = await db.queues.find_one({"id": queue_id, "tenant_id": tenant_id})
    if not queue:
        raise HTTPException(status_code=404, detail="Queue not found")
    
    members = await db.queue_members.find(
        {"queue_id": queue_id},
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
        elif member["member_type"] == "group":
            group = await db.groups.find_one(
                {"id": member["member_id"]},
                {"_id": 0, "id": 1, "name": 1, "group_type": 1}
            )
            if group:
                member_info["name"] = group.get("name")
                member_info["group_type"] = group.get("group_type")
        enriched_members.append(member_info)
    
    return enriched_members


@router.post("/queues/{queue_id}/members")
async def add_queue_member(
    queue_id: str,
    member_data: QueueMemberRequest,
    current_user: User = Depends(require_admin)
):
    """Add a member (user, role, or group) to a queue."""
    tenant_id = current_user.tenant_id
    
    queue = await db.queues.find_one({"id": queue_id, "tenant_id": tenant_id})
    if not queue:
        raise HTTPException(status_code=404, detail="Queue not found")
    
    member_type = member_data.member_type
    member_id = member_data.member_id
    
    if member_type not in ["user", "role", "group"]:
        raise HTTPException(status_code=400, detail="Invalid member type. Must be 'user', 'role', or 'group'")
    
    if member_type == "user":
        user = await db.users.find_one({"id": member_id, "tenant_id": tenant_id})
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
    elif member_type == "role":
        role = await db.roles.find_one({"id": member_id})
        if not role:
            raise HTTPException(status_code=404, detail="Role not found")
    else:
        group = await db.groups.find_one({"id": member_id, "tenant_id": tenant_id})
        if not group:
            raise HTTPException(status_code=404, detail="Group not found")
    
    existing = await db.queue_members.find_one({
        "queue_id": queue_id,
        "member_type": member_type,
        "member_id": member_id
    })
    if existing:
        raise HTTPException(status_code=400, detail="Already a member of this queue")
    
    new_member = {
        "id": str(uuid.uuid4()),
        "queue_id": queue_id,
        "member_type": member_type,
        "member_id": member_id,
        "added_at": datetime.now(timezone.utc),
        "added_by": current_user.id
    }
    
    await db.queue_members.insert_one(new_member)
    
    logger.info(f"Added {member_type} {member_id} to queue {queue_id} by {current_user.id}")
    return {"message": "Member added successfully", "member_id": new_member["id"]}


@router.delete("/queues/{queue_id}/members/{member_id}")
async def remove_queue_member(
    queue_id: str,
    member_id: str,
    current_user: User = Depends(require_admin)
):
    """Remove a member from a queue."""
    tenant_id = current_user.tenant_id
    
    queue = await db.queues.find_one({"id": queue_id, "tenant_id": tenant_id})
    if not queue:
        raise HTTPException(status_code=404, detail="Queue not found")
    
    result = await db.queue_members.delete_one({
        "id": member_id,
        "queue_id": queue_id
    })
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Member not found in this queue")
    
    logger.info(f"Removed member {member_id} from queue {queue_id} by {current_user.id}")
    return {"message": "Member removed successfully"}


@router.get("/queue-objects")
async def get_available_objects(current_user: User = Depends(get_current_user)):
    """Get list of available objects for queue and sharing rule configuration.
    
    Dynamically loads all objects from tenant_objects (standard + custom objects)
    to ensure the list stays synchronized with Object Manager.
    """
    try:
        tenant_id = current_user.tenant_id
        
        tenant_objects = await db.tenant_objects.find(
            {"tenant_id": tenant_id},
            {"_id": 0, "object_name": 1, "object_label": 1, "is_custom": 1, "object_type": 1, "is_active": 1}
        ).to_list(500)
        
        schema_objects = await db.schema_objects.find(
            {"tenant_id": tenant_id, "is_active": True},
            {"_id": 0, "api_name": 1, "label": 1}
        ).to_list(100)
        
        existing_names = set()
        all_objects = []
        
        for obj in tenant_objects:
            obj_name = obj.get("object_name", "").lower()
            if obj_name and obj_name not in existing_names:
                existing_names.add(obj_name)
                all_objects.append({
                    "name": obj_name,
                    "label": obj.get("object_label", obj_name.title()),
                    "api_name": obj_name,
                    "is_custom": obj.get("is_custom", obj.get("object_type") == "custom")
                })
        
        for obj in schema_objects:
            obj_name = obj.get("api_name", "").lower()
            if obj_name and obj_name not in existing_names:
                existing_names.add(obj_name)
                all_objects.append({
                    "name": obj_name,
                    "label": obj.get("label", obj_name.title()),
                    "api_name": obj_name,
                    "is_custom": True
                })
        
        all_objects.sort(key=lambda x: x.get("label", "").lower())
        
        return all_objects
    except Exception as e:
        logger.error(f"Error fetching available objects: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch available objects")
