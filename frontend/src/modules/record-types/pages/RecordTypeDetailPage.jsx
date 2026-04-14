/**
 * RecordTypeDetailPage Component
 * Detailed configuration page for a single record type
 * Includes tabs for Field Visibility and Settings
 * Note: Dependent Picklists have been moved to Fields & Relationships section
 */
import React, { useState } from 'react';
import { ArrowLeft, Type, Eye, Settings } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../../components/ui/tabs';

const RecordTypeDetailPage = ({ 
  objectName, 
  recordTypeId, 
  recordType,
  onBack,
  objectFields = []
}) => {
  const [activeTab, setActiveTab] = useState('visibility');

  return (
    <div className="space-y-6">
      {/* Header with Back Button */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Record Types
        </Button>
      </div>

      {/* Record Type Header */}
      <div className="flex items-center space-x-3">
        <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center">
          <Type className="h-6 w-6 text-indigo-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {recordType?.type_name || 'Record Type'}
          </h1>
          <p className="text-sm text-slate-500">
            Configure settings for this record type
          </p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="bg-slate-100">
          <TabsTrigger value="visibility" className="gap-2">
            <Eye className="h-4 w-4" />
            Field Visibility
          </TabsTrigger>
          <TabsTrigger value="settings" className="gap-2">
            <Settings className="h-4 w-4" />
            Settings
          </TabsTrigger>
        </TabsList>

        {/* Field Visibility Tab */}
        <TabsContent value="visibility" className="space-y-4">
          <div className="bg-white border rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-4">Field Visibility</h3>
            <p className="text-sm text-slate-500 mb-4">
              Configure which fields are visible when creating or editing records of this type.
            </p>
            
            {/* Existing field visibility config would go here */}
            <div className="text-sm text-slate-400">
              Field visibility is configured in the Record Type edit dialog.
            </div>
          </div>
        </TabsContent>

        {/* Settings Tab */}
        <TabsContent value="settings" className="space-y-4">
          <div className="bg-white border rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-4">Record Type Settings</h3>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-slate-700">Name</label>
                <p className="text-slate-900">{recordType?.type_name}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700">Description</label>
                <p className="text-slate-600">{recordType?.description || 'No description'}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700">Status</label>
                <p className={recordType?.is_active ? 'text-emerald-600' : 'text-slate-500'}>
                  {recordType?.is_active ? 'Active' : 'Inactive'}
                </p>
              </div>
            </div>
          </div>
          
          {/* Info box about dependent picklists */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
            <p className="font-medium mb-1">ℹ️ Looking for Dependent Picklists?</p>
            <p className="text-xs">
              Dependent picklist configuration has been moved to <strong>Fields & Relationships → Dependencies</strong> tab in the Object Manager sidebar.
            </p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default RecordTypeDetailPage;
