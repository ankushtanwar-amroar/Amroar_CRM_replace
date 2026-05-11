"""
Field defaults helpers — Phase 81.71

Pre-process submitted `field_data` so authored defaults (radio groups,
dropdown defaults, text defaults) end up in the final PDF even when the
signer never explicitly interacted with them.

Used by all three PDF-rendering pipelines to keep behavior consistent:
- `pdf_overlay_service_enhanced.py`       (single-doc ReportLab overlay)
- `package_public_routes.py`              (email package signing)
- `package_public_link_routes.py`         (public-link package signing)
"""
from typing import Dict, Any, List


def apply_radio_defaults(
    field_placements: List[Dict[str, Any]],
    field_data: Dict[str, Any],
) -> Dict[str, Any]:
    """Return a copy of `field_data` with any missing radio-group selections
    filled in from the placement marked `defaultChecked: true`.

    A radio group is represented as multiple fields sharing the same
    `groupName`. The selected option is stored as `field_data[groupName]`.
    If the signer never interacted with a group, this helper injects the
    authored default so the PDF matches the signing-UI preview.

    Idempotent — user selections are never overwritten.
    """
    fd = dict(field_data or {})
    groups: Dict[str, List[Dict[str, Any]]] = {}
    for f in field_placements or []:
        if (f.get("type") or "").lower() != "radio":
            continue
        grp = f.get("groupName") or f.get("group_name")
        if grp:
            groups.setdefault(grp, []).append(f)

    for grp, fields in groups.items():
        # Respect any existing user selection.
        if fd.get(grp) not in (None, "", False):
            continue
        # Find the option flagged as default.
        for f in fields:
            is_default = (
                f.get("defaultChecked") is True
                or f.get("default_checked") is True
            )
            if not is_default:
                continue
            opt_val = (
                f.get("optionValue")
                or f.get("option_value")
                or f.get("id")
            )
            if opt_val:
                fd[grp] = opt_val
                break
    return fd
