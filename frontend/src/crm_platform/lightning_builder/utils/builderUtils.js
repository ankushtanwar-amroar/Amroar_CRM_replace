/**
 * Lightning Page Builder Utility Functions
 * Contains pure helper functions for the builder - no React dependencies
 */
import { pointerWithin, closestCenter } from '@dnd-kit/core';
import { OBJECT_FIELDS, DEFAULT_FIELDS, RELATED_OBJECTS } from '../constants/builderConstants';

const API = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';

/**
 * System/internal fields that should be excluded from Layout Editor
 * These are either:
 * - Auto-managed by the system (audit fields)
 * - Internal tracking fields
 * Note: Advanced fields (rollup, formula) are computed but SHOULD be shown
 */
const SYSTEM_EXCLUDED_FIELDS = new Set([
  // Audit fields (auto-managed)
  'created_at',
  'updated_at',
  'created_by',
  'updated_by',
  // System tracking
  'system_timestamp',
  'is_deleted',
  // Conversion tracking (read-only, set on conversion)
  'is_converted',
  'converted_date',
  'converted_at',
  'converted_account_id',
  'converted_contact_id',
  // Source tracking (read-only)
  'created_from_prospect',
  'source_prospect_id',
]);

/**
 * Check if a field should be excluded from the Layout Editor
 * @param {string} fieldKey - The field API name
 * @param {Object} fieldConfig - The field configuration from schema
 * @returns {boolean} True if field should be excluded
 */
export const isSystemExcludedField = (fieldKey, fieldConfig = {}) => {
  // Explicitly excluded fields
  if (SYSTEM_EXCLUDED_FIELDS.has(fieldKey)) {
    return true;
  }
  
  // Fields marked as system fields in schema
  if (fieldConfig.system_field === true) {
    return true;
  }
  
  // IMPORTANT: Advanced fields (rollup, formula) are computed but should NOT be excluded
  // They are user-created and should appear in layout editor
  if (fieldConfig.is_advanced_field === true) {
    return false;
  }
  
  return false;
};

/**
 * Fetch fields from schema API for a specific object
 * This is the NEW authoritative source for Layout Editor fields
 * @param {string} objectName - The object API name
 * @returns {Promise<Array>} Array of field definitions from schema
 */
