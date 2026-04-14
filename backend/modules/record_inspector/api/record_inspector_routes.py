"""
Record Inspector API Routes
Provides endpoints for viewing all fields and values of a record (admin utility)
"""
from fastapi import APIRouter, Depends, HTTPException
from typing import Dict, Any, List, Optional
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))))

from server import db
from shared.models import User
from modules.auth.api.auth_routes import get_current_user

router = APIRouter(prefix="/record-inspector", tags=["Record Inspector"])


import logging

logger = logging.getLogger(__name__)


async def is_admin_user(user: User) -> bool:
    """Check if user is an admin (super_admin or has admin permission set)"""
    # Check is_super_admin (handle None explicitly)
    if user.is_super_admin is True:
        return True
    
    # Direct check for system_administrator role_id (common case - case insensitive)
    if user.role_id and str(user.role_id).lower() == 'system_administrator':
        return True
    
    # Check if user has admin-level permission sets
    if user.permission_set_ids:
        admin_ps = await db.permission_sets.find_one({
            "id": {"$in": user.permission_set_ids},
            "$or": [
                {"name": {"$regex": "admin", "$options": "i"}},
                {"is_admin": True}
            ]
        })
        if admin_ps:
            return True
    
    # Check role name for admin (if role_id is a UUID reference)
    if user.role_id:
        role = await db.roles.find_one({"id": user.role_id})
        if role:
            role_name = role.get("name", "").lower()
            # Check if role name contains "admin" or "administrator"
            if "admin" in role_name or role.get("is_admin"):
                return True
    
    return False


async def resolve_lookup_value(field_api_name: str, value: str, tenant_id: str) -> Optional[str]:
    """
    Resolve a lookup field ID to its display name.
    Returns the display name if found, None otherwise.
    """
    if not value:
        return None
    
    try:
        # User lookups (created_by, updated_by, owner_id)
        if field_api_name in ['created_by', 'updated_by', 'owner_id']:
            user = await db.users.find_one({"id": value}, {"_id": 0, "name": 1, "email": 1})
            if user:
                return user.get("name") or user.get("email", "").split("@")[0]
        
        # Tenant lookup
        elif field_api_name == 'tenant_id':
            tenant = await db.tenants.find_one({"id": value}, {"_id": 0, "name": 1, "company_name": 1})
            if tenant:
                return tenant.get("company_name") or tenant.get("name")
        
        # Record Type lookup
        elif field_api_name == 'record_type_id':
            record_type = await db.record_types.find_one({"id": value}, {"_id": 0, "name": 1, "label": 1})
            if record_type:
                return record_type.get("label") or record_type.get("name")
        
        # Generic lookup - try to find in object_records
        elif field_api_name.endswith('_id') or field_api_name.endswith('Id'):
            # Try to find in object_records by ID
            related_record = await db.object_records.find_one(
                {"$or": [{"id": value}, {"series_id": value}], "tenant_id": tenant_id},
                {"_id": 0, "data": 1}
            )
            if related_record:
                data = related_record.get("data", {})
                # Try common name fields
                for name_field in ['name', 'Name', 'full_name', 'title', 'subject', 'label']:
                    if data.get(name_field):
                        return data.get(name_field)
        
        # Try users collection for any user-like lookup
        user = await db.users.find_one({"id": value}, {"_id": 0, "name": 1, "email": 1})
        if user:
            return user.get("name") or user.get("email", "").split("@")[0]
            
    except Exception:
        pass
    
    return None


