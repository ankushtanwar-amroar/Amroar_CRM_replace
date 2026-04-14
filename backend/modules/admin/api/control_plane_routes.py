"""
Admin Portal - Control Plane Routes
Handles tenant modules, limits, quotas, and provisioning jobs.
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from motor.motor_asyncio import AsyncIOMotorClient
from typing import Optional, List
from datetime import datetime
import os
import logging

from ..models import (
    TenantModuleCreate,
    TenantModuleResponse,
    ModuleToggle,
    TenantLimitCreate,
    TenantLimitUpdate,
    TenantLimitResponse,
    ProvisioningJobCreate,
    ProvisioningJobResponse,
    TenantSupportAction,
    TenantSupportActionRequest,
    TenantStatus,
    BillingStatus,
    TenantBillingUpdate
)
from ..services import (
    AdminService,
    get_tenant_modules_service,
    get_tenant_limits_service,
    get_provisioning_jobs_service,
    get_audit_log_service
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Admin Control Plane"])

# Database connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

security = HTTPBearer()


async def get_admin_service() -> AdminService:
    return AdminService(db)


async def require_admin_auth(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    admin_service: AdminService = Depends(get_admin_service)
):
    token = credentials.credentials
    admin_user = await admin_service.verify_admin_token(token)
    
    if not admin_user:
        raise HTTPException(
            status_code=401,
            detail="Invalid admin credentials or insufficient privileges"
        )
    
    return admin_user


# =============================================================================
# TENANT MODULES ROUTES (tenant_modules collection)
# =============================================================================

@router.get("/tenants/{tenant_id}/modules", response_model=List[TenantModuleResponse])
async def get_tenant_modules(
    tenant_id: str,
    admin_user: dict = Depends(require_admin_auth)
):
    """
    Get all module entitlements for a tenant.
    Includes migration from legacy storage if needed.
    """
    service = get_tenant_modules_service(db)
    modules = await service.get_tenant_modules(tenant_id)
    return modules


@router.post("/tenants/{tenant_id}/modules/{module_code}/enable")
async def enable_tenant_module(
    tenant_id: str,
    module_code: str,
    enabled_source: str = Query("MANUAL_OVERRIDE", description="Source of enablement"),
    end_at: Optional[datetime] = Query(None, description="When module access expires"),
    admin_user: dict = Depends(require_admin_auth)
):
    """Enable a specific module for a tenant"""
    service = get_tenant_modules_service(db)
    audit_service = get_audit_log_service(db)
    
    # Get old state for audit
    was_enabled = await service.is_module_enabled(tenant_id, module_code)
    
    result = await service.enable_module(
        tenant_id, module_code,
        enabled_source=enabled_source,
        end_at=end_at
    )
    
    if not result:
        raise HTTPException(status_code=500, detail="Failed to enable module")
    
    # Audit log
    await audit_service.log_action(
        action="module_enabled",
        actor_id=admin_user["id"],
        actor_email=admin_user["email"],
        tenant_id=tenant_id,
        module_name=module_code,
        old_value={"enabled": was_enabled},
        new_value={"enabled": True, "source": enabled_source}
    )
    
    return {"success": True, "module": result}


@router.post("/tenants/{tenant_id}/modules/{module_code}/disable")
async def disable_tenant_module(
    tenant_id: str,
    module_code: str,
    reason: Optional[str] = Query(None, description="Reason for disabling"),
    admin_user: dict = Depends(require_admin_auth)
):
    """Disable a specific module for a tenant"""
    service = get_tenant_modules_service(db)
    audit_service = get_audit_log_service(db)
    
    success = await service.disable_module(tenant_id, module_code)
    
    # Audit log
    await audit_service.log_action(
        action="module_disabled",
        actor_id=admin_user["id"],
        actor_email=admin_user["email"],
        tenant_id=tenant_id,
        module_name=module_code,
        old_value={"enabled": True},
        new_value={"enabled": False},
        reason=reason
    )
    
    return {"success": success, "module_code": module_code}


@router.put("/tenants/{tenant_id}/modules/bulk")
async def bulk_update_tenant_modules(
    tenant_id: str,
    modules: List[ModuleToggle],
    admin_user: dict = Depends(require_admin_auth)
):
    """Bulk update modules for a tenant"""
    service = get_tenant_modules_service(db)
    audit_service = get_audit_log_service(db)
    
    # Get old state
    old_modules = await service.get_enabled_module_codes(tenant_id)
    
    updates = [
        {
            "module_code": m.module_api_name,
            "is_enabled": m.enabled,
            "enabled_source": m.enabled_source.value if m.enabled_source else "MANUAL_OVERRIDE"
        }
        for m in modules
    ]
    
    result = await service.bulk_update_modules(tenant_id, updates)
    
    # Get new state
    new_modules = await service.get_enabled_module_codes(tenant_id)
    
    # Audit log
    await audit_service.log_action(
        action="modules_updated",
        actor_id=admin_user["id"],
        actor_email=admin_user["email"],
        tenant_id=tenant_id,
        old_value={"modules": old_modules},
        new_value={"modules": new_modules}
    )
    
    return {"success": True, "modules": result}


@router.get("/modules/available")
async def get_available_modules(
    admin_user: dict = Depends(require_admin_auth)
):
    """Get all available platform modules"""
    # Use AdminService which returns properly formatted modules
    # with fields: id, name, api_name, description, category, is_premium, sort_order
    from modules.admin.services.admin_service import get_admin_service
    service = get_admin_service(db)
    return {"modules": service.get_available_modules()}


@router.post("/tenants/{tenant_id}/plan/sync")
async def sync_tenant_plan_data(
    tenant_id: str,
    admin_user: dict = Depends(require_admin_auth)
):
    """
    Synchronize all tenant data with their current plan.
    
    This ensures consistency across:
    - Module entitlements (tenants.module_entitlements)
    - Billing config (tenant_billing_config.current_plan)
    - Module toggles (tenant_modules collection)
    - Limits (seat_limit, storage_limit)
    
    Use this when data inconsistencies are detected.
    """
    from modules.admin.services.admin_service import get_admin_service
    service = get_admin_service(db)
    
    try:
        result = await service.sync_tenant_plan_data(
            tenant_id=tenant_id,
            actor_id=admin_user.get("user_id"),
            actor_email=admin_user.get("email")
        )
        return result
    except ValueError as e:
        raise HTTPException(404, str(e))
    except Exception as e:
        logger.error(f"Failed to sync tenant plan data: {e}")
        raise HTTPException(500, f"Failed to sync: {str(e)}")


@router.post("/tenants/{tenant_id}/plan/change")
async def change_tenant_plan(
    tenant_id: str,
    plan: str = Query(..., description="New plan: free, starter, professional, enterprise"),
    reason: str = Query(None, description="Reason for plan change"),
    admin_user: dict = Depends(require_admin_auth)
):
    """
    Change a tenant's plan and automatically sync all related data.
    
    This is the preferred way to change a tenant's plan as it ensures
    all data sources (modules, billing, limits) stay synchronized.
    """
    from modules.admin.services.admin_service import get_admin_service
    service = get_admin_service(db)
    
    try:
        result = await service.change_tenant_plan(
            tenant_id=tenant_id,
            new_plan=plan,
            reason=reason,
            actor_id=admin_user.get("user_id"),
            actor_email=admin_user.get("email")
        )
        return result
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        logger.error(f"Failed to change tenant plan: {e}")
        raise HTTPException(500, f"Failed to change plan: {str(e)}")


# =============================================================================
# TENANT LIMITS ROUTES (tenant_limits collection)
# =============================================================================

@router.get("/tenants/{tenant_id}/limits", response_model=List[TenantLimitResponse])
async def get_tenant_limits(
    tenant_id: str,
    admin_user: dict = Depends(require_admin_auth)
):
    """Get all limits and quotas for a tenant"""
    service = get_tenant_limits_service(db)
    limits = await service.get_tenant_limits(tenant_id)
    return limits


@router.get("/tenants/{tenant_id}/limits/summary")
async def get_tenant_limits_summary(
    tenant_id: str,
    admin_user: dict = Depends(require_admin_auth)
):
    """Get a summary of limit usage for a tenant"""
    service = get_tenant_limits_service(db)
    return await service.get_limits_summary(tenant_id)


@router.get("/tenants/{tenant_id}/limits/{limit_key}")
async def get_tenant_limit(
    tenant_id: str,
    limit_key: str,
    admin_user: dict = Depends(require_admin_auth)
):
    """Get a specific limit for a tenant"""
    service = get_tenant_limits_service(db)
    limit = await service.get_limit(tenant_id, limit_key)
    
    if not limit:
        raise HTTPException(status_code=404, detail=f"Limit {limit_key} not found")
    
    return limit


@router.put("/tenants/{tenant_id}/limits/{limit_key}")
async def update_tenant_limit(
    tenant_id: str,
    limit_key: str,
    limit_value: int = Query(..., ge=0, description="New limit value"),
    enforcement_type: Optional[str] = Query(None, description="HARD_STOP or SOFT_WARNING"),
    admin_user: dict = Depends(require_admin_auth)
):
    """Update a specific limit for a tenant"""
    service = get_tenant_limits_service(db)
    audit_service = get_audit_log_service(db)
    
    # Get old value
    old_limit = await service.get_limit(tenant_id, limit_key)
    old_value = old_limit.get("limit_value") if old_limit else None
    
    result = await service.set_limit(
        tenant_id, limit_key, limit_value,
        enforcement_type=enforcement_type
    )
    
    # Audit log
    await audit_service.log_action(
        action="limit_updated",
        actor_id=admin_user["id"],
        actor_email=admin_user["email"],
        tenant_id=tenant_id,
        entity_name=limit_key,
        old_value={"limit_value": old_value},
        new_value={"limit_value": limit_value}
    )
    
    return result


@router.post("/tenants/{tenant_id}/limits/initialize")
async def initialize_tenant_limits(
    tenant_id: str,
    plan_code: str = Query(..., description="Plan code to use for defaults"),
    admin_user: dict = Depends(require_admin_auth)
):
    """Initialize all limits for a tenant based on a plan"""
    service = get_tenant_limits_service(db)
    audit_service = get_audit_log_service(db)
    
    limits = await service.initialize_limits_from_plan(tenant_id, plan_code)
    
    # Audit log
    await audit_service.log_action(
        action="limits_initialized",
        actor_id=admin_user["id"],
        actor_email=admin_user["email"],
        tenant_id=tenant_id,
        details={"plan_code": plan_code, "limits_count": len(limits)}
    )
    
    return {"success": True, "limits": limits}


@router.get("/limits/standard")
async def get_standard_limits(
    admin_user: dict = Depends(require_admin_auth)
):
    """Get definitions of all standard platform limits"""
    service = get_tenant_limits_service(db)
    return {"limits": service.get_standard_limits()}


# =============================================================================
# PROVISIONING JOBS ROUTES
# =============================================================================

@router.get("/tenants/{tenant_id}/provisioning/jobs")
async def get_tenant_provisioning_jobs(
    tenant_id: str,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    status: Optional[str] = Query(None, description="Filter by status"),
    admin_user: dict = Depends(require_admin_auth)
):
    """Get provisioning jobs for a tenant"""
    service = get_provisioning_jobs_service(db)
    return await service.get_tenant_jobs(tenant_id, skip, limit, status)


@router.post("/tenants/{tenant_id}/provisioning/jobs")
async def create_provisioning_job(
    tenant_id: str,
    job_type: str = Query(..., description="Job type"),
    parameters: dict = None,
    admin_user: dict = Depends(require_admin_auth)
):
    """Create a new provisioning job"""
    service = get_provisioning_jobs_service(db)
    audit_service = get_audit_log_service(db)
    
    job = await service.create_job(
        tenant_id=tenant_id,
        job_type=job_type,
        requested_by=admin_user["id"],
        request_source="ADMIN_PORTAL",
        parameters=parameters or {}
    )
    
    # Audit log
    await audit_service.log_action(
        action="provisioning_job_created",
        actor_id=admin_user["id"],
        actor_email=admin_user["email"],
        tenant_id=tenant_id,
        details={"job_id": job["id"], "job_type": job_type}
    )
    
    return job


@router.get("/provisioning/jobs/{job_id}")
async def get_provisioning_job(
    job_id: str,
    admin_user: dict = Depends(require_admin_auth)
):
    """Get a specific provisioning job"""
    service = get_provisioning_jobs_service(db)
    job = await service.get_job(job_id)
    
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    return job


@router.post("/provisioning/jobs/{job_id}/execute")
async def execute_provisioning_job(
    job_id: str,
    admin_user: dict = Depends(require_admin_auth)
):
    """Execute a queued provisioning job"""
    service = get_provisioning_jobs_service(db)
    audit_service = get_audit_log_service(db)
    
    job = await service.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    if job.get("status") != "QUEUED":
        raise HTTPException(status_code=400, detail="Job is not in QUEUED status")
    
    result = await service.execute_job(job_id)
    
    # Audit log
    await audit_service.log_action(
        action="provisioning_job_completed" if result.get("success") else "provisioning_job_failed",
        actor_id=admin_user["id"],
        actor_email=admin_user["email"],
        tenant_id=job.get("tenant_id"),
        details={"job_id": job_id, "result": result}
    )
    
    return result


@router.post("/provisioning/jobs/{job_id}/retry")
async def retry_provisioning_job(
    job_id: str,
    admin_user: dict = Depends(require_admin_auth)
):
    """Retry a failed provisioning job"""
    service = get_provisioning_jobs_service(db)
    audit_service = get_audit_log_service(db)
    
    job = await service.retry_job(job_id)
    
    if not job:
        raise HTTPException(status_code=400, detail="Job not found or not in FAILED status")
    
    # Audit log
    await audit_service.log_action(
        action="provisioning_job_retried",
        actor_id=admin_user["id"],
        actor_email=admin_user["email"],
        tenant_id=job.get("tenant_id"),
        details={"job_id": job_id}
    )
    
    return job


@router.delete("/provisioning/jobs/{job_id}")
async def cancel_provisioning_job(
    job_id: str,
    admin_user: dict = Depends(require_admin_auth)
):
    """Cancel a queued provisioning job"""
    service = get_provisioning_jobs_service(db)
    audit_service = get_audit_log_service(db)
    
    job = await service.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    success = await service.cancel_job(job_id)
    
    if not success:
        raise HTTPException(status_code=400, detail="Job is not in QUEUED status")
    
    # Audit log
    await audit_service.log_action(
        action="provisioning_job_cancelled",
        actor_id=admin_user["id"],
        actor_email=admin_user["email"],
        tenant_id=job.get("tenant_id"),
        details={"job_id": job_id}
    )
    
    return {"success": True}


@router.get("/provisioning/summary")
async def get_provisioning_summary(
    hours: int = Query(24, ge=1, le=168),
    admin_user: dict = Depends(require_admin_auth)
):
    """Get summary of provisioning jobs"""
    service = get_provisioning_jobs_service(db)
    return await service.get_jobs_summary(hours)


# =============================================================================
# TENANT BILLING ROUTES
# =============================================================================

@router.put("/tenants/{tenant_id}/billing")
async def update_tenant_billing(
    tenant_id: str,
    billing: TenantBillingUpdate,
    admin_user: dict = Depends(require_admin_auth)
):
    """Update billing information for a tenant"""
    audit_service = get_audit_log_service(db)
    
    # Get current tenant
    tenant = await db.tenants.find_one({"id": tenant_id}, {"_id": 0})
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    
    # Build update
    update_data = {}
    old_values = {}
    
    if billing.stripe_customer_id is not None:
        old_values["stripe_customer_id"] = tenant.get("stripe_customer_id")
        update_data["stripe_customer_id"] = billing.stripe_customer_id
    
    if billing.stripe_subscription_id is not None:
        old_values["stripe_subscription_id"] = tenant.get("stripe_subscription_id")
        update_data["stripe_subscription_id"] = billing.stripe_subscription_id
    
    if billing.billing_status is not None:
        old_values["billing_status"] = tenant.get("billing_status")
        update_data["billing_status"] = billing.billing_status.value
    
    if billing.billing_email is not None:
        old_values["billing_email"] = tenant.get("billing_email")
        update_data["billing_email"] = billing.billing_email
    
    if billing.next_billing_date is not None:
        old_values["next_billing_date"] = tenant.get("next_billing_date")
        update_data["next_billing_date"] = billing.next_billing_date
    
    if billing.is_trial is not None:
        old_values["is_trial"] = tenant.get("is_trial")
        update_data["is_trial"] = billing.is_trial
    
    if billing.trial_ends_at is not None:
        old_values["trial_ends_at"] = tenant.get("trial_ends_at")
        update_data["trial_ends_at"] = billing.trial_ends_at
    
    if update_data:
        from datetime import datetime, timezone
        update_data["updated_at"] = datetime.now(timezone.utc)
        
        await db.tenants.update_one(
            {"id": tenant_id},
            {"$set": update_data}
        )
        
        # Audit log
        await audit_service.log_action(
            action="billing_updated",
            actor_id=admin_user["id"],
            actor_email=admin_user["email"],
            tenant_id=tenant_id,
            old_value=old_values,
            new_value=update_data
        )
    
    # Return updated tenant
    updated = await db.tenants.find_one({"id": tenant_id}, {"_id": 0})
    return updated


# =============================================================================
# TENANT SUPPORT ACTIONS
# =============================================================================

@router.post("/tenants/{tenant_id}/support/action")
async def execute_support_action(
    tenant_id: str,
    request: TenantSupportActionRequest,
    admin_user: dict = Depends(require_admin_auth)
):
    """Execute a support action on a tenant"""
    from datetime import datetime, timezone, timedelta
    
    audit_service = get_audit_log_service(db)
    provisioning_service = get_provisioning_jobs_service(db)
    
    tenant = await db.tenants.find_one({"id": tenant_id}, {"_id": 0})
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    
    action = request.action
    params = request.parameters
    reason = request.reason
    now = datetime.now(timezone.utc)
    
    result = {"action": action.value, "success": False, "message": ""}
    
    if action == TenantSupportAction.SUSPEND:
        await db.tenants.update_one(
            {"id": tenant_id},
            {"$set": {
                "status": "SUSPENDED",
                "suspended_at": now,
                "suspended_reason": reason,
                "updated_at": now
            }}
        )
        result["success"] = True
        result["message"] = "Tenant suspended"
    
    elif action == TenantSupportAction.REACTIVATE:
        await db.tenants.update_one(
            {"id": tenant_id},
            {
                "$set": {"status": "ACTIVE", "updated_at": now},
                "$unset": {"suspended_at": "", "suspended_reason": ""}
            }
        )
        result["success"] = True
        result["message"] = "Tenant reactivated"
    
    elif action == TenantSupportAction.SET_READ_ONLY:
        await db.tenants.update_one(
            {"id": tenant_id},
            {"$set": {"status": "READ_ONLY", "updated_at": now}}
        )
        result["success"] = True
        result["message"] = "Tenant set to read-only mode"
    
    elif action == TenantSupportAction.MAINTENANCE_MODE:
        in_maintenance = params.get("enable", True)
        await db.tenants.update_one(
            {"id": tenant_id},
            {"$set": {"in_maintenance": in_maintenance, "updated_at": now}}
        )
        result["success"] = True
        result["message"] = f"Maintenance mode {'enabled' if in_maintenance else 'disabled'}"
    
    elif action == TenantSupportAction.EXTEND_TRIAL:
        days = params.get("days", 14)
        current_trial_ends = tenant.get("trial_ends_at") or now
        if isinstance(current_trial_ends, str):
            current_trial_ends = datetime.fromisoformat(current_trial_ends.replace("Z", "+00:00"))
        # Ensure timezone-aware
        if isinstance(current_trial_ends, datetime) and current_trial_ends.tzinfo is None:
            current_trial_ends = current_trial_ends.replace(tzinfo=timezone.utc)
        new_trial_ends = max(current_trial_ends, now) + timedelta(days=days)
        
        await db.tenants.update_one(
            {"id": tenant_id},
            {"$set": {
                "is_trial": True,
                "trial_ends_at": new_trial_ends,
                "updated_at": now
            }}
        )
        result["success"] = True
        result["message"] = f"Trial extended by {days} days until {new_trial_ends.isoformat()}"
    
    elif action == TenantSupportAction.RESEND_WELCOME:
        # TODO: Implement email sending
        result["success"] = True
        result["message"] = "Welcome email queued for resend (email service not configured)"
    
    elif action == TenantSupportAction.CREATE_PAYMENT_LINK:
        # TODO: Implement Stripe integration
        result["success"] = False
        result["message"] = "Stripe integration not configured"
    
    elif action == TenantSupportAction.RETRY_PROVISIONING:
        # Create a new provisioning job
        job = await provisioning_service.create_job(
            tenant_id=tenant_id,
            job_type="CREATE_TENANT",
            requested_by=admin_user["id"],
            request_source="SUPPORT_ACTION",
            parameters={"retry": True}
        )
        result["success"] = True
        result["message"] = f"Provisioning job created: {job['id']}"
        result["job_id"] = job["id"]
    
    # Audit log
    await audit_service.log_action(
        action=f"tenant_{action.value.lower()}",
        actor_id=admin_user["id"],
        actor_email=admin_user["email"],
        tenant_id=tenant_id,
        reason=reason,
        details={"action": action.value, "parameters": params, "result": result}
    )
    
    return result


@router.get("/tenants/{tenant_id}/support/status")
async def get_tenant_support_status(
    tenant_id: str,
    admin_user: dict = Depends(require_admin_auth)
):
    """Get support status information for a tenant"""
    tenant = await db.tenants.find_one({"id": tenant_id}, {"_id": 0})
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    
    # Get recent support actions from audit log
    audit_service = get_audit_log_service(db)
    recent_actions = await audit_service.get_logs(
        tenant_id=tenant_id,
        limit=10,
        search="support"
    )
    
    # Get provisioning job status
    provisioning_service = get_provisioning_jobs_service(db)
    jobs = await provisioning_service.get_tenant_jobs(tenant_id, limit=5)
    
    return {
        "tenant_id": tenant_id,
        "status": tenant.get("status"),
        "is_trial": tenant.get("is_trial", False),
        "trial_ends_at": tenant.get("trial_ends_at"),
        "billing_status": tenant.get("billing_status"),
        "in_maintenance": tenant.get("in_maintenance", False),
        "suspended_at": tenant.get("suspended_at"),
        "suspended_reason": tenant.get("suspended_reason"),
        "recent_provisioning_jobs": jobs.get("jobs", []),
        "recent_support_actions": recent_actions.get("logs", [])
    }
