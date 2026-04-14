"""
Runtime Enforcement Dependencies - Control Plane Integration
FastAPI dependencies for enforcing module access, quotas, and subscription status.

These dependencies integrate the RuntimeEnforcementService into CRM routes,
making the CRM "aware" of Control Plane settings without scattering checks everywhere.

Usage in routes:
    @router.post("/objects")
    async def create_object(
        current_user: User = Depends(get_current_user),
        _: None = Depends(require_module("schema_builder")),
        __: None = Depends(require_can_create_object)
    ):
        ...
"""
import logging
from typing import Optional, Callable, Any
from functools import wraps
from fastapi import Depends, HTTPException, Request, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from config.database import db
from shared.models import User
from modules.auth.api.auth_routes import get_current_user
from .runtime_enforcement_service import (
    RuntimeEnforcementService,
    EnforcementResult,
    get_enforcement_service
)

logger = logging.getLogger(__name__)


def get_enforcement() -> RuntimeEnforcementService:
    """Dependency to get the RuntimeEnforcementService instance"""
    return get_enforcement_service(db)


# =============================================================================
# SUBSCRIPTION STATUS DEPENDENCIES
# =============================================================================

async def require_active_subscription(
    current_user: User = Depends(get_current_user),
    enforcement: RuntimeEnforcementService = Depends(get_enforcement)
) -> EnforcementResult:
    """
    Dependency that requires an active subscription.
    Blocks access for TERMINATED and SUSPENDED tenants.
    """
    result = await enforcement.check_subscription_status(current_user.tenant_id)
    
    if not result.allowed and result.enforcement_type == "HARD_STOP":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": "subscription_blocked",
                "message": result.message,
                "enforcement_type": result.enforcement_type
            }
        )
    
    return result


async def require_write_access(
    current_user: User = Depends(get_current_user),
    enforcement: RuntimeEnforcementService = Depends(get_enforcement)
) -> bool:
    """
    Dependency that requires write access.
    Blocks access for READ_ONLY, SUSPENDED, and TERMINATED tenants.
    """
    can_write = await enforcement.is_write_allowed(current_user.tenant_id)
    
    if not can_write:
        # Get detailed status for error message
        result = await enforcement.check_subscription_status(current_user.tenant_id)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": "write_blocked",
                "message": result.message or "Write operations are not allowed for your account",
                "enforcement_type": "HARD_STOP"
            }
        )
    
    return True


# =============================================================================
# MODULE ACCESS DEPENDENCIES
# =============================================================================

def require_module(module_code: str):
    """
    Dependency factory that creates a dependency requiring a specific module.
    
    Usage:
        @router.post("/flows")
        async def create_flow(
            _: None = Depends(require_module("flow_builder"))
        ):
            ...
    """
    async def check_module(
        current_user: User = Depends(get_current_user),
        enforcement: RuntimeEnforcementService = Depends(get_enforcement)
    ) -> EnforcementResult:
        result = await enforcement.check_module_access(current_user.tenant_id, module_code)
        
        if not result.allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "error": "module_disabled",
                    "module_code": module_code,
                    "message": result.message,
                    "enforcement_type": result.enforcement_type
                }
            )
        
        return result
    
    return check_module


async def get_enabled_modules(
    current_user: User = Depends(get_current_user),
    enforcement: RuntimeEnforcementService = Depends(get_enforcement)
) -> list:
    """
    Dependency that returns list of enabled modules for the tenant.
    Useful for UI to show/hide module navigation.
    """
    return await enforcement.get_enabled_modules(current_user.tenant_id)


# =============================================================================
# QUOTA/LIMIT DEPENDENCIES
# =============================================================================

def require_limit(limit_key: str, increment: int = 1):
    """
    Dependency factory that checks a specific limit before allowing an action.
    
    Usage:
        @router.post("/custom-objects")
        async def create_object(
            _: None = Depends(require_limit("MAX_CUSTOM_OBJECTS"))
        ):
            ...
    """
    async def check_limit(
        current_user: User = Depends(get_current_user),
        enforcement: RuntimeEnforcementService = Depends(get_enforcement)
    ) -> EnforcementResult:
        result = await enforcement.check_limit(current_user.tenant_id, limit_key, increment)
        
        if not result.allowed and result.enforcement_type == "HARD_STOP":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "error": "limit_exceeded",
                    "limit_key": limit_key,
                    "limit_value": result.limit_value,
                    "consumed_value": result.consumed_value,
                    "remaining": result.remaining,
                    "message": result.message,
                    "enforcement_type": result.enforcement_type
                }
            )
        
        return result
    
    return check_limit


