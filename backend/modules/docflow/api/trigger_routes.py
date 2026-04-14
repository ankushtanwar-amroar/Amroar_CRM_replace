"""
Trigger API Routes - Handle CRM field change webhooks
"""
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from typing import Dict, Any, List
import sys
import os
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))))

from shared.database import db
from shared.models import User
from modules.auth.api.auth_routes import get_current_user
from ..services.trigger_service import TriggerService
from ..services.trigger_service_enhanced import TriggerService as EnhancedTriggerService
from ..services.document_service import DocumentService
from ..services.document_service_enhanced import EnhancedDocumentService
from ..services.system_email_service import SystemEmailService
from ..services.email_history_service import EmailHistoryService

router = APIRouter(prefix="/docflow", tags=["DocFlow Triggers"])

# Services
trigger_service = TriggerService(db)
enhanced_trigger_service = EnhancedTriggerService(db)
document_service = DocumentService(db)
enhanced_document_service = EnhancedDocumentService(db)
email_service = SystemEmailService()
email_history_service = EmailHistoryService(db)


@router.post("/webhook/crm-update")
async def handle_crm_update(
    webhook_data: Dict[str, Any],
    background_tasks: BackgroundTasks
):
    """
    Handle CRM field update webhook
    Expected payload:
    {
        "object_type": "lead",
        "object_id": "123",
        "tenant_id": "tenant-1",
        "field_changes": {
            "Status": {"old": "New", "new": "Lost"}
        },
        "record_data": {...}
    }
    """
    try:
        object_type = webhook_data.get("object_type")
        object_id = webhook_data.get("object_id")
        tenant_id = webhook_data.get("tenant_id")
        field_changes = webhook_data.get("field_changes", {})
        
        if not all([object_type, object_id, tenant_id]):
            raise HTTPException(
                status_code=400,
                detail="Missing required fields: object_type, object_id, tenant_id"
            )
        
        # Use enhanced trigger service to evaluate triggers
        # This will handle merge fields and proper condition evaluation
        event_type = webhook_data.get("event_type", "onUpdate")
        triggered_count = await enhanced_trigger_service.evaluate_triggers_for_object(
            object_type=object_type,
            object_id=object_id,
            object_data=webhook_data.get("record_data", {}),
            tenant_id=tenant_id,
            event_type=event_type,
            old_data=webhook_data.get("old_data")
        )
        
        return {
            "success": True,
            "triggered_count": triggered_count,
            "message": f"Triggered {triggered_count} documents"
        }
    
    except Exception as e:
        # Log error
        await db.docflow_errors.insert_one({
            "error_type": "trigger_webhook_failed",
            "webhook_data": webhook_data,
            "error": str(e),
            "timestamp": datetime.now(timezone.utc)
        })
        
        raise HTTPException(
            status_code=500,
            detail=f"Failed to process webhook: {str(e)}"
        )


async def check_trigger_conditions(
    trigger_config: Dict[str, Any],
    field_changes: Dict[str, Any],
    record_data: Dict[str, Any]
) -> bool:
    """
    Check if trigger conditions are met
    """
    conditions = trigger_config.get("conditions", [])
    if not conditions:
        return False
    
    for condition in conditions:
        field = condition.get("field")
        operator = condition.get("operator")
        value = condition.get("value")
        
        # Check if this field changed
        field_change = field_changes.get(field)
        
        if operator == "changes_to":
            # Field must have changed TO this value
            if not field_change or field_change.get("new") != value:
                return False
        
        elif operator == "changes_from":
            # Field must have changed FROM this value
            if not field_change or field_change.get("old") != value:
                return False
        
        elif operator == "equals":
            # Current value must equal
            current_value = record_data.get(field)
            if current_value != value:
                return False
        
        elif operator == "not_equals":
            # Current value must not equal
            current_value = record_data.get(field)
            if current_value == value:
                return False
        
        elif operator == "contains":
            # Current value must contain
            current_value = str(record_data.get(field, ""))
            if value not in current_value:
                return False
    
    return True


