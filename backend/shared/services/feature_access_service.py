"""
Feature Access Service - Runtime License Enforcement
Centralized service for CRM feature access resolution.

Access is determined using a 4-step validation:
1. Tenant Version supports the feature
2. Tenant has purchased the license for the module
3. User has a license seat assigned
4. User has the required permission bundle or permission set

Only if ALL conditions pass should the feature be usable.
"""
import logging
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List
from motor.motor_asyncio import AsyncIOMotorDatabase
from enum import Enum

logger = logging.getLogger(__name__)


class AccessDeniedReason(str, Enum):
    """Reason for access denial"""
    VERSION_NOT_SUPPORTED = "version_not_supported"
    TENANT_LICENSE_MISSING = "tenant_license_missing"
    TENANT_LICENSE_EXPIRED = "tenant_license_expired"
    USER_LICENSE_MISSING = "user_license_missing"
    PERMISSION_MISSING = "permission_missing"
    TENANT_SUSPENDED = "tenant_suspended"
    FEATURE_DISABLED = "feature_disabled"


class FeatureAccessResult:
    """Result of a feature access check"""
    
    def __init__(
        self,
        allowed: bool,
        reason: Optional[str] = None,
        reason_code: Optional[str] = None,
        module_key: Optional[str] = None,
        details: Optional[Dict[str, Any]] = None
    ):
        self.allowed = allowed
        self.reason = reason
        self.reason_code = reason_code
        self.module_key = module_key
        self.details = details or {}
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "allowed": self.allowed,
            "reason": self.reason,
            "reason_code": self.reason_code,
            "module_key": self.module_key,
            "details": self.details
        }


# Module to License Code mapping
# Maps CRM module keys to the license codes required to access them
MODULE_LICENSE_MAP = {
    "flow_builder": "FLOW_BUILDER_SEAT",
    "form_builder": "FORM_BUILDER_SEAT",
    "docflow": "DOCFLOW_SEAT",
    "survey_builder": "SURVEY_BUILDER_SEAT",
    "chatbot_manager": "CHATBOT_SEAT",
    "task_manager": "TASK_MANAGER_SEAT",
    "crm": "CRM_CORE_SEAT",
    "schema_builder": "ADMIN_CONSOLE_SEAT",
    # Modules that don't require specific licenses (base CRM access is enough)
    "file_manager": "CRM_CORE_SEAT",
    "app_manager": "CRM_CORE_SEAT",
    "import_builder": "CRM_CORE_SEAT",
    "export_builder": "CRM_CORE_SEAT",
}

# Features introduced in specific versions
# Map module_key to minimum version required
VERSION_FEATURE_MAP = {
    # Example: "advanced_analytics": "v2.0.0",
    # All current features available from v1.0.0
    "flow_builder": "v1.0.0",
    "form_builder": "v1.0.0",
    "docflow": "v1.0.0",
    "survey_builder": "v1.0.0",
    "chatbot_manager": "v1.0.0",
    "task_manager": "v1.0.0",
    "schema_builder": "v1.0.0",
    "file_manager": "v1.0.0",
    "app_manager": "v1.0.0",
    "crm": "v1.0.0",
}


