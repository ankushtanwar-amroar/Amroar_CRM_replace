"""
Audit Module Dependencies

Provides database and authentication dependencies for audit routes.
Uses runtime imports to avoid circular import issues with server.py
"""

import os
from functools import lru_cache
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

# Database connection (singleton)
_db_client = None
_db = None


def get_audit_db() -> AsyncIOMotorDatabase:
    """Get database connection for audit module"""
    global _db_client, _db
    if _db is None:
        mongo_url = os.environ.get("MONGO_URL")
        db_name = os.environ.get("DB_NAME", "crm_platform")
        _db_client = AsyncIOMotorClient(mongo_url)
        _db = _db_client[db_name]
    return _db


def get_current_user_dependency():
    """
    Returns the get_current_user dependency from server.py
    This is called at route definition time, not import time,
    avoiding circular imports.
    """
    from server import get_current_user
    return get_current_user
