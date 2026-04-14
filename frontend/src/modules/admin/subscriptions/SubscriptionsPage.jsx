/**
 * Subscription Plans Page - Admin Portal
 * Manage subscription plans for the SaaS platform
 * 
 * Architecture:
 * - Plans reference MODULES from the Module Registry (source of truth)
 * - Plans define which modules are included
 * - Licenses are separate (seat-based access control)
 */
import React, { useState, useEffect } from 'react';
import { useAdminAuth } from '../auth/AdminAuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Badge } from '../../../components/ui/badge';
import { Textarea } from '../../../components/ui/textarea';
import { Switch } from '../../../components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../../components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '../../../components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '../../../components/ui/dropdown-menu';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '../../../components/ui/collapsible';
import {
  CreditCard,
  Plus,
  MoreHorizontal,
  Edit,
  Trash2,
  Loader2,
  CheckCircle,
  Users,
  Database,
  Zap,
  Building2,
  DollarSign,
  ChevronDown,
  ChevronRight,
  Package,
  Layers
} from 'lucide-react';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const ADMIN_API = `${BACKEND_URL}/api/admin`;

// Module categories for grouping
const MODULE_CATEGORIES = {
  core: { label: 'Core', color: 'blue', icon: Zap },
  productivity: { label: 'Productivity', color: 'green', icon: Package },
  admin: { label: 'Admin', color: 'purple', icon: Building2 },
  automation: { label: 'Automation', color: 'orange', icon: Layers },
  data: { label: 'Data', color: 'cyan', icon: Database },
  engagement: { label: 'Engagement', color: 'pink', icon: Users },
  ai: { label: 'AI', color: 'indigo', icon: Zap },
  advanced: { label: 'Advanced', color: 'amber', icon: CreditCard },
  analytics: { label: 'Analytics', color: 'teal', icon: Package },
  config: { label: 'Configuration', color: 'slate', icon: Layers }
};

// Helper to get category info
const getCategoryInfo = (category) => MODULE_CATEGORIES[category] || { label: category, color: 'slate', icon: Package };

// Group modules by category
const groupModulesByCategory = (modules) => {
  const groups = {};
  modules.forEach(module => {
    const cat = module.category || 'other';
    if (!groups[cat]) {
      groups[cat] = [];
    }
    groups[cat].push(module);
  });
  return groups;
};

