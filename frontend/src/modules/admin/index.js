/**
 * Admin Module Index
 * Exports all admin module components
 */
export { default as AdminRoutes } from './AdminRoutes';
export { AdminAuthProvider, useAdminAuth } from './auth/AdminAuthContext';
export { default as AdminLoginPage } from './auth/AdminLoginPage';
export { default as AdminLayout } from './layout/AdminLayout';
export { default as AdminDashboard } from './AdminDashboard';
export { TenantsPage } from './tenants';
export { PlaceholderPage } from './components';
