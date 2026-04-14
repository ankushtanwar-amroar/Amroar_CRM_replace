"""
Phase 2A Migration: Stage Definitions + Opportunity computed fields

This migration:
1. Seeds default stage definitions for Lead (status) and Opportunity (stage)
2. Adds computed fields to Opportunity: probability_percent, forecast_category, expected_revenue, is_closed
3. Backfills existing Opportunity records with computed field values

Run: python -m migrations.phase2a_stage_definitions
"""
import asyncio
from datetime import datetime, timezone
from typing import Dict, Any
import sys
import os

# Add backend to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config.database import db


# New computed fields to add to Opportunity
OPPORTUNITY_COMPUTED_FIELDS = {
    "probability_percent": {
        "type": "number",
        "label": "Probability (%)",
        "required": False,
        "read_only": True,
        "computed": True,
        "description": "Probability derived from stage definition"
    },
    "forecast_category": {
        "type": "select",
        "label": "Forecast Category",
        "required": False,
        "read_only": True,
        "computed": True,
        "options": ["Pipeline", "Best Case", "Commit", "Closed", "Omitted"],
        "description": "Forecast category derived from stage definition"
    },
    "expected_revenue": {
        "type": "currency",
        "label": "Expected Revenue",
        "required": False,
        "read_only": True,
        "computed": True,
        "description": "amount × probability_percent / 100"
    },
    "is_closed": {
        "type": "boolean",
        "label": "Is Closed",
        "required": False,
        "read_only": True,
        "computed": True,
        "description": "True if stage is Closed Won or Closed Lost"
    }
}


# Stage definitions to seed (from service defaults)
DEFAULT_OPPORTUNITY_STAGES = [
    {
        "stage_name": "Prospecting",
        "stage_api_name": "prospecting",
        "probability_percent": 10,
        "is_closed_won": False,
        "is_closed_lost": False,
        "forecast_category": "Pipeline",
        "sort_order": 1,
        "color": "#3B82F6",
        "is_system": True
    },
    {
        "stage_name": "Qualification",
        "stage_api_name": "qualification",
        "probability_percent": 20,
        "is_closed_won": False,
        "is_closed_lost": False,
        "forecast_category": "Pipeline",
        "sort_order": 2,
        "color": "#6366F1",
        "is_system": True
    },
    {
        "stage_name": "Needs Analysis",
        "stage_api_name": "needs_analysis",
        "probability_percent": 30,
        "is_closed_won": False,
        "is_closed_lost": False,
        "forecast_category": "Pipeline",
        "sort_order": 3,
        "color": "#8B5CF6",
        "is_system": True
    },
    {
        "stage_name": "Value Proposition",
        "stage_api_name": "value_proposition",
        "probability_percent": 40,
        "is_closed_won": False,
        "is_closed_lost": False,
        "forecast_category": "Pipeline",
        "sort_order": 4,
        "color": "#A855F7",
        "is_system": True
    },
    {
        "stage_name": "Proposal",
        "stage_api_name": "proposal",
        "probability_percent": 50,
        "is_closed_won": False,
        "is_closed_lost": False,
        "forecast_category": "Best Case",
        "sort_order": 5,
        "color": "#F59E0B",
        "is_system": True
    },
    {
        "stage_name": "Negotiation",
        "stage_api_name": "negotiation",
        "probability_percent": 70,
        "is_closed_won": False,
        "is_closed_lost": False,
        "forecast_category": "Commit",
        "sort_order": 6,
        "color": "#F97316",
        "is_system": True
    },
    {
        "stage_name": "Closed Won",
        "stage_api_name": "closed_won",
        "probability_percent": 100,
        "is_closed_won": True,
        "is_closed_lost": False,
        "forecast_category": "Closed",
        "sort_order": 7,
        "color": "#10B981",
        "is_system": True
    },
    {
        "stage_name": "Closed Lost",
        "stage_api_name": "closed_lost",
        "probability_percent": 0,
        "is_closed_won": False,
        "is_closed_lost": True,
        "forecast_category": "Omitted",
        "sort_order": 8,
        "color": "#EF4444",
        "is_system": True
    }
]

