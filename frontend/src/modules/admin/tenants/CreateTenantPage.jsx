import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  Building2,
  User,
  Mail,
  Globe,
  ArrowLeft,
  Loader2,
  CheckCircle2,
  CreditCard,
  Layers,
  Send,
} from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Badge } from '../../../components/ui/badge';
import toast from 'react-hot-toast';

const API = process.env.REACT_APP_BACKEND_URL;

const INDUSTRIES = [
  'Technology', 'Healthcare', 'Finance', 'Education', 'Retail',
  'Manufacturing', 'Real Estate', 'Legal', 'Consulting', 'Other',
];

const CreateTenantPage = () => {
  const navigate = useNavigate();
  const [plans, setPlans] = useState([]);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [creating, setCreating] = useState(false);
  const [success, setSuccess] = useState(null);

  const [form, setForm] = useState({
    tenant_name: '',
    organization_name: '',
    admin_email: '',
    admin_first_name: '',
    admin_last_name: '',
    plan: '',
    industry: '',
    is_trial: false,
    trial_days: 14,
  });

  useEffect(() => {
    const fetchPlans = async () => {
      try {
        const token = localStorage.getItem('admin_token');
        const { data } = await axios.get(`${API}/api/admin/plans`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const activePlans = (data.plans || data || []).filter((p) => p.is_active !== false);
        setPlans(activePlans);
        if (activePlans.length > 0 && !form.plan) {
          setForm((prev) => ({ ...prev, plan: activePlans[0].api_name }));
        }
      } catch (err) {
        console.error('Failed to load plans:', err);
        toast.error('Failed to load subscription plans');
      } finally {
        setLoadingPlans(false);
      }
    };
    fetchPlans();
  }, []);

  const updateField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const selectedPlan = plans.find((p) => p.api_name === form.plan);

  const canSubmit =
    form.tenant_name.trim().length >= 2 &&
    form.organization_name.trim().length >= 2 &&
    form.admin_email.trim() &&
    form.admin_first_name.trim() &&
    form.admin_last_name.trim() &&
    form.plan;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setCreating(true);
    try {
      const token = localStorage.getItem('admin_token');
      const { data } = await axios.post(
        `${API}/api/admin/tenants`,
        form,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setSuccess(data);
      toast.success('Tenant created — verification email sent');
    } catch (err) {
      const msg = err.response?.data?.detail || 'Failed to create tenant';
      toast.error(msg);
    } finally {
      setCreating(false);
    }
  };

  // ─── Success Screen ─────────────────────────────────────────────
  if (success) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="w-full max-w-lg" data-testid="tenant-create-success">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="bg-gradient-to-r from-emerald-500 to-green-500 px-8 py-8 text-center">
              <CheckCircle2 className="h-14 w-14 text-white mx-auto mb-3" />
              <h2 className="text-xl font-bold text-white">Tenant Created Successfully</h2>
            </div>
            <div className="px-8 py-6 space-y-5">
              <div className="bg-slate-50 rounded-xl p-4 space-y-3">
                <InfoRow label="Organization" value={success.tenant_name} />
                <InfoRow label="Plan" value={selectedPlan?.name || success.plan} />
                <InfoRow label="Admin Email" value={success.admin_user?.email} />
                <InfoRow label="Admin Name" value={`${success.admin_user?.first_name} ${success.admin_user?.last_name}`} />
                <InfoRow label="Licenses" value={`${success.licenses_provisioned} provisioned`} />
                <InfoRow label="Modules" value={(success.module_entitlements || []).join(', ')} />
              </div>

              <div className={`rounded-xl p-4 border ${success.verification_email_sent ? 'bg-blue-50 border-blue-200' : 'bg-amber-50 border-amber-200'}`}>
                <div className="flex items-start gap-3">
                  <Send className={`h-5 w-5 mt-0.5 flex-shrink-0 ${success.verification_email_sent ? 'text-blue-500' : 'text-amber-500'}`} />
                  <div>
                    <p className={`text-sm font-semibold ${success.verification_email_sent ? 'text-blue-700' : 'text-amber-700'}`}>
                      {success.verification_email_sent
                        ? 'Verification email sent'
                        : 'Email delivery pending'}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      {success.verification_email_sent
                        ? `A verification email has been sent to ${success.admin_user?.email}. The admin must click the link to set their password and activate their account. The link expires in 72 hours.`
                        : 'The email could not be sent right now. You can resend it from the tenant details page.'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <Button
                  variant="outline"
                  onClick={() => { setSuccess(null); setForm({ tenant_name: '', organization_name: '', admin_email: '', admin_first_name: '', admin_last_name: '', plan: plans[0]?.api_name || '', industry: '', is_trial: false, trial_days: 14 }); }}
                  className="flex-1"
                  data-testid="create-another-btn"
                >
                  Create Another
                </Button>
                <Button
                  onClick={() => navigate('/admin/tenants')}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white"
                  data-testid="back-to-tenants-btn"
                >
                  Back to Tenants
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Form ───────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50 p-6 lg:p-8" data-testid="create-tenant-page">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/admin/tenants')}
            data-testid="back-btn"
          >
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Create New Tenant</h1>
            <p className="text-sm text-slate-500">
              Set up a new organization — plan drives licenses and modules
            </p>
          </div>
        </div>

        <div className="space-y-6">
          {/* Card 1: Organization Details */}
          <Card
            icon={Building2}
            iconGradient="from-sky-400 to-blue-500"
            title="Organization Details"
            subtitle="Basic company information"
            testId="org-details-card"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField label="Tenant Name" required>
                <Input
                  value={form.tenant_name}
                  onChange={(e) => updateField('tenant_name', e.target.value)}
                  placeholder="e.g. Acme Corp"
                  data-testid="tenant-name-input"
                />
              </FormField>
              <FormField label="Organization Name" required>
                <Input
                  value={form.organization_name}
                  onChange={(e) => updateField('organization_name', e.target.value)}
                  placeholder="Legal entity name"
                  data-testid="org-name-input"
                />
              </FormField>
            </div>
            <div className="mt-4">
              <FormField label="Industry">
                <select
                  value={form.industry}
                  onChange={(e) => updateField('industry', e.target.value)}
                  className="w-full h-9 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  data-testid="industry-select"
                >
                  <option value="">Select industry...</option>
                  {INDUSTRIES.map((i) => (
                    <option key={i} value={i.toLowerCase()}>{i}</option>
                  ))}
                </select>
              </FormField>
            </div>
          </Card>

          {/* Card 2: Admin User */}
          <Card
            icon={User}
            iconGradient="from-amber-400 to-orange-500"
            title="Tenant Administrator"
            subtitle="Admin will receive a verification email to set their password"
            testId="admin-user-card"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField label="First Name" required>
                <Input
                  value={form.admin_first_name}
                  onChange={(e) => updateField('admin_first_name', e.target.value)}
                  placeholder="First name"
                  data-testid="admin-first-name-input"
                />
              </FormField>
              <FormField label="Last Name" required>
                <Input
                  value={form.admin_last_name}
                  onChange={(e) => updateField('admin_last_name', e.target.value)}
                  placeholder="Last name"
                  data-testid="admin-last-name-input"
                />
              </FormField>
            </div>
            <div className="mt-4">
              <FormField label="Email Address" required>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    type="email"
                    value={form.admin_email}
                    onChange={(e) => updateField('admin_email', e.target.value)}
                    placeholder="admin@company.com"
                    className="pl-10"
                    data-testid="admin-email-input"
                  />
                </div>
              </FormField>
              <p className="text-xs text-slate-400 mt-2 flex items-center gap-1.5">
                <Send className="h-3 w-3" />
                A verification email will be sent to this address after creation
              </p>
            </div>
          </Card>

          {/* Card 3: Plan Selection */}
          <Card
            icon={CreditCard}
            iconGradient="from-violet-500 to-indigo-600"
            title="Subscription Plan"
            subtitle="Plan determines licenses, modules, and seat limits"
            testId="plan-selection-card"
          >
            {loadingPlans ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
              </div>
            ) : (
              <div className="space-y-3">
                {plans.map((plan) => (
                  <label
                    key={plan.api_name}
                    className={`flex items-start gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                      form.plan === plan.api_name
                        ? 'border-indigo-500 bg-indigo-50/50 shadow-sm'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                    data-testid={`plan-option-${plan.api_name}`}
                  >
                    <input
                      type="radio"
                      name="plan"
                      value={plan.api_name}
                      checked={form.plan === plan.api_name}
                      onChange={() => updateField('plan', plan.api_name)}
                      className="mt-1 accent-indigo-600"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-slate-800">{plan.name}</span>
                        {plan.price_monthly > 0 ? (
                          <Badge variant="outline" className="text-xs bg-slate-50 text-slate-600 border-slate-200">
                            ${plan.price_monthly}/mo
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs bg-emerald-50 text-emerald-600 border-emerald-200">
                            Free
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-1">{plan.description}</p>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {(plan.enabled_modules || []).map((mod) => (
                          <Badge key={mod} variant="outline" className="text-[10px] bg-white border-slate-200 text-slate-500 capitalize">
                            {mod.replace(/_/g, ' ')}
                          </Badge>
                        ))}
                      </div>
                      <p className="text-xs text-slate-400 mt-1.5">
                        {plan.seat_limit} seats | {plan.storage_limit_mb >= 1024 ? `${(plan.storage_limit_mb / 1024).toFixed(0)} GB` : `${plan.storage_limit_mb} MB`} storage
                      </p>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </Card>

          {/* Plan Summary */}
          {selectedPlan && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-6 py-4" data-testid="plan-summary">
              <div className="flex items-center gap-2 mb-3">
                <Layers className="h-4 w-4 text-indigo-500" />
                <span className="text-sm font-semibold text-slate-700">Plan Summary</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
                <SummaryItem label="Plan" value={selectedPlan.name} />
                <SummaryItem label="Seats" value={selectedPlan.seat_limit} />
                <SummaryItem label="Modules" value={(selectedPlan.enabled_modules || []).length} />
                <SummaryItem label="Licenses" value={(selectedPlan.included_licenses || []).length} />
              </div>
            </div>
          )}

          {/* Trial toggle */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-6 py-4" data-testid="trial-section">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-700">Trial Period</p>
                <p className="text-xs text-slate-400">Enable a time-limited trial for this tenant</p>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.is_trial}
                  onChange={(e) => updateField('is_trial', e.target.checked)}
                  className="accent-indigo-600"
                  data-testid="trial-toggle"
                />
                <span className="text-sm text-slate-600">{form.is_trial ? `${form.trial_days} days` : 'Off'}</span>
              </label>
            </div>
            {form.is_trial && (
              <div className="mt-3">
                <Input
                  type="number"
                  min={1}
                  max={90}
                  value={form.trial_days}
                  onChange={(e) => updateField('trial_days', parseInt(e.target.value) || 14)}
                  className="w-32"
                  data-testid="trial-days-input"
                />
              </div>
            )}
          </div>

          {/* Submit */}
          <div className="flex justify-end gap-3 pt-2 pb-8">
            <Button
              variant="outline"
              onClick={() => navigate('/admin/tenants')}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!canSubmit || creating}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 disabled:opacity-50"
              data-testid="create-tenant-submit"
            >
              {creating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Tenant'
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Reusable sub-components ──────────────────────────────────────

const Card = ({ icon: Icon, iconGradient, title, subtitle, testId, children }) => (
  <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden" data-testid={testId}>
    <div className="px-6 pt-5 pb-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
      <div className="flex items-center gap-3">
        <div className={`flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br ${iconGradient} shadow-sm`}>
          <Icon className="h-5 w-5 text-white" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-slate-800">{title}</h3>
          <p className="text-xs text-slate-400">{subtitle}</p>
        </div>
      </div>
    </div>
    <div className="px-6 py-5">{children}</div>
  </div>
);

const FormField = ({ label, required, children }) => (
  <div>
    <label className="block text-xs font-medium text-slate-500 uppercase tracking-wide mb-1.5">
      {label} {required && <span className="text-red-400">*</span>}
    </label>
    {children}
  </div>
);

const InfoRow = ({ label, value }) => (
  <div className="flex justify-between text-sm">
    <span className="text-slate-500">{label}</span>
    <span className="text-slate-800 font-medium">{value || '—'}</span>
  </div>
);

const SummaryItem = ({ label, value }) => (
  <div>
    <p className="text-xs text-slate-400 uppercase tracking-wide">{label}</p>
    <p className="text-lg font-bold text-slate-800 mt-0.5">{value}</p>
  </div>
);

export default CreateTenantPage;
