/**
 * Actions Module
 * Salesforce-like configurable Quick Actions for CRM objects
 */

// Components
export { default as ActionsListPage } from './components/ActionsListPage';
export { default as ActionForm } from './components/ActionForm';
export { default as ActionButtons } from './components/ActionButtons';
export { default as ActionExecutionModal } from './components/ActionExecutionModal';

// Hooks
export { useActions, useRuntimeActions } from './hooks/useActions';

// Services
export { actionService } from './services/actionService';

// Constants - Custom action types (for admin-created actions)
export const ACTION_TYPES = {
  CREATE_RECORD: 'CREATE_RECORD',
  OPEN_URL: 'OPEN_URL',
  RUN_FLOW: 'RUN_FLOW'
};

// System action types (auto-generated, non-deletable)
export const SYSTEM_ACTION_TYPES = {
  SYSTEM_CREATE: 'SYSTEM_CREATE',
  SYSTEM_EDIT: 'SYSTEM_EDIT',
  SYSTEM_DELETE: 'SYSTEM_DELETE'
};

export const ACTION_PLACEMENTS = {
  RECORD_HEADER: 'RECORD_HEADER',
  RELATED_LIST: 'RELATED_LIST',
  LAYOUT: 'LAYOUT'
};

// Action contexts - Where the action is available
export const ACTION_CONTEXTS = {
  RECORD_DETAIL: 'RECORD_DETAIL',  // Single record detail page
  LIST_VIEW: 'LIST_VIEW'  // List view (single or multiple records)
};

export const LUCIDE_ICONS = [
  'Zap', 'Plus', 'Edit', 'Trash', 'CheckCircle', 'XCircle',
  'Send', 'Mail', 'Phone', 'MessageSquare', 'Calendar',
  'FileText', 'Download', 'Upload', 'ExternalLink', 'Link',
  'Star', 'Heart', 'Bookmark', 'Flag', 'AlertCircle',
  'RefreshCw', 'Copy', 'Settings', 'User', 'Users',
  'Building', 'Briefcase', 'DollarSign', 'TrendingUp', 'Target',
  'Award', 'ThumbsUp', 'ThumbsDown', 'ArrowRight', 'ArrowUp'
];
