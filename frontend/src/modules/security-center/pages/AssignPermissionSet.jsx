/**
 * Assign Permission Set Page
 * Assign roles (which contain permission sets) to users
 */
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Users as UsersIcon, Save, Loader2 } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import permissionSetService from '../services/permissionSetService';
import { toast } from 'react-hot-toast';

const AssignPermissionSet = () => {
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [usersData, rolesData] = await Promise.all([
        permissionSetService.getUsers(),
        permissionSetService.getRoles()
      ]);
      setUsers(usersData);
      setRoles(rolesData);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Failed to load users and roles');
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = async (userId, newRoleId) => {
    try {
      setSaving(true);
      await permissionSetService.assignRoleToUser(userId, newRoleId);
      toast.success('Role assigned successfully');
      // Refresh users
      const updatedUsers = await permissionSetService.getUsers();
      setUsers(updatedUsers);
    } catch (error) {
      console.error('Error assigning role:', error);
      toast.error('Failed to assign role');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center space-x-2 text-sm">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/setup/security-center/permission-sets')}
          className="text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Permission Sets
        </Button>
        <span className="text-slate-400">›</span>
        <span className="text-slate-900 font-medium">Assign to Users</span>
      </div>

      {/* Header */}
      <div className="flex items-center space-x-3">
        <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
          <UsersIcon className="h-5 w-5 text-indigo-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Assign Permission Sets</h1>
          <p className="text-sm text-slate-500">Assign roles to users to grant permissions</p>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white border rounded-lg shadow-sm overflow-hidden">
        <div className="px-6 py-4 bg-slate-50 border-b">
          <h2 className="font-semibold text-slate-900">Users & Role Assignments</h2>
          <p className="text-sm text-slate-500">Each user's role determines their permission set</p>
        </div>
        
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Current Role</TableHead>
              <TableHead className="w-64">Assign Role</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.id}>
                <TableCell className="font-medium">
                  {user.first_name} {user.last_name}
                </TableCell>
                <TableCell className="text-slate-600">{user.email}</TableCell>
                <TableCell>
                  {user.role_name ? (
                    <Badge variant="outline" className={
                      user.role_id === 'system_administrator'
                        ? 'bg-purple-50 text-purple-700 border-purple-200'
                        : 'bg-blue-50 text-blue-700 border-blue-200'
                    }>
                      {user.role_name}
                    </Badge>
                  ) : (
                    <span className="text-slate-400 text-sm">No role</span>
                  )}
                </TableCell>
                <TableCell>
                  <Select
                    value={user.role_id || ''}
                    onValueChange={(roleId) => handleRoleChange(user.id, roleId)}
                    disabled={saving}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select role..." />
                    </SelectTrigger>
                    <SelectContent>
                      {roles.map((role) => (
                        <SelectItem key={role.id} value={role.id}>
                          <div>
                            <div className="font-medium">{role.name}</div>
                            <div className="text-xs text-slate-500">{role.description}</div>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Info */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
        <p className="font-medium mb-1">⚠️ Important</p>
        <p>Changing a user's role will immediately update their permissions across all objects. The user will need to log out and log back in for changes to take full effect.</p>
      </div>
    </div>
  );
};

export default AssignPermissionSet;