"""
Tenant Limits Service - Control Plane
Manages platform limits and quotas for tenants via tenant_limits collection.
Provides centralized limit tracking and enforcement for CRM runtime.
"""
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any, List
from motor.motor_asyncio import AsyncIOMotorDatabase
import uuid

logger = logging.getLogger(__name__)

# Standard limit definitions
STANDARD_LIMITS = {
    "MAX_USERS": {
        "name": "Maximum Users",
        "description": "Maximum number of users allowed",
        "default_value": 10,
        "category": "users",
        "enforcement_type": "HARD_STOP",
        "reset_cycle": "NEVER"
    },
    "MAX_STORAGE_GB": {
        "name": "Maximum Storage (GB)",
        "description": "Maximum storage in gigabytes",
        "default_value": 5,
        "category": "storage",
        "enforcement_type": "HARD_STOP",
        "reset_cycle": "NEVER"
    },
    "MAX_CUSTOM_OBJECTS": {
        "name": "Maximum Custom Objects",
        "description": "Maximum number of custom objects",
        "default_value": 50,
        "category": "schema",
        "enforcement_type": "HARD_STOP",
        "reset_cycle": "NEVER"
    },
    "MAX_CUSTOM_FIELDS": {
        "name": "Maximum Custom Fields",
        "description": "Maximum custom fields per object",
        "default_value": 100,
        "category": "schema",
        "enforcement_type": "HARD_STOP",
        "reset_cycle": "NEVER"
    },
    "MAX_ACTIVE_FLOWS": {
        "name": "Maximum Active Flows",
        "description": "Maximum number of active flows",
        "default_value": 20,
        "category": "automation",
        "enforcement_type": "HARD_STOP",
        "reset_cycle": "NEVER"
    },
    "MAX_API_CALLS_PER_MONTH": {
        "name": "Maximum API Calls Per Month",
        "description": "Maximum API calls per month",
        "default_value": 10000,
        "category": "api",
        "enforcement_type": "SOFT_WARNING",
        "reset_cycle": "MONTHLY"
    },
    "MAX_AI_CREDITS_PER_MONTH": {
        "name": "Maximum AI Credits Per Month",
        "description": "Maximum AI credits per month",
        "default_value": 1000,
        "category": "ai",
        "enforcement_type": "HARD_STOP",
        "reset_cycle": "MONTHLY"
    },
    "MAX_FILE_UPLOAD_GB": {
        "name": "Maximum File Upload (GB)",
        "description": "Maximum file upload size in GB",
        "default_value": 1,
        "category": "storage",
        "enforcement_type": "HARD_STOP",
        "reset_cycle": "NEVER"
    },
    "MAX_FORM_SUBMISSIONS_PER_MONTH": {
        "name": "Maximum Form Submissions Per Month",
        "description": "Maximum form submissions per month",
        "default_value": 1000,
        "category": "forms",
        "enforcement_type": "SOFT_WARNING",
        "reset_cycle": "MONTHLY"
    },
    "MAX_DOCFLOW_RUNS": {
        "name": "Maximum DocFlow Runs",
        "description": "Maximum document flow executions per month",
        "default_value": 100,
        "category": "documents",
        "enforcement_type": "HARD_STOP",
        "reset_cycle": "MONTHLY"
    }
}

