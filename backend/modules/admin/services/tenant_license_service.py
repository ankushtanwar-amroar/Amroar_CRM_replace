"""
Tenant License Service - Admin Portal
Manages tenant license subscriptions (seat pools) and billing configuration
"""
import logging
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List
from motor.motor_asyncio import AsyncIOMotorDatabase
import uuid

logger = logging.getLogger(__name__)


class TenantLicenseService:
    """Service for managing tenant license subscriptions (seat pools)"""
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.tenant_licenses_collection = db.tenant_licenses
        self.user_licenses_collection = db.user_licenses
        self.billing_config_collection = db.tenant_billing_config
        self.license_catalog_collection = db.license_catalog
        self._audit_service = None
    
    async def _get_audit_service(self):
        """Lazy load audit service"""
        if self._audit_service is None:
            from .audit_log_service import get_audit_log_service
            self._audit_service = get_audit_log_service(self.db)
        return self._audit_service
    
    async def _log_audit(
        self,
        action: str,
        actor_id: str,
        actor_email: str,
        tenant_id: str = None,
        target_id: str = None,
        target_type: str = None,
        old_value: Dict = None,
        new_value: Dict = None,
        details: Dict = None
    ):
        """Log audit event"""
        try:
            audit_service = await self._get_audit_service()
            await audit_service.log_action(
                action=action,
                actor_id=actor_id,
                actor_email=actor_email,
                tenant_id=tenant_id,
                target_id=target_id,
                target_type=target_type or "tenant_license",
                old_value=old_value,
                new_value=new_value,
                details=details
            )
        except Exception as e:
            logger.error(f"Failed to log audit event: {e}")
    
    # =========================================================================
    # TENANT LICENSE (SEAT POOL) MANAGEMENT
    # =========================================================================
    
    async def provision_licenses_for_plan(
        self,
        tenant_id: str,
        plan: str,
        actor_id: str = None,
        actor_email: str = None,
        admin_user_id: str = None
    ) -> List[Dict[str, Any]]:
        """
        Provision licenses for a tenant based on their plan.
        
        Reads `included_licenses` from the plan document in DB (single source of truth).
        Always ensures CRM_CORE_SEAT is provisioned.
        Falls back to CRM_CORE_SEAT-only if plan has no included_licenses defined.
        
        On upgrade: updates seat count for existing licenses, creates new ones.
        If admin_user_id is provided, auto-assigns 1 seat per license to the admin.
        
        Args:
            tenant_id: Tenant ID
            plan: Plan api_name
            actor_id: ID of admin performing the action
            actor_email: Email of admin
            admin_user_id: If provided, auto-assign licenses to this admin user
        
        Returns:
            List of created/updated tenant licenses
        """
        # Fetch plan from DB (single source of truth)
        plan_doc = await self.db.plans.find_one({"api_name": plan}, {"_id": 0})
        
        if plan_doc and plan_doc.get("included_licenses"):
            plan_licenses = plan_doc["included_licenses"]
        else:
            # Fallback: only provision base CRM license
            seat_limit = plan_doc.get("seat_limit", 5) if plan_doc else 5
            plan_licenses = [{"license_code": "CRM_CORE_SEAT", "seats": seat_limit}]
            logger.warning(
                f"Plan '{plan}' has no included_licenses defined — "
                f"provisioning CRM_CORE_SEAT only with {seat_limit} seats"
            )
        
        # For non-CRM plans (e.g., docflow_only), do NOT force CRM_CORE_SEAT
        # Only add CRM_CORE_SEAT for plans that include CRM modules
        plan_modules = plan_doc.get("enabled_modules", []) if plan_doc else []
        has_crm = "crm" in plan_modules
        crm_codes = [lc["license_code"] for lc in plan_licenses]
        if has_crm and "CRM_CORE_SEAT" not in crm_codes:
            seat_limit = plan_doc.get("seat_limit", 5) if plan_doc else 5
            plan_licenses.insert(0, {"license_code": "CRM_CORE_SEAT", "seats": seat_limit})
        
        provisioned = []
        
        for license_config in plan_licenses:
            try:
                license_code = license_config["license_code"]
                seats = license_config["seats"]
                
                # Get license from catalog
                license_entry = await self.license_catalog_collection.find_one(
                    {"license_code": license_code},
                    {"_id": 0}
                )
                
                if not license_entry:
                    logger.warning(f"License {license_code} not found in catalog, skipping")
                    continue
                
                # Check if tenant already has this license (upgrade scenario)
                existing = await self.tenant_licenses_collection.find_one({
                    "tenant_id": tenant_id,
                    "license_id": license_entry["id"]
                })
                
                now = datetime.now(timezone.utc)
                
                if existing:
                    # UPDATE existing license — expand seat count if new plan gives more
                    update_fields = {"updated_at": now, "status": "active"}
                    if seats > existing.get("seats_purchased", 0):
                        update_fields["seats_purchased"] = seats
                    
                    await self.tenant_licenses_collection.update_one(
                        {"tenant_id": tenant_id, "license_id": license_entry["id"]},
                        {"$set": update_fields}
                    )
                    
                    existing.pop("_id", None)
                    existing.update(update_fields)
                    provisioned.append(await self._enrich_tenant_license(existing))
                    logger.info(f"Updated existing license {license_code} for tenant {tenant_id} (seats: {seats})")
                else:
                    # CREATE new license
                    tenant_license = await self.add_tenant_license(
                        tenant_id=tenant_id,
                        license_id=license_entry["id"],
                        seats_purchased=seats,
                        actor_id=actor_id,
                        actor_email=actor_email
                    )
                    provisioned.append(tenant_license)
                
            except Exception as e:
                logger.error(f"Failed to provision license {license_config['license_code']} for tenant {tenant_id}: {e}")
        
        # Auto-assign 1 seat per license to the admin user
        if admin_user_id:
            await self._auto_assign_admin_seats(tenant_id, admin_user_id, actor_id, actor_email)
        
        logger.info(f"Provisioned {len(provisioned)} licenses for tenant {tenant_id} on plan {plan}")
        return provisioned
    
    async def _auto_assign_admin_seats(
        self,
        tenant_id: str,
        admin_user_id: str,
        actor_id: str = None,
        actor_email: str = None
    ):
        """
        Auto-assign 1 seat per tenant license to the admin user.
        Skips licenses the admin already has.
        """
        tenant_licenses = await self.tenant_licenses_collection.find(
            {"tenant_id": tenant_id, "status": "active"},
            {"_id": 0}
        ).to_list(50)
        
        assigned_count = 0
        for tl in tenant_licenses:
            try:
                license_code = tl.get("license_code")
                
                # Check if admin already has this license by license_code (consistent check)
                existing_user_license = await self.user_licenses_collection.find_one({
                    "user_id": admin_user_id,
                    "tenant_id": tenant_id,
                    "license_code": license_code,
                    "status": "active"
                })
                
                if existing_user_license:
                    continue  # Admin already has this seat
                
                # Check seat availability
                enriched = await self._enrich_tenant_license(tl)
                if enriched.get("seats_available", 0) <= 0:
                    logger.warning(f"No seats available for {tl['license_code']} — skipping admin auto-assign")
                    continue
                
                # Assign seat to admin
                now = datetime.now(timezone.utc)
                user_license = {
                    "id": str(uuid.uuid4()),
                    "user_id": admin_user_id,
                    "tenant_id": tenant_id,
                    "license_id": tl["license_id"],
                    "license_code": tl["license_code"],
                    "status": "active",
                    "assigned_at": now,
                    "assigned_by": actor_id or "system",
                    "created_at": now
                }
                await self.user_licenses_collection.insert_one(user_license)
                user_license.pop("_id", None)
                assigned_count += 1
                
            except Exception as e:
                logger.error(f"Failed to auto-assign {tl.get('license_code')} to admin {admin_user_id}: {e}")
        
        if assigned_count > 0:
            logger.info(f"Auto-assigned {assigned_count} license seats to admin {admin_user_id} for tenant {tenant_id}")
    
    async def add_tenant_license(
        self,
        tenant_id: str,
        license_id: str,
        seats_purchased: int = 1,
        override_price: float = None,
        billing_start_date: datetime = None,
        billing_end_date: datetime = None,
        renewal_type: str = "auto_renew",
        status: str = "active",
        actor_id: str = None,
        actor_email: str = None
    ) -> Dict[str, Any]:
        """
        Add a license to a tenant's subscription
        
        Args:
            tenant_id: Tenant ID
            license_id: License catalog ID
            seats_purchased: Number of seats
            override_price: Tenant-specific price override
            billing_start_date: Start of billing period
            billing_end_date: End of billing period
            renewal_type: auto_renew, manual, or none
            status: active, expired, cancelled, suspended, trial
            actor_id: ID of admin
            actor_email: Email of admin
        
        Returns:
            Created tenant license
        """
        # Get license from catalog
        license_entry = await self.license_catalog_collection.find_one(
            {"id": license_id},
            {"_id": 0}
        )
        
        if not license_entry:
            raise ValueError(f"License '{license_id}' not found in catalog")
        
        # Check if tenant already has this license
        existing = await self.tenant_licenses_collection.find_one({
            "tenant_id": tenant_id,
            "license_id": license_id
        })
        
        if existing:
            raise ValueError(f"Tenant already has license '{license_entry['license_code']}'")
        
        now = datetime.now(timezone.utc)
        
        tenant_license = {
            "id": str(uuid.uuid4()),
            "tenant_id": tenant_id,
            "license_id": license_id,
            "license_code": license_entry["license_code"],
            "seats_purchased": seats_purchased,
            "default_price_snapshot": license_entry["default_price"],
            "override_price": override_price,
            "billing_start_date": billing_start_date or now,
            "billing_end_date": billing_end_date,
            "renewal_type": renewal_type,
            "payment_link_ref": None,
            "status": status,
            "notes": None,
            "created_at": now,
            "updated_at": now
        }
        
        await self.tenant_licenses_collection.insert_one(tenant_license)
        tenant_license.pop("_id", None)
        
        # Audit log
        await self._log_audit(
            action="tenant_license_added",
            actor_id=actor_id,
            actor_email=actor_email,
            tenant_id=tenant_id,
            target_id=tenant_license["id"],
            new_value=tenant_license,
            details={
                "license_code": license_entry["license_code"],
                "seats_purchased": seats_purchased
            }
        )
        
        logger.info(f"Added license {license_entry['license_code']} ({seats_purchased} seats) to tenant {tenant_id}")
        return await self._enrich_tenant_license(tenant_license)
    
    async def get_tenant_license(self, tenant_license_id: str) -> Optional[Dict[str, Any]]:
        """Get a tenant license by ID"""
        license_entry = await self.tenant_licenses_collection.find_one(
            {"id": tenant_license_id},
            {"_id": 0}
        )
        if license_entry:
            return await self._enrich_tenant_license(license_entry)
        return None
    
    async def get_tenant_licenses(
        self,
        tenant_id: str,
        active_only: bool = False
    ) -> List[Dict[str, Any]]:
        """
        Get all licenses for a tenant
        
        Args:
            tenant_id: Tenant ID
            active_only: Filter to active licenses only
        
        Returns:
            List of tenant licenses with seat usage
        """
        query = {"tenant_id": tenant_id}
        if active_only:
            query["status"] = "active"
        
        cursor = self.tenant_licenses_collection.find(query, {"_id": 0})
        licenses = await cursor.to_list(length=100)
        
        # Enrich with catalog info and seat usage
        enriched = []
        for lic in licenses:
            enriched.append(await self._enrich_tenant_license(lic))
        
        return enriched
    
    async def _enrich_tenant_license(self, tenant_license: Dict[str, Any]) -> Dict[str, Any]:
        """Enrich tenant license with catalog info and seat counts"""
        # Get catalog info
        catalog = await self.license_catalog_collection.find_one(
            {"id": tenant_license["license_id"]},
            {"_id": 0}
        )
        
        if catalog:
            tenant_license["license_name"] = catalog.get("license_name")
            tenant_license["module_key"] = catalog.get("module_key")
        
        # Count assigned seats
        seats_assigned = await self.user_licenses_collection.count_documents({
            "tenant_id": tenant_license["tenant_id"],
            "license_id": tenant_license["license_id"],
            "status": "active"
        })
        
        tenant_license["seats_assigned"] = seats_assigned
        tenant_license["seats_available"] = max(0, tenant_license["seats_purchased"] - seats_assigned)
        
        # Calculate final price
        if tenant_license.get("override_price") is not None:
            tenant_license["final_price"] = tenant_license["override_price"]
        else:
            tenant_license["final_price"] = tenant_license.get("default_price_snapshot", 0)
        
        return tenant_license
    
    async def update_tenant_license(
        self,
        tenant_license_id: str,
        update_data: Dict[str, Any],
        actor_id: str = None,
        actor_email: str = None
    ) -> Optional[Dict[str, Any]]:
        """
        Update a tenant license
        
        Args:
            tenant_license_id: Tenant license ID
            update_data: Fields to update
            actor_id: ID of admin
            actor_email: Email of admin
        
        Returns:
            Updated tenant license
        """
        current = await self.get_tenant_license(tenant_license_id)
        if not current:
            return None
        
        # Validate seats_purchased isn't less than seats_assigned
        if "seats_purchased" in update_data:
            if update_data["seats_purchased"] < current["seats_assigned"]:
                raise ValueError(
                    f"Cannot reduce seats below {current['seats_assigned']} (currently assigned). "
                    f"Revoke user licenses first."
                )
        
        # Remove None values and computed fields
        computed_fields = {"seats_assigned", "seats_available", "final_price", "license_name", "module_key"}
        update_data = {k: v for k, v in update_data.items() if v is not None and k not in computed_fields}
        update_data["updated_at"] = datetime.now(timezone.utc)
        
        await self.tenant_licenses_collection.update_one(
            {"id": tenant_license_id},
            {"$set": update_data}
        )
        
        updated = await self.get_tenant_license(tenant_license_id)
        
        # Audit log
        await self._log_audit(
            action="tenant_license_updated",
            actor_id=actor_id,
            actor_email=actor_email,
            tenant_id=current["tenant_id"],
            target_id=tenant_license_id,
            old_value=current,
            new_value=updated,
            details={"changes": list(update_data.keys())}
        )
        
        logger.info(f"Updated tenant license {tenant_license_id}")
        return updated
    
    async def remove_tenant_license(
        self,
        tenant_license_id: str,
        actor_id: str = None,
        actor_email: str = None
    ) -> bool:
        """
        Remove a license from a tenant
        Note: Will fail if any users have this license assigned
        
        Args:
            tenant_license_id: Tenant license ID
            actor_id: ID of admin
            actor_email: Email of admin
        
        Returns:
            True if removed
        """
        current = await self.get_tenant_license(tenant_license_id)
        if not current:
            return False
        
        # Check if any users have this license
        if current["seats_assigned"] > 0:
            raise ValueError(
                f"Cannot remove license - {current['seats_assigned']} user(s) have it assigned. "
                f"Revoke user licenses first."
            )
        
        await self.tenant_licenses_collection.delete_one({"id": tenant_license_id})
        
        # Audit log
        await self._log_audit(
            action="tenant_license_removed",
            actor_id=actor_id,
            actor_email=actor_email,
            tenant_id=current["tenant_id"],
            target_id=tenant_license_id,
            old_value=current,
            details={"license_code": current["license_code"]}
        )
        
        logger.info(f"Removed tenant license {tenant_license_id}")
        return True
    
    async def check_seat_availability(
        self,
        tenant_id: str,
        license_id: str
    ) -> Dict[str, Any]:
        """
        Check if a seat is available for assignment
        
        Args:
            tenant_id: Tenant ID
            license_id: License catalog ID
        
        Returns:
            Availability status with details
        """
        # Get tenant license
        tenant_license = await self.tenant_licenses_collection.find_one({
            "tenant_id": tenant_id,
            "license_id": license_id
        }, {"_id": 0})
        
        if not tenant_license:
            return {
                "available": False,
                "seats_purchased": 0,
                "seats_assigned": 0,
                "seats_available": 0,
                "message": "Tenant does not have this license"
            }
        
        enriched = await self._enrich_tenant_license(tenant_license)
        
        # Check dependencies
        catalog = await self.license_catalog_collection.find_one(
            {"id": license_id},
            {"_id": 0}
        )
        
        dependency_check = {}
        if catalog and catalog.get("dependencies"):
            for dep_code in catalog["dependencies"]:
                dep_license = await self.tenant_licenses_collection.find_one({
                    "tenant_id": tenant_id,
                    "license_code": dep_code,
                    "status": "active"
                })
                dependency_check[dep_code] = dep_license is not None
        
        is_available = enriched["seats_available"] > 0 and enriched["status"] == "active"
        
        # Check if all dependencies are met
        if dependency_check and not all(dependency_check.values()):
            is_available = False
            missing_deps = [k for k, v in dependency_check.items() if not v]
            message = f"Missing required licenses: {', '.join(missing_deps)}"
        elif enriched["status"] != "active":
            message = f"License is {enriched['status']}"
        elif enriched["seats_available"] <= 0:
            message = "No seats available"
        else:
            message = "Seat available"
        
        return {
            "available": is_available,
            "seats_purchased": enriched["seats_purchased"],
            "seats_assigned": enriched["seats_assigned"],
            "seats_available": enriched["seats_available"],
            "message": message,
            "dependency_check": dependency_check if dependency_check else None
        }
    
    # =========================================================================
    # USER LICENSE MANAGEMENT (CRM calls these)
    # =========================================================================
    
    async def assign_user_license(
        self,
        user_id: str,
        tenant_id: str,
        license_id: str,
        expires_at: datetime = None,
        assigned_by: str = None,
        actor_email: str = None
    ) -> Dict[str, Any]:
        """
        Assign a license to a user (consumes a seat)
        Called by CRM when assigning licenses to users
        
        Args:
            user_id: User ID
            tenant_id: Tenant ID
            license_id: License catalog ID
            expires_at: Optional expiration date
            assigned_by: User ID who assigned this
            actor_email: Email for audit
        
        Returns:
            User license entry
        """
        # Check seat availability
        availability = await self.check_seat_availability(tenant_id, license_id)
        if not availability["available"]:
            raise ValueError(availability["message"])
        
        # Check if user already has this license
        existing = await self.user_licenses_collection.find_one({
            "user_id": user_id,
            "tenant_id": tenant_id,
            "license_id": license_id,
            "status": "active"
        })
        
        if existing:
            raise ValueError("User already has this license assigned")
        
        # Get license info
        catalog = await self.license_catalog_collection.find_one(
            {"id": license_id},
            {"_id": 0}
        )
        
        if not catalog:
            raise ValueError("License not found in catalog")
        
        # Check dependencies - user must have all dependency licenses
        if catalog.get("dependencies"):
            for dep_code in catalog["dependencies"]:
                # Check if user has the dependency license by license_code
                user_has_dep = await self.user_licenses_collection.find_one({
                    "user_id": user_id,
                    "tenant_id": tenant_id,
                    "license_code": dep_code,
                    "status": "active"
                })
                if not user_has_dep:
                    raise ValueError(f"User must have '{dep_code}' license first")
        
        now = datetime.now(timezone.utc)
        
        user_license = {
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "tenant_id": tenant_id,
            "license_id": license_id,
            "license_code": catalog["license_code"],
            "assigned_at": now,
            "assigned_by": assigned_by,
            "expires_at": expires_at,
            "status": "active",
            "created_at": now
        }
        
        await self.user_licenses_collection.insert_one(user_license)
        user_license.pop("_id", None)
        
        # Enrich response
        user_license["license_name"] = catalog.get("license_name")
        user_license["module_key"] = catalog.get("module_key")
        
        # Audit log
        await self._log_audit(
            action="user_license_assigned",
            actor_id=assigned_by,
            actor_email=actor_email or "unknown",
            tenant_id=tenant_id,
            target_id=user_license["id"],
            target_type="user_license",
            new_value=user_license,
            details={"user_id": user_id, "license_code": catalog["license_code"]}
        )
        
        logger.info(f"Assigned license {catalog['license_code']} to user {user_id}")
        return user_license
    
    async def revoke_user_license(
        self,
        user_license_id: str,
        revoked_by: str = None,
        actor_email: str = None
    ) -> bool:
        """
        Revoke a license from a user (frees a seat)
        
        Args:
            user_license_id: User license ID
            revoked_by: User ID who revoked this
            actor_email: Email for audit
        
        Returns:
            True if revoked
        """
        current = await self.user_licenses_collection.find_one(
            {"id": user_license_id},
            {"_id": 0}
        )
        
        if not current:
            return False
        
        # Check if any dependent licenses exist for this user
        dependent_licenses = await self.license_catalog_collection.find(
            {"dependencies": current["license_code"]},
            {"_id": 0}
        ).to_list(length=100)
        
        for dep_license in dependent_licenses:
            user_has = await self.user_licenses_collection.find_one({
                "user_id": current["user_id"],
                "tenant_id": current["tenant_id"],
                "license_code": dep_license["license_code"],
                "status": "active"
            })
            if user_has:
                raise ValueError(
                    f"Cannot revoke - user has dependent license '{dep_license['license_code']}'. "
                    f"Revoke that first."
                )
        
        # Mark as revoked
        await self.user_licenses_collection.update_one(
            {"id": user_license_id},
            {"$set": {"status": "revoked", "revoked_at": datetime.now(timezone.utc), "revoked_by": revoked_by}}
        )
        
        # Audit log
        await self._log_audit(
            action="user_license_revoked",
            actor_id=revoked_by,
            actor_email=actor_email or "unknown",
            tenant_id=current["tenant_id"],
            target_id=user_license_id,
            target_type="user_license",
            old_value=current,
            details={"user_id": current["user_id"], "license_code": current["license_code"]}
        )
        
        logger.info(f"Revoked license {current['license_code']} from user {current['user_id']}")
        return True
    
    async def get_user_licenses(self, user_id: str, tenant_id: str) -> List[Dict[str, Any]]:
        """
        Get all licenses for a user
        
        Args:
            user_id: User ID
            tenant_id: Tenant ID
        
        Returns:
            List of user licenses
        """
        cursor = self.user_licenses_collection.find({
            "user_id": user_id,
            "tenant_id": tenant_id,
            "status": "active"
        }, {"_id": 0})
        
        licenses = await cursor.to_list(length=100)
        
        # Enrich with catalog info
        for lic in licenses:
            catalog = await self.license_catalog_collection.find_one(
                {"id": lic["license_id"]},
                {"_id": 0}
            )
            if catalog:
                lic["license_name"] = catalog.get("license_name")
                lic["module_key"] = catalog.get("module_key")
        
        return licenses
    
    async def user_has_license(self, user_id: str, tenant_id: str, license_code: str) -> bool:
        """
        Check if a user has a specific license
        
        Args:
            user_id: User ID
            tenant_id: Tenant ID
            license_code: License code to check
        
        Returns:
            True if user has the license
        """
        exists = await self.user_licenses_collection.find_one({
            "user_id": user_id,
            "tenant_id": tenant_id,
            "license_code": license_code,
            "status": "active"
        })
        return exists is not None
    
    # =========================================================================
    # BILLING CONFIGURATION
    # =========================================================================
    
    async def get_billing_config(self, tenant_id: str) -> Optional[Dict[str, Any]]:
        """Get billing configuration for a tenant"""
        config = await self.billing_config_collection.find_one(
            {"tenant_id": tenant_id},
            {"_id": 0}
        )
        
        if config:
            # Calculate totals
            licenses = await self.get_tenant_licenses(tenant_id, active_only=True)
            monthly_total = 0
            yearly_total = 0
            
            for lic in licenses:
                price = lic.get("final_price", 0)
                seats = lic.get("seats_purchased", 0)
                monthly_total += price * seats
                yearly_total += price * seats * 12
            
            config["total_monthly_cost"] = round(monthly_total, 2)
            config["total_yearly_cost"] = round(yearly_total, 2)
        
        return config
    
    async def create_billing_config(
        self,
        tenant_id: str,
        config_data: Dict[str, Any],
        actor_id: str = None,
        actor_email: str = None
    ) -> Dict[str, Any]:
        """
        Create billing configuration for a tenant
        
        Args:
            tenant_id: Tenant ID
            config_data: Billing configuration
            actor_id: ID of admin
            actor_email: Email of admin
        
        Returns:
            Created billing config
        """
        existing = await self.billing_config_collection.find_one({"tenant_id": tenant_id})
        if existing:
            raise ValueError("Billing configuration already exists for this tenant")
        
        now = datetime.now(timezone.utc)
        
        billing_config = {
            "id": str(uuid.uuid4()),
            "tenant_id": tenant_id,
            "billing_contact_email": config_data.get("billing_contact_email"),
            "billing_contact_name": config_data.get("billing_contact_name"),
            "currency": config_data.get("currency", "USD"),
            "tax_mode": config_data.get("tax_mode", "none"),
            "payment_provider": config_data.get("payment_provider"),
            "payment_link": config_data.get("payment_link"),
            "invoice_prefix": config_data.get("invoice_prefix"),
            "auto_generate_invoice": config_data.get("auto_generate_invoice", False),
            "notes": config_data.get("notes"),
            "created_at": now,
            "updated_at": now
        }
        
        await self.billing_config_collection.insert_one(billing_config)
        billing_config.pop("_id", None)
        
        # Audit log
        await self._log_audit(
            action="billing_config_created",
            actor_id=actor_id,
            actor_email=actor_email,
            tenant_id=tenant_id,
            target_id=billing_config["id"],
            target_type="tenant_billing",
            new_value=billing_config
        )
        
        return await self.get_billing_config(tenant_id)
    
    async def update_billing_config(
        self,
        tenant_id: str,
        update_data: Dict[str, Any],
        actor_id: str = None,
        actor_email: str = None
    ) -> Optional[Dict[str, Any]]:
        """
        Update billing configuration
        
        Args:
            tenant_id: Tenant ID
            update_data: Fields to update
            actor_id: ID of admin
            actor_email: Email of admin
        
        Returns:
            Updated billing config
        """
        current = await self.get_billing_config(tenant_id)
        if not current:
            # Create if doesn't exist
            return await self.create_billing_config(tenant_id, update_data, actor_id, actor_email)
        
        # Remove None values and computed fields
        computed_fields = {"total_monthly_cost", "total_yearly_cost"}
        update_data = {k: v for k, v in update_data.items() if v is not None and k not in computed_fields}
        update_data["updated_at"] = datetime.now(timezone.utc)
        
        await self.billing_config_collection.update_one(
            {"tenant_id": tenant_id},
            {"$set": update_data}
        )
        
        updated = await self.get_billing_config(tenant_id)
        
        # Audit log
        await self._log_audit(
            action="billing_config_updated",
            actor_id=actor_id,
            actor_email=actor_email,
            tenant_id=tenant_id,
            target_id=current["id"],
            target_type="tenant_billing",
            old_value=current,
            new_value=updated,
            details={"changes": list(update_data.keys())}
        )
        
        return updated
    
    # =========================================================================
    # BILLING SUMMARY
    # =========================================================================
    
    async def get_tenant_billing_summary(self, tenant_id: str) -> Dict[str, Any]:
        """
        Get complete billing summary for a tenant
        
        Args:
            tenant_id: Tenant ID
        
        Returns:
            Billing summary with licenses and totals
        """
        licenses = await self.get_tenant_licenses(tenant_id, active_only=True)
        billing_config = await self.get_billing_config(tenant_id)
        
        # Calculate totals by billing frequency
        monthly_breakdown = []
        yearly_breakdown = []
        
        for lic in licenses:
            item = {
                "license_code": lic["license_code"],
                "license_name": lic.get("license_name"),
                "seats": lic["seats_purchased"],
                "price_per_seat": lic["final_price"],
                "total": lic["final_price"] * lic["seats_purchased"]
            }
            
            # Assume monthly for now (could be extended based on billing_frequency in catalog)
            monthly_breakdown.append(item)
        
        monthly_total = sum(item["total"] for item in monthly_breakdown)
        yearly_total = monthly_total * 12
        
        return {
            "tenant_id": tenant_id,
            "currency": billing_config.get("currency", "USD") if billing_config else "USD",
            "licenses": licenses,
            "monthly_breakdown": monthly_breakdown,
            "monthly_total": round(monthly_total, 2),
            "yearly_total": round(yearly_total, 2),
            "billing_config": billing_config,
            "seats_summary": {
                "total_purchased": sum(lic["seats_purchased"] for lic in licenses),
                "total_assigned": sum(lic["seats_assigned"] for lic in licenses),
                "total_available": sum(lic["seats_available"] for lic in licenses)
            }
        }


# Singleton instance
_tenant_license_service = None

def get_tenant_license_service(db: AsyncIOMotorDatabase) -> TenantLicenseService:
    """Get or create the tenant license service instance"""
    global _tenant_license_service
    if _tenant_license_service is None:
        _tenant_license_service = TenantLicenseService(db)
    return _tenant_license_service
