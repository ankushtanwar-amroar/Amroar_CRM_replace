"""
Audit Trail API Routes

REST API endpoints for the audit trail module.
Uses runtime imports to avoid circular dependencies with server.py.
"""

from fastapi import APIRouter, Depends, Query, HTTPException, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import Optional
from datetime import datetime
import logging
import os
import jwt

from ..models import (
    AuditEventQuery, AuditEventListResponse, AuditEventResponse,
    AuditConfigCreate, AuditConfigResponse
)
from ..services import AuditService, AuditConfigService, AuditCleanupService
from ..dependencies import get_audit_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/audit", tags=["Audit Trail"])

# Security scheme (same as server.py)
security = HTTPBearer()

# JWT settings
JWT_SECRET = os.environ.get('JWT_SECRET', 'your-secret-key-here-change-in-production')
ALGORITHM = "HS256"


# ============================================================================
# DEPENDENCY INJECTION
# ============================================================================

async def get_audit_service() -> AuditService:
    """Get audit service instance"""
    db = get_audit_db()
    return AuditService(db)


async def get_config_service() -> AuditConfigService:
    """Get config service instance"""
    db = get_audit_db()
    return AuditConfigService(db)


async def get_cleanup_service() -> AuditCleanupService:
    """Get cleanup service instance"""
    db = get_audit_db()
    return AuditCleanupService(db)


class AuditUser:
    """User model for audit routes"""
    def __init__(self, id: str, tenant_id: str, email: str = None):
        self.id = id
        self.tenant_id = tenant_id
        self.email = email


async def get_audit_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> AuditUser:
    """
    Verify JWT token and return user info for audit routes.
    This is a simplified version that avoids circular imports.
    """
    try:
        token = credentials.credentials
        payload = jwt.decode(token, JWT_SECRET, algorithms=[ALGORITHM])
        user_id: str = payload.get("user_id")
        tenant_id: str = payload.get("tenant_id")
        if user_id is None or tenant_id is None:
            raise HTTPException(status_code=401, detail="Invalid authentication credentials")
        
        return AuditUser(id=user_id, tenant_id=tenant_id)
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid authentication credentials")


# ============================================================================
# EVENT ENDPOINTS
# ============================================================================

