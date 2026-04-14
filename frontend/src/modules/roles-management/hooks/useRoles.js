/**
 * useRoles Hook
 * State management for roles
 */
import { useState, useEffect, useCallback } from 'react';
import rolesService from '../services/rolesService';

export const useRoles = () => {
  const [roles, setRoles] = useState([]);
  const [hierarchy, setHierarchy] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchRoles = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await rolesService.listRoles();
      setRoles(data);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to fetch roles');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchHierarchy = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await rolesService.getHierarchy();
      setHierarchy(data);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to fetch role hierarchy');
    } finally {
      setLoading(false);
    }
  }, []);

  const createRole = async (roleData) => {
    const newRole = await rolesService.createRole(roleData);
    await fetchHierarchy();
    return newRole;
  };

  const updateRole = async (roleId, roleData) => {
    const updatedRole = await rolesService.updateRole(roleId, roleData);
    await fetchHierarchy();
    return updatedRole;
  };

  const deleteRole = async (roleId) => {
    await rolesService.deleteRole(roleId);
    await fetchHierarchy();
  };

  const refresh = useCallback(() => {
    fetchHierarchy();
  }, [fetchHierarchy]);

  useEffect(() => {
    fetchHierarchy();
  }, [fetchHierarchy]);

  return {
    roles,
    hierarchy,
    loading,
    error,
    fetchRoles,
    fetchHierarchy,
    createRole,
    updateRole,
    deleteRole,
    refresh
  };
};
