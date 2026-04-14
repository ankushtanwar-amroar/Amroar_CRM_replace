"""
Phase 2B Rollout: Layout Separation for Contact, Account, Task, Event

This migration seeds system default New and Detail layouts for:
- Contact
- Account
- Task
- Event

Uses the same patterns established for Lead and Opportunity.

Run: python -m migrations.phase2b_rollout_layouts
"""
import asyncio
from datetime import datetime, timezone
import sys
import os
import uuid

# Add backend to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config.database import db


# ============================================
# Contact Layouts
# ============================================
CONTACT_DETAIL_LAYOUT = {
    "layout_name": "Contact Detail Layout",
    "api_name": "Contact_Detail_Layout",
    "description": "System default detail layout for Contact",
    "page_type": "detail",
    "is_system": True,
    "template_type": "three_column_header",
    "header_fields": ["name", "account_id", "title", "contact_type"],
    "highlight_fields": ["email", "phone", "department"],
    "show_stage_path": False,
    "regions": [
        {
            "id": "left",
            "name": "Related Lists",
            "width": "w-64",
            "order": 0,
            "components": [
                {"type": "related_list", "config": {"lists": ["task", "event", "opportunity"]}}
            ]
        },
        {
            "id": "center",
            "name": "Details",
            "width": "flex-1",
            "order": 1,
            "components": [
                {
                    "type": "tabs",
                    "config": {
                        "tabs": [
                            {
                                "id": "details",
                                "label": "Details",
                                "sections": [
                                    {
                                        "name": "Contact Information",
                                        "columns": 2,
                                        "fields": ["first_name", "last_name", "email", "phone", "title", "department"]
                                    },
                                    {
                                        "name": "Account",
                                        "columns": 2,
                                        "fields": ["account_id", "contact_type", "source"]
                                    },
                                    {
                                        "name": "Mailing Address",
                                        "columns": 2,
                                        "fields": ["mailing_city", "mailing_state", "mailing_postal_code", "mailing_country"]
                                    },
                                    {
                                        "name": "Additional Information",
                                        "columns": 1,
                                        "fields": ["description", "notes"]
                                    },
                                    {
                                        "name": "System Information",
                                        "columns": 2,
                                        "fields": ["created_at", "created_by", "updated_at", "updated_by", "last_activity_at"]
                                    }
                                ]
                            }
                        ]
                    }
                }
            ]
        },
        {
            "id": "right",
            "name": "Activity",
            "width": "w-80",
            "order": 2,
            "components": [
                {"type": "activity_timeline", "config": {"show_tasks": True, "show_events": True, "show_emails": True}}
            ]
        }
    ]
}

CONTACT_NEW_LAYOUT = {
    "layout_name": "Contact New Layout",
    "api_name": "Contact_New_Layout",
    "description": "System default new record layout for Contact",
    "page_type": "new",
    "is_system": True,
    "template_type": "form",
    "sections": [
        {
            "name": "Contact Information",
            "columns": 2,
            "fields": ["first_name", "last_name", "email", "phone", "title", "account_id"]
        }
    ],
    "required_fields": ["first_name", "last_name", "email"],
    "default_values": {}
}


# ============================================
# Account Layouts
# ============================================
ACCOUNT_DETAIL_LAYOUT = {
    "layout_name": "Account Detail Layout",
    "api_name": "Account_Detail_Layout",
    "description": "System default detail layout for Account",
    "page_type": "detail",
    "is_system": True,
    "template_type": "three_column_header",
    "header_fields": ["account_name", "account_type", "industry", "phone"],
    "highlight_fields": ["email", "website", "open_opportunity_count", "open_pipeline_amount"],
    "show_stage_path": False,
    "regions": [
        {
            "id": "left",
            "name": "Related Lists",
            "width": "w-64",
            "order": 0,
            "components": [
                {"type": "related_list", "config": {"lists": ["contact", "opportunity", "task", "event"]}}
            ]
        },
        {
            "id": "center",
            "name": "Details",
            "width": "flex-1",
            "order": 1,
            "components": [
                {
                    "type": "tabs",
                    "config": {
                        "tabs": [
                            {
                                "id": "details",
                                "label": "Details",
                                "sections": [
                                    {
                                        "name": "Account Information",
                                        "columns": 2,
                                        "fields": ["account_name", "account_type", "industry", "source"]
                                    },
                                    {
                                        "name": "Contact Information",
                                        "columns": 2,
                                        "fields": ["phone", "email", "website"]
                                    },
                                    {
                                        "name": "Firmographics",
                                        "columns": 2,
                                        "fields": ["employees", "annual_revenue"]
                                    },
                                    {
                                        "name": "Pipeline Summary",
                                        "columns": 2,
                                        "fields": ["open_opportunity_count", "open_pipeline_amount"]
                                    },
                                    {
                                        "name": "Billing Address",
                                        "columns": 2,
                                        "fields": ["billing_city", "billing_state", "billing_postal_code", "billing_country"]
                                    },
                                    {
                                        "name": "Description",
                                        "columns": 1,
                                        "fields": ["description"]
                                    },
                                    {
                                        "name": "System Information",
                                        "columns": 2,
                                        "fields": ["created_at", "created_by", "updated_at", "updated_by", "last_activity_at"]
                                    }
                                ]
                            }
                        ]
                    }
                }
            ]
        },
        {
            "id": "right",
            "name": "Activity",
            "width": "w-80",
            "order": 2,
            "components": [
                {"type": "activity_timeline", "config": {"show_tasks": True, "show_events": True, "show_emails": True}}
            ]
        }
    ]
}

