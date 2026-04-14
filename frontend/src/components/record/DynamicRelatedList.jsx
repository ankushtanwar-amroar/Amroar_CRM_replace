/**
 * DynamicRelatedList - Layout-driven related list component
 * 
 * Features:
 * - Renders related records based on layout configuration
 * - Fetches records dynamically via API
 * - Supports multiple object types
 * - Click to navigate to related record
 * - Respects layout visibility rules
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  CheckSquare,
  Calendar,
  Mail,
  Phone,
  FileText,
  Users,
  Building2,
  Target,
  ChevronRight,
  Plus,
  Loader2,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { cn } from '../../lib/utils';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Icon mapping for object types
const OBJECT_ICONS = {
  task: CheckSquare,
  event: Calendar,
  email: Mail,
  emailmessage: Mail,
  call: Phone,
  note: FileText,
  contact: Users,
  account: Building2,
  opportunity: Target,
  lead: Users,
};

// Color mapping for object types
const OBJECT_COLORS = {
  task: 'text-blue-600 bg-blue-50',
  event: 'text-purple-600 bg-purple-50',
  email: 'text-green-600 bg-green-50',
  emailmessage: 'text-green-600 bg-green-50',
  call: 'text-orange-600 bg-orange-50',
  note: 'text-slate-600 bg-slate-100',
  contact: 'text-cyan-600 bg-cyan-50',
  account: 'text-indigo-600 bg-indigo-50',
  opportunity: 'text-amber-600 bg-amber-50',
  lead: 'text-rose-600 bg-rose-50',
};

/**
 * Get display name for a record
 */
const getRecordDisplayName = (record, objectType) => {
  const data = record?.data || record;
  
  // Try common name fields
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
  
  switch (objectType) {
    case 'task':
      return data.status || data.due_date ? `${data.status || ''}${data.due_date ? ` • Due: ${new Date(data.due_date).toLocaleDateString()}` : ''}` : null;
    case 'event':
      return data.start_datetime ? new Date(data.start_datetime).toLocaleString() : null;
    case 'contact':
      return data.email || data.phone;
    case 'account':
      return data.industry || data.website;
    case 'opportunity':
      return data.stage || (data.amount ? `$${data.amount.toLocaleString()}` : null);
    default:
      return data.description?.substring(0, 50) || null;
  }
};

/**
 * Single Related List Card Component
 */
const RelatedListCard = ({
  objectType,
  objectLabel,
  parentRecordId,
  parentObjectName,
  onNavigate,
  maxItems = 5,
}) => {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isHovered, setIsHovered] = useState(false);
  const navigate = useNavigate();

  const IconComponent = OBJECT_ICONS[objectType] || FileText;
  const colorClass = OBJECT_COLORS[objectType] || 'text-slate-600 bg-slate-100';

  // Fetch related records
  const fetchRecords = useCallback(async () => {
    if (!parentRecordId) return;
    
    setLoading(true);
    setError(null);
    
    try {
      // Try to fetch records related to the parent
      const response = await axios.get(
        `${API}/objects/${objectType}/records?limit=${maxItems}&related_to=${parentRecordId}`,
        { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
      ).catch(() => ({ data: [] }));
      
      let fetchedRecords = response.data?.records || response.data || [];
      
      // Filter by related_to field if not already filtered by API
      if (Array.isArray(fetchedRecords)) {
        fetchedRecords = fetchedRecords.filter(r => {
          const relatedTo = r.data?.related_to || r.related_to;
          return relatedTo === parentRecordId;
        }).slice(0, maxItems);
      }
      
      setRecords(fetchedRecords);
    } catch (err) {
      console.error(`Error fetching ${objectType} records:`, err);
      setError('Failed to load');
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [objectType, parentRecordId, maxItems]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  const handleRecordClick = (record) => {
    const recordId = record.series_id || record.id;
    navigate(`/crm/${objectType}/${recordId}`);
  };

  const handleViewAll = () => {
    // Navigate to list view filtered by parent record
    navigate(`/crm/${objectType}?related_to=${parentRecordId}`);
  };

  return (
    <Card 
      className={cn(
        "shadow-sm border-slate-200 transition-all duration-200",
        isHovered && "shadow-md border-slate-300"
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <CardHeader className="py-3 px-4 border-b border-slate-100">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <div className={cn("w-6 h-6 rounded flex items-center justify-center", colorClass)}>
              <IconComponent className="h-3.5 w-3.5" />
            </div>
            {objectLabel || objectType}
            {!loading && records.length > 0 && (
              <Badge variant="secondary" className="text-[10px] ml-1">
                {records.length}
              </Badge>
            )}
          </CardTitle>
          
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={fetchRecords}
              disabled={loading}
            >
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-blue-600"
              title="Add new"
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="p-0">
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
          </div>
        ) : error ? (
          <div className="text-center py-4 text-sm text-red-500">
            {error}
          </div>
        ) : records.length === 0 ? (
          <div className="text-center py-6 text-sm text-slate-400">
            No {objectLabel?.toLowerCase() || objectType}{objectLabel?.endsWith('s') ? '' : 's'}
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {records.map((record, index) => (
              <div
                key={record.id || index}
                className="px-4 py-2.5 hover:bg-slate-50 cursor-pointer transition-colors group flex items-center justify-between"
                onClick={() => handleRecordClick(record)}
                data-testid={`related-record-${objectType}-${record.id}`}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-800 truncate group-hover:text-blue-600">
                    {getRecordDisplayName(record, objectType)}
                  </p>
                  {getSecondaryInfo(record, objectType) && (
                    <p className="text-xs text-slate-500 truncate mt-0.5">
                      {getSecondaryInfo(record, objectType)}
                    </p>
                  )}
                </div>
                <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-slate-500 flex-shrink-0 ml-2" />
              </div>
            ))}
            
            {/* View All Link */}
            {records.length >= maxItems && (
              <button
                onClick={handleViewAll}
                className="w-full px-4 py-2 text-xs font-medium text-blue-600 hover:bg-blue-50 transition-colors flex items-center justify-center gap-1"
              >
                View All
                <ExternalLink className="h-3 w-3" />
              </button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

/**
 * DynamicRelatedList Component
 * Renders multiple related lists based on layout configuration
 */
const DynamicRelatedList = ({
  relatedLists = [],
  parentRecordId,
  parentObjectName,
  className,
}) => {
  if (!relatedLists || relatedLists.length === 0) {
    return null;
  }

  // Normalize related lists format
  const normalizedLists = Array.isArray(relatedLists) 
    ? relatedLists.map(item => {
        if (typeof item === 'string') {
          return { objectType: item, label: item.charAt(0).toUpperCase() + item.slice(1) + 's' };
        }
        return {
          objectType: item.object || item.objectType || item.type,
          label: item.label || item.name || (item.object || item.objectType || item.type),
        };
      })
    : [];

  return (
    <div className={cn("space-y-4", className)}>
      {normalizedLists.map((list, index) => (
        <RelatedListCard
          key={list.objectType || index}
          objectType={list.objectType}
          objectLabel={list.label}
          parentRecordId={parentRecordId}
          parentObjectName={parentObjectName}
        />
      ))}
    </div>
  );
};

export default DynamicRelatedList;
