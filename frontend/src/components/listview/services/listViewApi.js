/**
 * List View API Service
 * Handles all API calls for list views, records, and user preferences
 */
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// ============================================
// USER PREFERENCES
// ============================================

export const loadUserPreferences = async (objectName) => {
  const response = await axios.get(`${API}/user-preferences/${objectName}`);
  return response.data;
};

export const saveUserPreferences = async (objectName, updates) => {
  await axios.post(`${API}/user-preferences/${objectName}`, updates);
};

export const pinView = async (objectName, viewId) => {
  await axios.post(`${API}/user-preferences/${objectName}/pin-view?view_id=${viewId}`);
};

export const unpinView = async (objectName) => {
  await axios.delete(`${API}/user-preferences/${objectName}/pin-view`);
};

// ============================================
// LIST VIEWS
// ============================================

export const fetchListViews = async (objectName) => {
  const response = await axios.get(`${API}/list-views/${objectName}`);
  return response.data;
};

export const createListView = async (objectName, viewData) => {
  const response = await axios.post(`${API}/list-views/${objectName}/create`, viewData);
  return response.data;
};

export const cloneListView = async (objectName, viewId, newName) => {
  const response = await axios.post(
    `${API}/list-views/${objectName}/${viewId}/clone?name=${encodeURIComponent(newName)}`
  );
  return response.data;
};

export const updateListView = async (viewId, updates) => {
  const response = await axios.patch(`${API}/list-views/${viewId}/update`, updates);
  return response.data;
};

export const deleteListView = async (viewId) => {
  await axios.delete(`${API}/list-views/${viewId}`);
};

export const toggleViewPin = async (viewId, isPinned) => {
  await axios.patch(`${API}/list-views/${viewId}/pin`, { is_pinned: !isPinned });
};

// ============================================
// RECORDS
// ============================================

export const fetchRecords = async (objectName, params) => {
  const {
    currentPage,
    pageSize,
    sortBy,
    sortOrder,
    searchTerm,
    filterField,
    filterValue,
    filterCondition,
    selectedView,
    currentView,
    isMyRecordsOnly
  } = params;

  const urlParams = new URLSearchParams();

  // Add pagination
  urlParams.append('page', currentPage);
  urlParams.append('limit', pageSize);
  urlParams.append('paginate', 'true');

  // Add sorting
  if (sortBy) {
    urlParams.append('sort_by', sortBy);
    urlParams.append('sort_order', sortOrder);
  }

  // Add search
  if (searchTerm) {
    urlParams.append('search', searchTerm);
  }

  // Add manual filters
  if (filterField && filterValue) {
    urlParams.append('filter_field', filterField);
    urlParams.append('filter_value', filterValue);
  }

  // Handle list view filter criteria
  if (currentView?.filter_criteria && Object.keys(currentView.filter_criteria).length > 0) {
    const filterEntries = Object.entries(currentView.filter_criteria);
    
    if (filterEntries.length > 0) {
      const [firstKey, firstValue] = filterEntries[0];
      if (firstKey !== 'recently_viewed' && firstKey !== 'created_by') {
        const actualValue = typeof firstValue === 'object' ? firstValue.value : firstValue;
        const condition = typeof firstValue === 'object' ? firstValue.condition : 'equals';
        
        if (actualValue) {
          urlParams.append('filter_field', firstKey);
          urlParams.append('filter_value', actualValue);
          urlParams.append('filter_condition', condition || 'equals');
        }
      }
      
      urlParams.append('list_view_filters', JSON.stringify(currentView.filter_criteria));
    }
  }
  
  // Handle system views
  if (isMyRecordsOnly) {
    urlParams.append('my_records_only', 'true');
  }

  const response = await axios.get(`${API}/objects/${objectName}/records?${urlParams}`);
  return response.data;
};

export const fetchRecentlyViewedRecords = async (objectName) => {
  const response = await axios.get(`${API}/objects/${objectName}/recently-viewed`);
  return response.data;
};

export const updateRecord = async (objectName, recordId, data) => {
  const response = await axios.put(`${API}/objects/${objectName}/records/${recordId}`, { data });
  return response.data;
};

export const deleteRecord = async (objectName, recordId) => {
  await axios.delete(`${API}/objects/${objectName}/records/${recordId}`);
};

export const trackRecordView = async (objectName, recordId) => {
  await axios.post(`${API}/objects/${objectName}/records/${recordId}/view`);
};

export default {
  // User Preferences
  loadUserPreferences,
  saveUserPreferences,
  pinView,
  unpinView,
  // List Views
  fetchListViews,
  createListView,
  cloneListView,
  updateListView,
  deleteListView,
  toggleViewPin,
  // Records
  fetchRecords,
  fetchRecentlyViewedRecords,
  updateRecord,
  deleteRecord,
  trackRecordView,
};
