"""
System Permissions API Routes
Controls access to administrative sections of the application.

System permissions are different from object permissions:
- Object permissions: CRUD on records (leads, contacts, etc.)
- System permissions: Access to admin/setup features

System permissions can be assigned through:
1. Permission Sets (direct assignment)
2. Permission Bundles (grouped assignment)
3. Role (legacy, for backward compatibility)

Available System Permissions:
- view_setup: Access to Setup menu
- manage_users: Create, edit, deactivate users
- manage_roles: Create, edit roles and hierarchy
- manage_permission_sets: Create, edit permission sets
- manage_permission_bundles: Create, edit permission bundles
- manage_groups: Create, edit public groups
- manage_queues: Create, edit queues
- manage_sharing_rules: Create, edit sharing rules
- manage_sharing_settings: Edit OWD settings
- manage_licenses: View and manage licenses
- view_security_center: Access security center
- view_audit_logs: View audit trail
- export_data: Export data from the system
- import_data: Import data into the system
- manage_custom_objects: Create, edit custom objects
- manage_flows: Create, edit automation flows
- api_enabled: Access API endpoints
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field
from datetime import datetime, timezone
import logging

from config.database import db
from modules.auth.api.auth_routes import get_current_user
from modules.users.services.permission_cache import get_effective_permissions

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/system-permissions", tags=["System Permissions"])


# ========================================
# SYSTEM PERMISSION DEFINITIONS
# ========================================

SYSTEM_PERMISSIONS = {
    # Setup access
    "view_setup": {
        "name": "View Setup",
        "description": "Access the Setup menu",
        "category": "setup",
        "default_for_admin": True
    },
    # User management
    "manage_users": {
        "name": "Manage Users",
        "description": "Create, edit, and deactivate users",
        "category": "users",
        "default_for_admin": True
    },
    "view_users": {
        "name": "View Users",
        "description": "View user list and details",
        "category": "users",
        "default_for_admin": True
    },
    # Role management
    "manage_roles": {
        "name": "Manage Roles",
        "description": "Create, edit roles and role hierarchy",
        "category": "roles",
        "default_for_admin": True
    },
    "view_roles": {
        "name": "View Roles",
        "description": "View role list and hierarchy",
        "category": "roles",
        "default_for_admin": True
    },
    # Permission management
    "manage_permission_sets": {
        "name": "Manage Permission Sets",
        "description": "Create, edit permission sets",
        "category": "permissions",
        "default_for_admin": True
    },
    "manage_permission_bundles": {
        "name": "Manage Permission Bundles",
        "description": "Create, edit permission bundles",
        "category": "permissions",
        "default_for_admin": True
    },
    "assign_permissions": {
        "name": "Assign Permissions",
        "description": "Assign permission sets/bundles to users",
        "category": "permissions",
        "default_for_admin": True
    },
    # Group and queue management
    "manage_groups": {
        "name": "Manage Public Groups",
        "description": "Create, edit public groups",
        "category": "groups",
        "default_for_admin": True
    },
    "manage_queues": {
        "name": "Manage Queues",
        "description": "Create, edit queues",
        "category": "queues",
        "default_for_admin": True
    },
    # Sharing management
    "manage_sharing_rules": {
        "name": "Manage Sharing Rules",
        "description": "Create, edit sharing rules",
        "category": "sharing",
        "default_for_admin": True
    },
    "manage_sharing_settings": {
        "name": "Manage Sharing Settings",
        "description": "Edit organization-wide defaults (OWD)",
        "category": "sharing",
        "default_for_admin": True
    },
    # License management
    "manage_licenses": {
        "name": "Manage Licenses",
        "description": "View and manage organization licenses",
        "category": "licenses",
        "default_for_admin": True,
        "super_admin_only": True
    },
    "view_licenses": {
        "name": "View Licenses",
        "description": "View license information",
        "category": "licenses",
        "default_for_admin": True
    },
    # Security center
    "view_security_center": {
        "name": "View Security Center",
        "description": "Access security center dashboard",
        "category": "security",
        "default_for_admin": True
    },
    "view_audit_logs": {
        "name": "View Audit Logs",
        "description": "View audit trail and activity logs",
        "category": "security",
        "default_for_admin": True
    },
    # Data operations
    "export_data": {
        "name": "Export Data",
        "description": "Export records and data from the system",
        "category": "data",
        "default_for_admin": True
    },
    "import_data": {
        "name": "Import Data",
        "description": "Import data into the system",
        "category": "data",
        "default_for_admin": True
    },
    # Schema management
    "manage_custom_objects": {
        "name": "Manage Custom Objects",
        "description": "Create, edit custom objects and fields",
        "category": "schema",
        "default_for_admin": True
    },
    "manage_page_layouts": {
        "name": "Manage Page Layouts",
        "description": "Edit page layouts for objects",
        "category": "schema",
        "default_for_admin": True
    },
    # Automation
    "manage_flows": {
        "name": "Manage Flows",
        "description": "Create, edit automation flows",
        "category": "automation",
        "default_for_admin": True
    },
    "manage_approval_processes": {
        "name": "Manage Approval Processes",
        "description": "Create, edit approval workflows",
        "category": "automation",
        "default_for_admin": True
    },
    # API
    "api_enabled": {
        "name": "API Enabled",
        "description": "Access REST API endpoints",
        "category": "api",
        "default_for_admin": True
    },
}

# Mapping of Setup sections to required permissions
SECTION_PERMISSIONS = {
    "setup": "view_setup",
    "users": "view_users",
    "users_manage": "manage_users",
    "roles": "view_roles",
    "roles_manage": "manage_roles",
    "permission_sets": "manage_permission_sets",
    "permission_bundles": "manage_permission_bundles",
    "groups": "manage_groups",
    "queues": "manage_queues",
    "sharing_rules": "manage_sharing_rules",
    "sharing_settings": "manage_sharing_settings",
    "licenses": "view_licenses",
    "licenses_manage": "manage_licenses",
    "security_center": "view_security_center",
    "audit_logs": "view_audit_logs",
    "schema_builder": "manage_custom_objects",
    "page_layouts": "manage_page_layouts",
    "flow_builder": "manage_flows",
    "export": "export_data",
    "import": "import_data",
}


# ========================================
# REQUEST/RESPONSE MODELS
# ========================================

class SystemPermissionDefinition(BaseModel):
    """Definition of a system permission"""
    key: str
    name: str
    description: str
    category: str
    default_for_admin: bool = False
    super_admin_only: bool = False


class CheckPermissionRequest(BaseModel):
    """Request to check a specific permission"""
    permission: str


class CheckPermissionResponse(BaseModel):
    """Response for permission check"""
    permission: str
    granted: bool
    reason: str
    is_super_admin: bool = False


class UserSystemPermissionsResponse(BaseModel):
    """Response containing all system permissions for a user"""
    user_id: str
    is_super_admin: bool
    permissions: Dict[str, bool]
    granted_via: Dict[str, str]  # permission -> source (role, bundle, direct)


# ========================================
# HELPER FUNCTIONS
# ========================================

async def check_system_permission(
    tenant_id: str,
    user_id: str,
    permission: str,
    is_super_admin: bool = None
) -> tuple[bool, str]:
    """
    Check if user has a specific system permission.
    
    Args:
        tenant_id: Tenant ID
        user_id: User ID  
        permission: System permission key (e.g., "manage_users")
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
    
    # Check if permission is super_admin_only
    perm_def = SYSTEM_PERMISSIONS.get(permission)
    if perm_def and perm_def.get("super_admin_only"):
        return False, "super_admin_only"
    
    # Check system permissions
    system_perms = effective.get("system_permissions", {})
    
    if system_perms.get(permission):
        return True, "granted"
    
    # Check if user has admin role (backward compatibility)
    role = effective.get("role", {})
    role_id = role.get("id") or role.get("role_id")
    
    if role_id in ["system_administrator", "system_admin"]:
        # Admin role gets all default_for_admin permissions
        if perm_def and perm_def.get("default_for_admin"):
            return True, "admin_role"
    
    return False, "denied"


