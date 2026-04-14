"""
Work Order Service - Business logic for Work Orders
"""
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List
from uuid import uuid4
import random
import string
import logging

from motor.motor_asyncio import AsyncIOMotorDatabase

from ..models.work_order_models import (
    WorkOrderCreate,
    WorkOrderUpdate,
    WorkOrderStatus,
    WorkOrderPriority
)

logger = logging.getLogger(__name__)


class WorkOrderService:
    """Service class for Work Order operations"""
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.collection = db.object_records
    
    async def generate_series_id(self, tenant_id: str, record_id: str) -> str:
        """Generate a unique series_id for Work Order"""
        prefix = "wo"
        uuid_suffix = record_id.split('-')[-1]
        series_id = f"{prefix}-{uuid_suffix}"
        
        # Check for uniqueness
        existing = await self.collection.find_one({
            "tenant_id": tenant_id,
            "object_name": "work_order",
            "series_id": series_id
        })
        
        if existing:
            random_suffix = ''.join(random.choices(string.ascii_lowercase + string.digits, k=4))
            series_id = f"{prefix}-{uuid_suffix}-{random_suffix}"
        
        return series_id
    
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
    
    async def auto_populate_from_case(
        self, 
        tenant_id: str, 
        case_id: str,
        is_return_visit: bool = False
    ) -> Dict[str, Any]:
        """
        Auto-populate Work Order fields from Case record
        
        Business Logic:
        - Status = 'New'
        - Priority = 'High'
        - CaseId = case.Id
        - AccountId = case.AccountId
        - ContactId = case.ContactId
        - Subject = case.Subject + returnVisitFlag
        - Description = case.Description
        - Address from case.Account (billing address)
        """
        populated_data = {
            "status": WorkOrderStatus.NEW.value,
            "priority": WorkOrderPriority.HIGH.value,
        }
        
        case_data = await self.get_case_data(tenant_id, case_id)
        if not case_data:
            logger.warning(f"Case {case_id} not found for auto-population")
            return populated_data
        
        case_record_data = case_data.get("data", {})
        
        # Populate from Case
        populated_data["case_id"] = case_data.get("id") or case_data.get("series_id")
        populated_data["account_id"] = case_record_data.get("account_id") or case_record_data.get("AccountId")
        populated_data["contact_id"] = case_record_data.get("contact_id") or case_record_data.get("ContactId")
        
        # Subject with return visit flag
        subject = case_record_data.get("subject") or case_record_data.get("Subject", "")
        if is_return_visit and subject:
            subject = f"{subject} - Return Visit"
        populated_data["subject"] = subject
        
        # Description
        populated_data["description"] = case_record_data.get("description") or case_record_data.get("Description")
        
        # Get Account for address
        account_id = populated_data.get("account_id")
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
    
    async def create_work_order(
        self,
        tenant_id: str,
        user_id: str,
        data: WorkOrderCreate
    ) -> Dict[str, Any]:
        """
        Create a new Work Order record
        
        Steps:
        1. Generate unique ID and series_id
        2. Auto-populate from Case if source_case_id provided
        3. Merge with provided data (provided data takes precedence)
        4. Save to object_records collection
        """
        record_id = str(uuid4())
        series_id = await self.generate_series_id(tenant_id, record_id)
        now = datetime.now(timezone.utc)
        
        # Start with default data
        work_order_data = {
            "status": WorkOrderStatus.NEW.value,
            "priority": WorkOrderPriority.HIGH.value,
        }
        
        # Auto-populate from Case if provided
        source_case_id = data.source_case_id or data.case_id
        if source_case_id:
            auto_data = await self.auto_populate_from_case(
                tenant_id, 
                source_case_id,
                data.is_return_visit
            )
            work_order_data.update(auto_data)
        
        # Convert Pydantic model to dict and filter None values
        provided_data = data.model_dump(exclude_none=True, exclude={'source_case_id'})
        
        # Convert enums to string values
        for key, value in provided_data.items():
            if hasattr(value, 'value'):
                provided_data[key] = value.value
            elif isinstance(value, datetime):
                provided_data[key] = value.isoformat()
        
        # Handle checklist items
        checklist_items = provided_data.pop('checklist_items', [])
        if checklist_items:
            checklist_items = [
                item.model_dump() if hasattr(item, 'model_dump') else item 
                for item in checklist_items
            ]
        
        # Merge provided data (takes precedence over auto-populated)
        work_order_data.update(provided_data)
        work_order_data['checklist_items'] = checklist_items
        
        # Create the record document
        record = {
            "id": record_id,
            "series_id": series_id,
            "tenant_id": tenant_id,
            "object_name": "work_order",
            "data": work_order_data,
            "owner_id": user_id,
            "created_by": user_id,
            "created_at": now.isoformat(),
            "updated_at": now.isoformat()
        }
        
        await self.collection.insert_one(record)
        
        # Return without _id
        record.pop("_id", None)
        return record
    
    async def get_work_order(
        self,
        tenant_id: str,
        work_order_id: str
    ) -> Optional[Dict[str, Any]]:
        """Get a Work Order by ID or series_id"""
        record = await self.collection.find_one({
            "tenant_id": tenant_id,
            "object_name": "work_order",
            "$or": [
                {"id": work_order_id},
                {"series_id": work_order_id}
            ]
        }, {"_id": 0})
        return record
    
    async def update_work_order(
        self,
        tenant_id: str,
        work_order_id: str,
        data: WorkOrderUpdate
    ) -> Optional[Dict[str, Any]]:
        """Update a Work Order"""
        existing = await self.get_work_order(tenant_id, work_order_id)
        if not existing:
            return None
        
        now = datetime.now(timezone.utc)
        
        # Get update data
        update_data = data.model_dump(exclude_none=True)
        
        # Convert enums to string values
        for key, value in update_data.items():
            if hasattr(value, 'value'):
                update_data[key] = value.value
            elif isinstance(value, datetime):
                update_data[key] = value.isoformat()
        
        # Handle checklist items
        if 'checklist_items' in update_data:
            checklist_items = update_data['checklist_items']
            update_data['checklist_items'] = [
                item.model_dump() if hasattr(item, 'model_dump') else item 
                for item in checklist_items
            ]
        
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
        return await self.get_work_order(tenant_id, work_order_id)
    
    async def delete_work_order(
        self,
        tenant_id: str,
        work_order_id: str
    ) -> bool:
        """Delete a Work Order"""
        result = await self.collection.delete_one({
            "tenant_id": tenant_id,
            "object_name": "work_order",
            "$or": [
                {"id": work_order_id},
                {"series_id": work_order_id}
            ]
        })
        return result.deleted_count > 0
    
    async def list_work_orders(
        self,
        tenant_id: str,
        limit: int = 50,
        skip: int = 0,
        filters: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        """List Work Orders with optional filters"""
        query = {
            "tenant_id": tenant_id,
            "object_name": "work_order"
        }
        
        # Apply filters to data fields
        if filters:
            for key, value in filters.items():
                query[f"data.{key}"] = value
        
        cursor = self.collection.find(query, {"_id": 0})
        cursor = cursor.sort("created_at", -1).skip(skip).limit(limit)
        
        return await cursor.to_list(length=limit)