# Plan default limits
PLAN_DEFAULT_LIMITS = {
    "free": {
        "MAX_USERS": 5,
        "MAX_STORAGE_GB": 1,
        "MAX_CUSTOM_OBJECTS": 10,
        "MAX_CUSTOM_FIELDS": 50,
        "MAX_ACTIVE_FLOWS": 5,
        "MAX_API_CALLS_PER_MONTH": 5000,
        "MAX_AI_CREDITS_PER_MONTH": 100,
        "MAX_FILE_UPLOAD_GB": 1,
        "MAX_FORM_SUBMISSIONS_PER_MONTH": 500,
        "MAX_DOCFLOW_RUNS": 10
    },
    "starter": {
        "MAX_USERS": 10,
        "MAX_STORAGE_GB": 5,
        "MAX_CUSTOM_OBJECTS": 25,
        "MAX_CUSTOM_FIELDS": 100,
        "MAX_ACTIVE_FLOWS": 15,
        "MAX_API_CALLS_PER_MONTH": 25000,
        "MAX_AI_CREDITS_PER_MONTH": 500,
        "MAX_FILE_UPLOAD_GB": 5,
        "MAX_FORM_SUBMISSIONS_PER_MONTH": 2500,
        "MAX_DOCFLOW_RUNS": 50
    },
    "professional": {
        "MAX_USERS": 50,
        "MAX_STORAGE_GB": 25,
        "MAX_CUSTOM_OBJECTS": 100,
        "MAX_CUSTOM_FIELDS": 200,
        "MAX_ACTIVE_FLOWS": 50,
        "MAX_API_CALLS_PER_MONTH": 100000,
        "MAX_AI_CREDITS_PER_MONTH": 2500,
        "MAX_FILE_UPLOAD_GB": 10,
        "MAX_FORM_SUBMISSIONS_PER_MONTH": 10000,
        "MAX_DOCFLOW_RUNS": 250
    },
    "enterprise": {
        "MAX_USERS": 1000,
        "MAX_STORAGE_GB": 100,
        "MAX_CUSTOM_OBJECTS": 500,
        "MAX_CUSTOM_FIELDS": 500,
        "MAX_ACTIVE_FLOWS": 200,
        "MAX_API_CALLS_PER_MONTH": 1000000,
        "MAX_AI_CREDITS_PER_MONTH": 25000,
        "MAX_FILE_UPLOAD_GB": 50,
        "MAX_FORM_SUBMISSIONS_PER_MONTH": 100000,
        "MAX_DOCFLOW_RUNS": 1000
    }
}


