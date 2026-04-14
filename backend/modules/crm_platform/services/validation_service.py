from typing import Dict, Any, List
import re

class ValidationService:
    """Service to execute validation rules"""
    
    @staticmethod
    def evaluate_expression(expression: str, record: Dict[str, Any]) -> bool:
        """
        Evaluate a validation expression
        Expression examples:
        - "fields.Status === 'Qualified' && !fields.Email"
        - "fields.Amount > 10000"
        - "fields.Email.includes('@')"
        """
        try:
            # Simple expression evaluator
            # Replace fields.X with record values
            eval_expr = expression
            
            # Find all field references
            field_refs = re.findall(r'fields\.(\w+)', expression)
            
            for field in field_refs:
                value = record.get(field)
                
                # Convert to JavaScript-like evaluation
                if value is None:
                    eval_expr = eval_expr.replace(f'fields.{field}', 'None')
                elif isinstance(value, str):
                    eval_expr = eval_expr.replace(f'fields.{field}', f"'{value}'")
                elif isinstance(value, bool):
                    eval_expr = eval_expr.replace(f'fields.{field}', str(value))
                else:
                    eval_expr = eval_expr.replace(f'fields.{field}', str(value))
            
            # Convert JS operators to Python
            eval_expr = eval_expr.replace('===', '==')
            eval_expr = eval_expr.replace('!==', '!=')
            eval_expr = eval_expr.replace('&&', ' and ')
            eval_expr = eval_expr.replace('||', ' or ')
            eval_expr = eval_expr.replace('!', ' not ')
            
            # Evaluate
            result = eval(eval_expr)
            return bool(result)
            
        except Exception as e:
            print(f"Validation expression error: {str(e)}")
            return False
    
    @staticmethod
    async def validate_record(record: Dict[str, Any], validation_rules: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Validate a record against rules
        Returns: {"valid": bool, "errors": [error messages]}
        """
        errors = []
        
        for rule in validation_rules:
            if not rule.get("is_active", True):
                continue
            
            expression = rule.get("formula_expression", "")
            error_message = rule.get("error_message", "Validation failed")
            
            # If expression evaluates to True, validation fails (error condition)
            if ValidationService.evaluate_expression(expression, record):
                errors.append({
                    "rule_name": rule.get("name"),
                    "message": error_message
                })
        
        return {
            "valid": len(errors) == 0,
            "errors": errors
        }
    
    @staticmethod
    def validate_required_fields(record: Dict[str, Any], field_configs: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Validate required fields"""
        errors = []
        
        for field_config in field_configs:
            if field_config.get("required", False):
                field_name = field_config.get("api_name")
                if not record.get(field_name):
                    errors.append({
                        "field": field_name,
                        "message": f"{field_config.get('label', field_name)} is required"
                    })
        
        return {
            "valid": len(errors) == 0,
            "errors": errors
        }
