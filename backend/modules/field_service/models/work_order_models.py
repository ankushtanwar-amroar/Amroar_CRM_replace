"""
Work Order Pydantic Models
"""
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
from enum import Enum


class WorkOrderStatus(str, Enum):
    NEW = "New"
    ASSIGNED = "Assigned"
    IN_PROGRESS = "In Progress"
    ON_HOLD = "On Hold"
    COMPLETED = "Completed"
    CANCELLED = "Cancelled"


class WorkOrderPriority(str, Enum):
    LOW = "Low"
    MEDIUM = "Medium"
    HIGH = "High"
    CRITICAL = "Critical"


class DurationType(str, Enum):
    MINUTES = "Minutes"
    HOURS = "Hours"
    DAYS = "Days"


class ChecklistItem(BaseModel):
    """Checklist item for work orders"""
    id: str
    label: str
    is_completed: bool = False
    completed_at: Optional[datetime] = None
    completed_by: Optional[str] = None


class WorkOrderBase(BaseModel):
    """Base Work Order model with common fields"""
    # Information
    subject: str
    status: WorkOrderStatus = WorkOrderStatus.NEW
    priority: WorkOrderPriority = WorkOrderPriority.HIGH
    work_type_id: Optional[str] = None
    service_territory_id: Optional[str] = None
    
    # Related Records
    case_id: Optional[str] = None
    account_id: Optional[str] = None
    contact_id: Optional[str] = None
    
    # Scheduling
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    duration: Optional[float] = None
    duration_type: DurationType = DurationType.HOURS
    
    # Pricing
    subtotal: Optional[float] = None
    discount: Optional[float] = None
    tax: Optional[float] = None
    grand_total: Optional[float] = None
    
    # Address
    street: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    postal_code: Optional[str] = None
    country: Optional[str] = None
    
    # Description
    description: Optional[str] = None
    
    # Maintenance Plan
    maintenance_plan_id: Optional[str] = None
    is_return_visit: bool = False


class WorkOrderCreate(WorkOrderBase):
    """Model for creating a Work Order"""
    # Optional: pass source_case_id for auto-population
    source_case_id: Optional[str] = None
    checklist_items: Optional[List[ChecklistItem]] = []


class WorkOrderUpdate(BaseModel):
    """Model for updating a Work Order"""
    subject: Optional[str] = None
    status: Optional[WorkOrderStatus] = None
    priority: Optional[WorkOrderPriority] = None
    work_type_id: Optional[str] = None
    service_territory_id: Optional[str] = None
    case_id: Optional[str] = None
    account_id: Optional[str] = None
    contact_id: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    duration: Optional[float] = None
    duration_type: Optional[DurationType] = None
    subtotal: Optional[float] = None
    discount: Optional[float] = None
    tax: Optional[float] = None
    grand_total: Optional[float] = None
    street: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    postal_code: Optional[str] = None
    country: Optional[str] = None
    description: Optional[str] = None
    maintenance_plan_id: Optional[str] = None
    is_return_visit: Optional[bool] = None
    checklist_items: Optional[List[ChecklistItem]] = None


class WorkOrder(WorkOrderBase):
    """Full Work Order model with all fields"""
    id: str
    series_id: str
    tenant_id: str
    object_name: str = "work_order"
    
    # Checklist
    checklist_items: List[ChecklistItem] = []
    
    # System fields
    owner_id: Optional[str] = None
    created_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    
    class Config:
        use_enum_values = True


class WorkOrderResponse(BaseModel):
    """Response model for Work Order API"""
    id: str
    series_id: str
    tenant_id: str
    object_name: str = "work_order"
    data: Dict[str, Any]
    created_by: str
    created_at: str
    updated_at: str
    
    class Config:
        extra = "allow"
