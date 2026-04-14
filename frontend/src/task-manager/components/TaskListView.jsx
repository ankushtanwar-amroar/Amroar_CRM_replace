/**
 * Task List View Component - Phase 11
 * Displays tasks in a table/list format with inline editing and bulk selection
 */
import React, { useState, useCallback } from 'react';
import { 
  CheckCircle2, Circle, Clock, AlertTriangle, 
  ChevronRight, User, Calendar, Tag, GripVertical,
  MoreHorizontal, Ban, Square, CheckSquare, X,
  Loader2, Repeat
} from 'lucide-react';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Checkbox } from '../../components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '../../components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import { toast } from 'sonner';

const statusConfig = {
  todo: { icon: Circle, color: 'text-slate-400', bg: 'bg-slate-100', label: 'To Do' },
  in_progress: { icon: Clock, color: 'text-blue-500', bg: 'bg-blue-100', label: 'In Progress' },
  pending_approval: { icon: Clock, color: 'text-amber-500', bg: 'bg-amber-100', label: 'Pending Approval' },
  blocked: { icon: Ban, color: 'text-red-500', bg: 'bg-red-100', label: 'Blocked' },
  done: { icon: CheckCircle2, color: 'text-green-500', bg: 'bg-green-100', label: 'Done' },
};

const priorityConfig = {
  low: { color: 'text-slate-500', bg: 'bg-slate-100' },
  medium: { color: 'text-blue-600', bg: 'bg-blue-100' },
  high: { color: 'text-orange-600', bg: 'bg-orange-100' },
  urgent: { color: 'text-red-600', bg: 'bg-red-100' },
};

const API_URL = process.env.REACT_APP_BACKEND_URL;

