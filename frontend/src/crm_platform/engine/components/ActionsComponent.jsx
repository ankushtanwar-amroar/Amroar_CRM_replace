/**
 * ActionsComponent - Runtime Actions Renderer
 * 
 * This component renders actions (system and custom) on record pages.
 * Actions are ONLY rendered when this component is placed in the layout via Lightning App Builder.
 * NO automatic header rendering - fully layout-driven.
 * 
 * System Actions:
 * - Create: Opens Create Record modal for the current object
 * - Edit: Enables inline edit mode on the current record  
 * - Delete: Shows confirmation, deletes record, redirects to list view
 * 
 * Custom Actions:
 * - Create Record: Opens modal to create related record
 * - Open URL: Opens URL with dynamic tokens
 * - Run Flow: Triggers a Screen Flow
 */
import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Plus, Edit, Trash2, ExternalLink, Play, 
  ChevronDown, MoreHorizontal, Loader2, Zap
} from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { Button } from '../../../components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../../components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../../components/ui/alert-dialog';

// Import CreateRecordWrapper for Create action - handles specialized forms
import CreateRecordWrapper from '../../../components/records/CreateRecordWrapper';
// Import EditRecordDialog for Edit action
import EditRecordDialog from '../../../components/records/EditRecordDialog';
// Import FlowExecutionModal for Run Flow action
import FlowExecutionModal from '../../../modules/actions/components/FlowExecutionModal';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

/**
 * Evaluate visibility condition against record data
 */
const evaluateCondition = (condition, record) => {
  if (!condition || !condition.field) return true;
  
  const fieldValue = record?.[condition.field];
  const targetValue = condition.value;
  
  switch (condition.operator) {
    case 'equals':
      return fieldValue === targetValue;
    case 'not_equals':
      return fieldValue !== targetValue;
    case 'contains':
      return String(fieldValue || '').toLowerCase().includes(String(targetValue || '').toLowerCase());
    case 'not_contains':
      return !String(fieldValue || '').toLowerCase().includes(String(targetValue || '').toLowerCase());
    case 'is_blank':
      return !fieldValue || fieldValue === '';
    case 'is_not_blank':
      return fieldValue && fieldValue !== '';
    case 'greater_than':
      return Number(fieldValue) > Number(targetValue);
    case 'less_than':
      return Number(fieldValue) < Number(targetValue);
    default:
      return true;
  }
};

/**
 * Evaluate all visibility conditions
 */
const evaluateVisibility = (conditions, record) => {
  if (!conditions || conditions.length === 0) return true;
  return conditions.every(condition => evaluateCondition(condition, record));
};

/**
 * Get icon component for an action
 */
const getActionIcon = (action) => {
  if (action.type === 'SYSTEM_CREATE') return Plus;
  if (action.type === 'SYSTEM_EDIT') return Edit;
  if (action.type === 'SYSTEM_DELETE') return Trash2;
  if (action.type === 'OPEN_URL') return ExternalLink;
  if (action.type === 'RUN_FLOW') return Play;
  if (action.type === 'CREATE_RECORD') return Plus;
  
  const IconComponent = LucideIcons[action.icon];
  return IconComponent || Zap;
};

/**
 * Main ActionsComponent
 */
