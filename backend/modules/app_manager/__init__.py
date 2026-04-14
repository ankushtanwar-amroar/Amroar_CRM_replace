"""
App Manager Module

Provides configurable apps, pages, and components for the CRM platform.
Inspired by Salesforce Lightning App Builder.

Key Features:
- App Management: Create and configure apps (Sales, Service, etc.)
- Page Builder: Drag-and-drop page construction
- Component Library: Reusable dashboard components
- Navigation: Configurable per-app navigation

Architecture:
- Module isolation: App Manager orchestrates, doesn't own domain logic
- Data fetching goes through respective service layers (task_manager, etc.)
- JSON-based component configuration
"""
from .api.app_routes import router as app_manager_router

__all__ = ["app_manager_router"]
