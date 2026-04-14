"""
Global Search Module
Provides unified search across all CRM objects (standard and custom).

This module is ISOLATED and does NOT contain logic from:
- Object controllers
- Field services
- Record services

All object/field metadata is consumed via dedicated services.
"""
from .api.search_routes import router as global_search_router

__all__ = ['global_search_router']
