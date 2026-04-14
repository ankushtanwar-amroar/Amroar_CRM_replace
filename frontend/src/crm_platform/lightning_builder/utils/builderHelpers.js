/**
 * Lightning Page Builder Helper Functions
 * Pure utility functions with no React state
 */
import { pointerWithin, closestCenter } from '@dnd-kit/core';
import { OBJECT_FIELDS, DEFAULT_FIELDS, RELATED_OBJECTS } from '../constants/builderConstants';

/**
 * Get fields for specific object type
 */
export const getRecordFields = (objectName) => {
  const normalizedName = objectName?.toLowerCase() || 'lead';
  return OBJECT_FIELDS[normalizedName] || DEFAULT_FIELDS;
};

/**
 * Get default Record Detail items for specific object type
 */
export const getDefaultRecordDetailItems = (objectName) => {
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
 */
export const getRelatedObjectsInternal = (objectName) => {
  const normalizedName = objectName?.toLowerCase() || 'lead';
  return RELATED_OBJECTS[normalizedName] || RELATED_OBJECTS.lead;
};

/**
 * Get default related lists for an object (first 3 by default)
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
 * Custom collision detection that prioritizes nested droppables
 * This ensures that when dragging over a component, the inner drop zone is detected instead of the parent region
 */
export const customCollisionDetection = (args) => {
  // First, try pointerWithin - this finds all droppables the pointer is over
  const pointerCollisions = pointerWithin(args);
  
  // If we have collisions, prioritize inner drop zones over regular regions
  if (pointerCollisions.length > 0) {
    // Sort to prioritize nested drop zones (they should be inside regions)
    const sorted = [...pointerCollisions].sort((a, b) => {
      const aId = a.id.toString();
      const bId = b.id.toString();
      const aIsNestedDrop = aId.startsWith('tabs-drop-') || aId.startsWith('record-detail-insert-') || aId.startsWith('field-section-drop-');
      const bIsNestedDrop = bId.startsWith('tabs-drop-') || bId.startsWith('record-detail-insert-') || bId.startsWith('field-section-drop-');
      if (aIsNestedDrop && !bIsNestedDrop) return -1;
      if (!aIsNestedDrop && bIsNestedDrop) return 1;
      return 0;
    });
    return sorted;
  }
  
  // Fall back to closestCenter for other cases
  return closestCenter(args);
};

/**
 * Generate unique instance ID for components
 */
export const generateInstanceId = () => {
  return `inst-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
};

/**
 * Get component icon name from lucide-react icon map
 */
export const getActivityIconName = (type) => {
  const iconMap = {
    event: 'Calendar',
    task: 'CheckCircle',
    email: 'Mail',
    call: 'Phone',
    note: 'FileText',
  };
  return iconMap[type] || 'FileText';
};

/**
 * Get activity colors for UI styling
 */
export const getActivityColors = (type) => {
  const colorMap = {
    event: { bg: 'bg-purple-100', text: 'text-purple-700', iconBg: 'bg-purple-500' },
    task: { bg: 'bg-green-100', text: 'text-green-700', iconBg: 'bg-green-500' },
    email: { bg: 'bg-blue-100', text: 'text-blue-700', iconBg: 'bg-blue-500' },
    call: { bg: 'bg-teal-100', text: 'text-teal-700', iconBg: 'bg-teal-500' },
    note: { bg: 'bg-slate-100', text: 'text-slate-700', iconBg: 'bg-slate-500' },
  };
  return colorMap[type] || colorMap.note;
};

/**
 * Deep merge two objects
 */
export const deepMerge = (target, source) => {
  const output = { ...target };
  if (isObject(target) && isObject(source)) {
    Object.keys(source).forEach(key => {
      if (isObject(source[key])) {
        if (!(key in target)) {
          Object.assign(output, { [key]: source[key] });
        } else {
          output[key] = deepMerge(target[key], source[key]);
        }
      } else {
        Object.assign(output, { [key]: source[key] });
      }
    });
  }
  return output;
};

const isObject = (item) => {
  return item && typeof item === 'object' && !Array.isArray(item);
};

/**
 * Sample field values for preview
 */
export const SAMPLE_FIELD_VALUES = {
  subject: 'Follow up call',
  description: 'Discuss Q1 targets and partnership opportunities',
  status: 'In Progress',
  priority: 'High',
  due_date: 'Jan 24, 2026',
  start_date: 'Jan 24, 2026 2:30 PM',
  end_date: 'Jan 24, 2026 3:30 PM',
  assigned_to: 'John Doe',
  location: 'Conference Room A',
  call_date: 'Jan 24, 2026 10:00 AM',
  duration: '30 mins',
  call_result: 'Successful',
  related_to: 'Acme Corp',
};

/**
 * Field labels for display
 */
export const FIELD_LABELS = {
  subject: 'Subject',
  description: 'Description',
  status: 'Status',
  priority: 'Priority',
  due_date: 'Due Date',
  start_date: 'Start Date',
  end_date: 'End Date',
  assigned_to: 'Assigned To',
  location: 'Location',
  call_date: 'Call Date',
  duration: 'Duration',
  call_result: 'Result',
  related_to: 'Related To',
};
