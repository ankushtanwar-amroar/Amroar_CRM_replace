"""
Tenant Modules Service - Control Plane
Manages module entitlements for tenants with dedicated tenant_modules collection.
Includes migration layer for backward compatibility with tenants that store modules in tenant record.
"""
import logging
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List
from motor.motor_asyncio import AsyncIOMotorDatabase
import uuid

logger = logging.getLogger(__name__)

# Available platform modules
PLATFORM_MODULES = {
    "sales_console": {"name": "Sales Console", "category": "core", "is_premium": False, "sort_order": 0},
    "crm": {"name": "CRM", "category": "core", "is_premium": False, "sort_order": 1},
    "schema_builder": {"name": "Schema Builder", "category": "admin", "is_premium": False, "sort_order": 2},
    "form_builder": {"name": "Form Builder", "category": "automation", "is_premium": False, "sort_order": 3},
    "survey_builder": {"name": "Survey Builder", "category": "engagement", "is_premium": True, "sort_order": 4},
    "flow_builder": {"name": "Flow Builder", "category": "automation", "is_premium": False, "sort_order": 5},
    "task_manager": {"name": "Task Manager", "category": "productivity", "is_premium": False, "sort_order": 6},
    "import_builder": {"name": "Import Builder", "category": "data", "is_premium": False, "sort_order": 7},
    "export_builder": {"name": "Export Builder", "category": "data", "is_premium": False, "sort_order": 8},
    "chatbot_manager": {"name": "Chatbot Manager", "category": "ai", "is_premium": True, "sort_order": 9},
    "docflow": {"name": "DocFlow", "category": "advanced", "is_premium": True, "sort_order": 10},
    "file_manager": {"name": "File Manager", "category": "data", "is_premium": False, "sort_order": 11},
    "app_manager": {"name": "App Manager", "category": "admin", "is_premium": False, "sort_order": 12},
    "email_templates": {"name": "Email Templates", "category": "engagement", "is_premium": False, "sort_order": 13},
    "booking": {"name": "Booking", "category": "engagement", "is_premium": True, "sort_order": 14},
    "ai_features": {"name": "AI Features", "category": "ai", "is_premium": True, "sort_order": 15},
    "field_service": {"name": "Field Service", "category": "advanced", "is_premium": True, "sort_order": 16},
    "reporting": {"name": "Advanced Reporting", "category": "analytics", "is_premium": True, "sort_order": 17},
    "features": {"name": "Features", "category": "config", "is_premium": False, "sort_order": 80},
    "connections": {"name": "Connections", "category": "config", "is_premium": False, "sort_order": 81},
}


