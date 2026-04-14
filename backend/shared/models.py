"""
Shared Pydantic Models Module
Contains all Pydantic models used across the application.
Organized by domain for better maintainability.
"""
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import Optional, List, Any, Dict
from datetime import datetime, timezone
import uuid


# ============================================================================
# USER & AUTHENTICATION MODELS
# ============================================================================

class LicenseFeatures(BaseModel):
    """Feature flags controlled by license"""
    model_config = ConfigDict(extra="allow")
    # Core CRM features
    crm_core: bool = True                    # Leads, Contacts, Accounts, Opportunities
    custom_objects: bool = False             # Create custom objects
    # Automation
    flow_builder: bool = False               # Visual flow automation
    approval_workflows: bool = False         # Approval processes
    # Reporting & Analytics
    basic_reports: bool = True               # Standard reports
    advanced_reporting: bool = False         # Custom reports, dashboards
    # Integration
    api_access: bool = False                 # REST API access
    webhook_support: bool = False            # Outbound webhooks
    # Collaboration
    chatter: bool = True                     # Collaboration features
    file_manager: bool = True                # Document management
    # Security
    advanced_security: bool = False          # FLS, record-level sharing rules
    audit_trail: bool = False                # Full audit logging
    # AI Features
    ai_features: bool = False                # AI scoring, recommendations
    ai_assistant: bool = False               # AI chat assistant


class LicenseLimits(BaseModel):
    """Resource limits controlled by license"""
    model_config = ConfigDict(extra="allow")
    max_users: Optional[int] = None          # None = unlimited
    max_storage_gb: Optional[int] = None
    max_api_calls_per_day: Optional[int] = None
    max_custom_objects: int = 0
    max_custom_fields_per_object: int = 50
    max_flows: int = 0
    max_reports: int = 10
    max_dashboards: int = 2


class License(BaseModel):
    """
    License/Plan model for tenant feature entitlement.
    Controls what features and resources are available to an organization.
    """
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    # Plan identification
    name: str                                # Display name (e.g., "Enterprise")
    api_name: str                            # Internal name (e.g., "enterprise")
    description: Optional[str] = None
    # Plan tier (for ordering/comparison)
    tier: int = 1                            # 1=Free, 2=Starter, 3=Professional, 4=Enterprise
    # Feature flags
    features: LicenseFeatures = Field(default_factory=LicenseFeatures)
    # Resource limits
    limits: LicenseLimits = Field(default_factory=LicenseLimits)
    # Billing (for future use)
    price_monthly: Optional[float] = None
    price_yearly: Optional[float] = None
    billing_cycle: str = "monthly"           # "monthly" | "yearly"
    # Status
    is_active: bool = True
    is_trial: bool = False
    trial_ends_at: Optional[datetime] = None
    valid_from: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    valid_until: Optional[datetime] = None   # None = no expiration
    # Metadata
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    created_by: Optional[str] = None


class UserCreate(BaseModel):
    """Model for user registration"""
    email: EmailStr
    password: str
    first_name: str
    last_name: str
    company_name: str
    industry: str


class UserLogin(BaseModel):
    """Model for user login"""
    email: EmailStr
    password: str


class User(BaseModel):
    """User model for authentication and authorization"""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    email: str
    first_name: str
    last_name: str
    tenant_id: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    # Phase 1: User Management fields
    is_active: bool = True
    invitation_token: Optional[str] = None
    invitation_expires_at: Optional[datetime] = None
    reset_token: Optional[str] = None
    reset_token_expires_at: Optional[datetime] = None
    invited_by: Optional[str] = None
    invited_at: Optional[datetime] = None
    last_login: Optional[datetime] = None
    deactivated_at: Optional[datetime] = None
    deactivated_by: Optional[str] = None
    # Phase 2: Role assignment (optional - only for hierarchy, not permissions)
    role_id: Optional[str] = None
    # Phase 3: Direct Permission Set assignments (Salesforce-style)
    permission_set_ids: List[str] = Field(default_factory=list)
    # User Freeze Feature
    is_frozen: bool = False
    frozen_until: Optional[datetime] = None
    frozen_at: Optional[datetime] = None
    frozen_by: Optional[str] = None
    freeze_reason: Optional[str] = None
    # Security Architecture: Super Admin bypass flag
    is_super_admin: bool = False
    # License: Reference to tenant's license (for future enforcement)
    license_id: Optional[str] = None


