"""
Security Settings Routes
Organization-Wide Defaults (OWD), User Effective Access, and Memberships.
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import Dict, Any
from datetime import datetime, timezone
import logging

from config.database import db
from shared.models import User
from modules.auth.api.auth_routes import get_current_user
from modules.users.services import log_audit_event

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Security Settings"])

# Standard CRM objects with their default OWD
STANDARD_OBJECTS = [
    {"name": "lead", "label": "Leads"},
    {"name": "contact", "label": "Contacts"},
    {"name": "account", "label": "Accounts"},
    {"name": "opportunity", "label": "Opportunities"},
    {"name": "task", "label": "Tasks"},
    {"name": "event", "label": "Events"},
    {"name": "case", "label": "Cases"},
]


@router.get("/sharing-settings")
async def get_sharing_settings(current_user: User = Depends(get_current_user)):
    """Get all OWD (Organization-Wide Default) settings for all objects."""
    try:
        existing_settings = await db.sharing_settings.find(
            {"tenant_id": current_user.tenant_id},
            {"_id": 0}
        ).to_list(None)
        
        existing_map = {s["object_name"]: s for s in existing_settings}
        
        all_settings = []
        
        for obj in STANDARD_OBJECTS:
            obj_name = obj["name"]
            if obj_name in existing_map:
                setting = existing_map[obj_name]
                setting["label"] = obj["label"]
                all_settings.append(setting)
            else:
                default_setting = {
                    "object_name": obj_name,
                    "label": obj["label"],
                    "default_internal_access": "private",
                    "default_external_access": "private",
                    "grant_access_using_hierarchies": True,
                    "tenant_id": current_user.tenant_id
                }
                all_settings.append(default_setting)
        
        for obj_name, setting in existing_map.items():
            if obj_name not in [o["name"] for o in STANDARD_OBJECTS]:
                if "label" not in setting:
                    setting["label"] = obj_name.replace("_", " ").title()
                all_settings.append(setting)
        
        return all_settings
        
    except Exception as e:
        logger.error(f"Error getting sharing settings: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to get sharing settings")


@router.put("/sharing-settings/{object_name}")
async def update_sharing_settings(
    object_name: str,
    settings: Dict[str, Any],
    current_user: User = Depends(get_current_user)
):
    """Update OWD settings for an object."""
    try:
        valid_access_levels = ["private", "public_read_only", "public_read_write"]
        internal_access = settings.get("default_internal_access", "private")
        
        if internal_access not in valid_access_levels:
            raise HTTPException(
                status_code=400, 
                detail=f"Invalid access level. Must be one of: {valid_access_levels}"
            )
        
        update_data = {
            "object_name": object_name,
            "tenant_id": current_user.tenant_id,
            "default_internal_access": internal_access,
            "default_external_access": settings.get("default_external_access", "private"),
            "grant_access_using_hierarchies": settings.get("grant_access_using_hierarchies", True),
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "updated_by": current_user.id
        }
        
        await db.sharing_settings.update_one(
            {"tenant_id": current_user.tenant_id, "object_name": object_name},
            {"$set": update_data},
            upsert=True
        )
        
        await log_audit_event(
            current_user.tenant_id,
            current_user.id,
            "sharing_settings_updated",
            "sharing_settings",
            object_name,
            {"internal_access": internal_access, "hierarchy": update_data["grant_access_using_hierarchies"]}
        )
        
        logger.info(f"Sharing settings updated for {object_name} by {current_user.id}: {internal_access}")
        
        return {"message": "Sharing settings updated successfully", **update_data}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating sharing settings: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to update sharing settings")


@router.get("/sharing-settings/{object_name}")
async def get_object_sharing_settings(
    object_name: str,
    current_user: User = Depends(get_current_user)
):
    """Get OWD settings for a specific object."""
    try:
        setting = await db.sharing_settings.find_one(
            {"tenant_id": current_user.tenant_id, "object_name": object_name},
            {"_id": 0}
        )
        
        if not setting:
            return {
                "object_name": object_name,
                "default_internal_access": "private",
                "default_external_access": "private",
                "grant_access_using_hierarchies": True
            }
        
        return setting
        
    except Exception as e:
        logger.error(f"Error getting object sharing settings: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to get object sharing settings")


@router.get("/users/{user_id}/effective-access")
async def get_user_effective_access(user_id: str, current_user: User = Depends(get_current_user)):
    """Get the effective access summary for a user, including all permission sources."""
    try:
        user = await db.users.find_one({
            "id": user_id,
            "tenant_id": current_user.tenant_id
        }, {"_id": 0})
        
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        effective_access = {
            "user_id": user_id,
            "user_email": user.get("email"),
            "user_name": f"{user.get('first_name', '')} {user.get('last_name', '')}".strip(),
            "role": None,
            "permission_sets": [],
            "access_bundles": [],
            "groups": [],
            "queues": [],
            "sharing_rules_applicable": [],
            "effective_permissions": {}
        }
        
        # 1. Get Role information
        role_id = user.get("role_id")
        if role_id:
            role = await db.roles.find_one({"id": role_id}, {"_id": 0})
            if role:
                effective_access["role"] = {
                    "id": role.get("id"),
                    "name": role.get("name"),
                    "data_visibility": role.get("data_visibility", "own_only"),
                    "parent_role_id": role.get("parent_role_id")
                }
        
        # 2. Get Permission Sets (from role)
        if role_id:
            perm_set = await db.permission_sets.find_one({"role_id": role_id}, {"_id": 0})
            if perm_set:
                effective_access["permission_sets"].append({
                    "id": perm_set.get("id"),
                    "role_name": perm_set.get("role_name"),
                    "source": "role",
                    "permissions": perm_set.get("permissions", [])
                })
        
        # 3. Get Access Bundles assigned to user
        bundle_assignments = await db.user_access_bundles.find(
            {"user_id": user_id},
            {"_id": 0}
        ).to_list(None)
        
        bundle_ids = [a["bundle_id"] for a in bundle_assignments]
        if bundle_ids:
            bundles = await db.access_bundles.find(
                {"id": {"$in": bundle_ids}, "is_active": True},
                {"_id": 0}
            ).to_list(None)
            
            for bundle in bundles:
                bundle_info = {
                    "id": bundle.get("id"),
                    "name": bundle.get("name"),
                    "permission_sets": []
                }
                
                perm_set_ids = bundle.get("permission_set_ids", [])
                if perm_set_ids:
                    perm_sets = await db.permission_sets.find(
                        {"id": {"$in": perm_set_ids}},
                        {"_id": 0}
                    ).to_list(None)
                    
                    for ps in perm_sets:
                        bundle_info["permission_sets"].append({
                            "id": ps.get("id"),
                            "role_name": ps.get("role_name"),
                            "permissions": ps.get("permissions", [])
                        })
                        effective_access["permission_sets"].append({
                            "id": ps.get("id"),
                            "role_name": ps.get("role_name"),
                            "source": f"bundle:{bundle.get('name')}",
                            "permissions": ps.get("permissions", [])
                        })
                
                effective_access["access_bundles"].append(bundle_info)
        
        # 4. Get Group memberships
        group_memberships = await db.group_members.find(
            {"member_type": "user", "member_id": user_id},
            {"_id": 0, "group_id": 1}
        ).to_list(None)
        
        group_ids = [m["group_id"] for m in group_memberships]
        
        if role_id:
            role_group_memberships = await db.group_members.find(
                {"member_type": "role", "member_id": role_id},
                {"_id": 0, "group_id": 1}
            ).to_list(None)
            group_ids.extend([m["group_id"] for m in role_group_memberships])
        
        if group_ids:
            groups = await db.groups.find(
                {"id": {"$in": list(set(group_ids))}, "tenant_id": current_user.tenant_id},
                {"_id": 0, "id": 1, "name": 1, "group_type": 1}
            ).to_list(None)
            effective_access["groups"] = groups
        
        # 5. Get Queue memberships
        queue_memberships = await db.queue_members.find(
            {"member_type": "user", "member_id": user_id},
            {"_id": 0, "queue_id": 1}
        ).to_list(None)
        
        queue_ids = [m["queue_id"] for m in queue_memberships]
        
        if role_id:
            role_queue_memberships = await db.queue_members.find(
                {"member_type": "role", "member_id": role_id},
                {"_id": 0, "queue_id": 1}
            ).to_list(None)
            queue_ids.extend([m["queue_id"] for m in role_queue_memberships])
        
        if group_ids:
            group_queue_memberships = await db.queue_members.find(
                {"member_type": "group", "member_id": {"$in": group_ids}},
                {"_id": 0, "queue_id": 1}
            ).to_list(None)
            queue_ids.extend([m["queue_id"] for m in group_queue_memberships])
        
        if queue_ids:
            queues = await db.queues.find(
                {"id": {"$in": list(set(queue_ids))}, "tenant_id": current_user.tenant_id},
                {"_id": 0, "id": 1, "name": 1, "supported_objects": 1}
            ).to_list(None)
            effective_access["queues"] = queues
        
        # 6. Get applicable sharing rules
        sharing_rules_query = {
            "tenant_id": current_user.tenant_id,
            "is_active": True,
            "$or": []
        }
        
        if role_id:
            sharing_rules_query["$or"].append({"share_with_type": "role", "share_with_id": role_id})
        
        for group_id in group_ids:
            sharing_rules_query["$or"].append({"share_with_type": "group", "share_with_id": group_id})
        
        for queue_id in queue_ids:
            sharing_rules_query["$or"].append({"share_with_type": "queue", "share_with_id": queue_id})
        
        if sharing_rules_query["$or"]:
            sharing_rules = await db.sharing_rules.find(
                sharing_rules_query,
                {"_id": 0, "id": 1, "name": 1, "object_name": 1, "rule_type": 1, "access_level": 1, "share_with_type": 1}
            ).to_list(None)
            effective_access["sharing_rules_applicable"] = sharing_rules
        
        # 7. Compute effective permissions by object
        all_permissions = {}
        for perm_set in effective_access["permission_sets"]:
            for perm in perm_set.get("permissions", []):
                obj_name = perm.get("object_name")
                if obj_name not in all_permissions:
                    all_permissions[obj_name] = {
                        "create": False,
                        "read": False,
                        "update": False,
                        "delete": False,
                        "view_all": False,
                        "modify_all": False,
                        "sources": []
                    }
                
                for action in ["create", "read", "update", "delete", "view_all", "modify_all"]:
                    if perm.get(action):
                        all_permissions[obj_name][action] = True
                
                all_permissions[obj_name]["sources"].append(perm_set.get("source", "unknown"))
        
        effective_access["effective_permissions"] = all_permissions
        
        return effective_access
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting user effective access: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to get user effective access")


@router.get("/users/{user_id}/memberships")
async def get_user_memberships(user_id: str, current_user: User = Depends(get_current_user)):
    """Get all group and queue memberships for a user."""
    try:
        user = await db.users.find_one({
            "id": user_id,
            "tenant_id": current_user.tenant_id
        }, {"_id": 0, "id": 1, "role_id": 1})
        
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        memberships = {
            "groups": [],
            "queues": []
        }
        
        # Get direct group memberships
        group_memberships = await db.group_members.find(
            {"member_type": "user", "member_id": user_id},
            {"_id": 0}
        ).to_list(None)
        
        for gm in group_memberships:
            group = await db.groups.find_one(
                {"id": gm["group_id"], "tenant_id": current_user.tenant_id},
                {"_id": 0, "id": 1, "name": 1, "group_type": 1}
            )
            if group:
                memberships["groups"].append({
                    **group,
                    "membership_type": "direct"
                })
        
        # Get role-based group memberships
        role_id = user.get("role_id")
        if role_id:
            role_group_memberships = await db.group_members.find(
                {"member_type": "role", "member_id": role_id},
                {"_id": 0}
            ).to_list(None)
            
            for rgm in role_group_memberships:
                group = await db.groups.find_one(
                    {"id": rgm["group_id"], "tenant_id": current_user.tenant_id},
                    {"_id": 0, "id": 1, "name": 1, "group_type": 1}
                )
                if group and not any(g["id"] == group["id"] for g in memberships["groups"]):
                    memberships["groups"].append({
                        **group,
                        "membership_type": "via_role"
                    })
        
        # Get direct queue memberships
        queue_memberships = await db.queue_members.find(
            {"member_type": "user", "member_id": user_id},
            {"_id": 0}
        ).to_list(None)
        
        for qm in queue_memberships:
            queue = await db.queues.find_one(
                {"id": qm["queue_id"], "tenant_id": current_user.tenant_id},
                {"_id": 0, "id": 1, "name": 1, "supported_objects": 1}
            )
            if queue:
                memberships["queues"].append({
                    **queue,
                    "membership_type": "direct"
                })
        
        # Get role-based queue memberships
        if role_id:
            role_queue_memberships = await db.queue_members.find(
                {"member_type": "role", "member_id": role_id},
                {"_id": 0}
            ).to_list(None)
            
            for rqm in role_queue_memberships:
                queue = await db.queues.find_one(
                    {"id": rqm["queue_id"], "tenant_id": current_user.tenant_id},
                    {"_id": 0, "id": 1, "name": 1, "supported_objects": 1}
                )
                if queue and not any(q["id"] == queue["id"] for q in memberships["queues"]):
                    memberships["queues"].append({
                        **queue,
                        "membership_type": "via_role"
                    })
        
        # Get group-based queue memberships
        group_ids = [g["id"] for g in memberships["groups"]]
        if group_ids:
            group_queue_memberships = await db.queue_members.find(
                {"member_type": "group", "member_id": {"$in": group_ids}},
                {"_id": 0}
            ).to_list(None)
            
            for gqm in group_queue_memberships:
                queue = await db.queues.find_one(
                    {"id": gqm["queue_id"], "tenant_id": current_user.tenant_id},
                    {"_id": 0, "id": 1, "name": 1, "supported_objects": 1}
                )
                if queue and not any(q["id"] == queue["id"] for q in memberships["queues"]):
                    memberships["queues"].append({
                        **queue,
                        "membership_type": "via_group"
                    })
        
        return memberships
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting user memberships: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to get user memberships")
