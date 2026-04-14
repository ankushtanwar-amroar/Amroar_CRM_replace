/**
 * List View Utility Functions
 * Pure helper functions with no side effects
 */

import { Mail, Phone, Building, FileText } from 'lucide-react';

/**
 * Get the display name for a record
 */
export const getRecordName = (record, object) => {
  // Try the configured name field first
  if (object?.name_field && record?.data?.[object.name_field]) {
    return record.data[object.name_field];
  }
  
  const data = record?.data || {};
  
  // Try concatenated first and last name
  const hasFirstName = data.first_name !== undefined;
  const hasLastName = data.last_name !== undefined;
  if (hasFirstName || hasLastName) {
    const fullName = `${data.first_name || ''} ${data.last_name || ''}`.trim();
    if (fullName) return fullName;
  }
  
  // Try common name fields
  if (data.account_name) return data.account_name;
  if (data.name) return data.name;
  if (data.subject) return data.subject;
  if (data.title) return data.title;
  
  // Fallback to first field
  const firstField = object?.fields ? Object.keys(object.fields)[0] : null;
  if (firstField && data[firstField]) {
    return data[firstField];
  }
  
  return 'Unnamed Record';
};

/**
 * Check if a view is a system view (non-editable)
 */
export const isSystemView = (viewId) => {
  return viewId === 'all_records' || viewId === 'recently_viewed' || viewId === 'my_records';
};

/**
 * Check if a field is editable (for inline editing)
 */
export const isFieldEditable = (fieldKey, field) => {
  if (!field) return false;
  
  // Non-editable field types
  const nonEditableTypes = ['lookup', 'formula', 'rollup', 'auto_number'];
  if (nonEditableTypes.includes(field.type)) return false;
  
  // System fields that shouldn't be edited inline
  const systemFields = ['id', 'series_id', 'created_at', 'updated_at', 'created_by'];
  if (systemFields.includes(fieldKey)) return false;
  
  return true;
};

/**
 * Get the appropriate icon for a field based on its type/name
 */
export const getFieldIcon = (fieldKey, field, size = 'small') => {
  const sizeClass = size === 'small' ? 'h-3 w-3' : 'h-4 w-4';
  
  if (field?.type === 'email' || fieldKey.toLowerCase().includes('email')) {
    return { component: Mail, className: sizeClass };
  }
  if (field?.type === 'phone' || fieldKey.toLowerCase().includes('phone')) {
    return { component: Phone, className: sizeClass };
  }
  if (fieldKey.toLowerCase().includes('company')) {
    return { component: Building, className: sizeClass };
  }
  return { component: FileText, className: sizeClass };
};

/**
 * Get column color class for Kanban view
 */
export const getKanbanColumnColor = (value) => {
  const valueLower = value.toLowerCase();
  // Status-like colors
  if (valueLower.includes('new') || valueLower.includes('open')) return 'bg-blue-100 text-blue-800';
  if (valueLower.includes('progress') || valueLower.includes('contacted') || valueLower.includes('working')) return 'bg-yellow-100 text-yellow-800';
  if (valueLower.includes('qualified') || valueLower.includes('won') || valueLower.includes('closed') || valueLower.includes('converted')) return 'bg-green-100 text-green-800';
  if (valueLower.includes('lost') || valueLower.includes('cancelled') || valueLower.includes('unqualified')) return 'bg-red-100 text-red-800';
  // Lead Source-like colors
  if (valueLower.includes('web') || valueLower.includes('online')) return 'bg-indigo-100 text-indigo-800';
  if (valueLower.includes('phone') || valueLower.includes('call')) return 'bg-purple-100 text-purple-800';
  if (valueLower.includes('partner') || valueLower.includes('referral')) return 'bg-orange-100 text-orange-800';
  if (valueLower.includes('trade') || valueLower.includes('event')) return 'bg-pink-100 text-pink-800';
  // Unassigned
  if (valueLower === 'unassigned') return 'bg-gray-100 text-gray-600';
  return 'bg-slate-100 text-slate-800';
};

