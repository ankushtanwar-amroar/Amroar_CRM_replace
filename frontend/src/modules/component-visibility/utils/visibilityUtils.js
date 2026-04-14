/**
 * Visibility Utilities
 * Helper functions for component visibility
 */

import { VISIBILITY_MODES, CONDITION_SOURCES, createEmptyCondition } from '../types/visibilityTypes';

/**
 * Create default visibility config (always show)
 */
export const createDefaultVisibility = () => ({
  mode: VISIBILITY_MODES.ALWAYS,
});

/**
 * Create visibility config with conditions
 */
export const createVisibilityWithConditions = (mode, logic = 'AND', conditions = []) => ({
  mode,
  logic,
  conditions: conditions.length > 0 ? conditions : [createEmptyCondition()],
});

/**
 * Check if visibility config is default (always show)
 */
export const isDefaultVisibility = (visibility) => {
  if (!visibility) return true;
  if (visibility.mode === VISIBILITY_MODES.ALWAYS || !visibility.mode) return true;
  return false;
};

/**
 * Check if visibility config has conditions
 */
export const hasVisibilityConditions = (visibility) => {
  if (!visibility) return false;
  if (visibility.mode === VISIBILITY_MODES.ALWAYS) return false;
  return visibility.conditions && visibility.conditions.length > 0;
};

/**
 * Get field type from field metadata
 */
export const getFieldType = (fieldKey, objectFields = []) => {
  const field = objectFields.find(f => 
    f.key === fieldKey || f.api_name === fieldKey || f.name === fieldKey
  );
  return field?.type || 'text';
};

/**
 * Get picklist options from field metadata
 */
export const getPicklistOptions = (fieldKey, objectFields = []) => {
  const field = objectFields.find(f => 
    f.key === fieldKey || f.api_name === fieldKey || f.name === fieldKey
  );
  
  if (!field) return [];
  
  // Handle different picklist structures
  if (field.options) return field.options;
  if (field.picklist_values) return field.picklist_values;
  if (field.values) return field.values;
  
  return [];
};

/**
 * Format field label for display
 */
export const formatFieldLabel = (fieldKey) => {
  return fieldKey
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, c => c.toUpperCase());
};

/**
 * Get condition summary text for display
 */
export const getConditionSummary = (condition, objectFields = []) => {
  const { source, left, operator, right } = condition;
  
  // Get field label
  let fieldLabel = left;
  if (source === CONDITION_SOURCES.RECORD) {
    const field = objectFields.find(f => f.key === left || f.api_name === left);
    fieldLabel = field?.label || formatFieldLabel(left);
  }
  
  // Get operator label
  const operatorLabels = {
    '=': 'equals',
    '!=': 'not equals',
    '>': 'greater than',
    '<': 'less than',
    '>=': 'greater than or equal',
    '<=': 'less than or equal',
    'contains': 'contains',
    'not_contains': 'does not contain',
    'is_null': 'is empty',
    'is_not_null': 'is not empty',
    'in': 'is in',
    'not_in': 'is not in',
  };
  
  const opLabel = operatorLabels[operator] || operator;
  
  // Build summary
  if (['is_null', 'is_not_null'].includes(operator)) {
    return `${fieldLabel} ${opLabel}`;
  }
  
  return `${fieldLabel} ${opLabel} "${right}"`;
};

/**
 * Get visibility summary for component
 */
export const getVisibilitySummary = (visibility, objectFields = []) => {
  if (!visibility || visibility.mode === VISIBILITY_MODES.ALWAYS) {
    return 'Always visible';
  }
  
  const conditions = visibility.conditions || [];
  if (conditions.length === 0) {
    return 'Always visible (no conditions)';
  }
  
  const modeLabel = visibility.mode === VISIBILITY_MODES.SHOW_WHEN ? 'Show when' : 'Hide when';
  const logic = visibility.logic || 'AND';
  
  if (conditions.length === 1) {
    return `${modeLabel}: ${getConditionSummary(conditions[0], objectFields)}`;
  }
  
  return `${modeLabel}: ${conditions.length} conditions (${logic})`;
};

/**
 * Debounce function for visibility re-evaluation
 */
export const createVisibilityDebouncer = (delay = 200) => {
  let timeoutId = null;
  
  return (callback) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      callback();
      timeoutId = null;
    }, delay);
  };
};

/**
 * Deep clone visibility config
 */
export const cloneVisibility = (visibility) => {
  if (!visibility) return null;
  return JSON.parse(JSON.stringify(visibility));
};

/**
 * Migrate old visibility format to new format
 * Handles backward compatibility with existing layouts
 */
export const migrateVisibilityConfig = (component) => {
  // If already has new visibility format, return as-is
  if (component.visibility) {
    return component.visibility;
  }
  
  // Check for old single-condition format in properties
  const props = component.properties || {};
  
  if (props.visibilityField) {
    // Migrate old format to new format
    return {
      mode: VISIBILITY_MODES.SHOW_WHEN,
      logic: 'AND',
      conditions: [{
        id: `migrated-${Date.now()}`,
        source: CONDITION_SOURCES.RECORD,
        left: props.visibilityField,
        operator: props.visibilityOperator === 'is_empty' ? 'is_null' :
                  props.visibilityOperator === 'is_not_empty' ? 'is_not_null' :
                  props.visibilityOperator || '=',
        right: props.visibilityValue || '',
      }],
    };
  }
  
  // No visibility config
  return null;
};
