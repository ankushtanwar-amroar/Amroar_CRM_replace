/**
 * Component Visibility Types and Constants
 * Defines the schema and constants for visibility rules
 */

// Visibility modes
export const VISIBILITY_MODES = {
  ALWAYS: 'always',
  SHOW_WHEN: 'showWhen',
  HIDE_WHEN: 'hideWhen',
};

// Logic operators for combining conditions
export const LOGIC_OPERATORS = {
  AND: 'AND',
  OR: 'OR',
};

// Condition sources
export const CONDITION_SOURCES = {
  RECORD: 'record',
  USER: 'user',
  CONTEXT: 'context',
};

// Operators by field type
export const OPERATORS = {
  // Text operators
  TEXT: [
    { value: '=', label: 'Equals' },
    { value: '!=', label: 'Not Equals' },
    { value: 'contains', label: 'Contains' },
    { value: 'not_contains', label: 'Does Not Contain' },
    { value: 'starts_with', label: 'Starts With' },
    { value: 'ends_with', label: 'Ends With' },
    { value: 'is_null', label: 'Is Empty' },
    { value: 'is_not_null', label: 'Is Not Empty' },
  ],
  // Number operators
  NUMBER: [
    { value: '=', label: 'Equals' },
    { value: '!=', label: 'Not Equals' },
    { value: '>', label: 'Greater Than' },
    { value: '<', label: 'Less Than' },
    { value: '>=', label: 'Greater Than or Equal' },
    { value: '<=', label: 'Less Than or Equal' },
    { value: 'is_null', label: 'Is Empty' },
    { value: 'is_not_null', label: 'Is Not Empty' },
  ],
  // Picklist operators
  PICKLIST: [
    { value: '=', label: 'Equals' },
    { value: '!=', label: 'Not Equals' },
    { value: 'in', label: 'In' },
    { value: 'not_in', label: 'Not In' },
    { value: 'is_null', label: 'Is Empty' },
    { value: 'is_not_null', label: 'Is Not Empty' },
  ],
  // Boolean operators
  BOOLEAN: [
    { value: '=', label: 'Equals' },
    { value: '!=', label: 'Not Equals' },
  ],
  // Date operators
  DATE: [
    { value: '=', label: 'Equals' },
    { value: '!=', label: 'Not Equals' },
    { value: '>', label: 'After' },
    { value: '<', label: 'Before' },
    { value: '>=', label: 'On or After' },
    { value: '<=', label: 'On or Before' },
    { value: 'is_null', label: 'Is Empty' },
    { value: 'is_not_null', label: 'Is Not Empty' },
  ],
  // User-based operators
  USER: [
    { value: '=', label: 'Equals' },
    { value: '!=', label: 'Not Equals' },
    { value: 'in', label: 'In' },
    { value: 'not_in', label: 'Not In' },
  ],
};

// Operators that don't require a value input
export const NO_VALUE_OPERATORS = ['is_null', 'is_not_null'];

// User context fields
export const USER_FIELDS = [
  { key: 'User.Role', label: 'User Role', type: 'picklist' },
  { key: 'User.Profile', label: 'User Profile', type: 'picklist' },
  { key: 'User.IsAdmin', label: 'Is Admin', type: 'boolean' },
];

// Common user roles (can be extended)
export const USER_ROLES = [
  { value: 'admin', label: 'Admin' },
  { value: 'manager', label: 'Manager' },
  { value: 'sales_rep', label: 'Sales Rep' },
  { value: 'support', label: 'Support' },
  { value: 'viewer', label: 'Viewer' },
];

// Common user profiles
export const USER_PROFILES = [
  { value: 'system_administrator', label: 'System Administrator' },
  { value: 'sales_manager', label: 'Sales Manager' },
  { value: 'sales_user', label: 'Sales User' },
  { value: 'support_user', label: 'Support User' },
  { value: 'read_only', label: 'Read Only' },
];

/**
 * Get operators for a field type
 */
export const getOperatorsForFieldType = (fieldType) => {
  const type = (fieldType || 'text').toLowerCase();
  
  if (['number', 'currency', 'percent', 'integer', 'decimal'].includes(type)) {
    return OPERATORS.NUMBER;
  }
  if (['picklist', 'select', 'multipicklist', 'multiselect'].includes(type)) {
    return OPERATORS.PICKLIST;
  }
  if (['boolean', 'checkbox'].includes(type)) {
    return OPERATORS.BOOLEAN;
  }
  if (['date', 'datetime'].includes(type)) {
    return OPERATORS.DATE;
  }
  // Default to text operators
  return OPERATORS.TEXT;
};

/**
 * Check if operator requires a value
 */
export const operatorRequiresValue = (operator) => {
  return !NO_VALUE_OPERATORS.includes(operator);
};

/**
 * Default visibility config (always show)
 */
export const DEFAULT_VISIBILITY = {
  mode: VISIBILITY_MODES.ALWAYS,
};

/**
 * Create a new empty condition
 */
export const createEmptyCondition = () => ({
  id: `cond-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
  source: CONDITION_SOURCES.RECORD,
  left: '',
  operator: '=',
  right: '',
});

/**
 * Validate a visibility configuration
 */
export const isValidVisibilityConfig = (visibility) => {
  if (!visibility) return true; // No config = always show (valid)
  if (visibility.mode === VISIBILITY_MODES.ALWAYS) return true;
  
  // For showWhen/hideWhen, must have at least one condition
  if (!visibility.conditions || visibility.conditions.length === 0) {
    return false;
  }
  
  // Each condition must have left and operator
  return visibility.conditions.every(c => c.left && c.operator);
};
