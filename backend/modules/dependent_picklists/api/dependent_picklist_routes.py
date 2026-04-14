"""
Dependent Picklist API Routes
Endpoints for managing dependent picklist configurations
Updated: Dependencies are now GLOBAL (object-level), not per record type
"""
from fastapi import APIRouter, HTTPException, Depends
from shared.auth import get_current_user_dict
from typing import List, Dict, Any
from motor.motor_asyncio import AsyncIOMotorClient
import os
import jwt

from ..models.dependent_picklist_model import (
    DependentPicklistCreateRequest,
    DependentPicklistUpdateRequest,
    DependentPicklistResponse,
    RuntimeDependencyRequest
)
from ..services.dependent_picklist_service import DependentPicklistService

router = APIRouter(prefix="/dependent-picklists", tags=["Dependent Picklists"])

# Database connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Security
JWT_SECRET = os.environ.get('JWT_SECRET', 'your-secret-key-here-change-in-production')
ALGORITHM = "HS256"


def get_service() -> DependentPicklistService:
    """Get service instance"""
    return DependentPicklistService(db)


@router.get("/{object_name}", response_model=List[DependentPicklistResponse])
async def get_dependent_picklists_for_object(
    object_name: str,
    active_only: bool = True,
    current_user: dict = Depends(get_current_user_dict)
):
    """Get all dependent picklist configurations for an object"""
    service = get_service()
    tenant_id = current_user.get("tenant_id")
    
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant ID required")
    
    configs = await service.get_configs_for_object(
        tenant_id=tenant_id,
        object_name=object_name.lower(),
        active_only=active_only
    )
    
    return [
        DependentPicklistResponse(
            id=c.id,
            object_name=c.object_name,
            controlling_field_api=c.controlling_field_api,
            controlling_field_label=c.controlling_field_label,
            dependent_field_api=c.dependent_field_api,
            dependent_field_label=c.dependent_field_label,
            mapping=c.mapping,
            is_active=c.is_active,
            created_at=c.created_at,
            updated_at=c.updated_at
        )
        for c in configs
    ]


@router.get("/{object_name}/config/{config_id}", response_model=DependentPicklistResponse)
async def get_dependent_picklist_config(
    object_name: str,
    config_id: str,
    current_user: dict = Depends(get_current_user_dict)
):
    """Get a specific dependent picklist configuration"""
    service = get_service()
    tenant_id = current_user.get("tenant_id")
    
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant ID required")
    
    config = await service.get_config(config_id=config_id, tenant_id=tenant_id)
    
    if not config:
        raise HTTPException(status_code=404, detail="Configuration not found")
    
    return DependentPicklistResponse(
        id=config.id,
        object_name=config.object_name,
        controlling_field_api=config.controlling_field_api,
        controlling_field_label=config.controlling_field_label,
        dependent_field_api=config.dependent_field_api,
        dependent_field_label=config.dependent_field_label,
        mapping=config.mapping,
        is_active=config.is_active,
        created_at=config.created_at,
        updated_at=config.updated_at
    )


