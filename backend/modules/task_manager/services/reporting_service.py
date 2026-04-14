"""
Reporting Service for Task Manager Dashboards
Provides aggregated data for management visibility
"""
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any, List
import csv
import io

logger = logging.getLogger(__name__)


class ReportingService:
    """Service for generating Task Manager reports and dashboards"""
    
    def __init__(self, db):
        self.db = db
    
    async def get_tasks_by_status(
        self,
        tenant_id: str,
        project_id: Optional[str] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> Dict[str, Any]:
        """Get task count breakdown by status"""
        match_query = {"tenant_id": tenant_id, "is_active": True}
        
        if project_id:
            match_query["project_id"] = project_id
        
        if start_date or end_date:
            date_filter = {}
            if start_date:
                date_filter["$gte"] = start_date
            if end_date:
                date_filter["$lte"] = end_date
            match_query["created_at"] = date_filter
        
        pipeline = [
            {"$match": match_query},
            {"$group": {
                "_id": "$status",
                "count": {"$sum": 1}
            }},
            {"$sort": {"_id": 1}}
        ]
        
        results = await self.db.tm_tasks.aggregate(pipeline).to_list(100)
        
        # Format results
        status_counts = {
            "todo": 0,
            "in_progress": 0,
            "blocked": 0,
            "done": 0
        }
        
        total = 0
        for item in results:
            status = item["_id"]
            count = item["count"]
            if status in status_counts:
                status_counts[status] = count
            total += count
        
        return {
            "statuses": status_counts,
            "total": total,
            "filters": {
                "project_id": project_id,
                "start_date": start_date.isoformat() if start_date else None,
                "end_date": end_date.isoformat() if end_date else None
            }
        }
    
    async def get_overdue_tasks_by_assignee(
        self,
        tenant_id: str,
        project_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Get overdue tasks grouped by assignee"""
        now = datetime.now(timezone.utc)
        
        match_query = {
            "tenant_id": tenant_id,
            "is_active": True,
            "status": {"$ne": "done"},
            "due_date": {"$lt": now}
        }
        
        if project_id:
            match_query["project_id"] = project_id
        
        pipeline = [
            {"$match": match_query},
            {"$lookup": {
                "from": "users",
                "localField": "assignee_id",
                "foreignField": "id",
                "as": "assignee"
            }},
            {"$unwind": {"path": "$assignee", "preserveNullAndEmptyArrays": True}},
            {"$group": {
                "_id": "$assignee_id",
                "assignee_name": {"$first": {
                    "$concat": [
                        {"$ifNull": ["$assignee.first_name", ""]},
                        " ",
                        {"$ifNull": ["$assignee.last_name", ""]}
                    ]
                }},
                "assignee_email": {"$first": "$assignee.email"},
                "overdue_count": {"$sum": 1},
                "tasks": {"$push": {
                    "id": "$id",
                    "title": "$title",
                    "due_date": "$due_date",
                    "priority": "$priority",
                    "project_id": "$project_id"
                }}
            }},
            {"$sort": {"overdue_count": -1}}
        ]
        
        results = await self.db.tm_tasks.aggregate(pipeline).to_list(100)
        
        # Process results
        assignees = []
        total_overdue = 0
        
        for item in results:
            assignee_name = item.get("assignee_name", "").strip() or "Unassigned"
            assignees.append({
                "assignee_id": item["_id"],
                "assignee_name": assignee_name,
                "assignee_email": item.get("assignee_email"),
                "overdue_count": item["overdue_count"],
                "tasks": item["tasks"][:10]  # Limit to 10 tasks per assignee
            })
            total_overdue += item["overdue_count"]
        
        return {
            "assignees": assignees,
            "total_overdue": total_overdue,
            "filters": {"project_id": project_id}
        }
    
    async def get_time_spent_by_project(
        self,
        tenant_id: str,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> Dict[str, Any]:
        """Get total time tracked per project"""
        match_query = {"tenant_id": tenant_id, "is_active": True}
        
        if start_date or end_date:
            date_filter = {}
            if start_date:
                date_filter["$gte"] = start_date
            if end_date:
                date_filter["$lte"] = end_date
            match_query["logged_date"] = date_filter
        
        pipeline = [
            {"$match": match_query},
            {"$group": {
                "_id": "$project_id",
                "total_minutes": {"$sum": "$duration_minutes"},
                "entry_count": {"$sum": 1}
            }},
            {"$lookup": {
                "from": "tm_projects",
                "localField": "_id",
                "foreignField": "id",
                "as": "project"
            }},
            {"$unwind": {"path": "$project", "preserveNullAndEmptyArrays": True}},
            {"$project": {
                "project_id": "$_id",
                "project_name": {"$ifNull": ["$project.name", "Unknown"]},
                "project_color": {"$ifNull": ["$project.color", "#6B7280"]},
                "total_minutes": 1,
                "total_hours": {"$round": [{"$divide": ["$total_minutes", 60]}, 2]},
                "entry_count": 1
            }},
            {"$sort": {"total_minutes": -1}}
        ]
        
        results = await self.db.tm_time_entries.aggregate(pipeline).to_list(100)
        
        # Calculate totals
        total_minutes = sum(r.get("total_minutes", 0) for r in results)
        
        return {
            "projects": results,
            "total_minutes": total_minutes,
            "total_hours": round(total_minutes / 60, 2),
            "filters": {
                "start_date": start_date.isoformat() if start_date else None,
                "end_date": end_date.isoformat() if end_date else None
            }
        }
    
    async def get_blocked_tasks_report(
        self,
        tenant_id: str,
        project_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Get all blocked tasks with their blockers"""
        match_query = {
            "tenant_id": tenant_id,
            "is_active": True,
            "$or": [
                {"status": "blocked"},
                {"blocked_by": {"$exists": True, "$ne": []}}
            ]
        }
        
        if project_id:
            match_query["project_id"] = project_id
        
        pipeline = [
            {"$match": match_query},
            {"$lookup": {
                "from": "tm_tasks",
                "localField": "blocked_by",
                "foreignField": "id",
                "as": "blockers"
            }},
            {"$lookup": {
                "from": "tm_projects",
                "localField": "project_id",
                "foreignField": "id",
                "as": "project"
            }},
            {"$unwind": {"path": "$project", "preserveNullAndEmptyArrays": True}},
            {"$lookup": {
                "from": "users",
                "localField": "assignee_id",
                "foreignField": "id",
                "as": "assignee"
            }},
            {"$unwind": {"path": "$assignee", "preserveNullAndEmptyArrays": True}},
            {"$project": {
                "_id": 0,
                "id": 1,
                "title": 1,
                "status": 1,
                "priority": 1,
                "due_date": 1,
                "project_id": 1,
                "project_name": "$project.name",
                "assignee_name": {
                    "$concat": [
                        {"$ifNull": ["$assignee.first_name", ""]},
                        " ",
                        {"$ifNull": ["$assignee.last_name", ""]}
                    ]
                },
                "blocked_by": 1,
                "blockers": {
                    "$map": {
                        "input": "$blockers",
                        "as": "blocker",
                        "in": {
                            "id": "$$blocker.id",
                            "title": "$$blocker.title",
                            "status": "$$blocker.status"
                        }
                    }
                }
            }},
            {"$sort": {"priority": -1, "due_date": 1}}
        ]
        
        results = await self.db.tm_tasks.aggregate(pipeline).to_list(100)
        
        return {
            "blocked_tasks": results,
            "total_blocked": len(results),
            "filters": {"project_id": project_id}
        }
    
    async def get_automation_execution_log(
        self,
        tenant_id: str,
        rule_id: Optional[str] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        limit: int = 100
    ) -> Dict[str, Any]:
        """Get automation rule execution history"""
        match_query = {"tenant_id": tenant_id}
        
        if rule_id:
            match_query["rule_id"] = rule_id
        
        if start_date or end_date:
            date_filter = {}
            if start_date:
                date_filter["$gte"] = start_date
            if end_date:
                date_filter["$lte"] = end_date
            match_query["executed_at"] = date_filter
        
        pipeline = [
            {"$match": match_query},
            {"$lookup": {
                "from": "tm_automation_rules",
                "localField": "rule_id",
                "foreignField": "id",
                "as": "rule"
            }},
            {"$unwind": {"path": "$rule", "preserveNullAndEmptyArrays": True}},
            {"$lookup": {
                "from": "tm_tasks",
                "localField": "task_id",
                "foreignField": "id",
                "as": "task"
            }},
            {"$unwind": {"path": "$task", "preserveNullAndEmptyArrays": True}},
            {"$project": {
                "_id": 0,
                "id": 1,
                "rule_id": 1,
                "rule_name": "$rule.name",
                "task_id": 1,
                "task_title": "$task.title",
                "trigger": 1,
                "actions_executed": 1,
                "status": 1,
                "error_message": 1,
                "executed_at": 1
            }},
            {"$sort": {"executed_at": -1}},
            {"$limit": limit}
        ]
        
        results = await self.db.tm_automation_logs.aggregate(pipeline).to_list(limit)
        
        # Get summary stats
        stats_pipeline = [
            {"$match": match_query},
            {"$group": {
                "_id": "$status",
                "count": {"$sum": 1}
            }}
        ]
        
        stats = await self.db.tm_automation_logs.aggregate(stats_pipeline).to_list(10)
        status_counts = {s["_id"]: s["count"] for s in stats}
        
        return {
            "executions": results,
            "stats": {
                "success": status_counts.get("success", 0),
                "failed": status_counts.get("failed", 0),
                "total": sum(status_counts.values())
            },
            "filters": {
                "rule_id": rule_id,
                "start_date": start_date.isoformat() if start_date else None,
                "end_date": end_date.isoformat() if end_date else None
            }
        }
    
    async def export_to_csv(
        self,
        report_type: str,
        data: Dict[str, Any]
    ) -> str:
        """Export report data to CSV format"""
        output = io.StringIO()
        
        if report_type == "tasks_by_status":
            writer = csv.writer(output)
            writer.writerow(["Status", "Count"])
            for status, count in data.get("statuses", {}).items():
                writer.writerow([status.replace("_", " ").title(), count])
            writer.writerow(["Total", data.get("total", 0)])
        
        elif report_type == "overdue_by_assignee":
            writer = csv.writer(output)
            writer.writerow(["Assignee", "Email", "Overdue Count"])
            for assignee in data.get("assignees", []):
                writer.writerow([
                    assignee.get("assignee_name", "Unassigned"),
                    assignee.get("assignee_email", ""),
                    assignee.get("overdue_count", 0)
                ])
        
        elif report_type == "time_by_project":
            writer = csv.writer(output)
            writer.writerow(["Project", "Total Hours", "Total Minutes", "Entries"])
            for project in data.get("projects", []):
                writer.writerow([
                    project.get("project_name", "Unknown"),
                    project.get("total_hours", 0),
                    project.get("total_minutes", 0),
                    project.get("entry_count", 0)
                ])
        
        elif report_type == "blocked_tasks":
            writer = csv.writer(output)
            writer.writerow(["Task", "Project", "Assignee", "Priority", "Due Date", "Blocked By"])
            for task in data.get("blocked_tasks", []):
                blockers = ", ".join([b.get("title", "") for b in task.get("blockers", [])])
                due_date = task.get("due_date")
                if due_date:
                    if isinstance(due_date, str):
                        due_date = due_date.split("T")[0]
                    else:
                        due_date = due_date.strftime("%Y-%m-%d")
                writer.writerow([
                    task.get("title", ""),
                    task.get("project_name", ""),
                    task.get("assignee_name", "").strip() or "Unassigned",
                    task.get("priority", "medium").title(),
                    due_date or "",
                    blockers
                ])
        
        elif report_type == "automation_log":
            writer = csv.writer(output)
            writer.writerow(["Rule Name", "Task", "Trigger", "Status", "Executed At"])
            for execution in data.get("executions", []):
                executed_at = execution.get("executed_at")
                if executed_at:
                    if isinstance(executed_at, str):
                        executed_at = executed_at.replace("T", " ").split(".")[0]
                    else:
                        executed_at = executed_at.strftime("%Y-%m-%d %H:%M:%S")
                writer.writerow([
                    execution.get("rule_name", "Unknown"),
                    execution.get("task_title", "Unknown"),
                    execution.get("trigger", ""),
                    execution.get("status", ""),
                    executed_at or ""
                ])
        
        return output.getvalue()
