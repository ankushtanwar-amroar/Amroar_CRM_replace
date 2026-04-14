/**
 * Use Record Sharing Hook
 * Manages record-level sharing state
 */
import { useState, useEffect } from 'react';
import sharingService from '../services/sharingService';

export const useRecordSharing = (objectName, recordId) => {
  const [shares, setShares] = useState([]);
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);

  const fetchShares = async () => {
    if (!objectName || !recordId) return;
    
    try {
      setLoading(true);
      const data = await sharingService.getRecordShares(objectName, recordId);
      setShares(data);
    } catch (err) {
      console.error('Error fetching shares:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchUsersAndRoles = async () => {
    try {
      const [usersData, rolesData] = await Promise.all([
        sharingService.getUsers(),
        sharingService.getRoles()
      ]);
      setUsers(usersData);
      setRoles(rolesData);
    } catch (err) {
      console.error('Error fetching users/roles:', err);
    }
  };

  useEffect(() => {
    fetchShares();
    fetchUsersAndRoles();
  }, [objectName, recordId]);

  const shareRecord = async (shareData) => {
    try {
      await sharingService.shareRecord(objectName, recordId, shareData);
      await fetchShares(); // Refresh
      return true;
    } catch (err) {
      console.error('Error sharing record:', err);
      throw err;
    }
  };

  const revokeShare = async (shareId) => {
    try {
      await sharingService.revokeShare(objectName, recordId, shareId);
      await fetchShares(); // Refresh
      return true;
    } catch (err) {
      console.error('Error revoking share:', err);
      throw err;
    }
  };

  return {
    shares,
    users,
    roles,
    loading,
    shareRecord,
    revokeShare,
    refresh: fetchShares
  };
};

export default useRecordSharing;