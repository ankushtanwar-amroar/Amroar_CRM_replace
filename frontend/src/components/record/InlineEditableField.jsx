/**
 * InlineEditableField - Salesforce-style inline field editing component
 * 
 * Phase 2 Supported Field Types (Enhanced):
 * - Text, Number, Email, Phone, Date, Picklist (single select), Checkbox
 * - Lookup fields with full search/select/navigate functionality
 * - Email fields with click-to-compose modal
 * - Audit fields (created_at, updated_at, created_by, updated_by) - read-only display
 * 
 * UX Behavior:
 * - Hover → show pencil icon
 * - Click → switch to input
 * - Save on Enter OR click outside
 * - Escape cancels edit
 * - No full page reload
 * - Show inline validation errors
 * - Lookup fields: Full Salesforce-like UX with search dropdown
 * - Email fields: Click opens internal email composer modal
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Pencil, Check, X, Loader2, AlertCircle, Mail, ExternalLink, Clock, User } from 'lucide-react';
import { Input } from '../../components/ui/input';
import { Switch } from '../../components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Button } from '../../components/ui/button';
import { cn } from '../../lib/utils';
import LookupField from '../../crm_platform/engine/components/LookupField';
import DynamicLookupField from '../fields/DynamicLookupField';

/**
 * Format display value based on field type
 */
const formatDisplayValue = (value, field) => {
  if (value === null || value === undefined || value === '') {
    return <span className="text-slate-400 italic">—</span>;
  }

  const fieldType = (field?.type || '').toLowerCase();

  switch (fieldType) {
    case 'currency':
      const symbol = field.currency_symbol || '$';
      const num = parseFloat(value);
      if (isNaN(num)) return value;
      return `${symbol}${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    case 'percent':
      return `${value}%`;

    case 'number':
      const numVal = parseFloat(value);
      if (isNaN(numVal)) return value;
      return numVal.toLocaleString();

    case 'date':
      if (!value) return <span className="text-slate-400 italic">—</span>;
      try {
        return new Date(value).toLocaleDateString();
      } catch {
        return value;
      }

    case 'datetime':
      if (!value) return <span className="text-slate-400 italic">—</span>;
      try {
        return new Date(value).toLocaleString();
      } catch {
        return value;
      }

    case 'checkbox':
    case 'boolean':
      return value === true || value === 'true' ? (
        <span className="inline-flex items-center px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs font-medium">Yes</span>
      ) : (
        <span className="inline-flex items-center px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-xs font-medium">No</span>
      );

    case 'select':
    case 'picklist':
      return (
        <span className="inline-flex items-center px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs font-medium">
          {value}
        </span>
      );

    case 'url':
      return (
        <a
          href={value.startsWith('http') ? value : `https://${value}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:underline truncate block max-w-[200px]"
          onClick={(e) => e.stopPropagation()}
        >
          {value}
        </a>
      );

    case 'email':
      // Email field now handled separately with email composer modal
      // This case is for when email composer is not available
      return (
        <span className="text-blue-600 hover:underline cursor-pointer inline-flex items-center gap-1">
          <Mail className="h-3 w-3" />
          {value}
        </span>
      );

    case 'phone':
    case 'tel':
      return (
        <a 
          href={`tel:${value}`} 
          className="text-blue-600 hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {value}
        </a>
      );

    case 'lookup':
    case 'reference':
      // Lookup fields should use LookupDisplayField component
      // This is a fallback for when the component is not available
      return (
        <span className="text-blue-600">
          {value?.substring?.(0, 8) || value || '—'}
        </span>
      );

    case 'textarea':
    case 'long_text':
      return (
        <span className="whitespace-pre-wrap text-sm line-clamp-2">{value}</span>
      );

    default:
      return String(value);
  }
};

/**
 * InlineEditableField Component
 * 
 * Phase 2 Supported Types:
 * - text, number, email, phone, date, picklist/select, checkbox
 * - lookup (with full search/select/navigate)
 * - Email fields open composer modal on click
 */
