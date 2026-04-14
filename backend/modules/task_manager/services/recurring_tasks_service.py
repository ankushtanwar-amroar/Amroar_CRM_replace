"""
Recurring Tasks Service for Task Manager - Phase 14
Handles recurring task configuration, scheduling, and task generation
"""
import os
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any, List
import uuid
from dateutil import rrule
from dateutil.relativedelta import relativedelta
import pytz

from motor.motor_asyncio import AsyncIOMotorDatabase

logger = logging.getLogger(__name__)


class RecurringTasksService:
    """Service for managing recurring tasks"""
    
    # Recurrence types
    RECURRENCE_TYPES = ["daily", "weekly", "monthly", "custom"]
    
    # Days of week mapping
    WEEKDAY_MAP = {
        "monday": 0, "tuesday": 1, "wednesday": 2, "thursday": 3,
        "friday": 4, "saturday": 5, "sunday": 6
    }
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
    
    async def list_recurrence_rules(
        self,
        tenant_id: str,
        project_id: Optional[str] = None,
        include_paused: bool = True
    ) -> List[Dict[str, Any]]:
        """List all recurrence rules for a tenant"""
        query = {"tenant_id": tenant_id, "is_active": True}
        
        if project_id:
            query["project_id"] = project_id
        
        if not include_paused:
            query["is_paused"] = False
        
        rules = await self.db.tm_recurrence_rules.find(
            query, {"_id": 0}
        ).sort("created_at", -1).to_list(100)
        
        # Get generated task count for each rule
        for rule in rules:
            generated_count = await self.db.tm_tasks.count_documents({
                "recurrence_rule_id": rule["id"],
                "tenant_id": tenant_id
            })
            rule["generated_count"] = generated_count
            
            # Get source task/template info
            if rule.get("source_task_id"):
                source_task = await self.db.tm_tasks.find_one(
                    {"id": rule["source_task_id"]},
                    {"_id": 0, "id": 1, "title": 1}
                )
                rule["source_task"] = source_task
            elif rule.get("template_id"):
                template = await self.db.tm_task_templates.find_one(
                    {"id": rule["template_id"]},
                    {"_id": 0, "id": 1, "name": 1}
                )
                rule["template"] = template
        
        return rules
    
    async def get_recurrence_rule(
        self,
        rule_id: str,
        tenant_id: str
    ) -> Optional[Dict[str, Any]]:
        """Get a specific recurrence rule"""
        rule = await self.db.tm_recurrence_rules.find_one(
            {"id": rule_id, "tenant_id": tenant_id, "is_active": True},
            {"_id": 0}
        )
        
        if rule:
            # Get generated tasks
            generated_tasks = await self.db.tm_tasks.find(
                {"recurrence_rule_id": rule_id, "tenant_id": tenant_id},
                {"_id": 0, "id": 1, "title": 1, "status": 1, "created_at": 1}
            ).sort("created_at", -1).limit(10).to_list(10)
            rule["generated_tasks"] = generated_tasks
            rule["generated_count"] = await self.db.tm_tasks.count_documents({
                "recurrence_rule_id": rule_id,
                "tenant_id": tenant_id
            })
        
        return rule
    
    async def create_recurrence_rule(
        self,
        tenant_id: str,
        created_by: str,
        project_id: str,
        name: str,
        recurrence_type: str,
        start_date: datetime,
        source_task_id: Optional[str] = None,
        template_id: Optional[str] = None,
        end_date: Optional[datetime] = None,
        time_of_day: str = "09:00",
        timezone_str: str = "UTC",
        weekly_days: Optional[List[str]] = None,
        monthly_day: Optional[int] = None,
        custom_interval_days: Optional[int] = None,
        title_pattern: Optional[str] = None,
        description: Optional[str] = None
    ) -> Dict[str, Any]:
        """Create a new recurrence rule"""
        now = datetime.now(timezone.utc)
        
        # Validate recurrence type
        if recurrence_type not in self.RECURRENCE_TYPES:
            raise ValueError(f"Invalid recurrence type. Must be one of: {self.RECURRENCE_TYPES}")
        
        # Must have either source_task_id or template_id
        if not source_task_id and not template_id:
            raise ValueError("Either source_task_id or template_id is required")
        
        # Validate source exists
        if source_task_id:
            source_task = await self.db.tm_tasks.find_one(
                {"id": source_task_id, "tenant_id": tenant_id, "is_active": True}
            )
            if not source_task:
                raise ValueError("Source task not found")
        
        if template_id:
            template = await self.db.tm_task_templates.find_one(
                {"id": template_id, "tenant_id": tenant_id, "is_active": True}
            )
            if not template:
                raise ValueError("Template not found")
        
        # Validate weekly days for weekly recurrence
        if recurrence_type == "weekly":
            if not weekly_days or len(weekly_days) == 0:
                raise ValueError("weekly_days is required for weekly recurrence")
            for day in weekly_days:
                if day.lower() not in self.WEEKDAY_MAP:
                    raise ValueError(f"Invalid day: {day}")
        
        # Validate monthly day for monthly recurrence
        if recurrence_type == "monthly":
            if not monthly_day or monthly_day < 1 or monthly_day > 31:
                raise ValueError("monthly_day must be between 1 and 31")
        
        # Validate custom interval
        if recurrence_type == "custom":
            if not custom_interval_days or custom_interval_days < 1:
                raise ValueError("custom_interval_days must be at least 1")
        
        # Calculate next run time
        next_run = self._calculate_next_run(
            start_date=start_date,
            recurrence_type=recurrence_type,
            time_of_day=time_of_day,
            timezone_str=timezone_str,
            weekly_days=weekly_days,
            monthly_day=monthly_day,
            custom_interval_days=custom_interval_days
        )
        
        rule_data = {
            "id": str(uuid.uuid4()),
            "tenant_id": tenant_id,
            "project_id": project_id,
            "name": name,
            "description": description,
            "recurrence_type": recurrence_type,
            "source_task_id": source_task_id,
            "template_id": template_id,
            "start_date": start_date,
            "end_date": end_date,
            "time_of_day": time_of_day,
            "timezone": timezone_str,
            "weekly_days": [d.lower() for d in weekly_days] if weekly_days else None,
            "monthly_day": monthly_day,
            "custom_interval_days": custom_interval_days,
            "title_pattern": title_pattern,
            "is_active": True,
            "is_paused": False,
            "last_run_at": None,
            "next_run_at": next_run,
            "run_count": 0,
            "failure_count": 0,
            "created_by": created_by,
            "created_at": now,
            "updated_at": now
        }
        
        await self.db.tm_recurrence_rules.insert_one(rule_data)
        
        # Log activity
        await self._log_recurrence_activity(
            tenant_id=tenant_id,
            rule_id=rule_data["id"],
            activity_type="rule_created",
            description=f"Recurrence rule '{name}' created",
            user_id=created_by
        )
        
        rule_data.pop("_id", None)
        return rule_data
    
    async def update_recurrence_rule(
        self,
        rule_id: str,
        tenant_id: str,
        user_id: str,
        updates: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """Update an existing recurrence rule (affects future runs only)"""
        existing = await self.db.tm_recurrence_rules.find_one(
            {"id": rule_id, "tenant_id": tenant_id, "is_active": True}
        )
        
        if not existing:
            return None
        
        # Allowed fields to update
        allowed_fields = {
            "name", "description", "end_date", "time_of_day", "timezone",
            "weekly_days", "monthly_day", "custom_interval_days", "title_pattern"
        }
        
        update_data = {k: v for k, v in updates.items() if k in allowed_fields}
        update_data["updated_at"] = datetime.now(timezone.utc)
        
        # Recalculate next run if schedule changed
        schedule_fields = {"time_of_day", "timezone", "weekly_days", "monthly_day", "custom_interval_days"}
        if any(f in update_data for f in schedule_fields):
            merged = {**existing, **update_data}
            update_data["next_run_at"] = self._calculate_next_run(
                start_date=datetime.now(timezone.utc),
                recurrence_type=existing["recurrence_type"],
                time_of_day=merged.get("time_of_day", "09:00"),
                timezone_str=merged.get("timezone", "UTC"),
                weekly_days=merged.get("weekly_days"),
                monthly_day=merged.get("monthly_day"),
                custom_interval_days=merged.get("custom_interval_days")
            )
        
        await self.db.tm_recurrence_rules.update_one(
            {"id": rule_id},
            {"$set": update_data}
        )
        
        await self._log_recurrence_activity(
            tenant_id=tenant_id,
            rule_id=rule_id,
            activity_type="rule_updated",
            description="Recurrence rule updated",
            user_id=user_id,
            details={"changes": list(update_data.keys())}
        )
        
        updated = await self.db.tm_recurrence_rules.find_one(
            {"id": rule_id},
            {"_id": 0}
        )
        return updated
    
    async def delete_recurrence_rule(
        self,
        rule_id: str,
        tenant_id: str,
        user_id: str
    ) -> bool:
        """Soft delete a recurrence rule (does not affect past generated tasks)"""
        result = await self.db.tm_recurrence_rules.update_one(
            {"id": rule_id, "tenant_id": tenant_id},
            {
                "$set": {
                    "is_active": False,
                    "deleted_at": datetime.now(timezone.utc),
                    "deleted_by": user_id
                }
            }
        )
        
        if result.modified_count > 0:
            await self._log_recurrence_activity(
                tenant_id=tenant_id,
                rule_id=rule_id,
                activity_type="rule_deleted",
                description="Recurrence rule deleted",
                user_id=user_id
            )
            return True
        
        return False
    
    async def pause_recurrence(
        self,
        rule_id: str,
        tenant_id: str,
        user_id: str
    ) -> Optional[Dict[str, Any]]:
        """Pause a recurrence rule"""
        result = await self.db.tm_recurrence_rules.find_one_and_update(
            {"id": rule_id, "tenant_id": tenant_id, "is_active": True},
            {
                "$set": {
                    "is_paused": True,
                    "paused_at": datetime.now(timezone.utc),
                    "paused_by": user_id,
                    "updated_at": datetime.now(timezone.utc)
                }
            },
            return_document=True
        )
        
        if result:
            await self._log_recurrence_activity(
                tenant_id=tenant_id,
                rule_id=rule_id,
                activity_type="rule_paused",
                description="Recurrence rule paused",
                user_id=user_id
            )
            result.pop("_id", None)
        
        return result
    
    async def resume_recurrence(
        self,
        rule_id: str,
        tenant_id: str,
        user_id: str
    ) -> Optional[Dict[str, Any]]:
        """Resume a paused recurrence rule"""
        existing = await self.db.tm_recurrence_rules.find_one(
            {"id": rule_id, "tenant_id": tenant_id, "is_active": True}
        )
        
        if not existing:
            return None
        
        # Recalculate next run from now
        next_run = self._calculate_next_run(
            start_date=datetime.now(timezone.utc),
            recurrence_type=existing["recurrence_type"],
            time_of_day=existing.get("time_of_day", "09:00"),
            timezone_str=existing.get("timezone", "UTC"),
            weekly_days=existing.get("weekly_days"),
            monthly_day=existing.get("monthly_day"),
            custom_interval_days=existing.get("custom_interval_days")
        )
        
        result = await self.db.tm_recurrence_rules.find_one_and_update(
            {"id": rule_id, "tenant_id": tenant_id},
            {
                "$set": {
                    "is_paused": False,
                    "paused_at": None,
                    "paused_by": None,
                    "next_run_at": next_run,
                    "updated_at": datetime.now(timezone.utc)
                }
            },
            return_document=True
        )
        
        if result:
            await self._log_recurrence_activity(
                tenant_id=tenant_id,
                rule_id=rule_id,
                activity_type="rule_resumed",
                description="Recurrence rule resumed",
                user_id=user_id
            )
            result.pop("_id", None)
        
        return result
    
    async def get_task_recurrence(
        self,
        task_id: str,
        tenant_id: str
    ) -> Optional[Dict[str, Any]]:
        """Get recurrence rule for a task (if it was generated from recurrence)"""
        task = await self.db.tm_tasks.find_one(
            {"id": task_id, "tenant_id": tenant_id},
            {"_id": 0, "recurrence_rule_id": 1}
        )
        
        if not task or not task.get("recurrence_rule_id"):
            return None
        
        rule = await self.get_recurrence_rule(task["recurrence_rule_id"], tenant_id)
        return rule
    
    async def set_task_recurrence(
        self,
        task_id: str,
        tenant_id: str,
        user_id: str,
        recurrence_config: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Create a recurrence rule from an existing task"""
        task = await self.db.tm_tasks.find_one(
            {"id": task_id, "tenant_id": tenant_id, "is_active": True}
        )
        
        if not task:
            raise ValueError("Task not found")
        
        rule = await self.create_recurrence_rule(
            tenant_id=tenant_id,
            created_by=user_id,
            project_id=task["project_id"],
            name=recurrence_config.get("name", f"Recurring: {task.get('title', 'Task')}"),
            recurrence_type=recurrence_config["recurrence_type"],
            start_date=recurrence_config.get("start_date", datetime.now(timezone.utc)),
            source_task_id=task_id,
            end_date=recurrence_config.get("end_date"),
            time_of_day=recurrence_config.get("time_of_day", "09:00"),
            timezone_str=recurrence_config.get("timezone", "UTC"),
            weekly_days=recurrence_config.get("weekly_days"),
            monthly_day=recurrence_config.get("monthly_day"),
            custom_interval_days=recurrence_config.get("custom_interval_days"),
            title_pattern=recurrence_config.get("title_pattern"),
            description=recurrence_config.get("description")
        )
        
        # Link task to rule
        await self.db.tm_tasks.update_one(
            {"id": task_id},
            {"$set": {"recurrence_rule_id": rule["id"], "is_recurring_source": True}}
        )
        
        return rule
    
    async def generate_recurring_task(
        self,
        rule: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """Generate a new task from a recurrence rule"""
        from ..services.sla_service import SLAService
        from ..services.validation_service import ValidationService
        
        tenant_id = rule["tenant_id"]
        now = datetime.now(timezone.utc)
        
        # Check for duplicate (idempotency)
        existing = await self.db.tm_tasks.find_one({
            "recurrence_rule_id": rule["id"],
            "recurrence_run_date": rule["next_run_at"].strftime("%Y-%m-%d") if rule.get("next_run_at") else now.strftime("%Y-%m-%d")
        })
        
        if existing:
            logger.warning(f"Duplicate task generation prevented for rule {rule['id']}")
            return None
        
        # Get task template data from source task or template
        task_data = {}
        
        if rule.get("source_task_id"):
            source = await self.db.tm_tasks.find_one(
                {"id": rule["source_task_id"], "tenant_id": tenant_id},
                {"_id": 0}
            )
            if source:
                task_data = {
                    "title": source.get("title", ""),
                    "description": source.get("description"),
                    "priority": source.get("priority", "medium"),
                    "task_type": source.get("task_type", "other"),
                    "assignee_id": source.get("assignee_id"),
                    "tags": source.get("tags", []),
                    "custom_fields": source.get("custom_fields", {}),
                }
                
                # Copy checklist items
                checklist_items = await self.db.tm_checklists.find(
                    {"task_id": rule["source_task_id"], "tenant_id": tenant_id},
                    {"_id": 0, "title": 1, "order_index": 1}
                ).to_list(50)
        
        elif rule.get("template_id"):
            template = await self.db.tm_task_templates.find_one(
                {"id": rule["template_id"], "tenant_id": tenant_id},
                {"_id": 0}
            )
            if template:
                task_data = {
                    "title": template.get("default_title", ""),
                    "description": template.get("default_description"),
                    "priority": template.get("default_priority", "medium"),
                    "task_type": template.get("default_task_type", "other"),
                    "assignee_id": template.get("default_assignee_id"),
                    "tags": template.get("default_tags", []),
                    "custom_fields": template.get("custom_field_values", {}),
                }
                checklist_items = template.get("checklist_items", [])
        else:
            logger.error(f"Rule {rule['id']} has no source task or template")
            return None
        
        # Apply title pattern if specified
        title = task_data.get("title", "Recurring Task")
        if rule.get("title_pattern"):
            title = rule["title_pattern"].format(
                title=title,
                date=now.strftime("%Y-%m-%d"),
                week=now.strftime("%W"),
                month=now.strftime("%B"),
                year=now.strftime("%Y")
            )
        
        # Calculate due date based on recurrence
        due_date = self._calculate_due_date(rule)
        
        # Create the task
        task_id = str(uuid.uuid4())
        new_task = {
            "id": task_id,
            "tenant_id": tenant_id,
            "project_id": rule["project_id"],
            "title": title,
            "description": task_data.get("description"),
            "status": "todo",
            "priority": task_data.get("priority", "medium"),
            "task_type": task_data.get("task_type", "other"),
            "assignee_id": task_data.get("assignee_id"),
            "tags": task_data.get("tags", []),
            "custom_fields": task_data.get("custom_fields", {}),
            "due_date": due_date,
            "recurrence_rule_id": rule["id"],
            "recurrence_run_date": now.strftime("%Y-%m-%d"),
            "is_recurring_generated": True,
            "created_by": "recurrence_system",
            "created_at": now,
            "updated_at": now,
            "is_active": True,
            "subtask_count": 0,
            "completed_subtask_count": 0,
            "checklist_count": 0,
            "completed_checklist_count": 0,
            "is_blocked": False,
            "order_index": 0
        }
        
        # Apply SLA rules
        try:
            sla_service = SLAService(self.db)
            sla_fields = await sla_service.initialize_sla(new_task, tenant_id, "creation")
            if sla_fields:
                new_task.update(sla_fields)
        except Exception as e:
            logger.error(f"SLA initialization failed for recurring task: {e}")
        
        # Validate task
        try:
            validation_service = ValidationService(self.db)
            is_valid, errors = await validation_service.validate_task(
                new_task, new_task.get("custom_fields", {}),
                tenant_id, rule["project_id"]
            )
            if not is_valid:
                logger.warning(f"Validation failed for recurring task: {errors}")
                await self._log_recurrence_activity(
                    tenant_id=tenant_id,
                    rule_id=rule["id"],
                    task_id=task_id,
                    activity_type="generation_failed",
                    description=f"Validation failed: {'; '.join(errors[:3])}",
                    details={"errors": errors}
                )
                # Continue anyway - don't block future runs
        except Exception as e:
            logger.error(f"Validation error: {e}")
        
        # Insert task
        await self.db.tm_tasks.insert_one(new_task)
        
        # Create checklist items
        if checklist_items:
            for idx, item in enumerate(checklist_items):
                checklist_data = {
                    "id": str(uuid.uuid4()),
                    "tenant_id": tenant_id,
                    "task_id": task_id,
                    "title": item.get("title", ""),
                    "is_completed": False,
                    "order_index": item.get("order_index", idx),
                    "created_by": "recurrence_system",
                    "created_at": now,
                    "updated_at": now
                }
                await self.db.tm_checklists.insert_one(checklist_data)
            
            new_task["checklist_count"] = len(checklist_items)
            await self.db.tm_tasks.update_one(
                {"id": task_id},
                {"$set": {"checklist_count": len(checklist_items)}}
            )
        
        # Log activity
        await self._log_recurrence_activity(
            tenant_id=tenant_id,
            rule_id=rule["id"],
            task_id=task_id,
            activity_type="task_generated",
            description=f"Generated recurring task: {title}",
            details={"due_date": str(due_date) if due_date else None}
        )
        
        new_task.pop("_id", None)
        return new_task
    
    async def process_due_recurrences(self) -> Dict[str, Any]:
        """Process all recurrence rules that are due to run"""
        now = datetime.now(timezone.utc)
        
        results = {
            "processed": 0,
            "success": 0,
            "failed": 0,
            "skipped": 0,
            "details": []
        }
        
        # Find all due rules
        due_rules = await self.db.tm_recurrence_rules.find({
            "is_active": True,
            "is_paused": False,
            "next_run_at": {"$lte": now},
            "$or": [
                {"end_date": None},
                {"end_date": {"$gte": now}}
            ]
        }).to_list(100)
        
        for rule in due_rules:
            results["processed"] += 1
            
            try:
                # Generate task
                task = await self.generate_recurring_task(rule)
                
                if task:
                    # Update rule
                    next_run = self._calculate_next_run(
                        start_date=now,
                        recurrence_type=rule["recurrence_type"],
                        time_of_day=rule.get("time_of_day", "09:00"),
                        timezone_str=rule.get("timezone", "UTC"),
                        weekly_days=rule.get("weekly_days"),
                        monthly_day=rule.get("monthly_day"),
                        custom_interval_days=rule.get("custom_interval_days")
                    )
                    
                    await self.db.tm_recurrence_rules.update_one(
                        {"id": rule["id"]},
                        {
                            "$set": {
                                "last_run_at": now,
                                "next_run_at": next_run,
                                "updated_at": now
                            },
                            "$inc": {"run_count": 1}
                        }
                    )
                    
                    results["success"] += 1
                    results["details"].append({
                        "rule_id": rule["id"],
                        "status": "success",
                        "task_id": task["id"]
                    })
                else:
                    results["skipped"] += 1
                    results["details"].append({
                        "rule_id": rule["id"],
                        "status": "skipped",
                        "reason": "duplicate or no source"
                    })
                    
            except Exception as e:
                logger.error(f"Failed to process recurrence rule {rule['id']}: {e}")
                
                # Update failure count but continue
                await self.db.tm_recurrence_rules.update_one(
                    {"id": rule["id"]},
                    {
                        "$inc": {"failure_count": 1},
                        "$set": {"last_failure_at": now, "last_failure_reason": str(e)}
                    }
                )
                
                results["failed"] += 1
                results["details"].append({
                    "rule_id": rule["id"],
                    "status": "failed",
                    "error": str(e)
                })
        
        return results
    
    def _calculate_next_run(
        self,
        start_date: datetime,
        recurrence_type: str,
        time_of_day: str = "09:00",
        timezone_str: str = "UTC",
        weekly_days: Optional[List[str]] = None,
        monthly_day: Optional[int] = None,
        custom_interval_days: Optional[int] = None
    ) -> datetime:
        """Calculate the next run datetime"""
        try:
            tz = pytz.timezone(timezone_str)
        except Exception:
            tz = pytz.UTC
        
        # Parse time of day
        try:
            hour, minute = map(int, time_of_day.split(":"))
        except Exception:
            hour, minute = 9, 0
        
        # Start from now
        now = datetime.now(tz)
        
        if recurrence_type == "daily":
            # Next occurrence at specified time
            next_run = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
            if next_run <= now:
                next_run += timedelta(days=1)
        
        elif recurrence_type == "weekly":
            # Find next matching weekday
            target_days = [self.WEEKDAY_MAP.get(d.lower(), 0) for d in (weekly_days or ["monday"])]
            next_run = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
            
            days_ahead = 0
            while True:
                check_date = next_run + timedelta(days=days_ahead)
                if check_date.weekday() in target_days and check_date > now:
                    next_run = check_date
                    break
                days_ahead += 1
                if days_ahead > 7:
                    next_run = now + timedelta(days=1)
                    break
        
        elif recurrence_type == "monthly":
            day = monthly_day or 1
            next_run = now.replace(day=min(day, 28), hour=hour, minute=minute, second=0, microsecond=0)
            if next_run <= now:
                next_run += relativedelta(months=1)
        
        elif recurrence_type == "custom":
            interval = custom_interval_days or 1
            next_run = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
            if next_run <= now:
                next_run += timedelta(days=interval)
        
        else:
            next_run = now + timedelta(days=1)
        
        # Convert to UTC
        return next_run.astimezone(pytz.UTC).replace(tzinfo=timezone.utc)
    
    def _calculate_due_date(self, rule: Dict[str, Any]) -> Optional[datetime]:
        """Calculate due date for generated task"""
        now = datetime.now(timezone.utc)
        
        if rule["recurrence_type"] == "daily":
            return now + timedelta(days=1)
        elif rule["recurrence_type"] == "weekly":
            return now + timedelta(days=7)
        elif rule["recurrence_type"] == "monthly":
            return now + relativedelta(months=1)
        elif rule["recurrence_type"] == "custom":
            interval = rule.get("custom_interval_days", 1)
            return now + timedelta(days=interval)
        
        return None
    
    async def _log_recurrence_activity(
        self,
        tenant_id: str,
        rule_id: str,
        activity_type: str,
        description: str,
        user_id: str = None,
        task_id: str = None,
        details: Dict[str, Any] = None
    ):
        """Log recurrence activity for audit trail"""
        activity = {
            "id": str(uuid.uuid4()),
            "tenant_id": tenant_id,
            "rule_id": rule_id,
            "task_id": task_id,
            "activity_type": activity_type,
            "description": description,
            "user_id": user_id or "system",
            "details": details or {},
            "created_at": datetime.now(timezone.utc)
        }
        
        await self.db.tm_recurrence_logs.insert_one(activity)
        
        # Also log to task activity if task_id provided
        if task_id:
            await self.db.tm_activity_logs.insert_one({
                "id": str(uuid.uuid4()),
                "tenant_id": tenant_id,
                "task_id": task_id,
                "activity_type": f"recurrence_{activity_type}",
                "description": description,
                "details": {"rule_id": rule_id, **(details or {})},
                "created_by": user_id or "recurrence_system",
                "created_at": datetime.now(timezone.utc)
            })
