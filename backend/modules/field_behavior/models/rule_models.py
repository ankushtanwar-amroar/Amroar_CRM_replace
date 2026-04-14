"""Field Behavior Rule Models"""
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any, Literal
from enum import Enum


class RuleMode(str, Enum):
    """Rule activation mode"""
    ALWAYS = "always"
    CONDITIONAL = "conditional"
    EDITABLE = "editable"  # For read-only rule default


class RuleType(str, Enum):
    """Type of rule condition builder"""
    BASIC = "basic"
    FORMULA = "formula"


class Operator(str, Enum):
    """Comparison operators for basic rules"""
    EQUALS = "="
    NOT_EQUALS = "!="
    GREATER_THAN = ">"
    LESS_THAN = "<"
    GREATER_OR_EQUAL = ">="
    LESS_OR_EQUAL = "<="
    CONTAINS = "contains"
    NOT_CONTAINS = "not_contains"
    STARTS_WITH = "starts_with"
    ENDS_WITH = "ends_with"
    IS_NULL = "is_null"
    IS_NOT_NULL = "is_not_null"
    INCLUDES = "includes"  # For multi-select picklists


class BasicCondition(BaseModel):
    """A basic condition for field behavior rules"""
    left: str = Field(..., description="Field API name (supports Parent.Field notation)")
    operator: Operator
    right: Optional[Any] = Field(None, description="Value to compare against (null for is_null/is_not_null)")
    
    class Config:
        use_enum_values = True


class VisibilityRule(BaseModel):
    """Rule controlling field visibility"""
    mode: RuleMode = RuleMode.ALWAYS
    type: Optional[RuleType] = RuleType.BASIC
    basic: Optional[BasicCondition] = None
    formula: Optional[str] = None  # Formula expression like "ISPICKVAL(Stage, 'Closed Lost')"
    
    class Config:
        use_enum_values = True


class RequiredRule(BaseModel):
    """Rule controlling field required status"""
    mode: RuleMode = RuleMode.CONDITIONAL  # Default: not required
    type: Optional[RuleType] = RuleType.BASIC
    basic: Optional[BasicCondition] = None
    formula: Optional[str] = None
    
    class Config:
        use_enum_values = True


class ReadonlyRule(BaseModel):
    """Rule controlling field read-only status"""
    mode: RuleMode = RuleMode.EDITABLE  # Default: editable
    type: Optional[RuleType] = RuleType.BASIC
    basic: Optional[BasicCondition] = None
    formula: Optional[str] = None
    
    class Config:
        use_enum_values = True


class FieldBehaviorConfig(BaseModel):
    """Complete field behavior configuration"""
    fieldApiName: str = Field(..., description="The API name of the field")
    label: Optional[str] = None
    visibilityRule: Optional[VisibilityRule] = None
    requiredRule: Optional[RequiredRule] = None
    readonlyRule: Optional[ReadonlyRule] = None


class FieldBehaviorEvaluationRequest(BaseModel):
    """Request to evaluate field behavior rules"""
    objectName: str = Field(..., description="The object name (e.g., 'account', 'opportunity')")
    recordData: Dict[str, Any] = Field(..., description="Current record field values")
    fieldRules: List[FieldBehaviorConfig] = Field(..., description="Field behavior rules to evaluate")
    pageType: Literal["new", "edit", "view"] = Field("edit", description="Page context")
    parentReferences: Optional[List[str]] = Field(None, description="List of parent field references needed")


class FieldBehaviorEvaluationResult(BaseModel):
    """Result of field behavior evaluation"""
    fieldApiName: str
    isVisible: bool = True
    isRequired: bool = False
    isReadonly: bool = False
    evaluationErrors: Optional[List[str]] = None


class FieldReferenceInfo(BaseModel):
    """Information about a field reference for the UI"""
    apiName: str
    label: str
    fieldType: str
    objectName: str
    isParentField: bool = False
    parentLookupField: Optional[str] = None  # The lookup field that connects to parent
    fullPath: str  # e.g., "Account.Industry" or "Stage"


class ParentLookupResolutionRequest(BaseModel):
    """Request to resolve parent lookup values"""
    objectName: str
    recordId: str
    parentReferences: List[str] = Field(..., description="List of paths like 'Account.Industry', 'Account.Owner.Name'")


class ParentLookupResolutionResult(BaseModel):
    """Result of parent lookup resolution"""
    resolvedValues: Dict[str, Any] = Field(default_factory=dict, description="Map of path to value")
    errors: Optional[List[str]] = None