class TenantLimitsService:
    """
    Service for managing tenant limits and quotas.
    
    Provides:
    - Centralized limit tracking in tenant_limits collection
    - Consumption tracking and enforcement
    - Plan-based limit initialization
    - Periodic reset for time-based limits
    """
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.collection = db.tenant_limits
    
    async def get_tenant_limits(self, tenant_id: str) -> List[Dict[str, Any]]:
        """Get all limits for a tenant"""
        limits = await self.collection.find(
            {"tenant_id": tenant_id},
            {"_id": 0}
        ).to_list(100)
        
        # Enrich with utilization info
        for limit in limits:
            limit_value = limit.get("limit_value", 0)
            consumed = limit.get("consumed_value", 0)
            if limit_value > 0:
                limit["utilization_percent"] = round((consumed / limit_value) * 100, 2)
                limit["is_exceeded"] = consumed >= limit_value
            else:
                limit["utilization_percent"] = 0
                limit["is_exceeded"] = False
        
        return limits
    
    async def get_limit(self, tenant_id: str, limit_key: str) -> Optional[Dict[str, Any]]:
        """Get a specific limit for a tenant"""
        limit = await self.collection.find_one(
            {"tenant_id": tenant_id, "limit_key": limit_key},
            {"_id": 0}
        )
        
        if limit:
            limit_value = limit.get("limit_value", 0)
            consumed = limit.get("consumed_value", 0)
            if limit_value > 0:
                limit["utilization_percent"] = round((consumed / limit_value) * 100, 2)
                limit["is_exceeded"] = consumed >= limit_value
            else:
                limit["utilization_percent"] = 0
                limit["is_exceeded"] = False
        
        return limit
    
    async def check_limit(self, tenant_id: str, limit_key: str, increment: int = 1) -> Dict[str, Any]:
        """
        Check if an action would exceed a limit.
        Returns check result without modifying the limit.
        
        Returns:
            {
                "allowed": bool,
                "limit_value": int,
                "consumed_value": int,
                "remaining": int,
                "enforcement_type": str,
                "message": str
            }
        """
        limit = await self.get_limit(tenant_id, limit_key)
        
        if not limit:
            # No limit defined = unlimited
            return {
                "allowed": True,
                "limit_value": -1,
                "consumed_value": 0,
                "remaining": -1,
                "enforcement_type": "NONE",
                "message": "No limit defined"
            }
        
        limit_value = limit.get("limit_value", 0)
        consumed = limit.get("consumed_value", 0)
        enforcement = limit.get("enforcement_type", "HARD_STOP")
        remaining = max(0, limit_value - consumed)
        
        would_exceed = (consumed + increment) > limit_value
        
        if would_exceed and enforcement == "HARD_STOP":
            return {
                "allowed": False,
                "limit_value": limit_value,
                "consumed_value": consumed,
                "remaining": remaining,
                "enforcement_type": enforcement,
                "message": f"Limit exceeded: {limit_key}. Used {consumed}/{limit_value}"
            }
        
        if would_exceed and enforcement == "SOFT_WARNING":
            return {
                "allowed": True,
                "limit_value": limit_value,
                "consumed_value": consumed,
                "remaining": remaining,
                "enforcement_type": enforcement,
                "message": f"Warning: Approaching limit for {limit_key}. Used {consumed}/{limit_value}"
            }
        
        return {
            "allowed": True,
            "limit_value": limit_value,
            "consumed_value": consumed,
            "remaining": remaining,
            "enforcement_type": enforcement,
            "message": "OK"
        }
    
    async def increment_consumption(
        self,
        tenant_id: str,
        limit_key: str,
        increment: int = 1,
        enforce: bool = True
    ) -> Dict[str, Any]:
        """
        Increment the consumed value for a limit.
        Optionally enforce the limit (reject if exceeded for HARD_STOP).
        
        Returns:
            {
                "success": bool,
                "new_consumed": int,
                "limit_value": int,
                "message": str
            }
        """
        if enforce:
            check = await self.check_limit(tenant_id, limit_key, increment)
            if not check["allowed"]:
                return {
                    "success": False,
                    "new_consumed": check["consumed_value"],
                    "limit_value": check["limit_value"],
                    "message": check["message"]
                }
        
        result = await self.collection.update_one(
            {"tenant_id": tenant_id, "limit_key": limit_key},
            {
                "$inc": {"consumed_value": increment},
                "$set": {"updated_at": datetime.now(timezone.utc)}
            }
        )
        
        if result.matched_count == 0:
            return {
                "success": True,
                "new_consumed": increment,
                "limit_value": -1,
                "message": "No limit tracked"
            }
        
        updated = await self.get_limit(tenant_id, limit_key)
        return {
            "success": True,
            "new_consumed": updated.get("consumed_value", 0),
            "limit_value": updated.get("limit_value", -1),
            "message": "OK"
        }
    
    async def set_limit(
        self,
        tenant_id: str,
        limit_key: str,
        limit_value: int,
        enforcement_type: str = None,
        reset_cycle: str = None
    ) -> Dict[str, Any]:
        """Set or update a limit for a tenant"""
        now = datetime.now(timezone.utc)
        limit_def = STANDARD_LIMITS.get(limit_key, {})
        
        existing = await self.collection.find_one({
            "tenant_id": tenant_id,
            "limit_key": limit_key
        })
        
        if existing:
            update_data = {
                "limit_value": limit_value,
                "updated_at": now
            }
            if enforcement_type:
                update_data["enforcement_type"] = enforcement_type
            if reset_cycle:
                update_data["reset_cycle"] = reset_cycle
            
            await self.collection.update_one(
                {"id": existing["id"]},
                {"$set": update_data}
            )
            limit_id = existing["id"]
        else:
            limit_id = str(uuid.uuid4())
            limit_doc = {
                "id": limit_id,
                "tenant_id": tenant_id,
                "limit_key": limit_key,
                "limit_name": limit_def.get("name", limit_key),
                "limit_value": limit_value,
                "consumed_value": 0,
                "enforcement_type": enforcement_type or limit_def.get("enforcement_type", "HARD_STOP"),
                "reset_cycle": reset_cycle or limit_def.get("reset_cycle", "NEVER"),
                "category": limit_def.get("category", "general"),
                "last_reset_at": now,
                "created_at": now,
                "updated_at": now
            }
            await self.collection.insert_one(limit_doc)
        
        return await self.get_limit(tenant_id, limit_key)
    
    async def initialize_limits_from_plan(
        self,
        tenant_id: str,
        plan_code: str
    ) -> List[Dict[str, Any]]:
        """Initialize all limits for a tenant based on their plan"""
        plan_limits = PLAN_DEFAULT_LIMITS.get(plan_code, PLAN_DEFAULT_LIMITS["free"])
        
        for limit_key, limit_value in plan_limits.items():
            await self.set_limit(tenant_id, limit_key, limit_value)
        
        return await self.get_tenant_limits(tenant_id)
    
    async def update_limits_from_plan(
        self,
        tenant_id: str,
        plan_code: str,
        preserve_consumed: bool = True
    ) -> List[Dict[str, Any]]:
        """Update limits when a tenant changes plans"""
        plan_limits = PLAN_DEFAULT_LIMITS.get(plan_code, PLAN_DEFAULT_LIMITS["free"])
        now = datetime.now(timezone.utc)
        
        for limit_key, limit_value in plan_limits.items():
            existing = await self.collection.find_one({
                "tenant_id": tenant_id,
                "limit_key": limit_key
            })
            
            if existing:
                update_data = {
                    "limit_value": limit_value,
                    "updated_at": now
                }
                if not preserve_consumed:
                    update_data["consumed_value"] = 0
                    update_data["last_reset_at"] = now
                
                await self.collection.update_one(
                    {"id": existing["id"]},
                    {"$set": update_data}
                )
            else:
                await self.set_limit(tenant_id, limit_key, limit_value)
        
        return await self.get_tenant_limits(tenant_id)
    
    async def reset_periodic_limits(self, tenant_id: str = None) -> Dict[str, Any]:
        """
        Reset limits that have reached their reset cycle.
        If tenant_id is None, resets for all tenants.
        """
        now = datetime.now(timezone.utc)
        reset_count = 0
        
        query = {}
        if tenant_id:
            query["tenant_id"] = tenant_id
        
        # Find limits that need reset
        limits = await self.collection.find(query, {"_id": 0}).to_list(10000)
        
        for limit in limits:
            reset_cycle = limit.get("reset_cycle", "NEVER")
            if reset_cycle == "NEVER":
                continue
            
            last_reset = limit.get("last_reset_at")
            if not last_reset:
                last_reset = limit.get("created_at", now)
            
            should_reset = False
            
            if reset_cycle == "DAILY":
                should_reset = (now - last_reset) >= timedelta(days=1)
            elif reset_cycle == "WEEKLY":
                should_reset = (now - last_reset) >= timedelta(weeks=1)
            elif reset_cycle == "MONTHLY":
                should_reset = (now - last_reset) >= timedelta(days=30)
            elif reset_cycle == "YEARLY":
                should_reset = (now - last_reset) >= timedelta(days=365)
            
            if should_reset:
                await self.collection.update_one(
                    {"id": limit["id"]},
                    {"$set": {
                        "consumed_value": 0,
                        "last_reset_at": now,
                        "updated_at": now
                    }}
                )
                reset_count += 1
                logger.info(f"Reset limit {limit['limit_key']} for tenant {limit['tenant_id']}")
        
        return {
            "reset_count": reset_count,
            "timestamp": now
        }
    
    async def get_limits_summary(self, tenant_id: str) -> Dict[str, Any]:
        """Get a summary of limit usage for dashboard display"""
        limits = await self.get_tenant_limits(tenant_id)
        
        summary = {
            "total_limits": len(limits),
            "exceeded_count": 0,
            "warning_count": 0,
            "by_category": {},
            "critical_limits": []
        }
        
        for limit in limits:
            utilization = limit.get("utilization_percent", 0)
            category = limit.get("category", "general")
            
            if limit.get("is_exceeded"):
                summary["exceeded_count"] += 1
                summary["critical_limits"].append({
                    "limit_key": limit["limit_key"],
                    "utilization_percent": utilization,
                    "enforcement_type": limit.get("enforcement_type")
                })
            elif utilization >= 80:
                summary["warning_count"] += 1
            
            if category not in summary["by_category"]:
                summary["by_category"][category] = []
            summary["by_category"][category].append({
                "limit_key": limit["limit_key"],
                "limit_value": limit.get("limit_value"),
                "consumed_value": limit.get("consumed_value"),
                "utilization_percent": utilization
            })
        
        return summary
    
    def get_standard_limits(self) -> List[Dict[str, Any]]:
        """Get definitions of all standard limits"""
        return [
            {"limit_key": key, **info}
            for key, info in STANDARD_LIMITS.items()
        ]


# Singleton
_tenant_limits_service = None

def get_tenant_limits_service(db: AsyncIOMotorDatabase) -> TenantLimitsService:
    global _tenant_limits_service
    if _tenant_limits_service is None:
        _tenant_limits_service = TenantLimitsService(db)
    return _tenant_limits_service
