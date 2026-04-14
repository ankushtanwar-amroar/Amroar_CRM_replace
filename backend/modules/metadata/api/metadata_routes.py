"""
Metadata Module - Object & Field Management
Routes for managing tenant objects and their fields.

INTEGRATION LAYER: This module now merges Schema Builder objects with existing tenant_objects.
- Existing CRM objects (tenant_objects) take precedence
- Schema Builder objects are added as additional objects
- No modification to core CRM logic
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
import logging
import math

from config.database import db
from shared.models import TenantObject, User
from modules.auth.api.auth_routes import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/objects", tags=["Objects & Metadata"])


async def _create_default_layouts_for_object(
    tenant_id: str,
    object_name: str,
    object_label: str,
    user_id: str
):
    """
    Auto-generate default Lightning page layouts for a new custom object.
    Creates both a Detail page and a New Record page.
    """
    import uuid
    
    now = datetime.now(timezone.utc)
    layouts_collection = db.lightning_page_layouts
    
    # Build field items for Record Detail component - just "name" as default
    field_items = [
        {"id": "field-name-0", "type": "field", "key": "name", "label": "Name"}
    ]
    
    # Create Record Detail section
    record_detail_section = {
        "id": f"section-{object_name}-info",
        "type": "field_section",
        "label": f"{object_label} Information",
        "collapsed": False,
        "fields": field_items
    }
    
    # Detail Layout
    detail_layout_id = str(uuid.uuid4())
    detail_layout = {
        "id": detail_layout_id,
        "tenant_id": tenant_id,
        "object_name": object_name,
        "layout_name": f"{object_label} Record Page",
        "api_name": f"{object_label.replace(' ', '_')}_Record_Page",
        "description": f"Default record detail layout for {object_label}",
        "page_type": "detail",
        "is_system": False,
        "is_default": True,
        "is_active": True,
        "selected_layout": "header_left_main",
        "template_type": "header_left_main",
        "placed_components": {
            "header": [],
            "left": [],
            "main": [{
                "id": "record_detail",
                "instanceId": f"record_detail-{detail_layout_id[:8]}",
                "name": "Record Detail",
                "regionId": "main",
                "config": {
                    "items": [record_detail_section]
                }
            }],
            "right": []
        },
        "sections": [{
            "name": f"{object_label} Information",
            "columns": 2,
            "fields": ["name"]
        }],
        "created_at": now,
        "updated_at": now,
        "created_by": user_id
    }
    
    # New Record Layout
    new_layout_id = str(uuid.uuid4())
    new_layout = {
        "id": new_layout_id,
        "tenant_id": tenant_id,
        "object_name": object_name,
        "layout_name": f"{object_label} New Page",
        "api_name": f"{object_label.replace(' ', '_')}_New_Page",
        "description": f"Default new record layout for {object_label}",
        "page_type": "new",
        "is_system": False,
        "is_default": True,
        "is_active": True,
        "selected_layout": "single_column",
        "template_type": "form",
        "placed_components": {
            "header": [],
            "left": [],
            "main": [{
                "id": "record_detail",
                "instanceId": f"record_detail-new-{new_layout_id[:8]}",
                "name": "Record Detail",
                "regionId": "main",
                "config": {
                    "items": [record_detail_section]
                }
            }],
            "right": []
        },
        "sections": [{
            "name": f"{object_label} Information",
            "columns": 2,
            "fields": ["name"]
        }],
        "required_fields": ["name"],
        "default_values": {},
        "created_at": now,
        "updated_at": now,
        "created_by": user_id
    }
    
    # Insert both layouts
    await layouts_collection.insert_many([detail_layout, new_layout])
    logger.info(f"Created default layouts (detail, new) for custom object {object_name}")


def parse_from_mongo(data):
    """Convert ISO strings back to datetime objects"""
    if isinstance(data, dict):
        parsed_data = {}
        for key, value in data.items():
            if key in ['created_at', 'updated_at'] and isinstance(value, str):
                try:
                    parsed_data[key] = datetime.fromisoformat(value)
                except ValueError:
                    parsed_data[key] = value
            elif isinstance(value, dict):
                parsed_data[key] = parse_from_mongo(value)
            else:
                parsed_data[key] = value
        return parsed_data
    return data


async def enrich_object_with_custom_fields(obj: dict, tenant_id: str) -> dict:
    """Merge custom fields and advanced fields into object definition"""
    custom_metadata = await db.metadata_fields.find_one({
        "object_name": obj["object_name"],
        "tenant_id": tenant_id
    }, {"_id": 0})
    
    # Get list of hidden fields
    hidden_fields = custom_metadata.get("hidden_fields", []) if custom_metadata else []
    
    # Remove hidden system fields
    for hidden_field in hidden_fields:
        if hidden_field in obj["fields"]:
            del obj["fields"][hidden_field]
    
    # Merge custom fields with system fields
    if custom_metadata and custom_metadata.get("fields"):
        for custom_field in custom_metadata["fields"]:
            field_def = {
                "id": custom_field.get("id"),
                "type": custom_field["type"].lower(),
                "required": custom_field.get("is_required", False),
                "label": custom_field["label"],
                "is_custom": True,
                "is_searchable": custom_field.get("is_searchable", False)
            }
            
            # Add options for picklist
            if custom_field["type"] == "Picklist" and custom_field.get("options"):
                field_def["options"] = custom_field["options"]
            
            # Add default value if present
            if custom_field.get("default_value") is not None:
                field_def["default"] = custom_field["default_value"]
            
            obj["fields"][custom_field["api_name"]] = field_def
    
    # =========================================
    # Merge Advanced Fields (Lookup, Rollup, Formula)
    # =========================================
    object_name = obj["object_name"]
    
    # Fetch all advanced fields for this object
    advanced_fields = await db.advanced_fields.find({
        "tenant_id": tenant_id,
        "object_name": object_name,
        "is_active": {"$ne": False}
    }, {"_id": 0}).to_list(None)
    
    for adv_field in advanced_fields:
        field_type = adv_field.get("field_type", "").lower()
        api_key = adv_field.get("api_key")
        
        if not api_key:
            continue
        
        field_def = {
            "id": adv_field.get("id"),
            "label": adv_field.get("label", api_key),
            "is_custom": True,
            "is_advanced_field": True,
            "advanced_field_type": field_type,
            "description": adv_field.get("description", "")
        }
        
        if field_type == "lookup":
            field_def["type"] = "lookup"
            field_def["lookup_object"] = adv_field.get("target_object")
            field_def["display_field"] = adv_field.get("display_field")
            field_def["required"] = adv_field.get("is_required", False)
        
        elif field_type == "rollup":
            field_def["type"] = adv_field.get("result_type", "number").lower()
            field_def["read_only"] = True
            field_def["computed"] = True
            field_def["rollup_type"] = adv_field.get("rollup_type")
            field_def["child_object"] = adv_field.get("child_object")
            field_def["summarize_field"] = adv_field.get("summarize_field")
        
        elif field_type == "formula":
            result_type = adv_field.get("return_type", "text").lower()
            field_def["type"] = result_type
            field_def["read_only"] = True
            field_def["computed"] = True
            field_def["formula"] = adv_field.get("expression")
        
        obj["fields"][api_key] = field_def
    
    return obj


async def get_schema_builder_objects_as_tenant_objects(tenant_id: str) -> List[dict]:
    """
    Fetch Schema Builder objects and convert them to TenantObject format.
    This enables Schema Builder objects to appear alongside existing CRM objects.
    
    Returns objects in the same format as tenant_objects for seamless integration.
    """
    schema_objects = await db.schema_objects.find(
        {"tenant_id": tenant_id, "is_active": True},
        {"_id": 0}
    ).to_list(None)
    
    converted_objects = []
    for obj in schema_objects:
        # Fetch fields for this object
        fields = await db.schema_fields.find(
            {"tenant_id": tenant_id, "object_id": obj["id"], "is_active": True},
            {"_id": 0}
        ).sort("sort_order", 1).to_list(None)
        
        # Convert fields to CRM format
        fields_dict = {}
        for field in fields:
            field_def = {
                "type": field["field_type"],
                "label": field["label"],
                "required": field.get("is_required", False),
                "is_custom": not field.get("is_system", False),
                "is_from_schema_builder": True  # Mark for identification
            }
            
            # Add options for picklist
            if field["field_type"] == "picklist" and field.get("picklist_values"):
                field_def["options"] = field["picklist_values"]
            
            # Add default value if present
            if field.get("default_value") is not None:
                field_def["default"] = field["default_value"]
            
            # Add lookup object reference
            if field["field_type"] == "lookup" and field.get("lookup_object"):
                field_def["lookup_object"] = field["lookup_object"]
            
            # Add help text
            if field.get("help_text"):
                field_def["help_text"] = field["help_text"]
            
            fields_dict[field["api_name"]] = field_def
        
        # Convert to TenantObject format
        tenant_obj = {
            "id": obj["id"],
            "tenant_id": tenant_id,
            "object_name": obj["api_name"],
            "object_label": obj["label"],
            "object_plural": obj.get("plural_label", f"{obj['label']}s"),
            "object_type": "schema_builder" if obj.get("is_custom", True) else "standard",
            "icon": obj.get("icon", "database"),
            "fields": fields_dict,
            "is_from_schema_builder": True,  # Mark for identification
            "created_at": obj.get("created_at", datetime.now(timezone.utc)),
            "updated_at": obj.get("updated_at", datetime.now(timezone.utc))
        }
        
        converted_objects.append(tenant_obj)
    
    return converted_objects


@router.get("/paginated")
async def get_paginated_objects(
    page: int = Query(1, ge=1, description="Page number (1-indexed)"),
    limit: int = Query(25, ge=1, le=100, description="Items per page"),
    search: Optional[str] = Query(None, description="Search term for label/api_name"),
    object_type: Optional[str] = Query(None, description="Filter by type: 'standard', 'custom', or None for all"),
    current_user: User = Depends(get_current_user)
) -> Dict[str, Any]:
    """
    Get paginated list of all objects (tenant_objects + schema_objects).
    Supports server-side pagination, search, and filtering.
    Optimized for 1000+ objects.
    
    Returns:
        - data: List of objects for current page
        - total: Total count of objects (matching filters)
        - page: Current page number
        - limit: Items per page
        - totalPages: Total number of pages
    """
    # System objects that should be hidden from navigation
    # These are internal/junction tables not meant for direct user access
    # "file" is hidden because users access Files through the DMS page at /files
    HIDDEN_SYSTEM_OBJECTS = {
        "file",              # Hidden - access via /files DMS page instead
        "file_record_link",  # Junction table for file-record relationships
        "file_version",      # Internal versioning storage
    }
    
    # 1. Fetch all objects (existing + schema builder)
    all_objects = []
    
    # Fetch existing CRM objects
    existing_objects = await db.tenant_objects.find(
        {"tenant_id": current_user.tenant_id}, 
        {"_id": 0}
    ).to_list(None)
    
    existing_object_names = {obj["object_name"].lower() for obj in existing_objects}
    
    # Convert existing objects to unified format (excluding hidden system objects)
    for obj in existing_objects:
        obj_name = obj.get("object_name", "").lower()
        if obj_name in HIDDEN_SYSTEM_OBJECTS:
            continue  # Skip hidden system objects
        all_objects.append({
            "id": obj.get("id"),
            "object_name": obj.get("object_name"),
            "object_label": obj.get("object_label"),
            "object_plural": obj.get("object_plural"),
            "description": obj.get("description", ""),
            "icon": obj.get("icon"),
            "is_custom": obj.get("is_custom", obj.get("object_type") == "custom")
        })
    
    # Fetch Schema Builder objects
    try:
        schema_objects = await db.schema_objects.find(
            {"tenant_id": current_user.tenant_id, "is_active": True},
            {"_id": 0}
        ).to_list(None)
        
        for obj in schema_objects:
            if obj.get("api_name", "").lower() not in existing_object_names:
                all_objects.append({
                    "id": obj.get("id"),
                    "object_name": obj.get("api_name"),
                    "object_label": obj.get("label"),
                    "object_plural": obj.get("plural_label"),
                    "description": obj.get("description", ""),
                    "icon": obj.get("icon"),
                    "is_custom": obj.get("is_custom", True)
                })
    except Exception as e:
        logger.warning(f"Failed to fetch Schema Builder objects for pagination: {str(e)}")
    
    # 2. Apply filters
    filtered_objects = all_objects
    
    # Search filter
    if search:
        search_lower = search.lower()
        filtered_objects = [
            obj for obj in filtered_objects
            if (search_lower in (obj.get("object_name") or "").lower() or
                search_lower in (obj.get("object_label") or "").lower() or
                search_lower in (obj.get("object_plural") or "").lower() or
                search_lower in (obj.get("description") or "").lower())
        ]
    
    # Type filter
    if object_type == "standard":
        filtered_objects = [obj for obj in filtered_objects if not obj.get("is_custom")]
    elif object_type == "custom":
        filtered_objects = [obj for obj in filtered_objects if obj.get("is_custom")]
    
    # 3. Sort by label
    filtered_objects.sort(key=lambda x: (x.get("object_label") or x.get("object_name") or "").lower())
    
    # 4. Calculate pagination
    total = len(filtered_objects)
    total_pages = math.ceil(total / limit) if total > 0 else 1
    start_idx = (page - 1) * limit
    end_idx = start_idx + limit
    
    # 5. Slice for current page
    paginated_objects = filtered_objects[start_idx:end_idx]
    
    return {
        "data": paginated_objects,
        "total": total,
        "page": page,
        "limit": limit,
        "totalPages": total_pages
    }


@router.get("", response_model=List[TenantObject])
async def get_tenant_objects(current_user: User = Depends(get_current_user)):
    """
    Get all objects for the tenant.
    
    INTEGRATION: This now merges:
    1. Existing CRM objects from tenant_objects (takes precedence)
    2. Schema Builder objects from schema_objects (additional)
    
    Conflict Rule: If an object exists in both places, existing CRM object wins.
    """
    # System objects that should be hidden from navigation
    # "file" is hidden because users access Files through the DMS page at /files
    HIDDEN_SYSTEM_OBJECTS = {
        "file",              # Hidden - access via /files DMS page instead
        "file_record_link",  # Junction table for file-record relationships
        "file_version",      # Internal versioning storage
    }
    
    # 1. Fetch existing CRM objects (these take precedence)
    existing_objects = await db.tenant_objects.find(
        {"tenant_id": current_user.tenant_id}, 
        {"_id": 0}
    ).to_list(None)
    
    existing_object_names = {obj["object_name"].lower() for obj in existing_objects}
    
    # 2. Enrich existing objects with custom fields (excluding hidden system objects)
    enriched_objects = []
    for obj in existing_objects:
        obj_name = obj.get("object_name", "").lower()
        if obj_name in HIDDEN_SYSTEM_OBJECTS:
            continue  # Skip hidden system objects
        enriched = await enrich_object_with_custom_fields(obj, current_user.tenant_id)
        enriched_objects.append(enriched)
    
    # 3. Fetch Schema Builder objects (only those not already defined in tenant_objects)
    try:
        schema_builder_objects = await get_schema_builder_objects_as_tenant_objects(current_user.tenant_id)
        
        # Filter out any Schema Builder objects that conflict with existing objects
        for sb_obj in schema_builder_objects:
            if sb_obj["object_name"].lower() not in existing_object_names:
                enriched_objects.append(sb_obj)
                logger.debug(f"Added Schema Builder object: {sb_obj['object_name']}")
            else:
                logger.debug(f"Skipped Schema Builder object (exists in tenant_objects): {sb_obj['object_name']}")
    except Exception as e:
        # If Schema Builder fails, continue with existing objects only
        logger.warning(f"Failed to fetch Schema Builder objects: {str(e)}")
    
    return [TenantObject(**parse_from_mongo(obj)) for obj in enriched_objects]


@router.get("/{object_name}", response_model=TenantObject)
async def get_object_details(object_name: str, current_user: User = Depends(get_current_user)):
    """Get details of a specific object"""
    
    # Handle special system objects that are not in tenant_objects
    if object_name.lower() == 'user':
        # Return virtual User object schema for reference field traversal (dot-walking)
        user_object = {
            "id": "system-user-object",
            "tenant_id": current_user.tenant_id,
            "object_name": "user",
            "object_label": "User",
            "object_plural": "Users",
            "object_type": "system",
            "icon": "user",
            "fields": {
                "name": {"type": "text", "label": "Name", "required": True},
                "email": {"type": "email", "label": "Email", "required": True},
                "status": {"type": "select", "label": "Status", "options": ["active", "inactive", "pending"]},
                "role": {"type": "text", "label": "Role"},
                "department": {"type": "text", "label": "Department"},
                "phone": {"type": "phone", "label": "Phone"},
                "created_at": {"type": "datetime", "label": "Created Date"},
                "last_login": {"type": "datetime", "label": "Last Login"},
            },
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        return TenantObject(**user_object)
    
    # 1. First check existing CRM objects (takes precedence)
    obj = await db.tenant_objects.find_one({
        "tenant_id": current_user.tenant_id,
        "object_name": object_name
    }, {"_id": 0})
    
    if obj:
        enriched = await enrich_object_with_custom_fields(obj, current_user.tenant_id)
        return TenantObject(**parse_from_mongo(enriched))
    
    # 2. If not found, check Schema Builder objects
    try:
        schema_obj = await db.schema_objects.find_one({
            "tenant_id": current_user.tenant_id,
            "api_name": object_name.lower(),
            "is_active": True
        }, {"_id": 0})
        
        if schema_obj:
            # Convert Schema Builder object to TenantObject format
            schema_builder_objects = await get_schema_builder_objects_as_tenant_objects(current_user.tenant_id)
            for sb_obj in schema_builder_objects:
                if sb_obj["object_name"].lower() == object_name.lower():
                    return TenantObject(**parse_from_mongo(sb_obj))
    except Exception as e:
        logger.warning(f"Failed to check Schema Builder for object {object_name}: {str(e)}")
    
    # 3. Not found in either source
    raise HTTPException(status_code=404, detail="Object not found")


# Pydantic model for creating custom objects
from pydantic import BaseModel
from typing import Optional, Dict, Any

class CustomObjectCreate(BaseModel):
    object_name: str
    object_label: str
    object_plural: str
    icon: Optional[str] = "box"
    name_field: Optional[str] = "name"
    default_fields: Optional[Dict[str, Any]] = None


class ObjectLabelUpdate(BaseModel):
    """Model for updating object display labels"""
    object_label: str
    object_plural: str
    description: Optional[str] = None


@router.put("/{object_name}/labels")
async def update_object_labels(
    object_name: str,
    label_data: ObjectLabelUpdate,
    current_user: User = Depends(get_current_user)
):
    """
    Update the display labels (singular and plural) for an object.
    This is a UI-level change only - does not affect API name, database collections, or routes.
    
    On first label change, stores original labels as default_label_singular/default_label_plural
    for reset functionality.
    """
    # Find the object
    obj = await db.tenant_objects.find_one({
        "tenant_id": current_user.tenant_id,
        "object_name": object_name
    })
    
    if not obj:
        raise HTTPException(status_code=404, detail="Object not found")
    
    # Prepare update data
    update_data = {
        "object_label": label_data.object_label,
        "object_plural": label_data.object_plural,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    # Add description if provided
    if label_data.description is not None:
        update_data["description"] = label_data.description
    
    # Store original labels as defaults if not already stored (first-time rename)
    if "default_label_singular" not in obj:
        update_data["default_label_singular"] = obj.get("object_label", object_name.capitalize())
    if "default_label_plural" not in obj:
        update_data["default_label_plural"] = obj.get("object_plural", f"{object_name.capitalize()}s")
    
    # Update the object
    await db.tenant_objects.update_one(
        {"tenant_id": current_user.tenant_id, "object_name": object_name},
        {"$set": update_data}
    )
    
    logger.info(f"Updated labels for object '{object_name}': {label_data.object_label} / {label_data.object_plural}")
    
    return {
        "message": "Object labels updated successfully",
        "object_name": object_name,
        "object_label": label_data.object_label,
        "object_plural": label_data.object_plural,
        "default_label_singular": update_data.get("default_label_singular") or obj.get("default_label_singular"),
        "default_label_plural": update_data.get("default_label_plural") or obj.get("default_label_plural")
    }


@router.post("/{object_name}/labels/reset")
async def reset_object_labels(
    object_name: str,
    current_user: User = Depends(get_current_user)
):
    """
    Reset object labels to their original default values.
    Only works if default_label_singular/default_label_plural have been stored
    (i.e., the object was previously renamed).
    """
    # Find the object
    obj = await db.tenant_objects.find_one({
        "tenant_id": current_user.tenant_id,
        "object_name": object_name
    })
    
    if not obj:
        raise HTTPException(status_code=404, detail="Object not found")
    
    # Check if defaults exist
    default_singular = obj.get("default_label_singular")
    default_plural = obj.get("default_label_plural")
    
    if not default_singular and not default_plural:
        raise HTTPException(
            status_code=400, 
            detail="No default labels stored. Object has not been renamed."
        )
    
    # Use defaults if available, otherwise derive from object_name
    restore_singular = default_singular or object_name.capitalize()
    restore_plural = default_plural or f"{object_name.capitalize()}s"
    
    # Update the object with default labels
    await db.tenant_objects.update_one(
        {"tenant_id": current_user.tenant_id, "object_name": object_name},
        {
            "$set": {
                "object_label": restore_singular,
                "object_plural": restore_plural,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
        }
    )
    
    logger.info(f"Reset labels for object '{object_name}' to defaults: {restore_singular} / {restore_plural}")
    
    return {
        "message": "Object labels reset to default successfully",
        "object_name": object_name,
        "object_label": restore_singular,
        "object_plural": restore_plural
    }


@router.post("")
async def create_custom_object(
    object_data: CustomObjectCreate,
    current_user: User = Depends(get_current_user)
):
    """Create a new custom object for the tenant"""
    
    # Validate object name format
    if not object_data.object_name.replace('_', '').isalnum():
        raise HTTPException(
            status_code=400, 
            detail="Object name must contain only letters, numbers, and underscores"
        )
    
    # Check if object already exists
    existing = await db.tenant_objects.find_one({
        "tenant_id": current_user.tenant_id,
        "object_name": object_data.object_name
    })
    
    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"Object '{object_data.object_name}' already exists"
        )
    
    # Define default fields if not provided
    default_fields = object_data.default_fields or {
        "name": {
            "type": "text",
            "required": True,
            "label": "Name"
        },
        "description": {
            "type": "textarea",
            "required": False,
            "label": "Description"
        }
    }
    
    # Create the new object
    new_object = {
        "tenant_id": current_user.tenant_id,
        "object_name": object_data.object_name,
        "object_label": object_data.object_label,
        "object_plural": object_data.object_plural,
        "icon": object_data.icon,
        "name_field": object_data.name_field,
        "fields": default_fields,
        "is_custom": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.tenant_objects.insert_one(new_object)
    
    # Auto-generate default Lightning page layouts for the new custom object
    try:
        await _create_default_layouts_for_object(
            tenant_id=current_user.tenant_id,
            object_name=object_data.object_name,
            object_label=object_data.object_label,
            user_id=current_user.id
        )
        logger.info(f"Created default layouts for custom object: {object_data.object_name}")
    except Exception as e:
        logger.warning(f"Failed to create default layouts for {object_data.object_name}: {e}")
        # Don't fail the object creation if layout creation fails
    
    return {
        "message": "Custom object created successfully",
        "object": {
            "object_name": object_data.object_name,
            "object_label": object_data.object_label,
            "object_plural": object_data.object_plural
        }
    }


@router.delete("/{object_name}")
async def delete_custom_object(
    object_name: str,
    current_user: User = Depends(get_current_user)
):
    """Delete a custom object"""
    
    # Fetch the object
    obj = await db.tenant_objects.find_one({
        "tenant_id": current_user.tenant_id,
        "object_name": object_name
    })
    
    if not obj:
        raise HTTPException(status_code=404, detail="Object not found")
    
    # Prevent deletion of system objects
    if not obj.get("is_custom", False):
        raise HTTPException(
            status_code=403,
            detail="Cannot delete system objects. Only custom objects can be deleted."
        )
    
    # Delete all records for this object
    await db.object_records.delete_many({
        "tenant_id": current_user.tenant_id,
        "object_name": object_name
    })
    
    # Delete metadata for this object
    await db.metadata_fields.delete_many({
        "tenant_id": current_user.tenant_id,
        "object_name": object_name
    })
    
    # Delete the object itself
    await db.tenant_objects.delete_one({
        "tenant_id": current_user.tenant_id,
        "object_name": object_name
    })
    
    return {"message": f"Custom object '{object_name}' deleted successfully"}



class StandardFieldLabelUpdate(BaseModel):
    """Model for updating standard field display label"""
    label: str


@router.put("/{object_name}/fields/{field_api_name}")
async def update_standard_field_label(
    object_name: str,
    field_api_name: str,
    update_data: StandardFieldLabelUpdate,
    current_user: User = Depends(get_current_user)
):
    """
    Update the display label of a standard (system) field.
    
    For standard fields, ONLY the label can be changed.
    The API name, type, and required settings are immutable.
    
    This allows admins to customize field display names without
    affecting the underlying data structure.
    """
    # Find the object
    obj = await db.tenant_objects.find_one({
        "tenant_id": current_user.tenant_id,
        "object_name": object_name
    })
    
    if not obj:
        raise HTTPException(status_code=404, detail="Object not found")
    
    # Get fields
    fields = obj.get("fields", {})
    
    # Check if field exists
    if field_api_name not in fields:
        raise HTTPException(status_code=404, detail=f"Field '{field_api_name}' not found")
    
    # Get the field definition
    field_def = fields[field_api_name]
    
    # Check if this is a standard (non-custom) field
    is_custom = field_def.get("is_custom", False)
    if is_custom:
        raise HTTPException(
            status_code=400, 
            detail="This endpoint is for standard fields only. Use /api/metadata endpoint for custom fields."
        )
    
    # Validate that label is not empty
    if not update_data.label or not update_data.label.strip():
        raise HTTPException(status_code=400, detail="Field label cannot be empty")
    
    # Store original label for reset functionality (BEFORE updating, if not already stored)
    if "original_label" not in field_def:
        # Get current label before we change it
        original = field_def.get("label", field_api_name.replace("_", " ").title())
        field_def["original_label"] = original
    
    # Update ONLY the label - preserve all other field properties
    field_def["label"] = update_data.label.strip()
    
    # Update the field in the object
    fields[field_api_name] = field_def
    
    # Save to database
    await db.tenant_objects.update_one(
        {"tenant_id": current_user.tenant_id, "object_name": object_name},
        {
            "$set": {
                f"fields.{field_api_name}": field_def,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
        }
    )
    
    logger.info(f"Updated label for standard field '{field_api_name}' on object '{object_name}' to '{update_data.label}'")
    
    return {
        "message": "Field label updated successfully",
        "object_name": object_name,
        "field_api_name": field_api_name,
        "new_label": update_data.label.strip(),
        "is_standard_field": True
    }


@router.post("/{object_name}/fields/{field_api_name}/reset-label")
async def reset_standard_field_label(
    object_name: str,
    field_api_name: str,
    current_user: User = Depends(get_current_user)
):
    """
    Reset a standard field's label back to its original value.
    """
    # Find the object
    obj = await db.tenant_objects.find_one({
        "tenant_id": current_user.tenant_id,
        "object_name": object_name
    })
    
    if not obj:
        raise HTTPException(status_code=404, detail="Object not found")
    
    fields = obj.get("fields", {})
    
    if field_api_name not in fields:
        raise HTTPException(status_code=404, detail=f"Field '{field_api_name}' not found")
    
    field_def = fields[field_api_name]
    
    # Get original label
    original_label = field_def.get("original_label")
    if not original_label:
        # If no original stored, derive from api_name
        original_label = field_api_name.replace("_", " ").title()
    
    # Reset label
    field_def["label"] = original_label
    
    # Update database
    await db.tenant_objects.update_one(
        {"tenant_id": current_user.tenant_id, "object_name": object_name},
        {
            "$set": {
                f"fields.{field_api_name}": field_def,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
        }
    )
    
    return {
        "message": "Field label reset to default",
        "field_api_name": field_api_name,
        "label": original_label
    }


@router.delete("/{object_name}/fields/{field_api_name}")
async def delete_custom_field(
    object_name: str,
    field_api_name: str,
    current_user: User = Depends(get_current_user)
):
    """
    Delete a custom field from an object.
    
    Only custom fields (is_custom=True) can be deleted.
    System/standard fields cannot be deleted.
    
    This will:
    1. Remove the field definition from the object schema
    2. NOT remove existing data from records (for safety)
    
    Custom fields can be stored in either:
    - tenant_objects.fields (legacy)
    - metadata_fields.fields (new custom fields)
    """
    logger.info(f"DELETE field request: object={object_name}, field={field_api_name}, tenant={current_user.tenant_id}")
    
    # First check if the field exists in metadata_fields (custom fields collection)
    custom_metadata = await db.metadata_fields.find_one({
        "object_name": object_name,
        "tenant_id": current_user.tenant_id
    })
    
    if custom_metadata:
        custom_fields = custom_metadata.get("fields", [])
        # Find the field in custom_fields by api_name
        field_index = None
        field_def = None
        for idx, cf in enumerate(custom_fields):
            if cf.get("api_name") == field_api_name:
                field_index = idx
                field_def = cf
                break
        
        if field_index is not None:
            logger.info(f"Found field '{field_api_name}' in metadata_fields collection")
            
            # Remove the field from the array
            result = await db.metadata_fields.update_one(
                {
                    "object_name": object_name,
                    "tenant_id": current_user.tenant_id
                },
                {
                    "$pull": {"fields": {"api_name": field_api_name}},
                    "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}
                }
            )
            
            if result.modified_count > 0:
                logger.info(f"Deleted custom field '{field_api_name}' from metadata_fields for object '{object_name}'")
                return {
                    "message": f"Custom field '{field_api_name}' deleted successfully",
                    "object_name": object_name,
                    "field_api_name": field_api_name
                }
    
    # If not in metadata_fields, check tenant_objects (legacy custom fields)
    obj = await db.tenant_objects.find_one({
        "tenant_id": current_user.tenant_id,
        "object_name": object_name
    })
    
    if not obj:
        logger.warning(f"Object '{object_name}' not found for tenant {current_user.tenant_id}")
        raise HTTPException(status_code=404, detail="Object not found")
    
    # Get fields from tenant_objects
    fields = obj.get("fields", {})
    
    # Check if field exists in tenant_objects
    if field_api_name in fields:
        field_def = fields[field_api_name]
        
        # Check if this is a custom field
        is_custom = field_def.get("is_custom", False)
        if not is_custom:
            raise HTTPException(
                status_code=400, 
                detail="Cannot delete system/standard fields. Only custom fields can be deleted."
            )
        
        # Remove the field from the schema
        del fields[field_api_name]
        
        # Update the object in database
        await db.tenant_objects.update_one(
            {"tenant_id": current_user.tenant_id, "object_name": object_name},
            {
                "$set": {
                    "fields": fields,
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }
            }
        )
        
        logger.info(f"Deleted custom field '{field_api_name}' from tenant_objects for object '{object_name}'")
        return {
            "message": f"Custom field '{field_api_name}' deleted successfully",
            "object_name": object_name,
            "field_api_name": field_api_name
        }
    
    # Field not found in either collection
    logger.warning(f"Field '{field_api_name}' not found in object '{object_name}'")
    raise HTTPException(status_code=404, detail=f"Field '{field_api_name}' not found")
    
    return {
        "message": f"Custom field '{field_api_name}' deleted successfully",
        "object_name": object_name,
        "field_api_name": field_api_name
    }


@router.post("/migrate-lookup-fields")
async def migrate_lookup_fields(current_user: User = Depends(get_current_user)):
    """
    Migration endpoint: Fix lookup field definitions for Contact and Opportunity.
    Ensures account_id and contact_id have proper lookup_object configuration.
    
    This is a one-time migration for existing tenants created before the fix.
    """
    updated_objects = []
    
    # Define the proper lookup field configurations
    lookup_field_fixes = {
        "contact": {
            "account_id": {
                "type": "lookup",
                "required": False,
                "label": "Account",
                "lookup_object": "account",
                "lookup_display_field": "account_name",
                "always_visible": True
            }
        },
        "opportunity": {
            "account_id": {
                "type": "lookup",
                "required": False,
                "label": "Account",
                "lookup_object": "account",
                "lookup_display_field": "account_name",
                "always_visible": True
            },
            "contact_id": {
                "type": "lookup",
                "required": False,
                "label": "Contact",
                "lookup_object": "contact",
                "lookup_display_field": "first_name"
            }
        }
    }
    
    for object_name, field_fixes in lookup_field_fixes.items():
        # Check if object exists for this tenant
        obj = await db.tenant_objects.find_one({
            "tenant_id": current_user.tenant_id,
            "object_name": object_name
        })
        
        if not obj:
            continue
        
        # Update fields
        fields = obj.get("fields", {})
        updated = False
        
        for field_name, field_config in field_fixes.items():
            if field_name in fields:
                # Update the field definition
                fields[field_name] = field_config
                updated = True
        
        if updated:
            # Save the updated object
            result = await db.tenant_objects.update_one(
                {
                    "tenant_id": current_user.tenant_id,
                    "object_name": object_name
                },
                {
                    "$set": {
                        "fields": fields,
                        "updated_at": datetime.now(timezone.utc).isoformat()
                    }
                }
            )
            
            if result.modified_count > 0:
                updated_objects.append(object_name)
    
    return {
        "message": "Lookup field migration completed",
        "updated_objects": updated_objects
    }



# ============================================================
# System Fields Endpoint
# ============================================================

# Define system fields that exist on all records
SYSTEM_FIELDS = {
    "id": {
        "api_name": "id",
        "label": "Record ID",
        "type": "text",
        "is_system": True,
        "read_only": True,
        "description": "Unique identifier for the record"
    },
    "created_at": {
        "api_name": "created_at",
        "label": "Created At",
        "type": "datetime",
        "is_system": True,
        "read_only": True,
        "description": "Date and time when the record was created"
    },
    "created_by": {
        "api_name": "created_by",
        "label": "Created By",
        "type": "lookup",
        "lookup_object": "user",
        "is_system": True,
        "read_only": True,
        "description": "User who created the record"
    },
    "updated_at": {
        "api_name": "updated_at",
        "label": "Last Modified",
        "type": "datetime",
        "is_system": True,
        "read_only": True,
        "description": "Date and time when the record was last modified"
    },
    "updated_by": {
        "api_name": "updated_by",
        "label": "Last Modified By",
        "type": "lookup",
        "lookup_object": "user",
        "is_system": True,
        "read_only": True,
        "description": "User who last modified the record"
    },
    "owner_id": {
        "api_name": "owner_id",
        "label": "Owner",
        "type": "lookup",
        "lookup_object": "user",
        "is_system": True,
        "read_only": False,  # Owner can be changed
        "description": "User who owns this record"
    }
}


@router.get("/{object_name}/system-fields")
async def get_system_fields(
    object_name: str,
    current_user: User = Depends(get_current_user)
):
    """
    Get system fields for an object.
    
    System fields are auto-generated fields that exist on all records:
    - id: Record unique identifier
    - created_at: When the record was created
    - created_by: User who created the record
    - updated_at: When the record was last modified
    - updated_by: User who last modified the record
    - owner_id: User who owns the record
    
    These fields are read-only (except owner_id) and cannot be customized.
    """
    # Verify object exists
    obj = await db.tenant_objects.find_one({
        "tenant_id": current_user.tenant_id,
        "object_name": object_name
    }, {"_id": 0, "object_name": 1})
    
    if not obj:
        # Check Schema Builder objects
        obj = await db.schema_objects.find_one({
            "tenant_id": current_user.tenant_id,
            "api_name": object_name.lower(),
            "is_active": True
        }, {"_id": 0, "api_name": 1})
    
    if not obj:
        raise HTTPException(status_code=404, detail="Object not found")
    
    # Return system fields
    return {
        "object_name": object_name,
        "system_fields": list(SYSTEM_FIELDS.values())
    }


@router.get("/{object_name}/all-fields")
async def get_all_fields_with_system(
    object_name: str,
    current_user: User = Depends(get_current_user)
):
    """
    Get ALL fields for an object including:
    - Standard fields (from object definition)
    - Custom fields (from metadata_fields)
    - Advanced fields (lookup, formula, rollup)
    - System fields (id, created_at, created_by, etc.)
    
    Each field includes:
    - api_name: Field API name
    - label: Display label
    - type: Data type
    - field_type: 'standard', 'custom', or 'system'
    - is_custom: Boolean for custom fields
    - is_system: Boolean for system fields
    - read_only: Boolean for read-only fields
    """
    tenant_id = current_user.tenant_id
    
    # Get object definition
    obj = await db.tenant_objects.find_one({
        "tenant_id": tenant_id,
        "object_name": object_name
    }, {"_id": 0})
    
    is_schema_builder_object = False
    
    if not obj:
        # Check Schema Builder objects
        schema_obj = await db.schema_objects.find_one({
            "tenant_id": tenant_id,
            "api_name": object_name.lower(),
            "is_active": True
        }, {"_id": 0})
        
        if schema_obj:
            is_schema_builder_object = True
            # Fetch fields for Schema Builder object
            fields = await db.schema_fields.find({
                "tenant_id": tenant_id,
                "object_id": schema_obj["id"],
                "is_active": True
            }, {"_id": 0}).to_list(None)
            
            obj = {
                "object_name": object_name,
                "fields": {
                    f["api_name"]: {
                        "type": f["field_type"],
                        "label": f["label"],
                        "is_custom": not f.get("is_system", False)
                    }
                    for f in fields
                }
            }
        else:
            raise HTTPException(status_code=404, detail="Object not found")
    
    all_fields = []
    
    # 1. Add standard fields from object definition
    for api_name, field_def in obj.get("fields", {}).items():
        is_custom = field_def.get("is_custom", False)
        field_info = {
            "api_name": api_name,
            "label": field_def.get("label", api_name),
            "type": field_def.get("type", "text"),
            "field_type": "custom" if is_custom else "standard",
            "is_custom": is_custom,
            "is_system": False,
            "read_only": field_def.get("read_only", False),
            "required": field_def.get("required", False)
        }
        
        # Add extra info for lookups
        if field_def.get("type") == "lookup":
            field_info["lookup_object"] = field_def.get("lookup_object")
        
        all_fields.append(field_info)
    
    # 2. Add custom fields from metadata_fields
    custom_metadata = await db.metadata_fields.find_one({
        "object_name": object_name,
        "tenant_id": tenant_id
    }, {"_id": 0})
    
    existing_api_names = {f["api_name"] for f in all_fields}
    
    if custom_metadata:
        for cf in custom_metadata.get("fields", []):
            if cf["api_name"] not in existing_api_names:
                all_fields.append({
                    "api_name": cf["api_name"],
                    "label": cf["label"],
                    "type": cf["type"].lower(),
                    "field_type": "custom",
                    "is_custom": True,
                    "is_system": False,
                    "read_only": False,
                    "required": cf.get("is_required", False)
                })
                existing_api_names.add(cf["api_name"])
    
    # 3. Add advanced fields
    advanced_fields = await db.advanced_fields.find({
        "tenant_id": tenant_id,
        "object_name": object_name,
        "is_active": {"$ne": False}
    }, {"_id": 0}).to_list(None)
    
    for af in advanced_fields:
        api_name = af.get("api_key")
        if api_name and api_name not in existing_api_names:
            field_type_raw = af.get("field_type", "").lower()
            all_fields.append({
                "api_name": api_name,
                "label": af.get("label", api_name),
                "type": field_type_raw,
                "field_type": "custom",
                "is_custom": True,
                "is_system": False,
                "read_only": field_type_raw in ["formula", "rollup"],
                "required": af.get("is_required", False),
                "is_computed": field_type_raw in ["formula", "rollup"]
            })
            existing_api_names.add(api_name)
    
    # 4. Add system fields
    for sys_field in SYSTEM_FIELDS.values():
        if sys_field["api_name"] not in existing_api_names:
            all_fields.append({
                **sys_field,
                "field_type": "system"
            })
    
    # Sort: standard first, then custom, then system
    field_type_order = {"standard": 0, "custom": 1, "system": 2}
    all_fields.sort(key=lambda f: (field_type_order.get(f["field_type"], 3), f["label"].lower()))
    
    return {
        "object_name": object_name,
        "fields": all_fields,
        "total_fields": len(all_fields),
        "counts": {
            "standard": sum(1 for f in all_fields if f["field_type"] == "standard"),
            "custom": sum(1 for f in all_fields if f["field_type"] == "custom"),
            "system": sum(1 for f in all_fields if f["field_type"] == "system")
        }
    }