@router.get("/events", response_model=AuditEventListResponse)
async def list_audit_events(
    target_object: Optional[str] = Query(None, description="Filter by object type"),
    target_record_id: Optional[str] = Query(None, description="Filter by record ID"),
    operation: Optional[str] = Query(None, description="Filter by operation type"),
    change_source: Optional[str] = Query(None, description="Filter by change source"),
    changed_by_user_id: Optional[str] = Query(None, description="Filter by user ID"),
    correlation_id: Optional[str] = Query(None, description="Filter by correlation ID"),
    field_search: Optional[str] = Query(None, description="Search for field changes"),
    start_date: Optional[datetime] = Query(None, description="Start date filter"),
    end_date: Optional[datetime] = Query(None, description="End date filter"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(50, ge=1, le=200, description="Page size"),
    sort_by: str = Query("occurred_at", description="Sort field"),
    sort_order: str = Query("desc", description="Sort order"),
    include_field_changes: bool = Query(False, description="Include field changes in response"),
    service: AuditService = Depends(get_audit_service),
    current_user = Depends(get_audit_user)
):
    """
    List audit events with filtering and pagination.
    """
    query = AuditEventQuery(
        target_object=target_object,
        target_record_id=target_record_id,
        operation=operation,
        change_source=change_source,
        changed_by_user_id=changed_by_user_id,
        correlation_id=correlation_id,
        field_search=field_search,
        start_date=start_date,
        end_date=end_date,
        page=page,
        page_size=page_size,
        sort_by=sort_by,
        sort_order=sort_order,
        include_field_changes=include_field_changes
    )
    
    return await service.get_events(query, current_user.tenant_id)


@router.get("/events/{event_id}", response_model=AuditEventResponse)
async def get_audit_event(
    event_id: str,
    service: AuditService = Depends(get_audit_service),
    current_user = Depends(get_audit_user)
):
    """Get a single audit event with its field changes."""
    event = await service.get_event(event_id, current_user.tenant_id)
    if not event:
        raise HTTPException(status_code=404, detail="Audit event not found")
    return event


@router.get("/record/{target_object}/{record_id}")
async def get_record_audit_history(
    target_object: str,
    record_id: str,
    limit: int = Query(50, ge=1, le=200, description="Maximum events to return"),
    service: AuditService = Depends(get_audit_service),
    current_user = Depends(get_audit_user)
):
    """Get audit history for a specific record."""
    events = await service.get_record_history(
        target_object=target_object,
        record_id=record_id,
        tenant_id=current_user.tenant_id,
        limit=limit
    )
    return {"events": events, "total": len(events)}


# ============================================================================
# CONFIGURATION ENDPOINTS
# ============================================================================

@router.get("/config/{target_object}", response_model=AuditConfigResponse)
async def get_audit_config(
    target_object: str,
    create_default: bool = Query(False, description="Create default config if not exists"),
    service: AuditConfigService = Depends(get_config_service),
    current_user = Depends(get_audit_user)
):
    """Get audit configuration for an object."""
    config = await service.get_config(
        target_object=target_object,
        tenant_id=current_user.tenant_id,
        create_default=create_default
    )
    
    if not config:
        raise HTTPException(
            status_code=404, 
            detail=f"Audit configuration not found for {target_object}"
        )
    
    return config


@router.post("/config/{target_object}", response_model=AuditConfigResponse)
async def save_audit_config(
    target_object: str,
    data: AuditConfigCreate,
    service: AuditConfigService = Depends(get_config_service),
    current_user = Depends(get_audit_user)
):
    """Create or update audit configuration for an object."""
    data.target_object = target_object
    
    result = await service.update_config(
        target_object=target_object,
        data=data,
        tenant_id=current_user.tenant_id
    )
    
    if not result:
        raise HTTPException(status_code=500, detail="Failed to save audit configuration")
    
    return result


@router.delete("/config/{target_object}")
async def delete_audit_config(
    target_object: str,
    service: AuditConfigService = Depends(get_config_service),
    current_user = Depends(get_audit_user)
):
    """Delete audit configuration for an object."""
    success = await service.delete_config(target_object, current_user.tenant_id)
    if not success:
        raise HTTPException(status_code=404, detail="Configuration not found")
    return {"message": f"Audit configuration deleted for {target_object}"}


@router.get("/configs")
async def list_audit_configs(
    service: AuditConfigService = Depends(get_config_service),
    current_user = Depends(get_audit_user)
):
    """List all audit configurations for the tenant."""
    configs = await service.list_configs(current_user.tenant_id)
    return {"configs": configs}


@router.post("/config/{target_object}/enable")
async def enable_audit(
    target_object: str,
    service: AuditConfigService = Depends(get_config_service),
    current_user = Depends(get_audit_user)
):
    """Enable audit logging for an object."""
    success = await service.enable_audit(target_object, current_user.tenant_id)
    if not success:
        config = await service.get_config(target_object, current_user.tenant_id, create_default=True)
        if config:
            return {"message": f"Audit enabled for {target_object}", "config": config}
        raise HTTPException(status_code=500, detail="Failed to enable audit")
    return {"message": f"Audit enabled for {target_object}"}


@router.post("/config/{target_object}/disable")
async def disable_audit(
    target_object: str,
    service: AuditConfigService = Depends(get_config_service),
    current_user = Depends(get_audit_user)
):
    """Disable audit logging for an object."""
    success = await service.disable_audit(target_object, current_user.tenant_id)
    if not success:
        raise HTTPException(status_code=404, detail="Configuration not found")
    return {"message": f"Audit disabled for {target_object}"}


# ============================================================================
# REFERENCE DATA ENDPOINTS
# ============================================================================

@router.get("/sources")
async def get_audit_sources(
    service: AuditConfigService = Depends(get_config_service)
):
    """Get list of available audit sources."""
    sources = await service.get_available_sources()
    return {"sources": sources}


@router.get("/operations")
async def get_audit_operations(
    service: AuditConfigService = Depends(get_config_service)
):
    """Get list of available audit operations."""
    operations = await service.get_available_operations()
    return {"operations": operations}


# ============================================================================
# STATISTICS & CLEANUP ENDPOINTS
# ============================================================================

@router.get("/stats")
async def get_audit_stats(
    service: AuditCleanupService = Depends(get_cleanup_service),
    current_user = Depends(get_audit_user)
):
    """Get audit storage statistics."""
    stats = await service.get_storage_stats(current_user.tenant_id)
    return stats


@router.post("/cleanup")
async def trigger_cleanup(
    target_object: Optional[str] = Query(None, description="Object to clean up"),
    service: AuditCleanupService = Depends(get_cleanup_service),
    current_user = Depends(get_audit_user)
):
    """Manually trigger audit cleanup."""
    if target_object:
        result = await service.cleanup_object(target_object, current_user.tenant_id)
    else:
        result = await service.run_cleanup()
    
    return {"message": "Cleanup completed", "result": result}
