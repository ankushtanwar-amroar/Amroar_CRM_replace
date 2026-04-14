"""
GitHub Bi-directional Sync Service for Task Manager - Phase 12
Handles OAuth, Task ↔ GitHub Issue synchronization, status mapping, and conflict resolution
"""
import os
import hmac
import hashlib
import re
import logging
import httpx
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List, Tuple
import uuid

logger = logging.getLogger(__name__)


class GitHubSyncService:
    """Service for bi-directional GitHub sync"""
    
    # Task ID pattern: TM-{uuid} or task reference
    TASK_ID_PATTERN = re.compile(r'TM-([a-zA-Z0-9-]+)', re.IGNORECASE)
    
    # GitHub API base URL
    GITHUB_API_URL = "https://api.github.com"
    
    # Default status mapping (Task Status → GitHub Issue State)
    DEFAULT_STATUS_MAPPING = {
        "todo": "open",
        "in_progress": "open",
        "blocked": "open",
        "pending_approval": "open",
        "done": "closed"
    }
    
    # Reverse mapping (GitHub Issue State → Task Status)
    DEFAULT_REVERSE_MAPPING = {
        "open": "todo",
        "closed": "done"
    }
    
    def __init__(self, db):
        self.db = db
        # GitHub App credentials from environment
        self.app_id = os.environ.get("GITHUB_APP_ID")
        self.client_id = os.environ.get("GITHUB_CLIENT_ID")
        self.client_secret = os.environ.get("GITHUB_CLIENT_SECRET")
        self.webhook_secret = os.environ.get("GITHUB_WEBHOOK_SECRET")
        self.private_key = os.environ.get("GITHUB_PRIVATE_KEY")
    
    @property
    def is_configured(self) -> bool:
        """Check if GitHub App is configured"""
        return bool(self.client_id and self.client_secret)
    
    def get_oauth_url(self, state: str, redirect_uri: str) -> str:
        """Generate GitHub OAuth authorization URL"""
        params = {
            "client_id": self.client_id,
            "redirect_uri": redirect_uri,
            "scope": "repo",
            "state": state
        }
        query = "&".join(f"{k}={v}" for k, v in params.items())
        return f"https://github.com/login/oauth/authorize?{query}"
    
    async def exchange_code_for_token(self, code: str) -> Dict[str, Any]:
        """Exchange OAuth code for access token"""
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://github.com/login/oauth/access_token",
                data={
                    "client_id": self.client_id,
                    "client_secret": self.client_secret,
                    "code": code
                },
                headers={"Accept": "application/json"}
            )
            
            if response.status_code == 200:
                return response.json()
            else:
                logger.error(f"GitHub OAuth error: {response.text}")
                return {"error": "Failed to exchange code for token"}
    
    async def get_user_info(self, access_token: str) -> Dict[str, Any]:
        """Get authenticated user info from GitHub"""
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.GITHUB_API_URL}/user",
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Accept": "application/vnd.github.v3+json"
                }
            )
            
            if response.status_code == 200:
                return response.json()
            return {}
    
    async def get_user_repos(self, access_token: str) -> List[Dict[str, Any]]:
        """Get repositories accessible to the user"""
        repos = []
        page = 1
        
        async with httpx.AsyncClient() as client:
            while True:
                response = await client.get(
                    f"{self.GITHUB_API_URL}/user/repos",
                    params={
                        "per_page": 100,
                        "page": page,
                        "sort": "updated",
                        "affiliation": "owner,collaborator,organization_member"
                    },
                    headers={
                        "Authorization": f"Bearer {access_token}",
                        "Accept": "application/vnd.github.v3+json"
                    }
                )
                
                if response.status_code != 200:
                    break
                
                data = response.json()
                if not data:
                    break
                
                repos.extend([{
                    "id": r["id"],
                    "name": r["name"],
                    "full_name": r["full_name"],
                    "html_url": r["html_url"],
                    "private": r["private"],
                    "owner": r["owner"]["login"]
                } for r in data])
                
                if len(data) < 100:
                    break
                page += 1
        
        return repos
    
    async def get_project_sync_config(self, project_id: str, tenant_id: str) -> Optional[Dict]:
        """Get GitHub sync configuration for a project"""
        config = await self.db.tm_github_sync_config.find_one(
            {"project_id": project_id, "tenant_id": tenant_id, "is_active": True},
            {"_id": 0}
        )
        return config
    
    async def save_project_sync_config(
        self,
        project_id: str,
        tenant_id: str,
        user_id: str,
        config_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Save or update GitHub sync configuration for a project"""
        now = datetime.now(timezone.utc)
        
        existing = await self.db.tm_github_sync_config.find_one({
            "project_id": project_id,
            "tenant_id": tenant_id
        })
        
        if existing:
            # Update existing - ensure is_active is set to True when re-enabling
            await self.db.tm_github_sync_config.update_one(
                {"project_id": project_id, "tenant_id": tenant_id},
                {
                    "$set": {
                        **config_data,
                        "is_active": True,  # Re-enable if previously disabled
                        "updated_at": now,
                        "updated_by": user_id
                    },
                    "$unset": {
                        "deleted_at": "",
                        "deleted_by": ""
                    }
                }
            )
            config_id = existing.get("id")
        else:
            # Create new
            config_id = str(uuid.uuid4())
            full_config = {
                "id": config_id,
                "project_id": project_id,
                "tenant_id": tenant_id,
                "is_active": True,
                "created_by": user_id,
                "created_at": now,
                "updated_at": now,
                **config_data
            }
            await self.db.tm_github_sync_config.insert_one(full_config)
        
        # Log the configuration change
        await self._log_sync_event(
            tenant_id=tenant_id,
            project_id=project_id,
            event_type="config_updated",
            description="GitHub sync configuration updated",
            user_id=user_id
        )
        
        return await self.get_project_sync_config(project_id, tenant_id)
    
    async def create_github_issue(
        self,
        task_id: str,
        tenant_id: str,
        user_id: str
    ) -> Tuple[bool, Dict[str, Any]]:
        """Create a GitHub Issue from a Task"""
        # Get task
        task = await self.db.tm_tasks.find_one(
            {"id": task_id, "tenant_id": tenant_id, "is_active": True},
            {"_id": 0}
        )
        
        if not task:
            return False, {"error": "Task not found"}
        
        # Check if already linked
        if task.get("github_issue_id"):
            return False, {"error": "Task already linked to GitHub Issue", "issue_id": task.get("github_issue_id")}
        
        # Get project sync config
        config = await self.get_project_sync_config(task.get("project_id"), tenant_id)
        if not config or not config.get("is_enabled"):
            return False, {"error": "GitHub sync not enabled for this project"}
        
        access_token = config.get("access_token")
        repo_full_name = config.get("repository_full_name")
        
        if not access_token or not repo_full_name:
            return False, {"error": "GitHub not configured properly"}
        
        # Build issue body
        body = self._build_issue_body(task)
        
        # Create issue via GitHub API
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.GITHUB_API_URL}/repos/{repo_full_name}/issues",
                    json={
                        "title": task.get("title"),
                        "body": body,
                        "labels": self._task_to_labels(task)
                    },
                    headers={
                        "Authorization": f"Bearer {access_token}",
                        "Accept": "application/vnd.github.v3+json"
                    }
                )
                
                if response.status_code == 201:
                    issue = response.json()
                    
                    # Update task with GitHub issue ID
                    await self.db.tm_tasks.update_one(
                        {"id": task_id},
                        {
                            "$set": {
                                "github_issue_id": issue["id"],
                                "github_issue_number": issue["number"],
                                "github_issue_url": issue["html_url"],
                                "github_repo": repo_full_name,
                                "github_synced_at": datetime.now(timezone.utc),
                                "updated_at": datetime.now(timezone.utc)
                            }
                        }
                    )
                    
                    # Log activity
                    await self._log_sync_event(
                        tenant_id=tenant_id,
                        project_id=task.get("project_id"),
                        task_id=task_id,
                        event_type="issue_created",
                        description=f"Created GitHub Issue #{issue['number']}",
                        user_id=user_id,
                        github_data={
                            "issue_id": issue["id"],
                            "issue_number": issue["number"],
                            "issue_url": issue["html_url"]
                        }
                    )
                    
                    return True, {
                        "issue_id": issue["id"],
                        "issue_number": issue["number"],
                        "issue_url": issue["html_url"]
                    }
                else:
                    logger.error(f"GitHub API error: {response.text}")
                    return False, {"error": f"GitHub API error: {response.status_code}"}
                    
        except Exception as e:
            logger.error(f"Error creating GitHub issue: {e}")
            return False, {"error": str(e)}
    
    async def sync_task_to_github(
        self,
        task_id: str,
        tenant_id: str,
        changed_fields: List[str]
    ) -> Tuple[bool, Dict[str, Any]]:
        """Sync task changes to linked GitHub Issue"""
        task = await self.db.tm_tasks.find_one(
            {"id": task_id, "tenant_id": tenant_id, "is_active": True},
            {"_id": 0}
        )
        
        if not task:
            return False, {"error": "Task not found"}
        
        if not task.get("github_issue_number"):
            return False, {"error": "Task not linked to GitHub Issue"}
        
        config = await self.get_project_sync_config(task.get("project_id"), tenant_id)
        if not config or not config.get("is_enabled"):
            return False, {"error": "GitHub sync not enabled"}
        
        access_token = config.get("access_token")
        repo_full_name = config.get("repository_full_name")
        issue_number = task.get("github_issue_number")
        
        # Build update payload
        update_payload = {}
        
        if "title" in changed_fields:
            update_payload["title"] = task.get("title")
        
        if "description" in changed_fields:
            update_payload["body"] = self._build_issue_body(task)
        
        if "status" in changed_fields:
            status_mapping = config.get("status_mapping", self.DEFAULT_STATUS_MAPPING)
            github_state = status_mapping.get(task.get("status"), "open")
            update_payload["state"] = github_state
        
        if not update_payload:
            return True, {"message": "No changes to sync"}
        
        try:
            async with httpx.AsyncClient() as client:
                response = await client.patch(
                    f"{self.GITHUB_API_URL}/repos/{repo_full_name}/issues/{issue_number}",
                    json=update_payload,
                    headers={
                        "Authorization": f"Bearer {access_token}",
                        "Accept": "application/vnd.github.v3+json"
                    }
                )
                
                if response.status_code == 200:
                    # Update sync timestamp
                    await self.db.tm_tasks.update_one(
                        {"id": task_id},
                        {"$set": {"github_synced_at": datetime.now(timezone.utc)}}
                    )
                    
                    await self._log_sync_event(
                        tenant_id=tenant_id,
                        project_id=task.get("project_id"),
                        task_id=task_id,
                        event_type="task_synced_to_github",
                        description=f"Synced changes to GitHub Issue #{issue_number}",
                        github_data={"changed_fields": changed_fields}
                    )
                    
                    return True, {"message": "Synced successfully"}
                else:
                    return False, {"error": f"GitHub API error: {response.status_code}"}
                    
        except Exception as e:
            logger.error(f"Error syncing to GitHub: {e}")
            return False, {"error": str(e)}
    
    async def sync_comment_to_github(
        self,
        task_id: str,
        tenant_id: str,
        comment_content: str,
        user_name: str
    ) -> Tuple[bool, Dict[str, Any]]:
        """Sync a task comment to GitHub Issue"""
        task = await self.db.tm_tasks.find_one(
            {"id": task_id, "tenant_id": tenant_id, "is_active": True},
            {"_id": 0}
        )
        
        if not task or not task.get("github_issue_number"):
            return False, {"error": "Task not linked to GitHub"}
        
        config = await self.get_project_sync_config(task.get("project_id"), tenant_id)
        if not config or not config.get("sync_comments"):
            return False, {"error": "Comment sync not enabled"}
        
        access_token = config.get("access_token")
        repo_full_name = config.get("repository_full_name")
        issue_number = task.get("github_issue_number")
        
        # Format comment with attribution
        formatted_comment = f"**Comment from Task Manager** (by {user_name}):\n\n{comment_content}"
        
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.GITHUB_API_URL}/repos/{repo_full_name}/issues/{issue_number}/comments",
                    json={"body": formatted_comment},
                    headers={
                        "Authorization": f"Bearer {access_token}",
                        "Accept": "application/vnd.github.v3+json"
                    }
                )
                
                if response.status_code == 201:
                    return True, {"message": "Comment synced to GitHub"}
                else:
                    return False, {"error": f"GitHub API error: {response.status_code}"}
                    
        except Exception as e:
            logger.error(f"Error syncing comment: {e}")
            return False, {"error": str(e)}
    
    async def handle_github_issue_event(
        self,
        payload: Dict[str, Any],
        tenant_id: str,
        config_id: str
    ) -> Dict[str, Any]:
        """Handle incoming GitHub issue webhook event"""
        action = payload.get("action")
        issue = payload.get("issue", {})
        # repo = payload.get("repository", {})  # Available if needed
        
        result = {
            "action": action,
            "processed": False,
            "task_id": None,
            "changes": []
        }
        
        # Get config
        config = await self.db.tm_github_sync_config.find_one(
            {"id": config_id, "tenant_id": tenant_id, "is_active": True}
        )
        
        if not config:
            return {"error": "Config not found", **result}
        
        # Find task linked to this issue
        task = await self.db.tm_tasks.find_one({
            "github_issue_id": issue.get("id"),
            "tenant_id": tenant_id,
            "is_active": True
        }, {"_id": 0})
        
        # Handle issue opened - create task if configured
        if action == "opened" and not task:
            if config.get("auto_create_task"):
                task = await self._create_task_from_issue(issue, config, tenant_id)
                if task:
                    result["processed"] = True
                    result["task_id"] = task.get("id")
                    result["changes"].append("task_created")
            return result
        
        if not task:
            # Try to find task by TM-id pattern in issue title/body
            task_ids = self.extract_task_ids(issue.get("title", "") + " " + (issue.get("body") or ""))
            if task_ids:
                task = await self.db.tm_tasks.find_one({
                    "id": {"$in": task_ids},
                    "tenant_id": tenant_id,
                    "is_active": True
                }, {"_id": 0})
        
        if not task:
            return {"message": "No linked task found", **result}
        
        result["task_id"] = task.get("id")
        
        # Handle issue closed/reopened
        if action in ["closed", "reopened"]:
            if config.get("auto_close_task"):
                reverse_mapping = config.get("reverse_status_mapping", self.DEFAULT_REVERSE_MAPPING)
                new_status = reverse_mapping.get("closed" if action == "closed" else "open", "todo")
                
                # Check if task is pending approval - don't update
                if task.get("approval_status") == "pending":
                    await self._log_sync_event(
                        tenant_id=tenant_id,
                        project_id=task.get("project_id"),
                        task_id=task.get("id"),
                        event_type="sync_blocked",
                        description="Cannot update task status - pending approval",
                        github_data={"action": action, "issue_number": issue.get("number")}
                    )
                    result["changes"].append("blocked_by_approval")
                    return result
                
                await self.db.tm_tasks.update_one(
                    {"id": task.get("id")},
                    {
                        "$set": {
                            "status": new_status,
                            "github_synced_at": datetime.now(timezone.utc),
                            "updated_at": datetime.now(timezone.utc)
                        }
                    }
                )
                
                await self._log_sync_event(
                    tenant_id=tenant_id,
                    project_id=task.get("project_id"),
                    task_id=task.get("id"),
                    event_type="github_to_task_sync",
                    description=f"Status updated to '{new_status}' from GitHub issue {action}",
                    github_data={"action": action, "issue_number": issue.get("number")}
                )
                
                result["processed"] = True
                result["changes"].append(f"status_changed_to_{new_status}")
        
        # Handle issue edited (title/body changes)
        if action == "edited":
            changes = payload.get("changes", {})
            update_data = {"github_synced_at": datetime.now(timezone.utc), "updated_at": datetime.now(timezone.utc)}
            
            if "title" in changes:
                # Conflict resolution: last write wins, log the conflict
                if task.get("title") != changes["title"].get("from"):
                    await self._log_sync_event(
                        tenant_id=tenant_id,
                        project_id=task.get("project_id"),
                        task_id=task.get("id"),
                        event_type="conflict_detected",
                        description="Title conflict detected - GitHub update applied (last-write-wins)",
                        github_data={
                            "github_old": changes["title"].get("from"),
                            "github_new": issue.get("title"),
                            "task_value": task.get("title")
                        }
                    )
                update_data["title"] = issue.get("title")
                result["changes"].append("title_updated")
            
            if update_data:
                await self.db.tm_tasks.update_one(
                    {"id": task.get("id")},
                    {"$set": update_data}
                )
                result["processed"] = True
        
        return result
    
    async def handle_github_issue_comment(
        self,
        payload: Dict[str, Any],
        tenant_id: str,
        config_id: str
    ) -> Dict[str, Any]:
        """Handle GitHub issue comment webhook"""
        action = payload.get("action")
        comment = payload.get("comment", {})
        issue = payload.get("issue", {})
        
        if action != "created":
            return {"processed": False, "reason": "Only handling new comments"}
        
        config = await self.db.tm_github_sync_config.find_one(
            {"id": config_id, "tenant_id": tenant_id, "is_active": True}
        )
        
        if not config:
            return {"error": "Config not found"}
        
        # Find linked task
        task = await self.db.tm_tasks.find_one({
            "github_issue_id": issue.get("id"),
            "tenant_id": tenant_id,
            "is_active": True
        }, {"_id": 0})
        
        if not task:
            return {"processed": False, "reason": "No linked task"}
        
        # Don't sync comments that came from Task Manager
        if "Comment from Task Manager" in comment.get("body", ""):
            return {"processed": False, "reason": "Skipping Task Manager originated comment"}
        
        # Log as activity (not as full comment to avoid loops)
        await self._log_sync_event(
            tenant_id=tenant_id,
            project_id=task.get("project_id"),
            task_id=task.get("id"),
            event_type="github_comment",
            description=f"GitHub comment by {comment.get('user', {}).get('login', 'Unknown')}",
            github_data={
                "comment_id": comment.get("id"),
                "comment_url": comment.get("html_url"),
                "author": comment.get("user", {}).get("login"),
                "body_preview": comment.get("body", "")[:200]
            }
        )
        
        return {"processed": True, "task_id": task.get("id")}
    
    async def handle_pull_request_event(
        self,
        payload: Dict[str, Any],
        tenant_id: str,
        config_id: str
    ) -> Dict[str, Any]:
        """Handle GitHub PR webhook - update task on PR merge"""
        action = payload.get("action")
        pr = payload.get("pull_request", {})
        
        result = {"action": action, "processed": False, "linked_tasks": []}
        
        config = await self.db.tm_github_sync_config.find_one(
            {"id": config_id, "tenant_id": tenant_id, "is_active": True}
        )
        
        if not config:
            return {"error": "Config not found"}
        
        # Extract task IDs from PR title and body
        text = f"{pr.get('title', '')} {pr.get('body', '') or ''}"
        task_ids = self.extract_task_ids(text)
        
        for task_id in task_ids:
            task = await self.db.tm_tasks.find_one({
                "id": task_id,
                "tenant_id": tenant_id,
                "is_active": True
            }, {"_id": 0})
            
            if not task:
                continue
            
            # Log PR activity
            await self._log_sync_event(
                tenant_id=tenant_id,
                project_id=task.get("project_id"),
                task_id=task_id,
                event_type=f"pr_{action}",
                description=f"PR #{pr.get('number')}: {pr.get('title')}",
                github_data={
                    "pr_number": pr.get("number"),
                    "pr_url": pr.get("html_url"),
                    "pr_author": pr.get("user", {}).get("login"),
                    "merged": pr.get("merged", False)
                }
            )
            
            result["linked_tasks"].append(task_id)
            
            # Handle PR merged - complete task if configured
            if action == "closed" and pr.get("merged") and config.get("auto_close_task"):
                if task.get("approval_status") != "pending":
                    await self.db.tm_tasks.update_one(
                        {"id": task_id},
                        {
                            "$set": {
                                "status": "done",
                                "github_synced_at": datetime.now(timezone.utc),
                                "updated_at": datetime.now(timezone.utc)
                            }
                        }
                    )
                    result["processed"] = True
        
        return result
    
    def extract_task_ids(self, text: str) -> List[str]:
        """Extract task IDs from text"""
        matches = self.TASK_ID_PATTERN.findall(text)
        return list(set(matches))
    
    def verify_webhook_signature(self, payload: bytes, signature: str) -> bool:
        """Verify GitHub webhook signature"""
        if not self.webhook_secret:
            return True  # No secret configured, skip verification
        
        expected = "sha256=" + hmac.new(
            self.webhook_secret.encode(),
            payload,
            hashlib.sha256
        ).hexdigest()
        
        return hmac.compare_digest(expected, signature)
    
    def _build_issue_body(self, task: Dict[str, Any]) -> str:
        """Build GitHub Issue body from task"""
        body_parts = []
        
        if task.get("description"):
            body_parts.append(task["description"])
        
        body_parts.append("\n---")
        body_parts.append(f"📋 **Task Manager Reference:** `TM-{task.get('id')}`")
        
        if task.get("priority"):
            priority_emoji = {"urgent": "🔴", "high": "🟠", "medium": "🟡", "low": "🟢"}.get(task["priority"], "⚪")
            body_parts.append(f"**Priority:** {priority_emoji} {task['priority'].capitalize()}")
        
        if task.get("due_date"):
            body_parts.append(f"**Due Date:** {task['due_date']}")
        
        return "\n".join(body_parts)
    
    def _task_to_labels(self, task: Dict[str, Any]) -> List[str]:
        """Convert task properties to GitHub labels"""
        labels = []
        
        if task.get("priority") in ["urgent", "high"]:
            labels.append(f"priority:{task['priority']}")
        
        if task.get("task_type") and task["task_type"] != "other":
            labels.append(task["task_type"])
        
        return labels
    
    async def _create_task_from_issue(
        self,
        issue: Dict[str, Any],
        config: Dict[str, Any],
        tenant_id: str
    ) -> Optional[Dict[str, Any]]:
        """Create a task from a GitHub issue"""
        now = datetime.now(timezone.utc)
        task_id = str(uuid.uuid4())
        
        task_data = {
            "id": task_id,
            "tenant_id": tenant_id,
            "project_id": config.get("project_id"),
            "title": issue.get("title"),
            "description": issue.get("body"),
            "status": "todo",
            "priority": "medium",
            "task_type": "other",
            "github_issue_id": issue.get("id"),
            "github_issue_number": issue.get("number"),
            "github_issue_url": issue.get("html_url"),
            "github_repo": config.get("repository_full_name"),
            "github_synced_at": now,
            "created_by": "github_sync",
            "created_at": now,
            "updated_at": now,
            "is_active": True,
            "subtask_count": 0,
            "completed_subtask_count": 0,
            "checklist_count": 0,
            "completed_checklist_count": 0,
            "is_blocked": False,
            "order_index": 0
        }
        
        await self.db.tm_tasks.insert_one(task_data)
        
        await self._log_sync_event(
            tenant_id=tenant_id,
            project_id=config.get("project_id"),
            task_id=task_id,
            event_type="task_created_from_issue",
            description=f"Task created from GitHub Issue #{issue.get('number')}",
            github_data={
                "issue_id": issue.get("id"),
                "issue_number": issue.get("number"),
                "issue_url": issue.get("html_url")
            }
        )
        
        task_data.pop("_id", None)
        return task_data
    
    async def _log_sync_event(
        self,
        tenant_id: str,
        project_id: str,
        event_type: str,
        description: str,
        task_id: str = None,
        user_id: str = None,
        github_data: Dict[str, Any] = None
    ):
        """Log a sync event for audit trail"""
        event = {
            "id": str(uuid.uuid4()),
            "tenant_id": tenant_id,
            "project_id": project_id,
            "task_id": task_id,
            "event_type": event_type,
            "description": description,
            "user_id": user_id or "system",
            "github_data": github_data or {},
            "created_at": datetime.now(timezone.utc)
        }
        
        await self.db.tm_github_sync_logs.insert_one(event)
        
        # Also log to task activity if task_id provided
        if task_id:
            await self.db.tm_activity_logs.insert_one({
                "id": str(uuid.uuid4()),
                "tenant_id": tenant_id,
                "task_id": task_id,
                "activity_type": f"github_{event_type}",
                "description": description,
                "details": github_data,
                "created_by": user_id or "system",
                "created_at": datetime.now(timezone.utc)
            })
