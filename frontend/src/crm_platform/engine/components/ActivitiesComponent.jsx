/**
 * ActivitiesComponent - Full Activity Timeline with Creation
 * 
 * Features:
 * - Load Tasks, Events, Emails, Calls dynamically
 * - Sort by createdAt DESC
 * - Group by Today / Yesterday / Older
 * - Create: New Task, New Event via FULL CreateRecordDialog
 * - New Email opens unified DockedEmailComposer
 * - On create → refresh timeline automatically via events
 * - Click on activity → open record in new tab
 * 
 * UPDATED: Now uses centralized CreateRecordService for consistent create behavior
 * UPDATED: Listens for RECORD_CREATED_EVENT to auto-refresh
 * UPDATED: Email button opens DockedEmailComposer for unified experience
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  Mail, Phone, CheckSquare, Calendar, Clock,
  ChevronDown, ChevronUp, Plus, RefreshCw, Loader2
} from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { Badge } from '../../../components/ui/badge';
import { useConsoleSafe } from '../../contexts/ConsoleContext';
import { useCreateRecord, RECORD_CREATED_EVENT } from '../../../services/createRecord';
import DockedEmailComposer from '../../../components/email/DockedEmailComposer';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Activity type configuration
const ACTIVITY_TYPES = {
  task: { icon: CheckSquare, color: 'green', label: 'Task', bgColor: 'bg-green-500' },
  event: { icon: Calendar, color: 'purple', label: 'Event', bgColor: 'bg-purple-500' },
  email: { icon: Mail, color: 'blue', label: 'Email', bgColor: 'bg-blue-500' },
  call: { icon: Phone, color: 'orange', label: 'Call', bgColor: 'bg-orange-500' },
};

/**
 * Check if a record is related to the parent record
 */
const isRelatedToParent = (record, parentRecordId) => {
  const data = record?.data || record;
  return (
    data.related_to_id === parentRecordId ||
    data.related_to === parentRecordId ||
    data.parent_id === parentRecordId ||
    data.lead_id === parentRecordId ||
    data.account_id === parentRecordId ||
    data.contact_id === parentRecordId ||
    data.opportunity_id === parentRecordId
  );
};

/**
 * Group activities by date
 */
const groupByDate = (activities) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  
  const groups = { today: [], yesterday: [], older: [] };
  
  activities.forEach(activity => {
    const date = new Date(activity.created_at);
    date.setHours(0, 0, 0, 0);
    
    if (date.getTime() === today.getTime()) {
      groups.today.push(activity);
    } else if (date.getTime() === yesterday.getTime()) {
      groups.yesterday.push(activity);
    } else {
      groups.older.push(activity);
    }
  });
  
  return groups;
};

/**
 * Activity Item - Clickable to open record in new tab
 */
