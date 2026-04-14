"""
Schema Builder - Fields API
===========================
REST API for managing Schema Fields.
Admin-only access.
"""

from fastapi import APIRouter, HTTPException, Depends, status
from typing import List
import logging

from config.database import db
from modules.auth.api.auth_routes import get_current_user
from shared.models import User

from ..models import (
    SchemaField, SchemaFieldCreate, SchemaFieldUpdate, FieldReorderRequest
)
from ..services import FieldService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/fields", tags=["Schema Builder - Fields"])


def get_field_service():
    """Dependency to get FieldService instance"""
    return FieldService(db)


async def require_admin(current_user: User = Depends(get_current_user)) -> User:
    """Dependency to require admin role"""
    if current_user.role_id not in ['system_administrator', 'admin']:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only administrators can access Schema Builder"
        )
    return current_user


@router.get("/object/{object_id}", response_model=List[SchemaField])
async def list_fields(
    object_id: str,
    include_inactive: bool = False,
    current_user: User = Depends(require_admin),
    service: FieldService = Depends(get_field_service)
):
    """List all fields for an object"""
    return await service.list_fields(
        object_id=object_id,
        tenant_id=current_user.tenant_id,
        include_inactive=include_inactive
    )


@router.post("", response_model=SchemaField, status_code=status.HTTP_201_CREATED)
async def create_field(
    data: SchemaFieldCreate,
    current_user: User = Depends(require_admin),
    service: FieldService = Depends(get_field_service)
):
    """Create a new Schema Field"""
    try:
        return await service.create_field(
            data=data,
            tenant_id=current_user.tenant_id,
            user_id=current_user.id
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/{field_id}", response_model=SchemaField)
async def get_field(
    field_id: str,
    current_user: User = Depends(require_admin),
    service: FieldService = Depends(get_field_service)
):
    """Get a Schema Field by ID"""
    field = await service.get_field(
        field_id=field_id,
        tenant_id=current_user.tenant_id
    )
    if not field:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Field with ID '{field_id}' not found"
        )
    return field


@router.put("/{field_id}", response_model=SchemaField)
async def update_field(
    field_id: str,
    data: SchemaFieldUpdate,
    current_user: User = Depends(require_admin),
    service: FieldService = Depends(get_field_service)
):
    """Update a Schema Field"""
    try:
        result = await service.update_field(
            field_id=field_id,
            data=data,
            tenant_id=current_user.tenant_id
        )
        if not result:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Field with ID '{field_id}' not found"
            )
        return result
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.delete("/{field_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_field(
    field_id: str,
    current_user: User = Depends(require_admin),
    service: FieldService = Depends(get_field_service)
):
    """Delete a Schema Field"""
    try:
        result = await service.delete_field(
            field_id=field_id,
            tenant_id=current_user.tenant_id
        )
        if not result:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Field with ID '{field_id}' not found"
            )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/object/{object_id}/reorder", response_model=List[SchemaField])
async def reorder_fields(
    object_id: str,
    data: FieldReorderRequest,
    current_user: User = Depends(require_admin),
    service: FieldService = Depends(get_field_service)
):
    """Reorder fields for an object"""
    try:
        return await service.reorder_fields(
            object_id=object_id,
            field_ids=data.field_ids,
            tenant_id=current_user.tenant_id
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/{field_id}/has-data")
async def check_field_has_data(
    field_id: str,
    current_user: User = Depends(require_admin),
    service: FieldService = Depends(get_field_service)
):
    """Check if a field has data in records (for type change validation)"""
    has_data = await service.check_field_has_data(
        field_id=field_id,
        tenant_id=current_user.tenant_id
    )
    return {"field_id": field_id, "has_data": has_data}
