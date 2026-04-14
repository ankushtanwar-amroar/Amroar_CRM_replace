from motor.motor_asyncio import AsyncIOMotorDatabase
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone
from uuid import uuid4

class LayoutService:
    """Service to manage page layouts"""
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.collection = db.crm_page_layouts
    
    async def create_layout(self, layout_data: Dict[str, Any]) -> Dict[str, Any]:
        """Create a new page layout"""
        layout = {
            "id": str(uuid4()),
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
            **layout_data
        }
        
        await self.collection.insert_one(layout)
        return layout
    
    async def get_layout(self, layout_id: str, tenant_id: str) -> Optional[Dict[str, Any]]:
        """Get a specific layout"""
        return await self.collection.find_one(
            {"id": layout_id, "tenant_id": tenant_id},
            {"_id": 0}
        )
    
    async def get_layouts_for_object(
        self,
        object_type_id: str,
        tenant_id: str
    ) -> List[Dict[str, Any]]:
        """Get all layouts for an object type"""
        cursor = self.collection.find(
            {"object_type_id": object_type_id, "tenant_id": tenant_id},
            {"_id": 0}
        )
        return await cursor.to_list(length=100)
    
    async def get_default_layout(
        self,
        object_type_id: str,
        tenant_id: str
    ) -> Optional[Dict[str, Any]]:
        """Get default layout for an object type"""
        return await self.collection.find_one(
            {
                "object_type_id": object_type_id,
                "tenant_id": tenant_id,
                "is_default": True
            },
            {"_id": 0}
        )
    
    async def update_layout(self, layout_id: str, tenant_id: str, updates: Dict[str, Any]) -> bool:
        """Update a layout"""
        updates["updated_at"] = datetime.now(timezone.utc)
        
        result = await self.collection.update_one(
            {"id": layout_id, "tenant_id": tenant_id},
            {"$set": updates}
        )
        
        return result.modified_count > 0
    
    async def delete_layout(self, layout_id: str, tenant_id: str) -> bool:
        """Delete a layout"""
        result = await self.collection.delete_one({
            "id": layout_id,
            "tenant_id": tenant_id
        })
        
        return result.deleted_count > 0
    
    async def set_default_layout(self, layout_id: str, object_type_id: str, tenant_id: str) -> bool:
        """Set a layout as default"""
        # Unset current default
        await self.collection.update_many(
            {
                "object_type_id": object_type_id,
                "tenant_id": tenant_id,
                "is_default": True
            },
            {"$set": {"is_default": False}}
        )
        
        # Set new default
        result = await self.collection.update_one(
            {"id": layout_id, "tenant_id": tenant_id},
            {"$set": {"is_default": True}}
        )
        
        return result.modified_count > 0
