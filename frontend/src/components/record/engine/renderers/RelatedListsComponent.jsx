/**
 * RelatedListsComponent - Dynamic Related Records Panels
 * 
 * Features:
 * - Renders related lists based on layout configuration
 * - Fetches records dynamically via API
 * - Shows record counts
 * - Supports navigation to related records
 * - Respects layout visibility rules
 * - Allows creating new related records with prefilled parent context
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  CheckSquare,
  Calendar,
  Mail,
  Users,
  Building2,
  Target,
  FileText,
  ChevronRight,
  Plus,
  RefreshCw,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../../../components/ui/card';
import { Button } from '../../../../components/ui/button';
import { Badge } from '../../../../components/ui/badge';
import { cn } from '../../../../lib/utils';
import { useCreateRecord, RECORD_CREATED_EVENT } from '../../../../services/createRecord';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Icon mapping for related objects
const OBJECT_ICONS = {
  task: CheckSquare,
  tasks: CheckSquare,
  event: Calendar,
  events: Calendar,
  email: Mail,
  emails: Mail,
  contact: Users,
  contacts: Users,
  account: Building2,
  accounts: Building2,
  opportunity: Target,
  opportunities: Target,
  note: FileText,
  notes: FileText,
};

// Color mapping for related objects
const OBJECT_COLORS = {
  task: { bg: 'bg-green-50', text: 'text-green-600', icon: 'bg-green-100' },
  tasks: { bg: 'bg-green-50', text: 'text-green-600', icon: 'bg-green-100' },
  event: { bg: 'bg-purple-50', text: 'text-purple-600', icon: 'bg-purple-100' },
  events: { bg: 'bg-purple-50', text: 'text-purple-600', icon: 'bg-purple-100' },
  email: { bg: 'bg-blue-50', text: 'text-blue-600', icon: 'bg-blue-100' },
  emails: { bg: 'bg-blue-50', text: 'text-blue-600', icon: 'bg-blue-100' },
  contact: { bg: 'bg-cyan-50', text: 'text-cyan-600', icon: 'bg-cyan-100' },
  contacts: { bg: 'bg-cyan-50', text: 'text-cyan-600', icon: 'bg-cyan-100' },
  account: { bg: 'bg-indigo-50', text: 'text-indigo-600', icon: 'bg-indigo-100' },
  accounts: { bg: 'bg-indigo-50', text: 'text-indigo-600', icon: 'bg-indigo-100' },
  opportunity: { bg: 'bg-amber-50', text: 'text-amber-600', icon: 'bg-amber-100' },
  opportunities: { bg: 'bg-amber-50', text: 'text-amber-600', icon: 'bg-amber-100' },
};

/**
 * Get display name for a record
 */
const getRecordDisplayName = (record, objectType) => {
  const data = record?.data || record;
  
  if (data.name) return data.name;
  if (data.subject) return data.subject;
  if (data.title) return data.title;
  if (data.first_name || data.last_name) {
    return `${data.first_name || ''} ${data.last_name || ''}`.trim();
  }
  if (data.email) return data.email;
  
  return `${objectType} Record`;
};

/**
 * Get secondary info for a record
 */
const getSecondaryInfo = (record, objectType) => {
  const data = record?.data || record;
  
  const normalizedType = objectType?.toLowerCase().replace(/s$/, '');
  
  switch (normalizedType) {
    case 'task':
      return data.status || (data.due_date ? `Due: ${new Date(data.due_date).toLocaleDateString()}` : null);
    case 'event':
      return data.start_datetime ? new Date(data.start_datetime).toLocaleString() : null;
    case 'contact':
      return data.email || data.phone;
    case 'account':
      return data.industry || data.website;
    case 'opportunity':
      return data.stage || (data.amount ? `$${data.amount.toLocaleString()}` : null);
    default:
      return data.description?.substring(0, 40) || null;
  }
};

/**
 * Single Related List Panel
 */
