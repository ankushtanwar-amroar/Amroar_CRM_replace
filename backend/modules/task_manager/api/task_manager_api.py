"""
Task Manager API Router
Handles all task manager CRUD operations
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
from enum import Enum
import uuid
import logging

from motor.motor_asyncio import AsyncIOMotorClient
from config.settings import settings
import os

from ..models.schemas import (
    Workspace, WorkspaceCreate, WorkspaceUpdate,
    Space, SpaceCreate, SpaceUpdate,
    Project, ProjectCreate, ProjectUpdate,
    Epic, EpicCreate, EpicUpdate,
    Task, TaskCreate, TaskUpdate, TaskWithDetails,
    Subtask, SubtaskCreate, SubtaskUpdate,
    ChecklistItem, ChecklistItemCreate, ChecklistItemUpdate,
    TaskStatus, ProjectWithStats
)
from datetime import timedelta
from calendar import monthrange

logger = logging.getLogger(__name__)

# Database connection
mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
db_name = os.environ.get('DB_NAME', 'crm_database')
client = AsyncIOMotorClient(mongo_url)
db = client[db_name]

logger = logging.getLogger(__name__)

# Auth dependency - import from main server
import sys
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))))
from server import get_current_user
from shared.models import User
from shared.services.license_enforcement import require_module_license, ModuleKey

task_manager_router = APIRouter(prefix="/task-manager", tags=["Task Manager"])


# ============================================================================
# WORKSPACE ENDPOINTS
# ============================================================================

@task_manager_router.get("/workspaces", response_model=List[Workspace])
@require_module_license(ModuleKey.TASK_MANAGER)
async def list_workspaces(
    current_user: User = Depends(get_current_user),
    skip: int = 0,
    limit: int = 50
):
    """List all workspaces for the tenant"""
    workspaces = await db.tm_workspaces.find(
        {"tenant_id": current_user.tenant_id, "is_active": True},
        {"_id": 0}
    ).skip(skip).limit(limit).to_list(limit)
    return workspaces


@task_manager_router.post("/workspaces", response_model=Workspace)
@require_module_license(ModuleKey.TASK_MANAGER)
async def create_workspace(
    workspace: WorkspaceCreate,
    current_user: User = Depends(get_current_user)
):
    """Create a new workspace"""
    now = datetime.now(timezone.utc)
    workspace_data = {
        "id": str(uuid.uuid4()),
        "tenant_id": current_user.tenant_id,
        "created_by": current_user.id,
        "created_at": now,
        "updated_at": now,
        "is_active": True,
        **workspace.model_dump()
    }
    await db.tm_workspaces.insert_one(workspace_data)
    workspace_data.pop("_id", None)
    return workspace_data


@task_manager_router.get("/workspaces/{workspace_id}", response_model=Workspace)
async def get_workspace(
    workspace_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get a specific workspace"""
    workspace = await db.tm_workspaces.find_one(
        {"id": workspace_id, "tenant_id": current_user.tenant_id, "is_active": True},
        {"_id": 0}
    )
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")
    return workspace


@task_manager_router.put("/workspaces/{workspace_id}", response_model=Workspace)
async def update_workspace(
    workspace_id: str,
    update: WorkspaceUpdate,
    current_user: User = Depends(get_current_user)
):
    """Update a workspace"""
    update_data = {k: v for k, v in update.model_dump().items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc)
    
    result = await db.tm_workspaces.find_one_and_update(
        {"id": workspace_id, "tenant_id": current_user.tenant_id, "is_active": True},
        {"$set": update_data},
        return_document=True
    )
    if not result:
        raise HTTPException(status_code=404, detail="Workspace not found")
    result.pop("_id", None)
    return result


@task_manager_router.delete("/workspaces/{workspace_id}")
async def delete_workspace(
    workspace_id: str,
    current_user: User = Depends(get_current_user)
):
    """Soft delete a workspace"""
    result = await db.tm_workspaces.update_one(
        {"id": workspace_id, "tenant_id": current_user.tenant_id},
        {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc)}}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Workspace not found")
    return {"message": "Workspace deleted successfully"}


# ============================================================================
# SPACE ENDPOINTS
# ============================================================================

@task_manager_router.get("/spaces", response_model=List[Space])
async def list_spaces(
    current_user: User = Depends(get_current_user),
    workspace_id: Optional[str] = None,
    skip: int = 0,
    limit: int = 50
):
    """List all spaces"""
    query = {"tenant_id": current_user.tenant_id, "is_active": True}
    if workspace_id:
        query["workspace_id"] = workspace_id
    
    spaces = await db.tm_spaces.find(query, {"_id": 0}).skip(skip).limit(limit).to_list(limit)
    return spaces


@task_manager_router.post("/spaces", response_model=Space)
async def create_space(
    space: SpaceCreate,
    current_user: User = Depends(get_current_user)
):
    """Create a new space"""
    now = datetime.now(timezone.utc)
    space_data = {
        "id": str(uuid.uuid4()),
        "tenant_id": current_user.tenant_id,
        "created_by": current_user.id,
        "created_at": now,
        "updated_at": now,
        "is_active": True,
        **space.model_dump()
    }
    await db.tm_spaces.insert_one(space_data)
    space_data.pop("_id", None)
    return space_data


@task_manager_router.get("/spaces/{space_id}", response_model=Space)
async def get_space(
    space_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get a specific space"""
    space = await db.tm_spaces.find_one(
        {"id": space_id, "tenant_id": current_user.tenant_id, "is_active": True},
        {"_id": 0}
    )
    if not space:
        raise HTTPException(status_code=404, detail="Space not found")
    return space


@task_manager_router.put("/spaces/{space_id}", response_model=Space)
async def update_space(
    space_id: str,
    update: SpaceUpdate,
    current_user: User = Depends(get_current_user)
):
    """Update a space"""
    update_data = {k: v for k, v in update.model_dump().items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc)
    
    result = await db.tm_spaces.find_one_and_update(
        {"id": space_id, "tenant_id": current_user.tenant_id, "is_active": True},
        {"$set": update_data},
        return_document=True
    )
    if not result:
        raise HTTPException(status_code=404, detail="Space not found")
    result.pop("_id", None)
    return result


@task_manager_router.delete("/spaces/{space_id}")
async def delete_space(
    space_id: str,
    current_user: User = Depends(get_current_user)
):
    """Soft delete a space"""
    result = await db.tm_spaces.update_one(
        {"id": space_id, "tenant_id": current_user.tenant_id},
        {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc)}}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Space not found")
    return {"message": "Space deleted successfully"}


# ============================================================================
# PROJECT ENDPOINTS
# ============================================================================

@task_manager_router.get("/projects", response_model=List[Project])
async def list_projects(
    current_user: User = Depends(get_current_user),
    space_id: Optional[str] = None,
    is_archived: bool = False,
    skip: int = 0,
    limit: int = 50
):
    """List all projects"""
    query = {
        "tenant_id": current_user.tenant_id,
        "is_active": True,
        "is_archived": is_archived
    }
    if space_id:
        query["space_id"] = space_id
    
    projects = await db.tm_projects.find(query, {"_id": 0}).skip(skip).limit(limit).to_list(limit)
    
    # Add task counts
    for project in projects:
        task_count = await db.tm_tasks.count_documents({
            "project_id": project["id"],
            "tenant_id": current_user.tenant_id,
            "is_active": True
        })
        completed_count = await db.tm_tasks.count_documents({
            "project_id": project["id"],
            "tenant_id": current_user.tenant_id,
            "is_active": True,
            "status": TaskStatus.DONE.value
        })
        project["task_count"] = task_count
        project["completed_task_count"] = completed_count
    
    return projects


@task_manager_router.post("/projects", response_model=Project)
async def create_project(
    project: ProjectCreate,
    current_user: User = Depends(get_current_user)
):
    """Create a new project"""
    now = datetime.now(timezone.utc)
    project_data = {
        "id": str(uuid.uuid4()),
        "tenant_id": current_user.tenant_id,
        "created_by": current_user.id,
        "created_at": now,
        "updated_at": now,
        "is_active": True,
        "is_archived": False,
        "task_count": 0,
        "completed_task_count": 0,
        **project.model_dump()
    }
    
    # Set owner to creator if not specified
    if not project_data.get("owner_id"):
        project_data["owner_id"] = current_user.id
    
    await db.tm_projects.insert_one(project_data)
    project_data.pop("_id", None)
    return project_data


@task_manager_router.get("/projects/{project_id}", response_model=ProjectWithStats)
async def get_project(
    project_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get a specific project with stats"""
    project = await db.tm_projects.find_one(
        {"id": project_id, "tenant_id": current_user.tenant_id, "is_active": True},
        {"_id": 0}
    )
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Get task stats
    pipeline = [
        {"$match": {"project_id": project_id, "tenant_id": current_user.tenant_id, "is_active": True}},
        {"$group": {"_id": "$status", "count": {"$sum": 1}}}
    ]
    status_counts = await db.tm_tasks.aggregate(pipeline).to_list(10)
    tasks_by_status = {item["_id"]: item["count"] for item in status_counts}
    
    # Get overdue count
    overdue_count = await db.tm_tasks.count_documents({
        "project_id": project_id,
        "tenant_id": current_user.tenant_id,
        "is_active": True,
        "status": {"$ne": TaskStatus.DONE.value},
        "due_date": {"$lt": datetime.now(timezone.utc)}
    })
    
    # Get epics
    epics = await db.tm_epics.find(
        {"project_id": project_id, "tenant_id": current_user.tenant_id, "is_active": True},
        {"_id": 0}
    ).to_list(100)
    
    project["tasks_by_status"] = tasks_by_status
    project["overdue_count"] = overdue_count
    project["epics"] = epics
    project["task_count"] = sum(tasks_by_status.values())
    project["completed_task_count"] = tasks_by_status.get(TaskStatus.DONE.value, 0)
    
    return project


@task_manager_router.put("/projects/{project_id}", response_model=Project)
async def update_project(
    project_id: str,
    update: ProjectUpdate,
    current_user: User = Depends(get_current_user)
):
    """Update a project"""
    update_data = {k: v for k, v in update.model_dump().items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc)
    
    result = await db.tm_projects.find_one_and_update(
        {"id": project_id, "tenant_id": current_user.tenant_id, "is_active": True},
        {"$set": update_data},
        return_document=True
    )
    if not result:
        raise HTTPException(status_code=404, detail="Project not found")
    result.pop("_id", None)
    return result


@task_manager_router.delete("/projects/{project_id}")
async def delete_project(
    project_id: str,
    current_user: User = Depends(get_current_user)
):
    """Soft delete a project"""
    result = await db.tm_projects.update_one(
        {"id": project_id, "tenant_id": current_user.tenant_id},
        {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc)}}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Project not found")
    return {"message": "Project deleted successfully"}


# ============================================================================
# EPIC ENDPOINTS
# ============================================================================

@task_manager_router.get("/projects/{project_id}/epics", response_model=List[Epic])
async def list_epics(
    project_id: str,
    current_user: User = Depends(get_current_user)
):
    """List all epics in a project"""
    epics = await db.tm_epics.find(
        {"project_id": project_id, "tenant_id": current_user.tenant_id, "is_active": True},
        {"_id": 0}
    ).to_list(100)
    
    # Add task counts
    for epic in epics:
        task_count = await db.tm_tasks.count_documents({
            "epic_id": epic["id"],
            "tenant_id": current_user.tenant_id,
            "is_active": True
        })
        completed_count = await db.tm_tasks.count_documents({
            "epic_id": epic["id"],
            "tenant_id": current_user.tenant_id,
            "is_active": True,
            "status": TaskStatus.DONE.value
        })
        epic["task_count"] = task_count
        epic["completed_task_count"] = completed_count
    
    return epics


@task_manager_router.post("/epics", response_model=Epic)
async def create_epic(
    epic: EpicCreate,
    current_user: User = Depends(get_current_user)
):
    """Create a new epic"""
    now = datetime.now(timezone.utc)
    epic_data = {
        "id": str(uuid.uuid4()),
        "tenant_id": current_user.tenant_id,
        "created_by": current_user.id,
        "created_at": now,
        "updated_at": now,
        "is_active": True,
        "task_count": 0,
        "completed_task_count": 0,
        **epic.model_dump()
    }
    await db.tm_epics.insert_one(epic_data)
    epic_data.pop("_id", None)
    return epic_data


@task_manager_router.put("/epics/{epic_id}", response_model=Epic)
async def update_epic(
    epic_id: str,
    update: EpicUpdate,
    current_user: User = Depends(get_current_user)
):
    """Update an epic"""
    update_data = {k: v for k, v in update.model_dump().items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc)
    
    result = await db.tm_epics.find_one_and_update(
        {"id": epic_id, "tenant_id": current_user.tenant_id, "is_active": True},
        {"$set": update_data},
        return_document=True
    )
    if not result:
        raise HTTPException(status_code=404, detail="Epic not found")
    result.pop("_id", None)
    return result


@task_manager_router.delete("/epics/{epic_id}")
async def delete_epic(
    epic_id: str,
    current_user: User = Depends(get_current_user)
):
    """Soft delete an epic"""
    result = await db.tm_epics.update_one(
        {"id": epic_id, "tenant_id": current_user.tenant_id},
        {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc)}}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Epic not found")
    
    # Unlink tasks from this epic
    await db.tm_tasks.update_many(
        {"epic_id": epic_id, "tenant_id": current_user.tenant_id},
        {"$set": {"epic_id": None}}
    )
    
    return {"message": "Epic deleted successfully"}


# ============================================================================
# TASK ENDPOINTS
# ============================================================================

@task_manager_router.get("/tasks", response_model=List[Task])
async def list_tasks(
    current_user: User = Depends(get_current_user),
    project_id: Optional[str] = None,
    epic_id: Optional[str] = None,
    status: Optional[TaskStatus] = None,
    priority: Optional[str] = None,
    assignee_id: Optional[str] = None,
    my_tasks: bool = False,
    overdue: bool = False,
    skip: int = 0,
    limit: int = 100
):
    """List tasks with filters"""
    query = {"tenant_id": current_user.tenant_id, "is_active": True}
    
    if project_id:
        query["project_id"] = project_id
    if epic_id:
        query["epic_id"] = epic_id
    if status:
        query["status"] = status.value
    if priority:
        query["priority"] = priority
    if assignee_id:
        query["assignee_id"] = assignee_id
    if my_tasks:
        query["assignee_id"] = current_user.id
    if overdue:
        query["due_date"] = {"$lt": datetime.now(timezone.utc)}
        query["status"] = {"$ne": TaskStatus.DONE.value}
    
    tasks = await db.tm_tasks.find(query, {"_id": 0}).sort("order_index", 1).skip(skip).limit(limit).to_list(limit)
    
    # Check blocked status based on dependencies
    for task in tasks:
        if task.get("blocked_by"):
            # Check if any blocking task is not done
            blocking_tasks = await db.tm_tasks.find({
                "id": {"$in": task["blocked_by"]},
                "status": {"$ne": TaskStatus.DONE.value},
                "is_active": True
            }).to_list(100)
            task["is_blocked"] = len(blocking_tasks) > 0
        else:
            task["is_blocked"] = False
    
    return tasks


