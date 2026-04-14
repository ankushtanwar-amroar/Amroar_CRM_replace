/**
 * Field Behavior Rules Engine
 * Core evaluation logic for field visibility, required, and read-only rules
 * 
 * Key behaviors:
 * - No rule config OR mode="always" for visibility → always visible
 * - mode="always" for required → always required  
 * - mode="editable" for readonly → always editable
 * - Missing data dependencies → safe defaults (hidden=true for visibility when conditional)
 * - Supports record field and parent lookup evaluation
 */

// Rule modes
export const RULE_MODES = {
  ALWAYS: 'always',
  CONDITIONAL: 'conditional',
  EDITABLE: 'editable'
};

// Rule types
export const RULE_TYPES = {
  BASIC: 'basic',
  FORMULA: 'formula'
};

// Operators for basic conditions
export const OPERATORS = {
  EQUALS: '=',
  NOT_EQUALS: '!=',
  GREATER_THAN: '>',
  LESS_THAN: '<',
  GREATER_OR_EQUAL: '>=',
  LESS_OR_EQUAL: '<=',
  CONTAINS: 'contains',
  NOT_CONTAINS: 'not_contains',
  STARTS_WITH: 'starts_with',
  ENDS_WITH: 'ends_with',
  IS_NULL: 'is_null',
  IS_NOT_NULL: 'is_not_null',
  INCLUDES: 'includes'
};

/**
 * Get value from data using field path (supports dot notation)
 * @param {Object} data - Record data merged with parent data
 * @param {string} fieldPath - Field path like "Stage" or "Account.Industry"
 * @returns {any} The field value or undefined
 */
const getFieldValue = (data, fieldPath) => {
  if (!fieldPath || !data) return undefined;
  
  // Direct field access
  if (data[fieldPath] !== undefined) {
    return data[fieldPath];
  }
  
  // Case-insensitive lookup
  const fieldPathLower = fieldPath.toLowerCase();
  for (const key in data) {
    if (key.toLowerCase() === fieldPathLower) {
      return data[key];
    }
  }
  
  // Dot notation for parent fields (already merged into data)
  // E.g., "Account.Industry" should be in data as "Account.Industry"
  return undefined;
};

/**
 * Normalize value for comparison
 */
const normalizeValue = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value.toLowerCase().trim();
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value;
  return String(value).toLowerCase().trim();
};

/**
 * Compare two values with type coercion
 */
const compareValues = (left, right, operator) => {
  const leftNorm = normalizeValue(left);
  const rightNorm = normalizeValue(right);
  
  // Handle null checks
  if (operator === OPERATORS.IS_NULL) {
    return left === null || left === undefined || left === '';
  }
  if (operator === OPERATORS.IS_NOT_NULL) {
    return left !== null && left !== undefined && left !== '';
  }
  
  // Handle null values for comparison
  if (leftNorm === null && rightNorm === null) {
    return operator === OPERATORS.EQUALS;
  }
  if (leftNorm === null || rightNorm === null) {
    return operator === OPERATORS.NOT_EQUALS;
  }
  
  switch (operator) {
    case OPERATORS.EQUALS:
      return leftNorm === rightNorm;
    case OPERATORS.NOT_EQUALS:
      return leftNorm !== rightNorm;
    case OPERATORS.GREATER_THAN:
      return Number(left) > Number(right);
    case OPERATORS.LESS_THAN:
      return Number(left) < Number(right);
    case OPERATORS.GREATER_OR_EQUAL:
      return Number(left) >= Number(right);
    case OPERATORS.LESS_OR_EQUAL:
      return Number(left) <= Number(right);
    case OPERATORS.CONTAINS:
      return String(leftNorm || '').includes(String(rightNorm || ''));
    case OPERATORS.NOT_CONTAINS:
      return !String(leftNorm || '').includes(String(rightNorm || ''));
    case OPERATORS.STARTS_WITH:
      return String(leftNorm || '').startsWith(String(rightNorm || ''));
    case OPERATORS.ENDS_WITH:
      return String(leftNorm || '').endsWith(String(rightNorm || ''));
    case OPERATORS.INCLUDES:
      // For multi-select picklists
      const values = Array.isArray(left) ? left : String(left || '').split(';');
      return values.map(v => normalizeValue(v)).includes(rightNorm);
    default:
      return leftNorm === rightNorm;
  }
};

