"""
File Manager - Settings Enforcement Service
Centralized validation and rule enforcement for all file operations.

Phase 2.5 Implementation - All admin settings enforced at backend level.
"""

from typing import Optional, List, Dict, Any, Tuple
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorDatabase
import logging

logger = logging.getLogger(__name__)


class SettingsEnforcementError(Exception):
    """Exception raised when settings validation fails"""
    def __init__(self, error_code: str, message: str, details: Dict[str, Any] = None):
        self.error_code = error_code
        self.message = message
        self.details = details or {}
        super().__init__(message)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "error": self.error_code,
            "message": self.message,
            "details": self.details
        }


class SettingsEnforcementService:
    """
    Centralized service for enforcing all admin settings during file operations.
    
    Called by:
    - upload_file()
    - create_public_link()
    - link_to_record()
    - delete_file()
    - share_file()
    - version_upload()
    
    Enforces:
    - Category rules (file types, size, required tags/sensitivity)
    - Tag dictionary rules
    - Public link rules
    - Sensitivity restrictions
    - Legal hold
    - Retention policies
    - Basic library role checks
    """
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self._settings_cache = {}
        self._cache_ttl = 60  # seconds
        self._cache_time = None
    
    # =========================================================================
    # SETTINGS LOADING
    # =========================================================================
    
    async def _get_general_settings(self, tenant_id: str) -> Dict[str, Any]:
        """Get general settings for tenant"""
        settings = await self.db["fm_settings"].find_one({
            "tenant_id": tenant_id,
            "key": "general_settings"
        })
        return settings.get("value", {}) if settings else {}
    
    async def _get_tag_settings(self, tenant_id: str) -> Dict[str, Any]:
        """Get tag settings for tenant"""
        settings = await self.db["fm_settings"].find_one({
            "tenant_id": tenant_id,
            "key": "tag_settings"
        })
        return settings.get("value", {}) if settings else {
            "allow_freeform_tags": True,
            "max_tags_per_file": 10,
            "tag_validation_enabled": False
        }
    
    async def _get_sharing_settings(self, tenant_id: str) -> Dict[str, Any]:
        """Get sharing/public link settings for tenant"""
        settings = await self.db["fm_settings"].find_one({
            "tenant_id": tenant_id,
            "key": "sharing_settings"
        })
        return settings.get("value", {}) if settings else {
            "public_links_enabled": True,
            "require_expiry": True,
            "max_expiry_days": 90,
            "default_expiry_days": 7,
            "require_password": False,
            "min_password_length": 6,
            "allow_download_default": True,
            "restricted_files_public_link_allowed": False
        }
    
    async def _get_audit_settings(self, tenant_id: str) -> Dict[str, Any]:
        """Get audit/retention settings for tenant"""
        settings = await self.db["fm_settings"].find_one({
            "tenant_id": tenant_id,
            "key": "audit_settings"
        })
        return settings.get("value", {}) if settings else {
            "retention_enabled": False,
            "default_retention_days": 365
        }
    
    async def _get_category(self, tenant_id: str, category_id: str) -> Optional[Dict[str, Any]]:
        """Get category by ID"""
        if not category_id:
            return None
        return await self.db["fm_categories"].find_one({
            "tenant_id": tenant_id,
            "id": category_id
        }, {"_id": 0})
    
    async def _get_sensitivity(self, tenant_id: str, sensitivity_id: str) -> Optional[Dict[str, Any]]:
        """Get sensitivity level by ID"""
        if not sensitivity_id:
            return None
        return await self.db["fm_sensitivities"].find_one({
            "tenant_id": tenant_id,
            "id": sensitivity_id
        }, {"_id": 0})
    
    async def _get_tag_dictionary(self, tenant_id: str) -> List[Dict[str, Any]]:
        """Get all defined tags for tenant"""
        cursor = self.db["fm_tags"].find(
            {"tenant_id": tenant_id},
            {"_id": 0, "id": 1, "name": 1}
        )
        return await cursor.to_list(length=500)
    
    async def _get_library(self, tenant_id: str, library_id: str) -> Optional[Dict[str, Any]]:
        """Get library by ID"""
        if not library_id:
            return None
        return await self.db["fm_libraries"].find_one({
            "tenant_id": tenant_id,
            "id": library_id
        }, {"_id": 0})
    
    async def _get_library_member(self, library_id: str, user_id: str) -> Optional[Dict[str, Any]]:
        """Get user's membership in library"""
        return await self.db["fm_library_members"].find_one({
            "library_id": library_id,
            "user_id": user_id
        }, {"_id": 0})
    
    async def _get_file(self, tenant_id: str, file_id: str) -> Optional[Dict[str, Any]]:
        """Get file by ID"""
        return await self.db["fm_files"].find_one({
            "tenant_id": tenant_id,
            "id": file_id
        }, {"_id": 0})
    
    async def _get_retention_policy_for_category(self, tenant_id: str, category_id: str) -> Optional[Dict[str, Any]]:
        """Get retention policy for a category"""
        if not category_id:
            return None
        return await self.db["fm_retention_policies"].find_one({
            "tenant_id": tenant_id,
            "category_id": category_id,
            "is_active": True
        }, {"_id": 0})
    
    # =========================================================================
    # 1️⃣ CATEGORY RULE ENFORCEMENT
    # =========================================================================
    
    async def validate_upload(
        self,
        tenant_id: str,
        user_id: str,
        filename: str,
        file_size_bytes: int,
        mime_type: str,
        category_id: Optional[str] = None,
        tags: Optional[List[str]] = None,
        sensitivity_id: Optional[str] = None,
        library_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Validate file upload against category rules and tag settings.
        
        Returns dict with:
        - valid: bool
        - auto_assignments: dict with any auto-assigned values
        
        Raises SettingsEnforcementError if validation fails.
        """
        auto_assignments = {}
        tags = tags or []
        
        # Get category if specified
        category = await self._get_category(tenant_id, category_id) if category_id else None
        
        if category:
            # Validate allowed file types
            allowed_types = category.get("allowed_file_types") or category.get("allowed_extensions") or []
            if allowed_types:
                file_ext = self._get_file_extension(filename)
                # Normalize extensions
                allowed_normalized = [ext.lower().lstrip('.') for ext in allowed_types]
                file_ext_normalized = file_ext.lower().lstrip('.') if file_ext else ''
                
                if file_ext_normalized and file_ext_normalized not in allowed_normalized:
                    raise SettingsEnforcementError(
                        "INVALID_FILE_TYPE",
                        f"File type '.{file_ext_normalized}' is not allowed for category '{category.get('name')}'. "
                        f"Allowed types: {', '.join(allowed_types)}",
                        {"allowed_types": allowed_types, "file_type": file_ext_normalized}
                    )
            
            # Validate max file size
            max_size_mb = category.get("max_file_size_mb")
            if max_size_mb:
                file_size_mb = file_size_bytes / (1024 * 1024)
                if file_size_mb > max_size_mb:
                    raise SettingsEnforcementError(
                        "FILE_TOO_LARGE",
                        f"File size ({file_size_mb:.2f} MB) exceeds maximum allowed "
                        f"({max_size_mb} MB) for category '{category.get('name')}'.",
                        {"max_size_mb": max_size_mb, "file_size_mb": round(file_size_mb, 2)}
                    )
            
            # Validate required tags
            required_tags = category.get("required_tags") or []
            if required_tags:
                missing_tags = [t for t in required_tags if t not in tags]
                if missing_tags:
                    raise SettingsEnforcementError(
                        "MISSING_REQUIRED_TAGS",
                        f"Category '{category.get('name')}' requires tags: {', '.join(missing_tags)}",
                        {"required_tags": required_tags, "missing_tags": missing_tags}
                    )
            
            # Validate required sensitivity
            required_sensitivity = category.get("required_sensitivity")
            if required_sensitivity and not sensitivity_id:
                # Auto-assign if configured
                auto_assignments["sensitivity_id"] = required_sensitivity
                logger.info(f"[Enforcement] Auto-assigning sensitivity {required_sensitivity} for category {category_id}")
            
            # Auto-assign default library if configured
            default_library = category.get("default_library_id")
            if default_library and not library_id:
                auto_assignments["library_id"] = default_library
                logger.info(f"[Enforcement] Auto-assigning library {default_library} for category {category_id}")
        
        # Validate tags against dictionary
        await self._validate_tags(tenant_id, tags, category_id)
        
        # Basic library role check
        effective_library = library_id or auto_assignments.get("library_id")
        if effective_library:
            await self._check_library_write_permission(tenant_id, effective_library, user_id, "upload")
        
        return {
            "valid": True,
            "auto_assignments": auto_assignments
        }
    
    def _get_file_extension(self, filename: str) -> Optional[str]:
        """Extract file extension from filename"""
        if not filename or '.' not in filename:
            return None
        return filename.rsplit('.', 1)[-1]
    
    # =========================================================================
    # 2️⃣ TAG DICTIONARY ENFORCEMENT
    # =========================================================================
    
    async def _validate_tags(
        self,
        tenant_id: str,
        tags: List[str],
        category_id: Optional[str] = None
    ) -> None:
        """
        Validate tags against tag settings and dictionary.
        
        Raises SettingsEnforcementError if validation fails.
        """
        if not tags:
            return
        
        tag_settings = await self._get_tag_settings(tenant_id)
        
        # Check max tags limit
        max_tags = tag_settings.get("max_tags_per_file", 10)
        if len(tags) > max_tags:
            raise SettingsEnforcementError(
                "TOO_MANY_TAGS",
                f"Maximum {max_tags} tags allowed per file. Provided: {len(tags)}",
                {"max_tags": max_tags, "provided_count": len(tags)}
            )
        
        # Check freeform tags
        allow_freeform = tag_settings.get("allow_freeform_tags", True)
        if not allow_freeform:
            # Get tag dictionary
            tag_dict = await self._get_tag_dictionary(tenant_id)
            valid_tag_names = {t.get("name", "").lower() for t in tag_dict}
            valid_tag_ids = {t.get("id") for t in tag_dict}
            
            # Check all tags are in dictionary
            invalid_tags = []
            for tag in tags:
                tag_lower = tag.lower()
                if tag not in valid_tag_ids and tag_lower not in valid_tag_names:
                    invalid_tags.append(tag)
            
            if invalid_tags:
                raise SettingsEnforcementError(
                    "INVALID_TAGS",
                    f"Freeform tags are disabled. Invalid tags: {', '.join(invalid_tags)}. "
                    "Only predefined tags from the tag dictionary are allowed.",
                    {"invalid_tags": invalid_tags}
                )
    
    # =========================================================================
    # 3️⃣ PUBLIC LINK RULE ENFORCEMENT
    # =========================================================================
    
    async def validate_public_link(
        self,
        tenant_id: str,
        file_id: str,
        expires_at: Optional[datetime] = None,
        password: Optional[str] = None,
        allow_download: bool = True
    ) -> None:
        """
        Validate public link creation against sharing settings.
        
        Raises SettingsEnforcementError if validation fails.
        """
        sharing_settings = await self._get_sharing_settings(tenant_id)
        
        # Check if public links are enabled
        if not sharing_settings.get("public_links_enabled", True):
            raise SettingsEnforcementError(
                "PUBLIC_LINKS_DISABLED",
                "Public link creation is disabled by administrator.",
                {}
            )
        
        # Check expiry requirement
        require_expiry = sharing_settings.get("require_expiry", True)
        if require_expiry and not expires_at:
            raise SettingsEnforcementError(
                "EXPIRY_REQUIRED",
                "Public links must have an expiration date.",
                {"require_expiry": True}
            )
        
        # Check max expiry days
        if expires_at:
            max_expiry_days = sharing_settings.get("max_expiry_days", 90)
            now = datetime.now(timezone.utc)
            
            # Handle timezone-naive datetime
            if expires_at.tzinfo is None:
                expires_at = expires_at.replace(tzinfo=timezone.utc)
            
            days_until_expiry = (expires_at - now).days
            if days_until_expiry > max_expiry_days:
                raise SettingsEnforcementError(
                    "EXPIRY_TOO_FAR",
                    f"Expiration date cannot be more than {max_expiry_days} days in the future. "
                    f"Requested: {days_until_expiry} days.",
                    {"max_expiry_days": max_expiry_days, "requested_days": days_until_expiry}
                )
        
        # Check password requirement
        require_password = sharing_settings.get("require_password", False)
        if require_password and not password:
            raise SettingsEnforcementError(
                "PASSWORD_REQUIRED",
                "Public links must be password protected.",
                {"require_password": True}
            )
        
        # Check password length
        if password:
            min_length = sharing_settings.get("min_password_length", 6)
            if len(password) < min_length:
                raise SettingsEnforcementError(
                    "PASSWORD_TOO_SHORT",
                    f"Password must be at least {min_length} characters.",
                    {"min_password_length": min_length}
                )
        
        # Check restricted file sensitivity
        file = await self._get_file(tenant_id, file_id)
        if file:
            sensitivity_id = file.get("sensitivity_id")
            if sensitivity_id:
                sensitivity = await self._get_sensitivity(tenant_id, sensitivity_id)
                if sensitivity:
                    level = sensitivity.get("level", "").lower()
                    # Block restricted/confidential files unless explicitly allowed
                    if level in ["restricted", "confidential"]:
                        allow_restricted = sharing_settings.get("restricted_files_public_link_allowed", False)
                        if not allow_restricted:
                            raise SettingsEnforcementError(
                                "RESTRICTED_FILE_BLOCKED",
                                f"Cannot create public link for {level} files. "
                                "Contact administrator to enable this feature.",
                                {"sensitivity_level": level}
                            )
    
    # =========================================================================
    # 4️⃣ SENSITIVITY ENFORCEMENT
    # =========================================================================
    
    async def validate_sensitivity(
        self,
        tenant_id: str,
        category_id: Optional[str],
        sensitivity_id: Optional[str]
    ) -> Optional[str]:
        """
        Validate and potentially auto-assign sensitivity based on category.
        
        Returns the sensitivity_id to use (could be auto-assigned).
        Raises SettingsEnforcementError if required sensitivity is missing.
        """
        if sensitivity_id:
            return sensitivity_id
        
        if not category_id:
            return None
        
        category = await self._get_category(tenant_id, category_id)
        if not category:
            return None
        
        required_sensitivity = category.get("required_sensitivity")
        if required_sensitivity:
            logger.info(f"[Enforcement] Auto-assigning required sensitivity {required_sensitivity}")
            return required_sensitivity
        
        return None
    
    # =========================================================================
    # 5️⃣ LEGAL HOLD ENFORCEMENT
    # =========================================================================
    
    async def validate_delete(
        self,
        tenant_id: str,
        file_id: str,
        user_id: str,
        permanent: bool = False
    ) -> None:
        """
        Validate file deletion against legal hold and retention policies.
        
        Raises SettingsEnforcementError if deletion is blocked.
        """
        file = await self._get_file(tenant_id, file_id)
        if not file:
            return  # File doesn't exist, nothing to validate
        
        # Check legal hold
        if file.get("legal_hold"):
            raise SettingsEnforcementError(
                "LEGAL_HOLD_ACTIVE",
                "This file is under legal hold and cannot be deleted. "
                "Contact your administrator to remove the legal hold.",
                {"file_id": file_id, "legal_hold": True}
            )
        
        # Check retention policy
        await self._validate_retention(tenant_id, file, permanent)
        
        # Check library write permission
        library_id = file.get("library_id")
        if library_id:
            await self._check_library_write_permission(tenant_id, library_id, user_id, "delete")
    
    # =========================================================================
    # 6️⃣ RETENTION POLICY ENFORCEMENT
    # =========================================================================
    
    async def _validate_retention(
        self,
        tenant_id: str,
        file: Dict[str, Any],
        permanent: bool
    ) -> None:
        """
        Validate file deletion against retention policies.
        
        Raises SettingsEnforcementError if retention period not met.
        """
        if not permanent:
            return  # Soft delete is always allowed (moves to trash)
        
        audit_settings = await self._get_audit_settings(tenant_id)
        
        if not audit_settings.get("retention_enabled", False):
            return  # Retention not enabled
        
        # Get category-specific retention policy
        category_id = file.get("category_id")
        retention_policy = await self._get_retention_policy_for_category(tenant_id, category_id)
        
        # Use policy retention days or default
        retention_days = audit_settings.get("default_retention_days", 365)
        if retention_policy:
            retention_days = retention_policy.get("retention_days", retention_days)
            
            # Check if policy has legal hold
            if retention_policy.get("legal_hold"):
                raise SettingsEnforcementError(
                    "RETENTION_LEGAL_HOLD",
                    f"Retention policy '{retention_policy.get('name')}' has legal hold enabled. "
                    "Files cannot be permanently deleted.",
                    {"policy_name": retention_policy.get("name")}
                )
        
        # Check file age against retention
        created_at = file.get("created_at")
        if created_at:
            if isinstance(created_at, str):
                created_at = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
            elif created_at.tzinfo is None:
                created_at = created_at.replace(tzinfo=timezone.utc)
            
            now = datetime.now(timezone.utc)
            file_age_days = (now - created_at).days
            
            if file_age_days < retention_days:
                remaining_days = retention_days - file_age_days
                raise SettingsEnforcementError(
                    "RETENTION_PERIOD_ACTIVE",
                    f"File is within retention period ({retention_days} days). "
                    f"Permanent deletion will be allowed in {remaining_days} days.",
                    {
                        "retention_days": retention_days,
                        "file_age_days": file_age_days,
                        "remaining_days": remaining_days
                    }
                )
    
    # =========================================================================
    # 8️⃣ LIBRARY ROLE CHECK - PHASE 3 INTEGRATION
    # =========================================================================
    
    async def _check_library_write_permission(
        self,
        tenant_id: str,
        library_id: str,
        user_id: str,
        operation: str
    ) -> None:
        """
        Full library role check using Phase 3 permission matrix.
        
        Uses AccessControlService for role resolution and permission checking.
        
        Raises SettingsEnforcementError if permission denied.
        """
        from .access_control_service import get_access_control_service, check_library_permission
        
        acl_service = get_access_control_service(self.db)
        
        # Get user's role in library
        user_role = await acl_service.get_user_library_role(tenant_id, library_id, user_id)
        
        if not user_role:
            # Check if user is file owner (for file-specific operations)
            raise SettingsEnforcementError(
                "LIBRARY_ACCESS_DENIED",
                "You do not have access to this library.",
                {"library_id": library_id}
            )
        
        # Map operation to action
        operation_to_action = {
            "upload": "upload",
            "delete": "delete",
            "version": "replace_version",
            "share": "share",
            "link": "link_to_record",
            "manage_folders": "manage_folders",
            "public_link": "create_public_link"
        }
        
        action = operation_to_action.get(operation, operation)
        
        # Check permission using matrix
        if not check_library_permission(user_role, action):
            action_descriptions = {
                "upload": "upload files to",
                "delete": "delete files from",
                "replace_version": "upload new versions to",
                "share": "share files from",
                "link_to_record": "link files to records in",
                "manage_folders": "manage folders in",
                "create_public_link": "create public links for files in"
            }
            action_desc = action_descriptions.get(action, f"perform {action} in")
            
            raise SettingsEnforcementError(
                "INSUFFICIENT_LIBRARY_ROLE",
                f"Your role ({user_role}) does not have permission to {action_desc} this library.",
                {"user_role": user_role, "action": action, "operation": operation}
            )
    
    # =========================================================================
    # VERSION UPLOAD VALIDATION
    # =========================================================================
    
    async def validate_version_upload(
        self,
        tenant_id: str,
        file_id: str,
        user_id: str,
        new_size_bytes: int,
        new_mime_type: str
    ) -> None:
        """
        Validate new version upload against file settings.
        
        Raises SettingsEnforcementError if validation fails.
        """
        file = await self._get_file(tenant_id, file_id)
        if not file:
            raise SettingsEnforcementError(
                "FILE_NOT_FOUND",
                "File not found.",
                {"file_id": file_id}
            )
        
        # Check legal hold
        if file.get("legal_hold"):
            raise SettingsEnforcementError(
                "LEGAL_HOLD_ACTIVE",
                "Cannot upload new version. File is under legal hold.",
                {"file_id": file_id}
            )
        
        # Check library write permission
        library_id = file.get("library_id")
        if library_id:
            await self._check_library_write_permission(tenant_id, library_id, user_id, "version")
        
        # Check category rules for new version
        category_id = file.get("category_id")
        if category_id:
            category = await self._get_category(tenant_id, category_id)
            if category:
                # Check max file size
                max_size_mb = category.get("max_file_size_mb")
                if max_size_mb:
                    new_size_mb = new_size_bytes / (1024 * 1024)
                    if new_size_mb > max_size_mb:
                        raise SettingsEnforcementError(
                            "FILE_TOO_LARGE",
                            f"New version size ({new_size_mb:.2f} MB) exceeds maximum "
                            f"({max_size_mb} MB) for category '{category.get('name')}'.",
                            {"max_size_mb": max_size_mb, "file_size_mb": round(new_size_mb, 2)}
                        )
    
    # =========================================================================
    # INTERNAL SHARING VALIDATION
    # =========================================================================
    
    async def validate_internal_share(
        self,
        tenant_id: str,
        file_id: str,
        user_id: str,
        share_with_user_ids: List[str]
    ) -> None:
        """
        Validate internal file sharing.
        
        Raises SettingsEnforcementError if validation fails.
        """
        sharing_settings = await self._get_sharing_settings(tenant_id)
        
        # Check if internal sharing is enabled
        if not sharing_settings.get("internal_sharing_enabled", True):
            raise SettingsEnforcementError(
                "INTERNAL_SHARING_DISABLED",
                "Internal file sharing is disabled by administrator.",
                {}
            )
        
        file = await self._get_file(tenant_id, file_id)
        if not file:
            raise SettingsEnforcementError(
                "FILE_NOT_FOUND",
                "File not found.",
                {"file_id": file_id}
            )
        
        # Check library share permission
        library_id = file.get("library_id")
        if library_id:
            await self._check_library_write_permission(tenant_id, library_id, user_id, "share")
    
    # =========================================================================
    # LINK TO RECORD VALIDATION
    # =========================================================================
    
    async def validate_link_to_record(
        self,
        tenant_id: str,
        file_id: str,
        user_id: str,
        record_id: str,
        object_name: str
    ) -> None:
        """
        Validate linking file to CRM record.
        
        Raises SettingsEnforcementError if validation fails.
        """
        file = await self._get_file(tenant_id, file_id)
        if not file:
            raise SettingsEnforcementError(
                "FILE_NOT_FOUND",
                "File not found.",
                {"file_id": file_id}
            )
        
        # Multi-record linking check is handled in FileService
        # This is for additional validations
        
        # Check library permission for linking
        library_id = file.get("library_id")
        if library_id:
            # Linking requires at least contributor role
            await self._check_library_write_permission(tenant_id, library_id, user_id, "link")


# Singleton-like factory function
_enforcement_service_instance = None

def get_enforcement_service(db: AsyncIOMotorDatabase) -> SettingsEnforcementService:
    """Get or create enforcement service instance"""
    global _enforcement_service_instance
    if _enforcement_service_instance is None:
        _enforcement_service_instance = SettingsEnforcementService(db)
    return _enforcement_service_instance
