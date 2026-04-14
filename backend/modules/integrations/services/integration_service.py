"""
Integration Services - Category, Provider, Connection management
"""
import uuid
import logging
import httpx
import re
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List
from motor.motor_asyncio import AsyncIOMotorDatabase

from .encryption_service import encrypt_credentials, decrypt_credentials, mask_credentials

logger = logging.getLogger(__name__)


# ============================================================================
# CATEGORY SERVICE
# ============================================================================

class CategoryService:
    """Service for managing integration categories"""
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.collection = db.integration_categories
    
    async def list_categories(self, include_inactive: bool = False) -> List[Dict]:
        """List all categories"""
        query = {} if include_inactive else {"is_active": True}
        categories = await self.collection.find(
            query, {"_id": 0}
        ).sort("sort_order", 1).to_list(100)
        return categories
    
    async def get_category(self, category_id: str) -> Optional[Dict]:
        """Get a category by ID"""
        return await self.collection.find_one(
            {"id": category_id}, {"_id": 0}
        )
    
    async def get_category_by_slug(self, slug: str) -> Optional[Dict]:
        """Get a category by slug"""
        return await self.collection.find_one(
            {"slug": slug}, {"_id": 0}
        )
    
    async def create_category(self, data: Dict) -> Dict:
        """Create a new category"""
        # Check slug uniqueness
        existing = await self.get_category_by_slug(data.get("slug", ""))
        if existing:
            raise ValueError(f"Category with slug '{data['slug']}' already exists")
        
        category = {
            "id": str(uuid.uuid4()),
            "name": data["name"],
            "slug": data["slug"],
            "icon": data.get("icon", "plug"),
            "description": data.get("description"),
            "is_active": data.get("is_active", True),
            "sort_order": data.get("sort_order", 0),
            "created_at": datetime.now(timezone.utc)
        }
        
        await self.collection.insert_one(category)
        category.pop("_id", None)
        return category
    
    async def update_category(self, category_id: str, data: Dict) -> Optional[Dict]:
        """Update a category"""
        update_data = {k: v for k, v in data.items() if v is not None}
        
        if not update_data:
            return await self.get_category(category_id)
        
        update_data["updated_at"] = datetime.now(timezone.utc)
        
        result = await self.collection.find_one_and_update(
            {"id": category_id},
            {"$set": update_data},
            return_document=True
        )
        
        if result:
            result.pop("_id", None)
        return result
    
    async def delete_category(self, category_id: str) -> bool:
        """Delete a category (soft delete by setting is_active=False)"""
        result = await self.collection.update_one(
            {"id": category_id},
            {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc)}}
        )
        return result.modified_count > 0


# ============================================================================
# PROVIDER SERVICE
# ============================================================================

class ProviderService:
    """Service for managing integration providers"""
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.collection = db.integration_providers
        self.category_service = CategoryService(db)
    
    async def list_providers(
        self, 
        category_id: Optional[str] = None,
        include_inactive: bool = False
    ) -> List[Dict]:
        """List all providers, optionally filtered by category"""
        query = {}
        if not include_inactive:
            query["is_active"] = True
        if category_id:
            query["category_id"] = category_id
        
        providers = await self.collection.find(
            query, {"_id": 0}
        ).sort("name", 1).to_list(100)
        
        # Enrich with category names
        for provider in providers:
            category = await self.category_service.get_category(provider.get("category_id"))
            if category:
                provider["category_name"] = category.get("name")
        
        return providers
    
    async def get_provider(self, provider_id: str) -> Optional[Dict]:
        """Get a provider by ID"""
        provider = await self.collection.find_one(
            {"id": provider_id}, {"_id": 0}
        )
        
        if provider:
            category = await self.category_service.get_category(provider.get("category_id"))
            if category:
                provider["category_name"] = category.get("name")
        
        return provider
    
    async def get_provider_by_slug(self, slug: str) -> Optional[Dict]:
        """Get a provider by slug"""
        return await self.collection.find_one(
            {"slug": slug}, {"_id": 0}
        )
    
    async def create_provider(self, data: Dict) -> Dict:
        """Create a new provider"""
        # Check slug uniqueness
        existing = await self.get_provider_by_slug(data.get("slug", ""))
        if existing:
            raise ValueError(f"Provider with slug '{data['slug']}' already exists")
        
        # Verify category exists
        category = await self.category_service.get_category(data["category_id"])
        if not category:
            raise ValueError("Category not found")
        
        provider = {
            "id": str(uuid.uuid4()),
            "name": data["name"],
            "slug": data["slug"],
            "category_id": data["category_id"],
            "logo_icon": data.get("logo_icon", "plug"),
            "description": data.get("description"),
            "auth_schema": data.get("auth_schema", []),
            "test_endpoint": data.get("test_endpoint"),
            "docs_url": data.get("docs_url"),
            "is_active": data.get("is_active", True),
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc)
        }
        
        await self.collection.insert_one(provider)
        provider.pop("_id", None)
        provider["category_name"] = category.get("name")
        return provider
    
    async def update_provider(self, provider_id: str, data: Dict) -> Optional[Dict]:
        """Update a provider"""
        update_data = {k: v for k, v in data.items() if v is not None}
        
        if not update_data:
            return await self.get_provider(provider_id)
        
        update_data["updated_at"] = datetime.now(timezone.utc)
        
        result = await self.collection.find_one_and_update(
            {"id": provider_id},
            {"$set": update_data},
            return_document=True
        )
        
        if result:
            result.pop("_id", None)
        return result
    
    async def delete_provider(self, provider_id: str) -> bool:
        """Delete a provider (soft delete)"""
        result = await self.collection.update_one(
            {"id": provider_id},
            {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc)}}
        )
        return result.modified_count > 0


