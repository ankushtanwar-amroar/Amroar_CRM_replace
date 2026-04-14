/**
 * ActionButtons
 * Runtime component that renders action buttons on record pages
 */
import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { useRuntimeActions, ACTION_TYPES } from '../index';
import ActionExecutionModal from './ActionExecutionModal';
import { toast } from 'sonner';

const ActionButtons = ({ 
  objectName, 
  recordId, 
  recordData = {},
  onRecordUpdate,
  placement = 'RECORD_HEADER',
  className = ''
}) => {
  const { actions, loading, executing, executeAction } = useRuntimeActions(objectName, placement);
  const [modalAction, setModalAction] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);

  const handleActionClick = async (action) => {
    // Handle different action types
    switch (action.type) {
      case ACTION_TYPES.CREATE_RECORD:
        // Open creation modal
        setModalAction(action);
        break;
        
      case ACTION_TYPES.UPDATE_RECORD:
        const config = action.config_json || {};
        if (config.show_confirmation !== false) {
          // Show confirmation dialog
          setConfirmAction(action);
        } else {
          // Execute directly
          await executeUpdateAction(action);
        }
        break;
        
      case ACTION_TYPES.OPEN_URL:
        await executeOpenUrlAction(action);
        break;
      
      case ACTION_TYPES.RUN_FLOW:
        await executeRunFlowAction(action);
        break;
        
      default:
        toast.error(`Unknown action type: ${action.type}`);
    }
  };

  const executeUpdateAction = async (action) => {
    try {
      const result = await executeAction(action.id, recordId, recordData);
      
      if (result.success) {
        toast.success(result.message || 'Record updated successfully');
        if (onRecordUpdate) {
          onRecordUpdate();
        }
      } else {
        toast.error(result.message || 'Failed to update record');
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Action failed');
    }
    setConfirmAction(null);
  };

  const executeOpenUrlAction = async (action) => {
    try {
      const result = await executeAction(action.id, recordId, recordData);
      
      if (result.success && result.redirect_url) {
        const openInNewTab = result.result?.open_in_new_tab !== false;
        if (openInNewTab) {
          window.open(result.redirect_url, '_blank', 'noopener,noreferrer');
        } else {
          window.location.assign(result.redirect_url);
        }
      } else {
        toast.error(result.message || 'Failed to generate URL');
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Action failed');
    }
  };

  const executeRunFlowAction = async (action) => {
    const flowName = action.config_json?.flow_name || 'Flow';
    
    try {
      toast(`Running ${flowName}...`, { icon: 'ℹ️' });
      const result = await executeAction(action.id, recordId, recordData);
      
      if (result.success) {
        toast.success(result.message || `${flowName} executed successfully`);
        if (onRecordUpdate) {
          onRecordUpdate();
        }
      } else {
        toast.error(result.message || `Failed to run ${flowName}`);
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Flow execution failed');
    }
  };

  const handleModalSubmit = async (formData) => {
    if (!modalAction) return;
    
    try {
      const result = await executeAction(modalAction.id, recordId, recordData, formData);
      
      if (result.success) {
        toast.success(result.message || 'Record created successfully');
        setModalAction(null);
        if (onRecordUpdate) {
          onRecordUpdate();
        }
      } else {
        toast.error(result.message || 'Failed to create record');
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Action failed');
    }
  };

  if (loading) {
    return null; // Don't show loading state for action buttons
  }

  if (actions.length === 0) {
    return null; // No actions configured
  }

  return (
    <>
      <div className={`flex items-center gap-2 flex-wrap ${className}`}>
        {actions.map((action) => {
          const IconComponent = LucideIcons[action.icon] || LucideIcons.Zap;
          const isExecuting = executing === action.id;
          
          return (
            <Button
              key={action.id}
              variant="outline"
              size="sm"
              onClick={() => handleActionClick(action)}
              disabled={isExecuting}
              className="flex items-center gap-2"
              data-testid={`action-btn-${action.api_name}`}
            >
              {isExecuting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <IconComponent className="h-4 w-4" />
              )}
              {action.label}
            </Button>
          );
        })}
      </div>

      {/* Create Record Modal */}
      {modalAction && modalAction.type === ACTION_TYPES.CREATE_RECORD && (
        <ActionExecutionModal
          action={modalAction}
          recordData={recordData}
          sourceRecordId={recordId}
          onSubmit={handleModalSubmit}
          onClose={() => setModalAction(null)}
        />
      )}

      {/* Confirmation Dialog */}
      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Confirm Action
            </h3>
            <p className="text-gray-600 mb-6">
              {confirmAction.config_json?.confirmation_message || 'Are you sure you want to perform this action?'}
            </p>
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => setConfirmAction(null)}
              >
                Cancel
              </Button>
              <Button
                onClick={() => executeUpdateAction(confirmAction)}
                disabled={executing === confirmAction.id}
              >
                {executing === confirmAction.id ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  'Confirm'
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ActionButtons;
