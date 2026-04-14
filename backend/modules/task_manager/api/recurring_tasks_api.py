"""
Task Manager Recurring Tasks API Router - Phase 14
Handles CRUD operations for recurrence rules and task generation
"""
from fastapi import APIRouter, HTTPException, Depends, Query, BackgroundTasks
from typing import Optional, Dict, Any, List
from datetime import datetime, timezone
from pydantic import BaseModel
import uuid
import logging

from motor.motor_asyncio import AsyncIOMotorClient
import os

from server import get_current_user
from shared.models import User

from ..services.recurring_tasks_service import RecurringTasksService

logger = logging.getLogger(__name__)

# Database connection
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "crm_platform")
client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

# Initialize service
recurring_tasks_service = RecurringTasksService(db)

# Create router
recurring_tasks_router = APIRouter(prefix="/api/task-manager", tags=["task-manager-recurring"])


# ============================================================================
# REQUEST/RESPONSE MODELS
# ============================================================================

class CreateRecurrenceRuleRequest(BaseModel):
    name: str
    project_id: str
    recurrence_type: str  # daily, weekly, monthly, custom
    start_date: datetime
    source_task_id: Optional[str] = None
    template_id: Optional[str] = None
    end_date: Optional[datetime] = None
    time_of_day: str = "09:00"
    timezone: str = "UTC"
    weekly_days: Optional[List[str]] = None  # ["monday", "wednesday", "friday"]
    monthly_day: Optional[int] = None  # 1-31
    custom_interval_days: Optional[int] = None
    title_pattern: Optional[str] = None  # e.g. "{title} - {date}"
    description: Optional[str] = None


class UpdateRecurrenceRuleRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    end_date: Optional[datetime] = None
    time_of_day: Optional[str] = None
    timezone: Optional[str] = None
    weekly_days: Optional[List[str]] = None
    monthly_day: Optional[int] = None
    custom_interval_days: Optional[int] = None
    title_pattern: Optional[str] = None


class SetTaskRecurrenceRequest(BaseModel):
    recurrence_type: str
    name: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    time_of_day: str = "09:00"
    timezone: str = "UTC"
    weekly_days: Optional[List[str]] = None
    monthly_day: Optional[int] = None
    custom_interval_days: Optional[int] = None
    title_pattern: Optional[str] = None
    description: Optional[str] = None


# ============================================================================
# RECURRENCE RULE ENDPOINTS
# ============================================================================

@recurring_tasks_router.get("/recurring-tasks/rules")
async def list_recurrence_rules(
    current_user: User = Depends(get_current_user),
    project_id: Optional[str] = Query(None),
    include_paused: bool = Query(True)
):
    """List all recurrence rules for the tenant"""
    rules = await recurring_tasks_service.list_recurrence_rules(
        tenant_id=current_user.tenant_id,
        project_id=project_id,
        include_paused=include_paused
    )
    return {"rules": rules, "total": len(rules)}


