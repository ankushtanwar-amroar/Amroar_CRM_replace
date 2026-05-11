"""
DocFlow SMS Template Service — Phase 81.81

Tenant-scoped CRUD over `docflow_sms_templates`. Each tenant can have many
templates but exactly one `is_default=True`. The SMS sender (security_sms
endpoint) uses the default to compose the body for the secure-link SMS.

Variable substitution at send time (NOT at storage time):
  {{user_name}}      — recipient name
  {{document_name}}  — document or package name
  {{company_name}}   — tenant display name
  {{phone_last4}}    — last 4 digits of the recipient phone
  {{link}}           — signing link
"""
from datetime import datetime, timezone
from typing import Optional, List
from uuid import uuid4
import re

VARIABLES = [
    {"key": "user_name", "label": "Recipient name", "example": "Jordan Reeves"},
    {"key": "document_name", "label": "Document name", "example": "NDA Agreement"},
    {"key": "company_name", "label": "Company / sender", "example": "Your Company"},
    {"key": "phone_last4", "label": "Phone last 4", "example": "3210"},
    {"key": "link", "label": "Signing link", "example": "https://example.com/sign/abc123"},
]

# System default template — created once per tenant on first list call so the
# UI is never empty and the SMS sender always has something to fall back to.
SYSTEM_DEFAULT = {
    "name": "Default secure-link SMS",
    "content": (
        "DocFlow Secure Access\n\n"
        "Hi {{user_name}}, your signing link for {{document_name}} is:\n{{link}}\n\n"
        "Sent by {{company_name}}.\n"
        "This is an automated secure message."
    ),
    "is_default": True,
    "is_system": True,
}

PLACEHOLDER_RE = re.compile(r"\{\{\s*([a-zA-Z0-9_]+)\s*\}\}")


def render_sms(content: str, vars_map: dict) -> str:
    """Replace {{var}} tokens with actual values; missing vars become empty."""
    if not content:
        return ""
    return PLACEHOLDER_RE.sub(lambda m: str(vars_map.get(m.group(1), "")), content)


class SmsTemplateService:
    def __init__(self, db):
        self.db = db
        self.collection = db.docflow_sms_templates

    @staticmethod
    def _project():
        return {"_id": 0}

    async def _ensure_seed(self, tenant_id: str):
        existing = await self.collection.count_documents({"tenant_id": tenant_id})
        if existing > 0:
            return
        now = datetime.now(timezone.utc)
        seed = {
            "id": str(uuid4()),
            "tenant_id": tenant_id,
            "created_at": now,
            "updated_at": now,
            **SYSTEM_DEFAULT,
        }
        await self.collection.insert_one(seed)

    async def list_templates(self, tenant_id: str) -> List[dict]:
        await self._ensure_seed(tenant_id)
        cursor = self.collection.find({"tenant_id": tenant_id}, self._project()).sort([
            ("is_default", -1), ("updated_at", -1)
        ])
        return await cursor.to_list(length=None)

    async def get_template(self, template_id: str, tenant_id: str) -> Optional[dict]:
        return await self.collection.find_one(
            {"id": template_id, "tenant_id": tenant_id}, self._project()
        )

    async def create_template(self, data: dict, tenant_id: str) -> dict:
        now = datetime.now(timezone.utc)
        tmpl = {
            "id": str(uuid4()),
            "tenant_id": tenant_id,
            "name": (data.get("name") or "Untitled SMS").strip()[:120],
            "content": (data.get("content") or "").strip()[:1000],
            "is_default": bool(data.get("is_default", False)),
            "is_system": False,
            "created_at": now,
            "updated_at": now,
        }
        if tmpl["is_default"]:
            await self.collection.update_many(
                {"tenant_id": tenant_id, "is_default": True}, {"$set": {"is_default": False}}
            )
        await self.collection.insert_one(tmpl)
        tmpl.pop("_id", None)
        return tmpl

    async def update_template(self, template_id: str, data: dict, tenant_id: str) -> Optional[dict]:
        existing = await self.collection.find_one({"id": template_id, "tenant_id": tenant_id})
        if not existing:
            return None
        update = {"updated_at": datetime.now(timezone.utc)}
        if "name" in data:
            update["name"] = (data["name"] or "").strip()[:120]
        if "content" in data:
            update["content"] = (data["content"] or "").strip()[:1000]
        if "is_default" in data and data["is_default"]:
            await self.collection.update_many(
                {"tenant_id": tenant_id, "is_default": True}, {"$set": {"is_default": False}}
            )
            update["is_default"] = True
        await self.collection.update_one(
            {"id": template_id, "tenant_id": tenant_id}, {"$set": update}
        )
        return await self.get_template(template_id, tenant_id)

    async def delete_template(self, template_id: str, tenant_id: str) -> bool:
        existing = await self.collection.find_one({"id": template_id, "tenant_id": tenant_id})
        if not existing:
            return False
        if existing.get("is_system"):
            return False  # never delete system seed
        was_default = bool(existing.get("is_default"))
        await self.collection.delete_one({"id": template_id, "tenant_id": tenant_id})
        # If we removed the default, promote any remaining template (oldest) to default
        if was_default:
            remaining = await self.collection.find_one(
                {"tenant_id": tenant_id}, sort=[("created_at", 1)]
            )
            if remaining:
                await self.collection.update_one(
                    {"_id": remaining["_id"]}, {"$set": {"is_default": True}}
                )
        return True

    async def set_default(self, template_id: str, tenant_id: str) -> bool:
        target = await self.collection.find_one({"id": template_id, "tenant_id": tenant_id})
        if not target:
            return False
        await self.collection.update_many(
            {"tenant_id": tenant_id, "is_default": True}, {"$set": {"is_default": False}}
        )
        await self.collection.update_one(
            {"id": template_id, "tenant_id": tenant_id}, {"$set": {"is_default": True}}
        )
        return True

    async def get_default(self, tenant_id: str) -> Optional[dict]:
        await self._ensure_seed(tenant_id)
        return await self.collection.find_one(
            {"tenant_id": tenant_id, "is_default": True}, self._project()
        )

    @staticmethod
    def get_available_variables():
        return VARIABLES
