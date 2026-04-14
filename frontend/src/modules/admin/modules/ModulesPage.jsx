/**
 * Module Entitlements Page - Admin Portal
 * Enable/disable CRM modules per tenant
 */
import React, { useState, useEffect } from 'react';
import { useAdminAuth } from '../auth/AdminAuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Badge } from '../../../components/ui/badge';
import { Switch } from '../../../components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../../components/ui/dialog';
import {
  Boxes,
  Search,
  Loader2,
  CheckCircle,
  XCircle,
  Building2,
  Zap,
  Settings,
  Shield,
  BarChart3,
  FileText,
  Calendar,
  MessageSquare,
  Bot,
  Sparkles,
  Key,
} from 'lucide-react';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const ADMIN_API = `${BACKEND_URL}/api/admin`;

// Module icons mapping - matches CRM Setup modules
const moduleIcons = {
  crm: Building2,
  task_manager: CheckCircle,
  schema_builder: Settings,
  import_builder: FileText,
  export_builder: FileText,
  form_builder: FileText,
  flow_builder: Zap,
  survey_builder: MessageSquare,
  chatbot_manager: Bot,
  docflow: FileText,
  file_manager: FileText,
  app_manager: Settings,
  email_templates: FileText,
  booking: Calendar,
  ai_features: Sparkles,
  field_service: Settings,
  reporting: BarChart3,
  features: Sparkles,
  connections: Key,
  sales_console: BarChart3
};

