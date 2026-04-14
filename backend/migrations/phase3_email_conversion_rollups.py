"""
Phase 3 Migration: EmailMessage Object, Conversion Tracking, Account Rollups

This migration:
1. Creates EmailMessage standard object schema (no UI)
2. Adds conversion tracking fields to Account, Contact, Opportunity
3. Adds rollup fields to Account (open_opportunity_count, open_pipeline_amount)

Run: python -m migrations.phase3_email_conversion_rollups
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


# ============================================
# 1. EmailMessage Object Schema
# ============================================
EMAILMESSAGE_OBJECT = {
    "object_name": "emailmessage",
    "object_label": "Email Message",
    "object_plural": "Email Messages",
    "label": "Email Message",
    "plural_label": "Email Messages",
    "description": "Stores email communications linked to records",
    "icon": "Mail",
    "is_custom": False,
    "is_system": True,
    "enable_activities": False,
    "enable_search": True,
    "enable_reports": True,
    "enable_chatter": False
}

EMAILMESSAGE_FIELDS = {
    # Core email fields
    "subject": {
        "type": "text",
        "label": "Subject",
        "required": False,
        "read_only": True,
        "description": "Email subject line"
    },
    "direction": {
        "type": "select",
        "label": "Direction",
        "required": True,
        "read_only": True,
        "options": ["Incoming", "Outgoing"],
        "description": "Whether email was sent or received"
    },
    "from_name": {
        "type": "text",
        "label": "From Name",
        "required": False,
        "read_only": True
    },
    "from_email": {
        "type": "email",
        "label": "From Email",
        "required": False,
        "read_only": True
    },
    "to_emails": {
        "type": "text",
        "label": "To",
        "required": False,
        "read_only": True,
        "description": "Comma-separated list of recipients"
    },
    "cc_emails": {
        "type": "text",
        "label": "CC",
        "required": False,
        "read_only": True
    },
    "bcc_emails": {
        "type": "text",
        "label": "BCC",
        "required": False,
        "read_only": True
    },
    "message_at": {
        "type": "datetime",
        "label": "Message Time",
        "required": True,
        "read_only": True,
        "description": "When email was sent/received"
    },
    "text_body": {
        "type": "textarea",
        "label": "Text Body",
        "required": False,
        "read_only": True
    },
    "html_body": {
        "type": "textarea",
        "label": "HTML Body",
        "required": False,
        "read_only": True
    },
    "has_attachments": {
        "type": "boolean",
        "label": "Has Attachments",
        "required": False,
        "read_only": True,
        "default": False
    },
    # Threading fields
    "thread_id": {
        "type": "text",
        "label": "Thread ID",
        "required": False,
        "read_only": True,
        "description": "For conversation threading"
    },
    "message_id": {
        "type": "text",
        "label": "Message ID",
        "required": False,
        "read_only": True,
        "description": "Provider message identifier"
    },
    # Processing status
    "processing_status": {
        "type": "select",
        "label": "Processing Status",
        "required": False,
        "read_only": True,
        "options": ["Pending", "Processed", "Failed"],
        "default": "Processed"
    },
    # Activity links (Phase 1 pattern)
    "person_link_id": {
        "type": "lookup",
        "label": "Person Link",
        "required": False,
        "read_only": False,
        "related_object": "lead,contact",
        "description": "Links to the person (Lead/Contact) this email is with"
    },
    "record_link_id": {
        "type": "lookup",
        "label": "Record Link",
        "required": False,
        "read_only": False,
        "related_object": "any",
        "description": "Links to the record this email is about"
    },
    # System fields (Phase 1)
    "created_by": {
        "type": "lookup",
        "label": "Created By",
        "required": False,
        "read_only": True,
        "related_object": "user",
        "system_field": True
    },
    "updated_by": {
        "type": "lookup",
        "label": "Last Modified By",
        "required": False,
        "read_only": True,
        "related_object": "user",
        "system_field": True
    },
    "system_timestamp": {
        "type": "datetime",
        "label": "System Timestamp",
        "required": False,
        "read_only": True,
        "system_field": True
    },
    "is_deleted": {
        "type": "boolean",
        "label": "Is Deleted",
        "required": False,
        "read_only": True,
        "system_field": True,
        "default": False
    }
}


# ============================================
# 2. Conversion Tracking Fields
# ============================================
CONVERSION_TRACKING_FIELDS = {
    "created_from_prospect": {
        "type": "boolean",
        "label": "Created From Prospect",
        "required": False,
        "read_only": True,
        "computed": True,
        "default": False,
        "description": "True if this record was created via Lead conversion"
    },
    "source_prospect_id": {
        "type": "lookup",
        "label": "Source Prospect",
        "required": False,
        "read_only": True,
        "related_object": "lead",
        "description": "The Lead that was converted to create this record"
    }
}

# Objects that get conversion tracking fields
CONVERSION_TRACKING_OBJECTS = ["account", "contact", "opportunity"]


# ============================================
# 3. Account Rollup Fields
# ============================================
ACCOUNT_ROLLUP_FIELDS = {
    "open_opportunity_count": {
        "type": "number",
        "label": "Open Opportunities",
        "required": False,
        "read_only": True,
        "computed": True,
        "default": 0,
        "description": "Count of open opportunities linked to this account"
    },
    "open_pipeline_amount": {
        "type": "currency",
        "label": "Open Pipeline Amount",
        "required": False,
        "read_only": True,
        "computed": True,
        "default": 0,
        "description": "Sum of amount from open opportunities"
    }
}


async def create_emailmessage_object():
    """Create EmailMessage object for all tenants"""
    tenants = await db.tenant_objects.distinct("tenant_id")
    created_count = 0
    now = datetime.now(timezone.utc).isoformat()
    
    for tenant_id in tenants:
        # Check if already exists
        existing = await db.tenant_objects.find_one({
            "tenant_id": tenant_id,
            "object_name": "emailmessage"
        })
        
        if not existing:
            email_obj = {
                "id": str(uuid.uuid4()),
                "tenant_id": tenant_id,
                "object_name": "emailmessage",
                "fields": EMAILMESSAGE_FIELDS,
                "created_at": now,
                "updated_at": now,
                **EMAILMESSAGE_OBJECT
            }
            await db.tenant_objects.insert_one(email_obj)
            created_count += 1
            print(f"  Created EmailMessage object for tenant {tenant_id[:8]}...")
    
    return created_count


async def add_conversion_tracking_fields():
    """Add conversion tracking fields to Account, Contact, Opportunity"""
    updated_count = 0
    
    for obj_name in CONVERSION_TRACKING_OBJECTS:
        objects = await db.tenant_objects.find({
            "object_name": obj_name
        }).to_list(None)
        
        for obj in objects:
            existing_fields = obj.get("fields", {})
            fields_added = []
            
            for field_name, field_def in CONVERSION_TRACKING_FIELDS.items():
                if field_name not in existing_fields:
                    existing_fields[field_name] = field_def
                    fields_added.append(field_name)
            
            if fields_added:
                await db.tenant_objects.update_one(
                    {"_id": obj["_id"]},
                    {"$set": {"fields": existing_fields}}
                )
                updated_count += 1
                print(f"  Added {fields_added} to {obj_name} (tenant: {obj.get('tenant_id', 'N/A')[:8]}...)")
    
    return updated_count


async def add_account_rollup_fields():
    """Add rollup fields to Account object"""
    updated_count = 0
    
    accounts = await db.tenant_objects.find({
        "object_name": "account"
    }).to_list(None)
    
    for obj in accounts:
        existing_fields = obj.get("fields", {})
        fields_added = []
        
        for field_name, field_def in ACCOUNT_ROLLUP_FIELDS.items():
            if field_name not in existing_fields:
                existing_fields[field_name] = field_def
                fields_added.append(field_name)
        
        if fields_added:
            await db.tenant_objects.update_one(
                {"_id": obj["_id"]},
                {"$set": {"fields": existing_fields}}
            )
            updated_count += 1
            print(f"  Added {fields_added} to account (tenant: {obj.get('tenant_id', 'N/A')[:8]}...)")
    
    return updated_count


async def compute_account_rollups():
    """Compute and backfill account rollup values for existing records"""
    accounts = await db.object_records.find({
        "object_name": "account"
    }).to_list(None)
    
    updated_count = 0
    
    for account in accounts:
        account_id = account.get("id") or account.get("series_id")
        tenant_id = account.get("tenant_id")
        
        if not account_id or not tenant_id:
            continue
        
        # Find open opportunities linked to this account
        open_opps = await db.object_records.find({
            "tenant_id": tenant_id,
            "object_name": "opportunity",
            "$or": [
                {"data.account_id": account_id},
                {"data.account_id": account.get("series_id")}
            ],
            "data.is_closed": {"$ne": True}
        }, {"_id": 0, "data.amount": 1}).to_list(None)
        
        open_count = len(open_opps)
        open_amount = 0
        
        for opp in open_opps:
            amount = opp.get("data", {}).get("amount", 0) or 0
            try:
                open_amount += float(amount)
            except (ValueError, TypeError):
                pass
        
        # Update account
        await db.object_records.update_one(
            {"_id": account["_id"]},
            {"$set": {
                "data.open_opportunity_count": open_count,
                "data.open_pipeline_amount": round(open_amount, 2)
            }}
        )
        updated_count += 1
    
    print(f"  Computed rollups for {updated_count} account records")
    return updated_count


async def run_migration():
    """Run the full Phase 3 migration."""
    print("\n" + "="*60)
    print("Phase 3 Migration: EmailMessage, Conversion Tracking, Account Rollups")
    print("="*60 + "\n")
    
    try:
        # Step 1: Create EmailMessage object
        print("Step 1: Creating EmailMessage object schema...")
        email_count = await create_emailmessage_object()
        print(f"  Created {email_count} EmailMessage objects")
        
        # Step 2: Add conversion tracking fields
        print("\nStep 2: Adding conversion tracking fields...")
        conv_count = await add_conversion_tracking_fields()
        print(f"  Updated {conv_count} objects with conversion fields")
        
        # Step 3: Add account rollup fields
        print("\nStep 3: Adding account rollup fields...")
        rollup_count = await add_account_rollup_fields()
        print(f"  Updated {rollup_count} account objects")
        
        # Step 4: Compute initial rollup values
        print("\nStep 4: Computing initial account rollup values...")
        await compute_account_rollups()
        
        # Step 5: Create indexes
        print("\nStep 5: Creating indexes...")
        await db.object_records.create_index([
            ("tenant_id", 1),
            ("object_name", 1),
            ("data.account_id", 1),
            ("data.is_closed", 1)
        ])
        await db.object_records.create_index([
            ("tenant_id", 1),
            ("object_name", 1),
            ("data.person_link_id", 1)
        ])
        await db.object_records.create_index([
            ("tenant_id", 1),
            ("object_name", 1),
            ("data.record_link_id", 1)
        ])
        print("  Created indexes for activity links and rollups")
        
        print("\n" + "="*60)
        print("Phase 3 Migration Complete!")
        print("="*60 + "\n")
        
    except Exception as e:
        print(f"\nMigration Error: {str(e)}")
        raise


if __name__ == "__main__":
    asyncio.run(run_migration())
