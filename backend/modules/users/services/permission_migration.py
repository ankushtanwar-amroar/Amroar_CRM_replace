"""
Permission Migration Service
Migrates role-based permission sets to direct user assignments.

This migration ensures no existing users lose access when we remove
role-based permission assignment.

Migration Strategy:
1. Find all users with role_id set
2. For each user, find the permission set linked to their role
3. If found, add that permission_set_id to user.permission_set_ids
4. Log the migration for audit purposes
"""
import logging
from datetime import datetime, timezone
from typing import Dict, Any, List
import uuid

from config.database import db

logger = logging.getLogger(__name__)


async def migrate_role_permissions_to_direct() -> Dict[str, Any]:
    """
    Migrate all role-based permission sets to direct user assignments.
    
    This is a one-time migration that should be run after deploying
    the new permission architecture.
    
    Returns:
        Migration summary with counts and any errors
    """
    summary = {
        "started_at": datetime.now(timezone.utc).isoformat(),
        "total_users_checked": 0,
        "users_migrated": 0,
        "users_skipped": 0,
        "users_already_have_permissions": 0,
        "errors": [],
        "migrations": []
    }
    
    try:
        # Get all users with role_id set
        users = await db.users.find(
            {"role_id": {"$ne": None, "$exists": True}},
            {"_id": 0, "id": 1, "email": 1, "role_id": 1, "permission_set_ids": 1, "tenant_id": 1}
        ).to_list(None)
        
        summary["total_users_checked"] = len(users)
        logger.info(f"Starting permission migration for {len(users)} users with roles")
        
        for user in users:
            user_id = user.get("id")
            user_email = user.get("email")
            role_id = user.get("role_id")
            tenant_id = user.get("tenant_id")
            existing_permission_set_ids = user.get("permission_set_ids", [])
            
            try:
                # Find permission set linked to this role
                role_permission_set = await db.permission_sets.find_one(
                    {"role_id": role_id},
                    {"_id": 0, "id": 1, "role_name": 1}
                )
                
                if not role_permission_set:
                    # No permission set for this role - skip
                    summary["users_skipped"] += 1
                    continue
                
                ps_id = role_permission_set.get("id")
                ps_name = role_permission_set.get("role_name", "Unknown")
                
                # Check if user already has this permission set
                if ps_id in existing_permission_set_ids:
                    summary["users_already_have_permissions"] += 1
                    continue
                
                # Check if there's already a direct assignment
                existing_assignment = await db.user_permission_sets.find_one({
                    "user_id": user_id,
                    "permission_set_id": ps_id,
                    "is_active": True
                })
                
                if existing_assignment:
                    summary["users_already_have_permissions"] += 1
                    continue
                
                # Add permission set to user.permission_set_ids
                new_permission_set_ids = existing_permission_set_ids + [ps_id]
                
                await db.users.update_one(
                    {"id": user_id},
                    {"$set": {"permission_set_ids": new_permission_set_ids}}
                )
                
                # Log the migration
                migration_record = {
                    "user_id": user_id,
                    "user_email": user_email,
                    "role_id": role_id,
                    "permission_set_id": ps_id,
                    "permission_set_name": ps_name
                }
                summary["migrations"].append(migration_record)
                summary["users_migrated"] += 1
                
                logger.info(f"Migrated user {user_email}: role '{role_id}' -> direct permission set '{ps_name}'")
                
                # Also create audit event
                audit_event = {
                    "id": str(uuid.uuid4()),
                    "tenant_id": tenant_id,
                    "event_type": "security",
                    "action": "permission_migration",
                    "target_user_id": user_id,
                    "target_email": user_email,
                    "details": {
                        "migration_type": "role_to_direct_permission_set",
                        "role_id": role_id,
                        "permission_set_id": ps_id,
                        "permission_set_name": ps_name
                    },
                    "timestamp": datetime.now(timezone.utc)
                }
                await db.audit_events.insert_one(audit_event)
                
            except Exception as e:
                error_msg = f"Error migrating user {user_email}: {str(e)}"
                summary["errors"].append(error_msg)
                logger.error(error_msg)
        
        summary["completed_at"] = datetime.now(timezone.utc).isoformat()
        summary["success"] = len(summary["errors"]) == 0
        
        logger.info(f"Permission migration completed: {summary['users_migrated']} users migrated, "
                    f"{summary['users_skipped']} skipped, "
                    f"{summary['users_already_have_permissions']} already had permissions")
        
        return summary
        
    except Exception as e:
        summary["errors"].append(f"Migration failed: {str(e)}")
        summary["success"] = False
        logger.error(f"Permission migration failed: {str(e)}")
        return summary


async def check_migration_status() -> Dict[str, Any]:
    """
    Check the current migration status.
    Returns counts of users with/without direct permission sets.
    """
    # Users with role_id but no direct permission sets
    users_needing_migration = await db.users.count_documents({
        "role_id": {"$ne": None, "$exists": True},
        "$or": [
            {"permission_set_ids": {"$exists": False}},
            {"permission_set_ids": []},
            {"permission_set_ids": None}
        ]
    })
    
    # Users with direct permission sets
    users_with_direct_permissions = await db.users.count_documents({
        "permission_set_ids": {"$exists": True},
        "$expr": {"$gt": [{"$size": {"$ifNull": ["$permission_set_ids", []]}}, 0]}
    })
    
    # Total users
    total_users = await db.users.count_documents({})
    
    # Super admins (don't need permission sets)
    super_admins = await db.users.count_documents({"is_super_admin": True})
    
    return {
        "total_users": total_users,
        "super_admins": super_admins,
        "users_with_direct_permissions": users_with_direct_permissions,
        "users_needing_migration": users_needing_migration,
        "migration_needed": users_needing_migration > 0
    }


async def add_visible_flag_to_existing_permission_sets():
    """
    Add 'visible: true' flag to all existing permission set object permissions
    that don't have it, ensuring backward compatibility.
    """
    permission_sets = await db.permission_sets.find({}, {"_id": 0}).to_list(None)
    
    updated_count = 0
    for ps in permission_sets:
        permissions = ps.get("permissions", [])
        needs_update = False
        updated_permissions = []
        
        for perm in permissions:
            if "visible" not in perm:
                perm["visible"] = True
                needs_update = True
            updated_permissions.append(perm)
        
        if needs_update:
            await db.permission_sets.update_one(
                {"id": ps.get("id")},
                {"$set": {"permissions": updated_permissions}}
            )
            updated_count += 1
    
    logger.info(f"Added 'visible' flag to {updated_count} permission sets")
    return {"updated_count": updated_count}
