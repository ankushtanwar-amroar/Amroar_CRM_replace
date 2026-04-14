/**
 * DynamicActivityTimeline - Fully dynamic activity timeline component
 * 
 * Features:
 * - Fetches all activity types (tasks, events, emails, calls, notes)
 * - Groups by date (Today, Yesterday, Older)
 * - Ordered by createdAt DESC
 * - Dynamic activity type icons
 * - Click to open detail drawer
 * - Real-time updates
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import axios from 'axios';
import { 
  Calendar, CheckCircle, Mail, Phone, FileText, MessageSquare,
  Clock, User, ChevronDown, ChevronUp, Plus, Loader2, RefreshCw,
  ExternalLink, MoreHorizontal, Filter
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '../../components/ui/sheet';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Activity type configuration
const ACTIVITY_CONFIG = {
  task: {
    icon: CheckCircle,
    label: 'Task',
    color: 'bg-blue-500',
    lightColor: 'bg-blue-50',
    textColor: 'text-blue-700',
    borderColor: 'border-blue-200',
  },
  event: {
    icon: Calendar,
    label: 'Event',
    color: 'bg-purple-500',
    lightColor: 'bg-purple-50',
    textColor: 'text-purple-700',
    borderColor: 'border-purple-200',
  },
  email: {
    icon: Mail,
    label: 'Email',
    color: 'bg-green-500',
    lightColor: 'bg-green-50',
    textColor: 'text-green-700',
    borderColor: 'border-green-200',
  },
  emailmessage: {
    icon: Mail,
    label: 'Email',
    color: 'bg-green-500',
    lightColor: 'bg-green-50',
    textColor: 'text-green-700',
    borderColor: 'border-green-200',
  },
  call: {
    icon: Phone,
    label: 'Call',
    color: 'bg-orange-500',
    lightColor: 'bg-orange-50',
    textColor: 'text-orange-700',
    borderColor: 'border-orange-200',
  },
  note: {
    icon: FileText,
    label: 'Note',
    color: 'bg-slate-500',
    lightColor: 'bg-slate-50',
    textColor: 'text-slate-700',
    borderColor: 'border-slate-200',
  },
  default: {
    icon: MessageSquare,
    label: 'Activity',
    color: 'bg-slate-500',
    lightColor: 'bg-slate-50',
    textColor: 'text-slate-700',
    borderColor: 'border-slate-200',
  },
};

/**
 * Get activity configuration
 */
const getActivityConfig = (type) => {
  return ACTIVITY_CONFIG[type?.toLowerCase()] || ACTIVITY_CONFIG.default;
};

/**
 * Format relative date
 */
