"""
Global Search Permission Service
Handles permission-aware search result filtering.

Responsibilities:
- Object-level access control (using Permission Sets)
- Field-level visibility
- Record-level permissions

UPDATED: Now uses the new Permission Set-based visibility system.
Objects must have `visible: true` in user's effective permissions.
"""
from typing import Dict, List, Any, Set
from motor.motor_asyncio import AsyncIOMotorDatabase
import logging

logger = logging.getLogger(__name__)


class SearchPermissionService:
    """
    Filters search results based on user permissions.
    Ensures users only see records they have access to.
    
    ARCHITECTURE (Salesforce-style):
    - Object visibility controlled by Permission Sets (visible flag)
    - Record visibility controlled by OWD, hierarchy, sharing rules
    """
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
    
    async def get_accessible_objects(
        self, 
        tenant_id: str, 
        user_id: str, 
        role_id: str = None,
        is_super_admin: bool = False
    ) -> Set[str]:
        """
        Get the set of objects the user can access.
        
        UPDATED: Now uses Permission Set-based visibility.
        Checks:
        1. Super Admin bypass
        2. Permission Set `visible` flag
        3. Falls back to all objects if super admin
        """
        # Super Admin sees everything
        if is_super_admin:
            all_objects = await self.db.tenant_objects.find(
                {"tenant_id": tenant_id},
                {"object_name": 1, "_id": 0}
            ).to_list(None)
            accessible = set(obj["object_name"].lower() for obj in all_objects)
            
            # Add Schema Builder objects
            schema_objects = await self.db.schema_objects.find(
                {"tenant_id": tenant_id, "is_active": True},
                {"api_name": 1, "_id": 0}
            ).to_list(None)
            for obj in schema_objects:
                accessible.add(obj["api_name"].lower())
            
            return accessible
        
        # Use Permission Cache for non-admins
        from modules.users.services.permission_cache import get_visible_objects
        
        visible_objects = await get_visible_objects(
            tenant_id=tenant_id,
            user_id=user_id,
            is_super_admin=is_super_admin
        )
        
        return set(obj.lower() for obj in visible_objects)
    
    async def get_visible_fields(
        self, 
        tenant_id: str, 
        user_id: str, 
        object_name: str,
        role_id: str = None
    ) -> Set[str]:
        """
        Get fields the user can see for an object.
        
        Checks:
        1. Field-level security (FLS)
        2. Role-based field access
        """
        # Get object definition
        obj = await self.db.tenant_objects.find_one(
            {"tenant_id": tenant_id, "object_name": object_name.lower()},
            {"fields": 1, "_id": 0}
        )
        
        if not obj:
            # Try Schema Builder
            schema_obj = await self.db.schema_objects.find_one(
                {"tenant_id": tenant_id, "api_name": object_name.lower()},
                {"_id": 0}
            )
            if schema_obj:
                schema_fields = await self.db.schema_fields.find(
                    {"tenant_id": tenant_id, "object_id": schema_obj["id"]},
                    {"api_name": 1, "_id": 0}
                ).to_list(None)
                return set(f["api_name"] for f in schema_fields)
            return set()
        
        all_fields = set(obj.get("fields", {}).keys())
        
        # Check field-level security
        fls = await self.db.field_level_security.find_one({
            "tenant_id": tenant_id,
            "object_name": object_name.lower()
        })
        
        if fls and fls.get("restricted_fields"):
            # Remove restricted fields based on role
            for field_name, restrictions in fls["restricted_fields"].items():
                if role_id and role_id in restrictions.get("hidden_from_roles", []):
                    all_fields.discard(field_name)
        
        return all_fields
    
    async def filter_records_by_permission(
        self,
        tenant_id: str,
        user_id: str,
        object_name: str,
        records: List[Dict[str, Any]],
        role_id: str = None
    ) -> List[Dict[str, Any]]:
        """
        Filter records based on record-level sharing.
        
        Users can see a record if:
        1. They own it (owner_id == user_id)
        2. Organization-wide default is public
        3. They have a sharing rule granting access
        """
        if not records:
            return []
        
        # Check OWD for this object
        owd = await self.db.organization_wide_defaults.find_one(
            {"tenant_id": tenant_id},
            {"_id": 0}
        )
        
        object_access = "public"  # Default to public
        if owd and owd.get("object_access", {}).get(object_name.lower()):
            object_access = owd["object_access"][object_name.lower()].get("default_access", "public")
        
        # If public, return all records
        if object_access == "public":
            return records
        
        # Filter by ownership and sharing
        accessible_records = []
        
        for record in records:
            # Owner always has access
            if record.get("owner_id") == user_id or record.get("created_by") == user_id:
                accessible_records.append(record)
                continue
            
            # Check sharing rules
            sharing = await self.db.sharing_rules.find_one({
                "tenant_id": tenant_id,
                "object_name": object_name.lower(),
                "record_id": record.get("id"),
                "$or": [
                    {"shared_with_user": user_id},
                    {"shared_with_role": role_id} if role_id else {"_id": None}
                ]
            })
            
            if sharing:
                accessible_records.append(record)
        
        return accessible_records
    
    async def can_access_object(
        self, 
        tenant_id: str, 
        user_id: str, 
        object_name: str,
        role_id: str = None,
        is_super_admin: bool = False
    ) -> bool:
        """
        Quick check if user can access an object.
        
        UPDATED: Uses Permission Set `visible` flag.
        """
        # Super Admin bypass
        if is_super_admin:
            return True
        
        # Check visibility via permission cache
        from modules.users.services.permission_cache import check_object_visibility
        
        return await check_object_visibility(
            tenant_id=tenant_id,
            user_id=user_id,
            object_name=object_name.lower(),
            is_super_admin=is_super_admin
        )
