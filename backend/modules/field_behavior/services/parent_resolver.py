"""
Parent Lookup Resolver
Resolves parent field references up to 5 levels deep for field behavior rules.
E.g., "Account.Industry", "Account.Owner.Manager.Department"
"""
from typing import Dict, Any, List, Optional, Set
from motor.motor_asyncio import AsyncIOMotorDatabase
import logging
import asyncio
from functools import lru_cache

logger = logging.getLogger(__name__)


class ParentLookupResolver:
    """
    Resolves parent lookup field references.
    Supports multi-level lookups up to 5 levels deep.
    Implements caching to avoid repeated database calls.
    """
    
    MAX_DEPTH = 5
    
    def __init__(self, db: AsyncIOMotorDatabase, tenant_id: str):
        self.db = db
        self.tenant_id = tenant_id
        self._cache: Dict[str, Dict[str, Any]] = {}  # Cache for resolved records
        self._object_metadata_cache: Dict[str, Dict[str, Any]] = {}  # Cache for object metadata
    
    async def resolve_parent_references(
        self,
        object_name: str,
        record_id: str,
        parent_references: List[str]
    ) -> Dict[str, Any]:
        """
        Resolve parent field references to actual values.
        
        Args:
            object_name: The current object (e.g., "contact")
            record_id: The current record ID
            parent_references: List of paths like ["Account.Industry", "Account.Owner.Name"]
            
        Returns:
            Dict mapping paths to resolved values, e.g., {"Account.Industry": "Technology"}
        """
        if not parent_references:
            return {}
        
        resolved = {}
        errors = []
        
        # Get the current record
        current_record = await self._get_record(object_name, record_id)
        if not current_record:
            logger.warning(f"Could not find record {record_id} for object {object_name}")
            return resolved
        
        # Group references by their root lookup field
        reference_groups = self._group_by_root(parent_references)
        
        for root_field, paths in reference_groups.items():
            try:
                # Get the lookup field value from current record
                lookup_id = current_record.get('data', {}).get(root_field) or current_record.get('data', {}).get(f"{root_field}_id") or current_record.get('data', {}).get(f"{root_field}Id")
                
                if not lookup_id:
                    # Try case-insensitive lookup
                    data = current_record.get('data', {})
                    for key, value in data.items():
                        if key.lower() == root_field.lower() or key.lower() == f"{root_field.lower()}_id" or key.lower() == f"{root_field.lower()}id":
                            lookup_id = value
                            break
                
                if not lookup_id:
                    logger.debug(f"No lookup ID found for {root_field} in record")
                    continue
                
                # Determine the target object for this lookup
                target_object = await self._get_lookup_target_object(object_name, root_field)
                if not target_object:
                    logger.warning(f"Could not determine target object for lookup {root_field}")
                    continue
                
                # Resolve each path for this root
                for path in paths:
                    value = await self._resolve_path(target_object, lookup_id, path, root_field, 1)
                    resolved[path] = value
                    
            except Exception as e:
                logger.error(f"Error resolving references for {root_field}: {str(e)}")
                errors.append(str(e))
        
        return resolved
    
    async def _resolve_path(
        self,
        object_name: str,
        record_id: str,
        full_path: str,
        current_prefix: str,
        depth: int
    ) -> Any:
        """
        Recursively resolve a field path.
        
        Args:
            object_name: Current object in the chain
            record_id: Current record ID
            full_path: The full path we're resolving (e.g., "Account.Owner.Name")
            current_prefix: What we've resolved so far (e.g., "Account")
            depth: Current depth in the chain
            
        Returns:
            The resolved value or None
        """
        if depth > self.MAX_DEPTH:
            logger.warning(f"Max depth {self.MAX_DEPTH} exceeded for path {full_path}")
            return None
        
        # Get the record
        record = await self._get_record(object_name, record_id)
        if not record:
            return None
        
        record_data = record.get('data', {})
        
        # Parse the remaining path
        remaining_path = full_path[len(current_prefix) + 1:] if full_path.startswith(current_prefix + '.') else full_path
        parts = remaining_path.split('.', 1)
        
        if len(parts) == 1:
            # This is the final field
            field_name = parts[0]
            return self._get_field_value(record_data, field_name)
        else:
            # Need to traverse further
            next_lookup = parts[0]
            next_remaining = parts[1]
            
            # Get the lookup ID
            lookup_id = record_data.get(next_lookup) or record_data.get(f"{next_lookup}_id") or record_data.get(f"{next_lookup}Id")
            
            if not lookup_id:
                # Try case-insensitive
                for key, value in record_data.items():
                    if key.lower() == next_lookup.lower() or key.lower() == f"{next_lookup.lower()}_id":
                        lookup_id = value
                        break
            
            if not lookup_id:
                return None
            
            # Determine target object
            target_object = await self._get_lookup_target_object(object_name, next_lookup)
            if not target_object:
                return None
            
            # Recurse
            new_prefix = f"{current_prefix}.{next_lookup}"
            return await self._resolve_path(
                target_object, lookup_id, full_path, new_prefix, depth + 1
            )
    
    async def _get_record(self, object_name: str, record_id: str) -> Optional[Dict[str, Any]]:
        """Get a record, using cache if available"""
        cache_key = f"{object_name}:{record_id}"
        
        if cache_key in self._cache:
            return self._cache[cache_key]
        
        record = await self.db.object_records.find_one({
            "object_name": object_name.lower(),
            "id": record_id,
            "tenant_id": self.tenant_id
        }, {"_id": 0})
        
        if record:
            self._cache[cache_key] = record
        
        return record
    
    async def _get_lookup_target_object(self, object_name: str, lookup_field: str) -> Optional[str]:
        """Determine the target object for a lookup field"""
        # Try cache first
        cache_key = f"{object_name}:{lookup_field}"
        if cache_key in self._object_metadata_cache:
            return self._object_metadata_cache[cache_key]
        
        # Check object metadata for the lookup field definition
        object_def = await self.db.tenant_objects.find_one({
            "$or": [
                {"object_name": object_name.lower(), "tenant_id": self.tenant_id},
                {"api_name": object_name.lower(), "tenant_id": self.tenant_id}
            ]
        }, {"_id": 0, "fields": 1})
        
        if object_def and object_def.get('fields'):
            fields = object_def['fields']
            # Handle both dict and list formats
            if isinstance(fields, dict):
                for field_key, field_def in fields.items():
                    if field_key.lower() == lookup_field.lower() or field_key.lower() == f"{lookup_field.lower()}_id":
                        if field_def.get('type') == 'lookup' or field_def.get('related_object'):
                            target = field_def.get('related_object') or field_def.get('lookup_object')
                            self._object_metadata_cache[cache_key] = target
                            return target
            elif isinstance(fields, list):
                for field_def in fields:
                    field_key = field_def.get('key') or field_def.get('api_name')
                    if field_key and (field_key.lower() == lookup_field.lower() or field_key.lower() == f"{lookup_field.lower()}_id"):
                        if field_def.get('type') == 'lookup' or field_def.get('related_object'):
                            target = field_def.get('related_object') or field_def.get('lookup_object')
                            self._object_metadata_cache[cache_key] = target
                            return target
        
        # Check advanced_fields for lookup definitions
        lookup_field_def = await self.db.advanced_fields.find_one({
            "object_name": object_name.lower(),
            "tenant_id": self.tenant_id,
            "field_type": "lookup",
            "$or": [
                {"api_key": lookup_field.lower()},
                {"api_key": f"{lookup_field.lower()}_id"}
            ]
        }, {"_id": 0, "related_object": 1, "lookup_object": 1})
        
        if lookup_field_def:
            target = lookup_field_def.get('related_object') or lookup_field_def.get('lookup_object')
            self._object_metadata_cache[cache_key] = target
            return target
        
        # Fallback: Try common conventions
        common_lookups = {
            'account': 'account',
            'contact': 'contact',
            'owner': 'user',
            'created_by': 'user',
            'modified_by': 'user',
            'opportunity': 'opportunity',
            'lead': 'lead',
            'parent': object_name,  # Self-reference
        }
        
        target = common_lookups.get(lookup_field.lower())
        if target:
            self._object_metadata_cache[cache_key] = target
            return target
        
        # Last resort: assume the lookup field name is the object name
        self._object_metadata_cache[cache_key] = lookup_field.lower()
        return lookup_field.lower()
    
    def _group_by_root(self, paths: List[str]) -> Dict[str, List[str]]:
        """Group paths by their root lookup field"""
        groups = {}
        for path in paths:
            if '.' in path:
                root = path.split('.')[0]
                if root not in groups:
                    groups[root] = []
                groups[root].append(path)
        return groups
    
    def _get_field_value(self, data: Dict[str, Any], field_name: str) -> Any:
        """Get field value with case-insensitive fallback"""
        if field_name in data:
            return data[field_name]
        
        # Case-insensitive lookup
        field_lower = field_name.lower()
        for key, value in data.items():
            if key.lower() == field_lower:
                return value
        
        return None
    
    def clear_cache(self):
        """Clear all caches"""
        self._cache.clear()
        self._object_metadata_cache.clear()


