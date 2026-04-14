"""
Admin Module Pydantic Models - Control Plane Specification
Aligned with SaaS Control Plane architecture for tenant lifecycle management.
"""
from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum


# =============================================================================
# ADMIN AUTHENTICATION
# =============================================================================

class AdminRole(str, Enum):
    """Admin Portal roles - simplified for control plane access"""
    PLATFORM_ADMIN = "platform_admin"
    # Legacy support
    SUPER_ADMIN = "SUPER_ADMIN"


class AdminLoginRequest(BaseModel):
    """Admin login request"""
    email: EmailStr
    password: str


class AdminLoginResponse(BaseModel):
    """Admin login response"""
    access_token: str
    token_type: str = "bearer"
    user: Dict[str, Any]
    message: str


# =============================================================================
# TENANT STATUS - Control Plane Specification
# =============================================================================

class TenantStatus(str, Enum):
    """
    Tenant lifecycle status as per Control Plane specification.
    
    Status flow:
    PENDING -> PROVISIONING -> ACTIVE -> (SUSPENDED | READ_ONLY) -> TERMINATED
    """
    PENDING = "PENDING"           # Created but not yet provisioned
    PROVISIONING = "PROVISIONING" # Provisioning in progress
    ACTIVE = "ACTIVE"             # Fully operational
    SUSPENDED = "SUSPENDED"       # Temporarily disabled (billing/policy)
    READ_ONLY = "READ_ONLY"       # Can read but not write (overdue/grace period)
    TERMINATED = "TERMINATED"     # Permanently terminated (protected action)
    
    # Legacy status mappings for backward compatibility
    @classmethod
    def from_legacy(cls, legacy_status: str) -> "TenantStatus":
        """Convert legacy status to new status"""
        mapping = {
            "active": cls.ACTIVE,
            "suspended": cls.SUSPENDED,
            "trial": cls.ACTIVE,  # Trial is now tracked via billing fields
            "expired": cls.READ_ONLY,
            "deleted": cls.TERMINATED
        }
        return mapping.get(legacy_status.lower(), cls.ACTIVE)


class EnvironmentType(str, Enum):
    """Tenant environment type"""
    SHARED = "SHARED"       # Multi-tenant shared infrastructure
    DEDICATED = "DEDICATED" # Dedicated resources


# =============================================================================
# SUBSCRIPTION & BILLING
# =============================================================================

class SubscriptionPlan(str):
    """
    Subscription plan code — accepts any string value.
    Plans are defined in the MongoDB `plans` collection (single source of truth).
    This was previously an Enum with 4 hardcoded values; now it's a plain str subclass
    so that any plan created in the DB can be used.
    """
    pass


class BillingType(str, Enum):
    """Plan billing type"""
    TRIAL = "TRIAL"
    RECURRING = "RECURRING"
    ENTERPRISE = "ENTERPRISE"  # Custom billing


class BillingStatus(str, Enum):
    """Tenant billing status"""
    CURRENT = "CURRENT"           # Payments up to date
    PENDING = "PENDING"           # Awaiting first payment
    OVERDUE = "OVERDUE"           # Payment overdue
    GRACE_PERIOD = "GRACE_PERIOD" # In grace period after overdue
    CANCELLED = "CANCELLED"       # Subscription cancelled


# =============================================================================
# TENANT MODELS
# =============================================================================

