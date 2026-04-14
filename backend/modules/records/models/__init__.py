"""Records models"""
from pydantic import BaseModel
from typing import Dict, Any, Optional


class RecordCreate(BaseModel):
    data: Dict[str, Any]
    record_type_id: Optional[str] = None


class RecordUpdate(BaseModel):
    data: Dict[str, Any]
    record_type_id: Optional[str] = None
