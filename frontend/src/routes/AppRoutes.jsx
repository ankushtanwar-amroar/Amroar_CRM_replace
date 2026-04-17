/**
 * AppRoutes - Centralized routing configuration
 * Extracted from App.js to improve maintainability
 */
import React from 'react';
import { Routes, Route, Navigate, useParams } from 'react-router-dom';

// Admin Module (Isolated Super Admin Portal)
import { AdminRoutes } from '../modules/admin';

// Module access gate
import ModuleGate from '../components/ModuleGate';

// Module context for dynamic catch-all redirect
import ModuleContext from '../context/ModuleContext';

/**
 * LegacyRouteRedirect - Redirects old /:objectName/:recordId/view to /crm/:objectName/:recordId
 * This component handles legacy URLs and redirects them to the new CRM routes
 */
const LegacyRouteRedirect = () => {
  const { objectName, recordId } = useParams();
  return <Navigate to={`/crm/${objectName}/${recordId}`} replace />;
};

// Form Builder Components
import FormBuilderPage from '../modules/form-builder/pages/FormBuilderPage';
import FormEditorPro from '../modules/form-builder/pages/FormEditorPro';
import FormSubmissions from '../modules/form-builder/pages/FormSubmissions';
import PublicFormViewPro from '../modules/form-builder/pages/PublicFormViewPro';
import WebToLeadGenerator from '../modules/form-builder/pages/WebToLeadGenerator';

// Flow Builder Components
import FlowListPage from '../pages/FlowBuilder/FlowListPage';
import FlowEditorPage from '../pages/FlowBuilder/FlowEditorPage';
import FlowInfoPage from '../pages/FlowBuilder/FlowInfoPage';
import ChooseAutomationType from '../pages/FlowBuilder/ChooseAutomationType';
import ChooseScreenFlowMode from '../pages/FlowBuilder/ChooseScreenFlowMode';
import ScreenFlowRunner from '../pages/FlowBuilder/ScreenFlowRunner';

// Data Operations - Import/Export Builder
import ImportWizard from '../pages/Setup/ImportBuilder/ImportWizard';
import ExportWizard from '../pages/Setup/ExportBuilder/ExportWizard';
import ExportBuilderIndex from '../pages/Setup/ExportBuilder/index';
import JobList from '../pages/Setup/Jobs/JobList';
import ImportJobDetail from '../pages/Setup/Jobs/ImportJobDetail';
import ExportJobDetail from '../pages/Setup/Jobs/ExportJobDetail';

// Chatbot Manager
import ChatbotDashboard from '../chatbot-manager/pages/ChatbotDashboard';
import BotWizard from '../chatbot-manager/pages/BotWizardNew';
import AnalyticsDashboard from '../chatbot-manager/pages/AnalyticsDashboard';
import DocFlowDashboard from '../docflow/pages/DocFlowDashboard';
import TemplateEditor from '../docflow/pages/TemplateEditor';
import PublicDocumentView from '../docflow/pages/PublicDocumentViewEnhanced';
import GenerateDocumentWizard from '../docflow/pages/GenerateDocumentWizard';
import PackageDetailPage from '../docflow/pages/PackageDetailPage';
import CreatePackagePage from '../docflow/pages/CreatePackagePage';
import SendPackagePage from '../docflow/pages/SendPackagePage';
import RunDetailPage from '../docflow/pages/RunDetailPage';
import PackagePublicView from '../docflow/pages/PackagePublicView';
import PackagePublicLinkView from '../docflow/pages/PackagePublicLinkView';

// Booking Module
import ServicesPage from '../booking/pages/ServicesPage';

// Record Inspector (Admin Utility) - Rendered globally, uses route detection
import RecordInspector from '../components/record/RecordInspector';
import StaffPage from '../booking/pages/StaffPage';
import CalendarPage from '../booking/pages/CalendarPage';
import DashboardPage from '../booking/pages/DashboardPage';
import BookingsPage from '../booking/pages/BookingsPage';
import PublicBooking from '../booking/pages/PublicBooking';
import WidgetGenerator from '../booking/pages/WidgetGenerator';
import ManageBooking from '../booking/pages/ManageBooking';

// Task Manager Module
import TaskManagerModule from '../task-manager';