async def get_available_parent_fields(
    db: AsyncIOMotorDatabase,
    tenant_id: str,
    object_name: str,
    max_depth: int = 2
) -> List[Dict[str, Any]]:
    """
    Get list of available parent fields for rule configuration UI.
    Returns fields from current object and parent lookup objects.
    
    Args:
        db: Database connection
        tenant_id: Tenant ID
        object_name: Current object name
        max_depth: How deep to traverse lookups (default 2 for performance)
        
    Returns:
        List of field references with metadata
    """
    result = []
    visited_objects = set()
    
    async def traverse_object(obj_name: str, prefix: str, depth: int):
        if depth > max_depth or obj_name.lower() in visited_objects:
            return
        
        visited_objects.add(obj_name.lower())
        
        # Get object definition - try multiple field names for lookup
        object_def = await db.tenant_objects.find_one({
            "$or": [
                {"object_name": obj_name.lower(), "tenant_id": tenant_id},
                {"api_name": obj_name.lower(), "tenant_id": tenant_id}
            ]
        }, {"_id": 0})
        
        if not object_def:
            logger.debug(f"Object definition not found for {obj_name}")
            return
        
        fields = object_def.get('fields', {})
        
        # =========================================
        # Include Advanced Fields (Lookup, Rollup, Formula)
        # =========================================
        if not prefix:  # Only add advanced fields for the root object
            advanced_fields = await db.advanced_fields.find({
                "tenant_id": tenant_id,
                "object_name": obj_name.lower(),
                "is_active": {"$ne": False}
            }, {"_id": 0}).to_list(None)
            
            for adv_field in advanced_fields:
                field_type = adv_field.get("field_type", "").lower()
                api_key = adv_field.get("api_key")
                
                if not api_key:
                    continue
                
                field_def_result = {
                    "apiName": api_key,
                    "label": adv_field.get("label", api_key),
                    "fieldType": field_type,
                    "objectName": obj_name,
                    "isParentField": False,
                    "parentLookupField": None,
                    "fullPath": api_key,
                    "isAdvancedField": True,
                    "advancedFieldType": field_type
                }
                
                if field_type == "lookup":
                    field_def_result["lookupObject"] = adv_field.get("target_object")
                    field_def_result["displayField"] = adv_field.get("display_field")
                
                elif field_type == "rollup":
                    field_def_result["fieldType"] = adv_field.get("result_type", "number").lower()
                    field_def_result["readOnly"] = True
                    field_def_result["computed"] = True
                    field_def_result["rollupType"] = adv_field.get("rollup_type")
                
                elif field_type == "formula":
                    field_def_result["fieldType"] = adv_field.get("result_type", "text").lower()
                    field_def_result["readOnly"] = True
                    field_def_result["computed"] = True
                    field_def_result["formula"] = adv_field.get("expression")
                
                result.append(field_def_result)
                
                # If this is a lookup field, traverse it
                if field_type == "lookup":
                    target_obj = adv_field.get("target_object")
                    if target_obj:
                        await traverse_object(target_obj, api_key, depth + 1)
        
        # Process fields
        if isinstance(fields, dict):
            for field_key, field_def in fields.items():
                field_path = f"{prefix}.{field_key}" if prefix else field_key
                
                result.append({
                    "apiName": field_key,
                    "label": field_def.get('label', field_key),
                    "fieldType": field_def.get('type', 'text'),
                    "objectName": obj_name,
                    "isParentField": bool(prefix),
                    "parentLookupField": prefix.split('.')[0] if prefix else None,
                    "fullPath": field_path
                })
                
                # If this is a lookup field, traverse it
                if field_def.get('type') == 'lookup' and field_def.get('related_object'):
                    await traverse_object(
                        field_def['related_object'],
                        field_path,
                        depth + 1
                    )
        elif isinstance(fields, list):
            for field_def in fields:
                field_key = field_def.get('key') or field_def.get('api_name')
                if not field_key:
                    continue
                    
                field_path = f"{prefix}.{field_key}" if prefix else field_key
                
                result.append({
                    "apiName": field_key,
                    "label": field_def.get('label', field_key),
                    "fieldType": field_def.get('type', 'text'),
                    "objectName": obj_name,
                    "isParentField": bool(prefix),
                    "parentLookupField": prefix.split('.')[0] if prefix else None,
                    "fullPath": field_path
                })
                
                # If this is a lookup field, traverse it
                if field_def.get('type') == 'lookup':
                    related_obj = field_def.get('related_object') or field_def.get('lookup_object')
                    if related_obj:
                        await traverse_object(related_obj, field_path, depth + 1)
    
    await traverse_object(object_name.lower(), "", 0)
    return result
