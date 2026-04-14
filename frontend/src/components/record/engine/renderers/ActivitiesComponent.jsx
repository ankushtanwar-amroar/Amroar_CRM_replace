/**
 * ActivitiesComponent - Dynamic Activity Timeline with Creation
 * 
 * Features:
 * - Renders activity filters (Emails, Log a Call, Tasks, Events, etc.)
 * - Shows activity timeline grouped by date (Today, Yesterday, Older)
 * - Supports creating new activities (New Event, New Task buttons)
 * - Fully configurable via layout config
 */
import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
  Mail,
  Phone,
  CheckSquare,
  Calendar,
  MessageSquare,
  Clock,
  FileText,
  Filter,
  Plus,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Loader2,
} from 'lucide-react';
import { Button } from '../../../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../../components/ui/card';
import { Badge } from '../../../../components/ui/badge';
import { Checkbox } from '../../../../components/ui/checkbox';
import { cn } from '../../../../lib/utils';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Icon mapping for activity types
const ACTIVITY_ICONS = {
  email: Mail,
  call: Phone,
  task: CheckSquare,
  event: Calendar,
  note: FileText,
  message: MessageSquare,
};

// Color mapping for activity types
const ACTIVITY_COLORS = {
  email: { bg: 'bg-blue-100', text: 'text-blue-600', border: 'border-blue-200' },
  call: { bg: 'bg-orange-100', text: 'text-orange-600', border: 'border-orange-200' },
  task: { bg: 'bg-green-100', text: 'text-green-600', border: 'border-green-200' },
  event: { bg: 'bg-purple-100', text: 'text-purple-600', border: 'border-purple-200' },
  note: { bg: 'bg-gray-100', text: 'text-gray-600', border: 'border-gray-200' },
};

// Default activity type configuration
const DEFAULT_ACTIVITY_TYPES = [
  { type: 'email', label: 'Emails', icon: 'mail', color: 'blue', enabledInTimeline: true },
  { type: 'call', label: 'Log a Call', icon: 'phone', color: 'orange', enabledInTimeline: true },
  { type: 'task', label: 'Tasks', icon: 'check-circle', color: 'green', enabledInTimeline: true },
  { type: 'event', label: 'Events', icon: 'calendar', color: 'purple', enabledInTimeline: true },
];

/**
 * Group activities by date (Today, Yesterday, Older)
 */
const groupActivitiesByDate = (activities) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  
  const groups = {
    today: [],
    yesterday: [],
    older: [],
  };
  
  activities.forEach(activity => {
    const activityDate = new Date(activity.created_at || activity.createdAt);
    activityDate.setHours(0, 0, 0, 0);
    
    if (activityDate.getTime() === today.getTime()) {
      groups.today.push(activity);
    } else if (activityDate.getTime() === yesterday.getTime()) {
      groups.yesterday.push(activity);
    } else {
      groups.older.push(activity);
    }
  });
  
  return groups;
};

/**
 * Format date/time for display
 */
const formatActivityTime = (dateStr) => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const formatActivityDate = (dateStr) => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
};

/**
 * Single Activity Item
 */
const ActivityItem = ({ activity, onClick }) => {
  const activityType = activity.type || 'task';
  const IconComponent = ACTIVITY_ICONS[activityType] || FileText;
  const colors = ACTIVITY_COLORS[activityType] || ACTIVITY_COLORS.note;
  
  const title = activity.subject || activity.data?.subject || activity.data?.name || 'Activity';
  const status = activity.status || activity.data?.status;
  const createdAt = activity.created_at || activity.createdAt;
  
  return (
    <div 
      className="flex items-start gap-3 py-3 px-2 hover:bg-slate-50 rounded-md cursor-pointer transition-colors"
      onClick={() => onClick?.(activity)}
      data-testid={`activity-item-${activity.id}`}
    >
      {/* Icon */}
      <div className={cn("w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0", colors.bg)}>
        <IconComponent className={cn("h-4 w-4", colors.text)} />
      </div>
      
      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={cn("text-xs font-semibold uppercase", colors.text)}>
            {activityType.charAt(0).toUpperCase() + activityType.slice(1)}
          </span>
          {status && (
            <Badge variant="outline" className="text-[10px] px-1 py-0">
              {status}
            </Badge>
          )}
        </div>
        <p className="text-sm font-medium text-slate-800 truncate mt-0.5">
          {title}
        </p>
        <p className="text-xs text-slate-500 mt-0.5">
          Created: {formatActivityDate(createdAt)}, {formatActivityTime(createdAt)}
        </p>
      </div>
    </div>
  );
};

/**
 * Activity Group (Today, Yesterday, Older)
 */
const ActivityGroup = ({ title, activities, onActivityClick }) => {
  const [isExpanded, setIsExpanded] = useState(true);
  
  if (activities.length === 0) return null;
  
  return (
    <div className="mb-4">
      <button
        className="flex items-center gap-2 w-full text-left py-1 text-xs font-semibold text-slate-500 uppercase tracking-wide"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
        {title} ({activities.length})
      </button>
      
      {isExpanded && (
        <div className="border-l-2 border-slate-200 ml-1 pl-3 mt-1">
          {activities.map((activity) => (
            <ActivityItem 
              key={activity.id} 
              activity={activity} 
              onClick={onActivityClick}
            />
          ))}
        </div>
      )}
    </div>
  );
};

/**
 * Main Activities Component
 */