const TaskListView = ({ tasks, onTaskClick, onTaskUpdate, projectId, onRefresh }) => {
  const [hoveredTask, setHoveredTask] = useState(null);
  const [selectedTasks, setSelectedTasks] = useState(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [showBulkComment, setShowBulkComment] = useState(false);
  const [bulkComment, setBulkComment] = useState('');

  const handleStatusToggle = async (e, task) => {
    e.stopPropagation();
    const newStatus = task.status === 'done' ? 'todo' : 'done';
    
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/task-manager/tasks/${task.id}`, {
        method: 'PUT',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status: newStatus })
      });
      
      if (response.ok) {
        const updated = await response.json();
        onTaskUpdate(updated);
      }
    } catch (err) {
      console.error('Error updating task:', err);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.ceil((date - now) / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) return { text: 'Overdue', className: 'text-red-600' };
    if (diffDays === 0) return { text: 'Today', className: 'text-amber-600' };
    if (diffDays === 1) return { text: 'Tomorrow', className: 'text-blue-600' };
    if (diffDays <= 7) return { text: `${diffDays}d`, className: 'text-slate-600' };
    
    return { 
      text: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), 
      className: 'text-slate-500' 
    };
  };

  // Selection handlers
  const toggleTaskSelection = useCallback((taskId, e) => {
    e?.stopPropagation();
    setSelectedTasks(prev => {
      const newSet = new Set(prev);
      if (newSet.has(taskId)) {
        newSet.delete(taskId);
      } else {
        newSet.add(taskId);
      }
      return newSet;
    });
  }, []);

  const selectAllTasks = useCallback(() => {
    if (selectedTasks.size === tasks.length) {
      setSelectedTasks(new Set());
    } else {
      setSelectedTasks(new Set(tasks.map(t => t.id)));
    }
  }, [tasks, selectedTasks.size]);

  const clearSelection = useCallback(() => {
    setSelectedTasks(new Set());
    setShowBulkComment(false);
    setBulkComment('');
  }, []);

  // Bulk update handler
  const handleBulkUpdate = async (updates) => {
    if (selectedTasks.size === 0) return;
    
    setBulkLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/task-manager/tasks/bulk-update`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          task_ids: Array.from(selectedTasks),
          updates
        })
      });

      const result = await response.json();
      
      if (!response.ok) {
        toast.error(result.detail || 'Bulk update failed');
        return;
      }

      // Show results
      if (result.successful > 0) {
        toast.success(`Updated ${result.successful} task(s)`);
      }
      if (result.failed > 0 || result.skipped > 0) {
        const skippedReasons = result.details
          .filter(d => d.status === 'skipped' || d.status === 'failed')
          .map(d => `${d.title || d.task_id}: ${d.reason}`)
          .slice(0, 3);
        
        toast.warning(
          `${result.failed} failed, ${result.skipped} skipped`,
          { description: skippedReasons.join('\n') }
        );
      }

      // Refresh tasks
      if (onRefresh) {
        await onRefresh();
      }
      clearSelection();
    } catch (err) {
      console.error('Bulk update error:', err);
      toast.error('Failed to perform bulk update');
    } finally {
      setBulkLoading(false);
    }
  };

  // Bulk delete handler
  const handleBulkDelete = async () => {
    if (selectedTasks.size === 0) return;
    
    if (!window.confirm(`Delete ${selectedTasks.size} task(s)? This cannot be undone.`)) {
      return;
    }
    
    setBulkLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/task-manager/tasks/bulk-delete`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(Array.from(selectedTasks))
      });

      const result = await response.json();
      
      if (response.ok) {
        toast.success(`Deleted ${result.deleted_count} task(s)`);
        if (onRefresh) await onRefresh();
        clearSelection();
      } else {
        toast.error(result.detail || 'Delete failed');
      }
    } catch (err) {
      console.error('Bulk delete error:', err);
      toast.error('Failed to delete tasks');
    } finally {
      setBulkLoading(false);
    }
  };

  // Handle bulk comment submission
  const submitBulkComment = async () => {
    if (!bulkComment.trim()) return;
    await handleBulkUpdate({ add_comment: bulkComment.trim() });
    setShowBulkComment(false);
    setBulkComment('');
  };

  const groupedTasks = {
    todo: tasks.filter(t => t.status === 'todo'),
    in_progress: tasks.filter(t => t.status === 'in_progress'),
    pending_approval: tasks.filter(t => t.status === 'pending_approval'),
    blocked: tasks.filter(t => t.status === 'blocked'),
    done: tasks.filter(t => t.status === 'done'),
  };

  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8">
        <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
          <CheckCircle2 className="w-8 h-8 text-slate-400" />
        </div>
        <h3 className="text-lg font-medium text-slate-900 mb-2">No tasks yet</h3>
        <p className="text-slate-500 text-center">
          Click &quot;New Task&quot; to create your first task
        </p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Bulk Action Bar */}
      {selectedTasks.size > 0 && (
        <div className="sticky top-0 z-10 bg-blue-50 border-b border-blue-200 px-4 py-3 flex items-center gap-4" data-testid="bulk-action-bar">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-blue-800">
              {selectedTasks.size} selected
            </span>
            <button 
              onClick={clearSelection}
              className="text-blue-600 hover:text-blue-800"
              data-testid="clear-selection-btn"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="h-4 w-px bg-blue-300" />

          {/* Status Dropdown */}
          <Select 
            onValueChange={(value) => handleBulkUpdate({ status: value })}
            disabled={bulkLoading}
          >
            <SelectTrigger className="w-32 h-8 text-sm" data-testid="bulk-status-select">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todo">To Do</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="blocked">Blocked</SelectItem>
              <SelectItem value="done">Done</SelectItem>
            </SelectContent>
          </Select>

          {/* Priority Dropdown */}
          <Select 
            onValueChange={(value) => handleBulkUpdate({ priority: value })}
            disabled={bulkLoading}
          >
            <SelectTrigger className="w-32 h-8 text-sm" data-testid="bulk-priority-select">
              <SelectValue placeholder="Priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="urgent">Urgent</SelectItem>
            </SelectContent>
          </Select>

          {/* More Actions */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" disabled={bulkLoading} data-testid="bulk-more-actions">
                More Actions
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuLabel>Bulk Actions</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setShowBulkComment(true)}>
                Add Comment to All
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleBulkUpdate({ assignee_id: null })}>
                Unassign All
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                onClick={handleBulkDelete}
                className="text-red-600 focus:text-red-600"
              >
                Delete Selected
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {bulkLoading && <Loader2 className="w-4 h-4 animate-spin text-blue-600" />}
        </div>
      )}

      {/* Bulk Comment Input */}
      {showBulkComment && (
        <div className="sticky top-14 z-10 bg-slate-50 border-b px-4 py-3 flex items-center gap-2" data-testid="bulk-comment-input">
          <Input
            placeholder="Add a comment to all selected tasks..."
            value={bulkComment}
            onChange={(e) => setBulkComment(e.target.value)}
            className="flex-1"
            autoFocus
          />
          <Button size="sm" onClick={submitBulkComment} disabled={!bulkComment.trim() || bulkLoading}>
            Add Comment
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setShowBulkComment(false)}>
            Cancel
          </Button>
        </div>
      )}

      {/* Task List */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Select All Header */}
        <div className="flex items-center gap-2 mb-4 px-2">
          <Checkbox
            checked={selectedTasks.size === tasks.length && tasks.length > 0}
            onCheckedChange={selectAllTasks}
            data-testid="select-all-checkbox"
          />
          <span className="text-sm text-slate-500">
            {selectedTasks.size === tasks.length ? 'Deselect all' : 'Select all'}
          </span>
        </div>

        {Object.entries(groupedTasks).map(([status, statusTasks]) => {
          if (statusTasks.length === 0) return null;
          
          const config = statusConfig[status];
          const StatusIcon = config.icon;
          
          return (
            <div key={status} className="mb-6">
              <div className="flex items-center gap-2 mb-3 px-2">
                <StatusIcon className={`w-4 h-4 ${config.color}`} />
                <span className="text-sm font-medium text-slate-700">{config.label}</span>
                <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                  {statusTasks.length}
                </span>
              </div>
              
              <div className="bg-white rounded-lg border border-slate-200 divide-y divide-slate-100">
                {statusTasks.map((task) => {
                  const priority = priorityConfig[task.priority] || priorityConfig.medium;
                  const dueInfo = formatDate(task.due_date);
                  const StatusIconTask = statusConfig[task.status]?.icon || Circle;
                  const isSelected = selectedTasks.has(task.id);
                  
                  return (
                    <div
                      key={task.id}
                      className={`flex items-center gap-3 px-4 py-3 hover:bg-slate-50 cursor-pointer transition-colors group ${
                        isSelected ? 'bg-blue-50 hover:bg-blue-100' : ''
                      }`}
                      onClick={() => onTaskClick(task)}
                      onMouseEnter={() => setHoveredTask(task.id)}
                      onMouseLeave={() => setHoveredTask(null)}
                      data-testid={`task-row-${task.id}`}
                    >
                      {/* Selection Checkbox */}
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleTaskSelection(task.id)}
                        onClick={(e) => e.stopPropagation()}
                        data-testid={`task-checkbox-${task.id}`}
                      />

                      {/* Status Toggle */}
                      <button
                        onClick={(e) => handleStatusToggle(e, task)}
                        className={`flex-shrink-0 ${statusConfig[task.status]?.color}`}
                        data-testid={`task-status-toggle-${task.id}`}
                      >
                        <StatusIconTask className="w-5 h-5" />
                      </button>

                      {/* Task Title */}
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium truncate ${
                          task.status === 'done' ? 'line-through text-slate-400' : 'text-slate-900'
                        }`}>
                          {task.title}
                        </p>
                        {task.subtask_count > 0 && (
                          <p className="text-xs text-slate-400 mt-0.5">
                            {task.completed_subtask_count}/{task.subtask_count} subtasks
                          </p>
                        )}
                      </div>

                      {/* Approval Status Badge */}
                      {task.approval_status === 'pending' && (
                        <Badge variant="outline" className="text-amber-600 border-amber-300 text-xs">
                          Pending Approval
                        </Badge>
                      )}

                      {/* Recurring Task Badge */}
                      {task.is_recurring_generated && (
                        <Badge variant="outline" className="text-purple-600 border-purple-300 text-xs flex items-center gap-1">
                          <Repeat className="w-3 h-3" />
                          Recurring
                        </Badge>
                      )}

                      {/* Tags */}
                      {task.tags?.length > 0 && (
                        <div className="flex gap-1">
                          {task.tags.slice(0, 2).map((tag, i) => (
                            <Badge key={i} variant="secondary" className="text-xs">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      )}

                      {/* Priority */}
                      <Badge 
                        variant="secondary" 
                        className={`${priority.bg} ${priority.color} capitalize text-xs`}
                      >
                        {task.priority}
                      </Badge>

                      {/* Due Date */}
                      {dueInfo && (
                        <span className={`text-xs flex items-center gap-1 ${dueInfo.className}`}>
                          <Calendar className="w-3 h-3" />
                          {dueInfo.text}
                        </span>
                      )}

                      {/* Assignee */}
                      {task.assignee_id && (
                        <div className="w-6 h-6 bg-slate-200 rounded-full flex items-center justify-center">
                          <User className="w-3 h-3 text-slate-500" />
                        </div>
                      )}

                      {/* More Options */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <button 
                            className={`p-1 rounded hover:bg-slate-100 transition-opacity ${
                              hoveredTask === task.id ? 'opacity-100' : 'opacity-0'
                            }`}
                          >
                            <MoreHorizontal className="w-4 h-4 text-slate-400" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onTaskClick(task); }}>
                            View Details
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default TaskListView;