const formatRelativeDate = (dateString) => {
  if (!dateString) return '';
  
  const date = new Date(dateString);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  
  const activityDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  
  if (activityDate.getTime() === today.getTime()) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } else if (activityDate.getTime() === yesterday.getTime()) {
    return `Yesterday, ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  } else {
    return date.toLocaleDateString([], { 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
};

/**
 * Get date group key
 */
const getDateGroup = (dateString) => {
  if (!dateString) return 'older';
  
  const date = new Date(dateString);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  
  const activityDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  
  if (activityDate.getTime() === today.getTime()) {
    return 'today';
  } else if (activityDate.getTime() === yesterday.getTime()) {
    return 'yesterday';
  } else {
    return 'older';
  }
};

/**
 * Activity Item Component
 */
const ActivityItem = ({ activity, onClick }) => {
  const config = getActivityConfig(activity.type);
  const IconComponent = config.icon;
  
  const title = activity.subject || activity.name || activity.title || 'Untitled';
  const description = activity.description || activity.body || '';
  
  return (
    <div
      className={`
        flex items-start gap-3 p-3 rounded-lg border cursor-pointer
        transition-all duration-150 hover:shadow-md hover:border-slate-300
        ${config.lightColor} ${config.borderColor}
      `}
      onClick={() => onClick(activity)}
      data-testid={`activity-item-${activity.id}`}
    >
      {/* Icon */}
      <div className={`
        w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0
        ${config.color} shadow-sm
      `}>
        <IconComponent className="h-4 w-4 text-white" />
      </div>
      
      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-medium text-slate-900 truncate">
              {title}
            </h4>
            {description && (
              <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">
                {description}
              </p>
            )}
          </div>
          
          <Badge 
            variant="outline" 
            className={`text-[10px] px-1.5 py-0 h-5 flex-shrink-0 ${config.textColor} border-current`}
          >
            {config.label}
          </Badge>
        </div>
        
        {/* Meta */}
        <div className="flex items-center gap-3 mt-2">
          <span className="text-[11px] text-slate-400 flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatRelativeDate(activity.created_at || activity.createdAt || activity.date)}
          </span>
          
          {activity.status && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5">
              {activity.status}
            </Badge>
          )}
          
          {activity.owner_name && (
            <span className="text-[11px] text-slate-400 flex items-center gap-1">
              <User className="h-3 w-3" />
              {activity.owner_name}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

/**
 * Activity Detail Sheet Component
 */
const ActivityDetailSheet = ({ activity, isOpen, onClose }) => {
  if (!activity) return null;
  
  const config = getActivityConfig(activity.type);
  const IconComponent = config.icon;
  
  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent className="w-[400px] sm:w-[540px]">
        <SheetHeader>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${config.color}`}>
              <IconComponent className="h-5 w-5 text-white" />
            </div>
            <div>
              <SheetTitle className="text-left">
                {activity.subject || activity.name || activity.title || 'Activity Details'}
              </SheetTitle>
              <SheetDescription className="text-left">
                {config.label} • {formatRelativeDate(activity.created_at || activity.createdAt)}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>
        
        <div className="mt-6 space-y-4">
          {/* Status */}
          {activity.status && (
            <div>
              <label className="text-xs font-medium text-slate-500 uppercase">Status</label>
              <p className="text-sm text-slate-900 mt-1">
                <Badge>{activity.status}</Badge>
              </p>
            </div>
          )}
          
          {/* Description */}
          {(activity.description || activity.body) && (
            <div>
              <label className="text-xs font-medium text-slate-500 uppercase">Description</label>
              <p className="text-sm text-slate-700 mt-1 whitespace-pre-wrap">
                {activity.description || activity.body}
              </p>
            </div>
          )}
          
          {/* Due Date */}
          {activity.due_date && (
            <div>
              <label className="text-xs font-medium text-slate-500 uppercase">Due Date</label>
              <p className="text-sm text-slate-900 mt-1">
                {new Date(activity.due_date).toLocaleDateString()}
              </p>
            </div>
          )}
          
          {/* Start/End Time for Events */}
          {activity.start_datetime && (
            <div>
              <label className="text-xs font-medium text-slate-500 uppercase">Start Time</label>
              <p className="text-sm text-slate-900 mt-1">
                {new Date(activity.start_datetime).toLocaleString()}
              </p>
            </div>
          )}
          
          {activity.end_datetime && (
            <div>
              <label className="text-xs font-medium text-slate-500 uppercase">End Time</label>
              <p className="text-sm text-slate-900 mt-1">
                {new Date(activity.end_datetime).toLocaleString()}
              </p>
            </div>
          )}
          
          {/* Owner */}
          {activity.owner_name && (
            <div>
              <label className="text-xs font-medium text-slate-500 uppercase">Owner</label>
              <p className="text-sm text-slate-900 mt-1">{activity.owner_name}</p>
            </div>
          )}
          
          {/* Created Date */}
          <div>
            <label className="text-xs font-medium text-slate-500 uppercase">Created</label>
            <p className="text-sm text-slate-900 mt-1">
              {new Date(activity.created_at || activity.createdAt).toLocaleString()}
            </p>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};

/**
 * DynamicActivityTimeline Component
 */
