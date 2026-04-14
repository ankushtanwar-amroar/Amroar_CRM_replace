/**
 * LayoutRenderer - Dynamic Layout-to-Component Rendering Engine
 * 
 * This is the core rendering engine that:
 * 1. Takes layout JSON from Lightning App Builder
 * 2. Iterates through regions (header, left, main, right)
 * 3. Maps component IDs to React components
 * 4. Passes context to each component
 * 
 * When builder configuration changes, this engine automatically
 * renders the new layout without any code modifications.
 * 
 * OBJECT-AGNOSTIC: Works for any object type (Lead, Account, Contact, etc.)
 * with graceful fallback when no custom layout is defined.
 */
import React, { useMemo } from 'react';

// Import all registered components
import PathComponent from './components/PathComponent';
import ActivitiesComponent from './components/ActivitiesComponent';
import RecordDetailComponent from './components/RecordDetailComponent';
import RelatedListsComponent from './components/RelatedListsComponent';
import RelatedListQuickLinksComponent from './components/RelatedListQuickLinksComponent';
import TabsComponent from './components/TabsComponent';
import HighlightsPanelComponent from './components/HighlightsPanelComponent';
import ChatterComponent from './components/ChatterComponent';
import BlankSpaceComponent from './components/BlankSpaceComponent';
import PlaceholderComponent from './components/PlaceholderComponent';
import ActionsComponent from './components/ActionsComponent';
import FlowComponent from './components/FlowComponent';
import AppPageComponent from './components/AppPageComponent';

// Audit Trail Component
import AuditTrailComponent from '../../components/record/engine/renderers/AuditTrailComponent';

// Component Registry - Map component IDs to React components
const COMPONENT_MAP = {
  // Core components
  path: PathComponent,
  activities: ActivitiesComponent,
  record_detail: RecordDetailComponent,
  related_lists: RelatedListsComponent,
  related_list_quick_links: RelatedListQuickLinksComponent,
  
  // Extended components
  tabs: TabsComponent,
  highlights_panel: HighlightsPanelComponent,
  dynamic_highlights_panel: HighlightsPanelComponent,
  compact_layout: HighlightsPanelComponent,
  chatter: ChatterComponent,
  feed: ChatterComponent,
  blank_space: BlankSpaceComponent,
  
  // Actions component - layout-driven action buttons
  actions: ActionsComponent,
  
  // Audit Trail component - record change history
  audit_trail: AuditTrailComponent,
  
  // Flow component - embedded Screen Flows
  flow: FlowComponent,
  
  // App Page component - embedded reusable pages
  app_page: AppPageComponent,
  
  // Generic placeholder for unknown types (shows warning in dev mode)
  placeholder: PlaceholderComponent,
};

// Map legacy region component types to engine component IDs
const REGION_TYPE_MAP = {
  'related_list': 'related_lists',
  'related_lists': 'related_lists',
  'related_list_quick_links': 'related_list_quick_links',
  'relatedListQuickLinks': 'related_list_quick_links',
  'activity_timeline': 'activities',
  'activities': 'activities',
  'path': 'path',
  'stage_path': 'path',
  'tabs': 'tabs',
  'tabbed_content': 'tabs',
  'record_detail': 'record_detail',
  'details': 'record_detail',
  'field_section': 'record_detail',
  'highlights': 'highlights_panel',
  'highlights_panel': 'highlights_panel',
  'dynamic_highlights_panel': 'highlights_panel',
  'compact_layout': 'highlights_panel',
  'chatter': 'chatter',
  'feed': 'chatter',
  'blank_space': 'blank_space',
  'spacer': 'blank_space',
  'actions': 'actions',
  'action_buttons': 'actions',
  'quick_actions': 'actions',
  'audit_trail': 'audit_trail',
  'audit_history': 'audit_trail',
  'app_page': 'app_page',
  'embedded_page': 'app_page',
};

/**
 * Render a single component by ID
 */
