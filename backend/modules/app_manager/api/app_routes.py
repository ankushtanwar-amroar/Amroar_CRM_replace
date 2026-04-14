"""
App Manager API Routes

Endpoints for managing Apps, Pages, Navigation, and Components.
Following module isolation - data fetching for components goes through respective services.
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from typing import Optional, List
from motor.motor_asyncio import AsyncIOMotorDatabase
import logging

from config.database import db
from shared.auth import get_current_user
from shared.models import User

from ..models.app_models import (
    CrmAppCreate, CrmAppUpdate, CrmAppResponse,
    CrmPageCreate, CrmPageUpdate, CrmPageResponse,
    NavigationUpdate, CrmAppNavigation,
    PageRegion, AppsListResponse, PagesListResponse,
    NavItemType
)
from ..models.component_registry import get_component_registry, PAGE_TEMPLATES
from ..services.app_service import AppManagerService
from ..services.component_data_service import ComponentDataService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/app-manager", tags=["App Manager"])


def get_app_service() -> AppManagerService:
    return AppManagerService(db)


def get_component_service() -> ComponentDataService:
    return ComponentDataService(db)


# =============================================================================
# App CRUD Endpoints
# =============================================================================

@router.post("/apps", response_model=CrmAppResponse)
async def create_app(
    data: CrmAppCreate,
    current_user: User = Depends(get_current_user),
    service: AppManagerService = Depends(get_app_service)
):
    """
    Create a new app with automatic Home page creation.
    Each app gets exactly ONE home page (editable only).
    """
    try:
        return await service.create_app(data, current_user.id, current_user.tenant_id)
    except Exception as e:
        logger.error(f"Error creating app: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/apps", response_model=AppsListResponse)
async def list_apps(
    include_inactive: bool = Query(False),
    current_user: User = Depends(get_current_user),
    service: AppManagerService = Depends(get_app_service)
):
    """List all apps for the current tenant"""
    return await service.list_apps(current_user.tenant_id, include_inactive)


@router.get("/apps/{app_id}", response_model=CrmAppResponse)
async def get_app(
    app_id: str,
    current_user: User = Depends(get_current_user),
    service: AppManagerService = Depends(get_app_service)
):
    """Get a specific app by ID"""
    app = await service.get_app(app_id, current_user.tenant_id)
    if not app:
        raise HTTPException(status_code=404, detail="App not found")
    return app


@router.patch("/apps/{app_id}", response_model=CrmAppResponse)
async def update_app(
    app_id: str,
    data: CrmAppUpdate,
    current_user: User = Depends(get_current_user),
    service: AppManagerService = Depends(get_app_service)
):
    """Update an existing app"""
    result = await service.update_app(app_id, data, current_user.id, current_user.tenant_id)
    if not result:
        raise HTTPException(status_code=404, detail="App not found")
    return result


@router.delete("/apps/{app_id}")
async def delete_app(
    app_id: str,
    current_user: User = Depends(get_current_user),
    service: AppManagerService = Depends(get_app_service)
):
    """Delete an app and all its pages"""
    success = await service.delete_app(app_id, current_user.tenant_id)
    if not success:
        raise HTTPException(status_code=404, detail="App not found")
    return {"success": True, "message": "App deleted successfully"}


# =============================================================================
# Navigation Endpoints
# =============================================================================

@router.get("/apps/{app_id}/navigation", response_model=CrmAppNavigation)
async def get_app_navigation(
    app_id: str,
    current_user: User = Depends(get_current_user),
    service: AppManagerService = Depends(get_app_service)
):
    """Get navigation items for an app"""
    nav = await service.get_app_navigation(app_id, current_user.tenant_id)
    if not nav:
        raise HTTPException(status_code=404, detail="Navigation not found")
    return nav


@router.put("/apps/{app_id}/navigation")
async def update_app_navigation(
    app_id: str,
    data: NavigationUpdate,
    current_user: User = Depends(get_current_user),
    service: AppManagerService = Depends(get_app_service)
):
    """Update navigation items for an app"""
    return await service.update_app_navigation(app_id, data, current_user.tenant_id)


@router.post("/apps/{app_id}/navigation/items")
async def add_navigation_item(
    app_id: str,
    item_type: NavItemType,
    reference_id: str,
    label: str,
    icon: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    service: AppManagerService = Depends(get_app_service)
):
    """Add a navigation item to an app"""
    return await service.add_nav_item(
        app_id, item_type, reference_id, label, icon, current_user.tenant_id
    )


@router.delete("/apps/{app_id}/navigation/items/{item_id}")
async def remove_navigation_item(
    app_id: str,
    item_id: str,
    current_user: User = Depends(get_current_user),
    service: AppManagerService = Depends(get_app_service)
):
    """Remove a navigation item from an app"""
    success = await service.remove_nav_item(app_id, item_id, current_user.tenant_id)
    if not success:
        raise HTTPException(status_code=404, detail="Item not found")
    return {"success": True}


# =============================================================================
# Page CRUD Endpoints
# =============================================================================

@router.post("/pages", response_model=CrmPageResponse)
async def create_page(
    data: CrmPageCreate,
    current_user: User = Depends(get_current_user),
    service: AppManagerService = Depends(get_app_service)
):
    """
    Create a new App Page.
    Note: Home pages are created automatically with apps and cannot be manually created.
    """
    try:
        return await service.create_page(data, current_user.id, current_user.tenant_id)
    except Exception as e:
        logger.error(f"Error creating page: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/apps/{app_id}/pages", response_model=PagesListResponse)
async def list_app_pages(
    app_id: str,
    include_home: bool = Query(True),
    current_user: User = Depends(get_current_user),
    service: AppManagerService = Depends(get_app_service)
):
    """List all pages for an app"""
    return await service.list_app_pages(app_id, current_user.tenant_id, include_home)


@router.get("/apps/{app_id}/home")
async def get_app_home_page(
    app_id: str,
    current_user: User = Depends(get_current_user),
    service: AppManagerService = Depends(get_app_service)
):
    """Get the Home page for an app"""
    page = await service.get_app_home_page(app_id, current_user.tenant_id)
    if not page:
        raise HTTPException(status_code=404, detail="Home page not found")
    return page


@router.get("/pages/{page_id}", response_model=CrmPageResponse)
async def get_page(
    page_id: str,
    current_user: User = Depends(get_current_user),
    service: AppManagerService = Depends(get_app_service)
):
    """Get a specific page by ID"""
    page = await service.get_page(page_id, current_user.tenant_id)
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")
    return page


@router.patch("/pages/{page_id}", response_model=CrmPageResponse)
async def update_page(
    page_id: str,
    data: CrmPageUpdate,
    current_user: User = Depends(get_current_user),
    service: AppManagerService = Depends(get_app_service)
):
    """Update a page (including layout changes)"""
    result = await service.update_page(page_id, data, current_user.id, current_user.tenant_id)
    if not result:
        raise HTTPException(status_code=404, detail="Page not found")
    return result


@router.delete("/pages/{page_id}")
async def delete_page(
    page_id: str,
    current_user: User = Depends(get_current_user),
    service: AppManagerService = Depends(get_app_service)
):
    """
    Delete a page.
    Note: Home pages cannot be deleted.
    """
    success, error = await service.delete_page(page_id, current_user.tenant_id)
    if not success:
        raise HTTPException(status_code=400 if error else 404, detail=error or "Page not found")
    return {"success": True, "message": "Page deleted successfully"}


@router.post("/pages/{page_id}/set-default")
async def set_page_as_default(
    page_id: str,
    current_user: User = Depends(get_current_user),
    service: AppManagerService = Depends(get_app_service)
):
    """
    Set a page as the default page for its app.
    When an app is opened, the default page will be shown.
    """
    try:
        result = await service.set_page_as_default(page_id, current_user.tenant_id)
        if not result:
            raise HTTPException(status_code=404, detail="Page not found")
        return {"success": True, "message": "Page set as default"}
    except Exception as e:
        logger.error(f"Error setting default page: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# Component Operations
# =============================================================================

@router.post("/pages/{page_id}/components")
async def add_component(
    page_id: str,
    component_type: str,
    region: PageRegion,
    config: dict = {},
    current_user: User = Depends(get_current_user),
    service: AppManagerService = Depends(get_app_service)
):
    """Add a component to a page region"""
    try:
        result = await service.add_component_to_page(
            page_id, component_type, region, config,
            current_user.id, current_user.tenant_id
        )
        if not result:
            raise HTTPException(status_code=404, detail="Page not found")
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.patch("/pages/{page_id}/components/{component_id}")
async def update_component(
    page_id: str,
    component_id: str,
    config: dict,
    current_user: User = Depends(get_current_user),
    service: AppManagerService = Depends(get_app_service)
):
    """Update a component's configuration"""
    result = await service.update_component_config(
        page_id, component_id, config, current_user.id, current_user.tenant_id
    )
    if not result:
        raise HTTPException(status_code=404, detail="Page or component not found")
    return result


