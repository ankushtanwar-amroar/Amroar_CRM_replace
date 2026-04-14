"""
Page Assignments Module
"""
from fastapi import APIRouter

from .api.page_assignments_routes import router as page_assignments_router

__all__ = ["page_assignments_router"]
