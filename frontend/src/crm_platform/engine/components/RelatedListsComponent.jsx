/**
 * RelatedListsComponent - Dynamic Related Records Panels
 * 
 * Features:
 * - Load based on layout configuration
 * - Show correct record count
 * - Support: New Contact, New Opportunity, New Task
 * - Open FULL CreateRecordDialog prefilled with parent record
 * - Refresh list after creation via events
 * - CONFIGURABLE Notes and Files Related Lists
 * - FIELD HISTORY Related Lists (when history tracking is enabled)
 * 
 * UPDATED: Now uses centralized CreateRecordService for consistent create behavior
 * UPDATED: Listens for RECORD_CREATED_EVENT to auto-refresh
 * UPDATED: Notes and Files are now configurable via Lightning Builder
 * UPDATED: Now supports History related lists for field change tracking
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  Users, Calendar, CheckSquare, Building2, Target, FileText,
  ChevronRight, Plus, RefreshCw, Loader2, ExternalLink
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { useCreateRecord, RECORD_CREATED_EVENT } from '../../../services/createRecord';
import FilesRelatedListComponent from '../../../components/files/FilesRelatedListComponent';
import NotesRelatedList from '../../../components/notes/NotesRelatedList';
import HistoryRelatedListComponent from './HistoryRelatedListComponent';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Object type configurations
const OBJECT_CONFIG = {
  contact: { icon: Users, color: 'cyan', label: 'Contacts' },
  contacts: { icon: Users, color: 'cyan', label: 'Contacts' },
  event: { icon: Calendar, color: 'purple', label: 'Events' },
  events: { icon: Calendar, color: 'purple', label: 'Events' },
  task: { icon: CheckSquare, color: 'green', label: 'Tasks' },
  tasks: { icon: CheckSquare, color: 'green', label: 'Tasks' },
  account: { icon: Building2, color: 'indigo', label: 'Accounts' },
  accounts: { icon: Building2, color: 'indigo', label: 'Accounts' },
  opportunity: { icon: Target, color: 'amber', label: 'Opportunities' },
  opportunities: { icon: Target, color: 'amber', label: 'Opportunities' },
};

/**
 * Check if a record is related to the parent record
 * Checks multiple relationship fields for compatibility
 */
const isRelatedToParent = (record, parentRecordId) => {
  const data = record?.data || record;
  return (
    data.related_to_id === parentRecordId ||
    data.related_to === parentRecordId ||
    data.parent_id === parentRecordId ||
    data.account_id === parentRecordId ||
    data.contact_id === parentRecordId ||
    data.lead_id === parentRecordId ||
    data.opportunity_id === parentRecordId
  );
};

/**
 * Get record display name
 */
const getDisplayName = (record, objectType) => {
  const data = record?.data || record;
  if (data.name) return data.name;
  if (data.subject) return data.subject;
  if (data.title) return data.title;
  if (data.first_name || data.last_name) return `${data.first_name || ''} ${data.last_name || ''}`.trim();
  if (data.email) return data.email;
  return `${objectType} Record`;
};

/**
 * Single Related List Panel
 * UPDATED: Uses centralized CreateRecordService for full dynamic create dialog
 * UPDATED: Listens for record-created events to auto-refresh
 */
