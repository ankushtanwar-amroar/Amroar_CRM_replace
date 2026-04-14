"""
Schema Builder - Metadata API
=============================
Public API for consuming schema metadata.
This is the integration point between Schema Builder and CRM.

The CRM should ONLY read from this API to render UI dynamically.
No direct database access to schema tables from CRM code.
"""

from fastapi import APIRouter, HTTPException, Depends, status, Query
from typing import List, Dict, Any, Optional
import logging
import math

from config.database import db
from modules.auth.api.auth_routes import get_current_user
from shared.models import User

from ..services import ObjectService, FieldService, RelationshipService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/metadata", tags=["Schema Builder - Metadata"])


def get_object_service():
    return ObjectService(db)

def get_field_service():
    return FieldService(db)

def get_relationship_service():
    return RelationshipService(db)


@router.get("/objects/paginated")
async def get_paginated_objects_metadata(
    page: int = Query(1, ge=1, description="Page number (1-indexed)"),
    limit: int = Query(25, ge=1, le=100, description="Items per page"),
    search: Optional[str] = Query(None, description="Search term for label/api_name"),
    object_type: Optional[str] = Query(None, description="Filter by type: 'standard', 'custom', or None for all"),
    current_user: User = Depends(get_current_user),
    service: ObjectService = Depends(get_object_service)
) -> Dict[str, Any]:
    """
    Get paginated list of all schema objects.
    Supports server-side pagination, search, and filtering.
    Optimized for 1000+ objects.
    
    Returns:
        - data: List of objects for current page
        - total: Total count of objects (matching filters)
        - page: Current page number
        - limit: Items per page
        - totalPages: Total number of pages
    """
    # Build MongoDB query
    query = {"tenant_id": current_user.tenant_id, "is_active": True}
    
    # Add search filter
    if search:
        search_regex = {"$regex": search, "$options": "i"}
        query["$or"] = [
            {"label": search_regex},
            {"api_name": search_regex},
            {"plural_label": search_regex},
            {"description": search_regex}
        ]
    
    # Add type filter
    if object_type == "standard":
        query["is_custom"] = False
    elif object_type == "custom":
        query["is_custom"] = True
    
    # Get total count for pagination
    collection = db["schema_objects"]
    total = await collection.count_documents(query)
    
    # Calculate pagination
    skip = (page - 1) * limit
    total_pages = math.ceil(total / limit) if total > 0 else 1
    
    # Fetch paginated data
    cursor = collection.find(query, {"_id": 0}).sort("label", 1).skip(skip).limit(limit)
    objects = await cursor.to_list(length=limit)
    
    # Format response
    data = [
        {
            "id": obj.get("id"),
            "object_name": obj.get("api_name"),
            "object_label": obj.get("label"),
            "object_plural": obj.get("plural_label"),
            "description": obj.get("description"),
            "icon": obj.get("icon"),
            "is_custom": obj.get("is_custom", False)
        }
        for obj in objects
    ]
    
    return {
        "data": data,
        "total": total,
        "page": page,
        "limit": limit,
        "totalPages": total_pages
    }


@router.get("/objects")
async def get_all_objects_metadata(
    current_user: User = Depends(get_current_user),
    service: ObjectService = Depends(get_object_service)
) -> List[Dict[str, Any]]:
    """
    Get metadata for all schema objects.
    Used by CRM to dynamically build navigation, forms, etc.
    """
    objects = await service.list_objects(tenant_id=current_user.tenant_id)
    
    return [
        {
            "id": obj.id,
            "api_name": obj.api_name,
            "label": obj.label,
            "plural_label": obj.plural_label,
            "description": obj.description,
            "icon": obj.icon,
            "is_custom": obj.is_custom
        }
        for obj in objects
    ]


