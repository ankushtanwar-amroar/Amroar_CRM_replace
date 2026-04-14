"""
Runtime Enforcement Middleware - Control Plane Integration
FastAPI middleware for global subscription status checking.

This middleware runs on every authenticated request and:
1. Checks tenant subscription status
2. Adds warnings to response headers for soft enforcement
3. Blocks requests for terminated/suspended tenants

Note: Module-specific and limit-specific enforcement is handled
by the dependencies in enforcement_dependencies.py.
"""
import logging
from typing import Optional, Callable
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse
import jwt

from config.database import db
from shared.services.runtime_enforcement_service import get_enforcement_service

logger = logging.getLogger(__name__)

# JWT settings (should match server.py)
import os
JWT_SECRET = os.environ.get('JWT_SECRET', 'your-secret-key-here-change-in-production')
ALGORITHM = "HS256"

# Paths that should skip enforcement (public routes, admin routes, etc.)
SKIP_ENFORCEMENT_PATHS = [
    "/api/auth/",
    "/api/admin/",
    "/api/health",
    "/api/docs",
    "/api/openapi.json",
    "/api/form-builder/public/",
    "/api/survey-v2/public/",
    "/api/booking/public/",
    "/api/chatbot-embed/",
    "/docs",
    "/redoc",
]


class EnforcementMiddleware(BaseHTTPMiddleware):
    """
    Middleware that enforces subscription status on all authenticated requests.
    
    Behavior:
    - ACTIVE: Allow request
    - PENDING/PROVISIONING: Allow request (grace period)
    - READ_ONLY: Allow GET requests, block write operations
    - SUSPENDED: Block all requests with 403
    - TERMINATED: Block all requests with 403
    - OVERDUE billing: Allow with warning header
    """
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # Skip enforcement for certain paths
        path = request.url.path
        
        # Check if path should skip enforcement
        for skip_path in SKIP_ENFORCEMENT_PATHS:
            if path.startswith(skip_path):
                return await call_next(request)
        
        # Skip for non-authenticated endpoints
        auth_header = request.headers.get("Authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            return await call_next(request)
        
        # Extract tenant_id from JWT
        try:
            token = auth_header.replace("Bearer ", "")
            payload = jwt.decode(token, JWT_SECRET, algorithms=[ALGORITHM])
            tenant_id = payload.get("tenant_id")
            
            if not tenant_id:
                return await call_next(request)
                
        except jwt.PyJWTError:
            # Let the route handler deal with invalid tokens
            return await call_next(request)
        
        # Get enforcement service and check status
        enforcement = get_enforcement_service(db)
        result = await enforcement.check_subscription_status(tenant_id)
        
        # Handle enforcement result
        if not result.allowed:
            if result.enforcement_type == "HARD_STOP":
                # Block the request
                return JSONResponse(
                    status_code=403,
                    content={
                        "detail": {
                            "error": "subscription_blocked",
                            "message": result.message,
                            "enforcement_type": result.enforcement_type
                        }
                    }
                )
            elif result.enforcement_type == "SOFT_WARNING":
                # READ_ONLY: Block write operations
                if request.method in ["POST", "PUT", "PATCH", "DELETE"]:
                    return JSONResponse(
                        status_code=403,
                        content={
                            "detail": {
                                "error": "read_only_mode",
                                "message": result.message,
                                "enforcement_type": result.enforcement_type
                            }
                        }
                    )
        
        # Process the request
        response = await call_next(request)
        
        # Add warning headers for soft enforcement
        if result.enforcement_type == "SOFT_WARNING":
            response.headers["X-Enforcement-Warning"] = result.message
            response.headers["X-Enforcement-Type"] = result.enforcement_type
        
        return response


class ModuleEnforcementMiddleware(BaseHTTPMiddleware):
    """
    Middleware that enforces module access based on URL path.
    
    Maps URL prefixes to module codes and blocks access if module is disabled.
    
    NOTE: Core CRM routes are NOT enforced here - they are always accessible.
    This only enforces access to optional/premium modules.
    """
    
    # Map URL prefixes to module codes
    # Only include OPTIONAL/PREMIUM modules that can be disabled
    # Core CRM functionality is always accessible
    MODULE_PATH_MAP = {
        "/api/flow-builder": "flow_builder",
        "/api/form-builder": "form_builder",
        "/api/survey-v2": "survey_builder",
        "/api/chatbot": "chatbot_manager",
        "/api/docflow": "docflow",
        "/api/schema-builder": "schema_builder",
        "/api/booking": "booking",
        "/api/task-manager": "task_manager",
        "/api/file-manager": "file_manager",
        # NOTE: /api/crm is NOT included - it's a core module always accessible
    }
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        path = request.url.path
        
        # Check if path requires module access
        required_module = None
        for path_prefix, module_code in self.MODULE_PATH_MAP.items():
            if path.startswith(path_prefix):
                required_module = module_code
                break
        
        if not required_module:
            return await call_next(request)
        
        # Skip public endpoints within modules
        if "/public/" in path or "/embed/" in path:
            return await call_next(request)
        
        # Extract tenant_id from JWT
        auth_header = request.headers.get("Authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            return await call_next(request)
        
        try:
            token = auth_header.replace("Bearer ", "")
            payload = jwt.decode(token, JWT_SECRET, algorithms=[ALGORITHM])
            tenant_id = payload.get("tenant_id")
            
            if not tenant_id:
                return await call_next(request)
                
        except jwt.PyJWTError:
            return await call_next(request)
        
        # Check module access
        enforcement = get_enforcement_service(db)
        result = await enforcement.check_module_access(tenant_id, required_module)
        
        if not result.allowed:
            return JSONResponse(
                status_code=403,
                content={
                    "detail": {
                        "error": "module_disabled",
                        "module_code": required_module,
                        "message": result.message,
                        "enforcement_type": result.enforcement_type
                    }
                }
            )
        
        return await call_next(request)
