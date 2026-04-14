"""
Service Appointment Service - Business logic for Service Appointments
"""
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any, List
from uuid import uuid4
import random
import string
import logging

from motor.motor_asyncio import AsyncIOMotorDatabase

from ..models.service_appointment_models import (
    ServiceAppointmentCreate,
    ServiceAppointmentUpdate,
    ServiceAppointmentStatus
)

logger = logging.getLogger(__name__)


def get_third_working_day(from_date: Optional[datetime] = None) -> datetime:
    """
    Calculate the third working day from a given date
    Skips weekends (Saturday=5, Sunday=6)
    """
    if from_date is None:
        from_date = datetime.now(timezone.utc)
    
    working_days = 0
    current_date = from_date
    
    while working_days < 3:
        current_date += timedelta(days=1)
        # Skip weekends
        if current_date.weekday() < 5:  # Monday=0, Friday=4
            working_days += 1
    
    return current_date


class ServiceAppointmentService:
    """Service class for Service Appointment operations"""
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.collection = db.object_records
    
    async def generate_series_id(self, tenant_id: str, record_id: str) -> str:
        """Generate a unique series_id for Service Appointment"""
        prefix = "sa"
        uuid_suffix = record_id.split('-')[-1]
        series_id = f"{prefix}-{uuid_suffix}"
        
        # Check for uniqueness
        existing = await self.collection.find_one({
            "tenant_id": tenant_id,
            "object_name": "service_appointment",
            "series_id": series_id
        })
        
        if existing:
            random_suffix = ''.join(random.choices(string.ascii_lowercase + string.digits, k=4))
            series_id = f"{prefix}-{uuid_suffix}-{random_suffix}"
        
        return series_id
    
    async def get_work_order_data(self, tenant_id: str, work_order_id: str) -> Optional[Dict[str, Any]]:
        """Fetch Work Order record data for auto-population"""
        wo_record = await self.collection.find_one({
            "tenant_id": tenant_id,
            "object_name": "work_order",
            "$or": [
                {"id": work_order_id},
                {"series_id": work_order_id}
            ]
        }, {"_id": 0})
        return wo_record
    
    async def get_case_data(self, tenant_id: str, case_id: str) -> Optional[Dict[str, Any]]:
        """Fetch Case record data for auto-population"""
        case_record = await self.collection.find_one({
            "tenant_id": tenant_id,
            "object_name": "case",
            "$or": [
                {"id": case_id},
                {"series_id": case_id}
            ]
        }, {"_id": 0})
        return case_record
    
    async def get_account_data(self, tenant_id: str, account_id: str) -> Optional[Dict[str, Any]]:
        """Fetch Account record data for auto-population"""
        account_record = await self.collection.find_one({
            "tenant_id": tenant_id,
            "object_name": "account",
            "$or": [
                {"id": account_id},
                {"series_id": account_id}
            ]
        }, {"_id": 0})
        return account_record
    
    async def auto_populate_from_work_order(
        self,
        tenant_id: str,
        work_order_id: str
    ) -> Dict[str, Any]:
        """
        Auto-populate Service Appointment fields from Work Order
        
        Business Logic:
        - WorkOrderId = work_order.Id
        - WorkTypeId = work_order.WorkTypeId
        - Subject = work_order.Subject
        - Description = work_order.Description
        - Address from Work Order
        - DueDate = work_order.EndDate
        """
        populated_data = {}
        
        wo_data = await self.get_work_order_data(tenant_id, work_order_id)
        if not wo_data:
            logger.warning(f"Work Order {work_order_id} not found for auto-population")
            return populated_data
        
        wo_record_data = wo_data.get("data", {})
        
        # Populate from Work Order
        populated_data["work_order_id"] = wo_data.get("id") or wo_data.get("series_id")
        populated_data["work_type_id"] = wo_record_data.get("work_type_id")
        populated_data["subject"] = wo_record_data.get("subject")
        populated_data["description"] = wo_record_data.get("description")
        
        # Address from Work Order
        populated_data["street"] = wo_record_data.get("street")
        populated_data["city"] = wo_record_data.get("city")
        populated_data["state"] = wo_record_data.get("state")
        populated_data["postal_code"] = wo_record_data.get("postal_code")
        populated_data["country"] = wo_record_data.get("country")
        
        # Due date from Work Order end date
        if wo_record_data.get("end_date"):
            populated_data["due_date"] = wo_record_data.get("end_date")
        
        return populated_data
    
    async def auto_populate_from_case(
        self,
        tenant_id: str,
        case_id: str
    ) -> Dict[str, Any]:
        """
        Auto-populate Service Appointment fields from Case
        
        Business Logic:
        - Equipment_Type = case.Product_Type
        - Subject = case.Subject
        - Description = case.Description
        - Address from case.Account (billing address)
        """
        populated_data = {}
        
        case_data = await self.get_case_data(tenant_id, case_id)
        if not case_data:
            logger.warning(f"Case {case_id} not found for auto-population")
            return populated_data
        
        case_record_data = case_data.get("data", {})
        
        # Equipment type from Case product type
        populated_data["equipment_type"] = (
            case_record_data.get("product_type") or 
            case_record_data.get("product_type__c") or
            case_record_data.get("Product_Type__c")
        )
        
        # Subject and description (if not already set from Work Order)
        populated_data["subject"] = case_record_data.get("subject") or case_record_data.get("Subject")
        populated_data["description"] = case_record_data.get("description") or case_record_data.get("Description")
        
        # Get Account for address
        account_id = case_record_data.get("account_id") or case_record_data.get("AccountId")
        if account_id:
            account_data = await self.get_account_data(tenant_id, account_id)
            if account_data:
                account_record_data = account_data.get("data", {})
                populated_data["street"] = (
                    account_record_data.get("billing_street") or 
                    account_record_data.get("BillingStreet") or
                    account_record_data.get("street")
                )
                populated_data["city"] = (
                    account_record_data.get("billing_city") or 
                    account_record_data.get("BillingCity") or
                    account_record_data.get("city")
                )
                populated_data["state"] = (
                    account_record_data.get("billing_state") or 
                    account_record_data.get("BillingState") or
                    account_record_data.get("state")
                )
                populated_data["postal_code"] = (
                    account_record_data.get("billing_postal_code") or 
                    account_record_data.get("BillingPostalCode") or
                    account_record_data.get("postal_code")
                )
                populated_data["country"] = (
                    account_record_data.get("billing_country") or 
                    account_record_data.get("BillingCountry") or
                    account_record_data.get("country")
                )
        
        return populated_data
    
    async def create_service_appointment(
        self,
        tenant_id: str,
        user_id: str,
        data: ServiceAppointmentCreate
    ) -> Dict[str, Any]:
        """
        Create a new Service Appointment record
        
        Steps:
        1. Generate unique ID and series_id
        2. Calculate earliest_start_time (third working day) if not provided
        3. Auto-populate from Work Order if source_work_order_id provided
        4. Auto-populate from Case if source_case_id provided
        5. Merge with provided data (provided data takes precedence)
        6. Save to object_records collection
        """
        record_id = str(uuid4())
        series_id = await self.generate_series_id(tenant_id, record_id)
        now = datetime.now(timezone.utc)
        
        # Start with default data
        appointment_data = {
            "status": ServiceAppointmentStatus.NONE.value,
        }
        
        # Calculate third working day for earliest_start_time
        third_working_day = get_third_working_day(now)
        appointment_data["earliest_start_time"] = third_working_day.isoformat()
        
        # Auto-populate from Work Order if provided
        source_wo_id = data.source_work_order_id or data.work_order_id
        if source_wo_id:
            wo_auto_data = await self.auto_populate_from_work_order(tenant_id, source_wo_id)
            # Filter out None values
            wo_auto_data = {k: v for k, v in wo_auto_data.items() if v is not None}
            appointment_data.update(wo_auto_data)
        
        # Auto-populate from Case if provided
        if data.source_case_id:
            case_auto_data = await self.auto_populate_from_case(tenant_id, data.source_case_id)
            # Filter out None values and only update if not already set
            for key, value in case_auto_data.items():
                if value is not None and appointment_data.get(key) is None:
                    appointment_data[key] = value
        
        # Convert Pydantic model to dict and filter None values
        provided_data = data.model_dump(
            exclude_none=True, 
            exclude={'source_work_order_id', 'source_case_id'}
        )
        
        # Convert enums to string values and datetime to ISO
        for key, value in provided_data.items():
            if hasattr(value, 'value'):
                provided_data[key] = value.value
            elif isinstance(value, datetime):
                provided_data[key] = value.isoformat()
        
        # Merge provided data (takes precedence over auto-populated)
        appointment_data.update(provided_data)
        
        # Create the record document
        record = {
            "id": record_id,
            "series_id": series_id,
            "tenant_id": tenant_id,
            "object_name": "service_appointment",
            "data": appointment_data,
            "owner_id": user_id,
            "created_by": user_id,
            "created_at": now.isoformat(),
            "updated_at": now.isoformat()
        }
        
        await self.collection.insert_one(record)
        
        # Return without _id
        record.pop("_id", None)
        return record
    
    async def get_service_appointment(
        self,
        tenant_id: str,
        appointment_id: str
    ) -> Optional[Dict[str, Any]]:
        """Get a Service Appointment by ID or series_id"""
        record = await self.collection.find_one({
            "tenant_id": tenant_id,
            "object_name": "service_appointment",
            "$or": [
                {"id": appointment_id},
                {"series_id": appointment_id}
            ]
        }, {"_id": 0})
        return record
    
    async def update_service_appointment(
        self,
        tenant_id: str,
        appointment_id: str,
        data: ServiceAppointmentUpdate
    ) -> Optional[Dict[str, Any]]:
        """Update a Service Appointment"""
        existing = await self.get_service_appointment(tenant_id, appointment_id)
        if not existing:
            return None
        
        now = datetime.now(timezone.utc)
        
        # Get update data
        update_data = data.model_dump(exclude_none=True)
        
        # Convert enums to string values and datetime to ISO
        for key, value in update_data.items():
            if hasattr(value, 'value'):
                update_data[key] = value.value
            elif isinstance(value, datetime):
                update_data[key] = value.isoformat()
        
        # Merge with existing data
        existing_data = existing.get("data", {})
        existing_data.update(update_data)
        
        # Update the record
        await self.collection.update_one(
            {"id": existing["id"]},
            {
                "$set": {
                    "data": existing_data,
                    "updated_at": now.isoformat()
                }
            }
        )
        
        # Return updated record
        return await self.get_service_appointment(tenant_id, appointment_id)
    
    async def delete_service_appointment(
        self,
        tenant_id: str,
        appointment_id: str
    ) -> bool:
        """Delete a Service Appointment"""
        result = await self.collection.delete_one({
            "tenant_id": tenant_id,
            "object_name": "service_appointment",
            "$or": [
                {"id": appointment_id},
                {"series_id": appointment_id}
            ]
        })
        return result.deleted_count > 0
    
    async def list_service_appointments(
        self,
        tenant_id: str,
        limit: int = 50,
        skip: int = 0,
        filters: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        """List Service Appointments with optional filters"""
        query = {
            "tenant_id": tenant_id,
            "object_name": "service_appointment"
        }
        
        # Apply filters to data fields
        if filters:
            for key, value in filters.items():
                query[f"data.{key}"] = value
        
        cursor = self.collection.find(query, {"_id": 0})
        cursor = cursor.sort("created_at", -1).skip(skip).limit(limit)
        
        return await cursor.to_list(length=limit)
    
    async def list_by_work_order(
        self,
        tenant_id: str,
        work_order_id: str,
        limit: int = 50
    ) -> List[Dict[str, Any]]:
        """List Service Appointments for a specific Work Order"""
        return await self.list_service_appointments(
            tenant_id,
            limit=limit,
            filters={"work_order_id": work_order_id}
        )
