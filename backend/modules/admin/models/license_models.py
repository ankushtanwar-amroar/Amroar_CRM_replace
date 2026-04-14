"""
License, Release, and Version Control Models - Admin Portal
Control Plane Models for Tenant Billing and Version Management
"""
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum


# ============================================================================
# ENUMS
# ============================================================================

class AssignmentType(str, Enum):
    """License assignment type"""
    PER_USER = "per_user"
    PER_TENANT = "per_tenant"
    USAGE_BASED = "usage_based"


class BillingFrequency(str, Enum):
    """Billing frequency options"""
    MONTHLY = "monthly"
    YEARLY = "yearly"
    ONE_TIME = "one_time"


class VisibilityMode(str, Enum):
    """Module visibility when license not assigned"""
    HIDE = "hide"
    SHOW_LOCKED = "show_locked"


class ReleaseStatus(str, Enum):
    """Platform release status"""
    DRAFT = "draft"
    QA = "qa"
    APPROVED = "approved"
    DEPRECATED = "deprecated"


class TenantLicenseStatus(str, Enum):
    """Tenant license subscription status"""
    ACTIVE = "active"
    EXPIRED = "expired"
    CANCELLED = "cancelled"
    SUSPENDED = "suspended"
    TRIAL = "trial"


class UserLicenseStatus(str, Enum):
    """User license assignment status"""
    ACTIVE = "active"
    REVOKED = "revoked"
    EXPIRED = "expired"


class RenewalType(str, Enum):
    """License renewal type"""
    AUTO_RENEW = "auto_renew"
    MANUAL = "manual"
    NONE = "none"


class TaxMode(str, Enum):
    """Tax calculation mode"""
    INCLUSIVE = "inclusive"
    EXCLUSIVE = "exclusive"
    NONE = "none"


# ============================================================================
# LICENSE CATALOG MODELS
# ============================================================================

class LicenseCatalogBase(BaseModel):
    """Base fields for license catalog"""
    license_code: str = Field(..., min_length=1, max_length=50, description="Unique license code (e.g., CRM_CORE_SEAT)")
    license_name: str = Field(..., min_length=1, max_length=100, description="Display name")
    module_key: str = Field(..., description="Maps to CRM module registry (e.g., crm, flow_builder)")
    description: Optional[str] = Field(None, max_length=500)
    assignment_type: AssignmentType = Field(default=AssignmentType.PER_USER)
    default_price: float = Field(default=0, ge=0, description="Default price per unit")
    currency: str = Field(default="USD", max_length=3)
    billing_frequency: BillingFrequency = Field(default=BillingFrequency.MONTHLY)
    trial_allowed: bool = Field(default=False)
    trial_days: int = Field(default=14, ge=0)
    default_visibility_mode: VisibilityMode = Field(default=VisibilityMode.HIDE)
    sort_order: int = Field(default=0)
    dependencies: List[str] = Field(default_factory=list, description="List of license_codes this depends on")
    is_active: bool = Field(default=True)
    is_base_license: bool = Field(default=False, description="True for CRM Core - required by most modules")


class LicenseCatalogCreate(LicenseCatalogBase):
    """Create a new license catalog entry"""
    pass


class LicenseCatalogUpdate(BaseModel):
    """Update license catalog entry"""
    license_name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    default_price: Optional[float] = Field(None, ge=0)
    currency: Optional[str] = Field(None, max_length=3)
    billing_frequency: Optional[BillingFrequency] = None
    trial_allowed: Optional[bool] = None
    trial_days: Optional[int] = Field(None, ge=0)
    default_visibility_mode: Optional[VisibilityMode] = None
    sort_order: Optional[int] = None
    dependencies: Optional[List[str]] = None
    is_active: Optional[bool] = None


class LicenseCatalogResponse(LicenseCatalogBase):
    """License catalog response"""
    id: str
    created_at: datetime
    updated_at: datetime
    created_by: Optional[str] = None


# ============================================================================
# PLATFORM RELEASE MODELS
# ============================================================================

class PlatformReleaseBase(BaseModel):
    """Base fields for platform release"""
    version_number: str = Field(..., min_length=1, max_length=20, description="Semantic version (e.g., v2.0.0)")
    release_name: str = Field(..., min_length=1, max_length=100, description="Release name (e.g., Q1 2026 Release)")
    status: ReleaseStatus = Field(default=ReleaseStatus.DRAFT)
    available_for_new_tenants: bool = Field(default=False, description="Default version for new tenants")
    available_for_upgrade: bool = Field(default=False, description="Available for tenant upgrades")
    release_notes: Optional[str] = Field(None, max_length=5000)
    migration_script_ref: Optional[str] = Field(None, description="Reference to migration script")
    breaking_changes: bool = Field(default=False)
    rollback_supported: bool = Field(default=True)
    features_added: List[str] = Field(default_factory=list)
    features_deprecated: List[str] = Field(default_factory=list)
    min_upgrade_from_version: Optional[str] = Field(None, description="Minimum version required to upgrade from")


