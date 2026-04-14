"""
Service Appointment Pydantic Models
"""
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any
from datetime import datetime, timezone
from enum import Enum


class ServiceAppointmentStatus(str, Enum):
    NONE = "None"
    SCHEDULED = "Scheduled"
    DISPATCHED = "Dispatched"
    IN_PROGRESS = "In Progress"
    COMPLETED = "Completed"
    CANCELLED = "Cancelled"
    CANNOT_COMPLETE = "Cannot Complete"


class BundlePolicy(str, Enum):
    ALLOW_BUNDLING = "Allow Bundling"
    DO_NOT_BUNDLE = "Do Not Bundle"
    BUNDLE_ONLY = "Bundle Only"


class ServiceAppointmentBase(BaseModel):
    """Base Service Appointment model with common fields"""
    # General Information
    subject: str
    status: ServiceAppointmentStatus = ServiceAppointmentStatus.NONE
    work_order_id: Optional[str] = None
    work_type_id: Optional[str] = None
    parent_record_id: Optional[str] = None
    equipment_type: Optional[str] = None
    
    # Address
    street: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    postal_code: Optional[str] = None
    country: Optional[str] = None
    
    # Scheduled Times
    earliest_start_time: Optional[datetime] = None
    due_date: Optional[datetime] = None
    scheduled_start: Optional[datetime] = None
    scheduled_end: Optional[datetime] = None
    
    # Actual Times
    actual_start: Optional[datetime] = None
    actual_end: Optional[datetime] = None
    actual_duration: Optional[int] = None  # in minutes
    
    # Bundler Information
    is_bundle: bool = False
    bundle_policy: Optional[BundlePolicy] = None
    
    # System Information
    description: Optional[str] = None
    owner_id: Optional[str] = None


class ServiceAppointmentCreate(ServiceAppointmentBase):
    """Model for creating a Service Appointment"""
    # Optional: pass source identifiers for auto-population
    source_work_order_id: Optional[str] = None
    source_case_id: Optional[str] = None


class ServiceAppointmentUpdate(BaseModel):
    """Model for updating a Service Appointment"""
    subject: Optional[str] = None
    status: Optional[ServiceAppointmentStatus] = None
    work_order_id: Optional[str] = None
    work_type_id: Optional[str] = None
    parent_record_id: Optional[str] = None
    equipment_type: Optional[str] = None
    street: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    postal_code: Optional[str] = None
    country: Optional[str] = None
    earliest_start_time: Optional[datetime] = None
    due_date: Optional[datetime] = None
    scheduled_start: Optional[datetime] = None
    scheduled_end: Optional[datetime] = None
    actual_start: Optional[datetime] = None
    actual_end: Optional[datetime] = None
    actual_duration: Optional[int] = None
    is_bundle: Optional[bool] = None
    bundle_policy: Optional[BundlePolicy] = None
    description: Optional[str] = None
    owner_id: Optional[str] = None


class ServiceAppointment(ServiceAppointmentBase):
    """Full Service Appointment model with all fields"""
    id: str
    series_id: str
    tenant_id: str
    object_name: str = "service_appointment"
    
    # System fields
    created_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    
    class Config:
        use_enum_values = True


class ServiceAppointmentResponse(BaseModel):
    """Response model for Service Appointment API"""
    id: str
    series_id: str
    tenant_id: str
    object_name: str = "service_appointment"
    data: Dict[str, Any]
    created_by: str
    created_at: str
    updated_at: str
    
    class Config:
        extra = "allow"
