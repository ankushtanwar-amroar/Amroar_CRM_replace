"""
Task Manager Integrations API Router
Handles Slack, GitHub, and other external integrations
"""
from fastapi import APIRouter, HTTPException, Depends, Request, Query, Response
from typing import Optional, Dict, Any, List
from datetime import datetime, timezone
from pydantic import BaseModel
import uuid
import json
import logging

from motor.motor_asyncio import AsyncIOMotorClient
import os

from server import get_current_user
from shared.models import User

from ..services.slack_service import SlackService, SlackNotificationService
from ..services.github_service import GitHubService, GitHubWebhookHandler
from ..services.reporting_service import ReportingService

logger = logging.getLogger(__name__)

# Database connection
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "crm_platform")
client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

# Initialize services
slack_service = SlackService(db)
slack_notifications = SlackNotificationService(db, slack_service)
github_service = GitHubService(db)
github_handler = GitHubWebhookHandler(github_service)
reporting_service = ReportingService(db)

# Create router
integrations_router = APIRouter(prefix="/api/task-manager", tags=["task-manager-integrations"])


# ============================================================================
# SLACK INTEGRATION ENDPOINTS
# ============================================================================

class SlackConfigUpdate(BaseModel):
    is_enabled: bool
    default_channel: Optional[str] = None
    bot_token: Optional[str] = None
    signing_secret: Optional[str] = None


class SlackUserSettings(BaseModel):
    slack_enabled: bool
    slack_user_id: Optional[str] = None
    notify_task_assigned: bool = True
    notify_mentioned: bool = True
    notify_urgent: bool = True
    notify_overdue: bool = True
    notify_dependency_unblocked: bool = True


@integrations_router.get("/integrations/slack/status")
async def get_slack_status(
    current_user: User = Depends(get_current_user)
):
    """Get Slack integration status and connection info"""
    config = await db.tm_slack_config.find_one(
        {"tenant_id": current_user.tenant_id},
        {"_id": 0}
    )
    
    connection_status = await slack_service.test_connection()
    
    return {
        "configured": slack_service.is_configured,
        "connection": connection_status,
        "config": {
            "is_enabled": config.get("is_enabled", False) if config else False,
            "default_channel": config.get("default_channel") if config else None,
            "workspace_name": connection_status.get("team") if connection_status.get("status") == "connected" else None
        }
    }


@integrations_router.put("/integrations/slack/config")
async def update_slack_config(
    config: SlackConfigUpdate,
    current_user: User = Depends(get_current_user)
):
    """Update Slack integration configuration"""
    now = datetime.now(timezone.utc)
    
    # Get team_id from Slack connection
    connection = await slack_service.test_connection()
    team_id = connection.get("team_id") if connection.get("status") == "connected" else None
    
    update_data = {
        "tenant_id": current_user.tenant_id,
        "is_enabled": config.is_enabled,
        "is_active": True,
        "updated_at": now,
        "updated_by": current_user.id
    }
    
    if team_id:
        update_data["team_id"] = team_id
    
    if config.default_channel:
        update_data["default_channel"] = config.default_channel
    
    await db.tm_slack_config.update_one(
        {"tenant_id": current_user.tenant_id},
        {"$set": update_data},
        upsert=True
    )
    
    return {"success": True, "message": "Slack configuration updated"}



@integrations_router.get("/integrations/slack/users")
async def get_slack_workspace_users(
    current_user: User = Depends(get_current_user)
):
    """Get list of users from connected Slack workspace"""
    users = await slack_service.get_workspace_users()
    return {"users": users}


@integrations_router.get("/integrations/slack/channels")
async def get_slack_channels(
    current_user: User = Depends(get_current_user)
):
    """Get list of channels from connected Slack workspace"""
    channels = await slack_service.get_channels()
    return {"channels": channels}


@integrations_router.get("/integrations/slack/user-settings")
async def get_slack_user_settings(
    current_user: User = Depends(get_current_user)
):
    """Get current user's Slack notification settings"""
    settings = await slack_notifications.get_user_slack_settings(
        current_user.id, current_user.tenant_id
    )
    
    if not settings:
        # Return defaults
        return {
            "slack_enabled": False,
            "slack_user_id": None,
            "notify_task_assigned": True,
            "notify_mentioned": True,
            "notify_urgent": True,
            "notify_overdue": True,
            "notify_dependency_unblocked": True
        }
    
    return settings