class UserResponse(BaseModel):
    """Response model for user data (excludes sensitive fields)"""
    id: str
    email: str
    first_name: str
    last_name: str
    tenant_id: str
    is_active: bool = True
    invited_at: Optional[datetime] = None
    last_login: Optional[datetime] = None
    created_at: Optional[datetime] = None  # Made optional for legacy users
    role_id: Optional[str] = None
    role_name: Optional[str] = None
    # Direct Permission Set assignments
    permission_set_ids: List[str] = Field(default_factory=list)
    is_frozen: bool = False
    frozen_until: Optional[datetime] = None
    freeze_reason: Optional[str] = None
    # Security Architecture: Super Admin flag
    is_super_admin: bool = False


class InviteUserRequest(BaseModel):
    """Request model for inviting a user"""
    email: EmailStr
    first_name: str
    last_name: str
    role_id: Optional[str] = None


class AcceptInviteRequest(BaseModel):
    """Request model for accepting invitation"""
    token: str
    password: str


class ForgotPasswordRequest(BaseModel):
    """Request model for forgot password"""
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    """Request model for resetting password"""
    token: str
    new_password: str


class Token(BaseModel):
    """JWT Token response model"""
    access_token: str
    token_type: str
    user: "User"
    tenant: "Tenant"
    default_landing_page: Optional[str] = None


# ============================================================================
# TENANT & ORGANIZATION MODELS
# ============================================================================

class Tenant(BaseModel):
    """Tenant/Organization model"""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    company_name: str = Field(default="")
    industry: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    is_active: bool = True


# ============================================================================
# ROLE & PERMISSION MODELS
# ============================================================================

class Role(BaseModel):
    """Role model for RBAC"""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: str
    is_system_role: bool = True
    parent_role_id: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ObjectPermission(BaseModel):
    """Permissions for a single object"""
    object_name: str
    # Object visibility - controls if object appears in UI
    visible: bool = True
    # Record actions
    create: bool = False
    read: bool = False
    edit: bool = False
    delete: bool = False
    view_all: bool = False
    modify_all: bool = False


class FieldPermission(BaseModel):
    """
    Field-level security permissions.
    
    Three states:
    - hidden=True: Field not returned in API, not shown in UI
    - hidden=False, editable=False: Field is visible but read-only
    - hidden=False, editable=True: Field is visible and editable (default)
    """
    field_name: str
    hidden: bool = False  # If true, field is not visible at all
    editable: bool = True  # If false, field is read-only (only applies when not hidden)


class PermissionSet(BaseModel):
    """Collection of permissions - can be assigned directly to users or via bundles"""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    # Legacy: role_id for backward compatibility (will be deprecated)
    role_id: Optional[str] = None
    role_name: Optional[str] = None
    # New: Standalone permission set fields
    name: Optional[str] = None
    api_name: Optional[str] = None
    description: Optional[str] = None
    is_custom: bool = False
    # Permissions
    permissions: List[ObjectPermission]
    field_permissions: Optional[Dict[str, List[FieldPermission]]] = None
    system_permissions: Optional[Dict[str, bool]] = None  # For system-level perms
    is_system_permission_set: bool = True
    tenant_id: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    created_by: Optional[str] = None


class UserPermissionSetAssignment(BaseModel):
    """Assignment of a permission set directly to a user"""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    user_id: str
    permission_set_id: str
    assigned_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    assigned_by: Optional[str] = None
    is_active: bool = True


class RecordShare(BaseModel):
    """
    Manual record sharing - grants explicit access to specific records.
    Supports sharing with users, groups, and roles.
    """
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    object_name: str
    record_id: str
    # Target of the share
    shared_with_type: str  # "user" | "group" | "role"
    shared_with_id: str    # user_id, group_id, or role_id
    shared_with_name: Optional[str] = None  # Display name for convenience
    # Access level
    access_level: str = "read"  # "read" | "edit"
    # Audit trail
    shared_by: str         # User who created the share
    shared_by_name: Optional[str] = None
    shared_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    reason: Optional[str] = None  # Optional reason for sharing
    # Expiration (optional)
    expires_at: Optional[datetime] = None
    # Status
    is_active: bool = True


# ============================================================================
# AUDIT & LOGGING MODELS
# ============================================================================