@router.get("/{object_name}/{record_id}")
async def get_record_inspection(
    object_name: str,
    record_id: str,
    current_user: User = Depends(get_current_user)
) -> Dict[str, Any]:
    """
    Get all field data for a record inspection view.
    
    This endpoint returns:
    - Object metadata
    - All fields (standard, custom, system)
    - Field values from the record
    
    Only accessible by admin users.
    """
    # Permission check - admin only
    if not await is_admin_user(current_user):
        raise HTTPException(
            status_code=403,
            detail="Record Inspector is only available to administrators"
        )
    
    tenant_id = current_user.tenant_id
    
    # Fetch the record
    record = await db.object_records.find_one({
        "tenant_id": tenant_id,
        "object_name": object_name.lower(),
        "$or": [
            {"id": record_id},
            {"series_id": record_id}
        ],
        "is_deleted": {"$ne": True}
    }, {"_id": 0})
    
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")
    
    # Fetch object definition
    obj_def = await db.tenant_objects.find_one({
        "tenant_id": tenant_id,
        "object_name": object_name.lower()
    }, {"_id": 0})
    
    # Fetch custom fields from metadata
    custom_metadata = await db.metadata_fields.find_one({
        "tenant_id": tenant_id,
        "object_name": object_name.lower()
    }, {"_id": 0})
    
    # Build comprehensive field list
    fields_data = []
    seen_fields = set()
    
    # 1. Standard fields from object definition
    if obj_def and obj_def.get("fields"):
        for field_name, field_def in obj_def["fields"].items():
            if field_name in seen_fields:
                continue
            seen_fields.add(field_name)
            
            # Get value from record data
            record_data = record.get("data", {})
            value = record_data.get(field_name)
            
            # Resolve lookup display names
            field_type = field_def.get("type", "text")
            display_name = None
            if field_type in ["lookup", "reference"] and value:
                display_name = await resolve_lookup_value(field_name, str(value), tenant_id)
            
            fields_data.append({
                "label": field_def.get("label", field_name),
                "api_name": field_name,
                "type": field_type,
                "value": value,
                "display_name": display_name,
                "category": "standard",
                "required": field_def.get("required", False)
            })
    
    # 2. Custom fields from metadata
    if custom_metadata and custom_metadata.get("fields"):
        for field in custom_metadata["fields"]:
            if field["api_name"] in seen_fields:
                continue
            seen_fields.add(field["api_name"])
            
            record_data = record.get("data", {})
            value = record_data.get(field["api_name"])
            
            # Resolve lookup display names
            field_type = field.get("type", "text")
            display_name = None
            if field_type in ["lookup", "reference"] and value:
                display_name = await resolve_lookup_value(field["api_name"], str(value), tenant_id)
            
            fields_data.append({
                "label": field.get("label", field["api_name"]),
                "api_name": field["api_name"],
                "type": field_type,
                "value": value,
                "display_name": display_name,
                "category": "custom",
                "required": field.get("is_required", False)
            })
    
    # 3. System fields (always present on records)
    system_fields = [
        {"api_name": "id", "label": "Record ID", "type": "id"},
        {"api_name": "series_id", "label": "Series ID", "type": "id"},
        {"api_name": "created_at", "label": "Created Date", "type": "datetime"},
        {"api_name": "updated_at", "label": "Last Modified Date", "type": "datetime"},
        {"api_name": "created_by", "label": "Created By", "type": "lookup"},
        {"api_name": "updated_by", "label": "Last Modified By", "type": "lookup"},
        {"api_name": "owner_id", "label": "Owner", "type": "lookup"},
        {"api_name": "record_type_id", "label": "Record Type", "type": "lookup"},
        {"api_name": "tenant_id", "label": "Tenant", "type": "lookup"},
        {"api_name": "is_deleted", "label": "Is Deleted", "type": "boolean"},
        {"api_name": "system_timestamp", "label": "System Timestamp", "type": "datetime"},
    ]
    
    for sys_field in system_fields:
        api_name = sys_field["api_name"]
        if api_name in seen_fields:
            continue
        seen_fields.add(api_name)
        
        # Get value directly from record (not nested in data)
        value = record.get(api_name)
        
        # Convert datetime objects to string
        if value and hasattr(value, 'isoformat'):
            value = value.isoformat()
        
        # Resolve lookup display names for system lookup fields
        display_name = None
        if sys_field["type"] == "lookup" and value:
            display_name = await resolve_lookup_value(api_name, str(value), tenant_id)
        
        fields_data.append({
            "label": sys_field["label"],
            "api_name": api_name,
            "type": sys_field["type"],
            "value": value,
            "display_name": display_name,
            "category": "system",
            "required": False
        })
    
    # 4. Any remaining fields in record.data not yet captured
    record_data = record.get("data", {})
    for field_name, value in record_data.items():
        if field_name in seen_fields:
            continue
        seen_fields.add(field_name)
        
        # Infer type from value
        inferred_type = "text"
        if isinstance(value, bool):
            inferred_type = "boolean"
        elif isinstance(value, (int, float)):
            inferred_type = "number"
        elif isinstance(value, list):
            inferred_type = "multi_select"
        
        fields_data.append({
            "label": field_name.replace("_", " ").title(),
            "api_name": field_name,
            "type": inferred_type,
            "value": value,
            "category": "data",
            "required": False
        })
    
    # Sort fields: system first, then standard, then custom, then data
    category_order = {"system": 0, "standard": 1, "custom": 2, "data": 3}
    fields_data.sort(key=lambda x: (category_order.get(x["category"], 99), x["label"].lower()))
    
    return {
        "object_name": object_name,
        "object_label": obj_def.get("object_label", object_name.title()) if obj_def else object_name.title(),
        "record_id": record.get("id"),
        "series_id": record.get("series_id"),
        "fields": fields_data,
        "total_fields": len(fields_data),
        "categories": {
            "system": len([f for f in fields_data if f["category"] == "system"]),
            "standard": len([f for f in fields_data if f["category"] == "standard"]),
            "custom": len([f for f in fields_data if f["category"] == "custom"]),
            "data": len([f for f in fields_data if f["category"] == "data"])
        }
    }


@router.get("/check-access")
async def check_inspector_access(
    current_user: User = Depends(get_current_user)
) -> Dict[str, Any]:
    """
    Check if the current user has access to the Record Inspector.
    Used by frontend to determine whether to show the inspector icon.
    """
    has_access = await is_admin_user(current_user)
    
    return {
        "has_access": has_access,
        "user_id": current_user.id,
        "is_super_admin": current_user.is_super_admin
    }
