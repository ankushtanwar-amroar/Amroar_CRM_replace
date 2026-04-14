/**
 * Redux Store Configuration
 * 
 * Centralized state management for CRM console
 * - Tab state management (instant switching)
 * - Record data caching (prevent duplicate API calls)
 * - Persistence middleware for localStorage sync
 */
import { configureStore, createListenerMiddleware } from '@reduxjs/toolkit';
import tabReducer, { selectTabs, selectActiveTabId } from './slices/tabSlice';
import recordCacheReducer from './slices/recordCacheSlice';

// Storage key for Redux tab persistence
const TAB_STORAGE_KEY_PREFIX = 'crm_redux_tabs_';

/**
 * Get user ID from localStorage for persistence
 */
const getUserId = () => {
  try {
    const token = localStorage.getItem('token');
    if (!token) return null;
    
    // Decode JWT to get user ID (simple base64 decode of payload)
    const payload = token.split('.')[1];
    const decoded = JSON.parse(atob(payload));
    return decoded.user_id || decoded.sub || null;
  } catch (e) {
    return null;
  }
};

/**
 * Listener middleware for persisting tab state to localStorage
 * Runs after every tab-related action
 */
const persistenceMiddleware = createListenerMiddleware();

// Listen to all tab-related actions and persist to localStorage
const tabActions = [
  'tabs/initializeTabs',
  'tabs/openTab',
  'tabs/closeTab',
  'tabs/setActiveTab',
  'tabs/reorderTabs',
  'tabs/closeAllTabs',
  'tabs/restoreTabsFromStorage',
];

tabActions.forEach(actionType => {
  persistenceMiddleware.startListening({
    type: actionType,
    effect: (action, listenerApi) => {
      const state = listenerApi.getState();
      const userId = getUserId();
      
      if (!userId) return;
      
      try {
        const tabData = {
          tabs: selectTabs(state),
          activeTabId: selectActiveTabId(state),
          tabOrder: state.tabs.tabOrder,
          lastUpdated: new Date().toISOString(),
        };
        
        localStorage.setItem(
          `${TAB_STORAGE_KEY_PREFIX}${userId}`,
          JSON.stringify(tabData)
        );
        
        // Debug logging (can be removed in production)
        console.log('[Redux Persist] Tab state saved:', tabData.tabs.length, 'tabs');
      } catch (e) {
        console.error('[Redux Persist] Failed to save tab state:', e);
      }
    },
  });
});

/**
 * Configure and create the Redux store
 */
export const store = configureStore({
  reducer: {
    tabs: tabReducer,
    recordCache: recordCacheReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        // Ignore non-serializable values in certain paths
        ignoredActions: ['tabs/updateTabData', 'recordCache/cacheRecord'],
        ignoredPaths: ['recordCache.cache'],
      },
    }).prepend(persistenceMiddleware.middleware),
  devTools: process.env.NODE_ENV !== 'production',
});

// Export store types for TypeScript compatibility
export default store;
