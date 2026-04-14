/**
 * HistoryRelatedListComponent - Field History Related List
 * 
 * Displays field change history for records when history tracking is enabled.
 * Shows: Field, Old Value, New Value, Changed By, Changed At
 * 
 * Only available if history tracking is enabled for the object.
 */
import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { History, RefreshCw, Loader2, ChevronRight, ArrowRight, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

/**
 * Format a date for display
 */
const formatDate = (dateStr) => {
  if (!dateStr) return '-';
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch (e) {
    return dateStr;
  }
};

/**
 * Format a value for display (handles objects, arrays, null, etc.)
 */
const formatValue = (value) => {
  if (value === null || value === undefined) return '(empty)';
  if (value === '') return '(empty)';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch (e) {
      return String(value);
    }
  }
  return String(value);
};

/**
 * History Entry Row Component
 */
const HistoryEntryRow = ({ entry }) => {
  return (
    <div className="px-3 py-2.5 hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-b-0">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-medium text-slate-800">
              {entry.field_label || entry.field_name}
            </span>
          </div>
          
          {/* Value change row */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-500 max-w-[100px] truncate" title={formatValue(entry.old_value)}>
              {formatValue(entry.old_value)}
            </span>
            <ArrowRight className="h-3 w-3 text-slate-400 flex-shrink-0" />
            <span className="text-blue-600 font-medium max-w-[100px] truncate" title={formatValue(entry.new_value)}>
              {formatValue(entry.new_value)}
            </span>
          </div>
        </div>
        
        {/* Right side: User and time */}
        <div className="text-right flex-shrink-0">
          <p className="text-xs text-slate-600 truncate max-w-[120px]" title={entry.changed_by_name}>
            {entry.changed_by_name || 'Unknown'}
          </p>
          <p className="text-[10px] text-slate-400">
            {formatDate(entry.changed_at)}
          </p>
        </div>
      </div>
    </div>
  );
};

/**
 * Main HistoryRelatedListComponent
 */
const HistoryRelatedListComponent = ({ 
  objectName, 
  recordId,
  objectLabel,
  maxEntries = 10,
}) => {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);
  const [expanded, setExpanded] = useState(false);
  
  // Fetch history entries
  const fetchHistory = useCallback(async () => {
    if (!recordId || !objectName) return;
    
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const limit = expanded ? 50 : maxEntries;
      
      const response = await axios.get(
        `${API}/history-tracking/records/${objectName}/${recordId}?limit=${limit}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      setEntries(response.data?.entries || []);
      setTotal(response.data?.total || 0);
    } catch (error) {
      console.error('Error fetching history:', error);
      setEntries([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [objectName, recordId, maxEntries, expanded]);
  
  // Initial fetch and refresh
  useEffect(() => {
    fetchHistory();
  }, [fetchHistory, refreshKey]);
  
  const displayLabel = objectLabel || objectName;
  const historyLabel = `${displayLabel} History`;
  
  return (
    <Card className="shadow-sm border-slate-200 mb-3" data-testid={`history-related-list-${objectName}`}>
      <CardHeader className="py-2.5 px-3 border-b border-slate-100">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xs font-semibold text-slate-700 flex items-center gap-2">
            <div className="w-6 h-6 rounded flex items-center justify-center bg-orange-100">
              <History className="h-3.5 w-3.5 text-orange-600" />
            </div>
            {historyLabel}
            <Badge variant="secondary" className="text-[10px] ml-1 px-1.5">{total}</Badge>
          </CardTitle>
          <div className="flex items-center gap-1">
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-6 w-6 p-0" 
              onClick={() => setRefreshKey(prev => prev + 1)} 
              disabled={loading}
            >
              <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="p-0">
        {loading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
          </div>
        ) : entries.length === 0 ? (
          <div className="text-center py-6 text-xs text-slate-400">
            <Clock className="h-6 w-6 mx-auto mb-2 text-slate-300" />
            <p>No history recorded</p>
            <p className="text-[10px] mt-1">Changes to tracked fields will appear here</p>
          </div>
        ) : (
          <>
            {/* History entries */}
            <div className="divide-y divide-slate-50">
              {entries.map((entry, idx) => (
                <HistoryEntryRow key={entry.id || idx} entry={entry} />
              ))}
            </div>
            
            {/* Show more button */}
            {total > entries.length && !expanded && (
              <div className="p-2 border-t border-slate-100">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                  onClick={() => setExpanded(true)}
                >
                  Show all {total} changes
                  <ChevronRight className="h-3 w-3 ml-1" />
                </Button>
              </div>
            )}
            
            {/* Collapse button */}
            {expanded && entries.length > maxEntries && (
              <div className="p-2 border-t border-slate-100">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-xs text-slate-500 hover:text-slate-700"
                  onClick={() => setExpanded(false)}
                >
                  Show less
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default HistoryRelatedListComponent;
