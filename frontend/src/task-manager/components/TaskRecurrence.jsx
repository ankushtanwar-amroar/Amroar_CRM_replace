/**
 * Task Recurrence Component - Phase 14
 * Display and manage recurrence settings for a task
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  Repeat, Calendar, Clock, Pause, Play, Trash2,
  Plus, AlertCircle, CheckCircle, Loader2, CalendarDays, Timer
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Badge } from '../../components/ui/badge';
import { Label } from '../../components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;

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

const TaskRecurrence = ({ taskId, onUpdate }) => {
  const [loading, setLoading] = useState(true);
  const [recurrence, setRecurrence] = useState(null);
  const [showSetupDialog, setShowSetupDialog] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // Form state
  const [formData, setFormData] = useState({
    name: '',
    recurrence_type: 'daily',
    start_date: new Date().toISOString().split('T')[0],
    end_date: '',
    time_of_day: '09:00',
    timezone: 'UTC',
    weekly_days: [],
    monthly_day: 1,
    custom_interval_days: 7,
    title_pattern: '',
  });

  const fetchRecurrence = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/task-manager/tasks/${taskId}/recurrence`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setRecurrence(data.recurrence);
      }
    } catch (error) {
      console.error('Error fetching recurrence:', error);
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    fetchRecurrence();
  }, [fetchRecurrence]);

  const handleSetRecurrence = async () => {
    if (!formData.name.trim()) {
      formData.name = `Recurring from Task`;
    }
    
    if (formData.recurrence_type === 'weekly' && formData.weekly_days.length === 0) {
      toast.error('Please select at least one day for weekly recurrence');
      return;
    }
    
    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      const payload = {
        name: formData.name || 'Recurring Task',
        recurrence_type: formData.recurrence_type,
        start_date: new Date(formData.start_date).toISOString(),
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
      
      const response = await fetch(`${API_URL}/api/task-manager/tasks/${taskId}/recurrence`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      
      if (response.ok) {
        toast.success('Recurrence set successfully');
        setShowSetupDialog(false);
        fetchRecurrence();
        if (onUpdate) onUpdate();
      } else {
        const error = await response.json();
        toast.error(error.detail || 'Failed to set recurrence');
      }
    } catch (error) {
      console.error('Error setting recurrence:', error);
      toast.error('Failed to set recurrence');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveRecurrence = async () => {
    if (!window.confirm('Are you sure you want to remove recurrence? This will stop generating new tasks but existing generated tasks will not be affected.')) {
      return;
    }
    
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/task-manager/tasks/${taskId}/recurrence`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      
      if (response.ok) {
        toast.success('Recurrence removed');
        setRecurrence(null);
        if (onUpdate) onUpdate();
      } else {
        toast.error('Failed to remove recurrence');
      }
    } catch (error) {
      console.error('Error removing recurrence:', error);
      toast.error('Failed to remove recurrence');
    }
  };

  const handlePauseResume = async () => {
    try {
      const token = localStorage.getItem('token');
      const action = recurrence.is_paused ? 'resume' : 'pause';
      
      const response = await fetch(`${API_URL}/api/task-manager/recurring-tasks/rules/${recurrence.id}/${action}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      
      if (response.ok) {
        toast.success(`Recurrence ${action}d`);
        fetchRecurrence();
      } else {
        toast.error(`Failed to ${action} recurrence`);
      }
    } catch (error) {
      console.error('Error toggling recurrence:', error);
    }
  };

  const toggleWeekday = (day) => {
    const updated = formData.weekly_days.includes(day)
      ? formData.weekly_days.filter(d => d !== day)
      : [...formData.weekly_days, day];
    setFormData({ ...formData, weekly_days: updated });
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
      </div>
    );
  }

  // If no recurrence, show setup option
  if (!recurrence) {
    return (
      <div className="space-y-4" data-testid="task-recurrence-empty">
        <div className="text-center py-6 bg-slate-50 rounded-lg">
          <Repeat className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <h4 className="font-medium text-slate-700 mb-1">No Recurrence Set</h4>
          <p className="text-sm text-slate-500 mb-4">
            Make this task repeat on a schedule
          </p>
          <Button
            onClick={() => setShowSetupDialog(true)}
            size="sm"
            data-testid="setup-recurrence-btn"
          >
            <Plus className="w-4 h-4 mr-2" />
            Set Up Recurrence
          </Button>
        </div>
        
        {/* Setup Dialog */}
        <Dialog open={showSetupDialog} onOpenChange={setShowSetupDialog}>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Repeat className="w-5 h-5 text-blue-600" />
                Set Up Recurrence
              </DialogTitle>
              <DialogDescription>
                Configure how often this task should repeat
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4 py-4">
              <div>
                <Label htmlFor="name">Rule Name</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Weekly Review"
                />
              </div>
              
              {/* Recurrence Type */}
              <div>
                <Label className="mb-2 block">Repeat</Label>
                <Select
                  value={formData.recurrence_type}
                  onValueChange={(v) => setFormData({ ...formData, recurrence_type: v })}
                >
                  <SelectTrigger data-testid="recurrence-type-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="custom">Custom interval</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              {/* Weekly Days */}
              {formData.recurrence_type === 'weekly' && (
                <div>
                  <Label className="mb-2 block">On Days</Label>
                  <div className="flex gap-1 flex-wrap">
                    {WEEKDAYS.map((day) => (
                      <Button
                        key={day.value}
                        type="button"
                        variant={formData.weekly_days.includes(day.value) ? 'default' : 'outline'}
                        size="sm"
                        className="px-2"
                        onClick={() => toggleWeekday(day.value)}
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
                  <Label htmlFor="monthly_day">Day of Month</Label>
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
              
              {/* Custom Interval */}
              {formData.recurrence_type === 'custom' && (
                <div>
                  <Label htmlFor="custom_interval">Every (days)</Label>
                  <Input
                    id="custom_interval"
                    type="number"
                    min="1"
                    max="365"
                    value={formData.custom_interval_days}
                    onChange={(e) => setFormData({ ...formData, custom_interval_days: parseInt(e.target.value) || 1 })}
                  />
                </div>
              )}
              
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="time">Time</Label>
                  <Input
                    id="time"
                    type="time"
                    value={formData.time_of_day}
                    onChange={(e) => setFormData({ ...formData, time_of_day: e.target.value })}
                  />
                </div>
                
                <div>
                  <Label htmlFor="timezone">Timezone</Label>
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
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="start_date">Start Date</Label>
                  <Input
                    id="start_date"
                    type="date"
                    value={formData.start_date}
                    onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                  />
                </div>
                
                <div>
                  <Label htmlFor="end_date">End Date (optional)</Label>
                  <Input
                    id="end_date"
                    type="date"
                    value={formData.end_date}
                    onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                  />
                </div>
              </div>
              
              <div>
                <Label htmlFor="title_pattern">Title Pattern (optional)</Label>
                <Input
                  id="title_pattern"
                  value={formData.title_pattern}
                  onChange={(e) => setFormData({ ...formData, title_pattern: e.target.value })}
                  placeholder="{title} - {date}"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Tokens: {'{title}'}, {'{date}'}, {'{week}'}, {'{month}'}, {'{year}'}
                </p>
              </div>
            </div>
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowSetupDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleSetRecurrence} disabled={saving}>
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Set Recurrence
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // Has recurrence - show details
  return (
    <div className="space-y-4" data-testid="task-recurrence">
      <div className={`p-4 rounded-lg border ${recurrence.is_paused ? 'bg-amber-50 border-amber-200' : 'bg-blue-50 border-blue-200'}`}>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-full ${recurrence.is_paused ? 'bg-amber-100' : 'bg-blue-100'}`}>
              <Repeat className={`w-5 h-5 ${recurrence.is_paused ? 'text-amber-600' : 'text-blue-600'}`} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium text-slate-900">{recurrence.name}</span>
                {recurrence.is_paused && (
                  <Badge variant="secondary" className="bg-amber-100 text-amber-700 text-xs">
                    Paused
                  </Badge>
                )}
              </div>
              <p className="text-sm text-slate-600">
                {getRecurrenceDescription(recurrence)}
              </p>
            </div>
          </div>
        </div>
        
        {/* Stats */}
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-slate-400" />
            <span className="text-slate-600">
              {recurrence.run_count || 0} tasks generated
            </span>
          </div>
          
          {recurrence.next_run_at && !recurrence.is_paused && (
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-slate-400" />
              <span className="text-slate-600">
                Next: {new Date(recurrence.next_run_at).toLocaleDateString()}
              </span>
            </div>
          )}
          
          {recurrence.last_run_at && (
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-slate-400" />
              <span className="text-slate-600">
                Last: {new Date(recurrence.last_run_at).toLocaleDateString()}
              </span>
            </div>
          )}
          
          <div className="flex items-center gap-2">
            <Timer className="w-4 h-4 text-slate-400" />
            <span className="text-slate-600">{recurrence.timezone}</span>
          </div>
        </div>
        
        {/* Actions */}
        <div className="mt-4 flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePauseResume}
            className={recurrence.is_paused ? 'text-green-600 hover:text-green-700' : 'text-amber-600 hover:text-amber-700'}
          >
            {recurrence.is_paused ? (
              <>
                <Play className="w-4 h-4 mr-1" />
                Resume
              </>
            ) : (
              <>
                <Pause className="w-4 h-4 mr-1" />
                Pause
              </>
            )}
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={handleRemoveRecurrence}
            className="text-red-600 hover:text-red-700"
          >
            <Trash2 className="w-4 h-4 mr-1" />
            Remove
          </Button>
        </div>
      </div>
      
      {/* Generated Tasks Info */}
      {recurrence.generated_tasks && recurrence.generated_tasks.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-slate-700 mb-2">Recent Generated Tasks</h4>
          <div className="space-y-2">
            {recurrence.generated_tasks.slice(0, 5).map((task) => (
              <div key={task.id} className="flex items-center justify-between p-2 bg-slate-50 rounded text-sm">
                <span className="text-slate-700 truncate">{task.title}</span>
                <Badge variant="secondary" className="text-xs">
                  {task.status}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default TaskRecurrence;
