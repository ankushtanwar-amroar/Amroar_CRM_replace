/**
 * EffectiveAccessView - Enhanced License & Permission View
 * 
 * Shows comprehensive access status for each module including:
 * - Module Name
 * - Permission Source
 * - License Status (Tenant Level)
 * - License Status (User Level)
 * - Final Access Result
 * 
 * This is the V1 implementation of the Effective Access view as specified
 * in the Runtime License Enforcement requirements.
 */
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Shield,
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader,
  Lock,
  Unlock,
  Key,
  Building2,
  User,
  FileKey,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Info
} from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription
} from '../../../components/ui/card';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../../../components/ui/tooltip';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

/**
 * Status indicator component
 */
const StatusIndicator = ({ passed, label, details }) => {
  const Icon = passed ? CheckCircle : XCircle;
  const colorClass = passed ? 'text-green-500' : 'text-red-500';
  const bgClass = passed ? 'bg-green-50' : 'bg-red-50';
  
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${bgClass}`}>
            <Icon className={`w-4 h-4 ${colorClass}`} />
            <span className="text-sm font-medium text-slate-700">{label}</span>
          </div>
        </TooltipTrigger>
        {details && (
          <TooltipContent>
            <p className="text-xs">{details}</p>
          </TooltipContent>
        )}
      </Tooltip>
    </TooltipProvider>
  );
};

/**
 * Module access card component
 */
const ModuleAccessCard = ({ module, expanded, onToggle }) => {
  const { checks, final_access, module_name, license_name, block_reason, block_reason_code } = module;
  
  const Icon = final_access ? Unlock : Lock;
  const statusColor = final_access ? 'border-green-200 bg-green-50/50' : 'border-red-200 bg-red-50/50';
  const iconColor = final_access ? 'text-green-600' : 'text-red-500';
  
  return (
    <div 
      className={`border rounded-lg overflow-hidden transition-all ${statusColor}`}
      data-testid={`module-access-card-${module.module_key}`}
    >
      {/* Module Header */}
      <div 
        className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-slate-50/50"
        onClick={onToggle}
      >
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
            final_access ? 'bg-green-100' : 'bg-red-100'
          }`}>
            <Icon className={`w-5 h-5 ${iconColor}`} />
          </div>
          <div>
            <h3 className="font-semibold text-slate-800">{module_name}</h3>
            <p className="text-xs text-slate-500">{license_name}</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <Badge 
            variant={final_access ? 'success' : 'destructive'}
            className={final_access ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}
          >
            {final_access ? 'Access Granted' : 'Access Blocked'}
          </Badge>
          {expanded ? (
            <ChevronDown className="w-5 h-5 text-slate-400" />
          ) : (
            <ChevronRight className="w-5 h-5 text-slate-400" />
          )}
        </div>
      </div>
      
      {/* Expanded Details */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-slate-200 bg-white">
          {/* Check Results Grid */}
          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
            {/* Tenant Version */}
            <div className="space-y-1">
              <p className="text-xs font-medium text-slate-500 uppercase">Platform Version</p>
              <StatusIndicator 
                passed={checks?.tenant_version?.passed}
                label={checks?.tenant_version?.current || 'N/A'}
                details={`Required: ${checks?.tenant_version?.required || 'v1.0.0'}`}
              />
            </div>
            
            {/* Tenant License */}
            <div className="space-y-1">
              <p className="text-xs font-medium text-slate-500 uppercase">Tenant License</p>
              <StatusIndicator 
                passed={checks?.tenant_license?.passed}
                label={checks?.tenant_license?.status || 'N/A'}
                details={checks?.tenant_license?.passed ? 'Your organization has purchased this module' : 'Organization needs to purchase this module'}
              />
            </div>
            
            {/* User License */}
            <div className="space-y-1">
              <p className="text-xs font-medium text-slate-500 uppercase">User License</p>
              <StatusIndicator 
                passed={checks?.user_license?.passed}
                label={checks?.user_license?.status || 'N/A'}
                details={checks?.user_license?.passed ? 'You have a license seat assigned' : 'No license seat assigned to you'}
              />
            </div>
            
            {/* Permission */}
            <div className="space-y-1">
              <p className="text-xs font-medium text-slate-500 uppercase">Permission</p>
              <StatusIndicator 
                passed={checks?.permission?.passed}
                label={checks?.permission?.source === 'super_admin' ? 'Super Admin' : 
                       checks?.permission?.source === 'admin_role' ? 'Admin Role' : 
                       checks?.permission?.passed ? 'Granted' : 'Missing'}
                details={checks?.permission?.source || 'Permission check'}
              />
            </div>
          </div>
          
          {/* Block Reason */}
          {!final_access && block_reason && (
            <div className="mt-4 flex items-start gap-2 p-3 bg-red-50 rounded-lg border border-red-200">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-800">Access Blocked</p>
                <p className="text-sm text-red-700 mt-1">{block_reason}</p>
                {block_reason_code && (
                  <p className="text-xs text-red-500 mt-1">Code: {block_reason_code}</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/**
 * Main Effective Access View Component
 */
const EffectiveAccessView = ({ userId = null }) => {
  const [accessData, setAccessData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedModules, setExpandedModules] = useState({});

  const fetchAccessData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        setError('Not authenticated');
        setLoading(false);
        return;
      }

      const url = userId 
        ? `${BACKEND_URL}/api/feature-access/user/${userId}/effective-access`
        : `${BACKEND_URL}/api/feature-access/effective-access`;

      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` }
      });

      setAccessData(response.data);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch effective access:', err);
      setError(err.response?.data?.detail || err.message || 'Failed to load access data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAccessData();
  }, [userId]);

  const toggleModule = (moduleKey) => {
    setExpandedModules(prev => ({
      ...prev,
      [moduleKey]: !prev[moduleKey]
    }));
  };

  const expandAll = () => {
    const allExpanded = {};
    accessData?.modules?.forEach(m => {
      allExpanded[m.module_key] = true;
    });
    setExpandedModules(allExpanded);
  };

  const collapseAll = () => {
    setExpandedModules({});
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader className="w-8 h-8 animate-spin text-blue-500" />
        <span className="ml-3 text-slate-600">Loading access information...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
        <h3 className="text-lg font-semibold text-slate-800 mb-2">Failed to Load</h3>
        <p className="text-slate-600 mb-4">{error}</p>
        <Button onClick={fetchAccessData} variant="outline">
          <RefreshCw className="w-4 h-4 mr-2" />
          Retry
        </Button>
      </div>
    );
  }

  if (!accessData) {
    return null;
  }

  // Separate modules by access status
  const accessibleModules = accessData.modules?.filter(m => m.final_access) || [];
  const blockedModules = accessData.modules?.filter(m => !m.final_access) || [];

  return (
    <div className="space-y-6" data-testid="effective-access-view">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Shield className="w-6 h-6 text-indigo-600" />
            Effective Access
          </h2>
          <p className="text-slate-600 mt-1">
            View your access permissions for each module
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={expandAll}>
            Expand All
          </Button>
          <Button variant="outline" size="sm" onClick={collapseAll}>
            Collapse All
          </Button>
          <Button variant="outline" size="sm" onClick={fetchAccessData}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <Building2 className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-slate-500">Organization</p>
                <p className="font-semibold text-slate-800">{accessData.tenant_name || 'N/A'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                <FileKey className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-xs text-slate-500">Plan</p>
                <p className="font-semibold text-slate-800 capitalize">{accessData.tenant_plan || 'N/A'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-xs text-slate-500">Accessible</p>
                <p className="font-semibold text-green-600">{accessibleModules.length} modules</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                <XCircle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <p className="text-xs text-slate-500">Restricted</p>
                <p className="font-semibold text-red-600">{blockedModules.length} modules</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Your Licenses */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Key className="w-5 h-5 text-indigo-600" />
            Your Assigned Licenses
          </CardTitle>
          <CardDescription>
            Licenses assigned to you from your organization's seat pool
          </CardDescription>
        </CardHeader>
        <CardContent>
          {accessData.user_licenses?.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {accessData.user_licenses.map(license => (
                <Badge key={license} variant="secondary" className="bg-indigo-100 text-indigo-700">
                  {license.replace(/_/g, ' ')}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500">No licenses assigned</p>
          )}
        </CardContent>
      </Card>

      {/* Accessible Modules */}
      {accessibleModules.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-500" />
            Accessible Modules ({accessibleModules.length})
          </h3>
          <div className="space-y-2">
            {accessibleModules.map(module => (
              <ModuleAccessCard 
                key={module.module_key}
                module={module}
                expanded={expandedModules[module.module_key]}
                onToggle={() => toggleModule(module.module_key)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Blocked Modules */}
      {blockedModules.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
            <XCircle className="w-5 h-5 text-red-500" />
            Restricted Modules ({blockedModules.length})
          </h3>
          <div className="space-y-2">
            {blockedModules.map(module => (
              <ModuleAccessCard 
                key={module.module_key}
                module={module}
                expanded={expandedModules[module.module_key]}
                onToggle={() => toggleModule(module.module_key)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Info Banner */}
      <div className="flex items-start gap-3 p-4 bg-blue-50 rounded-lg border border-blue-200">
        <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-blue-800">
          <p className="font-medium mb-1">About Effective Access</p>
          <p>
            Access to each module is determined by a 4-step check: Platform Version, Organization License, 
            User License, and Permissions. All four checks must pass for access to be granted.
            Contact your administrator if you need access to a restricted module.
          </p>
        </div>
      </div>
    </div>
  );
};

export default EffectiveAccessView;
