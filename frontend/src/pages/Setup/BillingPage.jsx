/**
 * CRM Billing Page - Self-Service Plan Upgrades with Stripe Checkout
 * 
 * Flow:
 * 1. Fetches dynamic plans from /api/billing/plans (DB-driven)
 * 2. User selects a plan to upgrade
 * 3. Frontend calls POST /api/billing/checkout/subscription
 * 4. User is redirected to Stripe Checkout
 * 5. After payment, user returns with ?session_id=...
 * 6. Frontend polls session status and refreshes module states
 * 7. Webhook updates tenant plan in background
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../App';
import { useModuleEntitlementsContext } from '../../context/ModuleContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import { 
  Check, 
  X, 
  Sparkles, 
  Crown,
  Zap,
  Building2,
  Loader2,
  ArrowLeft,
  CreditCard,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Receipt,
  Star,
  Shield
} from 'lucide-react';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;

// Icon mapping for plans based on tier position
const PLAN_ICONS = [Zap, Sparkles, Building2, Crown, Star, Shield];

// Human-readable module names
const MODULE_LABELS = {
  crm: 'CRM & Contacts',
  sales_console: 'Sales Console',
  task_manager: 'Task Manager',
  form_builder: 'Form Builder',
  flow_builder: 'Flow Builder',
  email_templates: 'Email Templates',
  survey_builder: 'Survey Builder',
  booking: 'Booking System',
  import_builder: 'Import Builder',
  export_builder: 'Export Builder',
  file_manager: 'File Manager',
  schema_builder: 'Schema Builder',
  app_manager: 'App Manager',
  chatbot_manager: 'Chatbot Manager',
  docflow: 'DocFlow',
  ai_features: 'AI Features',
  field_service: 'Field Service',
  reporting: 'Advanced Reporting',
  features: 'Features',
  connections: 'Connections',
};

const BillingPage = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const { refreshModuleStates, tenantPlan: contextPlan } = useModuleEntitlementsContext();
  
  const [currentPlan, setCurrentPlan] = useState(null);
  const [plans, setPlans] = useState([]);
  const [billingCycle, setBillingCycle] = useState('monthly');
  const [loading, setLoading] = useState(true);
  const [upgradeDialogOpen, setUpgradeDialogOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [checkingSession, setCheckingSession] = useState(false);
  const [subscriptionStatus, setSubscriptionStatus] = useState(null);
  
  const token = localStorage.getItem('token');
  const isAdmin = user?.is_super_admin || user?.role === 'system_administrator';

  useEffect(() => {
    const sessionId = searchParams.get('session_id');
    if (sessionId) {
      checkPaymentStatus(sessionId);
    } else {
      fetchBillingData();
    }
  }, []);

  useEffect(() => {
    if (contextPlan && !loading) {
      setCurrentPlan(contextPlan);
    }
  }, [contextPlan, loading]);

  const fetchBillingData = async () => {
    try {
      setLoading(true);
      
      const [statesRes, summaryRes, plansRes] = await Promise.all([
        fetch(`${API_URL}/api/runtime/modules/states?_t=${Date.now()}`, {
          headers: { Authorization: `Bearer ${token}`, 'Cache-Control': 'no-cache' }
        }),
        fetch(`${API_URL}/api/billing/summary`, {
          headers: { Authorization: `Bearer ${token}` }
        }).catch(() => null),
        fetch(`${API_URL}/api/billing/plans`, {
          headers: { Authorization: `Bearer ${token}` }
        }).catch(() => null)
      ]);
      
      if (statesRes.ok) {
        const statesData = await statesRes.json();
        setCurrentPlan(statesData.plan || 'free');
      }
      
      if (summaryRes?.ok) {
        const summaryData = await summaryRes.json();
        setSubscriptionStatus(summaryData.subscription_status);
        if (summaryData.billing_cycle) {
          setBillingCycle(summaryData.billing_cycle);
        }
      }

      if (plansRes?.ok) {
        const plansData = await plansRes.json();
        setPlans(plansData.plans || []);
      }
    } catch (error) {
      console.error('Failed to fetch billing data:', error);
      setCurrentPlan('free');
    } finally {
      setLoading(false);
    }
  };

  const checkPaymentStatus = async (sessionId) => {
    setCheckingSession(true);
    try {
      // Poll up to 5 times with 2s intervals
      let attempts = 0;
      const maxAttempts = 5;
      const pollInterval = 2000;

      const poll = async () => {
        const res = await fetch(`${API_URL}/api/billing/checkout/status/${sessionId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        if (res.ok) {
          const data = await res.json();
          
          if (data.payment_status === 'paid') {
            setPaymentSuccess(true);
            toast.success('Payment successful! Your plan has been upgraded.', { duration: 5000 });
            await refreshModuleStates();
            await fetchBillingData();
            setSearchParams({});
            return true;
          } else if (data.status === 'expired') {
            toast.error('Payment session expired. Please try again.');
            setSearchParams({});
            return true;
          } else if (data.status === 'open' && attempts < maxAttempts) {
            attempts++;
            await new Promise(r => setTimeout(r, pollInterval));
            return poll();
          }
        }
        
        toast.error('Payment was not completed. Please try again.');
        setSearchParams({});
        return false;
      };

      await poll();
    } catch (error) {
      console.error('Failed to check payment status:', error);
      toast.error('Could not verify payment status.');
    } finally {
      setCheckingSession(false);
      fetchBillingData();
    }
  };

  const handleCheckout = async () => {
    if (!selectedPlan || selectedPlan.api_name === currentPlan) return;
    
    if (!isAdmin) {
      toast.error('Only tenant administrators can manage billing.', { duration: 5000 });
      return;
    }
    
    setProcessing(true);
    try {
      const res = await fetch(`${API_URL}/api/billing/checkout/subscription`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          plan: selectedPlan.api_name,
          billing_cycle: billingCycle,
          origin_url: window.location.origin
        })
      });
      
      let data;
      const contentType = res.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        data = await res.json();
      } else {
        const text = await res.text();
        throw new Error(text || 'Server error');
      }

      if (!res.ok) {
        throw new Error(data.detail || data.error || 'Failed to create checkout session');
      }
      
      if (data.checkout_url) {
        toast.info('Redirecting to secure payment...', { duration: 2000 });
        window.location.href = data.checkout_url;
      } else {
        throw new Error('No checkout URL received');
      }
    } catch (error) {
      console.error('Checkout error:', error);
      toast.error(error.message || 'Failed to start checkout. Please try again.');
    } finally {
      setProcessing(false);
      setUpgradeDialogOpen(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshModuleStates();
      await fetchBillingData();
      toast.success('Billing status refreshed');
    } catch (error) {
      toast.error('Failed to refresh');
    } finally {
      setRefreshing(false);
    }
  };

  const handleUpgradeClick = (plan) => {
    if (plan.api_name === currentPlan) return;
    setSelectedPlan(plan);
    setUpgradeDialogOpen(true);
  };

  // Determine plan ordering by index in the sorted array
  const getPlanIndex = (apiName) => {
    return plans.findIndex(p => p.api_name === apiName);
  };

  const isUpgrade = (targetApiName) => {
    return getPlanIndex(targetApiName) > getPlanIndex(currentPlan);
  };

  const isDowngrade = (targetApiName) => {
    return getPlanIndex(targetApiName) < getPlanIndex(currentPlan);
  };

  const currentPlanData = plans.find(p => p.api_name === currentPlan);

  // Determine which standard plans to highlight (free/starter/professional/enterprise)
  const standardPlanCodes = ['free', 'starter', 'professional', 'enterprise'];
  
  // Filter: show standard plans + current plan if custom, prioritize standard plans for display
  const displayPlans = plans.filter(p => 
    standardPlanCodes.includes(p.api_name) || p.api_name === currentPlan
  );
  // De-duplicate
  const seen = new Set();
  const uniqueDisplayPlans = displayPlans.filter(p => {
    if (seen.has(p.api_name)) return false;
    seen.add(p.api_name);
    return true;
  });

  // Get top features for a plan to display as bullet points
  const getPlanFeatures = (plan) => {
    const modules = plan.enabled_modules || [];
    const features = [];
    
    // Seat info
    features.push({ name: `${plan.seat_limit} User Seats`, included: true });
    
    // Show included modules
    modules.forEach(mod => {
      features.push({ 
        name: MODULE_LABELS[mod] || mod.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), 
        included: true 
      });
    });

    return features.slice(0, 8); // Show max 8 features
  };

  if (loading || checkingSession) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4" data-testid="billing-loading">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
        <p className="text-slate-500">
          {checkingSession ? 'Verifying payment...' : 'Loading billing information...'}
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto" data-testid="billing-page">
      {/* Back Button */}
      <Button
        variant="ghost"
        className="mb-4"
        onClick={() => navigate('/setup')}
        data-testid="back-to-setup-btn"
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back to Setup
      </Button>

      {/* Payment Success Banner */}
      {paymentSuccess && (
        <Card className="mb-6 border-green-200 bg-green-50" data-testid="payment-success-banner">
          <CardContent className="p-4 flex items-center space-x-3">
            <CheckCircle className="h-6 w-6 text-green-600" />
            <div>
              <p className="font-medium text-green-800">Payment Successful!</p>
              <p className="text-sm text-green-600">
                Your plan has been upgraded. New features are now available.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900" data-testid="billing-page-title">Plans & Billing</h1>
          <p className="text-slate-500 mt-1">
            {isAdmin 
              ? 'Manage your subscription and unlock more features'
              : 'View your current plan and features'
            }
          </p>
        </div>
        <Button 
          variant="outline" 
          size="sm"
          onClick={handleRefresh}
          disabled={refreshing}
          data-testid="refresh-plan-btn"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </Button>
      </div>

      {/* Current Plan Banner */}
      <Card className="mb-8 bg-gradient-to-r from-indigo-500 to-purple-600 text-white" data-testid="current-plan-banner">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-indigo-100 text-sm">Current Plan</p>
              <h2 className="text-2xl font-bold mt-1" data-testid="current-plan-name">
                {currentPlanData?.name || currentPlan?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || 'Free'}
              </h2>
              <p className="text-indigo-100 mt-2">
                {currentPlanData?.description || ''}
              </p>
              {subscriptionStatus && subscriptionStatus === 'active' && (
                <Badge className="mt-2 bg-white/20 text-white">
                  Active Subscription
                </Badge>
              )}
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold" data-testid="current-plan-price">
                ${billingCycle === 'yearly' 
                  ? (currentPlanData?.base_yearly || 0).toFixed(0)
                  : (currentPlanData?.base_monthly || 0).toFixed(0)
                }
                <span className="text-lg font-normal text-indigo-200">
                  /{billingCycle === 'yearly' ? 'year' : 'month'}
                </span>
              </p>
              <p className="text-indigo-200 text-sm mt-1">
                {currentPlanData?.seat_limit || 0} user seats
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Billing Cycle Toggle */}
      <div className="flex justify-center mb-6">
        <div className="inline-flex rounded-lg border bg-slate-100 p-1" data-testid="billing-cycle-toggle">
          <button
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              billingCycle === 'monthly' 
                ? 'bg-white text-slate-900 shadow-sm' 
                : 'text-slate-500 hover:text-slate-700'
            }`}
            onClick={() => setBillingCycle('monthly')}
            data-testid="billing-cycle-monthly"
          >
            Monthly
          </button>
          <button
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              billingCycle === 'yearly' 
                ? 'bg-white text-slate-900 shadow-sm' 
                : 'text-slate-500 hover:text-slate-700'
            }`}
            onClick={() => setBillingCycle('yearly')}
            data-testid="billing-cycle-yearly"
          >
            Yearly <span className="text-xs text-green-600 ml-1">Save ~17%</span>
          </button>
        </div>
      </div>

      {/* Plan Cards */}
      {uniqueDisplayPlans.length === 0 ? (
        <div className="text-center py-12 text-slate-500" data-testid="no-plans-message">
          <p>No plans available. Please contact support.</p>
        </div>
      ) : (
        <div className={`grid gap-6 ${
          uniqueDisplayPlans.length <= 3 ? 'md:grid-cols-3' : 'md:grid-cols-2 lg:grid-cols-4'
        }`} data-testid="plan-cards-grid">
          {uniqueDisplayPlans.map((plan, idx) => {
            const Icon = PLAN_ICONS[idx % PLAN_ICONS.length];
            const isCurrent = plan.api_name === currentPlan;
            const canUpgrade = isUpgrade(plan.api_name);
            const canDowngrade = isDowngrade(plan.api_name);
            const isPopular = plan.api_name === 'professional';
            const features = getPlanFeatures(plan);
            const price = billingCycle === 'yearly' ? plan.base_yearly : plan.base_monthly;
            const isFree = price === 0 && plan.api_name === 'free';
            
            return (
              <Card 
                key={plan.api_name}
                data-testid={`plan-card-${plan.api_name}`}
                className={`relative transition-all ${isPopular ? 'ring-2 ring-indigo-500' : ''} ${
                  isCurrent ? 'bg-slate-50 border-indigo-300' : 'hover:shadow-md'
                }`}
              >
                {isPopular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-indigo-500">Most Popular</Badge>
                  </div>
                )}
                
                {isCurrent && (
                  <div className="absolute -top-3 right-4">
                    <Badge className="bg-green-500" data-testid={`current-badge-${plan.api_name}`}>Current</Badge>
                  </div>
                )}
                
                <CardHeader className="pb-4">
                  <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center mb-3">
                    <Icon className="h-5 w-5 text-indigo-600" />
                  </div>
                  <CardTitle className="text-lg">{plan.name}</CardTitle>
                  <div className="mt-2">
                    <span className="text-3xl font-bold" data-testid={`plan-price-${plan.api_name}`}>
                      {isFree ? '$0' : `$${price.toFixed(0)}`}
                    </span>
                    <span className="text-slate-500">
                      /{billingCycle === 'yearly' ? 'year' : 'month'}
                    </span>
                  </div>
                  <CardDescription className="mt-1">
                    {plan.description || `${plan.enabled_modules?.length || 0} modules included`}
                  </CardDescription>
                </CardHeader>
                
                <CardContent>
                  <ul className="space-y-2 mb-6">
                    {features.map((feature, fidx) => (
                      <li key={fidx} className="flex items-center text-sm">
                        <Check className="h-4 w-4 text-green-500 mr-2 flex-shrink-0" />
                        <span className="text-slate-700">{feature.name}</span>
                      </li>
                    ))}
                    {plan.enabled_modules?.length > 8 && (
                      <li className="text-xs text-slate-400 pl-6">
                        +{plan.enabled_modules.length - 7} more modules
                      </li>
                    )}
                  </ul>
                  
                  {isCurrent ? (
                    <Button className="w-full" variant="outline" disabled data-testid={`plan-btn-current-${plan.api_name}`}>
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Current Plan
                    </Button>
                  ) : canUpgrade ? (
                    <Button
                      className="w-full"
                      onClick={() => handleUpgradeClick(plan)}
                      disabled={!isAdmin}
                      data-testid={`upgrade-to-${plan.api_name}-btn`}
                    >
                      <CreditCard className="h-4 w-4 mr-2" />
                      Upgrade
                    </Button>
                  ) : canDowngrade ? (
                    <Button
                      className="w-full"
                      variant="outline"
                      disabled
                      title="Contact support to downgrade"
                      data-testid={`downgrade-to-${plan.api_name}-btn`}
                    >
                      Downgrade
                    </Button>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Admin / Non-Admin Notice */}
      <Card className="mt-8" data-testid="billing-notice">
        <CardContent className="p-6">
          <div className="flex items-start space-x-4">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
              isAdmin ? 'bg-green-100' : 'bg-amber-100'
            }`}>
              {isAdmin ? (
                <CreditCard className="h-5 w-5 text-green-600" />
              ) : (
                <AlertCircle className="h-5 w-5 text-amber-600" />
              )}
            </div>
            <div>
              {isAdmin ? (
                <>
                  <h3 className="font-semibold text-slate-900">Ready to upgrade?</h3>
                  <p className="text-slate-500 mt-1">
                    Click on any plan above to start the secure checkout process. 
                    Your new features will be available immediately after payment.
                  </p>
                </>
              ) : (
                <>
                  <h3 className="font-semibold text-slate-900">Need to change your plan?</h3>
                  <p className="text-slate-500 mt-1">
                    Plan changes require administrator permissions. Please contact your 
                    organization's admin to upgrade your subscription.
                  </p>
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Upgrade Confirmation Dialog */}
      <Dialog open={upgradeDialogOpen} onOpenChange={setUpgradeDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center">
              <CreditCard className="h-5 w-5 mr-2 text-indigo-600" />
              Upgrade to {selectedPlan?.name}
            </DialogTitle>
            <DialogDescription>
              You're upgrading from {currentPlanData?.name || currentPlan} to {selectedPlan?.name}.
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4 space-y-4">
            {/* Price Summary */}
            <div className="p-4 bg-slate-50 rounded-lg" data-testid="upgrade-price-summary">
              <div className="flex justify-between items-center">
                <div>
                  <p className="font-medium text-slate-900">{selectedPlan?.name} Plan</p>
                  <p className="text-sm text-slate-500">
                    {selectedPlan?.seat_limit} user seats
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-slate-900" data-testid="upgrade-dialog-price">
                    ${billingCycle === 'yearly'
                      ? (selectedPlan?.base_yearly || 0).toFixed(0)
                      : (selectedPlan?.base_monthly || 0).toFixed(0)
                    }
                  </p>
                  <p className="text-sm text-slate-500">per {billingCycle === 'yearly' ? 'year' : 'month'}</p>
                </div>
              </div>
            </div>

            {/* What's Included */}
            <div>
              <p className="text-sm font-medium text-slate-700 mb-2">What's included:</p>
              <ul className="space-y-1">
                {selectedPlan?.enabled_modules?.slice(0, 6).map((mod, idx) => (
                  <li key={idx} className="flex items-center text-sm text-slate-600">
                    <Check className="h-3 w-3 text-green-500 mr-2" />
                    {MODULE_LABELS[mod] || mod.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                  </li>
                ))}
                {selectedPlan?.enabled_modules?.length > 6 && (
                  <li className="text-xs text-slate-400 pl-5">
                    +{selectedPlan.enabled_modules.length - 6} more modules
                  </li>
                )}
              </ul>
            </div>

            {/* Security Note */}
            <p className="text-xs text-slate-400 flex items-center">
              <Receipt className="h-3 w-3 mr-1" />
              Secure payment powered by Stripe. You can cancel anytime.
            </p>
          </div>
          
          <DialogFooter className="gap-2">
            <Button 
              variant="outline" 
              onClick={() => setUpgradeDialogOpen(false)}
              disabled={processing}
              data-testid="cancel-upgrade-btn"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleCheckout} 
              disabled={processing}
              data-testid="confirm-upgrade-btn"
            >
              {processing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Processing...
                </>
              ) : (
                <>
                  <CreditCard className="h-4 w-4 mr-2" />
                  Continue to Payment
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default BillingPage;
