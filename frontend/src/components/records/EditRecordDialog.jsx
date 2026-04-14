/**
 * EditRecordDialog - Enhanced Lightning Style Edit Record Modal
 * Extracted from App.js for better maintainability
 */
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';

// UI Components
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { Switch } from '../../components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '../../components/ui/dialog';

// Icons
import { Edit, Lock } from 'lucide-react';

// Hooks and utilities
import { useDependentPicklistRuntime } from '../../modules/dependent-picklists';
import { useFieldSecurity } from '../../contexts/FieldSecurityContext';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

/**
 * EditRecordDialog Component
 * Enhanced Lightning Style dialog for editing existing records with:
 * - Dependent picklist support with cascading
 * - Record type picklist filtering
 * - Field-level validation errors
 */
const EditRecordDialog = ({ object, record, onSuccess, trigger, defaultOpen = false, onOpenChange }) => {
  const [open, setOpen] = useState(defaultOpen);
  const [formData, setFormData] = useState(record?.data || {});
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [recordTypeConfig, setRecordTypeConfig] = useState(null);
  
  // Field-Level Security Hook
  const { isFieldHidden, isFieldReadOnly } = useFieldSecurity();

  // Sync with defaultOpen prop changes
  useEffect(() => {
    setOpen(defaultOpen);
  }, [defaultOpen]);

  // Fetch record type config when dialog opens
  useEffect(() => {
    const fetchRecordTypeConfig = async () => {
      if (record?.record_type_id && object?.object_name) {
        try {
          const token = localStorage.getItem('token');
          const response = await axios.get(
            `${API}/api/record-types-config/${object.object_name}`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          const recordTypes = response.data || [];
          const config = recordTypes.find(rt => rt.id === record.record_type_id);
          setRecordTypeConfig(config);
        } catch (err) {
          console.warn('Failed to fetch record type config:', err);
        }
      }
    };
    
    if (open) {
      fetchRecordTypeConfig();
    }
  }, [open, record?.record_type_id, object?.object_name]);

  // Dependent Picklist Runtime Hook
  const {
    isDependentField,
    isControllingField,
    getControllingField,
    getFilteredOptions,
    getFieldsToReset,
    getDependencyChain,
    isChainSatisfied,
    getFirstMissingInChain,
    dependencies,
    initialized: dependenciesInitialized
  } = useDependentPicklistRuntime(
    object?.object_name, 
    record?.record_type_id, 
    formData
  );

  // Handle field value changes with cascading dependent picklist logic
  const handleFieldChange = (fieldKey, newValue) => {
    let updatedFormData = { ...formData, [fieldKey]: newValue };
    
    // If this is a controlling field, check if dependent values need to be reset (CASCADING)
    if (isControllingField(fieldKey)) {
      const fieldsToReset = getFieldsToReset(fieldKey, newValue);
      fieldsToReset.forEach(field => {
        updatedFormData[field] = ''; // Reset dependent field (and all fields in cascade chain)
      });
    }
    
    setFormData(updatedFormData);
  };

  useEffect(() => {
    if (record) {
      setFormData(record.data);
    }
  }, [record]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setFieldErrors({}); // Clear previous field errors

    try {
      await axios.put(`${API}/objects/${object.object_name}/records/${record.id}`, {
        data: formData
      });
      toast.success('Record updated successfully');
      setOpen(false);
      setFieldErrors({});
      onSuccess();
    } catch (error) {
      // Handle validation errors with field-level support
      const errorDetail = error.response?.data?.detail;
      
      if (errorDetail && typeof errorDetail === 'object') {
        // New structured error format
        const errorMessage = errorDetail.message || 'Validation failed';
        const errorLocation = errorDetail.error_location || 'page';
        const errorField = errorDetail.error_field;
        
        if (errorLocation === 'field' && errorField) {
          // Show error on specific field
          setFieldErrors({ [errorField]: errorMessage });
        } else {
          // Show toast for page-level error
          toast.error(errorMessage);
        }
      } else if (typeof errorDetail === 'string') {
        // Legacy string error format
        toast.error(errorDetail);
      } else {
        // Fallback
        toast.error('Failed to update record');
      }
    } finally {
      setLoading(false);
    }
  };

  const renderField = (fieldKey, field) => {
    const value = formData[fieldKey] || '';

    // Handle capitalized type names from custom fields
    const fieldType = (field.type || '').toLowerCase();

    switch (fieldType) {
      case 'select':
      case 'picklist': {
        let allOptions = field.options || [];
        
        // RECORD TYPE PICKLIST FILTER: Filter options based on record type's picklist_value_filters
        if (recordTypeConfig?.picklist_value_filters?.[fieldKey]?.length > 0) {
          const allowedValues = recordTypeConfig.picklist_value_filters[fieldKey];
          allOptions = allOptions.filter(opt => allowedValues.includes(opt));
        }
        
        // Get filtered options if this is a dependent field
        const displayOptions = isDependentField(fieldKey) && dependenciesInitialized
          ? getFilteredOptions(fieldKey, allOptions)
          : allOptions;
        
        // CASCADING SUPPORT: Check full dependency chain
        const isDependent = isDependentField(fieldKey);
        const controllingFieldApi = isDependent ? getControllingField(fieldKey) : null;
        const controllingValue = controllingFieldApi ? formData[controllingFieldApi] : null;
        
        // Get the first missing field in the chain for cascading picklists
        const firstMissingField = isDependent ? getFirstMissingInChain(fieldKey) : null;
        const chainSatisfied = isDependent ? isChainSatisfied(fieldKey) : true;
        
        // Show prompt if dependent but chain is not satisfied
        const showControllingPrompt = isDependent && !chainSatisfied;
        
        // Get label of the first missing field in the chain
        const missingFieldLabel = firstMissingField 
          ? (Object.entries(object?.fields || {}).find(([k]) => k === firstMissingField)?.[1]?.label || firstMissingField)
          : '';
        
        const controllingFieldLabel = controllingFieldApi 
          ? (Object.entries(object?.fields || {}).find(([k]) => k === controllingFieldApi)?.[1]?.label || controllingFieldApi)
          : '';
        
        return (
          <div className="space-y-1">
            <Select
              value={value || undefined}
              onValueChange={(newValue) => handleFieldChange(fieldKey, newValue)}
              disabled={showControllingPrompt}
            >
              <SelectTrigger className={showControllingPrompt ? 'bg-slate-50' : ''}>
                <SelectValue placeholder={
                  showControllingPrompt 
                    ? `Select ${missingFieldLabel} first`
                    : displayOptions.length > 0 
                      ? `Select...` 
                      : 'No options available'
                } />
              </SelectTrigger>
              <SelectContent>
                {showControllingPrompt ? (
                  <div className="p-2 text-sm text-slate-500 text-center">
                    Please select a {missingFieldLabel} first
                  </div>
                ) : displayOptions.length === 0 ? (
                  <div className="p-2 text-sm text-slate-500 text-center">
                    No options available
                  </div>
                ) : (
                  displayOptions.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            {isDependent && controllingValue && displayOptions.length === 0 && allOptions.length > 0 && (
              <p className="text-xs text-amber-600">
                No options available for selected {controllingFieldLabel}
              </p>
            )}
          </div>
        );
      }
      case 'boolean':
        return (
          <div className="flex items-center space-x-2 mt-2">
            <Switch
              id={fieldKey}
              checked={value === true || value === 'true'}
              onCheckedChange={(checked) => setFormData({ ...formData, [fieldKey]: checked })}
            />
            <Label htmlFor={fieldKey} className="cursor-pointer">
              {field.label}
            </Label>
          </div>
        );
      case 'textarea':
        return (
          <Textarea
            value={value}
            onChange={(e) => setFormData({ ...formData, [fieldKey]: e.target.value })}
            required={field.required}
            rows={3}
          />
        );
      case 'number':
        return (
          <Input
            type="number"
            value={value}
            onChange={(e) => setFormData({ ...formData, [fieldKey]: e.target.value })}
            required={field.required}
          />
        );
      case 'date':
        return (
          <Input
            type="date"
            value={value}
            onChange={(e) => setFormData({ ...formData, [fieldKey]: e.target.value })}
            required={field.required}
          />
        );
      case 'datetime':
        return (
          <Input
            type="datetime-local"
            value={value}
            onChange={(e) => setFormData({ ...formData, [fieldKey]: e.target.value })}
            required={field.required}
          />
        );
      default:
        return (
          <Input
            type={field.type === 'email' ? 'email' : field.type === 'phone' ? 'tel' : 'text'}
            value={value}
            onChange={(e) => setFormData({ ...formData, [fieldKey]: e.target.value })}
            required={field.required}
          />
        );
    }
  };

  // Handle open state change
  const handleOpenChange = (newOpen) => {
    setOpen(newOpen);
    if (onOpenChange) {
      onOpenChange(newOpen);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {/* Only render trigger if not using defaultOpen controlled mode */}
      {!defaultOpen && (
        <DialogTrigger asChild>
          {trigger || (
            <Button variant="ghost" size="sm" data-testid={`edit-record-${record?.id}`} className="h-8 w-8 p-0 text-slate-500 hover:text-indigo-600">
              <Edit className="h-4 w-4" />
            </Button>
          )}
        </DialogTrigger>
      )}
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit {object?.object_label}</DialogTitle>
          <DialogDescription>
            Update the details for this {object?.object_label?.toLowerCase()}.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.entries(object?.fields || {})
              // Filter out hidden fields via FLS
              .filter(([fieldKey]) => !isFieldHidden(object?.object_name, fieldKey))
              .map(([fieldKey, field]) => {
                const isFlsReadOnly = isFieldReadOnly(object?.object_name, fieldKey);
                return (
                  <div key={fieldKey} className={field.type === 'textarea' ? 'md:col-span-2' : ''}>
                    <Label htmlFor={fieldKey} className="text-sm font-medium flex items-center gap-1">
                      {field.label}
                      {field.required && <span className="text-red-500 ml-1">*</span>}
                      {isFlsReadOnly && (
                        <span className="text-amber-600 ml-1" title="Read-only (Field Security)">
                          <Lock className="h-3 w-3 inline" />
                        </span>
                      )}
                    </Label>
                    <div className={`mt-1 ${fieldErrors[fieldKey] ? 'ring-2 ring-red-500 rounded-md' : ''} ${isFlsReadOnly ? 'opacity-60' : ''}`}>
                      {isFlsReadOnly ? (
                        // Render read-only view for FLS restricted fields
                        <div className="p-2 bg-slate-100 rounded border text-sm text-slate-600">
                          {formData[fieldKey] || <span className="italic text-slate-400">—</span>}
                        </div>
                      ) : (
                        renderField(fieldKey, field)
                      )}
                    </div>
                    {/* Field-level validation error */}
                    {fieldErrors[fieldKey] && (
                      <p className="mt-1 text-sm text-red-600 flex items-center gap-1">
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                        {fieldErrors[fieldKey]}
                      </p>
                    )}
                  </div>
                );
              })}
          </div>
          <div className="flex justify-end space-x-2 pt-4 border-t">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading} data-testid="submit-edit-record" className="bg-indigo-600 hover:bg-indigo-700">
              {loading ? 'Updating...' : `Update ${object?.object_label}`}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default EditRecordDialog;
