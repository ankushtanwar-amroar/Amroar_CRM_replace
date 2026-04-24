"""Application settings.

Exposes a single `settings` object with paths and flags consumed across the
backend. Kept minimal on purpose — only adds fields the codebase actually uses.
"""
import os
from pathlib import Path


class _Settings:
    # STORAGE_BASE_DIR is the root under which the app writes uploaded files,
    # attachments, email images, etc. Defaults to the backend directory so
    # `storage/`, `uploads/`, etc. live next to `server.py` (matches pre-refactor
    # layout). Override via STORAGE_BASE_DIR env var in production.
    STORAGE_BASE_DIR: str = os.environ.get(
        "STORAGE_BASE_DIR",
        str(Path(__file__).resolve().parent.parent),
    )


settings = _Settings()
