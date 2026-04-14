"""
Sharing Rules Routes
Custom sharing rule management for record-level security.
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Dict, Any, Optional, List
from datetime import datetime, timezone
import uuid
import logging

from config.database import db
from shared.models import User
from modules.auth.api.auth_routes import get_current_user
from modules.users.api.dependencies import require_admin

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Sharing Rules"])


class SharingRuleCriteria(BaseModel):
    """Schema for sharing rule criteria"""
    field: str
    operator: str
    value: Any


class OwnerCriteria(BaseModel):
    """Schema for owner-based rule criteria"""
    owner_type: str
    owner_role_id: Optional[str] = None
    owner_user_id: Optional[str] = None


class SharingRuleCreate(BaseModel):
    """Schema for creating a sharing rule"""
    name: str
    description: Optional[str] = None
    object_name: str
    rule_type: str
    criteria: Optional[List[SharingRuleCriteria]] = None
    owner_criteria: Optional[OwnerCriteria] = None
    share_with_type: str
    share_with_id: str
    access_level: str = "read_only"
    is_active: bool = True


@router.get("/sharing-rules")
async def list_sharing_rules(
    object_name: Optional[str] = None,
    rule_type: Optional[str] = None,
    is_active: Optional[bool] = None,
    current_user: User = Depends(get_current_user)
):
    """List all sharing rules for the tenant."""
    try:
        query = {"tenant_id": current_user.tenant_id}
        
        if object_name:
            query["object_name"] = object_name
        if rule_type:
            query["rule_type"] = rule_type
        if is_active is not None:
            query["is_active"] = is_active
        
        cursor = db.sharing_rules.find(query, {"_id": 0}).sort("created_at", -1)
        rules = await cursor.to_list(500)
        
        for rule in rules:
            share_with_type = rule.get("share_with_type")
            share_with_id = rule.get("share_with_id")
            
            if share_with_type == "user":
                user = await db.users.find_one({"id": share_with_id}, {"_id": 0, "first_name": 1, "last_name": 1})
                rule["share_with_name"] = f"{user.get('first_name', '')} {user.get('last_name', '')}".strip() if user else "Unknown User"
            elif share_with_type == "role":
                role = await db.roles.find_one({"id": share_with_id}, {"_id": 0, "name": 1})
                rule["share_with_name"] = role.get("name") if role else "Unknown Role"
            elif share_with_type == "group":
                group = await db.groups.find_one({"id": share_with_id}, {"_id": 0, "name": 1})
                rule["share_with_name"] = group.get("name") if group else "Unknown Group"
            elif share_with_type == "queue":
                queue = await db.queues.find_one({"id": share_with_id}, {"_id": 0, "name": 1})
                rule["share_with_name"] = queue.get("name") if queue else "Unknown Queue"
            
            if rule.get("rule_type") == "owner" and rule.get("owner_criteria"):
                oc = rule["owner_criteria"]
                if oc.get("owner_type") == "role" and oc.get("owner_role_id"):
                    role = await db.roles.find_one({"id": oc["owner_role_id"]}, {"_id": 0, "name": 1})
                    rule["owner_criteria"]["owner_role_name"] = role.get("name") if role else "Unknown Role"
        
        return rules
    except Exception as e:
        logger.error(f"Error listing sharing rules: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch sharing rules")


@router.get("/sharing-rules/{rule_id}")
async def get_sharing_rule(rule_id: str, current_user: User = Depends(get_current_user)):
    """Get sharing rule details by ID."""
    try:
        rule = await db.sharing_rules.find_one(
            {"id": rule_id, "tenant_id": current_user.tenant_id},
            {"_id": 0}
        )
        
        if not rule:
            raise HTTPException(status_code=404, detail="Sharing rule not found")
        
        share_with_type = rule.get("share_with_type")
        share_with_id = rule.get("share_with_id")
        
        if share_with_type == "user":
            user = await db.users.find_one({"id": share_with_id}, {"_id": 0, "first_name": 1, "last_name": 1, "email": 1})
            if user:
                rule["share_with_name"] = f"{user.get('first_name', '')} {user.get('last_name', '')}".strip()
                rule["share_with_email"] = user.get("email")
        elif share_with_type == "role":
            role = await db.roles.find_one({"id": share_with_id}, {"_id": 0, "name": 1, "description": 1})
            if role:
                rule["share_with_name"] = role.get("name")
                rule["share_with_description"] = role.get("description")
        elif share_with_type == "group":
            group = await db.groups.find_one({"id": share_with_id}, {"_id": 0, "name": 1, "group_type": 1, "description": 1})
            if group:
                rule["share_with_name"] = group.get("name")
                rule["share_with_group_type"] = group.get("group_type")
        elif share_with_type == "queue":
            queue = await db.queues.find_one({"id": share_with_id}, {"_id": 0, "name": 1, "description": 1})
            if queue:
                rule["share_with_name"] = queue.get("name")
        
        if rule.get("rule_type") == "owner" and rule.get("owner_criteria"):
            oc = rule["owner_criteria"]
            if oc.get("owner_type") == "role" and oc.get("owner_role_id"):
                role = await db.roles.find_one({"id": oc["owner_role_id"]}, {"_id": 0, "name": 1})
                if role:
                    rule["owner_criteria"]["owner_role_name"] = role.get("name")
        
        return rule
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching sharing rule: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch sharing rule")


@router.post("/sharing-rules")
async def create_sharing_rule(rule_data: SharingRuleCreate, current_user: User = Depends(require_admin)):
    """Create a new sharing rule."""
    tenant_id = current_user.tenant_id
    
    if not rule_data.name or not rule_data.name.strip():
        raise HTTPException(status_code=400, detail="Rule name is required")
    
    existing = await db.sharing_rules.find_one({
        "tenant_id": tenant_id,
        "name": {"$regex": f"^{rule_data.name}$", "$options": "i"}
    })
    if existing:
        raise HTTPException(status_code=400, detail="Sharing rule with this name already exists")
    
    if rule_data.rule_type not in ["criteria", "owner"]:
        raise HTTPException(status_code=400, detail="Invalid rule type. Must be 'criteria' or 'owner'")
    
    if rule_data.rule_type == "criteria":
        if not rule_data.criteria or len(rule_data.criteria) == 0:
            raise HTTPException(status_code=400, detail="Criteria-based rules require at least one criterion")
        
        valid_operators = ["equals", "not_equals", "contains", "starts_with", "ends_with", 
                          "greater_than", "less_than", "greater_or_equal", "less_or_equal", 
                          "in_list", "not_in_list", "is_empty", "is_not_empty"]
        for c in rule_data.criteria:
            if c.operator not in valid_operators:
                raise HTTPException(status_code=400, detail=f"Invalid operator: {c.operator}")
    
    if rule_data.rule_type == "owner":
        if not rule_data.owner_criteria:
            raise HTTPException(status_code=400, detail="Owner-based rules require owner criteria")
        
        oc = rule_data.owner_criteria
        if oc.owner_type not in ["role", "user"]:
            raise HTTPException(status_code=400, detail="Owner type must be 'role' or 'user'")
        
        if oc.owner_type == "role" and not oc.owner_role_id:
            raise HTTPException(status_code=400, detail="Owner role ID is required for role-based owner criteria")
        
        if oc.owner_type == "user" and not oc.owner_user_id:
            raise HTTPException(status_code=400, detail="Owner user ID is required for user-based owner criteria")
        
        if oc.owner_type == "role":
            role = await db.roles.find_one({"id": oc.owner_role_id})
            if not role:
                raise HTTPException(status_code=404, detail="Owner role not found")
        elif oc.owner_type == "user":
            user = await db.users.find_one({"id": oc.owner_user_id, "tenant_id": tenant_id})
            if not user:
                raise HTTPException(status_code=404, detail="Owner user not found")
    
    if rule_data.share_with_type not in ["user", "role", "group", "queue"]:
        raise HTTPException(status_code=400, detail="Invalid share_with_type. Must be 'user', 'role', 'group', or 'queue'")
    
    if rule_data.share_with_type == "user":
        target = await db.users.find_one({"id": rule_data.share_with_id, "tenant_id": tenant_id})
        if not target:
            raise HTTPException(status_code=404, detail="Share target user not found")
    elif rule_data.share_with_type == "role":
        target = await db.roles.find_one({"id": rule_data.share_with_id})
        if not target:
            raise HTTPException(status_code=404, detail="Share target role not found")
    elif rule_data.share_with_type == "group":
        target = await db.groups.find_one({"id": rule_data.share_with_id, "tenant_id": tenant_id})
        if not target:
            raise HTTPException(status_code=404, detail="Share target group not found")
    elif rule_data.share_with_type == "queue":
        target = await db.queues.find_one({"id": rule_data.share_with_id, "tenant_id": tenant_id})
        if not target:
            raise HTTPException(status_code=404, detail="Share target queue not found")
    
    if rule_data.access_level not in ["read_only", "read_write"]:
        raise HTTPException(status_code=400, detail="Invalid access level. Must be 'read_only' or 'read_write'")
    
    now = datetime.now(timezone.utc)
    new_rule = {
        "id": str(uuid.uuid4()),
        "tenant_id": tenant_id,
        "name": rule_data.name.strip(),
        "description": rule_data.description.strip() if rule_data.description else None,
        "object_name": rule_data.object_name,
        "rule_type": rule_data.rule_type,
        "criteria": [c.model_dump() for c in rule_data.criteria] if rule_data.criteria else None,
        "owner_criteria": rule_data.owner_criteria.model_dump() if rule_data.owner_criteria else None,
        "share_with_type": rule_data.share_with_type,
        "share_with_id": rule_data.share_with_id,
        "access_level": rule_data.access_level,
        "is_active": rule_data.is_active,
        "created_at": now,
        "updated_at": now,
        "created_by": current_user.id
    }
    
    await db.sharing_rules.insert_one(new_rule)
    new_rule.pop("_id", None)
    
    logger.info(f"Created sharing rule: {rule_data.name} by user {current_user.id}")
    return new_rule


@router.put("/sharing-rules/{rule_id}")
async def update_sharing_rule(rule_id: str, rule_data: Dict[str, Any], current_user: User = Depends(require_admin)):
    """Update an existing sharing rule."""
    tenant_id = current_user.tenant_id
    
    rule = await db.sharing_rules.find_one({"id": rule_id, "tenant_id": tenant_id})
    if not rule:
        raise HTTPException(status_code=404, detail="Sharing rule not found")
    
    new_name = rule_data.get("name")
    if new_name and new_name != rule.get("name"):
        existing = await db.sharing_rules.find_one({
            "tenant_id": tenant_id,
            "name": {"$regex": f"^{new_name}$", "$options": "i"},
            "id": {"$ne": rule_id}
        })
        if existing:
            raise HTTPException(status_code=400, detail="Sharing rule with this name already exists")
    
    update_data = {"updated_at": datetime.now(timezone.utc)}
    
    allowed_fields = ["name", "description", "object_name", "rule_type", "criteria", 
                      "owner_criteria", "share_with_type", "share_with_id", "access_level", "is_active"]
    
    for field in allowed_fields:
        if field in rule_data:
            update_data[field] = rule_data[field]
    
    await db.sharing_rules.update_one(
        {"id": rule_id, "tenant_id": tenant_id},
        {"$set": update_data}
    )
    
    updated_rule = await db.sharing_rules.find_one({"id": rule_id, "tenant_id": tenant_id}, {"_id": 0})
    
    logger.info(f"Updated sharing rule: {rule_id} by user {current_user.id}")
    return updated_rule


@router.delete("/sharing-rules/{rule_id}")
async def delete_sharing_rule(rule_id: str, current_user: User = Depends(require_admin)):
    """Delete a sharing rule."""
    tenant_id = current_user.tenant_id
    
    rule = await db.sharing_rules.find_one({"id": rule_id, "tenant_id": tenant_id})
    if not rule:
        raise HTTPException(status_code=404, detail="Sharing rule not found")
    
    await db.sharing_rules.delete_one({"id": rule_id, "tenant_id": tenant_id})
    
    logger.info(f"Deleted sharing rule: {rule_id} by user {current_user.id}")
    return {"message": "Sharing rule deleted successfully"}


@router.post("/sharing-rules/{rule_id}/toggle")
async def toggle_sharing_rule(rule_id: str, current_user: User = Depends(require_admin)):
    """Toggle a sharing rule's active status."""
    tenant_id = current_user.tenant_id
    
    rule = await db.sharing_rules.find_one({"id": rule_id, "tenant_id": tenant_id})
    if not rule:
        raise HTTPException(status_code=404, detail="Sharing rule not found")
    
    new_status = not rule.get("is_active", True)
    
    await db.sharing_rules.update_one(
        {"id": rule_id, "tenant_id": tenant_id},
        {"$set": {"is_active": new_status, "updated_at": datetime.now(timezone.utc)}}
    )
    
    logger.info(f"Toggled sharing rule {rule_id} to {'active' if new_status else 'inactive'} by user {current_user.id}")
    return {"message": f"Sharing rule {'activated' if new_status else 'deactivated'}", "is_active": new_status}