@router.get("/objects/{api_name}")
async def get_object_metadata(
    api_name: str,
    current_user: User = Depends(get_current_user),
    object_service: ObjectService = Depends(get_object_service),
    field_service: FieldService = Depends(get_field_service),
    relationship_service: RelationshipService = Depends(get_relationship_service)
) -> Dict[str, Any]:
    """
    Get complete metadata for a single object.
    Used by CRM to render record pages, forms, list views.
    
    Returns:
        - Object definition
        - Field definitions (ordered by sort_order)
        - Relationship definitions
    """
    obj = await object_service.get_object_by_api_name(
        api_name=api_name,
        tenant_id=current_user.tenant_id
    )
    
    if not obj:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Object '{api_name}' not found in schema"
        )
    
    # Get fields
    fields = await field_service.list_fields(
        object_id=obj.id,
        tenant_id=current_user.tenant_id
    )
    
    # Get relationships
    relationships = await relationship_service.get_relationships_for_object(
        object_id=obj.id,
        tenant_id=current_user.tenant_id
    )
    
    # Transform fields into CRM-consumable format
    fields_metadata = {}
    for field in fields:
        fields_metadata[field.api_name] = {
            "id": field.id,
            "label": field.label,
            "type": field.field_type,
            "required": field.is_required,
            "default": field.default_value,
            "unique": field.is_unique,
            "help_text": field.help_text,
            "is_system": field.is_system,
            "sort_order": field.sort_order
        }
        
        # Add picklist options
        if field.picklist_values:
            fields_metadata[field.api_name]["options"] = field.picklist_values
        
        # Add lookup info
        if field.lookup_object:
            fields_metadata[field.api_name]["lookup_object"] = field.lookup_object
    
    return {
        "object": {
            "id": obj.id,
            "api_name": obj.api_name,
            "label": obj.label,
            "plural_label": obj.plural_label,
            "description": obj.description,
            "icon": obj.icon,
            "is_custom": obj.is_custom
        },
        "fields": fields_metadata,
        "relationships": [
            {
                "id": rel["id"],
                "label": rel["label"],
                "api_name": rel["api_name"],
                "source_object": rel.get("source_object", {}),
                "target_object": rel.get("target_object", {}),
                "is_required": rel.get("is_required", False)
            }
            for rel in relationships
        ]
    }


@router.get("/objects/{api_name}/fields")
async def get_object_fields_metadata(
    api_name: str,
    current_user: User = Depends(get_current_user),
    object_service: ObjectService = Depends(get_object_service),
    field_service: FieldService = Depends(get_field_service)
) -> List[Dict[str, Any]]:
    """
    Get field metadata for an object (array format).
    Useful for building forms, list views, etc.
    """
    obj = await object_service.get_object_by_api_name(
        api_name=api_name,
        tenant_id=current_user.tenant_id
    )
    
    if not obj:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Object '{api_name}' not found in schema"
        )
    
    fields = await field_service.list_fields(
        object_id=obj.id,
        tenant_id=current_user.tenant_id
    )
    
    return [
        {
            "id": field.id,
            "api_name": field.api_name,
            "label": field.label,
            "type": field.field_type,
            "required": field.is_required,
            "default": field.default_value,
            "unique": field.is_unique,
            "help_text": field.help_text,
            "is_system": field.is_system,
            "sort_order": field.sort_order,
            "options": field.picklist_values,
            "lookup_object": field.lookup_object
        }
        for field in fields
    ]


@router.get("/field-types")
async def get_field_types() -> List[Dict[str, str]]:
    """
    Get available field types.
    Used by Schema Builder UI to populate field type dropdown.
    """
    return [
        {"value": "text", "label": "Text"},
        {"value": "number", "label": "Number"},
        {"value": "email", "label": "Email"},
        {"value": "phone", "label": "Phone"},
        {"value": "date", "label": "Date"},
        {"value": "datetime", "label": "Date/Time"},
        {"value": "checkbox", "label": "Checkbox"},
        {"value": "picklist", "label": "Picklist"},
        {"value": "long_text", "label": "Long Text Area"},
        {"value": "lookup", "label": "Lookup Relationship"}
    ]
