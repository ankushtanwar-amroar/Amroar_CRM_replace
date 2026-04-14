"""
Stripe Billing Service
Handles subscription management for tenants based on seat-based pricing.

Features:
- Create Stripe customer per tenant
- Create/update subscriptions based on license seats
- Handle webhooks for payment events
- Sync subscription status to tenant_billing_config

Pricing Model:
- Seat-based pricing (e.g., $10/seat/month)
- Different prices per license type
"""
import os
import logging
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List
import uuid

logger = logging.getLogger(__name__)

# Stripe API Key
STRIPE_API_KEY = os.environ.get("STRIPE_API_KEY")

# Pricing configuration (in dollars)
# These should match your Stripe Price IDs in production
SEAT_PRICING = {
    "CRM_CORE_SEAT": {
        "monthly": 10.00,
        "yearly": 100.00,
        "stripe_price_monthly": None,  # Set to Stripe Price ID when created
        "stripe_price_yearly": None
    },
    "FLOW_BUILDER_SEAT": {
        "monthly": 15.00,
        "yearly": 150.00,
        "stripe_price_monthly": None,
        "stripe_price_yearly": None
    },
    "FORM_BUILDER_SEAT": {
        "monthly": 8.00,
        "yearly": 80.00,
        "stripe_price_monthly": None,
        "stripe_price_yearly": None
    },
    "TASK_MANAGER_SEAT": {
        "monthly": 8.00,
        "yearly": 80.00,
        "stripe_price_monthly": None,
        "stripe_price_yearly": None
    },
    "SURVEY_BUILDER_SEAT": {
        "monthly": 12.00,
        "yearly": 120.00,
        "stripe_price_monthly": None,
        "stripe_price_yearly": None
    },
    "CHATBOT_SEAT": {
        "monthly": 20.00,
        "yearly": 200.00,
        "stripe_price_monthly": None,
        "stripe_price_yearly": None
    },
    "DOCFLOW_SEAT": {
        "monthly": 15.00,
        "yearly": 150.00,
        "stripe_price_monthly": None,
        "stripe_price_yearly": None
    }
}

# Plan-based pricing (flat rate + per-seat)
PLAN_PRICING = {
    "free": {"base_monthly": 0, "base_yearly": 0},
    "starter": {"base_monthly": 29.00, "base_yearly": 290.00},
    "professional": {"base_monthly": 79.00, "base_yearly": 790.00},
    "enterprise": {"base_monthly": 199.00, "base_yearly": 1990.00}
}


