/**
 * useTabManager - Custom hook for Redux-powered tab management
 * 
 * Provides:
 * - Instant tab switching (no API calls)
 * - Record data caching
 * - Integration with existing localStorage/DB persistence
 * - Backward compatible API with existing ConsoleContext
 */
import { useCallback, useEffect, useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import axios from 'axios';
import {
  openTab,
  closeTab,
  setActiveTab,
  updateTabData,
  reorderTabs,
  closeAllTabs,
  restoreTabsFromStorage,
  selectTabs,
  selectActiveTabId,
  selectOrderedTabs,
  selectActiveTab,
  selectTabById,
  selectIsInitialized,
} from '../store/slices/tabSlice';
import {
  cacheRecord,
  updateCachedRecord,
  accessRecord,
  invalidateRecord,
  selectCachedRecord,
  selectIsPendingRequest,
  setPendingRequest,
} from '../store/slices/recordCacheSlice';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

/**
 * Debounce utility
 */
const debounce = (fn, delay) => {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
};

/**
 * Hook for managing CRM console tabs with Redux
 */
export const useTabManager = () => {
  const dispatch = useDispatch();
  const tabs = useSelector(selectTabs);
  const orderedTabs = useSelector(selectOrderedTabs);
  const activeTabId = useSelector(selectActiveTabId);
  const activeTab = useSelector(selectActiveTab);
  const isInitialized = useSelector(selectIsInitialized);
  
  // Ref for debounced DB sync
  const syncTimeoutRef = useRef(null);
  
  /**
   * Sync tabs to database (debounced)
   */
  const syncTabsToDatabase = useCallback(
    debounce(async (tabsToSync, activeId) => {
      try {
        const token = localStorage.getItem('token');
        if (!token) return;
        
        await axios.post(
          `${BACKEND_URL}/api/user/tabs`,
          { tabs: tabsToSync, activeTabId: activeId },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        
        console.log('[TabManager] Synced to database:', tabsToSync.length, 'tabs');
      } catch (error) {
        console.error('[TabManager] DB sync failed:', error);
      }
    }, 2000),
    []
  );

  /**
   * Open a record as a tab
   */
  const openRecordTab = useCallback((objectType, recordId, label, options = {}) => {
    const tabId = `record-${objectType}-${recordId}`;
    
    dispatch(openTab({
      id: tabId,
      type: 'record',
      objectType,
      recordId,
      label: label || recordId,
      icon: options.icon || 'file-text',
      closeable: options.closeable !== false,
    }));
    
    // Mark record as accessed in cache
    dispatch(accessRecord({ objectType, recordId }));
    
    // Trigger DB sync
    syncTabsToDatabase(tabs, tabId);
    
    return tabId;
  }, [dispatch, tabs, syncTabsToDatabase]);

  /**
   * Open a list view as a tab
   */
  const openListTab = useCallback((objectType, label, options = {}) => {
    const tabId = `list-${objectType}`;
    
    dispatch(openTab({
      id: tabId,
      type: 'list',
      objectType,
      label: label || objectType,
      icon: options.icon || 'list',
      closeable: options.closeable !== false,
    }));
    
    syncTabsToDatabase(tabs, tabId);
    
    return tabId;
  }, [dispatch, tabs, syncTabsToDatabase]);

  /**
   * Open home tab
   */
  const openHomeTab = useCallback((options = {}) => {
    const tabId = 'home';
    
    dispatch(openTab({
      id: tabId,
      type: 'home',
      label: 'Home',
      icon: 'home',
      closeable: false,
    }));
    
    return tabId;
  }, [dispatch]);

  /**
   * Close a tab
   */
  const handleCloseTab = useCallback((tabId) => {
    dispatch(closeTab(tabId));
    
    // Sync after close
    const remainingTabs = tabs.filter(t => t.id !== tabId);
    const newActiveId = activeTabId === tabId 
      ? (remainingTabs[remainingTabs.length - 1]?.id || null)
      : activeTabId;
    syncTabsToDatabase(remainingTabs, newActiveId);
  }, [dispatch, tabs, activeTabId, syncTabsToDatabase]);

  /**
   * Switch to a tab (instant - no API call)
   */
  const switchTab = useCallback((tabId) => {
    dispatch(setActiveTab(tabId));
    
    // Sync active tab to DB
    syncTabsToDatabase(tabs, tabId);
  }, [dispatch, tabs, syncTabsToDatabase]);

  /**
   * Reorder tabs
   */
  const handleReorderTabs = useCallback((oldIndex, newIndex) => {
    dispatch(reorderTabs({ oldIndex, newIndex }));
  }, [dispatch]);

  /**
   * Close all tabs
   */
  const handleCloseAllTabs = useCallback(() => {
    dispatch(closeAllTabs());
    syncTabsToDatabase([], null);
  }, [dispatch, syncTabsToDatabase]);

  /**
   * Restore tabs from storage
   */
  const restoreTabs = useCallback((tabData) => {
    dispatch(restoreTabsFromStorage(tabData));
  }, [dispatch]);

  /**
   * Update tab data (label, cached data)
   */
  const handleUpdateTabData = useCallback((tabId, updates) => {
    dispatch(updateTabData({ tabId, ...updates }));
  }, [dispatch]);

  /**
   * Get tab by ID
   */
  const getTabById = useCallback((tabId) => {
    return tabs.find(t => t.id === tabId);
  }, [tabs]);

  return {
    // State
    tabs: orderedTabs,
    activeTabId,
    activeTab,
    isInitialized,
    
    // Actions
    openRecordTab,
    openListTab,
    openHomeTab,
    closeTab: handleCloseTab,
    switchTab,
    reorderTabs: handleReorderTabs,
    closeAllTabs: handleCloseAllTabs,
    restoreTabs,
    updateTabData: handleUpdateTabData,
    getTabById,
  };
};

/**
 * Hook for managing cached record data
 */
export const useRecordCache = () => {
  const dispatch = useDispatch();
  
  /**
   * Get cached record or fetch from API
   */
  const getCachedRecord = useCallback((objectType, recordId) => {
    return (state) => selectCachedRecord(state, objectType, recordId);
  }, []);

  /**
   * Cache record data
   */
  const cacheRecordData = useCallback((objectType, recordId, data, schema, layout) => {
    dispatch(cacheRecord({ objectType, recordId, data, schema, layout }));
  }, [dispatch]);

  /**
   * Update cached record data (for inline edits)
   */
  const updateCachedData = useCallback((objectType, recordId, updates) => {
    dispatch(updateCachedRecord({ objectType, recordId, updates }));
  }, [dispatch]);

  /**
   * Invalidate cached record (force refetch)
   */
  const invalidateCachedRecord = useCallback((objectType, recordId) => {
    dispatch(invalidateRecord({ objectType, recordId }));
  }, [dispatch]);

  /**
   * Check if request is pending
   */
  const checkPendingRequest = useCallback((objectType, recordId) => {
    return (state) => selectIsPendingRequest(state, objectType, recordId);
  }, []);

  /**
   * Set pending request status
   */
  const markPendingRequest = useCallback((objectType, recordId, isPending) => {
    dispatch(setPendingRequest({ objectType, recordId, isPending }));
  }, [dispatch]);

  return {
    getCachedRecord,
    cacheRecordData,
    updateCachedData,
    invalidateCachedRecord,
    checkPendingRequest,
    markPendingRequest,
  };
};

export default useTabManager;
