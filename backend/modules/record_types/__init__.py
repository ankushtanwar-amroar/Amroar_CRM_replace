"""
Record Types Module
Extracted from server.py as part of Step 5 refactoring.
"""
from fastapi import APIRouter

from .api.record_types_routes import router as record_types_router

__all__ = ["record_types_router"]