const ActivitiesComponent = ({
  config = {},
  record,
  objectName,
  objectSchema,
}) => {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({});
  const [isFilterExpanded, setIsFilterExpanded] = useState(true);
  
  // Get activity types from config or use defaults
  const activityTypes = config.activityTypes || DEFAULT_ACTIVITY_TYPES;
  
  // Initialize filters based on activity types
  useEffect(() => {
    const initialFilters = {};
    activityTypes.forEach(at => {
      if (at.enabledInTimeline !== false) {
        initialFilters[at.type] = true;
      }
    });
    setFilters(initialFilters);
  }, [activityTypes]);
  
  // Fetch activities for this record
  const fetchActivities = useCallback(async () => {
    if (!record?.id) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      
      // Fetch activities from multiple object types in parallel
      const typesToFetch = activityTypes
        .filter(at => at.enabledInTimeline !== false)
        .map(at => at.type);
      
      const fetchPromises = typesToFetch.map(type =>
        axios.get(`${API}/objects/${type}/records`, { headers })
          .then(res => {
            const records = res.data?.records || res.data || [];
            return records
              .filter(r => {
                const relatedTo = r.data?.related_to || r.related_to;
                return relatedTo === record.id;
              })
              .map(r => ({
                ...r,
                type,
                subject: r.data?.subject || r.data?.name,
                status: r.data?.status,
                created_at: r.created_at || r.createdAt,
              }));
          })
          .catch(() => [])
      );
      
      const results = await Promise.all(fetchPromises);
      const allActivities = results.flat();
      
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
  }, [record?.id, activityTypes]);
  
  useEffect(() => {
    fetchActivities();
  }, [fetchActivities]);
  
  // Filter activities based on selected filters
  const filteredActivities = activities.filter(a => filters[a.type]);
  const groupedActivities = groupActivitiesByDate(filteredActivities);
  
  // Toggle filter
  const toggleFilter = (type) => {
    setFilters(prev => ({ ...prev, [type]: !prev[type] }));
  };
  
  // Handle activity click (for opening detail drawer)
  const handleActivityClick = (activity) => {
    console.log('Activity clicked:', activity);
    // TODO: Open activity detail drawer/modal
  };
  
  // Get new buttons from config
  const newButtons = activityTypes
    .filter(at => at.newButtonEnabled)
    .slice(0, config.maxVisibleButtons || 3);
  
  return (
    <Card className="shadow-sm border-slate-200" data-testid="activities-component">
      <CardHeader className="py-3 px-4 border-b border-slate-100">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <Clock className="h-4 w-4 text-blue-600" />
            Activity Timeline
          </CardTitle>
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-7 w-7 p-0"
            onClick={fetchActivities}
            disabled={loading}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          </Button>
        </div>
        
        {/* New Activity Buttons */}
        {newButtons.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {newButtons.map(bt => {
              const IconComp = ACTIVITY_ICONS[bt.type] || Plus;
              const colors = ACTIVITY_COLORS[bt.type] || ACTIVITY_COLORS.task;
              return (
                <Button
                  key={bt.type}
                  size="sm"
                  variant="outline"
                  className={cn(
                    "h-7 text-xs gap-1",
                    colors.text,
                    colors.border
                  )}
                >
                  <IconComp className="h-3 w-3" />
                  {bt.newButtonLabel || `New ${bt.label}`}
                </Button>
              );
            })}
          </div>
        )}
      </CardHeader>
      
      <CardContent className="p-3">
        {/* Filters */}
        <div className="mb-3">
          <button
            className="flex items-center gap-2 text-xs font-medium text-slate-600 mb-2"
            onClick={() => setIsFilterExpanded(!isFilterExpanded)}
          >
            <Filter className="h-3 w-3" />
            Filters
            {isFilterExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
          
          {isFilterExpanded && (
            <div className="flex flex-wrap gap-3 py-2 px-1 bg-slate-50 rounded-md">
              {activityTypes.map(at => {
                const IconComp = ACTIVITY_ICONS[at.type] || FileText;
                const isChecked = filters[at.type] || false;
                return (
                  <label
                    key={at.type}
                    className="flex items-center gap-1.5 cursor-pointer text-xs"
                  >
                    <Checkbox 
                      checked={isChecked}
                      onCheckedChange={() => toggleFilter(at.type)}
                      className="h-3.5 w-3.5"
                    />
                    <IconComp className="h-3 w-3 text-slate-500" />
                    <span className="text-slate-700">{at.label}</span>
                  </label>
                );
              })}
            </div>
          )}
        </div>
        
        {/* Timeline */}
        <div className="max-h-[400px] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            </div>
          ) : error ? (
            <div className="text-center py-6 text-sm text-red-500">
              {error}
            </div>
          ) : filteredActivities.length === 0 ? (
            <div className="text-center py-8">
              <Clock className="h-10 w-10 text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-500">No activities yet</p>
              <p className="text-xs text-slate-400 mt-1">
                Activities will appear here as they are created
              </p>
            </div>
          ) : (
            <>
              <ActivityGroup 
                title="Today" 
                activities={groupedActivities.today}
                onActivityClick={handleActivityClick}
              />
              <ActivityGroup 
                title="Yesterday" 
                activities={groupedActivities.yesterday}
                onActivityClick={handleActivityClick}
              />
              <ActivityGroup 
                title="Older" 
                activities={groupedActivities.older}
                onActivityClick={handleActivityClick}
              />
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default ActivitiesComponent;
