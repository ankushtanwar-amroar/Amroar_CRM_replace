/**
 * Property Panel - Enterprise Edition
 * 
 * Right sidebar for configuring selected component properties.
 * Dynamically generates form fields based on component's config_schema.
 */
import React, { useState, useEffect } from 'react';
import { X, Settings, Trash2, Info, Sliders, Sparkles } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Switch } from '../../../components/ui/switch';
import { Badge } from '../../../components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select';
import { Textarea } from '../../../components/ui/textarea';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../../../components/ui/tooltip';

// Field type renderers
const FieldRenderer = ({ field, value, onChange }) => {
  const fieldType = field.type || 'string';
  
  switch (fieldType) {
    case 'string':
      return (
        <Input
          value={value || field.default || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.description}
          className="h-10"
        />
      );
    
    case 'number':
    case 'integer':
      return (
        <Input
          type="number"
          value={value ?? field.default ?? ''}
          onChange={(e) => onChange(parseInt(e.target.value) || 0)}
          min={field.min}
          max={field.max}
          className="h-10"
        />
      );
    
    case 'boolean':
      return (
        <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200">
          <span className="text-sm text-slate-600">
            {value ?? field.default ? 'Enabled' : 'Disabled'}
          </span>
          <Switch
            checked={value ?? field.default ?? false}
            onCheckedChange={onChange}
          />
        </div>
      );
    
    case 'select':
    case 'enum':
      const options = field.options || field.enum || [];
      return (
        <Select value={value || field.default || ''} onValueChange={onChange}>
          <SelectTrigger className="h-10">
            <SelectValue placeholder={field.description || 'Select...'} />
          </SelectTrigger>
          <SelectContent>
            {options.map((opt) => {
              const optValue = typeof opt === 'object' ? opt.value : opt;
              const optLabel = typeof opt === 'object' ? opt.label : opt;
              return (
                <SelectItem key={optValue} value={optValue}>
                  {optLabel}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      );
    
    case 'textarea':
    case 'text':
      return (
        <Textarea
          value={value || field.default || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.description}
          rows={3}
          className="resize-none"
        />
      );
    
    default:
      return (
        <Input
          value={value || field.default || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.description}
          className="h-10"
        />
      );
  }
};

const PropertyPanel = ({ component, onConfigUpdate, onRemove, onClose }) => {
  const [config, setConfig] = useState(component?.config || {});
  const [componentDef, setComponentDef] = useState(null);
  
  // Load component definition from registry
  useEffect(() => {
    if (component?.component_type && window.__componentRegistry) {
      setComponentDef(window.__componentRegistry[component.component_type]);
    }
  }, [component?.component_type]);
  
  // Update local config when component changes
  useEffect(() => {
    setConfig(component?.config || {});
  }, [component?.id]);
  
  // Handle field change
  const handleFieldChange = (fieldName, value) => {
    const newConfig = { ...config, [fieldName]: value };
    setConfig(newConfig);
    onConfigUpdate(component.id, newConfig);
  };
  
  // Get config schema from component definition
  const configSchema = componentDef?.config_schema || {};
  
  // Define common fields that most components have
  const commonFields = {
    title: {
      type: 'string',
      label: 'Title',
      description: 'Component title displayed in the header',
      default: componentDef?.name || ''
    },
    show_title: {
      type: 'boolean',
      label: 'Show Title',
      description: 'Display the title header',
      default: true
    }
  };
  
  // Special fields for app_page components
  const appPageFields = component?.component_type === 'app_page' ? {
    pageId: {
      type: 'string',
      label: 'Page ID',
      description: 'The ID of the embedded page (read-only)',
      readonly: true
    },
    pageName: {
      type: 'string',
      label: 'Page Name',
      description: 'The name of the embedded page (read-only)',
      readonly: true
    },
    showTitle: {
      type: 'boolean',
      label: 'Show Page Title',
      description: 'Display the embedded page title',
      default: true
    }
  } : {};
  
  // Merge common fields with component-specific fields
  const allFields = { ...commonFields, ...configSchema, ...appPageFields };
  
  if (!component) {
    return null;
  }
  
  return (
    <div 
      className="w-80 bg-white border-l border-slate-200 flex flex-col shrink-0 shadow-sm"
      data-testid="property-panel"
    >
      {/* Header */}
      <div className="p-4 border-b border-slate-200 bg-slate-50/50">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-purple-100 rounded-lg">
              <Sliders className="h-4 w-4 text-purple-600" />
            </div>
            <h3 className="font-semibold text-slate-900">Properties</h3>
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-7 w-7 p-0 hover:bg-slate-200"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Badge className="bg-blue-100 text-blue-700 border-0 font-medium">
            {componentDef?.name || component.component_type}
          </Badge>
          <span className="text-xs text-slate-400">ID: {component.id?.slice(-8)}</span>
        </div>
      </div>
      
      {/* Properties */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        <TooltipProvider>
          {Object.entries(allFields).map(([fieldName, field]) => {
            const fieldLabel = field.label || fieldName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            
            return (
              <div key={fieldName} className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label className="text-sm font-medium text-slate-700">
                    {fieldLabel}
                  </Label>
                  {field.description && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="p-0.5 bg-slate-100 rounded cursor-help">
                          <Info className="h-3 w-3 text-slate-400" />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="max-w-xs">
                        <p className="text-xs">{field.description}</p>
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>
                <FieldRenderer
                  field={field}
                  value={config[fieldName]}
                  onChange={(value) => handleFieldChange(fieldName, value)}
                />
              </div>
            );
          })}
        </TooltipProvider>
        
        {/* Component-specific hint */}
        {componentDef?.description && (
          <div className="mt-6 p-4 bg-gradient-to-r from-slate-50 to-blue-50 rounded-xl border border-slate-100">
            <div className="flex items-start gap-3">
              <div className="p-1.5 bg-blue-100 rounded-lg mt-0.5">
                <Sparkles className="h-3.5 w-3.5 text-blue-600" />
              </div>
              <div>
                <p className="text-xs font-medium text-slate-700 mb-1">About this component</p>
                <p className="text-xs text-slate-500 leading-relaxed">{componentDef.description}</p>
              </div>
            </div>
          </div>
        )}
      </div>
      
      {/* Footer Actions */}
      <div className="p-4 border-t border-slate-200 bg-slate-50/50">
        <Button
          variant="destructive"
          size="sm"
          className="w-full gap-2"
          onClick={onRemove}
          data-testid="remove-component-btn"
        >
          <Trash2 className="h-4 w-4" />
          Remove Component
        </Button>
      </div>
    </div>
  );
};

export default PropertyPanel;
