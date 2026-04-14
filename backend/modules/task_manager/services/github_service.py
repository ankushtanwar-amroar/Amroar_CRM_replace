"""
GitHub Webhook Integration Service for Task Manager
Handles webhook events, task linking, and activity logging
"""
import os
import hmac
import hashlib
import re
import logging
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List
import uuid

logger = logging.getLogger(__name__)


class GitHubService:
    """Service for GitHub webhook integration"""
    
    # Pattern to match task IDs in commit messages: TM-123, TM-456, etc.
    TASK_ID_PATTERN = re.compile(r'TM-([a-zA-Z0-9-]+)', re.IGNORECASE)
    
    def __init__(self, db):
        self.db = db
        self.webhook_secret = os.environ.get("GITHUB_WEBHOOK_SECRET")
    
    @property
    def is_configured(self) -> bool:
        """Check if GitHub webhook is configured"""
        return bool(self.webhook_secret)
    
    def verify_signature(self, payload: bytes, signature: str) -> bool:
        """Verify GitHub webhook signature"""
        if not self.webhook_secret:
            return False
        
        expected_signature = "sha256=" + hmac.new(
            self.webhook_secret.encode(),
            payload,
            hashlib.sha256
        ).hexdigest()
        
        return hmac.compare_digest(expected_signature, signature)
    
    def extract_task_ids(self, text: str) -> List[str]:
        """Extract task IDs from commit message or PR title/body"""
        matches = self.TASK_ID_PATTERN.findall(text)
        return list(set(matches))  # Remove duplicates
    
    async def get_project_github_config(self, project_id: str, tenant_id: str) -> Optional[Dict]:
        """Get GitHub configuration for a project"""
        config = await self.db.tm_github_config.find_one(
            {"project_id": project_id, "tenant_id": tenant_id, "is_active": True},
            {"_id": 0}
        )
        return config
    
    async def get_task_by_id(self, task_id: str, tenant_id: str) -> Optional[Dict]:
        """Get task by ID"""
        task = await self.db.tm_tasks.find_one(
            {"id": task_id, "tenant_id": tenant_id, "is_active": True},
            {"_id": 0}
        )
        return task
    
    async def add_github_activity(
        self,
        task_id: str,
        tenant_id: str,
        event_type: str,
        title: str,
        url: str,
        author: str,
        details: Optional[Dict] = None
    ):
        """Add GitHub activity to task's activity log"""
        activity = {
            "id": str(uuid.uuid4()),
            "tenant_id": tenant_id,
            "task_id": task_id,
            "action_type": f"github_{event_type}",
            "description": title,
            "github_url": url,
            "github_author": author,
            "details": details or {},
            "created_at": datetime.now(timezone.utc)
        }
        
        await self.db.tm_activity_logs.insert_one(activity)
        return activity
    
    async def add_github_comment(
        self,
        task_id: str,
        tenant_id: str,
        event_type: str,
        title: str,
        url: str,
        author: str
    ):
        """Add a comment to task with GitHub link"""
        # Build comment content based on event type
        emoji_map = {
            "pr_opened": "🔀",
            "pr_merged": "✅",
            "commit": "📝"
        }
        
        label_map = {
            "pr_opened": "Pull Request Opened",
            "pr_merged": "Pull Request Merged",
            "commit": "Commit"
        }
        
        emoji = emoji_map.get(event_type, "🔗")
        label = label_map.get(event_type, "GitHub Activity")
        
        content = f"{emoji} **{label}**\n\n[{title}]({url})\n\nby {author}"
        
        comment = {
            "id": str(uuid.uuid4()),
            "tenant_id": tenant_id,
            "task_id": task_id,
            "content": content,
            "user_id": "system",  # System-generated comment
            "is_github_activity": True,
            "github_event_type": event_type,
            "github_url": url,
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc)
        }
        
        await self.db.tm_comments.insert_one(comment)
        return comment
    
    async def update_task_status(self, task_id: str, tenant_id: str, new_status: str):
        """Update task status (e.g., when PR is merged)"""
        await self.db.tm_tasks.update_one(
            {"id": task_id, "tenant_id": tenant_id},
            {
                "$set": {
                    "status": new_status,
                    "updated_at": datetime.now(timezone.utc)
                }
            }
        )
        
        # Log the status change
        await self.db.tm_activity_logs.insert_one({
            "id": str(uuid.uuid4()),
            "tenant_id": tenant_id,
            "task_id": task_id,
            "action_type": "status_changed",
            "description": f"Status changed to {new_status} (via GitHub PR merge)",
            "old_value": None,
            "new_value": new_status,
            "created_by": "system",
            "created_at": datetime.now(timezone.utc)
        })
    
    async def handle_push_event(self, payload: Dict, tenant_id: str) -> Dict[str, Any]:
        """Handle GitHub push event (commits)"""
        results = {
            "processed_commits": 0,
            "linked_tasks": [],
            "errors": []
        }
        
        repo_name = payload.get("repository", {}).get("full_name", "Unknown")
        commits = payload.get("commits", [])
        
        for commit in commits:
            commit_message = commit.get("message", "")
            commit_url = commit.get("url", "")
            author = commit.get("author", {}).get("name", "Unknown")
            commit_sha = commit.get("id", "")[:7]
            
            task_ids = self.extract_task_ids(commit_message)
            
            for task_id in task_ids:
                task = await self.get_task_by_id(task_id, tenant_id)
                if not task:
                    continue
                
                # Check if project has GitHub integration enabled
                config = await self.get_project_github_config(task.get("project_id"), tenant_id)
                if not config:
                    continue
                
                # Add activity and comment
                await self.add_github_activity(
                    task_id, tenant_id, "commit",
                    f"Commit {commit_sha}: {commit_message[:50]}",
                    commit_url, author,
                    {"sha": commit.get("id"), "repo": repo_name}
                )
                
                await self.add_github_comment(
                    task_id, tenant_id, "commit",
                    f"{commit_sha} - {commit_message[:100]}",
                    commit_url, author
                )
                
                results["linked_tasks"].append(task_id)
            
            results["processed_commits"] += 1
        
        return results
    
    async def handle_pull_request_event(self, payload: Dict, tenant_id: str) -> Dict[str, Any]:
        """Handle GitHub pull request event"""
        results = {
            "action": payload.get("action"),
            "linked_tasks": [],
            "status_updates": [],
            "errors": []
        }
        
        action = payload.get("action")
        pr = payload.get("pull_request", {})
        
        pr_number = pr.get("number")
        pr_title = pr.get("title", "")
        pr_body = pr.get("body", "") or ""
        pr_url = pr.get("html_url", "")
        pr_author = pr.get("user", {}).get("login", "Unknown")
        merged = pr.get("merged", False)
        repo_name = payload.get("repository", {}).get("full_name", "Unknown")
        
        # Extract task IDs from title and body
        task_ids = self.extract_task_ids(pr_title) + self.extract_task_ids(pr_body)
        task_ids = list(set(task_ids))  # Remove duplicates
        
        for task_id in task_ids:
            task = await self.get_task_by_id(task_id, tenant_id)
            if not task:
                continue
            
            # Check if project has GitHub integration enabled
            config = await self.get_project_github_config(task.get("project_id"), tenant_id)
            if not config:
                continue
            
            if action == "opened":
                # PR opened
                await self.add_github_activity(
                    task_id, tenant_id, "pr_opened",
                    f"PR #{pr_number}: {pr_title}",
                    pr_url, pr_author,
                    {"pr_number": pr_number, "repo": repo_name}
                )
                
                await self.add_github_comment(
                    task_id, tenant_id, "pr_opened",
                    f"PR #{pr_number}: {pr_title}",
                    pr_url, pr_author
                )
                
                results["linked_tasks"].append(task_id)
                
            elif action == "closed" and merged:
                # PR merged
                await self.add_github_activity(
                    task_id, tenant_id, "pr_merged",
                    f"PR #{pr_number} merged: {pr_title}",
                    pr_url, pr_author,
                    {"pr_number": pr_number, "repo": repo_name, "merged": True}
                )
                
                await self.add_github_comment(
                    task_id, tenant_id, "pr_merged",
                    f"PR #{pr_number} merged: {pr_title}",
                    pr_url, pr_author
                )
                
                # Auto-move to Done if configured
                if config.get("auto_complete_on_merge", False):
                    await self.update_task_status(task_id, tenant_id, "done")
                    results["status_updates"].append({
                        "task_id": task_id,
                        "new_status": "done"
                    })
                
                results["linked_tasks"].append(task_id)
        
        return results


class GitHubWebhookHandler:
    """Handler for GitHub webhook events"""
    
    def __init__(self, github_service: GitHubService):
        self.github = github_service
    
    async def handle_webhook(
        self,
        event_type: str,
        payload: Dict,
        tenant_id: str
    ) -> Dict[str, Any]:
        """Route webhook to appropriate handler"""
        
        if event_type == "push":
            return await self.github.handle_push_event(payload, tenant_id)
        
        elif event_type == "pull_request":
            return await self.github.handle_pull_request_event(payload, tenant_id)
        
        else:
            return {
                "status": "ignored",
                "reason": f"Event type '{event_type}' not supported"
            }