async def generate_and_send_document(
    template_id: str,
    object_id: str,
    object_type: str,
    tenant_id: str,
    record_data: Dict[str, Any]
):
    """
    Background task to generate and send document
    """
    try:
        # Get template
        template = await db.docflow_templates.find_one({
            "id": template_id,
            "tenant_id": tenant_id
        })
        
        if not template:
            return
        
        # Get recipient email from record data
        recipient_email = record_data.get("Email") or record_data.get("email")
        recipient_name = record_data.get("Name") or record_data.get("name") or "Customer"
        
        if not recipient_email:
            # Try to find contact email
            contact_id = record_data.get("ContactId") or record_data.get("contact_id")
            if contact_id:
                contact = await db.contacts.find_one({"id": contact_id})
                if contact:
                    recipient_email = contact.get("email")
                    recipient_name = contact.get("name", recipient_name)
        
        if not recipient_email:
            print(f"No email found for {object_type} {object_id}, skipping")
            return
        
        # Generate document
        document = await enhanced_document_service.generate_document(
            template_id=template_id,
            crm_object_id=object_id,
            crm_object_type=object_type,
            user_id="system",
            tenant_id=tenant_id,
            delivery_channels=["email", "public_link"],
            recipient_email=recipient_email,
            recipient_name=recipient_name
        )
        
        # Build public URL
        public_url = f"/docflow/view/{document['public_token']}"
        
        # Send email
        email_result = await email_service.send_document_email(
            recipient_email=recipient_email,
            recipient_name=recipient_name,
            template_name=template["name"],
            document_url=public_url
        )
        
        # Log email history
        await email_history_service.log_email(
            template_id=template_id,
            template_name=template["name"],
            document_id=document["id"],
            recipient_email=recipient_email,
            recipient_name=recipient_name,
            crm_object_type=object_type,
            crm_object_id=object_id,
            tenant_id=tenant_id,
            status="sent" if email_result.get("success") else "failed",
            error_message=email_result.get("error")
        )
        
        # Update document status
        await db.docflow_documents.update_one(
            {"id": document["id"]},
            {
                "$set": {
                    "status": "sent",
                    "sent_at": datetime.now(timezone.utc)
                }
            }
        )
        
        print(f"✅ Auto-sent document: {template['name']} to {recipient_email}")
    
    except Exception as e:
        print(f"❌ Failed to auto-send document: {str(e)}")
        # Log error
        await db.docflow_errors.insert_one({
            "error_type": "auto_send_failed",
            "template_id": template_id,
            "object_id": object_id,
            "error": str(e),
            "timestamp": datetime.now(timezone.utc)
        })


@router.get("/triggers/test/{object_type}/{field}/{value}")
async def test_trigger(object_type: str, field: str, value: str):
    """
    Test endpoint to simulate a field change
    For testing: GET /api/docflow/triggers/test/lead/Status/Lost
    """
    webhook_data = {
        "object_type": object_type,
        "object_id": "test-123",
        "tenant_id": "default",
        "field_changes": {
            field: {"old": "New", "new": value}
        },
        "record_data": {
            field: value,
            "Email": "test@example.com",
            "Name": "Test User"
        }
    }
    
    background_tasks = BackgroundTasks()
    return await handle_crm_update(webhook_data, background_tasks)



# ============================================================
# Dynamic Trigger Configuration APIs
# ============================================================

