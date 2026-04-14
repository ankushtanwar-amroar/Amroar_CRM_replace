"""
Field Service API Routes - Work Orders and Service Appointments
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from motor.motor_asyncio import AsyncIOMotorClient
from typing import Optional, Dict, Any, List
from pydantic import BaseModel
import os
import sys
import logging

# Add backend directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))))

from shared.models import User

logger = logging.getLogger(__name__)

# Database setup
mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
mongo_client = AsyncIOMotorClient(mongo_url)
db_name = os.environ.get('DB_NAME', 'crm_db')
db = mongo_client[db_name]

# JWT Auth setup
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import jwt

JWT_SECRET = os.environ.get('JWT_SECRET', 'your-secret-key-here-change-in-production')
ALGORITHM = "HS256"
security = HTTPBearer()


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> User:
    """Verify JWT token and return current user"""
    try:
        token = credentials.credentials
        payload = jwt.decode(token, JWT_SECRET, algorithms=[ALGORITHM])
        user_id: str = payload.get("user_id")
        tenant_id: str = payload.get("tenant_id")
        if user_id is None or tenant_id is None:
            raise HTTPException(status_code=401, detail="Invalid authentication credentials")
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid authentication credentials")
    
    user = await db.users.find_one({"id": user_id, "tenant_id": tenant_id}, {"_id": 0})
    if user is None:
        raise HTTPException(status_code=401, detail="User not found")
    
    return User(**user)


# Import services
from ..services.work_order_service import WorkOrderService
from ..services.service_appointment_service import ServiceAppointmentService

# Import models for request/response
from ..models import (
    WorkOrderCreate,
    WorkOrderUpdate,
    ServiceAppointmentCreate,
    ServiceAppointmentUpdate
)

router = APIRouter(tags=["Field Service"])


# ============================================================================
# WORK ORDER ENDPOINTS
# ============================================================================

class WorkOrderCreateRequest(BaseModel):
    """Request body for creating a Work Order"""
    data: Dict[str, Any]


class WorkOrderUpdateRequest(BaseModel):
    """Request body for updating a Work Order"""
    data: Dict[str, Any]


@router.post("/work-orders")
async def create_work_order(
    request: WorkOrderCreateRequest,
    current_user: User = Depends(get_current_user)
):
    """
    Create a new Work Order
    
    Auto-population rules (when case_id or source_case_id provided):
    - Status = 'New'
    - Priority = 'High'
    - Subject = Case.Subject (+ ' - Return Visit' if is_return_visit)
    - Description = Case.Description
    - Address = Case.Account billing address
    """
    try:
        service = WorkOrderService(db)
        
        # Extract data from request
        data_dict = request.data
        
        # Helper function to get value or None (not empty string)
        def get_value(key, default=None):
            val = data_dict.get(key)
            if val == '' or val is None:
                return default
            return val
        
        # Create WorkOrderCreate model with cleaned data
        work_order_data = WorkOrderCreate(
            subject=get_value('subject', 'New Work Order'),
            status=get_value('status', 'New'),
            priority=get_value('priority', 'High'),
            work_type_id=get_value('work_type_id'),
            service_territory_id=get_value('service_territory_id'),
            case_id=get_value('case_id'),
            account_id=get_value('account_id'),
            contact_id=get_value('contact_id'),
            start_date=get_value('start_date'),
            end_date=get_value('end_date'),
            duration=get_value('duration'),
            duration_type=get_value('duration_type', 'Hours'),
            subtotal=get_value('subtotal'),
            discount=get_value('discount'),
            tax=get_value('tax'),
            grand_total=get_value('grand_total'),
            street=get_value('street'),
            city=get_value('city'),
            state=get_value('state'),
            postal_code=get_value('postal_code'),
            country=get_value('country'),
            description=get_value('description'),
            maintenance_plan_id=get_value('maintenance_plan_id'),
            is_return_visit=data_dict.get('is_return_visit', False),
            source_case_id=get_value('source_case_id'),
            checklist_items=data_dict.get('checklist_items', [])
        )
        
        result = await service.create_work_order(
            tenant_id=current_user.tenant_id,
            user_id=current_user.id,
            data=work_order_data
        )
        
        return result
        
    except Exception as e:
        logger.error(f"Error creating work order: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to create work order: {str(e)}")


@router.get("/work-orders")
async def list_work_orders(
    current_user: User = Depends(get_current_user),
    limit: int = Query(50, le=100),
    skip: int = Query(0, ge=0),
    status: Optional[str] = Query(None),
    priority: Optional[str] = Query(None),
    case_id: Optional[str] = Query(None),
    account_id: Optional[str] = Query(None)
):
    """List Work Orders with optional filters"""
    try:
        service = WorkOrderService(db)
        
        filters = {}
        if status:
            filters['status'] = status
        if priority:
            filters['priority'] = priority
        if case_id:
            filters['case_id'] = case_id
        if account_id:
            filters['account_id'] = account_id
        
        records = await service.list_work_orders(
            tenant_id=current_user.tenant_id,
            limit=limit,
            skip=skip,
            filters=filters if filters else None
        )
        
        return {
            "records": records,
            "total": len(records),
            "limit": limit,
            "skip": skip
        }
        
    except Exception as e:
        logger.error(f"Error listing work orders: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to list work orders: {str(e)}")


@router.get("/work-orders/{work_order_id}")
async def get_work_order(
    work_order_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get a single Work Order by ID"""
    try:
        service = WorkOrderService(db)
        record = await service.get_work_order(
            tenant_id=current_user.tenant_id,
            work_order_id=work_order_id
        )
        
        if not record:
            raise HTTPException(status_code=404, detail="Work Order not found")
        
        return record
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting work order: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get work order: {str(e)}")


