/**
 * Admin Routes Component
 * Defines all routes for the Admin Portal (Control Plane)
 * Completely isolated from CRM routes
 */
import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AdminAuthProvider, useAdminAuth } from './auth/AdminAuthContext';
import AdminLoginPage from './auth/AdminLoginPage';
import AdminLayout from './layout/AdminLayout';
import AdminDashboard from './AdminDashboard';
import { TenantsPage, TenantDetailPage, CreateTenantPage } from './tenants';
import { UsersPage } from './users';
import { SubscriptionsPage } from './subscriptions';
import { ModulesPage } from './modules';
import { LicenseCatalogPage } from './licenses';
import { ReleasesPage } from './releases';
import { AuditLogsPage } from './audit';
import { TenantUsagePage } from './quotas';
import { IntegrationsPage } from './integrations';
import { PlaceholderPage } from './components';
import { Gauge } from 'lucide-react';
import { Loader2 } from 'lucide-react';

/**
 * Protected Route for Admin Portal
 * Only allows authenticated platform administrators
 */
const AdminProtectedRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAdminAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
          <p className="text-slate-600">Loading Admin Portal...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/admin/login" replace />;
  }

  return children;
};

/**
 * Admin Routes Definition
 */
const AdminRoutesContent = () => {
  return (
    <Routes>
      {/* Public admin routes */}
      <Route path="/login" element={<AdminLoginPage />} />
      
      {/* Protected admin routes */}
      <Route
        path="/"
        element={
          <AdminProtectedRoute>
            <AdminLayout />
          </AdminProtectedRoute>
        }
      >
        {/* Dashboard */}
        <Route index element={<AdminDashboard />} />
        
        {/* Tenant Management */}
        <Route path="tenants" element={<TenantsPage />} />
        <Route path="tenants/create" element={<CreateTenantPage />} />
        <Route path="tenants/:tenantId" element={<TenantDetailPage />} />
        <Route path="tenants/:tenantId/edit" element={
          <PlaceholderPage 
            title="Edit Tenant" 
            description="Edit tenant details"
          />
        } />
        <Route path="tenants/:tenantId/usage" element={<TenantUsagePage />} />
        
        {/* Users (Platform Monitoring) */}
        <Route path="users" element={<UsersPage />} />
        
        {/* Platform Configuration */}
        <Route path="license-catalog" element={<LicenseCatalogPage />} />
        <Route path="releases" element={<ReleasesPage />} />
        <Route path="subscriptions" element={<SubscriptionsPage />} />
        <Route path="modules" element={<ModulesPage />} />
        <Route path="integrations" element={<IntegrationsPage />} />
        <Route path="quotas" element={
          <PlaceholderPage 
            title="Limits & Quotas" 
            description="Configure platform-wide usage limits and quotas"
            icon={Gauge}
          />
        } />
        
        {/* Operations */}
        <Route path="audit-logs" element={<AuditLogsPage />} />
      </Route>

      {/* Catch all - redirect to dashboard */}
      <Route path="*" element={<Navigate to="/admin" replace />} />
    </Routes>
  );
};

/**
 * Admin Routes with Auth Provider
 */
const AdminRoutes = () => {
  return (
    <AdminAuthProvider>
      <AdminRoutesContent />
    </AdminAuthProvider>
  );
};

export default AdminRoutes;
