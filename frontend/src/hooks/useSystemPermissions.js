/**
 * useSystemPermissions Hook
 * React hook for checking and using system permissions
 * 
 * Usage:
 * const { hasPermission, canAccessSection, permissions, loading } = useSystemPermissions();
 * 
 * // Check specific permission
 * if (hasPermission('manage_users')) { ... }
 * 
 * // Check section access
 * if (canAccessSection('users')) { ... }
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { getMyPermissions, checkSectionAccess } from '../services/systemPermissions';

// Section to permission mapping (cached client-side)
const SECTION_PERMISSIONS = {
  setup: 'view_setup',
  users: 'view_users',
  users_manage: 'manage_users',
  roles: 'view_roles',
  roles_manage: 'manage_roles',
  permission_sets: 'manage_permission_sets',
  permission_bundles: 'manage_permission_bundles',
  groups: 'manage_groups',
  queues: 'manage_queues',
  sharing_rules: 'manage_sharing_rules',
  sharing_settings: 'manage_sharing_settings',
  licenses: 'view_licenses',
  licenses_manage: 'manage_licenses',
  security_center: 'view_security_center',
  audit_logs: 'view_audit_logs',
  schema_builder: 'manage_custom_objects',
  page_layouts: 'manage_page_layouts',
  flow_builder: 'manage_flows',
  export: 'export_data',
  import: 'import_data',
};

// Cache for permissions
let permissionsCache = null;
let cacheTimestamp = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const useSystemPermissions = () => {
  const [permissions, setPermissions] = useState(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch permissions on mount
  useEffect(() => {
    const fetchPermissions = async () => {
      // Check cache
      if (permissionsCache && cacheTimestamp && (Date.now() - cacheTimestamp < CACHE_TTL)) {
        setPermissions(permissionsCache.permissions);
        setIsSuperAdmin(permissionsCache.is_super_admin);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const data = await getMyPermissions();
        
        // Update cache
        permissionsCache = data;
        cacheTimestamp = Date.now();
        
        setPermissions(data.permissions);
        setIsSuperAdmin(data.is_super_admin);
        setError(null);
      } catch (err) {
        console.error('Error fetching permissions:', err);
        setError(err.message);
        // On error, grant minimal permissions
        setPermissions({});
        setIsSuperAdmin(false);
      } finally {
        setLoading(false);
      }
    };

    fetchPermissions();
  }, []);

  /**
   * Check if user has a specific permission
   */
  const hasPermission = useCallback((permission) => {
    if (isSuperAdmin) return true;
    if (!permissions) return false;
    return permissions[permission] === true;
  }, [permissions, isSuperAdmin]);

  /**
   * Check if user can access a specific section (client-side)
   */
  const canAccessSection = useCallback((section) => {
    if (isSuperAdmin) return true;
    if (!permissions) return false;
    
    const requiredPermission = SECTION_PERMISSIONS[section];
    if (!requiredPermission) return false;
    
    return permissions[requiredPermission] === true;
  }, [permissions, isSuperAdmin]);

  /**
   * Check multiple permissions at once
   */
  const hasAnyPermission = useCallback((permissionList) => {
    if (isSuperAdmin) return true;
    return permissionList.some(perm => hasPermission(perm));
  }, [hasPermission, isSuperAdmin]);

  /**
   * Check if user has ALL specified permissions
   */
  const hasAllPermissions = useCallback((permissionList) => {
    if (isSuperAdmin) return true;
    return permissionList.every(perm => hasPermission(perm));
  }, [hasPermission, isSuperAdmin]);

  /**
   * Invalidate cache (call after permission changes)
   */
  const invalidateCache = useCallback(() => {
    permissionsCache = null;
    cacheTimestamp = null;
  }, []);

  /**
   * Refresh permissions from server
   */
  const refresh = useCallback(async () => {
    invalidateCache();
    try {
      setLoading(true);
      const data = await getMyPermissions();
      permissionsCache = data;
      cacheTimestamp = Date.now();
      setPermissions(data.permissions);
      setIsSuperAdmin(data.is_super_admin);
    } catch (err) {
      console.error('Error refreshing permissions:', err);
    } finally {
      setLoading(false);
    }
  }, [invalidateCache]);

  // Memoized permission categories for UI
  const permissionsByCategory = useMemo(() => {
    if (!permissions) return {};
    
    const categories = {
      setup: [],
      users: [],
      roles: [],
      permissions: [],
      groups: [],
      queues: [],
      sharing: [],
      licenses: [],
      security: [],
      data: [],
      schema: [],
      automation: [],
      api: []
    };

    // This would normally come from the definitions endpoint
    // For now, just group what we have
    return categories;
  }, [permissions]);

  return {
    // State
    permissions,
    isSuperAdmin,
    loading,
    error,
    
    // Methods
    hasPermission,
    canAccessSection,
    hasAnyPermission,
    hasAllPermissions,
    refresh,
    invalidateCache,
    
    // Utilities
    permissionsByCategory,
    SECTION_PERMISSIONS
  };
};

export default useSystemPermissions;

// Also export the invalidate function for use outside hooks
export const invalidatePermissionsCache = () => {
  permissionsCache = null;
  cacheTimestamp = null;
};
