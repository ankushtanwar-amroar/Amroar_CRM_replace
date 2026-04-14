"""Formula Field Service - Handles formula field operations and evaluation"""
from motor.motor_asyncio import AsyncIOMotorDatabase
from typing import Optional, List, Dict, Any, Tuple
from datetime import datetime, timezone, date
import re
import math

from ..models.formula_field import (
    FormulaFieldConfig, FormulaFieldCreate, FormulaFieldUpdate,
    FormulaValidationRequest, FormulaValidationResult,
    FormulaTestRequest, FormulaTestResult,
    FormulaDependency, STANDARD_FUNCTIONS
)
from ..models.base import FieldType


class FormulaEngine:
    """Engine for parsing and evaluating formulas"""
    
    # Supported operators
    OPERATORS = {
        '+': lambda a, b: a + b,
        '-': lambda a, b: a - b,
        '*': lambda a, b: a * b,
        '/': lambda a, b: a / b if b != 0 else 0,
        '&': lambda a, b: str(a) + str(b),  # Text concatenation
        '=': lambda a, b: a == b,
        '!=': lambda a, b: a != b,
        '<>': lambda a, b: a != b,
        '<': lambda a, b: a < b,
        '>': lambda a, b: a > b,
        '<=': lambda a, b: a <= b,
        '>=': lambda a, b: a >= b,
    }
    
    # Function implementations
    FUNCTIONS = {
        # Math
        'ABS': lambda x: abs(x),
        'ROUND': lambda x, d=0: round(x, int(d)),
        'FLOOR': lambda x: math.floor(x),
        'CEILING': lambda x: math.ceil(x),
        'MAX': lambda *args: max(args),
        'MIN': lambda *args: min(args),
        
        # Text
        'LEFT': lambda t, n: str(t)[:int(n)],
        'RIGHT': lambda t, n: str(t)[-int(n):] if n > 0 else '',
        'LEN': lambda t: len(str(t)),
        'LOWER': lambda t: str(t).lower(),
        'UPPER': lambda t: str(t).upper(),
        'CONTAINS': lambda t, s: str(s) in str(t),
        'TEXT': lambda v: str(v),
        'TRIM': lambda t: str(t).strip(),
        'SUBSTITUTE': lambda t, old, new: str(t).replace(str(old), str(new)),
        'URLENCODE': lambda t: __import__('urllib.parse', fromlist=['quote']).quote(str(t), safe=''),
        
        # Logical
        'IF': lambda cond, true_val, false_val: true_val if cond else false_val,
        'ISBLANK': lambda v: v is None or v == '' or v == [],
        'AND': lambda *args: all(args),
        'OR': lambda *args: any(args),
        'NOT': lambda x: not x,
        
        # Date
        'TODAY': lambda: date.today().isoformat(),
        'NOW': lambda: datetime.now(timezone.utc).isoformat(),
        'YEAR': lambda d: datetime.fromisoformat(str(d)).year if d else 0,
        'MONTH': lambda d: datetime.fromisoformat(str(d)).month if d else 0,
        'DAY': lambda d: datetime.fromisoformat(str(d)).day if d else 0,
        
        # Display/UI functions - return markup strings that can be rendered
        'IMAGE': lambda url, alt='', height=40, width=40: f'<img src="{url}" alt="{alt}" height="{height}" width="{width}" />',
        'HYPERLINK': lambda url, label, target='_blank': f'<a href="{url}" target="{target}">{label}</a>',
        'QRCODE': lambda text, size=150: f'<img src="https://api.qrserver.com/v1/create-qr-code/?size={size}x{size}&data={__import__("urllib.parse", fromlist=["quote"]).quote(str(text), safe="")}" alt="QR Code" height="{size}" width="{size}" />',
    }
    
    def __init__(self, blank_as_zero: bool = True):
        self.blank_as_zero = blank_as_zero
    
    def parse_expression(self, expression: str) -> Tuple[bool, List[str], List[FormulaDependency]]:
        """Parse formula expression and extract dependencies"""
        errors = []
        dependencies = []
        
        # Find field references: field_name or Parent.field_name
        field_pattern = r'\b([A-Za-z_][A-Za-z0-9_]*)(?:\.([A-Za-z_][A-Za-z0-9_]*))?\b'
        matches = re.findall(field_pattern, expression)
        
        for match in matches:
            field_name = match[0]
            parent_field = match[1] if match[1] else None
            
            # Skip function names and keywords
            if field_name.upper() in self.FUNCTIONS:
                continue
            if field_name.upper() in ['AND', 'OR', 'NOT', 'TRUE', 'FALSE', 'NULL']:
                continue
            
            if parent_field:
                # Cross-object reference: Parent.field
                dependencies.append(FormulaDependency(
                    field_name=parent_field,
                    object_name=field_name,  # This should be resolved to actual parent object
                    is_cross_object=True
                ))
            else:
                # Current object field
                dependencies.append(FormulaDependency(
                    field_name=field_name,
                    object_name="",  # Will be set to current object
                    is_cross_object=False
                ))
        
        # Check for syntax errors
        # Check balanced parentheses
        paren_count = 0
        for char in expression:
            if char == '(':
                paren_count += 1
            elif char == ')':
                paren_count -= 1
            if paren_count < 0:
                errors.append("Unbalanced parentheses: extra closing parenthesis")
                break
        if paren_count > 0:
            errors.append("Unbalanced parentheses: missing closing parenthesis")
        
        # Check for invalid characters - allow URL-safe characters including : / ? # @ % 
        valid_pattern = r'^[\w\s+\-*/&=<>!().\',":/?#@%]+$'
        if not re.match(valid_pattern, expression):
            errors.append("Expression contains invalid characters")
        
        return len(errors) == 0, errors, dependencies
    
    def evaluate(
        self,
        expression: str,
        record: Dict[str, Any],
        parent_record: Optional[Dict[str, Any]] = None
    ) -> Tuple[Any, Optional[str]]:
        """Evaluate a formula expression with given record data"""
        try:
            # Replace field references with values
            evaluated_expr = self._substitute_fields(expression, record, parent_record)
            
            # Replace functions with Python callable syntax
            evaluated_expr = self._prepare_expression(evaluated_expr)
            
            # Create safe evaluation context
            context = {
                **self.FUNCTIONS,
                'True': True,
                'False': False,
                'None': None,
                '__builtins__': {},
            }
            
            result = eval(evaluated_expr, context)
            return result, None
            
        except Exception as e:
            return None, str(e)
    
    def _substitute_fields(
        self,
        expression: str,
        record: Dict[str, Any],
        parent_record: Optional[Dict[str, Any]] = None
    ) -> str:
        """Substitute field references with actual values"""
        result = expression
        
        # Replace Parent.field references
        if parent_record:
            parent_pattern = r'\bParent\.([A-Za-z_][A-Za-z0-9_]*)\b'
            for match in re.finditer(parent_pattern, result, re.IGNORECASE):
                field_name = match.group(1)
                value = parent_record.get(field_name)
                value = self._format_value(value)
                result = result.replace(match.group(0), value)
        
        # Replace direct field references
        # Be careful not to replace function names
        field_pattern = r'\b([A-Za-z_][A-Za-z0-9_]*)\b'
        for match in re.finditer(field_pattern, result):
            field_name = match.group(1)
            
            # Skip if it's a function name or keyword
            if field_name.upper() in self.FUNCTIONS:
                continue
            if field_name.upper() in ['AND', 'OR', 'NOT', 'TRUE', 'FALSE', 'NULL', 'PARENT']:
                continue
            
            # Check if it's a field in the record
            if field_name in record or field_name.lower() in record:
                actual_key = field_name if field_name in record else field_name.lower()
                value = record.get(actual_key)
                value = self._format_value(value)
                result = re.sub(rf'\b{field_name}\b', value, result)
        
        return result
    
    def _format_value(self, value: Any) -> str:
        """Format a value for inclusion in expression"""
        if value is None or value == '':
            if self.blank_as_zero:
                return '0'
            return 'None'
        elif isinstance(value, str):
            # Try to convert numeric strings to numbers for formula evaluation
            try:
                # Check if it's an integer
                if value.isdigit() or (value.startswith('-') and value[1:].isdigit()):
                    return value
                # Check if it's a float
                float_val = float(value)
                return str(float_val)
            except (ValueError, AttributeError):
                # Not a number, treat as string
                # Escape quotes and wrap in quotes
                return f"'{value.replace(chr(39), chr(39)+chr(39))}'"
        elif isinstance(value, bool):
            return 'True' if value else 'False'
        elif isinstance(value, (int, float)):
            return str(value)
        elif isinstance(value, (datetime, date)):
            return f"'{value.isoformat()}'"
        else:
            return str(value)
    
    def _prepare_expression(self, expression: str) -> str:
        """Prepare expression for Python eval"""
        result = expression
        
        # Replace comparison operators
        result = result.replace('<>', '!=')
        result = result.replace(' = ', ' == ').replace('(=', '(==')
        
        # Handle text concatenation operator &
        # Convert A & B to str(A) + str(B)
        # We need to be careful not to replace & in strings
        # Simple approach: Replace & with + since we've already converted field values to strings
        result = result.replace(' & ', ' + ')
        
        return result


