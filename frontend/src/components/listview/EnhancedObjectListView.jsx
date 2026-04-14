/**
 * EnhancedObjectListView - Refactored Container Component
 * 
 * This is the main container that composes all the sub-components.
 * Original file: 3132 lines → Refactored to ~350 lines
 * 
 * Sub-components:
 * - ListViewHeader: Header with title, search, view selector, filters toggle
 * - ListViewFilters: Advanced filters panel
 * - ListViewPagination: Pagination controls / infinite scroll
 * - ListViewEmptyState: Empty state display
 * - ListViewLoadingState: Loading spinner
 * - ListViewModals: All dialog modals (New, Clone, Rename, Edit, Delete)
 * 
 * Views:
 * - LightningRecordsTable: Table view with inline editing
 * - KanbanView: Kanban board with drag & drop
 * - GridView: Card grid view
 * - SplitView: Split view with list and detail panels
 * 
 * Hooks:
 * - useListViewData: Core data fetching and state management
 * - useListViewWizard: 4-step wizard state for creating/editing views
 */
import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

// Hooks
import { useListViewData, useListViewWizard } from './hooks';

// Components
import {
  ListViewHeader,
  ListViewFilters,
  ListViewPagination,
  ListViewEmptyState,
  ListViewLoadingState,
} from './components';

import {
  NewViewDialog,
  CloneViewDialog,
  RenameViewDialog,
  EditViewDialog,
  DeleteViewDialog,
} from './components/ListViewModals';

// Views
import {
  LightningRecordsTable,
  KanbanView,
  GridView,
  SplitView,
} from './views';

// Utils
import { getRecordName as getRecordNameUtil } from './utils/listViewUtils';

// API
import * as listViewApi from './services/listViewApi';