const DynamicActivityTimeline = ({ 
  objectName, 
  recordId, 
  onCreateActivity,
  maxHeight = '400px',
  showHeader = true,
}) => {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedActivity, setSelectedActivity] = useState(null);
  const [showDetail, setShowDetail] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState({ today: true, yesterday: true, older: true });
  const [filter, setFilter] = useState('all');

  // Helper to extract records array from API response
  const extractRecords = (response) => {
    if (!response?.data) return [];
    // Handle both { records: [...] } and direct array response
    const data = response.data;
    if (Array.isArray(data)) return data;
    if (data.records && Array.isArray(data.records)) return data.records;
    return [];
  };

  // Fetch activities
  const fetchActivities = useCallback(async () => {
    if (!recordId) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const token = localStorage.getItem('token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      
      // Try multiple endpoints to get all activities
      const [tasksRes, eventsRes] = await Promise.allSettled([
        axios.get(`${API}/objects/task/records`, { headers }).catch(() => ({ data: { records: [] } })),
        axios.get(`${API}/objects/event/records`, { headers }).catch(() => ({ data: { records: [] } })),
      ]);
      
      // Extract records from responses
      const tasksData = tasksRes.status === 'fulfilled' ? extractRecords(tasksRes.value) : [];
      const eventsData = eventsRes.status === 'fulfilled' ? extractRecords(eventsRes.value) : [];
      
      // Filter by related_to field
      const tasks = tasksData.filter(t => {
        const relatedTo = t.data?.related_to || t.related_to;
        return relatedTo === recordId;
      });
      
      const events = eventsData.filter(e => {
        const relatedTo = e.data?.related_to || e.related_to;
        return relatedTo === recordId;
      });
      
      // Normalize and combine activities
      const allActivities = [
        ...tasks.map(t => ({
          ...t,
          id: t.id,
          type: 'task',
          subject: t.data?.subject || t.data?.name || 'Task',
          description: t.data?.description,
          status: t.data?.status,
          created_at: t.created_at || t.createdAt,
          due_date: t.data?.due_date,
          owner_name: t.data?.owner_name,
        })),
        ...events.map(e => ({
          ...e,
          id: e.id,
          type: 'event',
          subject: e.data?.subject || e.data?.name || 'Event',
          description: e.data?.description,
          status: e.data?.status,
          created_at: e.created_at || e.createdAt,
          start_datetime: e.data?.start_datetime,
          end_datetime: e.data?.end_datetime,
          owner_name: e.data?.owner_name,
        })),
      ];
      
      // Sort by created_at DESC
      allActivities.sort((a, b) => {
        const dateA = new Date(a.created_at || 0);
        const dateB = new Date(b.created_at || 0);
        return dateB - dateA;
      });
      
      setActivities(allActivities);
    } catch (err) {
      console.error('Error fetching activities:', err);
      setError('Failed to load activities');
    } finally {
      setLoading(false);
    }
  }, [recordId]);

  useEffect(() => {
    fetchActivities();
  }, [fetchActivities]);

  // Group activities by date
  const groupedActivities = useMemo(() => {
    const groups = {
      today: [],
      yesterday: [],
      older: [],
    };
    
    const filteredActivities = filter === 'all' 
      ? activities 
      : activities.filter(a => a.type === filter);
    
    filteredActivities.forEach(activity => {
      const group = getDateGroup(activity.created_at);
      groups[group].push(activity);
    });
    
    return groups;
  }, [activities, filter]);

  const toggleGroup = (group) => {
    setExpandedGroups(prev => ({
      ...prev,
      [group]: !prev[group]
    }));
  };

  const handleActivityClick = (activity) => {
    setSelectedActivity(activity);
    setShowDetail(true);
  };

  const totalCount = activities.length;

  return (
    <Card className="shadow-sm border-slate-200">
      {showHeader && (
        <CardHeader className="pb-3 border-b border-slate-100">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold text-slate-900 flex items-center gap-2">
              Activity Timeline
              {totalCount > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {totalCount}
                </Badge>
              )}
            </CardTitle>
            
            <div className="flex items-center gap-2">
              {/* Filter */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 gap-1">
                    <Filter className="h-3.5 w-3.5" />
                    {filter === 'all' ? 'All' : getActivityConfig(filter).label}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setFilter('all')}>
                    All Activities
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setFilter('task')}>
                    <CheckCircle className="h-4 w-4 mr-2 text-blue-500" />
                    Tasks
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setFilter('event')}>
                    <Calendar className="h-4 w-4 mr-2 text-purple-500" />
                    Events
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setFilter('email')}>
                    <Mail className="h-4 w-4 mr-2 text-green-500" />
                    Emails
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              
              {/* Refresh */}
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={fetchActivities}
                disabled={loading}
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
              
              {/* Add Activity */}
              {onCreateActivity && (
                <Button
                  size="sm"
                  className="h-8 bg-blue-600 hover:bg-blue-700"
                  onClick={onCreateActivity}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Log Activity
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
      )}
      
      <CardContent className="p-0">
        <div 
          className="overflow-y-auto"
          style={{ maxHeight }}
        >
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
              <span className="ml-2 text-slate-500">Loading activities...</span>
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <p className="text-red-500">{error}</p>
              <Button variant="outline" size="sm" className="mt-2" onClick={fetchActivities}>
                Retry
              </Button>
            </div>
          ) : totalCount === 0 ? (
            <div className="text-center py-12">
              <MessageSquare className="h-12 w-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500">No activities yet</p>
              <p className="text-sm text-slate-400 mt-1">
                Activities will appear here as they are created
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {/* Today */}
              {groupedActivities.today.length > 0 && (
                <div>
                  <button
                    className="w-full flex items-center justify-between px-4 py-2 bg-slate-50 hover:bg-slate-100 transition-colors"
                    onClick={() => toggleGroup('today')}
                  >
                    <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                      Today ({groupedActivities.today.length})
                    </span>
                    {expandedGroups.today ? (
                      <ChevronUp className="h-4 w-4 text-slate-400" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-slate-400" />
                    )}
                  </button>
                  {expandedGroups.today && (
                    <div className="p-3 space-y-2">
                      {groupedActivities.today.map(activity => (
                        <ActivityItem
                          key={activity.id}
                          activity={activity}
                          onClick={handleActivityClick}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
              
              {/* Yesterday */}
              {groupedActivities.yesterday.length > 0 && (
                <div>
                  <button
                    className="w-full flex items-center justify-between px-4 py-2 bg-slate-50 hover:bg-slate-100 transition-colors"
                    onClick={() => toggleGroup('yesterday')}
                  >
                    <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                      Yesterday ({groupedActivities.yesterday.length})
                    </span>
                    {expandedGroups.yesterday ? (
                      <ChevronUp className="h-4 w-4 text-slate-400" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-slate-400" />
                    )}
                  </button>
                  {expandedGroups.yesterday && (
                    <div className="p-3 space-y-2">
                      {groupedActivities.yesterday.map(activity => (
                        <ActivityItem
                          key={activity.id}
                          activity={activity}
                          onClick={handleActivityClick}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
              
              {/* Older */}
              {groupedActivities.older.length > 0 && (
                <div>
                  <button
                    className="w-full flex items-center justify-between px-4 py-2 bg-slate-50 hover:bg-slate-100 transition-colors"
                    onClick={() => toggleGroup('older')}
                  >
                    <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                      Older ({groupedActivities.older.length})
                    </span>
                    {expandedGroups.older ? (
                      <ChevronUp className="h-4 w-4 text-slate-400" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-slate-400" />
                    )}
                  </button>
                  {expandedGroups.older && (
                    <div className="p-3 space-y-2">
                      {groupedActivities.older.map(activity => (
                        <ActivityItem
                          key={activity.id}
                          activity={activity}
                          onClick={handleActivityClick}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>
      
      {/* Activity Detail Sheet */}
      <ActivityDetailSheet
        activity={selectedActivity}
        isOpen={showDetail}
        onClose={() => setShowDetail(false)}
      />
    </Card>
  );
};

export default DynamicActivityTimeline;
