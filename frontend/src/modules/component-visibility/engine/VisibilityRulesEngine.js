/**
 * Component Visibility Rules Engine
 * Core evaluation logic for component visibility
 * 
 * Key behaviors:
 * - No visibility config OR mode="always" → always visible
 * - Missing data dependencies → component hidden (safe default)
 * - Supports record, user, and context-based conditions
 */

import { 
  VISIBILITY_MODES, 
  LOGIC_OPERATORS, 
  CONDITION_SOURCES,
  NO_VALUE_OPERATORS 
} from '../types/visibilityTypes';

/**
 * Evaluation result with metadata
 */
const createResult = (visible, reason = '', pending = false) => ({
  visible,
  reason,
  pending, // True if evaluation couldn't complete due to missing data
});

/**
 * Check if required data is available for evaluation
 */
const isDataAvailable = (recordData, userContext) => {
  // Record data must be an object (can be empty, but must exist)
  if (recordData === null || recordData === undefined) {
    return { available: false, reason: 'Record data not loaded' };
  }
  
  // User context is optional but must be object if provided
  if (userContext !== null && userContext !== undefined && typeof userContext !== 'object') {
    return { available: false, reason: 'Invalid user context' };
  }
  
  return { available: true };
};

/**
 * Get value from source based on condition
 */
const getValueFromSource = (condition, recordData, userContext, uiContext) => {
  const { source, left } = condition;
  
  switch (source) {
    case CONDITION_SOURCES.RECORD:
      // Handle nested field paths (e.g., "account.name")
      if (left.includes('.')) {
        const parts = left.split('.');
        let value = recordData;
        for (const part of parts) {
          if (value === null || value === undefined) return { found: false };
          value = value[part];
        }
        return { found: true, value };
      }
      
      // Direct field access
      if (!(left in recordData)) {
        return { found: false };
      }
      return { found: true, value: recordData[left] };
      
    case CONDITION_SOURCES.USER:
      if (!userContext) return { found: false };
      
      // Handle User.* fields
      const userField = left.replace('User.', '').toLowerCase();
      const fieldMap = {
        'role': userContext.role,
        'profile': userContext.profile,
        'isadmin': userContext.isAdmin || userContext.is_admin,
        'id': userContext.id,
        'email': userContext.email,
      };
      
      if (userField in fieldMap) {
        return { found: true, value: fieldMap[userField] };
      }
      
      // Check permissions
      if (left.startsWith('User.Permissions.')) {
        const permKey = left.replace('User.Permissions.', '');
        const permissions = userContext.permissions || {};
        return { found: true, value: permissions[permKey] || false };
      }
      
      return { found: false };
      
    case CONDITION_SOURCES.CONTEXT:
      if (!uiContext) return { found: false };
      return { found: left in uiContext, value: uiContext[left] };
      
    default:
      return { found: false };
  }
};

/**
 * Normalize value for comparison
 */
const normalizeValue = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value.toLowerCase().trim();
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value;
  if (value instanceof Date) return value.getTime();
  return String(value).toLowerCase().trim();
};

/**
 * Parse comparison value based on field type
 */
const parseComparisonValue = (value, fieldValue) => {
  if (value === null || value === undefined) return null;
  
  // If fieldValue is a number, try to parse value as number
  if (typeof fieldValue === 'number') {
    const num = parseFloat(value);
    return isNaN(num) ? value : num;
  }
  
  // If fieldValue is boolean, parse as boolean
  if (typeof fieldValue === 'boolean') {
    if (typeof value === 'boolean') return value;
    return value === 'true' || value === true;
  }
  
  // If fieldValue is a date, try to parse
  if (fieldValue instanceof Date) {
    const date = new Date(value);
    return isNaN(date.getTime()) ? value : date.getTime();
  }
  
  return normalizeValue(value);
};

/**
 * Evaluate a single condition
 */
const evaluateCondition = (condition, recordData, userContext, uiContext) => {
  const { operator, right } = condition;
  
  // Get the left operand value
  const leftResult = getValueFromSource(condition, recordData, userContext, uiContext);
  
  // If field not found, return pending (hide component)
  if (!leftResult.found) {
    return { result: false, pending: true, reason: `Field "${condition.left}" not available` };
  }
  
  const leftValue = leftResult.value;
  const normalizedLeft = normalizeValue(leftValue);
  
  // Handle null-check operators (no right value needed)
  if (operator === 'is_null') {
    return { 
      result: leftValue === null || leftValue === undefined || leftValue === '', 
      pending: false 
    };
  }
  
  if (operator === 'is_not_null') {
    return { 
      result: leftValue !== null && leftValue !== undefined && leftValue !== '', 
      pending: false 
    };
  }
  
  // Parse the right value for comparison
  const rightValue = parseComparisonValue(right, leftValue);
  const normalizedRight = normalizeValue(rightValue);
  
  // Evaluate based on operator
  switch (operator) {
    case '=':
      return { result: normalizedLeft === normalizedRight, pending: false };
      
    case '!=':
      return { result: normalizedLeft !== normalizedRight, pending: false };
      
    case '>':
      return { result: leftValue > rightValue, pending: false };
      
    case '<':
      return { result: leftValue < rightValue, pending: false };
      
    case '>=':
      return { result: leftValue >= rightValue, pending: false };
      
    case '<=':
      return { result: leftValue <= rightValue, pending: false };
      
    case 'contains':
      return { 
        result: String(normalizedLeft || '').includes(String(normalizedRight || '')), 
        pending: false 
      };
      
    case 'not_contains':
      return { 
        result: !String(normalizedLeft || '').includes(String(normalizedRight || '')), 
        pending: false 
      };
      
    case 'starts_with':
      return { 
        result: String(normalizedLeft || '').startsWith(String(normalizedRight || '')), 
        pending: false 
      };
      
    case 'ends_with':
      return { 
        result: String(normalizedLeft || '').endsWith(String(normalizedRight || '')), 
        pending: false 
      };
      
    case 'in': {
      // Handle comma-separated values or array
      const values = Array.isArray(rightValue) 
        ? rightValue.map(v => normalizeValue(v))
        : String(right || '').split(',').map(v => normalizeValue(v.trim()));
      return { result: values.includes(normalizedLeft), pending: false };
    }
      
    case 'not_in': {
      const values = Array.isArray(rightValue) 
        ? rightValue.map(v => normalizeValue(v))
        : String(right || '').split(',').map(v => normalizeValue(v.trim()));
      return { result: !values.includes(normalizedLeft), pending: false };
    }
      
    default:
      // Unknown operator, treat as equals
      return { result: normalizedLeft === normalizedRight, pending: false };
  }
};

