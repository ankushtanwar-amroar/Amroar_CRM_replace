/**
 * RelatedListsRuntimeComponent - Runtime component for Related Lists
 * Renders related lists tables with configured columns
 */
import React, { useState, useEffect, useCallback } from 'react';
import { 
  ChevronRight, ChevronDown, ChevronUp, Plus, RefreshCw,
  Loader2, ExternalLink
} from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { fetchRelatedRecords, getDefaultColumns } from '../services/relatedListsService';
import { ActionButtons } from '../../actions';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

/**
 * Get display columns for a list
 */
const getDisplayColumns = (list) => {
  if (list.columnsConfig && list.columnsConfig.length > 0) {
    return list.columnsConfig;
  }
  if (list.columns && list.columns.length > 0) {
    return list.columns.map(col => ({
      apiName: col,
      label: col.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
    }));
  }
  // Default columns based on object type
  const defaultCols = getDefaultColumns(list.objectId);
  return defaultCols.map(col => ({
    apiName: col,
    label: col.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
  }));
};

/**
 * Single Related List Table Component
 */
const RelatedListTable = ({
  list,
  parentObjectName,
  parentRecordId,
  parentRecordData,
  onRecordClick,
  onRefresh,
}) => {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);
  const [error, setError] = useState(null);

  const columns = getDisplayColumns(list);

  // Fetch records
  const loadRecords = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const data = await fetchRelatedRecords(list.objectId, 10);
      // TODO: In production, filter by parent record relationship
      setRecords(data);
    } catch (err) {
      console.error('Error loading related records:', err);
      setError('Failed to load records');
    } finally {
      setLoading(false);
    }
  }, [list.objectId]);

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  // Format field value
  const formatValue = (record, column) => {
    const data = record.data || record;
    const value = data[column.apiName];
    
    if (value === null || value === undefined) return '—';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (column.type === 'currency' && typeof value === 'number') {
      return `$${value.toLocaleString()}`;
    }
    if (column.type === 'date' || column.apiName.includes('date')) {
      try {
        return new Date(value).toLocaleDateString();
      } catch {
        return value;
      }
    }
    
    return String(value);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      {/* Header */}
      <div 
        className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between cursor-pointer hover:bg-slate-100 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-slate-500" />
          ) : (
            <ChevronRight className="h-4 w-4 text-slate-500" />
          )}
          <span className="text-base">{list.icon || '📋'}</span>
          <h3 className="text-sm font-semibold text-slate-900">
            {list.name}
          </h3>
          <span className="text-xs text-slate-500">
            ({records.length})
          </span>
        </div>
        
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          {/* Related List Actions */}
          <ActionButtons
            objectName={list.objectId}
            recordId={parentRecordId}
            recordData={parentRecordData || {}}
            placement="RELATED_LIST"
            onRecordUpdate={() => {
              loadRecords();
              onRefresh?.();
            }}
            className="mr-1"
          />
          <Button 
            size="sm" 
            variant="ghost" 
            className="h-7 w-7 p-0"
            onClick={loadRecords}
            disabled={loading}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-xs">
            <Plus className="h-3 w-3 mr-1" />
            New
          </Button>
        </div>
      </div>

      {/* Content */}
      {expanded && (
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
              <span className="ml-2 text-sm text-slate-500">Loading...</span>
            </div>
          ) : error ? (
            <div className="text-center py-6">
              <p className="text-sm text-red-500">{error}</p>
              <Button 
                variant="outline" 
                size="sm" 
                className="mt-2"
                onClick={loadRecords}
              >
                Retry
              </Button>
            </div>
          ) : records.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-slate-500">No {list.name.toLowerCase()} yet</p>
              <Button variant="outline" size="sm" className="mt-3">
                <Plus className="h-3 w-3 mr-1" />
                Create First {list.name.slice(0, -1)}
              </Button>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {columns.map((col, idx) => (
                    <th 
                      key={col.apiName}
                      className="px-4 py-2 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider"
                    >
                      {col.label}
                    </th>
                  ))}
                  <th className="px-4 py-2 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {records.slice(0, 5).map((record, idx) => (
                  <tr 
                    key={record.id || record.series_id || idx}
                    className="hover:bg-slate-50 cursor-pointer transition-colors"
                    onClick={() => onRecordClick?.(record)}
                  >
                    {columns.map((col, colIdx) => (
                      <td 
                        key={col.apiName}
                        className={`px-4 py-2.5 text-sm ${
                          colIdx === 0 ? 'text-blue-600 font-medium' : 'text-slate-600'
                        }`}
                      >
                        {formatValue(record, col)}
                      </td>
                    ))}
                    <td className="px-4 py-2.5">
                      <ChevronRight className="h-4 w-4 text-slate-400" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          
          {/* View All Link */}
          {!loading && records.length > 5 && (
            <div className="px-4 py-2 border-t border-slate-200 bg-slate-50">
              <button className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1">
                View All {list.name} ({records.length})
                <ExternalLink className="h-3 w-3" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/**
 * Main RelatedListsRuntimeComponent
 */
const RelatedListsRuntimeComponent = ({
  config,
  parentObjectName,
  parentRecordId,
  parentRecordData,
  onRecordClick,
  onRefresh,
  className = '',
}) => {
  const lists = config?.lists || [];

  if (lists.length === 0) {
    return (
      <div className={`bg-white border border-slate-200 rounded-lg p-6 text-center ${className}`}>
        <p className="text-sm text-slate-500">No related lists configured</p>
        <p className="text-xs text-slate-400 mt-1">
          Add related lists in the page builder
        </p>
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {lists.map((list) => (
        <RelatedListTable
          key={list.id}
          list={list}
          parentObjectName={parentObjectName}
          parentRecordId={parentRecordId}
          parentRecordData={parentRecordData}
          onRecordClick={onRecordClick}
          onRefresh={onRefresh}
        />
      ))}
    </div>
  );
};

export default RelatedListsRuntimeComponent;
