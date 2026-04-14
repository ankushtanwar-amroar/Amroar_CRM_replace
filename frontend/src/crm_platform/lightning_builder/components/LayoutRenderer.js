import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Mail, Phone, Building, Calendar, User, 
  CheckSquare, FileText, Activity, ChevronRight, Plus, Lock 
} from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { Input } from '../../../components/ui/input';
import toast from 'react-hot-toast';
import axios from 'axios';
import { 
  evaluateComponentVisibility, 
  getUserContext,
  migrateVisibilityConfig 
} from '../../../modules/component-visibility';
import { ActivityComponent, createDefaultActivityConfig, hasActivityConfig } from '../../../modules/activity';
import { PathComponent } from '../../../modules/path/components';
import { RelatedListsRuntimeComponent } from '../../../modules/related-lists';
import { evaluateFieldBehavior, RULE_MODES } from '../../../modules/field-behavior-rules';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

/**
 * Separate component for related list to properly use hooks
 */
const RelatedListComponent = ({ component, relatedListsData, loadingRelatedLists, onFetch }) => {
  const relatedObject = component.properties?.relatedObject || 'task';
  const title = component.properties?.title || component.label || 'Related Records';
  const showNewButton = component.properties?.showNewButton !== false;
  const componentId = component.id;

  // Fetch related list data on mount
  useEffect(() => {
    onFetch(relatedObject, componentId);
  }, [relatedObject, componentId, onFetch]);

  const isLoading = loadingRelatedLists[componentId];
  const relatedRecords = relatedListsData[componentId] || [];

  return (
    <div className="bg-white border border-slate-200 rounded-lg">
      <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900">
          {title} ({relatedRecords.length})
        </h3>
        {showNewButton && (
          <Button size="sm" variant="outline">
            <Plus className="h-4 w-4 mr-1" />
            New
          </Button>
        )}
      </div>
      <div className="p-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-6">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
          </div>
        ) : relatedRecords.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-6">
            No {relatedObject}s yet
          </p>
        ) : (
          <div className="space-y-2">
            {relatedRecords.slice(0, 5).map((relatedRecord, idx) => (
              <div 
                key={relatedRecord.id || idx} 
                className="flex items-center justify-between p-2 hover:bg-slate-50 rounded border border-slate-100"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">
                    {relatedRecord.data?.name || relatedRecord.data?.title || relatedRecord.series_id}
                  </p>
                  <p className="text-xs text-slate-500 truncate">
                    {relatedRecord.data?.status || 'Active'}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-slate-400" />
              </div>
            ))}
            {relatedRecords.length > 5 && (
              <button className="text-xs text-blue-600 hover:text-blue-700 w-full text-center py-2">
                View All ({relatedRecords.length})
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * LayoutRenderer - Dynamically renders a page based on Lightning Layout JSON
 * This component interprets the layout configuration and renders the appropriate
 * components in their designated regions
 */
const LayoutRenderer = ({ layout, record, objectInfo, onRecordUpdate }) => {
  const [editingField, setEditingField] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [relatedListsData, setRelatedListsData] = useState({});
  const [loadingRelatedLists, setLoadingRelatedLists] = useState({});

  // Get user context for visibility evaluation
  const userContext = useMemo(() => getUserContext(), []);

  if (!layout || !record) {
    return <div className="p-6 text-slate-500">No layout or record data available</div>;
  }

  const recordData = record.data || {};
  const regions = layout.regions || [];

  // Fetch related lists data
  const fetchRelatedList = async (relatedObject, componentId) => {
    if (relatedListsData[componentId]) return; // Already loaded
    
    setLoadingRelatedLists(prev => ({ ...prev, [componentId]: true }));
    
    try {
      const token = localStorage.getItem('token');
      // Fetch related records based on parent record
      const response = await axios.get(
        `${BACKEND_URL}/api/objects/${relatedObject}/records?limit=10`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      const records = response.data.records || response.data || [];
      setRelatedListsData(prev => ({ ...prev, [componentId]: records }));
    } catch (err) {
      console.error('Error fetching related list:', err);
      setRelatedListsData(prev => ({ ...prev, [componentId]: [] }));
    } finally {
      setLoadingRelatedLists(prev => ({ ...prev, [componentId]: false }));
    }
  };

  /**
   * Check if a component should be visible based on visibility rules
   * Uses the new visibility engine with:
   * - Support for new visibility config format
   * - Backward compatibility with old format (visibilityField in properties)
   * - Safe default: hidden when data not available
   */
  const isComponentVisible = (component) => {
    // Explicit visible=false always hides
    if (component.visible === false) return false;

    // Get visibility config (new format or migrate old format)
    const visibility = component.visibility || migrateVisibilityConfig(component);
    
    // Use new visibility engine
    const result = evaluateComponentVisibility(
      visibility,
      recordData,
      userContext,
      null // uiContext
    );
    
    return result.visible;
  };

  // Handle inline field editing
  const handleEditField = (fieldName, currentValue) => {
    setEditingField(fieldName);
    setEditValue(currentValue || '');
  };

  const handleSaveField = async (fieldName) => {
    try {
      const token = localStorage.getItem('token');
      const updatedData = {
        ...recordData,
        [fieldName]: editValue
      };

      await axios.put(
        `${BACKEND_URL}/api/objects/${record.object_name}/records/${record.id}`,
        { data: updatedData },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (onRecordUpdate) {
        onRecordUpdate({ ...record, data: updatedData });
      }

      setEditingField(null);
      setEditValue('');
      toast.success('Field updated');
    } catch (err) {
      console.error('Error updating field:', err);
      toast.error('Failed to update field');
    }
  };

  const handleCancelEdit = () => {
    setEditingField(null);
    setEditValue('');
  };

  // Helper to format field value based on type
  const formatFieldValue = (fieldName, fieldValue, fieldType) => {
    if (!fieldValue && fieldValue !== 0) return '—';
    
    const lowerFieldName = fieldName.toLowerCase();
    
    // Date fields
    if (lowerFieldName.includes('date') || lowerFieldName.includes('_at')) {
      try {
        return new Date(fieldValue).toLocaleDateString();
      } catch {
        return fieldValue;
      }
    }
    
    // Email fields
    if (lowerFieldName.includes('email') || fieldType === 'email') {
      return <a href={`mailto:${fieldValue}`} className="text-blue-600 hover:underline">{fieldValue}</a>;
    }
    
    // Phone fields
    if (lowerFieldName.includes('phone') || lowerFieldName.includes('mobile') || fieldType === 'phone') {
      return <a href={`tel:${fieldValue}`} className="text-blue-600 hover:underline">{fieldValue}</a>;
    }
    
    // Boolean fields
    if (typeof fieldValue === 'boolean') {
      return fieldValue ? <Badge className="bg-green-100 text-green-700">Yes</Badge> : <Badge className="bg-slate-100 text-slate-700">No</Badge>;
    }
    
    return String(fieldValue);
  };

  // Component Renderers
  const renderFieldComponent = (component) => {
    const fieldName = component.field_name || component.properties?.fieldType;
    const fieldValue = recordData[fieldName];
    const showLabel = component.properties?.showLabel !== false;
    const isEditable = component.properties?.isEditable !== false;
    const label = component.label || fieldName;
    const fieldType = component.properties?.fieldType;

    // Evaluate field behavior rules
    const fieldConfig = {
      key: fieldName,
      fieldApiName: fieldName,
      visibilityRule: component.visibilityRule,
      requiredRule: component.requiredRule,
      readonlyRule: component.readonlyRule
    };
    
    const hasRules = fieldConfig.visibilityRule?.mode === RULE_MODES.CONDITIONAL ||
                     fieldConfig.requiredRule?.mode === RULE_MODES.ALWAYS ||
                     fieldConfig.requiredRule?.mode === RULE_MODES.CONDITIONAL ||
                     fieldConfig.readonlyRule?.mode === RULE_MODES.ALWAYS ||
                     fieldConfig.readonlyRule?.mode === RULE_MODES.CONDITIONAL;
    
    let fieldState = { isVisible: true, isRequired: false, isReadonly: false };
    
    if (hasRules) {
      fieldState = evaluateFieldBehavior(fieldConfig, recordData, {}, 'view');
    }
    
    // Skip rendering if not visible
    if (!fieldState.isVisible) {
      return null;
    }
    
    const isEditing = editingField === fieldName;
    const formattedValue = formatFieldValue(fieldName, fieldValue, fieldType);
    const isFieldReadonly = fieldState.isReadonly || !isEditable;

    return (
      <div key={component.id} className="bg-white border border-slate-200 rounded-lg p-4">
        {showLabel && (
          <div className="flex items-center gap-1 mb-2">
            <label className="text-xs font-semibold text-slate-600 uppercase">
              {label}
            </label>
            {fieldState.isRequired && (
              <span className="text-red-500 text-xs">*</span>
            )}
            {fieldState.isReadonly && (
              <Lock className="h-3 w-3 text-amber-500" title="Read-only" />
            )}
          </div>
        )}
        
        {isEditing ? (
          <div className="space-y-2">
            <Input
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              className="w-full"
              autoFocus
              type={fieldType === 'email' ? 'email' : fieldType === 'phone' ? 'tel' : 'text'}
            />
            <div className="flex space-x-2">
              <Button size="sm" onClick={() => handleSaveField(fieldName)}>
                Save
              </Button>
              <Button size="sm" variant="outline" onClick={handleCancelEdit}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between group">
            <div className="text-sm text-slate-900 flex-1">
              {formattedValue}
            </div>
            {isEditable && !isFieldReadonly && (
              <button
                onClick={() => handleEditField(fieldName, fieldValue)}
                className="opacity-0 group-hover:opacity-100 text-xs text-blue-600 hover:text-blue-700 transition-opacity ml-2"
              >
                Edit
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderRelatedListComponent = (component) => {
    // Check if this is the enhanced related lists component (with multiple lists and column config)
    if (component.config?.lists && Array.isArray(component.config.lists)) {
      return (
        <RelatedListsRuntimeComponent
          key={component.id}
          config={component.config}
          parentObjectName={objectInfo?.object_name || 'record'}
          parentRecordId={record.series_id}
        />
      );
    }
    
    // Fallback to simple related list component
    return (
      <RelatedListComponent 
        key={component.id}
        component={component}
        relatedListsData={relatedListsData}
        loadingRelatedLists={loadingRelatedLists}
        onFetch={fetchRelatedList}
      />
    );
  };

  const renderActivityComponent = (component) => {
    // Get activity config (use default if not configured)
    const config = hasActivityConfig(component) 
      ? component.config 
      : createDefaultActivityConfig();
    
    // Get parent record name for display in modal
    const recordName = recordData.name || 
      (recordData.first_name && recordData.last_name 
        ? `${recordData.first_name} ${recordData.last_name}` 
        : record.series_id);
    
    return (
      <ActivityComponent
        key={component.id}
        config={config}
        parentObjectName={objectInfo?.object_name || 'record'}
        parentRecordId={record.series_id}
        parentRecordName={recordName}
      />
    );
  };

  // Render Path component with dynamic picklist field support
  const renderPathComponent = (component) => {
    // Handle record updates from Path component
    const handlePathRecordUpdate = (updatedRecord) => {
      if (onRecordUpdate) {
        onRecordUpdate(updatedRecord);
      }
    };
    
    return (
      <PathComponent
        key={component.id}
        config={component.config}
        record={record}
        objectName={objectInfo?.object_name || record.object_name}
        onRecordUpdate={handlePathRecordUpdate}
      />
    );
  };

  const renderCustomHTMLComponent = (component) => {
    const content = component.properties?.content || '<div>Custom content</div>';

    return (
      <div 
        key={component.id} 
        className="bg-white border border-slate-200 rounded-lg p-4"
        dangerouslySetInnerHTML={{ __html: content }}
      />
    );
  };

  const renderSectionComponent = (component) => {
    return (
      <div key={component.id} className="bg-white border border-slate-200 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-slate-900 mb-3">
          {component.label || 'Section'}
        </h3>
        <p className="text-sm text-slate-500">Section content goes here</p>
      </div>
    );
  };

  // Main component renderer
  const renderComponent = (component) => {
    if (!isComponentVisible(component)) {
      return null;
    }

    switch (component.type) {
      case 'field':
        return renderFieldComponent(component);
      case 'related_list':
      case 'related_lists':
        return renderRelatedListComponent(component);
      case 'activity':
        return renderActivityComponent(component);
      case 'path':
        return renderPathComponent(component);
      case 'custom_html':
        return renderCustomHTMLComponent(component);
      case 'section':
      case 'tabs':
        return renderSectionComponent(component);
      default:
        return (
          <div key={component.id} className="bg-white border border-slate-200 rounded-lg p-4">
            <p className="text-sm text-slate-500">Unknown component type: {component.type}</p>
          </div>
        );
    }
  };

  // Get record name for display
  const getRecordName = () => {
    if (objectInfo?.name_field && recordData[objectInfo.name_field]) {
      return recordData[objectInfo.name_field];
    }
    return recordData.name || recordData.title || recordData.first_name || record.series_id || 'Record Details';
  };

  return (
    <div className="h-full flex flex-col bg-slate-50">
      {/* Record Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">{getRecordName()}</h1>
            <p className="text-sm text-slate-600 mt-1">
              {objectInfo?.object_label || record.object_name} • {record.series_id}
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <Badge variant="secondary" className="bg-green-100 text-green-700">
              Active
            </Badge>
          </div>
        </div>
      </div>

      {/* Layout Regions */}
      <div className="flex-1 overflow-hidden">
        <div className="flex gap-4 h-full p-6">
          {regions
            .sort((a, b) => a.order - b.order)
            .map(region => (
              <div key={region.id} className={`${region.width} overflow-y-auto`}>
                <div className="space-y-4">
                  {region.components && region.components.length > 0 ? (
                    region.components
                      .filter(c => isComponentVisible(c))
                      .sort((a, b) => a.order - b.order)
                      .map(component => renderComponent(component))
                  ) : (
                    <div className="bg-white border border-slate-200 rounded-lg p-6 text-center">
                      <p className="text-sm text-slate-400">
                        No components in this region
                      </p>
                      <p className="text-xs text-slate-400 mt-1">
                        Edit page to add components
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
};

export default LayoutRenderer;