DEFAULT_LEAD_STAGES = [
    {
        "stage_name": "New",
        "stage_api_name": "new",
        "probability_percent": 10,
        "is_closed_won": False,
        "is_closed_lost": False,
        "forecast_category": "Pipeline",
        "sort_order": 1,
        "color": "#3B82F6",
        "is_system": True
    },
    {
        "stage_name": "Contacted",
        "stage_api_name": "contacted",
        "probability_percent": 20,
        "is_closed_won": False,
        "is_closed_lost": False,
        "forecast_category": "Pipeline",
        "sort_order": 2,
        "color": "#8B5CF6",
        "is_system": True
    },
    {
        "stage_name": "Working",
        "stage_api_name": "working",
        "probability_percent": 40,
        "is_closed_won": False,
        "is_closed_lost": False,
        "forecast_category": "Pipeline",
        "sort_order": 3,
        "color": "#F59E0B",
        "is_system": True
    },
    {
        "stage_name": "Qualified",
        "stage_api_name": "qualified",
        "probability_percent": 60,
        "is_closed_won": False,
        "is_closed_lost": False,
        "forecast_category": "Best Case",
        "sort_order": 4,
        "color": "#10B981",
        "is_system": True
    },
    {
        "stage_name": "Unqualified",
        "stage_api_name": "unqualified",
        "probability_percent": 0,
        "is_closed_won": False,
        "is_closed_lost": True,
        "forecast_category": "Omitted",
        "sort_order": 5,
        "color": "#EF4444",
        "is_system": True
    },
    {
        "stage_name": "Converted",
        "stage_api_name": "converted",
        "probability_percent": 100,
        "is_closed_won": True,
        "is_closed_lost": False,
        "forecast_category": "Closed",
        "sort_order": 6,
        "color": "#059669",
        "is_system": True
    }
]


def get_stage_attributes(stage_name: str, stages_list: list) -> Dict[str, Any]:
    """Get stage attributes by name from a stages list"""
    for stage in stages_list:
        if stage["stage_name"].lower() == stage_name.lower():
            return stage
    # Default fallback
    return {
        "probability_percent": 0,
        "forecast_category": "Pipeline",
        "is_closed_won": False,
        "is_closed_lost": False
    }


async def add_fields_to_opportunity(tenant_id: str = None):
    """Add computed fields to Opportunity object metadata"""
    query = {"object_name": "opportunity"}
    if tenant_id:
        query["tenant_id"] = tenant_id
    
    objects = await db.tenant_objects.find(query).to_list(None)
    updated_count = 0
    
    for obj in objects:
        existing_fields = obj.get("fields", {})
        fields_added = []
        
        for field_name, field_def in OPPORTUNITY_COMPUTED_FIELDS.items():
            if field_name not in existing_fields:
                existing_fields[field_name] = field_def
                fields_added.append(field_name)
        
        if fields_added:
            await db.tenant_objects.update_one(
                {"_id": obj["_id"]},
                {"$set": {"fields": existing_fields}}
            )
            updated_count += 1
            print(f"  Added fields {fields_added} to opportunity (tenant: {obj.get('tenant_id', 'N/A')[:8]}...)")
    
    return updated_count


