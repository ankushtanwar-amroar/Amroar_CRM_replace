"""
List Views Module
Handles user-defined list view management.
"""
from .api.list_view_routes import router as list_views_router

__all__ = ['list_views_router']
