from config.settings import settings

import uuid
import os
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, Tuple
import logging
import hashlib
import base64

logger = logging.getLogger(__name__)

# File storage directory
FILE_STORAGE_DIR = os.path.join(settings.STORAGE_BASE_DIR, "uploads", "file_manager")
os.makedirs(FILE_STORAGE_DIR, exist_ok=True)


class StorageService:
    """
    Storage service for File Manager.
    Saves files to local disk for MVP.
    In production, this would integrate with actual S3/GDrive APIs.
    """
    
    # Metadata storage (in-memory for MVP)
    _metadata: Dict[str, Dict[str, Any]] = {}
    
    def __init__(self, provider: str = "s3"):
        self.provider = provider
        self.base_url = os.environ.get('BACKEND_URL', 'http://localhost:8001')
        self.storage_dir = FILE_STORAGE_DIR
    
    def _get_file_path(self, storage_key: str) -> str:
        """Get local file path for storage key"""
        # Sanitize key to create safe filename
        safe_key = storage_key.replace("/", "_").replace("..", "_")
        return os.path.join(self.storage_dir, safe_key)
    
    async def upload_file(
        self,
        file_content: bytes,
        filename: str,
        mime_type: str,
        tenant_id: str,
        folder_path: str = ""
    ) -> Tuple[str, str, int]:
        """
        Upload file to storage.
        Returns: (storage_key, storage_url, size_bytes)
        """
        # Generate storage key
        storage_key = f"{tenant_id}/{folder_path}/{uuid.uuid4()}/{filename}".replace("//", "/")
        
        # Calculate checksum
        checksum = hashlib.md5(file_content).hexdigest()
        
        # Save to disk
        file_path = self._get_file_path(storage_key)
        with open(file_path, 'wb') as f:
            f.write(file_content)
        
        # Store metadata
        self._metadata[storage_key] = {
            "file_path": file_path,
            "filename": filename,
            "mime_type": mime_type,
            "size": len(file_content),
            "checksum": checksum,
            "uploaded_at": datetime.utcnow().isoformat(),
            "provider": self.provider
        }
        
        # Generate URL
        storage_url = f"{self.base_url}/api/files/download/{storage_key}"
        
        logger.info(f"[Storage] Uploaded file: {storage_key} ({len(file_content)} bytes) to {file_path}")
        
        return storage_key, storage_url, len(file_content)
    
    async def get_download_url(
        self,
        storage_key: str,
        expires_in_seconds: int = 3600
    ) -> str:
        """
        Generate a pre-signed download URL.
        In real impl, this would generate S3 pre-signed URL.
        """
        # For MVP, return direct API endpoint
        expiry = datetime.utcnow() + timedelta(seconds=expires_in_seconds)
        token = base64.urlsafe_b64encode(
            f"{storage_key}:{expiry.isoformat()}".encode()
        ).decode()
        
        return f"{self.base_url}/api/files/download?token={token}"
    
    async def get_upload_url(
        self,
        storage_key: str,
        mime_type: str,
        expires_in_seconds: int = 3600
    ) -> Dict[str, Any]:
        """
        Generate a pre-signed upload URL.
        In real impl, this would generate S3 pre-signed POST URL.
        """
        expiry = datetime.utcnow() + timedelta(seconds=expires_in_seconds)
        
        return {
            "upload_url": f"{self.base_url}/api/files/upload",
            "storage_key": storage_key,
            "fields": {
                "Content-Type": mime_type,
                "x-amz-meta-storage-key": storage_key,
            },
            "expires_at": expiry.isoformat()
        }
    
    async def delete_file(self, storage_key: str) -> bool:
        """Delete file from storage"""
        file_path = self._get_file_path(storage_key)
        
        # Delete from disk
        if os.path.exists(file_path):
            try:
                os.remove(file_path)
            except Exception as e:
                logger.error(f"[Storage] Failed to delete file from disk: {e}")
        
        # Remove metadata
        if storage_key in self._metadata:
            del self._metadata[storage_key]
            logger.info(f"[Storage] Deleted file: {storage_key}")
            return True
        return False
    
    async def copy_file(
        self,
        source_key: str,
        dest_key: str
    ) -> bool:
        """Copy file within storage"""
        source_path = self._get_file_path(source_key)
        dest_path = self._get_file_path(dest_key)
        
        if os.path.exists(source_path):
            import shutil
            shutil.copy2(source_path, dest_path)
            
            if source_key in self._metadata:
                self._metadata[dest_key] = self._metadata[source_key].copy()
                self._metadata[dest_key]["file_path"] = dest_path
            
            logger.info(f"[Storage] Copied file: {source_key} -> {dest_key}")
            return True
        return False
    
    async def get_file_path(self, storage_key: str) -> Optional[str]:
        """Get local file path for a storage key"""
        file_path = self._get_file_path(storage_key)
        
        if os.path.exists(file_path):
            return file_path
        
        # Check metadata
        if storage_key in self._metadata:
            return self._metadata[storage_key].get("file_path")
        
        return None
    
    async def get_file_content(self, storage_key: str) -> Optional[bytes]:
        """Get file content (for serving downloads)"""
        file_path = self._get_file_path(storage_key)
        
        if os.path.exists(file_path):
            with open(file_path, 'rb') as f:
                return f.read()
        
        return None
    
    async def get_file_metadata(self, storage_key: str) -> Optional[Dict[str, Any]]:
        """Get file metadata"""
        if storage_key in self._metadata:
            data = self._metadata[storage_key].copy()
            return data
        return None
    
    def get_provider_info(self) -> Dict[str, Any]:
        """Get storage provider info"""
        return {
            "provider": self.provider,
            "status": "connected",
            "is_local": True,
            "storage_dir": self.storage_dir,
            "total_files": len(self._metadata),
            "total_size_bytes": sum(
                item.get("size", 0) for item in self._metadata.values()
            )
        }


# Singleton instance
_storage_service: Optional[StorageService] = None


def get_storage_service(provider: str = "s3") -> StorageService:
    """Get storage service instance"""
    global _storage_service
    if _storage_service is None:
        _storage_service = StorageService(provider)
    return _storage_service
