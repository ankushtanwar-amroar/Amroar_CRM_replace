/**
 * Use Sharing Settings Hook
 * Manages OWD settings state
 */
import { useState, useEffect } from 'react';
import sharingService from '../services/sharingService';

export const useSharingSettings = () => {
  const [settings, setSettings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await sharingService.getSharingSettings();
      setSettings(data);
    } catch (err) {
      setError(err.message);
      console.error('Error fetching sharing settings:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const updateOWD = async (objectName, newSettings) => {
    try {
      await sharingService.updateOWD(objectName, newSettings);
      await fetchSettings(); // Refresh
      return true;
    } catch (err) {
      console.error('Error updating OWD:', err);
      throw err;
    }
  };

  return {
    settings,
    loading,
    error,
    updateOWD,
    refresh: fetchSettings
  };
};

export default useSharingSettings;