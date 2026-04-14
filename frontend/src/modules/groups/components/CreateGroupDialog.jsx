/**
 * Create/Edit Group Dialog
 */
import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../../components/ui/dialog';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Textarea } from '../../../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { Loader2, Plus, Users } from 'lucide-react';
import { toast } from 'react-hot-toast';
import groupService from '../services/groupService';

const GROUP_TYPES = [
  { value: 'public', label: 'Public', description: 'Visible to all users' },
  { value: 'private', label: 'Private', description: 'Visible only to members and admins' }
];

const CreateGroupDialog = ({ open, onOpenChange, editingGroup, onSuccess }) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [groupType, setGroupType] = useState('public');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (editingGroup) {
      setName(editingGroup.name || '');
      setDescription(editingGroup.description || '');
      setGroupType(editingGroup.group_type || 'public');
    } else {
      resetForm();
    }
  }, [editingGroup, open]);

  const resetForm = () => {
    setName('');
    setDescription('');
    setGroupType('public');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!name.trim()) {
      toast.error('Group name is required');
      return;
    }

    try {
      setLoading(true);
      const groupData = {
        name: name.trim(),
        description: description.trim() || null,
        group_type: groupType
      };

      if (editingGroup) {
        await groupService.updateGroup(editingGroup.id, groupData);
        toast.success('Group updated successfully');
      } else {
        await groupService.createGroup(groupData);
        toast.success('Group created successfully');
      }
      
      resetForm();
      onOpenChange(false);
      if (onSuccess) onSuccess();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to save group');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            {editingGroup ? (
              <>
                <Users className="h-5 w-5 text-emerald-600" />
                Edit Group
              </>
            ) : (
              <>
                <Plus className="h-5 w-5 text-emerald-600" />
                Create New Group
              </>
            )}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Group Name */}
          <div className="space-y-2">
            <Label htmlFor="name">Group Name *</Label>
            <Input
              id="name"
              placeholder="e.g., Marketing Team"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              disabled={loading}
              data-testid="group-name-input"
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="Brief description of this group's purpose"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              disabled={loading}
              data-testid="group-description-input"
            />
          </div>

          {/* Group Type */}
          <div className="space-y-2">
            <Label htmlFor="groupType">Group Type</Label>
            <Select value={groupType} onValueChange={setGroupType} disabled={loading}>
              <SelectTrigger id="groupType" data-testid="group-type-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GROUP_TYPES.map(type => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-slate-500">
              {GROUP_TYPES.find(t => t.value === groupType)?.description}
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
              className="bg-emerald-600 hover:bg-emerald-700"
              data-testid="save-group-btn"
            >
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingGroup ? 'Update Group' : 'Create Group'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default CreateGroupDialog;
