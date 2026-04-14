/**
 * Record Cache Slice - Redux state management for cached record data
 * 
 * Prevents duplicate API calls by caching record data in memory.
 * When switching between tabs, cached data is used instantly.
 * 
 * Features:
 * - LRU-style cache with max size
 * - Automatic expiration after TTL
 * - Selective invalidation
 */
import { createSlice, createSelector } from '@reduxjs/toolkit';

// Cache configuration
const MAX_CACHE_SIZE = 50;  // Maximum number of records to cache
const CACHE_TTL_MS = 5 * 60 * 1000;  // 5 minutes TTL

const recordCacheSlice = createSlice({
  name: 'recordCache',
  initialState: {
    cache: {},              // { [cacheKey]: { data, schema, layout, lastFetched, accessCount } }
    accessOrder: [],        // Array of cache keys in LRU order
    pendingRequests: {},    // { [cacheKey]: true } - tracks in-flight requests
  },
  reducers: {
    /**
     * Cache record data
     */
    cacheRecord: (state, action) => {
      const { objectType, recordId, data, schema, layout } = action.payload;
      const cacheKey = `${objectType}_${recordId}`;
      
      // Update or create cache entry
      state.cache[cacheKey] = {
        objectType,
        recordId,
        data,
        schema,
        layout,
        lastFetched: Date.now(),
        accessCount: (state.cache[cacheKey]?.accessCount || 0) + 1,
      };
      
      // Update access order (move to front for LRU)
      state.accessOrder = [cacheKey, ...state.accessOrder.filter(k => k !== cacheKey)];
      
      // Enforce max cache size (remove least recently used)
      while (state.accessOrder.length > MAX_CACHE_SIZE) {
        const keyToRemove = state.accessOrder.pop();
        delete state.cache[keyToRemove];
      }
    },

    /**
     * Update cached record data (for inline edits)
     */
    updateCachedRecord: (state, action) => {
      const { objectType, recordId, updates } = action.payload;
      const cacheKey = `${objectType}_${recordId}`;
      
      if (state.cache[cacheKey]) {
        state.cache[cacheKey].data = {
          ...state.cache[cacheKey].data,
          ...updates,
          data: {
            ...state.cache[cacheKey].data?.data,
            ...updates?.data,
          },
        };
        state.cache[cacheKey].lastFetched = Date.now();
      }
    },

    /**
     * Mark record data as accessed (updates LRU order)
     */
    accessRecord: (state, action) => {
      const { objectType, recordId } = action.payload;
      const cacheKey = `${objectType}_${recordId}`;
      
      if (state.cache[cacheKey]) {
        state.cache[cacheKey].accessCount += 1;
        state.accessOrder = [cacheKey, ...state.accessOrder.filter(k => k !== cacheKey)];
      }
    },

    /**
     * Invalidate a specific record (force re-fetch)
     */
    invalidateRecord: (state, action) => {
      const { objectType, recordId } = action.payload;
      const cacheKey = `${objectType}_${recordId}`;
      
      delete state.cache[cacheKey];
      state.accessOrder = state.accessOrder.filter(k => k !== cacheKey);
    },

    /**
     * Invalidate all records of a specific object type
     */
    invalidateObjectType: (state, action) => {
      const { objectType } = action.payload;
      const prefix = `${objectType}_`;
      
      const keysToRemove = Object.keys(state.cache).filter(k => k.startsWith(prefix));
      keysToRemove.forEach(key => {
        delete state.cache[key];
      });
      state.accessOrder = state.accessOrder.filter(k => !keysToRemove.includes(k));
    },

    /**
     * Set pending request status
     */
    setPendingRequest: (state, action) => {
      const { objectType, recordId, isPending } = action.payload;
      const cacheKey = `${objectType}_${recordId}`;
      
      if (isPending) {
        state.pendingRequests[cacheKey] = true;
      } else {
        delete state.pendingRequests[cacheKey];
      }
    },

    /**
     * Clear expired cache entries
     */
    clearExpiredCache: (state) => {
      const now = Date.now();
      const keysToRemove = Object.keys(state.cache).filter(key => {
        const entry = state.cache[key];
        return (now - entry.lastFetched) > CACHE_TTL_MS;
      });
      
      keysToRemove.forEach(key => {
        delete state.cache[key];
      });
      state.accessOrder = state.accessOrder.filter(k => !keysToRemove.includes(k));
    },

    /**
     * Clear all cache (for logout)
     */
    clearAllCache: (state) => {
      state.cache = {};
      state.accessOrder = [];
      state.pendingRequests = {};
    },
  },
});

// Export actions
export const {
  cacheRecord,
  updateCachedRecord,
  accessRecord,
  invalidateRecord,
  invalidateObjectType,
  setPendingRequest,
  clearExpiredCache,
  clearAllCache,
} = recordCacheSlice.actions;

// Selectors
export const selectRecordCache = (state) => state.recordCache.cache;

/**
 * Select cached record data
 * Returns null if not cached or expired
 */
export const selectCachedRecord = (state, objectType, recordId) => {
  const cacheKey = `${objectType}_${recordId}`;
  const entry = state.recordCache.cache[cacheKey];
  
  if (!entry) return null;
  
  // Check if expired
  if ((Date.now() - entry.lastFetched) > CACHE_TTL_MS) {
    return null;
  }
  
  return entry;
};

/**
 * Check if a request is pending
 */
export const selectIsPendingRequest = (state, objectType, recordId) => {
  const cacheKey = `${objectType}_${recordId}`;
  return !!state.recordCache.pendingRequests[cacheKey];
};

/**
 * Select if record is in cache (regardless of expiry)
 */
export const selectHasCachedRecord = (state, objectType, recordId) => {
  const cacheKey = `${objectType}_${recordId}`;
  return !!state.recordCache.cache[cacheKey];
};

// Memoized selector for cache stats
export const selectCacheStats = createSelector(
  [(state) => state.recordCache.cache, (state) => state.recordCache.accessOrder],
  (cache, accessOrder) => ({
    size: Object.keys(cache).length,
    maxSize: MAX_CACHE_SIZE,
    oldestKey: accessOrder[accessOrder.length - 1] || null,
    newestKey: accessOrder[0] || null,
  })
);

export default recordCacheSlice.reducer;
