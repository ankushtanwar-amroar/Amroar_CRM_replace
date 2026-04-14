/**
 * ActivityPropertyPanel - Configuration panel for Activity component in Page Builder
 * Shows in the right sidebar when Activity component is selected
 */
import React from 'react';
import { 
  Calendar, List, Settings, Info, SortDesc, Eye, Users, Sparkles
} from 'lucide-react';
import { Switch } from '../../../components/ui/switch';
import { Badge } from '../../../components/ui/badge';
import ActivityTypesSelector from './ActivityTypesSelector';
import { createDefaultActivityConfig, hasActivityConfig } from '../config/activityConfigDefaults';

const ActivityPropertyPanel = ({
  component,
  onUpdate,
  className = '',
}) => {
  // Get current config or create default
  const config = component.config || {};
  const activityTypes = config.activityTypes || [];
  const maxVisibleButtons = config.maxVisibleButtons || 3;
  
  // Update config helper
  const updateConfig = (updates) => {
    onUpdate({
      ...component,
      config: {
        ...config,
        ...updates,
      },
    });
  };
  
  // Update activity types
  const handleActivityTypesChange = (newTypes) => {
    updateConfig({ activityTypes: newTypes });
  };

  // Update max visible buttons
  const handleMaxVisibleButtonsChange = (value) => {
    updateConfig({ maxVisibleButtons: value });
  };
  
  // Quick stats
  const enabledButtonCount = activityTypes.filter(t => t.newButtonEnabled).length;
  const enabledTimelineCount = activityTypes.filter(t => t.enabledInTimeline).length;
  
  return (
    <div className={`space-y-4 ${className}`} data-testid="activity-property-panel">
      {/* Info Box */}
      <div className="p-3 bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg flex items-start gap-3 border border-blue-100">
        <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center flex-shrink-0 shadow-sm">
          <Calendar className="h-4 w-4 text-white" />
        </div>
        <div>
          <p className="text-xs font-semibold text-slate-800">Activity Timeline</p>
          <p className="text-[11px] text-slate-600 mt-0.5">
            Combined feed of activities with action buttons to create new records.
          </p>
          {activityTypes.length > 0 && (
            <div className="flex items-center gap-2 mt-2">
              <Badge variant="secondary" className="text-[10px] bg-white">
                {activityTypes.length} types
              </Badge>
              <Badge variant="secondary" className="text-[10px] bg-white text-blue-600">
                {enabledButtonCount} buttons
              </Badge>
              <Badge variant="secondary" className="text-[10px] bg-white text-green-600">
                {enabledTimelineCount} visible
              </Badge>
            </div>
          )}
        </div>
      </div>
      
      {/* Activity Types Section */}
      <div className="border-t pt-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-6 h-6 bg-slate-100 rounded flex items-center justify-center">
            <List className="h-3.5 w-3.5 text-slate-600" />
          </div>
          <div className="flex-1">
            <span className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Activity Types</span>
          </div>
        </div>
        <p className="text-[11px] text-slate-500 mb-3 leading-relaxed">
          Configure which activity types appear in the timeline, which buttons to show, and customize fields for each type.
        </p>
        <ActivityTypesSelector
          activityTypes={activityTypes}
          onChange={handleActivityTypesChange}
          maxVisibleButtons={maxVisibleButtons}
          onMaxVisibleButtonsChange={handleMaxVisibleButtonsChange}
        />
      </div>
      
      {/* Display Settings */}
      <div className="border-t pt-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-6 h-6 bg-slate-100 rounded flex items-center justify-center">
            <Settings className="h-3.5 w-3.5 text-slate-600" />
          </div>
          <span className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Display Settings</span>
        </div>
        
        <div className="space-y-2">
          {/* Sort Order */}
          <div className="flex items-center justify-between p-2.5 bg-white rounded-lg border border-slate-100 hover:border-slate-200 transition-colors">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 bg-orange-100 rounded-full flex items-center justify-center">
                <SortDesc className="h-3.5 w-3.5 text-orange-600" />
              </div>
              <div>
                <span className="text-xs font-medium text-slate-700">Sort Order</span>
                <p className="text-[10px] text-slate-500">Activity display order</p>
              </div>
            </div>
            <select
              value={config.sortOrder || 'desc'}
              onChange={(e) => updateConfig({ sortOrder: e.target.value })}
              className="h-8 text-xs border rounded-md px-2 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              data-testid="sort-order-select"
            >
              <option value="desc">Newest First</option>
              <option value="asc">Oldest First</option>
            </select>
          </div>
          
          {/* Show Owner */}
          <div className="flex items-center justify-between p-2.5 bg-white rounded-lg border border-slate-100 hover:border-slate-200 transition-colors">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 bg-teal-100 rounded-full flex items-center justify-center">
                <Users className="h-3.5 w-3.5 text-teal-600" />
              </div>
              <div>
                <span className="text-xs font-medium text-slate-700">Show Owner</span>
                <p className="text-[10px] text-slate-500">Display activity owner name</p>
              </div>
            </div>
            <Switch
              checked={config.showOwner !== false}
              onCheckedChange={(val) => updateConfig({ showOwner: val })}
              data-testid="show-owner-toggle"
            />
          </div>
          
          {/* Show Status */}
          <div className="flex items-center justify-between p-2.5 bg-white rounded-lg border border-slate-100 hover:border-slate-200 transition-colors">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 bg-indigo-100 rounded-full flex items-center justify-center">
                <Eye className="h-3.5 w-3.5 text-indigo-600" />
              </div>
              <div>
                <span className="text-xs font-medium text-slate-700">Show Status</span>
                <p className="text-[10px] text-slate-500">Display activity status badge</p>
              </div>
            </div>
            <Switch
              checked={config.showStatus !== false}
              onCheckedChange={(val) => updateConfig({ showStatus: val })}
              data-testid="show-status-toggle"
            />
          </div>
        </div>
      </div>
      
      {/* Help Section */}
      <div className="border-t pt-4">
        <div className="p-3 bg-gradient-to-r from-slate-50 to-blue-50/30 rounded-lg text-[11px] text-slate-600 space-y-1.5 border border-slate-100">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="h-3.5 w-3.5 text-blue-500" />
            <p className="font-semibold text-slate-700">Tips</p>
          </div>
          <p>• Drag activity types to reorder button display</p>
          <p>• Click on activity type to configure fields</p>
          <p>• Extra buttons appear in &quot;More&quot; dropdown</p>
          <p>• New activities auto-link to the current record</p>
          <p>• Timeline updates after creating new activities</p>
        </div>
      </div>
    </div>
  );
};

export default ActivityPropertyPanel;