@integrations_router.put("/integrations/slack/user-settings")
async def update_slack_user_settings(
    settings: SlackUserSettings,
    current_user: User = Depends(get_current_user)
):
    """Update current user's Slack notification settings"""
    now = datetime.now(timezone.utc)
    
    settings_data = {
        "user_id": current_user.id,
        "tenant_id": current_user.tenant_id,
        **settings.dict(),
        "updated_at": now
    }
    
    await db.tm_slack_user_settings.update_one(
        {"user_id": current_user.id, "tenant_id": current_user.tenant_id},
        {"$set": settings_data},
        upsert=True
    )
    
    return {"success": True, "message": "Slack settings updated"}


@integrations_router.post("/integrations/slack/test-notification")
async def send_test_slack_notification(
    current_user: User = Depends(get_current_user)
):
    """Send a test notification to verify Slack setup"""
    user_settings = await slack_notifications.get_user_slack_settings(
        current_user.id, current_user.tenant_id
    )
    
    if not user_settings or not user_settings.get("slack_enabled"):
        raise HTTPException(status_code=400, detail="Slack notifications not enabled for user")
    
    slack_user_id = user_settings.get("slack_user_id")
    if not slack_user_id:
        raise HTTPException(status_code=400, detail="No Slack user ID configured")
    
    # Send test message
    success = await slack_service.send_dm(
        slack_user_id,
        "🎉 *Test Notification*\n\nThis is a test notification from Task Manager. If you see this, your Slack integration is working correctly!"
    )
    
    if success:
        return {"success": True, "message": "Test notification sent"}
    else:
        raise HTTPException(status_code=500, detail="Failed to send test notification")


# ============================================================================
# PHASE 13: SLACK SLASH COMMANDS & INTERACTIVE MODALS
# ============================================================================

from ..services.slack_commands_service import SlackCommandsService
from urllib.parse import parse_qs

# Initialize commands service
slack_commands_service = SlackCommandsService(db, slack_service)

# Feature flag
FEATURE_SLACK_COMMANDS_ENABLED = os.environ.get("FEATURE_SLACK_COMMANDS", "true").lower() == "true"


def check_slack_commands_enabled():
    """Check if Slack commands feature is enabled"""
    if not FEATURE_SLACK_COMMANDS_ENABLED:
        raise HTTPException(status_code=403, detail="Slack commands feature is disabled")


class SlackCommandsConfig(BaseModel):
    slash_commands_enabled: bool = True
    interactive_components_enabled: bool = True


@integrations_router.get("/integrations/slack/commands/config")
async def get_slack_commands_config(
    current_user: User = Depends(get_current_user)
):
    """Get Slack slash commands configuration"""
    check_slack_commands_enabled()
    
    config = await slack_commands_service.get_slack_commands_config(current_user.tenant_id)
    return {
        "config": config,
        "feature_enabled": FEATURE_SLACK_COMMANDS_ENABLED
    }


@integrations_router.put("/integrations/slack/commands/config")
async def update_slack_commands_config(
    config: SlackCommandsConfig,
    current_user: User = Depends(get_current_user)
):
    """Update Slack slash commands configuration"""
    check_slack_commands_enabled()
    
    updated = await slack_commands_service.save_slack_commands_config(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        config_data=config.dict()
    )
    
    return {"success": True, "config": updated}