/**
 * Main visibility evaluation function
 * 
 * @param {Object} visibilityConfig - The visibility configuration from component
 * @param {Object} recordData - Current record data
 * @param {Object} userContext - Current user context (role, profile, permissions)
 * @param {Object} uiContext - UI context (device type, screen size, etc.)
 * @returns {Object} { visible: boolean, reason: string, pending: boolean }
 */
export const evaluateComponentVisibility = (
  visibilityConfig,
  recordData,
  userContext = null,
  uiContext = null
) => {
  // RULE 1: No visibility config = always visible
  if (!visibilityConfig) {
    return createResult(true, 'No visibility config (default: visible)');
  }
  
  // RULE 2: mode="always" = always visible
  if (visibilityConfig.mode === VISIBILITY_MODES.ALWAYS || !visibilityConfig.mode) {
    return createResult(true, 'Mode is "always" (default: visible)');
  }
  
  // RULE 3: Check if required data is available
  const dataCheck = isDataAvailable(recordData, userContext);
  if (!dataCheck.available) {
    // Safe default: hide when data not available
    return createResult(false, dataCheck.reason, true);
  }
  
  // RULE 4: If no conditions defined, treat as always visible (backward compat)
  const conditions = visibilityConfig.conditions || [];
  if (conditions.length === 0) {
    return createResult(true, 'No conditions defined (default: visible)');
  }
  
  // RULE 5: Evaluate all conditions
  const logic = visibilityConfig.logic || LOGIC_OPERATORS.AND;
  const results = [];
  let hasPending = false;
  
  for (const condition of conditions) {
    // Skip invalid conditions
    if (!condition.left || !condition.operator) continue;
    
    const evalResult = evaluateCondition(condition, recordData, userContext, uiContext);
    results.push(evalResult);
    
    if (evalResult.pending) {
      hasPending = true;
    }
  }
  
  // If no valid conditions were evaluated
  if (results.length === 0) {
    return createResult(true, 'No valid conditions to evaluate');
  }
  
  // RULE 6: If any condition has pending data, hide component (safe default)
  if (hasPending) {
    return createResult(false, 'Waiting for data to evaluate conditions', true);
  }
  
  // RULE 7: Combine results based on logic
  let conditionsMet;
  if (logic === LOGIC_OPERATORS.AND) {
    conditionsMet = results.every(r => r.result);
  } else {
    conditionsMet = results.some(r => r.result);
  }
  
  // RULE 8: Apply visibility mode
  const mode = visibilityConfig.mode;
  
  if (mode === VISIBILITY_MODES.SHOW_WHEN) {
    // Show only if conditions are met
    return createResult(
      conditionsMet, 
      conditionsMet ? 'Show conditions met' : 'Show conditions not met'
    );
  }
  
  if (mode === VISIBILITY_MODES.HIDE_WHEN) {
    // Hide if conditions are met, show otherwise
    return createResult(
      !conditionsMet, 
      conditionsMet ? 'Hide conditions met (hidden)' : 'Hide conditions not met (visible)'
    );
  }
  
  // Fallback: visible
  return createResult(true, 'Unknown mode, defaulting to visible');
};

/**
 * Quick check if a component should be visible
 * Returns just boolean for simple use cases
 */
export const isComponentVisible = (visibilityConfig, recordData, userContext, uiContext) => {
  const result = evaluateComponentVisibility(visibilityConfig, recordData, userContext, uiContext);
  return result.visible;
};

/**
 * Batch evaluate visibility for multiple components
 * Useful for filtering a list of components before rendering
 */
export const evaluateMultipleComponents = (components, recordData, userContext, uiContext) => {
  return components.map(component => ({
    ...component,
    _visibilityResult: evaluateComponentVisibility(
      component.visibility,
      recordData,
      userContext,
      uiContext
    ),
  })).filter(c => c._visibilityResult.visible);
};

export default evaluateComponentVisibility;
