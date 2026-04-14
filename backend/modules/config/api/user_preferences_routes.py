"""
User Preferences Routes
Extracted from server.py as part of Step 5 refactoring.
"""
from fastapi import APIRouter, Depends
from typing import Dict, Any, Optional, List
from datetime import datetime, timezone
import uuid

from config.database import db
from modules.auth.api.auth_routes import get_current_user
from shared.models import ObjectRecord

router = APIRouter()


@router.get("/user-preferences/{object_name}")
async def get_user_object_preferences(
    object_name: str,
    current_user = Depends(get_current_user)
):
    """Get all preferences for a specific object for the current user"""

    prefs = await db.user_preferences.find({
        "user_id": current_user.id,
        "tenant_id": current_user.tenant_id,
        "object_name": object_name
    }, {"_id": 0}).to_list(None)
    
    # Organize preferences by type
    preferences = {
        "active_list_view": "all_records",
        "pinned_view": None,
        "sort_field": None,
        "sort_order": "asc",
        "search_term": "",
        "filter_field": None,
        "filter_value": None,
        "filter_condition": "equals"
    }
    
    for pref in prefs:
        if pref["preference_type"] == "active_list_view":
            preferences["active_list_view"] = pref["value"].get("view_id", "all_records")
        elif pref["preference_type"] == "pinned_view":
            preferences["pinned_view"] = pref["value"].get("view_id")
        elif pref["preference_type"] == "sort_preferences":
            preferences["sort_field"] = pref["value"].get("sort_field")
            preferences["sort_order"] = pref["value"].get("sort_order", "asc")
        elif pref["preference_type"] == "filter_preferences":
            preferences["filter_field"] = pref["value"].get("filter_field")
            preferences["filter_value"] = pref["value"].get("filter_value")
            preferences["filter_condition"] = pref["value"].get("filter_condition", "equals")
        elif pref["preference_type"] == "search_preferences":
            preferences["search_term"] = pref["value"].get("search_term", "")
    
    return preferences


@router.post("/user-preferences/{object_name}")
async def save_user_object_preferences(
    object_name: str,
    preferences: Dict[str, Any],
    current_user = Depends(get_current_user)
):
    """Save preferences for a specific object for the current user"""

    
    # Save active list view preference
    if "active_list_view" in preferences:
        await db.user_preferences.update_one(
            {
                "user_id": current_user.id,
                "tenant_id": current_user.tenant_id,
                "object_name": object_name,
                "preference_type": "active_list_view"
            },
            {
                "$set": {
                    "value": {"view_id": preferences["active_list_view"]},
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }
            },
            upsert=True
        )
    
    # Save pinned view preference
    if "pinned_view" in preferences:
        await db.user_preferences.update_one(
            {
                "user_id": current_user.id,
                "tenant_id": current_user.tenant_id,
                "object_name": object_name,
                "preference_type": "pinned_view"
            },
            {
                "$set": {
                    "value": {"view_id": preferences["pinned_view"]},
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }
            },
            upsert=True
        )
    
    # Save sort preferences
    if "sort_field" in preferences or "sort_order" in preferences:
        await db.user_preferences.update_one(
            {
                "user_id": current_user.id,
                "tenant_id": current_user.tenant_id,
                "object_name": object_name,
                "preference_type": "sort_preferences"
            },
            {
                "$set": {
                    "value": {
                        "sort_field": preferences.get("sort_field"),
                        "sort_order": preferences.get("sort_order", "asc")
                    },
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }
            },
            upsert=True
        )
    
    # Save filter preferences
    if "filter_field" in preferences or "filter_value" in preferences or "filter_condition" in preferences:
        await db.user_preferences.update_one(
            {
                "user_id": current_user.id,
                "tenant_id": current_user.tenant_id,
                "object_name": object_name,
                "preference_type": "filter_preferences"
            },
            {
                "$set": {
                    "value": {
                        "filter_field": preferences.get("filter_field"),
                        "filter_value": preferences.get("filter_value"),
                        "filter_condition": preferences.get("filter_condition", "equals")
                    },
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }
            },
            upsert=True
        )
    
    # Save search preferences
    if "search_term" in preferences:
        await db.user_preferences.update_one(
            {
                "user_id": current_user.id,
                "tenant_id": current_user.tenant_id,
                "object_name": object_name,
                "preference_type": "search_preferences"
            },
            {
                "$set": {
                    "value": {"search_term": preferences.get("search_term", "")},
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }
            },
            upsert=True
        )
    
    return {"success": True}


