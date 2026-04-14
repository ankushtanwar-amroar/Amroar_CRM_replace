"""
Custom Dashboard Service - Phase 16
Handles CRUD for dashboards, widgets, sharing, and permissions
"""
import logging
import uuid
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List

logger = logging.getLogger(__name__)

# Widget type definitions
WIDGET_TYPES = {
    "kpi_card": {
        "name": "KPI Card",
        "description": "Single metric display",
        "default_size": {"w": 3, "h": 2}
    },
    "bar_chart": {
        "name": "Bar Chart",
        "description": "Horizontal or vertical bar chart",
        "default_size": {"w": 6, "h": 4}
    },
    "line_chart": {
        "name": "Line Chart",
        "description": "Trend line visualization",
        "default_size": {"w": 6, "h": 4}
    },
    "pie_chart": {
        "name": "Pie Chart",
        "description": "Proportional data visualization",
        "default_size": {"w": 4, "h": 4}
    },
    "table": {
        "name": "Table",
        "description": "Sortable data table",
        "default_size": {"w": 6, "h": 5}
    }
}

# Data sources from existing reports
DATA_SOURCES = {
    "task_performance": {
        "name": "Task Performance",
        "metrics": ["total_created", "total_completed", "completion_rate", "avg_cycle_time_hours", "avg_cycle_time_days"],
        "breakdowns": ["by_status", "by_priority", "by_project", "by_assignee"],
        "trend": "trend"
    },
    "time_tracking": {
        "name": "Time Tracking",
        "metrics": ["total_hours", "total_minutes", "total_entries"],
        "breakdowns": ["by_project", "by_task", "by_user"],
        "trend": "daily_trend"
    },
    "sla_compliance": {
        "name": "SLA Compliance",
        "metrics": ["total_with_sla", "met", "breached", "at_risk", "breach_rate", "compliance_rate"],
        "breakdowns": ["by_project", "by_priority", "by_assignee"],
        "table": "breached_tasks"
    },
    "recurring_tasks": {
        "name": "Recurring Tasks",
        "metrics": ["total_rules", "active_rules", "paused_rules", "total_generated", "success_rate"],
        "breakdowns": ["by_type"],
        "table": "rules",
        "trend": "trend"
    },
    "approval_analytics": {
        "name": "Approval Analytics",
        "metrics": ["total", "approved", "rejected", "pending", "approval_rate", "rejection_rate", "avg_turnaround_hours"],
        "breakdowns": ["by_workflow", "by_approver"],
        "trend": "trend",
        "table": "export_table"
    }
}

MAX_WIDGETS_PER_DASHBOARD = 12


