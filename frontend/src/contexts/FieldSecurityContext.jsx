/**
 * Field-Level Security (FLS) Context
 * Provides field permissions throughout the application.
 * 
 * Usage:
 * 1. Wrap app with <FieldSecurityProvider>
 * 2. Use useFieldSecurity() hook in components
 * 3. Check isFieldHidden(), isFieldReadOnly(), isFieldEditable()
 */
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

// Context
const FieldSecurityContext = createContext(null);

/**
 * Field Security Provider
 * Fetches and caches field permissions for the current user
 */
export const FieldSecurityProvider = ({ children }) => {
  const [fieldPermissions, setFieldPermissions] = useState({});
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch field permissions from API
  const fetchFieldPermissions = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const token = localStorage.getItem('token');
      if (!token) {
        setLoading(false);
        return;
      }

      const response = await axios.get(`${BACKEND_URL}/api/me/field-permissions`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.data) {
        setIsSuperAdmin(response.data.is_super_admin || false);
        setFieldPermissions(response.data.field_permissions || {});
      }
    } catch (err) {
      console.error('Error fetching field permissions:', err);
      setError(err.message);
      // On error, default to allowing all (fail-open for frontend, backend still enforces)
      setFieldPermissions({});
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch on mount and when token changes
  useEffect(() => {
    fetchFieldPermissions();
    
    // Listen for auth changes
    const handleStorageChange = (e) => {
      if (e.key === 'token') {
        fetchFieldPermissions();
      }
    };
    
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [fetchFieldPermissions]);

  /**
   * Check if a field is hidden for a given object
   */
  const isFieldHidden = useCallback((objectName, fieldName) => {
    if (isSuperAdmin) return false; // Super admin sees everything
    
    const objectPerms = fieldPermissions[objectName?.toLowerCase()];
    if (!objectPerms) return false; // No FLS defined = visible
    
    const fieldPerm = objectPerms[fieldName];
    if (!fieldPerm) return false; // No permission for this field = visible
    
    return fieldPerm.hidden === true;
  }, [fieldPermissions, isSuperAdmin]);

  /**
   * Check if a field is read-only for a given object
   */
  const isFieldReadOnly = useCallback((objectName, fieldName) => {
    if (isSuperAdmin) return false; // Super admin can edit everything
    
    const objectPerms = fieldPermissions[objectName?.toLowerCase()];
    if (!objectPerms) return false; // No FLS defined = editable
    
    const fieldPerm = objectPerms[fieldName];
    if (!fieldPerm) return false; // No permission for this field = editable
    
    // Read-only if hidden OR explicitly not editable
    return fieldPerm.hidden === true || fieldPerm.editable === false;
  }, [fieldPermissions, isSuperAdmin]);

  /**
   * Check if a field is editable for a given object
   */
  const isFieldEditable = useCallback((objectName, fieldName) => {
    if (isSuperAdmin) return true; // Super admin can edit everything
    
    const objectPerms = fieldPermissions[objectName?.toLowerCase()];
    if (!objectPerms) return true; // No FLS defined = editable
    
    const fieldPerm = objectPerms[fieldName];
    if (!fieldPerm) return true; // No permission for this field = editable
    
    // Editable if not hidden AND editable is true (or not specified)
    return !fieldPerm.hidden && fieldPerm.editable !== false;
  }, [fieldPermissions, isSuperAdmin]);

  /**
   * Get field permission state: 'hidden', 'readonly', or 'editable'
   */
  const getFieldPermission = useCallback((objectName, fieldName) => {
    if (isSuperAdmin) return 'editable';
    
    const objectPerms = fieldPermissions[objectName?.toLowerCase()];
    if (!objectPerms) return 'editable';
    
    const fieldPerm = objectPerms[fieldName];
    if (!fieldPerm) return 'editable';
    
    if (fieldPerm.hidden) return 'hidden';
    if (fieldPerm.editable === false) return 'readonly';
    return 'editable';
  }, [fieldPermissions, isSuperAdmin]);

  /**
   * Filter fields array based on FLS
   * Returns only fields that are not hidden
   */
  const filterVisibleFields = useCallback((objectName, fields) => {
    if (isSuperAdmin || !fields) return fields;
    
    return fields.filter(field => {
      const fieldName = typeof field === 'string' ? field : field.name || field.api_name;
      return !isFieldHidden(objectName, fieldName);
    });
  }, [isSuperAdmin, isFieldHidden]);

  /**
   * Get all field permissions for an object
   */
  const getObjectFieldPermissions = useCallback((objectName) => {
    if (isSuperAdmin) return {}; // Super admin - all editable
    return fieldPermissions[objectName?.toLowerCase()] || {};
  }, [fieldPermissions, isSuperAdmin]);

  const value = {
    fieldPermissions,
    isSuperAdmin,
    loading,
    error,
    isFieldHidden,
    isFieldReadOnly,
    isFieldEditable,
    getFieldPermission,
    filterVisibleFields,
    getObjectFieldPermissions,
    refreshFieldPermissions: fetchFieldPermissions
  };

  return (
    <FieldSecurityContext.Provider value={value}>
      {children}
    </FieldSecurityContext.Provider>
  );
};

/**
 * Hook to access field security context
 */
export const useFieldSecurity = () => {
  const context = useContext(FieldSecurityContext);
  if (!context) {
    // Return default values if used outside provider (fail-open)
    return {
      fieldPermissions: {},
      isSuperAdmin: false,
      loading: false,
      error: null,
      isFieldHidden: () => false,
      isFieldReadOnly: () => false,
      isFieldEditable: () => true,
      getFieldPermission: () => 'editable',
      filterVisibleFields: (_, fields) => fields,
      getObjectFieldPermissions: () => ({}),
      refreshFieldPermissions: () => {}
    };
  }
  return context;
};

export default FieldSecurityContext;
