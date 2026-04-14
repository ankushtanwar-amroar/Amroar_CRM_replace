/**
 * useFeatureAccess Hook - Runtime License Enforcement
 * 
 * Provides access to the Feature Access API for determining which
 * CRM modules/features a user can access based on:
 * 1. Tenant Version compatibility
 * 2. Tenant License (purchased seat pool)
 * 3. User License (assigned seat)
 * 4. User Permissions
 * 
 * Usage:
 * const { canAccess, getAccessStatus, modules, loading } = useFeatureAccess();
 * 
 * // Check if user can access flow builder
 * if (canAccess('flow_builder')) { ... }
 * 
 * // Get detailed status
 * const status = getAccessStatus('flow_builder');
 * if (!status.allowed) console.log(status.reason);
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

/**
 * Module metadata for UI display
 */
export const MODULE_METADATA = {
  flow_builder: {
    name: 'Flow Builder',
    description: 'Automation workflows and process builder',
    icon: 'Zap',
    path: '/flows',
    setupPath: '/setup/flow-builder'
  },
  form_builder: {
    name: 'Form Builder',
    description: 'Create custom forms and web-to-lead forms',
    icon: 'FileText',
    path: '/form-builder'
  },
  docflow: {
    name: 'DocFlow',
    description: 'Document generation and templates',
    icon: 'FileText',
    path: '/setup/docflow'
  },
  survey_builder: {
    name: 'Survey Builder',
    description: 'Create surveys and collect feedback',
    icon: 'ClipboardList',
    path: '/survey-builder-v2'
  },
  chatbot_manager: {
    name: 'Chatbot Manager',
    description: 'Build and manage AI chatbots',
    icon: 'MessageSquare',
    path: '/setup/chatbot-manager'
  },
  task_manager: {
    name: 'Task Manager',
    description: 'Task and activity management',
    icon: 'CheckSquare',
    path: '/task-manager'
  },
  schema_builder: {
    name: 'Schema Builder',
    description: 'Custom objects and fields',
    icon: 'Database',
    path: '/setup/schema-builder'
  },
  crm: {
    name: 'CRM Core',
    description: 'Core CRM functionality',
    icon: 'Users',
    path: '/crm'
  },
  file_manager: {
    name: 'File Manager',
    description: 'Document management system',
    icon: 'FolderOpen',
    path: '/files'
  },
  app_manager: {
    name: 'App Manager',
    description: 'Application configuration',
    icon: 'Layers',
    path: '/setup/app-manager'
  },
  import_builder: {
    name: 'Import Builder',
    description: 'Data import tools',
    icon: 'Upload',
    path: '/setup/import-builder'
  },
  export_builder: {
    name: 'Export Builder',
    description: 'Data export tools',
    icon: 'Download',
    path: '/setup/export-builder'
  }
};

/**
 * Hook for checking feature access based on licenses
 */
