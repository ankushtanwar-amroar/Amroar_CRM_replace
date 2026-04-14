"""
Shared Services Module

Provides centralized services used across multiple modules.
Re-exports functions from shared._services_legacy (the original module file).

Control Plane Integration:
- RuntimeEnforcementService: Enforces module access, quotas, and subscription status
- Enforcement Dependencies: FastAPI dependencies for route-level enforcement
- Enforcement Middleware: Global subscription status checking
"""

from .tenant_provisioning_service import (
    TenantProvisioningService,
    get_provisioning_service
)
from .record_services import (
    generate_series_id,
    evaluate_formula_fields_for_record,
    evaluate_validation_rules,
    log_audit_event,
    get_subordinate_user_ids,
    check_permission
)

# Export new tenant provisioning service
from .tenant_provisioning_service import (
    TenantProvisioningService,
    get_provisioning_service
)

# Export runtime enforcement service (Control Plane)
from .runtime_enforcement_service import (
    RuntimeEnforcementService,
    EnforcementResult,
    get_enforcement_service
)

# Export enforcement dependencies (for route-level enforcement)
from .enforcement_dependencies import (
    get_enforcement,
    require_active_subscription,
    require_write_access,
    require_module,
    require_limit,
    require_can_create_object,
    require_can_create_field,
    require_can_create_flow,
    require_can_create_user,
    require_ai_credits,
    get_enabled_modules,
    get_tenant_entitlements,
    # Usage tracking helpers
    increment_object_usage,
    decrement_object_usage,
    increment_field_usage,
    decrement_field_usage,
    increment_flow_usage,
    decrement_flow_usage,
    increment_user_usage,
    decrement_user_usage,
    consume_ai_credits,
    update_storage_usage
)

# Export middleware classes
from .enforcement_middleware import (
    EnforcementMiddleware,
    ModuleEnforcementMiddleware
)

# Export runtime API router
from .runtime_api import router as runtime_router

# Export feature access service (License Enforcement)
from .feature_access_service import (
    FeatureAccessService,
    FeatureAccessResult,
    get_feature_access_service,
    MODULE_LICENSE_MAP
)

# Export license enforcement utilities
from .license_enforcement import (
    require_module_license,
    check_module_access,
    LicenseEnforcementError,
    ModuleKey
)

__all__ = [
    # Original shared services
    "generate_series_id",
    "evaluate_formula_fields_for_record",
    "evaluate_validation_rules",
    "log_audit_event",
    "get_subordinate_user_ids",
    "check_permission",
    # Tenant provisioning service
    "TenantProvisioningService",
    "get_provisioning_service",
    # Runtime enforcement service
    "RuntimeEnforcementService",
    "EnforcementResult",
    "get_enforcement_service",
    # Enforcement dependencies
    "get_enforcement",
    "require_active_subscription",
    "require_write_access",
    "require_module",
    "require_limit",
    "require_can_create_object",
    "require_can_create_field",
    "require_can_create_flow",
    "require_can_create_user",
    "require_ai_credits",
    "get_enabled_modules",
    "get_tenant_entitlements",
    # Usage tracking helpers
    "increment_object_usage",
    "decrement_object_usage",
    "increment_field_usage",
    "decrement_field_usage",
    "increment_flow_usage",
    "decrement_flow_usage",
    "increment_user_usage",
    "decrement_user_usage",
    "consume_ai_credits",
    "update_storage_usage",
    # Middleware
    "EnforcementMiddleware",
    "ModuleEnforcementMiddleware",
    # Runtime API router
    "runtime_router",
    # Feature Access Service (License Enforcement)
    "FeatureAccessService",
    "FeatureAccessResult",
    "get_feature_access_service",
    "MODULE_LICENSE_MAP",
    # License Enforcement Utilities
    "require_module_license",
    "check_module_access",
    "LicenseEnforcementError",
    "ModuleKey"
]
