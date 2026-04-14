"""
CluBot Policy Enforcer — Runtime enforcement layer for CluBot Control Center.

Sits between CluBot routes and the AI service to:
1. Gate on CluBot enabled/disabled state
2. Validate actions against entity permissions
3. Enforce safety controls (confirmation, preview, DB mutation block)
4. Inject tenant-specific context (intent, personality, knowledge) into LLM prompts
5. Log all write actions to the audit trail
"""
import logging
from typing import Dict, Any, Optional, Tuple
from datetime import datetime, timezone

logger = logging.getLogger(__name__)


# Maps CluBot action types to entity + operation for permission checks
ACTION_ENTITY_MAP = {
    "ADD_FIELD": ("templates", "update"),
    "RENAME_FIELD": ("templates", "update"),
    "MOVE_FIELD": ("templates", "update"),
    "DELETE_FIELD": ("templates", "update"),
    "EDIT_CONTENT": ("templates", "update"),
    "ANSWER": (None, "read"),  # No entity check needed for read-only answers
}

# Email generation maps to documents/create (generates new content)
EMAIL_ACTION = ("documents", "read")
# Validation is read-only
VALIDATE_ACTION = ("templates", "read")


class ClueBotPolicyEnforcer:
    """Enforces CluBot Control Center config at runtime."""

    def __init__(self, db):
        self.db = db

    async def load_config(self, tenant_id: str) -> Dict[str, Any]:
        """Load tenant CluBot config (always fresh from DB — single-doc query)."""
        config = await self.db.cluebot_config.find_one(
            {"tenant_id": tenant_id}, {"_id": 0}
        )

        if not config:
            from shared.services.runtime_api import _default_cluebot_config
            config = _default_cluebot_config(tenant_id)

        return config

    def is_enabled(self, config: Dict) -> bool:
        """Check if CluBot is enabled for this tenant."""
        return bool(config.get("general", {}).get("enabled", False))

    def check_permission(self, config: Dict, entity: Optional[str], operation: str) -> Tuple[bool, str]:
        """
        Check if the given entity+operation is allowed by the config.
        Returns (allowed, reason).
        """
        if entity is None:
            # No entity check needed (e.g., general chat answer)
            return True, ""

        permissions = config.get("permissions", {})
        entities = permissions.get("entities", {})
        entity_perms = entities.get(entity, {})

        if not entity_perms.get(operation, False):
            return False, f"CluBot does not have '{operation}' permission for '{entity}'. An admin can enable this in AI & Automation > Permissions & Safety."

        return True, ""

    def check_safety(self, config: Dict, is_write: bool) -> Dict[str, Any]:
        """
        Check safety controls for write actions.
        Returns dict with require_confirmation, preview_before_execution, blocked flags.
        """
        permissions = config.get("permissions", {})

        result = {
            "require_confirmation": False,
            "preview_before_execution": False,
            "blocked_by_db_mutation_rule": False,
        }

        if not is_write:
            return result

        result["require_confirmation"] = bool(permissions.get("require_confirmation", True))
        result["preview_before_execution"] = bool(permissions.get("preview_before_execution", True))
        result["blocked_by_db_mutation_rule"] = bool(permissions.get("block_direct_db_mutations", True))

        return result

    def get_llm_context(self, config: Dict) -> Dict[str, str]:
        """
        Extract LLM prompt enrichment context from config.
        Returns intent, personality, and knowledge context strings.
        """
        general = config.get("general", {})
        knowledge = config.get("knowledge", {})

        intent = (general.get("intent") or "").strip()
        personality = (general.get("personality") or "").strip()

        # Build knowledge context from entries
        kb_entries = knowledge.get("entries", [])
        kb_lines = []
        for entry in kb_entries:
            title = (entry.get("title") or "").strip()
            content = (entry.get("content") or "").strip()
            if title or content:
                kb_lines.append(f"- {title}: {content}" if title else f"- {content}")

        knowledge_context = "\n".join(kb_lines) if kb_lines else ""

        return {
            "intent": intent,
            "personality": personality,
            "knowledge_context": knowledge_context,
        }

    def get_allowed_tools(self, config: Dict) -> Dict[str, bool]:
        """Return which internal tools are enabled."""
        return config.get("tools", {}).get("internal_tools", {})

    async def log_action(
        self,
        tenant_id: str,
        user_id: str,
        action: str,
        entity: str,
        details: str,
        status: str = "completed",
    ):
        """Append an action log entry to the CluBot config."""
        log_entry = {
            "action": action,
            "entity": entity,
            "details": details[:1000],
            "user_id": user_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "status": status,
        }

        await self.db.cluebot_config.update_one(
            {"tenant_id": tenant_id},
            {
                "$push": {
                    "logs.recent_logs": {
                        "$each": [log_entry],
                        "$slice": -200,
                    }
                }
            },
            upsert=True,
        )
        logger.info(f"[CluBot Audit] tenant={tenant_id} action={action} entity={entity} status={status}")

    async def enforce(
        self,
        tenant_id: str,
        action_type: str,
        entity: Optional[str] = None,
        operation: Optional[str] = None,
    ) -> Tuple[bool, str, Dict]:
        """
        Full enforcement check. Returns (allowed, reason, config).
        Use entity/operation overrides for non-chat actions (email, validate).
        """
        config = await self.load_config(tenant_id)

        # 1. Check enabled
        if not self.is_enabled(config):
            return False, "CluBot is currently disabled. An admin can enable it in AI & Automation settings.", config

        # 2. Resolve entity + operation
        if entity is None or operation is None:
            mapped = ACTION_ENTITY_MAP.get(action_type, (None, "read"))
            entity = entity or mapped[0]
            operation = operation or mapped[1]

        # 3. Check permission
        allowed, reason = self.check_permission(config, entity, operation)
        if not allowed:
            return False, reason, config

        return True, "", config
