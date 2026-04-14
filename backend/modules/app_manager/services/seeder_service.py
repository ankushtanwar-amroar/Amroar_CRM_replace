"""
Seeder Service for App Manager

Pre-creates the default Sales app with a configured Home page.
This is idempotent - running multiple times won't create duplicates.
"""
from datetime import datetime, timezone
from typing import Dict, Any
from motor.motor_asyncio import AsyncIOMotorDatabase
import logging

from ..models.app_models import (
    PageType, PageTemplate, PageRegion, PageLayout, PageComponentConfig,
    CrmApp, CrmPage, CrmAppNavigation, NavItem, NavItemType, AppNavigationStyle
)

logger = logging.getLogger(__name__)


async def seed_default_sales_app(
    db: AsyncIOMotorDatabase,
    user_id: str,
    tenant_id: str
) -> Dict[str, Any]:
    """
    Seed the default Sales Console app with pre-configured components.
    
    The Sales Console Home page includes:
    - Quick Actions Bar (header)
    - Tasks Due Today (left column)
    - Pipeline Snapshot (right column)
    
    This is idempotent - will not create duplicates.
    """
    apps_collection = db.crm_apps
    pages_collection = db.crm_pages
    nav_collection = db.crm_app_navigation
    
    # Check if Sales Console app already exists (also check old "sales" name for migration)
    existing_app = await apps_collection.find_one({
        "tenant_id": tenant_id,
        "$or": [
            {"api_name": "sales_console"},
            {"api_name": "sales"}
        ]
    })
    
    if existing_app:
        # If it's the old "Sales" app, rename it to "Sales Console"
        if existing_app.get("name") == "Sales" or existing_app.get("api_name") == "sales":
            await apps_collection.update_one(
                {"id": existing_app["id"]},
                {"$set": {
                    "name": "Sales Console",
                    "api_name": "sales_console",
                    "description": "Sales Console application for managing leads, accounts, contacts, and opportunities"
                }}
            )
            logger.info(f"Renamed Sales app to Sales Console for tenant {tenant_id}")
            return {
                "status": "renamed",
                "app_id": existing_app.get("id"),
                "message": "Sales app renamed to Sales Console"
            }
        
        logger.info(f"Sales Console app already exists for tenant {tenant_id}")
        return {
            "status": "already_exists",
            "app_id": existing_app.get("id"),
            "message": "Sales Console app already exists"
        }
    
    now = datetime.now(timezone.utc)
    
    # Create Sales Console App
    import uuid
    app_id = str(uuid.uuid4())
    home_page_id = str(uuid.uuid4())
    
    sales_app = {
        "id": app_id,
        "name": "Sales Console",
        "api_name": "sales_console",
        "description": "Sales Console application for managing leads, accounts, contacts, and opportunities",
        "icon": "trending-up",
        "navigation_style": AppNavigationStyle.STANDARD.value,
        "utility_bar": False,
        "is_active": True,
        "home_page_id": home_page_id,
        "tenant_id": tenant_id,
        "created_at": now,
        "created_by": user_id,
        "updated_at": now,
        "updated_by": user_id
    }
    
    # Create Sales Console Home Page with components
    sales_home = {
        "id": home_page_id,
        "name": "Sales Console Home",
        "api_name": "sales_console_home",
        "description": "Sales Console home page with dashboard components",
        "type": PageType.HOME_PAGE.value,
        "app_id": app_id,
        "layout": {
            "template": PageTemplate.HEADER_TWO_COLUMN.value,
            "regions": {
                "header": [
                    {
                        "id": str(uuid.uuid4()),
                        "component_type": "quick_actions",
                        "region": PageRegion.HEADER.value,
                        "order": 0,
                        "config": {
                            "title": "Quick Actions",
                            "show_title": False,
                            "actions": [
                                {"id": "new_lead", "label": "New Lead", "icon": "user-plus", "action_type": "create_record", "object": "lead"},
                                {"id": "new_contact", "label": "New Contact", "icon": "user", "action_type": "create_record", "object": "contact"},
                                {"id": "new_account", "label": "New Account", "icon": "building", "action_type": "create_record", "object": "account"},
                                {"id": "new_opportunity", "label": "New Opportunity", "icon": "target", "action_type": "create_record", "object": "opportunity"},
                                {"id": "new_task", "label": "New Task", "icon": "check-square", "action_type": "create_record", "object": "task"},
                                {"id": "new_event", "label": "New Event", "icon": "calendar", "action_type": "create_record", "object": "event"}
                            ],
                            "max_visible": 6,
                            "button_style": "icon_text"
                        }
                    }
                ],
                "left_column": [
                    {
                        "id": str(uuid.uuid4()),
                        "component_type": "tasks_due",
                        "region": PageRegion.LEFT_COLUMN.value,
                        "order": 0,
                        "config": {
                            "title": "Tasks Due",
                            "date_range": "next_7_days",
                            "show_overdue": True,
                            "max_rows": 10,
                            "show_completed": False,
                            "allow_inline_complete": True
                        }
                    }
                ],
                "right_column": [
                    {
                        "id": str(uuid.uuid4()),
                        "component_type": "pipeline_snapshot",
                        "region": PageRegion.RIGHT_COLUMN.value,
                        "order": 0,
                        "config": {
                            "title": "Pipeline Snapshot",
                            "object_type": "opportunity",
                            "group_by": "stage",
                            "display_mode": "both",
                            "date_range": "this_quarter",
                            "chart_type": "bar"
                        }
                    }
                ]
            }
        },
        "is_active": True,
        "tenant_id": tenant_id,
        "created_at": now,
        "created_by": user_id,
        "updated_at": now,
        "updated_by": user_id
    }
    
    # Create Navigation
    sales_nav = {
        "id": str(uuid.uuid4()),
        "app_id": app_id,
        "items": [
            {
                "id": str(uuid.uuid4()),
                "type": NavItemType.HOME.value,
                "reference_id": home_page_id,
                "label": "Home",
                "icon": "home",
                "order": 0
            },
            {
                "id": str(uuid.uuid4()),
                "type": NavItemType.OBJECT.value,
                "reference_id": "lead",
                "label": "Leads",
                "icon": "user-plus",
                "order": 1
            },
            {
                "id": str(uuid.uuid4()),
                "type": NavItemType.OBJECT.value,
                "reference_id": "account",
                "label": "Accounts",
                "icon": "building",
                "order": 2
            },
            {
                "id": str(uuid.uuid4()),
                "type": NavItemType.OBJECT.value,
                "reference_id": "contact",
                "label": "Contacts",
                "icon": "users",
                "order": 3
            },
            {
                "id": str(uuid.uuid4()),
                "type": NavItemType.OBJECT.value,
                "reference_id": "opportunity",
                "label": "Opportunities",
                "icon": "target",
                "order": 4
            },
            {
                "id": str(uuid.uuid4()),
                "type": NavItemType.OBJECT.value,
                "reference_id": "task",
                "label": "Tasks",
                "icon": "check-square",
                "order": 5
            }
        ],
        "tenant_id": tenant_id,
        "updated_at": now
    }
    
    # Insert all documents
    await apps_collection.insert_one(sales_app)
    await pages_collection.insert_one(sales_home)
    await nav_collection.insert_one(sales_nav)
    
    logger.info(f"Created Sales Console app with Home page for tenant {tenant_id}")
    
    return {
        "status": "created",
        "app_id": app_id,
        "home_page_id": home_page_id,
        "message": "Sales Console app created successfully with default Home page",
        "components_added": ["quick_actions", "tasks_due", "pipeline_snapshot"]
    }


async def seed_service_app(
    db: AsyncIOMotorDatabase,
    user_id: str,
    tenant_id: str
) -> Dict[str, Any]:
    """
    Seed a Service app (for future use).
    Similar structure to Sales but with service-focused components.
    """
    # TODO: Implement Service app seeding in Phase 2
    return {"status": "not_implemented", "message": "Service app seeding coming in Phase 2"}
