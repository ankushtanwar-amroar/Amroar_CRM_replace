"""
Flow Builder API Routes
Main router that combines all flow-related routes.

Split into modules for maintainability:
- flows_crud_routes.py: Create, Read, Update, Delete operations
- flows_execution_routes.py: Execution, deployment, versioning, validation
- flows_webhook_routes.py: Webhook triggers and configuration
- flow_preview_api.py: Screen flow preview/debug functionality
"""
from fastapi import APIRouter
import logging

logger = logging.getLogger(__name__)

# Create main router
router = APIRouter()

# Import and include sub-routers
from .flows_crud_routes import router as crud_router
from .flows_execution_routes import router as execution_router
from .flows_webhook_routes import router as webhook_router
from .flow_preview_api import router as preview_router
from .flow_versions_api import router as versions_router

# Include all sub-routers
router.include_router(crud_router)
router.include_router(execution_router)
router.include_router(webhook_router)
router.include_router(preview_router)
router.include_router(versions_router)

logger.info("Flow Builder API routes loaded from modular files")
