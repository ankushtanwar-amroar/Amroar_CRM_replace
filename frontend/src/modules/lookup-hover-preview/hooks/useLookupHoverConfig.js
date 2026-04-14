/**
 * useLookupHoverConfig - Hook for managing lookup hover preview configuration
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import {
  getEnabledLookupFields,
  checkHoverEnabled,
} from '../services/lookupHoverService';

// Global cache for enabled lookup fields per object
const enabledFieldsCache = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Hook to get enabled lookup fields for an object
 * Used by record view components to know which lookup fields should show hover preview
 */
export const useLookupHoverConfig = (objectName) => {
  const [enabledFields, setEnabledFields] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchConfig = useCallback(async () => {
    if (!objectName) {
      setEnabledFields({});
      setLoading(false);
      return;
    }

    // Check cache first
    const cacheKey = objectName.toLowerCase();
    const cached = enabledFieldsCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      setEnabledFields(cached.data);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const result = await getEnabledLookupFields(objectName);
      const fields = result.enabled_fields || {};
      
      // Update cache
      enabledFieldsCache.set(cacheKey, {
        data: fields,
        timestamp: Date.now(),
      });
      
      setEnabledFields(fields);
      setError(null);
    } catch (err) {
      console.error('Error fetching lookup hover config:', err);
      setError(err.message);
      setEnabledFields({});
    } finally {
      setLoading(false);
    }
  }, [objectName]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  /**
   * Check if hover preview is enabled for a specific field
   * This is the key function - returns false unless explicitly enabled
   */
  const isHoverEnabled = useCallback((fieldName) => {
    return fieldName in enabledFields;
  }, [enabledFields]);

  /**
   * Get hover config for a specific field
   * Returns null if not enabled
   */
  const getFieldConfig = useCallback((fieldName) => {
    return enabledFields[fieldName] || null;
  }, [enabledFields]);

  /**
   * Force refresh the config (e.g., after admin changes)
   */
  const refreshConfig = useCallback(() => {
    const cacheKey = objectName?.toLowerCase();
    if (cacheKey) {
      enabledFieldsCache.delete(cacheKey);
    }
    return fetchConfig();
  }, [objectName, fetchConfig]);

  return {
    enabledFields,
    loading,
    error,
    isHoverEnabled,
    getFieldConfig,
    refreshConfig,
  };
};

/**
 * Clear all cached hover configs
 */
export const clearHoverConfigCache = () => {
  enabledFieldsCache.clear();
};

/**
 * Prefetch hover config for an object
 * Useful for preloading config before navigating to a record
 */
export const prefetchHoverConfig = async (objectName) => {
  if (!objectName) return;
  
  const cacheKey = objectName.toLowerCase();
  const cached = enabledFieldsCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.data;
  }

  try {
    const result = await getEnabledLookupFields(objectName);
    const fields = result.enabled_fields || {};
    enabledFieldsCache.set(cacheKey, {
      data: fields,
      timestamp: Date.now(),
    });
    return fields;
  } catch (err) {
    console.error('Error prefetching hover config:', err);
    return {};
  }
};

export default useLookupHoverConfig;
