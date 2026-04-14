/**
 * Calendar View Component
 * Month/Week calendar showing tasks by due date
 */
import React, { useState, useMemo, useEffect } from 'react';
import { 
  ChevronLeft, ChevronRight, Calendar as CalendarIcon,
  Circle, Clock, Ban, CheckCircle2, Plus
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const statusColors = {
  todo: 'bg-slate-400',
  in_progress: 'bg-blue-500',
  blocked: 'bg-amber-500',
  done: 'bg-green-500',
};

const CalendarView = ({ tasks: propTasks, onTaskClick, projectId, isGlobalView = false }) => {
  const [viewMode, setViewMode] = useState('month'); // 'month' or 'week'
  const [currentDate, setCurrentDate] = useState(new Date());
  const [tasks, setTasks] = useState(propTasks || []);
  const [loading, setLoading] = useState(false);

  // Fetch tasks if in global view mode
  useEffect(() => {
    if (isGlobalView) {
      fetchCalendarTasks();
    } else {
      setTasks(propTasks || []);
    }
  }, [isGlobalView, currentDate, propTasks]);

  const fetchCalendarTasks = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const params = new URLSearchParams({
        year: currentDate.getFullYear(),
        month: currentDate.getMonth() + 1,
      });
      
      if (projectId) {
        params.append('project_id', projectId);
      }

      const response = await fetch(`${API_URL}/api/task-manager/calendar?${params}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setTasks(data.tasks || []);
      }
    } catch (err) {
      console.error('Error fetching calendar tasks:', err);
    } finally {
      setLoading(false);
    }
  };

  // Get days in month view
  const calendarDays = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    
    const days = [];
    
    // Add days from previous month to fill the first week
    const startPadding = firstDay.getDay();
    for (let i = startPadding - 1; i >= 0; i--) {
      const day = new Date(year, month, -i);
      days.push({ date: day, isCurrentMonth: false });
    }
    
    // Add days of current month
    for (let i = 1; i <= lastDay.getDate(); i++) {
      days.push({ date: new Date(year, month, i), isCurrentMonth: true });
    }
    
    // Add days from next month to complete the grid
    const endPadding = 42 - days.length; // 6 rows * 7 days
    for (let i = 1; i <= endPadding; i++) {
      days.push({ date: new Date(year, month + 1, i), isCurrentMonth: false });
    }
    
    return days;
  }, [currentDate]);

  // Get days in week view
  const weekDays = useMemo(() => {
    const start = new Date(currentDate);
    start.setDate(start.getDate() - start.getDay());
    
    const days = [];
    for (let i = 0; i < 7; i++) {
      const day = new Date(start);
      day.setDate(start.getDate() + i);
      days.push({ date: day, isCurrentMonth: true });
    }
    
    return days;
  }, [currentDate]);

  const displayDays = viewMode === 'week' ? weekDays : calendarDays;

  // Group tasks by date
  const tasksByDate = useMemo(() => {
    const grouped = {};
    
    tasks.forEach(task => {
      if (task.due_date) {
        const dateKey = new Date(task.due_date).toDateString();
        if (!grouped[dateKey]) {
          grouped[dateKey] = [];
        }
        grouped[dateKey].push(task);
      }
    });
    
    return grouped;
  }, [tasks]);

  const navigatePeriod = (direction) => {
    const newDate = new Date(currentDate);
    if (viewMode === 'week') {
      newDate.setDate(newDate.getDate() + (direction * 7));
    } else {
      newDate.setMonth(newDate.getMonth() + direction);
    }
    setCurrentDate(newDate);
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  const isToday = (date) => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  const getTasksForDay = (date) => {
    return tasksByDate[date.toDateString()] || [];
  };

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="h-full flex flex-col bg-white" data-testid="calendar-view">
      {/* Header Controls */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-slate-50">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => navigatePeriod(-1)}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={goToToday}>
            Today
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigatePeriod(1)}>
            <ChevronRight className="w-4 h-4" />
          </Button>
          <span className="ml-2 text-lg font-semibold text-slate-700">
            {currentDate.toLocaleDateString('en-US', { 
              month: 'long', 
              year: 'numeric',
              ...(viewMode === 'week' && { day: 'numeric' })
            })}
          </span>
        </div>
        
        <div className="flex items-center gap-2">
          <Button
            variant={viewMode === 'week' ? 'secondary' : 'outline'}
            size="sm"
            onClick={() => setViewMode('week')}
          >
            Week
          </Button>
          <Button
            variant={viewMode === 'month' ? 'secondary' : 'outline'}
            size="sm"
            onClick={() => setViewMode('month')}
          >
            Month
          </Button>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="flex-1 overflow-auto p-4">
        {/* Day Headers */}
        <div className="grid grid-cols-7 gap-1 mb-2">
          {dayNames.map(day => (
            <div key={day} className="text-center text-sm font-medium text-slate-500 py-2">
              {day}
            </div>
          ))}
        </div>

        {/* Calendar Days */}
        <div className={`grid grid-cols-7 gap-1 ${viewMode === 'week' ? 'grid-rows-1' : 'grid-rows-6'}`}>
          {displayDays.map((dayData, index) => {
            const { date, isCurrentMonth } = dayData;
            const dayTasks = getTasksForDay(date);
            const today = isToday(date);
            
            return (
              <div
                key={index}
                className={`min-h-[100px] ${viewMode === 'week' ? 'min-h-[400px]' : ''} border rounded-lg p-2 ${
                  isCurrentMonth ? 'bg-white' : 'bg-slate-50'
                } ${today ? 'ring-2 ring-blue-500' : ''}`}
              >
                {/* Date Number */}
                <div className={`text-sm font-medium mb-2 ${
                  today ? 'text-blue-600' : 
                  isCurrentMonth ? 'text-slate-700' : 'text-slate-400'
                }`}>
                  {date.getDate()}
                </div>
                
                {/* Tasks */}
                <div className="space-y-1">
                  {dayTasks.slice(0, viewMode === 'week' ? 10 : 3).map(task => (
                    <div
                      key={task.id}
                      onClick={() => onTaskClick(task)}
                      className={`text-xs p-1.5 rounded cursor-pointer hover:opacity-80 transition-opacity ${
                        statusColors[task.status]
                      } text-white truncate`}
                      title={task.title}
                      data-testid={`calendar-task-${task.id}`}
                    >
                      {task.title}
                    </div>
                  ))}
                  
                  {/* More indicator */}
                  {dayTasks.length > (viewMode === 'week' ? 10 : 3) && (
                    <div className="text-xs text-slate-500 text-center">
                      +{dayTasks.length - (viewMode === 'week' ? 10 : 3)} more
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="px-4 py-2 border-t bg-slate-50 flex items-center gap-4">
        <span className="text-xs text-slate-500">Status:</span>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-slate-400" />
          <span className="text-xs text-slate-600">To Do</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-blue-500" />
          <span className="text-xs text-slate-600">In Progress</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-amber-500" />
          <span className="text-xs text-slate-600">Blocked</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-green-500" />
          <span className="text-xs text-slate-600">Done</span>
        </div>
      </div>
    </div>
  );
};

export default CalendarView;
