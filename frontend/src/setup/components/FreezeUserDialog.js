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
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Snowflake, Loader } from 'lucide-react';
import { toast } from 'react-hot-toast';

const API = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';

const FreezeUserDialog = ({ open, onOpenChange, user, onSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [duration, setDuration] = useState('1_hour');
  const [customDate, setCustomDate] = useState('');
  const [reason, setReason] = useState('');

  const handleFreeze = async () => {
    if (!user) return;

    try {
      setLoading(true);
      
      // Calculate frozen_until based on duration
      let frozenUntil;
      const now = new Date();
      
      switch(duration) {
        case '1_hour':
          frozenUntil = new Date(now.getTime() + 60 * 60 * 1000);
          break;
        case '24_hours':
          frozenUntil = new Date(now.getTime() + 24 * 60 * 60 * 1000);
          break;
        case '7_days':
          frozenUntil = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
          break;
        case '30_days':
          frozenUntil = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
          break;
        case 'custom':
          if (!customDate) {
            toast.error('Please select a date and time');
            setLoading(false);
            return;
          }
          frozenUntil = new Date(customDate);
          break;
        case 'indefinite':
          frozenUntil = null;
          break;
        default:
          frozenUntil = new Date(now.getTime() + 60 * 60 * 1000);
      }

      const token = localStorage.getItem('token');
      const freezePayload = {
        reason: reason || 'Temporary account freeze'
      };
      
      if (frozenUntil) {
        freezePayload.frozen_until = frozenUntil.toISOString();
      }
      
      await axios.post(
        `${API}/api/users/${user.id}/freeze`,
        freezePayload,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      toast.success(`${user.email} has been frozen`);
      onOpenChange(false);
      setReason('');
      setDuration('1_hour');
      if (onSuccess) onSuccess();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to freeze user');
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
            <Snowflake className="h-5 w-5 text-blue-600" />
            Freeze User
          </DialogTitle>
          <DialogDescription>
            Temporarily prevent user from accessing the CRM
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-800 font-medium mb-2">
              {user.first_name} {user.last_name}
            </p>
            <p className="text-sm text-blue-700">{user.email}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="duration">Freeze Duration</Label>
            <Select value={duration} onValueChange={setDuration}>
              <SelectTrigger id="duration">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1_hour">1 Hour</SelectItem>
                <SelectItem value="24_hours">24 Hours</SelectItem>
                <SelectItem value="7_days">7 Days</SelectItem>
                <SelectItem value="30_days">30 Days</SelectItem>
                <SelectItem value="custom">Custom Date/Time</SelectItem>
                <SelectItem value="indefinite">Indefinite (until manually unfrozen)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {duration === 'custom' && (
            <div className="space-y-2">
              <Label htmlFor="customDate">Unfreeze Date & Time</Label>
              <Input
                id="customDate"
                type="datetime-local"
                value={customDate}
                onChange={(e) => setCustomDate(e.target.value)}
                required
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="reason">Reason (Optional)</Label>
            <Textarea
              id="reason"
              placeholder="e.g., Security review, Policy violation, etc."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
            />
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
            <p className="font-medium mb-1">⚠️ What happens when frozen:</p>
            <ul className="list-disc list-inside space-y-1 text-xs ml-2">
              <li>User will be immediately logged out</li>
              <li>Cannot access CRM until unfrozen</li>
              <li>Retains all record ownership</li>
              <li>Can be unfrozen manually or automatically</li>
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
            onClick={handleFreeze}
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {loading ? (
              <>
                <Loader className="mr-2 h-4 w-4 animate-spin" />
                Freezing...
              </>
            ) : (
              <>
                <Snowflake className="mr-2 h-4 w-4" />
                Freeze User
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default FreezeUserDialog;
