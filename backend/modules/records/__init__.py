"""
Records Module
CRUD operations for object records.
"""
from .api.records_routes import router as records_router

__all__ = ['records_router']
