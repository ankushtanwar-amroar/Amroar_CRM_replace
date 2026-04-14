/**
 * Search Configuration Service
 * API calls for Configure Search Metadata admin UI
 */

import axios from 'axios';

const API = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';

const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  return {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  };
};

const searchConfigService = {
  /**
   * Get all objects with their searchable status
   */
  getAllObjects: async () => {
    const response = await axios.get(
      `${API}/api/search/admin/objects`,
      getAuthHeaders()
    );
    return response.data;
  },

  /**
   * Get all fields for an object with their searchable status
   */
  getObjectFields: async (objectName) => {
    const response = await axios.get(
      `${API}/api/search/admin/objects/${objectName}/fields`,
      getAuthHeaders()
    );
    return response.data;
  },

  /**
   * Update object searchable status
   */
  updateObjectSearchable: async (objectName, isSearchable) => {
    const response = await axios.put(
      `${API}/api/search/admin/objects/${objectName}/searchable?is_searchable=${isSearchable}`,
      {},
      getAuthHeaders()
    );
    return response.data;
  },

  /**
   * Update object priority
   */
  updateObjectPriority: async (objectName, priority) => {
    const response = await axios.put(
      `${API}/api/search/admin/objects/${objectName}/priority?priority=${priority}`,
      {},
      getAuthHeaders()
    );
    return response.data;
  },

  /**
   * Update field configuration (searchability and preview status)
   */
  updateFieldConfig: async (objectName, fieldName, config) => {
    const params = new URLSearchParams();
    if (config.is_searchable !== undefined) {
      params.append('is_searchable', config.is_searchable);
    }
    if (config.is_preview_primary !== undefined) {
      params.append('is_preview_primary', config.is_preview_primary);
    }
    if (config.is_preview_secondary !== undefined) {
      params.append('is_preview_secondary', config.is_preview_secondary);
    }

    const response = await axios.put(
      `${API}/api/search/admin/objects/${objectName}/fields/${fieldName}?${params.toString()}`,
      {},
      getAuthHeaders()
    );
    return response.data;
  },

  /**
   * Batch update object priorities (for drag-and-drop reordering)
   */
  updateBatchPriority: async (priorities) => {
    const response = await axios.put(
      `${API}/api/search/admin/objects/batch-priority`,
      priorities,
      getAuthHeaders()
    );
    return response.data;
  },

  /**
   * Get preview settings
   */
  getPreviewSettings: async () => {
    const response = await axios.get(
      `${API}/api/search/admin/preview-settings`,
      getAuthHeaders()
    );
    return response.data;
  },

  /**
   * Update preview settings
   */
  updatePreviewSettings: async (resultsPerObject) => {
    const response = await axios.put(
      `${API}/api/search/admin/preview-settings?results_per_object=${resultsPerObject}`,
      {},
      getAuthHeaders()
    );
    return response.data;
  },

  /**
   * Get current search configuration
   */
  getConfig: async () => {
    const response = await axios.get(
      `${API}/api/search/config`,
      getAuthHeaders()
    );
    return response.data;
  },
};

export default searchConfigService;
