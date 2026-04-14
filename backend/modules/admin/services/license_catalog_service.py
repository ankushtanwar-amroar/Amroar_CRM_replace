"""
License Catalog Service - Admin Portal
Manages global license definitions for the platform
"""
import logging
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List
from motor.motor_asyncio import AsyncIOMotorDatabase
import uuid

logger = logging.getLogger(__name__)


class LicenseCatalogService:
    """Service for managing the global license catalog"""
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.collection = db.license_catalog
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
        target_id: str = None,
        old_value: Dict = None,
        new_value: Dict = None,
        details: Dict = None
    ):
        """Log audit event for license catalog changes"""
        try:
            audit_service = await self._get_audit_service()
            await audit_service.log_action(
                action=action,
                actor_id=actor_id,
                actor_email=actor_email,
                target_id=target_id,
                target_type="license_catalog",
                old_value=old_value,
                new_value=new_value,
                details=details
            )
        except Exception as e:
            logger.error(f"Failed to log audit event: {e}")
    
    async def create_license(
        self,
        license_data: Dict[str, Any],
        actor_id: str = None,
        actor_email: str = None
    ) -> Dict[str, Any]:
        """
        Create a new license in the catalog
        
        Args:
            license_data: License definition data
            actor_id: ID of admin creating the license
            actor_email: Email of admin
        
        Returns:
            Created license entry
        """
        # Check if license code already exists
        existing = await self.collection.find_one({"license_code": license_data["license_code"]})
        if existing:
            raise ValueError(f"License code '{license_data['license_code']}' already exists")
        
        # Validate module_key exists in the system
        valid_modules = await self._get_valid_module_keys()
        if license_data["module_key"] not in valid_modules:
            logger.warning(f"Module key '{license_data['module_key']}' not in standard modules, proceeding anyway")
        
        # Validate dependencies exist
        if license_data.get("dependencies"):
            for dep_code in license_data["dependencies"]:
                dep = await self.collection.find_one({"license_code": dep_code})
                if not dep:
                    raise ValueError(f"Dependency license '{dep_code}' does not exist")
        
        now = datetime.now(timezone.utc)
        license_entry = {
            "id": str(uuid.uuid4()),
            **license_data,
            "created_at": now,
            "updated_at": now,
            "created_by": actor_id
        }
        
        await self.collection.insert_one(license_entry)
        license_entry.pop("_id", None)
        
        # Audit log
        await self._log_audit(
            action="license_catalog_created",
            actor_id=actor_id,
            actor_email=actor_email,
            target_id=license_entry["id"],
            new_value=license_entry,
            details={"license_code": license_data["license_code"], "license_name": license_data["license_name"]}
        )
        
        logger.info(f"Created license: {license_data['license_code']} by {actor_email}")
        return license_entry
    
    async def get_license(self, license_id: str) -> Optional[Dict[str, Any]]:
        """Get a license by ID"""
        return await self.collection.find_one({"id": license_id}, {"_id": 0})
    
    async def get_license_by_code(self, license_code: str) -> Optional[Dict[str, Any]]:
        """Get a license by code"""
        return await self.collection.find_one({"license_code": license_code}, {"_id": 0})
    
    async def list_licenses(
        self,
        skip: int = 0,
        limit: int = 50,
        active_only: bool = False,
        search: str = None
    ) -> Dict[str, Any]:
        """
        List all licenses in the catalog
        
        Args:
            skip: Pagination offset
            limit: Max results
            active_only: Filter to active licenses only
            search: Search term for code or name
        
        Returns:
            Paginated license list
        """
        query = {}
        
        if active_only:
            query["is_active"] = True
        
        if search:
            query["$or"] = [
                {"license_code": {"$regex": search, "$options": "i"}},
                {"license_name": {"$regex": search, "$options": "i"}},
                {"module_key": {"$regex": search, "$options": "i"}}
            ]
        
        total = await self.collection.count_documents(query)
        cursor = self.collection.find(query, {"_id": 0}).sort("sort_order", 1).skip(skip).limit(limit)
        licenses = await cursor.to_list(length=limit)
        
        return {
            "licenses": licenses,
            "total": total,
            "skip": skip,
            "limit": limit,
            "has_more": skip + limit < total
        }
    
    async def update_license(
        self,
        license_id: str,
        update_data: Dict[str, Any],
        actor_id: str = None,
        actor_email: str = None
    ) -> Optional[Dict[str, Any]]:
        """
        Update a license in the catalog
        
        Args:
            license_id: License ID to update
            update_data: Fields to update
            actor_id: ID of admin updating
            actor_email: Email of admin
        
        Returns:
            Updated license entry
        """
        # Get current state for audit
        current = await self.get_license(license_id)
        if not current:
            return None
        
        # Validate dependencies if being updated
        if update_data.get("dependencies"):
            for dep_code in update_data["dependencies"]:
                if dep_code == current["license_code"]:
                    raise ValueError("License cannot depend on itself")
                dep = await self.collection.find_one({"license_code": dep_code})
                if not dep:
                    raise ValueError(f"Dependency license '{dep_code}' does not exist")
        
        # Remove None values
        update_data = {k: v for k, v in update_data.items() if v is not None}
        update_data["updated_at"] = datetime.now(timezone.utc)
        
        await self.collection.update_one(
            {"id": license_id},
            {"$set": update_data}
        )
        
        updated = await self.get_license(license_id)
        
        # Audit log
        await self._log_audit(
            action="license_catalog_updated",
            actor_id=actor_id,
            actor_email=actor_email,
            target_id=license_id,
            old_value=current,
            new_value=updated,
            details={"license_code": current["license_code"], "changes": list(update_data.keys())}
        )
        
        logger.info(f"Updated license: {current['license_code']} by {actor_email}")
        return updated
    
    async def delete_license(
        self,
        license_id: str,
        actor_id: str = None,
        actor_email: str = None
    ) -> bool:
        """
        Delete (deactivate) a license from the catalog
        Note: We don't hard delete - we mark as inactive
        
        Args:
            license_id: License ID to delete
            actor_id: ID of admin
            actor_email: Email of admin
        
        Returns:
            True if deleted
        """
        current = await self.get_license(license_id)
        if not current:
            return False
        
        # Check if license is in use by any tenant
        tenant_usage = await self.db.tenant_licenses.count_documents({"license_id": license_id})
        if tenant_usage > 0:
            raise ValueError(f"Cannot delete license - it is used by {tenant_usage} tenant(s)")
        
        # Soft delete
        await self.collection.update_one(
            {"id": license_id},
            {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc)}}
        )
        
        # Audit log
        await self._log_audit(
            action="license_catalog_deleted",
            actor_id=actor_id,
            actor_email=actor_email,
            target_id=license_id,
            old_value=current,
            details={"license_code": current["license_code"]}
        )
        
        logger.info(f"Deleted license: {current['license_code']} by {actor_email}")
        return True
    
    async def get_license_dependencies(self, license_code: str) -> List[Dict[str, Any]]:
        """
        Get all licenses that this license depends on
        
        Args:
            license_code: License code to check
        
        Returns:
            List of dependency licenses
        """
        license_entry = await self.get_license_by_code(license_code)
        if not license_entry:
            return []
        
        dependencies = []
        for dep_code in license_entry.get("dependencies", []):
            dep = await self.get_license_by_code(dep_code)
            if dep:
                dependencies.append(dep)
        
        return dependencies
    
    async def get_dependent_licenses(self, license_code: str) -> List[Dict[str, Any]]:
        """
        Get all licenses that depend on this license
        
        Args:
            license_code: License code to check
        
        Returns:
            List of licenses that have this as a dependency
        """
        cursor = self.collection.find(
            {"dependencies": license_code},
            {"_id": 0}
        )
        return await cursor.to_list(length=100)
    
    async def _get_valid_module_keys(self) -> List[str]:
        """Get valid module keys from the system"""
        # These should match the CRM module registry
        return [
            "crm",
            "task_manager",
            "schema_builder",
            "import_builder",
            "export_builder",
            "form_builder",
            "flow_builder",
            "survey_builder",
            "chatbot_manager",
            "docflow",
            "file_manager",
            "app_manager",
            "booking",
            "field_service"
        ]
    
    async def seed_default_licenses(
        self,
        actor_id: str = "system",
        actor_email: str = "system@platform.local"
    ) -> List[Dict[str, Any]]:
        """
        Seed default license catalog entries
        Called during initial platform setup
        
        Returns:
            List of created licenses
        """
        default_licenses = [
            {
                "license_code": "CRM_CORE_SEAT",
                "license_name": "CRM Core Seat",
                "module_key": "crm",
                "description": "Core CRM functionality - required for all users",
                "assignment_type": "per_user",
                "default_price": 15.00,
                "currency": "USD",
                "billing_frequency": "monthly",
                "trial_allowed": True,
                "trial_days": 14,
                "default_visibility_mode": "hide",
                "sort_order": 1,
                "dependencies": [],
                "is_active": True,
                "is_base_license": True
            },
            {
                "license_code": "TASK_MANAGER_SEAT",
                "license_name": "Task Manager Seat",
                "module_key": "task_manager",
                "description": "Task and activity management",
                "assignment_type": "per_user",
                "default_price": 5.00,
                "currency": "USD",
                "billing_frequency": "monthly",
                "trial_allowed": True,
                "trial_days": 14,
                "default_visibility_mode": "hide",
                "sort_order": 2,
                "dependencies": ["CRM_CORE_SEAT"],
                "is_active": True,
                "is_base_license": False
            },
            {
                "license_code": "FLOW_BUILDER_SEAT",
                "license_name": "Flow Builder Seat",
                "module_key": "flow_builder",
                "description": "Visual workflow automation",
                "assignment_type": "per_user",
                "default_price": 25.00,
                "currency": "USD",
                "billing_frequency": "monthly",
                "trial_allowed": True,
                "trial_days": 14,
                "default_visibility_mode": "hide",
                "sort_order": 3,
                "dependencies": ["CRM_CORE_SEAT"],
                "is_active": True,
                "is_base_license": False
            },
            {
                "license_code": "FORM_BUILDER_SEAT",
                "license_name": "Form Builder Seat",
                "module_key": "form_builder",
                "description": "Dynamic form creation",
                "assignment_type": "per_user",
                "default_price": 15.00,
                "currency": "USD",
                "billing_frequency": "monthly",
                "trial_allowed": True,
                "trial_days": 14,
                "default_visibility_mode": "hide",
                "sort_order": 4,
                "dependencies": ["CRM_CORE_SEAT"],
                "is_active": True,
                "is_base_license": False
            },
            {
                "license_code": "DOCFLOW_SEAT",
                "license_name": "DocFlow Seat",
                "module_key": "docflow",
                "description": "Document automation and e-signatures",
                "assignment_type": "per_user",
                "default_price": 30.00,
                "currency": "USD",
                "billing_frequency": "monthly",
                "trial_allowed": True,
                "trial_days": 14,
                "default_visibility_mode": "hide",
                "sort_order": 5,
                "dependencies": ["CRM_CORE_SEAT"],
                "is_active": True,
                "is_base_license": False
            },
            {
                "license_code": "SURVEY_BUILDER_SEAT",
                "license_name": "Survey Builder Seat",
                "module_key": "survey_builder",
                "description": "Survey creation and analytics",
                "assignment_type": "per_user",
                "default_price": 20.00,
                "currency": "USD",
                "billing_frequency": "monthly",
                "trial_allowed": True,
                "trial_days": 14,
                "default_visibility_mode": "hide",
                "sort_order": 6,
                "dependencies": ["CRM_CORE_SEAT"],
                "is_active": True,
                "is_base_license": False
            },
            {
                "license_code": "CHATBOT_SEAT",
                "license_name": "Chatbot Manager Seat",
                "module_key": "chatbot_manager",
                "description": "AI chatbot configuration",
                "assignment_type": "per_user",
                "default_price": 35.00,
                "currency": "USD",
                "billing_frequency": "monthly",
                "trial_allowed": True,
                "trial_days": 14,
                "default_visibility_mode": "hide",
                "sort_order": 7,
                "dependencies": ["CRM_CORE_SEAT"],
                "is_active": True,
                "is_base_license": False
            },
            {
                "license_code": "ADMIN_CONSOLE_SEAT",
                "license_name": "Admin Console Seat",
                "module_key": "schema_builder",
                "description": "Advanced admin and schema management",
                "assignment_type": "per_user",
                "default_price": 10.00,
                "currency": "USD",
                "billing_frequency": "monthly",
                "trial_allowed": True,
                "trial_days": 14,
                "default_visibility_mode": "hide",
                "sort_order": 8,
                "dependencies": ["CRM_CORE_SEAT"],
                "is_active": True,
                "is_base_license": False
            }
        ]
        
        created = []
        for license_data in default_licenses:
            # Check if already exists
            existing = await self.get_license_by_code(license_data["license_code"])
            if not existing:
                try:
                    license_entry = await self.create_license(license_data, actor_id, actor_email)
                    created.append(license_entry)
                except Exception as e:
                    logger.error(f"Failed to create default license {license_data['license_code']}: {e}")
        
        logger.info(f"Seeded {len(created)} default licenses")
        return created


# Singleton instance
_license_catalog_service = None

def get_license_catalog_service(db: AsyncIOMotorDatabase) -> LicenseCatalogService:
    """Get or create the license catalog service instance"""
    global _license_catalog_service
    if _license_catalog_service is None:
        _license_catalog_service = LicenseCatalogService(db)
    return _license_catalog_service
