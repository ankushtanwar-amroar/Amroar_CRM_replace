/**
 * Assign Users Dialog
 * Assign/move users to roles with search and selection
 */
import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../../components/ui/dialog';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../../components/ui/tabs';
import { Users, Loader2, Search, Check, X, UserPlus } from 'lucide-react';
import { toast } from 'react-hot-toast';
import roleService from '../services/roleService';

const AssignUsersDialog = ({ open, onOpenChange, selectedRole, onSuccess }) => {
  const [allUsers, setAllUsers] = useState([]);
  const [roleUsers, setRoleUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [activeTab, setActiveTab] = useState('available');

  useEffect(() => {
    if (open && selectedRole) {
      fetchUsers();
    }
  }, [open, selectedRole]);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const [all, current] = await Promise.all([
        roleService.getUsers(),
        roleService.getRoleUsers(selectedRole.id)
      ]);
      setAllUsers(all);
      setRoleUsers(current);
      setSelectedUsers([]);
    } catch (error) {
      console.error('Error fetching users:', error);
      toast.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const handleAssignUsers = async () => {
    if (selectedUsers.length === 0) {
      toast.error('Select at least one user to assign');
      return;
    }

    try {
      setAssigning(true);
      for (const userId of selectedUsers) {
        await roleService.assignUserToRole(selectedRole.id, userId);
      }
      toast.success(`${selectedUsers.length} user(s) assigned to role`);
      setSelectedUsers([]);
      await fetchUsers();
      if (onSuccess) onSuccess();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to assign users');
    } finally {
      setAssigning(false);
    }
  };

  const handleRemoveUser = async (userId) => {
    try {
      await roleService.removeUserFromRole(selectedRole.id, userId);
      toast.success('User removed from role');
      await fetchUsers();
      if (onSuccess) onSuccess();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to remove user');
    }
  };

  const toggleUserSelection = (userId) => {
    setSelectedUsers(prev => {
      if (prev.includes(userId)) {
        return prev.filter(id => id !== userId);
      } else {
        return [...prev, userId];
      }
    });
  };

  // Filter users not already in this role
  const availableUsers = allUsers.filter(user => 
    !roleUsers.some(ru => ru.id === user.id) &&
    (user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
     `${user.first_name} ${user.last_name}`.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  // Filter current role users
  const filteredRoleUsers = roleUsers.filter(user =>
    user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    `${user.first_name} ${user.last_name}`.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Users className="h-5 w-5 text-indigo-600" />
            Assign Users to {selectedRole?.name}
          </DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="available">Available Users</TabsTrigger>
            <TabsTrigger value="current">Current ({roleUsers.length})</TabsTrigger>
          </TabsList>

          {/* Search */}
          <div className="relative my-4">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search users..."
              className="pl-9"
              data-testid="user-search-input"
            />
          </div>

          {/* Available Users Tab */}
          <TabsContent value="available" className="mt-0">
            <div className="border rounded-lg max-h-60 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                </div>
              ) : availableUsers.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  No available users found
                </div>
              ) : (
                <div className="divide-y">
                  {availableUsers.map(user => {
                    const isSelected = selectedUsers.includes(user.id);
                    return (
                      <div
                        key={user.id}
                        className={`flex items-center p-3 cursor-pointer transition-colors ${
                          isSelected ? 'bg-indigo-50' : 'hover:bg-slate-50'
                        }`}
                        onClick={() => toggleUserSelection(user.id)}
                      >
                        <div className={`w-5 h-5 border rounded mr-3 flex items-center justify-center ${
                          isSelected ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300'
                        }`}>
                          {isSelected && <Check className="h-3 w-3 text-white" />}
                        </div>
                        <div className="w-8 h-8 bg-slate-200 rounded-full flex items-center justify-center mr-3">
                          <span className="text-xs font-medium text-slate-600">
                            {(user.first_name?.[0] || '') + (user.last_name?.[0] || '')}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm text-slate-900 truncate">
                            {user.first_name} {user.last_name}
                          </p>
                          <p className="text-xs text-slate-500 truncate">{user.email}</p>
                        </div>
                        {user.role_name && (
                          <Badge variant="outline" className="ml-2 text-xs">
                            {user.role_name}
                          </Badge>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Selection summary and assign button */}
            {selectedUsers.length > 0 && (
              <div className="mt-4 p-3 bg-indigo-50 rounded-lg border border-indigo-200">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-indigo-700">
                    {selectedUsers.length} user(s) selected
                  </span>
                  <Button
                    size="sm"
                    onClick={handleAssignUsers}
                    disabled={assigning}
                    className="bg-indigo-600 hover:bg-indigo-700"
                    data-testid="confirm-assign-btn"
                  >
                    {assigning ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <UserPlus className="h-4 w-4 mr-1" />
                        Assign
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>

          {/* Current Users Tab */}
          <TabsContent value="current" className="mt-0">
            <div className="border rounded-lg max-h-60 overflow-y-auto">
              {filteredRoleUsers.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  No users currently in this role
                </div>
              ) : (
                <div className="divide-y">
                  {filteredRoleUsers.map(user => (
                    <div
                      key={user.id}
                      className="flex items-center p-3 hover:bg-slate-50"
                    >
                      <div className="w-8 h-8 bg-slate-200 rounded-full flex items-center justify-center mr-3">
                        <span className="text-xs font-medium text-slate-600">
                          {(user.first_name?.[0] || '') + (user.last_name?.[0] || '')}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm text-slate-900 truncate">
                          {user.first_name} {user.last_name}
                        </p>
                        <p className="text-xs text-slate-500 truncate">{user.email}</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        onClick={() => {
                          if (window.confirm(`Remove ${user.first_name} ${user.last_name} from this role?`)) {
                            handleRemoveUser(user.id);
                          }
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>

        {/* Close Button */}
        <div className="flex justify-end pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AssignUsersDialog;
