from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime, time
from enum import Enum

class DayOfWeek(str, Enum):
    MONDAY = "monday"
    TUESDAY = "tuesday"
    WEDNESDAY = "wednesday"
    THURSDAY = "thursday"
    FRIDAY = "friday"
    SATURDAY = "saturday"
    SUNDAY = "sunday"

class BookingStatus(str, Enum):
    PENDING = "pending"
    CONFIRMED = "confirmed"
    CANCELLED = "cancelled"
    COMPLETED = "completed"
    NO_SHOW = "no_show"

class TimeSlot(BaseModel):
    start: str
    end: str

class AvailabilityRule(BaseModel):
    day: DayOfWeek
    enabled: bool = True
    slots: List[TimeSlot] = []

class Service(BaseModel):
    id: str
    tenant_id: str
    name: str
    description: Optional[str] = None
    duration: int  # in minutes
    price: Optional[float] = None
    color: str = "#3B82F6"
    buffer_time: int = 0  # minutes between bookings
    is_active: bool = True
    custom_fields: List[Dict[str, Any]] = []
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class Staff(BaseModel):
    id: str
    tenant_id: str
    name: str
    email: str
    phone: Optional[str] = None
    avatar: Optional[str] = None
    bio: Optional[str] = None
    services: List[str] = []  # service IDs
    availability: List[AvailabilityRule] = []
    google_calendar_id: Optional[str] = None
    google_refresh_token: Optional[str] = None
    is_active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class Booking(BaseModel):
    id: str
    tenant_id: str
    service_id: str
    staff_id: str
    customer_name: str
    customer_email: str
    customer_phone: Optional[str] = None
    start_time: datetime
    end_time: datetime
    status: BookingStatus = BookingStatus.PENDING
    notes: Optional[str] = None
    custom_data: Dict[str, Any] = {}
    google_event_id: Optional[str] = None
    google_meet_link: Optional[str] = None
    confirmation_sent: bool = False
    reminder_sent: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class ServiceCreate(BaseModel):
    name: str
    description: Optional[str] = None
    duration: int
    price: Optional[float] = None
    color: str = "#3B82F6"
    buffer_time: int = 0
    custom_fields: List[Dict[str, Any]] = []

class ServiceUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    duration: Optional[int] = None
    price: Optional[float] = None
    color: Optional[str] = None
    buffer_time: Optional[int] = None
    is_active: Optional[bool] = None
    custom_fields: Optional[List[Dict[str, Any]]] = None

class StaffCreate(BaseModel):
    name: str
    email: str
    phone: Optional[str] = None
    bio: Optional[str] = None
    services: List[str] = []
    availability: List[AvailabilityRule] = []

class StaffUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    bio: Optional[str] = None
    services: Optional[List[str]] = None
    availability: Optional[List[AvailabilityRule]] = None
    is_active: Optional[bool] = None

class BookingCreate(BaseModel):
    service_id: str
    staff_id: str
    customer_name: str
    customer_email: str
    customer_phone: Optional[str] = None
    start_time: datetime
    notes: Optional[str] = None
    custom_data: Dict[str, Any] = {}

class BookingUpdate(BaseModel):
    start_time: Optional[datetime] = None
    status: Optional[BookingStatus] = None
    notes: Optional[str] = None
