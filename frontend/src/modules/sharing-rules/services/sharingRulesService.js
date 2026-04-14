/**
 * Sharing Rules Service
 * Handles all API calls for sharing rules management
 */
import axios from 'axios';

const API = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';

const getAuthHeader = () => {
  const token = localStorage.getItem('token');
  return { Authorization: `Bearer ${token}` };
};

export const sharingRulesService = {
  /**
   * Get all sharing rules
   */
  async getAllRules(filters = {}) {
    const params = new URLSearchParams();
    if (filters.object_name) params.append('object_name', filters.object_name);
    if (filters.rule_type) params.append('rule_type', filters.rule_type);
    if (filters.is_active !== undefined) params.append('is_active', filters.is_active);
    
    const response = await axios.get(`${API}/api/sharing-rules?${params.toString()}`, {
      headers: getAuthHeader()
    });
    return response.data;
  },

  /**
   * Get single rule by ID
   */
  async getRule(ruleId) {
    const response = await axios.get(`${API}/api/sharing-rules/${ruleId}`, {
      headers: getAuthHeader()
    });
    return response.data;
  },

  /**
   * Create new sharing rule
   */
  async createRule(ruleData) {
    const response = await axios.post(`${API}/api/sharing-rules`, ruleData, {
      headers: getAuthHeader()
    });
    return response.data;
  },

  /**
   * Update sharing rule
   */
  async updateRule(ruleId, ruleData) {
    const response = await axios.put(`${API}/api/sharing-rules/${ruleId}`, ruleData, {
      headers: getAuthHeader()
    });
    return response.data;
  },

  /**
   * Delete sharing rule
   */
  async deleteRule(ruleId) {
    const response = await axios.delete(`${API}/api/sharing-rules/${ruleId}`, {
      headers: getAuthHeader()
    });
    return response.data;
  },

  /**
   * Toggle rule active status
   */
  async toggleRule(ruleId) {
    const response = await axios.post(`${API}/api/sharing-rules/${ruleId}/toggle`, {}, {
      headers: getAuthHeader()
    });
    return response.data;
  },

  /**
   * Get available share targets (users, roles, groups, queues)
   */
  async getShareTargets() {
    const response = await axios.get(`${API}/api/sharing-rules/targets/available`, {
      headers: getAuthHeader()
    });
    return response.data;
  },

  /**
   * Get available fields for an object (for criteria building)
   */
  async getObjectFields(objectName) {
    const response = await axios.get(`${API}/api/sharing-rules/fields/${objectName}`, {
      headers: getAuthHeader()
    });
    return response.data;
  },

  /**
   * Get available objects
   */
  async getAvailableObjects() {
    const response = await axios.get(`${API}/api/queue-objects`, {
      headers: getAuthHeader()
    });
    return response.data;
  }
};

export default sharingRulesService;
