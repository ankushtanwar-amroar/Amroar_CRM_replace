"""
SLA Tracking Service for Task Manager
Handles SLA timer management, breach detection, and reporting
"""
import logging
from typing import Dict, Any, Optional, List, Tuple
from datetime import datetime, timezone, timedelta
import uuid

logger = logging.getLogger(__name__)


class SLAStatus:
    """SLA status constants"""
    ON_TRACK = "on_track"       # Green - plenty of time
    AT_RISK = "at_risk"         # Yellow - < 25% time remaining
    BREACHED = "breached"       # Red - exceeded SLA
    PAUSED = "paused"           # Gray - timer paused (blocked)
    NOT_APPLICABLE = "n/a"      # No SLA configured


class SLAService:
    """
    Service for SLA tracking on tasks.
    
    SLA fields on task:
    - sla_hours: Target resolution time in hours
    - sla_started_at: When SLA timer started
    - sla_paused_at: When timer was paused (if blocked)
    - sla_total_paused_minutes: Accumulated pause time
    - sla_breach_at: When SLA was breached (if applicable)
    
    SLA config on project:
    - sla_default_hours: Default SLA for new tasks
    - sla_start_trigger: "creation" or "status_change"
    - sla_pause_statuses: List of statuses that pause SLA (default: ["blocked"])
    """
    
    DEFAULT_PAUSE_STATUSES = ["blocked"]
    AT_RISK_THRESHOLD = 0.25  # 25% time remaining
    
    def __init__(self, db):
        self.db = db
    
    async def get_project_sla_config(
        self,
        project_id: str,
        tenant_id: str
    ) -> Dict[str, Any]:
        """Get SLA configuration for a project"""
        project = await self.db.tm_projects.find_one(
            {"id": project_id, "tenant_id": tenant_id},
            {"_id": 0, "sla_default_hours": 1, "sla_start_trigger": 1, "sla_pause_statuses": 1, "sla_enabled": 1}
        )
        
        if not project:
            return {
                "sla_enabled": False,
                "sla_default_hours": None,
                "sla_start_trigger": "creation",
                "sla_pause_statuses": self.DEFAULT_PAUSE_STATUSES
            }
        
        return {
            "sla_enabled": project.get("sla_enabled", False),
            "sla_default_hours": project.get("sla_default_hours"),
            "sla_start_trigger": project.get("sla_start_trigger", "creation"),
            "sla_pause_statuses": project.get("sla_pause_statuses", self.DEFAULT_PAUSE_STATUSES)
        }
    
    def calculate_sla_status(
        self,
        task: Dict[str, Any],
        pause_statuses: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """
        Calculate current SLA status for a task.
        
        Returns:
        {
            "status": "on_track" | "at_risk" | "breached" | "paused" | "n/a",
            "sla_hours": float,
            "elapsed_minutes": int,
            "remaining_minutes": int,
            "percent_used": float,
            "breach_at": datetime (if applicable)
        }
        """
        pause_statuses = pause_statuses or self.DEFAULT_PAUSE_STATUSES
        
        sla_hours = task.get("sla_hours")
        sla_started_at = task.get("sla_started_at")
        
        # No SLA configured
        if not sla_hours or not sla_started_at:
            return {
                "status": SLAStatus.NOT_APPLICABLE,
                "sla_hours": None,
                "elapsed_minutes": 0,
                "remaining_minutes": 0,
                "percent_used": 0,
                "breach_at": None
            }
        
        # Ensure datetime objects with timezone
        if isinstance(sla_started_at, str):
            sla_started_at = datetime.fromisoformat(sla_started_at.replace('Z', '+00:00'))
        elif isinstance(sla_started_at, datetime) and sla_started_at.tzinfo is None:
            # Make naive datetime timezone-aware (assume UTC)
            sla_started_at = sla_started_at.replace(tzinfo=timezone.utc)
        
        now = datetime.now(timezone.utc)
        
        # Check if currently paused
        current_status = task.get("status", "")
        is_paused = current_status in pause_statuses
        
        # Calculate elapsed time (excluding paused time)
        total_paused_minutes = task.get("sla_total_paused_minutes", 0)
        
        # If currently paused, add time since pause started
        sla_paused_at = task.get("sla_paused_at")
        if is_paused and sla_paused_at:
            if isinstance(sla_paused_at, str):
                sla_paused_at = datetime.fromisoformat(sla_paused_at.replace('Z', '+00:00'))
            elif isinstance(sla_paused_at, datetime) and sla_paused_at.tzinfo is None:
                sla_paused_at = sla_paused_at.replace(tzinfo=timezone.utc)
            elapsed_since_started = (now - sla_started_at).total_seconds() / 60
            current_pause_duration = (now - sla_paused_at).total_seconds() / 60
            elapsed_minutes = int(elapsed_since_started - total_paused_minutes - current_pause_duration)
        else:
            elapsed_since_started = (now - sla_started_at).total_seconds() / 60
            elapsed_minutes = int(elapsed_since_started - total_paused_minutes)
        
        # Calculate SLA target in minutes
        sla_minutes = sla_hours * 60
        remaining_minutes = max(0, sla_minutes - elapsed_minutes)
        percent_used = min(100, (elapsed_minutes / sla_minutes) * 100) if sla_minutes > 0 else 100
        
        # Calculate breach time
        breach_at = sla_started_at + timedelta(minutes=sla_minutes + total_paused_minutes)
        
        # Determine status
        if is_paused:
            status = SLAStatus.PAUSED
        elif elapsed_minutes >= sla_minutes:
            status = SLAStatus.BREACHED
        elif (remaining_minutes / sla_minutes) <= self.AT_RISK_THRESHOLD:
            status = SLAStatus.AT_RISK
        else:
            status = SLAStatus.ON_TRACK
        
        return {
            "status": status,
            "sla_hours": sla_hours,
            "elapsed_minutes": elapsed_minutes,
            "remaining_minutes": remaining_minutes,
            "percent_used": round(percent_used, 1),
            "breach_at": breach_at.isoformat() if breach_at else None
        }
    
    async def initialize_sla(
        self,
        task: Dict[str, Any],
        tenant_id: str,
        trigger: str = "creation"
    ) -> Dict[str, Any]:
        """
        Initialize SLA tracking for a task.
        
        Args:
            task: Task document
            tenant_id: Tenant ID
            trigger: "creation" or "status_change"
        
        Returns updated SLA fields
        """
        project_id = task.get("project_id")
        if not project_id:
            return {}
        
        config = await self.get_project_sla_config(project_id, tenant_id)
        
        if not config.get("sla_enabled") or not config.get("sla_default_hours"):
            return {}
        
        # Check if trigger matches config
        if config.get("sla_start_trigger") != trigger:
            return {}
        
        # Don't re-initialize if already started
        if task.get("sla_started_at"):
            return {}
        
        now = datetime.now(timezone.utc)
        
        return {
            "sla_hours": config.get("sla_default_hours"),
            "sla_started_at": now,
            "sla_paused_at": None,
            "sla_total_paused_minutes": 0,
            "sla_breach_at": None
        }
    
    async def handle_status_change(
        self,
        task: Dict[str, Any],
        old_status: str,
        new_status: str,
        tenant_id: str
    ) -> Dict[str, Any]:
        """
        Handle SLA updates when task status changes.
        
        - Pause SLA when entering blocked status
        - Resume SLA when leaving blocked status
        - Start SLA if trigger is "status_change" and task first becomes active
        
        Returns updated SLA fields
        """
        project_id = task.get("project_id")
        if not project_id:
            return {}
        
        config = await self.get_project_sla_config(project_id, tenant_id)
        
        if not config.get("sla_enabled"):
            return {}
        
        pause_statuses = config.get("sla_pause_statuses", self.DEFAULT_PAUSE_STATUSES)
        now = datetime.now(timezone.utc)
        
        updates = {}
        
        # Check if SLA should start on status change
        if config.get("sla_start_trigger") == "status_change":
            if not task.get("sla_started_at") and new_status not in ["todo", "blocked"]:
                default_hours = config.get("sla_default_hours")
                if default_hours:
                    updates.update({
                        "sla_hours": default_hours,
                        "sla_started_at": now,
                        "sla_paused_at": None,
                        "sla_total_paused_minutes": 0
                    })
        
        # Handle pause/resume
        was_paused = old_status in pause_statuses
        is_paused = new_status in pause_statuses
        
        if not was_paused and is_paused:
            # Entering pause status
            updates["sla_paused_at"] = now
            
        elif was_paused and not is_paused:
            # Leaving pause status
            paused_at = task.get("sla_paused_at")
            if paused_at:
                if isinstance(paused_at, str):
                    paused_at = datetime.fromisoformat(paused_at.replace('Z', '+00:00'))
                pause_duration = (now - paused_at).total_seconds() / 60
                current_total = task.get("sla_total_paused_minutes", 0)
                updates["sla_total_paused_minutes"] = current_total + int(pause_duration)
            updates["sla_paused_at"] = None
        
        # Check for breach
        if task.get("sla_started_at") and not task.get("sla_breach_at"):
            sla_status = self.calculate_sla_status(
                {**task, **updates},
                pause_statuses
            )
            if sla_status["status"] == SLAStatus.BREACHED:
                updates["sla_breach_at"] = now
        
        return updates
    
    async def get_sla_dashboard_data(
        self,
        tenant_id: str,
        project_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Get SLA statistics for dashboard"""
        query = {
            "tenant_id": tenant_id,
            "is_active": True,
            "sla_hours": {"$exists": True, "$ne": None},
            "status": {"$ne": "done"}
        }
        
        if project_id:
            query["project_id"] = project_id
        
        tasks = await self.db.tm_tasks.find(query, {"_id": 0}).to_list(1000)
        
        stats = {
            "on_track": 0,
            "at_risk": 0,
            "breached": 0,
            "paused": 0,
            "total_with_sla": len(tasks)
        }
        
        breached_tasks = []
        at_risk_tasks = []
        
        for task in tasks:
            sla_info = self.calculate_sla_status(task)
            status = sla_info.get("status")
            
            if status == SLAStatus.ON_TRACK:
                stats["on_track"] += 1
            elif status == SLAStatus.AT_RISK:
                stats["at_risk"] += 1
                at_risk_tasks.append({
                    "id": task.get("id"),
                    "title": task.get("title"),
                    "remaining_minutes": sla_info.get("remaining_minutes"),
                    "percent_used": sla_info.get("percent_used")
                })
            elif status == SLAStatus.BREACHED:
                stats["breached"] += 1
                breached_tasks.append({
                    "id": task.get("id"),
                    "title": task.get("title"),
                    "elapsed_minutes": sla_info.get("elapsed_minutes"),
                    "sla_hours": sla_info.get("sla_hours"),
                    "breach_at": task.get("sla_breach_at")
                })
            elif status == SLAStatus.PAUSED:
                stats["paused"] += 1
        
        return {
            "stats": stats,
            "breached_tasks": breached_tasks[:10],  # Top 10
            "at_risk_tasks": at_risk_tasks[:10]
        }
