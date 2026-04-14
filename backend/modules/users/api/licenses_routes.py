"""
Licenses API Routes
Manages tenant license/plan configuration.
Part of Salesforce-style security architecture.

This module enables:
- Viewing current license details
- Listing available plans (for upgrade paths)
- Managing license features and limits
- License usage tracking

Note: This is schema-only implementation. Feature enforcement will be added later.
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone
from pydantic import BaseModel, Field
import uuid
import logging

from config.database import db
from shared.models import User, License, LicenseFeatures, LicenseLimits
from modules.auth.api.auth_routes import get_current_user
from modules.users.services import log_audit_event

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Licenses"])


# ========================================
# REQUEST/RESPONSE MODELS
# ========================================

class CreateLicenseRequest(BaseModel):
    """Request model for creating a license"""
    name: str
    api_name: str
    description: Optional[str] = None
    tier: int = 1
    features: Optional[Dict[str, bool]] = None
    limits: Optional[Dict[str, Any]] = None
    is_trial: bool = False
    trial_days: Optional[int] = None


class UpdateLicenseRequest(BaseModel):
    """Request model for updating a license"""
    name: Optional[str] = None
    description: Optional[str] = None
    features: Optional[Dict[str, bool]] = None
    limits: Optional[Dict[str, Any]] = None
    is_active: Optional[bool] = None


class LicenseResponse(BaseModel):
    """Response model for license"""
    id: str
    tenant_id: str
    name: str
    api_name: str
    description: Optional[str] = None
    tier: int
    features: Dict[str, bool]
    limits: Dict[str, Any]
    is_active: bool
    is_trial: bool
    trial_ends_at: Optional[datetime] = None
    valid_from: datetime
    valid_until: Optional[datetime] = None
    created_at: datetime


class LicenseUsageResponse(BaseModel):
    """Response model for license usage"""
    license_id: str
    license_name: str
    usage: Dict[str, Any]
    limits: Dict[str, Any]
    utilization_percent: Dict[str, float]


# ========================================
# PREDEFINED LICENSE TEMPLATES
# ========================================

LICENSE_TEMPLATES = {
    "free": {
        "name": "Free",
        "api_name": "free",
        "description": "Basic CRM functionality for small teams",
        "tier": 1,
        "features": {
            "crm_core": True,
            "custom_objects": False,
            "flow_builder": False,
            "approval_workflows": False,
            "basic_reports": True,
            "advanced_reporting": False,
            "api_access": False,
            "webhook_support": False,
            "chatter": True,
            "file_manager": True,
            "advanced_security": False,
            "audit_trail": False,
            "ai_features": False,
            "ai_assistant": False
        },
        "limits": {
            "max_users": 5,
            "max_storage_gb": 1,
            "max_api_calls_per_day": 0,
            "max_custom_objects": 0,
            "max_custom_fields_per_object": 20,
            "max_flows": 0,
            "max_reports": 5,
            "max_dashboards": 1
        }
    },
    "starter": {
        "name": "Starter",
        "api_name": "starter",
        "description": "Essential CRM features for growing teams",
        "tier": 2,
        "features": {
            "crm_core": True,
            "custom_objects": True,
            "flow_builder": True,
            "approval_workflows": False,
            "basic_reports": True,
            "advanced_reporting": True,
            "api_access": True,
            "webhook_support": False,
            "chatter": True,
            "file_manager": True,
            "advanced_security": False,
            "audit_trail": False,
            "ai_features": False,
            "ai_assistant": False
        },
        "limits": {
            "max_users": 25,
            "max_storage_gb": 10,
            "max_api_calls_per_day": 10000,
            "max_custom_objects": 10,
            "max_custom_fields_per_object": 100,
            "max_flows": 20,
            "max_reports": 50,
            "max_dashboards": 5
        }
    },
    "professional": {
        "name": "Professional",
        "api_name": "professional",
        "description": "Advanced CRM for professional sales teams",
        "tier": 3,
        "features": {
            "crm_core": True,
            "custom_objects": True,
            "flow_builder": True,
            "approval_workflows": True,
            "basic_reports": True,
            "advanced_reporting": True,
            "api_access": True,
            "webhook_support": True,
            "chatter": True,
            "file_manager": True,
            "advanced_security": True,
            "audit_trail": True,
            "ai_features": True,
            "ai_assistant": False
        },
        "limits": {
            "max_users": 100,
            "max_storage_gb": 50,
            "max_api_calls_per_day": 50000,
            "max_custom_objects": 50,
            "max_custom_fields_per_object": 300,
            "max_flows": 100,
            "max_reports": 200,
            "max_dashboards": 20
        }
    },
    "enterprise": {
        "name": "Enterprise",
        "api_name": "enterprise",
        "description": "Full-featured CRM for large organizations",
        "tier": 4,
        "features": {
            "crm_core": True,
            "custom_objects": True,
            "flow_builder": True,
            "approval_workflows": True,
            "basic_reports": True,
            "advanced_reporting": True,
            "api_access": True,
            "webhook_support": True,
            "chatter": True,
            "file_manager": True,
            "advanced_security": True,
            "audit_trail": True,
            "ai_features": True,
            "ai_assistant": True
        },
        "limits": {
            "max_users": None,  # Unlimited
            "max_storage_gb": 500,
            "max_api_calls_per_day": None,  # Unlimited
            "max_custom_objects": 200,
            "max_custom_fields_per_object": 500,
            "max_flows": 500,
            "max_reports": None,  # Unlimited
            "max_dashboards": None  # Unlimited
        }
    }
}


# ========================================
# LICENSE ROUTES
# ========================================

@router.get("/license")
async def get_current_license(current_user: User = Depends(get_current_user)):
    """
    Get the current tenant's license details.
    Returns the active license for the tenant.
    """
    try:
        # Find active license for tenant
        license_doc = await db.licenses.find_one({
            "tenant_id": current_user.tenant_id,
            "is_active": True
        }, {"_id": 0})
        
        if not license_doc:
            # Return default free license if none exists
            return {
                "license": None,
                "message": "No license configured. Using default free tier.",
                "default_tier": "free",
                "features": LICENSE_TEMPLATES["free"]["features"],
                "limits": LICENSE_TEMPLATES["free"]["limits"]
            }
        
        return {
            "license": license_doc,
            "features": license_doc.get("features", {}),
            "limits": license_doc.get("limits", {})
        }
        
    except Exception as e:
        logger.error(f"Error getting license: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to get license")


@router.get("/license/usage")
async def get_license_usage(current_user: User = Depends(get_current_user)):
    """
    Get current usage against license limits.
    Shows how much of each limited resource is being used.
    """
    try:
        # Get license
        license_doc = await db.licenses.find_one({
            "tenant_id": current_user.tenant_id,
            "is_active": True
        }, {"_id": 0})
        
        limits = license_doc.get("limits", LICENSE_TEMPLATES["free"]["limits"]) if license_doc else LICENSE_TEMPLATES["free"]["limits"]
        
        # Calculate current usage
        user_count = await db.users.count_documents({
            "tenant_id": current_user.tenant_id,
            "is_active": True
        })
        
        custom_object_count = await db.schema_objects.count_documents({
            "tenant_id": current_user.tenant_id,
            "is_custom": True
        })
        
        flow_count = await db.flows.count_documents({
            "tenant_id": current_user.tenant_id
        })
        
        report_count = await db.reports.count_documents({
            "tenant_id": current_user.tenant_id
        })
        
        dashboard_count = await db.dashboards.count_documents({
            "tenant_id": current_user.tenant_id
        })
        
        usage = {
            "users": user_count,
            "custom_objects": custom_object_count,
            "flows": flow_count,
            "reports": report_count,
            "dashboards": dashboard_count,
            "storage_gb": 0  # TODO: Calculate actual storage usage
        }
        
        # Calculate utilization percentages
        utilization = {}
        for key, current in usage.items():
            limit_key = f"max_{key}"
            limit = limits.get(limit_key)
            if limit is not None and limit > 0:
                utilization[key] = round((current / limit) * 100, 1)
            else:
                utilization[key] = 0  # Unlimited or not applicable
        
        return {
            "license_id": license_doc.get("id") if license_doc else None,
            "license_name": license_doc.get("name", "Free") if license_doc else "Free",
            "usage": usage,
            "limits": limits,
            "utilization_percent": utilization
        }
        
    except Exception as e:
        logger.error(f"Error getting license usage: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to get license usage")


@router.get("/license/plans")
async def list_available_plans(current_user: User = Depends(get_current_user)):
    """
    List all available license plans/templates.
    Useful for showing upgrade options.
    """
    try:
        plans = []
        for api_name, template in LICENSE_TEMPLATES.items():
            plans.append({
                "api_name": api_name,
                "name": template["name"],
                "description": template["description"],
                "tier": template["tier"],
                "features": template["features"],
                "limits": template["limits"]
            })
        
        # Sort by tier
        plans.sort(key=lambda x: x["tier"])
        
        # Get current license to show which plan is active
        current_license = await db.licenses.find_one({
            "tenant_id": current_user.tenant_id,
            "is_active": True
        }, {"_id": 0, "api_name": 1})
        
        current_plan = current_license.get("api_name") if current_license else "free"
        
        return {
            "current_plan": current_plan,
            "available_plans": plans
        }
        
    except Exception as e:
        logger.error(f"Error listing plans: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to list plans")


@router.post("/license")
async def create_license(
    request: CreateLicenseRequest,
    current_user: User = Depends(get_current_user)
):
    """
    Create or update the tenant's license.
    Typically used when upgrading/downgrading plans.
    """
    try:
        # Check if current user is super admin
        user_doc = await db.users.find_one({
            "id": current_user.id
        }, {"_id": 0, "is_super_admin": 1})
        
        if not user_doc or not user_doc.get("is_super_admin", False):
            raise HTTPException(
                status_code=403,
                detail="Only Super Admins can manage licenses"
            )
        
        # Deactivate any existing licenses
        await db.licenses.update_many(
            {"tenant_id": current_user.tenant_id, "is_active": True},
            {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc)}}
        )
        
        # Get template if api_name matches
        template = LICENSE_TEMPLATES.get(request.api_name, {})
        
        # Merge with template defaults
        features = {**template.get("features", {}), **(request.features or {})}
        limits = {**template.get("limits", {}), **(request.limits or {})}
        
        # Calculate trial end date if applicable
        trial_ends_at = None
        if request.is_trial and request.trial_days:
            from datetime import timedelta
            trial_ends_at = datetime.now(timezone.utc) + timedelta(days=request.trial_days)
        
        license_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc)
        
        new_license = {
            "id": license_id,
            "tenant_id": current_user.tenant_id,
            "name": request.name,
            "api_name": request.api_name,
            "description": request.description or template.get("description"),
            "tier": request.tier or template.get("tier", 1),
            "features": features,
            "limits": limits,
            "is_active": True,
            "is_trial": request.is_trial,
            "trial_ends_at": trial_ends_at,
            "valid_from": now,
            "valid_until": None,
            "created_at": now,
            "updated_at": now,
            "created_by": current_user.id
        }
        
        await db.licenses.insert_one(new_license)
        
        # Update all tenant users with new license_id
        await db.users.update_many(
            {"tenant_id": current_user.tenant_id},
            {"$set": {"license_id": license_id}}
        )
        
        # Audit log
        await log_audit_event(
            tenant_id=current_user.tenant_id,
            event_type="security",
            action="license_created",
            actor_user_id=current_user.id,
            actor_email=current_user.email,
            details={
                "license_id": license_id,
                "license_name": request.name,
                "api_name": request.api_name,
                "is_trial": request.is_trial
            }
        )
        
        logger.info(f"License '{request.name}' created for tenant {current_user.tenant_id}")
        
        return {
            "message": f"License '{request.name}' created successfully",
            "license_id": license_id,
            "api_name": request.api_name,
            "is_trial": request.is_trial,
            "trial_ends_at": trial_ends_at
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating license: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to create license")


@router.put("/license")
async def update_license(
    request: UpdateLicenseRequest,
    current_user: User = Depends(get_current_user)
):
    """
    Update the current tenant's license.
    Can modify features and limits.
    """
    try:
        # Check if current user is super admin
        user_doc = await db.users.find_one({
            "id": current_user.id
        }, {"_id": 0, "is_super_admin": 1})
        
        if not user_doc or not user_doc.get("is_super_admin", False):
            raise HTTPException(
                status_code=403,
                detail="Only Super Admins can manage licenses"
            )
        
        # Find current license
        license_doc = await db.licenses.find_one({
            "tenant_id": current_user.tenant_id,
            "is_active": True
        }, {"_id": 0})
        
        if not license_doc:
            raise HTTPException(status_code=404, detail="No active license found")
        
        # Build update
        update_data = {"updated_at": datetime.now(timezone.utc)}
        
        if request.name is not None:
            update_data["name"] = request.name
        if request.description is not None:
            update_data["description"] = request.description
        if request.is_active is not None:
            update_data["is_active"] = request.is_active
        
        # Merge features if provided
        if request.features is not None:
            current_features = license_doc.get("features", {})
            update_data["features"] = {**current_features, **request.features}
        
        # Merge limits if provided
        if request.limits is not None:
            current_limits = license_doc.get("limits", {})
            update_data["limits"] = {**current_limits, **request.limits}
        
        await db.licenses.update_one(
            {"id": license_doc["id"]},
            {"$set": update_data}
        )
        
        # Audit log
        await log_audit_event(
            tenant_id=current_user.tenant_id,
            event_type="security",
            action="license_updated",
            actor_user_id=current_user.id,
            actor_email=current_user.email,
            details={
                "license_id": license_doc["id"],
                "changes": list(update_data.keys())
            }
        )
        
        return {
            "message": "License updated successfully",
            "license_id": license_doc["id"]
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating license: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to update license")


@router.get("/license/check-feature/{feature_name}")
async def check_license_feature(
    feature_name: str,
    current_user: User = Depends(get_current_user)
):
    """
    Check if a specific feature is enabled in the current license.
    Note: This is for informational purposes only. 
    Feature enforcement will be added in a future phase.
    """
    try:
        # Get license
        license_doc = await db.licenses.find_one({
            "tenant_id": current_user.tenant_id,
            "is_active": True
        }, {"_id": 0})
        
        if license_doc:
            features = license_doc.get("features", {})
            is_enabled = features.get(feature_name, False)
            license_name = license_doc.get("name", "Unknown")
        else:
            # Default to free tier features
            features = LICENSE_TEMPLATES["free"]["features"]
            is_enabled = features.get(feature_name, False)
            license_name = "Free"
        
        return {
            "feature": feature_name,
            "enabled": is_enabled,
            "license": license_name,
            "note": "Feature enforcement not yet active. This is informational only."
        }
        
    except Exception as e:
        logger.error(f"Error checking feature: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to check feature")


@router.get("/license/check-limit/{limit_name}")
async def check_license_limit(
    limit_name: str,
    current_user: User = Depends(get_current_user)
):
    """
    Check current usage against a specific limit.
    Note: This is for informational purposes only.
    Limit enforcement will be added in a future phase.
    """
    try:
        # Get license
        license_doc = await db.licenses.find_one({
            "tenant_id": current_user.tenant_id,
            "is_active": True
        }, {"_id": 0})
        
        if license_doc:
            limits = license_doc.get("limits", {})
            license_name = license_doc.get("name", "Unknown")
        else:
            limits = LICENSE_TEMPLATES["free"]["limits"]
            license_name = "Free"
        
        limit_key = f"max_{limit_name}" if not limit_name.startswith("max_") else limit_name
        limit_value = limits.get(limit_key)
        
        # Get current usage based on limit type
        current_usage = 0
        if "users" in limit_name:
            current_usage = await db.users.count_documents({
                "tenant_id": current_user.tenant_id,
                "is_active": True
            })
        elif "custom_objects" in limit_name:
            current_usage = await db.schema_objects.count_documents({
                "tenant_id": current_user.tenant_id,
                "is_custom": True
            })
        elif "flows" in limit_name:
            current_usage = await db.flows.count_documents({
                "tenant_id": current_user.tenant_id
            })
        elif "reports" in limit_name:
            current_usage = await db.reports.count_documents({
                "tenant_id": current_user.tenant_id
            })
        elif "dashboards" in limit_name:
            current_usage = await db.dashboards.count_documents({
                "tenant_id": current_user.tenant_id
            })
        
        # Calculate status
        if limit_value is None:
            status = "unlimited"
            remaining = None
        elif current_usage >= limit_value:
            status = "at_limit"
            remaining = 0
        elif current_usage >= limit_value * 0.8:
            status = "approaching_limit"
            remaining = limit_value - current_usage
        else:
            status = "ok"
            remaining = limit_value - current_usage
        
        return {
            "limit": limit_name,
            "limit_value": limit_value,
            "current_usage": current_usage,
            "remaining": remaining,
            "status": status,
            "license": license_name,
            "note": "Limit enforcement not yet active. This is informational only."
        }
        
    except Exception as e:
        logger.error(f"Error checking limit: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to check limit")