class FormulaFieldService:
    """Service for managing formula fields"""
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.collection = db.advanced_fields
        self.engine = FormulaEngine()
    
    def _generate_api_key(self, label: str) -> str:
        """Generate API key from label"""
        api_key = re.sub(r'[^a-zA-Z0-9\s]', '', label.lower())
        api_key = re.sub(r'\s+', '_', api_key)
        return api_key
    
    async def create_formula_field(
        self,
        object_name: str,
        tenant_id: str,
        field_data: FormulaFieldCreate,
        created_by: Optional[str] = None
    ) -> FormulaFieldConfig:
        """Create a new formula field"""
        
        # Generate API key if not provided
        api_key = field_data.api_key or self._generate_api_key(field_data.label)
        
        # Check if API key already exists
        existing = await self.collection.find_one({
            "object_name": object_name,
            "tenant_id": tenant_id,
            "api_key": api_key
        })
        if existing:
            raise ValueError(f"Field with API key '{api_key}' already exists")
        
        # Validate expression
        validation = await self.validate_formula(
            FormulaValidationRequest(
                expression=field_data.expression,
                object_name=object_name,
                return_type=field_data.return_type
            ),
            tenant_id
        )
        
        if not validation.is_valid:
            raise ValueError(f"Invalid formula: {', '.join(validation.errors)}")
        
        # Create formula field config
        formula_field = FormulaFieldConfig(
            label=field_data.label,
            api_key=api_key,
            description=field_data.description,
            help_text=field_data.help_text,
            object_name=object_name,
            tenant_id=tenant_id,
            return_type=field_data.return_type,
            decimal_places=field_data.decimal_places,
            currency_symbol=field_data.currency_symbol,
            expression=field_data.expression,
            dependencies=validation.dependencies,
            blank_as_zero=field_data.blank_as_zero,
            layout_assignments=field_data.layout_assignments,
            add_to_all_layouts=field_data.add_to_all_layouts,
            created_by=created_by
        )
        
        # Save to database
        await self.collection.insert_one(formula_field.model_dump())
        
        return formula_field
    
    async def get_formula_field(
        self,
        field_id: str,
        tenant_id: str
    ) -> Optional[FormulaFieldConfig]:
        """Get formula field by ID"""
        field = await self.collection.find_one({
            "id": field_id,
            "tenant_id": tenant_id,
            "field_type": FieldType.FORMULA.value
        }, {"_id": 0})
        
        if field:
            return FormulaFieldConfig(**field)
        return None
    
    async def list_formula_fields(
        self,
        object_name: str,
        tenant_id: str
    ) -> List[FormulaFieldConfig]:
        """List all formula fields for an object"""
        cursor = self.collection.find({
            "object_name": object_name,
            "tenant_id": tenant_id,
            "field_type": FieldType.FORMULA.value,
            "is_active": True
        }, {"_id": 0})
        
        fields = await cursor.to_list(length=100)
        return [FormulaFieldConfig(**f) for f in fields]
    
    async def update_formula_field(
        self,
        field_id: str,
        tenant_id: str,
        update_data: FormulaFieldUpdate,
        updated_by: Optional[str] = None
    ) -> Optional[FormulaFieldConfig]:
        """Update a formula field"""
        
        # If expression is being updated, validate it
        if update_data.expression:
            current = await self.get_formula_field(field_id, tenant_id)
            if not current:
                return None
            
            validation = await self.validate_formula(
                FormulaValidationRequest(
                    expression=update_data.expression,
                    object_name=current.object_name,
                    return_type=update_data.return_type or current.return_type
                ),
                tenant_id
            )
            
            if not validation.is_valid:
                raise ValueError(f"Invalid formula: {', '.join(validation.errors)}")
        
        update_dict = update_data.model_dump(exclude_unset=True)
        update_dict["updated_at"] = datetime.now(timezone.utc)
        if updated_by:
            update_dict["updated_by"] = updated_by
        
        result = await self.collection.update_one(
            {
                "id": field_id,
                "tenant_id": tenant_id,
                "field_type": FieldType.FORMULA.value
            },
            {"$set": update_dict}
        )
        
        if result.modified_count > 0:
            return await self.get_formula_field(field_id, tenant_id)
        return None
    
    async def delete_formula_field(
        self,
        field_id: str,
        tenant_id: str
    ) -> bool:
        """Soft delete a formula field"""
        result = await self.collection.update_one(
            {
                "id": field_id,
                "tenant_id": tenant_id,
                "field_type": FieldType.FORMULA.value
            },
            {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc)}}
        )
        return result.modified_count > 0
    
    async def validate_formula(
        self,
        request: FormulaValidationRequest,
        tenant_id: str
    ) -> FormulaValidationResult:
        """Validate a formula expression"""
        engine = FormulaEngine()
        
        is_valid, errors, dependencies = engine.parse_expression(request.expression)
        
        # Set object name for dependencies
        for dep in dependencies:
            if not dep.object_name:
                dep.object_name = request.object_name
        
        # Check if referenced fields exist
        warnings = []
        obj = await self.db.tenant_objects.find_one({
            "object_name": request.object_name,
            "tenant_id": tenant_id
        })
        
        if obj:
            obj_fields = set(obj.get("fields", {}).keys())
            for dep in dependencies:
                if not dep.is_cross_object and dep.field_name.lower() not in obj_fields:
                    warnings.append(f"Field '{dep.field_name}' not found in {request.object_name}")
        
        return FormulaValidationResult(
            is_valid=is_valid,
            errors=errors,
            warnings=warnings,
            dependencies=dependencies,
            inferred_return_type=request.return_type.value
        )
    
    async def test_formula(
        self,
        request: FormulaTestRequest,
        tenant_id: str
    ) -> FormulaTestResult:
        """Test a formula with a specific record"""
        
        # Get the record from object_records collection
        record_doc = await self.db.object_records.find_one(
            {"id": request.record_id, "tenant_id": tenant_id, "object_name": request.object_name},
            {"_id": 0}
        )
        
        # Extract data from record document
        record = record_doc.get("data", {}) if record_doc else None
        
        if not record:
            return FormulaTestResult(
                success=False,
                result=None,
                error="Record not found"
            )
        
        # Check for parent record if needed
        parent_record = None
        if 'Parent.' in request.expression or any(key.endswith('_id') and value for key, value in record.items()):
            # Find lookup field to determine parent
            for key, value in record.items():
                if key.endswith('_id') and value:
                    parent_obj = key.replace('_id', '')
                    # Look up parent in object_records collection
                    parent_doc = await self.db.object_records.find_one(
                        {"id": value, "object_name": parent_obj},
                        {"_id": 0}
                    )
                    if parent_doc:
                        parent_record = parent_doc.get("data", {})
                        break
        
        # Evaluate formula
        engine = FormulaEngine(blank_as_zero=True)
        result, error = engine.evaluate(request.expression, record, parent_record)
        
        return FormulaTestResult(
            success=error is None,
            result=result,
            error=error
        )
    
    async def evaluate_formula_for_record(
        self,
        formula_field: FormulaFieldConfig,
        record: Dict[str, Any],
        parent_record: Optional[Dict[str, Any]] = None
    ) -> Any:
        """Evaluate formula field value for a record"""
        engine = FormulaEngine(blank_as_zero=formula_field.blank_as_zero)
        result, error = engine.evaluate(
            formula_field.expression,
            record,
            parent_record
        )
        
        if error:
            return None
        
        # Format result based on return type
        if formula_field.return_type.value in ['Number', 'Currency', 'Percent']:
            try:
                result = round(float(result), formula_field.decimal_places)
            except (ValueError, TypeError):
                result = 0
        
        return result
    
    def get_available_functions(self) -> List[Dict[str, Any]]:
        """Get list of available formula functions"""
        return [f.model_dump() for f in STANDARD_FUNCTIONS]
