/**
 * Share Dialog Component
 * Share record with user or role
 */
import React, { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '../../../components/ui/dialog';
import { Button } from '../../../components/ui/button';
import { Label } from '../../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { Share2, Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';

const ShareDialog = ({ open, onOpenChange, users, roles, onShare }) => {
  const [shareType, setShareType] = useState('user');
  const [selectedId, setSelectedId] = useState('');
  const [accessLevel, setAccessLevel] = useState('read');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!selectedId) {
      toast.error('Please select a user or role');
      return;
    }

    try {
      setLoading(true);
      await onShare({
        shared_with_type: shareType,
        shared_with_id: selectedId,
        access_level: accessLevel
      });
      
      toast.success('Record shared successfully');
      setShareType('user');
      setSelectedId('');
      setAccessLevel('read');
      onOpenChange(false);
    } catch (error) {
      toast.error('Failed to share record');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="h-5 w-5 text-indigo-600" />
            Share Record
          </DialogTitle>
          <DialogDescription>
            Grant access to a user or role
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Share With</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={shareType === 'user' ? 'default' : 'outline'}
                  onClick={() => { setShareType('user'); setSelectedId(''); }}
                  className="flex-1"
                >
                  User
                </Button>
                <Button
                  type="button"
                  variant={shareType === 'role' ? 'default' : 'outline'}
                  onClick={() => { setShareType('role'); setSelectedId(''); }}
                  className="flex-1"
                >
                  Role
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label>{shareType === 'user' ? 'Select User' : 'Select Role'}</Label>
              <Select value={selectedId} onValueChange={setSelectedId}>
                <SelectTrigger>
                  <SelectValue placeholder={`Choose ${shareType}...`} />
                </SelectTrigger>
                <SelectContent>
                  {shareType === 'user' ? (
                    users && users.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.first_name} {user.last_name} ({user.email})
                      </SelectItem>
                    ))
                  ) : (
                    roles && roles.map((role) => (
                      <SelectItem key={role.id} value={role.id}>
                        {role.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Access Level</Label>
              <Select value={accessLevel} onValueChange={setAccessLevel}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="read">
                    <div>
                      <div className="font-medium">Read Only</div>
                      <div className="text-xs text-slate-500">Can view record</div>
                    </div>
                  </SelectItem>
                  <SelectItem value="edit">
                    <div>
                      <div className="font-medium">Read/Write</div>
                      <div className="text-xs text-slate-500">Can view and edit record</div>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sharing...
                </>
              ) : (
                'Share'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default ShareDialog;