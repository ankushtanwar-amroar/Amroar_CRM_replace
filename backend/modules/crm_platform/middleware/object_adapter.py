from motor.motor_asyncio import AsyncIOMotorDatabase
from typing import Optional, Dict, Any, List
from ..services.object_registry_service import ObjectRegistryService

class ObjectAdapter:
    """Middleware to connect CRM Platform with existing object modules"""
    
    def __init__(self, db: AsyncIOMotorDatabase, tenant_id: str):
        self.db = db
        self.tenant_id = tenant_id
        self.registry_service = ObjectRegistryService(db)
    
    async def get_record(self, object_type: str, record_id: str) -> Optional[Dict[str, Any]]:
        """Get record from existing module collections"""
        obj_type = await self.registry_service.get_object_type(object_type, self.tenant_id)
        if not obj_type:
            return None
        
        collection_name = obj_type["collection_name"]
        collection = self.db[collection_name]
        
        # Try to find by global_id or legacy id field
        record = await collection.find_one({
            "$or": [
                {"id": record_id},
                {"global_id": record_id}
            ],
            "tenant_id": self.tenant_id
        }, {"_id": 0})
        
        return record
    
    async def get_record_by_public_id(self, public_id: str) -> Optional[Dict[str, Any]]:
        """Get record by public ID (e.g., LEA-abc123)"""
        # Resolve public ID to global ID
        mapping = await self.registry_service.resolve_public_id(public_id, self.tenant_id)
        if not mapping:
            return None
        
        # Get the record
        record = await self.get_record(mapping["object_type"], mapping["global_id"])
        if not record:
            # Try legacy ID
            if mapping.get("legacy_id"):
                record = await self.get_record(mapping["object_type"], mapping["legacy_id"])
        
        # Enhance record with global ID info
        if record:
            record["_global_id"] = mapping["global_id"]
            record["_public_id"] = mapping["public_id"]
            record["_object_type"] = mapping["object_type"]
        
        return record
    
    async def list_records(self, object_type: str, filters: Dict[str, Any] = None, 
                          limit: int = 50, skip: int = 0) -> List[Dict[str, Any]]:
        """List records from existing module collections"""
        obj_type = await self.registry_service.get_object_type(object_type, self.tenant_id)
        if not obj_type:
            return []
        
        collection_name = obj_type["collection_name"]
        collection = self.db[collection_name]
        
        query = {"tenant_id": self.tenant_id}
        if filters:
            query.update(filters)
        
        cursor = collection.find(query, {"_id": 0}).skip(skip).limit(limit)
        records = await cursor.to_list(length=limit)
        
        # Enhance records with global IDs if they exist
        for record in records:
            if record.get("id"):
                mapping = await self.registry_service.id_mappings.find_one({
                    "object_type": object_type,
                    "legacy_id": record["id"],
                    "tenant_id": self.tenant_id
                }, {"_id": 0})
                
                if mapping:
                    record["_global_id"] = mapping["global_id"]
                    record["_public_id"] = mapping["public_id"]
                    record["_object_type"] = mapping["object_type"]
        
        return records
    
    async def count_records(self, object_type: str, filters: Dict[str, Any] = None) -> int:
        """Count records"""
        obj_type = await self.registry_service.get_object_type(object_type, self.tenant_id)
        if not obj_type:
            return 0
        
        collection_name = obj_type["collection_name"]
        collection = self.db[collection_name]
        
        query = {"tenant_id": self.tenant_id}
        if filters:
            query.update(filters)
        
        return await collection.count_documents(query)