@router.patch("/work-orders/{work_order_id}")
async def update_work_order(
    work_order_id: str,
    request: WorkOrderUpdateRequest,
    current_user: User = Depends(get_current_user)
):
    """Update a Work Order"""
    try:
        service = WorkOrderService(db)
        
        # Create update model from request data
        data_dict = request.data
        update_data = WorkOrderUpdate(**data_dict)
        
        result = await service.update_work_order(
            tenant_id=current_user.tenant_id,
            work_order_id=work_order_id,
            data=update_data
        )
        
        if not result:
            raise HTTPException(status_code=404, detail="Work Order not found")
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating work order: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to update work order: {str(e)}")


@router.delete("/work-orders/{work_order_id}")
async def delete_work_order(
    work_order_id: str,
    current_user: User = Depends(get_current_user)
):
    """Delete a Work Order"""
    try:
        service = WorkOrderService(db)
        success = await service.delete_work_order(
            tenant_id=current_user.tenant_id,
            work_order_id=work_order_id
        )
        
        if not success:
            raise HTTPException(status_code=404, detail="Work Order not found")
        
        return {"status": "deleted", "id": work_order_id}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting work order: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to delete work order: {str(e)}")


# ============================================================================
# SERVICE APPOINTMENT ENDPOINTS
# ============================================================================

class ServiceAppointmentCreateRequest(BaseModel):
    """Request body for creating a Service Appointment"""
    data: Dict[str, Any]


class ServiceAppointmentUpdateRequest(BaseModel):
    """Request body for updating a Service Appointment"""
    data: Dict[str, Any]