const SubscriptionsPage = () => {
  const { getAdminToken } = useAdminAuth();
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [availableModules, setAvailableModules] = useState([]);
  const [expandedPlan, setExpandedPlan] = useState(null);
  
  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState('create');
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    api_name: '',
    description: '',
    price_monthly: 0,
    price_yearly: 0,
    seat_limit: 5,
    storage_limit_mb: 512,
    api_limit_daily: 1000,
    enabled_modules: [],
    is_active: true,
    is_public: true,
    sort_order: 0
  });
  const [saving, setSaving] = useState(false);

  const fetchPlans = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${ADMIN_API}/plans?include_inactive=true`, {
        headers: { Authorization: `Bearer ${getAdminToken()}` }
      });
      setPlans(response.data.plans || []);
    } catch (error) {
      console.error('Failed to fetch plans:', error);
    } finally {
      setLoading(false);
    }
  };

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

  useEffect(() => {
    fetchPlans();
    fetchModules();
  }, []);

  const handleCreate = () => {
    setDialogMode('create');
    setSelectedPlan(null);
    setFormData({
      name: '',
      api_name: '',
      description: '',
      price_monthly: 0,
      price_yearly: 0,
      seat_limit: 5,
      storage_limit_mb: 512,
      api_limit_daily: 1000,
      enabled_modules: [],
      is_active: true,
      is_public: true,
      sort_order: plans.length
    });
    setDialogOpen(true);
  };

  const handleEdit = (plan) => {
    setDialogMode('edit');
    setSelectedPlan(plan);
    setFormData({
      name: plan.name,
      api_name: plan.api_name,
      description: plan.description || '',
      price_monthly: plan.price_monthly || 0,
      price_yearly: plan.price_yearly || 0,
      seat_limit: plan.seat_limit || 5,
      storage_limit_mb: plan.storage_limit_mb || 512,
      api_limit_daily: plan.api_limit_daily || 1000,
      enabled_modules: plan.enabled_modules || [],
      is_active: plan.is_active !== false,
      is_public: plan.is_public !== false,
      sort_order: plan.sort_order || 0
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (dialogMode === 'create') {
        await axios.post(`${ADMIN_API}/plans`, formData, {
          headers: { Authorization: `Bearer ${getAdminToken()}` }
        });
      } else {
        await axios.patch(`${ADMIN_API}/plans/${selectedPlan.id}`, formData, {
          headers: { Authorization: `Bearer ${getAdminToken()}` }
        });
      }
      setDialogOpen(false);
      fetchPlans();
    } catch (error) {
      console.error('Failed to save plan:', error);
      alert(error.response?.data?.detail || 'Failed to save plan');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (planId) => {
    if (!window.confirm('Are you sure you want to delete this plan?')) return;
    try {
      await axios.delete(`${ADMIN_API}/plans/${planId}`, {
        headers: { Authorization: `Bearer ${getAdminToken()}` }
      });
      fetchPlans();
    } catch (error) {
      console.error('Failed to delete plan:', error);
    }
  };

  const handleSeedPlans = async () => {
    try {
      await axios.post(`${ADMIN_API}/plans/seed`, null, {
        headers: { Authorization: `Bearer ${getAdminToken()}` }
      });
      fetchPlans();
    } catch (error) {
      console.error('Failed to seed plans:', error);
    }
  };

  const toggleModule = (moduleApiName) => {
    setFormData(prev => {
      const modules = new Set(prev.enabled_modules);
      if (modules.has(moduleApiName)) {
        modules.delete(moduleApiName);
      } else {
        modules.add(moduleApiName);
      }
      return { ...prev, enabled_modules: Array.from(modules) };
    });
  };

  // Get module details by api_name
  const getModuleInfo = (apiName) => {
    return availableModules.find(m => m.api_name === apiName);
  };

  // Render modules grouped by category for a plan
  const renderPlanModules = (enabledModules) => {
    const moduleDetails = enabledModules
      .map(apiName => getModuleInfo(apiName))
      .filter(Boolean);
    
    const grouped = groupModulesByCategory(moduleDetails);
    
    return (
      <div className="space-y-3 py-2">
        {Object.entries(grouped).map(([category, modules]) => {
          const catInfo = getCategoryInfo(category);
          return (
            <div key={category}>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1.5">
                {catInfo.label}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {modules.map(module => (
                  <Badge 
                    key={module.api_name} 
                    variant="outline" 
                    className={`text-xs bg-${catInfo.color}-50 border-${catInfo.color}-200 text-${catInfo.color}-700`}
                  >
                    {module.name}
                    {module.is_premium && <span className="ml-1 text-amber-500">★</span>}
                  </Badge>
                ))}
              </div>
            </div>
          );
        })}
        {enabledModules.length === 0 && (
          <p className="text-xs text-slate-400 italic">No modules assigned</p>
        )}
      </div>
    );
  };

  // Render grouped modules for edit dialog
  const renderModuleSelector = () => {
    const grouped = groupModulesByCategory(availableModules);
    
    return (
      <div className="space-y-4">
        {Object.entries(grouped).map(([category, modules]) => {
          const catInfo = getCategoryInfo(category);
          const selectedCount = modules.filter(m => formData.enabled_modules.includes(m.api_name)).length;
          
          return (
            <div key={category} className="border rounded-lg overflow-hidden">
              <div className={`px-3 py-2 bg-${catInfo.color}-50 border-b flex items-center justify-between`}>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{catInfo.label}</span>
                  <Badge variant="secondary" className="text-xs">
                    {selectedCount}/{modules.length}
                  </Badge>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs h-6"
                  onClick={() => {
                    const allSelected = modules.every(m => formData.enabled_modules.includes(m.api_name));
                    if (allSelected) {
                      // Deselect all in category
                      setFormData(prev => ({
                        ...prev,
                        enabled_modules: prev.enabled_modules.filter(
                          m => !modules.find(mod => mod.api_name === m)
                        )
                      }));
                    } else {
                      // Select all in category
                      setFormData(prev => ({
                        ...prev,
                        enabled_modules: [...new Set([...prev.enabled_modules, ...modules.map(m => m.api_name)])]
                      }));
                    }
                  }}
                >
                  {modules.every(m => formData.enabled_modules.includes(m.api_name)) ? 'Deselect All' : 'Select All'}
                </Button>
              </div>
              <div className="p-2 grid grid-cols-2 gap-1.5">
                {modules.map((module) => (
                  <div
                    key={module.api_name}
                    className={`p-2 border rounded cursor-pointer transition-colors text-sm ${
                      formData.enabled_modules.includes(module.api_name)
                        ? 'border-indigo-500 bg-indigo-50'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                    onClick={() => toggleModule(module.api_name)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium">{module.name}</span>
                        {module.is_premium && (
                          <Badge className="bg-amber-100 text-amber-700 text-[10px] px-1">Premium</Badge>
                        )}
                      </div>
                      {formData.enabled_modules.includes(module.api_name) && (
                        <CheckCircle className="h-3.5 w-3.5 text-indigo-600" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Subscription Plans</h1>
            <p className="text-slate-500 mt-1">
              Define plans and their included modules from the Module Registry
            </p>
          </div>
          <div className="flex items-center gap-2">
            {plans.length === 0 && (
              <Button variant="outline" onClick={handleSeedPlans}>
                Seed Default Plans
              </Button>
            )}
            <Button 
              className="bg-indigo-600 hover:bg-indigo-700"
              onClick={handleCreate}
              data-testid="create-plan-btn"
            >
              <Plus className="h-4 w-4 mr-2" />
              Create Plan
            </Button>
          </div>
        </div>
      </div>

      {/* Info Card */}
      <Card className="mb-6 bg-blue-50 border-blue-200">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Layers className="h-5 w-5 text-blue-600 mt-0.5" />
            <div>
              <p className="font-medium text-blue-800">Module-Based Plans</p>
              <p className="text-sm text-blue-600 mt-1">
                Plans reference modules from the Module Registry. Each plan defines which modules tenants can access.
                Licenses (seats) control user access separately.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Plans List */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">
            All Plans ({plans.length})
          </CardTitle>
          <CardDescription>
            Click on a plan row to see all included modules
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
            </div>
          ) : plans.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <CreditCard className="h-12 w-12 mx-auto mb-3 text-slate-300" />
              <p className="font-medium">No plans configured</p>
              <p className="text-sm mt-1">Create your first plan or seed default plans</p>
              <Button className="mt-4" onClick={handleSeedPlans}>
                Seed Default Plans
              </Button>
            </div>
          ) : (
            <div className="divide-y">
              {plans.map((plan) => (
                <Collapsible
                  key={plan.id}
                  open={expandedPlan === plan.id}
                  onOpenChange={(open) => setExpandedPlan(open ? plan.id : null)}
                >
                  <div 
                    className="flex items-center justify-between p-4 hover:bg-slate-50 cursor-pointer"
                    data-testid={`plan-row-${plan.id}`}
                  >
                    <CollapsibleTrigger className="flex items-center gap-4 flex-1">
                      <div className="flex items-center gap-2">
                        {expandedPlan === plan.id ? (
                          <ChevronDown className="h-4 w-4 text-slate-400" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-slate-400" />
                        )}
                        <div>
                          <p className="font-medium text-slate-900">{plan.name}</p>
                          <p className="text-xs text-slate-500">{plan.api_name}</p>
                        </div>
                      </div>
                    </CollapsibleTrigger>
                    
                    <div className="flex items-center gap-6">
                      {/* Pricing */}
                      <div className="text-right">
                        <div className="flex items-center gap-1">
                          <DollarSign className="h-3.5 w-3.5 text-slate-400" />
                          <span className="font-semibold">{plan.price_monthly}</span>
                          <span className="text-slate-400 text-sm">/mo</span>
                        </div>
                      </div>
                      
                      {/* Limits */}
                      <div className="flex items-center gap-4 text-xs text-slate-500">
                        <div className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          <span>{plan.seat_limit} seats</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Database className="h-3 w-3" />
                          <span>{plan.storage_limit_mb} MB</span>
                        </div>
                      </div>
                      
                      {/* Module Count */}
                      <Badge variant="outline" className="text-xs">
                        <Package className="h-3 w-3 mr-1" />
                        {(plan.enabled_modules || []).length} modules
                      </Badge>
                      
                      {/* Status */}
                      {plan.is_active !== false ? (
                        <Badge className="bg-green-100 text-green-700">Active</Badge>
                      ) : (
                        <Badge className="bg-slate-100 text-slate-700">Inactive</Badge>
                      )}
                      
                      {/* Tenant Count */}
                      <div className="flex items-center gap-1 text-sm text-slate-500 min-w-[60px]">
                        <Building2 className="h-3.5 w-3.5" />
                        <span>{plan.tenant_count || 0}</span>
                      </div>
                      
                      {/* Actions */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleEdit(plan)}>
                            <Edit className="h-4 w-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDelete(plan.id)} className="text-red-600">
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                  
                  <CollapsibleContent>
                    <div className="px-4 pb-4 pt-0 ml-10 border-l-2 border-indigo-100">
                      <div className="bg-slate-50 rounded-lg p-4">
                        <p className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-3">
                          Included Modules
                        </p>
                        {renderPlanModules(plan.enabled_modules || [])}
                      </div>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Plan Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{dialogMode === 'create' ? 'Create Plan' : 'Edit Plan'}</DialogTitle>
            <DialogDescription>
              {dialogMode === 'create' 
                ? 'Create a new subscription plan and select modules from the registry' 
                : 'Edit plan details and module assignments'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Basic Info */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Plan Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., Professional"
                  data-testid="plan-name-input"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="api_name">API Name *</Label>
                <Input
                  id="api_name"
                  value={formData.api_name}
                  onChange={(e) => setFormData(prev => ({ ...prev, api_name: e.target.value.toLowerCase().replace(/\s+/g, '_') }))}
                  placeholder="e.g., professional"
                  disabled={dialogMode === 'edit'}
                  data-testid="plan-api-name-input"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Brief description of the plan"
                rows={2}
              />
            </div>

            {/* Pricing */}
            <div>
              <h4 className="text-sm font-medium mb-3">Pricing</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="price_monthly">Monthly Price ($)</Label>
                  <Input
                    id="price_monthly"
                    type="number"
                    min="0"
                    value={formData.price_monthly}
                    onChange={(e) => setFormData(prev => ({ ...prev, price_monthly: parseFloat(e.target.value) || 0 }))}
                    data-testid="price-monthly-input"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="price_yearly">Yearly Price ($)</Label>
                  <Input
                    id="price_yearly"
                    type="number"
                    min="0"
                    value={formData.price_yearly}
                    onChange={(e) => setFormData(prev => ({ ...prev, price_yearly: parseFloat(e.target.value) || 0 }))}
                  />
                </div>
              </div>
            </div>

            {/* Limits */}
            <div>
              <h4 className="text-sm font-medium mb-3">Limits</h4>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="seat_limit">Seat Limit</Label>
                  <Input
                    id="seat_limit"
                    type="number"
                    min="1"
                    value={formData.seat_limit}
                    onChange={(e) => setFormData(prev => ({ ...prev, seat_limit: parseInt(e.target.value) || 1 }))}
                    data-testid="seat-limit-input"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="storage_limit_mb">Storage (MB)</Label>
                  <Input
                    id="storage_limit_mb"
                    type="number"
                    min="100"
                    value={formData.storage_limit_mb}
                    onChange={(e) => setFormData(prev => ({ ...prev, storage_limit_mb: parseInt(e.target.value) || 100 }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="api_limit_daily">API Limit/Day</Label>
                  <Input
                    id="api_limit_daily"
                    type="number"
                    min="100"
                    value={formData.api_limit_daily}
                    onChange={(e) => setFormData(prev => ({ ...prev, api_limit_daily: parseInt(e.target.value) || 100 }))}
                  />
                </div>
              </div>
            </div>

            {/* Modules - Grouped by Category */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-medium">
                  Enabled Modules ({formData.enabled_modules.length} selected)
                </h4>
                <p className="text-xs text-slate-500">
                  Modules from the Module Registry
                </p>
              </div>
              {renderModuleSelector()}
            </div>

            {/* Status */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Active</Label>
                <p className="text-xs text-slate-500">Make this plan available for tenants</p>
              </div>
              <Switch
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_active: checked }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || !formData.name || !formData.api_name}
              className="bg-indigo-600 hover:bg-indigo-700"
              data-testid="save-plan-btn"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {dialogMode === 'create' ? 'Create Plan' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SubscriptionsPage;
