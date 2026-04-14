/**
 * Project Detail Page
 * Shows tasks in List, Board, Timeline, or Calendar view
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { 
  Plus, List, LayoutGrid, Calendar, ChevronLeft,
  MoreVertical, Loader2, Search, Filter, Check,
  Clock, AlertTriangle, User, Tag, GanttChart, Settings
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Switch } from '../../components/ui/switch';
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
import TaskListView from '../components/TaskListView';
import TaskBoardView from '../components/TaskBoardView';
import TimelineView from '../components/TimelineView';
import CalendarView from '../components/CalendarView';
import TaskDetailModal from '../components/TaskDetailModal';
import CreateTaskModal from '../components/CreateTaskModal';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const ProjectDetailPage = () => {
  const { projectId, view: urlView } = useParams();
  const navigate = useNavigate();
  
  const [project, setProject] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState(urlView || 'list');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTask, setSelectedTask] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showSLASettings, setShowSLASettings] = useState(false);
  const [slaConfig, setSlaConfig] = useState({
    sla_enabled: false,
    sla_default_hours: '',
    sla_start_trigger: 'creation',
    sla_pause_statuses: ['blocked']
  });
  const [savingSLA, setSavingSLA] = useState(false);

  useEffect(() => {
    if (urlView && urlView !== view) {
      setView(urlView);
    }
  }, [urlView]);

  useEffect(() => {
    fetchProject();
    fetchTasks();
  }, [projectId]);

  const fetchProject = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/task-manager/projects/${projectId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (!response.ok) throw new Error('Failed to fetch project');
      
      const data = await response.json();
      setProject(data);
      if (!urlView && data.default_view) {
        setView(data.default_view);
      }
    } catch (err) {
      console.error('Error fetching project:', err);
    }
  };

  const fetchTasks = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/task-manager/tasks?project_id=${projectId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (!response.ok) throw new Error('Failed to fetch tasks');
      
      const data = await response.json();
      setTasks(data);
    } catch (err) {
      console.error('Error fetching tasks:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchSLAConfig = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/task-manager/projects/${projectId}/sla-config`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setSlaConfig({
          sla_enabled: data.sla_enabled || false,
          sla_default_hours: data.sla_default_hours || '',
          sla_start_trigger: data.sla_start_trigger || 'creation',
          sla_pause_statuses: data.sla_pause_statuses || ['blocked']
        });
      }
    } catch (err) {
      console.error('Error fetching SLA config:', err);
    }
  };

  const handleSaveSLA = async () => {
    setSavingSLA(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/task-manager/projects/${projectId}/sla-config`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sla_enabled: slaConfig.sla_enabled,
          sla_default_hours: slaConfig.sla_default_hours ? Number(slaConfig.sla_default_hours) : null,
          sla_start_trigger: slaConfig.sla_start_trigger,
          sla_pause_statuses: slaConfig.sla_pause_statuses
        })
      });
      
      if (response.ok) {
        toast.success('SLA settings saved');
        setShowSLASettings(false);
      } else {
        toast.error('Failed to save SLA settings');
      }
    } catch (err) {
      console.error('Error saving SLA config:', err);
      toast.error('Failed to save SLA settings');
    } finally {
      setSavingSLA(false);
    }
  };

  const handleViewChange = (newView) => {
    setView(newView);
    navigate(`/task-manager/projects/${projectId}/${newView}`, { replace: true });
  };

  const handleTaskCreated = (newTask) => {
    setTasks(prev => [...prev, newTask]);
    setShowCreateModal(false);
  };

  const handleTaskUpdated = (updatedTask) => {
    setTasks(prev => prev.map(t => t.id === updatedTask.id ? updatedTask : t));
    setSelectedTask(null);
  };

  const handleTaskDeleted = (taskId) => {
    setTasks(prev => prev.filter(t => t.id !== taskId));
    setSelectedTask(null);
  };

  const handleTaskMove = async (taskId, newStatus, newOrder) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/task-manager/tasks/${taskId}/move?new_status=${newStatus}${newOrder !== undefined ? `&new_order=${newOrder}` : ''}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (!response.ok) throw new Error('Failed to move task');
      
      const updated = await response.json();
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus, order_index: newOrder ?? t.order_index } : t));
    } catch (err) {
      console.error('Error moving task:', err);
      fetchTasks(); // Refresh on error
    }
  };

  const filteredTasks = tasks.filter(t => 
    t.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading && !project) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center gap-4 mb-4">
          <Link 
            to="/task-manager/projects" 
            className="text-slate-500 hover:text-slate-700"
          >
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <div className="flex items-center gap-3">
            <div 
              className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold"
              style={{ backgroundColor: project?.color || '#3b82f6' }}
            >
              {project?.name?.charAt(0)?.toUpperCase() || 'P'}
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">{project?.name}</h1>
              <p className="text-sm text-slate-500">{project?.task_count || 0} tasks</p>
            </div>
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => { fetchSLAConfig(); setShowSLASettings(true); }}
            data-testid="project-settings-btn"
          >
            <Settings className="w-4 h-4 mr-1" />
            SLA Settings
          </Button>
        </div>

        {/* Toolbar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {/* View Toggle */}
            <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
              <button
                onClick={() => handleViewChange('list')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                  view === 'list' ? 'bg-white shadow text-slate-900' : 'text-slate-600'
                }`}
                data-testid="view-toggle-list"
              >
                <List className="w-4 h-4" />
                List
              </button>
              <button
                onClick={() => handleViewChange('board')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                  view === 'board' ? 'bg-white shadow text-slate-900' : 'text-slate-600'
                }`}
                data-testid="view-toggle-board"
              >
                <LayoutGrid className="w-4 h-4" />
                Board
              </button>
              <button
                onClick={() => handleViewChange('timeline')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                  view === 'timeline' ? 'bg-white shadow text-slate-900' : 'text-slate-600'
                }`}
                data-testid="view-toggle-timeline"
              >
                <GanttChart className="w-4 h-4" />
                Timeline
              </button>
              <button
                onClick={() => handleViewChange('calendar')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                  view === 'calendar' ? 'bg-white shadow text-slate-900' : 'text-slate-600'
                }`}
                data-testid="view-toggle-calendar"
              >
                <Calendar className="w-4 h-4" />
                Calendar
              </button>
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Search tasks..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 w-64"
              />
            </div>
          </div>

          <Button onClick={() => setShowCreateModal(true)} className="gap-2">
            <Plus className="w-4 h-4" />
            New Task
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          </div>
        ) : view === 'list' ? (
          <TaskListView 
            tasks={filteredTasks} 
            onTaskClick={setSelectedTask}
            onTaskUpdate={handleTaskUpdated}
            projectId={projectId}
          />
        ) : view === 'board' ? (
          <TaskBoardView 
            tasks={filteredTasks} 
            onTaskClick={setSelectedTask}
            onTaskMove={handleTaskMove}
            projectId={projectId}
          />
        ) : view === 'timeline' ? (
          <TimelineView
            tasks={filteredTasks}
            onTaskClick={setSelectedTask}
            projectId={projectId}
          />
        ) : (
          <CalendarView
            tasks={filteredTasks}
            onTaskClick={setSelectedTask}
            projectId={projectId}
          />
        )}
      </div>

      {/* Task Detail Modal */}
      {selectedTask && (
        <TaskDetailModal
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onUpdate={handleTaskUpdated}
          onDelete={handleTaskDeleted}
        />
      )}

      {/* Create Task Modal */}
      {showCreateModal && (
        <CreateTaskModal
          projectId={projectId}
          onClose={() => setShowCreateModal(false)}
          onCreate={handleTaskCreated}
        />
      )}

      {/* SLA Settings Dialog */}
      <Dialog open={showSLASettings} onOpenChange={setShowSLASettings}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>SLA Settings</DialogTitle>
            <DialogDescription>
              Configure Service Level Agreement tracking for this project
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Enable SLA */}
            <div className="flex items-center justify-between">
              <div>
                <Label>Enable SLA Tracking</Label>
                <p className="text-xs text-slate-500">Track resolution time for tasks</p>
              </div>
              <Switch
                checked={slaConfig.sla_enabled}
                onCheckedChange={(checked) => setSlaConfig(prev => ({ ...prev, sla_enabled: checked }))}
                data-testid="sla-enabled-switch"
              />
            </div>

            {slaConfig.sla_enabled && (
              <>
                {/* Default Hours */}
                <div className="space-y-2">
                  <Label>Default Resolution Time (hours)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.5"
                    placeholder="e.g., 24"
                    value={slaConfig.sla_default_hours}
                    onChange={(e) => setSlaConfig(prev => ({ ...prev, sla_default_hours: e.target.value }))}
                    data-testid="sla-hours-input"
                  />
                  <p className="text-xs text-slate-500">
                    Target time to resolve tasks (new tasks will inherit this value)
                  </p>
                </div>

                {/* Start Trigger */}
                <div className="space-y-2">
                  <Label>SLA Timer Starts</Label>
                  <Select
                    value={slaConfig.sla_start_trigger}
                    onValueChange={(value) => setSlaConfig(prev => ({ ...prev, sla_start_trigger: value }))}
                  >
                    <SelectTrigger data-testid="sla-trigger-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="creation">When task is created</SelectItem>
                      <SelectItem value="status_change">When task starts (leaves "To Do")</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Info */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-xs text-blue-800">
                    <strong>SLA Status:</strong> Tasks will show as "On Track" (green), 
                    "At Risk" (yellow when &lt;25% time left), or "Breached" (red). 
                    The timer pauses when a task enters "Blocked" status.
                  </p>
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSLASettings(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveSLA} disabled={savingSLA}>
              {savingSLA && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save Settings
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ProjectDetailPage;
