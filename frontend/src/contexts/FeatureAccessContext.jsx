/**
 * FeatureAccessContext - Global License Enforcement Provider
 * 
 * Provides centralized feature access state across the entire application.
 * Wraps the useFeatureAccess hook in a context for performance optimization.
 * 
 * Usage:
 * 1. Wrap app in <FeatureAccessProvider>
 * 2. Use useFeatureAccessContext() in components
 * 3. Use <FeatureGate module="flow_builder"> for conditional rendering
 */
import React, { createContext, useContext, useCallback, useState, useEffect, useMemo } from 'react';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

// Create context
const FeatureAccessContext = createContext(null);

/**
 * Feature Access Provider Component
 * Should wrap the main app to provide license enforcement globally
 */
export const FeatureAccessProvider = ({ children }) => {
  const [modules, setModules] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(!!localStorage.getItem('token'));

  // Fetch module access from API
  const fetchModuleAccess = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      setModules({});
      setLoading(false);
      setIsAuthenticated(false);
      return;
    }

    setIsAuthenticated(true);
    setLoading(true);

    try {
      const response = await axios.get(`${BACKEND_URL}/api/feature-access/modules`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      setModules(response.data.modules || {});
      setError(null);
    } catch (err) {
      console.error('Failed to fetch feature access:', err);
      // On error, allow all (backend will still enforce)
      setModules({});
      setError(err.response?.data?.detail || err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchModuleAccess();
  }, [fetchModuleAccess]);

  // Listen for auth changes
  useEffect(() => {
    const handleStorageChange = (e) => {
      if (e.key === 'token') {
        fetchModuleAccess();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [fetchModuleAccess]);

  /**
   * Check if user can access a module
   */
  const canAccess = useCallback((moduleKey) => {
    if (loading || !isAuthenticated) return true; // Allow during loading
    if (!modules[moduleKey]) return true; // Unknown modules allowed
    return modules[moduleKey].allowed;
  }, [modules, loading, isAuthenticated]);

  /**
   * Get detailed access status
   */
  const getAccessStatus = useCallback((moduleKey) => {
    if (loading) {
      return { allowed: true, loading: true, reason: null };
    }
    if (!modules[moduleKey]) {
      return { allowed: true, loading: false, reason: null };
    }
    return { ...modules[moduleKey], loading: false };
  }, [modules, loading]);

  /**
   * Check access for multiple modules at once
   */
  const checkMultiple = useCallback((moduleKeys) => {
    return moduleKeys.reduce((acc, key) => {
      acc[key] = canAccess(key);
      return acc;
    }, {});
  }, [canAccess]);

  const value = useMemo(() => ({
    modules,
    loading,
    error,
    isAuthenticated,
    canAccess,
    getAccessStatus,
    checkMultiple,
    refetch: fetchModuleAccess
  }), [modules, loading, error, isAuthenticated, canAccess, getAccessStatus, checkMultiple, fetchModuleAccess]);

  return (
    <FeatureAccessContext.Provider value={value}>
      {children}
    </FeatureAccessContext.Provider>
  );
};

/**
 * Hook to access feature access context
 */
export const useFeatureAccessContext = () => {
  const context = useContext(FeatureAccessContext);
  if (!context) {
    // Return a default implementation if not wrapped in provider
    // This allows components to work without the provider during development
    return {
      modules: {},
      loading: false,
      error: null,
      isAuthenticated: true,
      canAccess: () => true,
      getAccessStatus: () => ({ allowed: true, loading: false }),
      checkMultiple: () => ({}),
      refetch: () => {}
    };
  }
  return context;
};

/**
 * Feature Gate Component
 * Conditionally renders children based on module access
 * 
 * Usage:
 * <FeatureGate module="flow_builder">
 *   <FlowBuilderPage />
 * </FeatureGate>
 * 
 * Or with fallback:
 * <FeatureGate module="flow_builder" fallback={<UpgradePrompt />}>
 *   <FlowBuilderPage />
 * </FeatureGate>
 */
export const FeatureGate = ({ 
  module: moduleKey, 
  children, 
  fallback = null,
  showLoadingState = false 
}) => {
  const { canAccess, getAccessStatus, loading } = useFeatureAccessContext();

  if (loading && showLoadingState) {
    return <div className="flex items-center justify-center p-8">
      <div className="animate-spin h-6 w-6 border-2 border-blue-500 border-t-transparent rounded-full" />
    </div>;
  }

  if (!canAccess(moduleKey)) {
    return fallback;
  }

  return children;
};

/**
 * Access Denied Component
 * Standard UI for when access is denied to a module
 */
export const AccessDenied = ({ 
  moduleKey, 
  moduleName,
  reason,
  showContactAdmin = true 
}) => {
  const { getAccessStatus } = useFeatureAccessContext();
  const status = getAccessStatus(moduleKey);
  
  const displayReason = reason || status.reason || 'You do not have access to this feature.';
  const displayName = moduleName || moduleKey?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] bg-gradient-to-br from-slate-50 to-slate-100 rounded-xl p-8 text-center">
      <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-6">
        <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m0 0v2m0-2h2m-2 0H10m4-6V7a4 4 0 00-8 0v4M5 11h14a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2z" />
        </svg>
      </div>
      
      <h2 className="text-xl font-semibold text-slate-800 mb-2">
        Access Restricted
      </h2>
      
      {displayName && (
        <p className="text-slate-600 mb-4">
          {displayName}
        </p>
      )}
      
      <p className="text-sm text-slate-500 max-w-md mb-6">
        {displayReason}
      </p>
      
      {showContactAdmin && (
        <p className="text-xs text-slate-400">
          Please contact your administrator for access.
        </p>
      )}
    </div>
  );
};

export default FeatureAccessContext;
