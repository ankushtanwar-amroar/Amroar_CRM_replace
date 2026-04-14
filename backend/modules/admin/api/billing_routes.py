"""
Stripe Billing API Routes
Handles checkout sessions, webhooks, and billing operations.
"""
from fastapi import APIRouter, Depends, HTTPException, Request, Body
from typing import Optional, Dict, Any
import logging

from config.database import db
from shared.auth import get_current_user
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/billing", tags=["Billing"])
admin_router = APIRouter(prefix="/admin/billing", tags=["Admin Billing"])


# Import admin auth - try multiple paths for compatibility
try:
    from modules.admin.api.admin_routes import require_admin_auth
except ImportError:
    # Fallback - create a simple admin auth check
    from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
    import jwt
    import os
    
    security = HTTPBearer()
    JWT_SECRET = os.environ.get("JWT_SECRET", "your-secret-key")
    
    async def require_admin_auth(credentials: HTTPAuthorizationCredentials = Depends(security)):
        try:
            payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=["HS256"])
            if payload.get("is_platform_admin"):
                return payload
            raise HTTPException(403, "Admin access required")
        except jwt.ExpiredSignatureError:
            raise HTTPException(401, "Token expired")
        except Exception:
            raise HTTPException(401, "Invalid token")

# Import billing service
from modules.admin.services.stripe_billing_service import (
    get_stripe_billing_service,
    SEAT_PRICING,
    PLAN_PRICING
)


# ============================================================================
# REQUEST/RESPONSE MODELS
# ============================================================================

class SubscriptionCheckoutRequest(BaseModel):
    """Request to create subscription checkout"""
    plan: str = Field(..., description="Plan type: starter, professional, enterprise")
    billing_cycle: str = Field("monthly", description="monthly or yearly")
    origin_url: str = Field(..., description="Frontend origin URL for redirects")


class SeatPurchaseRequest(BaseModel):
    """Request to purchase additional seats"""
    license_code: str = Field(..., description="License type to purchase")
    quantity: int = Field(..., ge=1, description="Number of seats")
    origin_url: str = Field(..., description="Frontend origin URL for redirects")


class CheckoutStatusRequest(BaseModel):
    """Request to check checkout status"""
    session_id: str


# ============================================================================
# CRM BILLING ROUTES (Tenant Admin)
# ============================================================================

@router.get("/summary")
async def get_billing_summary(current_user = Depends(get_current_user)):
    """Get billing summary for the current tenant"""
    service = get_stripe_billing_service(db)
    return await service.get_billing_summary(current_user.tenant_id)


@router.get("/pricing")
async def get_pricing():
    """Get pricing information"""
    return {
        "plans": PLAN_PRICING,
        "seats": {
            code: {
                "monthly": pricing["monthly"],
                "yearly": pricing["yearly"]
            }
            for code, pricing in SEAT_PRICING.items()
        }
    }


@router.get("/plans")
async def get_billing_plans(current_user = Depends(get_current_user)):
    """
    Get all active plans from the database for the billing page.
    Returns plan details including modules, pricing, seat limits, etc.
    """
    plans = await db.plans.find(
        {"is_active": True},
        {"_id": 0}
    ).to_list(50)
    
    # Sort by seat_limit to get a natural ordering (free < starter < pro < enterprise)
    plans.sort(key=lambda p: p.get("seat_limit", 0))
    
    # Enrich with pricing — prefer DB fields, fallback to PLAN_PRICING
    enriched = []
    for plan in plans:
        api_name = plan.get("api_name", "")
        pricing_fallback = PLAN_PRICING.get(api_name, {})
        enriched.append({
            "api_name": api_name,
            "name": plan.get("name", api_name.replace("_", " ").title()),
            "enabled_modules": plan.get("enabled_modules", []),
            "seat_limit": plan.get("seat_limit", 5),
            "storage_limit_mb": plan.get("storage_limit_mb", 512),
            "included_licenses": plan.get("included_licenses", []),
            "base_monthly": plan.get("base_monthly", pricing_fallback.get("base_monthly", 0)),
            "base_yearly": plan.get("base_yearly", pricing_fallback.get("base_yearly", 0)),
            "description": plan.get("description", ""),
            "is_active": plan.get("is_active", True),
        })
    
    return {"plans": enriched}


