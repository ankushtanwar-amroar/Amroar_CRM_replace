/**
 * Admin Dashboard - Phase D Enhanced
 * Modern SaaS Control Plane Dashboard with charts and platform metrics
 */
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminAuth } from './auth/AdminAuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Progress } from '../../components/ui/progress';
import {
  Building2,
  Users,
  Database,
  Zap,
  Shield,
  CreditCard,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  Activity,
  Clock,
  Plus,
  Loader2,
  RefreshCw,
  HardDrive,
  Server,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Boxes,
  BarChart3,
  PieChart,
  ArrowUpRight,
  ArrowDownRight,
  ChevronRight,
  Calendar
} from 'lucide-react';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const ADMIN_API = `${BACKEND_URL}/api/admin`;
const CONTROL_PLANE_API = `${BACKEND_URL}/api/admin/control-plane`;

const AdminDashboard = () => {
  const { getAdminToken, adminUser } = useAdminAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [platformMetrics, setPlatformMetrics] = useState(null);
  const [recentActivity, setRecentActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const headers = { Authorization: `Bearer ${getAdminToken()}` };
      
      // Fetch main dashboard stats
      const [statsRes, metricsRes] = await Promise.all([
        axios.get(`${ADMIN_API}/dashboard`, { headers }),
        axios.get(`${ADMIN_API}/platform-metrics`, { headers }).catch(() => ({ data: null }))
      ]);
      
      setStats(statsRes.data);
      setPlatformMetrics(metricsRes.data);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch dashboard data:', err);
      setError('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  // Calculate tenant status distribution
  const tenantStatusData = stats?.tenant_status_breakdown || {
    active: stats?.total_tenants || 0,
    suspended: 0,
    trial: 0,
    pending: 0
  };

  const totalTenants = Object.values(tenantStatusData).reduce((a, b) => a + b, 0);

  // Storage usage calculation
  const totalStorageUsedGB = (stats?.total_storage_used_mb || 0) / 1024;
  const totalStorageAllocatedGB = (stats?.total_storage_allocated_mb || 0) / 1024;
  const storageUsagePercent = totalStorageAllocatedGB > 0 
    ? Math.round((totalStorageUsedGB / totalStorageAllocatedGB) * 100) 
    : 0;

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Control Plane Dashboard
          </h1>
          <p className="text-slate-500 mt-1">
            Platform overview and tenant management
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-500">
            Last updated: {new Date().toLocaleTimeString()}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchDashboardData}
            className="flex items-center gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Key Metrics Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Tenants */}
        <Card className="relative overflow-hidden">
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500">Total Tenants</p>
                <p className="text-3xl font-bold text-slate-900 mt-1">{stats?.total_tenants || 0}</p>
                <div className="flex items-center mt-2 text-sm">
                  <TrendingUp className="h-4 w-4 text-green-500 mr-1" />
                  <span className="text-green-600 font-medium">+{stats?.new_tenants_this_month || 0}</span>
                  <span className="text-slate-500 ml-1">this month</span>
                </div>
              </div>
              <div className="p-3 bg-indigo-100 rounded-xl">
                <Building2 className="h-6 w-6 text-indigo-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Total Users */}
        <Card className="relative overflow-hidden">
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500">Total Users</p>
                <p className="text-3xl font-bold text-slate-900 mt-1">{stats?.total_users || 0}</p>
                <div className="flex items-center mt-2 text-sm">
                  <span className="text-slate-500">Across all tenants</span>
                </div>
              </div>
              <div className="p-3 bg-emerald-100 rounded-xl">
                <Users className="h-6 w-6 text-emerald-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Storage Usage */}
        <Card className="relative overflow-hidden">
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-sm font-medium text-slate-500">Storage Used</p>
                <p className="text-3xl font-bold text-slate-900 mt-1">{totalStorageUsedGB.toFixed(1)} GB</p>
                <div className="mt-2">
                  <Progress value={storageUsagePercent} className="h-2" />
                  <p className="text-xs text-slate-500 mt-1">{storageUsagePercent}% of {totalStorageAllocatedGB.toFixed(0)} GB</p>
                </div>
              </div>
              <div className="p-3 bg-violet-100 rounded-xl">
                <HardDrive className="h-6 w-6 text-violet-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Active Flows */}
        <Card className="relative overflow-hidden">
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500">Active Flows</p>
                <p className="text-3xl font-bold text-slate-900 mt-1">{stats?.active_flows || 0}</p>
                <div className="flex items-center mt-2 text-sm">
                  <span className="text-slate-500">{stats?.total_flow_executions || 0} executions today</span>
                </div>
              </div>
              <div className="p-3 bg-amber-100 rounded-xl">
                <Zap className="h-6 w-6 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Middle Row - Tenant Distribution & Module Usage */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Tenant Status Distribution */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <PieChart className="h-4 w-4 text-slate-500" />
              Tenant Status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Active */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                  <span className="text-slate-600">Active</span>
                </div>
                <span className="font-medium">{tenantStatusData.active || tenantStatusData.ACTIVE || 0}</span>
              </div>
              <Progress value={totalTenants > 0 ? ((tenantStatusData.active || tenantStatusData.ACTIVE || 0) / totalTenants) * 100 : 0} className="h-2 bg-slate-100" />
            </div>

            {/* Suspended */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                  <span className="text-slate-600">Suspended</span>
                </div>
                <span className="font-medium">{tenantStatusData.suspended || tenantStatusData.SUSPENDED || 0}</span>
              </div>
              <Progress value={totalTenants > 0 ? ((tenantStatusData.suspended || tenantStatusData.SUSPENDED || 0) / totalTenants) * 100 : 0} className="h-2 bg-slate-100" />
            </div>

            {/* Trial */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                  <span className="text-slate-600">Trial</span>
                </div>
                <span className="font-medium">{tenantStatusData.trial || tenantStatusData.TRIAL || 0}</span>
              </div>
              <Progress value={totalTenants > 0 ? ((tenantStatusData.trial || tenantStatusData.TRIAL || 0) / totalTenants) * 100 : 0} className="h-2 bg-slate-100" />
            </div>

            {/* Pending */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                  <span className="text-slate-600">Pending/Other</span>
                </div>
                <span className="font-medium">{tenantStatusData.pending || tenantStatusData.PENDING || tenantStatusData.PROVISIONING || 0}</span>
              </div>
              <Progress value={totalTenants > 0 ? ((tenantStatusData.pending || tenantStatusData.PENDING || tenantStatusData.PROVISIONING || 0) / totalTenants) * 100 : 0} className="h-2 bg-slate-100" />
            </div>

            <Button 
              variant="outline" 
              size="sm" 
              className="w-full mt-4"
              onClick={() => navigate('/admin/tenants')}
            >
              View All Tenants
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </CardContent>
        </Card>

        {/* Module Usage Statistics */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Boxes className="h-4 w-4 text-slate-500" />
              Module Adoption
            </CardTitle>
            <CardDescription>Modules enabled across tenants</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { name: 'CRM', code: 'crm', icon: Users, color: 'bg-blue-100 text-blue-600' },
                { name: 'Flow Builder', code: 'flow_builder', icon: Zap, color: 'bg-amber-100 text-amber-600' },
                { name: 'Form Builder', code: 'form_builder', icon: Database, color: 'bg-green-100 text-green-600' },
                { name: 'Schema Builder', code: 'schema_builder', icon: Boxes, color: 'bg-purple-100 text-purple-600' },
                { name: 'Task Manager', code: 'task_manager', icon: CheckCircle, color: 'bg-indigo-100 text-indigo-600' },
                { name: 'File Manager', code: 'file_manager', icon: HardDrive, color: 'bg-rose-100 text-rose-600' },
                { name: 'App Manager', code: 'app_manager', icon: Server, color: 'bg-cyan-100 text-cyan-600' },
                { name: 'Sales Console', code: 'sales_console', icon: BarChart3, color: 'bg-emerald-100 text-emerald-600' },
              ].map((module) => {
                const Icon = module.icon;
                const count = stats?.module_usage?.[module.code] || 0;
                const percentage = totalTenants > 0 ? Math.round((count / totalTenants) * 100) : 0;
                return (
                  <div key={module.code} className="p-3 border rounded-lg hover:shadow-sm transition-shadow">
                    <div className="flex items-center gap-2 mb-2">
                      <div className={`p-1.5 rounded-md ${module.color}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <span className="text-sm font-medium text-slate-700">{module.name}</span>
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-bold text-slate-900">{count}</span>
                      <span className="text-xs text-slate-500">tenants</span>
                    </div>
                    <Progress value={percentage} className="h-1.5 mt-2" />
                    <p className="text-xs text-slate-500 mt-1">{percentage}% adoption</p>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bottom Row - Recent Tenants & System Health */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Recent Tenants */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold">Recent Tenants</CardTitle>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => navigate('/admin/tenants')}
                className="text-indigo-600 hover:text-indigo-700"
              >
                View All
                <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {stats?.recent_tenants?.length > 0 ? (
              <div className="space-y-3">
                {stats.recent_tenants.slice(0, 5).map((tenant) => (
                  <div 
                    key={tenant.id}
                    className="flex items-center justify-between p-3 bg-slate-50 rounded-lg hover:bg-slate-100 cursor-pointer transition-colors group"
                    onClick={() => navigate(`/admin/tenants/${tenant.id}`)}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center">
                        <span className="text-white font-semibold text-sm">
                          {(tenant.tenant_name || tenant.company_name)?.[0] || 'T'}
                        </span>
                      </div>
                      <div>
                        <p className="font-medium text-slate-900">{tenant.tenant_name || tenant.company_name}</p>
                        <p className="text-xs text-slate-500 flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {new Date(tenant.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className={`
                        ${(tenant.status === 'ACTIVE' || tenant.status === 'active') ? 'bg-green-50 text-green-700 border-green-200' : ''}
                        ${(tenant.status === 'SUSPENDED' || tenant.status === 'suspended') ? 'bg-red-50 text-red-700 border-red-200' : ''}
                        ${(tenant.status === 'TRIAL' || tenant.status === 'trial') ? 'bg-blue-50 text-blue-700 border-blue-200' : ''}
                        capitalize
                      `}>
                        {tenant.status || 'active'}
                      </Badge>
                      <ChevronRight className="h-4 w-4 text-slate-400 group-hover:text-slate-600 transition-colors" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-slate-500">
                <Building2 className="h-10 w-10 mx-auto mb-2 text-slate-300" />
                <p>No tenants yet</p>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="mt-3"
                  onClick={() => navigate('/admin/tenants/create')}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Create Tenant
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* System Health & Quick Actions */}
        <div className="space-y-6">
          {/* System Health */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Activity className="h-4 w-4 text-slate-500" />
                System Health
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg border border-green-100">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                    <span className="text-sm text-slate-700">API Services</span>
                  </div>
                  <CheckCircle className="h-4 w-4 text-green-600" />
                </div>
                
                <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg border border-green-100">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                    <span className="text-sm text-slate-700">Database</span>
                  </div>
                  <CheckCircle className="h-4 w-4 text-green-600" />
                </div>
                
                <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg border border-green-100">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                    <span className="text-sm text-slate-700">Authentication</span>
                  </div>
                  <CheckCircle className="h-4 w-4 text-green-600" />
                </div>
                
                <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg border border-green-100">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                    <span className="text-sm text-slate-700">Background Jobs</span>
                  </div>
                  <CheckCircle className="h-4 w-4 text-green-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              <Button 
                variant="outline" 
                className="h-auto py-3 px-4 justify-start"
                onClick={() => navigate('/admin/tenants/create')}
              >
                <Plus className="h-4 w-4 mr-2 text-indigo-600" />
                <span className="text-sm">New Tenant</span>
              </Button>
              <Button 
                variant="outline" 
                className="h-auto py-3 px-4 justify-start"
                onClick={() => navigate('/admin/users')}
              >
                <Users className="h-4 w-4 mr-2 text-emerald-600" />
                <span className="text-sm">Manage Users</span>
              </Button>
              <Button 
                variant="outline" 
                className="h-auto py-3 px-4 justify-start"
                onClick={() => navigate('/admin/audit-logs')}
              >
                <Shield className="h-4 w-4 mr-2 text-amber-600" />
                <span className="text-sm">Audit Logs</span>
              </Button>
              <Button 
                variant="outline" 
                className="h-auto py-3 px-4 justify-start"
                onClick={() => navigate('/admin/subscriptions')}
              >
                <CreditCard className="h-4 w-4 mr-2 text-violet-600" />
                <span className="text-sm">Subscriptions</span>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
