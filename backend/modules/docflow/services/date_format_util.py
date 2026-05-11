"""
Shared helper for consistent date formatting across all PDF rendering paths.

Issue 2 fix — every place that stamps a `date` field value into a PDF must
honor `field.dateFormat`. Previously, signing endpoints stamped the raw
signer-typed value as-is, which silently diverged from the format
configured in the Visual Builder.

DEFAULT format = "MM/DD/YYYY" (US standard, per spec).

Supported formats (must match frontend `DATE_FORMATS`):
    MM/DD/YYYY  (default)
    DD/MM/YYYY
    YYYY-MM-DD
    MMM DD, YYYY
"""
from __future__ import annotations
from datetime import datetime
from typing import Optional


DEFAULT_DATE_FORMAT = "MM/DD/YYYY"

# Stable list — keep in sync with frontend `InteractiveDocumentViewer.DATE_FORMATS`.
SUPPORTED_DATE_FORMATS = ("MM/DD/YYYY", "DD/MM/YYYY", "YYYY-MM-DD", "MMM DD, YYYY")


def _strftime_for(fmt: str) -> str:
    """Map our display format → Python strftime spec."""
    return {
        "MM/DD/YYYY": "%m/%d/%Y",
        "DD/MM/YYYY": "%d/%m/%Y",
        "YYYY-MM-DD": "%Y-%m-%d",
        "MMM DD, YYYY": "%b %d, %Y",
    }.get(fmt, "%m/%d/%Y")


def _strptime_for(fmt: str) -> str:
    """Map our display format → Python strptime spec (parse-side)."""
    return _strftime_for(fmt)


def normalize_date_format(fmt: Optional[str]) -> str:
    """Return a supported format, falling back to MM/DD/YYYY."""
    if fmt in SUPPORTED_DATE_FORMATS:
        return fmt
    return DEFAULT_DATE_FORMAT


def reformat_date_value(value: object, target_format: Optional[str]) -> str:
    """Reformat any reasonable date-ish input into `target_format`.

    The signing UI writes values in the field's configured `dateFormat`,
    but external callers / merge sources can store dates in many shapes
    (ISO 8601, US, EU, long form). This helper:

      1. Treats the value as already-correct if it parses cleanly under
         the target format (no reformatting needed).
      2. Otherwise tries every supported format until one matches.
      3. Falls back to ISO 8601 parse (handles "2026-05-11T00:00:00Z").
      4. If still unparseable, returns the original value untouched
         (better to render literal text than blank out a signed field).

    Returns the formatted string. Empty/None input → "".
    """
    if value is None or value == "":
        return ""
    s = str(value).strip()
    if not s:
        return ""

    target = normalize_date_format(target_format)
    target_strp = _strptime_for(target)

    # 1. Already in target format? Pass through unchanged.
    try:
        datetime.strptime(s[:20].strip(), target_strp)
        return s
    except Exception:
        pass

    # 2. Try every supported format (skip target — already tried).
    candidates = [f for f in SUPPORTED_DATE_FORMATS if f != target]
    parsed: Optional[datetime] = None
    for fmt in candidates:
        try:
            parsed = datetime.strptime(s[:20].strip(), _strptime_for(fmt))
            break
        except Exception:
            continue

    # 3. ISO 8601 fallback (handles Z-suffix and offsets).
    if parsed is None:
        try:
            parsed = datetime.fromisoformat(s.replace("Z", "+00:00"))
        except Exception:
            parsed = None

    if parsed is None:
        # Unparseable — return the original string so the PDF isn't blank.
        return s

    return parsed.strftime(_strftime_for(target))
