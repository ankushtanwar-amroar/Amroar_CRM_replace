"""
Shared Module - Common utilities used across the application.
This module re-exports key components for backward compatibility.
"""
from .database import db, client, prepare_for_mongo, parse_from_mongo
from .auth import (
    verify_password,
    get_password_hash,
    create_access_token,
    get_current_user,
    security,
    pwd_context,
    JWT_SECRET,
    ALGORITHM,
    ACCESS_TOKEN_EXPIRE_HOURS
)
from .models import User, CustomField, CustomFieldCreate, CustomFieldUpdate
from .constants import PAGE_LAYOUTS, DEFAULT_NAV_ORDER, LOCKED_OBJECTS

__all__ = [
    # Database
    'db',
    'client',
    'prepare_for_mongo',
    'parse_from_mongo',
    # Auth
    'verify_password',
    'get_password_hash',
    'create_access_token',
    'get_current_user',
    'security',
    'pwd_context',
    'JWT_SECRET',
    'ALGORITHM',
    'ACCESS_TOKEN_EXPIRE_HOURS',
    # Models
    'User',
    'CustomField',
    'CustomFieldCreate',
    'CustomFieldUpdate',
    # Constants
    'PAGE_LAYOUTS',
    'DEFAULT_NAV_ORDER',
    'LOCKED_OBJECTS',
]
