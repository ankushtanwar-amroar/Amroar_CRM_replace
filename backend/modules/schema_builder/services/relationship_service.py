"""
Schema Builder - Relationship Service
=====================================
Business logic for managing Schema Relationships (Lookups).
Uses dedicated collection: schema_relationships
"""

import uuid
import re
from datetime import datetime, timezone
from typing import List, Optional
from motor.motor_asyncio import AsyncIOMotorDatabase
import logging

from ..models import (
    SchemaRelationship, SchemaRelationshipCreate, FieldType
)

logger = logging.getLogger(__name__)


class RelationshipService:
    """Service for managing Schema Relationships"""
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.collection = db.schema_relationships
        self.objects_collection = db.schema_objects
        self.fields_collection = db.schema_fields
    
    def _generate_api_name(self, label: str) -> str:
        """Generate API name from label (snake_case, lowercase)"""
        api_name = re.sub(r'[^\w\s]', '', label)
        api_name = re.sub(r'\s+', '_', api_name)
        return api_name.lower()
    
    async def create_relationship(
        self, 
        data: SchemaRelationshipCreate, 
        tenant_id: str, 
        user_id: str
    ) -> SchemaRelationship:
        """
        Create a new Schema Relationship (Lookup).
        This also creates a lookup field on the source object.
        """
        
        # Verify source object exists
        source_obj = await self.objects_collection.find_one({
            "id": data.source_object_id,
            "tenant_id": tenant_id
        })
        if not source_obj:
            raise ValueError(f"Source object with ID '{data.source_object_id}' not found")
        
        # Verify target object exists
        target_obj = await self.objects_collection.find_one({
            "id": data.target_object_id,
            "tenant_id": tenant_id
        })
        if not target_obj:
            raise ValueError(f"Target object with ID '{data.target_object_id}' not found")
        
        # Generate API name
        api_name = self._generate_api_name(data.label) if not data.api_name else data.api_name.lower()
        
        # Ensure API name ends with _id for clarity
        if not api_name.endswith("_id"):
            api_name = f"{api_name}_id"
        
        # Check for duplicate API name on source object
        existing_field = await self.fields_collection.find_one({
            "tenant_id": tenant_id,
            "object_id": data.source_object_id,
            "api_name": api_name
        })
        if existing_field:
            raise ValueError(f"Field with API name '{api_name}' already exists on the source object")
        
        now = datetime.now(timezone.utc)
        relationship_id = str(uuid.uuid4())
        field_id = str(uuid.uuid4())
        
        # Create the relationship record
        relationship = {
            "id": relationship_id,
            "tenant_id": tenant_id,
            "label": data.label,
            "api_name": api_name,
            "source_object_id": data.source_object_id,
            "target_object_id": data.target_object_id,
            "is_required": data.is_required,
            "is_active": True,
            "created_at": now,
            "updated_at": now,
            "created_by": user_id
        }
        
        await self.collection.insert_one(relationship)
        
        # Get next sort order for the field
        max_sort = await self.fields_collection.find_one(
            {"tenant_id": tenant_id, "object_id": data.source_object_id},
            sort=[("sort_order", -1)]
        )
        next_sort = (max_sort.get("sort_order", 0) + 1) if max_sort else 0
        
        # Create the corresponding lookup field on source object
        lookup_field = {
            "id": field_id,
            "tenant_id": tenant_id,
            "object_id": data.source_object_id,
            "label": data.label,
            "api_name": api_name,
            "field_type": FieldType.LOOKUP.value,
            "is_required": data.is_required,
            "default_value": None,
            "is_unique": False,
            "help_text": f"Lookup to {target_obj['label']}",
            "picklist_values": None,
            "lookup_object": target_obj["api_name"],
            "is_system": False,
            "is_active": True,
            "sort_order": next_sort,
            "created_at": now,
            "updated_at": now,
            "created_by": user_id,
            "relationship_id": relationship_id  # Link field to relationship
        }
        
        await self.fields_collection.insert_one(lookup_field)
        
        logger.info(f"Created relationship: {source_obj['label']} → {target_obj['label']} (ID: {relationship_id})")
        
        relationship.pop("_id", None)
        return SchemaRelationship(**relationship)
    
    async def get_relationship(self, relationship_id: str, tenant_id: str) -> Optional[SchemaRelationship]:
        """Get a Schema Relationship by ID"""
        rel = await self.collection.find_one({
            "id": relationship_id,
            "tenant_id": tenant_id
        }, {"_id": 0})
        
        if rel:
            return SchemaRelationship(**rel)
        return None
    
    async def list_relationships(
        self, 
        tenant_id: str,
        object_id: Optional[str] = None,
        include_inactive: bool = False
    ) -> List[SchemaRelationship]:
        """List Schema Relationships for a tenant, optionally filtered by object"""
        query = {"tenant_id": tenant_id}
        
        if object_id:
            query["$or"] = [
                {"source_object_id": object_id},
                {"target_object_id": object_id}
            ]
        
        if not include_inactive:
            query["is_active"] = True
        
        relationships = await self.collection.find(query, {"_id": 0}).to_list(None)
        return [SchemaRelationship(**r) for r in relationships]
    
    async def delete_relationship(self, relationship_id: str, tenant_id: str) -> bool:
        """
        Delete a Schema Relationship.
        This also deletes the associated lookup field.
        """
        existing = await self.get_relationship(relationship_id, tenant_id)
        if not existing:
            return False
        
        # Delete the associated lookup field
        await self.fields_collection.delete_one({
            "tenant_id": tenant_id,
            "relationship_id": relationship_id
        })
        
        # Delete the relationship
        result = await self.collection.delete_one({
            "id": relationship_id,
            "tenant_id": tenant_id
        })
        
        if result.deleted_count > 0:
            logger.info(f"Deleted relationship: {relationship_id}")
            return True
        return False
    
    async def get_relationships_for_object(
        self, 
        object_id: str, 
        tenant_id: str,
        as_source: bool = True,
        as_target: bool = True
    ) -> List[dict]:
        """
        Get relationships involving an object with resolved object details.
        """
        query = {"tenant_id": tenant_id, "is_active": True}
        
        conditions = []
        if as_source:
            conditions.append({"source_object_id": object_id})
        if as_target:
            conditions.append({"target_object_id": object_id})
        
        if conditions:
            query["$or"] = conditions
        else:
            return []
        
        relationships = await self.collection.find(query, {"_id": 0}).to_list(None)
        
        # Enrich with object details
        result = []
        for rel in relationships:
            source_obj = await self.objects_collection.find_one(
                {"id": rel["source_object_id"], "tenant_id": tenant_id},
                {"_id": 0, "label": 1, "api_name": 1}
            )
            target_obj = await self.objects_collection.find_one(
                {"id": rel["target_object_id"], "tenant_id": tenant_id},
                {"_id": 0, "label": 1, "api_name": 1}
            )
            
            result.append({
                **rel,
                "source_object": source_obj,
                "target_object": target_obj
            })
        
        return result
