/**
 * DynamicRecordPageEngine - Enterprise-Grade Component Rendering System
 * 
 * This is the core engine that powers the runtime Record Detail Page.
 * It follows Salesforce Lightning architecture principles:
 * 
 * 1. Layout JSON = Single Source of Truth
 * 2. Component-based plug-and-play architecture
 * 3. Region-based rendering (header, left, main, right)
 * 4. Zero hardcoded layout logic
 * 
 * When builder configuration changes, runtime page reflects immediately
 * without any code modifications.
 */

// =============================================================================
// COMPONENT REGISTRY
// =============================================================================

/**
 * ComponentRegistry - Central registry for all available components
 * 
 * To add a new component:
 * 1. Create the component in ./components/
 * 2. Import it here
 * 3. Add to COMPONENT_REGISTRY with its ID
 * 
 * The engine will automatically render it when found in layout config
 */
export const COMPONENT_REGISTRY = {
  // Core Components
  path: 'PathComponent',
  activities: 'ActivitiesComponent',
  record_detail: 'RecordDetailComponent',
  related_lists: 'RelatedListsComponent',
  files: 'FilesComponent',
  
  // Future Components (placeholders)
  highlights_panel: 'HighlightsPanelComponent',
  tabs: 'TabsComponent',
  chatter: 'ChatterComponent',
  custom: 'CustomComponent',
};

/**
 * Get component by ID from registry
 * Returns the component name for dynamic import
 */
export const getComponentById = (componentId) => {
  return COMPONENT_REGISTRY[componentId] || null;
};

/**
 * Check if component is registered
 */
export const isComponentRegistered = (componentId) => {
  return componentId in COMPONENT_REGISTRY;
};

// =============================================================================
// LAYOUT PARSER
// =============================================================================

/**
 * Parse layout JSON into a normalized structure
 * Handles various layout formats from the API
 */
export const parseLayout = (layoutData) => {
  if (!layoutData) {
    return {
      layoutId: null,
      layoutName: 'Default Layout',
      templateType: 'three_column_header',
      regions: {
        header: [],
        left: [],
        main: [],
        right: [],
      },
      metadata: {},
    };
  }

  // Extract placed_components from layout
  const placedComponents = layoutData.placed_components || {};
  
  return {
    layoutId: layoutData.id,
    layoutName: layoutData.layout_name || 'Custom Layout',
    templateType: layoutData.selected_layout || layoutData.template_type || 'three_column_header',
    regions: {
      header: placedComponents.header || [],
      left: placedComponents.left || [],
      main: placedComponents.main || [],
      right: placedComponents.right || [],
    },
    metadata: {
      pageType: layoutData.page_type,
      objectName: layoutData.object_name,
      isSystem: layoutData.is_system,
    },
  };
};

/**
 * Get grid configuration based on which regions have content
 */
export const getGridConfiguration = (regions) => {
  const hasLeft = regions.left && regions.left.length > 0;
  const hasMain = regions.main && regions.main.length > 0;
  const hasRight = regions.right && regions.right.length > 0;

  // Determine grid template columns
  if (hasLeft && hasMain && hasRight) {
    return {
      gridTemplate: 'grid-cols-[280px_1fr_300px]',
      hasLeft: true,
      hasMain: true,
      hasRight: true,
    };
  } else if (hasLeft && hasMain) {
    return {
      gridTemplate: 'grid-cols-[280px_1fr]',
      hasLeft: true,
      hasMain: true,
      hasRight: false,
    };
  } else if (hasMain && hasRight) {
    return {
      gridTemplate: 'grid-cols-[1fr_300px]',
      hasLeft: false,
      hasMain: true,
      hasRight: true,
    };
  } else if (hasLeft && hasRight) {
    return {
      gridTemplate: 'grid-cols-[280px_1fr_300px]',
      hasLeft: true,
      hasMain: false,
      hasRight: true,
    };
  } else if (hasMain) {
    return {
      gridTemplate: 'grid-cols-1',
      hasLeft: false,
      hasMain: true,
      hasRight: false,
    };
  }
  
  return {
    gridTemplate: 'grid-cols-1',
    hasLeft: false,
    hasMain: false,
    hasRight: false,
  };
};

// =============================================================================
// CONTEXT BUILDER
// =============================================================================

/**
 * Build the context object passed to all components
 * This contains all the data components need to render
 */
export const buildComponentContext = ({
  record,
  objectName,
  objectSchema,
  layout,
  activities,
  relatedData,
  handlers,
}) => {
  return {
    // Record Data
    record,
    recordId: record?.id || record?.series_id,
    recordData: record?.data || {},
    
    // Object Info
    objectName,
    objectSchema,
    objectFields: objectSchema?.fields || {},
    
    // Layout Info
    layout,
    
    // Related Data
    activities: activities || [],
    relatedData: relatedData || {},
    
    // Handlers (callbacks for actions)
    onFieldSave: handlers?.onFieldSave,
    onRecordUpdate: handlers?.onRecordUpdate,
    onCreateActivity: handlers?.onCreateActivity,
    onCreateRelated: handlers?.onCreateRelated,
    onRefresh: handlers?.onRefresh,
    onOpenRecord: handlers?.onOpenRecord,
  };
};

// =============================================================================
// VALIDATION
// =============================================================================

/**
 * Validate field value based on field schema
 */
export const validateFieldValue = (value, fieldSchema) => {
  const errors = [];
  
  // Required validation
  if (fieldSchema?.required && (value === null || value === undefined || value === '')) {
    errors.push(`${fieldSchema.label || 'This field'} is required`);
  }
  
  // Email validation
  if (fieldSchema?.type === 'email' && value) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(value)) {
      errors.push('Invalid email format');
    }
  }
  
  // Number validation
  if (fieldSchema?.type === 'number' && value !== null && value !== undefined && value !== '') {
    if (isNaN(Number(value))) {
      errors.push('Must be a valid number');
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors,
  };
};

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  COMPONENT_REGISTRY,
  getComponentById,
  isComponentRegistered,
  parseLayout,
  getGridConfiguration,
  buildComponentContext,
  validateFieldValue,
};
