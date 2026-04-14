"""
File Manager - Setup Routes
Configuration endpoints for File Manager settings
"""

from fastapi import APIRouter, Depends, HTTPException
from typing import Optional, Dict, Any
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/files/setup", tags=["File Manager Setup"])


def get_db():
    """Get database instance"""
    from server import db
    return db


def get_current_user_dep():
    """Get current authenticated user dependency"""
    from server import get_current_user
    return get_current_user


def user_to_dict(user) -> dict:
    """Convert User model to dict for easier access"""
    if isinstance(user, dict):
        return user
    return {
        "id": getattr(user, 'id', None) or getattr(user, 'user_id', None),
        "name": f"{getattr(user, 'first_name', '')} {getattr(user, 'last_name', '')}".strip() or getattr(user, 'name', 'Unknown'),
        "email": getattr(user, 'email', None),
        "tenant_id": getattr(user, 'tenant_id', None),
        "role": getattr(user, 'role_id', None),
    }


def get_setup_service():
    from ..services.setup_service import SetupService
    return SetupService(get_db())


# ============================================================================
# SETTINGS
# ============================================================================

@router.get("/settings")
async def get_all_settings(current_user = Depends(get_current_user_dep())):
    """Get all File Manager settings"""
    user = user_to_dict(current_user)
    setup_service = get_setup_service()
    settings = await setup_service.get_settings(user["tenant_id"])
    return settings


@router.get("/feature-flags")
async def get_feature_flags(current_user = Depends(get_current_user_dep())):
    """Get feature flags"""
    user = user_to_dict(current_user)
    setup_service = get_setup_service()
    flags = await setup_service.get_feature_flags(user["tenant_id"])
    return {"flags": flags}


@router.put("/feature-flags/{flag}")
async def update_feature_flag(
    flag: str,
    enabled: bool,
    current_user = Depends(get_current_user_dep())
):
    """Update a specific feature flag"""
    user = user_to_dict(current_user)
    setup_service = get_setup_service()
    await setup_service.update_feature_flag(
        tenant_id=user["tenant_id"],
        flag=flag,
        enabled=enabled
    )
    return {"success": True}


# ============================================================================
# CATEGORIES
# ============================================================================

@router.get("/categories")
async def get_categories(
    object_name: Optional[str] = None,
    current_user = Depends(get_current_user_dep())
):
    """Get all categories"""
    user = user_to_dict(current_user)
    setup_service = get_setup_service()
    categories = await setup_service.get_categories(
        tenant_id=user["tenant_id"],
        object_name=object_name
    )
    return {"categories": categories}


@router.post("/categories")
async def create_category(
    data: Dict[str, Any],
    current_user = Depends(get_current_user_dep())
):
    """Create a new category"""
    user = user_to_dict(current_user)
    setup_service = get_setup_service()
    category = await setup_service.create_category(
        tenant_id=user["tenant_id"],
        user_id=user["id"],
        data=data
    )
    return category


@router.put("/categories/{category_id}")
async def update_category(
    category_id: str,
    data: Dict[str, Any],
    current_user = Depends(get_current_user_dep())
):
    """Update a category"""
    user = user_to_dict(current_user)
    setup_service = get_setup_service()
    category = await setup_service.update_category(
        tenant_id=user["tenant_id"],
        category_id=category_id,
        data=data
    )
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    return category


@router.delete("/categories/{category_id}")
async def delete_category(
    category_id: str,
    current_user = Depends(get_current_user_dep())
):
    """Delete a category"""
    user = user_to_dict(current_user)
    setup_service = get_setup_service()
    success = await setup_service.delete_category(
        tenant_id=user["tenant_id"],
        category_id=category_id
    )
    return {"success": success}


# ============================================================================
# TAGS
# ============================================================================

@router.get("/tags")
async def get_tags(current_user = Depends(get_current_user_dep())):
    """Get all tags"""
    user = user_to_dict(current_user)
    setup_service = get_setup_service()
    tags = await setup_service.get_tags(user["tenant_id"])
    return {"tags": tags}


@router.post("/tags")
async def create_tag(
    data: Dict[str, Any],
    current_user = Depends(get_current_user_dep())
):
    """Create a new tag"""
    user = user_to_dict(current_user)
    setup_service = get_setup_service()
    tag = await setup_service.create_tag(
        tenant_id=user["tenant_id"],
        user_id=user["id"],
        data=data
    )
    return tag


@router.put("/tags/{tag_id}")
async def update_tag(
    tag_id: str,
    data: Dict[str, Any],
    current_user = Depends(get_current_user_dep())
):
    """Update a tag"""
    user = user_to_dict(current_user)
    setup_service = get_setup_service()
    tag = await setup_service.update_tag(
        tenant_id=user["tenant_id"],
        tag_id=tag_id,
        data=data
    )
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")
    return tag


@router.delete("/tags/{tag_id}")
async def delete_tag(
    tag_id: str,
    current_user = Depends(get_current_user_dep())
):
    """Delete a tag"""
    user = user_to_dict(current_user)
    setup_service = get_setup_service()
    success = await setup_service.delete_tag(
        tenant_id=user["tenant_id"],
        tag_id=tag_id
    )
    return {"success": success}


# ============================================================================
# SENSITIVITIES
# ============================================================================

@router.get("/sensitivities")
async def get_sensitivities(current_user = Depends(get_current_user_dep())):
    """Get all sensitivity levels"""
    user = user_to_dict(current_user)
    setup_service = get_setup_service()
    sensitivities = await setup_service.get_sensitivities(user["tenant_id"])
    return {"sensitivities": sensitivities}


@router.post("/sensitivities")
async def create_sensitivity(
    data: Dict[str, Any],
    current_user = Depends(get_current_user_dep())
):
    """Create a new sensitivity level"""
    user = user_to_dict(current_user)
    setup_service = get_setup_service()
    sensitivity = await setup_service.create_sensitivity(
        tenant_id=user["tenant_id"],
        user_id=user["id"],
        data=data
    )
    return sensitivity


@router.put("/sensitivities/{sensitivity_id}")
async def update_sensitivity(
    sensitivity_id: str,
    data: Dict[str, Any],
    current_user = Depends(get_current_user_dep())
):
    """Update a sensitivity level"""
    user = user_to_dict(current_user)
    setup_service = get_setup_service()
    sensitivity = await setup_service.update_sensitivity(
        tenant_id=user["tenant_id"],
        sensitivity_id=sensitivity_id,
        data=data
    )
    if not sensitivity:
        raise HTTPException(status_code=404, detail="Sensitivity not found")
    return sensitivity


@router.delete("/sensitivities/{sensitivity_id}")
async def delete_sensitivity(
    sensitivity_id: str,
    current_user = Depends(get_current_user_dep())
):
    """Delete a sensitivity level"""
    user = user_to_dict(current_user)
    setup_service = get_setup_service()
    success = await setup_service.delete_sensitivity(
        tenant_id=user["tenant_id"],
        sensitivity_id=sensitivity_id
    )
    return {"success": success}
