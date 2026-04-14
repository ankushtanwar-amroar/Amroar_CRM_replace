import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  BarChart3, 
  FileText, 
  Calendar as CalendarIcon, 
  Settings, 
  LogOut,
  ChevronDown,
  User,
  Activity,
  ListTodo,
  CalendarDays,
  Clock,
  Plus,
  CheckSquare,
  Building,
  Loader,
  Home,
  Grid,
  X
} from 'lucide-react';
import { NotificationCenter } from '../../modules/notifications';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu';
import { Sheet, SheetContent } from '../../components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Dialog, DialogContent } from '../../components/ui/dialog';
import axios from 'axios';
import EnhancedGlobalSearchBar from './EnhancedGlobalSearchBar';
import CalendarViewComponent from '../../components/CalendarViewComponent';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Global Activities Center Component
const ActivitiesCenterPanel = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState('tasks');
  const [tasks, setTasks] = useState([]);
  const [events, setEvents] = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCalendarModal, setShowCalendarModal] = useState(false);
  const [taskFilter, setTaskFilter] = useState('open');
  const [eventFilter, setEventFilter] = useState('upcoming');
  const navigate = useNavigate();

  useEffect(() => {
    if (isOpen) {
      fetchActivities();
    }
  }, [isOpen]);

  const fetchActivities = async () => {
    setLoading(true);
    try {
      const [tasksRes, eventsRes] = await Promise.all([
        axios.get(`${API}/objects/task/records`),
        axios.get(`${API}/objects/event/records`)
      ]);
      
      const tasksData = tasksRes.data.records || [];
      const eventsData = eventsRes.data.records || [];
      
      setTasks(tasksData);
      setEvents(eventsData);
      
      // Create timeline from both
      const allActivities = [
        ...tasksData.map(t => ({ ...t, activity_type: 'task' })),
        ...eventsData.map(e => ({ ...e, activity_type: 'event' }))
      ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      
      setTimeline(allActivities.slice(0, 20));
    } catch (error) {
      console.error('Error fetching activities:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status) => {
    const statusLower = status?.toLowerCase() || '';
    if (statusLower === 'completed' || statusLower === 'closed') return 'bg-green-100 text-green-700';
    if (statusLower === 'in progress' || statusLower === 'started') return 'bg-blue-100 text-blue-700';
    if (statusLower === 'overdue') return 'bg-red-100 text-red-700';
    return 'bg-slate-100 text-slate-700';
  };

  const getPriorityColor = (priority) => {
    const p = priority?.toLowerCase() || '';
    if (p === 'high') return 'bg-red-100 text-red-700';
    if (p === 'medium') return 'bg-amber-100 text-amber-700';
    return 'bg-slate-100 text-slate-700';
  };

  const isOverdue = (dueDate) => {
    if (!dueDate) return false;
    return new Date(dueDate) < new Date() && new Date(dueDate).toDateString() !== new Date().toDateString();
  };

  const formatDate = (date) => {
    if (!date) return '-';
    const d = new Date(date);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    if (d.toDateString() === today.toDateString()) return 'Today';
    if (d.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const formatTime = (date) => {
    if (!date) return '';
    return new Date(date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  const filteredTasks = tasks.filter(task => {
    const status = task.data?.status?.toLowerCase() || '';
    if (taskFilter === 'open') return status !== 'completed' && status !== 'closed';
    if (taskFilter === 'completed') return status === 'completed' || status === 'closed';
    if (taskFilter === 'overdue') return isOverdue(task.data?.due_date) && status !== 'completed';
    return true;
  });

  const filteredEvents = events.filter(event => {
    const startDate = new Date(event.data?.start_date || event.created_at);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (eventFilter === 'upcoming') return startDate >= today;
    if (eventFilter === 'past') return startDate < today;
    return true;
  });

  const handleTaskClick = (task) => {
    navigate(`/crm/task/${task.series_id}`);
    onClose();
  };

  const handleEventClick = (event) => {
    navigate(`/crm/event/${event.series_id}`);
    onClose();
  };

  const openTasksCount = tasks.filter(t => {
    const status = t.data?.status?.toLowerCase() || '';
    return status !== 'completed' && status !== 'closed';
  }).length;

  const upcomingEventsCount = events.filter(e => {
    const startDate = new Date(e.data?.start_date || e.created_at);
    return startDate >= new Date();
  }).length;

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent side="right" className="w-[420px] sm:w-[480px] p-0">
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="p-4 border-b bg-gradient-to-r from-indigo-500 to-indigo-600">
            <div className="flex items-center space-x-3">
              <div className="bg-white/20 rounded-lg p-2">
                <Activity className="h-5 w-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">Activities</h2>
                <p className="text-sm text-indigo-100">
                  {openTasksCount} open tasks • {upcomingEventsCount} upcoming events
                </p>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
            <TabsList className="grid w-full grid-cols-3 p-1 m-2 bg-slate-100 rounded-lg">
              <TabsTrigger value="tasks" className="flex items-center gap-1.5 text-sm">
                <ListTodo className="h-4 w-4" />
                Tasks
              </TabsTrigger>
              <TabsTrigger value="events" className="flex items-center gap-1.5 text-sm">
                <CalendarDays className="h-4 w-4" />
                Events
              </TabsTrigger>
              <TabsTrigger value="timeline" className="flex items-center gap-1.5 text-sm">
                <Clock className="h-4 w-4" />
                Timeline
              </TabsTrigger>
            </TabsList>

            {/* Tasks Tab */}
            <TabsContent value="tasks" className="flex-1 flex flex-col m-0 px-2">
              <div className="flex items-center gap-2 py-2 px-2">
                <Select value={taskFilter} onValueChange={setTaskFilter}>
                  <SelectTrigger className="h-8 w-36 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Open Tasks</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="overdue">Overdue</SelectItem>
                    <SelectItem value="all">All Tasks</SelectItem>
                  </SelectContent>
                </Select>
                <span className="text-sm text-slate-500">{filteredTasks.length} tasks</span>
                <div className="flex-1" />
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs gap-1.5 border-indigo-200 text-indigo-600 hover:bg-indigo-50"
                  onClick={() => {
                    setShowCalendarModal(true);
                    onClose(); // Close the activities panel when opening calendar
                  }}
                  data-testid="task-calendar-view-btn"
                >
                  <CalendarDays className="h-3.5 w-3.5" />
                  Calendar View
                </Button>
              </div>

              <div className="flex-1 overflow-y-auto">
                {loading ? (
                  <div className="flex items-center justify-center h-32">
                    <Loader className="h-6 w-6 animate-spin text-indigo-600" />
                  </div>
                ) : filteredTasks.length === 0 ? (
                  <div className="text-center py-8 text-slate-500">
                    <CheckSquare className="h-10 w-10 mx-auto mb-2 text-slate-300" />
                    <p>No {taskFilter} tasks</p>
                  </div>
                ) : (
                  <div className="space-y-2 px-2 pb-4">
                    {filteredTasks.map((task) => (
                      <div
                        key={task.id}
                        onClick={() => handleTaskClick(task)}
                        className="p-3 bg-white border border-slate-200 rounded-lg cursor-pointer hover:border-indigo-300 hover:shadow-sm transition-all"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-slate-900 truncate">
                              {task.data?.subject || task.data?.name || 'Untitled Task'}
                            </p>
                            <div className="flex items-center gap-2 mt-2">
                              {task.data?.due_date && (
                                <span className={`text-xs px-2 py-0.5 rounded ${
                                  isOverdue(task.data.due_date) ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'
                                }`}>
                                  <Clock className="h-3 w-3 inline mr-1" />
                                  {formatDate(task.data.due_date)}
                                </span>
                              )}
                              {task.data?.priority && (
                                <Badge className={`text-xs ${getPriorityColor(task.data.priority)}`}>
                                  {task.data.priority}
                                </Badge>
                              )}
                            </div>
                          </div>
                          <Badge className={`text-xs ${getStatusColor(task.data?.status)}`}>
                            {task.data?.status || 'Open'}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Events Tab */}
            <TabsContent value="events" className="flex-1 flex flex-col m-0 px-2">
              <div className="flex items-center gap-2 py-2 px-2">
                <Select value={eventFilter} onValueChange={setEventFilter}>
                  <SelectTrigger className="h-8 w-36 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="upcoming">Upcoming</SelectItem>
                    <SelectItem value="past">Past</SelectItem>
                    <SelectItem value="all">All Events</SelectItem>
                  </SelectContent>
                </Select>
                <span className="text-sm text-slate-500">{filteredEvents.length} events</span>
                <div className="flex-1" />
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs gap-1.5 border-indigo-200 text-indigo-600 hover:bg-indigo-50"
                  onClick={() => {
                    setShowCalendarModal(true);
                    onClose(); // Close the activities panel when opening calendar
                  }}
                  data-testid="event-calendar-view-btn"
                >
                  <CalendarDays className="h-3.5 w-3.5" />
                  Calendar View
                </Button>
              </div>

              <div className="flex-1 overflow-y-auto">
                {loading ? (
                  <div className="flex items-center justify-center h-32">
                    <Loader className="h-6 w-6 animate-spin text-indigo-600" />
                  </div>
                ) : filteredEvents.length === 0 ? (
                  <div className="text-center py-8 text-slate-500">
                    <CalendarDays className="h-10 w-10 mx-auto mb-2 text-slate-300" />
                    <p>No {eventFilter} events</p>
                  </div>
                ) : (
                  <div className="space-y-2 px-2 pb-4">
                    {filteredEvents.map((event) => (
                      <div
                        key={event.id}
                        onClick={() => handleEventClick(event)}
                        className="p-3 bg-white border border-slate-200 rounded-lg cursor-pointer hover:border-indigo-300 hover:shadow-sm transition-all"
                      >
                        <div className="flex items-start gap-3">
                          <div className="flex-shrink-0 w-12 text-center">
                            <div className="text-xs font-medium text-indigo-600 uppercase">
                              {new Date(event.data?.start_date || event.created_at).toLocaleDateString('en-US', { month: 'short' })}
                            </div>
                            <div className="text-xl font-bold text-slate-900">
                              {new Date(event.data?.start_date || event.created_at).getDate()}
                            </div>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-slate-900 truncate">
                              {event.data?.subject || event.data?.name || 'Untitled Event'}
                            </p>
                            <div className="flex items-center gap-2 mt-1 text-sm text-slate-500">
                              <Clock className="h-3.5 w-3.5" />
                              <span>
                                {formatTime(event.data?.start_date)}
                                {event.data?.end_date && ` - ${formatTime(event.data.end_date)}`}
                              </span>
                            </div>
                            {event.data?.location && (
                              <div className="flex items-center gap-2 mt-1 text-sm text-slate-500">
                                <Building className="h-3.5 w-3.5" />
                                <span className="truncate">{event.data.location}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Timeline Tab */}
            <TabsContent value="timeline" className="flex-1 flex flex-col m-0 px-2">
              <div className="py-2 px-2">
                <p className="text-sm text-slate-500">Recent activity</p>
              </div>
              <div className="flex-1 overflow-y-auto">
                {loading ? (
                  <div className="flex items-center justify-center h-32">
                    <Loader className="h-6 w-6 animate-spin text-indigo-600" />
                  </div>
                ) : timeline.length === 0 ? (
                  <div className="text-center py-8 text-slate-500">
                    <Activity className="h-10 w-10 mx-auto mb-2 text-slate-300" />
                    <p>No recent activity</p>
                  </div>
                ) : (
                  <div className="relative px-2 pb-4">
                    <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-slate-200"></div>
                    
                    <div className="space-y-4">
                      {timeline.map((item) => (
                        <div key={item.id} className="relative flex items-start gap-4">
                          <div className={`relative z-10 w-3 h-3 rounded-full mt-1.5 ${
                            item.activity_type === 'task' ? 'bg-blue-500' : 'bg-green-500'
                          }`}></div>
                          
                          <div
                            onClick={() => item.activity_type === 'task' ? handleTaskClick(item) : handleEventClick(item)}
                            className="flex-1 p-3 bg-white border border-slate-200 rounded-lg cursor-pointer hover:border-indigo-300 transition-all"
                          >
                            <div className="flex items-center gap-2">
                              {item.activity_type === 'task' ? (
                                <ListTodo className="h-4 w-4 text-blue-500" />
                              ) : (
                                <CalendarDays className="h-4 w-4 text-green-500" />
                              )}
                              <span className="text-xs text-slate-500 capitalize">{item.activity_type}</span>
                              <span className="text-xs text-slate-400">•</span>
                              <span className="text-xs text-slate-500">
                                {new Date(item.created_at).toLocaleDateString()}
                              </span>
                            </div>
                            <p className="font-medium text-slate-900 mt-1 truncate">
                              {item.data?.subject || item.data?.name || 'Untitled'}
                            </p>
                            {item.data?.status && (
                              <Badge className={`text-xs mt-2 ${getStatusColor(item.data.status)}`}>
                                {item.data.status}
                              </Badge>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>

          {/* Footer */}
          <div className="p-3 border-t bg-slate-50">
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => {
                  navigate('/crm-platform');
                  // Navigate to tasks - will be handled by the main app
                  onClose();
                }}
              >
                <Plus className="h-4 w-4 mr-1" />
                New Task
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => {
                  navigate('/crm-platform');
                  onClose();
                }}
              >
                <Plus className="h-4 w-4 mr-1" />
                New Event
              </Button>
            </div>
          </div>
        </div>
      </SheetContent>
      
      {/* Calendar Modal - Beautiful Full-Screen Design */}
      <Dialog open={showCalendarModal} onOpenChange={setShowCalendarModal}>
        <DialogContent className="max-w-[95vw] w-[1400px] max-h-[92vh] h-[90vh] p-0 overflow-hidden border-0 shadow-2xl rounded-xl">
          <div className="flex h-full bg-gradient-to-br from-slate-50 to-slate-100">
            {/* Left Sidebar - Mini Calendar & Quick Stats */}
            <div className="w-72 bg-gradient-to-b from-indigo-600 via-indigo-700 to-purple-800 text-white flex flex-col">
              {/* Header */}
              <div className="p-5 border-b border-white/10">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white/20 rounded-lg backdrop-blur">
                    <CalendarIcon className="h-6 w-6" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold">Calendar</h2>
                    <p className="text-xs text-indigo-200">Tasks & Events</p>
                  </div>
                </div>
              </div>
              
              {/* Today's Date Display */}
              <div className="p-5 border-b border-white/10">
                <div className="text-center">
                  <p className="text-xs text-indigo-200 uppercase tracking-wider mb-1">Today</p>
                  <p className="text-4xl font-bold">{new Date().getDate()}</p>
                  <p className="text-sm text-indigo-200 mt-1">
                    {new Date().toLocaleDateString('en-US', { weekday: 'long' })}
                  </p>
                  <p className="text-xs text-indigo-300 mt-0.5">
                    {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                  </p>
                </div>
              </div>
              
              {/* Quick Stats */}
              <div className="p-4 space-y-3">
                <div className="bg-white/10 backdrop-blur rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CheckSquare className="h-4 w-4 text-indigo-200" />
                      <span className="text-sm">Tasks</span>
                    </div>
                    <Badge className="bg-white/20 text-white text-xs">{tasks.length}</Badge>
                  </div>
                </div>
                <div className="bg-white/10 backdrop-blur rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CalendarDays className="h-4 w-4 text-indigo-200" />
                      <span className="text-sm">Events</span>
                    </div>
                    <Badge className="bg-white/20 text-white text-xs">{events.length}</Badge>
                  </div>
                </div>
              </div>
              
              {/* Legend */}
              <div className="p-4 mt-auto border-t border-white/10">
                <p className="text-xs text-indigo-200 uppercase tracking-wider mb-3">Event Colors</p>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-red-500"></div>
                    <span className="text-xs text-indigo-100">High Priority</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-amber-500"></div>
                    <span className="text-xs text-indigo-100">Normal Priority</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
                    <span className="text-xs text-indigo-100">Low Priority</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-purple-500"></div>
                    <span className="text-xs text-indigo-100">Events</span>
                  </div>
                </div>
              </div>
              
              {/* Quick Actions */}
              <div className="p-4 border-t border-white/10">
                <Button
                  className="w-full bg-white text-indigo-700 hover:bg-indigo-50 font-medium"
                  size="sm"
                  onClick={() => {
                    setShowCalendarModal(false);
                    // Trigger new task modal
                  }}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  New Task
                </Button>
              </div>
            </div>
            
            {/* Main Calendar Area */}
            <div className="flex-1 flex flex-col">
              {/* Top Header */}
              <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-semibold text-slate-800">Activities Calendar</h3>
                  <p className="text-sm text-slate-500">View and manage your tasks and events</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-slate-400 hover:text-slate-600"
                  onClick={() => setShowCalendarModal(false)}
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>
              
              {/* Calendar Container with Custom Styling */}
              <div className="flex-1 p-4 overflow-hidden">
                <div className="h-full bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden calendar-modal-container">
                  <CalendarViewComponent hideHeader={true} />
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      
      {/* Custom Calendar Modal Styles */}
      <style>{`
        .calendar-modal-container .rbc-calendar {
          height: 100% !important;
          font-family: inherit;
        }
        .calendar-modal-container .rbc-header {
          padding: 12px 8px;
          font-weight: 600;
          font-size: 0.8rem;
          color: #475569;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          background: linear-gradient(to bottom, #f8fafc, #f1f5f9);
          border-bottom: 1px solid #e2e8f0 !important;
        }
        .calendar-modal-container .rbc-month-view {
          border: none;
          border-radius: 0;
        }
        .calendar-modal-container .rbc-month-row {
          border-color: #e2e8f0;
        }
        .calendar-modal-container .rbc-day-bg {
          border-color: #e2e8f0;
        }
        .calendar-modal-container .rbc-day-bg:hover {
          background: #f8fafc;
        }
        .calendar-modal-container .rbc-off-range-bg {
          background: #fafafa;
        }
        .calendar-modal-container .rbc-today {
          background: linear-gradient(135deg, #eef2ff 0%, #e0e7ff 100%) !important;
        }
        .calendar-modal-container .rbc-date-cell {
          padding: 8px;
          font-size: 0.875rem;
          font-weight: 500;
          color: #334155;
        }
        .calendar-modal-container .rbc-date-cell.rbc-now {
          color: #4f46e5;
          font-weight: 700;
        }
        .calendar-modal-container .rbc-event {
          border-radius: 6px !important;
          padding: 2px 6px !important;
          font-size: 0.75rem !important;
          font-weight: 500 !important;
          box-shadow: 0 1px 2px rgba(0,0,0,0.1) !important;
        }
        .calendar-modal-container .rbc-event:hover {
          transform: scale(1.02);
          box-shadow: 0 2px 4px rgba(0,0,0,0.15) !important;
        }
        .calendar-modal-container .rbc-toolbar {
          padding: 16px 20px;
          margin-bottom: 0;
          background: #fff;
          border-bottom: 1px solid #e2e8f0;
          gap: 16px;
        }
        .calendar-modal-container .rbc-toolbar button {
          border-radius: 8px;
          padding: 8px 16px;
          font-size: 0.875rem;
          font-weight: 500;
          border: 1px solid #e2e8f0;
          background: #fff;
          color: #475569;
          transition: all 0.15s ease;
        }
        .calendar-modal-container .rbc-toolbar button:hover {
          background: #f1f5f9;
          border-color: #cbd5e1;
        }
        .calendar-modal-container .rbc-toolbar button.rbc-active {
          background: linear-gradient(135deg, #4f46e5 0%, #6366f1 100%);
          color: white;
          border-color: #4f46e5;
          box-shadow: 0 2px 4px rgba(79, 70, 229, 0.3);
        }
        .calendar-modal-container .rbc-toolbar-label {
          font-size: 1.25rem;
          font-weight: 700;
          color: #1e293b;
        }
        .calendar-modal-container .rbc-btn-group button:first-child {
          border-radius: 8px 0 0 8px;
        }
        .calendar-modal-container .rbc-btn-group button:last-child {
          border-radius: 0 8px 8px 0;
        }
        .calendar-modal-container .rbc-btn-group button:only-child {
          border-radius: 8px;
        }
        .calendar-modal-container .rbc-show-more {
          color: #4f46e5;
          font-weight: 600;
          font-size: 0.75rem;
        }
      `}</style>
    </Sheet>
  );
};

const SalesConsoleHeader = ({ currentView = 'list', onViewChange, onLogout, isRecordView = false, onEditPage, onOpenRecordTab }) => {
  const [user, setUser] = useState(null);
  const [tenant, setTenant] = useState(null);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showActivitiesPanel, setShowActivitiesPanel] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Get user and tenant from localStorage
    const loadUserData = () => {
      const userData = localStorage.getItem('user');
      const tenantData = localStorage.getItem('tenant');
      
      if (userData) {
        try {
          const parsed = JSON.parse(userData);
          setUser(parsed);
        } catch (e) {
          console.error('Failed to parse user data');
        }
      }
      
      if (tenantData) {
        try {
          const parsed = JSON.parse(tenantData);
          setTenant(parsed);
        } catch (e) {
          console.error('Failed to parse tenant data');
        }
      }
    };
    
    // Load initially
    loadUserData();
    
    // Listen for storage changes (e.g., when user logs in from another tab or after login)
    const handleStorageChange = (e) => {
      if (e.key === 'user' || e.key === 'tenant') {
        loadUserData();
      }
    };
    
    window.addEventListener('storage', handleStorageChange);
    
    // Also re-check when window gains focus (in case login happened in another context)
    const handleFocus = () => loadUserData();
    window.addEventListener('focus', handleFocus);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('tenant');
    localStorage.removeItem('tenant_id');
    window.location.href = '/auth';
  };

  return (
    <header className="bg-white border-b border-slate-200 shadow-sm">
      <div className="px-4 py-1.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-2">
              <div className="w-6 h-6 bg-gradient-to-r from-indigo-600 to-cyan-600 rounded flex items-center justify-center">
                <BarChart3 className="h-3.5 w-3.5 text-white" />
              </div>
              <h1 className="text-sm font-semibold text-slate-800">
                {tenant?.company_name || 'mackindustry'}
              </h1>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {/* Enhanced Global Search Bar */}
            <EnhancedGlobalSearchBar 
              className="mr-2" 
              onOpenRecordTab={onOpenRecordTab}
            />
            
            {/* Logged-in user display - Clickable to profile */}
            <button 
              onClick={() => navigate(`/users/${user?.id}`)}
              className="hidden sm:flex items-center space-x-2 text-sm text-slate-600 border-r border-slate-200 pr-3 mr-1 hover:text-blue-600 hover:underline transition-colors"
              title="View My Profile"
              data-testid="user-profile-link"
            >
              <span>Hi, {user?.first_name || 'User'}</span>
            </button>
            
            {/* Calendar Button - Opens Activities Panel */}
            <Button 
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-slate-600" 
              title="Calendar / Activities"
              onClick={() => setShowActivitiesPanel(true)}
              data-testid="calendar-activities-btn"
            >
              <CalendarIcon className="h-4 w-4" />
            </Button>
            
            {/* Notification Center (Bell Icon) */}
<div title="Notifications">
  <NotificationCenter />
</div>
            {/* Settings Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-slate-600"
                  title="Setup"
                >
                  <Settings className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {isRecordView && onEditPage && (
                  <DropdownMenuItem onClick={onEditPage}>
                    <Settings className="h-4 w-4 mr-2" />
                    Edit Page
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => window.open('/setup', '_blank')}>
                  <Settings className="h-4 w-4 mr-2" />
                  Setup
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Profile/Logout */}
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={handleLogout}
              className="h-7 px-2 text-slate-600"
              title="Logout"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
      
      {/* Activities Center Panel */}
      <ActivitiesCenterPanel 
        isOpen={showActivitiesPanel} 
        onClose={() => setShowActivitiesPanel(false)} 
      />
    </header>
  );
};

export default SalesConsoleHeader;
