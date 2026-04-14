"""
Flow Version Control API Endpoints
Salesforce-grade version management for flows
"""
from fastapi import APIRouter, Depends, HTTPException, status
from typing import List, Optional
from datetime import datetime, timezone
from uuid import uuid4
import logging
from motor.motor_asyncio import AsyncIOMotorDatabase

# Import from parent modules
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))))

# Import from server.py
from server import get_current_user, db, User

from ..models.flow import Flow, FlowStatus

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Flow Versions"])


async def deactivate_sibling_versions(flow_id: str, tenant_id: str, exclude_flow_id: str = None):
    """
    Deactivate ALL other versions of a flow when one is being activated.
    This ensures only ONE active version exists per flow at any time.
    
    Salesforce Rule: When activating a flow, automatically deactivate ALL other versions.
    """
    # Get the flow to find parent_flow_id
    flow_data = await db.flows.find_one({"id": flow_id, "tenant_id": tenant_id}, {"_id": 0})
    
    if not flow_data:
        return 0
    
    # Determine the root parent ID
    parent_id = flow_data.get("parent_flow_id") or flow_id
    
    # Build query to find ALL related versions (same flow family)
    query = {
        "tenant_id": tenant_id,
        "status": "active",  # Only deactivate currently active ones
        "$or": [
            {"id": parent_id},              # The parent flow itself
            {"parent_flow_id": parent_id},  # All child versions
        ]
    }
    
    # Exclude the flow being activated
    if exclude_flow_id:
        query["id"] = {"$ne": exclude_flow_id}
    
    # Perform deactivation
    result = await db.flows.update_many(
        query,
        {
            "$set": {
                "status": "inactive",
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
        }
    )
    
    if result.modified_count > 0:
        logger.info(f"🔄 AUTO-DEACTIVATED {result.modified_count} sibling version(s) for flow family {parent_id}")
    
    return result.modified_count


@router.get("/flows/{flow_id}/details")
async def get_flow_details(
    flow_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Get comprehensive flow details including metadata and version history
    Similar to Salesforce "View Details" page
    """
    # Get tenant_id from User model
    tenant_id = current_user.tenant_id
    
    # Get the specified flow
    flow = await db.flows.find_one({"id": flow_id, "tenant_id": tenant_id}, {"_id": 0})
    if not flow:
        raise HTTPException(status_code=404, detail="Flow not found")
    
    # Find parent_flow_id (the original flow ID that links all versions)
    parent_id = flow.get('parent_flow_id') or flow_id
    
    # Get all versions of this flow
    versions = await db.flows.find(
        {
            "$or": [
                {"id": parent_id},  # The original v1
                {"parent_flow_id": parent_id}  # All child versions
            ],
            "tenant_id": tenant_id
        },
        {"_id": 0}
    ).sort("version", -1).to_list(100)
    
    # Get active version
    active_version = next((v for v in versions if v.get('status') == 'active'), None)
    
    # Get execution count for this flow family
    execution_count = await db.flow_executions.count_documents({
        "flow_id": {"$in": [v['id'] for v in versions]},
        "tenant_id": tenant_id
    })
    
    return {
        "flow": flow,
        "parent_flow_id": parent_id,
        "active_version": active_version,
        "versions": versions,
        "total_versions": len(versions),
        "execution_count": execution_count,
        "metadata": {
            "name": flow.get('name'),
            "description": flow.get('description'),
            "created_at": flow.get('created_at'),
            "updated_at": flow.get('updated_at'),
            "created_by": flow.get('created_by'),
            "updated_by": flow.get('updated_by'),
            "current_version": flow.get('version'),
            "current_status": flow.get('status')
        }
    }


@router.get("/flows/{flow_id}/versions")
async def get_flow_versions(
    flow_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Get all versions of a flow
    """
    tenant_id = current_user.tenant_id
    
    flow = await db.flows.find_one({"id": flow_id, "tenant_id": tenant_id}, {"_id": 0})
    if not flow:
        raise HTTPException(status_code=404, detail="Flow not found")
    
    parent_id = flow.get('parent_flow_id') or flow_id
    
    versions = await db.flows.find(
        {
            "$or": [
                {"id": parent_id},
                {"parent_flow_id": parent_id}
            ],
            "tenant_id": tenant_id
        },
        {"_id": 0}
    ).sort("version", -1).to_list(100)
    
    return {"versions": versions, "total": len(versions)}


@router.get("/flows/{flow_id}/versions/{version_number}")
async def get_specific_version(
    flow_id: str,
    version_number: int,
    current_user: User = Depends(get_current_user)
):
    """
    Get a specific version of a flow (for read-only viewing)
    """
    tenant_id = current_user.tenant_id
    flow = await db.flows.find_one({"id": flow_id, "tenant_id": tenant_id}, {"_id": 0})
    if not flow:
        raise HTTPException(status_code=404, detail="Flow not found")
    
    parent_id = flow.get('parent_flow_id') or flow_id
    
    version = await db.flows.find_one(
        {
            "$or": [
                {"id": parent_id},
                {"parent_flow_id": parent_id}
            ],
            "version": version_number,
            "tenant_id": tenant_id
        },
        {"_id": 0}
    )
    
    if not version:
        raise HTTPException(status_code=404, detail=f"Version {version_number} not found")
    
    return {"flow": version, "read_only": version.get('status') != 'draft'}


@router.post("/flows/{flow_id}/create-version")
async def create_new_version(
    flow_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Create a new draft version from an active flow
    This is triggered when user tries to edit an active flow
    """
    tenant_id = current_user.tenant_id
    flow = await db.flows.find_one({"id": flow_id, "tenant_id": tenant_id}, {"_id": 0})
    if not flow:
        raise HTTPException(status_code=404, detail="Flow not found")
    
    # Only active flows can have new versions created
    if flow.get('status') != 'active':
        raise HTTPException(
            status_code=400,
            detail="Only active flows can have new versions created. Edit the draft directly."
        )
    
    parent_id = flow.get('parent_flow_id') or flow_id
    
    # Get highest version number
    all_versions = await db.flows.find(
        {
            "$or": [
                {"id": parent_id},
                {"parent_flow_id": parent_id}
            ],
            "tenant_id": tenant_id
        },
        {"version": 1}
    ).to_list(100)
    
    max_version = max([v.get('version', 1) for v in all_versions], default=0)
    new_version_number = max_version + 1
    
    # Create new draft version
    new_flow_id = str(uuid4())
    new_flow = {
        **flow,
        "id": new_flow_id,
        "version": new_version_number,
        "status": "draft",
        "parent_flow_id": parent_id,
        "version_label": f"v{new_version_number}",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "created_by": tenant_id,
        "updated_by": tenant_id
    }
    
    await db.flows.insert_one(new_flow)
    logger.info(f"✅ Created new draft version v{new_version_number} for flow {flow.get('name')}")
    
    return {
        "message": f"Created new draft version v{new_version_number}",
        "new_flow_id": new_flow_id,
        "version": new_version_number,
        "status": "draft"
    }


@router.post("/flows/{flow_id}/activate")
async def activate_version(
    flow_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Activate a draft version
    Automatically deactivates the previous active version
    Auto-heals flow structure before activation (connects missing END paths, cleans orphaned edges)
    """
    tenant_id = current_user.tenant_id
    flow = await db.flows.find_one({"id": flow_id, "tenant_id": tenant_id}, {"_id": 0})
    if not flow:
        raise HTTPException(status_code=404, detail="Flow not found")
    
    if flow.get('status') == 'active':
        raise HTTPException(status_code=400, detail="Flow is already active")
    
    if flow.get('status') == 'archived':
        raise HTTPException(status_code=400, detail="Archived flows cannot be activated")
    
    if flow.get('status') != 'draft':
        raise HTTPException(status_code=400, detail="Only draft flows can be activated")
    
    # Auto-heal and validate flow before activation
    from ..validators.flow_validator import FlowValidator
    validator = FlowValidator(db)
    
    # Auto-heal the flow structure
    healed_flow = await validator.auto_heal_flow(flow)
    
    # Validate the healed flow
    validation_result = await validator.validate_flow(healed_flow, current_user.id)
    
    if not validation_result.is_valid:
        # Return validation errors
        return {
            "success": False,
            "message": "Flow validation failed. Cannot activate flow with errors.",
            "validation": validation_result.to_dict()
        }
    
    # Update flow with healed structure
    await db.flows.update_one(
        {"id": flow_id, "tenant_id": tenant_id},
        {
            "$set": {
                "nodes": healed_flow.get('nodes', []),
                "edges": healed_flow.get('edges', []),
                "updated_at": datetime.now(timezone.utc).isoformat(),
                "updated_by": tenant_id
            }
        }
    )
    
    # CRITICAL: Deactivate ALL other versions before activating this one
    # This ensures only ONE active version exists per flow at any time
    deactivated_count = await deactivate_sibling_versions(flow_id, tenant_id, exclude_flow_id=flow_id)
    
    # Activate this version
    await db.flows.update_one(
        {"id": flow_id, "tenant_id": tenant_id},
        {
            "$set": {
                "status": "active",
                "is_active": True,  # Keep backward compatibility
                "updated_at": datetime.now(timezone.utc).isoformat(),
                "updated_by": tenant_id
            }
        }
    )
    
    logger.info(f"✅ Activated flow version v{flow.get('version')} for {flow.get('name')} (deactivated {deactivated_count} sibling versions)")
    
    return {
        "success": True,
        "message": f"Flow version v{flow.get('version')} activated successfully",
        "flow_id": flow_id,
        "version": flow.get('version'),
        "status": "active",
        "deactivated_siblings": deactivated_count
    }


@router.post("/flows/{flow_id}/deactivate")
async def deactivate_version(
    flow_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Deactivate an active version
    """
    tenant_id = current_user.tenant_id
    flow = await db.flows.find_one({"id": flow_id, "tenant_id": tenant_id}, {"_id": 0})
    if not flow:
        raise HTTPException(status_code=404, detail="Flow not found")
    
    if flow.get('status') != 'active':
        raise HTTPException(status_code=400, detail="Flow is not active")
    
    await db.flows.update_one(
        {"id": flow_id, "tenant_id": tenant_id},
        {
            "$set": {
                "status": "inactive",
                "is_active": False,  # Keep backward compatibility
                "updated_at": datetime.now(timezone.utc).isoformat(),
                "updated_by": tenant_id
            }
        }
    )
    
    logger.info(f"✅ Deactivated flow version v{flow.get('version')} for {flow.get('name')}")
    
    return {
        "message": f"Flow version v{flow.get('version')} deactivated successfully",
        "flow_id": flow_id,
        "status": "inactive"
    }


@router.post("/flows/{flow_id}/archive")
async def archive_version(
    flow_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Archive a version (read-only, cannot be activated again)
    """
    tenant_id = current_user.tenant_id
    flow = await db.flows.find_one({"id": flow_id, "tenant_id": tenant_id}, {"_id": 0})
    if not flow:
        raise HTTPException(status_code=404, detail="Flow not found")
    
    if flow.get('status') == 'archived':
        raise HTTPException(status_code=400, detail="Flow is already archived")
    
    if flow.get('status') == 'active':
        raise HTTPException(status_code=400, detail="Active flows cannot be archived. Deactivate first.")
    
    await db.flows.update_one(
        {"id": flow_id, "tenant_id": tenant_id},
        {
            "$set": {
                "status": "archived",
                "is_active": False,
                "updated_at": datetime.now(timezone.utc).isoformat(),
                "updated_by": tenant_id
            }
        }
    )
    
    logger.info(f"✅ Archived flow version v{flow.get('version')} for {flow.get('name')}")
    
    return {
        "message": f"Flow version v{flow.get('version')} archived successfully",
        "flow_id": flow_id,
        "status": "archived"
    }
