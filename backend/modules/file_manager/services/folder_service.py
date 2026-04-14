"""
File Manager - Folder Service
Manages folders within libraries.
"""

from typing import Optional, List, Dict, Any, Tuple
from datetime import datetime
from motor.motor_asyncio import AsyncIOMotorDatabase
import logging

from ..models.folder_models import (
    Folder, FolderCreate, FolderUpdate, FolderType
)

logger = logging.getLogger(__name__)

FOLDERS_COLLECTION = "fm_folders"


class FolderService:
    """Service for managing folders"""
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.folders = db[FOLDERS_COLLECTION]
    
    async def create_folder(
        self,
        tenant_id: str,
        user_id: str,
        data: FolderCreate
    ) -> Folder:
        """Create a new folder"""
        # Calculate path and depth
        path = "/"
        depth = 0
        
        if data.parent_folder_id:
            parent = await self.get_folder(tenant_id, data.parent_folder_id)
            if parent:
                path = f"{parent['path']}{data.name}/"
                depth = parent.get("depth", 0) + 1
        else:
            path = f"/{data.name}/"
        
        folder = Folder(
            tenant_id=tenant_id,
            name=data.name,
            description=data.description,
            parent_folder_id=data.parent_folder_id,
            library_id=data.library_id,
            path=path,
            depth=depth,
            color=data.color,
            icon=data.icon,
            created_by=user_id
        )
        
        await self.folders.insert_one(folder.dict())
        
        # Update parent subfolder count
        if data.parent_folder_id:
            await self.folders.update_one(
                {"id": data.parent_folder_id},
                {"$inc": {"subfolder_count": 1}}
            )
        
        # Update library folder count
        await self.db["fm_libraries"].update_one(
            {"id": data.library_id},
            {"$inc": {"folder_count": 1}}
        )
        
        logger.info(f"[Folder] Created folder: {folder.id} ({folder.name})")
        
        return folder
    
    async def get_folder(
        self,
        tenant_id: str,
        folder_id: str
    ) -> Optional[Dict[str, Any]]:
        """Get folder by ID"""
        return await self.folders.find_one(
            {"tenant_id": tenant_id, "id": folder_id},
            {"_id": 0}
        )
    
    async def list_folders(
        self,
        tenant_id: str,
        library_id: Optional[str] = None,
        parent_folder_id: Optional[str] = None,
        include_subfolders: bool = False
    ) -> List[Dict[str, Any]]:
        """List folders with optional filters"""
        query = {"tenant_id": tenant_id, "is_active": True}
        
        if library_id:
            query["library_id"] = library_id
        
        if parent_folder_id is not None:
            query["parent_folder_id"] = parent_folder_id
        elif not include_subfolders:
            # Root level only
            query["parent_folder_id"] = None
        
        cursor = self.folders.find(
            query,
            {"_id": 0}
        ).sort("name", 1)
        
        return await cursor.to_list(length=500)
    
    async def get_folder_tree(
        self,
        tenant_id: str,
        library_id: str
    ) -> List[Dict[str, Any]]:
        """Get hierarchical folder tree for a library"""
        all_folders = await self.list_folders(
            tenant_id,
            library_id=library_id,
            include_subfolders=True
        )
        
        # Build tree structure
        folder_map = {f["id"]: {**f, "children": []} for f in all_folders}
        root_folders = []
        
        for folder in all_folders:
            parent_id = folder.get("parent_folder_id")
            if parent_id and parent_id in folder_map:
                folder_map[parent_id]["children"].append(folder_map[folder["id"]])
            else:
                root_folders.append(folder_map[folder["id"]])
        
        return root_folders
    
    async def update_folder(
        self,
        tenant_id: str,
        folder_id: str,
        user_id: str,
        data: FolderUpdate
    ) -> Optional[Dict[str, Any]]:
        """Update folder"""
        update_data = {
            k: v for k, v in data.dict(exclude_unset=True).items()
            if v is not None
        }
        
        if not update_data:
            return await self.get_folder(tenant_id, folder_id)
        
        update_data["updated_at"] = datetime.utcnow()
        
        # Handle parent change (update path)
        if "parent_folder_id" in update_data:
            new_parent_id = update_data["parent_folder_id"]
            folder = await self.get_folder(tenant_id, folder_id)
            
            if new_parent_id:
                parent = await self.get_folder(tenant_id, new_parent_id)
                update_data["path"] = f"{parent['path']}{folder['name']}/"
                update_data["depth"] = parent.get("depth", 0) + 1
            else:
                update_data["path"] = f"/{folder['name']}/"
                update_data["depth"] = 0
        
        result = await self.folders.find_one_and_update(
            {"tenant_id": tenant_id, "id": folder_id},
            {"$set": update_data},
            return_document=True,
            projection={"_id": 0}
        )
        
        return result
    
    async def delete_folder(
        self,
        tenant_id: str,
        folder_id: str,
        recursive: bool = False
    ) -> bool:
        """Delete folder (and optionally subfolders)"""
        folder = await self.get_folder(tenant_id, folder_id)
        if not folder:
            return False
        
        if recursive:
            # Delete all subfolders
            await self.folders.delete_many({
                "tenant_id": tenant_id,
                "path": {"$regex": f"^{folder['path']}"}
            })
        else:
            # Check for subfolders
            subfolders = await self.folders.count_documents({
                "tenant_id": tenant_id,
                "parent_folder_id": folder_id
            })
            
            if subfolders > 0:
                raise ValueError("Folder has subfolders. Use recursive=true to delete all.")
        
        # Delete the folder
        await self.folders.delete_one({"id": folder_id})
        
        # Update parent subfolder count
        if folder.get("parent_folder_id"):
            await self.folders.update_one(
                {"id": folder["parent_folder_id"]},
                {"$inc": {"subfolder_count": -1}}
            )
        
        # Update library folder count
        await self.db["fm_libraries"].update_one(
            {"id": folder["library_id"]},
            {"$inc": {"folder_count": -1}}
        )
        
        logger.info(f"[Folder] Deleted folder: {folder_id}")
        
        return True
    
    async def move_folder(
        self,
        tenant_id: str,
        folder_id: str,
        new_parent_id: Optional[str],
        new_library_id: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        """Move folder to new parent or library"""
        folder = await self.get_folder(tenant_id, folder_id)
        if not folder:
            return None
        
        old_path = folder["path"]
        old_library_id = folder["library_id"]
        
        # Calculate new path
        if new_parent_id:
            parent = await self.get_folder(tenant_id, new_parent_id)
            if not parent:
                raise ValueError("Parent folder not found")
            new_path = f"{parent['path']}{folder['name']}/"
            new_depth = parent.get("depth", 0) + 1
            target_library = new_library_id or parent["library_id"]
        else:
            new_path = f"/{folder['name']}/"
            new_depth = 0
            target_library = new_library_id or old_library_id
        
        # Update this folder
        await self.folders.update_one(
            {"id": folder_id},
            {
                "$set": {
                    "parent_folder_id": new_parent_id,
                    "library_id": target_library,
                    "path": new_path,
                    "depth": new_depth,
                    "updated_at": datetime.utcnow()
                }
            }
        )
        
        # Update all subfolders' paths
        await self.folders.update_many(
            {"tenant_id": tenant_id, "path": {"$regex": f"^{old_path}"}},
            [
                {
                    "$set": {
                        "path": {
                            "$replaceOne": {
                                "input": "$path",
                                "find": old_path,
                                "replacement": new_path
                            }
                        },
                        "library_id": target_library
                    }
                }
            ]
        )
        
        return await self.get_folder(tenant_id, folder_id)
    
    async def update_folder_stats(
        self,
        folder_id: str,
        file_count_delta: int = 0,
        size_delta: int = 0
    ):
        """Update folder statistics"""
        await self.folders.update_one(
            {"id": folder_id},
            {
                "$inc": {
                    "file_count": file_count_delta,
                    "total_size_bytes": size_delta
                }
            }
        )
