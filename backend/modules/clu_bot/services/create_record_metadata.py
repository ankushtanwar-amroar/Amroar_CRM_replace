"""
Load tenant object field metadata for CLU-BOT create flows: required vs optional,
defaults, and user-facing clarification text. Works for standard and custom (Schema Builder) objects.
"""
from __future__ import annotations

import copy
import logging
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

from motor.motor_asyncio import AsyncIOMotorDatabase

logger = logging.getLogger(__name__)

# Row-level defaults matching typical create dialogs (metadata may omit default key).
_STANDARD_ROW_DEFAULTS: Dict[str, Dict[str, Any]] = {
    "lead": {"status": "New"},
    "task": {"status": "Not Started", "priority": "Normal"},
}


def _apply_standard_row_defaults(object_name: str, data: Dict[str, Any]) -> Dict[str, Any]:
    out = dict(data)
    for k, v in _STANDARD_ROW_DEFAULTS.get(object_name.lower(), {}).items():
        if not _truthy_value(out, k):
            out[k] = v
    return out


@dataclass
class CreateFieldGaps:
    object_label: str
    missing_required: List[Tuple[str, str]]  # (api_name, label)
    optional_offer: List[Tuple[str, str]]  # (api_name, label)

    def build_message(self) -> str:
        miss_labels = [lbl for _, lbl in self.missing_required]
        req = ", ".join(f"**{x}**" for x in miss_labels)
        body = f"I need {req} before I can create this {self.object_label}."
        if self.optional_offer:
            opt_labels = [lbl for _, lbl in self.optional_offer]
            opt = ", ".join(f"**{x}**" for x in opt_labels)
            body += (
                f"\n\nDo you also want to set {opt} now? "
                "You can share values, or skip—I'll use system defaults where allowed."
            )
        return body


def _truthy_value(data: Dict[str, Any], key: str) -> bool:
    v = data.get(key)
    if v is None or v == "" or v == "required":
        return False
    return True


def _field_required(meta: Dict[str, Any]) -> bool:
    return bool(meta.get("required") or meta.get("is_required"))


def _skip_field_for_create(api_name: str, meta: Dict[str, Any]) -> bool:
    if meta.get("read_only") or meta.get("computed"):
        return True
    if meta.get("system_field"):
        return True
    # Conversion / rollup noise
    if api_name.startswith("converted_") or api_name in (
        "is_converted",
        "converted_date",
        "converted_account_id",
        "converted_contact_id",
        "created_from_prospect",
        "source_prospect_id",
        "last_activity_at",
        "open_opportunity_count",
        "open_pipeline_amount",
        "probability_percent",
        "forecast_category",
        "expected_revenue",
        "is_closed",
        "is_deleted",
        "system_timestamp",
    ):
        return True
    return False


def normalize_flat_data_for_metadata(object_name: str, data: Dict[str, Any]) -> Dict[str, Any]:
    """Align user/LLM keys with metadata api names (e.g. opportunity name)."""
    d = dict(data)
    on = object_name.lower()
    if on == "opportunity":
        if _truthy_value(d, "opportunity_name") and not _truthy_value(d, "name"):
            d["name"] = d["opportunity_name"]
        if _truthy_value(d, "name") and not _truthy_value(d, "opportunity_name"):
            d["opportunity_name"] = d["name"]
    return d


def merge_metadata_defaults(
    fields_meta: Dict[str, Dict[str, Any]], data: Dict[str, Any]
) -> Dict[str, Any]:
    """Apply declared field defaults for empty keys (create semantics)."""
    out = dict(data)
    for api, meta in fields_meta.items():
        if _skip_field_for_create(api, meta):
            continue
        if _truthy_value(out, api):
            continue
        dv = meta.get("default")
        if dv is not None:
            out[api] = dv
    return out


