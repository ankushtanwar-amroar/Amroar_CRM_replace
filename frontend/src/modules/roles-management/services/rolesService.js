/**
 * Roles Service
 * API calls for role management
 */
import axios from 'axios';

const API = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';

const getAuthHeader = () => {
  const token = localStorage.getItem('token');
  return { Authorization: `Bearer ${token}` };
};

const rolesService = {
  /**
   * Get all roles as flat list
   */
  async listRoles() {
    const response = await axios.get(`${API}/api/roles`, {
      headers: getAuthHeader()
    });
    return response.data;
  },

  /**
   * Get roles as hierarchical tree
   */
  async getHierarchy() {
    const response = await axios.get(`${API}/api/roles/hierarchy`, {
      headers: getAuthHeader()
    });
    return response.data;
  },

  /**
   * Get single role by ID
   */
  async getRole(roleId) {
    const response = await axios.get(`${API}/api/roles/${roleId}`, {
      headers: getAuthHeader()
    });
    return response.data;
  },

  /**
   * Create a new role
   */
  async createRole(roleData) {
    const response = await axios.post(`${API}/api/roles`, roleData, {
      headers: getAuthHeader()
    });
    return response.data;
  },

  /**
   * Update an existing role
   */
  async updateRole(roleId, roleData) {
    const response = await axios.put(`${API}/api/roles/${roleId}`, roleData, {
      headers: getAuthHeader()
    });
    return response.data;
  },

  /**
   * Delete a role
   */
  async deleteRole(roleId) {
    const response = await axios.delete(`${API}/api/roles/${roleId}`, {
      headers: getAuthHeader()
    });
    return response.data;
  },

  /**
   * Get users assigned to a role
   */
  async getRoleUsers(roleId) {
    const response = await axios.get(`${API}/api/roles/${roleId}/users`, {
      headers: getAuthHeader()
    });
    return response.data;
  },

  /**
   * Assign user to role
   */
  async assignUserToRole(roleId, userId) {
    const response = await axios.post(`${API}/api/roles/${roleId}/users/${userId}`, {}, {
      headers: getAuthHeader()
    });
    return response.data;
  },

  /**
   * Remove user from role
   */
  async removeUserFromRole(roleId, userId) {
    const response = await axios.delete(`${API}/api/roles/${roleId}/users/${userId}`, {
      headers: getAuthHeader()
    });
    return response.data;
  },

  /**
   * Get subordinate roles
   */
  async getSubordinates(roleId) {
    const response = await axios.get(`${API}/api/roles/${roleId}/subordinates`, {
      headers: getAuthHeader()
    });
    return response.data;
  },

  /**
   * Get all users (for assignment)
   */
  async getAllUsers() {
    const response = await axios.get(`${API}/api/users`, {
      headers: getAuthHeader()
    });
    return response.data;
  },

  /**
   * Get permission sets
   */
  async getPermissionSets() {
    const response = await axios.get(`${API}/api/permission-sets`, {
      headers: getAuthHeader()
    });
    return response.data;
  }
};

export default rolesService;