@router.post("/user-preferences/{object_name}/pin-view")
async def pin_view_for_object(
    object_name: str,
    view_id: str = None,
    current_user = Depends(get_current_user)
):
    """Pin a specific view for an object"""

    await db.user_preferences.update_one(
        {
            "user_id": current_user.id,
            "tenant_id": current_user.tenant_id,
            "object_name": object_name,
            "preference_type": "pinned_view"
        },
        {
            "$set": {
                "value": {"view_id": view_id},
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
        },
        upsert=True
    )
    return {"success": True}


@router.delete("/user-preferences/{object_name}/pin-view")
async def unpin_view_for_object(
    object_name: str,
    current_user = Depends(get_current_user)
):
    """Unpin the pinned view for an object"""

    await db.user_preferences.delete_one({
        "user_id": current_user.id,
        "tenant_id": current_user.tenant_id,
        "object_name": object_name,
        "preference_type": "pinned_view"
    })
    return {"success": True}


@router.post("/objects/{object_name}/records/{record_id}/view")
async def track_recently_viewed(
    object_name: str,
    record_id: str,
    current_user = Depends(get_current_user)
):
    """Track recently viewed records"""

    # Update or create recently viewed preference
    preference = {
        "id": str(uuid.uuid4()),
        "user_id": current_user.id,
        "tenant_id": current_user.tenant_id,
        "preference_type": "recently_viewed",
        "object_name": object_name,
        "value": {
            "record_id": record_id,
            "viewed_at": datetime.now(timezone.utc).isoformat()
        },
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.user_preferences.update_one(
        {
            "user_id": current_user.id,
            "tenant_id": current_user.tenant_id,
            "preference_type": "recently_viewed",
            "object_name": object_name,
            "value.record_id": record_id
        },
        {"$set": preference},
        upsert=True
    )
    return {"success": True}


@router.get("/objects/{object_name}/recently-viewed")
async def get_recently_viewed_records(
    object_name: str,
    limit: int = 10,
    current_user = Depends(get_current_user)
):
    """Get recently viewed records for an object"""

    # Get recently viewed record IDs for this user and object
    recent_prefs = await db.user_preferences.find({
        "user_id": current_user.id,
        "tenant_id": current_user.tenant_id,
        "preference_type": "recently_viewed",
        "object_name": object_name
    }).sort("updated_at", -1).limit(limit).to_list(None)
    
    if not recent_prefs:
        return []
    
    # Get the actual records
    record_ids = [pref["value"]["record_id"] for pref in recent_prefs]
    records = await db.object_records.find({
        "tenant_id": current_user.tenant_id,
        "object_name": object_name,
        "id": {"$in": record_ids}
    }, {"_id": 0}).to_list(None)
    
    # Sort by the view order
    record_dict = {record["id"]: record for record in records}
    sorted_records = [record_dict[record_id] for record_id in record_ids if record_id in record_dict]
    
    # Return as ObjectRecord instances
    from shared.models import parse_from_mongo
    return [ObjectRecord(**parse_from_mongo(record)) for record in sorted_records]


@router.get("/calendar/activities")
async def get_calendar_activities(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user = Depends(get_current_user)
):
    """Get calendar activities (tasks and events)"""

    # Build date filter
    date_filter = {}
    if start_date and end_date:
        date_filter = {
            "$or": [
                {"data.due_date": {"$gte": start_date, "$lte": end_date}},
                {"data.start_date": {"$gte": start_date, "$lte": end_date}}
            ]
        }
    
    # Get tasks with due dates
    tasks_query = {
        "tenant_id": current_user.tenant_id,
        "object_name": "task",
        "data.due_date": {"$exists": True, "$ne": ""}
    }
    if date_filter:
        tasks_query.update(date_filter)
    
    tasks = await db.object_records.find(tasks_query, {"_id": 0}).to_list(None)
    
    # Get events with start dates
    events_query = {
        "tenant_id": current_user.tenant_id,
        "object_name": "event",
        "data.start_date": {"$exists": True, "$ne": ""}
    }
    if date_filter:
        events_query.update(date_filter)
        
    events = await db.object_records.find(events_query, {"_id": 0}).to_list(None)
    
    calendar_items = []
    
    # Format tasks for calendar
    for task in tasks:
        calendar_items.append({
            "id": task["id"],
            "type": "task",
            "title": task["data"].get("subject", "Untitled Task"),
            "date": task["data"].get("due_date"),
            "status": task["data"].get("status", ""),
            "priority": task["data"].get("priority", ""),
            "description": task["data"].get("description", ""),
            "related_to": task["data"].get("related_to", ""),
            "related_type": task["data"].get("related_type", "")
        })
    
    # Format events for calendar
    for event in events:
        calendar_items.append({
            "id": event["id"],
            "type": "event",
            "title": event["data"].get("subject", "Untitled Event"),
            "date": event["data"].get("start_date"),
            "start_date": event["data"].get("start_date"),
            "end_date": event["data"].get("end_date"),
            "location": event["data"].get("location", ""),
            "event_type": event["data"].get("event_type", ""),
            "description": event["data"].get("description", ""),
            "related_to": event["data"].get("related_to", ""),
            "related_type": event["data"].get("related_type", "")
        })
    
    return {
        "activities": calendar_items,
        "total_tasks": len(tasks),
        "total_events": len(events)
    }
