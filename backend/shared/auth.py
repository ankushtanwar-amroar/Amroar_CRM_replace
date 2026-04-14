"""
Shared Authentication Module
Provides authentication utilities and JWT handling.
"""
import os
import jwt
from datetime import datetime, timezone, timedelta
from fastapi import HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from passlib.context import CryptContext

from .database import db

# Security configuration
JWT_SECRET = os.environ.get('JWT_SECRET', 'your-secret-key-here-change-in-production')
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 24

# Password hashing context
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Bearer token security scheme
security = HTTPBearer()


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plain password against its hash."""
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    """Hash a password using bcrypt."""
    return pwd_context.hash(password)


def create_access_token(data: dict) -> str:
    """
    Create a JWT access token.
    
    Args:
        data: Dictionary containing user_id and tenant_id
        
    Returns:
        Encoded JWT token string
    """
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, JWT_SECRET, algorithm=ALGORITHM)
    return encoded_jwt


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """
    Dependency to get and validate the current authenticated user.
    
    Validates JWT token and checks user status (active, frozen).
    
    Returns:
        User model instance
        
    Raises:
        HTTPException: If authentication fails or user is inactive/frozen
    """
    # Import User model here to avoid circular imports
    # The User model is defined in shared.models
    from shared.models import User
    
    try:
        token = credentials.credentials
        payload = jwt.decode(token, JWT_SECRET, algorithms=[ALGORITHM])
        user_id: str = payload.get("user_id")
        tenant_id: str = payload.get("tenant_id")
        if user_id is None or tenant_id is None:
            raise HTTPException(status_code=401, detail="Invalid authentication credentials")
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid authentication credentials")
    
    user = await db.users.find_one({"id": user_id, "tenant_id": tenant_id}, {"_id": 0})
    if user is None:
        raise HTTPException(status_code=401, detail="User not found")
    
    # Check if user is active (Phase 1: User Deactivation)
    if not user.get("is_active", True):
        raise HTTPException(
            status_code=401, 
            detail="Your account has been deactivated. Please contact your administrator."
        )
    
    # Check if user is frozen (User Freeze Feature)
    if user.get("is_frozen", False):
        frozen_until = user.get("frozen_until")
        
        # Check if freeze period has expired
        if frozen_until:
            # Convert to datetime if string
            if isinstance(frozen_until, str):
                frozen_until = datetime.fromisoformat(frozen_until.replace('Z', '+00:00'))
            
            if datetime.now(timezone.utc) > frozen_until:
                # Auto-unfreeze if period expired
                await db.users.update_one(
                    {"id": user_id},
                    {
                        "$set": {"is_frozen": False},
                        "$unset": {"frozen_until": "", "frozen_at": "", "frozen_by": "", "freeze_reason": ""}
                    }
                )
            else:
                # Still frozen
                freeze_msg = f"Your account has been temporarily frozen"
                freeze_msg += f" until {frozen_until.strftime('%Y-%m-%d %H:%M UTC')}"
                freeze_msg += ". Please contact your administrator."
                raise HTTPException(status_code=403, detail=freeze_msg)
        else:
            # Frozen indefinitely
            freeze_msg = "Your account has been temporarily frozen. Please contact your administrator."
            raise HTTPException(status_code=403, detail=freeze_msg)
    
    return User(**user)


async def get_current_user_dict(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """
    Simplified authentication dependency that returns a dict.
    For modules that need basic user_id and tenant_id without full User model.
    
    Returns:
        dict with user_id and tenant_id
    """
    try:
        token = credentials.credentials
        payload = jwt.decode(token, JWT_SECRET, algorithms=[ALGORITHM])
        user_id: str = payload.get("user_id")
        tenant_id: str = payload.get("tenant_id")
        if user_id is None or tenant_id is None:
            raise HTTPException(status_code=401, detail="Invalid authentication credentials")
        return {"user_id": user_id, "tenant_id": tenant_id}
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid authentication credentials")
