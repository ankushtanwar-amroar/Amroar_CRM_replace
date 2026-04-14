"""
Scheduled Trigger Service
Handles scheduled flows (one-time and recurring) - Completely isolated from other triggers
"""
import logging
from typing import Dict, Any, Optional
from datetime import datetime, timedelta
from motor.motor_asyncio import AsyncIOMotorDatabase
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.date import DateTrigger
from apscheduler.triggers.interval import IntervalTrigger
from apscheduler.triggers.cron import CronTrigger
import pytz

from ..models.flow import Flow
from ..runtime.flow_runtime import FlowRuntimeEngine

logger = logging.getLogger(__name__)


class ScheduledTriggerService:
    """
    Service for managing scheduled trigger flows
    Completely isolated from webhook triggers, record triggers, and screen flows
    """
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.runtime = FlowRuntimeEngine(db)
        self.scheduler = AsyncIOScheduler(timezone='UTC')
        self.scheduled_jobs = {}  # flow_id -> job_id mapping
    
    def start(self):
        """Start the scheduler"""
        if not self.scheduler.running:
            self.scheduler.start()
            logger.info("✅ Scheduled Trigger Service started")
    
    def stop(self):
        """Stop the scheduler"""
        if self.scheduler.running:
            self.scheduler.shutdown()
            logger.info("🛑 Scheduled Trigger Service stopped")
    
    async def register_scheduled_flow(self, flow: Flow):
        """
        Register a flow with scheduled trigger
        Only handles flows with type="scheduled_trigger"
        """
        
        # Find scheduled triggers only
        scheduled_triggers = [
            t for t in flow.triggers 
            if t.type == "scheduled_trigger"
        ]
        
        if not scheduled_triggers:
            return
        
        for trigger in scheduled_triggers:
            config = trigger.config
            schedule_type = config.get("schedule_type")
            
            if not schedule_type:
                logger.warning(f"Flow {flow.id} has scheduled trigger without schedule_type")
                continue
            
            try:
                if schedule_type == "one_time":
                    await self._register_one_time_schedule(flow, trigger, config)
                elif schedule_type == "recurring":
                    await self._register_recurring_schedule(flow, trigger, config)
                else:
                    logger.warning(f"Unknown schedule_type: {schedule_type} for flow {flow.id}")
                    
            except Exception as e:
                logger.error(f"Error registering scheduled flow {flow.id}: {str(e)}")
    
    async def _register_one_time_schedule(self, flow: Flow, trigger: Any, config: Dict[str, Any]):
        """Register a one-time scheduled flow"""
        
        scheduled_date = config.get("scheduled_date")  # ISO date string
        scheduled_time = config.get("scheduled_time")  # HH:MM
        timezone_str = config.get("timezone", "UTC")
        
        if not scheduled_date or not scheduled_time:
            logger.warning(f"Flow {flow.id}: Missing date or time for one-time schedule")
            return
        
        try:
            # Parse datetime
            tz = pytz.timezone(timezone_str)
            dt_str = f"{scheduled_date} {scheduled_time}"
            scheduled_datetime = datetime.strptime(dt_str, "%Y-%m-%d %H:%M")
            scheduled_datetime = tz.localize(scheduled_datetime)
            
            # Convert to UTC for scheduler
            scheduled_datetime_utc = scheduled_datetime.astimezone(pytz.UTC)
            
            # Check if in the past
            if scheduled_datetime_utc < datetime.now(pytz.UTC):
                logger.warning(f"Flow {flow.id}: Scheduled time is in the past, skipping")
                return
            
            # Create date trigger
            date_trigger = DateTrigger(run_date=scheduled_datetime_utc)
            
            # Add job
            job_id = f"scheduled_{flow.id}_{trigger.id}"
            job = self.scheduler.add_job(
                self._execute_scheduled_flow,
                trigger=date_trigger,
                args=[flow.id, flow.tenant_id, "one_time"],
                id=job_id,
                replace_existing=True
            )
            
            self.scheduled_jobs[flow.id] = job_id
            
            # Update next_execution_at in database
            await self.db.flows.update_one(
                {"id": flow.id},
                {"$set": {
                    "triggers.$[elem].config.next_execution_at": scheduled_datetime_utc
                }},
                array_filters=[{"elem.id": trigger.id}]
            )
            
            logger.info(f"✅ Scheduled ONE-TIME flow {flow.id} at {scheduled_datetime_utc}")
            
        except Exception as e:
            logger.error(f"Error creating one-time schedule for flow {flow.id}: {str(e)}")
    
    async def _register_recurring_schedule(self, flow: Flow, trigger: Any, config: Dict[str, Any]):
        """Register a recurring scheduled flow"""
        
        use_cron = config.get("use_cron", False)
        timezone_str = config.get("timezone", "UTC")
        
        try:
            if use_cron:
                # Use custom cron expression
                cron_expression = config.get("cron_expression")
                if not cron_expression:
                    logger.warning(f"Flow {flow.id}: Cron enabled but no expression provided")
                    return
                
                # Parse cron expression (format: minute hour day month day_of_week)
                parts = cron_expression.strip().split()
                if len(parts) != 5:
                    logger.error(f"Invalid cron expression for flow {flow.id}: {cron_expression}")
                    return
                
                minute, hour, day, month, day_of_week = parts
                
                cron_trigger = CronTrigger(
                    minute=minute,
                    hour=hour,
                    day=day,
                    month=month,
                    day_of_week=day_of_week,
                    timezone=timezone_str
                )
                
                logger.info(f"✅ Using cron expression: {cron_expression}")
                
            else:
                # Use standard frequency-based scheduling
                frequency = config.get("frequency")  # daily, weekly, monthly
                interval = config.get("interval", 1)
                time_of_day = config.get("time_of_day")  # HH:MM
                days_of_week = config.get("days_of_week")  # For weekly: [0-6]
                
                if not frequency or not time_of_day:
                    logger.warning(f"Flow {flow.id}: Missing frequency or time for recurring schedule")
                    return
                
                # Parse time
                hour, minute = map(int, time_of_day.split(':'))
                
                # Create appropriate trigger based on frequency
                if frequency == "daily":
                    # Daily at specific time
                    cron_trigger = CronTrigger(
                        hour=hour,
                        minute=minute,
                        timezone=timezone_str
                    )
                    
                elif frequency == "weekly":
                    # Weekly on specific days at specific time
                    if days_of_week:
                        # Convert [0-6] to cron day_of_week format (0=Monday in cron)
                        day_of_week_str = ','.join(map(str, days_of_week))
                        cron_trigger = CronTrigger(
                            day_of_week=day_of_week_str,
                            hour=hour,
                            minute=minute,
                            timezone=timezone_str
                        )
                    else:
                        # Every week at this time (default to Monday)
                        cron_trigger = CronTrigger(
                            day_of_week='0',
                            hour=hour,
                            minute=minute,
                            timezone=timezone_str
                        )
                        
                elif frequency == "monthly":
                    # Monthly on 1st day at specific time
                    cron_trigger = CronTrigger(
                        day=1,
                        hour=hour,
                        minute=minute,
                        timezone=timezone_str
                    )
                else:
                    logger.warning(f"Unknown frequency: {frequency}")
                    return
            
            # Add job
            job_id = f"scheduled_{flow.id}_{trigger.id}"
            job = self.scheduler.add_job(
                self._execute_scheduled_flow,
                trigger=cron_trigger,
                args=[flow.id, flow.tenant_id, "recurring"],
                id=job_id,
                replace_existing=True
            )
            
            self.scheduled_jobs[flow.id] = job_id
            
            # Calculate next execution time
            next_run_time = job.next_run_time
            
            # Update next_execution_at in database
            await self.db.flows.update_one(
                {"id": flow.id},
                {"$set": {
                    "triggers.$[elem].config.next_execution_at": next_run_time
                }},
                array_filters=[{"elem.id": trigger.id}]
            )
            
            logger.info(f"✅ Scheduled RECURRING flow {flow.id} ({frequency}, {time_of_day}, interval={interval})")
            
        except Exception as e:
            logger.error(f"Error creating recurring schedule for flow {flow.id}: {str(e)}")
    
    async def unregister_scheduled_flow(self, flow_id: str):
        """Unregister a scheduled flow"""
        
        if flow_id in self.scheduled_jobs:
            job_id = self.scheduled_jobs[flow_id]
            try:
                self.scheduler.remove_job(job_id)
                del self.scheduled_jobs[flow_id]
                logger.info(f"🗑️ Unscheduled flow: {flow_id}")
            except Exception as e:
                logger.error(f"Error unscheduling flow {flow_id}: {str(e)}")
    
    async def _execute_scheduled_flow(self, flow_id: str, tenant_id: str, schedule_type: str):
        """
        Execute a flow triggered by schedule
        This is the callback function invoked by APScheduler
        """
        
        logger.info(f"⏰ Scheduled Trigger: flow_id={flow_id}, type={schedule_type}")
        
        try:
            # Get flow from database
            flow_data = await self.db.flows.find_one({
                "id": flow_id,
                "tenant_id": tenant_id,
                "status": "active"
            }, {"_id": 0})
            
            if not flow_data:
                logger.warning(f"Flow {flow_id} not found or not active, skipping execution")
                return
            
            # Create Flow object from database data
            flow = Flow(**flow_data)
            
            # Get scheduled trigger config
            scheduled_trigger = next(
                (t for t in flow.triggers if t.type == "scheduled_trigger"),
                None
            )
            
            if not scheduled_trigger:
                logger.warning(f"No scheduled trigger found for flow {flow_id}")
                return
            
            config = scheduled_trigger.config
            
            # Prepare execution context with scheduler info
            execution_context = {
                "trigger_type": "scheduled_trigger",
                "schedule_type": schedule_type,
                "triggered_at": datetime.now(pytz.UTC),
                "triggered_by": "scheduler"
            }
            
            # Handle object filtering and conditions
            selected_object = config.get("object")
            use_conditions = config.get("use_conditions", False)
            conditions = config.get("conditions", [])
            
            trigger_data = {}
            
            if selected_object and use_conditions and conditions:
                # Fetch filtered records based on conditions
                logger.info(f"📊 Fetching {selected_object} records with conditions")
                filtered_records = await self._fetch_filtered_records(
                    selected_object,
                    conditions
                )
                
                # Add filtered records to trigger data
                trigger_data = {
                    "object": selected_object,
                    "records": filtered_records,
                    "record_count": len(filtered_records)
                }
                
                logger.info(f"✅ Found {len(filtered_records)} {selected_object} records matching conditions")
                
                # If no records found, skip execution
                if len(filtered_records) == 0:
                    logger.info(f"No records found for flow {flow_id}, skipping execution")
                    return
            
            # Execute flow with Flow object (not flow_id)
            execution = await self.runtime.execute_flow(
                flow=flow,
                trigger_data=trigger_data,
                context=execution_context
            )
            
            # Update last_executed_at in database
            await self.db.flows.update_one(
                {"id": flow_id},
                {"$set": {
                    "triggers.$[elem].config.last_executed_at": datetime.now(pytz.UTC)
                }},
                array_filters=[{"elem.type": "scheduled_trigger"}]
            )
            
            logger.info(f"✅ Scheduled flow {flow_id} executed successfully: {execution.id}")
            
            # If one-time, unregister after execution
            if schedule_type == "one_time":
                await self.unregister_scheduled_flow(flow_id)
                logger.info(f"🔚 One-time flow {flow_id} completed, unregistered")
            
        except Exception as e:
            logger.error(f"❌ Error executing scheduled flow {flow_id}: {str(e)}")
    
    async def _fetch_filtered_records(self, object_name: str, conditions: list) -> list:
        """
        Fetch records from database based on conditions
        Supports all operators: date, text, numeric, boolean
        """
        try:
            collection_name = object_name.lower() + 's'  # e.g., Lead -> leads
            collection = self.db[collection_name]
            
            # Build MongoDB query from conditions
            query = {}
            
            for condition in conditions:
                field = condition.get("field", "createdAt")
                operator = condition.get("operator")
                value = condition.get("value")
                
                # FIX: Map frontend field names to database field names
                field_mapping = {
                    "createdAt": "createdAt",
                    "Created Date": "createdAt",
                    "updatedAt": "updatedAt",
                    "Updated Date": "updatedAt",
                    "lastModifiedDate": "updatedAt"
                }
                db_field = field_mapping.get(field, field)
                
                # DATE OPERATORS
                if operator == "last_n_days":
                    # Records from last N days
                    days = int(value) if value else 7
                    start_date = datetime.now(pytz.UTC) - timedelta(days=days)
                    query[db_field] = {"$gte": start_date}
                
                elif operator == "last_n_hours":
                    # Records from last N hours
                    hours = int(value) if value else 24
                    start_date = datetime.now(pytz.UTC) - timedelta(hours=hours)
                    query[db_field] = {"$gte": start_date}
                
                elif operator == "today":
                    # Records created today (UTC)
                    today_start = datetime.now(pytz.UTC).replace(hour=0, minute=0, second=0, microsecond=0)
                    today_end = today_start + timedelta(days=1)
                    query[db_field] = {"$gte": today_start, "$lt": today_end}
                
                elif operator == "yesterday":
                    # Records created yesterday (UTC)
                    now_utc = datetime.now(pytz.UTC)
                    yesterday_start = (now_utc - timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
                    yesterday_end = now_utc.replace(hour=0, minute=0, second=0, microsecond=0)
                    query[db_field] = {"$gte": yesterday_start, "$lt": yesterday_end}
                
                elif operator == "this_week":
                    # Records from this week (Monday to now)
                    today = datetime.now(pytz.UTC)
                    week_start = today - timedelta(days=today.weekday())
                    week_start = week_start.replace(hour=0, minute=0, second=0, microsecond=0)
                    query[db_field] = {"$gte": week_start}
                
                elif operator == "this_month":
                    # Records from this month
                    month_start = datetime.now(pytz.UTC).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
                    query[db_field] = {"$gte": month_start}
                
                elif operator == "equals_date" or operator == "after_date" or operator == "before_date":
                    # Custom date comparison
                    if value:
                        date_value = datetime.fromisoformat(value.replace('Z', '+00:00'))
                        if operator == "equals_date":
                            # Same day
                            date_start = date_value.replace(hour=0, minute=0, second=0, microsecond=0)
                            date_end = date_start + timedelta(days=1)
                            query[db_field] = {"$gte": date_start, "$lt": date_end}
                        elif operator == "after_date":
                            query[db_field] = {"$gt": date_value}
                        elif operator == "before_date":
                            query[db_field] = {"$lt": date_value}
                
                # TEXT OPERATORS
                elif operator == "equals":
                    query[db_field] = value
                
                elif operator == "not_equals":
                    query[db_field] = {"$ne": value}
                
                elif operator == "contains":
                    query[db_field] = {"$regex": value, "$options": "i"}  # case-insensitive
                
                elif operator == "not_contains":
                    query[db_field] = {"$not": {"$regex": value, "$options": "i"}}
                
                elif operator == "starts_with":
                    query[db_field] = {"$regex": f"^{value}", "$options": "i"}
                
                elif operator == "ends_with":
                    query[db_field] = {"$regex": f"{value}$", "$options": "i"}
                
                elif operator == "is_empty":
                    query[db_field] = {"$in": [None, ""]}
                
                elif operator == "is_not_empty":
                    query[db_field] = {"$exists": True, "$ne": None, "$ne": ""}
                
                # NUMERIC OPERATORS
                elif operator == "greater_than":
                    query[db_field] = {"$gt": float(value) if value else 0}
                
                elif operator == "less_than":
                    query[db_field] = {"$lt": float(value) if value else 0}
                
                elif operator == "greater_than_or_equal":
                    query[db_field] = {"$gte": float(value) if value else 0}
                
                elif operator == "less_than_or_equal":
                    query[db_field] = {"$lte": float(value) if value else 0}
                
                # LIST OPERATORS
                elif operator == "in":
                    # Value should be comma-separated list
                    values = [v.strip() for v in value.split(',') if v.strip()]
                    query[db_field] = {"$in": values}
                
                elif operator == "not_in":
                    values = [v.strip() for v in value.split(',') if v.strip()]
                    query[db_field] = {"$nin": values}
            
            logger.info(f"📊 Query for {collection_name}: {query}")
            
            # Fetch records (exclude _id)
            records = await collection.find(query, {"_id": 0}).to_list(1000)
            
            logger.info(f"✅ Found {len(records)} records in {collection_name}")
            
            return records
            
        except Exception as e:
            logger.error(f"❌ Error fetching filtered records: {str(e)}")
            import traceback
            traceback.print_exc()
            return []


# Global instance
_scheduled_trigger_service_instance = None

def get_scheduled_trigger_service(db: AsyncIOMotorDatabase = None) -> ScheduledTriggerService:
    """Get or create the global scheduled trigger service instance"""
    global _scheduled_trigger_service_instance
    
    if _scheduled_trigger_service_instance is None:
        if db is None:
            raise ValueError("Database instance required to initialize ScheduledTriggerService")
        _scheduled_trigger_service_instance = ScheduledTriggerService(db)
        _scheduled_trigger_service_instance.start()
    
    return _scheduled_trigger_service_instance
