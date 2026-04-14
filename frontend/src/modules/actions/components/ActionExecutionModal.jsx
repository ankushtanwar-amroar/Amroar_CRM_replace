/**
 * ActionExecutionModal
 * Modal for Create Record actions - dynamically fetches target object fields
 * and renders a proper form UI like Salesforce
 */
import React, { useState, useEffect, useMemo } from 'react';
import { X, Loader2, Save, AlertCircle } from 'lucide-react';
import axios from 'axios';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Textarea } from '../../../components/ui/textarea';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue 
} from '../../../components/ui/select';
import { Checkbox } from '../../../components/ui/checkbox';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const ActionExecutionModal = ({ 
  action, 
  recordData = {},
  sourceRecordId,
  onSubmit, 
  onClose 
}) => {
  const [formData, setFormData] = useState({});
  const [formInitialized, setFormInitialized] = useState(false);
  const [targetObjectFields, setTargetObjectFields] = useState([]);
  const [loadingFields, setLoadingFields] = useState(true);
  const [fieldError, setFieldError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState({});

  const config = action?.config_json || {};
  const targetObject = config.target_object || 'record';
  const modalTitle = config.modal_title || `New ${targetObject.charAt(0).toUpperCase() + targetObject.slice(1)}`;
  
  // Memoize actionFields to prevent unnecessary recalculations
  const actionFields = useMemo(() => config.fields || [], [config.fields]);

  // Fetch target object fields from API
  useEffect(() => {
    if (!targetObject) {
      setLoadingFields(false);
      return;
    }
    
    // Don't re-fetch if already have fields
    if (targetObjectFields.length > 0) {
      return;
    }

    const fetchObjectFields = async () => {
      try {
        setLoadingFields(true);
        setFieldError(null);
        
        const token = localStorage.getItem('token');
        const response = await axios.get(
          `${API_URL}/api/objects/${targetObject.toLowerCase()}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        
        const objectData = response.data;
        
        // Convert fields object to array format
        const fieldsArray = objectData.fields ? 
          Object.entries(objectData.fields).map(([key, field]) => ({
            api_name: key,
            label: field.label || formatFieldLabel(key),
            type: field.type || 'text',
            required: field.required || false,
            options: field.options || [],
            related_object: field.related_object || null,
            defaultValue: field.defaultValue || null
          })) : [];
        
        setTargetObjectFields(fieldsArray);
        
      } catch (err) {
        console.error('[ActionModal] Error fetching object fields:', err);
        setFieldError('Failed to load form fields. Please try again.');
      } finally {
        setLoadingFields(false);
      }
    };

    fetchObjectFields();
  }, [targetObject, targetObjectFields.length]);

  // Build list of fields to display in the modal
  const displayFields = useMemo(() => {
    // If action has specific fields configured, use those to filter/order
    if (actionFields.length > 0) {
      // Create a map of configured field settings
      const configuredFieldsMap = {};
      actionFields.forEach(af => {
        configuredFieldsMap[af.field_api_name] = af;
      });

      // Filter target object fields to only show configured ones (if show_in_modal is true)
      return targetObjectFields
        .filter(field => {
          const configured = configuredFieldsMap[field.api_name];
          // If field is configured and show_in_modal is false, exclude it
          if (configured && configured.show_in_modal === false) return false;
          // If field is configured, show it
          if (configured) return true;
          // If no fields are configured at all, show all editable fields
          return false;
        })
        .map(field => ({
          ...field,
          // Override with action config
          required: configuredFieldsMap[field.api_name]?.required || field.required,
          defaultValue: configuredFieldsMap[field.api_name]?.value,
          defaultValueType: configuredFieldsMap[field.api_name]?.value_type || 'STATIC'
        }));
    }
    
    // No fields configured - show all writable fields (exclude system fields)
    const systemFields = ['id', 'series_id', 'tenant_id', 'created_at', 'updated_at', 'created_by', 'owner_id'];
    return targetObjectFields.filter(f => !systemFields.includes(f.api_name));
  }, [targetObjectFields, actionFields]);

  // Initialize form with default values after fields are loaded
  useEffect(() => {
    // Don't re-initialize if already done
    if (formInitialized) return;
    if (loadingFields) return;
    if (displayFields.length === 0) return;

    const initialData = {};
    
    displayFields.forEach(field => {
      // Check if there's a default value configured
      if (field.defaultValueType === 'FIELD_REF' && field.defaultValue) {
        // Resolve field reference from source record
        const refValue = resolveFieldRef(field.defaultValue, recordData, sourceRecordId);
        if (refValue !== undefined && refValue !== null) {
          initialData[field.api_name] = refValue;
        } else {
          initialData[field.api_name] = '';
        }
      } else if (field.defaultValueType === 'STATIC' && field.defaultValue) {
        initialData[field.api_name] = field.defaultValue;
      } else if (field.defaultValue) {
        initialData[field.api_name] = field.defaultValue;
      } else {
        initialData[field.api_name] = '';
      }
    });
    
    setFormData(initialData);
    setFormInitialized(true);
  }, [displayFields, loadingFields, recordData, sourceRecordId, formInitialized]);

  // Resolve field reference (e.g., "Record.Id", "Record.Name")
  const resolveFieldRef = (ref, data, recordId) => {
    if (!ref) return undefined;
    
    // Handle special references
    const refLower = ref.toLowerCase();
    if (refLower === 'record.id' || refLower === 'currentrecord.id' || refLower === 'record.series_id') {
      return recordId || data?.series_id || data?.id;
    }
    
    // Parse reference (e.g., "Record.Name" -> "Name")
    const parts = ref.split('.');
    if (parts.length >= 2) {
      const fieldName = parts[parts.length - 1];
      // Check in data directly
      if (data && data[fieldName] !== undefined) return data[fieldName];
      // Check in nested data object (CRM records have data.data structure)
      if (data?.data && data.data[fieldName] !== undefined) return data.data[fieldName];
    }
    
    return undefined;
  };

  const handleChange = (fieldName, value) => {
    setFormData(prev => ({ ...prev, [fieldName]: value }));
    // Clear error when user types
    if (errors[fieldName]) {
      setErrors(prev => ({ ...prev, [fieldName]: null }));
    }
  };

  const validateForm = () => {
    const newErrors = {};
    
    displayFields.forEach(field => {
      if (field.required) {
        const value = formData[field.api_name];
        if (value === undefined || value === null || (typeof value === 'string' && !value.trim())) {
          newErrors[field.api_name] = `${field.label} is required`;
        }
      }
    });
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) return;
    
    setSubmitting(true);
    try {
      await onSubmit(formData);
    } catch (err) {
      // Error handled by parent
    } finally {
      setSubmitting(false);
    }
  };

  // Render field based on type
  const renderField = (field) => {
    const value = formData[field.api_name] ?? '';
    const hasError = errors[field.api_name];
    
    switch (field.type) {
      case 'textarea':
      case 'longtext':
        return (
          <Textarea
            id={field.api_name}
            value={value}
            onChange={(e) => handleChange(field.api_name, e.target.value)}
            className={`mt-1 ${hasError ? 'border-red-500' : ''}`}
            rows={3}
            placeholder={`Enter ${field.label.toLowerCase()}`}
          />
        );
        
      case 'picklist':
      case 'select':
        return (
          <Select
            value={value}
            onValueChange={(val) => handleChange(field.api_name, val)}
          >
            <SelectTrigger className={`mt-1 ${hasError ? 'border-red-500' : ''}`}>
              <SelectValue placeholder={`Select ${field.label.toLowerCase()}`} />
            </SelectTrigger>
            <SelectContent>
              {(field.options || []).map(opt => (
                <SelectItem key={opt} value={opt}>{opt}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
        
      case 'checkbox':
      case 'boolean':
        return (
          <div className="flex items-center gap-2 mt-2">
            <Checkbox
              id={field.api_name}
              checked={value === true || value === 'true'}
              onCheckedChange={(checked) => handleChange(field.api_name, checked)}
            />
            <Label htmlFor={field.api_name} className="text-sm font-normal">
              {field.label}
            </Label>
          </div>
        );
        
      case 'number':
      case 'currency':
      case 'percent':
        return (
          <Input
            id={field.api_name}
            type="number"
            value={value}
            onChange={(e) => handleChange(field.api_name, e.target.value)}
            className={`mt-1 ${hasError ? 'border-red-500' : ''}`}
            placeholder={`Enter ${field.label.toLowerCase()}`}
          />
        );
        
      case 'date':
        return (
          <Input
            id={field.api_name}
            type="date"
            value={value}
            onChange={(e) => handleChange(field.api_name, e.target.value)}
            className={`mt-1 ${hasError ? 'border-red-500' : ''}`}
          />
        );
        
      case 'datetime':
        return (
          <Input
            id={field.api_name}
            type="datetime-local"
            value={value}
            onChange={(e) => handleChange(field.api_name, e.target.value)}
            className={`mt-1 ${hasError ? 'border-red-500' : ''}`}
          />
        );
        
      case 'email':
        return (
          <Input
            id={field.api_name}
            type="email"
            value={value}
            onChange={(e) => handleChange(field.api_name, e.target.value)}
            className={`mt-1 ${hasError ? 'border-red-500' : ''}`}
            placeholder={`Enter ${field.label.toLowerCase()}`}
          />
        );
        
      case 'phone':
        return (
          <Input
            id={field.api_name}
            type="tel"
            value={value}
            onChange={(e) => handleChange(field.api_name, e.target.value)}
            className={`mt-1 ${hasError ? 'border-red-500' : ''}`}
            placeholder={`Enter ${field.label.toLowerCase()}`}
          />
        );
        
      case 'url':
        return (
          <Input
            id={field.api_name}
            type="url"
            value={value}
            onChange={(e) => handleChange(field.api_name, e.target.value)}
            className={`mt-1 ${hasError ? 'border-red-500' : ''}`}
            placeholder="https://"
          />
        );
        
      case 'lookup':
        // For lookup fields, show as text input for now (could be enhanced with a lookup modal)
        return (
          <Input
            id={field.api_name}
            value={value}
            onChange={(e) => handleChange(field.api_name, e.target.value)}
            className={`mt-1 ${hasError ? 'border-red-500' : ''}`}
            placeholder={field.related_object ? `Enter ${field.related_object} ID` : `Enter ID`}
          />
        );
        
      // Default: text input
      default:
        // Check if field name suggests textarea
        if (isLongTextField(field.api_name)) {
          return (
            <Textarea
              key={`${field.api_name}-${value}`}
              id={field.api_name}
              value={value}
              onChange={(e) => handleChange(field.api_name, e.target.value)}
              className={`mt-1 ${hasError ? 'border-red-500' : ''}`}
              rows={3}
              placeholder={`Enter ${field.label.toLowerCase()}`}
            />
          );
        }
        
        return (
          <Input
            key={`${field.api_name}-${value}`}
            id={field.api_name}
            value={value}
            onChange={(e) => handleChange(field.api_name, e.target.value)}
            className={`mt-1 ${hasError ? 'border-red-500' : ''}`}
            placeholder={`Enter ${field.label.toLowerCase()}`}
          />
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-[#0176d3] to-[#1589ee]">
          <h2 className="text-lg font-semibold text-white">{modalTitle}</h2>
          <Button variant="ghost" size="sm" onClick={onClose} className="text-white hover:bg-white/20">
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Content */}
        {loadingFields || (!formInitialized && displayFields.length > 0) ? (
          <div className="flex items-center justify-center p-12">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            <span className="ml-3 text-gray-600">Loading form fields...</span>
          </div>
        ) : fieldError ? (
          <div className="p-6">
            <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle className="h-5 w-5 text-red-600" />
              <div>
                <p className="font-medium text-red-800">{fieldError}</p>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={onClose}
                  className="mt-2"
                >
                  Close
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
            <div className="p-6 space-y-4">
              {displayFields.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <p className="text-lg">No fields configured</p>
                  <p className="text-sm mt-2">
                    Configure fields for this action in Object Manager → Actions
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {displayFields.map((field) => {
                    const fieldValue = formData[field.api_name] || '';
                    return (
                      <div 
                        key={field.api_name} 
                        className={isLongTextField(field.api_name) ? 'md:col-span-2' : ''}
                      >
                        <Label htmlFor={field.api_name} className="text-sm font-medium text-gray-700">
                          {field.label}
                          {field.required && <span className="text-red-500 ml-1">*</span>}
                        </Label>
                        <input
                          id={field.api_name}
                          type="text"
                          value={fieldValue}
                          onChange={(e) => handleChange(field.api_name, e.target.value)}
                          className="mt-1 flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          placeholder={`Enter ${field.label.toLowerCase()}`}
                        />
                        {errors[field.api_name] && (
                          <p className="text-red-500 text-sm mt-1">{errors[field.api_name]}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
              <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting || displayFields.length === 0}>
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Save
                  </>
                )}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

// Helper to format field API names as labels
const formatFieldLabel = (apiName) => {
  return apiName
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
};

// Helper to determine if field should be a textarea
const isLongTextField = (fieldName) => {
  const longFields = ['description', 'notes', 'comments', 'body', 'content', 'message', 'address', 'street'];
  return longFields.some(f => fieldName.toLowerCase().includes(f));
};

export default ActionExecutionModal;