@router.delete("/pages/{page_id}/components/{component_id}")
async def remove_component(
    page_id: str,
    component_id: str,
    current_user: User = Depends(get_current_user),
    service: AppManagerService = Depends(get_app_service)
):
    """Remove a component from a page"""
    result = await service.remove_component_from_page(
        page_id, component_id, current_user.id, current_user.tenant_id
    )
    if not result:
        raise HTTPException(status_code=404, detail="Page or component not found")
    return {"success": True}


@router.put("/pages/{page_id}/regions/{region}/reorder")
async def reorder_components(
    page_id: str,
    region: PageRegion,
    component_ids: List[str],
    current_user: User = Depends(get_current_user),
    service: AppManagerService = Depends(get_app_service)
):
    """Reorder components within a region"""
    result = await service.reorder_components(
        page_id, region, component_ids, current_user.id, current_user.tenant_id
    )
    if not result:
        raise HTTPException(status_code=404, detail="Page not found")
    return result


# =============================================================================
# Component Registry Endpoints
# =============================================================================

@router.get("/components/registry")
async def get_components_registry(
    category: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """Get available components from the registry"""
    registry = get_component_registry()
    
    if category:
        registry = {
            k: v for k, v in registry.items()
            if v.category.value == category
        }
    
    return {
        "components": [
            {
                "id": comp.id,
                "name": comp.name,
                "description": comp.description,
                "category": comp.category.value,
                "icon": comp.icon,
                "config_schema": {k: v.dict() for k, v in comp.config_schema.items()},
                "frontend_component": comp.frontend_component,
                "supports_regions": [r.value for r in comp.supports_regions]
            }
            for comp in registry.values()
        ]
    }


@router.get("/templates")
async def get_page_templates(current_user: User = Depends(get_current_user)):
    """Get available page templates"""
    return {"templates": PAGE_TEMPLATES}


# =============================================================================
# Component Data Endpoints (Module Isolation)
# =============================================================================

@router.get("/components/data/tasks-due")
async def get_tasks_due_data(
    date_range: str = Query("next_7_days"),
    show_overdue: bool = Query(True),
    max_rows: int = Query(10),
    show_completed: bool = Query(False),
    current_user: User = Depends(get_current_user),
    service: ComponentDataService = Depends(get_component_service)
):
    """
    Get tasks due data for the Tasks Due component.
    Uses task_manager service layer - NOT direct DB queries.
    """
    return await service.get_tasks_due(
        user_id=current_user.id,
        tenant_id=current_user.tenant_id,
        date_range=date_range,
        show_overdue=show_overdue,
        max_rows=max_rows,
        show_completed=show_completed
    )


@router.get("/components/data/pipeline-snapshot")
async def get_pipeline_snapshot_data(
    object_type: str = Query("opportunity"),
    group_by: str = Query("stage"),
    display_mode: str = Query("both"),
    date_range: str = Query("this_quarter"),
    current_user: User = Depends(get_current_user),
    service: ComponentDataService = Depends(get_component_service)
):
    """
    Get pipeline snapshot data.
    Aggregates deals/leads by stage using respective service layers.
    """
    return await service.get_pipeline_snapshot(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        object_type=object_type,
        group_by=group_by,
        display_mode=display_mode,
        date_range=date_range
    )


@router.get("/components/data/work-queue")
async def get_work_queue_data(
    object_type: str = Query("lead"),
    inactivity_days: int = Query(7),
    max_rows: int = Query(10),
    sort_order: str = Query("oldest_first"),
    current_user: User = Depends(get_current_user),
    service: ComponentDataService = Depends(get_component_service)
):
    """
    Get work queue data - records needing attention based on inactivity.
    Uses last_activity_date field on core objects.
    """
    return await service.get_work_queue(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        object_type=object_type,
        inactivity_days=inactivity_days,
        max_rows=max_rows,
        sort_order=sort_order
    )


@router.get("/components/data/quick-actions")
async def get_quick_actions(
    current_user: User = Depends(get_current_user)
):
    """Get configured quick actions for the user"""
    # Default quick actions - can be customized per user/app in future
    return {
        "actions": [
            {"id": "new_lead", "label": "New Lead", "icon": "user-plus", "action_type": "create_record", "object": "lead"},
            {"id": "new_contact", "label": "New Contact", "icon": "user", "action_type": "create_record", "object": "contact"},
            {"id": "new_account", "label": "New Account", "icon": "building", "action_type": "create_record", "object": "account"},
            {"id": "new_opportunity", "label": "New Opportunity", "icon": "target", "action_type": "create_record", "object": "opportunity"},
            {"id": "new_task", "label": "New Task", "icon": "check-square", "action_type": "create_record", "object": "task"},
            {"id": "new_event", "label": "New Event", "icon": "calendar", "action_type": "create_record", "object": "event"},
            {"id": "log_call", "label": "Log a Call", "icon": "phone", "action_type": "create_record", "object": "call"}
        ]
    }


@router.get("/components/data/recent-records")
async def get_recent_records_data(
    record_type: str = Query("viewed"),
    object_filter: str = Query("all"),
    max_rows: int = Query(10),
    current_user: User = Depends(get_current_user),
    service: ComponentDataService = Depends(get_component_service)
):
    """Get recently viewed/updated/created records"""
    return await service.get_recent_records(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        record_type=record_type,
        object_filter=object_filter,
        max_rows=max_rows
    )


@router.get("/components/data/events-today")
async def get_events_today_data(
    date_range: str = Query("today"),
    max_rows: int = Query(5),
    show_location: bool = Query(True),
    current_user: User = Depends(get_current_user),
    service: ComponentDataService = Depends(get_component_service)
):
    """Get upcoming events for today and the near future"""
    return await service.get_events_today(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        date_range=date_range,
        max_rows=max_rows,
        show_location=show_location
    )


# =============================================================================
# Setup Home Endpoint
# =============================================================================

@router.get("/setup-home")
async def get_setup_home(
    current_user: User = Depends(get_current_user),
    service: AppManagerService = Depends(get_app_service)
):
    """Get or create the Setup Home page (admin only in future)"""
    return await service.get_or_create_setup_home(current_user.id, current_user.tenant_id)


# =============================================================================
# Seeding Endpoint (Admin utility)
# =============================================================================

@router.post("/seed-default-app")
async def seed_default_sales_app(
    current_user: User = Depends(get_current_user),
    service: AppManagerService = Depends(get_app_service)
):
    """
    Seed the default Sales app with pre-configured Home page.
    This is idempotent - will not create duplicate apps.
    """
    from ..services.seeder_service import seed_default_sales_app
    
    result = await seed_default_sales_app(db, current_user.id, current_user.tenant_id)
    return result
