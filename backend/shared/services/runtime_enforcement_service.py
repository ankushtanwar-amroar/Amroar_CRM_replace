"""
Runtime Enforcement Service - Control Plane Integration
Centralized enforcement for modules, quotas, subscriptions, and storage.
The CRM runtime uses this service to check entitlements before allowing actions.
"""
import logging
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List, Tuple
from motor.motor_asyncio import AsyncIOMotorDatabase
from functools import wraps
from fastapi import HTTPException, Request

logger = logging.getLogger(__name__)


class EnforcementResult:
    """Result of an enforcement check"""
    
    def __init__(
        self,
        allowed: bool,
        enforcement_type: str = "NONE",
        message: str = "",
        limit_key: str = None,
        limit_value: int = None,
        consumed_value: int = None,
        remaining: int = None
    ):
        self.allowed = allowed
        self.enforcement_type = enforcement_type
        self.message = message
        self.limit_key = limit_key
        self.limit_value = limit_value
        self.consumed_value = consumed_value
        self.remaining = remaining
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "allowed": self.allowed,
            "enforcement_type": self.enforcement_type,
            "message": self.message,
            "limit_key": self.limit_key,
            "limit_value": self.limit_value,
            "consumed_value": self.consumed_value,
            "remaining": self.remaining
        }


