"""
Record Types Routes
Extracted from server.py as part of Step 5 refactoring.
"""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import Optional
from datetime import datetime, timezone
import uuid

from config.database import db
from modules.auth.api.auth_routes import get_current_user

router = APIRouter()
security = HTTPBearer()


@router.get("/objects/{object_name}/record-types")
async def get_record_types(
    object_name: str,
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    """Get all record types for an object (including inactive ones)"""
    current_user = await get_current_user(credentials)

    
    record_types = await db.record_types.find({
        "object_name": object_name,
        "tenant_id": current_user.tenant_id
    }, {"_id": 0}).to_list(length=None)
    
    return record_types


@router.post("/objects/{object_name}/record-types")
async def create_record_type(
    object_name: str,
    record_type_data: dict,
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    """Create a new record type for an object"""
    current_user = await get_current_user(credentials)

    
    # Verify object exists for this tenant
    obj = await db.tenant_objects.find_one({
        "tenant_id": current_user.tenant_id,
        "object_name": object_name
    })
    if not obj:
        raise HTTPException(status_code=404, detail=f"Object '{object_name}' not found")
    
    # Check if API name already exists
    existing = await db.record_types.find_one({
        "object_name": object_name,
        "tenant_id": current_user.tenant_id,
        "api_name": record_type_data.get("api_name")
    })
    
    if existing:
        raise HTTPException(status_code=400, detail="Record type with this API name already exists")
    
    # If this is set as default, unset other defaults
    if record_type_data.get("is_default", False):
        await db.record_types.update_many(
            {
                "object_name": object_name,
                "tenant_id": current_user.tenant_id
            },
            {"$set": {"is_default": False}}
        )
    
    record_type = {
        "id": str(uuid.uuid4()),
        "object_name": object_name,
        "tenant_id": current_user.tenant_id,
        "name": record_type_data.get("name"),
        "api_name": record_type_data.get("api_name"),
        "description": record_type_data.get("description"),
        "is_default": record_type_data.get("is_default", False),
        "is_active": True,
        "page_layout_config": record_type_data.get("page_layout_config"),
        "visible_fields": record_type_data.get("visible_fields"),
        "required_fields": record_type_data.get("required_fields"),
        "hidden_fields": record_type_data.get("hidden_fields"),
        "picklist_values": record_type_data.get("picklist_values", []),
        "page_assignment_type": record_type_data.get("page_assignment_type", "default"),
        "lightning_page_id": record_type_data.get("lightning_page_id"),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "created_by": current_user.id
    }
    
    await db.record_types.insert_one(record_type)
    
    # Return response without the inserted document to avoid ObjectId serialization issues
    return {
        "message": "Record type created successfully", 
        "id": record_type["id"],
        "record_type": {
            "id": record_type["id"],
            "object_name": record_type["object_name"],
            "name": record_type["name"],
            "api_name": record_type["api_name"],
            "description": record_type["description"],
            "is_default": record_type["is_default"],
            "is_active": record_type["is_active"]
        }
    }


@router.get("/record-types/{record_type_id}")
async def get_record_type(
    record_type_id: str,
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    """Get a specific record type by ID"""
    current_user = await get_current_user(credentials)

    
    record_type = await db.record_types.find_one({
        "id": record_type_id,
        "tenant_id": current_user.tenant_id
    }, {"_id": 0})
    
    if not record_type:
        raise HTTPException(status_code=404, detail="Record type not found")
    
    return record_type


@router.put("/record-types/{record_type_id}")
async def update_record_type(
    record_type_id: str,
    update_data: dict,
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    """Update a record type"""
    current_user = await get_current_user(credentials)

    
    # Check if record type exists
    record_type = await db.record_types.find_one({
        "id": record_type_id,
        "tenant_id": current_user.tenant_id
    })
    
    if not record_type:
        raise HTTPException(status_code=404, detail="Record type not found")
    
    # If updating to default, unset other defaults
    if update_data.get("is_default", False):
        await db.record_types.update_many(
            {
                "object_name": record_type["object_name"],
                "tenant_id": current_user.tenant_id,
                "id": {"$ne": record_type_id}
            },
            {"$set": {"is_default": False}}
        )
    
    # Prepare update fields
    update_fields = {
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    allowed_fields = [
        "name", "api_name", "description", "is_default", "is_active",
        "page_layout_config", "visible_fields", "required_fields", 
        "hidden_fields", "picklist_values", "page_assignment_type", "lightning_page_id"
    ]
    
    for field in allowed_fields:
        if field in update_data:
            update_fields[field] = update_data[field]
    
    await db.record_types.update_one(
        {"id": record_type_id, "tenant_id": current_user.tenant_id},
        {"$set": update_fields}
    )
    
    # Get updated record type
    updated_record_type = await db.record_types.find_one({
        "id": record_type_id,
        "tenant_id": current_user.tenant_id
    }, {"_id": 0})
    
    return {"message": "Record type updated successfully", "record_type": updated_record_type}


@router.delete("/record-types/{record_type_id}")
async def delete_record_type(
    record_type_id: str,
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    """Delete (deactivate) a record type"""
    current_user = await get_current_user(credentials)

    
    # Check if record type exists
    record_type = await db.record_types.find_one({
        "id": record_type_id,
        "tenant_id": current_user.tenant_id
    })
    
    if not record_type:
        raise HTTPException(status_code=404, detail="Record type not found")
    
    # Don't allow deleting if records exist with this type
    record_count = await db.object_records.count_documents({
        "tenant_id": current_user.tenant_id,
        "object_name": record_type["object_name"],
        "record_type_id": record_type_id
    })
    
    if record_count > 0:
        raise HTTPException(
            status_code=400, 
            detail=f"Cannot delete record type. {record_count} record(s) are using this type. Please reassign them first."
        )
    
    # Hard delete record type since user expects permanent removal
    # (Existing check above ensures no records are using it)
    # Soft delete by marking as inactive
    # await db.record_types.update_one(
    #     {"id": record_type_id, "tenant_id": current_user.tenant_id},
    #     {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc).isoformat()}}
    # )
    await db.record_types.delete_one(
        {"id": record_type_id, "tenant_id": current_user.tenant_id}
    )
    return {"message": "Record type deleted successfully"}


@router.get("/record-types/{record_type_id}/picklist-values")
async def get_picklist_values_for_record_type(
    record_type_id: str,
    field_name: str,
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    """Get filtered picklist values for a specific field in a record type"""
    current_user = await get_current_user(credentials)

    
    record_type = await db.record_types.find_one({
        "id": record_type_id,
        "tenant_id": current_user.tenant_id
    }, {"_id": 0})
    
    if not record_type:
        raise HTTPException(status_code=404, detail="Record type not found")
    
    # Find picklist configuration for the field
    picklist_values = record_type.get("picklist_values", [])
    for config in picklist_values:
        if config.get("field_name") == field_name:
            return {"field_name": field_name, "available_values": config.get("available_values", [])}
    
    # If no specific config, return all values (get from object definition)
    return {"field_name": field_name, "available_values": None, "message": "No filtering configured"}



# ============================================================================
# ALIAS ROUTES: /api/record-types-config/{object_name}
# These routes provide backwards compatibility with the frontend
# ============================================================================

@router.get("/record-types-config/{object_name}")
async def get_record_types_config(
    object_name: str,
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    """Alias for /objects/{object_name}/record-types - Get all record types for an object (including inactive ones)"""
    current_user = await get_current_user(credentials)
    
    record_types = await db.record_types.find({
        "object_name": object_name,
        "tenant_id": current_user.tenant_id
    }, {"_id": 0}).to_list(length=None)
    
    return record_types


@router.post("/record-types-config/{object_name}")
async def create_record_type_config(
    object_name: str,
    record_type_data: dict,
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    """Alias for /objects/{object_name}/record-types - Create a new record type"""
    current_user = await get_current_user(credentials)
    
    # Verify object exists for this tenant
    obj = await db.tenant_objects.find_one({
        "tenant_id": current_user.tenant_id,
        "object_name": object_name
    })
    if not obj:
        raise HTTPException(status_code=404, detail=f"Object '{object_name}' not found")
    
    # Handle both frontend (type_name) and backend (name) field names
    name = record_type_data.get("type_name") or record_type_data.get("name")
    if not name:
        raise HTTPException(status_code=400, detail="Record type name (type_name) is required")
    
    # Auto-generate api_name from name if not provided
    api_name = record_type_data.get("api_name")
    if not api_name:
        # Convert to snake_case
        api_name = name.lower().replace(" ", "_").replace("-", "_")
        # Remove special characters
        import re
        api_name = re.sub(r'[^a-z0-9_]', '', api_name)
    
    # Check if API name already exists
    existing = await db.record_types.find_one({
        "object_name": object_name,
        "tenant_id": current_user.tenant_id,
        "api_name": api_name
    })
    
    if existing:
        # Generate a unique api_name by appending a number
        counter = 1
        base_api_name = api_name
        while existing:
            api_name = f"{base_api_name}_{counter}"
            existing = await db.record_types.find_one({
                "object_name": object_name,
                "tenant_id": current_user.tenant_id,
                "api_name": api_name
            })
            counter += 1
    
    # If this is set as default, unset other defaults
    if record_type_data.get("is_default", False):
        await db.record_types.update_many(
            {
                "object_name": object_name,
                "tenant_id": current_user.tenant_id
            },
            {"$set": {"is_default": False}}
        )
    
    record_type = {
        "id": str(uuid.uuid4()),
        "object_name": object_name,
        "tenant_id": current_user.tenant_id,
        "name": name,
        "type_name": name,  # Include both for frontend compatibility
        "api_name": api_name,
        "description": record_type_data.get("description", ""),
        "is_default": record_type_data.get("is_default", False),
        "is_active": record_type_data.get("is_active", True),
        "page_layout_config": record_type_data.get("page_layout_config"),
        "visible_fields": record_type_data.get("visible_fields"),
        "required_fields": record_type_data.get("required_fields"),
        "hidden_fields": record_type_data.get("hidden_fields"),
        "picklist_values": record_type_data.get("picklist_values", []),
        "picklist_value_filters": record_type_data.get("picklist_value_filters", {}),
        "page_assignment_type": record_type_data.get("page_assignment_type", "default"),
        "lightning_page_id": record_type_data.get("lightning_page_id"),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "created_by": current_user.id
    }
    
    await db.record_types.insert_one(record_type)
    
    return {
        "id": record_type["id"],
        "object_name": record_type["object_name"],
        "name": record_type["name"],
        "type_name": record_type["type_name"],
        "api_name": record_type["api_name"],
        "description": record_type["description"],
        "is_default": record_type["is_default"],
        "is_active": record_type["is_active"]
    }


@router.put("/record-types-config/{object_name}/{record_type_id}")
async def update_record_type_config(
    object_name: str,
    record_type_id: str,
    update_data: dict,
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    """Alias for /record-types/{record_type_id} - Update a record type"""
    current_user = await get_current_user(credentials)
    
    # Check if record type exists
    record_type = await db.record_types.find_one({
        "id": record_type_id,
        "object_name": object_name,
        "tenant_id": current_user.tenant_id
    })
    
    if not record_type:
        raise HTTPException(status_code=404, detail="Record type not found")
    
    # If updating to default, unset other defaults
    if update_data.get("is_default", False):
        await db.record_types.update_many(
            {
                "object_name": object_name,
                "tenant_id": current_user.tenant_id,
                "id": {"$ne": record_type_id}
            },
            {"$set": {"is_default": False}}
        )
    
    # Prepare update fields
    update_fields = {
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    # Handle both frontend (type_name) and backend (name) field names
    if "type_name" in update_data:
        update_fields["name"] = update_data["type_name"]
        update_fields["type_name"] = update_data["type_name"]
    
    allowed_fields = [
        "name", "api_name", "description", "is_default", "is_active",
        "page_layout_config", "visible_fields", "required_fields", 
        "hidden_fields", "picklist_values", "picklist_value_filters",
        "page_assignment_type", "lightning_page_id"
    ]
    
    for field in allowed_fields:
        if field in update_data:
            update_fields[field] = update_data[field]
    
    await db.record_types.update_one(
        {"id": record_type_id, "tenant_id": current_user.tenant_id},
        {"$set": update_fields}
    )
    
    # Get updated record type
    updated_record_type = await db.record_types.find_one({
        "id": record_type_id,
        "tenant_id": current_user.tenant_id
    }, {"_id": 0})
    
    return updated_record_type


@router.delete("/record-types-config/{object_name}/{record_type_id}")
async def delete_record_type_config(
    object_name: str,
    record_type_id: str,
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    """Alias for /record-types/{record_type_id} - Delete a record type"""
    current_user = await get_current_user(credentials)
    
    # Check if record type exists
    record_type = await db.record_types.find_one({
        "id": record_type_id,
        "object_name": object_name,
        "tenant_id": current_user.tenant_id
    })
    
    if not record_type:
        raise HTTPException(status_code=404, detail="Record type not found")
    
    # Don't allow deleting if records exist with this type
    record_count = await db.object_records.count_documents({
        "tenant_id": current_user.tenant_id,
        "object_name": object_name,
        "record_type_id": record_type_id
    })
    
    if record_count > 0:
        raise HTTPException(
            status_code=400, 
            detail=f"Cannot delete record type. {record_count} record(s) are using this type. Please reassign them first."
        )
    
    # Hard delete record type since user expects permanent removal
    # (Existing check above ensures no records are using it)
    # Soft delete by marking as inactive
    # await db.record_types.update_one(
    #     {"id": record_type_id, "tenant_id": current_user.tenant_id},
    #     {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc).isoformat()}}
    # )
    await db.record_types.delete_one(
        {"id": record_type_id, "tenant_id": current_user.tenant_id}
    )
    return {"message": "Record type deleted successfully"}