export const renderComponent = (component, context) => {
  if (!component) {
    console.warn('Invalid component: null/undefined');
    return null;
  }
  
  // Handle both component.id and component.type formats
  const componentId = component.id || REGION_TYPE_MAP[component.type] || component.type;
  
  if (!componentId) {
    console.warn('Component missing id/type:', component);
    return null;
  }
  
  const Component = COMPONENT_MAP[componentId];
  
  if (!Component) {
    // Use placeholder for unknown component types (shows warning in dev mode)
    console.warn(`Unknown component type: ${componentId}`);
    return (
      <PlaceholderComponent
        key={component.instanceId || `placeholder-${componentId}-${Date.now()}`}
        componentType={componentId}
        config={component.config || {}}
        context={context}
      />
    );
  }
  
  // For Flow component, pass autoStart=true when on a record detail page
  const additionalProps = {};
  if (componentId === 'flow') {
    additionalProps.autoStart = true;
    additionalProps.recordId = context?.recordId;
    additionalProps.objectName = context?.objectName;
    additionalProps.record = context?.record;
  }
  
  return (
    <Component
      key={component.instanceId || `${componentId}-${Date.now()}`}
      config={component.config || {}}
      context={context}
      {...additionalProps}
    />
  );
};

/**
 * Render all components in a region
 */
export const renderRegion = (components, context) => {
  if (!components || !Array.isArray(components) || components.length === 0) {
    return null;
  }
  
  return components.map((component) => renderComponent(component, context));
};

/**
 * Check if region has components
 */
export const hasComponents = (components) => {
  return components && Array.isArray(components) && components.length > 0;
};

/**
 * Get grid configuration based on active regions
 * Uses percentage-based widths for balanced Salesforce-like layout
 * Layout: Left Sidebar (22%) | Main Content (56%) | Right Sidebar (22%)
 * 
 * Responsive behavior:
 * - Mobile: Single column stack (Main first, then sidebars)
 * - Tablet (md): 2-column with sidebars stacked or beside main
 * - Desktop (lg): Full 3-column layout
 */
export const getGridConfig = (placedComponents) => {
  const hasLeft = hasComponents(placedComponents?.left);
  const hasMain = hasComponents(placedComponents?.main);
  const hasRight = hasComponents(placedComponents?.right);
  
  if (hasLeft && hasMain && hasRight) {
    // 3-column layout: Balanced Salesforce-like distribution
    // Mobile: 1 col | Tablet: Main + sidebars | Desktop: 22% | 56% | 22%
    return 'grid-cols-1 md:grid-cols-[1fr_250px] lg:grid-cols-[22%_1fr_22%]';
  } else if (hasLeft && hasMain) {
    // 2-column: Left sidebar (25%) + Main content
    return 'grid-cols-1 md:grid-cols-[250px_1fr] lg:grid-cols-[25%_1fr]';
  } else if (hasMain && hasRight) {
    // 2-column: Main content + Right sidebar (25%)
    return 'grid-cols-1 md:grid-cols-[1fr_250px] lg:grid-cols-[1fr_25%]';
  } else if (hasLeft && hasRight) {
    // Left and right only (rare case)
    return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-[22%_1fr_22%]';
  }
  return 'grid-cols-1';
};

/**
 * Normalize regions array format into placed_components format
 * This handles layouts from system defaults that use `regions` array
 */
const normalizeRegionsToPlacedComponents = (regions, showStagePath = false) => {
  const placedComponents = {
    header: [],
    left: [],
    main: [],
    right: [],
  };
  
  if (!regions || !Array.isArray(regions)) {
    return placedComponents;
  }
  
  regions.forEach(region => {
    const regionId = region.id?.toLowerCase();
    const components = region.components || [];
    
    components.forEach((comp, idx) => {
      const componentType = comp.type;
      const mappedId = REGION_TYPE_MAP[componentType] || componentType;
      
      const normalizedComponent = {
        id: mappedId,
        type: componentType,
        instanceId: `${mappedId}-region-${idx}`,
        config: comp.config || {},
      };
      
      // Map region IDs to placed_components structure
      if (regionId === 'left') {
        placedComponents.left.push(normalizedComponent);
      } else if (regionId === 'center' || regionId === 'main') {
        placedComponents.main.push(normalizedComponent);
      } else if (regionId === 'right') {
        placedComponents.right.push(normalizedComponent);
      }
    });
  });
  
  // Add path component to header if showStagePath is true
  if (showStagePath) {
    placedComponents.header.push({
      id: 'path',
      type: 'path',
      instanceId: 'path-header-auto',
      config: {},
    });
  }
  
  return placedComponents;
};

