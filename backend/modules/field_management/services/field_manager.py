"""Field Manager Service - Unified service for all advanced field types"""
from motor.motor_asyncio import AsyncIOMotorDatabase
from typing import Optional, List, Dict, Any, Union
from datetime import datetime, timezone

from ..models.base import AdvancedFieldBase, FieldType
from ..models.lookup_field import LookupFieldConfig, LookupFieldCreate, LookupFieldUpdate
from ..models.rollup_field import RollupFieldConfig, RollupFieldCreate, RollupFieldUpdate
from ..models.formula_field import FormulaFieldConfig, FormulaFieldCreate, FormulaFieldUpdate

from .lookup_service import LookupFieldService
from .rollup_service import RollupFieldService
from .formula_service import FormulaFieldService


class FieldManagerService:
    """Unified service for managing all advanced field types"""
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.lookup_service = LookupFieldService(db)
        self.rollup_service = RollupFieldService(db)
        self.formula_service = FormulaFieldService(db)
        self.collection = db.advanced_fields
    
    async def get_all_advanced_fields(
        self,
        object_name: str,
        tenant_id: str
    ) -> List[Dict[str, Any]]:
        """Get all advanced fields (lookup, rollup, formula) for an object"""
        cursor = self.collection.find({
            "object_name": object_name,
            "tenant_id": tenant_id,
            "is_active": True
        }, {"_id": 0})
        
        return await cursor.to_list(length=100)
    
    async def get_field_by_id(
        self,
        field_id: str,
        tenant_id: str
    ) -> Optional[Dict[str, Any]]:
        """Get any advanced field by ID"""
        return await self.collection.find_one({
            "id": field_id,
            "tenant_id": tenant_id,
            "is_active": True
        }, {"_id": 0})
    
    async def get_field_by_api_key(
        self,
        object_name: str,
        api_key: str,
        tenant_id: str
    ) -> Optional[Dict[str, Any]]:
        """Get any advanced field by API key"""
        return await self.collection.find_one({
            "object_name": object_name,
            "api_key": api_key,
            "tenant_id": tenant_id,
            "is_active": True
        }, {"_id": 0})
    
    async def get_fields_by_type(
        self,
        object_name: str,
        tenant_id: str,
        field_type: FieldType
    ) -> List[Dict[str, Any]]:
        """Get fields filtered by type"""
        cursor = self.collection.find({
            "object_name": object_name,
            "tenant_id": tenant_id,
            "field_type": field_type.value,
            "is_active": True
        }, {"_id": 0})
        
        return await cursor.to_list(length=100)
    
    async def get_related_objects(
        self,
        tenant_id: str
    ) -> List[Dict[str, Any]]:
        """Get all objects that can be used as relationship targets.
        Filters out internal system objects that should not be exposed for lookups."""
        # Objects that should be excluded from lookup relationships
        EXCLUDED_OBJECTS = {
            'file_version',
            'file_record_link',
            'system_config',
            'audit_log',
            'metadata_fields',
        }
        
        cursor = self.db.tenant_objects.find(
            {"tenant_id": tenant_id},
            {"_id": 0, "object_name": 1, "object_label": 1, "fields": 1}
        )
        
        objects = await cursor.to_list(length=100)
        
        # Filter out excluded objects
        return [obj for obj in objects if obj.get('object_name') not in EXCLUDED_OBJECTS]
    
    async def get_object_fields(
        self,
        object_name: str,
        tenant_id: str
    ) -> Dict[str, Any]:
        """Get all fields (standard + custom + advanced) for an object"""
        # Get standard object definition
        obj = await self.db.tenant_objects.find_one({
            "object_name": object_name,
            "tenant_id": tenant_id
        }, {"_id": 0})
        
        if not obj:
            return {"fields": {}}
        
        fields = obj.get("fields", {})
        
        # Add custom fields from metadata
        metadata = await self.db.metadata_fields.find_one({
            "object_name": object_name,
            "tenant_id": tenant_id
        })
        
        if metadata and metadata.get("fields"):
            for custom_field in metadata["fields"]:
                fields[custom_field["api_name"]] = {
                    "type": custom_field["type"].lower(),
                    "label": custom_field["label"],
                    "is_custom": True
                }
        
        # Add advanced fields
        advanced_fields = await self.get_all_advanced_fields(object_name, tenant_id)
        for adv_field in advanced_fields:
            fields[adv_field["api_key"]] = {
                "type": adv_field["field_type"],
                "label": adv_field["label"],
                "is_custom": True,
                "is_advanced": True,
                "advanced_config": adv_field
            }
        
        return {"object_name": object_name, "fields": fields}
    
    async def get_child_relationships(
        self,
        object_name: str,
        tenant_id: str
    ) -> List[Dict[str, Any]]:
        """Get all objects that have a lookup field pointing to this object"""
        # Find all lookup fields where target_object matches
        cursor = self.collection.find({
            "tenant_id": tenant_id,
            "field_type": FieldType.LOOKUP.value,
            "target_object": object_name,
            "is_active": True
        }, {"_id": 0})
        
        relationships = []
        async for field in cursor:
            relationships.append({
                "child_object": field["object_name"],
                "relationship_field": field["api_key"],
                "field_label": field["label"]
            })
        
        return relationships
    
    async def evaluate_formula_fields(
        self,
        object_name: str,
        tenant_id: str,
        record: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Evaluate all formula fields for a record"""
        formula_fields = await self.formula_service.list_formula_fields(object_name, tenant_id)
        
        for field in formula_fields:
            value = await self.formula_service.evaluate_formula_for_record(field, record)
            record[field.api_key] = value
        
        return record
    
    async def get_layouts_for_object(
        self,
        object_name: str,
        tenant_id: str
    ) -> List[Dict[str, Any]]:
        """Get all page layouts for an object"""
        # Convert object_name to lowercase as layouts are stored with lowercase object names
        cursor = self.db.lightning_page_layouts.find({
            "object_name": object_name.lower(),
            "tenant_id": tenant_id
        }, {"_id": 0, "id": 1, "layout_name": 1, "page_type": 1})
        
        return await cursor.to_list(length=50)
    
    async def validate_api_key_unique(
        self,
        object_name: str,
        api_key: str,
        tenant_id: str,
        exclude_field_id: Optional[str] = None
    ) -> bool:
        """Check if an API key is unique within the object"""
        query = {
            "object_name": object_name,
            "tenant_id": tenant_id,
            "api_key": api_key,
            "is_active": True
        }
        
        if exclude_field_id:
            query["id"] = {"$ne": exclude_field_id}
        
        existing = await self.collection.find_one(query)
        return existing is None
