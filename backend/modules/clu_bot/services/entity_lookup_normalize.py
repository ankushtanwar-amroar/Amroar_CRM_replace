"""
Generic name variants for CRM account (and similar) lookups.
No tenant-specific strings — improves NL matching vs stored account names.
"""
from __future__ import annotations

import re
from typing import List

_TRAILING_ACCOUNT = re.compile(r"\s+account\s*$", re.IGNORECASE)

# Trailing tokens often omitted from natural speech ("XYZ" vs "XYZ Advisory LLC")
_ORG_SUFFIXES = frozenset(
    {
        "inc",
        "inc.",
        "llc",
        "l.l.c.",
        "ltd",
        "ltd.",
        "plc",
        "corp",
        "corporation",
        "company",
        "co",
        "co.",
        "llp",
        "l.l.p.",
        "lp",
        "l.p.",
        "advisory",
        "advisors",
        "group",
        "holdings",
        "partners",
        "capital",
        "management",
        "services",
        "solutions",
    }
)


def _norm_token(t: str) -> str:
    return t.rstrip(".").lower()


def _strip_org_suffix(tokens: list[str]) -> list[str]:
    if len(tokens) < 2:
        return tokens
    last = _norm_token(tokens[-1])
    if last in _ORG_SUFFIXES:
        return tokens[:-1]
    return tokens


def account_lookup_variants(raw: str) -> List[str]:
    """Ordered unique candidates; try most specific first."""
    if raw is None:
        return []
    s = " ".join(str(raw).split()).strip()
    if not s:
        return []

    variants: List[str] = []
    seen: set[str] = set()

    def add(v: str) -> None:
        v = " ".join(v.split()).strip()
        if not v:
            return
        key = v.casefold()
        if key not in seen:
            seen.add(key)
            variants.append(v)

    add(s)

    no_trailing = _TRAILING_ACCOUNT.sub("", s).strip()
    if no_trailing:
        add(no_trailing)

    tokens = s.split()
    if len(tokens) >= 2:
        add(tokens[0])

    work = list(tokens)
    for _ in range(4):
        nxt = _strip_org_suffix(work)
        if len(nxt) == len(work) or not nxt:
            break
        work = nxt
        add(" ".join(work))

    return variants
