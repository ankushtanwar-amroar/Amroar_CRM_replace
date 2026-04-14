import React, { useState, useEffect } from 'react';
import { Code, AlertCircle, CheckCircle, Info, Loader } from 'lucide-react';
import { Button } from '../../../../components/ui/button';
import { Label } from '../../../../components/ui/label';
import { Textarea } from '../../../../components/ui/textarea';
import { Switch } from '../../../../components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../../components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../../../../components/ui/tooltip';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '../../../../components/ui/accordion';
import fieldManagementService from '../../services/fieldManagementService';

/**
 * Formula functions available for rollup filtering
 */
const FORMULA_FUNCTIONS = [
  {
    category: 'Logical',
    functions: [
      { name: 'AND', syntax: 'AND(condition1, condition2, ...)', description: 'Returns TRUE if all conditions are true' },
      { name: 'OR', syntax: 'OR(condition1, condition2, ...)', description: 'Returns TRUE if any condition is true' },
      { name: 'NOT', syntax: 'NOT(condition)', description: 'Reverses the logical value' },
      { name: 'IF', syntax: 'IF(condition, value_if_true, value_if_false)', description: 'Conditional evaluation' },
    ]
  },
  {
    category: 'Text',
    functions: [
      { name: 'CONTAINS', syntax: 'CONTAINS(text, search)', description: 'Check if text contains search string' },
      { name: 'BEGINS', syntax: 'BEGINS(text, prefix)', description: 'Check if text starts with prefix' },
      { name: 'ENDS', syntax: 'ENDS(text, suffix)', description: 'Check if text ends with suffix' },
      { name: 'ISBLANK', syntax: 'ISBLANK(field)', description: 'Check if field is blank/empty' },
      { name: 'LEN', syntax: 'LEN(text)', description: 'Returns length of text' },
    ]
  },
  {
    category: 'Null/Blank',
    functions: [
      { name: 'ISNULL', syntax: 'ISNULL(field)', description: 'Check if field is null' },
      { name: 'ISNOTNULL', syntax: 'ISNOTNULL(field)', description: 'Check if field is not null' },
      { name: 'BLANKVALUE', syntax: 'BLANKVALUE(field, default)', description: 'Return default if field is blank' },
    ]
  },
  {
    category: 'Picklist',
    functions: [
      { name: 'ISPICKVAL', syntax: 'ISPICKVAL(field, "value")', description: 'Check picklist equals value' },
      { name: 'INCLUDES', syntax: 'INCLUDES(field, "value")', description: 'Check multi-select contains value' },
    ]
  },
  {
    category: 'Date',
    functions: [
      { name: 'TODAY', syntax: 'TODAY()', description: 'Returns current date' },
      { name: 'NOW', syntax: 'NOW()', description: 'Returns current date/time' },
      { name: 'YEAR', syntax: 'YEAR(date)', description: 'Extract year from date' },
      { name: 'MONTH', syntax: 'MONTH(date)', description: 'Extract month from date' },
      { name: 'DAY', syntax: 'DAY(date)', description: 'Extract day from date' },
    ]
  },
  {
    category: 'Comparison',
    functions: [
      { name: '=', syntax: 'field = value', description: 'Equals' },
      { name: '!=', syntax: 'field != value', description: 'Not equals' },
      { name: '>', syntax: 'field > value', description: 'Greater than' },
      { name: '<', syntax: 'field < value', description: 'Less than' },
      { name: '>=', syntax: 'field >= value', description: 'Greater or equal' },
      { name: '<=', syntax: 'field <= value', description: 'Less or equal' },
    ]
  }
];

/**
 * AdvancedFormulaFilterEditor - Formula editor for rollup filter criteria
 */