/**
 * Format currency value for display
 */
export const formatCurrency = (value) => {
  if (!value) return '-';
  return `$${Number(value).toLocaleString()}`;
};

/**
 * Format boolean value for display
 */
export const formatBoolean = (value) => {
  return value ? '✓ Yes' : '✗ No';
};

/**
 * Get default visible columns for an object
 */
export const getDefaultColumns = (object) => {
  const systemFields = Object.entries(object.fields)
    .filter(([key, field]) => !field.is_custom)
    .map(([key]) => key)
    .slice(0, 3);

  const customFields = Object.entries(object.fields)
    .filter(([key, field]) => field.is_custom)
    .map(([key]) => key);

  return [...systemFields, ...customFields];
};

/**
 * Load visible columns from localStorage or return defaults
 */
export const loadColumnsFromStorage = (objectName, object) => {
  const savedColumns = localStorage.getItem(`columns_${objectName}`);
  if (savedColumns) {
    return JSON.parse(savedColumns);
  }
  return getDefaultColumns(object);
};

/**
 * Save visible columns to localStorage
 */
export const saveColumnsToStorage = (objectName, columns) => {
  localStorage.setItem(`columns_${objectName}`, JSON.stringify(columns));
};

/**
 * Convert filter_criteria object to array format for wizard
 */
export const filterCriteriaToArray = (filterCriteria) => {
  if (!filterCriteria) return [];
  
  return Object.entries(filterCriteria).map(([field, config]) => ({
    field,
    condition: typeof config === 'object' ? config.condition : 'equals',
    value: typeof config === 'object' ? config.value : config
  }));
};

/**
 * Convert filters array to filter_criteria object format for API
 */
export const filtersArrayToCriteria = (filters) => {
  const criteria = {};
  filters.forEach(filter => {
    if (filter.field && filter.value) {
      criteria[filter.field] = {
        condition: filter.condition || 'equals',
        value: filter.value
      };
    }
  });
  return criteria;
};

/**
 * Calculate pagination display range
 */
export const getPaginationRange = (currentPage, totalPages, maxButtons = 5) => {
  const pages = [];
  
  if (totalPages <= maxButtons) {
    for (let i = 1; i <= totalPages; i++) {
      pages.push(i);
    }
  } else if (currentPage <= 3) {
    for (let i = 1; i <= maxButtons; i++) {
      pages.push(i);
    }
  } else if (currentPage >= totalPages - 2) {
    for (let i = totalPages - 4; i <= totalPages; i++) {
      pages.push(i);
    }
  } else {
    for (let i = currentPage - 2; i <= currentPage + 2; i++) {
      pages.push(i);
    }
  }
  
  return pages;
};

/**
 * Get picklist fields from object for Kanban grouping
 */
export const getPicklistFields = (object) => {
  return Object.entries(object.fields)
    .filter(([key, field]) => 
      (field.type === 'picklist' || field.type === 'select') && 
      field.options && field.options.length > 0
    )
    .map(([key, field]) => ({
      key,
      label: field.label || key,
      options: field.options || []
    }));
};

/**
 * Find default picklist field for Kanban (prioritizes 'status')
 */
export const getDefaultKanbanField = (picklistFields) => {
  if (picklistFields.length === 0) return null;
  
  const statusField = picklistFields.find(f => 
    f.key.toLowerCase().includes('status') || 
    f.label.toLowerCase().includes('status')
  );
  
  return statusField ? statusField.key : picklistFields[0].key;
};

export default {
  getRecordName,
  isSystemView,
  isFieldEditable,
  getFieldIcon,
  getKanbanColumnColor,
  formatCurrency,
  formatBoolean,
  getDefaultColumns,
  loadColumnsFromStorage,
  saveColumnsToStorage,
  filterCriteriaToArray,
  filtersArrayToCriteria,
  getPaginationRange,
  getPicklistFields,
  getDefaultKanbanField,
};