class CustomDashboardService:
    """Service for managing custom dashboards"""
    
    def __init__(self, db):
        self.db = db
        self.dashboards = db.tm_dashboards
        self.audit_logs = db.tm_dashboard_audit_logs
        self.settings = db.tm_settings
    
    # =========================================================================
    # ADMIN SETTINGS
    # =========================================================================
    
    async def is_feature_enabled(self, tenant_id: str) -> bool:
        """Check if custom dashboards feature is enabled"""
        setting = await self.settings.find_one({
            "tenant_id": tenant_id,
            "key": "custom_dashboards_enabled"
        })
        # Enabled by default
        return setting.get("value", True) if setting else True
    
    async def set_feature_enabled(self, tenant_id: str, enabled: bool, user_id: str) -> bool:
        """Enable or disable custom dashboards feature"""
        await self.settings.update_one(
            {"tenant_id": tenant_id, "key": "custom_dashboards_enabled"},
            {
                "$set": {
                    "value": enabled,
                    "updated_at": datetime.now(timezone.utc),
                    "updated_by": user_id
                }
            },
            upsert=True
        )
        
        await self._log_audit(
            tenant_id=tenant_id,
            user_id=user_id,
            action="feature_toggle",
            details={"enabled": enabled}
        )
        
        return enabled
    
    # =========================================================================
    # DASHBOARD CRUD
    # =========================================================================
    
    async def create_dashboard(
        self,
        tenant_id: str,
        user_id: str,
        name: str,
        description: Optional[str] = None,
        global_filters: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Create a new dashboard"""
        dashboard_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc)
        
        dashboard = {
            "id": dashboard_id,
            "tenant_id": tenant_id,
            "owner_id": user_id,
            "name": name,
            "description": description or "",
            "widgets": [],
            "layout": [],
            "global_filters": global_filters or {
                "date_range": "last_30_days",
                "project_id": None
            },
            "is_active": True,
            "shared_with": [],  # List of {user_id, role_id, access_level}
            "created_at": now,
            "updated_at": now
        }
        
        await self.dashboards.insert_one(dashboard)
        
        await self._log_audit(
            tenant_id=tenant_id,
            user_id=user_id,
            action="dashboard_created",
            dashboard_id=dashboard_id,
            details={"name": name}
        )
        
        dashboard.pop("_id", None)
        return dashboard
    
    async def get_dashboard(
        self,
        dashboard_id: str,
        tenant_id: str,
        user_id: str
    ) -> Optional[Dict[str, Any]]:
        """Get a dashboard if user has access"""
        dashboard = await self.dashboards.find_one(
            {"id": dashboard_id, "tenant_id": tenant_id, "is_active": True},
            {"_id": 0}
        )
        
        if not dashboard:
            return None
        
        # Check access
        if not self._has_access(dashboard, user_id):
            return None
        
        # Add access_level to response
        dashboard["access_level"] = self._get_access_level(dashboard, user_id)
        
        return dashboard
    
    async def list_dashboards(
        self,
        tenant_id: str,
        user_id: str,
        include_shared: bool = True
    ) -> List[Dict[str, Any]]:
        """List dashboards user has access to"""
        query = {
            "tenant_id": tenant_id,
            "is_active": True,
            "$or": [
                {"owner_id": user_id}
            ]
        }
        
        if include_shared:
            query["$or"].append({"shared_with.user_id": user_id})
        
        dashboards = await self.dashboards.find(
            query,
            {"_id": 0, "id": 1, "name": 1, "description": 1, "owner_id": 1, 
             "created_at": 1, "updated_at": 1, "widgets": 1, "shared_with": 1}
        ).sort("updated_at", -1).to_list(100)
        
        # Add widget count and access level
        for d in dashboards:
            d["widget_count"] = len(d.get("widgets", []))
            d["access_level"] = "owner" if d["owner_id"] == user_id else "viewer"
            d["is_owner"] = d["owner_id"] == user_id
            d.pop("widgets", None)
        
        return dashboards
    
    async def update_dashboard(
        self,
        dashboard_id: str,
        tenant_id: str,
        user_id: str,
        updates: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """Update dashboard (owner only)"""
        dashboard = await self.dashboards.find_one(
            {"id": dashboard_id, "tenant_id": tenant_id, "is_active": True}
        )
        
        if not dashboard:
            return None
        
        # Only owner can update
        if dashboard["owner_id"] != user_id:
            return None
        
        # Remove protected fields
        protected = ["id", "tenant_id", "owner_id", "created_at"]
        for field in protected:
            updates.pop(field, None)
        
        updates["updated_at"] = datetime.now(timezone.utc)
        
        result = await self.dashboards.find_one_and_update(
            {"id": dashboard_id, "tenant_id": tenant_id},
            {"$set": updates},
            return_document=True
        )
        
        if result:
            await self._log_audit(
                tenant_id=tenant_id,
                user_id=user_id,
                action="dashboard_updated",
                dashboard_id=dashboard_id,
                details={"fields": list(updates.keys())}
            )
            result.pop("_id", None)
        
        return result
    
    async def delete_dashboard(
        self,
        dashboard_id: str,
        tenant_id: str,
        user_id: str
    ) -> bool:
        """Soft delete dashboard (owner only)"""
        dashboard = await self.dashboards.find_one(
            {"id": dashboard_id, "tenant_id": tenant_id, "is_active": True}
        )
        
        if not dashboard or dashboard["owner_id"] != user_id:
            return False
        
        await self.dashboards.update_one(
            {"id": dashboard_id},
            {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc)}}
        )
        
        await self._log_audit(
            tenant_id=tenant_id,
            user_id=user_id,
            action="dashboard_deleted",
            dashboard_id=dashboard_id
        )
        
        return True
    
    async def clone_dashboard(
        self,
        dashboard_id: str,
        tenant_id: str,
        user_id: str,
        new_name: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        """Clone a dashboard"""
        dashboard = await self.dashboards.find_one(
            {"id": dashboard_id, "tenant_id": tenant_id, "is_active": True}
        )
        
        if not dashboard:
            return None
        
        # Check access
        if not self._has_access(dashboard, user_id):
            return None
        
        # Create clone
        new_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc)
        
        clone = {
            "id": new_id,
            "tenant_id": tenant_id,
            "owner_id": user_id,  # New owner
            "name": new_name or f"{dashboard['name']} (Copy)",
            "description": dashboard.get("description", ""),
            "widgets": dashboard.get("widgets", []).copy(),
            "layout": dashboard.get("layout", []).copy(),
            "global_filters": dashboard.get("global_filters", {}).copy(),
            "is_active": True,
            "shared_with": [],  # Not shared by default
            "created_at": now,
            "updated_at": now
        }
        
        # Update widget IDs
        for widget in clone["widgets"]:
            old_id = widget["id"]
            new_widget_id = str(uuid.uuid4())
            widget["id"] = new_widget_id
            # Update layout reference
            for layout_item in clone["layout"]:
                if layout_item.get("i") == old_id:
                    layout_item["i"] = new_widget_id
        
        await self.dashboards.insert_one(clone)
        
        await self._log_audit(
            tenant_id=tenant_id,
            user_id=user_id,
            action="dashboard_cloned",
            dashboard_id=new_id,
            details={"source_id": dashboard_id}
        )
        
        clone.pop("_id", None)
        return clone
    
    # =========================================================================
    # WIDGET MANAGEMENT
    # =========================================================================
    
    async def add_widget(
        self,
        dashboard_id: str,
        tenant_id: str,
        user_id: str,
        widget_type: str,
        title: str,
        data_source: str,
        config: Dict[str, Any],
        layout: Optional[Dict[str, Any]] = None
    ) -> Optional[Dict[str, Any]]:
        """Add a widget to dashboard"""
        dashboard = await self.dashboards.find_one(
            {"id": dashboard_id, "tenant_id": tenant_id, "is_active": True}
        )
        
        if not dashboard or dashboard["owner_id"] != user_id:
            return None
        
        # Check widget limit
        if len(dashboard.get("widgets", [])) >= MAX_WIDGETS_PER_DASHBOARD:
            raise ValueError(f"Maximum {MAX_WIDGETS_PER_DASHBOARD} widgets per dashboard")
        
        # Validate widget type
        if widget_type not in WIDGET_TYPES:
            raise ValueError(f"Invalid widget type: {widget_type}")
        
        # Validate data source
        if data_source not in DATA_SOURCES:
            raise ValueError(f"Invalid data source: {data_source}")
        
        widget_id = str(uuid.uuid4())
        default_size = WIDGET_TYPES[widget_type]["default_size"]
        
        widget = {
            "id": widget_id,
            "type": widget_type,
            "title": title,
            "data_source": data_source,
            "config": config,  # metric, breakdown, chart_type, filters, etc.
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        
        # Calculate layout position
        existing_layout = dashboard.get("layout", [])
        max_y = max([l.get("y", 0) + l.get("h", 0) for l in existing_layout], default=0)
        
        widget_layout = layout or {
            "i": widget_id,
            "x": 0,
            "y": max_y,
            "w": default_size["w"],
            "h": default_size["h"]
        }
        widget_layout["i"] = widget_id
        
        await self.dashboards.update_one(
            {"id": dashboard_id},
            {
                "$push": {
                    "widgets": widget,
                    "layout": widget_layout
                },
                "$set": {"updated_at": datetime.now(timezone.utc)}
            }
        )
        
        await self._log_audit(
            tenant_id=tenant_id,
            user_id=user_id,
            action="widget_added",
            dashboard_id=dashboard_id,
            details={"widget_id": widget_id, "type": widget_type, "title": title}
        )
        
        return {"widget": widget, "layout": widget_layout}
    
    async def update_widget(
        self,
        dashboard_id: str,
        widget_id: str,
        tenant_id: str,
        user_id: str,
        updates: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """Update a widget"""
        dashboard = await self.dashboards.find_one(
            {"id": dashboard_id, "tenant_id": tenant_id, "is_active": True}
        )
        
        if not dashboard or dashboard["owner_id"] != user_id:
            return None
        
        # Find and update widget
        widgets = dashboard.get("widgets", [])
        widget_found = False
        
        for widget in widgets:
            if widget["id"] == widget_id:
                widget_found = True
                for key, value in updates.items():
                    if key not in ["id", "created_at"]:
                        widget[key] = value
                break
        
        if not widget_found:
            return None
        
        await self.dashboards.update_one(
            {"id": dashboard_id},
            {
                "$set": {
                    "widgets": widgets,
                    "updated_at": datetime.now(timezone.utc)
                }
            }
        )
        
        await self._log_audit(
            tenant_id=tenant_id,
            user_id=user_id,
            action="widget_updated",
            dashboard_id=dashboard_id,
            details={"widget_id": widget_id}
        )
        
        return {"widget_id": widget_id, "updated": True}
    
    async def remove_widget(
        self,
        dashboard_id: str,
        widget_id: str,
        tenant_id: str,
        user_id: str
    ) -> bool:
        """Remove a widget from dashboard"""
        dashboard = await self.dashboards.find_one(
            {"id": dashboard_id, "tenant_id": tenant_id, "is_active": True}
        )
        
        if not dashboard or dashboard["owner_id"] != user_id:
            return False
        
        await self.dashboards.update_one(
            {"id": dashboard_id},
            {
                "$pull": {
                    "widgets": {"id": widget_id},
                    "layout": {"i": widget_id}
                },
                "$set": {"updated_at": datetime.now(timezone.utc)}
            }
        )
        
        await self._log_audit(
            tenant_id=tenant_id,
            user_id=user_id,
            action="widget_removed",
            dashboard_id=dashboard_id,
            details={"widget_id": widget_id}
        )
        
        return True
    
    async def update_layout(
        self,
        dashboard_id: str,
        tenant_id: str,
        user_id: str,
        layout: List[Dict[str, Any]]
    ) -> bool:
        """Update dashboard layout (widget positions/sizes)"""
        dashboard = await self.dashboards.find_one(
            {"id": dashboard_id, "tenant_id": tenant_id, "is_active": True}
        )
        
        if not dashboard or dashboard["owner_id"] != user_id:
            return False
        
        await self.dashboards.update_one(
            {"id": dashboard_id},
            {
                "$set": {
                    "layout": layout,
                    "updated_at": datetime.now(timezone.utc)
                }
            }
        )
        
        await self._log_audit(
            tenant_id=tenant_id,
            user_id=user_id,
            action="layout_updated",
            dashboard_id=dashboard_id
        )
        
        return True
    
    # =========================================================================
    # SHARING & PERMISSIONS
    # =========================================================================
    
    async def share_dashboard(
        self,
        dashboard_id: str,
        tenant_id: str,
        owner_id: str,
        share_with: List[Dict[str, str]]  # [{user_id: str, access_level: "viewer"}]
    ) -> bool:
        """Share dashboard with users"""
        dashboard = await self.dashboards.find_one(
            {"id": dashboard_id, "tenant_id": tenant_id, "is_active": True}
        )
        
        if not dashboard or dashboard["owner_id"] != owner_id:
            return False
        
        # Validate and format share entries
        valid_shares = []
        for share in share_with:
            if share.get("user_id") and share["user_id"] != owner_id:
                valid_shares.append({
                    "user_id": share["user_id"],
                    "access_level": "viewer",  # Always viewer (read-only)
                    "shared_at": datetime.now(timezone.utc).isoformat()
                })
        
        await self.dashboards.update_one(
            {"id": dashboard_id},
            {
                "$set": {
                    "shared_with": valid_shares,
                    "updated_at": datetime.now(timezone.utc)
                }
            }
        )
        
        await self._log_audit(
            tenant_id=tenant_id,
            user_id=owner_id,
            action="dashboard_shared",
            dashboard_id=dashboard_id,
            details={"shared_count": len(valid_shares)}
        )
        
        return True
    
    async def unshare_dashboard(
        self,
        dashboard_id: str,
        tenant_id: str,
        owner_id: str,
        user_id_to_remove: str
    ) -> bool:
        """Remove user from shared list"""
        dashboard = await self.dashboards.find_one(
            {"id": dashboard_id, "tenant_id": tenant_id, "is_active": True}
        )
        
        if not dashboard or dashboard["owner_id"] != owner_id:
            return False
        
        await self.dashboards.update_one(
            {"id": dashboard_id},
            {
                "$pull": {"shared_with": {"user_id": user_id_to_remove}},
                "$set": {"updated_at": datetime.now(timezone.utc)}
            }
        )
        
        await self._log_audit(
            tenant_id=tenant_id,
            user_id=owner_id,
            action="dashboard_unshared",
            dashboard_id=dashboard_id,
            details={"removed_user": user_id_to_remove}
        )
        
        return True
    
    # =========================================================================
    # WIDGET DATA FETCHING
    # =========================================================================
    
    async def get_widget_data(
        self,
        widget: Dict[str, Any],
        tenant_id: str,
        global_filters: Dict[str, Any],
        reports_service
    ) -> Dict[str, Any]:
        """Fetch data for a widget from reports service"""
        data_source = widget.get("data_source")
        config = widget.get("config", {})
        
        # Apply widget-specific filter overrides
        filters = global_filters.copy()
        if config.get("filters"):
            filters.update(config["filters"])
        
        # Parse date range
        start_date = None
        end_date = None
        date_range = filters.get("date_range", "last_30_days")
        
        from datetime import timedelta
        now = datetime.now(timezone.utc)
        
        if date_range == "last_7_days":
            start_date = now - timedelta(days=7)
        elif date_range == "last_30_days":
            start_date = now - timedelta(days=30)
        elif date_range == "last_90_days":
            start_date = now - timedelta(days=90)
        elif filters.get("start_date"):
            start_date = datetime.fromisoformat(filters["start_date"].replace("Z", "+00:00"))
        
        if filters.get("end_date"):
            end_date = datetime.fromisoformat(filters["end_date"].replace("Z", "+00:00"))
        
        project_id = filters.get("project_id")
        
        try:
            # Fetch report data based on source
            if data_source == "task_performance":
                report = await reports_service.get_task_performance_report(
                    tenant_id=tenant_id,
                    start_date=start_date,
                    end_date=end_date,
                    project_id=project_id
                )
            elif data_source == "time_tracking":
                report = await reports_service.get_time_tracking_report(
                    tenant_id=tenant_id,
                    start_date=start_date,
                    end_date=end_date,
                    project_id=project_id
                )
            elif data_source == "sla_compliance":
                report = await reports_service.get_sla_compliance_report(
                    tenant_id=tenant_id,
                    start_date=start_date,
                    end_date=end_date,
                    project_id=project_id
                )
            elif data_source == "recurring_tasks":
                report = await reports_service.get_recurring_tasks_report(
                    tenant_id=tenant_id,
                    start_date=start_date,
                    end_date=end_date,
                    project_id=project_id
                )
            elif data_source == "approval_analytics":
                report = await reports_service.get_approval_analytics_report(
                    tenant_id=tenant_id,
                    start_date=start_date,
                    end_date=end_date,
                    project_id=project_id
                )
            else:
                return {"error": f"Unknown data source: {data_source}"}
            
            # Extract relevant data based on widget type and config
            widget_type = widget.get("type")
            
            if widget_type == "kpi_card":
                metric = config.get("metric", "total")
                value = report.get("summary", {}).get(metric, 0)
                return {
                    "value": value,
                    "metric": metric,
                    "label": config.get("label", metric.replace("_", " ").title())
                }
            
            elif widget_type in ["bar_chart", "line_chart", "pie_chart"]:
                breakdown = config.get("breakdown")
                if breakdown and breakdown in report:
                    return {"data": report[breakdown]}
                elif config.get("use_trend") and "trend" in report:
                    return {"data": report["trend"]}
                elif "daily_trend" in report:
                    return {"data": report["daily_trend"]}
                else:
                    # Default to first available breakdown
                    for key in ["by_status", "by_project", "by_priority", "by_type"]:
                        if key in report:
                            return {"data": report[key]}
                return {"data": []}
            
            elif widget_type == "table":
                table_key = config.get("table_key")
                if table_key and table_key in report:
                    return {"data": report[table_key][:config.get("limit", 20)]}
                # Default tables
                for key in ["export_table", "breached_tasks", "rules", "by_project", "by_user"]:
                    if key in report:
                        return {"data": report[key][:config.get("limit", 20)]}
                return {"data": []}
            
            return {"error": "Invalid widget configuration"}
            
        except Exception as e:
            logger.error(f"Error fetching widget data: {e}")
            return {"error": str(e)}
    
    # =========================================================================
    # AUDIT LOGGING
    # =========================================================================
    
    async def _log_audit(
        self,
        tenant_id: str,
        user_id: str,
        action: str,
        dashboard_id: Optional[str] = None,
        details: Optional[Dict[str, Any]] = None
    ):
        """Log dashboard action for audit"""
        log = {
            "id": str(uuid.uuid4()),
            "tenant_id": tenant_id,
            "user_id": user_id,
            "action": action,
            "dashboard_id": dashboard_id,
            "details": details or {},
            "created_at": datetime.now(timezone.utc)
        }
        await self.audit_logs.insert_one(log)
    
    async def get_audit_logs(
        self,
        tenant_id: str,
        dashboard_id: Optional[str] = None,
        limit: int = 50
    ) -> List[Dict[str, Any]]:
        """Get audit logs"""
        query = {"tenant_id": tenant_id}
        if dashboard_id:
            query["dashboard_id"] = dashboard_id
        
        logs = await self.audit_logs.find(
            query,
            {"_id": 0}
        ).sort("created_at", -1).limit(limit).to_list(limit)
        
        return logs
    
    # =========================================================================
    # HELPER METHODS
    # =========================================================================
    
    def _has_access(self, dashboard: Dict[str, Any], user_id: str) -> bool:
        """Check if user has access to dashboard"""
        if dashboard["owner_id"] == user_id:
            return True
        
        shared_with = dashboard.get("shared_with", [])
        return any(s["user_id"] == user_id for s in shared_with)
    
    def _get_access_level(self, dashboard: Dict[str, Any], user_id: str) -> str:
        """Get user's access level for dashboard"""
        if dashboard["owner_id"] == user_id:
            return "owner"
        return "viewer"
    
    def get_widget_types(self) -> Dict[str, Any]:
        """Get available widget types"""
        return WIDGET_TYPES
    
    def get_data_sources(self) -> Dict[str, Any]:
        """Get available data sources"""
        return DATA_SOURCES