# =============================================================================
# COMBINED ENFORCEMENT DEPENDENCIES
# =============================================================================

async def require_can_create_object(
    current_user: User = Depends(get_current_user),
    enforcement: RuntimeEnforcementService = Depends(get_enforcement)
) -> EnforcementResult:
    """
    Dependency that checks all requirements for creating a custom object:
    - Active subscription
    - Write access
    - schema_builder module enabled
    - MAX_CUSTOM_OBJECTS limit not exceeded
    """
    result = await enforcement.check_can_create_object(current_user.tenant_id)
    
    if not result.allowed and result.enforcement_type == "HARD_STOP":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": "cannot_create_object",
                "message": result.message,
                "limit_key": result.limit_key,
                "limit_value": result.limit_value,
                "consumed_value": result.consumed_value,
                "remaining": result.remaining,
                "enforcement_type": result.enforcement_type
            }
        )
    
    return result


async def require_can_create_field(
    current_user: User = Depends(get_current_user),
    enforcement: RuntimeEnforcementService = Depends(get_enforcement)
) -> EnforcementResult:
    """
    Dependency that checks all requirements for creating a custom field.
    """
    result = await enforcement.check_can_create_field(current_user.tenant_id)
    
    if not result.allowed and result.enforcement_type == "HARD_STOP":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": "cannot_create_field",
                "message": result.message,
                "limit_key": result.limit_key,
                "limit_value": result.limit_value,
                "consumed_value": result.consumed_value,
                "enforcement_type": result.enforcement_type
            }
        )
    
    return result


async def require_can_create_flow(
    current_user: User = Depends(get_current_user),
    enforcement: RuntimeEnforcementService = Depends(get_enforcement)
) -> EnforcementResult:
    """
    Dependency that checks all requirements for creating a flow.
    """
    result = await enforcement.check_can_create_flow(current_user.tenant_id)
    
    if not result.allowed and result.enforcement_type == "HARD_STOP":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": "cannot_create_flow",
                "message": result.message,
                "limit_key": result.limit_key,
                "limit_value": result.limit_value,
                "consumed_value": result.consumed_value,
                "enforcement_type": result.enforcement_type
            }
        )
    
    return result


async def require_can_create_user(
    current_user: User = Depends(get_current_user),
    enforcement: RuntimeEnforcementService = Depends(get_enforcement)
) -> EnforcementResult:
    """
    Dependency that checks all requirements for creating a user (seat limit).
    """
    result = await enforcement.check_can_create_user(current_user.tenant_id)
    
    if not result.allowed and result.enforcement_type == "HARD_STOP":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": "seat_limit_exceeded",
                "message": result.message,
                "limit_key": result.limit_key,
                "limit_value": result.limit_value,
                "consumed_value": result.consumed_value,
                "remaining": result.remaining,
                "enforcement_type": result.enforcement_type
            }
        )
    
    return result


def require_storage_for_upload(file_size_bytes: int):
    """
    Dependency factory for checking storage limits before file upload.
    
    Usage:
        @router.post("/upload")
        async def upload_file(
            file: UploadFile,
            _: None = Depends(require_storage_for_upload(file.size))
        ):
            ...
    """
    async def check_storage(
        current_user: User = Depends(get_current_user),
        enforcement: RuntimeEnforcementService = Depends(get_enforcement)
    ) -> EnforcementResult:
        result = await enforcement.check_storage_limit(current_user.tenant_id, file_size_bytes)
        
        if not result.allowed and result.enforcement_type == "HARD_STOP":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "error": "storage_limit_exceeded",
                    "message": result.message,
                    "limit_key": result.limit_key,
                    "limit_value": result.limit_value,
                    "consumed_value": result.consumed_value,
                    "remaining": result.remaining,
                    "enforcement_type": result.enforcement_type
                }
            )
        
        return result
    
    return check_storage


# =============================================================================
# AI CREDITS DEPENDENCIES
# =============================================================================

def require_ai_credits(credits: int = 1):
    """
    Dependency factory for checking AI credit availability.
    
    Usage:
        @router.post("/ai/generate")
        async def generate_ai_content(
            _: None = Depends(require_ai_credits(10))
        ):
            ...
    """
    async def check_credits(
        current_user: User = Depends(get_current_user),
        enforcement: RuntimeEnforcementService = Depends(get_enforcement)
    ) -> EnforcementResult:
        result = await enforcement.check_ai_credits(current_user.tenant_id, credits)
        
        if not result.allowed and result.enforcement_type == "HARD_STOP":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "error": "ai_credits_exceeded",
                    "message": result.message,
                    "limit_key": result.limit_key,
                    "limit_value": result.limit_value,
                    "consumed_value": result.consumed_value,
                    "remaining": result.remaining,
                    "enforcement_type": result.enforcement_type
                }
            )
        
        return result
    
    return check_credits


