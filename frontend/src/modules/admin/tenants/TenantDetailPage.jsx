/**
 * Tenant Detail Page - Phase D Enhanced
 * Modern SaaS Control Plane tenant detail with tabbed layout
 * Tabs: Overview, Subscription, Modules, Limits, Users, Provisioning, Audit, Support
 */
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../auth/AdminAuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { Progress } from '../../../components/ui/progress';
import { Switch } from '../../../components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../../components/ui/tabs';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Textarea } from '../../../components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '../../../components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '../../../components/ui/alert-dialog';
import {
  ArrowLeft,
  Building2,
  Users,
  Database,
  Zap,
  Calendar,
  Clock,
  CreditCard,
  Shield,
  Settings,
  Loader2,
  AlertCircle,
  CheckCircle,
  XCircle,
  Pause,
  Play,
  Trash2,
  Edit,
  Globe,
  Boxes,
  Activity,
  BarChart3,
  HardDrive,
  RefreshCw,
  Mail,
  Key,
  Eye,
  EyeOff,
  BookOpen,
  FileText,
  Server,
  AlertTriangle,
  RotateCcw,
  Send,
  Lock,
  Unlock,
  Wrench,
  History,
  Rocket,
  DollarSign
} from 'lucide-react';
import axios from 'axios';
import TenantLicensesTab from './TenantLicensesTab';
import TenantBillingTab from './TenantBillingTab';
import TenantVersionTab from './TenantVersionTab';
import TenantEmailsTab from './TenantEmailsTab';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const ADMIN_API = `${BACKEND_URL}/api/admin`;
const CONTROL_PLANE_API = `${BACKEND_URL}/api/admin/control-plane`;

