"""
Schema Builder - Field Service
==============================
Business logic for managing Schema Fields.
Uses dedicated collection: schema_fields
"""

import uuid
import re
from datetime import datetime, timezone
from typing import List, Optional
from motor.motor_asyncio import AsyncIOMotorDatabase
import logging

from ..models import (
    SchemaField, SchemaFieldCreate, SchemaFieldUpdate, FieldType
)

logger = logging.getLogger(__name__)


class FieldService:
    """Service for managing Schema Fields"""
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.collection = db.schema_fields
        self.objects_collection = db.schema_objects
        self.records_collection = db.object_records
    
    def _generate_api_name(self, label: str) -> str:
        """Generate API name from label (snake_case, lowercase)"""
        api_name = re.sub(r'[^\w\s]', '', label)
        api_name = re.sub(r'\s+', '_', api_name)
        return api_name.lower()
    
    async def create_field(
        self, 
        data: SchemaFieldCreate, 
        tenant_id: str, 
        user_id: str
    ) -> SchemaField:
        """Create a new Schema Field"""
        
        # Verify object exists
        obj = await self.objects_collection.find_one({
            "id": data.object_id,
            "tenant_id": tenant_id
        })
        if not obj:
            raise ValueError(f"Object with ID '{data.object_id}' not found")
        
        # Generate API name if not properly formatted
        api_name = self._generate_api_name(data.label) if not data.api_name else data.api_name.lower()
        
        # Check for duplicate API name on this object
        existing = await self.collection.find_one({
            "tenant_id": tenant_id,
            "object_id": data.object_id,
            "api_name": api_name
        })
        if existing:
            raise ValueError(f"Field with API name '{api_name}' already exists on this object")
        
        # Get next sort order
        max_sort = await self.collection.find_one(
            {"tenant_id": tenant_id, "object_id": data.object_id},
            sort=[("sort_order", -1)]
        )
        next_sort = (max_sort.get("sort_order", 0) + 1) if max_sort else 0
        
        now = datetime.now(timezone.utc)
        field_id = str(uuid.uuid4())
        
        # Validate picklist values for picklist type
        picklist_values = None
        if data.field_type == FieldType.PICKLIST:
            if not data.picklist_values or len(data.picklist_values) == 0:
                raise ValueError("Picklist fields must have at least one value")
            picklist_values = data.picklist_values
        
        # Validate lookup object for lookup type
        lookup_object = None
        if data.field_type == FieldType.LOOKUP:
            if not data.lookup_object:
                raise ValueError("Lookup fields must specify a target object")
            # Verify target object exists
            target_obj = await self.objects_collection.find_one({
                "api_name": data.lookup_object.lower(),
                "tenant_id": tenant_id
            })
            if not target_obj:
                raise ValueError(f"Target object '{data.lookup_object}' not found")
            lookup_object = data.lookup_object.lower()
        
        schema_field = {
            "id": field_id,
            "tenant_id": tenant_id,
            "object_id": data.object_id,
            "label": data.label,
            "api_name": api_name,
            "field_type": data.field_type.value,
            "is_required": data.is_required,
            "is_searchable": getattr(data, 'is_searchable', False),
            "default_value": data.default_value,
            "is_unique": data.is_unique,
            "help_text": data.help_text,
            "picklist_values": picklist_values,
            "lookup_object": lookup_object,
            "is_system": False,
            "is_active": True,
            "sort_order": next_sort,
            "created_at": now,
            "updated_at": now,
            "created_by": user_id
        }
        
        await self.collection.insert_one(schema_field)
        logger.info(f"Created schema field: {api_name} on object {data.object_id}")
        
        # Sync with global_search_config if is_searchable is set
        if getattr(data, 'is_searchable', False):
            object_api_name = obj.get("api_name", "").lower()
            await self.db.global_search_config.update_one(
                {"tenant_id": tenant_id},
                {
                    "$set": {
                        f"field_config.{object_api_name}.{api_name}.is_searchable": True,
                        "tenant_id": tenant_id
                    }
                },
                upsert=True
            )
            logger.info(f"Synced field {api_name} as searchable in global_search_config")
        
        schema_field.pop("_id", None)
        return SchemaField(**schema_field)
    
    async def get_field(self, field_id: str, tenant_id: str) -> Optional[SchemaField]:
        """Get a Schema Field by ID"""
        field = await self.collection.find_one({
            "id": field_id,
            "tenant_id": tenant_id
        }, {"_id": 0})
        
        if field:
            return SchemaField(**field)
        return None
    
    async def list_fields(
        self, 
        object_id: str, 
        tenant_id: str,
        include_inactive: bool = False
    ) -> List[SchemaField]:
        """List all Schema Fields for an object"""
        query = {
            "tenant_id": tenant_id,
            "object_id": object_id
        }
        if not include_inactive:
            query["is_active"] = True
        
        fields = await self.collection.find(query, {"_id": 0}).sort("sort_order", 1).to_list(None)
        return [SchemaField(**f) for f in fields]
    
    async def update_field(
        self, 
        field_id: str, 
        data: SchemaFieldUpdate, 
        tenant_id: str
    ) -> Optional[SchemaField]:
        """
        Update a Schema Field.
        Note: field_type and api_name cannot be changed after creation.
        """
        existing = await self.get_field(field_id, tenant_id)
        if not existing:
            return None
        
        # System fields cannot be modified (except sort_order)
        if existing.is_system:
            if data.dict(exclude_unset=True, exclude={'sort_order'}):
                raise ValueError("System fields cannot be modified")
        
        # Build update dict
        update_data = {k: v for k, v in data.dict(exclude_unset=True).items() if v is not None}
        
        if not update_data:
            return existing
        
        # Validate picklist values if updating
        if "picklist_values" in update_data and existing.field_type == FieldType.PICKLIST.value:
            if not update_data["picklist_values"] or len(update_data["picklist_values"]) == 0:
                raise ValueError("Picklist fields must have at least one value")
        
        update_data["updated_at"] = datetime.now(timezone.utc)
        
        result = await self.collection.update_one(
            {"id": field_id, "tenant_id": tenant_id},
            {"$set": update_data}
        )
        
        if result.matched_count == 0:
            return None
        
        # Sync with global_search_config if is_searchable is being updated
        if "is_searchable" in update_data:
            # Get object API name
            obj = await self.objects_collection.find_one({
                "id": existing.object_id,
                "tenant_id": tenant_id
            })
            if obj:
                object_api_name = obj.get("api_name", "").lower()
                await self.db.global_search_config.update_one(
                    {"tenant_id": tenant_id},
                    {
                        "$set": {
                            f"field_config.{object_api_name}.{existing.api_name}.is_searchable": update_data["is_searchable"],
                            "tenant_id": tenant_id
                        }
                    },
                    upsert=True
                )
                logger.info(f"Synced field {existing.api_name} searchability to {update_data['is_searchable']}")
        
        logger.info(f"Updated schema field: {field_id}")
        return await self.get_field(field_id, tenant_id)
    
    async def delete_field(self, field_id: str, tenant_id: str) -> bool:
        """
        Delete a Schema Field.
        System fields cannot be deleted.
        """
        existing = await self.get_field(field_id, tenant_id)
        if not existing:
            return False
        
        if existing.is_system:
            raise ValueError("System fields cannot be deleted")
        
        result = await self.collection.delete_one({
            "id": field_id,
            "tenant_id": tenant_id
        })
        
        if result.deleted_count > 0:
            logger.info(f"Deleted schema field: {field_id}")
            return True
        return False
    
    async def reorder_fields(
        self, 
        object_id: str, 
        field_ids: List[str], 
        tenant_id: str
    ) -> List[SchemaField]:
        """Reorder fields by updating their sort_order"""
        
        # Verify all fields belong to this object
        existing_fields = await self.collection.find({
            "tenant_id": tenant_id,
            "object_id": object_id
        }, {"id": 1}).to_list(None)
        
        existing_ids = {f["id"] for f in existing_fields}
        for field_id in field_ids:
            if field_id not in existing_ids:
                raise ValueError(f"Field '{field_id}' not found on this object")
        
        # Update sort orders
        now = datetime.now(timezone.utc)
        for idx, field_id in enumerate(field_ids):
            await self.collection.update_one(
                {"id": field_id, "tenant_id": tenant_id},
                {"$set": {"sort_order": idx, "updated_at": now}}
            )
        
        logger.info(f"Reordered {len(field_ids)} fields on object {object_id}")
        return await self.list_fields(object_id, tenant_id)
    
    async def check_field_has_data(self, field_id: str, tenant_id: str) -> bool:
        """Check if a field has any data in records (for type change validation)"""
        field = await self.get_field(field_id, tenant_id)
        if not field:
            return False
        
        # Get object API name
        obj = await self.objects_collection.find_one({
            "id": field.object_id,
            "tenant_id": tenant_id
        })
        if not obj:
            return False
        
        # Check if any records have data for this field
        record_count = await self.records_collection.count_documents({
            "tenant_id": tenant_id,
            "object_name": obj["api_name"],
            f"data.{field.api_name}": {"$exists": True, "$nin": [None, ""]}
        })
        
        return record_count > 0
