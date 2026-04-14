/**
 * Share Row Component
 * Single share entry
 */
import React from 'react';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { X, User, Users } from 'lucide-react';

const ShareRow = ({ share, onRevoke }) => {
  return (
    <div className="flex items-center justify-between p-3 bg-slate-50 rounded hover:bg-slate-100">
      <div className="flex items-center space-x-3">
        {share.shared_with_type === 'user' ? (
          <User className="h-4 w-4 text-slate-400" />
        ) : (
          <Users className="h-4 w-4 text-slate-400" />
        )}
        <div>
          <p className="text-sm font-medium text-slate-900">
            {share.shared_with_type === 'user' ? 'User' : 'Role'}: {share.shared_with_id}
          </p>
          <p className="text-xs text-slate-500">Access: {share.access_level}</p>
        </div>
      </div>
      <div className="flex items-center space-x-2">
        <Badge variant="outline" className={share.access_level === 'edit' ? 'bg-green-50 text-green-700' : 'bg-blue-50 text-blue-700'}>
          {share.access_level}
        </Badge>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onRevoke(share.id)}
          className="text-red-600 hover:text-red-700 hover:bg-red-50"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};

export default ShareRow;