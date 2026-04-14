from config.settings import settings
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from motor.motor_asyncio import AsyncIOMotorDatabase, AsyncIOMotorClient
from typing import List, Optional
import os
import shutil
from uuid import uuid4
import sys
from datetime import datetime, timezone

# Add backend directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))))

from modules.crm_platform.services.file_service import FileService

# Database setup
mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
mongo_client = AsyncIOMotorClient(mongo_url)
db_name = os.environ.get('DB_NAME', 'crm_db')
db = mongo_client[db_name]

router = APIRouter(prefix="/api/crm-platform/files", tags=["Files"])

# Simple file upload directory for Screen Flows
SCREEN_FLOW_UPLOAD_DIR = os.path.join(settings.STORAGE_BASE_DIR, "uploads", "screen_flow_files")
os.makedirs(SCREEN_FLOW_UPLOAD_DIR, exist_ok=True)


@router.post("/simple-upload")
async def simple_file_upload(file: UploadFile = File(...)):
    """
    Simple file upload for Screen Flows (C2 requirement)
    No tenant/object context required
    """
    # Generate unique filename
    file_id = str(uuid4())
    file_extension = os.path.splitext(file.filename)[1]
    file_name = f"{file_id}{file_extension}"
    file_path = os.path.join(SCREEN_FLOW_UPLOAD_DIR, file_name)
    
    # Save file
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    # Get file size
    file_size = os.path.getsize(file_path)
    
    # Generate URL (relative path for now)
    file_url = f"/api/crm-platform/files/download/{file_id}"
    
    # Store file metadata in DB
    file_record = {
        "id": file_id,
        "file_name": file.filename,
        "file_size": file_size,
        "file_type": file.content_type or "application/octet-stream",
        "file_path": file_path,
        "file_url": file_url,
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
        "source": "screen_flow"
    }
    
    await db.screen_flow_files.insert_one(file_record)
    
    return {
        "id": file_id,
        "file_id": file_id,
        "name": file.filename,
        "size": file_size,
        "type": file.content_type,
        "url": file_url,
        "file_url": file_url
    }


@router.get("/download/{file_id}")
async def download_file(file_id: str):
    """Download a file by ID"""
    from fastapi.responses import FileResponse
    
    file_record = await db.screen_flow_files.find_one({"id": file_id})
    
    if not file_record:
        raise HTTPException(status_code=404, detail="File not found")
    
    file_path = file_record.get("file_path")
    if not file_path or not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found on disk")
    
    return FileResponse(
        path=file_path,
        filename=file_record.get("file_name", "download"),
        media_type=file_record.get("file_type", "application/octet-stream")
    )

@router.post("/upload")
async def upload_file(
    object_type: str = Query(...),
    record_id: str = Query(...),
    tenant_id: str = Query(...),
    file: UploadFile = File(...)
):
    """Upload a file for a record"""
    service = FileService(db)
    
    # Generate unique filename
    file_id = str(uuid4())
    file_extension = os.path.splitext(file.filename)[1]
    file_name = f"{file_id}{file_extension}"
    file_path = os.path.join(service.upload_dir, file_name)
    
    # Save file
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    # Get file size
    file_size = os.path.getsize(file_path)
    
    # Create file record
    file_data = {
        "tenant_id": tenant_id,
        "object_type": object_type,
        "record_id": record_id,
        "file_name": file.filename,
        "file_size": file_size,
        "file_type": file.content_type or "application/octet-stream",
        "file_path": file_path
    }
    
    file_record = await service.create_file_record(file_data)
    return file_record

@router.get("")
async def get_files(
    object_type: str = Query(...),
    record_id: str = Query(...),
    tenant_id: str = Query(...),
    limit: int = Query(50, le=100),
    skip: int = Query(0, ge=0)
):
    """Get files for a record"""
    service = FileService(db)
    files = await service.get_files(object_type, record_id, tenant_id, limit, skip)
    count = await service.count_files(object_type, record_id, tenant_id)
    
    return {
        "files": files,
        "total": count
    }

@router.delete("/{file_id}")
async def delete_file(
    file_id: str,
    tenant_id: str = Query(...)
):
    """Delete a file"""
    service = FileService(db)
    success = await service.delete_file(file_id, tenant_id)
    
    if not success:
        raise HTTPException(status_code=404, detail="File not found")
    
    return {"status": "deleted"}
