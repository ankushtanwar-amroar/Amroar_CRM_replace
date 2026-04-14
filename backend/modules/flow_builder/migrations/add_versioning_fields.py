"""
Migration: Add Version Control Fields to Existing Flows
Makes existing flows compatible with new versioning system (non-breaking)
"""
import os
import sys
from pymongo import MongoClient
from datetime import datetime, timezone

def migrate_flows_to_versioning():
    """
    Migrate existing flows to support versioning:
    - Set version = 1 for all existing flows
    - Set status = 'active' for is_active=True flows
    - Set status = 'draft' for is_active=False flows
    - Set parent_flow_id = None (they are v1)
    - Set version_label = 'v1'
    """
    
    mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
    client = MongoClient(mongo_url)
    
    # Find the correct database
    db_name = None
    for name in client.list_database_names():
        if name not in ['admin', 'local', 'config']:
            db = client[name]
            if 'flows' in db.list_collection_names():
                db_name = name
                break
    
    if not db_name:
        print("❌ No database with 'flows' collection found")
        return
    
    db = client[db_name]
    print(f"✅ Using database: {db_name}")
    
    # Get all flows
    flows = list(db.flows.find({}))
    print(f"\n📊 Found {len(flows)} flows to migrate")
    
    updated_count = 0
    for flow in flows:
        flow_id = flow.get('id')
        
        # Prepare update
        update_fields = {}
        
        # Add version if not present
        if 'version' not in flow:
            update_fields['version'] = 1
        
        # Add status if not present
        if 'status' not in flow:
            is_active = flow.get('is_active', True)
            update_fields['status'] = 'active' if is_active else 'draft'
        
        # Add parent_flow_id if not present
        if 'parent_flow_id' not in flow:
            update_fields['parent_flow_id'] = None
        
        # Add version_label if not present
        if 'version_label' not in flow:
            update_fields['version_label'] = f"v{flow.get('version', 1)}"
        
        # Add created_by/updated_by if not present
        if 'created_by' not in flow:
            update_fields['created_by'] = 'system_migration'
        if 'updated_by' not in flow:
            update_fields['updated_by'] = 'system_migration'
        
        # Update flow if needed
        if update_fields:
            db.flows.update_one(
                {'id': flow_id},
                {'$set': update_fields}
            )
            updated_count += 1
            print(f"  ✅ Updated flow: {flow.get('name', 'Unnamed')} (v{update_fields.get('version', flow.get('version', 1))}, {update_fields.get('status', flow.get('status', 'draft'))})")
    
    print(f"\n✅ Migration complete: {updated_count}/{len(flows)} flows updated")
    
    # Migrate flow_executions to add version_number if missing
    print(f"\n📊 Migrating flow_executions...")
    executions = db.flow_executions.find({'flow_version': {'$exists': False}})
    exec_count = 0
    for exec_doc in executions:
        db.flow_executions.update_one(
            {'id': exec_doc.get('id')},
            {'$set': {'flow_version': 1}}  # Assume v1 for old executions
        )
        exec_count += 1
    
    if exec_count > 0:
        print(f"  ✅ Updated {exec_count} flow_executions with version_number")
    else:
        print(f"  ✅ All flow_executions already have flow_version field")
    
    print("\n🎉 Versioning migration completed successfully!")
    print("   All existing flows are now v1 with appropriate status")
    print("   All existing executions reference v1")

if __name__ == "__main__":
    try:
        migrate_flows_to_versioning()
    except Exception as e:
        print(f"❌ Migration failed: {str(e)}")
        sys.exit(1)