export const fetchSchemaFields = async (objectName) => {
  try {
    const token = localStorage.getItem('token');
    if (!token) {
      console.warn('No token available for schema fetch, falling back to defaults');
      return null;
    }
    
    const response = await fetch(`${API}/api/objects/${objectName}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    if (!response.ok) {
      console.warn(`Failed to fetch schema for ${objectName}: ${response.status}`);
      return null;
    }
    
    const objectData = await response.json();
    const schemaFields = objectData.fields || {};
    
    // Convert schema fields to Layout Editor format
    // Filter out system/internal fields
    const layoutFields = Object.entries(schemaFields)
      .filter(([fieldKey, fieldConfig]) => !isSystemExcludedField(fieldKey, fieldConfig))
      .map(([fieldKey, fieldConfig]) => ({
        key: fieldKey,
        label: fieldConfig.label || fieldKey,
        type: mapSchemaTypeToEditorType(fieldConfig.type),
        required: fieldConfig.required || false,
        readOnly: fieldConfig.read_only || false,
        isCustom: fieldConfig.is_custom || false,
        description: fieldConfig.description || '',
        // Advanced field metadata
        isAdvancedField: fieldConfig.is_advanced_field || false,
        advancedFieldType: fieldConfig.advanced_field_type || null,
        computed: fieldConfig.computed || false,
        // Lookup specific
        lookupObject: fieldConfig.lookup_object || null,
        // Formula specific
        formula: fieldConfig.formula || null,
        // Rollup specific
        rollupType: fieldConfig.rollup_type || null,
        childObject: fieldConfig.child_object || null,
      }))
      .sort((a, b) => {
        // Sort: required first, then alphabetically by label
        if (a.required && !b.required) return -1;
        if (!a.required && b.required) return 1;
        return a.label.localeCompare(b.label);
      });
    
    console.log(`📋 Fetched ${layoutFields.length} layout-eligible fields for ${objectName} from schema`);
    return layoutFields;
    
  } catch (error) {
    console.error(`Error fetching schema fields for ${objectName}:`, error);
    return null;
  }
};

/**
 * Map schema field type to Layout Editor display type
 * @param {string} schemaType - The type from schema
 * @returns {string} The display type for the editor
 */
const mapSchemaTypeToEditorType = (schemaType) => {
  const typeMap = {
    'text': 'text',
    'email': 'email',
    'phone': 'phone',
    'url': 'url',
    'number': 'number',
    'currency': 'currency',
    'percent': 'number',
    'date': 'date',
    'datetime': 'datetime',
    'boolean': 'checkbox',
    'checkbox': 'checkbox',
    'select': 'picklist',
    'picklist': 'picklist',
    'textarea': 'textarea',
    'lookup': 'lookup',
    'reference': 'lookup',
    // Advanced field types
    'rollup': 'number',
    'formula': 'text',
  };
  return typeMap[schemaType?.toLowerCase()] || 'text';
};

/**
 * Get fields for a specific object type (LEGACY - fallback only)
 * @deprecated Use fetchSchemaFields instead for dynamic schema-based fields
 * @param {string} objectName - The object API name (e.g., 'lead', 'contact')
 * @returns {Array} Array of field definitions for the object
 */
export const getRecordFields = (objectName) => {
  const normalizedName = objectName?.toLowerCase() || 'lead';
  return OBJECT_FIELDS[normalizedName] || DEFAULT_FIELDS;
};

/**
 * Get default Record Detail items for a specific object type
 * @param {string} objectName - The object API name
 * @param {Array} schemaFields - Optional array of schema fields (preferred)
 * @returns {Array} Array of default field items for Record Detail component
 */
export const getDefaultRecordDetailItems = (objectName, schemaFields = null) => {
  // Prefer schemaFields if provided and non-empty
  if (schemaFields && schemaFields.length > 0) {
    return schemaFields.map(field => ({
      id: `field-${field.key}`,
      type: 'field',
      key: field.key,
      label: field.label || field.key
    }));
  }
  
  // Fall back to hardcoded fields for known objects
  const fields = getRecordFields(objectName);
  return fields.map(field => ({
    id: `field-${field.key}`,
    type: 'field',
    key: field.key,
    label: field.label
  }));
};

/**
 * Get related objects for a specific object type (internal builder use)
 * @param {string} objectName - The object API name
 * @returns {Array} Array of related object configurations
 */
export const getRelatedObjectsInternal = (objectName) => {
  const normalizedName = objectName?.toLowerCase() || 'lead';
  return RELATED_OBJECTS[normalizedName] || RELATED_OBJECTS.lead;
};

/**
 * Get default related lists for an object (first 3 by default)
 * @param {string} objectName - The object API name
 * @returns {Array} Array of default related list configurations
 */
export const getDefaultRelatedLists = (objectName) => {
  const relatedObjects = getRelatedObjectsInternal(objectName);
  return relatedObjects.slice(0, 3).map(obj => ({
    id: `related-${obj.id}`,
    objectId: obj.id,
    name: obj.name,
    icon: obj.icon,
    columns: obj.columns
  }));
};

/**
 * Custom collision detection that prioritizes nested droppables (like tabs-drop, record-detail-insert, and field-section-drop zones)
 * This ensures that when dragging over a component, the inner drop zone is detected instead of the parent region
 * @param {Object} args - DnD collision detection arguments
 * @returns {Array} Sorted collision results
 */
export const customCollisionDetection = (args) => {
  // First, try pointerWithin - this finds all droppables the pointer is over
  const pointerCollisions = pointerWithin(args);
  
  // Check if we're dragging a record-detail-field (for field reordering)
  const activeData = args.active?.data?.current;
  const isDraggingField = activeData?.type === 'record-detail-field';
  const isDraggingTabInnerComponent = activeData?.type === 'tab-inner-component';
  
  // If we have collisions, prioritize inner drop zones over regular regions
  if (pointerCollisions.length > 0) {
    // Sort to prioritize nested drop zones (they should be inside regions)
    const sorted = [...pointerCollisions].sort((a, b) => {
      const aId = a.id.toString();
      const bId = b.id.toString();
      const aData = a.data?.current;
      const bData = b.data?.current;
      
      // When dragging a tab-inner-component, prioritize other tab-inner-components
      if (isDraggingTabInnerComponent) {
        const aIsTabInner = aData?.type === 'tab-inner-component';
        const bIsTabInner = bData?.type === 'tab-inner-component';
        
        if (aIsTabInner && !bIsTabInner) return -1;
        if (!aIsTabInner && bIsTabInner) return 1;
        return 0;
      }
      
      // When dragging a field, prioritize other fields over section drop zones
      // This enables field-to-field reordering within sections
      if (isDraggingField) {
        const aIsField = aId.startsWith('field-') && !aId.startsWith('field-section-drop-');
        const bIsField = bId.startsWith('field-') && !bId.startsWith('field-section-drop-');
        const aIsSectionDrop = aId.startsWith('field-section-drop-');
        const bIsSectionDrop = bId.startsWith('field-section-drop-');
        
        // Individual fields have highest priority when dragging fields
        if (aIsField && !bIsField) return -1;
        if (!aIsField && bIsField) return 1;
        // Section drop zones come after individual fields
        if (aIsSectionDrop && !bIsSectionDrop) return -1;
        if (!aIsSectionDrop && bIsSectionDrop) return 1;
        return 0;
      }
      
      // Default priority for non-field drags:
      // Prioritize: insert-point > field-section-drop > record_detail > regions
      const aIsInsertPoint = aId.startsWith('insert-point-');
      const bIsInsertPoint = bId.startsWith('insert-point-');
      const aIsNestedDrop = aId.startsWith('tabs-drop-') || aId.startsWith('record-detail-insert-') || aId.startsWith('field-section-drop-');
      const bIsNestedDrop = bId.startsWith('tabs-drop-') || bId.startsWith('record-detail-insert-') || bId.startsWith('field-section-drop-');
      const aIsRecordDetail = aId.startsWith('record_detail-');
      const bIsRecordDetail = bId.startsWith('record_detail-');
      
      // Insert points have highest priority
      if (aIsInsertPoint && !bIsInsertPoint) return -1;
      if (!aIsInsertPoint && bIsInsertPoint) return 1;
      // Then nested drop zones
      if (aIsNestedDrop && !bIsNestedDrop) return -1;
      if (!aIsNestedDrop && bIsNestedDrop) return 1;
      // Then Record Detail components (before regions)
      if (aIsRecordDetail && !bIsRecordDetail) return -1;
      if (!aIsRecordDetail && bIsRecordDetail) return 1;
      return 0;
    });
    return sorted;
  }
  
  // Fall back to closestCenter for other cases
  return closestCenter(args);
};

/**
 * Generate a unique instance ID for a component
 * @param {string} componentId - The component type ID
 * @returns {string} A unique instance ID
 */
export const generateInstanceId = (componentId) => {
  return `${componentId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Check if a field key represents a link-type field
 * @param {string} key - The field key
 * @returns {boolean} True if the field should be displayed as a link
 */
export const isLinkField = (key) => {
  return ['email', 'phone', 'website', 'mobile'].includes(key);
};

/**
 * Check if a field key represents a badge-type field
 * @param {string} key - The field key
 * @returns {boolean} True if the field should be displayed as a badge
 */
export const isBadgeField = (key) => {
  return ['status', 'lead_status', 'stage', 'rating', 'priority'].includes(key);
};

/**
 * Sample field values for preview rendering
 */
export const SAMPLE_FIELD_VALUES = {
  first_name: 'John',
  last_name: 'Smith',
  email: 'john@acme.com',
  phone: '(555) 123-4567',
  company: 'Acme Corp',
  title: 'VP of Sales',
  website: 'www.acme.com',
  status: 'New',
  lead_source: 'Web',
  industry: 'Technology',
  rating: 'Hot',
  description: 'Key prospect for Q4',
  mobile: '(555) 987-6543',
  name: 'John Smith',
  account_id: 'Acme Corp',
  amount: '$50,000',
  close_date: '12/31/2025',
  stage: 'Proposal',
  probability: '75%',
  subject: 'Follow up call',
  due_date: 'Jan 24, 2026',
  priority: 'High',
  assigned_to: 'John Doe',
  location: 'Conference Room A',
  start_date: 'Jan 24, 2026 2:30 PM',
  end_date: 'Jan 24, 2026 3:30 PM',
};

/**
 * Get sample value for a field key
 * @param {string} key - The field key
 * @returns {string} Sample value or 'N/A'
 */
export const getSampleValue = (key) => {
  return SAMPLE_FIELD_VALUES[key] || 'N/A';
};
