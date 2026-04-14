"""
CRM Connection API Routes - For tenant users to manage their connections
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import Optional, List
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import jwt

from modules.integrations.models.integration_models import (
    ConnectionCreate, ConnectionUpdate, ConnectionResponse,
    ConnectionTestResult, ProviderResponse, CategoryResponse
)
from modules.integrations.services.integration_service import (
    ConnectionService, ProviderService, CategoryService, RuntimeGatewayService
)

logger = logging.getLogger(__name__)

# Database connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

router = APIRouter(prefix="/connections", tags=["Connections"])
security = HTTPBearer()

JWT_SECRET = os.environ.get('JWT_SECRET', 'your-secret-key-here-change-in-production')
ALGORITHM = "HS256"


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Verify JWT token and return current user with tenant_id"""
    try:
        token = credentials.credentials
        payload = jwt.decode(token, JWT_SECRET, algorithms=[ALGORITHM])
        user_id = payload.get("user_id")
        tenant_id = payload.get("tenant_id")
        
        if not user_id or not tenant_id:
            raise HTTPException(status_code=401, detail="Invalid token")
        
        user = await db.users.find_one({"id": user_id}, {"_id": 0})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        
        return {
            "user_id": user_id,
            "tenant_id": tenant_id,
            "email": user.get("email"),
            "role": user.get("role"),
            "is_super_admin": user.get("is_super_admin", False)
        }
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")


def require_connection_admin(user: dict):
    """Check if user can manage connections (admin or super_admin)"""
    if not (user.get("is_super_admin") or user.get("role") in ["admin", "system_administrator"]):
        raise HTTPException(
            status_code=403, 
            detail="You must be an administrator to manage connections"
        )


# ============================================================================
# READ-ONLY ENDPOINTS (Available to all authenticated users)
# ============================================================================

@router.get("/categories", response_model=List[CategoryResponse])
async def list_categories(
    current_user: dict = Depends(get_current_user)
):
    """List all available integration categories"""
    service = CategoryService(db)
    return await service.list_categories(include_inactive=False)


@router.get("/providers", response_model=List[ProviderResponse])
async def list_providers(
    category_id: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user)
):
    """List all available providers, optionally filtered by category"""
    service = ProviderService(db)
    return await service.list_providers(category_id=category_id, include_inactive=False)


