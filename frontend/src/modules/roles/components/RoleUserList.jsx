/**
 * Role User List Component
 * List users assigned to a role
 */
import React from 'react';
import { Users } from 'lucide-react';
import { Badge } from '../../../components/ui/badge';

const RoleUserList = ({ users, roleName }) => {
  if (!users || users.length === 0) {
    return (
      <div className="text-center py-6 text-slate-500 text-sm">
        <Users className="h-8 w-8 mx-auto mb-2 text-slate-300" />
        <p>No users assigned to this role</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {users.map((user) => (
        <div key={user.id} className="flex items-center justify-between p-3 bg-slate-50 rounded hover:bg-slate-100">
          <div>
            <p className="font-medium text-sm">
              {user.first_name} {user.last_name}
            </p>
            <p className="text-xs text-slate-500">{user.email}</p>
          </div>
          <Badge variant="outline">{roleName}</Badge>
        </div>
      ))}
    </div>
  );
};

export default RoleUserList;