"""
Field Behavior Rule Engine
Evaluates visibility, required, and read-only rules for fields
"""
from typing import Dict, Any, List, Optional, Tuple
import re
import logging

from modules.field_management.services.formula_service import FormulaEngine
from ..models.rule_models import (
    FieldBehaviorConfig, FieldBehaviorEvaluationResult,
    VisibilityRule, RequiredRule, ReadonlyRule,
    RuleMode, RuleType, BasicCondition, Operator
)

logger = logging.getLogger(__name__)


class FieldBehaviorRuleEngine:
    """
    Engine for evaluating field behavior rules.
    Supports both basic conditions and formula-based rules.
    """
    
    def __init__(self):
        self.formula_engine = FormulaEngine(blank_as_zero=False)
        # Add ISPICKVAL function for picklist comparisons
        self.formula_engine.FUNCTIONS['ISPICKVAL'] = lambda field_val, val: str(field_val).lower() == str(val).lower() if field_val else False
        self.formula_engine.FUNCTIONS['ISNULL'] = lambda v: v is None or v == ''
        self.formula_engine.FUNCTIONS['INCLUDES'] = lambda field_val, val: val in (field_val if isinstance(field_val, list) else str(field_val).split(';'))
    
    def evaluate_field_rules(
        self,
        field_config: FieldBehaviorConfig,
        record_data: Dict[str, Any],
        parent_data: Optional[Dict[str, Any]] = None,
        page_type: str = "edit"
    ) -> FieldBehaviorEvaluationResult:
        """
        Evaluate all behavior rules for a single field.
        
        Args:
            field_config: The field's behavior configuration
            record_data: Current record field values
            parent_data: Resolved parent lookup values (e.g., {"Account.Industry": "Technology"})
            page_type: "new", "edit", or "view"
            
        Returns:
            FieldBehaviorEvaluationResult with visibility, required, readonly status
        """
        errors = []
        
        # Merge parent data into record data for formula evaluation
        merged_data = self._merge_parent_data(record_data, parent_data or {})
        
        # Evaluate visibility
        is_visible = True
        if field_config.visibilityRule:
            vis_result, vis_error = self._evaluate_rule(
                field_config.visibilityRule.mode,
                field_config.visibilityRule.type,
                field_config.visibilityRule.basic,
                field_config.visibilityRule.formula,
                merged_data,
                default_true=True  # Default: visible
            )
            is_visible = vis_result
            if vis_error:
                errors.append(f"Visibility rule error: {vis_error}")
        
        # Evaluate required
        is_required = False
        if field_config.requiredRule:
            req_result, req_error = self._evaluate_rule(
                field_config.requiredRule.mode,
                field_config.requiredRule.type,
                field_config.requiredRule.basic,
                field_config.requiredRule.formula,
                merged_data,
                default_true=False  # Default: not required
            )
            # "always" mode means always required
            if field_config.requiredRule.mode == RuleMode.ALWAYS:
                is_required = True
            else:
                is_required = req_result
            if req_error:
                errors.append(f"Required rule error: {req_error}")
        
        # Evaluate readonly
        is_readonly = False
        if field_config.readonlyRule:
            # For view pages, always readonly
            if page_type == "view":
                is_readonly = True
            else:
                ro_result, ro_error = self._evaluate_rule(
                    field_config.readonlyRule.mode,
                    field_config.readonlyRule.type,
                    field_config.readonlyRule.basic,
                    field_config.readonlyRule.formula,
                    merged_data,
                    default_true=False  # Default: editable (not readonly)
                )
                # "editable" mode means always editable (not readonly)
                if field_config.readonlyRule.mode == RuleMode.EDITABLE:
                    is_readonly = False
                elif field_config.readonlyRule.mode == RuleMode.ALWAYS:
                    is_readonly = True
                else:
                    is_readonly = ro_result
                if ro_error:
                    errors.append(f"Readonly rule error: {ro_error}")
        
        return FieldBehaviorEvaluationResult(
            fieldApiName=field_config.fieldApiName,
            isVisible=is_visible,
            isRequired=is_required and is_visible,  # Hidden fields can't be required
            isReadonly=is_readonly,
            evaluationErrors=errors if errors else None
        )
    
    def evaluate_all_field_rules(
        self,
        field_configs: List[FieldBehaviorConfig],
        record_data: Dict[str, Any],
        parent_data: Optional[Dict[str, Any]] = None,
        page_type: str = "edit"
    ) -> List[FieldBehaviorEvaluationResult]:
        """Evaluate rules for multiple fields"""
        results = []
        for field_config in field_configs:
            result = self.evaluate_field_rules(
                field_config, record_data, parent_data, page_type
            )
            results.append(result)
        return results
    
    def _evaluate_rule(
        self,
        mode: RuleMode,
        rule_type: Optional[RuleType],
        basic: Optional[BasicCondition],
        formula: Optional[str],
        data: Dict[str, Any],
        default_true: bool
    ) -> Tuple[bool, Optional[str]]:
        """
        Evaluate a single rule (visibility, required, or readonly).
        
        Returns:
            (result, error) - result is the boolean outcome, error is any error message
        """
        # Handle mode-based defaults
        if mode == RuleMode.ALWAYS:
            return True, None
        elif mode == RuleMode.EDITABLE:
            return False, None
        elif mode != RuleMode.CONDITIONAL:
            return default_true, None
        
        # Conditional mode - evaluate the condition
        if rule_type == RuleType.FORMULA and formula:
            return self._evaluate_formula(formula, data)
        elif rule_type == RuleType.BASIC and basic:
            return self._evaluate_basic(basic, data)
        
        # No condition defined, return default
        return default_true, None
    
    def _evaluate_basic(
        self,
        condition: BasicCondition,
        data: Dict[str, Any]
    ) -> Tuple[bool, Optional[str]]:
        """Evaluate a basic condition"""
        try:
            # Get left operand value
            left_value = self._get_field_value(condition.left, data)
            right_value = condition.right
            operator = condition.operator
            
            # Handle null checks
            if operator == Operator.IS_NULL:
                return (left_value is None or left_value == '' or left_value == []), None
            elif operator == Operator.IS_NOT_NULL:
                return (left_value is not None and left_value != '' and left_value != []), None
            
            # Handle other operators
            if operator == Operator.EQUALS:
                return self._compare_values(left_value, right_value, '=='), None
            elif operator == Operator.NOT_EQUALS:
                return not self._compare_values(left_value, right_value, '=='), None
            elif operator == Operator.GREATER_THAN:
                return self._compare_numeric(left_value, right_value, '>'), None
            elif operator == Operator.LESS_THAN:
                return self._compare_numeric(left_value, right_value, '<'), None
            elif operator == Operator.GREATER_OR_EQUAL:
                return self._compare_numeric(left_value, right_value, '>='), None
            elif operator == Operator.LESS_OR_EQUAL:
                return self._compare_numeric(left_value, right_value, '<='), None
            elif operator == Operator.CONTAINS:
                return str(right_value).lower() in str(left_value).lower(), None
            elif operator == Operator.NOT_CONTAINS:
                return str(right_value).lower() not in str(left_value).lower(), None
            elif operator == Operator.STARTS_WITH:
                return str(left_value).lower().startswith(str(right_value).lower()), None
            elif operator == Operator.ENDS_WITH:
                return str(left_value).lower().endswith(str(right_value).lower()), None
            elif operator == Operator.INCLUDES:
                # For multi-select picklists
                values = left_value if isinstance(left_value, list) else str(left_value).split(';')
                return str(right_value) in values, None
            
            return False, f"Unknown operator: {operator}"
            
        except Exception as e:
            logger.warning(f"Basic condition evaluation error: {str(e)}")
            return False, str(e)
    
    def _evaluate_formula(
        self,
        formula: str,
        data: Dict[str, Any]
    ) -> Tuple[bool, Optional[str]]:
        """Evaluate a formula expression"""
        try:
            result, error = self.formula_engine.evaluate(formula, data)
            
            if error:
                return False, error
            
            # Convert result to boolean
            if isinstance(result, bool):
                return result, None
            elif result is None:
                return False, None
            elif isinstance(result, (int, float)):
                return result != 0, None
            else:
                return bool(result), None
                
        except Exception as e:
            logger.warning(f"Formula evaluation error: {str(e)}")
            return False, str(e)
    
    def _get_field_value(self, field_path: str, data: Dict[str, Any]) -> Any:
        """
        Get field value from data, supporting dot notation for parent fields.
        E.g., "Stage" or "Account.Industry"
        """
        # Direct field access
        if field_path in data:
            return data[field_path]
        
        # Case-insensitive lookup
        field_path_lower = field_path.lower()
        for key, value in data.items():
            if key.lower() == field_path_lower:
                return value
        
        # Dot notation for parent fields (already merged into data)
        # E.g., "Account.Industry" should be in data as "Account.Industry"
        return None
    
    def _merge_parent_data(
        self,
        record_data: Dict[str, Any],
        parent_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Merge parent data into record data for evaluation"""
        merged = dict(record_data)
        merged.update(parent_data)
        return merged
    
    def _compare_values(self, left: Any, right: Any, op: str) -> bool:
        """Compare two values with type coercion"""
        # Handle None
        if left is None and right is None:
            return True if op == '==' else False
        if left is None or right is None:
            return False if op == '==' else True
        
        # Try string comparison (case-insensitive)
        left_str = str(left).lower().strip()
        right_str = str(right).lower().strip()
        
        if op == '==':
            return left_str == right_str
        elif op == '!=':
            return left_str != right_str
        
        return False
    
    def _compare_numeric(self, left: Any, right: Any, op: str) -> bool:
        """Compare numeric values"""
        try:
            left_num = float(left) if left is not None else 0
            right_num = float(right) if right is not None else 0
            
            if op == '>':
                return left_num > right_num
            elif op == '<':
                return left_num < right_num
            elif op == '>=':
                return left_num >= right_num
            elif op == '<=':
                return left_num <= right_num
        except (ValueError, TypeError):
            return False
        
        return False


# Singleton instance
rule_engine = FieldBehaviorRuleEngine()