async def get_user_system_permissions(
    tenant_id: str,
    user_id: str
) -> Dict[str, Any]:
    """
    Get all system permissions for a user.
    
    Returns:
        Dict with user_id, is_super_admin, permissions dict, and granted_via dict
    """
    effective = await get_effective_permissions(tenant_id, user_id)
    
    is_super_admin = effective.get("is_super_admin", False)
    system_perms = effective.get("system_permissions", {})
    
    # Check role for admin defaults
    role = effective.get("role", {})
    role_id = role.get("id") or role.get("role_id")
    is_admin = role_id in ["system_administrator", "system_admin"]
    
    # Build complete permissions map
    permissions = {}
    granted_via = {}
    
    for perm_key, perm_def in SYSTEM_PERMISSIONS.items():
        if is_super_admin:
            permissions[perm_key] = True
            granted_via[perm_key] = "super_admin"
        elif system_perms.get(perm_key):
            permissions[perm_key] = True
            granted_via[perm_key] = "permission_set"
        elif is_admin and perm_def.get("default_for_admin"):
            if not perm_def.get("super_admin_only"):
                permissions[perm_key] = True
                granted_via[perm_key] = "admin_role"
            else:
                permissions[perm_key] = False
                granted_via[perm_key] = "super_admin_only"
        else:
            permissions[perm_key] = False
            granted_via[perm_key] = "not_granted"
    
    return {
        "user_id": user_id,
        "is_super_admin": is_super_admin,
        "permissions": permissions,
        "granted_via": granted_via
    }