class PlatformReleaseCreate(PlatformReleaseBase):
    """Create a new platform release"""
    pass


class PlatformReleaseUpdate(BaseModel):
    """Update platform release"""
    release_name: Optional[str] = Field(None, min_length=1, max_length=100)
    status: Optional[ReleaseStatus] = None
    available_for_new_tenants: Optional[bool] = None
    available_for_upgrade: Optional[bool] = None
    release_notes: Optional[str] = Field(None, max_length=5000)
    migration_script_ref: Optional[str] = None
    breaking_changes: Optional[bool] = None
    rollback_supported: Optional[bool] = None
    features_added: Optional[List[str]] = None
    features_deprecated: Optional[List[str]] = None
    min_upgrade_from_version: Optional[str] = None


class PlatformReleaseResponse(PlatformReleaseBase):
    """Platform release response"""
    id: str
    created_at: datetime
    updated_at: datetime
    created_by: Optional[str] = None
    tenant_count: Optional[int] = Field(None, description="Number of tenants on this version")


# ============================================================================
# TENANT LICENSE MODELS (Seat Pool)
# ============================================================================

class TenantLicenseBase(BaseModel):
    """Base fields for tenant license subscription"""
    tenant_id: str = Field(..., description="Tenant this license belongs to")
    license_id: str = Field(..., description="Reference to license catalog")
    license_code: str = Field(..., description="License code for easy lookup")
    seats_purchased: int = Field(default=0, ge=0)
    default_price_snapshot: float = Field(default=0, ge=0, description="Price at time of subscription")
    override_price: Optional[float] = Field(None, ge=0, description="Tenant-specific price override")
    billing_start_date: Optional[datetime] = None
    billing_end_date: Optional[datetime] = None
    renewal_type: RenewalType = Field(default=RenewalType.AUTO_RENEW)
    payment_link_ref: Optional[str] = Field(None, description="Reference to payment link")
    status: TenantLicenseStatus = Field(default=TenantLicenseStatus.ACTIVE)
    notes: Optional[str] = Field(None, max_length=500)


class TenantLicenseCreate(BaseModel):
    """Create tenant license subscription"""
    license_id: str
    seats_purchased: int = Field(default=1, ge=0)
    override_price: Optional[float] = Field(None, ge=0)
    billing_start_date: Optional[datetime] = None
    billing_end_date: Optional[datetime] = None
    renewal_type: RenewalType = Field(default=RenewalType.AUTO_RENEW)
    status: TenantLicenseStatus = Field(default=TenantLicenseStatus.ACTIVE)


class TenantLicenseUpdate(BaseModel):
    """Update tenant license subscription"""
    seats_purchased: Optional[int] = Field(None, ge=0)
    override_price: Optional[float] = Field(None, ge=0)
    billing_end_date: Optional[datetime] = None
    renewal_type: Optional[RenewalType] = None
    payment_link_ref: Optional[str] = None
    status: Optional[TenantLicenseStatus] = None
    notes: Optional[str] = Field(None, max_length=500)


class TenantLicenseResponse(TenantLicenseBase):
    """Tenant license response with computed fields"""
    id: str
    license_name: Optional[str] = None
    module_key: Optional[str] = None
    seats_assigned: int = Field(default=0)
    seats_available: int = Field(default=0)
    final_price: float = Field(default=0, description="override_price or default_price_snapshot")
    created_at: datetime
    updated_at: datetime


# ============================================================================
# USER LICENSE MODELS (CRM Side)
# ============================================================================

class UserLicenseBase(BaseModel):
    """Base fields for user license assignment"""
    user_id: str = Field(..., description="User this license is assigned to")
    tenant_id: str = Field(..., description="Tenant context")
    license_id: str = Field(..., description="Reference to license catalog")
    license_code: str = Field(..., description="License code for easy lookup")
    assigned_at: datetime = Field(default_factory=lambda: datetime.now())
    assigned_by: Optional[str] = Field(None, description="User ID who assigned this")
    expires_at: Optional[datetime] = None
    status: UserLicenseStatus = Field(default=UserLicenseStatus.ACTIVE)


class UserLicenseAssign(BaseModel):
    """Assign license to user"""
    license_id: str
    expires_at: Optional[datetime] = None


class UserLicenseResponse(UserLicenseBase):
    """User license response"""
    id: str
    license_name: Optional[str] = None
    module_key: Optional[str] = None
    created_at: datetime


# ============================================================================
# TENANT VERSION CONTROL MODELS
# ============================================================================

