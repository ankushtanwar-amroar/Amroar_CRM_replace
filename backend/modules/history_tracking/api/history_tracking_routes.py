"""
Field History Tracking Module
Enables tracking of field value changes on records.
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
from pydantic import BaseModel
import logging

from config.database import db
from shared.models import User
from modules.auth.api.auth_routes import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/history-tracking", tags=["History Tracking"])


# ============================================================
# Pydantic Models
# ============================================================

class HistoryTrackingConfig(BaseModel):
    """Configuration for which fields to track history for an object"""
    object_name: str
    tracked_fields: List[str]  # List of field API names to track


class FieldHistoryEntry(BaseModel):
    """A single field history entry"""
    id: str
    object_name: str
    record_id: str
    field_name: str
    field_label: Optional[str] = None
    old_value: Any
    new_value: Any
    changed_by: str
    changed_by_name: Optional[str] = None
    changed_at: datetime


class FieldHistoryResponse(BaseModel):
    """Response model for field history entries"""
    entries: List[FieldHistoryEntry]
    total: int


# ============================================================
# System fields that should NOT be tracked
# ============================================================
EXCLUDED_SYSTEM_FIELDS = {
    'id', 'series_id', 'created_at', 'created_by', 
    'last_modified', 'last_modified_by', 'tenant_id',
    'object_name', 'version', 'is_deleted'
}

# Field types that should NOT be tracked (computed fields)
EXCLUDED_FIELD_TYPES = {'formula', 'rollup'}


# ============================================================
# API Endpoints
# ============================================================

@router.get("/config/{object_name}")
async def get_history_tracking_config(
    object_name: str,
    current_user: User = Depends(get_current_user)
):
    """Get history tracking configuration for an object"""
    config = await db.history_tracking_config.find_one({
        "tenant_id": current_user.tenant_id,
        "object_name": object_name
    }, {"_id": 0})
    
    if not config:
        return {
            "object_name": object_name,
            "tracked_fields": [],
            "is_enabled": False
        }
    
    return {
        "object_name": object_name,
        "tracked_fields": config.get("tracked_fields", []),
        "is_enabled": len(config.get("tracked_fields", [])) > 0,
        "updated_at": config.get("updated_at"),
        "updated_by": config.get("updated_by")
    }


@router.get("/enabled-objects")
async def get_objects_with_history_tracking(
    current_user: User = Depends(get_current_user)
):
    """
    Get list of all objects that have history tracking enabled.
    
    This is used by the Related Lists component to dynamically 
    add "Object History" as an available related list option.
    
    Returns: List of objects with history tracking enabled, including
    their labels for display in the UI.
    """
    # Get all history tracking configs with tracked fields
    configs = await db.history_tracking_config.find({
        "tenant_id": current_user.tenant_id,
        "tracked_fields": {"$exists": True, "$ne": []}
    }, {"_id": 0, "object_name": 1, "tracked_fields": 1}).to_list(None)
    
    # Get object labels from tenant_objects
    object_names = [c["object_name"] for c in configs]
    
    enabled_objects = []
    for config in configs:
        obj_name = config["object_name"]
        tracked_count = len(config.get("tracked_fields", []))
        
        # Get object label
        obj = await db.tenant_objects.find_one({
            "tenant_id": current_user.tenant_id,
            "object_name": obj_name
        }, {"_id": 0, "object_name": 1, "label": 1})
        
        if not obj:
            # Check Schema Builder objects
            obj = await db.schema_objects.find_one({
                "tenant_id": current_user.tenant_id,
                "api_name": obj_name.lower(),
                "is_active": True
            }, {"_id": 0, "api_name": 1, "label": 1})
        
        label = obj.get("label") if obj else obj_name
        
        enabled_objects.append({
            "object_name": obj_name,
            "label": label or obj_name,
            "tracked_fields_count": tracked_count,
            "history_list_id": f"{obj_name}_history",
            "history_list_name": f"{label or obj_name.title()} History"
        })
    
    return {
        "enabled_objects": enabled_objects,
        "total": len(enabled_objects)
    }


@router.put("/config/{object_name}")
async def update_history_tracking_config(
    object_name: str,
    config: HistoryTrackingConfig,
    current_user: User = Depends(get_current_user)
):
    """Update history tracking configuration for an object"""
    
    # Validate that the object exists
    obj = await db.tenant_objects.find_one({
        "tenant_id": current_user.tenant_id,
        "object_name": object_name
    }, {"_id": 0})
    
    if not obj:
        # Check Schema Builder objects
        obj = await db.schema_objects.find_one({
            "tenant_id": current_user.tenant_id,
            "api_name": object_name.lower(),
            "is_active": True
        }, {"_id": 0})
    
    if not obj:
        raise HTTPException(status_code=404, detail="Object not found")
    
    # Update or insert config
    await db.history_tracking_config.update_one(
        {
            "tenant_id": current_user.tenant_id,
            "object_name": object_name
        },
        {
            "$set": {
                "tenant_id": current_user.tenant_id,
                "object_name": object_name,
                "tracked_fields": config.tracked_fields,
                "updated_at": datetime.now(timezone.utc).isoformat(),
                "updated_by": current_user.id
            }
        },
        upsert=True
    )
    
    logger.info(f"Updated history tracking config for {object_name}: {config.tracked_fields}")
    
    return {
        "message": "History tracking configuration updated",
        "object_name": object_name,
        "tracked_fields": config.tracked_fields
    }


@router.get("/trackable-fields/{object_name}")
async def get_trackable_fields(
    object_name: str,
    current_user: User = Depends(get_current_user)
):
    """
    Get list of fields that can be tracked for an object.
    Excludes: system fields, formula fields, rollup fields.
    """
    # Get object definition
    obj = await db.tenant_objects.find_one({
        "tenant_id": current_user.tenant_id,
        "object_name": object_name
    }, {"_id": 0})
    
    if not obj:
        # Check Schema Builder objects
        obj = await db.schema_objects.find_one({
            "tenant_id": current_user.tenant_id,
            "api_name": object_name.lower(),
            "is_active": True
        }, {"_id": 0})
        
        if obj:
            # Convert Schema Builder format to tenant_objects format
            fields = await db.schema_fields.find({
                "tenant_id": current_user.tenant_id,
                "object_id": obj["id"],
                "is_active": True
            }, {"_id": 0}).to_list(None)
            
            obj["fields"] = {
                f["api_name"]: {
                    "type": f["field_type"],
                    "label": f["label"],
                    "is_custom": not f.get("is_system", False)
                }
                for f in fields
            }
    
    if not obj:
        raise HTTPException(status_code=404, detail="Object not found")
    
    # Get custom fields from metadata_fields
    custom_metadata = await db.metadata_fields.find_one({
        "object_name": object_name,
        "tenant_id": current_user.tenant_id
    }, {"_id": 0})
    
    # Get advanced fields
    advanced_fields = await db.advanced_fields.find({
        "tenant_id": current_user.tenant_id,
        "object_name": object_name,
        "is_active": {"$ne": False}
    }, {"_id": 0}).to_list(None)
    
    # Merge all fields
    all_fields = dict(obj.get("fields", {}))
    
    # Add custom fields
    if custom_metadata:
        for cf in custom_metadata.get("fields", []):
            all_fields[cf["api_name"]] = {
                "type": cf["type"],
                "label": cf["label"],
                "is_custom": True
            }
    
    # Add advanced fields (but mark formula/rollup as excluded)
    for af in advanced_fields:
        field_type = af.get("field_type", "").lower()
        all_fields[af["api_key"]] = {
            "type": field_type,
            "label": af.get("label", af["api_key"]),
            "is_custom": True,
            "is_computed": field_type in EXCLUDED_FIELD_TYPES
        }
    
    # Get current tracking config
    config = await db.history_tracking_config.find_one({
        "tenant_id": current_user.tenant_id,
        "object_name": object_name
    }, {"_id": 0})
    
    tracked_fields = config.get("tracked_fields", []) if config else []
    
    # Filter out system fields and computed fields
    trackable_fields = []
    for api_name, field_def in all_fields.items():
        # Skip system fields
        if api_name.lower() in EXCLUDED_SYSTEM_FIELDS:
            continue
        
        # Skip computed fields (formula, rollup)
        field_type = field_def.get("type", "").lower()
        if field_type in EXCLUDED_FIELD_TYPES:
            continue
        
        if field_def.get("is_computed"):
            continue
        
        trackable_fields.append({
            "api_name": api_name,
            "label": field_def.get("label", api_name),
            "type": field_type,
            "is_custom": field_def.get("is_custom", False),
            "is_tracked": api_name in tracked_fields
        })
    
    # Sort by label
    trackable_fields.sort(key=lambda x: x["label"].lower())
    
    return {
        "object_name": object_name,
        "fields": trackable_fields,
        "total_trackable": len(trackable_fields),
        "currently_tracked": len(tracked_fields)
    }


@router.get("/records/{object_name}/{record_id}")
async def get_record_field_history(
    object_name: str,
    record_id: str,
    limit: int = 50,
    skip: int = 0,
    current_user: User = Depends(get_current_user)
):
    """Get field history for a specific record"""
    
    # Get history entries
    query = {
        "tenant_id": current_user.tenant_id,
        "object_name": object_name,
        "record_id": record_id
    }
    
    total = await db.field_history.count_documents(query)
    
    entries = await db.field_history.find(
        query,
        {"_id": 0}
    ).sort("changed_at", -1).skip(skip).limit(limit).to_list(None)
    
    # Enrich with user names
    user_ids = list(set(e.get("changed_by") for e in entries if e.get("changed_by")))
    users = {}
    if user_ids:
        user_docs = await db.users.find(
            {"$or": [{"id": uid} for uid in user_ids]},
            {"_id": 0, "id": 1, "first_name": 1, "last_name": 1, "email": 1}
        ).to_list(None)
        users = {
            u["id"]: f"{u.get('first_name', '')} {u.get('last_name', '')}".strip() or u.get("email", "Unknown")
            for u in user_docs
        }
    
    for entry in entries:
        entry["changed_by_name"] = users.get(entry.get("changed_by"), "Unknown User")
    
    return {
        "entries": entries,
        "total": total,
        "limit": limit,
        "skip": skip
    }


# ============================================================
# Helper function to record field history (called from records API)
# ============================================================

async def record_field_changes(
    tenant_id: str,
    object_name: str,
    record_id: str,
    old_data: Dict[str, Any],
    new_data: Dict[str, Any],
    changed_by: str,
    field_labels: Optional[Dict[str, str]] = None
):
    """
    Record field value changes to history.
    
    This function is called from the record update API when fields change.
    It checks the history tracking config and records changes for tracked fields.
    
    Args:
        tenant_id: Tenant ID
        object_name: Object API name (e.g., 'lead', 'contact')
        record_id: Record series_id
        old_data: Previous field values
        new_data: New field values
        changed_by: User ID who made the change
        field_labels: Optional mapping of api_name -> display label
    """
    # Get history tracking config
    config = await db.history_tracking_config.find_one({
        "tenant_id": tenant_id,
        "object_name": object_name
    }, {"_id": 0})
    
    if not config:
        return  # No tracking configured for this object
    
    tracked_fields = set(config.get("tracked_fields", []))
    if not tracked_fields:
        return  # No fields being tracked
    
    # Find changed fields
    history_entries = []
    changed_at = datetime.now(timezone.utc)
    
    for field_name in tracked_fields:
        old_value = old_data.get(field_name)
        new_value = new_data.get(field_name)
        
        # Check if value actually changed
        if old_value != new_value:
            entry = {
                "id": f"fh-{record_id}-{field_name}-{changed_at.timestamp()}",
                "tenant_id": tenant_id,
                "object_name": object_name,
                "record_id": record_id,
                "field_name": field_name,
                "field_label": field_labels.get(field_name, field_name) if field_labels else field_name,
                "old_value": old_value,
                "new_value": new_value,
                "changed_by": changed_by,
                "changed_at": changed_at.isoformat()
            }
            history_entries.append(entry)
            logger.debug(f"Recording field change: {object_name}/{record_id}.{field_name}: {old_value} -> {new_value}")
    
    # Insert history entries
    if history_entries:
        await db.field_history.insert_many(history_entries)
        logger.info(f"Recorded {len(history_entries)} field changes for {object_name}/{record_id}")
