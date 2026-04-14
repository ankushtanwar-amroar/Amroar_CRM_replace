/**
 * useAccessBundles Hook
 * Manages access bundle state and operations
 */
import { useState, useEffect, useCallback } from 'react';
import accessBundleService from '../services/accessBundleService';

export const useAccessBundles = () => {
  const [bundles, setBundles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchBundles = useCallback(async () => {
    try {
      setLoading(true);
      const data = await accessBundleService.getAll();
      setBundles(data);
      setError(null);
    } catch (err) {
      console.error('Error fetching access bundles:', err);
      setError(err.response?.data?.detail || 'Failed to load access bundles');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBundles();
  }, [fetchBundles]);

  return {
    bundles,
    loading,
    error,
    refetch: fetchBundles
  };
};

export const useAccessBundle = (bundleId) => {
  const [bundle, setBundle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchBundle = useCallback(async () => {
    if (!bundleId) return;
    
    try {
      setLoading(true);
      const data = await accessBundleService.getById(bundleId);
      setBundle(data);
      setError(null);
    } catch (err) {
      console.error('Error fetching access bundle:', err);
      setError(err.response?.data?.detail || 'Failed to load access bundle');
    } finally {
      setLoading(false);
    }
  }, [bundleId]);

  useEffect(() => {
    fetchBundle();
  }, [fetchBundle]);

  return {
    bundle,
    loading,
    error,
    refetch: fetchBundle
  };
};

export const usePermissionSets = () => {
  const [permissionSets, setPermissionSets] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPermissionSets = async () => {
      try {
        const data = await accessBundleService.getPermissionSets();
        setPermissionSets(data);
      } catch (err) {
        console.error('Error fetching permission sets:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchPermissionSets();
  }, []);

  return { permissionSets, loading };
};

export default useAccessBundles;
