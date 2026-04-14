/**
 * Access Bundle Service
 * Handles all API calls for access bundles
 */
import axios from 'axios';

const API = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';

const getAuthHeader = () => {
  const token = localStorage.getItem('token');
  return { Authorization: `Bearer ${token}` };
};

export const accessBundleService = {
  /**
   * Get all access bundles
   */
  async getAll() {
    const response = await axios.get(`${API}/api/access-bundles`, {
      headers: getAuthHeader()
    });
    return response.data;
  },

  /**
   * Get a specific access bundle by ID
   */
  async getById(bundleId) {
    const response = await axios.get(`${API}/api/access-bundles/${bundleId}`, {
      headers: getAuthHeader()
    });
    return response.data;
  },

  /**
   * Create a new access bundle
   */
  async create(bundleData) {
    const response = await axios.post(`${API}/api/access-bundles`, bundleData, {
      headers: getAuthHeader()
    });
    return response.data;
  },

  /**
   * Update an access bundle
   */
  async update(bundleId, bundleData) {
    const response = await axios.put(`${API}/api/access-bundles/${bundleId}`, bundleData, {
      headers: getAuthHeader()
    });
    return response.data;
  },

  /**
   * Delete an access bundle
   */
  async delete(bundleId) {
    const response = await axios.delete(`${API}/api/access-bundles/${bundleId}`, {
      headers: getAuthHeader()
    });
    return response.data;
  },

  /**
   * Assign bundle to users
   */
  async assignToUsers(bundleId, userIds) {
    const response = await axios.post(
      `${API}/api/access-bundles/${bundleId}/assign`,
      { user_ids: userIds },
      { headers: getAuthHeader() }
    );
    return response.data;
  },

  /**
   * Remove bundle from user
   */
  async removeFromUser(bundleId, userId) {
    const response = await axios.delete(
      `${API}/api/access-bundles/${bundleId}/users/${userId}`,
      { headers: getAuthHeader() }
    );
    return response.data;
  },

  /**
   * Get all permission sets (for bundle configuration)
   */
  async getPermissionSets() {
    const response = await axios.get(`${API}/api/permission-sets`, {
      headers: getAuthHeader()
    });
    return response.data;
  },

  /**
   * Get all users (for assignment)
   */
  async getUsers() {
    const response = await axios.get(`${API}/api/users`, {
      headers: getAuthHeader()
    });
    return response.data;
  }
};

export default accessBundleService;
