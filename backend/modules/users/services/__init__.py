"""
Users Module Services
Business logic for user, role, and permission operations.
"""
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List, Optional, Tuple
import uuid
import logging

from config.database import db

logger = logging.getLogger(__name__)

# Predefined role IDs
ROLE_SYSTEM_ADMIN = "system_administrator"
ROLE_STANDARD_USER = "standard_user"


async def check_permission(
    current_user,
    object_name: str,
    action: str
) -> bool:
    """
    Check if user has permission to perform action on object.
    
    ARCHITECTURE (Salesforce-style, role-decoupled):
    1. Super Admin bypass - full access to everything
    2. Aggregated permission check from:
       - Direct permission set assignments (user.permission_set_ids)
       - Direct assignments via user_permission_sets collection
       - Permission sets via bundles
    3. Uses "most permissive wins" rule
    4. DEFAULT: DENY ALL - If no permission defined, access is denied
    
    NOTE: Role-based permission sets are NO LONGER used.
    Roles only control record visibility via hierarchy.
    
    Performance: Uses in-memory cache with 5-minute TTL
    """
    from modules.users.services.permission_cache import check_object_permission
    
    try:
        # Step 1: Super Admin bypass - immediate grant (check attribute first for speed)
        if getattr(current_user, 'is_super_admin', False):
            logger.debug(f"Super Admin {current_user.email} - bypassing permission check for {action} on {object_name}")
            return True
        
        # Step 2: Check aggregated permissions using cache
        has_permission, reason = await check_object_permission(
            tenant_id=current_user.tenant_id,
            user_id=current_user.id,
            object_name=object_name,
            action=action,
            is_super_admin=getattr(current_user, 'is_super_admin', False)
        )
        
        if has_permission:
            logger.debug(f"Permission granted for {current_user.email}: {action} on {object_name} (reason: {reason})")
            return True
        
        # Permission denied - provide detailed error message
        from fastapi import HTTPException
        action_name = action.capitalize()
        
        if reason == "no_permission_sets_assigned":
            detail = "Access denied. You have no permission sets assigned. Contact your administrator."
        elif reason == "no_object_permission_defined":
            detail = f"Access denied. You don't have permissions for {object_name}. Contact your administrator."
        elif reason == "object_not_visible":
            detail = f"Access denied. The {object_name} object is not available to you."
        else:
            detail = f"Access denied. You don't have permission to {action_name} {object_name} records."
        
        raise HTTPException(status_code=403, detail=detail)
        
    except Exception as e:
        if "HTTPException" in str(type(e)):
            raise
        logger.error(f"Error checking permission: {str(e)}")
        # On error, DENY access for security
        from fastapi import HTTPException
        raise HTTPException(
            status_code=403,
            detail="Access denied. Permission check failed."
        )


# Legacy permission check removed - no longer used
# Roles only control hierarchy visibility, not object permissions


async def log_audit_event(
    tenant_id: str,
    event_type: str,
    action: str,
    actor_user_id: Optional[str] = None,
    actor_email: Optional[str] = None,
    target_user_id: Optional[str] = None,
    target_email: Optional[str] = None,
    object_name: Optional[str] = None,
    record_id: Optional[str] = None,
    details: Optional[Dict[str, Any]] = None,
    ip_address: Optional[str] = None
):
    """Log audit event to database (non-blocking)."""
    try:
        audit_event = {
            "id": str(uuid.uuid4()),
            "tenant_id": tenant_id,
            "event_type": event_type,
            "action": action,
            "actor_user_id": actor_user_id,
            "actor_email": actor_email,
            "target_user_id": target_user_id,
            "target_email": target_email,
            "object_name": object_name,
            "record_id": record_id,
            "details": details or {},
            "ip_address": ip_address,
            "timestamp": datetime.now(timezone.utc)
        }
        await db.audit_events.insert_one(audit_event)
    except Exception as e:
        logger.error(f"Failed to log audit event: {str(e)}")


async def get_subordinate_user_ids(current_user) -> List[str]:
    """Get all subordinate users in role hierarchy."""
    try:
        if not current_user.role_id:
            return []
        
        current_role = await db.roles.find_one({"id": current_user.role_id}, {"_id": 0})
        if not current_role:
            return []
        
        subordinate_roles = []
        
        async def get_child_roles(parent_id):
            children = await db.roles.find({"parent_role_id": parent_id}, {"_id": 0}).to_list(100)
            for child in children:
                subordinate_roles.append(child["id"])
                await get_child_roles(child["id"])
        
        await get_child_roles(current_user.role_id)
        
        if not subordinate_roles:
            return []
        
        subordinate_users = await db.users.find({
            "tenant_id": current_user.tenant_id,
            "role_id": {"$in": subordinate_roles}
        }, {"_id": 0, "id": 1}).to_list(1000)
        
        return [user["id"] for user in subordinate_users]
        
    except Exception as e:
        logger.error(f"Error getting subordinates: {str(e)}")
        return []