/**
 * Evaluate a basic condition
 * @param {Object} condition - { left: string, operator: string, right: any }
 * @param {Object} data - Merged record data
 * @returns {{ result: boolean, error: string|null }}
 */
const evaluateBasicCondition = (condition, data) => {
  if (!condition || !condition.left || !condition.operator) {
    return { result: true, error: null }; // No condition = default true
  }
  
  try {
    const leftValue = getFieldValue(data, condition.left);
    const result = compareValues(leftValue, condition.right, condition.operator);
    return { result, error: null };
  } catch (err) {
    return { result: false, error: err.message };
  }
};

/**
 * Evaluate a single rule (visibility, required, or readonly)
 * @param {Object} rule - Rule configuration with mode, type, basic, formula
 * @param {Object} data - Merged record data
 * @param {boolean} defaultResult - Default result if no rule
 * @param {string} pageType - 'new', 'edit', or 'view'
 * @returns {{ result: boolean, needsServerEval: boolean, error: string|null }}
 */
export const evaluateRule = (rule, data, defaultResult = true, pageType = 'edit') => {
  if (!rule) {
    return { result: defaultResult, needsServerEval: false, error: null };
  }
  
  const { mode, type, basic, formula } = rule;
  
  // Handle mode-based defaults
  if (mode === RULE_MODES.ALWAYS) {
    return { result: true, needsServerEval: false, error: null };
  }
  if (mode === RULE_MODES.EDITABLE) {
    return { result: false, needsServerEval: false, error: null };
  }
  if (mode !== RULE_MODES.CONDITIONAL) {
    return { result: defaultResult, needsServerEval: false, error: null };
  }
  
  // Conditional mode - evaluate the condition
  if (type === RULE_TYPES.FORMULA && formula) {
    // Formula rules need server evaluation
    return { result: defaultResult, needsServerEval: true, error: null };
  }
  
  if (type === RULE_TYPES.BASIC && basic) {
    const { result, error } = evaluateBasicCondition(basic, data);
    return { result, needsServerEval: false, error };
  }
  
  // No condition defined, return default
  return { result: defaultResult, needsServerEval: false, error: null };
};

/**
 * Evaluate all behavior rules for a single field
 * @param {Object} fieldConfig - Field configuration with rules
 * @param {Object} recordData - Current record data
 * @param {Object} parentData - Resolved parent lookup data
 * @param {string} pageType - 'new', 'edit', or 'view'
 * @returns {Object} Evaluation result
 */
export const evaluateFieldBehavior = (fieldConfig, recordData, parentData = {}, pageType = 'edit') => {
  // Merge parent data into record data
  const mergedData = { ...recordData, ...parentData };
  
  const errors = [];
  let needsServerEval = false;
  
  // Evaluate visibility (default: visible)
  const visResult = evaluateRule(
    fieldConfig.visibilityRule,
    mergedData,
    true, // default visible
    pageType
  );
  let isVisible = visResult.result;
  if (visResult.needsServerEval) needsServerEval = true;
  if (visResult.error) errors.push(`Visibility: ${visResult.error}`);
  
  // Evaluate required (default: not required)
  const reqResult = evaluateRule(
    fieldConfig.requiredRule,
    mergedData,
    false, // default not required
    pageType
  );
  let isRequired = reqResult.result;
  if (reqResult.needsServerEval) needsServerEval = true;
  if (reqResult.error) errors.push(`Required: ${reqResult.error}`);
  
  // Evaluate readonly (default: editable)
  let isReadonly = false;
  if (pageType === 'view') {
    // View pages are always readonly
    isReadonly = true;
  } else {
    const roResult = evaluateRule(
      fieldConfig.readonlyRule,
      mergedData,
      false, // default editable
      pageType
    );
    isReadonly = roResult.result;
    if (roResult.needsServerEval) needsServerEval = true;
    if (roResult.error) errors.push(`ReadOnly: ${roResult.error}`);
  }
  
  // Hidden fields can't be required
  if (!isVisible) {
    isRequired = false;
  }
  
  return {
    fieldApiName: fieldConfig.fieldApiName || fieldConfig.key,
    isVisible,
    isRequired,
    isReadonly,
    needsServerEval,
    evaluationErrors: errors.length > 0 ? errors : null
  };
};

