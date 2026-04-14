/**
 * Tasks Due Component - Modern Dashboard Edition
 * 
 * Displays tasks due for the current user with clean hierarchy,
 * better spacing, and improved visual design.
 */
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  CheckCircle2, Clock, ChevronRight, RefreshCw, 
  AlertTriangle, CheckSquare, Circle, Calendar
} from 'lucide-react';
import { Button } from '../../../components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select';
import { getTasksDueData } from '../services/appManagerService';

const TasksDueComponent = ({ config = {} }) => {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dateRange, setDateRange] = useState(config.date_range || 'next_7_days');
  const [overdueCount, setOverdueCount] = useState(0);

  const fetchTasks = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getTasksDueData({
        date_range: dateRange,
        show_overdue: config.show_overdue !== false,
        max_rows: config.max_rows || 10,
        show_completed: config.show_completed || false
      });
      setTasks(data.tasks || []);
      setOverdueCount(data.overdue_count || 0);
    } catch (err) {
      setError('Failed to load tasks');
      console.error('Error fetching tasks:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, [dateRange]);

  const handleTaskClick = (task) => {
    // Navigate to proper CRM task detail page
    navigate(`/crm/task/${task.id}`);
  };

  const handleMarkComplete = async (e, taskId) => {
    e.stopPropagation();
    console.log('Mark complete:', taskId);
  };

  const getPriorityConfig = (priority) => {
    switch (priority?.toLowerCase()) {
      case 'high': return { color: 'bg-rose-500', label: 'High', textColor: 'text-rose-600' };
      case 'normal': return { color: 'bg-blue-500', label: 'Normal', textColor: 'text-blue-600' };
      case 'low': return { color: 'bg-slate-400', label: 'Low', textColor: 'text-slate-500' };
      default: return { color: 'bg-slate-400', label: 'Normal', textColor: 'text-slate-500' };
    }
  };

  const formatDueDate = (dateStr) => {
    if (!dateStr) return 'No due date';
    const date = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const taskDate = new Date(date);
    taskDate.setHours(0, 0, 0, 0);
    
    if (taskDate.getTime() === today.getTime()) return 'Today';
    if (taskDate.getTime() === tomorrow.getTime()) return 'Tomorrow';
    
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined
    });
  };

  const dateRangeOptions = [
    { value: 'today', label: 'Today' },
    { value: 'next_7_days', label: 'Next 7 Days' },
    { value: 'next_15_days', label: 'Next 15 Days' },
    { value: 'next_30_days', label: 'Next 30 Days' },
    { value: 'all', label: 'All Open' }
  ];

  return (
    <div 
      className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden flex flex-col"
      style={{ height: '380px', minHeight: '380px', maxHeight: '380px' }}
      data-testid="tasks-due-component"
    >
      {/* Header - Compact & Clean */}
      <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-indigo-500 shadow-sm">
              <CheckSquare className="h-4 w-4 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                {config.title || 'Tasks Due'}
              </h3>
              <p className="text-xs text-slate-500">
                {tasks.length > 0 ? `${tasks.length} task${tasks.length > 1 ? 's' : ''}` : 'No tasks'}
                {overdueCount > 0 && <span className="text-rose-500 ml-1">• {overdueCount} overdue</span>}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Select value={dateRange} onValueChange={setDateRange}>
              <SelectTrigger className="w-[120px] h-8 text-xs bg-white border-slate-200">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {dateRangeOptions.map(opt => (
                  <SelectItem key={opt.value} value={opt.value} className="text-xs">
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button 
              variant="ghost" 
              size="icon"
              onClick={fetchTasks}
              className="h-8 w-8 hover:bg-slate-100"
              data-testid="refresh-tasks-btn"
            >
              <RefreshCw className={`h-3.5 w-3.5 text-slate-500 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </div>

      {/* Content - Scrollable area */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
        {loading ? (
          <div className="p-4 space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="animate-pulse flex items-center gap-3">
                <div className="w-4 h-4 bg-slate-200 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3.5 bg-slate-200 rounded w-3/4" />
                  <div className="h-2.5 bg-slate-100 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-10 px-4">
            <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center mb-2">
              <AlertTriangle className="h-5 w-5 text-rose-500" />
            </div>
            <p className="text-xs text-slate-600">{error}</p>
          </div>
        ) : tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 px-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center mb-3">
              <CheckCircle2 className="h-6 w-6 text-emerald-500" />
            </div>
            <p className="text-sm font-medium text-slate-800 mb-0.5">All caught up!</p>
            <p className="text-xs text-slate-500">No tasks due in this period</p>
          </div>
        ) : (
          <>
            {tasks.map((task) => {
              const priorityConfig = getPriorityConfig(task.priority);
              const isOverdue = task.is_overdue;
              
              return (
                <div
                  key={task.id}
                  onClick={() => handleTaskClick(task)}
                  className={`group flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors
                    ${isOverdue 
                      ? 'bg-rose-50/50 hover:bg-rose-50' 
                      : 'hover:bg-slate-50'
                    }`}
                  data-testid={`task-item-${task.id}`}
                >
                  {/* Checkbox Circle */}
                  <button
                    onClick={(e) => handleMarkComplete(e, task.id)}
                    className={`mt-0.5 flex-shrink-0 w-4 h-4 rounded-full border-2 transition-colors
                      ${isOverdue 
                        ? 'border-rose-300 hover:border-rose-400 hover:bg-rose-100' 
                        : 'border-slate-300 hover:border-indigo-400 hover:bg-indigo-50'
                      }`}
                    data-testid={`complete-task-${task.id}`}
                  />

                  {/* Task Info */}
                  <div className="flex-1 min-w-0">
                    {/* Subject + Priority */}
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-sm font-medium truncate ${isOverdue ? 'text-rose-900' : 'text-slate-800'}`}>
                        {task.subject}
                      </span>
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${priorityConfig.color}`} />
                    </div>
                    
                    {/* Meta Row */}
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span className={`flex items-center gap-1 ${isOverdue ? 'text-rose-600 font-medium' : ''}`}>
                        <Calendar className="h-3 w-3" />
                        {formatDueDate(task.due_date)}
                      </span>
                      {task.related_to_name && (
                        <>
                          <span className="text-slate-300">•</span>
                          <span className="truncate max-w-[120px]">{task.related_to_name}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Arrow */}
                  <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-slate-400 mt-0.5 flex-shrink-0" />
                </div>
              );
            })}
          </>
        )}
      </div>

      {/* Footer */}
      {tasks.length > 0 && (
        <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50/50">
          <button
            onClick={() => navigate('/crm/task')}
            className="w-full text-center text-xs font-medium text-indigo-600 hover:text-indigo-700 transition-colors"
            data-testid="view-all-tasks-btn"
          >
            View All Tasks →
          </button>
        </div>
      )}
    </div>
  );
};

export default TasksDueComponent;