class TenantCreate(BaseModel):
    """Create a new tenant (organization) with Tenant Administrator (first user).
    
    Architecture: Plan → License → Modules
    - Admin selects a Plan during creation
    - Licenses are provisioned from the plan
    - Modules are derived from plan's enabled_modules
    - Module Entitlements can fine-tune modules post-creation
    - Admin user receives a verification email to set their password
    """
    tenant_name: str = Field(..., min_length=2, max_length=100, description="Display name for the tenant")
    organization_name: str = Field(..., min_length=2, max_length=100, description="Legal organization name")
    # Admin user fields - REQUIRED for tenant creation
    admin_email: Optional[EmailStr] = Field(None, description="Email for the tenant admin user")
    admin_first_name: Optional[str] = Field(None, min_length=1, max_length=50)
    admin_last_name: Optional[str] = Field(None, min_length=1, max_length=50)
    # Plan drives everything: modules, licenses, seat limits
    plan: str = Field(default="free", description="Subscription plan api_name from plans collection")
    status: TenantStatus = Field(default=TenantStatus.ACTIVE, description="Tenant status")
    region: Optional[str] = Field(None, description="Geographic region")
    industry: Optional[str] = Field(None, description="Industry vertical")
    subdomain: Optional[str] = Field(None, description="Tenant subdomain")
    environment_type: EnvironmentType = Field(default=EnvironmentType.SHARED, description="Environment type")
    # Trial settings
    is_trial: bool = Field(default=False, description="Is this a trial tenant")
    trial_days: int = Field(default=14, ge=0, le=90, description="Trial duration in days")
    # Platform version
    platform_version_id: Optional[str] = Field(None, description="Platform version to assign")


class TenantUpdate(BaseModel):
    """Update tenant details"""
    tenant_name: Optional[str] = Field(None, min_length=2, max_length=100)
    organization_name: Optional[str] = Field(None, min_length=2, max_length=100)
    status: Optional[TenantStatus] = None
    plan: Optional[str] = None
    seat_limit: Optional[int] = Field(None, ge=1, le=10000)
    max_storage_mb: Optional[int] = Field(None, ge=100)
    region: Optional[str] = None
    industry: Optional[str] = None
    subdomain: Optional[str] = None
    environment_type: Optional[EnvironmentType] = None


class TenantBillingUpdate(BaseModel):
    """Update tenant billing information"""
    stripe_customer_id: Optional[str] = None
    stripe_subscription_id: Optional[str] = None
    billing_status: Optional[BillingStatus] = None
    billing_email: Optional[EmailStr] = None
    billing_address: Optional[Dict[str, str]] = None
    next_billing_date: Optional[datetime] = None
    is_trial: Optional[bool] = None
    trial_ends_at: Optional[datetime] = None


class TenantResponse(BaseModel):
    """Tenant response model"""
    id: str
    tenant_name: str
    organization_name: str
    subdomain: Optional[str] = None
    industry: Optional[str] = None
    region: Optional[str] = None
    environment_type: str = "SHARED"
    status: str = "ACTIVE"
    plan: str = "free"
    seat_limit: int = 10
    max_storage_mb: int = 1024
    current_users: int = 0
    current_storage_mb: float = 0
    modules_enabled_count: int = 0
    # Billing
    billing_status: str = "PENDING"
    is_trial: bool = False
    trial_ends_at: Optional[datetime] = None
    # Timestamps
    created_at: datetime
    updated_at: Optional[datetime] = None
    last_activity: Optional[datetime] = None
    is_deleted: bool = False


class TenantDetailResponse(TenantResponse):
    """Extended tenant detail response"""
    total_records: int = 0
    total_objects: int = 0
    total_flows: int = 0
    admin_user: Optional[Dict[str, Any]] = None
    module_entitlements: List[str] = []
    users_summary: Dict[str, int] = {}
    # Billing details
    stripe_customer_id: Optional[str] = None
    stripe_subscription_id: Optional[str] = None
    billing_email: Optional[str] = None
    next_billing_date: Optional[datetime] = None
    # Limits summary
    limits_summary: Dict[str, Dict[str, Any]] = {}


class TenantUsersResponse(BaseModel):
    """Response for tenant users list"""
    users: List[Dict[str, Any]]
    total: int
    tenant_id: str


# =============================================================================
# USER MANAGEMENT
# =============================================================================

class UserStatus(str, Enum):
    ACTIVE = "active"
    SUSPENDED = "suspended"
    PENDING = "pending"


class TenantUserRole(str, Enum):
    ADMIN = "admin"
    MANAGER = "manager"
    USER = "user"


class TenantUserCreate(BaseModel):
    """Create a user within a tenant"""
    email: EmailStr
    first_name: str = Field(..., min_length=1, max_length=50)
    last_name: str = Field(..., min_length=1, max_length=50)
    password: str = Field(..., min_length=6)
    role: TenantUserRole = TenantUserRole.USER


