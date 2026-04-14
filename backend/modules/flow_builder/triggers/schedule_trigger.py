"""
Schedule Trigger Handler
Handles scheduled/cron-based triggers using APScheduler
"""
import logging
from typing import Dict, Any
from motor.motor_asyncio import AsyncIOMotorDatabase
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from ..models.flow import Flow
from ..runtime.flow_runtime import FlowRuntimeEngine

logger = logging.getLogger(__name__)


class ScheduleTriggerHandler:
    """Handle scheduled triggers with cron expressions"""
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.runtime = FlowRuntimeEngine(db)
        self.scheduler = AsyncIOScheduler()
        self.scheduled_jobs = {}  # flow_id -> job
    
    def start(self):
        """Start the scheduler"""
        if not self.scheduler.running:
            self.scheduler.start()
            logger.info("Schedule trigger handler started")
    
    def stop(self):
        """Stop the scheduler"""
        if self.scheduler.running:
            self.scheduler.shutdown()
            logger.info("Schedule trigger handler stopped")
    
    async def register_flow(self, flow: Flow):
        """Register a flow with schedule triggers"""
        
        # Find schedule triggers
        schedule_triggers = [
            t for t in flow.triggers 
            if t.type == "schedule"
        ]
        
        if not schedule_triggers:
            return
        
        for trigger in schedule_triggers:
            cron_expr = trigger.config.get("cron")
            timezone = trigger.config.get("timezone", "UTC")
            
            if not cron_expr:
                continue
            
            try:
                # Parse cron expression
                cron_trigger = CronTrigger.from_crontab(cron_expr, timezone=timezone)
                
                # Add job to scheduler
                job_id = f"{flow.id}_{trigger.id}"
                job = self.scheduler.add_job(
                    self._execute_scheduled_flow,
                    trigger=cron_trigger,
                    args=[flow.id, flow.tenant_id],
                    id=job_id,
                    replace_existing=True
                )
                
                self.scheduled_jobs[job_id] = job
                logger.info(f"Scheduled flow {flow.id} with cron: {cron_expr}")
                
            except Exception as e:
                logger.error(f"Error scheduling flow {flow.id}: {str(e)}")
    
    async def unregister_flow(self, flow_id: str):
        """Unregister a flow from scheduler"""
        
        # Remove all jobs for this flow
        jobs_to_remove = [
            job_id for job_id in self.scheduled_jobs.keys() 
            if job_id.startswith(flow_id)
        ]
        
        for job_id in jobs_to_remove:
            try:
                self.scheduler.remove_job(job_id)
                del self.scheduled_jobs[job_id]
                logger.info(f"Unscheduled job: {job_id}")
            except Exception as e:
                logger.error(f"Error unscheduling job {job_id}: {str(e)}")
    
    async def _execute_scheduled_flow(self, flow_id: str, tenant_id: str):
        """Execute a flow triggered by schedule"""
        
        logger.info(f"Schedule trigger: flow_id={flow_id}, tenant={tenant_id}")
        
        # Get flow from database
        flow_data = await self.db.flows.find_one({
            "id": flow_id,
            "tenant_id": tenant_id,
            "status": "active"
        })
        
        if not flow_data:
            logger.warning(f"Flow {flow_id} not found or not active")
            return
        
        # Convert to Flow model
        flow = Flow(**flow_data)
        
        # Prepare context
        context = {
            "trigger_type": "schedule",
            "flow_id": flow_id
        }
        
        # Execute flow
        execution = await self.runtime.execute_flow(
            flow=flow,
            trigger_data={"trigger_type": "schedule"},
            context=context
        )
        
        logger.info(f"Scheduled flow {flow_id} execution completed with status: {execution.status}")
        
        return execution
    
    async def reload_all_flows(self):
        """Reload all active flows with schedule triggers"""
        
        flows = await self.db.flows.find({
            "status": "active",
            "triggers.type": "schedule"
        }).to_list(length=None)
        
        logger.info(f"Reloading {len(flows)} scheduled flows")
        
        for flow_data in flows:
            try:
                flow = Flow(**flow_data)
                await self.register_flow(flow)
            except Exception as e:
                logger.error(f"Error reloading flow {flow_data.get('id')}: {str(e)}")
