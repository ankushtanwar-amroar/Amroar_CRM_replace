"""
CRM Webhook Integration for DocFlow Triggers
This module integrates with CRM record create/update to trigger DocFlow automation
"""
import httpx
import os
from typing import Dict, Any
import logging
from bson import ObjectId
from datetime import datetime

logger = logging.getLogger(__name__)


def serialize_for_json(obj: Any) -> Any:
    """
    Recursively convert MongoDB-specific types to JSON-serializable types
    """
    if isinstance(obj, ObjectId):
        return str(obj)
    elif isinstance(obj, datetime):
        return obj.isoformat()
    elif isinstance(obj, dict):
        return {k: serialize_for_json(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [serialize_for_json(item) for item in obj]
    else:
        return obj


async def trigger_docflow_webhook(object_type: str, object_id: str, tenant_id: str,
                                  field_changes: Dict[str, Any], record_data: Dict[str, Any],
                                  old_data: Dict[str, Any] = None, event_type: str = "onUpdate"):
    """
    Send webhook to DocFlow trigger endpoint when CRM records change
    
    Args:
        object_type: Type of CRM object (lead, task, event, opportunity, etc.)
        object_id: ID of the record
        tenant_id: Tenant ID
        field_changes: Dictionary of field changes {field_name: {"old": old_value, "new": new_value}}
        record_data: Complete record data
        old_data: Previous record data (for change detection)
        event_type: "onCreate" or "onUpdate"
    """
    try:
        backend_url = os.environ.get("BACKEND_URL", "http://localhost:8001")
        webhook_url = f"{backend_url}/api/docflow/webhook/crm-update"
        
        # Serialize data to handle ObjectId and datetime types
        serialized_record_data = serialize_for_json(record_data)
        serialized_old_data = serialize_for_json(old_data) if old_data else None
        serialized_field_changes = serialize_for_json(field_changes)
        
        payload = {
            "object_type": object_type,
            "object_id": object_id,
            "tenant_id": tenant_id,
            "field_changes": serialized_field_changes,
            "record_data": serialized_record_data,
            "old_data": serialized_old_data,
            "event_type": event_type
        }
        
        logger.info(f"🚀 Triggering DocFlow webhook for {object_type} {object_id} (event: {event_type})")
        logger.info(f"   Webhook URL: {webhook_url}")
        logger.info(f"   Record data keys: {list(serialized_record_data.keys()) if serialized_record_data else []}")
        
        # Send webhook asynchronously
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(webhook_url, json=payload)
            response.raise_for_status()
            result = response.json()
            
            if result.get("triggered_count", 0) > 0:
                logger.info(f"✅ DocFlow triggered {result['triggered_count']} documents for {object_type} {object_id}")
            else:
                logger.info(f"⚪ DocFlow: No documents triggered for {object_type} {object_id}")
            
            return result
    
    except httpx.TimeoutException:
        logger.warning(f"⏱️ DocFlow webhook timeout for {object_type} {object_id}")
    except httpx.HTTPError as e:
        logger.error(f"❌ DocFlow webhook HTTP error: {str(e)}")
    except Exception as e:
        logger.error(f"❌ DocFlow webhook error: {str(e)}", exc_info=True)
    
    return {"success": False, "triggered_count": 0}


def extract_field_changes(old_data: Dict[str, Any], new_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Extract field changes between old and new data
    
    Returns:
        Dictionary of changes: {field_name: {"old": old_value, "new": new_value}}
    """
    changes = {}
    
    # Handle nested fields structure
    old_fields = old_data.get("fields", old_data) if old_data else {}
    new_fields = new_data.get("fields", new_data)
    
    for field_name, new_value in new_fields.items():
        old_value = old_fields.get(field_name)
        
        if old_value != new_value:
            changes[field_name] = {
                "old": old_value,
                "new": new_value
            }
    
    return changes
