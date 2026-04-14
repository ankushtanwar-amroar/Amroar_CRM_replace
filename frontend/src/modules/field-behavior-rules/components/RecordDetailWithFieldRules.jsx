/**
 * RecordDetailWithFieldRules Component
 * 
 * A component that renders record fields with field behavior rules enforcement.
 * Integrates with the Lightning Page Builder's Record Detail component configuration.
 * 
 * Supports:
 * - Visibility rules: Show/hide fields based on conditions
 * - Required rules: Dynamically mark fields as required
 * - Read-only rules: Disable field editing based on conditions
 * - Debounced re-evaluation on field changes
 */
import React, { useState, useEffect, useCallback, useMemo, memo } from 'react';
import { Badge } from '../../../components/ui/badge';
import { Input } from '../../../components/ui/input';
import { Button } from '../../../components/ui/button';
import { Label } from '../../../components/ui/label';
import { Textarea } from '../../../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { Switch } from '../../../components/ui/switch';
import { ChevronDown, ChevronRight, Lock, Asterisk, AlertCircle, Loader2 } from 'lucide-react';
import { useFieldBehaviorRuntime } from '../hooks/useFieldBehaviorRuntime';
import { RelatedRecordWithPreview, isRelatedField } from '../../../components/RelatedRecordDisplay';

/**
 * RecordDetailWithFieldRules - Main component
 */
