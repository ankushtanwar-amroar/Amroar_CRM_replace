"""
Validation Rules Service for Task Manager
Handles validation rule evaluation and enforcement
"""
import logging
from typing import Dict, Any, Optional, List, Tuple
from datetime import datetime, timezone
import uuid
import re

logger = logging.getLogger(__name__)


class ValidationError(Exception):
    """Custom exception for validation failures"""
    def __init__(self, rule_name: str, error_message: str, field: Optional[str] = None):
        self.rule_name = rule_name
        self.error_message = error_message
        self.field = field
        super().__init__(error_message)


class ValidationService:
    """
    Service for evaluating validation rules on tasks.
    
    Rule structure:
    {
        "id": "uuid",
        "name": "Rule Name",
        "description": "Description",
        "is_active": true,
        "conditions": [
            {
                "field": "priority" | "status" | "cf_field_name",
                "operator": "equals" | "not_equals" | "is_empty" | "is_not_empty" | 
                           "greater_than" | "less_than" | "contains",
                "value": "any"
            }
        ],
        "condition_logic": "all" | "any",  // AND or OR
        "error_message": "Error to show user",
        "target_field": "field_name"  // Optional, for inline errors
    }
    """
    
    SUPPORTED_OPERATORS = [
        "equals",
        "not_equals",
        "is_empty",
        "is_not_empty",
        "greater_than",
        "less_than",
        "greater_than_or_equal",
        "less_than_or_equal",
        "contains",
        "not_contains"
    ]
    
    TASK_FIELDS = ["priority", "status", "title", "description", "task_type", "due_date"]
    
    def __init__(self, db):
        self.db = db
    
    def evaluate_condition(
        self,
        condition: Dict[str, Any],
        task_data: Dict[str, Any],
        custom_fields: Dict[str, Any]
    ) -> bool:
        """
        Evaluate a single condition against task data.
        Returns True if condition is MET (task passes this check).
        """
        field = condition.get("field", "")
        operator = condition.get("operator", "")
        expected_value = condition.get("value")
        
        # Get the actual value
        if field.startswith("cf_"):
            # Custom field
            actual_value = custom_fields.get(field)
        elif field in self.TASK_FIELDS:
            # Task field
            actual_value = task_data.get(field)
        else:
            # Unknown field, treat as not matching
            return True
        
        # Evaluate based on operator
        try:
            if operator == "equals":
                return actual_value == expected_value
            
            elif operator == "not_equals":
                return actual_value != expected_value
            
            elif operator == "is_empty":
                return actual_value is None or actual_value == "" or actual_value == []
            
            elif operator == "is_not_empty":
                return actual_value is not None and actual_value != "" and actual_value != []
            
            elif operator == "greater_than":
                if actual_value is None:
                    return False
                return float(actual_value) > float(expected_value)
            
            elif operator == "less_than":
                if actual_value is None:
                    return False
                return float(actual_value) < float(expected_value)
            
            elif operator == "greater_than_or_equal":
                if actual_value is None:
                    return False
                return float(actual_value) >= float(expected_value)
            
            elif operator == "less_than_or_equal":
                if actual_value is None:
                    return False
                return float(actual_value) <= float(expected_value)
            
            elif operator == "contains":
                if actual_value is None:
                    return False
                return str(expected_value).lower() in str(actual_value).lower()
            
            elif operator == "not_contains":
                if actual_value is None:
                    return True
                return str(expected_value).lower() not in str(actual_value).lower()
            
            else:
                logger.warning(f"Unknown operator: {operator}")
                return True
                
        except (ValueError, TypeError) as e:
            logger.warning(f"Error evaluating condition: {e}")
            return True
    
    def evaluate_rule(
        self,
        rule: Dict[str, Any],
        task_data: Dict[str, Any],
        custom_fields: Dict[str, Any]
    ) -> Tuple[bool, Optional[str]]:
        """
        Evaluate a validation rule against task data.
        
        The rule fires (blocks save) if:
        - condition_logic is "all": ALL conditions are TRUE
        - condition_logic is "any": ANY condition is TRUE
        
        Returns (passes_validation, error_message_if_fails)
        """
        conditions = rule.get("conditions", [])
        condition_logic = rule.get("condition_logic", "all")
        
        if not conditions:
            return True, None
        
        # Evaluate each condition
        results = []
        for condition in conditions:
            result = self.evaluate_condition(condition, task_data, custom_fields)
            results.append(result)
        
        # Determine if rule fires based on logic
        if condition_logic == "all":
            rule_fires = all(results)
        else:  # "any"
            rule_fires = any(results)
        
        # If rule fires, validation FAILS
        if rule_fires:
            return False, rule.get("error_message", "Validation failed")
        
        return True, None
    
    async def validate_task(
        self,
        task_data: Dict[str, Any],
        custom_fields: Dict[str, Any],
        tenant_id: str,
        project_id: Optional[str] = None
    ) -> Tuple[bool, List[Dict[str, Any]]]:
        """
        Validate a task against all active validation rules.
        
        Returns (is_valid, list_of_errors)
        """
        # Get active validation rules
        query = {
            "tenant_id": tenant_id,
            "is_active": True
        }
        
        if project_id:
            query["$or"] = [
                {"scope": "global"},
                {"project_id": project_id}
            ]
        else:
            query["scope"] = "global"
        
        rules = await self.db.tm_validation_rules.find(
            query, {"_id": 0}
        ).sort("order_index", 1).to_list(100)
        
        errors = []
        
        for rule in rules:
            passes, error_message = self.evaluate_rule(rule, task_data, custom_fields)
            
            if not passes:
                errors.append({
                    "rule_id": rule.get("id"),
                    "rule_name": rule.get("name"),
                    "error_message": error_message,
                    "target_field": rule.get("target_field")
                })
                
                # Log the validation failure
                await self.log_validation_failure(
                    tenant_id=tenant_id,
                    task_data=task_data,
                    rule=rule,
                    error_message=error_message
                )
        
        return len(errors) == 0, errors
    
    async def log_validation_failure(
        self,
        tenant_id: str,
        task_data: Dict[str, Any],
        rule: Dict[str, Any],
        error_message: str
    ):
        """Log a validation failure for auditing"""
        log_entry = {
            "id": str(uuid.uuid4()),
            "tenant_id": tenant_id,
            "task_id": task_data.get("id"),
            "task_title": task_data.get("title"),
            "rule_id": rule.get("id"),
            "rule_name": rule.get("name"),
            "error_message": error_message,
            "task_data_snapshot": {
                "status": task_data.get("status"),
                "priority": task_data.get("priority"),
                "task_type": task_data.get("task_type")
            },
            "created_at": datetime.now(timezone.utc)
        }
        
        await self.db.tm_validation_logs.insert_one(log_entry)
    
    async def get_validation_logs(
        self,
        tenant_id: str,
        rule_id: Optional[str] = None,
        task_id: Optional[str] = None,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """Get validation failure logs"""
        query = {"tenant_id": tenant_id}
        
        if rule_id:
            query["rule_id"] = rule_id
        if task_id:
            query["task_id"] = task_id
        
        logs = await self.db.tm_validation_logs.find(
            query, {"_id": 0}
        ).sort("created_at", -1).limit(limit).to_list(limit)
        
        return logs
