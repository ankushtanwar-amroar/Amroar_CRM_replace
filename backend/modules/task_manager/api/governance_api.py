"""
Task Manager Governance API Router
Handles Formula Fields, Validation Rules, and SLA Tracking
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from typing import Optional, Dict, Any, List
from datetime import datetime, timezone
from pydantic import BaseModel
import uuid
import logging

from motor.motor_asyncio import AsyncIOMotorClient
import os

from server import get_current_user
from shared.models import User

from ..services.formula_service import FormulaEvaluator
from ..services.validation_service import ValidationService
from ..services.sla_service import SLAService, SLAStatus
from ..services.approval_service import ApprovalService
from ..services.email_template_service import EmailTemplateService
from ..services.approval_analytics_service import ApprovalAnalyticsService

logger = logging.getLogger(__name__)

# Database connection
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "crm_platform")
client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

# Initialize services
formula_evaluator = FormulaEvaluator(db)
validation_service = ValidationService(db)
sla_service = SLAService(db)
approval_service = ApprovalService(db)
email_template_service = EmailTemplateService(db)
approval_analytics_service = ApprovalAnalyticsService(db)

# Create router
governance_router = APIRouter(prefix="/api/task-manager", tags=["task-manager-governance"])


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

async def is_admin_user(user: User, db) -> bool:
    """Check if user has admin/owner role"""
    # For now, allow all authenticated users to edit templates
    # In production, this should check role properly
    if user.id:
        return True
    
    if not user.role_id:
        return True  # Allow if no role system configured
    
    # Check role name from database
    role = await db.roles.find_one({"id": user.role_id})
    if role:
        role_name = role.get("name", "").lower()
        return role_name in ["admin", "administrator", "owner", "superadmin"]
    
    return True


# ============================================================================
# FORMULA FIELD ENDPOINTS
# ============================================================================

class FormulaValidationRequest(BaseModel):
    formula_expression: str
    project_id: Optional[str] = None


@governance_router.post("/formulas/validate")
async def validate_formula(
    request: FormulaValidationRequest,
    current_user: User = Depends(get_current_user)
):
    """Validate a formula expression before saving"""
    formula = request.formula_expression
    
    # Validate syntax
    is_valid, error = formula_evaluator.validate_formula_syntax(formula)
    if not is_valid:
        return {
            "valid": False,
            "error": error,
            "referenced_fields": []
        }
    
    # Extract referenced fields
    referenced_fields = formula_evaluator.extract_field_references(formula)
    
    # Validate field references
    is_valid, error, valid_fields = await formula_evaluator.validate_field_references(
        formula, current_user.tenant_id, request.project_id
    )
    
    if not is_valid:
        return {
            "valid": False,
            "error": error,
            "referenced_fields": referenced_fields
        }
    
    return {
        "valid": True,
        "error": None,
        "referenced_fields": referenced_fields
    }


@governance_router.post("/formulas/test")
async def test_formula(
    formula_expression: str,
    test_values: Dict[str, Any],
    current_user: User = Depends(get_current_user)
):
    """Test a formula with sample values"""
    # Validate syntax first
    is_valid, error = formula_evaluator.validate_formula_syntax(formula_expression)
    if not is_valid:
        raise HTTPException(status_code=400, detail=error)
    
    # Evaluate
    result = formula_evaluator.evaluate(formula_expression, test_values)
    
    return {
        "formula": formula_expression,
        "test_values": test_values,
        "result": result,
        "error": None if result is not None else "Evaluation failed"
    }


# ============================================================================
# VALIDATION RULES ENDPOINTS
# ============================================================================

class ValidationRuleCondition(BaseModel):
    field: str
    operator: str
    value: Optional[Any] = None


class ValidationRuleCreate(BaseModel):
    name: str
    description: Optional[str] = None
    scope: str = "global"  # global or project
    project_id: Optional[str] = None
    conditions: List[ValidationRuleCondition]
    condition_logic: str = "all"  # all or any
    error_message: str
    target_field: Optional[str] = None


class ValidationRuleUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    conditions: Optional[List[ValidationRuleCondition]] = None
    condition_logic: Optional[str] = None
    error_message: Optional[str] = None
    target_field: Optional[str] = None
    is_active: Optional[bool] = None


@governance_router.get("/validation-rules")
async def list_validation_rules(
    project_id: Optional[str] = None,
    include_global: bool = True,
    current_user: User = Depends(get_current_user)
):
    """List validation rules"""
    query = {"tenant_id": current_user.tenant_id, "is_active": True}
    
    if project_id:
        if include_global:
            query["$or"] = [
                {"scope": "global"},
                {"project_id": project_id}
            ]
        else:
            query["project_id"] = project_id
    
    rules = await db.tm_validation_rules.find(
        query, {"_id": 0}
    ).sort("order_index", 1).to_list(100)
    
    return rules


@governance_router.get("/validation-rules/{rule_id}")
async def get_validation_rule(
    rule_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get a specific validation rule"""
    rule = await db.tm_validation_rules.find_one(
        {"id": rule_id, "tenant_id": current_user.tenant_id},
        {"_id": 0}
    )
    
    if not rule:
        raise HTTPException(status_code=404, detail="Validation rule not found")
    
    return rule


