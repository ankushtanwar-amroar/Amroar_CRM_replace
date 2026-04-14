"""
Schema Builder - Object Service
===============================
Business logic for managing Schema Objects.
Uses dedicated collection: schema_objects
"""

import uuid
import re
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any
from motor.motor_asyncio import AsyncIOMotorDatabase
import logging

from ..models import (
    SchemaObject, SchemaObjectCreate, SchemaObjectUpdate,
    SchemaField, FieldType
)

logger = logging.getLogger(__name__)


class ObjectService:
    """Service for managing Schema Objects"""
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.collection = db.schema_objects
        self.fields_collection = db.schema_fields
        self.relationships_collection = db.schema_relationships
    
    def _generate_api_name(self, label: str) -> str:
        """Generate API name from label (snake_case, lowercase)"""
        # Remove special characters, replace spaces with underscores
        api_name = re.sub(r'[^\w\s]', '', label)
        api_name = re.sub(r'\s+', '_', api_name)
        return api_name.lower()
    
    async def create_object(
        self, 
        data: SchemaObjectCreate, 
        tenant_id: str, 
        user_id: str
    ) -> SchemaObject:
        """Create a new Schema Object with system fields and default layouts"""
        
        # Generate API name if not properly formatted
        api_name = self._generate_api_name(data.label) if not data.api_name else data.api_name.lower()
        
        # Check for duplicate API name
        existing = await self.collection.find_one({
            "tenant_id": tenant_id,
            "api_name": api_name
        })
        if existing:
            raise ValueError(f"Object with API name '{api_name}' already exists")
        
        now = datetime.now(timezone.utc)
        object_id = str(uuid.uuid4())
        
        # Create object
        schema_object = {
            "id": object_id,
            "tenant_id": tenant_id,
            "label": data.label,
            "api_name": api_name,
            "description": data.description,
            "plural_label": data.plural_label or f"{data.label}s",
            "icon": data.icon,
            "is_custom": True,
            "is_active": True,
            "created_at": now,
            "updated_at": now,
            "created_by": user_id
        }
        
        await self.collection.insert_one(schema_object)
        
        # Create system fields automatically
        await self._create_system_fields(object_id, tenant_id, user_id)
        
        # Create default layouts for the new object (detail, new, edit)
        await self._create_default_layouts(
            object_id=object_id,
            object_label=data.label,
            api_name=api_name,
            tenant_id=tenant_id,
            user_id=user_id
        )
        
        logger.info(f"Created schema object: {api_name} (ID: {object_id})")
        
        # Remove MongoDB _id before returning
        schema_object.pop("_id", None)
        return SchemaObject(**schema_object)
    
    async def _create_system_fields(
        self, 
        object_id: str, 
        tenant_id: str, 
        user_id: str
    ):
        """Create system fields (id, createdAt, updatedAt) for a new object"""
        now = datetime.now(timezone.utc)
        
        system_fields = [
            {
                "id": str(uuid.uuid4()),
                "tenant_id": tenant_id,
                "object_id": object_id,
                "label": "ID",
                "api_name": "id",
                "field_type": FieldType.TEXT.value,
                "is_required": True,
                "is_unique": True,
                "is_system": True,
                "is_active": True,
                "sort_order": 0,
                "created_at": now,
                "updated_at": now,
                "created_by": user_id
            },
            {
                "id": str(uuid.uuid4()),
                "tenant_id": tenant_id,
                "object_id": object_id,
                "label": "Created At",
                "api_name": "created_at",
                "field_type": FieldType.DATETIME.value,
                "is_required": False,
                "is_unique": False,
                "is_system": True,
                "is_active": True,
                "sort_order": 1,
                "created_at": now,
                "updated_at": now,
                "created_by": user_id
            },
            {
                "id": str(uuid.uuid4()),
                "tenant_id": tenant_id,
                "object_id": object_id,
                "label": "Updated At",
                "api_name": "updated_at",
                "field_type": FieldType.DATETIME.value,
                "is_required": False,
                "is_unique": False,
                "is_system": True,
                "is_active": True,
                "sort_order": 2,
                "created_at": now,
                "updated_at": now,
                "created_by": user_id
            }
        ]
        
        await self.fields_collection.insert_many(system_fields)
        logger.info(f"Created {len(system_fields)} system fields for object {object_id}")

    async def _create_default_layouts(
        self,
        object_id: str,
        object_label: str,
        api_name: str,
        tenant_id: str,
        user_id: str
    ):
        """
        Create default layouts for a new custom object.
        
        Creates:
        1. Record Detail Layout (page_type: "detail")
        2. New Record Layout (page_type: "new")
        
        These layouts ensure the object works immediately without manual
        configuration, following the metadata-driven architecture.
        """
        now = datetime.now(timezone.utc)
        layouts_collection = self.db.lightning_page_layouts
        
        # System fields to exclude from user-visible layouts
        system_fields = {"id", "created_at", "updated_at", "created_by", "updated_by", "is_deleted"}
        
        # Get all non-system fields for this object
        fields = await self.fields_collection.find({
            "tenant_id": tenant_id,
            "object_id": object_id,
            "is_active": True
        }, {"_id": 0}).sort("sort_order", 1).to_list(None)
        
        # Filter out system fields and build field items
        user_fields = [f for f in fields if f.get("api_name", "").lower() not in system_fields]
        
        # Build field items for Record Detail component
        field_items = []
        for field in user_fields:
            field_items.append({
                "id": f"field-{field['api_name']}-{len(field_items)}",
                "type": "field",
                "key": field["api_name"],
                "label": field.get("label", field["api_name"])
            })
        
        # If no custom fields yet, add a placeholder
        if not field_items:
            field_items = [
                {"id": "field-name-0", "type": "field", "key": "name", "label": "Name"}
            ]
        
        # Create Record Detail section
        record_detail_section = {
            "id": f"section-{api_name}-info",
            "type": "field_section",
            "label": f"{object_label} Information",
            "collapsed": False,
            "fields": field_items
        }
        
        # ============================================
        # 1. Create Detail Layout
        # ============================================
        detail_layout_id = str(uuid.uuid4())
        detail_layout = {
            "id": detail_layout_id,
            "tenant_id": tenant_id,
            "object_name": api_name,
            "layout_name": f"{object_label} Record Page",
            "api_name": f"{object_label.replace(' ', '_')}_Record_Page",
            "description": f"Default record detail layout for {object_label}",
            "page_type": "detail",
            "is_system": False,
            "is_default": True,
            "is_active": True,
            "selected_layout": "header_left_main",
            "template_type": "header_left_main",
            "placed_components": {
                "header": [],
                "left": [],
                "main": [{
                    "id": "record_detail",
                    "instanceId": f"record_detail-{detail_layout_id[:8]}",
                    "name": "Record Detail",
                    "regionId": "main",
                    "config": {
                        "items": [record_detail_section]
                    }
                }],
                "right": []
            },
            "sections": [{
                "name": f"{object_label} Information",
                "columns": 2,
                "fields": [f["key"] for f in field_items]
            }],
            "created_at": now,
            "updated_at": now,
            "created_by": user_id
        }
        
        # ============================================
        # 2. Create New Record Layout
        # ============================================
        new_layout_id = str(uuid.uuid4())
        new_layout = {
            "id": new_layout_id,
            "tenant_id": tenant_id,
            "object_name": api_name,
            "layout_name": f"{object_label} New Record",
            "api_name": f"{object_label.replace(' ', '_')}_New_Record",
            "description": f"Default new record layout for {object_label}",
            "page_type": "new",
            "is_system": False,
            "is_default": True,
            "is_active": True,
            "selected_layout": "single_column",
            "template_type": "form",
            "placed_components": {
                "header": [],
                "left": [],
                "main": [{
                    "id": "record_detail",
                    "instanceId": f"record_detail-new-{new_layout_id[:8]}",
                    "name": "Record Detail",
                    "regionId": "main",
                    "config": {
                        "items": [record_detail_section]
                    }
                }],
                "right": []
            },
            "sections": [{
                "name": f"{object_label} Information",
                "columns": 2,
                "fields": [f["key"] for f in field_items]
            }],
            "required_fields": [],
            "default_values": {},
            "created_at": now,
            "updated_at": now,
            "created_by": user_id
        }
        
        # Insert both layouts
        await layouts_collection.insert_many([detail_layout, new_layout])
        logger.info(f"Created default layouts (detail, new) for object {api_name}")

    
    async def get_object(self, object_id: str, tenant_id: str) -> Optional[SchemaObject]:
        """Get a Schema Object by ID"""
        obj = await self.collection.find_one({
            "id": object_id,
            "tenant_id": tenant_id
        }, {"_id": 0})
        
        if obj:
            return SchemaObject(**obj)
        return None
    
    async def get_object_by_api_name(self, api_name: str, tenant_id: str) -> Optional[SchemaObject]:
        """Get a Schema Object by API name"""
        obj = await self.collection.find_one({
            "api_name": api_name.lower(),
            "tenant_id": tenant_id
        }, {"_id": 0})
        
        if obj:
            return SchemaObject(**obj)
        return None
    
    async def list_objects(
        self, 
        tenant_id: str, 
        include_inactive: bool = False
    ) -> List[SchemaObject]:
        """List all Schema Objects for a tenant"""
        query = {"tenant_id": tenant_id}
        if not include_inactive:
            query["is_active"] = True
        
        objects = await self.collection.find(query, {"_id": 0}).sort("label", 1).to_list(None)
        return [SchemaObject(**obj) for obj in objects]
    
    async def update_object(
        self, 
        object_id: str, 
        data: SchemaObjectUpdate, 
        tenant_id: str
    ) -> Optional[SchemaObject]:
        """Update a Schema Object"""
        
        # Build update dict
        update_data = {k: v for k, v in data.dict(exclude_unset=True).items() if v is not None}
        
        if not update_data:
            # Nothing to update, return current object
            return await self.get_object(object_id, tenant_id)
        
        update_data["updated_at"] = datetime.now(timezone.utc)
        
        result = await self.collection.update_one(
            {"id": object_id, "tenant_id": tenant_id},
            {"$set": update_data}
        )
        
        if result.matched_count == 0:
            return None
        
        logger.info(f"Updated schema object: {object_id}")
        return await self.get_object(object_id, tenant_id)
    
    async def delete_object(self, object_id: str, tenant_id: str) -> bool:
        """
        Delete a Schema Object.
        Checks for dependencies before deletion.
        """
        # Check for existing records using this object
        obj = await self.get_object(object_id, tenant_id)
        if not obj:
            return False
        
        # Check for relationships referencing this object
        relationships = await self.relationships_collection.find({
            "tenant_id": tenant_id,
            "$or": [
                {"source_object_id": object_id},
                {"target_object_id": object_id}
            ]
        }).to_list(None)
        
        if relationships:
            raise ValueError(
                f"Cannot delete object: {len(relationships)} relationship(s) reference this object. "
                "Delete the relationships first."
            )
        
        # Delete associated fields
        await self.fields_collection.delete_many({
            "tenant_id": tenant_id,
            "object_id": object_id
        })
        
        # Delete the object
        result = await self.collection.delete_one({
            "id": object_id,
            "tenant_id": tenant_id
        })
        
        if result.deleted_count > 0:
            logger.info(f"Deleted schema object: {object_id}")
            return True
        return False
    
    async def get_object_with_details(
        self, 
        object_id: str, 
        tenant_id: str
    ) -> Optional[Dict[str, Any]]:
        """Get a Schema Object with its fields and relationships"""
        obj = await self.get_object(object_id, tenant_id)
        if not obj:
            return None
        
        # Get fields
        fields = await self.fields_collection.find({
            "tenant_id": tenant_id,
            "object_id": object_id,
            "is_active": True
        }, {"_id": 0}).sort("sort_order", 1).to_list(None)
        
        # Get relationships
        relationships = await self.relationships_collection.find({
            "tenant_id": tenant_id,
            "$or": [
                {"source_object_id": object_id},
                {"target_object_id": object_id}
            ],
            "is_active": True
        }, {"_id": 0}).to_list(None)
        
        return {
            "object": obj.dict(),
            "fields": fields,
            "relationships": relationships
        }
