/**
 * Record Detail Component - Salesforce-style Layout Builder Preview
 * 
 * This component matches Salesforce Lightning Layout Builder behavior:
 * - Sections contain fields
 * - Fields are arranged in 1 or 2 column grid within sections
 * - 2-column mode places fields side-by-side (left-right) like Salesforce
 * - Drag & drop support for fields into sections
 * - Fields are draggable and can be reordered within and between sections
 */

import React from 'react';
import { useDroppable, useDraggable } from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { 
  ChevronDown, 
  ChevronRight, 
  GripVertical, 
  X, 
  Plus,
  Type,
  Mail,
  Phone,
  Building2,
  Hash,
  Calendar,
  Link as LinkIcon,
  ToggleLeft,
  List,
  FileText
} from 'lucide-react';
import { toast } from 'sonner';

// Sample values for field preview
const getSampleValue = (fieldKey) => {
  const samples = {
    first_name: 'John',
    last_name: 'Smith',
    name: 'John Smith',
    email: 'john@acme.com',
    phone: '(555) 123-4567',
    company: 'Acme Corp',
    title: 'VP of Sales',
    website: 'www.acme.com',
    status: 'New',
    lead_source: 'Web',
    industry: 'Technology',
    annual_revenue: '$1,000,000',
    employees: '500',
    description: 'Sample description text...',
    address: '123 Main St',
    city: 'San Francisco',
    state: 'CA',
    country: 'USA',
    rating: 'Hot',
    owner: 'Admin User',
    created_date: '2024-01-15',
    account_name: 'Acme Inc',
    opportunity_name: 'New Deal',
    amount: '$50,000',
    close_date: '2024-03-30',
    stage: 'Qualification'
  };
  return samples[fieldKey] || `Sample ${fieldKey}`;
};

// Get icon for field type
const getFieldIcon = (fieldKey, fieldType) => {
  if (fieldKey?.includes('email')) return Mail;
  if (fieldKey?.includes('phone')) return Phone;
  if (fieldKey?.includes('company') || fieldKey?.includes('account')) return Building2;
  if (fieldKey?.includes('website') || fieldKey?.includes('url')) return LinkIcon;
  if (fieldKey?.includes('date')) return Calendar;
  if (fieldType === 'number' || fieldType === 'currency') return Hash;
  if (fieldType === 'boolean' || fieldType === 'checkbox') return ToggleLeft;
  if (fieldType === 'picklist' || fieldType === 'select') return List;
  if (fieldType === 'textarea') return FileText;
  return Type;
};

// Full field definitions for each object - shows ALL fields by default
const OBJECT_ALL_FIELDS = {
  lead: [
    { key: 'first_name', label: 'First Name' },
    { key: 'last_name', label: 'Last Name' },
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Phone' },
    { key: 'company', label: 'Company' },
    { key: 'title', label: 'Title' },
    { key: 'website', label: 'Website' },
    { key: 'status', label: 'Status' },
    { key: 'lead_source', label: 'Lead Source' },
    { key: 'industry', label: 'Industry' },
    { key: 'rating', label: 'Rating' },
    { key: 'description', label: 'Description' },
    { key: 'address', label: 'Address' },
    { key: 'city', label: 'City' },
    { key: 'state', label: 'State/Province' },
    { key: 'country', label: 'Country' },
  ],
  opportunity: [
    { key: 'name', label: 'Opportunity Name' },
    { key: 'account_id', label: 'Account' },
    { key: 'amount', label: 'Amount' },
    { key: 'close_date', label: 'Close Date' },
    { key: 'stage', label: 'Stage' },
    { key: 'probability', label: 'Probability (%)' },
    { key: 'type', label: 'Type' },
    { key: 'lead_source', label: 'Lead Source' },
    { key: 'next_step', label: 'Next Step' },
    { key: 'campaign_id', label: 'Primary Campaign' },
    { key: 'description', label: 'Description' },
  ],
  account: [
    { key: 'name', label: 'Account Name' },
    { key: 'phone', label: 'Phone' },
    { key: 'fax', label: 'Fax' },
    { key: 'website', label: 'Website' },
    { key: 'industry', label: 'Industry' },
    { key: 'type', label: 'Type' },
    { key: 'annual_revenue', label: 'Annual Revenue' },
    { key: 'employees', label: 'Employees' },
    { key: 'billing_address', label: 'Billing Address' },
    { key: 'billing_city', label: 'Billing City' },
    { key: 'billing_state', label: 'Billing State' },
    { key: 'billing_country', label: 'Billing Country' },
    { key: 'shipping_address', label: 'Shipping Address' },
    { key: 'shipping_city', label: 'Shipping City' },
    { key: 'description', label: 'Description' },
  ],
  contact: [
    { key: 'first_name', label: 'First Name' },
    { key: 'last_name', label: 'Last Name' },
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Phone' },
    { key: 'mobile', label: 'Mobile' },
    { key: 'title', label: 'Title' },
    { key: 'department', label: 'Department' },
    { key: 'account_id', label: 'Account' },
    { key: 'mailing_address', label: 'Mailing Address' },
    { key: 'mailing_city', label: 'Mailing City' },
    { key: 'mailing_state', label: 'Mailing State' },
    { key: 'mailing_country', label: 'Mailing Country' },
    { key: 'birthdate', label: 'Birthdate' },
    { key: 'description', label: 'Description' },
  ]
};

