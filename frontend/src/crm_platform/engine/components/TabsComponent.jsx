/**
 * TabsComponent - Dynamic Tabbed Content Renderer
 * 
 * Renders tabbed content configured in Lightning App Builder.
 * Each tab can contain:
 * - Nested components (record_detail, activities, chatter, etc.)
 * - Field sections (legacy format)
 * 
 * Components dropped into tabs in Lightning Builder are rendered here.
 */
import React, { useState } from 'react';
import { cn } from '../../../lib/utils';
import LookupField from './LookupField';

// Import all components that can be placed inside tabs
import RecordDetailComponent from './RecordDetailComponent';
import ActivitiesComponent from './ActivitiesComponent';
import RelatedListsComponent from './RelatedListsComponent';
import ChatterComponent from './ChatterComponent';
import HighlightsPanelComponent from './HighlightsPanelComponent';
import PathComponent from './PathComponent';
import BlankSpaceComponent from './BlankSpaceComponent';
import FilesComponent from './FilesComponent';
import ActionsComponent from './ActionsComponent';
import RelatedListQuickLinksComponent from './RelatedListQuickLinksComponent';

// Component registry for rendering nested components inside tabs
const TAB_COMPONENT_MAP = {
  record_detail: RecordDetailComponent,
  activities: ActivitiesComponent,
  related_lists: RelatedListsComponent,
  chatter: ChatterComponent,
  highlights_panel: HighlightsPanelComponent,
  path: PathComponent,
  blank_space: BlankSpaceComponent,
  files: FilesComponent,
  actions: ActionsComponent,
  related_list_quick_links: RelatedListQuickLinksComponent,
};

/**
 * Render field value with proper formatting
 * Uses LookupField component for lookup/reference types
 */
const renderFieldValue = (value, field, fieldKey, onOpenRelated) => {
  if (value === null || value === undefined || value === '') {
    return <span className="text-slate-400 italic">—</span>;
  }
  
  const fieldType = field?.type?.toLowerCase() || 'text';
  
  // Handle lookup fields with LookupField component
  if (fieldType === 'lookup' || fieldType === 'reference') {
    return (
      <LookupField
        value={value}
        objectType={field?.reference_to || field?.lookup_object || field?.related_object}
        fieldName={fieldKey}
        showPreview={true}
        onNavigate={onOpenRelated}
      />
    );
  }
  
  switch (fieldType) {
    case 'checkbox':
    case 'boolean':
      return (
        <span className={`inline-flex items-center gap-1 ${value ? 'text-green-600' : 'text-slate-400'}`}>
          {value ? '✓ Yes' : '✗ No'}
        </span>
      );
    case 'currency':
      const currencySymbol = field?.currency_symbol || '$';
      return <span>{currencySymbol}{Number(value).toLocaleString()}</span>;
    case 'percent':
      return <span>{value}%</span>;
    case 'date':
      return <span>{new Date(value).toLocaleDateString()}</span>;
    case 'datetime':
      return <span>{new Date(value).toLocaleString()}</span>;
    case 'url':
      return (
        <a href={value} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
          {value}
        </a>
      );
    case 'email':
      return (
        <a href={`mailto:${value}`} className="text-blue-600 hover:underline">
          {value}
        </a>
      );
    case 'phone':
      return (
        <a href={`tel:${value}`} className="text-blue-600 hover:underline">
          {value}
        </a>
      );
    default:
      return <span>{String(value)}</span>;
  }
};

/**
 * Field Section within a Tab (legacy format support)
 */
