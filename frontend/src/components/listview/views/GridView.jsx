/**
 * GridView - Card grid view for records
 * Extracted from EnhancedObjectListView
 */
import React from 'react';
import toast from 'react-hot-toast';

// UI Components
import { Button } from '../../ui/button';
import { Badge } from '../../ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card';

// Icons
import {
  Edit,
  Trash2,
  Mail,
  Phone,
  Building,
  FileText,
} from 'lucide-react';

// Import Record Dialog
import EditRecordDialog from '../../records/EditRecordDialog';

// API
import * as listViewApi from '../services/listViewApi';

const GridView = ({ object, records, onUpdate, getRecordName, onRecordClick }) => {
  const handleDelete = async (recordId, e) => {
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to delete this record?')) return;

    try {
      await listViewApi.deleteRecord(object.object_name, recordId);
      toast.success('Record deleted successfully');
      onUpdate();
    } catch (error) {
      toast.error('Failed to delete record');
    }
  };

  // Get key fields to display - prioritize system fields, then add custom fields
  const systemFields = Object.entries(object.fields)
    .filter(([key, field]) => !field.is_custom)
    .map(([key]) => key)
    .slice(0, 3);

  const customFields = Object.entries(object.fields)
    .filter(([key, field]) => field.is_custom)
    .map(([key]) => key)
    .slice(0, 2);

  const fieldKeys = [...systemFields, ...customFields];

  const getFieldIcon = (fieldKey) => {
    const field = object.fields[fieldKey];
    if (field.type === 'email' || fieldKey.toLowerCase().includes('email')) return <Mail className="h-4 w-4" />;
    if (field.type === 'phone' || fieldKey.toLowerCase().includes('phone')) return <Phone className="h-4 w-4" />;
    if (fieldKey.toLowerCase().includes('company')) return <Building className="h-4 w-4" />;
    return <FileText className="h-4 w-4" />;
  };

  return (
    <div className="p-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {records.map(record => (
          <Card
            key={record.id}
            className="hover:shadow-lg transition-shadow cursor-pointer"
            onClick={() => onRecordClick(record)}
          >
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center justify-between">
                <span className="truncate">{getRecordName(record)}</span>
                <div className="flex items-center space-x-1" onClick={(e) => e.stopPropagation()}>
                  <EditRecordDialog
                    object={object}
                    record={record}
                    onSuccess={onUpdate}
                    trigger={
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                        <Edit className="h-3 w-3" />
                      </Button>
                    }
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => handleDelete(record.id, e)}
                    className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {fieldKeys.map(fieldKey => (
                  record.data[fieldKey] && (
                    <div key={fieldKey} className="flex items-start space-x-3">
                      <div className="text-slate-400 mt-0.5">
                        {getFieldIcon(fieldKey)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2 mb-1">
                          <p className="text-xs text-slate-500">{object.fields[fieldKey].label}</p>
                          {object.fields[fieldKey].is_custom && (
                            <Badge variant="secondary" className="text-xs">Custom</Badge>
                          )}
                        </div>
                        <p className="text-sm text-slate-900 truncate">{record.data[fieldKey]}</p>
                      </div>
                    </div>
                  )
                ))}
              </div>
              <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
                <span className="text-xs text-slate-500">
                  {new Date(record.created_at).toLocaleDateString()}
                </span>
                <Badge variant="secondary" className="text-xs">
                  {object.object_label}
                </Badge>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default GridView;
