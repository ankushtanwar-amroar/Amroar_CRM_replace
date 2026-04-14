"""
Record-related shared services
"""
from typing import Dict, Any, Optional, List
from datetime import datetime, timezone
import logging
import uuid
import re

from shared.database import db
from shared.models import User

logger = logging.getLogger(__name__)


async def generate_series_id(tenant_id: str, object_name: str, record_id: str) -> str:
    """
    Generate series_id using UUID-based format: prefix-{last_part_of_uuid}
    Format: con-de25b44ff61c, led-de25b44ff61c, etc.
    """
    import random
    import string
    
    # Define prefixes for each object type
    prefix_map = {
        "lead": "led",
        "task": "tsk",
        "contact": "con",
        "event": "evt",
        "opportunity": "opp",
        "account": "acc",
        "note": "not",
        "call": "cal"
    }
    
    prefix = prefix_map.get(object_name.lower(), "rec")
    
    # Extract last part of UUID (after last dash)
    uuid_suffix = record_id.split('-')[-1]
    
    # Generate base series_id
    series_id = f"{prefix}-{uuid_suffix}"
    
    # Check for uniqueness - if exists, append random suffix
    existing = await db.object_records.find_one({
        "tenant_id": tenant_id,
        "object_name": object_name,
        "series_id": series_id
    })
    
    if existing:
        # Generate 4-character random suffix
        random_suffix = ''.join(random.choices(string.ascii_lowercase + string.digits, k=4))
        series_id = f"{prefix}-{uuid_suffix}-{random_suffix}"
    
    return series_id


