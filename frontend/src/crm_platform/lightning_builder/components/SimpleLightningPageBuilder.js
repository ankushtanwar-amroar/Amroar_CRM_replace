import React, { useState, useEffect, useRef } from 'react';
import { 
  X, Save, Columns, Layout, ChevronRight, ChevronDown, ChevronUp,
  GripVertical, Search, Monitor, Smartphone, Plus,
  Tablet, Eye, User, Mail, Phone, 
  Calendar, CheckCircle, MessageSquare, List, FileText, BarChart3, 
  Clock, Star, Zap, Bell, PlusCircle, Edit, Trash2,
  Activity, Target, LayoutGrid, Square, RectangleHorizontal, RotateCcw, Globe, Link, LayoutList, Settings,
  MoreHorizontal
} from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  useDroppable,
  useDraggable,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ActivityPropertyPanel, createDefaultActivityConfig, hasActivityConfig } from '../../../modules/activity';
import { PathPropertyPanel } from '../../../modules/path/components';
import { 
  RelatedListsPropertyPanel, 
  RelatedListsPreviewEnhanced,
  getRelatedObjects 
} from '../../../modules/related-lists';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import lightningLayoutService from '../services/lightningLayoutService';
import toast from 'react-hot-toast';
import FieldBehaviorRulesPanel from '../../../modules/field-behavior-rules/components/FieldBehaviorRulesPanel';
import VisibilityConditionBuilder from '../../../modules/component-visibility/components/VisibilityConditionBuilder';
import { getVisibilitySummary, hasVisibilityConditions } from '../../../modules/component-visibility';

// Import constants from extracted file
import {
  STANDARD_COMPONENTS,
  FIELD_COMPONENTS,
  OBJECT_FIELDS,
  DEFAULT_FIELDS,
  RELATED_OBJECTS,
  LAYOUT_TEMPLATES,
} from '../constants/builderConstants';

// Import utility functions from extracted file
import {
  getRecordFields,
  getDefaultRecordDetailItems,
  getRelatedObjectsInternal,
  getDefaultRelatedLists,
  customCollisionDetection,
  generateInstanceId,
  isLinkField,
  isBadgeField,
  getSampleValue,
  SAMPLE_FIELD_VALUES,
  fetchSchemaFields,
} from '../utils/builderUtils';

// Import preview components from extracted file
import {
  PathPreview,
  ActivitiesPreview,
  RelatedListsPreview,
  RelatedListQuickLinksPreview,
  ChatterPreview,
  BlankSpacePreview,
  DynamicHighlightsPanelPreview,
  FieldSectionPreview,
  SingleFieldPreview,
  HighlightsPanelPreview,
  TabsPreview,
  SortableAddedListItem,
  TabDropZone,
  LEAD_FIELDS,
  ActionsPreview,
  QuickActionsPreview,
  AuditTrailPreview,
  FlowPreview,
} from './previews';

// Import property panel components from extracted file
import {
  RecordDetailProperties,
  RelatedListsProperties,
  RelatedListQuickLinksProperties,
  HighlightsPanelProperties,
  DraggableRelatedObjectItem,
  DraggableQuickLinkItem,
  FlowProperties,
} from './properties';

// Import sidebar components from extracted file
import {
  DraggableFieldItem,
  DraggableFieldComponent,
  FieldsTabContent,
  ComponentPropertiesPanel,
} from './sidebar';

// Import record detail components from extracted file
import {
  FieldSectionDropZone,
  SortableRecordItem,
  FieldInsertionPoint,
  RecordDetailPreview,
} from './record-detail';

/**
 * Helper function to process Record Detail items into proper section structure
 * This matches the logic in RecordDetailPreview.configuredItems useMemo
 * @param {Array} rawItems - Raw items from config or default items
 * @param {string} objectName - Object name for labeling
 * @returns {Array} Processed items in section format
 */
const processRecordDetailItems = (rawItems, objectName) => {
  const normalizedName = objectName?.toLowerCase() || 'record';
  
  // If no items, create a default section with standard fields
  // This matches the visual display in record-detail/index.js
  if (!rawItems || rawItems.length === 0) {
    const sectionLabel = {
      lead: 'Lead Information',
      opportunity: 'Opportunity Information',
      account: 'Account Information',
      contact: 'Contact Information',
      task: 'Details',
      event: 'Details'
    }[normalizedName] || 'Details';
    
    // Default fields - use the same ID format as record-detail/index.js: `field-${key}-${idx}`
    const defaultFields = [
      { id: 'field-name-0', type: 'field', key: 'name', label: 'Name' },
      { id: 'field-description-1', type: 'field', key: 'description', label: 'Description' },
      { id: 'field-status-2', type: 'field', key: 'status', label: 'Status' },
    ];
    
    return [{
      id: `section-${normalizedName}-info`,
      type: 'field_section',
      label: sectionLabel,
      collapsed: false,
      fields: defaultFields
    }];
  }
  
  const sections = rawItems.filter(item => item.type === 'field_section');
  const looseFields = rawItems.filter(item => item.type === 'field');
  
  if (looseFields.length > 0 && sections.length === 0) {
    // Wrap loose fields in a default section - use consistent ID format with record-detail/index.js
    const sectionLabel = {
      lead: 'Lead Information',
      opportunity: 'Opportunity Information',
      account: 'Account Information',
      contact: 'Contact Information',
      task: 'Details',
      event: 'Details'
    }[normalizedName] || 'Details';
    
    return [{
      id: `section-${normalizedName}-info`,  // Matches getDefaultItems in record-detail/index.js
      type: 'field_section',
      label: sectionLabel,
      collapsed: false,
      fields: looseFields.map((f, idx) => ({
        id: f.id || `field-${f.key}-${idx}`,  // Use same format as record-detail/index.js
        type: 'field',
        key: f.key,
        label: f.label
      }))
    }];
  } else if (sections.length > 0) {
    return sections;
  }
  
  // Fallback
  const sectionLabel = {
    lead: 'Lead Information',
    opportunity: 'Opportunity Information',
    account: 'Account Information',
    contact: 'Contact Information',
    task: 'Details',
    event: 'Details'
  }[normalizedName] || 'Details';
  
  return [{
    id: `section-${normalizedName}-info`,
    type: 'field_section',
    label: sectionLabel,
    collapsed: false,
    fields: []
  }];
};

// Draggable Component from Sidebar
const DraggableComponent = ({ component }) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `sidebar-${component.id}`,
    data: { type: 'component', component }
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
      className={`px-3 py-2 bg-white border rounded cursor-grab active:cursor-grabbing hover:border-blue-400 hover:bg-blue-50 transition-all flex items-center space-x-2 ${
        isDragging ? 'opacity-50 shadow-lg ring-2 ring-blue-500' : ''
      }`}
    >
      <Icon className="h-4 w-4 text-slate-500" />
      <span className="text-sm text-slate-700">{component.name}</span>
      <GripVertical className="h-3 w-3 text-slate-400 ml-auto" />
    </div>
  );
};

// Component Insertion Point - Shows drop indicator between components
const ComponentInsertionPoint = ({ regionId, index, isVisible }) => {
  const dropId = `component-insert-${regionId}-${index}`;
  const { setNodeRef, isOver } = useDroppable({ 
    id: dropId,
    data: {
      type: 'component-insertion-point',
      regionId,
      index
    }
  });
  
  const showIndicator = isOver || isVisible;
  
  return (
    <div 
      ref={setNodeRef}
      className={`transition-all ${showIndicator ? 'h-8 my-1' : 'h-1 my-0'}`}
    >
      {showIndicator && (
        <div className="h-full w-full bg-blue-100 border-2 border-dashed border-blue-400 rounded flex items-center justify-center">
          <span className="text-xs text-blue-600 font-medium">Drop here</span>
        </div>
      )}
    </div>
  );
};

// Droppable Region on Canvas with Sortable Support
const DroppableRegion = ({ id, label, children, placedComponents, onSelectComponent, selectedComponent, onRemoveComponent, onUpdateComponent, objectName, schemaFields, selectedRelatedObject, onSelectRelatedObject, onMoveComponent, activeDragId }) => {
  const { setNodeRef, isOver, active } = useDroppable({ id });
  
  const componentIds = placedComponents.map(c => c.instanceId);
  
  // Check if we're dragging a sidebar component (new component)
  const isDraggingSidebarComponent = active?.id?.toString().startsWith('sidebar-');

  return (
    <div
      ref={setNodeRef}
      className={`min-h-[80px] rounded border-2 border-dashed transition-all ${
        isOver ? 'border-blue-500 bg-blue-50' : 'border-slate-300 bg-white'
      }`}
    >
      <div className="px-2 py-1 bg-slate-100 border-b border-slate-200 rounded-t">
        <span className="text-[10px] font-semibold text-slate-500 uppercase">{label}</span>
      </div>
      <div className="p-2 space-y-0 min-h-[60px]">
        {placedComponents.length === 0 ? (
          <div className="text-center py-4 text-slate-400">
            <p className="text-xs">Drop components here</p>
          </div>
        ) : (
          <SortableContext items={componentIds} strategy={verticalListSortingStrategy}>
            {/* Initial insertion point */}
            {isDraggingSidebarComponent && (
              <ComponentInsertionPoint regionId={id} index={0} isVisible={true} />
            )}
            {placedComponents.map((comp, index) => (
              <React.Fragment key={comp.instanceId}>
                <SortablePlacedComponent 
                  component={comp}
                  regionId={id}
                  onSelect={onSelectComponent}
                  onRemove={onRemoveComponent}
                  onUpdate={onUpdateComponent}
                  isSelected={selectedComponent?.instanceId === comp.instanceId}
                  objectName={objectName}
                  schemaFields={schemaFields}
                  selectedRelatedObject={selectedRelatedObject}
                  onSelectRelatedObject={onSelectRelatedObject}
                />
                {/* Insertion point after each component */}
                {isDraggingSidebarComponent && (
                  <ComponentInsertionPoint regionId={id} index={index + 1} isVisible={true} />
                )}
              </React.Fragment>
            ))}
          </SortableContext>
        )}
      </div>
    </div>
  );
};

// Sortable wrapper for PlacedComponentItem - enables drag to reorder
const SortablePlacedComponent = ({ component, regionId, onSelect, onRemove, onUpdate, isSelected, objectName, schemaFields, selectedRelatedObject, onSelectRelatedObject }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ 
    id: component.instanceId,
    data: { 
      type: 'placed-component',
      component,
      regionId
    }
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <PlacedComponentItem 
        component={component}
        regionId={regionId}
        onSelect={onSelect}
        onRemove={onRemove}
        onUpdate={onUpdate}
        isSelected={isSelected}
        objectName={objectName}
        schemaFields={schemaFields}
        selectedRelatedObject={selectedRelatedObject}
        onSelectRelatedObject={onSelectRelatedObject}
        dragHandleProps={{ ref: setActivatorNodeRef, ...attributes, ...listeners }}
        isDragging={isDragging}
      />
    </div>
  );
};

// Placed Component Item with preview
const PlacedComponentItem = ({ component, regionId, onSelect, onRemove, onUpdate, isSelected, objectName, schemaFields, selectedRelatedObject, onSelectRelatedObject, dragHandleProps = {}, isDragging = false }) => {
  // Find component definition from different sources
  let compDef = STANDARD_COMPONENTS.find(c => c.id === component.id);
  if (!compDef) {
    compDef = FIELD_COMPONENTS.find(c => c.id === component.id);
  }
  
  // For individual fields, create a pseudo definition
  let Icon = compDef?.icon || FileText;
  let displayName = compDef?.name || component.name || component.id;
  
  // Handle field type
  if (component.category === 'field') {
    displayName = component.name || component.config?.label || 'Field';
    Icon = FileText;
  }

  // Handle mark status as complete for Path
  const handleMarkComplete = () => {
    const stages = component.config?.stages || ['New', 'Working', 'Closed', 'Converted'];
    const currentStage = component.config?.currentStage || 'New';
    const currentIndex = stages.indexOf(currentStage);
    
    if (currentIndex < stages.length - 1) {
      const nextStage = stages[currentIndex + 1];
      onUpdate({
        ...component,
        config: { ...component.config, currentStage: nextStage }
      });
    }
  };

  // Render component preview based on type
  const renderPreview = () => {
    switch (component.id) {
      case 'path':
        return <PathPreview config={component.config} onMarkComplete={handleMarkComplete} />;
      case 'record_detail':
        return <RecordDetailPreview 
          config={component.config} 
          component={component}
          onConfigUpdate={(newConfig) => onUpdate({ ...component, config: newConfig })}
          objectName={objectName}
          schemaFields={schemaFields}
        />;
      case 'activities':
        return <ActivitiesPreview config={component.config} />;
      case 'related_lists':
        return <RelatedListsPreviewEnhanced 
          config={component.config} 
          component={component}
          onConfigUpdate={(newConfig) => onUpdate({ ...component, config: newConfig })}
          objectName={objectName}
          selectedRelatedObject={selectedRelatedObject}
          onSelectRelatedObject={onSelectRelatedObject}
        />;
      case 'related_list_quick_links':
        return <RelatedListQuickLinksPreview 
          config={component.config} 
          objectName={objectName}
          onConfigChange={(newConfig) => onUpdate({ ...component, config: newConfig })}
        />;
      case 'chatter':
        return <ChatterPreview config={component.config} />;
      case 'tabs':
        return <TabsPreview 
          config={component.config} 
          objectName={objectName}
          schemaFields={schemaFields}
          component={component}
          onUpdate={onUpdate}
          onSelectInnerComponent={onSelect}
        />;
      case 'highlights_panel':
        return <HighlightsPanelPreview config={component.config} objectName={objectName} />;
      case 'actions':
        return <ActionsPreview config={component.config} objectName={objectName} />;
      case 'quick_actions':
        return <QuickActionsPreview config={component.config} />;
      case 'audit_trail':
        return <AuditTrailPreview config={component.config} />;
      case 'flow':
        return <FlowPreview config={component.config} />;
      case 'blank_space':
        return <BlankSpacePreview />;
      case 'dynamic_highlights_panel':
        return <DynamicHighlightsPanelPreview config={component.config} />;
      case 'field_section':
        return <FieldSectionPreview config={component.config} />;
      case 'field':
        return <SingleFieldPreview config={component.config} />;
      default:
        return null;
    }
  };

  // Extract ref from dragHandleProps
  const { ref: dragHandleRef, ...dragHandleListeners } = dragHandleProps || {};

  return (
    <div 
      onClick={() => onSelect(component)}
      className={`rounded border transition-all cursor-pointer ${
        isSelected 
          ? 'border-blue-500 ring-2 ring-blue-200 shadow-md' 
          : 'border-slate-200 hover:border-blue-300'
      } ${isDragging ? 'shadow-lg ring-2 ring-blue-400' : ''}`}
    >
      {/* Component Header */}
      <div className={`px-2 py-1.5 flex items-center justify-between ${isSelected ? 'bg-blue-50' : 'bg-slate-50'} border-b`}>
        <div className="flex items-center space-x-2">
          {/* Drag Handle - Only this element triggers component drag */}
          <div 
            ref={dragHandleRef}
            {...dragHandleListeners}
            className="cursor-grab active:cursor-grabbing p-0.5 hover:bg-slate-200 rounded"
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical className="h-3.5 w-3.5 text-slate-400" />
          </div>
          <Icon className={`h-3.5 w-3.5 ${isSelected ? 'text-blue-600' : 'text-slate-500'}`} />
          <span className={`text-xs font-medium ${isSelected ? 'text-blue-700' : 'text-slate-700'}`}>
            {displayName}
          </span>
        </div>
        <button 
          onClick={(e) => { e.stopPropagation(); onRemove(component.instanceId, regionId); }}
          className="p-0.5 hover:bg-red-100 rounded"
        >
          <X className="h-3 w-3 text-slate-400 hover:text-red-500" />
        </button>
      </div>
      {/* Component Preview */}
      <div className="p-2">
        {renderPreview()}
      </div>
    </div>
  );
};


