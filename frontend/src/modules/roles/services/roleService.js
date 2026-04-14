/**
 * Role Service
 * Handles all API calls for role hierarchy
 */
import axios from 'axios';

const API = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';

const getAuthHeader = () => {
  const token = localStorage.getItem('token');
  return { Authorization: `Bearer ${token}` };
};

export const roleService = {
  /**
   * Get all roles
   */
  async getAllRoles() {
    const response = await axios.get(`${API}/api/roles`, {
      headers: getAuthHeader()
    });
    return response.data;
  },

  /**
   * Get role hierarchy tree
   */
  async getRoleHierarchy() {
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
   * Create new role
   */
  async createRole(roleData) {
    const response = await axios.post(`${API}/api/roles`, roleData, {
      headers: getAuthHeader()
    });
    return response.data;
  },

  /**
   * Update role
   */
  async updateRole(roleId, roleData) {
    const response = await axios.put(`${API}/api/roles/${roleId}`, roleData, {
      headers: getAuthHeader()
    });
    return response.data;
  },

  /**
   * Delete role
   */
  async deleteRole(roleId) {
    const response = await axios.delete(`${API}/api/roles/${roleId}`, {
      headers: getAuthHeader()
    });
    return response.data;
  },

  /**
   * Get users in a role
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
    const response = await axios.post(
      `${API}/api/roles/${roleId}/users/${userId}`,
      {},
      { headers: getAuthHeader() }
    );
    return response.data;
  },

  /**
   * Remove user from role
   */
  async removeUserFromRole(roleId, userId) {
    const response = await axios.delete(
      `${API}/api/roles/${roleId}/users/${userId}`,
      { headers: getAuthHeader() }
    );
    return response.data;
  },

  /**
   * Get all users
   */
  async getUsers() {
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

export default roleService;
