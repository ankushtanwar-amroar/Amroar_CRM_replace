/**
 * Audit Event Row Component
 * 
 * Expandable row showing audit event details with field changes.
 * HubSpot-style timeline row design.
 */
import React, { useState } from 'react';
import { 
  ChevronRight, ChevronDown, User, Code, Zap, Upload, 
  Link2, GitMerge, Settings, Clock, Monitor, ArrowRight
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';

// Source icon mapping
const sourceIcons = {
  UI: Monitor,
  API: Code,
  FLOW: Zap,
  IMPORT: Upload,
  INTEGRATION: Link2,
  MERGE_ENGINE: GitMerge,
  SYSTEM: Settings,
  SCHEDULED_JOB: Clock
};

// Source color mapping
const sourceColors = {
  UI: 'bg-blue-100 text-blue-700',
  API: 'bg-green-100 text-green-700',
  FLOW: 'bg-purple-100 text-purple-700',
  IMPORT: 'bg-orange-100 text-orange-700',
  INTEGRATION: 'bg-teal-100 text-teal-700',
  MERGE_ENGINE: 'bg-pink-100 text-pink-700',
  SYSTEM: 'bg-gray-100 text-gray-700',
  SCHEDULED_JOB: 'bg-indigo-100 text-indigo-700'
};

// Operation color mapping
const operationColors = {
  CREATE: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  UPDATE: 'bg-blue-100 text-blue-700 border-blue-200',
  DELETE: 'bg-red-100 text-red-700 border-red-200',
  MERGE: 'bg-purple-100 text-purple-700 border-purple-200',
  BULK_UPDATE: 'bg-orange-100 text-orange-700 border-orange-200',
  BULK_DELETE: 'bg-pink-100 text-pink-700 border-pink-200',
  RESTORE: 'bg-teal-100 text-teal-700 border-teal-200'
};

const AuditEventRow = ({ event, onExpand }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  const handleToggle = () => {
    setIsExpanded(!isExpanded);
    if (!isExpanded && onExpand) {
      onExpand(event.id);
    }
  };
  
  const SourceIcon = sourceIcons[event.change_source] || Settings;
  const sourceColorClass = sourceColors[event.change_source] || 'bg-gray-100 text-gray-700';
  const operationColorClass = operationColors[event.operation] || 'bg-gray-100 text-gray-700';
  
  const formatTime = (dateStr) => {
    // Ensure the timestamp is treated as UTC by appending 'Z' if no timezone indicator
    let normalizedDateStr = dateStr;
    if (dateStr && !dateStr.endsWith('Z') && !dateStr.includes('+') && !dateStr.includes('-', 10)) {
      normalizedDateStr = dateStr + 'Z';
    }
    const date = new Date(normalizedDateStr);
    return {
      relative: formatDistanceToNow(date, { addSuffix: true }),
      absolute: format(date, 'MMM d, yyyy h:mm a')
    };
  };
  
  const timeInfo = formatTime(event.occurred_at);
  
  return (
    <div 
      className="border-b border-slate-100 last:border-b-0"
      data-testid={`audit-event-row-${event.id}`}
    >
      {/* Main Row */}
      <div 
        className={`flex items-center gap-4 px-4 py-3 cursor-pointer transition-colors
          ${isExpanded ? 'bg-slate-50' : 'hover:bg-slate-50/50'}`}
        onClick={handleToggle}
      >
        {/* Expand/Collapse Icon */}
        <button className="text-slate-400 hover:text-slate-600 transition-colors">
          {isExpanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </button>
        
        {/* Time Column */}
        <div className="w-36 flex-shrink-0">
          <div className="text-sm text-slate-700 font-medium">
            {timeInfo.relative}
          </div>
          <div className="text-xs text-slate-400">
            {timeInfo.absolute}
          </div>
        </div>
        
        {/* Changed By Column */}
        <div className="w-40 flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center">
              <User className="h-4 w-4 text-slate-500" />
            </div>
            <div>
              <div className="text-sm font-medium text-slate-700 truncate max-w-[120px]">
                {event.changed_by_display || event.changed_by_user_name || 'System'}
              </div>
              <div className="text-xs text-slate-400">
                {event.changed_by_type}
              </div>
            </div>
          </div>
        </div>
        
        {/* Source Badge */}
        <div className="w-28 flex-shrink-0">
          <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium ${sourceColorClass}`}>
            <SourceIcon className="h-3 w-3" />
            {event.change_source}
          </div>
        </div>
        
        {/* Operation Badge */}
        <div className="w-28 flex-shrink-0">
          <div className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium border ${operationColorClass}`}>
            {event.operation}
          </div>
        </div>
        
        {/* Summary */}
        <div className="flex-1 min-w-0">
          <div className="text-sm text-slate-600 truncate">
            {event.summary || `${event.change_count} field(s) changed`}
          </div>
        </div>
        
        {/* Correlation ID (if present) */}
        {event.correlation_id && (
          <div className="w-32 flex-shrink-0 hidden xl:block">
            <div className="text-xs text-slate-400 font-mono truncate" title={event.correlation_id}>
              {event.correlation_id.slice(0, 12)}...
            </div>
          </div>
        )}
      </div>
      
      {/* Expanded Field Changes */}
      {isExpanded && event.field_changes && event.field_changes.length > 0 && (
        <div className="bg-slate-50/70 border-t border-slate-100 px-4 py-3">
          <div className="pl-8">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
              Field Changes
            </div>
            <div className="space-y-2">
              {event.field_changes.map((change, idx) => (
                <div 
                  key={idx}
                  className="flex items-center gap-3 py-2 px-3 bg-white rounded-lg border border-slate-100"
                  data-testid={`field-change-${change.field_key}`}
                >
                  <div className="w-36 flex-shrink-0">
                    <span className="text-sm font-medium text-slate-700">
                      {change.field_label || change.field_key}
                    </span>
                    {change.data_type && (
                      <span className="ml-1.5 text-xs text-slate-400">
                        ({change.data_type})
                      </span>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    {/* Old Value */}
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm px-2 py-1 rounded ${
                        change.old_display ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-400'
                      }`}>
                        <span className="truncate block">
                          {change.old_display || '(empty)'}
                        </span>
                      </div>
                    </div>
                    
                    {/* Arrow */}
                    <ArrowRight className="h-4 w-4 text-slate-400 flex-shrink-0" />
                    
                    {/* New Value */}
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm px-2 py-1 rounded ${
                        change.new_display ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-400'
                      }`}>
                        <span className="truncate block">
                          {change.new_display || '(empty)'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AuditEventRow;