/**
 * Salesforce-Style Lightning Page Builder
 */
const SimpleLightningPageBuilder = ({ objectName, onClose, onSave, initialPageId, pageMode = 'detail', isCreateMode = false }) => {
  const [isSaving, setIsSaving] = useState(false);
  const [activeId, setActiveId] = useState(null);
  const [selectedComponent, setSelectedComponent] = useState(null);
  const [selectedRelatedObject, setSelectedRelatedObject] = useState(null); // For Related Lists column config
  
  // Mode: 'detail' (full builder) or 'new' (minimal builder)
  const isNewMode = pageMode === 'new';
  
  // Sidebar tab - in "new" mode, only show fields tab
  const [sidebarTab, setSidebarTab] = useState(isNewMode ? 'fields' : 'components');
  
  // Search query for filtering components and layouts
  const [searchQuery, setSearchQuery] = useState('');
  
  // Selected layout template - in "new" mode, use simple layout
  const [selectedLayout, setSelectedLayout] = useState(isNewMode ? 'single_column' : 'three_column_header');
  
  // Page properties
  const [pageLabel, setPageLabel] = useState(
    isCreateMode 
      ? `${objectName.charAt(0).toUpperCase() + objectName.slice(1)} ${isNewMode ? 'New' : 'Record'} Page`
      : `${objectName.charAt(0).toUpperCase() + objectName.slice(1)} Record Page`
  );
  
  // Page type for saving
  const [currentPageType, setCurrentPageType] = useState(pageMode);
  
  // Device preview
  const [deviceView, setDeviceView] = useState('desktop');
  
  // Placed components in each region - in "new" mode, only use main region with record detail
  const [placedComponents, setPlacedComponents] = useState(
    isNewMode 
      ? {
          header: [],
          left: [],
          main: [{ 
            id: 'record_detail',  // Component type - must match STANDARD_COMPONENTS.id for preview rendering
            instanceId: `record_detail-new-init`,  // Unique instance ID
            name: 'Record Detail', 
            regionId: 'main',
            config: {} 
          }],
          right: []
        }
      : {
          header: [],
          left: [],
          main: [],
          right: []
        }
  );
  
  // Multi-page support state
  const [allPages, setAllPages] = useState([]);
  const [currentPageId, setCurrentPageId] = useState(initialPageId || null);
  const [showPageDropdown, setShowPageDropdown] = useState(false);
  const [isCreatingPage, setIsCreatingPage] = useState(false);
  const [newPageName, setNewPageName] = useState('');
  
  // Schema-based fields for drag-drop validation (fetched from backend)
  // This ensures sidebar and drop zones use the same field list
  const [schemaFields, setSchemaFields] = useState([]);
  
  // Ref for page dropdown click-outside handling
  const pageDropdownRef = useRef(null);
  
  // Ref to track last valid field-over-field state for field reordering
  // This is needed because when drag ends, the 'over' target might be the drop zone container
  // instead of the actual field the user was hovering over
  const lastFieldOverRef = useRef(null);
  
  // Fetch schema fields on mount or object change
  useEffect(() => {
    const loadSchemaFields = async () => {
      try {
        const fields = await fetchSchemaFields(objectName);
        if (fields && fields.length > 0) {
          setSchemaFields(fields);
          console.log(`✅ Builder loaded ${fields.length} schema fields for ${objectName}`);
        } else {
          // Fallback to hardcoded fields
          const fallbackFields = getRecordFields(objectName);
          setSchemaFields(fallbackFields);
          console.warn(`⚠️ Builder falling back to hardcoded fields for ${objectName}`);
        }
      } catch (error) {
        console.error('Error loading schema fields for builder:', error);
        // Fallback to hardcoded fields on error
        const fallbackFields = getRecordFields(objectName);
        setSchemaFields(fallbackFields);
      }
    };
    
    loadSchemaFields();
  }, [objectName]);
  
  // Helper function to get all fields (uses schema fields with fallback)
  const getAllFields = () => {
    if (schemaFields.length > 0) {
      return schemaFields;
    }
    // Fallback to hardcoded (should rarely happen)
    return getRecordFields(objectName);
  };
  
  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (pageDropdownRef.current && !pageDropdownRef.current.contains(event.target)) {
        setShowPageDropdown(false);
      }
    };
    
    if (showPageDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showPageDropdown]);
  
  // Filter components based on search query
  const filteredComponents = STANDARD_COMPONENTS.filter(comp => 
    comp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    comp.description.toLowerCase().includes(searchQuery.toLowerCase())
  );
  
  // Filter layouts based on search query
  const filteredLayouts = LAYOUT_TEMPLATES.filter(layout =>
    layout.name.toLowerCase().includes(searchQuery.toLowerCase())
  );
  
  // Reset/Refresh the page layout
  const handleResetLayout = () => {
    if (isNewMode) {
      // In new mode, reset to just record detail component in main
      setPlacedComponents({
        header: [],
        left: [],
        main: [{ 
          id: 'record_detail',  // Component type - must match STANDARD_COMPONENTS.id for preview rendering
          instanceId: `record_detail-reset-${Date.now()}`,  // Unique instance ID
          name: 'Record Detail', 
          regionId: 'main',
          config: {} 
        }],
        right: []
      });
      setSelectedLayout('single_column');
    } else {
      setPlacedComponents({
        header: [],
        left: [],
        main: [],
        right: []
      });
      setSelectedLayout('three_column_header');
    }
    setSelectedComponent(null);
    toast.success('Page layout reset to default');
  };

  // Get current layout template
  const currentLayout = LAYOUT_TEMPLATES.find(l => l.id === selectedLayout) || LAYOUT_TEMPLATES[4];

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    // Always load pages - even in create mode we want to show existing pages in dropdown
    loadAllPages();
  }, [objectName]);

  // Load all pages for this object (multi-page support)
  const loadAllPages = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await lightningLayoutService.getLayoutForObject(objectName, token);
      
      // Handle both single and multi-page responses
      let allPagesFromApi = response.all_layouts || response.layouts || (response.layout ? [response.layout] : []);
      
      // Filter pages for dropdown based on mode
      // In New mode: only show "new" type pages
      // In Detail mode: show all pages (or only "detail" type pages)
      let filteredPages;
      if (isNewMode) {
        filteredPages = allPagesFromApi.filter(p => (p.page_type || 'detail') === 'new');
      } else {
        // In detail mode, show pages that are 'detail' type or have no type (legacy)
        filteredPages = allPagesFromApi.filter(p => !p.page_type || p.page_type === 'detail');
      }
      
      setAllPages(filteredPages);
      
      // If we have an initial page ID, load that page
      if (initialPageId && !isCreateMode) {
        const targetPage = allPagesFromApi.find(p => p.id === initialPageId);
        if (targetPage) {
          loadPageData(targetPage);
          return;
        }
      }
      
      // In create mode, don't auto-load any page (start fresh)
      // In edit mode, load the first page by default OR use resolved layout if none exist
      if (filteredPages.length > 0 && !isCreateMode) {
        loadPageData(filteredPages[0]);
      } else if (!isCreateMode && filteredPages.length === 0) {
        // No persisted layouts exist - use the resolve endpoint to get
        // the dynamically generated layout that the record page would use
        await loadResolvedLayout();
      }
    } catch (error) {
      console.error('Error loading pages:', error);
      // On error, try to get the resolved layout
      if (!isCreateMode) {
        await loadResolvedLayout();
      }
    }
  };
  
  // Load the resolved layout from the backend (what the record page actually uses)
  const loadResolvedLayout = async () => {
    try {
      const token = localStorage.getItem('token');
      const pageType = isNewMode ? 'new' : 'detail';
      const resolvedResult = await lightningLayoutService.resolveLayout(objectName, pageType, token);
      
      if (resolvedResult && resolvedResult.layout) {
        const resolvedLayout = resolvedResult.layout;
        console.log('Loaded resolved layout:', resolvedLayout);
        
        // Load the resolved layout into the builder
        loadPageData(resolvedLayout);
      } else {
        // Ultimate fallback - create a default structure based on schema
        createDefaultPageStructure();
      }
    } catch (error) {
      console.error('Error loading resolved layout:', error);
      // Fallback to creating a default structure
      createDefaultPageStructure();
    }
  };

  // Create default page structure when no layouts exist
  const createDefaultPageStructure = () => {
    const normalizedName = objectName?.toLowerCase() || 'record';
    const displayName = objectName.charAt(0).toUpperCase() + objectName.slice(1);
    
    // Set page label
    setPageLabel(`${displayName} Record Page`);
    setSelectedLayout('header_left_main');
    setCurrentPageType('detail');
    
    // Determine the section label based on object type
    const sectionLabel = {
      lead: 'Lead Information',
      opportunity: 'Opportunity Information',
      account: 'Account Information',
      contact: 'Contact Information',
      task: 'Task Details',
      event: 'Event Details',
      work_order: 'Work Order Information',
      service_appointment: 'Appointment Information'
    }[normalizedName] || `${displayName} Information`;
    
    // Create default fields from schema fields if available
    let defaultFields = [];
    if (schemaFields && schemaFields.length > 0) {
      // Use the actual fields from the object schema
      defaultFields = schemaFields
        .filter(f => !f.api_name?.startsWith('_') && f.api_name !== 'id')
        .slice(0, 10)  // Limit to first 10 fields
        .map((field, idx) => ({
          id: `field-${field.api_name}-${idx}`,
          type: 'field',
          key: field.api_name,
          label: field.label || field.api_name
        }));
    }
    
    // If no schema fields, use standard fallback fields
    if (defaultFields.length === 0) {
      defaultFields = [
        { id: 'field-name-0', type: 'field', key: 'name', label: 'Name' },
        { id: 'field-status-1', type: 'field', key: 'status', label: 'Status' },
        { id: 'field-description-2', type: 'field', key: 'description', label: 'Description' }
      ];
    }
    
    // Create a Record Detail component with the fields organized in a section
    const recordDetailConfig = {
      items: [{
        id: `section-${normalizedName}-info`,
        type: 'field_section',
        label: sectionLabel,
        collapsed: false,
        fields: defaultFields
      }]
    };
    
    // Set placed components with the Record Detail
    setPlacedComponents({
      header: [],
      left: [],
      main: [{ 
        id: 'record_detail',
        instanceId: `record_detail-${Date.now()}`,
        name: 'Record Detail', 
        regionId: 'main',
        config: recordDetailConfig
      }],
      right: []
    });
    
    setSelectedComponent(null);
    console.log('Created default page structure for:', objectName);
  };

  // Load data for a specific page
  const loadPageData = (page) => {
    if (!page) return;
    
    setCurrentPageId(page.id);
    setExistingLayoutId(page.id);
    setCurrentPageType(page.page_type || 'detail');
    setPageLabel(page.layout_name || `${objectName.charAt(0).toUpperCase() + objectName.slice(1)} Record Page`);
    
    if (page.selected_layout) {
      setSelectedLayout(page.selected_layout);
    } else if (page.template_type) {
      setSelectedLayout(page.template_type);
    } else if (isNewMode) {
      setSelectedLayout('single_column');
    }
    
    if (page.placed_components) {
      // Load placed components from page data
      let mainComponents = page.placed_components.main || [];
      
      // For New mode, ensure there's always a Record Detail component
      if (isNewMode && mainComponents.length === 0) {
        mainComponents = [createDefaultRecordDetailComponent()];
      }
      
      // For detail mode, if layout has no components, add a default Record Detail
      if (!isNewMode && mainComponents.length === 0) {
        mainComponents = [createDefaultRecordDetailComponent()];
      }
      
      // Check if existing Record Detail has empty config - populate it with fields
      mainComponents = mainComponents.map(comp => {
        if (comp.id === 'record_detail' && (!comp.config || !comp.config.items || comp.config.items.length === 0)) {
          return createDefaultRecordDetailComponent(comp.instanceId);
        }
        return comp;
      });
      
      setPlacedComponents({
        header: page.placed_components.header || [],
        left: page.placed_components.left || [],
        main: mainComponents,
        right: page.placed_components.right || []
      });
    } else {
      // No placed_components in page data - set defaults with populated Record Detail
      setPlacedComponents({
        header: [],
        left: [],
        main: [createDefaultRecordDetailComponent()],
        right: []
      });
    }
    setSelectedComponent(null);
  };
  
  // Create a default Record Detail component with fields from schema
  const createDefaultRecordDetailComponent = (existingInstanceId = null) => {
    const normalizedName = objectName?.toLowerCase() || 'record';
    const displayName = objectName.charAt(0).toUpperCase() + objectName.slice(1);
    
    // Determine the section label based on object type
    const sectionLabel = {
      lead: 'Lead Information',
      opportunity: 'Opportunity Information',
      account: 'Account Information',
      contact: 'Contact Information',
      task: 'Task Details',
      event: 'Event Details',
      work_order: 'Work Order Information',
      service_appointment: 'Appointment Information'
    }[normalizedName] || `${displayName} Information`;
    
    // Create default fields from schema fields if available
    let defaultFields = [];
    if (schemaFields && schemaFields.length > 0) {
      // Use the actual fields from the object schema
      defaultFields = schemaFields
        .filter(f => !f.api_name?.startsWith('_') && f.api_name !== 'id')
        .slice(0, 10)  // Limit to first 10 fields
        .map((field, idx) => ({
          id: `field-${field.api_name}-${idx}`,
          type: 'field',
          key: field.api_name,
          label: field.label || field.api_name
        }));
    }
    
    // If no schema fields, use standard fallback fields
    if (defaultFields.length === 0) {
      defaultFields = [
        { id: 'field-name-0', type: 'field', key: 'name', label: 'Name' },
        { id: 'field-status-1', type: 'field', key: 'status', label: 'Status' },
        { id: 'field-description-2', type: 'field', key: 'description', label: 'Description' }
      ];
    }
    
    // Create config with the fields organized in a section
    const recordDetailConfig = {
      items: [{
        id: `section-${normalizedName}-info`,
        type: 'field_section',
        label: sectionLabel,
        collapsed: false,
        fields: defaultFields
      }]
    };
    
    return { 
      id: 'record_detail',
      instanceId: existingInstanceId || `record_detail-${Date.now()}`,
      name: 'Record Detail', 
      regionId: 'main',
      config: recordDetailConfig
    };
  };

  // Switch to a different page
  const handleSwitchPage = (pageId) => {
    const page = allPages.find(p => p.id === pageId);
    if (page) {
      loadPageData(page);
      setShowPageDropdown(false);
      toast.success(`Switched to "${page.layout_name}"`);
    }
  };

  // Create a new page
  const handleCreateNewPage = async () => {
    if (!newPageName.trim()) {
      toast.error('Please enter a page name');
      return;
    }
    
    setIsCreatingPage(true);
    try {
      const token = localStorage.getItem('token');
      
      // Always initialize with Record Detail component with fields populated
      const defaultRecordDetail = createDefaultRecordDetailComponent();
      const initialComponents = {
        header: [],
        left: [],
        main: [defaultRecordDetail],
        right: []
      };
      
      const layoutData = {
        object_name: objectName,
        layout_name: newPageName.trim(),
        api_name: `${objectName}_${newPageName.trim().replace(/\s+/g, '_')}_Page`,
        selected_layout: isNewMode ? 'single_column' : 'three_column_header',
        placed_components: initialComponents,
        template_type: isNewMode ? 'single_column' : 'three_column_header',
        page_type: currentPageType  // CRITICAL: Pass the page type ("new" or "detail")
      };
      
      const response = await lightningLayoutService.createLayout(layoutData, token);
      const newPage = response.layout;
      
      // Add to pages list and switch to it
      setAllPages(prev => [...prev, newPage]);
      loadPageData(newPage);
      
      // Ensure placedComponents shows the Record Detail
      setPlacedComponents(initialComponents);
      
      setNewPageName('');
      setShowPageDropdown(false);
      toast.success(`Created new page "${newPage.layout_name}"`);
    } catch (error) {
      console.error('Error creating new page:', error);
      toast.error('Failed to create new page');
    } finally {
      setIsCreatingPage(false);
    }
  };

  // Delete a page
  const handleDeletePage = async (pageId) => {
    if (allPages.length <= 1) {
      toast.error('Cannot delete the only page');
      return;
    }
    
    const page = allPages.find(p => p.id === pageId);
    if (!window.confirm(`Are you sure you want to delete "${page?.layout_name}"?`)) return;
    
    try {
      const token = localStorage.getItem('token');
      await lightningLayoutService.deleteLayout(pageId, token);
      
      const newPages = allPages.filter(p => p.id !== pageId);
      setAllPages(newPages);
      
      // If we deleted the current page, switch to another
      if (currentPageId === pageId && newPages.length > 0) {
        loadPageData(newPages[0]);
      }
      
      toast.success('Page deleted');
    } catch (error) {
      console.error('Error deleting page:', error);
      toast.error('Failed to delete page');
    }
  };

  // Store loaded layout ID for updates
  const [existingLayoutId, setExistingLayoutId] = useState(null);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const token = localStorage.getItem('token');
      const layoutData = {
        object_name: objectName,
        layout_name: pageLabel,
        api_name: `${objectName}_${pageLabel.replace(/\s+/g, '_')}`,
        selected_layout: selectedLayout,
        placed_components: placedComponents,
        template_type: selectedLayout,
        page_type: currentPageType  // "detail" or "new"
      };

      let savedPage;
      // Update existing layout or create new one
      if (existingLayoutId) {
        const response = await lightningLayoutService.updateLayout(existingLayoutId, layoutData, token);
        savedPage = response.layout;
      } else {
        const response = await lightningLayoutService.createLayout(layoutData, token);
        savedPage = response.layout;
        setExistingLayoutId(savedPage.id);
        setCurrentPageId(savedPage.id);
      }
      
      // Update the page in allPages list
      if (savedPage) {
        setAllPages(prev => {
          const exists = prev.find(p => p.id === savedPage.id);
          if (exists) {
            return prev.map(p => p.id === savedPage.id ? savedPage : p);
          }
          return [...prev, savedPage];
        });
      }
      
      toast.success('Page saved successfully!');
      if (onSave) onSave();
    } catch (error) {
      console.error('Error saving layout:', error);
      toast.error('Failed to save page');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDragStart = (event) => {
    setActiveId(event.active.id);
  };

  // Handle drag over for real-time visual reordering
  const handleDragOver = (event) => {
    const { active, over } = event;
    
    if (!over) return;
    
    const activeId = active.id.toString();
    const overId = over.id.toString();
    
    // Handle field reordering within Record Detail sections
    // NOTE: For same-section field reordering, we DON'T update state here.
    // The SortableContext handles the visual reordering, and we persist in handleDragEnd.
    // This prevents React re-renders from conflicting with drag transforms.
    if (active.data.current?.type === 'record-detail-field') {
      const activeField = active.data.current.field;
      const activeSectionId = active.data.current.sectionId;
      const activeRecordDetailId = active.data.current.recordDetailInstanceId;
      
      // Check if dropping on another field in the same or different section
      if (over.data.current?.type === 'record-detail-field') {
        const overField = over.data.current.field;
        const overSectionId = over.data.current.sectionId;
        const overRecordDetailId = over.data.current.recordDetailInstanceId;
        
        // Only handle if in the same Record Detail component
        if (activeRecordDetailId === overRecordDetailId && activeField.id !== overField.id) {
          // For SAME section reordering, let SortableContext handle visuals
          // and persist state in handleDragEnd only
          if (activeSectionId === overSectionId) {
            // Store the last valid over field for use in handleDragEnd
            lastFieldOverRef.current = {
              field: overField,
              sectionId: overSectionId,
              recordDetailInstanceId: overRecordDetailId
            };
            // DO NOT update state here - let handleDragEnd persist
            return;
          }
          
          // For DIFFERENT section moves, we still update state here for visual feedback
          // Find the Record Detail component (including inside Tabs)
          let recordDetailComponent = null;
          let recordDetailRegion = null;
          let parentTabsComponent = null;
          let parentTabId = null;
          
          Object.keys(placedComponents).forEach(region => {
            placedComponents[region].forEach(comp => {
              if (comp.instanceId === activeRecordDetailId) {
                recordDetailComponent = comp;
                recordDetailRegion = region;
              }
              // Also search inside Tabs components
              if (comp.id === 'tabs' && comp.config?.tabs) {
                comp.config.tabs.forEach(tab => {
                  (tab.components || []).forEach(innerComp => {
                    if (innerComp.instanceId === activeRecordDetailId) {
                      recordDetailComponent = innerComp;
                      parentTabsComponent = comp;
                      parentTabId = tab.id;
                      recordDetailRegion = region;
                    }
                  });
                });
              }
            });
          });
          
          if (recordDetailComponent) {
            // Get current items using the helper that processes into section format
            const currentItems = processRecordDetailItems(
              recordDetailComponent.config?.items,
              objectName
            );
            
            // DIFFERENT section - move field between sections
            const sourceSection = currentItems.find(item => item.id === activeSectionId && item.type === 'field_section');
            const targetSection = currentItems.find(item => item.id === overSectionId && item.type === 'field_section');
            
            if (sourceSection && targetSection && sourceSection.fields && targetSection.fields) {
              // Remove from source section
              const newSourceFields = sourceSection.fields.filter(f => f.id !== activeField.id);
              
              // Find insertion index in target section
              const targetFields = [...targetSection.fields];
              const insertIndex = targetFields.findIndex(f => f.id === overField.id);
              
              // Insert the field at the correct position
              const newTargetFields = [...targetFields];
              if (insertIndex !== -1) {
                newTargetFields.splice(insertIndex, 0, activeField);
              } else {
                newTargetFields.push(activeField);
              }
              
              // Build updated items
              const newItems = currentItems.map(item => {
                if (item.id === activeSectionId) {
                  return { ...item, fields: newSourceFields };
                }
                if (item.id === overSectionId) {
                  return { ...item, fields: newTargetFields };
                }
                return item;
              });
              
              const updatedComponent = {
                ...recordDetailComponent,
                config: { ...recordDetailComponent.config, items: newItems }
              };
              
              // Update placed components - handle both direct and nested (inside Tabs) cases
              if (parentTabsComponent && parentTabId) {
                const updatedTabs = parentTabsComponent.config.tabs.map(tab => {
                  if (tab.id === parentTabId) {
                    return {
                      ...tab,
                      components: tab.components.map(c =>
                        c.instanceId === activeRecordDetailId ? updatedComponent : c
                      )
                    };
                  }
                  return tab;
                });
                
                const updatedTabsComponent = {
                  ...parentTabsComponent,
                  config: { ...parentTabsComponent.config, tabs: updatedTabs }
                };
                
                setPlacedComponents(prev => ({
                  ...prev,
                  [recordDetailRegion]: prev[recordDetailRegion].map(c =>
                    c.instanceId === parentTabsComponent.instanceId ? updatedTabsComponent : c
                  )
                }));
              } else {
                setPlacedComponents(prev => ({
                  ...prev,
                  [recordDetailRegion]: prev[recordDetailRegion].map(c => 
                    c.instanceId === activeRecordDetailId ? updatedComponent : c
                  )
                }));
              }
            }
          }
        }
      }
      
      // Also handle dropping on a section drop zone (for cross-section moves)
      if (over.data.current?.type === 'field-section-dropzone') {
        const overSectionId = over.data.current.sectionId;
        const overRecordDetailId = over.data.current.recordDetailInstanceId;
        
        // Only handle if same Record Detail component but different section
        if (activeRecordDetailId === overRecordDetailId && activeSectionId !== overSectionId) {
          // Find the Record Detail component
          let recordDetailComponent = null;
          let recordDetailRegion = null;
          let parentTabsComponent = null;
          let parentTabId = null;
          
          Object.keys(placedComponents).forEach(region => {
            placedComponents[region].forEach(comp => {
              if (comp.instanceId === activeRecordDetailId) {
                recordDetailComponent = comp;
                recordDetailRegion = region;
              }
              if (comp.id === 'tabs' && comp.config?.tabs) {
                comp.config.tabs.forEach(tab => {
                  (tab.components || []).forEach(innerComp => {
                    if (innerComp.instanceId === activeRecordDetailId) {
                      recordDetailComponent = innerComp;
                      parentTabsComponent = comp;
                      parentTabId = tab.id;
                      recordDetailRegion = region;
                    }
                  });
                });
              }
            });
          });
          
          if (recordDetailComponent) {
            // Get current items using the helper that processes into section format
            const currentItems = processRecordDetailItems(
              recordDetailComponent.config?.items,
              objectName
            );
            
            const sourceSection = currentItems.find(item => item.id === activeSectionId && item.type === 'field_section');
            const targetSection = currentItems.find(item => item.id === overSectionId && item.type === 'field_section');
            
            if (sourceSection && targetSection && sourceSection.fields) {
              // Remove from source, add to end of target
              const newSourceFields = sourceSection.fields.filter(f => f.id !== activeField.id);
              const newTargetFields = [...(targetSection.fields || []), activeField];
              
              const newItems = currentItems.map(item => {
                if (item.id === activeSectionId) return { ...item, fields: newSourceFields };
                if (item.id === overSectionId) return { ...item, fields: newTargetFields };
                return item;
              });
              
              const updatedComponent = {
                ...recordDetailComponent,
                config: { ...recordDetailComponent.config, items: newItems }
              };
              
              if (parentTabsComponent && parentTabId) {
                const updatedTabs = parentTabsComponent.config.tabs.map(tab => {
                  if (tab.id === parentTabId) {
                    return {
                      ...tab,
                      components: tab.components.map(c =>
                        c.instanceId === activeRecordDetailId ? updatedComponent : c
                      )
                    };
                  }
                  return tab;
                });
                
                const updatedTabsComponent = {
                  ...parentTabsComponent,
                  config: { ...parentTabsComponent.config, tabs: updatedTabs }
                };
                
                setPlacedComponents(prev => ({
                  ...prev,
                  [recordDetailRegion]: prev[recordDetailRegion].map(c =>
                    c.instanceId === parentTabsComponent.instanceId ? updatedTabsComponent : c
                  )
                }));
              } else {
                setPlacedComponents(prev => ({
                  ...prev,
                  [recordDetailRegion]: prev[recordDetailRegion].map(c => 
                    c.instanceId === activeRecordDetailId ? updatedComponent : c
                  )
                }));
              }
            }
          }
        }
      }
      
      return;
    }
    
    // Handle tab-inner-component reordering (components inside tabs)
    if (active.data.current?.type === 'tab-inner-component') {
      const draggedComp = active.data.current.component;
      const sourceTabId = active.data.current.tabId;
      const sourceTabsInstanceId = active.data.current.tabsInstanceId;
      
      // Check if dropping on another tab-inner-component
      if (over.data.current?.type === 'tab-inner-component') {
        const targetTabId = over.data.current.tabId;
        const targetTabsInstanceId = over.data.current.tabsInstanceId;
        
        // Only handle same-tab reordering
        if (sourceTabsInstanceId === targetTabsInstanceId && sourceTabId === targetTabId && activeId !== overId) {
          // Find the Tabs component
          let tabsComponent = null;
          let tabsRegion = null;
          
          Object.keys(placedComponents).forEach(region => {
            placedComponents[region].forEach(comp => {
              if (comp.instanceId === sourceTabsInstanceId) {
                tabsComponent = comp;
                tabsRegion = region;
              }
            });
          });
          
          if (tabsComponent) {
            const currentTabs = tabsComponent.config?.tabs || [];
            const targetTab = currentTabs.find(t => t.id === sourceTabId);
            
            if (targetTab && targetTab.components) {
              const oldIndex = targetTab.components.findIndex(c => c.instanceId === draggedComp.instanceId);
              const newIndex = targetTab.components.findIndex(c => c.instanceId === overId);
              
              if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
                // Reorder components in the tab
                const newTabComponents = arrayMove([...targetTab.components], oldIndex, newIndex);
                
                const newTabs = currentTabs.map(t => {
                  if (t.id === sourceTabId) {
                    return { ...t, components: newTabComponents };
                  }
                  return t;
                });
                
                const updatedTabsComponent = {
                  ...tabsComponent,
                  config: { ...tabsComponent.config, tabs: newTabs }
                };
                
                setPlacedComponents(prev => ({
                  ...prev,
                  [tabsRegion]: prev[tabsRegion].map(c =>
                    c.instanceId === sourceTabsInstanceId ? updatedTabsComponent : c
                  )
                }));
              }
            }
          }
        }
      }
      return;
    }
    
    // Handle placed-component reordering
    if (active.data.current?.type !== 'placed-component') return;
    
    const draggedComponent = active.data.current.component;
    const sourceRegion = active.data.current.regionId;
    
    // Check if dropping on another component for reorder
    const targetComponentData = over.data.current;
    if (targetComponentData?.type === 'placed-component') {
      const targetRegion = targetComponentData.regionId;
      
      // Only handle same-region reordering here
      if (sourceRegion === targetRegion && activeId !== overId) {
        const sourceComponents = placedComponents[sourceRegion] || [];
        const oldIndex = sourceComponents.findIndex(c => c.instanceId === draggedComponent.instanceId);
        const newIndex = sourceComponents.findIndex(c => c.instanceId === overId);
        
        if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
          // Update state for real-time visual feedback
          const newComponents = arrayMove(sourceComponents, oldIndex, newIndex);
          setPlacedComponents(prev => ({
            ...prev,
            [sourceRegion]: newComponents
          }));
        }
      }
    }
  };

  const handleDragEnd = (event) => {
    const { active, over } = event;
    setActiveId(null);

    const activeId = active.id.toString();
    
    // Debug logging
    console.log('=== DRAG END ===');
    console.log('Active ID:', activeId);
    console.log('Active data:', active.data?.current);
    console.log('Over:', over ? { id: over.id, data: over.data?.current } : 'null');
    console.log('Is sidebar-relatedlist?:', activeId.startsWith('sidebar-relatedlist-'));
    console.log('Selected component:', selectedComponent?.id, selectedComponent?.instanceId);
    
    // ============================================================
    // Handle field reordering within Record Detail sections (FINAL STATE UPDATE)
    // This ensures the field order persists after drag ends
    // ============================================================
    if (active.data.current?.type === 'record-detail-field') {
      const activeField = active.data.current.field;
      const activeSectionId = active.data.current.sectionId;
      const activeRecordDetailId = active.data.current.recordDetailInstanceId;
      
      // Check if over target is also a field (direct field-to-field drop)
      let overField = null;
      let overSectionId = null;
      let overRecordDetailId = null;
      
      if (over?.data.current?.type === 'record-detail-field') {
        overField = over.data.current.field;
        overSectionId = over.data.current.sectionId;
        overRecordDetailId = over.data.current.recordDetailInstanceId;
      } else if (lastFieldOverRef.current) {
        // Use the last valid field-over state captured during handleDragOver
        // This handles the case where the final 'over' target is the drop zone container
        overField = lastFieldOverRef.current.field;
        overSectionId = lastFieldOverRef.current.sectionId;
        overRecordDetailId = lastFieldOverRef.current.recordDetailInstanceId;
      }
      
      // Clear the ref
      lastFieldOverRef.current = null;
      
      // Only handle if we have valid over field data and same section
      if (activeRecordDetailId && activeSectionId && overField && 
          activeRecordDetailId === overRecordDetailId && activeSectionId === overSectionId &&
          activeField.id !== overField.id) {
        
        // Find the Record Detail component (including inside Tabs)
        let recordDetailComponent = null;
        let recordDetailRegion = null;
        let parentTabsComponent = null;
        let parentTabId = null;
        
        Object.keys(placedComponents).forEach(region => {
          placedComponents[region].forEach(comp => {
            if (comp.instanceId === activeRecordDetailId) {
              recordDetailComponent = comp;
              recordDetailRegion = region;
            }
            // Also search inside Tabs components
            if (comp.id === 'tabs' && comp.config?.tabs) {
              comp.config.tabs.forEach(tab => {
                (tab.components || []).forEach(innerComp => {
                  if (innerComp.instanceId === activeRecordDetailId) {
                    recordDetailComponent = innerComp;
                    parentTabsComponent = comp;
                    parentTabId = tab.id;
                    recordDetailRegion = region;
                  }
                });
              });
            }
          });
        });
        
        console.log('Found Record Detail:', recordDetailComponent?.instanceId, 'Region:', recordDetailRegion);
        
        if (recordDetailComponent) {
          // Get current items - build proper section structure when config.items is empty
          let currentItems;
          if (recordDetailComponent.config?.items?.length > 0) {
            currentItems = processRecordDetailItems(recordDetailComponent.config.items, objectName);
          } else {
            // Config is empty, build section structure from schemaFields to match visual component
            const sectionLabel = {
              lead: 'Lead Information',
              opportunity: 'Opportunity Information',
              account: 'Account Information',
              contact: 'Contact Information',
              task: 'Details',
              event: 'Details'
            }[objectName?.toLowerCase()] || 'Details';
            
            // Build section with fields from schemaFields
            const fieldsToUse = schemaFields && schemaFields.length > 0 
              ? schemaFields.map((f, idx) => ({
                  id: `field-${f.key}-${idx}`,
                  type: 'field',
                  key: f.key,
                  label: f.label || f.key
                }))
              : [];
            
            currentItems = [{
              id: `section-${objectName?.toLowerCase()}-info`,
              type: 'field_section',
              label: sectionLabel,
              collapsed: false,
              fields: fieldsToUse
            }];
          }
          
          // Find section
          let section = currentItems.find(item => item.id === activeSectionId && item.type === 'field_section');
          
          if (section && section.fields) {
            const fields = [...section.fields];
            
            // Match by field key (API name) instead of ID, since IDs can differ
            // between the visual component and processRecordDetailItems
            const activeKey = activeField.key;
            const overKey = overField.key;
            
            const oldIndex = fields.findIndex(f => f.key === activeKey);
            const newIndex = fields.findIndex(f => f.key === overKey);
            
            if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
              const newFields = arrayMove(fields, oldIndex, newIndex);
              
              // Build updated items - always save in section format
              const newItems = currentItems.map(item => 
                item.id === activeSectionId ? { ...item, fields: newFields } : item
              );
              
              const updatedComponent = {
                ...recordDetailComponent,
                config: { ...recordDetailComponent.config, items: newItems }
              };
              
              // Update placed components - handle both direct and nested (inside Tabs) cases
              if (parentTabsComponent && parentTabId) {
                // Record Detail is inside a Tabs component
                const updatedTabs = parentTabsComponent.config.tabs.map(tab => {
                  if (tab.id === parentTabId) {
                    return {
                      ...tab,
                      components: tab.components.map(c =>
                        c.instanceId === activeRecordDetailId ? updatedComponent : c
                      )
                    };
                  }
                  return tab;
                });
                
                const updatedTabsComponent = {
                  ...parentTabsComponent,
                  config: { ...parentTabsComponent.config, tabs: updatedTabs }
                };
                
                setPlacedComponents(prev => ({
                  ...prev,
                  [recordDetailRegion]: prev[recordDetailRegion].map(c =>
                    c.instanceId === parentTabsComponent.instanceId ? updatedTabsComponent : c
                  )
                }));
              } else {
                // Record Detail is directly in a region
                setPlacedComponents(prev => ({
                  ...prev,
                  [recordDetailRegion]: prev[recordDetailRegion].map(c => 
                    c.instanceId === activeRecordDetailId ? updatedComponent : c
                  )
                }));
              }
            }
          }
        }
        return;
      }
    }
    
    // ============================================================
    // Handle reordering/moving placed components between zones
    // ============================================================
    if (active.data.current?.type === 'placed-component') {
      const draggedComponent = active.data.current.component;
      const sourceRegion = active.data.current.regionId;
      
      if (!over) return;
      
      const overId = over.id.toString();
      
      // Check if dropping on a region (move between zones)
      if (currentLayout.regions.includes(overId)) {
        const targetRegion = overId;
        
        if (sourceRegion !== targetRegion) {
          // Move to different region
          const sourceComponents = [...(placedComponents[sourceRegion] || [])];
          const targetComponents = [...(placedComponents[targetRegion] || [])];
          
          // Remove from source
          const componentIndex = sourceComponents.findIndex(c => c.instanceId === draggedComponent.instanceId);
          if (componentIndex === -1) return;
          
          const [movedComponent] = sourceComponents.splice(componentIndex, 1);
          movedComponent.regionId = targetRegion;
          
          // Add to target
          targetComponents.push(movedComponent);
          
          setPlacedComponents(prev => ({
            ...prev,
            [sourceRegion]: sourceComponents,
            [targetRegion]: targetComponents
          }));
          
          toast.success(`Component moved to ${targetRegion}`);
        }
        // Same region reordering is handled by handleDragOver
        return;
      }
      
      // Check if dropping on another component (cross-region move)
      const targetComponentData = over.data.current;
      if (targetComponentData?.type === 'placed-component') {
        const targetRegion = targetComponentData.regionId;
        
        if (sourceRegion !== targetRegion) {
          // Move between regions
          const sourceComponents = [...(placedComponents[sourceRegion] || [])];
          const targetComponents = [...(placedComponents[targetRegion] || [])];
          
          // Remove from source
          const componentIndex = sourceComponents.findIndex(c => c.instanceId === draggedComponent.instanceId);
          if (componentIndex === -1) return;
          
          const [movedComponent] = sourceComponents.splice(componentIndex, 1);
          movedComponent.regionId = targetRegion;
          
          // Insert at target position
          const targetIndex = targetComponents.findIndex(c => c.instanceId === overId);
          targetComponents.splice(targetIndex, 0, movedComponent);
          
          setPlacedComponents(prev => ({
            ...prev,
            [sourceRegion]: sourceComponents,
            [targetRegion]: targetComponents
          }));
          
          toast.success(`Component moved to ${targetRegion}`);
        }
        // Same region reordering is handled by handleDragOver
        return;
      }
    }
    
    // Handle related list items from properties panel (doesn't require over)
    if (activeId.startsWith('sidebar-relatedlist-')) {
      const obj = active.data.current?.obj;
      
      console.log('=== RELATED LIST ITEM DRAG END ===');
      console.log('Object:', obj);
      console.log('Selected component:', selectedComponent?.id, selectedComponent?.instanceId);
      console.log('Over:', over?.id);
      
      // Find the target Related Lists component - search by instanceId
      let targetComponent = null;
      let parentTabsComponent = null;
      let parentTabId = null;
      let targetRegion = null;
      
      // First, check if selected component is Related Lists
      const selectedInstanceId = selectedComponent?.id === 'related_lists' ? selectedComponent.instanceId : null;
      
      // Also check if we're dropping directly over a Related Lists component
      const overComponentId = over?.data?.current?.component?.id === 'related_lists' ? over.data.current.component.instanceId : null;
      const targetInstanceId = selectedInstanceId || overComponentId;
      
      console.log('Target instance ID:', targetInstanceId);
      
      // Search all components (including inside Tabs) for either selected or first available Related Lists
      Object.keys(placedComponents).forEach(region => {
        placedComponents[region].forEach(comp => {
          // Check top-level components
          if (comp.id === 'related_lists') {
            if (targetInstanceId && comp.instanceId === targetInstanceId) {
              // Found the target component
              targetComponent = comp;
              targetRegion = region;
            } else if (!targetInstanceId && !targetComponent) {
              // No selection, use first found
              targetComponent = comp;
              targetRegion = region;
            }
          }
          // Search inside Tabs components
          if (comp.id === 'tabs' && comp.config?.tabs) {
            comp.config.tabs.forEach(tab => {
              (tab.components || []).forEach(innerComp => {
                if (innerComp.id === 'related_lists') {
                  if (targetInstanceId && innerComp.instanceId === targetInstanceId) {
                    // Found the target component inside a tab
                    targetComponent = innerComp;
                    parentTabsComponent = comp;
                    parentTabId = tab.id;
                    targetRegion = region;
                    console.log('Found target Related Lists inside Tab:', tab.label);
                  } else if (!targetInstanceId && !targetComponent) {
                    // No selection, use first found
                    targetComponent = innerComp;
                    parentTabsComponent = comp;
                    parentTabId = tab.id;
                    targetRegion = region;
                    console.log('Using first found Related Lists inside Tab:', tab.label);
                  }
                }
              });
            });
          }
        });
      });
      
      console.log('Found target component:', targetComponent?.instanceId, 'in region:', targetRegion, 'parent tabs:', parentTabsComponent?.instanceId);
      
      if (obj && targetComponent) {
        const currentLists = targetComponent.config?.lists || [];
        const alreadyAdded = currentLists.some(l => l.objectId === obj.id);
        
        if (alreadyAdded) {
          toast.error(`${obj.name} is already added`);
          return;
        }
        
        const newList = {
          id: `related-${obj.id}-${Date.now()}`,
          objectId: obj.id,
          name: obj.name,
          icon: obj.icon,
          columns: obj.columns
        };
        
        const updatedComponent = {
          ...targetComponent,
          config: {
            ...targetComponent.config,
            lists: [...currentLists, newList]
          }
        };
        
        // Update placed components - handle both direct and nested (inside Tabs) cases
        if (parentTabsComponent && parentTabId) {
          // Related Lists is inside a Tabs component
          const updatedTabs = parentTabsComponent.config.tabs.map(tab => {
            if (tab.id === parentTabId) {
              return {
                ...tab,
                components: tab.components.map(c =>
                  c.instanceId === targetComponent.instanceId ? updatedComponent : c
                )
              };
            }
            return tab;
          });
          
          const updatedTabsComponent = {
            ...parentTabsComponent,
            config: { ...parentTabsComponent.config, tabs: updatedTabs }
          };
          
          setPlacedComponents(prev => ({
            ...prev,
            [targetRegion]: prev[targetRegion].map(c =>
              c.instanceId === parentTabsComponent.instanceId ? updatedTabsComponent : c
            )
          }));
          setSelectedComponent(updatedComponent);
          toast.success(`${obj.name} added to Related Lists`);
        } else {
          handleUpdateComponent(updatedComponent);
          toast.success(`${obj.name} added`);
        }
      } else if (obj && !targetComponent) {
        toast.error('Please add a Related Lists component first');
      }
      return;
    }

    // Handle Quick Link items from properties panel
    if (activeId.startsWith('sidebar-quicklink-')) {
      const obj = active.data.current?.obj;
      
      // Find the target Quick Links component - search by instanceId
      let targetComponent = null;
      let parentTabsComponent = null;
      let parentTabId = null;
      let targetRegion = null;
      
      // First, check if selected component is Related List Quick Links
      const selectedInstanceId = selectedComponent?.id === 'related_list_quick_links' ? selectedComponent.instanceId : null;
      
      // Search all components (including inside Tabs) for either selected or first available Quick Links
      Object.keys(placedComponents).forEach(region => {
        placedComponents[region].forEach(comp => {
          // Check top-level components
          if (comp.id === 'related_list_quick_links') {
            if (selectedInstanceId && comp.instanceId === selectedInstanceId) {
              // Found the selected component
              targetComponent = comp;
              targetRegion = region;
            } else if (!selectedInstanceId && !targetComponent) {
              // No selection, use first found
              targetComponent = comp;
              targetRegion = region;
            }
          }
          // Search inside Tabs components
          if (comp.id === 'tabs' && comp.config?.tabs) {
            comp.config.tabs.forEach(tab => {
              (tab.components || []).forEach(innerComp => {
                if (innerComp.id === 'related_list_quick_links') {
                  if (selectedInstanceId && innerComp.instanceId === selectedInstanceId) {
                    // Found the selected component inside a tab
                    targetComponent = innerComp;
                    parentTabsComponent = comp;
                    parentTabId = tab.id;
                    targetRegion = region;
                  } else if (!selectedInstanceId && !targetComponent) {
                    // No selection, use first found
                    targetComponent = innerComp;
                    parentTabsComponent = comp;
                    parentTabId = tab.id;
                    targetRegion = region;
                  }
                }
              });
            });
          }
        });
      });
      
      if (obj && targetComponent) {
        const currentLinks = targetComponent.config?.quickLinks || [];
        const alreadyAdded = currentLinks.includes(obj.id);
        
        if (alreadyAdded) {
          toast.error(`${obj.name} is already added`);
          return;
        }
        
        const updatedComponent = {
          ...targetComponent,
          config: {
            ...targetComponent.config,
            quickLinks: [...currentLinks, obj.id]
          }
        };
        
        // Update placed components - handle both direct and nested (inside Tabs) cases
        if (parentTabsComponent && parentTabId) {
          // Quick Links is inside a Tabs component
          const updatedTabs = parentTabsComponent.config.tabs.map(tab => {
            if (tab.id === parentTabId) {
              return {
                ...tab,
                components: tab.components.map(c =>
                  c.instanceId === targetComponent.instanceId ? updatedComponent : c
                )
              };
            }
            return tab;
          });
          
          const updatedTabsComponent = {
            ...parentTabsComponent,
            config: { ...parentTabsComponent.config, tabs: updatedTabs }
          };
          
          setPlacedComponents(prev => ({
            ...prev,
            [targetRegion]: prev[targetRegion].map(c =>
              c.instanceId === parentTabsComponent.instanceId ? updatedTabsComponent : c
            )
          }));
          setSelectedComponent(updatedComponent);
          toast.success(`${obj.name} added to Quick Links`);
        } else {
          handleUpdateComponent(updatedComponent);
          toast.success(`${obj.name} added`);
        }
      } else if (obj && !targetComponent) {
        toast.error('Please add a Related List Quick Links component first');
      }
      return;
    }

    if (!over) return;

    const overId = over.id.toString();

    // Handle dropping components into Tabs component
    if (overId.startsWith('tabs-drop-')) {
      // Format: tabs-drop-{tabsInstanceId}-{tabId}
      const parts = overId.replace('tabs-drop-', '').split('-');
      // The tabsInstanceId is "tabs-{timestamp}", so we need to reconstruct it
      const tabsInstanceId = parts.slice(0, 2).join('-'); // tabs-{timestamp}
      const tabId = parts.slice(2).join('-'); // tab-1 or tab-{timestamp}
      
      // Find the component being dragged
      let draggedComponent = null;
      if (activeId.startsWith('sidebar-')) {
        const componentId = activeId.replace('sidebar-', '');
        draggedComponent = STANDARD_COMPONENTS.find(c => c.id === componentId);
      } else if (activeId.startsWith('fieldcomp-')) {
        const componentId = activeId.replace('fieldcomp-', '');
        draggedComponent = FIELD_COMPONENTS.find(c => c.id === componentId);
      }
      
      if (!draggedComponent) return;
      
      // Don't allow dropping tabs inside tabs
      if (draggedComponent.id === 'tabs') {
        toast.error('Cannot nest tabs inside tabs');
        return;
      }
      
      // Find the Tabs component on the canvas
      let tabsComponent = null;
      let tabsRegion = null;
      Object.keys(placedComponents).forEach(region => {
        placedComponents[region].forEach(comp => {
          if (comp.instanceId === tabsInstanceId) {
            tabsComponent = comp;
            tabsRegion = region;
          }
        });
      });
      
      if (tabsComponent) {
        // Create a new instance of the component for this tab
        // Initialize config with defaults based on component type
        let initialConfig = {};
        
        // Initialize Record Detail with fields from schema (dynamic) not hardcoded
        if (draggedComponent.id === 'record_detail') {
          const normalizedName = objectName?.toLowerCase() || 'record';
          
          // Use schemaFields if available, otherwise minimal fallback
          const fieldsToUse = schemaFields && schemaFields.length > 0 
            ? schemaFields 
            : [{ key: 'name', label: 'Name' }, { key: 'description', label: 'Description' }];
          
          const sectionLabel = {
            lead: 'Lead Information',
            opportunity: 'Opportunity Information',
            account: 'Account Information',
            contact: 'Contact Information'
          }[normalizedName] || `${objectName || 'Record'} Information`;
          
          initialConfig = {
            columns: 2,
            items: [{
              id: `section-${normalizedName}-info-${Date.now()}`,
              type: 'field_section',
              label: sectionLabel,
              collapsed: false,
              fields: fieldsToUse.map((field, idx) => ({
                id: `field-${field.key}-${Date.now()}-${idx}`,
                type: 'field',
                key: field.key,
                label: field.label || field.key
              }))
            }]
          };
        }
        
        const newComponent = {
          id: draggedComponent.id,
          name: draggedComponent.name,
          instanceId: `${draggedComponent.id}-${Date.now()}`,
          config: initialConfig
        };
        
        // Update the tabs component's config
        const currentTabs = tabsComponent.config?.tabs || [
          { id: 'tab-1', label: 'Details', components: [] },
          { id: 'tab-2', label: 'Related', components: [] },
        ];
        
        const newTabs = currentTabs.map(t => {
          if (t.id === tabId) {
            return { ...t, components: [...(t.components || []), newComponent] };
          }
          return t;
        });
        
        const updatedTabsComponent = {
          ...tabsComponent,
          config: { ...tabsComponent.config, tabs: newTabs }
        };
        
        // Update placed components
        setPlacedComponents(prev => ({
          ...prev,
          [tabsRegion]: prev[tabsRegion].map(c => 
            c.instanceId === tabsInstanceId ? updatedTabsComponent : c
          )
        }));
        
        toast.success(`${draggedComponent.name} added to tab`);
        setSelectedComponent(updatedTabsComponent);
      }
      return;
    }

    // Debug logging
    console.log('handleDragEnd - overId:', overId, 'activeId:', activeId);

    // Handle dropping fields into Record Detail component at specific position
    // Support both old format (record-detail-insert-) and new format (insert-point-)
    if (overId.startsWith('record-detail-insert-') || overId.startsWith('insert-point-')) {
      console.log('Detected record detail insert drop zone');
      // Format: record-detail-insert-{instanceId}-{index} OR insert-point-{instanceId}-{index}
      const prefix = overId.startsWith('record-detail-insert-') ? 'record-detail-insert-' : 'insert-point-';
      const parts = overId.replace(prefix, '').split('-');
      // instanceId is like "record_detail-1234567890", index is at the end
      const insertIndex = parseInt(parts.pop(), 10);
      const recordDetailInstanceId = parts.join('-');
      
      // Only accept field drags (not components)
      if (!activeId.startsWith('field-')) {
        // Check if it's a field component like blank_space or field_section
        if (activeId.startsWith('fieldcomp-')) {
          const componentId = activeId.replace('fieldcomp-', '');
          const fieldComponent = FIELD_COMPONENTS.find(c => c.id === componentId);
          
          if (!fieldComponent) return;
          
          // Find the Record Detail component on canvas (including inside Tabs)
          let recordDetailComponent = null;
          let recordDetailRegion = null;
          let parentTabsComponent = null;
          let parentTabId = null;
          
          Object.keys(placedComponents).forEach(region => {
            placedComponents[region].forEach(comp => {
              if (comp.instanceId === recordDetailInstanceId) {
                recordDetailComponent = comp;
                recordDetailRegion = region;
              }
              // Also search inside Tabs components
              if (comp.id === 'tabs' && comp.config?.tabs) {
                comp.config.tabs.forEach(tab => {
                  (tab.components || []).forEach(innerComp => {
                    if (innerComp.instanceId === recordDetailInstanceId) {
                      recordDetailComponent = innerComp;
                      parentTabsComponent = comp;
                      parentTabId = tab.id;
                      recordDetailRegion = region;
                    }
                  });
                });
              }
            });
          });
          
          if (recordDetailComponent) {
            const currentItems = recordDetailComponent.config?.items || getDefaultRecordDetailItems(objectName, schemaFields);
            
            // Create new item based on component type
            let newItem;
            if (componentId === 'blank_space') {
              newItem = {
                id: `blank-${Date.now()}`,
                type: 'blank_space',
                label: 'Blank Space'
              };
            } else if (componentId === 'field_section') {
              newItem = {
                id: `section-${Date.now()}`,
                type: 'field_section',
                label: 'New Section',
                fields: [],
                collapsed: false
              };
            } else {
              return;
            }
            
            // Insert at specific position
            const newItems = [...currentItems];
            newItems.splice(insertIndex, 0, newItem);
            
            const updatedComponent = {
              ...recordDetailComponent,
              config: {
                ...recordDetailComponent.config,
                items: newItems
              }
            };
            
            // Update placed components - handle both direct and nested (inside Tabs) cases
            if (parentTabsComponent && parentTabId) {
              // Record Detail is inside a Tabs component
              const updatedTabs = parentTabsComponent.config.tabs.map(tab => {
                if (tab.id === parentTabId) {
                  return {
                    ...tab,
                    components: tab.components.map(c =>
                      c.instanceId === recordDetailInstanceId ? updatedComponent : c
                    )
                  };
                }
                return tab;
              });
              
              const updatedTabsComponent = {
                ...parentTabsComponent,
                config: { ...parentTabsComponent.config, tabs: updatedTabs }
              };
              
              setPlacedComponents(prev => ({
                ...prev,
                [recordDetailRegion]: prev[recordDetailRegion].map(c =>
                  c.instanceId === parentTabsComponent.instanceId ? updatedTabsComponent : c
                )
              }));
            } else {
              setPlacedComponents(prev => ({
                ...prev,
                [recordDetailRegion]: prev[recordDetailRegion].map(c => 
                  c.instanceId === recordDetailInstanceId ? updatedComponent : c
                )
              }));
            }
            
            toast.success(`${fieldComponent.name} inserted at position ${insertIndex + 1}`);
            setSelectedComponent(updatedComponent);
          }
          return;
        }
        return;
      }
      
      const fieldKey = activeId.replace('field-', '');
      const allFields = getAllFields();
      const field = allFields.find(f => f.key === fieldKey);
      
      if (!field) {
        console.warn(`Field '${fieldKey}' not found in schema fields. Available: ${allFields.map(f => f.key).join(', ')}`);
        toast.error(`Field '${fieldKey}' not found in schema`);
        return;
      }
      
      // Find the Record Detail component on canvas (including inside Tabs)
      let recordDetailComponent = null;
      let recordDetailRegion = null;
      let parentTabsComponent = null;
      let parentTabId = null;
      
      // First, search in main regions
      Object.keys(placedComponents).forEach(region => {
        placedComponents[region].forEach(comp => {
          if (comp.instanceId === recordDetailInstanceId) {
            recordDetailComponent = comp;
            recordDetailRegion = region;
          }
          // Also search inside Tabs components
          if (comp.id === 'tabs' && comp.config?.tabs) {
            comp.config.tabs.forEach(tab => {
              (tab.components || []).forEach(innerComp => {
                if (innerComp.instanceId === recordDetailInstanceId) {
                  recordDetailComponent = innerComp;
                  parentTabsComponent = comp;
                  parentTabId = tab.id;
                  recordDetailRegion = region;
                }
              });
            });
          }
        });
      });
      
      if (recordDetailComponent) {
        // Get current items
        const currentItems = recordDetailComponent.config?.items || getDefaultRecordDetailItems(objectName, schemaFields);
        
        // Check if field already exists (handle both flat fields and section-based structure)
        const alreadyExists = currentItems.some(item => {
          // Direct field check
          if (item.key === fieldKey) return true;
          // Check inside sections
          if (item.type === 'field_section' && item.fields) {
            return item.fields.some(f => f.key === fieldKey);
          }
          return false;
        });
        if (alreadyExists) {
          toast.error(`${field.label} is already in Record Detail`);
          return;
        }
        
        // Create new field item
        const newFieldItem = {
          id: `field-${fieldKey}-${Date.now()}`,
          type: 'field',
          key: fieldKey,
          label: field.label
        };
        
        // Determine if layout uses sections
        const hasFieldSections = currentItems.some(item => item.type === 'field_section');
        
        let newItems;
        if (hasFieldSections) {
          // Add to the first section's fields array
          const firstSectionIndex = currentItems.findIndex(item => item.type === 'field_section');
          if (firstSectionIndex >= 0) {
            newItems = currentItems.map((item, idx) => {
              if (idx === firstSectionIndex && item.type === 'field_section') {
                return {
                  ...item,
                  fields: [...(item.fields || []), newFieldItem]
                };
              }
              return item;
            });
          } else {
            // No section found, fallback to flat insert
            newItems = [...currentItems];
            newItems.splice(insertIndex, 0, newFieldItem);
          }
        } else {
          // Flat field list - insert at specific position
          newItems = [...currentItems];
          newItems.splice(insertIndex, 0, newFieldItem);
        }
        
        const updatedComponent = {
          ...recordDetailComponent,
          config: {
            ...recordDetailComponent.config,
            items: newItems
          }
        };
        
        // Update placed components - handle both direct and nested (inside Tabs) cases
        if (parentTabsComponent && parentTabId) {
          // Record Detail is inside a Tabs component - update the nested structure
          const updatedTabs = parentTabsComponent.config.tabs.map(tab => {
            if (tab.id === parentTabId) {
              return {
                ...tab,
                components: tab.components.map(c =>
                  c.instanceId === recordDetailInstanceId ? updatedComponent : c
                )
              };
            }
            return tab;
          });
          
          const updatedTabsComponent = {
            ...parentTabsComponent,
            config: { ...parentTabsComponent.config, tabs: updatedTabs }
          };
          
          setPlacedComponents(prev => ({
            ...prev,
            [recordDetailRegion]: prev[recordDetailRegion].map(c =>
              c.instanceId === parentTabsComponent.instanceId ? updatedTabsComponent : c
            )
          }));
        } else {
          // Record Detail is directly in a region
          setPlacedComponents(prev => ({
            ...prev,
            [recordDetailRegion]: prev[recordDetailRegion].map(c => 
              c.instanceId === recordDetailInstanceId ? updatedComponent : c
            )
          }));
        }
        
        toast.success(`${field.label} inserted at position ${insertIndex + 1}`);
        setSelectedComponent(updatedComponent);
      }
      return;
    }

    // Handle dropping fields into Field Section inside Record Detail
    if (overId.startsWith('field-section-drop-') || over?.data?.current?.type === 'field-section-dropzone') {
      // Use the data property if available, otherwise parse from ID
      let recordDetailInstanceId, sectionId;
      
      if (over?.data?.current?.type === 'field-section-dropzone') {
        // Use data from droppable
        recordDetailInstanceId = over.data.current.recordDetailInstanceId;
        sectionId = over.data.current.sectionId;
        console.log('Using data from droppable:', { recordDetailInstanceId, sectionId });
      } else {
        // Parse from ID: field-section-drop-{recordDetailInstanceId}-{sectionId}
        const remainder = overId.replace('field-section-drop-', '');
        
        // Find where "-section-" appears (the section ID always starts with "section-")
        const sectionMarker = '-section-';
        const sectionIndex = remainder.indexOf(sectionMarker);
        
        if (sectionIndex === -1) {
          console.log('Could not parse field section drop ID:', overId);
          return;
        }
        
        recordDetailInstanceId = remainder.substring(0, sectionIndex);
        sectionId = remainder.substring(sectionIndex + 1); // +1 to skip the leading dash
        console.log('Parsed IDs from string:', { recordDetailInstanceId, sectionId, overId });
      }
      
      // Handle field component drops (Field Section, Blank Space) - add to Record Detail, not section
      if (activeId.startsWith('fieldcomp-')) {
        const componentId = activeId.replace('fieldcomp-', '');
        const fieldComponent = FIELD_COMPONENTS.find(c => c.id === componentId);
        
        if (componentId === 'field_section' || componentId === 'blank_space') {
          // Find the Record Detail component (including inside Tabs)
          let recordDetailComponent = null;
          let recordDetailRegion = null;
          let parentTabsComponent = null;
          let parentTabId = null;
          
          Object.keys(placedComponents).forEach(region => {
            placedComponents[region].forEach(comp => {
              if (comp.instanceId === recordDetailInstanceId) {
                recordDetailComponent = comp;
                recordDetailRegion = region;
              }
              // Also search inside Tabs components
              if (comp.id === 'tabs' && comp.config?.tabs) {
                comp.config.tabs.forEach(tab => {
                  (tab.components || []).forEach(innerComp => {
                    if (innerComp.instanceId === recordDetailInstanceId) {
                      recordDetailComponent = innerComp;
                      parentTabsComponent = comp;
                      parentTabId = tab.id;
                      recordDetailRegion = region;
                    }
                  });
                });
              }
            });
          });
          
          if (recordDetailComponent) {
            const currentItems = recordDetailComponent.config?.items || getDefaultRecordDetailItems(objectName, schemaFields);
            
            // Create new item
            let newItem;
            if (componentId === 'blank_space') {
              newItem = {
                id: `blank-${Date.now()}`,
                type: 'blank_space',
                label: 'Blank Space'
              };
            } else if (componentId === 'field_section') {
              newItem = {
                id: `section-${Date.now()}`,
                type: 'field_section',
                label: 'New Section',
                fields: [],
                collapsed: false
              };
            }
            
            if (newItem) {
              // Find the index of the current section and insert after it
              const sectionIdx = currentItems.findIndex(item => item.id === sectionId);
              const insertIdx = sectionIdx >= 0 ? sectionIdx + 1 : currentItems.length;
              
              const newItems = [...currentItems];
              newItems.splice(insertIdx, 0, newItem);
              
              const updatedComponent = {
                ...recordDetailComponent,
                config: {
                  ...recordDetailComponent.config,
                  items: newItems
                }
              };
              
              // Update placed components - handle both direct and nested (inside Tabs) cases
              if (parentTabsComponent && parentTabId) {
                const updatedTabs = parentTabsComponent.config.tabs.map(tab => {
                  if (tab.id === parentTabId) {
                    return {
                      ...tab,
                      components: tab.components.map(c =>
                        c.instanceId === recordDetailInstanceId ? updatedComponent : c
                      )
                    };
                  }
                  return tab;
                });
                
                const updatedTabsComponent = {
                  ...parentTabsComponent,
                  config: { ...parentTabsComponent.config, tabs: updatedTabs }
                };
                
                setPlacedComponents(prev => ({
                  ...prev,
                  [recordDetailRegion]: prev[recordDetailRegion].map(c =>
                    c.instanceId === parentTabsComponent.instanceId ? updatedTabsComponent : c
                  )
                }));
              } else {
                setPlacedComponents(prev => ({
                  ...prev,
                  [recordDetailRegion]: prev[recordDetailRegion].map(c => 
                    c.instanceId === recordDetailInstanceId ? updatedComponent : c
                  )
                }));
              }
              
              toast.success(`${fieldComponent.name} added to Record Detail`);
              setSelectedComponent(updatedComponent);
            }
          }
          return;
        }
        
        // Other field components can't be dropped into sections
        toast('Only fields can be dropped into sections', { icon: 'ℹ️' });
        return;
      }
      
      // Skip if this is a record-detail-field drag (handled by handleDragOver for reordering)
      if (active.data.current?.type === 'record-detail-field') {
        console.log('Skipping field-section-drop handling for record-detail-field drag (handled by handleDragOver)');
        return;
      }
      
      // Only accept field drags for adding to sections
      if (!activeId.startsWith('field-')) {
        console.log('Not a field drag:', activeId);
        toast('Only fields can be dropped into sections', { icon: 'ℹ️' });
        return;
      }
      
      const fieldKey = activeId.replace('field-', '');
      const allFields = getAllFields();
      const field = allFields.find(f => f.key === fieldKey);
      
      if (!field) {
        console.warn(`Field '${fieldKey}' not found in schema fields. Available: ${allFields.map(f => f.key).join(', ')}`);
        toast.error(`Field '${fieldKey}' not found in schema`);
        return;
      }
      
      // Find the Record Detail component on canvas (including inside Tabs)
      let recordDetailComponent = null;
      let recordDetailRegion = null;
      let parentTabsComponent = null;
      let parentTabId = null;
      
      Object.keys(placedComponents).forEach(region => {
        placedComponents[region].forEach(comp => {
          if (comp.instanceId === recordDetailInstanceId) {
            recordDetailComponent = comp;
            recordDetailRegion = region;
          }
          // Also search inside Tabs components
          if (comp.id === 'tabs' && comp.config?.tabs) {
            comp.config.tabs.forEach(tab => {
              (tab.components || []).forEach(innerComp => {
                if (innerComp.instanceId === recordDetailInstanceId) {
                  recordDetailComponent = innerComp;
                  parentTabsComponent = comp;
                  parentTabId = tab.id;
                  recordDetailRegion = region;
                }
              });
            });
          }
        });
      });
      
      if (!recordDetailComponent) {
        console.log('Record Detail component not found:', recordDetailInstanceId);
        return;
      }
      
      // Process items to ensure section structure matches the render output
      const currentItems = processRecordDetailItems(
        recordDetailComponent.config?.items,
        objectName
      );
      
      // Find the section and add field to it
      let fieldAdded = false;
      const newItems = currentItems.map(item => {
        if (item.id === sectionId && item.type === 'field_section') {
          const sectionFields = item.fields || [];
          
          // Check if field already exists in section
          const alreadyExists = sectionFields.some(f => f.key === fieldKey);
          if (alreadyExists) {
            toast.error(`${field.label} is already in this section`);
            return item;
          }
          
          fieldAdded = true;
          return {
            ...item,
            fields: [...sectionFields, {
              id: `field-${fieldKey}-${Date.now()}`,
              type: 'field',
              key: fieldKey,
              label: field.label
            }]
          };
        }
        return item;
      });
      
      if (fieldAdded) {
        const updatedComponent = {
          ...recordDetailComponent,
          config: {
            ...recordDetailComponent.config,
            items: newItems
          }
        };
        
        // Update placed components - handle both direct and nested (inside Tabs) cases
        if (parentTabsComponent && parentTabId) {
          const updatedTabs = parentTabsComponent.config.tabs.map(tab => {
            if (tab.id === parentTabId) {
              return {
                ...tab,
                components: tab.components.map(c =>
                  c.instanceId === recordDetailInstanceId ? updatedComponent : c
                )
              };
            }
            return tab;
          });
          
          const updatedTabsComponent = {
            ...parentTabsComponent,
            config: { ...parentTabsComponent.config, tabs: updatedTabs }
          };
          
          setPlacedComponents(prev => ({
            ...prev,
            [recordDetailRegion]: prev[recordDetailRegion].map(c =>
              c.instanceId === parentTabsComponent.instanceId ? updatedTabsComponent : c
            )
          }));
        } else {
          setPlacedComponents(prev => ({
            ...prev,
            [recordDetailRegion]: prev[recordDetailRegion].map(c => 
              c.instanceId === recordDetailInstanceId ? updatedComponent : c
            )
          }));
        }
        
        toast.success(`${field.label} added to section`);
        setSelectedComponent(updatedComponent);
      }
      return;
    }

    // Handle standard components from sidebar
    if (activeId.startsWith('sidebar-')) {
      const componentId = activeId.replace('sidebar-', '');
      const component = STANDARD_COMPONENTS.find(c => c.id === componentId);
      
      // Determine target region - either directly on region or on a component within a region
      let targetRegion = null;
      let insertIndex = -1; // -1 means append at end
      
      if (currentLayout.regions.includes(over.id)) {
        // Dropped directly on a region
        targetRegion = over.id;
      } else if (over.data?.current?.type === 'component-insertion-point') {
        // Dropped on an insertion point - insert at exact position
        targetRegion = over.data.current.regionId;
        insertIndex = over.data.current.index;
      } else if (over.data?.current?.type === 'placed-component') {
        // Dropped on an existing component - insert at that position
        targetRegion = over.data.current.regionId;
        const regionComponents = placedComponents[targetRegion] || [];
        insertIndex = regionComponents.findIndex(c => c.instanceId === over.id);
      }
      
      if (component && targetRegion) {
        // Create new component with instance ID
        let newComponent = {
          ...component,
          instanceId: `${component.id}-${Date.now()}`,
          regionId: targetRegion,
          config: {}
        };

        // Apply default config for activities component on first drop
        if (component.id === 'activities') {
          newComponent.config = createDefaultActivityConfig();
        }
        
        // Apply default config for highlights_panel component on first drop
        if (component.id === 'highlights_panel') {
          newComponent.config = {
            displayFields: ['phone', 'website'],
            visibleActionButton: true,
            showAsCollapsed: false,
          };
        }

        setPlacedComponents(prev => {
          const currentComponents = [...(prev[targetRegion] || [])];
          
          if (insertIndex >= 0) {
            // Insert at specific position
            currentComponents.splice(insertIndex, 0, newComponent);
          } else {
            // Append at end
            currentComponents.push(newComponent);
          }
          
          return {
            ...prev,
            [targetRegion]: currentComponents
          };
        });

        toast.success(`${component.name} added`);
        setSelectedComponent(newComponent);
      }
    }
    
    // Handle field components (Blank Space, Field Section, Dynamic Highlights Panel)
    else if (activeId.startsWith('fieldcomp-')) {
      const componentId = activeId.replace('fieldcomp-', '');
      const fieldComponent = FIELD_COMPONENTS.find(c => c.id === componentId);
      
      // Check if dropped on a Record Detail component (by instanceId)
      // overId might be like "record_detail-1234567890"
      if (overId.startsWith('record_detail-')) {
        // Find the Record Detail component
        let recordDetailComponent = null;
        let recordDetailRegion = null;
        
        Object.keys(placedComponents).forEach(region => {
          placedComponents[region].forEach(comp => {
            if (comp.instanceId === overId) {
              recordDetailComponent = comp;
              recordDetailRegion = region;
            }
          });
        });
        
        if (recordDetailComponent && (componentId === 'field_section' || componentId === 'blank_space')) {
          const currentItems = recordDetailComponent.config?.items || getDefaultRecordDetailItems(objectName, schemaFields);
          
          // Create new item
          let newItem;
          if (componentId === 'blank_space') {
            newItem = {
              id: `blank-${Date.now()}`,
              type: 'blank_space',
              label: 'Blank Space'
            };
          } else if (componentId === 'field_section') {
            newItem = {
              id: `section-${Date.now()}`,
              type: 'field_section',
              label: 'New Section',
              fields: [],
              collapsed: false
            };
          }
          
          if (newItem) {
            // Add at the end
            const newItems = [...currentItems, newItem];
            
            const updatedComponent = {
              ...recordDetailComponent,
              config: {
                ...recordDetailComponent.config,
                items: newItems
              }
            };
            
            setPlacedComponents(prev => ({
              ...prev,
              [recordDetailRegion]: prev[recordDetailRegion].map(c => 
                c.instanceId === overId ? updatedComponent : c
              )
            }));
            
            toast.success(`${fieldComponent.name} added to Record Detail`);
            setSelectedComponent(updatedComponent);
          }
          return;
        }
      }
      
      // Field Section should ONLY be dropped inside Record Detail, not as a separate component
      if (componentId === 'field_section') {
        toast.error('Field Section must be dropped inside a Record Detail component');
        return;
      }
      
      // Blank Space should also only go inside Record Detail
      if (componentId === 'blank_space') {
        toast.error('Blank Space must be dropped inside a Record Detail component');
        return;
      }
      
      // Only Dynamic Highlights Panel can be added as a separate component
      if (fieldComponent && currentLayout.regions.includes(over.id)) {
        const newComponent = {
          id: fieldComponent.id,
          name: fieldComponent.name,
          icon: fieldComponent.icon,
          description: fieldComponent.description,
          instanceId: `${fieldComponent.id}-${Date.now()}`,
          regionId: over.id,
          config: {},
          category: 'field_component'
        };

        setPlacedComponents(prev => ({
          ...prev,
          [over.id]: [...prev[over.id], newComponent]
        }));

        toast.success(`${fieldComponent.name} added`);
        setSelectedComponent(newComponent);
      }
    }
    
    // Handle individual fields - should only go inside Record Detail
    else if (activeId.startsWith('field-')) {
      // Skip if this is a record-detail-field drag (reordering is handled by handleDragOver)
      if (active.data.current?.type === 'record-detail-field') {
        // Field reordering within Record Detail is handled by handleDragOver
        // Just return silently - no error needed
        console.log('Field reorder completed (handled by handleDragOver)');
        return;
      }
      
      // Handle dropping directly on a Record Detail component (by its instanceId)
      if (over && overId.startsWith('record_detail-')) {
        // Find the Record Detail component by instanceId
        let recordDetailComponent = null;
        let recordDetailRegion = null;
        
        Object.keys(placedComponents).forEach(region => {
          placedComponents[region].forEach(comp => {
            if (comp.instanceId === overId) {
              recordDetailComponent = comp;
              recordDetailRegion = region;
            }
          });
        });
        
        if (recordDetailComponent) {
          const fieldKey = activeId.replace('field-', '');
          const allFields = getAllFields();
          const field = allFields.find(f => f.key === fieldKey);
          
          if (!field) {
            console.warn(`Field '${fieldKey}' not found in schema fields.`);
            toast.error(`Field '${fieldKey}' not found in schema`);
            return;
          }
          
          // Process items to get section structure
          const currentItems = processRecordDetailItems(
            recordDetailComponent.config?.items,
            objectName
          );
          
          // Check if field already exists
          const alreadyExists = currentItems.some(item => {
            if (item.key === fieldKey) return true;
            if (item.type === 'field_section' && item.fields) {
              return item.fields.some(f => f.key === fieldKey);
            }
            return false;
          });
          
          if (alreadyExists) {
            toast.error(`${field.label} is already in Record Detail`);
            return;
          }
          
          // Create new field
          const newFieldItem = {
            id: `field-${fieldKey}-${Date.now()}`,
            type: 'field',
            key: fieldKey,
            label: field.label
          };
          
          // Add to first section
          const firstSectionIndex = currentItems.findIndex(item => item.type === 'field_section');
          let newItems;
          
          if (firstSectionIndex >= 0) {
            newItems = currentItems.map((item, idx) => {
              if (idx === firstSectionIndex && item.type === 'field_section') {
                return {
                  ...item,
                  fields: [...(item.fields || []), newFieldItem]
                };
              }
              return item;
            });
          } else {
            // No sections, append directly
            newItems = [...currentItems, newFieldItem];
          }
          
          const updatedComponent = {
            ...recordDetailComponent,
            config: {
              ...recordDetailComponent.config,
              items: newItems
            }
          };
          
          setPlacedComponents(prev => ({
            ...prev,
            [recordDetailRegion]: prev[recordDetailRegion].map(c => 
              c.instanceId === recordDetailComponent.instanceId ? updatedComponent : c
            )
          }));
          
          toast.success(`${field.label} added to Record Detail`);
          setSelectedComponent(updatedComponent);
          return;
        }
      }
      
      // If dropped on a region, find a Record Detail component in that region and add the field
      if (over && currentLayout.regions.includes(over.id)) {
        const regionComponents = placedComponents[over.id] || [];
        const recordDetailComponent = regionComponents.find(c => c.id === 'record_detail');
        
        if (recordDetailComponent) {
          // Add the field to the Record Detail component
          const fieldKey = activeId.replace('field-', '');
          const allFields = getAllFields();
          const field = allFields.find(f => f.key === fieldKey);
          
          if (!field) {
            console.warn(`Field '${fieldKey}' not found in schema fields. Available: ${allFields.map(f => f.key).join(', ')}`);
            toast.error(`Field '${fieldKey}' not found in schema`);
            return;
          }
          
          const currentItems = recordDetailComponent.config?.items || getDefaultRecordDetailItems(objectName, schemaFields);
          
          // Check if field already exists (handle both flat fields and section-based structure)
          const alreadyExists = currentItems.some(item => {
            // Direct field check
            if (item.key === fieldKey) return true;
            // Check inside sections
            if (item.type === 'field_section' && item.fields) {
              return item.fields.some(f => f.key === fieldKey);
            }
            return false;
          });
          if (alreadyExists) {
            toast.error(`${field.label} is already in Record Detail`);
            return;
          }
          
          // Create new field item
          const newFieldItem = {
            id: `field-${fieldKey}-${Date.now()}`,
            type: 'field',
            key: fieldKey,
            label: field.label
          };
          
          // Determine if layout uses sections
          const hasFieldSections = currentItems.some(item => item.type === 'field_section');
          
          let newItems;
          if (hasFieldSections) {
            // Add to the first section's fields array
            const firstSectionIndex = currentItems.findIndex(item => item.type === 'field_section');
            if (firstSectionIndex >= 0) {
              newItems = currentItems.map((item, idx) => {
                if (idx === firstSectionIndex && item.type === 'field_section') {
                  return {
                    ...item,
                    fields: [...(item.fields || []), newFieldItem]
                  };
                }
                return item;
              });
            } else {
              // No section found, fallback to flat append
              newItems = [...currentItems, newFieldItem];
            }
          } else {
            // Flat field list - append at the end
            newItems = [...currentItems, newFieldItem];
          }
          
          const updatedComponent = {
            ...recordDetailComponent,
            config: {
              ...recordDetailComponent.config,
              items: newItems
            }
          };
          
          // Update placed components
          setPlacedComponents(prev => ({
            ...prev,
            [over.id]: prev[over.id].map(c => 
              c.instanceId === recordDetailComponent.instanceId ? updatedComponent : c
            )
          }));
          
          toast.success(`${field.label} added to Record Detail`);
          setSelectedComponent(updatedComponent);
          return;
        }
      }
      
      toast.error('Fields must be dropped inside a Record Detail component');
      return;
    }
  };

  const handleSelectComponent = (component) => {
    setSelectedComponent(component);
  };

  // Helper function to update a component anywhere (including inside Tabs)
  const handleUpdateComponent = (updatedComponent) => {
    setPlacedComponents(prev => {
      const newState = { ...prev };
      let found = false;
      
      // First, search in top-level components
      Object.keys(newState).forEach(region => {
        newState[region] = newState[region].map(c => {
          if (c.instanceId === updatedComponent.instanceId) {
            found = true;
            return updatedComponent;
          }
          // Also search inside Tabs components
          if (c.id === 'tabs' && c.config?.tabs) {
            const updatedTabs = c.config.tabs.map(tab => {
              const updatedComponents = (tab.components || []).map(innerComp => {
                if (innerComp.instanceId === updatedComponent.instanceId) {
                  found = true;
                  return updatedComponent;
                }
                return innerComp;
              });
              return { ...tab, components: updatedComponents };
            });
            return { ...c, config: { ...c.config, tabs: updatedTabs } };
          }
          return c;
        });
      });
      
      return newState;
    });
    setSelectedComponent(updatedComponent);
  };

  const handleRemoveComponent = (instanceId, regionId) => {
    setPlacedComponents(prev => ({
      ...prev,
      [regionId]: prev[regionId].filter(c => c.instanceId !== instanceId)
    }));
    setSelectedComponent(null);
    toast.success('Component removed');
  };

  const getDraggingComponent = () => {
    if (!activeId) return null;
    if (activeId.toString().startsWith('sidebar-')) {
      const componentId = activeId.toString().replace('sidebar-', '');
      return STANDARD_COMPONENTS.find(c => c.id === componentId);
    }
    return null;
  };

  const draggingComponent = getDraggingComponent();

  // Render canvas based on selected layout
  const renderCanvas = () => {
    // In New mode, only show Main region (no Header, Left, Right)
    const hasHeader = !isNewMode && currentLayout.regions.includes('header');
    const hasLeft = !isNewMode && currentLayout.regions.includes('left');
    const hasMain = currentLayout.regions.includes('main');
    const hasRight = !isNewMode && currentLayout.regions.includes('right');

    return (
      <div className="space-y-3">
        {/* Header Region - Hidden in New mode */}
        {hasHeader && (
          <DroppableRegion 
            id="header" 
            label="Header"
            placedComponents={placedComponents.header}
            onSelectComponent={handleSelectComponent}
            onRemoveComponent={handleRemoveComponent}
            onUpdateComponent={handleUpdateComponent}
            selectedComponent={selectedComponent}
            objectName={objectName}
            schemaFields={schemaFields}
            selectedRelatedObject={selectedRelatedObject}
            onSelectRelatedObject={setSelectedRelatedObject}
          />
        )}

        {/* Column Layout */}
        <div className="flex gap-3 min-h-0">
          {/* Left Column - Hidden in New mode */}
          {hasLeft && (
            <div className="w-1/3 min-w-[280px] flex-shrink-0">
              <DroppableRegion 
                id="left" 
                label="Left Sidebar"
                placedComponents={placedComponents.left}
                onSelectComponent={handleSelectComponent}
                onRemoveComponent={handleRemoveComponent}
                onUpdateComponent={handleUpdateComponent}
                selectedComponent={selectedComponent}
                objectName={objectName}
                schemaFields={schemaFields}
                selectedRelatedObject={selectedRelatedObject}
                onSelectRelatedObject={setSelectedRelatedObject}
              />
            </div>
          )}

          {/* Main Column - Always visible, full width in New mode */}
          {hasMain && (
            <div className={isNewMode ? "flex-1" : "flex-1 min-w-0"}>
              <DroppableRegion 
                id="main" 
                label={isNewMode ? "Record Detail" : "Main Content"}
                placedComponents={placedComponents.main}
                onSelectComponent={handleSelectComponent}
                onRemoveComponent={handleRemoveComponent}
                onUpdateComponent={handleUpdateComponent}
                selectedComponent={selectedComponent}
                objectName={objectName}
                schemaFields={schemaFields}
                selectedRelatedObject={selectedRelatedObject}
                onSelectRelatedObject={setSelectedRelatedObject}
              />
            </div>
          )}

          {/* Right Column - Hidden in New mode */}
          {hasRight && (
            <div className="w-1/4 min-w-[200px] flex-shrink-0">
              <DroppableRegion 
                id="right" 
                label="Right Sidebar"
                placedComponents={placedComponents.right}
                onSelectComponent={handleSelectComponent}
                onRemoveComponent={handleRemoveComponent}
                onUpdateComponent={handleUpdateComponent}
                selectedComponent={selectedComponent}
                objectName={objectName}
                schemaFields={schemaFields}
                selectedRelatedObject={selectedRelatedObject}
                onSelectRelatedObject={setSelectedRelatedObject}
              />
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={customCollisionDetection}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="fixed inset-0 bg-slate-100 z-50 flex flex-col">
        {/* Header */}
        <div className="bg-[#0176d3] text-white h-12 flex items-center justify-between px-4 shadow-md">
          <div className="flex items-center space-x-4">
            <button onClick={onClose} className="p-1 hover:bg-white/10 rounded">
              <X className="h-5 w-5" />
            </button>
            <div className="flex items-center space-x-2">
              <Layout className="h-5 w-5" />
              <span className="font-semibold">Lightning App Builder</span>
            </div>
            <div className="h-5 w-px bg-white/30"></div>
            <span className="text-sm text-white/80">{pageLabel}</span>
          </div>

          <div className="flex items-center space-x-2">
            <Button variant="ghost" size="sm" className="text-white hover:bg-white/10 h-8">
              <Eye className="h-4 w-4 mr-1" />
              Preview
            </Button>
            <Button 
              onClick={handleSave}
              disabled={isSaving}
              size="sm"
              className="bg-white text-[#0176d3] hover:bg-white/90 h-8 font-medium"
            >
              <Save className="h-4 w-4 mr-1" />
              {isSaving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </div>

        {/* Device Toolbar */}
        <div className="bg-white border-b h-10 flex items-center justify-between px-4">
          <div className="flex items-center space-x-3">
            {/* Device selector */}
            <div className="flex items-center space-x-1 border rounded-md p-0.5">
              <button 
                onClick={() => setDeviceView('desktop')}
                className={`p-1.5 rounded ${deviceView === 'desktop' ? 'bg-slate-100' : 'hover:bg-slate-50'}`}
              >
                <Monitor className="h-4 w-4 text-slate-600" />
              </button>
              <button 
                onClick={() => setDeviceView('tablet')}
                className={`p-1.5 rounded ${deviceView === 'tablet' ? 'bg-slate-100' : 'hover:bg-slate-50'}`}
              >
                <Tablet className="h-4 w-4 text-slate-600" />
              </button>
              <button 
                onClick={() => setDeviceView('mobile')}
                className={`p-1.5 rounded ${deviceView === 'mobile' ? 'bg-slate-100' : 'hover:bg-slate-50'}`}
              >
                <Smartphone className="h-4 w-4 text-slate-600" />
              </button>
            </div>
            
            {/* Vertical Separator */}
            <div className="h-6 w-px bg-slate-300"></div>
            
            {/* Page Selector - Multi-page support */}
            <div className="relative" ref={pageDropdownRef}>
              <button
                onClick={() => setShowPageDropdown(!showPageDropdown)}
                className="flex items-center space-x-2 px-3 py-1.5 border rounded-md hover:bg-slate-50 transition-colors"
                data-testid="page-selector-btn"
              >
                <FileText className="h-4 w-4 text-slate-500" />
                <span className="text-sm text-slate-700 max-w-[180px] truncate">
                  {pageLabel || 'Select Page'}
                </span>
                <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${showPageDropdown ? 'rotate-180' : ''}`} />
                {allPages.length > 1 && (
                  <span className="ml-1 px-1.5 py-0.5 bg-blue-100 text-blue-700 text-[10px] font-medium rounded-full">
                    {allPages.length}
                  </span>
                )}
              </button>
              
              {/* Page Dropdown */}
              {showPageDropdown && (
                <div className="absolute top-full left-0 mt-1 w-72 bg-white border rounded-lg shadow-lg z-50" data-testid="page-dropdown">
                  {/* Header */}
                  <div className="px-3 py-2 border-b bg-slate-50 rounded-t-lg">
                    <h4 className="text-xs font-semibold text-slate-700 uppercase">
                      Lightning Pages ({allPages.length})
                    </h4>
                  </div>
                  
                  {/* Pages List */}
                  <div className="max-h-60 overflow-y-auto">
                    {allPages.length === 0 ? (
                      <div className="px-3 py-4 text-center text-slate-400 text-sm">
                        No pages created yet
                      </div>
                    ) : (
                      allPages.map((page) => (
                        <div
                          key={page.id}
                          className={`group flex items-center justify-between px-3 py-2 hover:bg-slate-50 cursor-pointer border-b last:border-0 ${
                            currentPageId === page.id ? 'bg-blue-50' : ''
                          }`}
                          onClick={() => handleSwitchPage(page.id)}
                          data-testid={`page-item-${page.id}`}
                        >
                          <div className="flex items-center space-x-2 flex-1 min-w-0">
                            <FileText className={`h-4 w-4 flex-shrink-0 ${currentPageId === page.id ? 'text-blue-600' : 'text-slate-400'}`} />
                            <span className={`text-sm truncate ${currentPageId === page.id ? 'text-blue-700 font-medium' : 'text-slate-700'}`}>
                              {page.layout_name}
                            </span>
                            {currentPageId === page.id && (
                              <span className="text-[9px] px-1.5 py-0.5 bg-blue-100 text-blue-600 rounded font-medium flex-shrink-0">
                                EDITING
                              </span>
                            )}
                          </div>
                          {allPages.length > 1 && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDeletePage(page.id); }}
                              className="p-1 hover:bg-red-100 rounded opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity"
                              title="Delete page"
                            >
                              <Trash2 className="h-3.5 w-3.5 text-slate-400 hover:text-red-500" />
                            </button>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                  
                  {/* Create New Page */}
                  <div className="px-3 py-2 border-t bg-slate-50 rounded-b-lg">
                    <div className="flex items-center space-x-2">
                      <Input
                        placeholder="New page name..."
                        value={newPageName}
                        onChange={(e) => setNewPageName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleCreateNewPage()}
                        className="h-8 text-sm flex-1"
                        data-testid="new-page-name-input"
                      />
                      <Button
                        size="sm"
                        onClick={handleCreateNewPage}
                        disabled={isCreatingPage || !newPageName.trim()}
                        className="h-8 px-3 bg-blue-600 hover:bg-blue-700"
                        data-testid="create-page-btn"
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
          
          {/* Reset/Refresh Button */}
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleResetLayout}
            className="h-8 text-slate-600 hover:text-red-600 hover:border-red-300"
          >
            <RotateCcw className="h-4 w-4 mr-1" />
            Reset Page
          </Button>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Sidebar */}
          <div className="w-72 bg-white border-r flex flex-col">
            {/* Tabs */}
            <div className="flex border-b">
              {/* Components tab - hide in New mode */}
              {!isNewMode && (
                <button
                  onClick={() => { setSidebarTab('components'); setSearchQuery(''); }}
                  className={`flex-1 py-2.5 text-sm font-medium border-b-2 ${
                    sidebarTab === 'components' 
                      ? 'border-[#0176d3] text-[#0176d3]' 
                      : 'border-transparent text-slate-600'
                  }`}
                >
                  Components
                </button>
              )}
              <button
                onClick={() => { setSidebarTab('fields'); setSearchQuery(''); }}
                className={`flex-1 py-2.5 text-sm font-medium border-b-2 ${
                  sidebarTab === 'fields' 
                    ? 'border-[#0176d3] text-[#0176d3]' 
                    : 'border-transparent text-slate-600'
                }`}
              >
                Fields
              </button>
            </div>
            
            {/* Search Box */}
            <div className="p-3 border-b">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder={sidebarTab === 'components' ? "Search components..." : "Search layouts..."}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 h-8 text-sm"
                />
                {searchQuery && (
                  <button 
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 transform -translate-y-1/2 p-0.5 hover:bg-slate-100 rounded"
                  >
                    <X className="h-3 w-3 text-slate-400" />
                  </button>
                )}
              </div>
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-y-auto p-3">
              {sidebarTab === 'components' && (
                <div className="space-y-2">
                  <p className="text-xs text-slate-500 mb-2">
                    {searchQuery ? `Found ${filteredComponents.length} component(s)` : 'Drag to canvas'}
                  </p>
                  {filteredComponents.length === 0 ? (
                    <div className="text-center py-6 text-slate-400">
                      <Search className="h-6 w-6 mx-auto mb-2" />
                      <p className="text-xs">No components found</p>
                    </div>
                  ) : (
                    filteredComponents.map((component) => (
                      <DraggableComponent key={component.id} component={component} />
                    ))
                  )}
                </div>
              )}

              {sidebarTab === 'fields' && (
                <FieldsTabContent 
                  objectName={objectName}
                  searchQuery={searchQuery}
                  selectedLayout={selectedLayout}
                  setSelectedLayout={setSelectedLayout}
                  filteredLayouts={filteredLayouts}
                  hidePageLayout={isNewMode}
                  pageType={currentPageType}
                />
              )}
            </div>
          </div>

          {/* Canvas */}
          <div className="flex-1 bg-slate-200 overflow-auto p-6">
            {/* Scaled wrapper - 75% zoom workaround for cramped 3-column layout */}
            <div style={{ 
              width: '133.33%', 
              height: '133.33%', 
              transform: 'scale(0.75)', 
              transformOrigin: 'top left' 
            }}>
            <div className={`mx-auto bg-white rounded-lg shadow-lg ${
              deviceView === 'desktop' ? 'max-w-full' : 
              deviceView === 'tablet' ? 'max-w-2xl' : 'max-w-sm'
            }`}>
              {/* Record Header - Hide in New mode */}
              {!isNewMode && (
                <div className="bg-[#0176d3] text-white px-4 py-3 rounded-t-lg">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                      <User className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="font-semibold">Sample {objectName.charAt(0).toUpperCase() + objectName.slice(1)}</h3>
                      <p className="text-xs text-white/70">{objectName.charAt(0).toUpperCase() + objectName.slice(1)} Record</p>
                    </div>
                  </div>
                </div>
              )}

              {/* New Mode Header - Simple green bar */}
              {isNewMode && (
                <div className="bg-green-600 text-white px-4 py-3 rounded-t-lg">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                      <Plus className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="font-semibold">New {objectName.charAt(0).toUpperCase() + objectName.slice(1)}</h3>
                      <p className="text-xs text-white/70">Record Creation Layout</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Dynamic Canvas - Use same renderCanvas but with mode-based restrictions */}
              <div className="p-4">
                {renderCanvas()}
              </div>
            </div>
            </div>{/* End scaled wrapper */}
          </div>

          {/* Right Sidebar - Properties */}
          {/* Show for both Detail and New modes, but with different content */}
          <div className="w-72 bg-white border-l flex flex-col">
            <div className="px-4 py-3 border-b bg-slate-50">
              <h3 className="text-sm font-semibold text-slate-700">
                {isNewMode 
                  ? 'New Record Layout Settings' 
                  : (selectedComponent ? 'Component Properties' : 'Page Properties')
                }
              </h3>
            </div>

            <div className="flex-1 overflow-y-auto">
              {/* New Mode Properties */}
              {isNewMode ? (
                <div className="p-4 space-y-4">
                  <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                    <p className="text-xs text-green-700 font-medium mb-1">New Record Layout</p>
                    <p className="text-[10px] text-green-600">
                      Configure fields that appear when creating a new {objectName}. Drag fields and sections from the sidebar to the canvas.
                    </p>
                  </div>

                  {/* Column Layout Settings for New Mode */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-2 uppercase">Layout Columns</label>
                    <div className="flex space-x-2 mb-3">
                      {(() => {
                        // Get the Record Detail component in the main region
                        const mainComponents = placedComponents.main || [];
                        const recordDetailComp = mainComponents.find(c => c.id === 'record_detail');
                        const currentColumns = recordDetailComp?.config?.columns || 2;
                        
                        const updateColumns = (cols) => {
                          if (recordDetailComp) {
                            const updatedComp = {
                              ...recordDetailComp,
                              config: { ...recordDetailComp.config, columns: cols }
                            };
                            setPlacedComponents(prev => ({
                              ...prev,
                              main: prev.main.map(c => 
                                c.instanceId === recordDetailComp.instanceId ? updatedComp : c
                              )
                            }));
                          }
                        };
                        
                        return (
                          <>
                            <Button 
                              variant={currentColumns === 1 ? 'default' : 'outline'} 
                              size="sm"
                              onClick={() => updateColumns(1)}
                            >
                              1 Column
                            </Button>
                            <Button 
                              variant={currentColumns === 2 ? 'default' : 'outline'} 
                              size="sm"
                              onClick={() => updateColumns(2)}
                            >
                              2 Columns
                            </Button>
                          </>
                        );
                      })()}
                    </div>
                    <p className="text-[10px] text-slate-500">
                      Fields will be arranged in the selected number of columns
                    </p>
                  </div>
                  
                  {/* Quick Add Section */}
                  <div className="pt-3 border-t">
                    <label className="block text-xs font-semibold text-slate-700 mb-2 uppercase">Quick Add</label>
                    <div className="flex flex-wrap gap-2">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="text-xs"
                        onClick={() => {
                          const mainComponents = placedComponents.main || [];
                          const recordDetailComp = mainComponents.find(c => c.id === 'record_detail');
                          if (recordDetailComp) {
                            const currentItems = recordDetailComp.config?.items || [];
                            const newItem = {
                              id: `section-${Date.now()}`,
                              type: 'field_section',
                              label: 'New Section',
                              fields: [],
                              collapsed: false
                            };
                            const updatedComp = {
                              ...recordDetailComp,
                              config: { 
                                ...recordDetailComp.config, 
                                items: [...currentItems, newItem] 
                              }
                            };
                            setPlacedComponents(prev => ({
                              ...prev,
                              main: prev.main.map(c => 
                                c.instanceId === recordDetailComp.instanceId ? updatedComp : c
                              )
                            }));
                            toast.success('Section added');
                          }
                        }}
                      >
                        + Add Section
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="text-xs"
                        onClick={() => {
                          const mainComponents = placedComponents.main || [];
                          const recordDetailComp = mainComponents.find(c => c.id === 'record_detail');
                          if (recordDetailComp) {
                            const currentItems = recordDetailComp.config?.items || [];
                            const newItem = {
                              id: `blank-${Date.now()}`,
                              type: 'blank_space',
                              label: 'Blank Space'
                            };
                            const updatedComp = {
                              ...recordDetailComp,
                              config: { 
                                ...recordDetailComp.config, 
                                items: [...currentItems, newItem] 
                              }
                            };
                            setPlacedComponents(prev => ({
                              ...prev,
                              main: prev.main.map(c => 
                                c.instanceId === recordDetailComp.instanceId ? updatedComp : c
                              )
                            }));
                            toast.success('Blank space added');
                          }
                        }}
                      >
                        + Add Space
                      </Button>
                    </div>
                  </div>

                  {/* Page Info */}
                  <div className="pt-3 border-t">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Page Name</label>
                      <Input
                        value={pageLabel}
                        onChange={(e) => setPageLabel(e.target.value)}
                        className="h-9 text-sm"
                      />
                    </div>
                  </div>

                  {/* Field Drop Instructions */}
                  <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <p className="text-xs text-blue-700 font-medium mb-1">How to Use</p>
                    <ul className="text-[10px] text-blue-600 space-y-1">
                      <li>• Drag fields from the sidebar to the canvas</li>
                      <li>• Drop fields into sections to group them</li>
                      <li>• Reorder fields by dragging on the canvas</li>
                      <li>• Click X on fields/sections to remove</li>
                    </ul>
                  </div>
                </div>
              ) : (
                /* Detail Mode Properties */
                selectedComponent ? (
                  <ComponentPropertiesPanel 
                    component={selectedComponent}
                    onUpdate={handleUpdateComponent}
                    onRemove={handleRemoveComponent}
                    objectName={objectName}
                    selectedRelatedObject={selectedRelatedObject}
                    onSelectRelatedObject={setSelectedRelatedObject}
                  />
                ) : (
                  <div className="p-4 space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Label</label>
                      <Input
                        value={pageLabel}
                        onChange={(e) => setPageLabel(e.target.value)}
                        className="h-9 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Object</label>
                      <Input
                        value={objectName.charAt(0).toUpperCase() + objectName.slice(1)}
                        readOnly
                        className="h-9 text-sm bg-slate-50"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Layout</label>
                      <Input
                        value={currentLayout.name}
                        readOnly
                        className="h-9 text-sm bg-slate-50"
                      />
                    </div>
                    <div className="p-3 bg-blue-50 rounded-lg">
                      <p className="text-xs text-blue-700">
                        Select a layout from the &quot;Fields&quot; tab, then drag components from &quot;Components&quot; tab to the canvas.
                      </p>
                    </div>
                  </div>
                )
              )}
            </div>
          </div>
        </div>

        {/* Drag Overlay */}
        <DragOverlay>
          {draggingComponent && (
            <div className="px-3 py-2 bg-white border-2 border-blue-500 rounded shadow-xl opacity-90 flex items-center space-x-2">
              <draggingComponent.icon className="h-4 w-4 text-blue-600" />
              <span className="text-sm font-medium text-slate-800">{draggingComponent.name}</span>
            </div>
          )}
        </DragOverlay>
      </div>
    </DndContext>
  );
};

export default SimpleLightningPageBuilder;
