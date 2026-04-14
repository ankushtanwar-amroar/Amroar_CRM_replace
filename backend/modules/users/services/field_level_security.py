"""
Field-Level Security (FLS) Service
Controls field visibility and editability per permission set.

Field Permission States:
- Hidden: Field not returned in API responses, not shown in UI
- Read-Only: Field is visible but not editable
- Editable: Field is visible and editable (default)

This service is used by:
1. Record retrieval APIs - to filter out hidden fields
2. Record update APIs - to reject updates to non-editable fields
3. Frontend - to determine which fields to show and whether they're editable
"""
import logging
from typing import Dict, List, Any, Set, Optional, Tuple
from config.database import db

logger = logging.getLogger(__name__)


class FieldLevelSecurityService:
    """
    Service to check and enforce field-level security.
    """
    
    def __init__(self, tenant_id: str, user_id: str):
        self.tenant_id = tenant_id
        self.user_id = user_id
        self._field_permissions_cache: Optional[Dict[str, Dict[str, Dict]]] = None
    
    async def get_field_permissions(self, object_name: str) -> Dict[str, Dict[str, Any]]:
        """
        Get field permissions for an object.
        Returns a dict of field_name -> {hidden: bool, editable: bool}
        
        Aggregates from all permission sources using "most permissive wins":
        - If ANY permission set says editable=True, field is editable
        - If ALL permission sets say hidden=True, field is hidden
        """
        if self._field_permissions_cache is not None:
            return self._field_permissions_cache.get(object_name, {})
        
        # Get user
        user = await db.users.find_one({
            "id": self.user_id,
            "tenant_id": self.tenant_id
        }, {"_id": 0, "is_super_admin": 1, "permission_set_ids": 1})
        
        if not user:
            return {}
        
        # Super admin has full access to all fields
        if user.get("is_super_admin"):
            return {}  # Empty dict = all fields accessible and editable
        
        # Collect all permission sets
        all_permission_set_ids = set()
        
        # Direct permission set IDs on user
        user_ps_ids = user.get("permission_set_ids", [])
        all_permission_set_ids.update(user_ps_ids)
        
        # Permission sets via user_permission_sets collection
        direct_assignments = await db.user_permission_sets.find({
            "user_id": self.user_id,
            "is_active": True
        }, {"_id": 0, "permission_set_id": 1}).to_list(None)
        for assignment in direct_assignments:
            all_permission_set_ids.add(assignment["permission_set_id"])
        
        # Permission sets via bundles
        bundle_assignments = await db.user_access_bundles.find({
            "user_id": self.user_id
        }, {"_id": 0, "bundle_id": 1}).to_list(None)
        
        for ba in bundle_assignments:
            bundle = await db.access_bundles.find_one({
                "id": ba["bundle_id"],
                "is_active": True
            }, {"_id": 0, "permission_set_ids": 1})
            if bundle:
                all_permission_set_ids.update(bundle.get("permission_set_ids", []))
        
        # Aggregate field permissions
        field_perms: Dict[str, Dict[str, Any]] = {}
        
        for ps_id in all_permission_set_ids:
            ps = await db.permission_sets.find_one({"id": ps_id}, {"_id": 0, "field_permissions": 1})
            if not ps:
                continue
            
            obj_field_perms = (ps.get("field_permissions") or {}).get(object_name, [])
            
            for fp in obj_field_perms:
                field_name = fp.get("field_name")
                if not field_name:
                    continue
                
                if field_name not in field_perms:
                    # First permission set defining this field
                    field_perms[field_name] = {
                        "hidden": fp.get("hidden", False),
                        "editable": fp.get("editable", True)
                    }
                else:
                    # Merge using "most permissive wins"
                    # For hidden: If any PS says NOT hidden, field is visible
                    if not fp.get("hidden", False):
                        field_perms[field_name]["hidden"] = False
                    # For editable: If any PS says editable, field is editable
                    if fp.get("editable", True):
                        field_perms[field_name]["editable"] = True
        
        return field_perms
    
    async def filter_record_fields(
        self, 
        object_name: str, 
        record: Dict[str, Any],
        is_super_admin: bool = False
    ) -> Dict[str, Any]:
        """
        Filter record fields based on FLS.
        Removes fields that are marked as hidden.
        
        Args:
            object_name: The object type
            record: The record data
            is_super_admin: Whether user is super admin
            
        Returns:
            Filtered record with hidden fields removed
        """
        if is_super_admin:
            return record  # Super admin sees everything
        
        field_perms = await self.get_field_permissions(object_name)
        
        if not field_perms:
            return record  # No FLS defined = all fields visible
        
        # Filter out hidden fields
        filtered_record = {}
        for key, value in record.items():
            # Check if field is hidden
            fp = field_perms.get(key)
            if fp and fp.get("hidden"):
                continue  # Skip hidden field
            filtered_record[key] = value
        
        return filtered_record
    
    async def filter_records(
        self,
        object_name: str,
        records: List[Dict[str, Any]],
        is_super_admin: bool = False
    ) -> List[Dict[str, Any]]:
        """
        Filter multiple records, removing hidden fields from each.
        """
        if is_super_admin:
            return records
        
        field_perms = await self.get_field_permissions(object_name)
        
        if not field_perms:
            return records
        
        # Get hidden fields
        hidden_fields = {fn for fn, fp in field_perms.items() if fp.get("hidden")}
        
        if not hidden_fields:
            return records
        
        # Filter each record
        filtered_records = []
        for record in records:
            filtered_record = {k: v for k, v in record.items() if k not in hidden_fields}
            filtered_records.append(filtered_record)
        
        return filtered_records
    
    async def check_field_editable(
        self,
        object_name: str,
        field_name: str,
        is_super_admin: bool = False
    ) -> Tuple[bool, str]:
        """
        Check if a specific field is editable.
        
        Returns:
            Tuple of (is_editable, reason)
        """
        if is_super_admin:
            return True, "super_admin"
        
        field_perms = await self.get_field_permissions(object_name)
        
        if not field_perms:
            return True, "no_fls_defined"  # No FLS = all editable
        
        fp = field_perms.get(field_name)
        
        if not fp:
            return True, "no_field_permission"  # No permission defined = editable
        
        if fp.get("hidden"):
            return False, "field_hidden"
        
        if not fp.get("editable", True):
            return False, "field_read_only"
        
        return True, "granted"
    
    async def validate_update_fields(
        self,
        object_name: str,
        update_data: Dict[str, Any],
        is_super_admin: bool = False
    ) -> Tuple[bool, List[str]]:
        """
        Validate that all fields in update data are editable.
        
        Args:
            object_name: The object type
            update_data: The fields being updated
            is_super_admin: Whether user is super admin
            
        Returns:
            Tuple of (is_valid, list_of_invalid_fields)
        """
        if is_super_admin:
            return True, []
        
        field_perms = await self.get_field_permissions(object_name)
        
        if not field_perms:
            return True, []  # No FLS = all editable
        
        invalid_fields = []
        
        for field_name in update_data.keys():
            fp = field_perms.get(field_name)
            if fp:
                if fp.get("hidden") or not fp.get("editable", True):
                    invalid_fields.append(field_name)
        
        return len(invalid_fields) == 0, invalid_fields


