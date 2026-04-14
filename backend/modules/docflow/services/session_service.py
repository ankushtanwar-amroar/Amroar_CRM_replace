"""
DocFlow Session Service — Phase 4 Step 1

Manages secure, time-bound sessions for package recipient access.
- Sessions are created after OTP verification
- Single active session per recipient per package
- Configurable timeout with sliding expiration
"""
import secrets
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

logger = logging.getLogger(__name__)

DEFAULT_SESSION_TIMEOUT_MINUTES = 15


class SessionService:
    def __init__(self, db):
        self.db = db
        self.collection = db.docflow_sessions

    async def create_session(
        self,
        package_id: str,
        recipient_id: str,
        recipient_email: str,
        timeout_minutes: int = DEFAULT_SESSION_TIMEOUT_MINUTES,
    ) -> str:
        """
        Create a new session for a recipient, invalidating any previous active sessions.
        Returns the new session_token.
        """
        now = datetime.now(timezone.utc)

        # Invalidate any existing active sessions for this recipient+package
        await self.collection.update_many(
            {
                "package_id": package_id,
                "recipient_id": recipient_id,
                "status": "active",
            },
            {"$set": {"status": "invalidated", "invalidated_at": now.isoformat()}},
        )

        session_token = secrets.token_urlsafe(48)
        expires_at = now + timedelta(minutes=timeout_minutes)

        session_doc = {
            "session_token": session_token,
            "package_id": package_id,
            "recipient_id": recipient_id,
            "recipient_email": recipient_email,
            "status": "active",
            "created_at": now.isoformat(),
            "expires_at": expires_at.isoformat(),
            "last_activity_at": now.isoformat(),
            "timeout_minutes": timeout_minutes,
        }

        await self.collection.insert_one(session_doc)
        logger.info(
            f"[Session] Created session for recipient={recipient_id[:8]} "
            f"package={package_id[:8]} timeout={timeout_minutes}min"
        )
        return session_token

    async def validate_session(self, session_token: str) -> Optional[dict]:
        """
        Validate a session token. Returns session data if valid, None if expired/invalid.
        Also refreshes `last_activity_at` (sliding expiration).
        """
        if not session_token:
            return None

        session = await self.collection.find_one(
            {"session_token": session_token, "status": "active"},
            {"_id": 0},
        )

        if not session:
            return None

        now = datetime.now(timezone.utc)
        expires_at = datetime.fromisoformat(session["expires_at"])

        if now > expires_at:
            # Session expired — mark it
            await self.collection.update_one(
                {"session_token": session_token},
                {"$set": {"status": "expired", "expired_at": now.isoformat()}},
            )
            logger.info(f"[Session] Expired session for recipient={session['recipient_id'][:8]}")
            return None

        # Sliding expiration: refresh last_activity_at and push expires_at forward
        timeout = session.get("timeout_minutes", DEFAULT_SESSION_TIMEOUT_MINUTES)
        new_expires = now + timedelta(minutes=timeout)
        await self.collection.update_one(
            {"session_token": session_token},
            {
                "$set": {
                    "last_activity_at": now.isoformat(),
                    "expires_at": new_expires.isoformat(),
                }
            },
        )

        return {
            "package_id": session["package_id"],
            "recipient_id": session["recipient_id"],
            "recipient_email": session["recipient_email"],
            "expires_at": new_expires.isoformat(),
        }

    async def invalidate_session(self, session_token: str) -> bool:
        """Manually invalidate a session (logout)."""
        result = await self.collection.update_one(
            {"session_token": session_token, "status": "active"},
            {"$set": {"status": "invalidated", "invalidated_at": datetime.now(timezone.utc).isoformat()}},
        )
        return result.modified_count > 0

    async def get_active_session(self, package_id: str, recipient_id: str) -> Optional[dict]:
        """Check if a recipient already has a valid active session."""
        session = await self.collection.find_one(
            {
                "package_id": package_id,
                "recipient_id": recipient_id,
                "status": "active",
            },
            {"_id": 0},
        )
        if not session:
            return None

        now = datetime.now(timezone.utc)
        expires_at = datetime.fromisoformat(session["expires_at"])
        if now > expires_at:
            await self.collection.update_one(
                {"session_token": session["session_token"]},
                {"$set": {"status": "expired", "expired_at": now.isoformat()}},
            )
            return None

        return session
