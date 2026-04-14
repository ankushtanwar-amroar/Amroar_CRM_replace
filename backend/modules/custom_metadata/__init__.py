"""
Custom Metadata Module - Custom Field Management
Extracted from server.py as part of Step 5 refactoring.
"""
from fastapi import APIRouter

from .api.custom_metadata_routes import router as custom_metadata_router

__all__ = ["custom_metadata_router"]
