"""
File Manager - Main File Routes
All routes are prefixed with /api/files

IMPORTANT: Route order matters! Specific routes MUST come before parameterized routes.

Module Guard: All protected endpoints check module_enabled setting before execution.
If module is disabled, returns 403 Forbidden.
"""

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query, Request
from fastapi.responses import JSONResponse
from typing import Optional, List
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/files", tags=["File Manager"])


# ============================================================================
# DEPENDENCY HELPERS
# ============================================================================

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


# ============================================================================
# MODULE GUARD - Backend Enforcement of module_enabled setting
# ============================================================================

async def check_module_enabled(current_user = Depends(get_current_user_dep())):
    """
    Module Guard Dependency - Enforces module_enabled setting at backend level.
    
    Checks fm_settings collection for module_enabled flag.
    If disabled, raises 403 Forbidden - blocks ALL file operations.
    
    This guard is applied to:
    - File upload, download, delete
    - File listing and retrieval
    - Record linking/unlinking
    - Public link creation
    - Internal sharing
    - Folder and library operations
    
    Endpoints NOT guarded (intentionally):
    - /api/files/status - Admin needs to check status
    - /api/files/init - Initial setup
    - /api/files/public/{token} - Public link access (already created)
    """
    user = user_to_dict(current_user)
    db = get_db()
    
    # Check module_enabled in fm_settings
    settings = await db["fm_settings"].find_one({
        "tenant_id": user["tenant_id"],
        "key": "general_settings"
    })
    
    # Default to enabled if no settings exist (backward compatibility)
    if settings:
        module_enabled = settings.get("value", {}).get("module_enabled", True)
        if not module_enabled:
            logger.warning(f"[ModuleGuard] File Manager disabled for tenant {user['tenant_id']} - blocking request")
            raise HTTPException(
                status_code=403,
                detail={
                    "error": "FILE_MANAGER_DISABLED",
                    "message": "File Manager module is disabled. Contact your administrator to enable it in Setup > File Manager > General Settings."
                }
            )
    
    return current_user


# Lazy service imports
def get_file_service():
    from ..services.file_service import FileService
    return FileService(get_db())

def get_folder_service():
    from ..services.folder_service import FolderService
    return FolderService(get_db())

def get_library_service():
    from ..services.library_service import LibraryService
    return LibraryService(get_db())

def get_sharing_service():
    from ..services.sharing_service import SharingService
    return SharingService(get_db())

def get_audit_service():
    from ..services.audit_service import AuditService
    return AuditService(get_db())

def get_setup_service():
    from ..services.setup_service import SetupService
    return SetupService(get_db())

def get_enforcement_service():
    from ..services.enforcement_service import get_enforcement_service as _get_enforcement
    return _get_enforcement(get_db())

def get_access_control_service():
    from ..services.access_control_service import get_access_control_service as _get_acl
    return _get_acl(get_db())

from ..services.storage_service import get_storage_service
from ..services.ai_service import get_ai_service
from ..services.enforcement_service import SettingsEnforcementError
from ..services.access_control_service import AccessDeniedError
from ..models.file_models import FileCreate, FileUpdate, StorageProvider
from ..models.folder_models import FolderCreate, FolderUpdate, LibraryCreate, LibraryUpdate, LibraryRole, LibraryMemberCreate
from ..models.sharing_models import PublicLinkCreate, PublicLinkUpdate, AuditLogFilter
from ..models.acl_models import (
    FileACLCreate, ShareWithUserRequest, ShareWithTeamRequest, ShareWithRoleRequest,
    Permission, VisibilityMode, PrincipalType
)


# ============================================================================
# INITIALIZATION & STATUS (Specific routes first)
# ============================================================================

@router.post("/init")
async def initialize_file_manager(current_user = Depends(get_current_user_dep())):
    """Initialize File Manager for tenant with default data"""
    user = user_to_dict(current_user)
    setup_service = get_setup_service()
    result = await setup_service.initialize_tenant(
        tenant_id=user["tenant_id"],
        user_id=user["id"]
    )
    return result


@router.get("/status")
async def get_file_manager_status(current_user = Depends(get_current_user_dep())):
    """Get File Manager status and stats"""
    user = user_to_dict(current_user)
    setup_service = get_setup_service()
    file_service = get_file_service()
    
    is_initialized = await setup_service.is_initialized(user["tenant_id"])
    
    if not is_initialized:
        return {
            "initialized": False,
            "message": "File Manager not initialized. Call POST /api/files/init"
        }
    
    stats = await file_service.get_stats(user["tenant_id"])
    settings = await setup_service.get_settings(user["tenant_id"])
    
    return {
        "initialized": True,
        "stats": stats,
        "feature_flags": settings.get("feature_flags", {})
    }


