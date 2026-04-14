"""
File Manager Module
A fully isolated, enterprise-grade file management system for CRM.
"""

from .api.file_routes import router as file_manager_router

__all__ = ['file_manager_router']
