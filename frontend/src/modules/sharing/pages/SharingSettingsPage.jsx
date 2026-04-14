/**
 * Sharing Settings Page
 * Salesforce-style OWD configuration
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Settings, RefreshCw, ArrowLeft } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import OWDTable from '../components/OWDTable';
import { useSharingSettings } from '../hooks/useSharingSettings';
import { toast } from 'react-hot-toast';

const SharingSettingsPage = () => {
  const navigate = useNavigate();
  const { settings, loading, updateOWD, refresh } = useSharingSettings();

  const handleUpdate = async (objectName, newSettings) => {
    try {
      await updateOWD(objectName, newSettings);
      toast.success('Sharing settings updated');
    } catch (error) {
      toast.error('Failed to update sharing settings');
    }
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header with Back Button */}
      <div className="flex justify-between">
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => navigate('/setup')}
            className="flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors"
            data-testid="back-to-setup-btn"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="text-sm font-medium">Back to Setup</span>
          </button>
          <div className="h-8 w-px bg-slate-300" />
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
              <Settings className="h-5 w-5 text-indigo-600" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-slate-900">Sharing Settings</h1>
              <p className="text-sm text-slate-500">Configure organization-wide defaults per object</p>
            </div>
          </div>
        </div>
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={refresh}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Action Button */}

      {/* OWD Table */}
      <div className="bg-white border rounded-lg shadow-sm overflow-hidden">
        <div className="px-6 py-4 bg-slate-50 border-b">
          <h2 className="font-semibold text-slate-900">Organization-Wide Defaults</h2>
          <p className="text-sm text-slate-500">Set default access level for each object type</p>
        </div>
        <OWDTable settings={settings} onUpdate={handleUpdate} loading={loading} />
      </div>

      {/* Legend */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
        <p className="font-medium mb-2">📖 Access Level Definitions</p>
        <ul className="space-y-1 text-xs">
          <li><strong>Private:</strong> Only record owner can access (sharing required for others)</li>
          <li><strong>Public Read Only:</strong> All users can view records</li>
          <li><strong>Public Read/Write:</strong> All users can view and edit records</li>
        </ul>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
        <p className="font-medium mb-1">ℹ️ Grant Access Using Hierarchies</p>
        <p>When enabled, users higher in the role hierarchy automatically have access to records owned by users below them. Disable for objects that should only be visible to the owner.</p>
      </div>
    </div>
  );
};

export default SharingSettingsPage;