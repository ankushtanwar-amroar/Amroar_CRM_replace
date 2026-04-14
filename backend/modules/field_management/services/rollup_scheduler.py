"""
Rollup Scheduler Service - Handles scheduled/nightly rollup recalculation
Uses APScheduler (already used by Flow Builder)
"""
from motor.motor_asyncio import AsyncIOMotorDatabase
from typing import Optional, Dict, List, Any
from datetime import datetime, timezone, time as dt_time
import asyncio
import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

from .rollup_service import RollupFieldService
from ..models.rollup_field import RollupFieldConfig, RecalculationMode
from ..models.base import FieldType

logger = logging.getLogger(__name__)


class RollupSchedulerService:
    """
    Manages scheduled recalculation of rollup fields.
    Supports:
    - Nightly recalculation (default 2 AM)
    - Custom cron schedules per rollup
    - Manual trigger via API
    - Batch processing for large datasets
    """
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.rollup_service = RollupFieldService(db)
        self.scheduler: Optional[AsyncIOScheduler] = None
        self.scheduled_jobs: Dict[str, str] = {}  # rollup_id -> job_id
        self._is_running = False
    
    def start(self):
        """Start the scheduler"""
        if self.scheduler is None:
            self.scheduler = AsyncIOScheduler()
        
        if not self.scheduler.running:
            self.scheduler.start()
            self._is_running = True
            logger.info("Rollup scheduler started")
            
            # Schedule the global nightly recalculation job
            self._schedule_nightly_recalc()
    
    def stop(self):
        """Stop the scheduler"""
        if self.scheduler and self.scheduler.running:
            self.scheduler.shutdown(wait=False)
            self._is_running = False
            logger.info("Rollup scheduler stopped")
    
    def _schedule_nightly_recalc(self):
        """Schedule the nightly recalculation job for all scheduled rollups"""
        job_id = "rollup_nightly_recalc"
        
        # Remove existing job if present
        if self.scheduler.get_job(job_id):
            self.scheduler.remove_job(job_id)
        
        # Schedule at 2 AM daily
        self.scheduler.add_job(
            self._run_nightly_recalculation,
            CronTrigger(hour=2, minute=0),
            id=job_id,
            name="Nightly Rollup Recalculation",
            replace_existing=True
        )
        logger.info("Scheduled nightly rollup recalculation at 2:00 AM")
    
    async def _run_nightly_recalculation(self):
        """Run nightly recalculation for all scheduled rollup fields"""
        logger.info("Starting nightly rollup recalculation...")
        
        try:
            # Find all rollup fields with scheduled recalculation mode
            cursor = self.db.advanced_fields.find({
                "field_type": FieldType.ROLLUP.value,
                "recalculation_mode": RecalculationMode.SCHEDULED.value,
                "is_active": True
            }, {"_id": 0})
            
            rollups = await cursor.to_list(length=1000)
            
            processed = 0
            errors = 0
            
            for rollup_doc in rollups:
                try:
                    rollup = RollupFieldConfig(**rollup_doc)
                    await self._recalculate_rollup_for_all_parents(rollup)
                    processed += 1
                except Exception as e:
                    errors += 1
                    logger.error(f"Error recalculating rollup {rollup_doc.get('id')}: {str(e)}")
            
            logger.info(f"Nightly rollup recalculation complete. Processed: {processed}, Errors: {errors}")
            
            # Log the recalculation event
            await self._log_recalculation_event("nightly", processed, errors)
            
        except Exception as e:
            logger.error(f"Error in nightly rollup recalculation: {str(e)}")
    
    async def _recalculate_rollup_for_all_parents(
        self,
        rollup: RollupFieldConfig,
        batch_size: int = 100
    ):
        """Recalculate rollup for all parent records in batches"""
        parent_collection = f"{rollup.object_name}s"
        
        # Get total count
        total = await self.db[parent_collection].count_documents({
            "tenant_id": rollup.tenant_id
        })
        
        processed = 0
        skip = 0
        
        while skip < total:
            # Get batch of parent records
            cursor = self.db[parent_collection].find(
                {"tenant_id": rollup.tenant_id},
                {"id": 1, "_id": 0}
            ).skip(skip).limit(batch_size)
            
            parents = await cursor.to_list(length=batch_size)
            
            # Process batch
            tasks = []
            for parent in parents:
                tasks.append(
                    self.rollup_service.update_parent_rollup(rollup, parent["id"])
                )
            
            # Run batch concurrently (with limit)
            await asyncio.gather(*tasks, return_exceptions=True)
            
            processed += len(parents)
            skip += batch_size
            
            # Small delay between batches to prevent overload
            if skip < total:
                await asyncio.sleep(0.1)
        
        logger.info(f"Recalculated {processed} records for rollup {rollup.api_key}")
    
    async def schedule_rollup(
        self,
        rollup_id: str,
        tenant_id: str,
        cron_expression: Optional[str] = None
    ):
        """
        Schedule a specific rollup field for periodic recalculation.
        If cron_expression is None, uses default nightly schedule.
        
        Args:
            rollup_id: The rollup field ID
            tenant_id: The tenant ID
            cron_expression: Optional cron expression (e.g., "0 2 * * *" for 2 AM daily)
        """
        if not self._is_running:
            self.start()
        
        job_id = f"rollup_{rollup_id}"
        
        # Remove existing job if present
        if self.scheduler.get_job(job_id):
            self.scheduler.remove_job(job_id)
        
        # Get the rollup field
        rollup_doc = await self.db.advanced_fields.find_one({
            "id": rollup_id,
            "tenant_id": tenant_id,
            "field_type": FieldType.ROLLUP.value
        }, {"_id": 0})
        
        if not rollup_doc:
            raise ValueError(f"Rollup field {rollup_id} not found")
        
        rollup = RollupFieldConfig(**rollup_doc)
        
        # Determine trigger
        if cron_expression:
            trigger = CronTrigger.from_crontab(cron_expression)
        else:
            # Default: 2 AM daily
            trigger = CronTrigger(hour=2, minute=0)
        
        # Add job
        self.scheduler.add_job(
            self._run_scheduled_rollup,
            trigger,
            id=job_id,
            name=f"Scheduled Rollup: {rollup.label}",
            kwargs={"rollup_id": rollup_id, "tenant_id": tenant_id},
            replace_existing=True
        )
        
        self.scheduled_jobs[rollup_id] = job_id
        logger.info(f"Scheduled rollup {rollup_id} for periodic recalculation")
    
    async def unschedule_rollup(self, rollup_id: str):
        """Remove scheduled recalculation for a rollup field"""
        job_id = f"rollup_{rollup_id}"
        
        if self.scheduler and self.scheduler.get_job(job_id):
            self.scheduler.remove_job(job_id)
            self.scheduled_jobs.pop(rollup_id, None)
            logger.info(f"Unscheduled rollup {rollup_id}")
    
    async def _run_scheduled_rollup(self, rollup_id: str, tenant_id: str):
        """Run scheduled recalculation for a specific rollup"""
        try:
            rollup_doc = await self.db.advanced_fields.find_one({
                "id": rollup_id,
                "tenant_id": tenant_id,
                "field_type": FieldType.ROLLUP.value,
                "is_active": True
            }, {"_id": 0})
            
            if rollup_doc:
                rollup = RollupFieldConfig(**rollup_doc)
                await self._recalculate_rollup_for_all_parents(rollup)
                logger.info(f"Scheduled recalculation complete for rollup {rollup_id}")
        except Exception as e:
            logger.error(f"Error in scheduled rollup recalculation: {str(e)}")
    
    async def trigger_recalculation_now(
        self,
        rollup_id: str,
        tenant_id: str,
        parent_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Manually trigger rollup recalculation immediately.
        
        Args:
            rollup_id: The rollup field ID
            tenant_id: The tenant ID
            parent_id: Optional specific parent ID. If None, recalculates all.
            
        Returns:
            Dict with status and count of records processed
        """
        rollup_doc = await self.db.advanced_fields.find_one({
            "id": rollup_id,
            "tenant_id": tenant_id,
            "field_type": FieldType.ROLLUP.value
        }, {"_id": 0})
        
        if not rollup_doc:
            raise ValueError(f"Rollup field {rollup_id} not found")
        
        rollup = RollupFieldConfig(**rollup_doc)
        
        if parent_id:
            # Recalculate for specific parent
            await self.rollup_service.update_parent_rollup(rollup, parent_id)
            return {"status": "success", "records_processed": 1}
        else:
            # Recalculate for all parents
            parent_collection = f"{rollup.object_name}s"
            total = await self.db[parent_collection].count_documents({
                "tenant_id": tenant_id
            })
            
            # Run in background if large dataset
            if total > 100:
                asyncio.create_task(self._recalculate_rollup_for_all_parents(rollup))
                return {
                    "status": "started",
                    "message": f"Recalculation started for {total} records",
                    "records_to_process": total
                }
            else:
                await self._recalculate_rollup_for_all_parents(rollup)
                return {"status": "success", "records_processed": total}
    
    async def _log_recalculation_event(
        self,
        trigger_type: str,
        processed: int,
        errors: int
    ):
        """Log recalculation event for audit purposes"""
        event = {
            "event_type": "rollup_recalculation",
            "trigger_type": trigger_type,
            "records_processed": processed,
            "errors": errors,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        await self.db.system_events.insert_one(event)
    
    async def get_scheduler_status(self) -> Dict[str, Any]:
        """Get current scheduler status and scheduled jobs"""
        jobs = []
        if self.scheduler:
            for job in self.scheduler.get_jobs():
                jobs.append({
                    "id": job.id,
                    "name": job.name,
                    "next_run": job.next_run_time.isoformat() if job.next_run_time else None
                })
        
        return {
            "is_running": self._is_running,
            "scheduled_jobs": jobs,
            "rollup_jobs_count": len(self.scheduled_jobs)
        }
    
    async def initialize_scheduled_rollups(self):
        """Initialize scheduled jobs for all rollups with SCHEDULED mode"""
        cursor = self.db.advanced_fields.find({
            "field_type": FieldType.ROLLUP.value,
            "recalculation_mode": RecalculationMode.SCHEDULED.value,
            "is_active": True
        }, {"_id": 0})
        
        rollups = await cursor.to_list(length=1000)
        
        for rollup_doc in rollups:
            try:
                await self.schedule_rollup(
                    rollup_doc["id"],
                    rollup_doc["tenant_id"]
                )
            except Exception as e:
                logger.error(f"Error scheduling rollup {rollup_doc.get('id')}: {str(e)}")
        
        logger.info(f"Initialized {len(rollups)} scheduled rollup jobs")


# Global instance
_scheduler_service: Optional[RollupSchedulerService] = None


def get_rollup_scheduler(db: AsyncIOMotorDatabase) -> RollupSchedulerService:
    """Get or create the global rollup scheduler service instance"""
    global _scheduler_service
    if _scheduler_service is None:
        _scheduler_service = RollupSchedulerService(db)
    return _scheduler_service
