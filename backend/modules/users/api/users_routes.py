"""
Users Module API Routes
Core user management: invite, list, get, deactivate, activate, freeze, unfreeze.
Audit logs and user tab persistence.
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone, timedelta
import uuid
import logging
from pydantic import BaseModel

from config.database import db
from shared.models import User, Role
from modules.auth.api.auth_routes import get_current_user
from modules.users.models import UserResponse, InviteUserRequest
from modules.users.services import (
    log_audit_event,
    ROLE_SYSTEM_ADMIN,
    ROLE_STANDARD_USER
)
from modules.users.api.dependencies import require_admin
from services.token_service import generate_invitation_token
from services.email_service import send_invitation_email

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Users & Permissions"])


# Helper function for cache invalidation
async def _invalidate_user_permission_cache(tenant_id: str, user_id: str):
    """Invalidate permission cache for a user when their permissions change."""
    try:
        from modules.users.services.permission_cache import invalidate_user_permission_cache
        await invalidate_user_permission_cache(tenant_id, user_id)
    except Exception as e:
        logger.warning(f"Failed to invalidate permission cache: {str(e)}")


# ========================================
# USER MANAGEMENT ROUTES
# ========================================

@router.post("/users/invite")
async def invite_user(
    invite_request: InviteUserRequest,
    current_user: User = Depends(get_current_user)
):
    """Invite a new user to the tenant."""
    try:
        email = invite_request.email.lower()
        
        existing_user = await db.users.find_one({
            "email": email,
            "tenant_id": current_user.tenant_id
        })
        
        if existing_user:
            if existing_user.get("is_active", True):
                raise HTTPException(status_code=400, detail="User with this email already exists and is active.")
            raise HTTPException(status_code=400, detail="This user account is deactivated. Please activate the account first.")
        
        # ============================================
        # SEAT LIMIT ENFORCEMENT
        # Check if tenant has reached their user seat limit
        # ============================================
        tenant = await db.tenants.find_one({"id": current_user.tenant_id}, {"_id": 0})
        if not tenant:
            raise HTTPException(status_code=404, detail="Tenant not found")
        
        # Get seat limit (check multiple field names for backward compatibility)
        seat_limit = tenant.get("seat_limit") or tenant.get("max_users") or 10  # Default 10 if not set
        
        # Count current users (active and pending invitation)
        current_user_count = await db.users.count_documents({
            "tenant_id": current_user.tenant_id,
            "$or": [
                {"is_active": True},
                {"invitation_token": {"$exists": True, "$ne": None}}  # Pending invitations
            ]
        })
        
        if current_user_count >= seat_limit:
            logger.warning(f"Tenant {current_user.tenant_id} has reached seat limit ({current_user_count}/{seat_limit})")
            raise HTTPException(
                status_code=403,
                detail=f"Your organization has reached the maximum number of users ({seat_limit}). Please upgrade your plan or contact your administrator."
            )
        
        # Role is now OPTIONAL - users can exist without a role
        # Roles only control hierarchy visibility, not object permissions
        # Default to standard_user if no role specified
        role_id = invite_request.role_id or ROLE_STANDARD_USER
        
        # Validate role if provided
        if role_id:
            role = await db.roles.find_one({"id": role_id})
            if not role:
                raise HTTPException(status_code=400, detail="Invalid role specified")
        
        token, expires_at = generate_invitation_token()
        
        company_name = tenant.get("company_name") or tenant.get("tenant_name", "Your Company")
        
        new_user = {
            "id": str(uuid.uuid4()),
            "email": email,
            "first_name": invite_request.first_name,
            "last_name": invite_request.last_name,
            "tenant_id": current_user.tenant_id,
            "is_active": False,
            "invitation_token": token,
            "invitation_expires_at": expires_at,
            "invited_by": current_user.id,
            "invited_at": datetime.now(timezone.utc),
            "created_at": datetime.now(timezone.utc),
            "password_hash": None,
            "role_id": role_id
        }
        
        await db.users.insert_one(new_user)
        
        # ============================================
        # AUTO-ASSIGN LICENSES
        # Assign available tenant licenses to the invited user
        # This ensures they have module access upon login
        # ============================================
        try:
            tenant_licenses = await db.tenant_licenses.find(
                {"tenant_id": current_user.tenant_id, "status": "active"},
                {"_id": 0, "license_code": 1, "seats_purchased": 1}
            ).to_list(50)
            
            for tl in tenant_licenses:
                lc = tl.get("license_code")
                # Check how many seats are already assigned
                assigned_count = await db.user_licenses.count_documents({
                    "tenant_id": current_user.tenant_id,
                    "license_code": lc,
                    "status": "active"
                })
                max_seats = tl.get("seats_purchased", 0)
                if assigned_count < max_seats:
                    await db.user_licenses.insert_one({
                        "id": str(uuid.uuid4()),
                        "user_id": new_user["id"],
                        "tenant_id": current_user.tenant_id,
                        "license_code": lc,
                        "status": "active",
                        "assigned_at": datetime.now(timezone.utc),
                        "assigned_by": current_user.id,
                    })
                    logger.info(f"Auto-assigned {lc} to invited user {new_user['id']}")
        except Exception as e:
            logger.warning(f"License auto-assignment during invite: {e}")
        
        inviter_name = f"{current_user.first_name} {current_user.last_name}"

        # Determine if this is a DocFlow-only tenant
        module_entitlements = tenant.get("module_entitlements", [])
        is_docflow = (
            ("docflow" in module_entitlements and "crm" not in module_entitlements)
            or str(tenant.get("plan", "")).lower().startswith("docflow")
        )

        email_sent = send_invitation_email(
            email=email,
            first_name=invite_request.first_name,
            token=token,
            company_name=company_name,
            inviter_name=inviter_name,
            is_docflow=is_docflow
        )
        
        await log_audit_event(
            tenant_id=current_user.tenant_id,
            event_type="security",
            action="user_invited",
            actor_user_id=current_user.id,
            actor_email=current_user.email,
            target_email=email,
            details={"invited_user_name": f"{invite_request.first_name} {invite_request.last_name}", "role_id": role_id}
        )
        
        return {
            "message": f"Invitation sent successfully to {email}",
            "user_id": new_user["id"],
            "email_sent": email_sent,
            "role_id": role_id
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error inviting user: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to invite user: {str(e)}")


@router.get("/users", response_model=List[UserResponse])
async def list_users(
    search: Optional[str] = None,
    limit: int = 50,
    current_user: User = Depends(get_current_user)
):
    """List all users in the current tenant with optional search."""
    try:
        query = {"tenant_id": current_user.tenant_id}
        
        if search:
            search_lower = search.lower()
            query["$or"] = [
                {"first_name": {"$regex": search, "$options": "i"}},
                {"last_name": {"$regex": search, "$options": "i"}},
                {"email": {"$regex": search, "$options": "i"}},
            ]
        
        users = await db.users.find(
            query,
            {"_id": 0, "password_hash": 0, "password": 0, "invitation_token": 0, "reset_token": 0, "password_reset_token": 0, "password_reset_expires": 0}
        ).limit(limit).to_list(limit)
        
        for user in users:
            if user.get("role_id"):
                role = await db.roles.find_one({"id": user["role_id"]}, {"_id": 0})
                if role:
                    user["role_name"] = role["name"]
            
            first_name = user.get("first_name", "")
            last_name = user.get("last_name", "")
            user["display_value"] = f"{first_name} {last_name}".strip() or user.get("email", "Unknown")
            user["name"] = user["display_value"]
            
            # Compute account_status
            if user.get("is_frozen"):
                user["account_status"] = "frozen"
            elif user.get("is_active") is False:
                user["account_status"] = "pending_verification"
            elif user.get("must_change_password"):
                user["account_status"] = "pending_invite"
            elif not user.get("last_login"):
                user["account_status"] = "pending_invite"
            else:
                user["account_status"] = "active"
        
        return users
        
    except Exception as e:
        logger.error(f"Error listing users: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch users")


@router.get("/users/{user_id}")
async def get_user_by_id(user_id: str, current_user: User = Depends(get_current_user)):
    """Get a single user by ID. Used for displaying user names in audit fields."""
    try:
        user = await db.users.find_one(
            {"id": user_id, "tenant_id": current_user.tenant_id},
            {"_id": 0, "password_hash": 0, "password": 0}
        )
        
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        if user.get("role_id"):
            role = await db.roles.find_one({"id": user["role_id"]}, {"_id": 0})
            if role:
                user["role_name"] = role["name"]
        
        # Compute account_status for frontend display
        if user.get("is_frozen"):
            user["account_status"] = "frozen"
        elif user.get("is_active") is False:
            user["account_status"] = "pending_verification"
        elif user.get("must_change_password"):
            user["account_status"] = "pending_invite"
        elif not user.get("last_login"):
            user["account_status"] = "pending_invite"
        else:
            user["account_status"] = "active"
        
        return user
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching user {user_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch user")


@router.post("/users/{user_id}/deactivate")
async def deactivate_user(user_id: str, current_user: User = Depends(get_current_user)):
    """Deactivate a user (soft delete)."""
    try:
        if user_id == current_user.id:
            raise HTTPException(status_code=400, detail="You cannot deactivate your own account.")
        
        user_to_deactivate = await db.users.find_one({"id": user_id, "tenant_id": current_user.tenant_id})
        
        if not user_to_deactivate:
            raise HTTPException(status_code=404, detail="User not found")
        
        if not user_to_deactivate.get("is_active", True):
            raise HTTPException(status_code=400, detail="User is already deactivated")
        
        active_count = await db.users.count_documents({"tenant_id": current_user.tenant_id, "is_active": True})
        
        if active_count <= 1:
            raise HTTPException(status_code=400, detail="Cannot deactivate the last active user in the organization.")
        
        await db.users.update_one(
            {"id": user_id},
            {"$set": {"is_active": False, "deactivated_at": datetime.now(timezone.utc), "deactivated_by": current_user.id}}
        )
        
        await log_audit_event(
            tenant_id=current_user.tenant_id,
            event_type="security",
            action="user_deactivated",
            actor_user_id=current_user.id,
            actor_email=current_user.email,
            target_user_id=user_id,
            target_email=user_to_deactivate["email"]
        )
        
        return {"message": f"User {user_to_deactivate['email']} has been deactivated successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deactivating user: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to deactivate user")


@router.post("/users/{user_id}/activate")
async def activate_user(user_id: str, current_user: User = Depends(get_current_user)):
    """Reactivate a deactivated user."""
    try:
        user_to_activate = await db.users.find_one({"id": user_id, "tenant_id": current_user.tenant_id})
        
        if not user_to_activate:
            raise HTTPException(status_code=404, detail="User not found")
        
        if user_to_activate.get("is_active", True):
            raise HTTPException(status_code=400, detail="User is already active")
        
        await db.users.update_one(
            {"id": user_id},
            {"$set": {"is_active": True}, "$unset": {"deactivated_at": "", "deactivated_by": ""}}
        )
        
        return {"message": f"User {user_to_activate['email']} has been activated successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error activating user: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to activate user")


@router.post("/users/{user_id}/freeze")
async def freeze_user(user_id: str, freeze_data: Dict[str, Any], current_user: User = Depends(get_current_user)):
    """Freeze a user temporarily."""
    try:
        if user_id == current_user.id:
            raise HTTPException(status_code=400, detail="You cannot freeze your own account.")
        
        user_to_freeze = await db.users.find_one({"id": user_id, "tenant_id": current_user.tenant_id})
        
        if not user_to_freeze:
            raise HTTPException(status_code=404, detail="User not found")
        
        if user_to_freeze.get("is_frozen", False):
            raise HTTPException(status_code=400, detail="User is already frozen")
        
        frozen_until_str = freeze_data.get("frozen_until")
        freeze_reason = freeze_data.get("reason", "Temporary suspension")
        
        frozen_until = None
        if frozen_until_str:
            try:
                frozen_until = datetime.fromisoformat(frozen_until_str.replace('Z', '+00:00'))
            except:
                raise HTTPException(status_code=400, detail="Invalid frozen_until datetime format")
        
        update_data = {
            "is_frozen": True,
            "frozen_at": datetime.now(timezone.utc),
            "frozen_by": current_user.id,
            "freeze_reason": freeze_reason
        }
        
        if frozen_until:
            update_data["frozen_until"] = frozen_until
        
        await db.users.update_one({"id": user_id}, {"$set": update_data})
        
        freeze_msg = f"User {user_to_freeze['email']} has been frozen"
        if frozen_until:
            freeze_msg += f" until {frozen_until.strftime('%Y-%m-%d %H:%M UTC')}"
        
        return {"message": freeze_msg}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error freezing user: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to freeze user")


@router.post("/users/{user_id}/unfreeze")
async def unfreeze_user(user_id: str, current_user: User = Depends(get_current_user)):
    """Unfreeze a frozen user."""
    try:
        user_to_unfreeze = await db.users.find_one({"id": user_id, "tenant_id": current_user.tenant_id})
        
        if not user_to_unfreeze:
            raise HTTPException(status_code=404, detail="User not found")
        
        if not user_to_unfreeze.get("is_frozen", False):
            raise HTTPException(status_code=400, detail="User is not frozen")
        
        await db.users.update_one(
            {"id": user_id},
            {"$set": {"is_frozen": False}, "$unset": {"frozen_until": "", "frozen_at": "", "frozen_by": "", "freeze_reason": ""}}
        )
        
        return {"message": f"User {user_to_unfreeze['email']} has been unfrozen successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error unfreezing user: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to unfreeze user")


# ========================================
# SUPER ADMIN MANAGEMENT
# ========================================

class SuperAdminRequest(BaseModel):
    """Request model for super admin toggle"""
    is_super_admin: bool


@router.put("/users/{user_id}/super-admin")
async def set_super_admin(
    user_id: str, 
    request: SuperAdminRequest, 
    current_user: User = Depends(get_current_user)
):
    """
    Grant or revoke Super Admin privileges for a user.
    
    Super Admins bypass ALL permission checks and sharing rules.
    Only existing Super Admins can grant/revoke this privilege.
    
    Security considerations:
    - Requires the current user to be a Super Admin
    - Cannot remove your own Super Admin status
    - Audit logged for compliance
    """
    try:
        # Check if current user is a super admin
        current_user_doc = await db.users.find_one({
            "id": current_user.id,
            "tenant_id": current_user.tenant_id
        }, {"_id": 0})
        
        if not current_user_doc or not current_user_doc.get("is_super_admin", False):
            raise HTTPException(
                status_code=403, 
                detail="Only Super Admins can grant or revoke Super Admin privileges"
            )
        
        # Prevent removing your own super admin status
        if user_id == current_user.id and not request.is_super_admin:
            raise HTTPException(
                status_code=400, 
                detail="You cannot remove your own Super Admin privileges"
            )
        
        # Find target user
        target_user = await db.users.find_one({
            "id": user_id,
            "tenant_id": current_user.tenant_id
        }, {"_id": 0})
        
        if not target_user:
            raise HTTPException(status_code=404, detail="User not found")
        
        # Ensure at least one super admin remains
        if not request.is_super_admin:
            super_admin_count = await db.users.count_documents({
                "tenant_id": current_user.tenant_id,
                "is_super_admin": True,
                "is_active": True
            })
            
            if super_admin_count <= 1:
                raise HTTPException(
                    status_code=400, 
                    detail="Cannot remove the last Super Admin. At least one Super Admin must exist."
                )
        
        # Update super admin status
        await db.users.update_one(
            {"id": user_id},
            {"$set": {
                "is_super_admin": request.is_super_admin,
                "updated_at": datetime.now(timezone.utc)
            }}
        )
        
        # Invalidate permission cache (immediate effect)
        await _invalidate_user_permission_cache(current_user.tenant_id, user_id)
        
        # Audit log
        action = "super_admin_granted" if request.is_super_admin else "super_admin_revoked"
        await log_audit_event(
            tenant_id=current_user.tenant_id,
            event_type="security",
            action=action,
            actor_user_id=current_user.id,
            actor_email=current_user.email,
            target_user_id=user_id,
            target_email=target_user["email"],
            details={"is_super_admin": request.is_super_admin}
        )
        
        status_text = "granted" if request.is_super_admin else "revoked"
        return {
            "message": f"Super Admin privileges {status_text} for {target_user['email']}",
            "user_id": user_id,
            "is_super_admin": request.is_super_admin
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error setting super admin: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to update Super Admin status")


@router.get("/users/{user_id}/super-admin")
async def get_super_admin_status(user_id: str, current_user: User = Depends(get_current_user)):
    """Get Super Admin status for a user."""
    try:
        user = await db.users.find_one({
            "id": user_id,
            "tenant_id": current_user.tenant_id
        }, {"_id": 0, "id": 1, "email": 1, "is_super_admin": 1})
        
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        return {
            "user_id": user["id"],
            "email": user["email"],
            "is_super_admin": user.get("is_super_admin", False)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting super admin status: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to get Super Admin status")


@router.put("/users/{user_id}/role")
async def assign_user_role(
    user_id: str, 
    role_data: Dict[str, str], 
    current_user: User = Depends(require_admin)
):
    """
    Assign role to a user (Admin only).
    Invalidates permission cache immediately.
    """
    try:
        role_id = role_data.get("role_id")
        if not role_id:
            raise HTTPException(status_code=400, detail="role_id is required")
        
        # Verify user exists in tenant
        user = await db.users.find_one({
            "id": user_id,
            "tenant_id": current_user.tenant_id
        }, {"_id": 0})
        
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        # Verify role exists
        role = await db.roles.find_one({"id": role_id}, {"_id": 0})
        if not role:
            raise HTTPException(status_code=404, detail="Role not found")
        
        # Update user's role
        await db.users.update_one(
            {"id": user_id},
            {"$set": {
                "role_id": role_id,
                "role_name": role.get("name"),
                "updated_at": datetime.now(timezone.utc)
            }}
        )
        
        # Invalidate permission cache (immediate effect)
        await _invalidate_user_permission_cache(current_user.tenant_id, user_id)
        
        # Audit log
        await log_audit_event(
            tenant_id=current_user.tenant_id,
            event_type="security",
            action="user_role_changed",
            actor_user_id=current_user.id,
            actor_email=current_user.email,
            target_user_id=user_id,
            target_email=user.get("email"),
            details={
                "old_role_id": user.get("role_id"),
                "new_role_id": role_id,
                "new_role_name": role.get("name")
            }
        )
        
        return {
            "message": f"Role '{role.get('name')}' assigned to user successfully",
            "user_id": user_id,
            "role_id": role_id,
            "role_name": role.get("name")
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error assigning role: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to assign role")


# ========================================
# AUDIT LOGS ROUTES
# ========================================

@router.get("/audit-logs")
async def get_audit_logs(
    event_type: Optional[str] = None,
    action: Optional[str] = None,
    limit: int = 100,
    current_user: User = Depends(get_current_user)
):
    """Get audit logs for current tenant."""
    try:
        query = {"tenant_id": current_user.tenant_id}
        
        if event_type:
            query["event_type"] = event_type
        if action:
            query["action"] = action
        
        audit_events = await db.audit_events.find(query, {"_id": 0}).sort("timestamp", -1).limit(limit).to_list(limit)
        
        return {"total": len(audit_events), "events": audit_events}
        
    except Exception as e:
        logger.error(f"Error fetching audit logs: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch audit logs")


@router.get("/audit-logs/stats")
async def get_audit_stats(current_user: User = Depends(get_current_user)):
    """Get audit log statistics."""
    try:
        security_count = await db.audit_events.count_documents({"tenant_id": current_user.tenant_id, "event_type": "security"})
        data_count = await db.audit_events.count_documents({"tenant_id": current_user.tenant_id, "event_type": "data"})
        
        yesterday = datetime.now(timezone.utc) - timedelta(days=1)
        recent_count = await db.audit_events.count_documents({"tenant_id": current_user.tenant_id, "timestamp": {"$gte": yesterday}})
        
        return {
            "total_events": security_count + data_count,
            "security_events": security_count,
            "data_events": data_count,
            "last_24h": recent_count
        }
        
    except Exception as e:
        logger.error(f"Error fetching audit stats: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch audit statistics")


# ========================================
# USER TABS (Console Tab Persistence)
# ========================================

class UserTabsUpdate(BaseModel):
    """Schema for updating user's active tabs"""
    tabs: List[Dict[str, Any]]
    active_tab_id: Optional[str] = None


