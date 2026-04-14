"""
Admin Portal Module
Completely isolated module for platform administration
"""
from .api.admin_routes import router as admin_router
from .api.license_routes import router as license_router

# Merge license routes into admin router
admin_router.include_router(license_router)

__all__ = ['admin_router', 'license_router']