/**
 * Generate a default layout structure when no layout is configured
 * This is the FALLBACK for objects without any layout
 */
const generateDefaultLayout = (context) => {
  const objectFields = context?.objectFields || {};
  const hasFields = Object.keys(objectFields).length > 0;
  
  // Build sections from object fields for RecordDetailComponent
  const sections = [];
  if (hasFields) {
    const allFieldKeys = Object.keys(objectFields).filter(key => {
      const field = objectFields[key];
      return !field?.hidden && !field?.is_system;
    });
    
    if (allFieldKeys.length > 0) {
      sections.push({
        id: 'default-section',
        name: 'Record Information',
        columns: 2,
        fields: allFieldKeys.slice(0, 20), // Limit to 20 fields
      });
    }
  }
  
  return {
    header: [{
      id: 'path',
      instanceId: 'path-fallback',
      config: {},
    }],
    left: [{
      id: 'related_lists',
      instanceId: 'related-lists-fallback',
      config: {
        lists: [
          { id: 'contacts', objectId: 'contact', name: 'Contacts' },
          { id: 'tasks', objectId: 'task', name: 'Tasks' },
          { id: 'events', objectId: 'event', name: 'Events' },
        ],
      },
    }],
    main: [{
      id: 'record_detail',
      instanceId: 'record-detail-fallback',
      config: {
        items: sections.length > 0 ? sections.map(s => ({
          type: 'field_section',
          id: s.id,
          label: s.name,
          fields: s.fields,
        })) : [],
      },
    }],
    right: [{
      id: 'activities',
      instanceId: 'activities-fallback',
      config: {},
    }],
  };
};

/**
 * Main LayoutRenderer Component
 * 
 * OBJECT-AGNOSTIC: Works for any object by:
 * 1. Using placed_components if available (Lightning Builder layouts)
 * 2. Normalizing regions format (system layouts)
 * 3. Generating default fallback (when no layout exists)
 * 
 * Usage:
 * <LayoutRenderer
 *   layout={layoutData}
 *   context={componentContext}
 * />
 */
