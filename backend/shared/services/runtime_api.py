"""
Runtime Entitlements API - Control Plane Integration
API endpoints for CRM runtime to check entitlements, limits, and subscription status.

These endpoints are used by:
- Frontend to show/hide features based on entitlements
- Frontend to display usage meters and warnings
- Backend services that need to check entitlements without dependencies
"""
from fastapi import APIRouter, Depends, HTTPException, status
from typing import Dict, Any, List
import logging

from config.database import db
from modules.auth.api.auth_routes import get_current_user
from shared.models import User
from shared.services.runtime_enforcement_service import (
    RuntimeEnforcementService,
    get_enforcement_service
)
from shared.services.enforcement_dependencies import (
    get_enforcement,
    get_tenant_entitlements
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/runtime", tags=["Runtime Entitlements"])


def get_service() -> RuntimeEnforcementService:
    return get_enforcement_service(db)


@router.get("/entitlements")
async def get_entitlements(
    current_user: User = Depends(get_current_user),
    service: RuntimeEnforcementService = Depends(get_service)
) -> Dict[str, Any]:
    """
    Get complete entitlement information for the current tenant.
    
    Returns subscription status, enabled modules, seat usage, and limit warnings.
    Used by frontend to:
    - Show/hide module navigation
    - Display usage meters
    - Show upgrade prompts
    """
    tenant_id = current_user.tenant_id
    
    # Get subscription status
    subscription = await service.check_subscription_status(tenant_id)
    
    # Get enabled modules
    modules = await service.get_enabled_modules(tenant_id)
    
    # Get seat usage
    seats = await service.get_seat_usage(tenant_id)
    
    # Get key limits
    limits = {}
    key_limits = ["MAX_CUSTOM_OBJECTS", "MAX_CUSTOM_FIELDS", "MAX_ACTIVE_FLOWS", "MAX_STORAGE_GB"]
    
    for limit_key in key_limits:
        result = await service.check_limit(tenant_id, limit_key, 0)
        limits[limit_key] = {
            "limit_value": result.limit_value,
            "consumed_value": result.consumed_value,
            "remaining": result.remaining,
            "enforcement_type": result.enforcement_type
        }
    
    return {
        "tenant_id": tenant_id,
        "subscription": {
            "status": "active" if subscription.allowed else "restricted",
            "can_write": subscription.enforcement_type != "SOFT_WARNING" or subscription.message != "Tenant is in read-only mode. Modifications are not allowed.",
            "enforcement_type": subscription.enforcement_type,
            "message": subscription.message if subscription.enforcement_type != "NONE" else None
        },
        "modules": {
            "enabled": modules,
            "count": len(modules)
        },
        "seats": seats,
        "limits": limits,
        "warnings": _get_warnings(subscription, limits, seats)
    }


def _get_warnings(subscription, limits: Dict, seats: Dict) -> List[Dict[str, Any]]:
    """Generate warning messages for dashboard display"""
    warnings = []
    
    # Subscription warnings
    if subscription.enforcement_type == "SOFT_WARNING":
        warnings.append({
            "type": "subscription",
            "severity": "warning",
            "message": subscription.message
        })
    
    # Seat warnings (> 80% used)
    if seats.get("utilization_percent", 0) >= 80:
        warnings.append({
            "type": "seats",
            "severity": "warning" if seats["utilization_percent"] < 100 else "error",
            "message": f"Seat usage at {seats['utilization_percent']}% ({seats['total_users']}/{seats['seat_limit']})"
        })
    
    # Limit warnings (> 80% used)
    for limit_key, limit_data in limits.items():
        limit_value = limit_data.get("limit_value") or 0
        consumed_value = limit_data.get("consumed_value") or 0
        if limit_value > 0:
            utilization = (consumed_value / limit_value) * 100
            if utilization >= 80:
                warnings.append({
                    "type": "limit",
                    "limit_key": limit_key,
                    "severity": "warning" if utilization < 100 else "error",
                    "message": f"{limit_key} at {utilization:.0f}% ({consumed_value}/{limit_value})"
                })
    
    return warnings


@router.get("/modules/enabled")
async def get_enabled_modules(
    current_user: User = Depends(get_current_user),
    service: RuntimeEnforcementService = Depends(get_service)
) -> Dict[str, Any]:
    """
    Get list of enabled modules for the current tenant.
    Used by frontend for navigation visibility.
    """
    modules = await service.get_enabled_modules(current_user.tenant_id)
    return {
        "tenant_id": current_user.tenant_id,
        "modules": modules,
        "count": len(modules)
    }


@router.get("/modules/states")
async def get_module_states(
    current_user: User = Depends(get_current_user),
    service: RuntimeEnforcementService = Depends(get_service)
) -> Dict[str, Any]:
    """
    Get ALL modules with their states for the current tenant.
    
    This is the V3 API that returns every module with its access state:
    - ACTIVE: Module is enabled and user has access
    - PLAN_LOCKED: Module not included in current subscription plan
    - ADMIN_DISABLED: Tenant administrator has disabled the module
    - LICENSE_REQUIRED: Module requires a seat/license the user doesn't have
    
    Resolution Hierarchy:
    1. Plan → Determines which modules are available for the tenant
    2. Module Entitlement → Admin can override to enable/disable
    3. License/Seat → User-level access based on assigned licenses
    
    UI should NEVER hide modules - show them with appropriate badges.
    """
    tenant_id = current_user.tenant_id
    
    # Get tenant info for plan
    tenant = await db.tenants.find_one(
        {"id": tenant_id}, 
        {"_id": 0, "plan": 1, "module_entitlements": 1}
    )
    
    tenant_plan = tenant.get("plan") or tenant.get("subscription_plan") if tenant else None
    
    # Get plan definition to know what's included
    plan_doc = None
    if tenant_plan:
        plan_doc = await db.plans.find_one(
            {"api_name": tenant_plan},
            {"_id": 0, "enabled_modules": 1, "name": 1}
        )
        if not plan_doc:
            plan_doc = await db.subscription_plans.find_one(
                {"api_name": tenant_plan},
                {"_id": 0, "enabled_modules": 1, "name": 1}
            )
    
    # For legacy tenants without a plan, use module_entitlements as effective plan modules
    legacy_enabled = tenant.get("module_entitlements", []) if tenant else []
    
    if plan_doc:
        plan_modules = plan_doc.get("enabled_modules", [])
        plan_name = plan_doc.get("name", (tenant_plan or "free").title())
    elif legacy_enabled:
        # Legacy tenant: treat module_entitlements as the effective plan
        plan_modules = list(legacy_enabled)
        plan_name = "Custom (Legacy)"
        tenant_plan = tenant_plan or "custom_legacy"
    else:
        plan_modules = ["crm", "task_manager"]
        plan_name = "Free"
        tenant_plan = tenant_plan or "free"
    
    # Get tenant-level module entitlements (admin overrides)
    tenant_modules = await db.tenant_modules.find(
        {"tenant_id": tenant_id},
        {"_id": 0}
    ).to_list(100)
    
    # Build lookup for tenant module overrides
    module_overrides = {}
    for tm in tenant_modules:
        module_overrides[tm["module_code"]] = {
            "is_enabled": tm.get("is_enabled", True),
            "enabled_source": tm.get("enabled_source", "PLAN"),
            "start_at": tm.get("start_at"),
            "end_at": tm.get("end_at")
        }
    
    # Also use legacy module_entitlements array (already fetched above)
    
    # Get user-level license access (if available)
    user_license_access = {}
    try:
        from shared.services.feature_access_service import get_feature_access_service
        feature_service = get_feature_access_service(db)
        user_access = await feature_service.get_user_module_access(
            current_user.tenant_id,
            current_user.id
        )
        user_license_access = user_access or {}
    except Exception:
        pass  # License service not available
    
    # All available platform modules
    ALL_MODULES = {
        "crm": {"name": "CRM", "category": "core", "is_core": True},
        "sales_console": {"name": "Sales Console", "category": "core", "is_core": True},
        "schema_builder": {"name": "Schema Builder", "category": "admin"},
        "app_manager": {"name": "App Manager", "category": "admin"},
        "form_builder": {"name": "Form Builder", "category": "automation"},
        "flow_builder": {"name": "Flow Builder", "category": "automation"},
        "task_manager": {"name": "Task Manager", "category": "productivity"},
        "import_builder": {"name": "Import Builder", "category": "data"},
        "export_builder": {"name": "Export Builder", "category": "data"},
        "file_manager": {"name": "File Manager", "category": "data"},
        "survey_builder": {"name": "Survey Builder", "category": "engagement", "is_premium": True},
        "email_templates": {"name": "Email Templates", "category": "engagement"},
        "booking": {"name": "Booking", "category": "engagement", "is_premium": True},
        "chatbot_manager": {"name": "Chatbot Manager", "category": "ai", "is_premium": True},
        "docflow": {"name": "DocFlow", "category": "advanced", "is_premium": True},
        "ai_features": {"name": "AI Features", "category": "ai", "is_premium": True},
        "field_service": {"name": "Field Service", "category": "advanced", "is_premium": True},
        "reporting": {"name": "Advanced Reporting", "category": "analytics", "is_premium": True},
        "features": {"name": "Features", "category": "config", "is_core": True},
        "connections": {"name": "Connections", "category": "config", "is_core": True},
    }
    
    # Build module states
    module_states = {}
    enabled_modules = []
    
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    
    for code, info in ALL_MODULES.items():
        state = "ACTIVE"
        reason = None
        
        # Core modules are active by default BUT can be admin-disabled
        is_core = info.get("is_core", False)
        override = module_overrides.get(code)
        
        if is_core:
            # Check if admin explicitly disabled this core module
            if override and not override.get("is_enabled"):
                state = "ADMIN_DISABLED"
                reason = "Disabled by administrator"
            # For legacy tenants with module_entitlements, check if core module is in the list
            elif legacy_enabled and code not in legacy_enabled:
                state = "ADMIN_DISABLED"
                reason = "Disabled by administrator"
            else:
                state = "ACTIVE"
                reason = None
                enabled_modules.append(code)
        
        # Step 1: Check if in plan
        elif code not in plan_modules:
            # Not in plan - but check if admin explicitly enabled via module_entitlements
            if legacy_enabled and code in legacy_enabled:
                # Admin explicitly granted this module — override plan restriction
                state = "ACTIVE"
                reason = None
                enabled_modules.append(code)
            else:
                # Check manual override from tenant_modules
                override = module_overrides.get(code)
                if override and override.get("is_enabled") and override.get("enabled_source") == "MANUAL_OVERRIDE":
                    # Admin override - check time bounds
                    start_at = override.get("start_at")
                    end_at = override.get("end_at")
                    
                    if start_at and isinstance(start_at, datetime):
                        if start_at.tzinfo is None:
                            start_at = start_at.replace(tzinfo=timezone.utc)
                        if start_at > now:
                            state = "PLAN_LOCKED"
                            reason = f"Access starts {start_at.strftime('%Y-%m-%d')}"
                            module_states[code] = {
                                "state": state, "reason": reason,
                                "name": info["name"], "category": info["category"],
                                "is_premium": info.get("is_premium", False)
                            }
                            continue
                    
                    if end_at and isinstance(end_at, datetime):
                        if end_at.tzinfo is None:
                            end_at = end_at.replace(tzinfo=timezone.utc)
                        if end_at < now:
                            state = "PLAN_LOCKED"
                            reason = "Trial access expired"
                            module_states[code] = {
                                "state": state, "reason": reason,
                                "name": info["name"], "category": info["category"],
                                "is_premium": info.get("is_premium", False)
                            }
                            continue
                    
                    state = "ACTIVE"
                    reason = None
                    enabled_modules.append(code)
                else:
                    state = "PLAN_LOCKED"
                    reason = f"Not included in {plan_name} plan"
        
        # Step 2: In plan - check if admin disabled
        else:
            override = module_overrides.get(code)
            if override and not override.get("is_enabled"):
                state = "ADMIN_DISABLED"
                reason = "Disabled by administrator"
            elif code in legacy_enabled or (override and override.get("is_enabled")):
                # Enabled in tenant
                # Step 3: Check user license (admin users bypass if module is in plan)
                is_admin = getattr(current_user, 'is_super_admin', False) or getattr(current_user, 'role', '') == 'system_administrator'
                license_status = user_license_access.get(code)
                if license_status and not license_status.get("allowed") and not is_admin:
                    # Non-admin users blocked by missing license
                    state = "LICENSE_REQUIRED"
                    reason = license_status.get("reason", "License required")
                else:
                    state = "ACTIVE"
                    reason = None
                    enabled_modules.append(code)
            elif legacy_enabled and code not in legacy_enabled:
                # Module is in plan but NOT in the admin-configured entitlements list
                state = "ADMIN_DISABLED"
                reason = "Disabled by administrator"
            else:
                # In plan but not explicitly enabled - treat as active
                state = "ACTIVE"
                reason = None
                enabled_modules.append(code)
        
        module_states[code] = {
            "state": state,
            "reason": reason,
            "name": info["name"],
            "category": info["category"],
            "is_premium": info.get("is_premium", False)
        }
    
    # Fetch tenant settings (landing page config)
    tenant_settings = await db.tenant_settings.find_one(
        {"tenant_id": tenant_id}, {"_id": 0}
    )
    default_landing = "/crm-platform"
    if tenant_settings and tenant_settings.get("default_landing_page"):
        default_landing = tenant_settings["default_landing_page"]
    
    # Auto-detect DocFlow-only: if CRM is disabled, default to /setup
    crm_state = module_states.get("crm", {}).get("state")
    if crm_state == "ADMIN_DISABLED":
        default_landing = "/setup"

    return {
        "tenant_id": tenant_id,
        "plan": tenant_plan,
        "plan_name": plan_name,
        "plan_modules": plan_modules,
        "enabled_modules": enabled_modules,
        "module_states": module_states,
        "default_landing_page": default_landing,
    }


@router.get("/company-info")
async def get_company_info(
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """Lightweight endpoint returning organization, admin, and plan info for the Company Information page."""
    tenant_id = current_user.tenant_id

    # Fetch tenant record
    tenant = await db.tenants.find_one(
        {"id": tenant_id},
        {"_id": 0, "id": 1, "company_name": 1, "organization_name": 1,
         "industry": 1, "created_at": 1, "plan": 1, "is_trial": 1,
         "trial_ends_at": 1, "status": 1, "module_entitlements": 1}
    )

    # Fetch plan details
    plan_info = {"name": "Free", "type": "free", "status": "active"}
    if tenant:
        plan_api = tenant.get("plan")
        if plan_api:
            plan_doc = await db.plans.find_one(
                {"api_name": plan_api}, {"_id": 0, "name": 1, "api_name": 1}
            )
            if not plan_doc:
                plan_doc = await db.subscription_plans.find_one(
                    {"api_name": plan_api}, {"_id": 0, "name": 1, "api_name": 1}
                )
            if plan_doc:
                plan_info["name"] = plan_doc.get("name", plan_api.title())
                plan_info["type"] = plan_api

        if tenant.get("is_trial"):
            plan_info["type"] = "trial"
            plan_info["status"] = "trial"
            if tenant.get("trial_ends_at"):
                plan_info["trial_ends_at"] = str(tenant["trial_ends_at"])
        plan_info["status"] = tenant.get("status") or "active"

    # Fetch the first admin user for this tenant
    admin_user = await db.users.find_one(
        {"tenant_id": tenant_id, "is_super_admin": True},
        {"_id": 0, "first_name": 1, "last_name": 1, "email": 1}
    )

    # Fetch tenant licenses with catalog details
    licenses_info = []
    tenant_lics = await db.tenant_licenses.find(
        {"tenant_id": tenant_id, "status": "active"},
        {"_id": 0, "license_code": 1, "seats_purchased": 1, "status": 1}
    ).to_list(50)
    if tenant_lics:
        for tl in tenant_lics:
            code = tl.get("license_code", "")
            catalog_entry = await db.license_catalog.find_one(
                {"license_code": code},
                {"_id": 0, "license_name": 1, "module_key": 1, "assignment_type": 1}
            )
            licenses_info.append({
                "license_code": code,
                "license_name": (catalog_entry or {}).get("license_name", code),
                "module_key": (catalog_entry or {}).get("module_key", ""),
                "assignment_type": (catalog_entry or {}).get("assignment_type", "per_user"),
                "seats": tl.get("seats_purchased", 0),
                "status": tl.get("status", "active"),
            })

    created_at = None
    if tenant and tenant.get("created_at"):
        try:
            created_at = str(tenant["created_at"])
        except Exception:
            created_at = None

    return {
        "organization": {
            "name": (tenant or {}).get("company_name") or (tenant or {}).get("organization_name") or "Unknown",
            "industry": (tenant or {}).get("industry"),
            "created_at": created_at,
        },
        "admin": {
            "name": f"{(admin_user or {}).get('first_name', '')} {(admin_user or {}).get('last_name', '')}".strip() or None,
            "email": (admin_user or {}).get("email"),
        },
        "plan": plan_info,
        "licenses": licenses_info,
        "module_entitlements": (tenant or {}).get("module_entitlements", []),
    }


def _default_cluebot_config(tenant_id: str) -> Dict[str, Any]:
    """Return the default CluBot Control Center config for DocFlow."""
    return {
        "tenant_id": tenant_id,
        "general": {
            "enabled": False,
            "personality": "",
            "intent": "",
            "scope": "docflow",
        },
        "connections": {
            "allowed_connection_ids": [],
            "retrieval_only": True,
        },
        "knowledge": {
            "entries": [],
        },
        "tools": {
            "internal_tools": {
                "search_templates": True,
                "search_documents": True,
                "search_packages": True,
                "generate_summary": False,
                "draft_email": False,
            },
            "external_access": False,
        },
        "permissions": {
            "entities": {
                "documents": {"read": True, "create": False, "update": False},
                "templates": {"read": True, "create": False, "update": False},
                "packages": {"read": True, "create": False, "update": False},
                "signing_actions": {"read": True, "execute": False},
            },
            "require_confirmation": True,
            "preview_before_execution": True,
            "block_direct_db_mutations": True,
        },
        "logs": {
            "logging_enabled": True,
            "log_retention_days": 30,
            "memory_enabled": False,
            "recent_logs": [],
        },
    }


@router.get("/cluebot-config")
async def get_cluebot_config(
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """Get CluBot Control Center configuration for the current tenant (DocFlow scope)."""
    tenant_id = current_user.tenant_id

    config = await db.cluebot_config.find_one(
        {"tenant_id": tenant_id}, {"_id": 0}
    )

    if not config:
        return _default_cluebot_config(tenant_id)

    # Merge with defaults for any missing sections (backward compat)
    defaults = _default_cluebot_config(tenant_id)
    for section_key in defaults:
        if section_key == "tenant_id":
            continue
        if section_key not in config:
            config[section_key] = defaults[section_key]
        elif isinstance(defaults[section_key], dict) and isinstance(config.get(section_key), dict):
            for sub_key, sub_val in defaults[section_key].items():
                if sub_key not in config[section_key]:
                    config[section_key][sub_key] = sub_val

    # Backward compat: migrate old flat format
    if "enabled" in config and "general" in config:
        if not config["general"].get("intent") and config.get("intent"):
            config["general"]["intent"] = config["intent"]
        if not config["general"].get("enabled") and config.get("enabled"):
            config["general"]["enabled"] = config["enabled"]
    if "knowledge_base" in config and isinstance(config["knowledge_base"], list):
        if not config.get("knowledge", {}).get("entries"):
            config["knowledge"]["entries"] = config["knowledge_base"]

    # Strip legacy flat keys from response
    for legacy_key in ["enabled", "intent", "knowledge_base"]:
        config.pop(legacy_key, None)

    config.pop("tenant_id", None)
    config["tenant_id"] = tenant_id
    return config


@router.put("/cluebot-config")
async def update_cluebot_config(
    payload: Dict[str, Any],
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """Update CluBot Control Center configuration. Admin-only."""
    tenant_id = current_user.tenant_id

    is_admin = getattr(current_user, "is_super_admin", False)
    if not is_admin:
        raise HTTPException(status_code=403, detail="Only admins can update CluBot configuration")

    defaults = _default_cluebot_config(tenant_id)

    # --- General ---
    general_raw = payload.get("general", {})
    general = {
        "enabled": bool(general_raw.get("enabled", False)),
        "personality": str(general_raw.get("personality", "")).strip()[:2000],
        "intent": str(general_raw.get("intent", "")).strip()[:2000],
        "scope": "docflow",
    }

    # --- Connections ---
    conn_raw = payload.get("connections", {})
    connections = {
        "allowed_connection_ids": list(conn_raw.get("allowed_connection_ids", [])),
        "retrieval_only": bool(conn_raw.get("retrieval_only", True)),
    }

    # --- Knowledge ---
    kb_raw = payload.get("knowledge", {}).get("entries", [])
    entries = []
    for entry in kb_raw:
        if isinstance(entry, dict) and (entry.get("title") or entry.get("content")):
            entries.append({
                "title": str(entry.get("title", "")).strip()[:500],
                "content": str(entry.get("content", "")).strip()[:5000],
            })
    knowledge = {"entries": entries}

    # --- Tools ---
    tools_raw = payload.get("tools", {})
    internal_tools_raw = tools_raw.get("internal_tools", defaults["tools"]["internal_tools"])
    internal_tools = {}
    for tk, tv in defaults["tools"]["internal_tools"].items():
        internal_tools[tk] = bool(internal_tools_raw.get(tk, tv))
    tools = {
        "internal_tools": internal_tools,
        "external_access": bool(tools_raw.get("external_access", False)),
    }

    # --- Permissions ---
    perm_raw = payload.get("permissions", {})
    entities_raw = perm_raw.get("entities", defaults["permissions"]["entities"])
    entities = {}
    for ek, ev in defaults["permissions"]["entities"].items():
        entity_perms = entities_raw.get(ek, ev)
        entities[ek] = {}
        for pk, pv in ev.items():
            entities[ek][pk] = bool(entity_perms.get(pk, pv)) if isinstance(entity_perms, dict) else pv
    permissions = {
        "entities": entities,
        "require_confirmation": bool(perm_raw.get("require_confirmation", True)),
        "preview_before_execution": bool(perm_raw.get("preview_before_execution", True)),
        "block_direct_db_mutations": bool(perm_raw.get("block_direct_db_mutations", True)),
    }

    # --- Logs ---
    logs_raw = payload.get("logs", {})
    logs = {
        "logging_enabled": bool(logs_raw.get("logging_enabled", True)),
        "log_retention_days": min(max(int(logs_raw.get("log_retention_days", 30)), 1), 365),
        "memory_enabled": bool(logs_raw.get("memory_enabled", False)),
    }

    from datetime import datetime, timezone
    update_doc = {
        "tenant_id": tenant_id,
        "general": general,
        "connections": connections,
        "knowledge": knowledge,
        "tools": tools,
        "permissions": permissions,
        "logs": logs,
        "updated_at": datetime.now(timezone.utc),
    }

    await db.cluebot_config.update_one(
        {"tenant_id": tenant_id},
        {"$set": update_doc},
        upsert=True,
    )

    return {
        **{k: v for k, v in update_doc.items() if k != "updated_at"},
        "message": "CluBot configuration updated successfully",
    }


@router.post("/cluebot-config/log")
async def append_cluebot_log(
    payload: Dict[str, Any],
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """Append an action log entry to CluBot logs. Internal use."""
    tenant_id = current_user.tenant_id
    from datetime import datetime, timezone

    log_entry = {
        "action": str(payload.get("action", "")).strip(),
        "entity": str(payload.get("entity", "")).strip(),
        "details": str(payload.get("details", "")).strip()[:1000],
        "user_id": current_user.id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "status": str(payload.get("status", "completed")).strip(),
    }

    # Push to logs.recent_logs (cap at 200)
    await db.cluebot_config.update_one(
        {"tenant_id": tenant_id},
        {
            "$push": {
                "logs.recent_logs": {
                    "$each": [log_entry],
                    "$slice": -200,
                }
            }
        },
        upsert=True,
    )
    return {"success": True, "log_entry": log_entry}
@router.get("/modules/{module_code}/check")
async def check_module_access(
    module_code: str,
    current_user: User = Depends(get_current_user),
    service: RuntimeEnforcementService = Depends(get_service)
) -> Dict[str, Any]:
    """
    Check if a specific module is enabled for the tenant.
    """
    result = await service.check_module_access(current_user.tenant_id, module_code)
    return {
        "module_code": module_code,
        "allowed": result.allowed,
        "enforcement_type": result.enforcement_type,
        "message": result.message if not result.allowed else None
    }


@router.get("/limits/{limit_key}")
async def get_limit_status(
    limit_key: str,
    current_user: User = Depends(get_current_user),
    service: RuntimeEnforcementService = Depends(get_service)
) -> Dict[str, Any]:
    """
    Get status of a specific limit for the tenant.
    """
    result = await service.check_limit(current_user.tenant_id, limit_key, 0)
    
    utilization = 0
    if result.limit_value and result.limit_value > 0:
        utilization = round((result.consumed_value or 0) / result.limit_value * 100, 2)
    
    return {
        "limit_key": limit_key,
        "limit_value": result.limit_value,
        "consumed_value": result.consumed_value,
        "remaining": result.remaining,
        "utilization_percent": utilization,
        "enforcement_type": result.enforcement_type,
        "is_exceeded": result.consumed_value >= result.limit_value if result.limit_value else False
    }


@router.post("/limits/{limit_key}/check")
async def check_limit_for_action(
    limit_key: str,
    increment: int = 1,
    current_user: User = Depends(get_current_user),
    service: RuntimeEnforcementService = Depends(get_service)
) -> Dict[str, Any]:
    """
    Check if an action would exceed a limit (without incrementing).
    Used by frontend to show warnings before user attempts action.
    """
    result = await service.check_limit(current_user.tenant_id, limit_key, increment)
    return {
        "limit_key": limit_key,
        "increment": increment,
        "allowed": result.allowed,
        "limit_value": result.limit_value,
        "consumed_value": result.consumed_value,
        "would_be_consumed": (result.consumed_value or 0) + increment,
        "remaining_after": max(0, (result.remaining or 0) - increment),
        "enforcement_type": result.enforcement_type,
        "message": result.message if not result.allowed else None
    }


@router.get("/seats")
async def get_seat_usage(
    current_user: User = Depends(get_current_user),
    service: RuntimeEnforcementService = Depends(get_service)
) -> Dict[str, Any]:
    """
    Get seat usage information for the tenant.
    """
    seats = await service.get_seat_usage(current_user.tenant_id)
    return {
        "tenant_id": current_user.tenant_id,
        **seats
    }


@router.get("/subscription/status")
async def get_subscription_status(
    current_user: User = Depends(get_current_user),
    service: RuntimeEnforcementService = Depends(get_service)
) -> Dict[str, Any]:
    """
    Get subscription status for the tenant.
    """
    result = await service.check_subscription_status(current_user.tenant_id)
    can_write = await service.is_write_allowed(current_user.tenant_id)
    
    return {
        "tenant_id": current_user.tenant_id,
        "is_active": result.allowed,
        "can_write": can_write,
        "enforcement_type": result.enforcement_type,
        "message": result.message if result.enforcement_type != "NONE" else None
    }


@router.post("/can-create/object")
async def can_create_object(
    current_user: User = Depends(get_current_user),
    service: RuntimeEnforcementService = Depends(get_service)
) -> Dict[str, Any]:
    """
    Check if user can create a new custom object.
    Validates subscription, module access, and limits.
    """
    result = await service.check_can_create_object(current_user.tenant_id)
    return {
        "action": "create_object",
        "allowed": result.allowed,
        "enforcement_type": result.enforcement_type,
        "message": result.message if not result.allowed else None,
        "limit_info": {
            "limit_key": result.limit_key,
            "limit_value": result.limit_value,
            "consumed_value": result.consumed_value,
            "remaining": result.remaining
        } if result.limit_key else None
    }


@router.post("/can-create/field")
async def can_create_field(
    current_user: User = Depends(get_current_user),
    service: RuntimeEnforcementService = Depends(get_service)
) -> Dict[str, Any]:
    """
    Check if user can create a new custom field.
    """
    result = await service.check_can_create_field(current_user.tenant_id)
    return {
        "action": "create_field",
        "allowed": result.allowed,
        "enforcement_type": result.enforcement_type,
        "message": result.message if not result.allowed else None,
        "limit_info": {
            "limit_key": result.limit_key,
            "limit_value": result.limit_value,
            "consumed_value": result.consumed_value,
            "remaining": result.remaining
        } if result.limit_key else None
    }


@router.post("/can-create/flow")
async def can_create_flow(
    current_user: User = Depends(get_current_user),
    service: RuntimeEnforcementService = Depends(get_service)
) -> Dict[str, Any]:
    """
    Check if user can create a new flow.
    """
    result = await service.check_can_create_flow(current_user.tenant_id)
    return {
        "action": "create_flow",
        "allowed": result.allowed,
        "enforcement_type": result.enforcement_type,
        "message": result.message if not result.allowed else None,
        "limit_info": {
            "limit_key": result.limit_key,
            "limit_value": result.limit_value,
            "consumed_value": result.consumed_value,
            "remaining": result.remaining
        } if result.limit_key else None
    }


@router.post("/can-create/user")
async def can_create_user(
    current_user: User = Depends(get_current_user),
    service: RuntimeEnforcementService = Depends(get_service)
) -> Dict[str, Any]:
    """
    Check if user can add a new user (seat limit).
    """
    result = await service.check_can_create_user(current_user.tenant_id)
    return {
        "action": "create_user",
        "allowed": result.allowed,
        "enforcement_type": result.enforcement_type,
        "message": result.message if not result.allowed else None,
        "limit_info": {
            "limit_key": result.limit_key,
            "limit_value": result.limit_value,
            "consumed_value": result.consumed_value,
            "remaining": result.remaining
        } if result.limit_key else None
    }


# ── Tenant Settings (landing page, UI config) ─────────────────

VALID_LANDING_PAGES = [
    "/crm-platform",
    "/setup/docflow",
    "/setup",
    "/flows",
    "/task-manager",
    "/booking",
    "/files",
]


@router.get("/tenant-settings")
async def get_tenant_settings(
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """Return tenant-level UI settings (landing page, etc.)."""
    settings = await db.tenant_settings.find_one(
        {"tenant_id": current_user.tenant_id}, {"_id": 0}
    )
    return {
        "tenant_id": current_user.tenant_id,
        "default_landing_page": (settings or {}).get("default_landing_page", "/crm-platform"),
    }


@router.put("/tenant-settings")
async def update_tenant_settings(
    body: Dict[str, Any],
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """Update tenant-level UI settings.  Only system_administrator or super_admin."""
    is_admin = getattr(current_user, "is_super_admin", False) or getattr(current_user, "role", "") == "system_administrator"
    if not is_admin:
        raise HTTPException(status_code=403, detail="Admin privileges required")

    update = {}
    if "default_landing_page" in body:
        lp = body["default_landing_page"]
        if lp and lp not in VALID_LANDING_PAGES:
            raise HTTPException(status_code=400, detail=f"Invalid landing page. Allowed: {VALID_LANDING_PAGES}")
        update["default_landing_page"] = lp

    if not update:
        raise HTTPException(status_code=400, detail="Nothing to update")

    from datetime import datetime, timezone
    update["updated_at"] = datetime.now(timezone.utc)

    await db.tenant_settings.update_one(
        {"tenant_id": current_user.tenant_id},
        {"$set": update},
        upsert=True,
    )
    return {"success": True, **update}
