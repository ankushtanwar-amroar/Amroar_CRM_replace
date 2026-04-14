"""
Parent Field Resolution Service
Shared utility for resolving parent lookup field values across validation rules,
formula fields, and field behavior rules.

Supports:
- Dot notation: Account.Industry, Account.Customer_Type
- Parent keyword: Parent.Industry (resolves based on context)
- Case-insensitive field matching
- Depth=1 traversal (single level lookup)
"""
from typing import Dict, Any, List, Optional, Tuple
from motor.motor_asyncio import AsyncIOMotorDatabase
import logging
import re

logger = logging.getLogger(__name__)

# Common lookup field mappings (field_id_pattern -> target_object)
COMMON_LOOKUP_PATTERNS = {
    'account_id': 'account',
    'contact_id': 'contact',
    'opportunity_id': 'opportunity',
    'lead_id': 'lead',
    'owner_id': 'user',
    'created_by': 'user',
    'modified_by': 'user',
    'parent_id': None,  # Self-reference, determined by context
}


class ParentFieldResolver:
    """
    Resolves parent field values for validation rules and other criteria evaluations.
    """
    
    def __init__(self, db: AsyncIOMotorDatabase, tenant_id: str):
        self.db = db
        self.tenant_id = tenant_id
        self._object_cache: Dict[str, Dict[str, Any]] = {}
        self._record_cache: Dict[str, Dict[str, Any]] = {}
    
    async def resolve_parent_fields(
        self,
        object_name: str,
        record_data: Dict[str, Any],
        field_paths: List[str]
    ) -> Dict[str, Any]:
        """
        Resolve parent field values from record data.
        
        Args:
            object_name: Current object name (e.g., "opportunity")
            record_data: Current record data containing lookup IDs
            field_paths: List of paths like ["Account.Industry", "Account.Customer_Type"]
            
        Returns:
            Dict mapping paths to resolved values:
            {
                "Account.Industry": "Technology",
                "Account.Customer_Type": "Enterprise"
            }
        """
        if not field_paths:
            return {}
        
        resolved = {}
        
        # Group paths by their root lookup object
        grouped = self._group_by_root(field_paths)
        
        for root_lookup, paths in grouped.items():
            # Find the lookup ID in record_data
            lookup_id = self._find_lookup_id(record_data, root_lookup)
            
            if not lookup_id:
                logger.debug(f"No lookup ID found for {root_lookup} in record data")
                # Set all paths for this root to None
                for path in paths:
                    resolved[path] = None
                continue
            
            # Determine target object
            target_object = await self._get_target_object(object_name, root_lookup)
            
            if not target_object:
                logger.warning(f"Could not determine target object for {root_lookup}")
                for path in paths:
                    resolved[path] = None
                continue
            
            # Fetch the parent record
            parent_record = await self._get_record(target_object, lookup_id)
            
            if not parent_record:
                logger.debug(f"Parent record {lookup_id} not found for {target_object}")
                for path in paths:
                    resolved[path] = None
                continue
            
            parent_data = parent_record.get('data', {})
            
            # Resolve each field path
            for path in paths:
                field_name = self._extract_field_name(path, root_lookup)
                value = self._get_field_value_case_insensitive(parent_data, field_name)
                resolved[path] = value
        
        return resolved
    
    async def resolve_for_validation(
        self,
        object_name: str,
        record_data: Dict[str, Any],
        conditions: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        Resolve parent fields needed for validation rule conditions.
        Returns merged data with parent fields accessible.
        
        Args:
            object_name: Object being validated
            record_data: Record data
            conditions: List of validation rule conditions
            
        Returns:
            Merged dict with record_data + resolved parent values
        """
        # Extract parent field paths from conditions
        parent_paths = []
        for condition in conditions:
            field_name = condition.get('field_name', '')
            if '.' in field_name:
                parent_paths.append(field_name)
        
        if not parent_paths:
            return record_data
        
        # Resolve parent fields
        resolved = await self.resolve_parent_fields(object_name, record_data, parent_paths)
        
        # Merge with record data (parent paths take precedence for consistency)
        merged = dict(record_data)
        merged.update(resolved)
        
        return merged
    
    def _group_by_root(self, paths: List[str]) -> Dict[str, List[str]]:
        """Group paths by their root lookup field (first part before dot)"""
        groups: Dict[str, List[str]] = {}
        for path in paths:
            if '.' in path:
                root = path.split('.')[0].lower()
                # Normalize "Parent" to the actual lookup
                if root == 'parent':
                    root = 'parent'  # Will be resolved based on context
                if root not in groups:
                    groups[root] = []
                groups[root].append(path)
        return groups
    
    def _find_lookup_id(self, record_data: Dict[str, Any], lookup_name: str) -> Optional[str]:
        """Find the lookup ID value in record data"""
        lookup_lower = lookup_name.lower()
        
        # Try direct match
        if lookup_name in record_data:
            return record_data[lookup_name]
        
        # Try with _id suffix
        id_key = f"{lookup_lower}_id"
        for key, value in record_data.items():
            if key.lower() == id_key:
                return value
        
        # Try without _id suffix
        for key, value in record_data.items():
            if key.lower() == lookup_lower:
                return value
        
        return None
    
    async def _get_target_object(self, source_object: str, lookup_name: str) -> Optional[str]:
        """Determine the target object for a lookup field"""
        lookup_lower = lookup_name.lower()
        
        # Check common patterns first
        if lookup_lower in COMMON_LOOKUP_PATTERNS:
            target = COMMON_LOOKUP_PATTERNS[lookup_lower]
            if target:
                return target
        
        # Check if it's a known object name directly
        known_objects = ['account', 'contact', 'opportunity', 'lead', 'user', 'task', 'event']
        if lookup_lower in known_objects:
            return lookup_lower
        
        # Check object schema for lookup field definition
        object_def = await self._get_object_definition(source_object)
        if object_def:
            fields = object_def.get('fields', {})
            
            if isinstance(fields, dict):
                # Check for field with _id suffix
                for field_key, field_def in fields.items():
                    if field_key.lower() == f"{lookup_lower}_id" or field_key.lower() == lookup_lower:
                        if field_def.get('type') == 'lookup':
                            return field_def.get('related_object', '').lower()
                        # Even if type is 'text', assume it's a lookup based on naming convention
                        if field_key.endswith('_id'):
                            return field_key[:-3].lower()
        
        # Fallback: assume lookup name is the object name
        return lookup_lower
    
    async def _get_object_definition(self, object_name: str) -> Optional[Dict[str, Any]]:
        """Get object definition from cache or database"""
        cache_key = object_name.lower()
        
        if cache_key in self._object_cache:
            return self._object_cache[cache_key]
        
        object_def = await self.db.tenant_objects.find_one({
            "tenant_id": self.tenant_id,
            "$or": [
                {"object_name": cache_key},
                {"api_name": cache_key}
            ]
        }, {"_id": 0})
        
        if object_def:
            self._object_cache[cache_key] = object_def
        
        return object_def
    
    async def _get_record(self, object_name: str, record_id: str) -> Optional[Dict[str, Any]]:
        """Get record from cache or database"""
        cache_key = f"{object_name.lower()}:{record_id}"
        
        if cache_key in self._record_cache:
            return self._record_cache[cache_key]
        
        record = await self.db.object_records.find_one({
            "tenant_id": self.tenant_id,
            "object_name": object_name.lower(),
            "id": record_id
        }, {"_id": 0})
        
        if record:
            self._record_cache[cache_key] = record
        
        return record
    
    def _extract_field_name(self, path: str, root: str) -> str:
        """Extract the field name from a path after the root"""
        parts = path.split('.')
        if len(parts) >= 2:
            return parts[1]
        return path
    
    def _get_field_value_case_insensitive(self, data: Dict[str, Any], field_name: str) -> Any:
        """Get field value with case-insensitive matching"""
        if field_name in data:
            return data[field_name]
        
        field_lower = field_name.lower()
        for key, value in data.items():
            if key.lower() == field_lower:
                return value
        
        return None
    
    def clear_cache(self):
        """Clear all caches"""
        self._object_cache.clear()
        self._record_cache.clear()


async def get_fields_with_parent_lookups(
    db: AsyncIOMotorDatabase,
    tenant_id: str,
    object_name: str,
    include_parent: bool = True,
    depth: int = 1
) -> List[Dict[str, Any]]:
    """
    Get available fields for a criteria editor, including parent lookup fields.
    
    Args:
        db: Database connection
        tenant_id: Tenant ID
        object_name: Object name
        include_parent: Whether to include parent lookup fields
        depth: How deep to traverse (1 = single level)
        
    Returns:
        List of field definitions with full_path for parent fields
    """
    result = []
    
    # Get object definition
    object_def = await db.tenant_objects.find_one({
        "tenant_id": tenant_id,
        "$or": [
            {"object_name": object_name.lower()},
            {"api_name": object_name.lower()}
        ]
    }, {"_id": 0})
    
    if not object_def:
        logger.warning(f"Object definition not found for {object_name}")
        return result
    
    fields = object_def.get('fields', {})
    lookup_fields = []  # Track lookup fields for parent traversal
    
    # Process current object fields
    if isinstance(fields, dict):
        for field_key, field_def in fields.items():
            field_type = field_def.get('type', 'text')
            
            result.append({
                "api_name": field_key,
                "label": field_def.get('label', field_key.replace('_', ' ').title()),
                "field_type": field_type,
                "full_path": field_key,
                "is_parent": False,
                "parent_object": None,
                "options": field_def.get('options', [])
            })
            
            # Check if this is a lookup field
            if field_type == 'lookup' or field_key.endswith('_id'):
                target_object = None
                if field_type == 'lookup':
                    target_object = field_def.get('related_object', '').lower()
                elif field_key.endswith('_id'):
                    # Derive target from field name: account_id -> account
                    target_object = field_key[:-3].lower()
                
                if target_object and target_object not in ['', 'user']:  # Skip user lookups for now
                    lookup_fields.append({
                        'field_key': field_key,
                        'target_object': target_object,
                        'display_name': target_object.title()
                    })
    
    # =========================================
    # Include Advanced Fields (Lookup, Rollup, Formula)
    # =========================================
    advanced_fields = await db.advanced_fields.find({
        "tenant_id": tenant_id,
        "object_name": object_name.lower(),
        "is_active": {"$ne": False}
    }, {"_id": 0}).to_list(None)
    
    for adv_field in advanced_fields:
        field_type = adv_field.get("field_type", "").lower()
        api_key = adv_field.get("api_key")
        
        if not api_key:
            continue
        
        field_def_result = {
            "api_name": api_key,
            "label": adv_field.get("label", api_key),
            "full_path": api_key,
            "is_parent": False,
            "parent_object": None,
            "is_advanced_field": True,
            "advanced_field_type": field_type,
            "options": []
        }
        
        if field_type == "lookup":
            field_def_result["field_type"] = "lookup"
            field_def_result["lookup_object"] = adv_field.get("target_object")
            field_def_result["display_field"] = adv_field.get("display_field")
            # Add to lookup_fields for parent traversal
            target_obj = adv_field.get("target_object", "").lower()
            if target_obj and target_obj not in ['', 'user']:
                lookup_fields.append({
                    'field_key': api_key,
                    'target_object': target_obj,
                    'display_name': adv_field.get("label", api_key)
                })
        
        elif field_type == "rollup":
            field_def_result["field_type"] = adv_field.get("result_type", "number").lower()
            field_def_result["read_only"] = True
            field_def_result["computed"] = True
            field_def_result["rollup_type"] = adv_field.get("rollup_type")
        
        elif field_type == "formula":
            field_def_result["field_type"] = adv_field.get("result_type", "text").lower()
            field_def_result["read_only"] = True
            field_def_result["computed"] = True
            field_def_result["formula"] = adv_field.get("expression")
        
        result.append(field_def_result)
    
    # Add parent lookup fields if requested
    if include_parent and depth >= 1:
        for lookup in lookup_fields:
            parent_object_name = lookup['target_object']
            display_prefix = lookup['display_name']
            
            # Get parent object definition
            parent_def = await db.tenant_objects.find_one({
                "tenant_id": tenant_id,
                "$or": [
                    {"object_name": parent_object_name},
                    {"api_name": parent_object_name}
                ]
            }, {"_id": 0})
            
            if not parent_def:
                continue
            
            parent_fields = parent_def.get('fields', {})
            
            if isinstance(parent_fields, dict):
                for field_key, field_def in parent_fields.items():
                    # Skip lookup fields in parent (depth=1 only)
                    if field_key.endswith('_id'):
                        continue
                    
                    field_type = field_def.get('type', 'text')
                    full_path = f"{display_prefix}.{field_key}"
                    
                    result.append({
                        "api_name": field_key,
                        "label": f"{display_prefix} {field_def.get('label', field_key.replace('_', ' ').title())}",
                        "field_type": field_type,
                        "full_path": full_path,
                        "is_parent": True,
                        "parent_object": parent_object_name,
                        "options": field_def.get('options', [])
                    })
    
    return result


def is_parent_field_path(field_name: str) -> bool:
    """Check if a field name is a parent field path (contains dot)"""
    return '.' in field_name


def normalize_field_path(field_path: str) -> str:
    """Normalize a field path for consistent comparison"""
    # Split, lowercase, and rejoin
    parts = field_path.split('.')
    return '.'.join(p.lower() for p in parts)
