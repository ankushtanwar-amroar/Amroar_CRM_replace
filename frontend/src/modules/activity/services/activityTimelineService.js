/**
 * Activity Timeline Service
 * API calls for fetching and managing activity records
 */

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

const getAuthHeader = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

/**
 * Fetch combined activity timeline for a parent record
 */
export const fetchActivityTimeline = async (parentObjectName, parentRecordId, activityTypes, options = {}) => {
  const { sortOrder = 'desc', limit = 50 } = options;
  
  // Filter to only enabled activity types
  const enabledTypes = activityTypes
    .filter(t => t.enabledInTimeline)
    .map(t => t.type);
  
  if (enabledTypes.length === 0) {
    return [];
  }
  
  try {
    // Fetch activities from each enabled type in parallel
    const promises = enabledTypes.map(async (type) => {
      const typeConfig = activityTypes.find(t => t.type === type);
      
      try {
        const response = await fetch(
          `${API_URL}/api/objects/${type}/records?limit=${limit}`,
          { headers: getAuthHeader() }
        );
        
        if (!response.ok) {
          console.warn(`Failed to fetch ${type} activities:`, response.status);
          return [];
        }
        
        const data = await response.json();
        const records = data.records || data || [];
        
        // Filter records related to the parent record
        const relatedRecords = records.filter(record => {
          const relatedTo = record.data?.related_to || record.data?.parent_id;
          return relatedTo === parentRecordId;
        });
        
        // Map to unified activity format
        return relatedRecords.map(record => ({
          id: record.series_id || record.id,
          _id: record._id,
          type: type,
          typeLabel: typeConfig?.label || type,
          title: record.data?.[typeConfig?.titleField || 'subject'] || record.data?.name || 'Untitled',
          date: record.data?.[typeConfig?.dateField || 'created_at'] || record.created_at,
          status: typeConfig?.statusField ? record.data?.[typeConfig.statusField] : null,
          owner: record.data?.owner_name || record.data?.owner || null,
          description: record.data?.description || null,
          recordUrl: `/crm/${type}/${record.series_id || record.id}`,
          rawData: record.data,
        }));
      } catch (err) {
        console.warn(`Error fetching ${type} activities:`, err);
        return [];
      }
    });
    
    // Wait for all fetches to complete
    const results = await Promise.all(promises);
    
    // Combine and sort all activities
    const combinedActivities = results.flat();
    
    // Sort by date
    combinedActivities.sort((a, b) => {
      const dateA = new Date(a.date || 0);
      const dateB = new Date(b.date || 0);
      return sortOrder === 'desc' ? dateB - dateA : dateA - dateB;
    });
    
    return combinedActivities;
  } catch (err) {
    console.error('Error fetching activity timeline:', err);
    throw err;
  }
};

/**
 * Create a new activity record linked to parent
 */
export const createActivity = async (activityType, data, parentObjectName, parentRecordId) => {
  try {
    // Add parent relationship fields
    const activityData = {
      ...data,
      related_to: parentRecordId,
      related_to_type: parentObjectName,
    };
    
    const response = await fetch(
      `${API_URL}/api/objects/${activityType}/records`,
      {
        method: 'POST',
        headers: {
          ...getAuthHeader(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ data: activityData }),
      }
    );
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || `Failed to create ${activityType}`);
    }
    
    return await response.json();
  } catch (err) {
    console.error(`Error creating ${activityType}:`, err);
    throw err;
  }
};

/**
 * Get object metadata for an activity type
 */
export const getActivityObjectMetadata = async (activityType) => {
  try {
    const response = await fetch(
      `${API_URL}/api/metadata/${activityType}`,
      { headers: getAuthHeader() }
    );
    
    if (!response.ok) {
      return null;
    }
    
    return await response.json();
  } catch (err) {
    console.warn(`Error fetching metadata for ${activityType}:`, err);
    return null;
  }
};

/**
 * Check if user has access to an activity object type
 */
export const checkActivityTypeAccess = async (activityType) => {
  try {
    // Try to fetch metadata - if accessible, user has permission
    const metadata = await getActivityObjectMetadata(activityType);
    return metadata !== null;
  } catch {
    return false;
  }
};

/**
 * Get available activity types that user has access to
 */
export const getAccessibleActivityTypes = async (activityTypes) => {
  const accessChecks = await Promise.all(
    activityTypes.map(async (type) => ({
      ...type,
      hasAccess: await checkActivityTypeAccess(type.type),
    }))
  );
  
  return accessChecks.filter(t => t.hasAccess);
};

// Cache for activity timeline
let timelineCache = new Map();
const CACHE_DURATION = 30000; // 30 seconds

/**
 * Fetch activity timeline with caching
 */
export const fetchActivityTimelineCached = async (parentObjectName, parentRecordId, activityTypes, options = {}) => {
  const cacheKey = `${parentObjectName}:${parentRecordId}:${activityTypes.map(t => t.type).join(',')}`;
  const cached = timelineCache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.data;
  }
  
  const data = await fetchActivityTimeline(parentObjectName, parentRecordId, activityTypes, options);
  timelineCache.set(cacheKey, { data, timestamp: Date.now() });
  
  return data;
};

/**
 * Clear activity timeline cache (call after creating new activity)
 */
export const clearActivityTimelineCache = () => {
  timelineCache.clear();
};

/**
 * Invalidate cache for specific parent record
 */
export const invalidateCacheForRecord = (parentObjectName, parentRecordId) => {
  for (const [key] of timelineCache) {
    if (key.startsWith(`${parentObjectName}:${parentRecordId}`)) {
      timelineCache.delete(key);
    }
  }
};

export default {
  fetchActivityTimeline,
  fetchActivityTimelineCached,
  createActivity,
  getActivityObjectMetadata,
  checkActivityTypeAccess,
  getAccessibleActivityTypes,
  clearActivityTimelineCache,
  invalidateCacheForRecord,
};