@recurring_tasks_router.get("/recurring-tasks/rules/{rule_id}")
async def get_recurrence_rule(
    rule_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get a specific recurrence rule with generated task history"""
    rule = await recurring_tasks_service.get_recurrence_rule(
        rule_id=rule_id,
        tenant_id=current_user.tenant_id
    )
    
    if not rule:
        raise HTTPException(status_code=404, detail="Recurrence rule not found")
    
    return rule


@recurring_tasks_router.post("/recurring-tasks/rules")
async def create_recurrence_rule(
    request: CreateRecurrenceRuleRequest,
    current_user: User = Depends(get_current_user)
):
    """Create a new recurrence rule"""
    try:
        rule = await recurring_tasks_service.create_recurrence_rule(
            tenant_id=current_user.tenant_id,
            created_by=current_user.id,
            project_id=request.project_id,
            name=request.name,
            recurrence_type=request.recurrence_type,
            start_date=request.start_date,
            source_task_id=request.source_task_id,
            template_id=request.template_id,
            end_date=request.end_date,
            time_of_day=request.time_of_day,
            timezone_str=request.timezone,
            weekly_days=request.weekly_days,
            monthly_day=request.monthly_day,
            custom_interval_days=request.custom_interval_days,
            title_pattern=request.title_pattern,
            description=request.description
        )
        return rule
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@recurring_tasks_router.put("/recurring-tasks/rules/{rule_id}")
async def update_recurrence_rule(
    rule_id: str,
    request: UpdateRecurrenceRuleRequest,
    current_user: User = Depends(get_current_user)
):
    """Update a recurrence rule (affects future runs only)"""
    updates = {k: v for k, v in request.model_dump().items() if v is not None}
    
    rule = await recurring_tasks_service.update_recurrence_rule(
        rule_id=rule_id,
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        updates=updates
    )
    
    if not rule:
        raise HTTPException(status_code=404, detail="Recurrence rule not found")
    
    return rule


@recurring_tasks_router.delete("/recurring-tasks/rules/{rule_id}")
async def delete_recurrence_rule(
    rule_id: str,
    current_user: User = Depends(get_current_user)
):
    """Delete a recurrence rule (does not affect past generated tasks)"""
    success = await recurring_tasks_service.delete_recurrence_rule(
        rule_id=rule_id,
        tenant_id=current_user.tenant_id,
        user_id=current_user.id
    )
    
    if not success:
        raise HTTPException(status_code=404, detail="Recurrence rule not found")
    
    return {"message": "Recurrence rule deleted successfully"}


@recurring_tasks_router.post("/recurring-tasks/rules/{rule_id}/pause")
async def pause_recurrence_rule(
    rule_id: str,
    current_user: User = Depends(get_current_user)
):
    """Pause a recurrence rule"""
    rule = await recurring_tasks_service.pause_recurrence(
        rule_id=rule_id,
        tenant_id=current_user.tenant_id,
        user_id=current_user.id
    )
    
    if not rule:
        raise HTTPException(status_code=404, detail="Recurrence rule not found")
    
    return rule


@recurring_tasks_router.post("/recurring-tasks/rules/{rule_id}/resume")
async def resume_recurrence_rule(
    rule_id: str,
    current_user: User = Depends(get_current_user)
):
    """Resume a paused recurrence rule"""
    rule = await recurring_tasks_service.resume_recurrence(
        rule_id=rule_id,
        tenant_id=current_user.tenant_id,
        user_id=current_user.id
    )
    
    if not rule:
        raise HTTPException(status_code=404, detail="Recurrence rule not found")
    
    return rule


# ============================================================================
# TASK-BASED RECURRENCE ENDPOINTS
# ============================================================================

@recurring_tasks_router.get("/tasks/{task_id}/recurrence")
async def get_task_recurrence(
    task_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get recurrence rule for a task"""
    rule = await recurring_tasks_service.get_task_recurrence(
        task_id=task_id,
        tenant_id=current_user.tenant_id
    )
    
    return {"recurrence": rule}


@recurring_tasks_router.post("/tasks/{task_id}/recurrence")
async def set_task_recurrence(
    task_id: str,
    request: SetTaskRecurrenceRequest,
    current_user: User = Depends(get_current_user)
):
    """Set recurrence for an existing task"""
    try:
        rule = await recurring_tasks_service.set_task_recurrence(
            task_id=task_id,
            tenant_id=current_user.tenant_id,
            user_id=current_user.id,
            recurrence_config=request.model_dump()
        )
        return rule
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@recurring_tasks_router.delete("/tasks/{task_id}/recurrence")
async def remove_task_recurrence(
    task_id: str,
    current_user: User = Depends(get_current_user)
):
    """Remove recurrence from a task (deletes the rule)"""
    # Get the task's recurrence rule
    rule = await recurring_tasks_service.get_task_recurrence(
        task_id=task_id,
        tenant_id=current_user.tenant_id
    )
    
    if not rule:
        raise HTTPException(status_code=404, detail="Task has no recurrence rule")
    
    # Delete the rule
    success = await recurring_tasks_service.delete_recurrence_rule(
        rule_id=rule["id"],
        tenant_id=current_user.tenant_id,
        user_id=current_user.id
    )
    
    if not success:
        raise HTTPException(status_code=500, detail="Failed to remove recurrence")
    
    # Unlink task
    await db.tm_tasks.update_one(
        {"id": task_id},
        {"$unset": {"recurrence_rule_id": "", "is_recurring_source": ""}}
    )
    
    return {"message": "Recurrence removed from task"}


# ============================================================================
# SCHEDULER / PROCESS ENDPOINTS
# ============================================================================

@recurring_tasks_router.post("/recurring-tasks/process")
async def process_due_recurrences(
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user)
):
    """
    Manually trigger processing of due recurrence rules.
    In production, this should be called by a scheduler/cron job.
    """
    # Run in background to not block response
    results = await recurring_tasks_service.process_due_recurrences()
    
    return {
        "message": "Recurrence processing completed",
        "results": results
    }