# ============================================================================
# CONNECTION SERVICE
# ============================================================================

class ConnectionService:
    """Service for managing tenant connections"""
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.collection = db.tenant_connections
        self.logs_collection = db.connection_validation_logs
        self.provider_service = ProviderService(db)
        self.category_service = CategoryService(db)
    
    async def list_connections(
        self, 
        workspace_id: str,
        category_id: Optional[str] = None,
        include_inactive: bool = False
    ) -> List[Dict]:
        """List connections for a workspace"""
        query = {"workspace_id": workspace_id}
        if not include_inactive:
            query["status"] = {"$nin": ["archived", "disabled"]}
        if category_id:
            query["category_id"] = category_id
        
        connections = await self.collection.find(
            query, {"_id": 0, "credentials": 0}  # Never return raw credentials
        ).sort("name", 1).to_list(100)
        
        # Enrich with provider and category info
        for conn in connections:
            provider = await self.provider_service.get_provider(conn.get("provider_id"))
            if provider:
                conn["provider_name"] = provider.get("name")
                conn["provider_icon"] = provider.get("logo_icon")
            
            category = await self.category_service.get_category(conn.get("category_id"))
            if category:
                conn["category_name"] = category.get("name")
            
            # Add masked credentials placeholder
            conn["credentials_masked"] = {}
        
        return connections
    
    async def get_connection(
        self, 
        connection_id: str, 
        workspace_id: str,
        include_credentials: bool = False
    ) -> Optional[Dict]:
        """Get a connection by ID"""
        projection = {"_id": 0}
        if not include_credentials:
            projection["credentials"] = 0
        
        connection = await self.collection.find_one(
            {"id": connection_id, "workspace_id": workspace_id},
            projection
        )
        
        if not connection:
            return None
        
        # Enrich with provider and category info
        provider = await self.provider_service.get_provider(connection.get("provider_id"))
        if provider:
            connection["provider_name"] = provider.get("name")
            connection["provider_icon"] = provider.get("logo_icon")
            
            # If we have credentials, mask them
            if include_credentials and "credentials" in connection:
                try:
                    decrypted = decrypt_credentials(connection["credentials"])
                    connection["credentials_masked"] = mask_credentials(
                        decrypted, provider.get("auth_schema", [])
                    )
                except Exception:
                    connection["credentials_masked"] = {}
                del connection["credentials"]
            else:
                connection["credentials_masked"] = {}
        
        category = await self.category_service.get_category(connection.get("category_id"))
        if category:
            connection["category_name"] = category.get("name")
        
        return connection
    
    async def create_connection(
        self, 
        workspace_id: str, 
        user_id: str,
        data: Dict
    ) -> Dict:
        """Create a new connection"""
        # Get provider
        provider = await self.provider_service.get_provider(data["provider_id"])
        if not provider:
            raise ValueError("Provider not found")
        
        # Validate required credentials
        auth_schema = provider.get("auth_schema", [])
        for field in auth_schema:
            if field.get("required") and field.get("key") not in data.get("credentials", {}):
                raise ValueError(f"Missing required field: {field.get('label', field.get('key'))}")
        
        # Encrypt credentials
        encrypted_credentials = encrypt_credentials(data["credentials"])
        
        # Handle default connection
        is_default = data.get("is_default", False)
        if is_default:
            # Unset any existing default for this category
            await self.collection.update_many(
                {
                    "workspace_id": workspace_id,
                    "category_id": provider["category_id"],
                    "is_default": True
                },
                {"$set": {"is_default": False}}
            )
        
        connection = {
            "id": str(uuid.uuid4()),
            "workspace_id": workspace_id,
            "name": data["name"],
            "category_id": provider["category_id"],
            "provider_id": data["provider_id"],
            "credentials": encrypted_credentials,
            "is_active": True,
            "is_default": is_default,
            "status": "draft",
            "last_tested_at": None,
            "last_test_status": None,
            "created_by": user_id,
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc)
        }
        
        await self.collection.insert_one(connection)
        
        # Return masked response
        connection.pop("_id", None)
        connection.pop("credentials")
        connection["credentials_masked"] = mask_credentials(
            data["credentials"], auth_schema
        )
        connection["provider_name"] = provider.get("name")
        connection["provider_icon"] = provider.get("logo_icon")
        
        category = await self.category_service.get_category(provider["category_id"])
        if category:
            connection["category_name"] = category.get("name")
        
        # Check if this is an AI connection to enable AI features
        if category and category.get("slug") == "ai_llm":
            await self._enable_ai_features(workspace_id)
        
        return connection
    
    async def update_connection(
        self, 
        connection_id: str, 
        workspace_id: str,
        data: Dict
    ) -> Optional[Dict]:
        """Update a connection"""
        # Get existing connection
        existing = await self.collection.find_one(
            {"id": connection_id, "workspace_id": workspace_id}
        )
        if not existing:
            return None
        
        update_data = {}
        
        if data.get("name"):
            update_data["name"] = data["name"]
        
        if data.get("credentials"):
            # Get provider for validation
            provider = await self.provider_service.get_provider(existing["provider_id"])
            if provider:
                # Validate required credentials
                auth_schema = provider.get("auth_schema", [])
                for field in auth_schema:
                    if field.get("required") and field.get("key") not in data["credentials"]:
                        raise ValueError(f"Missing required field: {field.get('label', field.get('key'))}")
            
            update_data["credentials"] = encrypt_credentials(data["credentials"])
            update_data["status"] = "draft"  # Reset status when credentials change
        
        if data.get("is_default") is not None:
            if data["is_default"]:
                # Unset any existing default
                await self.collection.update_many(
                    {
                        "workspace_id": workspace_id,
                        "category_id": existing["category_id"],
                        "is_default": True,
                        "id": {"$ne": connection_id}
                    },
                    {"$set": {"is_default": False}}
                )
            update_data["is_default"] = data["is_default"]
        
        if update_data:
            update_data["updated_at"] = datetime.now(timezone.utc)
            await self.collection.update_one(
                {"id": connection_id},
                {"$set": update_data}
            )
        
        return await self.get_connection(connection_id, workspace_id, include_credentials=True)
    
    async def delete_connection(self, connection_id: str, workspace_id: str) -> bool:
        """Delete a connection (soft delete - archive)"""
        result = await self.collection.update_one(
            {"id": connection_id, "workspace_id": workspace_id},
            {"$set": {"status": "archived", "is_active": False, "updated_at": datetime.now(timezone.utc)}}
        )
        return result.modified_count > 0

    async def duplicate_connection(
        self,
        connection_id: str,
        workspace_id: str,
        user_id: str,
    ) -> Optional[Dict]:
        """Duplicate an existing connection with a new name and draft status."""
        original = await self.collection.find_one(
            {"id": connection_id, "workspace_id": workspace_id}
        )
        if not original:
            return None

        new_conn = {
            "id": str(uuid.uuid4()),
            "workspace_id": workspace_id,
            "name": f"{original['name']} (Copy)",
            "category_id": original["category_id"],
            "provider_id": original["provider_id"],
            "credentials": original.get("credentials", {}),
            "is_active": False,
            "is_default": False,
            "status": "draft",
            "last_tested_at": None,
            "last_test_status": None,
            "created_by": user_id,
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
        }
        await self.collection.insert_one(new_conn)
        return await self.get_connection(new_conn["id"], workspace_id, include_credentials=True)
    
    async def set_default(self, connection_id: str, workspace_id: str) -> Optional[Dict]:
        """Set a connection as the default for its category"""
        connection = await self.collection.find_one(
            {"id": connection_id, "workspace_id": workspace_id}
        )
        if not connection:
            return None
        
        # Unset existing defaults
        await self.collection.update_many(
            {
                "workspace_id": workspace_id,
                "category_id": connection["category_id"],
                "is_default": True
            },
            {"$set": {"is_default": False}}
        )
        
        # Set new default
        await self.collection.update_one(
            {"id": connection_id},
            {"$set": {"is_default": True, "updated_at": datetime.now(timezone.utc)}}
        )
        
        return await self.get_connection(connection_id, workspace_id)
    
    async def activate(self, connection_id: str, workspace_id: str) -> Optional[Dict]:
        """Activate a connection"""
        connection = await self.collection.find_one(
            {"id": connection_id, "workspace_id": workspace_id}
        )
        if not connection:
            return None
        
        if connection.get("status") not in ["validated", "active", "disabled"]:
            raise ValueError("Connection must be validated before activation")
        
        await self.collection.update_one(
            {"id": connection_id},
            {"$set": {"status": "active", "is_active": True, "updated_at": datetime.now(timezone.utc)}}
        )
        
        return await self.get_connection(connection_id, workspace_id)
    
    async def deactivate(self, connection_id: str, workspace_id: str) -> Optional[Dict]:
        """Deactivate a connection"""
        await self.collection.update_one(
            {"id": connection_id, "workspace_id": workspace_id},
            {"$set": {"status": "disabled", "is_active": False, "updated_at": datetime.now(timezone.utc)}}
        )
        return await self.get_connection(connection_id, workspace_id)
    
    async def test_connection(self, connection_id: str, workspace_id: str) -> Dict:
        """Test a connection"""
        # Get connection with credentials
        connection = await self.collection.find_one(
            {"id": connection_id, "workspace_id": workspace_id}
        )
        if not connection:
            raise ValueError("Connection not found")
        
        # Get provider
        provider = await self.provider_service.get_provider(connection["provider_id"])
        if not provider:
            raise ValueError("Provider not found")
        
        test_endpoint = provider.get("test_endpoint")
        if not test_endpoint:
            # No test endpoint configured - mark as validated
            result = {
                "status": "success",
                "http_status": None,
                "message": "No test endpoint configured - connection saved",
                "tested_at": datetime.now(timezone.utc)
            }
            await self._update_test_result(connection_id, result)
            return result
        
        try:
            # Use OAuth Token Manager for auto-refresh if this is an OAuth connection
            from modules.integrations.services.oauth_token_manager import OAuthTokenManager
            token_manager = OAuthTokenManager(self.db)

            try:
                credentials, was_refreshed = await token_manager.get_valid_credentials(
                    connection_id, workspace_id
                )
            except ValueError as e:
                # Token refresh failed — connection marked invalid by token manager
                result = {
                    "status": "failed",
                    "http_status": None,
                    "message": str(e),
                    "tested_at": datetime.now(timezone.utc)
                }
                await self._update_test_result(connection_id, result)
                return result
            
            # Replace variables in test endpoint
            url = self._replace_variables(test_endpoint.get("url", ""), credentials)
            
            # Validate URL before making request
            if not url.startswith("https://") and not url.startswith("http://"):
                url = f"https://{url}"
            if not url or url in ("https://", "http://"):
                result = {
                    "status": "failed",
                    "http_status": None,
                    "message": "Invalid or empty URL. Ensure instance_url is set (complete OAuth flow first).",
                    "tested_at": datetime.now(timezone.utc)
                }
                await self._update_test_result(connection_id, result)
                return result
            headers = {}
            if test_endpoint.get("headers"):
                for key, value in test_endpoint["headers"].items():
                    headers[key] = self._replace_variables(value, credentials)
            
            body = None
            if test_endpoint.get("body"):
                body = {}
                for key, value in test_endpoint["body"].items():
                    if isinstance(value, str):
                        body[key] = self._replace_variables(value, credentials)
                    else:
                        body[key] = value
            
            # Make request
            method = test_endpoint.get("method", "GET").upper()
            success_status = test_endpoint.get("success_status", [200, 201])
            
            async with httpx.AsyncClient(timeout=30.0) as client:
                if method == "GET":
                    response = await client.get(url, headers=headers)
                elif method == "POST":
                    response = await client.post(url, headers=headers, json=body)
                elif method == "PUT":
                    response = await client.put(url, headers=headers, json=body)
                else:
                    response = await client.request(method, url, headers=headers, json=body)
            
            # If 401/403 and we haven't already refreshed, try one auto-refresh
            if response.status_code in (401, 403) and not was_refreshed:
                refreshed_creds = await token_manager.handle_auth_failure(
                    connection_id, workspace_id
                )
                if refreshed_creds:
                    # Retry the test with refreshed credentials
                    url = self._replace_variables(test_endpoint.get("url", ""), refreshed_creds)
                    if not url.startswith("https://") and not url.startswith("http://"):
                        url = f"https://{url}"
                    headers = {}
                    if test_endpoint.get("headers"):
                        for key, value in test_endpoint["headers"].items():
                            headers[key] = self._replace_variables(value, refreshed_creds)

                    async with httpx.AsyncClient(timeout=30.0) as client:
                        response = await client.request(method, url, headers=headers, json=body)

            if response.status_code in success_status:
                result = {
                    "status": "success",
                    "http_status": response.status_code,
                    "message": "Connection verified successfully",
                    "tested_at": datetime.now(timezone.utc)
                }
            else:
                result = {
                    "status": "failed",
                    "http_status": response.status_code,
                    "message": f"Test failed with status {response.status_code}",
                    "tested_at": datetime.now(timezone.utc)
                }
        
        except httpx.TimeoutException:
            result = {
                "status": "failed",
                "http_status": None,
                "message": "Connection timeout - please check your credentials",
                "tested_at": datetime.now(timezone.utc)
            }
        except Exception as e:
            logger.error(f"Connection test error: {e}")
            result = {
                "status": "error",
                "http_status": None,
                "message": str(e),
                "tested_at": datetime.now(timezone.utc)
            }
        
        await self._update_test_result(connection_id, result)
        return result
    
    def _replace_variables(self, text: str, credentials: Dict) -> str:
        """Replace {{variable}} placeholders with credential values"""
        pattern = r'\{\{(\w+)\}\}'
        
        def replacer(match):
            key = match.group(1)
            return str(credentials.get(key, match.group(0)))
        
        return re.sub(pattern, replacer, text)
    
    async def _update_test_result(self, connection_id: str, result: Dict):
        """Update connection with test result and log it"""
        new_status = "validated" if result["status"] == "success" else "invalid"
        
        await self.collection.update_one(
            {"id": connection_id},
            {
                "$set": {
                    "status": new_status,
                    "last_tested_at": result["tested_at"],
                    "last_test_status": result["status"],
                    "updated_at": datetime.now(timezone.utc)
                }
            }
        )
        
        # Log the validation
        log_entry = {
            "id": str(uuid.uuid4()),
            "connection_id": connection_id,
            "status": result["status"],
            "http_status": result.get("http_status"),
            "message": result["message"],
            "tested_at": result["tested_at"]
        }
        await self.logs_collection.insert_one(log_entry)
    
    async def _enable_ai_features(self, workspace_id: str):
        """Enable AI features when first AI connection is added"""
        # Check if this is the first AI connection
        ai_category = await self.category_service.get_category_by_slug("ai_llm")
        if not ai_category:
            return
        
        count = await self.collection.count_documents({
            "workspace_id": workspace_id,
            "category_id": ai_category["id"],
            "status": {"$nin": ["archived"]}
        })
        
        if count == 1:
            # First AI connection - enable AI features
            logger.info(f"Enabling AI features for workspace {workspace_id}")
            # TODO: Update tenant settings to enable AI features


