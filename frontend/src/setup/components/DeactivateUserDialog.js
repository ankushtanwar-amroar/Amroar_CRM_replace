import React, { useState } from 'react';
import axios from 'axios';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
import { AlertTriangle, Loader } from 'lucide-react';
import { toast } from 'react-hot-toast';

const API = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';

const DeactivateUserDialog = ({ open, onOpenChange, user, onSuccess }) => {
  const [loading, setLoading] = useState(false);

  const handleDeactivate = async () => {
    if (!user) return;

    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      await axios.post(
        `${API}/api/users/${user.id}/deactivate`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );

      toast.success(`${user.email} has been deactivated`);
      onOpenChange(false);
      if (onSuccess) onSuccess();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to deactivate user');
    } finally {
      setLoading(false);
    }
  };

  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            Deactivate User
          </DialogTitle>
          <DialogDescription>
            Are you sure you want to deactivate this user?
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <p className="text-sm text-amber-800 font-medium mb-2">
              {user.first_name} {user.last_name}
            </p>
            <p className="text-sm text-amber-700">{user.email}</p>
          </div>

          <div className="mt-4 space-y-2 text-sm text-slate-600">
            <p>This user will:</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Be immediately logged out</li>
              <li>Unable to access the CRM</li>
              <li>Retain ownership of their records</li>
              <li>Can be reactivated later if needed</li>
            </ul>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleDeactivate}
            disabled={loading}
            className="bg-red-600 hover:bg-red-700"
          >
            {loading ? (
              <>
                <Loader className="mr-2 h-4 w-4 animate-spin" />
                Deactivating...
              </>
            ) : (
              'Deactivate User'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default DeactivateUserDialog;