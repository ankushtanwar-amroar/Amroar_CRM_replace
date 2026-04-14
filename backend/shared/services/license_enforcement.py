"""
License Enforcement Middleware
Backend decorator for enforcing license checks on API routes.

Usage:
    from shared.services.license_enforcement import require_module_license

    @router.get("/flows")
    @require_module_license("flow_builder")
    async def get_flows(current_user = Depends(get_current_user)):
        ...
"""
import logging
from functools import wraps
from typing import Optional, Callable
from fastapi import HTTPException, Request, Depends
from fastapi.responses import JSONResponse

from config.database import db
from shared.services.feature_access_service import (
    get_feature_access_service,
    FeatureAccessResult
)

logger = logging.getLogger(__name__)


class LicenseEnforcementError(HTTPException):
    """Custom exception for license enforcement failures"""
    def __init__(
        self,
        reason: str,
        reason_code: str,
        module_key: str,
        status_code: int = 403
    ):
        detail = {
            "error": "license_enforcement_failed",
            "message": reason,
            "reason_code": reason_code,
            "module_key": module_key
        }
        super().__init__(status_code=status_code, detail=detail)


def require_module_license(
    module_key: str,
    log_blocked: bool = True
):
    """
    Decorator to enforce module license checks on API routes.
    
    Args:
        module_key: The module code to check (e.g., 'flow_builder')
        log_blocked: Whether to log blocked access to audit log
    
    Usage:
        @router.get("/flows")
        @require_module_license("flow_builder")
        async def get_flows(current_user = Depends(get_current_user)):
            ...
    
    Returns:
        Decorator function
    """
    def decorator(func: Callable):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # Get current_user from kwargs (injected by Depends)
            current_user = kwargs.get('current_user')
            
            if not current_user:
                # Try to find user in args (for request-based handlers)
                for arg in args:
                    if hasattr(arg, 'id') and hasattr(arg, 'tenant_id'):
                        current_user = arg
                        break
            
            if not current_user:
                raise HTTPException(
                    status_code=401,
                    detail="Authentication required for license check"
                )
            
            # Get the feature access service
            service = get_feature_access_service(db)
            
            # Check feature access
            result = await service.check_feature_access(
                user_id=current_user.id,
                tenant_id=current_user.tenant_id,
                module_key=module_key,
                log_blocked=log_blocked
            )
            
            if not result.allowed:
                raise LicenseEnforcementError(
                    reason=result.reason,
                    reason_code=result.reason_code,
                    module_key=module_key
                )
            
            # License check passed, continue with the request
            return await func(*args, **kwargs)
        
        return wrapper
    return decorator


async def check_module_access(
    user_id: str,
    tenant_id: str,
    module_key: str,
    raise_on_denied: bool = True,
    log_blocked: bool = True
) -> FeatureAccessResult:
    """
    Async function to check module access.
    Can be used in route handlers for explicit checks.
    
    Args:
        user_id: User ID
        tenant_id: Tenant ID
        module_key: Module code to check
        raise_on_denied: If True, raises LicenseEnforcementError on denial
        log_blocked: Whether to log blocked access
    
    Returns:
        FeatureAccessResult
    
    Raises:
        LicenseEnforcementError: If raise_on_denied and access is denied
    """
    service = get_feature_access_service(db)
    
    result = await service.check_feature_access(
        user_id=user_id,
        tenant_id=tenant_id,
        module_key=module_key,
        log_blocked=log_blocked
    )
    
    if not result.allowed and raise_on_denied:
        raise LicenseEnforcementError(
            reason=result.reason,
            reason_code=result.reason_code,
            module_key=module_key
        )
    
    return result


class LicenseEnforcementMiddleware:
    """
    FastAPI middleware for enforcing license checks on all routes.
    
    This middleware intercepts requests and checks if the route requires
    a specific license. If so, it validates the user's access before
    proceeding.
    
    Usage in server.py:
        from shared.services.license_enforcement import LicenseEnforcementMiddleware
        
        # Define route-to-module mapping
        ROUTE_MODULE_MAP = {
            "/api/flows": "flow_builder",
            "/api/forms": "form_builder",
        }
        
        app.add_middleware(LicenseEnforcementMiddleware, route_module_map=ROUTE_MODULE_MAP)
    """
    
    # Default route-to-module mapping
    DEFAULT_ROUTE_MODULE_MAP = {
        # Flow Builder
        "/api/flows": "flow_builder",
        "/api/flow-builder": "flow_builder",
        "/api/automation": "flow_builder",
        
        # Form Builder
        "/api/form-builder": "form_builder",
        "/api/forms": "form_builder",
        "/api/web-forms": "form_builder",
        
        # DocFlow
        "/api/docflow": "docflow",
        "/api/document-templates": "docflow",
        "/api/doc-builder": "docflow",
        
        # Survey Builder
        "/api/survey-builder": "survey_builder",
        "/api/surveys": "survey_builder",
        
        # Chatbot Manager
        "/api/chatbot": "chatbot_manager",
        "/api/chatbots": "chatbot_manager",
        
        # Task Manager
        "/api/task-manager": "task_manager",
        "/api/tasks": "task_manager",
        
        # Schema Builder (Admin Console)
        "/api/schema-builder": "schema_builder",
        "/api/custom-objects": "schema_builder",
    }
    
    def __init__(
        self,
        app,
        route_module_map: Optional[dict] = None,
        exempt_routes: Optional[list] = None
    ):
        self.app = app
        self.route_module_map = route_module_map or self.DEFAULT_ROUTE_MODULE_MAP
        self.exempt_routes = exempt_routes or [
            "/api/auth",
            "/api/admin",
            "/api/feature-access",
            "/api/user-licenses",
            "/api/runtime",
            "/api/health",
            "/docs",
            "/openapi.json"
        ]
    
    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        
        # Get the request path
        path = scope.get("path", "")
        
        # Check if route is exempt
        for exempt in self.exempt_routes:
            if path.startswith(exempt):
                await self.app(scope, receive, send)
                return
        
        # Find matching module for this route
        module_key = None
        for route_prefix, module in self.route_module_map.items():
            if path.startswith(route_prefix):
                module_key = module
                break
        
        if not module_key:
            # No license required for this route
            await self.app(scope, receive, send)
            return
        
        # For middleware, we need to proceed anyway and let the
        # decorator handle the enforcement, since we don't have
        # access to the authenticated user at this point
        # The decorator @require_module_license is the primary enforcement
        await self.app(scope, receive, send)


# Export common module keys for easy use
class ModuleKey:
    """Module key constants for license checks"""
    FLOW_BUILDER = "flow_builder"
    FORM_BUILDER = "form_builder"
    DOCFLOW = "docflow"
    SURVEY_BUILDER = "survey_builder"
    CHATBOT_MANAGER = "chatbot_manager"
    TASK_MANAGER = "task_manager"
    SCHEMA_BUILDER = "schema_builder"
    CRM = "crm"
    FILE_MANAGER = "file_manager"
    APP_MANAGER = "app_manager"
    IMPORT_BUILDER = "import_builder"
    EXPORT_BUILDER = "export_builder"
