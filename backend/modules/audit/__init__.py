"""
Universal Audit Trail Module

A completely isolated module for tracking changes to CRM records.
This module provides:
- Centralized audit logging for all CRM objects
- Configurable per-object tracking policies
- Non-blocking audit operations (never blocks record saves)
- Field-level change tracking with old/new values
- Retention policies with automatic cleanup

Safety Guarantees:
- All audit operations are wrapped in try/catch
- Audit failures are logged but never block CRM operations
- Module is completely isolated from existing CRM logic
"""

from .api.audit_routes import router as audit_router
from .services.audit_service import AuditService
from .services.audit_config_service import AuditConfigService

__all__ = ['audit_router', 'AuditService', 'AuditConfigService']
