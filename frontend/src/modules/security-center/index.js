/**
 * Security Center Module
 * Main export file
 */

export { default as SecurityCenterPage } from './pages/SecurityCenterPage';
export { default as PermissionSetsList } from './pages/PermissionSetsList';
export { default as PermissionSetDetail } from './pages/PermissionSetDetail';
export { default as AssignPermissionSet } from './pages/AssignPermissionSet';
export { default as AuditLogsView } from './components/AuditLogsView';
export { default as PermissionsOverview } from './components/PermissionsOverview';
export { default as PermissionMatrix } from './components/PermissionMatrix';
export { default as permissionSetService } from './services/permissionSetService';
export { default as usePermissionSets } from './hooks/usePermissionSets';
