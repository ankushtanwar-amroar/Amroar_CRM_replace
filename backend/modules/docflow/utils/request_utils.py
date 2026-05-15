"""
Utilities for extracting real client metadata from HTTP requests.

Handles reverse-proxy / Cloudflare environments where request.client.host
is always 127.0.0.1 (the proxy), not the actual user IP.
"""
import re
from typing import Any, Dict, Optional

from fastapi import Request


def get_client_ip(request: Request) -> Optional[str]:
    """
    Return the real client IP, checking proxy/CDN headers before falling
    back to the socket address.

    Priority:
      1. CF-Connecting-IP  — Cloudflare
      2. X-Real-IP         — nginx / most reverse proxies
      3. X-Forwarded-For   — first (leftmost) address in the chain
      4. request.client.host — last-resort socket IP
    """
    if not request:
        return None
    for header in ("cf-connecting-ip", "x-real-ip"):
        value = request.headers.get(header, "").strip()
        if value:
            return value
    xff = request.headers.get("x-forwarded-for", "")
    if xff:
        return xff.split(",")[0].strip()
    return request.client.host if request.client else None


def parse_user_agent(ua_string: str) -> Dict[str, Any]:
    """
    Parse a User-Agent string and return browser, OS, and device dicts.

    Returns a dict with keys: "browser", "os", "device".
    All keys are always present; unknown fields are empty strings / "unknown".
    """
    if not ua_string:
        return {}

    result: Dict[str, Any] = {}

    # ── Browser ──
    browser_name = "Unknown"
    browser_version = ""

    # Check in specificity order (most-specific patterns first)
    _BROWSER_PATTERNS = [
        ("Edge",            r"Edg(?:e|HTML)?/([\d.]+)"),
        ("Opera",           r"OPR/([\d.]+)"),
        ("Samsung Browser", r"SamsungBrowser/([\d.]+)"),
        ("Firefox",         r"Firefox/([\d.]+)"),
        ("Chrome",          r"(?:Chrome|CriOS)/([\d.]+)"),
        ("Safari",          r"Version/([\d.]+).*Safari"),
    ]
    for name, pattern in _BROWSER_PATTERNS:
        m = re.search(pattern, ua_string)
        if m:
            browser_name = name
            browser_version = m.group(1)
            break
    else:
        # IE fallback
        if "MSIE" in ua_string or "Trident" in ua_string:
            browser_name = "Internet Explorer"
            m = re.search(r"(?:MSIE |rv:)([\d.]+)", ua_string)
            if m:
                browser_version = m.group(1).rstrip(";")
        elif "Safari" in ua_string:
            browser_name = "Safari"
            m = re.search(r"Safari/([\d.]+)", ua_string)
            if m:
                browser_version = m.group(1)

    result["browser"] = {"name": browser_name, "version": browser_version}

    # ── OS ──
    os_name = "Unknown"
    os_version = ""

    _NT_MAP = {
        "10.0": "10", "11.0": "11",
        "6.3": "8.1", "6.2": "8", "6.1": "7",
        "6.0": "Vista", "5.2": "XP x64", "5.1": "XP",
    }
    if "Windows NT" in ua_string:
        os_name = "Windows"
        m = re.search(r"Windows NT ([\d.]+)", ua_string)
        if m:
            nt = m.group(1)
            os_version = _NT_MAP.get(nt, nt)
    elif "Android" in ua_string:
        os_name = "Android"
        m = re.search(r"Android ([\d.]+)", ua_string)
        if m:
            os_version = m.group(1)
    elif re.search(r"iPhone|iPad|iPod", ua_string):
        os_name = "iOS"
        m = re.search(r"OS ([\d_]+) like", ua_string)
        if m:
            os_version = m.group(1).replace("_", ".")
    elif "Mac OS X" in ua_string:
        os_name = "macOS"
        m = re.search(r"Mac OS X ([\d_.]+)", ua_string)
        if m:
            os_version = m.group(1).replace("_", ".")
    elif "CrOS" in ua_string:
        os_name = "Chrome OS"
    elif "Linux" in ua_string:
        os_name = "Linux"

    result["os"] = {"name": os_name, "version": os_version}

    # ── Device type ──
    ua_lower = ua_string.lower()
    if any(k in ua_lower for k in ("ipad", "tablet", "kindle", "silk")):
        device_type = "tablet"
    elif any(k in ua_lower for k in ("mobile", "iphone", "ipod", "android", "blackberry", "windows phone")):
        device_type = "mobile"
    else:
        device_type = "desktop"

    result["device"] = {"type": device_type}

    return result


def build_request_metadata(request: Request) -> Dict[str, Any]:
    """
    Build the standard metadata block for webhook / audit payloads.

    Returns:
      {
        "ip_address": "1.2.3.4",
        "user_agent": "Mozilla/5.0 ...",
        "browser":    {"name": "Chrome", "version": "148.0.0.0"},
        "os":         {"name": "Windows", "version": "10"},
        "device":     {"type": "desktop"},
      }
    """
    ua_string = (request.headers.get("user-agent", "") if request else "") or ""
    meta: Dict[str, Any] = {
        "ip_address": get_client_ip(request) if request else None,
        "user_agent": ua_string,
    }
    if ua_string:
        meta.update(parse_user_agent(ua_string))
    return meta
