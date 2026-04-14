"""
Approval Workflow Service - Phase 8
Handles approval workflow management, evaluation, and state transitions.
"""
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any, Tuple
import uuid


class ApprovalService:
    """Service for managing approval workflows and instances"""
    
    def __init__(self, db):
        self.db = db
    
    # =========================================================================
    # WORKFLOW MANAGEMENT
    # =========================================================================
    
    async def create_workflow(
        self,
        tenant_id: str,
        created_by: str,
        name: str,
        description: Optional[str],
        project_ids: List[str],  # Empty list = all projects
        trigger_status: str,  # Status that triggers approval
        approval_type: str,  # "single" or "sequential"
        approvers: List[Dict[str, Any]],  # List of approver configs
        on_approve_status: str,  # Status after approval
        on_reject_status: str,  # Status after rejection
    ) -> Dict[str, Any]:
        """Create a new approval workflow"""
        
        # Validate approvers
        if not approvers:
            raise ValueError("At least one approver is required")
        
        for idx, approver in enumerate(approvers):
            if approver.get("type") not in ["user", "role", "field"]:
                raise ValueError(f"Invalid approver type at step {idx + 1}")
            if not approver.get("value"):
                raise ValueError(f"Approver value required at step {idx + 1}")
        
        # Prevent approval loop
        if trigger_status == on_approve_status:
            raise ValueError("Trigger status cannot be the same as approved status")
        if trigger_status == on_reject_status:
            raise ValueError("Trigger status cannot be the same as rejected status")
        
        now = datetime.now(timezone.utc)
        workflow = {
            "id": str(uuid.uuid4()),
            "tenant_id": tenant_id,
            "created_by": created_by,
            "name": name,
            "description": description,
            "project_ids": project_ids,  # Empty = applies to all
            "trigger_status": trigger_status,
            "approval_type": approval_type,
            "approvers": approvers,
            "on_approve_status": on_approve_status,
            "on_reject_status": on_reject_status,
            "is_enabled": True,
            "created_at": now,
            "updated_at": now,
            "is_active": True,
        }
        
        await self.db.tm_approval_workflows.insert_one(workflow)
        workflow.pop("_id", None)
        return workflow
    
    async def get_workflow(self, workflow_id: str, tenant_id: str) -> Optional[Dict[str, Any]]:
        """Get a workflow by ID"""
        workflow = await self.db.tm_approval_workflows.find_one({
            "id": workflow_id,
            "tenant_id": tenant_id,
            "is_active": True
        })
        if workflow:
            workflow.pop("_id", None)
        return workflow
    
    async def list_workflows(
        self,
        tenant_id: str,
        project_id: Optional[str] = None,
        enabled_only: bool = False
    ) -> List[Dict[str, Any]]:
        """List all workflows for a tenant"""
        query = {"tenant_id": tenant_id, "is_active": True}
        
        if enabled_only:
            query["is_enabled"] = True
        
        if project_id:
            # Find workflows that apply to this project or all projects
            query["$or"] = [
                {"project_ids": {"$size": 0}},  # Applies to all
                {"project_ids": project_id}
            ]
        
        cursor = self.db.tm_approval_workflows.find(query).sort("created_at", -1)
        workflows = await cursor.to_list(length=100)
        for w in workflows:
            w.pop("_id", None)
        return workflows
    
    async def update_workflow(
        self,
        workflow_id: str,
        tenant_id: str,
        updates: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """Update a workflow"""
        # Prevent certain fields from being updated
        safe_updates = {k: v for k, v in updates.items() if k not in [
            "id", "tenant_id", "created_by", "created_at", "is_active"
        ]}
        
        safe_updates["updated_at"] = datetime.now(timezone.utc)
        
        result = await self.db.tm_approval_workflows.find_one_and_update(
            {"id": workflow_id, "tenant_id": tenant_id, "is_active": True},
            {"$set": safe_updates},
            return_document=True
        )
        if result:
            result.pop("_id", None)
        return result
    
    async def delete_workflow(self, workflow_id: str, tenant_id: str) -> bool:
        """Soft delete a workflow"""
        result = await self.db.tm_approval_workflows.update_one(
            {"id": workflow_id, "tenant_id": tenant_id},
            {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc)}}
        )
        return result.modified_count > 0
    
    async def toggle_workflow(self, workflow_id: str, tenant_id: str) -> Optional[Dict[str, Any]]:
        """Toggle workflow enabled/disabled"""
        workflow = await self.get_workflow(workflow_id, tenant_id)
        if not workflow:
            return None
        
        new_state = not workflow.get("is_enabled", True)
        return await self.update_workflow(workflow_id, tenant_id, {"is_enabled": new_state})
    
    # =========================================================================
    # APPROVAL INSTANCE MANAGEMENT
    # =========================================================================
    
    async def check_and_create_approval(
        self,
        task: Dict[str, Any],
        new_status: str,
        tenant_id: str
    ) -> Optional[Dict[str, Any]]:
        """
        Check if a status change triggers an approval workflow.
        If yes, create an approval instance and return it.
        """
        project_id = task.get("project_id")
        
        # Find applicable workflow
        workflow = await self.db.tm_approval_workflows.find_one({
            "tenant_id": tenant_id,
            "is_active": True,
            "is_enabled": True,
            "trigger_status": new_status,
            "$or": [
                {"project_ids": {"$size": 0}},
                {"project_ids": project_id}
            ]
        })
        
        if not workflow:
            return None
        
        workflow.pop("_id", None)
        
        # Check if there's already a pending approval for this task
        existing = await self.db.tm_approval_instances.find_one({
            "task_id": task["id"],
            "tenant_id": tenant_id,
            "status": "pending"
        })
        
        if existing:
            # Already has pending approval
            return None
        
        # Resolve approvers
        resolved_approvers = await self._resolve_approvers(
            workflow["approvers"],
            task,
            tenant_id
        )
        
        if not resolved_approvers:
            # No valid approvers found
            return None
        
        # Create approval instance
        now = datetime.now(timezone.utc)
        instance = {
            "id": str(uuid.uuid4()),
            "tenant_id": tenant_id,
            "task_id": task["id"],
            "workflow_id": workflow["id"],
            "workflow_name": workflow["name"],
            "status": "pending",  # pending, approved, rejected
            "approval_type": workflow["approval_type"],
            "current_step": 0,
            "approvers": resolved_approvers,
            "on_approve_status": workflow["on_approve_status"],
            "on_reject_status": workflow["on_reject_status"],
            "actions": [],  # List of approve/reject actions
            "requested_at": now,
            "requested_by": task.get("updated_by") or task.get("created_by"),
            "completed_at": None,
            "created_at": now,
            "updated_at": now,
        }
        
        await self.db.tm_approval_instances.insert_one(instance)
        instance.pop("_id", None)
        
        return instance
    
    async def _resolve_approvers(
        self,
        approver_configs: List[Dict[str, Any]],
        task: Dict[str, Any],
        tenant_id: str
    ) -> List[Dict[str, Any]]:
        """
        Resolve approver configs to actual user IDs.
        Returns list of {step, user_id, user_name, user_email, type, status}
        """
        resolved = []
        
        for idx, config in enumerate(approver_configs):
            approver_type = config.get("type")
            value = config.get("value")
            
            if approver_type == "user":
                # Direct user ID
                user = await self.db.users.find_one({
                    "id": value,
                    "tenant_id": tenant_id,
                    "is_active": True
                })
                if user:
                    resolved.append({
                        "step": idx,
                        "user_id": user["id"],
                        "user_name": user.get("name", user.get("email", "Unknown")),
                        "user_email": user.get("email"),
                        "type": "user",
                        "status": "pending"
                    })
            
            elif approver_type == "role":
                # Find users with this role
                users = await self.db.users.find({
                    "tenant_id": tenant_id,
                    "role": value,
                    "is_active": True
                }).to_list(length=10)
                
                # For now, take the first user with the role
                if users:
                    user = users[0]
                    resolved.append({
                        "step": idx,
                        "user_id": user["id"],
                        "user_name": user.get("name", user.get("email", "Unknown")),
                        "user_email": user.get("email"),
                        "type": "role",
                        "role_name": value,
                        "status": "pending"
                    })
            
            elif approver_type == "field":
                # Get user from task field (e.g., assignee_id, created_by)
                field_name = value
                user_id = task.get(field_name)
                
                if user_id:
                    user = await self.db.users.find_one({
                        "id": user_id,
                        "tenant_id": tenant_id,
                        "is_active": True
                    })
                    if user:
                        resolved.append({
                            "step": idx,
                            "user_id": user["id"],
                            "user_name": user.get("name", user.get("email", "Unknown")),
                            "user_email": user.get("email"),
                            "type": "field",
                            "field_name": field_name,
                            "status": "pending"
                        })
        
        return resolved
    
    async def get_approval_instance(
        self,
        instance_id: str,
        tenant_id: str
    ) -> Optional[Dict[str, Any]]:
        """Get an approval instance by ID"""
        instance = await self.db.tm_approval_instances.find_one({
            "id": instance_id,
            "tenant_id": tenant_id
        })
        if instance:
            instance.pop("_id", None)
        return instance
    
    async def get_task_pending_approval(
        self,
        task_id: str,
        tenant_id: str
    ) -> Optional[Dict[str, Any]]:
        """Get the pending approval for a task"""
        instance = await self.db.tm_approval_instances.find_one({
            "task_id": task_id,
            "tenant_id": tenant_id,
            "status": "pending"
        })
        if instance:
            instance.pop("_id", None)
        return instance
    
    async def get_task_approval_history(
        self,
        task_id: str,
        tenant_id: str
    ) -> List[Dict[str, Any]]:
        """Get all approval instances for a task"""
        cursor = self.db.tm_approval_instances.find({
            "task_id": task_id,
            "tenant_id": tenant_id
        }).sort("created_at", -1)
        
        instances = await cursor.to_list(length=50)
        for i in instances:
            i.pop("_id", None)
        return instances
    
    async def get_pending_approvals_for_user(
        self,
        user_id: str,
        tenant_id: str
    ) -> List[Dict[str, Any]]:
        """Get all pending approvals where user is the current approver"""
        cursor = self.db.tm_approval_instances.find({
            "tenant_id": tenant_id,
            "status": "pending",
            "approvers": {
                "$elemMatch": {
                    "user_id": user_id,
                    "status": "pending"
                }
            }
        }).sort("requested_at", -1)
        
        instances = await cursor.to_list(length=100)
        
        # Filter to only include instances where this user is the current approver
        result = []
        for instance in instances:
            instance.pop("_id", None)
            current_step = instance.get("current_step", 0)
            approvers = instance.get("approvers", [])
            
            # For sequential, check if user is at current step
            # For single, check if user is in the approvers list
            if instance.get("approval_type") == "sequential":
                if current_step < len(approvers):
                    current_approver = approvers[current_step]
                    if current_approver.get("user_id") == user_id and current_approver.get("status") == "pending":
                        result.append(instance)
            else:  # single
                for approver in approvers:
                    if approver.get("user_id") == user_id and approver.get("status") == "pending":
                        result.append(instance)
                        break
        
        return result
    
    # =========================================================================
    # APPROVAL ACTIONS
    # =========================================================================
    
    async def process_approval_action(
        self,
        instance_id: str,
        user_id: str,
        tenant_id: str,
        action: str,  # "approve" or "reject"
        comment: Optional[str] = None
    ) -> Tuple[Dict[str, Any], Optional[str]]:
        """
        Process an approval or rejection action.
        Returns (updated_instance, new_task_status or None)
        """
        if action not in ["approve", "reject"]:
            raise ValueError("Action must be 'approve' or 'reject'")
        
        if action == "reject" and not comment:
            raise ValueError("Comment is required for rejection")
        
        instance = await self.get_approval_instance(instance_id, tenant_id)
        if not instance:
            raise ValueError("Approval instance not found")
        
        if instance["status"] != "pending":
            raise ValueError(f"Approval is already {instance['status']}")
        
        # Verify user is authorized to act
        current_step = instance.get("current_step", 0)
        approvers = instance.get("approvers", [])
        approval_type = instance.get("approval_type", "single")
        
        authorized = False
        approver_index = -1
        
        if approval_type == "sequential":
            if current_step < len(approvers):
                current_approver = approvers[current_step]
                if current_approver.get("user_id") == user_id and current_approver.get("status") == "pending":
                    authorized = True
                    approver_index = current_step
        else:  # single
            for idx, approver in enumerate(approvers):
                if approver.get("user_id") == user_id and approver.get("status") == "pending":
                    authorized = True
                    approver_index = idx
                    break
        
        if not authorized:
            raise ValueError("You are not authorized to act on this approval")
        
        # Get user info for audit
        user = await self.db.users.find_one({"id": user_id, "tenant_id": tenant_id})
        user_name = user.get("name", user.get("email", "Unknown")) if user else "Unknown"
        
        now = datetime.now(timezone.utc)
        
        # Record the action
        action_record = {
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "user_name": user_name,
            "action": action,
            "comment": comment,
            "step": approver_index,
            "timestamp": now
        }
        
        # Update the approver status
        approvers[approver_index]["status"] = "approved" if action == "approve" else "rejected"
        approvers[approver_index]["action_at"] = now
        approvers[approver_index]["comment"] = comment
        
        new_task_status = None
        
        if action == "reject":
            # Rejection ends the workflow immediately
            await self.db.tm_approval_instances.update_one(
                {"id": instance_id},
                {
                    "$set": {
                        "status": "rejected",
                        "approvers": approvers,
                        "completed_at": now,
                        "updated_at": now
                    },
                    "$push": {"actions": action_record}
                }
            )
            new_task_status = instance.get("on_reject_status")
        
        elif action == "approve":
            if approval_type == "sequential":
                # Check if there are more steps
                next_step = current_step + 1
                if next_step < len(approvers):
                    # Move to next step
                    await self.db.tm_approval_instances.update_one(
                        {"id": instance_id},
                        {
                            "$set": {
                                "current_step": next_step,
                                "approvers": approvers,
                                "updated_at": now
                            },
                            "$push": {"actions": action_record}
                        }
                    )
                else:
                    # All steps complete - approval done
                    await self.db.tm_approval_instances.update_one(
                        {"id": instance_id},
                        {
                            "$set": {
                                "status": "approved",
                                "approvers": approvers,
                                "completed_at": now,
                                "updated_at": now
                            },
                            "$push": {"actions": action_record}
                        }
                    )
                    new_task_status = instance.get("on_approve_status")
            else:
                # Single approver - approval done
                await self.db.tm_approval_instances.update_one(
                    {"id": instance_id},
                    {
                        "$set": {
                            "status": "approved",
                            "approvers": approvers,
                            "completed_at": now,
                            "updated_at": now
                        },
                        "$push": {"actions": action_record}
                    }
                )
                new_task_status = instance.get("on_approve_status")
        
        # Log the action
        await self._log_approval_action(
            tenant_id=tenant_id,
            instance_id=instance_id,
            task_id=instance["task_id"],
            action=action,
            user_id=user_id,
            user_name=user_name,
            comment=comment,
            step=approver_index
        )
        
        # Return updated instance
        updated_instance = await self.get_approval_instance(instance_id, tenant_id)
        return updated_instance, new_task_status
    
    async def _log_approval_action(
        self,
        tenant_id: str,
        instance_id: str,
        task_id: str,
        action: str,
        user_id: str,
        user_name: str,
        comment: Optional[str],
        step: int
    ):
        """Log approval action for audit trail"""
        log_entry = {
            "id": str(uuid.uuid4()),
            "tenant_id": tenant_id,
            "instance_id": instance_id,
            "task_id": task_id,
            "action": action,
            "user_id": user_id,
            "user_name": user_name,
            "comment": comment,
            "step": step,
            "timestamp": datetime.now(timezone.utc)
        }
        await self.db.tm_approval_logs.insert_one(log_entry)
    
    async def cancel_approval(
        self,
        instance_id: str,
        user_id: str,
        tenant_id: str,
        reason: Optional[str] = None
    ) -> Dict[str, Any]:
        """Cancel a pending approval (by task owner or admin)"""
        instance = await self.get_approval_instance(instance_id, tenant_id)
        if not instance:
            raise ValueError("Approval instance not found")
        
        if instance["status"] != "pending":
            raise ValueError(f"Cannot cancel - approval is already {instance['status']}")
        
        # Get user info
        user = await self.db.users.find_one({"id": user_id, "tenant_id": tenant_id})
        user_name = user.get("name", user.get("email", "Unknown")) if user else "Unknown"
        
        now = datetime.now(timezone.utc)
        
        action_record = {
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "user_name": user_name,
            "action": "cancelled",
            "comment": reason,
            "step": -1,
            "timestamp": now
        }
        
        await self.db.tm_approval_instances.update_one(
            {"id": instance_id},
            {
                "$set": {
                    "status": "cancelled",
                    "completed_at": now,
                    "updated_at": now
                },
                "$push": {"actions": action_record}
            }
        )
        
        return await self.get_approval_instance(instance_id, tenant_id)
    
    # =========================================================================
    # TASK HELPERS
    # =========================================================================
    
    def is_task_pending_approval(self, task: Dict[str, Any]) -> bool:
        """Check if task is in pending approval state"""
        return task.get("approval_status") == "pending"
    
    async def get_approval_summary(self, tenant_id: str) -> Dict[str, Any]:
        """Get summary statistics for approvals"""
        pipeline = [
            {"$match": {"tenant_id": tenant_id}},
            {"$group": {
                "_id": "$status",
                "count": {"$sum": 1}
            }}
        ]
        
        results = await self.db.tm_approval_instances.aggregate(pipeline).to_list(length=10)
        
        summary = {
            "pending": 0,
            "approved": 0,
            "rejected": 0,
            "cancelled": 0,
            "total": 0
        }
        
        for r in results:
            status = r["_id"]
            count = r["count"]
            if status in summary:
                summary[status] = count
            summary["total"] += count
        
        return summary