const AdvancedFormulaFilterEditor = ({
  formula = '',
  onChange,
  childObjectFields = [],
  parentObjectFields = [],
  objectName,
  childObjectName
}) => {
  const [localFormula, setLocalFormula] = useState(formula);
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState(null);
  const [showFunctionRef, setShowFunctionRef] = useState(false);

  useEffect(() => {
    setLocalFormula(formula);
  }, [formula]);

  const handleFormulaChange = (value) => {
    setLocalFormula(value);
    setValidationResult(null);
    onChange(value);
  };

  const validateFormula = async () => {
    if (!localFormula.trim()) {
      setValidationResult({ valid: true, message: 'Empty formula (no filter applied)' });
      return;
    }

    setValidating(true);
    try {
      const result = await fieldManagementService.validateRollupFilterFormula(localFormula);
      setValidationResult({
        valid: result.valid,
        message: result.valid ? 'Formula is valid' : result.error,
        childFields: result.child_field_refs,
        parentFields: result.parent_field_refs
      });
    } catch (err) {
      setValidationResult({
        valid: false,
        message: err.response?.data?.detail || 'Validation failed'
      });
    } finally {
      setValidating(false);
    }
  };

  const insertFunction = (funcName) => {
    const func = FORMULA_FUNCTIONS.flatMap(c => c.functions).find(f => f.name === funcName);
    if (func) {
      const insertText = func.syntax;
      setLocalFormula(prev => prev + (prev ? ' ' : '') + insertText);
      onChange(localFormula + (localFormula ? ' ' : '') + insertText);
    }
  };

  const insertField = (fieldName, isParent = false) => {
    const insertText = isParent ? `${objectName}.${fieldName}` : fieldName;
    setLocalFormula(prev => prev + (prev ? '' : '') + insertText);
    onChange(localFormula + insertText);
  };

  return (
    <div className="space-y-4">
      {/* Formula Editor */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <Label className="text-sm font-medium">Filter Formula</Label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowFunctionRef(!showFunctionRef)}
            className="text-xs"
          >
            <Code className="w-3 h-3 mr-1" />
            {showFunctionRef ? 'Hide' : 'Show'} Function Reference
          </Button>
        </div>
        
        <Textarea
          value={localFormula}
          onChange={(e) => handleFormulaChange(e.target.value)}
          placeholder='e.g., AND(Status = "Won", Amount > 1000)'
          className="font-mono text-sm min-h-[100px]"
        />
        
        {/* Validation */}
        <div className="flex items-center gap-2 mt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={validateFormula}
            disabled={validating}
          >
            {validating ? (
              <Loader className="w-3 h-3 mr-1 animate-spin" />
            ) : (
              <CheckCircle className="w-3 h-3 mr-1" />
            )}
            Validate
          </Button>
          
          {validationResult && (
            <div className={`flex items-center gap-1 text-sm ${
              validationResult.valid ? 'text-green-600' : 'text-red-600'
            }`}>
              {validationResult.valid ? (
                <CheckCircle className="w-4 h-4" />
              ) : (
                <AlertCircle className="w-4 h-4" />
              )}
              {validationResult.message}
            </div>
          )}
        </div>
      </div>

      {/* Quick Insert Fields */}
      <div className="grid grid-cols-2 gap-4">
        {/* Child Fields */}
        <div>
          <Label className="text-xs text-gray-500 mb-2 block">
            Insert {childObjectName} Field
          </Label>
          <Select onValueChange={(v) => insertField(v, false)}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="Select field..." />
            </SelectTrigger>
            <SelectContent>
              {childObjectFields.map(field => (
                <SelectItem key={field.api_name} value={field.api_name}>
                  {field.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Parent Fields */}
        {parentObjectFields.length > 0 && (
          <div>
            <Label className="text-xs text-gray-500 mb-2 block">
              Insert {objectName} Field (Parent)
            </Label>
            <Select onValueChange={(v) => insertField(v, true)}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="Select field..." />
              </SelectTrigger>
              <SelectContent>
                {parentObjectFields.map(field => (
                  <SelectItem key={field.api_name} value={field.api_name}>
                    {field.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Function Reference */}
      {showFunctionRef && (
        <div className="border rounded-lg p-4 bg-gray-50 max-h-[300px] overflow-y-auto">
          <h4 className="font-medium text-sm mb-3">Function Reference</h4>
          <Accordion type="multiple" className="space-y-2">
            {FORMULA_FUNCTIONS.map((category) => (
              <AccordionItem key={category.category} value={category.category} className="border rounded bg-white">
                <AccordionTrigger className="px-3 py-2 text-sm font-medium">
                  {category.category}
                </AccordionTrigger>
                <AccordionContent className="px-3 pb-3">
                  <div className="space-y-2">
                    {category.functions.map((func) => (
                      <div
                        key={func.name}
                        className="flex items-start gap-2 p-2 hover:bg-gray-50 rounded cursor-pointer"
                        onClick={() => insertFunction(func.name)}
                      >
                        <code className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded whitespace-nowrap">
                          {func.name}
                        </code>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-mono text-gray-600 truncate">{func.syntax}</p>
                          <p className="text-xs text-gray-500">{func.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      )}

      {/* Examples */}
      <div className="text-xs text-gray-500 bg-blue-50 p-3 rounded-lg">
        <p className="font-medium text-blue-700 mb-1">Examples:</p>
        <ul className="space-y-1 ml-4 list-disc">
          <li><code className="bg-blue-100 px-1 rounded">{'Status = "Won"'}</code> - Only Won records</li>
          <li><code className="bg-blue-100 px-1 rounded">{'AND(Stage = "Closed", Amount > 5000)'}</code> - Multiple conditions</li>
          <li><code className="bg-blue-100 px-1 rounded">{'ISPICKVAL(Type, "New Business")'}</code> - Picklist comparison</li>
          <li><code className="bg-blue-100 px-1 rounded">ISNOTNULL(Close_Date)</code> - Not null check</li>
          <li><code className="bg-blue-100 px-1 rounded">{'Account.Industry = "Technology"'}</code> - Parent field reference</li>
        </ul>
      </div>
    </div>
  );
};

export default AdvancedFormulaFilterEditor;
