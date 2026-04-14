/**
 * Validation Rules Service
 * API calls for validation rules
 */
import axios from 'axios';

const API = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';

const getAuthHeader = () => {
  const token = localStorage.getItem('token');
  return { Authorization: `Bearer ${token}` };
};

export const validationRulesService = {
  /**
   * Get all validation rules for an object
   */
  async getRules(objectName) {
    const response = await axios.get(`${API}/api/validation-rules/${objectName}`, {
      headers: getAuthHeader()
    });
    return response.data;
  },

  /**
   * Create validation rule
   */
  async createRule(objectName, ruleData) {
    const response = await axios.post(
      `${API}/api/validation-rules/${objectName}`,
      ruleData,
      { headers: getAuthHeader() }
    );
    return response.data;
  },

  /**
   * Update validation rule
   */
  async updateRule(objectName, ruleId, ruleData) {
    const response = await axios.put(
      `${API}/api/validation-rules/${objectName}/${ruleId}`,
      ruleData,
      { headers: getAuthHeader() }
    );
    return response.data;
  },

  /**
   * Delete validation rule
   */
  async deleteRule(objectName, ruleId) {
    const response = await axios.delete(
      `${API}/api/validation-rules/${objectName}/${ruleId}`,
      { headers: getAuthHeader() }
    );
    return response.data;
  },

  /**
   * Get object fields (for condition builder) - LEGACY, use getAvailableFields for parent support
   */
  async getObjectFields(objectName) {
    const response = await axios.get(`${API}/api/objects/${objectName}`, {
      headers: getAuthHeader()
    });
    return response.data;
  },

  /**
   * Get available fields including parent lookup fields
   * @param {string} objectName - Object name
   * @param {boolean} includeParent - Whether to include parent lookup fields
   * @param {number} depth - Depth of lookup traversal (1 = single level)
   * @returns {Promise<Array>} Array of field definitions with full_path for parent fields
   */
  async getAvailableFields(objectName, includeParent = true, depth = 1) {
    const response = await axios.get(
      `${API}/api/validation-rules/${objectName}/available-fields`,
      {
        params: { include_parent: includeParent, depth },
        headers: getAuthHeader()
      }
    );
    return response.data;
  }
};

export default validationRulesService;