# ============================================================================
# LIBRARIES (Must come before /{file_id}) - GUARDED
# ============================================================================

@router.post("/libraries")
async def create_library(data: LibraryCreate, current_user = Depends(check_module_enabled)):
    """Create a new library"""
    user = user_to_dict(current_user)
    library_service = get_library_service()
    
    library = await library_service.create_library(
        tenant_id=user["tenant_id"],
        user_id=user["id"],
        data=data
    )
    
    return library.dict()


@router.get("/libraries")
async def list_libraries(current_user = Depends(check_module_enabled)):
    """List accessible libraries"""
    user = user_to_dict(current_user)
    library_service = get_library_service()
    
    libraries = await library_service.list_libraries(
        tenant_id=user["tenant_id"],
        user_id=user["id"]
    )
    
    return {"libraries": libraries}


@router.get("/libraries/{library_id}")
async def get_library(library_id: str, current_user = Depends(check_module_enabled)):
    """Get library details"""
    user = user_to_dict(current_user)
    library_service = get_library_service()
    
    library = await library_service.get_library(
        tenant_id=user["tenant_id"],
        library_id=library_id
    )
    
    if not library:
        raise HTTPException(status_code=404, detail="Library not found")
    
    return library


# ============================================================================
# FOLDERS (Must come before /{file_id}) - GUARDED
# ============================================================================

@router.post("/folders")
async def create_folder(data: FolderCreate, current_user = Depends(check_module_enabled)):
    """Create a new folder"""
    user = user_to_dict(current_user)
    folder_service = get_folder_service()
    
    folder = await folder_service.create_folder(
        tenant_id=user["tenant_id"],
        user_id=user["id"],
        data=data
    )
    
    return folder.dict()


@router.get("/folders")
async def list_folders(
    library_id: Optional[str] = None,
    parent_folder_id: Optional[str] = None,
    current_user = Depends(check_module_enabled)
):
    """List folders"""
    user = user_to_dict(current_user)
    folder_service = get_folder_service()
    
    folders = await folder_service.list_folders(
        tenant_id=user["tenant_id"],
        library_id=library_id,
        parent_folder_id=parent_folder_id
    )
    
    return {"folders": folders}


@router.get("/folders/tree/{library_id}")
async def get_folder_tree(library_id: str, current_user = Depends(check_module_enabled)):
    """Get hierarchical folder tree for a library"""
    user = user_to_dict(current_user)
    folder_service = get_folder_service()
    
    tree = await folder_service.get_folder_tree(
        tenant_id=user["tenant_id"],
        library_id=library_id
    )
    
    return {"tree": tree}


# ============================================================================
# PUBLIC LINKS (Must come before /{file_id}) - GUARDED
# ============================================================================

@router.post("/public-links")
async def create_public_link(data: PublicLinkCreate, current_user = Depends(check_module_enabled)):
    """Create a public link for a file with enforcement"""
    user = user_to_dict(current_user)
    sharing_service = get_sharing_service()
    enforcement = get_enforcement_service()
    
    # ========================================
    # PHASE 2.5: SETTINGS ENFORCEMENT
    # ========================================
    try:
        await enforcement.validate_public_link(
            tenant_id=user["tenant_id"],
            file_id=data.file_id,
            expires_at=data.expires_at,
            password=data.password,
            allow_download=data.allow_download if hasattr(data, 'allow_download') else True
        )
    except SettingsEnforcementError as e:
        logger.warning(f"[PublicLink] Enforcement blocked: {e.error_code} - {e.message}")
        raise HTTPException(status_code=400, detail=e.to_dict())
    # ========================================
    
    link = await sharing_service.create_public_link(
        tenant_id=user["tenant_id"],
        user_id=user["id"],
        user_name=user["name"],
        data=data
    )
    
    return link.dict()


@router.get("/public-links/file/{file_id}")
async def get_file_public_links(file_id: str, current_user = Depends(check_module_enabled)):
    """Get all public links for a file"""
    user = user_to_dict(current_user)
    sharing_service = get_sharing_service()
    
    links = await sharing_service.list_file_links(
        tenant_id=user["tenant_id"],
        file_id=file_id
    )
    
    return {"links": links}


@router.get("/public/{token}")
async def access_public_link(
    token: str,
    password: Optional[str] = None,
    request: Request = None
):
    """Access a public link (no auth required) - NOT GUARDED (link already created)"""
    sharing_service = get_sharing_service()
    
    ip_address = request.client.host if request else None
    user_agent = request.headers.get("user-agent") if request else None
    
    result = await sharing_service.access_public_link(
        token=token,
        password=password,
        ip_address=ip_address,
        user_agent=user_agent
    )
    
    if not result.get("success"):
        status_code = 401 if result.get("requires_password") else 404
        raise HTTPException(status_code=status_code, detail=result.get("error"))
    
    return result


