"""
Provisioning Jobs Service - Control Plane
Manages provisioning job queue for tenant lifecycle operations.
Tracks job status, errors, and provides retry capability.
"""
import logging
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List
from motor.motor_asyncio import AsyncIOMotorDatabase
import uuid
import traceback

logger = logging.getLogger(__name__)


class ProvisioningJobsService:
    """
    Service for managing provisioning jobs.
    
    Provides:
    - Job queue for async provisioning operations
    - Status tracking (QUEUED, RUNNING, COMPLETED, FAILED)
    - Error logging and retry capability
    - Job history per tenant
    """
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.collection = db.provisioning_jobs
    
    async def create_job(
        self,
        tenant_id: str,
        job_type: str,
        requested_by: str,
        request_source: str = "ADMIN_PORTAL",
        parameters: Dict[str, Any] = None
    ) -> Dict[str, Any]:
        """Create a new provisioning job"""
        job_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc)
        
        job = {
            "id": job_id,
            "tenant_id": tenant_id,
            "job_type": job_type,
            "status": "QUEUED",
            "parameters": parameters or {},
            "requested_by": requested_by,
            "request_source": request_source,
            "started_at": None,
            "completed_at": None,
            "error_message": None,
            "retry_count": 0,
            "max_retries": 3,
            "result": None,
            "created_at": now,
            "updated_at": now
        }
        
        await self.collection.insert_one(job)
        job.pop("_id", None)
        
        logger.info(f"Created provisioning job {job_id}: {job_type} for tenant {tenant_id}")
        
        return job
    
    async def get_job(self, job_id: str) -> Optional[Dict[str, Any]]:
        """Get a job by ID"""
        return await self.collection.find_one({"id": job_id}, {"_id": 0})
    
    async def get_tenant_jobs(
        self,
        tenant_id: str,
        skip: int = 0,
        limit: int = 50,
        status_filter: str = None
    ) -> Dict[str, Any]:
        """Get provisioning jobs for a tenant"""
        query = {"tenant_id": tenant_id}
        if status_filter:
            query["status"] = status_filter
        
        total = await self.collection.count_documents(query)
        
        cursor = self.collection.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit)
        jobs = await cursor.to_list(length=limit)
        
        return {
            "jobs": jobs,
            "total": total,
            "skip": skip,
            "limit": limit
        }
    
    async def get_pending_jobs(self, limit: int = 100) -> List[Dict[str, Any]]:
        """Get queued jobs ready for processing"""
        cursor = self.collection.find(
            {"status": "QUEUED"},
            {"_id": 0}
        ).sort("created_at", 1).limit(limit)
        
        return await cursor.to_list(length=limit)
    
    async def start_job(self, job_id: str) -> Optional[Dict[str, Any]]:
        """Mark a job as started"""
        now = datetime.now(timezone.utc)
        
        result = await self.collection.update_one(
            {"id": job_id, "status": "QUEUED"},
            {"$set": {
                "status": "RUNNING",
                "started_at": now,
                "updated_at": now
            }}
        )
        
        if result.matched_count == 0:
            return None
        
        return await self.get_job(job_id)
    
    async def complete_job(
        self,
        job_id: str,
        result: Dict[str, Any] = None
    ) -> Optional[Dict[str, Any]]:
        """Mark a job as completed successfully"""
        now = datetime.now(timezone.utc)
        
        await self.collection.update_one(
            {"id": job_id},
            {"$set": {
                "status": "COMPLETED",
                "completed_at": now,
                "result": result,
                "updated_at": now
            }}
        )
        
        logger.info(f"Provisioning job {job_id} completed successfully")
        
        return await self.get_job(job_id)
    
    async def fail_job(
        self,
        job_id: str,
        error_message: str
    ) -> Optional[Dict[str, Any]]:
        """Mark a job as failed"""
        now = datetime.now(timezone.utc)
        
        job = await self.get_job(job_id)
        if not job:
            return None
        
        retry_count = job.get("retry_count", 0) + 1
        max_retries = job.get("max_retries", 3)
        
        # If we have retries left, re-queue the job
        new_status = "FAILED" if retry_count >= max_retries else "QUEUED"
        
        await self.collection.update_one(
            {"id": job_id},
            {"$set": {
                "status": new_status,
                "error_message": error_message,
                "retry_count": retry_count,
                "completed_at": now if new_status == "FAILED" else None,
                "updated_at": now
            }}
        )
        
        if new_status == "QUEUED":
            logger.warning(f"Provisioning job {job_id} failed, re-queued for retry ({retry_count}/{max_retries})")
        else:
            logger.error(f"Provisioning job {job_id} failed permanently: {error_message}")
        
        return await self.get_job(job_id)
    
    async def cancel_job(self, job_id: str) -> bool:
        """Cancel a queued job"""
        now = datetime.now(timezone.utc)
        
        result = await self.collection.update_one(
            {"id": job_id, "status": "QUEUED"},
            {"$set": {
                "status": "CANCELLED",
                "completed_at": now,
                "updated_at": now
            }}
        )
        
        return result.matched_count > 0
    
    async def retry_job(self, job_id: str) -> Optional[Dict[str, Any]]:
        """Manually retry a failed job"""
        job = await self.get_job(job_id)
        if not job or job.get("status") != "FAILED":
            return None
        
        now = datetime.now(timezone.utc)
        
        await self.collection.update_one(
            {"id": job_id},
            {"$set": {
                "status": "QUEUED",
                "error_message": None,
                "started_at": None,
                "completed_at": None,
                "updated_at": now
            }}
        )
        
        logger.info(f"Provisioning job {job_id} queued for manual retry")
        
        return await self.get_job(job_id)
    
    async def get_jobs_summary(self, hours: int = 24) -> Dict[str, Any]:
        """Get summary of provisioning jobs"""
        from datetime import timedelta
        cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
        
        pipeline = [
            {"$match": {"created_at": {"$gte": cutoff}}},
            {"$group": {
                "_id": {"status": "$status", "job_type": "$job_type"},
                "count": {"$sum": 1}
            }}
        ]
        
        results = await self.collection.aggregate(pipeline).to_list(100)
        
        by_status = {}
        by_type = {}
        
        for r in results:
            status = r["_id"]["status"]
            job_type = r["_id"]["job_type"]
            count = r["count"]
            
            by_status[status] = by_status.get(status, 0) + count
            by_type[job_type] = by_type.get(job_type, 0) + count
        
        return {
            "period_hours": hours,
            "by_status": by_status,
            "by_type": by_type,
            "total_jobs": sum(by_status.values())
        }
    
    async def execute_job(self, job_id: str) -> Dict[str, Any]:
        """
        Execute a provisioning job.
        This is the main job processor that handles different job types.
        """
        job = await self.start_job(job_id)
        if not job:
            return {"success": False, "error": "Job not found or already running"}
        
        try:
            job_type = job.get("job_type")
            tenant_id = job.get("tenant_id")
            parameters = job.get("parameters", {})
            
            result = None
            
            if job_type == "CREATE_TENANT":
                result = await self._execute_create_tenant(tenant_id, parameters)
            elif job_type == "UPGRADE_PLAN":
                result = await self._execute_upgrade_plan(tenant_id, parameters)
            elif job_type == "ENABLE_MODULE":
                result = await self._execute_enable_module(tenant_id, parameters)
            elif job_type == "DISABLE_MODULE":
                result = await self._execute_disable_module(tenant_id, parameters)
            elif job_type == "SUSPEND_TENANT":
                result = await self._execute_suspend_tenant(tenant_id, parameters)
            elif job_type == "REACTIVATE_TENANT":
                result = await self._execute_reactivate_tenant(tenant_id, parameters)
            elif job_type == "TERMINATE_TENANT":
                result = await self._execute_terminate_tenant(tenant_id, parameters)
            elif job_type == "RESET_ADMIN":
                result = await self._execute_reset_admin(tenant_id, parameters)
            elif job_type == "UPDATE_LIMITS":
                result = await self._execute_update_limits(tenant_id, parameters)
            else:
                raise ValueError(f"Unknown job type: {job_type}")
            
            await self.complete_job(job_id, result)
            return {"success": True, "result": result}
            
        except Exception as e:
            error_msg = f"{str(e)}\n{traceback.format_exc()}"
            await self.fail_job(job_id, error_msg)
            return {"success": False, "error": str(e)}
    
    async def _execute_create_tenant(self, tenant_id: str, params: Dict) -> Dict:
        """Execute CREATE_TENANT job"""
        from shared.services.tenant_provisioning_service import TenantProvisioningService
        
        service = TenantProvisioningService(self.db)
        result = await service.provision_tenant(
            tenant_id=tenant_id,
            user_id=params.get("admin_user_id", "system"),
            industry=params.get("industry", "general"),
            skip_if_exists=False
        )
        
        # Update tenant status to ACTIVE
        await self.db.tenants.update_one(
            {"id": tenant_id},
            {"$set": {
                "status": "ACTIVE",
                "updated_at": datetime.now(timezone.utc)
            }}
        )
        
        return {"provisioned": True, "details": result}
    
    async def _execute_upgrade_plan(self, tenant_id: str, params: Dict) -> Dict:
        """Execute UPGRADE_PLAN job"""
        from .tenant_modules_service import get_tenant_modules_service
        from .tenant_limits_service import get_tenant_limits_service
        
        new_plan = params.get("new_plan")
        
        # Get plan details
        plan = await self.db.plans.find_one({"api_name": new_plan}, {"_id": 0})
        if not plan:
            raise ValueError(f"Plan not found: {new_plan}")
        
        # Update tenant plan
        await self.db.tenants.update_one(
            {"id": tenant_id},
            {"$set": {
                "plan": new_plan,
                "subscription_plan": new_plan,
                "updated_at": datetime.now(timezone.utc)
            }}
        )
        
        # Update modules from plan
        modules_service = get_tenant_modules_service(self.db)
        default_modules = plan.get("default_modules") or plan.get("enabled_modules", [])
        await modules_service.set_modules_from_plan(tenant_id, default_modules)
        
        # Update limits from plan
        limits_service = get_tenant_limits_service(self.db)
        await limits_service.update_limits_from_plan(tenant_id, new_plan)
        
        return {"plan_updated": new_plan}
    
    async def _execute_enable_module(self, tenant_id: str, params: Dict) -> Dict:
        """Execute ENABLE_MODULE job"""
        from .tenant_modules_service import get_tenant_modules_service
        
        service = get_tenant_modules_service(self.db)
        module_code = params.get("module_code")
        source = params.get("enabled_source", "MANUAL_OVERRIDE")
        end_at = params.get("end_at")
        
        result = await service.enable_module(
            tenant_id, module_code,
            enabled_source=source,
            end_at=end_at
        )
        
        return {"module_enabled": module_code, "result": result}
    
    async def _execute_disable_module(self, tenant_id: str, params: Dict) -> Dict:
        """Execute DISABLE_MODULE job"""
        from .tenant_modules_service import get_tenant_modules_service
        
        service = get_tenant_modules_service(self.db)
        module_code = params.get("module_code")
        
        await service.disable_module(tenant_id, module_code)
        
        return {"module_disabled": module_code}
    
    async def _execute_suspend_tenant(self, tenant_id: str, params: Dict) -> Dict:
        """Execute SUSPEND_TENANT job"""
        reason = params.get("reason", "Suspended by admin")
        now = datetime.now(timezone.utc)
        
        await self.db.tenants.update_one(
            {"id": tenant_id},
            {"$set": {
                "status": "SUSPENDED",
                "suspended_at": now,
                "suspended_reason": reason,
                "updated_at": now
            }}
        )
        
        return {"suspended": True, "reason": reason}
    
    async def _execute_reactivate_tenant(self, tenant_id: str, params: Dict) -> Dict:
        """Execute REACTIVATE_TENANT job"""
        now = datetime.now(timezone.utc)
        
        await self.db.tenants.update_one(
            {"id": tenant_id},
            {
                "$set": {
                    "status": "ACTIVE",
                    "updated_at": now
                },
                "$unset": {
                    "suspended_at": "",
                    "suspended_reason": ""
                }
            }
        )
        
        return {"reactivated": True}
    
    async def _execute_terminate_tenant(self, tenant_id: str, params: Dict) -> Dict:
        """Execute TERMINATE_TENANT job"""
        now = datetime.now(timezone.utc)
        
        await self.db.tenants.update_one(
            {"id": tenant_id},
            {"$set": {
                "status": "TERMINATED",
                "terminated_at": now,
                "is_deleted": True,
                "updated_at": now
            }}
        )
        
        return {"terminated": True}
    
    async def _execute_reset_admin(self, tenant_id: str, params: Dict) -> Dict:
        """Execute RESET_ADMIN job"""
        import bcrypt
        
        new_password = params.get("new_password")
        admin_email = params.get("admin_email")
        
        if not new_password:
            raise ValueError("new_password required")
        
        hashed = bcrypt.hashpw(new_password.encode(), bcrypt.gensalt()).decode()
        
        query = {"tenant_id": tenant_id, "role": {"$in": ["admin", "owner"]}}
        if admin_email:
            query["email"] = admin_email.lower()
        
        result = await self.db.users.update_one(
            query,
            {"$set": {
                "password": hashed,
                "updated_at": datetime.now(timezone.utc)
            }}
        )
        
        return {"password_reset": result.modified_count > 0}
    
    async def _execute_update_limits(self, tenant_id: str, params: Dict) -> Dict:
        """Execute UPDATE_LIMITS job"""
        from .tenant_limits_service import get_tenant_limits_service
        
        service = get_tenant_limits_service(self.db)
        limits = params.get("limits", {})
        
        for limit_key, limit_value in limits.items():
            await service.set_limit(tenant_id, limit_key, limit_value)
        
        return {"limits_updated": list(limits.keys())}


# Singleton
_provisioning_jobs_service = None

def get_provisioning_jobs_service(db: AsyncIOMotorDatabase) -> ProvisioningJobsService:
    global _provisioning_jobs_service
    if _provisioning_jobs_service is None:
        _provisioning_jobs_service = ProvisioningJobsService(db)
    return _provisioning_jobs_service
