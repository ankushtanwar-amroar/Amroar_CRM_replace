"""
Actions Module
Salesforce-like configurable Quick Actions for CRM objects
"""
from .api.action_routes import router as actions_router

__all__ = ['actions_router']