const ActionsComponent = (props) => {
  const navigate = useNavigate();
  
  // Handle both context patterns:
  // 1. LayoutRenderer passes { config, context: {...} }
  // 2. ComponentRenderer passes { config, record, objectName, ... } (spread context)
  const config = props.config || {};
  const context = props.context || props; // Fallback to props if context not nested
  
  // Extract context
  const { record, objectName, objectApiName, objectSchema, onRecordUpdate, onEditMode } = context;
  const recordData = record?.data || record || {};
  // For navigation, prefer series_id (led-xxx format) over full UUID
  const recordSeriesId = record?.series_id || recordData.series_id;
  const recordId = recordSeriesId || record?.id || recordData.id;
  const currentObjectName = objectApiName || objectName || objectSchema?.api_name || objectSchema?.name || '';
  
  // State
  const [actions, setActions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [objectSchemaForCreate, setObjectSchemaForCreate] = useState(null);
  const [objectSchemaForEdit, setObjectSchemaForEdit] = useState(null);
  const [loadingSchema, setLoadingSchema] = useState(false);
  // Flow execution state
  const [showFlowModal, setShowFlowModal] = useState(false);
  const [activeFlowAction, setActiveFlowAction] = useState(null);

  // Configuration
  const format = config.format || 'button';
  const maxVisible = config.maxVisible || 3;
  const visibilityConditions = config.visibilityConditions || [];
  const selectedActionIds = config.selectedActions || []; // Actions selected in layout properties

  // Fetch actions for the object - ONLY Record Detail actions
  useEffect(() => {
    const fetchActions = async () => {
      if (!currentObjectName) {
        setLoading(false);
        return;
      }

      try {
        const token = localStorage.getItem('token');
        const response = await axios.get(`${API_URL}/api/actions`, {
          headers: { Authorization: `Bearer ${token}` },
          params: { 
            object: currentObjectName.toLowerCase(),
            active_only: true,
            action_context: 'RECORD_DETAIL'  // Only fetch Record Detail actions
          }
        });
        setActions(response.data || []);
      } catch (err) {
        console.error('Error fetching actions:', err);
        setActions([]);
      } finally {
        setLoading(false);
      }
    };

    fetchActions();
  }, [currentObjectName]);

  // Filter actions based on visibility and selection - Strictly Record Detail only
  const visibleActions = useMemo(() => {
    // First, filter by context and visibility
    let filtered = actions.filter(action => {
      if (!action.is_active) return false;
      
      // STRICT: Only show RECORD_DETAIL actions (or actions without context for backward compatibility)
      const actionContext = action.action_context || 'RECORD_DETAIL';
      if (actionContext !== 'RECORD_DETAIL') return false;
      
      const actionConditions = action.config_json?.visibility_conditions;
      if (actionConditions && actionConditions.length > 0) {
        if (!evaluateVisibility(actionConditions, recordData)) return false;
      }
      
      return true;
    });
    
    // If specific actions are selected in layout properties, filter and order by selection
    if (selectedActionIds && selectedActionIds.length > 0) {
      filtered = selectedActionIds
        .map(id => filtered.find(a => a.id === id))
        .filter(Boolean);
    }
    
    return filtered;
  }, [actions, recordData, selectedActionIds]);

  // Check component-level visibility
  const isComponentVisible = useMemo(() => {
    if (visibilityConditions.length === 0) return true;
    return evaluateVisibility(visibilityConditions, recordData);
  }, [visibilityConditions, recordData]);

  // ============================================
  // ACTION HANDLERS
  // ============================================
  
  /**
   * Handle Create action - Fetch object schema then open Create Record Modal
   */
  const handleCreate = async () => {
    if (!currentObjectName) {
      toast.error('Cannot create: No object context');
      return;
    }

    // If we already have the schema from context, use it
    if (objectSchema) {
      setObjectSchemaForCreate(objectSchema);
      setShowCreateDialog(true);
      return;
    }

    // Otherwise, fetch the object schema
    setLoadingSchema(true);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(
        `${API_URL}/api/objects/${currentObjectName.toLowerCase()}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setObjectSchemaForCreate(response.data);
      setShowCreateDialog(true);
    } catch (err) {
      console.error('Error fetching object schema:', err);
      toast.error('Failed to load create form');
    } finally {
      setLoadingSchema(false);
    }
  };

  /**
   * Handle record created successfully
   */
  const handleCreateSuccess = (newRecord) => {
    setShowCreateDialog(false);
    toast.success('Record created successfully');
    
    // Navigate to the new record
    if (newRecord?.id || newRecord?.series_id) {
      const newRecordId = newRecord.series_id || newRecord.id;
      navigate(`/crm/${currentObjectName.toLowerCase()}/${newRecordId}`);
    }
  };

  /**
   * Handle Edit action - Open Edit Record Modal
   */
  const handleEdit = async () => {
    if (onEditMode) {
      // Use callback if provided (for inline editing)
      onEditMode(true);
      setIsEditMode(true);
      return;
    }
    
    if (!currentObjectName || !recordId) {
      toast.error('Cannot edit: No record context');
      return;
    }

    // If we already have the schema from context, use it
    if (objectSchema) {
      setObjectSchemaForEdit(objectSchema);
      setShowEditDialog(true);
      return;
    }

    // Otherwise, fetch the object schema
    setLoadingSchema(true);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(
        `${API_URL}/api/objects/${currentObjectName.toLowerCase()}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setObjectSchemaForEdit(response.data);
      setShowEditDialog(true);
    } catch (err) {
      console.error('Error fetching object schema:', err);
      toast.error('Failed to load edit form');
    } finally {
      setLoadingSchema(false);
    }
  };

  /**
   * Handle record edited successfully
   */
  const handleEditSuccess = (updatedRecord) => {
    setShowEditDialog(false);
    toast.success('Record updated successfully');
    
    // Trigger record refresh if callback is available
    if (onRecordUpdate) {
      onRecordUpdate();
    }
  };

  /**
   * Handle Delete action - Show confirmation then delete
   */
  const handleDelete = async () => {
    if (!recordId) {
      toast.error('Cannot delete: No record ID');
      return;
    }
    
    setIsDeleting(true);
    
    try {
      const token = localStorage.getItem('token');
      await axios.delete(
        `${API_URL}/api/objects/${currentObjectName.toLowerCase()}/records/${recordId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      toast.success('Record deleted successfully');
      setShowDeleteConfirm(false);
      
      // Navigate to object list view (Sales Console)
      navigate(`/crm/${currentObjectName.toLowerCase()}`);
    } catch (err) {
      console.error('Error deleting record:', err);
      toast.error(err.response?.data?.detail || 'Failed to delete record');
    } finally {
      setIsDeleting(false);
    }
  };

  /**
   * Handle custom Create Record action
   */
  const handleCreateRecord = (action) => {
    const targetObject = action.config_json?.target_object;
    if (targetObject) {
      // Navigate to create page for target object
      navigate(`/crm/${targetObject.toLowerCase()}`);
    }
  };

  /**
   * Handle Open URL action
   */
  const handleOpenUrl = (action) => {
    let url = action.config_json?.url_template || '';
    
    // Replace tokens with record values
    const tokenRegex = /\{\{Record\.(\w+)\}\}/g;
    url = url.replace(tokenRegex, (match, fieldName) => {
      return recordData[fieldName] || recordData[fieldName.toLowerCase()] || '';
    });
    
    if (url) {
      const openInNewTab = action.config_json?.open_in_new_tab !== false;
      if (openInNewTab) {
        window.open(url, '_blank');
      } else {
        window.location.href = url;
      }
    }
  };

  /**
   * Handle Run Flow action - Open FlowExecutionModal
   */
  const handleRunFlow = async (action) => {
    const flowId = action.config_json?.flow_id;
    if (!flowId) {
      toast.error('No flow configured for this action');
      return;
    }
    
    if (!recordId) {
      toast.error('Cannot run flow: No record context');
      return;
    }
    
    // Open the flow execution modal
    setActiveFlowAction(action);
    setShowFlowModal(true);
  };

  /**
   * Handle flow completion - refresh record data
   */
  const handleFlowComplete = (result) => {
    if (result?.success) {
      // Trigger record refresh if callback is available
      if (onRecordUpdate) {
        onRecordUpdate();
      }
    }
    setShowFlowModal(false);
    setActiveFlowAction(null);
  };

  /**
   * Handle flow modal close
   */
  const handleFlowClose = () => {
    setShowFlowModal(false);
    setActiveFlowAction(null);
  };

  /**
   * Main action click handler
   */
  const handleActionClick = (action) => {
    switch (action.type) {
      case 'SYSTEM_CREATE':
        handleCreate();
        break;
      case 'SYSTEM_EDIT':
        handleEdit();
        break;
      case 'SYSTEM_DELETE':
        setShowDeleteConfirm(true);
        break;
      case 'CREATE_RECORD':
        handleCreateRecord(action);
        break;
      case 'OPEN_URL':
        handleOpenUrl(action);
        break;
      case 'RUN_FLOW':
        handleRunFlow(action);
        break;
      default:
        console.warn('Unknown action type:', action.type);
    }
  };

  // Don't render if component visibility fails
  if (!isComponentVisible) {
    return null;
  }

  // Don't render if no visible actions
  if (!loading && visibleActions.length === 0) {
    return null;
  }

  // Split into primary and overflow - only create overflow if there are more actions than maxVisible
  const primaryActions = visibleActions.slice(0, maxVisible);
  const overflowActions = visibleActions.slice(maxVisible);
  const hasOverflow = overflowActions.length > 0;

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center gap-2 py-2" data-testid="actions-loading">
        <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
        <span className="text-sm text-slate-500">Loading actions...</span>
      </div>
    );
  }

  // Render action button
  const renderActionButton = (action, variant = 'outline') => {
    const Icon = getActionIcon(action);
    const isDelete = action.type === 'SYSTEM_DELETE';
    
    return (
      <Button
        key={action.id}
        variant={isDelete ? 'destructive' : variant}
        size="sm"
        onClick={() => handleActionClick(action)}
        className="gap-1.5"
        data-testid={`action-${action.api_name || action.id}`}
      >
        <Icon className="h-4 w-4" />
        {action.label}
      </Button>
    );
  };

  // Render dropdown item
  const renderDropdownItem = (action) => {
    const Icon = getActionIcon(action);
    const isDelete = action.type === 'SYSTEM_DELETE';
    
    return (
      <DropdownMenuItem
        key={action.id}
        onClick={() => handleActionClick(action)}
        className={isDelete ? 'text-red-600 focus:text-red-600' : ''}
        data-testid={`action-${action.api_name || action.id}`}
      >
        <Icon className="h-4 w-4 mr-2" />
        {action.label}
      </DropdownMenuItem>
    );
  };

  return (
    <>
      <div className="py-2" data-testid="actions-component">
        {/* Dropdown Format */}
        {format === 'dropdown' && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2" data-testid="actions-dropdown-trigger">
                <Zap className="h-4 w-4" />
                Actions
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              {visibleActions.map(action => renderDropdownItem(action))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {/* Button Format (default) */}
        {(format === 'button' || format === 'icon_only') && (
          <div className="flex items-center gap-2 flex-wrap" data-testid="actions-button-container">
            {primaryActions.map((action) => renderActionButton(action))}
            {hasOverflow && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" data-testid="actions-overflow-trigger">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {overflowActions.map(action => renderDropdownItem(action))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        )}
      </div>

      {/* Create Record Dialog - Only render when we have schema and dialog should be open */}
      {showCreateDialog && objectSchemaForCreate && (
        <CreateRecordWrapper
          object={objectSchemaForCreate}
          defaultOpen={true}
          onOpenChange={(open) => {
            if (!open) {
              setShowCreateDialog(false);
              setObjectSchemaForCreate(null);
            }
          }}
          onSuccess={handleCreateSuccess}
        />
      )}

      {/* Edit Record Dialog - Opens modal for editing current record */}
      {showEditDialog && objectSchemaForEdit && record && (
        <EditRecordDialog
          object={objectSchemaForEdit}
          record={record}
          defaultOpen={true}
          onOpenChange={(open) => {
            if (!open) {
              setShowEditDialog(false);
              setObjectSchemaForEdit(null);
            }
          }}
          onSuccess={handleEditSuccess}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Record</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this record? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Yes, Delete'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Flow Execution Modal */}
      {showFlowModal && activeFlowAction && (
        <FlowExecutionModal
          action={activeFlowAction}
          recordId={recordId}
          recordData={recordData}
          objectName={currentObjectName}
          onClose={handleFlowClose}
          onComplete={handleFlowComplete}
        />
      )}
    </>
  );
};

export default ActionsComponent;