class TenantVersionBase(BaseModel):
    """Base fields for tenant version control"""
    tenant_id: str = Field(..., description="Tenant ID")
    current_version_id: str = Field(..., description="Current release ID")
    current_version_number: str = Field(..., description="Current version number (e.g., v2.0.0)")
    target_version_id: Optional[str] = Field(None, description="Target version for upgrade")
    target_version_number: Optional[str] = None
    upgrade_eligible: bool = Field(default=True)
    upgrade_notes: Optional[str] = Field(None, max_length=1000)
    migration_required: bool = Field(default=False)
    last_upgraded_at: Optional[datetime] = None
    upgraded_by: Optional[str] = None
    rollback_allowed: bool = Field(default=True)


class TenantVersionUpdate(BaseModel):
    """Update tenant version"""
    target_version_id: Optional[str] = None
    upgrade_eligible: Optional[bool] = None
    upgrade_notes: Optional[str] = Field(None, max_length=1000)
    rollback_allowed: Optional[bool] = None


class TenantVersionResponse(TenantVersionBase):
    """Tenant version response"""
    id: str
    created_at: datetime
    updated_at: datetime


class TenantUpgradeRequest(BaseModel):
    """Request to upgrade tenant to a new version"""
    target_version_id: str
    force: bool = Field(default=False, description="Force upgrade even with warnings")
    run_prechecks: bool = Field(default=True)


class TenantUpgradePrecheck(BaseModel):
    """Precheck result for tenant upgrade"""
    eligible: bool
    warnings: List[str] = Field(default_factory=list)
    blockers: List[str] = Field(default_factory=list)
    incompatible_features: List[str] = Field(default_factory=list)
    required_migrations: List[str] = Field(default_factory=list)
    estimated_downtime_minutes: int = Field(default=0)


# ============================================================================
# TENANT BILLING CONFIGURATION MODELS
# ============================================================================

class TenantBillingConfigBase(BaseModel):
    """Base fields for tenant billing configuration"""
    tenant_id: str = Field(..., description="Tenant ID")
    billing_contact_email: Optional[str] = None
    billing_contact_name: Optional[str] = None
    currency: str = Field(default="USD", max_length=3)
    tax_mode: TaxMode = Field(default=TaxMode.NONE)
    payment_provider: Optional[str] = Field(None, description="stripe, paypal, etc.")
    payment_link: Optional[str] = Field(None, description="Static or dynamic payment link")
    invoice_prefix: Optional[str] = Field(None, max_length=20)
    auto_generate_invoice: bool = Field(default=False)
    notes: Optional[str] = Field(None, max_length=500)


class TenantBillingConfigCreate(BaseModel):
    """Create tenant billing configuration"""
    billing_contact_email: Optional[str] = None
    billing_contact_name: Optional[str] = None
    currency: str = Field(default="USD", max_length=3)
    tax_mode: TaxMode = Field(default=TaxMode.NONE)
    payment_provider: Optional[str] = None
    payment_link: Optional[str] = None
    invoice_prefix: Optional[str] = Field(None, max_length=20)
    auto_generate_invoice: bool = Field(default=False)


class TenantBillingConfigUpdate(BaseModel):
    """Update tenant billing configuration"""
    billing_contact_email: Optional[str] = None
    billing_contact_name: Optional[str] = None
    currency: Optional[str] = Field(None, max_length=3)
    tax_mode: Optional[TaxMode] = None
    payment_provider: Optional[str] = None
    payment_link: Optional[str] = None
    invoice_prefix: Optional[str] = Field(None, max_length=20)
    auto_generate_invoice: Optional[bool] = None
    notes: Optional[str] = Field(None, max_length=500)


class TenantBillingConfigResponse(TenantBillingConfigBase):
    """Tenant billing configuration response"""
    id: str
    created_at: datetime
    updated_at: datetime
    total_monthly_cost: float = Field(default=0, description="Calculated total monthly cost")
    total_yearly_cost: float = Field(default=0, description="Calculated total yearly cost")


# ============================================================================
# PLAN LICENSE CONFIGURATION
# ============================================================================

class PlanLicenseConfig(BaseModel):
    """Configuration for default licenses per plan"""
    plan_code: str = Field(..., description="Plan code (free, starter, professional, enterprise)")
    default_licenses: List[Dict[str, Any]] = Field(
        default_factory=list,
        description="List of {license_code, seats} for default allocation"
    )


class PlanLicenseConfigUpdate(BaseModel):
    """Update plan license configuration"""
    default_licenses: List[Dict[str, Any]] = Field(..., description="List of {license_code, seats}")


# ============================================================================
# SEAT AVAILABILITY CHECK
# ============================================================================

class SeatAvailabilityCheck(BaseModel):
    """Request to check seat availability"""
    tenant_id: str
    license_id: str


class SeatAvailabilityResponse(BaseModel):
    """Seat availability response"""
    available: bool
    seats_purchased: int
    seats_assigned: int
    seats_available: int
    message: Optional[str] = None
    dependency_check: Optional[Dict[str, bool]] = None
