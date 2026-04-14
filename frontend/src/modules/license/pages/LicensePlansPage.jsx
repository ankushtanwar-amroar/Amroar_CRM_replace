/**
 * LicensePlansPage - License & Plans Management
 * Displays current license, usage metrics, and available plans
 * 
 * Access Control:
 * - Super Admin: Full management (create/update)
 * - Admin: Read-only view
 * - Regular users: No access (redirected)
 */
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import {
  CreditCard,
  Check,
  X,
  Users,
  Database,
  Zap,
  BarChart3,
  Shield,
  Sparkles,
  Clock,
  AlertTriangle,
  ChevronRight,
  Crown,
  ArrowLeft,
} from 'lucide-react';

import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { Progress } from '../../../components/ui/progress';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../../components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../../../components/ui/dialog';
import { useModuleEntitlementsContext, MODULE_STATES } from '../../../context/ModuleContext';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Feature icons mapping
const featureIcons = {
  crm_core: Database,
  custom_objects: Database,
  flow_builder: Zap,
  approval_workflows: Check,
  basic_reports: BarChart3,
  advanced_reporting: BarChart3,
  api_access: Zap,
  webhook_support: Zap,
  chatter: Users,
  file_manager: Database,
  advanced_security: Shield,
  audit_trail: Shield,
  ai_features: Sparkles,
  ai_assistant: Sparkles,
};

// Feature display names
const featureNames = {
  crm_core: 'Core CRM',
  custom_objects: 'Custom Objects',
  flow_builder: 'Flow Builder',
  approval_workflows: 'Approval Workflows',
  basic_reports: 'Basic Reports',
  advanced_reporting: 'Advanced Reporting',
  api_access: 'API Access',
  webhook_support: 'Webhook Support',
  chatter: 'Chatter',
  file_manager: 'File Manager',
  advanced_security: 'Advanced Security',
  audit_trail: 'Audit Trail',
  ai_features: 'AI Features',
  ai_assistant: 'AI Assistant',
};

// Limit display names
const limitNames = {
  max_users: 'Users',
  max_storage_gb: 'Storage (GB)',
  max_api_calls_per_day: 'API Calls/Day',
  max_custom_objects: 'Custom Objects',
  max_custom_fields_per_object: 'Fields/Object',
  max_flows: 'Flows',
  max_reports: 'Reports',
  max_dashboards: 'Dashboards',
};

