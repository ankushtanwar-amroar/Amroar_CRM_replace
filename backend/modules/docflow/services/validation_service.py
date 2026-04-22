"""
Validation Service - Comprehensive template validation for DocFlow

Validation Contract (deterministic):
- Exactly 8 fixed checks are evaluated on every call.
- Each check produces exactly one entry with status ∈ {passed, warning, error}.
- Score = round(passed_count / total_checks * 100). Warnings and errors do not count as pass.
- With a fully-configured template, all 8 checks should pass → 100% score.
"""
from typing import Dict, Any, List, Tuple
import logging

logger = logging.getLogger(__name__)


# Fixed, ordered list of check definitions. Count is ALWAYS this length.
CHECK_DEFINITIONS: List[Dict[str, str]] = [
    {"id": "template_name",      "category": "Template",    "label": "Template name"},
    {"id": "document_file",      "category": "Template",    "label": "Document file"},
    {"id": "crm_connection",     "category": "CRM",         "label": "CRM connection"},
    # Phase 57: `recipients` and `routing_mode` removed — validation focuses on
    # document structure + fields only. Recipients are validated at send time.
    {"id": "field_placements",   "category": "Fields",      "label": "Field placements"},
    {"id": "signature_fields",   "category": "Fields",      "label": "Signature fields"},
    {"id": "merge_fields",       "category": "Fields",      "label": "Merge fields"},
]
TOTAL_CHECKS = len(CHECK_DEFINITIONS)


