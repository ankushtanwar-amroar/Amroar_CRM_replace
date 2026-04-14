/**
 * CreateRecordDialog - Enhanced Lightning Style Create Record Modal
 * Extracted from App.js for better maintainability
 * 
 * Phase 2B Enhancement: For Lead and Opportunity, consumes the new layout 
 * resolver endpoint to render forms based on system "new" layouts.
 */
import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';

// UI Components
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import { Textarea } from '../../components/ui/textarea';
import { Switch } from '../../components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../components/ui/dialog';

// Icons
import { Plus, Lock } from 'lucide-react';

// Hooks and utilities
import { useDependentPicklistRuntime } from '../../modules/dependent-picklists';
import { isRelatedField } from '../../components/RelatedRecordDisplay';
import { useFieldSecurity } from '../../contexts/FieldSecurityContext';

// Dynamic Lookup Field - Salesforce-style lookup with search, recent, hover preview
import DynamicLookupField from '../fields/DynamicLookupField';

// Layout service for Phase 2B "New" layouts
import lightningLayoutService from '../../crm_platform/lightning_builder/services/lightningLayoutService';
// Centralized layout resolution service
import { resolveLayoutForContext } from '../../crm_platform/services/layoutResolutionService';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Objects that use the new layout system for create forms
const NEW_LAYOUT_OBJECTS = ['lead', 'opportunity', 'contact', 'account', 'task', 'event', 'emailmessage'];

/**
 * CreateRecordDialog Component
 * Enhanced Lightning Style dialog for creating new records with:
 * - Record type selection
 * - Field visibility based on record type
 * - Dependent picklist support with cascading
 * - Related record selection
 * - Field-level validation errors
 * - Prefilled values support for related record creation
 * - External open control for programmatic triggering
 */
