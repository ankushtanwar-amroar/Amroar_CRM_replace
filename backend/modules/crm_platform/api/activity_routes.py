from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from motor.motor_asyncio import AsyncIOMotorDatabase, AsyncIOMotorClient
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime
import os
import sys

# Add backend directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))))

from modules.crm_platform.services.activity_service import ActivityService
from modules.crm_platform.models.activity_models import ActivityType, ActivityStatus

# Database setup
mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
mongo_client = AsyncIOMotorClient(mongo_url)
db_name = os.environ.get('DB_NAME', 'crm_db')
db = mongo_client[db_name]

router = APIRouter(prefix="/api/crm-platform/activities", tags=["Activities"])

class CreateActivityRequest(BaseModel):
    tenant_id: str
    object_type: str
    record_id: str
    type: ActivityType
    status: ActivityStatus = ActivityStatus.PLANNED
    subject: str
    description: Optional[str] = None
    activity_date: datetime
    due_date: Optional[datetime] = None
    assigned_to: Optional[str] = None
    created_by: Optional[str] = None

class UpdateActivityRequest(BaseModel):
    status: Optional[ActivityStatus] = None
    subject: Optional[str] = None
    description: Optional[str] = None
    activity_date: Optional[datetime] = None
    due_date: Optional[datetime] = None
    completed_date: Optional[datetime] = None

@router.post("")
async def create_activity(request: CreateActivityRequest):
    """Create a new activity"""
    service = ActivityService(db)
    activity = await service.create_activity(request.dict())
    return activity

@router.get("")
async def get_activities(
    object_type: str = Query(...),
    record_id: str = Query(...),
    tenant_id: str = Query(...),
    activity_types: Optional[str] = Query(None),
    limit: int = Query(50, le=100),
    skip: int = Query(0, ge=0)
):
    """Get activities for a record"""
    service = ActivityService(db)
    
    filters = None
    if activity_types:
        from modules.crm_platform.models.activity_models import TimelineFilter
        filters = TimelineFilter(activity_types=[ActivityType(t) for t in activity_types.split(',')])
    
    activities = await service.get_activities(
        object_type, record_id, tenant_id, filters, limit, skip
    )
    return {"activities": activities}

@router.get("/summary")
async def get_activity_summary(
    object_type: str = Query(...),
    record_id: str = Query(...),
    tenant_id: str = Query(...)
):
    """Get activity summary for a record"""
    service = ActivityService(db)
    summary = await service.get_activity_summary(object_type, record_id, tenant_id)
    return summary

@router.patch("/{activity_id}")
async def update_activity(
    activity_id: str,
    request: UpdateActivityRequest,
    tenant_id: str = Query(...)
):
    """Update an activity"""
    service = ActivityService(db)
    updates = {k: v for k, v in request.dict().items() if v is not None}
    success = await service.update_activity(activity_id, tenant_id, updates)
    
    if not success:
        raise HTTPException(status_code=404, detail="Activity not found")
    
    return {"status": "updated"}

@router.delete("/{activity_id}")
async def delete_activity(
    activity_id: str,
    tenant_id: str = Query(...)
):
    """Delete an activity"""
    service = ActivityService(db)
    success = await service.delete_activity(activity_id, tenant_id)
    
    if not success:
        raise HTTPException(status_code=404, detail="Activity not found")
    
    return {"status": "deleted"}
