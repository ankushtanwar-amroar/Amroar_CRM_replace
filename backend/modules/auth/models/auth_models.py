"""
Auth Module Models
Pydantic models for authentication and authorization.
"""
from pydantic import BaseModel, EmailStr


class AcceptInviteRequest(BaseModel):
    """Request model for accepting invitation"""
    token: str
    password: str


class ForgotPasswordRequest(BaseModel):
    """Request model for forgot password"""
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    """Request model for resetting password"""
    token: str
    new_password: str


class VerifyResetTokenRequest(BaseModel):
    """Request model for verifying reset token"""
    token: str
