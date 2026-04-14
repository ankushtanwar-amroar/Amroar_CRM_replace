"""
Formula Evaluator Service for Custom Fields
Handles parsing, validation, and calculation of formula fields
"""
import re
import logging
from typing import Dict, Any, Optional, List, Set
from datetime import datetime

logger = logging.getLogger(__name__)


class FormulaError(Exception):
    """Custom exception for formula errors"""
    pass


class CircularReferenceError(FormulaError):
    """Exception for circular reference detection"""
    pass


class FormulaEvaluator:
    """
    Evaluates formula expressions for custom fields.
    
    Supported operations:
    - Arithmetic: +, -, *, /
    - Field references: {cf_field_name}
    - Numeric literals
    - Parentheses for grouping
    """
    
    # Pattern to match field references like {cf_story_points}
    FIELD_PATTERN = re.compile(r'\{([a-zA-Z_][a-zA-Z0-9_]*)\}')
    
    # Pattern to validate the formula structure
    VALID_CHARS_PATTERN = re.compile(r'^[\d\s\+\-\*\/\(\)\.\{\}a-zA-Z_]+$')
    
    def __init__(self, db):
        self.db = db
    
    def extract_field_references(self, formula: str) -> List[str]:
        """Extract all field references from a formula"""
        matches = self.FIELD_PATTERN.findall(formula)
        return list(set(matches))
    
    def validate_formula_syntax(self, formula: str) -> tuple[bool, Optional[str]]:
        """
        Validate formula syntax.
        Returns (is_valid, error_message)
        """
        if not formula or not formula.strip():
            return False, "Formula cannot be empty"
        
        # Check for valid characters
        if not self.VALID_CHARS_PATTERN.match(formula):
            return False, "Formula contains invalid characters"
        
        # Check balanced parentheses
        paren_count = 0
        for char in formula:
            if char == '(':
                paren_count += 1
            elif char == ')':
                paren_count -= 1
            if paren_count < 0:
                return False, "Unbalanced parentheses"
        
        if paren_count != 0:
            return False, "Unbalanced parentheses"
        
        # Check for empty braces
        if '{}' in formula:
            return False, "Empty field reference"
        
        # Check for consecutive operators
        if re.search(r'[\+\-\*\/]{2,}', formula.replace(' ', '')):
            return False, "Consecutive operators not allowed"
        
        return True, None
    
    async def check_circular_references(
        self,
        field_api_name: str,
        formula: str,
        tenant_id: str,
        checked_fields: Optional[Set[str]] = None
    ) -> tuple[bool, Optional[str]]:
        """
        Check for circular references in formula fields.
        Returns (has_circular, error_message)
        """
        if checked_fields is None:
            checked_fields = set()
        
        if field_api_name in checked_fields:
            return True, f"Circular reference detected: {field_api_name}"
        
        checked_fields.add(field_api_name)
        
        # Get referenced fields
        referenced_fields = self.extract_field_references(formula)
        
        for ref_field in referenced_fields:
            # Get the referenced field definition
            field_def = await self.db.tm_custom_field_definitions.find_one({
                "tenant_id": tenant_id,
                "api_name": ref_field,
                "is_active": True
            })
            
            if not field_def:
                continue
            
            # If the referenced field is also a formula, check its references
            if field_def.get("field_type") == "formula":
                ref_formula = field_def.get("formula_expression", "")
                has_circular, error = await self.check_circular_references(
                    ref_field, ref_formula, tenant_id, checked_fields.copy()
                )
                if has_circular:
                    return True, error
        
        return False, None
    
    async def validate_field_references(
        self,
        formula: str,
        tenant_id: str,
        project_id: Optional[str] = None
    ) -> tuple[bool, Optional[str], List[str]]:
        """
        Validate that all referenced fields exist and are numeric.
        Returns (is_valid, error_message, valid_field_names)
        """
        referenced_fields = self.extract_field_references(formula)
        valid_fields = []
        
        for field_name in referenced_fields:
            # Build query to find the field
            query = {
                "tenant_id": tenant_id,
                "api_name": field_name,
                "is_active": True
            }
            
            # Check both global and project-specific fields
            if project_id:
                query["$or"] = [
                    {"scope": "global"},
                    {"project_id": project_id}
                ]
            
            field_def = await self.db.tm_custom_field_definitions.find_one(query)
            
            if not field_def:
                return False, f"Field '{field_name}' not found", []
            
            # Check if field is numeric (number or formula)
            if field_def.get("field_type") not in ["number", "formula", "checkbox"]:
                return False, f"Field '{field_name}' is not numeric (type: {field_def.get('field_type')})", []
            
            valid_fields.append(field_name)
        
        return True, None, valid_fields
    
    def evaluate(
        self,
        formula: str,
        field_values: Dict[str, Any]
    ) -> Optional[float]:
        """
        Evaluate a formula with the given field values.
        Returns the calculated value or None if evaluation fails.
        """
        try:
            # Replace field references with values
            expression = formula
            
            for field_name, value in field_values.items():
                placeholder = f"{{{field_name}}}"
                if placeholder in expression:
                    # Convert checkbox to 0/1
                    if isinstance(value, bool):
                        value = 1 if value else 0
                    # Handle None values
                    if value is None:
                        value = 0
                    # Convert to float
                    try:
                        num_value = float(value)
                    except (ValueError, TypeError):
                        num_value = 0
                    
                    expression = expression.replace(placeholder, str(num_value))
            
            # Check if there are any unreplaced field references
            remaining_refs = self.FIELD_PATTERN.findall(expression)
            if remaining_refs:
                logger.warning(f"Unreplaced field references in formula: {remaining_refs}")
                # Replace with 0
                for ref in remaining_refs:
                    expression = expression.replace(f"{{{ref}}}", "0")
            
            # Safely evaluate the expression
            # Only allow basic math operations
            allowed_names = {"__builtins__": {}}
            
            # Use eval with restricted globals
            result = eval(expression, allowed_names, {})
            
            # Round to reasonable precision
            if isinstance(result, float):
                result = round(result, 4)
            
            return result
            
        except ZeroDivisionError:
            logger.warning(f"Division by zero in formula: {formula}")
            return None
        except Exception as e:
            logger.error(f"Error evaluating formula '{formula}': {str(e)}")
            return None
    
    async def calculate_formula_fields(
        self,
        task: Dict[str, Any],
        tenant_id: str
    ) -> Dict[str, Any]:
        """
        Calculate all formula fields for a task.
        Returns updated custom_fields dict.
        """
        custom_fields = task.get("custom_fields", {}).copy()
        project_id = task.get("project_id")
        
        # Get all formula fields for this tenant/project
        query = {
            "tenant_id": tenant_id,
            "field_type": "formula",
            "is_active": True
        }
        
        if project_id:
            query["$or"] = [
                {"scope": "global"},
                {"project_id": project_id}
            ]
        
        formula_fields = await self.db.tm_custom_field_definitions.find(
            query, {"_id": 0}
        ).to_list(100)
        
        # Sort by dependency order (simple topological sort)
        # Fields that don't reference other formulas first
        sorted_fields = []
        remaining = formula_fields.copy()
        
        max_iterations = len(remaining) + 1
        iteration = 0
        
        while remaining and iteration < max_iterations:
            iteration += 1
            for field in remaining[:]:
                formula = field.get("formula_expression", "")
                refs = self.extract_field_references(formula)
                
                # Check if all referenced formula fields are already calculated
                can_calculate = True
                for ref in refs:
                    # Check if ref is a formula field that hasn't been calculated yet
                    is_formula_ref = any(
                        f.get("api_name") == ref 
                        for f in remaining 
                        if f.get("api_name") != field.get("api_name")
                    )
                    if is_formula_ref:
                        can_calculate = False
                        break
                
                if can_calculate:
                    sorted_fields.append(field)
                    remaining.remove(field)
        
        # Add any remaining fields (might have circular refs, will use 0)
        sorted_fields.extend(remaining)
        
        # Calculate each formula field
        for field in sorted_fields:
            formula = field.get("formula_expression", "")
            api_name = field.get("api_name")
            
            if formula and api_name:
                result = self.evaluate(formula, custom_fields)
                if result is not None:
                    custom_fields[api_name] = result
        
        return custom_fields
