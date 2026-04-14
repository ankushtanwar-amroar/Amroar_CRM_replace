"""
Email Template Service - Phase 9
Manages customizable email templates for Task Manager notifications.
"""
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List, Tuple
import uuid
import re
import html
import logging

logger = logging.getLogger(__name__)


# ============================================================================
# DEFAULT TEMPLATES
# ============================================================================

DEFAULT_TEMPLATES = {
    "task_assigned": {
        "name": "Task Assigned",
        "description": "Sent when a task is assigned to a user",
        "subject": "You've been assigned to: {{task.title}}",
        "html_body": """
<!DOCTYPE html>
<html>
<head><style>
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
.container { max-width: 600px; margin: 0 auto; padding: 20px; }
.header { background: #3b82f6; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
.content { background: #f8fafc; padding: 20px; border: 1px solid #e2e8f0; }
.task-card { background: white; padding: 16px; border-radius: 8px; border-left: 4px solid #3b82f6; margin: 16px 0; }
.btn { display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 16px; }
.footer { text-align: center; padding: 16px; color: #64748b; font-size: 12px; }
</style></head>
<body>
<div class="container">
  <div class="header">
    <h1 style="margin:0;font-size:20px;">Task Assigned</h1>
  </div>
  <div class="content">
    <p>Hi {{assignee.name}},</p>
    <p>You have been assigned to a new task in <strong>{{project.name}}</strong>.</p>
    <div class="task-card">
      <h3 style="margin:0 0 8px 0;">{{task.title}}</h3>
      <p style="margin:0;color:#64748b;">Priority: {{task.priority}} | Status: {{task.status}}</p>
      {{#if task.due_date}}<p style="margin:8px 0 0 0;color:#64748b;">Due: {{task.due_date}}</p>{{/if}}
    </div>
    <a href="{{task.url}}" class="btn">View Task</a>
  </div>
  <div class="footer">
    <p>This email was sent from Task Manager</p>
  </div>
</div>
</body>
</html>
""",
        "plain_body": """
Task Assigned

Hi {{assignee.name}},

You have been assigned to a new task in {{project.name}}.

Task: {{task.title}}
Priority: {{task.priority}}
Status: {{task.status}}

View task: {{task.url}}
""",
        "variables": ["task.title", "task.status", "task.priority", "task.due_date", "task.url", "project.name", "assignee.name", "assigner.name"]
    },
    
    "mentioned_in_comment": {
        "name": "@Mentioned in Comment",
        "description": "Sent when a user is mentioned in a task comment",
        "subject": "{{commenter.name}} mentioned you in {{task.title}}",
        "html_body": """
<!DOCTYPE html>
<html>
<head><style>
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
.container { max-width: 600px; margin: 0 auto; padding: 20px; }
.header { background: #8b5cf6; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
.content { background: #f8fafc; padding: 20px; border: 1px solid #e2e8f0; }
.comment-card { background: white; padding: 16px; border-radius: 8px; border-left: 4px solid #8b5cf6; margin: 16px 0; }
.btn { display: inline-block; background: #8b5cf6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 16px; }
.footer { text-align: center; padding: 16px; color: #64748b; font-size: 12px; }
</style></head>
<body>
<div class="container">
  <div class="header">
    <h1 style="margin:0;font-size:20px;">You were mentioned</h1>
  </div>
  <div class="content">
    <p>Hi {{mentioned.name}},</p>
    <p><strong>{{commenter.name}}</strong> mentioned you in a comment on <strong>{{task.title}}</strong>.</p>
    <div class="comment-card">
      <p style="margin:0;font-style:italic;">"{{comment.text}}"</p>
      <p style="margin:8px 0 0 0;color:#64748b;font-size:12px;">— {{commenter.name}}</p>
    </div>
    <a href="{{task.url}}" class="btn">View Comment</a>
  </div>
  <div class="footer">
    <p>This email was sent from Task Manager</p>
  </div>
</div>
</body>
</html>
""",
        "plain_body": """
You were mentioned

Hi {{mentioned.name}},

{{commenter.name}} mentioned you in a comment on {{task.title}}.

"{{comment.text}}"

View comment: {{task.url}}
""",
        "variables": ["task.title", "task.url", "project.name", "mentioned.name", "commenter.name", "comment.text"]
    },
    
    "task_overdue": {
        "name": "Task Overdue",
        "description": "Sent when a task becomes overdue",
        "subject": "⚠️ Task Overdue: {{task.title}}",
        "html_body": """
<!DOCTYPE html>
<html>
<head><style>
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
.container { max-width: 600px; margin: 0 auto; padding: 20px; }
.header { background: #ef4444; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
.content { background: #f8fafc; padding: 20px; border: 1px solid #e2e8f0; }
.task-card { background: white; padding: 16px; border-radius: 8px; border-left: 4px solid #ef4444; margin: 16px 0; }
.btn { display: inline-block; background: #ef4444; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 16px; }
.footer { text-align: center; padding: 16px; color: #64748b; font-size: 12px; }
</style></head>
<body>
<div class="container">
  <div class="header">
    <h1 style="margin:0;font-size:20px;">⚠️ Task Overdue</h1>
  </div>
  <div class="content">
    <p>Hi {{assignee.name}},</p>
    <p>The following task in <strong>{{project.name}}</strong> is now overdue:</p>
    <div class="task-card">
      <h3 style="margin:0 0 8px 0;">{{task.title}}</h3>
      <p style="margin:0;color:#ef4444;font-weight:bold;">Due: {{task.due_date}}</p>
      <p style="margin:8px 0 0 0;color:#64748b;">Priority: {{task.priority}}</p>
    </div>
    <p>Please update the task status or reschedule as needed.</p>
    <a href="{{task.url}}" class="btn">View Task</a>
  </div>
  <div class="footer">
    <p>This email was sent from Task Manager</p>
  </div>
</div>
</body>
</html>
""",
        "plain_body": """
⚠️ Task Overdue

Hi {{assignee.name}},

The following task in {{project.name}} is now overdue:

Task: {{task.title}}
Due: {{task.due_date}}
Priority: {{task.priority}}

Please update the task status or reschedule as needed.

View task: {{task.url}}
""",
        "variables": ["task.title", "task.status", "task.priority", "task.due_date", "task.url", "project.name", "assignee.name"]
    },
    
    "dependency_unblocked": {
        "name": "Dependency Unblocked",
        "description": "Sent when a blocking task is completed",
        "subject": "✅ Unblocked: {{task.title}}",
        "html_body": """
<!DOCTYPE html>
<html>
<head><style>
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
.container { max-width: 600px; margin: 0 auto; padding: 20px; }
.header { background: #10b981; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
.content { background: #f8fafc; padding: 20px; border: 1px solid #e2e8f0; }
.task-card { background: white; padding: 16px; border-radius: 8px; border-left: 4px solid #10b981; margin: 16px 0; }
.btn { display: inline-block; background: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 16px; }
.footer { text-align: center; padding: 16px; color: #64748b; font-size: 12px; }
</style></head>
<body>
<div class="container">
  <div class="header">
    <h1 style="margin:0;font-size:20px;">✅ Task Unblocked</h1>
  </div>
  <div class="content">
    <p>Hi {{assignee.name}},</p>
    <p>Good news! Your task is no longer blocked.</p>
    <div class="task-card">
      <h3 style="margin:0 0 8px 0;">{{task.title}}</h3>
      <p style="margin:0;color:#64748b;">The blocking task <strong>{{blocker.title}}</strong> has been completed.</p>
    </div>
    <p>You can now continue working on this task.</p>
    <a href="{{task.url}}" class="btn">View Task</a>
  </div>
  <div class="footer">
    <p>This email was sent from Task Manager</p>
  </div>
</div>
</body>
</html>
""",
        "plain_body": """
✅ Task Unblocked

Hi {{assignee.name}},

Good news! Your task is no longer blocked.

Task: {{task.title}}
Previously blocked by: {{blocker.title}}

You can now continue working on this task.

View task: {{task.url}}
""",
        "variables": ["task.title", "task.url", "project.name", "assignee.name", "blocker.title"]
    },
    
    "approval_requested": {
        "name": "Approval Requested",
        "description": "Sent when a task requires approval",
        "subject": "🔔 Approval Required: {{task.title}}",
        "html_body": """
<!DOCTYPE html>
<html>
<head><style>
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
.container { max-width: 600px; margin: 0 auto; padding: 20px; }
.header { background: #f59e0b; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
.content { background: #f8fafc; padding: 20px; border: 1px solid #e2e8f0; }
.task-card { background: white; padding: 16px; border-radius: 8px; border-left: 4px solid #f59e0b; margin: 16px 0; }
.btn { display: inline-block; background: #f59e0b; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 16px; }
.footer { text-align: center; padding: 16px; color: #64748b; font-size: 12px; }
</style></head>
<body>
<div class="container">
  <div class="header">
    <h1 style="margin:0;font-size:20px;">🔔 Approval Required</h1>
  </div>
  <div class="content">
    <p>Hi {{approver.name}},</p>
    <p><strong>{{requester.name}}</strong> has requested your approval for a task in <strong>{{project.name}}</strong>.</p>
    <div class="task-card">
      <h3 style="margin:0 0 8px 0;">{{task.title}}</h3>
      <p style="margin:0;color:#64748b;">{{task.description}}</p>
      <p style="margin:8px 0 0 0;color:#64748b;">Priority: {{task.priority}}</p>
    </div>
    <p>Please review and approve or reject this task.</p>
    <a href="{{task.url}}" class="btn">Review Task</a>
  </div>
  <div class="footer">
    <p>This email was sent from Task Manager</p>
  </div>
</div>
</body>
</html>
""",
        "plain_body": """
🔔 Approval Required

Hi {{approver.name}},

{{requester.name}} has requested your approval for a task in {{project.name}}.

Task: {{task.title}}
Description: {{task.description}}
Priority: {{task.priority}}

Please review and approve or reject this task.

Review task: {{task.url}}
""",
        "variables": ["task.title", "task.description", "task.priority", "task.url", "project.name", "approver.name", "requester.name"]
    },
    
    "approval_approved": {
        "name": "Approval Approved",
        "description": "Sent when a task approval is approved",
        "subject": "✅ Approved: {{task.title}}",
        "html_body": """
<!DOCTYPE html>
<html>
<head><style>
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
.container { max-width: 600px; margin: 0 auto; padding: 20px; }
.header { background: #10b981; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
.content { background: #f8fafc; padding: 20px; border: 1px solid #e2e8f0; }
.task-card { background: white; padding: 16px; border-radius: 8px; border-left: 4px solid #10b981; margin: 16px 0; }
.btn { display: inline-block; background: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 16px; }
.footer { text-align: center; padding: 16px; color: #64748b; font-size: 12px; }
</style></head>
<body>
<div class="container">
  <div class="header">
    <h1 style="margin:0;font-size:20px;">✅ Task Approved</h1>
  </div>
  <div class="content">
    <p>Hi {{owner.name}},</p>
    <p>Great news! <strong>{{approver.name}}</strong> has approved your task.</p>
    <div class="task-card">
      <h3 style="margin:0 0 8px 0;">{{task.title}}</h3>
      <p style="margin:0;color:#10b981;font-weight:bold;">Status: {{task.status}}</p>
    </div>
    <a href="{{task.url}}" class="btn">View Task</a>
  </div>
  <div class="footer">
    <p>This email was sent from Task Manager</p>
  </div>
</div>
</body>
</html>
""",
        "plain_body": """
✅ Task Approved

Hi {{owner.name}},

Great news! {{approver.name}} has approved your task.

Task: {{task.title}}
Status: {{task.status}}

View task: {{task.url}}
""",
        "variables": ["task.title", "task.status", "task.url", "project.name", "owner.name", "approver.name"]
    },
    
    "approval_rejected": {
        "name": "Approval Rejected",
        "description": "Sent when a task approval is rejected",
        "subject": "❌ Rejected: {{task.title}}",
        "html_body": """
<!DOCTYPE html>
<html>
<head><style>
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
.container { max-width: 600px; margin: 0 auto; padding: 20px; }
.header { background: #ef4444; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
.content { background: #f8fafc; padding: 20px; border: 1px solid #e2e8f0; }
.task-card { background: white; padding: 16px; border-radius: 8px; border-left: 4px solid #ef4444; margin: 16px 0; }
.reason-box { background: #fef2f2; border: 1px solid #fecaca; padding: 12px; border-radius: 6px; margin: 16px 0; }
.btn { display: inline-block; background: #ef4444; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 16px; }
.footer { text-align: center; padding: 16px; color: #64748b; font-size: 12px; }
</style></head>
<body>
<div class="container">
  <div class="header">
    <h1 style="margin:0;font-size:20px;">❌ Task Rejected</h1>
  </div>
  <div class="content">
    <p>Hi {{owner.name}},</p>
    <p><strong>{{approver.name}}</strong> has rejected your task.</p>
    <div class="task-card">
      <h3 style="margin:0 0 8px 0;">{{task.title}}</h3>
      <p style="margin:0;color:#ef4444;font-weight:bold;">Status: {{task.status}}</p>
    </div>
    <div class="reason-box">
      <p style="margin:0;font-weight:bold;color:#991b1b;">Reason:</p>
      <p style="margin:8px 0 0 0;color:#991b1b;">{{approval.comment}}</p>
    </div>
    <p>Please address the feedback and resubmit for approval.</p>
    <a href="{{task.url}}" class="btn">View Task</a>
  </div>
  <div class="footer">
    <p>This email was sent from Task Manager</p>
  </div>
</div>
</body>
</html>
""",
        "plain_body": """
❌ Task Rejected

Hi {{owner.name}},

{{approver.name}} has rejected your task.

Task: {{task.title}}
Status: {{task.status}}

Reason: {{approval.comment}}

Please address the feedback and resubmit for approval.

View task: {{task.url}}
""",
        "variables": ["task.title", "task.status", "task.url", "project.name", "owner.name", "approver.name", "approval.comment"]
    }
}


