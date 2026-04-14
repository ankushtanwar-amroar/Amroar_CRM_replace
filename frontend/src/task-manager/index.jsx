/**
 * Task Manager Module - Main Entry
 * Jira-like task management system
 */
import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import TaskManagerLayout from './components/TaskManagerLayout';
import TaskManagerHome from './pages/TaskManagerHome';
import InboxPage from './pages/InboxPage';
import ProjectsPage from './pages/ProjectsPage';
import ProjectDetailPage from './pages/ProjectDetailPage';
import CalendarPage from './pages/CalendarPage';
import AutomationPage from './pages/AutomationPage';
import CustomFieldsPage from './pages/CustomFieldsPage';
import IntegrationsPage from './pages/IntegrationsPage';
import DashboardsPage from './pages/DashboardsPage';
import CustomDashboardsPage from './pages/CustomDashboardsPage';
import ValidationRulesPage from './pages/ValidationRulesPage';
import ApprovalWorkflowsPage from './pages/ApprovalWorkflowsPage';
import EmailTemplatesPage from './pages/EmailTemplatesPage';
import ApprovalAnalyticsPage from './pages/ApprovalAnalyticsPage';
import TaskTemplatesPage from './pages/TaskTemplatesPage';
import RecurringTasksPage from './pages/RecurringTasksPage';
import ReportsPage from './pages/ReportsPage';

const TaskManagerModule = () => {
  return (
    <TaskManagerLayout>
      <Routes>
        <Route path="/" element={<TaskManagerHome />} />
        <Route path="/inbox" element={<InboxPage />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/projects/:projectId" element={<ProjectDetailPage />} />
        <Route path="/projects/:projectId/:view" element={<ProjectDetailPage />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/automations" element={<AutomationPage />} />
        <Route path="/automation" element={<AutomationPage />} />
        <Route path="/custom-fields" element={<CustomFieldsPage />} />
        <Route path="/validation-rules" element={<ValidationRulesPage />} />
        <Route path="/approval-workflows" element={<ApprovalWorkflowsPage />} />
        <Route path="/email-templates" element={<EmailTemplatesPage />} />
        <Route path="/integrations" element={<IntegrationsPage />} />
        <Route path="/dashboards" element={<CustomDashboardsPage />} />
        <Route path="/dashboards-legacy" element={<DashboardsPage />} />
        <Route path="/approval-analytics" element={<ApprovalAnalyticsPage />} />
        <Route path="/templates" element={<TaskTemplatesPage />} />
        <Route path="/recurring-tasks" element={<RecurringTasksPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </TaskManagerLayout>
  );
};

export default TaskManagerModule;
