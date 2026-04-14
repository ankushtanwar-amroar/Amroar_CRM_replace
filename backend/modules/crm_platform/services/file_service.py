from config.settings import settings
from motor.motor_asyncio import AsyncIOMotorDatabase
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone
from uuid import uuid4
import os

class FileService:
    """Service to manage file attachments"""
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.collection = db.crm_files
        self.upload_dir = os.path.join(settings.STORAGE_BASE_DIR, "uploads", "crm_files")
        
        # Ensure upload directory exists
        os.makedirs(self.upload_dir, exist_ok=True)
    
    async def create_file_record(self, file_data: Dict[str, Any]) -> Dict[str, Any]:
        """Create a file attachment record"""
        file_record = {
            "id": str(uuid4()),
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
            "uploaded_at": datetime.now(timezone.utc),
            **file_data
        }
        
        await self.collection.insert_one(file_record)
        return file_record
    
    async def get_files(
        self,
        object_type: str,
        record_id: str,
        tenant_id: str,
        limit: int = 50,
        skip: int = 0
    ) -> List[Dict[str, Any]]:
        """Get files for a record"""
        cursor = self.collection.find(
            {
                "object_type": object_type,
                "record_id": record_id,
                "tenant_id": tenant_id
            },
            {"_id": 0}
        ).sort("uploaded_at", -1).skip(skip).limit(limit)
        
        return await cursor.to_list(length=limit)
    
    async def get_file(self, file_id: str, tenant_id: str) -> Optional[Dict[str, Any]]:
        """Get a specific file"""
        return await self.collection.find_one(
            {"id": file_id, "tenant_id": tenant_id},
            {"_id": 0}
        )
    
    async def delete_file(self, file_id: str, tenant_id: str) -> bool:
        """Delete a file"""
        file_record = await self.get_file(file_id, tenant_id)
        if not file_record:
            return False
        
        # Delete physical file
        file_path = file_record.get("file_path")
        if file_path and os.path.exists(file_path):
            os.remove(file_path)
        
        # Delete record
        result = await self.collection.delete_one({
            "id": file_id,
            "tenant_id": tenant_id
        })
        
        return result.deleted_count > 0
    
    async def count_files(self, object_type: str, record_id: str, tenant_id: str) -> int:
        """Count files for a record"""
        return await self.collection.count_documents({
            "object_type": object_type,
            "record_id": record_id,
            "tenant_id": tenant_id
        })
