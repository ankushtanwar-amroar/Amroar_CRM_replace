"""
Custom Metadata Routes - Custom Field Management
Extracted from server.py as part of Step 5 refactoring.
"""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, Field
from typing import List, Optional, Any
from datetime import datetime, timezone
import uuid

from config.database import db
from modules.auth.api.auth_routes import get_current_user
from shared.constants import PAGE_LAYOUTS

router = APIRouter()
security = HTTPBearer()


# Custom Field Models
class CustomField(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    label: str
    api_name: str
    type: str  # Text, Textarea, Number, Currency, Percent, Date, DateTime, Boolean, Checkbox, Picklist, URL, Email, Phone, Geolocation, Formula
    options: Optional[List[str]] = None  # For Picklist type
    default_value: Optional[Any] = None
    is_required: bool = False
    is_custom: bool = True
    is_searchable: bool = False  # Include in Global Search
    # New fields for Salesforce-style field types
    currency_symbol: Optional[str] = "$"
    decimal_places: Optional[int] = 2
    length: Optional[int] = 18
    formula_expression: Optional[str] = None
    formula_return_type: Optional[str] = "Text"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class CustomFieldCreate(BaseModel):
    label: str
    api_name: str
    type: str
    options: Optional[List[str]] = None
    default_value: Optional[Any] = None
    is_required: bool = False
    is_searchable: bool = False  # Include in Global Search
    # New fields for Salesforce-style field types
    currency_symbol: Optional[str] = "$"
    decimal_places: Optional[int] = 2
    length: Optional[int] = 18
    formula_expression: Optional[str] = None
    formula_return_type: Optional[str] = "Text"


class CustomFieldUpdate(BaseModel):
    label: Optional[str] = None
    api_name: Optional[str] = None
    type: Optional[str] = None
    options: Optional[List[str]] = None
    default_value: Optional[Any] = None
    is_required: Optional[bool] = None
    is_searchable: Optional[bool] = None  # Include in Global Search
    # New fields for Salesforce-style field types
    currency_symbol: Optional[str] = None
    decimal_places: Optional[int] = None
    length: Optional[int] = None
    formula_expression: Optional[str] = None
    formula_return_type: Optional[str] = None


@router.get("/metadata/{object_name}")
async def get_custom_fields(
    object_name: str,
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    """Get all custom fields for an object"""
    current_user = await get_current_user(credentials)

    
    # Fetch custom field metadata for this object and tenant
    metadata = await db.metadata_fields.find_one({
        "object_name": object_name,
        "tenant_id": current_user.tenant_id
    }, {"_id": 0})
    
    if not metadata:
        # Return empty fields array if no custom fields exist yet
        return {
            "object_name": object_name,
            "tenant_id": current_user.tenant_id,
            "fields": []
        }
    
    return metadata


@router.post("/metadata/{object_name}/fields")
async def add_custom_field(
    object_name: str,
    field_data: CustomFieldCreate,
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    """Add a new custom field to an object"""
    current_user = await get_current_user(credentials)

    
    # Validate field type - now supports Salesforce-style field types
    valid_types = [
        "Text", "Textarea", "Number", "Currency", "Percent", 
        "Date", "DateTime", "Boolean", "Checkbox", "Picklist",
        "URL", "Email", "Phone", "Geolocation", "Formula"
    ]
    if field_data.type not in valid_types:
        raise HTTPException(status_code=400, detail=f"Invalid field type. Must be one of: {', '.join(valid_types)}")
    
    # Validate picklist has options
    if field_data.type == "Picklist" and (not field_data.options or len(field_data.options) == 0):
        raise HTTPException(status_code=400, detail="Picklist type requires at least one option")
    
    # Validate formula has expression
    if field_data.type == "Formula" and not field_data.formula_expression:
        raise HTTPException(status_code=400, detail="Formula type requires an expression")
    
    # Create the custom field with all new properties
    new_field = CustomField(
        label=field_data.label,
        api_name=field_data.api_name,
        type=field_data.type,
        options=field_data.options,
        default_value=field_data.default_value,
        is_required=field_data.is_required,
        is_searchable=field_data.is_searchable,
        currency_symbol=field_data.currency_symbol,
        decimal_places=field_data.decimal_places,
        length=field_data.length,
        formula_expression=field_data.formula_expression,
        formula_return_type=field_data.formula_return_type
    )
    
    # Check if metadata document exists for this object
    metadata = await db.metadata_fields.find_one({
        "object_name": object_name,
        "tenant_id": current_user.tenant_id
    })
    
    if metadata:
        # Check if field with same api_name already exists
        existing_field = next((f for f in metadata.get("fields", []) if f["api_name"] == field_data.api_name), None)
        if existing_field:
            raise HTTPException(status_code=400, detail=f"Field with api_name '{field_data.api_name}' already exists")
        
        # Append new field
        await db.metadata_fields.update_one(
            {
                "object_name": object_name,
                "tenant_id": current_user.tenant_id
            },
            {
                "$push": {"fields": new_field.model_dump()},
                "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}
            }
        )
    else:
        # Create new metadata document
        metadata_doc = {
            "object_name": object_name,
            "tenant_id": current_user.tenant_id,
            "fields": [new_field.model_dump()],
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        await db.metadata_fields.insert_one(metadata_doc)
    
    # Sync with global_search_config if is_searchable is set
    if field_data.is_searchable:
        object_name_lower = object_name.lower()
        await db.global_search_config.update_one(
            {"tenant_id": current_user.tenant_id},
            {
                "$set": {
                    f"field_config.{object_name_lower}.{field_data.api_name}.is_searchable": True,
                    "tenant_id": current_user.tenant_id
                }
            },
            upsert=True
        )
    
    return {"message": "Custom field added successfully", "field": new_field}


@router.put("/metadata/{object_name}/fields/{field_id}")
async def update_custom_field(
    object_name: str,
    field_id: str,
    field_update: CustomFieldUpdate,
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    """Update an existing custom field"""
    current_user = await get_current_user(credentials)

    
    # Fetch metadata
    metadata = await db.metadata_fields.find_one({
        "object_name": object_name,
        "tenant_id": current_user.tenant_id
    })
    
    if not metadata:
        raise HTTPException(status_code=404, detail="No custom fields found for this object")
    
    # Find the field to update
    field_index = next((i for i, f in enumerate(metadata["fields"]) if f["id"] == field_id), None)
    if field_index is None:
        raise HTTPException(status_code=404, detail="Field not found")
    
    # Update only provided fields
    update_data = field_update.model_dump(exclude_unset=True)
    
    # Validate if type is being changed to Picklist
    if "type" in update_data and update_data["type"] == "Picklist":
        if "options" not in update_data or not update_data["options"]:
            raise HTTPException(status_code=400, detail="Picklist type requires options")
    
    # Build update query for the specific field in the array
    set_updates = {}
    for key, value in update_data.items():
        set_updates[f"fields.{field_index}.{key}"] = value
    
    set_updates[f"fields.{field_index}.updated_at"] = datetime.now(timezone.utc).isoformat()
    set_updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.metadata_fields.update_one(
        {
            "object_name": object_name,
            "tenant_id": current_user.tenant_id
        },
        {"$set": set_updates}
    )
    
    # Sync with global_search_config if is_searchable is being updated
    if "is_searchable" in update_data:
        object_name_lower = object_name.lower()
        field_api_name = metadata["fields"][field_index]["api_name"]
        await db.global_search_config.update_one(
            {"tenant_id": current_user.tenant_id},
            {
                "$set": {
                    f"field_config.{object_name_lower}.{field_api_name}.is_searchable": update_data["is_searchable"],
                    "tenant_id": current_user.tenant_id
                }
            },
            upsert=True
        )
    
    return {"message": "Custom field updated successfully"}


@router.delete("/metadata/{object_name}/fields/{field_id}")
async def delete_custom_field(
    object_name: str,
    field_id: str,
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    """Delete a custom field"""
    current_user = await get_current_user(credentials)

    
    # Remove the field from the fields array
    result = await db.metadata_fields.update_one(
        {
            "object_name": object_name,
            "tenant_id": current_user.tenant_id
        },
        {
            "$pull": {"fields": {"id": field_id}},
            "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}
        }
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Field not found or already deleted")
    
    return {"message": "Custom field deleted successfully"}


@router.post("/metadata/{object_name}/hide-field")
async def hide_system_field(
    object_name: str,
    field_data: dict,
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    """Hide a system field by adding it to hidden_fields list"""
    current_user = await get_current_user(credentials)

    field_name = field_data.get("field_name")
    
    if not field_name:
        raise HTTPException(status_code=400, detail="field_name is required")
    
    # Check if metadata document exists
    metadata = await db.metadata_fields.find_one({
        "object_name": object_name,
        "tenant_id": current_user.tenant_id
    })
    
    if metadata:
        # Add to hidden_fields array
        await db.metadata_fields.update_one(
            {
                "object_name": object_name,
                "tenant_id": current_user.tenant_id
            },
            {
                "$addToSet": {"hidden_fields": field_name},
                "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}
            }
        )
    else:
        # Create new metadata document with hidden field
        metadata_doc = {
            "object_name": object_name,
            "tenant_id": current_user.tenant_id,
            "fields": [],
            "hidden_fields": [field_name],
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        await db.metadata_fields.insert_one(metadata_doc)
    
    return {"message": "System field hidden successfully"}


@router.get("/objects/{object_name}/layout")
async def get_object_page_layout(
    object_name: str,
    current_user = Depends(get_current_user)
):
    """Get page layout configuration for an object"""

    if object_name in PAGE_LAYOUTS:
        layout = PAGE_LAYOUTS[object_name]
        
        # Get object field definitions for validation
        obj = await db.tenant_objects.find_one({
            "tenant_id": current_user.tenant_id,
            "object_name": object_name
        })
        
        if not obj:
            raise HTTPException(status_code=404, detail="Object not found")
        
        return {
            "object_name": object_name,
            "sections": layout["sections"],
            "fields": obj["fields"]
        }
    else:
        raise HTTPException(status_code=404, detail="Page layout not found")
