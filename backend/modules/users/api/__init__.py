"""Users API exports"""
from .users_routes import router, require_admin

__all__ = ['router', 'require_admin']
