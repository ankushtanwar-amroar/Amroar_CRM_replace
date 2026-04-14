/**
 * Record Share Page
 * Share individual record
 */
import React, { useState } from 'react';
import { Share2, Plus } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import ShareDialog from '../components/ShareDialog';
import ShareList from '../components/ShareList';
import { useRecordSharing } from '../hooks/useRecordSharing';
import { toast } from 'react-hot-toast';

// This component can be embedded in record detail views
const RecordSharePage = ({ objectName, recordId }) => {
  const [showShareDialog, setShowShareDialog] = useState(false);
  const { shares, users, roles, loading, shareRecord, revokeShare } = useRecordSharing(objectName, recordId);

  const handleShare = async (shareData) => {
    try {
      await shareRecord(shareData);
      return true;
    } catch (error) {
      throw error;
    }
  };

  const handleRevoke = async (shareId) => {
    try {
      await revokeShare(shareId);
      toast.success('Share revoked');
    } catch (error) {
      toast.error('Failed to revoke share');
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Share2 className="h-5 w-5 text-slate-600" />
          <h3 className="font-semibold text-slate-900">Sharing</h3>
        </div>
        <Button size="sm" onClick={() => setShowShareDialog(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Share
        </Button>
      </div>

      {/* Share List */}
      <ShareList shares={shares} onRevoke={handleRevoke} />

      {/* Share Dialog */}
      <ShareDialog
        open={showShareDialog}
        onOpenChange={setShowShareDialog}
        users={users}
        roles={roles}
        onShare={handleShare}
      />
    </div>
  );
};

export default RecordSharePage;