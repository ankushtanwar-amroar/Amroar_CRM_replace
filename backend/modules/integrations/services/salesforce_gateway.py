"""
Salesforce Gateway Service — shared by CRM Sync and DocFlow.
All Salesforce API calls and token refresh logic lives here.
DocFlow consumes this; it never touches credentials directly.
"""
import logging
import httpx
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
from motor.motor_asyncio import AsyncIOMotorDatabase

from .encryption_service import decrypt_credentials, encrypt_credentials

logger = logging.getLogger(__name__)

SF_API_VERSION = "v59.0"


class SalesforceGateway:
    """Central Salesforce API gateway that resolves connection_id → credentials."""

    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db

    # ── credential helpers ──────────────────────────────────────────

    async def _get_credentials(self, connection_id: str, workspace_id: str) -> Dict[str, Any]:
        """Decrypt and return credentials for a connection."""
        conn = await self.db.tenant_connections.find_one(
            {"id": connection_id, "workspace_id": workspace_id}
        )
        if not conn:
            raise ValueError("Connection not found")
        if conn.get("status") in ("archived",):
            raise ValueError("Connection is archived and cannot be used")
        return decrypt_credentials(conn["credentials"]), conn

    async def _save_new_access_token(self, connection_id: str, new_token: str):
        """Persist a refreshed access_token back to the connection."""
        conn = await self.db.tenant_connections.find_one({"id": connection_id})
        if not conn:
            return
        creds = decrypt_credentials(conn["credentials"])
        creds["access_token"] = new_token
        encrypted = encrypt_credentials(creds)
        await self.db.tenant_connections.update_one(
            {"id": connection_id},
            {"$set": {"credentials": encrypted, "updated_at": datetime.now(timezone.utc)}}
        )

    # ── token refresh ───────────────────────────────────────────────

    async def refresh_access_token(self, connection_id: str, workspace_id: str) -> str:
        """Use refresh_token to obtain a new access_token from Salesforce."""
        creds, _ = await self._get_credentials(connection_id, workspace_id)

        refresh_token = creds.get("refresh_token")
        if not refresh_token:
            raise ValueError("No refresh_token stored — cannot auto-refresh")

        environment = creds.get("environment", "production")
        custom_domain = creds.get("custom_domain", "")

        # Build token URL based on environment / custom domain
        if environment == "custom" and custom_domain:
            domain = custom_domain.strip().rstrip("/")
            if not domain.startswith("https://"):
                domain = f"https://{domain}"
            token_url = f"{domain}/services/oauth2/token"
        elif environment == "sandbox":
            token_url = "https://test.salesforce.com/services/oauth2/token"
        else:
            token_url = "https://login.salesforce.com/services/oauth2/token"

        payload = {
            "grant_type": "refresh_token",
            "client_id": creds.get("consumer_key", ""),
            "client_secret": creds.get("consumer_secret", ""),
            "refresh_token": refresh_token,
        }

        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(token_url, data=payload)

        if resp.status_code != 200:
            body = resp.text
            logger.error(f"Salesforce token refresh failed ({resp.status_code}): {body}")
            raise ValueError(f"Token refresh failed: {body}")

        data = resp.json()
        new_token = data.get("access_token")
        if not new_token:
            raise ValueError("Salesforce did not return an access_token")

        await self._save_new_access_token(connection_id, new_token)
        logger.info(f"Refreshed Salesforce access_token for connection {connection_id}")
        return new_token

    # ── generic SF request with auto-retry ──────────────────────────

    async def sf_request(
        self,
        connection_id: str,
        workspace_id: str,
        method: str,
        path: str,
        body: Optional[Dict] = None,
        _retried: bool = False,
    ) -> Dict[str, Any]:
        """
        Make a Salesforce REST API request.
        On INVALID_SESSION_ID, automatically refresh token and retry once.
        """
        creds, _ = await self._get_credentials(connection_id, workspace_id)
        instance_url = creds.get("instance_url", "").rstrip("/")
        if instance_url and not instance_url.startswith("https://") and not instance_url.startswith("http://"):
            instance_url = f"https://{instance_url}"
        access_token = creds.get("access_token", "")

        url = f"{instance_url}{path}"
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        }

        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.request(method.upper(), url, headers=headers, json=body)

        # Auto-refresh on 401 / INVALID_SESSION_ID
        if resp.status_code == 401 and not _retried:
            try:
                error_body = resp.json()
            except Exception:
                error_body = [{}]
            error_code = ""
            if isinstance(error_body, list) and error_body:
                error_code = error_body[0].get("errorCode", "")
            elif isinstance(error_body, dict):
                error_code = error_body.get("errorCode", error_body.get("error", ""))

            if error_code in ("INVALID_SESSION_ID", "invalid_grant", ""):
                logger.info(f"Access token expired for connection {connection_id}, refreshing…")
                try:
                    await self.refresh_access_token(connection_id, workspace_id)
                    return await self.sf_request(
                        connection_id, workspace_id, method, path, body, _retried=True
                    )
                except ValueError as refresh_err:
                    raise ValueError(f"Session expired and token refresh failed: {refresh_err}")

        if resp.status_code >= 400:
            detail = resp.text[:300]
            raise ValueError(f"Salesforce API error ({resp.status_code}): {detail}")

        return resp.json()

    # ── high-level helpers ──────────────────────────────────────────

    async def test_connection(self, connection_id: str, workspace_id: str) -> Dict[str, Any]:
        """Quick connectivity test — returns version info."""
        try:
            data = await self.sf_request(
                connection_id, workspace_id, "GET", f"/services/data/{SF_API_VERSION}/"
            )
            return {"status": "connected", "message": "Salesforce connection successful", "detail": data}
        except Exception as e:
            return {"status": "error", "message": str(e)}

    async def get_objects(self, connection_id: str, workspace_id: str) -> List[Dict[str, str]]:
        """Fetch all sObjects from Salesforce."""
        data = await self.sf_request(
            connection_id, workspace_id, "GET", f"/services/data/{SF_API_VERSION}/sobjects/"
        )
        objects = []
        for sob in data.get("sobjects", []):
            if sob.get("queryable") and sob.get("retrieveable"):
                objects.append({
                    "object_name": sob["name"],
                    "object_label": sob.get("label", sob["name"]),
                    "source": "salesforce",
                })
        return sorted(objects, key=lambda o: o["object_label"])

    async def get_fields(
        self, connection_id: str, workspace_id: str, object_name: str
    ) -> List[Dict[str, Any]]:
        """Fetch fields for a specific sObject."""
        data = await self.sf_request(
            connection_id,
            workspace_id,
            "GET",
            f"/services/data/{SF_API_VERSION}/sobjects/{object_name}/describe",
        )
        fields = []
        for f in data.get("fields", []):
            fields.append({
                "field_name": f["name"],
                "field_label": f.get("label", f["name"]),
                "field_type": f.get("type", "string"),
                "is_required": not f.get("nillable", True),
                "is_updateable": f.get("updateable", False),
            })
        return sorted(fields, key=lambda f: f["field_label"])

    # ── list available SF connections for a workspace ────────────────

    async def list_connections(self, workspace_id: str) -> List[Dict[str, Any]]:
        """Return all Salesforce connections for a workspace (from CRM Sync)."""
        # Find the crm_sync category
        category = await self.db.integration_categories.find_one(
            {"slug": "crm_sync"}, {"_id": 0}
        )
        if not category:
            return []

        connections = await self.db.tenant_connections.find(
            {
                "workspace_id": workspace_id,
                "category_id": category["id"],
                "status": {"$nin": ["archived"]},
            },
            {"_id": 0, "credentials": 0},
        ).sort("name", 1).to_list(100)

        # Enrich with provider name
        for conn in connections:
            provider = await self.db.integration_providers.find_one(
                {"id": conn.get("provider_id")}, {"_id": 0, "name": 1, "logo_icon": 1}
            )
            if provider:
                conn["provider_name"] = provider.get("name", "Salesforce")
                conn["provider_icon"] = provider.get("logo_icon", "cloud")
            conn["credentials_masked"] = {}
        return connections