const LicensePlansPage = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [license, setLicense] = useState(null);
  const [features, setFeatures] = useState({});
  const [limits, setLimits] = useState({});
  const [usage, setUsage] = useState(null);
  const [plans, setPlans] = useState([]);
  const [currentPlan, setCurrentPlan] = useState('free');
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [upgrading, setUpgrading] = useState(false);

  // Detect DocFlow-only tenant
  const { getModuleState } = useModuleEntitlementsContext();
  const crmState = getModuleState('crm');
  const isDocFlowOnly = crmState?.state === MODULE_STATES.ADMIN_DISABLED;

  useEffect(() => {
    fetchLicenseData();
    checkUserRole();
  }, []);

  const checkUserRole = async () => {
    try {
      const response = await axios.get(`${API}/me`);
      const user = response.data;
      setIsSuperAdmin(user.is_super_admin === true);
      setIsAdmin(user.role_id === 'system_administrator' || user.role_id === 'system_admin');
      
      // Redirect regular users
      if (!user.is_super_admin && user.role_id !== 'system_administrator' && user.role_id !== 'system_admin') {
        toast.error('You do not have permission to view this page');
        navigate('/setup');
      }
    } catch (error) {
      console.error('Error checking user role:', error);
    }
  };

  const fetchLicenseData = async () => {
    setLoading(true);
    try {
      // Fetch license, usage, and plans in parallel
      const [licenseRes, usageRes, plansRes] = await Promise.all([
        axios.get(`${API}/license`),
        axios.get(`${API}/license/usage`),
        axios.get(`${API}/license/plans`),
      ]);

      setLicense(licenseRes.data.license);
      setFeatures(licenseRes.data.features || {});
      setLimits(licenseRes.data.limits || {});
      setUsage(usageRes.data);
      setPlans(plansRes.data.available_plans || []);
      setCurrentPlan(plansRes.data.current_plan || 'free');
    } catch (error) {
      console.error('Error fetching license data:', error);
      toast.error('Failed to load license information');
    } finally {
      setLoading(false);
    }
  };

  const handleUpgrade = async (plan) => {
    if (!isSuperAdmin) {
      toast.error('Only Super Admins can change the license');
      return;
    }
    setSelectedPlan(plan);
    setShowUpgradeDialog(true);
  };

  const confirmUpgrade = async () => {
    if (!selectedPlan) return;
    
    setUpgrading(true);
    try {
      await axios.post(`${API}/license`, {
        name: selectedPlan.name,
        api_name: selectedPlan.api_name,
        tier: selectedPlan.tier,
        is_trial: true,
        trial_days: 30,
      });
      
      toast.success(`Successfully upgraded to ${selectedPlan.name} plan!`);
      setShowUpgradeDialog(false);
      fetchLicenseData();
    } catch (error) {
      console.error('Error upgrading license:', error);
      toast.error('Failed to upgrade license');
    } finally {
      setUpgrading(false);
    }
  };

  const getTierColor = (tier) => {
    switch (tier) {
      case 1: return 'bg-slate-100 text-slate-700';
      case 2: return 'bg-blue-100 text-blue-700';
      case 3: return 'bg-purple-100 text-purple-700';
      case 4: return 'bg-amber-100 text-amber-700';
      default: return 'bg-slate-100 text-slate-700';
    }
  };

  const getUsageStatus = (current, limit) => {
    if (limit === null) return { status: 'unlimited', percent: 0 };
    if (limit === 0) return { status: 'unavailable', percent: 0 };
    const percent = (current / limit) * 100;
    if (percent >= 100) return { status: 'exceeded', percent: 100 };
    if (percent >= 80) return { status: 'warning', percent };
    return { status: 'ok', percent };
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  // DocFlow-only tenants see "Coming Soon" instead of CRM plan cards
  if (isDocFlowOnly) {
    return (
      <div className="max-w-6xl mx-auto space-y-6 p-6">
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => navigate('/setup')}
            className="flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors"
            data-testid="back-to-setup-btn"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="text-sm font-medium">Back to Setup</span>
          </button>
          <div className="h-8 w-px bg-slate-300" />
          <div>
            <h1 className="text-2xl font-bold text-slate-900">License & Plans</h1>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-16 text-center" data-testid="docflow-plans-coming-soon">
          <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-sky-100 to-blue-100 flex items-center justify-center">
            <Crown className="h-8 w-8 text-blue-500" />
          </div>
          <h2 className="text-xl font-bold text-slate-800 mb-2">License & Plans</h2>
          <p className="text-slate-500 max-w-md mx-auto text-sm leading-relaxed">
            This feature is coming soon for DocFlow users.<br />
            Stay tuned for upcoming updates.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6 p-6">
      {/* Header with Back Button */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate('/setup')}
          className="flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors"
          data-testid="back-to-setup-btn"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="text-sm font-medium">Back to Setup</span>
        </button>
        <div className="h-8 w-px bg-slate-300" />
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
            <CreditCard className="h-5 w-5 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-slate-900">License & Plans</h1>
            <p className="text-sm text-slate-500">
              {isSuperAdmin ? 'Manage your organization\'s license and features' : 'View your organization\'s license details'}
            </p>
          </div>
        </div>
      </div>

      {!isSuperAdmin && isAdmin && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <span className="text-sm text-amber-800">
            You are viewing this page in read-only mode. Only Super Admins can modify licenses.
          </span>
        </div>
      )}

      {/* Current Plan Card - Hidden for DocFlow-only tenants */}
      {!isDocFlowOnly && (
      <Card className="border-2 border-indigo-200 bg-gradient-to-br from-indigo-50 to-white">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Crown className="h-6 w-6 text-indigo-600" />
              <div>
                <CardTitle className="text-xl">
                  {license?.name || 'Free'} Plan
                </CardTitle>
                <CardDescription>
                  {license?.description || 'Basic CRM functionality for small teams'}
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {license?.is_trial && (
                <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                  <Clock className="h-3 w-3 mr-1" />
                  Trial
                </Badge>
              )}
              <Badge className={getTierColor(license?.tier || 1)}>
                Tier {license?.tier || 1}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {license?.is_trial && license?.trial_ends_at && (
            <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <div className="flex items-center gap-2 text-amber-800">
                <Clock className="h-4 w-4" />
                <span className="text-sm font-medium">
                  Trial ends on {new Date(license.trial_ends_at).toLocaleDateString()}
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      )}

      {/* Usage & Limits - Hidden for DocFlow-only tenants */}
      {!isDocFlowOnly && usage && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-slate-600" />
              Usage & Limits
            </CardTitle>
            <CardDescription>
              Current resource usage against your plan limits
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {Object.entries(usage.usage || {}).map(([key, value]) => {
                const limitKey = `max_${key}`;
                const limit = usage.limits?.[limitKey];
                const { status, percent } = getUsageStatus(value, limit);
                
                return (
                  <div key={key} className="p-4 bg-slate-50 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-slate-700 capitalize">
                        {key.replace(/_/g, ' ')}
                      </span>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                        status === 'exceeded' ? 'bg-red-100 text-red-700' :
                        status === 'warning' ? 'bg-amber-100 text-amber-700' :
                        status === 'unlimited' ? 'bg-green-100 text-green-700' :
                        'bg-slate-100 text-slate-600'
                      }`}>
                        {status === 'unlimited' ? '∞' : `${value}/${limit || 0}`}
                      </span>
                    </div>
                    {status !== 'unlimited' && status !== 'unavailable' && (
                      <Progress 
                        value={percent} 
                        className={`h-2 ${
                          status === 'exceeded' ? '[&>div]:bg-red-500' :
                          status === 'warning' ? '[&>div]:bg-amber-500' :
                          '[&>div]:bg-green-500'
                        }`}
                      />
                    )}
                    {status === 'unlimited' && (
                      <div className="text-xs text-green-600 mt-1">Unlimited</div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Features Grid - Hidden for DocFlow-only tenants */}
      {!isDocFlowOnly && (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-slate-600" />
            Enabled Features
          </CardTitle>
          <CardDescription>
            Features available in your current plan
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {Object.entries(features).map(([key, enabled]) => {
              const Icon = featureIcons[key] || Sparkles;
              return (
                <div
                  key={key}
                  className={`flex items-center gap-2 p-3 rounded-lg border ${
                    enabled 
                      ? 'bg-green-50 border-green-200' 
                      : 'bg-slate-50 border-slate-200 opacity-60'
                  }`}
                >
                  {enabled ? (
                    <Check className="h-4 w-4 text-green-600 flex-shrink-0" />
                  ) : (
                    <X className="h-4 w-4 text-slate-400 flex-shrink-0" />
                  )}
                  <Icon className={`h-4 w-4 flex-shrink-0 ${enabled ? 'text-green-600' : 'text-slate-400'}`} />
                  <span className={`text-sm ${enabled ? 'text-green-800' : 'text-slate-500'}`}>
                    {featureNames[key] || key.replace(/_/g, ' ')}
                  </span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
      )}

      {/* Available Plans */}
      <div>
        <h2 className="text-lg font-semibold text-slate-800 mb-4">Available Plans</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {plans.map((plan) => {
            const isCurrentPlan = plan.api_name === currentPlan;
            const isUpgrade = plan.tier > (license?.tier || 1);
            const isDowngrade = plan.tier < (license?.tier || 1);
            
            return (
              <Card 
                key={plan.api_name}
                className={`relative ${
                  isCurrentPlan 
                    ? 'border-2 border-indigo-500 shadow-md' 
                    : 'hover:border-slate-300'
                }`}
              >
                {isCurrentPlan && (
                  <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                    <Badge className="bg-indigo-600">Current Plan</Badge>
                  </div>
                )}
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{plan.name}</CardTitle>
                    <Badge className={getTierColor(plan.tier)}>
                      Tier {plan.tier}
                    </Badge>
                  </div>
                  <CardDescription className="text-xs">
                    {plan.description}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Key limits */}
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Users</span>
                      <span className="font-medium">
                        {plan.limits.max_users === null ? 'Unlimited' : plan.limits.max_users}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Storage</span>
                      <span className="font-medium">{plan.limits.max_storage_gb} GB</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Custom Objects</span>
                      <span className="font-medium">{plan.limits.max_custom_objects}</span>
                    </div>
                  </div>

                  {/* Key features */}
                  <div className="border-t pt-3 space-y-1">
                    {['flow_builder', 'advanced_reporting', 'ai_features'].map((feature) => (
                      <div key={feature} className="flex items-center gap-2 text-xs">
                        {plan.features[feature] ? (
                          <Check className="h-3 w-3 text-green-600" />
                        ) : (
                          <X className="h-3 w-3 text-slate-300" />
                        )}
                        <span className={plan.features[feature] ? 'text-slate-700' : 'text-slate-400'}>
                          {featureNames[feature]}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Action button */}
                  {isSuperAdmin && !isCurrentPlan && (
                    <Button
                      className="w-full"
                      variant={isUpgrade ? 'default' : 'outline'}
                      onClick={() => handleUpgrade(plan)}
                    >
                      {isUpgrade ? 'Upgrade' : 'Switch Plan'}
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  )}
                  {isCurrentPlan && (
                    <Button className="w-full" variant="outline" disabled>
                      Current Plan
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Note about enforcement */}
      <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-sm text-blue-800">
          <strong>Note:</strong> License feature and limit enforcement is currently informational only. 
          Full enforcement will be enabled in a future update.
        </p>
      </div>

      {/* Upgrade Confirmation Dialog */}
      <Dialog open={showUpgradeDialog} onOpenChange={setShowUpgradeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Plan Change</DialogTitle>
            <DialogDescription>
              You are about to switch to the <strong>{selectedPlan?.name}</strong> plan.
              {selectedPlan?.tier > (license?.tier || 1) && (
                <span className="block mt-2 text-green-600">
                  This is an upgrade and will unlock additional features.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-slate-600">
              A 30-day trial will be activated for this plan. No payment is required during the trial period.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUpgradeDialog(false)}>
              Cancel
            </Button>
            <Button onClick={confirmUpgrade} disabled={upgrading}>
              {upgrading ? 'Processing...' : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default LicensePlansPage;
