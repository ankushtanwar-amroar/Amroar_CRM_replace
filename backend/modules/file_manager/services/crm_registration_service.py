"""
File Manager - CRM Object Registration Service
==============================================
Registers File, FileVersion, and FileRecordLink as first-class CRM objects
in the Object Manager, similar to Salesforce's ContentDocument model.

This is an architectural promotion, NOT a rewrite:
- Existing collections (fm_files, fm_file_versions, fm_file_record_links) are reused
- All CRUD operations still route through enforcement and ACL services
- No data migration needed
"""

import uuid
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorDatabase
import logging

logger = logging.getLogger(__name__)

# File Manager CRM Object Definitions
FILE_OBJECT_DEFINITION = {
    "object_name": "file",
    "object_label": "File",
    "object_plural": "Files",
    "icon": "file",
    "description": "Document and file management entity",
    "collection_name": "fm_files",  # Map to existing collection
    "is_system_object": True,  # System object - core fields locked
    "is_file_manager_object": True,  # Flag for special handling
    "module": "file_manager",
    "fields": {
        "id": {"type": "text", "required": True, "label": "File ID", "is_system": True, "is_locked": True},
        "name": {"type": "text", "required": True, "label": "Name", "is_searchable": True},
        "description": {"type": "textarea", "required": False, "label": "Description", "is_searchable": True},
        "original_filename": {"type": "text", "required": True, "label": "Original Filename", "is_system": True},
        "library_id": {"type": "lookup", "required": False, "label": "Library", "lookup_object": "file_library"},
        "folder_id": {"type": "lookup", "required": False, "label": "Folder", "lookup_object": "file_folder"},
        "category_id": {"type": "lookup", "required": False, "label": "Category", "lookup_object": "file_category"},
        "sensitivity_id": {"type": "lookup", "required": False, "label": "Sensitivity Level"},
        "tags": {"type": "multipicklist", "required": False, "label": "Tags"},
        "current_version_number": {"type": "number", "required": False, "label": "Version", "is_system": True},
        "size_bytes": {"type": "number", "required": False, "label": "Size (Bytes)", "is_system": True},
        "mime_type": {"type": "text", "required": False, "label": "MIME Type", "is_system": True},
        "file_extension": {"type": "text", "required": False, "label": "Extension", "is_system": True},
        "status": {"type": "picklist", "required": True, "label": "Status", "options": ["active", "archived", "deleted", "processing"]},
        "visibility_mode": {"type": "picklist", "required": False, "label": "Visibility", "options": ["INHERIT", "RESTRICTED"], "is_locked": True},
        "owner_id": {"type": "lookup", "required": False, "label": "Owner", "lookup_object": "user"},
        "created_by": {"type": "lookup", "required": True, "label": "Created By", "lookup_object": "user", "is_system": True},
        "created_at": {"type": "datetime", "required": True, "label": "Created Date", "is_system": True},
        "updated_by": {"type": "lookup", "required": False, "label": "Updated By", "lookup_object": "user", "is_system": True},
        "updated_at": {"type": "datetime", "required": False, "label": "Updated Date", "is_system": True},
        # Protected system fields - hidden from standard editing
        "legal_hold": {"type": "boolean", "required": False, "label": "Legal Hold", "is_locked": True, "is_protected": True},
        "retention_date": {"type": "datetime", "required": False, "label": "Retention Date", "is_locked": True, "is_protected": True},
    }
}

FILE_VERSION_OBJECT_DEFINITION = {
    "object_name": "file_version",
    "object_label": "File Version",
    "object_plural": "File Versions",
    "icon": "git-branch",
    "description": "Version history for files",
    "collection_name": "fm_file_versions",
    "is_system_object": True,
    "is_file_manager_object": True,
    "is_child_object": True,
    "parent_object": "file",
    "parent_field": "file_id",
    "module": "file_manager",
    "fields": {
        "id": {"type": "text", "required": True, "label": "Version ID", "is_system": True, "is_locked": True},
        "file_id": {"type": "lookup", "required": True, "label": "File", "lookup_object": "file", "is_system": True},
        "version_number": {"type": "number", "required": True, "label": "Version Number", "is_system": True},
        "size_bytes": {"type": "number", "required": False, "label": "Size (Bytes)", "is_system": True},
        "mime_type": {"type": "text", "required": False, "label": "MIME Type", "is_system": True},
        "checksum": {"type": "text", "required": False, "label": "Checksum", "is_system": True},
        "is_current": {"type": "boolean", "required": True, "label": "Is Current", "is_system": True},
        "storage_provider": {"type": "picklist", "required": True, "label": "Storage Provider", "options": ["local", "s3", "google_drive"], "is_locked": True, "is_protected": True},
        "storage_key": {"type": "text", "required": True, "label": "Storage Key", "is_locked": True, "is_protected": True},
        "uploaded_by": {"type": "lookup", "required": True, "label": "Uploaded By", "lookup_object": "user", "is_system": True},
        "uploaded_at": {"type": "datetime", "required": True, "label": "Uploaded Date", "is_system": True},
    }
}

