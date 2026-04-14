/**
 * Task Detail Modal
 * Full task view with editing, subtasks, checklist, comments, and dependencies
 */
import React, { useState, useEffect } from 'react';
import {
  X, Loader2, Calendar, Tag, User, Flag, Trash2,
  CheckCircle2, Circle, Plus, MoreHorizontal, Clock,
  Link as LinkIcon, MessageSquare, Edit2, Save, History, Paperclip,
  Timer, Type, AlertCircle, CheckCircle, XCircle, GitBranch, Lock
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { Badge } from '../../components/ui/badge';
import { Label } from '../../components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '../../components/ui/sheet';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import { Checkbox } from '../../components/ui/checkbox';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '../../components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import UserAssignmentDropdown from './UserAssignmentDropdown';
import TaskComments from './TaskComments';
import TaskDependencies from './TaskDependencies';
import TaskAttachments from './TaskAttachments';
import TaskCustomFields from './TaskCustomFields';
import TaskTimeTracking from './TaskTimeTracking';
import TaskAIAssistant from './TaskAIAssistant';
import GitHubSyncSection from './GitHubSyncSection';
import TaskRecurrence from './TaskRecurrence';
import { toast } from 'sonner';
import { Repeat } from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const priorityColors = {
  low: 'bg-slate-100 text-slate-600',
  medium: 'bg-blue-100 text-blue-600',
  high: 'bg-orange-100 text-orange-600',
  urgent: 'bg-red-100 text-red-600',
};

const statusColors = {
  todo: 'bg-slate-100 text-slate-600',
  in_progress: 'bg-blue-100 text-blue-600',
  pending_approval: 'bg-amber-100 text-amber-600',
  blocked: 'bg-red-100 text-red-600',
  done: 'bg-green-100 text-green-600',
};

const slaStatusColors = {
  on_track: 'bg-green-100 text-green-700',
  at_risk: 'bg-yellow-100 text-yellow-700',
  breached: 'bg-red-100 text-red-700',
  paused: 'bg-slate-100 text-slate-600',
  'n/a': 'bg-slate-50 text-slate-400',
};

const slaStatusLabels = {
  on_track: 'On Track',
  at_risk: 'At Risk',
  breached: 'Breached',
  paused: 'Paused',
  'n/a': 'No SLA',
};

const TaskDetailModal = ({ task, onClose, onUpdate, onDelete }) => {
  const [loading, setLoading] = useState(false);
  const [taskDetails, setTaskDetails] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [formData, setFormData] = useState({});
  const [newSubtask, setNewSubtask] = useState('');
  const [newChecklistItem, setNewChecklistItem] = useState('');
  const [saving, setSaving] = useState(false);
  const [slaStatus, setSlaStatus] = useState(null);
  
  // Approval state
  const [approval, setApproval] = useState(null);
  const [approvalHistory, setApprovalHistory] = useState([]);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectComment, setRejectComment] = useState('');
  const [processingApproval, setProcessingApproval] = useState(false);

  useEffect(() => {
    fetchTaskDetails();
  }, [task.id]);

  // Fetch approval status
  const fetchApprovalStatus = async () => {
    try {
      const token = localStorage.getItem('token');
      
      // Fetch current approval
      const approvalRes = await fetch(`${API_URL}/api/task-manager/tasks/${task.id}/approval`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (approvalRes.ok) {
        const data = await approvalRes.json();
        setApproval(data.approval);
      }
      
      // Fetch approval history
      const historyRes = await fetch(`${API_URL}/api/task-manager/tasks/${task.id}/approval-history`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (historyRes.ok) {
        const data = await historyRes.json();
        setApprovalHistory(data.history || []);
      }
    } catch (err) {
      console.error('Error fetching approval status:', err);
    }
  };

  // Fetch SLA status
  const fetchSLAStatus = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/task-manager/tasks/${task.id}/sla`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setSlaStatus(data);
      }
    } catch (err) {
      console.error('Error fetching SLA status:', err);
    }
  };

  useEffect(() => {
    if (taskDetails) {
      fetchSLAStatus();
      fetchApprovalStatus();
    }
  }, [taskDetails?.id]);

  // Handle approval action
  const handleApprovalAction = async (action) => {
    if (action === 'reject' && !rejectComment.trim()) {
      toast.error('Please provide a reason for rejection');
      return;
    }
    
    setProcessingApproval(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/task-manager/approvals/${approval.id}/action`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action,
          comment: action === 'reject' ? rejectComment : null
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        toast.success(`Task ${action === 'approve' ? 'approved' : 'rejected'} successfully`);
        setShowRejectDialog(false);
        setRejectComment('');
        
        // Refresh task details
        fetchTaskDetails();
        
        // Update parent list
        if (onUpdate && data.new_task_status) {
          onUpdate({ ...taskDetails, status: data.new_task_status, approval_status: data.approval.status });
        }
      } else {
        const error = await response.json();
        toast.error(error.detail || `Failed to ${action} task`);
      }
    } catch (error) {
      console.error('Error processing approval:', error);
      toast.error('Failed to process approval');
    } finally {
      setProcessingApproval(false);
    }
  };

  const fetchTaskDetails = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/task-manager/tasks/${task.id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (!response.ok) throw new Error('Failed to fetch task details');
      
      const data = await response.json();
      setTaskDetails(data);
      setFormData({
        title: data.title,
        description: data.description || '',
        status: data.status,
        priority: data.priority,
        task_type: data.task_type,
        due_date: data.due_date ? data.due_date.split('T')[0] : '',
      });
    } catch (err) {
      console.error('Error fetching task details:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const token = localStorage.getItem('token');
      
      const payload = {
        ...formData,
        due_date: formData.due_date ? new Date(formData.due_date).toISOString() : null,
      };

      const response = await fetch(`${API_URL}/api/task-manager/tasks/${task.id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error('Failed to update task');

      const updated = await response.json();
      setTaskDetails({ ...taskDetails, ...updated });
      setEditMode(false);
      onUpdate(updated);
    } catch (err) {
      console.error('Error updating task:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to delete this task?')) return;
    
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/task-manager/tasks/${task.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!response.ok) throw new Error('Failed to delete task');

      onDelete(task.id);
    } catch (err) {
      console.error('Error deleting task:', err);
    }
  };

  const handleAddSubtask = async (e) => {
    e.preventDefault();
    if (!newSubtask.trim()) return;

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/task-manager/subtasks`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: newSubtask,
          task_id: task.id,
          status: 'todo',
        }),
      });

      if (!response.ok) throw new Error('Failed to create subtask');

      const created = await response.json();
      setTaskDetails(prev => ({
        ...prev,
        subtasks: [...(prev.subtasks || []), created],
      }));
      setNewSubtask('');
    } catch (err) {
      console.error('Error creating subtask:', err);
    }
  };

  const handleToggleSubtask = async (subtask) => {
    try {
      const token = localStorage.getItem('token');
      const newStatus = subtask.status === 'done' ? 'todo' : 'done';
      
      const response = await fetch(`${API_URL}/api/task-manager/subtasks/${subtask.id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!response.ok) throw new Error('Failed to update subtask');

      setTaskDetails(prev => ({
        ...prev,
        subtasks: prev.subtasks.map(s => 
          s.id === subtask.id ? { ...s, status: newStatus } : s
        ),
      }));
    } catch (err) {
      console.error('Error updating subtask:', err);
    }
  };

  const handleAddChecklistItem = async (e) => {
    e.preventDefault();
    if (!newChecklistItem.trim()) return;

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/task-manager/checklist`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: newChecklistItem,
          task_id: task.id,
          is_completed: false,
        }),
      });

      if (!response.ok) throw new Error('Failed to create checklist item');

      const created = await response.json();
      setTaskDetails(prev => ({
        ...prev,
        checklist_items: [...(prev.checklist_items || []), created],
      }));
      setNewChecklistItem('');
    } catch (err) {
      console.error('Error creating checklist item:', err);
    }
  };

  const handleToggleChecklistItem = async (item) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/task-manager/checklist/${item.id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ is_completed: !item.is_completed }),
      });

      if (!response.ok) throw new Error('Failed to update checklist item');

      setTaskDetails(prev => ({
        ...prev,
        checklist_items: prev.checklist_items.map(c => 
          c.id === item.id ? { ...c, is_completed: !c.is_completed } : c
        ),
      }));
    } catch (err) {
      console.error('Error updating checklist item:', err);
    }
  };

  if (loading || !taskDetails) {
    return (
      <Sheet open onOpenChange={onClose}>
        <SheetContent className="sm:max-w-xl overflow-y-auto">
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Sheet open onOpenChange={onClose}>
      <SheetContent className="sm:max-w-xl overflow-y-auto" data-testid="task-detail-modal">
        <SheetHeader className="mb-6">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              {editMode ? (
                <Input
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="text-xl font-bold"
                  data-testid="task-detail-title-input"
                />
              ) : (
                <SheetTitle className="text-xl">{taskDetails.title}</SheetTitle>
              )}
            </div>
            <div className="flex items-center gap-2 ml-4">
              {editMode ? (
                <>
                  <Button size="sm" variant="outline" onClick={() => setEditMode(false)}>
                    Cancel
                  </Button>
                  <Button size="sm" onClick={handleSave} disabled={saving}>
                    {saving && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
                    Save
                  </Button>
                </>
              ) : (
                <>
                  <Button size="sm" variant="outline" onClick={() => setEditMode(true)}>
                    <Edit2 className="w-4 h-4" />
                  </Button>
                  <Button size="sm" variant="outline" className="text-red-600" onClick={handleDelete}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </>
              )}
            </div>
          </div>
        </SheetHeader>

        <div className="space-y-6">
          {/* Status & Priority */}
          <div className="flex gap-4">
            <div className="flex-1">
              <Label className="text-xs text-slate-500 mb-1">Status</Label>
              {editMode ? (
                <Select
                  value={formData.status}
                  onValueChange={(v) => setFormData({ ...formData, status: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todo">To Do</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="pending_approval">Pending Approval</SelectItem>
                    <SelectItem value="blocked">Blocked</SelectItem>
                    <SelectItem value="done">Done</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <Badge className={`${statusColors[taskDetails.status]} capitalize`}>
                  {taskDetails.status?.replace('_', ' ')}
                </Badge>
              )}
            </div>
            <div className="flex-1">
              <Label className="text-xs text-slate-500 mb-1">Priority</Label>
              {editMode ? (
                <Select
                  value={formData.priority}
                  onValueChange={(v) => setFormData({ ...formData, priority: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <Badge className={`${priorityColors[taskDetails.priority]} capitalize`}>
                  {taskDetails.priority}
                </Badge>
              )}
            </div>
          </div>

          {/* Type & Due Date */}
          <div className="flex gap-4">
            <div className="flex-1">
              <Label className="text-xs text-slate-500 mb-1">Type</Label>
              {editMode ? (
                <Select
                  value={formData.task_type}
                  onValueChange={(v) => setFormData({ ...formData, task_type: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="other">Task</SelectItem>
                    <SelectItem value="bug">Bug</SelectItem>
                    <SelectItem value="feature">Feature</SelectItem>
                    <SelectItem value="support">Support</SelectItem>
                    <SelectItem value="sales">Sales</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-sm text-slate-700 capitalize">{taskDetails.task_type || 'Task'}</p>
              )}
            </div>
            <div className="flex-1">
              <Label className="text-xs text-slate-500 mb-1">Due Date</Label>
              {editMode ? (
                <Input
                  type="date"
                  value={formData.due_date}
                  onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                />
              ) : (
                <p className="text-sm text-slate-700 flex items-center gap-1">
                  <Calendar className="w-4 h-4 text-slate-400" />
                  {taskDetails.due_date 
                    ? new Date(taskDetails.due_date).toLocaleDateString()
                    : 'No due date'}
                </p>
              )}
            </div>
          </div>

          {/* SLA Status */}
          {slaStatus && slaStatus.status !== 'n/a' && (
            <div className="bg-slate-50 rounded-lg p-3 border">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-slate-400" />
                  <span className="text-xs font-medium text-slate-600">SLA Status</span>
                </div>
                <Badge className={slaStatusColors[slaStatus.status] || 'bg-slate-100'}>
                  {slaStatus.status === 'at_risk' && <AlertCircle className="w-3 h-3 mr-1" />}
                  {slaStatusLabels[slaStatus.status] || slaStatus.status}
                </Badge>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-500">
                <div>
                  <span className="block font-medium text-slate-600">Elapsed</span>
                  {Math.floor(slaStatus.elapsed_minutes / 60)}h {slaStatus.elapsed_minutes % 60}m
                </div>
                <div>
                  <span className="block font-medium text-slate-600">Remaining</span>
                  {slaStatus.remaining_minutes > 0 
                    ? `${Math.floor(slaStatus.remaining_minutes / 60)}h ${slaStatus.remaining_minutes % 60}m`
                    : 'Exceeded'}
                </div>
              </div>
              {/* Progress bar */}
              <div className="mt-2 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                <div 
                  className={`h-full transition-all ${
                    slaStatus.status === 'on_track' ? 'bg-green-500' :
                    slaStatus.status === 'at_risk' ? 'bg-yellow-500' :
                    slaStatus.status === 'breached' ? 'bg-red-500' : 'bg-slate-400'
                  }`}
                  style={{ width: `${Math.min(100, slaStatus.percent_used || 0)}%` }}
                />
              </div>
            </div>
          )}

          {/* Approval Panel */}
          {approval && (
            <div className="bg-amber-50 rounded-lg p-4 border border-amber-200">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <GitBranch className="w-4 h-4 text-amber-600" />
                  <span className="font-medium text-amber-800">Pending Approval</span>
                </div>
                <Badge className="bg-amber-100 text-amber-700">
                  {approval.approval_type === 'sequential' ? 'Multi-step' : 'Single'}
                </Badge>
              </div>
              
              {/* Approvers Progress */}
              <div className="space-y-2 mb-4">
                <p className="text-xs text-amber-700 font-medium">Approvers:</p>
                {approval.approvers?.map((approver, idx) => (
                  <div
                    key={idx}
                    className={`flex items-center gap-2 text-sm ${
                      approver.status === 'approved' ? 'text-green-700' :
                      approver.status === 'rejected' ? 'text-red-700' :
                      idx === approval.current_step ? 'text-amber-800 font-medium' : 'text-slate-500'
                    }`}
                  >
                    {approval.approval_type === 'sequential' && (
                      <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${
                        approver.status === 'approved' ? 'bg-green-100 text-green-700' :
                        approver.status === 'rejected' ? 'bg-red-100 text-red-700' :
                        idx === approval.current_step ? 'bg-amber-200 text-amber-800' : 'bg-slate-100'
                      }`}>
                        {idx + 1}
                      </span>
                    )}
                    {approver.status === 'approved' && <CheckCircle className="w-4 h-4" />}
                    {approver.status === 'rejected' && <XCircle className="w-4 h-4" />}
                    {approver.status === 'pending' && <Clock className="w-4 h-4" />}
                    <span>{approver.user_name}</span>
                    {approver.type === 'role' && <span className="text-xs">({approver.role_name})</span>}
                    {idx === approval.current_step && approver.status === 'pending' && (
                      <Badge variant="outline" className="text-xs">Current</Badge>
                    )}
                  </div>
                ))}
              </div>
              
              {/* Action Buttons - Only show if user can act */}
              {approval.approvers?.some(a => a.status === 'pending') && (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="bg-green-600 hover:bg-green-700 text-white flex-1"
                    onClick={() => handleApprovalAction('approve')}
                    disabled={processingApproval}
                    data-testid="approve-task-btn"
                  >
                    {processingApproval ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <CheckCircle className="w-4 h-4 mr-1" />
                        Approve
                      </>
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="flex-1"
                    onClick={() => setShowRejectDialog(true)}
                    disabled={processingApproval}
                    data-testid="reject-task-btn"
                  >
                    <XCircle className="w-4 h-4 mr-1" />
                    Reject
                  </Button>
                </div>
              )}
              
              {/* Read-only notice */}
              <div className="flex items-center gap-2 mt-3 p-2 bg-white/50 rounded text-xs text-amber-700">
                <Lock className="w-3 h-3" />
                Task is locked while pending approval
              </div>
            </div>
          )}

          {/* Approval History */}
          {approvalHistory.length > 0 && !approval && (
            <div className="bg-slate-50 rounded-lg p-3 border">
              <div className="flex items-center gap-2 mb-2">
                <History className="w-4 h-4 text-slate-500" />
                <span className="text-xs font-medium text-slate-600">Approval History</span>
              </div>
              <div className="space-y-2">
                {approvalHistory.slice(0, 3).map((hist, idx) => (
                  <div key={idx} className="text-xs">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className={
                          hist.status === 'approved' ? 'bg-green-50 text-green-700 border-green-200' :
                          hist.status === 'rejected' ? 'bg-red-50 text-red-700 border-red-200' :
                          hist.status === 'cancelled' ? 'bg-slate-50 text-slate-600' : ''
                        }
                      >
                        {hist.status}
                      </Badge>
                      <span className="text-slate-500">
                        {new Date(hist.completed_at || hist.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* GitHub Integration - Phase 12 */}
          <GitHubSyncSection 
            task={taskDetails} 
            onUpdate={(updatedTask) => {
              setTaskDetails({ ...taskDetails, ...updatedTask });
              onUpdate(updatedTask);
            }}
          />

          {/* Assignee */}
          <UserAssignmentDropdown
            currentAssignee={taskDetails.assignee}
            taskId={task.id}
            onAssign={(updatedTask) => {
              setTaskDetails({ ...taskDetails, assignee: updatedTask.assignee, assignee_id: updatedTask.assignee_id });
              onUpdate(updatedTask);
            }}
          />

          {/* Description */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <Label className="text-xs text-slate-500">Description</Label>
              {!editMode && (
                <TaskAIAssistant
                  taskId={task.id}
                  projectId={taskDetails.project_id}
                  currentDescription={taskDetails.description}
                  onDescriptionUpdate={(newDescription) => {
                    // Update the description via API
                    const updateDescription = async () => {
                      try {
                        const token = localStorage.getItem('token');
                        await fetch(`${API_URL}/api/task-manager/tasks/${task.id}`, {
                          method: 'PUT',
                          headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json'
                          },
                          body: JSON.stringify({ description: newDescription })
                        });
                        fetchTaskDetails();
                      } catch (error) {
                        console.error('Error updating description:', error);
                      }
                    };
                    updateDescription();
                  }}
                />
              )}
            </div>
            {editMode ? (
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={4}
                placeholder="Add a description..."
              />
            ) : (
              <p className="text-sm text-slate-700 whitespace-pre-wrap">
                {taskDetails.description || 'No description'}
              </p>
            )}
          </div>

          {/* Subtasks */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-xs text-slate-500">
                Subtasks ({taskDetails.subtasks?.filter(s => s.status === 'done').length || 0}/{taskDetails.subtasks?.length || 0})
              </Label>
            </div>
            
            <div className="space-y-2 mb-3">
              {taskDetails.subtasks?.map((subtask) => (
                <div 
                  key={subtask.id}
                  className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg"
                >
                  <button
                    onClick={() => handleToggleSubtask(subtask)}
                    className="flex-shrink-0"
                  >
                    {subtask.status === 'done' ? (
                      <CheckCircle2 className="w-5 h-5 text-green-500" />
                    ) : (
                      <Circle className="w-5 h-5 text-slate-300" />
                    )}
                  </button>
                  <span className={`text-sm flex-1 ${
                    subtask.status === 'done' ? 'line-through text-slate-400' : 'text-slate-700'
                  }`}>
                    {subtask.title}
                  </span>
                </div>
              ))}
            </div>

            <form onSubmit={handleAddSubtask} className="flex gap-2">
              <Input
                placeholder="Add a subtask..."
                value={newSubtask}
                onChange={(e) => setNewSubtask(e.target.value)}
                className="flex-1"
                data-testid="add-subtask-input"
              />
              <Button type="submit" size="sm" variant="outline">
                <Plus className="w-4 h-4" />
              </Button>
            </form>
          </div>

          {/* Checklist */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-xs text-slate-500">
                Checklist ({taskDetails.checklist_items?.filter(c => c.is_completed).length || 0}/{taskDetails.checklist_items?.length || 0})
              </Label>
            </div>
            
            {/* Progress Bar */}
            {taskDetails.checklist_items?.length > 0 && (
              <div className="h-2 bg-slate-100 rounded-full mb-3 overflow-hidden">
                <div 
                  className="h-full bg-green-500 transition-all"
                  style={{ 
                    width: `${(taskDetails.checklist_items.filter(c => c.is_completed).length / taskDetails.checklist_items.length) * 100}%` 
                  }}
                />
              </div>
            )}

            <div className="space-y-2 mb-3">
              {taskDetails.checklist_items?.map((item) => (
                <div 
                  key={item.id}
                  className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg"
                >
                  <Checkbox
                    checked={item.is_completed}
                    onCheckedChange={() => handleToggleChecklistItem(item)}
                  />
                  <span className={`text-sm flex-1 ${
                    item.is_completed ? 'line-through text-slate-400' : 'text-slate-700'
                  }`}>
                    {item.title}
                  </span>
                </div>
              ))}
            </div>

            <form onSubmit={handleAddChecklistItem} className="flex gap-2">
              <Input
                placeholder="Add checklist item..."
                value={newChecklistItem}
                onChange={(e) => setNewChecklistItem(e.target.value)}
                className="flex-1"
                data-testid="add-checklist-input"
              />
              <Button type="submit" size="sm" variant="outline">
                <Plus className="w-4 h-4" />
              </Button>
            </form>
          </div>

          {/* Comments, Dependencies, Attachments, Time, Fields, Activity Tabs */}
          <Tabs defaultValue="comments" className="mt-6">
            <TabsList className="grid w-full grid-cols-7">
              <TabsTrigger value="comments" className="text-xs px-2">
                <MessageSquare className="w-3 h-3 mr-1" />
                Comments
              </TabsTrigger>
              <TabsTrigger value="attachments" className="text-xs px-2" data-testid="attachments-tab">
                <Paperclip className="w-3 h-3 mr-1" />
                Files
              </TabsTrigger>
              <TabsTrigger value="time" className="text-xs px-2" data-testid="time-tracking-tab">
                <Timer className="w-3 h-3 mr-1" />
                Time
              </TabsTrigger>
              <TabsTrigger value="fields" className="text-xs px-2" data-testid="custom-fields-tab">
                <Type className="w-3 h-3 mr-1" />
                Fields
              </TabsTrigger>
              <TabsTrigger value="dependencies" className="text-xs px-2">
                <LinkIcon className="w-3 h-3 mr-1" />
                Deps
              </TabsTrigger>
              <TabsTrigger value="recurrence" className="text-xs px-2" data-testid="recurrence-tab">
                <Repeat className="w-3 h-3 mr-1" />
                Repeat
              </TabsTrigger>
              <TabsTrigger value="activity" className="text-xs px-2">
                <History className="w-3 h-3 mr-1" />
                Activity
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="comments" className="mt-4">
              <TaskComments 
                taskId={task.id} 
                onCommentAdded={() => fetchTaskDetails()}
              />
            </TabsContent>
            
            <TabsContent value="attachments" className="mt-4">
              <TaskAttachments 
                taskId={task.id}
                onUpdate={() => fetchTaskDetails()}
              />
            </TabsContent>
            
            <TabsContent value="time" className="mt-4">
              <TaskTimeTracking 
                taskId={task.id}
                onUpdate={() => fetchTaskDetails()}
              />
            </TabsContent>
            
            <TabsContent value="fields" className="mt-4">
              <TaskCustomFields 
                taskId={task.id}
                onUpdate={() => fetchTaskDetails()}
              />
            </TabsContent>
            
            <TabsContent value="dependencies" className="mt-4">
              <TaskDependencies 
                taskId={task.id}
                projectId={taskDetails.project_id}
                onUpdate={() => {
                  fetchTaskDetails();
                  onUpdate(taskDetails);
                }}
              />
            </TabsContent>
            
            <TabsContent value="recurrence" className="mt-4">
              <TaskRecurrence 
                taskId={task.id}
                onUpdate={() => fetchTaskDetails()}
              />
            </TabsContent>
            
            <TabsContent value="activity" className="mt-4">
              <ActivityLog taskId={task.id} />
            </TabsContent>
          </Tabs>

          {/* Metadata */}
          <div className="pt-4 border-t border-slate-200 text-xs text-slate-400">
            <p>Created: {new Date(taskDetails.created_at).toLocaleString()}</p>
            <p>Updated: {new Date(taskDetails.updated_at).toLocaleString()}</p>
          </div>
        </div>
      </SheetContent>

      {/* Reject Dialog */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reject Task</DialogTitle>
            <DialogDescription>
              Please provide a reason for rejecting this task. This comment is required and will be visible to the task owner.
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            <Label>Reason for Rejection *</Label>
            <Textarea
              placeholder="Explain why this task is being rejected..."
              value={rejectComment}
              onChange={(e) => setRejectComment(e.target.value)}
              rows={4}
              className="mt-2"
              data-testid="reject-reason-input"
            />
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRejectDialog(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => handleApprovalAction('reject')}
              disabled={processingApproval || !rejectComment.trim()}
            >
              {processingApproval && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Reject Task
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Sheet>
  );
};

// Activity Log Component
const ActivityLog = ({ taskId }) => {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchActivities();
  }, [taskId]);

  const fetchActivities = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/task-manager/tasks/${taskId}/activity`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setActivities(data);
      }
    } catch (err) {
      console.error('Error fetching activities:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (dateStr) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="flex justify-center py-4">
        <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-3 max-h-64 overflow-y-auto">
      {activities.length > 0 ? (
        activities.map(activity => (
          <div key={activity.id} className="flex gap-3 text-sm">
            <div className="w-2 h-2 mt-2 bg-slate-300 rounded-full flex-shrink-0" />
            <div>
              <p className="text-slate-700">
                <span className="font-medium">{activity.user?.name || 'System'}</span>
                {' '}{activity.description}
              </p>
              <p className="text-xs text-slate-400">{formatTime(activity.created_at)}</p>
            </div>
          </div>
        ))
      ) : (
        <p className="text-center text-sm text-slate-400 py-4">
          No activity recorded yet
        </p>
      )}
    </div>
  );
};

export default TaskDetailModal;
