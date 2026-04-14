/**
 * Recent Records Component
 * 
 * Shows recently viewed, updated, or created records.
 * Part of the App Manager page builder component library.
 */
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Clock, ChevronRight, RefreshCw, AlertCircle,
  User, Building, Target, UserPlus, CheckSquare, Calendar,
  Eye, Edit, Plus
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select';
import { getRecentRecordsData } from '../services/appManagerService';

const objectIcons = {
  lead: UserPlus,
  account: Building,
  contact: User,
  opportunity: Target,
  task: CheckSquare,
  event: Calendar
};

const objectColors = {
  lead: 'bg-orange-100 text-orange-600',
  account: 'bg-blue-100 text-blue-600',
  contact: 'bg-purple-100 text-purple-600',
  opportunity: 'bg-green-100 text-green-600',
  task: 'bg-cyan-100 text-cyan-600',
  event: 'bg-pink-100 text-pink-600'
};

const recordTypeIcons = {
  viewed: Eye,
  updated: Edit,
  created: Plus
};

const RecentRecordsComponent = ({ config = {} }) => {
  const navigate = useNavigate();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [recordType, setRecordType] = useState(config.record_type || 'viewed');
  const [objectFilter, setObjectFilter] = useState(config.object_filter || 'all');

  const fetchRecords = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getRecentRecordsData({
        record_type: recordType,
        object_filter: objectFilter,
        max_rows: config.max_rows || 10
      });
      setRecords(data.records || []);
    } catch (err) {
      setError('Failed to load records');
      console.error('Error fetching recent records:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecords();
  }, [recordType, objectFilter]);

  const handleRecordClick = (record) => {
    // Navigate based on object type
    const objectType = record.object_type;
    if (['lead', 'account', 'contact', 'opportunity'].includes(objectType)) {
      navigate(`/crm/${objectType}/${record.id}`);
    } else if (objectType === 'task' || objectType === 'event') {
      navigate(`/sales/${objectType}/${record.id}`);
    } else {
      navigate(`/crm/${objectType}/${record.id}`);
    }
  };

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    
    // Less than a minute
    if (diff < 60000) return 'Just now';
    
    // Less than an hour
    if (diff < 3600000) {
      const mins = Math.floor(diff / 60000);
      return `${mins}m ago`;
    }
    
    // Less than a day
    if (diff < 86400000) {
      const hours = Math.floor(diff / 3600000);
      return `${hours}h ago`;
    }
    
    // Less than a week
    if (diff < 604800000) {
      const days = Math.floor(diff / 86400000);
      return `${days}d ago`;
    }
    
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric'
    });
  };

  const recordTypeOptions = [
    { value: 'viewed', label: 'Recently Viewed' },
    { value: 'updated', label: 'Recently Updated' },
    { value: 'created', label: 'Recently Created' }
  ];

  const objectFilterOptions = [
    { value: 'all', label: 'All Objects' },
    { value: 'lead', label: 'Leads' },
    { value: 'account', label: 'Accounts' },
    { value: 'contact', label: 'Contacts' },
    { value: 'opportunity', label: 'Opportunities' }
  ];

  const RecordTypeIcon = recordTypeIcons[recordType] || Clock;

  return (
    <Card 
      className="flex flex-col overflow-hidden" 
      style={{ height: '380px', minHeight: '380px', maxHeight: '380px' }}
      data-testid="recent-records-component"
    >
      <CardHeader className="pb-3 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-slate-100 rounded-lg">
              <Clock className="h-4 w-4 text-slate-600" />
            </div>
            <CardTitle className="text-lg font-semibold">
              {config.title || 'Recent Records'}
            </CardTitle>
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={fetchRecords}
            className="h-8 w-8 p-0"
            data-testid="refresh-recent-records-btn"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
        <div className="flex items-center gap-2 mt-2">
          <Select value={recordType} onValueChange={setRecordType}>
            <SelectTrigger className="w-[145px] h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {recordTypeOptions.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={objectFilter} onValueChange={setObjectFilter}>
            <SelectTrigger className="w-[120px] h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {objectFilterOptions.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="pt-0 flex-1 overflow-y-auto">
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="animate-pulse h-12 bg-slate-100 rounded-lg" />
            ))}
          </div>
        ) : error ? (
          <div className="flex items-center justify-center py-8 text-red-500">
            <AlertCircle className="h-5 w-5 mr-2" />
            {error}
          </div>
        ) : records.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-slate-500">
            <div className="p-3 bg-slate-100 rounded-full mb-3">
              <RecordTypeIcon className="h-8 w-8 text-slate-400" />
            </div>
            <p className="text-sm font-medium">No recent records</p>
            <p className="text-xs text-slate-400">
              {recordType === 'viewed' && 'Records you view will appear here'}
              {recordType === 'updated' && 'Recently updated records will appear here'}
              {recordType === 'created' && 'Records you create will appear here'}
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {records.map((record) => {
              const ObjectIcon = objectIcons[record.object_type] || Clock;
              const colorClass = objectColors[record.object_type] || 'bg-slate-100 text-slate-600';

              return (
                <div
                  key={record.id}
                  onClick={() => handleRecordClick(record)}
                  className="flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-all hover:bg-slate-50 group"
                  data-testid={`recent-record-${record.id}`}
                >
                  <div className={`p-2 rounded-lg ${colorClass}`}>
                    <ObjectIcon className="h-3.5 w-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate group-hover:text-blue-600 transition-colors">
                      {record.name}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <Badge variant="outline" className="text-xs capitalize px-1.5 py-0">
                        {record.object_type}
                      </Badge>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatTimestamp(record.timestamp)}
                      </span>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-slate-500 transition-colors" />
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default RecentRecordsComponent;
