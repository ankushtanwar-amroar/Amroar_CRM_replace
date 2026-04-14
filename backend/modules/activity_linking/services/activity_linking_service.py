"""
Activity Linking Service
Handles:
1. person_link_id / record_link_id resolution
2. Computed name field for Lead/Contact
3. last_activity_at computation for major objects
"""
from datetime import datetime, timezone
from typing import Dict, Any, Optional, List
import logging

from config.database import db

logger = logging.getLogger(__name__)


# Objects that support person_link_id (Person-type objects)
PERSON_OBJECTS = ["lead", "contact"]

# Objects that support last_activity_at
ACTIVITY_ENABLED_OBJECTS = ["lead", "contact", "account", "opportunity"]

# Activity objects that link to other records
ACTIVITY_OBJECTS = ["task", "event"]


def compute_name_field(object_name: str, data: Dict[str, Any]) -> Optional[str]:
    """
    Compute the display name field for an object.
    
    - Lead/Contact: first_name + ' ' + last_name (trimmed)
    - Account/Opportunity: name field is user-editable (return as-is)
    - Other objects: return existing name or None
    """
    object_lower = object_name.lower()
    
    if object_lower in ["lead", "contact"]:
        first_name = (data.get("first_name") or "").strip()
        last_name = (data.get("last_name") or "").strip()
        
        if first_name and last_name:
            return f"{first_name} {last_name}"
        elif last_name:
            return last_name
        elif first_name:
            return first_name
        return None
    
    # For Account, Opportunity, and other objects - return existing name
    return data.get("name") or data.get("account_name") or data.get("opportunity_name")


