"""
Advanced Reports Service - Phase 15
Provides comprehensive reporting with exports and scheduling.
"""
import logging
import csv
import io
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any, List
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter, A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT

logger = logging.getLogger(__name__)


class AdvancedReportsService:
    """Service for generating advanced reports with exports"""
    
    def __init__(self, db):
        self.db = db
    
    # =========================================================================
    # REPORT 1: TASK PERFORMANCE REPORT
    # =========================================================================
    
    async def get_task_performance_report(
        self,
        tenant_id: str,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        project_id: Optional[str] = None,
        assignee_id: Optional[str] = None,
        status: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Task Performance Report
        - Tasks created vs completed
        - Average cycle time
        - Breakdown by project, assignee, status, priority
        """
        # Build base match filter
        match_filter = {"tenant_id": tenant_id, "is_active": True}
        
        if start_date:
            match_filter["created_at"] = {"$gte": start_date}
        if end_date:
            if "created_at" in match_filter:
                match_filter["created_at"]["$lte"] = end_date
            else:
                match_filter["created_at"] = {"$lte": end_date}
        if project_id:
            match_filter["project_id"] = project_id
        if assignee_id:
            match_filter["assignee_id"] = assignee_id
        if status:
            match_filter["status"] = status
        
        # Get all tasks matching filter
        tasks = await self.db.tm_tasks.find(match_filter, {"_id": 0}).to_list(10000)
        
        # Calculate metrics
        total_created = len(tasks)
        completed_tasks = [t for t in tasks if t.get("status") == "done"]
        total_completed = len(completed_tasks)
        
        # Calculate cycle time (created to done)
        cycle_times = []
        for task in completed_tasks:
            created = task.get("created_at")
            updated = task.get("updated_at")  # Approximate completion time
            if created and updated:
                if isinstance(created, str):
                    created = datetime.fromisoformat(created.replace("Z", "+00:00"))
                if isinstance(updated, str):
                    updated = datetime.fromisoformat(updated.replace("Z", "+00:00"))
                hours = (updated - created).total_seconds() / 3600
                if hours >= 0:
                    cycle_times.append(hours)
        
        avg_cycle_hours = round(sum(cycle_times) / len(cycle_times), 2) if cycle_times else 0
        avg_cycle_days = round(avg_cycle_hours / 24, 2)
        
        # Breakdown by status
        status_breakdown = {}
        for task in tasks:
            s = task.get("status", "unknown")
            status_breakdown[s] = status_breakdown.get(s, 0) + 1
        
        # Breakdown by priority
        priority_breakdown = {}
        for task in tasks:
            p = task.get("priority", "medium")
            priority_breakdown[p] = priority_breakdown.get(p, 0) + 1
        
        # Breakdown by project
        project_ids = list(set(t.get("project_id") for t in tasks if t.get("project_id")))
        projects = await self.db.tm_projects.find(
            {"id": {"$in": project_ids}},
            {"id": 1, "name": 1, "_id": 0}
        ).to_list(100)
        project_names = {p["id"]: p["name"] for p in projects}
        
        project_breakdown = {}
        for task in tasks:
            pid = task.get("project_id")
            pname = project_names.get(pid, "Unknown")
            if pname not in project_breakdown:
                project_breakdown[pname] = {"total": 0, "completed": 0}
            project_breakdown[pname]["total"] += 1
            if task.get("status") == "done":
                project_breakdown[pname]["completed"] += 1
        
        # Breakdown by assignee
        assignee_ids = list(set(t.get("assignee_id") for t in tasks if t.get("assignee_id")))
        assignees = await self.db.users.find(
            {"id": {"$in": assignee_ids}},
            {"id": 1, "first_name": 1, "last_name": 1, "email": 1, "_id": 0}
        ).to_list(100)
        assignee_names = {a["id"]: f"{a.get('first_name', '')} {a.get('last_name', '')}".strip() or a.get("email", "Unknown") for a in assignees}
        
        assignee_breakdown = {}
        for task in tasks:
            aid = task.get("assignee_id")
            aname = assignee_names.get(aid, "Unassigned") if aid else "Unassigned"
            if aname not in assignee_breakdown:
                assignee_breakdown[aname] = {"total": 0, "completed": 0}
            assignee_breakdown[aname]["total"] += 1
            if task.get("status") == "done":
                assignee_breakdown[aname]["completed"] += 1
        
        # Trend data (tasks created/completed per day)
        trend_data = await self._get_task_trend(tenant_id, start_date, end_date, project_id)
        
        return {
            "report_type": "task_performance",
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "filters": {
                "start_date": start_date.isoformat() if start_date else None,
                "end_date": end_date.isoformat() if end_date else None,
                "project_id": project_id,
                "assignee_id": assignee_id,
                "status": status
            },
            "summary": {
                "total_created": total_created,
                "total_completed": total_completed,
                "completion_rate": round((total_completed / total_created * 100), 1) if total_created > 0 else 0,
                "avg_cycle_time_hours": avg_cycle_hours,
                "avg_cycle_time_days": avg_cycle_days
            },
            "by_status": [{"status": k, "count": v} for k, v in status_breakdown.items()],
            "by_priority": [{"priority": k, "count": v} for k, v in priority_breakdown.items()],
            "by_project": [{"project": k, **v, "completion_rate": round((v["completed"]/v["total"]*100), 1) if v["total"] > 0 else 0} for k, v in project_breakdown.items()],
            "by_assignee": [{"assignee": k, **v, "completion_rate": round((v["completed"]/v["total"]*100), 1) if v["total"] > 0 else 0} for k, v in assignee_breakdown.items()],
            "trend": trend_data
        }
    
    async def _get_task_trend(
        self,
        tenant_id: str,
        start_date: Optional[datetime],
        end_date: Optional[datetime],
        project_id: Optional[str]
    ) -> List[Dict[str, Any]]:
        """Get task creation/completion trend by day"""
        if not start_date:
            start_date = datetime.now(timezone.utc) - timedelta(days=30)
        if not end_date:
            end_date = datetime.now(timezone.utc)
        
        match_filter = {
            "tenant_id": tenant_id,
            "is_active": True,
            "created_at": {"$gte": start_date, "$lte": end_date}
        }
        if project_id:
            match_filter["project_id"] = project_id
        
        pipeline = [
            {"$match": match_filter},
            {"$group": {
                "_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$created_at"}},
                "created": {"$sum": 1},
                "completed": {"$sum": {"$cond": [{"$eq": ["$status", "done"]}, 1, 0]}}
            }},
            {"$sort": {"_id": 1}}
        ]
        
        results = await self.db.tm_tasks.aggregate(pipeline).to_list(100)
        return [{"date": r["_id"], "created": r["created"], "completed": r["completed"]} for r in results]
    
    # =========================================================================
    # REPORT 2: TIME TRACKING REPORT
    # =========================================================================
    
    async def get_time_tracking_report(
        self,
        tenant_id: str,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        project_id: Optional[str] = None,
        user_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Time Tracking Report
        - Total time logged
        - Time by project, task, user
        - Date range filtering
        """
        match_filter = {"tenant_id": tenant_id, "is_active": True}
        
        if start_date:
            match_filter["logged_date"] = {"$gte": start_date}
        if end_date:
            if "logged_date" in match_filter:
                match_filter["logged_date"]["$lte"] = end_date
            else:
                match_filter["logged_date"] = {"$lte": end_date}
        if project_id:
            match_filter["project_id"] = project_id
        if user_id:
            match_filter["user_id"] = user_id
        
        # Get all time entries
        entries = await self.db.tm_time_entries.find(match_filter, {"_id": 0}).to_list(10000)
        
        # Total time
        total_minutes = sum(e.get("duration_minutes", 0) for e in entries)
        total_hours = round(total_minutes / 60, 2)
        
        # Time by project
        project_ids = list(set(e.get("project_id") for e in entries if e.get("project_id")))
        projects = await self.db.tm_projects.find(
            {"id": {"$in": project_ids}},
            {"id": 1, "name": 1, "color": 1, "_id": 0}
        ).to_list(100)
        project_info = {p["id"]: {"name": p["name"], "color": p.get("color", "#6B7280")} for p in projects}
        
        by_project = {}
        for entry in entries:
            pid = entry.get("project_id")
            pinfo = project_info.get(pid, {"name": "Unknown", "color": "#6B7280"})
            pname = pinfo["name"]
            if pname not in by_project:
                by_project[pname] = {"minutes": 0, "entries": 0, "color": pinfo["color"]}
            by_project[pname]["minutes"] += entry.get("duration_minutes", 0)
            by_project[pname]["entries"] += 1
        
        by_project_list = [
            {"project": k, "hours": round(v["minutes"]/60, 2), "minutes": v["minutes"], "entries": v["entries"], "color": v["color"]}
            for k, v in sorted(by_project.items(), key=lambda x: x[1]["minutes"], reverse=True)
        ]
        
        # Time by task
        task_ids = list(set(e.get("task_id") for e in entries if e.get("task_id")))
        tasks = await self.db.tm_tasks.find(
            {"id": {"$in": task_ids}},
            {"id": 1, "title": 1, "_id": 0}
        ).to_list(500)
        task_names = {t["id"]: t["title"] for t in tasks}
        
        by_task = {}
        for entry in entries:
            tid = entry.get("task_id")
            tname = task_names.get(tid, "Unknown")
            if tname not in by_task:
                by_task[tname] = {"minutes": 0, "entries": 0, "task_id": tid}
            by_task[tname]["minutes"] += entry.get("duration_minutes", 0)
            by_task[tname]["entries"] += 1
        
        by_task_list = [
            {"task": k, "task_id": v["task_id"], "hours": round(v["minutes"]/60, 2), "minutes": v["minutes"], "entries": v["entries"]}
            for k, v in sorted(by_task.items(), key=lambda x: x[1]["minutes"], reverse=True)[:20]  # Top 20
        ]
        
        # Time by user
        user_ids = list(set(e.get("user_id") for e in entries if e.get("user_id")))
        users = await self.db.users.find(
            {"id": {"$in": user_ids}},
            {"id": 1, "first_name": 1, "last_name": 1, "email": 1, "_id": 0}
        ).to_list(100)
        user_names = {u["id"]: f"{u.get('first_name', '')} {u.get('last_name', '')}".strip() or u.get("email", "Unknown") for u in users}
        
        by_user = {}
        for entry in entries:
            uid = entry.get("user_id")
            uname = user_names.get(uid, "Unknown")
            if uname not in by_user:
                by_user[uname] = {"minutes": 0, "entries": 0, "user_id": uid}
            by_user[uname]["minutes"] += entry.get("duration_minutes", 0)
            by_user[uname]["entries"] += 1
        
        by_user_list = [
            {"user": k, "user_id": v["user_id"], "hours": round(v["minutes"]/60, 2), "minutes": v["minutes"], "entries": v["entries"]}
            for k, v in sorted(by_user.items(), key=lambda x: x[1]["minutes"], reverse=True)
        ]
        
        # Daily trend
        daily_trend = await self._get_time_daily_trend(tenant_id, start_date, end_date, project_id, user_id)
        
        return {
            "report_type": "time_tracking",
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "filters": {
                "start_date": start_date.isoformat() if start_date else None,
                "end_date": end_date.isoformat() if end_date else None,
                "project_id": project_id,
                "user_id": user_id
            },
            "summary": {
                "total_hours": total_hours,
                "total_minutes": total_minutes,
                "total_entries": len(entries)
            },
            "by_project": by_project_list,
            "by_task": by_task_list,
            "by_user": by_user_list,
            "daily_trend": daily_trend
        }
    
    async def _get_time_daily_trend(
        self,
        tenant_id: str,
        start_date: Optional[datetime],
        end_date: Optional[datetime],
        project_id: Optional[str],
        user_id: Optional[str]
    ) -> List[Dict[str, Any]]:
        """Get time logged per day"""
        match_filter = {"tenant_id": tenant_id, "is_active": True}
        
        if start_date:
            match_filter["logged_date"] = {"$gte": start_date}
        if end_date:
            if "logged_date" in match_filter:
                match_filter["logged_date"]["$lte"] = end_date
            else:
                match_filter["logged_date"] = {"$lte": end_date}
        if project_id:
            match_filter["project_id"] = project_id
        if user_id:
            match_filter["user_id"] = user_id
        
        pipeline = [
            {"$match": match_filter},
            {"$group": {
                "_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$logged_date"}},
                "minutes": {"$sum": "$duration_minutes"},
                "entries": {"$sum": 1}
            }},
            {"$sort": {"_id": 1}}
        ]
        
        results = await self.db.tm_time_entries.aggregate(pipeline).to_list(100)
        return [{"date": r["_id"], "hours": round(r["minutes"]/60, 2), "minutes": r["minutes"], "entries": r["entries"]} for r in results]
    
    # =========================================================================
    # REPORT 3: SLA COMPLIANCE REPORT
    # =========================================================================
    
    async def get_sla_compliance_report(
        self,
        tenant_id: str,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        project_id: Optional[str] = None,
        priority: Optional[str] = None,
        assignee_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        SLA Compliance Report
        - SLA met vs breached
        - Breach percentage
        - Breakdown by project, priority, assignee
        """
        match_filter = {"tenant_id": tenant_id, "is_active": True}
        
        if start_date:
            match_filter["created_at"] = {"$gte": start_date}
        if end_date:
            if "created_at" in match_filter:
                match_filter["created_at"]["$lte"] = end_date
            else:
                match_filter["created_at"] = {"$lte": end_date}
        if project_id:
            match_filter["project_id"] = project_id
        if priority:
            match_filter["priority"] = priority
        if assignee_id:
            match_filter["assignee_id"] = assignee_id
        
        # Only get tasks with SLA tracking
        match_filter["sla_breach_at"] = {"$ne": None}
        
        tasks = await self.db.tm_tasks.find(match_filter, {"_id": 0}).to_list(10000)
        
        now = datetime.now(timezone.utc)
        
        # Calculate SLA metrics
        total_with_sla = len(tasks)
        breached = 0
        met = 0
        at_risk = 0
        
        for task in tasks:
            sla_status = task.get("sla_status", "on_track")
            if sla_status == "breached":
                breached += 1
            elif sla_status == "at_risk":
                at_risk += 1
            else:
                # Check if breach time has passed
                breach_at = task.get("sla_breach_at")
                if breach_at:
                    if isinstance(breach_at, str):
                        breach_at = datetime.fromisoformat(breach_at.replace("Z", "+00:00"))
                    if breach_at < now and task.get("status") != "done":
                        breached += 1
                    else:
                        met += 1
                else:
                    met += 1
        
        breach_rate = round((breached / total_with_sla * 100), 1) if total_with_sla > 0 else 0
        
        # Breakdown by project
        project_ids = list(set(t.get("project_id") for t in tasks if t.get("project_id")))
        projects = await self.db.tm_projects.find(
            {"id": {"$in": project_ids}},
            {"id": 1, "name": 1, "_id": 0}
        ).to_list(100)
        project_names = {p["id"]: p["name"] for p in projects}
        
        by_project = {}
        for task in tasks:
            pid = task.get("project_id")
            pname = project_names.get(pid, "Unknown")
            if pname not in by_project:
                by_project[pname] = {"total": 0, "breached": 0, "met": 0}
            by_project[pname]["total"] += 1
            if task.get("sla_status") == "breached":
                by_project[pname]["breached"] += 1
            else:
                by_project[pname]["met"] += 1
        
        by_project_list = [
            {"project": k, **v, "breach_rate": round((v["breached"]/v["total"]*100), 1) if v["total"] > 0 else 0}
            for k, v in sorted(by_project.items(), key=lambda x: x[1]["breached"], reverse=True)
        ]
        
        # Breakdown by priority
        by_priority = {}
        for task in tasks:
            p = task.get("priority", "medium")
            if p not in by_priority:
                by_priority[p] = {"total": 0, "breached": 0, "met": 0}
            by_priority[p]["total"] += 1
            if task.get("sla_status") == "breached":
                by_priority[p]["breached"] += 1
            else:
                by_priority[p]["met"] += 1
        
        by_priority_list = [
            {"priority": k, **v, "breach_rate": round((v["breached"]/v["total"]*100), 1) if v["total"] > 0 else 0}
            for k, v in by_priority.items()
        ]
        
        # Breakdown by assignee
        assignee_ids = list(set(t.get("assignee_id") for t in tasks if t.get("assignee_id")))
        assignees = await self.db.users.find(
            {"id": {"$in": assignee_ids}},
            {"id": 1, "first_name": 1, "last_name": 1, "email": 1, "_id": 0}
        ).to_list(100)
        assignee_names = {a["id"]: f"{a.get('first_name', '')} {a.get('last_name', '')}".strip() or a.get("email", "Unknown") for a in assignees}
        
        by_assignee = {}
        for task in tasks:
            aid = task.get("assignee_id")
            aname = assignee_names.get(aid, "Unassigned") if aid else "Unassigned"
            if aname not in by_assignee:
                by_assignee[aname] = {"total": 0, "breached": 0, "met": 0}
            by_assignee[aname]["total"] += 1
            if task.get("sla_status") == "breached":
                by_assignee[aname]["breached"] += 1
            else:
                by_assignee[aname]["met"] += 1
        
        by_assignee_list = [
            {"assignee": k, **v, "breach_rate": round((v["breached"]/v["total"]*100), 1) if v["total"] > 0 else 0}
            for k, v in sorted(by_assignee.items(), key=lambda x: x[1]["breached"], reverse=True)
        ]
        
        # Breached tasks details
        breached_tasks = [
            {
                "id": t["id"],
                "title": t["title"],
                "status": t.get("status"),
                "priority": t.get("priority"),
                "sla_breach_at": t.get("sla_breach_at")
            }
            for t in tasks if t.get("sla_status") == "breached"
        ][:20]  # Top 20
        
        return {
            "report_type": "sla_compliance",
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "filters": {
                "start_date": start_date.isoformat() if start_date else None,
                "end_date": end_date.isoformat() if end_date else None,
                "project_id": project_id,
                "priority": priority,
                "assignee_id": assignee_id
            },
            "summary": {
                "total_with_sla": total_with_sla,
                "met": met,
                "breached": breached,
                "at_risk": at_risk,
                "breach_rate": breach_rate,
                "compliance_rate": round(100 - breach_rate, 1)
            },
            "by_project": by_project_list,
            "by_priority": by_priority_list,
            "by_assignee": by_assignee_list,
            "breached_tasks": breached_tasks
        }
    
    # =========================================================================
    # REPORT 4: RECURRING TASKS REPORT
    # =========================================================================
    
    async def get_recurring_tasks_report(
        self,
        tenant_id: str,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        project_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Recurring Tasks Report
        - Tasks generated by recurrence
        - Active vs paused rules
        - Failures / skipped runs
        """
        # Get recurrence rules
        rule_filter = {"tenant_id": tenant_id, "is_active": True}
        if project_id:
            rule_filter["project_id"] = project_id
        
        rules = await self.db.tm_recurrence_rules.find(rule_filter, {"_id": 0}).to_list(1000)
        
        active_rules = len([r for r in rules if not r.get("is_paused")])
        paused_rules = len([r for r in rules if r.get("is_paused")])
        
        # Get generated tasks
        task_filter = {"tenant_id": tenant_id, "is_active": True, "is_recurring_generated": True}
        if project_id:
            task_filter["project_id"] = project_id
        if start_date:
            task_filter["created_at"] = {"$gte": start_date}
        if end_date:
            if "created_at" in task_filter:
                task_filter["created_at"]["$lte"] = end_date
            else:
                task_filter["created_at"] = {"$lte": end_date}
        
        generated_tasks = await self.db.tm_tasks.find(task_filter, {"_id": 0}).to_list(10000)
        total_generated = len(generated_tasks)
        
        # Get recurrence logs for failures
        log_filter = {"tenant_id": tenant_id}
        if start_date:
            log_filter["created_at"] = {"$gte": start_date}
        if end_date:
            if "created_at" in log_filter:
                log_filter["created_at"]["$lte"] = end_date
            else:
                log_filter["created_at"] = {"$lte": end_date}
        
        logs = await self.db.tm_recurrence_logs.find(log_filter, {"_id": 0}).to_list(1000)
        successful_runs = len([l for l in logs if l.get("activity_type") == "task_generated"])
        failed_runs = len([l for l in logs if l.get("activity_type") == "generation_failed"])
        skipped_runs = len([l for l in logs if l.get("activity_type") == "generation_skipped"])
        
        # Rules summary
        rules_summary = []
        for rule in rules:
            rules_summary.append({
                "id": rule["id"],
                "name": rule["name"],
                "recurrence_type": rule.get("recurrence_type"),
                "is_paused": rule.get("is_paused", False),
                "run_count": rule.get("run_count", 0),
                "last_run_at": rule.get("last_run_at"),
                "next_run_at": rule.get("next_run_at")
            })
        
        # Tasks by recurrence type
        by_type = {}
        for rule in rules:
            rtype = rule.get("recurrence_type", "unknown")
            if rtype not in by_type:
                by_type[rtype] = {"rules": 0, "generated": 0}
            by_type[rtype]["rules"] += 1
            by_type[rtype]["generated"] += rule.get("run_count", 0)
        
        by_type_list = [{"type": k, **v} for k, v in by_type.items()]
        
        # Generated tasks trend
        trend_pipeline = [
            {"$match": task_filter},
            {"$group": {
                "_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$created_at"}},
                "count": {"$sum": 1}
            }},
            {"$sort": {"_id": 1}}
        ]
        trend_results = await self.db.tm_tasks.aggregate(trend_pipeline).to_list(100)
        trend = [{"date": r["_id"], "generated": r["count"]} for r in trend_results]
        
        return {
            "report_type": "recurring_tasks",
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "filters": {
                "start_date": start_date.isoformat() if start_date else None,
                "end_date": end_date.isoformat() if end_date else None,
                "project_id": project_id
            },
            "summary": {
                "total_rules": len(rules),
                "active_rules": active_rules,
                "paused_rules": paused_rules,
                "total_generated": total_generated,
                "successful_runs": successful_runs,
                "failed_runs": failed_runs,
                "skipped_runs": skipped_runs,
                "success_rate": round((successful_runs / (successful_runs + failed_runs) * 100), 1) if (successful_runs + failed_runs) > 0 else 100
            },
            "by_type": by_type_list,
            "rules": rules_summary,
            "trend": trend
        }
    
    # =========================================================================
    # REPORT 5: APPROVAL ANALYTICS (EXTENDED)
    # =========================================================================
    
    async def get_approval_analytics_report(
        self,
        tenant_id: str,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        project_id: Optional[str] = None,
        workflow_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Extended Approval Analytics Report
        - Reuses Phase 10 data
        - Includes trend comparisons
        - Export-ready tables
        """
        # Build match filter
        match_filter = {"tenant_id": tenant_id}
        
        if start_date:
            match_filter["created_at"] = {"$gte": start_date}
        if end_date:
            if "created_at" in match_filter:
                match_filter["created_at"]["$lte"] = end_date
            else:
                match_filter["created_at"] = {"$lte": end_date}
        if workflow_id:
            match_filter["workflow_id"] = workflow_id
        
        # Filter by project if needed
        task_ids = None
        if project_id:
            tasks = await self.db.tm_tasks.find(
                {"project_id": project_id, "tenant_id": tenant_id},
                {"id": 1}
            ).to_list(10000)
            task_ids = [t["id"] for t in tasks]
            match_filter["task_id"] = {"$in": task_ids}
        
        instances = await self.db.tm_approval_instances.find(match_filter, {"_id": 0}).to_list(10000)
        
        # Volume metrics
        total = len(instances)
        approved = len([i for i in instances if i.get("status") == "approved"])
        rejected = len([i for i in instances if i.get("status") == "rejected"])
        pending = len([i for i in instances if i.get("status") == "pending"])
        
        approval_rate = round((approved / total * 100), 1) if total > 0 else 0
        rejection_rate = round((rejected / total * 100), 1) if total > 0 else 0
        
        # Turnaround time calculation
        turnaround_hours = []
        for inst in instances:
            if inst.get("status") in ["approved", "rejected"] and inst.get("completed_at"):
                created = inst.get("created_at")
                completed = inst.get("completed_at")
                if created and completed:
                    if isinstance(created, str):
                        created = datetime.fromisoformat(created.replace("Z", "+00:00"))
                    if isinstance(completed, str):
                        completed = datetime.fromisoformat(completed.replace("Z", "+00:00"))
                    hours = (completed - created).total_seconds() / 3600
                    if hours >= 0:
                        turnaround_hours.append(hours)
        
        avg_turnaround = round(sum(turnaround_hours) / len(turnaround_hours), 2) if turnaround_hours else 0
        
        # By workflow
        by_workflow = {}
        for inst in instances:
            wf_name = inst.get("workflow_name", "Unknown")
            if wf_name not in by_workflow:
                by_workflow[wf_name] = {"total": 0, "approved": 0, "rejected": 0, "pending": 0}
            by_workflow[wf_name]["total"] += 1
            status = inst.get("status", "pending")
            if status in by_workflow[wf_name]:
                by_workflow[wf_name][status] += 1
        
        by_workflow_list = [
            {"workflow": k, **v, "approval_rate": round((v["approved"]/v["total"]*100), 1) if v["total"] > 0 else 0}
            for k, v in sorted(by_workflow.items(), key=lambda x: x[1]["total"], reverse=True)
        ]
        
        # By approver
        approver_stats = {}
        for inst in instances:
            actions = inst.get("actions", [])
            for action in actions:
                user_id = action.get("user_id")
                user_name = action.get("user_name", "Unknown")
                if user_id:
                    if user_id not in approver_stats:
                        approver_stats[user_id] = {"name": user_name, "approved": 0, "rejected": 0}
                    if action.get("action") == "approve":
                        approver_stats[user_id]["approved"] += 1
                    elif action.get("action") == "reject":
                        approver_stats[user_id]["rejected"] += 1
        
        by_approver_list = [
            {"approver": v["name"], "approver_id": k, "approved": v["approved"], "rejected": v["rejected"], "total": v["approved"] + v["rejected"]}
            for k, v in approver_stats.items()
        ]
        by_approver_list.sort(key=lambda x: x["total"], reverse=True)
        
        # Trend data
        trend_pipeline = [
            {"$match": match_filter},
            {"$group": {
                "_id": {
                    "date": {"$dateToString": {"format": "%Y-%m-%d", "date": "$created_at"}},
                    "status": "$status"
                },
                "count": {"$sum": 1}
            }},
            {"$sort": {"_id.date": 1}}
        ]
        
        trend_results = await self.db.tm_approval_instances.aggregate(trend_pipeline).to_list(1000)
        
        # Pivot trend data
        trend_data = {}
        for r in trend_results:
            date_key = r["_id"]["date"]
            status = r["_id"]["status"]
            if date_key not in trend_data:
                trend_data[date_key] = {"date": date_key, "approved": 0, "rejected": 0, "pending": 0, "total": 0}
            trend_data[date_key][status] = r["count"]
            trend_data[date_key]["total"] += r["count"]
        
        trend_list = list(trend_data.values())
        
        # Export-ready table
        export_table = []
        for inst in instances[:100]:  # Limit to 100 for preview
            task = await self.db.tm_tasks.find_one({"id": inst["task_id"]}, {"title": 1, "_id": 0})
            export_table.append({
                "task_id": inst["task_id"],
                "task_title": task.get("title") if task else "Unknown",
                "workflow": inst.get("workflow_name"),
                "status": inst.get("status"),
                "requested_at": inst.get("created_at"),
                "completed_at": inst.get("completed_at")
            })
        
        return {
            "report_type": "approval_analytics",
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "filters": {
                "start_date": start_date.isoformat() if start_date else None,
                "end_date": end_date.isoformat() if end_date else None,
                "project_id": project_id,
                "workflow_id": workflow_id
            },
            "summary": {
                "total": total,
                "approved": approved,
                "rejected": rejected,
                "pending": pending,
                "approval_rate": approval_rate,
                "rejection_rate": rejection_rate,
                "avg_turnaround_hours": avg_turnaround
            },
            "by_workflow": by_workflow_list,
            "by_approver": by_approver_list,
            "trend": trend_list,
            "export_table": export_table
        }
    
    # =========================================================================
    # CSV EXPORT
    # =========================================================================
    
    def export_to_csv(self, report_type: str, data: Dict[str, Any]) -> str:
        """Export report data to CSV format"""
        output = io.StringIO()
        writer = csv.writer(output)
        
        if report_type == "task_performance":
            # Summary
            writer.writerow(["Task Performance Report"])
            writer.writerow(["Generated At", data.get("generated_at")])
            writer.writerow([])
            writer.writerow(["Summary"])
            writer.writerow(["Total Created", data["summary"]["total_created"]])
            writer.writerow(["Total Completed", data["summary"]["total_completed"]])
            writer.writerow(["Completion Rate (%)", data["summary"]["completion_rate"]])
            writer.writerow(["Avg Cycle Time (Hours)", data["summary"]["avg_cycle_time_hours"]])
            writer.writerow(["Avg Cycle Time (Days)", data["summary"]["avg_cycle_time_days"]])
            writer.writerow([])
            
            # By Status
            writer.writerow(["By Status"])
            writer.writerow(["Status", "Count"])
            for row in data.get("by_status", []):
                writer.writerow([row["status"], row["count"]])
            writer.writerow([])
            
            # By Project
            writer.writerow(["By Project"])
            writer.writerow(["Project", "Total", "Completed", "Completion Rate (%)"])
            for row in data.get("by_project", []):
                writer.writerow([row["project"], row["total"], row["completed"], row["completion_rate"]])
            writer.writerow([])
            
            # By Assignee
            writer.writerow(["By Assignee"])
            writer.writerow(["Assignee", "Total", "Completed", "Completion Rate (%)"])
            for row in data.get("by_assignee", []):
                writer.writerow([row["assignee"], row["total"], row["completed"], row["completion_rate"]])
        
        elif report_type == "time_tracking":
            writer.writerow(["Time Tracking Report"])
            writer.writerow(["Generated At", data.get("generated_at")])
            writer.writerow([])
            writer.writerow(["Summary"])
            writer.writerow(["Total Hours", data["summary"]["total_hours"]])
            writer.writerow(["Total Entries", data["summary"]["total_entries"]])
            writer.writerow([])
            
            writer.writerow(["By Project"])
            writer.writerow(["Project", "Hours", "Entries"])
            for row in data.get("by_project", []):
                writer.writerow([row["project"], row["hours"], row["entries"]])
            writer.writerow([])
            
            writer.writerow(["By User"])
            writer.writerow(["User", "Hours", "Entries"])
            for row in data.get("by_user", []):
                writer.writerow([row["user"], row["hours"], row["entries"]])
        
        elif report_type == "sla_compliance":
            writer.writerow(["SLA Compliance Report"])
            writer.writerow(["Generated At", data.get("generated_at")])
            writer.writerow([])
            writer.writerow(["Summary"])
            writer.writerow(["Total with SLA", data["summary"]["total_with_sla"]])
            writer.writerow(["Met", data["summary"]["met"]])
            writer.writerow(["Breached", data["summary"]["breached"]])
            writer.writerow(["Compliance Rate (%)", data["summary"]["compliance_rate"]])
            writer.writerow([])
            
            writer.writerow(["By Project"])
            writer.writerow(["Project", "Total", "Breached", "Breach Rate (%)"])
            for row in data.get("by_project", []):
                writer.writerow([row["project"], row["total"], row["breached"], row["breach_rate"]])
            writer.writerow([])
            
            writer.writerow(["Breached Tasks"])
            writer.writerow(["Task ID", "Title", "Priority", "Status"])
            for row in data.get("breached_tasks", []):
                writer.writerow([row["id"], row["title"], row.get("priority"), row.get("status")])
        
        elif report_type == "recurring_tasks":
            writer.writerow(["Recurring Tasks Report"])
            writer.writerow(["Generated At", data.get("generated_at")])
            writer.writerow([])
            writer.writerow(["Summary"])
            writer.writerow(["Total Rules", data["summary"]["total_rules"]])
            writer.writerow(["Active Rules", data["summary"]["active_rules"]])
            writer.writerow(["Paused Rules", data["summary"]["paused_rules"]])
            writer.writerow(["Total Generated", data["summary"]["total_generated"]])
            writer.writerow(["Success Rate (%)", data["summary"]["success_rate"]])
            writer.writerow([])
            
            writer.writerow(["Rules"])
            writer.writerow(["Name", "Type", "Status", "Run Count", "Last Run", "Next Run"])
            for row in data.get("rules", []):
                writer.writerow([row["name"], row["recurrence_type"], "Paused" if row["is_paused"] else "Active", row["run_count"], row.get("last_run_at"), row.get("next_run_at")])
        
        elif report_type == "approval_analytics":
            writer.writerow(["Approval Analytics Report"])
            writer.writerow(["Generated At", data.get("generated_at")])
            writer.writerow([])
            writer.writerow(["Summary"])
            writer.writerow(["Total", data["summary"]["total"]])
            writer.writerow(["Approved", data["summary"]["approved"]])
            writer.writerow(["Rejected", data["summary"]["rejected"]])
            writer.writerow(["Pending", data["summary"]["pending"]])
            writer.writerow(["Approval Rate (%)", data["summary"]["approval_rate"]])
            writer.writerow(["Avg Turnaround (Hours)", data["summary"]["avg_turnaround_hours"]])
            writer.writerow([])
            
            writer.writerow(["By Workflow"])
            writer.writerow(["Workflow", "Total", "Approved", "Rejected", "Approval Rate (%)"])
            for row in data.get("by_workflow", []):
                writer.writerow([row["workflow"], row["total"], row["approved"], row["rejected"], row["approval_rate"]])
            writer.writerow([])
            
            writer.writerow(["By Approver"])
            writer.writerow(["Approver", "Approved", "Rejected", "Total"])
            for row in data.get("by_approver", []):
                writer.writerow([row["approver"], row["approved"], row["rejected"], row["total"]])
        
        return output.getvalue()
    
    # =========================================================================
    # PDF EXPORT
    # =========================================================================
    
    def export_to_pdf(self, report_type: str, data: Dict[str, Any], company_name: str = "Task Manager") -> bytes:
        """Export report data to PDF format"""
        buffer = io.BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=letter, topMargin=0.5*inch, bottomMargin=0.5*inch)
        
        styles = getSampleStyleSheet()
        title_style = ParagraphStyle('Title', parent=styles['Heading1'], fontSize=18, alignment=TA_CENTER, spaceAfter=20)
        subtitle_style = ParagraphStyle('Subtitle', parent=styles['Normal'], fontSize=10, textColor=colors.gray, alignment=TA_CENTER, spaceAfter=10)
        heading_style = ParagraphStyle('Heading', parent=styles['Heading2'], fontSize=14, spaceBefore=15, spaceAfter=10)
        
        elements = []
        
        # Header
        elements.append(Paragraph(company_name, title_style))
        
        report_titles = {
            "task_performance": "Task Performance Report",
            "time_tracking": "Time Tracking Report",
            "sla_compliance": "SLA Compliance Report",
            "recurring_tasks": "Recurring Tasks Report",
            "approval_analytics": "Approval Analytics Report"
        }
        elements.append(Paragraph(report_titles.get(report_type, "Report"), styles['Heading1']))
        
        # Date range
        filters = data.get("filters", {})
        date_range = f"Date Range: {filters.get('start_date', 'All time')} to {filters.get('end_date', 'Present')}"
        elements.append(Paragraph(date_range, subtitle_style))
        elements.append(Paragraph(f"Generated: {data.get('generated_at', '')[:10]}", subtitle_style))
        elements.append(Spacer(1, 20))
        
        # Summary section
        elements.append(Paragraph("Summary", heading_style))
        
        summary = data.get("summary", {})
        summary_data = [[k.replace("_", " ").title(), str(v)] for k, v in summary.items()]
        if summary_data:
            summary_table = Table(summary_data, colWidths=[3*inch, 2*inch])
            summary_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, -1), colors.whitesmoke),
                ('TEXTCOLOR', (0, 0), (-1, -1), colors.black),
                ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
                ('FONTSIZE', (0, 0), (-1, -1), 10),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
                ('TOPPADDING', (0, 0), (-1, -1), 6),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.gray),
            ]))
            elements.append(summary_table)
        
        # Report-specific sections
        if report_type == "task_performance":
            # By Status
            if data.get("by_status"):
                elements.append(Paragraph("By Status", heading_style))
                table_data = [["Status", "Count"]]
                for row in data["by_status"]:
                    table_data.append([row["status"].replace("_", " ").title(), str(row["count"])])
                table = Table(table_data, colWidths=[3*inch, 2*inch])
                table.setStyle(self._get_table_style())
                elements.append(table)
            
            # By Project
            if data.get("by_project"):
                elements.append(Paragraph("By Project", heading_style))
                table_data = [["Project", "Total", "Completed", "Rate %"]]
                for row in data["by_project"][:10]:
                    table_data.append([row["project"][:30], str(row["total"]), str(row["completed"]), str(row["completion_rate"])])
                table = Table(table_data, colWidths=[2.5*inch, 1*inch, 1.2*inch, 1*inch])
                table.setStyle(self._get_table_style())
                elements.append(table)
        
        elif report_type == "time_tracking":
            if data.get("by_project"):
                elements.append(Paragraph("Time by Project", heading_style))
                table_data = [["Project", "Hours", "Entries"]]
                for row in data["by_project"][:10]:
                    table_data.append([row["project"][:30], str(row["hours"]), str(row["entries"])])
                table = Table(table_data, colWidths=[3*inch, 1.5*inch, 1.5*inch])
                table.setStyle(self._get_table_style())
                elements.append(table)
            
            if data.get("by_user"):
                elements.append(Paragraph("Time by User", heading_style))
                table_data = [["User", "Hours", "Entries"]]
                for row in data["by_user"][:10]:
                    table_data.append([row["user"][:30], str(row["hours"]), str(row["entries"])])
                table = Table(table_data, colWidths=[3*inch, 1.5*inch, 1.5*inch])
                table.setStyle(self._get_table_style())
                elements.append(table)
        
        elif report_type == "sla_compliance":
            if data.get("by_project"):
                elements.append(Paragraph("SLA by Project", heading_style))
                table_data = [["Project", "Total", "Breached", "Breach Rate %"]]
                for row in data["by_project"][:10]:
                    table_data.append([row["project"][:30], str(row["total"]), str(row["breached"]), str(row["breach_rate"])])
                table = Table(table_data, colWidths=[2.5*inch, 1*inch, 1.2*inch, 1.3*inch])
                table.setStyle(self._get_table_style())
                elements.append(table)
        
        elif report_type == "recurring_tasks":
            if data.get("rules"):
                elements.append(Paragraph("Recurrence Rules", heading_style))
                table_data = [["Name", "Type", "Status", "Run Count"]]
                for row in data["rules"][:10]:
                    status = "Paused" if row["is_paused"] else "Active"
                    table_data.append([row["name"][:25], row["recurrence_type"], status, str(row["run_count"])])
                table = Table(table_data, colWidths=[2*inch, 1.2*inch, 1*inch, 1*inch])
                table.setStyle(self._get_table_style())
                elements.append(table)
        
        elif report_type == "approval_analytics":
            if data.get("by_workflow"):
                elements.append(Paragraph("By Workflow", heading_style))
                table_data = [["Workflow", "Total", "Approved", "Rejected", "Rate %"]]
                for row in data["by_workflow"][:10]:
                    table_data.append([row["workflow"][:20], str(row["total"]), str(row["approved"]), str(row["rejected"]), str(row["approval_rate"])])
                table = Table(table_data, colWidths=[1.8*inch, 0.8*inch, 0.9*inch, 0.9*inch, 0.8*inch])
                table.setStyle(self._get_table_style())
                elements.append(table)
        
        doc.build(elements)
        return buffer.getvalue()
    
    def _get_table_style(self):
        """Get consistent table style"""
        return TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#3B82F6')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 10),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 8),
            ('BACKGROUND', (0, 1), (-1, -1), colors.white),
            ('TEXTCOLOR', (0, 1), (-1, -1), colors.black),
            ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 1), (-1, -1), 9),
            ('BOTTOMPADDING', (0, 1), (-1, -1), 5),
            ('TOPPADDING', (0, 1), (-1, -1), 5),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.gray),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#F8FAFC')]),
        ])
