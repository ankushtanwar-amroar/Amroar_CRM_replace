/**
 * Activity Component Configuration Defaults
 * Default activity types and configuration for first-time component drop
 */

// Default activity types included when component is first added
export const DEFAULT_ACTIVITY_TYPES = [
  {
    type: 'event',
    label: 'Event',
    enabledInTimeline: true,
    newButtonEnabled: true,
    newButtonLabel: 'New Event',
    dateField: 'start_date',
    titleField: 'subject',
    statusField: 'status',
    icon: 'calendar',
    color: 'purple',
    fieldConfig: {
      createFields: ['subject', 'start_date', 'end_date', 'location', 'description'],
      timelineFields: ['subject', 'start_date', 'status'],
    },
  },
  {
    type: 'task',
    label: 'Task',
    enabledInTimeline: true,
    newButtonEnabled: true,
    newButtonLabel: 'New Task',
    dateField: 'due_date',
    titleField: 'subject',
    statusField: 'status',
    icon: 'check-circle',
    color: 'green',
    fieldConfig: {
      createFields: ['subject', 'due_date', 'status', 'priority', 'description'],
      timelineFields: ['subject', 'status', 'due_date'],
    },
  },
  {
    type: 'email',
    label: 'Email',
    enabledInTimeline: true,
    newButtonEnabled: true,
    newButtonLabel: 'New Email',
    dateField: 'created_at',
    titleField: 'subject',
    statusField: null,
    icon: 'mail',
    color: 'blue',
    fieldConfig: {
      createFields: ['subject', 'to_address', 'body'],
      timelineFields: ['subject', 'to_address'],
    },
  },
];

// All available activity types that can be configured
export const AVAILABLE_ACTIVITY_TYPES = [
  {
    type: 'event',
    label: 'Event',
    icon: 'calendar',
    color: 'purple',
    defaultDateField: 'start_date',
    defaultTitleField: 'subject',
    defaultStatusField: 'status',
  },
  {
    type: 'task',
    label: 'Task',
    icon: 'check-circle',
    color: 'green',
    defaultDateField: 'due_date',
    defaultTitleField: 'subject',
    defaultStatusField: 'status',
  },
  {
    type: 'email',
    label: 'Email',
    icon: 'mail',
    color: 'blue',
    defaultDateField: 'created_at',
    defaultTitleField: 'subject',
    defaultStatusField: null,
  },
  {
    type: 'call',
    label: 'Call',
    icon: 'phone',
    color: 'teal',
    defaultDateField: 'call_date',
    defaultTitleField: 'subject',
    defaultStatusField: 'status',
  },
  {
    type: 'note',
    label: 'Note',
    icon: 'file-text',
    color: 'slate',
    defaultDateField: 'created_at',
    defaultTitleField: 'title',
    defaultStatusField: null,
  },
];

// Relationship field mappings for auto-linking activities to parent records
export const ACTIVITY_RELATIONSHIP_FIELDS = {
  event: {
    parentIdField: 'related_to',
    parentTypeField: 'related_to_type',
  },
  task: {
    parentIdField: 'related_to',
    parentTypeField: 'related_to_type',
  },
  email: {
    parentIdField: 'related_to',
    parentTypeField: 'related_to_type',
  },
  call: {
    parentIdField: 'related_to',
    parentTypeField: 'related_to_type',
  },
  note: {
    parentIdField: 'parent_id',
    parentTypeField: 'parent_type',
  },
};

// Icon mapping
export const ACTIVITY_ICONS = {
  event: 'Calendar',
  task: 'CheckCircle',
  email: 'Mail',
  call: 'Phone',
  note: 'FileText',
};

// Color mapping
export const ACTIVITY_COLORS = {
  event: {
    bg: 'bg-purple-100',
    text: 'text-purple-600',
    iconBg: 'bg-purple-500',
  },
  task: {
    bg: 'bg-green-100',
    text: 'text-green-600',
    iconBg: 'bg-green-500',
  },
  email: {
    bg: 'bg-blue-100',
    text: 'text-blue-600',
    iconBg: 'bg-blue-500',
  },
  call: {
    bg: 'bg-teal-100',
    text: 'text-teal-600',
    iconBg: 'bg-teal-500',
  },
  note: {
    bg: 'bg-slate-100',
    text: 'text-slate-600',
    iconBg: 'bg-slate-500',
  },
};

/**
 * Create default activity config for new component
 */
export const createDefaultActivityConfig = () => ({
  activityTypes: DEFAULT_ACTIVITY_TYPES.map(type => ({ ...type })),
  sortOrder: 'desc', // Latest first
  showOwner: true,
  showStatus: true,
  pageSize: 10,
  maxVisibleButtons: 3, // Additional buttons go to "More" dropdown
});

/**
 * Check if component has valid activity config (not first-time drop)
 */
export const hasActivityConfig = (component) => {
  return component?.config?.activityTypes && 
         Array.isArray(component.config.activityTypes) && 
         component.config.activityTypes.length > 0;
};

/**
 * Get activity type definition
 */
export const getActivityTypeDefinition = (type) => {
  return AVAILABLE_ACTIVITY_TYPES.find(t => t.type === type);
};

/**
 * Get icon component name for activity type
 */
export const getActivityIconName = (type) => {
  return ACTIVITY_ICONS[type] || 'FileText';
};

/**
 * Get color config for activity type
 */
export const getActivityColors = (type) => {
  return ACTIVITY_COLORS[type] || ACTIVITY_COLORS.note;
};

export default {
  DEFAULT_ACTIVITY_TYPES,
  AVAILABLE_ACTIVITY_TYPES,
  ACTIVITY_RELATIONSHIP_FIELDS,
  ACTIVITY_ICONS,
  ACTIVITY_COLORS,
  createDefaultActivityConfig,
  hasActivityConfig,
  getActivityTypeDefinition,
  getActivityIconName,
  getActivityColors,
};
