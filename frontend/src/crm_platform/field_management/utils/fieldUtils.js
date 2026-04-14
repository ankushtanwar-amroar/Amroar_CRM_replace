/**
 * Generate API key from label
 * @param {string} label - Field label
 * @param {string} suffix - Optional suffix to append (e.g., '_id' for lookup fields)
 * @returns {string} Generated API key
 */
export const generateApiKey = (label, suffix = '') => {
  if (!label) return '';
  
  return label
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '') + suffix;
};

/**
 * Field type icons mapping
 */
export const FIELD_TYPE_ICONS = {
  lookup: 'Link',
  rollup: 'Calculator',
  formula: 'Function'
};

/**
 * Field type colors
 */
export const FIELD_TYPE_COLORS = {
  lookup: 'text-blue-600 bg-blue-50',
  rollup: 'text-purple-600 bg-purple-50',
  formula: 'text-green-600 bg-green-50'
};

/**
 * Rollup types
 */
export const ROLLUP_TYPES = [
  { value: 'COUNT', label: 'COUNT', description: 'Count all related records' },
  { value: 'SUM', label: 'SUM', description: 'Sum a field from related records' },
  { value: 'MIN', label: 'MIN', description: 'Get minimum value from related records' },
  { value: 'MAX', label: 'MAX', description: 'Get maximum value from related records' },
  { value: 'AVERAGE', label: 'AVERAGE', description: 'Average of a field from related records' }
];

/**
 * Formula return types
 */
export const FORMULA_RETURN_TYPES = [
  { value: 'Number', label: 'Number' },
  { value: 'Currency', label: 'Currency' },
  { value: 'Percent', label: 'Percent' },
  { value: 'Text', label: 'Text' },
  { value: 'Date', label: 'Date' },
  { value: 'DateTime', label: 'DateTime' },
  { value: 'Boolean', label: 'Checkbox' }
];

/**
 * Rollup result types - Only Number and Currency are supported
 */
export const ROLLUP_RESULT_TYPES = [
  { value: 'Number', label: 'Number' },
  { value: 'Currency', label: 'Currency' }
];

/**
 * Filter operators
 */
export const FILTER_OPERATORS = [
  { value: '=', label: 'equals' },
  { value: '!=', label: 'not equal to' },
  { value: 'contains', label: 'contains' },
  { value: 'not_contains', label: 'does not contain' },
  { value: 'starts_with', label: 'starts with' },
  { value: 'ends_with', label: 'ends with' },
  { value: '>', label: 'greater than' },
  { value: '<', label: 'less than' },
  { value: '>=', label: 'greater or equal' },
  { value: '<=', label: 'less or equal' },
  { value: 'in', label: 'in' },
  { value: 'not_in', label: 'not in' },
  { value: 'is_null', label: 'is blank' },
  { value: 'is_not_null', label: 'is not blank' }
];

/**
 * Enforcement modes for lookup filters
 */
export const ENFORCEMENT_MODES = [
  { value: 'filter_only', label: 'Filter results only', description: 'Only show matching records in dropdown' },
  { value: 'block_save', label: 'Block save if invalid', description: 'Prevent saving if selected record doesn\'t match filter' }
];

/**
 * Recalculation modes for rollup fields
 */
export const RECALCULATION_MODES = [
  { value: 'async', label: 'Asynchronous', description: 'Recalculate in background (recommended)' },
  { value: 'sync', label: 'Synchronous', description: 'Recalculate immediately (may slow down saves)' }
];