async def get_user_field_permissions(
    tenant_id: str,
    user_id: str,
    object_name: str = None
) -> Dict[str, Any]:
    """
    Get field permissions for a user, optionally filtered by object.
    Used by frontend to determine field visibility and editability.
    
    Returns:
        {
            "object_name": {
                "field_name": {"hidden": bool, "editable": bool},
                ...
            },
            ...
        }
    """
    # Get user
    user = await db.users.find_one({
        "id": user_id,
        "tenant_id": tenant_id
    }, {"_id": 0, "is_super_admin": 1, "permission_set_ids": 1})
    
    if not user:
        return {}
    
    # Super admin - return empty (means all accessible)
    if user.get("is_super_admin"):
        return {"is_super_admin": True, "field_permissions": {}}
    
    # Collect all permission set IDs
    all_permission_set_ids = set(user.get("permission_set_ids", []))
    
    # From user_permission_sets
    direct_assignments = await db.user_permission_sets.find({
        "user_id": user_id,
        "is_active": True
    }, {"_id": 0, "permission_set_id": 1}).to_list(None)
    for assignment in direct_assignments:
        all_permission_set_ids.add(assignment["permission_set_id"])
    
    # From bundles
    bundle_assignments = await db.user_access_bundles.find({
        "user_id": user_id
    }, {"_id": 0, "bundle_id": 1}).to_list(None)
    
    for ba in bundle_assignments:
        bundle = await db.access_bundles.find_one({
            "id": ba["bundle_id"],
            "is_active": True
        }, {"_id": 0, "permission_set_ids": 1})
        if bundle:
            all_permission_set_ids.update(bundle.get("permission_set_ids", []))
    
    # Aggregate field permissions by object
    result: Dict[str, Dict[str, Dict]] = {}
    
    for ps_id in all_permission_set_ids:
        ps = await db.permission_sets.find_one({"id": ps_id}, {"_id": 0, "field_permissions": 1})
        if not ps or not ps.get("field_permissions"):
            continue
        
        for obj_name, field_perms_list in ps.get("field_permissions", {}).items():
            if object_name and obj_name != object_name:
                continue
            
            if obj_name not in result:
                result[obj_name] = {}
            
            for fp in field_perms_list:
                field_name = fp.get("field_name")
                if not field_name:
                    continue
                
                if field_name not in result[obj_name]:
                    result[obj_name][field_name] = {
                        "hidden": fp.get("hidden", False),
                        "editable": fp.get("editable", True)
                    }
                else:
                    # Most permissive wins
                    if not fp.get("hidden", False):
                        result[obj_name][field_name]["hidden"] = False
                    if fp.get("editable", True):
                        result[obj_name][field_name]["editable"] = True
    
    return {
        "is_super_admin": False,
        "field_permissions": result
    }
