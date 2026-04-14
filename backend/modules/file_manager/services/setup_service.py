"""
File Manager - Setup Service
Handles initial setup, default data creation, and configuration.
"""

from typing import Optional, List, Dict, Any
from datetime import datetime
from motor.motor_asyncio import AsyncIOMotorDatabase
import logging
import uuid

from ..models.category_models import Category, Tag, Sensitivity
from ..models.folder_models import Library, LibraryRole

logger = logging.getLogger(__name__)

# Collection names
CATEGORIES_COLLECTION = "fm_categories"
TAGS_COLLECTION = "fm_tags"
SENSITIVITIES_COLLECTION = "fm_sensitivities"
LIBRARIES_COLLECTION = "fm_libraries"
SETTINGS_COLLECTION = "fm_settings"


# Default data definitions
DEFAULT_CATEGORIES = [
    {"name": "Contracts", "icon": "file-text", "color": "#3B82F6", "object_name": None},
    {"name": "Proposals", "icon": "file-check", "color": "#10B981", "object_name": None},
    {"name": "Invoices", "icon": "receipt", "color": "#F59E0B", "object_name": None},
    {"name": "Reports", "icon": "bar-chart", "color": "#8B5CF6", "object_name": None},
    {"name": "Presentations", "icon": "presentation", "color": "#EC4899", "object_name": None},
    {"name": "Images", "icon": "image", "color": "#06B6D4", "object_name": None},
    {"name": "Documents", "icon": "file", "color": "#6B7280", "object_name": None},
    {"name": "Spreadsheets", "icon": "table", "color": "#22C55E", "object_name": None},
]

DEFAULT_TAGS = [
    {"name": "Important", "color": "#EF4444"},
    {"name": "Draft", "color": "#F59E0B"},
    {"name": "Final", "color": "#10B981"},
    {"name": "Archived", "color": "#6B7280"},
    {"name": "Pending Review", "color": "#8B5CF6"},
    {"name": "Approved", "color": "#22C55E"},
    {"name": "Confidential", "color": "#DC2626"},
    {"name": "Template", "color": "#3B82F6"},
]

DEFAULT_SENSITIVITIES = [
    {"name": "Public", "level": 0, "color": "#22C55E", "icon": "globe", "description": "Publicly accessible"},
    {"name": "Internal", "level": 1, "color": "#3B82F6", "icon": "building", "description": "Internal use only", "is_default": True},
    {"name": "Confidential", "level": 2, "color": "#F59E0B", "icon": "lock", "description": "Restricted access"},
    {"name": "Restricted", "level": 3, "color": "#EF4444", "icon": "shield", "description": "Highly restricted", "requires_audit_acknowledgment": True},
]

DEFAULT_LIBRARIES = [
    {
        "name": "General Library",
        "description": "Default library for all files. Open to all users.",
        "icon": "folder",
        "color": "#3B82F6",
        "is_public": True,
        "default_role": "contributor",
        "is_default": True
    },
    {
        "name": "Legal Library",
        "description": "Restricted library for legal documents. Admin and Library Manager access only.",
        "icon": "scale",
        "color": "#DC2626",
        "is_public": False,
        "default_role": "viewer",
        "allowed_roles": ["admin", "library_manager"],
        "is_default": False
    }
]


