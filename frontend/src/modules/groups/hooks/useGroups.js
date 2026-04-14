/**
 * Use Groups Hook
 * Manages groups state
 */
import { useState, useEffect, useCallback } from 'react';
import groupService from '../services/groupService';

export const useGroups = (groupType = null) => {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchGroups = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await groupService.getAllGroups(groupType);
      setGroups(data);
    } catch (err) {
      setError(err.message);
      console.error('Error fetching groups:', err);
    } finally {
      setLoading(false);
    }
  }, [groupType]);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  return {
    groups,
    loading,
    error,
    refresh: fetchGroups
  };
};

export default useGroups;
