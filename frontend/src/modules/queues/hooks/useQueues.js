/**
 * Use Queues Hook
 * Manages queues state
 */
import { useState, useEffect, useCallback } from 'react';
import queueService from '../services/queueService';

export const useQueues = () => {
  const [queues, setQueues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchQueues = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await queueService.getAllQueues();
      setQueues(data);
    } catch (err) {
      setError(err.message);
      console.error('Error fetching queues:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchQueues();
  }, [fetchQueues]);

  return {
    queues,
    loading,
    error,
    refresh: fetchQueues
  };
};

export default useQueues;
