"""Lookup Field Service - Handles lookup field operations"""
from motor.motor_asyncio import AsyncIOMotorDatabase
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
import re

from ..models.lookup_field import (
    LookupFieldConfig, LookupFieldCreate, LookupFieldUpdate,
    LookupSearchRequest, LookupSearchResult, LookupFilter, FilterOperator
)
from ..models.base import FieldType


class LookupFieldService:
    """Service for managing lookup fields"""
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.collection = db.advanced_fields
    
    def _generate_api_key(self, label: str, object_name: str) -> str:
        """Generate API key from label"""
        # Convert to snake_case and append _id
        api_key = re.sub(r'[^a-zA-Z0-9\s]', '', label.lower())
        api_key = re.sub(r'\s+', '_', api_key)
        return f"{api_key}_id"
    
    async def create_lookup_field(
        self, 
        object_name: str,
        tenant_id: str,
        field_data: LookupFieldCreate,
        created_by: Optional[str] = None
    ) -> LookupFieldConfig:
        """Create a new lookup field"""
        
        # Generate API key if not provided
        api_key = field_data.api_key or self._generate_api_key(field_data.label, object_name)
        
        # Check if API key already exists in advanced_fields
        existing = await self.collection.find_one({
            "object_name": object_name,
            "tenant_id": tenant_id,
            "api_key": api_key
        })
        if existing:
            raise ValueError(f"Field with API key '{api_key}' already exists")
        
        # Also check if field exists in tenant_objects.fields
        source_object = await self.db.tenant_objects.find_one({
            "object_name": object_name,
            "tenant_id": tenant_id
        })
        if source_object and source_object.get("fields", {}).get(api_key):
            raise ValueError(f"Field with API key '{api_key}' already exists in object fields")
        
        # Validate target object exists
        target_object = await self.db.tenant_objects.find_one({
            "object_name": field_data.target_object,
            "tenant_id": tenant_id
        })
        if not target_object:
            raise ValueError(f"Target object '{field_data.target_object}' not found")
        
        # Get target object label for display
        target_object_label = target_object.get("object_label", field_data.target_object.capitalize())
        
        # Create lookup field config
        lookup_field = LookupFieldConfig(
            label=field_data.label,
            api_key=api_key,
            description=field_data.description,
            help_text=field_data.help_text,
            is_required=field_data.is_required,
            is_unique=field_data.is_unique,
            is_indexed=field_data.is_indexed,
            object_name=object_name,
            tenant_id=tenant_id,
            target_object=field_data.target_object,
            display_field=field_data.display_field,
            filter_config=field_data.filter_config or LookupFilter(),
            layout_assignments=field_data.layout_assignments,
            add_to_all_layouts=field_data.add_to_all_layouts,
            on_delete_action=field_data.on_delete_action,
            created_by=created_by
        )
        
        # Save to advanced_fields collection
        await self.collection.insert_one(lookup_field.model_dump())
        
        # CRITICAL: Also sync to tenant_objects.fields for full CRM integration
        # This makes the lookup field visible in:
        # - Standard & Custom Fields list
        # - Lookup Configuration
        # - Lightning Page Builder
        # - Record create/edit forms
        field_definition = {
            "type": "lookup",
            "label": field_data.label,
            "lookup_object": field_data.target_object,
            "lookup_display_field": field_data.display_field or "name",
            "related_object": field_data.target_object,
            "related_object_label": target_object_label,
            "required": field_data.is_required,
            "description": field_data.description,
            "help_text": field_data.help_text,
            "is_custom": True,
            "advanced_field_id": lookup_field.id,  # Link back to advanced_fields record
            "on_delete_action": field_data.on_delete_action,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "created_by": created_by
        }
        
        # Update tenant_objects to include this field
        await self.db.tenant_objects.update_one(
            {"object_name": object_name, "tenant_id": tenant_id},
            {"$set": {f"fields.{api_key}": field_definition}}
        )
        
        # AUTO-CREATE DEFAULT HOVER CONFIGURATION
        # This ensures Display & Search tab is the single source of truth
        # Users must configure display settings there after creating the lookup
        default_display_field = field_data.display_field or "name"
        
        # Get some default searchable fields from the target object
        target_fields = target_object.get("fields", {})
        default_searchable = [default_display_field]
        common_searchable = ["name", "email", "phone", "subject", "account_name", "first_name", "last_name"]
        for sf in common_searchable:
            if sf in target_fields and sf not in default_searchable:
                default_searchable.append(sf)
        default_searchable = default_searchable[:5]  # Limit to 5 fields
        
        await self.db.lookup_hover_assignments.update_one(
            {"object_name": object_name, "field_name": api_key},
            {"$set": {
                "object_name": object_name,
                "field_name": api_key,
                "related_object": field_data.target_object,
                "enabled": True,  # Enable hover preview by default
                "primary_display_field": default_display_field,
                "searchable_fields": default_searchable,
                "preview_fields": [
                    {"key": default_display_field, "label": target_fields.get(default_display_field, {}).get("label", default_display_field.replace("_", " ").title())}
                ],
                "show_recent_records": True,
                "enable_quick_create": False,
                "created_at": datetime.now(timezone.utc),
                "updated_at": datetime.now(timezone.utc)
            }},
            upsert=True
        )
        
        # If add_to_all_layouts is True, add field to all existing layouts
        if field_data.add_to_all_layouts:
            await self._add_field_to_layouts(object_name, tenant_id, api_key, field_data.label)
        
        return lookup_field
    
    async def _add_field_to_layouts(
        self, 
        object_name: str, 
        tenant_id: str, 
        field_api_key: str,
        field_label: str
    ):
        """Add a new field to all existing layouts for the object"""
        try:
            # Find all layouts for this object
            layouts = await self.db.lightning_pages.find({
                "object_name": object_name,
                "tenant_id": tenant_id,
                "is_active": True
            }).to_list(length=100)
            
            for layout in layouts:
                # Find the first section to add the field to
                components = layout.get("components", [])
                for component in components:
                    if component.get("type") == "FieldSection":
                        fields = component.get("props", {}).get("fields", [])
                        # Check if field is not already there
                        if not any(f.get("name") == field_api_key for f in fields):
                            fields.append({
                                "name": field_api_key,
                                "label": field_label,
                                "type": "lookup"
                            })
                            component["props"]["fields"] = fields
                            break
                
                # Update the layout
                await self.db.lightning_pages.update_one(
                    {"_id": layout["_id"]},
                    {"$set": {"components": components}}
                )
        except Exception as e:
            # Log but don't fail - layout addition is secondary
            print(f"Warning: Could not add field to layouts: {e}")
    
    async def get_lookup_field(
        self,
        field_id: str,
        tenant_id: str
    ) -> Optional[LookupFieldConfig]:
        """Get lookup field by ID"""
        field = await self.collection.find_one({
            "id": field_id,
            "tenant_id": tenant_id,
            "field_type": FieldType.LOOKUP.value
        }, {"_id": 0})
        
        if field:
            return LookupFieldConfig(**field)
        return None
    
    async def list_lookup_fields(
        self,
        object_name: str,
        tenant_id: str
    ) -> List[LookupFieldConfig]:
        """List all lookup fields for an object"""
        cursor = self.collection.find({
            "object_name": object_name,
            "tenant_id": tenant_id,
            "field_type": FieldType.LOOKUP.value,
            "is_active": True
        }, {"_id": 0})
        
        fields = await cursor.to_list(length=100)
        return [LookupFieldConfig(**f) for f in fields]
    
    async def update_lookup_field(
        self,
        field_id: str,
        tenant_id: str,
        update_data: LookupFieldUpdate,
        updated_by: Optional[str] = None
    ) -> Optional[LookupFieldConfig]:
        """Update a lookup field and sync to tenant_objects"""
        # First get the existing field
        existing_field = await self.collection.find_one({
            "id": field_id,
            "tenant_id": tenant_id,
            "field_type": FieldType.LOOKUP.value
        })
        
        if not existing_field:
            return None
        
        update_dict = update_data.model_dump(exclude_unset=True)
        update_dict["updated_at"] = datetime.now(timezone.utc)
        if updated_by:
            update_dict["updated_by"] = updated_by
        
        result = await self.collection.update_one(
            {
                "id": field_id,
                "tenant_id": tenant_id,
                "field_type": FieldType.LOOKUP.value
            },
            {"$set": update_dict}
        )
        
        # Also sync relevant changes to tenant_objects.fields
        object_name = existing_field.get("object_name")
        api_key = existing_field.get("api_key")
        
        if object_name and api_key:
            field_updates = {}
            if "label" in update_dict:
                field_updates[f"fields.{api_key}.label"] = update_dict["label"]
            if "is_required" in update_dict:
                field_updates[f"fields.{api_key}.required"] = update_dict["is_required"]
            if "description" in update_dict:
                field_updates[f"fields.{api_key}.description"] = update_dict["description"]
            if "help_text" in update_dict:
                field_updates[f"fields.{api_key}.help_text"] = update_dict["help_text"]
            if "display_field" in update_dict:
                field_updates[f"fields.{api_key}.lookup_display_field"] = update_dict["display_field"]
            if "on_delete_action" in update_dict:
                field_updates[f"fields.{api_key}.on_delete_action"] = update_dict["on_delete_action"]
            
            if field_updates:
                await self.db.tenant_objects.update_one(
                    {"object_name": object_name, "tenant_id": tenant_id},
                    {"$set": field_updates}
                )
        
        if result.modified_count > 0:
            return await self.get_lookup_field(field_id, tenant_id)
        return None
    
    async def delete_lookup_field(
        self,
        field_id: str,
        tenant_id: str
    ) -> bool:
        """Soft delete a lookup field and remove from tenant_objects"""
        # First get the field to know object_name and api_key
        field = await self.collection.find_one({
            "id": field_id,
            "tenant_id": tenant_id,
            "field_type": FieldType.LOOKUP.value
        })
        
        if not field:
            return False
        
        object_name = field.get("object_name")
        api_key = field.get("api_key")
        
        # Soft delete in advanced_fields
        result = await self.collection.update_one(
            {
                "id": field_id,
                "tenant_id": tenant_id,
                "field_type": FieldType.LOOKUP.value
            },
            {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc)}}
        )
        
        # Also remove from tenant_objects.fields
        if object_name and api_key:
            await self.db.tenant_objects.update_one(
                {"object_name": object_name, "tenant_id": tenant_id},
                {"$unset": {f"fields.{api_key}": ""}}
            )
            
            # Also remove from lookup_hover_assignments if exists
            await self.db.lookup_hover_assignments.delete_one({
                "object_name": object_name,
                "field_name": api_key
            })
        
        return result.modified_count > 0
    
    async def search_lookup_records(
        self,
        request: LookupSearchRequest,
        tenant_id: str,
        current_record: Optional[Dict[str, Any]] = None
    ) -> List[LookupSearchResult]:
        """Search records for lookup field, using configured searchable fields"""
        from modules.lookup_hover.services.hover_service import LookupHoverService
        
        # Build base query - records are stored in 'record_data' collection
        query: Dict[str, Any] = {
            "tenant_id": tenant_id,
            "object_name": request.object.lower(),
            "is_deleted": {"$ne": True}
        }
        
        # Get configured searchable fields for this lookup
        configured_searchable_fields = []
        primary_display_field = "name"
        
        if request.source_object and request.field_name:
            assignment = await LookupHoverService.get_assignment(
                request.source_object, 
                request.field_name
            )
            if assignment:
                configured_searchable_fields = assignment.get("searchable_fields", [])
                primary_display_field = assignment.get("primary_display_field", "name")
        
        # Add text search if query provided
        # Note: Fields are stored inside 'data' object in record_data
        if request.query:
            search_fields = []
            
            # Use configured searchable fields if available
            if configured_searchable_fields:
                for field in configured_searchable_fields:
                    search_fields.append({f"data.{field}": {"$regex": request.query, "$options": "i"}})
            
            # Always include fallback fields for broad search
            fallback_fields = ["name", "first_name", "last_name", "email", "account_name"]
            for field in fallback_fields:
                if field not in configured_searchable_fields:
                    search_fields.append({f"data.{field}": {"$regex": request.query, "$options": "i"}})
            
            if search_fields:
                query["$or"] = search_fields
        
        # Get lookup field for filter application
        if request.field_id:
            lookup_field = await self.get_lookup_field(request.field_id, tenant_id)
            if lookup_field and lookup_field.filter_config.is_enabled:
                filter_query = await self._build_filter_query(
                    lookup_field.filter_config,
                    current_record or request.context
                )
                query.update(filter_query)
        
        # Use object_records collection (correct CRM data storage)
        collection = self.db["object_records"]
        
        # Execute search
        cursor = collection.find(query, {"_id": 0}).limit(request.limit)
        records = await cursor.to_list(length=request.limit)
        
        # Format results
        results = []
        for record in records:
            data = record.get("data", {})
            
            # Determine display value using configured primary display field
            display_value = data.get(primary_display_field)
            
            # Fallback logic if primary display field is empty
            if not display_value:
                display_value = (
                    data.get("name") or
                    f"{data.get('first_name', '')} {data.get('last_name', '')}".strip() or
                    data.get("account_name") or
                    record.get("id")
                )
            
            results.append(LookupSearchResult(
                id=record.get("id"),
                display_value=display_value.strip() if display_value else str(record.get("id")),
                secondary_value=data.get("email"),
                record=data
            ))
        
        return results
    
    async def _build_filter_query(
        self,
        filter_config: LookupFilter,
        context: Optional[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Build MongoDB query from filter config"""
        if not filter_config.rules:
            return {}
        
        conditions = []
        for rule in filter_config.rules:
            # Get value based on type
            if rule.value_type == "current_record" and context and rule.source_field:
                value = context.get(rule.source_field)
            else:
                value = rule.static_value
            
            # Build condition based on operator
            field = rule.target_field
            operator = rule.operator
            
            if operator == FilterOperator.EQUALS:
                conditions.append({field: value})
            elif operator == FilterOperator.NOT_EQUALS:
                conditions.append({field: {"$ne": value}})
            elif operator == FilterOperator.CONTAINS:
                conditions.append({field: {"$regex": value, "$options": "i"}})
            elif operator == FilterOperator.IN:
                conditions.append({field: {"$in": value if isinstance(value, list) else [value]}})
            elif operator == FilterOperator.GREATER_THAN:
                conditions.append({field: {"$gt": value}})
            elif operator == FilterOperator.LESS_THAN:
                conditions.append({field: {"$lt": value}})
            elif operator == FilterOperator.IS_NULL:
                conditions.append({field: None})
            elif operator == FilterOperator.IS_NOT_NULL:
                conditions.append({field: {"$ne": None}})
        
        if not conditions:
            return {}
        
        # Apply logic
        if filter_config.logic.upper() == "OR":
            return {"$or": conditions}
        return {"$and": conditions}
    
    async def handle_target_delete(
        self,
        target_object: str,
        target_id: str,
        tenant_id: str
    ):
        """Handle deletion of a target record - apply referential integrity"""
        # Find all lookup fields pointing to this object
        lookup_fields = await self.collection.find({
            "tenant_id": tenant_id,
            "field_type": FieldType.LOOKUP.value,
            "target_object": target_object,
            "is_active": True
        }).to_list(length=100)
        
        for field in lookup_fields:
            action = field.get("on_delete_action", "set_null")
            api_key = field["api_key"]
            source_object = field["object_name"]
            collection_name = f"{source_object}s"
            
            if action == "set_null":
                # Set lookup field to null
                await self.db[collection_name].update_many(
                    {api_key: target_id, "tenant_id": tenant_id},
                    {"$set": {api_key: None}}
                )
            elif action == "restrict":
                # Check if any records reference this target
                count = await self.db[collection_name].count_documents(
                    {api_key: target_id, "tenant_id": tenant_id}
                )
                if count > 0:
                    raise ValueError(
                        f"Cannot delete: {count} records in {source_object} reference this record"
                    )
            elif action == "cascade":
                # Delete all referencing records
                await self.db[collection_name].delete_many(
                    {api_key: target_id, "tenant_id": tenant_id}
                )