class StripeBillingService:
    """
    Stripe billing service for managing tenant subscriptions.
    """
    
    def __init__(self, db):
        self.db = db
        self.api_key = STRIPE_API_KEY
        self._stripe_checkout = None
        
        if not self.api_key:
            logger.warning("STRIPE_API_KEY not configured - billing features disabled")
    
    def _get_stripe_checkout(self, webhook_url: str):
        """Get or create Stripe checkout instance"""
        if not self.api_key:
            raise ValueError("Stripe API key not configured")
        
        from emergentintegrations.payments.stripe.checkout import StripeCheckout
        return StripeCheckout(api_key=self.api_key, webhook_url=webhook_url)
    
    async def initialize_billing(
        self,
        tenant_id: str,
        tenant_name: str,
        admin_email: str,
        metadata: Optional[Dict] = None
    ) -> Dict[str, Any]:
        """
        Initialize billing configuration for a tenant.
        Note: Stripe customer is created automatically during checkout.
        
        Args:
            tenant_id: Tenant UUID
            tenant_name: Organization name
            admin_email: Billing contact email
            metadata: Additional metadata
        
        Returns:
            Billing initialization result
        """
        try:
            # Check if billing config already exists
            existing = await self.db.tenant_billing_config.find_one(
                {"tenant_id": tenant_id},
                {"_id": 0}
            )
            
            if existing:
                return {
                    "tenant_id": tenant_id,
                    "status": "existing",
                    "billing_email": existing.get("billing_email"),
                    "stripe_customer_id": existing.get("stripe_customer_id")
                }
            
            # Initialize billing config (Stripe customer created during first checkout)
            billing_config = {
                "id": str(uuid.uuid4()),
                "tenant_id": tenant_id,
                "tenant_name": tenant_name,
                "billing_email": admin_email,
                "stripe_customer_id": None,  # Will be set after first successful checkout
                "subscription_status": "inactive",
                "current_plan": "free",
                "billing_cycle": "monthly",
                "created_at": datetime.now(timezone.utc),
                "updated_at": datetime.now(timezone.utc),
                "metadata": metadata or {}
            }
            
            await self.db.tenant_billing_config.insert_one(billing_config)
            
            logger.info(f"Initialized billing config for tenant {tenant_id}")
            
            return {
                "tenant_id": tenant_id,
                "status": "initialized",
                "billing_email": admin_email,
                "message": "Billing initialized. Stripe customer will be created during first checkout."
            }
            
        except Exception as e:
            logger.error(f"Failed to initialize billing: {e}")
            raise
    
    async def create_checkout_session(
        self,
        tenant_id: str,
        plan: str,
        billing_cycle: str,  # "monthly" or "yearly"
        license_quantities: Dict[str, int],  # {"CRM_CORE_SEAT": 10, ...}
        success_url: str,
        cancel_url: str,
        metadata: Optional[Dict] = None
    ) -> Dict[str, Any]:
        """
        Create a Stripe checkout session for subscription.
        
        Args:
            tenant_id: Tenant UUID
            plan: Plan type (starter, professional, enterprise)
            billing_cycle: "monthly" or "yearly"
            license_quantities: Dict of license_code to quantity
            success_url: URL to redirect after success
            cancel_url: URL to redirect on cancel
            metadata: Additional metadata
        
        Returns:
            Checkout session details with URL
        """
        from emergentintegrations.payments.stripe.checkout import (
            StripeCheckout, CheckoutSessionRequest
        )
        
        # Calculate total amount
        total_amount = self._calculate_subscription_amount(
            plan, billing_cycle, license_quantities
        )
        
        # Create checkout session — extract origin from success_url
        from urllib.parse import urlparse
        parsed = urlparse(success_url)
        webhook_url = f"{parsed.scheme}://{parsed.netloc}/api/webhook/stripe"
        stripe_checkout = self._get_stripe_checkout(webhook_url)
        
        checkout_request = CheckoutSessionRequest(
            amount=total_amount,
            currency="usd",
            success_url=success_url,
            cancel_url=cancel_url,
            metadata={
                "tenant_id": tenant_id,
                "plan": plan,
                "billing_cycle": billing_cycle,
                "type": "subscription",
                **(metadata or {})
            }
        )
        
        session = await stripe_checkout.create_checkout_session(checkout_request)
        
        # Record transaction
        transaction = {
            "id": str(uuid.uuid4()),
            "tenant_id": tenant_id,
            "session_id": session.session_id,
            "type": "subscription",
            "amount": total_amount,
            "currency": "usd",
            "plan": plan,
            "billing_cycle": billing_cycle,
            "license_quantities": license_quantities,
            "status": "pending",
            "payment_status": "initiated",
            "created_at": datetime.now(timezone.utc),
            "metadata": metadata
        }
        
        await self.db.payment_transactions.insert_one(transaction)
        
        return {
            "checkout_url": session.url,
            "session_id": session.session_id,
            "amount": total_amount,
            "currency": "usd"
        }
    
    async def create_seat_purchase_session(
        self,
        tenant_id: str,
        license_code: str,
        quantity: int,
        success_url: str,
        cancel_url: str,
        metadata: Optional[Dict] = None
    ) -> Dict[str, Any]:
        """
        Create checkout session for purchasing additional seats.
        
        Args:
            tenant_id: Tenant UUID
            license_code: License type to purchase
            quantity: Number of seats
            success_url: Success redirect URL
            cancel_url: Cancel redirect URL
            metadata: Additional metadata
        
        Returns:
            Checkout session with URL
        """
        from emergentintegrations.payments.stripe.checkout import (
            StripeCheckout, CheckoutSessionRequest
        )
        
        # Get seat price
        pricing = SEAT_PRICING.get(license_code)
        if not pricing:
            raise ValueError(f"Unknown license code: {license_code}")
        
        # For seat purchases, use monthly price
        amount = pricing["monthly"] * quantity
        
        from urllib.parse import urlparse
        parsed = urlparse(success_url)
        webhook_url = f"{parsed.scheme}://{parsed.netloc}/api/webhook/stripe"
        stripe_checkout = self._get_stripe_checkout(webhook_url)
        
        checkout_request = CheckoutSessionRequest(
            amount=amount,
            currency="usd",
            success_url=success_url,
            cancel_url=cancel_url,
            metadata={
                "tenant_id": tenant_id,
                "license_code": license_code,
                "quantity": str(quantity),
                "type": "seat_purchase",
                **(metadata or {})
            }
        )
        
        session = await stripe_checkout.create_checkout_session(checkout_request)
        
        # Record transaction
        transaction = {
            "id": str(uuid.uuid4()),
            "tenant_id": tenant_id,
            "session_id": session.session_id,
            "type": "seat_purchase",
            "license_code": license_code,
            "quantity": quantity,
            "amount": amount,
            "currency": "usd",
            "status": "pending",
            "payment_status": "initiated",
            "created_at": datetime.now(timezone.utc),
            "metadata": metadata
        }
        
        await self.db.payment_transactions.insert_one(transaction)
        
        return {
            "checkout_url": session.url,
            "session_id": session.session_id,
            "amount": amount,
            "currency": "usd",
            "license_code": license_code,
            "quantity": quantity
        }
    
    async def get_checkout_status(
        self,
        session_id: str,
        webhook_url: str
    ) -> Dict[str, Any]:
        """
        Get status of a checkout session.
        Updates transaction record if payment completed.
        
        Args:
            session_id: Stripe checkout session ID
            webhook_url: Webhook URL for Stripe
        
        Returns:
            Checkout status details
        """
        from emergentintegrations.payments.stripe.checkout import StripeCheckout
        
        stripe_checkout = self._get_stripe_checkout(webhook_url)
        status = await stripe_checkout.get_checkout_status(session_id)
        
        # Get transaction record
        transaction = await self.db.payment_transactions.find_one(
            {"session_id": session_id},
            {"_id": 0}
        )
        
        if transaction and status.payment_status == "paid":
            # Check if already processed
            if transaction.get("payment_status") != "paid":
                # Update transaction
                await self.db.payment_transactions.update_one(
                    {"session_id": session_id},
                    {
                        "$set": {
                            "status": "completed",
                            "payment_status": "paid",
                            "paid_at": datetime.now(timezone.utc),
                            "stripe_payment_status": status.payment_status
                        }
                    }
                )
                
                # Process based on transaction type
                await self._process_successful_payment(transaction, status)
        
        return {
            "session_id": session_id,
            "status": status.status,
            "payment_status": status.payment_status,
            "amount": status.amount_total / 100,  # Convert from cents
            "currency": status.currency,
            "metadata": status.metadata
        }
    
    async def handle_webhook(
        self,
        payload: bytes,
        signature: str,
        webhook_url: str
    ) -> Dict[str, Any]:
        """
        Handle Stripe webhook events.
        
        Args:
            payload: Raw webhook payload
            signature: Stripe signature header
            webhook_url: Webhook URL
        
        Returns:
            Webhook processing result
        """
        from emergentintegrations.payments.stripe.checkout import StripeCheckout
        
        stripe_checkout = self._get_stripe_checkout(webhook_url)
        event = await stripe_checkout.handle_webhook(payload, signature)
        
        logger.info(f"Received Stripe webhook: {event.event_type}")
        
        # Handle different event types
        if event.event_type == "checkout.session.completed":
            # Update transaction
            if event.session_id:
                transaction = await self.db.payment_transactions.find_one(
                    {"session_id": event.session_id},
                    {"_id": 0}
                )
                
                if transaction and event.payment_status == "paid":
                    await self.db.payment_transactions.update_one(
                        {"session_id": event.session_id},
                        {
                            "$set": {
                                "status": "completed",
                                "payment_status": "paid",
                                "paid_at": datetime.now(timezone.utc)
                            }
                        }
                    )
                    await self._process_successful_payment(transaction, event)
        
        elif event.event_type == "invoice.payment_failed":
            # Handle failed payment
            if event.metadata and event.metadata.get("tenant_id"):
                await self._handle_payment_failure(event.metadata["tenant_id"])
        
        return {
            "event_type": event.event_type,
            "event_id": event.event_id,
            "processed": True
        }
    
    async def _process_successful_payment(
        self,
        transaction: Dict,
        status: Any
    ):
        """
        Process a successful payment - update tenant plan, modules, and billing.
        
        IMPORTANT: The `tenants` collection is the SOURCE OF TRUTH for plan data.
        This ensures `/api/runtime/modules/states` always returns correct data.
        """
        tenant_id = transaction.get("tenant_id")
        now = datetime.now(timezone.utc)
        
        if transaction.get("type") == "seat_purchase":
            # Add purchased seats to tenant license
            license_code = transaction.get("license_code")
            quantity = transaction.get("quantity", 0)
            
            if license_code and quantity > 0:
                await self.db.tenant_licenses.update_one(
                    {"tenant_id": tenant_id, "license_code": license_code},
                    {
                        "$inc": {"seats_purchased": quantity},
                        "$set": {"updated_at": now}
                    }
                )
                
                logger.info(f"Added {quantity} seats of {license_code} to tenant {tenant_id}")
        
        elif transaction.get("type") == "subscription":
            plan = transaction.get("plan")
            billing_cycle = transaction.get("billing_cycle")
            
            # Get Stripe customer ID from status if available
            stripe_customer_id = None
            stripe_subscription_id = None
            if hasattr(status, 'customer'):
                stripe_customer_id = status.customer
            if hasattr(status, 'subscription'):
                stripe_subscription_id = status.subscription
            
            # ================================================================
            # STEP 1: Update TENANTS collection (SOURCE OF TRUTH)
            # ================================================================
            # Get plan details from plans collection
            plan_doc = await self.db.plans.find_one(
                {"api_name": plan},
                {"_id": 0}
            )
            
            # Calculate module entitlements based on plan from DB
            module_entitlements = await self._get_plan_entitlements(plan)
            seat_limit = await self._get_plan_seat_limit(plan)
            storage_limit = await self._get_plan_storage_limit(plan)
            
            # If plan was found in initial lookup, prefer its settings
            if plan_doc:
                module_entitlements = plan_doc.get("enabled_modules", module_entitlements)
                seat_limit = plan_doc.get("seat_limit", seat_limit)
                storage_limit = plan_doc.get("storage_limit_mb", storage_limit)
            
            # Build tenant update
            tenant_update = {
                "plan": plan,
                "subscription_plan": plan,  # Backward compatibility
                "subscription_status": "active",
                "module_entitlements": module_entitlements,
                "seat_limit": seat_limit,
                "max_users": seat_limit,  # Backward compatibility
                "max_storage_mb": storage_limit,
                "billing_cycle": billing_cycle,
                "last_payment_date": now,
                "updated_at": now
            }
            
            # Add Stripe IDs if available
            if stripe_customer_id:
                tenant_update["stripe_customer_id"] = stripe_customer_id
            if stripe_subscription_id:
                tenant_update["stripe_subscription_id"] = stripe_subscription_id
            
            await self.db.tenants.update_one(
                {"id": tenant_id},
                {"$set": tenant_update}
            )
            
            logger.info(f"Updated tenant {tenant_id} plan to {plan} with modules: {module_entitlements}")
            
            # ================================================================
            # STEP 2: Update TENANT_BILLING_CONFIG (for billing history)
            # ================================================================
            billing_update = {
                "subscription_status": "active",
                "current_plan": plan,
                "billing_cycle": billing_cycle,
                "last_payment_date": now,
                "updated_at": now
            }
            
            if stripe_customer_id:
                billing_update["stripe_customer_id"] = stripe_customer_id
            if stripe_subscription_id:
                billing_update["stripe_subscription_id"] = stripe_subscription_id
            
            await self.db.tenant_billing_config.update_one(
                {"tenant_id": tenant_id},
                {"$set": billing_update},
                upsert=True
            )
            
            # ================================================================
            # STEP 3: Enable modules in TENANT_MODULES collection
            # ================================================================
            for module_code in module_entitlements:
                await self.db.tenant_modules.update_one(
                    {"tenant_id": tenant_id, "module_code": module_code},
                    {
                        "$set": {
                            "id": str(uuid.uuid4()),
                            "tenant_id": tenant_id,
                            "module_code": module_code,
                            "is_enabled": True,
                            "enforcement_level": "HARD_STOP",
                            "updated_at": now
                        },
                        "$setOnInsert": {"created_at": now}
                    },
                    upsert=True
                )
            
            # ================================================================
            # STEP 4: Provision licenses based on new plan
            # ================================================================
            try:
                from .tenant_license_service import get_tenant_license_service
                license_service = get_tenant_license_service(self.db)
                
                # Get admin user ID from transaction metadata
                admin_user_id = None
                if transaction.get("metadata"):
                    admin_user_id = transaction["metadata"].get("user_id")
                
                await license_service.provision_licenses_for_plan(
                    tenant_id=tenant_id,
                    plan=plan,
                    actor_id="stripe_webhook",
                    actor_email="system@stripe.webhook",
                    admin_user_id=admin_user_id
                )
                logger.info(f"Provisioned licenses for tenant {tenant_id} on plan {plan}")
            except Exception as e:
                logger.warning(f"Failed to provision licenses for tenant {tenant_id}: {e}")
            
            logger.info(f"Subscription upgrade complete for tenant {tenant_id}: {plan}")
    
    async def _get_plan_entitlements(self, plan: str) -> list:
        """Get module entitlements for a plan from DB"""
        plan_doc = await self.db.plans.find_one({"api_name": plan}, {"_id": 0})
        if plan_doc:
            return plan_doc.get("enabled_modules", ["crm", "task_manager"])
        logger.warning(f"Plan '{plan}' not found in DB for entitlement lookup — using minimal fallback")
        return ["crm", "task_manager"]
    
    async def _get_plan_seat_limit(self, plan: str) -> int:
        """Get seat limit for a plan from DB"""
        plan_doc = await self.db.plans.find_one({"api_name": plan}, {"_id": 0})
        if plan_doc:
            return plan_doc.get("seat_limit", 5)
        return 5
    
    async def _get_plan_storage_limit(self, plan: str) -> int:
        """Get storage limit in MB for a plan from DB"""
        plan_doc = await self.db.plans.find_one({"api_name": plan}, {"_id": 0})
        if plan_doc:
            return plan_doc.get("storage_limit_mb", 512)
        return 512
    
    async def _handle_payment_failure(self, tenant_id: str):
        """Handle payment failure - update billing status"""
        await self.db.tenant_billing_config.update_one(
            {"tenant_id": tenant_id},
            {
                "$set": {
                    "subscription_status": "past_due",
                    "payment_failed_at": datetime.now(timezone.utc),
                    "updated_at": datetime.now(timezone.utc)
                }
            }
        )
        
        logger.warning(f"Payment failed for tenant {tenant_id}")
    
    def _calculate_subscription_amount(
        self,
        plan: str,
        billing_cycle: str,
        license_quantities: Dict[str, int]
    ) -> float:
        """Calculate total subscription amount"""
        # Base plan price
        plan_pricing = PLAN_PRICING.get(plan, PLAN_PRICING["starter"])
        
        if billing_cycle == "yearly":
            total = plan_pricing["base_yearly"]
            price_key = "yearly"
        else:
            total = plan_pricing["base_monthly"]
            price_key = "monthly"
        
        # Add seat costs
        for license_code, quantity in license_quantities.items():
            seat_pricing = SEAT_PRICING.get(license_code)
            if seat_pricing:
                total += seat_pricing[price_key] * quantity
        
        return round(total, 2)
    
    async def get_billing_summary(self, tenant_id: str) -> Dict[str, Any]:
        """
        Get billing summary for a tenant.
        
        IMPORTANT: The plan is read from the TENANTS collection (source of truth),
        NOT from tenant_billing_config which may be stale.
        """
        # Get tenant data (SOURCE OF TRUTH for plan)
        tenant = await self.db.tenants.find_one(
            {"id": tenant_id},
            {"_id": 0, "plan": 1, "subscription_plan": 1, "module_entitlements": 1, 
             "seat_limit": 1, "max_storage_mb": 1, "subscription_status": 1,
             "stripe_customer_id": 1, "stripe_subscription_id": 1}
        )
        
        # Get billing config (for billing-specific settings)
        config = await self.db.tenant_billing_config.find_one(
            {"tenant_id": tenant_id},
            {"_id": 0}
        )
        
        # Get tenant licenses
        licenses = await self.db.tenant_licenses.find(
            {"tenant_id": tenant_id},
            {"_id": 0}
        ).to_list(20)
        
        # Get recent transactions
        transactions = await self.db.payment_transactions.find(
            {"tenant_id": tenant_id}
        ).sort("created_at", -1).limit(10).to_list(10)
        
        # Calculate current monthly cost
        license_quantities = {
            lic["license_code"]: lic.get("seats_purchased", 0)
            for lic in licenses
        }
        
        # Get plan from tenant (source of truth), fallback to billing config, then to "free"
        plan = (tenant.get("plan") if tenant else None) or \
               (tenant.get("subscription_plan") if tenant else None) or \
               (config.get("current_plan") if config else None) or \
               "free"
        
        # Get subscription status from tenant first, then billing config
        subscription_status = (tenant.get("subscription_status") if tenant else None) or \
                              (config.get("subscription_status") if config else None) or \
                              ("active" if plan != "free" else "inactive")
        
        # Get Stripe IDs from tenant first, then billing config
        stripe_customer_id = (tenant.get("stripe_customer_id") if tenant else None) or \
                             (config.get("stripe_customer_id") if config else None)
        stripe_subscription_id = (tenant.get("stripe_subscription_id") if tenant else None) or \
                                 (config.get("stripe_subscription_id") if config else None)
        
        monthly_cost = self._calculate_subscription_amount(
            plan, "monthly", license_quantities
        )
        
        # Count enabled modules
        modules_count = len(tenant.get("module_entitlements", [])) if tenant else 0
        
        return {
            "tenant_id": tenant_id,
            "subscription_status": subscription_status,
            "current_plan": plan,
            "billing_cycle": config.get("billing_cycle", "monthly") if config else "monthly",
            "stripe_customer_id": stripe_customer_id,
            "stripe_subscription_id": stripe_subscription_id,
            "billing_email": config.get("billing_email") if config else None,
            "last_payment_date": config.get("last_payment_date") if config else None,
            "estimated_monthly_cost": monthly_cost,
            "modules_count": modules_count,
            "seat_limit": tenant.get("seat_limit", 10) if tenant else 10,
            "max_storage_mb": tenant.get("max_storage_mb", 1024) if tenant else 1024,
            "config": config,  # Include full config for form data
            "licenses": [
                {
                    "code": lic["license_code"],
                    "seats": lic.get("seats_purchased", 0),
                    "price_per_seat": SEAT_PRICING.get(lic["license_code"], {}).get("monthly", 0)
                }
                for lic in licenses
            ],
            "recent_transactions": [
                {
                    "id": t.get("id"),
                    "type": t.get("type"),
                    "amount": t.get("amount"),
                    "status": t.get("payment_status"),
                    "created_at": t.get("created_at")
                }
                for t in transactions
            ]
        }


# Singleton
_stripe_billing_service = None


def get_stripe_billing_service(db) -> StripeBillingService:
    """Get or create Stripe billing service"""
    global _stripe_billing_service
    if _stripe_billing_service is None:
        _stripe_billing_service = StripeBillingService(db)
    return _stripe_billing_service