# ========================================
# API ENDPOINTS
# ========================================

@router.get("/definitions", response_model=List[SystemPermissionDefinition])
async def get_permission_definitions(
    current_user: dict = Depends(get_current_user)
):
    """
    Get all available system permission definitions.
    Useful for building permission assignment UIs.
    """
    definitions = []
    for key, perm in SYSTEM_PERMISSIONS.items():
        definitions.append(SystemPermissionDefinition(
            key=key,
            name=perm["name"],
            description=perm["description"],
            category=perm["category"],
            default_for_admin=perm.get("default_for_admin", False),
            super_admin_only=perm.get("super_admin_only", False)
        ))
    
    return definitions


@router.get("/definitions/by-category")
async def get_permissions_by_category(
    current_user: dict = Depends(get_current_user)
) -> Dict[str, List[SystemPermissionDefinition]]:
    """
    Get system permissions grouped by category.
    """
    by_category = {}
    for key, perm in SYSTEM_PERMISSIONS.items():
        category = perm["category"]
        if category not in by_category:
            by_category[category] = []
        by_category[category].append(SystemPermissionDefinition(
            key=key,
            name=perm["name"],
            description=perm["description"],
            category=category,
            default_for_admin=perm.get("default_for_admin", False),
            super_admin_only=perm.get("super_admin_only", False)
        ))
    
    return by_category


@router.get("/section-mapping")
async def get_section_permission_mapping(
    current_user: dict = Depends(get_current_user)
) -> Dict[str, str]:
    """
    Get mapping of UI sections to required permissions.
    """
    return SECTION_PERMISSIONS


