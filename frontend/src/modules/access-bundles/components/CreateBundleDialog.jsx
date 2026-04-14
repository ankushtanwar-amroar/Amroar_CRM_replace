/**
 * CreateBundleDialog - Dialog for creating/editing access bundles
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
import { Label } from '../../../components/ui/label';
import { Textarea } from '../../../components/ui/textarea';
import { Checkbox } from '../../../components/ui/checkbox';
import { Badge } from '../../../components/ui/badge';
import { Loader2, Package, Lock, Check } from 'lucide-react';
import accessBundleService from '../services/accessBundleService';

const CreateBundleDialog = ({ open, onOpenChange, editingBundle, onSuccess }) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedPermissionSets, setSelectedPermissionSets] = useState([]);
  const [isActive, setIsActive] = useState(true);
  const [loading, setLoading] = useState(false);
  const [permissionSets, setPermissionSets] = useState([]);
  const [loadingPermSets, setLoadingPermSets] = useState(false);

  // Load permission sets when dialog opens
  useEffect(() => {
    if (open) {
      setLoadingPermSets(true);
      accessBundleService.getPermissionSets()
        .then(data => setPermissionSets(data))
        .catch(err => console.error('Error loading permission sets:', err))
        .finally(() => setLoadingPermSets(false));
    }
  }, [open]);

  // Set form values when editing
  useEffect(() => {
    if (editingBundle) {
      setName(editingBundle.name || '');
      setDescription(editingBundle.description || '');
      setSelectedPermissionSets(editingBundle.permission_set_ids || []);
      setIsActive(editingBundle.is_active !== false);
    } else {
      setName('');
      setDescription('');
      setSelectedPermissionSets([]);
      setIsActive(true);
    }
  }, [editingBundle, open]);

  const togglePermissionSet = (permSetId) => {
    setSelectedPermissionSets(prev => {
      if (prev.includes(permSetId)) {
        return prev.filter(id => id !== permSetId);
      }
      return [...prev, permSetId];
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!name.trim()) {
      return;
    }

    setLoading(true);
    try {
      const bundleData = {
        name: name.trim(),
        description: description.trim(),
        permission_set_ids: selectedPermissionSets,
        is_active: isActive
      };

      if (editingBundle) {
        await accessBundleService.update(editingBundle.id, bundleData);
      } else {
        await accessBundleService.create(bundleData);
      }

      onSuccess?.();
      onOpenChange(false);
    } catch (err) {
      console.error('Error saving bundle:', err);
      alert(err.response?.data?.detail || 'Failed to save bundle');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-purple-600" />
            {editingBundle ? 'Edit Access Bundle' : 'Create Access Bundle'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Bundle Name */}
          <div className="space-y-2">
            <Label htmlFor="bundle-name">Bundle Name *</Label>
            <Input
              id="bundle-name"
              data-testid="bundle-name-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Sales Executive Bundle"
              required
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="bundle-description">Description</Label>
            <Textarea
              id="bundle-description"
              data-testid="bundle-description-input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what this bundle provides access to..."
              rows={3}
            />
          </div>

          {/* Permission Sets Selection */}
          <div className="space-y-3">
            <Label>Include Permission Sets</Label>
            <p className="text-sm text-slate-500">
              Select the permission sets to include in this bundle
            </p>
            
            {loadingPermSets ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2 max-h-64 overflow-y-auto border rounded-lg p-3">
                {permissionSets.length === 0 ? (
                  <p className="text-sm text-slate-500 text-center py-4">
                    No permission sets available
                  </p>
                ) : (
                  permissionSets.map((permSet) => (
                    <div
                      key={permSet.id}
                      className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${
                        selectedPermissionSets.includes(permSet.id)
                          ? 'bg-purple-50 border-purple-300'
                          : 'bg-white border-slate-200 hover:border-slate-300'
                      }`}
                      onClick={() => togglePermissionSet(permSet.id)}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded flex items-center justify-center ${
                          selectedPermissionSets.includes(permSet.id)
                            ? 'bg-purple-600 text-white'
                            : 'bg-slate-100 text-slate-500'
                        }`}>
                          {selectedPermissionSets.includes(permSet.id) ? (
                            <Check className="h-4 w-4" />
                          ) : (
                            <Lock className="h-4 w-4" />
                          )}
                        </div>
                        <div>
                          <p className="font-medium text-slate-800">{permSet.role_name}</p>
                          <p className="text-xs text-slate-500">
                            {permSet.permissions?.length || 0} object permissions
                          </p>
                        </div>
                      </div>
                      <Checkbox
                        checked={selectedPermissionSets.includes(permSet.id)}
                        className="pointer-events-none"
                      />
                    </div>
                  ))
                )}
              </div>
            )}

            {selectedPermissionSets.length > 0 && (
              <div className="flex items-center gap-2 pt-2">
                <span className="text-sm text-slate-500">Selected:</span>
                <Badge variant="secondary" className="bg-purple-100 text-purple-700">
                  {selectedPermissionSets.length} permission set(s)
                </Badge>
              </div>
            )}
          </div>

          {/* Active Status */}
          <div className="flex items-center space-x-2">
            <Checkbox
              id="bundle-active"
              checked={isActive}
              onCheckedChange={setIsActive}
            />
            <Label htmlFor="bundle-active" className="cursor-pointer">
              Bundle is active
            </Label>
          </div>

          <DialogFooter>
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
              className="bg-purple-600 hover:bg-purple-700"
            >
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingBundle ? 'Save Changes' : 'Create Bundle'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default CreateBundleDialog;
