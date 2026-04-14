"""Formula (Computed) Field Models"""
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any, Literal
from datetime import datetime, timezone
from enum import Enum
from .base import AdvancedFieldBase, FieldType
import uuid


class FormulaReturnType(str, Enum):
    """Return types for formula fields"""
    NUMBER = "Number"
    CURRENCY = "Currency"
    PERCENT = "Percent"
    TEXT = "Text"
    DATE = "Date"
    DATETIME = "DateTime"
    BOOLEAN = "Boolean"


class FormulaFunction(BaseModel):
    """Definition of a formula function"""
    name: str
    category: str  # Math, Text, Logical, Date
    description: str
    syntax: str
    example: str
    return_type: str
    parameters: List[Dict[str, str]]  # [{"name": "value", "type": "Number", "required": True}]


class FormulaDependency(BaseModel):
    """Field dependency for formula"""
    field_name: str
    object_name: str  # Current object or parent object
    is_cross_object: bool = False  # True if referencing parent field


class FormulaAST(BaseModel):
    """Abstract Syntax Tree for formula"""
    type: str  # "function", "operator", "field", "literal"
    value: Any
    children: List['FormulaAST'] = []
    return_type: Optional[str] = None


class FormulaFieldConfig(AdvancedFieldBase):
    """Complete configuration for a Formula field"""
    field_type: FieldType = FieldType.FORMULA
    
    # Formula configuration
    return_type: FormulaReturnType = FormulaReturnType.TEXT
    decimal_places: int = 2  # For Number/Currency/Percent
    currency_symbol: str = "$"  # For Currency
    
    # The formula expression
    expression: str = ""
    
    # Parsed AST (stored for efficient evaluation)
    expression_ast: Optional[Dict[str, Any]] = None
    
    # Field dependencies (auto-calculated from expression)
    dependencies: List[FormulaDependency] = []
    
    # Treat blank fields as
    blank_as_zero: bool = True  # True = treat blank as 0, False = treat as blank
    
    class Config:
        use_enum_values = True


# Request/Response models
class FormulaFieldCreate(BaseModel):
    """Request model for creating a formula field"""
    label: str
    api_key: Optional[str] = None
    description: Optional[str] = None
    help_text: Optional[str] = None
    
    return_type: FormulaReturnType = FormulaReturnType.TEXT
    decimal_places: int = 2
    currency_symbol: str = "$"
    
    expression: str
    blank_as_zero: bool = True
    
    layout_assignments: List[str] = []
    add_to_all_layouts: bool = False


class FormulaFieldUpdate(BaseModel):
    """Request model for updating a formula field"""
    label: Optional[str] = None
    description: Optional[str] = None
    help_text: Optional[str] = None
    
    return_type: Optional[FormulaReturnType] = None
    decimal_places: Optional[int] = None
    currency_symbol: Optional[str] = None
    
    expression: Optional[str] = None
    blank_as_zero: Optional[bool] = None
    
    layout_assignments: Optional[List[str]] = None


class FormulaValidationRequest(BaseModel):
    """Request to validate formula syntax"""
    expression: str
    object_name: str
    return_type: FormulaReturnType = FormulaReturnType.TEXT


class FormulaValidationResult(BaseModel):
    """Result of formula validation"""
    is_valid: bool
    errors: List[str] = []
    warnings: List[str] = []
    dependencies: List[FormulaDependency] = []
    inferred_return_type: Optional[str] = None


class FormulaTestRequest(BaseModel):
    """Request to test formula with a record"""
    expression: str
    object_name: str
    record_id: str
    return_type: FormulaReturnType = FormulaReturnType.TEXT


class FormulaTestResult(BaseModel):
    """Result of formula test"""
    success: bool
    result: Any
    error: Optional[str] = None
    evaluated_expression: Optional[str] = None  # Shows expression with values substituted


