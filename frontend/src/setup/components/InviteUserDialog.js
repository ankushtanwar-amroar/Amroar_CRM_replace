import React, { useState, useEffect } from 'react';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Loader, Mail, AlertCircle } from 'lucide-react';
import { toast } from 'react-hot-toast';

const API = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';

const InviteUserDialog = ({ open, onOpenChange, onSuccess, isDocFlowOnly = false }) => {
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [roleId, setRoleId] = useState('none'); // Default to "None" - role is optional
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      fetchRoles();
    }
  }, [open]);

  const fetchRoles = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API}/api/roles`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setRoles(response.data);
    } catch (error) {
      console.error('Error fetching roles:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const token = localStorage.getItem('token');

      await axios.post(
        `${API}/api/users/invite`,
        {
          email: email,
          first_name: firstName,
          last_name: lastName,
          // Send null if "none" is selected - role is optional
          role_id: roleId === 'none' ? null : roleId
        },
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      toast.success(`Invitation sent to ${email}`);

      setEmail('');
      setFirstName('');
      setLastName('');
      setRoleId('none');

      onOpenChange(false);
      if (onSuccess) onSuccess();

    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to send invitation');
    } finally {
      setLoading(false);
    }
  };

  const selectedRole = roleId === 'none' ? null : roles.find(r => r.id === roleId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95%] sm:max-w-lg p-0 rounded-xl overflow-hidden">

        {/* Header */}
        <DialogHeader className="px-6 py-3 border-b bg-slate-50">
          <DialogTitle className="flex items-center gap-2 text-lg font-semibold">
            <Mail className="h-5 w-5 text-indigo-600" />
            Invite User
          </DialogTitle>

          <DialogDescription className="text-sm text-slate-500">
            Send an invitation email to add a new user to your organization
          </DialogDescription>
        </DialogHeader>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">

          {/* Name Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="firstName">First Name</Label>
              <Input
                id="firstName"
                placeholder="John"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
                disabled={loading}
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="lastName">Last Name</Label>
              <Input
                id="lastName"
                placeholder="Doe"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
                disabled={loading}
              />
            </div>
          </div>

          {/* Email */}
          <div className="space-y-1">
            <Label htmlFor="email">Email Address</Label>
            <Input
              id="email"
              type="email"
              placeholder="john.doe@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
            />
          </div>

          {/* Role - Only shown for CRM tenants */}
          {!isDocFlowOnly && (
          <div className="space-y-2">
            <Label htmlFor="role">Role (Optional)</Label>

            <Select value={roleId} onValueChange={setRoleId} disabled={loading}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select role">
                  {roleId === 'none' ? 'None (No Role)' : selectedRole?.name || "Select role"}
                </SelectValue>
              </SelectTrigger>

              <SelectContent className="max-h-60 overflow-y-auto">
                {/* None option - default */}
                <SelectItem
                  value="none"
                  className="flex flex-col items-start gap-1 py-3"
                >
                  <div className="font-medium text-sm">
                    None (No Role)
                  </div>
                  <div className="text-xs text-slate-500 leading-snug">
                    User will not be part of role hierarchy
                  </div>
                </SelectItem>
                
                {/* Separator */}
                <div className="border-t my-1" />
                
                {/* Role options */}
                {roles.map((role) => (
                  <SelectItem
                    key={role.id}
                    value={role.id}
                    className="flex flex-col items-start gap-1 py-3"
                  >
                    <div className="font-medium text-sm">
                      {role.name}
                    </div>

                    {role.description && (
                      <div className="text-xs text-slate-500 leading-snug line-clamp-2">
                        {role.description}
                      </div>
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Info about role */}
            <div className="flex items-start gap-2 text-xs text-blue-600 bg-blue-50 p-2 rounded">
              <AlertCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
              <span>
                Roles control record visibility via hierarchy. Object permissions come from Permission Sets.
              </span>
            </div>
          </div>
          )}

          {/* Error */}
          {error && (
            <div className="border border-red-200 bg-red-50 text-red-600 text-sm px-3 py-2 rounded-md">
              {error}
            </div>
          )}

          {/* Footer */}
          <DialogFooter className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-2">

            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>

            <Button
              type="submit"
              disabled={loading}
              className="w-full sm:w-auto"
            >
              {loading ? (
                <>
                  <Loader className="mr-2 h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : (
                'Send Invitation'
              )}
            </Button>

          </DialogFooter>

        </form>
      </DialogContent>
    </Dialog>
  );
};

export default InviteUserDialog;