const CreateRecordDialog = ({ 
  object, 
  onSuccess, 
  trigger,
  prefilledValues = {},      // Pre-fill form fields (e.g., { account_id: 'xxx' })
  defaultOpen = false,       // Start with dialog open
  onOpenChange = null,       // Callback when open state changes
  parentContext = null,      // Source context (e.g., { objectName: 'account', recordId: 'xxx' })
}) => {
  const [open, setOpen] = useState(defaultOpen);
  const [showRecordTypeSelector, setShowRecordTypeSelector] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [formData, setFormData] = useState({});
  const [loading, setLoading] = useState(false);
  const [recordTypes, setRecordTypes] = useState([]);
  const [selectedRecordType, setSelectedRecordType] = useState(null);
  const [visibleFields, setVisibleFields] = useState([]);
  const [relatedRecords, setRelatedRecords] = useState([]);
  const [loadingRelated, setLoadingRelated] = useState(false);
  const [selectedRelatedType, setSelectedRelatedType] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  
  // Phase 2B: New layout system state
  const [newLayout, setNewLayout] = useState(null);
  const [layoutSource, setLayoutSource] = useState(null);
  const [loadingLayout, setLoadingLayout] = useState(false);
  
  // Check if this object uses the new layout system
  const usesNewLayout = NEW_LAYOUT_OBJECTS.includes(object?.object_name?.toLowerCase());
  
  // Field-Level Security Hook
  const { isFieldHidden, isFieldReadOnly } = useFieldSecurity();

  // Handle external open state changes
  useEffect(() => {
    if (defaultOpen !== open) {
      setOpen(defaultOpen);
    }
  }, [defaultOpen]);

  // Notify parent of open state changes
  const handleOpenChange = (newOpen) => {
    setOpen(newOpen);
    onOpenChange?.(newOpen);
    
    // Reset state when closing
    if (!newOpen) {
      setShowRecordTypeSelector(false);
      setShowCreateForm(false);
      setFormData({});
      setSelectedRecordType(null);
      setFieldErrors({});
      setNewLayout(null);
    }
  };

  // Initialize form data with prefilled values
  useEffect(() => {
    if (open && Object.keys(prefilledValues).length > 0) {
      setFormData(prev => ({ ...prev, ...prefilledValues }));
      
      // Auto-set selectedRelatedType from prefilled values for polymorphic related_to_id field
      // This ensures the lookup field knows which object type to resolve
      if (prefilledValues.related_to_type) {
        setSelectedRelatedType(prefilledValues.related_to_type);
      }
    }
  }, [open, prefilledValues]);

  // Dependent Picklist Runtime Hook (with cascading support)
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
    selectedRecordType, 
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

  // When trigger is clicked, first check for record types
  const handleOpenDialog = () => {
    handleOpenChange(true);
    fetchRecordTypes();
  };

  // Fetch record types and decide flow
  useEffect(() => {
    if (open && object && object.object_name) {
      console.log(`Dialog opened for ${object.object_name}, fetching record types...`);
      fetchRecordTypesAndDecide();
    }
  }, [open, object]);

  const updateVisibleFields = (recordType) => {
    if (!recordType || !recordType.field_visibility) {
      // No visibility config, show all fields
      setVisibleFields(Object.keys(object.fields));
      return;
    }

    const visible = [];
    Object.keys(object.fields).forEach(fieldName => {
      const field = object.fields[fieldName];
      // Required fields always visible
      if (field.required) {
        visible.push(fieldName);
      } 
      // Check record type visibility config
      else if (recordType.field_visibility[fieldName] !== false) {
        visible.push(fieldName);
      }
    });
    
    setVisibleFields(visible);
  };

  const handleRecordTypeChange = (recordTypeId) => {
    setSelectedRecordType(recordTypeId);
    const selected = recordTypes.find(rt => rt.id === recordTypeId);
    if (selected) {
      updateVisibleFields(selected);
    }
  };

  useEffect(() => {
    if (open && object) {
      fetchRecordTypes();
    }
  }, [open, object]);

  // Fetch related records when related type changes
  useEffect(() => {
    if (selectedRelatedType) {
      fetchRelatedRecords(selectedRelatedType);
    }
  }, [selectedRelatedType]);

  // Auto-load related records for specific related field types
  useEffect(() => {
    if (open && object && object.fields) {
      // Check for specific related fields and auto-load
      Object.keys(object.fields).forEach(fieldKey => {
        if (fieldKey === 'lead_id' && !selectedRelatedType) {
          setSelectedRelatedType('lead');
        } else if (fieldKey === 'contact_id' && !selectedRelatedType) {
          setSelectedRelatedType('contact');
        } else if (fieldKey === 'account_id' && !selectedRelatedType) {
          setSelectedRelatedType('account');
        } else if (fieldKey === 'opportunity_id' && !selectedRelatedType) {
          setSelectedRelatedType('opportunity');
        }
      });
    }
  }, [open, object]);

  // Phase 2B: Fetch "new" layout using CENTRALIZED resolution
  // Re-fetches when selectedRecordType changes to get record-type-specific layout
  useEffect(() => {
    const fetchNewLayout = async () => {
      if (!open || !usesNewLayout || !object?.object_name) return;
      
      // Clear previous layout state to prevent stale data
      setNewLayout(null);
      setLayoutSource(null);
      setLoadingLayout(true);
      
      try {
        const token = localStorage.getItem('token');
        if (!token) {
          console.warn('No token for layout fetch');
          setLoadingLayout(false);
          return;
        }
        
        console.log(`📄 Fetching "new" layout for ${object.object_name} (recordType: ${selectedRecordType || 'none'})`);
        
        // Use centralized layout resolution service
        // This handles: page assignment resolution → layout fetch → fallback to default
        const result = await resolveLayoutForContext(
          object.object_name,
          'new',
          selectedRecordType, // Pass record type for record-type-specific layouts
          token
        );
        
        console.log(`📄 Layout resolved for ${object.object_name}:`, {
          source: result.source,
          pageId: result.pageId,
          hasLayout: !!result.layout,
          layoutName: result.layout?.layout_name
        });
        
        if (result.layout) {
          // Verify the layout is for the correct object
          const layoutObjectName = result.layout.object_name?.toLowerCase();
          const targetObjectName = object.object_name.toLowerCase();
          
          if (layoutObjectName === targetObjectName) {
            setNewLayout(result.layout);
            setLayoutSource(result.source);
            
            // Apply default values from layout
            if (result.layout.default_values) {
              setFormData(prev => ({
                ...result.layout.default_values,
                ...prev // Keep any already-set values
              }));
            }
          } else {
            console.warn(`⚠️ Layout object mismatch: expected ${targetObjectName}, got ${layoutObjectName}`);
            setNewLayout(null);
          }
        } else {
          console.log(`ℹ️ No layout found for ${object.object_name}, using legacy rendering`);
          setNewLayout(null);
        }
      } catch (error) {
        console.error('Error fetching new layout:', error);
        // Fall back to legacy behavior (no layout)
        setNewLayout(null);
      } finally {
        setLoadingLayout(false);
      }
    };
    
    fetchNewLayout();
  }, [open, object?.object_name, usesNewLayout, selectedRecordType]); // Added selectedRecordType dependency

  const fetchRecordTypesAndDecide = async () => {
    try {
      console.log('Fetching record types for object:', object?.object_name);
      
      const token = localStorage.getItem('token');
      if (!token || !object || !object.object_name) {
        // No record types, go straight to form
        setShowCreateForm(true);
        return;
      }
      
      const headers = { Authorization: `Bearer ${token}` };
      const url = `${API}/record-types-config/${object.object_name}`;
      
      const response = await axios.get(url, { headers });
      const types = response.data || [];
      
      console.log(`✅ Fetched ${types.length} record types:`, types);
      
      setRecordTypes(types);
      
      const activeTypes = types.filter(rt => rt.is_active);
      
      if (activeTypes.length > 1) {
        // Multiple record types: Show selector first
        setShowRecordTypeSelector(true);
      } else if (activeTypes.length === 1) {
        // Only one record type: Auto-select and go to form
        handleRecordTypeSelected(activeTypes[0]);
      } else {
        // No record types: Go straight to form
        setShowCreateForm(true);
      }
    } catch (error) {
      console.error('❌ Error fetching record types:', error);
      // On error, go straight to form (show all fields)
      setShowCreateForm(true);
    }
  };

  const handleRecordTypeSelected = (recordType) => {
    console.log(`Record type selected: ${recordType.type_name}`);
    setSelectedRecordType(recordType.id);
    
    // Calculate visible fields
    const visible = [];
    Object.keys(object.fields || {}).forEach(fieldName => {
      const field = object.fields[fieldName];
      if (field.required) {
        visible.push(fieldName);
      } else if (recordType.field_visibility && recordType.field_visibility[fieldName] !== false) {
        visible.push(fieldName);
      } else if (!recordType.field_visibility) {
        visible.push(fieldName);
      }
    });
    
    setVisibleFields(visible);
    setShowRecordTypeSelector(false);
    setShowCreateForm(true);
  };

  const fetchRecordTypes = async () => {
    try {
      console.log('Fetching record types for object:', object?.object_name);
      
      const token = localStorage.getItem('token');
      if (!token) {
        console.error('No auth token found');
        return;
      }
      
      if (!object || !object.object_name) {
        console.error('Object or object_name is undefined');
        return;
      }
      
      const headers = { Authorization: `Bearer ${token}` };
      const url = `${API}/record-types-config/${object.object_name}`;
      
      console.log('Calling API:', url);
      
      const response = await axios.get(url, { headers });
      const types = response.data || [];
      
      console.log(`✅ Fetched ${types.length} record types:`, types);
      
      setRecordTypes(types);
      
      // Auto-select first active record type
      const firstActive = types.find(rt => rt.is_active);
      if (firstActive) {
        console.log(`✅ Auto-selecting: ${firstActive.type_name} (ID: ${firstActive.id})`);
        setSelectedRecordType(firstActive.id);
      } else if (types.length > 0) {
        console.log(`Auto-selecting first type: ${types[0].type_name}`);
        setSelectedRecordType(types[0].id);
      } else {
        console.log('⚠️  No record types found');
      }
    } catch (error) {
      console.error('❌ Error fetching record types:', error);
      console.error('Error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status
      });
      setRecordTypes([]);
    }
  };

  const fetchRelatedRecords = async (relatedType) => {
    setLoadingRelated(true);
    setRelatedRecords([]); // Clear previous records
    try {
      const token = localStorage.getItem('token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};

      const response = await axios.get(`${API}/objects/${relatedType}/records?paginate=false`, { headers });
      const records = response.data.records || response.data || [];
      setRelatedRecords(records);
      console.log(`Loaded ${records.length} ${relatedType} records`);
    } catch (error) {
      console.error(`Error fetching ${relatedType} records:`, error);
      toast.error(`Failed to load ${relatedType} records`);
      setRelatedRecords([]);
    } finally {
      setLoadingRelated(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setFieldErrors({}); // Clear previous field errors

    try {
      const response = await axios.post(`${API}/objects/${object.object_name}/records`, {
        data: formData,
        record_type_id: selectedRecordType
      });
      
      const createdRecord = response.data;
      toast.success('Record created successfully');
      handleOpenChange(false);
      setFormData({});
      setSelectedRecordType(null);
      setFieldErrors({});
      
      // Pass the created record to onSuccess callback
      onSuccess?.(createdRecord);
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
        toast.error('Failed to create record');
      }
    } finally {
      setLoading(false);
    }
  };

  const renderField = (fieldKey, field) => {
    const value = formData[fieldKey] || '';

    // Handle capitalized type names from custom fields
    const fieldType = (field.type || '').toLowerCase();

    // IMPORTANT: Check field type FIRST before checking if it's a related field
    // This prevents select fields like "lead_source" from being treated as related fields

    // Handle select/picklist fields first
    if (fieldType === 'select' || fieldType === 'picklist') {
      let allOptions = field.options || [];
      
      // RECORD TYPE PICKLIST FILTER: Filter options based on record type's picklist_value_filters
      const currentRecordType = recordTypes.find(rt => rt.id === selectedRecordType);
      if (currentRecordType?.picklist_value_filters?.[fieldKey]?.length > 0) {
        const allowedValues = currentRecordType.picklist_value_filters[fieldKey];
        allOptions = allOptions.filter(opt => allowedValues.includes(opt));
      }
      
      // CASCADING SUPPORT: Check full dependency chain
      const isDependent = isDependentField(fieldKey);
      const controllingFieldApi = isDependent ? getControllingField(fieldKey) : null;
      const controllingValue = controllingFieldApi ? formData[controllingFieldApi] : null;
      
      // Get filtered options if this is a dependent field
      const displayOptions = isDependent && dependenciesInitialized
        ? getFilteredOptions(fieldKey, allOptions)
        : allOptions;
      
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
                    ? `Select ${field.label.toLowerCase()}` 
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

    // Special handling for related fields (related_to, related_to_id, lead_id, contact_id, etc.)
    // Now using DynamicLookupField for Salesforce-style experience
    if (isRelatedField(fieldKey)) {
      // Determine the target object type
      let targetObjectType = null;
      
      // Check if this is a polymorphic related_to field (related_to or related_to_id)
      const isPolymorphicRelatedTo = fieldKey === 'related_to' || fieldKey === 'related_to_id';
      
      if (isPolymorphicRelatedTo) {
        // For polymorphic fields, use related_to_type from formData or selectedRelatedType
        targetObjectType = formData.related_to_type || selectedRelatedType;
      } else if (fieldKey === 'assigned_to' || fieldKey === 'owner_id' || fieldKey === 'created_by' || fieldKey === 'modified_by') {
        // User lookup fields should always target 'user'
        targetObjectType = 'user';
      } else if (field?.lookup_object || field?.related_object || field?.reference_to) {
        // PRIORITY: Use explicit lookup_object, related_object, or reference_to from field definition
        targetObjectType = field.lookup_object || field.related_object || field.reference_to;
      } else if (fieldKey.endsWith('_id')) {
        // FALLBACK: Extract object type from field name (e.g., account_id -> account)
        targetObjectType = fieldKey.replace('_id', '');
      }
      
      return (
        <div className="space-y-2">
          {/* Related Type Selector for polymorphic related_to/related_to_id field */}
          {isPolymorphicRelatedTo && (
            <Select
              value={formData.related_to_type || selectedRelatedType || ''}
              onValueChange={(type) => {
                setSelectedRelatedType(type);
                // Update formData with the new type, but preserve the record ID if type matches
                setFormData({ 
                  ...formData, 
                  [fieldKey]: formData.related_to_type === type ? formData[fieldKey] : '', 
                  related_to_type: type 
                });
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select related type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="lead">Lead</SelectItem>
                <SelectItem value="contact">Contact</SelectItem>
                <SelectItem value="account">Account</SelectItem>
                <SelectItem value="opportunity">Opportunity</SelectItem>
              </SelectContent>
            </Select>
          )}

          {/* Dynamic Lookup Field - Salesforce-style */}
          {/* Uses CreateRecordService automatically for +New option */}
          {(targetObjectType || !isPolymorphicRelatedTo) && (
            <DynamicLookupField
              value={value}
              onChange={(recordId, record) => {
                setFormData({ ...formData, [fieldKey]: recordId });
              }}
              objectType={targetObjectType}
              sourceObject={object?.object_name}
              fieldName={fieldKey}
              label={field.label}
              placeholder={`Search ${field.label}...`}
              required={field.required}
              allowCreate={true}
              showPreview={true}
            />
          )}
        </div>
      );
    }

    switch (fieldType) {
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
            placeholder={field.label}
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
            placeholder={field.label}
            required={field.required}
          />
        );
      case 'currency':
        return (
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">{field.currency_symbol || '$'}</span>
            <Input
              type="number"
              step="0.01"
              value={value}
              onChange={(e) => setFormData({ ...formData, [fieldKey]: e.target.value })}
              placeholder="0.00"
              required={field.required}
              className="pl-7"
            />
          </div>
        );
      case 'percent':
        return (
          <div className="relative">
            <Input
              type="number"
              step="0.01"
              value={value}
              onChange={(e) => setFormData({ ...formData, [fieldKey]: e.target.value })}
              placeholder="0"
              required={field.required}
              className="pr-8"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500">%</span>
          </div>
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
      case 'checkbox':
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
      case 'url':
        return (
          <Input
            type="url"
            value={value}
            onChange={(e) => setFormData({ ...formData, [fieldKey]: e.target.value })}
            placeholder="https://example.com"
            required={field.required}
          />
        );
      case 'email':
        return (
          <Input
            type="email"
            value={value}
            onChange={(e) => setFormData({ ...formData, [fieldKey]: e.target.value })}
            placeholder="email@example.com"
            required={field.required}
          />
        );
      case 'phone':
        return (
          <Input
            type="tel"
            value={value}
            onChange={(e) => setFormData({ ...formData, [fieldKey]: e.target.value })}
            placeholder="+1 (555) 123-4567"
            required={field.required}
          />
        );
      case 'geolocation':
        return (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs text-slate-500">Latitude</Label>
              <Input
                type="number"
                step="0.000001"
                value={formData[`${fieldKey}_lat`] || ''}
                onChange={(e) => setFormData({ ...formData, [`${fieldKey}_lat`]: e.target.value })}
                placeholder="e.g., 37.7749"
              />
            </div>
            <div>
              <Label className="text-xs text-slate-500">Longitude</Label>
              <Input
                type="number"
                step="0.000001"
                value={formData[`${fieldKey}_lng`] || ''}
                onChange={(e) => setFormData({ ...formData, [`${fieldKey}_lng`]: e.target.value })}
                placeholder="e.g., -122.4194"
              />
            </div>
          </div>
        );
      case 'formula':
        return (
          <div className="p-2 bg-slate-100 rounded border text-sm text-slate-600 italic">
            Formula field (calculated automatically)
          </div>
        );
      case 'lookup':
        // Lookup field type - use DynamicLookupField
        // Uses CreateRecordService automatically for +New option
        const lookupTarget = field?.lookup_object || field?.related_object || field?.target_object;
        return (
          <DynamicLookupField
            value={value}
            onChange={(recordId, record) => {
              setFormData({ ...formData, [fieldKey]: recordId });
            }}
            objectType={lookupTarget}
            sourceObject={object?.object_name}
            fieldName={fieldKey}
            label={field.label}
            placeholder={`Search ${field.label}...`}
            required={field.required}
            allowCreate={true}
            showPreview={true}
          />
        );
      default:
        return (
          <Input
            type={field.type === 'email' ? 'email' : field.type === 'phone' ? 'tel' : 'text'}
            value={value}
            onChange={(e) => setFormData({ ...formData, [fieldKey]: e.target.value })}
            placeholder={field.label}
            required={field.required}
          />
        );
    }
  };

  return (
    <>
      {/* Single Trigger Button (Outside Dialogs) */}
      {trigger ? (
        // Clone the trigger element and add onClick handler
        React.cloneElement(trigger, {
          onClick: (e) => {
            // Call original onClick if exists
            if (trigger.props.onClick) {
              trigger.props.onClick(e);
            }
            handleOpenDialog();
          }
        })
      ) : (
        <Button 
          onClick={handleOpenDialog}
          data-testid={`create-${object.object_name}`} 
          className="bg-indigo-600 hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4 mr-2" />
          New {object.object_label}
        </Button>
      )}

      {/* Step 1: Record Type Selector Modal - Salesforce-style - CENTERED */}
      <Dialog open={open && showRecordTypeSelector} onOpenChange={(isOpen) => {
        if (!isOpen) {
          handleOpenChange(false);
          setShowRecordTypeSelector(false);
        }
      }}>
        <DialogContent className="sm:max-w-lg p-0 overflow-hidden">
          {/* Header - Salesforce blue style */}
          <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-5 py-4">
            <DialogTitle className="text-lg font-semibold text-white flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              New {object.object_label}
            </DialogTitle>
            <DialogDescription className="text-blue-100 mt-1 text-sm">
              Select a record type to continue
            </DialogDescription>
          </div>
          
          {/* Content */}
          <div className="p-4">
            <div className="mb-3">
              <h3 className="text-xs font-medium text-slate-700 uppercase tracking-wider">
                Available Record Types
              </h3>
            </div>
            
            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
              {recordTypes.filter(rt => rt.is_active).map((rt, index) => (
                <div
                  key={rt.id}
                  onClick={() => handleRecordTypeSelected(rt)}
                  className="group relative p-3 border-2 rounded-lg cursor-pointer transition-all duration-200 hover:border-blue-500 hover:bg-blue-50/50"
                >
                  <div className="flex items-center gap-3">
                    {/* Icon */}
                    <div className="flex-shrink-0 w-9 h-9 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
                      <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    
                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-semibold text-slate-900 group-hover:text-blue-700 transition-colors">
                        {rt.type_name}
                      </h4>
                      {rt.description && (
                        <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{rt.description}</p>
                      )}
                    </div>
                    
                    {/* Arrow */}
                    <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          
          {/* Footer */}
          <div className="bg-slate-50 px-4 py-3 border-t flex justify-end">
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => { handleOpenChange(false); setShowRecordTypeSelector(false); }}
              className="text-slate-600"
            >
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Step 2: Create Form Modal */}
      <Dialog open={open && showCreateForm} onOpenChange={(isOpen) => {
        if (!isOpen) {
          handleOpenChange(false);
          setShowCreateForm(false);
          setSelectedRecordType(null);
          setFormData({});
          setNewLayout(null);
          setLayoutSource(null);
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader className="flex flex-row items-start justify-between">
          <div>
            <DialogTitle>Create New {object.object_label}</DialogTitle>
            <DialogDescription>
              Fill in the details to create a new {object.object_label.toLowerCase()}.
            </DialogDescription>
          </div>
          {/* Record Type Display - Read-only badge in header */}
          {selectedRecordType && recordTypes.length > 0 && (
            <div className="flex items-center gap-2 bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-200">
              <span className="text-xs text-blue-600 font-medium">Record Type:</span>
              <span className="text-sm font-semibold text-blue-800">
                {recordTypes.find(rt => rt.id === selectedRecordType)?.type_name || 'Default'}
              </span>
            </div>
          )}
        </DialogHeader>
        
        {/* Loading state while fetching layout */}
        {loadingLayout && usesNewLayout && (
          <div className="flex items-center justify-center py-8">
            <div className="flex items-center gap-3 text-slate-500">
              <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span className="text-sm">Loading form layout...</span>
            </div>
          </div>
        )}
        
        {/* Form content - only show when not loading layout */}
        {(!loadingLayout || !usesNewLayout) && (
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Phase 2B: Layout-based rendering for Lead/Opportunity */}
          {usesNewLayout && newLayout?.sections ? (
            <div className="space-y-6">
              {/* DEV MODE: Layout Validation Warning */}
              {process.env.NODE_ENV === 'development' && (() => {
                const layoutFieldCount = newLayout.sections.reduce((acc, s) => acc + (s.fields?.length || 0), 0);
                const renderedFields = newLayout.sections.flatMap(s => 
                  (s.fields || []).filter(f => object.fields[f])
                );
                const skippedFields = newLayout.sections.flatMap(s =>
                  (s.fields || []).filter(f => !object.fields[f])
                );
                if (skippedFields.length > 0) {
                  console.warn(`[CreateRecordDialog] Layout/Schema mismatch for ${object.object_name}:`,
                    `\n  Layout defines ${layoutFieldCount} fields`,
                    `\n  Rendering ${renderedFields.length} fields`,
                    `\n  Skipped fields (not in schema): ${skippedFields.join(', ')}`
                  );
                }
                return null;
              })()}
              {newLayout.sections.map((section, sectionIdx) => (
                <div key={sectionIdx} className="space-y-3">
                  {/* Section Header */}
                  <h3 className="text-sm font-semibold text-slate-700 border-b pb-2 flex items-center">
                    {section.name}
                    <span className="ml-2 text-xs text-slate-400 font-normal">
                      ({section.columns || 2} column{(section.columns || 2) > 1 ? 's' : ''})
                    </span>
                  </h3>
                  {/* Section Fields in grid - Default to 2 columns if not specified */}
                  <div className={`grid gap-4 ${(section.columns === 1) ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2'}`}>
                    {(section.fields || [])
                      .filter(fieldKey => {
                        // Field must exist in object schema
                        if (!object.fields[fieldKey]) {
                          // Log in dev mode for debugging
                          if (process.env.NODE_ENV === 'development') {
                            console.debug(`[CreateRecordDialog] Skipping field '${fieldKey}' - not in ${object.object_name} schema`);
                          }
                          return false;
                        }
                        
                        // FLS: Skip hidden fields
                        if (isFieldHidden(object.object_name, fieldKey)) {
                          return false;
                        }
                        
                        // Special handling for account_id when creating from Account context
                        // Hide account_id ONLY if it's auto-populated from parent account via prefilledValues
                        // NOT when user manually selects it from the lookup
                        if (fieldKey === 'account_id' && prefilledValues?.account_id && formData.account_id === prefilledValues.account_id) {
                          return false; // Hide when auto-populated from context
                        }
                        
                        return true;
                      })
                      .map(fieldKey => {
                        const field = object.fields[fieldKey];
                        const isRequired = newLayout.required_fields?.includes(fieldKey) || field.required;
                        const isFlsReadOnly = isFieldReadOnly(object.object_name, fieldKey);
                        return (
                          <div key={fieldKey} className={field.type === 'textarea' || field.type === 'Textarea' ? 'md:col-span-2' : ''}>
                            <Label htmlFor={fieldKey} className="text-sm font-medium flex items-center">
                              {field.label}
                              {isRequired && <span className="text-red-500 ml-1">*</span>}
                              {field.is_custom && (
                                <Badge variant="secondary" className="ml-2 text-xs">Custom</Badge>
                              )}
                              {isFlsReadOnly && (
                                <span className="text-amber-600 ml-1" title="Read-only (Field Security)">
                                  <Lock className="h-3 w-3 inline" />
                                </span>
                              )}
                            </Label>
                            <div className={`mt-1 ${fieldErrors[fieldKey] ? 'ring-2 ring-red-500 rounded-md' : ''} ${isFlsReadOnly ? 'opacity-60' : ''}`}>
                              {isFlsReadOnly ? (
                                <div className="p-2 bg-slate-100 rounded border text-sm text-slate-600 italic">
                                  Read-only field
                                </div>
                              ) : (
                                renderField(fieldKey, field)
                              )}
                            </div>
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
                </div>
              ))}
            </div>
          ) : (
            /* Legacy rendering: All fields in grid */
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.entries(object.fields)
                .filter(([fieldKey]) => {
                  // Skip system hidden fields
                  if (fieldKey === "related_type" || fieldKey === "mobile_phone") return false;
                  
                  // FLS: Skip hidden fields
                  if (isFieldHidden(object.object_name, fieldKey)) {
                    return false;
                  }
                  
                  // Special handling for account_id when creating from Account context
                  // Hide account_id ONLY if it's auto-populated from parent account via prefilledValues
                  // NOT when user manually selects it from the lookup
                  if (fieldKey === 'account_id' && prefilledValues?.account_id && formData.account_id === prefilledValues.account_id) {
                    return false;
                  }
                  
                  // Apply Record Type field visibility
                  if (!selectedRecordType || recordTypes.length === 0) {
                    return true; // No record type selected, show all fields
                  }
                  
                  // Find the selected record type
                  const recordType = recordTypes.find(rt => rt.id === selectedRecordType);
                  if (!recordType || !recordType.field_visibility) {
                    return true; // No visibility config, show all fields
                  }
                  
                  const field = object.fields[fieldKey];
                  // Required fields ALWAYS visible
                  if (field.required) {
                    return true;
                  }
                  
                  // Check visibility: show if not explicitly set to false
                  return recordType.field_visibility[fieldKey] !== false;
                })
                .map(([fieldKey, field]) => {
                  const isFlsReadOnly = isFieldReadOnly(object.object_name, fieldKey);
                  return (
                    <div key={fieldKey} className={field.type === 'textarea' || field.type === 'Textarea' ? 'md:col-span-2' : ''}>
                      <Label htmlFor={fieldKey} className="text-sm font-medium flex items-center">
                        {field.label}
                        {field.required && <span className="text-red-500 ml-1">*</span>}
                        {field.is_custom && (
                          <Badge variant="secondary" className="ml-2 text-xs">Custom</Badge>
                        )}
                        {isFlsReadOnly && (
                          <span className="text-amber-600 ml-1" title="Read-only (Field Security)">
                            <Lock className="h-3 w-3 inline" />
                          </span>
                        )}
                      </Label>
                      <div className={`mt-1 ${fieldErrors[fieldKey] ? 'ring-2 ring-red-500 rounded-md' : ''} ${isFlsReadOnly ? 'opacity-60' : ''}`}>
                        {isFlsReadOnly ? (
                          <div className="p-2 bg-slate-100 rounded border text-sm text-slate-600 italic">
                            Read-only field
                          </div>
                        ) : (
                          renderField(fieldKey, field)
                        )}
                      </div>
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
                })
              }
            </div>
          )}
          <div className="flex justify-end space-x-2 pt-4 border-t">
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || loadingLayout} data-testid="submit-create-record" className="bg-indigo-600 hover:bg-indigo-700">
              {loading ? 'Creating...' : `Create ${object.object_label}`}
            </Button>
          </div>
        </form>
        )}
      </DialogContent>
    </Dialog>
    </>
  );
};

export default CreateRecordDialog;
