"""
Auth Module API Routes
Authentication and authorization endpoints.
Extracted from server.py as part of PR-1 refactoring.
"""
from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from datetime import datetime, timezone
from typing import Dict, Any
import uuid
import logging
import jwt

from config.settings import settings
from config.database import db
from shared.models import (
    User, Tenant, Token, TenantObject,
    UserCreate, UserLogin
)
# Import auth functions from canonical location (SSOT)
from shared.auth import (
    verify_password,
    get_password_hash,
    create_access_token,
    get_current_user  # Use canonical auth function
)
from shared.database import prepare_for_mongo, parse_from_mongo
from modules.auth.models.auth_models import (
    AcceptInviteRequest,
    ForgotPasswordRequest,
    ResetPasswordRequest
)
from services.token_service import generate_reset_token, validate_token
from services.email_service import send_reset_password_email

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["Authentication"])

# Security setup
security = HTTPBearer()

# Industry Templates (imported from server.py constants)
# This will be accessed from server.py until we move to a shared config
INDUSTRY_TEMPLATES = None  # Will be set during router registration


def set_industry_templates(templates: Dict[str, Any]):
    """Set industry templates from server.py"""
    global INDUSTRY_TEMPLATES
    INDUSTRY_TEMPLATES = templates


async def log_audit_event(
    tenant_id: str,
    event_type: str,
    action: str,
    actor_user_id: str = None,
    actor_email: str = None,
    target_user_id: str = None,
    target_email: str = None,
    object_name: str = None,
    record_id: str = None,
    details: Dict[str, Any] = None,
    ip_address: str = None
):
    """Log audit event to database (non-blocking)"""
    try:
        audit_event = {
            "id": str(uuid.uuid4()),
            "tenant_id": tenant_id,
            "event_type": event_type,
            "action": action,
            "actor_user_id": actor_user_id,
            "actor_email": actor_email,
            "target_user_id": target_user_id,
            "target_email": target_email,
            "object_name": object_name,
            "record_id": record_id,
            "details": details,
            "ip_address": ip_address,
            "timestamp": datetime.now(timezone.utc)
        }
        await db.audit_events.insert_one(audit_event)
    except Exception as e:
        logger.warning(f"Failed to log audit event: {str(e)}")


@router.post("/register", response_model=Token)
async def register_user(user_data: UserCreate):
    """
    Register a new user and create their tenant.
    
    Uses the shared TenantProvisioningService to ensure consistent provisioning
    regardless of whether tenant is created via CRM signup or Admin Portal.
    
    Provisioning Flow (via TenantProvisioningService):
    1. Create tenant
    2. Create user
    3. Provision BASE CRM objects (Lead, Account, Contact, Opportunity, Task, Event, EmailMessage)
    4. Extend with industry-specific objects (if any)
    5. Seed standard Lightning layouts
    6. Seed default Sales Console app
    7. Create default roles and permissions
    8. Create tenant settings
    """
    # Import templates for validation
    from shared.constants.industry_templates import INDUSTRY_TEMPLATES as industry_templates
    
    # Check if user already exists
    existing_user = await db.users.find_one({"email": user_data.email})
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Validate industry
    if user_data.industry not in industry_templates:
        raise HTTPException(status_code=400, detail="Invalid industry selection")
    
    # Create tenant
    tenant = Tenant(
        company_name=user_data.company_name,
        industry=user_data.industry
    )
    tenant_doc = prepare_for_mongo(tenant.model_dump())
    await db.tenants.insert_one(tenant_doc)
    
    # Create user with System Administrator role by default
    # First user is also Super Admin (full access bypass)
    hashed_password = get_password_hash(user_data.password)
    user = User(
        email=user_data.email,
        first_name=user_data.first_name,
        last_name=user_data.last_name,
        tenant_id=tenant.id,
        role_id="system_administrator",  # Default to System Admin role
        is_super_admin=True  # First user in tenant is Super Admin
    )
    
    user_doc = prepare_for_mongo(user.model_dump())
    user_doc['password'] = hashed_password
    user_doc['role_name'] = "System Administrator"  # Also store role name for display
    await db.users.insert_one(user_doc)
    
    # ============================================
    # Provision tenant using shared service
    # This ensures consistency with Admin Portal tenant creation
    # ============================================
    try:
        from shared.services.tenant_provisioning_service import TenantProvisioningService
        
        provisioning_service = TenantProvisioningService(db)
        provisioning_result = await provisioning_service.provision_tenant(
            tenant_id=tenant.id,
            user_id=user.id,
            industry=user_data.industry,
            skip_if_exists=False  # Always provision for new tenants
        )
        
        logger.info(f"Tenant {tenant.id} provisioned via shared service: {provisioning_result}")
        
    except Exception as e:
        logger.error(f"Failed to provision tenant {tenant.id} via shared service: {e}")
        # Continue with signup even if provisioning fails
        # User can still access the CRM, objects will be created on first use
    
    # Create access token
    access_token = create_access_token({
        "user_id": user.id,
        "tenant_id": tenant.id
    })
    
    return Token(
        access_token=access_token,
        token_type="bearer",
        user=user,
        tenant=tenant
    )


