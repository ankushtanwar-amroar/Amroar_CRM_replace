/**
 * useReduxTabCache - Hook for integrating Redux caching with existing tab system
 * 
 * This hook provides:
 * 1. Record data caching in Redux store
 * 2. Instant tab switching without API calls
 * 3. Background refresh for stale data
 * 4. Integration with existing localStorage/DB persistence
 * 
 * Usage:
 * const { getCachedData, cacheData, isDataCached } = useReduxTabCache();
 */
import { useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import {
  cacheRecord,
  updateCachedRecord,
  accessRecord,
  invalidateRecord,
  selectCachedRecord,
  selectIsPendingRequest,
  setPendingRequest,
  clearExpiredCache,
} from '../store/slices/recordCacheSlice';

// Cache TTL in milliseconds
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Hook for managing record data cache
 */
export const useReduxTabCache = () => {
  const dispatch = useDispatch();

  /**
   * Get cached record data
   * @returns {Object|null} Cached record data or null if not cached/expired
   */
  const getCachedData = useCallback((objectType, recordId) => {
    return (state) => {
      const cached = selectCachedRecord(state, objectType, recordId);
      if (!cached) return null;
      
      // Check if data is expired
      const age = Date.now() - cached.lastFetched;
      if (age > CACHE_TTL) {
        return null; // Expired
      }
      
      return cached;
    };
  }, []);

  /**
   * Check if record is cached (without checking expiry)
   */
  const isDataCached = useCallback((objectType, recordId) => {
    return (state) => {
      return !!selectCachedRecord(state, objectType, recordId);
    };
  }, []);

  /**
   * Cache record data
   */
  const cacheData = useCallback((objectType, recordId, data, schema = null, layout = null) => {
    dispatch(cacheRecord({
      objectType,
      recordId,
      data,
      schema,
      layout,
    }));
  }, [dispatch]);

  /**
   * Update cached record (for inline edits)
   */
  const updateCache = useCallback((objectType, recordId, updates) => {
    dispatch(updateCachedRecord({
      objectType,
      recordId,
      updates,
    }));
  }, [dispatch]);

  /**
   * Invalidate cache for a record (force refetch)
   */
  const invalidateCache = useCallback((objectType, recordId) => {
    dispatch(invalidateRecord({ objectType, recordId }));
  }, [dispatch]);

  /**
   * Mark record as accessed (for LRU ordering)
   */
  const markAccessed = useCallback((objectType, recordId) => {
    dispatch(accessRecord({ objectType, recordId }));
  }, [dispatch]);

  /**
   * Check if a fetch is pending
   */
  const isPending = useCallback((objectType, recordId) => {
    return (state) => selectIsPendingRequest(state, objectType, recordId);
  }, []);

  /**
   * Set pending status
   */
  const setFetchPending = useCallback((objectType, recordId, pending) => {
    dispatch(setPendingRequest({ objectType, recordId, isPending: pending }));
  }, [dispatch]);

  /**
   * Clear expired cache entries
   */
  const cleanupExpired = useCallback(() => {
    dispatch(clearExpiredCache());
  }, [dispatch]);

  return {
    getCachedData,
    isDataCached,
    cacheData,
    updateCache,
    invalidateCache,
    markAccessed,
    isPending,
    setFetchPending,
    cleanupExpired,
  };
};

/**
 * Selector hook for specific record cache
 */
export const useRecordCacheSelector = (objectType, recordId) => {
  const cachedData = useSelector(state => selectCachedRecord(state, objectType, recordId));
  const isPending = useSelector(state => selectIsPendingRequest(state, objectType, recordId));
  
  const isExpired = cachedData ? (Date.now() - cachedData.lastFetched) > CACHE_TTL : true;
  const hasFreshCache = cachedData && !isExpired;
  
  return {
    cachedData,
    isPending,
    isExpired,
    hasFreshCache,
    record: cachedData?.data,
    schema: cachedData?.schema,
    layout: cachedData?.layout,
  };
};

export default useReduxTabCache;
