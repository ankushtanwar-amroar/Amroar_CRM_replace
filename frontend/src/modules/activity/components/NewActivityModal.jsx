/**
 * NewActivityModal - Modal/Dialog for creating new activity records
 * Auto-links to the parent record
 * Respects field configuration from page builder
 */
import React, { useState, useEffect } from 'react';
import { X, Loader2, Calendar, CheckCircle, Mail, Phone, FileText, Save } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../../../components/ui/dialog';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Textarea } from '../../../components/ui/textarea';
import { Badge } from '../../../components/ui/badge';
import { createActivity, getActivityObjectMetadata } from '../services/activityTimelineService';
import { getActivityColors } from '../config/activityConfigDefaults';
import toast from 'react-hot-toast';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

// Icon mapping
const IconMap = {
  event: Calendar,
  task: CheckCircle,
  email: Mail,
  call: Phone,
  note: FileText,
};

// Default field definitions by activity type
const DEFAULT_FIELD_DEFINITIONS = {
  event: [
    { key: 'subject', label: 'Subject', type: 'text', required: true },
    { key: 'start_date', label: 'Start Date & Time', type: 'datetime-local', required: true },
    { key: 'end_date', label: 'End Date & Time', type: 'datetime-local', required: false },
    { key: 'location', label: 'Location', type: 'text', required: false },
    { key: 'description', label: 'Description', type: 'textarea', required: false },
  ],
  task: [
    { key: 'subject', label: 'Subject', type: 'text', required: true },
    { key: 'due_date', label: 'Due Date', type: 'date', required: false },
    { key: 'status', label: 'Status', type: 'select', options: ['Not Started', 'In Progress', 'Completed', 'Waiting', 'Deferred'], required: false },
    { key: 'priority', label: 'Priority', type: 'select', options: ['High', 'Normal', 'Low'], required: false },
    { key: 'description', label: 'Description', type: 'textarea', required: false },
  ],
  email: [
    { key: 'subject', label: 'Subject', type: 'text', required: true },
    { key: 'to_address', label: 'To', type: 'email', required: true },
    { key: 'body', label: 'Body', type: 'textarea', required: false },
  ],
  call: [
    { key: 'subject', label: 'Subject', type: 'text', required: true },
    { key: 'call_date', label: 'Call Date & Time', type: 'datetime-local', required: false },
    { key: 'status', label: 'Status', type: 'select', options: ['Planned', 'Completed', 'No Answer', 'Voicemail'], required: false },
    { key: 'duration', label: 'Duration (minutes)', type: 'number', required: false },
    { key: 'description', label: 'Notes', type: 'textarea', required: false },
  ],
  note: [
    { key: 'title', label: 'Title', type: 'text', required: true },
    { key: 'body', label: 'Content', type: 'textarea', required: false },
  ],
};

