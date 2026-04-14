"""
Schema Builder Module
=====================
Admin-only module for defining Objects, Fields, and Relationships.
Acts as a metadata configuration layer - does NOT modify existing CRM core logic.

This module is strictly isolated from the existing CRM implementation.
The CRM consumes schema definitions via the metadata API.
"""

from .api.objects_api import router as objects_router
from .api.fields_api import router as fields_router
from .api.relationships_api import router as relationships_router
from .api.metadata_api import router as metadata_api_router
from .api.visualization_api import router as visualization_router

__all__ = [
    'objects_router',
    'fields_router', 
    'relationships_router',
    'metadata_api_router',
    'visualization_router'
]