@router.post("/service-appointments")
async def create_service_appointment(
    request: ServiceAppointmentCreateRequest,
    current_user: User = Depends(get_current_user)
):
    """
    Create a new Service Appointment
    
    Auto-population rules:
    - EarliestStartTime = Third working day from today
    - From Work Order (if work_order_id provided):
      - Subject, Description, Address, WorkTypeId, DueDate
    - From Case (if source_case_id provided):
      - EquipmentType = Case.ProductType
      - Address from Case.Account
    """
    try:
        service = ServiceAppointmentService(db)
        
        # Extract data from request
        data_dict = request.data
        
        # Helper function to get value or None (not empty string)
        def get_value(key, default=None):
            val = data_dict.get(key)
            if val == '' or val is None:
                return default
            return val
        
        # Create ServiceAppointmentCreate model with cleaned data
        appointment_data = ServiceAppointmentCreate(
            subject=get_value('subject', 'New Service Appointment'),
            status=get_value('status', 'None'),
            work_order_id=get_value('work_order_id'),
            work_type_id=get_value('work_type_id'),
            parent_record_id=get_value('parent_record_id'),
            equipment_type=get_value('equipment_type'),
            street=get_value('street'),
            city=get_value('city'),
            state=get_value('state'),
            postal_code=get_value('postal_code'),
            country=get_value('country'),
            earliest_start_time=get_value('earliest_start_time'),
            due_date=get_value('due_date'),
            scheduled_start=get_value('scheduled_start'),
            scheduled_end=get_value('scheduled_end'),
            actual_start=get_value('actual_start'),
            actual_end=get_value('actual_end'),
            actual_duration=get_value('actual_duration'),
            is_bundle=data_dict.get('is_bundle', False),
            bundle_policy=get_value('bundle_policy'),
            description=get_value('description'),
            owner_id=get_value('owner_id'),
            source_work_order_id=get_value('source_work_order_id'),
            source_case_id=get_value('source_case_id')
        )
        
        result = await service.create_service_appointment(
            tenant_id=current_user.tenant_id,
            user_id=current_user.id,
            data=appointment_data
        )
        
        return result
        
    except Exception as e:
        logger.error(f"Error creating service appointment: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to create service appointment: {str(e)}")


@router.get("/service-appointments")
async def list_service_appointments(
    current_user: User = Depends(get_current_user),
    limit: int = Query(50, le=100),
    skip: int = Query(0, ge=0),
    status: Optional[str] = Query(None),
    work_order_id: Optional[str] = Query(None)
):
    """List Service Appointments with optional filters"""
    try:
        service = ServiceAppointmentService(db)
        
        filters = {}
        if status:
            filters['status'] = status
        if work_order_id:
            filters['work_order_id'] = work_order_id
        
        records = await service.list_service_appointments(
            tenant_id=current_user.tenant_id,
            limit=limit,
            skip=skip,
            filters=filters if filters else None
        )
        
        return {
            "records": records,
            "total": len(records),
            "limit": limit,
            "skip": skip
        }
        
    except Exception as e:
        logger.error(f"Error listing service appointments: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to list service appointments: {str(e)}")


