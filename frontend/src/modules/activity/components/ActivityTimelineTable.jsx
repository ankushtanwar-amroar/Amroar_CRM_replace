/**
 * ActivityTimelineTable - Combined timeline/table showing all activity records
 * Displays activities from multiple types in a unified, sortable list
 */
import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Calendar, CheckCircle, Mail, Phone, FileText, ExternalLink,
  ChevronDown, ChevronUp, Search, User, Clock, X
} from 'lucide-react';
import { Input } from '../../../components/ui/input';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import {
  formatActivityDate,
  getStatusColor,
  truncateText,
  filterActivitiesBySearch,
  sortActivities,
} from '../utils/activityMapper';
import { getActivityColors } from '../config/activityConfigDefaults';

// Icon mapping
const IconMap = {
  event: Calendar,
  task: CheckCircle,
  email: Mail,
  call: Phone,
  note: FileText,
};

/**
 * Activity Row Component
 */
const ActivityRow = ({ activity, showOwner, showStatus, onClick }) => {
  const IconComponent = IconMap[activity.type] || FileText;
  const colors = getActivityColors(activity.type);
  const statusColors = getStatusColor(activity.status);
  
  return (
    <div
      className="flex items-center gap-3 p-3 border-b border-slate-100 hover:bg-blue-50/30 cursor-pointer transition-all group"
      onClick={() => onClick(activity)}
      data-testid={`activity-row-${activity.id}`}
    >
      {/* Icon */}
      <div className={`w-9 h-9 ${colors.iconBg} rounded-full flex items-center justify-center flex-shrink-0 shadow-sm group-hover:scale-105 transition-transform`}>
        <IconComponent className="h-4 w-4 text-white" />
      </div>
      
      {/* Main Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm text-slate-900 truncate group-hover:text-blue-700 transition-colors">
            {truncateText(activity.title, 60)}
          </span>
          <Badge variant="outline" className={`text-[10px] py-0 h-4 ${colors.text} border-current flex-shrink-0 ${colors.bg}`}>
            {activity.typeLabel || activity.type}
          </Badge>
        </div>
        
        {activity.description && (
          <p className="text-xs text-slate-500 mt-0.5 truncate">
            {truncateText(activity.description, 80)}
          </p>
        )}
        
        <div className="flex items-center gap-3 mt-1.5">
          {/* Date */}
          <span className="text-[11px] text-slate-400 flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatActivityDate(activity.date)}
          </span>
          
          {/* Owner */}
          {showOwner && activity.owner && (
            <span className="text-[11px] text-slate-400 flex items-center gap-1">
              <User className="h-3 w-3" />
              {activity.owner}
            </span>
          )}
        </div>
      </div>
      
      {/* Status Badge */}
      {showStatus && activity.status && (
        <Badge className={`${statusColors.bg} ${statusColors.text} text-[10px] py-0.5 px-2 flex-shrink-0`}>
          {activity.status}
        </Badge>
      )}
      
      {/* Open Button */}
      <Button
        variant="ghost"
        size="sm"
        className="h-7 w-7 p-0 text-slate-400 hover:text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={(e) => {
          e.stopPropagation();
          onClick(activity);
        }}
        data-testid={`open-activity-${activity.id}-btn`}
      >
        <ExternalLink className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
};

/**
 * Main ActivityTimelineTable Component
 */