# ============================================================================
# RUNTIME GATEWAY SERVICE
# ============================================================================

class RuntimeGatewayService:
    """
    Runtime Gateway for executing requests through connections.
    This service resolves connection_id to credentials and executes requests.
    """
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.connection_service = ConnectionService(db)
        self.provider_service = ProviderService(db)
    
    async def get_connection_credentials(
        self, 
        connection_id: str, 
        workspace_id: str
    ) -> Dict[str, Any]:
        """
        Get decrypted credentials for a connection.
        Uses OAuthTokenManager for automatic token refresh.
        """
        from modules.integrations.services.oauth_token_manager import OAuthTokenManager
        token_manager = OAuthTokenManager(self.db)

        try:
            credentials, _ = await token_manager.get_valid_credentials(
                connection_id, workspace_id
            )
            return credentials
        except ValueError as e:
            raise ValueError(str(e))
    
    async def get_default_connection(
        self, 
        workspace_id: str, 
        category_slug: str
    ) -> Optional[Dict]:
        """Get the default connection for a category"""
        category = await self.db.integration_categories.find_one(
            {"slug": category_slug}, {"_id": 0}
        )
        if not category:
            return None
        
        connection = await self.db.tenant_connections.find_one(
            {
                "workspace_id": workspace_id,
                "category_id": category["id"],
                "is_default": True,
                "status": {"$in": ["active", "validated"]}
            },
            {"_id": 0, "credentials": 0}
        )
        
        return connection
    
    async def execute_request(
        self,
        connection_id: str,
        workspace_id: str,
        method: str,
        endpoint: str,
        headers: Optional[Dict] = None,
        body: Optional[Dict] = None,
        timeout: int = 30
    ) -> Dict[str, Any]:
        """
        Execute an HTTP request using connection credentials.
        
        Args:
            connection_id: The connection to use
            workspace_id: Workspace ID for validation
            method: HTTP method (GET, POST, etc.)
            endpoint: The endpoint URL (can include {{variables}})
            headers: Additional headers (can include {{variables}})
            body: Request body (can include {{variables}})
            timeout: Request timeout in seconds
        
        Returns:
            Response data including status, headers, and body
        """
        # Get credentials
        credentials = await self.get_connection_credentials(connection_id, workspace_id)
        
        # Get provider for base URL if needed
        conn_doc = await self.db.tenant_connections.find_one(
            {"id": connection_id}, {"_id": 0, "provider_id": 1}
        )
        
        # Replace variables
        url = self._replace_variables(endpoint, credentials)
        
        final_headers = {}
        if headers:
            for key, value in headers.items():
                final_headers[key] = self._replace_variables(str(value), credentials)
        
        final_body = None
        if body:
            final_body = self._replace_dict_variables(body, credentials)
        
        # Execute request
        try:
            async with httpx.AsyncClient(timeout=float(timeout)) as client:
                response = await client.request(
                    method=method.upper(),
                    url=url,
                    headers=final_headers,
                    json=final_body if final_body else None
                )
                
                try:
                    response_body = response.json()
                except Exception:
                    response_body = response.text
                
                return {
                    "success": response.status_code < 400,
                    "status_code": response.status_code,
                    "headers": dict(response.headers),
                    "body": response_body
                }
        
        except httpx.TimeoutException:
            return {
                "success": False,
                "status_code": None,
                "error": "Request timeout"
            }
        except Exception as e:
            return {
                "success": False,
                "status_code": None,
                "error": str(e)
            }
    
    def _replace_variables(self, text: str, credentials: Dict) -> str:
        """Replace {{variable}} placeholders"""
        pattern = r'\{\{(\w+)\}\}'
        
        def replacer(match):
            key = match.group(1)
            return str(credentials.get(key, match.group(0)))
        
        return re.sub(pattern, replacer, text)
    
    def _replace_dict_variables(self, data: Dict, credentials: Dict) -> Dict:
        """Recursively replace variables in a dictionary"""
        result = {}
        for key, value in data.items():
            if isinstance(value, str):
                result[key] = self._replace_variables(value, credentials)
            elif isinstance(value, dict):
                result[key] = self._replace_dict_variables(value, credentials)
            elif isinstance(value, list):
                result[key] = [
                    self._replace_variables(v, credentials) if isinstance(v, str) else v
                    for v in value
                ]
            else:
                result[key] = value
        return result
