"""
Admin Audit Log Service
Tracks platform-level actions for Admin Portal
"""
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any, List
from motor.motor_asyncio import AsyncIOMotorDatabase
import uuid

logger = logging.getLogger(__name__)

# Audit action types - Control Plane Specification
AUDIT_ACTIONS = {
    # Admin authentication
    "admin_login": "Admin logged in",
    "admin_login_failed": "Admin login failed",
    "admin_logout": "Admin logged out",
    
    # Tenant lifecycle management
    "tenant_created": "Tenant created",
    "tenant_updated": "Tenant updated",
    "tenant_suspended": "Tenant suspended",
    "tenant_activated": "Tenant activated",
    "tenant_reactivated": "Tenant reactivated",
    "tenant_deleted": "Tenant deleted",
    "tenant_terminated": "Tenant terminated",
    "tenant_set_read_only": "Tenant set to read-only mode",
    "tenant_maintenance_mode": "Tenant maintenance mode toggled",
    
    # Subscription management
    "plan_assigned": "Subscription plan assigned",
    "plan_created": "Subscription plan created",
    "plan_updated": "Subscription plan updated",
    "plan_deleted": "Subscription plan deleted",
    "plan_upgraded": "Subscription plan upgraded",
    "plan_downgraded": "Subscription plan downgraded",
    "seat_limit_changed": "Seat limit changed",
    
    # Billing management
    "billing_updated": "Billing information updated",
    "billing_config_created": "Billing configuration created",
    "billing_config_updated": "Billing configuration updated",
    "stripe_customer_linked": "Stripe customer linked",
    "stripe_subscription_linked": "Stripe subscription linked",
    "trial_extended": "Trial period extended",
    "trial_started": "Trial started",
    "trial_expired": "Trial expired",
    "payment_link_created": "Payment link created",
    
    # Module entitlements
    "modules_updated": "Modules updated for tenant",
    "module_enabled": "Module enabled for tenant",
    "module_disabled": "Module disabled for tenant",
    "module_trial_started": "Module trial started",
    "module_trial_expired": "Module trial expired",
    
    # Limits and quotas
    "limit_updated": "Tenant limit updated",
    "limit_exceeded": "Tenant limit exceeded",
    "limits_initialized": "Tenant limits initialized",
    "limits_reset": "Tenant limits reset",
    
    # User management
    "user_created": "User created by admin",
    "user_updated": "User updated by admin",
    "user_suspended": "User suspended",
    "user_activated": "User activated",
    "user_deleted": "User deleted",
    "user_password_reset": "User password reset by admin",
    "user_role_changed": "User role changed",
    
    # License Catalog Management
    "license_catalog_created": "License created in catalog",
    "license_catalog_updated": "License updated in catalog",
    "license_catalog_deleted": "License deactivated in catalog",
    
    # Tenant License Management (Seat Pool)
    "tenant_license_added": "License added to tenant",
    "tenant_license_updated": "Tenant license updated",
    "tenant_license_removed": "License removed from tenant",
    
    # User License Management (Seat Assignment)
    "user_license_assigned": "License assigned to user",
    "user_license_revoked": "License revoked from user",
    
    # Platform Release Management
    "release_created": "Platform release created",
    "release_updated": "Platform release updated",
    "release_set_default_for_new_tenants": "Release set as default for new tenants",
    
    # Tenant Version Management
    "tenant_version_assigned": "Platform version assigned to tenant",
    "tenant_version_changed": "Tenant platform version changed",
    "tenant_upgrade_started": "Tenant upgrade started",
    "tenant_upgrade_completed": "Tenant upgrade completed",
    "tenant_upgrade_failed": "Tenant upgrade failed",
    
    # Provisioning jobs
    "provisioning_job_created": "Provisioning job created",
    "provisioning_job_started": "Provisioning job started",
    "provisioning_job_completed": "Provisioning job completed",
    "provisioning_job_failed": "Provisioning job failed",
    "provisioning_job_retried": "Provisioning job retried",
    "provisioning_job_cancelled": "Provisioning job cancelled",
    
    # Support actions
    "welcome_email_resent": "Welcome email resent",
    "admin_impersonation": "Admin impersonated tenant user",
    
    # System
    "admin_user_created": "Admin Portal user created",
    "settings_updated": "System settings updated"
}


