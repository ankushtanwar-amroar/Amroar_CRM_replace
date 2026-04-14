/**
 * ActionForm
 * Form for creating/editing actions with collapsible sections
 * Supports both Record Detail and List View action contexts
 */
import React, { useState, useEffect } from 'react';
import { 
  ChevronDown, ChevronUp, Save, X, Plus, Trash2,
  Zap, ExternalLink, RefreshCw, FileText, Info, Play, List, LayoutList
} from 'lucide-react';
import axios from 'axios';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Switch } from '../../../components/ui/switch';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue 
} from '../../../components/ui/select';
import { ACTION_TYPES, ACTION_PLACEMENTS, ACTION_CONTEXTS, LUCIDE_ICONS } from '../index';
import * as LucideIcons from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL;

// ============================================
// Collapsible Section Component
// ============================================
const CollapsibleSection = ({ title, description, defaultOpen = true, children }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-3 bg-gray-50 flex items-center justify-between hover:bg-gray-100 transition-colors"
      >
        <div className="text-left">
          <h3 className="font-medium text-gray-900">{title}</h3>
          {description && <p className="text-sm text-gray-500">{description}</p>}
        </div>
        {isOpen ? (
          <ChevronUp className="h-5 w-5 text-gray-400" />
        ) : (
          <ChevronDown className="h-5 w-5 text-gray-400" />
        )}
      </button>
      {isOpen && (
        <div className="p-4 border-t border-gray-200">
          {children}
        </div>
      )}
    </div>
  );
};

// ============================================
// Field Mapping Row Component
// ============================================
const FieldMappingRow = ({ mapping, onChange, onRemove, showRequiredToggle = false, showInModalToggle = false }) => {
  return (
    <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
      <div className="flex-1 grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs text-gray-500">Field API Name</Label>
          <Input
            value={mapping.field_api_name || ''}
            onChange={(e) => onChange({ ...mapping, field_api_name: e.target.value })}
            placeholder="e.g., account_id"
            className="mt-1"
          />
        </div>
        <div>
          <Label className="text-xs text-gray-500">Value Type</Label>
          <Select
            value={mapping.value_type || 'STATIC'}
            onValueChange={(val) => onChange({ ...mapping, value_type: val })}
          >
            <SelectTrigger className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="STATIC">Static Value</SelectItem>
              <SelectItem value="FIELD_REF">Field Reference</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="col-span-2">
          <Label className="text-xs text-gray-500">
            {mapping.value_type === 'FIELD_REF' ? 'Field Reference (e.g., Record.Id)' : 'Static Value'}
          </Label>
          <Input
            value={mapping.value || ''}
            onChange={(e) => onChange({ ...mapping, value: e.target.value })}
            placeholder={mapping.value_type === 'FIELD_REF' ? 'Record.Id' : 'Enter value'}
            className="mt-1"
          />
        </div>
        {(showRequiredToggle || showInModalToggle) && (
          <div className="col-span-2 flex gap-4">
            {showRequiredToggle && (
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={mapping.required || false}
                  onCheckedChange={(val) => onChange({ ...mapping, required: val })}
                />
                Required
              </label>
            )}
            {showInModalToggle && (
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={mapping.show_in_modal !== false}
                  onCheckedChange={(val) => onChange({ ...mapping, show_in_modal: val })}
                />
                Show in Modal
              </label>
            )}
          </div>
        )}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onRemove}
        className="text-red-600 hover:text-red-700 hover:bg-red-50 mt-5"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
};

