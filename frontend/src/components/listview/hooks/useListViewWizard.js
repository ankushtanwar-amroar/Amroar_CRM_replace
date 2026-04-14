/**
 * useListViewWizard Hook
 * Manages the 4-step wizard state for creating/editing list views
 */
import { useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import * as listViewApi from '../services/listViewApi';
import { filterCriteriaToArray, filtersArrayToCriteria } from '../utils/listViewUtils';

export const useListViewWizard = (object, listViews, selectedView, refreshListViews, fetchRecords) => {
  // Dialog visibility state
  const [showNewViewDialog, setShowNewViewDialog] = useState(false);
  const [showCloneViewDialog, setShowCloneViewDialog] = useState(false);
  const [showRenameViewDialog, setShowRenameViewDialog] = useState(false);
  const [showDeleteViewDialog, setShowDeleteViewDialog] = useState(false);
  const [showEditViewDialog, setShowEditViewDialog] = useState(false);
  const [editingViewId, setEditingViewId] = useState(null);
  
  // Wizard form state
  const [newViewName, setNewViewName] = useState('');
  const [newViewVisibility, setNewViewVisibility] = useState('private');
  const [newViewStep, setNewViewStep] = useState(1);
  const [newViewFilters, setNewViewFilters] = useState([]);
  const [newViewColumns, setNewViewColumns] = useState([]);
  const [newViewSortField, setNewViewSortField] = useState('');
  const [newViewSortOrder, setNewViewSortOrder] = useState('asc');
  const [newViewLoadingMode, setNewViewLoadingMode] = useState('pagination');
  const [newViewPageSize, setNewViewPageSize] = useState(20);
  const [savingView, setSavingView] = useState(false);

  // ============================================
  // FORM RESET
  // ============================================
  const resetNewViewForm = useCallback(() => {
    setNewViewName('');
    setNewViewVisibility('private');
    setNewViewStep(1);
    setNewViewFilters([]);
    setNewViewColumns(object ? Object.keys(object.fields).slice(0, 5) : []);
    setNewViewSortField('');
    setNewViewSortOrder('asc');
    setNewViewLoadingMode('pagination');
    setNewViewPageSize(20);
  }, [object]);

  // ============================================
  // DIALOG OPENERS
  // ============================================
  const openNewViewDialog = useCallback(() => {
    resetNewViewForm();
    if (object) {
      setNewViewColumns(Object.keys(object.fields).slice(0, 5));
    }
    setShowNewViewDialog(true);
  }, [object, resetNewViewForm]);

  const openCloneViewDialog = useCallback(() => {
    const currentViewObj = [...listViews.system_views, ...listViews.user_views].find(v => v.id === selectedView);
    setNewViewName(currentViewObj ? `${currentViewObj.name} - Copy` : 'New View');
    setShowCloneViewDialog(true);
  }, [listViews, selectedView]);

  const openRenameViewDialog = useCallback(() => {
    const currentViewObj = listViews.user_views.find(v => v.id === selectedView);
    setNewViewName(currentViewObj?.name || '');
    setShowRenameViewDialog(true);
  }, [listViews, selectedView]);

  const openEditViewDialog = useCallback(() => {
    const currentViewObj = listViews.user_views.find(v => v.id === selectedView);
    if (!currentViewObj) return;
    
    setEditingViewId(currentViewObj.id);
    setNewViewName(currentViewObj.name || '');
    setNewViewVisibility(currentViewObj.visibility || 'private');
    
    // Convert filter_criteria to array format
    setNewViewFilters(filterCriteriaToArray(currentViewObj.filter_criteria));
    
    // Set columns
    setNewViewColumns(
      currentViewObj.columns?.length > 0 
        ? currentViewObj.columns 
        : Object.keys(object.fields).slice(0, 5)
    );
    
    // Set sort
    setNewViewSortField(currentViewObj.sort_field || '');
    setNewViewSortOrder(currentViewObj.sort_order || 'asc');
    
    // Set loading mode (read-only in edit mode)
    setNewViewLoadingMode(currentViewObj.loading_mode || 'pagination');
    setNewViewPageSize(currentViewObj.page_size || 20);
    
    setNewViewStep(1);
    setShowEditViewDialog(true);
  }, [listViews, selectedView, object]);

  // ============================================
  // CRUD OPERATIONS
  // ============================================
  const handleCreateListView = useCallback(async () => {
    if (!newViewName.trim()) {
      toast.error('Please enter a view name');
      return;
    }
    
    setSavingView(true);
    try {
      const filterCriteria = filtersArrayToCriteria(newViewFilters);
      
      await listViewApi.createListView(object.object_name, {
        name: newViewName.trim(),
        filter_criteria: filterCriteria,
        columns: newViewColumns,
        sort_field: newViewSortField === 'none' ? null : (newViewSortField || null),
        sort_order: newViewSortOrder,
        visibility: newViewVisibility,
        loading_mode: newViewLoadingMode,
        page_size: newViewPageSize
      });
      
      toast.success('List view created successfully');
      setShowNewViewDialog(false);
      resetNewViewForm();
      refreshListViews();
    } catch (error) {
      console.error('Error creating list view:', error);
      toast.error(error.response?.data?.detail || 'Failed to create list view');
    } finally {
      setSavingView(false);
    }
  }, [object, newViewName, newViewFilters, newViewColumns, newViewSortField, newViewSortOrder, newViewVisibility, newViewLoadingMode, newViewPageSize, resetNewViewForm, refreshListViews]);

  const handleCloneListView = useCallback(async () => {
    if (!newViewName.trim()) {
      toast.error('Please enter a name for the cloned view');
      return;
    }
    
    setSavingView(true);
    try {
      await listViewApi.cloneListView(object.object_name, selectedView, newViewName.trim());
      
      toast.success('List view cloned successfully');
      setShowCloneViewDialog(false);
      setNewViewName('');
      refreshListViews();
    } catch (error) {
      console.error('Error cloning list view:', error);
      toast.error(error.response?.data?.detail || 'Failed to clone list view');
    } finally {
      setSavingView(false);
    }
  }, [object, selectedView, newViewName, refreshListViews]);

  const handleRenameListView = useCallback(async () => {
    if (!newViewName.trim()) {
      toast.error('Please enter a new name');
      return;
    }
    
    setSavingView(true);
    try {
      await listViewApi.updateListView(selectedView, {
        name: newViewName.trim()
      });
      
      toast.success('List view renamed successfully');
      setShowRenameViewDialog(false);
      setNewViewName('');
      refreshListViews();
    } catch (error) {
      console.error('Error renaming list view:', error);
      toast.error('Failed to rename list view');
    } finally {
      setSavingView(false);
    }
  }, [selectedView, newViewName, refreshListViews]);

  const handleEditListView = useCallback(async () => {
    if (!newViewName.trim()) {
      toast.error('Please enter a view name');
      return;
    }
    
    setSavingView(true);
    try {
      const filterCriteria = filtersArrayToCriteria(newViewFilters);
      
      await listViewApi.updateListView(editingViewId, {
        name: newViewName.trim(),
        filter_criteria: filterCriteria,
        columns: newViewColumns,
        sort_field: newViewSortField || null,
        sort_order: newViewSortOrder,
        visibility: newViewVisibility
      });
      
      toast.success('List view updated successfully');
      setShowEditViewDialog(false);
      setEditingViewId(null);
      resetNewViewForm();
      refreshListViews();
      fetchRecords();
    } catch (error) {
      console.error('Error updating list view:', error);
      toast.error('Failed to update list view');
    } finally {
      setSavingView(false);
    }
  }, [editingViewId, newViewName, newViewFilters, newViewColumns, newViewSortField, newViewSortOrder, newViewVisibility, resetNewViewForm, refreshListViews, fetchRecords]);

  const handleDeleteListView = useCallback(async (onViewDeleted) => {
    setSavingView(true);
    try {
      await listViewApi.deleteListView(selectedView);
      
      toast.success('List view deleted successfully');
      setShowDeleteViewDialog(false);
      if (onViewDeleted) {
        onViewDeleted();
      }
      refreshListViews();
    } catch (error) {
      console.error('Error deleting list view:', error);
      toast.error('Failed to delete list view');
    } finally {
      setSavingView(false);
    }
  }, [selectedView, refreshListViews]);

  // ============================================
  // FILTER MANAGEMENT
  // ============================================
  const addFilter = useCallback(() => {
    setNewViewFilters(prev => [...prev, { field: '', condition: 'equals', value: '' }]);
  }, []);

  const removeFilter = useCallback((index) => {
    setNewViewFilters(prev => prev.filter((_, i) => i !== index));
  }, []);

  const updateFilter = useCallback((index, key, value) => {
    setNewViewFilters(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [key]: value };
      return updated;
    });
  }, []);

  // ============================================
  // COLUMN MANAGEMENT
  // ============================================
  const toggleColumn = useCallback((fieldKey) => {
    setNewViewColumns(prev => {
      if (prev.includes(fieldKey)) {
        return prev.filter(c => c !== fieldKey);
      }
      return [...prev, fieldKey];
    });
  }, []);

  const selectAllColumns = useCallback(() => {
    if (object) {
      setNewViewColumns(Object.keys(object.fields));
    }
  }, [object]);

  const clearAllColumns = useCallback(() => {
    setNewViewColumns([]);
  }, []);

  // ============================================
  // STEP NAVIGATION
  // ============================================
  const goToNextStep = useCallback(() => {
    setNewViewStep(prev => Math.min(4, prev + 1));
  }, []);

  const goToPreviousStep = useCallback(() => {
    setNewViewStep(prev => Math.max(1, prev - 1));
  }, []);

  return {
    // Dialog visibility
    showNewViewDialog,
    showCloneViewDialog,
    showRenameViewDialog,
    showDeleteViewDialog,
    showEditViewDialog,
    setShowNewViewDialog,
    setShowCloneViewDialog,
    setShowRenameViewDialog,
    setShowDeleteViewDialog,
    setShowEditViewDialog,
    
    // Form state
    editingViewId,
    newViewName,
    newViewVisibility,
    newViewStep,
    newViewFilters,
    newViewColumns,
    newViewSortField,
    newViewSortOrder,
    newViewLoadingMode,
    newViewPageSize,
    savingView,
    
    // Form setters
    setNewViewName,
    setNewViewVisibility,
    setNewViewStep,
    setNewViewFilters,
    setNewViewColumns,
    setNewViewSortField,
    setNewViewSortOrder,
    setNewViewLoadingMode,
    setNewViewPageSize,
    
    // Dialog openers
    openNewViewDialog,
    openCloneViewDialog,
    openRenameViewDialog,
    openEditViewDialog,
    
    // CRUD operations
    handleCreateListView,
    handleCloneListView,
    handleRenameListView,
    handleEditListView,
    handleDeleteListView,
    resetNewViewForm,
    
    // Filter management
    addFilter,
    removeFilter,
    updateFilter,
    
    // Column management
    toggleColumn,
    selectAllColumns,
    clearAllColumns,
    
    // Step navigation
    goToNextStep,
    goToPreviousStep,
  };
};

export default useListViewWizard;
