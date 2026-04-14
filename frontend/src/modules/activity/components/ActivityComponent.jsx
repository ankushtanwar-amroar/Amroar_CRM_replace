/**
 * ActivityComponent - Main Activity Component for Lightning Pages
 * Combines timeline view with action buttons
 * Applies configuration from page builder (visible buttons, max visible, field config)
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Calendar, RefreshCw, AlertCircle, Filter, X } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import NewActivityButtonBar from './NewActivityButtonBar';
import ActivityTimelineTable from './ActivityTimelineTable';
import NewActivityModal from './NewActivityModal';
import {
  fetchActivityTimeline,
  invalidateCacheForRecord,
} from '../services/activityTimelineService';
import {
  createDefaultActivityConfig,
  hasActivityConfig,
  getActivityColors,
} from '../config/activityConfigDefaults';

// Debounce helper
const debounce = (fn, ms) => {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), ms);
  };
};

const ActivityComponent = ({
  config: providedConfig,
  parentObjectName,
  parentRecordId,
  parentRecordName,
  className = '',
}) => {
  // Use provided config or create default
  const config = hasActivityConfig({ config: providedConfig })
    ? providedConfig
    : createDefaultActivityConfig();
  
  // Memoize activityTypes to prevent unnecessary re-renders
  const activityTypes = useMemo(() => config.activityTypes || [], [config.activityTypes]);
  const maxVisibleButtons = config.maxVisibleButtons || 3;
  
  // State
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedActivityType, setSelectedActivityType] = useState(null);
  const [activeTypeFilter, setActiveTypeFilter] = useState(null); // null = show all
  
  // Fetch activities
  const fetchActivities = useCallback(async () => {
    if (!parentRecordId || activityTypes.length === 0) {
      setActivities([]);
      setLoading(false);
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      const data = await fetchActivityTimeline(
        parentObjectName,
        parentRecordId,
        activityTypes,
        { sortOrder: config.sortOrder || 'desc' }
      );
      setActivities(data);
    } catch (err) {
      console.error('Error fetching activities:', err);
      setError('Failed to load activities');
    } finally {
      setLoading(false);
    }
  }, [parentObjectName, parentRecordId, activityTypes, config.sortOrder]);
  
  // Initial fetch
  useEffect(() => {
    fetchActivities();
  }, [fetchActivities]);
  
  // Debounced refresh
  const debouncedRefresh = useMemo(
    () => debounce(() => {
      invalidateCacheForRecord(parentObjectName, parentRecordId);
      fetchActivities();
    }, 300),
    [parentObjectName, parentRecordId, fetchActivities]
  );
  
  // Handle new activity button click
  const handleNewActivity = (activityType) => {
    setSelectedActivityType(activityType);
    setModalOpen(true);
  };
  
  // Handle activity creation success
  const handleActivityCreated = () => {
    setModalOpen(false);
    setSelectedActivityType(null);
    debouncedRefresh();
  };
  
  // Filter activities by type
  const filteredActivities = useMemo(() => {
    if (!activeTypeFilter) return activities;
    return activities.filter(a => a.type === activeTypeFilter);
  }, [activities, activeTypeFilter]);

  // Check for empty config
  const hasEnabledTypes = activityTypes.some(t => t.enabledInTimeline);
  const enabledTypes = activityTypes.filter(t => t.enabledInTimeline);
  
  // Get activity counts by type
  const activityCounts = useMemo(() => {
    const counts = {};
    activities.forEach(a => {
      counts[a.type] = (counts[a.type] || 0) + 1;
    });
    return counts;
  }, [activities]);
  
  return (
    <div className={`bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm ${className}`} data-testid="activity-component">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-blue-50/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center shadow-sm">
              <Calendar className="h-4 w-4 text-white" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 text-sm">Activity</h3>
              {activities.length > 0 && (
                <p className="text-[11px] text-slate-500">
                  {filteredActivities.length} {filteredActivities.length === 1 ? 'item' : 'items'}
                  {activeTypeFilter && ` (filtered)`}
                </p>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-1.5">
            {/* Type Filter Toggle */}
            {enabledTypes.length > 1 && activities.length > 0 && (
              <div className="relative">
                <Button
                  variant={activeTypeFilter ? "secondary" : "ghost"}
                  size="sm"
                  className="h-8 px-2.5"
                  onClick={() => setActiveTypeFilter(activeTypeFilter ? null : enabledTypes[0]?.type)}
                  title="Filter by type"
                  data-testid="filter-type-btn"
                >
                  <Filter className="h-3.5 w-3.5" />
                  {activeTypeFilter && (
                    <span className="ml-1.5 text-xs capitalize">{activeTypeFilter}</span>
                  )}
                </Button>
              </div>
            )}
            
            {/* Refresh Button */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => debouncedRefresh()}
              disabled={loading}
              className="h-8 w-8 p-0"
              title="Refresh"
              data-testid="refresh-activities-btn"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
        
        {/* Type Filter Pills - Show when filter is active */}
        {activeTypeFilter && enabledTypes.length > 1 && (
          <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-slate-200/50">
            <span className="text-[10px] text-slate-500 mr-1">Filter:</span>
            {enabledTypes.map((type) => {
              const colors = getActivityColors(type.type);
              const isActive = activeTypeFilter === type.type;
              const count = activityCounts[type.type] || 0;
              
              return (
                <button
                  key={type.type}
                  onClick={() => setActiveTypeFilter(isActive ? null : type.type)}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] transition-all ${
                    isActive 
                      ? `${colors.iconBg} text-white shadow-sm` 
                      : `${colors.bg} ${colors.text} hover:opacity-80`
                  }`}
                  data-testid={`filter-${type.type}-btn`}
                >
                  {type.label}
                  <Badge variant="secondary" className={`text-[9px] px-1 py-0 h-3.5 ${isActive ? 'bg-white/20 text-white' : 'bg-white/60'}`}>
                    {count}
                  </Badge>
                </button>
              );
            })}
            <button
              onClick={() => setActiveTypeFilter(null)}
              className="ml-1 text-slate-400 hover:text-slate-600"
              title="Clear filter"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}
        
        {/* Action Buttons - Now with maxVisibleButtons support */}
        {activityTypes.some(t => t.newButtonEnabled) && (
          <div className="mt-3 pt-3 border-t border-slate-200/50">
            <NewActivityButtonBar
              activityTypes={activityTypes}
              onNewActivity={handleNewActivity}
              maxVisibleButtons={maxVisibleButtons}
              compact
            />
          </div>
        )}
      </div>
      
      {/* Content */}
      {!hasEnabledTypes ? (
        // No activity types configured
        <div className="p-8 text-center">
          <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <AlertCircle className="h-6 w-6 text-slate-400" />
          </div>
          <p className="text-sm text-slate-500">No activity types configured</p>
          <p className="text-xs text-slate-400 mt-1">
            Configure activity types in the page builder
          </p>
        </div>
      ) : error ? (
        // Error state
        <div className="p-8 text-center">
          <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <AlertCircle className="h-6 w-6 text-red-500" />
          </div>
          <p className="text-sm text-red-600">{error}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchActivities()}
            className="mt-3"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Try Again
          </Button>
        </div>
      ) : (
        // Timeline Table - Pass filtered activities
        <ActivityTimelineTable
          activities={filteredActivities}
          activityTypes={activityTypes}
          loading={loading}
          showOwner={config.showOwner !== false}
          showStatus={config.showStatus !== false}
          showTypeFilter={false} // We handle filtering in parent now
          emptyMessage={activeTypeFilter ? `No ${activeTypeFilter} activities yet` : "No activity yet"}
        />
      )}
      
      {/* New Activity Modal - Pass field config */}
      <NewActivityModal
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setSelectedActivityType(null);
        }}
        activityType={selectedActivityType}
        parentObjectName={parentObjectName}
        parentRecordId={parentRecordId}
        parentRecordName={parentRecordName}
        onSuccess={handleActivityCreated}
      />
    </div>
  );
};

export default ActivityComponent;
