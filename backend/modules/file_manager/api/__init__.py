"""
File Manager API Routes
"""

from .file_routes import router as file_router
from .setup_routes import router as setup_router

__all__ = ['file_router', 'setup_router']
