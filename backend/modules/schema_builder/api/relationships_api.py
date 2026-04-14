"""
Schema Builder - Relationships API
==================================
REST API for managing Schema Relationships (Lookups).
Admin-only access.
"""

from fastapi import APIRouter, HTTPException, Depends, status
from typing import List, Optional
import logging

from config.database import db
from modules.auth.api.auth_routes import get_current_user
from shared.models import User

from ..models import SchemaRelationship, SchemaRelationshipCreate
from ..services import RelationshipService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/relationships", tags=["Schema Builder - Relationships"])


def get_relationship_service():
    """Dependency to get RelationshipService instance"""
    return RelationshipService(db)


async def require_admin(current_user: User = Depends(get_current_user)) -> User:
    """Dependency to require admin role"""
    if current_user.role_id not in ['system_administrator', 'admin']:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only administrators can access Schema Builder"
        )
    return current_user


@router.get("", response_model=List[SchemaRelationship])
async def list_relationships(
    object_id: Optional[str] = None,
    include_inactive: bool = False,
    current_user: User = Depends(require_admin),
    service: RelationshipService = Depends(get_relationship_service)
):
    """List all relationships, optionally filtered by object"""
    return await service.list_relationships(
        tenant_id=current_user.tenant_id,
        object_id=object_id,
        include_inactive=include_inactive
    )


@router.post("", response_model=SchemaRelationship, status_code=status.HTTP_201_CREATED)
async def create_relationship(
    data: SchemaRelationshipCreate,
    current_user: User = Depends(require_admin),
    service: RelationshipService = Depends(get_relationship_service)
):
    """Create a new Schema Relationship (Lookup)"""
    try:
        return await service.create_relationship(
            data=data,
            tenant_id=current_user.tenant_id,
            user_id=current_user.id
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/{relationship_id}", response_model=SchemaRelationship)
async def get_relationship(
    relationship_id: str,
    current_user: User = Depends(require_admin),
    service: RelationshipService = Depends(get_relationship_service)
):
    """Get a Schema Relationship by ID"""
    rel = await service.get_relationship(
        relationship_id=relationship_id,
        tenant_id=current_user.tenant_id
    )
    if not rel:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Relationship with ID '{relationship_id}' not found"
        )
    return rel


@router.delete("/{relationship_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_relationship(
    relationship_id: str,
    current_user: User = Depends(require_admin),
    service: RelationshipService = Depends(get_relationship_service)
):
    """Delete a Schema Relationship"""
    result = await service.delete_relationship(
        relationship_id=relationship_id,
        tenant_id=current_user.tenant_id
    )
    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Relationship with ID '{relationship_id}' not found"
        )


@router.get("/object/{object_id}/details")
async def get_object_relationships(
    object_id: str,
    as_source: bool = True,
    as_target: bool = True,
    current_user: User = Depends(require_admin),
    service: RelationshipService = Depends(get_relationship_service)
):
    """Get relationships for an object with resolved object details"""
    return await service.get_relationships_for_object(
        object_id=object_id,
        tenant_id=current_user.tenant_id,
        as_source=as_source,
        as_target=as_target
    )
