/**
 * Utility for fetching and displaying related records with series_id
 * Format: {name} ({series_id})
 */
import axios from 'axios';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';
const API = `${API_URL}/api`;

// Cache for related records to prevent excessive API calls
const relatedRecordsCache = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Get authentication header
 */
const getAuthHeader = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

/**
 * Fetch a related record by its ID
 * @param {string} objectName - The object type (lead, contact, account, etc.)
 * @param {string} recordId - The record ID or series_id
 * @returns {Promise<Object>} - The related record
 */
export const fetchRelatedRecord = async (objectName, recordId) => {
  if (!recordId || !objectName) return null;

  // Check cache first
  const cacheKey = `${objectName}:${recordId}`;
  const cached = relatedRecordsCache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.data;
  }

  try {
    const response = await axios.get(
      `${API}/objects/${objectName}/records/${recordId}`,
      { headers: getAuthHeader() }
    );
    
    const record = response.data;
    
    // Cache the result
    relatedRecordsCache.set(cacheKey, {
      data: record,
      timestamp: Date.now()
    });
    
    return record;
  } catch (error) {
    console.error(`Error fetching related record (${objectName}:${recordId}):`, error);
    return null;
  }
};

/**
 * Format related record for display
 * @param {Object} record - The related record
 * @param {string} nameField - The field to use as display name (optional)
 * @returns {string} - Formatted string: "Name (series_id)"
 */
export const formatRelatedRecord = (record, nameField = 'name') => {
  if (!record) return '—';
  
  const name = record.data?.[nameField] || 
                record.data?.first_name && record.data?.last_name 
                  ? `${record.data.first_name} ${record.data.last_name}`.trim()
                  : record.data?.title || 
                    record.data?.subject ||
                    'Unnamed';
  
  const seriesId = record.series_id;
  
  if (name && seriesId) {
    return `${name} (${seriesId})`;
  } else if (name) {
    return name;
  } else if (seriesId) {
    return seriesId;
  }
  
  return '—';
};

/**
 * Batch fetch multiple related records
 * @param {Array} relatedFields - Array of {objectName, recordId}
 * @returns {Promise<Map>} - Map of recordId -> formatted display string
 */
export const batchFetchRelatedRecords = async (relatedFields) => {
  const results = new Map();
  
  // Fetch all in parallel
  const promises = relatedFields.map(async ({ objectName, recordId, key }) => {
    if (!recordId) {
      results.set(key, '—');
      return;
    }
    
    const record = await fetchRelatedRecord(objectName, recordId);
    results.set(key, formatRelatedRecord(record));
  });
  
  await Promise.all(promises);
  return results;
};

/**
 * Determine object type from field name
 * @param {string} fieldName - Field name (e.g., 'lead_id', 'contact_id', 'related_to')
 * @param {*} value - The field value
 * @returns {string|null} - The object type (lead, contact, etc.)
 */
export const getRelatedObjectType = (fieldName, value) => {
  // Direct field name mapping
  if (fieldName === 'lead_id' || fieldName === 'lead') return 'lead';
  if (fieldName === 'contact_id' || fieldName === 'contact') return 'contact';
  if (fieldName === 'account_id' || fieldName === 'account') return 'account';
  if (fieldName === 'opportunity_id' || fieldName === 'opportunity') return 'opportunity';
  if (fieldName === 'task_id' || fieldName === 'task') return 'task';
  if (fieldName === 'event_id' || fieldName === 'event') return 'event';
  
  // For generic 'related_to' field, we need to infer from series_id prefix
  if (fieldName === 'related_to' && typeof value === 'string') {
    if (value.startsWith('led-')) return 'lead';
    if (value.startsWith('con-')) return 'contact';
    if (value.startsWith('acc-')) return 'account';
    if (value.startsWith('opp-')) return 'opportunity';
    if (value.startsWith('tsk-')) return 'task';
    if (value.startsWith('evt-')) return 'event';
  }
  
  return null;
};

/**
 * Clear the cache (useful for testing or manual refresh)
 */
export const clearRelatedRecordsCache = () => {
  relatedRecordsCache.clear();
};
