from motor.motor_asyncio import AsyncIOMotorDatabase
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
from ..models.object_type_models import ObjectType
from ..utils.id_generator import GlobalIDGenerator

class ObjectRegistryService:
    """Service to manage CRM object type registry"""
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.collection = db.crm_object_types
        self.id_mappings = db.crm_global_id_mappings
    
    async def initialize_default_objects(self, tenant_id: str):
        """Initialize default CRM object types"""
        default_objects = [
            {
                "id": "lead",
                "label": "Lead",
                "label_plural": "Leads",
                "prefix": "LEA",
                "api_name": "lead",
                "collection_name": "leads",
                "icon": "user-plus",
                "is_custom": False,
                "is_active": True,
                "enable_activities": True,
                "enable_files": True,
                "enable_timeline": True,
                "tenant_id": tenant_id,
                "created_at": datetime.now(timezone.utc),
                "updated_at": datetime.now(timezone.utc)
            },
            {
                "id": "account",
                "label": "Account",
                "label_plural": "Accounts",
                "prefix": "ACC",
                "api_name": "account",
                "collection_name": "accounts",
                "icon": "building",
                "is_custom": False,
                "is_active": True,
                "enable_activities": True,
                "enable_files": True,
                "enable_timeline": True,
                "tenant_id": tenant_id,
                "created_at": datetime.now(timezone.utc),
                "updated_at": datetime.now(timezone.utc)
            },
            {
                "id": "contact",
                "label": "Contact",
                "label_plural": "Contacts",
                "prefix": "CON",
                "api_name": "contact",
                "collection_name": "contacts",
                "icon": "user",
                "is_custom": False,
                "is_active": True,
                "enable_activities": True,
                "enable_files": True,
                "enable_timeline": True,
                "tenant_id": tenant_id,
                "created_at": datetime.now(timezone.utc),
                "updated_at": datetime.now(timezone.utc)
            },
            {
                "id": "opportunity",
                "label": "Opportunity",
                "label_plural": "Opportunities",
                "prefix": "OPP",
                "api_name": "opportunity",
                "collection_name": "opportunities",
                "icon": "briefcase",
                "is_custom": False,
                "is_active": True,
                "enable_activities": True,
                "enable_files": True,
                "enable_timeline": True,
                "tenant_id": tenant_id,
                "created_at": datetime.now(timezone.utc),
                "updated_at": datetime.now(timezone.utc)
            },
            {
                "id": "task",
                "label": "Task",
                "label_plural": "Tasks",
                "prefix": "TSK",
                "api_name": "task",
                "collection_name": "tasks",
                "icon": "check-square",
                "is_custom": False,
                "is_active": True,
                "enable_activities": False,
                "enable_files": True,
                "enable_timeline": False,
                "tenant_id": tenant_id,
                "created_at": datetime.now(timezone.utc),
                "updated_at": datetime.now(timezone.utc)
            }
        ]
        
        for obj in default_objects:
            existing = await self.collection.find_one({
                "id": obj["id"],
                "tenant_id": tenant_id
            })
            if not existing:
                await self.collection.insert_one(obj)
    
    async def get_object_type(self, object_type_id: str, tenant_id: str) -> Optional[Dict[str, Any]]:
        """Get object type by ID"""
        return await self.collection.find_one({
            "id": object_type_id,
            "tenant_id": tenant_id
        }, {"_id": 0})
    
    async def get_object_type_by_prefix(self, prefix: str, tenant_id: str) -> Optional[Dict[str, Any]]:
        """Get object type by prefix"""
        return await self.collection.find_one({
            "prefix": prefix,
            "tenant_id": tenant_id
        }, {"_id": 0})
    
    async def list_object_types(self, tenant_id: str) -> List[Dict[str, Any]]:
        """List all object types for tenant (excluding internal system objects)"""
        # System objects that should be hidden from navigation
        # "file" is hidden because users access Files through the DMS page at /files
        HIDDEN_SYSTEM_OBJECTS = {"file", "file_record_link", "file_version"}
        
        cursor = self.collection.find(
            {
                "tenant_id": tenant_id, 
                "is_active": True,
                "id": {"$nin": list(HIDDEN_SYSTEM_OBJECTS)}  # Exclude hidden objects
            },
            {"_id": 0}
        ).sort("label", 1)
        return await cursor.to_list(length=100)
    
    async def create_global_id(self, object_type_id: str, legacy_id: Optional[str], tenant_id: str) -> Dict[str, Any]:
        """Create a new global ID for a record"""
        # Get object type
        obj_type = await self.get_object_type(object_type_id, tenant_id)
        if not obj_type:
            raise ValueError(f"Object type {object_type_id} not found")
        
        # Generate IDs
        global_id = GlobalIDGenerator.generate_uuidv7()
        public_id = GlobalIDGenerator.generate_public_id(obj_type["prefix"], global_id)
        
        # Create mapping
        mapping = {
            "global_id": global_id,
            "public_id": public_id,
            "object_type": object_type_id,
            "legacy_id": legacy_id,
            "tenant_id": tenant_id,
            "created_at": datetime.now(timezone.utc)
        }
        
        await self.id_mappings.insert_one(mapping)
        
        return {
            "global_id": global_id,
            "public_id": public_id,
            "object_type": object_type_id
        }
    
    async def resolve_public_id(self, public_id: str, tenant_id: str) -> Optional[Dict[str, Any]]:
        """Resolve public ID to global ID and object type"""
        try:
            prefix, short_id = GlobalIDGenerator.parse_public_id(public_id)
            
            # Get object type by prefix
            obj_type = await self.get_object_type_by_prefix(prefix, tenant_id)
            if not obj_type:
                return None
            
            # Find mapping
            mapping = await self.id_mappings.find_one({
                "public_id": public_id,
                "tenant_id": tenant_id
            }, {"_id": 0})
            
            return mapping
        except ValueError:
            return None
    
    async def get_or_create_global_id(self, object_type_id: str, legacy_id: str, tenant_id: str) -> Dict[str, Any]:
        """Get existing or create new global ID for a legacy record"""
        # Check if mapping exists
        existing = await self.id_mappings.find_one({
            "object_type": object_type_id,
            "legacy_id": legacy_id,
            "tenant_id": tenant_id
        }, {"_id": 0})
        
        if existing:
            return existing
        
        # Create new mapping
        return await self.create_global_id(object_type_id, legacy_id, tenant_id)
