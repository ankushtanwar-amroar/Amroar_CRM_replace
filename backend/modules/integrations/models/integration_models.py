"""
Integration Models - Categories, Providers, Connections
"""
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum


# ============================================================================
# ENUMS
# ============================================================================

class ConnectionStatus(str, Enum):
    DRAFT = "draft"
    VALIDATED = "validated"
    ACTIVE = "active"
    INVALID = "invalid"
    DISABLED = "disabled"
    ARCHIVED = "archived"


class AuthFieldType(str, Enum):
    TEXT = "text"
    PASSWORD = "password"
    SELECT = "select"
    URL = "url"
    TOGGLE = "toggle"
    TEXTAREA = "textarea"
    NUMBER = "number"


class AuthType(str, Enum):
    API_KEY = "api_key"
    BEARER_TOKEN = "bearer_token"
    BASIC_AUTH = "basic_auth"
    OAUTH_CLIENT_CREDENTIALS = "oauth_client_credentials"
    HMAC = "hmac"
    NO_AUTH = "no_auth"


# ============================================================================
# AUTH SCHEMA FIELD MODEL
# ============================================================================

class AuthSchemaField(BaseModel):
    """Single field in the auth schema"""
    key: str = Field(..., description="Field key/name")
    label: str = Field(..., description="Display label")
    type: AuthFieldType = Field(default=AuthFieldType.TEXT)
    required: bool = Field(default=False)
    placeholder: Optional[str] = None
    help_text: Optional[str] = None
    options: Optional[List[Dict[str, str]]] = None  # For select type
    default_value: Optional[Any] = None


# ============================================================================
# CATEGORY MODELS
# ============================================================================

class CategoryCreate(BaseModel):
    """Create a new integration category"""
    name: str = Field(..., min_length=1, max_length=100)
    slug: str = Field(..., min_length=1, max_length=50)
    icon: str = Field(default="plug")
    description: Optional[str] = None
    is_active: bool = Field(default=True)
    sort_order: int = Field(default=0)


class CategoryUpdate(BaseModel):
    """Update an integration category"""
    name: Optional[str] = None
    slug: Optional[str] = None
    icon: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None
    sort_order: Optional[int] = None


class CategoryResponse(BaseModel):
    """Category response model"""
    id: str
    name: str
    slug: str
    icon: str
    description: Optional[str]
    is_active: bool
    sort_order: int
    created_at: datetime


# ============================================================================
# PROVIDER MODELS
# ============================================================================

class TestEndpointConfig(BaseModel):
    """Configuration for testing a connection"""
    url: str = Field(..., description="Test endpoint URL")
    method: str = Field(default="GET")
    headers: Optional[Dict[str, str]] = None
    body: Optional[Dict[str, Any]] = None
    success_status: List[int] = Field(default=[200, 201])


class ProviderCreate(BaseModel):
    """Create a new integration provider"""
    name: str = Field(..., min_length=1, max_length=100)
    slug: str = Field(..., min_length=1, max_length=50)
    category_id: str
    logo_icon: str = Field(default="plug")
    description: Optional[str] = None
    auth_schema: List[AuthSchemaField] = Field(default_factory=list)
    test_endpoint: Optional[TestEndpointConfig] = None
    docs_url: Optional[str] = None
    is_active: bool = Field(default=True)


class ProviderUpdate(BaseModel):
    """Update an integration provider"""
    name: Optional[str] = None
    slug: Optional[str] = None
    category_id: Optional[str] = None
    logo_icon: Optional[str] = None
    description: Optional[str] = None
    auth_schema: Optional[List[AuthSchemaField]] = None
    test_endpoint: Optional[TestEndpointConfig] = None
    docs_url: Optional[str] = None
    is_active: Optional[bool] = None


class ProviderResponse(BaseModel):
    """Provider response model"""
    id: str
    name: str
    slug: str
    category_id: str
    category_name: Optional[str] = None
    logo_icon: str
    description: Optional[str] = None
    auth_schema: List[Dict[str, Any]]
    oauth_config: Optional[Dict[str, Any]] = None
    test_endpoint: Optional[Dict[str, Any]] = None
    docs_url: Optional[str] = None
    is_active: bool
    created_at: datetime
    updated_at: Optional[datetime] = None


# ============================================================================
# CONNECTION MODELS
# ============================================================================

class ConnectionCreate(BaseModel):
    """Create a new tenant connection"""
    name: str = Field(..., min_length=1, max_length=100)
    provider_id: str
    credentials: Dict[str, Any] = Field(..., description="Credential values")
    is_default: bool = Field(default=False)


class ConnectionUpdate(BaseModel):
    """Update a tenant connection"""
    name: Optional[str] = None
    credentials: Optional[Dict[str, Any]] = None
    is_default: Optional[bool] = None


class ConnectionResponse(BaseModel):
    """Connection response model (credentials masked)"""
    id: str
    workspace_id: str
    name: str
    category_id: str
    category_name: Optional[str] = None
    provider_id: str
    provider_name: Optional[str] = None
    provider_icon: Optional[str] = None
    credentials_masked: Dict[str, str] = {}
    is_active: bool = True
    is_default: bool = False
    status: ConnectionStatus = ConnectionStatus.DRAFT
    last_tested_at: Optional[datetime] = None
    last_test_status: Optional[str] = None
    created_by: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class ConnectionTestResult(BaseModel):
    """Result of testing a connection"""
    status: str  # success, failed, error
    http_status: Optional[int] = None
    message: str
    tested_at: datetime


# ============================================================================
# VALIDATION LOG MODEL
# ============================================================================

class ValidationLogResponse(BaseModel):
    """Validation log entry"""
    id: str
    connection_id: str
    status: str
    http_status: Optional[int]
    message: str
    tested_at: datetime
