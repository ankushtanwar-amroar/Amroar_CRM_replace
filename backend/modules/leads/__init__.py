"""
Leads Module - Lead conversion, web-to-lead, and search functionality
"""
from fastapi import APIRouter

from .api.leads_routes import router as leads_router

__all__ = ["leads_router"]
