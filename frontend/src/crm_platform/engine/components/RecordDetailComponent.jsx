/**
 * RecordDetailComponent - Salesforce-Level Field Rendering with Inline Edit
 * 
 * Features:
 * - Section-based rendering from layout config
 * - Column layout (1/2/3 column)
 * - Field ordering from layout
 * - Hidden field respect
 * - Required field validation
 * - Stable inline editing with optimistic UI
 * - Lookup field resolution (shows name instead of ID)
 * - Email click opens composer modal
 * - Audit fields display (created_at, updated_at, created_by, updated_by)
 * - Field-Level Security (FLS) enforcement
 */
import React, { useState, useCallback, useMemo, useRef, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import {
  ChevronDown, ChevronUp, Pencil, Check, X, Loader2, AlertCircle, Mail, ExternalLink, Clock, User, Lock
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { Badge } from '../../../components/ui/badge';
import { Input } from '../../../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { Switch } from '../../../components/ui/switch';
import { Button } from '../../../components/ui/button';
import { cn } from '../../../lib/utils';
import LookupField from './LookupField';
import DynamicLookupField from '../../../components/fields/DynamicLookupField';
import DockedEmailComposer from '../../../components/email/DockedEmailComposer';
import AuditFieldsDisplay from '../../../components/fields/AuditFieldsDisplay';
import { useDependentPicklistRuntime } from '../../../modules/dependent-picklists';
import { useFieldSecurity } from '../../../contexts/FieldSecurityContext';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

/**
 * Format display value for a field
 * NOTE: Lookup fields are handled separately by LookupField component
 * NOTE: Email fields with onEmailClick handler are handled separately
 */
const formatDisplayValue = (value, field, onEmailClick, record) => {
  if (value === null || value === undefined || value === '') {
    return <span className="text-slate-400 italic">—</span>;
  }

  const fieldType = (field?.type || 'text').toLowerCase();

  // Lookup fields are handled by LookupField component - return null to indicate special handling
  if (fieldType === 'lookup' || fieldType === 'reference') {
    return null; // Signal to use LookupField component
  }

  switch (fieldType) {
    case 'email':
      // If email click handler is provided, render as clickable button
      if (onEmailClick) {
        return (
          <button
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onEmailClick(value, record);
            }}
            className="text-blue-600 hover:text-blue-800 hover:underline inline-flex items-center gap-1.5 group break-all"
            title="Click to compose email"
          >
            <Mail className="h-3.5 w-3.5 flex-shrink-0" />
            <span>{value}</span>
            <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
          </button>
        );
      }
      return <a href={`mailto:${value}`} className="text-blue-600 hover:underline break-all">{value}</a>;
    case 'phone':
    case 'tel':
      return <a href={`tel:${value}`} className="text-blue-600 hover:underline">{value}</a>;
    case 'url':
      const href = value.startsWith('http') ? value : `https://${value}`;
      return <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline break-all">{value}</a>;
    case 'checkbox':
    case 'boolean':
      return value === true || value === 'true'
        ? <Badge className="bg-green-100 text-green-700">Yes</Badge>
        : <Badge className="bg-slate-100 text-slate-600">No</Badge>;
    case 'select':
    case 'picklist':
      return <Badge className="bg-blue-50 text-blue-700 font-medium">{value}</Badge>;
    case 'currency':
      const num = parseFloat(value);
      return isNaN(num) ? value : `$${num.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
    case 'date':
      return new Date(value).toLocaleDateString();
    case 'textarea':
    case 'text_area':
    case 'long_text':
      return <span className="whitespace-pre-wrap break-words">{String(value)}</span>;
    default:
      return <span className="break-words">{String(value)}</span>;
  }
};

/**
 * Inline Editable Field Component
 */
const InlineField = ({
  fieldKey,
  field,
  value,
  onSave,
  onOpenRelated,
  onEmailClick,
  record,
  isEditable = true,
  objectName,
  // Dependent picklist props
  filteredOptions = null,  // Pre-filtered options for dependent picklists
  isDependentField = false,
  controllingFieldLabel = null,
  showControllingPrompt = false,
}) => {
  const navigate = useNavigate();
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const [isHovered, setIsHovered] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);
  const [resolvedUserName, setResolvedUserName] = useState(null);
  const [isResolvingUser, setIsResolvingUser] = useState(false);
  const inputRef = useRef(null);

  const fieldType = (field?.type || 'text').toLowerCase();
  const isRequired = field?.required;
  // const isReadOnly = field?.read_only || field?.is_auto || fieldType === 'formula' || fieldType === 'auto_number' || fieldType === 'lookup';
  const isReadOnly = field?.read_only || field?.is_auto || fieldType === 'formula' || fieldType === 'auto_number';
  
  // Detect user lookup fields by name (assigned_to, owner_id, etc.)
  const userLookupFields = ['assigned_to', 'owner_id', 'created_by', 'updated_by', 'owner'];
  const isUserLookupByName = userLookupFields.includes(fieldKey?.toLowerCase());
  const isLookupField = fieldType === 'lookup' || fieldType === 'reference' || isUserLookupByName;
  
  // Email fields with click handler should not be inline-editable
  const isEmailWithHandler = fieldType === 'email' && onEmailClick && value;

  // Resolve user name for user lookup fields
  useEffect(() => {
    const resolveUserName = async () => {
      if (!isUserLookupByName || !value || resolvedUserName) return;
      
      // Check if value looks like a UUID
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
      if (!isUUID) {
        setResolvedUserName(value); // Already a name, not a UUID
        return;
      }
      
      setIsResolvingUser(true);
      try {
        const token = localStorage.getItem('token');
        const API_URL = process.env.REACT_APP_BACKEND_URL;
        const response = await fetch(`${API_URL}/api/users/${value}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        if (response.ok) {
          const user = await response.json();
          const name = `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email;
          setResolvedUserName(name);
        }
      } catch (err) {
        console.error('Error resolving user name:', err);
        setResolvedUserName(value?.substring(0, 8) + '...');
      } finally {
        setIsResolvingUser(false);
      }
    };

    resolveUserName();
  }, [isUserLookupByName, value, resolvedUserName]);

  // Handle navigation to user detail page
  const handleUserClick = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (value && isUserLookupByName) {
      navigate(`/users/${value}`);
    }
  }, [value, isUserLookupByName, navigate]);

  // Phase 1 supported types - also allow user lookup fields to be editable
  const supportedTypes = ['text', 'number', 'email', 'phone', 'tel', 'date', 'select', 'picklist', 'checkbox', 'boolean', 'currency', 'percent', 'url','lookup'];
  const canEdit = isEditable && !isReadOnly && (supportedTypes.includes(fieldType) || isUserLookupByName) && !isEmailWithHandler;

  // Update edit value when prop changes
  useEffect(() => {
    if (!isEditing) setEditValue(value);
  }, [value, isEditing]);

  // Focus input when editing
  useEffect(() => {
    if (isEditing && inputRef.current) {
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select?.();
      }, 10);
    }
  }, [isEditing]);

  const handleStartEdit = () => {
    if (!canEdit) return;
    setIsEditing(true);
    setEditValue(value);
    setError(null);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditValue(value);
    setError(null);
  };

  const handleSave = async () => {
    // Validate required
    if (isRequired && (editValue === null || editValue === undefined || editValue === '')) {
      setError(`${field?.label || fieldKey} is required`);
      return;
    }

    // Skip if unchanged
    if (editValue === value) {
      setIsEditing(false);
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      await onSave(fieldKey, editValue);
      setIsEditing(false);
    } catch (err) {
      // Ensure error is always a string, not an object
      const errorMessage = typeof err === 'string' 
        ? err 
        : (err?.message || 'Failed to save');
      setError(errorMessage);
    } finally {
      setIsSaving(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancel();
    }
  };

  const handleBlur = (e) => {
    // Don't save on blur if clicking buttons
    const target = e.relatedTarget;
    if (target?.closest('[data-action-button]')) return;

    if (editValue !== value) {
      handleSave();
    } else {
      handleCancel();
    }
  };

  // Render edit input based on type
  const renderInput = () => {
    const commonProps = {
      ref: inputRef,
      onKeyDown: handleKeyDown,
      disabled: isSaving,
      className: 'h-9 text-sm',
    };

    switch (fieldType) {
      case 'checkbox':
      case 'boolean':
        return (
          <div className="flex items-center gap-3 h-9 px-2">
            <Switch
              checked={editValue === true || editValue === 'true'}
              onCheckedChange={(checked) => {
                setEditValue(checked);
                // Auto-save for checkbox
                setTimeout(() => handleSave(), 0);
              }}
              disabled={isSaving}
            />
            <span className="text-sm text-slate-600">{editValue === true || editValue === 'true' ? 'Yes' : 'No'}</span>
          </div>
        );

      case 'select':
      case 'picklist':
        // Use filteredOptions if provided (for dependent picklists), otherwise use all options
        const allOptions = field?.options || field?.picklist_values || [];
        const options = filteredOptions !== null ? filteredOptions : allOptions;
        
        // If this is a dependent field and no controlling value is selected, show prompt
        if (showControllingPrompt) {
          return (
            <div className="p-2 text-sm text-slate-500 text-center bg-slate-50 rounded">
              Please select {controllingFieldLabel} first
            </div>
          );
        }
        
        return (
          <Select value={editValue || ''} onValueChange={setEditValue} disabled={isSaving}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder={options.length > 0 ? "Select..." : "No options available"} />
            </SelectTrigger>
            <SelectContent>
              {options.length === 0 ? (
                <div className="p-2 text-sm text-slate-500 text-center">
                  {isDependentField ? `No options for selected ${controllingFieldLabel}` : "No options available"}
                </div>
              ) : (
                options.map(opt => {
                  const val = typeof opt === 'string' ? opt : opt.value;
                  const label = typeof opt === 'string' ? opt : (opt.label || opt.value);
                  return <SelectItem key={val} value={val}>{label}</SelectItem>;
                })
              )}
            </SelectContent>
          </Select>
        );

      case 'date':
        return <Input {...commonProps} type="date" value={editValue || ''} onChange={(e) => setEditValue(e.target.value)} onBlur={handleBlur} />;

      case 'number':
      case 'currency':
      case 'percent':
        return <Input {...commonProps} type="number" step={fieldType === 'currency' ? '0.01' : '1'} value={editValue ?? ''} onChange={(e) => setEditValue(e.target.value === '' ? null : Number(e.target.value))} onBlur={handleBlur} />;

      case 'email':
        return <Input {...commonProps} type="email" value={editValue || ''} onChange={(e) => setEditValue(e.target.value)} onBlur={handleBlur} placeholder="email@example.com" />;

      case 'phone':
      case 'tel':
        return <Input {...commonProps} type="tel" value={editValue || ''} onChange={(e) => setEditValue(e.target.value)} onBlur={handleBlur} />;

      case 'url':
        return <Input {...commonProps} type="url" value={editValue || ''} onChange={(e) => setEditValue(e.target.value)} onBlur={handleBlur} placeholder="https://example.com" />;

     case 'lookup':
case 'reference': {
  const targetObjectType =
    field?.reference_to ||
    field?.lookup_object ||
    field?.related_object;

  return (
    <DynamicLookupField
      value={editValue}
      onChange={(recordId) => {
        setEditValue(recordId);
      }}
      objectType={targetObjectType}
      sourceObject={objectName}
      fieldName={fieldKey}
      label={field?.label || fieldKey}
      placeholder={`Search ${targetObjectType}...`}
      required={field?.required}
      disabled={isSaving}
      allowCreate={true}
      showPreview={true}
    />
  );
}


      default:
        // Check if this is a user lookup field by name (assigned_to, owner_id, etc.)
        if (isUserLookupByName) {
          return (
            <DynamicLookupField
              value={editValue}
              onChange={(recordId) => {
                setEditValue(recordId);
              }}
              objectType="user"
              sourceObject={objectName}
              fieldName={fieldKey}
              label={field?.label || fieldKey}
              placeholder="Search users..."
              required={field?.required}
              disabled={isSaving}
              allowCreate={false}
              showPreview={true}
            />
          );
        }
        return <Input {...commonProps} type="text" value={editValue || ''} onChange={(e) => setEditValue(e.target.value)} onBlur={handleBlur} />;
    }
  };

  return (
    <div className={cn("relative group w-full max-w-full box-border", (fieldType === 'lookup' || fieldType === 'reference' || isUserLookupByName) ? 'overflow-visible' : 'overflow-hidden')} style={{ minWidth: 0 }} data-testid={`inline-field-${fieldKey}`}>
      {/* Label */}
      <label className="block text-xs font-medium text-slate-500 mb-1.5 uppercase tracking-wide truncate max-w-full">
        {field?.label || fieldKey.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
        {isRequired && <span className="text-red-500 ml-0.5">*</span>}
        {isReadOnly && <span className="text-slate-400 ml-1 text-[10px] normal-case">(read-only)</span>}
      </label>

      {/* Value / Edit */}
      <div
        className={`
          relative min-h-[32px] flex items-start rounded transition-all duration-150
          ${!isEditing ? 'py-1' : ''}
          ${canEdit && !isEditing ? 'hover:bg-slate-50 cursor-pointer' : ''}
          ${isEditing ? 'ring-2 ring-blue-500 ring-offset-1 bg-white shadow-sm' : ''}
          ${error ? 'ring-2 ring-red-500 ring-offset-1' : ''}
          ${(fieldType === 'lookup' || fieldType === 'reference' || isUserLookupByName) && isEditing ? 'z-50 overflow-visible' : ''}
        `}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onClick={!isEditing && canEdit ? handleStartEdit : undefined}
      >
        {isEditing ? (
          <div className="flex-1 flex items-center gap-2 w-full">
            <div className="flex-1 min-w-0">{renderInput()}</div>
            {fieldType !== 'checkbox' && fieldType !== 'boolean' && (
              <div className="flex items-center gap-1 flex-shrink-0" data-action-button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-green-600 hover:text-green-700 hover:bg-green-50"
                  onClick={(e) => { e.stopPropagation(); handleSave(); }}
                  disabled={isSaving}
                  data-action-button
                >
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                  onClick={(e) => { e.stopPropagation(); handleCancel(); }}
                  disabled={isSaving}
                  data-action-button
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="flex-1 text-sm text-slate-800 min-w-0 break-words pr-6">
              {/* Use LookupField for lookup/reference types, show user name for user lookups */}
              {isUserLookupByName ? (
                // User lookup - show resolved name and make clickable
                <button
                  onClick={handleUserClick}
                  className="inline-flex items-center gap-1.5 text-blue-600 hover:text-blue-800 hover:underline group/user cursor-pointer"
                  title="Open user profile"
                  data-testid={`user-lookup-${fieldKey}`}
                >
                  {isResolvingUser ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <User className="h-3 w-3" />
                  )}
                  <span className="truncate max-w-[200px]">
                    {resolvedUserName || value?.substring?.(0, 12) + '...' || '—'}
                  </span>
                  <ExternalLink className="h-3 w-3 opacity-0 group-hover/user:opacity-100 transition-opacity flex-shrink-0" />
                </button>
              ) : (fieldType === 'lookup' || fieldType === 'reference') ? (
                <LookupField
                  value={value}
                  objectType={field?.reference_to || field?.lookup_object || field?.related_object}
                  sourceObject={objectName}
                  fieldName={fieldKey}
                  showPreview={true}
                  onNavigate={onOpenRelated}
                />
              ) : (
                <span className="break-words">{formatDisplayValue(value, field, onEmailClick, record)}</span>
              )}
            </div>
            {canEdit && isHovered && !isEmailWithHandler && (
              <div className="absolute right-0 top-0 opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="bg-white rounded-full p-1 shadow-sm border border-slate-200">
                  <Pencil className="h-3 w-3 text-slate-500" />
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-1 mt-1">
          <AlertCircle className="h-3 w-3 text-red-500" />
          <p className="text-xs text-red-500">
            {typeof error === 'string' ? error : (error?.message || 'An error occurred')}
          </p>
        </div>
      )}
    </div>
  );
};

/**
 * Section Component
 */
const FieldSection = ({
  section,
  recordData,
  objectFields,
  onFieldSave,
  onOpenRelated,
  onEmailClick,
  record,
  defaultExpanded = true,
  objectName,
  // Dependent picklist props
  isDependentField,
  getControllingField,
  getFilteredOptions,
  isChainSatisfied,
  getFirstMissingInChain,
  dependenciesInitialized,
  // Field-Level Security
  isFieldHidden,
  isFieldReadOnly,
}) => {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const columns = section?.columns || 2;
  const sectionName = section?.name || section?.label || 'Details';
  const sectionFields = section?.fields || [];

  // Audit field keys to filter out
  const auditFieldKeys = ['created_at', 'created_by', 'updated_at', 'updated_by', 'createdAt', 'createdBy', 'updatedAt', 'updatedBy'];

  // Get visible fields - now includes FLS filtering
  const visibleFields = useMemo(() => {
    return sectionFields.filter(f => {
      const key = typeof f === 'string' ? f : f?.key || f?.api_name;
      // Skip audit fields - they're shown separately
      if (auditFieldKeys.includes(key)) return false;
      
      // Skip fields hidden by FLS
      if (isFieldHidden && isFieldHidden(objectName, key)) return false;
      
      const fieldSchema = objectFields?.[key];
      return fieldSchema && !fieldSchema.hidden;
    });
  }, [sectionFields, objectFields, objectName, isFieldHidden]);

  if (visibleFields.length === 0) return null;

  return (
    <Card className="shadow-sm border-slate-200 mb-4 overflow-hidden w-full min-w-0">
      <CardHeader
        className="py-3 px-4 bg-gradient-to-r from-slate-50 to-white cursor-pointer hover:from-slate-100 hover:to-slate-50 transition-colors border-b rounded-t-lg"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            {sectionName}
            <Badge variant="outline" className="text-[10px] text-slate-400 font-normal">
              {visibleFields.length} field{visibleFields.length !== 1 ? 's' : ''}
            </Badge>
          </CardTitle>
          {expanded ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="p-0 bg-white overflow-hidden">
          <div 
            className={`grid gap-0 ${columns === 2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}
            style={{ gridTemplateColumns: columns === 2 ? 'repeat(2, minmax(0, 1fr))' : 'minmax(0, 1fr)' }}
          >
            {visibleFields.map((fieldDef, idx) => {
              const key = typeof fieldDef === 'string' ? fieldDef : fieldDef?.key || fieldDef?.api_name;
              const field = objectFields?.[key];
              const value = recordData?.[key];

              if (!field) return null;

              // Check if this is a dependent field and compute filtered options
              const isDependent = isDependentField?.(key) && dependenciesInitialized;
              const controllingFieldApi = isDependent ? getControllingField?.(key) : null;
              const controllingFieldLabel = controllingFieldApi 
                ? (objectFields?.[controllingFieldApi]?.label || controllingFieldApi)
                : null;
              
              // Get the first missing field in the chain
              const firstMissingField = isDependent ? getFirstMissingInChain?.(key) : null;
              const chainSatisfied = isDependent ? isChainSatisfied?.(key) : true;
              const showControllingPrompt = isDependent && !chainSatisfied;
              
              // Get filtered options for dependent picklists
              const fieldType = (field?.type || '').toLowerCase();
              let filteredOptions = null;
              if (isDependent && (fieldType === 'picklist' || fieldType === 'select')) {
                const allOptions = field?.options || field?.picklist_values || [];
                filteredOptions = getFilteredOptions?.(key, allOptions) || [];
              }
              
              // Get the label of the missing field for the prompt
              const missingFieldLabel = firstMissingField 
                ? (objectFields?.[firstMissingField]?.label || firstMissingField)
                : controllingFieldLabel;

              // Check FLS read-only status
              const isFlsReadOnly = isFieldReadOnly ? isFieldReadOnly(objectName, key) : false;

              return (
                <div 
                  key={key} 
                  className="px-4 py-3 border-b border-slate-100 border-r border-r-slate-100 last:border-r-0 overflow-hidden box-border min-w-0"
                >
                  <InlineField
                    fieldKey={key}
                    field={field}
                    value={value}
                    onSave={onFieldSave}
                    onOpenRelated={onOpenRelated}
                    onEmailClick={onEmailClick}
                    record={record}
                    isEditable={!isFlsReadOnly}
                    isReadOnly={isFlsReadOnly}
                    objectName={objectName}
                    // Dependent picklist props
                    filteredOptions={filteredOptions}
                    isDependentField={isDependent}
                    controllingFieldLabel={missingFieldLabel}
                    showControllingPrompt={showControllingPrompt}
                  />
                  {/* Show FLS read-only indicator */}
                  {isFlsReadOnly && (
                    <div className="flex items-center gap-1 mt-1 text-xs text-amber-600">
                      <Lock className="h-3 w-3" />
                      <span>Read-only (Field Security)</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      )}
    </Card>
  );
};

/**
 * Main RecordDetailComponent
 */
const RecordDetailComponent = ({ config = {}, context: contextProp = {}, ...spreadProps }) => {
  // Support both context object and spread props patterns
  // ComponentRenderer spreads context as individual props, so we need to handle both
  const context = {
    ...contextProp,
    ...spreadProps,
  };
  
  const { record, objectName, objectSchema, onRecordUpdate, onOpenRelated } = context;
  const recordData = record?.data || {};
  const objectFields = objectSchema?.fields || {};
  
  // Field-Level Security (FLS)
  const { isFieldHidden, isFieldReadOnly } = useFieldSecurity();
  
  // Email composer modal state
  const [emailComposerOpen, setEmailComposerOpen] = useState(false);
  const [emailRecipient, setEmailRecipient] = useState({ email: '', name: '' });

  // Dependent Picklist Runtime Hook for inline editing
  const {
    isDependentField,
    getControllingField,
    getFilteredOptions,
    isChainSatisfied,
    getFirstMissingInChain,
    initialized: dependenciesInitialized
  } = useDependentPicklistRuntime(
    objectName, 
    record?.record_type_id, 
    recordData
  );

  // Handle field save
  const handleFieldSave = useCallback(async (fieldKey, newValue) => {
    try {
      const token = localStorage.getItem('token');
      const recordId = record?.id || record?.series_id;

      // Optimistic update
      const updatedData = { ...recordData, [fieldKey]: newValue };

      await axios.put(
        `${API}/objects/${objectName}/records/${recordId}`,
        { data: updatedData },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      // Update parent state
      if (onRecordUpdate) {
        onRecordUpdate({ ...record, data: updatedData });
      }

      const fieldLabel = objectFields[fieldKey]?.label || fieldKey;
      toast.success(`${fieldLabel} updated`, {
        duration: 2000,
        position: 'bottom-center',
        style: { background: '#10B981', color: 'white', fontSize: '14px' },
      });
    } catch (error) {
      console.error('Error saving field:', error);
      // Handle error objects with nested message structure
      const errorData = error.response?.data?.detail;
      let message = 'Failed to save';
      if (typeof errorData === 'string') {
        message = errorData;
      } else if (errorData?.message) {
        message = errorData.message;
      } else if (error.message) {
        message = error.message;
      }
      toast.error(message);
      throw new Error(message);
    }
  }, [record, objectName, recordData, objectFields, onRecordUpdate]);

  // Handle email click - open docked composer
  const handleEmailClick = useCallback((email, rec) => {
    // Get recipient name from record data
    const recipientName = rec?.data?.Name || rec?.data?.name || 
                         `${rec?.data?.first_name || ''} ${rec?.data?.last_name || ''}`.trim() ||
                         '';
    // Get record name for Related To field
    const recordName = recipientName || rec?.id?.substring(0, 12) || 'Record';
    
    setEmailRecipient({ 
      email, 
      name: recipientName,
      recordName: recordName 
    });
    setEmailComposerOpen(true);
  }, []);

  // Get sections from config
  const sections = useMemo(() => {
    // Get columns from config - default to 2
    const layoutColumns = config?.columns || 2;
    
    // Helper function to filter fields that exist in schema
    const filterValidFields = (fields) => {
      if (Object.keys(objectFields).length === 0) return fields; // Can't filter if no schema
      return fields.filter(f => {
        const key = typeof f === 'string' ? f : f?.key || f?.api_name || f?.field;
        return key && objectFields[key] !== undefined;
      });
    };
    
    // From component config (layout builder) - items array
    if (config?.items && Array.isArray(config.items) && config.items.length > 0) {
      // Check if items contain sections
      const sectionsFromItems = config.items.filter(item => item.type === 'field_section');
      if (sectionsFromItems.length > 0) {
        const validSections = sectionsFromItems.map(s => ({
          id: s.id,
          name: s.label,
          columns: layoutColumns,
          fields: filterValidFields(s.fields || []),
        })).filter(s => s.fields.length > 0);
        
        if (validSections.length > 0) return validSections;
        // Fall through to schema-based if no valid sections
      } else {
        // Otherwise, wrap all items in a default section
        // Filter to only include fields that exist in the object schema
        const validFields = config.items
          .map(item => ({
            key: item.key || item.field,
            label: item.label,
          }))
          .filter(f => {
            if (Object.keys(objectFields).length === 0) return true;
            return f.key && objectFields[f.key] !== undefined;
          });
        
        if (validFields.length > 0) {
          return [{
            id: 'default',
            name: 'Record Information',
            columns: layoutColumns,
            fields: validFields,
          }];
        }
        // Fall through to schema-based if no valid fields
      }
    }

    // From system layout format - tabs with sections
    if (config?.tabs && Array.isArray(config.tabs)) {
      const allSections = [];
      config.tabs.forEach(tab => {
        if (tab.sections && Array.isArray(tab.sections)) {
          tab.sections.forEach((section, idx) => {
            const validFields = filterValidFields(section.fields || []);
            if (validFields.length > 0) {
              allSections.push({
                id: section.id || `${tab.id}-section-${idx}`,
                name: section.name || section.label || 'Details',
                columns: section.columns || layoutColumns,
                fields: validFields,
              });
            }
          });
        }
      });
      if (allSections.length > 0) return allSections;
    }

    // From direct sections array (system layout)
    if (config?.sections && Array.isArray(config.sections) && config.sections.length > 0) {
      const validSections = config.sections.map((section, idx) => ({
        id: section.id || `section-${idx}`,
        name: section.name || section.label || 'Details',
        columns: section.columns || layoutColumns,
        fields: filterValidFields(section.fields || []),
      })).filter(s => s.fields.length > 0);
      
      if (validSections.length > 0) return validSections;
    }

    // Fallback: Generate from schema
    const fieldKeys = Object.keys(objectFields).filter(key => {
      const field = objectFields[key];
      return !field.hidden && !field.is_system;
    });

    if (fieldKeys.length === 0) return [];

    return [{
      id: 'default',
      name: 'Record Information',
      columns: layoutColumns,  // Use layout columns setting
      fields: fieldKeys.slice(0, 20),
    }];
  }, [config, objectFields]);

  if (!record) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
        <span className="ml-2 text-slate-500">Loading record...</span>
      </div>
    );
  }

  if (sections.length === 0) {
    return (
      <Card className="shadow-sm border-slate-200">
        <CardContent className="p-6 text-center">
          <p className="text-slate-500">No fields configured for this layout</p>
          <p className="text-sm text-slate-400 mt-1">
            Configure fields in Lightning Page Builder to customize this view
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div data-testid="record-detail-component" className="overflow-visible w-full max-w-full" style={{ minWidth: 0, flex: '1 1 0%' }}>
      {sections.map((section, index) => (
        <FieldSection
          key={section.id || index}
          section={section}
          recordData={recordData}
          objectFields={objectFields}
          onFieldSave={handleFieldSave}
          onOpenRelated={onOpenRelated}
          onEmailClick={handleEmailClick}
          record={record}
          defaultExpanded={index < 3}
          objectName={objectName}
          // Dependent picklist props
          isDependentField={isDependentField}
          getControllingField={getControllingField}
          getFilteredOptions={getFilteredOptions}
          isChainSatisfied={isChainSatisfied}
          getFirstMissingInChain={getFirstMissingInChain}
          dependenciesInitialized={dependenciesInitialized}
          // Field-Level Security props
          isFieldHidden={isFieldHidden}
          isFieldReadOnly={isFieldReadOnly}
        />
      ))}
      
      {/* System Information / Audit Fields */}
      <AuditFieldsDisplay 
        record={record}
        className="mt-4"
      />
      
      {/* Docked Email Composer - Salesforce Style */}
      <DockedEmailComposer
        isOpen={emailComposerOpen}
        onClose={() => setEmailComposerOpen(false)}
        recipientEmail={emailRecipient.email}
        recipientName={emailRecipient.name}
        relatedRecordId={record?.id || record?.series_id}
        relatedRecordType={objectName}
        relatedRecordName={emailRecipient.recordName}
      />
    </div>
  );
};

export default RecordDetailComponent;
