// Component Visibility Module - Main Export

// Types and Constants
export * from './types/visibilityTypes';

// Engine
export { 
  evaluateComponentVisibility, 
  isComponentVisible,
  evaluateMultipleComponents 
} from './engine/VisibilityRulesEngine';

// Components
export { default as VisibilityConditionBuilder } from './components/VisibilityConditionBuilder';

// Hooks
export { 
  useComponentVisibility,
  useComponentsVisibility,
  useFormFieldVisibility,
  checkVisibility
} from './hooks/useVisibilityEvaluation';

// Services
export { 
  getUserContext, 
  clearUserContext, 
  setUserContext,
  hasRole,
  hasPermission,
  isAdmin
} from './services/userContextService';

// Utils
export {
  createDefaultVisibility,
  createVisibilityWithConditions,
  isDefaultVisibility,
  hasVisibilityConditions,
  getFieldType,
  getPicklistOptions,
  formatFieldLabel,
  getConditionSummary,
  getVisibilitySummary,
  createVisibilityDebouncer,
  cloneVisibility,
  migrateVisibilityConfig,
} from './utils/visibilityUtils';
