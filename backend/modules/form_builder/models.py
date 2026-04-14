"""
Form Builder - Pydantic Models and Utilities
Contains data models and helper functions used across form builder routes.
"""
from typing import List, Optional
from datetime import datetime, timezone
from pydantic import BaseModel, Field
import uuid
import os
import sys

# Add backend to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from shared.database import db
from shared.auth import get_current_user
from shared.models import User


async def generate_series_id(tenant_id: str, object_name: str, record_id: str) -> str:
    """Generate series_id using UUID-based format: prefix-{last_part_of_uuid}"""
    import random
    import string
    
    prefix_map = {
        "lead": "led", "task": "tsk", "contact": "con", "event": "evt",
        "opportunity": "opp", "account": "acc", "note": "not", "call": "cal"
    }
    
    prefix = prefix_map.get(object_name.lower(), "rec")
    uuid_suffix = record_id.split('-')[-1]
    series_id = f"{prefix}-{uuid_suffix}"
    
    existing = await db.object_records.find_one({
        "tenant_id": tenant_id,
        "object_name": object_name,
        "series_id": series_id
    })
    
    if existing:
        random_suffix = ''.join(random.choices(string.ascii_lowercase + string.digits, k=4))
        series_id = f"{prefix}-{uuid_suffix}-{random_suffix}"
    
    return series_id


def parse_from_mongo(doc: dict) -> dict:
    """Helper function to remove MongoDB _id field"""
    if doc and "_id" in doc:
        del doc["_id"]
    return doc


# ============= Pydantic Models =============

class PropertyMapping(BaseModel):
    """Mapping between form field and CRM property"""
    property_id: str
    property_label: str
    property_type: str
    confidence: Optional[float] = None
    is_auto_mapped: bool = False


class FormField(BaseModel):
    """Single form field definition"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    type: str  # text, email, phone, number, textarea, select, checkbox, radio, date
    label: str
    placeholder: Optional[str] = None
    required: bool = False
    options: Optional[List[str]] = None
    validation: Optional[dict] = None
    order: int = 0
    maxRating: Optional[int] = None
    columns: Optional[int] = None
    gridFields: Optional[List] = None
    crm_mapping: Optional[PropertyMapping] = None


class FormStep(BaseModel):
    """Multi-step form step definition"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    fields: List[FormField] = []


class FormSettings(BaseModel):
    """Form settings and configuration"""
    submit_button_text: str = "Submit"
    show_thank_you: bool = True
    thank_you_message: str = "Thank you for your submission!"
    redirect_url: Optional[str] = None
    allow_multiple_submissions: bool = True
    collect_email: bool = True
    crm_mapping_enabled: bool = True
    theme: Optional[dict] = None
    layout: Optional[str] = "1-column"


class Form(BaseModel):
    """Complete form definition"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    user_id: str
    title: str
    description: Optional[str] = None
    fields: List[FormField] = []
    steps: Optional[List[FormStep]] = None
    settings: FormSettings = Field(default_factory=FormSettings)
    is_published: bool = False
    public_url: Optional[str] = None
    crm_module: Optional[str] = None
    enable_crm_mapping: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    submission_count: int = 0


class FormCreate(BaseModel):
    """Request model for creating a form"""
    title: str
    description: Optional[str] = None
    fields: Optional[List[FormField]] = []
    steps: Optional[List[FormStep]] = None
    settings: Optional[FormSettings] = None
    crm_module: Optional[str] = None
    enable_crm_mapping: Optional[bool] = False


class FormUpdate(BaseModel):
    """Request model for updating a form"""
    title: Optional[str] = None
    description: Optional[str] = None
    fields: Optional[List[FormField]] = None
    steps: Optional[List[FormStep]] = None
    settings: Optional[FormSettings] = None
    crm_module: Optional[str] = None
    enable_crm_mapping: Optional[bool] = None


class FormSubmission(BaseModel):
    """Form submission record"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    form_id: str
    tenant_id: str
    data: dict
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    submitted_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class AIFormRequest(BaseModel):
    """Request model for AI form generation"""
    prompt: str
    existing_fields: Optional[List[FormField]] = None
    current_steps: Optional[List[dict]] = []


class AIVoiceRequest(BaseModel):
    """Request model for AI voice processing"""
    audio_base64: str
    existing_form: Optional[dict] = None