const ModulesPage = () => {
  const { getAdminToken } = useAdminAuth();
  const [availableModules, setAvailableModules] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Module management dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState(null);
  const [tenantModules, setTenantModules] = useState(null);
  const [saving, setSaving] = useState(false);

  // Landing page config
  const [landingPage, setLandingPage] = useState('/crm-platform');
  const [landingSaving, setLandingSaving] = useState(false);

  const fetchModules = async () => {
    try {
      const response = await axios.get(`${ADMIN_API}/modules/available`, {
        headers: { Authorization: `Bearer ${getAdminToken()}` }
      });
      setAvailableModules(response.data.modules || []);
    } catch (error) {
      console.error('Failed to fetch modules:', error);
    }
  };

  const fetchTenants = async () => {
    setLoading(true);
    try {
      const params = { limit: 100, search: searchQuery || undefined };
      const response = await axios.get(`${ADMIN_API}/tenants`, {
        headers: { Authorization: `Bearer ${getAdminToken()}` },
        params
      });
      setTenants(response.data.tenants || []);
    } catch (error) {
      console.error('Failed to fetch tenants:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchModules();
    fetchTenants();
  }, []);

  useEffect(() => {
    const delaySearch = setTimeout(() => {
      fetchTenants();
    }, 300);
    return () => clearTimeout(delaySearch);
  }, [searchQuery]);

  const openModuleDialog = async (tenant) => {
    setSelectedTenant(tenant);
    setDialogOpen(true);
    setLandingPage('/crm-platform');
    
    try {
      const response = await axios.get(`${ADMIN_API}/tenants/${tenant.id}/modules`, {
        headers: { Authorization: `Bearer ${getAdminToken()}` }
      });
      setTenantModules(response.data);

      // Fetch tenant settings (landing page)
      try {
        const settingsRes = await axios.get(`${ADMIN_API}/tenants/${tenant.id}/settings`, {
          headers: { Authorization: `Bearer ${getAdminToken()}` }
        });
        setLandingPage(settingsRes.data?.default_landing_page || '/crm-platform');
      } catch { /* settings may not exist yet */ }
    } catch (error) {
      console.error('Failed to fetch tenant modules:', error);
    }
  };

  const handleLandingPageChange = async (newValue) => {
    setLandingPage(newValue);
    setLandingSaving(true);
    try {
      await axios.put(
        `${ADMIN_API}/tenants/${selectedTenant.id}/settings`,
        { default_landing_page: newValue },
        { headers: { Authorization: `Bearer ${getAdminToken()}` } }
      );
    } catch (error) {
      console.error('Failed to save landing page:', error);
    } finally {
      setLandingSaving(false);
    }
  };

  const handleToggleModule = async (moduleApiName, enabled) => {
    setSaving(true);
    try {
      const response = await axios.post(
        `${ADMIN_API}/tenants/${selectedTenant.id}/modules/toggle`,
        { module_api_name: moduleApiName, enabled },
        { headers: { Authorization: `Bearer ${getAdminToken()}` } }
      );
      setTenantModules(response.data);
      
      // Update tenant in list
      setTenants(prev => prev.map(t => 
        t.id === selectedTenant.id 
          ? { ...t, module_entitlements: response.data.enabled_modules }
          : t
      ));
    } catch (error) {
      console.error('Failed to toggle module:', error);
    } finally {
      setSaving(false);
    }
  };

  const getCategoryColor = (category) => {
    const colors = {
      core: 'bg-blue-100 text-blue-700',
      data: 'bg-emerald-100 text-emerald-700',
      automation: 'bg-purple-100 text-purple-700',
      engagement: 'bg-green-100 text-green-700',
      documents: 'bg-amber-100 text-amber-700',
      platform: 'bg-cyan-100 text-cyan-700',
      advanced: 'bg-orange-100 text-orange-700',
      ai: 'bg-pink-100 text-pink-700',
      analytics: 'bg-indigo-100 text-indigo-700'
    };
    return colors[category] || colors.core;
  };

  // Group modules by category
  const modulesByCategory = availableModules.reduce((acc, module) => {
    const cat = module.category || 'core';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(module);
    return acc;
  }, {});

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Module Entitlements</h1>
        <p className="text-slate-500 mt-1">
          Enable or disable CRM modules for each tenant
        </p>
      </div>

      {/* Available Modules Overview */}
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Available Modules</CardTitle>
          <CardDescription>All modules available on the platform</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {availableModules.map((module) => {
              const Icon = moduleIcons[module.api_name] || Boxes;
              return (
                <div
                  key={module.api_name}
                  className="p-3 border rounded-lg bg-slate-50"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Icon className="h-4 w-4 text-slate-600" />
                    <span className="font-medium text-sm">{module.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={`text-xs ${getCategoryColor(module.category)}`}>
                      {module.category}
                    </Badge>
                    {module.is_premium && (
                      <Badge className="text-xs bg-amber-100 text-amber-700">Premium</Badge>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Tenant Search */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search tenants..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
              data-testid="tenant-search-input"
            />
          </div>
        </CardContent>
      </Card>

      {/* Tenants Grid */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
        </div>
      ) : tenants.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12 text-slate-500">
            <Building2 className="h-12 w-12 mx-auto mb-3 text-slate-300" />
            <p className="font-medium">No tenants found</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {tenants.map((tenant) => (
            <Card 
              key={tenant.id}
              className="hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => openModuleDialog(tenant)}
              data-testid={`tenant-module-card-${tenant.id}`}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center">
                      <span className="text-white font-semibold">
                        {tenant.tenant_name?.[0] || 'T'}
                      </span>
                    </div>
                    <div>
                      <p className="font-medium text-slate-900">{tenant.tenant_name}</p>
                      <Badge variant="outline" className="text-xs capitalize">
                        {tenant.plan}
                      </Badge>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm">
                    <Settings className="h-4 w-4" />
                  </Button>
                </div>

                <div className="flex flex-wrap gap-1">
                  {(tenant.module_entitlements || []).map((m) => {
                    const Icon = moduleIcons[m] || Boxes;
                    return (
                      <Badge key={m} variant="outline" className="text-xs flex items-center gap-1">
                        <Icon className="h-3 w-3" />
                        {m.replace('_', ' ')}
                      </Badge>
                    );
                  })}
                  {(!tenant.module_entitlements || tenant.module_entitlements.length === 0) && (
                    <span className="text-xs text-slate-400">No modules enabled</span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Module Management Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Module Entitlements</DialogTitle>
            <DialogDescription>
              Manage modules for {selectedTenant?.tenant_name}
            </DialogDescription>
          </DialogHeader>

          {!tenantModules ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
            </div>
          ) : (
            <div className="space-y-6 py-4">
              {/* Tenant Info */}
              <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-lg">
                <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold">
                    {selectedTenant?.tenant_name?.[0] || 'T'}
                  </span>
                </div>
                <div>
                  <p className="font-medium text-slate-900">{selectedTenant?.tenant_name}</p>
                  <p className="text-sm text-slate-500">
                    Plan: <span className="capitalize font-medium">{tenantModules.plan}</span>
                  </p>
                </div>
              </div>

              {/* Default Landing Page Config */}
              <div className="p-4 border border-indigo-200 rounded-lg bg-indigo-50/50">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-800">Default Landing Page</p>
                    <p className="text-xs text-slate-500 mt-0.5">Where users land after login</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select value={landingPage} onValueChange={handleLandingPageChange}>
                      <SelectTrigger className="w-52 h-9" data-testid="landing-page-select">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="/crm-platform">CRM Dashboard</SelectItem>
                        <SelectItem value="/setup/docflow">DocFlow</SelectItem>
                        <SelectItem value="/setup">Setup Home</SelectItem>
                        <SelectItem value="/flows">Flow Builder</SelectItem>
                        <SelectItem value="/task-manager">Task Manager</SelectItem>
                        <SelectItem value="/booking">Booking</SelectItem>
                        <SelectItem value="/files">File Manager</SelectItem>
                      </SelectContent>
                    </Select>
                    {landingSaving && <Loader2 className="h-4 w-4 animate-spin text-indigo-600" />}
                  </div>
                </div>
              </div>

              {/* Modules by Category */}
              {Object.entries(modulesByCategory).map(([category, modules]) => (
                <div key={category}>
                  <h4 className="text-sm font-medium text-slate-700 mb-3 capitalize flex items-center gap-2">
                    <Badge className={`${getCategoryColor(category)}`}>{category}</Badge>
                  </h4>
                  <div className="space-y-2">
                    {modules.map((module) => {
                      const Icon = moduleIcons[module.api_name] || Boxes;
                      const isEnabled = tenantModules.enabled_modules.includes(module.api_name);
                      
                      return (
                        <div
                          key={module.api_name}
                          className={`flex items-center justify-between p-3 border rounded-lg ${
                            isEnabled ? 'border-indigo-200 bg-indigo-50' : 'border-slate-200'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <Icon className={`h-5 w-5 ${isEnabled ? 'text-indigo-600' : 'text-slate-400'}`} />
                            <div>
                              <p className="font-medium text-sm">{module.name}</p>
                              <p className="text-xs text-slate-500">{module.description}</p>
                            </div>
                            {module.is_premium && (
                              <Badge className="bg-amber-100 text-amber-700 text-xs">Premium</Badge>
                            )}
                          </div>
                          <Switch
                            checked={isEnabled}
                            onCheckedChange={(checked) => handleToggleModule(module.api_name, checked)}
                            disabled={saving}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ModulesPage;