@governance_router.post("/validation-rules")
async def create_validation_rule(
    rule: ValidationRuleCreate,
    current_user: User = Depends(get_current_user)
):
    """Create a new validation rule"""
    # Validate scope
    if rule.scope == "project" and not rule.project_id:
        raise HTTPException(status_code=400, detail="project_id required for project-scoped rules")
    
    # Validate condition logic
    if rule.condition_logic not in ["all", "any"]:
        raise HTTPException(status_code=400, detail="condition_logic must be 'all' or 'any'")
    
    # Validate operators
    for condition in rule.conditions:
        if condition.operator not in validation_service.SUPPORTED_OPERATORS:
            raise HTTPException(
                status_code=400, 
                detail=f"Invalid operator: {condition.operator}. Supported: {validation_service.SUPPORTED_OPERATORS}"
            )
    
    # Get max order index
    max_order = await db.tm_validation_rules.find_one(
        {"tenant_id": current_user.tenant_id},
        sort=[("order_index", -1)]
    )
    next_order = (max_order.get("order_index", 0) + 1) if max_order else 0
    
    now = datetime.now(timezone.utc)
    rule_data = {
        "id": str(uuid.uuid4()),
        "tenant_id": current_user.tenant_id,
        "name": rule.name,
        "description": rule.description,
        "scope": rule.scope,
        "project_id": rule.project_id if rule.scope == "project" else None,
        "conditions": [c.dict() for c in rule.conditions],
        "condition_logic": rule.condition_logic,
        "error_message": rule.error_message,
        "target_field": rule.target_field,
        "order_index": next_order,
        "is_active": True,
        "created_by": current_user.id,
        "created_at": now,
        "updated_at": now
    }
    
    await db.tm_validation_rules.insert_one(rule_data)
    rule_data.pop("_id", None)
    
    return rule_data


@governance_router.put("/validation-rules/{rule_id}")
async def update_validation_rule(
    rule_id: str,
    rule: ValidationRuleUpdate,
    current_user: User = Depends(get_current_user)
):
    """Update a validation rule"""
    existing = await db.tm_validation_rules.find_one(
        {"id": rule_id, "tenant_id": current_user.tenant_id}
    )
    
    if not existing:
        raise HTTPException(status_code=404, detail="Validation rule not found")
    
    update_data = {}
    
    if rule.name is not None:
        update_data["name"] = rule.name
    if rule.description is not None:
        update_data["description"] = rule.description
    if rule.conditions is not None:
        update_data["conditions"] = [c.dict() for c in rule.conditions]
    if rule.condition_logic is not None:
        if rule.condition_logic not in ["all", "any"]:
            raise HTTPException(status_code=400, detail="condition_logic must be 'all' or 'any'")
        update_data["condition_logic"] = rule.condition_logic
    if rule.error_message is not None:
        update_data["error_message"] = rule.error_message
    if rule.target_field is not None:
        update_data["target_field"] = rule.target_field
    if rule.is_active is not None:
        update_data["is_active"] = rule.is_active
    
    update_data["updated_at"] = datetime.now(timezone.utc)
    
    await db.tm_validation_rules.update_one(
        {"id": rule_id},
        {"$set": update_data}
    )
    
    updated = await db.tm_validation_rules.find_one({"id": rule_id}, {"_id": 0})
    return updated


