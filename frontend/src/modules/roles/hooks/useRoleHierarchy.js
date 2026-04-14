/**
 * Use Role Hierarchy Hook
 * Manages role hierarchy state
 */
import { useState, useEffect, useCallback } from 'react';
import roleService from '../services/roleService';

export const useRoleHierarchy = () => {
  const [roles, setRoles] = useState([]);
  const [hierarchyTree, setHierarchyTree] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchRoles = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      // Get flat list
      const data = await roleService.getAllRoles();
      setRoles(data);
      
      // Get hierarchy tree directly from API
      try {
        const tree = await roleService.getRoleHierarchy();
        setHierarchyTree(tree);
      } catch (e) {
        // Fallback: build tree from flat list
        setHierarchyTree(buildHierarchyTree(data));
      }
    } catch (err) {
      setError(err.message);
      console.error('Error fetching roles:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRoles();
  }, [fetchRoles]);

  const buildHierarchyTree = (roles) => {
    // Build tree structure from flat role list
    const roleMap = {};
    const rootRoles = [];

    // Create map
    roles.forEach(role => {
      roleMap[role.id] = { ...role, children: [] };
    });

    // Build tree
    roles.forEach(role => {
      if (role.parent_role_id && roleMap[role.parent_role_id]) {
        roleMap[role.parent_role_id].children.push(roleMap[role.id]);
      } else {
        rootRoles.push(roleMap[role.id]);
      }
    });

    return rootRoles;
  };

  return {
    roles,
    hierarchyTree,
    loading,
    error,
    refresh: fetchRoles
  };
};

export default useRoleHierarchy;
