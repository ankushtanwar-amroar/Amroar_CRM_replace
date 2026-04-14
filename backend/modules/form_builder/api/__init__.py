"""
Form Builder API Routes
Main router that combines all form builder routes.

Split into modules for maintainability:
- form_builder_crud_routes.py: Create, Read, Update, Delete, Submit operations
- form_builder_ai_routes.py: AI-powered form generation and CRM mapping
"""
from fastapi import APIRouter
import logging

logger = logging.getLogger(__name__)

# Create main router
router = APIRouter()

# Import and include sub-routers
from .form_builder_crud_routes import router as crud_router
from .form_builder_ai_routes import router as ai_router

# Include all sub-routers
router.include_router(crud_router)
router.include_router(ai_router)

logger.info("Form Builder API routes loaded from modular files")
