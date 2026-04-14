"""
Admin Portal API Routes
All routes prefixed with /api/admin
Completely isolated from CRM routes
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from motor.motor_asyncio import AsyncIOMotorClient
from typing import Optional, List
import os
import logging

from ..models import (
    AdminLoginRequest,
    AdminLoginResponse,
    TenantCreate,
    TenantUpdate,
    TenantResponse,
    AdminSetupResponse,
    TenantStatus,
    SubscriptionPlan,
    # Phase 3 models
    TenantUserCreate,
    TenantUserUpdate,
    UserResetPassword,
    PlanCreate,
    PlanUpdate,
    TenantPlanAssignment,
    TenantModuleUpdate,
    ModuleToggle
)
from ..services import AdminService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin", tags=["Admin Portal"])

# Database connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

security = HTTPBearer()


async def get_admin_service() -> AdminService:
    """Get admin service instance"""
    return AdminService(db)


async def require_admin_auth(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    admin_service: AdminService = Depends(get_admin_service)
):
    """
    Dependency to require Admin Portal authentication.
    Authenticated users are platform operators with full control plane access.
    """
    token = credentials.credentials
    admin_user = await admin_service.verify_admin_token(token)
    
    if not admin_user:
        raise HTTPException(
            status_code=401,
            detail="Invalid admin credentials. Please login to access the Admin Portal."
        )
    
    return admin_user


# Alias for backward compatibility
require_admin_auth = require_admin_auth


# =============================================================================
# AUTH ROUTES (Public - No auth required)
# =============================================================================

@router.post("/login", response_model=AdminLoginResponse)
async def admin_login(
    request: AdminLoginRequest,
    admin_service: AdminService = Depends(get_admin_service)
):
    """
    Admin Portal login endpoint.
    Authenticates platform operators for control plane access.
    """
    result = await admin_service.authenticate_admin(request.email, request.password)
    
    if not result:
        raise HTTPException(
            status_code=401,
            detail="Invalid credentials. Please check your email and password."
        )
    
    return result


@router.post("/setup", response_model=AdminSetupResponse)
async def setup_admin_user(
    email: str = Query(..., description="Admin email"),
    password: str = Query(..., description="Admin password"),
    first_name: str = Query("Platform", description="First name"),
    last_name: str = Query("Admin", description="Last name"),
    admin_service: AdminService = Depends(get_admin_service)
):
    """
    Setup initial Admin Portal user.
    Only works if no admin user exists.
    """
    result = await admin_service.setup_admin_user(email, password, first_name, last_name)
    return result


# =============================================================================
# PROTECTED ROUTES (Require Admin Portal Authentication)
# =============================================================================

@router.get("/me")
async def get_admin_profile(admin_user: dict = Depends(require_admin_auth)):
    """Get current admin user profile"""
    return {
        "id": admin_user.get("id"),
        "email": admin_user.get("email"),
        "first_name": admin_user.get("first_name"),
        "last_name": admin_user.get("last_name"),
        "role": "platform_admin"
    }


@router.get("/dashboard")
async def get_dashboard_stats(
    admin_user: dict = Depends(require_admin_auth),
    admin_service: AdminService = Depends(get_admin_service)
):
    """Get admin dashboard statistics"""
    return await admin_service.get_dashboard_stats()


# =============================================================================
# TENANT MANAGEMENT - FULL CRUD
# =============================================================================

@router.get("/tenants")
async def list_tenants(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    search: Optional[str] = Query(None, description="Search by tenant or organization name"),
    status: Optional[str] = Query(None, description="Filter by status (active, suspended, trial)"),
    plan: Optional[str] = Query(None, description="Filter by plan (free, starter, professional, enterprise)"),
    admin_user: dict = Depends(require_admin_auth),
    admin_service: AdminService = Depends(get_admin_service)
):
    """List all tenants with pagination and filters"""
    return await admin_service.get_all_tenants(
        skip=skip, 
        limit=limit, 
        search=search,
        status_filter=status,
        plan_filter=plan
    )


@router.get("/tenants/{tenant_id}")
async def get_tenant(
    tenant_id: str,
    admin_user: dict = Depends(require_admin_auth),
    admin_service: AdminService = Depends(get_admin_service)
):
    """Get tenant details by ID with full statistics"""
    tenant = await admin_service.get_tenant_by_id(tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return tenant


@router.get("/tenants/{tenant_id}/users")
async def get_tenant_users(
    tenant_id: str,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    admin_user: dict = Depends(require_admin_auth),
    admin_service: AdminService = Depends(get_admin_service)
):
    """Get users for a specific tenant"""
    # First verify tenant exists
    tenant = await admin_service.get_tenant_by_id(tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    
    return await admin_service.get_tenant_users(tenant_id, skip=skip, limit=limit)


@router.post("/tenants")
async def create_tenant(
    tenant_data: TenantCreate,
    admin_user: dict = Depends(require_admin_auth),
    admin_service: AdminService = Depends(get_admin_service)
):
    """
    Create a new tenant (organization) with optional Tenant Administrator.
    If admin_email is provided, admin_first_name and admin_last_name are required.
    """
    # Check if email already exists (only if admin_email is provided)
    if tenant_data.admin_email:
        existing_user = await db.users.find_one({"email": tenant_data.admin_email.lower()})
        if existing_user:
            raise HTTPException(status_code=400, detail="A user with this email already exists")
    
    try:
        tenant = await admin_service.create_tenant(
            tenant_data.model_dump(),
            actor_id=admin_user.get("id"),
            actor_email=admin_user.get("email")
        )
        return tenant
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.patch("/tenants/{tenant_id}")
async def update_tenant(
    tenant_id: str,
    update_data: TenantUpdate,
    admin_user: dict = Depends(require_admin_auth),
    admin_service: AdminService = Depends(get_admin_service)
):
    """Update tenant details"""
    tenant = await admin_service.update_tenant(tenant_id, update_data.model_dump())
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return tenant


@router.post("/tenants/{tenant_id}/suspend")
async def suspend_tenant(
    tenant_id: str,
    reason: Optional[str] = Query(None, description="Reason for suspension"),
    admin_user: dict = Depends(require_admin_auth),
    admin_service: AdminService = Depends(get_admin_service)
):
    """Suspend a tenant"""
    tenant = await admin_service.suspend_tenant(tenant_id, reason=reason)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return {"message": "Tenant suspended successfully", "tenant": tenant}


@router.post("/tenants/{tenant_id}/activate")
async def activate_tenant(
    tenant_id: str,
    admin_user: dict = Depends(require_admin_auth),
    admin_service: AdminService = Depends(get_admin_service)
):
    """Activate a suspended tenant"""
    tenant = await admin_service.activate_tenant(tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return {"message": "Tenant activated successfully", "tenant": tenant}


@router.delete("/tenants/{tenant_id}")
async def delete_tenant(
    tenant_id: str,
    hard_delete: bool = Query(False, description="If true, permanently delete all tenant data"),
    admin_user: dict = Depends(require_admin_auth),
    admin_service: AdminService = Depends(get_admin_service)
):
    """Delete a tenant (soft delete by default)"""
    success = await admin_service.delete_tenant(tenant_id, hard_delete=hard_delete)
    if not success:
        raise HTTPException(status_code=404, detail="Tenant not found")
    
    delete_type = "permanently deleted" if hard_delete else "soft deleted"
    return {"message": f"Tenant {delete_type} successfully", "tenant_id": tenant_id}


# =============================================================================
# PLACEHOLDER ROUTES (To be implemented)
# =============================================================================

@router.get("/subscriptions")
async def list_subscriptions(admin_user: dict = Depends(require_admin_auth)):
    """List all subscription plans"""
    return {
        "plans": [
            {"id": "free", "name": "Free", "price": 0, "seat_limit": 5, "storage_mb": 512},
            {"id": "starter", "name": "Starter", "price": 29, "seat_limit": 10, "storage_mb": 2048},
            {"id": "professional", "name": "Professional", "price": 79, "seat_limit": 50, "storage_mb": 10240},
            {"id": "enterprise", "name": "Enterprise", "price": 199, "seat_limit": 1000, "storage_mb": 51200}
        ]
    }


@router.get("/modules")
async def list_modules(admin_user: dict = Depends(require_admin_auth)):
    """List all available modules"""
    return {
        "modules": [
            {"id": "crm", "name": "CRM", "description": "Customer Relationship Management"},
            {"id": "flow_builder", "name": "Flow Builder", "description": "Visual workflow automation"},
            {"id": "form_builder", "name": "Form Builder", "description": "Dynamic form creation"},
            {"id": "task_manager", "name": "Task Manager", "description": "Task and project management"},
            {"id": "survey_builder", "name": "Survey Builder", "description": "Survey creation and analytics"},
            {"id": "booking", "name": "Booking System", "description": "Appointment scheduling"},
            {"id": "docflow", "name": "DocFlow", "description": "Document management"},
            {"id": "field_service", "name": "Field Service", "description": "Work order and technician management"}
        ]
    }


@router.get("/quotas")
async def list_quotas(admin_user: dict = Depends(require_admin_auth)):
    """List system quotas"""
    return {
        "quotas": {
            "max_tenants": 1000,
            "current_tenants": await db.tenants.count_documents({"is_deleted": {"$ne": True}}),
            "max_users_per_tenant": 1000,
            "max_storage_per_tenant_mb": 51200
        }
    }





# =============================================================================
# PHASE 3: USER MANAGEMENT ROUTES
# =============================================================================

@router.get("/users")
async def list_all_users(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    search: Optional[str] = Query(None, description="Search by email or name"),
    role: Optional[str] = Query(None, description="Filter by role (admin, manager, user)"),
    tenant_id: Optional[str] = Query(None, description="Filter by tenant"),
    status: Optional[str] = Query(None, description="Filter by status (active, disabled, invited)"),
    admin_user: dict = Depends(require_admin_auth),
    admin_service: AdminService = Depends(get_admin_service)
):
    """
    List all users across tenants for platform monitoring.
    This endpoint is read-only for monitoring purposes.
    User management should be done via Tenant Detail → Users tab.
    """
    return await admin_service.get_all_users(
        skip=skip,
        limit=limit,
        search=search,
        role_filter=role,
        tenant_id=tenant_id,
        status_filter=status
    )


@router.post("/tenants/{tenant_id}/users")
async def create_tenant_user(
    tenant_id: str,
    user_data: TenantUserCreate,
    admin_user: dict = Depends(require_admin_auth),
    admin_service: AdminService = Depends(get_admin_service)
):
    """Create a new user within a tenant"""
    try:
        user = await admin_service.create_tenant_user(tenant_id, user_data.model_dump())
        return user
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.patch("/users/{user_id}")
async def update_user(
    user_id: str,
    update_data: TenantUserUpdate,
    admin_user: dict = Depends(require_admin_auth),
    admin_service: AdminService = Depends(get_admin_service)
):
    """Update user details"""
    user = await admin_service.update_tenant_user(user_id, update_data.model_dump())
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.post("/users/{user_id}/suspend")
async def suspend_user(
    user_id: str,
    admin_user: dict = Depends(require_admin_auth),
    admin_service: AdminService = Depends(get_admin_service)
):
    """Suspend a user"""
    user = await admin_service.suspend_user(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": "User suspended successfully", "user": user}


@router.post("/users/{user_id}/activate")
async def activate_user(
    user_id: str,
    admin_user: dict = Depends(require_admin_auth),
    admin_service: AdminService = Depends(get_admin_service)
):
    """Activate a suspended user"""
    user = await admin_service.activate_user(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": "User activated successfully", "user": user}


@router.post("/users/{user_id}/reset-password")
async def reset_user_password(
    user_id: str,
    password_data: UserResetPassword,
    admin_user: dict = Depends(require_admin_auth),
    admin_service: AdminService = Depends(get_admin_service)
):
    """Reset a user's password"""
    success = await admin_service.reset_user_password(user_id, password_data.new_password)
    if not success:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": "Password reset successfully"}


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: str,
    admin_user: dict = Depends(require_admin_auth),
    admin_service: AdminService = Depends(get_admin_service)
):
    """Delete a user"""
    success = await admin_service.delete_user(user_id)
    if not success:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": "User deleted successfully"}


