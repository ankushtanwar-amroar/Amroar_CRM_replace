/**
 * Tenant Usage Page
 * Shows usage vs limits for a specific tenant
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAdminAuth } from '../auth/AdminAuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { Progress } from '../../../components/ui/progress';
import {
  ArrowLeft,
  RefreshCw,
  Users,
  HardDrive,
  Zap,
  Play,
  Box,
  AlertTriangle,
  CheckCircle,
  TrendingUp
} from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const UsageCard = ({ title, icon: Icon, current, limit, unit, description, color }) => {
  const percent = limit > 0 ? Math.min(100, (current / limit) * 100) : 0;
  const remaining = Math.max(0, limit - current);
  
  let statusColor = 'text-green-600';
  let progressColor = 'bg-green-500';
  
  if (percent >= 90) {
    statusColor = 'text-red-600';
    progressColor = 'bg-red-500';
  } else if (percent >= 75) {
    statusColor = 'text-orange-600';
    progressColor = 'bg-orange-500';
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`p-2 rounded-lg ${color}`}>
              <Icon className="h-5 w-5" />
            </div>
            <CardTitle className="text-lg">{title}</CardTitle>
          </div>
          <Badge variant={percent >= 90 ? 'destructive' : percent >= 75 ? 'warning' : 'secondary'}>
            {percent.toFixed(1)}%
          </Badge>
        </div>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <Progress value={percent} className="h-3" indicatorClassName={progressColor} />
          <div className="flex justify-between text-sm">
            <span className="text-slate-600">
              <span className="font-semibold text-slate-900">{current.toLocaleString()}</span> / {limit.toLocaleString()} {unit}
            </span>
            <span className={statusColor}>
              {remaining.toLocaleString()} {unit} remaining
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

const TenantUsagePage = () => {
  const { tenantId } = useParams();
  const navigate = useNavigate();
  const { getAdminToken } = useAdminAuth();
  const [usage, setUsage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchUsage = useCallback(async () => {
    const token = getAdminToken();
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_URL}/api/admin/tenants/${tenantId}/usage`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch tenant usage');
      }

      const data = await response.json();
      setUsage(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [getAdminToken, tenantId]);

  useEffect(() => {
    fetchUsage();
  }, [fetchUsage]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <RefreshCw className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-24">
        <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-slate-900 mb-2">Error Loading Usage</h2>
        <p className="text-slate-600 mb-4">{error}</p>
        <Button onClick={fetchUsage}>Try Again</Button>
      </div>
    );
  }

  if (!usage) {
    return (
      <div className="text-center py-24">
        <p className="text-slate-600">Tenant not found</p>
        <Button onClick={() => navigate('/admin/tenants')} className="mt-4">
          Back to Tenants
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} data-testid="usage-back-btn">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{usage.tenant_name}</h1>
            <p className="text-slate-600">Usage & Quotas Dashboard</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant={usage.status === 'active' ? 'default' : 'destructive'}>
            {usage.status}
          </Badge>
          <Badge variant="outline">{usage.plan} plan</Badge>
          <Button onClick={fetchUsage} variant="outline" className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Warnings */}
      {usage.warnings && usage.warnings.length > 0 && (
        <Card className="border-orange-200 bg-orange-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-orange-800 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Warnings
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {usage.warnings.map((warning, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <Badge variant={warning.severity === 'critical' ? 'destructive' : 'warning'} className="mt-0.5">
                    {warning.severity}
                  </Badge>
                  <span className="text-slate-700">{warning.message}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Usage Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Users */}
        <UsageCard
          title="User Seats"
          icon={Users}
          current={usage.users.total}
          limit={usage.users.limit}
          unit="users"
          description={`${usage.users.active} active, ${usage.users.invited} pending invitations`}
          color="bg-blue-100 text-blue-600"
        />

        {/* Storage */}
        <UsageCard
          title="Storage"
          icon={HardDrive}
          current={usage.storage.used_mb}
          limit={usage.storage.limit_mb}
          unit="MB"
          description={`${usage.storage.breakdown.record_count.toLocaleString()} records, ${usage.storage.breakdown.file_count.toLocaleString()} files`}
          color="bg-purple-100 text-purple-600"
        />

        {/* API Calls */}
        <UsageCard
          title="API Calls (Today)"
          icon={Zap}
          current={usage.api_calls.today}
          limit={usage.api_calls.daily_limit}
          unit="calls"
          description="Resets daily at midnight UTC"
          color="bg-yellow-100 text-yellow-600"
        />

        {/* Automation */}
        <UsageCard
          title="Automation Runs"
          icon={Play}
          current={usage.automation.runs_this_month}
          limit={usage.automation.monthly_limit}
          unit="runs"
          description={`${usage.automation.total_flows} total flows, ${usage.automation.active_flows} active`}
          color="bg-green-100 text-green-600"
        />
      </div>

      {/* Additional Info */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Modules */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Box className="h-5 w-5 text-indigo-600" />
              Active Modules
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {usage.modules.enabled.length > 0 ? (
                usage.modules.enabled.map((mod) => (
                  <Badge key={mod} variant="secondary" className="capitalize">
                    {mod.replace(/_/g, ' ')}
                  </Badge>
                ))
              ) : (
                <span className="text-slate-500">No modules enabled</span>
              )}
            </div>
            <div className="mt-4 text-sm text-slate-600">
              {usage.modules.count} modules enabled
            </div>
          </CardContent>
        </Card>

        {/* Objects */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-emerald-600" />
              CRM Objects
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-slate-900">
              {usage.objects.count}
            </div>
            <div className="text-sm text-slate-600 mt-2">
              Custom and system objects
            </div>
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button variant="outline" className="w-full justify-start" asChild>
              <Link to={`/admin/tenants/${tenantId}`}>
                View Tenant Details
              </Link>
            </Button>
            <Button variant="outline" className="w-full justify-start" asChild>
              <Link to={`/admin/audit-logs?tenant_id=${tenantId}`}>
                View Audit Logs
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Storage Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Storage Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 bg-slate-50 rounded-lg">
              <div className="text-2xl font-bold text-slate-900">
                {usage.storage.breakdown.records_mb.toFixed(2)} MB
              </div>
              <div className="text-sm text-slate-600">Records Storage</div>
            </div>
            <div className="p-4 bg-slate-50 rounded-lg">
              <div className="text-2xl font-bold text-slate-900">
                {usage.storage.breakdown.files_mb.toFixed(2)} MB
              </div>
              <div className="text-sm text-slate-600">File Storage</div>
            </div>
            <div className="p-4 bg-slate-50 rounded-lg">
              <div className="text-2xl font-bold text-slate-900">
                {usage.storage.breakdown.record_count.toLocaleString()}
              </div>
              <div className="text-sm text-slate-600">Total Records</div>
            </div>
            <div className="p-4 bg-slate-50 rounded-lg">
              <div className="text-2xl font-bold text-slate-900">
                {usage.storage.breakdown.file_count.toLocaleString()}
              </div>
              <div className="text-sm text-slate-600">Total Files</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Timestamp */}
      <div className="text-right text-sm text-slate-500">
        Last calculated: {new Date(usage.calculated_at).toLocaleString()}
      </div>
    </div>
  );
};

export default TenantUsagePage;
