"""
License & Version Control Routes - Admin Portal API
Routes for license catalog, tenant licenses, releases, and version control
"""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from typing import Optional, List
import logging

from config.database import db
from ..models.license_models import (
    # License Catalog
    LicenseCatalogCreate,
    LicenseCatalogUpdate,
    # Platform Release
    PlatformReleaseCreate,
    PlatformReleaseUpdate,
    # Tenant License
    TenantLicenseCreate,
    TenantLicenseUpdate,
    # User License
    UserLicenseAssign,
    # Tenant Version
    TenantVersionUpdate,
    TenantUpgradeRequest,
    # Billing
    TenantBillingConfigCreate,
    TenantBillingConfigUpdate,
    # Plan Config
    PlanLicenseConfigUpdate
)
from ..services.license_catalog_service import get_license_catalog_service, LicenseCatalogService
from ..services.platform_release_service import get_platform_release_service, PlatformReleaseService
from ..services.tenant_license_service import get_tenant_license_service, TenantLicenseService
from .admin_routes import require_admin_auth

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Admin - Licenses & Versions"])


# Dependency to get services
def get_license_catalog() -> LicenseCatalogService:
    return get_license_catalog_service(db)

def get_platform_release() -> PlatformReleaseService:
    return get_platform_release_service(db)

def get_tenant_license() -> TenantLicenseService:
    return get_tenant_license_service(db)


# =============================================================================
# LICENSE CATALOG ROUTES
# =============================================================================