# =============================================================================
# PHASE 3: SUBSCRIPTION PLAN ROUTES
# =============================================================================

@router.get("/plans")
async def list_plans(
    include_inactive: bool = Query(False, description="Include inactive plans"),
    admin_user: dict = Depends(require_admin_auth),
    admin_service: AdminService = Depends(get_admin_service)
):
    """List all subscription plans"""
    plans = await admin_service.get_all_plans(include_inactive=include_inactive)
    return {"plans": plans}


@router.get("/plans/{plan_id}")
async def get_plan(
    plan_id: str,
    admin_user: dict = Depends(require_admin_auth),
    admin_service: AdminService = Depends(get_admin_service)
):
    """Get a subscription plan by ID"""
    plan = await admin_service.get_plan_by_id(plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    return plan


@router.post("/plans")
async def create_plan(
    plan_data: PlanCreate,
    admin_user: dict = Depends(require_admin_auth),
    admin_service: AdminService = Depends(get_admin_service)
):
    """Create a new subscription plan"""
    try:
        plan = await admin_service.create_plan(plan_data.model_dump())
        return plan
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.patch("/plans/{plan_id}")
async def update_plan(
    plan_id: str,
    update_data: PlanUpdate,
    admin_user: dict = Depends(require_admin_auth),
    admin_service: AdminService = Depends(get_admin_service)
):
    """Update a subscription plan"""
    plan = await admin_service.update_plan(plan_id, update_data.model_dump())
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    return plan


@router.delete("/plans/{plan_id}")
async def delete_plan(
    plan_id: str,
    admin_user: dict = Depends(require_admin_auth),
    admin_service: AdminService = Depends(get_admin_service)
):
    """Delete a subscription plan (soft delete)"""
    success = await admin_service.delete_plan(plan_id)
    if not success:
        raise HTTPException(status_code=404, detail="Plan not found")
    return {"message": "Plan deleted successfully"}


@router.post("/plans/seed")
async def seed_default_plans(
    admin_user: dict = Depends(require_admin_auth),
    admin_service: AdminService = Depends(get_admin_service)
):
    """Seed default subscription plans"""
    result = await admin_service.seed_default_plans()
    return result


@router.post("/tenants/{tenant_id}/plan")
async def assign_plan_to_tenant(
    tenant_id: str,
    assignment: TenantPlanAssignment,
    admin_user: dict = Depends(require_admin_auth),
    admin_service: AdminService = Depends(get_admin_service)
):
    """Assign a subscription plan to a tenant"""
    try:
        tenant = await admin_service.assign_plan_to_tenant(tenant_id, assignment.plan_id)
        if not tenant:
            raise HTTPException(status_code=404, detail="Tenant not found")
        return {"message": "Plan assigned successfully", "tenant": tenant}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/tenants/{tenant_id}/plan/by-name")
async def assign_plan_to_tenant_by_name(
    tenant_id: str,
    plan_name: str = Query(..., description="Plan api_name (e.g., 'starter', 'professional')"),
    admin_user: dict = Depends(require_admin_auth),
    admin_service: AdminService = Depends(get_admin_service)
):
    """
    Assign a subscription plan to a tenant by plan api_name.
    
    This endpoint is easier to use than /plan which requires plan_id.
    
    Plan names: free, starter, professional, enterprise
    
    After plan assignment:
    - module_entitlements is updated automatically
    - CRM users will see updated module states on next API call
    """
    try:
        # Look up plan by api_name
        plan = await admin_service.db.plans.find_one(
            {"api_name": plan_name},
            {"_id": 0, "id": 1, "name": 1}
        )
        if not plan:
            raise HTTPException(
                status_code=404, 
                detail=f"Plan '{plan_name}' not found. Valid plans: free, starter, professional, enterprise"
            )
        
        tenant = await admin_service.assign_plan_to_tenant(tenant_id, plan["id"])
        if not tenant:
            raise HTTPException(status_code=404, detail="Tenant not found")
        
        return {
            "message": f"Plan upgraded to {plan['name']}",
            "tenant_id": tenant_id,
            "new_plan": plan_name,
            "module_entitlements": tenant.get("module_entitlements", [])
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# =============================================================================
# PHASE 3: MODULE ENTITLEMENTS ROUTES
# =============================================================================

@router.get("/modules/available")
async def list_available_modules(
    admin_user: dict = Depends(require_admin_auth),
    admin_service: AdminService = Depends(get_admin_service)
):
    """List all available modules in the platform"""
    modules = admin_service.get_available_modules()
    return {"modules": modules}


@router.get("/tenants/{tenant_id}/modules")
async def get_tenant_modules(
    tenant_id: str,
    admin_user: dict = Depends(require_admin_auth),
    admin_service: AdminService = Depends(get_admin_service)
):
    """Get modules enabled for a tenant"""
    result = await admin_service.get_tenant_modules(tenant_id)
    if not result:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return result


@router.put("/tenants/{tenant_id}/modules")
async def update_tenant_modules(
    tenant_id: str,
    module_data: TenantModuleUpdate,
    admin_user: dict = Depends(require_admin_auth),
    admin_service: AdminService = Depends(get_admin_service)
):
    """Update enabled modules for a tenant"""
    try:
        result = await admin_service.update_tenant_modules(tenant_id, module_data.enabled_modules)
        if not result:
            raise HTTPException(status_code=404, detail="Tenant not found")
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/tenants/{tenant_id}/modules/toggle")
async def toggle_tenant_module(
    tenant_id: str,
    toggle_data: ModuleToggle,
    admin_user: dict = Depends(require_admin_auth),
    admin_service: AdminService = Depends(get_admin_service)
):
    """Toggle a single module for a tenant"""
    try:
        result = await admin_service.toggle_tenant_module(
            tenant_id, 
            toggle_data.module_api_name, 
            toggle_data.enabled
        )
        if not result:
            raise HTTPException(status_code=404, detail="Tenant not found")
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# =============================================================================
# TENANT SETTINGS ROUTES (Landing page, UI config)
# =============================================================================

VALID_LANDING_PAGES = [
    "/crm-platform",
    "/setup/docflow",
    "/setup",
    "/flows",
    "/task-manager",
    "/booking",
    "/files",
]


@router.get("/tenants/{tenant_id}/settings")
async def get_tenant_settings(
    tenant_id: str,
    admin_user: dict = Depends(require_admin_auth)
):
    """Get tenant UI settings (landing page, etc.)."""
    settings = await db.tenant_settings.find_one(
        {"tenant_id": tenant_id}, {"_id": 0}
    )
    return {
        "tenant_id": tenant_id,
        "default_landing_page": (settings or {}).get("default_landing_page", "/crm-platform"),
    }


@router.put("/tenants/{tenant_id}/settings")
async def update_tenant_settings(
    tenant_id: str,
    body: dict,
    admin_user: dict = Depends(require_admin_auth)
):
    """Update tenant UI settings."""
    update = {}
    if "default_landing_page" in body:
        lp = body["default_landing_page"]
        if lp and lp not in VALID_LANDING_PAGES:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid landing page. Allowed: {VALID_LANDING_PAGES}"
            )
        update["default_landing_page"] = lp

    if not update:
        raise HTTPException(status_code=400, detail="Nothing to update")

    from datetime import datetime, timezone
    update["updated_at"] = datetime.now(timezone.utc)

    await db.tenant_settings.update_one(
        {"tenant_id": tenant_id},
        {"$set": update},
        upsert=True,
    )
    return {"success": True, "tenant_id": tenant_id, **update}

@router.get("/audit-logs")
async def get_audit_logs(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    action: Optional[str] = Query(None, description="Filter by action type"),
    tenant_id: Optional[str] = Query(None, description="Filter by tenant"),
    actor_id: Optional[str] = Query(None, description="Filter by actor"),
    start_date: Optional[str] = Query(None, description="Start date (ISO format)"),
    end_date: Optional[str] = Query(None, description="End date (ISO format)"),
    search: Optional[str] = Query(None, description="Search in action, email, or details"),
    admin_user: dict = Depends(require_admin_auth)
):
    """
    Get audit logs with filtering and pagination
    
    Supports filtering by:
    - Action type (e.g., tenant_created, user_suspended)
    - Tenant ID
    - Actor (admin who performed the action)
    - Date range
    - Search term
    """
    from ..services import get_audit_log_service
    from datetime import datetime
    
    audit_service = get_audit_log_service(db)
    
    # Parse dates if provided
    start = datetime.fromisoformat(start_date.replace('Z', '+00:00')) if start_date else None
    end = datetime.fromisoformat(end_date.replace('Z', '+00:00')) if end_date else None
    
    result = await audit_service.get_logs(
        skip=skip,
        limit=limit,
        action_filter=action,
        tenant_id=tenant_id,
        actor_id=actor_id,
        start_date=start,
        end_date=end,
        search=search
    )
    
    return result


@router.get("/audit-logs/action-types")
async def get_audit_action_types(
    admin_user: dict = Depends(require_admin_auth)
):
    """Get all available audit action types for filtering"""
    from ..services import get_audit_log_service
    
    audit_service = get_audit_log_service(db)
    return await audit_service.get_action_types()


@router.get("/audit-logs/summary")
async def get_audit_summary(
    hours: int = Query(24, ge=1, le=168, description="Period in hours (max 7 days)"),
    admin_user: dict = Depends(require_admin_auth)
):
    """Get a summary of recent audit activity"""
    from ..services import get_audit_log_service
    
    audit_service = get_audit_log_service(db)
    return await audit_service.get_recent_actions_summary(hours=hours)


@router.get("/audit-logs/login-history")
async def get_admin_login_history(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    include_failed: bool = Query(True, description="Include failed login attempts"),
    admin_user: dict = Depends(require_admin_auth)
):
    """Get admin login history"""
    from ..services import get_audit_log_service
    
    audit_service = get_audit_log_service(db)
    return await audit_service.get_admin_login_history(
        skip=skip,
        limit=limit,
        include_failed=include_failed
    )


@router.get("/audit-logs/failed-logins")
async def get_failed_login_attempts(
    hours: int = Query(24, ge=1, le=168, description="Period in hours"),
    admin_user: dict = Depends(require_admin_auth)
):
    """Get failed login attempts for security monitoring"""
    from ..services import get_audit_log_service
    
    audit_service = get_audit_log_service(db)
    return await audit_service.get_failed_login_attempts(hours=hours)


@router.get("/audit-logs/{log_id}")
async def get_audit_log_detail(
    log_id: str,
    admin_user: dict = Depends(require_admin_auth)
):
    """Get details of a specific audit log entry"""
    from ..services import get_audit_log_service
    
    audit_service = get_audit_log_service(db)
    result = await audit_service.get_log_by_id(log_id)
    
    if not result:
        raise HTTPException(status_code=404, detail="Audit log entry not found")
    
    return result


# =============================================================================
# TENANT USAGE ROUTES
# =============================================================================

@router.get("/tenants/{tenant_id}/usage")
async def get_tenant_usage(
    tenant_id: str,
    admin_user: dict = Depends(require_admin_auth)
):
    """
    Get comprehensive usage metrics for a tenant
    
    Returns:
    - User count vs seat limit
    - Storage used vs limit
    - API calls today vs daily limit
    - Automation runs this month vs monthly limit
    - Active modules
    - Warnings for approaching limits
    """
    from ..services import get_tenant_usage_service
    
    usage_service = get_tenant_usage_service(db)
    result = await usage_service.get_tenant_usage(tenant_id)
    
    if not result:
        raise HTTPException(status_code=404, detail="Tenant not found")
    
    return result


@router.get("/usage/summary")
async def get_all_tenants_usage_summary(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    sort_by: str = Query("users", description="Sort by: users, storage, name"),
    sort_order: str = Query("desc", description="Sort order: asc, desc"),
    admin_user: dict = Depends(require_admin_auth)
):
    """
    Get usage summary for all tenants
    
    Useful for identifying tenants approaching limits
    """
    from ..services import get_tenant_usage_service
    
    usage_service = get_tenant_usage_service(db)
    return await usage_service.get_usage_summary_all_tenants(
        skip=skip,
        limit=limit,
        sort_by=sort_by,
        sort_order=sort_order
    )


@router.get("/usage/approaching-limits")
async def get_tenants_approaching_limits(
    threshold: int = Query(80, ge=50, le=100, description="Warning threshold percentage"),
    admin_user: dict = Depends(require_admin_auth)
):
    """
    Get tenants that are approaching their usage limits
    
    Returns tenants where any metric is above the threshold percentage
    """
    from ..services import get_tenant_usage_service
    
    usage_service = get_tenant_usage_service(db)
    return await usage_service.get_tenants_approaching_limits(threshold_percent=threshold)


# =============================================================================
# ADMIN ACTIVITY MONITORING
# =============================================================================

@router.get("/activity/my-actions")
async def get_my_admin_actions(
    days: int = Query(30, ge=1, le=90, description="Days to look back"),
    limit: int = Query(100, ge=1, le=500),
    admin_user: dict = Depends(require_admin_auth)
):
    """Get the current admin's recent activity"""
    from ..services import get_audit_log_service
    
    audit_service = get_audit_log_service(db)
    return await audit_service.get_admin_activity(
        actor_id=admin_user["id"],
        days=days,
        limit=limit
    )


@router.get("/activity/dashboard")
async def get_admin_activity_dashboard(
    admin_user: dict = Depends(require_admin_auth)
):
    """
    Get admin activity dashboard data
    
    Returns:
    - Recent actions summary (24h)
    - Login history
    - Failed login attempts
    - Active admins
    """
    from ..services import get_audit_log_service
    
    audit_service = get_audit_log_service(db)
    
    # Get summary of recent actions
    actions_summary = await audit_service.get_recent_actions_summary(hours=24)
    
    # Get recent login history
    login_history = await audit_service.get_admin_login_history(limit=10)
    
    # Get failed logins in last 24 hours
    failed_logins = await audit_service.get_failed_login_attempts(hours=24)
    
    # Get active admins (those who logged in within 7 days)
    from datetime import datetime, timezone, timedelta
    week_ago = datetime.now(timezone.utc) - timedelta(days=7)
    
    active_admins_pipeline = [
        {"$match": {
            "action": "admin_login",
            "timestamp": {"$gte": week_ago}
        }},
        {"$group": {
            "_id": "$actor_email",
            "last_login": {"$max": "$timestamp"},
            "login_count": {"$sum": 1}
        }},
        {"$sort": {"last_login": -1}}
    ]
    
    active_admins = await audit_service.collection.aggregate(active_admins_pipeline).to_list(100)
    
    return {
        "summary_24h": actions_summary,
        "recent_logins": login_history["logs"][:10],
        "failed_logins_24h": {
            "count": len(failed_logins),
            "attempts": failed_logins[:10]
        },
        "active_admins": [
            {
                "email": a["_id"],
                "last_login": a["last_login"].isoformat() if a["last_login"] else None,
                "login_count_7d": a["login_count"]
            }
            for a in active_admins
        ]
    }



# =============================================================================
# EMAIL LOGS ROUTES
# =============================================================================

@router.get("/tenants/{tenant_id}/email-logs")
async def get_tenant_email_logs(
    tenant_id: str,
    limit: int = Query(20, ge=1, le=100),
    email_type: Optional[str] = Query(None, description="Filter by email type"),
    admin_user: dict = Depends(require_admin_auth)
):
    """
    Get email logs for a tenant.
    Useful for verifying welcome emails, password resets, etc.
    """
    # Verify tenant exists
    tenant = await db.tenants.find_one({"id": tenant_id}, {"_id": 0, "id": 1})
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    
    # Build query
    query = {}
    
    # Try to find emails for users in this tenant
    tenant_users = await db.users.find(
        {"tenant_id": tenant_id},
        {"_id": 0, "email": 1}
    ).to_list(1000)
    
    tenant_emails = [u["email"] for u in tenant_users]
    
    if tenant_emails:
        query["to"] = {"$in": tenant_emails}
    
    if email_type:
        query["type"] = email_type
    
    # Get logs
    logs = await db.email_logs.find(
        query,
        {"_id": 0}
    ).sort("created_at", -1).limit(limit).to_list(limit)
    
    return {
        "tenant_id": tenant_id,
        "total": len(logs),
        "email_logs": logs
    }


@router.get("/email-logs")
async def get_all_email_logs(
    limit: int = Query(50, ge=1, le=200),
    email_type: Optional[str] = Query(None, description="Filter by email type"),
    status: Optional[str] = Query(None, description="Filter by status: sent, mocked, failed"),
    admin_user: dict = Depends(require_admin_auth)
):
    """
    Get all email logs across the platform.
    Useful for monitoring email delivery.
    """
    query = {}
    
    if email_type:
        query["type"] = email_type
    
    if status:
        query["status"] = status
    
    logs = await db.email_logs.find(
        query,
        {"_id": 0}
    ).sort("created_at", -1).limit(limit).to_list(limit)
    
    # Get stats
    total_sent = await db.email_logs.count_documents({"status": "sent"})
    total_mocked = await db.email_logs.count_documents({"status": "mocked"})
    total_failed = await db.email_logs.count_documents({"status": "failed"})
    
    return {
        "total": len(logs),
        "stats": {
            "sent": total_sent,
            "mocked": total_mocked,
            "failed": total_failed
        },
        "email_logs": logs
    }



@router.post("/migrate/provision-licenses")
async def migrate_provision_licenses(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """
    One-time migration: Provision licenses and assign admin seats for ALL existing tenants.
    This fixes tenants that were created before the license system existed.
    """
    # Verify admin token
    admin_service = await get_admin_service()
    admin_user = await admin_service.verify_admin_token(credentials.credentials)
    if not admin_user:
        raise HTTPException(status_code=401, detail="Invalid admin credentials")
    
    from modules.admin.services.tenant_license_service import get_tenant_license_service
    license_service = get_tenant_license_service(db)
    
    tenants = await db.tenants.find({}, {"_id": 0, "id": 1, "plan": 1, "tenant_name": 1}).to_list(500)
    
    results = {"fixed": 0, "skipped": 0, "errors": [], "details": []}
    
    for tenant in tenants:
        tid = tenant["id"]
        plan = tenant.get("plan", "free")
        
        try:
            # Find tenant admin
            admin = await db.users.find_one(
                {"tenant_id": tid, "is_super_admin": True},
                {"_id": 0, "id": 1, "email": 1}
            )
            if not admin:
                admin = await db.users.find_one(
                    {"tenant_id": tid},
                    {"_id": 0, "id": 1, "email": 1}
                )
            
            admin_user_id = admin["id"] if admin else None
            
            # Provision licenses + assign admin seats
            provisioned = await license_service.provision_licenses_for_plan(
                tenant_id=tid,
                plan=plan,
                actor_id="migration",
                actor_email="system@migration",
                admin_user_id=admin_user_id
            )
            
            if provisioned:
                results["fixed"] += 1
                results["details"].append({
                    "tenant_id": tid,
                    "plan": plan,
                    "licenses_provisioned": len(provisioned),
                    "admin_email": admin["email"] if admin else "N/A"
                })
            else:
                results["skipped"] += 1
                
        except Exception as e:
            results["errors"].append({"tenant_id": tid, "error": str(e)})
    
    return {
        "success": True,
        "message": f"Migration complete: {results['fixed']} tenants fixed, {results['skipped']} skipped, {len(results['errors'])} errors",
        **results
    }
