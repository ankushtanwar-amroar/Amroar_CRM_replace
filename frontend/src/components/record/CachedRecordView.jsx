/**
 * CachedRecordView - Record view with Redux caching
 * 
 * This component wraps DynamicRecordView with caching logic:
 * - First load: Fetches data from API and caches in Redux
 * - Subsequent views: Uses cached data for instant display
 * - Background refresh: Optionally refreshes data in background
 * 
 * Benefits:
 * - Instant tab switching (no loading spinner)
 * - Reduced API calls
 * - Preserved scroll position and form state
 */
import React, { memo, useEffect, useCallback, useRef, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import axios from 'axios';
import {
  cacheRecord,
  selectCachedRecord,
  selectIsPendingRequest,
  setPendingRequest,
  updateCachedRecord,
} from '../../store/slices/recordCacheSlice';
import { updateTabData } from '../../store/slices/tabSlice';
import DynamicRecordView from '../../crm_platform/components/DynamicRecordView';
import { Loader2 } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

// Cache TTL in milliseconds (5 minutes)
const CACHE_TTL = 5 * 60 * 1000;

/**
 * CachedRecordView Component
 */
const CachedRecordView = memo(({
  objectApiName,
  recordSeriesId,
  tenantId,
  tabId,
  onOpenRelated,
  isActive = true,
}) => {
  const dispatch = useDispatch();
  const cacheKey = `${objectApiName}_${recordSeriesId}`;
  
  // Select cached data from Redux
  const cachedData = useSelector(state => selectCachedRecord(state, objectApiName, recordSeriesId));
  const isPending = useSelector(state => selectIsPendingRequest(state, objectApiName, recordSeriesId));
  
  // Local state for fresh fetch (when cache is stale)
  const [isFreshFetch, setIsFreshFetch] = useState(false);
  const mountedRef = useRef(true);
  const lastFetchRef = useRef(0);

  /**
   * Fetch record data from API
   */
  const fetchRecordData = useCallback(async (forceRefresh = false) => {
    // Skip if already fetching
    if (isPending) return;
    
    // Skip if we have fresh cached data (unless forcing refresh)
    if (cachedData && !forceRefresh) {
      const cacheAge = Date.now() - cachedData.lastFetched;
      if (cacheAge < CACHE_TTL) {
        console.log(`[CachedRecordView] Using cached data for ${cacheKey} (${Math.round(cacheAge/1000)}s old)`);
        return;
      }
    }

    try {
      // Mark request as pending
      dispatch(setPendingRequest({ objectType: objectApiName, recordId: recordSeriesId, isPending: true }));
      setIsFreshFetch(!cachedData); // Show loading only if no cached data
      
      const token = localStorage.getItem('token');
      if (!token) {
        console.error('[CachedRecordView] No auth token');
        return;
      }

      const startTime = performance.now();
      
      // Fetch record, schema, and layout in parallel
      const [recordRes, schemaRes, layoutRes] = await Promise.all([
        axios.get(`${BACKEND_URL}/api/objects/${objectApiName}/records/${recordSeriesId}`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        axios.get(`${BACKEND_URL}/api/objects/${objectApiName}/schema`, {
          headers: { Authorization: `Bearer ${token}` }
        }).catch(() => ({ data: null })),
        axios.get(`${BACKEND_URL}/api/objects/${objectApiName}/lightning-pages`, {
          headers: { Authorization: `Bearer ${token}` },
          params: { page_type: 'record_page' }
        }).catch(() => ({ data: [] })),
      ]);

      const fetchTime = performance.now() - startTime;
      console.log(`[CachedRecordView] Fetched ${cacheKey} in ${Math.round(fetchTime)}ms`);

      if (!mountedRef.current) return;

      // Cache the data in Redux
      dispatch(cacheRecord({
        objectType: objectApiName,
        recordId: recordSeriesId,
        data: recordRes.data,
        schema: schemaRes.data,
        layout: layoutRes.data,
      }));

      // Update tab label with record name
      if (tabId && recordRes.data) {
        const recordName = getRecordDisplayName(recordRes.data, schemaRes.data);
        if (recordName) {
          dispatch(updateTabData({ tabId, label: recordName }));
        }
      }

      lastFetchRef.current = Date.now();
    } catch (error) {
      console.error(`[CachedRecordView] Fetch error for ${cacheKey}:`, error);
    } finally {
      if (mountedRef.current) {
        dispatch(setPendingRequest({ objectType: objectApiName, recordId: recordSeriesId, isPending: false }));
        setIsFreshFetch(false);
      }
    }
  }, [dispatch, objectApiName, recordSeriesId, cachedData, isPending, tabId, cacheKey]);

  /**
   * Extract display name from record
   */
  const getRecordDisplayName = (record, schema) => {
    if (!record) return null;
    const data = record.data || record;
    
    // Try common name fields
    if (data.name) return data.name;
    if (data.first_name || data.last_name) {
      return `${data.first_name || ''} ${data.last_name || ''}`.trim();
    }
    if (data.subject) return data.subject;
    if (data.title) return data.title;
    
    // Use schema name field
    if (schema?.name_field && data[schema.name_field]) {
      return data[schema.name_field];
    }
    
    return null;
  };

  /**
   * Handle record update (for cache invalidation)
   */
  const handleRecordUpdate = useCallback((updates) => {
    dispatch(updateCachedRecord({
      objectType: objectApiName,
      recordId: recordSeriesId,
      updates,
    }));
  }, [dispatch, objectApiName, recordSeriesId]);

  // Fetch on mount or when becoming active
  useEffect(() => {
    mountedRef.current = true;
    
    if (isActive) {
      fetchRecordData();
    }
    
    return () => {
      mountedRef.current = false;
    };
  }, [fetchRecordData, isActive]);

  // Show loading state only for fresh fetch (no cached data)
  if (isFreshFetch && !cachedData) {
    return (
      <div className="flex items-center justify-center h-64 bg-white">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto mb-2" />
          <p className="text-sm text-slate-500">Loading record...</p>
        </div>
      </div>
    );
  }

  // Show cached record
  return (
    <DynamicRecordView
      objectApiName={objectApiName}
      recordSeriesId={recordSeriesId}
      tenantId={tenantId}
      onOpenRelated={onOpenRelated}
      initialData={cachedData?.data}
      initialSchema={cachedData?.schema}
      initialLayout={cachedData?.layout}
      onRecordUpdate={handleRecordUpdate}
    />
  );
});

CachedRecordView.displayName = 'CachedRecordView';

export default CachedRecordView;
