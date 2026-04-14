/**
 * Timeline View Component with Dependencies and Drag-to-Reschedule
 * Phase 3 Enhanced: Dependency arrows and drag functionality
 */
import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { 
  ChevronLeft, ChevronRight, ZoomIn, ZoomOut,
  Circle, Clock, Ban, CheckCircle2, User, Calendar,
  AlertTriangle
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const statusColors = {
  todo: { bg: 'bg-slate-200', bar: 'bg-slate-400', text: 'text-slate-600' },
  in_progress: { bg: 'bg-blue-100', bar: 'bg-blue-500', text: 'text-blue-600' },
  blocked: { bg: 'bg-amber-100', bar: 'bg-amber-500', text: 'text-amber-600' },
  done: { bg: 'bg-green-100', bar: 'bg-green-500', text: 'text-green-600' },
};

const priorityColors = {
  low: 'border-l-slate-400',
  medium: 'border-l-blue-500',
  high: 'border-l-orange-500',
  urgent: 'border-l-red-500',
};

const TimelineView = ({ tasks: initialTasks, onTaskClick, projectId, onTaskUpdate }) => {
  const [zoomLevel, setZoomLevel] = useState('month');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [tasks, setTasks] = useState(initialTasks);
  const [draggingTask, setDraggingTask] = useState(null);
  const [dragOffset, setDragOffset] = useState(0);
  const [showDependencies, setShowDependencies] = useState(true);
  const [rescheduleError, setRescheduleError] = useState(null);
  const scrollRef = useRef(null);
  const svgRef = useRef(null);

  useEffect(() => {
    setTasks(initialTasks);
  }, [initialTasks]);

  // Calculate date range
  const dateRange = useMemo(() => {
    const start = new Date(currentDate);
    const end = new Date(currentDate);
    
    if (zoomLevel === 'week') {
      start.setDate(start.getDate() - start.getDay());
      end.setDate(start.getDate() + 27);
    } else {
      start.setDate(1);
      end.setMonth(end.getMonth() + 2);
      end.setDate(0);
    }
    
    return { start, end };
  }, [currentDate, zoomLevel]);

  // Generate day columns
  const days = useMemo(() => {
    const result = [];
    const current = new Date(dateRange.start);
    
    while (current <= dateRange.end) {
      result.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }
    
    return result;
  }, [dateRange]);

  const groupedDays = useMemo(() => {
    const groups = [];
    let currentGroup = null;
    
    days.forEach(day => {
      const key = zoomLevel === 'week' 
        ? `Week ${getWeekNumber(day)}`
        : day.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      
      if (!currentGroup || currentGroup.label !== key) {
        currentGroup = { label: key, days: [] };
        groups.push(currentGroup);
      }
      currentGroup.days.push(day);
    });
    
    return groups;
  }, [days, zoomLevel]);

  const dayWidth = zoomLevel === 'week' ? 40 : 24;
  const leftPanelWidth = 256;

  // Calculate task position
  const getTaskPosition = useCallback((task) => {
    const startDate = task.start_date ? new Date(task.start_date) : 
                      task.due_date ? new Date(task.due_date) : null;
    const endDate = task.due_date ? new Date(task.due_date) : 
                    task.start_date ? new Date(task.start_date) : null;
    
    if (!startDate || !endDate) return { left: 0, width: 0, isVisible: false };
    
    const visibleStart = new Date(Math.max(startDate, dateRange.start));
    const visibleEnd = new Date(Math.min(endDate, dateRange.end));
    
    const startDiff = Math.floor((visibleStart - dateRange.start) / (1000 * 60 * 60 * 24));
    const duration = Math.max(1, Math.ceil((visibleEnd - visibleStart) / (1000 * 60 * 60 * 24)) + 1);
    
    return {
      left: startDiff * dayWidth,
      width: duration * dayWidth - 4,
      isVisible: visibleStart <= dateRange.end && visibleEnd >= dateRange.start,
      startDate,
      endDate
    };
  }, [dateRange, dayWidth]);

  // Group tasks by status
  const groupedTasks = useMemo(() => {
    const groups = {
      todo: { label: 'To Do', icon: Circle, tasks: [] },
      in_progress: { label: 'In Progress', icon: Clock, tasks: [] },
      blocked: { label: 'Blocked', icon: Ban, tasks: [] },
      done: { label: 'Done', icon: CheckCircle2, tasks: [] },
    };
    
    tasks.forEach(task => {
      const status = task.status || 'todo';
      if (groups[status]) {
        groups[status].tasks.push(task);
      }
    });
    
    return groups;
  }, [tasks]);

  // Calculate task row index for positioning arrows
  const getTaskRowIndex = useCallback((taskId) => {
    let index = 0;
    for (const [status, group] of Object.entries(groupedTasks)) {
      index++; // Status header row
      for (const task of group.tasks) {
        if (task.id === taskId) return index;
        index++;
      }
    }
    return -1;
  }, [groupedTasks]);

  // Generate dependency arrows
  const dependencyArrows = useMemo(() => {
    if (!showDependencies) return [];
    
    const arrows = [];
    
    tasks.forEach(task => {
      const blockedBy = task.blocked_by || [];
      blockedBy.forEach(blockerId => {
        const blocker = tasks.find(t => t.id === blockerId);
        if (!blocker) return;
        
        const fromPos = getTaskPosition(blocker);
        const toPos = getTaskPosition(task);
        const fromRow = getTaskRowIndex(blockerId);
        const toRow = getTaskRowIndex(task.id);
        
        if (fromPos.isVisible && toPos.isVisible && fromRow >= 0 && toRow >= 0) {
          arrows.push({
            id: `${blockerId}-${task.id}`,
            from: {
              x: fromPos.left + fromPos.width,
              y: fromRow * 40 + 20, // Center of row
            },
            to: {
              x: toPos.left,
              y: toRow * 40 + 20,
            },
            isBlocked: blocker.status !== 'done'
          });
        }
      });
    });
    
    return arrows;
  }, [tasks, showDependencies, getTaskPosition, getTaskRowIndex]);

  // Drag handlers
  const handleDragStart = (e, task) => {
    if (task.status === 'done') return; // Don't allow dragging completed tasks
    
    const pos = getTaskPosition(task);
    const rect = e.currentTarget.getBoundingClientRect();
    setDragOffset(e.clientX - rect.left);
    setDraggingTask(task);
    setRescheduleError(null);
  };

  const handleDrag = (e) => {
    if (!draggingTask || !scrollRef.current) return;
    
    const scrollRect = scrollRef.current.getBoundingClientRect();
    const relativeX = e.clientX - scrollRect.left + scrollRef.current.scrollLeft - dragOffset;
    const dayIndex = Math.floor(relativeX / dayWidth);
    
    if (dayIndex >= 0 && dayIndex < days.length) {
      const newStartDate = new Date(days[dayIndex]);
      const originalDuration = draggingTask.due_date && draggingTask.start_date
        ? Math.ceil((new Date(draggingTask.due_date) - new Date(draggingTask.start_date)) / (1000 * 60 * 60 * 24))
        : 3;
      
      const newEndDate = new Date(newStartDate);
      newEndDate.setDate(newEndDate.getDate() + originalDuration);
      
      // Update preview
      setTasks(prev => prev.map(t => 
        t.id === draggingTask.id 
          ? { ...t, start_date: newStartDate.toISOString(), due_date: newEndDate.toISOString() }
          : t
      ));
    }
  };

  const handleDragEnd = async () => {
    if (!draggingTask) return;
    
    const updatedTask = tasks.find(t => t.id === draggingTask.id);
    if (!updatedTask) {
      setDraggingTask(null);
      return;
    }
    
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/task-manager/tasks/${draggingTask.id}/reschedule`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          start_date: updatedTask.start_date,
          due_date: updatedTask.due_date,
          shift_dependents: false
        })
      });

      if (!response.ok) {
        const err = await response.json();
        setRescheduleError(err.detail || 'Failed to reschedule');
        // Revert to original
        setTasks(initialTasks);
      } else {
        onTaskUpdate?.(updatedTask);
      }
    } catch (err) {
      setRescheduleError('Failed to reschedule task');
      setTasks(initialTasks);
    }
    
    setDraggingTask(null);
  };

  // Navigation
  const navigatePeriod = (direction) => {
    const newDate = new Date(currentDate);
    if (zoomLevel === 'week') {
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

  const isWeekend = (date) => {
    return date.getDay() === 0 || date.getDay() === 6;
  };

  // Scroll to today on mount
  useEffect(() => {
    if (scrollRef.current) {
      const today = new Date();
      const diff = Math.floor((today - dateRange.start) / (1000 * 60 * 60 * 24));
      const scrollPos = diff * dayWidth - 200;
      scrollRef.current.scrollLeft = Math.max(0, scrollPos);
    }
  }, [dateRange, dayWidth]);

  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8">
        <Calendar className="w-16 h-16 text-slate-300 mb-4" />
        <h3 className="text-lg font-medium text-slate-900 mb-2">No timeline data</h3>
        <p className="text-slate-500 text-center">
          Tasks need start or due dates to appear on the timeline
        </p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white" data-testid="timeline-view">
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
          <span className="ml-2 text-sm font-medium text-slate-700">
            {currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </span>
        </div>
        
        <div className="flex items-center gap-2">
          {rescheduleError && (
            <div className="flex items-center gap-1 text-sm text-amber-600 bg-amber-50 px-3 py-1 rounded">
              <AlertTriangle className="w-4 h-4" />
              {rescheduleError}
            </div>
          )}
          
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={showDependencies}
              onChange={(e) => setShowDependencies(e.target.checked)}
              className="rounded"
            />
            Show Dependencies
          </label>
          
          <span className="text-sm text-slate-500 ml-2">Zoom:</span>
          <Button
            variant={zoomLevel === 'week' ? 'secondary' : 'outline'}
            size="sm"
            onClick={() => setZoomLevel('week')}
          >
            Week
          </Button>
          <Button
            variant={zoomLevel === 'month' ? 'secondary' : 'outline'}
            size="sm"
            onClick={() => setZoomLevel('month')}
          >
            Month
          </Button>
        </div>
      </div>

      {/* Timeline Content */}
      <div className="flex-1 overflow-hidden flex">
        {/* Left Panel - Task Names */}
        <div className="flex-shrink-0 border-r bg-white overflow-y-auto" style={{ width: leftPanelWidth }}>
          <div className="h-14 border-b bg-slate-50 flex items-center px-4">
            <span className="text-sm font-medium text-slate-700">Tasks</span>
            <span className="ml-auto text-xs text-slate-400">Drag to reschedule</span>
          </div>
          
          {Object.entries(groupedTasks).map(([status, group]) => {
            if (group.tasks.length === 0) return null;
            const StatusIcon = group.icon;
            const colors = statusColors[status];
            
            return (
              <div key={status} className="border-b">
                <div className={`px-4 py-2 ${colors.bg} flex items-center gap-2`}>
                  <StatusIcon className={`w-4 h-4 ${colors.text}`} />
                  <span className={`text-sm font-medium ${colors.text}`}>{group.label}</span>
                  <Badge variant="secondary" className="ml-auto text-xs">
                    {group.tasks.length}
                  </Badge>
                </div>
                
                {group.tasks.map(task => (
                  <div
                    key={task.id}
                    className={`px-4 py-2 h-10 border-b border-slate-100 cursor-pointer hover:bg-slate-50 flex items-center border-l-4 ${priorityColors[task.priority]}`}
                    onClick={() => onTaskClick(task)}
                  >
                    <span className="text-sm text-slate-700 truncate flex-1">
                      {task.title}
                    </span>
                    {task.is_blocked && (
                      <Ban className="w-4 h-4 text-amber-500 ml-2" />
                    )}
                    {task.assignee && (
                      <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs ml-2">
                        {task.assignee.initials}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            );
          })}
        </div>

        {/* Right Panel - Timeline Grid */}
        <div 
          className="flex-1 overflow-auto relative" 
          ref={scrollRef}
          onMouseMove={draggingTask ? handleDrag : undefined}
          onMouseUp={handleDragEnd}
          onMouseLeave={handleDragEnd}
        >
          <div style={{ minWidth: days.length * dayWidth, position: 'relative' }}>
            {/* Month/Week Headers */}
            <div className="h-8 flex border-b bg-slate-50 sticky top-0 z-10">
              {groupedDays.map((group, i) => (
                <div
                  key={i}
                  className="border-r border-slate-200 flex items-center justify-center"
                  style={{ width: group.days.length * dayWidth }}
                >
                  <span className="text-xs font-medium text-slate-600">{group.label}</span>
                </div>
              ))}
            </div>

            {/* Day Headers */}
            <div className="h-6 flex border-b bg-slate-50 sticky top-8 z-10">
              {days.map((day, i) => (
                <div
                  key={i}
                  className={`flex items-center justify-center border-r text-xs ${
                    isToday(day) ? 'bg-blue-100 text-blue-700 font-bold' : 
                    isWeekend(day) ? 'bg-slate-100 text-slate-400' : 'text-slate-500'
                  }`}
                  style={{ width: dayWidth }}
                >
                  {day.getDate()}
                </div>
              ))}
            </div>

            {/* Dependency Arrows SVG Overlay */}
            {showDependencies && dependencyArrows.length > 0 && (
              <svg
                ref={svgRef}
                className="absolute top-14 left-0 pointer-events-none z-5"
                style={{ 
                  width: days.length * dayWidth, 
                  height: Object.values(groupedTasks).reduce((acc, g) => acc + g.tasks.length + 1, 0) * 40 
                }}
              >
                <defs>
                  <marker
                    id="arrowhead-blocked"
                    markerWidth="10"
                    markerHeight="7"
                    refX="9"
                    refY="3.5"
                    orient="auto"
                  >
                    <polygon points="0 0, 10 3.5, 0 7" fill="#f59e0b" />
                  </marker>
                  <marker
                    id="arrowhead-resolved"
                    markerWidth="10"
                    markerHeight="7"
                    refX="9"
                    refY="3.5"
                    orient="auto"
                  >
                    <polygon points="0 0, 10 3.5, 0 7" fill="#22c55e" />
                  </marker>
                </defs>
                {dependencyArrows.map(arrow => (
                  <path
                    key={arrow.id}
                    d={`M ${arrow.from.x} ${arrow.from.y} C ${arrow.from.x + 30} ${arrow.from.y}, ${arrow.to.x - 30} ${arrow.to.y}, ${arrow.to.x} ${arrow.to.y}`}
                    fill="none"
                    stroke={arrow.isBlocked ? '#f59e0b' : '#22c55e'}
                    strokeWidth="2"
                    strokeDasharray={arrow.isBlocked ? '5,5' : 'none'}
                    markerEnd={`url(#arrowhead-${arrow.isBlocked ? 'blocked' : 'resolved'})`}
                    opacity="0.7"
                  />
                ))}
              </svg>
            )}

            {/* Task Rows */}
            {Object.entries(groupedTasks).map(([status, group]) => {
              if (group.tasks.length === 0) return null;
              const colors = statusColors[status];
              
              return (
                <div key={status}>
                  {/* Status Header Row */}
                  <div 
                    className={`h-8 ${colors.bg} border-b flex`}
                    style={{ width: days.length * dayWidth }}
                  >
                    {days.map((day, i) => (
                      <div
                        key={i}
                        className={`border-r ${isToday(day) ? 'bg-blue-50' : ''}`}
                        style={{ width: dayWidth }}
                      />
                    ))}
                  </div>
                  
                  {/* Task Rows */}
                  {group.tasks.map(task => {
                    const pos = getTaskPosition(task);
                    const isDragging = draggingTask?.id === task.id;
                    
                    return (
                      <div
                        key={task.id}
                        className="h-10 border-b border-slate-100 relative"
                        style={{ width: days.length * dayWidth }}
                      >
                        {/* Day grid lines */}
                        <div className="absolute inset-0 flex">
                          {days.map((day, i) => (
                            <div
                              key={i}
                              className={`border-r border-slate-100 ${
                                isToday(day) ? 'bg-blue-50/50' : 
                                isWeekend(day) ? 'bg-slate-50' : ''
                              }`}
                              style={{ width: dayWidth }}
                            />
                          ))}
                        </div>
                        
                        {/* Task Bar */}
                        {pos.isVisible && (
                          <div
                            className={`absolute top-1 h-8 ${colors.bar} rounded cursor-grab active:cursor-grabbing transition-all flex items-center px-2 overflow-hidden shadow-sm ${
                              isDragging ? 'ring-2 ring-blue-400 opacity-80 scale-105' : 'hover:opacity-90'
                            } ${task.status === 'done' ? 'cursor-default' : ''}`}
                            style={{ 
                              left: pos.left + 2, 
                              width: Math.max(pos.width, 20)
                            }}
                            onMouseDown={(e) => handleDragStart(e, task)}
                            onClick={(e) => {
                              if (!draggingTask) {
                                e.stopPropagation();
                                onTaskClick(task);
                              }
                            }}
                            title={`${task.title}${task.is_blocked ? ' (Blocked)' : ''}`}
                          >
                            {pos.width > 60 && (
                              <span className="text-xs text-white truncate">
                                {task.title}
                              </span>
                            )}
                            {task.is_blocked && pos.width > 30 && (
                              <Ban className="w-3 h-3 text-white ml-auto" />
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>

          {/* Today Indicator Line */}
          <div 
            className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-20 pointer-events-none"
            style={{ 
              left: (Math.floor((new Date() - dateRange.start) / (1000 * 60 * 60 * 24)) * dayWidth) + (dayWidth / 2)
            }}
          />
        </div>
      </div>
    </div>
  );
};

// Helper function
function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

export default TimelineView;
