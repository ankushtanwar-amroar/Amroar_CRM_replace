/**
 * useFieldBehaviorRules Hook
 * Manages field behavior rule evaluation at runtime
 */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import fieldBehaviorService from '../services/fieldBehaviorService';

/**
 * Extract parent field references from rules
 */
const extractParentReferences = (rules) => {
  const refs = new Set();
  
  rules.forEach(rule => {
    // Check visibility rule
    if (rule.visibilityRule?.basic?.left?.includes('.')) {
      refs.add(rule.visibilityRule.basic.left);
    }
    if (rule.visibilityRule?.formula) {
      extractRefsFromFormula(rule.visibilityRule.formula, refs);
    }
    
    // Check required rule
    if (rule.requiredRule?.basic?.left?.includes('.')) {
      refs.add(rule.requiredRule.basic.left);
    }
    if (rule.requiredRule?.formula) {
      extractRefsFromFormula(rule.requiredRule.formula, refs);
    }
    
    // Check readonly rule
    if (rule.readonlyRule?.basic?.left?.includes('.')) {
      refs.add(rule.readonlyRule.basic.left);
    }
    if (rule.readonlyRule?.formula) {
      extractRefsFromFormula(rule.readonlyRule.formula, refs);
    }
  });
  
  return Array.from(refs);
};

const extractRefsFromFormula = (formula, refs) => {
  // Match patterns like "Account.Industry"
  const pattern = /\b([A-Z][a-zA-Z0-9_]*(?:\.[A-Z][a-zA-Z0-9_]*)+)\b/g;
  const matches = formula.match(pattern);
  if (matches) {
    matches.forEach(m => refs.add(m));
  }
};

/**
 * Evaluate a basic condition locally (for quick re-evaluation)
 */
const evaluateBasicCondition = (condition, data) => {
  if (!condition) return true;
  
  const { left, operator, right } = condition;
  const leftValue = getFieldValue(data, left);
  
  switch (operator) {
    case '=':
      return String(leftValue).toLowerCase() === String(right).toLowerCase();
    case '!=':
      return String(leftValue).toLowerCase() !== String(right).toLowerCase();
    case '>':
      return Number(leftValue) > Number(right);
    case '<':
      return Number(leftValue) < Number(right);
    case '>=':
      return Number(leftValue) >= Number(right);
    case '<=':
      return Number(leftValue) <= Number(right);
    case 'contains':
      return String(leftValue).toLowerCase().includes(String(right).toLowerCase());
    case 'not_contains':
      return !String(leftValue).toLowerCase().includes(String(right).toLowerCase());
    case 'starts_with':
      return String(leftValue).toLowerCase().startsWith(String(right).toLowerCase());
    case 'ends_with':
      return String(leftValue).toLowerCase().endsWith(String(right).toLowerCase());
    case 'is_null':
      return leftValue === null || leftValue === '' || leftValue === undefined;
    case 'is_not_null':
      return leftValue !== null && leftValue !== '' && leftValue !== undefined;
    case 'includes':
      const values = Array.isArray(leftValue) ? leftValue : String(leftValue).split(';');
      return values.includes(String(right));
    default:
      return true;
  }
};

const getFieldValue = (data, fieldPath) => {
  if (!fieldPath) return null;
  
  // Direct field access
  if (data[fieldPath] !== undefined) {
    return data[fieldPath];
  }
  
  // Dot notation (for merged parent data)
  const parts = fieldPath.split('.');
  let value = data;
  for (const part of parts) {
    if (value === null || value === undefined) return null;
    value = value[part] || value[part.toLowerCase()];
  }
  return value;
};

/**
 * Evaluate a single rule locally
 */
const evaluateRuleLocally = (rule, mode, type, basic, data) => {
  if (mode === 'always') return true;
  if (mode === 'editable') return false;
  if (mode !== 'conditional') return true;
  
  if (type === 'basic' && basic) {
    return evaluateBasicCondition(basic, data);
  }
  
  // For formula rules, we need server evaluation
  return null; // null indicates server eval needed
};

/**
 * Hook for managing field behavior rules
 * @param {Object} params
 * @param {string} params.objectName - Object name
 * @param {Object} params.recordData - Current record data (reactive)
 * @param {Array} params.fieldRules - Field behavior rules from layout config
 * @param {string} params.pageType - Page type: 'new', 'edit', or 'view'
 * @param {string} params.recordId - Record ID (for edit/view pages)
 */
