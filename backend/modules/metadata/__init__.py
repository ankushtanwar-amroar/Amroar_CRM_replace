"""
Metadata Module
Handles object and field metadata management.
"""
from .api.metadata_routes import router as metadata_router

__all__ = ['metadata_router']
