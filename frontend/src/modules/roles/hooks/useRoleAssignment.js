/**
 * Use Role Assignment Hook
 * Manages user-role assignments
 */
import { useState, useEffect } from 'react';
import roleService from '../services/roleService';

export const useRoleAssignment = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const data = await roleService.getUsers();
      setUsers(data);
    } catch (err) {
      console.error('Error fetching users:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const assignRole = async (userId, roleId) => {
    try {
      await roleService.assignRoleToUser(userId, roleId);
      await fetchUsers(); // Refresh
      return true;
    } catch (err) {
      console.error('Error assigning role:', err);
      throw err;
    }
  };

  return {
    users,
    loading,
    assignRole,
    refresh: fetchUsers
  };
};

export default useRoleAssignment;