// ============================================
// Main ActionForm Component
// ============================================
const ActionForm = ({ objectName, objectLabel, action, onSubmit, onCancel, defaultActionContext = 'RECORD_DETAIL' }) => {
  const isEditing = !!action;
  
  // Form state (placement removed - actions are controlled by context and layout)
  const [formData, setFormData] = useState({
    type: ACTION_TYPES.CREATE_RECORD,
    label: '',
    api_name: '',
    icon: 'Zap',
    action_context: defaultActionContext,
    is_active: true,
    config_json: {}
  });
  
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  
  // Flows state for RUN_FLOW action type
  const [flows, setFlows] = useState([]);
  const [loadingFlows, setLoadingFlows] = useState(false);
  const [selectedFlow, setSelectedFlow] = useState(null);

  // Fetch flows when RUN_FLOW is selected or action_context changes
  useEffect(() => {
    if (formData.type === ACTION_TYPES.RUN_FLOW) {
      fetchFlows();
    }
  }, [formData.type, formData.action_context]);

  // Load selected flow details when flow_id changes
  useEffect(() => {
    const flowId = formData.config_json?.flow_id;
    if (flowId && flows.length > 0) {
      const flow = flows.find(f => f.id === flowId);
      setSelectedFlow(flow || null);
    }
  }, [formData.config_json?.flow_id, flows]);

  const fetchFlows = async () => {
    try {
      setLoadingFlows(true);
      const token = localStorage.getItem('token');
      
      // Choose endpoint based on action_context
      const endpoint = formData.action_context === 'LIST_VIEW' 
        ? `${API_URL}/api/actions/flows/list-view`
        : `${API_URL}/api/actions/flows/record-detail`;
      
      const response = await axios.get(endpoint, {
        headers: { Authorization: `Bearer ${token}` },
        params: { object_name: objectName }
      });
      
      const flowsData = response.data?.flows || [];
      setFlows(Array.isArray(flowsData) ? flowsData : []);
      
      // Clear selected flow if it's no longer valid for the new context
      const flowId = formData.config_json?.flow_id;
      if (flowId && !flowsData.find(f => f.id === flowId)) {
        setFormData(prev => ({
          ...prev,
          config_json: { ...prev.config_json, flow_id: '', flow_name: '' }
        }));
        setSelectedFlow(null);
      }
    } catch (err) {
      console.error('Error fetching Screen Flows:', err);
      setFlows([]);
    } finally {
      setLoadingFlows(false);
    }
  };

  // Initialize form with existing action data
  useEffect(() => {
    if (action) {
      setFormData({
        type: action.type,
        label: action.label,
        api_name: action.api_name,
        icon: action.icon || 'Zap',
        action_context: action.action_context || 'RECORD_DETAIL',
        is_active: action.is_active,
        config_json: action.config_json || {}
      });
      
      // If editing a RUN_FLOW action, fetch flows to populate the dropdown
      if (action.type === ACTION_TYPES.RUN_FLOW) {
        // The useEffect for fetchFlows will be triggered when formData.type changes
      }
    }
  }, [action]);

  // Auto-generate API name from label
  const handleLabelChange = (label) => {
    setFormData(prev => ({
      ...prev,
      label,
      api_name: isEditing ? prev.api_name : label.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, '_')
    }));
  };

  // Update config based on type
  const updateConfig = (updates) => {
    setFormData(prev => ({
      ...prev,
      config_json: { ...prev.config_json, ...updates }
    }));
  };

  // Handle field mapping changes
  const updateFieldMapping = (index, key, mapping) => {
    const currentMappings = formData.config_json[key] || [];
    const updated = [...currentMappings];
    updated[index] = mapping;
    updateConfig({ [key]: updated });
  };

  const addFieldMapping = (key) => {
    const currentMappings = formData.config_json[key] || [];
    updateConfig({ 
      [key]: [...currentMappings, { field_api_name: '', value_type: 'STATIC', value: '' }] 
    });
  };

  const removeFieldMapping = (index, key) => {
    const currentMappings = formData.config_json[key] || [];
    updateConfig({ [key]: currentMappings.filter((_, i) => i !== index) });
  };

  // Validate form
  const validateForm = () => {
    const newErrors = {};
    
    if (!formData.label.trim()) {
      newErrors.label = 'Label is required';
    }
    
    if (!formData.type) {
      newErrors.type = 'Action type is required';
    }

    // Type-specific validation
    if (formData.type === ACTION_TYPES.CREATE_RECORD) {
      if (!formData.config_json.target_object) {
        newErrors.target_object = 'Target object is required';
      }
    }
    
    if (formData.type === ACTION_TYPES.OPEN_URL) {
      if (!formData.config_json.url_template?.trim()) {
        newErrors.url_template = 'URL template is required';
      }
    }
    
    if (formData.type === ACTION_TYPES.RUN_FLOW) {
      if (!formData.config_json.flow_id) {
        newErrors.flow_id = 'Flow selection is required';
      }
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handle form submit
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) return;
    
    setSaving(true);
    try {
      await onSubmit(formData);
    } catch (err) {
      // Error handled by parent
    } finally {
      setSaving(false);
    }
  };

  // Render icon preview
  const IconComponent = LucideIcons[formData.icon] || LucideIcons.Zap;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-gray-200">
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            {isEditing ? 'Edit Action' : 'New Action'}
          </h2>
          <p className="text-sm text-gray-500">
            Configure a quick action for {objectLabel || objectName} records
          </p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            <X className="h-4 w-4 mr-2" />
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            <Save className="h-4 w-4 mr-2" />
            {saving ? 'Saving...' : 'Save Action'}
          </Button>
        </div>
      </div>

      {/* Section 1: Action Type */}
      <CollapsibleSection 
        title="Step 1: Select Action Type" 
        description="Choose what this action will do"
      >
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {[
            { type: ACTION_TYPES.CREATE_RECORD, icon: Plus, label: 'Create Record', desc: 'Create a new related record' },
            { type: ACTION_TYPES.OPEN_URL, icon: ExternalLink, label: 'Open URL', desc: 'Open URL with record data' },
            { type: ACTION_TYPES.RUN_FLOW, icon: Play, label: 'Run Flow', desc: 'Trigger a Screen Flow' }
          ].map(({ type, icon: Icon, label, desc }) => (
            <button
              key={type}
              type="button"
              onClick={() => {
                // Only clear config_json if changing to a different type
                if (formData.type !== type) {
                  setFormData(prev => ({ ...prev, type, config_json: {} }));
                }
              }}
              className={`p-4 rounded-lg border-2 text-left transition-all ${
                formData.type === type 
                  ? 'border-blue-500 bg-blue-50' 
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <Icon className={`h-6 w-6 mb-2 ${formData.type === type ? 'text-blue-600' : 'text-gray-400'}`} />
              <div className="font-medium text-gray-900">{label}</div>
              <div className="text-xs text-gray-500 mt-1">{desc}</div>
            </button>
          ))}
        </div>
        {errors.type && <p className="text-red-500 text-sm mt-2">{errors.type}</p>}
      </CollapsibleSection>

      {/* Section 2: Basic Details */}
      <CollapsibleSection 
        title="Step 2: Basic Details" 
        description="Name and configure the action"
      >
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="label">Action Label *</Label>
            <Input
              id="label"
              value={formData.label}
              onChange={(e) => handleLabelChange(e.target.value)}
              placeholder="e.g., Mark as Qualified"
              className={errors.label ? 'border-red-500' : ''}
            />
            {errors.label && <p className="text-red-500 text-sm mt-1">{errors.label}</p>}
          </div>
          
          <div>
            <Label htmlFor="api_name">API Name</Label>
            <Input
              id="api_name"
              value={formData.api_name}
              onChange={(e) => setFormData(prev => ({ ...prev, api_name: e.target.value }))}
              placeholder="auto_generated"
              disabled={isEditing}
              className="bg-gray-50"
            />
          </div>
          
          <div>
            <Label htmlFor="icon">Icon</Label>
            <div className="flex gap-2 mt-1">
              <Select
                value={formData.icon}
                onValueChange={(val) => setFormData(prev => ({ ...prev, icon: val }))}
              >
                <SelectTrigger className="flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {LUCIDE_ICONS.map(iconName => {
                    const Icon = LucideIcons[iconName];
                    return (
                      <SelectItem key={iconName} value={iconName}>
                        <span className="flex items-center gap-2">
                          {Icon && <Icon className="h-4 w-4" />}
                          {iconName}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                <IconComponent className="h-5 w-5 text-blue-600" />
              </div>
            </div>
          </div>
          
          {/* Action Context Selector */}
          <div>
            <Label htmlFor="action_context">Action Context *</Label>
            <Select
              value={formData.action_context}
              onValueChange={(val) => setFormData(prev => ({ ...prev, action_context: val, config_json: {} }))}
              disabled={isEditing}
            >
              <SelectTrigger className={isEditing ? 'bg-gray-50' : ''}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="RECORD_DETAIL">
                  <span className="flex items-center gap-2">
                    <LayoutList className="h-4 w-4" />
                    Record Detail
                  </span>
                </SelectItem>
                <SelectItem value="LIST_VIEW">
                  <span className="flex items-center gap-2">
                    <List className="h-4 w-4" />
                    List View
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-500 mt-1">
              {formData.action_context === 'LIST_VIEW' 
                ? 'Action will appear on list view pages (can work with multiple records)' 
                : 'Action will appear on individual record pages'}
            </p>
          </div>
          
          <div className="col-span-2">
            <label className="flex items-center gap-3">
              <Switch
                checked={formData.is_active}
                onCheckedChange={(val) => setFormData(prev => ({ ...prev, is_active: val }))}
              />
              <div>
                <span className="font-medium text-gray-900">Active</span>
                <p className="text-sm text-gray-500">Only active actions appear on record pages</p>
              </div>
            </label>
          </div>
        </div>
      </CollapsibleSection>

      {/* Section 3: Type-specific Configuration */}
      <CollapsibleSection 
        title="Step 3: Configuration" 
        description="Configure action-specific settings"
      >
        {/* CREATE_RECORD Configuration */}
        {formData.type === ACTION_TYPES.CREATE_RECORD && (
          <div className="space-y-4">
            <div>
              <Label htmlFor="target_object">Target Object *</Label>
              <Select
                value={formData.config_json.target_object || ''}
                onValueChange={(val) => updateConfig({ target_object: val })}
              >
                <SelectTrigger className={errors.target_object ? 'border-red-500' : ''}>
                  <SelectValue placeholder="Select object to create" />
                </SelectTrigger>
                <SelectContent>
                  {['lead', 'contact', 'account', 'opportunity', 'task', 'event'].map(obj => (
                    <SelectItem key={obj} value={obj}>
                      {obj.charAt(0).toUpperCase() + obj.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.target_object && <p className="text-red-500 text-sm mt-1">{errors.target_object}</p>}
            </div>
            
            <div>
              <Label>Modal Title (optional)</Label>
              <Input
                value={formData.config_json.modal_title || ''}
                onChange={(e) => updateConfig({ modal_title: e.target.value })}
                placeholder={`New ${(formData.config_json.target_object || 'Record').charAt(0).toUpperCase() + (formData.config_json.target_object || 'record').slice(1)}`}
              />
            </div>
            
            {/* <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Field Mappings</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => addFieldMapping('fields')}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Field
                </Button>
              </div>
              <div className="space-y-2">
                {(formData.config_json.fields || []).map((mapping, index) => (
                  <FieldMappingRow
                    key={index}
                    mapping={mapping}
                    onChange={(m) => updateFieldMapping(index, 'fields', m)}
                    onRemove={() => removeFieldMapping(index, 'fields')}
                    showRequiredToggle
                    showInModalToggle
                  />
                ))}
                {(!formData.config_json.fields || formData.config_json.fields.length === 0) && (
                  <p className="text-sm text-gray-500 italic p-3 bg-gray-50 rounded">
                    No fields configured. Add fields to pre-fill or show in the creation modal.
                  </p>
                )}
              </div>
              <div className="mt-2 p-3 bg-blue-50 rounded-lg flex gap-2">
                <Info className="h-4 w-4 text-blue-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-blue-800">
                  Use <code className="bg-blue-100 px-1 rounded">Record.Id</code> to reference the current record ID, 
                  or <code className="bg-blue-100 px-1 rounded">Record.FieldName</code> for other fields.
                </p>
              </div>
            </div> */}
          </div>
        )}

        {/* OPEN_URL Configuration */}
        {formData.type === ACTION_TYPES.OPEN_URL && (
          <div className="space-y-4">
            <div>
              <Label htmlFor="url_template">URL Template *</Label>
              <Input
                id="url_template"
                value={formData.config_json.url_template || ''}
                onChange={(e) => updateConfig({ url_template: e.target.value })}
                placeholder="https://example.com/search?q={{Record.Name}}"
                className={errors.url_template ? 'border-red-500' : ''}
              />
              {errors.url_template && <p className="text-red-500 text-sm mt-1">{errors.url_template}</p>}
              <p className="text-sm text-gray-500 mt-1">
                Available tokens: <code className="bg-gray-100 px-1 rounded">{`{{Record.FieldName}}`}</code>, 
                <code className="bg-gray-100 px-1 rounded ml-1">{`{{Record.Id}}`}</code>
              </p>
            </div>
            
            <label className="flex items-center gap-3">
              <Switch
                checked={formData.config_json.open_in_new_tab !== false}
                onCheckedChange={(val) => updateConfig({ open_in_new_tab: val })}
              />
              <div>
                <span className="font-medium text-gray-900">Open in New Tab</span>
                <p className="text-sm text-gray-500">Open URL in a new browser tab</p>
              </div>
            </label>
            
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex gap-2">
              <Info className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-amber-800">
                <strong>Example URLs:</strong>
                <ul className="list-disc list-inside mt-1 space-y-1">
                  <li><code>{`https://linkedin.com/search?keywords={{Record.Name}}`}</code></li>
                  <li><code>{`https://google.com/search?q={{Record.Email}}`}</code></li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* RUN_FLOW Configuration */}
        {formData.type === ACTION_TYPES.RUN_FLOW && (
          <div className="space-y-4">
            <div>
              <Label htmlFor="flow_id">Select Screen Flow *</Label>
              {loadingFlows ? (
                <div className="mt-2 p-3 bg-gray-50 rounded text-gray-500 text-sm">
                  Loading Screen Flows...
                </div>
              ) : flows.length === 0 ? (
                <div className="mt-2 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                  <div className="flex gap-2">
                    <Info className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-amber-800">
                      <p className="font-medium">No Screen Flows available</p>
                      <p className="mt-1">To use Flow actions, create a Screen Flow with:</p>
                      <ul className="list-disc list-inside mt-1 space-y-1 text-amber-700">
                        <li>Type: <strong>Screen Flow</strong></li>
                        <li>Launch Mode: <strong>Record Detail</strong></li>
                      </ul>
                      <p className="mt-2 text-xs text-amber-600">List View flows and Autolaunched flows are not available for actions.</p>
                    </div>
                  </div>
                </div>
              ) : (
                <Select
                  value={formData.config_json.flow_id || ''}
                  onValueChange={(val) => {
                    const flow = flows.find(f => f.id === val);
                    updateConfig({ 
                      flow_id: val,
                      flow_name: flow?.name || ''
                    });
                    setSelectedFlow(flow || null);
                  }}
                >
                  <SelectTrigger className={`mt-1 ${errors.flow_id ? 'border-red-500' : ''}`}>
                    <SelectValue placeholder="Select a Screen Flow to run" />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    {flows.map(flow => (
                      <SelectItem key={flow.id} value={flow.id}>
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${flow.status === 'active' ? 'bg-green-500' : 'bg-gray-300'}`} />
                          <span>{flow.name}</span>
                          <span className="text-xs text-gray-400">v{flow.version}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {errors.flow_id && <p className="text-red-500 text-sm mt-1">{errors.flow_id}</p>}
            </div>

            {/* Selected flow info */}
            {selectedFlow && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Play className="h-4 w-4 text-blue-600" />
                  <span className="font-medium text-blue-900">{selectedFlow.name}</span>
                  <span className={`px-2 py-0.5 text-xs rounded-full ${
                    selectedFlow.status === 'active' 
                      ? 'bg-green-100 text-green-700' 
                      : 'bg-gray-100 text-gray-600'
                  }`}>
                    {selectedFlow.status}
                  </span>
                </div>
                {selectedFlow.description && (
                  <p className="text-sm text-blue-800">{selectedFlow.description}</p>
                )}
                {selectedFlow.input_variables && selectedFlow.input_variables.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-blue-200">
                    <p className="text-xs font-medium text-blue-700 mb-1">Input Variables:</p>
                    <div className="flex flex-wrap gap-1">
                      {selectedFlow.input_variables.map(v => (
                        <span key={v.name} className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded">
                          {v.label || v.name}
                          {v.required && <span className="text-red-500 ml-0.5">*</span>}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Input Mappings */}
            {selectedFlow && selectedFlow.input_variables && selectedFlow.input_variables.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label>Input Variable Mappings</Label>
                </div>
                <p className="text-sm text-gray-500 mb-3">
                  Map values from the current record to flow input variables.
                </p>
                <div className="space-y-2">
                  {selectedFlow.input_variables.map((variable) => {
                    const currentMapping = (formData.config_json.input_mappings || [])
                      .find(m => m.field_api_name === variable.name) || {};
                    
                    return (
                      <div key={variable.name} className="p-3 bg-gray-50 rounded-lg">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="font-medium text-gray-700">
                            {variable.label || variable.name}
                          </span>
                          {variable.required && (
                            <span className="text-red-500 text-xs">Required</span>
                          )}
                          <span className="text-xs text-gray-400">({variable.dataType || 'Text'})</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <Select
                            value={currentMapping.value_type || 'STATIC'}
                            onValueChange={(val) => {
                              const mappings = [...(formData.config_json.input_mappings || [])];
                              const idx = mappings.findIndex(m => m.field_api_name === variable.name);
                              const newMapping = {
                                field_api_name: variable.name,
                                value_type: val,
                                value: currentMapping.value || ''
                              };
                              if (idx >= 0) {
                                mappings[idx] = newMapping;
                              } else {
                                mappings.push(newMapping);
                              }
                              updateConfig({ input_mappings: mappings });
                            }}
                          >
                            <SelectTrigger className="h-9">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="STATIC">Static Value</SelectItem>
                              <SelectItem value="FIELD_REF">Field Reference</SelectItem>
                            </SelectContent>
                          </Select>
                          <Input
                            value={currentMapping.value || ''}
                            onChange={(e) => {
                              const mappings = [...(formData.config_json.input_mappings || [])];
                              const idx = mappings.findIndex(m => m.field_api_name === variable.name);
                              const newMapping = {
                                field_api_name: variable.name,
                                value_type: currentMapping.value_type || 'STATIC',
                                value: e.target.value
                              };
                              if (idx >= 0) {
                                mappings[idx] = newMapping;
                              } else {
                                mappings.push(newMapping);
                              }
                              updateConfig({ input_mappings: mappings });
                            }}
                            placeholder={currentMapping.value_type === 'FIELD_REF' ? 'Record.Id' : 'Enter value'}
                            className="h-9"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="p-3 bg-blue-50 rounded-lg flex gap-2">
              <Info className="h-4 w-4 text-blue-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-blue-800">
                The flow will be executed when the user clicks this action button.
                Use field references like <code className="bg-blue-100 px-1 rounded">Record.Id</code> to pass record data to the flow.
              </p>
            </div>
          </div>
        )}
      </CollapsibleSection>
    </form>
  );
};

export default ActionForm;