class SetupService:
    """Service for File Manager setup and configuration"""
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.categories = db[CATEGORIES_COLLECTION]
        self.tags = db[TAGS_COLLECTION]
        self.sensitivities = db[SENSITIVITIES_COLLECTION]
        self.libraries = db[LIBRARIES_COLLECTION]
        self.settings = db[SETTINGS_COLLECTION]
    
    async def is_initialized(self, tenant_id: str) -> bool:
        """Check if File Manager has been initialized for tenant"""
        setting = await self.settings.find_one({
            "tenant_id": tenant_id,
            "key": "initialized"
        })
        return setting is not None and setting.get("value") is True
    
    async def initialize_tenant(
        self,
        tenant_id: str,
        user_id: str
    ) -> Dict[str, Any]:
        """Initialize File Manager for a tenant with default data"""
        if await self.is_initialized(tenant_id):
            return {"success": True, "message": "Already initialized"}
        
        logger.info(f"[Setup] Initializing File Manager for tenant: {tenant_id}")
        
        results = {
            "categories_created": 0,
            "tags_created": 0,
            "sensitivities_created": 0,
            "libraries_created": 0
        }
        
        # Create default categories
        for cat_data in DEFAULT_CATEGORIES:
            category = Category(
                tenant_id=tenant_id,
                name=cat_data["name"],
                icon=cat_data.get("icon"),
                color=cat_data.get("color"),
                object_name=cat_data.get("object_name"),
                created_by=user_id
            )
            await self.categories.insert_one(category.dict())
            results["categories_created"] += 1
        
        # Create default tags
        for tag_data in DEFAULT_TAGS:
            tag = Tag(
                tenant_id=tenant_id,
                name=tag_data["name"],
                color=tag_data.get("color"),
                tag_type="system",
                created_by=user_id
            )
            await self.tags.insert_one(tag.dict())
            results["tags_created"] += 1
        
        # Create default sensitivities
        for sens_data in DEFAULT_SENSITIVITIES:
            sensitivity = Sensitivity(
                tenant_id=tenant_id,
                name=sens_data["name"],
                description=sens_data.get("description"),
                level=sens_data.get("level", 0),
                color=sens_data.get("color"),
                icon=sens_data.get("icon"),
                is_default=sens_data.get("is_default", False),
                requires_audit_acknowledgment=sens_data.get("requires_audit_acknowledgment", False),
                created_by=user_id
            )
            await self.sensitivities.insert_one(sensitivity.dict())
            results["sensitivities_created"] += 1
        
        # Create default libraries
        for lib_data in DEFAULT_LIBRARIES:
            library = Library(
                tenant_id=tenant_id,
                name=lib_data["name"],
                description=lib_data.get("description"),
                icon=lib_data.get("icon"),
                color=lib_data.get("color"),
                is_public=lib_data.get("is_public", True),
                default_role=LibraryRole(lib_data.get("default_role", "viewer")),
                allowed_roles=lib_data.get("allowed_roles", []),
                is_default=lib_data.get("is_default", False),
                created_by=user_id,
                member_count=1  # Creator is auto-added
            )
            await self.libraries.insert_one(library.dict())
            
            # Add creator as manager of all libraries
            from ..models.folder_models import LibraryMember
            member = LibraryMember(
                tenant_id=tenant_id,
                library_id=library.id,
                user_id=user_id,
                role=LibraryRole.MANAGER,
                added_by=user_id
            )
            await self.db["fm_library_members"].insert_one(member.dict())
            
            results["libraries_created"] += 1
        
        # Mark as initialized
        await self.settings.insert_one({
            "id": str(uuid.uuid4()),
            "tenant_id": tenant_id,
            "key": "initialized",
            "value": True,
            "created_at": datetime.utcnow()
        })
        
        # Store feature flags
        await self.settings.insert_one({
            "id": str(uuid.uuid4()),
            "tenant_id": tenant_id,
            "key": "feature_flags",
            "value": {
                "multi_record_linking": True,
                "ai_auto_tag": True,
                "public_links": True,
                "version_history": True
            },
            "created_at": datetime.utcnow()
        })
        
        logger.info(f"[Setup] Initialization complete: {results}")
        
        return {"success": True, "results": results}
    
    async def get_settings(self, tenant_id: str) -> Dict[str, Any]:
        """Get all settings for tenant"""
        cursor = self.settings.find(
            {"tenant_id": tenant_id},
            {"_id": 0}
        )
        settings = await cursor.to_list(length=100)
        
        return {s["key"]: s["value"] for s in settings}
    
    async def update_setting(
        self,
        tenant_id: str,
        key: str,
        value: Any
    ) -> bool:
        """Update a setting"""
        await self.settings.update_one(
            {"tenant_id": tenant_id, "key": key},
            {
                "$set": {"value": value, "updated_at": datetime.utcnow()},
                "$setOnInsert": {"id": str(uuid.uuid4()), "created_at": datetime.utcnow()}
            },
            upsert=True
        )
        return True
    
    async def get_feature_flags(self, tenant_id: str) -> Dict[str, bool]:
        """Get feature flags"""
        setting = await self.settings.find_one({
            "tenant_id": tenant_id,
            "key": "feature_flags"
        })
        return setting.get("value", {}) if setting else {}
    
    async def update_feature_flag(
        self,
        tenant_id: str,
        flag: str,
        enabled: bool
    ) -> bool:
        """Update a specific feature flag"""
        await self.settings.update_one(
            {"tenant_id": tenant_id, "key": "feature_flags"},
            {"$set": {f"value.{flag}": enabled}}
        )
        return True
    
    # Category management
    
    async def get_categories(
        self,
        tenant_id: str,
        object_name: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """Get categories, optionally filtered by object"""
        query = {"tenant_id": tenant_id, "is_active": True}
        
        if object_name:
            query["$or"] = [
                {"object_name": object_name},
                {"object_name": None}  # Global categories
            ]
        
        return await self.categories.find(
            query,
            {"_id": 0}
        ).sort("sort_order", 1).to_list(length=100)
    
    async def create_category(
        self,
        tenant_id: str,
        user_id: str,
        data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Create a new category"""
        category = Category(
            tenant_id=tenant_id,
            created_by=user_id,
            **data
        )
        await self.categories.insert_one(category.dict())
        return category.dict()
    
    async def update_category(
        self,
        tenant_id: str,
        category_id: str,
        data: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """Update a category"""
        data["updated_at"] = datetime.utcnow()
        result = await self.categories.find_one_and_update(
            {"tenant_id": tenant_id, "id": category_id},
            {"$set": data},
            return_document=True,
            projection={"_id": 0}
        )
        return result
    
    async def delete_category(
        self,
        tenant_id: str,
        category_id: str
    ) -> bool:
        """Delete a category (soft delete)"""
        result = await self.categories.update_one(
            {"tenant_id": tenant_id, "id": category_id},
            {"$set": {"is_active": False}}
        )
        return result.modified_count > 0
    
    # Tag management
    
    async def get_tags(self, tenant_id: str) -> List[Dict[str, Any]]:
        """Get all tags"""
        return await self.tags.find(
            {"tenant_id": tenant_id, "is_active": True},
            {"_id": 0}
        ).sort("name", 1).to_list(length=200)
    
    async def create_tag(
        self,
        tenant_id: str,
        user_id: str,
        data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Create a new tag"""
        tag = Tag(
            tenant_id=tenant_id,
            created_by=user_id,
            **data
        )
        await self.tags.insert_one(tag.dict())
        return tag.dict()
    
    async def update_tag(
        self,
        tenant_id: str,
        tag_id: str,
        data: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """Update a tag"""
        data["updated_at"] = datetime.utcnow()
        result = await self.tags.find_one_and_update(
            {"tenant_id": tenant_id, "id": tag_id},
            {"$set": data},
            return_document=True,
            projection={"_id": 0}
        )
        return result
    
    async def delete_tag(
        self,
        tenant_id: str,
        tag_id: str
    ) -> bool:
        """Delete a tag (soft delete)"""
        result = await self.tags.update_one(
            {"tenant_id": tenant_id, "id": tag_id},
            {"$set": {"is_active": False}}
        )
        return result.modified_count > 0
    
    # Sensitivity management
    
    async def get_sensitivities(self, tenant_id: str) -> List[Dict[str, Any]]:
        """Get all sensitivity levels"""
        return await self.sensitivities.find(
            {"tenant_id": tenant_id, "is_active": True},
            {"_id": 0}
        ).sort("level", 1).to_list(length=20)
    
    async def create_sensitivity(
        self,
        tenant_id: str,
        user_id: str,
        data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Create a new sensitivity level"""
        sensitivity = Sensitivity(
            tenant_id=tenant_id,
            created_by=user_id,
            **data
        )
        await self.sensitivities.insert_one(sensitivity.dict())
        return sensitivity.dict()
    
    async def update_sensitivity(
        self,
        tenant_id: str,
        sensitivity_id: str,
        data: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """Update a sensitivity level"""
        data["updated_at"] = datetime.utcnow()
        result = await self.sensitivities.find_one_and_update(
            {"tenant_id": tenant_id, "id": sensitivity_id},
            {"$set": data},
            return_document=True,
            projection={"_id": 0}
        )
        return result
    
    async def delete_sensitivity(
        self,
        tenant_id: str,
        sensitivity_id: str
    ) -> bool:
        """Delete a sensitivity level (soft delete)"""
        result = await self.sensitivities.update_one(
            {"tenant_id": tenant_id, "id": sensitivity_id},
            {"$set": {"is_active": False}}
        )
        return result.modified_count > 0