class TenantUserUpdate(BaseModel):
    """Update user details"""
    first_name: Optional[str] = Field(None, min_length=1, max_length=50)
    last_name: Optional[str] = Field(None, min_length=1, max_length=50)
    role: Optional[TenantUserRole] = None
    is_active: Optional[bool] = None


class UserResetPassword(BaseModel):
    """Reset user password"""
    new_password: str = Field(..., min_length=6)


class AllUsersResponse(BaseModel):
    """Response for all users across tenants"""
    users: List[Dict[str, Any]]
    total: int
    skip: int
    limit: int


class AdminUserResponse(BaseModel):
    """Admin user response"""
    id: str
    email: str
    first_name: str
    last_name: str
    role: str
    is_active: bool = True
    created_at: datetime


class AdminSetupResponse(BaseModel):
    """Admin setup response"""
    message: str
    admin_user_created: bool
    admin_email: str


# =============================================================================
# SUBSCRIPTION PLAN MODELS - Enhanced
# =============================================================================

class PlanCreate(BaseModel):
    """Create a subscription plan"""
    name: str = Field(..., min_length=2, max_length=50)
    api_name: str = Field(..., min_length=2, max_length=50, pattern="^[a-z_]+$")
    description: Optional[str] = None
    billing_type: BillingType = BillingType.RECURRING
    price_monthly: float = Field(0, ge=0)
    price_yearly: float = Field(0, ge=0)
    seat_limit: int = Field(5, ge=1, le=10000)
    storage_limit_mb: int = Field(512, ge=100)
    api_limit_daily: int = Field(1000, ge=100)
    # Module and limit defaults
    default_modules: List[str] = Field(default_factory=list, description="Default enabled modules")
    default_limits: Dict[str, int] = Field(default_factory=dict, description="Default limit values")
    # Legacy field for backward compatibility
    enabled_modules: List[str] = Field(default_factory=list)
    # Licenses to auto-provision when this plan is assigned
    included_licenses: List[Dict[str, Any]] = Field(
        default_factory=list,
        description="Licenses auto-provisioned with this plan. Each: {license_code, seats}"
    )
    is_active: bool = True
    is_public: bool = True
    sort_order: int = 0


class PlanUpdate(BaseModel):
    """Update a subscription plan"""
    name: Optional[str] = Field(None, min_length=2, max_length=50)
    description: Optional[str] = None
    billing_type: Optional[BillingType] = None
    price_monthly: Optional[float] = Field(None, ge=0)
    price_yearly: Optional[float] = Field(None, ge=0)
    seat_limit: Optional[int] = Field(None, ge=1, le=10000)
    storage_limit_mb: Optional[int] = Field(None, ge=100)
    api_limit_daily: Optional[int] = Field(None, ge=100)
    default_modules: Optional[List[str]] = None
    default_limits: Optional[Dict[str, int]] = None
    enabled_modules: Optional[List[str]] = None
    included_licenses: Optional[List[Dict[str, Any]]] = None
    is_active: Optional[bool] = None
    is_public: Optional[bool] = None
    sort_order: Optional[int] = None


class PlanResponse(BaseModel):
    """Subscription plan response"""
    id: str
    name: str
    api_name: str
    description: Optional[str] = None
    billing_type: str = "RECURRING"
    price_monthly: float = 0
    price_yearly: float = 0
    seat_limit: int = 5
    storage_limit_mb: int = 512
    api_limit_daily: int = 1000
    default_modules: List[str] = []
    default_limits: Dict[str, int] = {}
    enabled_modules: List[str] = []  # Backward compatibility
    included_licenses: List[Dict[str, Any]] = []
    is_active: bool = True
    is_public: bool = True
    sort_order: int = 0
    tenant_count: int = 0
    created_at: datetime
    updated_at: Optional[datetime] = None


class TenantPlanAssignment(BaseModel):
    """Assign a plan to a tenant"""
    plan_id: str


