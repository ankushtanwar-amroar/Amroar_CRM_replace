/**
 * Tenant Billing Tab Component - Admin Portal
 * 
 * This is the ADMIN view-only billing management page.
 * 
 * Architecture:
 * - Checkout/payments happen in CRM (/setup/billing)
 * - This page is for admin oversight and manual overrides
 * - Shows subscription status, Stripe info, and admin controls
 * 
 * Admin Controls:
 * - Manual Plan Override (without payment)
 * - Cancel Subscription
 * - View in Stripe
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Switch } from '../../../components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select';
import { Alert, AlertDescription } from '../../../components/ui/alert';
import { Badge } from '../../../components/ui/badge';
import { Textarea } from '../../../components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../../components/ui/dialog';
import {
  CreditCard,
  Loader2,
  DollarSign,
  AlertCircle,
  CheckCircle,
  Save,
  Mail,
  Globe,
  FileText,
  Receipt,
  ExternalLink,
  RefreshCw,
  Zap,
  AlertTriangle,
  ArrowUpCircle,
  XCircle,
  Crown,
  Building2,
  Sparkles,
  RotateCcw
} from 'lucide-react';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api/admin`;

const TAX_MODES = [
  { value: 'none', label: 'No Tax' },
  { value: 'inclusive', label: 'Tax Inclusive' },
  { value: 'exclusive', label: 'Tax Exclusive' }
];

const CURRENCIES = [
  { value: 'USD', label: 'USD - US Dollar' },
  { value: 'EUR', label: 'EUR - Euro' },
  { value: 'GBP', label: 'GBP - British Pound' },
  { value: 'INR', label: 'INR - Indian Rupee' },
  { value: 'AUD', label: 'AUD - Australian Dollar' }
];

// Plan icons mapping
const PLAN_ICONS = {
  free: Zap,
  starter: Sparkles,
  professional: Building2,
  enterprise: Crown
};

const TenantBillingTab = ({ tenantId, getAdminToken }) => {
  const [billingSummary, setBillingSummary] = useState(null);
  const [availablePlans, setAvailablePlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  
  // Admin action states
  const [overrideDialogOpen, setOverrideDialogOpen] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [processing, setProcessing] = useState(false);

  const [formData, setFormData] = useState({
    billing_contact_email: '',
    billing_contact_name: '',
    currency: 'USD',
    tax_mode: 'none',
    invoice_prefix: '',
    auto_generate_invoice: false,
    notes: ''
  });

  const headers = { Authorization: `Bearer ${getAdminToken()}` };

  const fetchBillingData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Fetch billing summary and available plans in parallel
      const [summaryRes, plansRes] = await Promise.all([
        axios.get(`${API}/billing/tenant/${tenantId}/summary`, { headers }),
        axios.get(`${BACKEND_URL}/api/admin/plans`, { headers }).catch(() => ({ data: { plans: [] } }))
      ]);
      
      setBillingSummary(summaryRes.data);
      
      // Set available plans from API (only active plans)
      const plans = (plansRes.data.plans || [])
        .filter(p => p.is_active !== false)
        .map(p => ({
          value: p.api_name,
          label: p.name,
          price: `$${p.price_monthly || 0}/mo`,
          icon: PLAN_ICONS[p.api_name] || Building2,
          description: p.description || '',
          modules_count: (p.enabled_modules || []).length
        }));
      setAvailablePlans(plans);
      
      // Set form data from config
      if (summaryRes.data.config) {
        setFormData(prev => ({
          ...prev,
          billing_contact_email: summaryRes.data.config.billing_contact_email || '',
          billing_contact_name: summaryRes.data.config.billing_contact_name || '',
          currency: summaryRes.data.config.currency || 'USD',
          tax_mode: summaryRes.data.config.tax_mode || 'none',
          invoice_prefix: summaryRes.data.config.invoice_prefix || '',
          auto_generate_invoice: summaryRes.data.config.auto_generate_invoice || false,
          notes: summaryRes.data.config.notes || ''
        }));
      }
    } catch (err) {
      console.error('Failed to fetch billing data:', err);
      setError('Failed to load billing information');
    } finally {
      setLoading(false);
    }
  }, [tenantId, getAdminToken]);

  useEffect(() => {
    fetchBillingData();
  }, [fetchBillingData]);

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      
      await axios.patch(
        `${API}/billing/tenant/${tenantId}/config`,
        formData,
        { headers }
      );
      
      setSuccess('Billing configuration saved');
      fetchBillingData();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to save billing configuration');
    } finally {
      setSaving(false);
    }
  };

  /**
   * Handle manual plan override (admin action)
   */
  const handleOverridePlan = async () => {
    if (!overrideReason.trim()) {
      setError('Please provide a reason for the plan override');
      return;
    }
    
    try {
      setProcessing(true);
      setError(null);
      
      await axios.post(
        `${API}/billing/tenant/${tenantId}/override-plan`,
        {
          plan: selectedPlan,
          reason: overrideReason
        },
        { headers }
      );
      
      setSuccess(`Plan successfully overridden to ${selectedPlan.toUpperCase()}`);
      setOverrideDialogOpen(false);
      setOverrideReason('');
      fetchBillingData();
      setTimeout(() => setSuccess(null), 5000);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to override plan');
    } finally {
      setProcessing(false);
    }
  };

  /**
   * Handle subscription cancellation (admin action)
   */
  const handleCancelSubscription = async () => {
    if (!cancelReason.trim()) {
      setError('Please provide a reason for cancellation');
      return;
    }
    
    try {
      setProcessing(true);
      setError(null);
      
      await axios.post(
        `${API}/billing/tenant/${tenantId}/cancel-subscription`,
        { reason: cancelReason },
        { headers }
      );
      
      setSuccess('Subscription cancelled. Tenant downgraded to free plan.');
      setCancelDialogOpen(false);
      setCancelReason('');
      fetchBillingData();
      setTimeout(() => setSuccess(null), 5000);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to cancel subscription');
    } finally {
      setProcessing(false);
    }
  };

  /**
   * Open Stripe Dashboard for this customer
   */
  const openStripeCustomer = () => {
    const customerId = billingSummary?.stripe_customer_id;
    if (customerId) {
      // Opens Stripe Dashboard (test mode)
      window.open(`https://dashboard.stripe.com/test/customers/${customerId}`, '_blank');
    }
  };

  /**
   * Sync plan data - ensures all data sources match the tenant's plan
   */
  const handleSyncPlanData = async () => {
    try {
      setProcessing(true);
      setError(null);
      
      await axios.post(
        `${BACKEND_URL}/api/admin/tenants/${tenantId}/plan/sync`,
        {},
        { headers }
      );
      
      setSuccess('Plan data synchronized successfully. All module entitlements updated.');
      fetchBillingData();
      setTimeout(() => setSuccess(null), 5000);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to sync plan data');
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  const currentPlan = billingSummary?.current_plan || 'free';
  const subscriptionStatus = billingSummary?.subscription_status || 'inactive';
  const stripeCustomerId = billingSummary?.stripe_customer_id;
  const stripeSubscriptionId = billingSummary?.stripe_subscription_id;

  return (
    <div className="space-y-6" data-testid="tenant-billing-tab">
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert className="bg-green-50 text-green-800 border-green-200">
          <CheckCircle className="h-4 w-4" />
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      )}

      {/* Architecture Info Banner */}
      <Alert className="bg-blue-50 border-blue-200">
        <AlertCircle className="h-4 w-4 text-blue-600" />
        <AlertDescription className="text-blue-800">
          <strong>Billing Architecture:</strong> Tenant self-service checkout happens in the CRM at <code>/setup/billing</code>. 
          This admin panel is for oversight, manual overrides, and subscription management.
        </AlertDescription>
      </Alert>

      {/* Subscription Status Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="h-4 w-4" />
              Subscription Status
            </CardTitle>
            <Button variant="outline" size="sm" onClick={fetchBillingData}>
              <RefreshCw className="h-3.5 w-3.5 mr-1" />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 bg-slate-50 rounded-lg">
              <p className="text-sm text-slate-500">Status</p>
              <Badge 
                variant={subscriptionStatus === 'active' ? 'default' : 'secondary'}
                className={subscriptionStatus === 'active' ? 'bg-green-100 text-green-700 mt-1' : 'mt-1'}
              >
                {subscriptionStatus === 'active' ? 'Active' : 
                 subscriptionStatus === 'cancelled' ? 'Cancelled' : 'Inactive'}
              </Badge>
            </div>
            <div className="p-4 bg-slate-50 rounded-lg">
              <p className="text-sm text-slate-500">Current Plan</p>
              <p className="font-semibold capitalize text-lg">{currentPlan}</p>
            </div>
            <div className="p-4 bg-slate-50 rounded-lg">
              <p className="text-sm text-slate-500">Billing Cycle</p>
              <p className="font-semibold capitalize">{billingSummary?.billing_cycle || 'Monthly'}</p>
            </div>
            <div className="p-4 bg-slate-50 rounded-lg">
              <p className="text-sm text-slate-500">Est. Monthly Cost</p>
              <p className="font-semibold text-green-600">
                ${billingSummary?.estimated_monthly_cost?.toFixed(2) || '0.00'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Admin Actions Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            Admin Controls
          </CardTitle>
          <CardDescription>
            Manage tenant subscription without requiring payment
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Manual Plan Override */}
            <div className="p-4 border rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <ArrowUpCircle className="h-4 w-4 text-indigo-600" />
                <p className="font-medium">Manual Plan Override</p>
              </div>
              <p className="text-xs text-slate-500 mb-3">
                Change plan without Stripe payment (for support, trials, custom deals)
              </p>
              <Button 
                onClick={() => setOverrideDialogOpen(true)}
                className="w-full"
                variant="outline"
                data-testid="override-plan-btn"
              >
                Override Plan
              </Button>
            </div>

            {/* Cancel Subscription */}
            <div className="p-4 border rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <XCircle className="h-4 w-4 text-red-600" />
                <p className="font-medium">Cancel Subscription</p>
              </div>
              <p className="text-xs text-slate-500 mb-3">
                Cancel and downgrade tenant to free plan
              </p>
              <Button 
                onClick={() => setCancelDialogOpen(true)}
                className="w-full"
                variant="outline"
                disabled={currentPlan === 'free'}
                data-testid="cancel-subscription-btn"
              >
                Cancel Subscription
              </Button>
            </div>

            {/* View in Stripe */}
            <div className="p-4 border rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <ExternalLink className="h-4 w-4 text-purple-600" />
                <p className="font-medium">Stripe Dashboard</p>
              </div>
              <p className="text-xs text-slate-500 mb-3">
                View customer details, invoices, and payment history
              </p>
              <Button 
                onClick={openStripeCustomer}
                className="w-full"
                variant="outline"
                disabled={!stripeCustomerId}
                data-testid="view-stripe-btn"
              >
                {stripeCustomerId ? 'View in Stripe' : 'No Stripe Customer'}
              </Button>
            </div>
          </div>

          {/* Stripe IDs (Read-only) */}
          {(stripeCustomerId || stripeSubscriptionId) && (
            <div className="p-4 bg-slate-50 rounded-lg space-y-2">
              <p className="text-xs font-medium text-slate-700 uppercase tracking-wider">Stripe Information</p>
              {stripeCustomerId && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">Customer ID:</span>
                  <code className="text-xs bg-white px-2 py-1 rounded border">{stripeCustomerId}</code>
                </div>
              )}
              {stripeSubscriptionId && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">Subscription ID:</span>
                  <code className="text-xs bg-white px-2 py-1 rounded border">{stripeSubscriptionId}</code>
                </div>
              )}
            </div>
          )}

          {/* Sync Plan Data */}
          <div className="p-4 border-2 border-dashed border-amber-200 bg-amber-50 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <RotateCcw className="h-4 w-4 text-amber-600" />
              <p className="font-medium text-amber-800">Sync Plan Data</p>
            </div>
            <p className="text-xs text-amber-700 mb-3">
              Fix data inconsistencies by synchronizing all module entitlements, billing config, 
              and limits with the tenant's current plan. Use when data appears mismatched.
            </p>
            <Button 
              onClick={handleSyncPlanData}
              className="w-full bg-amber-600 hover:bg-amber-700"
              disabled={processing}
              data-testid="sync-plan-data-btn"
            >
              {processing ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <RotateCcw className="h-4 w-4 mr-2" />
              )}
              Sync All Plan Data
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Billing Summary */}
      {billingSummary && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">Monthly Total</p>
                  <p className="text-2xl font-bold text-slate-900">
                    ${billingSummary.estimated_monthly_cost?.toFixed(2) || '0.00'}
                  </p>
                </div>
                <DollarSign className="h-8 w-8 text-green-200" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">Billing Email</p>
                  <p className="text-lg font-semibold text-slate-900 truncate">
                    {billingSummary.billing_email || 'Not set'}
                  </p>
                </div>
                <Mail className="h-8 w-8 text-blue-200" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">Modules Enabled</p>
                  <p className="text-2xl font-bold text-slate-900">
                    {billingSummary.modules_count || 0}
                  </p>
                </div>
                <Receipt className="h-8 w-8 text-purple-200" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Transaction History */}
      {billingSummary?.recent_transactions?.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Receipt className="h-4 w-4" />
              Recent Transactions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {billingSummary.recent_transactions.map(tx => (
                <div key={tx.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                  <div>
                    <p className="font-medium">{tx.type}</p>
                    <p className="text-sm text-slate-500">
                      {new Date(tx.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">${tx.amount?.toFixed(2)}</p>
                    <Badge variant={tx.status === 'paid' ? 'default' : 'secondary'}>
                      {tx.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Billing Configuration Form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            Billing Configuration
          </CardTitle>
          <CardDescription>
            Configure billing contact and invoice settings
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Contact Information */}
          <div className="space-y-4">
            <h4 className="font-medium text-slate-900 flex items-center gap-2">
              <Mail className="h-4 w-4" />
              Billing Contact
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Contact Name</Label>
                <Input
                  value={formData.billing_contact_name}
                  onChange={(e) => setFormData({ ...formData, billing_contact_name: e.target.value })}
                  placeholder="John Smith"
                  data-testid="billing-contact-name"
                />
              </div>
              <div className="space-y-2">
                <Label>Contact Email</Label>
                <Input
                  type="email"
                  value={formData.billing_contact_email}
                  onChange={(e) => setFormData({ ...formData, billing_contact_email: e.target.value })}
                  placeholder="billing@company.com"
                  data-testid="billing-contact-email"
                />
              </div>
            </div>
          </div>

          {/* Currency & Tax */}
          <div className="space-y-4">
            <h4 className="font-medium text-slate-900 flex items-center gap-2">
              <Globe className="h-4 w-4" />
              Currency & Tax
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Currency</Label>
                <Select
                  value={formData.currency}
                  onValueChange={(v) => setFormData({ ...formData, currency: v })}
                >
                  <SelectTrigger data-testid="currency-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map(c => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Tax Mode</Label>
                <Select
                  value={formData.tax_mode}
                  onValueChange={(v) => setFormData({ ...formData, tax_mode: v })}
                >
                  <SelectTrigger data-testid="tax-mode-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TAX_MODES.map(t => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Invoice Settings */}
          <div className="space-y-4">
            <h4 className="font-medium text-slate-900 flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Invoice Settings
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Invoice Prefix</Label>
                <Input
                  value={formData.invoice_prefix}
                  onChange={(e) => setFormData({ ...formData, invoice_prefix: e.target.value })}
                  placeholder="INV-"
                  data-testid="invoice-prefix-input"
                />
              </div>
              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                <div>
                  <Label>Auto-generate Invoices</Label>
                  <p className="text-xs text-slate-500">Automatically create invoices on billing events</p>
                </div>
                <Switch
                  checked={formData.auto_generate_invoice}
                  onCheckedChange={(checked) => setFormData({ ...formData, auto_generate_invoice: checked })}
                />
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label>Internal Notes</Label>
            <Input
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Internal notes about billing..."
            />
          </div>

          {/* Save Button */}
          <div className="flex justify-end pt-4">
            <Button
              onClick={handleSave}
              disabled={saving}
              className="bg-indigo-600 hover:bg-indigo-700"
              data-testid="save-billing-config-btn"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Save Configuration
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Manual Plan Override Dialog */}
      <Dialog open={overrideDialogOpen} onOpenChange={setOverrideDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowUpCircle className="h-5 w-5 text-indigo-600" />
              Manual Plan Override
            </DialogTitle>
            <DialogDescription>
              Change the tenant's plan without requiring a Stripe payment.
              This is for support, trials, or custom enterprise deals.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {/* Current Plan Info */}
            <div className="p-3 bg-slate-50 rounded-lg">
              <p className="text-xs text-slate-500">Current Plan</p>
              <p className="font-semibold capitalize">{currentPlan}</p>
            </div>
            
            {/* Plan Selection */}
            <div className="space-y-2">
              <Label>New Plan ({availablePlans.length} plans available)</Label>
              <Select value={selectedPlan} onValueChange={setSelectedPlan}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a plan..." />
                </SelectTrigger>
                <SelectContent>
                  {availablePlans.map(plan => {
                    const Icon = plan.icon || Building2;
                    return (
                      <SelectItem key={plan.value} value={plan.value}>
                        <div className="flex items-center gap-2">
                          <Icon className="h-4 w-4" />
                          <span className="font-medium">{plan.label}</span>
                          <span className="text-slate-500 text-sm">{plan.price}</span>
                          {plan.modules_count && (
                            <span className="text-xs text-slate-400">({plan.modules_count} modules)</span>
                          )}
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            
            {/* Reason (Required) */}
            <div className="space-y-2">
              <Label>Reason for Override *</Label>
              <Textarea
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                placeholder="e.g., Trial extension, Enterprise deal, Support request..."
                rows={3}
              />
              <p className="text-xs text-slate-500">
                This will be logged in the audit trail.
              </p>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setOverrideDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleOverridePlan}
              disabled={processing || !overrideReason.trim()}
              className="bg-indigo-600 hover:bg-indigo-700"
            >
              {processing ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <ArrowUpCircle className="h-4 w-4 mr-2" />
              )}
              Override Plan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Subscription Dialog */}
      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              Cancel Subscription
            </DialogTitle>
            <DialogDescription>
              This will cancel the tenant's subscription and downgrade them to the free plan.
              Module entitlements will be updated accordingly.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {/* Warning */}
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                The tenant will lose access to all premium modules immediately.
              </AlertDescription>
            </Alert>
            
            {/* Current Plan Info */}
            <div className="p-3 bg-red-50 rounded-lg border border-red-200">
              <p className="text-xs text-red-600">Current Plan (Will be cancelled)</p>
              <p className="font-semibold capitalize text-red-800">{currentPlan}</p>
            </div>
            
            {/* Cancellation Reason */}
            <div className="space-y-2">
              <Label>Cancellation Reason *</Label>
              <Textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="e.g., Customer request, Non-payment, Violation of terms..."
                rows={3}
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelDialogOpen(false)}>
              Keep Subscription
            </Button>
            <Button 
              onClick={handleCancelSubscription}
              disabled={processing || !cancelReason.trim()}
              variant="destructive"
            >
              {processing ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <XCircle className="h-4 w-4 mr-2" />
              )}
              Cancel Subscription
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TenantBillingTab;