@task_manager_router.post("/tasks", response_model=Task)
async def create_task(
    task: TaskCreate,
    current_user: User = Depends(get_current_user)
):
    """Create a new task"""
    from ..services.sla_service import SLAService
    
    now = datetime.now(timezone.utc)
    
    # Get max order_index for the project
    max_order = await db.tm_tasks.find_one(
        {"project_id": task.project_id, "tenant_id": current_user.tenant_id},
        sort=[("order_index", -1)]
    )
    next_order = (max_order.get("order_index", 0) + 1) if max_order else 0
    
    task_data = {
        "id": str(uuid.uuid4()),
        "tenant_id": current_user.tenant_id,
        "created_by": current_user.id,
        "created_at": now,
        "updated_at": now,
        "is_active": True,
        "subtask_count": 0,
        "completed_subtask_count": 0,
        "checklist_count": 0,
        "completed_checklist_count": 0,
        "is_blocked": False,
        "order_index": next_order,
        **task.model_dump()
    }
    
    # Initialize SLA if configured for project
    sla_service = SLAService(db)
    sla_fields = await sla_service.initialize_sla(
        task_data, current_user.tenant_id, "creation"
    )
    if sla_fields:
        task_data.update(sla_fields)
    
    await db.tm_tasks.insert_one(task_data)
    task_data.pop("_id", None)
    return task_data


