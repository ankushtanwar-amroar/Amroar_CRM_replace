/**
 * TaskTimeTracking Component
 * Start/stop timer, manual time entry, time log history
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import {
  Play,
  Square,
  Plus,
  Clock,
  Loader2,
  Trash2,
  User,
  Calendar,
  Timer,
} from 'lucide-react';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;

// Format duration in hours:minutes
const formatDuration = (minutes) => {
  if (!minutes) return '0m';
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hrs === 0) return `${mins}m`;
  return `${hrs}h ${mins}m`;
};

// Format seconds as HH:MM:SS
const formatTimer = (seconds) => {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

const TaskTimeTracking = ({ taskId, onUpdate }) => {
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState([]);
  const [totalMinutes, setTotalMinutes] = useState(0);
  const [activeTimer, setActiveTimer] = useState(null);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [saving, setSaving] = useState(false);
  const timerRef = useRef(null);

  // Form state for manual entry
  const [manualEntry, setManualEntry] = useState({
    hours: '',
    minutes: '',
    description: '',
    date: new Date().toISOString().split('T')[0]
  });

  const fetchTimeEntries = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/api/task-manager/tasks/${taskId}/time-entries`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (res.ok) {
        const data = await res.json();
        setEntries(data.entries || []);
        setTotalMinutes(data.total_minutes || 0);
      }
    } catch (error) {
      console.error('Error fetching time entries:', error);
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  const checkActiveTimer = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/api/task-manager/timer/active`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (res.ok) {
        const data = await res.json();
        if (data.active && data.timer?.task_id === taskId) {
          setActiveTimer(data.timer);
          setTimerSeconds(data.elapsed_seconds || 0);
        } else {
          setActiveTimer(null);
        }
      }
    } catch (error) {
      console.error('Error checking active timer:', error);
    }
  }, [taskId]);

  useEffect(() => {
    if (taskId) {
      fetchTimeEntries();
      checkActiveTimer();
    }
    
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [taskId, fetchTimeEntries, checkActiveTimer]);

  // Timer tick effect
  useEffect(() => {
    if (activeTimer) {
      timerRef.current = setInterval(() => {
        setTimerSeconds(prev => prev + 1);
      }, 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [activeTimer]);

  // Persist timer state to localStorage
  useEffect(() => {
    if (activeTimer) {
      localStorage.setItem('tm_active_timer', JSON.stringify({
        taskId,
        startedAt: activeTimer.started_at
      }));
    } else {
      const stored = localStorage.getItem('tm_active_timer');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.taskId === taskId) {
          localStorage.removeItem('tm_active_timer');
        }
      }
    }
  }, [activeTimer, taskId]);

  const handleStartTimer = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/api/task-manager/tasks/${taskId}/timer/start`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (res.ok) {
        const data = await res.json();
        setActiveTimer(data);
        setTimerSeconds(0);
        toast.success('Timer started');
      } else {
        const error = await res.json();
        toast.error(error.detail || 'Failed to start timer');
      }
    } catch (error) {
      console.error('Error starting timer:', error);
      toast.error('Failed to start timer');
    }
  };

  const handleStopTimer = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/api/task-manager/tasks/${taskId}/timer/stop`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ description: null })
      });
      
      if (res.ok) {
        setActiveTimer(null);
        setTimerSeconds(0);
        toast.success('Time logged');
        fetchTimeEntries();
        if (onUpdate) onUpdate();
      } else {
        const error = await res.json();
        toast.error(error.detail || 'Failed to stop timer');
      }
    } catch (error) {
      console.error('Error stopping timer:', error);
      toast.error('Failed to stop timer');
    }
  };

  const handleManualEntry = async () => {
    const hours = parseInt(manualEntry.hours) || 0;
    const minutes = parseInt(manualEntry.minutes) || 0;
    const totalMins = (hours * 60) + minutes;

    if (totalMins < 1) {
      toast.error('Please enter a valid duration');
      return;
    }

    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/api/task-manager/time-entries`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          task_id: taskId,
          duration_minutes: totalMins,
          description: manualEntry.description || null,
          logged_date: manualEntry.date ? new Date(manualEntry.date).toISOString() : null
        })
      });

      if (res.ok) {
        toast.success('Time entry added');
        setShowAddDialog(false);
        setManualEntry({
          hours: '',
          minutes: '',
          description: '',
          date: new Date().toISOString().split('T')[0]
        });
        fetchTimeEntries();
        if (onUpdate) onUpdate();
      } else {
        const error = await res.json();
        toast.error(error.detail || 'Failed to add time entry');
      }
    } catch (error) {
      console.error('Error adding time entry:', error);
      toast.error('Failed to add time entry');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteEntry = async (entryId) => {
    if (!window.confirm('Delete this time entry?')) return;

    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/api/task-manager/time-entries/${entryId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.ok) {
        toast.success('Time entry deleted');
        fetchTimeEntries();
        if (onUpdate) onUpdate();
      } else {
        toast.error('Failed to delete time entry');
      }
    } catch (error) {
      console.error('Error deleting entry:', error);
      toast.error('Failed to delete time entry');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Timer Section */}
      <div className="bg-slate-50 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-medium text-slate-700 flex items-center gap-2">
              <Timer className="w-4 h-4" />
              Time Tracker
            </h4>
            <p className="text-xs text-slate-500 mt-1">
              Total: <span className="font-medium text-slate-700">{formatDuration(totalMinutes)}</span>
            </p>
          </div>

          {activeTimer ? (
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-2xl font-mono font-semibold text-green-600" data-testid="timer-display">
                  {formatTimer(timerSeconds)}
                </p>
                <p className="text-xs text-slate-500">Running</p>
              </div>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleStopTimer}
                data-testid="stop-timer-btn"
              >
                <Square className="w-4 h-4 mr-1" />
                Stop
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAddDialog(true)}
                data-testid="add-time-btn"
              >
                <Plus className="w-4 h-4 mr-1" />
                Add Time
              </Button>
              <Button
                size="sm"
                onClick={handleStartTimer}
                className="bg-green-600 hover:bg-green-700"
                data-testid="start-timer-btn"
              >
                <Play className="w-4 h-4 mr-1" />
                Start
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Time Entries List */}
      <div className="space-y-2">
        <h4 className="text-xs font-medium text-slate-500 uppercase tracking-wide">
          Time Log ({entries.length})
        </h4>
        
        {entries.length === 0 ? (
          <div className="text-center py-6 text-slate-400 text-sm">
            <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No time logged yet</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {entries.map(entry => (
              <div
                key={entry.id}
                className="flex items-start justify-between p-3 bg-white rounded-lg border hover:border-slate-300 transition-colors"
                data-testid={`time-entry-${entry.id}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-semibold text-slate-800">
                      {formatDuration(entry.duration_minutes)}
                    </span>
                    {entry.description && (
                      <span className="text-slate-500 truncate">
                        — {entry.description}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
                    <span className="flex items-center gap-1">
                      <User className="w-3 h-3" />
                      {entry.user?.name || 'Unknown'}
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {new Date(entry.logged_date).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDeleteEntry(entry.id)}
                  className="text-slate-400 hover:text-red-500 hover:bg-red-50"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Manual Entry Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Time Entry</DialogTitle>
            <DialogDescription>
              Manually log time spent on this task
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Duration */}
            <div className="space-y-2">
              <Label>Duration *</Label>
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <Input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={manualEntry.hours}
                    onChange={(e) => setManualEntry(prev => ({ ...prev, hours: e.target.value }))}
                    data-testid="hours-input"
                  />
                  <span className="text-xs text-slate-500">hours</span>
                </div>
                <span className="text-slate-400">:</span>
                <div className="flex-1">
                  <Input
                    type="number"
                    min="0"
                    max="59"
                    placeholder="0"
                    value={manualEntry.minutes}
                    onChange={(e) => setManualEntry(prev => ({ ...prev, minutes: e.target.value }))}
                    data-testid="minutes-input"
                  />
                  <span className="text-xs text-slate-500">minutes</span>
                </div>
              </div>
            </div>

            {/* Date */}
            <div className="space-y-2">
              <Label>Date</Label>
              <Input
                type="date"
                value={manualEntry.date}
                onChange={(e) => setManualEntry(prev => ({ ...prev, date: e.target.value }))}
                data-testid="date-input"
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label>Description (optional)</Label>
              <Textarea
                placeholder="What did you work on?"
                value={manualEntry.description}
                onChange={(e) => setManualEntry(prev => ({ ...prev, description: e.target.value }))}
                rows={2}
                data-testid="description-input"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleManualEntry} disabled={saving} data-testid="save-time-entry-btn">
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Add Entry
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TaskTimeTracking;
