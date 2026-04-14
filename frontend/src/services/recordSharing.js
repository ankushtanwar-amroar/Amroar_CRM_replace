/**
 * Record Sharing Service
 * Frontend service for managing manual record shares
 */
import axios from 'axios';

const API = process.env.REACT_APP_BACKEND_URL;

/**
 * Get all shares for a specific record
 */
export const getRecordShares = async (objectName, recordId, includeExpired = false) => {
  const token = localStorage.getItem('token');
  const response = await axios.get(
    `${API}/api/objects/${objectName}/records/${recordId}/shares`,
    {
      headers: { Authorization: `Bearer ${token}` },
      params: { include_expired: includeExpired }
    }
  );
  return response.data;
};

/**
 * Share a record with a user, group, or role
 */
export const shareRecord = async (objectName, recordId, shareData) => {
  const token = localStorage.getItem('token');
  const response = await axios.post(
    `${API}/api/objects/${objectName}/records/${recordId}/share`,
    shareData,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return response.data;
};

/**
 * Revoke a share
 */
export const revokeShare = async (objectName, recordId, shareId) => {
  const token = localStorage.getItem('token');
  const response = await axios.delete(
    `${API}/api/objects/${objectName}/records/${recordId}/share/${shareId}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return response.data;
};

/**
 * Bulk share multiple records
 */
export const bulkShareRecords = async (objectName, bulkShareData) => {
  const token = localStorage.getItem('token');
  const response = await axios.post(
    `${API}/api/objects/${objectName}/records/bulk-share`,
    bulkShareData,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return response.data;
};

/**
 * Get records shared with the current user
 */
export const getRecordsSharedWithMe = async (objectName = null) => {
  const token = localStorage.getItem('token');
  const response = await axios.get(
    `${API}/api/users/me/shared-with-me`,
    {
      headers: { Authorization: `Bearer ${token}` },
      params: objectName ? { object_name: objectName } : {}
    }
  );
  return response.data;
};

/**
 * Fetch users for sharing dropdown
 */
export const getShareableUsers = async () => {
  const token = localStorage.getItem('token');
  const response = await axios.get(
    `${API}/api/users`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return response.data;
};

/**
 * Fetch groups for sharing dropdown
 */
export const getShareableGroups = async () => {
  const token = localStorage.getItem('token');
  const response = await axios.get(
    `${API}/api/groups`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return response.data;
};

/**
 * Fetch roles for sharing dropdown
 */
export const getShareableRoles = async () => {
  const token = localStorage.getItem('token');
  const response = await axios.get(
    `${API}/api/roles`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return response.data;
};

export default {
  getRecordShares,
  shareRecord,
  revokeShare,
  bulkShareRecords,
  getRecordsSharedWithMe,
  getShareableUsers,
  getShareableGroups,
  getShareableRoles
};
