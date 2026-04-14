"""
OAuth Token Manager — Reusable token lifecycle management for OAuth providers.

Handles:
- Token storage with expiry tracking
- Automatic refresh before API calls
- Invalid token detection + marking connection as "invalid"
- Transparent token handling (user never re-authenticates unless revoked)

Designed to work with any OAuth 2.0 provider (Salesforce, Google, Microsoft, etc.)
"""
import logging
import httpx
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, Optional, Tuple

from modules.integrations.services.encryption_service import encrypt_credentials, decrypt_credentials

logger = logging.getLogger(__name__)

# Refresh buffer: refresh token 5 minutes before actual expiry
REFRESH_BUFFER_SECONDS = 300


class OAuthTokenManager:
    """Manages OAuth token lifecycle for any provider."""

    def __init__(self, db):
        self.db = db

    async def get_valid_credentials(
        self,
        connection_id: str,
        workspace_id: str,
    ) -> Tuple[Dict[str, Any], bool]:
        """
        Get valid credentials for a connection, auto-refreshing if needed.

        Returns:
            (credentials_dict, was_refreshed)
        Raises:
            ValueError if connection not found or tokens irrecoverable.
        """
        conn = await self.db.tenant_connections.find_one(
            {"id": connection_id, "workspace_id": workspace_id}
        )
        if not conn:
            raise ValueError("Connection not found")

        creds = decrypt_credentials(conn["credentials"])

        # If no access_token, this isn't an OAuth connection — return as-is
        if "access_token" not in creds:
            return creds, False

        # Check if token is expired or near expiry
        token_expires_at = creds.get("token_expires_at")
        needs_refresh = False

        if token_expires_at:
            try:
                expiry = datetime.fromisoformat(token_expires_at)
                if expiry.tzinfo is None:
                    expiry = expiry.replace(tzinfo=timezone.utc)
                buffer = timedelta(seconds=REFRESH_BUFFER_SECONDS)
                if datetime.now(timezone.utc) >= (expiry - buffer):
                    needs_refresh = True
                    logger.info(f"[OAuthTokenManager] Token expired/near-expiry for connection {connection_id}")
            except (ValueError, TypeError):
                # Can't parse expiry — try refresh to be safe
                needs_refresh = True
        else:
            # No expiry stored — try a test call first, refresh on 401
            pass

        if needs_refresh:
            refreshed_creds = await self._refresh_token(connection_id, conn, creds)
            if refreshed_creds:
                return refreshed_creds, True
            # Refresh failed — mark connection invalid
            await self._mark_invalid(connection_id, "Token refresh failed. Please reconnect.")
            raise ValueError("Session expired. Please reconnect the OAuth provider.")

        return creds, False

    async def handle_auth_failure(
        self,
        connection_id: str,
        workspace_id: str,
    ) -> Optional[Dict[str, Any]]:
        """
        Called when an API call returns 401/403.
        Attempts one token refresh. If that fails, marks connection as invalid.

        Returns refreshed credentials or None.
        """
        conn = await self.db.tenant_connections.find_one(
            {"id": connection_id, "workspace_id": workspace_id}
        )
        if not conn:
            return None

        creds = decrypt_credentials(conn["credentials"])
        refreshed = await self._refresh_token(connection_id, conn, creds)

        if not refreshed:
            await self._mark_invalid(connection_id, "Token refresh failed after auth error. Please reconnect.")
            return None

        return refreshed

    async def _refresh_token(
        self,
        connection_id: str,
        conn: Dict,
        creds: Dict,
    ) -> Optional[Dict[str, Any]]:
        """
        Refresh the access_token using the refresh_token.
        Returns updated credentials if successful, None on failure.
        """
        refresh_token = creds.get("refresh_token")
        if not refresh_token:
            logger.warning(f"[OAuthTokenManager] No refresh_token for connection {connection_id}")
            return None

        # Determine token endpoint based on provider
        token_url = self._get_token_url(creds)
        if not token_url:
            logger.error(f"[OAuthTokenManager] Cannot determine token URL for connection {connection_id}")
            return None

        # Build refresh payload
        payload = {
            "grant_type": "refresh_token",
            "refresh_token": refresh_token,
            "client_id": creds.get("consumer_key") or creds.get("client_id", ""),
            "client_secret": creds.get("consumer_secret") or creds.get("client_secret", ""),
        }

        try:
            async with httpx.AsyncClient(timeout=30.0) as http:
                resp = await http.post(token_url, data=payload)

            if resp.status_code != 200:
                logger.error(
                    f"[OAuthTokenManager] Refresh failed ({resp.status_code}) "
                    f"for connection {connection_id}: {resp.text[:200]}"
                )
                return None

            token_data = resp.json()
            new_access_token = token_data.get("access_token")
            if not new_access_token:
                logger.error(f"[OAuthTokenManager] No access_token in refresh response for {connection_id}")
                return None

            # Update credentials
            creds["access_token"] = new_access_token

            # Some providers rotate refresh tokens
            if token_data.get("refresh_token"):
                creds["refresh_token"] = token_data["refresh_token"]

            # Update instance_url if returned (Salesforce does this)
            if token_data.get("instance_url"):
                instance_url = token_data["instance_url"].strip().rstrip("/")
                if not instance_url.startswith("https://"):
                    instance_url = f"https://{instance_url}"
                creds["instance_url"] = instance_url

            # Calculate and store expiry
            expires_in = token_data.get("expires_in")
            if expires_in:
                expiry = datetime.now(timezone.utc) + timedelta(seconds=int(expires_in))
                creds["token_expires_at"] = expiry.isoformat()

            # Persist updated credentials
            encrypted = encrypt_credentials(creds)
            now = datetime.now(timezone.utc)
            await self.db.tenant_connections.update_one(
                {"id": connection_id},
                {"$set": {
                    "credentials": encrypted,
                    "status": "validated",
                    "updated_at": now,
                }}
            )

            logger.info(f"[OAuthTokenManager] Token refreshed successfully for connection {connection_id}")
            return creds

        except httpx.TimeoutException:
            logger.error(f"[OAuthTokenManager] Timeout refreshing token for {connection_id}")
            return None
        except Exception as e:
            logger.error(f"[OAuthTokenManager] Error refreshing token for {connection_id}: {e}")
            return None

    def _get_token_url(self, creds: Dict) -> Optional[str]:
        """Determine the OAuth token endpoint from credentials."""
        environment = creds.get("environment", "production")
        custom_domain = creds.get("custom_domain", "")

        # Salesforce
        if creds.get("consumer_key"):
            if environment == "custom" and custom_domain:
                domain = custom_domain.strip().rstrip("/")
                if not domain.startswith("https://"):
                    domain = f"https://{domain}"
                return f"{domain}/services/oauth2/token"
            if environment == "sandbox":
                return "https://test.salesforce.com/services/oauth2/token"
            return "https://login.salesforce.com/services/oauth2/token"

        # Google
        if creds.get("client_id") and "google" in creds.get("token_url", ""):
            return creds.get("token_url", "https://oauth2.googleapis.com/token")

        # Microsoft
        if creds.get("client_id") and "microsoft" in creds.get("token_url", ""):
            return creds.get("token_url")

        # Generic: use stored token_url
        return creds.get("token_url")

    async def _mark_invalid(self, connection_id: str, reason: str):
        """Mark connection as invalid with a reason."""
        now = datetime.now(timezone.utc)
        await self.db.tenant_connections.update_one(
            {"id": connection_id},
            {"$set": {
                "status": "invalid",
                "last_test_status": "failed",
                "last_tested_at": now,
                "updated_at": now,
            }}
        )

        # Log the failure
        import uuid
        await self.db.connection_validation_logs.insert_one({
            "id": str(uuid.uuid4()),
            "connection_id": connection_id,
            "status": "failed",
            "http_status": None,
            "message": reason,
            "tested_at": now,
        })

        logger.warning(f"[OAuthTokenManager] Connection {connection_id} marked invalid: {reason}")
