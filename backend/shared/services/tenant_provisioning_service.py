"""
Tenant Provisioning Service
Shared provisioning logic for both CRM signup and Admin Portal tenant creation.
This ensures consistent initialization regardless of the creation source.
"""
import logging
from datetime import datetime, timezone
from typing import Dict, Any, Optional, List
from motor.motor_asyncio import AsyncIOMotorDatabase
import uuid

logger = logging.getLogger(__name__)


class TenantProvisioningService:
    """
    Centralized tenant provisioning service.
    Used by both CRM signup and Admin Portal to ensure consistent initialization.
    """
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
    
    async def provision_tenant(
        self, 
        tenant_id: str,
        user_id: str,
        industry: str = "general",
        skip_if_exists: bool = True
    ) -> Dict[str, Any]:
        """
        Full tenant provisioning - creates all standard CRM configuration.
        
        This method provisions:
        1. Base CRM objects (Lead, Account, Contact, Opportunity, Task, Event, EmailMessage)
        2. Industry-specific objects (if applicable)
        3. Standard Lightning layouts
        4. Default Sales Console app with Home page
        5. Default roles and permissions
        6. Tenant settings
        
        Args:
            tenant_id: The tenant to provision
            user_id: The admin user who will own created resources
            industry: Industry template to use (default: "general")
            skip_if_exists: If True, skip provisioning if tenant already has objects
        
        Returns:
            Dict with provisioning results
        """
        result = {
            "tenant_id": tenant_id,
            "provisioned": {
                "base_objects": False,
                "industry_objects": False,
                "layouts": False,
                "sales_app": False,
                "roles": False,
                "permissions": False,
                "settings": False
            },
            "counts": {},
            "errors": []
        }
        
        try:
            # Check if tenant already has objects (skip if exists)
            if skip_if_exists:
                existing_objects = await self.db.tenant_objects.count_documents({"tenant_id": tenant_id})
                if existing_objects > 0:
                    logger.info(f"Tenant {tenant_id} already has {existing_objects} objects, skipping provisioning")
                    result["skipped"] = True
                    result["reason"] = f"Tenant already has {existing_objects} objects"
                    return result
            
            # Step 1: Provision base CRM objects
            base_count = await self._provision_base_crm_objects(tenant_id)
            result["provisioned"]["base_objects"] = True
            result["counts"]["base_objects"] = base_count
            
            # Step 2: Provision industry-specific objects
            industry_count = await self._provision_industry_objects(tenant_id, industry)
            result["provisioned"]["industry_objects"] = True
            result["counts"]["industry_objects"] = industry_count
            
            # Step 3: Seed standard layouts
            layout_count = await self._provision_layouts(tenant_id, user_id)
            result["provisioned"]["layouts"] = True
            result["counts"]["layouts"] = layout_count
            
            # Step 4: Seed Sales Console app
            app_created = await self._provision_sales_app(tenant_id, user_id)
            result["provisioned"]["sales_app"] = app_created
            
            # Step 5: Seed default roles
            roles_created = await self._provision_roles(tenant_id)
            result["provisioned"]["roles"] = roles_created
            
            # Step 6: Seed default permissions
            perms_created = await self._provision_permissions(tenant_id)
            result["provisioned"]["permissions"] = perms_created
            
            # Step 7: Create tenant settings
            settings_created = await self._provision_settings(tenant_id)
            result["provisioned"]["settings"] = settings_created
            
            result["success"] = True
            logger.info(f"Successfully provisioned tenant {tenant_id}: {result['counts']}")
            
        except Exception as e:
            logger.error(f"Error provisioning tenant {tenant_id}: {e}")
            result["success"] = False
            result["errors"].append(str(e))
        
        return result
    
    async def _provision_base_crm_objects(self, tenant_id: str) -> int:
        """Provision base CRM objects (Lead, Account, Contact, etc.)"""
        try:
            from shared.constants.base_crm_template import get_base_crm_objects
        except ImportError:
            logger.warning("Could not import base_crm_template, using fallback")
            return await self._provision_fallback_objects(tenant_id)
        
        base_crm_objects = get_base_crm_objects()
        count = 0
        
        for object_name, object_config in base_crm_objects.items():
            # Check if object already exists
            existing = await self.db.tenant_objects.find_one({
                "tenant_id": tenant_id,
                "object_name": object_config.get("object_name", object_name)
            })
            if existing:
                continue
            
            object_doc = {
                "id": str(uuid.uuid4()),
                "tenant_id": tenant_id,
                "object_name": object_config.get("object_name", object_name),
                "object_label": object_config.get("object_label", object_name.title()),
                "object_plural": object_config.get("object_plural", f"{object_name.title()}s"),
                "fields": object_config.get("fields", {}),
                "name_field": object_config.get("name_field"),
                "icon": object_config.get("icon"),
                "is_custom": object_config.get("is_custom", False),
                "is_system": object_config.get("is_system", True),
                "enable_activities": object_config.get("enable_activities", False),
                "enable_search": object_config.get("enable_search", True),
                "enable_reports": object_config.get("enable_reports", True),
                "created_at": datetime.now(timezone.utc)
            }
            
            await self.db.tenant_objects.insert_one(object_doc)
            count += 1
        
        logger.info(f"Provisioned {count} base CRM objects for tenant {tenant_id}")
        return count
    
    async def _provision_fallback_objects(self, tenant_id: str) -> int:
        """Fallback basic object provisioning if templates not available"""
        basic_objects = [
            {"name": "lead", "label": "Lead", "plural": "Leads"},
            {"name": "account", "label": "Account", "plural": "Accounts"},
            {"name": "contact", "label": "Contact", "plural": "Contacts"},
            {"name": "opportunity", "label": "Opportunity", "plural": "Opportunities"},
            {"name": "task", "label": "Task", "plural": "Tasks"},
        ]
        
        count = 0
        for obj in basic_objects:
            existing = await self.db.tenant_objects.find_one({
                "tenant_id": tenant_id,
                "object_name": obj["name"]
            })
            if existing:
                continue
            
            await self.db.tenant_objects.insert_one({
                "id": str(uuid.uuid4()),
                "tenant_id": tenant_id,
                "object_name": obj["name"],
                "object_label": obj["label"],
                "object_plural": obj["plural"],
                "fields": {},
                "is_system": True,
                "created_at": datetime.now(timezone.utc)
            })
            count += 1
        
        return count
    
    async def _provision_industry_objects(self, tenant_id: str, industry: str) -> int:
        """Provision industry-specific objects"""
        try:
            from shared.constants.industry_templates import INDUSTRY_TEMPLATES as industry_templates
        except ImportError:
            logger.warning("Could not import industry templates")
            return 0
        
        if industry not in industry_templates:
            return 0
        
        industry_template = industry_templates[industry]
        count = 0
        
        for object_name, object_config in industry_template.get('objects', {}).items():
            # Check if already exists
            existing = await self.db.tenant_objects.find_one({
                "tenant_id": tenant_id,
                "object_name": object_name
            })
            if existing:
                continue
            
            object_doc = {
                "id": str(uuid.uuid4()),
                "tenant_id": tenant_id,
                "object_name": object_name,
                "object_label": object_config.get('name', object_name.title()),
                "object_plural": object_config.get('plural', f"{object_name.title()}s"),
                "fields": object_config.get('fields', {}),
                "is_custom": True,
                "created_at": datetime.now(timezone.utc)
            }
            
            if 'name_field' in object_config:
                object_doc["name_field"] = object_config["name_field"]
            
            await self.db.tenant_objects.insert_one(object_doc)
            count += 1
        
        if count > 0:
            logger.info(f"Provisioned {count} industry objects ({industry}) for tenant {tenant_id}")
        return count
    
    async def _provision_layouts(self, tenant_id: str, user_id: str) -> int:
        """Provision standard Lightning layouts"""
        try:
            from modules.lightning_builder.services.lightning_layout_service import LightningLayoutService
            layout_service = LightningLayoutService(self.db)
            
            layout_objects = ["lead", "opportunity", "contact", "account", "task", "event", "emailmessage"]
            await layout_service.seed_system_layouts(
                tenant_id=tenant_id,
                object_names=layout_objects,
                user_id=user_id
            )
            logger.info(f"Seeded layouts for tenant {tenant_id}")
            return len(layout_objects)
        except Exception as e:
            logger.warning(f"Failed to seed layouts for tenant {tenant_id}: {e}")
            return 0
    
    async def _provision_sales_app(self, tenant_id: str, user_id: str) -> bool:
        """Provision default Sales Console app"""
        try:
            from modules.app_manager.services.seeder_service import seed_default_sales_app
            result = await seed_default_sales_app(self.db, user_id, tenant_id)
            if result.get("status") == "created":
                logger.info(f"Seeded Sales Console app for tenant {tenant_id}")
                return True
            return False
        except Exception as e:
            logger.warning(f"Failed to seed Sales Console for tenant {tenant_id}: {e}")
            return False
    
    async def _provision_roles(self, tenant_id: str) -> bool:
        """Provision default roles"""
        try:
            from modules.users.services import seed_default_roles
            await seed_default_roles(self.db, tenant_id)
            return True
        except Exception as e:
            logger.warning(f"Failed to seed roles for tenant {tenant_id}: {e}")
            
            # Fallback: create basic roles
            try:
                now = datetime.now(timezone.utc)
                default_roles = [
                    {"id": str(uuid.uuid4()), "tenant_id": tenant_id, "name": "System Administrator", "api_name": "system_administrator", "level": 0, "created_at": now},
                    {"id": str(uuid.uuid4()), "tenant_id": tenant_id, "name": "Admin", "api_name": "admin", "level": 1, "created_at": now},
                    {"id": str(uuid.uuid4()), "tenant_id": tenant_id, "name": "Manager", "api_name": "manager", "level": 2, "created_at": now},
                    {"id": str(uuid.uuid4()), "tenant_id": tenant_id, "name": "User", "api_name": "user", "level": 3, "created_at": now},
                ]
                
                for role in default_roles:
                    existing = await self.db.roles.find_one({"tenant_id": tenant_id, "api_name": role["api_name"]})
                    if not existing:
                        await self.db.roles.insert_one(role)
                
                return True
            except Exception as e2:
                logger.error(f"Failed fallback role creation for tenant {tenant_id}: {e2}")
                return False
    
    async def _provision_permissions(self, tenant_id: str) -> bool:
        """Provision default permission sets"""
        try:
            from modules.users.services import seed_default_permission_sets
            await seed_default_permission_sets(self.db, tenant_id)
            return True
        except Exception as e:
            logger.warning(f"Failed to seed permissions for tenant {tenant_id}: {e}")
            
            # Fallback: create basic permission
            try:
                existing = await self.db.permission_sets.find_one({"tenant_id": tenant_id})
                if not existing:
                    await self.db.permission_sets.insert_one({
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
                        "created_at": datetime.now(timezone.utc)
                    })
                return True
            except Exception as e2:
                logger.error(f"Failed fallback permission creation for tenant {tenant_id}: {e2}")
                return False
    
    async def _provision_settings(self, tenant_id: str) -> bool:
        """Provision default tenant settings"""
        try:
            existing = await self.db.tenant_settings.find_one({"tenant_id": tenant_id})
            if existing:
                return True
            
            await self.db.tenant_settings.insert_one({
                "id": str(uuid.uuid4()),
                "tenant_id": tenant_id,
                "settings": {
                    "theme": "light",
                    "timezone": "UTC",
                    "date_format": "YYYY-MM-DD",
                    "currency": "USD",
                    "language": "en"
                },
                "created_at": datetime.now(timezone.utc)
            })
            return True
        except Exception as e:
            logger.error(f"Failed to create settings for tenant {tenant_id}: {e}")
            return False


# Singleton instance for easy access
_provisioning_service = None

def get_provisioning_service(db: AsyncIOMotorDatabase) -> TenantProvisioningService:
    """Get or create the provisioning service instance"""
    global _provisioning_service
    if _provisioning_service is None:
        _provisioning_service = TenantProvisioningService(db)
    return _provisioning_service
