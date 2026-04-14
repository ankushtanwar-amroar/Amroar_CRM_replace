/**
 * ModuleContext - Global context for module entitlements
 * 
 * Provides module state management with refresh capabilities.
 * Uses localStorage caching for instant resolution on direct navigation.
 */
import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import axios from 'axios';
import { MODULE_STATES, ALL_MODULES } from '../hooks/useModuleEntitlements';

// Re-export MODULE_STATES for consumers that import from ModuleContext
export { MODULE_STATES };

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const CACHE_KEY = 'module_states_cache';
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Create context
const ModuleContext = createContext(null);

/**
 * Read cached module states from localStorage
 */
function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Date.now() - parsed.ts > CACHE_TTL) {
      localStorage.removeItem(CACHE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Write module states to localStorage cache
 */
function writeCache(data) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ...data, ts: Date.now() }));
  } catch { /* quota exceeded — ignore */ }
}

/**
 * ModuleProvider - Wrap your app with this to enable module state management
 */
export const ModuleProvider = ({ children }) => {
  // Try to initialize from cache for instant rendering
  const cached = useRef(readCache());

  const [moduleStates, setModuleStates] = useState(cached.current?.moduleStates || {});
  const [planModules, setPlanModules] = useState(cached.current?.planModules || []);
  const [enabledModules, setEnabledModules] = useState(cached.current?.enabledModules || []);
  const [tenantPlan, setTenantPlan] = useState(cached.current?.tenantPlan || null);
  const [defaultLandingPage, setDefaultLandingPage] = useState(cached.current?.defaultLandingPage || '/crm-platform');
  // If we have cache, start with loading=false so pages render immediately
  const [loading, setLoading] = useState(!cached.current);
  const [error, setError] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(Date.now());
  
  // Track if we're currently fetching
  const isFetching = useRef(false);

  /**
   * Fetch module states from API
   */
  const fetchModuleStates = useCallback(async (force = false) => {
    // Prevent duplicate fetches
    if (isFetching.current && !force) {
      return;
    }
    
    isFetching.current = true;
    // Only show loading if no cached data exists
    if (!cached.current) {
      setLoading(true);
    }
    
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        // Not authenticated - show all modules with default state
        const states = {};
        Object.keys(ALL_MODULES).forEach(code => {
          const isCore = ALL_MODULES[code].isCore;
          states[code] = isCore 
            ? { state: MODULE_STATES.ACTIVE, reason: null }
            : { state: MODULE_STATES.PLAN_LOCKED, reason: 'Not authenticated' };
        });
        setModuleStates(states);
        setLoading(false);
        isFetching.current = false;
        return;
      }

      // Fetch with cache-busting to ensure fresh data
      const timestamp = Date.now();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      
      try {
        const entitlementsRes = await axios.get(
          `${BACKEND_URL}/api/runtime/modules/states?_t=${timestamp}`, 
          {
            headers: { 
              Authorization: `Bearer ${token}`,
              'Cache-Control': 'no-cache'
            },
            signal: controller.signal
          }
        );
        clearTimeout(timeout);
        
        const data = entitlementsRes.data;
        const states = data.module_states || {};
        
        setModuleStates(states);
        setPlanModules(data.plan_modules || []);
        setEnabledModules(data.enabled_modules || []);
        setTenantPlan(data.plan || null);
        setDefaultLandingPage(data.default_landing_page || '/crm-platform');
        setLastRefresh(Date.now());
        setError(null);

        // Persist to cache for next page load
        writeCache({
          moduleStates: states,
          planModules: data.plan_modules || [],
          enabledModules: data.enabled_modules || [],
          tenantPlan: data.plan || null,
          defaultLandingPage: data.default_landing_page || '/crm-platform',
        });
        
      } catch (fetchErr) {
        clearTimeout(timeout);
        console.error('[ModuleContext] API error:', fetchErr.message);
        
        // Fallback: Use legacy endpoint
        try {
          const legacyRes = await axios.get(`${BACKEND_URL}/api/runtime/modules/enabled`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          const enabledMods = legacyRes.data.modules || [];
          
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
        } catch {
          // Final fallback: if no cache, show all modules as active (fail-open)
          if (!cached.current) {
            const states = {};
            Object.keys(ALL_MODULES).forEach(code => {
              states[code] = { state: MODULE_STATES.ACTIVE, reason: null };
            });
            setModuleStates(states);
          }
        }
      }
    } catch (err) {
      console.error('Failed to fetch module states:', err);
      if (!cached.current) {
        const states = {};
        Object.keys(ALL_MODULES).forEach(code => {
          states[code] = { state: MODULE_STATES.ACTIVE, reason: null };
        });
        setModuleStates(states);
      }
      setError(err.message);
    } finally {
      setLoading(false);
      isFetching.current = false;
    }
  }, []);

  // Initial fetch on mount
  useEffect(() => {
    fetchModuleStates();
  }, [fetchModuleStates]);

  // Re-fetch when auth token changes (e.g., after login or logout)
  // Polls localStorage to detect token appearance/removal
  const lastTokenRef = useRef(localStorage.getItem('token'));
  useEffect(() => {
    const interval = setInterval(() => {
      const currentToken = localStorage.getItem('token');
      if (currentToken !== lastTokenRef.current) {
        lastTokenRef.current = currentToken;
        if (currentToken) {
          // User just logged in — immediately clear ALL stale state and re-fetch
          cached.current = null;
          localStorage.removeItem(CACHE_KEY);
          setModuleStates({});
          setPlanModules([]);
          setEnabledModules([]);
          setTenantPlan(null);
          setDefaultLandingPage('/crm-platform');
          setLoading(true);
          fetchModuleStates(true);
        } else {
          // User logged out — clear all state
          cached.current = null;
          localStorage.removeItem(CACHE_KEY);
          setModuleStates({});
          setPlanModules([]);
          setEnabledModules([]);
          setTenantPlan(null);
          setDefaultLandingPage('/crm-platform');
          setLoading(false);
        }
      }
    }, 300);
    return () => clearInterval(interval);
  }, [fetchModuleStates]);

  /**
   * Force refresh module states - call this after plan changes or login
   * Immediately clears in-memory state to prevent stale data rendering
   */
  const refreshModuleStates = useCallback(() => {
    cached.current = null; // Invalidate cache
    localStorage.removeItem(CACHE_KEY);
    // Update lastTokenRef to prevent interval from double-triggering
    lastTokenRef.current = localStorage.getItem('token');
    // Immediately clear stale in-memory state to prevent flicker
    setModuleStates({});
    setPlanModules([]);
    setEnabledModules([]);
    setTenantPlan(null);
    setDefaultLandingPage('/crm-platform');
    setLoading(true);
    return fetchModuleStates(true);
  }, [fetchModuleStates]);

  /**
   * Get the state of a specific module
   */
  const getModuleState = useCallback((moduleCode) => {
    // If still loading AND no data at all, return LOADING
    if (loading && Object.keys(moduleStates).length === 0) {
      return { state: MODULE_STATES.LOADING, reason: null };
    }
    return moduleStates[moduleCode] || { state: MODULE_STATES.PLAN_LOCKED, reason: 'Unknown module' };
  }, [moduleStates, loading]);

  /**
   * Check if a module is enabled (ACTIVE state)
   */
  const isModuleEnabled = useCallback((moduleCode) => {
    const { state } = getModuleState(moduleCode);
    return state === MODULE_STATES.ACTIVE || state === MODULE_STATES.LOADING;
  }, [getModuleState]);

  /**
   * Check if a module is accessible (can be clicked)
   */
  const isModuleAccessible = useCallback((moduleCode) => {
    const { state } = getModuleState(moduleCode);
    return state === MODULE_STATES.ACTIVE;
  }, [getModuleState]);

  /**
   * Get all modules with their states for UI rendering
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
   */
  const getModulesByCategory = useCallback((category) => {
    return getAllModulesWithState().filter(m => m.category === category);
  }, [getAllModulesWithState]);

  /**
   * Legacy compatibility - check if path is enabled
   */
  const isPathEnabled = useCallback(() => true, []);

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

  const value = {
    // Core state
    moduleStates,
    tenantPlan,
    planModules,
    enabledModules,
    defaultLandingPage,
    loading,
    error,
    lastRefresh,
    
    // Methods
    refreshModuleStates,
    refetch: refreshModuleStates,
    getModuleState,
    isModuleEnabled,
    isModuleAccessible,
    getAllModulesWithState,
    getModulesByCategory,
    isPathEnabled,
    getFeatureAccessStatus
  };

  return (
    <ModuleContext.Provider value={value}>
      {children}
    </ModuleContext.Provider>
  );
};

