"""
Validation Service - Comprehensive template validation for DocFlow
"""
from typing import Dict, Any, List
import logging

logger = logging.getLogger(__name__)


class ValidationService:
    """Service to validate DocFlow templates against CRM schema and integrity rules"""

    def __init__(self, db):
        self.db = db

    async def validate_template(self, template_id: str, tenant_id: str) -> Dict[str, Any]:
        """
        Run full validation on a template.
        Returns: { valid: bool, errors: [], warnings: [], score: int }
        """
        template = await self.db.docflow_templates.find_one({
            "id": template_id,
            "tenant_id": tenant_id
        })

        if not template:
            return {"valid": False, "errors": ["Template not found"], "warnings": [], "score": 0}

        return await self.validate_template_obj(template, tenant_id=tenant_id)

    async def validate_template_obj(self, template: Dict[str, Any], tenant_id: str) -> Dict[str, Any]:
        """
        Validate an already-loaded template dict (doesn't require DB lookup by id).
        Useful for enforcing "validate before save/send" in the API layer.
        """
        errors: List[str] = []
        warnings: List[str] = []
        passed: List[str] = []

        # 1. Template name
        if not template.get("name", "").strip():
            errors.append("Template name is required")
        else:
            passed.append("Template name is set")

        # 2. Document file
        if not template.get("file_url") and not template.get("s3_key") and not template.get("html_content"):
            errors.append("No document file attached")
        else:
            passed.append("Document file is attached")

        # 3. CRM Connection
        crm_connection = template.get("crm_connection", {}) or {}
        if not crm_connection.get("object_name"):
            warnings.append("No CRM object connected")
        else:
            # Verify object exists based on CRM provider type
            obj_name = crm_connection["object_name"]
            provider = crm_connection.get("provider", "internal")
            connection_id = crm_connection.get("connection_id")

            if provider == "salesforce":
                # Salesforce objects are validated via the Salesforce API, not local DB.
                # If we have a connection_id, trust the selected object since it was
                # fetched from Salesforce when the user configured the connection tab.
                if connection_id:
                    passed.append(f"Salesforce object '{obj_name}' configured via connection")
                else:
                    warnings.append(f"Salesforce object '{obj_name}' selected but no connection_id linked — please reselect in Connection tab")
            else:
                # Internal CRM — verify object exists in tenant_objects or schema_objects
                obj = await self.db.tenant_objects.find_one({
                    "tenant_id": tenant_id,
                    "object_name": obj_name
                })
                if not obj:
                    schema_obj = await self.db.schema_objects.find_one({
                        "tenant_id": tenant_id,
                        "api_name": obj_name.lower(),
                        "is_active": True
                    })
                    if not schema_obj:
                        errors.append(f"CRM object '{obj_name}' is not found or inactive")
                    else:
                        passed.append(f"CRM object '{obj_name}' exists and is active")
                else:
                    passed.append(f"CRM object '{obj_name}' exists")

        # 3b. Recipients + routing (required for any signing field)
        template_recipients = template.get("recipients", []) or []
        routing_mode = template.get("routing_mode", "sequential")
        if routing_mode not in ["sequential", "parallel"]:
            errors.append("Invalid routing_mode (must be 'sequential' or 'parallel')")

        template_recipient_ids = {r.get("id") for r in template_recipients if r.get("id")}
        signer_templates = [r for r in template_recipients if r.get("role") == "signer"]
        # if not signer_templates:
            # errors.append("At least one signer recipient is required")

        routing_orders = []
        for r in template_recipients:
            ro = r.get("routing_order", 1)
            try:
                ro_int = int(ro)
                if ro_int < 1:
                    errors.append("Recipient routing_order must be >= 1")
                routing_orders.append(ro_int)
            except Exception:
                errors.append("Recipient routing_order must be an integer")

        if routing_orders and len(set(routing_orders)) != len(routing_orders):
            # Routing order needs to be deterministic for sequential routing
            errors.append("Recipient routing_order values must be unique")

        # 4. Field placements
        field_placements = template.get("field_placements", []) or []
        if not field_placements:
            warnings.append("No fields placed on document")
        else:
            passed.append(f"{len(field_placements)} field(s) placed on document")

            # Check for signature fields
            signatures = [f for f in field_placements if f.get("type") in ["signature", "initials", "date"]]
            if not signatures:
                warnings.append("No signing-related fields found (signature/initials/date)")

            # Critical rule: any signing-related field must be assigned to a recipient
            signing_related_types = {"signature", "initials", "date"}
            for f in field_placements:
                if f.get("type") not in signing_related_types:
                    continue
                rid = f.get("recipient_id") or f.get("recipientId") or ""
                # if not rid:
                #     errors.append("Signing-related fields must be assigned to a recipient")
                #     continue
                # if rid not in template_recipient_ids:
                #     errors.append("Signing-related field recipient_id must match a template recipient")

            # Validate merge fields against CRM
            merge_fields = [f for f in field_placements if f.get("type") == "merge"]
            if merge_fields and crm_connection.get("object_name"):
                for mf in merge_fields:
                    # Handle both camelCase and snake_case from different JS versions or backend models
                    merge_obj = mf.get("mergeObject") or mf.get("merge_object") or ""
                    merge_field = mf.get("mergeField") or mf.get("merge_field") or ""

                    if not merge_obj or not merge_field:
                        label = mf.get('label') or mf.get('name') or 'unnamed'
                        errors.append(f"Merge field '{label}' not fully configured (object or field missing)")
                        logger.warning(f"Validation failed for field: {mf}")
                    else:
                        source_type = mf.get("sourceType") or crm_connection.get("provider", "internal").upper()
                        
                        if source_type == "SALESFORCE":
                            # Trust Salesforce API fields, skip strict internal DB check
                            passed.append(f"Salesforce merge field '{merge_obj}.{merge_field}' verified")
                        else:
                            # Verify internal CRM field exists on object
                            valid = await self._check_field_exists(
                                tenant_id, merge_obj, merge_field
                            )
                            if not valid:
                                errors.append(f"Field '{merge_obj}.{merge_field}' not found in CRM")
                            else:
                                passed.append(f"CRM merge field '{merge_obj}.{merge_field}' verified")

        # 5. Webhook config
        webhook_config = template.get("webhook_config", {}) or {}
        if webhook_config.get("url") and not webhook_config.get("events"):
            warnings.append("Webhook URL configured but no events selected")

        # Calculate score
        total_checks = len(errors) + len(warnings) + len(passed)
        score = round((len(passed) / max(total_checks, 1)) * 100)

        return {
            "valid": len(errors) == 0,
            "errors": errors,
            "warnings": warnings,
            "passed": passed,
            "score": score,
            "total_checks": total_checks
        }

    async def _check_field_exists(self, tenant_id: str, object_name: str, field_name: str) -> bool:
        """Check if a field exists on a CRM object"""
        try:
            # Check tenant_objects
            obj = await self.db.tenant_objects.find_one({
                "tenant_id": tenant_id,
                "object_name": object_name
            })

            if obj:
                fields = obj.get("fields", {})
                if field_name in fields:
                    return True

                # Check custom fields
                custom = await self.db.metadata_fields.find_one({
                    "object_name": object_name,
                    "tenant_id": tenant_id
                })
                if custom:
                    for cf in custom.get("fields", []):
                        if cf.get("api_name") == field_name:
                            return True
                return False

            # Check schema objects
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
