"""
Task Manager Data Schemas
Pydantic models for Workspace, Space, Project, Task, Subtask, Checklist
"""
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum


# ============================================================================
# ENUMS
# ============================================================================

class TaskStatus(str, Enum):
    TODO = "todo"
    IN_PROGRESS = "in_progress"
    BLOCKED = "blocked"
    DONE = "done"
    PENDING_APPROVAL = "pending_approval"


class TaskPriority(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    URGENT = "urgent"


class TaskType(str, Enum):
    BUG = "bug"
    FEATURE = "feature"
    SUPPORT = "support"
    SALES = "sales"
    OTHER = "other"


class ProjectVisibility(str, Enum):
    PRIVATE = "private"
    SPACE = "space"
    PUBLIC = "public"


class DefaultView(str, Enum):
    LIST = "list"
    BOARD = "board"
    TIMELINE = "timeline"


# ============================================================================
# WORKSPACE
# ============================================================================

class WorkspaceBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = "#3b82f6"


class WorkspaceCreate(WorkspaceBase):
    pass


class WorkspaceUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None


class Workspace(WorkspaceBase):
    id: str
    tenant_id: str
    created_by: str
    created_at: datetime
    updated_at: datetime
    is_active: bool = True

    class Config:
        from_attributes = True


# ============================================================================
# SPACE
# ============================================================================

class SpaceBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = None
    workspace_id: str
    icon: Optional[str] = None
    color: Optional[str] = "#6366f1"


class SpaceCreate(SpaceBase):
    pass


class SpaceUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None


class Space(SpaceBase):
    id: str
    tenant_id: str
    created_by: str
    created_at: datetime
    updated_at: datetime
    is_active: bool = True

    class Config:
        from_attributes = True


# ============================================================================
# PROJECT
# ============================================================================

class ProjectBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    space_id: Optional[str] = None
    visibility: ProjectVisibility = ProjectVisibility.SPACE
    default_view: DefaultView = DefaultView.LIST
    owner_id: Optional[str] = None
    start_date: Optional[datetime] = None
    target_date: Optional[datetime] = None
    color: Optional[str] = "#10b981"
    icon: Optional[str] = None


class ProjectCreate(ProjectBase):
    pass


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    space_id: Optional[str] = None
    visibility: Optional[ProjectVisibility] = None
    default_view: Optional[DefaultView] = None
    owner_id: Optional[str] = None
    start_date: Optional[datetime] = None
    target_date: Optional[datetime] = None
    color: Optional[str] = None
    icon: Optional[str] = None
    is_archived: Optional[bool] = None


class Project(ProjectBase):
    id: str
    tenant_id: str
    created_by: str
    created_at: datetime
    updated_at: datetime
    is_active: bool = True
    is_archived: bool = False
    task_count: int = 0
    completed_task_count: int = 0

    class Config:
        from_attributes = True


# ============================================================================
# EPIC / INITIATIVE
# ============================================================================

class EpicBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    project_id: str
    status: TaskStatus = TaskStatus.TODO
    owner_id: Optional[str] = None
    target_date: Optional[datetime] = None
    color: Optional[str] = "#8b5cf6"


class EpicCreate(EpicBase):
    pass


class EpicUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[TaskStatus] = None
    owner_id: Optional[str] = None
    target_date: Optional[datetime] = None
    color: Optional[str] = None


class Epic(EpicBase):
    id: str
    tenant_id: str
    created_by: str
    created_at: datetime
    updated_at: datetime
    is_active: bool = True
    task_count: int = 0
    completed_task_count: int = 0

    class Config:
        from_attributes = True


# ============================================================================
# TASK
# ============================================================================

class TaskBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=500)
    description: Optional[str] = None
    project_id: str
    epic_id: Optional[str] = None
    assignee_id: Optional[str] = None
    status: TaskStatus = TaskStatus.TODO
    priority: TaskPriority = TaskPriority.MEDIUM
    task_type: TaskType = TaskType.OTHER
    due_date: Optional[datetime] = None
    start_date: Optional[datetime] = None
    tags: List[str] = []
    # CRM linking
    linked_lead_id: Optional[str] = None
    linked_account_id: Optional[str] = None
    linked_deal_id: Optional[str] = None
    linked_ticket_id: Optional[str] = None
    # Dependencies
    blocked_by: List[str] = []  # List of task IDs
    blocking: List[str] = []  # List of task IDs
    # Ordering
    order_index: int = 0


class TaskCreate(TaskBase):
    pass


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    epic_id: Optional[str] = None
    assignee_id: Optional[str] = None
    status: Optional[TaskStatus] = None
    priority: Optional[TaskPriority] = None
    task_type: Optional[TaskType] = None
    due_date: Optional[datetime] = None
    start_date: Optional[datetime] = None
    tags: Optional[List[str]] = None
    linked_lead_id: Optional[str] = None
    linked_account_id: Optional[str] = None
    linked_deal_id: Optional[str] = None
    linked_ticket_id: Optional[str] = None
    blocked_by: Optional[List[str]] = None
    blocking: Optional[List[str]] = None
    order_index: Optional[int] = None


