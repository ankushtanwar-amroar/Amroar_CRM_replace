"""
Users Module
User management, roles, permissions, groups, queues, sharing rules, and security settings.
"""
from .api.users_routes import router as users_router
from .api.roles_routes import router as roles_router
from .api.groups_routes import router as groups_router
from .api.queues_routes import router as queues_router
from .api.sharing_rules_routes import router as sharing_rules_router
from .api.access_bundles_routes import router as access_bundles_router
from .api.security_settings_routes import router as security_settings_router
from .api.permission_sets_routes import router as permission_sets_router
from .api.record_sharing_routes import router as record_sharing_router
from .api.licenses_routes import router as licenses_router
from .api.system_permissions_routes import router as system_permissions_router
from .api.owners_routes import router as owners_router
from .api.dependencies import require_admin
from .services import (
    check_permission,
    log_audit_event,
    get_subordinate_user_ids,
    seed_roles,
    seed_permission_sets,
    seed_organization_wide_defaults,
    check_record_access,
    ROLE_SYSTEM_ADMIN,
    ROLE_STANDARD_USER
)

__all__ = [
    'users_router',
    'roles_router',
    'groups_router',
    'queues_router',
    'sharing_rules_router',
    'access_bundles_router',
    'security_settings_router',
    'permission_sets_router',
    'record_sharing_router',
    'licenses_router',
    'system_permissions_router',
    'owners_router',
    'require_admin',
    'check_permission',
    'log_audit_event',
    'get_subordinate_user_ids',
    'seed_roles',
    'seed_permission_sets',
    'seed_organization_wide_defaults',
    'check_record_access',
    'ROLE_SYSTEM_ADMIN',
    'ROLE_STANDARD_USER'
]
