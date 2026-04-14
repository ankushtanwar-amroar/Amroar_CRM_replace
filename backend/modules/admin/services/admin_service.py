"""
Admin Service - Business logic for Admin Portal
"""
import os
import jwt
import bcrypt
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any, List
from motor.motor_asyncio import AsyncIOMotorDatabase
import uuid
import logging

logger = logging.getLogger(__name__)

JWT_SECRET = os.environ.get('JWT_SECRET', 'your-secret-key-here-change-in-production')
ALGORITHM = "HS256"
ADMIN_TOKEN_EXPIRE_HOURS = 24

# Complete module list from Module Registry
ALL_MODULES = [
    "crm", "sales_console", "task_manager", "schema_builder", "app_manager",
    "form_builder", "flow_builder", "import_builder", "export_builder", "file_manager",
    "survey_builder", "email_templates", "booking", "chatbot_manager", "ai_features",
    "docflow", "field_service", "reporting", "features", "connections"
]

# Minimal fallback entitlements when a plan is not found in the DB.
# This should only be hit during initial setup before plans are seeded.
_FALLBACK_ENTITLEMENTS = ["crm", "task_manager"]
_FALLBACK_SEAT_LIMIT = 5
_FALLBACK_STORAGE_LIMIT = 512


class AdminService:
    """Service class for admin operations"""
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self._audit_service = None
    
    async def _get_audit_service(self):
        """Lazy load audit service to avoid circular imports"""
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
        details: dict = None,
        ip_address: str = None
    ):
        """Helper to log audit events"""
        try:
            audit_service = await self._get_audit_service()
            await audit_service.log_action(
                action=action,
                actor_id=actor_id,
                actor_email=actor_email,
                tenant_id=tenant_id,
                target_id=target_id,
                target_type=target_type,
                details=details,
                ip_address=ip_address
            )
        except Exception as e:
            logger.warning(f"Failed to log audit event: {e}")
    
    async def _get_plan_config(self, plan_api_name: str) -> Dict[str, Any]:
        """
        Fetch plan configuration from the DB (single source of truth).
        Returns dict with keys: enabled_modules, seat_limit, storage_limit_mb.
        Falls back to minimal defaults only if the plan doesn't exist in DB yet.
        """
        plan_doc = await self.db.plans.find_one({"api_name": plan_api_name}, {"_id": 0})
        if plan_doc:
            return {
                "enabled_modules": plan_doc.get("enabled_modules", _FALLBACK_ENTITLEMENTS),
                "seat_limit": plan_doc.get("seat_limit", _FALLBACK_SEAT_LIMIT),
                "storage_limit_mb": plan_doc.get("storage_limit_mb", _FALLBACK_STORAGE_LIMIT),
            }
        logger.warning(f"Plan '{plan_api_name}' not found in DB — using minimal fallback. Seed plans if this is unexpected.")
        return {
            "enabled_modules": list(_FALLBACK_ENTITLEMENTS),
            "seat_limit": _FALLBACK_SEAT_LIMIT,
            "storage_limit_mb": _FALLBACK_STORAGE_LIMIT,
        }
    
    async def authenticate_admin(self, email: str, password: str, ip_address: str = None) -> Optional[Dict[str, Any]]:
        """
        Authenticate admin user for Admin Portal access.
        Allows users with platform_admin role or SUPER_ADMIN (legacy).
        """
        user = await self.db.users.find_one(
            {"email": email.lower()},
            {"_id": 0}
        )
        
        if not user:
            logger.warning(f"Admin login attempt failed: user not found - {email}")
            # Log failed attempt
            await self._log_audit(
                action="admin_login_failed",
                actor_id="unknown",
                actor_email=email,
                details={"reason": "User not found"},
                ip_address=ip_address
            )
            return None
        
        # Verify password
        if not bcrypt.checkpw(password.encode('utf-8'), user.get('password', '').encode('utf-8')):
            logger.warning(f"Admin login attempt failed: invalid password - {email}")
            await self._log_audit(
                action="admin_login_failed",
                actor_id=user.get("id", "unknown"),
                actor_email=email,
                details={"reason": "Invalid password"},
                ip_address=ip_address
            )
            return None
        
        # Check if user has admin portal access (platform_admin, SUPER_ADMIN, or is_admin_portal_user flag)
        user_role = user.get('role', '')
        is_admin = user_role in ['SUPER_ADMIN', 'platform_admin'] or user.get('is_admin_portal_user', False)
        
        if not is_admin:
            logger.warning(f"Admin login attempt failed: insufficient privileges - {email} has role {user_role}")
            await self._log_audit(
                action="admin_login_failed",
                actor_id=user.get("id", "unknown"),
                actor_email=email,
                details={"reason": "Insufficient privileges", "user_role": user_role},
                ip_address=ip_address
            )
            return None
        
        # Check if user is active
        if not user.get('is_active', True):
            logger.warning(f"Admin login attempt failed: account inactive - {email}")
            await self._log_audit(
                action="admin_login_failed",
                actor_id=user.get("id", "unknown"),
                actor_email=email,
                details={"reason": "Account inactive"},
                ip_address=ip_address
            )
            return None
        
        # Generate admin token
        token_data = {
            "user_id": user["id"],
            "tenant_id": user.get("tenant_id", "system"),
            "email": user["email"],
            "role": "platform_admin",
            "is_admin_token": True,
            "exp": datetime.now(timezone.utc) + timedelta(hours=ADMIN_TOKEN_EXPIRE_HOURS)
        }
        
        access_token = jwt.encode(token_data, JWT_SECRET, algorithm=ALGORITHM)
        
        # Update last login
        await self.db.users.update_one(
            {"id": user["id"]},
            {"$set": {"last_login": datetime.now(timezone.utc)}}
        )
        
        # Log successful login
        await self._log_audit(
            action="admin_login",
            actor_id=user["id"],
            actor_email=user["email"],
            details={"login_method": "password"},
            ip_address=ip_address
        )
        
        return {
            "access_token": access_token,
            "token_type": "bearer",
            "user": {
                "id": user["id"],
                "email": user["email"],
                "first_name": user.get("first_name", ""),
                "last_name": user.get("last_name", ""),
                "role": "platform_admin"
            },
            "message": "Admin login successful"
        }
    
    async def verify_admin_token(self, token: str) -> Optional[Dict[str, Any]]:
        """Verify admin JWT token for Admin Portal access"""
        try:
            payload = jwt.decode(token, JWT_SECRET, algorithms=[ALGORITHM])
            
            # Verify this is an admin token
            if not payload.get("is_admin_token"):
                return None
            
            # Accept both legacy SUPER_ADMIN and new platform_admin roles
            if payload.get("role") not in ["SUPER_ADMIN", "platform_admin"]:
                return None
            
            user_id = payload.get("user_id")
            user = await self.db.users.find_one(
                {"id": user_id},
                {"_id": 0, "password": 0}
            )
            
            if not user or not user.get("is_active", True):
                return None
            
            # Verify user still has admin access
            user_role = user.get('role', '')
            is_admin = user_role in ['SUPER_ADMIN', 'platform_admin'] or user.get('is_admin_portal_user', False)
            
            if not is_admin:
                return None
            
            return user
        except jwt.ExpiredSignatureError:
            logger.warning("Admin token expired")
            return None
        except jwt.PyJWTError as e:
            logger.warning(f"Admin token verification failed: {e}")
            return None
    
    async def get_all_tenants(
        self, 
        skip: int = 0, 
        limit: int = 50, 
        search: Optional[str] = None,
        status_filter: Optional[str] = None,
        plan_filter: Optional[str] = None
    ) -> Dict[str, Any]:
        """Get all tenants with pagination and filters"""
        query = {"is_deleted": {"$ne": True}}
        
        if search:
            query["$or"] = [
                {"tenant_name": {"$regex": search, "$options": "i"}},
                {"organization_name": {"$regex": search, "$options": "i"}},
                {"company_name": {"$regex": search, "$options": "i"}}  # Backward compatibility
            ]
        
        if status_filter:
            query["status"] = status_filter
        
        if plan_filter:
            query["$or"] = query.get("$or", []) + [
                {"plan": plan_filter},
                {"subscription_plan": plan_filter}  # Backward compatibility
            ]
            if "$or" in query and not search:
                # Only use plan filter if no search
                query.pop("$or")
                query["$or"] = [
                    {"plan": plan_filter},
                    {"subscription_plan": plan_filter}
                ]
        
        total = await self.db.tenants.count_documents(query)
        
        tenants_cursor = self.db.tenants.find(query, {"_id": 0}).skip(skip).limit(limit).sort("created_at", -1)
        tenants = await tenants_cursor.to_list(length=limit)
        
        # Enrich with user counts and storage usage
        enriched_tenants = []
        for tenant in tenants:
            tenant_id = tenant.get("id")
            user_count = await self.db.users.count_documents({"tenant_id": tenant_id})
            
            # Calculate storage (simplified - count records)
            record_count = await self.db.object_records.count_documents({"tenant_id": tenant_id})
            estimated_storage = record_count * 0.001  # ~1KB per record estimate
            
            # Normalize field names for backward compatibility
            enriched_tenants.append({
                "id": tenant.get("id"),
                "tenant_name": tenant.get("tenant_name") or tenant.get("company_name", "Unknown"),
                "organization_name": tenant.get("organization_name") or tenant.get("company_name", "Unknown"),
                "industry": tenant.get("industry"),
                "region": tenant.get("region"),
                "status": tenant.get("status", "active"),
                "plan": tenant.get("plan") or tenant.get("subscription_plan", "free"),
                "seat_limit": tenant.get("seat_limit") or tenant.get("max_users", 10),
                "max_storage_mb": tenant.get("max_storage_mb", 1024),
                "current_users": user_count,
                "current_storage_mb": round(estimated_storage, 2),
                "created_at": tenant.get("created_at"),
                "updated_at": tenant.get("updated_at"),
                "last_activity": tenant.get("last_activity"),
                "is_deleted": tenant.get("is_deleted", False)
            })
        
        return {
            "tenants": enriched_tenants,
            "total": total,
            "skip": skip,
            "limit": limit
        }
    
    async def get_tenant_by_id(self, tenant_id: str) -> Optional[Dict[str, Any]]:
        """Get a single tenant by ID with full details"""
        tenant = await self.db.tenants.find_one({"id": tenant_id}, {"_id": 0})
        if not tenant:
            return None
        
        # Enrich with stats
        user_count = await self.db.users.count_documents({"tenant_id": tenant_id})
        record_count = await self.db.object_records.count_documents({"tenant_id": tenant_id})
        object_count = await self.db.object_definitions.count_documents({"tenant_id": tenant_id})
        flow_count = await self.db.flows.count_documents({"tenant_id": tenant_id})
        
        # Get admin user
        admin_user = await self.db.users.find_one(
            {"tenant_id": tenant_id, "role": {"$in": ["admin", "owner"]}},
            {"_id": 0, "password": 0}
        )
        
        # Get users by role breakdown
        users_by_role = {}
        user_roles = await self.db.users.aggregate([
            {"$match": {"tenant_id": tenant_id}},
            {"$group": {"_id": "$role", "count": {"$sum": 1}}}
        ]).to_list(100)
        for role_stat in user_roles:
            users_by_role[role_stat["_id"]] = role_stat["count"]
        
        # Get module entitlements
        plan = tenant.get("plan") or tenant.get("subscription_plan", "free")
        plan_config = await self._get_plan_config(plan)
        module_entitlements = tenant.get("module_entitlements") or plan_config["enabled_modules"]
        
        return {
            "id": tenant.get("id"),
            "tenant_name": tenant.get("tenant_name") or tenant.get("company_name", "Unknown"),
            "organization_name": tenant.get("organization_name") or tenant.get("company_name", "Unknown"),
            "industry": tenant.get("industry"),
            "region": tenant.get("region"),
            "status": tenant.get("status", "active"),
            "plan": plan,
            "seat_limit": tenant.get("seat_limit") or tenant.get("max_users", 10),
            "max_storage_mb": tenant.get("max_storage_mb", 1024),
            "current_users": user_count,
            "current_storage_mb": round(record_count * 0.001, 2),
            "total_records": record_count,
            "total_objects": object_count,
            "total_flows": flow_count,
            "created_at": tenant.get("created_at"),
            "updated_at": tenant.get("updated_at"),
            "last_activity": tenant.get("last_activity"),
            "is_deleted": tenant.get("is_deleted", False),
            "admin_user": admin_user,
            "module_entitlements": module_entitlements,
            "users_summary": users_by_role
        }
    
    async def create_tenant(self, tenant_data: Dict[str, Any], actor_id: str = None, actor_email: str = None) -> Dict[str, Any]:
        """
        Create a new tenant (organization) with the first admin user.
        
        Architecture: Plan → License → Modules
        1. Tenant record with plan-based configuration
        2. Tenant Admin (first user) — NO password, receives verification email
        3. Provisions default licenses based on plan
        4. Assigns licenses to the admin user
        5. Assigns platform version
        6. Enables modules from plan's enabled_modules
        7. Sends verification email so admin can set their own password
        """
        tenant_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc)
        
        # Extract admin details - REQUIRED for new tenants
        admin_email = tenant_data.get("admin_email")
        admin_first_name = (tenant_data.get("admin_first_name") or "").strip()
        admin_last_name = (tenant_data.get("admin_last_name") or "").strip()
        
        # Validate required admin fields
        if not admin_email:
            raise ValueError("Tenant Administrator email is required")
        if not admin_first_name:
            raise ValueError("Tenant Administrator first name is required")
        if not admin_last_name:
            raise ValueError("Tenant Administrator last name is required")
        
        # Check if email already exists
        existing_user = await self.db.users.find_one({"email": admin_email.lower()})
        if existing_user:
            raise ValueError(f"A user with email {admin_email} already exists")
        
        # =====================================================================
        # Plan → License → Module hierarchy
        # Modules are derived from the plan, NOT manually selected
        # =====================================================================
        plan = tenant_data.get("plan", "free")
        plan_config = await self._get_plan_config(plan)
        seat_limit = plan_config["seat_limit"]
        max_storage = plan_config["storage_limit_mb"]
        module_entitlements = plan_config["enabled_modules"]
        
        # Normalize status to uppercase for consistency
        status = (tenant_data.get("status", "ACTIVE") or "ACTIVE").upper()
        
        # Prepare rollback data
        rollback_actions = []
        
        try:
            # =========================================================================
            # STEP 1: Create Tenant Record
            # =========================================================================
            tenant = {
                "id": tenant_id,
                "tenant_name": tenant_data.get("tenant_name") or tenant_data.get("company_name"),
                "organization_name": tenant_data.get("organization_name") or tenant_data.get("tenant_name") or tenant_data.get("company_name"),
                "company_name": tenant_data.get("organization_name") or tenant_data.get("tenant_name"),  # Backward compatibility
                "industry": tenant_data.get("industry"),
                "region": tenant_data.get("region"),
                "status": status,
                "plan": plan,
                "subscription_plan": plan,  # Backward compatibility
                "seat_limit": seat_limit,
                "max_users": seat_limit,  # Backward compatibility
                "max_storage_mb": max_storage,
                "module_entitlements": module_entitlements,
                "is_deleted": False,
                "created_at": now,
                "updated_at": now,
                "last_activity": now
            }
            
            await self.db.tenants.insert_one(tenant)
            rollback_actions.append(("tenant", tenant_id))
            logger.info(f"Created tenant {tenant_id}")
            
            # =========================================================================
            # STEP 2: Create Tenant Admin User — NO password stored
            # Admin will set their password via the verification email link
            # =========================================================================
            admin_user_id = str(uuid.uuid4())
            
            # Generate verification/password-reset token (72 hours expiry)
            reset_token = str(uuid.uuid4())
            reset_token_expires = now + timedelta(hours=72)
            
            admin_user = {
                "id": admin_user_id,
                "tenant_id": tenant_id,
                "email": admin_email.lower(),
                "password": "!VERIFICATION_PENDING",  # No usable password — must verify via email
                "first_name": admin_first_name,
                "last_name": admin_last_name,
                "role": "system_administrator",
                "role_id": "system_administrator",
                "role_name": "System Administrator",
                "is_super_admin": True,
                "is_active": False,  # Inactive until email verification + password set
                "is_admin_portal_user": False,
                "password_reset_token": reset_token,
                "password_reset_expires": reset_token_expires,
                "must_change_password": True,
                "created_at": now,
                "updated_at": now
            }
            
            await self.db.users.insert_one(admin_user)
            rollback_actions.append(("user", admin_user_id))
            logger.info(f"Created tenant admin user {admin_user_id} (pending verification)")
            
            # =========================================================================
            # STEP 3: Provision Tenant Licenses based on plan
            # =========================================================================
            licenses_provisioned = []
            try:
                from .tenant_license_service import get_tenant_license_service
                license_service = get_tenant_license_service(self.db)
                licenses_provisioned = await license_service.provision_licenses_for_plan(
                    tenant_id=tenant_id,
                    plan=plan,
                    actor_id=actor_id,
                    actor_email=actor_email,
                    admin_user_id=admin_user_id
                )
                logger.info(f"Provisioned {len(licenses_provisioned)} licenses for tenant {tenant_id} (admin auto-assigned)")
            except Exception as e:
                logger.warning(f"Failed to provision licenses for tenant {tenant_id}: {e}")
                # Continue - licenses can be added later
            
            # =========================================================================
            # STEP 4: Admin seat assignment handled by provision_licenses_for_plan above
            # =========================================================================
            admin_licenses_assigned = [lp.get("license_code", "") for lp in licenses_provisioned] if licenses_provisioned else []
            
            # =========================================================================
            # STEP 5: Assign Platform Version
            # =========================================================================
            platform_version = None
            try:
                from .platform_release_service import get_platform_release_service
                release_service = get_platform_release_service(self.db)
                
                release_id = tenant_data.get("platform_version_id")
                if not release_id:
                    default_release = await release_service.get_default_release_for_new_tenants()
                    if default_release:
                        release_id = default_release["id"]
                
                if release_id:
                    platform_version = await release_service.assign_tenant_version(
                        tenant_id=tenant_id,
                        release_id=release_id,
                        actor_id=actor_id,
                        actor_email=actor_email
                    )
                    logger.info(f"Assigned platform version to tenant {tenant_id}")
            except Exception as e:
                logger.warning(f"Failed to assign platform version to tenant {tenant_id}: {e}")
            
            # =========================================================================
            # STEP 6: Run Tenant Provisioning (CRM objects, layouts, apps, roles)
            # =========================================================================
            industry = tenant_data.get("industry", "general")
            provisioning_result = await self._provision_tenant(tenant_id, admin_user_id, industry)
            
            # =========================================================================
            # STEP 7: Enable Modules for the Tenant
            # =========================================================================
            try:
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
                                "created_at": now,
                                "updated_at": now
                            }
                        },
                        upsert=True
                    )
                logger.info(f"Enabled {len(module_entitlements)} modules for tenant {tenant_id}")
            except Exception as e:
                logger.warning(f"Failed to enable modules for tenant {tenant_id}: {e}")
            
            # =========================================================================
            # STEP 8: Always send verification email to tenant admin
            # =========================================================================
            welcome_email_sent = False
            is_docflow_tenant = "docflow" in module_entitlements and "crm" not in module_entitlements
            try:
                await self._send_tenant_admin_welcome_email(
                    email=admin_email,
                    first_name=admin_first_name,
                    tenant_name=tenant.get("tenant_name"),
                    reset_token=reset_token,
                    is_docflow=is_docflow_tenant
                )
                welcome_email_sent = True
                logger.info(f"Sent verification email to {admin_email}")
            except Exception as e:
                logger.warning(f"Failed to send verification email: {e}")
                # Continue - email can be resent later
            
            # =========================================================================
            # Log Audit Event
            # =========================================================================
            await self._log_audit_event(
                tenant_id=tenant_id,
                event_type="tenant_created",
                details={
                    "tenant_name": tenant["tenant_name"],
                    "plan": plan,
                    "admin_email": admin_email,
                    "admin_name": f"{admin_first_name} {admin_last_name}",
                    "industry": industry,
                    "admin_user_created": True,
                    "admin_license_assigned": len(admin_licenses_assigned) > 0,
                    "licenses_provisioned": len(licenses_provisioned),
                    "platform_version": platform_version.get("current_version_number") if platform_version else None,
                    "welcome_email_sent": welcome_email_sent
                },
                actor_id=actor_id,
                actor_email=actor_email
            )
            
            # =========================================================================
            # Return Success Response
            # =========================================================================
            return {
                "id": tenant_id,
                "tenant_name": tenant["tenant_name"],
                "organization_name": tenant["organization_name"],
                "status": tenant["status"],
                "plan": tenant["plan"],
                "seat_limit": tenant["seat_limit"],
                "max_storage_mb": tenant["max_storage_mb"],
                "region": tenant.get("region"),
                "industry": tenant.get("industry"),
                "created_at": tenant["created_at"],
                "module_entitlements": module_entitlements,
                "provisioning": provisioning_result,
                "licenses_provisioned": len(licenses_provisioned),
                "platform_version": platform_version,
                "admin_user": {
                    "id": admin_user_id,
                    "email": admin_email,
                    "first_name": admin_first_name,
                    "last_name": admin_last_name,
                    "role": "system_administrator",
                    "status": "pending_verification",
                    "license_assigned": len(admin_licenses_assigned) > 0,
                    "licenses_assigned": admin_licenses_assigned
                },
                "verification_email_sent": welcome_email_sent
            }
            
        except Exception as e:
            # =========================================================================
            # ROLLBACK: Clean up any created records
            # =========================================================================
            logger.error(f"Tenant creation failed, rolling back: {e}")
            
            for action_type, action_id in reversed(rollback_actions):
                try:
                    if action_type == "tenant":
                        await self.db.tenants.delete_one({"id": action_id})
                        logger.info(f"Rolled back tenant {action_id}")
                    elif action_type == "user":
                        await self.db.users.delete_one({"id": action_id})
                        logger.info(f"Rolled back user {action_id}")
                    elif action_type == "user_license":
                        await self.db.user_licenses.delete_one({"id": action_id})
                        logger.info(f"Rolled back user_license {action_id}")
                except Exception as rollback_error:
                    logger.error(f"Rollback failed for {action_type} {action_id}: {rollback_error}")
            
            # Re-raise the original error
            raise e
    
    async def _send_tenant_admin_welcome_email(
        self,
        email: str,
        first_name: str,
        tenant_name: str,
        reset_token: str,
        is_docflow: bool = False
    ):
        """
        Send welcome email to the new tenant admin.
        Uses DocFlow template when is_docflow=True.
        """
        try:
            from shared.services.email_service import get_email_service
            email_service = get_email_service(self.db)
            
            result = await email_service.send_tenant_admin_welcome(
                to_email=email,
                first_name=first_name,
                tenant_name=tenant_name,
                reset_token=reset_token,
                is_docflow=is_docflow
            )
            
            logger.info(f"Welcome email result: {result['status']} to {email} (docflow={is_docflow})")
            return result
            
        except Exception as e:
            logger.error(f"Failed to send welcome email: {e}")
            # Don't raise - email failure shouldn't block tenant creation
            return {"status": "failed", "error": str(e)}
    
    async def _provision_tenant(self, tenant_id: str, admin_user_id: str, industry: str = "general") -> Dict[str, Any]:
        """
        Provision a new tenant with full CRM configuration.
        Uses the shared TenantProvisioningService for consistency with CRM signup flow.
        
        This ensures Admin Portal tenants get the same objects, layouts, and apps
        as tenants created via the CRM signup.
        """
        try:
            # Use the shared provisioning service for consistent tenant setup
            from shared.services.tenant_provisioning_service import TenantProvisioningService
            
            provisioning_service = TenantProvisioningService(self.db)
            result = await provisioning_service.provision_tenant(
                tenant_id=tenant_id,
                user_id=admin_user_id,
                industry=industry,
                skip_if_exists=False  # Always provision for new tenants from Admin Portal
            )
            
            logger.info(f"Tenant {tenant_id} provisioned via shared service: {result}")
            return result
            
        except Exception as e:
            logger.error(f"Error using shared provisioning service for tenant {tenant_id}: {e}")
            # Fall back to basic provisioning if shared service fails
            return await self._provision_tenant_basic(tenant_id)
    
    async def _provision_tenant_basic(self, tenant_id: str) -> Dict[str, Any]:
        """
        Fallback basic provisioning - only roles, permissions, settings.
        Used if shared provisioning service fails.
        """
        now = datetime.now(timezone.utc)
        provisioned = {
            "default_roles": False,
            "default_permissions": False,
            "default_settings": False
        }
        
        try:
            # Create default roles
            default_roles = [
                {"id": str(uuid.uuid4()), "tenant_id": tenant_id, "name": "Admin", "api_name": "admin", "level": 1, "created_at": now},
                {"id": str(uuid.uuid4()), "tenant_id": tenant_id, "name": "Manager", "api_name": "manager", "level": 2, "created_at": now},
                {"id": str(uuid.uuid4()), "tenant_id": tenant_id, "name": "User", "api_name": "user", "level": 3, "created_at": now},
            ]
            await self.db.roles.insert_many(default_roles)
            provisioned["default_roles"] = True
        except Exception as e:
            logger.warning(f"Failed to create default roles for tenant {tenant_id}: {e}")
        
        try:
            # Create default permission set
            default_permissions = {
                "id": str(uuid.uuid4()),
                "tenant_id": tenant_id,
                "name": "Standard User",
                "api_name": "standard_user",
                "permissions": {
                    "read_records": True,
                    "create_records": True,
                    "edit_records": True,
                    "delete_records": False,
                    "manage_users": False,
                    "manage_settings": False
                },
                "created_at": now
            }
            await self.db.permission_sets.insert_one(default_permissions)
            provisioned["default_permissions"] = True
        except Exception as e:
            logger.warning(f"Failed to create default permissions for tenant {tenant_id}: {e}")
        
        try:
            # Create default tenant settings
            default_settings = {
                "id": str(uuid.uuid4()),
                "tenant_id": tenant_id,
                "settings": {
                    "theme": "light",
                    "timezone": "UTC",
                    "date_format": "YYYY-MM-DD",
                    "currency": "USD",
                    "language": "en"
                },
                "created_at": now
            }
            await self.db.tenant_settings.insert_one(default_settings)
            provisioned["default_settings"] = True
        except Exception as e:
            logger.warning(f"Failed to create default settings for tenant {tenant_id}: {e}")
        
        logger.info(f"Tenant {tenant_id} basic provisioned: {provisioned}")
        return provisioned
    
    async def update_tenant(self, tenant_id: str, update_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Update tenant details"""
        # Remove None values
        update_data = {k: v for k, v in update_data.items() if v is not None}
        
        if not update_data:
            return await self.get_tenant_by_id(tenant_id)
        
        # Normalize field names
        if "tenant_name" in update_data:
            update_data["company_name"] = update_data["tenant_name"]  # Backward compatibility
        if "plan" in update_data:
            update_data["subscription_plan"] = update_data["plan"]  # Backward compatibility
            # Update module entitlements if plan changes
            plan = update_data["plan"]
            plan_config = await self._get_plan_config(plan)
            update_data["module_entitlements"] = plan_config["enabled_modules"]
        if "seat_limit" in update_data:
            update_data["max_users"] = update_data["seat_limit"]  # Backward compatibility
        
        update_data["updated_at"] = datetime.now(timezone.utc)
        
        result = await self.db.tenants.update_one(
            {"id": tenant_id},
            {"$set": update_data}
        )
        
        if result.matched_count == 0:
            return None
        
        return await self.get_tenant_by_id(tenant_id)
    
    async def suspend_tenant(self, tenant_id: str, reason: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """Suspend a tenant"""
        now = datetime.now(timezone.utc)
        update_data = {
            "status": "suspended",
            "suspended_at": now,
            "suspended_reason": reason,
            "updated_at": now
        }
        
        result = await self.db.tenants.update_one(
            {"id": tenant_id},
            {"$set": update_data}
        )
        
        if result.matched_count == 0:
            return None
        
        # Log audit event
        await self._log_audit_event(tenant_id, "tenant_suspended", {"reason": reason})
        
        return await self.get_tenant_by_id(tenant_id)
    
    async def activate_tenant(self, tenant_id: str) -> Optional[Dict[str, Any]]:
        """Activate a suspended tenant"""
        now = datetime.now(timezone.utc)
        
        result = await self.db.tenants.update_one(
            {"id": tenant_id},
            {"$set": {"status": "active", "updated_at": now}},
        )
        
        # Remove suspended fields
        await self.db.tenants.update_one(
            {"id": tenant_id},
            {"$unset": {"suspended_at": "", "suspended_reason": ""}}
        )
        
        if result.matched_count == 0:
            return None
        
        # Log audit event
        await self._log_audit_event(tenant_id, "tenant_activated", {})
        
        return await self.get_tenant_by_id(tenant_id)
    
    async def delete_tenant(self, tenant_id: str, hard_delete: bool = False) -> bool:
        """Delete a tenant (soft delete by default)"""
        if hard_delete:
            # Hard delete - remove all tenant data
            await self.db.tenants.delete_one({"id": tenant_id})
            await self.db.users.delete_many({"tenant_id": tenant_id})
            await self.db.object_records.delete_many({"tenant_id": tenant_id})
            await self.db.object_definitions.delete_many({"tenant_id": tenant_id})
            await self.db.flows.delete_many({"tenant_id": tenant_id})
            await self.db.roles.delete_many({"tenant_id": tenant_id})
            await self.db.permission_sets.delete_many({"tenant_id": tenant_id})
            await self.db.tenant_settings.delete_many({"tenant_id": tenant_id})
            logger.warning(f"Tenant {tenant_id} hard deleted with all data")
            return True
        else:
            # Soft delete
            now = datetime.now(timezone.utc)
            result = await self.db.tenants.update_one(
                {"id": tenant_id},
                {"$set": {
                    "is_deleted": True,
                    "deleted_at": now,
                    "status": "deleted",
                    "updated_at": now
                }}
            )
            
            if result.matched_count == 0:
                return False
            
            # Log audit event
            await self._log_audit_event(tenant_id, "tenant_deleted", {"soft_delete": True})
            
            logger.info(f"Tenant {tenant_id} soft deleted")
            return True
    
    async def get_tenant_users(self, tenant_id: str, skip: int = 0, limit: int = 50) -> Dict[str, Any]:
        """Get users for a specific tenant"""
        total = await self.db.users.count_documents({"tenant_id": tenant_id})
        
        users_cursor = self.db.users.find(
            {"tenant_id": tenant_id},
            {"_id": 0, "password": 0}
        ).skip(skip).limit(limit).sort("created_at", -1)
        
        users = await users_cursor.to_list(length=limit)
        
        return {
            "users": users,
            "total": total,
            "tenant_id": tenant_id,
            "skip": skip,
            "limit": limit
        }
    
    async def _log_audit_event(self, tenant_id: str, event_type: str, details: Dict[str, Any], actor_id: str = None, actor_email: str = None):
        """
        Log an audit event for admin actions
        Uses the new AuditLogService for consistent logging
        """
        try:
            audit_service = await self._get_audit_service()
            await audit_service.log_action(
                action=event_type,
                actor_id=actor_id or "system",
                actor_email=actor_email or "system@admin.local",
                tenant_id=tenant_id,
                target_id=tenant_id,
                target_type="tenant" if "tenant" in event_type else "user" if "user" in event_type else "system",
                details=details
            )
        except Exception as e:
            # Fallback to direct insert if service fails
            logger.warning(f"AuditLogService failed, using direct insert: {e}")
            try:
                audit_log = {
                    "id": str(uuid.uuid4()),
                    "action": event_type,
                    "action_description": event_type.replace("_", " ").title(),
                    "actor_id": actor_id or "system",
                    "actor_email": actor_email or "system@admin.local",
                    "tenant_id": tenant_id,
                    "details": details,
                    "timestamp": datetime.now(timezone.utc)
                }
                await self.db.admin_audit_logs.insert_one(audit_log)
            except Exception as inner_e:
                logger.error(f"Failed to log audit event: {inner_e}")
    
    async def get_dashboard_stats(self) -> Dict[str, Any]:
        """Get admin dashboard statistics - Enhanced for Phase D Control Plane"""
        from datetime import timedelta
        
        # Basic counts
        total_tenants = await self.db.tenants.count_documents({"is_deleted": {"$ne": True}})
        total_users = await self.db.users.count_documents({"tenant_id": {"$ne": "system"}})
        total_records = await self.db.object_records.count_documents({})
        total_flows = await self.db.flows.count_documents({})
        active_flows = await self.db.flows.count_documents({"status": "Active"})
        
        # Tenant status breakdown - try both uppercase and lowercase
        tenant_status_breakdown = {}
        status_pipeline = [
            {"$match": {"is_deleted": {"$ne": True}}},
            {"$group": {"_id": {"$ifNull": ["$status", "ACTIVE"]}, "count": {"$sum": 1}}}
        ]
        status_results = await self.db.tenants.aggregate(status_pipeline).to_list(100)
        for item in status_results:
            status_key = (item["_id"] or "ACTIVE").upper()
            tenant_status_breakdown[status_key] = item["count"]
        
        # Ensure all expected statuses exist
        for status in ["ACTIVE", "SUSPENDED", "TRIAL", "PENDING", "PROVISIONING", "READ_ONLY", "TERMINATED"]:
            if status not in tenant_status_breakdown:
                tenant_status_breakdown[status] = 0
        
        # New tenants this month
        now = datetime.now(timezone.utc)
        start_of_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        new_tenants_this_month = await self.db.tenants.count_documents({
            "created_at": {"$gte": start_of_month},
            "is_deleted": {"$ne": True}
        })
        
        # Storage usage aggregation
        storage_pipeline = [
            {"$match": {"is_deleted": {"$ne": True}}},
            {"$group": {
                "_id": None,
                "total_used": {"$sum": {"$ifNull": ["$current_storage_mb", 0]}},
                "total_allocated": {"$sum": {"$ifNull": ["$max_storage_mb", 1024]}}
            }}
        ]
        storage_result = await self.db.tenants.aggregate(storage_pipeline).to_list(1)
        total_storage_used_mb = storage_result[0]["total_used"] if storage_result else 0
        total_storage_allocated_mb = storage_result[0]["total_allocated"] if storage_result else 0
        
        # Module usage statistics
        module_usage = {}
        module_pipeline = [
            {"$match": {"is_deleted": {"$ne": True}}},
            {"$unwind": {"path": "$module_entitlements", "preserveNullAndEmptyArrays": False}},
            {"$group": {"_id": "$module_entitlements", "count": {"$sum": 1}}}
        ]
        module_results = await self.db.tenants.aggregate(module_pipeline).to_list(100)
        for item in module_results:
            if item["_id"]:
                module_usage[item["_id"]] = item["count"]
        
        # Get recent tenants (last 10)
        recent_tenants = await self.db.tenants.find(
            {"is_deleted": {"$ne": True}}, {"_id": 0}
        ).sort("created_at", -1).limit(10).to_list(10)
        
        # Normalize recent tenants
        normalized_recent = []
        for t in recent_tenants:
            normalized_recent.append({
                "id": t.get("id"),
                "tenant_name": t.get("tenant_name") or t.get("company_name", "Unknown"),
                "company_name": t.get("company_name") or t.get("tenant_name", "Unknown"),
                "organization_name": t.get("organization_name"),
                "status": (t.get("status") or "active").upper(),
                "plan": t.get("plan") or t.get("subscription_plan", "free"),
                "created_at": t.get("created_at"),
                "seat_limit": t.get("seat_limit", 10),
                "current_users": t.get("current_users", 0)
            })
        
        return {
            "total_tenants": total_tenants,
            "tenant_status_breakdown": tenant_status_breakdown,
            "new_tenants_this_month": new_tenants_this_month,
            "total_users": total_users,
            "total_records": total_records,
            "total_flows": total_flows,
            "active_flows": active_flows,
            "total_flow_executions": 0,  # TODO: Track flow executions
            "total_storage_used_mb": total_storage_used_mb,
            "total_storage_allocated_mb": total_storage_allocated_mb,
            "module_usage": module_usage,
            "recent_tenants": normalized_recent
        }
    
    async def setup_admin_user(self, email: str, password: str, first_name: str = "Platform", last_name: str = "Admin") -> Dict[str, Any]:
        """
        Create initial Admin Portal user.
        This is used for initial platform setup only.
        """
        # Check if admin user already exists (check for both legacy and new roles)
        existing_admin = await self.db.users.find_one({
            "$or": [
                {"role": "SUPER_ADMIN"},
                {"role": "platform_admin"},
                {"is_admin_portal_user": True}
            ]
        })
        if existing_admin:
            return {
                "message": "Admin user already exists",
                "admin_user_created": False,
                "admin_email": existing_admin.get("email")
            }
        
        admin_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc)
        
        hashed_password = bcrypt.hashpw(
            password.encode('utf-8'),
            bcrypt.gensalt()
        ).decode('utf-8')
        
        admin_user = {
            "id": admin_id,
            "tenant_id": "system",  # System-level user
            "email": email.lower(),
            "password": hashed_password,
            "first_name": first_name,
            "last_name": last_name,
            "role": "platform_admin",
            "role_id": "platform_admin",
            "is_admin_portal_user": True,
            "is_active": True,
            "created_at": now
        }
        
        await self.db.users.insert_one(admin_user)
        
        logger.info(f"Admin Portal user created: {email}")
        
        return {
            "message": "Admin user created successfully",
            "admin_user_created": True,
            "admin_email": email
        }
    
    # Alias for backward compatibility
    async def setup_super_admin(self, email: str, password: str, first_name: str = "Platform", last_name: str = "Admin") -> Dict[str, Any]:
        """Alias for setup_admin_user for backward compatibility"""
        return await self.setup_admin_user(email, password, first_name, last_name)


    # =========================================================================
    # PHASE 3: USER MANAGEMENT
    # =========================================================================
    
    async def get_all_users(
        self, 
        skip: int = 0, 
        limit: int = 50, 
        search: Optional[str] = None,
        role_filter: Optional[str] = None,
        tenant_id: Optional[str] = None,
        status_filter: Optional[str] = None
    ) -> Dict[str, Any]:
        """Get all users across tenants with filters - for platform monitoring"""
        query = {
            "role": {"$nin": ["SUPER_ADMIN", "platform_admin"]},  # Exclude platform admins
            "tenant_id": {"$ne": "system"}  # Exclude system users
        }
        
        if search:
            query["$or"] = [
                {"email": {"$regex": search, "$options": "i"}},
                {"first_name": {"$regex": search, "$options": "i"}},
                {"last_name": {"$regex": search, "$options": "i"}}
            ]
        
        if role_filter:
            query["role"] = role_filter
        
        if tenant_id:
            query["tenant_id"] = tenant_id
        
        if status_filter:
            if status_filter == "active":
                query["is_active"] = True
            elif status_filter == "disabled":
                query["is_active"] = False
            elif status_filter == "invited":
                query["status"] = "invited"
        
        total = await self.db.users.count_documents(query)
        
        pipeline = [
            {"$match": query},
            {"$sort": {"created_at": -1}},
            {"$skip": skip},
            {"$limit": limit},
            {"$lookup": {
                "from": "tenants",
                "localField": "tenant_id",
                "foreignField": "id",
                "as": "tenant_info"
            }},
            {"$project": {
                "_id": 0,
                "password": 0
            }}
        ]
        
        users = await self.db.users.aggregate(pipeline).to_list(limit)
        
        # Process users to add tenant details
        processed_users = []
        for user in users:
            tenant_info = user.pop("tenant_info", [])
            tenant_data = tenant_info[0] if tenant_info else {}
            
            # Determine user status
            user_status = "active"
            if not user.get("is_active", True):
                user_status = "disabled"
            elif user.get("status") == "invited":
                user_status = "invited"
            
            processed_users.append({
                "id": user.get("id"),
                "email": user.get("email"),
                "first_name": user.get("first_name", ""),
                "last_name": user.get("last_name", ""),
                "role": user.get("role", "user"),
                "is_active": user.get("is_active", True),
                "status": user_status,
                "last_login": user.get("last_login"),
                "created_at": user.get("created_at"),
                "tenant_id": user.get("tenant_id"),
                "tenant_name": tenant_data.get("tenant_name") or tenant_data.get("company_name", "Unknown"),
                "tenant_subdomain": tenant_data.get("subdomain"),
                "tenant_status": tenant_data.get("status", "active")
            })
        
        return {
            "users": processed_users,
            "total": total,
            "skip": skip,
            "limit": limit
        }
    
    async def create_tenant_user(self, tenant_id: str, user_data: Dict[str, Any]) -> Dict[str, Any]:
        """Create a new user within a tenant"""
        # Verify tenant exists
        tenant = await self.db.tenants.find_one({"id": tenant_id})
        if not tenant:
            raise ValueError("Tenant not found")
        
        # Check seat limit
        current_users = await self.db.users.count_documents({"tenant_id": tenant_id})
        seat_limit = tenant.get("seat_limit") or tenant.get("max_users", 10)
        if current_users >= seat_limit:
            raise ValueError(f"Tenant has reached seat limit ({seat_limit})")
        
        # Check if email already exists
        existing = await self.db.users.find_one({"email": user_data["email"].lower()})
        if existing:
            raise ValueError("A user with this email already exists")
        
        user_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc)
        
        hashed_password = bcrypt.hashpw(
            user_data["password"].encode('utf-8'),
            bcrypt.gensalt()
        ).decode('utf-8')
        
        user = {
            "id": user_id,
            "tenant_id": tenant_id,
            "email": user_data["email"].lower(),
            "password": hashed_password,
            "first_name": user_data["first_name"],
            "last_name": user_data["last_name"],
            "role": user_data.get("role", "user"),
            "role_id": user_data.get("role", "user"),
            "is_active": True,
            "created_at": now
        }
        
        await self.db.users.insert_one(user)
        
        # Update tenant last activity
        await self.db.tenants.update_one(
            {"id": tenant_id},
            {"$set": {"last_activity": now}}
        )
        
        user.pop("password", None)
        user.pop("_id", None)
        
        return user
    
    async def update_tenant_user(self, user_id: str, update_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Update user details"""
        update_data = {k: v for k, v in update_data.items() if v is not None}
        
        if not update_data:
            user = await self.db.users.find_one({"id": user_id}, {"_id": 0, "password": 0})
            return user
        
        # If role is being updated, also update role_id for compatibility
        if "role" in update_data:
            update_data["role_id"] = update_data["role"]
        
        update_data["updated_at"] = datetime.now(timezone.utc)
        
        result = await self.db.users.update_one(
            {"id": user_id},
            {"$set": update_data}
        )
        
        if result.matched_count == 0:
            return None
        
        return await self.db.users.find_one({"id": user_id}, {"_id": 0, "password": 0})
    
    async def suspend_user(self, user_id: str) -> Optional[Dict[str, Any]]:
        """Suspend a user"""
        result = await self.db.users.update_one(
            {"id": user_id, "role": {"$ne": "SUPER_ADMIN"}},
            {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc)}}
        )
        
        if result.matched_count == 0:
            return None
        
        user = await self.db.users.find_one({"id": user_id}, {"_id": 0, "password": 0})
        await self._log_audit_event(user.get("tenant_id"), "user_suspended", {"user_id": user_id})
        return user
    
    async def activate_user(self, user_id: str) -> Optional[Dict[str, Any]]:
        """Activate a suspended user"""
        result = await self.db.users.update_one(
            {"id": user_id},
            {"$set": {"is_active": True, "updated_at": datetime.now(timezone.utc)}}
        )
        
        if result.matched_count == 0:
            return None
        
        user = await self.db.users.find_one({"id": user_id}, {"_id": 0, "password": 0})
        await self._log_audit_event(user.get("tenant_id"), "user_activated", {"user_id": user_id})
        return user
    
    async def reset_user_password(self, user_id: str, new_password: str) -> bool:
        """Reset a user's password"""
        hashed_password = bcrypt.hashpw(
            new_password.encode('utf-8'),
            bcrypt.gensalt()
        ).decode('utf-8')
        
        result = await self.db.users.update_one(
            {"id": user_id, "role": {"$ne": "SUPER_ADMIN"}},
            {"$set": {
                "password": hashed_password,
                "updated_at": datetime.now(timezone.utc)
            }}
        )
        
        if result.matched_count == 0:
            return False
        
        user = await self.db.users.find_one({"id": user_id}, {"_id": 0})
        await self._log_audit_event(user.get("tenant_id"), "user_password_reset", {"user_id": user_id})
        return True
    
    async def delete_user(self, user_id: str) -> bool:
        """Delete a user (hard delete)"""
        user = await self.db.users.find_one({"id": user_id, "role": {"$ne": "SUPER_ADMIN"}})
        if not user:
            return False
        
        tenant_id = user.get("tenant_id")
        await self.db.users.delete_one({"id": user_id})
        await self._log_audit_event(tenant_id, "user_deleted", {"user_id": user_id, "email": user.get("email")})
        return True
    
    # =========================================================================
    # PHASE 3: SUBSCRIPTION PLAN MANAGEMENT
    # =========================================================================
    
    async def get_all_plans(self, include_inactive: bool = False) -> List[Dict[str, Any]]:
        """Get all subscription plans"""
        query = {} if include_inactive else {"is_active": {"$ne": False}}
        
        plans = await self.db.plans.find(query, {"_id": 0}).sort("sort_order", 1).to_list(100)
        
        # Enrich with tenant counts
        enriched = []
        for plan in plans:
            tenant_count = await self.db.tenants.count_documents({
                "$or": [
                    {"plan": plan.get("api_name")},
                    {"subscription_plan": plan.get("api_name")}
                ],
                "is_deleted": {"$ne": True}
            })
            enriched.append({**plan, "tenant_count": tenant_count})
        
        return enriched
    
    async def get_plan_by_id(self, plan_id: str) -> Optional[Dict[str, Any]]:
        """Get a plan by ID"""
        plan = await self.db.plans.find_one({"id": plan_id}, {"_id": 0})
        if plan:
            tenant_count = await self.db.tenants.count_documents({
                "$or": [
                    {"plan": plan.get("api_name")},
                    {"subscription_plan": plan.get("api_name")}
                ],
                "is_deleted": {"$ne": True}
            })
            plan["tenant_count"] = tenant_count
        return plan
    
    async def create_plan(self, plan_data: Dict[str, Any]) -> Dict[str, Any]:
        """Create a new subscription plan"""
        # Check if api_name already exists
        existing = await self.db.plans.find_one({"api_name": plan_data["api_name"]})
        if existing:
            raise ValueError(f"A plan with api_name '{plan_data['api_name']}' already exists")
        
        plan_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc)
        
        plan = {
            "id": plan_id,
            **plan_data,
            "created_at": now,
            "updated_at": now
        }
        
        await self.db.plans.insert_one(plan)
        plan.pop("_id", None)
        plan["tenant_count"] = 0
        
        return plan
    
    async def update_plan(self, plan_id: str, update_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Update a subscription plan"""
        update_data = {k: v for k, v in update_data.items() if v is not None}
        
        if not update_data:
            return await self.get_plan_by_id(plan_id)
        
        update_data["updated_at"] = datetime.now(timezone.utc)
        
        result = await self.db.plans.update_one(
            {"id": plan_id},
            {"$set": update_data}
        )
        
        if result.matched_count == 0:
            return None
        
        return await self.get_plan_by_id(plan_id)
    
    async def delete_plan(self, plan_id: str) -> bool:
        """Delete a subscription plan (soft delete by deactivating)"""
        result = await self.db.plans.update_one(
            {"id": plan_id},
            {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc)}}
        )
        return result.matched_count > 0
    
    async def assign_plan_to_tenant(self, tenant_id: str, plan_id: str) -> Optional[Dict[str, Any]]:
        """Assign a subscription plan to a tenant"""
        plan = await self.db.plans.find_one({"id": plan_id}, {"_id": 0})
        if not plan:
            raise ValueError("Plan not found")
        
        now = datetime.now(timezone.utc)
        
        # Update tenant with new plan
        update_data = {
            "plan": plan["api_name"],
            "subscription_plan": plan["api_name"],  # Backward compatibility
            "seat_limit": plan.get("seat_limit", 10),
            "max_users": plan.get("seat_limit", 10),  # Backward compatibility
            "max_storage_mb": plan.get("storage_limit_mb", 1024),
            "module_entitlements": plan.get("enabled_modules", []),
            "updated_at": now
        }
        
        result = await self.db.tenants.update_one(
            {"id": tenant_id},
            {"$set": update_data}
        )
        
        if result.matched_count == 0:
            return None
        
        await self._log_audit_event(tenant_id, "plan_assigned", {"plan_id": plan_id, "plan_name": plan["name"]})
        
        return await self.get_tenant_by_id(tenant_id)
    
    async def seed_default_plans(self) -> Dict[str, Any]:
        """Seed default subscription plans if none exist"""
        existing = await self.db.plans.count_documents({})
        if existing > 0:
            return {"message": "Plans already exist", "created": 0}
        
        now = datetime.now(timezone.utc)
        
        default_plans = [
            {
                "id": str(uuid.uuid4()),
                "name": "Free",
                "api_name": "free",
                "description": "Get started with basic features",
                "price_monthly": 0,
                "price_yearly": 0,
                "seat_limit": 5,
                "storage_limit_mb": 512,
                "api_limit_daily": 1000,
                "enabled_modules": ["crm", "task_manager"],
                "included_licenses": [
                    {"license_code": "CRM_CORE_SEAT", "seats": 5}
                ],
                "is_active": True,
                "is_public": True,
                "sort_order": 0,
                "created_at": now,
                "updated_at": now
            },
            {
                "id": str(uuid.uuid4()),
                "name": "DocFlow Only",
                "api_name": "docflow_only",
                "description": "Document workflow and signing — no CRM modules",
                "price_monthly": 19,
                "price_yearly": 190,
                "seat_limit": 10,
                "storage_limit_mb": 2048,
                "api_limit_daily": 5000,
                "enabled_modules": ["docflow", "connections"],
                "included_licenses": [
                    {"license_code": "DOCFLOW_SEAT", "seats": 10}
                ],
                "is_active": True,
                "is_public": True,
                "sort_order": 1,
                "created_at": now,
                "updated_at": now
            },
            {
                "id": str(uuid.uuid4()),
                "name": "Starter",
                "api_name": "starter",
                "description": "For small teams getting started",
                "price_monthly": 29,
                "price_yearly": 290,
                "seat_limit": 10,
                "storage_limit_mb": 2048,
                "api_limit_daily": 5000,
                "enabled_modules": ["crm", "task_manager", "form_builder", "flow_builder"],
                "included_licenses": [
                    {"license_code": "CRM_CORE_SEAT", "seats": 10},
                    {"license_code": "TASK_MANAGER_SEAT", "seats": 10},
                    {"license_code": "FORM_BUILDER_SEAT", "seats": 5}
                ],
                "is_active": True,
                "is_public": True,
                "sort_order": 2,
                "created_at": now,
                "updated_at": now
            },
            {
                "id": str(uuid.uuid4()),
                "name": "Professional",
                "api_name": "professional",
                "description": "For growing businesses",
                "price_monthly": 79,
                "price_yearly": 790,
                "seat_limit": 50,
                "storage_limit_mb": 10240,
                "api_limit_daily": 20000,
                "enabled_modules": ["crm", "task_manager", "form_builder", "flow_builder", "survey_builder", "booking"],
                "included_licenses": [
                    {"license_code": "CRM_CORE_SEAT", "seats": 50},
                    {"license_code": "TASK_MANAGER_SEAT", "seats": 50},
                    {"license_code": "FORM_BUILDER_SEAT", "seats": 25},
                    {"license_code": "FLOW_BUILDER_SEAT", "seats": 10},
                    {"license_code": "SURVEY_BUILDER_SEAT", "seats": 5}
                ],
                "is_active": True,
                "is_public": True,
                "sort_order": 3,
                "created_at": now,
                "updated_at": now
            },
            {
                "id": str(uuid.uuid4()),
                "name": "Enterprise",
                "api_name": "enterprise",
                "description": "For large organizations",
                "price_monthly": 199,
                "price_yearly": 1990,
                "seat_limit": 1000,
                "storage_limit_mb": 51200,
                "api_limit_daily": 100000,
                "enabled_modules": ["crm", "task_manager", "form_builder", "flow_builder", "survey_builder", "booking", "docflow", "field_service"],
                "included_licenses": [
                    {"license_code": "CRM_CORE_SEAT", "seats": 500},
                    {"license_code": "TASK_MANAGER_SEAT", "seats": 500},
                    {"license_code": "FORM_BUILDER_SEAT", "seats": 200},
                    {"license_code": "FLOW_BUILDER_SEAT", "seats": 100},
                    {"license_code": "SURVEY_BUILDER_SEAT", "seats": 50},
                    {"license_code": "DOCFLOW_SEAT", "seats": 50},
                    {"license_code": "CHATBOT_SEAT", "seats": 25},
                    {"license_code": "ADMIN_CONSOLE_SEAT", "seats": 10}
                ],
                "is_active": True,
                "is_public": True,
                "sort_order": 4,
                "created_at": now,
                "updated_at": now
            }
        ]
        
        await self.db.plans.insert_many(default_plans)
        
        return {"message": "Default plans created", "created": len(default_plans)}
    
    # =========================================================================
    # PHASE 3: MODULE ENTITLEMENTS
    # =========================================================================
    
    def get_available_modules(self) -> List[Dict[str, Any]]:
        """
        Get all available modules in the platform.
        These modules match exactly with the CRM Setup sidebar items.
        Note: Access & Security is NOT included as it's always available regardless of plan.
        """
        return [
            # Core CRM modules
            {"id": "crm", "name": "CRM", "api_name": "crm", "description": "Customer Relationship Management core features", "category": "core", "is_premium": False, "sort_order": 0},
            {"id": "sales_console", "name": "Sales Console", "api_name": "sales_console", "description": "Sales pipeline and analytics dashboard", "category": "core", "is_premium": False, "sort_order": 1},
            {"id": "task_manager", "name": "Task Manager", "api_name": "task_manager", "description": "Task and activity management", "category": "productivity", "is_premium": False, "sort_order": 2},
            
            # Schema & Data modules
            {"id": "schema_builder", "name": "Schema Builder", "api_name": "schema_builder", "description": "Object and field management", "category": "admin", "is_premium": False, "sort_order": 10},
            {"id": "app_manager", "name": "App Manager", "api_name": "app_manager", "description": "App and home page builder", "category": "admin", "is_premium": False, "sort_order": 11},
            
            # Automation modules
            {"id": "form_builder", "name": "Form Builder", "api_name": "form_builder", "description": "Dynamic form creation", "category": "automation", "is_premium": False, "sort_order": 20},
            {"id": "flow_builder", "name": "Flow Builder", "api_name": "flow_builder", "description": "Visual workflow automation", "category": "automation", "is_premium": False, "sort_order": 21},
            
            # Data modules
            {"id": "import_builder", "name": "Import Builder", "api_name": "import_builder", "description": "Data import tools", "category": "data", "is_premium": False, "sort_order": 30},
            {"id": "export_builder", "name": "Export Builder", "api_name": "export_builder", "description": "Data export tools", "category": "data", "is_premium": False, "sort_order": 31},
            {"id": "file_manager", "name": "File Manager", "api_name": "file_manager", "description": "Document and file management", "category": "data", "is_premium": False, "sort_order": 32},
            
            # Engagement modules
            {"id": "survey_builder", "name": "Survey Builder", "api_name": "survey_builder", "description": "Survey creation and analytics", "category": "engagement", "is_premium": True, "sort_order": 40},
            {"id": "email_templates", "name": "Email Templates", "api_name": "email_templates", "description": "Design and manage email templates", "category": "engagement", "is_premium": False, "sort_order": 41},
            {"id": "booking", "name": "Booking", "api_name": "booking", "description": "Schedule appointments and meetings", "category": "engagement", "is_premium": True, "sort_order": 42},
            
            # AI modules
            {"id": "chatbot_manager", "name": "Chatbot Manager", "api_name": "chatbot_manager", "description": "AI chatbot configuration", "category": "ai", "is_premium": True, "sort_order": 50},
            {"id": "ai_features", "name": "AI Features", "api_name": "ai_features", "description": "AI-powered insights and automation", "category": "ai", "is_premium": True, "sort_order": 51},
            
            # Advanced modules
            {"id": "docflow", "name": "DocFlow", "api_name": "docflow", "description": "Document automation and e-signatures", "category": "advanced", "is_premium": True, "sort_order": 60},
            {"id": "field_service", "name": "Field Service", "api_name": "field_service", "description": "Field service management", "category": "advanced", "is_premium": True, "sort_order": 61},
            {"id": "reporting", "name": "Advanced Reporting", "api_name": "reporting", "description": "Advanced analytics and dashboards", "category": "analytics", "is_premium": True, "sort_order": 70},
            
            # Configuration modules (always available)
            {"id": "features", "name": "Features", "api_name": "features", "description": "Configure platform features", "category": "config", "is_premium": False, "is_core": True, "sort_order": 80},
            {"id": "connections", "name": "Connections", "api_name": "connections", "description": "External service integrations", "category": "config", "is_premium": False, "is_core": True, "sort_order": 81},
        ]
    
    async def get_tenant_modules(self, tenant_id: str) -> Dict[str, Any]:
        """Get modules enabled for a tenant"""
        tenant = await self.db.tenants.find_one({"id": tenant_id}, {"_id": 0})
        if not tenant:
            return None
        
        enabled_modules = tenant.get("module_entitlements", [])
        all_modules = self.get_available_modules()
        
        return {
            "tenant_id": tenant_id,
            "tenant_name": tenant.get("tenant_name") or tenant.get("company_name"),
            "plan": tenant.get("plan") or tenant.get("subscription_plan", "free"),
            "enabled_modules": enabled_modules,
            "all_modules": all_modules,
            "modules_detail": [
                {**m, "enabled": m["api_name"] in enabled_modules}
                for m in all_modules
            ]
        }
    
    async def update_tenant_modules(self, tenant_id: str, enabled_modules: List[str]) -> Optional[Dict[str, Any]]:
        """Update enabled modules for a tenant"""
        # Validate module names
        valid_modules = {m["api_name"] for m in self.get_available_modules()}
        invalid = set(enabled_modules) - valid_modules
        if invalid:
            raise ValueError(f"Invalid module names: {', '.join(invalid)}")
        
        now = datetime.now(timezone.utc)
        
        result = await self.db.tenants.update_one(
            {"id": tenant_id},
            {"$set": {
                "module_entitlements": enabled_modules,
                "updated_at": now
            }}
        )
        
        if result.matched_count == 0:
            return None
        
        await self._log_audit_event(tenant_id, "modules_updated", {"enabled_modules": enabled_modules})
        
        return await self.get_tenant_modules(tenant_id)
    
    async def toggle_tenant_module(self, tenant_id: str, module_api_name: str, enabled: bool) -> Optional[Dict[str, Any]]:
        """Toggle a single module for a tenant"""
        # Validate module name
        valid_modules = {m["api_name"] for m in self.get_available_modules()}
        if module_api_name not in valid_modules:
            raise ValueError(f"Invalid module name: {module_api_name}")
        
        tenant = await self.db.tenants.find_one({"id": tenant_id}, {"_id": 0})
        if not tenant:
            return None
        
        current_modules = set(tenant.get("module_entitlements", []))
        
        if enabled:
            current_modules.add(module_api_name)
        else:
            current_modules.discard(module_api_name)
        
        # Also sync the tenant_modules collection (used by runtime API)
        from modules.admin.services.tenant_modules_service import get_tenant_modules_service
        tms = get_tenant_modules_service(self.db)
        if enabled:
            await tms.enable_module(tenant_id, module_api_name, enabled_source="MANUAL_OVERRIDE")
        else:
            await tms.disable_module(tenant_id, module_api_name)
        
        return await self.update_tenant_modules(tenant_id, list(current_modules))
    
    async def sync_tenant_plan_data(self, tenant_id: str, actor_id: str = None, actor_email: str = None) -> Dict[str, Any]:
        """
        Synchronize ALL tenant data sources with the tenant's plan.
        
        This ensures consistency across:
        - tenants.module_entitlements
        - tenants.seat_limit, max_users, max_storage_mb
        - tenant_billing_config.current_plan, subscription_status
        - tenant_modules collection
        
        Call this when:
        - Plan is changed
        - Data inconsistencies are detected
        - Admin requests a manual sync
        """
        tenant = await self.db.tenants.find_one({"id": tenant_id}, {"_id": 0})
        if not tenant:
            raise ValueError(f"Tenant {tenant_id} not found")
        
        plan = tenant.get("plan") or tenant.get("subscription_plan", "free")
        now = datetime.now(timezone.utc)
        
        # Get plan-based defaults from DB (single source of truth)
        plan_config = await self._get_plan_config(plan)
        module_entitlements = plan_config["enabled_modules"]
        seat_limit = plan_config["seat_limit"]
        storage_limit = plan_config["storage_limit_mb"]
        
        logger.info(f"Syncing tenant {tenant_id} to plan {plan}: {len(module_entitlements)} modules")
        
        # =========================================================================
        # STEP 1: Update tenants collection (SOURCE OF TRUTH)
        # =========================================================================
        await self.db.tenants.update_one(
            {"id": tenant_id},
            {"$set": {
                "plan": plan,
                "subscription_plan": plan,  # Backward compatibility
                "module_entitlements": module_entitlements,
                "seat_limit": seat_limit,
                "max_users": seat_limit,  # Backward compatibility
                "max_storage_mb": storage_limit,
                "subscription_status": "active" if plan != "free" else "inactive",
                "updated_at": now
            }}
        )
        
        # =========================================================================
        # STEP 2: Update tenant_billing_config
        # =========================================================================
        await self.db.tenant_billing_config.update_one(
            {"tenant_id": tenant_id},
            {"$set": {
                "current_plan": plan,
                "subscription_status": "active" if plan != "free" else "inactive",
                "updated_at": now
            }},
            upsert=True
        )
        
        # =========================================================================
        # STEP 3: Update tenant_modules collection
        # =========================================================================
        # First, disable all existing modules
        await self.db.tenant_modules.update_many(
            {"tenant_id": tenant_id},
            {"$set": {"is_enabled": False, "updated_at": now}}
        )
        
        # Then enable modules from plan
        for module_code in module_entitlements:
            await self.db.tenant_modules.update_one(
                {"tenant_id": tenant_id, "module_code": module_code},
                {
                    "$set": {
                        "tenant_id": tenant_id,
                        "module_code": module_code,
                        "is_enabled": True,
                        "enforcement_level": "HARD_STOP",
                        "updated_at": now
                    },
                    "$setOnInsert": {
                        "id": str(uuid.uuid4()),
                        "created_at": now
                    }
                },
                upsert=True
            )
        
        # =========================================================================
        # STEP 4: Log audit event
        # =========================================================================
        await self._log_audit_event(
            tenant_id, 
            "plan_data_synced", 
            {
                "plan": plan,
                "modules_enabled": module_entitlements,
                "seat_limit": seat_limit,
                "storage_limit_mb": storage_limit,
                "synced_by": actor_email or "system"
            }
        )
        
        logger.info(f"Successfully synced tenant {tenant_id} plan data")
        
        return {
            "success": True,
            "tenant_id": tenant_id,
            "plan": plan,
            "module_entitlements": module_entitlements,
            "seat_limit": seat_limit,
            "max_storage_mb": storage_limit,
            "subscription_status": "active" if plan != "free" else "inactive"
        }
    
    async def change_tenant_plan(self, tenant_id: str, new_plan: str, reason: str = None, actor_id: str = None, actor_email: str = None) -> Dict[str, Any]:
        """
        Change a tenant's plan and sync all related data.
        
        This is the CORRECT way to change a tenant's plan - it ensures
        all data sources stay synchronized.
        """
        # Validate plan exists in DB
        plan_doc = await self.db.plans.find_one({"api_name": new_plan, "is_active": {"$ne": False}}, {"_id": 0})
        if not plan_doc:
            active_plans = await self.db.plans.find({"is_active": {"$ne": False}}, {"_id": 0, "api_name": 1}).to_list(50)
            valid_names = [p["api_name"] for p in active_plans]
            raise ValueError(f"Invalid plan: {new_plan}. Active plans: {', '.join(valid_names)}")
        
        tenant = await self.db.tenants.find_one({"id": tenant_id}, {"_id": 0})
        if not tenant:
            raise ValueError(f"Tenant {tenant_id} not found")
        
        old_plan = tenant.get("plan") or tenant.get("subscription_plan", "free")
        now = datetime.now(timezone.utc)
        
        # Update the plan first
        await self.db.tenants.update_one(
            {"id": tenant_id},
            {"$set": {
                "plan": new_plan,
                "subscription_plan": new_plan,
                "plan_changed_at": now,
                "plan_change_reason": reason,
                "plan_changed_by": actor_email,
                "updated_at": now
            }}
        )
        
        # Now sync all data to match the new plan
        sync_result = await self.sync_tenant_plan_data(tenant_id, actor_id, actor_email)
        
        # Log the plan change
        await self._log_audit_event(
            tenant_id,
            "plan_changed",
            {
                "old_plan": old_plan,
                "new_plan": new_plan,
                "reason": reason,
                "changed_by": actor_email or "system"
            }
        )
        
        return {
            **sync_result,
            "old_plan": old_plan,
            "message": f"Plan changed from {old_plan} to {new_plan}"
        }


# Singleton instance
_admin_service_instance = None

def get_admin_service(db):
    """Get or create AdminService singleton"""
    global _admin_service_instance
    if _admin_service_instance is None:
        _admin_service_instance = AdminService(db)
    return _admin_service_instance
