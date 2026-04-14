"""
File Manager - Sharing Service
Handles public links and sharing functionality.
"""

from typing import Optional, List, Dict, Any
from datetime import datetime
from motor.motor_asyncio import AsyncIOMotorDatabase
import logging
import secrets
import hashlib
import os

from ..models.sharing_models import (
    PublicLink, PublicLinkCreate, PublicLinkUpdate, PublicLinkStatus
)
from .audit_service import AuditService

logger = logging.getLogger(__name__)

PUBLIC_LINKS_COLLECTION = "fm_public_links"


class SharingService:
    """Service for managing file sharing and public links"""
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.links = db[PUBLIC_LINKS_COLLECTION]
        self.audit = AuditService(db)
        self.base_url = os.environ.get('BACKEND_URL', 'http://localhost:8001')
    
    def _hash_password(self, password: str) -> str:
        """Hash password for storage"""
        return hashlib.sha256(password.encode()).hexdigest()
    
    def _verify_password(self, password: str, password_hash: str) -> bool:
        """Verify password against hash"""
        return self._hash_password(password) == password_hash
    
    async def create_public_link(
        self,
        tenant_id: str,
        user_id: str,
        user_name: str,
        data: PublicLinkCreate
    ) -> PublicLink:
        """Create a public link for a file"""
        link = PublicLink(
            tenant_id=tenant_id,
            file_id=data.file_id,
            allow_download=data.allow_download,
            expires_at=data.expires_at,
            max_access_count=data.max_access_count,
            created_by=user_id
        )
        
        # Handle password
        if data.password:
            link.password_hash = self._hash_password(data.password)
            link.is_password_protected = True
        
        # Generate full URL
        link.link_url = f"{self.base_url}/api/files/public/{link.link_token}"
        
        await self.links.insert_one(link.dict())
        
        # Get file name for audit
        file = await self.db["fm_files"].find_one({"id": data.file_id})
        
        # Audit log
        await self.audit.log_public_link_created(
            tenant_id=tenant_id,
            user_id=user_id,
            user_name=user_name,
            file_id=data.file_id,
            file_name=file.get("name") if file else "Unknown",
            public_link_id=link.id
        )
        
        logger.info(f"[Sharing] Created public link: {link.id} for file {data.file_id}")
        
        return link
    
    async def get_public_link(
        self,
        tenant_id: str,
        link_id: str
    ) -> Optional[Dict[str, Any]]:
        """Get public link by ID"""
        return await self.links.find_one(
            {"tenant_id": tenant_id, "id": link_id},
            {"_id": 0}
        )
    
    async def get_link_by_token(
        self,
        token: str
    ) -> Optional[Dict[str, Any]]:
        """Get public link by token (for public access)"""
        return await self.links.find_one(
            {"link_token": token},
            {"_id": 0}
        )
    
    async def list_file_links(
        self,
        tenant_id: str,
        file_id: str
    ) -> List[Dict[str, Any]]:
        """Get all public links for a file"""
        return await self.links.find(
            {"tenant_id": tenant_id, "file_id": file_id},
            {"_id": 0}
        ).sort("created_at", -1).to_list(length=50)
    
    async def update_public_link(
        self,
        tenant_id: str,
        link_id: str,
        data: PublicLinkUpdate
    ) -> Optional[Dict[str, Any]]:
        """Update public link settings"""
        update_data = {}
        
        if data.password is not None:
            if data.password:
                update_data["password_hash"] = self._hash_password(data.password)
                update_data["is_password_protected"] = True
            else:
                update_data["password_hash"] = None
                update_data["is_password_protected"] = False
        
        if data.allow_download is not None:
            update_data["allow_download"] = data.allow_download
        
        if data.expires_at is not None:
            update_data["expires_at"] = data.expires_at
        
        if data.max_access_count is not None:
            update_data["max_access_count"] = data.max_access_count
        
        if not update_data:
            return await self.get_public_link(tenant_id, link_id)
        
        result = await self.links.find_one_and_update(
            {"tenant_id": tenant_id, "id": link_id},
            {"$set": update_data},
            return_document=True,
            projection={"_id": 0}
        )
        
        return result
    
    async def revoke_public_link(
        self,
        tenant_id: str,
        link_id: str,
        user_id: str
    ) -> bool:
        """Revoke (disable) a public link"""
        result = await self.links.update_one(
            {"tenant_id": tenant_id, "id": link_id},
            {
                "$set": {
                    "status": PublicLinkStatus.REVOKED.value,
                    "revoked_at": datetime.utcnow(),
                    "revoked_by": user_id
                }
            }
        )
        
        return result.modified_count > 0
    
    async def delete_public_link(
        self,
        tenant_id: str,
        link_id: str
    ) -> bool:
        """Permanently delete a public link"""
        result = await self.links.delete_one({
            "tenant_id": tenant_id,
            "id": link_id
        })
        
        return result.deleted_count > 0
    
    async def access_public_link(
        self,
        token: str,
        password: Optional[str] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Access a public link (for file download/view).
        Returns file info if access is granted.
        """
        link = await self.get_link_by_token(token)
        
        if not link:
            return {"success": False, "error": "Link not found"}
        
        # Check status
        if link.get("status") != PublicLinkStatus.ACTIVE.value:
            return {"success": False, "error": "Link has been revoked"}
        
        # Check expiry
        expires_at = link.get("expires_at")
        if expires_at and datetime.fromisoformat(str(expires_at).replace('Z', '+00:00')) < datetime.utcnow():
            # Mark as expired
            await self.links.update_one(
                {"id": link["id"]},
                {"$set": {"status": PublicLinkStatus.EXPIRED.value}}
            )
            return {"success": False, "error": "Link has expired"}
        
        # Check max access count
        max_count = link.get("max_access_count")
        if max_count and link.get("access_count", 0) >= max_count:
            return {"success": False, "error": "Maximum access count reached"}
        
        # Check password
        if link.get("is_password_protected"):
            if not password:
                return {"success": False, "error": "Password required", "requires_password": True}
            if not self._verify_password(password, link.get("password_hash", "")):
                return {"success": False, "error": "Invalid password"}
        
        # Get file info
        file = await self.db["fm_files"].find_one(
            {"id": link["file_id"]},
            {"_id": 0}
        )
        
        if not file:
            return {"success": False, "error": "File not found"}
        
        # Update access stats
        await self.links.update_one(
            {"id": link["id"]},
            {
                "$inc": {"access_count": 1},
                "$set": {
                    "last_accessed_at": datetime.utcnow(),
                    "last_accessed_by_ip": ip_address
                }
            }
        )
        
        # Audit log
        await self.audit.log_public_link_accessed(
            tenant_id=link["tenant_id"],
            file_id=link["file_id"],
            file_name=file.get("name"),
            public_link_id=link["id"],
            ip_address=ip_address,
            user_agent=user_agent
        )
        
        return {
            "success": True,
            "file": {
                "id": file["id"],
                "name": file["name"],
                "size_bytes": file["size_bytes"],
                "mime_type": file["mime_type"],
                "allow_download": link.get("allow_download", True)
            },
            "link_id": link["id"]
        }
    
    async def get_link_stats(
        self,
        tenant_id: str,
        link_id: str
    ) -> Dict[str, Any]:
        """Get statistics for a public link"""
        link = await self.get_public_link(tenant_id, link_id)
        
        if not link:
            return {}
        
        access_logs = await self.audit.get_public_link_access_log(
            tenant_id, link_id, limit=100
        )
        
        return {
            "link": link,
            "access_count": link.get("access_count", 0),
            "recent_accesses": access_logs[:10],
            "unique_ips": len(set(log.get("ip_address") for log in access_logs if log.get("ip_address")))
        }
