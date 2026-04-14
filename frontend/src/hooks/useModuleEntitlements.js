/**
 * useModuleEntitlements Hook - V3
 * 
 * REDESIGNED: Now returns ALL modules with their status, not just enabled ones.
 * 
 * Module State Model:
 * - ACTIVE: Module is enabled and usable
 * - PLAN_LOCKED: Module not included in current subscription plan
 * - ADMIN_DISABLED: Tenant admin has disabled the module
 * - LICENSE_REQUIRED: Module requires a seat/license the user doesn't have
 * 
 * UI should NEVER hide modules - only show them with appropriate badges.
 */
import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

/**
 * Module State Constants
 */
export const MODULE_STATES = {
  ACTIVE: 'ACTIVE',
  PLAN_LOCKED: 'PLAN_LOCKED',
  ADMIN_DISABLED: 'ADMIN_DISABLED',
  LICENSE_REQUIRED: 'LICENSE_REQUIRED',
  LOADING: 'LOADING'
};

/**
 * All available platform modules with their metadata
 */
export const ALL_MODULES = {
  // Core modules (always active)
  'crm': { 
    name: 'CRM', 
    category: 'core', 
    path: '/records',
    icon: 'users',
    isCore: true,
    description: 'Customer relationship management'
  },
  'sales_console': { 
    name: 'Sales Console', 
    category: 'core', 
    path: '/sales-console',
    icon: 'trending-up',
    isCore: true,
    description: 'Sales pipeline and analytics'
  },
  
  // Admin modules
  'schema_builder': { 
    name: 'Schema Builder', 
    category: 'admin', 
    path: '/setup/schema-builder',
    icon: 'database',
    description: 'Create custom objects and fields'
  },
  'app_manager': { 
    name: 'App Manager', 
    category: 'admin', 
    path: '/setup/app-manager',
    icon: 'layout-grid',
    description: 'Customize home page and navigation'
  },
  
  // Automation modules
  'form_builder': { 
    name: 'Form Builder', 
    category: 'automation', 
    path: '/form-builder',
    icon: 'file-text',
    description: 'Create web forms and capture leads'
  },
  'flow_builder': { 
    name: 'Flow Builder', 
    category: 'automation', 
    path: '/flows',
    icon: 'git-branch',
    isPremium: false,
    description: 'Automate business processes'
  },
  'task_manager': { 
    name: 'Task Manager', 
    category: 'productivity', 
    path: '/task-manager',
    icon: 'check-square',
    description: 'Manage tasks and workflows'
  },
  
  // Data modules
  'import_builder': { 
    name: 'Import Builder', 
    category: 'data', 
    path: '/setup/import-builder',
    icon: 'upload',
    description: 'Import data from files'
  },
  'export_builder': { 
    name: 'Export Builder', 
    category: 'data', 
    path: '/setup/export-builder',
    icon: 'download',
    description: 'Export data to files'
  },
  'file_manager': { 
    name: 'File Manager', 
    category: 'data', 
    path: '/setup/file-manager',
    icon: 'folder',
    description: 'Manage uploaded files'
  },
  
  // Engagement modules
  'survey_builder': { 
    name: 'Survey Builder', 
    category: 'engagement', 
    path: '/survey-builder-v2',
    icon: 'clipboard-list',
    isPremium: true,
    description: 'Create surveys and collect feedback'
  },
  'email_templates': { 
    name: 'Email Templates', 
    category: 'engagement', 
    path: '/setup/email-templates',
    icon: 'mail',
    description: 'Design email templates'
  },
  'booking': { 
    name: 'Booking', 
    category: 'engagement', 
    path: '/booking',
    icon: 'calendar',
    isPremium: true,
    description: 'Schedule appointments and meetings'
  },
  
  // Advanced modules
  'chatbot_manager': { 
    name: 'Chatbot Manager', 
    category: 'ai', 
    path: '/setup/chatbot-manager',
    icon: 'message-circle',
    isPremium: true,
    description: 'Configure AI chatbots'
  },
  'docflow': { 
    name: 'DocFlow', 
    category: 'advanced', 
    path: '/setup/docflow',
    icon: 'file-check',
    isPremium: true,
    description: 'Document generation and signing'
  },
  'ai_features': { 
    name: 'AI Features', 
    category: 'ai', 
    path: '/setup/ai-features',
    icon: 'sparkles',
    isPremium: true,
    description: 'AI-powered insights and automation'
  },
  'field_service': { 
    name: 'Field Service', 
    category: 'advanced', 
    path: '/field-service',
    icon: 'map-pin',
    isPremium: true,
    description: 'Field service management'
  },
  'reporting': { 
    name: 'Advanced Reporting', 
    category: 'analytics', 
    path: '/reports',
    icon: 'bar-chart',
    isPremium: true,
    description: 'Advanced analytics and dashboards'
  },
  'features': { 
    name: 'Features', 
    category: 'config', 
    path: '/setup/features',
    icon: 'sparkles',
    isCore: true,
    description: 'Configure platform features'
  },
  'connections': { 
    name: 'Connections', 
    category: 'config', 
    path: '/setup/connections',
    icon: 'key',
    isCore: true,
    description: 'External service integrations'
  }
};

/**
 * Hook to get module entitlements with full status information
 */
