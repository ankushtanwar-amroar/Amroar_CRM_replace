"""
Admin Integration API Routes - Categories and Providers management
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from motor.motor_asyncio import AsyncIOMotorClient
from typing import Optional, List
import os
import logging

from modules.admin.api.admin_routes import require_admin_auth
from modules.integrations.models.integration_models import (
    CategoryCreate, CategoryUpdate, CategoryResponse,
    ProviderCreate, ProviderUpdate, ProviderResponse
)
from modules.integrations.services.integration_service import CategoryService, ProviderService
from modules.integrations.services.seed_data import seed_integration_data

logger = logging.getLogger(__name__)

# Database connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

router = APIRouter(prefix="/admin/integrations", tags=["Admin Integrations"])


# ============================================================================
# CATEGORIES ENDPOINTS
# ============================================================================

@router.get("/categories", response_model=List[CategoryResponse])
async def list_categories(
    include_inactive: bool = Query(False),
    admin_user: dict = Depends(require_admin_auth)
):
    """List all integration categories"""
    service = CategoryService(db)
    return await service.list_categories(include_inactive)


@router.get("/categories/{category_id}", response_model=CategoryResponse)
async def get_category(
    category_id: str,
    admin_user: dict = Depends(require_admin_auth)
):
    """Get a category by ID"""
    service = CategoryService(db)
    category = await service.get_category(category_id)
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    return category


@router.post("/categories", response_model=CategoryResponse)
async def create_category(
    data: CategoryCreate,
    admin_user: dict = Depends(require_admin_auth)
):
    """Create a new integration category"""
    service = CategoryService(db)
    try:
        return await service.create_category(data.model_dump())
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/categories/{category_id}", response_model=CategoryResponse)
async def update_category(
    category_id: str,
    data: CategoryUpdate,
    admin_user: dict = Depends(require_admin_auth)
):
    """Update an integration category"""
    service = CategoryService(db)
    result = await service.update_category(category_id, data.model_dump(exclude_unset=True))
    if not result:
        raise HTTPException(status_code=404, detail="Category not found")
    return result


@router.delete("/categories/{category_id}")
async def delete_category(
    category_id: str,
    admin_user: dict = Depends(require_admin_auth)
):
    """Delete (deactivate) a category"""
    service = CategoryService(db)
    success = await service.delete_category(category_id)
    if not success:
        raise HTTPException(status_code=404, detail="Category not found")
    return {"message": "Category deactivated"}


# ============================================================================
# PROVIDERS ENDPOINTS
# ============================================================================

@router.get("/providers", response_model=List[ProviderResponse])
async def list_providers(
    category_id: Optional[str] = Query(None),
    include_inactive: bool = Query(False),
    admin_user: dict = Depends(require_admin_auth)
):
    """List all integration providers"""
    service = ProviderService(db)
    return await service.list_providers(category_id, include_inactive)


@router.get("/providers/{provider_id}", response_model=ProviderResponse)
async def get_provider(
    provider_id: str,
    admin_user: dict = Depends(require_admin_auth)
):
    """Get a provider by ID"""
    service = ProviderService(db)
    provider = await service.get_provider(provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")
    return provider


@router.post("/providers", response_model=ProviderResponse)
async def create_provider(
    data: ProviderCreate,
    admin_user: dict = Depends(require_admin_auth)
):
    """Create a new integration provider"""
    service = ProviderService(db)
    try:
        # Convert Pydantic models to dicts
        provider_data = data.model_dump()
        provider_data["auth_schema"] = [f.model_dump() if hasattr(f, 'model_dump') else f for f in data.auth_schema]
        if data.test_endpoint:
            provider_data["test_endpoint"] = data.test_endpoint.model_dump()
        return await service.create_provider(provider_data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/providers/{provider_id}", response_model=ProviderResponse)
async def update_provider(
    provider_id: str,
    data: ProviderUpdate,
    admin_user: dict = Depends(require_admin_auth)
):
    """Update an integration provider"""
    service = ProviderService(db)
    update_data = data.model_dump(exclude_unset=True)
    
    # Convert nested models
    if "auth_schema" in update_data and update_data["auth_schema"]:
        update_data["auth_schema"] = [f.model_dump() if hasattr(f, 'model_dump') else f for f in update_data["auth_schema"]]
    if "test_endpoint" in update_data and update_data["test_endpoint"]:
        update_data["test_endpoint"] = update_data["test_endpoint"].model_dump() if hasattr(update_data["test_endpoint"], 'model_dump') else update_data["test_endpoint"]
    
    result = await service.update_provider(provider_id, update_data)
    if not result:
        raise HTTPException(status_code=404, detail="Provider not found")
    return result


@router.delete("/providers/{provider_id}")
async def delete_provider(
    provider_id: str,
    admin_user: dict = Depends(require_admin_auth)
):
    """Delete (deactivate) a provider"""
    service = ProviderService(db)
    success = await service.delete_provider(provider_id)
    if not success:
        raise HTTPException(status_code=404, detail="Provider not found")
    return {"message": "Provider deactivated"}


# ============================================================================
# SEED DATA ENDPOINT
# ============================================================================

@router.post("/seed")
async def seed_data(
    admin_user: dict = Depends(require_admin_auth)
):
    """Seed default categories and providers"""
    try:
        await seed_integration_data(db)
        return {"message": "Seed data created successfully"}
    except Exception as e:
        logger.error(f"Seed data error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
