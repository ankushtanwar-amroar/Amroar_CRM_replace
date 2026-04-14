/**
 * Screen Config Panel
 * Extracted from NodeConfigPanel.js - handles screen flow configuration
 */
import React from 'react';
import { Label } from '../../../../components/ui/label';
import { Input } from '../../../../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../../components/ui/select';
import { Button } from '../../../../components/ui/button';
import { Dialog, DialogContent } from '../../../../components/ui/dialog';
import { Monitor } from 'lucide-react';
import ScreenBuilder from '../ScreenBuilder';

const ScreenConfigPanel = ({
  config,
  setConfig,
  handleConfigChange,
  node,
  nodes,
  edges,
  triggers,
  objectsList,
  flowType,
  launchMode,
  screenFlowObject,
  showScreenBuilder,
  setShowScreenBuilder,
  onUpdate,
  checkIfFirstScreen
}) => {
  // Determine if this is the first screen (for Associated Object visibility)
  const isFirstScreen = checkIfFirstScreen(node.id, nodes, edges);
  
  return (
    <div className="space-y-4">
      {/* Screen Flow Info */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-lg p-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
            <Monitor className="w-6 h-6 text-white" />
          </div>
          <div>
            <p className="text-sm text-blue-900 font-semibold">Screen Flow Builder</p>
            <p className="text-xs text-blue-700">Design interactive screens with drag-and-drop</p>
          </div>
        </div>
      </div>

      {/* Object Selection - ONLY show for first screen AND only if NOT a Screen Flow with any launch mode */}
      {isFirstScreen && flowType !== 'screen-flow' ? (
        <div className="space-y-2">
          <Label className="text-sm font-medium text-gray-700">Associated Object (Optional)</Label>
          <Select
            value={config.associatedObject || '__none__'}
            onValueChange={(value) => handleConfigChange('associatedObject', value === '__none__' ? '' : value)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select object to associate with screen" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">None</SelectItem>
              {objectsList.map(obj => (
                <SelectItem key={obj.name} value={obj.name}>{obj.label || obj.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-gray-500">
            Object context for this Screen Flow. Defined once on the first screen.
          </p>
        </div>
      ) : flowType === 'screen-flow' && launchMode === 'basic' ? (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <p className="text-xs text-blue-900 font-medium mb-1">
            ℹ️ Basic Mode: No Object Required
          </p>
          <p className="text-xs text-blue-700">
            This flow runs without record context (Home/App Page). No object association is required.
          </p>
        </div>
      ) : flowType === 'screen-flow' && launchMode === 'record_detail' ? (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <p className="text-xs text-blue-900 font-medium mb-1">
            ℹ️ Record Detail Mode: Object Inferred from Context
          </p>
          <p className="text-xs text-blue-700">
            Object is automatically inferred from the record page where this flow is launched. 
            The <code className="bg-blue-100 px-1 rounded font-mono">recordId</code> system variable is auto-populated.
          </p>
        </div>
      ) : flowType === 'screen-flow' && launchMode === 'list_view' ? (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <p className="text-xs text-blue-900 font-medium mb-1">
            ℹ️ List View Mode: Object Inferred from Context
          </p>
          <p className="text-xs text-blue-700">
            Object is automatically inferred from the list view where this flow is launched. 
            The <code className="bg-blue-100 px-1 rounded font-mono">recordIds</code> system variable contains all selected record IDs.
          </p>
        </div>
      ) : !isFirstScreen ? (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <p className="text-xs text-blue-900 font-medium mb-1">
            ℹ️ Salesforce Behavior: Object Inherited from First Screen
          </p>
          <p className="text-xs text-blue-700">
            The associated object is defined on the first screen and automatically inherited by all subsequent screens in this flow.
          </p>
        </div>
      ) : null}

      {/* Screen Flow Object - Read-only indicator for Record Detail/List View modes */}
      {flowType === 'screen-flow' && (launchMode === 'record_detail' || launchMode === 'list_view') && isFirstScreen && screenFlowObject && (
        <div className="space-y-2">
          <Label className="text-sm font-medium text-slate-700">
            Associated Object
          </Label>
          <div className="relative">
            <Input
              value={screenFlowObject}
              readOnly
              className="bg-gray-50 text-gray-700 font-medium cursor-not-allowed"
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2">
              <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded font-medium">
                Read-Only
              </span>
            </div>
          </div>
          <p className="text-xs text-gray-500">
            This object was selected when creating the flow and is automatically used for {launchMode === 'record_detail' ? 'single record' : 'multiple records'} context.
          </p>
        </div>
      )}

      {/* Return URL - Optional redirect after screen */}
      <div className="space-y-2">
        <Label className="text-sm font-medium text-slate-700">
          Return URL (Optional)
        </Label>
        <Input
          value={config.return_url || ''}
          onChange={(e) => handleConfigChange('return_url', e.target.value)}
          placeholder="/record/{!varRecordId}"
          className="font-mono text-sm"
        />
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <p className="text-xs text-blue-900 font-medium mb-1">
            ℹ️ Salesforce Behavior: Redirect instead of continuing flow
          </p>
          <p className="text-xs text-blue-700 mb-2">
            If provided, user will be redirected to this URL when clicking "Next" and the flow will terminate.
          </p>
          
          <p className="text-xs text-blue-700 font-medium mb-1">✅ Valid Variable References:</p>
          <ul className="text-xs text-blue-700 space-y-1 ml-4 mb-2">
            <li>• <strong>Screen variables:</strong> <code className="bg-white px-1 rounded">{'{{Screen.email}}'}</code></li>
            <li>• <strong>Flow variables:</strong> <code className="bg-white px-1 rounded">{'{{varLeadId}}'}</code></li>
            <li>• <strong>Action outputs:</strong> <code className="bg-white px-1 rounded">{'{{createdLeadId}}'}</code> (if action executed before this screen)</li>
            <li>• <strong>Trigger context:</strong> <code className="bg-white px-1 rounded">{'{{Trigger.Lead.Id}}'}</code> (Trigger Flows only)</li>
          </ul>

          <p className="text-xs text-blue-700 font-medium mb-1">📋 Examples:</p>
          <ul className="text-xs text-blue-700 space-y-1 ml-4">
            <li>• <code className="bg-white px-1 rounded">/record/{'{{createdLeadId}}'}</code></li>
            <li>• <code className="bg-white px-1 rounded">https://example.com/thank-you?email={'{{Screen.email}}'}</code></li>
            <li>• <code className="bg-white px-1 rounded">/lightning/r/Lead/{'{{Trigger.Lead.Id}}'}/view</code></li>
          </ul>

          <div className="mt-2 pt-2 border-t border-blue-300">
            <p className="text-xs text-blue-900 font-medium mb-1">
              💡 To redirect to a newly created record:
            </p>
            <ol className="text-xs text-blue-700 space-y-1 ml-4">
              <li>1. Add "Create Record" action BEFORE this screen</li>
              <li>2. Store record ID in a flow variable (e.g., createdLeadId)</li>
              <li>3. Use that variable in Return URL: <code className="bg-white px-1 rounded">/record/{'{{createdLeadId}}'}</code></li>
            </ol>
          </div>
        </div>

        {/* Warning about invalid references */}
        {config.return_url && config.return_url.includes('NewRecord') && (
          <div className="bg-red-50 border border-red-300 rounded-lg p-3">
            <p className="text-xs text-red-900 font-medium mb-1">
              ⚠️ Invalid Variable Reference
            </p>
            <p className="text-xs text-red-800">
              "NewRecord" is not automatically available. Store the record ID in a variable first using a Create Record action.
            </p>
          </div>
        )}
      </div>

      {/* Screen Summary */}
      {config.screenTitle && (
        <div className="bg-white border-2 border-slate-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-semibold text-slate-900">Current Screen</h4>
            <span className="text-xs text-slate-500">{(config.fields || []).length} component{(config.fields || []).length !== 1 ? 's' : ''}</span>
          </div>
          <p className="text-base font-medium text-slate-800 mb-1">{config.screenTitle}</p>
          {config.screenDescription && (
            <p className="text-xs text-slate-600">{config.screenDescription}</p>
          )}
          {config.associatedObject && (
            <div className="mt-2">
              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                Object: {config.associatedObject}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Open Screen Builder Button */}
      <Button
        type="button"
        onClick={() => setShowScreenBuilder(true)}
        className="w-full bg-blue-600 hover:bg-blue-700 h-12 text-base font-medium"
      >
        <Monitor className="w-5 h-5 mr-2" />
        {config.screenTitle ? 'Edit Screen in Builder' : 'Open Screen Builder'}
      </Button>

      {/* Quick Info */}
      <div className="bg-gradient-to-r from-gray-50 to-slate-50 border border-slate-200 rounded-lg p-3">
        <p className="text-xs font-semibold text-slate-700 mb-2">💡 Screen Builder Features:</p>
        <ul className="text-xs text-slate-600 space-y-1">
          <li>• Drag & drop components from palette</li>
          <li>• Reorder fields with visual editor</li>
          <li>• Configure properties in real-time</li>
          <li>• Preview responsive layouts</li>
          <li>• Available fields: Text, Number, Email, Phone, Date, Checkbox, Dropdown, Textarea</li>
        </ul>
      </div>

      {/* Screen Builder Modal - MANDATORY: Fixed viewport height */}
      {showScreenBuilder && (
        <Dialog open={showScreenBuilder} onOpenChange={setShowScreenBuilder}>
          <DialogContent 
            className="max-w-[95vw] p-0 [&>button]:hidden" 
            style={{ height: '95vh', maxHeight: '95vh', display: 'flex', flexDirection: 'column' }}
          >
            <ScreenBuilder
              node={node}
              nodes={nodes}
              onUpdate={(updatedConfig) => {
                console.log('📥 ===== NODE CONFIG: RECEIVED FROM SCREEN BUILDER =====');
                console.log('📥 Timestamp:', new Date().toISOString());
                console.log('📥 Updated config:', updatedConfig);
                
                const fieldsArray = updatedConfig.fields || [];
                const toastCount = fieldsArray.filter(f => f.type === 'Toast').length;
                const fieldCount = fieldsArray.filter(f => f.type !== 'Toast').length;
                
                console.log('📥 Components breakdown:', {
                  total: fieldsArray.length,
                  fields: fieldCount,
                  toasts: toastCount
                });
                
                if (toastCount > 0) {
                  console.log('📥 ✅ Toast components received:', fieldsArray.filter(f => f.type === 'Toast').map(t => ({
                    id: t.id,
                    type: t.type,
                    title: t.title,
                    message: t.message,
                    variant: t.variant
                  })));
                } else {
                  console.warn('📥 ⚠️ NO TOAST COMPONENTS received from Screen Builder!');
                }
                
                console.log('📥 Calling setConfig...');
                try {
                  setConfig(updatedConfig);
                  console.log('📥 ✅ setConfig completed successfully');
                } catch (error) {
                  console.error('📥 ❌ setConfig FAILED:', error);
                  throw error;
                }
                
                // CRITICAL FIX: Update the node state immediately so Toast persists
                console.log('📥 CRITICAL FIX: Updating node state with screen config...');
                try {
                  onUpdate(node.id, updatedConfig, node.data?.label || 'Screen');
                  console.log('📥 ✅ Node state updated successfully - Toast will persist');
                } catch (updateError) {
                  console.error('📥 ❌ Node state update FAILED:', updateError);
                  throw updateError;
                }
                
                console.log('📥 Closing Screen Builder...');
                setShowScreenBuilder(false);
                console.log('📥 ===== END NODE CONFIG RECEIVED =====');
              }}
              onClose={() => setShowScreenBuilder(false)}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

export default ScreenConfigPanel;
