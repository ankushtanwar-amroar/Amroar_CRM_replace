from motor.motor_asyncio import AsyncIOMotorDatabase
from typing import Dict, Any, Optional
from datetime import datetime, timezone

class ConfigService:
    """Service to manage object configurations"""
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.collection = db.crm_object_configurations
    
    async def get_config(self, object_type_id: str, tenant_id: str) -> Optional[Dict[str, Any]]:
        """Get configuration for an object type"""
        return await self.collection.find_one(
            {"object_type_id": object_type_id, "tenant_id": tenant_id},
            {"_id": 0}
        )
    
    async def create_or_update_config(self, config_data: Dict[str, Any]) -> Dict[str, Any]:
        """Create or update object configuration"""
        object_type_id = config_data["object_type_id"]
        tenant_id = config_data["tenant_id"]
        
        existing = await self.get_config(object_type_id, tenant_id)
        
        config_data["updated_at"] = datetime.now(timezone.utc)
        
        if existing:
            await self.collection.update_one(
                {"object_type_id": object_type_id, "tenant_id": tenant_id},
                {"$set": config_data}
            )
        else:
            config_data["created_at"] = datetime.now(timezone.utc)
            await self.collection.insert_one(config_data)
        
        return config_data
    
    async def add_field_config(self, object_type_id: str, tenant_id: str, field_config: Dict[str, Any]) -> bool:
        """Add a field configuration"""
        result = await self.collection.update_one(
            {"object_type_id": object_type_id, "tenant_id": tenant_id},
            {"$push": {"fields": field_config}}
        )
        return result.modified_count > 0
    
    async def add_validation_rule(self, object_type_id: str, tenant_id: str, rule: Dict[str, Any]) -> bool:
        """Add a validation rule"""
        result = await self.collection.update_one(
            {"object_type_id": object_type_id, "tenant_id": tenant_id},
            {"$push": {"validation_rules": rule}}
        )
        return result.modified_count > 0
    
    async def add_button(self, object_type_id: str, tenant_id: str, button: Dict[str, Any], 
                        is_custom: bool = True) -> bool:
        """Add a button configuration"""
        field_name = "custom_buttons" if is_custom else "standard_buttons"
        result = await self.collection.update_one(
            {"object_type_id": object_type_id, "tenant_id": tenant_id},
            {"$push": {field_name: button}}
        )
        return result.modified_count > 0
    
    async def set_highlighted_fields(self, object_type_id: str, tenant_id: str, 
                                     field_names: list) -> bool:
        """Set highlighted fields for record header"""
        result = await self.collection.update_one(
            {"object_type_id": object_type_id, "tenant_id": tenant_id},
            {"$set": {"highlighted_fields": field_names}}
        )
        return result.modified_count > 0
    
    async def add_record_type(self, object_type_id: str, tenant_id: str, 
                             record_type: Dict[str, Any]) -> bool:
        """Add a record type"""
        result = await self.collection.update_one(
            {"object_type_id": object_type_id, "tenant_id": tenant_id},
            {"$push": {"record_types": record_type}}
        )
        return result.modified_count > 0
