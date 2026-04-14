/**
 * Lightning Builder Module
 * 
 * This module provides a Salesforce-style Lightning Page Builder
 * for customizing CRM record detail page layouts.
 * 
 * Main exports:
 * - LightningPageBuilderPage: Route-based page component
 * - LayoutRenderer: Dynamic layout rendering component
 * - lightningLayoutService: API service for layout operations
 */

export { default as LightningPageBuilderPage } from './pages/LightningPageBuilderPage';
export { default as LayoutRenderer } from './components/LayoutRenderer';
export { default as lightningLayoutService } from './services/lightningLayoutService';
export { default as LightningPageBuilder } from './components/LightningPageBuilder';
export { default as ComponentLibrary } from './components/ComponentLibrary';
export { default as DropZone } from './components/DropZone';
export { default as ComponentPropertyEditor } from './components/ComponentPropertyEditor';
