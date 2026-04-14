/**
 * useListViewData Hook
 * Manages all list view state and data fetching
 */
import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import * as listViewApi from '../services/listViewApi';
import { filterCriteriaToArray, filtersArrayToCriteria } from '../utils/listViewUtils';

export const useListViewData = (object) => {
  // Core data state
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [listViews, setListViews] = useState({ system_views: [], user_views: [] });
  const [selectedView, setSelectedView] = useState('all_records');
  
  // User preferences
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('');
  const [sortOrder, setSortOrder] = useState('asc');
  const [filterField, setFilterField] = useState('');
  const [filterValue, setFilterValue] = useState('');
  const [filterCondition, setFilterCondition] = useState('equals');
  const [pinnedView, setPinnedView] = useState(null);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [viewMode, setViewMode] = useState('table');
  const [showFilters, setShowFilters] = useState(false);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  
  // Infinite scroll state
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMoreRecords, setHasMoreRecords] = useState(true);
  const [currentLoadingMode, setCurrentLoadingMode] = useState('pagination');
  const [currentViewPageSize, setCurrentViewPageSize] = useState(20);

  // Computed values
  const allViews = [...listViews.system_views, ...listViews.user_views];
  const currentViewData = allViews.find(view => view.id === selectedView);

  // ============================================
  // LOAD USER PREFERENCES
  // ============================================
  const loadUserPreferences = useCallback(async () => {
    try {
      const prefs = await listViewApi.loadUserPreferences(object.object_name);

      setSelectedView(prefs.active_list_view || 'all_records');
      setPinnedView(prefs.pinned_view);
      setSortBy(prefs.sort_field || '');
      setSortOrder(prefs.sort_order || 'asc');
      setSearchTerm(prefs.search_term || '');
      setFilterField(prefs.filter_field || '');
      setFilterValue(prefs.filter_value || '');
      setFilterCondition(prefs.filter_condition || 'equals');
      setViewMode(prefs.view_mode || 'table');

      setPreferencesLoaded(true);
    } catch (error) {
      console.error('Error loading user preferences:', error);
      setSelectedView('all_records');
      setViewMode('table');
      setPreferencesLoaded(true);
    }
  }, [object?.object_name]);

  // ============================================
  // SAVE USER PREFERENCES
  // ============================================
  const saveUserPreferences = useCallback(async (updates) => {
    try {
      await listViewApi.saveUserPreferences(object.object_name, updates);
    } catch (error) {
      console.error('Error saving user preferences:', error);
    }
  }, [object?.object_name]);

  // ============================================
  // FETCH LIST VIEWS
  // ============================================
  const refreshListViews = useCallback(async () => {
    try {
      const data = await listViewApi.fetchListViews(object.object_name);
      setListViews(data);
    } catch (error) {
      console.error('Error fetching list views:', error);
    }
  }, [object?.object_name]);

  // ============================================
  // FETCH RECORDS
  // ============================================
  const fetchRecords = useCallback(async (appendMode = false) => {
    if (!object) return;

    if (appendMode) {
      setIsLoadingMore(true);
    } else {
      setLoading(true);
    }
    
    try {
      // Get current view to determine loading mode and page size
      const currentView = [...listViews.system_views, ...listViews.user_views]
        .find(view => view.id === selectedView);
      
      const viewLoadingMode = currentView?.loading_mode || 'pagination';
      const viewPageSize = currentView?.page_size || pageSize;
      
      setCurrentLoadingMode(viewLoadingMode);
      setCurrentViewPageSize(viewPageSize);

      // Handle recently viewed records
      if (selectedView === 'recently_viewed') {
        const recentRecords = await listViewApi.fetchRecentlyViewedRecords(object.object_name);
        setRecords(recentRecords);
        setTotalRecords(recentRecords.length);
        setTotalPages(1);
        setHasMoreRecords(false);
        return;
      }

      const response = await listViewApi.fetchRecords(object.object_name, {
        currentPage,
        pageSize: viewPageSize,
        sortBy,
        sortOrder,
        searchTerm,
        filterField,
        filterValue,
        filterCondition,
        selectedView,
        currentView,
        isMyRecordsOnly: selectedView === 'my_records'
      });

      // Handle paginated response
      if (response.records) {
        if (appendMode && viewLoadingMode === 'infinite_scroll') {
          setRecords(prev => [...prev, ...response.records]);
        } else {
          setRecords(response.records);
        }
        setTotalRecords(response.pagination.total);
        setTotalPages(response.pagination.total_pages);
        
        const hasMore = currentPage < response.pagination.total_pages;
        setHasMoreRecords(hasMore);
      } else {
        // Fallback for non-paginated response
        if (appendMode && viewLoadingMode === 'infinite_scroll') {
          setRecords(prev => [...prev, ...response]);
        } else {
          setRecords(response);
        }
        setHasMoreRecords(false);
      }
    } catch (error) {
      console.error('Error fetching records:', error);
      toast.error(`Failed to load ${object.object_plural.toLowerCase()}`);
    } finally {
      setLoading(false);
      setIsLoadingMore(false);
    }
  }, [object, selectedView, searchTerm, sortBy, sortOrder, filterField, filterValue, filterCondition, currentPage, pageSize, listViews]);

  // ============================================
  // EVENT HANDLERS
  // ============================================
  const handleSort = useCallback((fieldName) => {
    let newSortOrder = 'asc';
    if (sortBy === fieldName) {
      newSortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
    }

    setSortBy(fieldName);
    setSortOrder(newSortOrder);

    saveUserPreferences({
      sort_field: fieldName,
      sort_order: newSortOrder
    });
  }, [sortBy, sortOrder, saveUserPreferences]);

  const handleViewChange = useCallback((viewId) => {
    setSelectedView(viewId);
    setCurrentPage(1);

    saveUserPreferences({
      active_list_view: viewId
    });
  }, [saveUserPreferences]);

  const handleViewModeChange = useCallback((mode) => {
    setViewMode(mode);

    saveUserPreferences({
      view_mode: mode
    });

    toast.success(`Switched to ${mode} view`);
  }, [saveUserPreferences]);

  const handleSearchChange = useCallback((term) => {
    setSearchTerm(term);
    setCurrentPage(1);

    // Debounce search preference saving
    setTimeout(() => {
      saveUserPreferences({
        search_term: term
      });
    }, 1000);
  }, [saveUserPreferences]);

  const handleFilterApply = useCallback(() => {
    if (filterField) {
      setCurrentPage(1);

      saveUserPreferences({
        filter_field: filterField,
        filter_value: filterValue,
        filter_condition: filterCondition
      });

      fetchRecords();
      toast.success('Filter applied and saved');
    }
  }, [filterField, filterValue, filterCondition, saveUserPreferences, fetchRecords]);

  const handleFilterClear = useCallback(() => {
    setFilterField('');
    setFilterValue('');
    setFilterCondition('equals');

    saveUserPreferences({
      filter_field: null,
      filter_value: null,
      filter_condition: 'equals'
    });
  }, [saveUserPreferences]);

  const handlePinView = useCallback(async (viewId) => {
    try {
      if (pinnedView === viewId) {
        await listViewApi.unpinView(object.object_name);
        setPinnedView(null);
        toast.success('View unpinned');
      } else {
        await listViewApi.pinView(object.object_name, viewId);
        setPinnedView(viewId);
        toast.success('View pinned');
      }
    } catch (error) {
      toast.error('Failed to update pinned view');
    }
  }, [pinnedView, object?.object_name]);

  const handleToggleViewPin = useCallback(async (viewId, isPinned) => {
    try {
      await listViewApi.toggleViewPin(viewId, isPinned);
      refreshListViews();
      toast.success(`List view ${!isPinned ? 'pinned' : 'unpinned'}`);
    } catch (error) {
      toast.error('Failed to update list view');
    }
  }, [refreshListViews]);

  const loadMoreRecords = useCallback(() => {
    if (isLoadingMore || !hasMoreRecords) return;
    setCurrentPage(prev => prev + 1);
  }, [isLoadingMore, hasMoreRecords]);

  // ============================================
  // EFFECTS
  // ============================================
  useEffect(() => {
    if (object) {
      setPreferencesLoaded(false);
      loadUserPreferences();
      refreshListViews();
    }
  }, [object]);

  // Reset page and records when view changes
  useEffect(() => {
    if (object && preferencesLoaded) {
      setCurrentPage(1);
      setRecords([]);
      setHasMoreRecords(true);
    }
  }, [selectedView]);

  useEffect(() => {
    if (object && preferencesLoaded) {
      // For infinite scroll mode with page > 1, don't refetch (handled by loadMoreRecords effect)
      if (currentLoadingMode === 'infinite_scroll' && currentPage > 1) {
        return;
      }
      // Only fetch once per view change, not on every currentPage change
      // The selectedView change triggers the fetch, page reset is just state cleanup
      fetchRecords();
    }
  }, [selectedView, searchTerm, sortBy, sortOrder, filterField, filterValue, filterCondition, preferencesLoaded, pageSize]);
  
  // Fetch records when page changes (for pagination mode)
  useEffect(() => {
    if (object && preferencesLoaded && currentLoadingMode === 'pagination' && currentPage > 1) {
      // Don't refetch for recently_viewed as it has no pagination
      if (selectedView === 'recently_viewed') {
        return;
      }
      fetchRecords();
    }
  }, [currentPage, currentLoadingMode, selectedView]);

  // Fetch more records when page changes in infinite scroll mode
  useEffect(() => {
    if (currentLoadingMode === 'infinite_scroll' && currentPage > 1 && hasMoreRecords) {
      fetchRecords(true);
    }
  }, [currentPage, currentLoadingMode]);

  return {
    // Core data
    records,
    loading,
    listViews,
    selectedView,
    currentViewData,
    allViews,
    
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
    
    // Setters for controlled state
    setSelectedView,
    setSearchTerm,
    setFilterField,
    setFilterValue,
    setFilterCondition,
    setShowFilters,
    setCurrentPage,
    setPageSize,
    
    // Event handlers
    handleSort,
    handleViewChange,
    handleViewModeChange,
    handleSearchChange,
    handleFilterApply,
    handleFilterClear,
    handlePinView,
    handleToggleViewPin,
    loadMoreRecords,
    
    // Actions
    fetchRecords,
    refreshListViews,
    saveUserPreferences,
  };
};

export default useListViewData;
