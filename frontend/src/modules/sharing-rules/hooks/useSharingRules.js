/**
 * Use Sharing Rules Hook
 * Manages sharing rules state
 */
import { useState, useEffect, useCallback } from 'react';
import sharingRulesService from '../services/sharingRulesService';

export const useSharingRules = (filters = {}) => {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchRules = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await sharingRulesService.getAllRules(filters);
      setRules(data);
    } catch (err) {
      setError(err.message);
      console.error('Error fetching sharing rules:', err);
    } finally {
      setLoading(false);
    }
  }, [filters.object_name, filters.rule_type, filters.is_active]);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  return {
    rules,
    loading,
    error,
    refresh: fetchRules
  };
};

export default useSharingRules;
