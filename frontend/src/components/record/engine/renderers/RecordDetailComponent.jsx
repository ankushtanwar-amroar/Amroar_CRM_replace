/**
 * RecordDetailComponent - Inline-editable Record Fields
 * 
 * Renders record fields based on layout configuration with inline editing support.
 * Respects:
 * - Section grouping
 * - Column count
 * - Field order
 * - Hidden fields
 * - Field visibility rules
 * - Lookup fields with full Salesforce-like UX
 * - Email fields with click-to-compose
 * - Audit fields (created_at, updated_at, created_by, updated_by)
 * - Owner field with inline editing
 */
import React, { useState, useCallback, useMemo } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { ChevronDown, ChevronUp, Loader2, Info, User } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../../../components/ui/card';
import { Badge } from '../../../../components/ui/badge';
import { cn } from '../../../../lib/utils';
import InlineEditableField from '../../InlineEditableField';
import LookupDisplayField from '../../../fields/LookupDisplayField';
import AuditFieldsDisplay from '../../../fields/AuditFieldsDisplay';
import EmailComposerModal from '../../../email/EmailComposerModal';
import InlineOwnerField from '../../../fields/InlineOwnerField';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

/**
 * Section Component - Collapsible section with fields
 */
const RecordSection = ({
  section,
  record,
  objectFields,
  onFieldSave,
  onLookupChange,
  onEmailClick,
  isEditable = true,
  defaultExpanded = true,
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  
  // Get fields for this section
  const sectionFields = section?.fields || [];
  const columns = section?.columns || 2;
  const sectionName = section?.name || section?.label || section?.id || 'Details';
  
  // Filter out fields that don't exist in schema or are hidden
  // Also filter out audit fields - they're shown separately
  const auditFieldKeys = ['created_at', 'created_by', 'updated_at', 'updated_by', 'createdAt', 'createdBy', 'updatedAt', 'updatedBy'];
  const visibleFields = useMemo(() => {
    return sectionFields.filter(fieldDef => {
      const fieldKey = typeof fieldDef === 'string' ? fieldDef : fieldDef?.key || fieldDef?.api_name;
      if (!fieldKey) return false;
      // Skip audit fields - they're rendered separately
      if (auditFieldKeys.includes(fieldKey)) return false;
      const field = objectFields?.[fieldKey];
      return field && !field.hidden;
    });
  }, [sectionFields, objectFields]);
  
  if (visibleFields.length === 0) {
    return null;
  }
  
  return (
    <Card className="shadow-sm border-slate-200 overflow-hidden mb-4">
      <CardHeader
        className="py-3 px-4 bg-gradient-to-r from-slate-50 to-white cursor-pointer hover:from-slate-100 hover:to-slate-50 transition-colors border-b border-slate-100"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            {sectionName}
            <Badge variant="outline" className="text-[10px] text-slate-400 font-normal">
              {visibleFields.length} field{visibleFields.length !== 1 ? 's' : ''}
            </Badge>
          </CardTitle>
          <div className="text-slate-400">
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </div>
        </div>
      </CardHeader>
      
      {isExpanded && (
        <CardContent className="p-4 bg-white">
          <div
            className="grid gap-x-8 gap-y-4"
            style={{
              gridTemplateColumns: `repeat(${Math.min(columns, 2)}, minmax(0, 1fr))`,
            }}
          >
            {visibleFields.map((fieldDef) => {
              const fieldKey = typeof fieldDef === 'string' ? fieldDef : fieldDef?.key || fieldDef?.api_name;
              const field = objectFields?.[fieldKey];
              const value = record?.data?.[fieldKey];
              const fieldType = (field?.type || '').toLowerCase();
              
              if (!field) return null;
              
              // Detect user lookup fields by name (assigned_to, owner_id, etc.)
              const userLookupFields = ['assigned_to', 'owner_id', 'created_by', 'updated_by', 'owner'];
              const isUserLookupByName = userLookupFields.includes(fieldKey?.toLowerCase());
              
              // Handle lookup fields with LookupDisplayField
              if (fieldType === 'lookup' || fieldType === 'reference' || isUserLookupByName) {
                // For user lookup fields, set reference_to to 'user'
                const fieldWithRef = isUserLookupByName 
                  ? { ...field, reference_to: 'user', api_name: fieldKey }
                  : field;
                  
                return (
                  <div key={fieldKey} className="space-y-1" data-testid={`field-container-${fieldKey}`}>
                    <label className="block text-xs font-medium text-slate-500 uppercase tracking-wide">
                      {field?.label || fieldKey}
                    </label>
                    <div className="min-h-[36px] flex items-center">
                      <LookupDisplayField
                        value={value}
                        field={fieldWithRef}
                        onChange={isEditable ? (newId, newName) => onLookupChange?.(fieldKey, newId, newName) : null}
                        isEditable={isEditable}
                      />
                    </div>
                  </div>
                );
              }
              
              return (
                <InlineEditableField
                  key={fieldKey}
                  fieldKey={fieldKey}
                  field={field}
                  value={value}
                  onSave={onFieldSave}
                  isEditable={isEditable}
                  record={record}
                  onEmailClick={fieldType === 'email' ? onEmailClick : null}
                />
              );
            })}
          </div>
        </CardContent>
      )}
    </Card>
  );
};

/**
 * RecordDetailComponent - Main record fields renderer
 */
const RecordDetailComponent = ({
  config = {},
  record,
  objectName,
  objectSchema,
  layout,
  onRecordUpdate,
}) => {
  const [savingField, setSavingField] = useState(null);
  const [emailComposerOpen, setEmailComposerOpen] = useState(false);
  const [emailRecipient, setEmailRecipient] = useState({ email: '', name: '' });
  
  // Get object fields from schema
  const objectFields = useMemo(() => {
    return objectSchema?.fields || {};
  }, [objectSchema]);
  
  // Get sections from layout or config
  const sections = useMemo(() => {
    // Priority 1: Config items (from Record Detail component config in builder)
    if (config?.items && Array.isArray(config.items) && config.items.length > 0) {
      // Convert flat items list to a single section
      // Filter to only include fields that exist in the object schema
      const validFields = config.items
        .map(item => ({
          key: item.key || item.field,
          label: item.label,
        }))
        .filter(f => {
          // Only include if field exists in objectFields (schema)
          // If objectFields is empty, we'll let RecordSection handle the filtering
          if (Object.keys(objectFields).length === 0) return true;
          return objectFields[f.key] !== undefined;
        });
      
      if (validFields.length === 0 && Object.keys(objectFields).length > 0) {
        // No valid fields from config, fall back to schema-based fields
        const fieldKeys = Object.keys(objectFields).filter(key => {
          const field = objectFields[key];
          return !field.hidden && !field.is_system;
        });
        
        if (fieldKeys.length === 0) return [];
        
        return [{
          id: 'default',
          name: 'Record Information',
          columns: 2,
          fields: fieldKeys.slice(0, 20),
        }];
      }
      
      return [{
        id: 'main',
        name: 'Record Information',
        columns: 2,
        fields: validFields,
      }];
    }
    
    // Priority 2: Layout sections
    if (layout?.sections && Array.isArray(layout.sections)) {
      return layout.sections;
    }
    
    // Priority 3: Generate default sections from schema
    const fieldKeys = Object.keys(objectFields).filter(key => {
      const field = objectFields[key];
      return !field.hidden && !field.is_system;
    });
    
    if (fieldKeys.length === 0) return [];
    
    // Group into default section
    return [{
      id: 'default',
      name: 'Record Information',
      columns: 2,
      fields: fieldKeys.slice(0, 20),
    }];
  }, [config, layout, objectFields]);
  
  // Handle inline field save
  const handleFieldSave = useCallback(async (fieldKey, newValue) => {
    setSavingField(fieldKey);
    
    try {
      const token = localStorage.getItem('token');
      
      const updatedData = {
        ...record.data,
        [fieldKey]: newValue,
      };
      
      await axios.put(
        `${API}/objects/${objectName}/records/${record.id}`,
        { data: updatedData },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      if (onRecordUpdate) {
        onRecordUpdate({
          ...record,
          data: updatedData,
        });
      }
      
      const fieldLabel = objectFields[fieldKey]?.label || fieldKey;
      toast.success(`${fieldLabel} updated`, {
        duration: 2000,
        position: 'bottom-center',
        style: {
          background: '#10B981',
          color: 'white',
          fontSize: '14px',
        },
      });
    } catch (error) {
      console.error('Error saving field:', error);
      const message = error.response?.data?.detail || 'Failed to save';
      toast.error(message);
      throw new Error(message);
    } finally {
      setSavingField(null);
    }
  }, [record, objectName, objectFields, onRecordUpdate]);
  
  // Handle lookup field change
  const handleLookupChange = useCallback(async (fieldKey, newId, newName) => {
    await handleFieldSave(fieldKey, newId);
  }, [handleFieldSave]);
  
  // Handle email click - open composer modal
  const handleEmailClick = useCallback((email, recordData) => {
    const recipientName = recordData?.data?.name || 
                         `${recordData?.data?.first_name || ''} ${recordData?.data?.last_name || ''}`.trim() ||
                         '';
    setEmailRecipient({ email, name: recipientName });
    setEmailComposerOpen(true);
  }, []);
  
  // Loading state
  if (!record || !objectSchema) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
        <span className="ml-2 text-slate-500">Loading record...</span>
      </div>
    );
  }
  
  // No sections configured
  if (sections.length === 0) {
    return (
      <Card className="shadow-sm border-slate-200">
        <CardContent className="p-6 text-center">
          <Info className="h-10 w-10 text-slate-300 mx-auto mb-2" />
          <p className="text-slate-500">No fields configured for this layout</p>
          <p className="text-sm text-slate-400 mt-1">
            Configure fields in Lightning Page Builder to customize this view
          </p>
        </CardContent>
      </Card>
    );
  }
  
  return (
    <div data-testid="record-detail-component">
      {/* Owner Section - Always at top */}
      {record?.owner_id && (
        <Card className="shadow-sm border-slate-200 overflow-hidden mb-4">
          <CardHeader className="py-3 px-4 bg-gradient-to-r from-slate-50 to-white border-b border-slate-100">
            <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <User className="h-4 w-4 text-slate-500" />
              Record Owner
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-500 min-w-[80px]">Owner</span>
              <InlineOwnerField
                ownerId={record.owner_id || record.data?.owner_id}
                ownerName={record.owner_name || record.data?.owner_name}
                objectName={objectName}
                recordId={record.id}
                onOwnerChange={(newOwnerId, newOwnerName) => {
                  if (onRecordUpdate) {
                    onRecordUpdate({
                      ...record,
                      owner_id: newOwnerId,
                      owner_name: newOwnerName,
                    });
                  }
                  toast.success('Owner updated successfully');
                }}
                isEditable={true}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Record Field Sections */}
      {sections.map((section, index) => (
        <RecordSection
          key={section.id || section.name || index}
          section={section}
          record={record}
          objectFields={objectFields}
          onFieldSave={handleFieldSave}
          onLookupChange={handleLookupChange}
          onEmailClick={handleEmailClick}
          isEditable={true}
          defaultExpanded={index < 3}
        />
      ))}
      
      {/* System Information / Audit Fields */}
      <AuditFieldsDisplay 
        record={record}
        className="mt-4"
      />
      
      {/* Email Composer Modal */}
      <EmailComposerModal
        isOpen={emailComposerOpen}
        onClose={() => setEmailComposerOpen(false)}
        recipientEmail={emailRecipient.email}
        recipientName={emailRecipient.name}
        relatedRecordId={record?.id}
        relatedRecordType={objectName}
      />
    </div>
  );
};

export default RecordDetailComponent;