const LayoutRenderer = ({ layout, context }) => {
  // Compute normalized placed_components with proper fallback chain
  const normalizedLayout = useMemo(() => {
    // No layout at all - generate fallback
    if (!layout) {
      console.log('[LayoutRenderer] No layout provided, using fallback');
      return generateDefaultLayout(context);
    }
    
    const placedComponents = layout.placed_components || {};
    
    // Check if placed_components has content in the MAIN region
    // This is the key indicator of a fully configured Lightning Builder layout
    const hasMainContent = placedComponents.main?.length > 0;
    const hasCompleteLayout = hasMainContent || (
      placedComponents.header?.length > 0 && 
      (placedComponents.left?.length > 0 || placedComponents.right?.length > 0)
    );
    
    if (hasCompleteLayout) {
      console.log('[LayoutRenderer] Using complete placed_components from layout');
      return placedComponents;
    }
    
    // Check for regions format (system layouts) - this is the PRIMARY source for system layouts
    if (layout.regions && Array.isArray(layout.regions) && layout.regions.length > 0) {
      console.log('[LayoutRenderer] Converting regions to placed_components');
      const normalizedFromRegions = normalizeRegionsToPlacedComponents(
        layout.regions,
        layout.show_stage_path
      );
      
      // Merge any existing placed_components content (e.g., related lists from builder)
      // with the normalized regions content
      return {
        header: normalizedFromRegions.header.length > 0 ? normalizedFromRegions.header : placedComponents.header || [],
        left: placedComponents.left?.length > 0 ? placedComponents.left : normalizedFromRegions.left,
        main: normalizedFromRegions.main.length > 0 ? normalizedFromRegions.main : placedComponents.main || [],
        right: normalizedFromRegions.right.length > 0 ? normalizedFromRegions.right : placedComponents.right || [],
      };
    }
    
    // Check for sections directly on layout (legacy format)
    if (layout.sections && Array.isArray(layout.sections) && layout.sections.length > 0) {
      console.log('[LayoutRenderer] Using sections-based layout');
      return {
        header: layout.show_stage_path ? [{
          id: 'path',
          instanceId: 'path-sections',
          config: {},
        }] : [],
        left: [],
        main: [{
          id: 'record_detail',
          instanceId: 'record-detail-sections',
          config: {
            items: layout.sections.map((s, i) => ({
              type: 'field_section',
              id: s.id || `section-${i}`,
              label: s.name || s.label || 'Details',
              fields: s.fields || [],
            })),
          },
        }],
        right: [],
      };
    }
    
    // Ultimate fallback - generate default
    console.log('[LayoutRenderer] No layout content found, using fallback');
    return generateDefaultLayout(context);
  }, [layout, context]);
  
  const gridClass = getGridConfig(normalizedLayout);
  
  const hasHeader = hasComponents(normalizedLayout.header);
  const hasLeft = hasComponents(normalizedLayout.left);
  const hasMain = hasComponents(normalizedLayout.main);
  const hasRight = hasComponents(normalizedLayout.right);
  
  // If absolutely nothing to render, show message
  if (!hasHeader && !hasLeft && !hasMain && !hasRight) {
    return (
      <div className="p-6">
        <div className="text-center py-12 bg-slate-50 rounded-lg border border-slate-200">
          <p className="text-lg font-medium text-slate-700">No Layout Content</p>
          <p className="text-sm text-slate-500 mt-2">
            Configure this object's layout in Lightning App Builder
          </p>
        </div>
      </div>
    );
  }
  
  return (
    <div 
      className="p-4 lg:p-6" 
      data-testid="layout-renderer"
      style={{ 
        width: '133.33%', 
        transform: 'scale(0.75)', 
        transformOrigin: 'top left' 
      }}
    >
      {/* Header Region (Full Width) - Usually contains Path */}
      {hasHeader && (
        <div className="mb-4" data-testid="region-header">
          {renderRegion(normalizedLayout.header, context)}
        </div>
      )}
      
      {/* Body Regions (Grid Layout) - Responsive 3-column */}
      <div 
        className={`grid gap-4 lg:gap-6 ${gridClass}`} 
        style={{ minWidth: 0 }}
        data-testid="layout-grid"
      >
        {/* Left Sidebar - Flow components, Related Lists */}
        {hasLeft && (
          <div 
            className="space-y-4 min-w-0 overflow-hidden order-2 lg:order-1" 
            data-testid="region-left"
            style={{ minWidth: '200px' }}
          >
            {renderRegion(normalizedLayout.left, context)}
          </div>
        )}
        
        {/* Main Content - Record Details */}
        {hasMain && (
          <div 
            className="space-y-4 min-w-0 overflow-hidden order-1 lg:order-2" 
            data-testid="region-main"
          >
            {renderRegion(normalizedLayout.main, context)}
          </div>
        )}
        
        {/* Right Sidebar - Activities */}
        {hasRight && (
          <div 
            className="space-y-4 lg:sticky lg:top-20 lg:self-start min-w-0 overflow-hidden order-3" 
            data-testid="region-right"
            style={{ minWidth: '200px' }}
          >
            {renderRegion(normalizedLayout.right, context)}
          </div>
        )}
      </div>
    </div>
  );
};

export default LayoutRenderer;
