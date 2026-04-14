/**
 * System Permissions Service
 * Frontend service for checking and managing system permissions
 */
import axios from 'axios';

const API = process.env.REACT_APP_BACKEND_URL;

/**
 * Get all system permission definitions
 */
export const getPermissionDefinitions = async () => {
  const token = localStorage.getItem('token');
  const response = await axios.get(`${API}/api/system-permissions/definitions`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return response.data;
};

/**
 * Get permission definitions grouped by category
 */
export const getPermissionsByCategory = async () => {
  const token = localStorage.getItem('token');
  const response = await axios.get(`${API}/api/system-permissions/definitions/by-category`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return response.data;
};

/**
 * Get mapping of UI sections to required permissions
 */
export const getSectionMapping = async () => {
  const token = localStorage.getItem('token');
  const response = await axios.get(`${API}/api/system-permissions/section-mapping`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return response.data;
};

/**
 * Check if current user has a specific permission
 * @param {string} permission - Permission key to check
 */
export const checkPermission = async (permission) => {
  const token = localStorage.getItem('token');
  const response = await axios.get(`${API}/api/system-permissions/check/${permission}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return response.data;
};

/**
 * Get all system permissions for the current user
 */
export const getMyPermissions = async () => {
  const token = localStorage.getItem('token');
  const response = await axios.get(`${API}/api/system-permissions/my-permissions`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return response.data;
};

/**
 * Check if current user can access a specific UI section
 * @param {string} section - Section key (e.g., 'users', 'roles', 'setup')
 */
export const checkSectionAccess = async (section) => {
  const token = localStorage.getItem('token');
  const response = await axios.get(`${API}/api/system-permissions/check-section/${section}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return response.data;
};

/**
 * Get system permissions for a specific user
 * @param {string} userId - User ID
 */
export const getUserPermissions = async (userId) => {
  const token = localStorage.getItem('token');
  const response = await axios.get(`${API}/api/system-permissions/user/${userId}/permissions`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return response.data;
};

// Export all functions
export default {
  getPermissionDefinitions,
  getPermissionsByCategory,
  getSectionMapping,
  checkPermission,
  getMyPermissions,
  checkSectionAccess,
  getUserPermissions
};