class AuditEvent(BaseModel):
    """Audit trail for security and data events"""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    event_type: str
    action: str
    actor_user_id: Optional[str] = None
    actor_email: Optional[str] = None
    target_user_id: Optional[str] = None
    target_email: Optional[str] = None
    object_name: Optional[str] = None
    record_id: Optional[str] = None
    details: Optional[Dict[str, Any]] = None
    ip_address: Optional[str] = None
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# ============================================================================
# OBJECT & RECORD MODELS
# ============================================================================

class TenantObject(BaseModel):
    """Object definition for a tenant"""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    object_name: str
    object_label: str
    object_plural: str
    fields: Dict[str, Any]
    is_custom: bool = False
    grant_access_using_hierarchies: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    # Integration: Schema Builder source marker
    is_from_schema_builder: bool = False
    object_type: Optional[str] = None
    icon: Optional[str] = None
    updated_at: Optional[datetime] = None
    description: Optional[str] = None
    # Default labels for reset functionality
    default_label_singular: Optional[str] = None
    default_label_plural: Optional[str] = None


class ObjectRecord(BaseModel):
    """Record instance of an object"""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    series_id: Optional[str] = None
    tenant_id: str
    object_name: str
    data: Dict[str, Any]
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    record_type_id: Optional[str] = None
    created_from_form: Optional[bool] = None
    form_id: Optional[str] = None
    source: Optional[str] = None
    owner_id: Optional[str] = None
    owner_type: Optional[str] = "USER"
    # Phase 1: System audit fields
    created_by: Optional[str] = None
    updated_by: Optional[str] = None
    system_timestamp: Optional[datetime] = None
    is_deleted: bool = False
    # Phase 1: Computed fields (stored in data, but tracked here for clarity)
    # - name: computed for lead/contact from first_name + last_name
    # - last_activity_at: computed from latest linked task/event


class RecordCreate(BaseModel):
    """Request model for creating a record"""
    data: Dict[str, Any]
    record_type_id: Optional[str] = None
    owner_type: Optional[str] = "USER"


class RecordUpdate(BaseModel):
    """Request model for updating a record"""
    data: Dict[str, Any]
    record_type_id: Optional[str] = None
    owner_id: Optional[str] = None  # Allow owner change via API
    owner_type: Optional[str] = "USER"


class PaginationInfo(BaseModel):
    """Pagination metadata"""
    total: int
    page: int
    limit: int
    total_pages: int


class PaginatedRecordsResponse(BaseModel):
    """Paginated records response"""
    records: List[ObjectRecord]
    pagination: PaginationInfo


# ============================================================================
# CUSTOM OBJECT & FIELD MODELS
# ============================================================================

class CustomObjectCreate(BaseModel):
    """Request model for creating custom object"""
    object_name: str
    object_label: str
    object_plural: str
    icon: Optional[str] = "FileText"
    name_field: str = "name"
    default_fields: Optional[dict] = None


