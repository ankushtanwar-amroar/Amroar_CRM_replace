"""
Record Notification Triggers

Detects changes in record ownership and assignments, and sends notifications
to the new Notification Center.
"""
import logging
from typing import Dict, Any, Optional
from motor.motor_asyncio import AsyncIOMotorDatabase

logger = logging.getLogger(__name__)


async def check_and_notify_owner_change(
    db: AsyncIOMotorDatabase,
    tenant_id: str,
    object_name: str,
    record_id: str,
    record_name: str,
    old_owner_id: Optional[str],
    new_owner_id: str,
    changed_by_user_id: str,
    changed_by_name: str,
    old_owner_type: str = "USER",
    new_owner_type: str = "USER"
):
    """
    Check if owner changed and send notification to new owner.
    
    Args:
        db: Database connection
        tenant_id: Tenant ID
        object_name: Object type (lead, contact, opportunity, etc.)
        record_id: Record ID
        record_name: Display name of the record
        old_owner_id: Previous owner ID (can be None for new records)
        new_owner_id: New owner ID
        changed_by_user_id: User who made the change
        changed_by_name: Name of user who made the change
    """
    # Only notify if owner actually changed and new owner is different from who made the change
    if old_owner_id == new_owner_id:
        return
    
    if new_owner_id == changed_by_user_id:
        # Don't notify if user assigned record to themselves
        return
    
    try:
        from modules.notifications.services import get_notification_engine
        engine = get_notification_engine(db)
        
        # Get old owner name for context (optional)
        old_owner_name = "another user"
        if old_owner_id:
            if old_owner_type == "GROUP":
                coll = db["groups"]
            elif old_owner_type == "QUEUE":
                coll = db["queues"]
            else:
                coll = db["users"]
                
            old_owner = await coll.find_one({"id": old_owner_id}, {"name": 1, "first_name": 1, "last_name": 1})
            if old_owner:
                old_owner_name = old_owner.get("name") or f"{old_owner.get('first_name', '')} {old_owner.get('last_name', '')}".strip() or "another user"
        
        await engine.notify_owner_change(
            tenant_id=tenant_id,
            new_owner_id=new_owner_id,
            previous_owner_name=old_owner_name,
            target_object_type=object_name,
            target_object_id=record_id,
            record_name=record_name,
            changed_by=changed_by_user_id,
            changed_by_name=changed_by_name
        )
        
        logger.info(f"Sent owner change notification: {object_name} {record_id} from {old_owner_id} to {new_owner_id}")
    except Exception as e:
        logger.error(f"Error sending owner change notification: {str(e)}")


async def check_and_notify_assignment_change(
    db: AsyncIOMotorDatabase,
    tenant_id: str,
    object_name: str,
    record_id: str,
    record_name: str,
    field_name: str,
    old_assigned_id: Optional[str],
    new_assigned_id: str,
    assigned_by_user_id: str,
    assigned_by_name: str
):
    """
    Check if assignment changed (e.g., AssignedTo field) and send notification.
    
    Args:
        db: Database connection
        tenant_id: Tenant ID
        object_name: Object type
        record_id: Record ID
        record_name: Display name of the record
        field_name: Name of the assignment field (e.g., "AssignedTo", "assigned_to")
        old_assigned_id: Previous assignee ID
        new_assigned_id: New assignee ID
        assigned_by_user_id: User who made the assignment
        assigned_by_name: Name of user who made the assignment
    """
    # Only notify if assignment actually changed and assignee is different from who assigned
    if old_assigned_id == new_assigned_id:
        return
    
    if new_assigned_id == assigned_by_user_id:
        # Don't notify if user assigned to themselves
        return
    
    try:
        from modules.notifications.services import get_notification_engine
        engine = get_notification_engine(db)
        
        await engine.notify_assignment(
            tenant_id=tenant_id,
            assigned_user_id=new_assigned_id,
            assigner_name=assigned_by_name,
            target_object_type=object_name,
            target_object_id=record_id,
            record_name=record_name,
            created_by=assigned_by_user_id
        )
        
        logger.info(f"Sent assignment notification: {object_name} {record_id} assigned to {new_assigned_id}")
    except Exception as e:
        logger.error(f"Error sending assignment notification: {str(e)}")


def get_record_display_name(object_name: str, record_data: Dict[str, Any]) -> str:
    """
    Extract a display name from record data based on object type.
    
    Args:
        object_name: Object type
        record_data: Record data dictionary
    
    Returns:
        Display name string
    """
    data = record_data.get("data", record_data)
    
    # Common name fields by priority
    name_fields = ["name", "Name", "subject", "Subject", "title", "Title"]
    
    for field in name_fields:
        if data.get(field):
            return str(data[field])
    
    # Object-specific fallbacks
    if object_name.lower() in ["lead", "contact"]:
        first = data.get("first_name") or data.get("FirstName") or ""
        last = data.get("last_name") or data.get("LastName") or ""
        if first or last:
            return f"{first} {last}".strip()
    
    if object_name.lower() == "account":
        return data.get("account_name") or data.get("AccountName") or "Unnamed Account"
    
    if object_name.lower() == "opportunity":
        return data.get("opportunity_name") or data.get("OpportunityName") or "Unnamed Opportunity"
    
    if object_name.lower() in ["task", "event"]:
        return data.get("subject") or data.get("Subject") or f"Unnamed {object_name.capitalize()}"
    
    # Series ID fallback
    series_id = record_data.get("series_id")
    if series_id:
        return series_id
    
    return f"{object_name.capitalize()} Record"


# Assignment field names to check by object type
ASSIGNMENT_FIELDS = {
    "task": ["assigned_to", "AssignedTo", "assigned_to_id", "AssignedToId"],
    "event": ["assigned_to", "AssignedTo", "assigned_to_id", "AssignedToId"],
    "case": ["assigned_to", "AssignedTo", "case_owner", "CaseOwner"],
    "lead": ["assigned_to", "AssignedTo"],
    "opportunity": ["assigned_to", "AssignedTo"],
}


def get_assignment_field_value(object_name: str, data: Dict[str, Any]) -> Optional[str]:
    """
    Get the assignment field value for an object.
    
    Args:
        object_name: Object type
        data: Record data
    
    Returns:
        Assignment user ID or None
    """
    fields_to_check = ASSIGNMENT_FIELDS.get(object_name.lower(), [])
    
    for field in fields_to_check:
        value = data.get(field)
        if value:
            return str(value)
    
    return None