ACCOUNT_NEW_LAYOUT = {
    "layout_name": "Account New Layout",
    "api_name": "Account_New_Layout",
    "description": "System default new record layout for Account",
    "page_type": "new",
    "is_system": True,
    "template_type": "form",
    "sections": [
        {
            "name": "Account Information",
            "columns": 2,
            "fields": ["account_name", "account_type", "industry", "phone", "email", "website"]
        }
    ],
    "required_fields": ["account_name"],
    "default_values": {
        "account_type": "Prospect"
    }
}


# ============================================
# Task Layouts
# ============================================
TASK_DETAIL_LAYOUT = {
    "layout_name": "Task Detail Layout",
    "api_name": "Task_Detail_Layout",
    "description": "System default detail layout for Task",
    "page_type": "detail",
    "is_system": True,
    "template_type": "single_column",
    "header_fields": ["subject", "status", "priority", "due_date"],
    "highlight_fields": ["assigned_to", "person_link_id", "record_link_id"],
    "show_stage_path": True,
    "stage_path_field": "status",
    "regions": [
        {
            "id": "main",
            "name": "Details",
            "width": "flex-1",
            "order": 0,
            "components": [
                {
                    "type": "tabs",
                    "config": {
                        "tabs": [
                            {
                                "id": "details",
                                "label": "Details",
                                "sections": [
                                    {
                                        "name": "Task Information",
                                        "columns": 2,
                                        "fields": ["subject", "status", "priority", "due_date"]
                                    },
                                    {
                                        "name": "Related To",
                                        "columns": 2,
                                        "fields": ["person_link_id", "record_link_id", "assigned_to"]
                                    },
                                    {
                                        "name": "Description",
                                        "columns": 1,
                                        "fields": ["description"]
                                    },
                                    {
                                        "name": "System Information",
                                        "columns": 2,
                                        "fields": ["created_at", "created_by", "updated_at", "updated_by"]
                                    }
                                ]
                            }
                        ]
                    }
                }
            ]
        }
    ]
}

TASK_NEW_LAYOUT = {
    "layout_name": "Task New Layout",
    "api_name": "Task_New_Layout",
    "description": "System default new record layout for Task",
    "page_type": "new",
    "is_system": True,
    "template_type": "form",
    "sections": [
        {
            "name": "Task Information",
            "columns": 2,
            "fields": ["subject", "status", "priority", "due_date", "assigned_to", "description"]
        }
    ],
    "required_fields": ["subject", "status", "priority"],
    "default_values": {
        "status": "Not Started",
        "priority": "Normal"
    }
}