class EmailTemplateService:
    """Service for managing email templates"""
    
    def __init__(self, db):
        self.db = db
    
    # =========================================================================
    # TEMPLATE CRUD
    # =========================================================================
    
    async def get_template(
        self,
        tenant_id: str,
        template_type: str
    ) -> Dict[str, Any]:
        """Get a template by type, or return default if not customized"""
        
        # Try to find custom template
        template = await self.db.tm_email_templates.find_one({
            "tenant_id": tenant_id,
            "template_type": template_type,
            "is_active": True
        })
        
        if template:
            template.pop("_id", None)
            return template
        
        # Return default template
        default = DEFAULT_TEMPLATES.get(template_type)
        if not default:
            return None
        
        return {
            "id": None,
            "tenant_id": tenant_id,
            "template_type": template_type,
            "name": default["name"],
            "description": default["description"],
            "subject": default["subject"],
            "html_body": default["html_body"],
            "plain_body": default["plain_body"],
            "variables": default["variables"],
            "is_enabled": True,
            "is_default": True,
            "version": 0,
            "created_at": None,
            "updated_at": None
        }
    
    async def list_templates(self, tenant_id: str) -> List[Dict[str, Any]]:
        """List all templates for a tenant (including defaults)"""
        templates = []
        
        # Get custom templates
        custom_cursor = self.db.tm_email_templates.find({
            "tenant_id": tenant_id,
            "is_active": True
        })
        custom_templates = await custom_cursor.to_list(length=100)
        custom_types = {t["template_type"]: t for t in custom_templates}
        
        # Build full list with defaults
        for template_type, default in DEFAULT_TEMPLATES.items():
            if template_type in custom_types:
                tpl = custom_types[template_type]
                tpl.pop("_id", None)
                tpl["is_default"] = False
                templates.append(tpl)
            else:
                templates.append({
                    "id": None,
                    "tenant_id": tenant_id,
                    "template_type": template_type,
                    "name": default["name"],
                    "description": default["description"],
                    "subject": default["subject"],
                    "is_enabled": True,
                    "is_default": True,
                    "version": 0,
                    "variables": default["variables"],
                    "created_at": None,
                    "updated_at": None
                })
        
        return templates
    
    async def save_template(
        self,
        tenant_id: str,
        user_id: str,
        template_type: str,
        subject: str,
        html_body: str,
        plain_body: str,
        is_enabled: bool = True
    ) -> Dict[str, Any]:
        """Create or update a template"""
        
        if template_type not in DEFAULT_TEMPLATES:
            raise ValueError(f"Invalid template type: {template_type}")
        
        default = DEFAULT_TEMPLATES[template_type]
        now = datetime.now(timezone.utc)
        
        # Check if template exists
        existing = await self.db.tm_email_templates.find_one({
            "tenant_id": tenant_id,
            "template_type": template_type,
            "is_active": True
        })
        
        if existing:
            # Update existing
            new_version = existing.get("version", 0) + 1
            
            await self.db.tm_email_templates.update_one(
                {"id": existing["id"]},
                {"$set": {
                    "subject": subject,
                    "html_body": html_body,
                    "plain_body": plain_body,
                    "is_enabled": is_enabled,
                    "version": new_version,
                    "updated_at": now,
                    "updated_by": user_id
                }}
            )
            
            # Audit log
            await self._log_template_change(
                tenant_id, existing["id"], template_type,
                "update", user_id, new_version
            )
            
            return await self.get_template(tenant_id, template_type)
        else:
            # Create new
            template = {
                "id": str(uuid.uuid4()),
                "tenant_id": tenant_id,
                "template_type": template_type,
                "name": default["name"],
                "description": default["description"],
                "subject": subject,
                "html_body": html_body,
                "plain_body": plain_body,
                "variables": default["variables"],
                "is_enabled": is_enabled,
                "is_default": False,
                "version": 1,
                "created_at": now,
                "created_by": user_id,
                "updated_at": now,
                "updated_by": user_id,
                "is_active": True
            }
            
            await self.db.tm_email_templates.insert_one(template)
            template.pop("_id", None)
            
            # Audit log
            await self._log_template_change(
                tenant_id, template["id"], template_type,
                "create", user_id, 1
            )
            
            return template
    
    async def toggle_template(
        self,
        tenant_id: str,
        user_id: str,
        template_type: str
    ) -> Dict[str, Any]:
        """Toggle template enabled/disabled"""
        
        template = await self.db.tm_email_templates.find_one({
            "tenant_id": tenant_id,
            "template_type": template_type,
            "is_active": True
        })
        
        if not template:
            # Create a disabled copy of default
            default = DEFAULT_TEMPLATES.get(template_type)
            if not default:
                raise ValueError(f"Invalid template type: {template_type}")
            
            return await self.save_template(
                tenant_id, user_id, template_type,
                default["subject"], default["html_body"], default["plain_body"],
                is_enabled=False
            )
        
        new_state = not template.get("is_enabled", True)
        
        await self.db.tm_email_templates.update_one(
            {"id": template["id"]},
            {"$set": {
                "is_enabled": new_state,
                "updated_at": datetime.now(timezone.utc),
                "updated_by": user_id
            }}
        )
        
        # Audit log
        await self._log_template_change(
            tenant_id, template["id"], template_type,
            "toggle", user_id, template.get("version", 1),
            {"is_enabled": new_state}
        )
        
        return await self.get_template(tenant_id, template_type)
    
    async def reset_template(
        self,
        tenant_id: str,
        user_id: str,
        template_type: str
    ) -> Dict[str, Any]:
        """Reset template to default"""
        
        template = await self.db.tm_email_templates.find_one({
            "tenant_id": tenant_id,
            "template_type": template_type,
            "is_active": True
        })
        
        if template:
            # Soft delete the custom template
            await self.db.tm_email_templates.update_one(
                {"id": template["id"]},
                {"$set": {
                    "is_active": False,
                    "updated_at": datetime.now(timezone.utc),
                    "updated_by": user_id
                }}
            )
            
            # Audit log
            await self._log_template_change(
                tenant_id, template["id"], template_type,
                "reset", user_id, template.get("version", 1)
            )
        
        return await self.get_template(tenant_id, template_type)
    
    # =========================================================================
    # RENDERING
    # =========================================================================
    
    def render_template(
        self,
        template: Dict[str, Any],
        variables: Dict[str, Any]
    ) -> Tuple[str, str, str]:
        """
        Render template with variables.
        Returns (subject, html_body, plain_body)
        """
        
        subject = self._substitute_variables(template["subject"], variables)
        html_body = self._substitute_variables(template["html_body"], variables)
        plain_body = self._substitute_variables(template["plain_body"], variables)
        
        return subject, html_body, plain_body
    
    def _substitute_variables(self, text: str, variables: Dict[str, Any]) -> str:
        """Substitute {{variable}} placeholders with values"""
        
        def replace_var(match):
            var_name = match.group(1).strip()
            
            # Handle nested variables like task.title
            parts = var_name.split(".")
            value = variables
            
            for part in parts:
                if isinstance(value, dict):
                    value = value.get(part, "")
                else:
                    value = ""
                    break
            
            # Sanitize value for HTML safety
            if isinstance(value, str):
                return html.escape(str(value))
            elif value is None:
                return ""
            else:
                return html.escape(str(value))
        
        # Replace {{variable}} patterns
        result = re.sub(r'\{\{([^}]+)\}\}', replace_var, text)
        
        # Handle simple conditionals {{#if var}}...{{/if}}
        result = self._process_conditionals(result, variables)
        
        return result
    
    def _process_conditionals(self, text: str, variables: Dict[str, Any]) -> str:
        """Process simple {{#if var}}content{{/if}} blocks"""
        
        def replace_if(match):
            var_name = match.group(1).strip()
            content = match.group(2)
            
            # Check if variable is truthy
            parts = var_name.split(".")
            value = variables
            
            for part in parts:
                if isinstance(value, dict):
                    value = value.get(part)
                else:
                    value = None
                    break
            
            if value:
                return content
            return ""
        
        # Match {{#if var}}content{{/if}}
        pattern = r'\{\{#if\s+([^}]+)\}\}(.*?)\{\{/if\}\}'
        return re.sub(pattern, replace_if, text, flags=re.DOTALL)
    
    async def get_rendered_email(
        self,
        tenant_id: str,
        template_type: str,
        variables: Dict[str, Any]
    ) -> Tuple[Optional[str], Optional[str], Optional[str]]:
        """
        Get rendered email content.
        Returns (subject, html_body, plain_body) or (None, None, None) if disabled
        """
        
        template = await self.get_template(tenant_id, template_type)
        
        if not template:
            logger.warning(f"Template not found: {template_type}")
            return None, None, None
        
        if not template.get("is_enabled", True):
            logger.info(f"Template disabled: {template_type}")
            return None, None, None
        
        try:
            return self.render_template(template, variables)
        except Exception as e:
            logger.error(f"Template rendering error for {template_type}: {e}")
            # Fallback to default
            default = DEFAULT_TEMPLATES.get(template_type)
            if default:
                try:
                    return self.render_template(default, variables)
                except Exception as e2:
                    logger.error(f"Default template rendering also failed: {e2}")
            return None, None, None
    
    # =========================================================================
    # AUDIT LOGGING
    # =========================================================================
    
    async def _log_template_change(
        self,
        tenant_id: str,
        template_id: str,
        template_type: str,
        action: str,
        user_id: str,
        version: int,
        details: Dict[str, Any] = None
    ):
        """Log template changes for audit"""
        
        log_entry = {
            "id": str(uuid.uuid4()),
            "tenant_id": tenant_id,
            "template_id": template_id,
            "template_type": template_type,
            "action": action,
            "user_id": user_id,
            "version": version,
            "details": details,
            "timestamp": datetime.now(timezone.utc)
        }
        
        await self.db.tm_email_template_logs.insert_one(log_entry)
    
    async def get_template_history(
        self,
        tenant_id: str,
        template_type: str,
        limit: int = 20
    ) -> List[Dict[str, Any]]:
        """Get audit history for a template"""
        
        cursor = self.db.tm_email_template_logs.find({
            "tenant_id": tenant_id,
            "template_type": template_type
        }).sort("timestamp", -1).limit(limit)
        
        logs = await cursor.to_list(length=limit)
        for log in logs:
            log.pop("_id", None)
        
        return logs
    
    # =========================================================================
    # HELPERS
    # =========================================================================
    
    def get_available_variables(self, template_type: str) -> List[str]:
        """Get list of available variables for a template type"""
        
        default = DEFAULT_TEMPLATES.get(template_type)
        if default:
            return default["variables"]
        return []
    
    def get_template_types(self) -> List[Dict[str, str]]:
        """Get list of all template types"""
        
        return [
            {"type": key, "name": val["name"], "description": val["description"]}
            for key, val in DEFAULT_TEMPLATES.items()
        ]
