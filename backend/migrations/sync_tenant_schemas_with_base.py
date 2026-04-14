"""
Migration: Sync Existing Tenant Schemas with Base CRM Template
==============================================================

Purpose:
- Ensure all existing tenants have the complete set of standard CRM fields
- Add missing fields from BASE_CRM_OBJECTS to existing tenant objects
- Non-destructive: only adds missing fields, never removes or overwrites existing

Usage:
    python migrations/sync_tenant_schemas_with_base.py [--dry-run] [--tenant-id <id>]

Options:
    --dry-run       Show what would be changed without making changes
    --tenant-id     Only migrate a specific tenant (for testing)

Created: February 9, 2026
"""

import asyncio
import os
import sys
import argparse
from datetime import datetime
from typing import Dict, List, Any, Set

# Add backend to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from motor.motor_asyncio import AsyncIOMotorClient

# Import the base CRM template
from shared.constants.base_crm_template import (
    BASE_CRM_OBJECTS, 
    SYSTEM_FIELDS,
    STANDARD_CRM_OBJECTS
)

# MongoDB connection
MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.environ.get('DB_NAME', 'crm_db')


class SchemaSyncMigration:
    """Migration to sync tenant schemas with Base CRM Template"""
    
    def __init__(self, db, dry_run: bool = False):
        self.db = db
        self.dry_run = dry_run
        self.stats = {
            "tenants_processed": 0,
            "objects_updated": 0,
            "fields_added": 0,
            "objects_created": 0,
            "errors": []
        }
    
    async def run(self, tenant_id: str = None):
        """Run the migration"""
        print("=" * 60)
        print("Schema Sync Migration: Base CRM Template")
        print("=" * 60)
        print(f"Mode: {'DRY RUN' if self.dry_run else 'LIVE'}")
        print(f"Started: {datetime.now().isoformat()}")
        print()
        
        # Get all tenants or specific tenant
        if tenant_id:
            tenants = [tenant_id]
            print(f"Target: Single tenant ({tenant_id})")
        else:
            tenants = await self.db.tenant_objects.distinct("tenant_id")
            print(f"Target: All tenants ({len(tenants)} found)")
        
        print()
        
        # Process each tenant
        for tid in tenants:
            await self.sync_tenant(tid)
        
        # Print summary
        self.print_summary()
        
        return self.stats
    
    async def sync_tenant(self, tenant_id: str):
        """Sync a single tenant's schema with base template"""
        print(f"Processing tenant: {tenant_id[:8]}...")
        self.stats["tenants_processed"] += 1
        
        # Get existing objects for this tenant
        existing_objects = await self.db.tenant_objects.find(
            {"tenant_id": tenant_id}
        ).to_list(length=100)
        
        existing_by_name = {obj["object_name"]: obj for obj in existing_objects}
        
        # Check each standard CRM object
        for object_name, base_config in BASE_CRM_OBJECTS.items():
            if object_name in existing_by_name:
                # Object exists - sync fields
                await self.sync_object_fields(
                    tenant_id, 
                    existing_by_name[object_name],
                    base_config
                )
            else:
                # Object doesn't exist - create it
                await self.create_missing_object(tenant_id, object_name, base_config)
    
    async def sync_object_fields(
        self, 
        tenant_id: str, 
        existing_obj: Dict[str, Any],
        base_config: Dict[str, Any]
    ):
        """Sync fields for an existing object"""
        object_name = existing_obj["object_name"]
        existing_fields = existing_obj.get("fields", {})
        base_fields = base_config.get("fields", {})
        
        # Find missing fields
        missing_fields = {}
        for field_name, field_config in base_fields.items():
            if field_name not in existing_fields:
                missing_fields[field_name] = field_config
        
        # Also check system fields
        for field_name, field_config in SYSTEM_FIELDS.items():
            if field_name not in existing_fields:
                missing_fields[field_name] = field_config
        
        if not missing_fields:
            print(f"  ✓ {object_name}: All fields present")
            return
        
        # Report missing fields
        print(f"  → {object_name}: Adding {len(missing_fields)} missing fields:")
        for field_name in missing_fields:
            print(f"      + {field_name}")
        
        if self.dry_run:
            self.stats["fields_added"] += len(missing_fields)
            return
        
        # Merge fields (existing + missing)
        updated_fields = {**existing_fields, **missing_fields}
        
        # Update in database
        try:
            result = await self.db.tenant_objects.update_one(
                {"_id": existing_obj["_id"]},
                {
                    "$set": {
                        "fields": updated_fields,
                        "updated_at": datetime.utcnow().isoformat()
                    }
                }
            )
            
            if result.modified_count > 0:
                self.stats["objects_updated"] += 1
                self.stats["fields_added"] += len(missing_fields)
                print(f"      ✓ Updated successfully")
            else:
                print(f"      ⚠ No changes made")
                
        except Exception as e:
            error_msg = f"Failed to update {object_name} for tenant {tenant_id}: {e}"
            self.stats["errors"].append(error_msg)
            print(f"      ✗ Error: {e}")
    
    async def create_missing_object(
        self,
        tenant_id: str,
        object_name: str,
        base_config: Dict[str, Any]
    ):
        """Create a missing standard object for a tenant"""
        print(f"  → Creating missing object: {object_name}")
        
        if self.dry_run:
            self.stats["objects_created"] += 1
            return
        
        # Build the object document
        from uuid import uuid4
        
        # Merge base fields with system fields
        all_fields = {**base_config.get("fields", {})}
        for field_name, field_config in SYSTEM_FIELDS.items():
            if field_name not in all_fields:
                all_fields[field_name] = field_config
        
        object_doc = {
            "id": str(uuid4()),
            "tenant_id": tenant_id,
            "object_name": object_name,
            "object_label": base_config.get("object_label", object_name.title()),
            "object_plural": base_config.get("object_plural", f"{object_name.title()}s"),
            "fields": all_fields,
            "name_field": base_config.get("name_field"),
            "icon": base_config.get("icon"),
            "is_custom": False,
            "is_system": True,
            "enable_activities": base_config.get("enable_activities", False),
            "enable_search": base_config.get("enable_search", True),
            "enable_reports": base_config.get("enable_reports", True),
            "created_at": datetime.utcnow().isoformat(),
            "updated_at": datetime.utcnow().isoformat()
        }
        
        try:
            await self.db.tenant_objects.insert_one(object_doc)
            self.stats["objects_created"] += 1
            print(f"      ✓ Created successfully")
        except Exception as e:
            error_msg = f"Failed to create {object_name} for tenant {tenant_id}: {e}"
            self.stats["errors"].append(error_msg)
            print(f"      ✗ Error: {e}")
    
    def print_summary(self):
        """Print migration summary"""
        print()
        print("=" * 60)
        print("Migration Summary")
        print("=" * 60)
        print(f"  Tenants processed:  {self.stats['tenants_processed']}")
        print(f"  Objects updated:    {self.stats['objects_updated']}")
        print(f"  Fields added:       {self.stats['fields_added']}")
        print(f"  Objects created:    {self.stats['objects_created']}")
        print(f"  Errors:             {len(self.stats['errors'])}")
        
        if self.stats["errors"]:
            print()
            print("Errors:")
            for err in self.stats["errors"]:
                print(f"  - {err}")
        
        print()
        if self.dry_run:
            print("⚠️  DRY RUN - No changes were made")
            print("   Run without --dry-run to apply changes")
        else:
            print("✅ Migration complete")


async def main():
    """Main entry point"""
    parser = argparse.ArgumentParser(
        description="Sync tenant schemas with Base CRM Template"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be changed without making changes"
    )
    parser.add_argument(
        "--tenant-id",
        type=str,
        help="Only migrate a specific tenant"
    )
    
    args = parser.parse_args()
    
    # Connect to MongoDB
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    
    try:
        # Run migration
        migration = SchemaSyncMigration(db, dry_run=args.dry_run)
        stats = await migration.run(tenant_id=args.tenant_id)
        
        # Exit code based on errors
        if stats["errors"]:
            sys.exit(1)
            
    finally:
        client.close()


if __name__ == "__main__":
    asyncio.run(main())
