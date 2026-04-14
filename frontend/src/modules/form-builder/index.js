/**
 * Form Builder Module
 * Contains all form builder related components, pages, and services
 */

// Pages
export { default as FormBuilderPage } from './pages/FormBuilderPage';
export { default as FormEditorPro } from './pages/FormEditorPro';
export { default as FormSubmissions } from './pages/FormSubmissions';
export { default as PublicFormViewPro } from './pages/PublicFormViewPro';
export { default as WebToLeadGenerator } from './pages/WebToLeadGenerator';

// Legacy pages (kept for backward compatibility)
export { default as FormEditor } from './pages/FormEditor';
export { default as PublicFormView } from './pages/PublicFormView';

// Services
export * as FormService from './services/formBuilderService';
