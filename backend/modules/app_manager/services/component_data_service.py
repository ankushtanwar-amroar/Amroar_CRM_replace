"""
Component Data Service

Fetches data for page components using respective service layers.
This maintains module isolation - App Manager orchestrates, doesn't own domain logic.

Architecture:
- Tasks Due -> uses task data from object_records
- Pipeline Snapshot -> aggregates from opportunity/lead records
- Work Queue -> uses last_activity_date on records
- Recent Records -> uses record view tracking
"""
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List, Optional
from motor.motor_asyncio import AsyncIOMotorDatabase
import logging

logger = logging.getLogger(__name__)


class ComponentDataService:
    """Service for fetching component data with module isolation"""
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
    
    async def get_tasks_due(
        self,
        user_id: str,
        tenant_id: str,
        date_range: str = "next_7_days",
        show_overdue: bool = True,
        max_rows: int = 10,
        show_completed: bool = False
    ) -> Dict[str, Any]:
        """
        Get tasks due for the current user.
        Queries task records from object_records collection.
        """
        now = datetime.now(timezone.utc)
        today = now.replace(hour=0, minute=0, second=0, microsecond=0)
        
        # Build date range filter
        date_filter = {}
        
        if date_range == "today":
            end_date = today + timedelta(days=1)
            date_filter = {"$gte": today.isoformat(), "$lt": end_date.isoformat()}
        elif date_range == "next_7_days":
            end_date = today + timedelta(days=7)
            date_filter = {"$gte": today.isoformat(), "$lt": end_date.isoformat()}
        elif date_range == "next_15_days":
            end_date = today + timedelta(days=15)
            date_filter = {"$gte": today.isoformat(), "$lt": end_date.isoformat()}
        elif date_range == "next_30_days":
            end_date = today + timedelta(days=30)
            date_filter = {"$gte": today.isoformat(), "$lt": end_date.isoformat()}
        # "all" means no date filter on future
        
        # Build query
        query = {
            "tenant_id": tenant_id,
            "object_name": "task",
            "$or": [
                {"data.assigned_to": user_id},
                {"data.owner_id": user_id},
                {"owner_id": user_id}
            ]
        }
        
        # Status filter
        if not show_completed:
            query["data.status"] = {"$nin": ["Completed", "Deferred"]}
        
        # Fetch tasks
        tasks_cursor = self.db.object_records.find(query, {"_id": 0}).sort(
            "data.due_date", 1
        ).limit(max_rows * 2)  # Fetch more to filter
        
        tasks = await tasks_cursor.to_list(max_rows * 2)
        
        # Process tasks
        result_tasks = []
        overdue_count = 0
        
        for task in tasks:
            data = task.get("data", {})
            due_date_str = data.get("due_date") or data.get("activity_date")
            
            # Parse due date
            due_date = None
            is_overdue = False
            
            if due_date_str:
                try:
                    if isinstance(due_date_str, str):
                        due_date = datetime.fromisoformat(due_date_str.replace('Z', '+00:00'))
                    else:
                        due_date = due_date_str
                    
                    # Ensure timezone-aware for comparison
                    if due_date.tzinfo is None:
                        due_date = due_date.replace(tzinfo=timezone.utc)
                    
                    is_overdue = due_date < now and data.get("status") not in ["Completed", "Deferred"]
                except:
                    pass
            
            # Apply date filter
            if date_range != "all" and due_date:
                if date_range == "today" and due_date.date() != today.date():
                    if not (show_overdue and is_overdue):
                        continue
                elif date_range.startswith("next_"):
                    days = int(date_range.split("_")[1])
                    end = (today + timedelta(days=days)).replace(tzinfo=timezone.utc)
                    if due_date > end:
                        if not (show_overdue and is_overdue):
                            continue
            
            if is_overdue:
                overdue_count += 1
            
            # Skip overdue if not showing
            if is_overdue and not show_overdue:
                continue
            
            # Get related record name
            related_to_name = None
            related_to_type = data.get("related_to_type") or data.get("what_type")
            related_to_id = data.get("related_to_id") or data.get("what_id")
            
            if related_to_id and related_to_type:
                related = await self.db.object_records.find_one({
                    "id": related_to_id,
                    "tenant_id": tenant_id
                }, {"_id": 0, "data.name": 1, "data.first_name": 1, "data.last_name": 1})
                
                if related:
                    related_data = related.get("data", {})
                    related_to_name = related_data.get("name") or \
                        f"{related_data.get('first_name', '')} {related_data.get('last_name', '')}".strip()
            
            result_tasks.append({
                "id": task.get("id"),
                "subject": data.get("subject") or data.get("name", "Untitled Task"),
                "due_date": due_date.isoformat() if due_date else None,
                "status": data.get("status", "Not Started"),
                "priority": data.get("priority", "Normal"),
                "related_to_type": related_to_type,
                "related_to_id": related_to_id,
                "related_to_name": related_to_name,
                "is_overdue": is_overdue
            })
            
            if len(result_tasks) >= max_rows:
                break
        
        return {
            "tasks": result_tasks,
            "total": len(result_tasks),
            "overdue_count": overdue_count,
            "date_range": date_range
        }
    
    async def get_pipeline_snapshot(
        self,
        tenant_id: str,
        user_id: str,
        object_type: str = "opportunity",
        group_by: str = "stage",
        display_mode: str = "both",
        date_range: str = "this_quarter"
    ) -> Dict[str, Any]:
        """
        Get pipeline snapshot - aggregated by stage/status.
        Queries opportunity or lead records.
        """
        now = datetime.now(timezone.utc)
        
        # Calculate date range
        start_date = None
        if date_range == "this_month":
            start_date = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        elif date_range == "this_quarter":
            quarter_month = ((now.month - 1) // 3) * 3 + 1
            start_date = now.replace(month=quarter_month, day=1, hour=0, minute=0, second=0, microsecond=0)
        elif date_range == "this_year":
            start_date = now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
        # "all" means no date filter
        
        # Build query
        query = {
            "tenant_id": tenant_id,
            "object_name": object_type
        }
        
        if start_date:
            query["created_at"] = {"$gte": start_date.isoformat()}
        
        # Group field
        group_field = f"data.{group_by}" if group_by in ["stage", "status"] else "data.stage"
        
        # Aggregation pipeline
        pipeline = [
            {"$match": query},
            {
                "$group": {
                    "_id": f"${group_field}",
                    "count": {"$sum": 1},
                    "amount": {
                        "$sum": {
                            "$cond": [
                                {"$isNumber": "$data.amount"},
                                "$data.amount",
                                0
                            ]
                        }
                    }
                }
            },
            {"$sort": {"count": -1}}
        ]
        
        results = await self.db.object_records.aggregate(pipeline).to_list(100)
        
        # Calculate totals and percentages
        total_count = sum(r["count"] for r in results)
        total_amount = sum(r["amount"] for r in results)
        
        stages = []
        for r in results:
            stage_name = r["_id"] or "Unknown"
            count = r["count"]
            amount = r["amount"]
            
            stages.append({
                "stage": stage_name,
                "count": count,
                "amount": amount,
                "percentage": round((count / total_count * 100) if total_count > 0 else 0, 1)
            })
        
        return {
            "stages": stages,
            "total_count": total_count,
            "total_amount": total_amount,
            "object_type": object_type,
            "group_by": group_by,
            "date_range": date_range
        }
    
    async def get_work_queue(
        self,
        tenant_id: str,
        user_id: str,
        object_type: str = "lead",
        inactivity_days: int = 7,
        max_rows: int = 10,
        sort_order: str = "oldest_first"
    ) -> Dict[str, Any]:
        """
        Get records needing attention based on inactivity.
        Uses last_activity_at field on records (set by activity_linking_service).
        """
        now = datetime.now(timezone.utc)
        threshold_date = now - timedelta(days=inactivity_days)
        
        # Build query - find records with old or missing last_activity_at
        query = {
            "tenant_id": tenant_id,
            "object_name": object_type,
            "$or": [
                {"owner_id": user_id},
                {"data.owner_id": user_id}
            ],
            "$and": [
                {
                    "$or": [
                        {"data.last_activity_at": {"$exists": False}},
                        {"data.last_activity_at": None},
                        {"data.last_activity_at": {"$lt": threshold_date.isoformat()}}
                    ]
                }
            ]
        }
        
        # Exclude closed/won/lost records
        if object_type == "lead":
            query["data.status"] = {"$nin": ["Converted", "Disqualified"]}
        elif object_type == "opportunity":
            query["data.stage"] = {"$nin": ["Closed Won", "Closed Lost"]}
        
        # Sort direction
        sort_dir = 1 if sort_order == "oldest_first" else -1
        
        # Fetch records
        records_cursor = self.db.object_records.find(query, {"_id": 0}).sort(
            "data.last_activity_at", sort_dir
        ).limit(max_rows)
        
        records = await records_cursor.to_list(max_rows)
        
        # Process records
        result_items = []
        
        for record in records:
            data = record.get("data", {})
            
            # Calculate days inactive - check both field names for compatibility
            last_activity = data.get("last_activity_at") or data.get("last_activity_date")
            days_inactive = inactivity_days  # Default
            
            if last_activity:
                try:
                    if isinstance(last_activity, str):
                        last_dt = datetime.fromisoformat(last_activity.replace('Z', '+00:00'))
                    else:
                        last_dt = last_activity
                    days_inactive = (now - last_dt).days
                except:
                    pass
            else:
                # Use created_at if no activity date
                created_at = record.get("created_at")
                if created_at:
                    try:
                        if isinstance(created_at, str):
                            created_dt = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
                        else:
                            created_dt = created_at
                        days_inactive = (now - created_dt).days
                    except:
                        pass
            
            # Get owner name
            owner_name = None
            owner_id = data.get("owner_id") or record.get("owner_id")
            if owner_id:
                owner = await self.db.users.find_one({"id": owner_id}, {"_id": 0, "full_name": 1, "email": 1})
                if owner:
                    owner_name = owner.get("full_name") or owner.get("email")
            
            # Get record name
            name = data.get("name") or \
                f"{data.get('first_name', '')} {data.get('last_name', '')}".strip() or \
                data.get("company") or \
                "Unnamed"
            
            result_items.append({
                "id": record.get("id"),
                "name": name,
                "object_type": object_type,
                "last_activity_date": last_activity,
                "days_inactive": days_inactive,
                "owner_name": owner_name
            })
        
        return {
            "items": result_items,
            "total": len(result_items),
            "object_type": object_type,
            "inactivity_days": inactivity_days
        }
    
    async def get_events_today(
        self,
        tenant_id: str,
        user_id: str,
        date_range: str = "today",
        max_rows: int = 5,
        show_location: bool = True
    ) -> Dict[str, Any]:
        """
        Get upcoming events for the user.
        Queries event records from object_records collection.
        """
        now = datetime.now(timezone.utc)
        today = now.replace(hour=0, minute=0, second=0, microsecond=0)
        
        # Calculate end date based on range
        if date_range == "today":
            end_date = today + timedelta(days=1)
        elif date_range == "next_7_days":
            end_date = today + timedelta(days=7)
        elif date_range == "next_15_days":
            end_date = today + timedelta(days=15)
        elif date_range == "next_30_days":
            end_date = today + timedelta(days=30)
        else:
            end_date = today + timedelta(days=7)  # Default
        
        # Build query for events
        query = {
            "tenant_id": tenant_id,
            "object_name": "event",
            "$or": [
                {"data.assigned_to": user_id},
                {"data.owner_id": user_id},
                {"owner_id": user_id}
            ],
            # Event should start within the date range
            "$and": [
                {
                    "$or": [
                        {"data.start_time": {"$gte": today.isoformat(), "$lt": end_date.isoformat()}},
                        {"data.start_date": {"$gte": today.isoformat(), "$lt": end_date.isoformat()}},
                        {"data.activity_date": {"$gte": today.isoformat(), "$lt": end_date.isoformat()}}
                    ]
                }
            ]
        }
        
        # Fetch events
        events_cursor = self.db.object_records.find(query, {"_id": 0}).sort(
            "data.start_time", 1
        ).limit(max_rows)
        
        events = await events_cursor.to_list(max_rows)
        
        result_events = []
        
        for event in events:
            data = event.get("data", {})
            
            # Get start time - try multiple field names
            start_time = data.get("start_time") or data.get("start_date") or data.get("activity_date")
            end_time = data.get("end_time") or data.get("end_date")
            
            # Get related record name
            related_to_name = None
            related_to_type = data.get("related_to_type") or data.get("what_type")
            related_to_id = data.get("related_to_id") or data.get("what_id")
            
            if related_to_id and related_to_type:
                related = await self.db.object_records.find_one({
                    "id": related_to_id,
                    "tenant_id": tenant_id
                }, {"_id": 0, "data.name": 1, "data.first_name": 1, "data.last_name": 1})
                
                if related:
                    related_data = related.get("data", {})
                    related_to_name = related_data.get("name") or \
                        f"{related_data.get('first_name', '')} {related_data.get('last_name', '')}".strip()
            
            result_events.append({
                "id": event.get("id"),
                "subject": data.get("subject") or data.get("name", "Untitled Event"),
                "start_time": start_time,
                "end_time": end_time,
                "location": data.get("location") if show_location else None,
                "is_online": data.get("is_online", False) or "zoom" in (data.get("location", "").lower() or ""),
                "related_to_type": related_to_type,
                "related_to_id": related_to_id,
                "related_to_name": related_to_name,
                "attendees_count": len(data.get("attendees", []))
            })
        
        return {
            "events": result_events,
            "total": len(result_events),
            "date_range": date_range
        }

    async def get_recent_records(
        self,
        tenant_id: str,
        user_id: str,
        record_type: str = "viewed",
        object_filter: str = "all",
        max_rows: int = 10
    ) -> Dict[str, Any]:
        """Get recently viewed/updated/created records"""
        
        # Build query based on record type
        if record_type == "viewed":
            # Get from user's recent views (we may need to track this separately)
            # For now, fall back to recently updated
            sort_field = "updated_at"
        elif record_type == "updated":
            sort_field = "updated_at"
        else:  # created
            sort_field = "created_at"
        
        query = {
            "tenant_id": tenant_id,
            "$or": [
                {"owner_id": user_id},
                {"created_by": user_id},
                {"updated_by": user_id}
            ]
        }
        
        # Object filter
        if object_filter != "all":
            query["object_name"] = object_filter
        else:
            # Only include main CRM objects
            query["object_name"] = {"$in": ["lead", "account", "contact", "opportunity", "task", "event"]}
        
        # Fetch records
        records = await self.db.object_records.find(query, {"_id": 0}).sort(
            sort_field, -1
        ).limit(max_rows).to_list(max_rows)
        
        result_items = []
        for record in records:
            data = record.get("data", {})
            
            # Get display name based on object type
            object_name = record.get("object_name", "")
            if object_name in ["contact", "lead"]:
                name = f"{data.get('first_name', '')} {data.get('last_name', '')}".strip()
            else:
                name = data.get("name") or data.get("subject") or "Unnamed"
            
            result_items.append({
                "id": record.get("id"),
                "name": name or "Unnamed",
                "object_type": object_name,
                "timestamp": record.get(sort_field),
                "series_id": record.get("series_id")
            })
        
        return {
            "records": result_items,
            "total": len(result_items),
            "record_type": record_type,
            "object_filter": object_filter
        }