// Survey Builder V2
import SurveyList from '../survey-builder-v2/pages/SurveyList';
import SurveyBuilder from '../survey-builder-v2/pages/SurveyBuilder';
import SurveyResponses from '../survey-builder-v2/pages/SurveyResponses';
import ResponseViewer from '../survey-builder-v2/pages/ResponseViewer';
import SurveyAnalytics from '../survey-builder-v2/pages/SurveyAnalytics';
import PublicSurveyView from '../survey-builder-v2/pages/PublicSurveyView';

// CRM Platform
import CRMPlatformPage from '../crm_platform/pages/CRMPlatformPage';
import ObjectManagerPage from '../crm_platform/pages/ObjectManagerPage';
import ObjectManagerListPage from '../crm_platform/pages/ObjectManagerListPage';
import ObjectManagerDetailPage from '../crm_platform/pages/ObjectManagerDetailPage';
import LightningPageBuilderPage from '../crm_platform/lightning_builder/pages/LightningPageBuilderPage';

// App Manager - Page Builder & Admin Pages
import { PageBuilder } from '../crm_platform/app_manager/page_builder';
import AppManagerListPage from '../crm_platform/app_manager/pages/AppManagerListPage';
import AppDetailPage from '../crm_platform/app_manager/pages/AppDetailPage';

// Email Templates Module
import EmailTemplatesPage from '../modules/email_templates/EmailTemplatesPage';
import EmailManagerPage from '../modules/email_templates/EmailManagerPage';

// Phase 1: User Management Pages
import AcceptInvitePage from '../auth-pages/AcceptInvitePage';
import ForgotPasswordPage from '../auth-pages/ForgotPasswordPage';
import ResetPasswordPage from '../auth-pages/ResetPasswordPage';
import UsersPage from '../setup/pages/UsersPage';
import UserDetailPage from '../pages/UserDetailPage';

// Step 5: Security Center Module
import SecurityCenterPage from '../modules/security-center/pages/SecurityCenterPage';

// Phase 7: Roles Module
import { RolesHierarchyPage } from '../modules/roles';

// Phase 8: Sharing Module
import { SharingSettingsPage } from '../modules/sharing';

// Phase 9: Field Security Module
import { FieldPermissionsPage } from '../modules/field-security';

// Phase 10: Groups & Queues Module
import { GroupsPage } from '../modules/groups';
import { QueuesPage } from '../modules/queues';

// Phase 11: Sharing Rules Module
import { SharingRulesPage } from '../modules/sharing-rules';

// Phase 12: Access Bundles Module (also used for Permission Bundles)
import { AccessBundlesPage } from '../modules/access-bundles';

// License Module
import { LicensePlansPage } from '../modules/license';

// Company Information
// CompanyInfoPage is rendered inside SetupPage, not as a standalone route

// Schema Builder Module (Isolated Admin Module)
import SchemaBuilderPage from '../schema-builder/pages/SchemaBuilderPage';
import SchemaPreviewPage from '../schema-builder/pages/SchemaPreviewPage';

// File Manager Module
import { FileManagerPage } from '../features/file-manager';
import FileManagerAdminPage from '../features/file-manager/pages/FileManagerAdminPage';

// Search Configuration Module
import { SearchMetadataAdminPage } from '../features/search-config';

// Notifications Module
import { NotificationPreferencesPage } from '../modules/notifications';

// Import components defined in App.js
import {
  ProtectedRoute,
  RootRouteHandler,
  AuthForm,
} from '../App';

// Import SetupPage from its own file
import SetupPage from '../pages/Setup/SetupPage';

// Import Connections Page
// import ConnectionsPage from '../pages/Setup/connections/ConnectionsPage'; 
// Import Billing Page
import BillingPage from '../pages/Setup/BillingPage';

// Import Search Results Page
import SearchResultsPage from '../pages/SearchResultsPage';

/**
 * Application Routes Component
 * Contains all route definitions
 */