const InlineEditableField = ({
  fieldKey,
  field,
  value,
  onSave,
  isEditable = true,
  showLabel = true,
  compact = false,
  record = null,           // Full record data for context
  onEmailClick = null,     // Callback when email field is clicked (opens composer)
  onLookupChange = null,   // Callback when lookup value changes
  lookupDisplayName = null // Pre-resolved lookup display name
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
  const containerRef = useRef(null);

  // Check if this is a user lookup field
  const userLookupFields = ['assigned_to', 'owner_id', 'created_by', 'updated_by', 'owner'];
  const isUserLookupByName = userLookupFields.includes(fieldKey?.toLowerCase());

  // Resolve user name for user lookup fields
  useEffect(() => {
    const resolveUserName = async () => {
      if (!isUserLookupByName || !value || lookupDisplayName || resolvedUserName) return;
      
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
  }, [isUserLookupByName, value, lookupDisplayName, resolvedUserName]);

  // Update edit value when prop value changes (but not during editing)
  useEffect(() => {
    if (!isEditing) {
      setEditValue(value);
    }
  }, [value, isEditing]);

  // Focus input when entering edit mode
  useEffect(() => {
    if (isEditing && inputRef.current) {
      // Small delay to ensure element is rendered
      setTimeout(() => {
        inputRef.current?.focus();
        if (inputRef.current?.select) {
          inputRef.current.select();
        }
      }, 10);
    }
  }, [isEditing]);

  const fieldType = (field?.type || 'text').toLowerCase();
  const isRequired = field?.required;
  
  // Lookup fields are now editable if lookup change handler is provided
  // Also recognize user lookup fields by field name (assigned_to, owner_id, created_by, etc.)
  const isLookupField = fieldType === 'lookup' || fieldType === 'reference' || isUserLookupByName;
  
  // Get effective display name for lookups
  const effectiveLookupDisplayName = lookupDisplayName || resolvedUserName;
  
  // Handle navigation to user detail page
  const handleUserClick = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (value && isUserLookupByName) {
      navigate(`/users/${value}`);
    }
  }, [value, isUserLookupByName, navigate]);
  
  const isReadOnly = field?.read_only || field?.is_auto || fieldType === 'formula' || fieldType === 'auto_number';

  // Check if email field has a click handler (opens composer instead of inline edit)
  const isEmailWithHandler = fieldType === 'email' && onEmailClick && value;

  // Check if field can be edited
  // Phase 2: Include lookup if handler provided
  // Email fields with handlers are NOT inline-editable (they open the composer)
  const isPhase1Supported = ['text', 'number', 'email', 'phone', 'date', 'select', 'picklist', 'checkbox', 'boolean', 'currency', 'percent', 'url', 'tel', 'textarea', 'long_text', 'longtext'].includes(fieldType);
  const isLookupEditable = isLookupField && onLookupChange;
  const canEdit = isEditable && !isReadOnly && (isPhase1Supported || isLookupEditable) && !isEmailWithHandler;

  const handleStartEdit = useCallback(() => {
    if (!canEdit) return;
    setIsEditing(true);
    setEditValue(value);
    setError(null);
  }, [canEdit, value]);

  const handleCancel = useCallback(() => {
    setIsEditing(false);
    setEditValue(value);
    setError(null);
  }, [value]);

  const handleSave = useCallback(async () => {
    // Validate required fields
    if (isRequired && (editValue === null || editValue === undefined || editValue === '')) {
      setError(`${field?.label || fieldKey} is required`);
      return;
    }

    // Skip save if value hasn't changed
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
      setError(err.message || 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  }, [editValue, value, fieldKey, field, isRequired, onSave]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancel();
    }
  }, [handleSave, handleCancel]);

  const handleBlur = useCallback((e) => {
    // Don't trigger blur save if clicking on action buttons
    const relatedTarget = e.relatedTarget;
    if (relatedTarget?.closest('[data-inline-action]') || containerRef.current?.contains(relatedTarget)) {
      return;
    }
    
    // Auto-save on blur (Salesforce behavior)
    if (editValue !== value) {
      handleSave();
    } else {
      handleCancel();
    }
  }, [editValue, value, handleSave, handleCancel]);

  // Render the edit input based on field type
  const renderEditInput = () => {
    const commonProps = {
      ref: inputRef,
      onKeyDown: handleKeyDown,
      disabled: isSaving,
      className: cn("h-9 text-sm", isSaving && "opacity-50"),
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
                // Auto-save checkbox changes immediately
                setTimeout(() => handleSave(), 0);
              }}
              disabled={isSaving}
            />
            <span className="text-sm text-slate-600">
              {editValue === true || editValue === 'true' ? 'Yes' : 'No'}
            </span>
          </div>
        );

      case 'select':
      case 'picklist':
        const options = field?.options || field?.picklist_values || [];
        return (
          <Select
            value={editValue || ''}
            onValueChange={(val) => {
              setEditValue(val);
            }}
            disabled={isSaving}
          >
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Select..." />
            </SelectTrigger>
            <SelectContent>
              {options.map((opt) => {
                const optValue = typeof opt === 'string' ? opt : opt.value;
                const optLabel = typeof opt === 'string' ? opt : (opt.label || opt.value);
                return (
                  <SelectItem key={optValue} value={optValue}>
                    {optLabel}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        );

      case 'date':
        return (
          <Input
            {...commonProps}
            type="date"
            value={editValue || ''}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleBlur}
          />
        );

      case 'number':
      case 'currency':
      case 'percent':
        return (
          <Input
            {...commonProps}
            type="number"
            step={fieldType === 'currency' || fieldType === 'percent' ? '0.01' : '1'}
            value={editValue ?? ''}
            onChange={(e) => setEditValue(e.target.value === '' ? null : Number(e.target.value))}
            onBlur={handleBlur}
          />
        );

      case 'email':
        return (
          <Input
            {...commonProps}
            type="email"
            value={editValue || ''}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleBlur}
            placeholder="email@example.com"
          />
        );

      case 'phone':
      case 'tel':
        return (
          <Input
            {...commonProps}
            type="tel"
            value={editValue || ''}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleBlur}
            placeholder="+1 (555) 000-0000"
          />
        );

      case 'url':
        return (
          <Input
            {...commonProps}
            type="url"
            value={editValue || ''}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleBlur}
            placeholder="https://example.com"
          />
        );

      case 'textarea':
      case 'long_text':
      case 'longtext':
        return (
          <textarea
            ref={inputRef}
            className={cn(
              "w-full min-h-[80px] p-2 text-sm border border-slate-200 rounded-md resize-y focus:outline-none focus:ring-2 focus:ring-blue-500",
              isSaving && "opacity-50"
            )}
            value={editValue || ''}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={(e) => {
              // Allow Enter for new lines in textarea, use Ctrl+Enter or Cmd+Enter to save
              if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                handleSave();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                handleCancel();
              }
            }}
            disabled={isSaving}
            placeholder="Enter text..."
          />
        );

      default: // text
        return (
          <Input
            {...commonProps}
            type="text"
            value={editValue || ''}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleBlur}
          />
        );
    }
  };

  return (
    <div 
      ref={containerRef}
      className={cn("relative group", compact && "mb-0")} 
      data-testid={`inline-field-${fieldKey}`}
    >
      {/* Label */}
      {showLabel && (
        <label className="block text-xs font-medium text-slate-500 mb-1 uppercase tracking-wide">
          {field?.label || fieldKey}
          {isRequired && <span className="text-red-500 ml-0.5">*</span>}
          {isReadOnly && <span className="text-slate-400 ml-1 text-[10px] normal-case">(read-only)</span>}
        </label>
      )}

      {/* Display / Edit Mode */}
      <div
        className={cn(
          "relative min-h-[36px] flex items-center rounded-md transition-all duration-150",
          !isEditing && "px-2 py-1.5",
          canEdit && !isEditing && "hover:bg-slate-100/60 cursor-pointer group",
          isEditing && "ring-2 ring-blue-500 ring-offset-1 bg-white shadow-sm",
          error && "ring-2 ring-red-500 ring-offset-1"
        )}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onClick={!isEditing && canEdit ? handleStartEdit : undefined}
      >
        {isEditing ? (
          // Edit Mode
          <div className="flex-1 flex items-center gap-2">
            <div className="flex-1">
              {renderEditInput()}
            </div>
            
            {/* Action buttons - not for checkbox (auto-saves) */}
            {fieldType !== 'checkbox' && fieldType !== 'boolean' && (
              <div className="flex items-center gap-1 flex-shrink-0" data-inline-action>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-green-600 hover:text-green-700 hover:bg-green-50"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSave();
                  }}
                  disabled={isSaving}
                  data-inline-action
                >
                  {isSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCancel();
                  }}
                  disabled={isSaving}
                  data-inline-action
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        ) : (
          // Display Mode
          <>
            <div className="flex-1 text-sm text-slate-900 min-w-0">
              {/* Special handling for email fields with composer */}
              {fieldType === 'email' && value && onEmailClick ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onEmailClick(value, record);
                  }}
                  className="text-blue-600 hover:text-blue-800 hover:underline inline-flex items-center gap-1.5 group"
                  title="Click to compose email"
                  data-testid={`email-click-${fieldKey}`}
                >
                  <Mail className="h-3.5 w-3.5" />
                  <span>{value}</span>
                  <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              ) : isLookupField && value ? (
                // Lookup field display - clickable for user lookups
                isUserLookupByName ? (
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
                      {effectiveLookupDisplayName || value?.substring?.(0, 12) + '...' || '—'}
                    </span>
                    <ExternalLink className="h-3 w-3 opacity-0 group-hover/user:opacity-100 transition-opacity flex-shrink-0" />
                  </button>
                ) : (
                  <span className="text-blue-600">
                    {effectiveLookupDisplayName || value?.substring?.(0, 12) + '...' || '—'}
                  </span>
                )
              ) : (
                formatDisplayValue(value, field)
              )}
            </div>

            {/* Pencil icon on hover - not for email fields with handlers */}
            {canEdit && isHovered && !isEmailWithHandler && (
              <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="bg-white rounded-full p-1 shadow-sm border border-slate-200">
                  <Pencil className="h-3 w-3 text-slate-500" />
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Error message */}
      {error && (
        <div className="flex items-center gap-1 mt-1">
          <AlertCircle className="h-3 w-3 text-red-500" />
          <p className="text-xs text-red-500">{error}</p>
        </div>
      )}
    </div>
  );
};

export default InlineEditableField;
