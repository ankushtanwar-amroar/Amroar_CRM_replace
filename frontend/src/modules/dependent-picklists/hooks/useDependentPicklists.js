/**
 * useDependentPicklists Hook
 * Hook for managing dependent picklist configurations (admin side)
 * Updated: Dependencies are now GLOBAL (object-level), not per record type
 */
import { useState, useEffect, useCallback } from 'react';
import dependentPicklistService from '../services/dependentPicklistService';

export const useDependentPicklists = (objectName) => {
  // Note: recordTypeId is no longer needed - dependencies are global
  const [configs, setConfigs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  // Load configurations (GLOBAL for object)
  const loadConfigs = useCallback(async () => {
    if (!objectName) return;

    setLoading(true);
    setError(null);

    try {
      const data = await dependentPicklistService.getConfigsForObject(
        objectName,
        false // Get all including inactive
      );
      setConfigs(data);
    } catch (err) {
      console.error('Failed to load dependent picklist configs:', err);
      setError(err.response?.data?.detail || 'Failed to load configurations');
    } finally {
      setLoading(false);
    }
  }, [objectName]);

  // Initial load
  useEffect(() => {
    loadConfigs();
  }, [loadConfigs]);

  // Create new configuration (GLOBAL for object)
  const createConfig = async (data) => {
    setSaving(true);
    setError(null);

    try {
      const newConfig = await dependentPicklistService.createConfig(
        objectName,
        data
      );
      setConfigs(prev => [...prev, newConfig]);
      return newConfig;
    } catch (err) {
      const errorMsg = err.response?.data?.detail || 'Failed to create configuration';
      setError(errorMsg);
      throw new Error(errorMsg);
    } finally {
      setSaving(false);
    }
  };

  // Update configuration
  const updateConfig = async (configId, data) => {
    setSaving(true);
    setError(null);

    try {
      const updatedConfig = await dependentPicklistService.updateConfig(objectName, configId, data);
      setConfigs(prev => prev.map(c => c.id === configId ? updatedConfig : c));
      return updatedConfig;
    } catch (err) {
      const errorMsg = err.response?.data?.detail || 'Failed to update configuration';
      setError(errorMsg);
      throw new Error(errorMsg);
    } finally {
      setSaving(false);
    }
  };

  // Delete configuration
  const deleteConfig = async (configId) => {
    setSaving(true);
    setError(null);

    try {
      await dependentPicklistService.deleteConfig(objectName, configId);
      setConfigs(prev => prev.filter(c => c.id !== configId));
    } catch (err) {
      const errorMsg = err.response?.data?.detail || 'Failed to delete configuration';
      setError(errorMsg);
      throw new Error(errorMsg);
    } finally {
      setSaving(false);
    }
  };

  // Toggle active status
  const toggleActive = async (configId, isActive) => {
    return updateConfig(configId, { is_active: isActive });
  };

  return {
    configs,
    loading,
    saving,
    error,
    loadConfigs,
    createConfig,
    updateConfig,
    deleteConfig,
    toggleActive
  };
};

export default useDependentPicklists;
