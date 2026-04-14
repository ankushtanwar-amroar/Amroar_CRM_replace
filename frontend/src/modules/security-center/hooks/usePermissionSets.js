/**
 * Security Center - Permission Sets Hook
 * Custom hook for managing permission sets state
 */
import { useState, useEffect } from 'react';
import permissionSetService from '../services/permissionSetService';

export const usePermissionSets = () => {
  const [permissionSets, setPermissionSets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchPermissionSets = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await permissionSetService.getAll();
      setPermissionSets(data);
    } catch (err) {
      setError(err.message);
      console.error('Error fetching permission sets:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPermissionSets();
  }, []);

  return {
    permissionSets,
    loading,
    error,
    refresh: fetchPermissionSets
  };
};

export default usePermissionSets;
