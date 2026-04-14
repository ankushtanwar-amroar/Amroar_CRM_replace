"""
File Manager - Access Control Service
Phase 3: Centralized security and ACL enforcement.

This service is the SINGLE source of truth for all access decisions.
All file operations must go through this service for authorization.
"""

from typing import Optional, List, Dict, Any, Tuple
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorDatabase
import logging

from ..models.acl_models import (
    LibraryRole, VisibilityMode, PrincipalType, Permission,
    FileACL, FileACLCreate, AccessCheckResult,
    LIBRARY_PERMISSION_MATRIX, check_library_permission
)

logger = logging.getLogger(__name__)


class AccessDeniedError(Exception):
    """Exception raised when access is denied"""
    def __init__(self, reason: str, details: Dict[str, Any] = None):
        self.reason = reason
        self.details = details or {}
        super().__init__(reason)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "error": "ACCESS_DENIED",
            "message": self.reason,
            "details": self.details
        }


class AccessControlService:
    """
    Centralized Access Control Service for File Manager.
    
    Handles:
    - Library role verification
    - File-level ACL checks
    - Record inheritance logic
    - Visibility mode enforcement
    - List filtering
    
    All access decisions flow through this service.
    """
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.files = db["fm_files"]
        self.libraries = db["fm_libraries"]
        self.library_members = db["fm_library_members"]
        self.file_acl = db["fm_file_acl"]
        self.file_links = db["fm_file_record_links"]
        self.teams = db["teams"]
        self.team_members = db["team_members"]
        self.users = db["users"]
    
    # =========================================================================
    # LIBRARY ROLE RESOLUTION
    # =========================================================================
    
    async def get_user_library_role(
        self,
        tenant_id: str,
        library_id: str,
        user_id: str
    ) -> Optional[str]:
        """
        Get user's effective role in a library.
        
        Returns role string or None if no access.
        
        Role resolution order:
        1. Explicit membership
        2. Library owner (implicit admin)
        3. Public library default role
        4. None (no access)
        """
        if not library_id:
            return None
        
        # Get library info
        library = await self.libraries.find_one({
            "tenant_id": tenant_id,
            "id": library_id
        }, {"_id": 0})
        
        if not library:
            return None
        
        # Check if user is library owner
        if library.get("created_by") == user_id:
            return LibraryRole.ADMIN.value
        
        # Check explicit membership
        member = await self.library_members.find_one({
            "library_id": library_id,
            "user_id": user_id
        }, {"_id": 0})
        
        if member:
            return member.get("role", LibraryRole.VIEWER.value)
        
        # Check public library default
        if library.get("is_public", False):
            return library.get("default_role", LibraryRole.VIEWER.value)
        
        # No access to private library
        return None
    
    async def check_library_action(
        self,
        tenant_id: str,
        library_id: str,
        user_id: str,
        action: str
    ) -> AccessCheckResult:
        """
        Check if user can perform action in library.
        
        Actions: view_file, upload, replace_version, delete, share,
                 manage_folders, manage_library, manage_members,
                 create_public_link, link_to_record
        """
        role = await self.get_user_library_role(tenant_id, library_id, user_id)
        
        if not role:
            return AccessCheckResult(
                allowed=False,
                reason="No access to library",
                details={"library_id": library_id}
            )
        
        allowed = check_library_permission(role, action)
        
        if not allowed:
            return AccessCheckResult(
                allowed=False,
                reason=f"Role '{role}' cannot perform '{action}'",
                effective_role=role,
                access_source="library_role",
                details={"action": action, "role": role}
            )
        
        return AccessCheckResult(
            allowed=True,
            reason="Library role grants permission",
            effective_role=role,
            access_source="library_role"
        )
    
    # =========================================================================
    # FILE-LEVEL ACL
    # =========================================================================
    
    async def get_file_acl(
        self,
        tenant_id: str,
        file_id: str
    ) -> List[Dict[str, Any]]:
        """Get all ACL entries for a file"""
        cursor = self.file_acl.find({
            "tenant_id": tenant_id,
            "file_id": file_id
        }, {"_id": 0})
        return await cursor.to_list(length=100)
    
    async def add_file_acl(
        self,
        tenant_id: str,
        file_id: str,
        principal_type: str,
        principal_id: str,
        permission: str,
        granted_by: str,
        granted_by_name: str = None,
        principal_name: str = None,
        expires_at: datetime = None,
        notes: str = None
    ) -> FileACL:
        """Add ACL entry for a file"""
        # Remove existing ACL for same principal
        await self.file_acl.delete_many({
            "tenant_id": tenant_id,
            "file_id": file_id,
            "principal_type": principal_type,
            "principal_id": principal_id
        })
        
        acl = FileACL(
            tenant_id=tenant_id,
            file_id=file_id,
            principal_type=PrincipalType(principal_type),
            principal_id=principal_id,
            principal_name=principal_name,
            permission=Permission(permission),
            granted_by=granted_by,
            granted_by_name=granted_by_name,
            expires_at=expires_at,
            notes=notes
        )
        
        await self.file_acl.insert_one(acl.dict())
        
        # Update file's visibility mode to restricted if first ACL
        file = await self.files.find_one({"tenant_id": tenant_id, "id": file_id})
        if file and file.get("visibility_mode") != VisibilityMode.RESTRICTED.value:
            await self.files.update_one(
                {"tenant_id": tenant_id, "id": file_id},
                {"$set": {"visibility_mode": VisibilityMode.RESTRICTED.value}}
            )
        
        logger.info(f"[ACL] Added {principal_type}:{principal_id} -> file {file_id} with {permission}")
        return acl
    
    async def remove_file_acl(
        self,
        tenant_id: str,
        file_id: str,
        acl_id: str
    ) -> bool:
        """Remove ACL entry"""
        result = await self.file_acl.delete_one({
            "tenant_id": tenant_id,
            "file_id": file_id,
            "id": acl_id
        })
        return result.deleted_count > 0
    
    async def check_file_acl(
        self,
        tenant_id: str,
        file_id: str,
        user_id: str,
        required_permission: str = "view"
    ) -> Tuple[bool, Optional[str]]:
        """
        Check if user has access via file ACL.
        
        Returns (has_access, effective_permission)
        
        Checks:
        1. Direct user ACL
        2. Team membership ACL
        3. Role-based ACL
        """
        now = datetime.now(timezone.utc)
        
        # Permission hierarchy: full > edit > view
        permission_levels = {
            Permission.VIEW.value: 1,
            Permission.EDIT.value: 2,
            Permission.FULL.value: 3
        }
        required_level = permission_levels.get(required_permission, 1)
        
        # Get all ACL entries for file
        acl_entries = await self.get_file_acl(tenant_id, file_id)
        
        effective_permission = None
        
        for acl in acl_entries:
            # Check expiration
            if acl.get("expires_at"):
                expires = acl["expires_at"]
                if isinstance(expires, str):
                    expires = datetime.fromisoformat(expires.replace('Z', '+00:00'))
                if expires < now:
                    continue  # Expired
            
            principal_type = acl.get("principal_type")
            principal_id = acl.get("principal_id")
            acl_permission = acl.get("permission", Permission.VIEW.value)
            acl_level = permission_levels.get(acl_permission, 1)
            
            # Direct user match
            if principal_type == PrincipalType.USER.value and principal_id == user_id:
                if acl_level >= required_level:
                    return True, acl_permission
                effective_permission = acl_permission
            
            # Team membership check
            elif principal_type == PrincipalType.TEAM.value:
                is_member = await self._is_team_member(tenant_id, principal_id, user_id)
                if is_member:
                    if acl_level >= required_level:
                        return True, acl_permission
                    if not effective_permission or acl_level > permission_levels.get(effective_permission, 0):
                        effective_permission = acl_permission
            
            # Role-based check
            elif principal_type == PrincipalType.ROLE.value:
                has_role = await self._has_role(tenant_id, user_id, principal_id)
                if has_role:
                    if acl_level >= required_level:
                        return True, acl_permission
                    if not effective_permission or acl_level > permission_levels.get(effective_permission, 0):
                        effective_permission = acl_permission
        
        return False, effective_permission
    
    async def _is_team_member(self, tenant_id: str, team_id: str, user_id: str) -> bool:
        """Check if user is member of team"""
        member = await self.team_members.find_one({
            "tenant_id": tenant_id,
            "team_id": team_id,
            "user_id": user_id
        })
        return member is not None
    
    async def _has_role(self, tenant_id: str, user_id: str, role_id: str) -> bool:
        """Check if user has a specific role"""
        user = await self.users.find_one({
            "tenant_id": tenant_id,
            "$or": [{"id": user_id}, {"user_id": user_id}]
        })
        if user:
            return user.get("role_id") == role_id or user.get("role") == role_id
        return False
    
    # =========================================================================
    # RECORD ACCESS CHECK
    # =========================================================================
    
    async def check_record_access(
        self,
        tenant_id: str,
        user_id: str,
        record_id: str,
        object_name: str
    ) -> bool:
        """
        Check if user has access to a CRM record.
        
        For MVP, we assume record access is granted if:
        - User owns the record
        - Record is in user's team
        - User has org-wide access
        
        Full implementation would integrate with CRM's sharing model.
        """
        # Get the record
        collection_name = object_name.lower()
        if collection_name in ["lead", "leads"]:
            collection_name = "crm_leads"
        elif collection_name in ["contact", "contacts"]:
            collection_name = "crm_contacts"
        elif collection_name in ["account", "accounts"]:
            collection_name = "crm_accounts"
        elif collection_name in ["opportunity", "opportunities"]:
            collection_name = "crm_opportunities"
        else:
            collection_name = f"crm_{collection_name}"
        
        record = await self.db[collection_name].find_one({
            "tenant_id": tenant_id,
            "$or": [{"id": record_id}, {"_id": record_id}]
        })
        
        if not record:
            return False
        
        # Check ownership
        if record.get("owner_id") == user_id or record.get("created_by") == user_id:
            return True
        
        # Check assigned user
        if record.get("assigned_to") == user_id:
            return True
        
        # For MVP, grant access to all users in same tenant
        # Full implementation would check sharing rules
        return True
    
    # =========================================================================
    # COMPREHENSIVE FILE ACCESS CHECK
    # =========================================================================
    
    async def can_access_file(
        self,
        tenant_id: str,
        user_id: str,
        file_id: str,
        action: str = "view_file"
    ) -> AccessCheckResult:
        """
        Comprehensive file access check.
        
        This is the main entry point for all file access decisions.
        
        Checks in order:
        1. File exists
        2. User is file owner (full access)
        3. Library role permission
        4. File visibility mode:
           - INHERIT: Check linked record access + library read
           - RESTRICTED: Check file ACL + library read
        """
        # Get file
        file = await self.files.find_one({
            "tenant_id": tenant_id,
            "id": file_id
        }, {"_id": 0})
        
        if not file:
            return AccessCheckResult(
                allowed=False,
                reason="File not found",
                details={"file_id": file_id}
            )
        
        # Check if user is file owner
        if file.get("created_by") == user_id:
            return AccessCheckResult(
                allowed=True,
                reason="User is file owner",
                access_source="owner",
                effective_role="owner"
            )
        
        library_id = file.get("library_id")
        visibility_mode = file.get("visibility_mode", VisibilityMode.INHERIT.value)
        
        # Get user's library role
        library_role = await self.get_user_library_role(tenant_id, library_id, user_id)
        
        # Check library-level permission for the action
        if library_role:
            action_allowed = check_library_permission(library_role, action)
            if not action_allowed and action != "view_file":
                return AccessCheckResult(
                    allowed=False,
                    reason=f"Library role '{library_role}' cannot perform '{action}'",
                    effective_role=library_role,
                    access_source="library_role",
                    details={"action": action}
                )
        
        # For view access, check visibility mode
        if action == "view_file":
            if visibility_mode == VisibilityMode.RESTRICTED.value:
                # RESTRICTED: Must have explicit ACL
                has_acl, acl_permission = await self.check_file_acl(
                    tenant_id, file_id, user_id, "view"
                )
                
                if has_acl:
                    return AccessCheckResult(
                        allowed=True,
                        reason="User has file ACL access",
                        access_source="file_acl",
                        effective_role=library_role,
                        details={"acl_permission": acl_permission}
                    )
                
                # No ACL access to restricted file
                return AccessCheckResult(
                    allowed=False,
                    reason="File is restricted and user has no explicit access",
                    effective_role=library_role,
                    details={"visibility_mode": "restricted"}
                )
            
            else:
                # INHERIT mode: Check record access OR library role
                if library_role:
                    # Library member can view inherited files
                    return AccessCheckResult(
                        allowed=True,
                        reason="Library member can view inherited files",
                        access_source="library_role",
                        effective_role=library_role
                    )
                
                # Check if user has access to any linked record
                links = await self.file_links.find({
                    "tenant_id": tenant_id,
                    "file_id": file_id
                }, {"_id": 0}).to_list(length=100)
                
                for link in links:
                    has_record_access = await self.check_record_access(
                        tenant_id, user_id,
                        link.get("record_id"),
                        link.get("object_name")
                    )
                    if has_record_access:
                        return AccessCheckResult(
                            allowed=True,
                            reason="User has access to linked record",
                            access_source="record_access",
                            details={"record_id": link.get("record_id")}
                        )
                
                # Check file ACL as fallback
                has_acl, _ = await self.check_file_acl(tenant_id, file_id, user_id, "view")
                if has_acl:
                    return AccessCheckResult(
                        allowed=True,
                        reason="User has file ACL access",
                        access_source="file_acl"
                    )
                
                return AccessCheckResult(
                    allowed=False,
                    reason="No access to file or linked records",
                    details={"visibility_mode": "inherit"}
                )
        
        # For non-view actions, library role is required
        if not library_role:
            return AccessCheckResult(
                allowed=False,
                reason="No library access for this action",
                details={"action": action}
            )
        
        # Library role grants the action
        return AccessCheckResult(
            allowed=True,
            reason=f"Library role '{library_role}' grants '{action}'",
            effective_role=library_role,
            access_source="library_role"
        )
    
    # =========================================================================
    # LIST FILTERING
    # =========================================================================
    
    async def get_accessible_file_ids(
        self,
        tenant_id: str,
        user_id: str,
        file_ids: List[str]
    ) -> List[str]:
        """
        Filter a list of file IDs to only those user can access.
        Used for list operations.
        """
        accessible = []
        for file_id in file_ids:
            result = await self.can_access_file(tenant_id, user_id, file_id, "view_file")
            if result.allowed:
                accessible.append(file_id)
        return accessible
    
    async def build_access_filter(
        self,
        tenant_id: str,
        user_id: str
    ) -> Dict[str, Any]:
        """
        Build MongoDB query filter for accessible files.
        
        Returns filter that includes:
        - Files user owns
        - Files in libraries user has access to (with INHERIT visibility)
        - Files with user in ACL (for RESTRICTED visibility)
        - Files linked to records user can access
        """
        # Get user's library IDs
        accessible_libraries = []
        
        # Libraries where user is member
        member_cursor = self.library_members.find(
            {"tenant_id": tenant_id, "user_id": user_id},
            {"library_id": 1}
        )
        async for doc in member_cursor:
            accessible_libraries.append(doc["library_id"])
        
        # Public libraries
        public_cursor = self.libraries.find(
            {"tenant_id": tenant_id, "is_public": True},
            {"id": 1}
        )
        async for doc in public_cursor:
            if doc["id"] not in accessible_libraries:
                accessible_libraries.append(doc["id"])
        
        # Libraries user owns
        owned_cursor = self.libraries.find(
            {"tenant_id": tenant_id, "created_by": user_id},
            {"id": 1}
        )
        async for doc in owned_cursor:
            if doc["id"] not in accessible_libraries:
                accessible_libraries.append(doc["id"])
        
        # Get file IDs from user's ACL entries
        acl_file_ids = []
        
        # Direct user ACL
        acl_cursor = self.file_acl.find(
            {
                "tenant_id": tenant_id,
                "principal_type": PrincipalType.USER.value,
                "principal_id": user_id
            },
            {"file_id": 1}
        )
        async for doc in acl_cursor:
            acl_file_ids.append(doc["file_id"])
        
        # Team-based ACL
        user_teams = []
        team_member_cursor = self.team_members.find(
            {"tenant_id": tenant_id, "user_id": user_id},
            {"team_id": 1}
        )
        async for doc in team_member_cursor:
            user_teams.append(doc["team_id"])
        
        if user_teams:
            team_acl_cursor = self.file_acl.find(
                {
                    "tenant_id": tenant_id,
                    "principal_type": PrincipalType.TEAM.value,
                    "principal_id": {"$in": user_teams}
                },
                {"file_id": 1}
            )
            async for doc in team_acl_cursor:
                if doc["file_id"] not in acl_file_ids:
                    acl_file_ids.append(doc["file_id"])
        
        # Build the filter
        filter_conditions = [
            # User owns the file
            {"created_by": user_id},
            
            # File in accessible library with INHERIT visibility
            {
                "library_id": {"$in": accessible_libraries},
                "$or": [
                    {"visibility_mode": {"$exists": False}},
                    {"visibility_mode": VisibilityMode.INHERIT.value},
                    {"visibility_mode": None}
                ]
            },
        ]
        
        # Add ACL-based access for RESTRICTED files
        if acl_file_ids:
            filter_conditions.append({
                "id": {"$in": acl_file_ids},
                "visibility_mode": VisibilityMode.RESTRICTED.value
            })
        
        return {
            "tenant_id": tenant_id,
            "$or": filter_conditions
        }
    
    # =========================================================================
    # SHARE HELPERS
    # =========================================================================
    
    async def share_with_users(
        self,
        tenant_id: str,
        file_id: str,
        user_ids: List[str],
        permission: str,
        granted_by: str,
        granted_by_name: str = None
    ) -> List[FileACL]:
        """Share file with multiple users"""
        acls = []
        for user_id in user_ids:
            # Get user name
            user = await self.users.find_one(
                {"tenant_id": tenant_id, "$or": [{"id": user_id}, {"user_id": user_id}]},
                {"first_name": 1, "last_name": 1, "name": 1}
            )
            user_name = None
            if user:
                user_name = f"{user.get('first_name', '')} {user.get('last_name', '')}".strip()
                if not user_name:
                    user_name = user.get("name")
            
            acl = await self.add_file_acl(
                tenant_id=tenant_id,
                file_id=file_id,
                principal_type=PrincipalType.USER.value,
                principal_id=user_id,
                permission=permission,
                granted_by=granted_by,
                granted_by_name=granted_by_name,
                principal_name=user_name
            )
            acls.append(acl)
        
        return acls
    
    async def share_with_team(
        self,
        tenant_id: str,
        file_id: str,
        team_id: str,
        permission: str,
        granted_by: str,
        granted_by_name: str = None
    ) -> FileACL:
        """Share file with team"""
        # Get team name
        team = await self.teams.find_one(
            {"tenant_id": tenant_id, "id": team_id},
            {"name": 1}
        )
        team_name = team.get("name") if team else None
        
        return await self.add_file_acl(
            tenant_id=tenant_id,
            file_id=file_id,
            principal_type=PrincipalType.TEAM.value,
            principal_id=team_id,
            permission=permission,
            granted_by=granted_by,
            granted_by_name=granted_by_name,
            principal_name=team_name
        )
    
    async def share_with_role(
        self,
        tenant_id: str,
        file_id: str,
        role_id: str,
        permission: str,
        granted_by: str,
        granted_by_name: str = None
    ) -> FileACL:
        """Share file with role"""
        return await self.add_file_acl(
            tenant_id=tenant_id,
            file_id=file_id,
            principal_type=PrincipalType.ROLE.value,
            principal_id=role_id,
            permission=permission,
            granted_by=granted_by,
            granted_by_name=granted_by_name,
            principal_name=role_id  # Use role_id as name
        )
    
    async def set_file_visibility(
        self,
        tenant_id: str,
        file_id: str,
        visibility_mode: str
    ) -> bool:
        """Set file visibility mode"""
        result = await self.files.update_one(
            {"tenant_id": tenant_id, "id": file_id},
            {"$set": {"visibility_mode": visibility_mode}}
        )
        return result.modified_count > 0


# Singleton factory
_access_control_service = None

def get_access_control_service(db: AsyncIOMotorDatabase) -> AccessControlService:
    """Get or create access control service instance"""
    global _access_control_service
    if _access_control_service is None:
        _access_control_service = AccessControlService(db)
    return _access_control_service