@integrations_router.post("/integrations/slack/slash-command")
async def handle_slack_slash_command(request: Request):
    """
    Handle incoming Slack slash command (/task)
    This endpoint receives POST requests from Slack when users use /task command
    """
    # Get raw body for signature verification
    body = await request.body()
    
    # Verify Slack signature
    timestamp = request.headers.get("X-Slack-Request-Timestamp", "")
    signature = request.headers.get("X-Slack-Signature", "")
    
    if slack_service.signing_secret:
        if not slack_service.verify_signature(timestamp, body, signature):
            raise HTTPException(status_code=403, detail="Invalid Slack signature")
    
    # Parse form data
    try:
        form_data = parse_qs(body.decode())
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid form data")
    
    # Extract command info
    # command = form_data.get("command", [""])[0]  # Available if needed
    text = form_data.get("text", [""])[0]
    user_id = form_data.get("user_id", [""])[0]
    team_id = form_data.get("team_id", [""])[0]
    trigger_id = form_data.get("trigger_id", [""])[0]
    response_url = form_data.get("response_url", [""])[0]
    
    # Find tenant by team_id
    slack_config = await db.tm_slack_config.find_one(
        {"team_id": team_id, "is_active": True}
    )
    
    if not slack_config:
        # Try to get tenant from connection test
        connection = await slack_service.test_connection()
        if connection.get("team_id") == team_id:
            # Get any active tenant with Slack enabled
            slack_config = await db.tm_slack_config.find_one({"is_active": True, "is_enabled": True})
    
    if not slack_config:
        return {
            "response_type": "ephemeral",
            "text": "❌ Slack integration is not configured. Please set up Slack in Task Manager → Integrations."
        }
    
    tenant_id = slack_config.get("tenant_id")
    
    # Check if commands are enabled
    commands_config = await slack_commands_service.get_slack_commands_config(tenant_id)
    if not commands_config.get("slash_commands_enabled", True):
        return {
            "response_type": "ephemeral",
            "text": "❌ Slash commands are disabled for this workspace."
        }
    
    # Handle the command
    response = await slack_commands_service.handle_task_command(
        command_text=text,
        slack_user_id=user_id,
        tenant_id=tenant_id,
        trigger_id=trigger_id,
        response_url=response_url
    )
    
    # If None, modal was opened - return empty 200
    if response is None:
        return Response(status_code=200)
    
    return response


@integrations_router.post("/integrations/slack/interactive")
async def handle_slack_interactive(request: Request):
    """
    Handle Slack interactive components (modals, buttons, selects)
    This endpoint receives POST requests when users interact with Slack UI elements
    """
    # Get raw body for signature verification
    body = await request.body()
    
    # Verify Slack signature
    timestamp = request.headers.get("X-Slack-Request-Timestamp", "")
    signature = request.headers.get("X-Slack-Signature", "")
    
    if slack_service.signing_secret:
        if not slack_service.verify_signature(timestamp, body, signature):
            raise HTTPException(status_code=403, detail="Invalid Slack signature")
    
    # Parse payload
    try:
        form_data = parse_qs(body.decode())
        payload_str = form_data.get("payload", ["{}"])[0]
        payload = json.loads(payload_str)
    except (json.JSONDecodeError, Exception) as e:
        logger.error(f"Failed to parse Slack interactive payload: {e}")
        raise HTTPException(status_code=400, detail="Invalid payload")
    
    interaction_type = payload.get("type")
    user = payload.get("user", {})
    slack_user_id = user.get("id", "")
    team_id = payload.get("team", {}).get("id", "")
    
    # Find tenant
    slack_config = await db.tm_slack_config.find_one(
        {"team_id": team_id, "is_active": True}
    )
    
    if not slack_config:
        slack_config = await db.tm_slack_config.find_one({"is_active": True, "is_enabled": True})
    
    if not slack_config:
        return {"response_action": "clear"}
    
    tenant_id = slack_config.get("tenant_id")
    
    # Check if interactive components are enabled
    commands_config = await slack_commands_service.get_slack_commands_config(tenant_id)
    if not commands_config.get("interactive_components_enabled", True):
        return {
            "response_type": "ephemeral",
            "text": "❌ Interactive components are disabled for this workspace."
        }
    
    # Handle view submission (modal submit)
    if interaction_type == "view_submission":
        view = payload.get("view", {})
        callback_id = view.get("callback_id", "")
        values = view.get("state", {}).get("values", {})
        private_metadata = view.get("private_metadata", "{}")
        
        response = await slack_commands_service.handle_modal_submission(
            callback_id=callback_id,
            values=values,
            slack_user_id=slack_user_id,
            private_metadata=private_metadata
        )
        
        return response
    
    # Handle block actions (buttons, selects)
    elif interaction_type == "block_actions":
        actions = payload.get("actions", [])
        response_url = payload.get("response_url", "")
        
        for action in actions:
            action_id = action.get("action_id", "")
            action_value = action.get("selected_option", {}).get("value") or action.get("value", "")
            
            # Skip view_task buttons (they use URL)
            if action_id.startswith("view_task"):
                continue
            
            response = await slack_commands_service.handle_interactive_action(
                action_id=action_id,
                action_value=action_value,
                slack_user_id=slack_user_id,
                tenant_id=tenant_id,
                response_url=response_url
            )
            
            if response:
                return response
        
        return Response(status_code=200)
    
    return Response(status_code=200)