const ActivityTimelineTable = ({
  activities = [],
  activityTypes = [],
  loading = false,
  showOwner = true,
  showStatus = true,
  showSearch = true,
  showTypeFilter = true,
  emptyMessage = 'No activity yet',
  onActivityClick,
  className = '',
}) => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('date');
  const [sortOrder, setSortOrder] = useState('desc');
  const [selectedTypes, setSelectedTypes] = useState(
    activityTypes.filter(t => t.enabledInTimeline).map(t => t.type)
  );
  
  // Filter and sort activities
  const filteredActivities = useMemo(() => {
    let result = activities;
    
    // Filter by type
    if (showTypeFilter && selectedTypes.length > 0 && selectedTypes.length < activityTypes.filter(t => t.enabledInTimeline).length) {
      result = result.filter(a => selectedTypes.includes(a.type));
    }
    
    // Filter by search
    result = filterActivitiesBySearch(result, searchTerm);
    
    // Sort
    result = sortActivities(result, sortBy, sortOrder);
    
    return result;
  }, [activities, selectedTypes, searchTerm, sortBy, sortOrder, showTypeFilter, activityTypes]);
  
  // Toggle type filter
  const toggleTypeFilter = (type) => {
    setSelectedTypes(prev => {
      if (prev.includes(type)) {
        // Don't allow deselecting the last type
        if (prev.length === 1) return prev;
        return prev.filter(t => t !== type);
      }
      return [...prev, type];
    });
  };
  
  // Handle activity click
  const handleActivityClick = (activity) => {
    if (onActivityClick) {
      onActivityClick(activity);
    } else if (activity.recordUrl) {
      navigate(activity.recordUrl);
    }
  };
  
  // Toggle sort
  const toggleSort = (field) => {
    if (sortBy === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };
  
  // Enabled types for filtering
  const enabledTypes = activityTypes.filter(t => t.enabledInTimeline);
  
  return (
    <div className={`bg-white ${className}`} data-testid="activity-timeline-table">
      {/* Header Controls */}
      <div className="p-3 border-b border-slate-200 space-y-2.5 bg-slate-50/50">
        {/* Search and Sort Row */}
        {showSearch && (
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <Input
                type="text"
                placeholder="Search activities..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 pr-8 h-8 text-xs"
                data-testid="search-activities-input"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2.5 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            
            <Button
              variant="outline"
              size="sm"
              onClick={() => toggleSort('date')}
              className="h-8 text-xs px-2.5"
              data-testid="sort-by-date-btn"
            >
              Date
              {sortBy === 'date' && (
                sortOrder === 'desc' ? <ChevronDown className="h-3 w-3 ml-1" /> : <ChevronUp className="h-3 w-3 ml-1" />
              )}
            </Button>
          </div>
        )}
        
        {/* Type Filters */}
        {showTypeFilter && enabledTypes.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            {enabledTypes.map((type) => {
              const colors = getActivityColors(type.type);
              const isSelected = selectedTypes.includes(type.type);
              const IconComponent = IconMap[type.type] || FileText;
              const count = activities.filter(a => a.type === type.type).length;
              
              return (
                <button
                  key={type.type}
                  onClick={() => toggleTypeFilter(type.type)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] transition-all ${
                    isSelected 
                      ? `${colors.iconBg} text-white shadow-sm` 
                      : `${colors.bg} ${colors.text} hover:opacity-80 opacity-60`
                  }`}
                  data-testid={`type-filter-${type.type}`}
                >
                  <IconComponent className="h-3 w-3" />
                  {type.label}
                  <span className={`text-[10px] px-1 rounded ${isSelected ? 'bg-white/20' : 'bg-white/50'}`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
      
      {/* Activity List */}
      <div className="max-h-96 overflow-y-auto">
        {loading ? (
          // Loading State
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-600 border-t-transparent mx-auto"></div>
            <p className="text-sm text-slate-500 mt-3">Loading activities...</p>
          </div>
        ) : filteredActivities.length === 0 ? (
          // Empty State
          <div className="p-8 text-center">
            <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <Calendar className="h-6 w-6 text-slate-400" />
            </div>
            <p className="text-sm text-slate-500">{emptyMessage}</p>
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="text-xs text-blue-600 hover:text-blue-700 mt-2"
              >
                Clear search
              </button>
            )}
          </div>
        ) : (
          // Activity Rows
          filteredActivities.map((activity) => (
            <ActivityRow
              key={`${activity.type}-${activity.id}`}
              activity={activity}
              showOwner={showOwner}
              showStatus={showStatus}
              onClick={handleActivityClick}
            />
          ))
        )}
      </div>
      
      {/* Footer */}
      {filteredActivities.length > 0 && (
        <div className="px-3 py-2 border-t border-slate-100 bg-slate-50/50 text-[11px] text-slate-500 text-center">
          Showing {filteredActivities.length} of {activities.length} activities
        </div>
      )}
    </div>
  );
};

export default ActivityTimelineTable;
