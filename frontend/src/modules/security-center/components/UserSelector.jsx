/**
 * User Selector Component
 * Select users for permission set assignment
 */
import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { User } from 'lucide-react';

const UserSelector = ({ users, selectedUserId, onSelect, disabled = false }) => {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-slate-700 flex items-center gap-2">
        <User className="h-4 w-4" />
        Select User
      </label>
      <Select value={selectedUserId || ''} onValueChange={onSelect} disabled={disabled}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Choose a user..." />
        </SelectTrigger>
        <SelectContent>
          {users && users.map((user) => (
            <SelectItem key={user.id} value={user.id}>
              <div className="flex items-center justify-between w-full">
                <span>{user.first_name} {user.last_name}</span>
                <span className="text-xs text-slate-500 ml-2">{user.email}</span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};

export default UserSelector;