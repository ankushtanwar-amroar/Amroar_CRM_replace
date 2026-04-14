"""
File Manager - Extended Setup Service
Handles all admin configuration for the 9-tab setup interface.
"""

from typing import Optional, List, Dict, Any
from datetime import datetime
from motor.motor_asyncio import AsyncIOMotorDatabase
import logging
import uuid

logger = logging.getLogger(__name__)

# Collection names for extended settings
AUTOMATION_RULES_COLLECTION = "fm_automation_rules"
STORAGE_CONNECTORS_COLLECTION = "fm_storage_connectors"
RETENTION_POLICIES_COLLECTION = "fm_retention_policies"


class ExtendedSetupService:
    """Extended service for File Manager admin configuration"""
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.settings = db["fm_settings"]
        self.categories = db["fm_categories"]
        self.tags = db["fm_tags"]
        self.sensitivities = db["fm_sensitivities"]
        self.libraries = db["fm_libraries"]
        self.automation_rules = db[AUTOMATION_RULES_COLLECTION]
        self.storage_connectors = db[STORAGE_CONNECTORS_COLLECTION]
        self.retention_policies = db[RETENTION_POLICIES_COLLECTION]
    
    # =========================================================================
    # TAB 1 - GENERAL SETTINGS
    # =========================================================================
    
    async def get_general_settings(self, tenant_id: str) -> Dict[str, Any]:
        """Get all general settings"""
        defaults = {
            "module_enabled": True,
            "multi_record_linking": True,
            "default_storage_mode": "crm",
            "default_public_link_expiry_days": 7,
            "default_public_link_require_password": False,
            "default_public_link_allow_download": True,
            "notification_on_upload": True,
            "notification_on_share": True,
            "notification_on_link": False
        }
        
        setting = await self.settings.find_one({
            "tenant_id": tenant_id,
            "key": "general_settings"
        })
        
        if setting:
            return {**defaults, **setting.get("value", {})}
        return defaults
    
    async def update_general_settings(
        self,
        tenant_id: str,
        settings: Dict[str, Any]
    ) -> bool:
        """Update general settings"""
        await self.settings.update_one(
            {"tenant_id": tenant_id, "key": "general_settings"},
            {
                "$set": {"value": settings, "updated_at": datetime.utcnow()},
                "$setOnInsert": {"id": str(uuid.uuid4()), "created_at": datetime.utcnow()}
            },
            upsert=True
        )
        
        # Also update feature flags for backwards compatibility
        if "multi_record_linking" in settings:
            await self.settings.update_one(
                {"tenant_id": tenant_id, "key": "feature_flags"},
                {"$set": {"value.multi_record_linking": settings["multi_record_linking"]}}
            )
        
        return True
    
    # =========================================================================
    # TAB 2 - FILE TYPES & CATEGORIES
    # =========================================================================
    
    async def get_categories_config(self, tenant_id: str) -> List[Dict[str, Any]]:
        """Get all categories with their configuration"""
        cursor = self.categories.find(
            {"tenant_id": tenant_id, "is_active": {"$ne": False}},
            {"_id": 0}
        )
        return await cursor.to_list(length=100)
    
    async def create_category(
        self,
        tenant_id: str,
        user_id: str,
        data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Create a new category with validation rules"""
        category = {
            "id": str(uuid.uuid4()),
            "tenant_id": tenant_id,
            "name": data["name"],
            "description": data.get("description"),
            "icon": data.get("icon", "file"),
            "color": data.get("color", "#6B7280"),
            "object_name": data.get("object_name"),  # null = all objects
            "allowed_file_types": data.get("allowed_file_types", []),  # e.g., [".pdf", ".docx"]
            "required_tags": data.get("required_tags", []),
            "required_sensitivity": data.get("required_sensitivity"),
            "default_folder_id": data.get("default_folder_id"),
            "default_library_id": data.get("default_library_id"),
            "max_file_size_mb": data.get("max_file_size_mb"),
            "is_active": True,
            "created_by": user_id,
            "created_at": datetime.utcnow()
        }
        
        await self.categories.insert_one(category)
        if "_id" in category:
            del category["_id"]
        return category
    
    async def update_category(
        self,
        tenant_id: str,
        category_id: str,
        data: Dict[str, Any]
    ) -> bool:
        """Update category configuration"""
        update_fields = {k: v for k, v in data.items() if k not in ["id", "tenant_id", "created_by", "created_at"]}
        update_fields["updated_at"] = datetime.utcnow()
        
        result = await self.categories.update_one(
            {"tenant_id": tenant_id, "id": category_id},
            {"$set": update_fields}
        )
        return result.modified_count > 0
    
    async def delete_category(self, tenant_id: str, category_id: str) -> bool:
        """Soft delete a category"""
        result = await self.categories.update_one(
            {"tenant_id": tenant_id, "id": category_id},
            {"$set": {"is_active": False, "deleted_at": datetime.utcnow()}}
        )
        return result.modified_count > 0
    
    # =========================================================================
    # TAB 3 - TAGS & METADATA RULES
    # =========================================================================
    
    async def get_tags_config(self, tenant_id: str) -> Dict[str, Any]:
        """Get tags configuration"""
        tags = await self.tags.find(
            {"tenant_id": tenant_id, "is_active": {"$ne": False}},
            {"_id": 0}
        ).to_list(length=200)
        
        # Get tag settings
        tag_settings = await self.settings.find_one({
            "tenant_id": tenant_id,
            "key": "tag_settings"
        })
        
        return {
            "tags": tags,
            "settings": tag_settings.get("value", {
                "allow_freeform_tags": True,
                "max_tags_per_file": 10,
                "tag_validation_enabled": False
            }) if tag_settings else {
                "allow_freeform_tags": True,
                "max_tags_per_file": 10,
                "tag_validation_enabled": False
            }
        }
    
    async def create_tag(
        self,
        tenant_id: str,
        user_id: str,
        data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Create a new tag"""
        tag = {
            "id": str(uuid.uuid4()),
            "tenant_id": tenant_id,
            "name": data["name"],
            "color": data.get("color", "#6B7280"),
            "tag_type": data.get("tag_type", "user"),  # system, user, category
            "description": data.get("description"),
            "key_value": data.get("key_value"),  # For key-value pairs
            "required_for_categories": data.get("required_for_categories", []),
            "required_for_objects": data.get("required_for_objects", []),
            "is_active": True,
            "created_by": user_id,
            "created_at": datetime.utcnow()
        }
        
        await self.tags.insert_one(tag)
        return {k: v for k, v in tag.items() if k != "_id"}
    
    async def update_tag(
        self,
        tenant_id: str,
        tag_id: str,
        data: Dict[str, Any]
    ) -> bool:
        """Update tag"""
        update_fields = {k: v for k, v in data.items() if k not in ["id", "tenant_id"]}
        update_fields["updated_at"] = datetime.utcnow()
        
        result = await self.tags.update_one(
            {"tenant_id": tenant_id, "id": tag_id},
            {"$set": update_fields}
        )
        return result.modified_count > 0
    
    async def delete_tag(self, tenant_id: str, tag_id: str) -> bool:
        """Soft delete a tag"""
        result = await self.tags.update_one(
            {"tenant_id": tenant_id, "id": tag_id},
            {"$set": {"is_active": False, "deleted_at": datetime.utcnow()}}
        )
        return result.modified_count > 0
    
    async def update_tag_settings(
        self,
        tenant_id: str,
        settings: Dict[str, Any]
    ) -> bool:
        """Update tag settings"""
        await self.settings.update_one(
            {"tenant_id": tenant_id, "key": "tag_settings"},
            {
                "$set": {"value": settings, "updated_at": datetime.utcnow()},
                "$setOnInsert": {"id": str(uuid.uuid4()), "created_at": datetime.utcnow()}
            },
            upsert=True
        )
        return True
    
    # =========================================================================
    # TAB 4 - FOLDERS & LIBRARIES
    # =========================================================================
    
    async def get_libraries_config(self, tenant_id: str) -> List[Dict[str, Any]]:
        """Get all libraries with member counts"""
        libraries = await self.libraries.find(
            {"tenant_id": tenant_id, "is_active": {"$ne": False}},
            {"_id": 0}
        ).to_list(length=50)
        
        # Get member counts
        for lib in libraries:
            count = await self.db["fm_library_members"].count_documents({
                "tenant_id": tenant_id,
                "library_id": lib["id"]
            })
            lib["member_count"] = count
        
        return libraries
    
    async def create_library(
        self,
        tenant_id: str,
        user_id: str,
        data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Create a new library"""
        library = {
            "id": str(uuid.uuid4()),
            "tenant_id": tenant_id,
            "name": data["name"],
            "description": data.get("description"),
            "icon": data.get("icon", "folder"),
            "color": data.get("color", "#3B82F6"),
            "is_public": data.get("is_public", False),
            "default_role": data.get("default_role", "viewer"),
            "is_default": data.get("is_default", False),
            "publish_rules": data.get("publish_rules", {}),
            "folder_template_id": data.get("folder_template_id"),
            "is_active": True,
            "created_by": user_id,
            "created_at": datetime.utcnow(),
            "file_count": 0,
            "total_size_bytes": 0
        }
        
        await self.libraries.insert_one(library)
        
        # Add creator as manager
        await self.db["fm_library_members"].insert_one({
            "id": str(uuid.uuid4()),
            "tenant_id": tenant_id,
            "library_id": library["id"],
            "user_id": user_id,
            "role": "manager",
            "added_by": user_id,
            "added_at": datetime.utcnow()
        })
        
        return {k: v for k, v in library.items() if k != "_id"}
    
    async def update_library(
        self,
        tenant_id: str,
        library_id: str,
        data: Dict[str, Any]
    ) -> bool:
        """Update library"""
        update_fields = {k: v for k, v in data.items() if k not in ["id", "tenant_id"]}
        update_fields["updated_at"] = datetime.utcnow()
        
        result = await self.libraries.update_one(
            {"tenant_id": tenant_id, "id": library_id},
            {"$set": update_fields}
        )
        return result.modified_count > 0
    
    async def delete_library(self, tenant_id: str, library_id: str) -> bool:
        """Soft delete a library"""
        # Check if default library
        lib = await self.libraries.find_one({
            "tenant_id": tenant_id,
            "id": library_id
        })
        
        if lib and lib.get("is_default"):
            raise ValueError("Cannot delete default library")
        
        result = await self.libraries.update_one(
            {"tenant_id": tenant_id, "id": library_id},
            {"$set": {"is_active": False, "deleted_at": datetime.utcnow()}}
        )
        return result.modified_count > 0
    
    async def get_library_members(
        self,
        tenant_id: str,
        library_id: str
    ) -> List[Dict[str, Any]]:
        """Get library members"""
        return await self.db["fm_library_members"].find(
            {"tenant_id": tenant_id, "library_id": library_id},
            {"_id": 0}
        ).to_list(length=100)
    
    async def add_library_member(
        self,
        tenant_id: str,
        library_id: str,
        user_id: str,
        role: str,
        added_by: str
    ) -> Dict[str, Any]:
        """Add member to library"""
        member = {
            "id": str(uuid.uuid4()),
            "tenant_id": tenant_id,
            "library_id": library_id,
            "user_id": user_id,
            "role": role,
            "added_by": added_by,
            "added_at": datetime.utcnow()
        }
        
        await self.db["fm_library_members"].update_one(
            {"tenant_id": tenant_id, "library_id": library_id, "user_id": user_id},
            {"$set": member},
            upsert=True
        )
        
        return member
    
    # =========================================================================
    # TAB 5 - SHARING & PUBLIC LINKS
    # =========================================================================
    
    async def get_sharing_settings(self, tenant_id: str) -> Dict[str, Any]:
        """Get sharing and public link settings"""
        defaults = {
            "public_links_enabled": True,
            "require_expiry": True,
            "max_expiry_days": 90,
            "default_expiry_days": 7,
            "require_password": False,
            "min_password_length": 6,
            "allow_download_default": True,
            "restricted_files_public_link_allowed": False,
            "internal_sharing_enabled": True,
            "share_to_teams_enabled": True,
            "share_to_roles_enabled": True,
            "access_logging_enabled": True
        }
        
        setting = await self.settings.find_one({
            "tenant_id": tenant_id,
            "key": "sharing_settings"
        })
        
        if setting:
            return {**defaults, **setting.get("value", {})}
        return defaults
    
    async def update_sharing_settings(
        self,
        tenant_id: str,
        settings: Dict[str, Any]
    ) -> bool:
        """Update sharing settings"""
        await self.settings.update_one(
            {"tenant_id": tenant_id, "key": "sharing_settings"},
            {
                "$set": {"value": settings, "updated_at": datetime.utcnow()},
                "$setOnInsert": {"id": str(uuid.uuid4()), "created_at": datetime.utcnow()}
            },
            upsert=True
        )
        
        # Update feature flag
        if "public_links_enabled" in settings:
            await self.settings.update_one(
                {"tenant_id": tenant_id, "key": "feature_flags"},
                {"$set": {"value.public_links": settings["public_links_enabled"]}}
            )
        
        return True
    
    # =========================================================================
    # TAB 6 - STORAGE & CONNECTORS
    # =========================================================================
    
    async def get_storage_config(self, tenant_id: str) -> Dict[str, Any]:
        """Get storage configuration"""
        connectors = await self.storage_connectors.find(
            {"tenant_id": tenant_id},
            {"_id": 0}
        ).to_list(length=20)
        
        storage_settings = await self.settings.find_one({
            "tenant_id": tenant_id,
            "key": "storage_settings"
        })
        
        return {
            "connectors": connectors,
            "settings": storage_settings.get("value", {
                "default_provider": "local",
                "routing_rules": [],
                "conflict_handling": "rename"
            }) if storage_settings else {
                "default_provider": "local",
                "routing_rules": [],
                "conflict_handling": "rename"
            }
        }
    
    async def create_storage_connector(
        self,
        tenant_id: str,
        user_id: str,
        data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Create a storage connector"""
        connector = {
            "id": str(uuid.uuid4()),
            "tenant_id": tenant_id,
            "name": data["name"],
            "provider": data["provider"],  # s3, google_drive, local
            "status": "configured",
            "config": {
                "bucket_name": data.get("bucket_name"),
                "region": data.get("region"),
                "root_path": data.get("root_path", "/"),
                "access_key_id": data.get("access_key_id"),  # Mock - would be encrypted
                "folder_id": data.get("folder_id"),  # For Google Drive
            },
            "is_active": True,
            "is_default": data.get("is_default", False),
            "created_by": user_id,
            "created_at": datetime.utcnow()
        }
        
        await self.storage_connectors.insert_one(connector)
        return {k: v for k, v in connector.items() if k != "_id"}
    
    async def update_storage_connector(
        self,
        tenant_id: str,
        connector_id: str,
        data: Dict[str, Any]
    ) -> bool:
        """Update storage connector"""
        update_fields = {k: v for k, v in data.items() if k not in ["id", "tenant_id"]}
        update_fields["updated_at"] = datetime.utcnow()
        
        result = await self.storage_connectors.update_one(
            {"tenant_id": tenant_id, "id": connector_id},
            {"$set": update_fields}
        )
        return result.modified_count > 0
    
    async def delete_storage_connector(
        self,
        tenant_id: str,
        connector_id: str
    ) -> bool:
        """Delete storage connector"""
        result = await self.storage_connectors.delete_one({
            "tenant_id": tenant_id,
            "id": connector_id
        })
        return result.deleted_count > 0
    
    async def update_storage_settings(
        self,
        tenant_id: str,
        settings: Dict[str, Any]
    ) -> bool:
        """Update storage settings"""
        await self.settings.update_one(
            {"tenant_id": tenant_id, "key": "storage_settings"},
            {
                "$set": {"value": settings, "updated_at": datetime.utcnow()},
                "$setOnInsert": {"id": str(uuid.uuid4()), "created_at": datetime.utcnow()}
            },
            upsert=True
        )
        return True
    
    # =========================================================================
    # TAB 7 - AUTOMATION & ENDPOINTS
    # =========================================================================
    
    async def get_automation_rules(self, tenant_id: str) -> List[Dict[str, Any]]:
        """Get all automation rules"""
        return await self.automation_rules.find(
            {"tenant_id": tenant_id},
            {"_id": 0}
        ).to_list(length=100)
    
    async def create_automation_rule(
        self,
        tenant_id: str,
        user_id: str,
        data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Create an automation rule"""
        rule = {
            "id": str(uuid.uuid4()),
            "tenant_id": tenant_id,
            "name": data["name"],
            "description": data.get("description"),
            "is_active": data.get("is_active", True),
            "trigger": data["trigger"],  # {type: "file_uploaded", conditions: {...}}
            "conditions": data.get("conditions", []),
            "actions": data["actions"],  # [{type: "apply_tag", params: {...}}, ...]
            "priority": data.get("priority", 0),
            "is_template": data.get("is_template", False),
            "created_by": user_id,
            "created_at": datetime.utcnow()
        }
        
        await self.automation_rules.insert_one(rule)
        return {k: v for k, v in rule.items() if k != "_id"}
    
    async def update_automation_rule(
        self,
        tenant_id: str,
        rule_id: str,
        data: Dict[str, Any]
    ) -> bool:
        """Update automation rule"""
        update_fields = {k: v for k, v in data.items() if k not in ["id", "tenant_id"]}
        update_fields["updated_at"] = datetime.utcnow()
        
        result = await self.automation_rules.update_one(
            {"tenant_id": tenant_id, "id": rule_id},
            {"$set": update_fields}
        )
        return result.modified_count > 0
    
    async def delete_automation_rule(
        self,
        tenant_id: str,
        rule_id: str
    ) -> bool:
        """Delete automation rule"""
        result = await self.automation_rules.delete_one({
            "tenant_id": tenant_id,
            "id": rule_id
        })
        return result.deleted_count > 0
    
    async def create_default_automation_templates(
        self,
        tenant_id: str,
        user_id: str
    ) -> List[Dict[str, Any]]:
        """Create default automation rule templates"""
        templates = [
            {
                "name": "Enforce Contract Sensitivity",
                "description": "Automatically set Confidential sensitivity for contract files",
                "trigger": {"type": "file_uploaded"},
                "conditions": [
                    {"field": "category_name", "operator": "equals", "value": "Contracts"}
                ],
                "actions": [
                    {"type": "set_sensitivity", "params": {"sensitivity_name": "Confidential"}}
                ],
                "is_template": True
            },
            {
                "name": "Missing Metadata Reminder",
                "description": "Notify owner when file is uploaded without required tags",
                "trigger": {"type": "file_uploaded"},
                "conditions": [
                    {"field": "tags", "operator": "is_empty", "value": True}
                ],
                "actions": [
                    {"type": "notify_owner", "params": {"message": "Please add tags to your uploaded file"}}
                ],
                "is_template": True
            },
            {
                "name": "Public Link Expiry Warning",
                "description": "Notify file owner when public link is about to expire",
                "trigger": {"type": "public_link_expiring"},
                "conditions": [
                    {"field": "days_until_expiry", "operator": "less_than", "value": 3}
                ],
                "actions": [
                    {"type": "notify_owner", "params": {"message": "Your public link will expire in less than 3 days"}}
                ],
                "is_template": True
            }
        ]
        
        created = []
        for template in templates:
            # Check if already exists
            existing = await self.automation_rules.find_one({
                "tenant_id": tenant_id,
                "name": template["name"],
                "is_template": True
            })
            
            if not existing:
                rule = await self.create_automation_rule(tenant_id, user_id, template)
                created.append(rule)
        
        return created
    
    # =========================================================================
    # TAB 8 - AI ASSISTANT
    # =========================================================================
    
    async def get_ai_settings(self, tenant_id: str) -> Dict[str, Any]:
        """Get AI assistant settings"""
        defaults = {
            "ai_enabled": True,
            "auto_tag_enabled": True,
            "sensitivity_detection_enabled": False,
            "content_analysis_enabled": False,
            "ai_logging_enabled": True,
            "confidence_threshold": 0.7,
            "max_suggestions": 5
        }
        
        setting = await self.settings.find_one({
            "tenant_id": tenant_id,
            "key": "ai_settings"
        })
        
        if setting:
            return {**defaults, **setting.get("value", {})}
        return defaults
    
    async def update_ai_settings(
        self,
        tenant_id: str,
        settings: Dict[str, Any]
    ) -> bool:
        """Update AI settings"""
        await self.settings.update_one(
            {"tenant_id": tenant_id, "key": "ai_settings"},
            {
                "$set": {"value": settings, "updated_at": datetime.utcnow()},
                "$setOnInsert": {"id": str(uuid.uuid4()), "created_at": datetime.utcnow()}
            },
            upsert=True
        )
        
        # Update feature flag
        if "auto_tag_enabled" in settings:
            await self.settings.update_one(
                {"tenant_id": tenant_id, "key": "feature_flags"},
                {"$set": {"value.ai_auto_tag": settings["auto_tag_enabled"]}}
            )
        
        return True
    
    # =========================================================================
    # TAB 9 - AUDIT & RETENTION
    # =========================================================================
    
    async def get_audit_settings(self, tenant_id: str) -> Dict[str, Any]:
        """Get audit and retention settings"""
        defaults = {
            "audit_events_enabled": {
                "file_uploaded": True,
                "file_downloaded": True,
                "file_deleted": True,
                "file_shared": True,
                "file_linked": True,
                "version_created": True,
                "public_link_created": True,
                "public_link_accessed": True,
                "metadata_updated": True
            },
            "retention_enabled": False,
            "default_retention_days": 365,
            "audit_export_enabled": True
        }
        
        setting = await self.settings.find_one({
            "tenant_id": tenant_id,
            "key": "audit_settings"
        })
        
        if setting:
            return {**defaults, **setting.get("value", {})}
        return defaults
    
    async def update_audit_settings(
        self,
        tenant_id: str,
        settings: Dict[str, Any]
    ) -> bool:
        """Update audit settings"""
        await self.settings.update_one(
            {"tenant_id": tenant_id, "key": "audit_settings"},
            {
                "$set": {"value": settings, "updated_at": datetime.utcnow()},
                "$setOnInsert": {"id": str(uuid.uuid4()), "created_at": datetime.utcnow()}
            },
            upsert=True
        )
        return True
    
    async def get_retention_policies(self, tenant_id: str) -> List[Dict[str, Any]]:
        """Get retention policies"""
        return await self.retention_policies.find(
            {"tenant_id": tenant_id},
            {"_id": 0}
        ).to_list(length=50)
    
    async def create_retention_policy(
        self,
        tenant_id: str,
        user_id: str,
        data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Create a retention policy"""
        policy = {
            "id": str(uuid.uuid4()),
            "tenant_id": tenant_id,
            "name": data["name"],
            "description": data.get("description"),
            "category_id": data.get("category_id"),  # null = all categories
            "retention_days": data["retention_days"],
            "action": data.get("action", "archive"),  # archive, delete
            "legal_hold": data.get("legal_hold", False),
            "is_active": True,
            "created_by": user_id,
            "created_at": datetime.utcnow()
        }
        
        await self.retention_policies.insert_one(policy)
        return {k: v for k, v in policy.items() if k != "_id"}
    
    async def update_retention_policy(
        self,
        tenant_id: str,
        policy_id: str,
        data: Dict[str, Any]
    ) -> bool:
        """Update retention policy"""
        update_fields = {k: v for k, v in data.items() if k not in ["id", "tenant_id"]}
        update_fields["updated_at"] = datetime.utcnow()
        
        result = await self.retention_policies.update_one(
            {"tenant_id": tenant_id, "id": policy_id},
            {"$set": update_fields}
        )
        return result.modified_count > 0
    
    async def delete_retention_policy(
        self,
        tenant_id: str,
        policy_id: str
    ) -> bool:
        """Delete retention policy"""
        result = await self.retention_policies.delete_one({
            "tenant_id": tenant_id,
            "id": policy_id
        })
        return result.deleted_count > 0
    
    async def set_legal_hold(
        self,
        tenant_id: str,
        file_id: str,
        enabled: bool,
        user_id: str,
        reason: str = None
    ) -> bool:
        """Set legal hold on a file"""
        await self.db["fm_files"].update_one(
            {"tenant_id": tenant_id, "id": file_id},
            {
                "$set": {
                    "legal_hold": enabled,
                    "legal_hold_by": user_id if enabled else None,
                    "legal_hold_reason": reason if enabled else None,
                    "legal_hold_at": datetime.utcnow() if enabled else None
                }
            }
        )
        return True
    
    async def export_audit_logs(
        self,
        tenant_id: str,
        filters: Dict[str, Any] = None
    ) -> List[Dict[str, Any]]:
        """Export audit logs"""
        query = {"tenant_id": tenant_id}
        
        if filters:
            if filters.get("start_date"):
                query["created_at"] = {"$gte": filters["start_date"]}
            if filters.get("end_date"):
                query.setdefault("created_at", {})["$lte"] = filters["end_date"]
            if filters.get("event_types"):
                query["event_type"] = {"$in": filters["event_types"]}
            if filters.get("file_id"):
                query["file_id"] = filters["file_id"]
        
        return await self.db["fm_audit_events"].find(
            query,
            {"_id": 0}
        ).sort("created_at", -1).to_list(length=10000)
