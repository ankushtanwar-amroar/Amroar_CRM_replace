/**
 * Create/Edit Role Dialog
 * Salesforce-style role creation and editing with full features
 */
import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../../components/ui/dialog';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Textarea } from '../../../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { Badge } from '../../../components/ui/badge';
import { Loader2, Plus, Search, Shield, X } from 'lucide-react';
import { toast } from 'react-hot-toast';
import roleService from '../services/roleService';

const DATA_VISIBILITY_OPTIONS = [
  { value: 'view_own', label: 'View Own Records Only', description: 'Users can only see their own records' },
  { value: 'view_subordinate', label: 'View & Edit Subordinate Records', description: 'Users can see records of subordinates' },
  { value: 'view_all', label: 'View & Edit All Records', description: 'Users can see all records' }
];

const CreateRoleDialog = ({ open, onOpenChange, roles, parentRole, editingRole, onSuccess }) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [parentRoleId, setParentRoleId] = useState('');
  const [dataVisibility, setDataVisibility] = useState('view_subordinate');
  const [selectedPermissionSets, setSelectedPermissionSets] = useState([]);
  const [permissionSets, setPermissionSets] = useState([]);
  const [permSetSearch, setPermSetSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingPermSets, setLoadingPermSets] = useState(false);

  // Load permission sets
  useEffect(() => {
    if (open) {
      fetchPermissionSets();
    }
  }, [open]);

  // Populate form when editing or setting parent
  useEffect(() => {
    if (editingRole) {
      setName(editingRole.name || '');
      setDescription(editingRole.description || '');
      setParentRoleId(editingRole.parent_role_id || '');
      setDataVisibility(editingRole.data_visibility || 'view_subordinate');
      setSelectedPermissionSets(editingRole.permission_set_ids || []);
    } else if (parentRole) {
      resetForm();
      setParentRoleId(parentRole.id);
    } else {
      resetForm();
    }
  }, [editingRole, parentRole, open]);

  const fetchPermissionSets = async () => {
    try {
      setLoadingPermSets(true);
      const data = await roleService.getPermissionSets();
      setPermissionSets(data || []);
    } catch (error) {
      console.error('Error fetching permission sets:', error);
    } finally {
      setLoadingPermSets(false);
    }
  };

  const resetForm = () => {
    setName('');
    setDescription('');
    setParentRoleId('');
    setDataVisibility('view_subordinate');
    setSelectedPermissionSets([]);
    setPermSetSearch('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!name.trim()) {
      toast.error('Role name is required');
      return;
    }

    try {
      setLoading(true);
      const roleData = {
        name: name.trim(),
        description: description.trim() || null,
        parent_role_id: parentRoleId || null,
        data_visibility: dataVisibility,
        permission_set_ids: selectedPermissionSets
      };

      if (editingRole) {
        await roleService.updateRole(editingRole.id, roleData);
        toast.success('Role updated successfully');
      } else {
        await roleService.createRole(roleData);
        toast.success('Role created successfully');
      }
      
      resetForm();
      onOpenChange(false);
      if (onSuccess) onSuccess();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to save role');
    } finally {
      setLoading(false);
    }
  };

  const togglePermissionSet = (psId) => {
    setSelectedPermissionSets(prev => {
      if (prev.includes(psId)) {
        return prev.filter(id => id !== psId);
      } else {
        return [...prev, psId];
      }
    });
  };

  // Filter out current role from parent options (can't report to self)
  const availableParentRoles = (roles || []).filter(r => 
    !editingRole || r.id !== editingRole.id
  );

  const filteredPermissionSets = permissionSets.filter(ps =>
    (ps.role_name || ps.name || '').toLowerCase().includes(permSetSearch.toLowerCase())
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            {editingRole ? 'Edit Role' : (
              <>
                <Plus className="h-5 w-5 text-indigo-600" />
                Create New Role
              </>
            )}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Role Name */}
          <div className="space-y-2">
            <Label htmlFor="name">Role Name *</Label>
            <Input
              id="name"
              placeholder="e.g., Sales Manager"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              disabled={loading || editingRole?.is_system_role}
              data-testid="role-name-input"
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="Brief description of this role's responsibilities"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              disabled={loading}
              data-testid="role-description-input"
            />
          </div>

          {/* Reports To */}
          <div className="space-y-2">
            <Label htmlFor="parent">Reports To</Label>
            <Select value={parentRoleId || "none"} onValueChange={(val) => setParentRoleId(val === "none" ? "" : val)} disabled={loading}>
              <SelectTrigger id="parent" data-testid="reports-to-select">
                <SelectValue placeholder="Select parent role (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None (Top Level)</SelectItem>
                {availableParentRoles.map((role) => (
                  <SelectItem key={role.id} value={role.id}>
                    {role.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-slate-500">
              Select the role this position reports to in the hierarchy
            </p>
          </div>

          {/* Data Visibility */}
          <div className="space-y-2">
            <Label htmlFor="dataVisibility">Data Visibility</Label>
            <Select value={dataVisibility} onValueChange={setDataVisibility} disabled={loading}>
              <SelectTrigger id="dataVisibility" data-testid="data-visibility-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DATA_VISIBILITY_OPTIONS.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-slate-500">
              {DATA_VISIBILITY_OPTIONS.find(o => o.value === dataVisibility)?.description}
            </p>
          </div>

          {/* Permission Set Assignment */}
          <div className="space-y-2">
            <Label>Permission Set Assignment</Label>
            <div className="border rounded-lg p-3 space-y-3">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  value={permSetSearch}
                  onChange={(e) => setPermSetSearch(e.target.value)}
                  placeholder="Search permission sets"
                  className="pl-9"
                  data-testid="permission-set-search"
                />
              </div>

              {/* Selected */}
              {selectedPermissionSets.length > 0 && (
                <div className="flex flex-wrap gap-2 pb-2 border-b">
                  {selectedPermissionSets.map(psId => {
                    const ps = permissionSets.find(p => p.id === psId || p.role_id === psId);
                    return (
                      <Badge
                        key={psId}
                        variant="secondary"
                        className="bg-indigo-100 text-indigo-700 pr-1"
                      >
                        {ps?.role_name || ps?.name || psId}
                        <button
                          type="button"
                          onClick={() => togglePermissionSet(psId)}
                          className="ml-1 hover:bg-indigo-200 rounded p-0.5"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    );
                  })}
                </div>
              )}

              {/* Available */}
              <div className="max-h-40 overflow-y-auto space-y-1">
                {loadingPermSets ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                  </div>
                ) : filteredPermissionSets.length === 0 ? (
                  <p className="text-sm text-slate-500 text-center py-4">
                    No permission sets found
                  </p>
                ) : (
                  filteredPermissionSets.map(ps => {
                    const psId = ps.id || ps.role_id;
                    const isSelected = selectedPermissionSets.includes(psId);
                    return (
                      <div
                        key={psId}
                        className={`flex items-center p-2 rounded cursor-pointer transition-colors ${
                          isSelected 
                            ? 'bg-indigo-50 border border-indigo-200' 
                            : 'hover:bg-slate-50 border border-transparent'
                        }`}
                        onClick={() => togglePermissionSet(psId)}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}}
                          className="mr-3"
                        />
                        <Shield className="h-4 w-4 mr-2 text-slate-400" />
                        <div className="flex-1">
                          <p className="text-sm font-medium text-slate-900">{ps.role_name || ps.name}</p>
                          <p className="text-xs text-slate-500">
                            {ps.permissions?.length || 0} object permissions
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
            <p className="text-xs text-slate-500">
              Assign one or more permission sets that will be applied to users in this role
            </p>
          </div>

          {/* Actions */}
          <div className="flex justify-end space-x-3 pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading || !name.trim()}
              className="bg-indigo-600 hover:bg-indigo-700"
              data-testid="save-role-btn"
            >
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingRole ? 'Update Role' : 'Create Role'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default CreateRoleDialog;