# =============================================================================
# MODULE ENTITLEMENTS - tenant_modules collection
# =============================================================================

class ModuleEnabledSource(str, Enum):
    """Source of module enablement"""
    PLAN = "PLAN"               # Enabled by subscription plan
    MANUAL_OVERRIDE = "MANUAL_OVERRIDE"  # Manually enabled by admin
    TRIAL = "TRIAL"             # Enabled for trial period
    PROMO = "PROMO"             # Enabled via promotion


class TenantModuleCreate(BaseModel):
    """Create/update a tenant module entitlement"""
    module_code: str
    module_name: str
    is_enabled: bool = True
    enabled_source: ModuleEnabledSource = ModuleEnabledSource.PLAN
    start_at: Optional[datetime] = None
    end_at: Optional[datetime] = None


class TenantModuleResponse(BaseModel):
    """Tenant module entitlement response"""
    id: str
    tenant_id: str
    module_code: str
    module_name: str
    is_enabled: bool
    enabled_source: str
    start_at: Optional[datetime] = None
    end_at: Optional[datetime] = None
    created_at: datetime
    updated_at: Optional[datetime] = None


class ModuleDefinition(BaseModel):
    """Module definition"""
    id: str
    name: str
    api_name: str
    description: Optional[str] = None
    category: str = "core"
    is_premium: bool = False
    sort_order: int = 0


class TenantModuleUpdate(BaseModel):
    """Update tenant's enabled modules (batch)"""
    enabled_modules: List[str]


class ModuleToggle(BaseModel):
    """Toggle a single module for a tenant"""
    module_api_name: str
    enabled: bool
    enabled_source: ModuleEnabledSource = ModuleEnabledSource.MANUAL_OVERRIDE
    end_at: Optional[datetime] = None


# =============================================================================
# TENANT LIMITS & QUOTAS - tenant_limits collection
# =============================================================================

class LimitEnforcementType(str, Enum):
    """How the limit is enforced"""
    HARD_STOP = "HARD_STOP"     # Block action when exceeded
    SOFT_WARNING = "SOFT_WARNING"  # Warn but allow


class LimitResetCycle(str, Enum):
    """When the consumed value resets"""
    NEVER = "NEVER"       # Never resets (cumulative)
    DAILY = "DAILY"
    WEEKLY = "WEEKLY"
    MONTHLY = "MONTHLY"
    YEARLY = "YEARLY"


class TenantLimitCreate(BaseModel):
    """Create a tenant limit"""
    limit_key: str = Field(..., description="Limit identifier (e.g., MAX_USERS)")
    limit_value: int = Field(..., ge=0, description="Maximum allowed value")
    consumed_value: int = Field(default=0, ge=0, description="Current consumed value")
    enforcement_type: LimitEnforcementType = LimitEnforcementType.HARD_STOP
    reset_cycle: LimitResetCycle = LimitResetCycle.NEVER


class TenantLimitUpdate(BaseModel):
    """Update a tenant limit"""
    limit_value: Optional[int] = Field(None, ge=0)
    consumed_value: Optional[int] = Field(None, ge=0)
    enforcement_type: Optional[LimitEnforcementType] = None
    reset_cycle: Optional[LimitResetCycle] = None


class TenantLimitResponse(BaseModel):
    """Tenant limit response"""
    id: str
    tenant_id: str
    limit_key: str
    limit_value: int
    consumed_value: int
    enforcement_type: str
    reset_cycle: str
    utilization_percent: float = 0.0
    is_exceeded: bool = False
    last_reset_at: Optional[datetime] = None
    created_at: datetime
    updated_at: Optional[datetime] = None


# Standard limit keys
STANDARD_LIMIT_KEYS = [
    "MAX_USERS",
    "MAX_STORAGE_GB",
    "MAX_CUSTOM_OBJECTS",
    "MAX_CUSTOM_FIELDS",
    "MAX_ACTIVE_FLOWS",
    "MAX_API_CALLS_PER_MONTH",
    "MAX_AI_CREDITS_PER_MONTH",
    "MAX_FILE_UPLOAD_GB",
    "MAX_FORM_SUBMISSIONS_PER_MONTH",
    "MAX_DOCFLOW_RUNS"
]


