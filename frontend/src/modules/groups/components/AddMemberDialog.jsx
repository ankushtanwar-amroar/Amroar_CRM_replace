/**
 * Add Member Dialog
 * For adding users or roles to a group
 */
import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../../components/ui/dialog';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Badge } from '../../../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../../components/ui/tabs';
import { Loader2, Search, User, Shield, X, UserPlus } from 'lucide-react';
import { toast } from 'react-hot-toast';
import groupService from '../services/groupService';

const AddMemberDialog = ({ open, onOpenChange, group, existingMembers, onSuccess }) => {
  const [activeTab, setActiveTab] = useState('users');
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedItems, setSelectedItems] = useState([]);

  useEffect(() => {
    if (open) {
      fetchData();
      setSelectedItems([]);
      setSearch('');
    }
  }, [open]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [usersData, rolesData] = await Promise.all([
        groupService.getUsers(),
        groupService.getRoles()
      ]);
      setUsers(usersData || []);
      setRoles(rolesData || []);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const existingMemberIds = (existingMembers || []).map(m => m.member_id);

  const filteredUsers = users.filter(u => {
    const name = `${u.first_name || ''} ${u.last_name || ''}`.toLowerCase();
    const matchesSearch = name.includes(search.toLowerCase()) || 
                         (u.email || '').toLowerCase().includes(search.toLowerCase());
    const notAlreadyMember = !existingMemberIds.includes(u.id);
    return matchesSearch && notAlreadyMember;
  });

  const filteredRoles = roles.filter(r => {
    const matchesSearch = (r.name || '').toLowerCase().includes(search.toLowerCase());
    const notAlreadyMember = !existingMemberIds.includes(r.id);
    return matchesSearch && notAlreadyMember;
  });

  const toggleSelection = (id, type) => {
    setSelectedItems(prev => {
      const exists = prev.find(item => item.id === id && item.type === type);
      if (exists) {
        return prev.filter(item => !(item.id === id && item.type === type));
      } else {
        return [...prev, { id, type }];
      }
    });
  };

  const isSelected = (id, type) => {
    return selectedItems.some(item => item.id === id && item.type === type);
  };

  const handleAdd = async () => {
    if (selectedItems.length === 0) {
      toast.error('Please select at least one user or role');
      return;
    }

    try {
      setSaving(true);
      for (const item of selectedItems) {
        await groupService.addMember(group.id, item.type === 'users' ? 'user' : 'role', item.id);
      }
      toast.success(`Added ${selectedItems.length} member(s) to group`);
      onOpenChange(false);
      if (onSuccess) onSuccess();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to add members');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <UserPlus className="h-5 w-5 text-emerald-600" />
            Add Members to {group?.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Selected Items */}
          {selectedItems.length > 0 && (
            <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-100">
              <p className="text-sm font-medium text-emerald-800 mb-2">
                Selected ({selectedItems.length})
              </p>
              <div className="flex flex-wrap gap-2">
                {selectedItems.map(item => {
                  const data = item.type === 'users' 
                    ? users.find(u => u.id === item.id)
                    : roles.find(r => r.id === item.id);
                  const label = item.type === 'users'
                    ? `${data?.first_name || ''} ${data?.last_name || ''}`.trim()
                    : data?.name || 'Unknown';
                  return (
                    <Badge
                      key={`${item.type}-${item.id}`}
                      variant="secondary"
                      className="bg-white text-emerald-700 pr-1"
                    >
                      {item.type === 'users' ? <User className="h-3 w-3 mr-1" /> : <Shield className="h-3 w-3 mr-1" />}
                      {label}
                      <button
                        type="button"
                        onClick={() => toggleSelection(item.id, item.type)}
                        className="ml-1 hover:bg-emerald-100 rounded p-0.5"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  );
                })}
              </div>
            </div>
          )}

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search users or roles..."
              className="pl-9"
              data-testid="member-search"
            />
          </div>

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="users">
                <User className="h-4 w-4 mr-2" />
                Users ({filteredUsers.length})
              </TabsTrigger>
              <TabsTrigger value="roles">
                <Shield className="h-4 w-4 mr-2" />
                Roles ({filteredRoles.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="users" className="mt-4">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                </div>
              ) : filteredUsers.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  No available users found
                </div>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {filteredUsers.map(user => (
                    <div
                      key={user.id}
                      className={`flex items-center p-3 rounded-lg cursor-pointer transition-colors ${
                        isSelected(user.id, 'users')
                          ? 'bg-emerald-50 border border-emerald-200'
                          : 'hover:bg-slate-50 border border-transparent'
                      }`}
                      onClick={() => toggleSelection(user.id, 'users')}
                      data-testid={`user-item-${user.id}`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected(user.id, 'users')}
                        onChange={() => {}}
                        className="mr-3"
                      />
                      <div className="w-8 h-8 bg-slate-200 rounded-full flex items-center justify-center mr-3">
                        <span className="text-xs font-medium text-slate-600">
                          {(user.first_name?.[0] || '') + (user.last_name?.[0] || '')}
                        </span>
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-slate-900">
                          {user.first_name} {user.last_name}
                        </p>
                        <p className="text-xs text-slate-500">{user.email}</p>
                      </div>
                      {!user.is_active && (
                        <Badge variant="outline" className="text-xs">Inactive</Badge>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="roles" className="mt-4">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                </div>
              ) : filteredRoles.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  No available roles found
                </div>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {filteredRoles.map(role => (
                    <div
                      key={role.id}
                      className={`flex items-center p-3 rounded-lg cursor-pointer transition-colors ${
                        isSelected(role.id, 'roles')
                          ? 'bg-emerald-50 border border-emerald-200'
                          : 'hover:bg-slate-50 border border-transparent'
                      }`}
                      onClick={() => toggleSelection(role.id, 'roles')}
                      data-testid={`role-item-${role.id}`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected(role.id, 'roles')}
                        onChange={() => {}}
                        className="mr-3"
                      />
                      <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center mr-3">
                        <Shield className="h-4 w-4 text-indigo-600" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-slate-900">{role.name}</p>
                        <p className="text-xs text-slate-500">
                          {role.user_count || 0} users
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>

          {/* Actions */}
          <div className="flex justify-end space-x-3 pt-4 border-t">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAdd}
              disabled={saving || selectedItems.length === 0}
              className="bg-emerald-600 hover:bg-emerald-700"
              data-testid="add-members-btn"
            >
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Add {selectedItems.length > 0 ? `(${selectedItems.length})` : ''} Members
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AddMemberDialog;
