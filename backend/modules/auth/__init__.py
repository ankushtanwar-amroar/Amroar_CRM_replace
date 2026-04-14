"""
Auth Module
Handles authentication and authorization.
Extracted from server.py as part of PR-1 refactoring.
"""
from .api.auth_routes import router as auth_router, get_current_user, log_audit_event
# Auth utilities are now in shared/auth.py (SSOT)
from shared.auth import verify_password, get_password_hash, create_access_token

__all__ = [
    'auth_router',
    'get_current_user',
    'log_audit_event',
    'verify_password',
    'get_password_hash',
    'create_access_token'
]