const NewActivityModal = ({
  isOpen,
  onClose,
  activityType,
  parentObjectName,
  parentRecordId,
  parentRecordName,
  onSuccess,
}) => {
  const [formData, setFormData] = useState({});
  const [loading, setLoading] = useState(false);
  const [objectFields, setObjectFields] = useState([]);
  const [loadingFields, setLoadingFields] = useState(false);
  
  const colors = getActivityColors(activityType?.type);
  const IconComponent = IconMap[activityType?.type] || FileText;
  
  // Load object fields from backend
  useEffect(() => {
    const loadFields = async () => {
      if (!activityType?.type || !isOpen) return;
      
      setLoadingFields(true);
      try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_URL}/api/objects`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        if (response.ok) {
          const objects = await response.json();
          const activityObject = objects.find(
            obj => obj.object_name.toLowerCase() === activityType.type.toLowerCase()
          );
          
          if (activityObject && activityObject.fields) {
            const fieldsList = Object.entries(activityObject.fields).map(([key, cfg]) => ({
              key,
              label: cfg.label || key,
              type: mapFieldType(cfg.type),
              required: cfg.required || false,
              options: cfg.options || null,
            }));
            setObjectFields(fieldsList);
          }
        }
      } catch (err) {
        console.warn('Failed to load fields from backend:', err);
      } finally {
        setLoadingFields(false);
      }
    };

    loadFields();
    // Reset form when opening
    if (isOpen) {
      setFormData({});
    }
  }, [activityType?.type, isOpen]);

  // Map backend field types to input types
  const mapFieldType = (backendType) => {
    const typeMap = {
      'text': 'text',
      'string': 'text',
      'email': 'email',
      'phone': 'tel',
      'url': 'url',
      'number': 'number',
      'integer': 'number',
      'currency': 'number',
      'date': 'date',
      'datetime': 'datetime-local',
      'boolean': 'checkbox',
      'checkbox': 'checkbox',
      'picklist': 'select',
      'select': 'select',
      'textarea': 'textarea',
      'richtext': 'textarea',
    };
    return typeMap[backendType?.toLowerCase()] || 'text';
  };
  
  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Get the first required field for validation
    const formFields = getFormFields();
    const requiredFields = formFields.filter(f => f.required);
    
    for (const field of requiredFields) {
      if (!formData[field.key]?.toString().trim()) {
        toast.error(`${field.label} is required`);
        return;
      }
    }
    
    setLoading(true);
    try {
      await createActivity(
        activityType.type,
        formData,
        parentObjectName,
        parentRecordId
      );
      
      toast.success(`${activityType.label} created successfully`);
      onSuccess?.();
      onClose();
    } catch (err) {
      console.error('Error creating activity:', err);
      toast.error(err.message || `Failed to create ${activityType.label}`);
    } finally {
      setLoading(false);
    }
  };
  
  if (!activityType) return null;
  
  // Get form fields based on configuration
  const getFormFields = () => {
    const fieldConfig = activityType.fieldConfig;
    const configuredCreateFields = fieldConfig?.createFields || [];
    
    // If no fields configured, use defaults
    if (configuredCreateFields.length === 0) {
      return DEFAULT_FIELD_DEFINITIONS[activityType.type] || DEFAULT_FIELD_DEFINITIONS.note;
    }
    
    // Use configured fields in order
    // First try to get from backend fields, then fall back to defaults
    const defaultFields = DEFAULT_FIELD_DEFINITIONS[activityType.type] || [];
    
    return configuredCreateFields.map(fieldKey => {
      // Try to find in backend fields
      const backendField = objectFields.find(f => f.key === fieldKey);
      if (backendField) {
        return backendField;
      }
      
      // Try to find in default definitions
      const defaultField = defaultFields.find(f => f.key === fieldKey);
      if (defaultField) {
        return defaultField;
      }
      
      // Create a basic field definition
      return {
        key: fieldKey,
        label: fieldKey.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        type: 'text',
        required: false,
      };
    });
  };
  
  const renderField = (field) => {
    switch (field.type) {
      case 'text':
      case 'email':
      case 'tel':
      case 'url':
        return (
          <Input
            type={field.type}
            value={formData[field.key] || ''}
            onChange={(e) => handleChange(field.key, e.target.value)}
            placeholder={`Enter ${field.label.toLowerCase()}`}
            className="h-9"
            required={field.required}
          />
        );
      
      case 'number':
        return (
          <Input
            type="number"
            value={formData[field.key] || ''}
            onChange={(e) => handleChange(field.key, e.target.value)}
            placeholder={`Enter ${field.label.toLowerCase()}`}
            className="h-9"
            required={field.required}
          />
        );
      
      case 'date':
        return (
          <Input
            type="date"
            value={formData[field.key] || ''}
            onChange={(e) => handleChange(field.key, e.target.value)}
            className="h-9"
            required={field.required}
          />
        );
      
      case 'datetime-local':
        return (
          <Input
            type="datetime-local"
            value={formData[field.key] || ''}
            onChange={(e) => handleChange(field.key, e.target.value)}
            className="h-9"
            required={field.required}
          />
        );
      
      case 'select':
        return (
          <select
            value={formData[field.key] || ''}
            onChange={(e) => handleChange(field.key, e.target.value)}
            className="w-full h-9 border rounded px-3 text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            required={field.required}
          >
            <option value="">Select {field.label}...</option>
            {(field.options || []).map(opt => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        );
      
      case 'checkbox':
        return (
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={formData[field.key] || false}
              onChange={(e) => handleChange(field.key, e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-blue-600"
            />
            <span className="text-sm text-slate-600">Yes</span>
          </div>
        );
      
      case 'textarea':
        return (
          <Textarea
            value={formData[field.key] || ''}
            onChange={(e) => handleChange(field.key, e.target.value)}
            placeholder={`Enter ${field.label.toLowerCase()}`}
            rows={3}
          />
        );
      
      default:
        return (
          <Input
            type="text"
            value={formData[field.key] || ''}
            onChange={(e) => handleChange(field.key, e.target.value)}
            placeholder={`Enter ${field.label.toLowerCase()}`}
            className="h-9"
          />
        );
    }
  };
  
  const formFields = getFormFields();
  
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className={`w-8 h-8 ${colors.iconBg} rounded-full flex items-center justify-center`}>
              <IconComponent className="h-4 w-4 text-white" />
            </div>
            {activityType.newButtonLabel || `New ${activityType.label}`}
          </DialogTitle>
          <DialogDescription className="flex items-center gap-2">
            <span>Creating activity for</span>
            <Badge variant="outline" className="text-xs">
              {parentObjectName}: {parentRecordName || parentRecordId}
            </Badge>
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {loadingFields ? (
            <div className="py-8 text-center">
              <Loader2 className="h-6 w-6 animate-spin text-blue-500 mx-auto" />
              <p className="text-sm text-slate-500 mt-2">Loading form...</p>
            </div>
          ) : (
            formFields.map((field) => (
              <div key={field.key} className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">
                  {field.label}
                  {field.required && <span className="text-red-500 ml-0.5">*</span>}
                </label>
                {renderField(field)}
              </div>
            ))
          )}
        </form>
        
        <DialogFooter>
          <Button
            variant="outline"
            onClick={onClose}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={loading || loadingFields}
            className={`${colors.iconBg} hover:opacity-90`}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Create {activityType.label}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default NewActivityModal;
