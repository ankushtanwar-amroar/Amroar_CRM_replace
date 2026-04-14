"""
Permission Cache Service
Provides cached permission aggregation for high-performance permission checks.

Features:
- In-memory caching with TTL
- Immediate invalidation on permission changes
- Aggregates permissions from: direct assignments and bundles ONLY
- Uses "most permissive wins" rule
- Default behavior: DENY ALL (if no permission sets, no access)

NOTE: Role-based permission sets are NO LONGER used.
Roles only control record visibility via hierarchy.
"""
import asyncio
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List, Optional, Set, Tuple
import logging

from config.database import db

logger = logging.getLogger(__name__)

# Cache configuration
CACHE_TTL_SECONDS = 300  # 5 minutes default TTL
CACHE_MAX_SIZE = 10000   # Maximum cached users

# In-memory permission cache
# Structure: {
#   "tenant_id:user_id": {
#       "computed_at": datetime,
#       "expires_at": datetime,
#       "is_super_admin": bool,
#       "object_permissions": { "lead": {...}, "contact": {...} },
#       "system_permissions": { "export_reports": True, ... },
#       "permission_sources": [...]
#   }
# }
_permission_cache: Dict[str, Dict[str, Any]] = {}
_cache_lock = asyncio.Lock()


def _get_cache_key(tenant_id: str, user_id: str) -> str:
    """Generate cache key for a user."""
    return f"{tenant_id}:{user_id}"


async def invalidate_user_permission_cache(tenant_id: str, user_id: str):
    """
    Invalidate cached permissions for a specific user.
    Called when:
    - User's permission set assignment changes
    - User's bundle assignment changes
    - User's role changes
    - User's is_super_admin changes
    """
    cache_key = _get_cache_key(tenant_id, user_id)
    async with _cache_lock:
        if cache_key in _permission_cache:
            del _permission_cache[cache_key]
            logger.debug(f"Permission cache invalidated for user {user_id}")


async def invalidate_permission_set_cache(tenant_id: str, permission_set_id: str):
    """
    Invalidate cache for all users who have a specific permission set.
    Called when a permission set definition is modified.
    """
    # Find all users with this permission set (direct or via bundle)
    affected_users = set()
    
    # Direct assignments
    direct_assignments = await db.user_permission_sets.find({
        "permission_set_id": permission_set_id,
        "is_active": True
    }, {"_id": 0, "user_id": 1, "tenant_id": 1}).to_list(None)
    
    for assignment in direct_assignments:
        affected_users.add(_get_cache_key(assignment["tenant_id"], assignment["user_id"]))
    
    # Bundle assignments (find bundles containing this permission set)
    bundles = await db.access_bundles.find({
        "permission_set_ids": permission_set_id,
        "is_active": True
    }, {"_id": 0, "id": 1}).to_list(None)
    
    bundle_ids = [b["id"] for b in bundles]
    if bundle_ids:
        bundle_assignments = await db.user_access_bundles.find({
            "bundle_id": {"$in": bundle_ids}
        }, {"_id": 0, "user_id": 1}).to_list(None)
        
        for ba in bundle_assignments:
            # Need to get tenant_id for these users
            user = await db.users.find_one({"id": ba["user_id"]}, {"_id": 0, "tenant_id": 1})
            if user:
                affected_users.add(_get_cache_key(user["tenant_id"], ba["user_id"]))
    
    # Role-based (find users with roles that have this permission set)
    permission_set = await db.permission_sets.find_one(
        {"id": permission_set_id},
        {"_id": 0, "role_id": 1}
    )
    
    if permission_set and permission_set.get("role_id"):
        role_users = await db.users.find({
            "role_id": permission_set["role_id"]
        }, {"_id": 0, "id": 1, "tenant_id": 1}).to_list(None)
        
        for user in role_users:
            affected_users.add(_get_cache_key(user["tenant_id"], user["id"]))
    
    # Invalidate all affected users
    async with _cache_lock:
        for cache_key in affected_users:
            if cache_key in _permission_cache:
                del _permission_cache[cache_key]
    
    logger.info(f"Permission cache invalidated for {len(affected_users)} users due to permission set {permission_set_id} change")