@router.post("/login", response_model=Token)
async def login_user(login_data: UserLogin):
    """Login a user and return JWT token"""
    # Find user
    user_doc = await db.users.find_one({"email": login_data.email})
    if not user_doc or not verify_password(login_data.password, user_doc.get('password_hash') or user_doc.get('password', '')):
        # Audit failed login attempt
        await log_audit_event(
            tenant_id="system",
            event_type="security",
            action="login_failed",
            actor_email=login_data.email,
            details={"reason": "Invalid credentials"}
        )
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    
    # Check if user is active
    if not user_doc.get("is_active", True):
        raise HTTPException(
            status_code=401,
            detail="Your account has been deactivated. Please contact your administrator."
        )
    
    # Get tenant
    tenant_doc = await db.tenants.find_one({"id": user_doc['tenant_id']}, {"_id": 0})
    if not tenant_doc:
        raise HTTPException(status_code=404, detail="Tenant not found")
    
    # ============================================
    # TENANT LIFECYCLE ENFORCEMENT
    # Block login for users of suspended/deleted tenants
    # ============================================
    tenant_status = tenant_doc.get("status", "active")
    if tenant_status == "suspended":
        # Log the blocked login attempt
        await log_audit_event(
            tenant_id=user_doc["tenant_id"],
            event_type="security",
            action="login_blocked",
            actor_user_id=user_doc["id"],
            actor_email=user_doc["email"],
            details={
                "reason": "Tenant suspended",
                "suspended_reason": tenant_doc.get("suspended_reason"),
                "suspended_at": str(tenant_doc.get("suspended_at"))
            }
        )
        raise HTTPException(
            status_code=403,
            detail="Your organization's account has been suspended. Please contact support for assistance."
        )
    
    if tenant_status == "deleted" or tenant_doc.get("is_deleted", False):
        await log_audit_event(
            tenant_id=user_doc["tenant_id"],
            event_type="security",
            action="login_blocked",
            actor_user_id=user_doc["id"],
            actor_email=user_doc["email"],
            details={"reason": "Tenant deleted"}
        )
        raise HTTPException(
            status_code=403,
            detail="Your organization's account has been terminated. Please contact support for assistance."
        )
    
    # Update last_login timestamp
    await db.users.update_one(
        {"id": user_doc["id"]},
        {"$set": {"last_login": datetime.now(timezone.utc)}}
    )
    
    # Audit successful login
    await log_audit_event(
        tenant_id=user_doc["tenant_id"],
        event_type="security",
        action="login_success",
        actor_user_id=user_doc["id"],
        actor_email=user_doc["email"],
        details={
            "user_name": f"{user_doc.get('first_name', '')} {user_doc.get('last_name', '')}",
            "role_id": user_doc.get("role_id")
        }
    )
    
    user = User(**parse_from_mongo({k: v for k, v in user_doc.items() if k != 'password'}))
    tenant = Tenant(**parse_from_mongo(tenant_doc))
    
    # Determine the default landing page from tenant settings
    default_landing_page = '/crm-platform'
    try:
        tenant_settings = await db.tenant_settings.find_one(
            {"tenant_id": user_doc['tenant_id']}, {"_id": 0}
        )
        if tenant_settings and tenant_settings.get("default_landing_page"):
            default_landing_page = tenant_settings["default_landing_page"]
        
        # Auto-detect DocFlow-only: if CRM is not in module_entitlements, use /setup
        module_entitlements = tenant_doc.get("module_entitlements", [])
        if module_entitlements and "crm" not in module_entitlements:
            default_landing_page = "/setup"
    except Exception:
        pass
    
    # Create access token
    access_token = create_access_token({
        "user_id": user.id,
        "tenant_id": tenant.id
    })
    
    return Token(
        access_token=access_token,
        token_type="bearer",
        user=user,
        tenant=tenant,
        default_landing_page=default_landing_page
    )