@router.get("/service-appointments/{appointment_id}")
async def get_service_appointment(
    appointment_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get a single Service Appointment by ID"""
    try:
        service = ServiceAppointmentService(db)
        record = await service.get_service_appointment(
            tenant_id=current_user.tenant_id,
            appointment_id=appointment_id
        )
        
        if not record:
            raise HTTPException(status_code=404, detail="Service Appointment not found")
        
        return record
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting service appointment: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get service appointment: {str(e)}")


@router.patch("/service-appointments/{appointment_id}")
async def update_service_appointment(
    appointment_id: str,
    request: ServiceAppointmentUpdateRequest,
    current_user: User = Depends(get_current_user)
):
    """Update a Service Appointment"""
    try:
        service = ServiceAppointmentService(db)
        
        # Create update model from request data
        data_dict = request.data
        update_data = ServiceAppointmentUpdate(**data_dict)
        
        result = await service.update_service_appointment(
            tenant_id=current_user.tenant_id,
            appointment_id=appointment_id,
            data=update_data
        )
        
        if not result:
            raise HTTPException(status_code=404, detail="Service Appointment not found")
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating service appointment: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to update service appointment: {str(e)}")


@router.delete("/service-appointments/{appointment_id}")
async def delete_service_appointment(
    appointment_id: str,
    current_user: User = Depends(get_current_user)
):
    """Delete a Service Appointment"""
    try:
        service = ServiceAppointmentService(db)
        success = await service.delete_service_appointment(
            tenant_id=current_user.tenant_id,
            appointment_id=appointment_id
        )
        
        if not success:
            raise HTTPException(status_code=404, detail="Service Appointment not found")
        
        return {"status": "deleted", "id": appointment_id}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting service appointment: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to delete service appointment: {str(e)}")


@router.get("/work-orders/{work_order_id}/service-appointments")
async def get_work_order_service_appointments(
    work_order_id: str,
    current_user: User = Depends(get_current_user),
    limit: int = Query(50, le=100)
):
    """Get all Service Appointments for a Work Order"""
    try:
        service = ServiceAppointmentService(db)
        records = await service.list_by_work_order(
            tenant_id=current_user.tenant_id,
            work_order_id=work_order_id,
            limit=limit
        )
        
        return {
            "records": records,
            "total": len(records),
            "work_order_id": work_order_id
        }
        
    except Exception as e:
        logger.error(f"Error listing service appointments for work order: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to list service appointments: {str(e)}")




# ============================================================================
# FIELD SERVICE SETUP ENDPOINT - Creates required data for current tenant
# ============================================================================

@router.post("/field-service/setup")
async def setup_field_service(
    current_user: User = Depends(get_current_user)
):
    """
    Initialize Field Service data for the current tenant.
    Creates:
    - Technician custom object with sample technicians
    - Work Order custom object with sample work order
    - Service Appointment custom object
    - Assign Technician Flow V2 (metadata-driven)
    
    This endpoint is idempotent - can be called multiple times safely.
    """
    tenant_id = current_user.tenant_id
    user_id = current_user.id
    
    from datetime import datetime, timezone
    import uuid
    
    results = {
        "tenant_id": tenant_id,
        "created": [],
        "existing": []
    }
    
    # 1. Check/Create Technician object
    tech_obj = await db.objects.find_one({"api_name": "technician", "tenant_id": tenant_id})
    if not tech_obj:
        tech_obj_id = str(uuid.uuid4())
        await db.objects.insert_one({
            "id": tech_obj_id,
            "tenant_id": tenant_id,
            "label": "Technician",
            "api_name": "technician",
            "plural_label": "Technicians",
            "description": "Field service technicians",
            "icon": "user",
            "is_custom": True,
            "created_at": datetime.now(timezone.utc),
            "created_by": user_id
        })
        
        # Add fields
        for field in [
            {"label": "Name", "api_name": "name", "field_type": "text", "is_required": True},
            {"label": "Email", "api_name": "email", "field_type": "email"},
            {"label": "Specialization", "api_name": "specialization", "field_type": "text"},
            {"label": "Available", "api_name": "is_available", "field_type": "checkbox"}
        ]:
            await db.fields.insert_one({
                "id": str(uuid.uuid4()),
                "object_id": tech_obj_id,
                "tenant_id": tenant_id,
                **field,
                "created_at": datetime.now(timezone.utc),
                "created_by": user_id
            })
        results["created"].append("Technician object")
    else:
        results["existing"].append("Technician object")
    
    # 2. Create sample technicians
    tech_count = await db.object_records.count_documents({"object_name": "technician", "tenant_id": tenant_id})
    if tech_count == 0:
        for tech in [
            {"name": "John Smith", "email": "john.smith@example.com", "specialization": "HVAC", "is_available": True},
            {"name": "Sarah Johnson", "email": "sarah.j@example.com", "specialization": "Electrical", "is_available": True},
            {"name": "Mike Wilson", "email": "mike.w@example.com", "specialization": "Plumbing", "is_available": True}
        ]:
            tech_id = str(uuid.uuid4())
            await db.object_records.insert_one({
                "id": tech_id,
                "series_id": f"tech-{tech_id[:8]}",
                "tenant_id": tenant_id,
                "object_name": "technician",
                "data": tech,
                "created_at": datetime.now(timezone.utc),
                "created_by": user_id,
                "owner_id": user_id,
                "is_deleted": False
            })
        results["created"].append("3 sample technicians")
    else:
        results["existing"].append(f"{tech_count} technicians")
    
    # 3. Check/Create Work Order object
    wo_obj = await db.objects.find_one({"api_name": "work_order", "tenant_id": tenant_id})
    if not wo_obj:
        wo_obj_id = str(uuid.uuid4())
        await db.objects.insert_one({
            "id": wo_obj_id,
            "tenant_id": tenant_id,
            "label": "Work Order",
            "api_name": "work_order",
            "plural_label": "Work Orders",
            "description": "Field service work orders",
            "icon": "clipboard",
            "is_custom": True,
            "created_at": datetime.now(timezone.utc),
            "created_by": user_id
        })
        
        for field in [
            {"label": "Subject", "api_name": "subject", "field_type": "text", "is_required": True},
            {"label": "Status", "api_name": "status", "field_type": "picklist", "picklist_values": ["New", "In Progress", "Complete"]},
            {"label": "Priority", "api_name": "priority", "field_type": "picklist", "picklist_values": ["Low", "Medium", "High"]},
            {"label": "Description", "api_name": "description", "field_type": "long_text"}
        ]:
            await db.fields.insert_one({
                "id": str(uuid.uuid4()),
                "object_id": wo_obj_id,
                "tenant_id": tenant_id,
                **field,
                "created_at": datetime.now(timezone.utc),
                "created_by": user_id
            })
        results["created"].append("Work Order object")
    else:
        results["existing"].append("Work Order object")
    
    # 4. Create sample work order
    wo_count = await db.object_records.count_documents({"object_name": "work_order", "tenant_id": tenant_id})
    if wo_count == 0:
        wo_id = str(uuid.uuid4())
        await db.object_records.insert_one({
            "id": wo_id,
            "series_id": f"wo-{wo_id[:8]}",
            "tenant_id": tenant_id,
            "object_name": "work_order",
            "data": {
                "subject": "HVAC Repair - Building A",
                "status": "New",
                "priority": "High",
                "description": "Air conditioning unit not cooling properly. Customer reports issue started 2 days ago."
            },
            "created_at": datetime.now(timezone.utc),
            "created_by": user_id,
            "owner_id": user_id,
            "is_deleted": False
        })
        results["created"].append("Sample work order")
        results["work_order_id"] = wo_id
    else:
        wo = await db.object_records.find_one({"object_name": "work_order", "tenant_id": tenant_id}, {"_id": 0, "id": 1, "series_id": 1})
        results["existing"].append(f"{wo_count} work orders")
        if wo:
            results["work_order_id"] = wo.get("id")
            results["work_order_series_id"] = wo.get("series_id")
    
    # 5. Check/Create Service Appointment object
    sa_obj = await db.objects.find_one({"api_name": "service_appointment", "tenant_id": tenant_id})
    if not sa_obj:
        sa_obj_id = str(uuid.uuid4())
        await db.objects.insert_one({
            "id": sa_obj_id,
            "tenant_id": tenant_id,
            "label": "Service Appointment",
            "api_name": "service_appointment",
            "plural_label": "Service Appointments",
            "description": "Field service appointments",
            "icon": "calendar",
            "is_custom": True,
            "created_at": datetime.now(timezone.utc),
            "created_by": user_id
        })
        
        for field in [
            {"label": "Subject", "api_name": "subject", "field_type": "text", "is_required": True},
            {"label": "Work Order", "api_name": "work_order_id", "field_type": "lookup", "lookup_object": "work_order"},
            {"label": "Status", "api_name": "status", "field_type": "picklist", "picklist_values": ["None", "Scheduled", "Dispatched", "In Progress", "Complete"]},
            {"label": "Start Time", "api_name": "start_time", "field_type": "datetime"},
            {"label": "End Time", "api_name": "end_time", "field_type": "datetime"},
            {"label": "Technician", "api_name": "technician_id", "field_type": "lookup", "lookup_object": "technician"}
        ]:
            await db.fields.insert_one({
                "id": str(uuid.uuid4()),
                "object_id": sa_obj_id,
                "tenant_id": tenant_id,
                **field,
                "created_at": datetime.now(timezone.utc),
                "created_by": user_id
            })
        results["created"].append("Service Appointment object")
    else:
        results["existing"].append("Service Appointment object")
    
    # 6. Create Assign Technician Flow V2
    existing_flow = await db.flows.find_one({
        "name": "Assign Technician Flow V2", 
        "tenant_id": tenant_id
    })
    
    if not existing_flow:
        flow_id = str(uuid.uuid4())
        await db.flows.insert_one({
            "id": flow_id,
            "tenant_id": tenant_id,
            "name": "Assign Technician Flow V2",
            "description": "Metadata-driven screen flow to assign a technician to a work order",
            "flow_type": "screen",
            "launch_mode": "record_detail",
            "screen_flow_object": "work_order",
            "status": "active",
            "nodes": [
                {
                    "id": "start_1",
                    "type": "screen_flow_start",
                    "label": "Start",
                    "config": {},
                    "position": {"x": 250, "y": 50}
                },
                {
                    "id": "screen_1",
                    "type": "screen",
                    "label": "Select Technician",
                    "config": {
                        "screenTitle": "Assign Technician",
                        "screenDescription": "Select a technician and schedule the appointment",
                        "fields": [
                            {
                                "id": "field_1",
                                "name": "technician_id",
                                "label": "Select Technician",
                                "type": "RecordLookup",
                                "objectName": "technician",
                                "displayField": "name",
                                "secondaryField": "email",
                                "filters": {"is_available": True},
                                "required": True,
                                "helpText": "Choose an available technician for this work order"
                            },
                            {
                                "id": "field_2",
                                "name": "scheduled_start",
                                "label": "Start Time",
                                "type": "DateTimeWithRecommendations",
                                "linkedEndField": "scheduled_end",
                                "required": True,
                                "helpText": "When should the technician arrive?"
                            },
                            {
                                "id": "field_3",
                                "name": "scheduled_end",
                                "label": "End Time",
                                "type": "DateTime",
                                "required": True,
                                "helpText": "Expected completion time"
                            }
                        ]
                    },
                    "position": {"x": 250, "y": 150}
                },
                {
                    "id": "action_1",
                    "type": "action",
                    "label": "Assign Technician",
                    "config": {
                        "action_type": "assign_technician",
                        "service_appointment_id": "{{service_appointment_id}}",
                        "technician_id": "{{Screen.technician_id}}",
                        "start_time": "{{Screen.scheduled_start}}",
                        "end_time": "{{Screen.scheduled_end}}",
                        "work_type": "Service"
                    },
                    "position": {"x": 250, "y": 350}
                },
                {
                    "id": "end_1",
                    "type": "screen_flow_end",
                    "label": "End",
                    "config": {},
                    "position": {"x": 250, "y": 450}
                }
            ],
            "edges": [
                {"id": "edge_1", "source": "start_1", "target": "screen_1"},
                {"id": "edge_2", "source": "screen_1", "target": "action_1"},
                {"id": "edge_3", "source": "action_1", "target": "end_1"}
            ],
            "variables": [],
            "created_at": datetime.now(timezone.utc),
            "created_by": user_id,
            "updated_at": datetime.now(timezone.utc)
        })
        results["created"].append("Assign Technician Flow V2")
        results["flow_id"] = flow_id
    else:
        results["existing"].append("Assign Technician Flow V2")
        results["flow_id"] = existing_flow.get("id")
    
    return {
        "success": True,
        "message": "Field Service setup complete",
        **results
    }
