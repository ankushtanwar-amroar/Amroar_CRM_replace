"""
Custom Dashboard API Router - Phase 16
Handles dashboard CRUD, widgets, sharing, and permissions
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from typing import Optional, List
from datetime import datetime, timezone
from pydantic import BaseModel
import logging

from motor.motor_asyncio import AsyncIOMotorClient
import os

from server import get_current_user
from shared.models import User

from ..services.custom_dashboard_service import CustomDashboardService
from ..services.advanced_reports_service import AdvancedReportsService

logger = logging.getLogger(__name__)

# Database connection
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "crm_platform")
client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

# Initialize services
dashboard_service = CustomDashboardService(db)
reports_service = AdvancedReportsService(db)

# Create router
custom_dashboards_router = APIRouter(prefix="/api/task-manager/custom-dashboards", tags=["task-manager-custom-dashboards"])


# ============================================================================
# REQUEST/RESPONSE MODELS
# ============================================================================

class CreateDashboardRequest(BaseModel):
    name: str
    description: Optional[str] = None
    global_filters: Optional[dict] = None


class UpdateDashboardRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    global_filters: Optional[dict] = None


class AddWidgetRequest(BaseModel):
    widget_type: str
    title: str
    data_source: str
    config: dict
    layout: Optional[dict] = None


class UpdateWidgetRequest(BaseModel):
    title: Optional[str] = None
    config: Optional[dict] = None


class UpdateLayoutRequest(BaseModel):
    layout: List[dict]


class ShareDashboardRequest(BaseModel):
    share_with: List[dict]  # [{user_id: str}]


class CloneDashboardRequest(BaseModel):
    new_name: Optional[str] = None


# ============================================================================
# ADMIN ENDPOINTS
# ============================================================================

@custom_dashboards_router.get("/settings/enabled")
async def get_feature_enabled(
    current_user: User = Depends(get_current_user)
):
    """Check if custom dashboards feature is enabled"""
    enabled = await dashboard_service.is_feature_enabled(current_user.tenant_id)
    return {"enabled": enabled}


@custom_dashboards_router.put("/settings/enabled")
async def set_feature_enabled(
    enabled: bool = Query(...),
    current_user: User = Depends(get_current_user)
):
    """Enable or disable custom dashboards feature (Admin only)"""
    result = await dashboard_service.set_feature_enabled(
        tenant_id=current_user.tenant_id,
        enabled=enabled,
        user_id=current_user.id
    )
    return {"enabled": result}


# ============================================================================
# DASHBOARD CRUD
# ============================================================================

@custom_dashboards_router.get("")
async def list_dashboards(
    current_user: User = Depends(get_current_user),
    include_shared: bool = Query(True)
):
    """List dashboards user has access to"""
    # Check if feature is enabled
    if not await dashboard_service.is_feature_enabled(current_user.tenant_id):
        raise HTTPException(status_code=403, detail="Custom dashboards feature is disabled")
    
    dashboards = await dashboard_service.list_dashboards(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        include_shared=include_shared
    )
    return {"dashboards": dashboards, "total": len(dashboards)}


@custom_dashboards_router.get("/metadata")
async def get_metadata(
    current_user: User = Depends(get_current_user)
):
    """Get available widget types and data sources"""
    return {
        "widget_types": dashboard_service.get_widget_types(),
        "data_sources": dashboard_service.get_data_sources(),
        "max_widgets": 12
    }


@custom_dashboards_router.post("")
async def create_dashboard(
    request: CreateDashboardRequest,
    current_user: User = Depends(get_current_user)
):
    """Create a new dashboard"""
    if not await dashboard_service.is_feature_enabled(current_user.tenant_id):
        raise HTTPException(status_code=403, detail="Custom dashboards feature is disabled")
    
    if not request.name.strip():
        raise HTTPException(status_code=400, detail="Dashboard name is required")
    
    dashboard = await dashboard_service.create_dashboard(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        name=request.name,
        description=request.description,
        global_filters=request.global_filters
    )
    return dashboard


@custom_dashboards_router.get("/{dashboard_id}")
async def get_dashboard(
    dashboard_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get a specific dashboard"""
    if not await dashboard_service.is_feature_enabled(current_user.tenant_id):
        raise HTTPException(status_code=403, detail="Custom dashboards feature is disabled")
    
    dashboard = await dashboard_service.get_dashboard(
        dashboard_id=dashboard_id,
        tenant_id=current_user.tenant_id,
        user_id=current_user.id
    )
    
    if not dashboard:
        raise HTTPException(status_code=404, detail="Dashboard not found or access denied")
    
    return dashboard