const RelatedListPanel = ({
  objectId,
  name,
  icon: iconEmoji,
  columnsConfig = [],
  parentRecordId,
  parentObjectName,
  maxItems = 5,
}) => {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();
  const { openCreateDialog } = useCreateRecord();
  
  // Normalize object name (remove trailing 's' for API calls)
  const normalizedObject = objectId?.toLowerCase().replace(/s$/, '');
  
  const IconComponent = OBJECT_ICONS[objectId] || OBJECT_ICONS[normalizedObject] || FileText;
  const colors = OBJECT_COLORS[objectId] || OBJECT_COLORS[normalizedObject] || { bg: 'bg-slate-50', text: 'text-slate-600', icon: 'bg-slate-100' };
  
  // Fetch related records
  const fetchRecords = useCallback(async () => {
    if (!parentRecordId) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const token = localStorage.getItem('token');
      
      const response = await axios.get(
        `${API}/objects/${normalizedObject}/records?limit=${maxItems}`,
        { headers: { Authorization: `Bearer ${token}` } }
      ).catch(() => ({ data: { records: [] } }));
      
      let fetchedRecords = response.data?.records || response.data || [];
      
      // Filter by related_to field
      if (Array.isArray(fetchedRecords)) {
        fetchedRecords = fetchedRecords.filter(r => {
          const relatedTo = r.data?.related_to || r.related_to;
          return relatedTo === parentRecordId;
        }).slice(0, maxItems);
      }
      
      setRecords(fetchedRecords);
    } catch (err) {
      console.error(`Error fetching ${objectId} records:`, err);
      setError('Failed to load');
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [normalizedObject, objectId, parentRecordId, maxItems]);
  
  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);
  
  // Listen for record-created events to auto-refresh
  useEffect(() => {
    const handleRecordCreated = (event) => {
      const { objectType, parentRecordId: createdParentId } = event.detail;
      // Refresh if a matching record type was created for this parent
      if (objectType?.toLowerCase() === normalizedObject && createdParentId === parentRecordId) {
        fetchRecords();
      }
    };
    
    window.addEventListener(RECORD_CREATED_EVENT, handleRecordCreated);
    return () => window.removeEventListener(RECORD_CREATED_EVENT, handleRecordCreated);
  }, [normalizedObject, parentRecordId, fetchRecords]);
  
  const handleRecordClick = (record) => {
    const recordId = record.series_id || record.id;
    navigate(`/crm/${normalizedObject}/${recordId}`);
  };
  
  const handleViewAll = () => {
    navigate(`/o/${normalizedObject}?related_to=${parentRecordId}`);
  };
  
  // Handle creating a new related record with parent context
  const handleCreateNew = () => {
    openCreateDialog(normalizedObject, {
      parentRecordId: parentRecordId,
      sourceObject: parentObjectName,
      onSuccess: () => fetchRecords(),
    });
  };
  
  return (
    <Card className="shadow-sm border-slate-200 mb-3" data-testid={`related-list-${objectId}`}>
      <CardHeader className="py-2.5 px-3 border-b border-slate-100">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xs font-semibold text-slate-700 flex items-center gap-2">
            <div className={cn("w-6 h-6 rounded flex items-center justify-center", colors.icon)}>
              {iconEmoji ? (
                <span className="text-sm">{iconEmoji}</span>
              ) : (
                <IconComponent className={cn("h-3.5 w-3.5", colors.text)} />
              )}
            </div>
            {name || objectId}
            {!loading && (
              <Badge variant="secondary" className="text-[10px] ml-1 px-1.5">
                {records.length}
              </Badge>
            )}
          </CardTitle>
          
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={fetchRecords}
              disabled={loading}
            >
              <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-blue-600"
              onClick={handleCreateNew}
              data-testid={`create-new-${normalizedObject}-btn`}
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
        ) : error ? (
          <div className="text-center py-3 text-xs text-red-500">{error}</div>
        ) : records.length === 0 ? (
          <div className="text-center py-4 text-xs text-slate-400">
            No {(name?.toLowerCase() || normalizedObject).replace(/s$/, '')}s
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {records.map((record, index) => (
              <div
                key={record.id || index}
                className="px-3 py-2 hover:bg-slate-50 cursor-pointer transition-colors group flex items-center justify-between"
                onClick={() => handleRecordClick(record)}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-slate-800 truncate group-hover:text-blue-600">
                    {getRecordDisplayName(record, normalizedObject)}
                  </p>
                  {getSecondaryInfo(record, normalizedObject) && (
                    <p className="text-[10px] text-slate-500 truncate mt-0.5">
                      {getSecondaryInfo(record, normalizedObject)}
                    </p>
                  )}
                </div>
                <ChevronRight className="h-3 w-3 text-slate-300 group-hover:text-slate-500 flex-shrink-0 ml-2" />
              </div>
            ))}
            
            {records.length >= maxItems && (
              <button
                onClick={handleViewAll}
                className="w-full px-3 py-2 text-[10px] font-medium text-blue-600 hover:bg-blue-50 transition-colors flex items-center justify-center gap-1"
              >
                View All
                <ExternalLink className="h-2.5 w-2.5" />
              </button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

/**
 * RelatedListsComponent - Container for all related lists
 */
const RelatedListsComponent = ({
  config = {},
  record,
  objectName,
}) => {
  // Get lists from config, or use defaults
  const lists = config?.lists || [
    { id: 'contacts', objectId: 'contact', name: 'Contacts', icon: '👤' },
    { id: 'events', objectId: 'event', name: 'Events', icon: '📅' },
    { id: 'tasks', objectId: 'task', name: 'Tasks', icon: '✓' },
  ];
  
  if (!record?.id) {
    return (
      <div className="text-center py-4 text-xs text-slate-400">
        No record selected
      </div>
    );
  }
  
  return (
    <div data-testid="related-lists-component">
      {lists.map((list) => (
        <RelatedListPanel
          key={list.id}
          objectId={list.objectId || list.id}
          name={list.name}
          icon={list.icon}
          columnsConfig={list.columnsConfig}
          parentRecordId={record.id}
          parentObjectName={objectName}
        />
      ))}
    </div>
  );
};

export default RelatedListsComponent;
