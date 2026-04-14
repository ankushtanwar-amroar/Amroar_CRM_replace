/**
 * Field Permission Service
 * Handles field-level security APIs
 */
import axios from 'axios';

const API = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';

const getAuthHeader = () => {
  const token = localStorage.getItem('token');
  return { Authorization: `Bearer ${token}` };
};

export const fieldPermissionService = {
  /**
   * Get permission set (includes field permissions)
   */
  async getPermissionSet(roleId) {
    const response = await axios.get(`${API}/api/permission-sets/${roleId}`, {
      headers: getAuthHeader()
    });
    return response.data;
  },

  /**
   * Get object metadata (to get field list)
   */
  async getObjectFields(objectName) {
    const response = await axios.get(`${API}/api/objects/${objectName}`, {
      headers: getAuthHeader()
    });
    return response.data;
  },

  /**
   * Update permission set (including field permissions)
   * Note: Full update approach - send entire permission set back
   */
  async updatePermissionSet(permissionSetId, updatedData) {
    // For now, this would need a PUT endpoint that doesn't exist yet
    // We can store it client-side or add the endpoint
    throw new Error('Permission set update endpoint not implemented yet');
  }
};

export default fieldPermissionService;