const RecordDetailWithFieldRules = ({
  config,
  recordData,
  objectInfo,
  objectApiName,
  recordId,
  pageType = 'view', // 'new', 'edit', or 'view'
  onFieldChange,
  onValidationError,
  onOpenRelated,
  getStatusColor,
  collapsedSections,
  onToggleSection
}) => {
  const columns = config?.columns || 2;
  
  // Memoize configured items to avoid dependency issues
  const configuredItems = useMemo(() => {
    return config?.items || [];
  }, [config?.items]);
  
  // Extract field configs that have rules defined
  const fieldConfigs = useMemo(() => {
    const configs = [];
    
    const extractFields = (items) => {
      for (const item of items) {
        if (item.type === 'field') {
          configs.push({
            key: item.key,
            fieldApiName: item.key,
            label: item.label,
            visibilityRule: item.visibilityRule,
            requiredRule: item.requiredRule,
            readonlyRule: item.readonlyRule
          });
        } else if (item.type === 'field_section' && item.fields) {
          extractFields(item.fields);
        }
      }
    };
    
    extractFields(configuredItems);
    return configs;
  }, [configuredItems]);
  
  // Use the field behavior runtime hook
  const {
    fieldStates,
    isLoading,
    error,
    hasRules,
    getFieldState,
    isFieldVisible,
    isFieldRequired,
    isFieldReadonly,
    validateRequiredFields
  } = useFieldBehaviorRuntime({
    objectName: objectApiName,
    recordData,
    fieldConfigs,
    pageType,
    recordId
  });
  
  // Expose validation function to parent
  useEffect(() => {
    if (onValidationError && hasRules) {
      const errors = validateRequiredFields();
      if (errors.length > 0) {
        onValidationError(errors);
      }
    }
  }, [recordData, validateRequiredFields, onValidationError, hasRules]);
  
  // Helper functions
  const isLinkField = (key) => ['email', 'phone', 'website', 'mobile'].includes(key?.toLowerCase());
  const isBadgeField = (key) => ['status', 'lead_status', 'stage', 'priority', 'rating'].includes(key?.toLowerCase());
  
  // Get lookup object type
  const getLookupObjectType = (fieldKey) => {
    if (fieldKey === 'lead_id' || fieldKey === 'lead') return 'lead';
    if (fieldKey === 'contact_id' || fieldKey === 'contact') return 'contact';
    if (fieldKey === 'account_id' || fieldKey === 'account') return 'account';
    if (fieldKey === 'opportunity_id' || fieldKey === 'opportunity') return 'opportunity';
    if (fieldKey === 'task_id' || fieldKey === 'task') return 'task';
    if (fieldKey === 'event_id' || fieldKey === 'event') return 'event';
    
    if (fieldKey === 'related_to' && recordData?.related_type) {
      return recordData.related_type.toLowerCase();
    }
    
    const value = recordData?.[fieldKey];
    if (typeof value === 'string') {
      if (value.startsWith('led-')) return 'lead';
      if (value.startsWith('con-')) return 'contact';
      if (value.startsWith('acc-')) return 'account';
      if (value.startsWith('opp-')) return 'opportunity';
      if (value.startsWith('tsk-')) return 'task';
      if (value.startsWith('evt-')) return 'event';
    }
    
    return null;
  };
  
  // Render a single field value (for view mode)
  const renderFieldValue = (field, value) => {
    const fieldKey = field.key;
    const isLink = isLinkField(fieldKey);
    const isBadge = isBadgeField(fieldKey);
    const isLookup = isRelatedField(fieldKey);
    const lookupObjectType = isLookup ? getLookupObjectType(fieldKey) : null;
    
    if (isBadge) {
      return <Badge className={getStatusColor?.(String(value)) || 'bg-gray-100 text-gray-800'}>{String(value)}</Badge>;
    }
    
    if (isLookup && value && value !== '-') {
      return (
        <RelatedRecordWithPreview
          fieldName={fieldKey}
          recordId={value}
          objectType={lookupObjectType}
          className="text-indigo-600 hover:text-indigo-800 hover:underline cursor-pointer text-sm"
          onClick={() => {
            if (onOpenRelated && lookupObjectType) {
              onOpenRelated(lookupObjectType, value);
            }
          }}
        />
      );
    }
    
    return (
      <p className={`text-sm ${isLink ? 'text-blue-600' : 'text-slate-700'}`}>
        {String(value || '-')}
      </p>
    );
  };
  
  // Render a single field with behavior rules
  const renderField = (field) => {
    const fieldKey = field.key;
    const label = field.label || fieldKey?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    const value = recordData?.[fieldKey] ?? recordData?.[fieldKey?.toLowerCase()] ?? '';
    
    // Get field behavior state
    const fieldState = getFieldState(fieldKey);
    
    // Skip if not visible
    if (!fieldState.isVisible) {
      return null;
    }
    
    const isRequired = fieldState.isRequired;
    const isReadonly = fieldState.isReadonly || pageType === 'view';
    
    return (
      <div key={field.id} className="relative">
        {/* Label with required indicator */}
        <div className="flex items-center gap-1 mb-1">
          <p className="text-xs text-slate-500 uppercase">{label}</p>
          {isRequired && (
            <span className="text-red-500 text-xs" title="Required">*</span>
          )}
          {isReadonly && pageType !== 'view' && (
            <Lock className="h-3 w-3 text-amber-500" title="Read-only" />
          )}
        </div>
        
        {/* Field value/input */}
        {pageType === 'view' || isReadonly ? (
          renderFieldValue(field, value || '-')
        ) : (
          <FieldInput
            fieldKey={fieldKey}
            field={field}
            value={value}
            isRequired={isRequired}
            isReadonly={isReadonly}
            onChange={(newValue) => onFieldChange?.(fieldKey, newValue)}
            objectInfo={objectInfo}
          />
        )}
      </div>
    );
  };
  
  // Render field section with behavior rules
  const renderFieldSection = (item) => {
    const isCollapsed = collapsedSections?.[item.id] ?? item.collapsed ?? false;
    const sectionFields = item.fields || [];
    
    // Filter visible fields within section
    const visibleFields = sectionFields.filter(field => {
      const state = getFieldState(field.key);
      return state.isVisible;
    });
    
    // Hide entire section if no visible fields
    if (visibleFields.length === 0) {
      return null;
    }
    
    return (
      <div key={item.id} className="border rounded-lg overflow-hidden shadow-sm">
        {/* Section Header */}
        <div 
          className="px-4 py-3 bg-gradient-to-r from-slate-50 to-slate-100 border-b flex items-center justify-between cursor-pointer hover:bg-slate-100 transition-colors"
          onClick={() => onToggleSection?.(item.id)}
        >
          <div className="flex items-center">
            {isCollapsed ? (
              <ChevronRight className="h-5 w-5 text-slate-500 mr-2" />
            ) : (
              <ChevronDown className="h-5 w-5 text-slate-500 mr-2" />
            )}
            <h4 className="text-sm font-semibold text-slate-700">{item.label || 'Section'}</h4>
          </div>
          <span className="text-xs text-slate-400">
            {visibleFields.length} field{visibleFields.length !== 1 ? 's' : ''}
          </span>
        </div>
        
        {/* Section Content */}
        {!isCollapsed && (
          <div className="p-4 bg-white">
            {visibleFields.length > 0 ? (
              <div className={`grid ${columns === 1 ? 'grid-cols-1' : 'grid-cols-2'} gap-4`}>
                {visibleFields.map(field => renderField(field))}
              </div>
            ) : (
              <p className="text-sm text-slate-400 text-center py-2">No visible fields</p>
            )}
          </div>
        )}
      </div>
    );
  };
  
  // Loading state
  if (isLoading && hasRules) {
    return (
      <div className="p-4 bg-white flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400 mr-2" />
        <span className="text-sm text-slate-500">Evaluating field rules...</span>
      </div>
    );
  }
  
  // Error state
  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
        <div className="flex items-center gap-2 text-red-600">
          <AlertCircle className="h-4 w-4" />
          <span className="text-sm">Error evaluating field rules: {error}</span>
        </div>
      </div>
    );
  }
  
  // If no configured items, render dynamic fields from record
  if (configuredItems.length === 0) {
    const excludeKeys = ['id', 'series_id', 'tenant_id', 'created_at', 'updated_at', 'object_type'];
    const dynamicFields = Object.keys(recordData || {})
      .filter(key => !excludeKeys.includes(key) && recordData[key] !== null && recordData[key] !== undefined)
      .map(key => ({
        id: key,
        key,
        label: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        type: 'field'
      }));
    
    return (
      <div className="p-4 bg-white">
        <div className={`grid ${columns === 1 ? 'grid-cols-1' : 'grid-cols-2'} gap-4`}>
          {dynamicFields.map(field => renderField(field))}
        </div>
      </div>
    );
  }
  
  // Render configured items
  return (
    <div className="p-4 bg-white">
      <div className="space-y-3">
        {configuredItems.map((item) => {
          // Blank space
          if (item.type === 'blank_space') {
            return <div key={item.id} className="h-4"></div>;
          }
          
          // Field section
          if (item.type === 'field_section') {
            return renderFieldSection(item);
          }
          
          // Regular field
          if (item.type === 'field') {
            const fieldState = getFieldState(item.key);
            if (!fieldState.isVisible) return null;
            
            return (
              <div key={item.id} className="px-4 py-2 border-b border-slate-100 last:border-0">
                {renderField(item)}
              </div>
            );
          }
          
          return null;
        })}
      </div>
    </div>
  );
};