# =============================================================================
# USAGE TRACKING HELPERS
# =============================================================================

async def increment_object_usage(
    tenant_id: str,
    enforcement: RuntimeEnforcementService = None
) -> None:
    """Helper to increment custom object usage after creation"""
    if enforcement is None:
        enforcement = get_enforcement_service(db)
    await enforcement.increment_usage(tenant_id, "MAX_CUSTOM_OBJECTS", 1, enforce=False)


async def decrement_object_usage(
    tenant_id: str,
    enforcement: RuntimeEnforcementService = None
) -> None:
    """Helper to decrement custom object usage after deletion"""
    if enforcement is None:
        enforcement = get_enforcement_service(db)
    await enforcement.decrement_usage(tenant_id, "MAX_CUSTOM_OBJECTS", 1)


async def increment_field_usage(
    tenant_id: str,
    enforcement: RuntimeEnforcementService = None
) -> None:
    """Helper to increment custom field usage after creation"""
    if enforcement is None:
        enforcement = get_enforcement_service(db)
    await enforcement.increment_usage(tenant_id, "MAX_CUSTOM_FIELDS", 1, enforce=False)


async def decrement_field_usage(
    tenant_id: str,
    enforcement: RuntimeEnforcementService = None
) -> None:
    """Helper to decrement custom field usage after deletion"""
    if enforcement is None:
        enforcement = get_enforcement_service(db)
    await enforcement.decrement_usage(tenant_id, "MAX_CUSTOM_FIELDS", 1)


async def increment_flow_usage(
    tenant_id: str,
    enforcement: RuntimeEnforcementService = None
) -> None:
    """Helper to increment active flow usage after creation"""
    if enforcement is None:
        enforcement = get_enforcement_service(db)
    await enforcement.increment_usage(tenant_id, "MAX_ACTIVE_FLOWS", 1, enforce=False)


async def decrement_flow_usage(
    tenant_id: str,
    enforcement: RuntimeEnforcementService = None
) -> None:
    """Helper to decrement active flow usage after deactivation/deletion"""
    if enforcement is None:
        enforcement = get_enforcement_service(db)
    await enforcement.decrement_usage(tenant_id, "MAX_ACTIVE_FLOWS", 1)


async def increment_user_usage(
    tenant_id: str,
    enforcement: RuntimeEnforcementService = None
) -> None:
    """Helper to increment user count after creation"""
    if enforcement is None:
        enforcement = get_enforcement_service(db)
    await enforcement.increment_usage(tenant_id, "MAX_USERS", 1, enforce=False)


async def decrement_user_usage(
    tenant_id: str,
    enforcement: RuntimeEnforcementService = None
) -> None:
    """Helper to decrement user count after deletion"""
    if enforcement is None:
        enforcement = get_enforcement_service(db)
    await enforcement.decrement_usage(tenant_id, "MAX_USERS", 1)


async def consume_ai_credits(
    tenant_id: str,
    credits: int,
    enforcement: RuntimeEnforcementService = None
) -> None:
    """Helper to consume AI credits after successful AI operation"""
    if enforcement is None:
        enforcement = get_enforcement_service(db)
    await enforcement.consume_ai_credits(tenant_id, credits)


async def update_storage_usage(
    tenant_id: str,
    size_change_bytes: int,
    enforcement: RuntimeEnforcementService = None
) -> None:
    """Helper to update storage usage after file upload/delete"""
    if enforcement is None:
        enforcement = get_enforcement_service(db)
    await enforcement.update_storage_usage(tenant_id, size_change_bytes)


# =============================================================================
# ENTITLEMENT INFO ENDPOINT HELPERS
# =============================================================================

async def get_tenant_entitlements(
    current_user: User = Depends(get_current_user),
    enforcement: RuntimeEnforcementService = Depends(get_enforcement)
) -> dict:
    """
    Get complete entitlement information for the current tenant.
    Useful for frontend to display usage and limits.
    """
    tenant_id = current_user.tenant_id
    
    # Get subscription status
    subscription = await enforcement.check_subscription_status(tenant_id)
    
    # Get enabled modules
    modules = await enforcement.get_enabled_modules(tenant_id)
    
    # Get seat usage
    seats = await enforcement.get_seat_usage(tenant_id)
    
    return {
        "tenant_id": tenant_id,
        "subscription": {
            "status": "active" if subscription.allowed else "restricted",
            "enforcement_type": subscription.enforcement_type,
            "message": subscription.message
        },
        "modules": modules,
        "seats": seats
    }