# ============================================================================
# AI SUGGESTIONS (Must come before /{file_id}) - GUARDED
# ============================================================================

@router.post("/ai/suggest")
async def get_ai_suggestions(
    filename: str,
    mime_type: str,
    current_user = Depends(check_module_enabled)
):
    """Get AI-powered category and tag suggestions for a file"""
    user = user_to_dict(current_user)
    ai_service = get_ai_service()
    setup_service = get_setup_service()
    
    categories = await setup_service.get_categories(user["tenant_id"])
    tags = await setup_service.get_tags(user["tenant_id"])
    
    suggestions = await ai_service.analyze_file(
        filename=filename,
        mime_type=mime_type,
        existing_categories=categories,
        existing_tags=tags
    )
    
    return suggestions


# ============================================================================
# AUDIT LOG (Must come before /{file_id}) - GUARDED
# ============================================================================

@router.get("/audit")
async def get_audit_log(
    file_id: Optional[str] = None,
    event_types: Optional[str] = None,
    limit: int = Query(50, le=200),
    offset: int = 0,
    current_user = Depends(check_module_enabled)
):
    """Get audit log entries"""
    user = user_to_dict(current_user)
    audit_service = get_audit_service()
    
    event_type_list = None
    if event_types:
        from ..models.sharing_models import AuditEventType
        event_type_list = [AuditEventType(et.strip()) for et in event_types.split(",")]
    
    filters = AuditLogFilter(
        event_types=event_type_list,
        file_id=file_id,
        limit=limit,
        offset=offset
    )
    
    events = await audit_service.get_events(
        tenant_id=user["tenant_id"],
        filters=filters
    )
    
    return {"events": events}


@router.get("/audit/file/{file_id}")
async def get_file_audit_history(
    file_id: str,
    limit: int = Query(50, le=100),
    current_user = Depends(check_module_enabled)
):
    """Get audit history for a specific file"""
    user = user_to_dict(current_user)
    audit_service = get_audit_service()
    
    events = await audit_service.get_file_history(
        tenant_id=user["tenant_id"],
        file_id=file_id,
        limit=limit
    )
    
    return {"events": events}


# ============================================================================
# RECORD FILES (Must come before /{file_id}) - GUARDED
# ============================================================================

@router.get("/record/{object_name}/{record_id}")
async def get_record_files(
    object_name: str,
    record_id: str,
    current_user = Depends(check_module_enabled)
):
    """Get all files linked to a specific record"""
    user = user_to_dict(current_user)
    file_service = get_file_service()
    
    files = await file_service.get_record_files(
        tenant_id=user["tenant_id"],
        record_id=record_id,
        object_name=object_name
    )
    
    return {"files": files}


# ============================================================================
# RECENT FILES (Must come before /{file_id}) - GUARDED
# ============================================================================

@router.get("/recent")
async def get_recent_files(
    limit: int = Query(10, le=50),
    my_files: bool = False,
    current_user = Depends(check_module_enabled)
):
    """Get recently uploaded/modified files"""
    user = user_to_dict(current_user)
    file_service = get_file_service()
    
    files = await file_service.get_recent_files(
        tenant_id=user["tenant_id"],
        user_id=user["id"] if my_files else None,
        limit=limit
    )
    
    return {"files": files}


# ============================================================================
# STARRED FILES (Must come before /{file_id}) - GUARDED
# ============================================================================

@router.get("/starred")
async def get_starred_files(
    limit: int = Query(50, le=100),
    current_user = Depends(check_module_enabled)
):
    """Get starred/favorited files for current user"""
    user = user_to_dict(current_user)
    file_service = get_file_service()
    
    files = await file_service.get_starred_files(
        tenant_id=user["tenant_id"],
        user_id=user["id"],
        limit=limit
    )
    
    return {"files": files}


@router.post("/starred/{file_id}")
async def star_file(
    file_id: str,
    current_user = Depends(check_module_enabled)
):
    """Star/favorite a file"""
    user = user_to_dict(current_user)
    file_service = get_file_service()
    
    result = await file_service.star_file(
        tenant_id=user["tenant_id"],
        file_id=file_id,
        user_id=user["id"]
    )
    
    return {"success": result}


@router.delete("/starred/{file_id}")
async def unstar_file(
    file_id: str,
    current_user = Depends(check_module_enabled)
):
    """Unstar/unfavorite a file"""
    user = user_to_dict(current_user)
    file_service = get_file_service()
    
    result = await file_service.unstar_file(
        tenant_id=user["tenant_id"],
        file_id=file_id,
        user_id=user["id"]
    )
    
    return {"success": result}