const useModuleEntitlements = () => {
  const [moduleStates, setModuleStates] = useState({});
  const [planModules, setPlanModules] = useState([]);
  const [enabledModules, setEnabledModules] = useState([]);
  const [tenantPlan, setTenantPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchModuleStates = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        // Not authenticated - show all modules with default state based on plan
        const states = {};
        Object.keys(ALL_MODULES).forEach(code => {
          const isCore = ALL_MODULES[code].isCore;
          states[code] = isCore 
            ? { state: MODULE_STATES.ACTIVE, reason: null }
            : { state: MODULE_STATES.PLAN_LOCKED, reason: 'Not authenticated' };
        });
        setModuleStates(states);
        setLoading(false);
        return;
      }

      // Fetch module states from the API with timeout
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000); // 10 second timeout
      
      try {
        const entitlementsRes = await axios.get(`${BACKEND_URL}/api/runtime/modules/states`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal
        });
        clearTimeout(timeout);
        
        const data = entitlementsRes.data;
        const states = data.module_states || {};
        setModuleStates(states);
        setPlanModules(data.plan_modules || []);
        setEnabledModules(data.enabled_modules || []);
        setTenantPlan(data.plan || null);
        setError(null);
      } catch (fetchErr) {
        clearTimeout(timeout);
        console.error('[useModuleEntitlements] API error:', fetchErr.message);
        
        // Fallback: Use legacy endpoint
        try {
          const legacyRes = await axios.get(`${BACKEND_URL}/api/runtime/modules/enabled`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          const enabledMods = legacyRes.data.modules || [];
          
          // Build states from enabled modules list
          const states = {};
          Object.keys(ALL_MODULES).forEach(code => {
            const isCore = ALL_MODULES[code].isCore;
            const isEnabled = enabledMods.includes(code);
            
            if (isCore || isEnabled) {
              states[code] = { state: MODULE_STATES.ACTIVE, reason: null };
            } else {
              states[code] = { 
                state: MODULE_STATES.PLAN_LOCKED, 
                reason: 'Not included in your current plan' 
              };
            }
          });
          
          setModuleStates(states);
          setEnabledModules(enabledMods);
        } catch (legacyErr) {
          // Final fallback: show all modules as active (fail-open)
          const states = {};
          Object.keys(ALL_MODULES).forEach(code => {
            states[code] = { state: MODULE_STATES.ACTIVE, reason: null };
          });
          setModuleStates(states);
        }
      }
    } catch (err) {
      console.error('Failed to fetch module states:', err);
      // On error, show all as active (fail-open for UX)
      const states = {};
      Object.keys(ALL_MODULES).forEach(code => {
        states[code] = { state: MODULE_STATES.ACTIVE, reason: null };
      });
      setModuleStates(states);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchModuleStates();
  }, [fetchModuleStates]);

  /**
   * Get the state of a specific module
   * @param {string} moduleCode - Module code
   * @returns {{ state: string, reason: string | null }}
   */
  const getModuleState = useCallback((moduleCode) => {
    if (loading) {
      return { state: MODULE_STATES.LOADING, reason: null };
    }
    return moduleStates[moduleCode] || { state: MODULE_STATES.PLAN_LOCKED, reason: 'Unknown module' };
  }, [moduleStates, loading]);

  /**
   * Check if a module is enabled (ACTIVE state)
   * @param {string} moduleCode - Module code
   * @returns {boolean}
   */
  const isModuleEnabled = useCallback((moduleCode) => {
    const { state } = getModuleState(moduleCode);
    return state === MODULE_STATES.ACTIVE || state === MODULE_STATES.LOADING;
  }, [getModuleState]);

  /**
   * Check if a module is accessible (can be clicked)
   * @param {string} moduleCode - Module code
   * @returns {boolean}
   */
  const isModuleAccessible = useCallback((moduleCode) => {
    const { state } = getModuleState(moduleCode);
    return state === MODULE_STATES.ACTIVE;
  }, [getModuleState]);

  /**
   * Get all modules with their states for UI rendering
   * @returns {Array<{ code: string, ...moduleInfo, state: string, reason: string }>}
   */
  const getAllModulesWithState = useCallback(() => {
    return Object.entries(ALL_MODULES).map(([code, info]) => ({
      code,
      ...info,
      ...getModuleState(code)
    }));
  }, [getModuleState]);

  /**
   * Get modules by category with states
   * @param {string} category - Module category
   * @returns {Array}
   */
  const getModulesByCategory = useCallback((category) => {
    return getAllModulesWithState().filter(m => m.category === category);
  }, [getAllModulesWithState]);

  /**
   * Legacy compatibility - check if path is enabled
   * Now returns true for ALL paths (modules are shown, just with badges)
   */
  const isPathEnabled = useCallback((path) => {
    // Always return true - modules are always visible now
    return true;
  }, []);

  /**
   * Get feature access status for license checks
   */
  const getFeatureAccessStatus = useCallback((moduleCode) => {
    const { state, reason } = getModuleState(moduleCode);
    return {
      allowed: state === MODULE_STATES.ACTIVE,
      reason: reason
    };
  }, [getModuleState]);

  return {
    // New V3 API
    moduleStates,
    getModuleState,
    isModuleAccessible,
    getAllModulesWithState,
    getModulesByCategory,
    tenantPlan,
    planModules,
    
    // Legacy compatibility
    enabledModules,
    loading,
    error,
    isModuleEnabled,
    isPathEnabled,
    getFeatureAccessStatus,
    refetch: fetchModuleStates
  };
};

export default useModuleEntitlements;
export { ALL_MODULES as MODULE_MAPPING };