# ============================================
# Event Layouts
# ============================================
EVENT_DETAIL_LAYOUT = {
    "layout_name": "Event Detail Layout",
    "api_name": "Event_Detail_Layout",
    "description": "System default detail layout for Event",
    "page_type": "detail",
    "is_system": True,
    "template_type": "single_column",
    "header_fields": ["subject", "event_type", "start_date", "end_date"],
    "highlight_fields": ["location", "person_link_id", "record_link_id"],
    "show_stage_path": False,
    "regions": [
        {
            "id": "main",
            "name": "Details",
            "width": "flex-1",
            "order": 0,
            "components": [
                {
                    "type": "tabs",
                    "config": {
                        "tabs": [
                            {
                                "id": "details",
                                "label": "Details",
                                "sections": [
                                    {
                                        "name": "Event Information",
                                        "columns": 2,
                                        "fields": ["subject", "event_type", "start_date", "end_date", "location"]
                                    },
                                    {
                                        "name": "Related To",
                                        "columns": 2,
                                        "fields": ["person_link_id", "record_link_id", "attendees"]
                                    },
                                    {
                                        "name": "Description",
                                        "columns": 1,
                                        "fields": ["description"]
                                    },
                                    {
                                        "name": "System Information",
                                        "columns": 2,
                                        "fields": ["created_at", "created_by", "updated_at", "updated_by"]
                                    }
                                ]
                            }
                        ]
                    }
                }
            ]
        }
    ]
}

EVENT_NEW_LAYOUT = {
    "layout_name": "Event New Layout",
    "api_name": "Event_New_Layout",
    "description": "System default new record layout for Event",
    "page_type": "new",
    "is_system": True,
    "template_type": "form",
    "sections": [
        {
            "name": "Event Information",
            "columns": 2,
            "fields": ["subject", "event_type", "start_date", "end_date", "location", "description"]
        }
    ],
    "required_fields": ["subject", "event_type", "start_date", "end_date"],
    "default_values": {
        "event_type": "Meeting"
    }
}


# Layout definitions map
LAYOUTS = {
    "contact": {"detail": CONTACT_DETAIL_LAYOUT, "new": CONTACT_NEW_LAYOUT},
    "account": {"detail": ACCOUNT_DETAIL_LAYOUT, "new": ACCOUNT_NEW_LAYOUT},
    "task": {"detail": TASK_DETAIL_LAYOUT, "new": TASK_NEW_LAYOUT},
    "event": {"detail": EVENT_DETAIL_LAYOUT, "new": EVENT_NEW_LAYOUT},
}


async def seed_layouts_for_tenant(tenant_id: str):
    """Seed system layouts for a single tenant"""
    now = datetime.now(timezone.utc).isoformat()
    results = {}
    
    for obj_name, layouts in LAYOUTS.items():
        results[obj_name] = {"detail": 0, "new": 0}
        
        for page_type, layout_def in layouts.items():
            # Check if system layout already exists
            existing = await db.lightning_page_layouts.find_one({
                "tenant_id": tenant_id,
                "object_name": obj_name,
                "page_type": page_type,
                "is_system": True
            })
            
            if not existing:
                layout = {
                    "id": str(uuid.uuid4()),
                    "tenant_id": tenant_id,
                    "object_name": obj_name,
                    "created_by": None,
                    "updated_by": None,
                    "created_at": now,
                    "updated_at": now,
                    "is_active": True,
                    **layout_def
                }
                await db.lightning_page_layouts.insert_one(layout)
                results[obj_name][page_type] = 1
                print(f"  Created {obj_name} {page_type} layout")
            else:
                print(f"  {obj_name} {page_type} layout already exists")
    
    return results


async def run_migration():
    """Run the layout rollout migration for all tenants."""
    print("\n" + "="*60)
    print("Phase 2B Rollout: Layout Separation for Contact, Account, Task, Event")
    print("="*60 + "\n")
    
    try:
        # Get all tenants
        tenants = await db.tenants.find({}).to_list(None)
        
        if not tenants:
            print("No tenants found. Creating layouts for default tenant...")
            # Try tenant_objects collection for tenant IDs
            tenant_ids = await db.tenant_objects.distinct("tenant_id")
            if tenant_ids:
                for tenant_id in tenant_ids:
                    print(f"\nProcessing tenant: {tenant_id[:8]}...")
                    await seed_layouts_for_tenant(tenant_id)
        else:
            for tenant in tenants:
                tenant_id = tenant.get("id") or tenant.get("tenant_id")
                if tenant_id:
                    print(f"\nProcessing tenant: {tenant_id[:8]}...")
                    await seed_layouts_for_tenant(tenant_id)
        
        # Create index
        print("\nCreating indexes...")
        await db.lightning_page_layouts.create_index([
            ("tenant_id", 1),
            ("object_name", 1),
            ("page_type", 1),
            ("is_system", 1)
        ])
        
        print("\n" + "="*60)
        print("Phase 2B Rollout Migration Complete!")
        print("="*60 + "\n")
        
    except Exception as e:
        print(f"\nMigration Error: {str(e)}")
        raise


if __name__ == "__main__":
    asyncio.run(run_migration())