# ============================================================================
# SHARED WITH ME (Must come before /{file_id}) - GUARDED
# ============================================================================

@router.get("/shared-with-me")
async def get_shared_with_me_files(
    limit: int = Query(50, le=100),
    current_user = Depends(check_module_enabled)
):
    """Get files shared with current user"""
    user = user_to_dict(current_user)
    file_service = get_file_service()
    
    files = await file_service.get_shared_with_me(
        tenant_id=user["tenant_id"],
        user_id=user["id"],
        limit=limit
    )
    
    return {"files": files}


# ============================================================================
# DOWNLOAD (Must come before /{file_id}) - GUARDED
# ============================================================================

@router.get("/download/{file_id}")
async def download_file(
    file_id: str,
    version: Optional[int] = None,
    current_user = Depends(check_module_enabled)
):
    """Download a file"""
    from fastapi.responses import FileResponse
    import os
    
    user = user_to_dict(current_user)
    file_service = get_file_service()
    audit_service = get_audit_service()
    storage = get_storage_service()
    
    file = await file_service.get_file(user["tenant_id"], file_id, include_versions=True)
    if not file:
        raise HTTPException(status_code=404, detail="File not found")
    
    # Get the appropriate version
    versions = file.get("versions", [])
    if version and versions:
        target_version = next((v for v in versions if v["version_number"] == version), None)
    else:
        target_version = next((v for v in versions if v.get("is_current")), versions[0] if versions else None)
    
    if not target_version:
        raise HTTPException(status_code=404, detail="File version not found")
    
    storage_key = target_version.get("storage_key")
    if not storage_key:
        raise HTTPException(status_code=404, detail="File storage key not found")
    
    # Get file path from storage service
    file_path = await storage.get_file_path(storage_key)
    
    if not file_path or not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found on disk")
    
    # Log audit event
    await audit_service.log_file_download(
        tenant_id=user["tenant_id"],
        user_id=user["id"],
        user_name=user["name"],
        file_id=file_id,
        file_name=file.get("name", "Unknown")
    )
    
    return FileResponse(
        path=file_path,
        filename=file.get("original_filename") or file.get("name"),
        media_type=file.get("mime_type") or "application/octet-stream"
    )


# ============================================================================
# FILE UPLOAD (Must come before /{file_id}) - GUARDED
# ============================================================================

@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    name: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    folder_id: Optional[str] = Form(None),
    library_id: Optional[str] = Form(None),
    category_id: Optional[str] = Form(None),
    sensitivity_id: Optional[str] = Form(None),
    tags: Optional[str] = Form(None),
    record_id: Optional[str] = Form(None),
    object_name: Optional[str] = Form(None),
    current_user = Depends(check_module_enabled)
):
    """Upload a new file with settings enforcement"""
    user = user_to_dict(current_user)
    storage = get_storage_service()
    file_service = get_file_service()
    library_service = get_library_service()
    enforcement = get_enforcement_service()
    
    logger.info(f"[Upload] Received library_id: {library_id}")
    
    content = await file.read()
    tag_list = [t.strip() for t in tags.split(",")] if tags else []
    
    # Only use default library if no library_id was explicitly provided
    actual_library_id = library_id
    if not actual_library_id:
        default_lib = await library_service.get_default_library(user["tenant_id"])
        if default_lib:
            actual_library_id = default_lib["id"]
            logger.info(f"[Upload] Using default library: {actual_library_id}")
    else:
        logger.info(f"[Upload] Using provided library: {actual_library_id}")
    
    # ========================================
    # PHASE 2.5: SETTINGS ENFORCEMENT
    # ========================================
    try:
        validation_result = await enforcement.validate_upload(
            tenant_id=user["tenant_id"],
            user_id=user["id"],
            filename=file.filename,
            file_size_bytes=len(content),
            mime_type=file.content_type or "application/octet-stream",
            category_id=category_id,
            tags=tag_list,
            sensitivity_id=sensitivity_id,
            library_id=actual_library_id
        )
        
        # Apply auto-assignments from enforcement
        auto = validation_result.get("auto_assignments", {})
        if auto.get("sensitivity_id") and not sensitivity_id:
            sensitivity_id = auto["sensitivity_id"]
            logger.info(f"[Upload] Auto-assigned sensitivity: {sensitivity_id}")
        if auto.get("library_id") and not actual_library_id:
            actual_library_id = auto["library_id"]
            logger.info(f"[Upload] Auto-assigned library: {actual_library_id}")
            
    except SettingsEnforcementError as e:
        logger.warning(f"[Upload] Enforcement blocked: {e.error_code} - {e.message}")
        raise HTTPException(status_code=400, detail=e.to_dict())
    # ========================================
    
    storage_key, storage_url, size_bytes = await storage.upload_file(
        file_content=content,
        filename=file.filename,
        mime_type=file.content_type or "application/octet-stream",
        tenant_id=user["tenant_id"],
        folder_path=folder_id or ""
    )
    
    file_data = FileCreate(
        name=name or file.filename,
        original_filename=file.filename,
        description=description,
        folder_id=folder_id,
        library_id=actual_library_id,
        category_id=category_id,
        sensitivity_id=sensitivity_id,
        tags=tag_list,
        size_bytes=size_bytes,
        mime_type=file.content_type or "application/octet-stream",
        storage_provider=StorageProvider.S3,
        storage_key=storage_key
    )
    
    new_file = await file_service.create_file(
        tenant_id=user["tenant_id"],
        user_id=user["id"],
        user_name=user["name"],
        data=file_data,
        file_content=content
    )
    
    if record_id and object_name:
        await file_service.link_to_record(
            tenant_id=user["tenant_id"],
            file_id=new_file.id,
            record_id=record_id,
            object_name=object_name,
            user_id=user["id"],
            user_name=user["name"]
        )
    
    if actual_library_id:
        await library_service.update_library_stats(actual_library_id, file_count_delta=1, size_delta=size_bytes)
    
    return {"success": True, "file": new_file.dict()}