/**
 * Evaluate rules for multiple fields
 * @param {Array} fieldConfigs - Array of field configurations
 * @param {Object} recordData - Current record data
 * @param {Object} parentData - Resolved parent lookup data  
 * @param {string} pageType - 'new', 'edit', or 'view'
 * @returns {Object} Map of fieldApiName -> evaluation result
 */
export const evaluateAllFieldBehaviors = (fieldConfigs, recordData, parentData = {}, pageType = 'edit') => {
  const results = {};
  
  for (const config of fieldConfigs) {
    const fieldKey = config.fieldApiName || config.key;
    if (!fieldKey) continue;
    
    results[fieldKey] = evaluateFieldBehavior(config, recordData, parentData, pageType);
  }
  
  return results;
};

/**
 * Extract parent field references from field configurations
 * @param {Array} fieldConfigs - Array of field configurations with rules
 * @returns {Array} List of parent field paths like ["Account.Industry"]
 */
export const extractParentReferences = (fieldConfigs) => {
  const refs = new Set();
  
  for (const config of fieldConfigs) {
    // Check visibility rule
    if (config.visibilityRule?.basic?.left?.includes('.')) {
      refs.add(config.visibilityRule.basic.left);
    }
    if (config.visibilityRule?.formula) {
      extractRefsFromFormula(config.visibilityRule.formula, refs);
    }
    
    // Check required rule
    if (config.requiredRule?.basic?.left?.includes('.')) {
      refs.add(config.requiredRule.basic.left);
    }
    if (config.requiredRule?.formula) {
      extractRefsFromFormula(config.requiredRule.formula, refs);
    }
    
    // Check readonly rule
    if (config.readonlyRule?.basic?.left?.includes('.')) {
      refs.add(config.readonlyRule.basic.left);
    }
    if (config.readonlyRule?.formula) {
      extractRefsFromFormula(config.readonlyRule.formula, refs);
    }
  }
  
  return Array.from(refs);
};

/**
 * Extract parent references from a formula string
 */
const extractRefsFromFormula = (formula, refs) => {
  // Match patterns like "Account.Industry" or "Account.Owner.Name"
  const pattern = /\b([A-Z][a-zA-Z0-9_]*(?:\.[A-Z][a-zA-Z0-9_]*)+)\b/g;
  const matches = formula.match(pattern);
  if (matches) {
    matches.forEach(m => refs.add(m));
  }
};

/**
 * Check if any field has rules that need evaluation
 * @param {Array} fieldConfigs - Array of field configurations
 * @returns {boolean}
 */
export const hasFieldBehaviorRules = (fieldConfigs) => {
  if (!fieldConfigs || fieldConfigs.length === 0) return false;
  
  return fieldConfigs.some(config => {
    const hasVisRule = config.visibilityRule && config.visibilityRule.mode !== RULE_MODES.ALWAYS;
    const hasReqRule = config.requiredRule && config.requiredRule.mode !== RULE_MODES.CONDITIONAL;
    const hasRoRule = config.readonlyRule && config.readonlyRule.mode !== RULE_MODES.EDITABLE;
    return hasVisRule || hasReqRule || hasRoRule;
  });
};

export default {
  RULE_MODES,
  RULE_TYPES,
  OPERATORS,
  evaluateRule,
  evaluateFieldBehavior,
  evaluateAllFieldBehaviors,
  extractParentReferences,
  hasFieldBehaviorRules
};