@router.post("/check", response_model=CheckPermissionResponse)
async def check_permission(
    request: CheckPermissionRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Check if the current user has a specific system permission.
    """
    # Handle both dict and Pydantic model
    if hasattr(current_user, 'model_dump'):
        user_data = current_user.model_dump()
    elif hasattr(current_user, 'dict'):
        user_data = current_user.dict()
    else:
        user_data = current_user
    
    tenant_id = user_data.get("tenant_id")
    user_id = user_data.get("id")
    is_super_admin = user_data.get("is_super_admin", False)
    
    has_perm, reason = await check_system_permission(
        tenant_id, user_id, request.permission, is_super_admin
    )
    
    return CheckPermissionResponse(
        permission=request.permission,
        granted=has_perm,
        reason=reason,
        is_super_admin=is_super_admin
    )


@router.get("/check/{permission}")
async def check_permission_get(
    permission: str,
    current_user: dict = Depends(get_current_user)
) -> CheckPermissionResponse:
    """
    Check if the current user has a specific system permission (GET version).
    """
    # Handle both dict and Pydantic model
    if hasattr(current_user, 'model_dump'):
        user_data = current_user.model_dump()
    elif hasattr(current_user, 'dict'):
        user_data = current_user.dict()
    else:
        user_data = current_user
    
    tenant_id = user_data.get("tenant_id")
    user_id = user_data.get("id")
    is_super_admin = user_data.get("is_super_admin", False)
    
    has_perm, reason = await check_system_permission(
        tenant_id, user_id, permission, is_super_admin
    )
    
    return CheckPermissionResponse(
        permission=permission,
        granted=has_perm,
        reason=reason,
        is_super_admin=is_super_admin
    )


@router.get("/my-permissions", response_model=UserSystemPermissionsResponse)
async def get_my_system_permissions(
    current_user: dict = Depends(get_current_user)
):
    """
    Get all system permissions for the current user.
    """
    # Handle both dict and Pydantic model
    if hasattr(current_user, 'model_dump'):
        user_data = current_user.model_dump()
    elif hasattr(current_user, 'dict'):
        user_data = current_user.dict()
    else:
        user_data = current_user
    
    tenant_id = user_data.get("tenant_id")
    user_id = user_data.get("id")
    
    return await get_user_system_permissions(tenant_id, user_id)


@router.get("/user/{user_id}/permissions", response_model=UserSystemPermissionsResponse)
async def get_user_permissions(
    user_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Get all system permissions for a specific user.
    Requires manage_users or view_users permission.
    """
    # Handle both dict and Pydantic model
    if hasattr(current_user, 'model_dump'):
        user_data = current_user.model_dump()
    elif hasattr(current_user, 'dict'):
        user_data = current_user.dict()
    else:
        user_data = current_user
    
    tenant_id = user_data.get("tenant_id")
    requester_id = user_data.get("id")
    is_super_admin = user_data.get("is_super_admin", False)
    
    # Check if requester can view user permissions
    if not is_super_admin:
        has_perm, _ = await check_system_permission(
            tenant_id, requester_id, "view_users", is_super_admin
        )
        if not has_perm:
            raise HTTPException(status_code=403, detail="Permission denied")
    
    return await get_user_system_permissions(tenant_id, user_id)


@router.get("/check-section/{section}")
async def check_section_access(
    section: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Check if the current user can access a specific UI section.
    """
    # Handle both dict and Pydantic model
    if hasattr(current_user, 'model_dump'):
        user_data = current_user.model_dump()
    elif hasattr(current_user, 'dict'):
        user_data = current_user.dict()
    else:
        user_data = current_user
    
    tenant_id = user_data.get("tenant_id")
    user_id = user_data.get("id")
    is_super_admin = user_data.get("is_super_admin", False)
    
    # Get required permission for section
    required_permission = SECTION_PERMISSIONS.get(section)
    
    if not required_permission:
        # Unknown section - default to denied
        return {
            "section": section,
            "granted": False,
            "reason": "unknown_section",
            "required_permission": None
        }
    
    has_perm, reason = await check_system_permission(
        tenant_id, user_id, required_permission, is_super_admin
    )
    
    return {
        "section": section,
        "granted": has_perm,
        "reason": reason,
        "required_permission": required_permission
    }


# Export the helper function for use in other modules
__all__ = [
    "router",
    "check_system_permission",
    "get_user_system_permissions",
    "SYSTEM_PERMISSIONS",
    "SECTION_PERMISSIONS"
]
