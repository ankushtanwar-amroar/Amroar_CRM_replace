from .nav_config_routes import router as nav_config_router
from .user_preferences_routes import router as user_preferences_router
from .lookup_preview_routes import router as lookup_preview_router

__all__ = ["nav_config_router", "user_preferences_router", "lookup_preview_router"]