@router.get("/providers/{provider_id}", response_model=ProviderResponse)
async def get_provider(
    provider_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a provider by ID (to show auth schema for connection setup)"""
    service = ProviderService(db)
    provider = await service.get_provider(provider_id)
    if not provider or not provider.get("is_active"):
        raise HTTPException(status_code=404, detail="Provider not found")
    return provider


# ============================================================================
# CONNECTION MANAGEMENT (Admin only)
# ============================================================================

@router.get("/", response_model=List[ConnectionResponse])
async def list_connections(
    category_id: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user)
):
    """List all connections for the tenant"""
    service = ConnectionService(db)
    return await service.list_connections(
        workspace_id=current_user["tenant_id"],
        category_id=category_id
    )


@router.get("/{connection_id}", response_model=ConnectionResponse)
async def get_connection(
    connection_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a connection by ID"""
    service = ConnectionService(db)
    connection = await service.get_connection(
        connection_id=connection_id,
        workspace_id=current_user["tenant_id"],
        include_credentials=True
    )
    if not connection:
        raise HTTPException(status_code=404, detail="Connection not found")
    return connection


@router.post("/", response_model=ConnectionResponse)
async def create_connection(
    data: ConnectionCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a new connection (admin only)"""
    require_connection_admin(current_user)
    
    service = ConnectionService(db)
    try:
        return await service.create_connection(
            workspace_id=current_user["tenant_id"],
            user_id=current_user["user_id"],
            data=data.model_dump()
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/{connection_id}", response_model=ConnectionResponse)
async def update_connection(
    connection_id: str,
    data: ConnectionUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update a connection (admin only)"""
    require_connection_admin(current_user)
    
    service = ConnectionService(db)
    try:
        result = await service.update_connection(
            connection_id=connection_id,
            workspace_id=current_user["tenant_id"],
            data=data.model_dump(exclude_unset=True)
        )
        if not result:
            raise HTTPException(status_code=404, detail="Connection not found")
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{connection_id}")
async def delete_connection(
    connection_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete (archive) a connection (admin only)"""
    require_connection_admin(current_user)
    
    service = ConnectionService(db)
    success = await service.delete_connection(
        connection_id=connection_id,
        workspace_id=current_user["tenant_id"]
    )
    if not success:
        raise HTTPException(status_code=404, detail="Connection not found")
    return {"message": "Connection archived"}


# ============================================================================
# CONNECTION ACTIONS
# ============================================================================

@router.post("/{connection_id}/test", response_model=ConnectionTestResult)
async def test_connection(
    connection_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Test a connection (admin only)"""
    require_connection_admin(current_user)
    
    service = ConnectionService(db)
    try:
        return await service.test_connection(
            connection_id=connection_id,
            workspace_id=current_user["tenant_id"]
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/{connection_id}/activate", response_model=ConnectionResponse)
async def activate_connection(
    connection_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Activate a validated connection (admin only)"""
    require_connection_admin(current_user)
    
    service = ConnectionService(db)
    try:
        result = await service.activate(
            connection_id=connection_id,
            workspace_id=current_user["tenant_id"]
        )
        if not result:
            raise HTTPException(status_code=404, detail="Connection not found")
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{connection_id}/deactivate", response_model=ConnectionResponse)
async def deactivate_connection(
    connection_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Deactivate a connection (admin only)"""
    require_connection_admin(current_user)
    
    service = ConnectionService(db)
    result = await service.deactivate(
        connection_id=connection_id,
        workspace_id=current_user["tenant_id"]
    )
    if not result:
        raise HTTPException(status_code=404, detail="Connection not found")
    return result


@router.post("/{connection_id}/set-default", response_model=ConnectionResponse)
async def set_default_connection(
    connection_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Set a connection as default for its category (admin only)"""
    require_connection_admin(current_user)
    
    service = ConnectionService(db)
    result = await service.set_default(
        connection_id=connection_id,
        workspace_id=current_user["tenant_id"]
    )
    if not result:
        raise HTTPException(status_code=404, detail="Connection not found")
    return result


@router.post("/{connection_id}/duplicate", response_model=ConnectionResponse)
async def duplicate_connection(
    connection_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Duplicate an existing connection (admin only)"""
    require_connection_admin(current_user)

    service = ConnectionService(db)
    try:
        result = await service.duplicate_connection(
            connection_id=connection_id,
            workspace_id=current_user["tenant_id"],
            user_id=current_user["user_id"]
        )
        if not result:
            raise HTTPException(status_code=404, detail="Connection not found")
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{connection_id}/logs")
async def get_connection_logs(
    connection_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get validation/test logs for a connection"""
    service = ConnectionService(db)
    conn = await service.get_connection(
        connection_id=connection_id,
        workspace_id=current_user["tenant_id"]
    )
    if not conn:
        raise HTTPException(status_code=404, detail="Connection not found")

    logs = await db.connection_validation_logs.find(
        {"connection_id": connection_id}, {"_id": 0}
    ).sort("tested_at", -1).to_list(50)
    return logs


# ============================================================================
# RUNTIME GATEWAY ENDPOINTS (For flows and automations)
# ============================================================================

@router.get("/runtime/default/{category_slug}")
async def get_default_connection_for_category(
    category_slug: str,
    current_user: dict = Depends(get_current_user)
):
    """Get the default connection for a category (used by flow builder)"""
    gateway = RuntimeGatewayService(db)
    connection = await gateway.get_default_connection(
        workspace_id=current_user["tenant_id"],
        category_slug=category_slug
    )
    if not connection:
        raise HTTPException(
            status_code=404, 
            detail=f"No active connection found for category '{category_slug}'"
        )
    return connection


@router.post("/runtime/execute/{connection_id}")
async def execute_via_gateway(
    connection_id: str,
    method: str = Query(...),
    endpoint: str = Query(...),
    headers: Optional[dict] = None,
    body: Optional[dict] = None,
    current_user: dict = Depends(get_current_user)
):
    """
    Execute an HTTP request through the runtime gateway.
    This is used by flows and automations to make API calls
    without exposing credentials.
    """
    gateway = RuntimeGatewayService(db)
    try:
        return await gateway.execute_request(
            connection_id=connection_id,
            workspace_id=current_user["tenant_id"],
            method=method,
            endpoint=endpoint,
            headers=headers,
            body=body
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))



# ============================================================================
# SALESFORCE OAUTH FLOW
# ============================================================================

import hashlib
import secrets
import httpx
from datetime import datetime, timezone, timedelta
from urllib.parse import urlencode
from fastapi.responses import RedirectResponse
from modules.integrations.services.encryption_service import encrypt_credentials, decrypt_credentials


def _sf_login_url(environment: str, custom_domain: str = "") -> str:
    """Return the correct Salesforce login base URL.
    For custom domains, use https://<domain> directly."""
    if environment == "custom" and custom_domain:
        domain = custom_domain.strip().rstrip("/")
        if not domain.startswith("https://"):
            domain = f"https://{domain}"
        return domain
    if environment == "sandbox":
        return "https://test.salesforce.com"
    return "https://login.salesforce.com"


def _ensure_https(url: str) -> str:
    """Guarantee a URL starts with https://."""
    url = url.strip().rstrip("/")
    if not url:
        return url
    if not url.startswith("https://") and not url.startswith("http://"):
        url = f"https://{url}"
    return url


@router.post("/salesforce/initiate-oauth")
async def initiate_salesforce_oauth(
    body: dict,
    current_user: dict = Depends(get_current_user),
):
    """
    Step 1 of OAuth: Create/update connection and return the Salesforce authorization URL.
    Frontend opens this URL in a popup or redirect.
    """
    require_connection_admin(current_user)

    connection_id = body.get("connection_id")
    consumer_key = body.get("consumer_key", "").strip()
    consumer_secret = body.get("consumer_secret", "").strip()
    environment = body.get("environment", "production")
    custom_domain = body.get("custom_domain", "").strip()
    name = body.get("name", "Salesforce Connection")

    if not consumer_key or not consumer_secret:
        raise HTTPException(status_code=400, detail="Consumer Key and Consumer Secret are required")

    # Custom domain is required when environment == "custom"
    if environment == "custom" and not custom_domain:
        raise HTTPException(status_code=400, detail="Custom Domain URL is required for My Domain connections")

    workspace_id = current_user["tenant_id"]

    # Build callback URL
    backend_url = os.environ.get("BACKEND_URL", "").rstrip("/")
    if not backend_url:
        raise HTTPException(status_code=500, detail="BACKEND_URL not configured")
    callback_url = f"{backend_url}/api/connections/salesforce/callback"

    # Generate CSRF state token
    state_token = secrets.token_urlsafe(32)

    # Store credentials (consumer_key + consumer_secret) and state token
    creds = {
        "consumer_key": consumer_key,
        "consumer_secret": consumer_secret,
        "environment": environment,
        "custom_domain": custom_domain,
    }
    encrypted_creds = encrypt_credentials(creds)
    now = datetime.now(timezone.utc)

    if connection_id:
        # Update existing connection
        await db.tenant_connections.update_one(
            {"id": connection_id, "workspace_id": workspace_id},
            {"$set": {
                "credentials": encrypted_creds,
                "oauth_state": state_token,
                "name": name,
                "updated_at": now,
            }}
        )
    else:
        # Check if a draft OAuth connection already exists for this workspace
        # to prevent duplicates from repeated clicks
        import uuid
        provider = await db.integration_providers.find_one({"slug": "salesforce"}, {"_id": 0})
        if not provider:
            raise HTTPException(status_code=400, detail="Salesforce provider not found")

        category = await db.integration_categories.find_one({"slug": "crm_sync"}, {"_id": 0})

        existing_draft = await db.tenant_connections.find_one({
            "workspace_id": workspace_id,
            "provider_id": provider["id"],
            "name": name,
            "status": "draft",
            "oauth_state": {"$ne": None},
        })

        if existing_draft:
            # Reuse existing draft instead of creating a duplicate
            connection_id = existing_draft["id"]
            await db.tenant_connections.update_one(
                {"id": connection_id},
                {"$set": {
                    "credentials": encrypted_creds,
                    "oauth_state": state_token,
                    "updated_at": now,
                }}
            )
        else:
            connection_id = str(uuid.uuid4())
            await db.tenant_connections.insert_one({
                "id": connection_id,
                "workspace_id": workspace_id,
                "provider_id": provider["id"],
                "category_id": category["id"] if category else "",
                "name": name,
                "credentials": encrypted_creds,
                "credentials_masked": {},
                "status": "draft",
                "is_active": True,
                "oauth_state": state_token,
                "is_default": False,
                "last_tested_at": None,
                "last_test_status": None,
                "created_at": now,
                "updated_at": now,
                "created_by": current_user["user_id"],
            })

    # Build Salesforce authorization URL
    sf_login = _sf_login_url(environment, custom_domain)
    auth_params = urlencode({
        "response_type": "code",
        "client_id": consumer_key,
        "redirect_uri": callback_url,
        "state": f"{connection_id}:{state_token}",
        "prompt": "login consent",
        "scope": "api refresh_token",
    })
    authorization_url = f"{sf_login}/services/oauth2/authorize?{auth_params}"

    logger.info(f"Salesforce OAuth initiated — redirect_uri={callback_url}, scope=api refresh_token")

    return {
        "authorization_url": authorization_url,
        "connection_id": connection_id,
        "callback_url": callback_url,
    }


@router.get("/salesforce/callback")
async def salesforce_oauth_callback(
    code: str = Query(None),
    state: str = Query(None),
    error: str = Query(None),
    error_description: str = Query(None),
):
    """
    Step 2 of OAuth: Salesforce redirects here with an authorization code.
    Exchange code for tokens and redirect to frontend.
    """
    frontend_url = os.environ.get("FRONTEND_URL", "").rstrip("/")
    redirect_base = f"{frontend_url}/setup/connections"

    # Handle SF error redirect
    if error:
        logger.error(f"Salesforce OAuth error: {error} — {error_description}")
        # Provide user-friendly messages for common errors
        user_message = error_description or error
        if error == "invalid_scope":
            user_message = "Invalid OAuth scope. Please verify your Salesforce Connected App has 'api' and 'refresh_token' scopes enabled."
        elif error == "redirect_uri_mismatch":
            user_message = f"Redirect URI mismatch. Ensure your Salesforce Connected App Callback URL is exactly: {frontend_url}/api/connections/salesforce/callback"
        elif error == "access_denied":
            user_message = "Access denied. The Salesforce user declined the authorization request or lacks permissions."
        return RedirectResponse(
            url=f"{redirect_base}?oauth=error&message={user_message}"
        )

    if not code or not state:
        return RedirectResponse(url=f"{redirect_base}?oauth=error&message=Missing+code+or+state")

    # Parse state → connection_id : state_token
    parts = state.split(":", 1)
    if len(parts) != 2:
        return RedirectResponse(url=f"{redirect_base}?oauth=error&message=Invalid+state")

    connection_id, state_token = parts

    # Validate state against stored value
    conn = await db.tenant_connections.find_one({"id": connection_id})
    if not conn:
        return RedirectResponse(url=f"{redirect_base}?oauth=error&message=Connection+not+found")

    if conn.get("oauth_state") != state_token:
        return RedirectResponse(url=f"{redirect_base}?oauth=error&message=Invalid+state+token")

    # Decrypt stored credentials to get consumer_key, consumer_secret, environment
    creds = decrypt_credentials(conn["credentials"])
    consumer_key = creds.get("consumer_key", "")
    consumer_secret = creds.get("consumer_secret", "")
    environment = creds.get("environment", "production")
    custom_domain = creds.get("custom_domain", "")

    backend_url = os.environ.get("BACKEND_URL", "").rstrip("/")
    callback_url = f"{backend_url}/api/connections/salesforce/callback"

    # Exchange authorization code for tokens
    sf_login = _sf_login_url(environment, custom_domain)
    token_url = f"{sf_login}/services/oauth2/token"

    token_payload = {
        "grant_type": "authorization_code",
        "code": code,
        "client_id": consumer_key,
        "client_secret": consumer_secret,
        "redirect_uri": callback_url,
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as http:
            resp = await http.post(token_url, data=token_payload)

        if resp.status_code != 200:
            logger.error(f"Salesforce token exchange failed ({resp.status_code}): {resp.text}")
            return RedirectResponse(
                url=f"{redirect_base}?oauth=error&message=Token+exchange+failed"
            )

        token_data = resp.json()
        access_token = token_data.get("access_token", "")
        refresh_token = token_data.get("refresh_token", "")
        instance_url = token_data.get("instance_url", "")
        expires_in = token_data.get("expires_in")

        logger.info(f"Salesforce token exchange success — instance_url={instance_url}, has_refresh={bool(refresh_token)}, expires_in={expires_in}")

        if not access_token:
            return RedirectResponse(
                url=f"{redirect_base}?oauth=error&message=No+access_token+received"
            )

        # Calculate token expiry
        token_expires_at = None
        if expires_in:
            token_expires_at = (datetime.now(timezone.utc) + timedelta(seconds=int(expires_in))).isoformat()

        # Store full credentials securely
        full_creds = {
            "consumer_key": consumer_key,
            "consumer_secret": consumer_secret,
            "environment": environment,
            "custom_domain": custom_domain,
            "access_token": access_token,
            "refresh_token": refresh_token,
            "instance_url": _ensure_https(instance_url),
            "token_expires_at": token_expires_at,
        }
        encrypted = encrypt_credentials(full_creds)
        now = datetime.now(timezone.utc)

        await db.tenant_connections.update_one(
            {"id": connection_id},
            {"$set": {
                "credentials": encrypted,
                "status": "validated",
                "oauth_state": None,
                "last_tested_at": now,
                "last_test_status": "success",
                "updated_at": now,
            }}
        )

        logger.info(f"Salesforce OAuth success for connection {connection_id}")
        return RedirectResponse(
            url=f"{redirect_base}?oauth=success&connection_id={connection_id}"
        )

    except Exception as e:
        logger.error(f"Salesforce OAuth callback error: {e}")
        return RedirectResponse(
            url=f"{redirect_base}?oauth=error&message=Server+error+during+token+exchange"
        )
