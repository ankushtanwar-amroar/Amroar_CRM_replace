/**
 * Dependent Picklists Module
 * Provides configuration UI and runtime hooks for dependent picklist behavior
 */

// Components
export { default as DependentPicklistsConfig } from './components/DependentPicklistsConfig';
export { default as DependentPicklistMappingEditor } from './components/DependentPicklistMappingEditor';
export { default as DependentPicklistSelector } from './components/DependentPicklistSelector';

// Hooks
export { useDependentPicklists } from './hooks/useDependentPicklists';
export { useDependentPicklistRuntime } from './hooks/useDependentPicklistRuntime';

// Services
export { default as dependentPicklistService } from './services/dependentPicklistService';
