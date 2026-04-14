from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from fastapi.responses import FileResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import List, Optional
from datetime import datetime
from uuid import uuid4
import pandas as pd
import os
import sys
from config.settings import settings
from pydantic import BaseModel

# Add backend directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))))

from modules.data_operations.models.job import ExportJob, ExportTemplate, JobStatus

security = HTTPBearer()

# Helper functions to get db and auth at call time
def get_db():
    import server
    return server.db

async def get_auth_user(credentials: HTTPAuthorizationCredentials):
    import server
    return await server.get_current_user(credentials)

router = APIRouter(prefix="/api/data-operations/export", tags=["Export Builder"])

RESULT_DIR = os.path.join(settings.STORAGE_BASE_DIR, "data", "results")
os.makedirs(RESULT_DIR, exist_ok=True)

class CreateExportJobRequest(BaseModel):
    job_name: str
    object_name: str
    selected_fields: List[str]
    filters: Optional[List[dict]] = []
    output_format: str = "csv"

@router.post("/jobs")
async def create_export_job(
    request: CreateExportJobRequest,
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    """Create export job"""
    
    db = get_db()
    current_user = await get_auth_user(credentials)
    
    job_id = str(uuid4())
    job = ExportJob(
        id=job_id,
        tenant_id=current_user.tenant_id,
        job_name=request.job_name,
        object_name=request.object_name,
        selected_fields=request.selected_fields,
        filters=request.filters or [],
        output_format=request.output_format,
        created_by=current_user.email,
        created_at=datetime.utcnow()
    )
    
    await db.export_jobs.insert_one(job.dict())
    return job

@router.post("/jobs/{job_id}/run")
async def run_export(
    job_id: str,
    background_tasks: BackgroundTasks,
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    """Run export job"""
    
    db = get_db()
    current_user = await get_auth_user(credentials)
    
    await db.export_jobs.update_one(
        {"id": job_id},
        {"$set": {
            "status": JobStatus.RUNNING,
            "started_at": datetime.utcnow()
        }}
    )
    
    background_tasks.add_task(run_export_task, job_id)
    return {"message": "Export started", "job_id": job_id}

@router.get("/jobs")
async def list_export_jobs(
    limit: int = 50,
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    """List export jobs"""
    
    db = get_db()
    current_user = await get_auth_user(credentials)
    
    jobs = await db.export_jobs.find(
        {"tenant_id": current_user.tenant_id},
        {'_id': 0}
    ).sort('created_at', -1).limit(limit).to_list(limit)
    
    return jobs

@router.get("/jobs/{job_id}")
async def get_export_job(
    job_id: str,
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    """Get export job details"""
    
    db = get_db()
    current_user = await get_auth_user(credentials)
    
    job = await db.export_jobs.find_one({"id": job_id}, {'_id': 0})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    return job

@router.post("/templates")
async def create_export_template(
    template: ExportTemplate,
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    """Save export template"""
    
    db = get_db()
    current_user = await get_auth_user(credentials)
    
    template.id = str(uuid4())
    template.created_by = current_user.email
    template.created_at = datetime.utcnow()
    template.tenant_id = current_user.tenant_id
    
    await db.export_templates.insert_one(template.dict())
    return template

@router.get("/templates")
async def list_export_templates(
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    """List export templates"""
    
    db = get_db()
    current_user = await get_auth_user(credentials)
    
    templates = await db.export_templates.find(
        {"tenant_id": current_user.tenant_id},
        {'_id': 0}
    ).to_list(100)
    
    return templates

@router.get("/jobs/{job_id}/download")
async def download_export_file(
    job_id: str,
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    """Download export result file"""
    from urllib.parse import quote
    
    db = get_db()
    current_user = await get_auth_user(credentials)
    
    job = await db.export_jobs.find_one({"id": job_id}, {'_id': 0})
    
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    # Verify tenant access
    if job.get('tenant_id') and job.get('tenant_id') != current_user.tenant_id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    if job['status'] != JobStatus.COMPLETED:
        raise HTTPException(status_code=400, detail="Export not completed yet")
    
    file_path = job.get('output_file_path')
    if not file_path:
        raise HTTPException(status_code=404, detail="Export file path not found in job record")
    
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail=f"Export file not found on server: {file_path}")
    
    # Sanitize filename
    safe_job_name = "".join(c for c in job.get('job_name', 'export') if c.isalnum() or c in (' ', '-', '_')).strip()
    safe_job_name = safe_job_name.replace(' ', '_')[:50]
    filename = f"{safe_job_name}_export.csv"
    
    # Log download
    await log_export_audit(job_id, "downloaded", current_user.email, current_user.tenant_id, {})
    
    return FileResponse(
        path=file_path,
        filename=filename,
        media_type='text/csv; charset=utf-8',
        headers={
            'Content-Disposition': f'attachment; filename="{quote(filename)}"',
            'Access-Control-Expose-Headers': 'Content-Disposition'
        }
    )

async def log_export_audit(job_id: str, action: str, user: str, tenant_id: str, details: dict):
    """Log export audit event"""
    db = get_db()
    audit_entry = {
        "id": str(uuid4()),
        "job_id": job_id,
        "job_type": "export",
        "action": action,
        "user": user,
        "tenant_id": tenant_id,
        "timestamp": datetime.utcnow(),
        "details": details
    }
    await db.job_audit_logs.insert_one(audit_entry)

async def run_export_task(job_id: str):
    """Run export in background"""
    db = get_db()
    try:
        job = await db.export_jobs.find_one({"id": job_id})
        if not job:
            return
        
        # Build query with filters for object_records collection
        query = {
            "tenant_id": job['tenant_id'],
            "object_name": job['object_name']
        }
        
        # Apply filters to the data field
        for filter_item in job.get('filters', []):
            field = filter_item.get('field')
            operator = filter_item.get('operator')
            value = filter_item.get('value')
            
            if not field or not operator:
                continue
                
            data_field = f"data.{field}"
            if operator == 'equals':
                query[data_field] = value
            elif operator == 'not_equals':
                query[data_field] = {"$ne": value}
            elif operator == 'contains':
                query[data_field] = {"$regex": value, "$options": "i"}
            elif operator == 'greater_than':
                query[data_field] = {"$gt": value}
            elif operator == 'less_than':
                query[data_field] = {"$lt": value}
            elif operator == 'in':
                # value should be a list
                if isinstance(value, str):
                    value = [v.strip() for v in value.split(',')]
                query[data_field] = {"$in": value}
        
        # Use object_records collection
        collection = db.object_records
        
        # Projection - select only requested fields from data
        projection = {'_id': 0, 'data': 1}
        
        # Fetch records
        records = await collection.find(query, projection).to_list(None)
        
        # Extract data fields and flatten structure
        flattened_records = []
        for record in records:
            data = record.get('data', {})
            flattened_record = {}
            for field in job['selected_fields']:
                flattened_record[field] = data.get(field, '')
            flattened_records.append(flattened_record)
        
        # Convert to DataFrame
        if flattened_records:
            df = pd.DataFrame(flattened_records)
            # Ensure columns are in requested order
            df = df[[col for col in job['selected_fields'] if col in df.columns]]
        else:
            # Empty dataframe with headers
            df = pd.DataFrame(columns=job['selected_fields'])
        
        # Generate output file
        output_filename = f"{job_id}_export.{job['output_format']}"
        output_file = os.path.join(RESULT_DIR, output_filename)
        
        if job['output_format'] == 'csv':
            df.to_csv(output_file, index=False, encoding='utf-8')
        else:
            df.to_excel(output_file, index=False)
        
        # Update job with results
        await db.export_jobs.update_one(
            {"id": job_id},
            {"$set": {
                "status": JobStatus.COMPLETED,
                "completed_at": datetime.utcnow(),
                "output_file_path": output_file,
                "output_filename": output_filename,
                "file_size_bytes": os.path.getsize(output_file),
                "total_records": len(df)
            }}
        )
        
        # Log completion
        await log_export_audit(job_id, "completed", job.get('created_by', 'system'), job['tenant_id'], {
            "total_records": len(df),
            "file_size": os.path.getsize(output_file)
        })
        
    except Exception as e:
        print(f"Export job {job_id} failed: {str(e)}")
        await db.export_jobs.update_one(
            {"id": job_id},
            {"$set": {
                "status": JobStatus.FAILED,
                "completed_at": datetime.utcnow(),
                "error_message": str(e)
            }}
        )
        
        # Log failure
        if job:
            await log_export_audit(job_id, "failed", job.get('created_by', 'system'), job.get('tenant_id'), {
                "error": str(e)
            })