@custom_dashboards_router.put("/{dashboard_id}")
async def update_dashboard(
    dashboard_id: str,
    request: UpdateDashboardRequest,
    current_user: User = Depends(get_current_user)
):
    """Update a dashboard (owner only)"""
    if not await dashboard_service.is_feature_enabled(current_user.tenant_id):
        raise HTTPException(status_code=403, detail="Custom dashboards feature is disabled")
    
    updates = {k: v for k, v in request.model_dump().items() if v is not None}
    
    dashboard = await dashboard_service.update_dashboard(
        dashboard_id=dashboard_id,
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        updates=updates
    )
    
    if not dashboard:
        raise HTTPException(status_code=404, detail="Dashboard not found or not owner")
    
    return dashboard


@custom_dashboards_router.delete("/{dashboard_id}")
async def delete_dashboard(
    dashboard_id: str,
    current_user: User = Depends(get_current_user)
):
    """Delete a dashboard (owner only)"""
    success = await dashboard_service.delete_dashboard(
        dashboard_id=dashboard_id,
        tenant_id=current_user.tenant_id,
        user_id=current_user.id
    )
    
    if not success:
        raise HTTPException(status_code=404, detail="Dashboard not found or not owner")
    
    return {"message": "Dashboard deleted successfully"}


@custom_dashboards_router.post("/{dashboard_id}/clone")
async def clone_dashboard(
    dashboard_id: str,
    request: CloneDashboardRequest,
    current_user: User = Depends(get_current_user)
):
    """Clone a dashboard"""
    if not await dashboard_service.is_feature_enabled(current_user.tenant_id):
        raise HTTPException(status_code=403, detail="Custom dashboards feature is disabled")
    
    dashboard = await dashboard_service.clone_dashboard(
        dashboard_id=dashboard_id,
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        new_name=request.new_name
    )
    
    if not dashboard:
        raise HTTPException(status_code=404, detail="Dashboard not found or access denied")
    
    return dashboard


# ============================================================================
# WIDGET ENDPOINTS
# ============================================================================

@custom_dashboards_router.post("/{dashboard_id}/widgets")
async def add_widget(
    dashboard_id: str,
    request: AddWidgetRequest,
    current_user: User = Depends(get_current_user)
):
    """Add a widget to dashboard"""
    if not await dashboard_service.is_feature_enabled(current_user.tenant_id):
        raise HTTPException(status_code=403, detail="Custom dashboards feature is disabled")
    
    try:
        result = await dashboard_service.add_widget(
            dashboard_id=dashboard_id,
            tenant_id=current_user.tenant_id,
            user_id=current_user.id,
            widget_type=request.widget_type,
            title=request.title,
            data_source=request.data_source,
            config=request.config,
            layout=request.layout
        )
        
        if not result:
            raise HTTPException(status_code=404, detail="Dashboard not found or not owner")
        
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@custom_dashboards_router.put("/{dashboard_id}/widgets/{widget_id}")
async def update_widget(
    dashboard_id: str,
    widget_id: str,
    request: UpdateWidgetRequest,
    current_user: User = Depends(get_current_user)
):
    """Update a widget"""
    updates = {k: v for k, v in request.model_dump().items() if v is not None}
    
    result = await dashboard_service.update_widget(
        dashboard_id=dashboard_id,
        widget_id=widget_id,
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        updates=updates
    )
    
    if not result:
        raise HTTPException(status_code=404, detail="Widget not found or not owner")
    
    return result


@custom_dashboards_router.delete("/{dashboard_id}/widgets/{widget_id}")
async def remove_widget(
    dashboard_id: str,
    widget_id: str,
    current_user: User = Depends(get_current_user)
):
    """Remove a widget from dashboard"""
    success = await dashboard_service.remove_widget(
        dashboard_id=dashboard_id,
        widget_id=widget_id,
        tenant_id=current_user.tenant_id,
        user_id=current_user.id
    )
    
    if not success:
        raise HTTPException(status_code=404, detail="Widget not found or not owner")
    
    return {"message": "Widget removed successfully"}


@custom_dashboards_router.put("/{dashboard_id}/layout")
async def update_layout(
    dashboard_id: str,
    request: UpdateLayoutRequest,
    current_user: User = Depends(get_current_user)
):
    """Update dashboard layout"""
    success = await dashboard_service.update_layout(
        dashboard_id=dashboard_id,
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        layout=request.layout
    )
    
    if not success:
        raise HTTPException(status_code=404, detail="Dashboard not found or not owner")
    
    return {"message": "Layout updated successfully"}


# ============================================================================
# WIDGET DATA ENDPOINTS
# ============================================================================

