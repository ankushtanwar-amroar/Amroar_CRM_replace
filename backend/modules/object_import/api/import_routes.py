"""
API routes for importing Custom Objects via Excel
"""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
from motor.motor_asyncio import AsyncIOMotorDatabase
from typing import Dict, Any
import io
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))))

from shared.auth import get_current_user_dict
from shared.database import db
from ..excel_object_service import ExcelObjectService

router = APIRouter(prefix="/api/objects", tags=["Object Import"])


async def get_db() -> AsyncIOMotorDatabase:
    """Dependency to get database connection"""
    return db


@router.post("/import/validate")
async def validate_excel_import(
    file: UploadFile = File(...),
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: Dict = Depends(get_current_user_dict)
):
    """
    Validate an Excel file for custom object import.
    Returns parsed data and any validation errors without creating the object.
    Used for preview/confirmation before actual creation.
    """
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant ID required")
    
    # Check file type
    if not file.filename.endswith(('.xlsx', '.xls')):
        raise HTTPException(
            status_code=400, 
            detail="Invalid file type. Please upload an Excel file (.xlsx or .xls)"
        )
    
    # Read file content
    try:
        file_content = await file.read()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error reading file: {str(e)}")
    
    # Parse and validate
    service = ExcelObjectService(db)
    object_data, fields_data, parse_errors = service.parse_excel(file_content)
    
    # If parse errors, return them
    if parse_errors:
        return {
            "valid": False,
            "object": object_data,
            "fields": fields_data,
            "errors": parse_errors,
            "error_count": len(parse_errors)
        }
    
    # Validate against database (check for duplicates, invalid lookups, etc.)
    db_errors = await service.validate_object(tenant_id, object_data, fields_data)
    all_errors = parse_errors + db_errors
    
    return {
        "valid": len(all_errors) == 0,
        "object": object_data,
        "fields": fields_data,
        "field_count": len(fields_data),
        "errors": all_errors,
        "error_count": len(all_errors)
    }


@router.post("/import/create")
async def create_object_from_excel(
    file: UploadFile = File(...),
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: Dict = Depends(get_current_user_dict)
):
    """
    Create a custom object and its fields from an Excel file.
    This is transactional - if any part fails, everything is rolled back.
    """
    tenant_id = current_user.get("tenant_id")
    user_id = current_user.get("user_id")
    
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant ID required")
    
    # Check file type
    if not file.filename.endswith(('.xlsx', '.xls')):
        raise HTTPException(
            status_code=400, 
            detail="Invalid file type. Please upload an Excel file (.xlsx or .xls)"
        )
    
    # Read file content
    try:
        file_content = await file.read()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error reading file: {str(e)}")
    
    # Parse and validate
    service = ExcelObjectService(db)
    object_data, fields_data, parse_errors = service.parse_excel(file_content)
    
    # Check for parse errors
    if parse_errors:
        raise HTTPException(
            status_code=400,
            detail={
                "message": "Excel file contains validation errors",
                "errors": parse_errors
            }
        )
    
    # Validate against database
    db_errors = await service.validate_object(tenant_id, object_data, fields_data)
    if db_errors:
        raise HTTPException(
            status_code=400,
            detail={
                "message": "Validation errors found",
                "errors": db_errors
            }
        )
    
    # Create the object
    try:
        result = await service.create_object_from_excel(
            tenant_id=tenant_id,
            user_id=user_id,
            object_data=object_data,
            fields_data=fields_data
        )
        return {
            "success": True,
            "message": f"Successfully created custom object '{result['object']['object_label']}'",
            "object": result["object"]
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to create object: {str(e)}"
        )


@router.get("/import/template")
async def download_sample_template(
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: Dict = Depends(get_current_user_dict)
):
    """
    Download a sample Excel template for custom object import.
    The template includes example data showing the expected format.
    """
    service = ExcelObjectService(db)
    template_bytes = service.generate_sample_template()
    
    return StreamingResponse(
        io.BytesIO(template_bytes),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": "attachment; filename=custom_object_template.xlsx"
        }
    )