/**
 * Hook to access module context
 */
export const useModuleContext = () => {
  const context = useContext(ModuleContext);
  if (!context) {
    throw new Error('useModuleContext must be used within a ModuleProvider');
  }
  return context;
};

/**
 * Hook with fallback for components that might be outside the provider
 * Returns the same API as useModuleEntitlements for backwards compatibility
 */
export const useModuleEntitlementsContext = () => {
  const context = useContext(ModuleContext);
  
  // If not in provider, return a basic fallback
  if (!context) {
    console.warn('[useModuleEntitlementsContext] Used outside ModuleProvider - using fallback');
    return {
      moduleStates: {},
      tenantPlan: null,
      planModules: [],
      enabledModules: [],
      defaultLandingPage: '/crm-platform',
      loading: true,
      error: null,
      lastRefresh: Date.now(),
      refreshModuleStates: () => Promise.resolve(),
      refetch: () => Promise.resolve(),
      getModuleState: () => ({ state: MODULE_STATES.LOADING, reason: null }),
      isModuleEnabled: () => true,
      isModuleAccessible: () => false,
      getAllModulesWithState: () => [],
      getModulesByCategory: () => [],
      isPathEnabled: () => true,
      getFeatureAccessStatus: () => ({ allowed: false, reason: 'Loading' })
    };
  }
  
  return context;
};

export default ModuleContext;