@router.get("/user/tabs")
async def get_user_tabs(current_user: User = Depends(get_current_user)):
    """
    Get the user's persisted console tabs.
    Returns tabs stored in the database for cross-browser/cross-device access.
    """
    try:
        user_tabs = await db.user_tabs.find_one(
            {"user_id": current_user.id},
            {"_id": 0}
        )
        
        if not user_tabs:
            return {
                "user_id": current_user.id,
                "tabs": [],
                "active_tab_id": None,
                "last_updated": None
            }
        
        return user_tabs
        
    except Exception as e:
        logger.error(f"Error fetching user tabs: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch user tabs")


@router.put("/user/tabs")
async def save_user_tabs(
    tabs_data: UserTabsUpdate,
    current_user: User = Depends(get_current_user)
):
    """
    Save the user's console tabs to the database.
    This is the primary storage for cross-browser/cross-device tab persistence.
    """
    try:
        now = datetime.now(timezone.utc).isoformat()
        
        result = await db.user_tabs.update_one(
            {"user_id": current_user.id},
            {
                "$set": {
                    "user_id": current_user.id,
                    "tenant_id": current_user.tenant_id,
                    "tabs": tabs_data.tabs,
                    "active_tab_id": tabs_data.active_tab_id,
                    "last_updated": now
                }
            },
            upsert=True
        )
        
        logger.debug(f"Saved {len(tabs_data.tabs)} tabs for user {current_user.id}")
        
        return {
            "message": "Tabs saved successfully",
            "tabs_count": len(tabs_data.tabs),
            "active_tab_id": tabs_data.active_tab_id,
            "last_updated": now
        }
        
    except Exception as e:
        logger.error(f"Error saving user tabs: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to save user tabs")


@router.delete("/user/tabs")
async def clear_user_tabs(current_user: User = Depends(get_current_user)):
    """
    Clear all saved tabs for the current user.
    Can be used on logout or when user wants to reset their workspace.
    """
    try:
        result = await db.user_tabs.delete_one({"user_id": current_user.id})
        
        return {
            "message": "Tabs cleared successfully",
            "deleted": result.deleted_count > 0
        }
        
    except Exception as e:
        logger.error(f"Error clearing user tabs: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to clear user tabs")