const TenantDetailPage = () => {
  const { tenantId } = useParams();
  const { getAdminToken } = useAdminAuth();
  const navigate = useNavigate();
  
  // State
  const [tenant, setTenant] = useState(null);
  const [users, setUsers] = useState([]);
  const [modules, setModules] = useState([]);
  const [availableModules, setAvailableModules] = useState([]);
  const [limits, setLimits] = useState([]);
  const [provisioningJobs, setProvisioningJobs] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [supportReason, setSupportReason] = useState('');

  const headers = { Authorization: `Bearer ${getAdminToken()}` };

  // Fetch all tenant data
  const fetchTenantData = async () => {
    setLoading(true);
    try {
      const [tenantRes, usersRes] = await Promise.all([
        axios.get(`${ADMIN_API}/tenants/${tenantId}`, { headers }),
        axios.get(`${ADMIN_API}/tenants/${tenantId}/users`, { headers }).catch(() => ({ data: { users: [] } }))
      ]);
      
      setTenant(tenantRes.data);
      setUsers(usersRes.data.users || []);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch tenant:', err);
      setError('Failed to load tenant details');
    } finally {
      setLoading(false);
    }
  };

  // Fetch modules
  const fetchModules = async () => {
    try {
      // Fetch both tenant-specific modules and available modules
      const [tenantModulesRes, availableRes] = await Promise.all([
        axios.get(`${CONTROL_PLANE_API}/tenants/${tenantId}/modules`, { headers }).catch(() => ({ data: [] })),
        axios.get(`${CONTROL_PLANE_API}/modules/available`, { headers })
      ]);
      
      // tenant modules API returns a list directly, not {modules: [...]}
      const tenantModulesData = Array.isArray(tenantModulesRes.data) 
        ? tenantModulesRes.data 
        : (tenantModulesRes.data.modules || []);
      
      const availModules = availableRes.data.modules || [];
      
      console.log('[TenantDetailPage] Available modules loaded:', availModules.length);
      console.log('[TenantDetailPage] First module:', availModules[0]);
      
      setModules(tenantModulesData);
      setAvailableModules(availModules);
    } catch (err) {
      console.error('Failed to fetch modules:', err);
    }
  };

  // Fetch limits
  const fetchLimits = async () => {
    try {
      const res = await axios.get(`${CONTROL_PLANE_API}/tenants/${tenantId}/limits`, { headers });
      setLimits(res.data.limits || []);
    } catch (err) {
      console.error('Failed to fetch limits:', err);
    }
  };

  // Fetch provisioning jobs
  const fetchProvisioningJobs = async () => {
    try {
      const res = await axios.get(`${CONTROL_PLANE_API}/tenants/${tenantId}/provisioning/jobs`, { headers });
      setProvisioningJobs(res.data.jobs || []);
    } catch (err) {
      console.error('Failed to fetch provisioning jobs:', err);
    }
  };

  // Fetch audit logs
  const fetchAuditLogs = async () => {
    try {
      const res = await axios.get(`${ADMIN_API}/audit-logs`, { 
        headers,
        params: { tenant_id: tenantId, limit: 50 }
      });
      setAuditLogs(res.data.logs || []);
    } catch (err) {
      console.error('Failed to fetch audit logs:', err);
    }
  };

  useEffect(() => {
    fetchTenantData();
  }, [tenantId]);

  useEffect(() => {
    if (activeTab === 'modules') {
      fetchModules();
      fetchTenantData(); // Refresh tenant data to get latest module_entitlements
    }
    if (activeTab === 'limits') fetchLimits();
    if (activeTab === 'provisioning') fetchProvisioningJobs();
    if (activeTab === 'audit') fetchAuditLogs();
  }, [activeTab]);

  // Support Actions
  const handleSupportAction = async (action) => {
    setActionLoading(true);
    try {
      await axios.post(`${CONTROL_PLANE_API}/tenants/${tenantId}/support/action`, 
        { action, reason: supportReason || `Admin action: ${action}` },
        { headers }
      );
      setSupportReason('');
      fetchTenantData();
    } catch (err) {
      console.error(`Failed to ${action}:`, err);
    } finally {
      setActionLoading(false);
    }
  };

  // Toggle module
  const handleToggleModule = async (moduleCode, isEnabled) => {
    try {
      const endpoint = isEnabled 
        ? `${CONTROL_PLANE_API}/tenants/${tenantId}/modules/${moduleCode}/disable`
        : `${CONTROL_PLANE_API}/tenants/${tenantId}/modules/${moduleCode}/enable`;
      await axios.post(endpoint, {}, { headers });
      fetchModules();
    } catch (err) {
      console.error('Failed to toggle module:', err);
    }
  };

  // Retry provisioning job
  const handleRetryJob = async (jobId) => {
    try {
      await axios.post(`${CONTROL_PLANE_API}/tenants/${tenantId}/provisioning/jobs/${jobId}/retry`, {}, { headers });
      fetchProvisioningJobs();
    } catch (err) {
      console.error('Failed to retry job:', err);
    }
  };

  // Status badge helper
  const getStatusBadge = (status) => {
    const normalizedStatus = (status || 'active').toLowerCase();
    const config = {
      active: { color: 'bg-green-100 text-green-700 border-green-200', icon: CheckCircle },
      suspended: { color: 'bg-red-100 text-red-700 border-red-200', icon: XCircle },
      trial: { color: 'bg-blue-100 text-blue-700 border-blue-200', icon: Clock },
      pending: { color: 'bg-yellow-100 text-yellow-700 border-yellow-200', icon: Clock },
      provisioning: { color: 'bg-indigo-100 text-indigo-700 border-indigo-200', icon: Loader2 },
      read_only: { color: 'bg-orange-100 text-orange-700 border-orange-200', icon: AlertCircle },
      terminated: { color: 'bg-slate-100 text-slate-700 border-slate-200', icon: XCircle },
    };
    const { color, icon: Icon } = config[normalizedStatus] || config.active;
    return (
      <Badge variant="outline" className={`${color} flex items-center gap-1`}>
        <Icon className={`h-3 w-3 ${normalizedStatus === 'provisioning' ? 'animate-spin' : ''}`} />
        <span className="capitalize">{status || 'Active'}</span>
      </Badge>
    );
  };

  const getPlanBadge = (plan) => {
    const colors = {
      free: 'bg-slate-100 text-slate-700',
      starter: 'bg-blue-100 text-blue-700',
      professional: 'bg-purple-100 text-purple-700',
      enterprise: 'bg-amber-100 text-amber-700'
    };
    return <Badge className={`${colors[plan] || colors.free} capitalize`}>{plan || 'Free'}</Badge>;
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (error || !tenant) {
    return (
      <div className="p-6">
        <Card className="border-red-200 bg-red-50">
          <CardContent className="flex items-center gap-3 p-6">
            <AlertCircle className="h-6 w-6 text-red-600" />
            <div>
              <p className="font-medium text-red-900">{error || 'Tenant not found'}</p>
              <Button variant="link" className="p-0 h-auto text-red-600" onClick={() => navigate('/admin/tenants')}>
                Back to Tenants
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/admin/tenants')}
          className="mb-4 text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Tenants
        </Button>

        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
              <span className="text-2xl text-white font-bold">
                {(tenant.tenant_name || tenant.company_name)?.[0] || 'T'}
              </span>
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-slate-900">{tenant.tenant_name || tenant.company_name}</h1>
                {getStatusBadge(tenant.status)}
              </div>
              <p className="text-slate-500 mt-1">{tenant.organization_name || tenant.industry}</p>
              <div className="flex items-center gap-3 mt-2">
                {getPlanBadge(tenant.plan)}
                <span className="text-sm text-slate-500">ID: {tenant.id.slice(0, 8)}...</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={fetchTenantData}>
              <RefreshCw className="h-4 w-4 mr-1" />
              Refresh
            </Button>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Users</p>
                <p className="text-2xl font-bold text-slate-900">
                  {tenant.current_users || 0}
                  <span className="text-sm font-normal text-slate-400"> / {tenant.seat_limit || 10}</span>
                </p>
              </div>
              <div className="p-3 bg-emerald-50 rounded-lg">
                <Users className="h-5 w-5 text-emerald-600" />
              </div>
            </div>
            <Progress 
              value={tenant.seat_limit ? ((tenant.current_users || 0) / tenant.seat_limit) * 100 : 0} 
              className="h-1.5 mt-3"
            />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Storage</p>
                <p className="text-2xl font-bold text-slate-900">
                  {((tenant.current_storage_mb || 0) / 1024).toFixed(1)}
                  <span className="text-sm font-normal text-slate-400"> GB</span>
                </p>
              </div>
              <div className="p-3 bg-violet-50 rounded-lg">
                <HardDrive className="h-5 w-5 text-violet-600" />
              </div>
            </div>
            <Progress 
              value={tenant.max_storage_mb ? ((tenant.current_storage_mb || 0) / tenant.max_storage_mb) * 100 : 0} 
              className="h-1.5 mt-3"
            />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Modules</p>
                <p className="text-2xl font-bold text-slate-900">
                  {(tenant.module_entitlements || []).length}
                </p>
              </div>
              <div className="p-3 bg-blue-50 rounded-lg">
                <Boxes className="h-5 w-5 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Created</p>
                <p className="text-lg font-bold text-slate-900">
                  {tenant.created_at ? new Date(tenant.created_at).toLocaleDateString() : 'N/A'}
                </p>
              </div>
              <div className="p-3 bg-amber-50 rounded-lg">
                <Calendar className="h-5 w-5 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-slate-100 p-1 flex flex-wrap">
          <TabsTrigger value="overview" className="data-[state=active]:bg-white">
            <Building2 className="h-4 w-4 mr-2" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="subscription" className="data-[state=active]:bg-white">
            <CreditCard className="h-4 w-4 mr-2" />
            Subscription
          </TabsTrigger>
          <TabsTrigger value="licenses" className="data-[state=active]:bg-white">
            <Key className="h-4 w-4 mr-2" />
            Licenses
          </TabsTrigger>
          <TabsTrigger value="modules" className="data-[state=active]:bg-white">
            <Boxes className="h-4 w-4 mr-2" />
            Modules
          </TabsTrigger>
          <TabsTrigger value="billing" className="data-[state=active]:bg-white">
            <DollarSign className="h-4 w-4 mr-2" />
            Billing
          </TabsTrigger>
          <TabsTrigger value="version" className="data-[state=active]:bg-white">
            <Rocket className="h-4 w-4 mr-2" />
            Version
          </TabsTrigger>
          <TabsTrigger value="limits" className="data-[state=active]:bg-white">
            <BarChart3 className="h-4 w-4 mr-2" />
            Limits
          </TabsTrigger>
          <TabsTrigger value="users" className="data-[state=active]:bg-white">
            <Users className="h-4 w-4 mr-2" />
            Users
          </TabsTrigger>
          <TabsTrigger value="emails" className="data-[state=active]:bg-white">
            <Mail className="h-4 w-4 mr-2" />
            Emails
          </TabsTrigger>
          <TabsTrigger value="audit" className="data-[state=active]:bg-white">
            <History className="h-4 w-4 mr-2" />
            Audit
          </TabsTrigger>
          <TabsTrigger value="support" className="data-[state=active]:bg-white">
            <Wrench className="h-4 w-4 mr-2" />
            Support
          </TabsTrigger>
        </TabsList>

        {/* OVERVIEW TAB */}
        <TabsContent value="overview">
          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  Organization Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center py-2 border-b">
                  <span className="text-slate-500">Company Name</span>
                  <span className="font-medium">{tenant.tenant_name || tenant.company_name}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b">
                  <span className="text-slate-500">Organization</span>
                  <span className="font-medium">{tenant.organization_name || '-'}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b">
                  <span className="text-slate-500">Industry</span>
                  <span className="font-medium capitalize">{tenant.industry || 'Not specified'}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b">
                  <span className="text-slate-500">Subdomain</span>
                  <span className="font-medium font-mono">{tenant.subdomain || '-'}</span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-slate-500">Region</span>
                  <span className="font-medium">{tenant.region || 'Default'}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  Admin Contact
                </CardTitle>
              </CardHeader>
              <CardContent>
                {tenant.admin_user ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                      <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center">
                        <span className="text-indigo-700 font-medium text-lg">
                          {tenant.admin_user.first_name?.[0]}{tenant.admin_user.last_name?.[0]}
                        </span>
                      </div>
                      <div>
                        <p className="font-medium">{tenant.admin_user.first_name} {tenant.admin_user.last_name}</p>
                        <p className="text-sm text-slate-500">{tenant.admin_user.email}</p>
                      </div>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b">
                      <span className="text-slate-500">Role</span>
                      <Badge variant="outline">{tenant.admin_user.role || 'Admin'}</Badge>
                    </div>
                    <div className="flex justify-between items-center py-2">
                      <span className="text-slate-500">Last Login</span>
                      <span className="text-sm">{tenant.admin_user.last_login ? new Date(tenant.admin_user.last_login).toLocaleString() : 'Never'}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-slate-500 text-center py-4">No admin user assigned</p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* SUBSCRIPTION TAB */}
        <TabsContent value="subscription">
          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <CreditCard className="h-4 w-4" />
                  Plan Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center py-2 border-b">
                  <span className="text-slate-500">Current Plan</span>
                  {getPlanBadge(tenant.plan)}
                </div>
                <div className="flex justify-between items-center py-2 border-b">
                  <span className="text-slate-500">Billing Status</span>
                  <Badge className={`
                    ${tenant.billing_status === 'CURRENT' ? 'bg-green-100 text-green-700' : ''}
                    ${tenant.billing_status === 'OVERDUE' ? 'bg-red-100 text-red-700' : ''}
                    ${tenant.billing_status === 'PENDING' ? 'bg-yellow-100 text-yellow-700' : ''}
                  `}>
                    {tenant.billing_status || 'Current'}
                  </Badge>
                </div>
                <div className="flex justify-between items-center py-2 border-b">
                  <span className="text-slate-500">Seat Limit</span>
                  <span className="font-medium">{tenant.seat_limit || 10} users</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b">
                  <span className="text-slate-500">Storage Limit</span>
                  <span className="font-medium">{((tenant.max_storage_mb || 1024) / 1024).toFixed(0)} GB</span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-slate-500">Trial Period</span>
                  <span className="font-medium">
                    {tenant.is_trial ? (
                      <Badge className="bg-blue-100 text-blue-700">
                        Ends {tenant.trial_ends_at ? new Date(tenant.trial_ends_at).toLocaleDateString() : 'N/A'}
                      </Badge>
                    ) : 'No'}
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <CreditCard className="h-4 w-4" />
                  Billing Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center py-2 border-b">
                  <span className="text-slate-500">Stripe Customer ID</span>
                  <span className="font-mono text-sm">{tenant.stripe_customer_id || 'Not connected'}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b">
                  <span className="text-slate-500">Subscription ID</span>
                  <span className="font-mono text-sm">{tenant.stripe_subscription_id || 'None'}</span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-slate-500">Next Billing Date</span>
                  <span className="font-medium">
                    {tenant.next_billing_date ? new Date(tenant.next_billing_date).toLocaleDateString() : 'N/A'}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* MODULES TAB */}
        <TabsContent value="modules">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Boxes className="h-4 w-4" />
                    Module Entitlements
                  </CardTitle>
                  <CardDescription>
                    Enable or disable modules for this tenant. 
                    Current plan: <Badge variant="outline" className="ml-1">{tenant.plan}</Badge>
                  </CardDescription>
                </div>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={async () => {
                    try {
                      setActionLoading(true);
                      await axios.post(
                        `${CONTROL_PLANE_API}/tenants/${tenantId}/plan/sync`,
                        {},
                        { headers }
                      );
                      await fetchModules();
                      await fetchTenantData();
                    } catch (err) {
                      console.error('Sync failed:', err);
                    } finally {
                      setActionLoading(false);
                    }
                  }}
                  disabled={actionLoading}
                >
                  <RotateCcw className={`h-4 w-4 mr-2 ${actionLoading ? 'animate-spin' : ''}`} />
                  Sync with Plan
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {availableModules.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
                  <p>Loading modules...</p>
                </div>
              ) : (
                <>
                  {/* Debug info */}
                  <p className="text-xs text-slate-400 mb-4">
                    Showing {availableModules.length} available modules | 
                    Tenant has {(tenant?.module_entitlements || []).length} entitlements
                  </p>
                  
                  {/* Group modules by category */}
                  {Object.entries(
                    availableModules.reduce((groups, module) => {
                      const cat = module.category || 'other';
                      if (!groups[cat]) groups[cat] = [];
                      groups[cat].push(module);
                      return groups;
                    }, {})
                  ).sort(([a], [b]) => {
                    const order = ['core', 'productivity', 'admin', 'automation', 'data', 'engagement', 'ai', 'advanced', 'analytics', 'config'];
                    return order.indexOf(a) - order.indexOf(b);
                  }).map(([category, categoryModules]) => (
                    <div key={category} className="mb-6">
                      <h4 className="text-sm font-semibold text-slate-700 uppercase tracking-wider mb-3 capitalize">
                        {category}
                      </h4>
                      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {categoryModules.map((module, idx) => {
                          const dbModule = modules.find(m => m.module_code === module.api_name);
                          // Check if module is enabled via: 1) tenant_modules collection, 2) tenant.module_entitlements
                          const tenantEntitlements = tenant?.module_entitlements || [];
                          const isEnabled = dbModule?.is_enabled === true || tenantEntitlements.includes(module.api_name);
                          const moduleName = module.name || 'No Name';
                          const moduleApiName = module.api_name || `idx-${idx}`;
                          
                          return (
                            <div 
                              key={moduleApiName} 
                              className={`p-4 border rounded-lg transition-colors ${isEnabled ? 'bg-green-50 border-green-200' : 'bg-slate-50 border-slate-200'}`}
                            >
                              <div className="flex items-start justify-between">
                                <div className="flex items-center gap-3">
                                  <div className={`p-2 rounded-lg ${isEnabled ? 'bg-green-100' : 'bg-slate-200'}`}>
                                    <Boxes className={`h-5 w-5 ${isEnabled ? 'text-green-600' : 'text-slate-500'}`} />
                                  </div>
                                  <div>
                                    <div className="font-medium text-slate-900 flex items-center gap-2">
                                      <span>{moduleName}</span>
                                      {module.is_premium && (
                                        <Badge className="bg-amber-100 text-amber-700 text-[10px]">Premium</Badge>
                                      )}
                                    </div>
                                    <p className="text-xs text-slate-500">{module.description || moduleApiName}</p>
                                  </div>
                                </div>
                                <Switch
                                  checked={isEnabled}
                                  onCheckedChange={() => handleToggleModule(module.api_name, isEnabled)}
                                />
                              </div>
                              {dbModule && dbModule.enabled_source && (
                                <div className="mt-3 pt-3 border-t text-xs text-slate-500">
                                  Source: {dbModule.enabled_source}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* LICENSES TAB */}
        <TabsContent value="licenses">
          <TenantLicensesTab tenantId={tenantId} getAdminToken={getAdminToken} />
        </TabsContent>

        {/* BILLING TAB */}
        <TabsContent value="billing">
          <TenantBillingTab tenantId={tenantId} getAdminToken={getAdminToken} />
        </TabsContent>

        {/* VERSION TAB */}
        <TabsContent value="version">
          <TenantVersionTab tenantId={tenantId} getAdminToken={getAdminToken} />
        </TabsContent>

        {/* LIMITS TAB */}
        <TabsContent value="limits">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Limits & Quotas
              </CardTitle>
              <CardDescription>Resource usage and limits</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {[
                  { key: 'MAX_USERS', label: 'Users', icon: Users, unit: 'users', consumed: tenant.current_users || 0, limit: tenant.seat_limit || 10 },
                  { key: 'MAX_STORAGE_GB', label: 'Storage', icon: HardDrive, unit: 'GB', consumed: ((tenant.current_storage_mb || 0) / 1024).toFixed(1), limit: ((tenant.max_storage_mb || 25600) / 1024).toFixed(0) },
                  { key: 'MAX_CUSTOM_OBJECTS', label: 'Custom Objects', icon: Database, unit: 'objects' },
                  { key: 'MAX_CUSTOM_FIELDS', label: 'Custom Fields', icon: FileText, unit: 'fields' },
                  { key: 'MAX_ACTIVE_FLOWS', label: 'Active Flows', icon: Zap, unit: 'flows' },
                  { key: 'MAX_API_CALLS_PER_DAY', label: 'API Calls / Day', icon: Activity, unit: 'calls' },
                ].map((item) => {
                  const Icon = item.icon;
                  const limitData = limits.find(l => l.limit_key === item.key);
                  const consumed = item.consumed !== undefined ? item.consumed : (limitData?.consumed_value || 0);
                  const limit = item.limit !== undefined ? item.limit : (limitData?.limit_value || 0);
                  const percent = limit > 0 ? Math.min(100, Math.round((consumed / limit) * 100)) : 0;
                  const isWarning = percent >= 80;
                  const isCritical = percent >= 95;
                  
                  return (
                    <div key={item.key} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Icon className={`h-4 w-4 ${isCritical ? 'text-red-500' : isWarning ? 'text-amber-500' : 'text-slate-500'}`} />
                          <span className="font-medium text-slate-700">{item.label}</span>
                        </div>
                        <div className="text-sm">
                          <span className={`font-bold ${isCritical ? 'text-red-600' : isWarning ? 'text-amber-600' : 'text-slate-900'}`}>
                            {consumed}
                          </span>
                          <span className="text-slate-400"> / {limit} {item.unit}</span>
                        </div>
                      </div>
                      <Progress 
                        value={percent} 
                        className={`h-2 ${isCritical ? '[&>div]:bg-red-500' : isWarning ? '[&>div]:bg-amber-500' : ''}`}
                      />
                      {(isWarning || isCritical) && (
                        <p className={`text-xs ${isCritical ? 'text-red-600' : 'text-amber-600'}`}>
                          {isCritical ? 'Critical: Limit almost reached!' : 'Warning: Approaching limit'}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* USERS TAB */}
        <TabsContent value="users">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4" />
                Tenant Users ({users.length})
              </CardTitle>
              <CardDescription>
                Users with pending password setup will show a reset link you can copy and share
              </CardDescription>
            </CardHeader>
            <CardContent>
              {users.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Password Setup</TableHead>
                      <TableHead>Last Login</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center">
                              <span className="text-indigo-700 font-medium text-sm">
                                {user.first_name?.[0]}{user.last_name?.[0]}
                              </span>
                            </div>
                            <span className="font-medium">{user.first_name} {user.last_name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-slate-500">{user.email}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">{user.role}</Badge>
                        </TableCell>
                        <TableCell>
                          {user.is_active ? (
                            <Badge className="bg-green-100 text-green-700">Active</Badge>
                          ) : (
                            <Badge className="bg-red-100 text-red-700">Inactive</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {user.password_reset_token ? (
                            <div className="flex items-center gap-2">
                              <Badge className="bg-yellow-100 text-yellow-700">Pending</Badge>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs"
                                onClick={() => {
                                  const resetUrl = `${window.location.origin}/reset-password?token=${user.password_reset_token}`;
                                  navigator.clipboard.writeText(resetUrl);
                                  alert('Reset link copied to clipboard!');
                                }}
                                data-testid={`copy-reset-link-${user.id}`}
                              >
                                <Key className="h-3 w-3 mr-1" />
                                Copy Reset Link
                              </Button>
                            </div>
                          ) : user.must_change_password ? (
                            <Badge className="bg-orange-100 text-orange-700">Must Change</Badge>
                          ) : (
                            <Badge className="bg-green-100 text-green-700">Completed</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-slate-500">
                          {user.last_login ? new Date(user.last_login).toLocaleString() : 'Never'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-slate-500">
                  <Users className="h-10 w-10 mx-auto mb-2 text-slate-300" />
                  <p>No users found</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* EMAILS TAB */}
        <TabsContent value="emails">
          <TenantEmailsTab tenantId={tenantId} getAdminToken={getAdminToken} />
        </TabsContent>

        {/* PROVISIONING TAB */}
        <TabsContent value="provisioning">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Server className="h-4 w-4" />
                Provisioning Jobs
              </CardTitle>
              <CardDescription>Environment provisioning and modification history</CardDescription>
            </CardHeader>
            <CardContent>
              {provisioningJobs.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Job Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Requested By</TableHead>
                      <TableHead>Started</TableHead>
                      <TableHead>Completed</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {provisioningJobs.map((job) => (
                      <TableRow key={job.id}>
                        <TableCell className="font-medium">{job.job_type}</TableCell>
                        <TableCell>
                          <Badge className={`
                            ${job.status === 'COMPLETED' ? 'bg-green-100 text-green-700' : ''}
                            ${job.status === 'RUNNING' ? 'bg-blue-100 text-blue-700' : ''}
                            ${job.status === 'QUEUED' ? 'bg-yellow-100 text-yellow-700' : ''}
                            ${job.status === 'FAILED' ? 'bg-red-100 text-red-700' : ''}
                          `}>
                            {job.status === 'RUNNING' && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                            {job.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-slate-500">{job.requested_by || 'System'}</TableCell>
                        <TableCell className="text-sm text-slate-500">
                          {job.started_at ? new Date(job.started_at).toLocaleString() : '-'}
                        </TableCell>
                        <TableCell className="text-sm text-slate-500">
                          {job.completed_at ? new Date(job.completed_at).toLocaleString() : '-'}
                        </TableCell>
                        <TableCell>
                          {job.status === 'FAILED' && (
                            <Button size="sm" variant="outline" onClick={() => handleRetryJob(job.id)}>
                              <RotateCcw className="h-3 w-3 mr-1" />
                              Retry
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-slate-500">
                  <Server className="h-10 w-10 mx-auto mb-2 text-slate-300" />
                  <p>No provisioning jobs</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* AUDIT TAB */}
        <TabsContent value="audit">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <History className="h-4 w-4" />
                Audit Log
              </CardTitle>
              <CardDescription>Recent changes and actions</CardDescription>
            </CardHeader>
            <CardContent>
              {auditLogs.length > 0 ? (
                <div className="space-y-3">
                  {auditLogs.map((log, idx) => (
                    <div key={idx} className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg">
                      <div className="p-2 bg-white rounded-lg border">
                        <Activity className="h-4 w-4 text-slate-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <p className="font-medium text-slate-900">{log.action}</p>
                          <span className="text-xs text-slate-500">
                            {log.created_at ? new Date(log.created_at).toLocaleString() : ''}
                          </span>
                        </div>
                        <p className="text-sm text-slate-500 mt-1">{log.description || log.entity_type}</p>
                        {log.performed_by && (
                          <p className="text-xs text-slate-400 mt-1">By: {log.performed_by}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-slate-500">
                  <History className="h-10 w-10 mx-auto mb-2 text-slate-300" />
                  <p>No audit logs found</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* SUPPORT TAB */}
        <TabsContent value="support">
          <div className="grid md:grid-cols-2 gap-6">
            {/* Operational Controls */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Wrench className="h-4 w-4" />
                  Operational Controls
                </CardTitle>
                <CardDescription>Manage tenant access and status</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Reason (optional)</Label>
                  <Textarea
                    placeholder="Enter reason for this action..."
                    value={supportReason}
                    onChange={(e) => setSupportReason(e.target.value)}
                    className="h-20"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3 pt-4">
                  {/* Suspend/Reactivate */}
                  {(tenant.status || '').toLowerCase() === 'active' ? (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" className="w-full text-amber-600 border-amber-200 hover:bg-amber-50">
                          <Pause className="h-4 w-4 mr-2" />
                          Suspend Tenant
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Suspend Tenant?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will block all access for {tenant.tenant_name}. Users cannot log in until reactivated.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleSupportAction('SUSPEND')} className="bg-amber-600">
                            Suspend
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  ) : (
                    <Button 
                      variant="outline" 
                      className="w-full text-green-600 border-green-200 hover:bg-green-50"
                      onClick={() => handleSupportAction('REACTIVATE')}
                      disabled={actionLoading}
                    >
                      <Play className="h-4 w-4 mr-2" />
                      Reactivate
                    </Button>
                  )}

                  {/* Read-Only Mode */}
                  <Button 
                    variant="outline" 
                    className="w-full text-orange-600 border-orange-200 hover:bg-orange-50"
                    onClick={() => handleSupportAction('SET_READ_ONLY')}
                    disabled={actionLoading}
                  >
                    <EyeOff className="h-4 w-4 mr-2" />
                    Read-Only Mode
                  </Button>

                  {/* Maintenance Mode */}
                  <Button 
                    variant="outline" 
                    className="w-full"
                    onClick={() => handleSupportAction('MAINTENANCE')}
                    disabled={actionLoading}
                  >
                    <Wrench className="h-4 w-4 mr-2" />
                    Maintenance Mode
                  </Button>

                  {/* Resend Welcome Email */}
                  <Button 
                    variant="outline" 
                    className="w-full"
                    onClick={() => handleSupportAction('RESEND_WELCOME')}
                    disabled={actionLoading}
                  >
                    <Send className="h-4 w-4 mr-2" />
                    Resend Welcome
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Danger Zone */}
            <Card className="border-red-200">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2 text-red-600">
                  <AlertTriangle className="h-4 w-4" />
                  Danger Zone
                </CardTitle>
                <CardDescription>Irreversible actions</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Reset Admin Password */}
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" className="w-full text-slate-600">
                      <Key className="h-4 w-4 mr-2" />
                      Reset Admin Password
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Reset Admin Password?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will generate a new password and send it to the admin's email.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => handleSupportAction('RESET_ADMIN')}>
                        Reset Password
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>

                {/* Terminate Tenant */}
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" className="w-full text-red-600 border-red-200 hover:bg-red-50">
                      <Trash2 className="h-4 w-4 mr-2" />
                      Terminate Tenant
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Terminate Tenant?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently mark the tenant as terminated. Data will be retained but all access will be blocked.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => handleSupportAction('TERMINATE')} className="bg-red-600">
                        Terminate
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default TenantDetailPage;
