"""
Config Module - Navigation, User Preferences, and Lookup Preview Configuration
Extracted from server.py as part of Step 5 refactoring.
"""
from fastapi import APIRouter

from .api.nav_config_routes import router as nav_config_router
from .api.user_preferences_routes import router as user_preferences_router
from .api.lookup_preview_routes import router as lookup_preview_router

# Combined router for all config routes
config_router = APIRouter()
config_router.include_router(nav_config_router, tags=["Navigation Config"])
config_router.include_router(user_preferences_router, tags=["User Preferences"])
config_router.include_router(lookup_preview_router, tags=["Lookup Preview Config"])

__all__ = ["config_router"]
