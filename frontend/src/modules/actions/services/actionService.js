/**
 * Action Service
 * API calls for managing and executing actions
 */
import axios from 'axios';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };
};

export const actionService = {
  // ============================================
  // Admin / Setup APIs
  // ============================================
  
  /**
   * Get all actions for an object
   */
  getActions: async (objectApiName, options = {}) => {
    const params = new URLSearchParams();
    if (objectApiName) params.append('object', objectApiName);
    if (options.activeOnly) params.append('active_only', 'true');
    if (options.placement) params.append('placement', options.placement);
    
    const response = await axios.get(
      `${API_URL}/api/actions?${params.toString()}`,
      { headers: getAuthHeaders() }
    );
    return response.data;
  },
  
  /**
   * Get a single action by ID
   */
  getAction: async (actionId) => {
    const response = await axios.get(
      `${API_URL}/api/actions/${actionId}`,
      { headers: getAuthHeaders() }
    );
    return response.data;
  },
  
  /**
   * Create a new action
   */
  createAction: async (actionData) => {
    const response = await axios.post(
      `${API_URL}/api/actions`,
      actionData,
      { headers: getAuthHeaders() }
    );
    return response.data;
  },
  
  /**
   * Update an action
   */
  updateAction: async (actionId, updateData) => {
    const response = await axios.put(
      `${API_URL}/api/actions/${actionId}`,
      updateData,
      { headers: getAuthHeaders() }
    );
    return response.data;
  },
  
  /**
   * Delete an action
   */
  deleteAction: async (actionId) => {
    const response = await axios.delete(
      `${API_URL}/api/actions/${actionId}`,
      { headers: getAuthHeaders() }
    );
    return response.data;
  },
  
  /**
   * Clone an action
   */
  cloneAction: async (actionId) => {
    const response = await axios.post(
      `${API_URL}/api/actions/${actionId}/clone`,
      {},
      { headers: getAuthHeaders() }
    );
    return response.data;
  },
  
  /**
   * Toggle action active status
   */
  toggleActive: async (actionId) => {
    const response = await axios.patch(
      `${API_URL}/api/actions/${actionId}/toggle-active`,
      {},
      { headers: getAuthHeaders() }
    );
    return response.data;
  },
  
  /**
   * Reorder actions
   */
  reorderActions: async (objectApiName, actionIds) => {
    const response = await axios.post(
      `${API_URL}/api/actions/reorder`,
      { action_ids: actionIds },
      { 
        headers: getAuthHeaders(),
        params: { object_api_name: objectApiName }
      }
    );
    return response.data;
  },
  
  // ============================================
  // Runtime APIs
  // ============================================
  
  /**
   * Get runtime actions for a record page
   */
  getRuntimeActions: async (objectApiName, placement = 'RECORD_HEADER') => {
    const response = await axios.get(
      `${API_URL}/api/actions/runtime/${objectApiName}?placement=${placement}`,
      { headers: getAuthHeaders() }
    );
    return response.data;
  },
  
  /**
   * Execute an action
   */
  executeAction: async (actionId, recordId, recordData = null, formData = null) => {
    const response = await axios.post(
      `${API_URL}/api/actions/${actionId}/execute`,
      {
        record_id: recordId,
        record_data: recordData,
        form_data: formData
      },
      { headers: getAuthHeaders() }
    );
    return response.data;
  }
};

export default actionService;
