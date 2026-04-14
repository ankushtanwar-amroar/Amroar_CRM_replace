/**
 * FlowSettingsPanel - Flow settings side panel
 * Extracted from FlowEditorPage.js
 */
import React from 'react';
import { X } from 'lucide-react';
import { toast } from 'sonner';

const FlowSettingsPanel = ({
  isOpen,
  onClose,
  flowType,
  savedFlowType,
  launchMode,
  batchSize,
  setBatchSize
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-[400px] bg-white shadow-xl z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
        <h2 className="text-lg font-semibold text-slate-900">Flow Settings</h2>
        <button
          onClick={onClose}
          className="p-2 hover:bg-slate-100 rounded-md transition-colors"
        >
          <X className="h-5 w-5 text-slate-500" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Flow Type Info */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-900">Flow Type</h3>
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                flowType === 'screen-flow' || savedFlowType === 'screen'
                  ? 'bg-blue-100'
                  : flowType === 'scheduled' || savedFlowType === 'scheduled'
                    ? 'bg-purple-100'
                    : flowType === 'webhook' || savedFlowType === 'webhook'
                      ? 'bg-orange-100'
                      : 'bg-indigo-100'
              }`}>
                <span className="text-lg">
                  {flowType === 'screen-flow' || savedFlowType === 'screen' ? '📱' :
                   flowType === 'scheduled' || savedFlowType === 'scheduled' ? '📅' :
                   flowType === 'webhook' || savedFlowType === 'webhook' ? '🔗' :
                   '⚡'}
                </span>
              </div>
              <div>
                <p className="text-sm font-medium text-slate-900">
                  {flowType === 'screen-flow' || savedFlowType === 'screen' ? 'Screen Flow' :
                   flowType === 'scheduled' || savedFlowType === 'scheduled' ? 'Scheduled Flow' :
                   flowType === 'webhook' || savedFlowType === 'webhook' ? 'Webhook Flow' :
                   'Record-Triggered Flow'}
                </p>
                <p className="text-xs text-slate-500">
                  {flowType === 'screen-flow' || savedFlowType === 'screen'
                    ? 'Interactive user-facing screens'
                    : flowType === 'scheduled' || savedFlowType === 'scheduled'
                      ? 'Runs on a schedule'
                      : flowType === 'webhook' || savedFlowType === 'webhook'
                        ? 'Triggered by external API calls'
                        : 'Triggered when records change'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Launch Mode Info - Only for Screen Flows */}
        {(flowType === 'screen-flow' || savedFlowType === 'screen') && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-900">Launch Mode</h3>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              {launchMode === 'basic' && (
                <>
                  <p className="text-xs text-blue-900 font-medium mb-1">ℹ️ Basic Mode (No Record)</p>
                  <p className="text-xs text-blue-700 mb-2">
                    Flow runs without record context. No system variables created automatically.
                  </p>
                  <ul className="text-xs text-blue-700 space-y-1 ml-4 list-disc">
                    <li>Launched from Home/App Page</li>
                    <li>User creates input variables manually as needed</li>
                  </ul>
                </>
              )}
              {launchMode === 'record_detail' && (
                <>
                  <p className="text-xs text-blue-900 font-medium mb-1">ℹ️ Record Detail Mode</p>
                  <p className="text-xs text-blue-700 mb-2">
                    System variable <code className="bg-blue-100 px-1 rounded font-mono">recordId</code> automatically created and populated at runtime.
                  </p>
                  <ul className="text-xs text-blue-700 space-y-1 ml-4 list-disc">
                    <li>Launched from Record Detail Page</li>
                    <li><code className="bg-blue-100 px-1 rounded font-mono">recordId</code> is read-only and system-managed</li>
                    <li>Object context inferred from record page</li>
                  </ul>
                </>
              )}
              {launchMode === 'list_view' && (
                <>
                  <p className="text-xs text-blue-900 font-medium mb-1">ℹ️ List View Mode (Bulk)</p>
                  <p className="text-xs text-blue-700 mb-2">
                    System variables <code className="bg-blue-100 px-1 rounded font-mono">recordIds</code> and 
                    <code className="bg-blue-100 px-1 rounded font-mono ml-1">selectedCount</code> automatically created.
                  </p>
                  <ul className="text-xs text-blue-700 space-y-1 ml-4 list-disc">
                    <li>Launched from List View bulk action</li>
                    <li><code className="bg-blue-100 px-1 rounded font-mono">recordIds</code> contains all selected record IDs</li>
                    <li><code className="bg-blue-100 px-1 rounded font-mono">selectedCount</code> shows number of selected records</li>
                    <li>Object context inferred from list view</li>
                  </ul>
                </>
              )}
            </div>
          </div>
        )}

        {/* Batch Size Setting */}
        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1">
              Batch Size (Records per Execution)
            </label>
            <input
              type="number"
              min="1"
              max="500"
              value={batchSize}
              onChange={(e) => {
                const value = parseInt(e.target.value);
                if (!isNaN(value)) {
                  setBatchSize(Math.max(1, Math.min(500, value)));
                }
              }}
              className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          {/* Helper Text */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-xs text-blue-900 font-medium mb-1">
              ℹ️ Salesforce Batch Processing
            </p>
            <p className="text-xs text-blue-700 mb-2">
              Controls how many records are processed per execution batch. 
              Smaller sizes reduce load but increase total runs.
            </p>
            <p className="text-xs text-blue-700 font-medium mb-1">Applies to:</p>
            <ul className="text-xs text-blue-700 space-y-1 ml-4">
              <li>✅ Trigger Flows</li>
              <li>✅ Scheduled Flows</li>
              <li>✅ Webhook Flows (multi-record)</li>
              <li>❌ Screen Flows (user-driven)</li>
            </ul>
          </div>

          {/* Warning for large batch sizes */}
          {batchSize > 200 && (
            <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-3">
              <p className="text-xs text-yellow-900 font-medium mb-1">
                ⚠️ Performance Warning
              </p>
              <p className="text-xs text-yellow-800">
                Batch size {batchSize} exceeds recommended maximum of 200. 
                Large batch sizes may impact performance or hit API limits.
              </p>
            </div>
          )}

          {/* Info about batching */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
            <p className="text-xs text-slate-700 font-medium mb-2">
              📊 Batch Calculation Example:
            </p>
            <div className="text-xs text-slate-600 space-y-1">
              <div className="flex justify-between">
                <span>1,200 records</span>
                <span className="font-mono">÷</span>
              </div>
              <div className="flex justify-between border-b border-slate-300 pb-1">
                <span>Batch size {batchSize}</span>
                <span className="font-mono">=</span>
              </div>
              <div className="flex justify-between font-medium text-indigo-600 pt-1">
                <span>{Math.ceil(1200 / batchSize)} execution batches</span>
              </div>
            </div>
          </div>

          {/* Range Info */}
          <div className="text-xs text-slate-500 space-y-1">
            <p>• Minimum: 1 record per batch</p>
            <p>• Maximum: 500 records per batch</p>
            <p>• Recommended: 50-200 records</p>
            <p>• Default: 50 records</p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2">
        <button
          onClick={onClose}
          className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors"
        >
          Close
        </button>
        <button
          onClick={() => {
            onClose();
            toast.success(`Batch size set to ${batchSize} records`);
          }}
          className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 transition-colors"
        >
          Apply Settings
        </button>
      </div>
    </div>
  );
};

export default FlowSettingsPanel;
