"""
Record Sharing API Routes
Manages manual record-level sharing for explicit access grants.
Part of Salesforce-style security architecture.

This module enables:
- Sharing specific records with users, groups, or roles
- Listing who has access to a record
- Revoking manual shares
- Bulk sharing operations
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone
from pydantic import BaseModel, Field
import uuid
import logging

from config.database import db
from shared.models import User, RecordShare
from modules.auth.api.auth_routes import get_current_user
from modules.users.services import log_audit_event

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Record Sharing"])


# ========================================
# REQUEST/RESPONSE MODELS
# ========================================

class ShareRecordRequest(BaseModel):
    """Request model for sharing a record"""
    shared_with_type: str  # "user" | "group" | "role"
    shared_with_id: str
    access_level: str = "read"  # "read" | "edit"
    reason: Optional[str] = None
    expires_at: Optional[datetime] = None


class BulkShareRecordRequest(BaseModel):
    """Request model for bulk sharing multiple records"""
    record_ids: List[str]
    shared_with_type: str
    shared_with_id: str
    access_level: str = "read"
    reason: Optional[str] = None


class RecordShareResponse(BaseModel):
    """Response model for a record share"""
    id: str
    object_name: str
    record_id: str
    shared_with_type: str
    shared_with_id: str
    shared_with_name: Optional[str] = None
    access_level: str
    shared_by: str
    shared_by_name: Optional[str] = None
    shared_at: datetime
    reason: Optional[str] = None
    expires_at: Optional[datetime] = None
    is_active: bool


# ========================================
# HELPER FUNCTIONS
# ========================================

async def _get_target_name(shared_with_type: str, shared_with_id: str) -> Optional[str]:
    """Get the display name for a share target."""
    try:
        if shared_with_type == "user":
            user = await db.users.find_one({"id": shared_with_id}, {"_id": 0, "email": 1, "first_name": 1, "last_name": 1})
            if user:
                return f"{user.get('first_name', '')} {user.get('last_name', '')}".strip() or user.get("email")
        elif shared_with_type == "group":
            group = await db.groups.find_one({"id": shared_with_id}, {"_id": 0, "name": 1})
            if group:
                return group.get("name")
        elif shared_with_type == "role":
            role = await db.roles.find_one({"id": shared_with_id}, {"_id": 0, "name": 1})
            if role:
                return role.get("name")
        return None
    except Exception:
        return None


async def _validate_share_target(tenant_id: str, shared_with_type: str, shared_with_id: str) -> bool:
    """Validate that the share target exists."""
    if shared_with_type == "user":
        user = await db.users.find_one({"id": shared_with_id, "tenant_id": tenant_id}, {"_id": 0, "id": 1})
        return user is not None
    elif shared_with_type == "group":
        group = await db.groups.find_one({"id": shared_with_id, "tenant_id": tenant_id}, {"_id": 0, "id": 1})
        return group is not None
    elif shared_with_type == "role":
        # Roles might not have tenant_id (system roles)
        role = await db.roles.find_one({"id": shared_with_id}, {"_id": 0, "id": 1})
        return role is not None
    return False


async def _verify_record_exists(tenant_id: str, object_name: str, record_id: str) -> bool:
    """Verify that the record exists."""
    record = await db.object_records.find_one({
        "id": record_id,
        "object_name": object_name,
        "tenant_id": tenant_id
    }, {"_id": 0, "id": 1})
    return record is not None


# ========================================
# SHARE RECORD ROUTES
# ========================================

@router.post("/objects/{object_name}/records/{record_id}/share")
async def share_record(
    object_name: str,
    record_id: str,
    request: ShareRecordRequest,
    current_user: User = Depends(get_current_user)
):
    """
    Share a record with a user, group, or role.
    
    This creates an explicit share that grants access beyond what
    OWD, role hierarchy, and sharing rules provide.
    """
    try:
        # Validate share target type
        if request.shared_with_type not in ["user", "group", "role"]:
            raise HTTPException(
                status_code=400,
                detail="shared_with_type must be 'user', 'group', or 'role'"
            )
        
        # Validate access level
        if request.access_level not in ["read", "edit"]:
            raise HTTPException(
                status_code=400,
                detail="access_level must be 'read' or 'edit'"
            )
        
        # Verify record exists
        if not await _verify_record_exists(current_user.tenant_id, object_name, record_id):
            raise HTTPException(status_code=404, detail="Record not found")
        
        # Verify share target exists
        if not await _validate_share_target(current_user.tenant_id, request.shared_with_type, request.shared_with_id):
            raise HTTPException(
                status_code=404,
                detail=f"{request.shared_with_type.capitalize()} not found"
            )
        
        # Check for existing share (avoid duplicates)
        existing_share = await db.record_shares.find_one({
            "tenant_id": current_user.tenant_id,
            "object_name": object_name,
            "record_id": record_id,
            "shared_with_type": request.shared_with_type,
            "shared_with_id": request.shared_with_id,
            "is_active": True
        })
        
        if existing_share:
            # Update existing share if access level changed
            if existing_share.get("access_level") != request.access_level:
                await db.record_shares.update_one(
                    {"id": existing_share["id"]},
                    {"$set": {
                        "access_level": request.access_level,
                        "reason": request.reason,
                        "expires_at": request.expires_at
                    }}
                )
                return {
                    "message": "Share updated successfully",
                    "share_id": existing_share["id"],
                    "action": "updated"
                }
            else:
                raise HTTPException(
                    status_code=400,
                    detail="This record is already shared with the specified target"
                )
        
        # Get target name for display
        target_name = await _get_target_name(request.shared_with_type, request.shared_with_id)
        
        # Create the share
        share_id = str(uuid.uuid4())
        share = {
            "id": share_id,
            "tenant_id": current_user.tenant_id,
            "object_name": object_name,
            "record_id": record_id,
            "shared_with_type": request.shared_with_type,
            "shared_with_id": request.shared_with_id,
            "shared_with_name": target_name,
            "access_level": request.access_level,
            "shared_by": current_user.id,
            "shared_by_name": f"{current_user.first_name} {current_user.last_name}".strip(),
            "shared_at": datetime.now(timezone.utc),
            "reason": request.reason,
            "expires_at": request.expires_at,
            "is_active": True
        }
        
        await db.record_shares.insert_one(share)
        
        # Audit log
        await log_audit_event(
            tenant_id=current_user.tenant_id,
            event_type="sharing",
            action="record_shared",
            actor_user_id=current_user.id,
            actor_email=current_user.email,
            object_name=object_name,
            record_id=record_id,
            details={
                "shared_with_type": request.shared_with_type,
                "shared_with_id": request.shared_with_id,
                "shared_with_name": target_name,
                "access_level": request.access_level
            }
        )
        
        logger.info(f"Record {record_id} shared with {request.shared_with_type} {request.shared_with_id}")
        
        return {
            "message": f"Record shared successfully with {target_name or request.shared_with_id}",
            "share_id": share_id,
            "shared_with_type": request.shared_with_type,
            "shared_with_name": target_name,
            "access_level": request.access_level,
            "action": "created"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error sharing record: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to share record")


@router.get("/objects/{object_name}/records/{record_id}/shares")
async def get_record_shares(
    object_name: str,
    record_id: str,
    include_expired: bool = False,
    current_user: User = Depends(get_current_user)
):
    """
    Get all shares for a specific record.
    Returns list of users, groups, and roles the record is shared with.
    """
    try:
        # Verify record exists
        if not await _verify_record_exists(current_user.tenant_id, object_name, record_id):
            raise HTTPException(status_code=404, detail="Record not found")
        
        # Build query
        query = {
            "tenant_id": current_user.tenant_id,
            "object_name": object_name,
            "record_id": record_id,
            "is_active": True
        }
        
        # Filter expired shares unless requested
        if not include_expired:
            now = datetime.now(timezone.utc)
            query["$or"] = [
                {"expires_at": None},
                {"expires_at": {"$gt": now}}
            ]
        
        shares = await db.record_shares.find(query, {"_id": 0}).to_list(None)
        
        # Categorize shares
        result = {
            "record_id": record_id,
            "object_name": object_name,
            "total_shares": len(shares),
            "shares_by_type": {
                "user": [],
                "group": [],
                "role": []
            },
            "shares": shares
        }
        
        for share in shares:
            share_type = share.get("shared_with_type")
            if share_type in result["shares_by_type"]:
                result["shares_by_type"][share_type].append({
                    "share_id": share.get("id"),
                    "shared_with_id": share.get("shared_with_id"),
                    "shared_with_name": share.get("shared_with_name"),
                    "access_level": share.get("access_level"),
                    "shared_by_name": share.get("shared_by_name"),
                    "shared_at": share.get("shared_at"),
                    "expires_at": share.get("expires_at")
                })
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting record shares: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to get record shares")


@router.delete("/objects/{object_name}/records/{record_id}/share/{share_id}")
async def revoke_record_share(
    object_name: str,
    record_id: str,
    share_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Revoke a manual record share.
    """
    try:
        # Find the share
        share = await db.record_shares.find_one({
            "id": share_id,
            "tenant_id": current_user.tenant_id,
            "object_name": object_name,
            "record_id": record_id
        }, {"_id": 0})
        
        if not share:
            raise HTTPException(status_code=404, detail="Share not found")
        
        # Delete the share
        await db.record_shares.delete_one({"id": share_id})
        
        # Audit log
        await log_audit_event(
            tenant_id=current_user.tenant_id,
            event_type="sharing",
            action="record_share_revoked",
            actor_user_id=current_user.id,
            actor_email=current_user.email,
            object_name=object_name,
            record_id=record_id,
            details={
                "share_id": share_id,
                "shared_with_type": share.get("shared_with_type"),
                "shared_with_id": share.get("shared_with_id"),
                "shared_with_name": share.get("shared_with_name")
            }
        )
        
        logger.info(f"Share {share_id} revoked for record {record_id}")
        
        return {
            "message": "Share revoked successfully",
            "share_id": share_id,
            "shared_with_name": share.get("shared_with_name")
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error revoking share: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to revoke share")


@router.post("/objects/{object_name}/records/bulk-share")
async def bulk_share_records(
    object_name: str,
    request: BulkShareRecordRequest,
    current_user: User = Depends(get_current_user)
):
    """
    Share multiple records with a user, group, or role at once.
    """
    try:
        # Validate inputs
        if request.shared_with_type not in ["user", "group", "role"]:
            raise HTTPException(
                status_code=400,
                detail="shared_with_type must be 'user', 'group', or 'role'"
            )
        
        if not request.record_ids:
            raise HTTPException(status_code=400, detail="record_ids cannot be empty")
        
        # Verify share target exists
        if not await _validate_share_target(current_user.tenant_id, request.shared_with_type, request.shared_with_id):
            raise HTTPException(
                status_code=404,
                detail=f"{request.shared_with_type.capitalize()} not found"
            )
        
        target_name = await _get_target_name(request.shared_with_type, request.shared_with_id)
        
        created = 0
        skipped = 0
        failed = 0
        
        for record_id in request.record_ids:
            try:
                # Verify record exists
                if not await _verify_record_exists(current_user.tenant_id, object_name, record_id):
                    failed += 1
                    continue
                
                # Check for existing share
                existing = await db.record_shares.find_one({
                    "tenant_id": current_user.tenant_id,
                    "object_name": object_name,
                    "record_id": record_id,
                    "shared_with_type": request.shared_with_type,
                    "shared_with_id": request.shared_with_id,
                    "is_active": True
                })
                
                if existing:
                    skipped += 1
                    continue
                
                # Create share
                share = {
                    "id": str(uuid.uuid4()),
                    "tenant_id": current_user.tenant_id,
                    "object_name": object_name,
                    "record_id": record_id,
                    "shared_with_type": request.shared_with_type,
                    "shared_with_id": request.shared_with_id,
                    "shared_with_name": target_name,
                    "access_level": request.access_level,
                    "shared_by": current_user.id,
                    "shared_by_name": f"{current_user.first_name} {current_user.last_name}".strip(),
                    "shared_at": datetime.now(timezone.utc),
                    "reason": request.reason,
                    "is_active": True
                }
                
                await db.record_shares.insert_one(share)
                created += 1
                
            except Exception as e:
                logger.warning(f"Failed to share record {record_id}: {str(e)}")
                failed += 1
        
        # Audit log
        await log_audit_event(
            tenant_id=current_user.tenant_id,
            event_type="sharing",
            action="bulk_record_share",
            actor_user_id=current_user.id,
            actor_email=current_user.email,
            object_name=object_name,
            details={
                "shared_with_type": request.shared_with_type,
                "shared_with_id": request.shared_with_id,
                "shared_with_name": target_name,
                "records_shared": created,
                "records_skipped": skipped,
                "records_failed": failed
            }
        )
        
        return {
            "message": "Bulk share completed",
            "shared_with_name": target_name,
            "results": {
                "created": created,
                "skipped": skipped,
                "failed": failed,
                "total_requested": len(request.record_ids)
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in bulk share: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to complete bulk share")


# ========================================
# USER'S SHARED RECORDS ROUTES
# ========================================

@router.get("/users/me/shared-with-me")
async def get_records_shared_with_me(
    object_name: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """
    Get all records that have been explicitly shared with the current user.
    Includes direct shares and shares via groups/roles the user belongs to.
    """
    try:
        # Get user's group memberships
        user_groups = await db.group_members.find({
            "user_id": current_user.id
        }, {"_id": 0, "group_id": 1}).to_list(None)
        group_ids = [g["group_id"] for g in user_groups]
        
        # Get user's role
        user_role_id = getattr(current_user, "role_id", None)
        
        # Build query for shares targeting this user
        now = datetime.now(timezone.utc)
        share_conditions = [
            {"shared_with_type": "user", "shared_with_id": current_user.id}
        ]
        
        if group_ids:
            share_conditions.append({
                "shared_with_type": "group",
                "shared_with_id": {"$in": group_ids}
            })
        
        if user_role_id:
            share_conditions.append({
                "shared_with_type": "role",
                "shared_with_id": user_role_id
            })
        
        query = {
            "tenant_id": current_user.tenant_id,
            "$or": share_conditions,
            "is_active": True,
            "$and": [
                {"$or": [
                    {"expires_at": None},
                    {"expires_at": {"$gt": now}}
                ]}
            ]
        }
        
        if object_name:
            query["object_name"] = object_name
        
        shares = await db.record_shares.find(query, {"_id": 0}).to_list(None)
        
        # Group by object
        by_object = {}
        for share in shares:
            obj = share.get("object_name")
            if obj not in by_object:
                by_object[obj] = []
            by_object[obj].append({
                "record_id": share.get("record_id"),
                "access_level": share.get("access_level"),
                "shared_by_name": share.get("shared_by_name"),
                "shared_at": share.get("shared_at"),
                "reason": share.get("reason"),
                "via": share.get("shared_with_type")  # How the user has access
            })
        
        return {
            "total_shares": len(shares),
            "by_object": by_object,
            "shares": shares
        }
        
    except Exception as e:
        logger.error(f"Error getting shared records: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to get shared records")
