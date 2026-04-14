"""
Phase 2B Migration: Page Layout Separation (New vs Detail)

This migration:
1. Seeds system default Detail layouts for Lead and Opportunity
2. Seeds system default New layouts for Lead and Opportunity
3. Creates index on lightning_page_layouts collection

Run: python -m migrations.phase2b_layout_separation
"""
import asyncio
from datetime import datetime, timezone
from typing import Dict, Any
import sys
import os
import uuid

# Add backend to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config.database import db


# Default Detail Layouts
DEFAULT_DETAIL_LAYOUTS = {
    "lead": {
        "layout_name": "Lead Detail Layout",
        "api_name": "Lead_Detail_Layout",
        "description": "System default detail layout for Lead (Prospect)",
        "page_type": "detail",
        "is_system": True,
        "template_type": "three_column_header",
        "header_fields": ["name", "status", "rating", "owner_id"],
        "highlight_fields": ["email", "phone", "company"],
        "show_stage_path": True,
        "stage_path_field": "status",
        "regions": [
            {
                "id": "left",
                "name": "Related Lists",
                "width": "w-64",
                "order": 0,
                "components": [
                    {"type": "related_list", "config": {"lists": ["task", "event"]}}
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
                                            "name": "Lead Information",
                                            "columns": 2,
                                            "fields": ["first_name", "last_name", "email", "phone", "mobile", "company", "title"]
                                        },
                                        {
                                            "name": "Qualification",
                                            "columns": 2,
                                            "fields": ["status", "rating", "source", "industry"]
                                        },
                                        {
                                            "name": "Firmographics",
                                            "columns": 2,
                                            "fields": ["employees_count", "annual_revenue", "website"]
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
    },
    "opportunity": {
        "layout_name": "Opportunity Detail Layout",
        "api_name": "Opportunity_Detail_Layout",
        "description": "System default detail layout for Opportunity",
        "page_type": "detail",
        "is_system": True,
        "template_type": "three_column_header",
        "header_fields": ["name", "stage", "amount", "owner_id"],
        "highlight_fields": ["close_date", "probability_percent", "expected_revenue", "forecast_category"],
        "show_stage_path": True,
        "stage_path_field": "stage",
        "regions": [
            {
                "id": "left",
                "name": "Related Lists",
                "width": "w-64",
                "order": 0,
                "components": [
                    {"type": "related_list", "config": {"lists": ["task", "event"]}}
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
                                            "name": "Opportunity Information",
                                            "columns": 2,
                                            "fields": ["name", "account_id", "stage", "close_date"]
                                        },
                                        {
                                            "name": "Financial",
                                            "columns": 2,
                                            "fields": ["amount", "probability_percent", "expected_revenue", "forecast_category"]
                                        },
                                        {
                                            "name": "Details",
                                            "columns": 2,
                                            "fields": ["type", "source", "next_step", "is_closed"]
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
}

# Default New Layouts (minimal fields for fast record creation)
DEFAULT_NEW_LAYOUTS = {
    "lead": {
        "layout_name": "Lead New Layout",
        "api_name": "Lead_New_Layout",
        "description": "System default new record layout for Lead (Prospect)",
        "page_type": "new",
        "is_system": True,
        "template_type": "form",
        "sections": [
            {
                "name": "Basic Information",
                "columns": 2,
                "fields": ["first_name", "last_name", "company", "email", "phone", "status"]
            }
        ],
        "required_fields": ["last_name", "company", "status"],
        "default_values": {
            "status": "New"
        }
    },
    "opportunity": {
        "layout_name": "Opportunity New Layout",
        "api_name": "Opportunity_New_Layout",
        "description": "System default new record layout for Opportunity",
        "page_type": "new",
        "is_system": True,
        "template_type": "form",
        "sections": [
            {
                "name": "Opportunity Information",
                "columns": 2,
                "fields": ["name", "account_id", "stage", "close_date", "amount"]
            }
        ],
        "required_fields": ["name", "account_id", "stage", "close_date"],
        "default_values": {
            "stage": "Prospecting"
        }
    }
}


async def seed_layouts_for_tenant(tenant_id: str, user_id: str = None):
    """Seed system layouts for a single tenant"""
    now = datetime.now(timezone.utc).isoformat()
    results = {"lead": {"detail": 0, "new": 0}, "opportunity": {"detail": 0, "new": 0}}
    
    for obj_name in ["lead", "opportunity"]:
        # Seed Detail Layout
        existing = await db.lightning_page_layouts.find_one({
            "tenant_id": tenant_id,
            "object_name": obj_name,
            "page_type": "detail",
            "is_system": True
        })
        
        if not existing:
            detail_layout = {
                "id": str(uuid.uuid4()),
                "tenant_id": tenant_id,
                "object_name": obj_name,
                "created_by": user_id,
                "updated_by": user_id,
                "created_at": now,
                "updated_at": now,
                "is_active": True,
                **DEFAULT_DETAIL_LAYOUTS[obj_name]
            }
            await db.lightning_page_layouts.insert_one(detail_layout)
            results[obj_name]["detail"] = 1
        
        # Seed New Layout
        existing = await db.lightning_page_layouts.find_one({
            "tenant_id": tenant_id,
            "object_name": obj_name,
            "page_type": "new",
            "is_system": True
        })
        
        if not existing:
            new_layout = {
                "id": str(uuid.uuid4()),
                "tenant_id": tenant_id,
                "object_name": obj_name,
                "created_by": user_id,
                "updated_by": user_id,
                "created_at": now,
                "updated_at": now,
                "is_active": True,
                **DEFAULT_NEW_LAYOUTS[obj_name]
            }
            await db.lightning_page_layouts.insert_one(new_layout)
            results[obj_name]["new"] = 1
    
    return results


async def run_migration():
    """Run the full Phase 2B migration."""
    print("\n" + "="*60)
    print("Phase 2B Migration: Page Layout Separation (New vs Detail)")
    print("="*60 + "\n")
    
    try:
        # Step 1: Get all tenants
        print("Step 1: Finding all tenants...")
        tenants = await db.tenant_objects.distinct("tenant_id")
        print(f"  Found {len(tenants)} tenants")
        
        # Step 2: Seed layouts for each tenant
        print("\nStep 2: Seeding system layouts for Lead and Opportunity...")
        total_detail = 0
        total_new = 0
        
        for tenant_id in tenants:
            results = await seed_layouts_for_tenant(tenant_id)
            detail_count = results["lead"]["detail"] + results["opportunity"]["detail"]
            new_count = results["lead"]["new"] + results["opportunity"]["new"]
            total_detail += detail_count
            total_new += new_count
            
            if detail_count > 0 or new_count > 0:
                print(f"  Tenant {tenant_id[:8]}...: {detail_count} detail, {new_count} new layouts")
        
        print(f"\n  Total layouts created: {total_detail} detail, {total_new} new")
        
        # Step 3: Create indexes
        print("\nStep 3: Creating indexes...")
        await db.lightning_page_layouts.create_index([
            ("tenant_id", 1),
            ("object_name", 1),
            ("page_type", 1)
        ])
        await db.lightning_page_layouts.create_index([
            ("tenant_id", 1),
            ("object_name", 1),
            ("page_type", 1),
            ("is_system", 1)
        ])
        print("  Created indexes on lightning_page_layouts collection")
        
        # Step 4: Verify
        print("\nStep 4: Verification...")
        lead_detail = await db.lightning_page_layouts.count_documents({
            "object_name": "lead",
            "page_type": "detail",
            "is_system": True
        })
        lead_new = await db.lightning_page_layouts.count_documents({
            "object_name": "lead",
            "page_type": "new",
            "is_system": True
        })
        opp_detail = await db.lightning_page_layouts.count_documents({
            "object_name": "opportunity",
            "page_type": "detail",
            "is_system": True
        })
        opp_new = await db.lightning_page_layouts.count_documents({
            "object_name": "opportunity",
            "page_type": "new",
            "is_system": True
        })
        
        print(f"  Lead: {lead_detail} detail, {lead_new} new layouts")
        print(f"  Opportunity: {opp_detail} detail, {opp_new} new layouts")
        
        print("\n" + "="*60)
        print("Phase 2B Migration Complete!")
        print("="*60 + "\n")
        
    except Exception as e:
        print(f"\nMigration Error: {str(e)}")
        raise


if __name__ == "__main__":
    asyncio.run(run_migration())
