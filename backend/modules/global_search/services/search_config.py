"""
Global Search Configuration Service
Handles metadata-driven search configuration.

Responsibilities:
- Determine which objects are searchable
- Define searchable fields per object
- Configure search ranking/priority
"""
from typing import Dict, List, Any, Optional
from motor.motor_asyncio import AsyncIOMotorDatabase
import logging

logger = logging.getLogger(__name__)


# Default searchable field types
DEFAULT_SEARCHABLE_TYPES = {'text', 'email', 'phone', 'textarea', 'url'}

# Default searchable fields (fallback when no metadata config exists)
DEFAULT_SEARCHABLE_FIELDS = {'name', 'email', 'phone', 'first_name', 'last_name', 
                              'account_name', 'company', 'subject', 'title'}

# Object priority for ranking (lower = higher priority)
DEFAULT_OBJECT_PRIORITY = {
    'lead': 1,
    'contact': 2,
    'account': 3,
    'opportunity': 4,
    'task': 5,
    'event': 6
}


class SearchConfigService:
    """
    Manages search configuration metadata.
    All config is metadata-driven and tenant-specific.
    """
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.config_collection = db.global_search_config
        self.objects_collection = db.tenant_objects
    
    async def get_searchable_objects(self, tenant_id: str) -> List[Dict[str, Any]]:
        """
        Get all searchable objects for a tenant.
        
        Returns objects from both:
        1. tenant_objects (standard CRM objects)
        2. schema_objects (custom Schema Builder objects)
        
        Respects is_searchable metadata if configured.
        """
        # Check for tenant-specific config
        config = await self.config_collection.find_one(
            {"tenant_id": tenant_id},
            {"_id": 0}
        )
        
        # Get all objects
        tenant_objects = await self.objects_collection.find(
            {"tenant_id": tenant_id},
            {"_id": 0}
        ).to_list(None)
        
        # Also get Schema Builder objects
        schema_objects = await self.db.schema_objects.find(
            {"tenant_id": tenant_id, "is_active": True},
            {"_id": 0}
        ).to_list(None)
        
        # Convert schema objects to standard format
        for obj in schema_objects:
            # Check if already in tenant_objects
            existing = next((o for o in tenant_objects 
                           if o.get('object_name', '').lower() == obj.get('api_name', '').lower()), None)
            if not existing:
                tenant_objects.append({
                    "object_name": obj.get("api_name"),
                    "object_label": obj.get("label"),
                    "object_plural": obj.get("plural_label", f"{obj.get('label')}s"),
                    "icon": obj.get("icon", "database"),
                    "is_custom": obj.get("is_custom", True),
                    "is_from_schema_builder": True,
                    "fields": {}  # Will be populated separately
                })
        
        # Filter by searchable config if exists
        if config and config.get("searchable_objects"):
            searchable_names = set(config["searchable_objects"])
            tenant_objects = [o for o in tenant_objects 
                            if o.get("object_name", "").lower() in searchable_names]
        
        return tenant_objects
    
    async def get_searchable_fields(self, tenant_id: str, object_name: str) -> List[Dict[str, Any]]:
        """
        Get searchable fields for a specific object.
        
        Returns fields marked as searchable in metadata, or defaults to
        name, email, phone fields.
        """
        # Get tenant-specific field config
        config = await self.config_collection.find_one(
            {"tenant_id": tenant_id},
            {"_id": 0}
        )
        
        # Get object definition
        obj = await self.objects_collection.find_one(
            {"tenant_id": tenant_id, "object_name": object_name.lower()},
            {"_id": 0}
        )
        
        if not obj:
            # Try Schema Builder
            obj = await self.db.schema_objects.find_one(
                {"tenant_id": tenant_id, "api_name": object_name.lower()},
                {"_id": 0}
            )
            if obj:
                # Get fields from schema_fields
                schema_fields = await self.db.schema_fields.find(
                    {"tenant_id": tenant_id, "object_id": obj["id"]},
                    {"_id": 0}
                ).to_list(None)
                
                fields = {}
                for f in schema_fields:
                    fields[f["api_name"]] = {
                        "type": f.get("field_type", "text"),
                        "label": f.get("label", f["api_name"]),
                        "is_searchable": f.get("is_searchable", 
                            f.get("field_type", "").lower() in DEFAULT_SEARCHABLE_TYPES or 
                            f["api_name"].lower() in DEFAULT_SEARCHABLE_FIELDS)
                    }
                obj = {"fields": fields}
        
        if not obj:
            return []
        
        fields = obj.get("fields", {})
        searchable_fields = []
        
        # Check if tenant has custom field config
        field_config = {}
        if config and config.get("field_config", {}).get(object_name.lower()):
            field_config = config["field_config"][object_name.lower()]
        
        for field_name, field_def in fields.items():
            # Skip system fields that shouldn't be searched
            if field_name.startswith('_') or field_name in ('id', 'tenant_id', 'created_by', 'updated_by'):
                continue
            
            field_type = field_def.get("type", "").lower() if isinstance(field_def, dict) else "text"
            
            # Determine if searchable
            is_searchable = False
            
            # Check explicit config first
            if field_name in field_config:
                is_searchable = field_config[field_name].get("is_searchable", False)
            # Check field metadata
            elif isinstance(field_def, dict) and field_def.get("is_searchable"):
                is_searchable = True
            # Check default rules
            elif field_name.lower() in DEFAULT_SEARCHABLE_FIELDS:
                is_searchable = True
            elif field_type in DEFAULT_SEARCHABLE_TYPES:
                is_searchable = True
            
            if is_searchable:
                searchable_fields.append({
                    "name": field_name,
                    "label": field_def.get("label", field_name) if isinstance(field_def, dict) else field_name,
                    "type": field_type,
                    "priority": self._get_field_priority(field_name)
                })
        
        # Sort by priority
        searchable_fields.sort(key=lambda f: f["priority"])
        
        return searchable_fields
    
    def _get_field_priority(self, field_name: str) -> int:
        """Get search priority for a field (lower = more important)"""
        field_lower = field_name.lower()
        
        # Highest priority - name fields
        if field_lower in ('name', 'first_name', 'last_name', 'account_name', 'subject'):
            return 1
        # High priority - email
        if 'email' in field_lower:
            return 2
        # Medium priority - phone
        if 'phone' in field_lower or 'mobile' in field_lower:
            return 3
        # Lower priority - other text fields
        return 10
    
    async def get_object_priority(self, tenant_id: str, object_name: str) -> int:
        """Get search result priority for an object (lower = higher in results)"""
        # Check tenant config
        config = await self.config_collection.find_one(
            {"tenant_id": tenant_id},
            {"_id": 0}
        )
        
        if config and config.get("object_priority", {}).get(object_name.lower()):
            return config["object_priority"][object_name.lower()]
        
        # Use defaults
        return DEFAULT_OBJECT_PRIORITY.get(object_name.lower(), 100)
    
    async def update_search_config(
        self, 
        tenant_id: str, 
        searchable_objects: Optional[List[str]] = None,
        object_priority: Optional[Dict[str, int]] = None,
        field_config: Optional[Dict[str, Dict[str, Any]]] = None,
        results_per_object: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Update search configuration for a tenant.
        Admin-level configuration.
        """
        update = {"tenant_id": tenant_id}
        
        if searchable_objects is not None:
            update["searchable_objects"] = [o.lower() for o in searchable_objects]
        if object_priority is not None:
            update["object_priority"] = {k.lower(): v for k, v in object_priority.items()}
        if field_config is not None:
            update["field_config"] = {k.lower(): v for k, v in field_config.items()}
        if results_per_object is not None:
            update["results_per_object"] = results_per_object
        
        result = await self.config_collection.update_one(
            {"tenant_id": tenant_id},
            {"$set": update},
            upsert=True
        )
        
        return {"updated": result.modified_count > 0 or result.upserted_id is not None}
    
    async def get_results_per_object(self, tenant_id: str) -> int:
        """Get configured results per object limit"""
        config = await self.config_collection.find_one(
            {"tenant_id": tenant_id},
            {"_id": 0}
        )
        
        return config.get("results_per_object", 5) if config else 5