class Task(TaskBase):
    id: str
    tenant_id: str
    created_by: str
    created_at: datetime
    updated_at: datetime
    is_active: bool = True
    subtask_count: int = 0
    completed_subtask_count: int = 0
    checklist_count: int = 0
    completed_checklist_count: int = 0
    # Computed from dependencies
    is_blocked: bool = False
    # Approval fields (Phase 8)
    approval_status: Optional[str] = None
    approval_instance_id: Optional[str] = None
    # Recurring task fields (Phase 14)
    is_recurring_generated: Optional[bool] = None
    recurrence_rule_id: Optional[str] = None

    class Config:
        from_attributes = True


# ============================================================================
# SUBTASK
# ============================================================================

class SubtaskBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=500)
    task_id: str
    assignee_id: Optional[str] = None
    status: TaskStatus = TaskStatus.TODO
    order_index: int = 0


class SubtaskCreate(SubtaskBase):
    pass


class SubtaskUpdate(BaseModel):
    title: Optional[str] = None
    assignee_id: Optional[str] = None
    status: Optional[TaskStatus] = None
    order_index: Optional[int] = None


class Subtask(SubtaskBase):
    id: str
    tenant_id: str
    created_by: str
    created_at: datetime
    updated_at: datetime
    is_active: bool = True

    class Config:
        from_attributes = True


# ============================================================================
# CHECKLIST ITEM
# ============================================================================

class ChecklistItemBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=500)
    task_id: str
    is_completed: bool = False
    order_index: int = 0


class ChecklistItemCreate(ChecklistItemBase):
    pass


class ChecklistItemUpdate(BaseModel):
    title: Optional[str] = None
    is_completed: Optional[bool] = None
    order_index: Optional[int] = None


class ChecklistItem(ChecklistItemBase):
    id: str
    tenant_id: str
    created_by: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ============================================================================
# RESPONSE MODELS
# ============================================================================

class TaskWithDetails(Task):
    """Task with expanded details"""
    subtasks: List[Subtask] = []
    checklist_items: List[ChecklistItem] = []
    assignee: Optional[Dict[str, Any]] = None
    project: Optional[Dict[str, Any]] = None
    epic: Optional[Dict[str, Any]] = None


class ProjectWithStats(Project):
    """Project with task statistics"""
    tasks_by_status: Dict[str, int] = {}
    overdue_count: int = 0
    epics: List[Epic] = []


# ============================================================================
# TASK COMMENT (Phase 3)
# ============================================================================

class CommentBase(BaseModel):
    content: str = Field(..., min_length=1, max_length=5000)
    task_id: str
    mentions: List[str] = []  # List of user IDs mentioned


class CommentCreate(CommentBase):
    pass


class CommentUpdate(BaseModel):
    content: Optional[str] = None
    mentions: Optional[List[str]] = None


class Comment(CommentBase):
    id: str
    tenant_id: str
    created_by: str
    created_at: datetime
    updated_at: datetime
    is_active: bool = True
    author: Optional[Dict[str, Any]] = None

    class Config:
        from_attributes = True


# ============================================================================
# NOTIFICATION (Phase 3)
# ============================================================================

class NotificationType(str, Enum):
    MENTION = "mention"
    ASSIGNMENT = "assignment"
    DEPENDENCY_RESOLVED = "dependency_resolved"
    DUE_DATE_REMINDER = "due_date_reminder"
    TASK_COMPLETED = "task_completed"


class Notification(BaseModel):
    id: str
    tenant_id: str
    user_id: str  # Recipient
    type: NotificationType
    title: str
    message: str
    task_id: Optional[str] = None
    project_id: Optional[str] = None
    comment_id: Optional[str] = None
    triggered_by: str  # User who triggered the notification
    is_read: bool = False
    created_at: datetime
    read_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ============================================================================
# ACTIVITY LOG (Phase 3)
# ============================================================================

class ActivityType(str, Enum):
    TASK_CREATED = "task_created"
    TASK_UPDATED = "task_updated"
    TASK_DELETED = "task_deleted"
    STATUS_CHANGED = "status_changed"
    ASSIGNEE_CHANGED = "assignee_changed"
    DEPENDENCY_ADDED = "dependency_added"
    DEPENDENCY_REMOVED = "dependency_removed"
    COMMENT_ADDED = "comment_added"
    DATES_CHANGED = "dates_changed"


class ActivityLog(BaseModel):
    id: str
    tenant_id: str
    task_id: str
    activity_type: ActivityType
    description: str
    old_value: Optional[Dict[str, Any]] = None
    new_value: Optional[Dict[str, Any]] = None
    created_by: str
    created_at: datetime

    class Config:
        from_attributes = True
