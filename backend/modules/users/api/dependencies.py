"""
Shared dependencies for the Users module.
"""
from fastapi import HTTPException, Depends
from shared.models import User
from modules.auth.api.auth_routes import get_current_user

# System role IDs
ROLE_SYSTEM_ADMIN = "system_admin"
ROLE_SYSTEM_ADMINISTRATOR = "system_administrator"  # Alternative ID used in some tenants
ROLE_STANDARD_USER = "standard_user"


async def require_admin(current_user: User = Depends(get_current_user)) -> User:
    """Dependency to check if user has admin role or is super admin."""
    # Super admins always have access
    if getattr(current_user, "is_super_admin", False):
        return current_user
        
    # Check for both possible admin role IDs
    admin_roles = [ROLE_SYSTEM_ADMIN, ROLE_SYSTEM_ADMINISTRATOR]
    if current_user.role_id not in admin_roles:
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user