FILE_RECORD_LINK_OBJECT_DEFINITION = {
    "object_name": "file_record_link",
    "object_label": "File Record Link",
    "object_plural": "File Record Links",
    "icon": "link",
    "description": "Junction object linking files to CRM records",
    "collection_name": "fm_file_record_links",
    "is_system_object": True,
    "is_file_manager_object": True,
    "is_junction_object": True,
    "module": "file_manager",
    "fields": {
        "id": {"type": "text", "required": True, "label": "Link ID", "is_system": True, "is_locked": True},
        "file_id": {"type": "lookup", "required": True, "label": "File", "lookup_object": "file"},
        "record_id": {"type": "text", "required": True, "label": "Record ID"},  # Polymorphic
        "object_name": {"type": "text", "required": True, "label": "Object Type"},  # e.g., "lead", "account"
        "is_primary": {"type": "boolean", "required": False, "label": "Primary File"},
        "linked_by": {"type": "lookup", "required": True, "label": "Linked By", "lookup_object": "user", "is_system": True},
        "linked_at": {"type": "datetime", "required": True, "label": "Linked Date", "is_system": True},
        "notes": {"type": "textarea", "required": False, "label": "Notes"},
    }
}


async def register_file_manager_objects(db: AsyncIOMotorDatabase, tenant_id: str):
    """
    Register File Manager objects as CRM-native objects.
    This makes them visible in Object Manager and other CRM features.
    
    Does NOT create new collections - maps to existing fm_* collections.
    """
    
    now = datetime.now(timezone.utc)
    objects_to_register = [
        FILE_OBJECT_DEFINITION,
        FILE_VERSION_OBJECT_DEFINITION,
        FILE_RECORD_LINK_OBJECT_DEFINITION,
    ]
    
    registered_count = 0
    
    for obj_def in objects_to_register:
        object_name = obj_def["object_name"]
        
        # Check if already registered
        existing = await db.tenant_objects.find_one({
            "tenant_id": tenant_id,
            "object_name": object_name
        })
        
        if existing:
            logger.info(f"File Manager object '{object_name}' already registered for tenant {tenant_id}")
            continue
        
        # Register as tenant object
        tenant_object = {
            "tenant_id": tenant_id,
            "object_name": object_name,
            "object_label": obj_def["object_label"],
            "object_plural": obj_def["object_plural"],
            "icon": obj_def.get("icon", "file"),
            "description": obj_def.get("description", ""),
            "collection_name": obj_def.get("collection_name"),
            "fields": obj_def["fields"],
            "is_system_object": obj_def.get("is_system_object", True),
            "is_file_manager_object": True,
            "is_child_object": obj_def.get("is_child_object", False),
            "is_junction_object": obj_def.get("is_junction_object", False),
            "parent_object": obj_def.get("parent_object"),
            "parent_field": obj_def.get("parent_field"),
            "module": "file_manager",
            "created_at": now.isoformat(),
            "updated_at": now.isoformat(),
            # Flags to ensure CRUD routes through File Manager services
            "crud_service": "file_manager",  # Indicates CRUD should route through FM services
            "enforce_acl": True,
            "enforce_module_guard": True,
        }
        
        await db.tenant_objects.insert_one(tenant_object)
        logger.info(f"Registered File Manager object '{object_name}' for tenant {tenant_id}")
        registered_count += 1
    
    return {
        "objects_registered": registered_count,
        "objects": [obj["object_name"] for obj in objects_to_register]
    }


async def unregister_file_manager_objects(db: AsyncIOMotorDatabase, tenant_id: str):
    """
    Unregister File Manager objects from CRM (for cleanup/testing).
    Does NOT delete data - only removes CRM object registration.
    """
    
    object_names = ["file", "file_version", "file_record_link"]
    
    result = await db.tenant_objects.delete_many({
        "tenant_id": tenant_id,
        "object_name": {"$in": object_names},
        "is_file_manager_object": True
    })
    
    logger.info(f"Unregistered {result.deleted_count} File Manager objects for tenant {tenant_id}")
    
    return {"objects_removed": result.deleted_count}


async def ensure_file_manager_objects_registered(db: AsyncIOMotorDatabase, tenant_id: str):
    """
    Ensure File Manager objects are registered for a tenant.
    Called during tenant initialization or on first File Manager access.
    """
    
    # Check if already registered
    existing = await db.tenant_objects.count_documents({
        "tenant_id": tenant_id,
        "is_file_manager_object": True
    })
    
    if existing >= 3:
        logger.debug(f"File Manager objects already registered for tenant {tenant_id}")
        return {"status": "already_registered", "count": existing}
    
    return await register_file_manager_objects(db, tenant_id)


# Search configuration helper
async def register_file_in_search_config(db: AsyncIOMotorDatabase, tenant_id: str):
    """
    Register File object in global search configuration.
    This allows File to be searchable via Configure Search Metadata.
    """
    
    # Get current config
    config = await db.global_search_config.find_one({"tenant_id": tenant_id})
    
    searchable_objects = config.get("searchable_objects", []) if config else []
    
    # Add file objects if not present
    file_objects = ["file", "file_version", "file_record_link"]
    updated = False
    
    for obj in file_objects:
        if obj not in searchable_objects:
            searchable_objects.append(obj)
            updated = True
    
    if updated:
        # Set field configuration for File object
        field_config = config.get("field_config", {}) if config else {}
        field_config["file"] = {
            "name": {"is_searchable": True},
            "description": {"is_searchable": True},
            "original_filename": {"is_searchable": True},
            "tags": {"is_searchable": True},
        }
        
        await db.global_search_config.update_one(
            {"tenant_id": tenant_id},
            {
                "$set": {
                    "searchable_objects": searchable_objects,
                    "field_config": field_config,
                    "tenant_id": tenant_id
                }
            },
            upsert=True
        )
        logger.info(f"Registered File objects in search config for tenant {tenant_id}")
    
    return {"search_registered": updated}