class ValidationService:
    """Service to validate DocFlow templates against CRM schema and integrity rules"""

    def __init__(self, db):
        self.db = db

    async def validate_template(self, template_id: str, tenant_id: str) -> Dict[str, Any]:
        """Run full validation on a saved template."""
        template = await self.db.docflow_templates.find_one({
            "id": template_id,
            "tenant_id": tenant_id
        })

        if not template:
            checks = [self._make_check(d, "error", "Template not found") for d in CHECK_DEFINITIONS]
            return self._build_response(checks)

        return await self.validate_template_obj(template, tenant_id=tenant_id)

    async def validate_template_obj(self, template: Dict[str, Any], tenant_id: str) -> Dict[str, Any]:
        """
        Validate a template object. Returns a deterministic result with exactly
        TOTAL_CHECKS entries in `checks`.
        """
        checks: List[Dict[str, Any]] = []

        # 1. Template name
        checks.append(await self._check_template_name(template))

        # 2. Document file
        checks.append(await self._check_document_file(template))

        # 3. CRM Connection
        checks.append(await self._check_crm_connection(template, tenant_id))

        # Phase 57: Recipient + Routing mode checks removed from validation.
        # The user's validation engine should only focus on document structure
        # and fields. Recipients are configured/validated at send time.

        # 6. Field placements
        checks.append(await self._check_field_placements(template))

        # 7. Signature fields
        checks.append(await self._check_signature_fields(template))

        # 8. Merge fields
        checks.append(await self._check_merge_fields(template, tenant_id))

        return self._build_response(checks)

    # ─── Individual Checks ──────────────────────────────────────────

    async def _check_template_name(self, template: Dict[str, Any]) -> Dict[str, Any]:
        name = (template.get("name") or "").strip()
        definition = self._get_definition("template_name")
        if name:
            return self._make_check(definition, "passed", f"Template name is set: '{name}'")
        return self._make_check(definition, "error", "Template name is required")

    async def _check_document_file(self, template: Dict[str, Any]) -> Dict[str, Any]:
        definition = self._get_definition("document_file")
        if template.get("file_url") or template.get("s3_key") or template.get("html_content"):
            return self._make_check(definition, "passed", "Document file is attached")
        return self._make_check(definition, "error", "No document file attached")

    async def _check_crm_connection(self, template: Dict[str, Any], tenant_id: str) -> Dict[str, Any]:
        definition = self._get_definition("crm_connection")
        crm = template.get("crm_connection", {}) or {}
        provider = (crm.get("provider") or "").lower()
        object_name = crm.get("object_name")
        connection_id = crm.get("connection_id")

        if not object_name and not provider:
            return self._make_check(
                definition, "warning",
                "No CRM object connected (optional — link a CRM object to enable merge fields)"
            )

        if provider == "salesforce":
            if not connection_id:
                # Soft-warn (not hard-error) so that legacy templates and public-link
                # generation flows are not blocked. Merge fields that rely on
                # Salesforce will still fail at resolution time if misconfigured.
                return self._make_check(
                    definition, "warning",
                    "Salesforce selected but no connection linked — link a connection in the Connection tab (required for merge fields)"
                )
            if not object_name:
                return self._make_check(
                    definition, "warning",
                    "Salesforce connection linked but no object selected"
                )
            return self._make_check(
                definition, "passed",
                f"Salesforce connection linked — object '{object_name}' configured"
            )

        # Internal CRM or other provider: verify object exists
        if not object_name:
            return self._make_check(
                definition, "warning",
                f"Provider '{provider}' selected but no object chosen"
            )

        obj = await self.db.tenant_objects.find_one({
            "tenant_id": tenant_id,
            "object_name": object_name
        })
        if obj:
            return self._make_check(
                definition, "passed",
                f"CRM object '{object_name}' is connected and active"
            )

        schema_obj = await self.db.schema_objects.find_one({
            "tenant_id": tenant_id,
            "api_name": object_name.lower(),
            "is_active": True
        })
        if schema_obj:
            return self._make_check(
                definition, "passed",
                f"CRM object '{object_name}' is connected and active"
            )

        return self._make_check(
            definition, "error",
            f"CRM object '{object_name}' is not found or inactive"
        )

    # Phase 57: _check_recipients and _check_routing_mode intentionally removed.
    # Recipient/routing validation is now handled exclusively at send time
    # (see generate_links_routes.py).

    async def _check_field_placements(self, template: Dict[str, Any]) -> Dict[str, Any]:
        definition = self._get_definition("field_placements")
        fields = template.get("field_placements", []) or []
        if not fields:
            return self._make_check(
                definition, "warning",
                "No fields placed on document"
            )
        return self._make_check(
            definition, "passed",
            f"{len(fields)} field(s) placed on document"
        )

    async def _check_signature_fields(self, template: Dict[str, Any]) -> Dict[str, Any]:
        definition = self._get_definition("signature_fields")
        fields = template.get("field_placements", []) or []
        signing_types = {"signature", "initials", "date"}
        sign_fields = [f for f in fields if (f.get("type") or "").lower() in signing_types]

        if not sign_fields:
            return self._make_check(
                definition, "warning",
                "No signing fields present (signature / initials / date)"
            )

        sig_count = sum(1 for f in sign_fields if (f.get("type") or "").lower() == "signature")
        return self._make_check(
            definition, "passed",
            f"{len(sign_fields)} signing field(s) present ({sig_count} signature)"
        )

    async def _check_merge_fields(self, template: Dict[str, Any], tenant_id: str) -> Dict[str, Any]:
        definition = self._get_definition("merge_fields")
        fields = template.get("field_placements", []) or []
        merge_fields = [f for f in fields if (f.get("type") or "").lower() == "merge"]

        if not merge_fields:
            return self._make_check(
                definition, "passed",
                "No merge fields used (nothing to validate)"
            )

        crm = template.get("crm_connection", {}) or {}
        provider = (crm.get("provider") or "").lower()

        misconfigured: List[str] = []
        for mf in merge_fields:
            merge_obj = mf.get("mergeObject") or mf.get("merge_object") or ""
            merge_field = mf.get("mergeField") or mf.get("merge_field") or ""
            if not merge_obj or not merge_field:
                label = mf.get("label") or mf.get("name") or "unnamed"
                misconfigured.append(label)

        if misconfigured:
            return self._make_check(
                definition, "error",
                f"{len(misconfigured)} merge field(s) not fully configured: "
                f"{', '.join(misconfigured[:3])}{'...' if len(misconfigured) > 3 else ''}"
            )

        # Salesforce: trust API-driven selection — do not re-verify here to avoid flakiness.
        if provider == "salesforce":
            return self._make_check(
                definition, "passed",
                f"{len(merge_fields)} Salesforce merge field(s) configured"
            )

        # Internal: verify each field exists on its object.
        invalid: List[str] = []
        for mf in merge_fields:
            merge_obj = mf.get("mergeObject") or mf.get("merge_object") or ""
            merge_field = mf.get("mergeField") or mf.get("merge_field") or ""
            valid = await self._check_field_exists(tenant_id, merge_obj, merge_field)
            if not valid:
                invalid.append(f"{merge_obj}.{merge_field}")

        if invalid:
            return self._make_check(
                definition, "error",
                f"{len(invalid)} merge field(s) not found in CRM: "
                f"{', '.join(invalid[:3])}{'...' if len(invalid) > 3 else ''}"
            )

        return self._make_check(
            definition, "passed",
            f"{len(merge_fields)} merge field(s) verified in CRM"
        )

    # ─── Helpers ────────────────────────────────────────────────────

    def _get_definition(self, check_id: str) -> Dict[str, str]:
        for d in CHECK_DEFINITIONS:
            if d["id"] == check_id:
                return d
        raise ValueError(f"Unknown check id: {check_id}")

    @staticmethod
    def _make_check(definition: Dict[str, str], status: str, message: str) -> Dict[str, Any]:
        assert status in ("passed", "warning", "error"), f"Invalid status: {status}"
        return {
            "id": definition["id"],
            "category": definition["category"],
            "label": definition["label"],
            "status": status,
            "message": message,
        }

    def _build_response(self, checks: List[Dict[str, Any]]) -> Dict[str, Any]:
        # Assertion: count must always equal TOTAL_CHECKS to be deterministic.
        assert len(checks) == TOTAL_CHECKS, (
            f"Validation check count mismatch: got {len(checks)}, expected {TOTAL_CHECKS}"
        )

        passed = [c for c in checks if c["status"] == "passed"]
        warnings = [c for c in checks if c["status"] == "warning"]
        errors = [c for c in checks if c["status"] == "error"]

        score = round((len(passed) / TOTAL_CHECKS) * 100)

        return {
            "valid": len(errors) == 0,
            "score": score,
            "total_checks": TOTAL_CHECKS,
            "checks": checks,
            # Legacy flat arrays for backward compatibility (strings):
            "passed": [c["message"] for c in passed],
            "warnings": [c["message"] for c in warnings],
            "errors": [c["message"] for c in errors],
        }

    async def _check_field_exists(self, tenant_id: str, object_name: str, field_name: str) -> bool:
        """Check if a field exists on a CRM object (internal CRM only)."""
        try:
            obj = await self.db.tenant_objects.find_one({
                "tenant_id": tenant_id,
                "object_name": object_name
            })
            if obj:
                fields = obj.get("fields", {})
                if field_name in fields:
                    return True
                custom = await self.db.metadata_fields.find_one({
                    "object_name": object_name,
                    "tenant_id": tenant_id
                })
                if custom:
                    for cf in custom.get("fields", []):
                        if cf.get("api_name") == field_name:
                            return True
                return False

            schema_obj = await self.db.schema_objects.find_one({
                "tenant_id": tenant_id,
                "api_name": object_name.lower(),
                "is_active": True
            })
            if schema_obj:
                field = await self.db.schema_fields.find_one({
                    "tenant_id": tenant_id,
                    "object_id": schema_obj["id"],
                    "api_name": field_name,
                    "is_active": True
                })
                return field is not None

            return False
        except Exception as e:
            logger.error(f"Error checking field: {e}")
            return False