# ============================================================================
# FILES LIST (Root path - must come before /{file_id}) - GUARDED
# ============================================================================

@router.get("")
async def list_files(
    folder_id: Optional[str] = None,
    library_id: Optional[str] = None,
    category_id: Optional[str] = None,
    tags: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = Query(50, le=100),
    offset: int = 0,
    current_user = Depends(check_module_enabled)
):
    """List files with filters and access control"""
    user = user_to_dict(current_user)
    file_service = get_file_service()
    acl_service = get_access_control_service()
    
    tag_list = [t.strip() for t in tags.split(",")] if tags else None
    
    # Build access-filtered query
    access_filter = await acl_service.build_access_filter(user["tenant_id"], user["id"])
    
    files, total = await file_service.list_files_with_access(
        tenant_id=user["tenant_id"],
        user_id=user["id"],
        folder_id=folder_id,
        library_id=library_id,
        category_id=category_id,
        tags=tag_list,
        search=search,
        limit=limit,
        offset=offset,
        access_filter=access_filter
    )
    
    return {"files": files, "total": total, "limit": limit, "offset": offset}


# ============================================================================
# PARAMETERIZED FILE ROUTES (Must come LAST) - GUARDED
# ============================================================================

@router.get("/{file_id}")
async def get_file(
    file_id: str,
    include_versions: bool = False,
    current_user = Depends(check_module_enabled)
):
    """Get file details with access control"""
    user = user_to_dict(current_user)
    file_service = get_file_service()
    acl_service = get_access_control_service()
    
    # Check access
    access_result = await acl_service.can_access_file(
        tenant_id=user["tenant_id"],
        user_id=user["id"],
        file_id=file_id,
        action="view_file"
    )
    
    if not access_result.allowed:
        raise HTTPException(
            status_code=403,
            detail={
                "error": "ACCESS_DENIED",
                "message": access_result.reason,
                "details": access_result.details
            }
        )
    
    file = await file_service.get_file(
        tenant_id=user["tenant_id"],
        file_id=file_id,
        include_versions=include_versions
    )
    
    if not file:
        raise HTTPException(status_code=404, detail="File not found")
    
    # Add access info to response
    file["access"] = {
        "source": access_result.access_source,
        "effective_role": access_result.effective_role
    }
    
    return file


@router.put("/{file_id}")
async def update_file(
    file_id: str,
    data: FileUpdate,
    current_user = Depends(check_module_enabled)
):
    """Update file metadata"""
    user = user_to_dict(current_user)
    file_service = get_file_service()
    
    file = await file_service.update_file(
        tenant_id=user["tenant_id"],
        file_id=file_id,
        user_id=user["id"],
        data=data
    )
    
    if not file:
        raise HTTPException(status_code=404, detail="File not found")
    
    return file


