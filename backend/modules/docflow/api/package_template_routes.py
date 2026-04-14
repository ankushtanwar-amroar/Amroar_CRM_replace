"""
DocFlow Package Template Routes — Phase 1

CRUD endpoints for reusable package templates (multi-document blueprints).
"""
from fastapi import APIRouter, Depends, HTTPException
from typing import Optional, Dict, Any

import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..')))

from shared.database import db
from shared.models import User
from shared.auth import get_current_user
from ..services.package_service import PackageService
from ..models.package_model import PackageTemplateCreate, PackageTemplateUpdate

router = APIRouter(prefix="/docflow/package-templates", tags=["DocFlow Package Templates"])

package_service = PackageService(db)


@router.post("")
async def create_package_template(
    data: PackageTemplateCreate,
    current_user: User = Depends(get_current_user),
):
    """Create a new package template."""
    try:
        template = await package_service.create_package_template(
            data=data.model_dump(),
            user_id=current_user.id,
            tenant_id=current_user.tenant_id,
        )
        return template
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("")
async def list_package_templates(
    current_user: User = Depends(get_current_user),
):
    """List all package templates for the current tenant."""
    templates = await package_service.list_package_templates(current_user.tenant_id)
    return {"templates": templates}


@router.get("/{template_id}")
async def get_package_template(
    template_id: str,
    current_user: User = Depends(get_current_user),
):
    """Get a single package template by ID."""
    template = await package_service.get_package_template(template_id, current_user.tenant_id)
    if not template:
        raise HTTPException(status_code=404, detail="Package template not found")
    return template


@router.put("/{template_id}")
async def update_package_template(
    template_id: str,
    data: PackageTemplateUpdate,
    current_user: User = Depends(get_current_user),
):
    """Update a package template."""
    result = await package_service.update_package_template(
        template_id=template_id,
        tenant_id=current_user.tenant_id,
        data=data.model_dump(exclude_none=True),
    )
    if not result:
        raise HTTPException(status_code=404, detail="Package template not found")
    return result


@router.delete("/{template_id}")
async def delete_package_template(
    template_id: str,
    current_user: User = Depends(get_current_user),
):
    """Delete a package template."""
    deleted = await package_service.delete_package_template(template_id, current_user.tenant_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Package template not found")
    return {"success": True, "message": "Package template deleted"}