async def evaluate_formula_fields_for_record(
    tenant_id: str,
    object_name: str,
    record_data: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Evaluate all formula fields for a record and add them to the record's data.
    Formula fields are computed on-the-fly at read time (like Salesforce).
    """
    from modules.field_management.services.formula_service import FormulaEngine
    from shared.parent_field_resolver import ParentFieldResolver
    import re
    
    # Get all active formula fields for this object
    formula_fields = await db.advanced_fields.find({
        "tenant_id": tenant_id,
        "object_name": object_name,
        "field_type": "formula",
        "is_active": True
    }, {"_id": 0}).to_list(100)
    
    if not formula_fields:
        return record_data
    
    # Create a copy of record_data to avoid mutation
    enhanced_data = dict(record_data)
    
    # Collect all parent field references from all formulas
    parent_field_paths = set()
    parent_pattern = r'\b([A-Z][a-zA-Z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)\b'
    
    for formula_field in formula_fields:
        expression = formula_field.get("expression", "")
        matches = re.findall(parent_pattern, expression)
        for parent_obj, field_name in matches:
            if parent_obj.upper() not in ['IF', 'AND', 'OR', 'NOT', 'ABS', 'ROUND', 'FLOOR', 'CEILING', 
                                           'MAX', 'MIN', 'LEFT', 'RIGHT', 'LEN', 'LOWER', 'UPPER',
                                           'CONTAINS', 'TEXT', 'TRIM', 'SUBSTITUTE', 'ISBLANK',
                                           'TODAY', 'NOW', 'YEAR', 'MONTH', 'DAY']:
                parent_field_paths.add(f"{parent_obj}.{field_name}")
    
    # Resolve parent field values if any references found
    parent_values = {}
    if parent_field_paths:
        try:
            resolver = ParentFieldResolver(db, tenant_id)
            parent_values = await resolver.resolve_parent_fields(
                object_name, record_data, list(parent_field_paths)
            )
        except Exception as e:
            logger.warning(f"Error resolving parent fields for formula: {e}")
    
    # Evaluate each formula field
    engine = FormulaEngine(blank_as_zero=True)
    
    for formula_field in formula_fields:
        try:
            expression = formula_field.get("expression", "")
            api_key = formula_field.get("api_key", "")
            return_type = formula_field.get("return_type", "Text")
            decimal_places = formula_field.get("decimal_places", 2)
            blank_as_zero = formula_field.get("blank_as_zero", True)
            
            engine.blank_as_zero = blank_as_zero
            
            # Substitute parent field references
            substituted_expr = expression
            for parent_path, value in parent_values.items():
                formatted_value = engine._format_value(value)
                substituted_expr = re.sub(
                    rf'\b{re.escape(parent_path)}\b',
                    formatted_value,
                    substituted_expr,
                    flags=re.IGNORECASE
                )
            
            # Evaluate the formula
            result, error = engine.evaluate(substituted_expr, record_data)
            
            if error is None:
                if return_type in ['Number', 'Currency', 'Percent']:
                    try:
                        result = round(float(result), decimal_places)
                    except (ValueError, TypeError):
                        result = 0 if blank_as_zero else None
                elif return_type == 'Boolean':
                    result = bool(result) if result is not None else False
                        
                enhanced_data[api_key] = result
            else:
                enhanced_data[api_key] = None
                
        except Exception as e:
            logger.warning(f"Formula evaluation error for {api_key}: {str(e)}")
            enhanced_data[formula_field.get("api_key", "")] = None
    
    return enhanced_data


async def evaluate_validation_rules(
    tenant_id: str,
    object_name: str,
    record_data: dict
) -> tuple:
    """
    Evaluate all active validation rules for an object.
    """
    try:
        # Get all active validation rules for this object
        rules = await db.validation_rules.find({
            "tenant_id": tenant_id,
            "object_name": object_name,
            "is_active": True
        }).to_list(100)
        
        # Collect all parent field paths
        parent_field_paths = []
        for rule in rules:
            for condition in rule.get("conditions", []):
                field_name = condition.get("field_name", "")
                if "." in field_name:
                    parent_field_paths.append(field_name)
        
        # Resolve parent fields if any
        resolved_parent_data = {}
        if parent_field_paths:
            from shared.parent_field_resolver import ParentFieldResolver
            resolver = ParentFieldResolver(db, tenant_id)
            resolved_parent_data = await resolver.resolve_parent_fields(
                object_name, record_data, parent_field_paths
            )
        
        for rule in rules:
            # Evaluate conditions
            conditions = rule.get("conditions", [])
            logic_operator = rule.get("logic_operator", "AND")
            
            if not conditions:
                continue
            
            results = []
            for condition in conditions:
                field_name = condition.get("field_name")
                operator = condition.get("operator")
                expected_value = condition.get("value")
                
                if "." in field_name:
                    actual_value = resolved_parent_data.get(field_name)
                    if actual_value is None:
                        field_lower = field_name.lower()
                        for key, val in resolved_parent_data.items():
                            if key.lower() == field_lower:
                                actual_value = val
                                break
                else:
                    actual_value = record_data.get(field_name)
                
                # Evaluate condition
                result = False
                if operator == "equals":
                    result = str(actual_value).lower() == str(expected_value).lower() if actual_value is not None else expected_value is None
                elif operator == "not_equals":
                    result = str(actual_value).lower() != str(expected_value).lower() if actual_value is not None else expected_value is not None
                elif operator == "contains":
                    result = str(expected_value).lower() in str(actual_value).lower() if actual_value else False
                elif operator == "greater_than":
                    try:
                        result = float(actual_value) > float(expected_value)
                    except (ValueError, TypeError):
                        result = False
                elif operator == "less_than":
                    try:
                        result = float(actual_value) < float(expected_value)
                    except (ValueError, TypeError):
                        result = False
                elif operator == "is_empty":
                    result = not actual_value or actual_value == ""
                elif operator == "is_not_empty":
                    result = actual_value and actual_value != ""
                elif operator == "starts_with":
                    result = str(actual_value).lower().startswith(str(expected_value).lower()) if actual_value else False
                elif operator == "ends_with":
                    result = str(actual_value).lower().endswith(str(expected_value).lower()) if actual_value else False
                
                results.append(result)
            
            # Apply AND/OR logic
            if logic_operator == "AND":
                rule_passes = all(results)
            else:  # OR
                rule_passes = any(results)
            
            if rule_passes:
                error_info = {
                    "message": rule.get("error_message", "Validation rule failed"),
                    "error_location": rule.get("error_location", "page"),
                    "error_field": rule.get("error_field"),
                    "rule_name": rule.get("rule_name")
                }
                return False, error_info
        
        return True, None
        
    except Exception as e:
        logger.error(f"Error evaluating validation rules: {str(e)}")
        return True, None


async def log_audit_event(
    tenant_id: str,
    event_type: str,
    action: str,
    actor_user_id: Optional[str] = None,
    actor_email: Optional[str] = None,
    target_user_id: Optional[str] = None,
    target_email: Optional[str] = None,
    object_name: Optional[str] = None,
    record_id: Optional[str] = None,
    details: Optional[Dict[str, Any]] = None,
    ip_address: Optional[str] = None
):
    """Log audit event to database."""
    try:
        audit_event = {
            "id": str(uuid.uuid4()),
            "tenant_id": tenant_id,
            "event_type": event_type,
            "action": action,
            "actor_user_id": actor_user_id,
            "actor_email": actor_email,
            "target_user_id": target_user_id,
            "target_email": target_email,
            "object_name": object_name,
            "record_id": record_id,
            "details": details or {},
            "ip_address": ip_address,
            "timestamp": datetime.now(timezone.utc)
        }
        await db.audit_events.insert_one(audit_event)
    except Exception as e:
        logger.error(f"Failed to log audit event: {str(e)}")


async def get_subordinate_user_ids(current_user: User) -> List[str]:
    """Get all subordinate users in role hierarchy."""
    try:
        if not current_user.role_id:
            return []
        
        current_role = await db.roles.find_one({"id": current_user.role_id}, {"_id": 0})
        if not current_role:
            return []
        
        subordinate_roles = []
        async def get_child_roles(parent_id):
            children = await db.roles.find({"parent_role_id": parent_id}, {"_id": 0}).to_list(100)
            for child in children:
                subordinate_roles.append(child["id"])
                await get_child_roles(child["id"])
        
        await get_child_roles(current_user.role_id)
        
        if not subordinate_roles:
            return []
        
        subordinate_users = await db.users.find({
            "tenant_id": current_user.tenant_id,
            "role_id": {"$in": subordinate_roles}
        }, {"_id": 0, "id": 1}).to_list(1000)
        
        return [user["id"] for user in subordinate_users]
    except Exception as e:
        logger.error(f"Error getting subordinates: {str(e)}")
        return []


async def check_permission(
    current_user: User,
    object_name: str,
    action: str
) -> bool:
    """Check if user has permission to perform action on object."""
    from fastapi import HTTPException
    try:
        if not current_user.role_id:
            return True
        
        permission_set = await db.permission_sets.find_one(
            {"role_id": current_user.role_id},
            {"_id": 0}
        )
        
        if not permission_set:
            return True
        
        object_permission = None
        for perm in permission_set.get("permissions", []):
            if perm.get("object_name") == object_name:
                object_permission = perm
                break
        
        if not object_permission:
            return True
        
        has_permission = object_permission.get(action, False)
        if not has_permission:
            action_name = action.capitalize()
            raise HTTPException(
                status_code=403,
                detail=f"Access denied. You don't have permission to {action_name} {object_name} records."
            )
        
        return True
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error checking permission: {str(e)}")
        return True
