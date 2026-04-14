/**
 * LayoutDrivenRecordDetail - Dynamic record detail rendering based on Lightning Layout
 * 
 * Architecture:
 * - Layout JSON = Single Source of Truth
 * - No hardcoded fields or sections
 * - Supports regions, tabs, sections from layout config
 * - Inline editing for Phase 1 field types
 * - Real-time layout sync (changes in Builder reflect immediately)
 */
import React, { useState, useCallback, useMemo } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { cn } from '../../lib/utils';
import InlineEditableField from './InlineEditableField';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

/**
 * Section Component - Renders a layout section with fields
 */
const LayoutSection = ({
  section,
  record,
  objectFields,
  onFieldSave,
  isEditable = true,
  defaultExpanded = true,
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  
  // Get fields for this section
  const sectionFields = section?.fields || [];
  const columns = section?.columns || 2;
  const sectionName = section?.name || section?.label || section?.id || 'Details';
  
  // Filter out fields that don't exist in schema or are hidden
  const visibleFields = useMemo(() => {
    return sectionFields.filter(fieldKey => {
      // Handle both string field keys and object field definitions
      const key = typeof fieldKey === 'string' ? fieldKey : fieldKey?.api_name || fieldKey?.name;
      const field = objectFields?.[key];
      return field && !field.hidden;
    });
  }, [sectionFields, objectFields]);
  
  if (visibleFields.length === 0) {
    return null; // Don't render empty sections
  }
  
  return (
    <Card className="shadow-sm border-slate-200 overflow-hidden">
      {/* Section Header */}
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
            {isExpanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </div>
        </div>
      </CardHeader>
      
      {/* Section Content */}
      {isExpanded && (
        <CardContent className="p-4 bg-white">
          <div
            className="grid gap-x-8 gap-y-4"
            style={{
              gridTemplateColumns: `repeat(${Math.min(columns, 2)}, minmax(0, 1fr))`,
            }}
          >
            {visibleFields.map((fieldKey) => {
              const key = typeof fieldKey === 'string' ? fieldKey : fieldKey?.api_name || fieldKey?.name;
              const field = objectFields?.[key];
              const value = record?.data?.[key];
              
              if (!field) return null;
              
              return (
                <InlineEditableField
                  key={key}
                  fieldKey={key}
                  field={field}
                  value={value}
                  onSave={onFieldSave}
                  isEditable={isEditable}
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
 * TabsRenderer - Renders tabs from layout configuration
 */
const TabsRenderer = ({
  tabs = [],
  record,
  objectFields,
  onFieldSave,
  isEditable,
}) => {
  const [activeTab, setActiveTab] = useState(tabs[0]?.id || 'details');
  
  if (tabs.length === 0) {
    return null;
  }
  
  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
      <TabsList className="mb-4 bg-slate-100/70 p-1 rounded-lg">
        {tabs.map((tab) => (
          <TabsTrigger 
            key={tab.id} 
            value={tab.id}
            className="data-[state=active]:bg-white data-[state=active]:shadow-sm"
          >
            {tab.label || tab.name || tab.id}
          </TabsTrigger>
        ))}
      </TabsList>
      
      {tabs.map((tab) => (
        <TabsContent key={tab.id} value={tab.id} className="space-y-4 mt-0">
          {(tab.sections || []).map((section, index) => (
            <LayoutSection
              key={section.id || section.name || index}
              section={section}
              record={record}
              objectFields={objectFields}
              onFieldSave={onFieldSave}
              isEditable={isEditable}
              defaultExpanded={index < 3}
            />
          ))}
        </TabsContent>
      ))}
    </Tabs>
  );
};

/**
 * Extract sections from layout (handles various layout formats)
 */
const extractSectionsFromLayout = (layout) => {
  if (!layout) return { sections: [], tabs: [], relatedLists: [] };
  
  let sections = [];
  let tabs = [];
  let relatedLists = [];
  
  // Case 1: Direct sections array (simple layout)
  if (layout.sections && Array.isArray(layout.sections)) {
    sections = layout.sections;
  }
  
  // Case 2: Regions-based layout (Lightning style)
  if (layout.regions && Array.isArray(layout.regions)) {
    layout.regions.forEach(region => {
      if (!region.components) return;
      
      region.components.forEach(component => {
        // Handle tabs component
        if (component.type === 'tabs' && component.config?.tabs) {
          tabs = component.config.tabs;
        }
        
        // Handle related lists
        if (component.type === 'related_list' && component.config?.lists) {
          relatedLists = component.config.lists;
        }
        
        // Handle direct sections in a component
        if (component.type === 'fields' && component.config?.sections) {
          sections = [...sections, ...component.config.sections];
        }
      });
    });
    
    // If we found tabs, extract sections from the details tab
    if (tabs.length > 0) {
      const detailsTab = tabs.find(t => t.id === 'details' || t.label?.toLowerCase() === 'details');
      if (detailsTab?.sections) {
        sections = detailsTab.sections;
      }
    }
  }
  
  return { sections, tabs, relatedLists };
};

/**
 * LayoutDrivenRecordDetail Component
 */
const LayoutDrivenRecordDetail = ({
  record,
  objectName,
  objectSchema,
  layout,
  onRecordUpdate,
  isEditable = true,
  showTabs = false,
}) => {
  const [savingField, setSavingField] = useState(null);
  
  // Get object fields from schema
  const objectFields = useMemo(() => {
    return objectSchema?.fields || {};
  }, [objectSchema]);
  
  // Extract layout structure
  const { sections, tabs } = useMemo(() => {
    return extractSectionsFromLayout(layout);
  }, [layout]);
  
  // Handle inline field save
  const handleFieldSave = useCallback(async (fieldKey, newValue) => {
    setSavingField(fieldKey);
    
    try {
      const token = localStorage.getItem('token');
      
      // Prepare updated data
      const updatedData = {
        ...record.data,
        [fieldKey]: newValue,
      };
      
      // Save to backend
      await axios.put(
        `${API}/objects/${objectName}/records/${record.id}`,
        { data: updatedData },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      // Update local record state
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
  
  // Loading state
  if (!record || !objectSchema) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
        <span className="ml-2 text-slate-500">Loading record...</span>
      </div>
    );
  }
  
  // If we have tabs and showTabs is true, render tabs
  if (showTabs && tabs.length > 0) {
    return (
      <TabsRenderer
        tabs={tabs}
        record={record}
        objectFields={objectFields}
        onFieldSave={handleFieldSave}
        isEditable={isEditable}
      />
    );
  }
  
  // If we have sections from layout, render them
  if (sections.length > 0) {
    return (
      <div className="space-y-4">
        {sections.map((section, index) => (
          <LayoutSection
            key={section.id || section.name || index}
            section={section}
            record={record}
            objectFields={objectFields}
            onFieldSave={handleFieldSave}
            isEditable={isEditable}
            defaultExpanded={index < 3}
          />
        ))}
      </div>
    );
  }
  
  // Fallback: Create default sections from object fields (no hardcoding, just field grouping)
  const fieldKeys = Object.keys(objectFields).filter(key => {
    const field = objectFields[key];
    return !field.hidden && !field.is_system;
  });
  
  if (fieldKeys.length === 0) {
    return (
      <Card className="shadow-sm border-slate-200">
        <CardContent className="p-6 text-center">
          <p className="text-slate-500">No fields configured for this layout</p>
          <p className="text-sm text-slate-400 mt-1">
            Configure a layout in Lightning Page Builder to customize this view
          </p>
        </CardContent>
      </Card>
    );
  }
  
  // Group fields into default section (auto-generated from schema)
  const defaultSection = {
    id: 'default',
    name: 'Record Information',
    columns: 2,
    fields: fieldKeys.slice(0, 20), // Limit to first 20 fields
  };
  
  return (
    <div className="space-y-4">
      <LayoutSection
        section={defaultSection}
        record={record}
        objectFields={objectFields}
        onFieldSave={handleFieldSave}
        isEditable={isEditable}
      />
      
      {fieldKeys.length > 20 && (
        <p className="text-xs text-slate-400 text-center">
          Configure a custom layout to display all {fieldKeys.length} fields
        </p>
      )}
    </div>
  );
};

export default LayoutDrivenRecordDetail;
