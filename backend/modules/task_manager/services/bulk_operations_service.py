"""
Bulk Operations Service for Task Manager
Handles bulk updates with validation, permissions, and approval checks
"""
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone
import uuid
import logging

from motor.motor_asyncio import AsyncIOMotorDatabase

logger = logging.getLogger(__name__)


class BulkOperationsService:
    """Service for handling bulk task operations"""
    
    ALLOWED_BULK_FIELDS = {
        "status", "priority", "assignee_id", "tags", "due_date",
        "add_tags", "remove_tags", "add_comment"
    }
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
    
    async def bulk_update_tasks(
        self,
        task_ids: List[str],
        updates: Dict[str, Any],
        user_id: str,
        tenant_id: str
    ) -> Dict[str, Any]:
        """
        Update multiple tasks with validation and permission checks.
        Returns detailed results including successes, failures, and skipped tasks.
        """
        results = {
            "total": len(task_ids),
            "successful": 0,
            "failed": 0,
            "skipped": 0,
            "details": []
        }
        
        # Validate updates contain only allowed fields
        for field in updates.keys():
            if field not in self.ALLOWED_BULK_FIELDS:
                return {
                    "error": f"Field '{field}' is not allowed for bulk updates",
                    "allowed_fields": list(self.ALLOWED_BULK_FIELDS)
                }
        
        # Get all tasks in one query
        tasks = await self.db.tm_tasks.find({
            "id": {"$in": task_ids},
            "tenant_id": tenant_id,
            "is_active": True
        }).to_list(length=len(task_ids))
        
        task_map = {t["id"]: t for t in tasks}
        
        # Process each task
        for task_id in task_ids:
            task = task_map.get(task_id)
            
            if not task:
                results["failed"] += 1
                results["details"].append({
                    "task_id": task_id,
                    "status": "failed",
                    "reason": "Task not found or access denied"
                })
                continue
            
            # Check if task is pending approval (locked)
            if task.get("approval_status") == "pending":
                results["skipped"] += 1
                results["details"].append({
                    "task_id": task_id,
                    "title": task.get("title"),
                    "status": "skipped",
                    "reason": "Task is pending approval and cannot be modified"
                })
                continue
            
            # Check permissions (for now, allow if user is in same tenant)
            # In production, check if user can modify this task
            can_edit, permission_error = await self._check_task_permissions(
                task, user_id, tenant_id
            )
            if not can_edit:
                results["skipped"] += 1
                results["details"].append({
                    "task_id": task_id,
                    "title": task.get("title"),
                    "status": "skipped",
                    "reason": permission_error
                })
                continue
            
            # Build update data
            try:
                update_data = await self._build_update_data(
                    task, updates, user_id, tenant_id
                )
            except ValueError as e:
                results["failed"] += 1
                results["details"].append({
                    "task_id": task_id,
                    "title": task.get("title"),
                    "status": "failed",
                    "reason": str(e)
                })
                continue
            
            # Validate updates
            is_valid, validation_error = await self._validate_task_update(
                task, update_data, tenant_id
            )
            if not is_valid:
                results["failed"] += 1
                results["details"].append({
                    "task_id": task_id,
                    "title": task.get("title"),
                    "status": "failed",
                    "reason": validation_error
                })
                continue
            
            # Apply update
            try:
                await self.db.tm_tasks.update_one(
                    {"id": task_id},
                    {"$set": update_data}
                )
                
                # Log activity
                await self._log_bulk_activity(
                    task, updates, user_id, tenant_id
                )
                
                results["successful"] += 1
                results["details"].append({
                    "task_id": task_id,
                    "title": task.get("title"),
                    "status": "success",
                    "changes": list(updates.keys())
                })
                
            except Exception as e:
                logger.error(f"Error updating task {task_id}: {e}")
                results["failed"] += 1
                results["details"].append({
                    "task_id": task_id,
                    "title": task.get("title"),
                    "status": "failed",
                    "reason": f"Database error: {str(e)}"
                })
        
        # Handle add_comment separately (applies to all successful tasks)
        if "add_comment" in updates and updates["add_comment"]:
            await self._add_bulk_comment(
                [d["task_id"] for d in results["details"] if d["status"] == "success"],
                updates["add_comment"],
                user_id,
                tenant_id
            )
        
        return results
    
    async def _check_task_permissions(
        self,
        task: Dict[str, Any],
        user_id: str,
        tenant_id: str
    ) -> tuple:
        """Check if user has permission to modify the task"""
        # Basic permission check - same tenant
        if task.get("tenant_id") != tenant_id:
            return False, "Access denied - different tenant"
        
        # Users can edit tasks in their tenant
        # In production, add more granular checks:
        # - Project membership
        # - Role-based permissions
        # - Task owner/assignee checks
        
        return True, None
    
    async def _build_update_data(
        self,
        task: Dict[str, Any],
        updates: Dict[str, Any],
        user_id: str,
        tenant_id: str
    ) -> Dict[str, Any]:
        """Build the update data dictionary"""
        now = datetime.now(timezone.utc)
        update_data = {
            "updated_at": now,
            "updated_by": user_id
        }
        
        # Direct field updates
        direct_fields = ["status", "priority", "assignee_id", "due_date"]
        for field in direct_fields:
            if field in updates:
                value = updates[field]
                # Handle date parsing
                if field == "due_date" and value:
                    if isinstance(value, str):
                        try:
                            value = datetime.fromisoformat(value.replace("Z", "+00:00"))
                        except ValueError:
                            raise ValueError(f"Invalid date format for {field}")
                update_data[field] = value
        
        # Handle tags (complete replacement)
        if "tags" in updates:
            update_data["tags"] = updates["tags"] or []
        
        # Handle add_tags (append)
        if "add_tags" in updates and updates["add_tags"]:
            existing_tags = task.get("tags", [])
            new_tags = list(set(existing_tags + updates["add_tags"]))
            update_data["tags"] = new_tags
        
        # Handle remove_tags
        if "remove_tags" in updates and updates["remove_tags"]:
            existing_tags = update_data.get("tags", task.get("tags", []))
            update_data["tags"] = [t for t in existing_tags if t not in updates["remove_tags"]]
        
        return update_data
    
    async def _validate_task_update(
        self,
        task: Dict[str, Any],
        update_data: Dict[str, Any],
        tenant_id: str
    ) -> tuple:
        """Validate the task update against validation rules"""
        # Import validation service
        from .validation_service import ValidationService
        
        # Build proposed task state
        proposed_task = {**task, **update_data}
        
        # Run validation
        validation_service = ValidationService(self.db)
        is_valid, errors = await validation_service.validate_task(
            proposed_task,
            proposed_task.get("custom_fields", {}),
            tenant_id,
            task.get("project_id")
        )
        
        if not is_valid and errors:
            return False, "; ".join(errors)
        
        return True, None
    
    async def _log_bulk_activity(
        self,
        task: Dict[str, Any],
        updates: Dict[str, Any],
        user_id: str,
        tenant_id: str
    ):
        """Log activity for bulk update"""
        now = datetime.now(timezone.utc)
        
        # Determine what changed
        changes = []
        if "status" in updates:
            changes.append(f"status to {updates['status']}")
        if "priority" in updates:
            changes.append(f"priority to {updates['priority']}")
        if "assignee_id" in updates:
            changes.append("assignee")
        if "tags" in updates or "add_tags" in updates or "remove_tags" in updates:
            changes.append("tags")
        if "due_date" in updates:
            changes.append("due date")
        
        description = f"Bulk updated: {', '.join(changes)}"
        
        activity = {
            "id": str(uuid.uuid4()),
            "tenant_id": tenant_id,
            "task_id": task["id"],
            "activity_type": "bulk_update",
            "description": description,
            "old_value": None,
            "new_value": updates,
            "created_by": user_id,
            "created_at": now
        }
        
        await self.db.tm_activity_logs.insert_one(activity)
    
    async def _add_bulk_comment(
        self,
        task_ids: List[str],
        comment_text: str,
        user_id: str,
        tenant_id: str
    ):
        """Add a comment to multiple tasks"""
        now = datetime.now(timezone.utc)
        
        for task_id in task_ids:
            comment = {
                "id": str(uuid.uuid4()),
                "tenant_id": tenant_id,
                "task_id": task_id,
                "content": comment_text,
                "mentions": [],
                "created_by": user_id,
                "created_at": now,
                "updated_at": now,
                "is_active": True,
                "is_bulk_comment": True
            }
            await self.db.tm_comments.insert_one(comment)
