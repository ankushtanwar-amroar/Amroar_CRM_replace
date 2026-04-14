"""
Task Template Service
Handles CRUD operations for task templates and template-based task creation
"""
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone
import uuid
import logging

from motor.motor_asyncio import AsyncIOMotorDatabase

logger = logging.getLogger(__name__)


class TaskTemplateService:
    """Service for managing task templates"""
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
    
    async def list_templates(
        self,
        tenant_id: str,
        project_id: Optional[str] = None,
        include_global: bool = True
    ) -> List[Dict[str, Any]]:
        """List all task templates for a tenant"""
        query = {"tenant_id": tenant_id, "is_active": True}
        
        if project_id:
            if include_global:
                query["$or"] = [
                    {"scope": "global"},
                    {"project_id": project_id}
                ]
            else:
                query["project_id"] = project_id
        
        templates = await self.db.tm_task_templates.find(
            query, {"_id": 0}
        ).sort("name", 1).to_list(100)
        
        # Get usage counts
        for template in templates:
            usage_count = await self.db.tm_tasks.count_documents({
                "template_id": template["id"],
                "tenant_id": tenant_id
            })
            template["usage_count"] = usage_count
        
        return templates
    
    async def get_template(
        self,
        template_id: str,
        tenant_id: str
    ) -> Optional[Dict[str, Any]]:
        """Get a specific template by ID"""
        template = await self.db.tm_task_templates.find_one(
            {"id": template_id, "tenant_id": tenant_id, "is_active": True},
            {"_id": 0}
        )
        return template
    
    async def create_template(
        self,
        tenant_id: str,
        created_by: str,
        name: str,
        description: Optional[str] = None,
        scope: str = "global",
        project_id: Optional[str] = None,
        default_title: str = "",
        default_description: Optional[str] = None,
        default_status: str = "todo",
        default_priority: str = "medium",
        default_task_type: str = "other",
        default_assignee_id: Optional[str] = None,
        default_tags: Optional[List[str]] = None,
        default_due_days: Optional[int] = None,
        checklist_items: Optional[List[Dict[str, str]]] = None,
        custom_field_values: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Create a new task template"""
        now = datetime.now(timezone.utc)
        
        # Validate scope
        if scope == "project" and not project_id:
            raise ValueError("project_id is required for project-scoped templates")
        
        template_data = {
            "id": str(uuid.uuid4()),
            "tenant_id": tenant_id,
            "name": name,
            "description": description,
            "scope": scope,
            "project_id": project_id if scope == "project" else None,
            "default_title": default_title,
            "default_description": default_description,
            "default_status": default_status,
            "default_priority": default_priority,
            "default_task_type": default_task_type,
            "default_assignee_id": default_assignee_id,
            "default_tags": default_tags or [],
            "default_due_days": default_due_days,
            "checklist_items": checklist_items or [],
            "custom_field_values": custom_field_values or {},
            "is_active": True,
            "created_by": created_by,
            "created_at": now,
            "updated_at": now
        }
        
        await self.db.tm_task_templates.insert_one(template_data)
        template_data.pop("_id", None)
        
        return template_data
    
    async def update_template(
        self,
        template_id: str,
        tenant_id: str,
        updates: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """Update an existing template"""
        # Verify template exists
        existing = await self.db.tm_task_templates.find_one(
            {"id": template_id, "tenant_id": tenant_id, "is_active": True}
        )
        
        if not existing:
            return None
        
        # Build update data
        allowed_fields = {
            "name", "description", "scope", "project_id",
            "default_title", "default_description", "default_status",
            "default_priority", "default_task_type", "default_assignee_id",
            "default_tags", "default_due_days", "checklist_items",
            "custom_field_values"
        }
        
        update_data = {k: v for k, v in updates.items() if k in allowed_fields}
        update_data["updated_at"] = datetime.now(timezone.utc)
        
        await self.db.tm_task_templates.update_one(
            {"id": template_id},
            {"$set": update_data}
        )
        
        updated = await self.db.tm_task_templates.find_one(
            {"id": template_id},
            {"_id": 0}
        )
        
        return updated
    
    async def delete_template(
        self,
        template_id: str,
        tenant_id: str
    ) -> bool:
        """Soft delete a template"""
        result = await self.db.tm_task_templates.update_one(
            {"id": template_id, "tenant_id": tenant_id},
            {
                "$set": {
                    "is_active": False,
                    "deleted_at": datetime.now(timezone.utc)
                }
            }
        )
        
        return result.modified_count > 0
    
    async def create_task_from_template(
        self,
        template_id: str,
        project_id: str,
        user_id: str,
        tenant_id: str,
        overrides: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Create a new task from a template"""
        # Get template
        template = await self.get_template(template_id, tenant_id)
        if not template:
            raise ValueError("Template not found")
        
        now = datetime.now(timezone.utc)
        overrides = overrides or {}
        
        # Calculate due date if default_due_days is set
        due_date = None
        if template.get("default_due_days"):
            from datetime import timedelta
            due_date = now + timedelta(days=template["default_due_days"])
        
        # Build task data from template
        task_data = {
            "id": str(uuid.uuid4()),
            "tenant_id": tenant_id,
            "project_id": project_id,
            "template_id": template_id,
            "title": overrides.get("title", template.get("default_title", "New Task")),
            "description": overrides.get("description", template.get("default_description")),
            "status": overrides.get("status", template.get("default_status", "todo")),
            "priority": overrides.get("priority", template.get("default_priority", "medium")),
            "task_type": overrides.get("task_type", template.get("default_task_type", "other")),
            "assignee_id": overrides.get("assignee_id", template.get("default_assignee_id")),
            "tags": overrides.get("tags", template.get("default_tags", [])),
            "due_date": overrides.get("due_date") or due_date,
            "custom_fields": template.get("custom_field_values", {}),
            "created_by": user_id,
            "created_at": now,
            "updated_at": now,
            "is_active": True,
            "subtask_count": 0,
            "completed_subtask_count": 0,
            "checklist_count": len(template.get("checklist_items", [])),
            "completed_checklist_count": 0,
            "is_blocked": False,
            "order_index": 0
        }
        
        # Get max order_index for the project
        max_order = await self.db.tm_tasks.find_one(
            {"project_id": project_id, "tenant_id": tenant_id},
            sort=[("order_index", -1)]
        )
        task_data["order_index"] = (max_order.get("order_index", 0) + 1) if max_order else 0
        
        # Insert task
        await self.db.tm_tasks.insert_one(task_data)
        task_data.pop("_id", None)
        
        # Create checklist items from template
        checklist_items = template.get("checklist_items", [])
        for idx, item in enumerate(checklist_items):
            checklist_data = {
                "id": str(uuid.uuid4()),
                "tenant_id": tenant_id,
                "task_id": task_data["id"],
                "title": item.get("title", ""),
                "is_completed": False,
                "order_index": idx,
                "created_by": user_id,
                "created_at": now,
                "updated_at": now
            }
            await self.db.tm_checklists.insert_one(checklist_data)
        
        return task_data
    
    async def duplicate_template(
        self,
        template_id: str,
        tenant_id: str,
        user_id: str,
        new_name: Optional[str] = None
    ) -> Dict[str, Any]:
        """Duplicate an existing template"""
        template = await self.get_template(template_id, tenant_id)
        if not template:
            raise ValueError("Template not found")
        
        # Create new template with modified name
        new_template = {**template}
        new_template["id"] = str(uuid.uuid4())
        new_template["name"] = new_name or f"{template['name']} (Copy)"
        new_template["created_by"] = user_id
        new_template["created_at"] = datetime.now(timezone.utc)
        new_template["updated_at"] = datetime.now(timezone.utc)
        
        await self.db.tm_task_templates.insert_one(new_template)
        new_template.pop("_id", None)
        
        return new_template