@router.delete("/{file_id}")
async def delete_file(
    file_id: str,
    permanent: bool = False,
    current_user = Depends(check_module_enabled)
):
    """Delete file with legal hold and retention enforcement"""
    user = user_to_dict(current_user)
    file_service = get_file_service()
    audit_service = get_audit_service()
    enforcement = get_enforcement_service()
    
    # ========================================
    # PHASE 2.5: SETTINGS ENFORCEMENT
    # ========================================
    try:
        await enforcement.validate_delete(
            tenant_id=user["tenant_id"],
            file_id=file_id,
            user_id=user["id"],
            permanent=permanent
        )
    except SettingsEnforcementError as e:
        logger.warning(f"[Delete] Enforcement blocked: {e.error_code} - {e.message}")
        raise HTTPException(status_code=403, detail=e.to_dict())
    # ========================================
    
    # Get file info for audit log
    file = await file_service.get_file(user["tenant_id"], file_id)
    file_name = file.get("name", "Unknown") if file else "Unknown"
    
    success = await file_service.delete_file(
        tenant_id=user["tenant_id"],
        file_id=file_id,
        user_id=user["id"],
        permanent=permanent
    )
    
    if success:
        # Log audit event
        await audit_service.log_file_deleted(
            tenant_id=user["tenant_id"],
            user_id=user["id"],
            user_name=user["name"],
            file_id=file_id,
            file_name=file_name,
            permanent=permanent
        )
    
    return {"success": success}


# ============================================================================
# VERSION MANAGEMENT - GUARDED
# ============================================================================

@router.post("/{file_id}/versions")
async def upload_new_version(
    file_id: str,
    file: UploadFile = File(...),
    current_user = Depends(check_module_enabled)
):
    """Upload a new version of an existing file with enforcement"""
    user = user_to_dict(current_user)
    storage = get_storage_service()
    file_service = get_file_service()
    enforcement = get_enforcement_service()
    
    existing = await file_service.get_file(user["tenant_id"], file_id)
    if not existing:
        raise HTTPException(status_code=404, detail="File not found")
    
    content = await file.read()
    
    # ========================================
    # PHASE 2.5: SETTINGS ENFORCEMENT
    # ========================================
    try:
        await enforcement.validate_version_upload(
            tenant_id=user["tenant_id"],
            file_id=file_id,
            user_id=user["id"],
            new_size_bytes=len(content),
            new_mime_type=file.content_type or existing.get("mime_type")
        )
    except SettingsEnforcementError as e:
        logger.warning(f"[Version] Enforcement blocked: {e.error_code} - {e.message}")
        raise HTTPException(status_code=400 if "ROLE" not in e.error_code else 403, detail=e.to_dict())
    # ========================================
    
    storage_key, _, size_bytes = await storage.upload_file(
        file_content=content,
        filename=file.filename,
        mime_type=file.content_type or existing.get("mime_type"),
        tenant_id=user["tenant_id"],
        folder_path=existing.get("folder_id", "")
    )
    
    version = await file_service.create_version(
        tenant_id=user["tenant_id"],
        file_id=file_id,
        user_id=user["id"],
        user_name=user["name"],
        storage_key=storage_key,
        size_bytes=size_bytes,
        mime_type=file.content_type or existing.get("mime_type")
    )
    
    return {"success": True, "version": version.dict()}


@router.get("/{file_id}/versions")
async def get_file_versions(file_id: str, current_user = Depends(check_module_enabled)):
    """Get all versions of a file"""
    file_service = get_file_service()
    versions = await file_service.get_versions(file_id)
    return {"versions": versions}


# ============================================================================
# RECORD LINKING - GUARDED
# ============================================================================

@router.post("/{file_id}/link")
async def link_file_to_record(
    file_id: str,
    record_id: str,
    object_name: str,
    is_primary: bool = False,
    notes: Optional[str] = None,
    current_user = Depends(check_module_enabled)
):
    """Link a file to a CRM record with enforcement"""
    user = user_to_dict(current_user)
    file_service = get_file_service()
    enforcement = get_enforcement_service()
    
    # ========================================
    # PHASE 2.5: SETTINGS ENFORCEMENT
    # ========================================
    try:
        await enforcement.validate_link_to_record(
            tenant_id=user["tenant_id"],
            file_id=file_id,
            user_id=user["id"],
            record_id=record_id,
            object_name=object_name
        )
    except SettingsEnforcementError as e:
        logger.warning(f"[Link] Enforcement blocked: {e.error_code} - {e.message}")
        raise HTTPException(status_code=403, detail=e.to_dict())
    # ========================================
    
    try:
        link = await file_service.link_to_record(
            tenant_id=user["tenant_id"],
            file_id=file_id,
            record_id=record_id,
            object_name=object_name,
            user_id=user["id"],
            user_name=user["name"],
            is_primary=is_primary,
            notes=notes
        )
        
        return {"success": True, "link": link.dict()}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{file_id}/link/{record_id}")
