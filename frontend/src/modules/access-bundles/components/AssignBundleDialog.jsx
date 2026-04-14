/**
 * AssignBundleDialog - Dialog for assigning access bundles to users
 */
import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../../../components/ui/dialog';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Checkbox } from '../../../components/ui/checkbox';
import { Badge } from '../../../components/ui/badge';
import { Loader2, Users, Search, Check, User } from 'lucide-react';
import accessBundleService from '../services/accessBundleService';

const AssignBundleDialog = ({ open, onOpenChange, bundle, onSuccess }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Load users when dialog opens
  useEffect(() => {
    if (open && bundle) {
      setLoading(true);
      setSelectedUsers([]);
      setSearchTerm('');
      
      accessBundleService.getUsers()
        .then(data => {
          // Filter out users already assigned to this bundle
          const assignedUserIds = bundle.assigned_users?.map(u => u.id) || [];
          const availableUsers = data.filter(u => !assignedUserIds.includes(u.id) && u.is_active);
          setUsers(availableUsers);
        })
        .catch(err => console.error('Error loading users:', err))
        .finally(() => setLoading(false));
    }
  }, [open, bundle]);

  const toggleUser = (userId) => {
    setSelectedUsers(prev => {
      if (prev.includes(userId)) {
        return prev.filter(id => id !== userId);
      }
      return [...prev, userId];
    });
  };

  const handleSubmit = async () => {
    if (selectedUsers.length === 0 || !bundle) return;

    setSubmitting(true);
    try {
      await accessBundleService.assignToUsers(bundle.id, selectedUsers);
      onSuccess?.();
      onOpenChange(false);
    } catch (err) {
      console.error('Error assigning bundle:', err);
      alert(err.response?.data?.detail || 'Failed to assign bundle');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredUsers = users.filter(user => {
    const fullName = `${user.first_name || ''} ${user.last_name || ''}`.toLowerCase();
    const email = (user.email || '').toLowerCase();
    const search = searchTerm.toLowerCase();
    return fullName.includes(search) || email.includes(search);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-blue-600" />
            Assign Bundle to Users
          </DialogTitle>
        </DialogHeader>

        {bundle && (
          <div className="mb-4 p-3 bg-purple-50 rounded-lg border border-purple-200">
            <p className="text-sm text-purple-700 font-medium">{bundle.name}</p>
            <p className="text-xs text-purple-600">
              {bundle.permission_sets?.length || 0} permission sets
            </p>
          </div>
        )}

        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search users..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* User List */}
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
          </div>
        ) : (
          <div className="max-h-72 overflow-y-auto border rounded-lg">
            {filteredUsers.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-8">
                {users.length === 0 ? 'No users available to assign' : 'No users match your search'}
              </p>
            ) : (
              filteredUsers.map((user) => (
                <div
                  key={user.id}
                  className={`flex items-center justify-between p-3 border-b last:border-b-0 cursor-pointer transition-colors ${
                    selectedUsers.includes(user.id)
                      ? 'bg-blue-50'
                      : 'hover:bg-slate-50'
                  }`}
                  onClick={() => toggleUser(user.id)}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      selectedUsers.includes(user.id)
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-100 text-slate-500'
                    }`}>
                      {selectedUsers.includes(user.id) ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <User className="h-4 w-4" />
                      )}
                    </div>
                    <div>
                      <p className="font-medium text-slate-800">
                        {user.first_name || ''} {user.last_name || user.email}
                      </p>
                      <p className="text-xs text-slate-500">{user.email}</p>
                    </div>
                  </div>
                  <Checkbox
                    checked={selectedUsers.includes(user.id)}
                    className="pointer-events-none"
                  />
                </div>
              ))
            )}
          </div>
        )}

        {selectedUsers.length > 0 && (
          <div className="flex items-center gap-2 mt-4">
            <span className="text-sm text-slate-500">Selected:</span>
            <Badge variant="secondary" className="bg-blue-100 text-blue-700">
              {selectedUsers.length} user(s)
            </Badge>
          </div>
        )}

        <DialogFooter className="mt-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || selectedUsers.length === 0}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Assign to {selectedUsers.length} User(s)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AssignBundleDialog;