@integrations_router.get("/integrations/slack/commands/activity")
async def get_slack_commands_activity(
    limit: int = Query(default=50, le=200),
    current_user: User = Depends(get_current_user)
):
    """Get recent Slack command activity logs"""
    check_slack_commands_enabled()
    
    logs = await db.tm_activity_logs.find(
        {
            "tenant_id": current_user.tenant_id,
            "source": "slack"
        },
        {"_id": 0}
    ).sort("created_at", -1).to_list(limit)
    
    return {"activity": logs}


# ============================================================================
# GITHUB INTEGRATION ENDPOINTS
# ============================================================================

class GitHubConfigCreate(BaseModel):
    project_id: str
    repository_url: str
    auto_complete_on_merge: bool = False


class GitHubConfigUpdate(BaseModel):
    auto_complete_on_merge: Optional[bool] = None
    is_active: Optional[bool] = None


@integrations_router.get("/integrations/github/config")
async def list_github_configs(
    project_id: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """List GitHub configurations"""
    query = {"tenant_id": current_user.tenant_id, "is_active": True}
    if project_id:
        query["project_id"] = project_id
    
    configs = await db.tm_github_config.find(query, {"_id": 0}).to_list(100)
    return {"configs": configs}


@integrations_router.post("/integrations/github/config")
async def create_github_config(
    config: GitHubConfigCreate,
    current_user: User = Depends(get_current_user)
):
    """Create GitHub integration for a project"""
    # Verify project exists
    project = await db.tm_projects.find_one(
        {"id": config.project_id, "tenant_id": current_user.tenant_id}
    )
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Check if already configured
    existing = await db.tm_github_config.find_one({
        "project_id": config.project_id,
        "tenant_id": current_user.tenant_id,
        "is_active": True
    })
    if existing:
        raise HTTPException(status_code=400, detail="GitHub already configured for this project")
    
    now = datetime.now(timezone.utc)
    config_id = str(uuid.uuid4())
    
    # Generate webhook URL
    webhook_secret = str(uuid.uuid4())
    webhook_url = f"{os.environ.get('BACKEND_URL', '')}/api/task-manager/integrations/github/webhook/{config_id}"
    
    config_data = {
        "id": config_id,
        "tenant_id": current_user.tenant_id,
        "project_id": config.project_id,
        "repository_url": config.repository_url,
        "auto_complete_on_merge": config.auto_complete_on_merge,
        "webhook_secret": webhook_secret,
        "webhook_url": webhook_url,
        "is_active": True,
        "created_by": current_user.id,
        "created_at": now,
        "updated_at": now
    }
    
    await db.tm_github_config.insert_one(config_data)
    config_data.pop("_id", None)
    
    return config_data


@integrations_router.put("/integrations/github/config/{config_id}")
async def update_github_config(
    config_id: str,
    config: GitHubConfigUpdate,
    current_user: User = Depends(get_current_user)
):
    """Update GitHub configuration"""
    existing = await db.tm_github_config.find_one({
        "id": config_id,
        "tenant_id": current_user.tenant_id
    })
    if not existing:
        raise HTTPException(status_code=404, detail="GitHub config not found")
    
    update_data = {k: v for k, v in config.dict().items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc)
    
    await db.tm_github_config.update_one(
        {"id": config_id},
        {"$set": update_data}
    )
    
    return {"success": True, "message": "GitHub configuration updated"}


@integrations_router.delete("/integrations/github/config/{config_id}")
async def delete_github_config(
    config_id: str,
    current_user: User = Depends(get_current_user)
):
    """Delete GitHub configuration"""
    result = await db.tm_github_config.update_one(
        {"id": config_id, "tenant_id": current_user.tenant_id},
        {"$set": {"is_active": False, "deleted_at": datetime.now(timezone.utc)}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="GitHub config not found")
    
    return {"success": True, "message": "GitHub configuration deleted"}


@integrations_router.post("/integrations/github/webhook/{config_id}")
async def handle_github_webhook(
    config_id: str,
    request: Request
):
    """Handle incoming GitHub webhook events"""
    # Get config
    config = await db.tm_github_config.find_one(
        {"id": config_id, "is_active": True}
    )
    
    if not config:
        raise HTTPException(status_code=404, detail="Webhook configuration not found")
    
    # Get signature
    signature = request.headers.get("X-Hub-Signature-256", "")
    event_type = request.headers.get("X-GitHub-Event", "")
    
    body = await request.body()
    
    # Verify signature
    webhook_secret = config.get("webhook_secret", "")
    if webhook_secret:
        github_service.webhook_secret = webhook_secret
        if not github_service.verify_signature(body, signature):
            raise HTTPException(status_code=403, detail="Invalid signature")
    
    # Parse payload
    try:
        payload = json.loads(body.decode())
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")
    
    # Handle the webhook
    result = await github_handler.handle_webhook(
        event_type,
        payload,
        config.get("tenant_id")
    )
    
    # Log the webhook
    await db.tm_github_webhook_logs.insert_one({
        "id": str(uuid.uuid4()),
        "config_id": config_id,
        "tenant_id": config.get("tenant_id"),
        "event_type": event_type,
        "result": result,
        "created_at": datetime.now(timezone.utc)
    })
    
    return {"status": "ok", "result": result}


# ============================================================================
# REPORTING / DASHBOARD ENDPOINTS
# ============================================================================

@integrations_router.get("/dashboards/tasks-by-status")
async def dashboard_tasks_by_status(
    project_id: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """Get tasks breakdown by status"""
    start_dt = datetime.fromisoformat(start_date) if start_date else None
    end_dt = datetime.fromisoformat(end_date) if end_date else None
    
    data = await reporting_service.get_tasks_by_status(
        current_user.tenant_id,
        project_id,
        start_dt,
        end_dt
    )
    return data


@integrations_router.get("/dashboards/overdue-by-assignee")
async def dashboard_overdue_by_assignee(
    project_id: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """Get overdue tasks grouped by assignee"""
    data = await reporting_service.get_overdue_tasks_by_assignee(
        current_user.tenant_id,
        project_id
    )
    return data


@integrations_router.get("/dashboards/time-by-project")
async def dashboard_time_by_project(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """Get time tracked per project"""
    start_dt = datetime.fromisoformat(start_date) if start_date else None
    end_dt = datetime.fromisoformat(end_date) if end_date else None
    
    data = await reporting_service.get_time_spent_by_project(
        current_user.tenant_id,
        start_dt,
        end_dt
    )
    return data


@integrations_router.get("/dashboards/blocked-tasks")
async def dashboard_blocked_tasks(
    project_id: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """Get blocked tasks report"""
    data = await reporting_service.get_blocked_tasks_report(
        current_user.tenant_id,
        project_id
    )
    return data


@integrations_router.get("/dashboards/automation-log")
async def dashboard_automation_log(
    rule_id: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    limit: int = Query(default=100, le=500),
    current_user: User = Depends(get_current_user)
):
    """Get automation execution log"""
    start_dt = datetime.fromisoformat(start_date) if start_date else None
    end_dt = datetime.fromisoformat(end_date) if end_date else None
    
    data = await reporting_service.get_automation_execution_log(
        current_user.tenant_id,
        rule_id,
        start_dt,
        end_dt,
        limit
    )
    return data


@integrations_router.get("/dashboards/export/{report_type}")
async def export_dashboard_csv(
    report_type: str,
    project_id: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """Export dashboard data as CSV"""
    start_dt = datetime.fromisoformat(start_date) if start_date else None
    end_dt = datetime.fromisoformat(end_date) if end_date else None
    
    # Get the data based on report type
    if report_type == "tasks_by_status":
        data = await reporting_service.get_tasks_by_status(
            current_user.tenant_id, project_id, start_dt, end_dt
        )
    elif report_type == "overdue_by_assignee":
        data = await reporting_service.get_overdue_tasks_by_assignee(
            current_user.tenant_id, project_id
        )
    elif report_type == "time_by_project":
        data = await reporting_service.get_time_spent_by_project(
            current_user.tenant_id, start_dt, end_dt
        )
    elif report_type == "blocked_tasks":
        data = await reporting_service.get_blocked_tasks_report(
            current_user.tenant_id, project_id
        )
    elif report_type == "automation_log":
        data = await reporting_service.get_automation_execution_log(
            current_user.tenant_id, None, start_dt, end_dt
        )
    else:
        raise HTTPException(status_code=400, detail="Unknown report type")
    
    # Export to CSV
    csv_content = await reporting_service.export_to_csv(report_type, data)
    
    # Return CSV response
    filename = f"{report_type}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
    
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )



# ============================================================================
# PHASE 12: BI-DIRECTIONAL GITHUB SYNC ENDPOINTS
# ============================================================================

from ..services.github_sync_service import GitHubSyncService

# Initialize sync service
github_sync_service = GitHubSyncService(db)

# Feature flag check
FEATURE_GITHUB_SYNC_ENABLED = os.environ.get("FEATURE_GITHUB_SYNC", "true").lower() == "true"


def check_github_sync_enabled():
    """Check if GitHub sync feature is enabled"""
    if not FEATURE_GITHUB_SYNC_ENABLED:
        raise HTTPException(status_code=403, detail="GitHub sync feature is disabled")


class GitHubSyncConfigCreate(BaseModel):
    """Configuration for GitHub bi-directional sync"""
    repository_full_name: str  # e.g., "owner/repo"
    repository_url: str
    access_token: str
    is_enabled: bool = True
    auto_create_task: bool = False  # Create task when issue opened
    auto_close_task: bool = True  # Update task when issue closed/PR merged
    sync_comments: bool = False  # Sync comments bidirectionally
    status_mapping: Optional[Dict[str, str]] = None  # Task status -> GitHub state
    reverse_status_mapping: Optional[Dict[str, str]] = None  # GitHub state -> Task status


class GitHubSyncConfigUpdate(BaseModel):
    """Update GitHub sync configuration"""
    is_enabled: Optional[bool] = None
    auto_create_task: Optional[bool] = None
    auto_close_task: Optional[bool] = None
    sync_comments: Optional[bool] = None
    status_mapping: Optional[Dict[str, str]] = None
    reverse_status_mapping: Optional[Dict[str, str]] = None


@integrations_router.get("/integrations/github/status")
async def get_github_sync_status(
    current_user: User = Depends(get_current_user)
):
    """Get GitHub App configuration status"""
    check_github_sync_enabled()
    
    return {
        "configured": github_sync_service.is_configured,
        "feature_enabled": FEATURE_GITHUB_SYNC_ENABLED,
        "client_id": github_sync_service.client_id[:8] + "..." if github_sync_service.client_id else None
    }


@integrations_router.get("/integrations/github/oauth-url")
async def get_github_oauth_url(
    redirect_uri: str,
    current_user: User = Depends(get_current_user)
):
    """Get GitHub OAuth authorization URL"""
    check_github_sync_enabled()
    
    if not github_sync_service.is_configured:
        raise HTTPException(status_code=400, detail="GitHub App not configured")
    
    # Generate state token for security
    state = str(uuid.uuid4())
    
    # Store state temporarily for validation
    await db.tm_github_oauth_states.insert_one({
        "state": state,
        "user_id": current_user.id,
        "tenant_id": current_user.tenant_id,
        "redirect_uri": redirect_uri,
        "created_at": datetime.now(timezone.utc),
        "expires_at": datetime.now(timezone.utc).replace(minute=datetime.now().minute + 10)
    })
    
    oauth_url = github_sync_service.get_oauth_url(state, redirect_uri)
    
    return {"oauth_url": oauth_url, "state": state}


@integrations_router.post("/integrations/github/oauth-callback")
async def handle_github_oauth_callback(
    code: str,
    state: str,
    current_user: User = Depends(get_current_user)
):
    """Handle GitHub OAuth callback and exchange code for token"""
    check_github_sync_enabled()
    
    # Validate state
    stored_state = await db.tm_github_oauth_states.find_one({
        "state": state,
        "user_id": current_user.id
    })
    
    if not stored_state:
        raise HTTPException(status_code=400, detail="Invalid or expired state")
    
    # Delete used state
    await db.tm_github_oauth_states.delete_one({"state": state})
    
    # Exchange code for token
    token_result = await github_sync_service.exchange_code_for_token(code)
    
    if "error" in token_result:
        raise HTTPException(status_code=400, detail=token_result.get("error_description", "OAuth failed"))
    
    access_token = token_result.get("access_token")
    
    # Get user info
    user_info = await github_sync_service.get_user_info(access_token)
    
    # Get available repos
    repos = await github_sync_service.get_user_repos(access_token)
    
    return {
        "success": True,
        "access_token": access_token,
        "github_user": {
            "login": user_info.get("login"),
            "name": user_info.get("name"),
            "avatar_url": user_info.get("avatar_url")
        },
        "repositories": repos[:50]  # Limit to first 50
    }


@integrations_router.get("/integrations/github/repos")
async def get_github_repos(
    access_token: str,
    current_user: User = Depends(get_current_user)
):
    """Get available GitHub repositories for the access token"""
    check_github_sync_enabled()
    
    repos = await github_sync_service.get_user_repos(access_token)
    return {"repositories": repos}


@integrations_router.get("/projects/{project_id}/github-sync")
async def get_project_github_sync_config(
    project_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get GitHub sync configuration for a project"""
    check_github_sync_enabled()
    
    # Verify project access
    project = await db.tm_projects.find_one({
        "id": project_id,
        "tenant_id": current_user.tenant_id
    })
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    config = await github_sync_service.get_project_sync_config(project_id, current_user.tenant_id)
    
    if config:
        # Mask access token
        if config.get("access_token"):
            config["access_token"] = config["access_token"][:8] + "..."
    
    return {"config": config}


@integrations_router.put("/projects/{project_id}/github-sync")
async def update_project_github_sync_config(
    project_id: str,
    config: GitHubSyncConfigCreate,
    current_user: User = Depends(get_current_user)
):
    """Create or update GitHub sync configuration for a project"""
    check_github_sync_enabled()
    
    # Verify project access
    project = await db.tm_projects.find_one({
        "id": project_id,
        "tenant_id": current_user.tenant_id
    })
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Set defaults for status mapping
    config_data = config.dict()
    if not config_data.get("status_mapping"):
        config_data["status_mapping"] = github_sync_service.DEFAULT_STATUS_MAPPING
    if not config_data.get("reverse_status_mapping"):
        config_data["reverse_status_mapping"] = github_sync_service.DEFAULT_REVERSE_MAPPING
    
    # Generate webhook URL for this project
    config_data["webhook_url"] = f"{os.environ.get('BACKEND_URL', '')}/api/task-manager/integrations/github/sync-webhook/{project_id}"
    config_data["webhook_secret"] = str(uuid.uuid4())
    
    saved_config = await github_sync_service.save_project_sync_config(
        project_id=project_id,
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        config_data=config_data
    )
    
    # Mask access token in response
    if saved_config and saved_config.get("access_token"):
        saved_config["access_token"] = saved_config["access_token"][:8] + "..."
    
    return {"success": True, "config": saved_config}


@integrations_router.patch("/projects/{project_id}/github-sync")
async def patch_project_github_sync_config(
    project_id: str,
    config: GitHubSyncConfigUpdate,
    current_user: User = Depends(get_current_user)
):
    """Partially update GitHub sync configuration"""
    check_github_sync_enabled()
    
    existing = await github_sync_service.get_project_sync_config(project_id, current_user.tenant_id)
    if not existing:
        raise HTTPException(status_code=404, detail="GitHub sync not configured for this project")
    
    update_data = {k: v for k, v in config.dict().items() if v is not None}
    
    saved_config = await github_sync_service.save_project_sync_config(
        project_id=project_id,
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        config_data=update_data
    )
    
    return {"success": True, "config": saved_config}


@integrations_router.delete("/projects/{project_id}/github-sync")
async def delete_project_github_sync_config(
    project_id: str,
    current_user: User = Depends(get_current_user)
):
    """Disable/delete GitHub sync configuration for a project"""
    check_github_sync_enabled()
    
    result = await db.tm_github_sync_config.update_one(
        {"project_id": project_id, "tenant_id": current_user.tenant_id},
        {
            "$set": {
                "is_active": False,
                "is_enabled": False,
                "deleted_at": datetime.now(timezone.utc),
                "deleted_by": current_user.id
            }
        }
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="GitHub sync not configured")
    
    return {"success": True, "message": "GitHub sync disabled"}


@integrations_router.post("/tasks/{task_id}/create-github-issue")
async def create_github_issue_from_task(
    task_id: str,
    current_user: User = Depends(get_current_user)
):
    """Create a GitHub Issue from a task (Task → GitHub)"""
    check_github_sync_enabled()
    
    success, result = await github_sync_service.create_github_issue(
        task_id=task_id,
        tenant_id=current_user.tenant_id,
        user_id=current_user.id
    )
    
    if not success:
        raise HTTPException(status_code=400, detail=result.get("error", "Failed to create issue"))
    
    return {
        "success": True,
        "issue_number": result.get("issue_number"),
        "issue_url": result.get("issue_url")
    }


@integrations_router.post("/tasks/{task_id}/sync-github")
async def sync_task_to_github(
    task_id: str,
    changed_fields: List[str] = Query(default=["title", "description", "status"]),
    current_user: User = Depends(get_current_user)
):
    """Manually trigger sync of task changes to GitHub Issue"""
    check_github_sync_enabled()
    
    success, result = await github_sync_service.sync_task_to_github(
        task_id=task_id,
        tenant_id=current_user.tenant_id,
        changed_fields=changed_fields
    )
    
    if not success:
        raise HTTPException(status_code=400, detail=result.get("error", "Sync failed"))
    
    return {"success": True, **result}


@integrations_router.get("/projects/{project_id}/github-sync/logs")
async def get_github_sync_logs(
    project_id: str,
    limit: int = Query(default=50, le=200),
    current_user: User = Depends(get_current_user)
):
    """Get GitHub sync audit logs for a project"""
    check_github_sync_enabled()
    
    logs = await db.tm_github_sync_logs.find(
        {"project_id": project_id, "tenant_id": current_user.tenant_id},
        {"_id": 0}
    ).sort("created_at", -1).to_list(limit)
    
    return {"logs": logs}


@integrations_router.post("/integrations/github/sync-webhook/{project_id}")
async def handle_github_sync_webhook(
    project_id: str,
    request: Request
):
    """Handle incoming GitHub webhook for bi-directional sync"""
    # Get config by project_id
    config = await db.tm_github_sync_config.find_one({
        "project_id": project_id,
        "is_active": True,
        "is_enabled": True
    })
    
    if not config:
        raise HTTPException(status_code=404, detail="GitHub sync not configured for this project")
    
    # Get headers
    signature = request.headers.get("X-Hub-Signature-256", "")
    event_type = request.headers.get("X-GitHub-Event", "")
    
    body = await request.body()
    
    # Verify signature if webhook secret is configured
    if config.get("webhook_secret"):
        github_sync_service.webhook_secret = config["webhook_secret"]
        if not github_sync_service.verify_webhook_signature(body, signature):
            raise HTTPException(status_code=403, detail="Invalid webhook signature")
    
    # Parse payload
    try:
        payload = json.loads(body.decode())
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")
    
    tenant_id = config.get("tenant_id")
    config_id = config.get("id")
    
    # Route to appropriate handler
    result = {}
    
    if event_type == "issues":
        result = await github_sync_service.handle_github_issue_event(payload, tenant_id, config_id)
    elif event_type == "issue_comment":
        result = await github_sync_service.handle_github_issue_comment(payload, tenant_id, config_id)
    elif event_type == "pull_request":
        result = await github_sync_service.handle_pull_request_event(payload, tenant_id, config_id)
    elif event_type == "push":
        # Legacy push handling for commits
        result = await github_service.handle_push_event(payload, tenant_id)
    else:
        result = {"status": "ignored", "reason": f"Event type '{event_type}' not handled"}
    
    # Log webhook receipt
    await db.tm_github_webhook_logs.insert_one({
        "id": str(uuid.uuid4()),
        "config_id": config_id,
        "project_id": project_id,
        "tenant_id": tenant_id,
        "event_type": event_type,
        "result": result,
        "created_at": datetime.now(timezone.utc)
    })
    
    return {"status": "ok", "result": result}
