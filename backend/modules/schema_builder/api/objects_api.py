"""
Schema Builder - Objects API
============================
REST API for managing Schema Objects.
Admin-only access.
"""

from fastapi import APIRouter, HTTPException, Depends, status
from typing import List
import logging

from config.database import db
from modules.auth.api.auth_routes import get_current_user
from shared.models import User

from ..models import (
    SchemaObject, SchemaObjectCreate, SchemaObjectUpdate,
    SchemaObjectResponse, SchemaObjectListResponse
)
from ..services import ObjectService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/objects", tags=["Schema Builder - Objects"])


def get_object_service():
    """Dependency to get ObjectService instance"""
    return ObjectService(db)


async def require_admin(current_user: User = Depends(get_current_user)) -> User:
    """Dependency to require admin role"""
    # Check if user has admin role
    if current_user.role_id not in ['system_administrator', 'admin']:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only administrators can access Schema Builder"
        )
    return current_user


@router.get("", response_model=List[SchemaObject])
async def list_objects(
    include_inactive: bool = False,
    current_user: User = Depends(require_admin),
    service: ObjectService = Depends(get_object_service)
):
    """List all Schema Objects for the tenant"""
    return await service.list_objects(
        tenant_id=current_user.tenant_id,
        include_inactive=include_inactive
    )


@router.post("", response_model=SchemaObject, status_code=status.HTTP_201_CREATED)
async def create_object(
    data: SchemaObjectCreate,
    current_user: User = Depends(require_admin),
    service: ObjectService = Depends(get_object_service)
):
    """Create a new Schema Object"""
    try:
        return await service.create_object(
            data=data,
            tenant_id=current_user.tenant_id,
            user_id=current_user.id
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/{object_id}", response_model=SchemaObjectResponse)
async def get_object(
    object_id: str,
    current_user: User = Depends(require_admin),
    service: ObjectService = Depends(get_object_service)
):
    """Get a Schema Object with its fields and relationships"""
    result = await service.get_object_with_details(
        object_id=object_id,
        tenant_id=current_user.tenant_id
    )
    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Object with ID '{object_id}' not found"
        )
    return result


@router.get("/by-name/{api_name}", response_model=SchemaObject)
async def get_object_by_name(
    api_name: str,
    current_user: User = Depends(require_admin),
    service: ObjectService = Depends(get_object_service)
):
    """Get a Schema Object by API name"""
    obj = await service.get_object_by_api_name(
        api_name=api_name,
        tenant_id=current_user.tenant_id
    )
    if not obj:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Object '{api_name}' not found"
        )
    return obj


@router.put("/{object_id}", response_model=SchemaObject)
async def update_object(
    object_id: str,
    data: SchemaObjectUpdate,
    current_user: User = Depends(require_admin),
    service: ObjectService = Depends(get_object_service)
):
    """Update a Schema Object"""
    try:
        result = await service.update_object(
            object_id=object_id,
            data=data,
            tenant_id=current_user.tenant_id
        )
        if not result:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Object with ID '{object_id}' not found"
            )
        return result
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.delete("/{object_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_object(
    object_id: str,
    current_user: User = Depends(require_admin),
    service: ObjectService = Depends(get_object_service)
):
    """Delete a Schema Object"""
    try:
        result = await service.delete_object(
            object_id=object_id,
            tenant_id=current_user.tenant_id
        )
        if not result:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Object with ID '{object_id}' not found"
            )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
