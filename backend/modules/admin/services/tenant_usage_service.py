"""
Tenant Usage Service
Calculates and tracks usage metrics for tenants
"""
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any, List
from motor.motor_asyncio import AsyncIOMotorDatabase
import uuid

logger = logging.getLogger(__name__)


class TenantUsageService:
    """Service for calculating tenant usage metrics"""
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
    
    async def get_tenant_usage(self, tenant_id: str) -> Dict[str, Any]:
        """
        Get comprehensive usage metrics for a tenant
        
        Returns usage vs limits for:
        - Users (active, invited, total vs seat_limit)
        - Storage (estimated from records)
        - API calls (if tracked)
        - Automation runs (flow executions)
        - Active modules
        """
        # Get tenant info
        tenant = await self.db.tenants.find_one({"id": tenant_id}, {"_id": 0})
        if not tenant:
            return None
        
        # Get limits from tenant
        seat_limit = tenant.get("seat_limit") or tenant.get("max_users", 10)
        storage_limit_mb = tenant.get("max_storage_mb", 1024)
        api_limit_daily = tenant.get("api_limit_daily", 10000)
        flow_limit_monthly = tenant.get("flow_limit_monthly", 1000)
        enabled_modules = tenant.get("module_entitlements", [])
        
        # Calculate user usage
        active_users = await self.db.users.count_documents({
            "tenant_id": tenant_id,
            "is_active": True
        })
        
        invited_users = await self.db.users.count_documents({
            "tenant_id": tenant_id,
            "is_active": False,
            "invitation_token": {"$exists": True, "$ne": None}
        })
        
        total_users = await self.db.users.count_documents({"tenant_id": tenant_id})
        
        # Calculate storage usage (estimated from records)
        record_count = await self.db.object_records.count_documents({"tenant_id": tenant_id})
        file_count = await self.db.files.count_documents({"tenant_id": tenant_id})
        
        # Estimate storage: ~1KB per record, files have actual sizes
        estimated_record_storage_mb = record_count * 0.001
        
        # Get actual file sizes if available
        file_storage_pipeline = [
            {"$match": {"tenant_id": tenant_id}},
            {"$group": {"_id": None, "total_bytes": {"$sum": {"$ifNull": ["$file_size", 0]}}}}
        ]
        file_storage_result = await self.db.files.aggregate(file_storage_pipeline).to_list(1)
        file_storage_mb = (file_storage_result[0]["total_bytes"] / (1024 * 1024)) if file_storage_result else 0
        
        total_storage_mb = round(estimated_record_storage_mb + file_storage_mb, 2)
        
        # Calculate API usage (from api_logs if tracked)
        today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        api_calls_today = await self.db.api_logs.count_documents({
            "tenant_id": tenant_id,
            "timestamp": {"$gte": today}
        }) if await self._collection_exists("api_logs") else 0
        
        # Calculate automation usage (flow executions this month)
        first_of_month = datetime.now(timezone.utc).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        flow_runs_this_month = await self.db.flow_executions.count_documents({
            "tenant_id": tenant_id,
            "executed_at": {"$gte": first_of_month}
        }) if await self._collection_exists("flow_executions") else 0
        
        # Get active modules count
        active_modules_count = len(enabled_modules)
        
        # Get object counts
        object_count = await self.db.tenant_objects.count_documents({"tenant_id": tenant_id})
        
        # Get flow counts
        total_flows = await self.db.flows.count_documents({"tenant_id": tenant_id})
        active_flows = await self.db.flows.count_documents({"tenant_id": tenant_id, "status": "Active"})
        
        return {
            "tenant_id": tenant_id,
            "tenant_name": tenant.get("tenant_name") or tenant.get("company_name"),
            "plan": tenant.get("plan") or tenant.get("subscription_plan", "free"),
            "status": tenant.get("status", "active"),
            "calculated_at": datetime.now(timezone.utc).isoformat(),
            
            "users": {
                "active": active_users,
                "invited": invited_users,
                "total": total_users,
                "limit": seat_limit,
                "usage_percent": round((total_users / seat_limit) * 100, 1) if seat_limit > 0 else 0,
                "remaining": max(0, seat_limit - total_users)
            },
            
            "storage": {
                "used_mb": total_storage_mb,
                "limit_mb": storage_limit_mb,
                "usage_percent": round((total_storage_mb / storage_limit_mb) * 100, 1) if storage_limit_mb > 0 else 0,
                "remaining_mb": round(max(0, storage_limit_mb - total_storage_mb), 2),
                "breakdown": {
                    "records_mb": round(estimated_record_storage_mb, 2),
                    "files_mb": round(file_storage_mb, 2),
                    "record_count": record_count,
                    "file_count": file_count
                }
            },
            
            "api_calls": {
                "today": api_calls_today,
                "daily_limit": api_limit_daily,
                "usage_percent": round((api_calls_today / api_limit_daily) * 100, 1) if api_limit_daily > 0 else 0,
                "remaining_today": max(0, api_limit_daily - api_calls_today)
            },
            
            "automation": {
                "runs_this_month": flow_runs_this_month,
                "monthly_limit": flow_limit_monthly,
                "usage_percent": round((flow_runs_this_month / flow_limit_monthly) * 100, 1) if flow_limit_monthly > 0 else 0,
                "remaining_this_month": max(0, flow_limit_monthly - flow_runs_this_month),
                "total_flows": total_flows,
                "active_flows": active_flows
            },
            
            "modules": {
                "enabled": enabled_modules,
                "count": active_modules_count
            },
            
            "objects": {
                "count": object_count
            },
            
            "warnings": self._generate_warnings(
                users_percent=(total_users / seat_limit * 100) if seat_limit > 0 else 0,
                storage_percent=(total_storage_mb / storage_limit_mb * 100) if storage_limit_mb > 0 else 0,
                api_percent=(api_calls_today / api_limit_daily * 100) if api_limit_daily > 0 else 0,
                automation_percent=(flow_runs_this_month / flow_limit_monthly * 100) if flow_limit_monthly > 0 else 0
            )
        }
    
    def _generate_warnings(
        self,
        users_percent: float,
        storage_percent: float,
        api_percent: float,
        automation_percent: float
    ) -> List[Dict[str, Any]]:
        """Generate warnings for limits approaching or exceeded"""
        warnings = []
        
        if users_percent >= 100:
            warnings.append({
                "type": "users",
                "severity": "critical",
                "message": "User seat limit reached. No new users can be added."
            })
        elif users_percent >= 80:
            warnings.append({
                "type": "users",
                "severity": "warning",
                "message": f"User seats are {round(users_percent)}% utilized. Consider upgrading."
            })
        
        if storage_percent >= 100:
            warnings.append({
                "type": "storage",
                "severity": "critical",
                "message": "Storage limit reached. Some features may be restricted."
            })
        elif storage_percent >= 80:
            warnings.append({
                "type": "storage",
                "severity": "warning",
                "message": f"Storage is {round(storage_percent)}% utilized."
            })
        
        if api_percent >= 100:
            warnings.append({
                "type": "api_calls",
                "severity": "critical",
                "message": "Daily API limit reached. API access may be throttled."
            })
        elif api_percent >= 80:
            warnings.append({
                "type": "api_calls",
                "severity": "warning",
                "message": f"Daily API calls at {round(api_percent)}% of limit."
            })
        
        if automation_percent >= 100:
            warnings.append({
                "type": "automation",
                "severity": "critical",
                "message": "Monthly automation limit reached. Flows may not execute."
            })
        elif automation_percent >= 80:
            warnings.append({
                "type": "automation",
                "severity": "warning",
                "message": f"Automation runs at {round(automation_percent)}% of monthly limit."
            })
        
        return warnings
    
    async def _collection_exists(self, collection_name: str) -> bool:
        """Check if a collection exists"""
        collections = await self.db.list_collection_names()
        return collection_name in collections
    
    async def get_usage_summary_all_tenants(
        self,
        skip: int = 0,
        limit: int = 50,
        sort_by: str = "users",
        sort_order: str = "desc"
    ) -> Dict[str, Any]:
        """
        Get usage summary for all tenants
        Useful for identifying tenants approaching limits
        """
        # Get all active tenants
        tenants = await self.db.tenants.find(
            {"is_deleted": {"$ne": True}},
            {"_id": 0}
        ).to_list(None)
        
        usage_list = []
        for tenant in tenants:
            tenant_id = tenant.get("id")
            seat_limit = tenant.get("seat_limit") or tenant.get("max_users", 10)
            storage_limit = tenant.get("max_storage_mb", 1024)
            
            user_count = await self.db.users.count_documents({"tenant_id": tenant_id})
            record_count = await self.db.object_records.count_documents({"tenant_id": tenant_id})
            estimated_storage = record_count * 0.001
            
            users_percent = (user_count / seat_limit * 100) if seat_limit > 0 else 0
            storage_percent = (estimated_storage / storage_limit * 100) if storage_limit > 0 else 0
            
            usage_list.append({
                "tenant_id": tenant_id,
                "tenant_name": tenant.get("tenant_name") or tenant.get("company_name"),
                "plan": tenant.get("plan") or tenant.get("subscription_plan", "free"),
                "status": tenant.get("status", "active"),
                "users": {
                    "current": user_count,
                    "limit": seat_limit,
                    "percent": round(users_percent, 1)
                },
                "storage": {
                    "current_mb": round(estimated_storage, 2),
                    "limit_mb": storage_limit,
                    "percent": round(storage_percent, 1)
                },
                "has_warnings": users_percent >= 80 or storage_percent >= 80
            })
        
        # Sort
        reverse = sort_order == "desc"
        if sort_by == "users":
            usage_list.sort(key=lambda x: x["users"]["percent"], reverse=reverse)
        elif sort_by == "storage":
            usage_list.sort(key=lambda x: x["storage"]["percent"], reverse=reverse)
        elif sort_by == "name":
            usage_list.sort(key=lambda x: x["tenant_name"] or "", reverse=reverse)
        
        total = len(usage_list)
        paginated = usage_list[skip:skip + limit]
        
        return {
            "tenants": paginated,
            "total": total,
            "skip": skip,
            "limit": limit,
            "tenants_with_warnings": sum(1 for t in usage_list if t["has_warnings"])
        }
    
    async def get_tenants_approaching_limits(
        self,
        threshold_percent: int = 80
    ) -> List[Dict[str, Any]]:
        """Get tenants that are approaching their usage limits"""
        result = await self.get_usage_summary_all_tenants(limit=1000)
        
        approaching = [
            t for t in result["tenants"]
            if t["users"]["percent"] >= threshold_percent or t["storage"]["percent"] >= threshold_percent
        ]
        
        return approaching


# Singleton instance
_tenant_usage_service = None

def get_tenant_usage_service(db: AsyncIOMotorDatabase) -> TenantUsageService:
    """Get or create the tenant usage service instance"""
    global _tenant_usage_service
    if _tenant_usage_service is None:
        _tenant_usage_service = TenantUsageService(db)
    return _tenant_usage_service
