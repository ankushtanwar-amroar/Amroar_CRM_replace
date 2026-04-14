"""
File Manager - Admin Setup Routes
API endpoints for the 9-tab admin configuration interface.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional, Dict, Any, List
from pydantic import BaseModel
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/files/admin", tags=["File Manager Admin"])


def get_db():
    """Get database instance"""
    from server import db
    return db


def get_current_user_dep():
    """Get current authenticated user dependency"""
    from server import get_current_user
    return get_current_user


def user_to_dict(user) -> dict:
    """Convert User model to dict for easier access"""
    if isinstance(user, dict):
        return user
    return {
        "id": getattr(user, 'id', None) or getattr(user, 'user_id', None),
        "name": f"{getattr(user, 'first_name', '')} {getattr(user, 'last_name', '')}".strip() or getattr(user, 'name', 'Unknown'),
        "email": getattr(user, 'email', None),
        "tenant_id": getattr(user, 'tenant_id', None),
        "role": getattr(user, 'role_id', None),
    }


def get_extended_setup_service():
    from ..services.extended_setup_service import ExtendedSetupService
    return ExtendedSetupService(get_db())


# ============================================================================
# Request Models
# ============================================================================

class GeneralSettingsUpdate(BaseModel):
    module_enabled: Optional[bool] = None
    multi_record_linking: Optional[bool] = None
    default_storage_mode: Optional[str] = None
    default_public_link_expiry_days: Optional[int] = None
    default_public_link_require_password: Optional[bool] = None
    default_public_link_allow_download: Optional[bool] = None
    notification_on_upload: Optional[bool] = None
    notification_on_share: Optional[bool] = None
    notification_on_link: Optional[bool] = None


class CategoryCreate(BaseModel):
    name: str
    description: Optional[str] = None
    icon: Optional[str] = "file"
    color: Optional[str] = "#6B7280"
    object_name: Optional[str] = None
    allowed_file_types: Optional[List[str]] = []
    required_tags: Optional[List[str]] = []
    required_sensitivity: Optional[str] = None
    default_folder_id: Optional[str] = None
    default_library_id: Optional[str] = None
    max_file_size_mb: Optional[int] = None


class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None
    object_name: Optional[str] = None
    allowed_file_types: Optional[List[str]] = None
    required_tags: Optional[List[str]] = None
    required_sensitivity: Optional[str] = None
    default_folder_id: Optional[str] = None
    default_library_id: Optional[str] = None
    max_file_size_mb: Optional[int] = None


class TagCreate(BaseModel):
    name: str
    color: Optional[str] = "#6B7280"
    tag_type: Optional[str] = "user"
    description: Optional[str] = None
    key_value: Optional[str] = None
    required_for_categories: Optional[List[str]] = []
    required_for_objects: Optional[List[str]] = []


class TagUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None
    tag_type: Optional[str] = None
    description: Optional[str] = None
    key_value: Optional[str] = None
    required_for_categories: Optional[List[str]] = None
    required_for_objects: Optional[List[str]] = None


class TagSettingsUpdate(BaseModel):
    allow_freeform_tags: Optional[bool] = None
    max_tags_per_file: Optional[int] = None
    tag_validation_enabled: Optional[bool] = None


class LibraryCreate(BaseModel):
    name: str
    description: Optional[str] = None
    icon: Optional[str] = "folder"
    color: Optional[str] = "#3B82F6"
    is_public: Optional[bool] = False
    default_role: Optional[str] = "viewer"
    is_default: Optional[bool] = False
    publish_rules: Optional[Dict[str, Any]] = {}
    folder_template_id: Optional[str] = None


class LibraryUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None
    is_public: Optional[bool] = None
    default_role: Optional[str] = None
    is_default: Optional[bool] = None
    publish_rules: Optional[Dict[str, Any]] = None
    folder_template_id: Optional[str] = None


class LibraryMemberAdd(BaseModel):
    user_id: str
    role: str = "viewer"


class SharingSettingsUpdate(BaseModel):
    public_links_enabled: Optional[bool] = None
    require_expiry: Optional[bool] = None
    max_expiry_days: Optional[int] = None
    default_expiry_days: Optional[int] = None
    require_password: Optional[bool] = None
    min_password_length: Optional[int] = None
    allow_download_default: Optional[bool] = None
    restricted_files_public_link_allowed: Optional[bool] = None
    internal_sharing_enabled: Optional[bool] = None
    share_to_teams_enabled: Optional[bool] = None
    share_to_roles_enabled: Optional[bool] = None
    access_logging_enabled: Optional[bool] = None


class StorageConnectorCreate(BaseModel):
    name: str
    provider: str  # local, s3, google_drive
    bucket_name: Optional[str] = None
    region: Optional[str] = None
    root_path: Optional[str] = "/"
    access_key_id: Optional[str] = None
    folder_id: Optional[str] = None
    is_default: Optional[bool] = False


class StorageConnectorUpdate(BaseModel):
    name: Optional[str] = None
    status: Optional[str] = None
    config: Optional[Dict[str, Any]] = None
    is_active: Optional[bool] = None
    is_default: Optional[bool] = None


class StorageSettingsUpdate(BaseModel):
    default_provider: Optional[str] = None
    routing_rules: Optional[List[Dict[str, Any]]] = None
    conflict_handling: Optional[str] = None


class AutomationRuleCreate(BaseModel):
    name: str
    description: Optional[str] = None
    is_active: Optional[bool] = True
    trigger: Dict[str, Any]
    conditions: Optional[List[Dict[str, Any]]] = []
    actions: List[Dict[str, Any]]
    priority: Optional[int] = 0
    is_template: Optional[bool] = False


class AutomationRuleUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None
    trigger: Optional[Dict[str, Any]] = None
    conditions: Optional[List[Dict[str, Any]]] = None
    actions: Optional[List[Dict[str, Any]]] = None
    priority: Optional[int] = None


class AISettingsUpdate(BaseModel):
    ai_enabled: Optional[bool] = None
    auto_tag_enabled: Optional[bool] = None
    sensitivity_detection_enabled: Optional[bool] = None
    content_analysis_enabled: Optional[bool] = None
    ai_logging_enabled: Optional[bool] = None
    confidence_threshold: Optional[float] = None
    max_suggestions: Optional[int] = None


class AuditSettingsUpdate(BaseModel):
    audit_events_enabled: Optional[Dict[str, bool]] = None
    retention_enabled: Optional[bool] = None
    default_retention_days: Optional[int] = None
    audit_export_enabled: Optional[bool] = None


class RetentionPolicyCreate(BaseModel):
    name: str
    description: Optional[str] = None
    category_id: Optional[str] = None
    retention_days: int
    action: Optional[str] = "archive"
    legal_hold: Optional[bool] = False


class RetentionPolicyUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    category_id: Optional[str] = None
    retention_days: Optional[int] = None
    action: Optional[str] = None
    legal_hold: Optional[bool] = None
    is_active: Optional[bool] = None


class LegalHoldRequest(BaseModel):
    enabled: bool
    reason: Optional[str] = None


class AuditExportRequest(BaseModel):
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    event_types: Optional[List[str]] = None
    file_id: Optional[str] = None


# ============================================================================
# TAB 1 - GENERAL SETTINGS
# ============================================================================

@router.get("/general")
async def get_general_settings(current_user=Depends(get_current_user_dep())):
    """Get general File Manager settings"""
    user = user_to_dict(current_user)
    service = get_extended_setup_service()
    settings = await service.get_general_settings(user["tenant_id"])
    return {"settings": settings}


@router.put("/general")
async def update_general_settings(
    data: GeneralSettingsUpdate,
    current_user=Depends(get_current_user_dep())
):
    """Update general File Manager settings"""
    user = user_to_dict(current_user)
    service = get_extended_setup_service()
    
    # Only include non-None values
    settings = {k: v for k, v in data.dict().items() if v is not None}
    
    await service.update_general_settings(user["tenant_id"], settings)
    return {"success": True, "settings": settings}


# ============================================================================
# TAB 2 - FILE TYPES & CATEGORIES
# ============================================================================

@router.get("/categories")
async def get_categories_config(current_user=Depends(get_current_user_dep())):
    """Get all categories configuration"""
    user = user_to_dict(current_user)
    service = get_extended_setup_service()
    categories = await service.get_categories_config(user["tenant_id"])
    return {"categories": categories}


@router.post("/categories")
async def create_category(
    data: CategoryCreate,
    current_user=Depends(get_current_user_dep())
):
    """Create a new category"""
    user = user_to_dict(current_user)
    service = get_extended_setup_service()
    category = await service.create_category(
        tenant_id=user["tenant_id"],
        user_id=user["id"],
        data=data.dict()
    )
    return category


@router.put("/categories/{category_id}")
async def update_category(
    category_id: str,
    data: CategoryUpdate,
    current_user=Depends(get_current_user_dep())
):
    """Update a category"""
    user = user_to_dict(current_user)
    service = get_extended_setup_service()
    
    update_data = {k: v for k, v in data.dict().items() if v is not None}
    success = await service.update_category(user["tenant_id"], category_id, update_data)
    
    if not success:
        raise HTTPException(status_code=404, detail="Category not found")
    return {"success": True}


@router.delete("/categories/{category_id}")
async def delete_category(
    category_id: str,
    current_user=Depends(get_current_user_dep())
):
    """Delete a category"""
    user = user_to_dict(current_user)
    service = get_extended_setup_service()
    success = await service.delete_category(user["tenant_id"], category_id)
    return {"success": success}


# ============================================================================
# TAB 3 - TAGS & METADATA RULES
# ============================================================================

@router.get("/tags")
async def get_tags_config(current_user=Depends(get_current_user_dep())):
    """Get tags configuration including settings"""
    user = user_to_dict(current_user)
    service = get_extended_setup_service()
    config = await service.get_tags_config(user["tenant_id"])
    return config


@router.post("/tags")
async def create_tag(
    data: TagCreate,
    current_user=Depends(get_current_user_dep())
):
    """Create a new tag"""
    user = user_to_dict(current_user)
    service = get_extended_setup_service()
    tag = await service.create_tag(
        tenant_id=user["tenant_id"],
        user_id=user["id"],
        data=data.dict()
    )
    return tag


# IMPORTANT: This must come BEFORE /tags/{tag_id} to avoid route conflict
@router.put("/tags/settings")
async def update_tag_settings(
    data: TagSettingsUpdate,
    current_user=Depends(get_current_user_dep())
):
    """Update tag settings"""
    user = user_to_dict(current_user)
    service = get_extended_setup_service()
    
    settings = {k: v for k, v in data.dict().items() if v is not None}
    await service.update_tag_settings(user["tenant_id"], settings)
    return {"success": True}


@router.put("/tags/{tag_id}")
async def update_tag(
    tag_id: str,
    data: TagUpdate,
    current_user=Depends(get_current_user_dep())
):
    """Update a tag"""
    user = user_to_dict(current_user)
    service = get_extended_setup_service()
    
    update_data = {k: v for k, v in data.dict().items() if v is not None}
    success = await service.update_tag(user["tenant_id"], tag_id, update_data)
    
    if not success:
        raise HTTPException(status_code=404, detail="Tag not found")
    return {"success": True}


@router.delete("/tags/{tag_id}")
async def delete_tag(
    tag_id: str,
    current_user=Depends(get_current_user_dep())
):
    """Delete a tag"""
    user = user_to_dict(current_user)
    service = get_extended_setup_service()
    success = await service.delete_tag(user["tenant_id"], tag_id)
    return {"success": success}


# ============================================================================
# TAB 4 - FOLDERS & LIBRARIES
# ============================================================================

@router.get("/libraries")
async def get_libraries_config(current_user=Depends(get_current_user_dep())):
    """Get all libraries with their configuration"""
    user = user_to_dict(current_user)
    service = get_extended_setup_service()
    libraries = await service.get_libraries_config(user["tenant_id"])
    return {"libraries": libraries}


@router.post("/libraries")
async def create_library(
    data: LibraryCreate,
    current_user=Depends(get_current_user_dep())
):
    """Create a new library"""
    user = user_to_dict(current_user)
    service = get_extended_setup_service()
    library = await service.create_library(
        tenant_id=user["tenant_id"],
        user_id=user["id"],
        data=data.dict()
    )
    return library


@router.put("/libraries/{library_id}")
async def update_library(
    library_id: str,
    data: LibraryUpdate,
    current_user=Depends(get_current_user_dep())
):
    """Update a library"""
    user = user_to_dict(current_user)
    service = get_extended_setup_service()
    
    update_data = {k: v for k, v in data.dict().items() if v is not None}
    success = await service.update_library(user["tenant_id"], library_id, update_data)
    
    if not success:
        raise HTTPException(status_code=404, detail="Library not found")
    return {"success": True}


@router.delete("/libraries/{library_id}")
async def delete_library(
    library_id: str,
    current_user=Depends(get_current_user_dep())
):
    """Delete a library"""
    user = user_to_dict(current_user)
    service = get_extended_setup_service()
    
    try:
        success = await service.delete_library(user["tenant_id"], library_id)
        return {"success": success}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/libraries/{library_id}/members")
async def get_library_members(
    library_id: str,
    current_user=Depends(get_current_user_dep())
):
    """Get library members"""
    user = user_to_dict(current_user)
    service = get_extended_setup_service()
    members = await service.get_library_members(user["tenant_id"], library_id)
    return {"members": members}


@router.post("/libraries/{library_id}/members")
async def add_library_member(
    library_id: str,
    data: LibraryMemberAdd,
    current_user=Depends(get_current_user_dep())
):
    """Add a member to a library"""
    user = user_to_dict(current_user)
    service = get_extended_setup_service()
    member = await service.add_library_member(
        tenant_id=user["tenant_id"],
        library_id=library_id,
        user_id=data.user_id,
        role=data.role,
        added_by=user["id"]
    )
    return member


# ============================================================================
# TAB 5 - SHARING & PUBLIC LINKS
# ============================================================================

@router.get("/sharing")
async def get_sharing_settings(current_user=Depends(get_current_user_dep())):
    """Get sharing and public link settings"""
    user = user_to_dict(current_user)
    service = get_extended_setup_service()
    settings = await service.get_sharing_settings(user["tenant_id"])
    return {"settings": settings}


@router.put("/sharing")
async def update_sharing_settings(
    data: SharingSettingsUpdate,
    current_user=Depends(get_current_user_dep())
):
    """Update sharing settings"""
    user = user_to_dict(current_user)
    service = get_extended_setup_service()
    
    settings = {k: v for k, v in data.dict().items() if v is not None}
    await service.update_sharing_settings(user["tenant_id"], settings)
    return {"success": True}


# ============================================================================
# TAB 6 - STORAGE & CONNECTORS
# ============================================================================

@router.get("/storage")
async def get_storage_config(current_user=Depends(get_current_user_dep())):
    """Get storage configuration"""
    user = user_to_dict(current_user)
    service = get_extended_setup_service()
    config = await service.get_storage_config(user["tenant_id"])
    return config


@router.post("/storage/connectors")
async def create_storage_connector(
    data: StorageConnectorCreate,
    current_user=Depends(get_current_user_dep())
):
    """Create a new storage connector"""
    user = user_to_dict(current_user)
    service = get_extended_setup_service()
    connector = await service.create_storage_connector(
        tenant_id=user["tenant_id"],
        user_id=user["id"],
        data=data.dict()
    )
    return connector


@router.put("/storage/connectors/{connector_id}")
async def update_storage_connector(
    connector_id: str,
    data: StorageConnectorUpdate,
    current_user=Depends(get_current_user_dep())
):
    """Update a storage connector"""
    user = user_to_dict(current_user)
    service = get_extended_setup_service()
    
    update_data = {k: v for k, v in data.dict().items() if v is not None}
    success = await service.update_storage_connector(user["tenant_id"], connector_id, update_data)
    
    if not success:
        raise HTTPException(status_code=404, detail="Connector not found")
    return {"success": True}


@router.delete("/storage/connectors/{connector_id}")
async def delete_storage_connector(
    connector_id: str,
    current_user=Depends(get_current_user_dep())
):
    """Delete a storage connector"""
    user = user_to_dict(current_user)
    service = get_extended_setup_service()
    success = await service.delete_storage_connector(user["tenant_id"], connector_id)
    return {"success": success}


@router.put("/storage/settings")
async def update_storage_settings(
    data: StorageSettingsUpdate,
    current_user=Depends(get_current_user_dep())
):
    """Update storage settings"""
    user = user_to_dict(current_user)
    service = get_extended_setup_service()
    
    settings = {k: v for k, v in data.dict().items() if v is not None}
    await service.update_storage_settings(user["tenant_id"], settings)
    return {"success": True}


# ============================================================================
# TAB 7 - AUTOMATION & ENDPOINTS
# ============================================================================

@router.get("/automation/rules")
async def get_automation_rules(current_user=Depends(get_current_user_dep())):
    """Get all automation rules"""
    user = user_to_dict(current_user)
    service = get_extended_setup_service()
    rules = await service.get_automation_rules(user["tenant_id"])
    return {"rules": rules}


@router.post("/automation/rules")
async def create_automation_rule(
    data: AutomationRuleCreate,
    current_user=Depends(get_current_user_dep())
):
    """Create a new automation rule"""
    user = user_to_dict(current_user)
    service = get_extended_setup_service()
    rule = await service.create_automation_rule(
        tenant_id=user["tenant_id"],
        user_id=user["id"],
        data=data.dict()
    )
    return rule


@router.put("/automation/rules/{rule_id}")
async def update_automation_rule(
    rule_id: str,
    data: AutomationRuleUpdate,
    current_user=Depends(get_current_user_dep())
):
    """Update an automation rule"""
    user = user_to_dict(current_user)
    service = get_extended_setup_service()
    
    update_data = {k: v for k, v in data.dict().items() if v is not None}
    success = await service.update_automation_rule(user["tenant_id"], rule_id, update_data)
    
    if not success:
        raise HTTPException(status_code=404, detail="Rule not found")
    return {"success": True}


@router.delete("/automation/rules/{rule_id}")
async def delete_automation_rule(
    rule_id: str,
    current_user=Depends(get_current_user_dep())
):
    """Delete an automation rule"""
    user = user_to_dict(current_user)
    service = get_extended_setup_service()
    success = await service.delete_automation_rule(user["tenant_id"], rule_id)
    return {"success": success}


@router.post("/automation/templates")
async def create_default_automation_templates(current_user=Depends(get_current_user_dep())):
    """Create default automation rule templates"""
    user = user_to_dict(current_user)
    service = get_extended_setup_service()
    templates = await service.create_default_automation_templates(
        tenant_id=user["tenant_id"],
        user_id=user["id"]
    )
    return {"templates": templates}


# ============================================================================
# TAB 8 - AI ASSISTANT
# ============================================================================

@router.get("/ai")
async def get_ai_settings(current_user=Depends(get_current_user_dep())):
    """Get AI assistant settings"""
    user = user_to_dict(current_user)
    service = get_extended_setup_service()
    settings = await service.get_ai_settings(user["tenant_id"])
    return {"settings": settings}


@router.put("/ai")
async def update_ai_settings(
    data: AISettingsUpdate,
    current_user=Depends(get_current_user_dep())
):
    """Update AI settings"""
    user = user_to_dict(current_user)
    service = get_extended_setup_service()
    
    settings = {k: v for k, v in data.dict().items() if v is not None}
    await service.update_ai_settings(user["tenant_id"], settings)
    return {"success": True}


# ============================================================================
# TAB 9 - AUDIT & RETENTION
# ============================================================================

@router.get("/audit")
async def get_audit_settings(current_user=Depends(get_current_user_dep())):
    """Get audit and retention settings"""
    user = user_to_dict(current_user)
    service = get_extended_setup_service()
    settings = await service.get_audit_settings(user["tenant_id"])
    return {"settings": settings}


@router.put("/audit")
async def update_audit_settings(
    data: AuditSettingsUpdate,
    current_user=Depends(get_current_user_dep())
):
    """Update audit settings"""
    user = user_to_dict(current_user)
    service = get_extended_setup_service()
    
    settings = {k: v for k, v in data.dict().items() if v is not None}
    await service.update_audit_settings(user["tenant_id"], settings)
    return {"success": True}


@router.get("/retention/policies")
async def get_retention_policies(current_user=Depends(get_current_user_dep())):
    """Get retention policies"""
    user = user_to_dict(current_user)
    service = get_extended_setup_service()
    policies = await service.get_retention_policies(user["tenant_id"])
    return {"policies": policies}


@router.post("/retention/policies")
async def create_retention_policy(
    data: RetentionPolicyCreate,
    current_user=Depends(get_current_user_dep())
):
    """Create a new retention policy"""
    user = user_to_dict(current_user)
    service = get_extended_setup_service()
    policy = await service.create_retention_policy(
        tenant_id=user["tenant_id"],
        user_id=user["id"],
        data=data.dict()
    )
    return policy


@router.put("/retention/policies/{policy_id}")
async def update_retention_policy(
    policy_id: str,
    data: RetentionPolicyUpdate,
    current_user=Depends(get_current_user_dep())
):
    """Update a retention policy"""
    user = user_to_dict(current_user)
    service = get_extended_setup_service()
    
    update_data = {k: v for k, v in data.dict().items() if v is not None}
    success = await service.update_retention_policy(user["tenant_id"], policy_id, update_data)
    
    if not success:
        raise HTTPException(status_code=404, detail="Policy not found")
    return {"success": True}


@router.delete("/retention/policies/{policy_id}")
async def delete_retention_policy(
    policy_id: str,
    current_user=Depends(get_current_user_dep())
):
    """Delete a retention policy"""
    user = user_to_dict(current_user)
    service = get_extended_setup_service()
    success = await service.delete_retention_policy(user["tenant_id"], policy_id)
    return {"success": success}


@router.post("/files/{file_id}/legal-hold")
async def set_legal_hold(
    file_id: str,
    data: LegalHoldRequest,
    current_user=Depends(get_current_user_dep())
):
    """Set or remove legal hold on a file"""
    user = user_to_dict(current_user)
    service = get_extended_setup_service()
    await service.set_legal_hold(
        tenant_id=user["tenant_id"],
        file_id=file_id,
        enabled=data.enabled,
        user_id=user["id"],
        reason=data.reason
    )
    return {"success": True}


@router.post("/audit/export")
async def export_audit_logs(
    data: AuditExportRequest,
    current_user=Depends(get_current_user_dep())
):
    """Export audit logs"""
    user = user_to_dict(current_user)
    service = get_extended_setup_service()
    
    filters = {}
    if data.start_date:
        from datetime import datetime
        filters["start_date"] = datetime.fromisoformat(data.start_date)
    if data.end_date:
        from datetime import datetime
        filters["end_date"] = datetime.fromisoformat(data.end_date)
    if data.event_types:
        filters["event_types"] = data.event_types
    if data.file_id:
        filters["file_id"] = data.file_id
    
    logs = await service.export_audit_logs(user["tenant_id"], filters)
    return {"logs": logs, "count": len(logs)}



# ============================================================================
# CRM OBJECT REGISTRATION (Architectural Promotion)
# ============================================================================

@router.post("/crm/register")
async def register_file_manager_as_crm_objects(current_user=Depends(get_current_user_dep())):
    """
    Register File Manager objects (File, FileVersion, FileRecordLink) as first-class CRM objects.
    
    This is an architectural promotion that:
    - Makes File objects visible in Object Manager
    - Enables them in Configure Search Metadata
    - Makes them available in reporting
    - Does NOT create new collections - maps to existing fm_* collections
    - Does NOT rewrite security - continues to use ACL & enforcement services
    
    Idempotent: Can be called multiple times safely.
    """
    user = user_to_dict(current_user)
    
    from ..services.crm_registration_service import (
        register_file_manager_objects,
        register_file_in_search_config
    )
    
    db = get_db()
    
    # Register objects in tenant_objects
    registration_result = await register_file_manager_objects(db, user["tenant_id"])
    
    # Register in search config
    search_result = await register_file_in_search_config(db, user["tenant_id"])
    
    return {
        "success": True,
        "message": "File Manager objects registered as CRM objects",
        "registration": registration_result,
        "search_config": search_result
    }


@router.delete("/crm/unregister")
async def unregister_file_manager_crm_objects(current_user=Depends(get_current_user_dep())):
    """
    Unregister File Manager objects from CRM (for cleanup/testing).
    Does NOT delete data - only removes CRM object registration.
    """
    user = user_to_dict(current_user)
    
    from ..services.crm_registration_service import unregister_file_manager_objects
    
    db = get_db()
    result = await unregister_file_manager_objects(db, user["tenant_id"])
    
    return {
        "success": True,
        "message": "File Manager objects unregistered from CRM",
        "result": result
    }


@router.get("/crm/status")
async def get_file_manager_crm_status(current_user=Depends(get_current_user_dep())):
    """
    Check if File Manager objects are registered as CRM objects.
    """
    user = user_to_dict(current_user)
    db = get_db()
    
    # Check registered objects
    registered_objects = await db.tenant_objects.find({
        "tenant_id": user["tenant_id"],
        "is_file_manager_object": True
    }, {"_id": 0, "object_name": 1, "object_label": 1}).to_list(None)
    
    # Check search config
    search_config = await db.global_search_config.find_one(
        {"tenant_id": user["tenant_id"]},
        {"_id": 0, "searchable_objects": 1}
    )
    
    searchable = search_config.get("searchable_objects", []) if search_config else []
    file_objects_in_search = [obj for obj in searchable if obj in ["file", "file_version", "file_record_link"]]
    
    return {
        "is_registered": len(registered_objects) >= 3,
        "registered_objects": registered_objects,
        "search_enabled_objects": file_objects_in_search,
        "registration_complete": len(registered_objects) >= 3 and len(file_objects_in_search) >= 1
    }