class AuditLogService:
    """Service for managing admin audit logs"""
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.collection = db.admin_audit_logs
    
    async def log_action(
        self,
        action: str,
        actor_id: str,
        actor_email: str,
        tenant_id: Optional[str] = None,
        target_id: Optional[str] = None,
        target_type: Optional[str] = None,
        details: Optional[Dict[str, Any]] = None,
        ip_address: Optional[str] = None,
        # Enhanced fields for Control Plane spec
        module_name: Optional[str] = None,
        entity_name: Optional[str] = None,
        old_value: Optional[Dict[str, Any]] = None,
        new_value: Optional[Dict[str, Any]] = None,
        reason: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Log an admin action
        
        Args:
            action: Action type (from AUDIT_ACTIONS)
            actor_id: ID of the admin performing the action
            actor_email: Email of the admin
            tenant_id: Affected tenant ID (if applicable)
            target_id: ID of the affected entity
            target_type: Type of the affected entity (tenant, user, plan, etc.)
            details: Additional details about the action
            ip_address: IP address of the request
            module_name: Module affected (for module changes)
            entity_name: Name of the entity affected
            old_value: Previous value (for change tracking)
            new_value: New value (for change tracking)
            reason: Reason for the action
        
        Returns:
            Created audit log entry
        """
        log_entry = {
            "id": str(uuid.uuid4()),
            "action": action,
            "action_description": AUDIT_ACTIONS.get(action, action),
            "actor_id": actor_id,
            "actor_email": actor_email,
            "tenant_id": tenant_id,
            "target_id": target_id,
            "target_type": target_type,
            "details": details or {},
            "ip_address": ip_address,
            # Enhanced fields
            "module_name": module_name,
            "entity_name": entity_name,
            "old_value": old_value,
            "new_value": new_value,
            "reason": reason,
            "timestamp": datetime.now(timezone.utc)
        }
        
        await self.collection.insert_one(log_entry)
        log_entry.pop("_id", None)
        
        logger.info(f"Audit log: {action} by {actor_email} - {details}")
        
        return log_entry
    
    async def get_logs(
        self,
        skip: int = 0,
        limit: int = 50,
        action_filter: Optional[str] = None,
        tenant_id: Optional[str] = None,
        actor_id: Optional[str] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        search: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Get audit logs with filtering and pagination
        
        Args:
            skip: Number of records to skip
            limit: Maximum records to return
            action_filter: Filter by action type
            tenant_id: Filter by tenant
            actor_id: Filter by actor
            start_date: Filter by start date
            end_date: Filter by end date
            search: Search in action description, actor email, or details
        
        Returns:
            Paginated audit logs
        """
        query = {}
        
        if action_filter:
            query["action"] = action_filter
        
        if tenant_id:
            query["tenant_id"] = tenant_id
        
        if actor_id:
            query["actor_id"] = actor_id
        
        if start_date:
            query["timestamp"] = query.get("timestamp", {})
            query["timestamp"]["$gte"] = start_date
        
        if end_date:
            query["timestamp"] = query.get("timestamp", {})
            query["timestamp"]["$lte"] = end_date
        
        if search:
            query["$or"] = [
                {"action_description": {"$regex": search, "$options": "i"}},
                {"actor_email": {"$regex": search, "$options": "i"}},
                {"details": {"$regex": search, "$options": "i"}}
            ]
        
        total = await self.collection.count_documents(query)
        
        cursor = self.collection.find(query, {"_id": 0}).sort("timestamp", -1).skip(skip).limit(limit)
        logs = await cursor.to_list(length=limit)
        
        return {
            "logs": logs,
            "total": total,
            "skip": skip,
            "limit": limit,
            "has_more": skip + limit < total
        }
    
    async def get_log_by_id(self, log_id: str) -> Optional[Dict[str, Any]]:
        """Get a single audit log by ID"""
        return await self.collection.find_one({"id": log_id}, {"_id": 0})
    
    async def get_action_types(self) -> List[Dict[str, str]]:
        """Get all available action types"""
        return [
            {"action": k, "description": v}
            for k, v in AUDIT_ACTIONS.items()
        ]
    
    async def get_logs_by_tenant(
        self,
        tenant_id: str,
        skip: int = 0,
        limit: int = 50
    ) -> Dict[str, Any]:
        """Get all audit logs for a specific tenant"""
        return await self.get_logs(
            skip=skip,
            limit=limit,
            tenant_id=tenant_id
        )
    
    async def get_admin_activity(
        self,
        actor_id: str,
        days: int = 30,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """Get recent activity for a specific admin"""
        start_date = datetime.now(timezone.utc) - timedelta(days=days)
        
        query = {
            "actor_id": actor_id,
            "timestamp": {"$gte": start_date}
        }
        
        cursor = self.collection.find(query, {"_id": 0}).sort("timestamp", -1).limit(limit)
        return await cursor.to_list(length=limit)
    
    async def get_admin_login_history(
        self,
        skip: int = 0,
        limit: int = 50,
        include_failed: bool = True
    ) -> Dict[str, Any]:
        """Get admin login history"""
        actions = ["admin_login"]
        if include_failed:
            actions.append("admin_login_failed")
        
        query = {"action": {"$in": actions}}
        
        total = await self.collection.count_documents(query)
        cursor = self.collection.find(query, {"_id": 0}).sort("timestamp", -1).skip(skip).limit(limit)
        logs = await cursor.to_list(length=limit)
        
        return {
            "logs": logs,
            "total": total,
            "skip": skip,
            "limit": limit
        }
    
    async def get_failed_login_attempts(
        self,
        hours: int = 24,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """Get failed login attempts in the last N hours"""
        start_date = datetime.now(timezone.utc) - timedelta(hours=hours)
        
        query = {
            "action": "admin_login_failed",
            "timestamp": {"$gte": start_date}
        }
        
        cursor = self.collection.find(query, {"_id": 0}).sort("timestamp", -1).limit(limit)
        return await cursor.to_list(length=limit)
    
    async def get_recent_actions_summary(
        self,
        hours: int = 24
    ) -> Dict[str, Any]:
        """Get a summary of recent actions"""
        start_date = datetime.now(timezone.utc) - timedelta(hours=hours)
        
        pipeline = [
            {"$match": {"timestamp": {"$gte": start_date}}},
            {"$group": {
                "_id": "$action",
                "count": {"$sum": 1}
            }},
            {"$sort": {"count": -1}}
        ]
        
        results = await self.collection.aggregate(pipeline).to_list(100)
        
        action_counts = {r["_id"]: r["count"] for r in results}
        total_actions = sum(action_counts.values())
        
        return {
            "period_hours": hours,
            "total_actions": total_actions,
            "action_breakdown": action_counts,
            "most_common_action": results[0]["_id"] if results else None
        }
    
    async def cleanup_old_logs(self, days: int = 365) -> int:
        """Delete audit logs older than specified days"""
        cutoff_date = datetime.now(timezone.utc) - timedelta(days=days)
        
        result = await self.collection.delete_many({
            "timestamp": {"$lt": cutoff_date}
        })
        
        logger.info(f"Cleaned up {result.deleted_count} old audit logs (older than {days} days)")
        return result.deleted_count


# Singleton instance
_audit_log_service = None

def get_audit_log_service(db: AsyncIOMotorDatabase) -> AuditLogService:
    """Get or create the audit log service instance"""
    global _audit_log_service
    if _audit_log_service is None:
        _audit_log_service = AuditLogService(db)
    return _audit_log_service
