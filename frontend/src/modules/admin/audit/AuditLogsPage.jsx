/**
 * Audit Logs Page
 * Displays platform-level audit logs with filtering and search
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useAdminAuth } from '../auth/AdminAuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Badge } from '../../../components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../../../components/ui/dialog';
import {
  Search,
  Filter,
  Calendar,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Eye,
  Shield,
  UserCog,
  Building2,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock
} from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL;

// Action type to icon/color mapping
const actionConfig = {
  admin_login: { icon: Shield, color: 'bg-green-100 text-green-800', label: 'Admin Login' },
  admin_login_failed: { icon: XCircle, color: 'bg-red-100 text-red-800', label: 'Login Failed' },
  admin_logout: { icon: Shield, color: 'bg-gray-100 text-gray-800', label: 'Admin Logout' },
  tenant_created: { icon: Building2, color: 'bg-blue-100 text-blue-800', label: 'Tenant Created' },
  tenant_updated: { icon: Building2, color: 'bg-blue-100 text-blue-800', label: 'Tenant Updated' },
  tenant_suspended: { icon: AlertTriangle, color: 'bg-orange-100 text-orange-800', label: 'Tenant Suspended' },
  tenant_activated: { icon: CheckCircle, color: 'bg-green-100 text-green-800', label: 'Tenant Activated' },
  tenant_deleted: { icon: XCircle, color: 'bg-red-100 text-red-800', label: 'Tenant Deleted' },
  plan_assigned: { icon: Building2, color: 'bg-purple-100 text-purple-800', label: 'Plan Assigned' },
  plan_created: { icon: Building2, color: 'bg-purple-100 text-purple-800', label: 'Plan Created' },
  seat_limit_changed: { icon: UserCog, color: 'bg-yellow-100 text-yellow-800', label: 'Seat Limit Changed' },
  modules_updated: { icon: Building2, color: 'bg-indigo-100 text-indigo-800', label: 'Modules Updated' },
  user_suspended: { icon: UserCog, color: 'bg-orange-100 text-orange-800', label: 'User Suspended' },
  user_activated: { icon: UserCog, color: 'bg-green-100 text-green-800', label: 'User Activated' },
  user_deleted: { icon: UserCog, color: 'bg-red-100 text-red-800', label: 'User Deleted' },
  user_password_reset: { icon: UserCog, color: 'bg-yellow-100 text-yellow-800', label: 'Password Reset' },
};

const AuditLogsPage = () => {
  const { getAdminToken } = useAdminAuth();
  const [logs, setLogs] = useState([]);
  const [actionTypes, setActionTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [limit] = useState(20);
  
  // Filters
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  
  // Detail modal
  const [selectedLog, setSelectedLog] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const fetchActionTypes = useCallback(async () => {
    const token = getAdminToken();
    try {
      const response = await fetch(`${API_URL}/api/admin/audit-logs/action-types`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setActionTypes(data);
      }
    } catch (error) {
      console.error('Failed to fetch action types:', error);
    }
  }, [getAdminToken]);

  const fetchLogs = useCallback(async () => {
    const token = getAdminToken();
    setLoading(true);
    try {
      const params = new URLSearchParams({
        skip: page * limit,
        limit: limit.toString()
      });
      
      if (search) params.append('search', search);
      if (actionFilter) params.append('action', actionFilter);
      if (startDate) params.append('start_date', new Date(startDate).toISOString());
      if (endDate) params.append('end_date', new Date(endDate).toISOString());

      const response = await fetch(`${API_URL}/api/admin/audit-logs?${params}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setLogs(data.logs || []);
        setTotal(data.total || 0);
      }
    } catch (error) {
      console.error('Failed to fetch audit logs:', error);
    } finally {
      setLoading(false);
    }
  }, [getAdminToken, page, limit, search, actionFilter, startDate, endDate]);

  useEffect(() => {
    fetchActionTypes();
  }, [fetchActionTypes]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handleSearch = (e) => {
    e.preventDefault();
    setPage(0);
    fetchLogs();
  };

  const clearFilters = () => {
    setSearch('');
    setActionFilter('');
    setStartDate('');
    setEndDate('');
    setPage(0);
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  const getActionConfig = (action) => {
    return actionConfig[action] || { 
      icon: Clock, 
      color: 'bg-gray-100 text-gray-800', 
      label: action?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) 
    };
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Audit Logs</h1>
          <p className="text-slate-600">Track platform-level actions and security events</p>
        </div>
        <Button onClick={fetchLogs} variant="outline" className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-lg flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSearch} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search logs..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
                data-testid="audit-search-input"
              />
            </div>

            {/* Action Type Filter */}
            <Select value={actionFilter} onValueChange={(value) => setActionFilter(value === 'all' ? '' : value)}>
              <SelectTrigger data-testid="audit-action-filter">
                <SelectValue placeholder="All Actions" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Actions</SelectItem>
                {actionTypes.map((type) => (
                  <SelectItem key={type.action} value={type.action}>
                    {type.description}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Start Date */}
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                type="datetime-local"
                placeholder="Start Date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="pl-10"
                data-testid="audit-start-date"
              />
            </div>

            {/* End Date */}
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                type="datetime-local"
                placeholder="End Date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="pl-10"
                data-testid="audit-end-date"
              />
            </div>

            {/* Buttons */}
            <div className="flex gap-2">
              <Button type="submit" className="flex-1" data-testid="audit-search-btn">
                Search
              </Button>
              <Button type="button" variant="outline" onClick={clearFilters}>
                Clear
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Logs Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Audit Events</CardTitle>
            <Badge variant="secondary">{total} total logs</Badge>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="h-8 w-8 animate-spin text-slate-400" />
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              No audit logs found matching your criteria
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Action</TableHead>
                    <TableHead>Actor</TableHead>
                    <TableHead>Tenant</TableHead>
                    <TableHead>Timestamp</TableHead>
                    <TableHead className="text-right">Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => {
                    const config = getActionConfig(log.action);
                    const IconComponent = config.icon;
                    
                    return (
                      <TableRow key={log.id} data-testid={`audit-log-${log.id}`}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className={`p-1.5 rounded ${config.color}`}>
                              <IconComponent className="h-4 w-4" />
                            </div>
                            <span className="font-medium">{config.label}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            <div className="font-medium">{log.actor_email}</div>
                            <div className="text-slate-500 text-xs">{log.actor_id?.slice(0, 8)}...</div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {log.tenant_id ? (
                            <Badge variant="outline" className="font-mono text-xs">
                              {log.tenant_id.slice(0, 8)}...
                            </Badge>
                          ) : (
                            <span className="text-slate-400">System</span>
                          )}
                        </TableCell>
                        <TableCell className="text-slate-600">
                          {formatDate(log.timestamp)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedLog(log);
                              setDetailOpen(true);
                            }}
                            data-testid={`view-log-${log.id}`}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              {/* Pagination */}
              <div className="flex items-center justify-between mt-4 pt-4 border-t">
                <div className="text-sm text-slate-600">
                  Showing {page * limit + 1} to {Math.min((page + 1) * limit, total)} of {total}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => Math.max(0, p - 1))}
                    disabled={page === 0}
                    data-testid="audit-prev-page"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </Button>
                  <span className="text-sm text-slate-600">
                    Page {page + 1} of {totalPages || 1}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => p + 1)}
                    disabled={page >= totalPages - 1}
                    data-testid="audit-next-page"
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Audit Log Details</DialogTitle>
            <DialogDescription>
              Complete information about this audit event
            </DialogDescription>
          </DialogHeader>
          
          {selectedLog && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-slate-500">Action</label>
                  <p className="font-medium">{selectedLog.action_description || selectedLog.action}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-500">Timestamp</label>
                  <p className="font-medium">{formatDate(selectedLog.timestamp)}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-500">Actor Email</label>
                  <p className="font-medium">{selectedLog.actor_email}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-500">Actor ID</label>
                  <p className="font-mono text-sm">{selectedLog.actor_id}</p>
                </div>
                {selectedLog.tenant_id && (
                  <div>
                    <label className="text-sm font-medium text-slate-500">Tenant ID</label>
                    <p className="font-mono text-sm">{selectedLog.tenant_id}</p>
                  </div>
                )}
                {selectedLog.ip_address && (
                  <div>
                    <label className="text-sm font-medium text-slate-500">IP Address</label>
                    <p className="font-mono text-sm">{selectedLog.ip_address}</p>
                  </div>
                )}
              </div>
              
              {selectedLog.details && Object.keys(selectedLog.details).length > 0 && (
                <div>
                  <label className="text-sm font-medium text-slate-500">Details</label>
                  <pre className="mt-1 p-3 bg-slate-100 rounded-lg text-sm overflow-auto max-h-60">
                    {JSON.stringify(selectedLog.details, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AuditLogsPage;
