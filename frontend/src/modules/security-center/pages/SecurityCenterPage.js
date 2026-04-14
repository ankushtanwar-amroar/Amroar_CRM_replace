import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Shield, FileText, Lock, Users, ArrowLeft, Key } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import AuditLogsView from '../components/AuditLogsView';
import PermissionsOverview from '../components/PermissionsOverview';
import PermissionSetsList from './PermissionSetsList';
import PermissionSetDetail from './PermissionSetDetail';
import PermissionSetEditor from './PermissionSetEditor';
import AssignPermissionSet from './AssignPermissionSet';
import EffectiveAccessView from '../../../pages/Setup/security-center/EffectiveAccessView';

const SecurityCenterPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  
  // Get current section from URL path
  const pathParts = location.pathname.split('/security-center/')[1] || 'audit-logs';
  const selectedSection = pathParts.split('/')[0];

  const renderContent = () => {
    // Handle Permission Set routes
    if (location.pathname.includes('/permission-sets/assign')) {
      return <AssignPermissionSet />;
    } else if (location.pathname.includes('/permission-sets/new')) {
      return <PermissionSetEditor />;
    } else if (location.pathname.match(/\/permission-sets\/[^/]+\/edit$/)) {
      return <PermissionSetEditor />;
    } else if (location.pathname.match(/\/permission-sets\/[^/]+$/)) {
      return <PermissionSetDetail />;
    }
    
    switch (selectedSection) {
      case 'audit-logs':
        return <AuditLogsView />;
      case 'permissions':
        return <PermissionsOverview />;
      case 'permission-sets':
        return <PermissionSetsList />;
      case 'effective-access':
        return <EffectiveAccessView />;
      default:
        return <AuditLogsView />;
    }
  };

  return (
    <div className="flex h-full">
      {/* Left Sidebar Navigation */}
      <aside className="w-64 bg-white border-r overflow-y-auto">
        <div className="p-4">
          <div className="mb-4">
            <button
            onClick={() => navigate('/setup')}
            className="flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors mb-2"
            data-testid="back-to-setup-btn"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="text-sm font-medium">Back to Setup</span>
          </button>
            <div className="flex items-center space-x-2 mb-2">
              <Shield className="h-5 w-5 text-indigo-600" />
              <h2 className="font-semibold text-slate-900">Security Center</h2>
            </div>
            <p className="text-xs text-slate-500">Manage security and audit settings</p>
          </div>
          
          <div className="space-y-1">
            <Button
              variant={selectedSection === 'audit-logs' ? 'secondary' : 'ghost'}
              className={`w-full justify-start h-9 text-sm ${
                selectedSection === 'audit-logs'
                  ? 'bg-indigo-50 text-indigo-700 border-l-2 border-indigo-600'
                  : 'text-slate-700 hover:bg-slate-50'
              }`}
              onClick={() => navigate('/setup/security-center/audit-logs')}
            >
              <FileText className="h-4 w-4 mr-2" />
              Audit Logs
            </Button>
            
            <Button
              variant={selectedSection === 'permissions' ? 'secondary' : 'ghost'}
              className={`w-full justify-start h-9 text-sm ${
                selectedSection === 'permissions'
                  ? 'bg-indigo-50 text-indigo-700 border-l-2 border-indigo-600'
                  : 'text-slate-700 hover:bg-slate-50'
              }`}
              onClick={() => navigate('/setup/security-center/permissions')}
            >
              <Lock className="h-4 w-4 mr-2" />
              Permissions Overview
            </Button>
            
            <Button
              variant={selectedSection === 'permission-sets' ? 'secondary' : 'ghost'}
              className={`w-full justify-start h-9 text-sm ${
                selectedSection === 'permission-sets'
                  ? 'bg-indigo-50 text-indigo-700 border-l-2 border-indigo-600'
                  : 'text-slate-700 hover:bg-slate-50'
              }`}
              onClick={() => navigate('/setup/security-center/permission-sets')}
            >
              <Users className="h-4 w-4 mr-2" />
              Permission Sets
            </Button>
            
            <Button
              variant={selectedSection === 'effective-access' ? 'secondary' : 'ghost'}
              className={`w-full justify-start h-9 text-sm ${
                selectedSection === 'effective-access'
                  ? 'bg-indigo-50 text-indigo-700 border-l-2 border-indigo-600'
                  : 'text-slate-700 hover:bg-slate-50'
              }`}
              onClick={() => navigate('/setup/security-center/effective-access')}
              data-testid="effective-access-link"
            >
              <Key className="h-4 w-4 mr-2" />
              Effective Access
            </Button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 bg-slate-50 overflow-y-auto">
        <div className="p-8">
          {renderContent()}
        </div>
      </main>
    </div>
  );
};

export default SecurityCenterPage;