const ActivityItem = ({ activity, onRecordClick }) => {
  const type = activity.type || 'task';
  const typeConfig = ACTIVITY_TYPES[type] || ACTIVITY_TYPES.task;
  const Icon = typeConfig.icon;
  
  const subject = activity.data?.subject || activity.data?.name || activity.subject || 'Activity';
  const status = activity.data?.status || activity.status;
  const createdAt = new Date(activity.created_at || activity.activity_date);
  
  // Email-specific: Get recipient info
  const emailTo = activity.data?.to || activity.email_data?.to;
  const description = activity.data?.description || activity.description;
  
  // Handle click to navigate to record detail
  const handleClick = () => {
    if (onRecordClick && type !== 'email') {
      // Only navigate for non-email activities (tasks/events have their own records)
      onRecordClick(type, activity.id, activity.public_id || activity.id, subject);
    }
  };
  
  return (
    <div 
      className={`px-4 py-3 border-b border-slate-100 hover:bg-slate-50 transition-colors ${type !== 'email' ? 'cursor-pointer' : ''}`}
      onClick={handleClick}
      data-testid={`activity-item-${activity.id}`}
    >
      <div className="flex items-start space-x-3">
        <div className={`w-7 h-7 ${typeConfig.bgColor} rounded-full flex items-center justify-center flex-shrink-0`}>
          <Icon className="h-3.5 w-3.5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-xs font-semibold uppercase text-${typeConfig.color}-600`}>
              {typeConfig.label}
            </span>
            {status && (
              <Badge variant="outline" className="text-[10px] px-1 py-0">{status}</Badge>
            )}
          </div>
          <p className="text-sm font-medium text-slate-800 mt-0.5 truncate">{subject}</p>
          {/* Show recipient for emails */}
          {type === 'email' && emailTo && (
            <p className="text-xs text-slate-500 mt-0.5 truncate">
              To: {emailTo}
            </p>
          )}
          {/* Show description preview for emails */}
          {type === 'email' && description && (
            <p className="text-xs text-slate-400 mt-0.5 truncate max-w-md">
              {description.substring(0, 100)}...
            </p>
          )}
          <p className="text-xs text-slate-400 mt-0.5">
            {createdAt.toLocaleDateString()} at {createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
      </div>
    </div>
  );
};

/**
 * Activity Group
 */
const ActivityGroup = ({ title, activities, onRecordClick }) => {
  const [expanded, setExpanded] = useState(true);
  
  if (activities.length === 0) return null;
  
  return (
    <div className="mb-2">
      <button
        className="flex items-center gap-2 w-full text-left py-1.5 px-4 bg-slate-50 border-b text-xs font-semibold text-slate-500 uppercase tracking-wide"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
        {title} ({activities.length})
      </button>
      {expanded && activities.map(activity => (
        <ActivityItem key={activity.id} activity={activity} onRecordClick={onRecordClick} />
      ))}
    </div>
  );
};

/**
 * Main Activities Component
 * UPDATED: Uses centralized CreateRecordService for full dynamic create dialog
 * UPDATED: Listens for RECORD_CREATED_EVENT to auto-refresh
 * UPDATED: Now respects Lightning App Builder activity type configuration
 */
const ActivitiesComponent = ({ config = {}, context = {} }) => {
  const { record, objectName } = context;
  const recordId = record?.id || record?.series_id;
  const consoleContext = useConsoleSafe();
  const navigate = useNavigate();
  const { openCreateDialog } = useCreateRecord();
  
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Get configured activity types from Lightning Builder
  // The builder saves as activityTypes (camelCase array of objects)
  const getConfiguredActivityTypes = () => {
    // Check for activityTypes array from Lightning Builder
    if (config.activityTypes && Array.isArray(config.activityTypes) && config.activityTypes.length > 0) {
      return config.activityTypes;
    }
    
    // Fallback: Check for activity_types (snake_case)
    if (config.activity_types && Array.isArray(config.activity_types) && config.activity_types.length > 0) {
      // Convert string array to object array
      return config.activity_types.map(type => ({
        type: type.toLowerCase(),
        label: type.charAt(0).toUpperCase() + type.slice(1),
        enabledInTimeline: true,
        newButtonEnabled: true,
      }));
    }
    
    // Default: All activity types enabled
    return [
      { type: 'task', label: 'Tasks', enabledInTimeline: true, newButtonEnabled: true },
      { type: 'event', label: 'Events', enabledInTimeline: true, newButtonEnabled: true },
      { type: 'email', label: 'Emails', enabledInTimeline: true, newButtonEnabled: false },
      { type: 'call', label: 'Log a Call', enabledInTimeline: true, newButtonEnabled: true },
    ];
  };
  
  const configuredActivityTypes = getConfiguredActivityTypes();
  
  // Build filter options from configured activity types
  const filterOptions = configuredActivityTypes
    .filter(at => at.enabledInTimeline !== false)
    .map(at => {
      const typeKey = at.type?.toLowerCase() || 'task';
      const typeConfig = ACTIVITY_TYPES[typeKey] || ACTIVITY_TYPES.task;
      return {
        key: typeKey,
        label: at.label || at.type,
        icon: typeConfig.icon,
        color: `text-${typeConfig.color}-600`,
      };
    });
  
  // Build button options from configured activity types
  const buttonOptions = configuredActivityTypes
    .filter(at => at.newButtonEnabled === true)
    .map(at => {
      const typeKey = at.type?.toLowerCase() || 'task';
      const typeConfig = ACTIVITY_TYPES[typeKey] || ACTIVITY_TYPES.task;
      return {
        type: typeKey,
        label: at.newButtonLabel || `New ${at.label || at.type}`,
        icon: typeConfig.icon,
        color: typeConfig.color,
        bgColor: typeConfig.bgColor,
      };
    });
  
  // Initialize filters from config - respect component configuration
  const getInitialFilters = () => {
    const defaultFilters = {};
    
    // Initialize all filter types to false first
    Object.keys(ACTIVITY_TYPES).forEach(type => {
      defaultFilters[type] = false;
    });
    
    // Enable filters based on configured activity types
    configuredActivityTypes.forEach(at => {
      const typeKey = at.type?.toLowerCase();
      if (typeKey && at.enabledInTimeline !== false) {
        defaultFilters[typeKey] = true;
      }
    });
    
    // If no filters enabled, enable all
    const hasAnyEnabled = Object.values(defaultFilters).some(v => v);
    if (!hasAnyEnabled) {
      return { task: true, event: true, email: true, call: true };
    }
    
    return defaultFilters;
  };
  
  const [filters, setFilters] = useState(getInitialFilters);
  const [filtersExpanded, setFiltersExpanded] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  
  // Email composer state for unified email experience
  const [isEmailComposerOpen, setIsEmailComposerOpen] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState('');
  
  // Update filters when config changes (e.g., when placed in different tabs)
  useEffect(() => {
    const newFilters = getInitialFilters();
    setFilters(newFilters);
  }, [JSON.stringify(config.activityTypes), JSON.stringify(config.activity_types), JSON.stringify(config.filters)]);
  
  // Handle record click - navigate to activity record
  const handleRecordClick = useCallback((type, recordId, publicId, title) => {
    if (consoleContext?.openRecordAsSubtab) {
      consoleContext.openRecordAsSubtab(type, recordId, publicId, title);
    } else if (consoleContext?.openRecordAsPrimary) {
      consoleContext.openRecordAsPrimary(type, recordId, publicId, title);
    } else {
      // Fallback: Navigate to CRM record page
      navigate(`/crm/${type}/${publicId || recordId}`);
    }
  }, [consoleContext, navigate]);
  
  // Fetch activities
  const fetchActivities = useCallback(async () => {
    if (!recordId) return;
    
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      
      // Get tenant_id from user info
      let tenantId = localStorage.getItem('tenant_id');
      if (!tenantId) {
        // Fetch tenant_id from /api/me if not in localStorage
        try {
          const meResponse = await axios.get(`${API}/me`, { headers });
          tenantId = meResponse.data?.tenant_id;
          if (tenantId) {
            localStorage.setItem('tenant_id', tenantId);
          }
        } catch (e) {
          console.warn('Could not fetch tenant_id from /api/me', e);
        }
      }
      
      // Fetch all activity types in parallel
      // 1. Task and Event from object records
      // 2. Email activities from crm_activities
      const fetchPromises = [
        axios.get(`${API}/objects/task/records?limit=100`, { headers }).catch(() => ({ data: { records: [] } })),
        axios.get(`${API}/objects/event/records?limit=100`, { headers }).catch(() => ({ data: { records: [] } })),
      ];
      
      // Only fetch email activities if we have tenant_id
      if (tenantId) {
        fetchPromises.push(
          axios.get(`${API}/crm-platform/activities?record_id=${recordId}&object_type=${objectName}&tenant_id=${tenantId}`, { headers })
            .catch(() => ({ data: { activities: [] } }))
        );
      } else {
        fetchPromises.push(Promise.resolve({ data: { activities: [] } }));
      }
      
      const [tasksResult, eventsResult, emailActivitiesResult] = await Promise.all(fetchPromises);
      
      // Process and filter by relationship using consistent helper
      const allActivities = [];
      
      const taskRecords = tasksResult.data?.records || [];
      taskRecords.forEach(r => {
        if (isRelatedToParent(r, recordId)) {
          allActivities.push({ ...r, type: 'task' });
        }
      });
      
      const eventRecords = eventsResult.data?.records || [];
      eventRecords.forEach(r => {
        if (isRelatedToParent(r, recordId)) {
          allActivities.push({ ...r, type: 'event' });
        }
      });
      
      // Process email activities from crm_activities
      const emailActivities = emailActivitiesResult.data?.activities || [];
      emailActivities.forEach(activity => {
        // Map crm_activity format to the expected format
        allActivities.push({
          id: activity.id,
          series_id: activity.id,
          type: 'email',
          created_at: activity.created_at || activity.activity_date,
          data: {
            subject: activity.subject,
            description: activity.description,
            status: activity.status,
            to: activity.email_data?.to,
            cc: activity.email_data?.cc,
            bcc: activity.email_data?.bcc,
          }
        });
      });
      
      console.log(`[ActivitiesComponent] Found ${allActivities.length} activities for record ${recordId} (${taskRecords.length} tasks, ${eventRecords.length} events, ${emailActivities.length} emails)`);
      
      // Sort by created_at DESC
      allActivities.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      setActivities(allActivities);
    } catch (error) {
      console.error('Error fetching activities:', error);
    } finally {
      setLoading(false);
    }
  }, [recordId, objectName]);
  
  // Initial fetch and refresh on key change
  useEffect(() => {
    fetchActivities();
  }, [fetchActivities, refreshKey]);
  
  // Listen for record-created events
  useEffect(() => {
    const handleRecordCreated = (event) => {
      const { objectType, parentRecordId: createdParentId } = event.detail;
      // Refresh if an activity type was created for this record
      if (['task', 'event', 'call', 'email'].includes(objectType?.toLowerCase()) && createdParentId === recordId) {
        console.log(`[ActivitiesComponent] Refreshing after ${objectType} created`);
        setRefreshKey(prev => prev + 1);
      }
    };
    
    window.addEventListener(RECORD_CREATED_EVENT, handleRecordCreated);
    return () => window.removeEventListener(RECORD_CREATED_EVENT, handleRecordCreated);
  }, [recordId]);
  
  // Filter activities
  const filteredActivities = activities.filter(a => filters[a.type]);
  const grouped = groupByDate(filteredActivities);
  
  const toggleFilter = (key) => {
    setFilters(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Handle create activity - opens full CreateRecordDialog for Task/Event/Call
  // For email, opens the unified DockedEmailComposer
  const handleCreateActivity = (type) => {
    if (type === 'email') {
      // Get recipient email from the record if available
      const email = record?.data?.email || record?.data?.Email || 
                    record?.data?.primary_email || '';
      setRecipientEmail(email);
      setIsEmailComposerOpen(true);
    } else {
      openCreateDialog(type, {
        parentRecordId: recordId,
        sourceObject: objectName,
        onSuccess: () => setRefreshKey(prev => prev + 1),
      });
    }
  };
  
  // Handle email composer close
  const handleEmailComposerClose = () => {
    setIsEmailComposerOpen(false);
    setRecipientEmail('');
  };
  
  // Handle email sent - refresh timeline
  const handleEmailSent = () => {
    setRefreshKey(prev => prev + 1);
    fetchActivities();
  };
  
  return (
    <div className="bg-white rounded-lg border shadow-sm" data-testid="activities-component">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b">
        <div className="flex items-center space-x-2">
          <Clock className="h-4 w-4 text-blue-600" />
          <span className="text-sm font-semibold text-slate-700">Activity Timeline</span>
        </div>
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={fetchActivities}>
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>
      
      {/* Create Buttons - Now respects Lightning Builder configuration */}
      {buttonOptions.length > 0 && (
        <div className="flex flex-wrap gap-2 px-4 py-2 border-b">
          {buttonOptions.map(btn => {
            const Icon = btn.icon || CheckSquare;
            return (
              <Button 
                key={btn.type}
                variant="outline" 
                size="sm" 
                className={`h-7 text-xs gap-1 text-${btn.color}-600 border-${btn.color}-200 hover:bg-${btn.color}-50`}
                onClick={() => handleCreateActivity(btn.type)}
                data-testid={`new-${btn.type}-btn`}
              >
                <Icon className="h-3 w-3" /> {btn.label}
              </Button>
            );
          })}
        </div>
      )}
      
      {/* Filters - Now respects Lightning Builder configuration */}
      {filterOptions.length > 0 && (
        <div className="border-b">
          <button
            className="flex items-center gap-2 w-full text-left px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
            onClick={() => setFiltersExpanded(!filtersExpanded)}
          >
            {filtersExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
            Filters
          </button>
          {filtersExpanded && (
            <div className="flex flex-wrap gap-3 px-4 py-2 bg-slate-50">
              {filterOptions.map(filter => {
                const Icon = filter.icon;
                return (
                  <label key={filter.key} className="flex items-center space-x-1.5 cursor-pointer text-xs">
                    <input
                      type="checkbox"
                      checked={filters[filter.key]}
                      onChange={() => toggleFilter(filter.key)}
                      className="w-3.5 h-3.5 rounded border-slate-300"
                    />
                    <Icon className={`h-3 w-3 ${filter.color}`} />
                    <span className="text-slate-600">{filter.label}</span>
                  </label>
                );
              })}
            </div>
          )}
        </div>
      )}
      
      {/* Timeline Content */}
      <div className="max-h-80 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
            <span className="ml-2 text-sm text-slate-500">Loading activities...</span>
          </div>
        ) : filteredActivities.length === 0 ? (
          <div className="text-center py-8">
            <Clock className="h-10 w-10 text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-500">No activities yet</p>
            <p className="text-xs text-slate-400 mt-1">
              Activities related to this record will appear here
            </p>
          </div>
        ) : (
          <>
            <ActivityGroup title="Today" activities={grouped.today} onRecordClick={handleRecordClick} />
            <ActivityGroup title="Yesterday" activities={grouped.yesterday} onRecordClick={handleRecordClick} />
            <ActivityGroup title="Older" activities={grouped.older} onRecordClick={handleRecordClick} />
          </>
        )}
      </div>
      
      {/* Unified Email Composer - Same as when clicking email field */}
      <DockedEmailComposer
        isOpen={isEmailComposerOpen}
        onClose={handleEmailComposerClose}
        recipientEmail={recipientEmail}
        relatedRecordId={recordId}
        relatedRecordType={objectName}
        relatedRecordName={record?.data?.Name || record?.data?.name || 
                          `${record?.data?.first_name || ''} ${record?.data?.last_name || ''}`.trim() ||
                          recordId?.substring(0, 12)}
        onEmailSent={handleEmailSent}
      />
    </div>
  );
};

export default ActivitiesComponent;
