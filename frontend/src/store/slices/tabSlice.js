/**
 * Tab Slice - Redux state management for CRM console tabs
 * 
 * Manages:
 * - Open tabs list
 * - Active tab
 * - Tab order
 * - Tab metadata (recordId, objectType, label)
 * 
 * Optimized for instant tab switching without re-fetching data
 */
import { createSlice, createSelector } from '@reduxjs/toolkit';

const STORAGE_KEY_PREFIX = 'crm_redux_tabs_';

/**
 * Load initial state from localStorage for fast restore
 */
const loadInitialState = () => {
  try {
    const userId = localStorage.getItem('user_id');
    if (!userId) return getDefaultState();
    
    const stored = localStorage.getItem(`${STORAGE_KEY_PREFIX}${userId}`);
    if (!stored) return getDefaultState();
    
    const parsed = JSON.parse(stored);
    return {
      ...getDefaultState(),
      tabs: parsed.tabs || [],
      activeTabId: parsed.activeTabId || null,
      tabOrder: parsed.tabOrder || [],
    };
  } catch (e) {
    console.error('[TabSlice] Failed to load from localStorage:', e);
    return getDefaultState();
  }
};

const getDefaultState = () => ({
  tabs: [],                    // Array of tab objects
  activeTabId: null,           // Currently active tab ID
  tabOrder: [],                // Array of tab IDs for ordering
  isInitialized: false,        // Whether tabs have been loaded
  lastSyncedAt: null,          // Timestamp of last DB sync
});

const tabSlice = createSlice({
  name: 'tabs',
  initialState: loadInitialState(),
  reducers: {
    /**
     * Initialize tabs state (from localStorage or DB)
     */
    initializeTabs: (state, action) => {
      const { tabs, activeTabId, tabOrder } = action.payload;
      state.tabs = tabs || [];
      state.activeTabId = activeTabId || (tabs?.length > 0 ? tabs[0].id : null);
      state.tabOrder = tabOrder || tabs?.map(t => t.id) || [];
      state.isInitialized = true;
    },

    /**
     * Open a new tab or activate existing one
     */
    openTab: (state, action) => {
      const { id, type, objectType, recordId, label, icon, closeable = true, data } = action.payload;
      
      // Check if tab already exists
      const existingIndex = state.tabs.findIndex(t => t.id === id);
      
      if (existingIndex !== -1) {
        // Tab exists - just activate it
        state.activeTabId = id;
        // Update data if provided (for refreshing record data)
        if (data) {
          state.tabs[existingIndex].data = data;
          state.tabs[existingIndex].lastUpdated = Date.now();
        }
        return;
      }
      
      // Create new tab
      const newTab = {
        id,
        type,                    // 'record', 'list', 'home', 'app_page'
        objectType,              // 'contact', 'lead', 'opportunity', etc.
        recordId,                // Record UUID
        label,                   // Display name
        icon,                    // Icon name
        closeable,               // Whether tab can be closed
        data: data || null,      // Cached record data
        createdAt: Date.now(),
        lastUpdated: Date.now(),
      };
      
      state.tabs.push(newTab);
      state.tabOrder.push(id);
      state.activeTabId = id;
    },

    /**
     * Close a tab
     */
    closeTab: (state, action) => {
      const tabId = action.payload;
      const tabIndex = state.tabs.findIndex(t => t.id === tabId);
      
      if (tabIndex === -1) return;
      
      // Remove tab
      state.tabs.splice(tabIndex, 1);
      state.tabOrder = state.tabOrder.filter(id => id !== tabId);
      
      // Update active tab if needed
      if (state.activeTabId === tabId) {
        if (state.tabs.length > 0) {
          // Activate the tab before the closed one, or the first tab
          const newActiveIndex = Math.max(0, tabIndex - 1);
          state.activeTabId = state.tabs[newActiveIndex]?.id || null;
        } else {
          state.activeTabId = null;
        }
      }
    },

    /**
     * Set active tab (instant switch - no data fetching)
     */
    setActiveTab: (state, action) => {
      const tabId = action.payload;
      const tab = state.tabs.find(t => t.id === tabId);
      if (tab) {
        state.activeTabId = tabId;
      }
    },

    /**
     * Update tab data (e.g., cached record data)
     */
    updateTabData: (state, action) => {
      const { tabId, data, label } = action.payload;
      const tab = state.tabs.find(t => t.id === tabId);
      if (tab) {
        if (data !== undefined) tab.data = data;
        if (label !== undefined) tab.label = label;
        tab.lastUpdated = Date.now();
      }
    },

    /**
     * Reorder tabs
     */
    reorderTabs: (state, action) => {
      const { oldIndex, newIndex } = action.payload;
      const newOrder = [...state.tabOrder];
      const [removed] = newOrder.splice(oldIndex, 1);
      newOrder.splice(newIndex, 0, removed);
      state.tabOrder = newOrder;
    },

    /**
     * Close all tabs except pinned ones
     */
    closeAllTabs: (state) => {
      state.tabs = state.tabs.filter(t => !t.closeable);
      state.tabOrder = state.tabs.map(t => t.id);
      state.activeTabId = state.tabs[0]?.id || null;
    },

    /**
     * Restore tabs from database
     */
    restoreTabsFromStorage: (state, action) => {
      const { tabs, activeTabId } = action.payload;
      if (tabs) {
        state.tabs = tabs;
        state.tabOrder = tabs.map(t => t.id);
      }
      if (activeTabId) {
        state.activeTabId = activeTabId;
      }
      state.isInitialized = true;
      state.lastSyncedAt = Date.now();
    },

    /**
     * Mark tabs as synced with database
     */
    markSynced: (state) => {
      state.lastSyncedAt = Date.now();
    },

    /**
     * Clear all tab state (for logout)
     */
    clearTabs: (state) => {
      state.tabs = [];
      state.activeTabId = null;
      state.tabOrder = [];
      state.isInitialized = false;
      state.lastSyncedAt = null;
    },
  },
});

// Export actions
export const {
  initializeTabs,
  openTab,
  closeTab,
  setActiveTab,
  updateTabData,
  reorderTabs,
  closeAllTabs,
  restoreTabsFromStorage,
  markSynced,
  clearTabs,
} = tabSlice.actions;

// Selectors
export const selectTabs = (state) => state.tabs.tabs;
export const selectActiveTabId = (state) => state.tabs.activeTabId;
export const selectTabOrder = (state) => state.tabs.tabOrder;
export const selectIsInitialized = (state) => state.tabs.isInitialized;

// Memoized selector for ordered tabs
export const selectOrderedTabs = createSelector(
  [selectTabs, selectTabOrder],
  (tabs, order) => {
    if (!order || order.length === 0) return tabs;
    return order
      .map(id => tabs.find(t => t.id === id))
      .filter(Boolean);
  }
);

// Memoized selector for active tab
export const selectActiveTab = createSelector(
  [selectTabs, selectActiveTabId],
  (tabs, activeId) => tabs.find(t => t.id === activeId) || null
);

// Selector for tab by ID
export const selectTabById = (state, tabId) => 
  state.tabs.tabs.find(t => t.id === tabId);

// Selector for tab data (cached record)
export const selectTabData = (state, tabId) => {
  const tab = state.tabs.tabs.find(t => t.id === tabId);
  return tab?.data || null;
};

export default tabSlice.reducer;