async def seed_roles():
    """Seed predefined roles if they don't exist."""
    try:
        existing_roles = await db.roles.count_documents({})
        
        if existing_roles == 0:
            admin_role = {
                "id": ROLE_SYSTEM_ADMIN,
                "name": "System Administrator",
                "description": "Full access to all features including Setup, Object Manager, and user management",
                "is_system_role": True,
                "created_at": datetime.now(timezone.utc)
            }
            
            standard_role = {
                "id": ROLE_STANDARD_USER,
                "name": "Standard User",
                "description": "Access to CRM features. Cannot access Setup or modify system configuration",
                "is_system_role": True,
                "created_at": datetime.now(timezone.utc)
            }
            
            await db.roles.insert_many([admin_role, standard_role])
            logger.info("✅ Roles seeded successfully")
        else:
            logger.info(f"✅ Roles already exist ({existing_roles} roles found)")
    except Exception as e:
        logger.error(f"❌ Error seeding roles: {str(e)}")


async def seed_permission_sets():
    """Seed default permission sets for system roles."""
    try:
        existing_perms = await db.permission_sets.count_documents({})
        
        if existing_perms > 0:
            logger.info(f"✅ Permission sets already exist ({existing_perms} found)")
            return
        
        standard_objects = ["lead", "contact", "account", "opportunity", "task", "event"]
        
        admin_permissions = [
            {
                "object_name": obj,
                "create": True, "read": True, "edit": True, "delete": True,
                "view_all": True, "modify_all": True
            }
            for obj in standard_objects
        ]
        
        admin_permission_set = {
            "id": f"permset_{ROLE_SYSTEM_ADMIN}",
            "role_id": ROLE_SYSTEM_ADMIN,
            "role_name": "System Administrator",
            "permissions": admin_permissions,
            "is_system_permission_set": True,
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc)
        }
        
        standard_permissions = [
            {
                "object_name": obj,
                "create": True, "read": True, "edit": True, "delete": False,
                "view_all": False, "modify_all": False
            }
            for obj in standard_objects
        ]
        
        standard_permission_set = {
            "id": f"permset_{ROLE_STANDARD_USER}",
            "role_id": ROLE_STANDARD_USER,
            "role_name": "Standard User",
            "permissions": standard_permissions,
            "is_system_permission_set": True,
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc)
        }
        
        await db.permission_sets.insert_many([admin_permission_set, standard_permission_set])
        logger.info("✅ Permission sets seeded successfully")
        
    except Exception as e:
        logger.error(f"❌ Error seeding permission sets: {str(e)}")


async def seed_organization_wide_defaults():
    """Seed default OWD settings for standard objects."""
    try:
        tenants = await db.tenants.find({}, {"_id": 0}).to_list(None)
        
        for tenant in tenants:
            tenant_id = tenant["id"]
            standard_objects = ["lead", "contact", "account", "opportunity", "task", "event"]
            
            for obj_name in standard_objects:
                existing_owd = await db.organization_wide_defaults.find_one({
                    "tenant_id": tenant_id,
                    "object_name": obj_name
                })
                
                if not existing_owd:
                    default_access = "public_read_write" if obj_name in ["task", "event"] else "private"
                    
                    owd = {
                        "id": str(uuid.uuid4()),
                        "tenant_id": tenant_id,
                        "object_name": obj_name,
                        "default_access": default_access,
                        "grant_access_using_hierarchies": True,
                        "created_at": datetime.now(timezone.utc),
                        "updated_at": datetime.now(timezone.utc)
                    }
                    await db.organization_wide_defaults.insert_one(owd)
        
        logger.info("✅ Organization-Wide Defaults seeded")
    except Exception as e:
        logger.error(f"❌ Error seeding OWD: {str(e)}")


async def check_record_access(
    current_user,
    object_name: str,
    record: dict,
    access_level: str = "read"
) -> bool:
    """Check if user has access to a record based on sharing model."""
    try:
        # Owner always has access
        if record.get("owner_id") == current_user.id:
            return True
        
        # Get OWD settings
        owd = await db.organization_wide_defaults.find_one({
            "tenant_id": current_user.tenant_id,
            "object_name": object_name
        }, {"_id": 0})
        
        if not owd:
            return True  # Default: allow
        
        default_access = owd.get("default_access", "private")
        
        if default_access == "public_read_write":
            return True
        elif default_access == "public_read_only" and access_level == "read":
            return True
        
        # Check role hierarchy
        if owd.get("grant_access_using_hierarchies", True):
            owner_id = record.get("owner_id")
            if owner_id:
                subordinates = await get_subordinate_user_ids(current_user)
                if owner_id in subordinates:
                    return True
        
        # Check manual shares
        manual_share = await db.manual_shares.find_one({
            "tenant_id": current_user.tenant_id,
            "object_name": object_name,
            "record_id": record.get("id"),
            "shared_with_user_id": current_user.id
        })
        
        if manual_share:
            if access_level == "read":
                return True
            elif access_level == "edit" and manual_share.get("access_level") == "read_write":
                return True
        
        return False
        
    except Exception as e:
        logger.error(f"Error checking record access: {str(e)}")
        return True