@recurring_tasks_router.post("/recurring-tasks/rules/{rule_id}/run-now")
async def run_recurrence_now(
    rule_id: str,
    current_user: User = Depends(get_current_user)
):
    """Manually generate a task from a recurrence rule right now"""
    rule = await db.tm_recurrence_rules.find_one(
        {"id": rule_id, "tenant_id": current_user.tenant_id, "is_active": True}
    )
    
    if not rule:
        raise HTTPException(status_code=404, detail="Recurrence rule not found")
    
    try:
        task = await recurring_tasks_service.generate_recurring_task(rule)
        
        if task:
            # Update rule's last run time
            now = datetime.now(timezone.utc)
            next_run = recurring_tasks_service._calculate_next_run(
                start_date=now,
                recurrence_type=rule["recurrence_type"],
                time_of_day=rule.get("time_of_day", "09:00"),
                timezone_str=rule.get("timezone", "UTC"),
                weekly_days=rule.get("weekly_days"),
                monthly_day=rule.get("monthly_day"),
                custom_interval_days=rule.get("custom_interval_days")
            )
            
            await db.tm_recurrence_rules.update_one(
                {"id": rule_id},
                {
                    "$set": {
                        "last_run_at": now,
                        "next_run_at": next_run,
                        "updated_at": now
                    },
                    "$inc": {"run_count": 1}
                }
            )
            
            return {"message": "Task generated successfully", "task": task}
        else:
            return {"message": "Task generation skipped (duplicate prevention)"}
    except Exception as e:
        logger.error(f"Failed to run recurrence: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# ACTIVITY/LOGS ENDPOINTS
# ============================================================================

@recurring_tasks_router.get("/recurring-tasks/rules/{rule_id}/logs")
async def get_recurrence_logs(
    rule_id: str,
    current_user: User = Depends(get_current_user),
    limit: int = Query(50, le=100)
):
    """Get activity logs for a recurrence rule"""
    logs = await db.tm_recurrence_logs.find(
        {"rule_id": rule_id, "tenant_id": current_user.tenant_id},
        {"_id": 0}
    ).sort("created_at", -1).limit(limit).to_list(limit)
    
    return {"logs": logs, "total": len(logs)}


# ============================================================================
# STATS ENDPOINT
# ============================================================================

@recurring_tasks_router.get("/recurring-tasks/stats")
async def get_recurring_tasks_stats(
    current_user: User = Depends(get_current_user)
):
    """Get statistics about recurring tasks"""
    tenant_id = current_user.tenant_id
    
    # Count active rules
    active_rules = await db.tm_recurrence_rules.count_documents({
        "tenant_id": tenant_id,
        "is_active": True,
        "is_paused": False
    })
    
    # Count paused rules
    paused_rules = await db.tm_recurrence_rules.count_documents({
        "tenant_id": tenant_id,
        "is_active": True,
        "is_paused": True
    })
    
    # Count total generated tasks
    generated_tasks = await db.tm_tasks.count_documents({
        "tenant_id": tenant_id,
        "is_recurring_generated": True
    })
    
    # Rules due in next 24 hours
    from datetime import timedelta
    now = datetime.now(timezone.utc)
    upcoming_due = await db.tm_recurrence_rules.count_documents({
        "tenant_id": tenant_id,
        "is_active": True,
        "is_paused": False,
        "next_run_at": {"$lte": now + timedelta(hours=24)}
    })
    
    # Rules by type
    pipeline = [
        {"$match": {"tenant_id": tenant_id, "is_active": True}},
        {"$group": {"_id": "$recurrence_type", "count": {"$sum": 1}}}
    ]
    by_type_result = await db.tm_recurrence_rules.aggregate(pipeline).to_list(10)
    by_type = {item["_id"]: item["count"] for item in by_type_result}
    
    return {
        "active_rules": active_rules,
        "paused_rules": paused_rules,
        "total_rules": active_rules + paused_rules,
        "generated_tasks": generated_tasks,
        "upcoming_due_24h": upcoming_due,
        "by_type": by_type
    }


# ============================================================================
# TEMPLATES FOR RECURRENCE
# ============================================================================

@recurring_tasks_router.get("/recurring-tasks/templates")
async def list_templates_for_recurrence(
    current_user: User = Depends(get_current_user),
    project_id: Optional[str] = None
):
    """List task templates available for recurrence rules"""
    query = {
        "tenant_id": current_user.tenant_id,
        "is_active": True
    }
    
    if project_id:
        query["$or"] = [
            {"scope": "global"},
            {"project_id": project_id}
        ]
    
    templates = await db.tm_task_templates.find(
        query,
        {"_id": 0, "id": 1, "name": 1, "description": 1, "default_title": 1, "scope": 1, "project_id": 1}
    ).sort("name", 1).to_list(100)
    
    return {"templates": templates}


@recurring_tasks_router.get("/recurring-tasks/source-tasks")
async def list_source_tasks_for_recurrence(
    current_user: User = Depends(get_current_user),
    project_id: str = Query(...)
):
    """List tasks available as source for recurrence rules"""
    tasks = await db.tm_tasks.find(
        {
            "tenant_id": current_user.tenant_id,
            "project_id": project_id,
            "is_active": True,
            "is_recurring_generated": {"$ne": True}  # Don't allow selecting generated tasks
        },
        {"_id": 0, "id": 1, "title": 1, "status": 1, "priority": 1}
    ).sort("title", 1).limit(100).to_list(100)
    
    return {"tasks": tasks}
