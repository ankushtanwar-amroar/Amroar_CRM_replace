"""
Schema Builder API Routes
"""
from .objects_api import router as objects_router
from .fields_api import router as fields_router
from .relationships_api import router as relationships_router
from .metadata_api import router as metadata_api_router

__all__ = [
    'objects_router',
    'fields_router',
    'relationships_router',
    'metadata_api_router'
]
