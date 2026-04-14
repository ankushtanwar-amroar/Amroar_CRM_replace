/**
 * Sharing Service
 * Handles all API calls for sharing model
 */
import axios from 'axios';

const API = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';

const getAuthHeader = () => {
  const token = localStorage.getItem('token');
  return { Authorization: `Bearer ${token}` };
};

export const sharingService = {
  /**
   * Get all OWD settings
   */
  async getSharingSettings() {
    const response = await axios.get(`${API}/api/sharing-settings`, {
      headers: getAuthHeader()
    });
    return response.data;
  },

  /**
   * Update OWD for an object
   */
  async updateOWD(objectName, settings) {
    const response = await axios.put(
      `${API}/api/sharing-settings/${objectName}`,
      settings,
      { headers: getAuthHeader() }
    );
    return response.data;
  },

  /**
   * Share record with user/role
   */
  async shareRecord(objectName, recordId, shareData) {
    const response = await axios.post(
      `${API}/api/records/${objectName}/${recordId}/share`,
      shareData,
      { headers: getAuthHeader() }
    );
    return response.data;
  },

  /**
   * Get shares for a record
   */
  async getRecordShares(objectName, recordId) {
    const response = await axios.get(
      `${API}/api/records/${objectName}/${recordId}/shares`,
      { headers: getAuthHeader() }
    );
    return response.data;
  },

  /**
   * Revoke share
   */
  async revokeShare(objectName, recordId, shareId) {
    const response = await axios.delete(
      `${API}/api/records/${objectName}/${recordId}/share/${shareId}`,
      { headers: getAuthHeader() }
    );
    return response.data;
  },

  /**
   * Get all users (for sharing dialog)
   */
  async getUsers() {
    const response = await axios.get(`${API}/api/users`, {
      headers: getAuthHeader()
    });
    return response.data;
  },

  /**
   * Get all roles (for sharing dialog)
   */
  async getRoles() {
    const response = await axios.get(`${API}/api/roles`, {
      headers: getAuthHeader()
    });
    return response.data;
  }
};

export default sharingService;
