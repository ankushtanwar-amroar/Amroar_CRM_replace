/**
 * Recurring Tasks Page - Phase 14
 * Admin page for managing recurring task rules
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus, Repeat, Calendar, Clock, Pause, Play, Trash2,
  ChevronRight, AlertCircle, CheckCircle, RefreshCw,
  MoreHorizontal, Edit2, History, Target, Loader2,
  CalendarDays, CalendarRange, Timer
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Badge } from '../../components/ui/badge';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { Checkbox } from '../../components/ui/checkbox';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '../../components/ui/dropdown-menu';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../components/ui/card';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '../../components/ui/tabs';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const RECURRENCE_TYPES = [
  { value: 'daily', label: 'Daily', icon: CalendarDays, description: 'Every day at a specific time' },
  { value: 'weekly', label: 'Weekly', icon: CalendarRange, description: 'Specific days of the week' },
  { value: 'monthly', label: 'Monthly', icon: Calendar, description: 'Specific day of the month' },
  { value: 'custom', label: 'Custom', icon: Timer, description: 'Every N days' },
];

const WEEKDAYS = [
  { value: 'monday', label: 'Mon' },
  { value: 'tuesday', label: 'Tue' },
  { value: 'wednesday', label: 'Wed' },
  { value: 'thursday', label: 'Thu' },
  { value: 'friday', label: 'Fri' },
  { value: 'saturday', label: 'Sat' },
  { value: 'sunday', label: 'Sun' },
];

const COMMON_TIMEZONES = [
  'UTC', 'America/New_York', 'America/Chicago', 'America/Denver',
  'America/Los_Angeles', 'Europe/London', 'Europe/Paris', 'Asia/Tokyo',
  'Asia/Shanghai', 'Asia/Kolkata', 'Australia/Sydney'
];

const RecurringTasksPage = () => {
  const [rules, setRules] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [sourceTasks, setSourceTasks] = useState([]);
  
  // Dialog states
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showLogsDialog, setShowLogsDialog] = useState(false);
  const [selectedRule, setSelectedRule] = useState(null);
  const [ruleLogs, setRuleLogs] = useState([]);
  
  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    project_id: '',
    recurrence_type: 'daily',
    source_type: 'template', // 'template' or 'task'
    source_task_id: '',
    template_id: '',
    start_date: new Date().toISOString().split('T')[0],
    end_date: '',
    time_of_day: '09:00',
    timezone: 'UTC',
    weekly_days: [],
    monthly_day: 1,
    custom_interval_days: 7,
    title_pattern: '',
  });
  const [saving, setSaving] = useState(false);

  const fetchRules = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/task-manager/recurring-tasks/rules`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setRules(data.rules || []);
      }
    } catch (error) {
      console.error('Error fetching rules:', error);
      toast.error('Failed to load recurring task rules');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/task-manager/recurring-tasks/stats`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
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

  const fetchTemplates = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/task-manager/recurring-tasks/templates`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setTemplates(data.templates || []);
      }
    } catch (error) {
      console.error('Error fetching templates:', error);
    }
  }, []);

  const fetchSourceTasks = useCallback(async (projectId) => {
    if (!projectId) return;
    
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/task-manager/recurring-tasks/source-tasks?project_id=${projectId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setSourceTasks(data.tasks || []);
      }
    } catch (error) {
      console.error('Error fetching source tasks:', error);
    }
  }, []);

  useEffect(() => {
    fetchRules();
    fetchStats();
    fetchProjects();
    fetchTemplates();
  }, [fetchRules, fetchStats, fetchProjects, fetchTemplates]);

  useEffect(() => {
    if (formData.project_id) {
      fetchSourceTasks(formData.project_id);
    }
  }, [formData.project_id, fetchSourceTasks]);

  const handleCreateRule = async () => {
    if (!formData.name.trim()) {
      toast.error('Please enter a rule name');
      return;
    }
    
    if (!formData.project_id) {
      toast.error('Please select a project');
      return;
    }
    
    if (formData.source_type === 'template' && !formData.template_id) {
      toast.error('Please select a template');
      return;
    }
    
    if (formData.source_type === 'task' && !formData.source_task_id) {
      toast.error('Please select a source task');
      return;
    }
    
    if (formData.recurrence_type === 'weekly' && formData.weekly_days.length === 0) {
      toast.error('Please select at least one day for weekly recurrence');
      return;
    }
    
    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      const payload = {
        name: formData.name,
        description: formData.description || null,
        project_id: formData.project_id,
        recurrence_type: formData.recurrence_type,
        start_date: new Date(formData.start_date).toISOString(),
        end_date: formData.end_date ? new Date(formData.end_date).toISOString() : null,
        time_of_day: formData.time_of_day,
        timezone: formData.timezone,
        title_pattern: formData.title_pattern || null,
      };
      
      if (formData.source_type === 'template') {
        payload.template_id = formData.template_id;
      } else {
        payload.source_task_id = formData.source_task_id;
      }
      
      if (formData.recurrence_type === 'weekly') {
        payload.weekly_days = formData.weekly_days;
      } else if (formData.recurrence_type === 'monthly') {
        payload.monthly_day = parseInt(formData.monthly_day);
      } else if (formData.recurrence_type === 'custom') {
        payload.custom_interval_days = parseInt(formData.custom_interval_days);
      }
      
      const response = await fetch(`${API_URL}/api/task-manager/recurring-tasks/rules`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      
      if (response.ok) {
        toast.success('Recurring task rule created successfully');
        setShowCreateDialog(false);
        resetForm();
        fetchRules();
        fetchStats();
      } else {
        const error = await response.json();
        toast.error(error.detail || 'Failed to create rule');
      }
    } catch (error) {
      console.error('Error creating rule:', error);
      toast.error('Failed to create rule');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateRule = async () => {
    if (!selectedRule) return;
    
    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      const payload = {
        name: formData.name,
        description: formData.description || null,
        end_date: formData.end_date ? new Date(formData.end_date).toISOString() : null,
        time_of_day: formData.time_of_day,
        timezone: formData.timezone,
        title_pattern: formData.title_pattern || null,
      };
      
      if (formData.recurrence_type === 'weekly') {
        payload.weekly_days = formData.weekly_days;
      } else if (formData.recurrence_type === 'monthly') {
        payload.monthly_day = parseInt(formData.monthly_day);
      } else if (formData.recurrence_type === 'custom') {
        payload.custom_interval_days = parseInt(formData.custom_interval_days);
      }
      
      const response = await fetch(`${API_URL}/api/task-manager/recurring-tasks/rules/${selectedRule.id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      
      if (response.ok) {
        toast.success('Rule updated successfully');
        setShowEditDialog(false);
        fetchRules();
      } else {
        const error = await response.json();
        toast.error(error.detail || 'Failed to update rule');
      }
    } catch (error) {
      console.error('Error updating rule:', error);
      toast.error('Failed to update rule');
    } finally {
      setSaving(false);
    }
  };

  const handlePauseResume = async (rule) => {
    try {
      const token = localStorage.getItem('token');
      const action = rule.is_paused ? 'resume' : 'pause';
      
      const response = await fetch(`${API_URL}/api/task-manager/recurring-tasks/rules/${rule.id}/${action}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      
      if (response.ok) {
        toast.success(`Rule ${action}d successfully`);
        fetchRules();
        fetchStats();
      } else {
        toast.error(`Failed to ${action} rule`);
      }
    } catch (error) {
      console.error('Error toggling rule:', error);
      toast.error('Failed to update rule');
    }
  };

  const handleDelete = async (rule) => {
    if (!window.confirm('Are you sure you want to delete this recurrence rule? Existing generated tasks will not be affected.')) {
      return;
    }
    
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/task-manager/recurring-tasks/rules/${rule.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      
      if (response.ok) {
        toast.success('Rule deleted successfully');
        fetchRules();
        fetchStats();
      } else {
        toast.error('Failed to delete rule');
      }
    } catch (error) {
      console.error('Error deleting rule:', error);
      toast.error('Failed to delete rule');
    }
  };

  const handleRunNow = async (rule) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/task-manager/recurring-tasks/rules/${rule.id}/run-now`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.task) {
          toast.success(`Task "${data.task.title}" created successfully`);
        } else {
          toast(data.message, { icon: 'ℹ️' });
        }
        fetchRules();
        fetchStats();
      } else {
        const error = await response.json();
        toast.error(error.detail || 'Failed to generate task');
      }
    } catch (error) {
      console.error('Error running rule:', error);
      toast.error('Failed to generate task');
    }
  };

  const handleViewLogs = async (rule) => {
    setSelectedRule(rule);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/task-manager/recurring-tasks/rules/${rule.id}/logs`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      
      if (response.ok) {
        const data = await response.json();
        setRuleLogs(data.logs || []);
        setShowLogsDialog(true);
      }
    } catch (error) {
      console.error('Error fetching logs:', error);
    }
  };

  const openEditDialog = (rule) => {
    setSelectedRule(rule);
    setFormData({
      name: rule.name,
      description: rule.description || '',
      project_id: rule.project_id,
      recurrence_type: rule.recurrence_type,
      source_type: rule.template_id ? 'template' : 'task',
      source_task_id: rule.source_task_id || '',
      template_id: rule.template_id || '',
      start_date: rule.start_date?.split('T')[0] || '',
      end_date: rule.end_date?.split('T')[0] || '',
      time_of_day: rule.time_of_day || '09:00',
      timezone: rule.timezone || 'UTC',
      weekly_days: rule.weekly_days || [],
      monthly_day: rule.monthly_day || 1,
      custom_interval_days: rule.custom_interval_days || 7,
      title_pattern: rule.title_pattern || '',
    });
    setShowEditDialog(true);
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      project_id: '',
      recurrence_type: 'daily',
      source_type: 'template',
      source_task_id: '',
      template_id: '',
      start_date: new Date().toISOString().split('T')[0],
      end_date: '',
      time_of_day: '09:00',
      timezone: 'UTC',
      weekly_days: [],
      monthly_day: 1,
      custom_interval_days: 7,
      title_pattern: '',
    });
    setSelectedRule(null);
  };

  const getRecurrenceDescription = (rule) => {
    switch (rule.recurrence_type) {
      case 'daily':
        return `Daily at ${rule.time_of_day}`;
      case 'weekly':
        const days = (rule.weekly_days || []).map(d => d.slice(0, 3)).join(', ');
        return `Weekly on ${days} at ${rule.time_of_day}`;
      case 'monthly':
        return `Monthly on day ${rule.monthly_day} at ${rule.time_of_day}`;
      case 'custom':
        return `Every ${rule.custom_interval_days} days at ${rule.time_of_day}`;
      default:
        return rule.recurrence_type;
    }
  };

  const toggleWeekday = (day) => {
    const updated = formData.weekly_days.includes(day)
      ? formData.weekly_days.filter(d => d !== day)
      : [...formData.weekly_days, day];
    setFormData({ ...formData, weekly_days: updated });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64" data-testid="recurring-tasks-loading">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6" data-testid="recurring-tasks-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Repeat className="w-6 h-6 text-blue-600" />
            Recurring Tasks
          </h1>
          <p className="text-slate-500 mt-1">
            Automate repetitive tasks with scheduled recurrence rules
          </p>
        </div>
        <Button
          onClick={() => {
            resetForm();
            setShowCreateDialog(true);
          }}
          data-testid="create-recurrence-btn"
        >
          <Plus className="w-4 h-4 mr-2" />
          Create Rule
        </Button>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">Active Rules</p>
                  <p className="text-2xl font-bold text-slate-900">{stats.active_rules}</p>
                </div>
                <CheckCircle className="w-8 h-8 text-green-500" />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">Paused Rules</p>
                  <p className="text-2xl font-bold text-slate-900">{stats.paused_rules}</p>
                </div>
                <Pause className="w-8 h-8 text-amber-500" />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">Tasks Generated</p>
                  <p className="text-2xl font-bold text-slate-900">{stats.generated_tasks}</p>
                </div>
                <Target className="w-8 h-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">Due in 24h</p>
                  <p className="text-2xl font-bold text-slate-900">{stats.upcoming_due_24h}</p>
                </div>
                <Clock className="w-8 h-8 text-purple-500" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Rules List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recurrence Rules</CardTitle>
          <CardDescription>
            {rules.length === 0
              ? 'No recurrence rules configured yet'
              : `${rules.length} rule${rules.length !== 1 ? 's' : ''} configured`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {rules.length === 0 ? (
            <div className="text-center py-12">
              <Repeat className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-slate-900 mb-2">No recurring tasks yet</h3>
              <p className="text-slate-500 mb-4">
                Create your first recurrence rule to automate repetitive tasks
              </p>
              <Button onClick={() => setShowCreateDialog(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Create Your First Rule
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {rules.map((rule) => (
                <div
                  key={rule.id}
                  className="py-4 flex items-center justify-between hover:bg-slate-50 -mx-4 px-4 rounded-lg transition-colors"
                  data-testid={`rule-row-${rule.id}`}
                >
                  <div className="flex items-center gap-4 min-w-0 flex-1">
                    <div className={`p-2 rounded-lg ${rule.is_paused ? 'bg-amber-100' : 'bg-blue-100'}`}>
                      <Repeat className={`w-5 h-5 ${rule.is_paused ? 'text-amber-600' : 'text-blue-600'}`} />
                    </div>
                    
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium text-slate-900 truncate">{rule.name}</h4>
                        {rule.is_paused && (
                          <Badge variant="secondary" className="bg-amber-100 text-amber-700">
                            Paused
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-slate-500 truncate">
                        {getRecurrenceDescription(rule)}
                      </p>
                      <div className="flex items-center gap-4 mt-1 text-xs text-slate-400">
                        <span className="flex items-center gap-1">
                          <Target className="w-3 h-3" />
                          {rule.generated_count || 0} generated
                        </span>
                        {rule.next_run_at && !rule.is_paused && (
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            Next: {new Date(rule.next_run_at).toLocaleDateString()}
                          </span>
                        )}
                        {rule.source_task && (
                          <span>Source: {rule.source_task.title}</span>
                        )}
                        {rule.template && (
                          <span>Template: {rule.template.name}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleRunNow(rule)}
                      disabled={rule.is_paused}
                      data-testid={`run-now-btn-${rule.id}`}
                    >
                      <RefreshCw className="w-4 h-4" />
                    </Button>
                    
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEditDialog(rule)}>
                          <Edit2 className="w-4 h-4 mr-2" />
                          Edit Rule
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handlePauseResume(rule)}>
                          {rule.is_paused ? (
                            <>
                              <Play className="w-4 h-4 mr-2" />
                              Resume
                            </>
                          ) : (
                            <>
                              <Pause className="w-4 h-4 mr-2" />
                              Pause
                            </>
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleViewLogs(rule)}>
                          <History className="w-4 h-4 mr-2" />
                          View Logs
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => handleDelete(rule)}
                          className="text-red-600"
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Rule Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Recurrence Rule</DialogTitle>
            <DialogDescription>
              Set up a rule to automatically create tasks on a recurring schedule
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6 py-4">
            {/* Basic Info */}
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label htmlFor="name">Rule Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Weekly Team Standup"
                  data-testid="rule-name-input"
                />
              </div>
              
              <div className="col-span-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Optional description of this recurrence rule"
                  rows={2}
                />
              </div>
              
              <div>
                <Label htmlFor="project">Project *</Label>
                <Select
                  value={formData.project_id}
                  onValueChange={(v) => setFormData({ ...formData, project_id: v, source_task_id: '' })}
                >
                  <SelectTrigger data-testid="project-select">
                    <SelectValue placeholder="Select project" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label htmlFor="source_type">Task Source *</Label>
                <Select
                  value={formData.source_type}
                  onValueChange={(v) => setFormData({ ...formData, source_type: v })}
                >
                  <SelectTrigger data-testid="source-type-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="template">From Template</SelectItem>
                    <SelectItem value="task">From Existing Task</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              {formData.source_type === 'template' ? (
                <div className="col-span-2">
                  <Label htmlFor="template">Template *</Label>
                  <Select
                    value={formData.template_id}
                    onValueChange={(v) => setFormData({ ...formData, template_id: v })}
                  >
                    <SelectTrigger data-testid="template-select">
                      <SelectValue placeholder="Select template" />
                    </SelectTrigger>
                    <SelectContent>
                      {templates.map((template) => (
                        <SelectItem key={template.id} value={template.id}>
                          {template.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="col-span-2">
                  <Label htmlFor="source_task">Source Task *</Label>
                  <Select
                    value={formData.source_task_id}
                    onValueChange={(v) => setFormData({ ...formData, source_task_id: v })}
                    disabled={!formData.project_id}
                  >
                    <SelectTrigger data-testid="source-task-select">
                      <SelectValue placeholder={formData.project_id ? "Select task" : "Select project first"} />
                    </SelectTrigger>
                    <SelectContent>
                      {sourceTasks.map((task) => (
                        <SelectItem key={task.id} value={task.id}>
                          {task.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            
            {/* Recurrence Type */}
            <div>
              <Label className="mb-3 block">Recurrence Type *</Label>
              <div className="grid grid-cols-2 gap-3">
                {RECURRENCE_TYPES.map((type) => {
                  const Icon = type.icon;
                  return (
                    <div
                      key={type.value}
                      className={`p-3 border rounded-lg cursor-pointer transition-all ${
                        formData.recurrence_type === type.value
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                      onClick={() => setFormData({ ...formData, recurrence_type: type.value })}
                      data-testid={`recurrence-type-${type.value}`}
                    >
                      <div className="flex items-center gap-2">
                        <Icon className={`w-5 h-5 ${formData.recurrence_type === type.value ? 'text-blue-600' : 'text-slate-400'}`} />
                        <span className="font-medium">{type.label}</span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">{type.description}</p>
                    </div>
                  );
                })}
              </div>
            </div>
            
            {/* Weekly Days */}
            {formData.recurrence_type === 'weekly' && (
              <div>
                <Label className="mb-3 block">Days of Week *</Label>
                <div className="flex gap-2 flex-wrap">
                  {WEEKDAYS.map((day) => (
                    <Button
                      key={day.value}
                      type="button"
                      variant={formData.weekly_days.includes(day.value) ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => toggleWeekday(day.value)}
                      data-testid={`weekday-${day.value}`}
                    >
                      {day.label}
                    </Button>
                  ))}
                </div>
              </div>
            )}
            
            {/* Monthly Day */}
            {formData.recurrence_type === 'monthly' && (
              <div>
                <Label htmlFor="monthly_day">Day of Month *</Label>
                <Select
                  value={formData.monthly_day.toString()}
                  onValueChange={(v) => setFormData({ ...formData, monthly_day: parseInt(v) })}
                >
                  <SelectTrigger data-testid="monthly-day-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[...Array(31)].map((_, i) => (
                      <SelectItem key={i + 1} value={(i + 1).toString()}>
                        Day {i + 1}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            
            {/* Custom Interval */}
            {formData.recurrence_type === 'custom' && (
              <div>
                <Label htmlFor="custom_interval">Repeat Every (days) *</Label>
                <Input
                  id="custom_interval"
                  type="number"
                  min="1"
                  max="365"
                  value={formData.custom_interval_days}
                  onChange={(e) => setFormData({ ...formData, custom_interval_days: parseInt(e.target.value) || 1 })}
                  data-testid="custom-interval-input"
                />
              </div>
            )}
            
            {/* Schedule */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="time_of_day">Time of Day</Label>
                <Input
                  id="time_of_day"
                  type="time"
                  value={formData.time_of_day}
                  onChange={(e) => setFormData({ ...formData, time_of_day: e.target.value })}
                  data-testid="time-of-day-input"
                />
              </div>
              
              <div>
                <Label htmlFor="timezone">Timezone</Label>
                <Select
                  value={formData.timezone}
                  onValueChange={(v) => setFormData({ ...formData, timezone: v })}
                >
                  <SelectTrigger data-testid="timezone-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COMMON_TIMEZONES.map((tz) => (
                      <SelectItem key={tz} value={tz}>
                        {tz}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label htmlFor="start_date">Start Date *</Label>
                <Input
                  id="start_date"
                  type="date"
                  value={formData.start_date}
                  onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                  data-testid="start-date-input"
                />
              </div>
              
              <div>
                <Label htmlFor="end_date">End Date (Optional)</Label>
                <Input
                  id="end_date"
                  type="date"
                  value={formData.end_date}
                  onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                  data-testid="end-date-input"
                />
              </div>
            </div>
            
            {/* Title Pattern */}
            <div>
              <Label htmlFor="title_pattern">Title Pattern (Optional)</Label>
              <Input
                id="title_pattern"
                value={formData.title_pattern}
                onChange={(e) => setFormData({ ...formData, title_pattern: e.target.value })}
                placeholder="{title} - {date}"
              />
              <p className="text-xs text-slate-500 mt-1">
                Available tokens: {'{title}'}, {'{date}'}, {'{week}'}, {'{month}'}, {'{year}'}
              </p>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateRule} disabled={saving} data-testid="create-rule-submit-btn">
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Create Rule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Rule Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Recurrence Rule</DialogTitle>
            <DialogDescription>
              Update this rule. Changes will only affect future task generation.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label htmlFor="edit-name">Rule Name *</Label>
                <Input
                  id="edit-name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              
              <div className="col-span-2">
                <Label htmlFor="edit-description">Description</Label>
                <Textarea
                  id="edit-description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={2}
                />
              </div>
              
              <div>
                <Label htmlFor="edit-time">Time of Day</Label>
                <Input
                  id="edit-time"
                  type="time"
                  value={formData.time_of_day}
                  onChange={(e) => setFormData({ ...formData, time_of_day: e.target.value })}
                />
              </div>
              
              <div>
                <Label htmlFor="edit-timezone">Timezone</Label>
                <Select
                  value={formData.timezone}
                  onValueChange={(v) => setFormData({ ...formData, timezone: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COMMON_TIMEZONES.map((tz) => (
                      <SelectItem key={tz} value={tz}>
                        {tz}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="col-span-2">
                <Label htmlFor="edit-end-date">End Date (Optional)</Label>
                <Input
                  id="edit-end-date"
                  type="date"
                  value={formData.end_date}
                  onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                />
              </div>
              
              {formData.recurrence_type === 'weekly' && (
                <div className="col-span-2">
                  <Label className="mb-3 block">Days of Week</Label>
                  <div className="flex gap-2 flex-wrap">
                    {WEEKDAYS.map((day) => (
                      <Button
                        key={day.value}
                        type="button"
                        variant={formData.weekly_days.includes(day.value) ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => toggleWeekday(day.value)}
                      >
                        {day.label}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
              
              {formData.recurrence_type === 'monthly' && (
                <div className="col-span-2">
                  <Label htmlFor="edit-monthly-day">Day of Month</Label>
                  <Select
                    value={formData.monthly_day.toString()}
                    onValueChange={(v) => setFormData({ ...formData, monthly_day: parseInt(v) })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[...Array(31)].map((_, i) => (
                        <SelectItem key={i + 1} value={(i + 1).toString()}>
                          Day {i + 1}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              
              {formData.recurrence_type === 'custom' && (
                <div className="col-span-2">
                  <Label htmlFor="edit-custom-interval">Repeat Every (days)</Label>
                  <Input
                    id="edit-custom-interval"
                    type="number"
                    min="1"
                    max="365"
                    value={formData.custom_interval_days}
                    onChange={(e) => setFormData({ ...formData, custom_interval_days: parseInt(e.target.value) || 1 })}
                  />
                </div>
              )}
              
              <div className="col-span-2">
                <Label htmlFor="edit-title-pattern">Title Pattern</Label>
                <Input
                  id="edit-title-pattern"
                  value={formData.title_pattern}
                  onChange={(e) => setFormData({ ...formData, title_pattern: e.target.value })}
                  placeholder="{title} - {date}"
                />
              </div>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateRule} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Logs Dialog */}
      <Dialog open={showLogsDialog} onOpenChange={setShowLogsDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Activity Logs</DialogTitle>
            <DialogDescription>
              Recent activity for rule: {selectedRule?.name}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-3 py-4">
            {ruleLogs.length === 0 ? (
              <p className="text-center text-slate-500 py-8">No activity logs yet</p>
            ) : (
              ruleLogs.map((log) => (
                <div key={log.id} className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg">
                  <div className={`p-1.5 rounded-full ${
                    log.activity_type === 'task_generated' ? 'bg-green-100' :
                    log.activity_type === 'rule_paused' ? 'bg-amber-100' :
                    log.activity_type === 'generation_failed' ? 'bg-red-100' :
                    'bg-blue-100'
                  }`}>
                    {log.activity_type === 'task_generated' ? (
                      <CheckCircle className="w-4 h-4 text-green-600" />
                    ) : log.activity_type === 'generation_failed' ? (
                      <AlertCircle className="w-4 h-4 text-red-600" />
                    ) : (
                      <History className="w-4 h-4 text-blue-600" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900">{log.description}</p>
                    <p className="text-xs text-slate-500">
                      {new Date(log.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLogsDialog(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default RecurringTasksPage;
