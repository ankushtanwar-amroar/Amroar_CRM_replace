"""
Phase 1 Migration: Add system fields, activity links, and computed fields to objects.

This migration:
1. Adds system fields (created_by, updated_by, is_deleted, system_timestamp) to object metadata
2. Adds person_link_id and record_link_id to Task/Event objects
3. Adds computed 'name' field to Lead/Contact (read-only)
4. Adds last_activity_at field to Lead/Contact/Account/Opportunity (read-only)
5. Backfills existing records with default values

Run: python -m migrations.phase1_system_fields
"""
import asyncio
from datetime import datetime, timezone
from typing import Dict, Any
import sys
import os

# Add backend to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config.database import db


# New field definitions to add to object metadata
SYSTEM_FIELDS = {
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

# Activity link fields for Task/Event
ACTIVITY_LINK_FIELDS = {
    "person_link_id": {
        "type": "lookup",
        "label": "Person Link",
        "required": False,
        "read_only": False,
        "related_object": "lead,contact",  # Polymorphic
        "description": "Links to the person (Lead/Contact) this activity is with/for"
    },
    "record_link_id": {
        "type": "lookup",
        "label": "Record Link", 
        "required": False,
        "read_only": False,
        "related_object": "any",  # Polymorphic - any record
        "description": "Links to the record this activity is about/related to"
    }
}

# Computed name field for Lead/Contact
COMPUTED_NAME_FIELD = {
    "name": {
        "type": "text",
        "label": "Full Name",
        "required": False,
        "read_only": True,
        "computed": True,
        "formula": "CONCATENATE(first_name, ' ', last_name)",
        "description": "Auto-computed from first_name and last_name"
    }
}

# last_activity_at field for main objects
LAST_ACTIVITY_FIELD = {
    "last_activity_at": {
        "type": "datetime",
        "label": "Last Activity",
        "required": False,
        "read_only": True,
        "computed": True,
        "description": "Last Task/Event activity linked to this record"
    }
}


async def add_fields_to_object(object_name: str, fields: Dict[str, Any], tenant_id: str = None):
    """Add fields to an object's metadata."""
    query = {"object_name": object_name}
    if tenant_id:
        query["tenant_id"] = tenant_id
    
    # Get existing object(s)
    objects = await db.tenant_objects.find(query).to_list(None)
    
    updated_count = 0
    for obj in objects:
        existing_fields = obj.get("fields", {})
        fields_added = []
        
        for field_name, field_def in fields.items():
            if field_name not in existing_fields:
                existing_fields[field_name] = field_def
                fields_added.append(field_name)
        
        if fields_added:
            await db.tenant_objects.update_one(
                {"_id": obj["_id"]},
                {"$set": {"fields": existing_fields}}
            )
            updated_count += 1
            print(f"  Added fields {fields_added} to {object_name} (tenant: {obj.get('tenant_id', 'N/A')[:8]}...)")
    
    return updated_count


async def backfill_system_fields():
    """Backfill existing records with system field defaults."""
    now = datetime.now(timezone.utc).isoformat()
    
    # Update records that don't have the new system fields
    result = await db.object_records.update_many(
        {"updated_by": {"$exists": False}},
        {"$set": {
            "updated_by": None,  # Will be set to owner_id where available
            "system_timestamp": now,
            "is_deleted": False
        }}
    )
    print(f"  Backfilled system fields on {result.modified_count} records")
    
    # Copy owner_id to updated_by where owner_id exists
    result = await db.object_records.update_many(
        {
            "updated_by": None,
            "owner_id": {"$exists": True, "$ne": None}
        },
        [{"$set": {"updated_by": "$owner_id"}}]
    )
    print(f"  Set updated_by from owner_id on {result.modified_count} records")
    
    # Copy owner_id to created_by where created_by is missing
    result = await db.object_records.update_many(
        {
            "created_by": {"$in": [None, ""]},
            "owner_id": {"$exists": True, "$ne": None}
        },
        [{"$set": {"created_by": "$owner_id"}}]
    )
    print(f"  Set created_by from owner_id on {result.modified_count} records")


async def backfill_computed_names():
    """Backfill computed name field for Lead and Contact records."""
    for object_name in ["lead", "contact"]:
        records = await db.object_records.find({
            "object_name": object_name,
            "$or": [
                {"data.name": {"$exists": False}},
                {"data.name": None},
                {"data.name": ""}
            ]
        }).to_list(None)
        
        updated = 0
        for record in records:
            data = record.get("data", {})
            first_name = (data.get("first_name") or "").strip()
            last_name = (data.get("last_name") or "").strip()
            
            if first_name and last_name:
                name = f"{first_name} {last_name}"
            elif last_name:
                name = last_name
            elif first_name:
                name = first_name
            else:
                continue
            
            await db.object_records.update_one(
                {"_id": record["_id"]},
                {"$set": {"data.name": name}}
            )
            updated += 1
        
        print(f"  Backfilled name field on {updated} {object_name} records")


async def migrate_activity_links():
    """Migrate existing related_to/related_type fields to new link fields."""
    for activity_type in ["task", "event"]:
        # Find records with legacy fields but no new link fields
        records = await db.object_records.find({
            "object_name": activity_type,
            "data.related_to": {"$exists": True, "$ne": None, "$ne": ""},
            "data.person_link_id": {"$exists": False},
            "data.record_link_id": {"$exists": False}
        }).to_list(None)
        
        person_migrated = 0
        record_migrated = 0
        
        for record in records:
            data = record.get("data", {})
            related_to = data.get("related_to")
            related_type = (data.get("related_type") or "").lower()
            
            update = {}
            if related_type in ["lead", "contact"]:
                update["data.person_link_id"] = related_to
                person_migrated += 1
            else:
                update["data.record_link_id"] = related_to
                record_migrated += 1
            
            if update:
                await db.object_records.update_one(
                    {"_id": record["_id"]},
                    {"$set": update}
                )
        
        print(f"  Migrated {activity_type}: {person_migrated} to person_link_id, {record_migrated} to record_link_id")


async def run_migration():
    """Run the full Phase 1 migration."""
    print("\n" + "="*60)
    print("Phase 1 Migration: System Fields, Activity Links, Computed Fields")
    print("="*60 + "\n")
    
    try:
        # Step 1: Add system fields to all objects
        print("Step 1: Adding system fields to object metadata...")
        all_objects = await db.tenant_objects.distinct("object_name")
        for obj_name in all_objects:
            await add_fields_to_object(obj_name, SYSTEM_FIELDS)
        
        # Step 2: Add activity link fields to Task/Event
        print("\nStep 2: Adding activity link fields to Task/Event...")
        for activity_obj in ["task", "event"]:
            await add_fields_to_object(activity_obj, ACTIVITY_LINK_FIELDS)
        
        # Step 3: Add computed name field to Lead/Contact
        print("\nStep 3: Adding computed name field to Lead/Contact...")
        for person_obj in ["lead", "contact"]:
            await add_fields_to_object(person_obj, COMPUTED_NAME_FIELD)
        
        # Step 4: Add last_activity_at field to main objects
        print("\nStep 4: Adding last_activity_at field to main objects...")
        for main_obj in ["lead", "contact", "account", "opportunity"]:
            await add_fields_to_object(main_obj, LAST_ACTIVITY_FIELD)
        
        # Step 5: Backfill existing records
        print("\nStep 5: Backfilling system fields on existing records...")
        await backfill_system_fields()
        
        # Step 6: Backfill computed names
        print("\nStep 6: Backfilling computed name field on Lead/Contact...")
        await backfill_computed_names()
        
        # Step 7: Migrate activity links
        print("\nStep 7: Migrating legacy activity links...")
        await migrate_activity_links()
        
        print("\n" + "="*60)
        print("Phase 1 Migration Complete!")
        print("="*60 + "\n")
        
    except Exception as e:
        print(f"\nMigration Error: {str(e)}")
        raise


if __name__ == "__main__":
    asyncio.run(run_migration())