async def seed_stage_definitions():
    """Seed default stage definitions for all tenants"""
    import uuid
    
    tenants = await db.tenant_objects.distinct("tenant_id")
    now = datetime.now(timezone.utc)
    
    for tenant_id in tenants:
        # Seed Lead stages
        lead_count = 0
        for stage_data in DEFAULT_LEAD_STAGES:
            existing = await db.stage_definitions.find_one({
                "tenant_id": tenant_id,
                "object_name": "lead",
                "stage_name": stage_data["stage_name"]
            })
            if not existing:
                stage_doc = {
                    "id": str(uuid.uuid4()),
                    "tenant_id": tenant_id,
                    "object_name": "lead",
                    "field_name": "status",
                    "is_active": True,
                    "created_at": now,
                    "updated_at": now,
                    **stage_data
                }
                await db.stage_definitions.insert_one(stage_doc)
                lead_count += 1
        
        # Seed Opportunity stages
        opp_count = 0
        for stage_data in DEFAULT_OPPORTUNITY_STAGES:
            existing = await db.stage_definitions.find_one({
                "tenant_id": tenant_id,
                "object_name": "opportunity",
                "stage_name": stage_data["stage_name"]
            })
            if not existing:
                stage_doc = {
                    "id": str(uuid.uuid4()),
                    "tenant_id": tenant_id,
                    "object_name": "opportunity",
                    "field_name": "stage",
                    "is_active": True,
                    "created_at": now,
                    "updated_at": now,
                    **stage_data
                }
                await db.stage_definitions.insert_one(stage_doc)
                opp_count += 1
        
        if lead_count > 0 or opp_count > 0:
            print(f"  Seeded stages for tenant {tenant_id[:8]}...: Lead={lead_count}, Opportunity={opp_count}")


async def backfill_opportunity_computed_fields():
    """Backfill existing Opportunity records with computed field values"""
    records = await db.object_records.find({
        "object_name": "opportunity"
    }).to_list(None)
    
    updated = 0
    for record in records:
        data = record.get("data", {})
        stage = data.get("stage", "")
        
        # Get stage attributes
        stage_attrs = get_stage_attributes(stage, DEFAULT_OPPORTUNITY_STAGES)
        
        # Compute values
        probability = stage_attrs.get("probability_percent", 0)
        forecast_category = stage_attrs.get("forecast_category", "Pipeline")
        is_closed = stage_attrs.get("is_closed_won", False) or stage_attrs.get("is_closed_lost", False)
        
        amount = data.get("amount", 0) or 0
        try:
            amount = float(amount)
        except (ValueError, TypeError):
            amount = 0
        expected_revenue = round(amount * probability / 100, 2)
        
        # Update record
        await db.object_records.update_one(
            {"_id": record["_id"]},
            {"$set": {
                "data.probability_percent": probability,
                "data.forecast_category": forecast_category,
                "data.expected_revenue": expected_revenue,
                "data.is_closed": is_closed
            }}
        )
        updated += 1
    
    print(f"  Backfilled computed fields on {updated} opportunity records")
    return updated


async def run_migration():
    """Run the full Phase 2A migration."""
    print("\n" + "="*60)
    print("Phase 2A Migration: Stage Definitions + Opportunity Computed Fields")
    print("="*60 + "\n")
    
    try:
        # Step 1: Add computed fields to Opportunity metadata
        print("Step 1: Adding computed fields to Opportunity object metadata...")
        await add_fields_to_opportunity()
        
        # Step 2: Seed default stage definitions
        print("\nStep 2: Seeding default stage definitions...")
        await seed_stage_definitions()
        
        # Step 3: Backfill existing Opportunity records
        print("\nStep 3: Backfilling Opportunity records with computed values...")
        await backfill_opportunity_computed_fields()
        
        # Step 4: Create indexes
        print("\nStep 4: Creating indexes...")
        await db.stage_definitions.create_index([
            ("tenant_id", 1),
            ("object_name", 1),
            ("sort_order", 1)
        ])
        await db.stage_definitions.create_index([
            ("tenant_id", 1),
            ("object_name", 1),
            ("stage_name", 1)
        ], unique=True)
        print("  Created indexes on stage_definitions collection")
        
        print("\n" + "="*60)
        print("Phase 2A Migration Complete!")
        print("="*60 + "\n")
        
    except Exception as e:
        print(f"\nMigration Error: {str(e)}")
        raise


if __name__ == "__main__":
    asyncio.run(run_migration())