async def unlink_file_from_record(
    file_id: str,
    record_id: str,
    current_user = Depends(check_module_enabled)
):
    """Unlink a file from a CRM record"""
    user = user_to_dict(current_user)
    file_service = get_file_service()
    
    success = await file_service.unlink_from_record(
        tenant_id=user["tenant_id"],
        file_id=file_id,
        record_id=record_id
    )
    
    return {"success": success}


# ============================================================================
# INTERNAL SHARING - GUARDED
# ============================================================================

@router.post("/{file_id}/share")
async def share_file_internally(
    file_id: str,
    user_ids: List[str],
    current_user = Depends(check_module_enabled)
):
    """Share file internally with other users with enforcement"""
    user = user_to_dict(current_user)
    file_service = get_file_service()
    enforcement = get_enforcement_service()
    
    # ========================================
    # PHASE 2.5: SETTINGS ENFORCEMENT
    # ========================================
    try:
        await enforcement.validate_internal_share(
            tenant_id=user["tenant_id"],
            file_id=file_id,
            user_id=user["id"],
            share_with_user_ids=user_ids
        )
    except SettingsEnforcementError as e:
        logger.warning(f"[Share] Enforcement blocked: {e.error_code} - {e.message}")
        raise HTTPException(status_code=403, detail=e.to_dict())
    # ========================================
    
    # Get file info
    file = await file_service.get_file(user["tenant_id"], file_id)
    if not file:
        raise HTTPException(status_code=404, detail="File not found")
    
    success = await file_service.share_file_internally(
        tenant_id=user["tenant_id"],
        file_id=file_id,
        user_id=user["id"],
        user_name=user["name"],
        share_with_user_ids=user_ids
    )
    
    return {"success": success}


# ============================================================================
# PHASE 3: ACL & SHARING MANAGEMENT
# ============================================================================

@router.get("/{file_id}/acl")
async def get_file_acl(
    file_id: str,
    current_user = Depends(check_module_enabled)
):
    """Get file ACL entries"""
    user = user_to_dict(current_user)
    acl_service = get_access_control_service()
    
    # Check user has access to view ACL (must be able to view file)
    access_result = await acl_service.can_access_file(
        tenant_id=user["tenant_id"],
        user_id=user["id"],
        file_id=file_id,
        action="view_file"
    )
    
    if not access_result.allowed:
        raise HTTPException(status_code=403, detail=access_result.reason)
    
    acl_entries = await acl_service.get_file_acl(user["tenant_id"], file_id)
    
    return {"acl": acl_entries}


@router.post("/{file_id}/acl")
async def add_file_acl(
    file_id: str,
    data: FileACLCreate,
    current_user = Depends(check_module_enabled)
):
    """Add ACL entry to file (share with user/team/role)"""
    user = user_to_dict(current_user)
    acl_service = get_access_control_service()
    enforcement = get_enforcement_service()
    
    # Check sharing permission
    try:
        await enforcement.validate_internal_share(
            tenant_id=user["tenant_id"],
            file_id=file_id,
            user_id=user["id"],
            share_with_user_ids=[data.principal_id]
        )
    except SettingsEnforcementError as e:
        raise HTTPException(status_code=403, detail=e.to_dict())
    
    acl = await acl_service.add_file_acl(
        tenant_id=user["tenant_id"],
        file_id=file_id,
        principal_type=data.principal_type,
        principal_id=data.principal_id,
        permission=data.permission,
        granted_by=user["id"],
        granted_by_name=user["name"],
        expires_at=data.expires_at,
        notes=data.notes
    )
    
    return {"success": True, "acl": acl.dict()}


@router.delete("/{file_id}/acl/{acl_id}")
async def remove_file_acl(
    file_id: str,
    acl_id: str,
    current_user = Depends(check_module_enabled)
):
    """Remove ACL entry from file"""
    user = user_to_dict(current_user)
    acl_service = get_access_control_service()
    file_service = get_file_service()
    
    # Check user can manage ACL (must have share permission)
    file = await file_service.get_file(user["tenant_id"], file_id)
    if not file:
        raise HTTPException(status_code=404, detail="File not found")
    
    library_id = file.get("library_id")
    if library_id:
        result = await acl_service.check_library_action(
            user["tenant_id"], library_id, user["id"], "share"
        )
        if not result.allowed:
            raise HTTPException(status_code=403, detail=result.reason)
    
    success = await acl_service.remove_file_acl(user["tenant_id"], file_id, acl_id)
    
    return {"success": success}


