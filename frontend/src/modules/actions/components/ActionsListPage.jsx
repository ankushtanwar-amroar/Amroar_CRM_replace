/**
 * ActionsListPage
 * Admin page showing list of actions for an object in Object Manager
 * Includes system-generated actions (Create, Edit, Delete) that are non-deletable
 * Now shows Record Detail and List View actions in separate tabs
 */
import React, { useState } from 'react';
import { 
  Plus, Edit2, Copy, Trash2, 
  Zap, ExternalLink, FileText, GripVertical, Lock, Play,
  List, LayoutList
} from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Switch } from '../../../components/ui/switch';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../../components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../../components/ui/dialog';
import { useActions, ACTION_TYPES, SYSTEM_ACTION_TYPES, ACTION_CONTEXTS } from '../index';
import ActionForm from './ActionForm';
import { toast } from 'sonner';
import axios from 'axios';

const API = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';

const ActionTypeIcon = ({ type }) => {
  switch (type) {
    case ACTION_TYPES.CREATE_RECORD:
      return <Plus className="h-4 w-4 text-green-600" />;
    case ACTION_TYPES.OPEN_URL:
      return <ExternalLink className="h-4 w-4 text-purple-600" />;
    case ACTION_TYPES.RUN_FLOW:
      return <Play className="h-4 w-4 text-amber-600" />;
    case SYSTEM_ACTION_TYPES.SYSTEM_CREATE:
      return <Plus className="h-4 w-4 text-blue-600" />;
    case SYSTEM_ACTION_TYPES.SYSTEM_EDIT:
      return <Edit2 className="h-4 w-4 text-blue-600" />;
    case SYSTEM_ACTION_TYPES.SYSTEM_DELETE:
      return <Trash2 className="h-4 w-4 text-blue-600" />;
    default:
      return <FileText className="h-4 w-4 text-gray-600" />;
  }
};

const ActionTypeLabel = ({ type }) => {
  const labels = {
    [ACTION_TYPES.CREATE_RECORD]: 'Create Record',
    [ACTION_TYPES.OPEN_URL]: 'Open URL',
    [ACTION_TYPES.RUN_FLOW]: 'Run Flow',
    [SYSTEM_ACTION_TYPES.SYSTEM_CREATE]: 'System',
    [SYSTEM_ACTION_TYPES.SYSTEM_EDIT]: 'System',
    [SYSTEM_ACTION_TYPES.SYSTEM_DELETE]: 'System'
  };
  return labels[type] || type;
};

/**
 * SystemActionLabelModal
 * Minimal modal for editing system action label only
 */
