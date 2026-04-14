/**
 * List View Module - Index
 * 
 * This module provides a complete list view implementation with:
 * - Multiple view modes (Table, Kanban, Grid, Split)
 * - List view CRUD (Create, Clone, Rename, Edit, Delete)
 * - Pagination and Infinite Scroll
 * - Advanced filtering and sorting
 * - Inline editing in table view
 * - User preferences persistence
 * 
 * Main export:
 * - EnhancedObjectListView: The main container component
 * 
 * Sub-components (for customization):
 * - ListViewHeader, ListViewFilters, ListViewPagination, etc.
 * 
 * Views (for customization):
 * - LightningRecordsTable, KanbanView, GridView, SplitView
 * 
 * Hooks (for custom implementations):
 * - useListViewData, useListViewWizard, useInlineEditing
 */

// Main component
export { EnhancedObjectListView, default } from './EnhancedObjectListView';

// Sub-components
export {
  ListViewHeader,
  ListViewFilters,
  ListViewPagination,
  ListViewEmptyState,
  ListViewLoadingState,
  ListViewModals,
} from './components';

// Views
export {
  LightningRecordsTable,
  KanbanView,
  GridView,
  SplitView,
} from './views';

// Hooks
export {
  useListViewData,
  useListViewWizard,
  useInlineEditing,
} from './hooks';

// Services
export * as listViewApi from './services/listViewApi';

// Utils
export * as listViewUtils from './utils/listViewUtils';
