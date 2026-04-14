/**
 * ReadOnlyBanner - Banner displayed when flow is in read-only mode
 * Extracted from FlowEditorPage.js
 */
import React from 'react';
import { Plus } from 'lucide-react';
import { Button } from '../../../components/ui/button';

const ReadOnlyBanner = ({
  isReadOnly,
  flowVersion,
  flowStatus,
  handleCreateNewVersion
}) => {
  if (!isReadOnly) return null;

  return (
    <div className="bg-yellow-50 border-b-2 border-yellow-400 px-6 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="bg-yellow-400 rounded-full p-1">
            <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-yellow-900">
              Read-Only Mode: Version {flowVersion} ({flowStatus === 'active' ? 'Active' : 'Archived'})
            </p>
            <p className="text-xs text-yellow-700">
              This version cannot be edited. {flowStatus === 'active' ? 'Create a new version to make changes.' : 'Archived versions are permanently read-only.'}
            </p>
          </div>
        </div>
        {flowStatus === 'active' && (
          <Button
            onClick={handleCreateNewVersion}
            className="bg-indigo-600 hover:bg-indigo-700 text-white"
            size="sm"
          >
            <Plus className="h-4 w-4 mr-1" />
            Create New Version
          </Button>
        )}
      </div>
    </div>
  );
};

export default ReadOnlyBanner;
