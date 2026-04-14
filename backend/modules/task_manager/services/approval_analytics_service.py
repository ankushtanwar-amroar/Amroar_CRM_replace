"""
Approval Analytics Service - Phase 10
Provides analytics and insights on approval workflows.
Read-only aggregations optimized for dashboards.
"""
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any
import logging

logger = logging.getLogger(__name__)


class ApprovalAnalyticsService:
    """Service for approval analytics and reporting"""
    
    def __init__(self, db):
        self.db = db
    
    # =========================================================================
    # APPROVAL VOLUME METRICS
    # =========================================================================
    
    async def get_approval_volume(
        self,
        tenant_id: str,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        project_id: Optional[str] = None,
        workflow_id: Optional[str] = None,
        approver_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Get approval volume metrics"""
        
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
        
        if approver_id:
            match_filter["approvers.user_id"] = approver_id
        
        # If project filter, we need to join with tasks
        task_ids = None
        if project_id:
            tasks = await self.db.tm_tasks.find(
                {"project_id": project_id, "tenant_id": tenant_id},
                {"id": 1}
            ).to_list(length=10000)
            task_ids = [t["id"] for t in tasks]
            match_filter["task_id"] = {"$in": task_ids}
        
        # Aggregate by status
        pipeline = [
            {"$match": match_filter},
            {"$group": {
                "_id": "$status",
                "count": {"$sum": 1}
            }}
        ]
        
        results = await self.db.tm_approval_instances.aggregate(pipeline).to_list(length=10)
        
        volume = {
            "total": 0,
            "pending": 0,
            "approved": 0,
            "rejected": 0,
            "cancelled": 0
        }
        
        for r in results:
            status = r["_id"]
            count = r["count"]
            if status in volume:
                volume[status] = count
            volume["total"] += count
        
        return volume
    
    async def get_volume_by_project(
        self,
        tenant_id: str,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> List[Dict[str, Any]]:
        """Get approval volume grouped by project"""
        
        match_filter = {"tenant_id": tenant_id}
        if start_date:
            match_filter["created_at"] = {"$gte": start_date}
        if end_date:
            if "created_at" in match_filter:
                match_filter["created_at"]["$lte"] = end_date
            else:
                match_filter["created_at"] = {"$lte": end_date}
        
        # Get all approval instances
        instances = await self.db.tm_approval_instances.find(
            match_filter,
            {"task_id": 1, "status": 1}
        ).to_list(length=10000)
        
        if not instances:
            return []
        
        # Get task -> project mapping
        task_ids = list(set(i["task_id"] for i in instances))
        tasks = await self.db.tm_tasks.find(
            {"id": {"$in": task_ids}, "tenant_id": tenant_id},
            {"id": 1, "project_id": 1}
        ).to_list(length=10000)
        
        task_project_map = {t["id"]: t["project_id"] for t in tasks}
        
        # Get project names
        project_ids = list(set(task_project_map.values()))
        projects = await self.db.tm_projects.find(
            {"id": {"$in": project_ids}},
            {"id": 1, "name": 1}
        ).to_list(length=100)
        
        project_names = {p["id"]: p["name"] for p in projects}
        
        # Aggregate by project
        project_stats = {}
        for inst in instances:
            project_id = task_project_map.get(inst["task_id"])
            if not project_id:
                continue
            
            if project_id not in project_stats:
                project_stats[project_id] = {
                    "project_id": project_id,
                    "project_name": project_names.get(project_id, "Unknown"),
                    "total": 0,
                    "approved": 0,
                    "rejected": 0,
                    "pending": 0
                }
            
            project_stats[project_id]["total"] += 1
            status = inst.get("status", "pending")
            if status in project_stats[project_id]:
                project_stats[project_id][status] += 1
        
        return sorted(project_stats.values(), key=lambda x: x["total"], reverse=True)
    
    async def get_volume_by_workflow(
        self,
        tenant_id: str,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> List[Dict[str, Any]]:
        """Get approval volume grouped by workflow"""
        
        match_filter = {"tenant_id": tenant_id}
        if start_date:
            match_filter["created_at"] = {"$gte": start_date}
        if end_date:
            if "created_at" in match_filter:
                match_filter["created_at"]["$lte"] = end_date
            else:
                match_filter["created_at"] = {"$lte": end_date}
        
        pipeline = [
            {"$match": match_filter},
            {"$group": {
                "_id": {
                    "workflow_id": "$workflow_id",
                    "workflow_name": "$workflow_name",
                    "status": "$status"
                },
                "count": {"$sum": 1}
            }}
        ]
        
        results = await self.db.tm_approval_instances.aggregate(pipeline).to_list(length=100)
        
        # Aggregate by workflow
        workflow_stats = {}
        for r in results:
            wf_id = r["_id"]["workflow_id"]
            wf_name = r["_id"]["workflow_name"]
            status = r["_id"]["status"]
            count = r["count"]
            
            if wf_id not in workflow_stats:
                workflow_stats[wf_id] = {
                    "workflow_id": wf_id,
                    "workflow_name": wf_name,
                    "total": 0,
                    "approved": 0,
                    "rejected": 0,
                    "pending": 0
                }
            
            workflow_stats[wf_id]["total"] += count
            if status in workflow_stats[wf_id]:
                workflow_stats[wf_id][status] += count
        
        return sorted(workflow_stats.values(), key=lambda x: x["total"], reverse=True)
    
    async def get_volume_trend(
        self,
        tenant_id: str,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        granularity: str = "day"  # "day", "week", "month"
    ) -> List[Dict[str, Any]]:
        """Get approval volume trend over time"""
        
        if not start_date:
            start_date = datetime.now(timezone.utc) - timedelta(days=30)
        if not end_date:
            end_date = datetime.now(timezone.utc)
        
        match_filter = {
            "tenant_id": tenant_id,
            "created_at": {"$gte": start_date, "$lte": end_date}
        }
        
        # Determine date grouping format
        if granularity == "month":
            date_format = "%Y-%m"
        elif granularity == "week":
            date_format = "%Y-W%V"
        else:
            date_format = "%Y-%m-%d"
        
        pipeline = [
            {"$match": match_filter},
            {"$group": {
                "_id": {
                    "date": {"$dateToString": {"format": date_format, "date": "$created_at"}},
                    "status": "$status"
                },
                "count": {"$sum": 1}
            }},
            {"$sort": {"_id.date": 1}}
        ]
        
        results = await self.db.tm_approval_instances.aggregate(pipeline).to_list(length=1000)
        
        # Pivot data
        trend_data = {}
        for r in results:
            date_key = r["_id"]["date"]
            status = r["_id"]["status"]
            count = r["count"]
            
            if date_key not in trend_data:
                trend_data[date_key] = {
                    "date": date_key,
                    "total": 0,
                    "approved": 0,
                    "rejected": 0,
                    "pending": 0
                }
            
            trend_data[date_key]["total"] += count
            if status in trend_data[date_key]:
                trend_data[date_key][status] += count
        
        return list(trend_data.values())
    
    # =========================================================================
    # TURNAROUND TIME METRICS
    # =========================================================================
    
    async def get_turnaround_stats(
        self,
        tenant_id: str,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        project_id: Optional[str] = None,
        workflow_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Get overall turnaround time statistics"""
        
        match_filter = {
            "tenant_id": tenant_id,
            "status": {"$in": ["approved", "rejected"]},
            "completed_at": {"$ne": None}
        }
        
        if start_date:
            match_filter["created_at"] = {"$gte": start_date}
        if end_date:
            if "created_at" in match_filter:
                match_filter["created_at"]["$lte"] = end_date
            else:
                match_filter["created_at"] = {"$lte": end_date}
        
        if workflow_id:
            match_filter["workflow_id"] = workflow_id
        
        # Get completed instances
        instances = await self.db.tm_approval_instances.find(
            match_filter,
            {"created_at": 1, "completed_at": 1, "task_id": 1, "status": 1}
        ).to_list(length=10000)
        
        if not instances:
            return {
                "count": 0,
                "avg_hours": 0,
                "median_hours": 0,
                "min_hours": 0,
                "max_hours": 0
            }
        
        # Filter by project if needed
        if project_id:
            tasks = await self.db.tm_tasks.find(
                {"project_id": project_id, "tenant_id": tenant_id},
                {"id": 1}
            ).to_list(length=10000)
            task_ids = set(t["id"] for t in tasks)
            instances = [i for i in instances if i["task_id"] in task_ids]
        
        if not instances:
            return {
                "count": 0,
                "avg_hours": 0,
                "median_hours": 0,
                "min_hours": 0,
                "max_hours": 0
            }
        
        # Calculate turnaround times
        turnaround_hours = []
        for inst in instances:
            created = inst.get("created_at")
            completed = inst.get("completed_at")
            
            if created and completed:
                # Handle both datetime and string formats
                if isinstance(created, str):
                    created = datetime.fromisoformat(created.replace("Z", "+00:00"))
                if isinstance(completed, str):
                    completed = datetime.fromisoformat(completed.replace("Z", "+00:00"))
                
                diff = (completed - created).total_seconds() / 3600
                turnaround_hours.append(diff)
        
        if not turnaround_hours:
            return {
                "count": 0,
                "avg_hours": 0,
                "median_hours": 0,
                "min_hours": 0,
                "max_hours": 0
            }
        
        turnaround_hours.sort()
        n = len(turnaround_hours)
        
        return {
            "count": n,
            "avg_hours": round(sum(turnaround_hours) / n, 2),
            "median_hours": round(turnaround_hours[n // 2], 2),
            "min_hours": round(min(turnaround_hours), 2),
            "max_hours": round(max(turnaround_hours), 2)
        }
    
    async def get_turnaround_by_approver(
        self,
        tenant_id: str,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> List[Dict[str, Any]]:
        """Get turnaround time breakdown by approver"""
        
        match_filter = {
            "tenant_id": tenant_id,
            "status": {"$in": ["approved", "rejected"]},
            "completed_at": {"$ne": None}
        }
        
        if start_date:
            match_filter["created_at"] = {"$gte": start_date}
        if end_date:
            if "created_at" in match_filter:
                match_filter["created_at"]["$lte"] = end_date
            else:
                match_filter["created_at"] = {"$lte": end_date}
        
        instances = await self.db.tm_approval_instances.find(
            match_filter,
            {"created_at": 1, "completed_at": 1, "actions": 1, "approvers": 1}
        ).to_list(length=10000)
        
        # Aggregate by approver who took action
        approver_times = {}
        
        for inst in instances:
            actions = inst.get("actions", [])
            if not actions:
                continue
            
            # Get the last action (the one that completed the approval)
            last_action = actions[-1]
            user_id = last_action.get("user_id")
            user_name = last_action.get("user_name", "Unknown")
            
            if not user_id:
                continue
            
            # Calculate time from request to action
            created = inst.get("created_at")
            action_time = last_action.get("timestamp")
            
            if not created or not action_time:
                continue
            
            if isinstance(created, str):
                created = datetime.fromisoformat(created.replace("Z", "+00:00"))
            if isinstance(action_time, str):
                action_time = datetime.fromisoformat(action_time.replace("Z", "+00:00"))
            
            hours = (action_time - created).total_seconds() / 3600
            
            if user_id not in approver_times:
                approver_times[user_id] = {
                    "approver_id": user_id,
                    "approver_name": user_name,
                    "times": [],
                    "approved_count": 0,
                    "rejected_count": 0
                }
            
            approver_times[user_id]["times"].append(hours)
            if last_action.get("action") == "approve":
                approver_times[user_id]["approved_count"] += 1
            else:
                approver_times[user_id]["rejected_count"] += 1
        
        # Calculate stats for each approver
        result = []
        for user_id, data in approver_times.items():
            times = data["times"]
            if not times:
                continue
            
            times.sort()
            n = len(times)
            
            result.append({
                "approver_id": data["approver_id"],
                "approver_name": data["approver_name"],
                "total_actions": n,
                "approved_count": data["approved_count"],
                "rejected_count": data["rejected_count"],
                "avg_hours": round(sum(times) / n, 2),
                "median_hours": round(times[n // 2], 2)
            })
        
        return sorted(result, key=lambda x: x["avg_hours"])
    
    async def get_turnaround_by_workflow(
        self,
        tenant_id: str,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> List[Dict[str, Any]]:
        """Get turnaround time breakdown by workflow"""
        
        match_filter = {
            "tenant_id": tenant_id,
            "status": {"$in": ["approved", "rejected"]},
            "completed_at": {"$ne": None}
        }
        
        if start_date:
            match_filter["created_at"] = {"$gte": start_date}
        if end_date:
            if "created_at" in match_filter:
                match_filter["created_at"]["$lte"] = end_date
            else:
                match_filter["created_at"] = {"$lte": end_date}
        
        instances = await self.db.tm_approval_instances.find(
            match_filter,
            {"created_at": 1, "completed_at": 1, "workflow_id": 1, "workflow_name": 1, "status": 1}
        ).to_list(length=10000)
        
        # Aggregate by workflow
        workflow_times = {}
        
        for inst in instances:
            wf_id = inst.get("workflow_id")
            wf_name = inst.get("workflow_name", "Unknown")
            
            if not wf_id:
                continue
            
            created = inst.get("created_at")
            completed = inst.get("completed_at")
            
            if not created or not completed:
                continue
            
            if isinstance(created, str):
                created = datetime.fromisoformat(created.replace("Z", "+00:00"))
            if isinstance(completed, str):
                completed = datetime.fromisoformat(completed.replace("Z", "+00:00"))
            
            hours = (completed - created).total_seconds() / 3600
            
            if wf_id not in workflow_times:
                workflow_times[wf_id] = {
                    "workflow_id": wf_id,
                    "workflow_name": wf_name,
                    "times": [],
                    "approved_count": 0,
                    "rejected_count": 0
                }
            
            workflow_times[wf_id]["times"].append(hours)
            if inst.get("status") == "approved":
                workflow_times[wf_id]["approved_count"] += 1
            else:
                workflow_times[wf_id]["rejected_count"] += 1
        
        # Calculate stats
        result = []
        for wf_id, data in workflow_times.items():
            times = data["times"]
            if not times:
                continue
            
            times.sort()
            n = len(times)
            
            result.append({
                "workflow_id": data["workflow_id"],
                "workflow_name": data["workflow_name"],
                "total": n,
                "approved_count": data["approved_count"],
                "rejected_count": data["rejected_count"],
                "avg_hours": round(sum(times) / n, 2),
                "median_hours": round(times[n // 2], 2)
            })
        
        return sorted(result, key=lambda x: x["total"], reverse=True)
    
    # =========================================================================
    # BOTTLENECK DETECTION
    # =========================================================================
    
    async def get_pending_bottlenecks(
        self,
        tenant_id: str,
        threshold_hours: float = 24
    ) -> Dict[str, Any]:
        """Get pending approvals that exceed threshold"""
        
        now = datetime.now(timezone.utc)
        threshold_time = now - timedelta(hours=threshold_hours)
        
        # Get pending instances older than threshold
        match_filter = {
            "tenant_id": tenant_id,
            "status": "pending",
            "created_at": {"$lt": threshold_time}
        }
        
        pending_instances = await self.db.tm_approval_instances.find(
            match_filter,
            {"id": 1, "task_id": 1, "workflow_name": 1, "created_at": 1, "approvers": 1, "current_step": 1}
        ).to_list(length=1000)
        
        # Enrich with task info
        bottlenecks = []
        for inst in pending_instances:
            task = await self.db.tm_tasks.find_one(
                {"id": inst["task_id"]},
                {"title": 1, "project_id": 1}
            )
            
            created = inst.get("created_at")
            if isinstance(created, str):
                created = datetime.fromisoformat(created.replace("Z", "+00:00"))
            
            pending_hours = (now - created).total_seconds() / 3600
            
            # Get current approver
            approvers = inst.get("approvers", [])
            current_step = inst.get("current_step", 0)
            current_approver = approvers[current_step] if current_step < len(approvers) else None
            
            bottlenecks.append({
                "instance_id": inst["id"],
                "task_id": inst["task_id"],
                "task_title": task.get("title") if task else "Unknown",
                "project_id": task.get("project_id") if task else None,
                "workflow_name": inst.get("workflow_name", "Unknown"),
                "pending_hours": round(pending_hours, 2),
                "pending_days": round(pending_hours / 24, 1),
                "current_approver": current_approver.get("user_name") if current_approver else "Unknown",
                "current_approver_id": current_approver.get("user_id") if current_approver else None,
                "created_at": inst.get("created_at")
            })
        
        # Sort by pending time
        bottlenecks.sort(key=lambda x: x["pending_hours"], reverse=True)
        
        return {
            "threshold_hours": threshold_hours,
            "count": len(bottlenecks),
            "bottlenecks": bottlenecks[:50]  # Limit to top 50
        }
    
    async def get_approver_workload(
        self,
        tenant_id: str
    ) -> List[Dict[str, Any]]:
        """Get pending approval count per approver"""
        
        # Get all pending instances
        pending_instances = await self.db.tm_approval_instances.find(
            {"tenant_id": tenant_id, "status": "pending"},
            {"approvers": 1, "current_step": 1, "approval_type": 1}
        ).to_list(length=10000)
        
        # Count pending per approver
        approver_counts = {}
        
        for inst in pending_instances:
            approvers = inst.get("approvers", [])
            approval_type = inst.get("approval_type", "single")
            current_step = inst.get("current_step", 0)
            
            if approval_type == "sequential":
                # Only current step approver has pending
                if current_step < len(approvers):
                    approver = approvers[current_step]
                    if approver.get("status") == "pending":
                        user_id = approver.get("user_id")
                        user_name = approver.get("user_name", "Unknown")
                        
                        if user_id not in approver_counts:
                            approver_counts[user_id] = {
                                "approver_id": user_id,
                                "approver_name": user_name,
                                "pending_count": 0
                            }
                        approver_counts[user_id]["pending_count"] += 1
            else:
                # All pending approvers
                for approver in approvers:
                    if approver.get("status") == "pending":
                        user_id = approver.get("user_id")
                        user_name = approver.get("user_name", "Unknown")
                        
                        if user_id not in approver_counts:
                            approver_counts[user_id] = {
                                "approver_id": user_id,
                                "approver_name": user_name,
                                "pending_count": 0
                            }
                        approver_counts[user_id]["pending_count"] += 1
        
        result = list(approver_counts.values())
        return sorted(result, key=lambda x: x["pending_count"], reverse=True)
    
    # =========================================================================
    # REJECTION INSIGHTS
    # =========================================================================
    
    async def get_rejection_stats(
        self,
        tenant_id: str,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> Dict[str, Any]:
        """Get rejection statistics"""
        
        match_filter = {
            "tenant_id": tenant_id,
            "status": "rejected"
        }
        
        if start_date:
            match_filter["created_at"] = {"$gte": start_date}
        if end_date:
            if "created_at" in match_filter:
                match_filter["created_at"]["$lte"] = end_date
            else:
                match_filter["created_at"] = {"$lte": end_date}
        
        rejected = await self.db.tm_approval_instances.find(
            match_filter,
            {"workflow_id": 1, "workflow_name": 1, "actions": 1}
        ).to_list(length=10000)
        
        # Count by workflow
        workflow_rejections = {}
        rejection_reasons = []
        
        for inst in rejected:
            wf_id = inst.get("workflow_id")
            wf_name = inst.get("workflow_name", "Unknown")
            
            if wf_id not in workflow_rejections:
                workflow_rejections[wf_id] = {
                    "workflow_id": wf_id,
                    "workflow_name": wf_name,
                    "count": 0
                }
            workflow_rejections[wf_id]["count"] += 1
            
            # Extract rejection reason
            actions = inst.get("actions", [])
            for action in actions:
                if action.get("action") == "reject" and action.get("comment"):
                    rejection_reasons.append(action.get("comment"))
        
        # Get top rejection reasons (simple word frequency for now)
        reason_counts = {}
        for reason in rejection_reasons:
            # Normalize and truncate
            reason_key = reason[:100].strip().lower()
            if reason_key not in reason_counts:
                reason_counts[reason_key] = {
                    "reason": reason[:100],
                    "count": 0
                }
            reason_counts[reason_key]["count"] += 1
        
        top_reasons = sorted(reason_counts.values(), key=lambda x: x["count"], reverse=True)[:10]
        
        return {
            "total_rejections": len(rejected),
            "by_workflow": sorted(workflow_rejections.values(), key=lambda x: x["count"], reverse=True),
            "top_reasons": top_reasons
        }
    
    # =========================================================================
    # CSV EXPORT
    # =========================================================================
    
    async def export_approval_data(
        self,
        tenant_id: str,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        export_type: str = "all"  # "all", "pending", "completed"
    ) -> List[Dict[str, Any]]:
        """Export approval data for CSV"""
        
        match_filter = {"tenant_id": tenant_id}
        
        if start_date:
            match_filter["created_at"] = {"$gte": start_date}
        if end_date:
            if "created_at" in match_filter:
                match_filter["created_at"]["$lte"] = end_date
            else:
                match_filter["created_at"] = {"$lte": end_date}
        
        if export_type == "pending":
            match_filter["status"] = "pending"
        elif export_type == "completed":
            match_filter["status"] = {"$in": ["approved", "rejected"]}
        
        instances = await self.db.tm_approval_instances.find(match_filter).to_list(length=10000)
        
        # Enrich with task info
        export_data = []
        for inst in instances:
            task = await self.db.tm_tasks.find_one(
                {"id": inst["task_id"]},
                {"title": 1, "project_id": 1}
            )
            
            project = None
            if task and task.get("project_id"):
                project = await self.db.tm_projects.find_one(
                    {"id": task["project_id"]},
                    {"name": 1}
                )
            
            # Calculate turnaround if completed
            turnaround_hours = None
            if inst.get("completed_at") and inst.get("created_at"):
                created = inst["created_at"]
                completed = inst["completed_at"]
                if isinstance(created, str):
                    created = datetime.fromisoformat(created.replace("Z", "+00:00"))
                if isinstance(completed, str):
                    completed = datetime.fromisoformat(completed.replace("Z", "+00:00"))
                turnaround_hours = round((completed - created).total_seconds() / 3600, 2)
            
            # Get rejection reason if rejected
            rejection_reason = None
            if inst.get("status") == "rejected":
                actions = inst.get("actions", [])
                for action in actions:
                    if action.get("action") == "reject":
                        rejection_reason = action.get("comment")
                        break
            
            export_data.append({
                "instance_id": inst["id"],
                "task_id": inst["task_id"],
                "task_title": task.get("title") if task else "",
                "project_name": project.get("name") if project else "",
                "workflow_name": inst.get("workflow_name", ""),
                "status": inst.get("status", ""),
                "approval_type": inst.get("approval_type", ""),
                "requested_at": inst.get("created_at"),
                "completed_at": inst.get("completed_at"),
                "turnaround_hours": turnaround_hours,
                "rejection_reason": rejection_reason
            })
        
        return export_data
