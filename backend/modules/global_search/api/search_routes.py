"""
Global Search API Routes
Exposes search endpoints for the CRM platform.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Dict, Any, Optional, List
from pydantic import BaseModel
from motor.motor_asyncio import AsyncIOMotorDatabase
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))))

from shared.auth import get_current_user_dict
from shared.database import db

from ..services.search_engine import GlobalSearchEngine
from ..services.search_config import SearchConfigService

router = APIRouter(prefix="/api/search", tags=["Global Search"])


async def get_db() -> AsyncIOMotorDatabase:
    return db


# ============================================
# Request/Response Models
# ============================================

class SearchRequest(BaseModel):
    query: str
    limit_per_object: Optional[int] = None
    objects: Optional[List[str]] = None  # Filter to specific objects


class SearchConfigUpdate(BaseModel):
    searchable_objects: Optional[List[str]] = None
    object_priority: Optional[Dict[str, int]] = None
    field_config: Optional[Dict[str, Dict[str, Any]]] = None
    results_per_object: Optional[int] = None
    preview_fields: Optional[Dict[str, Dict[str, str]]] = None  # {object_name: {primary: field, secondary: field}}


class ObjectSearchableUpdate(BaseModel):
    object_name: str
    is_searchable: bool


class FieldSearchableUpdate(BaseModel):
    object_name: str
    field_name: str
    is_searchable: bool
    is_preview_primary: Optional[bool] = False
    is_preview_secondary: Optional[bool] = False


# ============================================
# Search Endpoints
# ============================================

@router.get("")
async def global_search(
    q: str = Query(..., min_length=2, description="Search query"),
    limit: int = Query(5, ge=1, le=20, description="Results per object"),
    objects: Optional[str] = Query(None, description="Comma-separated object names to filter"),
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: Dict = Depends(get_current_user_dict)
):
    """
    Execute global search across all accessible objects.
    
    - Searches across Lead, Account, Contact, Opportunity, and custom objects
    - Respects user permissions (Permission Set visibility)
    - Returns results grouped by object type
    - Supports partial matching, tokenized search
    
    Query Parameters:
    - q: Search query (min 2 characters)
    - limit: Max results per object (1-20, default 5)
    - objects: Comma-separated object names to filter (optional)
    """
    tenant_id = current_user.get("tenant_id")
    user_id = current_user.get("user_id")
    role_id = current_user.get("role_id")
    is_super_admin = current_user.get("is_super_admin", False)
    
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant ID required")
    
    # Parse object filter
    object_filter = None
    if objects:
        object_filter = [o.strip().lower() for o in objects.split(",") if o.strip()]
    
    # Execute search with permission awareness
    engine = GlobalSearchEngine(db)
    results = await engine.search(
        tenant_id=tenant_id,
        user_id=user_id,
        query=q,
        role_id=role_id,
        limit_per_object=limit,
        object_filter=object_filter,
        is_super_admin=is_super_admin
    )
    
    return results


@router.post("")
async def search_with_body(
    request: SearchRequest,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: Dict = Depends(get_current_user_dict)
):
    """
    Execute global search with request body.
    Alternative to GET for complex queries.
    """
    tenant_id = current_user.get("tenant_id")
    user_id = current_user.get("user_id")
    role_id = current_user.get("role_id")
    
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant ID required")
    
    if len(request.query) < 2:
        raise HTTPException(status_code=400, detail="Query must be at least 2 characters")
    
    engine = GlobalSearchEngine(db)
    results = await engine.search(
        tenant_id=tenant_id,
        user_id=user_id,
        query=request.query,
        role_id=role_id,
        limit_per_object=request.limit_per_object,
        object_filter=request.objects
    )
    
    return results


@router.get("/objects")
async def get_searchable_objects(
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: Dict = Depends(get_current_user_dict)
):
    """
    Get list of searchable objects for the current tenant.
    
    Returns objects the user can search along with their configuration.
    """
    tenant_id = current_user.get("tenant_id")
    
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant ID required")
    
    config_service = SearchConfigService(db)
    objects = await config_service.get_searchable_objects(tenant_id)
    
    # Get priorities
    result = []
    for obj in objects:
        obj_name = obj.get("object_name", "").lower()
        priority = await config_service.get_object_priority(tenant_id, obj_name)
        result.append({
            "object_name": obj_name,
            "object_label": obj.get("object_label", obj_name.title()),
            "object_plural": obj.get("object_plural"),
            "icon": obj.get("icon", "file"),
            "priority": priority,
            "is_custom": obj.get("is_custom", False)
        })
    
    # Sort by priority
    result.sort(key=lambda x: x["priority"])
    
    return {"objects": result}


@router.get("/fields/{object_name}")
async def get_searchable_fields(
    object_name: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: Dict = Depends(get_current_user_dict)
):
    """
    Get searchable fields for a specific object.
    
    Returns fields that can be searched along with their metadata.
    """
    tenant_id = current_user.get("tenant_id")
    
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant ID required")
    
    config_service = SearchConfigService(db)
    fields = await config_service.get_searchable_fields(tenant_id, object_name)
    
    return {
        "object_name": object_name,
        "fields": fields
    }


# ============================================
# Admin Configuration Endpoints
# ============================================

@router.get("/config")
async def get_search_config(
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: Dict = Depends(get_current_user_dict)
):
    """
    Get current search configuration for the tenant.
    Admin endpoint.
    """
    tenant_id = current_user.get("tenant_id")
    
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant ID required")
    
    config = await db.global_search_config.find_one(
        {"tenant_id": tenant_id},
        {"_id": 0}
    )
    
    if not config:
        # Return defaults
        config = {
            "tenant_id": tenant_id,
            "searchable_objects": None,  # All accessible
            "object_priority": {},
            "field_config": {},
            "results_per_object": 5
        }
    
    return config


@router.put("/config")
async def update_search_config(
    config: SearchConfigUpdate,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: Dict = Depends(get_current_user_dict)
):
    """
    Update search configuration for the tenant.
    Admin endpoint.
    
    Configure:
    - Which objects are searchable
    - Object priority in results
    - Field-level searchability
    - Results per object limit
    """
    tenant_id = current_user.get("tenant_id")
    
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant ID required")
    
    config_service = SearchConfigService(db)
    result = await config_service.update_search_config(
        tenant_id=tenant_id,
        searchable_objects=config.searchable_objects,
        object_priority=config.object_priority,
        field_config=config.field_config,
        results_per_object=config.results_per_object
    )
    
    return {
        "message": "Search configuration updated",
        **result
    }


@router.post("/config/field/{object_name}/{field_name}")
async def toggle_field_searchable(
    object_name: str,
    field_name: str,
    is_searchable: bool = Query(..., description="Whether field is searchable"),
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: Dict = Depends(get_current_user_dict)
):
    """
    Toggle searchability for a specific field.
    Admin endpoint.
    """
    tenant_id = current_user.get("tenant_id")
    
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant ID required")
    
    # Update field config
    await db.global_search_config.update_one(
        {"tenant_id": tenant_id},
        {
            "$set": {
                f"field_config.{object_name.lower()}.{field_name}": {
                    "is_searchable": is_searchable
                }
            }
        },
        upsert=True
    )
    
    return {
        "message": f"Field {field_name} on {object_name} searchability set to {is_searchable}"
    }


# ============================================
# Admin Metadata Endpoints (for Configure Search UI)
# ============================================

@router.get("/admin/objects")
async def get_all_objects_with_status(
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: Dict = Depends(get_current_user_dict)
):
    """
    Get ALL objects for the tenant with their searchable status.
    Used by the Configure Search Metadata admin UI.
    Returns all objects regardless of searchable status.
    """
    tenant_id = current_user.get("tenant_id")
    
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant ID required")
    
    # Get current config
    config = await db.global_search_config.find_one(
        {"tenant_id": tenant_id},
        {"_id": 0}
    )
    
    searchable_objects = config.get("searchable_objects") if config else None
    object_priority = config.get("object_priority", {}) if config else {}
    
    # Get all tenant objects
    tenant_objects = await db.tenant_objects.find(
        {"tenant_id": tenant_id},
        {"_id": 0}
    ).to_list(None)
    
    # Get Schema Builder objects
    schema_objects = await db.schema_objects.find(
        {"tenant_id": tenant_id, "is_active": True},
        {"_id": 0}
    ).to_list(None)
    
    # Merge schema objects
    for obj in schema_objects:
        existing = next((o for o in tenant_objects 
                       if o.get('object_name', '').lower() == obj.get('api_name', '').lower()), None)
        if not existing:
            tenant_objects.append({
                "object_name": obj.get("api_name"),
                "object_label": obj.get("label"),
                "object_plural": obj.get("plural_label", f"{obj.get('label')}s"),
                "icon": obj.get("icon", "database"),
                "is_custom": obj.get("is_custom", True),
                "is_from_schema_builder": True
            })
    
    # Build response with searchable status
    result = []
    for obj in tenant_objects:
        obj_name = obj.get("object_name", "").lower()
        
        # Determine searchable status
        # If searchable_objects is None, all objects are searchable by default
        is_searchable = True
        if searchable_objects is not None:
            is_searchable = obj_name in [s.lower() for s in searchable_objects]
        
        result.append({
            "object_name": obj_name,
            "object_label": obj.get("object_label", obj_name.title()),
            "object_plural": obj.get("object_plural", f"{obj.get('object_label', obj_name.title())}s"),
            "icon": obj.get("icon", "database"),
            "is_custom": obj.get("is_custom", False),
            "is_from_schema_builder": obj.get("is_from_schema_builder", False),
            "is_searchable": is_searchable,
            "priority": object_priority.get(obj_name, 100)
        })
    
    # Sort by priority
    result.sort(key=lambda x: x["priority"])
    
    return {
        "objects": result,
        "total_count": len(result),
        "searchable_count": sum(1 for o in result if o["is_searchable"])
    }


@router.get("/admin/objects/{object_name}/fields")
async def get_all_fields_with_status(
    object_name: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: Dict = Depends(get_current_user_dict)
):
    """
    Get ALL fields for an object with their searchable and preview status.
    Used by the Configure Search Metadata admin UI.
    Includes both standard fields and custom fields from metadata_fields.
    """
    tenant_id = current_user.get("tenant_id")
    
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant ID required")
    
    object_name_lower = object_name.lower()
    
    # Get current config
    config = await db.global_search_config.find_one(
        {"tenant_id": tenant_id},
        {"_id": 0}
    )
    
    field_config = config.get("field_config", {}).get(object_name_lower, {}) if config else {}
    preview_fields = config.get("preview_fields", {}).get(object_name_lower, {}) if config else {}
    
    # Get object definition from tenant_objects
    obj = await db.tenant_objects.find_one(
        {"tenant_id": tenant_id, "object_name": object_name_lower},
        {"_id": 0}
    )
    
    fields_data = {}
    
    if obj:
        fields_data = obj.get("fields", {})
    else:
        # Try Schema Builder
        schema_obj = await db.schema_objects.find_one(
            {"tenant_id": tenant_id, "api_name": object_name_lower},
            {"_id": 0}
        )
        if schema_obj:
            schema_fields = await db.schema_fields.find(
                {"tenant_id": tenant_id, "object_id": schema_obj["id"]},
                {"_id": 0}
            ).to_list(None)
            
            for f in schema_fields:
                fields_data[f["api_name"]] = {
                    "type": f.get("field_type", "text"),
                    "label": f.get("label", f["api_name"]),
                    "is_searchable": f.get("is_searchable", False)
                }
    
    # Get custom fields from metadata_fields collection (check both cases for object_name)
    custom_metadata = await db.metadata_fields.find_one(
        {"tenant_id": tenant_id, "object_name": {"$regex": f"^{object_name_lower}$", "$options": "i"}},
        {"_id": 0}
    )
    
    if custom_metadata and custom_metadata.get("fields"):
        for custom_field in custom_metadata["fields"]:
            api_name = custom_field.get("api_name")
            if api_name:
                fields_data[api_name] = {
                    "type": custom_field.get("type", "text"),
                    "label": custom_field.get("label", api_name),
                    "is_custom": True,
                    "is_searchable": custom_field.get("is_searchable", False)
                }
    
    if not fields_data:
        return {
            "object_name": object_name_lower,
            "fields": [],
            "total_count": 0
        }
    
    # Default searchable field types and names
    DEFAULT_SEARCHABLE_TYPES = {'text', 'email', 'phone', 'textarea', 'url'}
    DEFAULT_SEARCHABLE_FIELDS = {'name', 'email', 'phone', 'first_name', 'last_name', 
                                  'account_name', 'company', 'subject', 'title'}
    
    # Build response
    result = []
    for field_name, field_def in fields_data.items():
        # Skip system fields
        if field_name.startswith('_') or field_name in ('id', 'tenant_id', 'created_by', 'updated_by', 'created_at', 'updated_at'):
            continue
        
        field_type = field_def.get("type", "text").lower() if isinstance(field_def, dict) else "text"
        field_label = field_def.get("label", field_name) if isinstance(field_def, dict) else field_name
        is_custom = field_def.get("is_custom", False) if isinstance(field_def, dict) else False
        
        # Determine searchable status
        is_searchable = False
        
        # First check global_search_config field_config
        if field_name in field_config:
            is_searchable = field_config[field_name].get("is_searchable", False)
        # Then check if it's set in the field definition itself (for custom fields)
        elif isinstance(field_def, dict) and field_def.get("is_searchable"):
            is_searchable = True
        # Then check defaults
        elif field_name.lower() in DEFAULT_SEARCHABLE_FIELDS:
            is_searchable = True
        elif field_type in DEFAULT_SEARCHABLE_TYPES:
            is_searchable = True
        
        # Check preview status
        is_preview_primary = preview_fields.get("primary") == field_name
        is_preview_secondary = preview_fields.get("secondary") == field_name
        
        result.append({
            "field_name": field_name,
            "field_label": field_label,
            "field_type": field_type,
            "is_searchable": is_searchable,
            "is_preview_primary": is_preview_primary,
            "is_preview_secondary": is_preview_secondary,
            "is_default_searchable": field_name.lower() in DEFAULT_SEARCHABLE_FIELDS or field_type in DEFAULT_SEARCHABLE_TYPES,
            "is_custom": is_custom
        })
    
    # Sort: searchable fields first, then alphabetically
    result.sort(key=lambda x: (not x["is_searchable"], x["field_label"].lower()))
    
    return {
        "object_name": object_name_lower,
        "fields": result,
        "total_count": len(result),
        "searchable_count": sum(1 for f in result if f["is_searchable"]),
        "preview_primary": preview_fields.get("primary"),
        "preview_secondary": preview_fields.get("secondary")
    }


@router.put("/admin/objects/{object_name}/searchable")
async def update_object_searchable(
    object_name: str,
    is_searchable: bool = Query(..., description="Whether object is searchable"),
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: Dict = Depends(get_current_user_dict)
):
    """
    Enable or disable an object from global search.
    """
    tenant_id = current_user.get("tenant_id")
    
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant ID required")
    
    object_name_lower = object_name.lower()
    
    # Get current config
    config = await db.global_search_config.find_one(
        {"tenant_id": tenant_id},
        {"_id": 0}
    )
    
    current_searchable = config.get("searchable_objects") if config else None
    
    # If searchable_objects is None, get all objects and set the list
    if current_searchable is None:
        # Get all objects
        tenant_objects = await db.tenant_objects.find(
            {"tenant_id": tenant_id},
            {"object_name": 1, "_id": 0}
        ).to_list(None)
        
        schema_objects = await db.schema_objects.find(
            {"tenant_id": tenant_id, "is_active": True},
            {"api_name": 1, "_id": 0}
        ).to_list(None)
        
        current_searchable = [o["object_name"].lower() for o in tenant_objects]
        current_searchable.extend([o["api_name"].lower() for o in schema_objects])
        current_searchable = list(set(current_searchable))
    
    # Update the list
    if is_searchable:
        if object_name_lower not in current_searchable:
            current_searchable.append(object_name_lower)
    else:
        current_searchable = [o for o in current_searchable if o != object_name_lower]
    
    # Save
    await db.global_search_config.update_one(
        {"tenant_id": tenant_id},
        {"$set": {"searchable_objects": current_searchable, "tenant_id": tenant_id}},
        upsert=True
    )
    
    return {
        "message": f"Object {object_name} searchable status set to {is_searchable}",
        "object_name": object_name_lower,
        "is_searchable": is_searchable
    }


@router.put("/admin/objects/{object_name}/priority")
async def update_object_priority(
    object_name: str,
    priority: int = Query(..., ge=1, le=100, description="Display priority (1=highest)"),
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: Dict = Depends(get_current_user_dict)
):
    """
    Update the display priority for an object in search results.
    Lower numbers appear first.
    """
    tenant_id = current_user.get("tenant_id")
    
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant ID required")
    
    object_name_lower = object_name.lower()
    
    await db.global_search_config.update_one(
        {"tenant_id": tenant_id},
        {
            "$set": {
                f"object_priority.{object_name_lower}": priority,
                "tenant_id": tenant_id
            }
        },
        upsert=True
    )
    
    return {
        "message": f"Object {object_name} priority set to {priority}",
        "object_name": object_name_lower,
        "priority": priority
    }


@router.put("/admin/objects/{object_name}/fields/{field_name}")
async def update_field_config(
    object_name: str,
    field_name: str,
    is_searchable: bool = Query(None, description="Whether field is searchable"),
    is_preview_primary: bool = Query(None, description="Set as primary preview field"),
    is_preview_secondary: bool = Query(None, description="Set as secondary preview field"),
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: Dict = Depends(get_current_user_dict)
):
    """
    Update field configuration for search.
    Can set searchability and preview field status.
    Also syncs with metadata_fields for custom fields.
    """
    tenant_id = current_user.get("tenant_id")
    
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant ID required")
    
    object_name_lower = object_name.lower()
    updates = {}
    
    # Update searchability in global_search_config
    if is_searchable is not None:
        updates[f"field_config.{object_name_lower}.{field_name}.is_searchable"] = is_searchable
        
        # Also sync with metadata_fields for custom fields (case-insensitive object_name match)
        await db.metadata_fields.update_one(
            {
                "tenant_id": tenant_id,
                "object_name": {"$regex": f"^{object_name_lower}$", "$options": "i"},
                "fields.api_name": field_name
            },
            {
                "$set": {
                    "fields.$.is_searchable": is_searchable
                }
            }
        )
    
    # Update preview fields
    if is_preview_primary:
        updates[f"preview_fields.{object_name_lower}.primary"] = field_name
    
    if is_preview_secondary:
        updates[f"preview_fields.{object_name_lower}.secondary"] = field_name
    
    if updates:
        updates["tenant_id"] = tenant_id
        await db.global_search_config.update_one(
            {"tenant_id": tenant_id},
            {"$set": updates},
            upsert=True
        )
    
    return {
        "message": f"Field {field_name} configuration updated",
        "object_name": object_name_lower,
        "field_name": field_name,
        "is_searchable": is_searchable,
        "is_preview_primary": is_preview_primary,
        "is_preview_secondary": is_preview_secondary
    }


@router.put("/admin/objects/batch-priority")
async def update_batch_priority(
    priorities: Dict[str, int],
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: Dict = Depends(get_current_user_dict)
):
    """
    Update priorities for multiple objects at once.
    Used for drag-and-drop reordering.
    """
    tenant_id = current_user.get("tenant_id")
    
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant ID required")
    
    updates = {"tenant_id": tenant_id}
    for obj_name, priority in priorities.items():
        updates[f"object_priority.{obj_name.lower()}"] = priority
    
    await db.global_search_config.update_one(
        {"tenant_id": tenant_id},
        {"$set": updates},
        upsert=True
    )
    
    return {
        "message": f"Updated priorities for {len(priorities)} objects",
        "priorities": priorities
    }


@router.get("/admin/preview-settings")
async def get_preview_settings(
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: Dict = Depends(get_current_user_dict)
):
    """
    Get all preview field settings for all objects.
    """
    tenant_id = current_user.get("tenant_id")
    
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant ID required")
    
    config = await db.global_search_config.find_one(
        {"tenant_id": tenant_id},
        {"_id": 0}
    )
    
    preview_fields = config.get("preview_fields", {}) if config else {}
    results_per_object = config.get("results_per_object", 5) if config else 5
    
    return {
        "preview_fields": preview_fields,
        "results_per_object": results_per_object
    }


@router.put("/admin/preview-settings")
async def update_preview_settings(
    results_per_object: int = Query(None, ge=1, le=20, description="Max results per object"),
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: Dict = Depends(get_current_user_dict)
):
    """
    Update global preview settings.
    """
    tenant_id = current_user.get("tenant_id")
    
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant ID required")
    
    updates = {"tenant_id": tenant_id}
    
    if results_per_object is not None:
        updates["results_per_object"] = results_per_object
    
    await db.global_search_config.update_one(
        {"tenant_id": tenant_id},
        {"$set": updates},
        upsert=True
    )
    
    return {
        "message": "Preview settings updated",
        "results_per_object": results_per_object
    }