async def invalidate_bundle_cache(tenant_id: str, bundle_id: str):
    """
    Invalidate cache for all users who have a specific bundle.
    Called when a bundle definition is modified.
    """
    bundle_assignments = await db.user_access_bundles.find({
        "bundle_id": bundle_id
    }, {"_id": 0, "user_id": 1}).to_list(None)
    
    async with _cache_lock:
        for ba in bundle_assignments:
            cache_key = _get_cache_key(tenant_id, ba["user_id"])
            if cache_key in _permission_cache:
                del _permission_cache[cache_key]
    
    logger.debug(f"Permission cache invalidated for {len(bundle_assignments)} users due to bundle {bundle_id} change")


async def invalidate_tenant_cache(tenant_id: str):
    """
    Invalidate cache for all users in a tenant.
    Called when sharing rules or OWD settings change.
    """
    async with _cache_lock:
        keys_to_delete = [k for k in _permission_cache.keys() if k.startswith(f"{tenant_id}:")]
        for key in keys_to_delete:
            del _permission_cache[key]
    
    logger.info(f"Permission cache invalidated for all users in tenant {tenant_id}")


async def get_effective_permissions(
    tenant_id: str,
    user_id: str,
    force_refresh: bool = False
) -> Dict[str, Any]:
    """
    Get aggregated effective permissions for a user.
    Uses cache when available, otherwise computes and caches.
    
    Returns:
    {
        "is_super_admin": bool,
        "object_permissions": { 
            "lead": {"create": True, "read": True, ...},
            ...
        },
        "system_permissions": { "export_reports": True, ... },
        "permission_sources": [
            {"type": "direct", "id": "...", "name": "..."},
            ...
        ],
        "computed_at": datetime,
        "from_cache": bool
    }
    """
    cache_key = _get_cache_key(tenant_id, user_id)
    
    # Check cache first (unless force refresh)
    if not force_refresh:
        async with _cache_lock:
            if cache_key in _permission_cache:
                cached = _permission_cache[cache_key]
                if cached["expires_at"] > datetime.now(timezone.utc):
                    cached["from_cache"] = True
                    return cached
    
    # Compute permissions
    effective = await _compute_effective_permissions(tenant_id, user_id)
    
    # Cache the result
    now = datetime.now(timezone.utc)
    effective["computed_at"] = now
    effective["expires_at"] = now + timedelta(seconds=CACHE_TTL_SECONDS)
    effective["from_cache"] = False
    
    async with _cache_lock:
        # Enforce max cache size (LRU-style eviction)
        if len(_permission_cache) >= CACHE_MAX_SIZE:
            # Remove oldest 10% of entries
            sorted_keys = sorted(
                _permission_cache.keys(),
                key=lambda k: _permission_cache[k].get("computed_at", datetime.min.replace(tzinfo=timezone.utc))
            )
            for key in sorted_keys[:CACHE_MAX_SIZE // 10]:
                del _permission_cache[key]
        
        _permission_cache[cache_key] = effective
    
    return effective


async def _compute_effective_permissions(tenant_id: str, user_id: str) -> Dict[str, Any]:
    """
    Compute effective permissions by aggregating all sources.
    Uses "most permissive wins" rule.
    
    Permission sources (in order of evaluation):
    1. Direct permission set assignments (user.permission_set_ids)
    2. Permission sets via user_permission_sets collection (legacy direct assignments)
    3. Permission sets via bundles (access_bundles)
    
    NOTE: Role-based permission sets are NO LONGER used.
    Roles only control record visibility via hierarchy.
    """
    # Get user
    user = await db.users.find_one({
        "id": user_id,
        "tenant_id": tenant_id
    }, {"_id": 0})
    
    if not user:
        return {
            "is_super_admin": False,
            "object_permissions": {},
            "system_permissions": {},
            "permission_sources": [],
            "error": "User not found"
        }
    
    result = {
        "is_super_admin": user.get("is_super_admin", False),
        "object_permissions": {},
        "system_permissions": {},
        "permission_sources": []
    }
    
    # If super admin, no need to compute further - they have full access
    if result["is_super_admin"]:
        return result
    
    # Collect all permission sets from all sources
    all_permission_sets = []
    
    # Source 1: Direct permission set IDs on user document (new model)
    user_permission_set_ids = user.get("permission_set_ids", [])
    if user_permission_set_ids:
        for ps_id in user_permission_set_ids:
            ps = await db.permission_sets.find_one({"id": ps_id}, {"_id": 0})
            if ps:
                all_permission_sets.append(ps)
                result["permission_sources"].append({
                    "type": "direct",
                    "permission_set_id": ps.get("id"),
                    "name": ps.get("name") or ps.get("role_name", "Unnamed")
                })
    
    # Source 2: Direct user permission set assignments (user_permission_sets collection)
    direct_assignments = await db.user_permission_sets.find({
        "user_id": user_id,
        "is_active": True
    }, {"_id": 0}).to_list(None)
    
    for assignment in direct_assignments:
        ps_id = assignment.get("permission_set_id")
        # Skip if already included from user.permission_set_ids
        if ps_id in user_permission_set_ids:
            continue
        ps = await db.permission_sets.find_one(
            {"id": ps_id},
            {"_id": 0}
        )
        if ps:
            all_permission_sets.append(ps)
            result["permission_sources"].append({
                "type": "direct_assignment",
                "permission_set_id": ps.get("id"),
                "name": ps.get("name") or ps.get("role_name", "Unnamed")
            })
    
    # Source 3: Permission sets via bundles (access_bundles)
    bundle_assignments = await db.user_access_bundles.find({
        "user_id": user_id
    }, {"_id": 0}).to_list(None)
    
    for ba in bundle_assignments:
        bundle = await db.access_bundles.find_one({
            "id": ba["bundle_id"],
            "is_active": True
        }, {"_id": 0})
        
        if bundle:
            for ps_id in bundle.get("permission_set_ids", []):
                ps = await db.permission_sets.find_one({"id": ps_id}, {"_id": 0})
                if ps:
                    all_permission_sets.append(ps)
                    result["permission_sources"].append({
                        "type": "bundle",
                        "bundle_id": bundle.get("id"),
                        "bundle_name": bundle.get("name"),
                        "permission_set_id": ps.get("id"),
                        "name": ps.get("name") or ps.get("role_name", "Unnamed")
                    })
    
    # NOTE: Role-based permission sets are NO LONGER included
    # Roles only control hierarchy visibility, not object permissions
    
    # Aggregate permissions using "most permissive wins" rule
    for ps in all_permission_sets:
        # Object permissions
        for perm in ps.get("permissions", []):
            obj_name = perm.get("object_name")
            if not obj_name:
                continue
            
            if obj_name not in result["object_permissions"]:
                result["object_permissions"][obj_name] = {
                    "visible": False,
                    "create": False,
                    "read": False,
                    "edit": False,
                    "delete": False,
                    "view_all": False,
                    "modify_all": False
                }
            
            # OR (union) each permission - most permissive wins
            result["object_permissions"][obj_name]["visible"] |= perm.get("visible", True)
            result["object_permissions"][obj_name]["create"] |= perm.get("create", False)
            result["object_permissions"][obj_name]["read"] |= perm.get("read", False)
            result["object_permissions"][obj_name]["edit"] |= perm.get("edit", False)
            result["object_permissions"][obj_name]["delete"] |= perm.get("delete", False)
            result["object_permissions"][obj_name]["view_all"] |= perm.get("view_all", False)
            result["object_permissions"][obj_name]["modify_all"] |= perm.get("modify_all", False)
        
        # System permissions
        for perm_name, perm_value in (ps.get("system_permissions") or {}).items():
            if perm_value:
                result["system_permissions"][perm_name] = True
    
    return result


async def check_object_permission(
    tenant_id: str,
    user_id: str,
    object_name: str,
    action: str,
    is_super_admin: bool = False
) -> Tuple[bool, str]:
    """
    Check if user has permission for a specific action on an object.
    
    IMPORTANT: Default behavior is DENY ALL.
    If a user has no permission sets or no permission for the object, access is denied.
    Admins must explicitly assign permission sets or bundles.
    
    Args:
        tenant_id: Tenant ID
        user_id: User ID
        object_name: Object name (e.g., "lead", "contact")
        action: Action (e.g., "create", "read", "edit", "delete", "visible")
        is_super_admin: Pre-fetched super admin status (optimization)
    
    Returns:
        Tuple of (has_permission, reason)
    """
    # Super admin bypass
    if is_super_admin:
        return True, "super_admin"
    
    # Get effective permissions from cache
    effective = await get_effective_permissions(tenant_id, user_id)
    
    # Check super admin from effective permissions
    if effective.get("is_super_admin"):
        return True, "super_admin"
    
    # Check if user has any permission sources
    if not effective.get("permission_sources"):
        return False, "no_permission_sets_assigned"
    
    # Check object permission
    obj_perms = effective.get("object_permissions", {}).get(object_name)
    
    if not obj_perms:
        # No permission defined for this object - DENY by default
        return False, "no_object_permission_defined"
    
    # Check visibility first (object must be visible to perform any action)
    if action != "visible" and not obj_perms.get("visible", False):
        return False, "object_not_visible"
    
    has_perm = obj_perms.get(action, False)
    
    if has_perm:
        return True, "granted"
    else:
        return False, "denied"


async def check_object_visibility(
    tenant_id: str,
    user_id: str,
    object_name: str,
    is_super_admin: bool = False
) -> bool:
    """
    Check if an object should be visible to a user in the UI.
    
    Args:
        tenant_id: Tenant ID
        user_id: User ID
        object_name: Object name (e.g., "lead", "contact")
        is_super_admin: Pre-fetched super admin status
    
    Returns:
        True if object should be visible, False otherwise
    """
    # Super admin sees everything
    if is_super_admin:
        return True
    
    has_visibility, _ = await check_object_permission(
        tenant_id, user_id, object_name, "visible", is_super_admin
    )
    return has_visibility


async def get_visible_objects(
    tenant_id: str,
    user_id: str,
    is_super_admin: bool = False
) -> List[str]:
    """
    Get list of objects visible to a user.
    Used for filtering navigation and menus.
    
    Args:
        tenant_id: Tenant ID
        user_id: User ID
        is_super_admin: Pre-fetched super admin status
    
    Returns:
        List of visible object names
    """
    # Super admin sees everything
    if is_super_admin:
        # Return all standard objects
        return ["lead", "contact", "account", "opportunity", "task", "event"]
    
    # Get effective permissions
    effective = await get_effective_permissions(tenant_id, user_id)
    
    if effective.get("is_super_admin"):
        return ["lead", "contact", "account", "opportunity", "task", "event"]
    
    visible_objects = []
    for obj_name, perms in effective.get("object_permissions", {}).items():
        if perms.get("visible", False):
            visible_objects.append(obj_name)
    
    return visible_objects


# Cache statistics for monitoring
async def get_cache_stats() -> Dict[str, Any]:
    """Get cache statistics for monitoring."""
    async with _cache_lock:
        now = datetime.now(timezone.utc)
        total = len(_permission_cache)
        expired = sum(1 for v in _permission_cache.values() if v.get("expires_at", now) <= now)
        
        return {
            "total_cached_users": total,
            "expired_entries": expired,
            "active_entries": total - expired,
            "max_size": CACHE_MAX_SIZE,
            "ttl_seconds": CACHE_TTL_SECONDS
        }