@router.post("/{file_id}/share/users")
async def share_file_with_users(
    file_id: str,
    data: ShareWithUserRequest,
    current_user = Depends(check_module_enabled)
):
    """Share file with specific users (Phase 3)"""
    user = user_to_dict(current_user)
    acl_service = get_access_control_service()
    enforcement = get_enforcement_service()
    
    # Check sharing permission
    try:
        await enforcement.validate_internal_share(
            tenant_id=user["tenant_id"],
            file_id=file_id,
            user_id=user["id"],
            share_with_user_ids=data.user_ids
        )
    except SettingsEnforcementError as e:
        raise HTTPException(status_code=403, detail=e.to_dict())
    
    acls = await acl_service.share_with_users(
        tenant_id=user["tenant_id"],
        file_id=file_id,
        user_ids=data.user_ids,
        permission=data.permission,
        granted_by=user["id"],
        granted_by_name=user["name"]
    )
    
    return {"success": True, "shared_count": len(acls), "acls": [a.dict() for a in acls]}


@router.post("/{file_id}/share/team")
async def share_file_with_team(
    file_id: str,
    data: ShareWithTeamRequest,
    current_user = Depends(check_module_enabled)
):
    """Share file with team (Phase 3)"""
    user = user_to_dict(current_user)
    acl_service = get_access_control_service()
    enforcement = get_enforcement_service()
    
    # Check sharing permission
    try:
        await enforcement.validate_internal_share(
            tenant_id=user["tenant_id"],
            file_id=file_id,
            user_id=user["id"],
            share_with_user_ids=[]  # Team share
        )
    except SettingsEnforcementError as e:
        raise HTTPException(status_code=403, detail=e.to_dict())
    
    acl = await acl_service.share_with_team(
        tenant_id=user["tenant_id"],
        file_id=file_id,
        team_id=data.team_id,
        permission=data.permission,
        granted_by=user["id"],
        granted_by_name=user["name"]
    )
    
    return {"success": True, "acl": acl.dict()}


@router.post("/{file_id}/share/role")
async def share_file_with_role(
    file_id: str,
    data: ShareWithRoleRequest,
    current_user = Depends(check_module_enabled)
):
    """Share file with role (Phase 3)"""
    user = user_to_dict(current_user)
    acl_service = get_access_control_service()
    enforcement = get_enforcement_service()
    
    # Check sharing permission
    try:
        await enforcement.validate_internal_share(
            tenant_id=user["tenant_id"],
            file_id=file_id,
            user_id=user["id"],
            share_with_user_ids=[]  # Role share
        )
    except SettingsEnforcementError as e:
        raise HTTPException(status_code=403, detail=e.to_dict())
    
    acl = await acl_service.share_with_role(
        tenant_id=user["tenant_id"],
        file_id=file_id,
        role_id=data.role_id,
        permission=data.permission,
        granted_by=user["id"],
        granted_by_name=user["name"]
    )
    
    return {"success": True, "acl": acl.dict()}


@router.put("/{file_id}/visibility")
async def set_file_visibility(
    file_id: str,
    visibility_mode: str,
    current_user = Depends(check_module_enabled)
):
    """Set file visibility mode (inherit or restricted)"""
    user = user_to_dict(current_user)
    acl_service = get_access_control_service()
    file_service = get_file_service()
    
    # Validate visibility mode
    if visibility_mode not in [VisibilityMode.INHERIT.value, VisibilityMode.RESTRICTED.value]:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid visibility mode. Must be '{VisibilityMode.INHERIT.value}' or '{VisibilityMode.RESTRICTED.value}'"
        )
    
    # Check user can manage file (must have share permission)
    file = await file_service.get_file(user["tenant_id"], file_id)
    if not file:
        raise HTTPException(status_code=404, detail="File not found")
    
    library_id = file.get("library_id")
    if library_id:
        result = await acl_service.check_library_action(
            user["tenant_id"], library_id, user["id"], "share"
        )
        if not result.allowed and file.get("created_by") != user["id"]:
            raise HTTPException(status_code=403, detail=result.reason)
    
    success = await acl_service.set_file_visibility(
        user["tenant_id"], file_id, visibility_mode
    )
    
    return {"success": success, "visibility_mode": visibility_mode}


@router.get("/{file_id}/access-check")
async def check_file_access(
    file_id: str,
    action: str = "view_file",
    current_user = Depends(check_module_enabled)
):
    """Check if current user has access to file for specific action"""
    user = user_to_dict(current_user)
    acl_service = get_access_control_service()
    
    result = await acl_service.can_access_file(
        tenant_id=user["tenant_id"],
        user_id=user["id"],
        file_id=file_id,
        action=action
    )
    
    return {
        "allowed": result.allowed,
        "reason": result.reason,
        "effective_role": result.effective_role,
        "access_source": result.access_source,
        "details": result.details
    }
