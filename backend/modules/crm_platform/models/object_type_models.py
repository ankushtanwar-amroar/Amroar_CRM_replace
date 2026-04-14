from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List
from datetime import datetime

class ObjectType(BaseModel):
    """CRM Object Type Registry Model"""
    id: str  # e.g., "lead", "account", "contact"
    label: str  # e.g., "Lead", "Account"
    label_plural: str  # e.g., "Leads", "Accounts"
    prefix: str  # e.g., "LEA", "ACC", "CON"
    api_name: str  # e.g., "lead", "account"
    is_custom: bool = False
    is_active: bool = True
    icon: Optional[str] = None
    description: Optional[str] = None
    
    # Configuration
    enable_activities: bool = True
    enable_files: bool = True
    enable_timeline: bool = True
    
    # Related collections
    collection_name: str  # MongoDB collection name
    
    # Metadata
    tenant_id: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    created_by: Optional[str] = None
    
class GlobalIDConfig(BaseModel):
    """Global ID Configuration"""
    object_type_id: str
    prefix: str
    uuid: str
    public_id: str  # e.g., "LEA-abc123"
    tenant_id: str
    
class RecordIdentifier(BaseModel):
    """Record identifier with global ID"""
    global_id: str  # UUIDv7
    public_id: str  # Prefix + UUID
    object_type: str
    legacy_id: Optional[str] = None  # Original ID if migrating
    tenant_id: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
