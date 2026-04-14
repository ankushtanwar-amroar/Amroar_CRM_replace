"""
CRM API Routes - Dynamic CRM Object and Field endpoints for DocFlow
"""
from fastapi import APIRouter, Depends, HTTPException
from typing import Dict, Any, List, Optional
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))))

from shared.database import db
from shared.models import User
from shared.auth import get_current_user
from ..services.activity_log_service import ActivityLogService
from modules.integrations.services.salesforce_gateway import SalesforceGateway

router = APIRouter(prefix="/docflow", tags=["DocFlow CRM"])
activity_log_service = ActivityLogService(db)
sf_gateway = SalesforceGateway(db)

# Hidden system objects to exclude
HIDDEN_SYSTEM_OBJECTS = {"file", "file_record_link", "file_version"}


@router.get("/crm/objects")
async def get_all_crm_objects(
    current_user: User = Depends(get_current_user)
) -> Dict[str, Any]:
    """
    Get ALL CRM objects (standard + custom + schema builder).
    Unlike trigger-objects, this does NOT filter by email fields.
    
    OPTIMIZED: Uses batch queries and parallel execution
    """
    tenant_id = current_user.tenant_id
    all_objects = []

    # OPTIMIZATION: Fetch tenant_objects and schema_objects in parallel
    import asyncio
    
    tenant_objects_task = db.tenant_objects.find(
        {"tenant_id": tenant_id},
        {"_id": 0, "object_name": 1, "object_label": 1, "fields": 1}
    ).to_list(None)
    
    schema_objects_task = db.schema_objects.find(
        {"tenant_id": tenant_id, "is_active": True},
        {"_id": 0, "id": 1, "api_name": 1, "label": 1}
    ).to_list(None)
    
    tenant_objects, schema_objects = await asyncio.gather(
        tenant_objects_task,
        schema_objects_task,
        return_exceptions=True
    )
    
    # Handle exceptions
    if isinstance(tenant_objects, Exception):
        tenant_objects = []
    if isinstance(schema_objects, Exception):
        schema_objects = []

    # Process tenant_objects
    for obj in tenant_objects:
        obj_name = obj.get("object_name", "").lower()
        if obj_name in HIDDEN_SYSTEM_OBJECTS:
            continue

        fields = obj.get("fields", {})
        field_count = len(fields)

        # Determine object category
        standard_objects = {"lead", "contact", "account", "opportunity", "task", "event", "case"}
        category = "standard" if obj_name in standard_objects else "custom"

        all_objects.append({
            "object_name": obj.get("object_name"),
            "object_label": obj.get("object_label", obj.get("object_name")),
            "field_count": field_count,
            "category": category,
            "source": "crm"
        })

    # OPTIMIZATION: Batch count all schema fields in a single aggregation
    if schema_objects:
        existing_names = {o["object_name"].lower() for o in all_objects}
        new_schema_objects = [obj for obj in schema_objects 
                             if obj.get("api_name", "").lower() not in existing_names]
        
        if new_schema_objects:
            schema_ids = [obj["id"] for obj in new_schema_objects]
            
            # Single aggregation to count fields per object
            field_counts = await db.schema_fields.aggregate([
                {
                    "$match": {
                        "tenant_id": tenant_id,
                        "object_id": {"$in": schema_ids},
                        "is_active": True
                    }
                },
                {
                    "$group": {
                        "_id": "$object_id",
                        "count": {"$sum": 1}
                    }
                }
            ]).to_list(None)
            
            # Build count map for O(1) lookup
            count_map = {item["_id"]: item["count"] for item in field_counts}
            
            for obj in new_schema_objects:
                all_objects.append({
                    "object_name": obj.get("api_name"),
                    "object_label": obj.get("label"),
                    "field_count": count_map.get(obj["id"], 0),
                    "category": "custom",
                    "source": "schema_builder"
                })

    # Sort by label
    all_objects.sort(key=lambda x: x.get("object_label", "").lower())

    return {
        "objects": all_objects,
        "total": len(all_objects)
    }


@router.get("/crm/objects/{object_name}/fields")
async def get_crm_object_fields(
    object_name: str,
    current_user: User = Depends(get_current_user)
) -> Dict[str, Any]:
    """
    Get all fields for a specific CRM object.
    Returns all fields with types, labels, and options.
    """
    tenant_id = current_user.tenant_id
    all_fields = []

    # 1. Check tenant_objects
    obj = await db.tenant_objects.find_one(
        {"tenant_id": tenant_id, "object_name": object_name},
        {"_id": 0}
    )

    if obj:
        fields = obj.get("fields", {})
        for field_name, field_def in fields.items():
            field_type = field_def.get("type", "text").lower()
            field_info = {
                "api_name": field_name,
                "label": field_def.get("label", field_name),
                "type": field_type,
                "required": field_def.get("required", False),
                "is_custom": False
            }

            if field_type in ["picklist", "select"] and field_def.get("options"):
                field_info["options"] = field_def["options"]

            all_fields.append(field_info)

        # Check custom fields from metadata_fields
        custom_metadata = await db.metadata_fields.find_one(
            {"object_name": object_name, "tenant_id": tenant_id},
            {"_id": 0}
        )

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
    else:
        # 2. Check Schema Builder objects
        schema_obj = await db.schema_objects.find_one(
            {"tenant_id": tenant_id, "api_name": object_name.lower(), "is_active": True},
            {"_id": 0}
        )

        if not schema_obj:
            raise HTTPException(status_code=404, detail=f"Object '{object_name}' not found")

        fields = await db.schema_fields.find(
            {"tenant_id": tenant_id, "object_id": schema_obj["id"], "is_active": True},
            {"_id": 0}
        ).sort("sort_order", 1).to_list(None)

        for f in fields:
            if f.get("is_system", False):
                continue

            field_type = f.get("field_type", "text").lower()
            field_info = {
                "api_name": f["api_name"],
                "label": f["label"],
                "type": field_type,
                "required": f.get("is_required", False),
                "is_custom": True
            }

            if field_type == "picklist" and f.get("picklist_values"):
                field_info["options"] = f["picklist_values"]

            all_fields.append(field_info)

    # Sort by label
    all_fields.sort(key=lambda x: x.get("label", "").lower())

    return {
        "object_name": object_name,
        "fields": all_fields,
        "total_fields": len(all_fields)
    }