@governance_router.delete("/validation-rules/{rule_id}")
async def delete_validation_rule(
    rule_id: str,
    current_user: User = Depends(get_current_user)
):
    """Delete a validation rule"""
    result = await db.tm_validation_rules.update_one(
        {"id": rule_id, "tenant_id": current_user.tenant_id},
        {"$set": {"is_active": False, "deleted_at": datetime.now(timezone.utc)}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Validation rule not found")
    
    return {"success": True}


@governance_router.post("/validation-rules/{rule_id}/toggle")
async def toggle_validation_rule(
    rule_id: str,
    current_user: User = Depends(get_current_user)
):
    """Toggle validation rule active status"""
    existing = await db.tm_validation_rules.find_one(
        {"id": rule_id, "tenant_id": current_user.tenant_id}
    )
    
    if not existing:
        raise HTTPException(status_code=404, detail="Validation rule not found")
    
    new_status = not existing.get("is_active", True)
    
    await db.tm_validation_rules.update_one(
        {"id": rule_id},
        {"$set": {"is_active": new_status, "updated_at": datetime.now(timezone.utc)}}
    )
    
    return {"success": True, "is_active": new_status}


@governance_router.get("/validation-rules/logs")
async def get_validation_logs(
    rule_id: Optional[str] = None,
    task_id: Optional[str] = None,
    limit: int = Query(default=50, le=500),
    current_user: User = Depends(get_current_user)
):
    """Get validation failure logs"""
    logs = await validation_service.get_validation_logs(
        current_user.tenant_id,
        rule_id=rule_id,
        task_id=task_id,
        limit=limit
    )
    return {"logs": logs}


# ============================================================================
# SLA TRACKING ENDPOINTS
# ============================================================================

class ProjectSLAConfig(BaseModel):
    sla_enabled: bool
    sla_default_hours: Optional[float] = None
    sla_start_trigger: str = "creation"  # creation or status_change
    sla_pause_statuses: Optional[List[str]] = None


@governance_router.get("/projects/{project_id}/sla-config")
async def get_project_sla_config(
    project_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get SLA configuration for a project"""
    config = await sla_service.get_project_sla_config(project_id, current_user.tenant_id)
    return config


@governance_router.put("/projects/{project_id}/sla-config")
async def update_project_sla_config(
    project_id: str,
    config: ProjectSLAConfig,
    current_user: User = Depends(get_current_user)
):
    """Update SLA configuration for a project"""
    # Verify project exists
    project = await db.tm_projects.find_one(
        {"id": project_id, "tenant_id": current_user.tenant_id}
    )
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Validate trigger
    if config.sla_start_trigger not in ["creation", "status_change"]:
        raise HTTPException(status_code=400, detail="sla_start_trigger must be 'creation' or 'status_change'")
    
    update_data = {
        "sla_enabled": config.sla_enabled,
        "sla_default_hours": config.sla_default_hours,
        "sla_start_trigger": config.sla_start_trigger,
        "sla_pause_statuses": config.sla_pause_statuses or ["blocked"],
        "updated_at": datetime.now(timezone.utc)
    }
    
    await db.tm_projects.update_one(
        {"id": project_id},
        {"$set": update_data}
    )
    
    return {"success": True, **update_data}


@governance_router.get("/tasks/{task_id}/sla")
async def get_task_sla_status(
    task_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get SLA status for a task"""
    task = await db.tm_tasks.find_one(
        {"id": task_id, "tenant_id": current_user.tenant_id, "is_active": True},
        {"_id": 0}
    )
    
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    project_id = task.get("project_id")
    config = await sla_service.get_project_sla_config(project_id, current_user.tenant_id)
    
    sla_status = sla_service.calculate_sla_status(
        task,
        config.get("sla_pause_statuses", ["blocked"])
    )
    
    return sla_status


@governance_router.post("/tasks/{task_id}/sla/start")
async def start_task_sla(
    task_id: str,
    sla_hours: Optional[float] = None,
    current_user: User = Depends(get_current_user)
):
    """Manually start SLA tracking for a task"""
    task = await db.tm_tasks.find_one(
        {"id": task_id, "tenant_id": current_user.tenant_id, "is_active": True}
    )
    
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    if task.get("sla_started_at"):
        raise HTTPException(status_code=400, detail="SLA already started for this task")
    
    # Get default hours from project config if not provided
    if sla_hours is None:
        project_id = task.get("project_id")
        config = await sla_service.get_project_sla_config(project_id, current_user.tenant_id)
        sla_hours = config.get("sla_default_hours")
    
    if not sla_hours:
        raise HTTPException(status_code=400, detail="sla_hours is required")
    
    now = datetime.now(timezone.utc)
    
    await db.tm_tasks.update_one(
        {"id": task_id},
        {"$set": {
            "sla_hours": sla_hours,
            "sla_started_at": now,
            "sla_paused_at": None,
            "sla_total_paused_minutes": 0,
            "updated_at": now
        }}
    )
    
    return {"success": True, "sla_hours": sla_hours, "sla_started_at": now.isoformat()}


@governance_router.get("/dashboards/sla")
async def dashboard_sla_report(
    project_id: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """Get SLA dashboard data"""
    data = await sla_service.get_sla_dashboard_data(
        current_user.tenant_id,
        project_id
    )
    return data


# ============================================================================
# APPROVAL WORKFLOW ENDPOINTS
# ============================================================================

class ApprovalWorkflowCreate(BaseModel):
    name: str
    description: Optional[str] = None
    project_ids: List[str] = []  # Empty = applies to all projects
    trigger_status: str  # Status that triggers approval
    approval_type: str = "single"  # "single" or "sequential"
    approvers: List[Dict[str, Any]]  # [{type: "user"|"role"|"field", value: "..."}]
    on_approve_status: str
    on_reject_status: str


class ApprovalWorkflowUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    project_ids: Optional[List[str]] = None
    trigger_status: Optional[str] = None
    approval_type: Optional[str] = None
    approvers: Optional[List[Dict[str, Any]]] = None
    on_approve_status: Optional[str] = None
    on_reject_status: Optional[str] = None
    is_enabled: Optional[bool] = None


class ApprovalActionRequest(BaseModel):
    action: str  # "approve" or "reject"
    comment: Optional[str] = None


@governance_router.get("/approval-workflows")
async def list_approval_workflows(
    project_id: Optional[str] = None,
    enabled_only: bool = False,
    current_user: User = Depends(get_current_user)
):
    """List all approval workflows"""
    workflows = await approval_service.list_workflows(
        current_user.tenant_id,
        project_id=project_id,
        enabled_only=enabled_only
    )
    return {"workflows": workflows}


@governance_router.post("/approval-workflows")
async def create_approval_workflow(
    workflow: ApprovalWorkflowCreate,
    current_user: User = Depends(get_current_user)
):
    """Create a new approval workflow"""
    try:
        # Validate approval type
        if workflow.approval_type not in ["single", "sequential"]:
            raise HTTPException(
                status_code=400,
                detail="approval_type must be 'single' or 'sequential'"
            )
        
        # Validate approvers
        for approver in workflow.approvers:
            if approver.get("type") not in ["user", "role", "field"]:
                raise HTTPException(
                    status_code=400,
                    detail="Approver type must be 'user', 'role', or 'field'"
                )
        
        result = await approval_service.create_workflow(
            tenant_id=current_user.tenant_id,
            created_by=current_user.id,
            name=workflow.name,
            description=workflow.description,
            project_ids=workflow.project_ids,
            trigger_status=workflow.trigger_status,
            approval_type=workflow.approval_type,
            approvers=workflow.approvers,
            on_approve_status=workflow.on_approve_status,
            on_reject_status=workflow.on_reject_status
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@governance_router.get("/approval-workflows/{workflow_id}")
async def get_approval_workflow(
    workflow_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get a specific approval workflow"""
    workflow = await approval_service.get_workflow(workflow_id, current_user.tenant_id)
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return workflow


@governance_router.put("/approval-workflows/{workflow_id}")
async def update_approval_workflow(
    workflow_id: str,
    updates: ApprovalWorkflowUpdate,
    current_user: User = Depends(get_current_user)
):
    """Update an approval workflow"""
    update_data = {k: v for k, v in updates.model_dump().items() if v is not None}
    
    if not update_data:
        raise HTTPException(status_code=400, detail="No update data provided")
    
    result = await approval_service.update_workflow(
        workflow_id,
        current_user.tenant_id,
        update_data
    )
    
    if not result:
        raise HTTPException(status_code=404, detail="Workflow not found")
    
    return result


@governance_router.delete("/approval-workflows/{workflow_id}")
async def delete_approval_workflow(
    workflow_id: str,
    current_user: User = Depends(get_current_user)
):
    """Delete an approval workflow"""
    success = await approval_service.delete_workflow(workflow_id, current_user.tenant_id)
    if not success:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return {"success": True, "message": "Workflow deleted"}


@governance_router.post("/approval-workflows/{workflow_id}/toggle")
async def toggle_approval_workflow(
    workflow_id: str,
    current_user: User = Depends(get_current_user)
):
    """Toggle workflow enabled/disabled"""
    result = await approval_service.toggle_workflow(workflow_id, current_user.tenant_id)
    if not result:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return {"success": True, "is_enabled": result.get("is_enabled")}


# ============================================================================
# APPROVAL INSTANCE ENDPOINTS
# ============================================================================

@governance_router.get("/approvals/pending")
async def get_my_pending_approvals(
    current_user: User = Depends(get_current_user)
):
    """Get all pending approvals for the current user"""
    approvals = await approval_service.get_pending_approvals_for_user(
        current_user.id,
        current_user.tenant_id
    )
    
    # Enrich with task info
    for approval in approvals:
        task = await db.tm_tasks.find_one({"id": approval["task_id"]}, {"_id": 0})
        approval["task"] = task
    
    return {"approvals": approvals}


@governance_router.get("/tasks/{task_id}/approval")
async def get_task_approval(
    task_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get the pending approval for a task"""
    approval = await approval_service.get_task_pending_approval(
        task_id,
        current_user.tenant_id
    )
    return {"approval": approval}


@governance_router.get("/tasks/{task_id}/approval-history")
async def get_task_approval_history(
    task_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get all approval history for a task"""
    history = await approval_service.get_task_approval_history(
        task_id,
        current_user.tenant_id
    )
    return {"history": history}


@governance_router.post("/approvals/{instance_id}/action")
async def process_approval_action(
    instance_id: str,
    request: ApprovalActionRequest,
    current_user: User = Depends(get_current_user)
):
    """Process an approval or rejection action"""
    try:
        updated_instance, new_status = await approval_service.process_approval_action(
            instance_id=instance_id,
            user_id=current_user.id,
            tenant_id=current_user.tenant_id,
            action=request.action,
            comment=request.comment
        )
        
        # If status changed, update the task
        if new_status:
            task = await db.tm_tasks.find_one({"id": updated_instance["task_id"]})
            if task:
                await db.tm_tasks.update_one(
                    {"id": updated_instance["task_id"]},
                    {
                        "$set": {
                            "status": new_status,
                            "approval_status": updated_instance["status"],
                            "updated_at": datetime.now(timezone.utc)
                        }
                    }
                )
                
                # Send notifications
                await _send_approval_notifications(
                    instance=updated_instance,
                    task=task,
                    action=request.action,
                    actor_id=current_user.id,
                    tenant_id=current_user.tenant_id
                )
        
        return {
            "success": True,
            "approval": updated_instance,
            "new_task_status": new_status
        }
    
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@governance_router.post("/approvals/{instance_id}/cancel")
async def cancel_approval(
    instance_id: str,
    reason: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """Cancel a pending approval"""
    try:
        updated = await approval_service.cancel_approval(
            instance_id=instance_id,
            user_id=current_user.id,
            tenant_id=current_user.tenant_id,
            reason=reason
        )
        
        # Update task approval status
        await db.tm_tasks.update_one(
            {"id": updated["task_id"]},
            {
                "$set": {
                    "approval_status": None,
                    "updated_at": datetime.now(timezone.utc)
                }
            }
        )
        
        return {"success": True, "approval": updated}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@governance_router.get("/approvals/summary")
async def get_approval_summary(
    current_user: User = Depends(get_current_user)
):
    """Get approval statistics summary"""
    summary = await approval_service.get_approval_summary(current_user.tenant_id)
    return summary


# ============================================================================
# APPROVAL NOTIFICATION HELPERS
# ============================================================================

async def _send_approval_notifications(
    instance: Dict[str, Any],
    task: Dict[str, Any],
    action: str,
    actor_id: str,
    tenant_id: str
):
    """Send notifications for approval actions"""
    from ..services.slack_service import SlackService
    
    now = datetime.now(timezone.utc)
    
    # Get actor info
    actor = await db.users.find_one({"id": actor_id, "tenant_id": tenant_id})
    actor_name = actor.get("name", actor.get("email", "Someone")) if actor else "Someone"
    
    # Get task owner
    task_owner_id = task.get("created_by")
    
    if action == "approve":
        # Notify task owner of approval
        if task_owner_id and task_owner_id != actor_id:
            notification = {
                "id": str(uuid.uuid4()),
                "tenant_id": tenant_id,
                "user_id": task_owner_id,
                "type": "approval_approved",
                "title": "Task Approved",
                "message": f"{actor_name} approved your task: {task.get('title')}",
                "task_id": task["id"],
                "project_id": task.get("project_id"),
                "is_read": False,
                "created_at": now
            }
            await db.tm_notifications.insert_one(notification)
        
        # Check if there's a next approver in sequential workflow
        if instance.get("status") == "pending" and instance.get("approval_type") == "sequential":
            next_step = instance.get("current_step", 0)
            approvers = instance.get("approvers", [])
            if next_step < len(approvers):
                next_approver = approvers[next_step]
                notification = {
                    "id": str(uuid.uuid4()),
                    "tenant_id": tenant_id,
                    "user_id": next_approver["user_id"],
                    "type": "approval_requested",
                    "title": "Approval Required",
                    "message": f"Task '{task.get('title')}' requires your approval (Step {next_step + 1})",
                    "task_id": task["id"],
                    "project_id": task.get("project_id"),
                    "is_read": False,
                    "created_at": now
                }
                await db.tm_notifications.insert_one(notification)
    
    elif action == "reject":
        # Notify task owner of rejection
        if task_owner_id and task_owner_id != actor_id:
            notification = {
                "id": str(uuid.uuid4()),
                "tenant_id": tenant_id,
                "user_id": task_owner_id,
                "type": "approval_rejected",
                "title": "Task Rejected",
                "message": f"{actor_name} rejected your task: {task.get('title')}",
                "task_id": task["id"],
                "project_id": task.get("project_id"),
                "is_read": False,
                "created_at": now
            }
            await db.tm_notifications.insert_one(notification)
    
    # Try to send email notifications (using existing email infrastructure)
    try:
        await _send_approval_email(instance, task, action, actor_name, tenant_id)
    except Exception as e:
        logger.error(f"Failed to send approval email: {e}")
    
    # Try Slack notification
    try:
        slack_service = SlackService(db)
        if action == "approve":
            message = f"✅ Task *{task.get('title')}* was approved by {actor_name}"
        else:
            message = f"❌ Task *{task.get('title')}* was rejected by {actor_name}"
        
        await slack_service.send_notification(
            tenant_id=tenant_id,
            message=message,
            event_type="approval",
            project_id=task.get("project_id")
        )
    except Exception as e:
        logger.debug(f"Slack notification skipped: {e}")


async def _send_approval_email(
    instance: Dict[str, Any],
    task: Dict[str, Any],
    action: str,
    actor_name: str,
    tenant_id: str
):
    """Send email notification for approval actions"""
    import os
    
    sendgrid_api_key = os.environ.get("SENDGRID_API_KEY")
    if not sendgrid_api_key:
        return
    
    from sendgrid import SendGridAPIClient
    from sendgrid.helpers.mail import Mail, Email, To, Content
    
    # Get email settings
    settings = await db.tm_settings.find_one({"tenant_id": tenant_id, "type": "email"})
    if not settings or not settings.get("email_enabled"):
        return
    
    from_email = settings.get("from_email", "noreply@taskmanager.app")
    
    # Get task owner email
    task_owner_id = task.get("created_by")
    if not task_owner_id:
        return
    
    task_owner = await db.users.find_one({"id": task_owner_id, "tenant_id": tenant_id})
    if not task_owner or not task_owner.get("email"):
        return
    
    # Build email
    if action == "approve":
        subject = f"✅ Task Approved: {task.get('title')}"
        body = f"""
        <h2>Task Approved</h2>
        <p><strong>{actor_name}</strong> has approved your task.</p>
        <p><strong>Task:</strong> {task.get('title')}</p>
        <p><strong>Status:</strong> Approved and moved to {instance.get('on_approve_status')}</p>
        """
    else:
        comment = ""
        actions = instance.get("actions", [])
        if actions:
            last_action = actions[-1]
            comment = last_action.get("comment", "")
        
        subject = f"❌ Task Rejected: {task.get('title')}"
        body = f"""
        <h2>Task Rejected</h2>
        <p><strong>{actor_name}</strong> has rejected your task.</p>
        <p><strong>Task:</strong> {task.get('title')}</p>
        <p><strong>Reason:</strong> {comment or 'No reason provided'}</p>
        <p><strong>Status:</strong> Moved to {instance.get('on_reject_status')}</p>
        """
    
    try:
        sg = SendGridAPIClient(sendgrid_api_key)
        message = Mail(
            from_email=Email(from_email),
            to_emails=To(task_owner.get("email")),
            subject=subject,
            html_content=Content("text/html", body)
        )
        sg.send(message)
    except Exception as e:
        logger.error(f"SendGrid email failed: {e}")


async def send_approval_request_notification(
    instance: Dict[str, Any],
    task: Dict[str, Any],
    tenant_id: str
):
    """Send notifications when a new approval is requested"""
    now = datetime.now(timezone.utc)
    
    # Get requester info
    requester_id = instance.get("requested_by")
    requester = await db.users.find_one({"id": requester_id, "tenant_id": tenant_id})
    requester_name = requester.get("name", requester.get("email", "Someone")) if requester else "Someone"
    
    # Notify first approver (or all for single approval)
    approval_type = instance.get("approval_type", "single")
    approvers = instance.get("approvers", [])
    
    if approval_type == "sequential":
        # Notify only the first approver
        if approvers:
            first_approver = approvers[0]
            notification = {
                "id": str(uuid.uuid4()),
                "tenant_id": tenant_id,
                "user_id": first_approver["user_id"],
                "type": "approval_requested",
                "title": "Approval Required",
                "message": f"{requester_name} requested your approval for: {task.get('title')}",
                "task_id": task["id"],
                "project_id": task.get("project_id"),
                "is_read": False,
                "created_at": now
            }
            await db.tm_notifications.insert_one(notification)
    else:
        # Notify all approvers for single approval
        for approver in approvers:
            notification = {
                "id": str(uuid.uuid4()),
                "tenant_id": tenant_id,
                "user_id": approver["user_id"],
                "type": "approval_requested",
                "title": "Approval Required",
                "message": f"{requester_name} requested your approval for: {task.get('title')}",
                "task_id": task["id"],
                "project_id": task.get("project_id"),
                "is_read": False,
                "created_at": now
            }
            await db.tm_notifications.insert_one(notification)

    return True



# ============================================================================
# EMAIL TEMPLATE ENDPOINTS
# ============================================================================

class EmailTemplateSaveRequest(BaseModel):
    subject: str
    html_body: str
    plain_body: str
    is_enabled: bool = True


class EmailTemplatePreviewRequest(BaseModel):
    template_type: str
    subject: str
    html_body: str
    plain_body: str
    sample_data: Optional[Dict[str, Any]] = None


class EmailTestRequest(BaseModel):
    template_type: str
    to_email: str


@governance_router.get("/email-templates")
async def list_email_templates(
    current_user: User = Depends(get_current_user)
):
    """List all email templates"""
    templates = await email_template_service.list_templates(current_user.tenant_id)
    return {"templates": templates}


@governance_router.get("/email-templates/types")
async def get_template_types(
    current_user: User = Depends(get_current_user)
):
    """Get available template types"""
    types = email_template_service.get_template_types()
    return {"types": types}


@governance_router.get("/email-templates/{template_type}")
async def get_email_template(
    template_type: str,
    current_user: User = Depends(get_current_user)
):
    """Get a specific email template"""
    template = await email_template_service.get_template(
        current_user.tenant_id,
        template_type
    )
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    return template


@governance_router.get("/email-templates/{template_type}/variables")
async def get_template_variables(
    template_type: str,
    current_user: User = Depends(get_current_user)
):
    """Get available variables for a template type"""
    variables = email_template_service.get_available_variables(template_type)
    return {"variables": variables}


@governance_router.put("/email-templates/{template_type}")
async def save_email_template(
    template_type: str,
    request: EmailTemplateSaveRequest,
    current_user: User = Depends(get_current_user)
):
    """Save (create or update) an email template"""
    # Check admin permission
    if not await is_admin_user(current_user, db):
        raise HTTPException(
            status_code=403,
            detail="Only admins can edit email templates"
        )
    
    try:
        template = await email_template_service.save_template(
            tenant_id=current_user.tenant_id,
            user_id=current_user.id,
            template_type=template_type,
            subject=request.subject,
            html_body=request.html_body,
            plain_body=request.plain_body,
            is_enabled=request.is_enabled
        )
        return template
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@governance_router.post("/email-templates/{template_type}/toggle")
async def toggle_email_template(
    template_type: str,
    current_user: User = Depends(get_current_user)
):
    """Toggle email template enabled/disabled"""
    if not await is_admin_user(current_user, db):
        raise HTTPException(
            status_code=403,
            detail="Only admins can edit email templates"
        )
    
    try:
        template = await email_template_service.toggle_template(
            current_user.tenant_id,
            current_user.id,
            template_type
        )
        return {"success": True, "template": template}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@governance_router.post("/email-templates/{template_type}/reset")
async def reset_email_template(
    template_type: str,
    current_user: User = Depends(get_current_user)
):
    """Reset email template to default"""
    if not await is_admin_user(current_user, db):
        raise HTTPException(
            status_code=403,
            detail="Only admins can edit email templates"
        )
    
    try:
        template = await email_template_service.reset_template(
            current_user.tenant_id,
            current_user.id,
            template_type
        )
        return {"success": True, "template": template}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@governance_router.get("/email-templates/{template_type}/history")
async def get_template_history(
    template_type: str,
    current_user: User = Depends(get_current_user)
):
    """Get audit history for a template"""
    history = await email_template_service.get_template_history(
        current_user.tenant_id,
        template_type
    )
    return {"history": history}


@governance_router.post("/email-templates/preview")
async def preview_email_template(
    request: EmailTemplatePreviewRequest,
    current_user: User = Depends(get_current_user)
):
    """Preview a rendered email template"""
    
    # Build sample data if not provided
    sample_data = request.sample_data or _get_sample_data(
        request.template_type,
        current_user
    )
    
    template = {
        "subject": request.subject,
        "html_body": request.html_body,
        "plain_body": request.plain_body
    }
    
    try:
        subject, html_body, plain_body = email_template_service.render_template(
            template,
            sample_data
        )
        return {
            "subject": subject,
            "html_body": html_body,
            "plain_body": plain_body
        }
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Template rendering error: {str(e)}"
        )


@governance_router.post("/email-templates/test")
async def send_test_email(
    request: EmailTestRequest,
    current_user: User = Depends(get_current_user)
):
    """Send a test email using the current template"""
    import os
    
    if not await is_admin_user(current_user, db):
        raise HTTPException(
            status_code=403,
            detail="Only admins can send test emails"
        )
    
    sendgrid_key = os.environ.get("SENDGRID_API_KEY")
    if not sendgrid_key:
        raise HTTPException(
            status_code=400,
            detail="SendGrid is not configured"
        )
    
    # Get template
    template = await email_template_service.get_template(
        current_user.tenant_id,
        request.template_type
    )
    
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    
    # Build sample data
    sample_data = _get_sample_data(request.template_type, current_user)
    
    try:
        subject, html_body, plain_body = email_template_service.render_template(
            template,
            sample_data
        )
        
        # Send via SendGrid
        from sendgrid import SendGridAPIClient
        from sendgrid.helpers.mail import Mail, Email, To, Content
        
        sender_email = os.environ.get("SENDGRID_SENDER_EMAIL", "noreply@taskmanager.com")
        
        sg = SendGridAPIClient(sendgrid_key)
        message = Mail(
            from_email=Email(sender_email),
            to_emails=To(request.to_email),
            subject=f"[TEST] {subject}",
            html_content=Content("text/html", html_body)
        )
        
        response = sg.send(message)
        
        return {
            "success": True,
            "message": f"Test email sent to {request.to_email}",
            "status_code": response.status_code
        }
    except Exception as e:
        logger.error(f"Test email failed: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to send test email: {str(e)}"
        )


def _get_sample_data(template_type: str, user: User) -> Dict[str, Any]:
    """Generate sample data for template preview"""
    
    base_url = os.environ.get("FRONTEND_URL", "https://app.taskmanager.com")
    
    # Safely get user info
    user_name = getattr(user, 'name', None) or getattr(user, 'email', None) or "John Doe"
    user_email = getattr(user, 'email', None) or "john@example.com"
    
    sample = {
        "task": {
            "title": "Sample Task Title",
            "description": "This is a sample task description for preview purposes.",
            "status": "In Progress",
            "priority": "High",
            "due_date": "Jan 30, 2026",
            "url": f"{base_url}/task-manager/tasks/sample-id"
        },
        "project": {
            "name": "Sample Project"
        },
        "assignee": {
            "name": user_name,
            "email": user_email
        },
        "assigner": {
            "name": "Jane Smith"
        },
        "owner": {
            "name": user_name
        },
        "approver": {
            "name": "Manager Name"
        },
        "requester": {
            "name": user_name
        },
        "commenter": {
            "name": "Commenter Name"
        },
        "mentioned": {
            "name": user_name
        },
        "comment": {
            "text": "Hey @john, can you please review this task? Thanks!"
        },
        "blocker": {
            "title": "Blocking Task Title"
        },
        "approval": {
            "comment": "This needs more detail before it can be approved. Please add acceptance criteria."
        }
    }
    
    return sample



# ============================================================================
# APPROVAL ANALYTICS ENDPOINTS (Phase 10)
# ============================================================================

class AnalyticsFilters(BaseModel):
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    project_id: Optional[str] = None
    workflow_id: Optional[str] = None
    approver_id: Optional[str] = None


def _parse_date(date_str: Optional[str]) -> Optional[datetime]:
    """Parse date string to datetime"""
    if not date_str:
        return None
    try:
        return datetime.fromisoformat(date_str.replace("Z", "+00:00"))
    except ValueError:
        return None


@governance_router.get("/analytics/summary")
async def get_analytics_summary(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    project_id: Optional[str] = None,
    workflow_id: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """Get approval analytics summary - all key metrics in one call"""
    
    start_dt = _parse_date(start_date)
    end_dt = _parse_date(end_date)
    
    # Get all metrics in parallel (conceptually)
    volume = await approval_analytics_service.get_approval_volume(
        current_user.tenant_id,
        start_date=start_dt,
        end_date=end_dt,
        project_id=project_id,
        workflow_id=workflow_id
    )
    
    turnaround = await approval_analytics_service.get_turnaround_stats(
        current_user.tenant_id,
        start_date=start_dt,
        end_date=end_dt,
        project_id=project_id,
        workflow_id=workflow_id
    )
    
    bottlenecks = await approval_analytics_service.get_pending_bottlenecks(
        current_user.tenant_id,
        threshold_hours=24
    )
    
    rejections = await approval_analytics_service.get_rejection_stats(
        current_user.tenant_id,
        start_date=start_dt,
        end_date=end_dt
    )
    
    return {
        "volume": volume,
        "turnaround": turnaround,
        "bottlenecks": {
            "count": bottlenecks.get("count", 0),
            "threshold_hours": bottlenecks.get("threshold_hours", 24)
        },
        "rejections": {
            "total": rejections.get("total_rejections", 0)
        }
    }


@governance_router.get("/analytics/volume")
async def get_approval_volume(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    project_id: Optional[str] = None,
    workflow_id: Optional[str] = None,
    approver_id: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """Get approval volume metrics"""
    
    volume = await approval_analytics_service.get_approval_volume(
        current_user.tenant_id,
        start_date=_parse_date(start_date),
        end_date=_parse_date(end_date),
        project_id=project_id,
        workflow_id=workflow_id,
        approver_id=approver_id
    )
    
    return volume


@governance_router.get("/analytics/volume/by-project")
async def get_volume_by_project(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """Get approval volume grouped by project"""
    
    data = await approval_analytics_service.get_volume_by_project(
        current_user.tenant_id,
        start_date=_parse_date(start_date),
        end_date=_parse_date(end_date)
    )
    
    return {"projects": data}


@governance_router.get("/analytics/volume/by-workflow")
async def get_volume_by_workflow(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """Get approval volume grouped by workflow"""
    
    data = await approval_analytics_service.get_volume_by_workflow(
        current_user.tenant_id,
        start_date=_parse_date(start_date),
        end_date=_parse_date(end_date)
    )
    
    return {"workflows": data}


@governance_router.get("/analytics/volume/trend")
async def get_volume_trend(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    granularity: str = Query(default="day", regex="^(day|week|month)$"),
    current_user: User = Depends(get_current_user)
):
    """Get approval volume trend over time"""
    
    data = await approval_analytics_service.get_volume_trend(
        current_user.tenant_id,
        start_date=_parse_date(start_date),
        end_date=_parse_date(end_date),
        granularity=granularity
    )
    
    return {"trend": data, "granularity": granularity}


@governance_router.get("/analytics/turnaround")
async def get_turnaround_stats(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    project_id: Optional[str] = None,
    workflow_id: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """Get turnaround time statistics"""
    
    stats = await approval_analytics_service.get_turnaround_stats(
        current_user.tenant_id,
        start_date=_parse_date(start_date),
        end_date=_parse_date(end_date),
        project_id=project_id,
        workflow_id=workflow_id
    )
    
    return stats


@governance_router.get("/analytics/turnaround/by-approver")
async def get_turnaround_by_approver(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """Get turnaround time by approver"""
    
    data = await approval_analytics_service.get_turnaround_by_approver(
        current_user.tenant_id,
        start_date=_parse_date(start_date),
        end_date=_parse_date(end_date)
    )
    
    return {"approvers": data}


@governance_router.get("/analytics/turnaround/by-workflow")
async def get_turnaround_by_workflow(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """Get turnaround time by workflow"""
    
    data = await approval_analytics_service.get_turnaround_by_workflow(
        current_user.tenant_id,
        start_date=_parse_date(start_date),
        end_date=_parse_date(end_date)
    )
    
    return {"workflows": data}


@governance_router.get("/analytics/bottlenecks")
async def get_bottlenecks(
    threshold_hours: float = Query(default=24, ge=1),
    current_user: User = Depends(get_current_user)
):
    """Get pending approvals that exceed threshold"""
    
    data = await approval_analytics_service.get_pending_bottlenecks(
        current_user.tenant_id,
        threshold_hours=threshold_hours
    )
    
    return data


@governance_router.get("/analytics/approver-workload")
async def get_approver_workload(
    current_user: User = Depends(get_current_user)
):
    """Get pending approval count per approver"""
    
    data = await approval_analytics_service.get_approver_workload(
        current_user.tenant_id
    )
    
    return {"approvers": data}


@governance_router.get("/analytics/rejections")
async def get_rejection_insights(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """Get rejection statistics and insights"""
    
    data = await approval_analytics_service.get_rejection_stats(
        current_user.tenant_id,
        start_date=_parse_date(start_date),
        end_date=_parse_date(end_date)
    )
    
    return data


@governance_router.get("/analytics/export")
async def export_approval_data(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    export_type: str = Query(default="all", regex="^(all|pending|completed)$"),
    current_user: User = Depends(get_current_user)
):
    """Export approval data for CSV download"""
    from fastapi.responses import StreamingResponse
    import csv
    import io
    
    data = await approval_analytics_service.export_approval_data(
        current_user.tenant_id,
        start_date=_parse_date(start_date),
        end_date=_parse_date(end_date),
        export_type=export_type
    )
    
    if not data:
        return {"message": "No data to export", "count": 0}
    
    # Create CSV
    output = io.StringIO()
    if data:
        fieldnames = list(data[0].keys())
        writer = csv.DictWriter(output, fieldnames=fieldnames)
        writer.writeheader()
        
        for row in data:
            # Convert datetime to string
            clean_row = {}
            for k, v in row.items():
                if isinstance(v, datetime):
                    clean_row[k] = v.isoformat()
                else:
                    clean_row[k] = v
            writer.writerow(clean_row)
    
    output.seek(0)
    
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename=approval_export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
        }
    )


@governance_router.get("/analytics/workflows")
async def get_analytics_workflows(
    current_user: User = Depends(get_current_user)
):
    """Get list of workflows for filter dropdown"""
    workflows = await approval_service.list_workflows(
        current_user.tenant_id,
        enabled_only=False
    )
    return {"workflows": [{"id": w["id"], "name": w["name"]} for w in workflows]}


@governance_router.get("/analytics/approvers")
async def get_analytics_approvers(
    current_user: User = Depends(get_current_user)
):
    """Get list of users who have been approvers for filter dropdown"""
    # Get unique approvers from approval instances
    pipeline = [
        {"$match": {"tenant_id": current_user.tenant_id}},
        {"$unwind": "$approvers"},
        {"$group": {
            "_id": "$approvers.user_id",
            "name": {"$first": "$approvers.user_name"}
        }},
        {"$sort": {"name": 1}}
    ]
    
    results = await db.tm_approval_instances.aggregate(pipeline).to_list(length=100)
    
    approvers = [{"id": r["_id"], "name": r["name"]} for r in results if r["_id"]]
    
    return {"approvers": approvers}



# ============================================================================
# PHASE 11: TASK TEMPLATES ENDPOINTS
# ============================================================================

from ..services.task_template_service import TaskTemplateService

# Initialize service
task_template_service = TaskTemplateService(db)


class TaskTemplateCreate(BaseModel):
    name: str
    description: Optional[str] = None
    scope: str = "global"  # global or project
    project_id: Optional[str] = None
    default_title: str = ""
    default_description: Optional[str] = None
    default_status: str = "todo"
    default_priority: str = "medium"
    default_task_type: str = "other"
    default_assignee_id: Optional[str] = None
    default_tags: Optional[List[str]] = None
    default_due_days: Optional[int] = None
    checklist_items: Optional[List[Dict[str, str]]] = None
    custom_field_values: Optional[Dict[str, Any]] = None


class TaskTemplateUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    scope: Optional[str] = None
    project_id: Optional[str] = None
    default_title: Optional[str] = None
    default_description: Optional[str] = None
    default_status: Optional[str] = None
    default_priority: Optional[str] = None
    default_task_type: Optional[str] = None
    default_assignee_id: Optional[str] = None
    default_tags: Optional[List[str]] = None
    default_due_days: Optional[int] = None
    checklist_items: Optional[List[Dict[str, str]]] = None
    custom_field_values: Optional[Dict[str, Any]] = None


class CreateTaskFromTemplateRequest(BaseModel):
    template_id: str
    project_id: str
    overrides: Optional[Dict[str, Any]] = None


@governance_router.get("/task-templates")
async def list_task_templates(
    project_id: Optional[str] = None,
    include_global: bool = True,
    current_user: User = Depends(get_current_user)
):
    """List all task templates"""
    templates = await task_template_service.list_templates(
        current_user.tenant_id,
        project_id=project_id,
        include_global=include_global
    )
    return {"templates": templates}


@governance_router.get("/task-templates/{template_id}")
async def get_task_template(
    template_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get a specific task template"""
    template = await task_template_service.get_template(
        template_id,
        current_user.tenant_id
    )
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    return template


@governance_router.post("/task-templates")
async def create_task_template(
    request: TaskTemplateCreate,
    current_user: User = Depends(get_current_user)
):
    """Create a new task template"""
    # Check admin permission
    if not await is_admin_user(current_user, db):
        raise HTTPException(
            status_code=403,
            detail="Only admins can create task templates"
        )
    
    try:
        template = await task_template_service.create_template(
            tenant_id=current_user.tenant_id,
            created_by=current_user.id,
            name=request.name,
            description=request.description,
            scope=request.scope,
            project_id=request.project_id,
            default_title=request.default_title,
            default_description=request.default_description,
            default_status=request.default_status,
            default_priority=request.default_priority,
            default_task_type=request.default_task_type,
            default_assignee_id=request.default_assignee_id,
            default_tags=request.default_tags,
            default_due_days=request.default_due_days,
            checklist_items=request.checklist_items,
            custom_field_values=request.custom_field_values
        )
        return template
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@governance_router.put("/task-templates/{template_id}")
async def update_task_template(
    template_id: str,
    request: TaskTemplateUpdate,
    current_user: User = Depends(get_current_user)
):
    """Update an existing task template"""
    if not await is_admin_user(current_user, db):
        raise HTTPException(
            status_code=403,
            detail="Only admins can update task templates"
        )
    
    updates = {k: v for k, v in request.model_dump().items() if v is not None}
    
    if not updates:
        raise HTTPException(status_code=400, detail="No update data provided")
    
    template = await task_template_service.update_template(
        template_id,
        current_user.tenant_id,
        updates
    )
    
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    
    return template


@governance_router.delete("/task-templates/{template_id}")
async def delete_task_template(
    template_id: str,
    current_user: User = Depends(get_current_user)
):
    """Delete a task template"""
    if not await is_admin_user(current_user, db):
        raise HTTPException(
            status_code=403,
            detail="Only admins can delete task templates"
        )
    
    success = await task_template_service.delete_template(
        template_id,
        current_user.tenant_id
    )
    
    if not success:
        raise HTTPException(status_code=404, detail="Template not found")
    
    return {"success": True, "message": "Template deleted"}


@governance_router.post("/task-templates/{template_id}/duplicate")
async def duplicate_task_template(
    template_id: str,
    new_name: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """Duplicate an existing template"""
    if not await is_admin_user(current_user, db):
        raise HTTPException(
            status_code=403,
            detail="Only admins can duplicate task templates"
        )
    
    try:
        template = await task_template_service.duplicate_template(
            template_id,
            current_user.tenant_id,
            current_user.id,
            new_name
        )
        return template
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@governance_router.post("/tasks/from-template")
async def create_task_from_template(
    request: CreateTaskFromTemplateRequest,
    current_user: User = Depends(get_current_user)
):
    """Create a new task from a template"""
    try:
        task = await task_template_service.create_task_from_template(
            template_id=request.template_id,
            project_id=request.project_id,
            user_id=current_user.id,
            tenant_id=current_user.tenant_id,
            overrides=request.overrides
        )
        return {"success": True, "task": task}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
