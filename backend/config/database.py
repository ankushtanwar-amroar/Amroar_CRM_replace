"""Database handle re-export.

Several modules import `from config.database import db`. We forward to the
canonical `shared.database` handle so there is a single Mongo connection per
process.
"""
from shared.database import db  # noqa: F401

__all__ = ["db"]