export const EnhancedObjectListView = ({ object, onRecordClick, openRecordInTab, openRelatedRecordInTab }) => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  
  // ============================================
  // AUTO-OPEN CREATE DIALOG from URL param
  // ============================================
  const [autoOpenCreate, setAutoOpenCreate] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  
  // Check for ?action=new query param on mount and when params change
  useEffect(() => {
    const action = searchParams.get('action');
    if (action === 'new') {
      // Store the pending action - will be processed when object is ready
      setPendingAction('new');
      // Clear the query param immediately to avoid re-processing
      searchParams.delete('action');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);
  
  // Process pending action when object is loaded
  useEffect(() => {
    if (pendingAction === 'new' && object?.object_name) {
      setAutoOpenCreate(true);
      setPendingAction(null);
    }
  }, [pendingAction, object?.object_name]);
  
  // Callback when create dialog closes
  const handleCreateDialogOpenChange = useCallback((isOpen) => {
    if (!isOpen) {
      setAutoOpenCreate(false);
    }
  }, []);
  
  // ============================================
  // SELECTION STATE - For List View Actions
  // ============================================
  const [selectedRecordIds, setSelectedRecordIds] = useState([]);
  
  // Callback when table selection changes
  const handleSelectionChange = useCallback((ids) => {
    setSelectedRecordIds(ids || []);
  }, []);
  
  // ============================================
  // DATA HOOK - Core state and data fetching
  // ============================================
  const {
    // Core data
    records,
    loading,
    listViews,
    selectedView,
    currentViewData,
    
    // User preferences
    searchTerm,
    sortBy,
    sortOrder,
    filterField,
    filterValue,
    filterCondition,
    pinnedView,
    preferencesLoaded,
    viewMode,
    showFilters,
    
    // Pagination
    currentPage,
    pageSize,
    totalRecords,
    totalPages,
    
    // Infinite scroll
    isLoadingMore,
    hasMoreRecords,
    currentLoadingMode,
    currentViewPageSize,
    
    // Setters
    setFilterField,
    setFilterValue,
    setFilterCondition,
    setShowFilters,
    setCurrentPage,
    setPageSize,
    setSelectedView,
    
    // Handlers
    handleSort,
    handleViewChange,
    handleViewModeChange,
    handleSearchChange,
    handleFilterApply,
    handleFilterClear,
    handlePinView,
    loadMoreRecords,
    
    // Actions
    fetchRecords,
    refreshListViews,
  } = useListViewData(object);

  // ============================================
  // SELECTED RECORDS (derived from selection state)
  // ============================================
  const selectedRecords = useMemo(() => {
    if (!records || selectedRecordIds.length === 0) return [];
    return records.filter(r => 
      selectedRecordIds.includes(r.id) || selectedRecordIds.includes(r.series_id)
    );
  }, [records, selectedRecordIds]);

  // ============================================
  // WIZARD HOOK - Dialog state for create/edit views
  // ============================================
  const wizard = useListViewWizard(
    object,
    listViews,
    selectedView,
    refreshListViews,
    fetchRecords
  );

  // ============================================
  // RECORD CLICK HANDLER
  // ============================================
  const handleRecordClick = async (record) => {
    try {
      // Track recently viewed
      await listViewApi.trackRecordView(object.object_name, record.id);
      
      // Use custom callback if provided (for Sales Console), otherwise navigate
      if (onRecordClick) {
        onRecordClick(record);
      } else {
        navigate(`/crm/${object.object_name}/${record.series_id}`);
      }
    } catch (error) {
      console.error('Error tracking recently viewed:', error);
      // Still execute callback/navigate even if tracking fails
      if (onRecordClick) {
        onRecordClick(record);
      } else {
        navigate(`/crm/${object.object_name}/${record.series_id}`);
      }
    }
  };

  // ============================================
  // HELPER: Get record name
  // ============================================
  const getRecordName = (record) => getRecordNameUtil(record, object);

  // ============================================
  // DELETE HANDLER - Called when view is deleted
  // ============================================
  const handleDeleteView = () => {
    wizard.handleDeleteListView(() => {
      setSelectedView('all_records');
    });
  };

  // Get current view name for delete dialog
  const currentViewName = listViews.user_views.find(v => v.id === selectedView)?.name || '';

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <ListViewHeader
        object={object}
        records={records}
        listViews={listViews}
        selectedView={selectedView}
        currentViewData={currentViewData}
        pinnedView={pinnedView}
        preferencesLoaded={preferencesLoaded}
        viewMode={viewMode}
        searchTerm={searchTerm}
        showFilters={showFilters}
        // Selection props for List View Actions
        selectedRecordIds={selectedRecordIds}
        selectedRecords={selectedRecords}
        // Auto-open create dialog props
        autoOpenCreate={autoOpenCreate}
        onCreateDialogOpenChange={handleCreateDialogOpenChange}
        onViewChange={handleViewChange}
        onViewModeChange={handleViewModeChange}
        onSearchChange={handleSearchChange}
        onPinView={handlePinView}
        onFiltersToggle={() => setShowFilters(!showFilters)}
        onRefresh={fetchRecords}
        openNewViewDialog={wizard.openNewViewDialog}
        openCloneViewDialog={wizard.openCloneViewDialog}
        openEditViewDialog={wizard.openEditViewDialog}
        openRenameViewDialog={wizard.openRenameViewDialog}
        setShowDeleteViewDialog={wizard.setShowDeleteViewDialog}
      />

      {/* Advanced Filters Panel */}
      {showFilters && (
        <div className="bg-white px-6">
          <ListViewFilters
            object={object}
            filterField={filterField}
            filterValue={filterValue}
            filterCondition={filterCondition}
            onFilterFieldChange={setFilterField}
            onFilterValueChange={setFilterValue}
            onFilterConditionChange={setFilterCondition}
            onApply={handleFilterApply}
            onClear={handleFilterClear}
          />
        </div>
      )}

      {/* Records Display */}
      <div className="flex-1 bg-white flex flex-col min-h-0 overflow-hidden">
        {loading ? (
          <ListViewLoadingState objectPlural={object.object_plural} />
        ) : records.length === 0 ? (
          <ListViewEmptyState object={object} onRefresh={fetchRecords} />
        ) : (
          <>
            {/* Scrollable Content Area */}
            <div className="flex-1 overflow-auto min-h-0">
              {viewMode === 'table' && (
                <LightningRecordsTable
                  object={object}
                  records={records}
                  onUpdate={fetchRecords}
                  onSort={handleSort}
                  sortBy={sortBy}
                  sortOrder={sortOrder}
                  getRecordName={getRecordName}
                  onRecordClick={handleRecordClick}
                  openRecordInTab={openRecordInTab}
                  openRelatedRecordInTab={openRelatedRecordInTab}
                  selectedView={selectedView}
                  currentViewData={currentViewData}
                  onSelectionChange={handleSelectionChange}
                />
              )}
              {viewMode === 'kanban' && (
                <KanbanView
                  object={object}
                  records={records}
                  onUpdate={fetchRecords}
                  getRecordName={getRecordName}
                  onRecordClick={handleRecordClick}
                />
              )}
              {viewMode === 'grid' && (
                <GridView
                  object={object}
                  records={records}
                  onUpdate={fetchRecords}
                  getRecordName={getRecordName}
                  onRecordClick={handleRecordClick}
                />
              )}
              {viewMode === 'split' && (
                <SplitView
                  object={object}
                  records={records}
                  onUpdate={fetchRecords}
                  getRecordName={getRecordName}
                />
              )}
            </div>

            {/* Pagination / Infinite Scroll - Fixed at bottom */}
            {!loading && records.length > 0 && (
              <div className="flex-shrink-0">
                <ListViewPagination
                  currentLoadingMode={currentLoadingMode}
                  currentPage={currentPage}
                  pageSize={pageSize}
                  totalRecords={totalRecords}
                  totalPages={totalPages}
                  currentViewPageSize={currentViewPageSize}
                  isLoadingMore={isLoadingMore}
                  hasMoreRecords={hasMoreRecords}
                  onPageChange={setCurrentPage}
                  onPageSizeChange={setPageSize}
                  onLoadMore={loadMoreRecords}
                />
              </div>
            )}
          </>
        )}
      </div>

      {/* ============================================ */}
      {/* DIALOGS / MODALS */}
      {/* ============================================ */}
      
      {/* New List View Dialog */}
      <NewViewDialog
        open={wizard.showNewViewDialog}
        onOpenChange={wizard.setShowNewViewDialog}
        object={object}
        newViewName={wizard.newViewName}
        newViewVisibility={wizard.newViewVisibility}
        newViewStep={wizard.newViewStep}
        newViewFilters={wizard.newViewFilters}
        newViewColumns={wizard.newViewColumns}
        newViewSortField={wizard.newViewSortField}
        newViewSortOrder={wizard.newViewSortOrder}
        newViewLoadingMode={wizard.newViewLoadingMode}
        newViewPageSize={wizard.newViewPageSize}
        savingView={wizard.savingView}
        setNewViewName={wizard.setNewViewName}
        setNewViewVisibility={wizard.setNewViewVisibility}
        setNewViewFilters={wizard.setNewViewFilters}
        setNewViewColumns={wizard.setNewViewColumns}
        setNewViewSortField={wizard.setNewViewSortField}
        setNewViewSortOrder={wizard.setNewViewSortOrder}
        setNewViewLoadingMode={wizard.setNewViewLoadingMode}
        setNewViewPageSize={wizard.setNewViewPageSize}
        goToNextStep={wizard.goToNextStep}
        goToPreviousStep={wizard.goToPreviousStep}
        addFilter={wizard.addFilter}
        removeFilter={wizard.removeFilter}
        updateFilter={wizard.updateFilter}
        toggleColumn={wizard.toggleColumn}
        selectAllColumns={wizard.selectAllColumns}
        clearAllColumns={wizard.clearAllColumns}
        handleCreateListView={wizard.handleCreateListView}
      />

      {/* Clone View Dialog */}
      <CloneViewDialog
        open={wizard.showCloneViewDialog}
        onOpenChange={wizard.setShowCloneViewDialog}
        newViewName={wizard.newViewName}
        setNewViewName={wizard.setNewViewName}
        savingView={wizard.savingView}
        handleCloneListView={wizard.handleCloneListView}
      />

      {/* Rename View Dialog */}
      <RenameViewDialog
        open={wizard.showRenameViewDialog}
        onOpenChange={wizard.setShowRenameViewDialog}
        newViewName={wizard.newViewName}
        setNewViewName={wizard.setNewViewName}
        savingView={wizard.savingView}
        handleRenameListView={wizard.handleRenameListView}
      />

      {/* Edit View Dialog */}
      <EditViewDialog
        open={wizard.showEditViewDialog}
        onOpenChange={wizard.setShowEditViewDialog}
        object={object}
        newViewName={wizard.newViewName}
        newViewVisibility={wizard.newViewVisibility}
        newViewStep={wizard.newViewStep}
        newViewFilters={wizard.newViewFilters}
        newViewColumns={wizard.newViewColumns}
        newViewSortField={wizard.newViewSortField}
        newViewSortOrder={wizard.newViewSortOrder}
        newViewLoadingMode={wizard.newViewLoadingMode}
        newViewPageSize={wizard.newViewPageSize}
        savingView={wizard.savingView}
        setNewViewName={wizard.setNewViewName}
        setNewViewVisibility={wizard.setNewViewVisibility}
        setNewViewFilters={wizard.setNewViewFilters}
        setNewViewColumns={wizard.setNewViewColumns}
        setNewViewSortField={wizard.setNewViewSortField}
        setNewViewSortOrder={wizard.setNewViewSortOrder}
        goToNextStep={wizard.goToNextStep}
        goToPreviousStep={wizard.goToPreviousStep}
        addFilter={wizard.addFilter}
        removeFilter={wizard.removeFilter}
        updateFilter={wizard.updateFilter}
        toggleColumn={wizard.toggleColumn}
        handleEditListView={wizard.handleEditListView}
        resetNewViewForm={wizard.resetNewViewForm}
        setEditingViewId={() => {}}
      />

      {/* Delete View Dialog */}
      <DeleteViewDialog
        open={wizard.showDeleteViewDialog}
        onOpenChange={wizard.setShowDeleteViewDialog}
        viewName={currentViewName}
        savingView={wizard.savingView}
        handleDeleteListView={handleDeleteView}
      />
    </div>
  );
};

// Default export for backward compatibility
export default EnhancedObjectListView;