@router.post("/license-catalog", status_code=status.HTTP_201_CREATED)
async def create_license(
    license_data: LicenseCatalogCreate,
    admin_user: dict = Depends(require_admin_auth),
    service: LicenseCatalogService = Depends(get_license_catalog)
):
    """Create a new license in the catalog"""
    try:
        return await service.create_license(
            license_data.model_dump(),
            actor_id=admin_user.get("id"),
            actor_email=admin_user.get("email")
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/license-catalog")
async def list_licenses(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    active_only: bool = Query(False),
    search: Optional[str] = Query(None),
    admin_user: dict = Depends(require_admin_auth),
    service: LicenseCatalogService = Depends(get_license_catalog)
):
    """List all licenses in the catalog"""
    return await service.list_licenses(
        skip=skip,
        limit=limit,
        active_only=active_only,
        search=search
    )


@router.get("/license-catalog/{license_id}")
async def get_license(
    license_id: str,
    admin_user: dict = Depends(require_admin_auth),
    service: LicenseCatalogService = Depends(get_license_catalog)
):
    """Get a license by ID"""
    license_entry = await service.get_license(license_id)
    if not license_entry:
        raise HTTPException(status_code=404, detail="License not found")
    return license_entry


@router.get("/license-catalog/code/{license_code}")
async def get_license_by_code(
    license_code: str,
    admin_user: dict = Depends(require_admin_auth),
    service: LicenseCatalogService = Depends(get_license_catalog)
):
    """Get a license by code"""
    license_entry = await service.get_license_by_code(license_code)
    if not license_entry:
        raise HTTPException(status_code=404, detail="License not found")
    return license_entry


@router.patch("/license-catalog/{license_id}")
async def update_license(
    license_id: str,
    update_data: LicenseCatalogUpdate,
    admin_user: dict = Depends(require_admin_auth),
    service: LicenseCatalogService = Depends(get_license_catalog)
):
    """Update a license in the catalog"""
    try:
        result = await service.update_license(
            license_id,
            update_data.model_dump(exclude_unset=True),
            actor_id=admin_user.get("id"),
            actor_email=admin_user.get("email")
        )
        if not result:
            raise HTTPException(status_code=404, detail="License not found")
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/license-catalog/{license_id}")
async def delete_license(
    license_id: str,
    admin_user: dict = Depends(require_admin_auth),
    service: LicenseCatalogService = Depends(get_license_catalog)
):
    """Delete (deactivate) a license"""
    try:
        result = await service.delete_license(
            license_id,
            actor_id=admin_user.get("id"),
            actor_email=admin_user.get("email")
        )
        if not result:
            raise HTTPException(status_code=404, detail="License not found")
        return {"success": True, "message": "License deactivated"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/license-catalog/{license_code}/dependencies")
async def get_license_dependencies(
    license_code: str,
    admin_user: dict = Depends(require_admin_auth),
    service: LicenseCatalogService = Depends(get_license_catalog)
):
    """Get all dependencies for a license"""
    return await service.get_license_dependencies(license_code)


@router.post("/license-catalog/seed-defaults")
async def seed_default_licenses(
    admin_user: dict = Depends(require_admin_auth),
    service: LicenseCatalogService = Depends(get_license_catalog)
):
    """Seed default licenses (for initial setup)"""
    created = await service.seed_default_licenses(
        actor_id=admin_user.get("id"),
        actor_email=admin_user.get("email")
    )
    return {
        "success": True,
        "created_count": len(created),
        "licenses": created
    }


# =============================================================================
# PLATFORM RELEASE ROUTES
# =============================================================================

@router.post("/releases", status_code=status.HTTP_201_CREATED)
async def create_release(
    release_data: PlatformReleaseCreate,
    admin_user: dict = Depends(require_admin_auth),
    service: PlatformReleaseService = Depends(get_platform_release)
):
    """Create a new platform release"""
    try:
        return await service.create_release(
            release_data.model_dump(),
            actor_id=admin_user.get("id"),
            actor_email=admin_user.get("email")
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/releases")
async def list_releases(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    status_filter: Optional[str] = Query(None),
    include_deprecated: bool = Query(False),
    admin_user: dict = Depends(require_admin_auth),
    service: PlatformReleaseService = Depends(get_platform_release)
):
    """List all platform releases"""
    return await service.list_releases(
        skip=skip,
        limit=limit,
        status_filter=status_filter,
        include_deprecated=include_deprecated
    )


@router.get("/releases/default-for-new-tenants")
async def get_default_release(
    admin_user: dict = Depends(require_admin_auth),
    service: PlatformReleaseService = Depends(get_platform_release)
):
    """Get the default release for new tenants"""
    release = await service.get_default_release_for_new_tenants()
    if not release:
        raise HTTPException(status_code=404, detail="No default release configured")
    return release


@router.get("/releases/{release_id}")
async def get_release(
    release_id: str,
    admin_user: dict = Depends(require_admin_auth),
    service: PlatformReleaseService = Depends(get_platform_release)
):
    """Get a release by ID"""
    release = await service.get_release(release_id)
    if not release:
        raise HTTPException(status_code=404, detail="Release not found")
    return release


@router.patch("/releases/{release_id}")
async def update_release(
    release_id: str,
    update_data: PlatformReleaseUpdate,
    admin_user: dict = Depends(require_admin_auth),
    service: PlatformReleaseService = Depends(get_platform_release)
):
    """Update a platform release"""
    result = await service.update_release(
        release_id,
        update_data.model_dump(exclude_unset=True),
        actor_id=admin_user.get("id"),
        actor_email=admin_user.get("email")
    )
    if not result:
        raise HTTPException(status_code=404, detail="Release not found")
    return result


@router.post("/releases/seed-default")
async def seed_default_release(
    admin_user: dict = Depends(require_admin_auth),
    service: PlatformReleaseService = Depends(get_platform_release)
):
    """Seed the initial platform release (for setup)"""
    release = await service.seed_default_release(
        actor_id=admin_user.get("id"),
        actor_email=admin_user.get("email")
    )
    if not release:
        return {"success": True, "message": "Default release already exists"}
    return {"success": True, "release": release}


# =============================================================================
# TENANT LICENSE (SEAT POOL) ROUTES
# =============================================================================

@router.get("/tenants/{tenant_id}/licenses")
async def get_tenant_licenses(
    tenant_id: str,
    active_only: bool = Query(False),
    admin_user: dict = Depends(require_admin_auth),
    service: TenantLicenseService = Depends(get_tenant_license)
):
    """Get all licenses for a tenant"""
    return await service.get_tenant_licenses(tenant_id, active_only=active_only)


@router.post("/tenants/{tenant_id}/licenses", status_code=status.HTTP_201_CREATED)
async def add_tenant_license(
    tenant_id: str,
    license_data: TenantLicenseCreate,
    admin_user: dict = Depends(require_admin_auth),
    service: TenantLicenseService = Depends(get_tenant_license)
):
    """Add a license to a tenant"""
    try:
        return await service.add_tenant_license(
            tenant_id=tenant_id,
            license_id=license_data.license_id,
            seats_purchased=license_data.seats_purchased,
            override_price=license_data.override_price,
            billing_start_date=license_data.billing_start_date,
            billing_end_date=license_data.billing_end_date,
            renewal_type=license_data.renewal_type.value if license_data.renewal_type else "auto_renew",
            status=license_data.status.value if license_data.status else "active",
            actor_id=admin_user.get("id"),
            actor_email=admin_user.get("email")
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.patch("/tenants/{tenant_id}/licenses/{license_id}")
async def update_tenant_license(
    tenant_id: str,
    license_id: str,
    update_data: TenantLicenseUpdate,
    admin_user: dict = Depends(require_admin_auth),
    service: TenantLicenseService = Depends(get_tenant_license)
):
    """Update a tenant license (e.g., change seat count)"""
    try:
        # Convert enums to values
        data = update_data.model_dump(exclude_unset=True)
        if "renewal_type" in data and data["renewal_type"]:
            data["renewal_type"] = data["renewal_type"].value if hasattr(data["renewal_type"], "value") else data["renewal_type"]
        if "status" in data and data["status"]:
            data["status"] = data["status"].value if hasattr(data["status"], "value") else data["status"]
        
        result = await service.update_tenant_license(
            tenant_license_id=license_id,
            update_data=data,
            actor_id=admin_user.get("id"),
            actor_email=admin_user.get("email")
        )
        if not result:
            raise HTTPException(status_code=404, detail="Tenant license not found")
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/tenants/{tenant_id}/licenses/{license_id}")
async def remove_tenant_license(
    tenant_id: str,
    license_id: str,
    admin_user: dict = Depends(require_admin_auth),
    service: TenantLicenseService = Depends(get_tenant_license)
):
    """Remove a license from a tenant"""
    try:
        result = await service.remove_tenant_license(
            tenant_license_id=license_id,
            actor_id=admin_user.get("id"),
            actor_email=admin_user.get("email")
        )
        if not result:
            raise HTTPException(status_code=404, detail="Tenant license not found")
        return {"success": True, "message": "License removed"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/tenants/{tenant_id}/licenses/check-availability")
async def check_seat_availability(
    tenant_id: str,
    license_id: str = Query(...),
    admin_user: dict = Depends(require_admin_auth),
    service: TenantLicenseService = Depends(get_tenant_license)
):
    """Check if a seat is available for a license"""
    return await service.check_seat_availability(tenant_id, license_id)


@router.get("/tenants/{tenant_id}/billing-summary")
async def get_tenant_billing_summary(
    tenant_id: str,
    admin_user: dict = Depends(require_admin_auth),
    service: TenantLicenseService = Depends(get_tenant_license)
):
    """Get complete billing summary for a tenant"""
    return await service.get_tenant_billing_summary(tenant_id)


# =============================================================================
# TENANT BILLING CONFIGURATION ROUTES
# =============================================================================

@router.get("/tenants/{tenant_id}/billing-config")
async def get_billing_config(
    tenant_id: str,
    admin_user: dict = Depends(require_admin_auth),
    service: TenantLicenseService = Depends(get_tenant_license)
):
    """Get billing configuration for a tenant"""
    config = await service.get_billing_config(tenant_id)
    if not config:
        return {"tenant_id": tenant_id, "configured": False}
    return config


@router.post("/tenants/{tenant_id}/billing-config", status_code=status.HTTP_201_CREATED)
async def create_billing_config(
    tenant_id: str,
    config_data: TenantBillingConfigCreate,
    admin_user: dict = Depends(require_admin_auth),
    service: TenantLicenseService = Depends(get_tenant_license)
):
    """Create billing configuration for a tenant"""
    try:
        # Convert enums
        data = config_data.model_dump()
        if data.get("tax_mode"):
            data["tax_mode"] = data["tax_mode"].value if hasattr(data["tax_mode"], "value") else data["tax_mode"]
        
        return await service.create_billing_config(
            tenant_id=tenant_id,
            config_data=data,
            actor_id=admin_user.get("id"),
            actor_email=admin_user.get("email")
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.patch("/tenants/{tenant_id}/billing-config")
async def update_billing_config(
    tenant_id: str,
    update_data: TenantBillingConfigUpdate,
    admin_user: dict = Depends(require_admin_auth),
    service: TenantLicenseService = Depends(get_tenant_license)
):
    """Update billing configuration for a tenant"""
    # Convert enums
    data = update_data.model_dump(exclude_unset=True)
    if "tax_mode" in data and data["tax_mode"]:
        data["tax_mode"] = data["tax_mode"].value if hasattr(data["tax_mode"], "value") else data["tax_mode"]
    
    return await service.update_billing_config(
        tenant_id=tenant_id,
        update_data=data,
        actor_id=admin_user.get("id"),
        actor_email=admin_user.get("email")
    )


# =============================================================================
# TENANT VERSION CONTROL ROUTES
# =============================================================================

@router.get("/tenants/{tenant_id}/version")
async def get_tenant_version(
    tenant_id: str,
    admin_user: dict = Depends(require_admin_auth),
    service: PlatformReleaseService = Depends(get_platform_release)
):
    """Get version info for a tenant"""
    version = await service.get_tenant_version(tenant_id)
    if not version:
        return {"tenant_id": tenant_id, "version_assigned": False}
    return version


@router.post("/tenants/{tenant_id}/version/assign")
async def assign_tenant_version(
    tenant_id: str,
    release_id: str = Query(...),
    admin_user: dict = Depends(require_admin_auth),
    service: PlatformReleaseService = Depends(get_platform_release)
):
    """Assign a platform version to a tenant"""
    try:
        return await service.assign_tenant_version(
            tenant_id=tenant_id,
            release_id=release_id,
            actor_id=admin_user.get("id"),
            actor_email=admin_user.get("email")
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/tenants/{tenant_id}/version/upgrade-options")
async def get_upgrade_options(
    tenant_id: str,
    admin_user: dict = Depends(require_admin_auth),
    service: PlatformReleaseService = Depends(get_platform_release)
):
    """Get available upgrade options for a tenant"""
    current = await service.get_tenant_version(tenant_id)
    if not current:
        # No version assigned, return all available releases
        default = await service.get_default_release_for_new_tenants()
        return {
            "current_version": None,
            "available_upgrades": [default] if default else [],
            "message": "No version currently assigned"
        }
    
    options = await service.get_upgrade_eligible_releases(current["current_version_number"])
    return {
        "current_version": current["current_version_number"],
        "available_upgrades": options
    }


@router.post("/tenants/{tenant_id}/version/precheck")
async def run_upgrade_precheck(
    tenant_id: str,
    target_release_id: str = Query(...),
    admin_user: dict = Depends(require_admin_auth),
    service: PlatformReleaseService = Depends(get_platform_release)
):
    """Run prechecks before upgrading a tenant"""
    return await service.run_upgrade_precheck(tenant_id, target_release_id)


@router.post("/tenants/{tenant_id}/version/upgrade")
async def execute_tenant_upgrade(
    tenant_id: str,
    upgrade_request: TenantUpgradeRequest,
    admin_user: dict = Depends(require_admin_auth),
    service: PlatformReleaseService = Depends(get_platform_release)
):
    """Execute tenant upgrade to a new version"""
    try:
        return await service.execute_tenant_upgrade(
            tenant_id=tenant_id,
            target_release_id=upgrade_request.target_version_id,
            force=upgrade_request.force,
            actor_id=admin_user.get("id"),
            actor_email=admin_user.get("email")
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# =============================================================================
# PLAN LICENSE CONFIGURATION ROUTES
# =============================================================================

@router.get("/plan-license-config")
async def get_plan_license_configs(
    admin_user: dict = Depends(require_admin_auth)
):
    """Get all plan license configurations from DB (single source of truth)"""
    plans_cursor = db.plans.find({"is_active": {"$ne": False}}, {"_id": 0, "api_name": 1, "name": 1, "included_licenses": 1, "seat_limit": 1})
    plans = await plans_cursor.to_list(50)
    return {
        "plans": [
            {
                "plan_code": p["api_name"],
                "plan_name": p.get("name", p["api_name"]),
                "default_licenses": p.get("included_licenses", [{"license_code": "CRM_CORE_SEAT", "seats": p.get("seat_limit", 5)}])
            }
            for p in plans
        ]
    }


@router.get("/plan-license-config/{plan_code}")
async def get_plan_license_config(
    plan_code: str,
    admin_user: dict = Depends(require_admin_auth)
):
    """Get license configuration for a specific plan from DB"""
    plan = await db.plans.find_one({"api_name": plan_code}, {"_id": 0})
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    
    return {
        "plan_code": plan_code,
        "plan_name": plan.get("name", plan_code),
        "default_licenses": plan.get("included_licenses", [{"license_code": "CRM_CORE_SEAT", "seats": plan.get("seat_limit", 5)}])
    }
