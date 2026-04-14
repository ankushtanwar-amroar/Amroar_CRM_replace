/**
 * Lightning Page Builder Sidebar Components
 * Contains sidebar tab content and draggable field items
 */
import React, { useState, useEffect } from 'react';
import {
  ChevronRight, ChevronDown, GripVertical, Search, Trash2,
  Mail, Phone, Globe, Calendar, List, BarChart3, User, FileText, Link,
  Loader2
} from 'lucide-react';
import { useDraggable } from '@dnd-kit/core';
import { Button } from '../../../../components/ui/button';
import { Input } from '../../../../components/ui/input';
import {
  STANDARD_COMPONENTS,
  FIELD_COMPONENTS,
  LAYOUT_TEMPLATES,
} from '../../constants/builderConstants';
import { getRecordFields, fetchSchemaFields } from '../../utils/builderUtils';
import { PathPropertyPanel } from '../../../../modules/path/components';
import { ActivityPropertyPanel } from '../../../../modules/activity';
import { RelatedListsPropertyPanel } from '../../../../modules/related-lists';
import VisibilityConditionBuilder from '../../../../modules/component-visibility/components/VisibilityConditionBuilder';
import { getVisibilitySummary, hasVisibilityConditions } from '../../../../modules/component-visibility';
import { 
  RecordDetailProperties, 
  RelatedListsProperties, 
  RelatedListQuickLinksProperties, 
  HighlightsPanelProperties,
  ActionsProperties,
  FlowProperties
} from '../properties';
import axios from 'axios';

const API = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';

// Fetch fields with parent lookups for visibility conditions
const fetchFieldsWithParentLookups = async (objectName) => {
  try {
    const token = localStorage.getItem('token');
    const response = await axios.get(`${API}/api/field-behavior/fields/${objectName}`, {
      params: { include_parent: true, depth: 1 },
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching fields with parent lookups:', error);
    return null;
  }
};

// ============================================================================
// DRAGGABLE FIELD ITEM
// ============================================================================
export const DraggableFieldItem = ({ field }) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `field-${field.key}`,
    data: { type: 'field', field }
  });

  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
  } : undefined;

  const getFieldIcon = (type) => {
    switch(type) {
      case 'email': return Mail;
      case 'phone': return Phone;
      case 'url': return Globe;
      case 'date': case 'datetime': return Calendar;
      case 'picklist': return List;
      case 'currency': case 'number': return BarChart3;
      case 'lookup': return User;
      case 'textarea': return FileText;
      default: return FileText;
    }
  };

  const FieldIcon = getFieldIcon(field.type);

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`px-2 py-1.5 bg-white border rounded cursor-grab active:cursor-grabbing hover:border-blue-400 hover:bg-blue-50 transition-all flex items-center space-x-2 ${
        isDragging ? 'opacity-50 shadow-lg ring-2 ring-blue-500' : ''
      }`}
    >
      <FieldIcon className="h-3.5 w-3.5 text-slate-400" />
      <span className="text-xs text-slate-700 flex-1">{field.label}</span>
      <GripVertical className="h-3 w-3 text-slate-300" />
    </div>
  );
};

// ============================================================================
// DRAGGABLE FIELD COMPONENT
// ============================================================================
export const DraggableFieldComponent = ({ component }) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `fieldcomp-${component.id}`,
    data: { type: 'field_component', component }
  });

  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
  } : undefined;

  const Icon = component.icon;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`px-2 py-1.5 bg-white border rounded cursor-grab active:cursor-grabbing hover:border-blue-400 hover:bg-blue-50 transition-all flex items-center space-x-2 ${
        isDragging ? 'opacity-50 shadow-lg ring-2 ring-blue-500' : ''
      }`}
    >
      <Icon className="h-3.5 w-3.5 text-slate-500" />
      <span className="text-xs text-slate-700 flex-1">{component.name}</span>
      <GripVertical className="h-3 w-3 text-slate-300" />
    </div>
  );
};