const SystemActionLabelModal = ({ action, isOpen, onClose, onSave }) => {
  const [label, setLabel] = useState(action?.label || '');
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    if (action) {
      setLabel(action.label || '');
    }
  }, [action]);

  const handleSave = async () => {
    if (!label.trim()) {
      toast.error('Label cannot be empty');
      return;
    }

    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      await axios.patch(
        `${API}/api/actions/${action.id}/label`,
        { label: label.trim() },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success('Action label updated successfully');
      onSave();
      onClose();
    } catch (error) {
      console.error('Error updating system action label:', error);
      toast.error(error.response?.data?.detail || 'Failed to update label');
    } finally {
      setSaving(false);
    }
  };

  if (!action) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md" data-testid="system-action-label-modal">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-blue-600" />
            Edit System Action Label
          </DialogTitle>
          <DialogDescription>
            Customize the display label for this system action. Only the label can be modified.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          {/* Info Banner */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-sm text-blue-700">
              <strong>System Action:</strong> {action.api_name?.replace('system_', '').replace(/_/g, ' ').toUpperCase()}
            </p>
            <p className="text-xs text-blue-600 mt-1">
              The action type and behavior cannot be changed.
            </p>
          </div>

          {/* Label Input */}
          <div className="space-y-2">
            <Label htmlFor="system-action-label" className="text-sm font-medium">
              Label <span className="text-red-500">*</span>
            </Label>
            <Input
              id="system-action-label"
              data-testid="system-action-label-input"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Enter display label"
              className="w-full"
              autoFocus
            />
            <p className="text-xs text-gray-500">
              This label will be displayed on buttons and menus
            </p>
          </div>
        </div>

        <DialogFooter className="flex justify-end gap-2">
          <Button 
            variant="outline" 
            onClick={onClose}
            data-testid="cancel-system-action-edit"
          >
            Cancel
          </Button>
          <Button 
            onClick={handleSave} 
            disabled={saving || !label.trim()}
            className="bg-blue-600 hover:bg-blue-700"
            data-testid="save-system-action-label"
          >
            {saving ? 'Saving...' : 'Save Label'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const ActionsListPage = ({ objectName, objectLabel }) => {
  const { 
    actions, 
    loading, 
    error, 
    refetch,
    createAction,
    updateAction,
    deleteAction,
    cloneAction,
    toggleActive
  } = useActions(objectName);
  
  const [showForm, setShowForm] = useState(false);
  const [editingAction, setEditingAction] = useState(null);
  const [activeTab, setActiveTab] = useState('record_detail');
  
  // System action label editing state
  const [editingSystemAction, setEditingSystemAction] = useState(null);
  const [showSystemLabelModal, setShowSystemLabelModal] = useState(false);

  const handleCreate = () => {
    setEditingAction(null);
    setShowForm(true);
  };

  const handleEdit = (action) => {
    // For system actions, open the label-only modal
    if (action.is_system) {
      setEditingSystemAction(action);
      setShowSystemLabelModal(true);
      return;
    }
    // For custom actions, open full edit form
    setEditingAction(action);
    setShowForm(true);
  };

  const handleClone = async (action) => {
    // Don't allow cloning system actions
    if (action.is_system) {
      toast('System actions cannot be cloned', { icon: 'ℹ️' });
      return;
    }
    try {
      await cloneAction(action.id);
      toast.success('Action cloned successfully');
    } catch (err) {
      toast.error('Failed to clone action');
    }
  };

  const handleDelete = async (action) => {
    // Don't allow deleting system actions
    if (action.is_system) {
      toast.error('System actions cannot be deleted');
      return;
    }
    
    if (!window.confirm(`Delete action "${action.label}"?`)) return;
    
    try {
      await deleteAction(action.id);
      toast.success('Action deleted');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to delete action');
    }
  };

  const handleToggleActive = async (action) => {
    // Don't allow toggling system actions
    if (action.is_system) {
      toast('System actions are always active', { icon: 'ℹ️' });
      return;
    }
    try {
      await toggleActive(action.id);
      toast.success(`Action ${action.is_active ? 'deactivated' : 'activated'}`);
    } catch (err) {
      toast.error('Failed to update action status');
    }
  };

  const handleFormSubmit = async (formData) => {
    try {
      if (editingAction) {
        await updateAction(editingAction.id, formData);
        toast.success('Action updated successfully');
      } else {
        await createAction(formData);
        toast.success('Action created successfully');
      }
      setShowForm(false);
      setEditingAction(null);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save action');
      throw err;
    }
  };

  const handleFormCancel = () => {
    setShowForm(false);
    setEditingAction(null);
  };
  
  const handleSystemLabelSaved = () => {
    refetch(); // Refresh the actions list
    setEditingSystemAction(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Zap className="h-6 w-6 animate-spin text-blue-600" />
        <span className="ml-2 text-gray-600">Loading actions...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
        <p className="text-red-700">{error}</p>
        <Button variant="outline" size="sm" onClick={refetch} className="mt-2">
          Retry
        </Button>
      </div>
    );
  }

  if (showForm) {
    return (
      <ActionForm
        objectName={objectName}
        objectLabel={objectLabel}
        action={editingAction}
        onSubmit={handleFormSubmit}
        onCancel={handleFormCancel}
        defaultActionContext={activeTab === 'list_view' ? 'LIST_VIEW' : 'RECORD_DETAIL'}
      />
    );
  }

  // Separate system and custom actions
  const systemActions = actions.filter(a => a.is_system);
  
  // Filter actions by context
  const recordDetailActions = actions.filter(a => 
    !a.is_system && (a.action_context === 'RECORD_DETAIL' || !a.action_context)
  );
  const listViewActions = actions.filter(a => 
    !a.is_system && a.action_context === 'LIST_VIEW'
  );

  // Action table component to reuse for both tabs
  const ActionTable = ({ actionsToShow, showSystemActions = false, emptyMessage }) => (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-10">
              {/* Drag handle placeholder */}
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Label
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Type
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Status
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Active
            </th>
            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {/* System Actions (only for Record Detail tab) */}
          {showSystemActions && systemActions.map((action) => {
            const IconComponent = LucideIcons[action.icon] || LucideIcons.Zap;
            return (
              <tr key={action.id} className="bg-slate-50/50 hover:bg-slate-100/50 transition-colors">
                <td className="px-4 py-3">
                  <Lock className="h-4 w-4 text-gray-300" title="System action" />
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <IconComponent className="h-4 w-4 text-blue-600" />
                    <div>
                      <div className="font-medium text-gray-900">{action.label}</div>
                      <div className="text-xs text-gray-500">{action.api_name}</div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className="text-sm text-gray-600">
                    <ActionTypeLabel type={action.type} />
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                    <Lock className="h-3 w-3 mr-1" />
                    System
                  </span>
                </td>
                <td className="px-4 py-3">
                  <Switch
                    checked={true}
                    disabled={true}
                  />
                </td>
                <td className="px-4 py-3 text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleEdit(action)}
                    title="Edit Label"
                    className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                    data-testid={`edit-system-action-${action.api_name}`}
                  >
                    <Edit2 className="h-4 w-4" />
                  </Button>
                </td>
              </tr>
            );
          })}
          
          {/* Custom Actions */}
          {actionsToShow.map((action) => {
            const IconComponent = LucideIcons[action.icon] || LucideIcons.Zap;
            return (
              <tr key={action.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <GripVertical className="h-4 w-4 text-gray-400 cursor-grab" />
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <IconComponent className="h-4 w-4 text-slate-600" />
                    <div>
                      <div className="font-medium text-gray-900">{action.label}</div>
                      <div className="text-xs text-gray-500">{action.api_name}</div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className="text-sm text-gray-600">
                    <ActionTypeLabel type={action.type} />
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-50 text-green-700">
                    Custom
                  </span>
                </td>
                <td className="px-4 py-3">
                  <Switch
                    checked={action.is_active}
                    onCheckedChange={() => handleToggleActive(action)}
                  />
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEdit(action)}
                      title="Edit"
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleClone(action)}
                      title="Clone"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(action)}
                      title="Delete"
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
          
          {/* Empty state */}
          {actionsToShow.length === 0 && !showSystemActions && (
            <tr>
              <td colSpan={6} className="px-4 py-8 text-center">
                <Zap className="h-8 w-8 mx-auto text-gray-300 mb-2" />
                <p className="text-sm text-gray-500">{emptyMessage}</p>
                <p className="text-xs text-gray-400 mt-1">Click "New Action" to create an action</p>
              </td>
            </tr>
          )}
          
          {/* Show empty if only system actions */}
          {actionsToShow.length === 0 && showSystemActions && (
            <tr>
              <td colSpan={6} className="px-4 py-4 text-center">
                <p className="text-xs text-gray-400">No custom actions configured</p>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* System Action Label Modal */}
      <SystemActionLabelModal
        action={editingSystemAction}
        isOpen={showSystemLabelModal}
        onClose={() => {
          setShowSystemLabelModal(false);
          setEditingSystemAction(null);
        }}
        onSave={handleSystemLabelSaved}
      />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Actions</h2>
          <p className="text-sm text-gray-500 mt-1">
            Configure quick actions for {objectLabel || objectName} records
          </p>
        </div>
        <Button onClick={handleCreate} className="flex items-center gap-2">
          <Plus className="h-4 w-4" />
          New Action
        </Button>
      </div>

      {/* Tabs for Record Detail vs List View */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2 mb-4">
          <TabsTrigger value="record_detail" className="flex items-center gap-2">
            <LayoutList className="h-4 w-4" />
            Record Detail Actions
            <span className="ml-1 px-1.5 py-0.5 text-xs bg-slate-200 rounded-full">
              {systemActions.length + recordDetailActions.length}
            </span>
          </TabsTrigger>
          <TabsTrigger value="list_view" className="flex items-center gap-2">
            <List className="h-4 w-4" />
            List View Actions
            <span className="ml-1 px-1.5 py-0.5 text-xs bg-slate-200 rounded-full">
              {listViewActions.length}
            </span>
          </TabsTrigger>
        </TabsList>

        {/* Record Detail Actions Tab */}
        <TabsContent value="record_detail" className="space-y-4">
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-800">
              <strong>Record Detail Actions</strong> appear on individual record pages (Record Header).
              They operate on a single record at a time.
            </p>
          </div>
          
          <ActionTable 
            actionsToShow={recordDetailActions} 
            showSystemActions={true}
            emptyMessage="No custom Record Detail actions configured"
          />
        </TabsContent>

        {/* List View Actions Tab */}
        <TabsContent value="list_view" className="space-y-4">
          <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg">
            <p className="text-sm text-purple-800">
              <strong>List View Actions</strong> appear on list pages above the records table.
              They can operate on single or multiple selected records.
            </p>
          </div>
          
          <ActionTable 
            actionsToShow={listViewActions} 
            showSystemActions={false}
            emptyMessage="No List View actions configured"
          />
        </TabsContent>
      </Tabs>

      {/* Help text */}
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
        <h4 className="font-medium text-slate-900 mb-2">About Quick Actions</h4>
        <ul className="text-sm text-slate-700 space-y-1 list-disc list-inside">
          <li><strong>System Actions:</strong> Create, Edit, Delete - Only the label can be customized</li>
          <li><strong>Create Record:</strong> Opens a modal to create a related record</li>
          <li><strong>Open URL:</strong> Opens a URL with dynamic record data tokens</li>
          <li><strong>Run Flow:</strong> Triggers a Screen Flow with record context</li>
        </ul>
      </div>
    </div>
  );
};

export default ActionsListPage;
