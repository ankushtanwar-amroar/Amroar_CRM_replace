"""
Phase 1: Token Service
Handles generation and validation of invitation and password reset tokens.
"""
import secrets
from datetime import datetime, timezone, timedelta
from typing import Tuple, Optional


def generate_invitation_token() -> Tuple[str, datetime]:
    """
    Generate a secure invitation token and its expiry datetime.
    
    Returns:
        Tuple of (token_string, expires_at_datetime)
        Token expires 7 days from now.
    """
    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    return token, expires_at


def generate_reset_token() -> Tuple[str, datetime]:
    """
    Generate a secure password reset token and its expiry datetime.
    
    Returns:
        Tuple of (token_string, expires_at_datetime)
        Token expires 1 hour from now.
    """
    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(hours=1)
    return token, expires_at


def validate_token(
    token: Optional[str], 
    expires_at: Optional[datetime]
) -> Tuple[bool, Optional[str]]:
    """
    Validate a token (invitation or reset).
    
    Args:
        token: The token string to validate
        expires_at: The expiry datetime of the token
    
    Returns:
        Tuple of (is_valid: bool, error_message: str or None)
    """
    if not token:
        return False, "Invalid or missing token"
    
    if not expires_at:
        return False, "Token expiry information missing"
    
    # Check if token has expired - ensure both datetimes are timezone-aware
    now = datetime.now(timezone.utc)
    
    # Convert expires_at to timezone-aware if it isn't
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at.replace('Z', '+00:00'))
    elif expires_at.tzinfo is None:
        # Make it timezone-aware (assume UTC)
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    
    if expires_at < now:
        return False, "This token has expired"
    
    return True, None
