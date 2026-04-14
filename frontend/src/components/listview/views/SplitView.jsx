/**
 * SplitView - Split view with list on left, record detail on right
 * Extracted from EnhancedObjectListView
 */
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

// UI Components
import { Button } from '../../ui/button';
import { Badge } from '../../ui/badge';
import { Label } from '../../ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card';

// Icons
import {
  Edit,
  Trash2,
  Eye,
  Calendar as CalendarIcon,
  Clock,
  Mail,
  Phone,
  Building,
  FileText,
  Columns2,
} from 'lucide-react';

// Import Record Dialog
import EditRecordDialog from '../../records/EditRecordDialog';

// API
import * as listViewApi from '../services/listViewApi';

const SplitView = ({ object, records, onUpdate, getRecordName }) => {
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [recordDetails, setRecordDetails] = useState(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  // Auto-select first record on mount
  useEffect(() => {
    if (records.length > 0 && !selectedRecord) {
      handleRecordSelect(records[0]);
    }
  }, [records]);

  const handleRecordSelect = async (record) => {
    setSelectedRecord(record);
    setLoading(true);
    try {
      // Track recently viewed
      await listViewApi.trackRecordView(object.object_name, record.id);
      setRecordDetails(record);
    } catch (error) {
      console.error('Error loading record details:', error);
      setRecordDetails(record);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (recordId, e) => {
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to delete this record?')) return;

    try {
      await listViewApi.deleteRecord(object.object_name, recordId);
      toast.success('Record deleted successfully');
      if (selectedRecord?.id === recordId) {
        setSelectedRecord(null);
        setRecordDetails(null);
      }
      onUpdate();
    } catch (error) {
      toast.error('Failed to delete record');
    }
  };

  const handleOpenFullRecord = () => {
    if (selectedRecord) {
      navigate(`/crm/${object.object_name}/${selectedRecord.series_id}`);
    }
  };

  // Get key fields for the list view
  const listFieldKeys = Object.keys(object.fields).slice(0, 2);

  // Get all fields for detail view
  const allFieldKeys = Object.keys(object.fields);

  const getFieldIcon = (fieldKey) => {
    const field = object.fields[fieldKey];
    if (field?.type === 'email' || fieldKey.toLowerCase().includes('email')) return <Mail className="h-4 w-4" />;
    if (field?.type === 'phone' || fieldKey.toLowerCase().includes('phone')) return <Phone className="h-4 w-4" />;
    if (fieldKey.toLowerCase().includes('company')) return <Building className="h-4 w-4" />;
    return <FileText className="h-4 w-4" />;
  };

  return (
    <div className="flex h-[calc(100vh-280px)] min-h-[500px]">
      {/* Left Panel - Records List */}
      <div className="w-1/3 border-r border-slate-200 overflow-y-auto bg-white">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-4 py-3 z-10">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-900 text-sm">
              {object.object_plural} ({records.length})
            </h3>
          </div>
        </div>
        <div className="divide-y divide-slate-100">
          {records.map((record) => (
            <div
              key={record.id}
              onClick={() => handleRecordSelect(record)}
              className={`px-4 py-3 cursor-pointer transition-colors hover:bg-slate-50 ${
                selectedRecord?.id === record.id ? 'bg-indigo-50 border-l-2 border-indigo-600' : ''
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <p className={`font-medium truncate ${
                    selectedRecord?.id === record.id ? 'text-indigo-700' : 'text-slate-900'
                  }`}>
                    {getRecordName(record)}
                  </p>
                  {listFieldKeys.slice(1).map((fieldKey) => (
                    record.data[fieldKey] && (
                      <p key={fieldKey} className="text-sm text-slate-500 truncate mt-1">
                        {record.data[fieldKey]}
                      </p>
                    )
                  ))}
                  <p className="text-xs text-slate-400 mt-1">
                    {record.series_id} • {new Date(record.created_at).toLocaleDateString()}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => handleDelete(record.id, e)}
                  className="h-8 w-8 p-0 text-slate-400 hover:text-red-600 opacity-0 group-hover:opacity-100"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
          {records.length === 0 && (
            <div className="px-4 py-8 text-center text-slate-500">
              <FileText className="h-8 w-8 mx-auto mb-2 text-slate-300" />
              <p className="text-sm">No records found</p>
            </div>
          )}
        </div>
      </div>

      {/* Right Panel - Record Detail */}
      <div className="flex-1 overflow-y-auto bg-slate-50">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
          </div>
        ) : selectedRecord && recordDetails ? (
          <div className="p-6">
            {/* Record Header */}
            <div className="flex items-start justify-between mb-6">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">
                  {getRecordName(selectedRecord)}
                </h2>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="secondary">{object.object_label}</Badge>
                  <span className="text-sm text-slate-500">ID: {selectedRecord.series_id}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <EditRecordDialog
                  object={object}
                  record={selectedRecord}
                  onSuccess={() => {
                    onUpdate();
                    handleRecordSelect(selectedRecord);
                  }}
                  trigger={
                    <Button variant="outline" size="sm">
                      <Edit className="h-4 w-4 mr-2" />
                      Edit
                    </Button>
                  }
                />
                <Button variant="outline" size="sm" onClick={handleOpenFullRecord}>
                  <Eye className="h-4 w-4 mr-2" />
                  Open Full Record
                </Button>
              </div>
            </div>

            {/* Record Fields */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Record Details</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {allFieldKeys.map((fieldKey) => {
                    const field = object.fields[fieldKey];
                    const value = recordDetails.data[fieldKey];
                    
                    return (
                      <div key={fieldKey} className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-slate-400">{getFieldIcon(fieldKey)}</span>
                          <Label className="text-sm font-medium text-slate-600">
                            {field?.label || fieldKey}
                            {field?.is_custom && (
                              <Badge variant="secondary" className="ml-2 text-xs">Custom</Badge>
                            )}
                          </Label>
                        </div>
                        <p className="text-sm text-slate-900 pl-6">
                          {value || <span className="text-slate-400 italic">Not set</span>}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Timestamps */}
            <div className="mt-4 flex items-center gap-6 text-sm text-slate-500">
              <div className="flex items-center gap-1">
                <CalendarIcon className="h-4 w-4" />
                <span>Created: {new Date(recordDetails.created_at).toLocaleString()}</span>
              </div>
              <div className="flex items-center gap-1">
                <Clock className="h-4 w-4" />
                <span>Modified: {new Date(recordDetails.updated_at).toLocaleString()}</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-slate-500">
            <Columns2 className="h-12 w-12 mb-4 text-slate-300" />
            <p className="text-lg font-medium mb-2">Select a record</p>
            <p className="text-sm">Click on a record from the list to view details</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default SplitView;
