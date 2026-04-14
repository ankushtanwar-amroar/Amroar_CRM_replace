/**
 * Security Center - Permission Set Service
 * Handles all API calls for permission sets
 */
import axios from 'axios';

const API = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';

const getAuthHeader = () => {
  const token = localStorage.getItem('token');
  return { Authorization: `Bearer ${token}` };
};

export const permissionSetService = {
  /**
   * Get all permission sets
   */
  async getAll() {
    const response = await axios.get(`${API}/api/permission-sets`, {
      headers: getAuthHeader()
    });
    const data = response.data;
    return Array.isArray(data) ? data : (data.permission_sets || []);
  },

  /**
   * Get permission set by ID
   */
  async getByRoleId(permissionSetId) {
    const response = await axios.get(`${API}/api/permission-sets/${permissionSetId}`, {
      headers: getAuthHeader()
    });
    return response.data;
  },

  /**
   * Get all roles
   */
  async getRoles() {
    const response = await axios.get(`${API}/api/roles`, {
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
  },

  /**
   * Assign role to user (role contains permission set)
   */
  async assignRoleToUser(userId, roleId) {
    const response = await axios.put(
      `${API}/api/users/${userId}/role`,
      { role_id: roleId },
      { headers: getAuthHeader() }
    );
    return response.data;
  }
};

export default permissionSetService;
