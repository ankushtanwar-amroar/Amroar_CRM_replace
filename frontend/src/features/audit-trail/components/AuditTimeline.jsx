/**
 * Audit Timeline Component
 * 
 * Main timeline view displaying audit events.
 * HubSpot-style timeline with expandable rows.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { 
  History, RefreshCw, Settings, AlertCircle, 
  ChevronLeft, ChevronRight, Loader2, FileText
} from 'lucide-react';
import { Button } from '../../../components/ui/button';
import AuditEventRow from './AuditEventRow';
import AuditFilters from './AuditFilters';
import AuditSettingsModal from './AuditSettingsModal';
import { 
  getAuditEvents, 
  getAuditEvent,
  getRecordAuditHistory,
  getAuditSources, 
  getAuditOperations,
  getAuditConfig 
} from '../services/auditService';

const AuditTimeline = ({ 
  objectName,
  recordId,
  recordLabel,
  objectFields = [],
  showHeader = true,
  maxHeight = '600px'
}) => {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pagination, setPagination] = useState({
    page: 1,
    page_size: 20,
    total: 0,
    total_pages: 0
  });
  const [filters, setFilters] = useState({});
  const [sources, setSources] = useState([]);
  const [operations, setOperations] = useState([]);
  const [config, setConfig] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  
  // Load reference data
  useEffect(() => {
    const loadReferenceData = async () => {
      try {
        const [sourcesData, operationsData, configData] = await Promise.all([
          getAuditSources(),
          getAuditOperations(),
          objectName ? getAuditConfig(objectName, false).catch(() => null) : null
        ]);
        setSources(sourcesData.sources || []);
        setOperations(operationsData.operations || []);
        setConfig(configData);
      } catch (err) {
        console.error('Failed to load reference data:', err);
      }
    };
    loadReferenceData();
  }, [objectName]);
  
  // Load audit events
  const loadEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let result;
      
      if (recordId) {
        // Fetch history for specific record
        result = await getRecordAuditHistory(objectName, recordId, pagination.page_size);
        setEvents(result.events || []);
        setPagination(prev => ({
          ...prev,
          total: result.total,
          total_pages: Math.ceil(result.total / prev.page_size)
        }));
      } else {
        // Fetch events with filters
        result = await getAuditEvents({
          target_object: objectName,
          ...filters,
          page: pagination.page,
          page_size: pagination.page_size,
          include_field_changes: true
        });
        setEvents(result.events || []);
        setPagination({
          page: result.page,
          page_size: result.page_size,
          total: result.total,
          total_pages: result.total_pages
        });
      }
    } catch (err) {
      setError('Failed to load audit events');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [objectName, recordId, filters, pagination.page, pagination.page_size]);
  
  useEffect(() => {
    loadEvents();
  }, [loadEvents]);
  
  // Handle event expansion (load field changes if not already loaded)
  const handleEventExpand = async (eventId) => {
    const event = events.find(e => e.id === eventId);
    if (event && !event.field_changes) {
      try {
        const fullEvent = await getAuditEvent(eventId);
        setEvents(events.map(e => 
          e.id === eventId ? { ...e, field_changes: fullEvent.field_changes } : e
        ));
      } catch (err) {
        console.error('Failed to load event details:', err);
      }
    }
  };
  
  const handleFiltersChange = (newFilters) => {
    setFilters(newFilters);
    setPagination(prev => ({ ...prev, page: 1 }));
  };
  
  const handleClearFilters = () => {
    setFilters({});
    setPagination(prev => ({ ...prev, page: 1 }));
  };
  
  const handlePageChange = (newPage) => {
    setPagination(prev => ({ ...prev, page: newPage }));
  };
  
  // Check if audit is not configured
  const isNotConfigured = !config && objectName;
  
  return (
    <div 
      className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden"
      data-testid="audit-timeline"
    >
      {/* Header */}
      {showHeader && (
        <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-indigo-100 flex items-center justify-center">
                <History className="h-5 w-5 text-indigo-600" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  Audit Trail
                  {recordLabel && <span className="text-slate-500 font-normal"> — {recordLabel}</span>}
                </h3>
                <p className="text-xs text-slate-500">
                  {pagination.total} change{pagination.total !== 1 ? 's' : ''} recorded
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={loadEvents}
                disabled={loading}
                className="h-8 w-8"
                data-testid="refresh-audit-btn"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
              
              {objectName && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowSettings(true)}
                  className="h-8 w-8"
                  data-testid="audit-settings-btn"
                >
                  <Settings className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
      
      {/* Filters */}
      {!recordId && (
        <div className="px-5 py-3 border-b border-slate-100">
          <AuditFilters
            filters={filters}
            onFiltersChange={handleFiltersChange}
            onClearFilters={handleClearFilters}
            sources={sources}
            operations={operations}
          />
        </div>
      )}
      
      {/* Content */}
      <div 
        className="overflow-y-auto"
        style={{ maxHeight: recordId ? maxHeight : 'none' }}
      >
        {loading && events.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-slate-300 mb-3" />
            <p className="text-sm text-slate-500">Loading audit trail...</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mb-3">
              <AlertCircle className="h-6 w-6 text-red-500" />
            </div>
            <p className="text-sm text-slate-700 mb-1">Failed to load audit trail</p>
            <p className="text-xs text-slate-500">{error}</p>
            <Button variant="ghost" size="sm" onClick={loadEvents} className="mt-3">
              Try Again
            </Button>
          </div>
        ) : isNotConfigured ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-3">
              <FileText className="h-6 w-6 text-slate-400" />
            </div>
            <p className="text-sm text-slate-700 mb-1">Audit not configured for this object</p>
            <p className="text-xs text-slate-500 mb-4">
              Configure audit settings to start tracking changes
            </p>
            <Button size="sm" onClick={() => setShowSettings(true)}>
              Configure Audit
            </Button>
          </div>
        ) : events.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-3">
              <History className="h-6 w-6 text-slate-400" />
            </div>
            <p className="text-sm text-slate-700 mb-1">No audit events found</p>
            <p className="text-xs text-slate-500">
              {Object.keys(filters).length > 0 
                ? 'Try adjusting your filters'
                : 'Changes to this record will appear here'
              }
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {events.map(event => (
              <AuditEventRow
                key={event.id}
                event={event}
                onExpand={handleEventExpand}
              />
            ))}
          </div>
        )}
      </div>
      
      {/* Pagination */}
      {!recordId && pagination.total_pages > 1 && (
        <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/50">
          <div className="flex items-center justify-between">
            <div className="text-xs text-slate-500">
              Showing {((pagination.page - 1) * pagination.page_size) + 1} - {Math.min(pagination.page * pagination.page_size, pagination.total)} of {pagination.total}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(pagination.page - 1)}
                disabled={pagination.page === 1}
                className="h-8"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm text-slate-600">
                Page {pagination.page} of {pagination.total_pages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(pagination.page + 1)}
                disabled={pagination.page >= pagination.total_pages}
                className="h-8"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
      
      {/* Settings Modal */}
      <AuditSettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        objectName={objectName}
        objectFields={objectFields}
        onConfigSaved={(newConfig) => setConfig(newConfig)}
      />
    </div>
  );
};

export default AuditTimeline;