class TenantModulesService:
    """
    Service for managing tenant module entitlements.
    
    Provides:
    - Module enablement/disablement with source tracking
    - Migration from legacy tenant.module_entitlements array
    - Time-limited module access (trials, promos)
    - Bulk module updates from plan changes
    """
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.collection = db.tenant_modules
    
    async def get_tenant_modules(self, tenant_id: str) -> List[Dict[str, Any]]:
        """
        Get all module entitlements for a tenant.
        Includes migration from legacy storage if needed.
        Enriches data with module_name and enabled_source for API response.
        """
        # First check if modules exist in new collection
        modules = await self.collection.find(
            {"tenant_id": tenant_id},
            {"_id": 0}
        ).to_list(100)
        
        if modules:
            # Enrich with module_name and enabled_source for API response
            for module in modules:
                module["is_active"] = self._is_module_active(module)
                # Add module_name if missing
                if not module.get("module_name"):
                    module_info = PLATFORM_MODULES.get(module.get("module_code", ""), {})
                    module["module_name"] = module_info.get("name", module.get("module_code", "").replace("_", " ").title())
                # Add enabled_source if missing
                if not module.get("enabled_source"):
                    module["enabled_source"] = "PLAN"
            return modules
        
        # Migration: Check if tenant has legacy module_entitlements array
        tenant = await self.db.tenants.find_one({"id": tenant_id}, {"_id": 0})
        if tenant and tenant.get("module_entitlements"):
            # Migrate legacy modules to new collection
            logger.info(f"Migrating legacy modules for tenant {tenant_id}")
            modules = await self._migrate_legacy_modules(tenant_id, tenant["module_entitlements"])
            return modules
        
        return []
    
    async def _migrate_legacy_modules(self, tenant_id: str, legacy_modules: List[str]) -> List[Dict[str, Any]]:
        """Migrate legacy module_entitlements array to tenant_modules collection"""
        now = datetime.now(timezone.utc)
        migrated_modules = []
        
        for module_code in legacy_modules:
            module_info = PLATFORM_MODULES.get(module_code, {"name": module_code.replace("_", " ").title()})
            
            module_doc = {
                "id": str(uuid.uuid4()),
                "tenant_id": tenant_id,
                "module_code": module_code,
                "module_name": module_info.get("name", module_code),
                "is_enabled": True,
                "enabled_source": "PLAN",
                "start_at": now,
                "end_at": None,
                "created_at": now,
                "updated_at": now,
                "migrated_from_legacy": True
            }
            
            migrated_modules.append(module_doc)
        
        if migrated_modules:
            await self.collection.insert_many(migrated_modules)
            logger.info(f"Migrated {len(migrated_modules)} modules for tenant {tenant_id}")
        
        # Return without _id
        for m in migrated_modules:
            m.pop("_id", None)
            m["is_active"] = True
        
        return migrated_modules
    
    def _is_module_active(self, module: Dict[str, Any]) -> bool:
        """Check if a module is currently active based on dates and enabled flag"""
        if not module.get("is_enabled"):
            return False
        
        now = datetime.now(timezone.utc)
        
        start_at = module.get("start_at")
        if start_at:
            if isinstance(start_at, datetime):
                # Make timezone-aware if needed
                if start_at.tzinfo is None:
                    start_at = start_at.replace(tzinfo=timezone.utc)
                if start_at > now:
                    return False
        
        end_at = module.get("end_at")
        if end_at:
            if isinstance(end_at, datetime):
                # Make timezone-aware if needed
                if end_at.tzinfo is None:
                    end_at = end_at.replace(tzinfo=timezone.utc)
                if end_at < now:
                    return False
        
        return True
    
    async def get_enabled_module_codes(self, tenant_id: str) -> List[str]:
        """Get list of enabled module codes for a tenant (for runtime checks)"""
        modules = await self.get_tenant_modules(tenant_id)
        return [m["module_code"] for m in modules if m.get("is_active", m.get("is_enabled", False))]
    
    async def is_module_enabled(self, tenant_id: str, module_code: str) -> bool:
        """Check if a specific module is enabled for a tenant"""
        module = await self.collection.find_one({
            "tenant_id": tenant_id,
            "module_code": module_code
        }, {"_id": 0})
        
        if module:
            return self._is_module_active(module)
        
        # Check legacy storage
        tenant = await self.db.tenants.find_one({"id": tenant_id}, {"_id": 0})
        if tenant and module_code in tenant.get("module_entitlements", []):
            return True
        
        return False
    
    async def enable_module(
        self,
        tenant_id: str,
        module_code: str,
        enabled_source: str = "MANUAL_OVERRIDE",
        start_at: datetime = None,
        end_at: datetime = None
    ) -> Dict[str, Any]:
        """Enable a module for a tenant"""
        now = datetime.now(timezone.utc)
        module_info = PLATFORM_MODULES.get(module_code, {"name": module_code.replace("_", " ").title()})
        
        # Check if module record exists
        existing = await self.collection.find_one({
            "tenant_id": tenant_id,
            "module_code": module_code
        })
        
        if existing:
            # Update existing
            await self.collection.update_one(
                {"id": existing["id"]},
                {"$set": {
                    "is_enabled": True,
                    "enabled_source": enabled_source,
                    "start_at": start_at or now,
                    "end_at": end_at,
                    "updated_at": now
                }}
            )
            module_id = existing["id"]
        else:
            # Create new
            module_id = str(uuid.uuid4())
            module_doc = {
                "id": module_id,
                "tenant_id": tenant_id,
                "module_code": module_code,
                "module_name": module_info.get("name", module_code),
                "is_enabled": True,
                "enabled_source": enabled_source,
                "start_at": start_at or now,
                "end_at": end_at,
                "created_at": now,
                "updated_at": now
            }
            await self.collection.insert_one(module_doc)
        
        # Also update legacy array for backward compatibility
        await self._update_legacy_modules(tenant_id)
        
        return await self.collection.find_one({"id": module_id}, {"_id": 0})
    
    async def disable_module(self, tenant_id: str, module_code: str) -> bool:
        """Disable a module for a tenant (creates record if needed)"""
        now = datetime.now(timezone.utc)
        
        result = await self.collection.update_one(
            {"tenant_id": tenant_id, "module_code": module_code},
            {"$set": {
                "is_enabled": False,
                "updated_at": now,
                "enabled_source": "MANUAL_OVERRIDE",
            },
            "$setOnInsert": {
                "id": str(__import__('uuid').uuid4()),
                "tenant_id": tenant_id,
                "module_code": module_code,
                "module_name": PLATFORM_MODULES.get(module_code, {}).get("name", module_code),
                "created_at": now,
            }},
            upsert=True,
        )
        
        # Update legacy array
        await self._update_legacy_modules(tenant_id)
        
        return result.modified_count > 0 or result.upserted_id is not None
    
    async def _update_legacy_modules(self, tenant_id: str):
        """Update legacy module_entitlements array from tenant_modules collection"""
        modules = await self.collection.find({
            "tenant_id": tenant_id,
            "is_enabled": True
        }, {"module_code": 1}).to_list(100)
        
        enabled_codes = [m["module_code"] for m in modules]
        
        await self.db.tenants.update_one(
            {"id": tenant_id},
            {"$set": {"module_entitlements": enabled_codes}}
        )
    
    async def set_modules_from_plan(
        self,
        tenant_id: str,
        module_codes: List[str]
    ) -> List[Dict[str, Any]]:
        """
        Set modules based on plan defaults.
        Disables modules not in the list, enables those in the list.
        Does not affect manually overridden modules.
        """
        now = datetime.now(timezone.utc)
        
        # Get current modules
        current_modules = await self.get_tenant_modules(tenant_id)
        current_codes = {m["module_code"]: m for m in current_modules}
        
        results = []
        
        # Enable plan modules
        for code in module_codes:
            if code in current_codes:
                # Only update if source is PLAN (don't override manual)
                if current_codes[code].get("enabled_source") == "PLAN":
                    await self.collection.update_one(
                        {"tenant_id": tenant_id, "module_code": code},
                        {"$set": {"is_enabled": True, "updated_at": now}}
                    )
            else:
                # Create new
                await self.enable_module(tenant_id, code, enabled_source="PLAN")
        
        # Disable modules not in plan (only if source is PLAN)
        for code, module in current_codes.items():
            if code not in module_codes and module.get("enabled_source") == "PLAN":
                await self.disable_module(tenant_id, code)
        
        # Update legacy array
        await self._update_legacy_modules(tenant_id)
        
        return await self.get_tenant_modules(tenant_id)
    
    async def bulk_update_modules(
        self,
        tenant_id: str,
        modules: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """
        Bulk update modules for a tenant.
        modules: [{"module_code": "...", "is_enabled": True/False, "enabled_source": "..."}]
        """
        now = datetime.now(timezone.utc)
        
        for module_data in modules:
            code = module_data.get("module_code")
            is_enabled = module_data.get("is_enabled", True)
            source = module_data.get("enabled_source", "MANUAL_OVERRIDE")
            
            if is_enabled:
                await self.enable_module(tenant_id, code, enabled_source=source)
            else:
                await self.disable_module(tenant_id, code)
        
        return await self.get_tenant_modules(tenant_id)
    
    def get_available_modules(self) -> List[Dict[str, Any]]:
        """Get all available platform modules"""
        return [
            {
                "module_code": code,
                "module_name": info["name"],
                "category": info["category"],
                "is_premium": info["is_premium"],
                "sort_order": info["sort_order"]
            }
            for code, info in PLATFORM_MODULES.items()
        ]


# Singleton
_tenant_modules_service = None

def get_tenant_modules_service(db: AsyncIOMotorDatabase) -> TenantModulesService:
    global _tenant_modules_service
    if _tenant_modules_service is None:
        _tenant_modules_service = TenantModulesService(db)
    return _tenant_modules_service