async def _load_schema_builder_fields(
    db: AsyncIOMotorDatabase, tenant_id: str, object_id: str
) -> Dict[str, Any]:
    fields = (
        await db.schema_fields.find(
            {"tenant_id": tenant_id, "object_id": object_id, "is_active": True},
            {"_id": 0},
        )
        .sort("sort_order", 1)
        .to_list(None)
    )
    fields_dict: Dict[str, Any] = {}
    for field in fields:
        api = field.get("api_name")
        if not api:
            continue
        fields_dict[api] = {
            "type": field.get("field_type"),
            "label": field.get("label", api),
            "required": field.get("is_required", False),
            "is_from_schema_builder": True,
            "default": field.get("default_value"),
            "read_only": field.get("read_only", False),
        }
        if field.get("field_type") == "picklist" and field.get("picklist_values"):
            fields_dict[api]["options"] = field["picklist_values"]
        if field.get("field_type") == "lookup" and field.get("lookup_object"):
            fields_dict[api]["lookup_object"] = field["lookup_object"]
    return fields_dict


async def load_enriched_object_for_create(
    db: AsyncIOMotorDatabase, tenant_id: str, object_name: str
) -> Optional[Dict[str, Any]]:
    from modules.records.api.records_routes import get_object_definition
    from modules.metadata.api.metadata_routes import enrich_object_with_custom_fields

    obj = await get_object_definition(tenant_id, object_name)
    if not obj:
        return None
    obj = copy.deepcopy(obj)
    if not obj.get("fields"):
        if obj.get("is_from_schema_builder") and obj.get("id"):
            obj["fields"] = await _load_schema_builder_fields(
                db, tenant_id, obj["id"]
            )
        else:
            obj["fields"] = {}
    try:
        obj = await enrich_object_with_custom_fields(obj, tenant_id)
    except Exception as e:
        logger.warning("enrich_object_with_custom_fields failed for %s: %s", object_name, e)
    return obj


def analyze_create_gaps(
    object_name: str,
    object_label: str,
    fields_meta: Dict[str, Dict[str, Any]],
    flat_data: Dict[str, Any],
    *,
    max_optional_prompts: int = 8,
) -> Optional[CreateFieldGaps]:
    if not fields_meta:
        return None

    data = normalize_flat_data_for_metadata(object_name, flat_data)
    data = _apply_standard_row_defaults(object_name, data)
    data = merge_metadata_defaults(fields_meta, data)

    on = object_name.lower()

    # Synthetic: opportunity/contact account name (not always in metadata as api_name)
    has_account_link = _truthy_value(data, "account_name") or _truthy_value(data, "account_id")

    missing: List[Tuple[str, str]] = []
    optional_candidates: List[Tuple[str, str]] = []

    for api, meta in fields_meta.items():
        if _skip_field_for_create(api, meta):
            continue
        label = meta.get("label") or api.replace("_", " ").title()
        req = _field_required(meta)
        if req:
            if _truthy_value(data, api):
                continue
            # Lookup Account often stored as account_id; name-based linking uses account_name
            if api == "account_id" and has_account_link:
                continue
            missing.append((api, label))
        else:
            if _truthy_value(data, api):
                continue
            if api == "account_id" and has_account_link:
                continue
            if api == "account_id" and on in ("opportunity", "contact"):
                continue
            optional_candidates.append((api, label))

    # Prompt account linking for opportunity/contact when metadata uses account_id
    if on in ("opportunity", "contact") and not has_account_link:
        # Avoid duplicate Account label
        if not any(a == "account_id" for a, _ in optional_candidates):
            optional_candidates.insert(0, ("account_name", "Related account"))

    # Sort optional: stable, label alpha
    optional_candidates.sort(key=lambda x: x[1].lower())

    optional_trim = optional_candidates[:max_optional_prompts]

    if not missing and not optional_trim:
        return None
    if not missing:
        # All required satisfied — no clarification needed from metadata layer
        return None

    return CreateFieldGaps(
        object_label=object_label,
        missing_required=missing,
        optional_offer=optional_trim,
    )
