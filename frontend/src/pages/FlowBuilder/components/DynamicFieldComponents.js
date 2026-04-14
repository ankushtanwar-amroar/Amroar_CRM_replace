/**
 * Dynamic Field Components for Screen Flow Engine
 * 
 * These components render dynamically based on flow configuration.
 * They are used by ScreenRenderer to render field types like:
 * - RecordLookup (lookup to custom objects)
 * - DateTimeWithRecommendations (datetime with suggested slots)
 * - DisplayRecord (read-only record display)
 * - ReviewSummary (form data summary)
 * - ServiceAppointmentSelector (SA handling for work orders)
 */

import React, { useState, useEffect, useMemo } from 'react';
import { User, Clock, Zap, Calendar, CheckCircle, Loader2, Info, AlertCircle } from 'lucide-react';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { toast } from 'sonner';
import axios from 'axios';

const API_URL = process.env.REACT_APP_BACKEND_URL;

/**
 * RecordLookup - Dynamic lookup field for custom objects
 */
export const RecordLookupField = ({
  field,
  value,
  onChange,
  onNameChange, // NEW: callback to store the display name
  error,
  isReadOnly,
  context
}) => {
  const objectName = field.objectName || field.lookupObject || 'technician';
  const displayField = field.displayField || 'name';
  const secondaryField = field.secondaryField || 'email';
  const filters = field.filters || {};
  
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    const fetchRecords = async () => {
      try {
        setLoading(true);
        const token = localStorage.getItem('token');
        
        let queryParams = new URLSearchParams();
        Object.entries(filters).forEach(([key, val]) => {
          queryParams.append(`filter_${key}`, val);
        });
        
        const response = await axios.get(
          `${API_URL}/api/objects/${objectName}/records?${queryParams.toString()}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        
        setRecords(response.data?.records || []);
      } catch (err) {
        console.error(`Error fetching ${objectName} records:`, err);
        toast.error(`Failed to load ${objectName} options`);
      } finally {
        setLoading(false);
      }
    };
    fetchRecords();
  }, [objectName, JSON.stringify(filters)]);
  
  const selectedRecord = records.find(r => r.id === value);
  
  const handleValueChange = (newValue) => {
    onChange(newValue);
    // Also store the display name for use in review screens
    const selected = records.find(r => r.id === newValue);
    if (selected && onNameChange) {
      const displayName = selected.data?.[displayField] || selected.id;
      onNameChange(`${field.name}_name`, displayName);
    }
  };
  
  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium text-gray-700">
        {field.label}
        {field.required && <span className="text-red-500 ml-1">*</span>}
      </Label>
      <Select 
        value={value || ''} 
        onValueChange={handleValueChange}
        disabled={loading || isReadOnly}
      >
        <SelectTrigger className={`${error ? 'border-red-500' : ''}`}>
          <SelectValue placeholder={loading ? 'Loading...' : `Select ${field.label}`}>
            {selectedRecord && (
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center">
                  <User className="h-3.5 w-3.5 text-blue-600" />
                </div>
                <span>{selectedRecord.data?.[displayField] || selectedRecord.id}</span>
              </div>
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {records.map((record) => (
            <SelectItem key={record.id} value={record.id}>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center">
                  <User className="h-3.5 w-3.5 text-blue-600" />
                </div>
                <div className="flex flex-col">
                  <span className="font-medium">{record.data?.[displayField] || record.id}</span>
                  {record.data?.[secondaryField] && (
                    <span className="text-xs text-slate-500">{record.data[secondaryField]}</span>
                  )}
                </div>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {field.helpText && !error && (
        <p className="text-xs text-gray-500">{field.helpText}</p>
      )}
      {error && (
        <div className="flex items-center gap-1 text-xs text-red-600">
          <AlertCircle className="w-3 h-3" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
};

/**
 * DateTimeWithRecommendationsField - DateTime with suggested time slots
 */
export const DateTimeWithRecommendationsField = ({
  field,
  value,
  onChange,
  onLinkedChange,
  error,
  isReadOnly
}) => {
  const linkedEndField = field.linkedEndField || null;
  
  const timeSlots = useMemo(() => {
    const slots = [];
    const now = new Date();
    now.setMinutes(0, 0, 0);
    now.setHours(now.getHours() + 1);
    
    for (let i = 0; i < 4; i++) {
      const startTime = new Date(now);
      startTime.setHours(startTime.getHours() + (i * 2));
      
      if (startTime.getHours() >= 18) {
        startTime.setDate(startTime.getDate() + 1);
        startTime.setHours(9 + (i % 4) * 2);
      }
      
      const endTime = new Date(startTime);
      endTime.setHours(endTime.getHours() + 1);
      
      slots.push({
        id: i,
        label: `${startTime.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} ${startTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} - ${endTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`,
        start: startTime.toISOString().slice(0, 16),
        end: endTime.toISOString().slice(0, 16)
      });
    }
    return slots;
  }, []);
  
  const handleSlotSelect = (start, end) => {
    onChange(start);
    if (linkedEndField && onLinkedChange) {
      onLinkedChange(linkedEndField, end);
    }
  };
  
  return (
    <div className="space-y-4">
      {/* Recommended Slots */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-3">
          <Zap className="h-4 w-4 text-blue-600" />
          <span className="text-sm font-medium text-blue-800">Recommended Time Slots</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {timeSlots.map((slot) => (
            <button
              key={slot.id}
              type="button"
              onClick={() => handleSlotSelect(slot.start, slot.end)}
              className="text-xs h-auto py-2 px-3 text-left border rounded-lg hover:bg-blue-100 hover:border-blue-300 transition-colors flex items-center gap-2 bg-white"
              disabled={isReadOnly}
            >
              <Clock className="h-3 w-3 flex-shrink-0 text-blue-600" />
              <span className="truncate">{slot.label}</span>
            </button>
          ))}
        </div>
      </div>
      
      {/* Manual DateTime Input */}
      <div className="space-y-2">
        <Label className="text-sm font-medium text-gray-700">
          {field.label}
          {field.required && <span className="text-red-500 ml-1">*</span>}
        </Label>
        <Input
          type="datetime-local"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          className={error ? 'border-red-500' : ''}
          disabled={isReadOnly}
        />
        {field.helpText && !error && (
          <p className="text-xs text-gray-500">{field.helpText}</p>
        )}
        {error && (
          <div className="flex items-center gap-1 text-xs text-red-600">
            <AlertCircle className="w-3 h-3" />
            <span>{error}</span>
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * DisplayRecordField - Read-only display of record data
 */
export const DisplayRecordField = ({
  field,
  context
}) => {
  const recordId = field.recordIdVar ? context[field.recordIdVar] : (context.recordId || context['Flow.recordId']);
  const objectName = field.objectName || context.objectType || 'record';
  const displayFields = field.displayFields || ['subject', 'status', 'priority'];
  
  const [recordData, setRecordData] = useState(null);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    const fetchRecord = async () => {
      // Check if record data is already in context
      if (context.Record || context['Record']) {
        setRecordData(context.Record || context['Record']);
        setLoading(false);
        return;
      }
      
      if (!recordId) {
        setLoading(false);
        return;
      }
      
      try {
        setLoading(true);
        const token = localStorage.getItem('token');
        
        let response;
        try {
          response = await axios.get(
            `${API_URL}/api/work-orders/${recordId}`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
        } catch {
          response = await axios.get(
            `${API_URL}/api/objects/${objectName}/records/${recordId}`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
        }
        
        setRecordData(response.data);
      } catch (err) {
        console.error('Error fetching display record:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchRecord();
  }, [recordId, objectName, context]);
  
  return (
    <div className="space-y-4">
      <Label className="text-sm font-medium text-gray-700">
        {field.label}
      </Label>
      
      {loading ? (
        <div className="flex items-center gap-2 text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Loading record...</span>
        </div>
      ) : recordData ? (
        <div className="bg-slate-50 rounded-lg p-4 space-y-3">
          {displayFields.map((fieldName) => {
            const value = recordData.data?.[fieldName] || recordData[fieldName] || '-';
            const fieldLabel = fieldName.charAt(0).toUpperCase() + fieldName.slice(1).replace(/_/g, ' ');
            return (
              <div key={fieldName} className="flex justify-between items-center">
                <span className="text-sm text-slate-500">{fieldLabel}:</span>
                <span className="text-sm font-medium text-slate-900">{value}</span>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex items-center gap-2 text-amber-800">
            <Info className="h-4 w-4" />
            <span className="text-sm">No record data available</span>
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * ReviewSummaryField - Display all collected data for review
 */
export const ReviewSummaryField = ({
  field,
  context,
  formData
}) => {
  const summaryFields = field.summaryFields || [];
  const summaryTitle = field.summaryTitle || 'Review Summary';
  
  return (
    <div className="space-y-4">
      <Label className="text-sm font-medium text-gray-700">
        {field.label || summaryTitle}
      </Label>
      
      <div className="bg-slate-50 rounded-lg p-4 space-y-3">
        {summaryFields.map((sf) => {
          // Get value from context or formData
          let value = context[`Screen.${sf.sourceField}`] || context[sf.sourceField] || formData?.[sf.sourceField] || '-';
          
          // Format datetime values
          if (sf.type === 'datetime' && value && value !== '-') {
            try {
              const date = new Date(value);
              value = date.toLocaleString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit'
              });
            } catch {}
          }
          
          // For lookup fields, try to get display name
          if (sf.type === 'lookup') {
            const lookupName = context[`${sf.sourceField}_name`] || context[`Screen.${sf.sourceField}_name`];
            if (lookupName) value = lookupName;
          }
          
          return (
            <div key={sf.sourceField} className="flex justify-between items-center">
              <span className="text-sm text-slate-500">{sf.label}:</span>
              <span className="text-sm font-medium text-slate-900 flex items-center gap-2">
                {sf.icon === 'user' && <User className="h-4 w-4 text-blue-600" />}
                {sf.icon === 'calendar' && <Calendar className="h-4 w-4 text-blue-600" />}
                {sf.icon === 'clock' && <Clock className="h-4 w-4 text-blue-600" />}
                {value}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/**
 * ServiceAppointmentSelectorField - Auto-fetch SAs for work order
 */
export const ServiceAppointmentSelectorField = ({
  field,
  value,
  onChange,
  error,
  context
}) => {
  const workOrderId = field.workOrderIdVar ? context[field.workOrderIdVar] : (context.recordId || context['Flow.recordId']);
  
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState('none'); // none, single, multiple
  
  useEffect(() => {
    const fetchServiceAppointments = async () => {
      if (!workOrderId) {
        setLoading(false);
        setMode('none');
        onChange('create_new');
        return;
      }
      
      try {
        setLoading(true);
        const token = localStorage.getItem('token');
        const response = await axios.get(
          `${API_URL}/api/work-orders/${workOrderId}/service-appointments`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        
        const appointments = response.data?.records || [];
        setRecords(appointments);
        
        if (appointments.length === 0) {
          setMode('none');
          onChange('create_new');
        } else if (appointments.length === 1) {
          setMode('single');
          onChange(appointments[0].id);
        } else {
          setMode('multiple');
        }
      } catch (err) {
        console.error('Error fetching service appointments:', err);
        setMode('none');
        onChange('create_new');
      } finally {
        setLoading(false);
      }
    };
    fetchServiceAppointments();
  }, [workOrderId]);
  
  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium text-gray-700">
        {field.label}
      </Label>
      
      {loading ? (
        <div className="flex items-center gap-2 text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Checking service appointments...</span>
        </div>
      ) : mode === 'none' ? (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-blue-600 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-blue-900">
                A new Service Appointment will be created
              </p>
              <p className="text-xs text-blue-700 mt-1">
                No existing appointments found for this work order
              </p>
            </div>
          </div>
        </div>
      ) : mode === 'single' ? (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-green-900">
                Service Appointment: {records[0]?.data?.subject || records[0]?.id}
              </p>
              <p className="text-xs text-green-700 mt-1">
                Auto-selected (only appointment for this work order)
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <p className="text-sm text-amber-800">
              {records.length} service appointments found - please select one
            </p>
          </div>
          <Select 
            value={value || ''} 
            onValueChange={onChange}
          >
            <SelectTrigger className={`${error ? 'border-red-500' : ''}`}>
              <SelectValue placeholder="Select a service appointment" />
            </SelectTrigger>
            <SelectContent>
              {records.map((sa) => (
                <SelectItem key={sa.id} value={sa.id}>
                  {sa.data?.subject || sa.id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      
      {error && (
        <div className="flex items-center gap-1 text-xs text-red-600">
          <AlertCircle className="w-3 h-3" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
};

export default {
  RecordLookupField,
  DateTimeWithRecommendationsField,
  DisplayRecordField,
  ReviewSummaryField,
  ServiceAppointmentSelectorField
};