export const useFieldBehaviorRules = ({
  objectName,
  recordData = {},
  fieldRules = [],
  pageType = 'edit',
  recordId = null
}) => {
  const [fieldStates, setFieldStates] = useState({});
  const [parentData, setParentData] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const evaluationTimeoutRef = useRef(null);
  
  // Get all rules that have formulas (need server evaluation)
  const rulesWithFormulas = useMemo(() => {
    return fieldRules.filter(rule => 
      rule.visibilityRule?.type === 'formula' ||
      rule.requiredRule?.type === 'formula' ||
      rule.readonlyRule?.type === 'formula'
    );
  }, [fieldRules]);
  
  // Get parent references
  const parentReferences = useMemo(() => {
    return extractParentReferences(fieldRules);
  }, [fieldRules]);
  
  // Load parent data on mount if needed
  useEffect(() => {
    const loadParentData = async () => {
      if (parentReferences.length === 0 || !recordId) return;
      
      try {
        const data = await fieldBehaviorService.resolveParentLookups(
          objectName,
          recordId,
          parentReferences
        );
        setParentData(data);
      } catch (err) {
        console.error('Failed to load parent data:', err);
      }
    };
    
    loadParentData();
  }, [objectName, recordId, parentReferences]);
  
  // Merge record data with parent data for evaluation
  const mergedData = useMemo(() => {
    return { ...recordData, ...parentData };
  }, [recordData, parentData]);
  
  // Evaluate rules when data changes
  const evaluateRules = useCallback(async () => {
    if (fieldRules.length === 0) return;
    
    const newFieldStates = {};
    const needsServerEval = [];
    
    // First pass: evaluate basic rules locally
    for (const rule of fieldRules) {
      const fieldKey = rule.fieldApiName;
      
      // Evaluate visibility
      let isVisible = true;
      if (rule.visibilityRule?.mode === 'conditional') {
        if (rule.visibilityRule.type === 'basic') {
          isVisible = evaluateBasicCondition(rule.visibilityRule.basic, mergedData);
        } else {
          needsServerEval.push(rule);
        }
      }
      
      // Evaluate required
      let isRequired = rule.requiredRule?.mode === 'always';
      if (rule.requiredRule?.mode === 'conditional') {
        if (rule.requiredRule.type === 'basic') {
          isRequired = evaluateBasicCondition(rule.requiredRule.basic, mergedData);
        } else {
          needsServerEval.push(rule);
        }
      }
      
      // Evaluate readonly
      let isReadonly = pageType === 'view' || rule.readonlyRule?.mode === 'always';
      if (rule.readonlyRule?.mode === 'conditional' && pageType !== 'view') {
        if (rule.readonlyRule.type === 'basic') {
          isReadonly = evaluateBasicCondition(rule.readonlyRule.basic, mergedData);
        } else {
          needsServerEval.push(rule);
        }
      }
      
      // Hidden fields can't be required
      if (!isVisible) {
        isRequired = false;
      }
      
      newFieldStates[fieldKey] = {
        isVisible,
        isRequired,
        isReadonly,
        needsServerEval: needsServerEval.some(r => r.fieldApiName === fieldKey)
      };
    }
    
    setFieldStates(newFieldStates);
    
    // If any rules need server evaluation, call the API
    if (needsServerEval.length > 0) {
      setIsLoading(true);
      try {
        const results = await fieldBehaviorService.evaluateRules({
          objectName,
          recordData: mergedData,
          fieldRules: needsServerEval,
          pageType
        });
        
        // Merge server results
        const updatedStates = { ...newFieldStates };
        for (const result of results) {
          updatedStates[result.fieldApiName] = {
            ...updatedStates[result.fieldApiName],
            isVisible: result.isVisible,
            isRequired: result.isRequired && result.isVisible,
            isReadonly: result.isReadonly,
            needsServerEval: false,
            evaluationErrors: result.evaluationErrors
          };
        }
        setFieldStates(updatedStates);
      } catch (err) {
        console.error('Failed to evaluate rules on server:', err);
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    }
  }, [fieldRules, mergedData, objectName, pageType]);
  
  // Debounced evaluation when data changes
  useEffect(() => {
    if (evaluationTimeoutRef.current) {
      clearTimeout(evaluationTimeoutRef.current);
    }
    
    evaluationTimeoutRef.current = setTimeout(() => {
      evaluateRules();
    }, 100); // 100ms debounce
    
    return () => {
      if (evaluationTimeoutRef.current) {
        clearTimeout(evaluationTimeoutRef.current);
      }
    };
  }, [evaluateRules]);
  
  /**
   * Get field state by API name
   */
  const getFieldState = useCallback((fieldApiName) => {
    return fieldStates[fieldApiName] || {
      isVisible: true,
      isRequired: false,
      isReadonly: pageType === 'view',
      needsServerEval: false
    };
  }, [fieldStates, pageType]);
  
  /**
   * Check if a field is visible
   */
  const isFieldVisible = useCallback((fieldApiName) => {
    return getFieldState(fieldApiName).isVisible;
  }, [getFieldState]);
  
  /**
   * Check if a field is required
   */
  const isFieldRequired = useCallback((fieldApiName) => {
    return getFieldState(fieldApiName).isRequired;
  }, [getFieldState]);
  
  /**
   * Check if a field is readonly
   */
  const isFieldReadonly = useCallback((fieldApiName) => {
    return getFieldState(fieldApiName).isReadonly;
  }, [getFieldState]);
  
  /**
   * Validate required fields before save
   * Returns list of fields that are required but empty
   */
  const validateRequiredFields = useCallback(() => {
    const errors = [];
    
    for (const [fieldApiName, state] of Object.entries(fieldStates)) {
      if (state.isVisible && state.isRequired) {
        const value = recordData[fieldApiName];
        if (value === null || value === undefined || value === '' || 
            (Array.isArray(value) && value.length === 0)) {
          errors.push(fieldApiName);
        }
      }
    }
    
    return errors;
  }, [fieldStates, recordData]);
  
  return {
    fieldStates,
    isLoading,
    error,
    getFieldState,
    isFieldVisible,
    isFieldRequired,
    isFieldReadonly,
    validateRequiredFields,
    refreshRules: evaluateRules
  };
};

export default useFieldBehaviorRules;
