"""
Component Registry - System-level component definitions

Defines all available components that can be placed on pages.
Each component has:
- Unique ID
- Display name and description
- Category for organization
- Configuration schema (properties)
- Frontend component reference
"""
from typing import Dict, List
from .app_models import (
    ComponentRegistry, ComponentConfigField, ComponentCategory, PageRegion
)


def get_component_registry() -> Dict[str, ComponentRegistry]:
    """
    Returns the complete component registry.
    This defines all available page components and their configuration options.
    """
    return {
        # =================================================================
        # PRODUCTIVITY COMPONENTS
        # =================================================================
        "tasks_due": ComponentRegistry(
            id="tasks_due",
            name="Tasks Due",
            description="Shows tasks due for the current user with filtering options",
            category=ComponentCategory.PRODUCTIVITY,
            icon="check-square",
            frontend_component="TasksDueComponent",
            config_schema={
                "title": ComponentConfigField(
                    type="string",
                    label="Title",
                    default="Tasks Due",
                    required=True
                ),
                "date_range": ComponentConfigField(
                    type="enum",
                    label="Default Date Range",
                    default="next_7_days",
                    options=[
                        {"value": "today", "label": "Today"},
                        {"value": "next_7_days", "label": "Next 7 Days"},
                        {"value": "next_15_days", "label": "Next 15 Days"},
                        {"value": "next_30_days", "label": "Next 30 Days"},
                        {"value": "all", "label": "All Open"}
                    ]
                ),
                "show_overdue": ComponentConfigField(
                    type="boolean",
                    label="Show Overdue Tasks",
                    default=True
                ),
                "max_rows": ComponentConfigField(
                    type="number",
                    label="Max Display Rows",
                    default=10,
                    description="Maximum number of tasks to show"
                ),
                "show_completed": ComponentConfigField(
                    type="boolean",
                    label="Show Completed Tasks",
                    default=False
                ),
                "allow_inline_complete": ComponentConfigField(
                    type="boolean",
                    label="Allow Inline Mark Complete",
                    default=True
                )
            }
        ),
        
        "events_today": ComponentRegistry(
            id="events_today",
            name="Events Today",
            description="Shows upcoming calendar events for today and near future",
            category=ComponentCategory.PRODUCTIVITY,
            icon="calendar",
            frontend_component="EventsTodayComponent",
            config_schema={
                "title": ComponentConfigField(
                    type="string",
                    label="Title",
                    default="Upcoming Events",
                    required=True
                ),
                "date_range": ComponentConfigField(
                    type="enum",
                    label="Date Range",
                    default="today",
                    options=[
                        {"value": "today", "label": "Today"},
                        {"value": "next_7_days", "label": "Next 7 Days"},
                        {"value": "next_15_days", "label": "Next 15 Days"},
                        {"value": "next_30_days", "label": "Next 30 Days"}
                    ]
                ),
                "max_rows": ComponentConfigField(
                    type="number",
                    label="Max Display Rows",
                    default=5
                ),
                "show_location": ComponentConfigField(
                    type="boolean",
                    label="Show Location",
                    default=True
                )
            }
        ),
        
        # =================================================================
        # ANALYTICS COMPONENTS
        # =================================================================
        "pipeline_snapshot": ComponentRegistry(
            id="pipeline_snapshot",
            name="Pipeline Snapshot",
            description="Visual snapshot of pipeline stages with counts and amounts",
            category=ComponentCategory.ANALYTICS,
            icon="bar-chart-2",
            frontend_component="PipelineSnapshotComponent",
            config_schema={
                "title": ComponentConfigField(
                    type="string",
                    label="Title",
                    default="Pipeline Snapshot",
                    required=True
                ),
                "object_type": ComponentConfigField(
                    type="enum",
                    label="Object Type",
                    default="opportunity",
                    options=[
                        {"value": "opportunity", "label": "Opportunities"},
                        {"value": "lead", "label": "Leads"}
                    ]
                ),
                "group_by": ComponentConfigField(
                    type="enum",
                    label="Group By",
                    default="stage",
                    options=[
                        {"value": "stage", "label": "Stage"},
                        {"value": "status", "label": "Status"}
                    ]
                ),
                "display_mode": ComponentConfigField(
                    type="enum",
                    label="Display Mode",
                    default="count",
                    options=[
                        {"value": "count", "label": "Count"},
                        {"value": "amount", "label": "Sum of Amount"},
                        {"value": "both", "label": "Both"}
                    ]
                ),
                "date_range": ComponentConfigField(
                    type="enum",
                    label="Date Range",
                    default="this_quarter",
                    options=[
                        {"value": "this_month", "label": "This Month"},
                        {"value": "this_quarter", "label": "This Quarter"},
                        {"value": "this_year", "label": "This Year"},
                        {"value": "all", "label": "All Time"}
                    ]
                ),
                "chart_type": ComponentConfigField(
                    type="enum",
                    label="Chart Type",
                    default="bar",
                    options=[
                        {"value": "bar", "label": "Bar Chart"},
                        {"value": "donut", "label": "Donut Chart"},
                        {"value": "funnel", "label": "Funnel"}
                    ]
                )
            }
        ),
        
        "work_queue": ComponentRegistry(
            id="work_queue",
            name="Work Queue",
            description="Records needing attention based on inactivity",
            category=ComponentCategory.PRODUCTIVITY,
            icon="inbox",
            frontend_component="WorkQueueComponent",
            config_schema={
                "title": ComponentConfigField(
                    type="string",
                    label="Title",
                    default="Work Queue",
                    required=True
                ),
                "object_type": ComponentConfigField(
                    type="enum",
                    label="Object Type",
                    default="lead",
                    options=[
                        {"value": "lead", "label": "Leads"},
                        {"value": "account", "label": "Accounts"},
                        {"value": "contact", "label": "Contacts"},
                        {"value": "opportunity", "label": "Opportunities"}
                    ]
                ),
                "inactivity_days": ComponentConfigField(
                    type="number",
                    label="Days Inactive Threshold",
                    default=7,
                    description="Show records inactive for more than X days"
                ),
                "max_rows": ComponentConfigField(
                    type="number",
                    label="Max Display Rows",
                    default=10
                ),
                "sort_order": ComponentConfigField(
                    type="enum",
                    label="Sort Order",
                    default="oldest_first",
                    options=[
                        {"value": "oldest_first", "label": "Oldest First"},
                        {"value": "newest_first", "label": "Newest First"}
                    ]
                )
            }
        ),
        
        # =================================================================
        # STANDARD COMPONENTS
        # =================================================================
        "quick_actions": ComponentRegistry(
            id="quick_actions",
            name="Quick Actions",
            description="Customizable action buttons bar",
            category=ComponentCategory.STANDARD,
            icon="zap",
            frontend_component="QuickActionsComponent",
            min_width=6,
            max_width=12,
            supports_regions=[PageRegion.HEADER, PageRegion.FULL_WIDTH],
            config_schema={
                "title": ComponentConfigField(
                    type="string",
                    label="Title",
                    default="Quick Actions"
                ),
                "show_title": ComponentConfigField(
                    type="boolean",
                    label="Show Title",
                    default=False
                ),
                "actions": ComponentConfigField(
                    type="object",
                    label="Actions",
                    default=[
                        {"id": "new_lead", "label": "New Lead", "icon": "user-plus", "action_type": "create_record", "object": "lead"},
                        {"id": "new_contact", "label": "New Contact", "icon": "user", "action_type": "create_record", "object": "contact"},
                        {"id": "new_opportunity", "label": "New Opportunity", "icon": "target", "action_type": "create_record", "object": "opportunity"},
                        {"id": "new_task", "label": "New Task", "icon": "check-square", "action_type": "create_record", "object": "task"},
                        {"id": "new_event", "label": "New Event", "icon": "calendar", "action_type": "create_record", "object": "event"}
                    ],
                    description="List of quick action buttons"
                ),
                "max_visible": ComponentConfigField(
                    type="number",
                    label="Max Visible Actions",
                    default=5,
                    description="Additional actions shown in dropdown"
                ),
                "button_style": ComponentConfigField(
                    type="enum",
                    label="Button Style",
                    default="icon_text",
                    options=[
                        {"value": "icon_only", "label": "Icon Only"},
                        {"value": "text_only", "label": "Text Only"},
                        {"value": "icon_text", "label": "Icon + Text"}
                    ]
                )
            }
        ),
        
        "recent_records": ComponentRegistry(
            id="recent_records",
            name="Recent Records",
            description="Recently viewed or updated records",
            category=ComponentCategory.STANDARD,
            icon="clock",
            frontend_component="RecentRecordsComponent",
            config_schema={
                "title": ComponentConfigField(
                    type="string",
                    label="Title",
                    default="Recent Records",
                    required=True
                ),
                "record_type": ComponentConfigField(
                    type="enum",
                    label="Record Type",
                    default="viewed",
                    options=[
                        {"value": "viewed", "label": "Recently Viewed"},
                        {"value": "updated", "label": "Recently Updated"},
                        {"value": "created", "label": "Recently Created"}
                    ]
                ),
                "object_filter": ComponentConfigField(
                    type="enum",
                    label="Object Filter",
                    default="all",
                    options=[
                        {"value": "all", "label": "All Objects"},
                        {"value": "lead", "label": "Leads"},
                        {"value": "account", "label": "Accounts"},
                        {"value": "contact", "label": "Contacts"},
                        {"value": "opportunity", "label": "Opportunities"}
                    ]
                ),
                "max_rows": ComponentConfigField(
                    type="number",
                    label="Max Display Rows",
                    default=10
                )
            }
        ),
        
        "ai_next_best_actions": ComponentRegistry(
            id="ai_next_best_actions",
            name="AI Next Best Actions",
            description="AI-powered recommendations for next actions",
            category=ComponentCategory.ANALYTICS,
            icon="sparkles",
            frontend_component="AINextBestActionsComponent",
            config_schema={
                "title": ComponentConfigField(
                    type="string",
                    label="Title",
                    default="Next Best Actions",
                    required=True
                ),
                "suggestion_types": ComponentConfigField(
                    type="object",
                    label="Suggestion Types",
                    default=["follow_up", "upsell", "at_risk", "engagement"],
                    description="Types of suggestions to show"
                ),
                "max_suggestions": ComponentConfigField(
                    type="number",
                    label="Max Suggestions",
                    default=5
                ),
                "priority_threshold": ComponentConfigField(
                    type="enum",
                    label="Priority Threshold",
                    default="all",
                    options=[
                        {"value": "high", "label": "High Priority Only"},
                        {"value": "medium", "label": "Medium & High"},
                        {"value": "all", "label": "All Priorities"}
                    ]
                )
            }
        ),
        
        # =================================================================
        # CONTENT COMPONENTS
        # =================================================================
        "rich_text": ComponentRegistry(
            id="rich_text",
            name="Rich Text",
            description="Custom HTML content block",
            category=ComponentCategory.CUSTOM,
            icon="file-text",
            frontend_component="RichTextComponent",
            config_schema={
                "content": ComponentConfigField(
                    type="string",
                    label="Content",
                    default="<p>Enter your content here...</p>",
                    description="HTML content"
                ),
                "padding": ComponentConfigField(
                    type="enum",
                    label="Padding",
                    default="medium",
                    options=[
                        {"value": "none", "label": "None"},
                        {"value": "small", "label": "Small"},
                        {"value": "medium", "label": "Medium"},
                        {"value": "large", "label": "Large"}
                    ]
                )
            }
        ),
        
        "list_view": ComponentRegistry(
            id="list_view",
            name="List View",
            description="Embedded object list view",
            category=ComponentCategory.DATA,
            icon="list",
            frontend_component="ListViewComponent",
            config_schema={
                "title": ComponentConfigField(
                    type="string",
                    label="Title",
                    default="Records"
                ),
                "object_type": ComponentConfigField(
                    type="string",
                    label="Object Type",
                    default="account",
                    required=True
                ),
                "list_view_id": ComponentConfigField(
                    type="string",
                    label="List View ID",
                    description="Leave empty for default view"
                ),
                "max_rows": ComponentConfigField(
                    type="number",
                    label="Max Display Rows",
                    default=10
                ),
                "show_actions": ComponentConfigField(
                    type="boolean",
                    label="Show Row Actions",
                    default=True
                )
            }
        ),
        
        "report_chart": ComponentRegistry(
            id="report_chart",
            name="Report Chart",
            description="Embedded report visualization",
            category=ComponentCategory.ANALYTICS,
            icon="pie-chart",
            frontend_component="ReportChartComponent",
            config_schema={
                "title": ComponentConfigField(
                    type="string",
                    label="Title",
                    default="Report"
                ),
                "report_id": ComponentConfigField(
                    type="string",
                    label="Report ID",
                    required=True,
                    description="ID of the report to display"
                ),
                "chart_type": ComponentConfigField(
                    type="enum",
                    label="Chart Type",
                    default="auto",
                    options=[
                        {"value": "auto", "label": "Auto (from report)"},
                        {"value": "bar", "label": "Bar Chart"},
                        {"value": "line", "label": "Line Chart"},
                        {"value": "pie", "label": "Pie Chart"}
                    ]
                ),
                "show_title": ComponentConfigField(
                    type="boolean",
                    label="Show Title",
                    default=True
                )
            }
        ),
        
        "dashboard_embed": ComponentRegistry(
            id="dashboard_embed",
            name="Dashboard",
            description="Embedded dashboard",
            category=ComponentCategory.ANALYTICS,
            icon="layout-dashboard",
            frontend_component="DashboardEmbedComponent",
            min_width=6,
            config_schema={
                "dashboard_id": ComponentConfigField(
                    type="string",
                    label="Dashboard ID",
                    required=True,
                    description="ID of the dashboard to embed"
                ),
                "show_title": ComponentConfigField(
                    type="boolean",
                    label="Show Dashboard Title",
                    default=True
                ),
                "height": ComponentConfigField(
                    type="enum",
                    label="Height",
                    default="medium",
                    options=[
                        {"value": "small", "label": "Small (300px)"},
                        {"value": "medium", "label": "Medium (400px)"},
                        {"value": "large", "label": "Large (600px)"},
                        {"value": "auto", "label": "Auto"}
                    ]
                )
            }
        ),
        
        # =================================================================
        # SETUP HOME SPECIFIC COMPONENTS
        # =================================================================
        "setup_quick_find": ComponentRegistry(
            id="setup_quick_find",
            name="Quick Find",
            description="Search setup sections",
            category=ComponentCategory.STANDARD,
            icon="search",
            frontend_component="SetupQuickFindComponent",
            supports_regions=[PageRegion.SIDEBAR],
            config_schema={
                "placeholder": ComponentConfigField(
                    type="string",
                    label="Placeholder Text",
                    default="Quick Find..."
                )
            }
        ),
        
        "setup_shortcuts": ComponentRegistry(
            id="setup_shortcuts",
            name="Create Shortcuts",
            description="Quick links to create common setup items",
            category=ComponentCategory.STANDARD,
            icon="plus-square",
            frontend_component="SetupShortcutsComponent",
            config_schema={
                "title": ComponentConfigField(
                    type="string",
                    label="Title",
                    default="Create"
                ),
                "shortcuts": ComponentConfigField(
                    type="object",
                    label="Shortcuts",
                    default=[
                        {"id": "new_user", "label": "New User", "icon": "user-plus", "route": "/setup/users/new"},
                        {"id": "new_object", "label": "New Object", "icon": "database", "route": "/setup/objects/new"},
                        {"id": "new_field", "label": "New Field", "icon": "columns", "route": "/setup/fields/new"},
                        {"id": "new_automation", "label": "New Automation", "icon": "workflow", "route": "/setup/automations/new"}
                    ]
                )
            }
        ),
        
        "system_health": ComponentRegistry(
            id="system_health",
            name="System Health",
            description="System health metrics and status",
            category=ComponentCategory.ANALYTICS,
            icon="activity",
            frontend_component="SystemHealthComponent",
            config_schema={
                "title": ComponentConfigField(
                    type="string",
                    label="Title",
                    default="System Health"
                ),
                "metrics": ComponentConfigField(
                    type="object",
                    label="Metrics to Show",
                    default=["email_domain", "webhook_health", "api_usage", "storage"]
                )
            }
        ),
        
        "recommendations": ComponentRegistry(
            id="recommendations",
            name="Recommendations",
            description="Setup recommendations and suggestions",
            category=ComponentCategory.STANDARD,
            icon="lightbulb",
            frontend_component="RecommendationsComponent",
            config_schema={
                "title": ComponentConfigField(
                    type="string",
                    label="Title",
                    default="Recommendations"
                ),
                "max_items": ComponentConfigField(
                    type="number",
                    label="Max Items",
                    default=5
                ),
                "categories": ComponentConfigField(
                    type="object",
                    label="Categories",
                    default=["security", "performance", "adoption", "features"]
                )
            }
        )
    }


