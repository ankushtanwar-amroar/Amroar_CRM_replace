"""
Records Module Services
Business logic for record operations.
"""
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
import logging
import re

from config.database import db

logger = logging.getLogger(__name__)


def parse_from_mongo(data):
    """Convert ISO strings back to datetime objects"""
    if isinstance(data, dict):
        parsed_data = {}
        for key, value in data.items():
            if key in ['created_at', 'updated_at'] and isinstance(value, str):
                try:
                    parsed_data[key] = datetime.fromisoformat(value)
                except:
                    parsed_data[key] = value
            elif isinstance(value, dict):
                parsed_data[key] = parse_from_mongo(value)
            else:
                parsed_data[key] = value
        return parsed_data
    return data


def prepare_for_mongo(data):
    """Convert datetime objects to ISO strings for MongoDB"""
    if isinstance(data, dict):
        prepared_data = {}
        for key, value in data.items():
            if isinstance(value, datetime):
                prepared_data[key] = value.isoformat()
            elif isinstance(value, dict):
                prepared_data[key] = prepare_for_mongo(value)
            else:
                prepared_data[key] = value
        return prepared_data
    return data


async def generate_series_id(tenant_id: str, object_name: str, record_id: str) -> str:
    """
    Generate series_id using UUID-based format: prefix-{last_part_of_uuid}
    Format: con-de25b44ff61c, led-de25b44ff61c, etc.
    """
    import random
    import string
    
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
    uuid_suffix = record_id.split('-')[-1]
    series_id = f"{prefix}-{uuid_suffix}"
    
    # Check for uniqueness
    existing = await db.object_records.find_one({
        "tenant_id": tenant_id,
        "object_name": object_name,
        "series_id": series_id
    })
    
    if existing:
        random_suffix = ''.join(random.choices(string.ascii_lowercase + string.digits, k=4))
        series_id = f"{prefix}-{uuid_suffix}-{random_suffix}"
    
    return series_id


async def evaluate_formula_fields_for_record(
    tenant_id: str,
    object_name: str,
    record_data: Dict[str, Any],
    record_id: Optional[str] = None
) -> Dict[str, Any]:
    """
    Evaluate all formula and rollup fields for a record and add them to the record's data.
    
    Formula fields are calculated at runtime using the formula expression.
    Rollup fields should already be stored on the record, but if missing, we calculate them on-the-fly.
    """
    from modules.field_management.services.formula_service import FormulaEngine
    
    # Get all advanced fields (both formula and rollup)
    advanced_fields = await db.advanced_fields.find({
        "tenant_id": tenant_id,
        "object_name": object_name,
        "is_active": True,
        "field_type": {"$in": ["formula", "rollup"]}
    }, {"_id": 0}).to_list(100)
    
    if not advanced_fields:
        return record_data
    
    enhanced_data = dict(record_data)
    engine = FormulaEngine(blank_as_zero=True)
    
    # Process formula fields
    formula_fields = [f for f in advanced_fields if f.get("field_type") == "formula"]
    for formula_field in formula_fields:
        try:
            expression = formula_field.get("expression", "")
            api_key = formula_field.get("api_key", "")
            return_type = formula_field.get("return_type", "Text")
            decimal_places = formula_field.get("decimal_places", 2)
            blank_as_zero = formula_field.get("blank_as_zero", True)
            
            engine.blank_as_zero = blank_as_zero
            result, error = engine.evaluate(expression, record_data)
            
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
    
    # Process rollup fields - calculate on-the-fly if value is missing
    rollup_fields = [f for f in advanced_fields if f.get("field_type") == "rollup"]
    for rollup_field in rollup_fields:
        try:
            api_key = rollup_field.get("api_key", "")
            
            # Check if rollup value is already stored on the record
            if api_key in enhanced_data and enhanced_data[api_key] is not None:
                # Value already exists, skip calculation
                continue
            
            # Calculate rollup value on-the-fly
            parent_id = record_id or record_data.get("id")
            if parent_id:
                rollup_value = await calculate_rollup_value(
                    tenant_id=tenant_id,
                    rollup_config=rollup_field,
                    parent_id=parent_id
                )
                enhanced_data[api_key] = rollup_value
                logger.debug(f"Calculated rollup {api_key}={rollup_value} for record {parent_id}")
            else:
                enhanced_data[api_key] = 0
        except Exception as e:
            logger.warning(f"Rollup evaluation error for {rollup_field.get('api_key', '')}: {str(e)}")
            enhanced_data[rollup_field.get("api_key", "")] = 0
    
    return enhanced_data