const TabFieldSection = ({ section, record, objectFields, onOpenRelated }) => {
  const recordData = record?.data || record || {};
  const fields = section.fields || [];
  const columns = section.columns || 2;
  
  return (
    <div className="mb-6 last:mb-0">
      <h4 className="text-sm font-semibold text-slate-700 border-b pb-1 mb-3">
        {section.name || section.label || 'Details'}
      </h4>
      <div className={`grid gap-x-6 gap-y-3 ${columns === 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
        {fields.map((fieldKey, idx) => {
          const field = objectFields?.[fieldKey] || {};
          const value = recordData[fieldKey];
          
          return (
            <div key={`${fieldKey}-${idx}`} className="min-w-0">
              <dt className="text-xs font-medium text-slate-500 mb-0.5">
                {field.label || fieldKey}
              </dt>
              <dd className="text-sm text-slate-900 truncate">
                {renderFieldValue(value, field, fieldKey, onOpenRelated)}
              </dd>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/**
 * Render a component inside a tab
 */
const TabComponent = ({ component, context }) => {
  const componentId = component.id || component.type;
  const Component = TAB_COMPONENT_MAP[componentId];
  
  if (!Component) {
    console.warn(`[TabsComponent] Unknown component type: ${componentId}`);
    return (
      <div className="p-4 bg-slate-50 rounded border border-slate-200 text-center">
        <p className="text-sm text-slate-500">Unknown component: {componentId}</p>
      </div>
    );
  }
  
  return (
    <div className="mb-4 last:mb-0" key={component.instanceId || `${componentId}-${Date.now()}`}>
      <Component config={component.config || {}} context={context} />
    </div>
  );
};

/**
 * Main TabsComponent
 */
const TabsComponent = ({ config = {}, context: contextProp = {}, ...spreadProps }) => {
  // Support both context object and spread props patterns
  // ComponentRenderer spreads context as individual props, so we need to handle both
  const context = {
    ...contextProp,
    ...spreadProps,
  };
  
  const { record, objectFields, objectSchema, onOpenRelated, objectName, onRecordUpdate } = context;
  // Get objectFields from objectSchema if not provided directly
  const resolvedObjectFields = objectFields || objectSchema?.fields || {};
  
  const tabs = config.tabs || [];
  const [activeTab, setActiveTab] = useState(0);
  
  // If no tabs configured, show placeholder
  if (tabs.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
        <div className="text-center text-slate-500 text-sm">
          <p className="font-medium">No Tabs Configured</p>
          <p className="text-xs mt-1">Configure tabs in Lightning App Builder</p>
        </div>
      </div>
    );
  }
  
  const activeTabData = tabs[activeTab] || tabs[0];
  const tabComponents = activeTabData?.components || [];
  const tabSections = activeTabData?.sections || [];
  const tabFields = activeTabData?.fields || [];
  
  // Determine what to render inside the tab
  const hasComponents = tabComponents.length > 0;
  const hasSections = tabSections.length > 0;
  const hasFields = tabFields.length > 0;
  const hasContent = hasComponents || hasSections || hasFields;
  
  return (
    <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden" data-testid="tabs-component">
      {/* Tab Headers */}
      <div className="flex border-b border-slate-200 bg-slate-50">
        {tabs.map((tab, idx) => (
          <button
            key={tab.id || idx}
            onClick={() => setActiveTab(idx)}
            className={cn(
              "px-4 py-3 text-sm font-medium transition-colors border-b-2 -mb-px",
              activeTab === idx
                ? "text-blue-600 border-blue-600 bg-white"
                : "text-slate-600 border-transparent hover:text-slate-900 hover:bg-slate-100"
            )}
          >
            {tab.label || tab.name || `Tab ${idx + 1}`}
            {/* Show component count badge */}
            {(tab.components?.length > 0) && (
              <span className="ml-2 px-1.5 py-0.5 text-xs bg-slate-200 text-slate-600 rounded-full">
                {tab.components.length}
              </span>
            )}
          </button>
        ))}
      </div>
      
      {/* Tab Content */}
      <div className="p-4">
        {/* Render nested components (from Lightning Builder) */}
        {hasComponents && (
          <div className="space-y-4">
            {tabComponents.map((comp, idx) => (
              <TabComponent 
                key={comp.instanceId || `${comp.id}-${idx}`}
                component={comp}
                context={context}
              />
            ))}
          </div>
        )}
        
        {/* Render legacy sections format */}
        {!hasComponents && hasSections && tabSections.map((section, idx) => (
          <TabFieldSection
            key={section.id || idx}
            section={section}
            record={record}
            objectFields={resolvedObjectFields}
            onOpenRelated={onOpenRelated}
          />
        ))}
        
        {/* Fallback if no sections but has fields directly */}
        {!hasComponents && !hasSections && hasFields && (
          <TabFieldSection
            section={{ fields: tabFields, columns: 2 }}
            record={record}
            objectFields={resolvedObjectFields}
            onOpenRelated={onOpenRelated}
          />
        )}
        
        {/* Empty tab message */}
        {!hasContent && (
          <div className="text-center py-8 text-slate-400">
            <p className="text-sm">No content in this tab</p>
            <p className="text-xs mt-1">Add components in Lightning App Builder</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default TabsComponent;
