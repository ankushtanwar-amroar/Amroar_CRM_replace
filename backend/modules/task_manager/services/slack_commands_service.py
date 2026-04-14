"""
Slack Slash Commands & Interactive Modals Service - Phase 13
Handles /task commands, interactive modals, and quick actions
"""
import os
import json
import logging
import re
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List, Tuple
import uuid

from slack_sdk import WebClient
from slack_sdk.errors import SlackApiError

logger = logging.getLogger(__name__)


class SlackCommandsService:
    """Service for handling Slack slash commands and interactive components"""
    
    # Task ID pattern: TM-{uuid}
    TASK_ID_PATTERN = re.compile(r'TM-([a-zA-Z0-9-]+)', re.IGNORECASE)
    
    # Items per page for /task my
    TASKS_PER_PAGE = 5
    
    def __init__(self, db, slack_service):
        self.db = db
        self.slack = slack_service
        self.frontend_url = os.environ.get("BACKEND_URL", "").replace("/api", "")
    
    async def get_slack_commands_config(self, tenant_id: str) -> Dict[str, Any]:
        """Get Slack commands configuration for tenant"""
        config = await self.db.tm_slack_commands_config.find_one(
            {"tenant_id": tenant_id},
            {"_id": 0}
        )
        return config or {
            "slash_commands_enabled": True,
            "interactive_components_enabled": True
        }
    
    async def save_slack_commands_config(
        self,
        tenant_id: str,
        user_id: str,
        config_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Save Slack commands configuration"""
        now = datetime.now(timezone.utc)
        
        await self.db.tm_slack_commands_config.update_one(
            {"tenant_id": tenant_id},
            {
                "$set": {
                    **config_data,
                    "tenant_id": tenant_id,
                    "updated_at": now,
                    "updated_by": user_id
                }
            },
            upsert=True
        )
        
        return await self.get_slack_commands_config(tenant_id)
    
    async def find_user_by_slack_id(self, slack_user_id: str, tenant_id: str) -> Optional[Dict]:
        """Find Task Manager user by their Slack ID"""
        settings = await self.db.tm_slack_user_settings.find_one({
            "slack_user_id": slack_user_id,
            "tenant_id": tenant_id
        })
        
        if settings:
            user = await self.db.users.find_one(
                {"id": settings.get("user_id")},
                {"_id": 0, "password": 0}
            )
            return user
        
        return None
    
    async def find_user_by_email(self, email: str, tenant_id: str) -> Optional[Dict]:
        """Find Task Manager user by email"""
        user = await self.db.users.find_one(
            {"email": email, "tenant_id": tenant_id},
            {"_id": 0, "password": 0}
        )
        return user
    
    def get_task_url(self, project_id: str, task_id: str) -> str:
        """Generate URL to task in the app"""
        return f"{self.frontend_url}/task-manager/projects/{project_id}?task={task_id}"
    
    async def check_task_permissions(
        self,
        task: Dict[str, Any],
        user: Dict[str, Any],
        action: str
    ) -> Tuple[bool, str]:
        """Check if user has permission to perform action on task"""
        # For now, basic permission check - same tenant
        if task.get("tenant_id") != user.get("tenant_id"):
            return False, "Access denied - task belongs to different organization"
        
        # Check if task is pending approval
        if task.get("approval_status") == "pending":
            return False, "Task is pending approval and cannot be modified"
        
        return True, ""
    
    async def log_slack_action(
        self,
        tenant_id: str,
        task_id: str,
        action_type: str,
        description: str,
        slack_user_id: str,
        user_id: str = None,
        details: Dict[str, Any] = None
    ):
        """Log Slack action in activity history"""
        activity = {
            "id": str(uuid.uuid4()),
            "tenant_id": tenant_id,
            "task_id": task_id,
            "activity_type": f"slack_{action_type}",
            "description": description,
            "source": "slack",
            "slack_user_id": slack_user_id,
            "created_by": user_id or "slack",
            "details": details or {},
            "created_at": datetime.now(timezone.utc)
        }
        
        await self.db.tm_activity_logs.insert_one(activity)
    
    # =========================================================================
    # SLASH COMMAND HANDLERS
    # =========================================================================
    
    async def handle_task_command(
        self,
        command_text: str,
        slack_user_id: str,
        tenant_id: str,
        trigger_id: str,
        response_url: str
    ) -> Dict[str, Any]:
        """
        Handle /task command
        Subcommands: create, status, my
        """
        # Parse command
        parts = command_text.strip().split(maxsplit=1)
        subcommand = parts[0].lower() if parts else ""
        args = parts[1] if len(parts) > 1 else ""
        
        # Find user
        user = await self.find_user_by_slack_id(slack_user_id, tenant_id)
        
        if subcommand == "create":
            return await self._handle_create_command(user, tenant_id, trigger_id)
        
        elif subcommand == "status":
            return await self._handle_status_command(args, user, tenant_id)
        
        elif subcommand == "my":
            return await self._handle_my_tasks_command(user, tenant_id, page=0)
        
        elif subcommand == "help" or not subcommand:
            return self._build_help_response()
        
        else:
            return {
                "response_type": "ephemeral",
                "text": f"Unknown command: `/task {subcommand}`\n\nUse `/task help` for available commands."
            }
    
    async def _handle_create_command(
        self,
        user: Optional[Dict],
        tenant_id: str,
        trigger_id: str
    ) -> Dict[str, Any]:
        """Handle /task create - Open modal for task creation"""
        if not user:
            return {
                "response_type": "ephemeral",
                "text": "❌ Your Slack account is not linked to Task Manager. Please link it in Task Manager → Integrations → Slack."
            }
        
        # Get projects for the user
        projects = await self.db.tm_projects.find(
            {"tenant_id": tenant_id, "is_active": True},
            {"_id": 0, "id": 1, "name": 1}
        ).sort("name", 1).to_list(50)
        
        if not projects:
            return {
                "response_type": "ephemeral",
                "text": "❌ No projects found. Create a project in Task Manager first."
            }
        
        # Get team members for assignee dropdown
        team_members = await self.db.users.find(
            {"tenant_id": tenant_id, "is_active": True},
            {"_id": 0, "id": 1, "name": 1, "email": 1}
        ).sort("name", 1).to_list(100)
        
        # Build and open modal
        modal = self._build_create_task_modal(projects, team_members, tenant_id)
        
        try:
            self.slack.client.views_open(
                trigger_id=trigger_id,
                view=modal
            )
            return None  # Modal opened, no response needed
        except SlackApiError as e:
            logger.error(f"Failed to open create task modal: {e}")
            return {
                "response_type": "ephemeral",
                "text": f"❌ Failed to open task creation form: {str(e)}"
            }
    
    async def _handle_status_command(
        self,
        task_ref: str,
        user: Optional[Dict],
        tenant_id: str
    ) -> Dict[str, Any]:
        """Handle /task status TM-123"""
        if not task_ref:
            return {
                "response_type": "ephemeral",
                "text": "Please provide a task ID: `/task status TM-abc123`"
            }
        
        # Extract task ID
        match = self.TASK_ID_PATTERN.search(task_ref)
        if match:
            task_id = match.group(1)
        else:
            task_id = task_ref.strip()
        
        # Find task
        task = await self.db.tm_tasks.find_one(
            {"id": task_id, "tenant_id": tenant_id, "is_active": True},
            {"_id": 0}
        )
        
        if not task:
            return {
                "response_type": "ephemeral",
                "text": f"❌ Task `TM-{task_id}` not found"
            }
        
        # Get project
        project = await self.db.tm_projects.find_one(
            {"id": task.get("project_id")},
            {"_id": 0, "name": 1}
        )
        
        # Get assignee
        assignee = None
        if task.get("assignee_id"):
            assignee = await self.db.users.find_one(
                {"id": task.get("assignee_id")},
                {"_id": 0, "name": 1}
            )
        
        task_url = self.get_task_url(task.get("project_id"), task_id)
        
        # Build response blocks
        blocks = self._build_task_status_blocks(task, project, assignee, task_url)
        
        return {
            "response_type": "ephemeral",
            "blocks": blocks
        }
    
    async def _handle_my_tasks_command(
        self,
        user: Optional[Dict],
        tenant_id: str,
        page: int = 0
    ) -> Dict[str, Any]:
        """Handle /task my - Show user's open tasks"""
        if not user:
            return {
                "response_type": "ephemeral",
                "text": "❌ Your Slack account is not linked to Task Manager. Please link it in Task Manager → Integrations → Slack."
            }
        
        # Get user's tasks
        query = {
            "assignee_id": user.get("id"),
            "tenant_id": tenant_id,
            "is_active": True,
            "status": {"$ne": "done"}
        }
        
        total_count = await self.db.tm_tasks.count_documents(query)
        
        tasks = await self.db.tm_tasks.find(
            query,
            {"_id": 0}
        ).sort([
            ("priority", -1),  # Urgent/high first
            ("due_date", 1)    # Earliest due first
        ]).skip(page * self.TASKS_PER_PAGE).limit(self.TASKS_PER_PAGE).to_list(self.TASKS_PER_PAGE)
        
        if not tasks:
            return {
                "response_type": "ephemeral",
                "text": "🎉 You have no open tasks assigned to you!"
            }
        
        # Get projects for tasks
        project_ids = list(set(t.get("project_id") for t in tasks))
        projects = await self.db.tm_projects.find(
            {"id": {"$in": project_ids}},
            {"_id": 0, "id": 1, "name": 1}
        ).to_list(len(project_ids))
        project_map = {p["id"]: p["name"] for p in projects}
        
        # Build response blocks
        blocks = self._build_my_tasks_blocks(tasks, project_map, page, total_count)
        
        return {
            "response_type": "ephemeral",
            "blocks": blocks
        }
    
    def _build_help_response(self) -> Dict[str, Any]:
        """Build help response for /task command"""
        return {
            "response_type": "ephemeral",
            "blocks": [
                {
                    "type": "header",
                    "text": {
                        "type": "plain_text",
                        "text": "📋 Task Manager Commands",
                        "emoji": True
                    }
                },
                {
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": "*Available Commands:*"
                    }
                },
                {
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": "`/task create` - Open task creation form\n`/task status TM-123` - View task details\n`/task my` - View your open tasks\n`/task help` - Show this help"
                    }
                },
                {
                    "type": "context",
                    "elements": [
                        {
                            "type": "mrkdwn",
                            "text": "💡 Link your Slack account in Task Manager → Integrations → Slack"
                        }
                    ]
                }
            ]
        }
    
    # =========================================================================
    # MODAL BUILDERS
    # =========================================================================
    
    def _build_create_task_modal(
        self,
        projects: List[Dict],
        team_members: List[Dict],
        tenant_id: str
    ) -> Dict[str, Any]:
        """Build Slack modal for task creation"""
        # Project options
        project_options = [
            {
                "text": {"type": "plain_text", "text": p["name"][:75]},
                "value": p["id"]
            }
            for p in projects
        ]
        
        # Assignee options
        assignee_options = [
            {
                "text": {"type": "plain_text", "text": f"{m['name']} ({m['email']})"[:75]},
                "value": m["id"]
            }
            for m in team_members
        ]
        
        # Priority options
        priority_options = [
            {"text": {"type": "plain_text", "text": "🟢 Low"}, "value": "low"},
            {"text": {"type": "plain_text", "text": "🟡 Medium"}, "value": "medium"},
            {"text": {"type": "plain_text", "text": "🟠 High"}, "value": "high"},
            {"text": {"type": "plain_text", "text": "🔴 Urgent"}, "value": "urgent"}
        ]
        
        modal = {
            "type": "modal",
            "callback_id": "create_task_modal",
            "private_metadata": json.dumps({"tenant_id": tenant_id}),
            "title": {
                "type": "plain_text",
                "text": "Create Task"
            },
            "submit": {
                "type": "plain_text",
                "text": "Create"
            },
            "close": {
                "type": "plain_text",
                "text": "Cancel"
            },
            "blocks": [
                {
                    "type": "input",
                    "block_id": "project_block",
                    "element": {
                        "type": "static_select",
                        "action_id": "project_select",
                        "placeholder": {"type": "plain_text", "text": "Select project"},
                        "options": project_options
                    },
                    "label": {"type": "plain_text", "text": "Project"}
                },
                {
                    "type": "input",
                    "block_id": "title_block",
                    "element": {
                        "type": "plain_text_input",
                        "action_id": "title_input",
                        "placeholder": {"type": "plain_text", "text": "What needs to be done?"}
                    },
                    "label": {"type": "plain_text", "text": "Title"}
                },
                {
                    "type": "input",
                    "block_id": "description_block",
                    "optional": True,
                    "element": {
                        "type": "plain_text_input",
                        "action_id": "description_input",
                        "multiline": True,
                        "placeholder": {"type": "plain_text", "text": "Add more details..."}
                    },
                    "label": {"type": "plain_text", "text": "Description"}
                },
                {
                    "type": "input",
                    "block_id": "priority_block",
                    "element": {
                        "type": "static_select",
                        "action_id": "priority_select",
                        "initial_option": priority_options[1],  # Medium
                        "options": priority_options
                    },
                    "label": {"type": "plain_text", "text": "Priority"}
                },
                {
                    "type": "input",
                    "block_id": "assignee_block",
                    "optional": True,
                    "element": {
                        "type": "static_select",
                        "action_id": "assignee_select",
                        "placeholder": {"type": "plain_text", "text": "Select assignee"},
                        "options": assignee_options
                    },
                    "label": {"type": "plain_text", "text": "Assignee"}
                },
                {
                    "type": "input",
                    "block_id": "due_date_block",
                    "optional": True,
                    "element": {
                        "type": "datepicker",
                        "action_id": "due_date_select",
                        "placeholder": {"type": "plain_text", "text": "Select due date"}
                    },
                    "label": {"type": "plain_text", "text": "Due Date"}
                }
            ]
        }
        
        return modal
    
    def _build_task_status_blocks(
        self,
        task: Dict[str, Any],
        project: Dict[str, Any],
        assignee: Optional[Dict],
        task_url: str
    ) -> List[Dict]:
        """Build Slack blocks for task status display"""
        status_emoji = {
            "todo": "⚪",
            "in_progress": "🔵",
            "blocked": "🔴",
            "pending_approval": "🟡",
            "done": "✅"
        }
        
        priority_emoji = {
            "low": "🟢",
            "medium": "🟡",
            "high": "🟠",
            "urgent": "🔴"
        }
        
        status = task.get("status", "todo")
        priority = task.get("priority", "medium")
        
        blocks = [
            {
                "type": "header",
                "text": {
                    "type": "plain_text",
                    "text": f"📋 TM-{task.get('id', '')[:8]}",
                    "emoji": True
                }
            },
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": f"*<{task_url}|{task.get('title', 'Untitled')}>*"
                }
            },
            {
                "type": "section",
                "fields": [
                    {
                        "type": "mrkdwn",
                        "text": f"*Status:*\n{status_emoji.get(status, '⚪')} {status.replace('_', ' ').title()}"
                    },
                    {
                        "type": "mrkdwn",
                        "text": f"*Priority:*\n{priority_emoji.get(priority, '🟡')} {priority.title()}"
                    },
                    {
                        "type": "mrkdwn",
                        "text": f"*Assignee:*\n{assignee.get('name', 'Unassigned') if assignee else 'Unassigned'}"
                    },
                    {
                        "type": "mrkdwn",
                        "text": f"*Project:*\n{project.get('name', 'Unknown') if project else 'Unknown'}"
                    }
                ]
            }
        ]
        
        # Add due date if present
        if task.get("due_date"):
            due_date = task["due_date"]
            if isinstance(due_date, str):
                due_str = due_date.split("T")[0]
            else:
                due_str = due_date.strftime("%Y-%m-%d")
            
            blocks.append({
                "type": "context",
                "elements": [
                    {
                        "type": "mrkdwn",
                        "text": f"📅 Due: {due_str}"
                    }
                ]
            })
        
        # Add quick action buttons
        blocks.append({
            "type": "actions",
            "elements": [
                {
                    "type": "button",
                    "text": {"type": "plain_text", "text": "View in App"},
                    "url": task_url,
                    "action_id": "view_task"
                },
                {
                    "type": "static_select",
                    "placeholder": {"type": "plain_text", "text": "Change Status"},
                    "action_id": f"change_status_{task.get('id')}",
                    "options": [
                        {"text": {"type": "plain_text", "text": "⚪ To Do"}, "value": "todo"},
                        {"text": {"type": "plain_text", "text": "🔵 In Progress"}, "value": "in_progress"},
                        {"text": {"type": "plain_text", "text": "✅ Done"}, "value": "done"}
                    ]
                }
            ]
        })
        
        return blocks
    
    def _build_my_tasks_blocks(
        self,
        tasks: List[Dict],
        project_map: Dict[str, str],
        page: int,
        total_count: int
    ) -> List[Dict]:
        """Build Slack blocks for my tasks list"""
        priority_emoji = {
            "low": "🟢",
            "medium": "🟡",
            "high": "🟠",
            "urgent": "🔴"
        }
        
        status_emoji = {
            "todo": "⚪",
            "in_progress": "🔵",
            "blocked": "🔴",
            "pending_approval": "🟡"
        }
        
        blocks = [
            {
                "type": "header",
                "text": {
                    "type": "plain_text",
                    "text": "📋 Your Open Tasks",
                    "emoji": True
                }
            },
            {
                "type": "context",
                "elements": [
                    {
                        "type": "mrkdwn",
                        "text": f"Showing {page * self.TASKS_PER_PAGE + 1}-{min((page + 1) * self.TASKS_PER_PAGE, total_count)} of {total_count} tasks"
                    }
                ]
            },
            {"type": "divider"}
        ]
        
        for task in tasks:
            task_url = self.get_task_url(task.get("project_id"), task.get("id"))
            priority = task.get("priority", "medium")
            status = task.get("status", "todo")
            project_name = project_map.get(task.get("project_id"), "Unknown")
            
            task_block = {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": f"{priority_emoji.get(priority, '🟡')} *<{task_url}|{task.get('title', 'Untitled')}>*\n{status_emoji.get(status, '⚪')} {status.replace('_', ' ').title()} • {project_name}"
                },
                "accessory": {
                    "type": "button",
                    "text": {"type": "plain_text", "text": "View"},
                    "url": task_url,
                    "action_id": f"view_task_{task.get('id')}"
                }
            }
            
            # Add due date if present and overdue
            if task.get("due_date"):
                due_date = task["due_date"]
                if isinstance(due_date, str):
                    due_dt = datetime.fromisoformat(due_date.replace("Z", "+00:00"))
                else:
                    due_dt = due_date
                
                if due_dt < datetime.now(timezone.utc):
                    task_block["text"]["text"] += " • ⏰ *Overdue*"
            
            blocks.append(task_block)
        
        # Add pagination buttons
        pagination_elements = []
        
        if page > 0:
            pagination_elements.append({
                "type": "button",
                "text": {"type": "plain_text", "text": "← Previous"},
                "action_id": f"my_tasks_page_{page - 1}"
            })
        
        if (page + 1) * self.TASKS_PER_PAGE < total_count:
            pagination_elements.append({
                "type": "button",
                "text": {"type": "plain_text", "text": "Next →"},
                "action_id": f"my_tasks_page_{page + 1}"
            })
        
        if pagination_elements:
            blocks.append({"type": "divider"})
            blocks.append({
                "type": "actions",
                "elements": pagination_elements
            })
        
        return blocks
    
    # =========================================================================
    # INTERACTIVE COMPONENT HANDLERS
    # =========================================================================
    
    async def handle_modal_submission(
        self,
        callback_id: str,
        values: Dict[str, Any],
        slack_user_id: str,
        private_metadata: str
    ) -> Dict[str, Any]:
        """Handle modal form submission"""
        if callback_id == "create_task_modal":
            return await self._handle_create_task_submission(values, slack_user_id, private_metadata)
        
        return {"response_action": "clear"}
    
    async def _handle_create_task_submission(
        self,
        values: Dict[str, Any],
        slack_user_id: str,
        private_metadata: str
    ) -> Dict[str, Any]:
        """Handle task creation modal submission"""
        try:
            metadata = json.loads(private_metadata)
            tenant_id = metadata.get("tenant_id")
        except json.JSONDecodeError:
            return {
                "response_action": "errors",
                "errors": {"title_block": "Internal error - invalid metadata"}
            }
        
        # Find user
        user = await self.find_user_by_slack_id(slack_user_id, tenant_id)
        if not user:
            return {
                "response_action": "errors",
                "errors": {"title_block": "Your Slack account is not linked to Task Manager"}
            }
        
        # Extract form values
        project_id = values.get("project_block", {}).get("project_select", {}).get("selected_option", {}).get("value")
        title = values.get("title_block", {}).get("title_input", {}).get("value", "").strip()
        description = values.get("description_block", {}).get("description_input", {}).get("value", "")
        priority = values.get("priority_block", {}).get("priority_select", {}).get("selected_option", {}).get("value", "medium")
        assignee_id = values.get("assignee_block", {}).get("assignee_select", {}).get("selected_option", {}).get("value")
        due_date_str = values.get("due_date_block", {}).get("due_date_select", {}).get("selected_date")
        
        # Validate
        if not project_id:
            return {
                "response_action": "errors",
                "errors": {"project_block": "Please select a project"}
            }
        
        if not title:
            return {
                "response_action": "errors",
                "errors": {"title_block": "Title is required"}
            }
        
        # Create task
        now = datetime.now(timezone.utc)
        task_id = str(uuid.uuid4())
        
        task_data = {
            "id": task_id,
            "tenant_id": tenant_id,
            "project_id": project_id,
            "title": title,
            "description": description,
            "status": "todo",
            "priority": priority,
            "task_type": "other",
            "assignee_id": assignee_id,
            "due_date": datetime.strptime(due_date_str, "%Y-%m-%d") if due_date_str else None,
            "created_by": user.get("id"),
            "created_at": now,
            "updated_at": now,
            "is_active": True,
            "subtask_count": 0,
            "completed_subtask_count": 0,
            "checklist_count": 0,
            "completed_checklist_count": 0,
            "is_blocked": False,
            "order_index": 0,
            "created_via": "slack"
        }
        
        await self.db.tm_tasks.insert_one(task_data)
        
        # Log activity
        await self.log_slack_action(
            tenant_id=tenant_id,
            task_id=task_id,
            action_type="task_created",
            description=f"Task created via Slack by {user.get('name', 'Unknown')}",
            slack_user_id=slack_user_id,
            user_id=user.get("id")
        )
        
        # Get project name for confirmation
        project = await self.db.tm_projects.find_one(
            {"id": project_id},
            {"_id": 0, "name": 1}
        )
        
        task_url = self.get_task_url(project_id, task_id)
        
        # Send confirmation message
        try:
            self.slack.client.chat_postMessage(
                channel=slack_user_id,
                text=f"✅ Task created: {title}",
                blocks=[
                    {
                        "type": "section",
                        "text": {
                            "type": "mrkdwn",
                            "text": f"✅ *Task Created Successfully!*\n\n*<{task_url}|{title}>*\n📁 {project.get('name', 'Unknown')} • {priority.title()} priority"
                        }
                    },
                    {
                        "type": "actions",
                        "elements": [
                            {
                                "type": "button",
                                "text": {"type": "plain_text", "text": "Open Task"},
                                "url": task_url,
                                "style": "primary",
                                "action_id": "view_created_task"
                            }
                        ]
                    }
                ]
            )
        except SlackApiError as e:
            logger.error(f"Failed to send confirmation: {e}")
        
        return {"response_action": "clear"}
    
    async def handle_interactive_action(
        self,
        action_id: str,
        action_value: str,
        slack_user_id: str,
        tenant_id: str,
        response_url: str
    ) -> Optional[Dict[str, Any]]:
        """Handle interactive button/select actions"""
        # Handle status change
        if action_id.startswith("change_status_"):
            task_id = action_id.replace("change_status_", "")
            return await self._handle_status_change(task_id, action_value, slack_user_id, tenant_id)
        
        # Handle pagination for my tasks
        if action_id.startswith("my_tasks_page_"):
            page = int(action_id.replace("my_tasks_page_", ""))
            user = await self.find_user_by_slack_id(slack_user_id, tenant_id)
            return await self._handle_my_tasks_command(user, tenant_id, page)
        
        return None
    
    async def _handle_status_change(
        self,
        task_id: str,
        new_status: str,
        slack_user_id: str,
        tenant_id: str
    ) -> Dict[str, Any]:
        """Handle quick status change from Slack"""
        # Find user
        user = await self.find_user_by_slack_id(slack_user_id, tenant_id)
        if not user:
            return {
                "response_type": "ephemeral",
                "replace_original": False,
                "text": "❌ Your Slack account is not linked to Task Manager"
            }
        
        # Find task
        task = await self.db.tm_tasks.find_one(
            {"id": task_id, "tenant_id": tenant_id, "is_active": True},
            {"_id": 0}
        )
        
        if not task:
            return {
                "response_type": "ephemeral",
                "replace_original": False,
                "text": "❌ Task not found"
            }
        
        # Check permissions
        can_modify, error_msg = await self.check_task_permissions(task, user, "status_change")
        if not can_modify:
            return {
                "response_type": "ephemeral",
                "replace_original": False,
                "text": f"❌ {error_msg}"
            }
        
        old_status = task.get("status")
        
        # Update task
        await self.db.tm_tasks.update_one(
            {"id": task_id},
            {
                "$set": {
                    "status": new_status,
                    "updated_at": datetime.now(timezone.utc),
                    "updated_by": user.get("id")
                }
            }
        )
        
        # Log activity
        await self.log_slack_action(
            tenant_id=tenant_id,
            task_id=task_id,
            action_type="status_changed",
            description=f"Status changed from {old_status} to {new_status} via Slack",
            slack_user_id=slack_user_id,
            user_id=user.get("id"),
            details={"old_status": old_status, "new_status": new_status}
        )
        
        status_emoji = {
            "todo": "⚪",
            "in_progress": "🔵",
            "done": "✅"
        }
        
        return {
            "response_type": "ephemeral",
            "replace_original": False,
            "text": f"{status_emoji.get(new_status, '📋')} Task *{task.get('title')}* status changed to *{new_status.replace('_', ' ').title()}*"
        }