const AppRoutes = () => {
  return (
    <>
    <Routes>
      {/* Super Admin Portal Routes - Completely isolated */}
      <Route path="/admin/*" element={<AdminRoutes />} />

      {/* Public route - NO authentication required */}
      <Route path="/form/:formId" element={<PublicFormViewPro />} />

      <Route path="/auth" element={<AuthForm />} />
      <Route path="/login" element={<AuthForm />} />
      <Route path="/" element={
        <ProtectedRoute>
          <RootRouteHandler />
        </ProtectedRoute>
      } />
      <Route path="/setup" element={
        <ProtectedRoute>
          <SetupPage />
        </ProtectedRoute>
      } />
      <Route path="/setup/*" element={
        <ProtectedRoute>
          <SetupPage />
        </ProtectedRoute>
      } />
      <Route path="/setup/users" element={
        <ProtectedRoute>
          <UsersPage />
        </ProtectedRoute>
      } />
      <Route path="/users/:userId" element={
        <ProtectedRoute>
          <UserDetailPage />
        </ProtectedRoute>
      } />
      <Route path="/setup/security-center/*" element={
        <ProtectedRoute>
          <SecurityCenterPage />
        </ProtectedRoute>
      } />
      <Route path="/setup/roles-hierarchy" element={
        <ProtectedRoute>
          <RolesHierarchyPage />
        </ProtectedRoute>
      } />
      <Route path="/setup/public-groups" element={
        <ProtectedRoute>
          <GroupsPage />
        </ProtectedRoute>
      } />
      <Route path="/setup/queues" element={
        <ProtectedRoute>
          <QueuesPage />
        </ProtectedRoute>
      } />
      <Route path="/setup/sharing-settings" element={
        <ProtectedRoute>
          <SharingSettingsPage />
        </ProtectedRoute>
      } />
      <Route path="/setup/sharing-rules" element={
        <ProtectedRoute>
          <SharingRulesPage />
        </ProtectedRoute>
      } />
      <Route path="/setup/access-bundles" element={
        <ProtectedRoute>
          <AccessBundlesPage />
        </ProtectedRoute>
      } />
      {/* Permission Bundles - alias for Access Bundles with new naming */}
      <Route path="/setup/permission-bundles" element={
        <ProtectedRoute>
          <AccessBundlesPage />
        </ProtectedRoute>
      } />
      {/* License & Plans */}
      <Route path="/setup/license-plans" element={
        <ProtectedRoute>
          <LicensePlansPage />
        </ProtectedRoute>
      } />
      {/* Company Information - rendered inside SetupPage via wildcard */}
      <Route path="/setup/field-permissions/:roleId" element={
        <ProtectedRoute>
          <FieldPermissionsPage />
        </ProtectedRoute>
      } />
      <Route path="/setup/email-templates" element={
        <ProtectedRoute>
          <EmailTemplatesPage />
        </ProtectedRoute>
      } />
      <Route path="/setup/email-drafts" element={
        <ProtectedRoute>
          <EmailManagerPage />
        </ProtectedRoute>
      } />
      
      {/* Billing / Plans Page */}
      <Route path="/setup/billing" element={
        <ProtectedRoute>
          <BillingPage />
        </ProtectedRoute>
      } />
      
      {/* Schema Builder Module (Isolated Admin Module) */}
      <Route path="/setup/schema-builder" element={
        <ProtectedRoute>
          <SchemaBuilderPage />
        </ProtectedRoute>
      } />
      <Route path="/setup/schema-builder/preview" element={
        <ProtectedRoute>
          <SchemaPreviewPage />
        </ProtectedRoute>
      } />
      <Route path="/setup/schema-builder/:objectId" element={
        <ProtectedRoute>
          <SchemaBuilderPage />
        </ProtectedRoute>
      } />
      
      {/* Search Configuration - Configure Search Metadata */}
      <Route path="/setup/features/configure-search" element={
        <ProtectedRoute>
          <SearchMetadataAdminPage />
        </ProtectedRoute>
      } />
      
      {/* Notification Configuration */}
      <Route path="/setup/notification-configuration" element={
        <ProtectedRoute>
          <NotificationPreferencesPage />
        </ProtectedRoute>
      } />
      
      {/* Data Operations - Import/Export Builder */}
      <Route path="/setup/import-builder" element={
        <ProtectedRoute>
          <ImportWizard />
        </ProtectedRoute>
      } />
      <Route path="/setup/import-builder/:jobId" element={
        <ProtectedRoute>
          <ImportWizard />
        </ProtectedRoute>
      } />
      <Route path="/setup/export-builder" element={
        <ProtectedRoute>
          <ExportBuilderIndex />
        </ProtectedRoute>
      } />
      <Route path="/setup/export-builder/wizard" element={
        <ProtectedRoute>
          <ExportWizard />
        </ProtectedRoute>
      } />
      <Route path="/setup/export-builder/:jobId" element={
        <ProtectedRoute>
          <ExportWizard />
        </ProtectedRoute>
      } />
      <Route path="/setup/jobs" element={
        <ProtectedRoute>
          <JobList />
        </ProtectedRoute>
      } />
      <Route path="/setup/jobs/import/:jobId" element={
        <ProtectedRoute>
          <ImportJobDetail />
        </ProtectedRoute>
      } />
      <Route path="/setup/jobs/export/:jobId" element={
        <ProtectedRoute>
          <ExportJobDetail />
        </ProtectedRoute>
      } />
      
      {/* Phase 1: Public auth pages (no protection) */}
      <Route path="/accept-invite/:token" element={<AcceptInvitePage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password/:token" element={<ResetPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      
      {/* Legacy route redirect - /:objectName/:recordId/view -> /crm/:objectName/:recordId */}
      <Route path="/:objectName/:recordId/view" element={
        <LegacyRouteRedirect />
      } />
      
      <Route path="/flows" element={
        <ProtectedRoute>
          <ModuleGate moduleCode="flow_builder">
            <FlowListPage />
          </ModuleGate>
        </ProtectedRoute>
      } />
      <Route path="/form-builder" element={
        <ProtectedRoute>
          <ModuleGate moduleCode="form_builder">
            <FormBuilderPage />
          </ModuleGate>
        </ProtectedRoute>
      } />
      <Route path="/form-builder/editor/:formId?" element={
        <ProtectedRoute>
          <ModuleGate moduleCode="form_builder">
            <FormEditorPro />
          </ModuleGate>
        </ProtectedRoute>
      } />
      <Route path="/form-builder/submissions/:formId" element={
        <ProtectedRoute>
          <ModuleGate moduleCode="form_builder">
            <FormSubmissions />
          </ModuleGate>
        </ProtectedRoute>
      } />
      <Route path="/form-builder/web-to-lead" element={
        <ProtectedRoute>
          <ModuleGate moduleCode="form_builder">
            <WebToLeadGenerator />
          </ModuleGate>
        </ProtectedRoute>
      } />
     
      <Route path="/flows/new" element={
        <ProtectedRoute>
          <ModuleGate moduleCode="flow_builder">
            <ChooseAutomationType />
          </ModuleGate>
        </ProtectedRoute>
      } />
      <Route path="/flows/new/screen-mode" element={
        <ProtectedRoute>
          <ModuleGate moduleCode="flow_builder">
            <ChooseScreenFlowMode />
          </ModuleGate>
        </ProtectedRoute>
      } />
      <Route path="/flows/:flowId/edit" element={
        <ProtectedRoute>
          <ModuleGate moduleCode="flow_builder">
            <FlowEditorPage />
          </ModuleGate>
        </ProtectedRoute>
      } />
      <Route path="/flows/:flowId/info" element={
        <ProtectedRoute>
          <ModuleGate moduleCode="flow_builder">
            <FlowInfoPage />
          </ModuleGate>
        </ProtectedRoute>
      } />
      <Route path="/flows/:flowId/run" element={
        <ProtectedRoute>
          <ModuleGate moduleCode="flow_builder">
            <ScreenFlowRunner />
          </ModuleGate>
        </ProtectedRoute>
      } />
      
      {/* Chatbot Manager Routes */}
      <Route path="/setup/chatbot-manager" element={
        <ProtectedRoute>
          <ModuleGate moduleCode="chatbot_manager">
            <ChatbotDashboard />
          </ModuleGate>
        </ProtectedRoute>
      } />
      <Route path="/setup/chatbot-manager/create" element={
        <ProtectedRoute>
          <ModuleGate moduleCode="chatbot_manager">
            <BotWizard />
          </ModuleGate>
        </ProtectedRoute>
      } />
      <Route path="/setup/chatbot-manager/edit/:botId" element={
        <ProtectedRoute>
          <ModuleGate moduleCode="chatbot_manager">
            <BotWizard />
          </ModuleGate>
        </ProtectedRoute>
      } />
      <Route path="/setup/chatbot-manager/analytics/:botId" element={
        <ProtectedRoute>
          <ModuleGate moduleCode="chatbot_manager">
            <AnalyticsDashboard />
          </ModuleGate>
        </ProtectedRoute>
      } />
      
      {/* DocFlow Routes */}
      <Route path="/setup/docflow" element={
        <ProtectedRoute>
          <ModuleGate moduleCode="docflow">
            <DocFlowDashboard />
          </ModuleGate>
        </ProtectedRoute>
      } />
      <Route path="/setup/docflow/templates/new" element={
        <ProtectedRoute>
          <ModuleGate moduleCode="docflow">
            <TemplateEditor />
          </ModuleGate>
        </ProtectedRoute>
      } />
      <Route path="/setup/docflow/templates/:templateId" element={
        <ProtectedRoute>
          <ModuleGate moduleCode="docflow">
            <TemplateEditor />
          </ModuleGate>
        </ProtectedRoute>
      } />
      <Route path="/setup/docflow/documents/generate" element={
        <ProtectedRoute>
          <ModuleGate moduleCode="docflow">
            <GenerateDocumentWizard />
          </ModuleGate>
        </ProtectedRoute>
      } />
      
      {/* Public DocFlow Routes (no auth) */}
      <Route path="/docflow/view/:token" element={<PublicDocumentView />} />
      <Route path="/docflow/package/:packageId/view/:token" element={<PackagePublicView />} />
      <Route path="/docflow/package/:packageId/public/:token" element={<PackagePublicLinkView />} />

      {/* DocFlow Package Routes */}
      <Route path="/setup/docflow/packages/create" element={
        <ProtectedRoute>
          <ModuleGate moduleCode="docflow">
            <CreatePackagePage />
          </ModuleGate>
        </ProtectedRoute>
      } />
      <Route path="/setup/docflow/packages/:packageId/send" element={
        <ProtectedRoute>
          <ModuleGate moduleCode="docflow">
            <SendPackagePage />
          </ModuleGate>
        </ProtectedRoute>
      } />
      <Route path="/setup/docflow/packages/:packageId/runs/:runId" element={
        <ProtectedRoute>
          <ModuleGate moduleCode="docflow">
            <RunDetailPage />
          </ModuleGate>
        </ProtectedRoute>
      } />
      <Route path="/setup/docflow/packages/:packageId" element={
        <ProtectedRoute>
          <ModuleGate moduleCode="docflow">
            <PackageDetailPage />
          </ModuleGate>
        </ProtectedRoute>
      } />
      
      {/* Booking Routes */}
      <Route path="/booking" element={
        <ProtectedRoute>
          <ModuleGate moduleCode="booking">
            <DashboardPage />
          </ModuleGate>
        </ProtectedRoute>
      } />
      <Route path="/booking/bookings" element={
        <ProtectedRoute>
          <ModuleGate moduleCode="booking">
            <BookingsPage />
          </ModuleGate>
        </ProtectedRoute>
      } />
      <Route path="/booking/services" element={
        <ProtectedRoute>
          <ModuleGate moduleCode="booking">
            <ServicesPage />
          </ModuleGate>
        </ProtectedRoute>
      } />
      <Route path="/booking/staff" element={
        <ProtectedRoute>
          <ModuleGate moduleCode="booking">
            <StaffPage />
          </ModuleGate>
        </ProtectedRoute>
      } />
      <Route path="/booking/calendar" element={
        <ProtectedRoute>
          <ModuleGate moduleCode="booking">
            <CalendarPage />
          </ModuleGate>
        </ProtectedRoute>
      } />
      <Route path="/booking/widget" element={
        <ProtectedRoute>
          <ModuleGate moduleCode="booking">
            <WidgetGenerator />
          </ModuleGate>
        </ProtectedRoute>
      } />
      
      {/* Public Booking Page (No Auth Required) */}
      <Route path="/booking/:tenantId" element={<PublicBooking />} />
      <Route path="/booking/manage/:bookingId" element={<ManageBooking />} />

      {/* CRM Platform Routes */}
      {/* Global Search Results Page */}
      <Route path="/search" element={
        <ProtectedRoute>
          <SearchResultsPage />
        </ProtectedRoute>
      } />
      
      {/* CRM Platform - Gated by crm module */}
      <Route path="/crm-platform" element={
        <ProtectedRoute>
          <ModuleGate moduleCode="crm">
            <CRMPlatformPage />
          </ModuleGate>
        </ProtectedRoute>
      } />
      
      {/* CRM Deep-link Routes - Object list and record views */}
      <Route path="/crm" element={
        <ProtectedRoute>
          <ModuleGate moduleCode="crm">
            <CRMPlatformPage />
          </ModuleGate>
        </ProtectedRoute>
      } />
      <Route path="/crm/:objectType" element={
        <ProtectedRoute>
          <ModuleGate moduleCode="crm">
            <CRMPlatformPage />
          </ModuleGate>
        </ProtectedRoute>
      } />
      <Route path="/crm/:objectType/:recordId" element={
        <ProtectedRoute>
          <ModuleGate moduleCode="crm">
            <CRMPlatformPage />
          </ModuleGate>
        </ProtectedRoute>
      } />
      
      <Route path="/crm-platform/object-manager" element={
        <ProtectedRoute>
          <ModuleGate moduleCode="crm">
            <ObjectManagerPage tenantId={localStorage.getItem('tenant_id')} />
          </ModuleGate>
        </ProtectedRoute>
      } />
      
      {/* Salesforce-style Object Manager */}
      <Route path="/object-manager" element={
        <ProtectedRoute>
          <ModuleGate moduleCode="crm">
            <ObjectManagerListPage />
          </ModuleGate>
        </ProtectedRoute>
      } />
      <Route path="/object-manager/:objectName" element={
        <ProtectedRoute>
          <ModuleGate moduleCode="crm">
            <ObjectManagerDetailPage />
          </ModuleGate>
        </ProtectedRoute>
      } />
      <Route path="/crm-platform/lightning-builder" element={
        <ProtectedRoute>
          <ModuleGate moduleCode="crm">
            <LightningPageBuilderPage />
          </ModuleGate>
        </ProtectedRoute>
      } />

      {/* App Manager - Page Builder */}
      <Route path="/setup/page-builder/:pageId" element={
        <ProtectedRoute>
          <PageBuilder />
        </ProtectedRoute>
      } />

      {/* App Manager - Admin Pages */}
      <Route path="/setup/app-manager" element={
        <ProtectedRoute>
          <AppManagerListPage />
        </ProtectedRoute>
      } />
      <Route path="/setup/app-manager/:appId" element={
        <ProtectedRoute>
          <AppDetailPage />
        </ProtectedRoute>
      } />

      {/* Survey Builder V2 Routes */}
      <Route path="/survey-builder-v2" element={
        <ProtectedRoute>
          <SurveyList />
        </ProtectedRoute>
      } />
      <Route path="/survey-builder-v2/builder/:surveyId" element={
        <ProtectedRoute>
          <SurveyBuilder />
        </ProtectedRoute>
      } />
      <Route path="/survey-builder-v2/responses/:surveyId" element={
        <ProtectedRoute>
          <SurveyResponses />
        </ProtectedRoute>
      } />
      <Route path="/survey-builder-v2/responses/:surveyId/view/:responseId" element={
        <ProtectedRoute>
          <ResponseViewer />
        </ProtectedRoute>
      } />
      <Route path="/survey-builder-v2/analytics/:surveyId" element={
        <ProtectedRoute>
          <SurveyAnalytics />
        </ProtectedRoute>
      } />

      {/* Public Survey View */}
      <Route path="/survey-public/:publicLink" element={<PublicSurveyView />} />

      {/* Task Manager Module */}
      <Route path="/task-manager/*" element={
        <ProtectedRoute>
          <TaskManagerModule />
        </ProtectedRoute>
      } />

      {/* File Manager Module */}
      <Route path="/files" element={
        <ProtectedRoute>
          <FileManagerPage />
        </ProtectedRoute>
      } />
      <Route path="/files/*" element={
        <ProtectedRoute>
          <FileManagerPage />
        </ProtectedRoute>
      } />
      
      {/* File Manager Admin Setup */}
      <Route path="/setup/file-manager" element={
        <ProtectedRoute>
          <FileManagerAdminPage />
        </ProtectedRoute>
      } />
      
      <Route path="*" element={<DynamicCatchAll />} />
    </Routes>
    
    {/* Record Inspector - Global Admin Utility (uses route detection internally) */}
    <RecordInspector />
  </>
  );
};

/**
 * DynamicCatchAll - Redirects unknown routes to tenant's default landing page
 */
const DynamicCatchAll = () => {
  const ctx = React.useContext(ModuleContext);
  const landing = ctx?.defaultLandingPage || '/crm-platform';
  return <Navigate to={landing} replace />;
};

export default AppRoutes;