/**
 * FieldInput - Editable field input component
 */
const FieldInput = memo(({ fieldKey, field, value, isRequired, isReadonly, onChange, objectInfo }) => {
  const fieldDef = objectInfo?.fields?.[fieldKey];
  const fieldType = fieldDef?.type || field.type || 'text';
  
  // Handle value change
  const handleChange = (newValue) => {
    if (!isReadonly && onChange) {
      onChange(newValue);
    }
  };
  
  // Render based on field type
  switch (fieldType?.toLowerCase()) {
    case 'boolean':
    case 'checkbox':
      return (
        <div className="flex items-center space-x-2">
          <Switch
            id={fieldKey}
            checked={value === true || value === 'true'}
            onCheckedChange={handleChange}
            disabled={isReadonly}
          />
          <Label htmlFor={fieldKey} className="cursor-pointer text-sm">
            {value === true || value === 'true' ? 'Yes' : 'No'}
          </Label>
        </div>
      );
    
    case 'picklist':
    case 'select':
      const options = fieldDef?.options || fieldDef?.picklist_values || [];
      return (
        <Select value={value || ''} onValueChange={handleChange} disabled={isReadonly}>
          <SelectTrigger className={isRequired && !value ? 'border-red-300' : ''}>
            <SelectValue placeholder="Select..." />
          </SelectTrigger>
          <SelectContent>
            {options.map(opt => (
              <SelectItem key={opt.value || opt} value={opt.value || opt}>
                {opt.label || opt}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    
    case 'textarea':
    case 'long_text':
      return (
        <Textarea
          value={value || ''}
          onChange={(e) => handleChange(e.target.value)}
          disabled={isReadonly}
          required={isRequired}
          rows={3}
          className={isRequired && !value ? 'border-red-300' : ''}
        />
      );
    
    case 'date':
      return (
        <Input
          type="date"
          value={value || ''}
          onChange={(e) => handleChange(e.target.value)}
          disabled={isReadonly}
          required={isRequired}
          className={isRequired && !value ? 'border-red-300' : ''}
        />
      );
    
    case 'datetime':
      return (
        <Input
          type="datetime-local"
          value={value || ''}
          onChange={(e) => handleChange(e.target.value)}
          disabled={isReadonly}
          required={isRequired}
          className={isRequired && !value ? 'border-red-300' : ''}
        />
      );
    
    case 'number':
    case 'integer':
      return (
        <Input
          type="number"
          value={value || ''}
          onChange={(e) => handleChange(e.target.value)}
          disabled={isReadonly}
          required={isRequired}
          className={isRequired && !value ? 'border-red-300' : ''}
        />
      );
    
    case 'currency':
      return (
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">$</span>
          <Input
            type="number"
            step="0.01"
            value={value || ''}
            onChange={(e) => handleChange(e.target.value)}
            disabled={isReadonly}
            required={isRequired}
            className={`pl-7 ${isRequired && !value ? 'border-red-300' : ''}`}
          />
        </div>
      );
    
    case 'percent':
      return (
        <div className="relative">
          <Input
            type="number"
            step="0.01"
            value={value || ''}
            onChange={(e) => handleChange(e.target.value)}
            disabled={isReadonly}
            required={isRequired}
            className={`pr-8 ${isRequired && !value ? 'border-red-300' : ''}`}
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500">%</span>
        </div>
      );
    
    case 'email':
      return (
        <Input
          type="email"
          value={value || ''}
          onChange={(e) => handleChange(e.target.value)}
          disabled={isReadonly}
          required={isRequired}
          placeholder="email@example.com"
          className={isRequired && !value ? 'border-red-300' : ''}
        />
      );
    
    case 'phone':
      return (
        <Input
          type="tel"
          value={value || ''}
          onChange={(e) => handleChange(e.target.value)}
          disabled={isReadonly}
          required={isRequired}
          placeholder="+1 (555) 123-4567"
          className={isRequired && !value ? 'border-red-300' : ''}
        />
      );
    
    case 'url':
      return (
        <Input
          type="url"
          value={value || ''}
          onChange={(e) => handleChange(e.target.value)}
          disabled={isReadonly}
          required={isRequired}
          placeholder="https://example.com"
          className={isRequired && !value ? 'border-red-300' : ''}
        />
      );
    
    default:
      return (
        <Input
          type="text"
          value={value || ''}
          onChange={(e) => handleChange(e.target.value)}
          disabled={isReadonly}
          required={isRequired}
          className={isRequired && !value ? 'border-red-300' : ''}
        />
      );
  }
});

FieldInput.displayName = 'FieldInput';

export default RecordDetailWithFieldRules;