@router.get("/sharing-rules/objects/{object_name}")
async def get_object_sharing_rules(object_name: str, current_user: User = Depends(get_current_user)):
    """Get all active sharing rules for a specific object."""
    try:
        query = {
            "tenant_id": current_user.tenant_id,
            "object_name": object_name,
            "is_active": True
        }
        
        cursor = db.sharing_rules.find(query, {"_id": 0})
        rules = await cursor.to_list(100)
        
        return rules
    except Exception as e:
        logger.error(f"Error fetching object sharing rules: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch sharing rules")


@router.get("/sharing-rules/targets/available")
async def get_available_share_targets(current_user: User = Depends(get_current_user)):
    """Get all available share targets (users, roles, groups, queues)."""
    try:
        tenant_id = current_user.tenant_id
        
        users = await db.users.find(
            {"tenant_id": tenant_id, "is_active": True},
            {"_id": 0, "id": 1, "first_name": 1, "last_name": 1, "email": 1}
        ).to_list(500)
        
        roles = await db.roles.find(
            {},
            {"_id": 0, "id": 1, "name": 1, "description": 1}
        ).to_list(100)
        
        groups = await db.groups.find(
            {"tenant_id": tenant_id},
            {"_id": 0, "id": 1, "name": 1, "group_type": 1}
        ).to_list(100)
        
        queues = await db.queues.find(
            {"tenant_id": tenant_id},
            {"_id": 0, "id": 1, "name": 1}
        ).to_list(100)
        
        return {
            "users": users,
            "roles": roles,
            "groups": groups,
            "queues": queues
        }
    except Exception as e:
        logger.error(f"Error fetching share targets: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch share targets")