class RuntimeEnforcementService:
    """
    Centralized service for runtime enforcement of Control Plane policies.
    
    This service is used by the CRM runtime to check:
    - Module entitlements (is module enabled for tenant?)
    - Quota limits (is action within allowed limits?)
    - Seat limits (can more users be added?)
    - Subscription status (is tenant in good standing?)
    - Storage limits (is there space for uploads?)
    
    All enforcement is read from the Control Plane data models:
    - tenant_modules collection
    - tenant_limits collection
    - tenants collection (for status and subscription)
    """
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.modules_collection = db.tenant_modules
        self.limits_collection = db.tenant_limits
        self.tenants_collection = db.tenants
    
    # =========================================================================
    # SUBSCRIPTION STATUS ENFORCEMENT
    # =========================================================================
    
    async def check_subscription_status(self, tenant_id: str) -> EnforcementResult:
        """
        Check if tenant subscription allows operations.
        
        Returns:
            EnforcementResult with:
            - allowed=True if tenant can perform operations
            - allowed=False if tenant is in restricted state
        """
        tenant = await self.tenants_collection.find_one(
            {"id": tenant_id},
            {"_id": 0, "id": 1, "status": 1, "billing_status": 1, "is_trial": 1, "trial_ends_at": 1}
        )
        
        if tenant is None:
            return EnforcementResult(
                allowed=False,
                enforcement_type="HARD_STOP",
                message="Tenant not found"
            )
        
        status = tenant.get("status", "ACTIVE")
        billing_status = tenant.get("billing_status", "CURRENT")
        
        # TERMINATED - no access
        if status == "TERMINATED":
            return EnforcementResult(
                allowed=False,
                enforcement_type="HARD_STOP",
                message="Tenant has been terminated"
            )
        
        # SUSPENDED - no access
        if status == "SUSPENDED":
            return EnforcementResult(
                allowed=False,
                enforcement_type="HARD_STOP",
                message="Tenant is suspended. Please contact support."
            )
        
        # READ_ONLY - limited access
        if status == "READ_ONLY":
            return EnforcementResult(
                allowed=False,  # For write operations
                enforcement_type="SOFT_WARNING",
                message="Tenant is in read-only mode. Modifications are not allowed."
            )
        
        # Check trial expiry
        if tenant.get("is_trial"):
            trial_ends_at = tenant.get("trial_ends_at")
            if trial_ends_at:
                if isinstance(trial_ends_at, str):
                    trial_ends_at = datetime.fromisoformat(trial_ends_at.replace("Z", "+00:00"))
                if trial_ends_at.tzinfo is None:
                    trial_ends_at = trial_ends_at.replace(tzinfo=timezone.utc)
                
                if datetime.now(timezone.utc) > trial_ends_at:
                    return EnforcementResult(
                        allowed=False,
                        enforcement_type="HARD_STOP",
                        message="Trial period has expired. Please upgrade your subscription."
                    )
        
        # Check billing status
        if billing_status == "OVERDUE":
            return EnforcementResult(
                allowed=True,  # Allow with warning
                enforcement_type="SOFT_WARNING",
                message="Payment is overdue. Please update your billing information."
            )
        
        return EnforcementResult(
            allowed=True,
            enforcement_type="NONE",
            message="OK"
        )
    
    async def is_write_allowed(self, tenant_id: str) -> bool:
        """Quick check if tenant can perform write operations"""
        tenant = await self.tenants_collection.find_one(
            {"id": tenant_id},
            {"_id": 0, "status": 1}
        )
        
        if not tenant:
            return False
        
        status = tenant.get("status", "ACTIVE")
        return status in ["ACTIVE", "PENDING", "PROVISIONING"]
    
    # =========================================================================
    # MODULE ENTITLEMENT ENFORCEMENT
    # =========================================================================
    
    async def check_module_access(
        self,
        tenant_id: str,
        module_code: str
    ) -> EnforcementResult:
        """
        Check if a module is enabled for a tenant.
        
        Used to:
        - Show/hide module UI in frontend
        - Allow/block module API routes
        
        Args:
            tenant_id: The tenant ID
            module_code: Module code (e.g., 'flow_builder', 'schema_builder')
        
        Returns:
            EnforcementResult with allowed=True if module is accessible
        """
        # First check if module record exists in tenant_modules
        module = await self.modules_collection.find_one({
            "tenant_id": tenant_id,
            "module_code": module_code
        }, {"_id": 0})
        
        if module:
            if not module.get("is_enabled"):
                return EnforcementResult(
                    allowed=False,
                    enforcement_type="HARD_STOP",
                    message=f"Module '{module_code}' is not enabled for your subscription"
                )
            
            # Check time-based access
            now = datetime.now(timezone.utc)
            
            start_at = module.get("start_at")
            if start_at:
                if isinstance(start_at, datetime):
                    if start_at.tzinfo is None:
                        start_at = start_at.replace(tzinfo=timezone.utc)
                    if start_at > now:
                        return EnforcementResult(
                            allowed=False,
                            enforcement_type="HARD_STOP",
                            message=f"Module '{module_code}' access not yet started"
                        )
            
            end_at = module.get("end_at")
            if end_at:
                if isinstance(end_at, datetime):
                    if end_at.tzinfo is None:
                        end_at = end_at.replace(tzinfo=timezone.utc)
                    if end_at < now:
                        return EnforcementResult(
                            allowed=False,
                            enforcement_type="HARD_STOP",
                            message=f"Module '{module_code}' access has expired"
                        )
            
            return EnforcementResult(
                allowed=True,
                enforcement_type="NONE",
                message="OK"
            )
        
        # Fallback: Check legacy module_entitlements array in tenant record
        tenant = await self.tenants_collection.find_one(
            {"id": tenant_id},
            {"_id": 0, "module_entitlements": 1}
        )
        
        if tenant and module_code in tenant.get("module_entitlements", []):
            return EnforcementResult(
                allowed=True,
                enforcement_type="NONE",
                message="OK (legacy)"
            )
        
        return EnforcementResult(
            allowed=False,
            enforcement_type="HARD_STOP",
            message=f"Module '{module_code}' is not enabled for your subscription"
        )
    
    async def get_enabled_modules(self, tenant_id: str) -> List[str]:
        """Get list of enabled module codes for a tenant"""
        # Check tenant_modules collection
        modules = await self.modules_collection.find({
            "tenant_id": tenant_id,
            "is_enabled": True
        }, {"_id": 0, "module_code": 1}).to_list(100)
        
        enabled = [m["module_code"] for m in modules]
        
        # If no modules in new collection, check legacy
        if not enabled:
            tenant = await self.tenants_collection.find_one(
                {"id": tenant_id},
                {"_id": 0, "module_entitlements": 1}
            )
            if tenant:
                enabled = tenant.get("module_entitlements", [])
        
        return enabled
    
    # =========================================================================
    # QUOTA/LIMIT ENFORCEMENT
    # =========================================================================
    
    async def check_limit(
        self,
        tenant_id: str,
        limit_key: str,
        increment: int = 1
    ) -> EnforcementResult:
        """
        Check if an action would exceed a limit.
        
        Args:
            tenant_id: The tenant ID
            limit_key: Limit identifier (e.g., 'MAX_USERS', 'MAX_CUSTOM_OBJECTS')
            increment: How much the action would consume (default 1)
        
        Returns:
            EnforcementResult with:
            - allowed=True if action is within limits
            - enforcement_type indicates if it's a hard stop or soft warning
        """
        limit = await self.limits_collection.find_one({
            "tenant_id": tenant_id,
            "limit_key": limit_key
        }, {"_id": 0})
        
        if not limit:
            # No limit defined = unlimited (or use tenant defaults)
            return EnforcementResult(
                allowed=True,
                enforcement_type="NONE",
                message="No limit configured",
                limit_key=limit_key
            )
        
        limit_value = limit.get("limit_value", 0)
        consumed_value = limit.get("consumed_value", 0)
        enforcement_type = limit.get("enforcement_type", "HARD_STOP")
        remaining = max(0, limit_value - consumed_value)
        
        would_exceed = (consumed_value + increment) > limit_value
        
        if would_exceed:
            if enforcement_type == "HARD_STOP":
                return EnforcementResult(
                    allowed=False,
                    enforcement_type="HARD_STOP",
                    message=f"Limit exceeded: {limit_key}. Used {consumed_value}/{limit_value}. Cannot add {increment} more.",
                    limit_key=limit_key,
                    limit_value=limit_value,
                    consumed_value=consumed_value,
                    remaining=remaining
                )
            else:  # SOFT_WARNING
                return EnforcementResult(
                    allowed=True,
                    enforcement_type="SOFT_WARNING",
                    message=f"Warning: Limit '{limit_key}' exceeded. Used {consumed_value}/{limit_value}.",
                    limit_key=limit_key,
                    limit_value=limit_value,
                    consumed_value=consumed_value,
                    remaining=remaining
                )
        
        return EnforcementResult(
            allowed=True,
            enforcement_type="NONE",
            message="OK",
            limit_key=limit_key,
            limit_value=limit_value,
            consumed_value=consumed_value,
            remaining=remaining
        )
    
    async def increment_usage(
        self,
        tenant_id: str,
        limit_key: str,
        increment: int = 1,
        enforce: bool = True
    ) -> EnforcementResult:
        """
        Increment usage counter for a limit.
        Optionally enforces the limit before incrementing.
        
        Args:
            tenant_id: The tenant ID
            limit_key: Limit identifier
            increment: Amount to increment
            enforce: If True, check limit before incrementing
        
        Returns:
            EnforcementResult with updated values
        """
        if enforce:
            check = await self.check_limit(tenant_id, limit_key, increment)
            if not check.allowed and check.enforcement_type == "HARD_STOP":
                return check
        
        result = await self.limits_collection.update_one(
            {"tenant_id": tenant_id, "limit_key": limit_key},
            {
                "$inc": {"consumed_value": increment},
                "$set": {"updated_at": datetime.now(timezone.utc)}
            }
        )
        
        if result.matched_count == 0:
            return EnforcementResult(
                allowed=True,
                enforcement_type="NONE",
                message="No limit tracked"
            )
        
        # Return updated limit
        return await self.check_limit(tenant_id, limit_key, 0)
    
    async def decrement_usage(
        self,
        tenant_id: str,
        limit_key: str,
        decrement: int = 1
    ) -> EnforcementResult:
        """
        Decrement usage counter for a limit (e.g., when deleting an object).
        """
        await self.limits_collection.update_one(
            {"tenant_id": tenant_id, "limit_key": limit_key},
            {
                "$inc": {"consumed_value": -decrement},
                "$set": {"updated_at": datetime.now(timezone.utc)}
            }
        )
        
        # Ensure consumed_value doesn't go negative
        await self.limits_collection.update_one(
            {"tenant_id": tenant_id, "limit_key": limit_key, "consumed_value": {"$lt": 0}},
            {"$set": {"consumed_value": 0}}
        )
        
        return await self.check_limit(tenant_id, limit_key, 0)
    
    # =========================================================================
    # SEAT LIMIT ENFORCEMENT
    # =========================================================================
    
    async def check_seat_limit(self, tenant_id: str) -> EnforcementResult:
        """
        Check if tenant can add more users.
        Checks both tenant_limits (MAX_USERS) and tenant.seat_limit.
        """
        # First check tenant_limits
        limit_result = await self.check_limit(tenant_id, "MAX_USERS", 1)
        
        if not limit_result.allowed:
            return limit_result
        
        # Also check legacy seat_limit in tenant record
        tenant = await self.tenants_collection.find_one(
            {"id": tenant_id},
            {"_id": 0, "seat_limit": 1}
        )
        
        if tenant and tenant.get("seat_limit"):
            seat_limit = tenant["seat_limit"]
            
            # Count current users
            user_count = await self.db.users.count_documents({
                "tenant_id": tenant_id,
                "is_deleted": {"$ne": True}
            })
            
            if user_count >= seat_limit:
                return EnforcementResult(
                    allowed=False,
                    enforcement_type="HARD_STOP",
                    message=f"Seat limit reached: {user_count}/{seat_limit} users",
                    limit_key="SEAT_LIMIT",
                    limit_value=seat_limit,
                    consumed_value=user_count,
                    remaining=0
                )
        
        return EnforcementResult(
            allowed=True,
            enforcement_type="NONE",
            message="OK"
        )
    
    async def get_seat_usage(self, tenant_id: str) -> Dict[str, Any]:
        """Get seat usage information for a tenant"""
        tenant = await self.tenants_collection.find_one(
            {"id": tenant_id},
            {"_id": 0, "seat_limit": 1}
        )
        
        seat_limit = tenant.get("seat_limit", 10) if tenant else 10
        
        # Also check MAX_USERS limit
        limit = await self.limits_collection.find_one(
            {"tenant_id": tenant_id, "limit_key": "MAX_USERS"},
            {"_id": 0}
        )
        
        if limit:
            seat_limit = limit.get("limit_value", seat_limit)
        
        user_count = await self.db.users.count_documents({
            "tenant_id": tenant_id,
            "is_deleted": {"$ne": True}
        })
        
        active_count = await self.db.users.count_documents({
            "tenant_id": tenant_id,
            "is_active": True,
            "is_deleted": {"$ne": True}
        })
        
        return {
            "seat_limit": seat_limit,
            "total_users": user_count,
            "active_users": active_count,
            "seats_available": max(0, seat_limit - user_count),
            "utilization_percent": round((user_count / seat_limit) * 100, 1) if seat_limit > 0 else 0
        }
    
    # =========================================================================
    # STORAGE LIMIT ENFORCEMENT
    # =========================================================================
    
    async def check_storage_limit(
        self,
        tenant_id: str,
        file_size_bytes: int
    ) -> EnforcementResult:
        """
        Check if tenant has enough storage for a file upload.
        
        Args:
            tenant_id: The tenant ID
            file_size_bytes: Size of file to upload in bytes
        
        Returns:
            EnforcementResult indicating if upload is allowed
        """
        file_size_gb = file_size_bytes / (1024 * 1024 * 1024)
        
        # Check MAX_STORAGE_GB limit
        limit = await self.limits_collection.find_one({
            "tenant_id": tenant_id,
            "limit_key": "MAX_STORAGE_GB"
        }, {"_id": 0})
        
        if not limit:
            # No limit configured
            return EnforcementResult(
                allowed=True,
                enforcement_type="NONE",
                message="No storage limit configured"
            )
        
        limit_value = limit.get("limit_value", 0)
        consumed_value = limit.get("consumed_value", 0)
        enforcement_type = limit.get("enforcement_type", "HARD_STOP")
        
        # Calculate if upload would exceed limit
        would_exceed = (consumed_value + file_size_gb) > limit_value
        remaining_gb = max(0, limit_value - consumed_value)
        
        if would_exceed:
            if enforcement_type == "HARD_STOP":
                return EnforcementResult(
                    allowed=False,
                    enforcement_type="HARD_STOP",
                    message=f"Storage limit exceeded. Used {consumed_value:.2f}GB / {limit_value}GB. File size: {file_size_gb:.2f}GB",
                    limit_key="MAX_STORAGE_GB",
                    limit_value=limit_value,
                    consumed_value=consumed_value,
                    remaining=int(remaining_gb * 1024)  # Convert to MB for display
                )
            else:
                return EnforcementResult(
                    allowed=True,
                    enforcement_type="SOFT_WARNING",
                    message=f"Warning: Storage limit exceeded. Used {consumed_value:.2f}GB / {limit_value}GB",
                    limit_key="MAX_STORAGE_GB",
                    limit_value=limit_value,
                    consumed_value=consumed_value,
                    remaining=int(remaining_gb * 1024)
                )
        
        return EnforcementResult(
            allowed=True,
            enforcement_type="NONE",
            message="OK",
            limit_key="MAX_STORAGE_GB",
            limit_value=limit_value,
            consumed_value=consumed_value,
            remaining=int(remaining_gb * 1024)
        )
    
    async def check_file_upload_limit(
        self,
        tenant_id: str,
        file_size_bytes: int
    ) -> EnforcementResult:
        """
        Check if a single file upload is within the max file size limit.
        """
        file_size_gb = file_size_bytes / (1024 * 1024 * 1024)
        
        limit = await self.limits_collection.find_one({
            "tenant_id": tenant_id,
            "limit_key": "MAX_FILE_UPLOAD_GB"
        }, {"_id": 0})
        
        if not limit:
            return EnforcementResult(allowed=True, message="No file size limit")
        
        max_file_size = limit.get("limit_value", 1)  # Default 1GB
        
        if file_size_gb > max_file_size:
            return EnforcementResult(
                allowed=False,
                enforcement_type="HARD_STOP",
                message=f"File too large. Maximum file size is {max_file_size}GB. Your file: {file_size_gb:.2f}GB",
                limit_key="MAX_FILE_UPLOAD_GB",
                limit_value=max_file_size
            )
        
        return EnforcementResult(
            allowed=True,
            enforcement_type="NONE",
            message="OK"
        )
    
    async def update_storage_usage(
        self,
        tenant_id: str,
        size_change_bytes: int
    ):
        """
        Update storage usage after file upload/delete.
        Positive for upload, negative for delete.
        """
        size_change_gb = size_change_bytes / (1024 * 1024 * 1024)
        
        await self.limits_collection.update_one(
            {"tenant_id": tenant_id, "limit_key": "MAX_STORAGE_GB"},
            {
                "$inc": {"consumed_value": size_change_gb},
                "$set": {"updated_at": datetime.now(timezone.utc)}
            }
        )
        
        # Ensure consumed doesn't go negative
        await self.limits_collection.update_one(
            {"tenant_id": tenant_id, "limit_key": "MAX_STORAGE_GB", "consumed_value": {"$lt": 0}},
            {"$set": {"consumed_value": 0}}
        )
    
    # =========================================================================
    # COMBINED ENFORCEMENT CHECKS
    # =========================================================================
    
    async def check_can_create_object(self, tenant_id: str) -> EnforcementResult:
        """Check if tenant can create a new custom object"""
        # Check subscription status
        status_check = await self.check_subscription_status(tenant_id)
        if not status_check.allowed and status_check.enforcement_type == "HARD_STOP":
            return status_check
        
        # Check write permission
        if not await self.is_write_allowed(tenant_id):
            return EnforcementResult(
                allowed=False,
                enforcement_type="HARD_STOP",
                message="Write operations not allowed in current tenant state"
            )
        
        # Check module access
        module_check = await self.check_module_access(tenant_id, "schema_builder")
        if not module_check.allowed:
            return module_check
        
        # Check limit
        return await self.check_limit(tenant_id, "MAX_CUSTOM_OBJECTS", 1)
    
    async def check_can_create_field(self, tenant_id: str) -> EnforcementResult:
        """Check if tenant can create a new custom field"""
        status_check = await self.check_subscription_status(tenant_id)
        if not status_check.allowed and status_check.enforcement_type == "HARD_STOP":
            return status_check
        
        if not await self.is_write_allowed(tenant_id):
            return EnforcementResult(
                allowed=False,
                enforcement_type="HARD_STOP",
                message="Write operations not allowed"
            )
        
        module_check = await self.check_module_access(tenant_id, "schema_builder")
        if not module_check.allowed:
            return module_check
        
        return await self.check_limit(tenant_id, "MAX_CUSTOM_FIELDS", 1)
    
    async def check_can_create_flow(self, tenant_id: str) -> EnforcementResult:
        """Check if tenant can create a new flow"""
        status_check = await self.check_subscription_status(tenant_id)
        if not status_check.allowed and status_check.enforcement_type == "HARD_STOP":
            return status_check
        
        if not await self.is_write_allowed(tenant_id):
            return EnforcementResult(
                allowed=False,
                enforcement_type="HARD_STOP",
                message="Write operations not allowed"
            )
        
        module_check = await self.check_module_access(tenant_id, "flow_builder")
        if not module_check.allowed:
            return module_check
        
        return await self.check_limit(tenant_id, "MAX_ACTIVE_FLOWS", 1)
    
    async def check_can_create_user(self, tenant_id: str) -> EnforcementResult:
        """Check if tenant can add a new user"""
        status_check = await self.check_subscription_status(tenant_id)
        if not status_check.allowed and status_check.enforcement_type == "HARD_STOP":
            return status_check
        
        if not await self.is_write_allowed(tenant_id):
            return EnforcementResult(
                allowed=False,
                enforcement_type="HARD_STOP",
                message="Write operations not allowed"
            )
        
        return await self.check_seat_limit(tenant_id)
    
    async def check_api_limit(self, tenant_id: str) -> EnforcementResult:
        """Check API rate limit and increment counter"""
        return await self.increment_usage(
            tenant_id, "MAX_API_CALLS_PER_MONTH", 1,
            enforce=True
        )
    
    async def check_ai_credits(self, tenant_id: str, credits: int = 1) -> EnforcementResult:
        """Check and consume AI credits"""
        return await self.check_limit(tenant_id, "MAX_AI_CREDITS_PER_MONTH", credits)
    
    async def consume_ai_credits(self, tenant_id: str, credits: int = 1) -> EnforcementResult:
        """Consume AI credits after successful operation"""
        return await self.increment_usage(
            tenant_id, "MAX_AI_CREDITS_PER_MONTH", credits,
            enforce=False  # Already checked before operation
        )


# Singleton instance
_enforcement_service = None

def get_enforcement_service(db: AsyncIOMotorDatabase) -> RuntimeEnforcementService:
    global _enforcement_service
    if _enforcement_service is None:
        _enforcement_service = RuntimeEnforcementService(db)
    return _enforcement_service
