"""
Rollup Formula Filter Evaluator
Evaluates advanced formula expressions to filter child records before rollup aggregation.

Supports functions:
- Logical: AND, OR, NOT
- Comparison: =, !=, >, <, >=, <=
- String: CONTAINS, BEGINS, ENDS, ISBLANK, LEN
- Date: TODAY, NOW, DATEVALUE, YEAR, MONTH, DAY
- Conditional: IF, CASE
- Null: ISNULL, ISNOTNULL
- Picklist: ISPICKVAL, INCLUDES
"""
from typing import Any, Dict, List, Optional, Tuple
from datetime import datetime, timezone, date
import re
import logging

logger = logging.getLogger(__name__)


class RollupFormulaEvaluator:
    """Evaluates formula expressions for rollup filtering"""
    
    # Supported functions
    FUNCTIONS = {
        # Logical
        'AND', 'OR', 'NOT',
        # Comparison helpers
        'IF', 'CASE',
        # String
        'CONTAINS', 'BEGINS', 'ENDS', 'ISBLANK', 'LEN', 'LEFT', 'RIGHT', 'MID',
        'LOWER', 'UPPER', 'TRIM', 'TEXT',
        # Date
        'TODAY', 'NOW', 'DATEVALUE', 'YEAR', 'MONTH', 'DAY', 'DATE',
        'ADDDAYS', 'ADDMONTHS', 'ADDYEARS',
        # Null checks
        'ISNULL', 'ISNOTNULL', 'NULLVALUE', 'BLANKVALUE',
        # Picklist
        'ISPICKVAL', 'INCLUDES',
        # Math
        'ABS', 'CEILING', 'FLOOR', 'ROUND', 'MAX', 'MIN'
    }
    
    def __init__(self):
        self._parent_cache: Dict[str, Dict[str, Any]] = {}
    
    def set_parent_cache(self, cache: Dict[str, Dict[str, Any]]):
        """Set the parent record cache for parent field references"""
        self._parent_cache = cache
    
    def evaluate(
        self,
        formula: str,
        record: Dict[str, Any],
        parent_data: Optional[Dict[str, Any]] = None
    ) -> bool:
        """
        Evaluate a formula expression against a record.
        
        Args:
            formula: The formula expression to evaluate
            record: The child record data
            parent_data: Optional parent record data for parent field references
            
        Returns:
            bool: True if the record passes the filter
        """
        if not formula or not formula.strip():
            return True  # Empty formula = no filter
        
        try:
            # Merge parent data into context
            context = {**record}
            if parent_data:
                for key, value in parent_data.items():
                    context[key] = value
            
            # Parse and evaluate the formula
            result = self._evaluate_expression(formula.strip(), context)
            
            # Coerce to boolean
            return bool(result)
            
        except Exception as e:
            logger.error(f"Error evaluating formula '{formula}': {str(e)}")
            return False  # Fail-safe: exclude record if formula errors
    
    def _evaluate_expression(self, expr: str, context: Dict[str, Any]) -> Any:
        """Recursively evaluate an expression"""
        expr = expr.strip()
        
        # Handle empty
        if not expr:
            return True
        
        # Handle boolean literals
        if expr.upper() == 'TRUE':
            return True
        if expr.upper() == 'FALSE':
            return False
        
        # Handle numeric literals
        try:
            if '.' in expr:
                return float(expr)
            return int(expr)
        except ValueError:
            pass
        
        # Handle string literals (quoted)
        if (expr.startswith('"') and expr.endswith('"')) or \
           (expr.startswith("'") and expr.endswith("'")):
            return expr[1:-1]
        
        # Handle NULL literal
        if expr.upper() == 'NULL':
            return None
        
        # Handle function calls
        func_match = re.match(r'^([A-Z_]+)\s*\((.*)\)$', expr, re.IGNORECASE | re.DOTALL)
        if func_match:
            func_name = func_match.group(1).upper()
            args_str = func_match.group(2)
            return self._evaluate_function(func_name, args_str, context)
        
        # Handle comparison operators
        for op, py_op in [('!=', '!='), ('<>', '!='), ('<=', '<='), ('>=', '>='), 
                          ('<', '<'), ('>', '>'), ('=', '==')]:
            # Find operator not inside quotes or parentheses
            idx = self._find_operator(expr, op)
            if idx > 0:
                left = expr[:idx].strip()
                right = expr[idx + len(op):].strip()
                left_val = self._evaluate_expression(left, context)
                right_val = self._evaluate_expression(right, context)
                return self._compare(left_val, right_val, py_op)
        
        # Handle field references (including parent.field notation)
        return self._get_field_value(expr, context)
    
    def _find_operator(self, expr: str, op: str) -> int:
        """Find operator index, ignoring those inside quotes or parentheses"""
        depth = 0
        in_string = False
        string_char = None
        
        for i in range(len(expr) - len(op) + 1):
            char = expr[i]
            
            # Handle string literals
            if char in ('"', "'") and (i == 0 or expr[i-1] != '\\'):
                if not in_string:
                    in_string = True
                    string_char = char
                elif char == string_char:
                    in_string = False
                    string_char = None
            
            if in_string:
                continue
            
            # Handle parentheses
            if char == '(':
                depth += 1
            elif char == ')':
                depth -= 1
            
            # Check for operator at current position
            if depth == 0 and expr[i:i+len(op)] == op:
                return i
        
        return -1
    
    def _compare(self, left: Any, right: Any, op: str) -> bool:
        """Compare two values"""
        # Handle null comparisons
        if left is None and right is None:
            return op in ('==', '<=', '>=')
        if left is None or right is None:
            return op == '!='
        
        # Normalize strings for comparison
        if isinstance(left, str) and isinstance(right, str):
            left = left.lower().strip()
            right = right.lower().strip()
        
        # Type coercion for numeric comparison
        try:
            if isinstance(left, (int, float)) or isinstance(right, (int, float)):
                left = float(left) if left else 0
                right = float(right) if right else 0
        except (ValueError, TypeError):
            pass
        
        ops = {
            '==': lambda a, b: a == b,
            '!=': lambda a, b: a != b,
            '<': lambda a, b: a < b,
            '>': lambda a, b: a > b,
            '<=': lambda a, b: a <= b,
            '>=': lambda a, b: a >= b
        }
        
        return ops.get(op, lambda a, b: a == b)(left, right)
    
    def _evaluate_function(self, func: str, args_str: str, context: Dict[str, Any]) -> Any:
        """Evaluate a function call"""
        args = self._parse_arguments(args_str)
        
        # Logical functions
        if func == 'AND':
            return all(self._evaluate_expression(arg, context) for arg in args)
        
        if func == 'OR':
            return any(self._evaluate_expression(arg, context) for arg in args)
        
        if func == 'NOT':
            return not self._evaluate_expression(args[0], context) if args else False
        
        # Conditional
        if func == 'IF':
            if len(args) >= 3:
                condition = self._evaluate_expression(args[0], context)
                return self._evaluate_expression(args[1] if condition else args[2], context)
            return None
        
        # String functions
        if func == 'CONTAINS':
            if len(args) >= 2:
                text = str(self._evaluate_expression(args[0], context) or '')
                search = str(self._evaluate_expression(args[1], context) or '')
                return search.lower() in text.lower()
            return False
        
        if func == 'BEGINS':
            if len(args) >= 2:
                text = str(self._evaluate_expression(args[0], context) or '')
                prefix = str(self._evaluate_expression(args[1], context) or '')
                return text.lower().startswith(prefix.lower())
            return False
        
        if func == 'ENDS':
            if len(args) >= 2:
                text = str(self._evaluate_expression(args[0], context) or '')
                suffix = str(self._evaluate_expression(args[1], context) or '')
                return text.lower().endswith(suffix.lower())
            return False
        
        if func == 'ISBLANK':
            val = self._evaluate_expression(args[0], context) if args else None
            return val is None or val == '' or (isinstance(val, str) and not val.strip())
        
        if func == 'LEN':
            val = self._evaluate_expression(args[0], context) if args else ''
            return len(str(val or ''))
        
        if func in ('LOWER', 'UPPER', 'TRIM'):
            val = str(self._evaluate_expression(args[0], context) or '') if args else ''
            if func == 'LOWER':
                return val.lower()
            if func == 'UPPER':
                return val.upper()
            return val.strip()
        
        # Null checks
        if func == 'ISNULL':
            val = self._evaluate_expression(args[0], context) if args else None
            return val is None
        
        if func == 'ISNOTNULL':
            val = self._evaluate_expression(args[0], context) if args else None
            return val is not None
        
        if func == 'NULLVALUE':
            if len(args) >= 2:
                val = self._evaluate_expression(args[0], context)
                default = self._evaluate_expression(args[1], context)
                return default if val is None else val
            return None
        
        if func == 'BLANKVALUE':
            if len(args) >= 2:
                val = self._evaluate_expression(args[0], context)
                default = self._evaluate_expression(args[1], context)
                if val is None or val == '' or (isinstance(val, str) and not val.strip()):
                    return default
                return val
            return None
        
        # Picklist functions
        if func == 'ISPICKVAL':
            if len(args) >= 2:
                field_val = self._evaluate_expression(args[0], context)
                expected = self._evaluate_expression(args[1], context)
                if field_val is None:
                    return expected is None or expected == ''
                return str(field_val).lower().strip() == str(expected).lower().strip()
            return False
        
        if func == 'INCLUDES':
            if len(args) >= 2:
                field_val = self._evaluate_expression(args[0], context)
                search = self._evaluate_expression(args[1], context)
                if field_val is None:
                    return False
                # Multi-select picklist values are semicolon-separated
                values = str(field_val).split(';')
                return any(v.strip().lower() == str(search).lower().strip() for v in values)
            return False
        
        # Date functions
        if func == 'TODAY':
            return date.today()
        
        if func == 'NOW':
            return datetime.now(timezone.utc)
        
        if func == 'YEAR':
            val = self._evaluate_expression(args[0], context) if args else None
            if isinstance(val, (date, datetime)):
                return val.year
            return None
        
        if func == 'MONTH':
            val = self._evaluate_expression(args[0], context) if args else None
            if isinstance(val, (date, datetime)):
                return val.month
            return None
        
        if func == 'DAY':
            val = self._evaluate_expression(args[0], context) if args else None
            if isinstance(val, (date, datetime)):
                return val.day
            return None
        
        if func == 'DATEVALUE':
            val = self._evaluate_expression(args[0], context) if args else None
            if isinstance(val, str):
                try:
                    return datetime.fromisoformat(val.replace('Z', '+00:00')).date()
                except ValueError:
                    return None
            if isinstance(val, datetime):
                return val.date()
            return val
        
        # Math functions
        if func == 'ABS':
            val = self._evaluate_expression(args[0], context) if args else 0
            return abs(float(val)) if val is not None else 0
        
        if func == 'ROUND':
            if args:
                val = self._evaluate_expression(args[0], context)
                decimals = int(self._evaluate_expression(args[1], context)) if len(args) > 1 else 0
                return round(float(val or 0), decimals)
            return 0
        
        if func == 'CEILING':
            val = self._evaluate_expression(args[0], context) if args else 0
            import math
            return math.ceil(float(val or 0))
        
        if func == 'FLOOR':
            val = self._evaluate_expression(args[0], context) if args else 0
            import math
            return math.floor(float(val or 0))
        
        # Unknown function - return None
        logger.warning(f"Unknown function: {func}")
        return None
    
    def _parse_arguments(self, args_str: str) -> List[str]:
        """Parse comma-separated function arguments, respecting nesting"""
        args = []
        current = []
        depth = 0
        in_string = False
        string_char = None
        
        for char in args_str:
            # Handle string literals
            if char in ('"', "'") and (not current or current[-1] != '\\'):
                if not in_string:
                    in_string = True
                    string_char = char
                elif char == string_char:
                    in_string = False
                    string_char = None
            
            if in_string:
                current.append(char)
                continue
            
            if char == '(':
                depth += 1
                current.append(char)
            elif char == ')':
                depth -= 1
                current.append(char)
            elif char == ',' and depth == 0:
                args.append(''.join(current).strip())
                current = []
            else:
                current.append(char)
        
        if current:
            args.append(''.join(current).strip())
        
        return [a for a in args if a]  # Filter empty args
    
    def _get_field_value(self, field_ref: str, context: Dict[str, Any]) -> Any:
        """Get field value from context, supporting dot notation for parent fields"""
        if not field_ref:
            return None
        
        # Direct field access
        if field_ref in context:
            return context[field_ref]
        
        # Case-insensitive lookup
        field_lower = field_ref.lower()
        for key, value in context.items():
            if key.lower() == field_lower:
                return value
        
        # Parent field reference (e.g., "Account.Industry")
        if '.' in field_ref:
            parts = field_ref.split('.')
            current = context
            for part in parts:
                if isinstance(current, dict):
                    # Try exact match first
                    if part in current:
                        current = current[part]
                    else:
                        # Case-insensitive
                        found = False
                        for key in current:
                            if key.lower() == part.lower():
                                current = current[key]
                                found = True
                                break
                        if not found:
                            return None
                else:
                    return None
            return current
        
        return None
    
    def validate_formula(self, formula: str) -> Tuple[bool, Optional[str]]:
        """
        Validate a formula expression.
        
        Returns:
            Tuple of (is_valid, error_message)
        """
        if not formula or not formula.strip():
            return True, None
        
        try:
            # Check for balanced parentheses
            depth = 0
            for char in formula:
                if char == '(':
                    depth += 1
                elif char == ')':
                    depth -= 1
                if depth < 0:
                    return False, "Unbalanced parentheses"
            if depth != 0:
                return False, "Unbalanced parentheses"
            
            # Check for valid function names
            func_pattern = r'([A-Z_]+)\s*\('
            functions = re.findall(func_pattern, formula, re.IGNORECASE)
            for func in functions:
                if func.upper() not in self.FUNCTIONS:
                    return False, f"Unknown function: {func}"
            
            # Try to evaluate with empty context (syntax check)
            self._evaluate_expression(formula, {})
            
            return True, None
            
        except Exception as e:
            return False, str(e)
    
    def extract_field_references(self, formula: str) -> Tuple[List[str], List[str]]:
        """
        Extract field references from a formula.
        
        Returns:
            Tuple of (child_fields, parent_fields)
        """
        child_fields = []
        parent_fields = []
        
        # Find field references (not function names, not string literals, not numbers)
        # This is a simplified extraction - might not catch all edge cases
        tokens = re.findall(r'[A-Za-z_][A-Za-z0-9_\.]*', formula)
        
        for token in tokens:
            # Skip function names
            if token.upper() in self.FUNCTIONS:
                continue
            # Skip boolean/null literals
            if token.upper() in ('TRUE', 'FALSE', 'NULL'):
                continue
            
            if '.' in token:
                parent_fields.append(token)
            else:
                child_fields.append(token)
        
        return list(set(child_fields)), list(set(parent_fields))


# Global instance
formula_evaluator = RollupFormulaEvaluator()
