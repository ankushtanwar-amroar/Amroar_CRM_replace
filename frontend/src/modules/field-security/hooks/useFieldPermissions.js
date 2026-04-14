/**
 * Use Field Permissions Hook
 * Manages field permission state
 */
import { useState, useEffect } from 'react';
import fieldPermissionService from '../services/fieldPermissionService';

export const useFieldPermissions = (roleId, objectName) => {
  const [permissionSet, setPermissionSet] = useState(null);
  const [objectFields, setObjectFields] = useState([]);
  const [fieldPermissions, setFieldPermissions] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (roleId) {
      fetchPermissionSet();
    }
  }, [roleId]);

  useEffect(() => {
    if (objectName) {
      fetchObjectFields();
    }
  }, [objectName]);

  const fetchPermissionSet = async () => {
    try {
      setLoading(true);
      const data = await fieldPermissionService.getPermissionSet(roleId);
      setPermissionSet(data);
      
      // Extract field permissions for current object if exists
      if (objectName && data.field_permissions && data.field_permissions[objectName]) {
        setFieldPermissions(data.field_permissions[objectName]);
      }
    } catch (error) {
      console.error('Error fetching permission set:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchObjectFields = async () => {
    try {
      const data = await fieldPermissionService.getObjectFields(objectName);
      
      // Extract fields from object metadata
      if (data.fields) {
        const fieldList = Object.keys(data.fields).map(fieldName => ({
          field_name: fieldName,
          label: data.fields[fieldName].label || fieldName,
          type: data.fields[fieldName].type
        }));
        setObjectFields(fieldList);
        
        // Initialize field permissions if not exists
        if (!fieldPermissions || fieldPermissions.length === 0) {
          const defaultPerms = fieldList.map(f => ({
            field_name: f.field_name,
            read: true,
            edit: true
          }));
          setFieldPermissions(defaultPerms);
        }
      }
    } catch (error) {
      console.error('Error fetching object fields:', error);
    }
  };

  const updateFieldPermission = (fieldName, permType, value) => {
    setFieldPermissions(prev => {
      const updated = [...prev];
      const index = updated.findIndex(p => p.field_name === fieldName);
      
      if (index >= 0) {
        updated[index] = {
          ...updated[index],
          [permType]: value,
          // If disabling read, also disable edit
          ...(permType === 'read' && !value ? { edit: false } : {})
        };
      } else {
        // Add new permission
        updated.push({
          field_name: fieldName,
          read: permType === 'read' ? value : true,
          edit: permType === 'edit' ? value : true
        });
      }
      
      return updated;
    });
  };

  const getFieldPermission = (fieldName) => {
    const perm = fieldPermissions.find(p => p.field_name === fieldName);
    return perm || { field_name: fieldName, read: true, edit: true };
  };

  return {
    permissionSet,
    objectFields,
    fieldPermissions,
    loading,
    updateFieldPermission,
    getFieldPermission,
    refresh: fetchPermissionSet
  };
};

export default useFieldPermissions;