# Standard functions available in Phase 1
STANDARD_FUNCTIONS: List[FormulaFunction] = [
    # Math functions
    FormulaFunction(
        name="ABS", category="Math", description="Returns absolute value",
        syntax="ABS(number)", example="ABS(-5) = 5", return_type="Number",
        parameters=[{"name": "number", "type": "Number", "required": "true"}]
    ),
    FormulaFunction(
        name="ROUND", category="Math", description="Rounds to specified decimal places",
        syntax="ROUND(number, decimals)", example="ROUND(1.567, 2) = 1.57", return_type="Number",
        parameters=[{"name": "number", "type": "Number", "required": "true"}, {"name": "decimals", "type": "Number", "required": "true"}]
    ),
    FormulaFunction(
        name="FLOOR", category="Math", description="Rounds down to nearest integer",
        syntax="FLOOR(number)", example="FLOOR(1.9) = 1", return_type="Number",
        parameters=[{"name": "number", "type": "Number", "required": "true"}]
    ),
    FormulaFunction(
        name="CEILING", category="Math", description="Rounds up to nearest integer",
        syntax="CEILING(number)", example="CEILING(1.1) = 2", return_type="Number",
        parameters=[{"name": "number", "type": "Number", "required": "true"}]
    ),
    FormulaFunction(
        name="MAX", category="Math", description="Returns the maximum value",
        syntax="MAX(value1, value2, ...)", example="MAX(1, 5, 3) = 5", return_type="Number",
        parameters=[{"name": "values", "type": "Number", "required": "true"}]
    ),
    FormulaFunction(
        name="MIN", category="Math", description="Returns the minimum value",
        syntax="MIN(value1, value2, ...)", example="MIN(1, 5, 3) = 1", return_type="Number",
        parameters=[{"name": "values", "type": "Number", "required": "true"}]
    ),
    # Text functions
    FormulaFunction(
        name="LEFT", category="Text", description="Returns leftmost characters",
        syntax="LEFT(text, num_chars)", example="LEFT('Hello', 2) = 'He'", return_type="Text",
        parameters=[{"name": "text", "type": "Text", "required": "true"}, {"name": "num_chars", "type": "Number", "required": "true"}]
    ),
    FormulaFunction(
        name="RIGHT", category="Text", description="Returns rightmost characters",
        syntax="RIGHT(text, num_chars)", example="RIGHT('Hello', 2) = 'lo'", return_type="Text",
        parameters=[{"name": "text", "type": "Text", "required": "true"}, {"name": "num_chars", "type": "Number", "required": "true"}]
    ),
    FormulaFunction(
        name="LEN", category="Text", description="Returns length of text",
        syntax="LEN(text)", example="LEN('Hello') = 5", return_type="Number",
        parameters=[{"name": "text", "type": "Text", "required": "true"}]
    ),
    FormulaFunction(
        name="LOWER", category="Text", description="Converts to lowercase",
        syntax="LOWER(text)", example="LOWER('HELLO') = 'hello'", return_type="Text",
        parameters=[{"name": "text", "type": "Text", "required": "true"}]
    ),
    FormulaFunction(
        name="UPPER", category="Text", description="Converts to uppercase",
        syntax="UPPER(text)", example="UPPER('hello') = 'HELLO'", return_type="Text",
        parameters=[{"name": "text", "type": "Text", "required": "true"}]
    ),
    FormulaFunction(
        name="CONTAINS", category="Text", description="Checks if text contains substring",
        syntax="CONTAINS(text, substring)", example="CONTAINS('Hello', 'ell') = true", return_type="Boolean",
        parameters=[{"name": "text", "type": "Text", "required": "true"}, {"name": "substring", "type": "Text", "required": "true"}]
    ),
    FormulaFunction(
        name="TEXT", category="Text", description="Converts value to text",
        syntax="TEXT(value)", example="TEXT(123) = '123'", return_type="Text",
        parameters=[{"name": "value", "type": "Any", "required": "true"}]
    ),
    FormulaFunction(
        name="TRIM", category="Text", description="Removes leading and trailing whitespace",
        syntax="TRIM(text)", example="TRIM('  Hello  ') = 'Hello'", return_type="Text",
        parameters=[{"name": "text", "type": "Text", "required": "true"}]
    ),
    FormulaFunction(
        name="SUBSTITUTE", category="Text", description="Replaces old text with new text",
        syntax="SUBSTITUTE(text, old_text, new_text)", example="SUBSTITUTE('Hello', 'l', 'x') = 'Hexxo'", return_type="Text",
        parameters=[{"name": "text", "type": "Text", "required": "true"}, {"name": "old_text", "type": "Text", "required": "true"}, {"name": "new_text", "type": "Text", "required": "true"}]
    ),
    FormulaFunction(
        name="URLENCODE", category="Text", description="URL-encodes text for use in URLs",
        syntax="URLENCODE(text)", example="URLENCODE('Hello World') = 'Hello%20World'", return_type="Text",
        parameters=[{"name": "text", "type": "Text", "required": "true"}]
    ),
    # Logical functions
    FormulaFunction(
        name="IF", category="Logical", description="Returns value based on condition",
        syntax="IF(condition, true_value, false_value)", example="IF(amount > 100, 'High', 'Low')", return_type="Any",
        parameters=[{"name": "condition", "type": "Boolean", "required": "true"}, {"name": "true_value", "type": "Any", "required": "true"}, {"name": "false_value", "type": "Any", "required": "true"}]
    ),
    FormulaFunction(
        name="CASE", category="Logical", description="Returns value based on multiple conditions",
        syntax="CASE(expression, value1, result1, value2, result2, ..., default)", example="CASE(status, 'New', 1, 'Open', 2, 0)", return_type="Any",
        parameters=[{"name": "expression", "type": "Any", "required": "true"}, {"name": "pairs", "type": "Any", "required": "true"}]
    ),
    FormulaFunction(
        name="ISBLANK", category="Logical", description="Checks if value is blank",
        syntax="ISBLANK(value)", example="ISBLANK(phone)", return_type="Boolean",
        parameters=[{"name": "value", "type": "Any", "required": "true"}]
    ),
    FormulaFunction(
        name="AND", category="Logical", description="Returns true if all conditions are true",
        syntax="AND(condition1, condition2, ...)", example="AND(amount > 0, status = 'Active')", return_type="Boolean",
        parameters=[{"name": "conditions", "type": "Boolean", "required": "true"}]
    ),
    FormulaFunction(
        name="OR", category="Logical", description="Returns true if any condition is true",
        syntax="OR(condition1, condition2, ...)", example="OR(status = 'New', status = 'Open')", return_type="Boolean",
        parameters=[{"name": "conditions", "type": "Boolean", "required": "true"}]
    ),
    FormulaFunction(
        name="NOT", category="Logical", description="Returns the opposite of a boolean value",
        syntax="NOT(condition)", example="NOT(is_closed)", return_type="Boolean",
        parameters=[{"name": "condition", "type": "Boolean", "required": "true"}]
    ),
    # Date functions
    FormulaFunction(
        name="TODAY", category="Date", description="Returns current date",
        syntax="TODAY()", example="TODAY() = 2024-01-15", return_type="Date",
        parameters=[]
    ),
    FormulaFunction(
        name="NOW", category="Date", description="Returns current date and time",
        syntax="NOW()", example="NOW() = 2024-01-15 14:30:00", return_type="DateTime",
        parameters=[]
    ),
    FormulaFunction(
        name="YEAR", category="Date", description="Returns year from date",
        syntax="YEAR(date)", example="YEAR(created_date)", return_type="Number",
        parameters=[{"name": "date", "type": "Date", "required": "true"}]
    ),
    FormulaFunction(
        name="MONTH", category="Date", description="Returns month from date (1-12)",
        syntax="MONTH(date)", example="MONTH(created_date)", return_type="Number",
        parameters=[{"name": "date", "type": "Date", "required": "true"}]
    ),
    FormulaFunction(
        name="DAY", category="Date", description="Returns day from date (1-31)",
        syntax="DAY(date)", example="DAY(created_date)", return_type="Number",
        parameters=[{"name": "date", "type": "Date", "required": "true"}]
    ),
    # Display/UI functions (Salesforce-like)
    FormulaFunction(
        name="IMAGE", category="Display/UI", description="Displays an image from a URL",
        syntax="IMAGE(url, alt_text, height, width)", example="IMAGE('https://example.com/logo.png', 'Logo', 40, 40)", return_type="Text",
        parameters=[{"name": "url", "type": "Text", "required": "true"}, {"name": "alt_text", "type": "Text", "required": "true"}, {"name": "height", "type": "Number", "required": "false"}, {"name": "width", "type": "Number", "required": "false"}]
    ),
    FormulaFunction(
        name="HYPERLINK", category="Display/UI", description="Creates a clickable hyperlink",
        syntax="HYPERLINK(url, label, target)", example="HYPERLINK('https://google.com', 'Open Google', '_blank')", return_type="Text",
        parameters=[{"name": "url", "type": "Text", "required": "true"}, {"name": "label", "type": "Text", "required": "true"}, {"name": "target", "type": "Text", "required": "false"}]
    ),
    FormulaFunction(
        name="QRCODE", category="Display/UI", description="Generates a QR code image for the given text",
        syntax="QRCODE(text, size)", example="QRCODE(email, 150)", return_type="Text",
        parameters=[{"name": "text", "type": "Text", "required": "true"}, {"name": "size", "type": "Number", "required": "false"}]
    ),
]
