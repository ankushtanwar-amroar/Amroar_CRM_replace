/**
 * Approval Workflows Page - Phase 8
 * Admin UI for configuring approval workflows
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  Plus,
  Edit2,
  Trash2,
  Search,
  Loader2,
  Users,
  CheckCircle,
  XCircle,
  GitBranch,
  UserCheck,
  Shield,
  ToggleLeft,
  ToggleRight,
  ChevronRight,
  AlertCircle,
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { Switch } from '../../components/ui/switch';
import { Badge } from '../../components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const TASK_STATUSES = [
  { value: 'todo', label: 'To Do' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'done', label: 'Done' },
  { value: 'pending_approval', label: 'Pending Approval' },
];

const APPROVER_TYPES = [
  { value: 'user', label: 'Specific User', icon: UserCheck },
  { value: 'role', label: 'Role', icon: Shield },
  { value: 'field', label: 'Task Field', icon: GitBranch },
];

const TASK_FIELDS = [
  { value: 'assignee_id', label: 'Assignee' },
  { value: 'created_by', label: 'Task Creator' },
];

const ApprovalWorkflowsPage = () => {
  const [workflows, setWorkflows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingWorkflow, setEditingWorkflow] = useState(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [workflowToDelete, setWorkflowToDelete] = useState(null);
  
  // Users and projects for selection
  const [users, setUsers] = useState([]);
  const [projects, setProjects] = useState([]);
  
  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    project_ids: [],
    trigger_status: 'done',
    approval_type: 'single',
    approvers: [{ type: 'user', value: '' }],
    on_approve_status: 'done',
    on_reject_status: 'todo',
  });

  const fetchWorkflows = useCallback(async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/task-manager/approval-workflows`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setWorkflows(data.workflows || []);
      }
    } catch (error) {
      console.error('Error fetching workflows:', error);
      toast.error('Failed to load workflows');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchUsers = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/users`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setUsers(Array.isArray(data) ? data : data.users || []);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  }, []);

  const fetchProjects = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/task-manager/projects`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setProjects(data || []);
      }
    } catch (error) {
      console.error('Error fetching projects:', error);
    }
  }, []);

  useEffect(() => {
    fetchWorkflows();
    fetchUsers();
    fetchProjects();
  }, [fetchWorkflows, fetchUsers, fetchProjects]);

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      project_ids: [],
      trigger_status: 'done',
      approval_type: 'single',
      approvers: [{ type: 'user', value: '' }],
      on_approve_status: 'done',
      on_reject_status: 'todo',
    });
    setEditingWorkflow(null);
  };

  const openCreateDialog = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEditDialog = (workflow) => {
    setFormData({
      name: workflow.name,
      description: workflow.description || '',
      project_ids: workflow.project_ids || [],
      trigger_status: workflow.trigger_status,
      approval_type: workflow.approval_type,
      approvers: workflow.approvers || [{ type: 'user', value: '' }],
      on_approve_status: workflow.on_approve_status,
      on_reject_status: workflow.on_reject_status,
    });
    setEditingWorkflow(workflow);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error('Workflow name is required');
      return;
    }
    
    // Validate approvers
    const validApprovers = formData.approvers.filter(a => a.value);
    if (validApprovers.length === 0) {
      toast.error('At least one approver is required');
      return;
    }
    
    // Prevent approval loop
    if (formData.trigger_status === formData.on_approve_status) {
      toast.error('Trigger status cannot be the same as approved status');
      return;
    }
    
    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      const url = editingWorkflow
        ? `${API_URL}/api/task-manager/approval-workflows/${editingWorkflow.id}`
        : `${API_URL}/api/task-manager/approval-workflows`;
      
      const response = await fetch(url, {
        method: editingWorkflow ? 'PUT' : 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...formData,
          approvers: validApprovers,
        })
      });
      
      if (response.ok) {
        toast.success(editingWorkflow ? 'Workflow updated' : 'Workflow created');
        setDialogOpen(false);
        resetForm();
        fetchWorkflows();
      } else {
        const error = await response.json();
        toast.error(error.detail || 'Failed to save workflow');
      }
    } catch (error) {
      console.error('Error saving workflow:', error);
      toast.error('Failed to save workflow');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (workflow) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(
        `${API_URL}/api/task-manager/approval-workflows/${workflow.id}/toggle`,
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );
      
      if (response.ok) {
        toast.success(`Workflow ${workflow.is_enabled ? 'disabled' : 'enabled'}`);
        fetchWorkflows();
      }
    } catch (error) {
      console.error('Error toggling workflow:', error);
      toast.error('Failed to toggle workflow');
    }
  };

  const handleDelete = async () => {
    if (!workflowToDelete) return;
    
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(
        `${API_URL}/api/task-manager/approval-workflows/${workflowToDelete.id}`,
        {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );
      
      if (response.ok) {
        toast.success('Workflow deleted');
        setDeleteConfirmOpen(false);
        setWorkflowToDelete(null);
        fetchWorkflows();
      }
    } catch (error) {
      console.error('Error deleting workflow:', error);
      toast.error('Failed to delete workflow');
    }
  };

  const addApproverStep = () => {
    setFormData(prev => ({
      ...prev,
      approvers: [...prev.approvers, { type: 'user', value: '' }]
    }));
  };

  const removeApproverStep = (index) => {
    setFormData(prev => ({
      ...prev,
      approvers: prev.approvers.filter((_, i) => i !== index)
    }));
  };

  const updateApprover = (index, field, value) => {
    setFormData(prev => {
      const newApprovers = [...prev.approvers];
      newApprovers[index] = { ...newApprovers[index], [field]: value };
      return { ...prev, approvers: newApprovers };
    });
  };

  const filteredWorkflows = workflows.filter(w =>
    w.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getStatusLabel = (status) => {
    const found = TASK_STATUSES.find(s => s.value === status);
    return found ? found.label : status;
  };

  const getUserName = (userId) => {
    const user = users.find(u => u.id === userId);
    return user ? (user.name || user.email) : userId;
  };

  return (
    <div className="min-h-full pb-8 bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              to="/task-manager"
              className="text-slate-500 hover:text-slate-700"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Approval Workflows</h1>
              <p className="text-sm text-slate-500">Configure task approval processes</p>
            </div>
          </div>
          <Button onClick={openCreateDialog} data-testid="create-workflow-btn">
            <Plus className="w-4 h-4 mr-2" />
            New Workflow
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="p-6 max-w-5xl mx-auto">
        {/* Search */}
        <div className="mb-6">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Search workflows..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
              data-testid="search-workflows"
            />
          </div>
        </div>

        {/* Workflows List */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
          </div>
        ) : filteredWorkflows.length === 0 ? (
          <div className="bg-white rounded-lg border border-slate-200 p-12 text-center">
            <GitBranch className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-slate-900 mb-2">No workflows yet</h3>
            <p className="text-slate-500 mb-4">Create approval workflows to add governance to your tasks</p>
            <Button onClick={openCreateDialog}>
              <Plus className="w-4 h-4 mr-2" />
              Create First Workflow
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredWorkflows.map(workflow => (
              <div
                key={workflow.id}
                className="bg-white rounded-lg border border-slate-200 p-4 hover:border-slate-300 transition-colors"
                data-testid={`workflow-card-${workflow.id}`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-semibold text-slate-900">{workflow.name}</h3>
                      <Badge
                        variant={workflow.is_enabled ? 'default' : 'secondary'}
                        className={workflow.is_enabled ? 'bg-green-100 text-green-700' : ''}
                      >
                        {workflow.is_enabled ? 'Active' : 'Disabled'}
                      </Badge>
                      <Badge variant="outline">
                        {workflow.approval_type === 'sequential' ? 'Multi-step' : 'Single'}
                      </Badge>
                    </div>
                    
                    {workflow.description && (
                      <p className="text-sm text-slate-500 mb-3">{workflow.description}</p>
                    )}
                    
                    {/* Workflow Flow Visualization */}
                    <div className="flex items-center gap-2 text-sm">
                      <Badge variant="outline" className="bg-blue-50 border-blue-200 text-blue-700">
                        {getStatusLabel(workflow.trigger_status)}
                      </Badge>
                      <ChevronRight className="w-4 h-4 text-slate-400" />
                      <div className="flex items-center gap-1 text-slate-600">
                        <Users className="w-4 h-4" />
                        <span>{workflow.approvers?.length || 0} Approver{workflow.approvers?.length !== 1 ? 's' : ''}</span>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-400" />
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="bg-green-50 border-green-200 text-green-700">
                          <CheckCircle className="w-3 h-3 mr-1" />
                          {getStatusLabel(workflow.on_approve_status)}
                        </Badge>
                        <span className="text-slate-400">/</span>
                        <Badge variant="outline" className="bg-red-50 border-red-200 text-red-700">
                          <XCircle className="w-3 h-3 mr-1" />
                          {getStatusLabel(workflow.on_reject_status)}
                        </Badge>
                      </div>
                    </div>
                    
                    {/* Projects scope */}
                    <div className="mt-2 text-xs text-slate-500">
                      Applies to: {workflow.project_ids?.length === 0 
                        ? 'All Projects' 
                        : `${workflow.project_ids.length} project(s)`}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleToggle(workflow)}
                      data-testid={`toggle-workflow-${workflow.id}`}
                    >
                      {workflow.is_enabled ? (
                        <ToggleRight className="w-5 h-5 text-green-600" />
                      ) : (
                        <ToggleLeft className="w-5 h-5 text-slate-400" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEditDialog(workflow)}
                      data-testid={`edit-workflow-${workflow.id}`}
                    >
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setWorkflowToDelete(workflow);
                        setDeleteConfirmOpen(true);
                      }}
                      data-testid={`delete-workflow-${workflow.id}`}
                    >
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingWorkflow ? 'Edit Workflow' : 'Create Approval Workflow'}
            </DialogTitle>
            <DialogDescription>
              Define when and how tasks require approval before status changes
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Name & Description */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Workflow Name *</Label>
                <Input
                  placeholder="e.g., Manager Approval for Completion"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  data-testid="workflow-name-input"
                />
              </div>
              <div className="space-y-2">
                <Label>Projects</Label>
                <Select
                  value={formData.project_ids.length === 0 ? 'all' : 'selected'}
                  onValueChange={(v) => setFormData(prev => ({
                    ...prev,
                    project_ids: v === 'all' ? [] : prev.project_ids
                  }))}
                >
                  <SelectTrigger data-testid="project-scope-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Projects</SelectItem>
                    <SelectItem value="selected">Specific Projects</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                placeholder="Describe when this workflow applies..."
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                rows={2}
              />
            </div>

            {/* Trigger Condition */}
            <div className="bg-slate-50 rounded-lg p-4 border">
              <h4 className="font-medium text-slate-900 mb-3">Trigger Condition</h4>
              <div className="space-y-2">
                <Label>When task status changes to:</Label>
                <Select
                  value={formData.trigger_status}
                  onValueChange={(v) => setFormData(prev => ({ ...prev, trigger_status: v }))}
                >
                  <SelectTrigger data-testid="trigger-status-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TASK_STATUSES.map(s => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-slate-500">
                  The workflow will be triggered when a task moves to this status
                </p>
              </div>
            </div>

            {/* Approval Type */}
            <div className="bg-slate-50 rounded-lg p-4 border">
              <h4 className="font-medium text-slate-900 mb-3">Approval Type</h4>
              <div className="grid grid-cols-2 gap-4">
                <div
                  className={`p-4 rounded-lg border cursor-pointer transition-colors ${
                    formData.approval_type === 'single'
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                  onClick={() => setFormData(prev => ({ ...prev, approval_type: 'single' }))}
                  data-testid="approval-type-single"
                >
                  <UserCheck className="w-6 h-6 text-blue-600 mb-2" />
                  <h5 className="font-medium">Single Approver</h5>
                  <p className="text-xs text-slate-500">Any one approver can approve/reject</p>
                </div>
                <div
                  className={`p-4 rounded-lg border cursor-pointer transition-colors ${
                    formData.approval_type === 'sequential'
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                  onClick={() => setFormData(prev => ({ ...prev, approval_type: 'sequential' }))}
                  data-testid="approval-type-sequential"
                >
                  <GitBranch className="w-6 h-6 text-blue-600 mb-2" />
                  <h5 className="font-medium">Multi-step Sequential</h5>
                  <p className="text-xs text-slate-500">Approvals happen in order</p>
                </div>
              </div>
            </div>

            {/* Approvers */}
            <div className="bg-slate-50 rounded-lg p-4 border">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-medium text-slate-900">
                  Approvers {formData.approval_type === 'sequential' && '(in order)'}
                </h4>
                <Button variant="outline" size="sm" onClick={addApproverStep}>
                  <Plus className="w-4 h-4 mr-1" />
                  Add Step
                </Button>
              </div>
              
              <div className="space-y-3">
                {formData.approvers.map((approver, idx) => (
                  <div key={idx} className="flex items-center gap-3 bg-white p-3 rounded border">
                    {formData.approval_type === 'sequential' && (
                      <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-sm font-medium">
                        {idx + 1}
                      </div>
                    )}
                    
                    <Select
                      value={approver.type}
                      onValueChange={(v) => updateApprover(idx, 'type', v)}
                    >
                      <SelectTrigger className="w-40" data-testid={`approver-type-${idx}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {APPROVER_TYPES.map(t => (
                          <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    
                    {approver.type === 'user' && (
                      <Select
                        value={approver.value}
                        onValueChange={(v) => updateApprover(idx, 'value', v)}
                      >
                        <SelectTrigger className="flex-1" data-testid={`approver-user-${idx}`}>
                          <SelectValue placeholder="Select user" />
                        </SelectTrigger>
                        <SelectContent>
                          {users.map(u => (
                            <SelectItem key={u.id} value={u.id}>
                              {u.name || u.email}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    
                    {approver.type === 'role' && (
                      <Select
                        value={approver.value}
                        onValueChange={(v) => updateApprover(idx, 'value', v)}
                      >
                        <SelectTrigger className="flex-1" data-testid={`approver-role-${idx}`}>
                          <SelectValue placeholder="Select role" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="manager">Manager</SelectItem>
                          <SelectItem value="user">User</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                    
                    {approver.type === 'field' && (
                      <Select
                        value={approver.value}
                        onValueChange={(v) => updateApprover(idx, 'value', v)}
                      >
                        <SelectTrigger className="flex-1" data-testid={`approver-field-${idx}`}>
                          <SelectValue placeholder="Select field" />
                        </SelectTrigger>
                        <SelectContent>
                          {TASK_FIELDS.map(f => (
                            <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    
                    {formData.approvers.length > 1 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeApproverStep(idx)}
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Outcome Status */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                  On Approval, move to:
                </Label>
                <Select
                  value={formData.on_approve_status}
                  onValueChange={(v) => setFormData(prev => ({ ...prev, on_approve_status: v }))}
                >
                  <SelectTrigger data-testid="on-approve-status-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TASK_STATUSES.filter(s => s.value !== formData.trigger_status).map(s => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <XCircle className="w-4 h-4 text-red-600" />
                  On Rejection, move to:
                </Label>
                <Select
                  value={formData.on_reject_status}
                  onValueChange={(v) => setFormData(prev => ({ ...prev, on_reject_status: v }))}
                >
                  <SelectTrigger data-testid="on-reject-status-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TASK_STATUSES.filter(s => s.value !== formData.trigger_status).map(s => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Warning for potential loop */}
            {formData.trigger_status === formData.on_reject_status && (
              <div className="flex items-center gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-800 text-sm">
                <AlertCircle className="w-4 h-4" />
                Warning: Rejection status is the same as trigger status. This may cause repeated approval requests.
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editingWorkflow ? 'Update Workflow' : 'Create Workflow'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Workflow</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{workflowToDelete?.name}&quot;? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ApprovalWorkflowsPage;
