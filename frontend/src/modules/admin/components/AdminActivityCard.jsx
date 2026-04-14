/**
 * Admin Activity Card
 * Shows admin login history, failed attempts, and recent actions
 * Used in the Admin Dashboard
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useAdminAuth } from '../auth/AdminAuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../../components/ui/card';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import {
  Shield,
  AlertTriangle,
  Clock,
  RefreshCw,
  ChevronRight,
  User,
  CheckCircle,
  XCircle
} from 'lucide-react';
import { Link } from 'react-router-dom';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const AdminActivityCard = () => {
  const { getAdminToken } = useAdminAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchActivity = useCallback(async () => {
    const token = getAdminToken();
    try {
      const response = await fetch(`${API_URL}/api/admin/activity/dashboard`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.ok) {
        const result = await response.json();
        setData(result);
      }
    } catch (error) {
      console.error('Failed to fetch admin activity:', error);
    } finally {
      setLoading(false);
    }
  }, [getAdminToken]);

  useEffect(() => {
    fetchActivity();
  }, [fetchActivity]);

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Admin Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-6 w-6 animate-spin text-slate-400" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return null;
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Security Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-indigo-600" />
            Security Overview (24h)
          </CardTitle>
          <CardDescription>Recent security events and admin activity</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="p-4 bg-slate-50 rounded-lg">
              <div className="text-2xl font-bold text-slate-900">
                {data.summary_24h?.total_actions || 0}
              </div>
              <div className="text-sm text-slate-600">Total Actions</div>
            </div>
            <div className={`p-4 rounded-lg ${data.failed_logins_24h?.count > 0 ? 'bg-red-50' : 'bg-green-50'}`}>
              <div className={`text-2xl font-bold ${data.failed_logins_24h?.count > 0 ? 'text-red-600' : 'text-green-600'}`}>
                {data.failed_logins_24h?.count || 0}
              </div>
              <div className="text-sm text-slate-600">Failed Logins</div>
            </div>
          </div>

          {/* Action Breakdown */}
          {data.summary_24h?.action_breakdown && Object.keys(data.summary_24h.action_breakdown).length > 0 && (
            <div className="mt-4">
              <h4 className="text-sm font-medium text-slate-700 mb-2">Action Breakdown</h4>
              <div className="space-y-2">
                {Object.entries(data.summary_24h.action_breakdown).slice(0, 5).map(([action, count]) => (
                  <div key={action} className="flex items-center justify-between text-sm">
                    <span className="text-slate-600 capitalize">{action.replace(/_/g, ' ')}</span>
                    <Badge variant="secondary">{count}</Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          <Button variant="outline" className="w-full mt-4" asChild>
            <Link to="/admin/audit-logs">
              View All Audit Logs
              <ChevronRight className="h-4 w-4 ml-2" />
            </Link>
          </Button>
        </CardContent>
      </Card>

      {/* Active Admins */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5 text-blue-600" />
            Active Admins (7 days)
          </CardTitle>
          <CardDescription>Admins who have logged in recently</CardDescription>
        </CardHeader>
        <CardContent>
          {data.active_admins && data.active_admins.length > 0 ? (
            <div className="space-y-3">
              {data.active_admins.slice(0, 5).map((admin, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                  <div>
                    <div className="font-medium text-slate-900">{admin.email}</div>
                    <div className="text-xs text-slate-500 flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Last login: {formatDate(admin.last_login)}
                    </div>
                  </div>
                  <Badge variant="secondary">
                    {admin.login_count_7d} logins
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-slate-500">
              No admin activity in the last 7 days
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Login Attempts */}
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-emerald-600" />
            Recent Login Attempts
          </CardTitle>
          <CardDescription>Latest admin authentication events</CardDescription>
        </CardHeader>
        <CardContent>
          {data.recent_logins && data.recent_logins.length > 0 ? (
            <div className="space-y-2">
              {data.recent_logins.map((log, idx) => (
                <div 
                  key={idx} 
                  className={`flex items-center justify-between p-3 rounded-lg ${
                    log.action === 'admin_login_failed' ? 'bg-red-50' : 'bg-green-50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {log.action === 'admin_login_failed' ? (
                      <XCircle className="h-5 w-5 text-red-500" />
                    ) : (
                      <CheckCircle className="h-5 w-5 text-green-500" />
                    )}
                    <div>
                      <div className="font-medium text-slate-900">{log.actor_email}</div>
                      <div className="text-xs text-slate-500">
                        {log.action === 'admin_login_failed' && log.details?.reason && (
                          <span className="text-red-600">{log.details.reason} - </span>
                        )}
                        {formatDate(log.timestamp)}
                      </div>
                    </div>
                  </div>
                  <Badge variant={log.action === 'admin_login_failed' ? 'destructive' : 'default'}>
                    {log.action === 'admin_login_failed' ? 'Failed' : 'Success'}
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-slate-500">
              No recent login attempts
            </div>
          )}
        </CardContent>
      </Card>

      {/* Failed Login Alerts */}
      {data.failed_logins_24h?.count > 0 && (
        <Card className="lg:col-span-2 border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-800">
              <AlertTriangle className="h-5 w-5" />
              Failed Login Alerts (24h)
            </CardTitle>
            <CardDescription className="text-red-700">
              {data.failed_logins_24h.count} failed login attempts detected
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.failed_logins_24h.attempts.slice(0, 5).map((attempt, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 bg-white rounded-lg">
                  <div>
                    <div className="font-medium text-slate-900">{attempt.actor_email}</div>
                    <div className="text-xs text-slate-500">
                      {attempt.details?.reason} - {formatDate(attempt.timestamp)}
                    </div>
                  </div>
                  {attempt.ip_address && (
                    <Badge variant="outline" className="font-mono">
                      {attempt.ip_address}
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default AdminActivityCard;
