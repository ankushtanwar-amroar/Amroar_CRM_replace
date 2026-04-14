"""
Platform Release Service - Admin Portal
Manages platform version releases and tenant version assignments
"""
import logging
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List
from motor.motor_asyncio import AsyncIOMotorDatabase
import uuid

logger = logging.getLogger(__name__)


class PlatformReleaseService:
    """Service for managing platform releases and versions"""
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.releases_collection = db.platform_releases
        self.tenant_versions_collection = db.tenant_versions
        self._audit_service = None
    
    async def _get_audit_service(self):
        """Lazy load audit service"""
        if self._audit_service is None:
            from .audit_log_service import get_audit_log_service
            self._audit_service = get_audit_log_service(self.db)
        return self._audit_service
    
    async def _log_audit(
        self,
        action: str,
        actor_id: str,
        actor_email: str,
        tenant_id: str = None,
        target_id: str = None,
        target_type: str = None,
        old_value: Dict = None,
        new_value: Dict = None,
        details: Dict = None
    ):
        """Log audit event"""
        try:
            audit_service = await self._get_audit_service()
            await audit_service.log_action(
                action=action,
                actor_id=actor_id,
                actor_email=actor_email,
                tenant_id=tenant_id,
                target_id=target_id,
                target_type=target_type or "platform_release",
                old_value=old_value,
                new_value=new_value,
                details=details
            )
        except Exception as e:
            logger.error(f"Failed to log audit event: {e}")
    
    # =========================================================================
    # PLATFORM RELEASE MANAGEMENT
    # =========================================================================
    
    async def create_release(
        self,
        release_data: Dict[str, Any],
        actor_id: str = None,
        actor_email: str = None
    ) -> Dict[str, Any]:
        """
        Create a new platform release
        
        Args:
            release_data: Release definition data
            actor_id: ID of admin creating the release
            actor_email: Email of admin
        
        Returns:
            Created release entry
        """
        # Check if version number already exists
        existing = await self.releases_collection.find_one(
            {"version_number": release_data["version_number"]}
        )
        if existing:
            raise ValueError(f"Version '{release_data['version_number']}' already exists")
        
        # If marking as available_for_new_tenants, unmark others
        if release_data.get("available_for_new_tenants"):
            await self.releases_collection.update_many(
                {"available_for_new_tenants": True},
                {"$set": {"available_for_new_tenants": False, "updated_at": datetime.now(timezone.utc)}}
            )
        
        now = datetime.now(timezone.utc)
        release_entry = {
            "id": str(uuid.uuid4()),
            **release_data,
            "created_at": now,
            "updated_at": now,
            "created_by": actor_id
        }
        
        await self.releases_collection.insert_one(release_entry)
        release_entry.pop("_id", None)
        
        # Audit log
        await self._log_audit(
            action="release_created",
            actor_id=actor_id,
            actor_email=actor_email,
            target_id=release_entry["id"],
            new_value=release_entry,
            details={"version_number": release_data["version_number"], "release_name": release_data["release_name"]}
        )
        
        logger.info(f"Created release: {release_data['version_number']} by {actor_email}")
        return release_entry
    
    async def get_release(self, release_id: str) -> Optional[Dict[str, Any]]:
        """Get a release by ID"""
        release = await self.releases_collection.find_one({"id": release_id}, {"_id": 0})
        if release:
            # Add tenant count
            release["tenant_count"] = await self.tenant_versions_collection.count_documents(
                {"current_version_id": release_id}
            )
        return release
    
    async def get_release_by_version(self, version_number: str) -> Optional[Dict[str, Any]]:
        """Get a release by version number"""
        return await self.releases_collection.find_one({"version_number": version_number}, {"_id": 0})
    
    async def list_releases(
        self,
        skip: int = 0,
        limit: int = 50,
        status_filter: str = None,
        include_deprecated: bool = False
    ) -> Dict[str, Any]:
        """
        List all platform releases
        
        Args:
            skip: Pagination offset
            limit: Max results
            status_filter: Filter by status
            include_deprecated: Include deprecated releases
        
        Returns:
            Paginated release list
        """
        query = {}
        
        if status_filter:
            query["status"] = status_filter
        
        if not include_deprecated:
            query["status"] = {"$ne": "deprecated"}
        
        total = await self.releases_collection.count_documents(query)
        cursor = self.releases_collection.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit)
        releases = await cursor.to_list(length=limit)
        
        # Add tenant counts
        for release in releases:
            release["tenant_count"] = await self.tenant_versions_collection.count_documents(
                {"current_version_id": release["id"]}
            )
        
        return {
            "releases": releases,
            "total": total,
            "skip": skip,
            "limit": limit,
            "has_more": skip + limit < total
        }
    
    async def update_release(
        self,
        release_id: str,
        update_data: Dict[str, Any],
        actor_id: str = None,
        actor_email: str = None
    ) -> Optional[Dict[str, Any]]:
        """
        Update a platform release
        
        Args:
            release_id: Release ID to update
            update_data: Fields to update
            actor_id: ID of admin updating
            actor_email: Email of admin
        
        Returns:
            Updated release entry
        """
        current = await self.get_release(release_id)
        if not current:
            return None
        
        # If marking as available_for_new_tenants, unmark others
        if update_data.get("available_for_new_tenants"):
            await self.releases_collection.update_many(
                {"available_for_new_tenants": True, "id": {"$ne": release_id}},
                {"$set": {"available_for_new_tenants": False, "updated_at": datetime.now(timezone.utc)}}
            )
        
        # Remove None values
        update_data = {k: v for k, v in update_data.items() if v is not None}
        update_data["updated_at"] = datetime.now(timezone.utc)
        
        await self.releases_collection.update_one(
            {"id": release_id},
            {"$set": update_data}
        )
        
        updated = await self.get_release(release_id)
        
        # Special audit for availability changes
        action = "release_updated"
        if "available_for_new_tenants" in update_data and update_data["available_for_new_tenants"]:
            action = "release_set_default_for_new_tenants"
        
        await self._log_audit(
            action=action,
            actor_id=actor_id,
            actor_email=actor_email,
            target_id=release_id,
            old_value=current,
            new_value=updated,
            details={"version_number": current["version_number"], "changes": list(update_data.keys())}
        )
        
        logger.info(f"Updated release: {current['version_number']} by {actor_email}")
        return updated
    
    async def get_default_release_for_new_tenants(self) -> Optional[Dict[str, Any]]:
        """
        Get the release that should be assigned to new tenants
        
        Returns:
            Release marked as available_for_new_tenants, or latest approved
        """
        # First, try to find release marked for new tenants
        release = await self.releases_collection.find_one(
            {"available_for_new_tenants": True, "status": "approved"},
            {"_id": 0}
        )
        
        if release:
            return release
        
        # Fallback: get latest approved release
        release = await self.releases_collection.find_one(
            {"status": "approved"},
            {"_id": 0},
            sort=[("created_at", -1)]
        )
        
        return release
    
    async def get_upgrade_eligible_releases(self, from_version: str) -> List[Dict[str, Any]]:
        """
        Get releases that a tenant can upgrade to from their current version
        
        Args:
            from_version: Current version number
        
        Returns:
            List of eligible releases for upgrade
        """
        query = {
            "available_for_upgrade": True,
            "status": "approved"
        }
        
        cursor = self.releases_collection.find(query, {"_id": 0}).sort("created_at", -1)
        releases = await cursor.to_list(length=50)
        
        # Filter based on min_upgrade_from_version
        eligible = []
        for release in releases:
            min_version = release.get("min_upgrade_from_version")
            if not min_version or self._compare_versions(from_version, min_version) >= 0:
                eligible.append(release)
        
        return eligible
    
    def _compare_versions(self, v1: str, v2: str) -> int:
        """
        Compare two version strings
        
        Returns:
            -1 if v1 < v2, 0 if equal, 1 if v1 > v2
        """
        # Remove 'v' prefix if present
        v1 = v1.lstrip('v')
        v2 = v2.lstrip('v')
        
        parts1 = [int(x) for x in v1.split('.')]
        parts2 = [int(x) for x in v2.split('.')]
        
        # Pad with zeros
        while len(parts1) < 3:
            parts1.append(0)
        while len(parts2) < 3:
            parts2.append(0)
        
        for i in range(3):
            if parts1[i] < parts2[i]:
                return -1
            elif parts1[i] > parts2[i]:
                return 1
        
        return 0
    
    # =========================================================================
    # TENANT VERSION MANAGEMENT
    # =========================================================================
    
    async def get_tenant_version(self, tenant_id: str) -> Optional[Dict[str, Any]]:
        """Get version info for a tenant"""
        return await self.tenant_versions_collection.find_one({"tenant_id": tenant_id}, {"_id": 0})
    
    async def assign_tenant_version(
        self,
        tenant_id: str,
        release_id: str,
        actor_id: str = None,
        actor_email: str = None
    ) -> Dict[str, Any]:
        """
        Assign a platform version to a tenant
        
        Args:
            tenant_id: Tenant ID
            release_id: Release ID to assign
            actor_id: ID of admin
            actor_email: Email of admin
        
        Returns:
            Tenant version entry
        """
        release = await self.get_release(release_id)
        if not release:
            raise ValueError(f"Release '{release_id}' not found")
        
        existing = await self.get_tenant_version(tenant_id)
        now = datetime.now(timezone.utc)
        
        if existing:
            # Update existing
            old_version = existing.copy()
            await self.tenant_versions_collection.update_one(
                {"tenant_id": tenant_id},
                {"$set": {
                    "current_version_id": release_id,
                    "current_version_number": release["version_number"],
                    "target_version_id": None,
                    "target_version_number": None,
                    "last_upgraded_at": now,
                    "upgraded_by": actor_id,
                    "updated_at": now
                }}
            )
            
            await self._log_audit(
                action="tenant_version_changed",
                actor_id=actor_id,
                actor_email=actor_email,
                tenant_id=tenant_id,
                target_id=release_id,
                target_type="tenant_version",
                old_value={"version": old_version.get("current_version_number")},
                new_value={"version": release["version_number"]},
                details={"from_version": old_version.get("current_version_number"), "to_version": release["version_number"]}
            )
        else:
            # Create new
            entry = {
                "id": str(uuid.uuid4()),
                "tenant_id": tenant_id,
                "current_version_id": release_id,
                "current_version_number": release["version_number"],
                "target_version_id": None,
                "target_version_number": None,
                "upgrade_eligible": True,
                "upgrade_notes": None,
                "migration_required": False,
                "last_upgraded_at": now,
                "upgraded_by": actor_id,
                "rollback_allowed": release.get("rollback_supported", True),
                "created_at": now,
                "updated_at": now
            }
            await self.tenant_versions_collection.insert_one(entry)
            entry.pop("_id", None)
            
            await self._log_audit(
                action="tenant_version_assigned",
                actor_id=actor_id,
                actor_email=actor_email,
                tenant_id=tenant_id,
                target_id=release_id,
                target_type="tenant_version",
                new_value={"version": release["version_number"]},
                details={"version": release["version_number"]}
            )
        
        logger.info(f"Assigned version {release['version_number']} to tenant {tenant_id}")
        return await self.get_tenant_version(tenant_id)
    
    async def run_upgrade_precheck(
        self,
        tenant_id: str,
        target_release_id: str
    ) -> Dict[str, Any]:
        """
        Run prechecks before upgrading a tenant
        
        Args:
            tenant_id: Tenant ID
            target_release_id: Target release ID
        
        Returns:
            Precheck results
        """
        current = await self.get_tenant_version(tenant_id)
        target = await self.get_release(target_release_id)
        
        if not target:
            return {
                "eligible": False,
                "warnings": [],
                "blockers": ["Target release not found"],
                "incompatible_features": [],
                "required_migrations": [],
                "estimated_downtime_minutes": 0
            }
        
        blockers = []
        warnings = []
        incompatible = []
        migrations = []
        
        # Check if target is available for upgrade
        if not target.get("available_for_upgrade"):
            blockers.append("Target release is not available for upgrades")
        
        # Check status
        if target.get("status") != "approved":
            blockers.append(f"Target release status is '{target.get('status')}', not 'approved'")
        
        # Check minimum version requirement
        if current:
            min_version = target.get("min_upgrade_from_version")
            if min_version:
                if self._compare_versions(current["current_version_number"], min_version) < 0:
                    blockers.append(f"Current version {current['current_version_number']} is below minimum required {min_version}")
        
        # Check breaking changes
        if target.get("breaking_changes"):
            warnings.append("Target release contains breaking changes")
        
        # Check deprecated features
        deprecated = target.get("features_deprecated", [])
        if deprecated:
            # TODO: Check if tenant uses any deprecated features
            warnings.append(f"Release deprecates {len(deprecated)} feature(s)")
            incompatible.extend(deprecated)
        
        # Check migration requirements
        if target.get("migration_script_ref"):
            migrations.append(target["migration_script_ref"])
        
        # Estimate downtime
        downtime = 0
        if migrations:
            downtime = 5  # Base migration time
        if target.get("breaking_changes"):
            downtime += 10  # Extra time for breaking changes
        
        return {
            "eligible": len(blockers) == 0,
            "warnings": warnings,
            "blockers": blockers,
            "incompatible_features": incompatible,
            "required_migrations": migrations,
            "estimated_downtime_minutes": downtime
        }
    
    async def execute_tenant_upgrade(
        self,
        tenant_id: str,
        target_release_id: str,
        force: bool = False,
        actor_id: str = None,
        actor_email: str = None
    ) -> Dict[str, Any]:
        """
        Execute tenant upgrade to a new version
        
        Args:
            tenant_id: Tenant ID
            target_release_id: Target release ID
            force: Force upgrade even with warnings
            actor_id: ID of admin
            actor_email: Email of admin
        
        Returns:
            Upgrade result
        """
        # Run prechecks
        precheck = await self.run_upgrade_precheck(tenant_id, target_release_id)
        
        if not precheck["eligible"] and not force:
            raise ValueError(f"Upgrade blocked: {', '.join(precheck['blockers'])}")
        
        if precheck["warnings"] and not force:
            raise ValueError(f"Upgrade has warnings (use force=True to override): {', '.join(precheck['warnings'])}")
        
        # Log upgrade start
        await self._log_audit(
            action="tenant_upgrade_started",
            actor_id=actor_id,
            actor_email=actor_email,
            tenant_id=tenant_id,
            target_id=target_release_id,
            target_type="tenant_version",
            details={"forced": force, "warnings": precheck["warnings"]}
        )
        
        try:
            # Execute the upgrade
            result = await self.assign_tenant_version(
                tenant_id=tenant_id,
                release_id=target_release_id,
                actor_id=actor_id,
                actor_email=actor_email
            )
            
            # Log upgrade completion
            await self._log_audit(
                action="tenant_upgrade_completed",
                actor_id=actor_id,
                actor_email=actor_email,
                tenant_id=tenant_id,
                target_id=target_release_id,
                target_type="tenant_version",
                details={"success": True}
            )
            
            return {
                "success": True,
                "version": result,
                "precheck": precheck
            }
            
        except Exception as e:
            # Log upgrade failure
            await self._log_audit(
                action="tenant_upgrade_failed",
                actor_id=actor_id,
                actor_email=actor_email,
                tenant_id=tenant_id,
                target_id=target_release_id,
                target_type="tenant_version",
                details={"error": str(e)}
            )
            raise
    
    async def seed_default_release(
        self,
        actor_id: str = "system",
        actor_email: str = "system@platform.local"
    ) -> Optional[Dict[str, Any]]:
        """
        Seed the initial platform release
        
        Returns:
            Created release or None if already exists
        """
        existing = await self.releases_collection.find_one({"version_number": "v1.0.0"})
        if existing:
            return None
        
        release_data = {
            "version_number": "v1.0.0",
            "release_name": "Initial Release",
            "status": "approved",
            "available_for_new_tenants": True,
            "available_for_upgrade": False,
            "release_notes": "Initial platform release with core CRM functionality.",
            "breaking_changes": False,
            "rollback_supported": False,
            "features_added": ["CRM Core", "Task Manager", "Form Builder", "Flow Builder"],
            "features_deprecated": []
        }
        
        return await self.create_release(release_data, actor_id, actor_email)


# Singleton instance
_platform_release_service = None

def get_platform_release_service(db: AsyncIOMotorDatabase) -> PlatformReleaseService:
    """Get or create the platform release service instance"""
    global _platform_release_service
    if _platform_release_service is None:
        _platform_release_service = PlatformReleaseService(db)
    return _platform_release_service