def resolve_activity_links(data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Ensure activity data has person_link_id and record_link_id.
    Migrates from legacy related_to/related_type if needed.
    
    Returns updated data dict with link fields populated.
    """
    updated_data = dict(data)
    
    # If new link fields already exist, use them
    person_link = data.get("person_link_id")
    record_link = data.get("record_link_id")
    
    # Migrate from legacy fields if link fields are empty
    if not person_link and not record_link:
        related_to = data.get("related_to")
        related_type = data.get("related_type", "").lower()
        
        if related_to:
            if related_type in PERSON_OBJECTS:
                updated_data["person_link_id"] = related_to
            else:
                updated_data["record_link_id"] = related_to
    
    return updated_data


async def update_last_activity_at(
    tenant_id: str,
    object_name: str,
    record_id: str
) -> Optional[datetime]:
    """
    Compute and update last_activity_at for a record based on linked activities.
    
    Searches for:
    - Tasks/Events with person_link_id pointing to this record
    - Tasks/Events with record_link_id pointing to this record
    - Legacy: related_to field pointing to this record
    
    Returns the computed last_activity_at datetime.
    """
    if object_name.lower() not in ACTIVITY_ENABLED_OBJECTS:
        return None
    
    # Get the record to find its series_id too
    record = await db.object_records.find_one({
        "tenant_id": tenant_id,
        "object_name": object_name,
        "id": record_id
    }, {"_id": 0, "series_id": 1})
    
    if not record:
        return None
    
    series_id = record.get("series_id", record_id)
    
    # Build search conditions for linked activities
    search_conditions = [
        {"data.person_link_id": record_id},
        {"data.person_link_id": series_id},
        {"data.record_link_id": record_id},
        {"data.record_link_id": series_id},
        # Legacy fields
        {"data.related_to": record_id},
        {"data.related_to": series_id},
        {f"data.{object_name}_id": record_id},
        {f"data.{object_name}_id": series_id},
    ]
    
    # Find latest activity (task or event)
    latest_activity = None
    
    for activity_type in ACTIVITY_OBJECTS:
        activity = await db.object_records.find_one(
            {
                "tenant_id": tenant_id,
                "object_name": activity_type,
                "$or": search_conditions
            },
            {"_id": 0, "created_at": 1, "updated_at": 1},
            sort=[("updated_at", -1)]
        )
        
        if activity:
            activity_time = activity.get("updated_at") or activity.get("created_at")
            if activity_time:
                # Parse if string
                if isinstance(activity_time, str):
                    try:
                        activity_time = datetime.fromisoformat(activity_time.replace("Z", "+00:00"))
                    except (ValueError, TypeError):
                        continue
                
                if latest_activity is None or activity_time > latest_activity:
                    latest_activity = activity_time
    
    if latest_activity:
        # Update the record's last_activity_at
        await db.object_records.update_one(
            {"tenant_id": tenant_id, "object_name": object_name, "id": record_id},
            {"$set": {"data.last_activity_at": latest_activity.isoformat()}}
        )
        logger.debug(f"Updated last_activity_at for {object_name}/{record_id} to {latest_activity}")
    
    return latest_activity


async def update_linked_records_last_activity(
    tenant_id: str,
    activity_data: Dict[str, Any]
):
    """
    When an activity (Task/Event) is created or updated,
    update last_activity_at on all linked records.
    """
    records_to_update = []
    
    # Check person_link_id
    person_link = activity_data.get("person_link_id")
    if person_link:
        # Determine which object type this links to
        for obj_type in PERSON_OBJECTS:
            record = await db.object_records.find_one({
                "tenant_id": tenant_id,
                "object_name": obj_type,
                "$or": [{"id": person_link}, {"series_id": person_link}]
            }, {"_id": 0, "id": 1, "object_name": 1})
            if record:
                records_to_update.append((record["object_name"], record["id"]))
                break
    
    # Check record_link_id
    record_link = activity_data.get("record_link_id")
    if record_link:
        # Could be any object type - search all activity-enabled objects
        for obj_type in ACTIVITY_ENABLED_OBJECTS:
            record = await db.object_records.find_one({
                "tenant_id": tenant_id,
                "object_name": obj_type,
                "$or": [{"id": record_link}, {"series_id": record_link}]
            }, {"_id": 0, "id": 1, "object_name": 1})
            if record:
                records_to_update.append((record["object_name"], record["id"]))
                break
    
    # Legacy: check related_to
    related_to = activity_data.get("related_to")
    if related_to and not person_link and not record_link:
        for obj_type in ACTIVITY_ENABLED_OBJECTS:
            record = await db.object_records.find_one({
                "tenant_id": tenant_id,
                "object_name": obj_type,
                "$or": [{"id": related_to}, {"series_id": related_to}]
            }, {"_id": 0, "id": 1, "object_name": 1})
            if record:
                records_to_update.append((record["object_name"], record["id"]))
                break
    
    # Update last_activity_at for all linked records
    for obj_name, obj_id in records_to_update:
        await update_last_activity_at(tenant_id, obj_name, obj_id)


async def ensure_name_field(
    tenant_id: str,
    object_name: str,
    data: Dict[str, Any],
    record_id: Optional[str] = None
) -> Dict[str, Any]:
    """
    Ensure the name field is properly set for the record.
    For Lead/Contact: compute from first_name + last_name
    For Account/Opportunity: ensure name field exists (user-editable)
    
    Returns updated data dict.
    """
    updated_data = dict(data)
    computed_name = compute_name_field(object_name, data)
    
    if object_name.lower() in ["lead", "contact"]:
        # Always compute name for person objects
        if computed_name:
            updated_data["name"] = computed_name
    
    return updated_data


async def get_activity_link_info(
    tenant_id: str,
    link_id: str,
    link_type: str = "any"
) -> Optional[Dict[str, Any]]:
    """
    Resolve an activity link ID to record details.
    
    Args:
        tenant_id: Tenant ID
        link_id: The person_link_id or record_link_id value
        link_type: "person" (Lead/Contact), "record" (any), or "any"
    
    Returns:
        Dict with object_name, record_id, name, series_id
    """
    if link_type == "person":
        search_objects = PERSON_OBJECTS
    elif link_type == "record":
        search_objects = ACTIVITY_ENABLED_OBJECTS
    else:
        search_objects = ACTIVITY_ENABLED_OBJECTS + ["task", "event"]
    
    for obj_type in search_objects:
        record = await db.object_records.find_one({
            "tenant_id": tenant_id,
            "object_name": obj_type,
            "$or": [{"id": link_id}, {"series_id": link_id}]
        }, {"_id": 0, "id": 1, "series_id": 1, "data": 1, "object_name": 1})
        
        if record:
            data = record.get("data", {})
            name = compute_name_field(obj_type, data) or data.get("name") or data.get("subject") or "Unknown"
            
            return {
                "object_name": obj_type,
                "record_id": record["id"],
                "series_id": record.get("series_id"),
                "name": name
            }
    
    return None