const useFeatureAccess = () => {
  const [modules, setModules] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastFetch, setLastFetch] = useState(null);

  /**
   * Fetch all module access statuses from API
   */
  const fetchModuleAccess = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        // Not authenticated - will be handled by auth flow
        setModules({});
        setLoading(false);
        return;
      }

      const response = await axios.get(`${BACKEND_URL}/api/feature-access/modules`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      setModules(response.data.modules || {});
      setError(null);
      setLastFetch(new Date());
    } catch (err) {
      console.error('Failed to fetch feature access:', err);
      // On error, allow all modules (better UX than blocking everything)
      // Backend will still enforce access on API calls
      const defaultModules = {};
      Object.keys(MODULE_METADATA).forEach(key => {
        defaultModules[key] = { allowed: true, reason: null };
      });
      setModules(defaultModules);
      setError(err.response?.data?.detail || err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchModuleAccess();
  }, [fetchModuleAccess]);

  /**
   * Check if user can access a specific module
   * @param {string} moduleKey - Module code (e.g., 'flow_builder')
   * @returns {boolean} - True if access is allowed
   */
  const canAccess = useCallback((moduleKey) => {
    // During loading, allow access (avoids flicker)
    if (loading) return true;
    
    // If module not in list, allow access
    if (!modules[moduleKey]) return true;
    
    return modules[moduleKey].allowed;
  }, [modules, loading]);

  /**
   * Get detailed access status for a module
   * @param {string} moduleKey - Module code
   * @returns {Object} - { allowed, reason, reason_code }
   */
  const getAccessStatus = useCallback((moduleKey) => {
    if (loading) {
      return { allowed: true, reason: null, reason_code: null, loading: true };
    }
    
    if (!modules[moduleKey]) {
      return { allowed: true, reason: null, reason_code: null };
    }
    
    return {
      ...modules[moduleKey],
      loading: false
    };
  }, [modules, loading]);

  /**
   * Check access for a module and throw if denied
   * Used for programmatic access checks before performing actions
   * @param {string} moduleKey - Module code
   * @throws {Error} - If access is denied
   */
  const requireAccess = useCallback((moduleKey) => {
    const status = getAccessStatus(moduleKey);
    if (!status.allowed) {
      const error = new Error(status.reason || `Access denied to ${moduleKey}`);
      error.code = status.reason_code;
      error.moduleKey = moduleKey;
      throw error;
    }
  }, [getAccessStatus]);

  /**
   * Get all accessible module keys
   * @returns {string[]} - Array of module keys the user can access
   */
  const accessibleModules = useMemo(() => {
    return Object.keys(modules).filter(key => modules[key]?.allowed);
  }, [modules]);

  /**
   * Get all modules with their access status
   * @returns {Array} - Array of { key, ...metadata, ...status }
   */
  const modulesWithStatus = useMemo(() => {
    return Object.keys(MODULE_METADATA).map(key => ({
      key,
      ...MODULE_METADATA[key],
      ...getAccessStatus(key)
    }));
  }, [getAccessStatus]);

  return {
    modules,
    loading,
    error,
    lastFetch,
    canAccess,
    getAccessStatus,
    requireAccess,
    accessibleModules,
    modulesWithStatus,
    refetch: fetchModuleAccess
  };
};

export default useFeatureAccess;

/**
 * Validate access via API call (for important actions)
 * This performs a server-side check with audit logging
 * @param {string} moduleKey - Module to check
 * @param {string} action - Optional action name
 * @returns {Promise<boolean>} - True if allowed
 */
export const validateFeatureAccess = async (moduleKey, action = null) => {
  try {
    const token = localStorage.getItem('token');
    if (!token) return false;

    const params = new URLSearchParams({ module_key: moduleKey });
    if (action) params.append('action', action);

    await axios.post(
      `${BACKEND_URL}/api/feature-access/validate-action?${params.toString()}`,
      {},
      { headers: { Authorization: `Bearer ${token}` } }
    );
    
    return true;
  } catch (err) {
    if (err.response?.status === 403) {
      // Access denied - log details for debugging
      console.warn('Feature access denied:', err.response?.data);
      return false;
    }
    // Network error or server error - allow to avoid blocking users
    console.error('Feature access validation error:', err);
    return true;
  }
};

/**
 * Get effective access summary for a user
 * @param {string} userId - Optional user ID (defaults to current user)
 * @returns {Promise<Object>} - Detailed access summary
 */
export const getEffectiveAccess = async (userId = null) => {
  try {
    const token = localStorage.getItem('token');
    if (!token) return null;

    const url = userId 
      ? `${BACKEND_URL}/api/feature-access/user/${userId}/effective-access`
      : `${BACKEND_URL}/api/feature-access/effective-access`;

    const response = await axios.get(url, {
      headers: { Authorization: `Bearer ${token}` }
    });

    return response.data;
  } catch (err) {
    console.error('Failed to fetch effective access:', err);
    return null;
  }
};
