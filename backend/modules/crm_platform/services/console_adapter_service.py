from motor.motor_asyncio import AsyncIOMotorDatabase
from typing import Optional, Dict, Any, List
from datetime import datetime

class ConsoleAdapterService:
    """
    Universal dynamic adapter for ALL CRM objects in Sales Console.
    Provides unified interface to existing CRM collections WITHOUT modifying them.
    """
    
    # Object API name to collection mapping
    OBJECT_COLLECTION_MAP = {
        "lead": "leads",
        "account": "accounts",
        "contact": "contacts",
        "opportunity": "opportunities",
        "task": "tasks",
        "event": "events",
        "custom_object": "custom_objects"  # Will be expanded dynamically
    }
    
    # Object metadata (labels, prefixes, icons)
    OBJECT_METADATA = {
        "lead": {
            "label": "Lead",
            "label_plural": "Leads",
            "prefix": "LEA",
            "icon": "users",
            "name_fields": ["first_name", "last_name"],
            "key_fields": ["email", "company", "phone", "status"]
        },
        "account": {
            "label": "Account",
            "label_plural": "Accounts",
            "prefix": "ACC",
            "icon": "building-2",
            "name_fields": ["name"],
            "key_fields": ["industry", "website", "phone", "type"]
        },
        "contact": {
            "label": "Contact",
            "label_plural": "Contacts",
            "prefix": "CON",
            "icon": "user",
            "name_fields": ["first_name", "last_name"],
            "key_fields": ["email", "phone", "account_name", "title"]
        },
        "opportunity": {
            "label": "Opportunity",
            "label_plural": "Opportunities",
            "prefix": "OPP",
            "icon": "briefcase",
            "name_fields": ["name"],
            "key_fields": ["amount", "stage", "close_date", "account_name"]
        },
        "task": {
            "label": "Task",
            "label_plural": "Tasks",
            "prefix": "TSK",
            "icon": "check-square",
            "name_fields": ["subject"],
            "key_fields": ["status", "priority", "due_date", "assigned_to"]
        },
        "event": {
            "label": "Event",
            "label_plural": "Events",
            "prefix": "EVT",
            "icon": "calendar",
            "name_fields": ["subject"],
            "key_fields": ["start_datetime", "end_datetime", "location", "type"]
        }
    }
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
    
    def get_collection_name(self, object_api_name: str) -> Optional[str]:
        """Get MongoDB collection name for object"""
        return self.OBJECT_COLLECTION_MAP.get(object_api_name.lower())
    
    def get_object_metadata(self, object_api_name: str) -> Dict[str, Any]:
        """Get object metadata (labels, prefix, fields)"""
        return self.OBJECT_METADATA.get(object_api_name.lower(), {
            "label": object_api_name.capitalize(),
            "label_plural": object_api_name.capitalize() + "s",
            "prefix": object_api_name[:3].upper(),
            "icon": "file",
            "name_fields": ["name"],
            "key_fields": []
        })
    
    def generate_public_id(self, object_api_name: str, record_id: str) -> str:
        """Generate public ID: PREFIX-recordId"""
        metadata = self.get_object_metadata(object_api_name)
        prefix = metadata.get("prefix", "REC")
        clean_id = str(record_id).replace('-', '').upper()
        return f"{prefix}-{clean_id}"
    
    def parse_public_id(self, public_id: str) -> tuple:
        """Parse public ID to extract prefix and record ID"""
        parts = public_id.split('-', 1)
        if len(parts) != 2:
            raise ValueError(f"Invalid public ID format: {public_id}")
        return parts[0], parts[1]
    
    def resolve_object_from_prefix(self, prefix: str) -> Optional[str]:
        """Resolve object API name from prefix"""
        for obj_name, metadata in self.OBJECT_METADATA.items():
            if metadata.get("prefix") == prefix:
                return obj_name
        return None
    
    def format_record_name(self, record: Dict[str, Any], object_api_name: str) -> str:
        """Format record name based on object type"""
        metadata = self.get_object_metadata(object_api_name)
        name_fields = metadata.get("name_fields", ["name"])
        
        name_parts = []
        for field in name_fields:
            value = record.get(field)
            if value:
                name_parts.append(str(value))
        
        return " ".join(name_parts) if name_parts else record.get("id", "Untitled")
    
    def extract_key_fields(self, record: Dict[str, Any], object_api_name: str) -> Dict[str, Any]:
        """Extract key fields for list view"""
        metadata = self.get_object_metadata(object_api_name)
        key_fields = metadata.get("key_fields", [])
        
        fields = {}
        for field_name in key_fields:
            value = record.get(field_name)
            if value is not None:
                # Format field name for display
                display_name = field_name.replace('_', ' ').title()
                fields[display_name] = value
        
        return fields
    
    async def get_console_list_view(
        self,
        object_api_name: str,
        tenant_id: str,
        limit: int = 50,
        skip: int = 0,
        search: Optional[str] = None,
        filters: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Universal list view loader for ANY CRM object.
        Returns Salesforce-style list view data.
        """
        collection_name = self.get_collection_name(object_api_name)
        if not collection_name:
            return {
                "items": [],
                "total": 0,
                "objectApiName": object_api_name,
                "listViewName": "All Records",
                "error": f"Unknown object: {object_api_name}"
            }
        
        collection = self.db[collection_name]
        metadata = self.get_object_metadata(object_api_name)
        
        # Build query
        query = {"tenant_id": tenant_id}
        
        # Add search if provided
        if search:
            name_fields = metadata.get("name_fields", ["name"])
            search_conditions = []
            for field in name_fields:
                search_conditions.append({field: {"$regex": search, "$options": "i"}})
            if search_conditions:
                query["$or"] = search_conditions
        
        # Add filters if provided
        if filters:
            query.update(filters)
        
        # Fetch records
        cursor = collection.find(query, {"_id": 0}).skip(skip).limit(limit)
        records = await cursor.to_list(length=limit)
        total = await collection.count_documents(query)
        
        # Format records for console
        items = []
        for record in records:
            record_id = record.get("id", "")
            public_id = self.generate_public_id(object_api_name, record_id)
            name = self.format_record_name(record, object_api_name)
            fields = self.extract_key_fields(record, object_api_name)
            
            items.append({
                "id": public_id,
                "recordId": record_id,
                "name": name,
                "fields": fields,
                "objectApiName": object_api_name
            })
        
        return {
            "items": items,
            "total": total,
            "objectApiName": object_api_name,
            "objectLabel": metadata.get("label_plural", "Records"),
            "listViewName": "All Records",
            "columns": self._get_list_view_columns(metadata)
        }
    
    def _get_list_view_columns(self, metadata: Dict[str, Any]) -> List[Dict[str, str]]:
        """Get column definitions for list view"""
        columns = [{"field": "name", "label": "Name", "type": "name"}]
        
        for field in metadata.get("key_fields", []):
            columns.append({
                "field": field,
                "label": field.replace('_', ' ').title(),
                "type": "text"
            })
        
        return columns
    
    async def get_console_record(
        self,
        public_id: str,
        tenant_id: str
    ) -> Optional[Dict[str, Any]]:
        """
        Universal record fetcher by public ID.
        Works for ANY CRM object.
        """
        try:
            # Parse public ID
            prefix, record_id_part = self.parse_public_id(public_id)
            
            # Resolve object type
            object_api_name = self.resolve_object_from_prefix(prefix)
            if not object_api_name:
                return None
            
            # Get collection
            collection_name = self.get_collection_name(object_api_name)
            if not collection_name:
                return None
            
            collection = self.db[collection_name]
            
            # Fetch record (try by id field - most CRM objects use "id")
            record = await collection.find_one({
                "tenant_id": tenant_id
            }, {"_id": 0})
            
            # Search for matching record (public ID contains part of actual ID)
            # We need to find the record that matches
            cursor = collection.find({"tenant_id": tenant_id}, {"_id": 0})
            all_records = await cursor.to_list(length=1000)
            
            record = None
            for rec in all_records:
                rec_id = str(rec.get("id", ""))
                if record_id_part.lower() in rec_id.lower() or rec_id.lower() in record_id_part.lower():
                    record = rec
                    break
            
            if not record:
                return None
            
            metadata = self.get_object_metadata(object_api_name)
            
            # Format for console
            return {
                "id": public_id,
                "recordId": record.get("id"),
                "objectApiName": object_api_name,
                "objectLabel": metadata.get("label"),
                "name": self.format_record_name(record, object_api_name),
                "fields": record,
                "metadata": metadata
            }
            
        except Exception as e:
            print(f"Error fetching record: {str(e)}")
            return None
    
    async def get_all_objects(self, tenant_id: str) -> List[Dict[str, Any]]:
        """
        Get list of all available objects for console.
        Includes both standard objects and custom objects from tenant_objects collection.
        Custom objects take precedence over standard objects with same name.
        """
        objects_dict = {}
        
        # Add standard objects
        for obj_name, metadata in self.OBJECT_METADATA.items():
            collection_name = self.get_collection_name(obj_name)
            if collection_name:
                # Check if tenant has any records
                collection = self.db[collection_name]
                count = await collection.count_documents({"tenant_id": tenant_id})
                
                objects_dict[obj_name] = {
                    "apiName": obj_name,
                    "label": metadata.get("label"),
                    "labelPlural": metadata.get("label_plural"),
                    "prefix": metadata.get("prefix"),
                    "icon": metadata.get("icon"),
                    "recordCount": count,
                    "isCustom": False
                }
        
        # Add custom objects from tenant_objects collection (these override standard objects if same name)
        tenant_objects_collection = self.db["tenant_objects"]
        custom_objects = await tenant_objects_collection.find(
            {"tenant_id": tenant_id},
            {"_id": 0}
        ).to_list(length=100)
        
        for custom_obj in custom_objects:
            obj_name = custom_obj.get("object_name", "").lower()
            label = custom_obj.get("label", obj_name.capitalize())
            
            # Count records for this custom object in object_records collection
            records_count = await self.db.object_records.count_documents({
                "tenant_id": tenant_id,
                "object_name": obj_name
            })
            
            # If this custom object has same name as standard object, merge the counts
            if obj_name in objects_dict and not objects_dict[obj_name]["isCustom"]:
                # Use custom object definition but add counts
                objects_dict[obj_name]["recordCount"] += records_count
                objects_dict[obj_name]["isCustom"] = True  # Mark as having custom definition
                objects_dict[obj_name]["customObjectId"] = custom_obj.get("id")
                # Update label if custom one is different
                if label != objects_dict[obj_name]["label"]:
                    objects_dict[obj_name]["label"] = label
                    objects_dict[obj_name]["labelPlural"] = custom_obj.get("label_plural", label + "s")
            else:
                # Pure custom object
                objects_dict[obj_name] = {
                    "apiName": obj_name,
                    "label": label,
                    "labelPlural": custom_obj.get("label_plural", label + "s"),
                    "prefix": obj_name[:3].upper(),
                    "icon": custom_obj.get("icon", "file"),
                    "recordCount": records_count,
                    "isCustom": True,
                    "customObjectId": custom_obj.get("id")
                }
        
        # Convert dict back to list
        return list(objects_dict.values())