async def calculate_rollup_value(
    tenant_id: str,
    rollup_config: Dict[str, Any],
    parent_id: str
) -> Any:
    """
    Calculate rollup value for a parent record.
    This is a simplified version of the RollupFieldService.calculate_rollup method.
    """
    child_object = rollup_config.get("child_object")
    relationship_field = rollup_config.get("relationship_field")
    rollup_type = rollup_config.get("rollup_type", "COUNT")
    summarize_field = rollup_config.get("summarize_field")
    decimal_places = rollup_config.get("decimal_places", 2)
    
    if not child_object or not relationship_field:
        return 0
    
    # Build match query - check both root level and data.field for relationship
    match_query = {
        "object_name": child_object,
        "$or": [
            {relationship_field: parent_id},
            {f"data.{relationship_field}": parent_id}
        ],
        "tenant_id": tenant_id
    }
    
    # Apply filter if configured
    filter_config = rollup_config.get("filter_config", {})
    if filter_config and filter_config.get("is_enabled") and filter_config.get("rules"):
        filter_query = _build_rollup_filter_query(filter_config)
        match_query.update(filter_query)
    
    try:
        if rollup_type.upper() == "COUNT":
            count = await db.object_records.count_documents(match_query)
            return count
        
        # For SUM, MIN, MAX, AVG - use aggregation
        summarize_field_path = f"data.{summarize_field}"
        pipeline = [{"$match": match_query}]
        
        # Add numeric conversion
        pipeline.append({
            "$addFields": {
                "numeric_value": {
                    "$cond": {
                        "if": {"$isNumber": f"${summarize_field_path}"},
                        "then": f"${summarize_field_path}",
                        "else": {"$toDouble": {"$ifNull": [f"${summarize_field_path}", 0]}}
                    }
                }
            }
        })
        
        if rollup_type.upper() == "SUM":
            pipeline.append({"$group": {"_id": None, "result": {"$sum": "$numeric_value"}}})
        elif rollup_type.upper() == "MIN":
            pipeline.append({"$group": {"_id": None, "result": {"$min": "$numeric_value"}}})
        elif rollup_type.upper() == "MAX":
            pipeline.append({"$group": {"_id": None, "result": {"$max": "$numeric_value"}}})
        elif rollup_type.upper() in ["AVG", "AVERAGE"]:
            pipeline.append({"$group": {"_id": None, "result": {"$avg": "$numeric_value"}}})
        else:
            return 0
        
        result = await db.object_records.aggregate(pipeline).to_list(1)
        if result and len(result) > 0:
            value = result[0].get("result", 0)
            if value is not None:
                return round(value, decimal_places)
        return 0
        
    except Exception as e:
        logger.warning(f"Error calculating rollup: {str(e)}")
        return 0


def _build_rollup_filter_query(filter_config: Dict[str, Any]) -> Dict[str, Any]:
    """Build MongoDB query from rollup filter config"""
    rules = filter_config.get("rules", [])
    logic = filter_config.get("logic", "AND")
    
    if not rules:
        return {}
    
    conditions = []
    for rule in rules:
        field = rule.get("field", "")
        value = rule.get("value")
        operator = rule.get("operator", "EQUALS")
        
        # Field might be in data.field format
        field_path = f"data.{field}" if not field.startswith("data.") else field
        
        if operator == "EQUALS":
            conditions.append({field_path: value})
        elif operator == "NOT_EQUALS":
            conditions.append({field_path: {"$ne": value}})
        elif operator == "CONTAINS":
            conditions.append({field_path: {"$regex": str(value), "$options": "i"}})
        elif operator == "GREATER_THAN":
            conditions.append({field_path: {"$gt": value}})
        elif operator == "LESS_THAN":
            conditions.append({field_path: {"$lt": value}})
        elif operator == "GREATER_OR_EQUAL":
            conditions.append({field_path: {"$gte": value}})
        elif operator == "LESS_OR_EQUAL":
            conditions.append({field_path: {"$lte": value}})
        elif operator == "IN":
            conditions.append({field_path: {"$in": value if isinstance(value, list) else [value]}})
        elif operator == "IS_NULL":
            conditions.append({field_path: None})
        elif operator == "IS_NOT_NULL":
            conditions.append({field_path: {"$ne": None}})
    
    if not conditions:
        return {}
    
    if logic.upper() == "OR":
        return {"$or": conditions}
    return {"$and": conditions}


async def get_subordinate_user_ids(current_user) -> List[str]:
    """Get list of user IDs for all subordinates in the role hierarchy."""
    subordinate_ids = []
    
    if not current_user.role_id:
        return subordinate_ids
    
    current_role = await db.roles.find_one({"id": current_user.role_id}, {"_id": 0})
    if not current_role:
        return subordinate_ids
    
    async def get_children(role_id: str):
        children = await db.roles.find({
            "tenant_id": current_user.tenant_id,
            "parent_role_id": role_id
        }, {"_id": 0}).to_list(None)
        
        child_ids = []
        for child in children:
            users = await db.users.find({
                "tenant_id": current_user.tenant_id,
                "role_id": child["id"]
            }, {"_id": 0, "id": 1}).to_list(None)
            child_ids.extend([u["id"] for u in users])
            grandchildren = await get_children(child["id"])
            child_ids.extend(grandchildren)
        return child_ids
    
    subordinate_ids = await get_children(current_user.role_id)
    return subordinate_ids


async def log_audit_event(
    tenant_id: str,
    event_type: str,
    action: str,
    actor_user_id: str = None,
    actor_email: str = None,
    target_user_id: str = None,
    target_email: str = None,
    object_name: str = None,
    record_id: str = None,
    details: Dict[str, Any] = None,
    ip_address: str = None
):
    """Log audit event to database"""
    import uuid
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
            "details": details,
            "ip_address": ip_address,
            "timestamp": datetime.now(timezone.utc)
        }
        await db.audit_events.insert_one(audit_event)
    except Exception as e:
        logger.warning(f"Failed to log audit event: {str(e)}")
