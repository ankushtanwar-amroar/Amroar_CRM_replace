"""
Validation Rules Module
"""
from fastapi import APIRouter

from .api.validation_routes import router as validation_router

__all__ = ["validation_router"]
