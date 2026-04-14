/**
 * Share List Component
 * Lists all shares for a record
 */
import React from 'react';
import ShareRow from './ShareRow';
import { Share2 } from 'lucide-react';

const ShareList = ({ shares, onRevoke }) => {
  if (!shares || shares.length === 0) {
    return (
      <div className="text-center py-8 text-slate-500">
        <Share2 className="h-10 w-10 mx-auto mb-2 text-slate-300" />
        <p>No shares for this record</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {shares.map((share) => (
        <ShareRow key={share.id} share={share} onRevoke={onRevoke} />
      ))}
    </div>
  );
};

export default ShareList;