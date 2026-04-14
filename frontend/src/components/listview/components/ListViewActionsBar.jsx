/**
 * ListViewActionsBar
 * 
 * Renders List View actions in the list header (before "+ New" button).
 * Handles multi-record selection and flow execution.
 */
import React, { useState, useEffect, useMemo } from 'react';
import { Play, Zap, ExternalLink, Loader2, CheckSquare } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { Button } from '../../../components/ui/button';
import FlowExecutionModal from '../../../modules/actions/components/FlowExecutionModal';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

/**
 * ListViewActionsBar Component
 * 
 * @param {string} objectName - The object API name (e.g., 'lead')
 * @param {string[]} selectedRecordIds - Array of selected record IDs
 * @param {object[]} selectedRecords - Array of selected record objects (with full data)
 * @param {function} onActionComplete - Callback when an action completes
 */
const ListViewActionsBar = ({ 
  objectName, 
  selectedRecordIds = [], 
  selectedRecords = [],
  onActionComplete 
}) => {
  const [actions, setActions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showFlowModal, setShowFlowModal] = useState(false);
  const [activeAction, setActiveAction] = useState(null);
  
  // Fetch list view actions
  useEffect(() => {
    const fetchActions = async () => {
      try {
        setLoading(true);
        const token = localStorage.getItem('token');
        const response = await axios.get(`${API_URL}/api/actions`, {
          headers: { Authorization: `Bearer ${token}` },
          params: { 
            object: objectName,
            action_context: 'LIST_VIEW',
            active_only: true
          }
        });
        setActions(response.data || []);
      } catch (err) {
        console.error('Error fetching list view actions:', err);
        setActions([]);
      } finally {
        setLoading(false);
      }
    };
    
    if (objectName) {
      fetchActions();
    }
  }, [objectName]);

  // Handle action execution
  const handleActionClick = async (action) => {
    const actionType = action.type;
    
    switch (actionType) {
      case 'RUN_FLOW':
        handleRunFlow(action);
        break;
      case 'OPEN_URL':
        handleOpenUrl(action);
        break;
      case 'CREATE_RECORD':
        // For list view, Create Record might not need selected records
        toast('Create Record action not yet supported in list view', { icon: 'ℹ️' });
        break;
      default:
        toast(`Action type ${actionType} not supported`, { icon: '⚠️' });
    }
  };

  // Handle Run Flow action
  const handleRunFlow = (action) => {
    const flowId = action.config_json?.flow_id;
    if (!flowId) {
      toast.error('No flow configured for this action');
      return;
    }
    
    // List View flows can work with multiple records
    // We'll pass the selected record IDs to the flow
    setActiveAction(action);
    setShowFlowModal(true);
  };

  // Handle Open URL action
  const handleOpenUrl = (action) => {
    const config = action.config_json || {};
    let url = config.url_template || '';
    
    if (selectedRecordIds.length === 0) {
      // No record selected - use the template as-is
      window.open(url, config.open_in_new_tab !== false ? '_blank' : '_self');
      return;
    }
    
    // For list view, we might want to pass the record IDs as a query param
    // Or use the first selected record for simple URL actions
    const firstRecord = selectedRecords[0] || {};
    
    // Replace tokens with first record's data
    url = url.replace(/\{([^}]+)\}/g, (match, token) => {
      const value = firstRecord.data?.[token] || firstRecord[token] || '';
      return encodeURIComponent(value);
    });
    
    // Add selectedIds as query param if multiple records selected
    if (selectedRecordIds.length > 1) {
      const separator = url.includes('?') ? '&' : '?';
      url += `${separator}selectedIds=${selectedRecordIds.join(',')}`;
    }
    
    window.open(url, config.open_in_new_tab !== false ? '_blank' : '_self');
  };

  // Handle flow completion
  const handleFlowComplete = (result) => {
    setShowFlowModal(false);
    setActiveAction(null);
    
    if (result?.success && onActionComplete) {
      onActionComplete();
    }
  };

  // Don't render if no list view actions
  if (loading) {
    return null;
  }

  if (actions.length === 0) {
    return null;
  }

  return (
    <>
      <div className="flex items-center gap-2" data-testid="list-view-actions-bar">
        {/* Selection indicator */}
        {selectedRecordIds.length > 0 && (
          <div className="flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 rounded-md text-sm mr-2">
            <CheckSquare className="h-4 w-4" />
            <span>{selectedRecordIds.length} selected</span>
          </div>
        )}
        
        {/* Render each list view action */}
        {actions.map((action) => {
          const IconComponent = LucideIcons[action.icon] || LucideIcons.Zap;
          const isDisabled = action.type === 'RUN_FLOW' && selectedRecordIds.length === 0;
          
          return (
            <Button
              key={action.id}
              variant="outline"
              size="sm"
              onClick={() => handleActionClick(action)}
              disabled={isDisabled}
              title={isDisabled ? 'Select records to run this action' : action.label}
              data-testid={`list-action-${action.api_name}`}
              className="flex items-center gap-2"
            >
              <IconComponent className="h-4 w-4" />
              {action.label}
            </Button>
          );
        })}
      </div>

      {/* Flow Execution Modal */}
      {showFlowModal && activeAction && (
        <FlowExecutionModal
          action={activeAction}
          recordId={selectedRecordIds[0] || null}  // Pass first selected record
          recordData={selectedRecords[0] || {}}
          objectName={objectName}
          selectedRecordIds={selectedRecordIds}  // Pass all selected IDs
          onClose={() => {
            setShowFlowModal(false);
            setActiveAction(null);
          }}
          onComplete={handleFlowComplete}
        />
      )}
    </>
  );
};

export default ListViewActionsBar;
