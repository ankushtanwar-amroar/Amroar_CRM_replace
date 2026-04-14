"""
Validation Rules Routes
Full CRUD API for validation rules management
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator, model_validator
from typing import List, Optional, Any, Dict
from datetime import datetime, timezone
import uuid

from config.database import db
from modules.auth.api.auth_routes import get_current_user

router = APIRouter(tags=["Validation Rules"])


class ValidationCondition(BaseModel):
    """Single condition in a validation rule"""
    field: Optional[str] = None
    field_name: Optional[str] = None  # Alias from frontend
    operator: str  # equals, not_equals, greater_than, less_than, contains, is_blank, is_not_blank
    value: Optional[Any] = None
    logic: Optional[str] = "AND"  # AND, OR for combining conditions
    
    @model_validator(mode='after')
    def normalize_field(self):
        # Use field_name if field is not set
        if not self.field and self.field_name:
            self.field = self.field_name
        return self


class ValidationRuleCreate(BaseModel):
    """Create validation rule request"""
    name: Optional[str] = None
    rule_name: Optional[str] = None  # Alias from frontend
    description: Optional[str] = None
    is_active: bool = True
    error_message: str
    error_location: Optional[str] = "top"  # top, field, page
    error_field: Optional[str] = None  # For field-level errors
    formula_expression: Optional[str] = None  # Formula-based condition
    conditions: Optional[List[ValidationCondition]] = []  # UI-based conditions
    logic_operator: Optional[str] = "AND"  # AND/OR for combining conditions
    
    @model_validator(mode='after')
    def normalize_name(self):
        # Use rule_name if name is not set
        if not self.name and self.rule_name:
            self.name = self.rule_name
        # Normalize error_location
        if self.error_location == "page":
            self.error_location = "top"
        return self


class ValidationRuleUpdate(BaseModel):
    """Update validation rule request"""
    name: Optional[str] = None
    rule_name: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None
    error_message: Optional[str] = None
    error_location: Optional[str] = None
    error_field: Optional[str] = None
    formula_expression: Optional[str] = None
    conditions: Optional[List[ValidationCondition]] = None
    logic_operator: Optional[str] = None
    
    @model_validator(mode='after')
    def normalize_name(self):
        if not self.name and self.rule_name:
            self.name = self.rule_name
        return self


@router.get("/validation-rules/{object_name}")
async def get_validation_rules(
    object_name: str,
    current_user = Depends(get_current_user)
):
    """Get all validation rules for an object"""
    rules = await db.validation_rules.find({
        "object_name": object_name,
        "tenant_id": current_user.tenant_id
    }, {"_id": 0}).to_list(None)
    
    return rules or []


@router.post("/validation-rules/{object_name}")
async def create_validation_rule(
    object_name: str,
    rule_data: ValidationRuleCreate,
    current_user = Depends(get_current_user)
):
    """Create a new validation rule"""
    # Verify object exists
    obj = await db.tenant_objects.find_one({
        "tenant_id": current_user.tenant_id,
        "object_name": object_name
    })
    if not obj:
        raise HTTPException(status_code=404, detail=f"Object '{object_name}' not found")
    
    # Normalize conditions - convert to consistent format
    normalized_conditions = []
    if rule_data.conditions:
        for c in rule_data.conditions:
            normalized_conditions.append({
                "field_name": c.field or c.field_name,
                "operator": c.operator,
                "value": c.value,
                "logic": c.logic
            })
    
    rule = {
        "id": str(uuid.uuid4()),
        "object_name": object_name,
        "tenant_id": current_user.tenant_id,
        "rule_name": rule_data.name,  # Store as rule_name for frontend compatibility
        "name": rule_data.name,
        "description": rule_data.description,
        "is_active": rule_data.is_active,
        "error_message": rule_data.error_message,
        "error_location": rule_data.error_location,
        "error_field": rule_data.error_field,
        "formula_expression": rule_data.formula_expression,
        "conditions": normalized_conditions,
        "logic_operator": rule_data.logic_operator or "AND",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "created_by": current_user.id
    }
    
    await db.validation_rules.insert_one(rule)
    
    # Return without _id - include both name formats for frontend compatibility
    return {
        "id": rule["id"],
        "object_name": rule["object_name"],
        "name": rule["name"],
        "rule_name": rule["rule_name"],
        "description": rule["description"],
        "is_active": rule["is_active"],
        "error_message": rule["error_message"],
        "error_location": rule["error_location"],
        "formula_expression": rule["formula_expression"],
        "conditions": rule["conditions"],
        "logic_operator": rule["logic_operator"],
        "created_at": rule["created_at"]
    }


@router.put("/validation-rules/{object_name}/{rule_id}")
async def update_validation_rule(
    object_name: str,
    rule_id: str,
    rule_data: ValidationRuleUpdate,
    current_user = Depends(get_current_user)
):
    """Update a validation rule"""
    # Check if rule exists
    existing = await db.validation_rules.find_one({
        "id": rule_id,
        "object_name": object_name,
        "tenant_id": current_user.tenant_id
    })
    
    if not existing:
        raise HTTPException(status_code=404, detail="Validation rule not found")
    
    # Build update
    update_fields = {"updated_at": datetime.now(timezone.utc).isoformat()}
    
    # Handle both name and rule_name
    if rule_data.name is not None:
        update_fields["name"] = rule_data.name
        update_fields["rule_name"] = rule_data.name
    if rule_data.description is not None:
        update_fields["description"] = rule_data.description
    if rule_data.is_active is not None:
        update_fields["is_active"] = rule_data.is_active
    if rule_data.error_message is not None:
        update_fields["error_message"] = rule_data.error_message
    if rule_data.error_location is not None:
        update_fields["error_location"] = rule_data.error_location
    if rule_data.error_field is not None:
        update_fields["error_field"] = rule_data.error_field
    if rule_data.formula_expression is not None:
        update_fields["formula_expression"] = rule_data.formula_expression
    if rule_data.logic_operator is not None:
        update_fields["logic_operator"] = rule_data.logic_operator
    if rule_data.conditions is not None:
        # Normalize conditions
        normalized_conditions = []
        for c in rule_data.conditions:
            normalized_conditions.append({
                "field_name": c.field or c.field_name,
                "operator": c.operator,
                "value": c.value,
                "logic": c.logic
            })
        update_fields["conditions"] = normalized_conditions
    
    await db.validation_rules.update_one(
        {"id": rule_id, "tenant_id": current_user.tenant_id},
        {"$set": update_fields}
    )
    
    # Return updated rule
    updated = await db.validation_rules.find_one({
        "id": rule_id,
        "tenant_id": current_user.tenant_id
    }, {"_id": 0})
    
    return updated


@router.delete("/validation-rules/{object_name}/{rule_id}")
async def delete_validation_rule(
    object_name: str,
    rule_id: str,
    current_user = Depends(get_current_user)
):
    """Delete a validation rule"""
    result = await db.validation_rules.delete_one({
        "id": rule_id,
        "object_name": object_name,
        "tenant_id": current_user.tenant_id
    })
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Validation rule not found")
    
    return {"message": "Validation rule deleted successfully"}


@router.get("/validation-rules/{object_name}/available-fields")
async def get_available_fields(
    object_name: str,
    include_parent: bool = Query(True, description="Include parent lookup fields"),
    depth: int = Query(1, description="Depth of lookup traversal"),
    current_user = Depends(get_current_user)
):
    """Get available fields for validation rule conditions, including parent lookup fields"""
    # Get the object definition
    obj = await db.tenant_objects.find_one({
        "tenant_id": current_user.tenant_id,
        "object_name": object_name
    })
    
    if not obj:
        raise HTTPException(status_code=404, detail=f"Object '{object_name}' not found")
    
    fields = []
    
    # Add direct fields
    obj_fields = obj.get("fields", {})
    if isinstance(obj_fields, dict):
        for field_name, field_def in obj_fields.items():
            fields.append({
                "name": field_name,
                "api_name": field_name,  # Frontend expects api_name
                "label": field_def.get("label", field_name),
                "type": field_def.get("type", "text"),
                "field_type": field_def.get("type", "text"),  # Frontend expects field_type
                "full_path": field_name,
                "is_parent": False,  # Frontend expects is_parent
                "is_parent_field": False,
                "options": field_def.get("options", [])
            })
    
    # Add parent lookup fields if requested
    if include_parent and depth > 0:
        for field_name, field_def in obj_fields.items() if isinstance(obj_fields, dict) else []:
            if field_def.get("type") == "lookup":
                related_object = field_def.get("related_object")
                if related_object:
                    # Get related object's fields
                    related_obj = await db.tenant_objects.find_one({
                        "tenant_id": current_user.tenant_id,
                        "object_name": related_object
                    })
                    
                    if related_obj:
                        related_fields = related_obj.get("fields", {})
                        if isinstance(related_fields, dict):
                            for rel_field_name, rel_field_def in related_fields.items():
                                fields.append({
                                    "name": f"{field_name}.{rel_field_name}",
                                    "api_name": rel_field_name,  # Frontend expects api_name
                                    "label": f"{field_def.get('label', field_name)} > {rel_field_def.get('label', rel_field_name)}",
                                    "type": rel_field_def.get("type", "text"),
                                    "field_type": rel_field_def.get("type", "text"),  # Frontend expects field_type
                                    "full_path": f"{field_name}.{rel_field_name}",
                                    "is_parent": True,  # Frontend expects is_parent
                                    "is_parent_field": True,
                                    "parent_object": related_object,
                                    "options": rel_field_def.get("options", [])
                                })
    
    return fields
