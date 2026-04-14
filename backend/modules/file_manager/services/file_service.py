"""
File Manager - File Service
Core service for file operations.
"""

from typing import Optional, List, Dict, Any, Tuple
from datetime import datetime
from motor.motor_asyncio import AsyncIOMotorDatabase
import logging
import uuid

from ..models.file_models import (
    File, FileVersion, FileRecordLink, FileStatus,
    FileCreate, FileUpdate, FileResponse, StorageProvider
)
from .storage_service import get_storage_service
from .audit_service import AuditService

logger = logging.getLogger(__name__)

# Collection names
FILES_COLLECTION = "fm_files"
VERSIONS_COLLECTION = "fm_file_versions"
LINKS_COLLECTION = "fm_file_record_links"


class FileService:
    """Service for managing files"""
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.files = db[FILES_COLLECTION]
        self.versions = db[VERSIONS_COLLECTION]
        self.links = db[LINKS_COLLECTION]
        self.storage = get_storage_service()
        self.audit = AuditService(db)
    
    async def create_file(
        self,
        tenant_id: str,
        user_id: str,
        user_name: str,
        data: FileCreate,
        file_content: Optional[bytes] = None
    ) -> File:
        """Create a new file with initial version"""
        # Extract extension
        extension = None
        if "." in data.original_filename:
            extension = "." + data.original_filename.split(".")[-1].lower()
        
        # Create file record
        file = File(
            tenant_id=tenant_id,
            name=data.name,
            original_filename=data.original_filename,
            description=data.description,
            size_bytes=data.size_bytes,
            mime_type=data.mime_type,
            file_extension=extension,
            folder_id=data.folder_id,
            library_id=data.library_id,
            category_id=data.category_id,
            sensitivity_id=data.sensitivity_id,
            tags=data.tags,
            custom_metadata=data.custom_metadata,
            created_by=user_id,
            current_version_number=1
        )
        
        # Create initial version
        version = FileVersion(
            file_id=file.id,
            version_number=1,
            storage_provider=data.storage_provider,
            storage_key=data.storage_key,
            size_bytes=data.size_bytes,
            mime_type=data.mime_type,
            uploaded_by=user_id,
            is_current=True
        )
        
        file.current_version_id = version.id
        
        # Save to database
        await self.files.insert_one(file.dict())
        await self.versions.insert_one(version.dict())
        
        # Audit log
        await self.audit.log_file_upload(
            tenant_id=tenant_id,
            user_id=user_id,
            user_name=user_name,
            file_id=file.id,
            file_name=file.name,
            details={"size_bytes": data.size_bytes, "mime_type": data.mime_type}
        )
        
        logger.info(f"[File] Created file: {file.id} ({file.name})")
        
        return file
    
    async def get_file(
        self,
        tenant_id: str,
        file_id: str,
        include_versions: bool = False
    ) -> Optional[Dict[str, Any]]:
        """Get file by ID"""
        file = await self.files.find_one(
            {"tenant_id": tenant_id, "id": file_id},
            {"_id": 0}
        )
        
        if file and include_versions:
            versions = await self.versions.find(
                {"file_id": file_id},
                {"_id": 0}
            ).sort("version_number", -1).to_list(length=100)
            file["versions"] = versions
        
        return file
    
    async def list_files(
        self,
        tenant_id: str,
        folder_id: Optional[str] = None,
        library_id: Optional[str] = None,
        category_id: Optional[str] = None,
        tags: Optional[List[str]] = None,
        search: Optional[str] = None,
        status: FileStatus = FileStatus.ACTIVE,
        limit: int = 50,
        offset: int = 0
    ) -> Tuple[List[Dict[str, Any]], int]:
        """List files with filters"""
        query = {
            "tenant_id": tenant_id,
            "status": status.value
        }
        
        if folder_id:
            query["folder_id"] = folder_id
        
        if library_id:
            query["library_id"] = library_id
        
        if category_id:
            query["category_id"] = category_id
        
        if tags:
            query["tags"] = {"$all": tags}
        
        if search:
            query["$or"] = [
                {"name": {"$regex": search, "$options": "i"}},
                {"original_filename": {"$regex": search, "$options": "i"}},
                {"description": {"$regex": search, "$options": "i"}}
            ]
        
        total = await self.files.count_documents(query)
        
        cursor = self.files.find(
            query,
            {"_id": 0}
        ).sort("created_at", -1).skip(offset).limit(limit)
        
        files = await cursor.to_list(length=limit)
        
        return files, total
    
    async def list_files_with_access(
        self,
        tenant_id: str,
        user_id: str,
        folder_id: Optional[str] = None,
        library_id: Optional[str] = None,
        category_id: Optional[str] = None,
        tags: Optional[List[str]] = None,
        search: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
        status: FileStatus = FileStatus.ACTIVE,
        access_filter: Optional[Dict[str, Any]] = None
    ) -> Tuple[List[Dict[str, Any]], int]:
        """
        List files with access control filtering.
        
        Phase 3: Uses pre-built access filter from AccessControlService.
        Only returns files user has permission to view.
        """
        # Start with access filter or build basic query
        if access_filter:
            query = access_filter.copy()
        else:
            query = {"tenant_id": tenant_id}
        
        # Add status filter
        query["status"] = status.value
        
        # Add optional filters
        if folder_id:
            query["folder_id"] = folder_id
        
        if library_id:
            query["library_id"] = library_id
        
        if category_id:
            query["category_id"] = category_id
        
        if tags:
            query["tags"] = {"$all": tags}
        
        if search:
            # Combine search with existing $or from access filter
            search_conditions = [
                {"name": {"$regex": search, "$options": "i"}},
                {"original_filename": {"$regex": search, "$options": "i"}},
                {"description": {"$regex": search, "$options": "i"}}
            ]
            if "$and" not in query:
                query["$and"] = []
            query["$and"].append({"$or": search_conditions})
        
        total = await self.files.count_documents(query)
        
        cursor = self.files.find(
            query,
            {"_id": 0}
        ).sort("created_at", -1).skip(offset).limit(limit)
        
        files = await cursor.to_list(length=limit)
        
        return files, total
    
    async def update_file(
        self,
        tenant_id: str,
        file_id: str,
        user_id: str,
        data: FileUpdate
    ) -> Optional[Dict[str, Any]]:
        """Update file metadata"""
        update_data = {
            k: v for k, v in data.dict(exclude_unset=True).items()
            if v is not None
        }
        
        if not update_data:
            return await self.get_file(tenant_id, file_id)
        
        update_data["updated_by"] = user_id
        update_data["updated_at"] = datetime.utcnow()
        
        result = await self.files.find_one_and_update(
            {"tenant_id": tenant_id, "id": file_id},
            {"$set": update_data},
            return_document=True,
            projection={"_id": 0}
        )
        
        return result
    
    async def delete_file(
        self,
        tenant_id: str,
        file_id: str,
        user_id: str,
        permanent: bool = False
    ) -> bool:
        """Delete file (soft or permanent)"""
        if permanent:
            # Delete all versions from storage
            versions = await self.versions.find({"file_id": file_id}).to_list(length=100)
            for version in versions:
                await self.storage.delete_file(version.get("storage_key"))
            
            # Delete from database
            await self.versions.delete_many({"file_id": file_id})
            await self.links.delete_many({"file_id": file_id})
            await self.files.delete_one({"tenant_id": tenant_id, "id": file_id})
        else:
            # Soft delete
            await self.files.update_one(
                {"tenant_id": tenant_id, "id": file_id},
                {
                    "$set": {
                        "status": FileStatus.DELETED.value,
                        "deleted_at": datetime.utcnow(),
                        "deleted_by": user_id
                    }
                }
            )
        
        logger.info(f"[File] Deleted file: {file_id} (permanent={permanent})")
        return True
    
    async def create_version(
        self,
        tenant_id: str,
        file_id: str,
        user_id: str,
        user_name: str,
        storage_key: str,
        size_bytes: int,
        mime_type: str,
        storage_provider: StorageProvider = StorageProvider.S3
    ) -> FileVersion:
        """Create a new version of an existing file"""
        # Get current file
        file = await self.get_file(tenant_id, file_id)
        if not file:
            raise ValueError(f"File {file_id} not found")
        
        new_version_number = file.get("current_version_number", 1) + 1
        
        # Mark all existing versions as non-current
        await self.versions.update_many(
            {"file_id": file_id},
            {"$set": {"is_current": False}}
        )
        
        # Create new version
        version = FileVersion(
            file_id=file_id,
            version_number=new_version_number,
            storage_provider=storage_provider,
            storage_key=storage_key,
            size_bytes=size_bytes,
            mime_type=mime_type,
            uploaded_by=user_id,
            is_current=True
        )
        
        await self.versions.insert_one(version.dict())
        
        # Update file with new version info
        await self.files.update_one(
            {"id": file_id},
            {
                "$set": {
                    "current_version_id": version.id,
                    "current_version_number": new_version_number,
                    "size_bytes": size_bytes,
                    "mime_type": mime_type,
                    "updated_by": user_id,
                    "updated_at": datetime.utcnow()
                }
            }
        )
        
        # Audit log
        await self.audit.log_version_created(
            tenant_id=tenant_id,
            user_id=user_id,
            user_name=user_name,
            file_id=file_id,
            file_name=file.get("name"),
            version_number=new_version_number
        )
        
        logger.info(f"[File] Created version {new_version_number} for file: {file_id}")
        
        return version
    
    async def get_versions(
        self,
        file_id: str
    ) -> List[Dict[str, Any]]:
        """Get all versions of a file"""
        cursor = self.versions.find(
            {"file_id": file_id},
            {"_id": 0}
        ).sort("version_number", -1)
        
        return await cursor.to_list(length=100)
    
    async def link_to_record(
        self,
        tenant_id: str,
        file_id: str,
        record_id: str,
        object_name: str,
        user_id: str,
        user_name: str,
        is_primary: bool = False,
        notes: Optional[str] = None,
        check_multi_link: bool = True
    ) -> FileRecordLink:
        """Link a file to a CRM record
        
        Args:
            check_multi_link: If True, checks multi_record_linking feature flag.
                              If disabled and file already linked to another record, raises error.
        """
        # Check if link already exists
        existing = await self.links.find_one({
            "tenant_id": tenant_id,
            "file_id": file_id,
            "record_id": record_id
        })
        
        if existing:
            return FileRecordLink(**existing)
        
        # Check multi-record linking feature flag
        if check_multi_link:
            # Get feature flags from settings
            settings = await self.db["fm_settings"].find_one({
                "tenant_id": tenant_id,
                "key": "feature_flags"
            })
            
            multi_link_enabled = True
            if settings:
                multi_link_enabled = settings.get("value", {}).get("multi_record_linking", True)
            
            if not multi_link_enabled:
                # Check if file is already linked to another record
                existing_link = await self.links.find_one({
                    "tenant_id": tenant_id,
                    "file_id": file_id
                })
                
                if existing_link:
                    raise ValueError(
                        f"Multi-record linking is disabled. File is already linked to "
                        f"{existing_link.get('object_name')}:{existing_link.get('record_id')}"
                    )
        
        link = FileRecordLink(
            tenant_id=tenant_id,
            file_id=file_id,
            record_id=record_id,
            object_name=object_name,
            is_primary=is_primary,
            linked_by=user_id,
            notes=notes
        )
        
        await self.links.insert_one(link.dict())
        
        # Update linked_records_count on file
        link_count = await self.links.count_documents({
            "tenant_id": tenant_id,
            "file_id": file_id
        })
        
        await self.files.update_one(
            {"tenant_id": tenant_id, "id": file_id},
            {"$set": {"linked_records_count": link_count}}
        )
        
        # Get file name for audit
        file = await self.get_file(tenant_id, file_id)
        
        # Audit log
        await self.audit.log_file_linked(
            tenant_id=tenant_id,
            user_id=user_id,
            user_name=user_name,
            file_id=file_id,
            file_name=file.get("name") if file else "Unknown",
            record_id=record_id,
            object_name=object_name
        )
        
        logger.info(f"[File] Linked file {file_id} to {object_name}:{record_id}")
        
        return link
    
    async def unlink_from_record(
        self,
        tenant_id: str,
        file_id: str,
        record_id: str
    ) -> bool:
        """Unlink a file from a CRM record"""
        result = await self.links.delete_one({
            "tenant_id": tenant_id,
            "file_id": file_id,
            "record_id": record_id
        })
        
        if result.deleted_count > 0:
            # Update linked_records_count on file
            link_count = await self.links.count_documents({
                "tenant_id": tenant_id,
                "file_id": file_id
            })
            
            await self.files.update_one(
                {"tenant_id": tenant_id, "id": file_id},
                {"$set": {"linked_records_count": link_count}}
            )
        
        return result.deleted_count > 0
    
    async def get_record_files(
        self,
        tenant_id: str,
        record_id: str,
        object_name: str
    ) -> List[Dict[str, Any]]:
        """Get all files linked to a record"""
        links = await self.links.find(
            {
                "tenant_id": tenant_id,
                "record_id": record_id,
                "object_name": object_name
            },
            {"_id": 0}
        ).to_list(length=100)
        
        file_ids = [link["file_id"] for link in links]
        
        if not file_ids:
            return []
        
        files = await self.files.find(
            {
                "tenant_id": tenant_id,
                "id": {"$in": file_ids},
                "status": FileStatus.ACTIVE.value
            },
            {"_id": 0}
        ).to_list(length=100)
        
        # Add link info and count linked records for each file
        link_map = {link["file_id"]: link for link in links}
        for file in files:
            link = link_map.get(file["id"], {})
            file["link_info"] = {
                "is_primary": link.get("is_primary", False),
                "linked_at": link.get("linked_at"),
                "linked_by": link.get("linked_by"),
                "notes": link.get("notes")
            }
            
            # Get count of all records this file is linked to
            count = await self.links.count_documents({
                "tenant_id": tenant_id,
                "file_id": file["id"]
            })
            file["linked_records_count"] = count
        
        return files
    
    async def get_file_records(
        self,
        tenant_id: str,
        file_id: str
    ) -> List[Dict[str, Any]]:
        """Get all records linked to a file"""
        links = await self.links.find(
            {"tenant_id": tenant_id, "file_id": file_id},
            {"_id": 0}
        ).to_list(length=100)
        
        return links
    
    async def get_recent_files(
        self,
        tenant_id: str,
        user_id: Optional[str] = None,
        limit: int = 10
    ) -> List[Dict[str, Any]]:
        """Get recently uploaded/modified files"""
        query = {
            "tenant_id": tenant_id,
            "status": FileStatus.ACTIVE.value
        }
        
        if user_id:
            query["$or"] = [
                {"created_by": user_id},
                {"updated_by": user_id}
            ]
        
        cursor = self.files.find(
            query,
            {"_id": 0}
        ).sort("updated_at", -1).limit(limit)
        
        return await cursor.to_list(length=limit)
    
    async def get_starred_files(
        self,
        tenant_id: str,
        user_id: str,
        limit: int = 50
    ) -> List[Dict[str, Any]]:
        """Get files starred by user"""
        # Get starred file IDs from user preferences
        starred = await self.db["fm_starred_files"].find(
            {"tenant_id": tenant_id, "user_id": user_id},
            {"_id": 0}
        ).to_list(length=limit)
        
        file_ids = [s["file_id"] for s in starred]
        
        if not file_ids:
            return []
        
        files = await self.files.find(
            {
                "tenant_id": tenant_id,
                "id": {"$in": file_ids},
                "status": FileStatus.ACTIVE.value
            },
            {"_id": 0}
        ).to_list(length=limit)
        
        # Mark files as starred
        for file in files:
            file["is_starred"] = True
        
        return files
    
    async def star_file(
        self,
        tenant_id: str,
        file_id: str,
        user_id: str
    ) -> bool:
        """Star a file for user"""
        # Check if already starred
        existing = await self.db["fm_starred_files"].find_one({
            "tenant_id": tenant_id,
            "file_id": file_id,
            "user_id": user_id
        })
        
        if existing:
            return True
        
        await self.db["fm_starred_files"].insert_one({
            "tenant_id": tenant_id,
            "file_id": file_id,
            "user_id": user_id,
            "starred_at": datetime.utcnow()
        })
        
        return True
    
    async def unstar_file(
        self,
        tenant_id: str,
        file_id: str,
        user_id: str
    ) -> bool:
        """Unstar a file for user"""
        result = await self.db["fm_starred_files"].delete_one({
            "tenant_id": tenant_id,
            "file_id": file_id,
            "user_id": user_id
        })
        
        return result.deleted_count > 0
    
    async def get_shared_with_me(
        self,
        tenant_id: str,
        user_id: str,
        limit: int = 50
    ) -> List[Dict[str, Any]]:
        """Get files shared with user (not created by user)"""
        # Get files where user is in shared_with_users array or has internal share
        files = await self.files.find(
            {
                "tenant_id": tenant_id,
                "status": FileStatus.ACTIVE.value,
                "shared_with_users": user_id,
                "created_by": {"$ne": user_id}  # Exclude files created by user
            },
            {"_id": 0}
        ).sort("updated_at", -1).limit(limit).to_list(length=limit)
        
        return files
    
    async def share_file_internally(
        self,
        tenant_id: str,
        file_id: str,
        user_id: str,
        user_name: str,
        share_with_user_ids: List[str]
    ) -> bool:
        """Share file internally with specific users"""
        result = await self.files.update_one(
            {"tenant_id": tenant_id, "id": file_id},
            {
                "$addToSet": {"shared_with_users": {"$each": share_with_user_ids}},
                "$set": {"shared_internally": True, "updated_at": datetime.utcnow()}
            }
        )
        
        if result.modified_count > 0:
            # Log audit event
            await self.audit.log_file_shared(
                tenant_id=tenant_id,
                user_id=user_id,
                user_name=user_name,
                file_id=file_id,
                file_name="",
                shared_with=share_with_user_ids
            )
        
        return result.modified_count > 0
    
    async def get_stats(
        self,
        tenant_id: str
    ) -> Dict[str, Any]:
        """Get file statistics for dashboard"""
        total_files = await self.files.count_documents({
            "tenant_id": tenant_id,
            "status": FileStatus.ACTIVE.value
        })
        
        pipeline = [
            {"$match": {"tenant_id": tenant_id, "status": FileStatus.ACTIVE.value}},
            {"$group": {
                "_id": None,
                "total_size": {"$sum": "$size_bytes"},
                "by_type": {"$push": "$mime_type"}
            }}
        ]
        
        result = await self.files.aggregate(pipeline).to_list(length=1)
        
        stats = {
            "total_files": total_files,
            "total_size_bytes": result[0]["total_size"] if result else 0,
            "files_by_type": {}
        }
        
        if result:
            for mime in result[0].get("by_type", []):
                category = mime.split("/")[0] if "/" in mime else "other"
                stats["files_by_type"][category] = stats["files_by_type"].get(category, 0) + 1
        
        return stats
