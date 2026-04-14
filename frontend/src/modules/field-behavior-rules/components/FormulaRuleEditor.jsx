/**
 * Formula Rule Editor Component
 * Advanced formula editor for field behavior rules
 */
import React, { useState, useEffect, useRef } from 'react';
import { Button } from '../../../components/ui/button';
import { Textarea } from '../../../components/ui/textarea';
import { 
  Plus, 
  Check, 
  X, 
  AlertCircle, 
  ChevronDown, 
  ChevronUp,
  HelpCircle
} from 'lucide-react';

// Available formula functions for behavior rules
const FORMULA_FUNCTIONS = [
  { name: 'AND', syntax: 'AND(condition1, condition2, ...)', description: 'Returns TRUE if all conditions are true' },
  { name: 'OR', syntax: 'OR(condition1, condition2, ...)', description: 'Returns TRUE if any condition is true' },
  { name: 'NOT', syntax: 'NOT(condition)', description: 'Returns the opposite of the condition' },
  { name: 'IF', syntax: 'IF(condition, true_value, false_value)', description: 'Returns one value if condition is true, another if false' },
  { name: 'ISPICKVAL', syntax: 'ISPICKVAL(field, "value")', description: 'Checks if a picklist field equals a value' },
  { name: 'ISBLANK', syntax: 'ISBLANK(field)', description: 'Returns TRUE if field is empty' },
  { name: 'ISNULL', syntax: 'ISNULL(field)', description: 'Returns TRUE if field is null' },
  { name: 'INCLUDES', syntax: 'INCLUDES(field, "value")', description: 'Checks if multi-select contains a value' },
  { name: 'CONTAINS', syntax: 'CONTAINS(text, "search")', description: 'Checks if text contains a substring' },
  { name: 'LEN', syntax: 'LEN(text)', description: 'Returns the length of text' },
  { name: 'TEXT', syntax: 'TEXT(value)', description: 'Converts a value to text' }
];

const FormulaRuleEditor = ({
  formula,
  onChange,
  availableFields = [],
  objectName = '',
  onValidate
}) => {
  const [localFormula, setLocalFormula] = useState(formula || '');
  const [showFunctions, setShowFunctions] = useState(false);
  const [showFields, setShowFields] = useState(false);
  const [validationResult, setValidationResult] = useState(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    if (formula !== undefined) {
      setLocalFormula(formula);
    }
  }, [formula]);

  const handleChange = (value) => {
    setLocalFormula(value);
    onChange(value);
    setValidationResult(null);
  };

  const insertAtCursor = (text) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const before = localFormula.substring(0, start);
    const after = localFormula.substring(end);
    const newValue = before + text + after;
    
    handleChange(newValue);
    
    // Set cursor position after inserted text
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + text.length, start + text.length);
    }, 0);
  };

  const insertFunction = (func) => {
    insertAtCursor(func.syntax);
    setShowFunctions(false);
  };

  const insertField = (field) => {
    insertAtCursor(field.fullPath);
    setShowFields(false);
  };

  const handleValidate = async () => {
    if (onValidate) {
      try {
        const result = await onValidate(localFormula, objectName);
        setValidationResult(result);
      } catch (err) {
        setValidationResult({
          isValid: false,
          errors: [err.message]
        });
      }
    }
  };

  // Group fields by object
  const groupedFields = availableFields.reduce((acc, field) => {
    const group = field.isParentField ? field.parentLookupField : 'Current Object';
    if (!acc[group]) acc[group] = [];
    acc[group].push(field);
    return acc;
  }, {});

  return (
    <div className="space-y-3">
      {/* Formula Textarea */}
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">
          Formula Expression
        </label>
        <Textarea
          ref={textareaRef}
          value={localFormula}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="Enter formula... e.g., ISPICKVAL(Stage, 'Closed Lost')"
          className="min-h-[100px] text-xs font-mono bg-slate-50"
        />
      </div>

      {/* Insert Buttons */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setShowFunctions(!showFunctions);
              setShowFields(false);
            }}
            className="w-full h-7 text-xs justify-between"
          >
            <span>Insert Function</span>
            {showFunctions ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </Button>
          
          {showFunctions && (
            <div className="absolute z-50 mt-1 w-full bg-white border rounded-lg shadow-lg max-h-60 overflow-y-auto">
              {FORMULA_FUNCTIONS.map(func => (
                <button
                  key={func.name}
                  onClick={() => insertFunction(func)}
                  className="w-full px-3 py-2 text-left hover:bg-blue-50 border-b last:border-b-0"
                >
                  <div className="font-medium text-xs text-blue-600">{func.name}</div>
                  <div className="text-[10px] text-slate-500 font-mono">{func.syntax}</div>
                  <div className="text-[10px] text-slate-400">{func.description}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="relative flex-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setShowFields(!showFields);
              setShowFunctions(false);
            }}
            className="w-full h-7 text-xs justify-between"
          >
            <span>Insert Field</span>
            {showFields ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </Button>
          
          {showFields && (
            <div className="absolute z-50 mt-1 w-full bg-white border rounded-lg shadow-lg max-h-60 overflow-y-auto">
              {Object.entries(groupedFields).map(([group, fields]) => (
                <div key={group}>
                  <div className="px-3 py-1 text-[10px] font-semibold text-slate-500 bg-slate-100 uppercase sticky top-0">
                    {group}
                  </div>
                  {fields.map(field => (
                    <button
                      key={field.fullPath}
                      onClick={() => insertField(field)}
                      className="w-full px-3 py-1.5 text-left hover:bg-blue-50"
                    >
                      <span className="text-xs">{field.label}</span>
                      <span className="ml-2 text-[10px] text-slate-400">
                        {field.fullPath}
                      </span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Validation Result */}
      {validationResult && (
        <div className={`p-2 rounded-lg text-xs ${
          validationResult.isValid 
            ? 'bg-green-50 text-green-700 border border-green-200' 
            : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          <div className="flex items-center gap-2">
            {validationResult.isValid ? (
              <>
                <Check className="h-4 w-4" />
                <span>Formula is valid</span>
              </>
            ) : (
              <>
                <AlertCircle className="h-4 w-4" />
                <span>Formula has errors:</span>
              </>
            )}
          </div>
          {!validationResult.isValid && validationResult.errors && (
            <ul className="mt-1 ml-6 list-disc">
              {validationResult.errors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Help Text */}
      <div className="p-2 bg-blue-50 rounded-lg">
        <div className="flex items-start gap-2">
          <HelpCircle className="h-4 w-4 text-blue-500 flex-shrink-0 mt-0.5" />
          <div className="text-[10px] text-blue-700">
            <p className="font-medium mb-1">Formula Tips:</p>
            <ul className="list-disc ml-4 space-y-0.5">
              <li>Use field API names (e.g., <code className="bg-blue-100 px-1 rounded">Stage</code>)</li>
              <li>Access parent fields with dot notation (e.g., <code className="bg-blue-100 px-1 rounded">Account.Industry</code>)</li>
              <li>String values must be in quotes (e.g., <code className="bg-blue-100 px-1 rounded">"Closed Lost"</code>)</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FormulaRuleEditor;