@custom_dashboards_router.get("/{dashboard_id}/data")
async def get_dashboard_data(
    dashboard_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get data for all widgets in a dashboard"""
    if not await dashboard_service.is_feature_enabled(current_user.tenant_id):
        raise HTTPException(status_code=403, detail="Custom dashboards feature is disabled")
    
    dashboard = await dashboard_service.get_dashboard(
        dashboard_id=dashboard_id,
        tenant_id=current_user.tenant_id,
        user_id=current_user.id
    )
    
    if not dashboard:
        raise HTTPException(status_code=404, detail="Dashboard not found or access denied")
    
    global_filters = dashboard.get("global_filters", {})
    widgets_data = {}
    
    for widget in dashboard.get("widgets", []):
        try:
            data = await dashboard_service.get_widget_data(
                widget=widget,
                tenant_id=current_user.tenant_id,
                global_filters=global_filters,
                reports_service=reports_service
            )
            widgets_data[widget["id"]] = data
        except Exception as e:
            logger.error(f"Error fetching widget data: {e}")
            widgets_data[widget["id"]] = {"error": str(e)}
    
    return {"widgets_data": widgets_data}


@custom_dashboards_router.get("/{dashboard_id}/widgets/{widget_id}/data")
async def get_widget_data(
    dashboard_id: str,
    widget_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get data for a specific widget"""
    dashboard = await dashboard_service.get_dashboard(
        dashboard_id=dashboard_id,
        tenant_id=current_user.tenant_id,
        user_id=current_user.id
    )
    
    if not dashboard:
        raise HTTPException(status_code=404, detail="Dashboard not found or access denied")
    
    widget = next((w for w in dashboard.get("widgets", []) if w["id"] == widget_id), None)
    
    if not widget:
        raise HTTPException(status_code=404, detail="Widget not found")
    
    global_filters = dashboard.get("global_filters", {})
    
    data = await dashboard_service.get_widget_data(
        widget=widget,
        tenant_id=current_user.tenant_id,
        global_filters=global_filters,
        reports_service=reports_service
    )
    
    return data


# ============================================================================
# SHARING ENDPOINTS
# ============================================================================

@custom_dashboards_router.post("/{dashboard_id}/share")
async def share_dashboard(
    dashboard_id: str,
    request: ShareDashboardRequest,
    current_user: User = Depends(get_current_user)
):
    """Share dashboard with users (owner only)"""
    success = await dashboard_service.share_dashboard(
        dashboard_id=dashboard_id,
        tenant_id=current_user.tenant_id,
        owner_id=current_user.id,
        share_with=request.share_with
    )
    
    if not success:
        raise HTTPException(status_code=404, detail="Dashboard not found or not owner")
    
    return {"message": "Dashboard shared successfully"}


@custom_dashboards_router.delete("/{dashboard_id}/share/{user_id}")
async def unshare_dashboard(
    dashboard_id: str,
    user_id: str,
    current_user: User = Depends(get_current_user)
):
    """Remove user from shared list (owner only)"""
    success = await dashboard_service.unshare_dashboard(
        dashboard_id=dashboard_id,
        tenant_id=current_user.tenant_id,
        owner_id=current_user.id,
        user_id_to_remove=user_id
    )
    
    if not success:
        raise HTTPException(status_code=404, detail="Dashboard not found or not owner")
    
    return {"message": "User removed from shared list"}


# ============================================================================
# AUDIT LOG ENDPOINTS
# ============================================================================

@custom_dashboards_router.get("/{dashboard_id}/audit-logs")
async def get_dashboard_audit_logs(
    dashboard_id: str,
    current_user: User = Depends(get_current_user),
    limit: int = Query(50, le=100)
):
    """Get audit logs for a dashboard"""
    # Verify access first
    dashboard = await dashboard_service.get_dashboard(
        dashboard_id=dashboard_id,
        tenant_id=current_user.tenant_id,
        user_id=current_user.id
    )
    
    if not dashboard:
        raise HTTPException(status_code=404, detail="Dashboard not found or access denied")
    
    logs = await dashboard_service.get_audit_logs(
        tenant_id=current_user.tenant_id,
        dashboard_id=dashboard_id,
        limit=limit
    )
    
    return {"logs": logs, "total": len(logs)}


# ============================================================================
# USERS ENDPOINT (for sharing)
# ============================================================================

@custom_dashboards_router.get("/users/available")
async def get_available_users(
    current_user: User = Depends(get_current_user)
):
    """Get users available for sharing"""
    users = await db.users.find(
        {"tenant_id": current_user.tenant_id, "is_active": True},
        {"_id": 0, "id": 1, "first_name": 1, "last_name": 1, "email": 1}
    ).to_list(100)
    
    # Exclude current user
    users = [u for u in users if u["id"] != current_user.id]
    
    return {"users": users}
