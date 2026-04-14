from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime

class FileAttachment(BaseModel):
    """File attachment for records"""
    id: str
    tenant_id: str
    
    # Related record
    object_type: str
    record_id: str
    
    # File details
    file_name: str
    file_size: int  # bytes
    file_type: str  # MIME type
    file_path: str  # Storage path
    
    # Optional metadata
    title: Optional[str] = None
    description: Optional[str] = None
    
    # Upload info
    uploaded_by: Optional[str] = None
    uploaded_at: datetime = Field(default_factory=datetime.utcnow)
    
    # Timestamps
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
