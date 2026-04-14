"""
File Manager - Library Service
Manages file libraries with access control.
"""

from typing import Optional, List, Dict, Any
from datetime import datetime
from motor.motor_asyncio import AsyncIOMotorDatabase
import logging

from ..models.folder_models import (
    Library, LibraryCreate, LibraryUpdate, 
    LibraryMember, LibraryMemberCreate, LibraryRole
)

logger = logging.getLogger(__name__)

LIBRARIES_COLLECTION = "fm_libraries"
MEMBERS_COLLECTION = "fm_library_members"


class LibraryService:
    """Service for managing libraries"""
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.libraries = db[LIBRARIES_COLLECTION]
        self.members = db[MEMBERS_COLLECTION]
    
    async def create_library(
        self,
        tenant_id: str,
        user_id: str,
        data: LibraryCreate
    ) -> Library:
        """Create a new library"""
        library = Library(
            tenant_id=tenant_id,
            name=data.name,
            description=data.description,
            icon=data.icon,
            color=data.color,
            is_public=data.is_public,
            default_role=data.default_role,
            allowed_roles=data.allowed_roles,
            allow_external_sharing=data.allow_external_sharing,
            auto_version=data.auto_version,
            require_category=data.require_category,
            require_tags=data.require_tags,
            default_sensitivity_id=data.default_sensitivity_id,
            is_default=data.is_default,
            created_by=user_id
        )
        
        await self.libraries.insert_one(library.dict())
        
        # Add creator as manager
        member = LibraryMember(
            tenant_id=tenant_id,
            library_id=library.id,
            user_id=user_id,
            role=LibraryRole.MANAGER,
            added_by=user_id
        )
        await self.members.insert_one(member.dict())
        
        # Update member count
        await self.libraries.update_one(
            {"id": library.id},
            {"$set": {"member_count": 1}}
        )
        
        logger.info(f"[Library] Created library: {library.id} ({library.name})")
        
        return library
    
    async def get_library(
        self,
        tenant_id: str,
        library_id: str
    ) -> Optional[Dict[str, Any]]:
        """Get library by ID"""
        return await self.libraries.find_one(
            {"tenant_id": tenant_id, "id": library_id},
            {"_id": 0}
        )
    
    async def list_libraries(
        self,
        tenant_id: str,
        user_id: Optional[str] = None,
        include_private: bool = True
    ) -> List[Dict[str, Any]]:
        """List libraries accessible to user"""
        query = {"tenant_id": tenant_id, "is_active": True}
        
        libraries = await self.libraries.find(
            query,
            {"_id": 0}
        ).sort("name", 1).to_list(length=100)
        
        if user_id and not include_private:
            # Filter to only public libraries or ones user is member of
            user_memberships = await self.get_user_memberships(tenant_id, user_id)
            member_library_ids = {m["library_id"] for m in user_memberships}
            
            libraries = [
                lib for lib in libraries
                if lib["is_public"] or lib["id"] in member_library_ids
            ]
        
        # Add user's role to each library
        if user_id:
            memberships = await self.get_user_memberships(tenant_id, user_id)
            membership_map = {m["library_id"]: m["role"] for m in memberships}
            
            for lib in libraries:
                lib["user_role"] = membership_map.get(
                    lib["id"],
                    lib.get("default_role", "viewer") if lib["is_public"] else None
                )
        
        return libraries
    
    async def update_library(
        self,
        tenant_id: str,
        library_id: str,
        data: LibraryUpdate
    ) -> Optional[Dict[str, Any]]:
        """Update library settings"""
        update_data = {
            k: v for k, v in data.dict(exclude_unset=True).items()
            if v is not None
        }
        
        if not update_data:
            return await self.get_library(tenant_id, library_id)
        
        update_data["updated_at"] = datetime.utcnow()
        
        result = await self.libraries.find_one_and_update(
            {"tenant_id": tenant_id, "id": library_id},
            {"$set": update_data},
            return_document=True,
            projection={"_id": 0}
        )
        
        return result
    
    async def delete_library(
        self,
        tenant_id: str,
        library_id: str
    ) -> bool:
        """Delete library (soft delete)"""
        result = await self.libraries.update_one(
            {"tenant_id": tenant_id, "id": library_id},
            {"$set": {"is_active": False, "updated_at": datetime.utcnow()}}
        )
        
        return result.modified_count > 0
    
    # Member management
    
    async def add_member(
        self,
        tenant_id: str,
        library_id: str,
        user_id: str,
        role: LibraryRole,
        added_by: str
    ) -> LibraryMember:
        """Add member to library"""
        # Check if already member
        existing = await self.members.find_one({
            "tenant_id": tenant_id,
            "library_id": library_id,
            "user_id": user_id
        })
        
        if existing:
            # Update role
            await self.members.update_one(
                {"id": existing["id"]},
                {"$set": {"role": role.value, "updated_at": datetime.utcnow()}}
            )
            return LibraryMember(**{**existing, "role": role})
        
        member = LibraryMember(
            tenant_id=tenant_id,
            library_id=library_id,
            user_id=user_id,
            role=role,
            added_by=added_by
        )
        
        await self.members.insert_one(member.dict())
        
        # Update member count
        await self.libraries.update_one(
            {"id": library_id},
            {"$inc": {"member_count": 1}}
        )
        
        logger.info(f"[Library] Added member {user_id} to library {library_id} as {role}")
        
        return member
    
    async def remove_member(
        self,
        tenant_id: str,
        library_id: str,
        user_id: str
    ) -> bool:
        """Remove member from library"""
        result = await self.members.delete_one({
            "tenant_id": tenant_id,
            "library_id": library_id,
            "user_id": user_id
        })
        
        if result.deleted_count > 0:
            await self.libraries.update_one(
                {"id": library_id},
                {"$inc": {"member_count": -1}}
            )
            return True
        
        return False
    
    async def update_member_role(
        self,
        tenant_id: str,
        library_id: str,
        user_id: str,
        role: LibraryRole
    ) -> bool:
        """Update member role"""
        result = await self.members.update_one(
            {
                "tenant_id": tenant_id,
                "library_id": library_id,
                "user_id": user_id
            },
            {"$set": {"role": role.value, "updated_at": datetime.utcnow()}}
        )
        
        return result.modified_count > 0
    
    async def get_members(
        self,
        tenant_id: str,
        library_id: str
    ) -> List[Dict[str, Any]]:
        """Get all members of a library"""
        return await self.members.find(
            {"tenant_id": tenant_id, "library_id": library_id},
            {"_id": 0}
        ).to_list(length=500)
    
    async def get_user_memberships(
        self,
        tenant_id: str,
        user_id: str
    ) -> List[Dict[str, Any]]:
        """Get all libraries a user is member of"""
        return await self.members.find(
            {"tenant_id": tenant_id, "user_id": user_id},
            {"_id": 0}
        ).to_list(length=100)
    
    async def get_user_role(
        self,
        tenant_id: str,
        library_id: str,
        user_id: str
    ) -> Optional[str]:
        """Get user's role in a library"""
        member = await self.members.find_one({
            "tenant_id": tenant_id,
            "library_id": library_id,
            "user_id": user_id
        })
        
        if member:
            return member.get("role")
        
        # Check if library is public
        library = await self.get_library(tenant_id, library_id)
        if library and library.get("is_public"):
            return library.get("default_role", "viewer")
        
        return None
    
    async def can_user_access(
        self,
        tenant_id: str,
        library_id: str,
        user_id: str,
        required_role: LibraryRole = LibraryRole.VIEWER
    ) -> bool:
        """Check if user has required access to library"""
        role = await self.get_user_role(tenant_id, library_id, user_id)
        
        if not role:
            return False
        
        role_hierarchy = {
            LibraryRole.VIEWER.value: 1,
            LibraryRole.CONTRIBUTOR.value: 2,
            LibraryRole.MANAGER.value: 3
        }
        
        return role_hierarchy.get(role, 0) >= role_hierarchy.get(required_role.value, 0)
    
    async def update_library_stats(
        self,
        library_id: str,
        file_count_delta: int = 0,
        size_delta: int = 0
    ):
        """Update library statistics"""
        await self.libraries.update_one(
            {"id": library_id},
            {
                "$inc": {
                    "file_count": file_count_delta,
                    "total_size_bytes": size_delta
                }
            }
        )
    
    async def get_default_library(
        self,
        tenant_id: str
    ) -> Optional[Dict[str, Any]]:
        """Get the default library for tenant"""
        return await self.libraries.find_one(
            {"tenant_id": tenant_id, "is_default": True, "is_active": True},
            {"_id": 0}
        )