@task_manager_router.get("/tasks/{task_id}", response_model=TaskWithDetails)
async def get_task(
    task_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get a specific task with details"""
    task = await db.tm_tasks.find_one(
        {"id": task_id, "tenant_id": current_user.tenant_id, "is_active": True},
        {"_id": 0}
    )
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    # Get subtasks
    subtasks = await db.tm_subtasks.find(
        {"task_id": task_id, "tenant_id": current_user.tenant_id, "is_active": True},
        {"_id": 0}
    ).sort("order_index", 1).to_list(100)
    
    # Get checklist items
    checklist_items = await db.tm_checklists.find(
        {"task_id": task_id, "tenant_id": current_user.tenant_id},
        {"_id": 0}
    ).sort("order_index", 1).to_list(100)
    
    # Get assignee info
    assignee = None
    if task.get("assignee_id"):
        assignee = await db.users.find_one(
            {"id": task["assignee_id"]},
            {"_id": 0, "id": 1, "name": 1, "email": 1}
        )
    
    # Get project info
    project = await db.tm_projects.find_one(
        {"id": task["project_id"]},
        {"_id": 0, "id": 1, "name": 1, "color": 1}
    )
    
    # Get epic info
    epic = None
    if task.get("epic_id"):
        epic = await db.tm_epics.find_one(
            {"id": task["epic_id"]},
            {"_id": 0, "id": 1, "name": 1, "color": 1}
        )
    
    # Check blocked status
    task["is_blocked"] = False
    if task.get("blocked_by"):
        blocking_tasks = await db.tm_tasks.find({
            "id": {"$in": task["blocked_by"]},
            "status": {"$ne": TaskStatus.DONE.value},
            "is_active": True
        }).to_list(100)
        task["is_blocked"] = len(blocking_tasks) > 0
    
    task["subtasks"] = subtasks
    task["checklist_items"] = checklist_items
    task["assignee"] = assignee
    task["project"] = project
    task["epic"] = epic
    task["subtask_count"] = len(subtasks)
    task["completed_subtask_count"] = len([s for s in subtasks if s.get("status") == TaskStatus.DONE.value])
    task["checklist_count"] = len(checklist_items)
    task["completed_checklist_count"] = len([c for c in checklist_items if c.get("is_completed")])
    
    return task


@task_manager_router.put("/tasks/{task_id}", response_model=Task)
async def update_task(
    task_id: str,
    update: TaskUpdate,
    current_user: User = Depends(get_current_user)
):
    """Update a task"""
    from ..services.validation_service import ValidationService
    from ..services.formula_service import FormulaEvaluator
    from ..services.sla_service import SLAService
    from ..services.approval_service import ApprovalService
    from ..api.governance_api import send_approval_request_notification
    
    # Get existing task
    existing_task = await db.tm_tasks.find_one(
        {"id": task_id, "tenant_id": current_user.tenant_id, "is_active": True}
    )
    if not existing_task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    # Check if task is pending approval (read-only except comments)
    if existing_task.get("approval_status") == "pending":
        raise HTTPException(
            status_code=403,
            detail="Task is pending approval and cannot be modified"
        )
    
    update_data = {k: v for k, v in update.model_dump().items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc)
    update_data["updated_by"] = current_user.id
    
    # Build proposed task state
    proposed_task = {**existing_task, **update_data}
    custom_fields = proposed_task.get("custom_fields", {})
    
    # Calculate formula fields
    formula_eval = FormulaEvaluator(db)
    calculated_fields = await formula_eval.calculate_formula_fields(
        proposed_task, current_user.tenant_id
    )
    
    # Run validation rules
    validation_service = ValidationService(db)
    is_valid, errors = await validation_service.validate_task(
        proposed_task, calculated_fields, current_user.tenant_id, proposed_task.get("project_id")
    )
    
    if not is_valid:
        raise HTTPException(
            status_code=400,
            detail={
                "message": "Validation failed",
                "errors": errors
            }
        )
    
    # Handle SLA on status change
    old_status = existing_task.get("status", "")
    new_status = update_data.get("status", old_status)
    
    if old_status != new_status:
        sla_service = SLAService(db)
        sla_updates = await sla_service.handle_status_change(
            existing_task, old_status, new_status, current_user.tenant_id
        )
        if sla_updates:
            update_data.update(sla_updates)
        
        # Check for approval workflow trigger
        approval_service = ApprovalService(db)
        approval_instance = await approval_service.check_and_create_approval(
            {**existing_task, **update_data},
            new_status,
            current_user.tenant_id
        )
        
        if approval_instance:
            # Task requires approval - set pending status
            update_data["approval_status"] = "pending"
            update_data["approval_instance_id"] = approval_instance["id"]
            
            # Send notifications to approvers
            try:
                await send_approval_request_notification(
                    approval_instance,
                    {**existing_task, **update_data},
                    current_user.tenant_id
                )
            except Exception as e:
                logger.error(f"Failed to send approval notifications: {e}")
    
    # Update custom_fields with calculated values if there are formula fields
    if calculated_fields != custom_fields:
        update_data["custom_fields"] = calculated_fields
    
    result = await db.tm_tasks.find_one_and_update(
        {"id": task_id, "tenant_id": current_user.tenant_id, "is_active": True},
        {"$set": update_data},
        return_document=True
    )
    if not result:
        raise HTTPException(status_code=404, detail="Task not found")
    result.pop("_id", None)
    return result


@task_manager_router.delete("/tasks/{task_id}")
async def delete_task(
    task_id: str,
    current_user: User = Depends(get_current_user)
):
    """Soft delete a task"""
    result = await db.tm_tasks.update_one(
        {"id": task_id, "tenant_id": current_user.tenant_id},
        {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc)}}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Task not found")
    
    # Also soft delete subtasks
    await db.tm_subtasks.update_many(
        {"task_id": task_id, "tenant_id": current_user.tenant_id},
        {"$set": {"is_active": False}}
    )
    
    return {"message": "Task deleted successfully"}


@task_manager_router.post("/tasks/{task_id}/move")
async def move_task(
    task_id: str,
    new_status: TaskStatus,
    new_order: Optional[int] = None,
    current_user: User = Depends(get_current_user)
):
    """Move task to a new status (for board view drag-drop)"""
    update_data = {
        "status": new_status.value,
        "updated_at": datetime.now(timezone.utc)
    }
    if new_order is not None:
        update_data["order_index"] = new_order
    
    result = await db.tm_tasks.find_one_and_update(
        {"id": task_id, "tenant_id": current_user.tenant_id, "is_active": True},
        {"$set": update_data},
        return_document=True
    )
    if not result:
        raise HTTPException(status_code=404, detail="Task not found")
    result.pop("_id", None)
    return result


# ============================================================================
# SUBTASK ENDPOINTS
# ============================================================================

@task_manager_router.get("/tasks/{task_id}/subtasks", response_model=List[Subtask])
async def list_subtasks(
    task_id: str,
    current_user: User = Depends(get_current_user)
):
    """List all subtasks for a task"""
    subtasks = await db.tm_subtasks.find(
        {"task_id": task_id, "tenant_id": current_user.tenant_id, "is_active": True},
        {"_id": 0}
    ).sort("order_index", 1).to_list(100)
    return subtasks


@task_manager_router.post("/subtasks", response_model=Subtask)
async def create_subtask(
    subtask: SubtaskCreate,
    current_user: User = Depends(get_current_user)
):
    """Create a new subtask"""
    now = datetime.now(timezone.utc)
    
    # Get max order_index
    max_order = await db.tm_subtasks.find_one(
        {"task_id": subtask.task_id, "tenant_id": current_user.tenant_id},
        sort=[("order_index", -1)]
    )
    next_order = (max_order.get("order_index", 0) + 1) if max_order else 0
    
    subtask_data = {
        "id": str(uuid.uuid4()),
        "tenant_id": current_user.tenant_id,
        "created_by": current_user.id,
        "created_at": now,
        "updated_at": now,
        "is_active": True,
        "order_index": next_order,
        **subtask.model_dump()
    }
    
    await db.tm_subtasks.insert_one(subtask_data)
    subtask_data.pop("_id", None)
    
    # Update parent task counts
    await _update_task_subtask_counts(subtask.task_id, current_user.tenant_id)
    
    return subtask_data


@task_manager_router.put("/subtasks/{subtask_id}", response_model=Subtask)
async def update_subtask(
    subtask_id: str,
    update: SubtaskUpdate,
    current_user: User = Depends(get_current_user)
):
    """Update a subtask"""
    # Get current subtask to get task_id
    current_subtask = await db.tm_subtasks.find_one(
        {"id": subtask_id, "tenant_id": current_user.tenant_id}
    )
    if not current_subtask:
        raise HTTPException(status_code=404, detail="Subtask not found")
    
    update_data = {k: v for k, v in update.model_dump().items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc)
    
    result = await db.tm_subtasks.find_one_and_update(
        {"id": subtask_id, "tenant_id": current_user.tenant_id, "is_active": True},
        {"$set": update_data},
        return_document=True
    )
    if not result:
        raise HTTPException(status_code=404, detail="Subtask not found")
    result.pop("_id", None)
    
    # Update parent task counts if status changed
    if "status" in update_data:
        await _update_task_subtask_counts(current_subtask["task_id"], current_user.tenant_id)
    
    return result


@task_manager_router.delete("/subtasks/{subtask_id}")
async def delete_subtask(
    subtask_id: str,
    current_user: User = Depends(get_current_user)
):
    """Soft delete a subtask"""
    subtask = await db.tm_subtasks.find_one(
        {"id": subtask_id, "tenant_id": current_user.tenant_id}
    )
    if not subtask:
        raise HTTPException(status_code=404, detail="Subtask not found")
    
    await db.tm_subtasks.update_one(
        {"id": subtask_id},
        {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc)}}
    )
    
    # Update parent task counts
    await _update_task_subtask_counts(subtask["task_id"], current_user.tenant_id)
    
    return {"message": "Subtask deleted successfully"}


# ============================================================================
# CHECKLIST ENDPOINTS
# ============================================================================

@task_manager_router.get("/tasks/{task_id}/checklist", response_model=List[ChecklistItem])
async def list_checklist_items(
    task_id: str,
    current_user: User = Depends(get_current_user)
):
    """List all checklist items for a task"""
    items = await db.tm_checklists.find(
        {"task_id": task_id, "tenant_id": current_user.tenant_id},
        {"_id": 0}
    ).sort("order_index", 1).to_list(100)
    return items


@task_manager_router.post("/checklist", response_model=ChecklistItem)
async def create_checklist_item(
    item: ChecklistItemCreate,
    current_user: User = Depends(get_current_user)
):
    """Create a new checklist item"""
    now = datetime.now(timezone.utc)
    
    # Get max order_index
    max_order = await db.tm_checklists.find_one(
        {"task_id": item.task_id, "tenant_id": current_user.tenant_id},
        sort=[("order_index", -1)]
    )
    next_order = (max_order.get("order_index", 0) + 1) if max_order else 0
    
    item_data = {
        "id": str(uuid.uuid4()),
        "tenant_id": current_user.tenant_id,
        "created_by": current_user.id,
        "created_at": now,
        "updated_at": now,
        "order_index": next_order,
        **item.model_dump()
    }
    
    await db.tm_checklists.insert_one(item_data)
    item_data.pop("_id", None)
    
    # Update parent task counts
    await _update_task_checklist_counts(item.task_id, current_user.tenant_id)
    
    return item_data


@task_manager_router.put("/checklist/{item_id}", response_model=ChecklistItem)
async def update_checklist_item(
    item_id: str,
    update: ChecklistItemUpdate,
    current_user: User = Depends(get_current_user)
):
    """Update a checklist item"""
    current_item = await db.tm_checklists.find_one(
        {"id": item_id, "tenant_id": current_user.tenant_id}
    )
    if not current_item:
        raise HTTPException(status_code=404, detail="Checklist item not found")
    
    update_data = {k: v for k, v in update.model_dump().items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc)
    
    result = await db.tm_checklists.find_one_and_update(
        {"id": item_id, "tenant_id": current_user.tenant_id},
        {"$set": update_data},
        return_document=True
    )
    if not result:
        raise HTTPException(status_code=404, detail="Checklist item not found")
    result.pop("_id", None)
    
    # Update parent task counts if completion changed
    if "is_completed" in update_data:
        await _update_task_checklist_counts(current_item["task_id"], current_user.tenant_id)
    
    return result


@task_manager_router.delete("/checklist/{item_id}")
async def delete_checklist_item(
    item_id: str,
    current_user: User = Depends(get_current_user)
):
    """Delete a checklist item"""
    item = await db.tm_checklists.find_one(
        {"id": item_id, "tenant_id": current_user.tenant_id}
    )
    if not item:
        raise HTTPException(status_code=404, detail="Checklist item not found")
    
    await db.tm_checklists.delete_one({"id": item_id})
    
    # Update parent task counts
    await _update_task_checklist_counts(item["task_id"], current_user.tenant_id)
    
    return {"message": "Checklist item deleted successfully"}


# ============================================================================
# DASHBOARD / MY WORK ENDPOINTS
# ============================================================================

@task_manager_router.get("/my-work")
async def get_my_work(
    current_user: User = Depends(get_current_user)
):
    """Get dashboard data for current user"""
    now = datetime.now(timezone.utc)
    tenant_id = current_user.tenant_id
    user_id = current_user.id
    
    # My tasks today (due today or overdue)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    today_end = now.replace(hour=23, minute=59, second=59, microsecond=999999)
    
    my_today = await db.tm_tasks.count_documents({
        "tenant_id": tenant_id,
        "assignee_id": user_id,
        "is_active": True,
        "status": {"$ne": TaskStatus.DONE.value},
        "$or": [
            {"due_date": {"$gte": today_start, "$lte": today_end}},
            {"due_date": {"$lt": today_start}}
        ]
    })
    
    # Overdue tasks
    overdue = await db.tm_tasks.count_documents({
        "tenant_id": tenant_id,
        "assignee_id": user_id,
        "is_active": True,
        "status": {"$ne": TaskStatus.DONE.value},
        "due_date": {"$lt": now}
    })
    
    # Blocked tasks
    blocked = await db.tm_tasks.count_documents({
        "tenant_id": tenant_id,
        "assignee_id": user_id,
        "is_active": True,
        "status": TaskStatus.BLOCKED.value
    })
    
    # Assigned by me
    assigned_by_me = await db.tm_tasks.count_documents({
        "tenant_id": tenant_id,
        "created_by": user_id,
        "assignee_id": {"$ne": user_id, "$exists": True},
        "is_active": True,
        "status": {"$ne": TaskStatus.DONE.value}
    })
    
    # Recent projects
    recent_projects = await db.tm_projects.find(
        {"tenant_id": tenant_id, "is_active": True, "is_archived": False},
        {"_id": 0}
    ).sort("updated_at", -1).limit(5).to_list(5)
    
    return {
        "my_today": my_today,
        "overdue": overdue,
        "blocked": blocked,
        "assigned_by_me": assigned_by_me,
        "recent_projects": recent_projects
    }


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

async def _update_task_subtask_counts(task_id: str, tenant_id: str):
    """Update subtask counts on parent task"""
    total = await db.tm_subtasks.count_documents({
        "task_id": task_id,
        "tenant_id": tenant_id,
        "is_active": True
    })
    completed = await db.tm_subtasks.count_documents({
        "task_id": task_id,
        "tenant_id": tenant_id,
        "is_active": True,
        "status": TaskStatus.DONE.value
    })
    
    await db.tm_tasks.update_one(
        {"id": task_id},
        {"$set": {
            "subtask_count": total,
            "completed_subtask_count": completed,
            "updated_at": datetime.now(timezone.utc)
        }}
    )


async def _update_task_checklist_counts(task_id: str, tenant_id: str):
    """Update checklist counts on parent task"""
    total = await db.tm_checklists.count_documents({
        "task_id": task_id,
        "tenant_id": tenant_id
    })
    completed = await db.tm_checklists.count_documents({
        "task_id": task_id,
        "tenant_id": tenant_id,
        "is_completed": True
    })
    
    await db.tm_tasks.update_one(
        {"id": task_id},
        {"$set": {
            "checklist_count": total,
            "completed_checklist_count": completed,
            "updated_at": datetime.now(timezone.utc)
        }}
    )



# ============================================================================
# USERS ENDPOINT (for assignments)
# ============================================================================

@task_manager_router.get("/users")
async def list_users_for_assignment(
    current_user: User = Depends(get_current_user),
    search: Optional[str] = None
):
    """List users in tenant for task assignment"""
    query = {"tenant_id": current_user.tenant_id, "is_active": True}
    
    if search:
        query["$or"] = [
            {"first_name": {"$regex": search, "$options": "i"}},
            {"last_name": {"$regex": search, "$options": "i"}},
            {"email": {"$regex": search, "$options": "i"}}
        ]
    
    users = await db.users.find(
        query,
        {"_id": 0, "id": 1, "first_name": 1, "last_name": 1, "email": 1}
    ).limit(50).to_list(50)
    
    # Format for frontend
    return [
        {
            "id": u["id"],
            "name": f"{u.get('first_name', '')} {u.get('last_name', '')}".strip() or u.get('email', ''),
            "email": u.get("email", ""),
            "initials": (u.get("first_name", "")[:1] + u.get("last_name", "")[:1]).upper() or "?"
        }
        for u in users
    ]


# ============================================================================
# TIMELINE VIEW ENDPOINT
# ============================================================================

@task_manager_router.get("/timeline")
async def get_timeline_tasks(
    current_user: User = Depends(get_current_user),
    project_id: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    group_by: str = "status"
):
    """Get tasks formatted for timeline/Gantt view"""
    query = {
        "tenant_id": current_user.tenant_id,
        "is_active": True,
        "$or": [
            {"start_date": {"$exists": True, "$ne": None}},
            {"due_date": {"$exists": True, "$ne": None}}
        ]
    }
    
    if project_id:
        query["project_id"] = project_id
    
    # Parse date filters
    if start_date:
        try:
            start_dt = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
            query["$or"] = [
                {"due_date": {"$gte": start_dt}},
                {"start_date": {"$gte": start_dt}}
            ]
        except:
            pass
    
    if end_date:
        try:
            end_dt = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
            if "$or" not in query:
                query["$or"] = []
            query["$and"] = query.get("$and", [])
            query["$and"].append({
                "$or": [
                    {"start_date": {"$lte": end_dt}},
                    {"due_date": {"$lte": end_dt}}
                ]
            })
        except:
            pass
    
    tasks = await db.tm_tasks.find(query, {"_id": 0}).sort("start_date", 1).to_list(500)
    
    # Enrich tasks with assignee info
    for task in tasks:
        if task.get("assignee_id"):
            assignee = await db.users.find_one(
                {"id": task["assignee_id"]},
                {"_id": 0, "id": 1, "first_name": 1, "last_name": 1, "email": 1}
            )
            if assignee:
                task["assignee"] = {
                    "id": assignee["id"],
                    "name": f"{assignee.get('first_name', '')} {assignee.get('last_name', '')}".strip(),
                    "initials": (assignee.get("first_name", "")[:1] + assignee.get("last_name", "")[:1]).upper()
                }
        
        # Ensure dates are properly formatted
        if not task.get("start_date") and task.get("due_date"):
            # Default start_date to 3 days before due_date
            task["start_date"] = task["due_date"] - timedelta(days=3)
        elif not task.get("due_date") and task.get("start_date"):
            # Default due_date to 3 days after start_date
            task["due_date"] = task["start_date"] + timedelta(days=3)
    
    # Group by requested field
    if group_by == "status":
        grouped = {
            "todo": [t for t in tasks if t.get("status") == "todo"],
            "in_progress": [t for t in tasks if t.get("status") == "in_progress"],
            "blocked": [t for t in tasks if t.get("status") == "blocked"],
            "done": [t for t in tasks if t.get("status") == "done"]
        }
    elif group_by == "priority":
        grouped = {
            "urgent": [t for t in tasks if t.get("priority") == "urgent"],
            "high": [t for t in tasks if t.get("priority") == "high"],
            "medium": [t for t in tasks if t.get("priority") == "medium"],
            "low": [t for t in tasks if t.get("priority") == "low"]
        }
    elif group_by == "assignee":
        grouped = {}
        for task in tasks:
            key = task.get("assignee", {}).get("name", "Unassigned") if task.get("assignee") else "Unassigned"
            if key not in grouped:
                grouped[key] = []
            grouped[key].append(task)
    else:
        grouped = {"all": tasks}
    
    return {
        "tasks": tasks,
        "grouped": grouped,
        "total_count": len(tasks)
    }


# ============================================================================
# CALENDAR VIEW ENDPOINT
# ============================================================================

@task_manager_router.get("/calendar")
async def get_calendar_tasks(
    current_user: User = Depends(get_current_user),
    project_id: Optional[str] = None,
    year: int = Query(default=None),
    month: int = Query(default=None)
):
    """Get tasks formatted for calendar view"""
    now = datetime.now(timezone.utc)
    year = year or now.year
    month = month or now.month
    
    # Calculate month boundaries
    first_day = datetime(year, month, 1, tzinfo=timezone.utc)
    _, last_day_num = monthrange(year, month)
    last_day = datetime(year, month, last_day_num, 23, 59, 59, tzinfo=timezone.utc)
    
    # Include tasks from previous/next week for calendar padding
    start_date = first_day - timedelta(days=7)
    end_date = last_day + timedelta(days=7)
    
    query = {
        "tenant_id": current_user.tenant_id,
        "is_active": True,
        "due_date": {"$gte": start_date, "$lte": end_date}
    }
    
    if project_id:
        query["project_id"] = project_id
    
    tasks = await db.tm_tasks.find(query, {"_id": 0}).sort("due_date", 1).to_list(500)
    
    # Enrich tasks with assignee and project info
    for task in tasks:
        if task.get("assignee_id"):
            assignee = await db.users.find_one(
                {"id": task["assignee_id"]},
                {"_id": 0, "id": 1, "first_name": 1, "last_name": 1}
            )
            if assignee:
                task["assignee"] = {
                    "id": assignee["id"],
                    "name": f"{assignee.get('first_name', '')} {assignee.get('last_name', '')}".strip(),
                    "initials": (assignee.get("first_name", "")[:1] + assignee.get("last_name", "")[:1]).upper()
                }
        
        if task.get("project_id"):
            project = await db.tm_projects.find_one(
                {"id": task["project_id"]},
                {"_id": 0, "id": 1, "name": 1, "color": 1}
            )
            if project:
                task["project"] = project
    
    # Group by date
    tasks_by_date = {}
    for task in tasks:
        if task.get("due_date"):
            date_key = task["due_date"].strftime("%Y-%m-%d")
            if date_key not in tasks_by_date:
                tasks_by_date[date_key] = []
            tasks_by_date[date_key].append(task)
    
    return {
        "year": year,
        "month": month,
        "tasks": tasks,
        "tasks_by_date": tasks_by_date,
        "total_count": len(tasks)
    }


from pydantic import BaseModel as PydanticBaseModel

class AssignTaskRequest(PydanticBaseModel):
    assignee_id: Optional[str] = None

@task_manager_router.post("/tasks/{task_id}/assign")
async def assign_task(
    task_id: str,
    assignee_id: Optional[str] = Query(default=None),
    body: Optional[AssignTaskRequest] = None,
    current_user: User = Depends(get_current_user)
):
    """Assign or unassign a task to a user"""
    # Support both query param and body for assignee_id
    final_assignee_id = assignee_id
    if body and body.assignee_id is not None:
        final_assignee_id = body.assignee_id
    
    update_data = {
        "assignee_id": final_assignee_id,
        "updated_at": datetime.now(timezone.utc)
    }
    
    result = await db.tm_tasks.find_one_and_update(
        {"id": task_id, "tenant_id": current_user.tenant_id, "is_active": True},
        {"$set": update_data},
        return_document=True
    )
    
    if not result:
        raise HTTPException(status_code=404, detail="Task not found")
    
    result.pop("_id", None)
    
    # Get assignee details if assigned
    if final_assignee_id:
        assignee = await db.users.find_one(
            {"id": final_assignee_id},
            {"_id": 0, "id": 1, "first_name": 1, "last_name": 1, "email": 1}
        )
        if assignee:
            result["assignee"] = {
                "id": assignee["id"],
                "name": f"{assignee.get('first_name', '')} {assignee.get('last_name', '')}".strip(),
                "email": assignee.get("email", ""),
                "initials": (assignee.get("first_name", "")[:1] + assignee.get("last_name", "")[:1]).upper()
            }
    else:
        result["assignee"] = None
    
    return result


# ============================================================================
# PHASE 3: TASK DEPENDENCIES
# ============================================================================

class DependencyRequest(PydanticBaseModel):
    blocked_by_task_id: Optional[str] = None
    blocking_task_id: Optional[str] = None


async def check_circular_dependency(task_id: str, target_id: str, tenant_id: str, visited: set = None) -> bool:
    """Check if adding a dependency would create a circular reference"""
    if visited is None:
        visited = set()
    
    if task_id in visited:
        return True  # Circular dependency found
    
    if task_id == target_id:
        return True  # Direct circular reference
    
    visited.add(task_id)
    
    # Get the target task's dependencies
    target_task = await db.tm_tasks.find_one(
        {"id": target_id, "tenant_id": tenant_id, "is_active": True},
        {"blocked_by": 1}
    )
    
    if not target_task:
        return False
    
    # Check each dependency recursively
    for dep_id in target_task.get("blocked_by", []):
        if await check_circular_dependency(task_id, dep_id, tenant_id, visited):
            return True
    
    return False


async def update_task_blocked_status(task_id: str, tenant_id: str):
    """Update the is_blocked status based on dependencies"""
    task = await db.tm_tasks.find_one(
        {"id": task_id, "tenant_id": tenant_id, "is_active": True},
        {"blocked_by": 1, "status": 1}
    )
    
    if not task:
        return
    
    blocked_by = task.get("blocked_by", [])
    
    if not blocked_by:
        # No dependencies, not blocked
        is_blocked = False
    else:
        # Check if any blocking task is not done
        blocking_tasks = await db.tm_tasks.find(
            {"id": {"$in": blocked_by}, "tenant_id": tenant_id, "is_active": True},
            {"status": 1}
        ).to_list(100)
        
        is_blocked = any(t.get("status") != "done" for t in blocking_tasks)
    
    # Update the task
    update_data = {"is_blocked": is_blocked, "updated_at": datetime.now(timezone.utc)}
    
    # If blocked, change status to blocked (if not already done)
    if is_blocked and task.get("status") not in ["done", "blocked"]:
        update_data["status"] = "blocked"
    elif not is_blocked and task.get("status") == "blocked":
        # Unblock: move back to in_progress
        update_data["status"] = "in_progress"
    
    await db.tm_tasks.update_one(
        {"id": task_id, "tenant_id": tenant_id},
        {"$set": update_data}
    )


async def log_activity(tenant_id: str, task_id: str, activity_type: str, description: str, 
                       created_by: str, old_value: dict = None, new_value: dict = None):
    """Log an activity for a task"""
    activity = {
        "id": str(uuid.uuid4()),
        "tenant_id": tenant_id,
        "task_id": task_id,
        "activity_type": activity_type,
        "description": description,
        "old_value": old_value,
        "new_value": new_value,
        "created_by": created_by,
        "created_at": datetime.now(timezone.utc)
    }
    await db.tm_activity_logs.insert_one(activity)


@task_manager_router.post("/tasks/{task_id}/dependencies")
async def add_dependency(
    task_id: str,
    dependency: DependencyRequest,
    current_user: User = Depends(get_current_user)
):
    """Add a dependency to a task (blocked_by or blocking)"""
    task = await db.tm_tasks.find_one(
        {"id": task_id, "tenant_id": current_user.tenant_id, "is_active": True}
    )
    
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    # Handle "blocked by" relationship
    if dependency.blocked_by_task_id:
        blocker_id = dependency.blocked_by_task_id
        
        # Verify blocker task exists
        blocker = await db.tm_tasks.find_one(
            {"id": blocker_id, "tenant_id": current_user.tenant_id, "is_active": True}
        )
        if not blocker:
            raise HTTPException(status_code=404, detail="Blocking task not found")
        
        # Check for circular dependency
        if await check_circular_dependency(blocker_id, task_id, current_user.tenant_id):
            raise HTTPException(status_code=400, detail="Cannot create circular dependency")
        
        # Add dependency
        blocked_by = task.get("blocked_by", [])
        if blocker_id not in blocked_by:
            blocked_by.append(blocker_id)
            await db.tm_tasks.update_one(
                {"id": task_id},
                {"$set": {"blocked_by": blocked_by, "updated_at": datetime.now(timezone.utc)}}
            )
            
            # Update the blocker's "blocking" list
            blocker_blocking = blocker.get("blocking", [])
            if task_id not in blocker_blocking:
                blocker_blocking.append(task_id)
                await db.tm_tasks.update_one(
                    {"id": blocker_id},
                    {"$set": {"blocking": blocker_blocking, "updated_at": datetime.now(timezone.utc)}}
                )
            
            # Update blocked status
            await update_task_blocked_status(task_id, current_user.tenant_id)
            
            # Log activity
            await log_activity(
                current_user.tenant_id, task_id, "dependency_added",
                f"Added dependency: blocked by '{blocker.get('title')}'",
                current_user.id,
                new_value={"blocked_by_task_id": blocker_id, "blocked_by_title": blocker.get("title")}
            )
    
    # Handle "blocking" relationship (this task blocks another)
    if dependency.blocking_task_id:
        blocked_id = dependency.blocking_task_id
        
        # Verify blocked task exists
        blocked = await db.tm_tasks.find_one(
            {"id": blocked_id, "tenant_id": current_user.tenant_id, "is_active": True}
        )
        if not blocked:
            raise HTTPException(status_code=404, detail="Blocked task not found")
        
        # Check for circular dependency
        if await check_circular_dependency(task_id, blocked_id, current_user.tenant_id):
            raise HTTPException(status_code=400, detail="Cannot create circular dependency")
        
        # Add to this task's blocking list
        blocking = task.get("blocking", [])
        if blocked_id not in blocking:
            blocking.append(blocked_id)
            await db.tm_tasks.update_one(
                {"id": task_id},
                {"$set": {"blocking": blocking, "updated_at": datetime.now(timezone.utc)}}
            )
            
            # Update the blocked task's "blocked_by" list
            blocked_by = blocked.get("blocked_by", [])
            if task_id not in blocked_by:
                blocked_by.append(task_id)
                await db.tm_tasks.update_one(
                    {"id": blocked_id},
                    {"$set": {"blocked_by": blocked_by, "updated_at": datetime.now(timezone.utc)}}
                )
            
            # Update blocked status of the dependent task
            await update_task_blocked_status(blocked_id, current_user.tenant_id)
            
            # Log activity
            await log_activity(
                current_user.tenant_id, task_id, "dependency_added",
                f"Added dependency: blocking '{blocked.get('title')}'",
                current_user.id,
                new_value={"blocking_task_id": blocked_id, "blocking_title": blocked.get("title")}
            )
    
    # Return updated task
    updated_task = await db.tm_tasks.find_one(
        {"id": task_id, "tenant_id": current_user.tenant_id},
        {"_id": 0}
    )
    
    return updated_task


@task_manager_router.delete("/tasks/{task_id}/dependencies/{dependency_task_id}")
async def remove_dependency(
    task_id: str,
    dependency_task_id: str,
    current_user: User = Depends(get_current_user)
):
    """Remove a dependency from a task"""
    task = await db.tm_tasks.find_one(
        {"id": task_id, "tenant_id": current_user.tenant_id, "is_active": True}
    )
    
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    dep_task = await db.tm_tasks.find_one(
        {"id": dependency_task_id, "tenant_id": current_user.tenant_id, "is_active": True}
    )
    
    # Remove from blocked_by if present
    blocked_by = task.get("blocked_by", [])
    if dependency_task_id in blocked_by:
        blocked_by.remove(dependency_task_id)
        await db.tm_tasks.update_one(
            {"id": task_id},
            {"$set": {"blocked_by": blocked_by, "updated_at": datetime.now(timezone.utc)}}
        )
        
        # Also remove from the other task's blocking list
        if dep_task:
            blocking = dep_task.get("blocking", [])
            if task_id in blocking:
                blocking.remove(task_id)
                await db.tm_tasks.update_one(
                    {"id": dependency_task_id},
                    {"$set": {"blocking": blocking, "updated_at": datetime.now(timezone.utc)}}
                )
        
        await log_activity(
            current_user.tenant_id, task_id, "dependency_removed",
            f"Removed dependency: no longer blocked by '{dep_task.get('title') if dep_task else dependency_task_id}'",
            current_user.id
        )
    
    # Remove from blocking if present
    blocking = task.get("blocking", [])
    if dependency_task_id in blocking:
        blocking.remove(dependency_task_id)
        await db.tm_tasks.update_one(
            {"id": task_id},
            {"$set": {"blocking": blocking, "updated_at": datetime.now(timezone.utc)}}
        )
        
        # Also remove from the other task's blocked_by list
        if dep_task:
            blocked_by_other = dep_task.get("blocked_by", [])
            if task_id in blocked_by_other:
                blocked_by_other.remove(task_id)
                await db.tm_tasks.update_one(
                    {"id": dependency_task_id},
                    {"$set": {"blocked_by": blocked_by_other, "updated_at": datetime.now(timezone.utc)}}
                )
            
            # Update blocked status of the previously dependent task
            await update_task_blocked_status(dependency_task_id, current_user.tenant_id)
        
        await log_activity(
            current_user.tenant_id, task_id, "dependency_removed",
            f"Removed dependency: no longer blocking '{dep_task.get('title') if dep_task else dependency_task_id}'",
            current_user.id
        )
    
    # Update current task's blocked status
    await update_task_blocked_status(task_id, current_user.tenant_id)
    
    # Return updated task
    updated_task = await db.tm_tasks.find_one(
        {"id": task_id, "tenant_id": current_user.tenant_id},
        {"_id": 0}
    )
    
    return updated_task


@task_manager_router.get("/tasks/{task_id}/dependencies")
async def get_task_dependencies(
    task_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get detailed dependency information for a task"""
    task = await db.tm_tasks.find_one(
        {"id": task_id, "tenant_id": current_user.tenant_id, "is_active": True},
        {"_id": 0}
    )
    
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    # Get blocked_by tasks details
    blocked_by_tasks = []
    for dep_id in task.get("blocked_by", []):
        dep = await db.tm_tasks.find_one(
            {"id": dep_id, "tenant_id": current_user.tenant_id},
            {"_id": 0, "id": 1, "title": 1, "status": 1, "priority": 1}
        )
        if dep:
            blocked_by_tasks.append(dep)
    
    # Get blocking tasks details
    blocking_tasks = []
    for dep_id in task.get("blocking", []):
        dep = await db.tm_tasks.find_one(
            {"id": dep_id, "tenant_id": current_user.tenant_id},
            {"_id": 0, "id": 1, "title": 1, "status": 1, "priority": 1}
        )
        if dep:
            blocking_tasks.append(dep)
    
    return {
        "task_id": task_id,
        "blocked_by": blocked_by_tasks,
        "blocking": blocking_tasks,
        "is_blocked": task.get("is_blocked", False)
    }


# ============================================================================
# PHASE 3: COMMENTS WITH @MENTIONS
# ============================================================================

import re

def extract_mentions(content: str) -> List[str]:
    """Extract @mentions from comment content"""
    # Match @username patterns (alphanumeric and underscores)
    pattern = r'@(\w+)'
    return re.findall(pattern, content)


async def create_mention_notifications(task_id: str, comment_id: str, mentioned_user_ids: List[str],
                                        triggered_by: str, tenant_id: str, task_title: str):
    """Create notifications for mentioned users"""
    now = datetime.now(timezone.utc)
    
    for user_id in mentioned_user_ids:
        if user_id == triggered_by:
            continue  # Don't notify yourself
        
        notification = {
            "id": str(uuid.uuid4()),
            "tenant_id": tenant_id,
            "user_id": user_id,
            "type": "mention",
            "title": "You were mentioned",
            "message": f"You were mentioned in a comment on task: {task_title}",
            "task_id": task_id,
            "comment_id": comment_id,
            "triggered_by": triggered_by,
            "is_read": False,
            "created_at": now
        }
        await db.tm_notifications.insert_one(notification)


@task_manager_router.get("/tasks/{task_id}/comments")
async def get_task_comments(
    task_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get all comments for a task"""
    comments = await db.tm_comments.find(
        {"task_id": task_id, "tenant_id": current_user.tenant_id, "is_active": True},
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    
    # Enrich with author info
    for comment in comments:
        author = await db.users.find_one(
            {"id": comment.get("created_by")},
            {"_id": 0, "id": 1, "first_name": 1, "last_name": 1, "email": 1}
        )
        if author:
            comment["author"] = {
                "id": author["id"],
                "name": f"{author.get('first_name', '')} {author.get('last_name', '')}".strip(),
                "initials": (author.get("first_name", "")[:1] + author.get("last_name", "")[:1]).upper()
            }
    
    return comments


class CommentCreateRequest(PydanticBaseModel):
    content: str
    mentions: Optional[List[str]] = []


@task_manager_router.post("/tasks/{task_id}/comments")
async def create_comment(
    task_id: str,
    comment: CommentCreateRequest,
    current_user: User = Depends(get_current_user)
):
    """Create a comment on a task with @mention support"""
    task = await db.tm_tasks.find_one(
        {"id": task_id, "tenant_id": current_user.tenant_id, "is_active": True}
    )
    
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    now = datetime.now(timezone.utc)
    
    # Extract mentions from content
    content_mentions = extract_mentions(comment.content)
    
    # Resolve usernames to user IDs
    mentioned_user_ids = list(comment.mentions) if comment.mentions else []
    
    # Also try to find users by username/email pattern in content
    if content_mentions:
        for mention in content_mentions:
            user = await db.users.find_one(
                {
                    "tenant_id": current_user.tenant_id,
                    "$or": [
                        {"email": {"$regex": f"^{mention}", "$options": "i"}},
                        {"first_name": {"$regex": f"^{mention}", "$options": "i"}}
                    ]
                },
                {"id": 1}
            )
            if user and user["id"] not in mentioned_user_ids:
                mentioned_user_ids.append(user["id"])
    
    comment_data = {
        "id": str(uuid.uuid4()),
        "tenant_id": current_user.tenant_id,
        "task_id": task_id,
        "content": comment.content,
        "mentions": mentioned_user_ids,
        "created_by": current_user.id,
        "created_at": now,
        "updated_at": now,
        "is_active": True
    }
    
    await db.tm_comments.insert_one(comment_data)
    comment_data.pop("_id", None)
    
    # Create notifications for mentions
    if mentioned_user_ids:
        await create_mention_notifications(
            task_id, comment_data["id"], mentioned_user_ids,
            current_user.id, current_user.tenant_id, task.get("title", "")
        )
    
    # Log activity
    await log_activity(
        current_user.tenant_id, task_id, "comment_added",
        f"Added a comment" + (f" mentioning {len(mentioned_user_ids)} user(s)" if mentioned_user_ids else ""),
        current_user.id
    )
    
    # Add author info to response
    comment_data["author"] = {
        "id": current_user.id,
        "name": f"{current_user.first_name or ''} {current_user.last_name or ''}".strip(),
        "initials": ((current_user.first_name or "")[:1] + (current_user.last_name or "")[:1]).upper()
    }
    
    return comment_data


@task_manager_router.delete("/comments/{comment_id}")
async def delete_comment(
    comment_id: str,
    current_user: User = Depends(get_current_user)
):
    """Delete a comment"""
    result = await db.tm_comments.update_one(
        {"id": comment_id, "tenant_id": current_user.tenant_id, "created_by": current_user.id},
        {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc)}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Comment not found or not authorized")
    
    return {"success": True}


# ============================================================================
# PHASE 3: NOTIFICATIONS
# ============================================================================

@task_manager_router.get("/notifications")
async def get_notifications(
    current_user: User = Depends(get_current_user),
    unread_only: bool = False,
    limit: int = 50
):
    """Get notifications for the current user"""
    query = {
        "tenant_id": current_user.tenant_id,
        "user_id": current_user.id
    }
    
    if unread_only:
        query["is_read"] = False
    
    notifications = await db.tm_notifications.find(
        query, {"_id": 0}
    ).sort("created_at", -1).limit(limit).to_list(limit)
    
    # Get unread count
    unread_count = await db.tm_notifications.count_documents({
        "tenant_id": current_user.tenant_id,
        "user_id": current_user.id,
        "is_read": False
    })
    
    return {
        "notifications": notifications,
        "unread_count": unread_count
    }


@task_manager_router.post("/notifications/{notification_id}/read")
async def mark_notification_read(
    notification_id: str,
    current_user: User = Depends(get_current_user)
):
    """Mark a notification as read"""
    result = await db.tm_notifications.update_one(
        {"id": notification_id, "user_id": current_user.id},
        {"$set": {"is_read": True, "read_at": datetime.now(timezone.utc)}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Notification not found")
    
    return {"success": True}


@task_manager_router.post("/notifications/mark-all-read")
async def mark_all_notifications_read(
    current_user: User = Depends(get_current_user)
):
    """Mark all notifications as read"""
    now = datetime.now(timezone.utc)
    await db.tm_notifications.update_many(
        {"user_id": current_user.id, "is_read": False},
        {"$set": {"is_read": True, "read_at": now}}
    )
    
    return {"success": True}


# ============================================================================
# PHASE 3: ACTIVITY LOG
# ============================================================================

@task_manager_router.get("/tasks/{task_id}/activity")
async def get_task_activity(
    task_id: str,
    current_user: User = Depends(get_current_user),
    limit: int = 50
):
    """Get activity log for a task"""
    activities = await db.tm_activity_logs.find(
        {"task_id": task_id, "tenant_id": current_user.tenant_id},
        {"_id": 0}
    ).sort("created_at", -1).limit(limit).to_list(limit)
    
    # Enrich with user info
    for activity in activities:
        user = await db.users.find_one(
            {"id": activity.get("created_by")},
            {"_id": 0, "id": 1, "first_name": 1, "last_name": 1}
        )
        if user:
            activity["user"] = {
                "id": user["id"],
                "name": f"{user.get('first_name', '')} {user.get('last_name', '')}".strip()
            }
    
    return activities


# ============================================================================
# PHASE 3: TIMELINE WITH DEPENDENCIES (Enhanced)
# ============================================================================

@task_manager_router.get("/timeline/dependencies")
async def get_timeline_with_dependencies(
    current_user: User = Depends(get_current_user),
    project_id: Optional[str] = None
):
    """Get tasks with dependency relationships for timeline arrows"""
    query = {
        "tenant_id": current_user.tenant_id,
        "is_active": True,
        "$or": [
            {"start_date": {"$exists": True, "$ne": None}},
            {"due_date": {"$exists": True, "$ne": None}}
        ]
    }
    
    if project_id:
        query["project_id"] = project_id
    
    tasks = await db.tm_tasks.find(query, {"_id": 0}).to_list(500)
    
    # Build dependency edges for arrows
    edges = []
    for task in tasks:
        for blocked_by_id in task.get("blocked_by", []):
            edges.append({
                "from_task_id": blocked_by_id,
                "to_task_id": task["id"],
                "type": "blocked_by"
            })
    
    return {
        "tasks": tasks,
        "edges": edges
    }


# ============================================================================
# PHASE 3: DRAG-TO-RESCHEDULE
# ============================================================================

class RescheduleRequest(PydanticBaseModel):
    start_date: Optional[datetime] = None
    due_date: Optional[datetime] = None
    shift_dependents: bool = False  # Whether to auto-shift dependent tasks


@task_manager_router.post("/tasks/{task_id}/reschedule")
async def reschedule_task(
    task_id: str,
    reschedule: RescheduleRequest,
    current_user: User = Depends(get_current_user)
):
    """Reschedule a task (drag-to-reschedule in timeline)"""
    task = await db.tm_tasks.find_one(
        {"id": task_id, "tenant_id": current_user.tenant_id, "is_active": True}
    )
    
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    old_start = task.get("start_date")
    old_due = task.get("due_date")
    
    # Ensure timezone awareness
    new_start = reschedule.start_date
    new_due = reschedule.due_date
    
    if new_start and new_start.tzinfo is None:
        new_start = new_start.replace(tzinfo=timezone.utc)
    if new_due and new_due.tzinfo is None:
        new_due = new_due.replace(tzinfo=timezone.utc)
    if old_start and old_start.tzinfo is None:
        old_start = old_start.replace(tzinfo=timezone.utc)
    if old_due and old_due.tzinfo is None:
        old_due = old_due.replace(tzinfo=timezone.utc)
    
    # Calculate the shift amount
    shift_days = 0
    if new_start and old_start:
        shift_days = (new_start - old_start).days
    elif new_due and old_due:
        shift_days = (new_due - old_due).days
    
    # Check for dependency conflicts
    blocked_by = task.get("blocked_by", [])
    if blocked_by and new_start:
        # Check if new start date is before any blocking task's due date
        for blocker_id in blocked_by:
            blocker = await db.tm_tasks.find_one(
                {"id": blocker_id, "tenant_id": current_user.tenant_id},
                {"due_date": 1, "title": 1}
            )
            if blocker and blocker.get("due_date"):
                blocker_due = blocker["due_date"]
                if blocker_due.tzinfo is None:
                    blocker_due = blocker_due.replace(tzinfo=timezone.utc)
                if new_start < blocker_due:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Cannot start before blocking task '{blocker.get('title')}' is due ({blocker_due.strftime('%Y-%m-%d')})"
                    )
    
    # Update the task dates
    update_data = {"updated_at": datetime.now(timezone.utc)}
    if new_start:
        update_data["start_date"] = new_start
    if new_due:
        update_data["due_date"] = new_due
    
    await db.tm_tasks.update_one(
        {"id": task_id},
        {"$set": update_data}
    )
    
    # Log activity
    await log_activity(
        current_user.tenant_id, task_id, "dates_changed",
        f"Rescheduled task",
        current_user.id,
        old_value={"start_date": str(old_start) if old_start else None, "due_date": str(old_due) if old_due else None},
        new_value={"start_date": str(reschedule.start_date) if reschedule.start_date else None, 
                   "due_date": str(reschedule.due_date) if reschedule.due_date else None}
    )
    
    # Optionally shift dependent tasks
    shifted_tasks = []
    if reschedule.shift_dependents and shift_days != 0:
        blocking = task.get("blocking", [])
        for dep_id in blocking:
            dep_task = await db.tm_tasks.find_one(
                {"id": dep_id, "tenant_id": current_user.tenant_id, "is_active": True}
            )
            if dep_task:
                dep_update = {"updated_at": datetime.now(timezone.utc)}
                if dep_task.get("start_date"):
                    dep_update["start_date"] = dep_task["start_date"] + timedelta(days=shift_days)
                if dep_task.get("due_date"):
                    dep_update["due_date"] = dep_task["due_date"] + timedelta(days=shift_days)
                
                await db.tm_tasks.update_one({"id": dep_id}, {"$set": dep_update})
                shifted_tasks.append({
                    "id": dep_id,
                    "title": dep_task.get("title"),
                    "new_start_date": str(dep_update.get("start_date")),
                    "new_due_date": str(dep_update.get("due_date"))
                })
    
    # Get updated task
    updated_task = await db.tm_tasks.find_one(
        {"id": task_id, "tenant_id": current_user.tenant_id},
        {"_id": 0}
    )
    
    return {
        "task": updated_task,
        "shifted_dependents": shifted_tasks
    }



# ============================================================================
# PHASE 4: FILE ATTACHMENTS
# ============================================================================

import shutil
from fastapi import UploadFile, File
from fastapi.responses import FileResponse

# Ensure upload directory exists
UPLOAD_DIR = os.path.join(settings.STORAGE_BASE_DIR, "uploads", "task-manager")
os.makedirs(UPLOAD_DIR, exist_ok=True)


class AttachmentResponse(PydanticBaseModel):
    id: str
    task_id: str
    file_name: str
    file_size: int
    file_type: str
    uploaded_by: str
    uploaded_by_name: Optional[str] = None
    created_at: datetime
    download_url: str


@task_manager_router.post("/tasks/{task_id}/attachments")
async def upload_attachment(
    task_id: str,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user)
):
    """Upload a file attachment to a task"""
    # Verify task exists
    task = await db.tm_tasks.find_one(
        {"id": task_id, "tenant_id": current_user.tenant_id, "is_active": True}
    )
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    # Generate unique filename
    file_id = str(uuid.uuid4())
    file_extension = os.path.splitext(file.filename)[1]
    stored_name = f"{file_id}{file_extension}"
    file_path = os.path.join(UPLOAD_DIR, stored_name)
    
    # Save file
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save file: {str(e)}")
    
    # Get file size
    file_size = os.path.getsize(file_path)
    
    now = datetime.now(timezone.utc)
    
    # Create attachment record
    attachment = {
        "id": file_id,
        "tenant_id": current_user.tenant_id,
        "task_id": task_id,
        "project_id": task.get("project_id"),
        "file_name": file.filename,
        "stored_name": stored_name,
        "file_size": file_size,
        "file_type": file.content_type or "application/octet-stream",
        "file_path": file_path,
        "uploaded_by": current_user.id,
        "created_at": now,
        "is_active": True
    }
    
    await db.tm_attachments.insert_one(attachment)
    attachment.pop("_id", None)
    
    # Log activity
    await log_activity(
        current_user.tenant_id, task_id, "attachment_added",
        f"Uploaded file: {file.filename}",
        current_user.id
    )
    
    # Add uploader info
    attachment["uploaded_by_name"] = f"{current_user.first_name or ''} {current_user.last_name or ''}".strip()
    attachment["download_url"] = f"/api/task-manager/attachments/{file_id}/download"
    
    return attachment


@task_manager_router.get("/tasks/{task_id}/attachments")
async def get_task_attachments(
    task_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get all attachments for a task"""
    attachments = await db.tm_attachments.find(
        {"task_id": task_id, "tenant_id": current_user.tenant_id, "is_active": True},
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    
    # Enrich with uploader info
    for att in attachments:
        user = await db.users.find_one(
            {"id": att.get("uploaded_by")},
            {"_id": 0, "first_name": 1, "last_name": 1}
        )
        if user:
            att["uploaded_by_name"] = f"{user.get('first_name', '')} {user.get('last_name', '')}".strip()
        att["download_url"] = f"/api/task-manager/attachments/{att['id']}/download"
    
    return attachments


@task_manager_router.get("/attachments/{attachment_id}/download")
async def download_attachment(
    attachment_id: str,
    current_user: User = Depends(get_current_user)
):
    """Download an attachment"""
    attachment = await db.tm_attachments.find_one(
        {"id": attachment_id, "tenant_id": current_user.tenant_id, "is_active": True}
    )
    
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")
    
    file_path = attachment.get("file_path")
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found on disk")
    
    return FileResponse(
        file_path,
        filename=attachment.get("file_name"),
        media_type=attachment.get("file_type")
    )


@task_manager_router.delete("/attachments/{attachment_id}")
async def delete_attachment(
    attachment_id: str,
    current_user: User = Depends(get_current_user)
):
    """Delete an attachment (soft delete)"""
    attachment = await db.tm_attachments.find_one(
        {"id": attachment_id, "tenant_id": current_user.tenant_id, "is_active": True}
    )
    
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")
    
    # Only uploader or admin can delete
    if attachment.get("uploaded_by") != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to delete this attachment")
    
    # Soft delete
    await db.tm_attachments.update_one(
        {"id": attachment_id},
        {"$set": {"is_active": False, "deleted_at": datetime.now(timezone.utc)}}
    )
    
    # Log activity
    await log_activity(
        current_user.tenant_id, attachment.get("task_id"), "attachment_removed",
        f"Deleted file: {attachment.get('file_name')}",
        current_user.id
    )
    
    return {"success": True}


# ============================================================================
# PHASE 4: EMAIL NOTIFICATIONS
# ============================================================================

from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail, Email, To, Content, HtmlContent


async def get_user_notification_preferences(user_id: str, tenant_id: str) -> dict:
    """Get user's notification preferences"""
    prefs = await db.tm_notification_preferences.find_one(
        {"user_id": user_id, "tenant_id": tenant_id},
        {"_id": 0}  # Exclude MongoDB _id
    )
    
    if not prefs:
        # Default preferences - all enabled
        return {
            "email_on_assignment": True,
            "email_on_mention": True,
            "email_on_overdue": True,
            "email_on_dependency_resolved": True
        }
    
    return prefs


async def send_email_notification(
    to_email: str,
    subject: str,
    html_content: str,
    text_content: str = None
):
    """Send email notification using SendGrid"""
    sendgrid_key = os.environ.get("SENDGRID_API_KEY")
    sender_email = os.environ.get("SENDGRID_SENDER_EMAIL", "noreply@taskmanager.com")
    
    if not sendgrid_key:
        # SendGrid not configured, log and skip
        logger.warning(f"EMAIL SKIPPED (SendGrid not configured): {subject} to {to_email}")
        return False
    
    try:
        sg = SendGridAPIClient(sendgrid_key)
        
        message = Mail(
            from_email=Email(sender_email),
            to_emails=To(to_email),
            subject=subject,
            html_content=html_content
        )
        
        if text_content:
            message.plain_text_content = Content("text/plain", text_content)
        
        response = sg.send(message)
        
        logger.info(f"Email sent to {to_email}: status {response.status_code}")
        return response.status_code in [200, 201, 202]
        
    except Exception as e:
        logger.error(f"SendGrid EMAIL ERROR: {str(e)}")
        return False


async def notify_task_assigned(task: dict, assignee_id: str, assigned_by: str, tenant_id: str):
    """Send notification when task is assigned"""
    # Get assignee info
    assignee = await db.users.find_one({"id": assignee_id}, {"_id": 0})
    if not assignee:
        return
    
    # Check preferences
    prefs = await get_user_notification_preferences(assignee_id, tenant_id)
    if not prefs.get("email_on_assignment", True):
        return
    
    # Get assigner info
    assigner = await db.users.find_one({"id": assigned_by}, {"_id": 0})
    assigner_name = f"{assigner.get('first_name', '')} {assigner.get('last_name', '')}".strip() if assigner else "Someone"
    
    # Get project info
    project = await db.tm_projects.find_one({"id": task.get("project_id")}, {"_id": 0, "name": 1})
    project_name = project.get("name", "Unknown Project") if project else "Unknown Project"
    
    # Create in-app notification
    notification = {
        "id": str(uuid.uuid4()),
        "tenant_id": tenant_id,
        "user_id": assignee_id,
        "type": "assignment",
        "title": "Task Assigned",
        "message": f"{assigner_name} assigned you to: {task.get('title')}",
        "task_id": task.get("id"),
        "project_id": task.get("project_id"),
        "triggered_by": assigned_by,
        "is_read": False,
        "created_at": datetime.now(timezone.utc)
    }
    await db.tm_notifications.insert_one(notification)
    
    # Send email
    base_url = os.environ.get("BACKEND_URL", "http://localhost:3000")
    task_url = f"{base_url}/task-manager/projects/{task.get('project_id')}"
    
    html_content = f"""
    <html>
    <body style="font-family: Arial, sans-serif; padding: 20px;">
        <h2 style="color: #3b82f6;">Task Assigned to You</h2>
        <p><strong>{assigner_name}</strong> assigned you to a task:</p>
        <div style="background: #f1f5f9; padding: 15px; border-radius: 8px; margin: 15px 0;">
            <h3 style="margin: 0 0 10px 0;">{task.get('title')}</h3>
            <p style="margin: 5px 0; color: #64748b;">Project: {project_name}</p>
            <p style="margin: 5px 0; color: #64748b;">Priority: {task.get('priority', 'medium').upper()}</p>
        </div>
        <a href="{task_url}" style="display: inline-block; background: #3b82f6; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">View Task</a>
    </body>
    </html>
    """
    
    await send_email_notification(
        assignee.get("email"),
        f"[Task Manager] Task Assigned: {task.get('title')}",
        html_content
    )


async def notify_mention(task: dict, mentioned_user_id: str, mentioned_by: str, comment_content: str, tenant_id: str):
    """Send notification when user is @mentioned"""
    # Get mentioned user
    user = await db.users.find_one({"id": mentioned_user_id}, {"_id": 0})
    if not user:
        return
    
    # Check preferences
    prefs = await get_user_notification_preferences(mentioned_user_id, tenant_id)
    if not prefs.get("email_on_mention", True):
        return
    
    # Get mentioner info
    mentioner = await db.users.find_one({"id": mentioned_by}, {"_id": 0})
    mentioner_name = f"{mentioner.get('first_name', '')} {mentioner.get('last_name', '')}".strip() if mentioner else "Someone"
    
    # Get project info
    project = await db.tm_projects.find_one({"id": task.get("project_id")}, {"_id": 0, "name": 1})
    project_name = project.get("name", "Unknown Project") if project else "Unknown Project"
    
    base_url = os.environ.get("BACKEND_URL", "http://localhost:3000")
    task_url = f"{base_url}/task-manager/projects/{task.get('project_id')}"
    
    html_content = f"""
    <html>
    <body style="font-family: Arial, sans-serif; padding: 20px;">
        <h2 style="color: #3b82f6;">You Were Mentioned</h2>
        <p><strong>{mentioner_name}</strong> mentioned you in a comment:</p>
        <div style="background: #f1f5f9; padding: 15px; border-radius: 8px; margin: 15px 0;">
            <p style="font-style: italic; margin: 0;">"{comment_content[:200]}{'...' if len(comment_content) > 200 else ''}"</p>
        </div>
        <p style="color: #64748b;">Task: {task.get('title')}<br>Project: {project_name}</p>
        <a href="{task_url}" style="display: inline-block; background: #3b82f6; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">View Comment</a>
    </body>
    </html>
    """
    
    await send_email_notification(
        user.get("email"),
        f"[Task Manager] You were mentioned in: {task.get('title')}",
        html_content
    )


async def notify_dependency_resolved(task: dict, tenant_id: str):
    """Send notification when a blocking dependency is resolved"""
    if not task.get("assignee_id"):
        return
    
    # Get assignee
    assignee = await db.users.find_one({"id": task.get("assignee_id")}, {"_id": 0})
    if not assignee:
        return
    
    # Check preferences
    prefs = await get_user_notification_preferences(task.get("assignee_id"), tenant_id)
    if not prefs.get("email_on_dependency_resolved", True):
        return
    
    # Get project info
    project = await db.tm_projects.find_one({"id": task.get("project_id")}, {"_id": 0, "name": 1})
    project_name = project.get("name", "Unknown Project") if project else "Unknown Project"
    
    # Create in-app notification
    notification = {
        "id": str(uuid.uuid4()),
        "tenant_id": tenant_id,
        "user_id": task.get("assignee_id"),
        "type": "dependency_resolved",
        "title": "Task Unblocked",
        "message": f"Task '{task.get('title')}' is no longer blocked",
        "task_id": task.get("id"),
        "project_id": task.get("project_id"),
        "triggered_by": "system",
        "is_read": False,
        "created_at": datetime.now(timezone.utc)
    }
    await db.tm_notifications.insert_one(notification)
    
    base_url = os.environ.get("BACKEND_URL", "http://localhost:3000")
    task_url = f"{base_url}/task-manager/projects/{task.get('project_id')}"
    
    html_content = f"""
    <html>
    <body style="font-family: Arial, sans-serif; padding: 20px;">
        <h2 style="color: #22c55e;">Task Unblocked!</h2>
        <p>Your task is no longer blocked and ready to proceed:</p>
        <div style="background: #f0fdf4; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #22c55e;">
            <h3 style="margin: 0 0 10px 0;">{task.get('title')}</h3>
            <p style="margin: 5px 0; color: #64748b;">Project: {project_name}</p>
        </div>
        <a href="{task_url}" style="display: inline-block; background: #22c55e; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">View Task</a>
    </body>
    </html>
    """
    
    await send_email_notification(
        assignee.get("email"),
        f"[Task Manager] Task Unblocked: {task.get('title')}",
        html_content
    )


@task_manager_router.get("/user/notification-preferences")
async def get_notification_preferences(
    current_user: User = Depends(get_current_user)
):
    """Get current user's notification preferences"""
    prefs = await get_user_notification_preferences(current_user.id, current_user.tenant_id)
    return prefs


class NotificationPreferencesUpdate(PydanticBaseModel):
    email_on_assignment: Optional[bool] = None
    email_on_mention: Optional[bool] = None
    email_on_overdue: Optional[bool] = None
    email_on_dependency_resolved: Optional[bool] = None


@task_manager_router.put("/user/notification-preferences")
async def update_notification_preferences(
    prefs: NotificationPreferencesUpdate,
    current_user: User = Depends(get_current_user)
):
    """Update user's notification preferences"""
    update_data = {k: v for k, v in prefs.dict().items() if v is not None}
    update_data["user_id"] = current_user.id
    update_data["tenant_id"] = current_user.tenant_id
    update_data["updated_at"] = datetime.now(timezone.utc)
    
    await db.tm_notification_preferences.update_one(
        {"user_id": current_user.id, "tenant_id": current_user.tenant_id},
        {"$set": update_data},
        upsert=True
    )
    
    return await get_user_notification_preferences(current_user.id, current_user.tenant_id)


# ============================================================================
# PHASE 4: AUTOMATION RULES ENGINE
# ============================================================================

class AutomationTrigger(str, Enum):
    TASK_CREATED = "task_created"
    STATUS_CHANGED = "status_changed"
    TASK_OVERDUE = "task_overdue"
    ASSIGNEE_CHANGED = "assignee_changed"
    DEPENDENCY_RESOLVED = "dependency_resolved"


class AutomationConditionField(str, Enum):
    STATUS = "status"
    PRIORITY = "priority"
    TYPE = "task_type"
    PROJECT = "project_id"
    ASSIGNEE = "assignee_id"


class AutomationAction(str, Enum):
    ASSIGN_TASK = "assign_task"
    CHANGE_STATUS = "change_status"
    SET_PRIORITY = "set_priority"
    ADD_COMMENT = "add_comment"
    ADD_WATCHER = "add_watcher"
    SEND_NOTIFICATION = "send_notification"


class AutomationCondition(PydanticBaseModel):
    field: str
    operator: str = "equals"  # equals, not_equals, contains
    value: Any


class AutomationActionConfig(PydanticBaseModel):
    action_type: str
    params: Dict[str, Any] = {}


class AutomationRuleCreate(PydanticBaseModel):
    name: str
    description: Optional[str] = None
    trigger: str
    conditions: List[AutomationCondition] = []
    actions: List[AutomationActionConfig]
    is_enabled: bool = True
    project_id: Optional[str] = None  # None = applies to all projects


class AutomationRuleUpdate(PydanticBaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    trigger: Optional[str] = None
    conditions: Optional[List[AutomationCondition]] = None
    actions: Optional[List[AutomationActionConfig]] = None
    is_enabled: Optional[bool] = None
    project_id: Optional[str] = None


@task_manager_router.get("/automation/rules")
async def list_automation_rules(
    current_user: User = Depends(get_current_user),
    project_id: Optional[str] = None
):
    """List all automation rules"""
    query = {"tenant_id": current_user.tenant_id, "is_active": True}
    if project_id:
        query["$or"] = [{"project_id": project_id}, {"project_id": None}]
    
    rules = await db.tm_automation_rules.find(query, {"_id": 0}).to_list(100)
    return rules


@task_manager_router.get("/automation/rules/{rule_id}")
async def get_automation_rule(
    rule_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get a specific automation rule"""
    rule = await db.tm_automation_rules.find_one(
        {"id": rule_id, "tenant_id": current_user.tenant_id, "is_active": True},
        {"_id": 0}
    )
    
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    
    return rule


@task_manager_router.post("/automation/rules")
async def create_automation_rule(
    rule: AutomationRuleCreate,
    current_user: User = Depends(get_current_user)
):
    """Create a new automation rule"""
    now = datetime.now(timezone.utc)
    
    rule_data = {
        "id": str(uuid.uuid4()),
        "tenant_id": current_user.tenant_id,
        "name": rule.name,
        "description": rule.description,
        "trigger": rule.trigger,
        "conditions": [c.dict() for c in rule.conditions],
        "actions": [a.dict() for a in rule.actions],
        "is_enabled": rule.is_enabled,
        "project_id": rule.project_id,
        "created_by": current_user.id,
        "created_at": now,
        "updated_at": now,
        "is_active": True,
        "execution_count": 0,
        "last_executed_at": None
    }
    
    await db.tm_automation_rules.insert_one(rule_data)
    rule_data.pop("_id", None)
    
    return rule_data


@task_manager_router.put("/automation/rules/{rule_id}")
async def update_automation_rule(
    rule_id: str,
    rule: AutomationRuleUpdate,
    current_user: User = Depends(get_current_user)
):
    """Update an automation rule"""
    existing = await db.tm_automation_rules.find_one(
        {"id": rule_id, "tenant_id": current_user.tenant_id, "is_active": True}
    )
    
    if not existing:
        raise HTTPException(status_code=404, detail="Rule not found")
    
    update_data = {k: v for k, v in rule.dict().items() if v is not None}
    if "conditions" in update_data:
        update_data["conditions"] = [c if isinstance(c, dict) else c.dict() for c in update_data["conditions"]]
    if "actions" in update_data:
        update_data["actions"] = [a if isinstance(a, dict) else a.dict() for a in update_data["actions"]]
    
    update_data["updated_at"] = datetime.now(timezone.utc)
    
    await db.tm_automation_rules.update_one(
        {"id": rule_id},
        {"$set": update_data}
    )
    
    updated = await db.tm_automation_rules.find_one({"id": rule_id}, {"_id": 0})
    return updated


@task_manager_router.delete("/automation/rules/{rule_id}")
async def delete_automation_rule(
    rule_id: str,
    current_user: User = Depends(get_current_user)
):
    """Delete an automation rule"""
    result = await db.tm_automation_rules.update_one(
        {"id": rule_id, "tenant_id": current_user.tenant_id},
        {"$set": {"is_active": False, "deleted_at": datetime.now(timezone.utc)}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Rule not found")
    
    return {"success": True}


@task_manager_router.post("/automation/rules/{rule_id}/toggle")
async def toggle_automation_rule(
    rule_id: str,
    current_user: User = Depends(get_current_user)
):
    """Enable or disable an automation rule"""
    rule = await db.tm_automation_rules.find_one(
        {"id": rule_id, "tenant_id": current_user.tenant_id, "is_active": True}
    )
    
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    
    new_state = not rule.get("is_enabled", True)
    
    await db.tm_automation_rules.update_one(
        {"id": rule_id},
        {"$set": {"is_enabled": new_state, "updated_at": datetime.now(timezone.utc)}}
    )
    
    return {"is_enabled": new_state}


# Automation Rule Templates
RULE_TEMPLATES = [
    {
        "id": "template_overdue_escalation",
        "name": "Overdue Escalation",
        "description": "When a task becomes overdue, set priority to Urgent and assign to Team Lead",
        "trigger": "task_overdue",
        "conditions": [],
        "actions": [
            {"action_type": "set_priority", "params": {"priority": "urgent"}},
            {"action_type": "send_notification", "params": {"message": "Task is overdue!"}}
        ]
    },
    {
        "id": "template_auto_assign_bugs",
        "name": "Auto-assign Bugs to Engineering",
        "description": "Automatically assign new bug tasks to the Engineering team lead",
        "trigger": "task_created",
        "conditions": [
            {"field": "task_type", "operator": "equals", "value": "bug"}
        ],
        "actions": [
            {"action_type": "add_comment", "params": {"comment": "Bug automatically routed to Engineering team."}}
        ]
    },
    {
        "id": "template_dependency_ready",
        "name": "Dependency Resolved → Ready",
        "description": "When a task's dependencies are resolved, move it to In Progress",
        "trigger": "dependency_resolved",
        "conditions": [],
        "actions": [
            {"action_type": "change_status", "params": {"status": "in_progress"}},
            {"action_type": "send_notification", "params": {"message": "Task is now unblocked and ready!"}}
        ]
    }
]


@task_manager_router.get("/automation/templates")
async def get_rule_templates(
    current_user: User = Depends(get_current_user)
):
    """Get predefined automation rule templates"""
    return RULE_TEMPLATES


@task_manager_router.post("/automation/templates/{template_id}/apply")
async def apply_rule_template(
    template_id: str,
    project_id: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """Apply a rule template to create a new rule"""
    template = next((t for t in RULE_TEMPLATES if t["id"] == template_id), None)
    
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    
    now = datetime.now(timezone.utc)
    
    rule_data = {
        "id": str(uuid.uuid4()),
        "tenant_id": current_user.tenant_id,
        "name": template["name"],
        "description": template["description"],
        "trigger": template["trigger"],
        "conditions": template["conditions"],
        "actions": template["actions"],
        "is_enabled": True,
        "project_id": project_id,
        "created_by": current_user.id,
        "created_at": now,
        "updated_at": now,
        "is_active": True,
        "execution_count": 0,
        "last_executed_at": None,
        "from_template": template_id
    }
    
    await db.tm_automation_rules.insert_one(rule_data)
    rule_data.pop("_id", None)
    
    return rule_data


# Automation Rule Execution
async def execute_automation_rules(trigger: str, task: dict, context: dict, tenant_id: str):
    """Execute automation rules for a given trigger"""
    # Get applicable rules
    query = {
        "tenant_id": tenant_id,
        "is_active": True,
        "is_enabled": True,
        "trigger": trigger,
        "$or": [
            {"project_id": task.get("project_id")},
            {"project_id": None}
        ]
    }
    
    rules = await db.tm_automation_rules.find(query).to_list(50)
    
    for rule in rules:
        try:
            # Check conditions
            if not await check_rule_conditions(rule.get("conditions", []), task):
                continue
            
            # Execute actions
            for action in rule.get("actions", []):
                await execute_rule_action(action, task, context, tenant_id)
            
            # Update execution stats
            await db.tm_automation_rules.update_one(
                {"id": rule["id"]},
                {
                    "$inc": {"execution_count": 1},
                    "$set": {"last_executed_at": datetime.now(timezone.utc)}
                }
            )
            
            # Log automation execution
            await db.tm_automation_logs.insert_one({
                "id": str(uuid.uuid4()),
                "tenant_id": tenant_id,
                "rule_id": rule["id"],
                "rule_name": rule.get("name"),
                "task_id": task.get("id"),
                "trigger": trigger,
                "status": "success",
                "executed_at": datetime.now(timezone.utc)
            })
            
        except Exception as e:
            # Log failed execution
            await db.tm_automation_logs.insert_one({
                "id": str(uuid.uuid4()),
                "tenant_id": tenant_id,
                "rule_id": rule["id"],
                "rule_name": rule.get("name"),
                "task_id": task.get("id"),
                "trigger": trigger,
                "status": "failed",
                "error": str(e),
                "executed_at": datetime.now(timezone.utc)
            })


async def check_rule_conditions(conditions: list, task: dict) -> bool:
    """Check if all rule conditions are met"""
    for condition in conditions:
        field = condition.get("field")
        operator = condition.get("operator", "equals")
        value = condition.get("value")
        
        task_value = task.get(field)
        
        if operator == "equals":
            if task_value != value:
                return False
        elif operator == "not_equals":
            if task_value == value:
                return False
        elif operator == "contains":
            if value not in str(task_value):
                return False
    
    return True


async def execute_rule_action(action: dict, task: dict, context: dict, tenant_id: str):
    """Execute a single automation action"""
    action_type = action.get("action_type")
    params = action.get("params", {})
    
    if action_type == "assign_task":
        assignee_id = params.get("assignee_id")
        if assignee_id:
            await db.tm_tasks.update_one(
                {"id": task["id"]},
                {"$set": {"assignee_id": assignee_id, "updated_at": datetime.now(timezone.utc)}}
            )
    
    elif action_type == "change_status":
        new_status = params.get("status")
        if new_status:
            await db.tm_tasks.update_one(
                {"id": task["id"]},
                {"$set": {"status": new_status, "updated_at": datetime.now(timezone.utc)}}
            )
    
    elif action_type == "set_priority":
        new_priority = params.get("priority")
        if new_priority:
            await db.tm_tasks.update_one(
                {"id": task["id"]},
                {"$set": {"priority": new_priority, "updated_at": datetime.now(timezone.utc)}}
            )
    
    elif action_type == "add_comment":
        comment_text = params.get("comment")
        if comment_text:
            await db.tm_comments.insert_one({
                "id": str(uuid.uuid4()),
                "tenant_id": tenant_id,
                "task_id": task["id"],
                "content": f"[Automation] {comment_text}",
                "mentions": [],
                "created_by": "system",
                "created_at": datetime.now(timezone.utc),
                "updated_at": datetime.now(timezone.utc),
                "is_active": True
            })
    
    elif action_type == "send_notification":
        message = params.get("message")
        if message and task.get("assignee_id"):
            await db.tm_notifications.insert_one({
                "id": str(uuid.uuid4()),
                "tenant_id": tenant_id,
                "user_id": task.get("assignee_id"),
                "type": "automation",
                "title": "Automation Alert",
                "message": message,
                "task_id": task["id"],
                "triggered_by": "system",
                "is_read": False,
                "created_at": datetime.now(timezone.utc)
            })


@task_manager_router.get("/automation/logs")
async def get_automation_logs(
    current_user: User = Depends(get_current_user),
    rule_id: Optional[str] = None,
    task_id: Optional[str] = None,
    limit: int = 50
):
    """Get automation execution logs"""
    query = {"tenant_id": current_user.tenant_id}
    
    if rule_id:
        query["rule_id"] = rule_id
    if task_id:
        query["task_id"] = task_id
    
    logs = await db.tm_automation_logs.find(
        query, {"_id": 0}
    ).sort("executed_at", -1).limit(limit).to_list(limit)
    
    return logs


# ============================================================================
# PHASE 5: CUSTOM FIELDS
# ============================================================================

class CustomFieldType(str, Enum):
    TEXT = "text"
    NUMBER = "number"
    DROPDOWN = "dropdown"
    DATE = "date"
    CHECKBOX = "checkbox"


class CustomFieldScope(str, Enum):
    GLOBAL = "global"
    PROJECT = "project"


class CustomFieldCreate(PydanticBaseModel):
    label: str
    field_type: str  # text, number, dropdown, date, checkbox, formula
    scope: str = "global"  # global or project
    project_id: Optional[str] = None  # Required if scope is 'project'
    is_required: bool = False
    default_value: Optional[Any] = None
    options: Optional[List[str]] = None  # For dropdown type
    description: Optional[str] = None
    formula_expression: Optional[str] = None  # For formula type


class CustomFieldUpdate(PydanticBaseModel):
    label: Optional[str] = None
    is_required: Optional[bool] = None
    default_value: Optional[Any] = None
    options: Optional[List[str]] = None
    description: Optional[str] = None
    formula_expression: Optional[str] = None


@task_manager_router.get("/custom-fields")
async def list_custom_fields(
    current_user: User = Depends(get_current_user),
    project_id: Optional[str] = None,
    include_global: bool = True
):
    """List custom field definitions"""
    query = {"tenant_id": current_user.tenant_id, "is_active": True}
    
    if project_id:
        if include_global:
            query["$or"] = [
                {"scope": "global"},
                {"project_id": project_id}
            ]
        else:
            query["project_id"] = project_id
    elif not include_global:
        query["scope"] = "project"
    
    fields = await db.tm_custom_field_definitions.find(
        query, {"_id": 0}
    ).sort("order_index", 1).to_list(100)
    
    return fields


@task_manager_router.get("/custom-fields/{field_id}")
async def get_custom_field(
    field_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get a specific custom field definition"""
    field = await db.tm_custom_field_definitions.find_one(
        {"id": field_id, "tenant_id": current_user.tenant_id, "is_active": True},
        {"_id": 0}
    )
    
    if not field:
        raise HTTPException(status_code=404, detail="Custom field not found")
    
    return field


@task_manager_router.post("/custom-fields")
async def create_custom_field(
    field: CustomFieldCreate,
    current_user: User = Depends(get_current_user)
):
    """Create a new custom field definition"""
    from ..services.formula_service import FormulaEvaluator
    
    # Validate field type
    valid_types = ["text", "number", "dropdown", "date", "checkbox", "formula"]
    if field.field_type not in valid_types:
        raise HTTPException(status_code=400, detail=f"Invalid field type. Must be one of: {valid_types}")
    
    # Validate scope
    if field.scope not in ["global", "project"]:
        raise HTTPException(status_code=400, detail="Scope must be 'global' or 'project'")
    
    if field.scope == "project" and not field.project_id:
        raise HTTPException(status_code=400, detail="project_id is required for project-scoped fields")
    
    # Validate dropdown options
    if field.field_type == "dropdown" and not field.options:
        raise HTTPException(status_code=400, detail="Options are required for dropdown fields")
    
    # Validate formula
    if field.field_type == "formula":
        if not field.formula_expression:
            raise HTTPException(status_code=400, detail="formula_expression is required for formula fields")
        
        formula_eval = FormulaEvaluator(db)
        
        # Validate syntax
        is_valid, error = formula_eval.validate_formula_syntax(field.formula_expression)
        if not is_valid:
            raise HTTPException(status_code=400, detail=f"Invalid formula: {error}")
        
        # Validate field references
        is_valid, error, _ = await formula_eval.validate_field_references(
            field.formula_expression, current_user.tenant_id, field.project_id
        )
        if not is_valid:
            raise HTTPException(status_code=400, detail=f"Formula error: {error}")
    
    # Generate API name from label
    import re
    api_name = re.sub(r'[^a-z0-9]+', '_', field.label.lower()).strip('_')
    api_name = f"cf_{api_name}"
    
    # Check for circular references if formula
    if field.field_type == "formula":
        has_circular, error = await formula_eval.check_circular_references(
            api_name, field.formula_expression, current_user.tenant_id
        )
        if has_circular:
            raise HTTPException(status_code=400, detail=f"Circular reference detected: {error}")
    
    # Check for duplicate API name in same scope
    existing = await db.tm_custom_field_definitions.find_one({
        "tenant_id": current_user.tenant_id,
        "api_name": api_name,
        "is_active": True,
        "$or": [
            {"scope": "global"},
            {"project_id": field.project_id} if field.project_id else {"scope": "global"}
        ]
    })
    
    if existing:
        raise HTTPException(status_code=400, detail=f"A field with API name '{api_name}' already exists")
    
    # Get max order index
    max_order = await db.tm_custom_field_definitions.find_one(
        {"tenant_id": current_user.tenant_id},
        sort=[("order_index", -1)]
    )
    next_order = (max_order.get("order_index", 0) + 1) if max_order else 0
    
    now = datetime.now(timezone.utc)
    field_data = {
        "id": str(uuid.uuid4()),
        "tenant_id": current_user.tenant_id,
        "label": field.label,
        "api_name": api_name,
        "field_type": field.field_type,
        "scope": field.scope,
        "project_id": field.project_id if field.scope == "project" else None,
        "is_required": field.is_required if field.field_type != "formula" else False,  # Formula fields can't be required
        "default_value": field.default_value if field.field_type != "formula" else None,
        "options": field.options if field.field_type == "dropdown" else None,
        "formula_expression": field.formula_expression if field.field_type == "formula" else None,
        "description": field.description,
        "order_index": next_order,
        "created_by": current_user.id,
        "created_at": now,
        "updated_at": now,
        "is_active": True
    }
    
    await db.tm_custom_field_definitions.insert_one(field_data)
    field_data.pop("_id", None)
    
    return field_data


@task_manager_router.put("/custom-fields/{field_id}")
async def update_custom_field(
    field_id: str,
    field: CustomFieldUpdate,
    current_user: User = Depends(get_current_user)
):
    """Update a custom field definition"""
    existing = await db.tm_custom_field_definitions.find_one(
        {"id": field_id, "tenant_id": current_user.tenant_id, "is_active": True}
    )
    
    if not existing:
        raise HTTPException(status_code=404, detail="Custom field not found")
    
    update_data = {k: v for k, v in field.dict().items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc)
    
    await db.tm_custom_field_definitions.update_one(
        {"id": field_id},
        {"$set": update_data}
    )
    
    updated = await db.tm_custom_field_definitions.find_one({"id": field_id}, {"_id": 0})
    return updated


@task_manager_router.delete("/custom-fields/{field_id}")
async def delete_custom_field(
    field_id: str,
    current_user: User = Depends(get_current_user)
):
    """Delete a custom field definition (soft delete)"""
    result = await db.tm_custom_field_definitions.update_one(
        {"id": field_id, "tenant_id": current_user.tenant_id},
        {"$set": {"is_active": False, "deleted_at": datetime.now(timezone.utc)}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Custom field not found")
    
    return {"success": True, "message": "Custom field deleted"}


@task_manager_router.post("/custom-fields/reorder")
async def reorder_custom_fields(
    field_orders: List[Dict[str, Any]],
    current_user: User = Depends(get_current_user)
):
    """Reorder custom fields"""
    for item in field_orders:
        await db.tm_custom_field_definitions.update_one(
            {"id": item["id"], "tenant_id": current_user.tenant_id},
            {"$set": {"order_index": item["order_index"]}}
        )
    
    return {"success": True}


# Custom Field Values on Tasks
@task_manager_router.get("/tasks/{task_id}/custom-fields")
async def get_task_custom_field_values(
    task_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get custom field values for a task"""
    task = await db.tm_tasks.find_one(
        {"id": task_id, "tenant_id": current_user.tenant_id, "is_active": True},
        {"_id": 0, "custom_fields": 1, "project_id": 1}
    )
    
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    # Get applicable custom field definitions
    field_defs = await db.tm_custom_field_definitions.find({
        "tenant_id": current_user.tenant_id,
        "is_active": True,
        "$or": [
            {"scope": "global"},
            {"project_id": task.get("project_id")}
        ]
    }, {"_id": 0}).sort("order_index", 1).to_list(100)
    
    # Merge with task values
    task_custom_fields = task.get("custom_fields", {})
    
    result = []
    for field_def in field_defs:
        value = task_custom_fields.get(field_def["api_name"], field_def.get("default_value"))
        result.append({
            **field_def,
            "value": value
        })
    
    return result


@task_manager_router.put("/tasks/{task_id}/custom-fields")
async def update_task_custom_field_values(
    task_id: str,
    values: Dict[str, Any],
    current_user: User = Depends(get_current_user)
):
    """Update custom field values for a task"""
    from ..services.formula_service import FormulaEvaluator
    from ..services.validation_service import ValidationService
    
    task = await db.tm_tasks.find_one(
        {"id": task_id, "tenant_id": current_user.tenant_id, "is_active": True}
    )
    
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    # Validate field names exist and filter out formula fields (they're calculated)
    filtered_values = {}
    for api_name, value in values.items():
        field_def = await db.tm_custom_field_definitions.find_one({
            "tenant_id": current_user.tenant_id,
            "api_name": api_name,
            "is_active": True
        })
        if not field_def:
            raise HTTPException(status_code=400, detail=f"Unknown custom field: {api_name}")
        # Skip formula fields - they're calculated, not set directly
        if field_def.get("field_type") != "formula":
            filtered_values[api_name] = value
    
    # Update task custom fields
    current_custom_fields = task.get("custom_fields", {})
    current_custom_fields.update(filtered_values)
    
    # Calculate formula fields
    formula_eval = FormulaEvaluator(db)
    task_with_fields = {**task, "custom_fields": current_custom_fields}
    calculated_fields = await formula_eval.calculate_formula_fields(
        task_with_fields, current_user.tenant_id
    )
    
    # Run validation rules
    validation_service = ValidationService(db)
    is_valid, errors = await validation_service.validate_task(
        task_with_fields, calculated_fields, current_user.tenant_id, task.get("project_id")
    )
    
    if not is_valid:
        raise HTTPException(
            status_code=400,
            detail={
                "message": "Validation failed",
                "errors": errors
            }
        )
    
    await db.tm_tasks.update_one(
        {"id": task_id},
        {"$set": {
            "custom_fields": calculated_fields,
            "updated_at": datetime.now(timezone.utc)
        }}
    )
    
    # Log activity
    await log_activity(
        current_user.tenant_id,
        task_id,
        "custom_fields_updated",
        "Custom fields updated",
        current_user.id,
        new_value=filtered_values
    )
    
    return {"success": True, "custom_fields": calculated_fields}


# ============================================================================
# PHASE 5: TIME TRACKING
# ============================================================================

class TimeEntryCreate(PydanticBaseModel):
    task_id: str
    duration_minutes: int
    description: Optional[str] = None
    logged_date: Optional[datetime] = None  # Defaults to now


class TimeEntryUpdate(PydanticBaseModel):
    duration_minutes: Optional[int] = None
    description: Optional[str] = None
    logged_date: Optional[datetime] = None


@task_manager_router.post("/time-entries")
async def create_time_entry(
    entry: TimeEntryCreate,
    current_user: User = Depends(get_current_user)
):
    """Log time spent on a task"""
    # Verify task exists
    task = await db.tm_tasks.find_one(
        {"id": entry.task_id, "tenant_id": current_user.tenant_id, "is_active": True}
    )
    
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    now = datetime.now(timezone.utc)
    entry_data = {
        "id": str(uuid.uuid4()),
        "tenant_id": current_user.tenant_id,
        "task_id": entry.task_id,
        "project_id": task.get("project_id"),
        "user_id": current_user.id,
        "duration_minutes": entry.duration_minutes,
        "description": entry.description,
        "logged_date": entry.logged_date or now,
        "created_at": now,
        "updated_at": now,
        "is_active": True
    }
    
    await db.tm_time_entries.insert_one(entry_data)
    entry_data.pop("_id", None)
    
    # Get user info for response
    entry_data["user"] = {
        "id": current_user.id,
        "name": f"{current_user.first_name or ''} {current_user.last_name or ''}".strip(),
        "email": current_user.email
    }
    
    return entry_data


@task_manager_router.get("/tasks/{task_id}/time-entries")
async def get_task_time_entries(
    task_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get all time entries for a task"""
    entries = await db.tm_time_entries.find(
        {"task_id": task_id, "tenant_id": current_user.tenant_id, "is_active": True},
        {"_id": 0}
    ).sort("logged_date", -1).to_list(100)
    
    # Enrich with user info
    for entry in entries:
        user = await db.users.find_one(
            {"id": entry["user_id"]},
            {"_id": 0, "id": 1, "first_name": 1, "last_name": 1, "email": 1}
        )
        if user:
            entry["user"] = {
                "id": user["id"],
                "name": f"{user.get('first_name', '')} {user.get('last_name', '')}".strip(),
                "email": user.get("email", "")
            }
    
    # Calculate total
    total_minutes = sum(e.get("duration_minutes", 0) for e in entries)
    
    return {
        "entries": entries,
        "total_minutes": total_minutes,
        "total_hours": round(total_minutes / 60, 2)
    }


@task_manager_router.put("/time-entries/{entry_id}")
async def update_time_entry(
    entry_id: str,
    entry: TimeEntryUpdate,
    current_user: User = Depends(get_current_user)
):
    """Update a time entry"""
    existing = await db.tm_time_entries.find_one(
        {"id": entry_id, "tenant_id": current_user.tenant_id, "is_active": True}
    )
    
    if not existing:
        raise HTTPException(status_code=404, detail="Time entry not found")
    
    # Only allow owner to update
    if existing.get("user_id") != current_user.id:
        raise HTTPException(status_code=403, detail="You can only update your own time entries")
    
    update_data = {k: v for k, v in entry.dict().items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc)
    
    await db.tm_time_entries.update_one(
        {"id": entry_id},
        {"$set": update_data}
    )
    
    updated = await db.tm_time_entries.find_one({"id": entry_id}, {"_id": 0})
    return updated


@task_manager_router.delete("/time-entries/{entry_id}")
async def delete_time_entry(
    entry_id: str,
    current_user: User = Depends(get_current_user)
):
    """Delete a time entry"""
    existing = await db.tm_time_entries.find_one(
        {"id": entry_id, "tenant_id": current_user.tenant_id, "is_active": True}
    )
    
    if not existing:
        raise HTTPException(status_code=404, detail="Time entry not found")
    
    # Only allow owner to delete
    if existing.get("user_id") != current_user.id:
        raise HTTPException(status_code=403, detail="You can only delete your own time entries")
    
    await db.tm_time_entries.update_one(
        {"id": entry_id},
        {"$set": {"is_active": False, "deleted_at": datetime.now(timezone.utc)}}
    )
    
    return {"success": True}


# Timer state management (for start/stop)
@task_manager_router.post("/tasks/{task_id}/timer/start")
async def start_task_timer(
    task_id: str,
    current_user: User = Depends(get_current_user)
):
    """Start a timer for a task"""
    task = await db.tm_tasks.find_one(
        {"id": task_id, "tenant_id": current_user.tenant_id, "is_active": True}
    )
    
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    # Check if user already has an active timer
    existing_timer = await db.tm_active_timers.find_one({
        "user_id": current_user.id,
        "tenant_id": current_user.tenant_id
    })
    
    if existing_timer:
        raise HTTPException(
            status_code=400, 
            detail=f"You already have an active timer on another task"
        )
    
    now = datetime.now(timezone.utc)
    timer_data = {
        "id": str(uuid.uuid4()),
        "tenant_id": current_user.tenant_id,
        "user_id": current_user.id,
        "task_id": task_id,
        "project_id": task.get("project_id"),
        "started_at": now
    }
    
    await db.tm_active_timers.insert_one(timer_data)
    timer_data.pop("_id", None)
    
    return timer_data


@task_manager_router.post("/tasks/{task_id}/timer/stop")
async def stop_task_timer(
    task_id: str,
    description: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """Stop the timer and log the time entry"""
    timer = await db.tm_active_timers.find_one({
        "task_id": task_id,
        "user_id": current_user.id,
        "tenant_id": current_user.tenant_id
    })
    
    if not timer:
        raise HTTPException(status_code=404, detail="No active timer found for this task")
    
    now = datetime.now(timezone.utc)
    started_at = timer.get("started_at")
    
    # Calculate duration
    duration_seconds = (now - started_at).total_seconds()
    duration_minutes = max(1, int(duration_seconds / 60))  # Minimum 1 minute
    
    # Create time entry
    entry_data = {
        "id": str(uuid.uuid4()),
        "tenant_id": current_user.tenant_id,
        "task_id": task_id,
        "project_id": timer.get("project_id"),
        "user_id": current_user.id,
        "duration_minutes": duration_minutes,
        "description": description,
        "logged_date": now,
        "started_at": started_at,
        "ended_at": now,
        "created_at": now,
        "updated_at": now,
        "is_active": True
    }
    
    await db.tm_time_entries.insert_one(entry_data)
    
    # Delete the active timer
    await db.tm_active_timers.delete_one({"id": timer["id"]})
    
    entry_data.pop("_id", None)
    entry_data["user"] = {
        "id": current_user.id,
        "name": f"{current_user.first_name or ''} {current_user.last_name or ''}".strip(),
        "email": current_user.email
    }
    
    return entry_data


@task_manager_router.get("/timer/active")
async def get_active_timer(
    current_user: User = Depends(get_current_user)
):
    """Get user's active timer if any"""
    timer = await db.tm_active_timers.find_one(
        {"user_id": current_user.id, "tenant_id": current_user.tenant_id},
        {"_id": 0}
    )
    
    if not timer:
        return {"active": False}
    
    # Get task info
    task = await db.tm_tasks.find_one(
        {"id": timer["task_id"]},
        {"_id": 0, "id": 1, "title": 1, "project_id": 1}
    )
    
    now = datetime.now(timezone.utc)
    elapsed_seconds = (now - timer["started_at"]).total_seconds()
    
    return {
        "active": True,
        "timer": timer,
        "task": task,
        "elapsed_seconds": int(elapsed_seconds),
        "elapsed_minutes": int(elapsed_seconds / 60)
    }


@task_manager_router.get("/projects/{project_id}/time-summary")
async def get_project_time_summary(
    project_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get total time tracked for a project"""
    pipeline = [
        {"$match": {
            "project_id": project_id,
            "tenant_id": current_user.tenant_id,
            "is_active": True
        }},
        {"$group": {
            "_id": "$task_id",
            "total_minutes": {"$sum": "$duration_minutes"}
        }}
    ]
    
    task_totals = await db.tm_time_entries.aggregate(pipeline).to_list(1000)
    
    total_minutes = sum(t.get("total_minutes", 0) for t in task_totals)
    
    return {
        "project_id": project_id,
        "total_minutes": total_minutes,
        "total_hours": round(total_minutes / 60, 2),
        "tasks_tracked": len(task_totals)
    }


# ============================================================================
# PHASE 5: AI ASSISTANT
# ============================================================================

from emergentintegrations.llm.chat import LlmChat, UserMessage
from dotenv import load_dotenv

# Load environment variables
load_dotenv()


class AIAssistantAction(str, Enum):
    IMPROVE_DESCRIPTION = "improve_description"
    SUGGEST_PRIORITY = "suggest_priority"
    NOTES_TO_TASKS = "notes_to_tasks"


class AIRequest(PydanticBaseModel):
    action: str
    task_id: Optional[str] = None
    input_text: Optional[str] = None
    project_id: Optional[str] = None


class NotesToTasksRequest(PydanticBaseModel):
    notes: str
    project_id: str


# AI Feature flag check
async def check_ai_enabled(tenant_id: str) -> bool:
    """Check if AI features are enabled for the tenant"""
    settings = await db.tm_settings.find_one({"tenant_id": tenant_id})
    if not settings:
        return True  # Default to enabled
    return settings.get("ai_enabled", True)


@task_manager_router.get("/ai/settings")
async def get_ai_settings(
    current_user: User = Depends(get_current_user)
):
    """Get AI feature settings"""
    settings = await db.tm_settings.find_one(
        {"tenant_id": current_user.tenant_id},
        {"_id": 0}
    )
    return {
        "ai_enabled": settings.get("ai_enabled", True) if settings else True
    }


@task_manager_router.put("/ai/settings")
async def update_ai_settings(
    ai_enabled: bool,
    current_user: User = Depends(get_current_user)
):
    """Update AI feature settings (admin only)"""
    await db.tm_settings.update_one(
        {"tenant_id": current_user.tenant_id},
        {"$set": {"ai_enabled": ai_enabled, "updated_at": datetime.now(timezone.utc)}},
        upsert=True
    )
    return {"success": True, "ai_enabled": ai_enabled}


@task_manager_router.post("/ai/improve-description")
async def ai_improve_description(
    task_id: str,
    current_user: User = Depends(get_current_user)
):
    """AI improves task description into Problem, Acceptance Criteria, Steps"""
    # Check if AI is enabled
    if not await check_ai_enabled(current_user.tenant_id):
        raise HTTPException(status_code=403, detail="AI features are disabled")
    
    # Get task
    task = await db.tm_tasks.find_one(
        {"id": task_id, "tenant_id": current_user.tenant_id, "is_active": True},
        {"_id": 0}
    )
    
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    title = task.get("title", "")
    description = task.get("description", "")
    
    if not description and not title:
        raise HTTPException(status_code=400, detail="Task has no title or description to improve")
    
    # Prepare the prompt
    prompt = f"""You are a helpful task management assistant. Given the following task information, please expand and improve it into a well-structured format.

Task Title: {title}
Current Description: {description or '(none provided)'}

Please provide an improved description with the following sections:

## Problem Statement
[Describe what problem this task is solving]

## Acceptance Criteria
[List specific, testable criteria for completion]

## Steps to Complete
[List actionable steps to complete this task]

Keep the response concise but complete. Do not add unnecessary fluff."""

    try:
        api_key = os.environ.get("EMERGENT_LLM_KEY")
        if not api_key:
            raise HTTPException(status_code=500, detail="AI service not configured")
        
        chat = LlmChat(
            api_key=api_key,
            session_id=f"task-improve-{task_id}-{uuid.uuid4()}",
            system_message="You are a helpful task management assistant that helps improve task descriptions."
        )
        chat.with_model("openai", "gpt-5.2")
        
        user_message = UserMessage(text=prompt)
        response = await chat.send_message(user_message)
        
        # Log AI usage
        await db.tm_ai_logs.insert_one({
            "id": str(uuid.uuid4()),
            "tenant_id": current_user.tenant_id,
            "user_id": current_user.id,
            "action": "improve_description",
            "task_id": task_id,
            "input_length": len(prompt),
            "output_length": len(response),
            "created_at": datetime.now(timezone.utc)
        })
        
        return {
            "success": True,
            "improved_description": response,
            "reasoning": "AI analyzed your task title and description to create a structured format with Problem Statement, Acceptance Criteria, and Steps to Complete."
        }
        
    except Exception as e:
        logger.error(f"AI improve description error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"AI service error: {str(e)}")


@task_manager_router.post("/ai/suggest-priority")
async def ai_suggest_priority(
    task_ids: List[str],
    current_user: User = Depends(get_current_user)
):
    """AI suggests priority based on due date, dependencies, overdue state"""
    # Check if AI is enabled
    if not await check_ai_enabled(current_user.tenant_id):
        raise HTTPException(status_code=403, detail="AI features are disabled")
    
    # Limit to reasonable batch size
    if len(task_ids) > 20:
        raise HTTPException(status_code=400, detail="Maximum 20 tasks at a time")
    
    # Get tasks
    tasks = await db.tm_tasks.find(
        {"id": {"$in": task_ids}, "tenant_id": current_user.tenant_id, "is_active": True},
        {"_id": 0}
    ).to_list(20)
    
    if not tasks:
        raise HTTPException(status_code=404, detail="No tasks found")
    
    now = datetime.now(timezone.utc)
    
    # Prepare task summaries for AI
    task_summaries = []
    for task in tasks:
        due_date = task.get("due_date")
        is_overdue = False
        days_until_due = None
        
        if due_date:
            if isinstance(due_date, str):
                due_date = datetime.fromisoformat(due_date.replace('Z', '+00:00'))
            is_overdue = due_date < now
            days_until_due = (due_date - now).days
        
        summary = {
            "id": task["id"],
            "title": task.get("title", "Untitled"),
            "current_priority": task.get("priority", "medium"),
            "status": task.get("status", "todo"),
            "is_overdue": is_overdue,
            "days_until_due": days_until_due,
            "has_dependencies": bool(task.get("blocked_by", [])),
            "is_blocking_others": bool(task.get("blocking", [])),
            "has_assignee": bool(task.get("assignee_id"))
        }
        task_summaries.append(summary)
    
    # Prepare the prompt
    import json
    prompt = f"""You are a task prioritization assistant. Analyze the following tasks and suggest appropriate priorities.

Tasks:
{json.dumps(task_summaries, indent=2, default=str)}

Priority levels available: low, medium, high, urgent

For each task, consider:
1. Due date: Overdue tasks should be higher priority
2. Dependencies: Tasks blocking others should be prioritized
3. Current status: Tasks in progress might need priority adjustment
4. Time sensitivity: Tasks due soon need higher priority

Respond with a JSON array of objects with this structure:
[{{"task_id": "...", "suggested_priority": "...", "reasoning": "..."}}]

Keep reasoning brief (1-2 sentences). Only return the JSON array, nothing else."""

    try:
        api_key = os.environ.get("EMERGENT_LLM_KEY")
        if not api_key:
            raise HTTPException(status_code=500, detail="AI service not configured")
        
        chat = LlmChat(
            api_key=api_key,
            session_id=f"task-priority-{uuid.uuid4()}",
            system_message="You are a task prioritization assistant. You respond only with valid JSON."
        )
        chat.with_model("openai", "gpt-5.2")
        
        user_message = UserMessage(text=prompt)
        response = await chat.send_message(user_message)
        
        # Parse the response
        try:
            # Clean up response - remove markdown code blocks if present
            clean_response = response.strip()
            if clean_response.startswith("```"):
                clean_response = clean_response.split("\n", 1)[1]
                clean_response = clean_response.rsplit("```", 1)[0]
            
            suggestions = json.loads(clean_response)
        except json.JSONDecodeError:
            suggestions = [{"task_id": t["id"], "suggested_priority": t.get("current_priority", "medium"), "reasoning": "Could not analyze"} for t in tasks]
        
        # Log AI usage
        await db.tm_ai_logs.insert_one({
            "id": str(uuid.uuid4()),
            "tenant_id": current_user.tenant_id,
            "user_id": current_user.id,
            "action": "suggest_priority",
            "task_count": len(task_ids),
            "created_at": datetime.now(timezone.utc)
        })
        
        return {
            "success": True,
            "suggestions": suggestions
        }
        
    except Exception as e:
        logger.error(f"AI suggest priority error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"AI service error: {str(e)}")


@task_manager_router.post("/ai/notes-to-tasks")
async def ai_notes_to_tasks(
    request: NotesToTasksRequest,
    current_user: User = Depends(get_current_user)
):
    """AI converts pasted notes into multiple task suggestions"""
    # Check if AI is enabled
    if not await check_ai_enabled(current_user.tenant_id):
        raise HTTPException(status_code=403, detail="AI features are disabled")
    
    if not request.notes.strip():
        raise HTTPException(status_code=400, detail="Notes text is required")
    
    # Verify project exists
    project = await db.tm_projects.find_one(
        {"id": request.project_id, "tenant_id": current_user.tenant_id, "is_active": True}
    )
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Prepare the prompt
    import json
    prompt = f"""You are a task extraction assistant. Convert the following notes/text into actionable tasks for a project management system.

Notes:
{request.notes}

Extract individual tasks from these notes. For each task, provide:
1. A clear, actionable title (imperative form, e.g., "Implement user login")
2. A brief description if details are available
3. Suggested priority (low, medium, high, urgent)
4. Suggested task type (feature, bug, task, improvement)

Respond with a JSON array of task objects:
[{{"title": "...", "description": "...", "priority": "medium", "task_type": "task"}}]

Rules:
- Each task should be independently actionable
- Titles should be concise but clear
- If the notes mention bugs or issues, mark them as type "bug"
- Default to "task" type if unclear
- Limit to maximum 10 tasks
- Only return the JSON array, nothing else."""

    try:
        api_key = os.environ.get("EMERGENT_LLM_KEY")
        if not api_key:
            raise HTTPException(status_code=500, detail="AI service not configured")
        
        chat = LlmChat(
            api_key=api_key,
            session_id=f"notes-to-tasks-{uuid.uuid4()}",
            system_message="You are a task extraction assistant. You respond only with valid JSON."
        )
        chat.with_model("openai", "gpt-5.2")
        
        user_message = UserMessage(text=prompt)
        response = await chat.send_message(user_message)
        
        # Parse the response
        try:
            clean_response = response.strip()
            if clean_response.startswith("```"):
                clean_response = clean_response.split("\n", 1)[1]
                clean_response = clean_response.rsplit("```", 1)[0]
            
            suggested_tasks = json.loads(clean_response)
        except json.JSONDecodeError:
            raise HTTPException(status_code=500, detail="AI could not parse the notes into tasks")
        
        # Validate and clean up suggestions
        valid_priorities = ["low", "medium", "high", "urgent"]
        valid_types = ["feature", "bug", "task", "improvement"]
        
        cleaned_tasks = []
        for task in suggested_tasks[:10]:  # Limit to 10
            cleaned_tasks.append({
                "title": task.get("title", "Untitled Task")[:200],
                "description": task.get("description", "")[:1000],
                "priority": task.get("priority", "medium") if task.get("priority") in valid_priorities else "medium",
                "task_type": task.get("task_type", "task") if task.get("task_type") in valid_types else "task"
            })
        
        # Log AI usage
        await db.tm_ai_logs.insert_one({
            "id": str(uuid.uuid4()),
            "tenant_id": current_user.tenant_id,
            "user_id": current_user.id,
            "action": "notes_to_tasks",
            "input_length": len(request.notes),
            "tasks_suggested": len(cleaned_tasks),
            "created_at": datetime.now(timezone.utc)
        })
        
        return {
            "success": True,
            "suggested_tasks": cleaned_tasks,
            "project_id": request.project_id,
            "reasoning": f"AI extracted {len(cleaned_tasks)} actionable tasks from your notes. Please review and confirm before creating."
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"AI notes to tasks error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"AI service error: {str(e)}")


@task_manager_router.post("/ai/notes-to-tasks/confirm")
async def ai_confirm_notes_to_tasks(
    tasks: List[Dict[str, Any]],
    project_id: str,
    current_user: User = Depends(get_current_user)
):
    """Confirm and create tasks from AI suggestions"""
    # Verify project exists
    project = await db.tm_projects.find_one(
        {"id": project_id, "tenant_id": current_user.tenant_id, "is_active": True}
    )
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    created_tasks = []
    now = datetime.now(timezone.utc)
    
    for task_data in tasks:
        task_id = str(uuid.uuid4())
        task_doc = {
            "id": task_id,
            "tenant_id": current_user.tenant_id,
            "project_id": project_id,
            "title": task_data.get("title", "Untitled Task"),
            "description": task_data.get("description", ""),
            "status": "todo",
            "priority": task_data.get("priority", "medium"),
            "task_type": task_data.get("task_type", "task"),
            "created_by": current_user.id,
            "created_at": now,
            "updated_at": now,
            "is_active": True,
            "custom_fields": {},
            "ai_generated": True
        }
        
        await db.tm_tasks.insert_one(task_doc)
        task_doc.pop("_id", None)
        created_tasks.append(task_doc)
    
    return {
        "success": True,
        "created_count": len(created_tasks),
        "tasks": created_tasks
    }



# ============================================================================
# PHASE 11: BULK TASK OPERATIONS
# ============================================================================

class BulkUpdateRequest(PydanticBaseModel):
    """Request model for bulk task updates"""
    task_ids: List[str]
    updates: Dict[str, Any]

    class Config:
        extra = "forbid"


@task_manager_router.post("/tasks/bulk-update")
async def bulk_update_tasks(
    request: BulkUpdateRequest,
    current_user: User = Depends(get_current_user)
):
    """
    Bulk update multiple tasks at once.
    
    Supported update fields:
    - status: Change task status
    - priority: Change priority
    - assignee_id: Change assignee (use null to unassign)
    - tags: Replace all tags
    - add_tags: Add tags to existing tags
    - remove_tags: Remove specific tags
    - due_date: Change due date (ISO format)
    - add_comment: Add a comment to all tasks
    
    Returns detailed results showing success/failure for each task.
    Tasks pending approval or with validation errors will be skipped.
    """
    from ..services.bulk_operations_service import BulkOperationsService
    
    if not request.task_ids:
        raise HTTPException(status_code=400, detail="task_ids cannot be empty")
    
    if not request.updates:
        raise HTTPException(status_code=400, detail="updates cannot be empty")
    
    if len(request.task_ids) > 100:
        raise HTTPException(
            status_code=400,
            detail="Cannot update more than 100 tasks at once"
        )
    
    bulk_service = BulkOperationsService(db)
    results = await bulk_service.bulk_update_tasks(
        task_ids=request.task_ids,
        updates=request.updates,
        user_id=current_user.id,
        tenant_id=current_user.tenant_id
    )
    
    if "error" in results:
        raise HTTPException(status_code=400, detail=results["error"])
    
    return results


@task_manager_router.post("/tasks/bulk-delete")
async def bulk_delete_tasks(
    task_ids: List[str],
    current_user: User = Depends(get_current_user)
):
    """Soft delete multiple tasks at once"""
    if not task_ids:
        raise HTTPException(status_code=400, detail="task_ids cannot be empty")
    
    if len(task_ids) > 100:
        raise HTTPException(
            status_code=400,
            detail="Cannot delete more than 100 tasks at once"
        )
    
    now = datetime.now(timezone.utc)
    
    result = await db.tm_tasks.update_many(
        {
            "id": {"$in": task_ids},
            "tenant_id": current_user.tenant_id,
            "is_active": True
        },
        {
            "$set": {
                "is_active": False,
                "deleted_at": now,
                "deleted_by": current_user.id
            }
        }
    )
    
    return {
        "success": True,
        "deleted_count": result.modified_count,
        "requested_count": len(task_ids)
    }