// Get default items for object - shows ALL available fields by default
const getDefaultRecordDetailItems = (objectName) => {
  const normalizedName = objectName?.toLowerCase() || 'lead';
  const allFields = OBJECT_ALL_FIELDS[normalizedName] || [
    { key: 'name', label: 'Name' },
    { key: 'description', label: 'Description' },
    { key: 'status', label: 'Status' },
  ];
  
  // Create a section with ALL fields
  const sectionLabel = {
    lead: 'Lead Information',
    opportunity: 'Opportunity Information',
    account: 'Account Information',
    contact: 'Contact Information'
  }[normalizedName] || 'Details';
  
  return [{
    id: `section-${normalizedName}-info`,
    type: 'field_section',
    label: sectionLabel,
    collapsed: false,
    fields: allFields.map((field, idx) => ({
      id: `field-${field.key}-${idx}`,
      type: 'field',
      key: field.key,
      label: field.label
    }))
  }];
};

// ============================================================================
// FIELD SECTION DROP ZONE - Accepts field drops from sidebar
// ============================================================================
export const FieldSectionDropZone = ({ sectionId, recordDetailInstanceId, columns, children }) => {
  const dropId = `field-section-drop-${recordDetailInstanceId}-${sectionId}`;
  
  const { setNodeRef, isOver, active } = useDroppable({ 
    id: dropId,
    data: {
      type: 'field-section-dropzone',
      sectionId,
      recordDetailInstanceId
    }
  });
  
  const hasChildren = React.Children.count(children) > 0;
  const isFieldDrag = active?.id?.toString().startsWith('field-');
  const showDropIndicator = isOver && isFieldDrag;
  
  return (
    <div
      ref={setNodeRef}
      data-dropzone-id={dropId}
      data-section-id={sectionId}
      className={`transition-all duration-200 ${
        showDropIndicator 
          ? 'ring-2 ring-blue-400 ring-inset bg-blue-50/50 rounded-b-xl' 
          : ''
      }`}
    >
      {hasChildren ? (
        children
      ) : (
        <div className="p-4">
          <div className={`flex flex-col items-center justify-center py-6 text-center border-2 border-dashed rounded-lg transition-colors ${
            showDropIndicator ? 'border-blue-400 bg-blue-50' : 'border-slate-200 bg-slate-50/50'
          }`}>
            <Plus className={`h-6 w-6 mb-2 ${showDropIndicator ? 'text-blue-500' : 'text-slate-300'}`} />
            <p className={`text-sm font-medium ${showDropIndicator ? 'text-blue-600' : 'text-slate-400'}`}>
              {showDropIndicator ? 'Drop field here!' : 'Drag fields here'}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              Fields will be arranged in {columns} column{columns > 1 ? 's' : ''}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// SINGLE FIELD PREVIEW - Clean, Professional Salesforce-style Design
// ============================================================================
const SortableFieldPreview = ({ field, columns, onRemove, sectionId, recordDetailInstanceId }) => {
  const fieldId = field.id || `field-${field.key}`;
  
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
    isOver,
  } = useSortable({
    id: fieldId,
    data: {
      type: 'record-detail-field',
      field: field,
      sectionId: sectionId,
      recordDetailInstanceId: recordDetailInstanceId,
    }
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 1000 : 'auto',
  };
  
  const Icon = getFieldIcon(field.key, field.type);
  const value = getSampleValue(field.key);
  const displayLabel = field.label || field.key;
  
  return (
    <div 
      ref={setNodeRef}
      style={style}
      className={`
        group relative bg-white rounded-lg transition-all duration-200 min-w-0 overflow-hidden
        ${isDragging 
          ? 'shadow-xl ring-2 ring-blue-400 scale-[1.02]' 
          : 'shadow-sm hover:shadow-md border border-slate-200 hover:border-blue-300'
        }
        ${isOver ? 'ring-2 ring-blue-200' : ''}
      `}
    >
      {/* Main Content Container */}
      <div className="flex items-stretch min-w-0">
        {/* Drag Handle - Always Visible, Left Side */}
        <div 
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          className={`
            flex items-center justify-center w-8 rounded-l-lg cursor-grab active:cursor-grabbing
            transition-colors duration-200
            ${isDragging 
              ? 'bg-blue-100' 
              : 'bg-slate-50 hover:bg-slate-100 group-hover:bg-blue-50'
            }
          `}
          onClick={(e) => e.stopPropagation()}
          title="Drag to reorder"
        >
          <GripVertical className={`h-4 w-4 ${isDragging ? 'text-blue-500' : 'text-slate-400 group-hover:text-blue-400'}`} />
        </div>
        
        {/* Field Content - Vertical stacked layout for clarity */}
        <div className="flex-1 px-3 py-2.5 min-w-0 overflow-hidden">
          {/* Field Label - Full width display */}
          <div className="flex items-center gap-1.5 mb-1 min-w-0">
            <Icon className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide truncate">
              {displayLabel}
            </span>
          </div>
          
          {/* Field Value - with overflow handling */}
          <div className="text-sm font-medium text-slate-800 pl-5 truncate" title={value}>
            {value}
          </div>
        </div>
        
        {/* Remove Button - Right Side, Shows on Hover */}
        <div className={`
          flex items-center justify-center w-8 rounded-r-lg
          transition-all duration-200
          ${isDragging ? 'opacity-0' : 'opacity-0 group-hover:opacity-100'}
        `}>
          <button
            onClick={(e) => { e.stopPropagation(); onRemove && onRemove(); }}
            className="p-1.5 rounded-full hover:bg-red-100 transition-colors"
            title="Remove field"
          >
            <X className="h-3.5 w-3.5 text-slate-400 hover:text-red-500" />
          </button>
        </div>
      </div>
      
      {/* Drop Indicator Line */}
      {isOver && !isDragging && (
        <div className="absolute -top-1 left-0 right-0 h-0.5 bg-blue-500 rounded-full" />
      )}
    </div>
  );
};

// Non-sortable version for fallback
const FieldPreview = ({ field, columns, onRemove }) => {
  const Icon = getFieldIcon(field.key, field.type);
  const value = getSampleValue(field.key);
  const displayLabel = field.label || field.key;
  
  return (
    <div className="group relative bg-white rounded-md shadow-sm border border-slate-200 hover:shadow-md hover:border-blue-300 transition-all duration-200 w-full min-w-0 overflow-hidden">
      <div className="flex items-stretch min-w-0">
        {/* Left spacer for alignment */}
        <div className="w-6 flex-shrink-0 bg-slate-50 rounded-l-md" />
        
        {/* Field Content - Vertical stacked layout for clarity */}
        <div className="flex-1 px-3 py-2 min-w-0 overflow-hidden">
          {/* Field Label - Full width, no truncation */}
          <div className="flex items-center gap-1.5 mb-1 min-w-0">
            <Icon className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide truncate">
              {displayLabel}
            </span>
          </div>
          
          {/* Field Value - with overflow handling */}
          <div className="text-sm font-medium text-slate-800 pl-5 truncate" title={value}>
            {value}
          </div>
        </div>
        
        {/* Remove Button */}
        <div className="flex items-center justify-center w-8 flex-shrink-0 rounded-r-md opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => { e.stopPropagation(); onRemove && onRemove(); }}
            className="p-1 rounded-full hover:bg-red-100 transition-colors"
            title="Remove field"
          >
            <X className="h-3.5 w-3.5 text-slate-400 hover:text-red-500" />
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// FIELD SECTION - Collapsible section with fields inside (with sortable fields)
// ============================================================================
const FieldSection = ({ 
  item, 
  columns, 
  onRemove, 
  onToggleSection, 
  onUpdateSectionLabel,
  onRemoveFieldFromSection,
  onReorderFields
}) => {
  const isCollapsed = item.collapsed || false;
  const sectionFields = item.fields || [];
  
  // Get field IDs for SortableContext
  const fieldIds = sectionFields.map(f => f.id || `field-${f.key}`);

  return (
    <div className="group bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all duration-200">
      {/* Section Header - Clean Modern Style */}
      <div className="px-4 py-3 bg-gradient-to-r from-slate-50 to-white border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center flex-1 gap-3">
          {/* Drag Handle for Section */}
          <div className="cursor-grab active:cursor-grabbing p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
            <GripVertical className="h-4 w-4 text-slate-400" />
          </div>
          
          {/* Collapse Toggle */}
          <button
            onClick={(e) => { e.stopPropagation(); onToggleSection && onToggleSection(item.id); }}
            className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors"
          >
            {isCollapsed ? (
              <ChevronRight className="h-4 w-4 text-slate-500" />
            ) : (
              <ChevronDown className="h-4 w-4 text-slate-500" />
            )}
          </button>
          
          {/* Section Label (Editable) */}
          <input
            type="text"
            value={item.label || 'Section'}
            onChange={(e) => { e.stopPropagation(); onUpdateSectionLabel && onUpdateSectionLabel(item.id, e.target.value); }}
            onClick={(e) => e.stopPropagation()}
            className="text-sm font-semibold text-slate-700 bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-blue-500 rounded px-2 py-1 flex-1 min-w-0"
            placeholder="Section Name"
          />
          
          {/* Field Count Badge */}
          <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full whitespace-nowrap">
            {sectionFields.length} field{sectionFields.length !== 1 ? 's' : ''}
          </span>
        </div>
        
        {/* Remove Section Button */}
        {onRemove && (
          <button
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            className="p-1.5 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all ml-2"
            title="Remove section"
          >
            <X className="h-4 w-4 text-slate-400 hover:text-red-500" />
          </button>
        )}
      </div>
      
      {/* Section Content - Field Grid with Sortable Fields */}
      {!isCollapsed && (
        <FieldSectionDropZone 
          sectionId={item.id} 
          recordDetailInstanceId={item.recordDetailInstanceId}
          columns={columns}
        >
          {sectionFields.length > 0 ? (
            <SortableContext items={fieldIds} strategy={verticalListSortingStrategy}>
              <div className={`grid gap-3 p-4 min-w-0 ${columns === 2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}
                   style={{ gridTemplateColumns: columns === 2 ? 'repeat(2, minmax(0, 1fr))' : 'minmax(0, 1fr)' }}>
                {sectionFields.map((field, idx) => (
                  <SortableFieldPreview
                    key={field.id || `field-${field.key}-${idx}`}
                    field={field}
                    columns={columns}
                    sectionId={item.id}
                    recordDetailInstanceId={item.recordDetailInstanceId}
                    onRemove={() => onRemoveFieldFromSection && onRemoveFieldFromSection(item.id, field.id)}
                  />
                ))}
              </div>
            </SortableContext>
          ) : (
            <div className="p-4">
              <div className="text-center py-6 border-2 border-dashed border-slate-200 rounded-lg bg-slate-50/50">
                <Plus className="h-6 w-6 mx-auto text-slate-300 mb-2" />
                <p className="text-xs text-slate-400">Drag fields here</p>
              </div>
            </div>
          )}
        </FieldSectionDropZone>
      )}
    </div>
  );
};

// ============================================================================
// RECORD ITEM - Handles different item types
// ============================================================================
const RecordItem = ({ 
  item, 
  columns, 
  onRemove, 
  onToggleSection, 
  onUpdateSectionLabel,
  onRemoveFieldFromSection 
}) => {
  // Field Section
  if (item.type === 'field_section') {
    return (
      <FieldSection
        item={item}
        columns={columns}
        onRemove={onRemove}
        onToggleSection={onToggleSection}
        onUpdateSectionLabel={onUpdateSectionLabel}
        onRemoveFieldFromSection={onRemoveFieldFromSection}
      />
    );
  }
  
  // Individual Field (legacy support)
  if (item.type === 'field') {
    return (
      <FieldPreview
        field={item}
        columns={columns}
        onRemove={onRemove}
      />
    );
  }
  
  // Blank Space
  if (item.type === 'blank_space') {
    return (
      <div className="h-8 bg-slate-50 border border-dashed border-slate-300 rounded flex items-center justify-center group">
        <span className="text-xs text-slate-400">Blank Space</span>
        {onRemove && (
          <button
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            className="ml-2 p-0.5 hover:bg-red-100 rounded opacity-0 group-hover:opacity-100"
          >
            <X className="h-3 w-3 text-red-500" />
          </button>
        )}
      </div>
    );
  }
  
  return null;
};

// ============================================================================
// FIELD INSERTION POINT - Drop zone between items
// ============================================================================
const FieldInsertionPoint = ({ componentInstanceId, index }) => {
  const dropId = `insert-point-${componentInstanceId}-${index}`;
  const { setNodeRef, isOver, active } = useDroppable({ 
    id: dropId,
    data: {
      type: 'field-insertion-point',
      componentInstanceId,
      index
    }
  });
  
  const isFieldDrag = active?.id?.toString().startsWith('field-') || 
                       active?.id?.toString().startsWith('fieldcomp-');
  const showIndicator = isOver && isFieldDrag;
  
  return (
    <div 
      ref={setNodeRef}
      className={`transition-all ${showIndicator ? 'h-12 my-2' : 'h-2 my-0.5'}`}
    >
      {showIndicator && (
        <div className="h-full w-full bg-blue-100 border-2 border-dashed border-blue-400 rounded-lg flex items-center justify-center">
          <span className="text-xs text-blue-600 font-medium">Drop here to insert</span>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// RECORD DETAIL PREVIEW - Main component
// ============================================================================
export const RecordDetailPreview = ({ config, component, onConfigUpdate, objectName, schemaFields }) => {
  const columns = config?.columns || 2;
  
  // Use schemaFields if provided, otherwise fall back to object-specific defaults
  const getDefaultItemsFromSchema = () => {
    // If schemaFields are provided and have fields, use them
    if (schemaFields && schemaFields.length > 0) {
      const normalizedName = objectName?.toLowerCase() || 'record';
      const sectionLabel = {
        lead: 'Lead Information',
        opportunity: 'Opportunity Information',
        account: 'Account Information',
        contact: 'Contact Information'
      }[normalizedName] || `${objectName || 'Record'} Information`;
      
      return [{
        id: `section-${normalizedName}-info`,
        type: 'field_section',
        label: sectionLabel,
        collapsed: false,
        fields: schemaFields.map((field, idx) => ({
          id: `field-${field.key}-${idx}`,
          type: 'field',
          key: field.key,
          label: field.label || field.key
        }))
      }];
    }
    
    // Fall back to hardcoded defaults only if no schema fields
    return getDefaultRecordDetailItems(objectName);
  };
  
  // Filter config items against schemaFields to remove invalid fields
  const filterConfigItemsAgainstSchema = (items) => {
    if (!schemaFields || schemaFields.length === 0) {
      return items; // Can't filter without schema
    }
    
    const validFieldKeys = new Set(schemaFields.map(f => f.key));
    
    return items.map(item => {
      if (item.type === 'field_section' && item.fields) {
        // Filter fields within sections
        const validFields = item.fields.filter(f => validFieldKeys.has(f.key));
        return { ...item, fields: validFields };
      } else if (item.type === 'field') {
        // Filter loose fields
        return validFieldKeys.has(item.key) ? item : null;
      }
      return item;
    }).filter(Boolean);
  };
  
  // Get configured items - ALWAYS validate against schema
  const rawItems = React.useMemo(() => {
    // If we have config.items, validate them against schema
    if (config?.items && config.items.length > 0) {
      const filteredItems = filterConfigItemsAgainstSchema(config.items);
      
      // Check if we have any valid fields after filtering
      const hasValidFields = filteredItems.some(item => {
        if (item.type === 'field_section') {
          return item.fields && item.fields.length > 0;
        }
        return item.type === 'field';
      });
      
      // If config.items had no valid fields after filtering, use schema defaults
      if (!hasValidFields && schemaFields && schemaFields.length > 0) {
        return getDefaultItemsFromSchema();
      }
      
      return filteredItems;
    }
    
    // No config items, use schema defaults
    return getDefaultItemsFromSchema();
  }, [config?.items, schemaFields, objectName]);
  
  // Process items: Group loose fields into a default section for proper 2-column display
  const configuredItems = React.useMemo(() => {
    if (!rawItems || rawItems.length === 0) {
      return getDefaultRecordDetailItems(objectName);
    }
    
    // Separate sections from loose fields/items
    const sections = rawItems.filter(item => item.type === 'field_section');
    const looseFields = rawItems.filter(item => item.type === 'field');
    const otherItems = rawItems.filter(item => item.type !== 'field_section' && item.type !== 'field');
    
    // If there are loose fields, wrap them in a default section
    if (looseFields.length > 0) {
      // Check if we already have a default section in the sections list
      const existingDefaultSection = sections.find(s => s.id === 'section-default');
      
      if (existingDefaultSection) {
        // Merge loose fields into existing default section
        const updatedDefaultSection = {
          ...existingDefaultSection,
          fields: [...(existingDefaultSection.fields || []), ...looseFields.map(f => ({
            id: f.id,
            type: 'field',
            key: f.key,
            label: f.label
          }))]
        };
        // Replace the default section with updated one
        const updatedSections = sections.map(s => 
          s.id === 'section-default' ? updatedDefaultSection : s
        );
        return [...updatedSections, ...otherItems];
      } else {
        // Create a new default section with loose fields
        const defaultSection = {
          id: 'section-default',
          type: 'field_section',
          label: objectName === 'lead' ? 'Lead Information' : 'Details',
          collapsed: false,
          fields: looseFields.map(f => ({
            id: f.id,
            type: 'field',
            key: f.key,
            label: f.label
          }))
        };
        // Put default section first, then other sections, then other items
        return [defaultSection, ...sections, ...otherItems];
      }
    }
    
    // No loose fields - just return sections and other items
    // If no sections at all, create an empty default section
    if (sections.length === 0) {
      return [{
        id: 'section-default',
        type: 'field_section',
        label: objectName === 'lead' ? 'Lead Information' : 'Details',
        collapsed: false,
        fields: []
      }, ...otherItems];
    }
    
    return [...sections, ...otherItems];
  }, [rawItems, objectName]);

  // Count sections
  const sectionCount = configuredItems.filter(i => i.type === 'field_section').length;

  // Remove item from list
  const removeItem = (itemId) => {
    const newItems = configuredItems.filter(i => i.id !== itemId);
    if (onConfigUpdate) {
      onConfigUpdate({ ...config, items: newItems });
    }
  };

  // Toggle section collapsed state
  const toggleSection = (sectionId) => {
    const newItems = configuredItems.map(item => {
      if (item.id === sectionId) {
        return { ...item, collapsed: !item.collapsed };
      }
      return item;
    });
    if (onConfigUpdate) {
      onConfigUpdate({ ...config, items: newItems });
    }
  };
  
  // Update section label
  const updateSectionLabel = (sectionId, newLabel) => {
    const newItems = configuredItems.map(item => {
      if (item.id === sectionId) {
        return { ...item, label: newLabel };
      }
      return item;
    });
    if (onConfigUpdate) {
      onConfigUpdate({ ...config, items: newItems });
    }
  };
  
  // Remove field from section
  const removeFieldFromSection = (sectionId, fieldId) => {
    const newItems = configuredItems.map(item => {
      if (item.id === sectionId && item.type === 'field_section') {
        return { 
          ...item, 
          fields: (item.fields || []).filter(f => f.id !== fieldId) 
        };
      }
      return item;
    });
    if (onConfigUpdate) {
      onConfigUpdate({ ...config, items: newItems });
    }
  };
  
  // Reorder fields within a section
  const reorderFieldsInSection = (sectionId, oldIndex, newIndex) => {
    const newItems = configuredItems.map(item => {
      if (item.id === sectionId && item.type === 'field_section') {
        const fields = [...(item.fields || [])];
        const [movedField] = fields.splice(oldIndex, 1);
        fields.splice(newIndex, 0, movedField);
        return { ...item, fields };
      }
      return item;
    });
    if (onConfigUpdate) {
      onConfigUpdate({ ...config, items: newItems });
    }
  };
  
  // Move field between sections
  const moveFieldBetweenSections = (fromSectionId, toSectionId, fieldId, insertIndex) => {
    let movedField = null;
    
    // First, find and remove the field from source section
    const newItems = configuredItems.map(item => {
      if (item.id === fromSectionId && item.type === 'field_section') {
        const fields = [...(item.fields || [])];
        const fieldIndex = fields.findIndex(f => f.id === fieldId);
        if (fieldIndex !== -1) {
          [movedField] = fields.splice(fieldIndex, 1);
        }
        return { ...item, fields };
      }
      return item;
    });
    
    // Then, insert the field into target section
    if (movedField) {
      const finalItems = newItems.map(item => {
        if (item.id === toSectionId && item.type === 'field_section') {
          const fields = [...(item.fields || [])];
          fields.splice(insertIndex, 0, movedField);
          return { ...item, fields };
        }
        return item;
      });
      
      if (onConfigUpdate) {
        onConfigUpdate({ ...config, items: finalItems });
      }
    }
  };

  return (
    <div className="space-y-4" data-component-instance-id={component?.instanceId}>
      {/* Layout Info Header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-gradient-to-r from-slate-50 to-white rounded-xl border border-slate-200">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-blue-500"></div>
          <span className="text-xs font-medium text-slate-600">
            <span className="text-blue-600 font-semibold">{columns}-Column</span> Layout
          </span>
        </div>
        <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">
          {sectionCount} section{sectionCount !== 1 ? 's' : ''}
        </span>
      </div>
      
      {/* Sections list */}
      {configuredItems.length > 0 ? (
        <div className="space-y-3">
          {/* Initial insertion point at the top */}
          <FieldInsertionPoint 
            componentInstanceId={component?.instanceId} 
            index={0} 
          />
          {configuredItems.map((item, index) => (
            <React.Fragment key={item.id}>
              <RecordItem 
                item={{ ...item, recordDetailInstanceId: component?.instanceId }}
                columns={columns}
                onRemove={() => removeItem(item.id)}
                onToggleSection={toggleSection}
                onUpdateSectionLabel={updateSectionLabel}
                onRemoveFieldFromSection={removeFieldFromSection}
              />
              {/* Insertion point after each section */}
              <FieldInsertionPoint 
                componentInstanceId={component?.instanceId} 
                index={index + 1} 
              />
            </React.Fragment>
          ))}
        </div>
      ) : (
        <div className="text-center py-8 bg-slate-50 rounded-lg border-2 border-dashed border-slate-200">
          <Plus className="h-8 w-8 mx-auto text-slate-300 mb-2" />
          <p className="text-sm text-slate-500">No sections configured</p>
          <p className="text-xs text-slate-400 mt-1">
            Add sections using the &quot;+ Add Section&quot; button
          </p>
          {/* Allow dropping first section when empty */}
          <FieldInsertionPoint 
            componentInstanceId={component?.instanceId} 
            index={0} 
          />
        </div>
      )}
    </div>
  );
};

export default RecordDetailPreview;
