/**
 * FlowEditorToolbar - Header toolbar for the Flow Editor
 * Extracted from FlowEditorPage.js
 */
import React from 'react';
import { ArrowLeft, Save, Play, Settings, Plus, Activity, Sparkles, Eye } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';

const FlowEditorToolbar = ({
  // Navigation
  navigate,
  flowId,
  
  // Flow metadata
  flowName,
  setFlowName,
  flowStatus,
  flowVersion,
  flowType,
  savedFlowType,
  
  // State flags
  isReadOnly,
  saving,
  
  // Panel toggles
  setShowAIAssistant,
  setShowLogsPanel,
  setShowFlowSettingsPanel,
  setShowInputVariablesPanel,
  setShowPreview,
  
  // Actions
  handleSave,
  handleSaveAsNewVersion,
  handleCreateNewVersion,
  handleRun,
  
  // Screen flow detection
  nodes
}) => {
  // Helper to check if this is a screen flow
  const isScreenFlow = () => {
    const normalize = (val) => String(val || '').toLowerCase().trim();
    const flowTypeNorm = normalize(flowType);
    const savedTypeNorm = normalize(savedFlowType);
    
    const isScreenByType = ['screen', 'screen_flow', 'screen-flow', 'screenflow'].some(t => 
      flowTypeNorm.includes(t) || savedTypeNorm.includes(t)
    );
    
    const hasScreenNode = nodes.some(n => {
      const nodeType = normalize(n?.type || n?.data?.nodeType || '');
      return ['screen', 'start_screen', 'startscreen', 'screennode'].some(t => 
        nodeType.includes(t)
      );
    });
    
    return isScreenByType || hasScreenNode;
  };

  return (
    <div className="flex items-center justify-between px-6 py-3 border-b border-slate-200 bg-white shadow-sm">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          onClick={() => navigate('/flows')}
          className="hover:bg-slate-100"
        >
          <ArrowLeft className="h-5 w-5 mr-2" />
          Back to Flows
        </Button>

        <div className="h-8 w-px bg-slate-200" />

        <div className="flex items-center gap-3">
          <Input
            value={flowName}
            onChange={(e) => setFlowName(e.target.value)}
            className="text-xl font-semibold min-w-[300px] border-0 shadow-none focus-visible:ring-0 px-0"
            placeholder="Untitled Flow"
            readOnly={isReadOnly}
          />
          
          {/* Version Badge */}
          {flowVersion && (
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${
              flowStatus === 'active' 
                ? 'bg-green-100 text-green-700' 
                : flowStatus === 'archived'
                  ? 'bg-gray-100 text-gray-700'
                  : 'bg-yellow-100 text-yellow-700'
            }`}>
              v{flowVersion} ({flowStatus})
            </span>
          )}
          
          {/* Flow Type Badge */}
          {flowType && (
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${
              flowType === 'screen-flow' || savedFlowType === 'screen'
                ? 'bg-blue-100 text-blue-700'
                : flowType === 'scheduled' || savedFlowType === 'scheduled'
                  ? 'bg-purple-100 text-purple-700'
                  : flowType === 'webhook' || savedFlowType === 'webhook'
                    ? 'bg-orange-100 text-orange-700'
                    : 'bg-indigo-100 text-indigo-700'
            }`}>
              {flowType === 'screen-flow' || savedFlowType === 'screen' ? 'Screen Flow' :
               flowType === 'scheduled' || savedFlowType === 'scheduled' ? 'Scheduled' :
               flowType === 'webhook' || savedFlowType === 'webhook' ? 'Webhook' :
               'Record-Triggered'}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* AI Assistant Button */}
        {!isReadOnly && (
          <Button
            onClick={() => setShowAIAssistant(true)}
            variant="outline"
            size="sm"
            className="bg-gradient-to-r from-purple-50 to-indigo-50 border-purple-200 hover:from-purple-100 hover:to-indigo-100"
          >
            <Sparkles className="h-4 w-4 mr-1 text-purple-600" />
            AI Assistant
          </Button>
        )}

        {/* Logs Button */}
        {flowId && flowId !== 'new' && (
          <Button
            onClick={() => setShowLogsPanel(true)}
            variant="outline"
            size="sm"
            className="bg-gradient-to-r from-slate-50 to-gray-50 border-slate-300 hover:from-slate-100 hover:to-gray-100"
          >
            <Activity className="h-4 w-4 mr-1 text-slate-600" />
            Logs
          </Button>
        )}

        {/* Settings Button */}
        {!isReadOnly && (
          <Button
            onClick={() => setShowFlowSettingsPanel(true)}
            variant="outline"
            size="sm"
            className="bg-gradient-to-r from-slate-50 to-gray-50 border-slate-300 hover:from-slate-100 hover:to-gray-100"
            title="Flow Settings"
          >
            <Settings className="h-4 w-4 text-slate-600" />
          </Button>
        )}

        {/* Input Variables Button - Only for Screen Flows */}
        {isScreenFlow() && !isReadOnly && (
          <Button
            onClick={() => setShowInputVariablesPanel(true)}
            variant="outline"
            size="sm"
            className="bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-300 hover:from-blue-100 hover:to-indigo-100"
            title="Input Variables"
          >
            <span className="text-blue-600 text-xs font-medium">Variables</span>
          </Button>
        )}

        {/* Preview/Run Button */}
        {(() => {
          const screenFlow = isScreenFlow();
          
          if (screenFlow) {
            return (
              <Button
                onClick={() => setShowPreview(true)}
                variant="outline"
                size="sm"
                className="bg-gradient-to-r from-green-50 to-emerald-50 border-green-300 hover:from-green-100 hover:to-emerald-100"
                title="Preview Screen Flow"
              >
                <Eye className="h-4 w-4 mr-1 text-green-600" />
                Preview
              </Button>
            );
          }
          
          if (flowId && flowId !== 'new') {
            return (
              <Button
                onClick={handleRun}
                variant="outline"
                size="sm"
                className="bg-gradient-to-r from-green-50 to-emerald-50 border-green-300 hover:from-green-100 hover:to-emerald-100"
                title="Run this flow manually"
              >
                <Play className="h-4 w-4 mr-1 text-green-600" />
                Run Manually
              </Button>
            );
          }
          
          return null;
        })()}
        
        {/* Save Buttons */}
        {!isReadOnly && flowStatus !== 'active' && (
          <>
            <Button
              onClick={handleSave}
              disabled={saving || flowId === 'new'}
              className="bg-indigo-600 hover:bg-indigo-700"
              size="sm"
            >
              <Save className="h-4 w-4 mr-1" />
              {(saving && flowId !== 'new') ? 'Saving...' : 'Save'}
            </Button>
            <Button
              onClick={handleSaveAsNewVersion}
              disabled={saving || (flowId && flowId !== 'new')}
              variant="outline"
              size="sm"
              className="border-indigo-300 text-indigo-600 hover:bg-indigo-50"
            >
              <Save className="h-4 w-4 mr-1" />
              {(saving && flowId === 'new') ? 'Saving...' : 'Save as New Version'}
            </Button>
          </>
        )}
        
        {/* Create New Version for Active Flows */}
        {(isReadOnly || flowStatus === 'active') && flowStatus === 'active' && (
          <Button
            onClick={handleCreateNewVersion}
            className="bg-indigo-600 hover:bg-indigo-700"
            size="sm"
            disabled={saving}
          >
            <Plus className="h-4 w-4 mr-1" />
            {saving ? 'Creating...' : 'Create New Version'}
          </Button>
        )}
        
        {/* Archived Banner */}
        {isReadOnly && flowStatus === 'archived' && (
          <div className="px-3 py-2 bg-gray-100 rounded text-sm text-gray-600 font-medium">
            Archived - Read Only
          </div>
        )}
      </div>
    </div>
  );
};

export default FlowEditorToolbar;