# =============================================================================
# PROVISIONING JOBS - provisioning_jobs collection
# =============================================================================

class ProvisioningJobType(str, Enum):
    """Provisioning job types"""
    CREATE_TENANT = "CREATE_TENANT"
    UPGRADE_PLAN = "UPGRADE_PLAN"
    ENABLE_MODULE = "ENABLE_MODULE"
    DISABLE_MODULE = "DISABLE_MODULE"
    SUSPEND_TENANT = "SUSPEND_TENANT"
    REACTIVATE_TENANT = "REACTIVATE_TENANT"
    TERMINATE_TENANT = "TERMINATE_TENANT"
    RESET_ADMIN = "RESET_ADMIN"
    UPDATE_LIMITS = "UPDATE_LIMITS"


class ProvisioningJobStatus(str, Enum):
    """Provisioning job status"""
    QUEUED = "QUEUED"
    RUNNING = "RUNNING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"


class ProvisioningJobCreate(BaseModel):
    """Create a provisioning job"""
    tenant_id: str
    job_type: ProvisioningJobType
    parameters: Dict[str, Any] = Field(default_factory=dict)
    requested_by: str
    request_source: str = "ADMIN_PORTAL"


class ProvisioningJobResponse(BaseModel):
    """Provisioning job response"""
    id: str
    tenant_id: str
    job_type: str
    status: str
    parameters: Dict[str, Any] = {}
    requested_by: str
    request_source: str
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    error_message: Optional[str] = None
    retry_count: int = 0
    result: Optional[Dict[str, Any]] = None
    created_at: datetime


class TenantProvisioningResult(BaseModel):
    """Result of tenant provisioning"""
    tenant_id: str
    tenant_name: str
    admin_user_id: str
    admin_email: str
    provisioned_items: Dict[str, bool]
    message: str


# =============================================================================
# AUDIT LOGGING - Enhanced
# =============================================================================

class AuditLogCreate(BaseModel):
    """Create an audit log entry"""
    action: str
    actor_id: str
    actor_email: str
    tenant_id: Optional[str] = None
    module_name: Optional[str] = None
    entity_name: Optional[str] = None
    target_id: Optional[str] = None
    target_type: Optional[str] = None
    old_value: Optional[Dict[str, Any]] = None
    new_value: Optional[Dict[str, Any]] = None
    reason: Optional[str] = None
    ip_address: Optional[str] = None


class AuditLogResponse(BaseModel):
    """Audit log response"""
    id: str
    action: str
    action_description: str
    actor_id: str
    actor_email: str
    tenant_id: Optional[str] = None
    module_name: Optional[str] = None
    entity_name: Optional[str] = None
    target_id: Optional[str] = None
    target_type: Optional[str] = None
    old_value: Optional[Dict[str, Any]] = None
    new_value: Optional[Dict[str, Any]] = None
    reason: Optional[str] = None
    ip_address: Optional[str] = None
    timestamp: datetime


# =============================================================================
# SUPPORT OPERATIONS
# =============================================================================

class TenantSupportAction(str, Enum):
    """Support actions that can be performed on a tenant"""
    SUSPEND = "SUSPEND"
    REACTIVATE = "REACTIVATE"
    SET_READ_ONLY = "SET_READ_ONLY"
    MAINTENANCE_MODE = "MAINTENANCE_MODE"
    EXTEND_TRIAL = "EXTEND_TRIAL"
    RESEND_WELCOME = "RESEND_WELCOME"
    CREATE_PAYMENT_LINK = "CREATE_PAYMENT_LINK"
    RETRY_PROVISIONING = "RETRY_PROVISIONING"
    IMPERSONATE = "IMPERSONATE"


class TenantSupportActionRequest(BaseModel):
    """Request a support action on a tenant"""
    action: TenantSupportAction
    reason: Optional[str] = None
    parameters: Dict[str, Any] = Field(default_factory=dict)