@router.get("/crm/objects/{object_name}/records")
async def get_crm_records(
    object_name: str,
    search: Optional[str] = None,
    limit: int = 20,
    current_user: User = Depends(get_current_user)
) -> Dict[str, Any]:
    """
    Get CRM records for a specific object. Used for merge field preview and document generation.
    """
    tenant_id = current_user.tenant_id

    query = {
        "object_name": object_name.capitalize(),
        "tenant_id": tenant_id
    }

    if search:
        query["$or"] = [
            {"fields.Name": {"$regex": search, "$options": "i"}},
            {"fields.name": {"$regex": search, "$options": "i"}},
            {"fields.Email": {"$regex": search, "$options": "i"}}
        ]

    records = await db.object_records.find(
        query, {"_id": 0}
    ).sort("created_at", -1).limit(limit).to_list(None)

    # Format records
    formatted = []
    for record in records:
        fields = record.get("fields", {})
        name = fields.get("Name") or fields.get("name") or fields.get("First_Name", "") + " " + fields.get("Last_Name", "")
        formatted.append({
            "id": record.get("id"),
            "name": name.strip(),
            "fields": fields,
            "object_name": object_name
        })

    return {
        "records": formatted,
        "total": len(formatted)
    }


@router.post("/crm/test-connection")
async def test_crm_connection(
    body: Dict[str, Any] = {},
    current_user: User = Depends(get_current_user)
):
    """Test CRM connection — supports internal CRM and provider-based Salesforce."""
    provider = body.get("provider", "internal")
    connection_id = body.get("connection_id")
    try:
        if provider == "salesforce" and connection_id:
            # Use SalesforceGateway with the selected CRM Sync connection
            result = await sf_gateway.test_connection(connection_id, current_user.tenant_id)
            if result["status"] != "connected":
                raise ValueError(result.get("message", "Connection test failed"))
        else:
            # Internal CRM — just verify we can reach the DB
            await db.tenant_objects.count_documents({"tenant_id": current_user.tenant_id})

        await activity_log_service.log_connection_event(
            tenant_id=current_user.tenant_id,
            event_type="connection_tested",
            provider=provider,
            status="connected",
            user_id=current_user.id,
        )
        return {"status": "connected", "provider": provider, "message": f"{provider.capitalize()} connection successful"}

    except Exception as e:
        await activity_log_service.log_connection_event(
            tenant_id=current_user.tenant_id,
            event_type="connection_failed",
            provider=provider,
            status="error",
            error=str(e),
            user_id=current_user.id,
        )
        return {"status": "error", "provider": provider, "message": str(e)}


@router.post("/crm/test-salesforce")
async def test_salesforce_connection(
    body: Dict[str, Any] = {},
    current_user: User = Depends(get_current_user)
):
    """Quick Salesforce connection test via CRM Sync provider."""
    connection_id = body.get("connection_id")
    if not connection_id:
        raise HTTPException(status_code=400, detail="No connection_id provided. Select a Salesforce provider first.")
    try:
        result = await sf_gateway.test_connection(connection_id, current_user.tenant_id)
        if result["status"] == "connected":
            return {"status": "connected", "message": "Salesforce connection successful"}
        raise ValueError(result.get("message", "Connection test failed"))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ============================================================================
# PROVIDER-BASED SALESFORCE ENDPOINTS (DocFlow consumer layer)
# ============================================================================

@router.get("/crm/salesforce-connections")
async def list_salesforce_connections(
    current_user: User = Depends(get_current_user)
):
    """List all Salesforce connections from CRM Sync for this tenant."""
    connections = await sf_gateway.list_connections(current_user.tenant_id)
    return {"connections": connections, "total": len(connections)}


@router.post("/crm/test-provider/{connection_id}")
async def test_provider_connection(
    connection_id: str,
    current_user: User = Depends(get_current_user)
):
    """Test a specific CRM Sync Salesforce connection."""
    try:
        result = await sf_gateway.test_connection(connection_id, current_user.tenant_id)
        await activity_log_service.log_connection_event(
            tenant_id=current_user.tenant_id,
            event_type="provider_tested",
            provider="salesforce",
            status=result["status"],
            user_id=current_user.id,
        )
        return result
    except Exception as e:
        return {"status": "error", "message": str(e)}


@router.get("/crm/provider/{connection_id}/objects")
async def get_provider_objects(
    connection_id: str,
    current_user: User = Depends(get_current_user)
):
    """Fetch Salesforce objects using a CRM Sync connection."""
    try:
        objects = await sf_gateway.get_objects(connection_id, current_user.tenant_id)
        return {"objects": objects, "total": len(objects)}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/crm/provider/{connection_id}/objects/{object_name}/fields")
async def get_provider_object_fields(
    connection_id: str,
    object_name: str,
    current_user: User = Depends(get_current_user)
):
    """Fetch fields for a Salesforce object using a CRM Sync connection."""
    try:
        fields = await sf_gateway.get_fields(connection_id, current_user.tenant_id, object_name)
        return {"fields": fields, "total": len(fields), "object_name": object_name}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