@router.post("/checkout/subscription")
async def create_subscription_checkout(
    request: SubscriptionCheckoutRequest,
    current_user = Depends(get_current_user)
):
    """
    Create checkout session for subscription.
    Only tenant admins can do this.
    """
    # Check if user is admin
    if not current_user.is_super_admin:
        raise HTTPException(403, "Only tenant admins can manage billing")
    
    try:
        service = get_stripe_billing_service(db)
        
        if not service.api_key:
            raise HTTPException(503, "Stripe billing is not configured. Contact support.")
        
        # Get current license quantities
        licenses = await db.tenant_licenses.find(
            {"tenant_id": current_user.tenant_id},
            {"_id": 0, "license_code": 1, "seats_purchased": 1}
        ).to_list(20)
        
        license_quantities = {
            lic["license_code"]: lic.get("seats_purchased", 0)
            for lic in licenses
        }
        
        # Build URLs
        success_url = f"{request.origin_url}/setup/billing?session_id={{CHECKOUT_SESSION_ID}}"
        cancel_url = f"{request.origin_url}/setup/billing"
        
        return await service.create_checkout_session(
            tenant_id=current_user.tenant_id,
            plan=request.plan,
            billing_cycle=request.billing_cycle,
            license_quantities=license_quantities,
            success_url=success_url,
            cancel_url=cancel_url,
            metadata={"user_id": current_user.id, "user_email": current_user.email}
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Checkout session creation failed: {e}")
        raise HTTPException(500, f"Failed to create checkout session: {str(e)}")


@router.post("/checkout/seats")
async def create_seat_purchase_checkout(
    request: SeatPurchaseRequest,
    current_user = Depends(get_current_user)
):
    """
    Create checkout session for purchasing additional seats.
    Only tenant admins can do this.
    """
    if not current_user.is_super_admin:
        raise HTTPException(403, "Only tenant admins can manage billing")
    
    service = get_stripe_billing_service(db)
    
    success_url = f"{request.origin_url}/setup/billing?session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{request.origin_url}/setup/billing"
    
    return await service.create_seat_purchase_session(
        tenant_id=current_user.tenant_id,
        license_code=request.license_code,
        quantity=request.quantity,
        success_url=success_url,
        cancel_url=cancel_url,
        metadata={"user_id": current_user.id, "user_email": current_user.email}
    )


@router.get("/checkout/status/{session_id}")
async def get_checkout_status(
    session_id: str,
    http_request: Request,
    current_user = Depends(get_current_user)
):
    """Get status of a checkout session"""
    service = get_stripe_billing_service(db)
    
    # Verify session belongs to this tenant
    transaction = await db.payment_transactions.find_one(
        {"session_id": session_id, "tenant_id": current_user.tenant_id},
        {"_id": 0}
    )
    
    if not transaction:
        raise HTTPException(404, "Checkout session not found")
    
    webhook_url = f"{http_request.base_url}api/webhook/stripe"
    return await service.get_checkout_status(session_id, webhook_url)


@router.get("/transactions")
async def get_transactions(
    page: int = 1,
    limit: int = 20,
    current_user = Depends(get_current_user)
):
    """Get payment transactions for the tenant"""
    skip = (page - 1) * limit
    
    transactions = await db.payment_transactions.find(
        {"tenant_id": current_user.tenant_id},
        {"_id": 0}
    ).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    
    total = await db.payment_transactions.count_documents(
        {"tenant_id": current_user.tenant_id}
    )
    
    return {
        "transactions": transactions,
        "total": total,
        "page": page,
        "limit": limit
    }


# ============================================================================
# ADMIN PORTAL BILLING ROUTES
# ============================================================================

@admin_router.get("/tenant/{tenant_id}/summary")
async def admin_get_tenant_billing(
    tenant_id: str,
    admin_user: dict = Depends(require_admin_auth)
):
    """Get billing summary for a specific tenant (admin only)"""
    service = get_stripe_billing_service(db)
    return await service.get_billing_summary(tenant_id)


@admin_router.post("/tenant/{tenant_id}/initialize-billing")
async def admin_initialize_billing(
    tenant_id: str,
    admin_user: dict = Depends(require_admin_auth)
):
    """Initialize billing configuration for a tenant"""
    # Get tenant info
    tenant = await db.tenants.find_one(
        {"id": tenant_id},
        {"_id": 0, "tenant_name": 1, "organization_name": 1}
    )
    
    if not tenant:
        raise HTTPException(404, "Tenant not found")
    
    # Get admin user email
    admin = await db.users.find_one(
        {"tenant_id": tenant_id, "is_super_admin": True},
        {"_id": 0, "email": 1}
    )
    
    if not admin:
        raise HTTPException(400, "No admin user found for tenant")
    
    service = get_stripe_billing_service(db)
    return await service.initialize_billing(
        tenant_id=tenant_id,
        tenant_name=tenant.get("organization_name") or tenant.get("tenant_name"),
        admin_email=admin["email"],
        metadata={"created_by": admin_user.get("email", "admin")}
    )


class AdminCheckoutRequest(BaseModel):
    """Request to create checkout session from admin portal"""
    plan: str = Field(..., description="Plan type: starter, professional, enterprise")
    billing_cycle: str = Field("monthly", description="monthly or yearly")
    origin_url: str = Field(..., description="Frontend origin URL for redirects")


@admin_router.post("/tenant/{tenant_id}/checkout")
async def admin_create_checkout(
    tenant_id: str,
    request: AdminCheckoutRequest,
    admin_user: dict = Depends(require_admin_auth)
):
    """Create checkout session for a tenant (admin-initiated)"""
    # Get tenant info
    tenant = await db.tenants.find_one(
        {"id": tenant_id},
        {"_id": 0, "tenant_name": 1, "organization_name": 1}
    )
    
    if not tenant:
        raise HTTPException(404, "Tenant not found")
    
    service = get_stripe_billing_service(db)
    
    # Get current license quantities for the tenant
    licenses = await db.tenant_licenses.find(
        {"tenant_id": tenant_id},
        {"_id": 0, "license_code": 1, "seats_purchased": 1}
    ).to_list(20)
    
    license_quantities = {
        lic["license_code"]: lic.get("seats_purchased", 0)
        for lic in licenses
    }
    
    # Build URLs
    success_url = f"{request.origin_url}/admin/tenants/{tenant_id}?billing=success&session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{request.origin_url}/admin/tenants/{tenant_id}?billing=cancelled"
    
    return await service.create_checkout_session(
        tenant_id=tenant_id,
        plan=request.plan,
        billing_cycle=request.billing_cycle,
        license_quantities=license_quantities,
        success_url=success_url,
        cancel_url=cancel_url,
        metadata={
            "admin_initiated": "true",
            "admin_email": admin_user.get("email", "admin"),
            "tenant_name": tenant.get("organization_name") or tenant.get("tenant_name")
        }
    )


@admin_router.get("/tenant/{tenant_id}/checkout/status/{session_id}")
async def admin_get_checkout_status(
    tenant_id: str,
    session_id: str,
    http_request: Request,
    admin_user: dict = Depends(require_admin_auth)
):
    """Get checkout session status (admin)"""
    service = get_stripe_billing_service(db)
    
    # Verify session belongs to this tenant
    transaction = await db.payment_transactions.find_one(
        {"session_id": session_id, "tenant_id": tenant_id},
        {"_id": 0}
    )
    
    if not transaction:
        raise HTTPException(404, "Checkout session not found for this tenant")
    
    webhook_url = f"{http_request.base_url}api/webhook/stripe"
    return await service.get_checkout_status(session_id, webhook_url)


@admin_router.get("/transactions")
async def admin_get_all_transactions(
    page: int = 1,
    limit: int = 50,
    tenant_id: Optional[str] = None,
    status: Optional[str] = None,
    admin_user: dict = Depends(require_admin_auth)
):
    """Get all payment transactions (admin only)"""
    query = {}
    if tenant_id:
        query["tenant_id"] = tenant_id
    if status:
        query["payment_status"] = status
    
    skip = (page - 1) * limit
    
    transactions = await db.payment_transactions.find(
        query,
        {"_id": 0}
    ).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    
    total = await db.payment_transactions.count_documents(query)
    
    return {
        "transactions": transactions,
        "total": total,
        "page": page,
        "limit": limit
    }


# ============================================================================
# ADMIN MANUAL PLAN OVERRIDE
# ============================================================================

class ManualPlanOverrideRequest(BaseModel):
    """Request to manually override tenant plan without payment"""
    plan: str = Field(..., description="Plan type: free, starter, professional, enterprise")
    reason: str = Field(..., description="Reason for manual override")


@admin_router.post("/tenant/{tenant_id}/override-plan")
async def admin_override_tenant_plan(
    tenant_id: str,
    request: ManualPlanOverrideRequest,
    admin_user: dict = Depends(require_admin_auth)
):
    """
    Manually override tenant plan without requiring Stripe payment.
    
    Use cases:
    - Customer support override
    - Trial extensions
    - Custom pricing arrangements
    - Enterprise deals
    """
    from datetime import datetime, timezone
    import uuid
    
    # Verify tenant exists
    tenant = await db.tenants.find_one({"id": tenant_id}, {"_id": 0})
    if not tenant:
        raise HTTPException(404, "Tenant not found")
    
    old_plan = tenant.get("plan", "free")
    new_plan = request.plan
    now = datetime.now(timezone.utc)
    
    # Get plan entitlements
    service = get_stripe_billing_service(db)
    module_entitlements = await service._get_plan_entitlements(new_plan)
    seat_limit = await service._get_plan_seat_limit(new_plan)
    storage_limit = await service._get_plan_storage_limit(new_plan)
    
    # Check plans collection for custom settings
    plan_doc = await db.plans.find_one({"api_name": new_plan}, {"_id": 0})
    if plan_doc:
        module_entitlements = plan_doc.get("enabled_modules", module_entitlements)
        seat_limit = plan_doc.get("seat_limit", seat_limit)
        storage_limit = plan_doc.get("storage_limit_mb", storage_limit)
    
    # Update tenant (SOURCE OF TRUTH)
    await db.tenants.update_one(
        {"id": tenant_id},
        {
            "$set": {
                "plan": new_plan,
                "subscription_plan": new_plan,
                "module_entitlements": module_entitlements,
                "seat_limit": seat_limit,
                "max_users": seat_limit,
                "max_storage_mb": storage_limit,
                "plan_override_reason": request.reason,
                "plan_override_by": admin_user.get("email"),
                "plan_override_at": now,
                "updated_at": now
            }
        }
    )
    
    # Update billing config
    await db.tenant_billing_config.update_one(
        {"tenant_id": tenant_id},
        {
            "$set": {
                "current_plan": new_plan,
                "manual_override": True,
                "override_reason": request.reason,
                "override_by": admin_user.get("email"),
                "updated_at": now
            }
        },
        upsert=True
    )
    
    # Enable modules
    for module_code in module_entitlements:
        await db.tenant_modules.update_one(
            {"tenant_id": tenant_id, "module_code": module_code},
            {
                "$set": {
                    "id": str(uuid.uuid4()),
                    "tenant_id": tenant_id,
                    "module_code": module_code,
                    "is_enabled": True,
                    "updated_at": now
                },
                "$setOnInsert": {"created_at": now}
            },
            upsert=True
        )
    
    # Provision licenses and assign seats to tenant admin
    try:
        from modules.admin.services.tenant_license_service import get_tenant_license_service
        license_service = get_tenant_license_service(db)
        
        # Find the tenant admin user to auto-assign seats
        tenant_admin = await db.users.find_one(
            {"tenant_id": tenant_id, "is_super_admin": True},
            {"_id": 0, "id": 1}
        )
        admin_user_id = tenant_admin["id"] if tenant_admin else None
        
        await license_service.provision_licenses_for_plan(
            tenant_id=tenant_id,
            plan=new_plan,
            actor_id=admin_user.get("user_id", "admin"),
            actor_email=admin_user.get("email", "admin"),
            admin_user_id=admin_user_id
        )
    except Exception as e:
        logger.warning(f"Failed to provision licenses: {e}")
    
    # Log audit event
    await db.admin_audit_logs.insert_one({
        "id": str(uuid.uuid4()),
        "action": "plan_manual_override",
        "actor_id": admin_user.get("user_id"),
        "actor_email": admin_user.get("email"),
        "tenant_id": tenant_id,
        "details": {
            "old_plan": old_plan,
            "new_plan": new_plan,
            "reason": request.reason,
            "modules_enabled": module_entitlements
        },
        "timestamp": now
    })
    
    logger.info(f"Manual plan override: tenant {tenant_id} from {old_plan} to {new_plan} by {admin_user.get('email')}")
    
    return {
        "success": True,
        "tenant_id": tenant_id,
        "old_plan": old_plan,
        "new_plan": new_plan,
        "module_entitlements": module_entitlements,
        "seat_limit": seat_limit,
        "message": f"Plan manually overridden to {new_plan}"
    }


@admin_router.post("/tenant/{tenant_id}/cancel-subscription")
async def admin_cancel_subscription(
    tenant_id: str,
    reason: str = Body(..., embed=True),
    admin_user: dict = Depends(require_admin_auth)
):
    """Cancel tenant subscription and downgrade to free plan"""
    from datetime import datetime, timezone
    import uuid
    
    tenant = await db.tenants.find_one({"id": tenant_id}, {"_id": 0})
    if not tenant:
        raise HTTPException(404, "Tenant not found")
    
    old_plan = tenant.get("plan", "free")
    now = datetime.now(timezone.utc)
    
    # Get free plan entitlements
    service = get_stripe_billing_service(db)
    module_entitlements = await service._get_plan_entitlements("free")
    
    # Update tenant to free plan
    await db.tenants.update_one(
        {"id": tenant_id},
        {
            "$set": {
                "plan": "free",
                "subscription_plan": "free",
                "subscription_status": "cancelled",
                "module_entitlements": module_entitlements,
                "seat_limit": 5,
                "max_users": 5,
                "cancelled_at": now,
                "cancellation_reason": reason,
                "updated_at": now
            }
        }
    )
    
    # Update billing config
    await db.tenant_billing_config.update_one(
        {"tenant_id": tenant_id},
        {
            "$set": {
                "subscription_status": "cancelled",
                "current_plan": "free",
                "cancelled_at": now,
                "cancellation_reason": reason,
                "updated_at": now
            }
        },
        upsert=True
    )
    
    # Log audit
    await db.admin_audit_logs.insert_one({
        "id": str(uuid.uuid4()),
        "action": "subscription_cancelled",
        "actor_id": admin_user.get("user_id"),
        "actor_email": admin_user.get("email"),
        "tenant_id": tenant_id,
        "details": {"old_plan": old_plan, "reason": reason},
        "timestamp": now
    })
    
    logger.info(f"Subscription cancelled: tenant {tenant_id} by {admin_user.get('email')}")
    
    return {
        "success": True,
        "tenant_id": tenant_id,
        "old_plan": old_plan,
        "new_plan": "free",
        "message": "Subscription cancelled and downgraded to free plan"
    }


# ============================================================================
# WEBHOOK ROUTE (Public - No Auth)
# ============================================================================

webhook_router = APIRouter(tags=["Webhooks"])


@webhook_router.post("/webhook/stripe")
async def stripe_webhook(request: Request):
    """
    Handle Stripe webhooks.
    This endpoint is called by Stripe when payment events occur.
    """
    try:
        payload = await request.body()
        signature = request.headers.get("Stripe-Signature")
        
        if not signature:
            logger.warning("Webhook received without signature")
            raise HTTPException(400, "Missing Stripe signature")
        
        service = get_stripe_billing_service(db)
        webhook_url = f"{request.base_url}api/webhook/stripe"
        
        result = await service.handle_webhook(payload, signature, webhook_url)
        
        logger.info(f"Processed webhook: {result.get('event_type')}")
        return {"received": True, **result}
        
    except Exception as e:
        logger.error(f"Webhook processing error: {e}")
        # Return 200 to acknowledge receipt even on error
        # This prevents Stripe from retrying indefinitely
        return {"received": True, "error": str(e)}