# Template definitions for page layouts
PAGE_TEMPLATES = {
    "blank": {
        "name": "Blank",
        "description": "Empty page with single region",
        "regions": ["main"],
        "grid": {"main": {"cols": 12, "rows": "auto"}}
    },
    "header_one_column": {
        "name": "Header + 1 Column",
        "description": "Header area with single column content",
        "regions": ["header", "main"],
        "grid": {
            "header": {"cols": 12, "rows": 1},
            "main": {"cols": 12, "rows": "auto"}
        }
    },
    "header_two_column": {
        "name": "Header + 2 Columns",
        "description": "Header with two equal columns",
        "regions": ["header", "left_column", "right_column"],
        "grid": {
            "header": {"cols": 12, "rows": 1},
            "left_column": {"cols": 6, "rows": "auto"},
            "right_column": {"cols": 6, "rows": "auto"}
        }
    },
    "header_sidebar": {
        "name": "Header + Sidebar",
        "description": "Header with main area and sidebar",
        "regions": ["header", "main", "sidebar"],
        "grid": {
            "header": {"cols": 12, "rows": 1},
            "main": {"cols": 8, "rows": "auto"},
            "sidebar": {"cols": 4, "rows": "auto"}
        }
    },
    "three_column": {
        "name": "3 Columns",
        "description": "Three equal columns layout",
        "regions": ["left_column", "main", "right_column"],
        "grid": {
            "left_column": {"cols": 4, "rows": "auto"},
            "main": {"cols": 4, "rows": "auto"},
            "right_column": {"cols": 4, "rows": "auto"}
        }
    }
}