@router.post("/accept-invite")
async def accept_invitation(accept_request: AcceptInviteRequest):
    """Accept invitation and set password"""
    try:
        # Find user by invitation token
        user = await db.users.find_one({
            "invitation_token": accept_request.token
        })
        
        if not user:
            raise HTTPException(
                status_code=400,
                detail="Invalid invitation token"
            )
        
        # Validate token
        is_valid, error_msg = validate_token(
            accept_request.token,
            user.get("invitation_expires_at")
        )
        
        if not is_valid:
            raise HTTPException(status_code=400, detail=error_msg)
        
        # Hash password and activate user
        password_hash = get_password_hash(accept_request.password)
        
        await db.users.update_one(
            {"id": user["id"]},
            {
                "$set": {
                    "password_hash": password_hash,
                    "is_active": True,
                    "last_login": datetime.now(timezone.utc),
                    "must_change_password": False,
                },
                "$unset": {
                    "invitation_token": "",
                    "invitation_expires_at": ""
                }
            }
        )
        
        # ============================================
        # AUTO-ASSIGN LICENSES (safety net)
        # Ensure user has licenses — covers cases where
        # invite flow didn't assign or user was created before fix
        # ============================================
        try:
            tenant_licenses = await db.tenant_licenses.find(
                {"tenant_id": user["tenant_id"], "status": "active"},
                {"_id": 0, "license_code": 1, "seats_purchased": 1}
            ).to_list(50)
            
            for tl in tenant_licenses:
                lc = tl.get("license_code")
                # Check if user already has this license
                existing = await db.user_licenses.find_one({
                    "user_id": user["id"],
                    "tenant_id": user["tenant_id"],
                    "license_code": lc,
                    "status": "active"
                })
                if existing:
                    continue
                
                # Check seat availability
                assigned_count = await db.user_licenses.count_documents({
                    "tenant_id": user["tenant_id"],
                    "license_code": lc,
                    "status": "active"
                })
                max_seats = tl.get("seats_purchased", 0)
                if assigned_count < max_seats:
                    await db.user_licenses.insert_one({
                        "id": str(uuid.uuid4()),
                        "user_id": user["id"],
                        "tenant_id": user["tenant_id"],
                        "license_code": lc,
                        "status": "active",
                        "assigned_at": datetime.now(timezone.utc),
                        "assigned_by": "system_invite_accept",
                    })
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(f"License auto-assignment on invite accept: {e}")
        
        # Create access token for auto-login
        access_token = create_access_token({
            "user_id": user["id"],
            "tenant_id": user["tenant_id"]
        })
        
        # Get tenant info
        tenant = await db.tenants.find_one({"id": user["tenant_id"]}, {"_id": 0})
        
        return {
            "message": "Invitation accepted successfully",
            "access_token": access_token,
            "token_type": "bearer",
            "user": {
                "id": user["id"],
                "email": user["email"],
                "first_name": user["first_name"],
                "last_name": user["last_name"],
                "tenant_id": user["tenant_id"]
            },
            "tenant": tenant
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error accepting invitation: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to accept invitation: {str(e)}")


@router.post("/forgot-password")
async def forgot_password(request: ForgotPasswordRequest):
    """Request password reset"""
    try:
        email = request.email.lower()
        
        # Find user by email
        user = await db.users.find_one({"email": email})
        
        # For security, always return success even if user not found
        if not user:
            return {
                "message": "If an account exists with this email, a password reset link has been sent."
            }
        
        # Check if user is active (allow inactive users who have never set password)
        # Tenant admins are created with is_active=False and need password reset to activate
        has_set_password = user.get("password_hash") or (user.get("password") and user.get("password") != "!VERIFICATION_PENDING")
        if not user.get("is_active", True) and has_set_password:
            return {
                "message": "If an account exists with this email, a password reset link has been sent."
            }
        
        # Generate reset token
        token, expires_at = generate_reset_token()
        
        # Store reset token
        await db.users.update_one(
            {"id": user["id"]},
            {
                "$set": {
                    "reset_token": token,
                    "reset_token_expires_at": expires_at
                }
            }
        )
        
        # Get tenant info
        tenant = await db.tenants.find_one({"id": user["tenant_id"]}, {"_id": 0})
        company_name = tenant.get("company_name", "Your Company") if tenant else "Your Company"
        
        # Send reset email
        send_reset_password_email(
            email=email,
            first_name=user["first_name"],
            token=token,
            company_name=company_name
        )
        
        return {
            "message": "If an account exists with this email, a password reset link has been sent."
        }
        
    except Exception as e:
        logger.error(f"Error in forgot password: {str(e)}")
        # Always return success for security
        return {
            "message": "If an account exists with this email, a password reset link has been sent."
        }


@router.post("/reset-password")
async def reset_password(request: ResetPasswordRequest):
    """Reset password using token"""
    try:
        # Find user by reset token - check both field names for compatibility
        user = await db.users.find_one({
            "$or": [
                {"reset_token": request.token},
                {"password_reset_token": request.token}
            ]
        })
        
        if not user:
            raise HTTPException(
                status_code=400,
                detail="Invalid or expired reset token"
            )
        
        # Get expiry - check both field names for compatibility
        token_expires = user.get("reset_token_expires_at") or user.get("password_reset_expires")
        
        # Validate token
        is_valid, error_msg = validate_token(
            request.token,
            token_expires
        )
        
        if not is_valid:
            raise HTTPException(
                status_code=400,
                detail="This password reset link has expired. Please request a new one."
            )
        
        # Hash new password
        password_hash = get_password_hash(request.new_password)
        
        # Update password and clear reset token (both field names)
        await db.users.update_one(
            {"id": user["id"]},
            {
                "$set": {
                    "password_hash": password_hash,
                    "must_change_password": False,
                    "is_active": True
                },
                "$unset": {
                    "reset_token": "",
                    "reset_token_expires_at": "",
                    "password_reset_token": "",
                    "password_reset_expires": ""
                }
            }
        )
        
        # ============================================
        # AUTO-ASSIGN LICENSES (for new tenant admins)
        # When admin sets password via email link, ensure licenses are assigned
        # ============================================
        try:
            tenant_id = user.get("tenant_id")
            if tenant_id:
                tenant_licenses = await db.tenant_licenses.find(
                    {"tenant_id": tenant_id, "status": "active"},
                    {"_id": 0, "license_code": 1, "seats_purchased": 1}
                ).to_list(50)
                
                for tl in tenant_licenses:
                    lc = tl.get("license_code")
                    existing = await db.user_licenses.find_one({
                        "user_id": user["id"],
                        "tenant_id": tenant_id,
                        "license_code": lc,
                        "status": "active"
                    })
                    if existing:
                        continue
                    assigned_count = await db.user_licenses.count_documents({
                        "tenant_id": tenant_id,
                        "license_code": lc,
                        "status": "active"
                    })
                    if assigned_count < tl.get("seats_purchased", 0):
                        await db.user_licenses.insert_one({
                            "id": str(uuid.uuid4()),
                            "user_id": user["id"],
                            "tenant_id": tenant_id,
                            "license_code": lc,
                            "status": "active",
                            "assigned_at": datetime.now(timezone.utc),
                            "assigned_by": "system_password_reset",
                        })
        except Exception as e:
            logger.warning(f"License auto-assign on password reset: {e}")
        
        return {
            "message": "Password reset successfully. You can now login with your new password."
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error resetting password: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to reset password")


@router.get("/verify-reset-token/{token}")
async def verify_reset_token(token: str):
    """Verify if a reset token is valid (for frontend pre-check)"""
    try:
        # Check both field names for compatibility
        user = await db.users.find_one({
            "$or": [
                {"reset_token": token},
                {"password_reset_token": token}
            ]
        })
        
        if not user:
            return {"valid": False, "message": "Invalid token"}
        
        # Get expiry - check both field names
        token_expires = user.get("reset_token_expires_at") or user.get("password_reset_expires")
        
        is_valid, error_msg = validate_token(token, token_expires)
        
        return {
            "valid": is_valid,
            "message": error_msg if not is_valid else "Token is valid",
            "email": user["email"] if is_valid else None
        }
        
    except Exception as e:
        logger.error(f"Error verifying reset token: {str(e)}")
        return {"valid": False, "message": "Error validating token"}


# Re-export get_current_user for use in other modules
__all__ = ['router', 'get_current_user', 'log_audit_event']