@router.get("/sharing-rules/fields/{object_name}")
async def get_object_fields_for_criteria(object_name: str, current_user: User = Depends(get_current_user)):
    """Get available fields for an object that can be used in sharing rule criteria."""
    try:
        tenant_id = current_user.tenant_id
        
        core_fields = {
            "lead": [
                {"name": "status", "label": "Status", "type": "picklist"},
                {"name": "source", "label": "Lead Source", "type": "picklist"},
                {"name": "rating", "label": "Rating", "type": "picklist"},
                {"name": "industry", "label": "Industry", "type": "picklist"},
                {"name": "company", "label": "Company", "type": "text"},
                {"name": "annual_revenue", "label": "Annual Revenue", "type": "currency"},
                {"name": "owner_id", "label": "Owner", "type": "lookup"},
                {"name": "created_by", "label": "Created By", "type": "lookup"},
            ],
            "contact": [
                {"name": "account_id", "label": "Account", "type": "lookup"},
                {"name": "title", "label": "Title", "type": "text"},
                {"name": "department", "label": "Department", "type": "text"},
                {"name": "lead_source", "label": "Lead Source", "type": "picklist"},
                {"name": "owner_id", "label": "Owner", "type": "lookup"},
                {"name": "created_by", "label": "Created By", "type": "lookup"},
            ],
            "account": [
                {"name": "type", "label": "Type", "type": "picklist"},
                {"name": "industry", "label": "Industry", "type": "picklist"},
                {"name": "rating", "label": "Rating", "type": "picklist"},
                {"name": "annual_revenue", "label": "Annual Revenue", "type": "currency"},
                {"name": "number_of_employees", "label": "Employees", "type": "number"},
                {"name": "owner_id", "label": "Owner", "type": "lookup"},
                {"name": "created_by", "label": "Created By", "type": "lookup"},
            ],
            "opportunity": [
                {"name": "stage", "label": "Stage", "type": "picklist"},
                {"name": "type", "label": "Type", "type": "picklist"},
                {"name": "lead_source", "label": "Lead Source", "type": "picklist"},
                {"name": "amount", "label": "Amount", "type": "currency"},
                {"name": "probability", "label": "Probability", "type": "percent"},
                {"name": "account_id", "label": "Account", "type": "lookup"},
                {"name": "owner_id", "label": "Owner", "type": "lookup"},
                {"name": "created_by", "label": "Created By", "type": "lookup"},
            ],
            "case": [
                {"name": "status", "label": "Status", "type": "picklist"},
                {"name": "priority", "label": "Priority", "type": "picklist"},
                {"name": "type", "label": "Type", "type": "picklist"},
                {"name": "origin", "label": "Case Origin", "type": "picklist"},
                {"name": "account_id", "label": "Account", "type": "lookup"},
                {"name": "contact_id", "label": "Contact", "type": "lookup"},
                {"name": "owner_id", "label": "Owner", "type": "lookup"},
                {"name": "created_by", "label": "Created By", "type": "lookup"},
            ],
            "task": [
                {"name": "status", "label": "Status", "type": "picklist"},
                {"name": "priority", "label": "Priority", "type": "picklist"},
                {"name": "type", "label": "Type", "type": "picklist"},
                {"name": "owner_id", "label": "Owner", "type": "lookup"},
                {"name": "created_by", "label": "Created By", "type": "lookup"},
            ]
        }
        
        fields = core_fields.get(object_name, [])
        
        schema = await db.object_schemas.find_one(
            {"tenant_id": tenant_id, "object_name": object_name},
            {"_id": 0, "fields": 1}
        )
        
        if schema and schema.get("fields"):
            for field in schema["fields"]:
                if field.get("name") not in [f["name"] for f in fields]:
                    fields.append({
                        "name": field.get("name"),
                        "label": field.get("label", field.get("name")),
                        "type": field.get("type", "text")
                    })
        
        return fields
    except Exception as e:
        logger.error(f"Error fetching object fields: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch object fields")
