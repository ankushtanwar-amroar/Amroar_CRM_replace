"""
Slack Integration Service for Task Manager
Handles OAuth, webhooks, and notification sending
"""
import os
import hmac
import hashlib
import time
import logging
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List
from slack_sdk import WebClient
from slack_sdk.errors import SlackApiError

logger = logging.getLogger(__name__)


class SlackService:
    """Service for Slack integration operations"""
    
    def __init__(self, db):
        self.db = db
        self.bot_token = os.environ.get("SLACK_BOT_TOKEN")
        self.signing_secret = os.environ.get("SLACK_SIGNING_SECRET")
        self._client = None
    
    @property
    def client(self) -> Optional[WebClient]:
        """Lazy-loaded Slack client"""
        if self._client is None and self.bot_token:
            self._client = WebClient(token=self.bot_token)
        return self._client
    
    @property
    def is_configured(self) -> bool:
        """Check if Slack is properly configured"""
        return bool(self.bot_token and self.signing_secret)
    
    def verify_signature(self, timestamp: str, body: bytes, signature: str) -> bool:
        """Verify Slack request signature"""
        if not self.signing_secret:
            return False
        
        # Check timestamp is provided and valid
        if not timestamp:
            return False
        
        try:
            # Check timestamp freshness (5 minutes)
            if abs(time.time() - int(timestamp)) > 60 * 5:
                return False
        except (ValueError, TypeError):
            return False
        
        sig_basestring = f"v0:{timestamp}:{body.decode()}".encode()
        computed_signature = "v0=" + hmac.new(
            self.signing_secret.encode(),
            sig_basestring,
            hashlib.sha256
        ).hexdigest()
        
        return hmac.compare_digest(computed_signature, signature)
    
    async def test_connection(self) -> Dict[str, Any]:
        """Test Slack connection and return status"""
        if not self.is_configured:
            return {"status": "not_configured", "message": "Slack credentials not set"}
        
        try:
            auth_test = self.client.auth_test()
            return {
                "status": "connected",
                "bot_user_id": auth_test["user_id"],
                "team": auth_test["team"],
                "team_id": auth_test["team_id"]
            }
        except SlackApiError as e:
            logger.error(f"Slack connection test failed: {e}")
            return {"status": "error", "message": str(e)}
    
    async def get_workspace_users(self) -> List[Dict[str, Any]]:
        """Get list of users from connected workspace"""
        if not self.client:
            return []
        
        try:
            users = self.client.users_list()
            slack_users = []
            for user in users.get("members", []):
                if not user.get("deleted") and not user.get("is_bot"):
                    slack_users.append({
                        "id": user["id"],
                        "name": user.get("name", ""),
                        "real_name": user.get("real_name", ""),
                        "email": user.get("profile", {}).get("email", ""),
                        "avatar": user.get("profile", {}).get("image_72", "")
                    })
            return slack_users
        except SlackApiError as e:
            logger.error(f"Failed to get Slack users: {e}")
            return []
    
    async def get_channels(self) -> List[Dict[str, Any]]:
        """Get list of public channels the bot can access"""
        if not self.client:
            return []
        
        try:
            result = self.client.conversations_list(
                types="public_channel,private_channel",
                exclude_archived=True
            )
            channels = []
            for channel in result.get("channels", []):
                channels.append({
                    "id": channel["id"],
                    "name": channel["name"],
                    "is_private": channel.get("is_private", False),
                    "is_member": channel.get("is_member", False)
                })
            return channels
        except SlackApiError as e:
            logger.error(f"Failed to get Slack channels: {e}")
            return []
    
    async def send_message(
        self,
        channel: str,
        text: str,
        blocks: Optional[List[Dict]] = None,
        thread_ts: Optional[str] = None
    ) -> bool:
        """Send a message to a Slack channel or DM"""
        if not self.client:
            logger.warning("Slack client not configured, skipping message")
            return False
        
        try:
            self.client.chat_postMessage(
                channel=channel,
                text=text,
                blocks=blocks,
                thread_ts=thread_ts
            )
            return True
        except SlackApiError as e:
            logger.error(f"Failed to send Slack message: {e}")
            return False
    
    async def send_dm(self, user_id: str, text: str, blocks: Optional[List[Dict]] = None) -> bool:
        """Send a direct message to a user"""
        if not self.client:
            return False
        
        try:
            # Open DM channel
            result = self.client.conversations_open(users=[user_id])
            channel_id = result["channel"]["id"]
            
            # Send message
            return await self.send_message(channel_id, text, blocks)
        except SlackApiError as e:
            logger.error(f"Failed to send Slack DM: {e}")
            return False
    
    def build_task_notification_blocks(
        self,
        event_type: str,
        task: Dict[str, Any],
        project: Dict[str, Any],
        task_url: str,
        extra_info: Optional[str] = None
    ) -> List[Dict]:
        """Build Slack Block Kit message for task notifications"""
        
        # Event type emoji mapping
        emoji_map = {
            "task_assigned": "📋",
            "mentioned": "💬",
            "urgent": "🚨",
            "overdue": "⏰",
            "dependency_unblocked": "🔓"
        }
        
        # Event type title mapping
        title_map = {
            "task_assigned": "Task Assigned to You",
            "mentioned": "You were mentioned",
            "urgent": "Task Marked Urgent",
            "overdue": "Task Overdue",
            "dependency_unblocked": "Task Unblocked"
        }
        
        emoji = emoji_map.get(event_type, "📝")
        title = title_map.get(event_type, "Task Update")
        
        # Status color mapping
        status_colors = {
            "todo": "#6B7280",
            "in_progress": "#3B82F6",
            "blocked": "#EF4444",
            "done": "#10B981"
        }
        
        priority_colors = {
            "low": "#6B7280",
            "medium": "#3B82F6",
            "high": "#F59E0B",
            "urgent": "#EF4444"
        }
        
        status = task.get("status", "todo")
        priority = task.get("priority", "medium")
        
        blocks = [
            {
                "type": "header",
                "text": {
                    "type": "plain_text",
                    "text": f"{emoji} {title}",
                    "emoji": True
                }
            },
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": f"*<{task_url}|{task.get('title', 'Untitled Task')}>*"
                }
            },
            {
                "type": "context",
                "elements": [
                    {
                        "type": "mrkdwn",
                        "text": f"📁 *Project:* {project.get('name', 'Unknown')}"
                    },
                    {
                        "type": "mrkdwn",
                        "text": f"📊 *Status:* {status.replace('_', ' ').title()}"
                    },
                    {
                        "type": "mrkdwn",
                        "text": f"🏷️ *Priority:* {priority.title()}"
                    }
                ]
            }
        ]
        
        # Add extra info if provided
        if extra_info:
            blocks.append({
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": extra_info
                }
            })
        
        # Add action button
        blocks.append({
            "type": "actions",
            "elements": [
                {
                    "type": "button",
                    "text": {
                        "type": "plain_text",
                        "text": "View Task",
                        "emoji": True
                    },
                    "url": task_url,
                    "action_id": "view_task"
                }
            ]
        })
        
        return blocks