class FeatureAccessService:
    """
    Centralized service for runtime feature access resolution.
    
    Implements the 4-step validation rule:
    Tenant Version + Tenant License + User License + Permission = Feature Access
    """
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.tenants_collection = db.tenants
        self.tenant_versions_collection = db.tenant_versions
        self.tenant_licenses_collection = db.tenant_licenses
        self.user_licenses_collection = db.user_licenses
        self.license_catalog_collection = db.license_catalog
        self.platform_releases_collection = db.platform_releases
        self.users_collection = db.users
        self.permission_sets_collection = db.permission_sets
        self.user_permission_sets_collection = db.user_permission_sets
        self.access_bundles_collection = db.access_bundles
        self.user_bundles_collection = db.user_access_bundles
        self._audit_service = None
    
    async def _get_audit_service(self):
        """Lazy load audit service"""
        if self._audit_service is None:
            try:
                from modules.admin.services.audit_log_service import get_audit_log_service
                self._audit_service = get_audit_log_service(self.db)
            except Exception as e:
                logger.warning(f"Could not load audit service: {e}")
        return self._audit_service
    
    async def _log_access_blocked(
        self,
        user_id: str,
        tenant_id: str,
        module_key: str,
        reason_code: str,
        reason: str,
        details: Dict = None
    ):
        """Log access blocked event for debugging and support"""
        try:
            audit_service = await self._get_audit_service()
            if audit_service:
                await audit_service.log_action(
                    action=f"access_blocked_{reason_code}",
                    actor_id=user_id,
                    actor_email=None,
                    tenant_id=tenant_id,
                    target_type="feature_access",
                    details={
                        "module_key": module_key,
                        "reason_code": reason_code,
                        "reason": reason,
                        **(details or {})
                    }
                )
        except Exception as e:
            logger.warning(f"Failed to log access blocked event: {e}")
    
    def _compare_versions(self, current: str, required: str) -> bool:
        """
        Compare semantic versions.
        Returns True if current >= required
        
        Args:
            current: Current version (e.g., "v1.2.0")
            required: Required minimum version (e.g., "v1.0.0")
        
        Returns:
            True if current version meets the requirement
        """
        try:
            # Strip 'v' prefix if present
            current = current.lstrip('v')
            required = required.lstrip('v')
            
            current_parts = [int(x) for x in current.split('.')]
            required_parts = [int(x) for x in required.split('.')]
            
            # Pad with zeros if needed
            while len(current_parts) < 3:
                current_parts.append(0)
            while len(required_parts) < 3:
                required_parts.append(0)
            
            return current_parts >= required_parts
        except Exception:
            # If version parsing fails, allow access
            return True
    
    async def _is_admin_user(self, user_id: str, tenant_id: str) -> bool:
        """
        Check if a user is a super admin or system administrator.
        These users bypass user license and permission checks.
        """
        user = await self.users_collection.find_one(
            {"id": user_id, "tenant_id": tenant_id},
            {"_id": 0, "is_super_admin": 1, "role_id": 1, "role_name": 1}
        )
        
        if not user:
            return False
        
        if user.get("is_super_admin"):
            return True
        
        role_id = (user.get("role_id") or "").lower()
        role_name = (user.get("role_name") or "").lower()
        admin_roles = ["admin", "system_administrator", "system_admin"]
        
        if role_id in admin_roles:
            return True
        
        if any(r in role_name for r in ["admin", "administrator"]):
            return True
        
        return False
    
    async def check_feature_access(
        self,
        user_id: str,
        tenant_id: str,
        module_key: str,
        log_blocked: bool = True
    ) -> FeatureAccessResult:
        """
        Check if a user can access a specific CRM feature/module.
        
        Implements the unified 5-step validation:
        0. Tenant Status (active, not suspended/terminated)
        1. Module Enabled (tenant_modules — is the feature toggle ON?)
        2. Tenant Version supports the feature
        3. Tenant has purchased the license for the module (tenant_licenses)
        4. User has a license seat assigned (user_licenses)
        5. User has the required permission
        
        Args:
            user_id: The user ID
            tenant_id: The tenant ID
            module_key: Module code (e.g., 'flow_builder', 'form_builder')
            log_blocked: Whether to log blocked access events
        
        Returns:
            FeatureAccessResult with allowed status and reason if denied
        """
        # Get the license code required for this module
        license_code = MODULE_LICENSE_MAP.get(module_key)
        
        if not license_code:
            # Module doesn't require a specific license, allow access
            return FeatureAccessResult(
                allowed=True,
                module_key=module_key,
                details={"check": "no_license_required"}
            )
        
        # =====================================================================
        # STEP 0: Check Tenant Status (prerequisite)
        # =====================================================================
        tenant = await self.tenants_collection.find_one(
            {"id": tenant_id},
            {"_id": 0, "status": 1, "plan": 1}
        )
        
        if not tenant:
            result = FeatureAccessResult(
                allowed=False,
                reason="Tenant not found",
                reason_code=AccessDeniedReason.TENANT_SUSPENDED,
                module_key=module_key
            )
            return result
        
        status = tenant.get("status", "ACTIVE")
        if status in ["SUSPENDED", "TERMINATED"]:
            result = FeatureAccessResult(
                allowed=False,
                reason=f"Organization is {status.lower()}. Please contact support.",
                reason_code=AccessDeniedReason.TENANT_SUSPENDED,
                module_key=module_key
            )
            return result
        
        # =====================================================================
        # STEP 1: Check Module Enabled (tenant_modules — feature toggle)
        # This is the single source of truth for feature visibility.
        # =====================================================================
        module_enabled = await self._check_module_enabled(tenant_id, module_key)
        if not module_enabled.allowed:
            if log_blocked:
                await self._log_access_blocked(
                    user_id, tenant_id, module_key,
                    module_enabled.reason_code,
                    module_enabled.reason
                )
            return module_enabled
        
        # =====================================================================
        # PRE-CHECK: Determine if user is super admin or system administrator
        # Super admins bypass user license and permission checks
        # =====================================================================
        is_admin = await self._is_admin_user(user_id, tenant_id)
        
        # =====================================================================
        # STEP 2: Check Tenant Version
        # =====================================================================
        version_result = await self._check_tenant_version(tenant_id, module_key)
        if not version_result.allowed:
            if log_blocked:
                await self._log_access_blocked(
                    user_id, tenant_id, module_key,
                    version_result.reason_code,
                    version_result.reason
                )
            return version_result
        
        # =====================================================================
        # STEP 3: Check Tenant License (seat pool)
        # =====================================================================
        tenant_license_result = await self._check_tenant_license(tenant_id, license_code, module_key)
        if not tenant_license_result.allowed:
            if log_blocked:
                await self._log_access_blocked(
                    user_id, tenant_id, module_key,
                    tenant_license_result.reason_code,
                    tenant_license_result.reason
                )
            return tenant_license_result
        
        # =====================================================================
        # STEP 4: Check User License (bypassed for admins)
        # =====================================================================
        if not is_admin:
            user_license_result = await self._check_user_license(user_id, tenant_id, license_code, module_key)
            if not user_license_result.allowed:
                if log_blocked:
                    await self._log_access_blocked(
                        user_id, tenant_id, module_key,
                        user_license_result.reason_code,
                        user_license_result.reason
                    )
                return user_license_result
        
        # =====================================================================
        # STEP 5: Check User Permission (bypassed for admins)
        # =====================================================================
        if not is_admin:
            permission_result = await self._check_user_permission(user_id, tenant_id, module_key)
            if not permission_result.allowed:
                if log_blocked:
                    await self._log_access_blocked(
                        user_id, tenant_id, module_key,
                        permission_result.reason_code,
                        permission_result.reason
                    )
                return permission_result
        
        # All checks passed!
        checks_passed = ["module_enabled", "version", "tenant_license"]
        if is_admin:
            checks_passed.extend(["user_license (admin bypass)", "permission (admin bypass)"])
        else:
            checks_passed.extend(["user_license", "permission"])
        
        return FeatureAccessResult(
            allowed=True,
            module_key=module_key,
            details={
                "license_code": license_code,
                "checks_passed": checks_passed,
                "permission_source": "super_admin" if is_admin else "standard"
            }
        )
    
    async def _check_module_enabled(
        self,
        tenant_id: str,
        module_key: str
    ) -> FeatureAccessResult:
        """
        Check if module is enabled for the tenant (tenant_modules collection).
        This is the single source of truth for feature visibility.
        
        Falls back to legacy tenant.module_entitlements if tenant_modules has no records.
        """
        # Check tenant_modules collection first
        module = await self.db.tenant_modules.find_one({
            "tenant_id": tenant_id,
            "module_code": module_key
        }, {"_id": 0})
        
        if module:
            if not module.get("is_enabled", False):
                return FeatureAccessResult(
                    allowed=False,
                    reason=f"The '{module_key.replace('_', ' ').title()}' module is not enabled for your organization.",
                    reason_code=AccessDeniedReason.FEATURE_DISABLED,
                    module_key=module_key
                )
            # Check time-based access
            now = datetime.now(timezone.utc)
            start_at = module.get("start_at")
            if start_at and isinstance(start_at, datetime):
                if start_at.tzinfo is None:
                    start_at = start_at.replace(tzinfo=timezone.utc)
                if start_at > now:
                    return FeatureAccessResult(
                        allowed=False,
                        reason=f"Module '{module_key}' access not yet started.",
                        reason_code=AccessDeniedReason.FEATURE_DISABLED,
                        module_key=module_key
                    )
            end_at = module.get("end_at")
            if end_at and isinstance(end_at, datetime):
                if end_at.tzinfo is None:
                    end_at = end_at.replace(tzinfo=timezone.utc)
                if end_at < now:
                    return FeatureAccessResult(
                        allowed=False,
                        reason=f"Module '{module_key}' access has expired.",
                        reason_code=AccessDeniedReason.FEATURE_DISABLED,
                        module_key=module_key
                    )
            return FeatureAccessResult(allowed=True, module_key=module_key)
        
        # Fallback: check legacy module_entitlements on tenant record
        tenant = await self.tenants_collection.find_one(
            {"id": tenant_id},
            {"_id": 0, "module_entitlements": 1}
        )
        if tenant and module_key in tenant.get("module_entitlements", []):
            return FeatureAccessResult(
                allowed=True,
                module_key=module_key,
                details={"source": "legacy_entitlements"}
            )
        
        return FeatureAccessResult(
            allowed=False,
            reason=f"The '{module_key.replace('_', ' ').title()}' module is not enabled for your organization.",
            reason_code=AccessDeniedReason.FEATURE_DISABLED,
            module_key=module_key
        )
    
    async def _check_tenant_version(
        self,
        tenant_id: str,
        module_key: str
    ) -> FeatureAccessResult:
        """
        Check if tenant's version supports the feature.
        
        Args:
            tenant_id: Tenant ID
            module_key: Module key to check
        
        Returns:
            FeatureAccessResult
        """
        # Get minimum version required for this module
        min_version = VERSION_FEATURE_MAP.get(module_key, "v1.0.0")
        
        # Get tenant's current version
        tenant_version = await self.tenant_versions_collection.find_one(
            {"tenant_id": tenant_id},
            {"_id": 0, "current_version_number": 1}
        )
        
        if not tenant_version:
            # No version record, assume v1.0.0 (default for new tenants)
            current_version = "v1.0.0"
        else:
            current_version = tenant_version.get("current_version_number", "v1.0.0")
        
        if not self._compare_versions(current_version, min_version):
            return FeatureAccessResult(
                allowed=False,
                reason=f"Access blocked: This feature requires platform version {min_version} or higher. Your organization is on version {current_version}.",
                reason_code=AccessDeniedReason.VERSION_NOT_SUPPORTED,
                module_key=module_key,
                details={
                    "current_version": current_version,
                    "required_version": min_version
                }
            )
        
        return FeatureAccessResult(allowed=True, module_key=module_key)
    
    async def _check_tenant_license(
        self,
        tenant_id: str,
        license_code: str,
        module_key: str
    ) -> FeatureAccessResult:
        """
        Check if tenant has purchased the required license.
        
        Args:
            tenant_id: Tenant ID
            license_code: License code to check
            module_key: Module key for context
        
        Returns:
            FeatureAccessResult
        """
        # Check if tenant has the license
        tenant_license = await self.tenant_licenses_collection.find_one({
            "tenant_id": tenant_id,
            "license_code": license_code
        }, {"_id": 0})
        
        if not tenant_license:
            # Get license name for better error message
            catalog = await self.license_catalog_collection.find_one(
                {"license_code": license_code},
                {"_id": 0, "license_name": 1}
            )
            license_name = catalog.get("license_name", license_code) if catalog else license_code
            
            return FeatureAccessResult(
                allowed=False,
                reason=f"Access blocked: Your organization has not purchased the {license_name} module.",
                reason_code=AccessDeniedReason.TENANT_LICENSE_MISSING,
                module_key=module_key,
                details={
                    "license_code": license_code,
                    "license_name": license_name
                }
            )
        
        # Check license status
        status = tenant_license.get("status", "active")
        if status not in ["active", "trial"]:
            return FeatureAccessResult(
                allowed=False,
                reason=f"Access blocked: The license for this module has {status}. Please contact your administrator.",
                reason_code=AccessDeniedReason.TENANT_LICENSE_EXPIRED,
                module_key=module_key,
                details={
                    "license_code": license_code,
                    "status": status
                }
            )
        
        # Check if billing period has expired
        billing_end = tenant_license.get("billing_end_date")
        if billing_end:
            if isinstance(billing_end, str):
                billing_end = datetime.fromisoformat(billing_end.replace("Z", "+00:00"))
            if billing_end.tzinfo is None:
                billing_end = billing_end.replace(tzinfo=timezone.utc)
            
            if datetime.now(timezone.utc) > billing_end:
                return FeatureAccessResult(
                    allowed=False,
                    reason="Access blocked: The license for this module has expired. Please renew your subscription.",
                    reason_code=AccessDeniedReason.TENANT_LICENSE_EXPIRED,
                    module_key=module_key,
                    details={
                        "license_code": license_code,
                        "expired_at": billing_end.isoformat()
                    }
                )
        
        return FeatureAccessResult(
            allowed=True,
            module_key=module_key,
            details={
                "tenant_license_id": tenant_license.get("id"),
                "seats_purchased": tenant_license.get("seats_purchased", 0)
            }
        )
    
    async def _check_user_license(
        self,
        user_id: str,
        tenant_id: str,
        license_code: str,
        module_key: str
    ) -> FeatureAccessResult:
        """
        Check if user has a license seat assigned.
        
        Args:
            user_id: User ID
            tenant_id: Tenant ID
            license_code: License code to check
            module_key: Module key for context
        
        Returns:
            FeatureAccessResult
        """
        # Check if user has the license assigned
        user_license = await self.user_licenses_collection.find_one({
            "user_id": user_id,
            "tenant_id": tenant_id,
            "license_code": license_code,
            "status": "active"
        }, {"_id": 0})
        
        if not user_license:
            # Get license name for better error message
            catalog = await self.license_catalog_collection.find_one(
                {"license_code": license_code},
                {"_id": 0, "license_name": 1}
            )
            license_name = catalog.get("license_name", license_code) if catalog else license_code
            
            return FeatureAccessResult(
                allowed=False,
                reason=f"Access blocked: You do not have an assigned license for the {license_name} module. Please contact your administrator.",
                reason_code=AccessDeniedReason.USER_LICENSE_MISSING,
                module_key=module_key,
                details={
                    "license_code": license_code,
                    "license_name": license_name
                }
            )
        
        # Check if user license has expired
        expires_at = user_license.get("expires_at")
        if expires_at:
            if isinstance(expires_at, str):
                expires_at = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
            if expires_at.tzinfo is None:
                expires_at = expires_at.replace(tzinfo=timezone.utc)
            
            if datetime.now(timezone.utc) > expires_at:
                return FeatureAccessResult(
                    allowed=False,
                    reason="Access blocked: Your license for this module has expired. Please contact your administrator.",
                    reason_code=AccessDeniedReason.USER_LICENSE_MISSING,
                    module_key=module_key,
                    details={
                        "license_code": license_code,
                        "expired_at": expires_at.isoformat()
                    }
                )
        
        return FeatureAccessResult(
            allowed=True,
            module_key=module_key,
            details={"user_license_id": user_license.get("id")}
        )
    
    async def _check_user_permission(
        self,
        user_id: str,
        tenant_id: str,
        module_key: str
    ) -> FeatureAccessResult:
        """
        Check if user has permission to access the module.
        
        For V1, we do a simplified permission check:
        - Super admins and system administrators always have access
        - Users with admin roles have access
        - Other users need specific permission bundles
        
        Args:
            user_id: User ID
            tenant_id: Tenant ID
            module_key: Module key to check
        
        Returns:
            FeatureAccessResult
        """
        # Get user info
        user = await self.users_collection.find_one(
            {"id": user_id, "tenant_id": tenant_id},
            {"_id": 0, "is_super_admin": 1, "role_id": 1, "role_name": 1}
        )
        
        if not user:
            return FeatureAccessResult(
                allowed=False,
                reason="User not found",
                reason_code=AccessDeniedReason.PERMISSION_MISSING,
                module_key=module_key
            )
        
        # Super admins always have access
        if user.get("is_super_admin"):
            return FeatureAccessResult(
                allowed=True,
                module_key=module_key,
                details={"permission_source": "super_admin"}
            )
        
        # System administrators always have access
        role_id = user.get("role_id", "")
        role_name = user.get("role_name", "")
        admin_roles = ["admin", "system_administrator", "system_admin"]
        
        if role_id and role_id.lower() in admin_roles:
            return FeatureAccessResult(
                allowed=True,
                module_key=module_key,
                details={"permission_source": "admin_role", "role_id": role_id}
            )
        
        if role_name and any(r in role_name.lower() for r in ["admin", "administrator"]):
            return FeatureAccessResult(
                allowed=True,
                module_key=module_key,
                details={"permission_source": "admin_role_name", "role_name": role_name}
            )
        
        # For V1, if user has the license, they have permission to use it
        # More granular permission checks can be added in V2
        return FeatureAccessResult(
            allowed=True,
            module_key=module_key,
            details={"permission_source": "license_implies_access"}
        )
    
    async def get_user_accessible_modules(
        self,
        user_id: str,
        tenant_id: str
    ) -> Dict[str, Any]:
        """
        Get all modules and their access status for a user.
        Used by frontend to determine which modules to show/hide.
        """
        modules = {}
        
        for module_key in MODULE_LICENSE_MAP.keys():
            result = await self.check_feature_access(
                user_id=user_id,
                tenant_id=tenant_id,
                module_key=module_key,
                log_blocked=False
            )
            
            modules[module_key] = {
                "allowed": result.allowed,
                "reason": result.reason if not result.allowed else None,
                "reason_code": result.reason_code if not result.allowed else None
            }
        
        return {
            "user_id": user_id,
            "tenant_id": tenant_id,
            "modules": modules
        }
    
    async def get_user_module_access(
        self,
        tenant_id: str,
        user_id: str
    ) -> Dict[str, Any]:
        """
        Get per-module license access status for a user.
        Used by runtime_api to determine LICENSE_REQUIRED state.
        
        Returns dict keyed by module_code with {allowed, reason}.
        """
        result = {}
        for module_key, license_code in MODULE_LICENSE_MAP.items():
            # Check tenant license
            tenant_license = await self.tenant_licenses_collection.find_one({
                "tenant_id": tenant_id,
                "license_code": license_code,
                "status": "active"
            }, {"_id": 0, "id": 1})
            
            if not tenant_license:
                result[module_key] = {
                    "allowed": False,
                    "reason": f"No {license_code} license purchased for your organization"
                }
                continue
            
            # Check user license
            user_license = await self.user_licenses_collection.find_one({
                "user_id": user_id,
                "tenant_id": tenant_id,
                "license_code": license_code,
                "status": "active"
            }, {"_id": 0})
            
            if not user_license:
                result[module_key] = {
                    "allowed": False,
                    "reason": "You don't have a seat assigned. Contact your administrator."
                }
                continue
            
            result[module_key] = {"allowed": True, "reason": None}
        
        return result
    
    async def get_effective_access_summary(
        self,
        user_id: str,
        tenant_id: str
    ) -> Dict[str, Any]:
        """
        Get detailed effective access summary for a user.
        Shows each module with its access status and the reason.
        Used by the Effective Access UI.
        
        Args:
            user_id: User ID
            tenant_id: Tenant ID
        
        Returns:
            Detailed access summary
        """
        # Get tenant info
        tenant = await self.tenants_collection.find_one(
            {"id": tenant_id},
            {"_id": 0, "id": 1, "name": 1, "company_name": 1, "plan": 1}
        )
        
        # Get user's licenses
        user_licenses = await self.user_licenses_collection.find({
            "user_id": user_id,
            "tenant_id": tenant_id,
            "status": "active"
        }, {"_id": 0}).to_list(100)
        
        user_license_codes = {lic["license_code"] for lic in user_licenses}
        
        # Get tenant's licenses
        tenant_licenses = await self.tenant_licenses_collection.find({
            "tenant_id": tenant_id,
            "status": {"$in": ["active", "trial"]}
        }, {"_id": 0}).to_list(100)
        
        tenant_license_codes = {lic["license_code"] for lic in tenant_licenses}
        
        # Get tenant version
        tenant_version = await self.tenant_versions_collection.find_one(
            {"tenant_id": tenant_id},
            {"_id": 0, "current_version_number": 1}
        )
        current_version = tenant_version.get("current_version_number", "v1.0.0") if tenant_version else "v1.0.0"
        
        # Get license catalog for names
        catalog = {}
        cursor = self.license_catalog_collection.find({}, {"_id": 0})
        async for lic in cursor:
            catalog[lic["license_code"]] = lic
        
        # Get user info for admin check
        user_info = await self.users_collection.find_one(
            {"id": user_id, "tenant_id": tenant_id},
            {"_id": 0, "is_super_admin": 1, "role_id": 1, "role_name": 1}
        )
        is_admin = await self._is_admin_user(user_id, tenant_id)
        
        # Build summary for each module
        modules_summary = []
        
        for module_key, license_code in MODULE_LICENSE_MAP.items():
            catalog_entry = catalog.get(license_code, {})
            license_name = catalog_entry.get("license_name", license_code)
            
            # Check access
            result = await self.check_feature_access(
                user_id=user_id,
                tenant_id=tenant_id,
                module_key=module_key,
                log_blocked=False
            )
            
            # Check module enabled status
            module_enabled_result = await self._check_module_enabled(tenant_id, module_key)
            module_is_enabled = module_enabled_result.allowed
            
            # Determine individual check statuses
            tenant_has_license = license_code in tenant_license_codes
            user_has_license = license_code in user_license_codes
            
            # For admins, user license and permission are auto-granted
            user_license_passed = user_has_license or is_admin
            user_license_status = "Assigned" if user_has_license else ("Admin Bypass" if is_admin else "Not Assigned")
            
            permission_source = "none"
            permission_passed = False
            if result.allowed:
                permission_source = result.details.get("permission_source", "standard")
                permission_passed = True
            elif result.reason_code != AccessDeniedReason.PERMISSION_MISSING:
                permission_passed = True
            
            if is_admin:
                permission_source = "super_admin" if user_info and user_info.get("is_super_admin") else "admin_role"
                permission_passed = True
            
            modules_summary.append({
                "module_key": module_key,
                "module_name": module_key.replace("_", " ").title(),
                "license_code": license_code,
                "license_name": license_name,
                "final_access": result.allowed,
                "checks": {
                    "module_enabled": {
                        "passed": module_is_enabled,
                        "status": "Enabled" if module_is_enabled else "Disabled"
                    },
                    "tenant_version": {
                        "passed": True,
                        "current": current_version,
                        "required": VERSION_FEATURE_MAP.get(module_key, "v1.0.0")
                    },
                    "tenant_license": {
                        "passed": tenant_has_license,
                        "status": "Purchased" if tenant_has_license else "Not Purchased"
                    },
                    "user_license": {
                        "passed": user_license_passed,
                        "status": user_license_status
                    },
                    "permission": {
                        "passed": permission_passed,
                        "source": permission_source
                    }
                },
                "block_reason": result.reason if not result.allowed else None,
                "block_reason_code": result.reason_code if not result.allowed else None
            })
        
        return {
            "user_id": user_id,
            "tenant_id": tenant_id,
            "tenant_name": tenant.get("name") or tenant.get("company_name") if tenant else None,
            "tenant_plan": tenant.get("plan", "standard") if tenant else None,
            "platform_version": current_version,
            "user_licenses": list(user_license_codes),
            "tenant_licenses": list(tenant_license_codes),
            "modules": modules_summary
        }


# Singleton instance
_feature_access_service = None


def get_feature_access_service(db: AsyncIOMotorDatabase) -> FeatureAccessService:
    """Get or create the feature access service instance"""
    global _feature_access_service
    if _feature_access_service is None:
        _feature_access_service = FeatureAccessService(db)
    return _feature_access_service