@router.post("/{object_name}", response_model=DependentPicklistResponse)
async def create_dependent_picklist_config(
    object_name: str,
    request: DependentPicklistCreateRequest,
    current_user: dict = Depends(get_current_user_dict)
):
    """Create a new dependent picklist configuration"""
    service = get_service()
    tenant_id = current_user.get("tenant_id")
    user_id = current_user.get("user_id")
    
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant ID required")
    
    try:
        config = await service.create_config(
            tenant_id=tenant_id,
            object_name=object_name.lower(),
            request=request,
            created_by=user_id
        )
        
        return DependentPicklistResponse(
            id=config.id,
            object_name=config.object_name,
            controlling_field_api=config.controlling_field_api,
            controlling_field_label=config.controlling_field_label,
            dependent_field_api=config.dependent_field_api,
            dependent_field_label=config.dependent_field_label,
            mapping=config.mapping,
            is_active=config.is_active,
            created_at=config.created_at,
            updated_at=config.updated_at
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/{object_name}/config/{config_id}", response_model=DependentPicklistResponse)
async def update_dependent_picklist_config(
    object_name: str,
    config_id: str,
    request: DependentPicklistUpdateRequest,
    current_user: dict = Depends(get_current_user_dict)
):
    """Update a dependent picklist configuration"""
    service = get_service()
    tenant_id = current_user.get("tenant_id")
    
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant ID required")
    
    config = await service.update_config(
        config_id=config_id,
        tenant_id=tenant_id,
        request=request
    )
    
    if not config:
        raise HTTPException(status_code=404, detail="Configuration not found")
    
    return DependentPicklistResponse(
        id=config.id,
        object_name=config.object_name,
        controlling_field_api=config.controlling_field_api,
        controlling_field_label=config.controlling_field_label,
        dependent_field_api=config.dependent_field_api,
        dependent_field_label=config.dependent_field_label,
        mapping=config.mapping,
        is_active=config.is_active,
        created_at=config.created_at,
        updated_at=config.updated_at
    )


@router.delete("/{object_name}/config/{config_id}")
async def delete_dependent_picklist_config(
    object_name: str,
    config_id: str,
    current_user: dict = Depends(get_current_user_dict)
):
    """Delete a dependent picklist configuration"""
    service = get_service()
    tenant_id = current_user.get("tenant_id")
    
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant ID required")
    
    deleted = await service.delete_config(config_id=config_id, tenant_id=tenant_id)
    
    if not deleted:
        raise HTTPException(status_code=404, detail="Configuration not found")
    
    return {"success": True, "message": "Configuration deleted"}


@router.get("/{object_name}/runtime")
async def get_runtime_dependencies_simple(
    object_name: str,
    current_user: dict = Depends(get_current_user_dict)
):
    """
    Get all dependencies for an object in a format suitable for runtime use.
    This is the primary endpoint called by the frontend when loading record forms.
    """
    service = get_service()
    tenant_id = current_user.get("tenant_id")
    
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant ID required")
    
    result = await service.get_all_dependencies_for_object(
        tenant_id=tenant_id,
        object_name=object_name.lower()
    )
    
    return result


@router.get("/{object_name}/runtime/dependency")
async def get_runtime_dependency(
    object_name: str,
    controlling_field_api: str,
    controlling_value: str,
    dependent_field_api: str,
    current_user: dict = Depends(get_current_user_dict)
):
    """Get filtered dependent values at runtime based on controlling field value"""
    service = get_service()
    tenant_id = current_user.get("tenant_id")
    
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant ID required")
    
    result = await service.get_filtered_dependent_values(
        tenant_id=tenant_id,
        object_name=object_name.lower(),
        controlling_field_api=controlling_field_api,
        controlling_value=controlling_value,
        dependent_field_api=dependent_field_api
    )
    
    return result


@router.get("/{object_name}/runtime/all-dependencies")
async def get_all_runtime_dependencies(
    object_name: str,
    current_user: dict = Depends(get_current_user_dict)
):
    """Get all dependencies for an object in a format suitable for runtime use"""
    service = get_service()
    tenant_id = current_user.get("tenant_id")
    
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant ID required")
    
    result = await service.get_all_dependencies_for_object(
        tenant_id=tenant_id,
        object_name=object_name.lower()
    )
    
    return result


@router.get("/{object_name}/field/{dependent_field_api}/dependency")
async def get_dependency_for_field(
    object_name: str,
    dependent_field_api: str,
    current_user: dict = Depends(get_current_user_dict)
):
    """Get the dependency configuration for a specific dependent field"""
    service = get_service()
    tenant_id = current_user.get("tenant_id")
    
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant ID required")
    
    config = await service.get_dependency_for_field(
        tenant_id=tenant_id,
        object_name=object_name.lower(),
        dependent_field_api=dependent_field_api
    )
    
    if not config:
        return {"has_dependency": False, "dependent_field_api": dependent_field_api}
    
    return {
        "has_dependency": True,
        "config_id": config.id,
        "controlling_field_api": config.controlling_field_api,
        "controlling_field_label": config.controlling_field_label,
        "dependent_field_api": config.dependent_field_api,
        "dependent_field_label": config.dependent_field_label,
        "mapping": config.mapping
    }


@router.post("/{object_name}/validate")
async def validate_dependent_value(
    object_name: str,
    controlling_field_api: str,
    controlling_value: str,
    dependent_field_api: str,
    dependent_value: str,
    current_user: dict = Depends(get_current_user_dict)
):
    """Validate if a dependent value is allowed for the given controlling value"""
    service = get_service()
    tenant_id = current_user.get("tenant_id")
    
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant ID required")
    
    is_valid = await service.validate_dependent_value(
        tenant_id=tenant_id,
        object_name=object_name.lower(),
        controlling_field_api=controlling_field_api,
        controlling_value=controlling_value,
        dependent_field_api=dependent_field_api,
        dependent_value=dependent_value
    )
    
    return {"is_valid": is_valid}