// ============================================================================
// FIELDS TAB CONTENT
// ============================================================================
export const FieldsTabContent = ({ objectName, searchQuery, selectedLayout, setSelectedLayout, filteredLayouts, hidePageLayout = false, pageType = 'detail' }) => {
  const [expandedSections, setExpandedSections] = useState({
    fieldComponents: true,
    requiredFields: false,
    allFields: true
  });
  
  // State for schema-based fields
  const [schemaFields, setSchemaFields] = useState(null);
  const [loadingFields, setLoadingFields] = useState(true);
  const [fieldSource, setFieldSource] = useState('loading'); // 'schema' | 'fallback' | 'loading'

  const toggleSection = (section) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  // Fetch fields from schema API on mount or object change
  useEffect(() => {
    const loadSchemaFields = async () => {
      setLoadingFields(true);
      setFieldSource('loading');
      
      try {
        const fields = await fetchSchemaFields(objectName);
        if (fields && fields.length > 0) {
          setSchemaFields(fields);
          setFieldSource('schema');
          console.log(`✅ Layout Editor using schema fields for ${objectName} (${fields.length} fields)`);
        } else {
          // Fallback to hardcoded fields
          const fallbackFields = getRecordFields(objectName);
          setSchemaFields(fallbackFields);
          setFieldSource('fallback');
          console.warn(`⚠️ Layout Editor falling back to hardcoded fields for ${objectName}`);
        }
      } catch (error) {
        console.error('Error loading schema fields:', error);
        // Fallback to hardcoded fields on error
        const fallbackFields = getRecordFields(objectName);
        setSchemaFields(fallbackFields);
        setFieldSource('fallback');
      } finally {
        setLoadingFields(false);
      }
    };
    
    if (objectName) {
      loadSchemaFields();
    }
  }, [objectName]);

  // Use schema fields, filtered by search
  // For "new" page layouts, filter out computed fields (Rollup, Formula) - they are read-only
  const allFields = (schemaFields || []).filter(f => {
    // On "new" record pages, exclude computed/calculated fields since users can't input values for them
    if (pageType === 'new' && f.computed === true) {
      return false;
    }
    return true;
  });
  
  const filteredFields = allFields.filter(f => 
    f.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
    f.key.toLowerCase().includes(searchQuery.toLowerCase())
  );
  
  const requiredFields = filteredFields.filter(f => f.required);
  const optionalFields = filteredFields;

  return (
    <div className="space-y-3">
      {/* Field Source Indicator */}
      {fieldSource === 'schema' && (
        <div className="px-2 py-1 bg-green-50 border border-green-200 rounded text-xs text-green-700 flex items-center gap-1">
          <span className="w-2 h-2 bg-green-500 rounded-full"></span>
          Fields from schema ({allFields.length} available)
        </div>
      )}
      {fieldSource === 'fallback' && (
        <div className="px-2 py-1 bg-amber-50 border border-amber-200 rounded text-xs text-amber-700 flex items-center gap-1">
          <span className="w-2 h-2 bg-amber-500 rounded-full"></span>
          Using default fields (schema unavailable)
        </div>
      )}
      
      {/* Loading State */}
      {loadingFields && (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
          <span className="ml-2 text-sm text-slate-500">Loading fields...</span>
        </div>
      )}
      
      {!loadingFields && (
        <>
          {/* Field Components Section */}
          <div className="border rounded-lg overflow-hidden">
            <button
              onClick={() => toggleSection('fieldComponents')}
              className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 hover:bg-slate-100"
            >
              <span className="text-xs font-semibold text-slate-700 uppercase">Field Components</span>
              {expandedSections.fieldComponents ? (
                <ChevronDown className="h-4 w-4 text-slate-400" />
              ) : (
                <ChevronRight className="h-4 w-4 text-slate-400" />
              )}
            </button>
            {expandedSections.fieldComponents && (
              <div className="p-2 space-y-1 bg-white">
                {FIELD_COMPONENTS.map(comp => (
                  <DraggableFieldComponent key={comp.id} component={comp} />
                ))}
              </div>
            )}
          </div>

          {/* Required Fields Section */}
          {requiredFields.length > 0 && (
            <div className="border rounded-lg overflow-hidden">
              <button
                onClick={() => toggleSection('requiredFields')}
                className="w-full flex items-center justify-between px-3 py-2 bg-red-50 hover:bg-red-100"
              >
                <span className="text-xs font-semibold text-red-700 uppercase">
                  Required Fields ({requiredFields.length})
                </span>
                {expandedSections.requiredFields ? (
                  <ChevronDown className="h-4 w-4 text-red-400" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-red-400" />
                )}
              </button>
              {expandedSections.requiredFields && (
                <div className="p-2 space-y-1 bg-white max-h-40 overflow-y-auto">
                  {requiredFields.map(field => (
                    <DraggableFieldItem key={field.key} field={field} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* All Fields Section */}
          <div className="border rounded-lg overflow-hidden">
            <button
              onClick={() => toggleSection('allFields')}
              className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 hover:bg-slate-100"
            >
              <span className="text-xs font-semibold text-slate-700 uppercase">
                All Fields ({optionalFields.length})
              </span>
              {expandedSections.allFields ? (
                <ChevronDown className="h-4 w-4 text-slate-400" />
              ) : (
                <ChevronRight className="h-4 w-4 text-slate-400" />
              )}
            </button>
            {expandedSections.allFields && (
              <div className="p-2 space-y-1 bg-white max-h-60 overflow-y-auto">
                {optionalFields.map(field => (
                  <DraggableFieldItem key={field.key} field={field} />
                ))}
                {optionalFields.length === 0 && (
                  <p className="text-xs text-slate-400 text-center py-2">No fields match your search</p>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {/* Page Layout Selection */}
      {!hidePageLayout && (
        <div className="border-t pt-3 mt-3">
          <p className="text-xs font-semibold text-slate-700 uppercase mb-2">Page Layout</p>
          <div className="grid grid-cols-2 gap-2">
            {filteredLayouts.map(layout => (
              <div 
                key={layout.id}
                onClick={() => setSelectedLayout(layout.id)}
                className={`p-2 border rounded cursor-pointer transition-all ${
                  selectedLayout === layout.id 
                    ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200' 
                    : 'hover:border-blue-300'
                }`}
              >
                <p className="text-[10px] font-medium text-slate-700 mb-1">{layout.name}</p>
                <div className="scale-75 origin-left">{layout.preview}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// COMPONENT PROPERTIES PANEL
// ============================================================================
export const ComponentPropertiesPanel = ({ component, onUpdate, onRemove, objectName, selectedRelatedObject, onSelectRelatedObject }) => {
  // State for fields with parent lookups (for visibility conditions)
  const [allFieldsWithParents, setAllFieldsWithParents] = useState([]);
  
  // Fetch fields with parent lookups when objectName changes
  useEffect(() => {
    const loadFields = async () => {
      if (!objectName) return;
      
      // First try to get fields with parent lookups (for visibility conditions)
      const data = await fetchFieldsWithParentLookups(objectName);
      if (data?.all_fields) {
        // Convert API response to format expected by VisibilityConditionBuilder
        const fields = data.all_fields.map(f => ({
          key: f.full_path,
          api_name: f.api_name,
          label: f.label,
          type: f.field_type,
          isParent: f.is_parent,
          parentObject: f.parent_object,
          options: f.options || []
        }));
        setAllFieldsWithParents(fields);
      } else {
        // Fallback: try schema-based fields
        const schemaFields = await fetchSchemaFields(objectName);
        if (schemaFields && schemaFields.length > 0) {
          setAllFieldsWithParents(schemaFields);
        } else {
          // Last resort: static fallback fields
          setAllFieldsWithParents(getRecordFields(objectName));
        }
      }
    };
    
    loadFields();
  }, [objectName]);
  
  if (!component) {
    return (
      <div className="p-4 text-center text-slate-500">
        <FileText className="h-8 w-8 mx-auto mb-2 text-slate-300" />
        <p className="text-sm">Select a component to edit</p>
      </div>
    );
  }

  const compDef = STANDARD_COMPONENTS.find(c => c.id === component.id);
  const Icon = compDef?.icon || FileText;

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center space-x-3 pb-3 border-b">
        <div className="p-2 bg-blue-50 rounded">
          <Icon className="h-5 w-5 text-blue-600" />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-800">{compDef?.name}</p>
          <p className="text-xs text-slate-500">Component Properties</p>
        </div>
      </div>

      {/* Path Properties */}
      {component.id === 'path' && (
        <PathPropertyPanel
          component={component}
          onUpdate={onUpdate}
          objectName={objectName}
        />
      )}

      {/* Record Detail Properties */}
      {component.id === 'record_detail' && (
        <RecordDetailProperties component={component} onUpdate={onUpdate} objectName={objectName} />
      )}

      {/* Activities Properties */}
      {component.id === 'activities' && (
        <ActivityPropertyPanel
          component={component}
          onUpdate={onUpdate}
        />
      )}

      {/* Chatter Properties */}
      {component.id === 'chatter' && (
        <div className="space-y-4">
          <div className="p-3 bg-blue-50 rounded-lg">
            <p className="text-xs text-blue-700">
              Chatter allows team members to collaborate and communicate about this record. Users can post updates, polls, and questions.
            </p>
          </div>
          
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-2 uppercase">Features</label>
            <div className="space-y-1 text-[10px] text-slate-600 bg-slate-50 p-2 rounded">
              <p>• Post updates and announcements</p>
              <p>• Create polls for team feedback</p>
              <p>• Ask questions to colleagues</p>
              <p>• Search feed history</p>
              <p>• Filter and sort posts</p>
            </div>
          </div>
        </div>
      )}

      {/* Related Lists Properties */}
      {component.id === 'related_lists' && (
        <RelatedListsPropertyPanel 
          component={component} 
          onUpdate={onUpdate} 
          objectName={objectName}
          selectedRelatedObject={selectedRelatedObject}
          onSelectRelatedObject={onSelectRelatedObject}
        />
      )}

      {/* Related List Quick Links Properties */}
      {component.id === 'related_list_quick_links' && (
        <RelatedListQuickLinksProperties component={component} onUpdate={onUpdate} objectName={objectName} />
      )}

      {/* Tabs Info */}
      {component.id === 'tabs' && (
        <div className="space-y-4">
          <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
            <p className="text-xs text-blue-700 font-medium mb-1">Drag & Drop</p>
            <p className="text-[10px] text-blue-600">
              Drag components from the left sidebar directly into the tabs on the canvas. 
              Click on tab labels to rename them. Use the + button to add more tabs (max 5).
            </p>
          </div>
        </div>
      )}

      {/* Highlights Panel Properties */}
      {component.id === 'highlights_panel' && (
        <HighlightsPanelProperties component={component} onUpdate={onUpdate} objectName={objectName} />
      )}

      {/* Actions Component Properties */}
      {component.id === 'actions' && (
        <ActionsProperties component={component} onUpdate={onUpdate} objectName={objectName} />
      )}

      {/* Flow Component Properties */}
      {component.id === 'flow' && (
        <FlowProperties component={component} onUpdate={onUpdate} objectName={objectName} />
      )}

      {/* Component Visibility Rules */}
      <div className="pt-3 border-t">
        {allFieldsWithParents.some(f => f.isParent) && (
          <div className="mb-2 flex items-center gap-1 text-[10px] text-indigo-600">
            <Link className="h-3 w-3" />
            Parent lookup fields available
          </div>
        )}
        <VisibilityConditionBuilder
          visibility={component.visibility}
          onChange={(newVisibility) => {
            onUpdate({
              ...component,
              visibility: newVisibility,
            });
          }}
          objectFields={allFieldsWithParents.length > 0 ? allFieldsWithParents : getRecordFields(objectName)}
        />
        {hasVisibilityConditions(component.visibility) && (
          <div className="mt-2 p-2 bg-slate-50 rounded text-[10px] text-slate-600">
            {getVisibilitySummary(component.visibility, allFieldsWithParents.length > 0 ? allFieldsWithParents : getRecordFields(objectName))}
          </div>
        )}
      </div>

      <div className="pt-3 border-t">
        <Button 
          variant="outline" 
          size="sm" 
          className="w-full text-red-600 border-red-200 hover:bg-red-50"
          onClick={() => onRemove(component.instanceId, component.regionId)}
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Remove Component
        </Button>
      </div>
    </div>
  );
};