@router.get("/trigger-objects")
async def get_objects_with_email_fields(
    current_user: User = Depends(get_current_user)
) -> List[Dict[str, Any]]:
    """
    Get all CRM objects that have at least one email field.
    Used by the trigger configuration UI to show available objects.
    
    Returns objects from both:
    - tenant_objects (standard CRM objects)
    - schema_objects (custom Schema Builder objects)
    
    OPTIMIZED: Uses batch queries instead of N+1 pattern
    """
    tenant_id = current_user.tenant_id
    objects_with_email = []
    
    # Hidden system objects to exclude
    HIDDEN_SYSTEM_OBJECTS = {"file", "file_record_link", "file_version"}
    
    # OPTIMIZATION 1: Batch fetch all data in parallel
    # Fetch tenant_objects, metadata_fields, and schema data in parallel
    tenant_objects_task = db.tenant_objects.find(
        {"tenant_id": tenant_id},
        {"_id": 0, "object_name": 1, "object_label": 1, "fields": 1}
    ).to_list(None)
    
    metadata_fields_task = db.metadata_fields.find(
        {"tenant_id": tenant_id},
        {"_id": 0, "object_name": 1, "fields": 1}
    ).to_list(None)
    
    schema_objects_task = db.schema_objects.find(
        {"tenant_id": tenant_id, "is_active": True},
        {"_id": 0, "id": 1, "api_name": 1, "label": 1}
    ).to_list(None)
    
    # Execute all queries in parallel using asyncio.gather
    import asyncio
    tenant_objects, all_metadata, schema_objects = await asyncio.gather(
        tenant_objects_task,
        metadata_fields_task,
        schema_objects_task,
        return_exceptions=True
    )
    
    # Handle exceptions gracefully
    if isinstance(tenant_objects, Exception):
        tenant_objects = []
    if isinstance(all_metadata, Exception):
        all_metadata = []
    if isinstance(schema_objects, Exception):
        schema_objects = []
    
    # OPTIMIZATION 2: Build metadata lookup map (O(1) lookup instead of O(n) query)
    metadata_map = {}
    for meta in all_metadata:
        obj_name = meta.get("object_name", "").lower()
        metadata_map[obj_name] = meta.get("fields", [])
    
    # Process tenant_objects with cached metadata
    for obj in tenant_objects:
        obj_name = obj.get("object_name", "").lower()
        if obj_name in HIDDEN_SYSTEM_OBJECTS:
            continue
        
        # Check email fields in object definition
        fields = obj.get("fields", {})
        email_fields = []
        
        for field_name, field_def in fields.items():
            if field_def.get("type", "").lower() == "email":
                email_fields.append({
                    "api_name": field_name,
                    "label": field_def.get("label", field_name)
                })
        
        # Check custom fields from pre-fetched metadata (O(1) lookup)
        custom_fields = metadata_map.get(obj_name, [])
        for cf in custom_fields:
            if cf.get("type", "").lower() == "email":
                email_fields.append({
                    "api_name": cf["api_name"],
                    "label": cf["label"]
                })
        
        if email_fields:
            objects_with_email.append({
                "object_name": obj.get("object_name"),
                "object_label": obj.get("object_label", obj.get("object_name")),
                "email_fields": email_fields,
                "source": "crm"
            })
    
    # OPTIMIZATION 3: Batch fetch schema fields for all schema objects at once
    if schema_objects:
        existing_names = {o["object_name"].lower() for o in objects_with_email}
        schema_ids = [obj["id"] for obj in schema_objects if obj.get("api_name", "").lower() not in existing_names]
        
        if schema_ids:
            # Single query for all schema fields
            all_schema_fields = await db.schema_fields.find(
                {
                    "tenant_id": tenant_id,
                    "object_id": {"$in": schema_ids},
                    "is_active": True,
                    "field_type": "email"
                },
                {"_id": 0, "object_id": 1, "api_name": 1, "label": 1}
            ).to_list(None)
            
            # Group fields by object_id
            fields_by_object = {}
            for f in all_schema_fields:
                obj_id = f["object_id"]
                if obj_id not in fields_by_object:
                    fields_by_object[obj_id] = []
                fields_by_object[obj_id].append({"api_name": f["api_name"], "label": f["label"]})
            
            # Process schema objects with pre-fetched fields
            for obj in schema_objects:
                if obj.get("api_name", "").lower() in existing_names:
                    continue
                
                email_fields = fields_by_object.get(obj["id"], [])
                if email_fields:
                    objects_with_email.append({
                        "object_name": obj.get("api_name"),
                        "object_label": obj.get("label"),
                        "email_fields": email_fields,
                        "source": "schema_builder"
                    })
    
    # Sort by label
    objects_with_email.sort(key=lambda x: x.get("object_label", "").lower())
    
    return objects_with_email


