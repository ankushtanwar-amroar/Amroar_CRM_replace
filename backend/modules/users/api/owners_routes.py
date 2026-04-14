"""
Owners Module API Routes
Unified endpoint for fetching Users, Public Groups, and Queues for assignment.
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from typing import List, Dict, Any, Optional
import logging

from config.database import db
from shared.models import User
from modules.auth.api.auth_routes import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Owners"])

@router.get("/owners")
async def get_owners(
    search: Optional[str] = None,
    limit: int = 50,
    current_user: User = Depends(get_current_user)
):
    """
    Get a unified list of potential record owners: Users, Public Groups, and Queues.
    Used by the Change Owner component.
    """
    try:
        tenant_id = current_user.tenant_id
        owners = []
        
        # 1. Fetch Users
        user_query = {"tenant_id": tenant_id, "is_active": True}
        if search:
            search_regex = {"$regex": search, "$options": "i"}
            user_query["$or"] = [
                {"first_name": search_regex},
                {"last_name": search_regex},
                {"email": search_regex}
            ]
        
        users = await db.users.find(
            user_query, 
            {"id": 1, "first_name": 1, "last_name": 1, "email": 1, "_id": 0}
        ).limit(limit).to_list(limit)

        for u in users:
            name = f"{u.get('first_name', '')} {u.get('last_name', '')}".strip() or u.get("email", "Unknown User")
            owners.append({
                "id": u["id"],
                "name": name,
                "type": "USER",
                "secondary_info": u.get("email", "")
            })

        # 2. Fetch Public Groups
        group_query = {"tenant_id": tenant_id, "group_type": "public"}
        if search:
            group_query["name"] = {"$regex": search, "$options": "i"}
            
        groups = await db.groups.find(
            group_query,
            {"id": 1, "name": 1, "description": 1, "_id": 0}
        ).limit(limit).to_list(limit)

        for g in groups:
            # Optionally count members, or just use description
            member_count = await db.group_members.count_documents({"group_id": g["id"]})
            owners.append({
                "id": g["id"],
                "name": g["name"],
                "type": "GROUP",
                "secondary_info": f"{member_count} member(s)"
            })
            
        # 3. Fetch Queues
        queue_query = {"tenant_id": tenant_id}
        if search:
            queue_query["name"] = {"$regex": search, "$options": "i"}
            
        queues = await db.queues.find(
            queue_query,
            {"id": 1, "name": 1, "_id": 0}
        ).limit(limit).to_list(limit)
        
        for q in queues:
            member_count = await db.queue_members.count_documents({"queue_id": q["id"]})
            owners.append({
                "id": q["id"],
                "name": q["name"],
                "type": "QUEUE",
                "secondary_info": f"{member_count} member(s)"
            })

        # Sort the unified list by name
        owners.sort(key=lambda x: x["name"].lower())
        
        # Apply search filtering on the combined result again just in case, and limit
        return owners[:limit]

    except Exception as e:
        logger.error(f"Error fetching unified owners: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch potential owners")

@router.get("/owners/{owner_id}")
async def get_owner_by_id(
    owner_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Get a specific owner's details, resolving type automatically.
    Used by the Record Header to show the current owner's badge.
    """
    try:
        tenant_id = current_user.tenant_id
        
        # 1. Check Users
        user = await db.users.find_one({"id": owner_id, "tenant_id": tenant_id}, {"_id": 0, "first_name": 1, "last_name": 1, "email": 1, "id": 1})
        if user:
            name = f"{user.get('first_name', '')} {user.get('last_name', '')}".strip() or user.get("email", "Unknown")
            return {
                "id": user["id"],
                "name": name,
                "type": "USER",
                "secondary_info": user.get("email", "")
            }
            
        # 2. Check Groups
        group = await db.groups.find_one({"id": owner_id, "tenant_id": tenant_id}, {"_id": 0, "name": 1, "id": 1})
        if group:
            member_count = await db.group_members.count_documents({"group_id": group["id"]})
            return {
                "id": group["id"],
                "name": group["name"],
                "type": "GROUP",
                "secondary_info": f"{member_count} member(s)"
            }
            
        # 3. Check Queues
        queue = await db.queues.find_one({"id": owner_id, "tenant_id": tenant_id}, {"_id": 0, "name": 1, "id": 1})
        if queue:
            member_count = await db.queue_members.count_documents({"queue_id": queue["id"]})
            return {
                "id": queue["id"],
                "name": queue["name"],
                "type": "QUEUE",
                "secondary_info": f"{member_count} member(s)"
            }
            
        # If not found
        return {"id": owner_id, "name": "Unknown", "type": "USER", "secondary_info": ""}
        
    except Exception as e:
        logger.error(f"Error fetching owner by ID {owner_id}: {str(e)}")
        # Don't fail the request, just return an unknown badge
        return {"id": owner_id, "name": "Unknown", "type": "USER", "secondary_info": ""}
