from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, BackgroundTasks
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import List, Optional
from datetime import datetime
from uuid import uuid4
import pandas as pd
import io
import os
from config.settings import settings
import sys

# Add backend directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))))

from modules.data_operations.models.job import (
    ImportJob, ImportType, JobStatus, FieldMapping, 
    DuplicateHandling, MatchKeyConfig, ValidationResult, JobAuditLog
)
from modules.data_operations.services.validation_service import ValidationService
from modules.data_operations.services.import_service import ImportService
from modules.data_operations.services.import_service_enhanced import ImportServiceEnhanced

security = HTTPBearer()

# Helper functions to get db and auth at call time
def get_db():
    import server
    return server.db

async def get_auth_user(credentials: HTTPAuthorizationCredentials):
    import server
    return await server.get_current_user(credentials)

router = APIRouter(prefix="/api/data-operations/import", tags=["Import Builder"])

UPLOAD_DIR = os.path.join(settings.STORAGE_BASE_DIR, "data", "uploads")
RESULT_DIR = os.path.join(settings.STORAGE_BASE_DIR, "data", "results")

os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(RESULT_DIR, exist_ok=True)

@router.post("/jobs")
async def create_import_job(
    job_name: str,
    object_name: str,
    import_type: ImportType,
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    """Create a new import job"""
    
    db = get_db()
    current_user = await get_auth_user(credentials)
    job_id = str(uuid4())
    job = ImportJob(
        id=job_id,
        tenant_id=current_user.tenant_id,
        job_name=job_name,
        object_name=object_name,
        import_type=import_type,
        status=JobStatus.DRAFT,
        created_by=current_user.email,
        created_at=datetime.utcnow()
    )
    
    await db.import_jobs.insert_one(job.dict())
    await log_audit(job_id, "import", "created", current_user.email, current_user.tenant_id, {"object": object_name})
    
    return job

@router.post("/jobs/{job_id}/upload")
async def upload_csv(
    job_id: str,
    file: UploadFile = File(...),
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    """Upload CSV file"""
    
    db = get_db()
    job = await db.import_jobs.find_one({"id": job_id})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="Only CSV files supported")
    
    contents = await file.read()
    
    if len(contents) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File exceeds 10MB limit")
    
    try:
        df = pd.read_csv(io.BytesIO(contents))
        
        if len(df) > 50000:
            raise HTTPException(status_code=400, detail="File exceeds 50,000 rows")
        
        if len(df.columns) > 100:
            raise HTTPException(status_code=400, detail="File exceeds 100 columns")
        
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid CSV: {str(e)}")
    
    file_path = os.path.join(UPLOAD_DIR, f"{job_id}_{file.filename}")
    with open(file_path, 'wb') as f:
        f.write(contents)
    
    await db.import_jobs.update_one(
        {"id": job_id},
        {"$set": {"source_file_path": file_path, "total_rows": len(df)}}
    )
    
    return {
        "message": "File uploaded",
        "rows": len(df),
        "columns": list(df.columns),
        "preview": df.head(20).fillna('').to_dict('records')
    }

@router.post("/jobs/{job_id}/map-fields")
async def map_fields(
    job_id: str,
    mappings: List[FieldMapping]
):
    """Set field mappings"""
    
    db = get_db()
    await db.import_jobs.update_one(
        {"id": job_id},
        {"$set": {
            "field_mappings": [m.dict() for m in mappings]
        }}
    )
    
    return {"message": "Mappings saved", "job_id": job_id}

@router.post("/jobs/{job_id}/match-config")
async def set_match_config(
    job_id: str,
    match_config: MatchKeyConfig
):
    """Set match configuration for Update/Upsert"""
    
    db = get_db()
    job = await db.import_jobs.find_one({"id": job_id})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    # Validate that match config is needed
    if job['import_type'] in ['update', 'upsert']:
        if not match_config.fields:
            raise HTTPException(status_code=400, detail="Match fields required for update/upsert")
    
    await db.import_jobs.update_one(
        {"id": job_id},
        {"$set": {"match_config": match_config.dict()}}
    )
    
    return {"message": "Match configuration saved", "job_id": job_id}

@router.post("/jobs/{job_id}/run")
async def run_import(
    job_id: str,
    background_tasks: BackgroundTasks,
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    """Run import job"""
    
    db = get_db()
    current_user = await get_auth_user(credentials)
    
    job = await db.import_jobs.find_one({"id": job_id})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    # Validate match config for update/upsert jobs
    if job['import_type'] in ['update', 'upsert']:
        match_config = job.get('match_config')
        if not match_config or not match_config.get('fields'):
            raise HTTPException(status_code=400, detail="Match configuration is required for update/upsert operations")
    
    await db.import_jobs.update_one(
        {"id": job_id},
        {"$set": {"status": JobStatus.RUNNING, "started_at": datetime.utcnow()}}
    )
    
    background_tasks.add_task(run_import_task, job_id)
    
    await log_audit(job_id, "import", "started", current_user.email, current_user.tenant_id, {})
    
    return {"message": "Import started", "job_id": job_id}

@router.get("/jobs")
async def list_import_jobs(
    limit: int = 50,
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    """List import jobs"""
    
    db = get_db()
    current_user = await get_auth_user(credentials)
    jobs = await db.import_jobs.find(
        {"tenant_id": current_user.tenant_id},
        {'_id': 0}
    ).sort('created_at', -1).limit(limit).to_list(limit)
    
    return jobs

@router.get("/jobs/{job_id}")
async def get_import_job(
    job_id: str
):
    """Get import job details"""
    
    db = get_db()
    job = await db.import_jobs.find_one({"id": job_id}, {'_id': 0})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    return job

async def run_import_task(job_id: str):
    """Background task to run import with enhanced service"""
    try:
        db = get_db()
        job = await db.import_jobs.find_one({"id": job_id})
        
        df = pd.read_csv(job['source_file_path'])
        
        # Use enhanced service for Update/Upsert support
        import_service = ImportServiceEnhanced(db)
        success_rows, error_rows, rollback_data = await import_service.process_import(
            job_id,
            df,
            job['object_name'],
            job['import_type'],
            job['field_mappings'],
            job.get('match_config'),
            job.get('duplicate_handling')
        )
        
        # Save output files
        success_file = os.path.join(RESULT_DIR, f"{job_id}_success.csv")
        error_file = os.path.join(RESULT_DIR, f"{job_id}_errors.csv")
        
        if success_rows:
            pd.DataFrame(success_rows).to_csv(success_file, index=False)
        
        if error_rows:
            pd.DataFrame(error_rows).to_csv(error_file, index=False)
        
        # Determine final status
        if not error_rows:
            status = JobStatus.COMPLETED
        elif success_rows:
            status = JobStatus.COMPLETED_WITH_ERRORS
        else:
            status = JobStatus.FAILED
        
        # Update job with results
        await db.import_jobs.update_one(
            {"id": job_id},
            {"$set": {
                "status": status,
                "completed_at": datetime.utcnow(),
                "processed_rows": len(df),
                "success_count": len(success_rows),
                "error_count": len(error_rows),
                "success_file_path": success_file if success_rows else None,
                "error_file_path": error_file if error_rows else None,
                "is_rollback_available": bool(success_rows and rollback_data),
                "rollback_snapshot": {"data": rollback_data} if rollback_data else None
            }}
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        await db.import_jobs.update_one(
            {"id": job_id},
            {"$set": {
                "status": JobStatus.FAILED,
                "completed_at": datetime.utcnow(),
                "error_message": str(e)
            }}
        )

async def log_audit(job_id, job_type, action, user, tenant_id, details):
    """Create audit log"""
    db = get_db()
    log = JobAuditLog(
        id=str(uuid4()),
        job_id=job_id,
        job_type=job_type,
        action=action,
        performed_by=user,
        performed_at=datetime.utcnow(),
        details=details,
        tenant_id=tenant_id
    )
    await db.job_audit_logs.insert_one(log.dict())

@router.post("/jobs/{job_id}/rollback")
async def rollback_job(
    job_id: str,
    rollback_reason: str,
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    """Rollback an import job"""
    
    db = get_db()
    current_user = await get_auth_user(credentials)
    
    job = await db.import_jobs.find_one({"id": job_id})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    if not job.get('is_rollback_available'):
        raise HTTPException(status_code=400, detail="Rollback not available for this job")
    
    if job.get('status') == JobStatus.ROLLED_BACK:
        raise HTTPException(status_code=400, detail="Job already rolled back")
    
    # Perform rollback
    rollback_data = job.get('rollback_snapshot', {}).get('data', [])
    if not rollback_data:
        raise HTTPException(status_code=400, detail="No rollback data available")
    
    import_service = ImportServiceEnhanced(db)
    rollback_results = await import_service.rollback_import(
        rollback_data,
        rollback_reason,
        current_user.email
    )
    
    # Update job status
    await db.import_jobs.update_one(
        {"id": job_id},
        {"$set": {
            "status": JobStatus.ROLLED_BACK,
            "rolled_back_at": datetime.utcnow(),
            "rolled_back_by": current_user.email,
            "rollback_reason": rollback_reason,
            "rollback_results": rollback_results
        }}
    )
    
    await log_audit(
        job_id,
        "import",
        "rolled_back",
        current_user.email,
        current_user.tenant_id,
        {"reason": rollback_reason, "results": rollback_results}
    )
    
    return {
        "message": "Rollback completed",
        "results": rollback_results
    }

@router.post("/jobs/{job_id}/retry")
async def retry_failed_rows(
    job_id: str,
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    """Retry failed rows from a completed job"""
    
    db = get_db()
    current_user = await get_auth_user(credentials)
    
    parent_job = await db.import_jobs.find_one({"id": job_id})
    if not parent_job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    if parent_job.get('error_count', 0) == 0:
        raise HTTPException(status_code=400, detail="No failed rows to retry")
    
    # Load error CSV
    error_file_path = parent_job.get('error_file_path')
    if not error_file_path or not os.path.exists(error_file_path):
        raise HTTPException(status_code=404, detail="Error file not found")
    
    # Create new job for retry
    retry_job_id = str(uuid4())
    retry_job = ImportJob(
        id=retry_job_id,
        tenant_id=current_user.tenant_id,
        job_name=f"{parent_job['job_name']} (Retry)",
        object_name=parent_job['object_name'],
        import_type=ImportType(parent_job['import_type']),
        status=JobStatus.DRAFT,
        created_by=current_user.email,
        created_at=datetime.utcnow(),
        parent_job_id=job_id,
        field_mappings=parent_job.get('field_mappings', []),
        match_config=parent_job.get('match_config'),
        duplicate_handling=parent_job.get('duplicate_handling')
    )
    
    await db.import_jobs.insert_one(retry_job.dict())
    
    # Copy error file as source for retry job
    retry_source_path = os.path.join(UPLOAD_DIR, f"{retry_job_id}_retry.csv")
    
    # Read error CSV and remove error columns before re-importing
    df_errors = pd.read_csv(error_file_path)
    # Remove error columns
    error_cols = [col for col in df_errors.columns if col.startswith('error')]
    df_clean = df_errors.drop(columns=error_cols, errors='ignore')
    df_clean.to_csv(retry_source_path, index=False)
    
    await db.import_jobs.update_one(
        {"id": retry_job_id},
        {"$set": {
            "source_file_path": retry_source_path,
            "total_rows": len(df_clean)
        }}
    )
    
    await log_audit(
        retry_job_id,
        "import",
        "created_retry",
        current_user.email,
        current_user.tenant_id,
        {"parent_job_id": job_id}
    )
    
    return {
        "message": "Retry job created",
        "retry_job_id": retry_job_id,
        "rows_to_retry": len(df_clean)
    }

@router.post("/jobs/{job_id}/validate")
async def validate_import(
    job_id: str,
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    """
    Validate import data before running (Dry Run).
    Checks for:
    - Missing required fields
    - Invalid picklist values
    - Invalid date/datetime format
    - Invalid number format
    - Max length exceeded
    - Lookup reference not found / ambiguous (for Update/Upsert)
    """
    
    db = get_db()
    current_user = await get_auth_user(credentials)
    
    job = await db.import_jobs.find_one({"id": job_id})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    if not job.get('source_file_path') or not os.path.exists(job['source_file_path']):
        raise HTTPException(status_code=400, detail="No CSV file uploaded")
    
    if not job.get('field_mappings'):
        raise HTTPException(status_code=400, detail="Field mappings not configured")
    
    # Load CSV
    df = pd.read_csv(job['source_file_path'])
    
    # Initialize validation service
    validation_service = ValidationService(db)
    
    # Run row-level validation
    errors, warnings = await validation_service.validate_rows(
        df, 
        job['object_name'], 
        job['import_type'], 
        job['field_mappings']
    )
    
    # For Update/Upsert, validate match keys
    match_errors = []
    if job['import_type'] in ['update', 'upsert']:
        match_config = job.get('match_config')
        if match_config and match_config.get('fields'):
            match_errors = await validate_match_keys(
                db,
                df,
                job['object_name'],
                job['import_type'],
                match_config,
                job['field_mappings']
            )
    
    # Combine all errors
    all_errors = errors + match_errors
    
    # Generate validation summary
    total_rows = len(df)
    invalid_rows = len(set(e.get('row') for e in all_errors if e.get('row')))
    valid_rows = total_rows - invalid_rows
    
    # Save validation preview CSV if there are errors
    validation_preview_path = None
    if all_errors:
        validation_preview_path = os.path.join(RESULT_DIR, f"{job_id}_validation_errors.csv")
        
        # Create detailed error preview with original row data
        error_preview = []
        for error in all_errors:
            row_num = error.get('row', 0)
            row_data = {}
            if row_num >= 2 and row_num <= len(df) + 1:
                raw_row = df.iloc[row_num - 2].to_dict()
                # Replace NaN values with empty string
                row_data = {k: ('' if pd.isna(v) else v) for k, v in raw_row.items()}
            error_preview.append({
                **row_data,
                'errorRow': row_num,
                'errorField': error.get('field', ''),
                'errorCode': error.get('error_code', ''),
                'errorMessage': error.get('error_message', ''),
                'errorValue': str(error.get('value', '')) if error.get('value') is not None else ''
            })
        
        pd.DataFrame(error_preview).to_csv(validation_preview_path, index=False)
    
    # Group errors by type
    error_summary = {}
    for error in all_errors:
        code = error.get('error_code', 'UNKNOWN')
        if code not in error_summary:
            error_summary[code] = 0
        error_summary[code] += 1
    
    # Update job with validation results
    validation_result = {
        'validated_at': datetime.utcnow().isoformat(),
        'validated_by': current_user.email,
        'total_rows': total_rows,
        'valid_rows': valid_rows,
        'invalid_rows': invalid_rows,
        'error_count': len(all_errors),
        'error_summary': error_summary,
        'validation_preview_path': validation_preview_path,
        'is_valid': len(all_errors) == 0
    }
    
    await db.import_jobs.update_one(
        {"id": job_id},
        {"$set": {"validation_result": validation_result}}
    )
    
    await log_audit(
        job_id,
        "import",
        "validated",
        current_user.email,
        current_user.tenant_id,
        {"valid": valid_rows, "invalid": invalid_rows}
    )
    
    return {
        "job_id": job_id,
        "validation_result": validation_result,
        "errors_preview": [
            {**e, 'value': str(e.get('value', '')) if e.get('value') is not None and not (isinstance(e.get('value'), float) and pd.isna(e.get('value'))) else ''} 
            for e in all_errors[:50]
        ] if all_errors else []
    }

async def validate_match_keys(db, df, object_name, import_type, match_config, field_mappings):
    """Validate match keys for Update/Upsert operations"""
    errors = []
    match_mode = match_config.get('mode', 'id')
    match_fields = match_config.get('fields', [])
    
    # Build CSV to field map
    csv_to_field = {m['csv_column']: m['field_name'] for m in field_mappings}
    
    # Get the collection name
    collection_name = object_name.lower()
    if not collection_name.endswith('s'):
        collection_name += 's'
    
    for idx, row in df.iterrows():
        row_num = idx + 2  # CSV row number
        
        if match_mode == 'id':
            # Match by Id
            id_col = None
            for col in ['Id', 'id', 'ID', '_id']:
                if col in df.columns:
                    id_col = col
                    break
            
            if id_col:
                record_id = row.get(id_col)
                if pd.isna(record_id) or str(record_id).strip() == '':
                    if import_type == 'update':
                        errors.append({
                            'row': row_num,
                            'field': id_col,
                            'error_code': 'MATCH_KEY_MISSING',
                            'error_message': 'Record ID is required for update'
                        })
                else:
                    # Check if record exists
                    record = await db[collection_name].find_one({
                        "$or": [
                            {"id": str(record_id)},
                            {"_id": str(record_id)}
                        ]
                    })
                    if not record and import_type == 'update':
                        errors.append({
                            'row': row_num,
                            'field': id_col,
                            'value': record_id,
                            'error_code': 'RECORD_NOT_FOUND',
                            'error_message': f'No record found with ID: {record_id}'
                        })
        else:
            # Match by field(s)
            query = {}
            missing_fields = []
            
            for match_field in match_fields:
                value = row.get(match_field)
                if pd.isna(value) or str(value).strip() == '':
                    missing_fields.append(match_field)
                else:
                    # Map CSV column to field name if possible
                    field_name = csv_to_field.get(match_field, match_field)
                    query[field_name] = str(value).strip()
            
            if missing_fields:
                if import_type == 'update':
                    errors.append({
                        'row': row_num,
                        'field': ', '.join(missing_fields),
                        'error_code': 'MATCH_KEY_MISSING',
                        'error_message': f'Match key field(s) missing: {", ".join(missing_fields)}'
                    })
            elif query:
                # Check for matching records
                count = await db[collection_name].count_documents(query)
                
                if count == 0 and import_type == 'update':
                    errors.append({
                        'row': row_num,
                        'field': ', '.join(match_fields),
                        'value': str(query),
                        'error_code': 'RECORD_NOT_FOUND',
                        'error_message': f'No matching record found for: {query}'
                    })
                elif count > 1:
                    errors.append({
                        'row': row_num,
                        'field': ', '.join(match_fields),
                        'value': str(query),
                        'error_code': 'AMBIGUOUS_MATCH',
                        'error_message': f'Multiple records ({count}) match criteria: {query}'
                    })
    
    return errors

@router.get("/jobs/{job_id}/download/{file_type}")
async def download_file(
    job_id: str,
    file_type: str,
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    """Download import result files (success, error, validation_preview)"""
    from fastapi.responses import FileResponse
    from urllib.parse import quote
    
    db = get_db()
    current_user = await get_auth_user(credentials)
    
    job = await db.import_jobs.find_one({"id": job_id})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    # Verify tenant access
    if job.get('tenant_id') and job.get('tenant_id') != current_user.tenant_id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    file_path = None
    filename = None
    
    # Sanitize job name for filename
    safe_job_name = "".join(c for c in job.get('job_name', 'export') if c.isalnum() or c in (' ', '-', '_')).strip()
    safe_job_name = safe_job_name.replace(' ', '_')[:50]  # Limit length
    
    if file_type == 'success':
        file_path = job.get('success_file_path')
        filename = f"{safe_job_name}_success.csv"
    elif file_type == 'error':
        file_path = job.get('error_file_path')
        filename = f"{safe_job_name}_errors.csv"
    elif file_type == 'validation':
        validation_result = job.get('validation_result', {})
        file_path = validation_result.get('validation_preview_path')
        filename = f"{safe_job_name}_validation_errors.csv"
    else:
        raise HTTPException(status_code=400, detail="Invalid file type. Use: success, error, or validation")
    
    if not file_path:
        raise HTTPException(status_code=404, detail=f"{file_type.capitalize()} file path not found in job record")
    
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail=f"{file_type.capitalize()} file not found on server: {file_path}")
    
    # Return file with proper headers for browser download
    return FileResponse(
        path=file_path,
        filename=filename,
        media_type='text/csv; charset=utf-8',
        headers={
            'Content-Disposition': f'attachment; filename="{quote(filename)}"',
            'Access-Control-Expose-Headers': 'Content-Disposition'
        }
    )