const RelatedListPanel = ({ objectType, parentRecordId, sourceObjectName }) => {
  const navigate = useNavigate();
  const { openCreateDialog } = useCreateRecord();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  
  const normalizedType = objectType?.toLowerCase().replace(/s$/, '');
  const config = OBJECT_CONFIG[objectType] || OBJECT_CONFIG[normalizedType] || { icon: FileText, color: 'slate', label: objectType };
  const Icon = config.icon;
  
  // Fetch related records
  const fetchRecords = useCallback(async () => {
    if (!parentRecordId) return;
    
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(
        `${API}/objects/${normalizedType}/records?limit=100`,
        { headers: { Authorization: `Bearer ${token}` } }
      ).catch(() => ({ data: { records: [] } }));
      
      // Get all records
      const allRecords = response.data?.records || 
                         (Array.isArray(response.data) ? response.data : []);
      
      // Filter by relationship to parent record
      const related = allRecords.filter(r => isRelatedToParent(r, parentRecordId));
      
      console.log(`[RelatedListPanel] ${normalizedType}: Found ${related.length} related records out of ${allRecords.length} total for parent ${parentRecordId}`);
      setRecords(related);
    } catch (error) {
      console.error('Error fetching related:', error);
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [normalizedType, parentRecordId]);
  
  // Initial fetch
  useEffect(() => {
    fetchRecords();
  }, [fetchRecords, refreshKey]);
  
  // Listen for record-created events
  useEffect(() => {
    const handleRecordCreated = (event) => {
      const { objectType: createdType, parentRecordId: createdParentId, recordId: createdRecordId } = event.detail;
      const createdTypeNorm = createdType?.toLowerCase().replace(/s$/, '');
      
      // Refresh if:
      // 1. The created record is of this type AND for this parent
      // 2. OR the created record type matches (as a fallback when parent isn't explicitly set)
      const isMatchingType = createdTypeNorm === normalizedType;
      const isMatchingParent = createdParentId === parentRecordId;
      
      if (isMatchingType && (isMatchingParent || !createdParentId)) {
        console.log(`[RelatedListPanel] Refreshing ${normalizedType} after record created`, {
          createdType: createdTypeNorm,
          normalizedType,
          createdParentId,
          parentRecordId,
          isMatchingType,
          isMatchingParent
        });
        // Small delay to allow backend to process
        setTimeout(() => {
          setRefreshKey(prev => prev + 1);
        }, 500);
      }
    };
    
    window.addEventListener(RECORD_CREATED_EVENT, handleRecordCreated);
    return () => window.removeEventListener(RECORD_CREATED_EVENT, handleRecordCreated);
  }, [normalizedType, parentRecordId]);
  
  const handleRecordClick = (record) => {
    // Navigate to the CRM record page with correct URL format
    navigate(`/crm/${normalizedType}/${record.series_id || record.id}`);
  };

  // Handle create button click - opens full CreateRecordDialog
  const handleCreateClick = () => {
    openCreateDialog(normalizedType, {
      parentRecordId,
      sourceObject: sourceObjectName,
      onSuccess: () => setRefreshKey(prev => prev + 1),
    });
  };
  
  return (
    <Card className="shadow-sm border-slate-200 mb-3" data-testid={`related-list-${objectType}`}>
      <CardHeader className="py-2.5 px-3 border-b border-slate-100">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xs font-semibold text-slate-700 flex items-center gap-2">
            <div className={`w-6 h-6 rounded flex items-center justify-center bg-${config.color}-100`}>
              <Icon className={`h-3.5 w-3.5 text-${config.color}-600`} />
            </div>
            {config.label}
            <Badge variant="secondary" className="text-[10px] ml-1 px-1.5">{records.length}</Badge>
          </CardTitle>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setRefreshKey(prev => prev + 1)} disabled={loading}>
              <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-6 w-6 p-0 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
              onClick={handleCreateClick}
              data-testid={`create-${normalizedType}-btn`}
            >
              <Plus className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="p-0">
        {loading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
          </div>
        ) : records.length === 0 ? (
          <div className="text-center py-4 text-xs text-slate-400">
            No {config.label.toLowerCase()}
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {records.map((record) => (
              <div
                key={record.id}
                className="px-3 py-2 hover:bg-slate-50 cursor-pointer transition-colors group flex items-center justify-between"
                onClick={() => handleRecordClick(record)}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-slate-800 truncate group-hover:text-blue-600">
                    {getDisplayName(record, normalizedType)}
                  </p>
                </div>
                <ChevronRight className="h-3 w-3 text-slate-300 group-hover:text-slate-500 flex-shrink-0 ml-2" />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

/**
 * Main RelatedListsComponent
 */
const RelatedListsComponent = ({ config = {}, context = {} }) => {
  const { record, objectName } = context;
  // Prefer series_id for Notes API compatibility
  const recordId = record?.series_id || record?.id;
  
  // Get lists from config - handle multiple formats
  let lists = [];
  
  if (config?.lists && Array.isArray(config.lists)) {
    // Standard format from Lightning Builder
    lists = config.lists.map(list => {
      // Handle both string array and object array
      if (typeof list === 'string') {
        return { id: list, objectId: list, name: list };
      }
      return {
        id: list.id || list.objectId || list,
        objectId: list.objectId || list.id || list,
        name: list.name || list.objectId || list.id || list,
        type: list.type || 'standard',
        sourceObjectName: list.sourceObjectName || null,
      };
    });
  } else {
    // Default lists if nothing configured
    lists = [
      { id: 'contacts', objectId: 'contact', name: 'Contacts', type: 'standard' },
      { id: 'events', objectId: 'event', name: 'Events', type: 'standard' },
      { id: 'tasks', objectId: 'task', name: 'Tasks', type: 'standard' },
    ];
  }
  
  if (!recordId) {
    return <div className="text-center py-4 text-xs text-slate-400">No record selected</div>;
  }
  
  // Check if Notes is configured in the lists
  const hasNotes = lists.some(l => 
    l.objectId === 'notes' || l.id === 'notes' || l.name?.toLowerCase() === 'notes'
  );
  
  // Check if Files is configured in the lists
  const hasFiles = lists.some(l => 
    l.objectId === 'files' || l.id === 'files' || l.name?.toLowerCase() === 'files'
  );
  
  // Get History lists (type === 'history')
  const historyLists = lists.filter(l => l.type === 'history');
  
  // Filter out notes, files, and history from standard lists (they have special components)
  const standardLists = lists.filter(l => {
    const objectId = (l.objectId || l.id || '').toLowerCase();
    const isSpecial = objectId === 'notes' || objectId === 'files' || l.type === 'history';
    return !isSpecial;
  });
  
  return (
    <div data-testid="related-lists-component">
      {/* Notes Related List - Only shown if configured */}
      {hasNotes && (
        <div className="mb-4">
          <NotesRelatedList
            recordId={recordId}
            recordType={objectName}
            recordName={recordId} 
            showHeader={true}
            maxHeight="350px"
            collapsible={true}
            defaultExpanded={true}
          />
        </div>
      )}
      
      {/* Files Related List - Only shown if configured */}
      {hasFiles && (
        <div className="mb-4">
          <FilesRelatedListComponent
            objectName={objectName}
            recordId={recordId}
            showHeader={true}
            maxHeight="300px"
          />
        </div>
      )}
      
      {/* History Related Lists - Only shown if configured */}
      {historyLists.map((list, idx) => {
        // Extract the object name from the history list ID (e.g., 'lead_history' -> 'lead')
        const historyObjectName = list.sourceObjectName || 
          (list.objectId || list.id || '').replace('_history', '');
        
        return (
          <div key={list.id || `history-${idx}`} className="mb-4">
            <HistoryRelatedListComponent
              objectName={historyObjectName || objectName}
              recordId={recordId}
              objectLabel={list.name?.replace(' History', '') || historyObjectName}
              maxEntries={10}
            />
          </div>
        );
      })}
      
      {/* Other Related Lists */}
      {standardLists.map((list, idx) => (
        <RelatedListPanel
          key={list.id || `related-${idx}`}
          objectType={list.objectId || list.id}
          parentRecordId={recordId}
          sourceObjectName={objectName}
        />
      ))}
    </div>
  );
};

export default RelatedListsComponent;