class CustomField(BaseModel):
    """Custom field definition"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    label: str
    api_name: str
    type: str
    options: Optional[List[str]] = None
    default_value: Optional[Any] = None
    is_required: bool = False
    is_custom: bool = True
    currency_symbol: Optional[str] = "$"
    decimal_places: Optional[int] = 2
    length: Optional[int] = 18
    formula_expression: Optional[str] = None
    formula_return_type: Optional[str] = "Text"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class CustomFieldCreate(BaseModel):
    """Request model for creating custom field"""
    label: str
    api_name: str
    type: str
    options: Optional[List[str]] = None
    default_value: Optional[Any] = None
    is_required: bool = False
    currency_symbol: Optional[str] = "$"
    decimal_places: Optional[int] = 2
    length: Optional[int] = 18
    formula_expression: Optional[str] = None
    formula_return_type: Optional[str] = "Text"


class CustomFieldUpdate(BaseModel):
    """Request model for updating custom field"""
    label: Optional[str] = None
    api_name: Optional[str] = None
    type: Optional[str] = None
    options: Optional[List[str]] = None
    default_value: Optional[Any] = None
    is_required: Optional[bool] = None
    currency_symbol: Optional[str] = None
    decimal_places: Optional[int] = None
    length: Optional[int] = None
    formula_expression: Optional[str] = None
    formula_return_type: Optional[str] = None


class ObjectMetadata(BaseModel):
    """Object metadata with custom fields"""
    object_name: str
    tenant_id: str
    fields: List[CustomField] = []
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# ============================================================================
# SHARING MODELS
# ============================================================================

class OrganizationWideDefault(BaseModel):
    """Organization-Wide Default sharing setting per object"""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    object_name: str
    default_access: str
    grant_access_using_hierarchies: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ShareRecord(BaseModel):
    """Manual share record"""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    object_name: str
    record_id: str
    shared_with_type: str
    shared_with_id: str
    access_level: str
    reason: str
    granted_by: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# ============================================================================
# VALIDATION RULE MODELS
# ============================================================================

class ValidationRuleCondition(BaseModel):
    """Single condition in a validation rule"""
    field_name: str
    operator: str
    value: Optional[Any] = None


class ValidationRule(BaseModel):
    """Validation rule for an object"""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    object_name: str
    rule_name: str
    description: Optional[str] = None
    is_active: bool = True
    conditions: List[ValidationRuleCondition]
    logic_operator: str = "AND"
    error_message: str


# ============================================================================
# RECORD TYPE MODELS
# ============================================================================

class RecordTypeConfig(BaseModel):
    """Record Type with field visibility and page assignment"""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    object_name: str
    type_name: str
    description: Optional[str] = None
    is_active: bool = True
    field_visibility: Dict[str, bool] = {}
    page_assignment_type: str = "default"
    lightning_page_id: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# ============================================================================
# LIST VIEW & PREFERENCE MODELS
# ============================================================================

class UserListView(BaseModel):
    """User-defined list view"""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    tenant_id: str
    object_name: str
    name: str
    filter_criteria: Dict[str, Any] = {}
    columns: List[str] = []
    sort_field: Optional[str] = None
    sort_order: str = "asc"
    visibility: str = "private"
    is_pinned: bool = False
    is_default: bool = False
    # Record loading configuration
    loading_mode: str = "pagination"  # "pagination", "infinite_scroll", or "load_more"
    page_size: int = 20  # Records per page/batch
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class UserPreference(BaseModel):
    """User preference storage"""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    tenant_id: str
    preference_type: str
    object_name: str
    value: Dict[str, Any]
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ObjectPreferences(BaseModel):
    """Object-specific user preferences"""
    active_list_view: Optional[str] = "all_records"
    pinned_view: Optional[str] = None
    sort_field: Optional[str] = None
    sort_order: str = "asc"
    search_term: str = ""
    filter_field: Optional[str] = None
    filter_value: Optional[str] = None
    filter_condition: str = "equals"


# ============================================================================
# ACTIVITY MODELS
# ============================================================================

class ActivityTimelineItem(BaseModel):
    """Activity timeline item"""
    model_config = ConfigDict(extra="ignore")
    id: str
    type: str
    subject: str
    description: Optional[str]
    status: Optional[str]
    priority: Optional[str]
    due_date: Optional[str]
    start_date: Optional[str]
    end_date: Optional[str]
    created_at: datetime
    updated_at: datetime


# ============================================================================
# LEAD CONVERSION MODELS
# ============================================================================

class ConvertLeadRequest(BaseModel):
    """Request model for lead conversion"""
    account_action: str
    account_id: Optional[str] = None
    account_name: Optional[str] = None
    contact_action: str
    contact_id: Optional[str] = None
    contact_email: Optional[str] = None
    create_opportunity: bool = False
    opportunity_name: Optional[str] = None
    opportunity_amount: Optional[float] = None


class DuplicateRecord(BaseModel):
    """Duplicate record result"""
    id: str
    name: str
    email: Optional[str] = None
    score: float


class ConvertLeadResponse(BaseModel):
    """Response model for lead conversion"""
    success: bool
    message: str
    account_id: str
    contact_id: str
    opportunity_id: Optional[str] = None
    lead_id: str
    duplicate_accounts: Optional[List[DuplicateRecord]] = []
    duplicate_contacts: Optional[List[DuplicateRecord]] = []


# ============================================================================
# UTILITY FUNCTIONS
# ============================================================================

def parse_from_mongo(data):
    """Convert ISO strings back to datetime objects"""
    from datetime import datetime
    if isinstance(data, dict):
        parsed_data = {}
        for key, value in data.items():
            if key in ['created_at', 'updated_at'] and isinstance(value, str):
                try:
                    parsed_data[key] = datetime.fromisoformat(value)
                except:
                    parsed_data[key] = value
            elif isinstance(value, dict):
                parsed_data[key] = parse_from_mongo(value)
            else:
                parsed_data[key] = value
        return parsed_data
    return data


# Update forward references
Token.model_rebuild()