@router.get("/trigger-objects/{object_name}/fields")
async def get_object_fields_for_trigger(
    object_name: str,
    current_user: User = Depends(get_current_user)
) -> Dict[str, Any]:
    """
    Get all fields for a specific object.
    Used by the trigger configuration UI to populate field dropdowns for conditions.
    
    Returns all fields with their types and options (for picklists).
    """
    tenant_id = current_user.tenant_id
    all_fields = []
    email_fields = []
    
    # 1. Check tenant_objects first
    obj = await db.tenant_objects.find_one({
        "tenant_id": tenant_id,
        "object_name": object_name
    }, {"_id": 0})
    
    if obj:
        fields = obj.get("fields", {})
        for field_name, field_def in fields.items():
            field_type = field_def.get("type", "text").lower()
            field_info = {
                "api_name": field_name,
                "label": field_def.get("label", field_name),
                "type": field_type,
                "required": field_def.get("required", False)
            }
            
            # Include options for picklist/select fields
            if field_type in ["picklist", "select"] and field_def.get("options"):
                field_info["options"] = field_def["options"]
            
            all_fields.append(field_info)
            
            if field_type == "email":
                email_fields.append({
                    "api_name": field_name,
                    "label": field_def.get("label", field_name)
                })
        
        # Also check custom fields from metadata_fields
        custom_metadata = await db.metadata_fields.find_one({
            "object_name": object_name,
            "tenant_id": tenant_id
        }, {"_id": 0})
        
        existing_api_names = {f["api_name"] for f in all_fields}
        
        if custom_metadata:
            for cf in custom_metadata.get("fields", []):
                if cf["api_name"] not in existing_api_names:
                    field_type = cf.get("type", "text").lower()
                    field_info = {
                        "api_name": cf["api_name"],
                        "label": cf["label"],
                        "type": field_type,
                        "required": cf.get("is_required", False),
                        "is_custom": True
                    }
                    
                    if field_type in ["picklist", "select"] and cf.get("options"):
                        field_info["options"] = cf["options"]
                    
                    all_fields.append(field_info)
                    
                    if field_type == "email":
                        email_fields.append({
                            "api_name": cf["api_name"],
                            "label": cf["label"]
                        })
    else:
        # 2. Check Schema Builder objects
        schema_obj = await db.schema_objects.find_one({
            "tenant_id": tenant_id,
            "api_name": object_name.lower(),
            "is_active": True
        }, {"_id": 0})
        
        if not schema_obj:
            raise HTTPException(
                status_code=404,
                detail=f"Object '{object_name}' not found"
            )
        
        # Fetch fields for this Schema Builder object
        fields = await db.schema_fields.find(
            {"tenant_id": tenant_id, "object_id": schema_obj["id"], "is_active": True},
            {"_id": 0}
        ).sort("sort_order", 1).to_list(None)
        
        for f in fields:
            if f.get("is_system", False):
                continue  # Skip system fields like id, created_at
            
            field_type = f.get("field_type", "text").lower()
            field_info = {
                "api_name": f["api_name"],
                "label": f["label"],
                "type": field_type,
                "required": f.get("is_required", False)
            }
            
            if field_type == "picklist" and f.get("picklist_values"):
                field_info["options"] = f["picklist_values"]
            
            all_fields.append(field_info)
            
            if field_type == "email":
                email_fields.append({
                    "api_name": f["api_name"],
                    "label": f["label"]
                })
    
    # Sort fields by label
    all_fields.sort(key=lambda x: x.get("label", "").lower())
    
    return {
        "object_name": object_name,
        "fields": all_fields,
        "email_fields": email_fields,
        "total_fields": len(all_fields)
    }
