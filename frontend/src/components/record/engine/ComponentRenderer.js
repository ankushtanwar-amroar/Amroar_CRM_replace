/**
 * ComponentRenderer - Dynamic Component Mapping Engine
 * 
 * This is the core rendering engine that maps layout JSON to React components.
 * It acts as the bridge between Lightning App Builder configuration and runtime UI.
 * 
 * Architecture:
 * Layout JSON → Component Mapper → Dynamic Renderer
 * 
 * Supported Components:
 * - path: Stage/Progress Path component
 * - activities: Activity Timeline component
 * - record_detail: Record fields with inline editing
 * - related_lists: Related records panels
 * - tabs: Tabbed content
 * - actions: Quick action buttons (layout-driven)
 * - chatter: Feed/comments
 * - highlights_panel: Key metrics
 * - related_list_quick_links: Quick links to related records
 * - blank_space: Empty spacer
 * - audit_trail: Audit history for the record
 */
import React from 'react';
import PathComponent from './renderers/PathComponent';
import ActivitiesComponent from './renderers/ActivitiesComponent';
import RecordDetailComponent from './renderers/RecordDetailComponent';
import RelatedListsComponent from './renderers/RelatedListsComponent';
import ActionsComponent from '../../../crm_platform/engine/components/ActionsComponent';
import TabsComponent from '../../../crm_platform/engine/components/TabsComponent';
import ChatterComponent from '../../../crm_platform/engine/components/ChatterComponent';
import HighlightsPanelComponent from '../../../crm_platform/engine/components/HighlightsPanelComponent';
import RelatedListQuickLinksComponent from '../../../crm_platform/engine/components/RelatedListQuickLinksComponent';
import BlankSpaceComponent from '../../../crm_platform/engine/components/BlankSpaceComponent';
import AuditTrailComponent from './renderers/AuditTrailComponent';

// Component Registry - Maps component IDs to React components
const COMPONENT_REGISTRY = {
  path: PathComponent,
  activities: ActivitiesComponent,
  record_detail: RecordDetailComponent,
  related_lists: RelatedListsComponent,
  actions: ActionsComponent,
  tabs: TabsComponent,
  chatter: ChatterComponent,
  feed: ChatterComponent,
  highlights_panel: HighlightsPanelComponent,
  dynamic_highlights_panel: HighlightsPanelComponent,
  compact_layout: HighlightsPanelComponent,
  related_list_quick_links: RelatedListQuickLinksComponent,
  blank_space: BlankSpaceComponent,
  spacer: BlankSpaceComponent,
  audit_trail: AuditTrailComponent,
};

/**
 * Render a single component based on its type and config
 */
export const renderComponent = (component, context) => {
  if (!component || !component.id) {
    console.warn('Invalid component:', component);
    return null;
  }

  const ComponentType = COMPONENT_REGISTRY[component.id];

  if (!ComponentType) {
    console.warn(`Unknown component type: ${component.id}`);
    return (
      <div 
        key={component.instanceId} 
        className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-700 text-sm"
      >
        Unknown component: {component.id}
      </div>
    );
  }

  return (
    <ComponentType
      key={component.instanceId}
      instanceId={component.instanceId}
      config={component.config || {}}
      {...context}
    />
  );
};

/**
 * Render all components in a region
 */
export const renderRegion = (components = [], context) => {
  if (!components || components.length === 0) {
    return null;
  }

  return components.map((component) => renderComponent(component, context));
};

/**
 * Check if a region has any components
 */
export const regionHasComponents = (placedComponents, regionId) => {
  const region = placedComponents?.[regionId];
  return region && Array.isArray(region) && region.length > 0;
};

/**
 * Get the layout template grid configuration
 */
export const getLayoutGridConfig = (templateType, placedComponents) => {
  const hasLeft = regionHasComponents(placedComponents, 'left');
  const hasRight = regionHasComponents(placedComponents, 'right');
  const hasMain = regionHasComponents(placedComponents, 'main');

  switch (templateType) {
    case 'three_column_header':
      // Dynamic grid based on which regions have content
      if (hasLeft && hasMain && hasRight) {
        return 'grid-cols-[240px_1fr_300px]';
      } else if (hasLeft && hasMain) {
        return 'grid-cols-[240px_1fr]';
      } else if (hasMain && hasRight) {
        return 'grid-cols-[1fr_300px]';
      } else if (hasLeft && hasRight) {
        return 'grid-cols-[240px_1fr_300px]';
      } else {
        return 'grid-cols-1';
      }

    case 'two_column_left':
      return hasLeft ? 'grid-cols-[280px_1fr]' : 'grid-cols-1';

    case 'two_column_right':
      return hasRight ? 'grid-cols-[1fr_300px]' : 'grid-cols-1';

    case 'single_column':
    default:
      return 'grid-cols-1';
  }
};

export default {
  renderComponent,
  renderRegion,
  regionHasComponents,
  getLayoutGridConfig,
  COMPONENT_REGISTRY,
};