class SlackNotificationService:
    """Service for sending task-related Slack notifications"""
    
    def __init__(self, db, slack_service: SlackService):
        self.db = db
        self.slack = slack_service
        self.frontend_url = os.environ.get("BACKEND_URL", "").replace("/api", "")
    
    async def get_user_slack_settings(self, user_id: str, tenant_id: str) -> Optional[Dict]:
        """Get user's Slack notification settings"""
        settings = await self.db.tm_slack_user_settings.find_one(
            {"user_id": user_id, "tenant_id": tenant_id},
            {"_id": 0}
        )
        return settings
    
    async def get_tenant_slack_config(self, tenant_id: str) -> Optional[Dict]:
        """Get tenant's Slack workspace configuration"""
        config = await self.db.tm_slack_config.find_one(
            {"tenant_id": tenant_id, "is_active": True},
            {"_id": 0}
        )
        return config
    
    def get_task_url(self, project_id: str, task_id: str) -> str:
        """Generate URL to task in the app"""
        return f"{self.frontend_url}/task-manager/projects/{project_id}?task={task_id}"
    
    async def should_notify(
        self,
        user_id: str,
        tenant_id: str,
        notification_type: str
    ) -> tuple[bool, Optional[str]]:
        """Check if user should receive Slack notification and return channel/DM target"""
        # Check if Slack is configured for tenant
        config = await self.get_tenant_slack_config(tenant_id)
        if not config or not config.get("is_enabled"):
            return False, None
        
        # Check user's Slack settings
        user_settings = await self.get_user_slack_settings(user_id, tenant_id)
        if not user_settings:
            return False, None
        
        # Check if user has Slack enabled
        if not user_settings.get("slack_enabled", False):
            return False, None
        
        # Check notification type preference
        pref_key = f"notify_{notification_type}"
        if not user_settings.get(pref_key, True):
            return False, None
        
        # Determine target (DM or channel)
        slack_user_id = user_settings.get("slack_user_id")
        if slack_user_id:
            return True, slack_user_id
        
        # Fall back to default channel
        default_channel = config.get("default_channel")
        if default_channel:
            return True, default_channel
        
        return False, None
    
    async def notify_task_assigned(
        self,
        assignee_user_id: str,
        tenant_id: str,
        task: Dict,
        project: Dict,
        assigner_name: str
    ):
        """Send notification when task is assigned"""
        should_send, target = await self.should_notify(
            assignee_user_id, tenant_id, "task_assigned"
        )
        
        if not should_send or not target:
            return
        
        task_url = self.get_task_url(project.get("id", ""), task.get("id", ""))
        blocks = self.slack.build_task_notification_blocks(
            "task_assigned",
            task,
            project,
            task_url,
            f"Assigned by {assigner_name}"
        )
        
        text = f"📋 Task assigned: {task.get('title', 'Untitled')}"
        
        # Try DM first, then channel
        if target.startswith("U"):
            await self.slack.send_dm(target, text, blocks)
        else:
            await self.slack.send_message(target, text, blocks)
    
    async def notify_mentioned(
        self,
        mentioned_user_id: str,
        tenant_id: str,
        task: Dict,
        project: Dict,
        commenter_name: str,
        comment_text: str
    ):
        """Send notification when user is @mentioned in a comment"""
        should_send, target = await self.should_notify(
            mentioned_user_id, tenant_id, "mentioned"
        )
        
        if not should_send or not target:
            return
        
        task_url = self.get_task_url(project.get("id", ""), task.get("id", ""))
        
        # Truncate comment if too long
        preview = comment_text[:100] + "..." if len(comment_text) > 100 else comment_text
        
        blocks = self.slack.build_task_notification_blocks(
            "mentioned",
            task,
            project,
            task_url,
            f"💬 *{commenter_name}:* _{preview}_"
        )
        
        text = f"💬 {commenter_name} mentioned you in: {task.get('title', 'Untitled')}"
        
        if target.startswith("U"):
            await self.slack.send_dm(target, text, blocks)
        else:
            await self.slack.send_message(target, text, blocks)
    
    async def notify_urgent(
        self,
        assignee_user_id: str,
        tenant_id: str,
        task: Dict,
        project: Dict,
        updater_name: str
    ):
        """Send notification when task is marked urgent"""
        should_send, target = await self.should_notify(
            assignee_user_id, tenant_id, "urgent"
        )
        
        if not should_send or not target:
            return
        
        task_url = self.get_task_url(project.get("id", ""), task.get("id", ""))
        blocks = self.slack.build_task_notification_blocks(
            "urgent",
            task,
            project,
            task_url,
            f"Marked urgent by {updater_name}"
        )
        
        text = f"🚨 URGENT: {task.get('title', 'Untitled')}"
        
        if target.startswith("U"):
            await self.slack.send_dm(target, text, blocks)
        else:
            await self.slack.send_message(target, text, blocks)
    
    async def notify_overdue(
        self,
        assignee_user_id: str,
        tenant_id: str,
        task: Dict,
        project: Dict
    ):
        """Send notification when task becomes overdue"""
        should_send, target = await self.should_notify(
            assignee_user_id, tenant_id, "overdue"
        )
        
        if not should_send or not target:
            return
        
        task_url = self.get_task_url(project.get("id", ""), task.get("id", ""))
        due_date = task.get("due_date")
        if due_date:
            if isinstance(due_date, str):
                due_str = due_date.split("T")[0]
            else:
                due_str = due_date.strftime("%Y-%m-%d")
        else:
            due_str = "Unknown"
        
        blocks = self.slack.build_task_notification_blocks(
            "overdue",
            task,
            project,
            task_url,
            f"Due date was: {due_str}"
        )
        
        text = f"⏰ Overdue: {task.get('title', 'Untitled')}"
        
        if target.startswith("U"):
            await self.slack.send_dm(target, text, blocks)
        else:
            await self.slack.send_message(target, text, blocks)
    
    async def notify_dependency_unblocked(
        self,
        assignee_user_id: str,
        tenant_id: str,
        task: Dict,
        project: Dict,
        blocker_task_title: str
    ):
        """Send notification when a blocking task is completed"""
        should_send, target = await self.should_notify(
            assignee_user_id, tenant_id, "dependency_unblocked"
        )
        
        if not should_send or not target:
            return
        
        task_url = self.get_task_url(project.get("id", ""), task.get("id", ""))
        blocks = self.slack.build_task_notification_blocks(
            "dependency_unblocked",
            task,
            project,
            task_url,
            f"Blocker completed: _{blocker_task_title}_"
        )
        
        text = f"🔓 Task unblocked: {task.get('title', 'Untitled')}"
        
        if target.startswith("U"):
            await self.slack.send_dm(target, text, blocks)
        else:
            await self.slack.send_message(target, text, blocks)
