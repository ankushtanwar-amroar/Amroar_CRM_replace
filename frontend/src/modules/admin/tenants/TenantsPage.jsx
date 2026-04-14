/**
 * Tenants Page - Phase D Enhanced
 * Modern SaaS Control Plane tenant list with comprehensive filtering and status indicators
 */
import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../auth/AdminAuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Badge } from '../../../components/ui/badge';
import { Progress } from '../../../components/ui/progress';
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
  TableRow
} from '../../../components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '../../../components/ui/dropdown-menu';
import {
  Building2,
  Search,
  Plus,
  ChevronRight,
  Users,
  Database,
  Loader2,
  Filter,
  MoreHorizontal,
  Eye,
  Pause,
  Play,
  Trash2,
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle,
  HardDrive,
  CreditCard,
  Boxes,
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Download,
  Calendar,
  AlertTriangle
} from 'lucide-react';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const ADMIN_API = `${BACKEND_URL}/api/admin`;

const TenantsPage = () => {
  const { getAdminToken } = useAdminAuth();
  const navigate = useNavigate();
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [planFilter, setPlanFilter] = useState('all');
  const [billingFilter, setBillingFilter] = useState('all');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState('desc');
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const limit = 20;

  const fetchTenants = async () => {
    setLoading(true);
    try {
      const params = { 
        skip: page * limit, 
        limit,
        search: searchQuery || undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        plan: planFilter !== 'all' ? planFilter : undefined,
        billing_status: billingFilter !== 'all' ? billingFilter : undefined,
        sort_by: sortBy,
        sort_order: sortOrder
      };
      
      const response = await axios.get(`${ADMIN_API}/tenants`, {
        headers: { Authorization: `Bearer ${getAdminToken()}` },
        params
      });
      setTenants(response.data.tenants || []);
      setTotal(response.data.total || 0);
    } catch (error) {
      console.error('Failed to fetch tenants:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTenants();
  }, [page, statusFilter, planFilter, billingFilter, sortBy, sortOrder]);

  useEffect(() => {
    const delaySearch = setTimeout(() => {
      setPage(0);
      fetchTenants();
    }, 300);
    return () => clearTimeout(delaySearch);
  }, [searchQuery]);

  const handleSort = (column) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('asc');
    }
  };

  const handleSuspend = async (tenantId, e) => {
    e.stopPropagation();
    try {
      await axios.post(`${ADMIN_API}/control-plane/tenants/${tenantId}/support/action`, 
        { action: 'SUSPEND', reason: 'Admin action' },
        { headers: { Authorization: `Bearer ${getAdminToken()}` } }
      );
      fetchTenants();
    } catch (error) {
      console.error('Failed to suspend tenant:', error);
    }
  };

  const handleActivate = async (tenantId, e) => {
    e.stopPropagation();
    try {
      await axios.post(`${ADMIN_API}/control-plane/tenants/${tenantId}/support/action`,
        { action: 'REACTIVATE', reason: 'Admin action' },
        { headers: { Authorization: `Bearer ${getAdminToken()}` } }
      );
      fetchTenants();
    } catch (error) {
      console.error('Failed to activate tenant:', error);
    }
  };

  const handleDelete = async (tenantId, e) => {
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to delete this tenant? This action cannot be undone.')) return;
    try {
      await axios.delete(`${ADMIN_API}/tenants/${tenantId}`, {
        headers: { Authorization: `Bearer ${getAdminToken()}` }
      });
      fetchTenants();
    } catch (error) {
      console.error('Failed to delete tenant:', error);
    }
  };

  const getStatusBadge = (status) => {
    const normalizedStatus = (status || 'active').toLowerCase();
    const config = {
      active: { color: 'bg-green-100 text-green-700 border-green-200', icon: CheckCircle, label: 'Active' },
      suspended: { color: 'bg-red-100 text-red-700 border-red-200', icon: XCircle, label: 'Suspended' },
      trial: { color: 'bg-blue-100 text-blue-700 border-blue-200', icon: Clock, label: 'Trial' },
      pending: { color: 'bg-yellow-100 text-yellow-700 border-yellow-200', icon: Clock, label: 'Pending' },
      provisioning: { color: 'bg-indigo-100 text-indigo-700 border-indigo-200', icon: Loader2, label: 'Provisioning' },
      read_only: { color: 'bg-orange-100 text-orange-700 border-orange-200', icon: AlertCircle, label: 'Read Only' },
      terminated: { color: 'bg-slate-100 text-slate-700 border-slate-200', icon: XCircle, label: 'Terminated' },
    };
    const { color, icon: Icon, label } = config[normalizedStatus] || config.active;
    return (
      <Badge variant="outline" className={`${color} flex items-center gap-1 font-medium`}>
        <Icon className={`h-3 w-3 ${normalizedStatus === 'provisioning' ? 'animate-spin' : ''}`} />
        <span>{label}</span>
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
    return (
      <Badge className={`${colors[plan] || colors.free} capitalize font-medium`}>
        {plan || 'Free'}
      </Badge>
    );
  };

  const getBillingBadge = (billingStatus) => {
    const status = (billingStatus || 'current').toLowerCase();
    const config = {
      current: { color: 'bg-green-100 text-green-700', label: 'Current' },
      overdue: { color: 'bg-red-100 text-red-700', label: 'Overdue' },
      pending: { color: 'bg-yellow-100 text-yellow-700', label: 'Pending' },
      cancelled: { color: 'bg-slate-100 text-slate-700', label: 'Cancelled' }
    };
    const { color, label } = config[status] || config.current;
    return <Badge className={`${color} font-medium`}>{label}</Badge>;
  };

  const totalPages = Math.ceil(total / limit);

  // Calculate stats from current data
  const stats = useMemo(() => {
    return {
      active: tenants.filter(t => (t.status || '').toLowerCase() === 'active').length,
      suspended: tenants.filter(t => (t.status || '').toLowerCase() === 'suspended').length,
      trial: tenants.filter(t => (t.status || '').toLowerCase() === 'trial').length
    };
  }, [tenants]);

  const SortableHeader = ({ column, children }) => (
    <TableHead 
      className="cursor-pointer hover:bg-slate-100 transition-colors"
      onClick={() => handleSort(column)}
    >
      <div className="flex items-center gap-1">
        {children}
        {sortBy === column ? (
          sortOrder === 'asc' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />
        ) : (
          <ArrowUpDown className="h-4 w-4 text-slate-400" />
        )}
      </div>
    </TableHead>
  );

  return (
    <div className="p-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Tenant Management</h1>
            <p className="text-slate-500 mt-1">
              Manage organizations, subscriptions, and access controls
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button 
              variant="outline"
              size="sm"
              onClick={fetchTenants}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <Button 
              className="bg-indigo-600 hover:bg-indigo-700"
              onClick={() => navigate('/admin/tenants/create')}
              data-testid="create-tenant-btn"
            >
              <Plus className="h-4 w-4 mr-2" />
              Create Tenant
            </Button>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="flex items-center gap-6 mt-4">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
            <span className="text-sm text-slate-600">{stats.active} Active</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-red-500 rounded-full"></div>
            <span className="text-sm text-slate-600">{stats.suspended} Suspended</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
            <span className="text-sm text-slate-600">{stats.trial} Trial</span>
          </div>
        </div>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="relative flex-1 min-w-[250px] max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search by company, subdomain, or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
                data-testid="tenant-search-input"
              />
            </div>
            
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
              <SelectTrigger className="w-[140px]" data-testid="status-filter">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="ACTIVE">Active</SelectItem>
                <SelectItem value="SUSPENDED">Suspended</SelectItem>
                <SelectItem value="TRIAL">Trial</SelectItem>
                <SelectItem value="PENDING">Pending</SelectItem>
                <SelectItem value="READ_ONLY">Read Only</SelectItem>
              </SelectContent>
            </Select>

            <Select value={planFilter} onValueChange={(v) => { setPlanFilter(v); setPage(0); }}>
              <SelectTrigger className="w-[150px]" data-testid="plan-filter">
                <SelectValue placeholder="Plan" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Plans</SelectItem>
                <SelectItem value="free">Free</SelectItem>
                <SelectItem value="starter">Starter</SelectItem>
                <SelectItem value="professional">Professional</SelectItem>
                <SelectItem value="enterprise">Enterprise</SelectItem>
              </SelectContent>
            </Select>

            <Select value={billingFilter} onValueChange={(v) => { setBillingFilter(v); setPage(0); }}>
              <SelectTrigger className="w-[150px]" data-testid="billing-filter">
                <SelectValue placeholder="Billing" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Billing</SelectItem>
                <SelectItem value="CURRENT">Current</SelectItem>
                <SelectItem value="OVERDUE">Overdue</SelectItem>
                <SelectItem value="PENDING">Pending</SelectItem>
              </SelectContent>
            </Select>

            {(statusFilter !== 'all' || planFilter !== 'all' || billingFilter !== 'all' || searchQuery) && (
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => {
                  setStatusFilter('all');
                  setPlanFilter('all');
                  setBillingFilter('all');
                  setSearchQuery('');
                  setPage(0);
                }}
                className="text-slate-500"
              >
                Clear Filters
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Tenants Table */}
      <Card>
        <CardHeader className="pb-3 border-b">
          <CardTitle className="text-base font-semibold flex items-center justify-between">
            <span>All Tenants ({total})</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
            </div>
          ) : tenants.length === 0 ? (
            <div className="text-center py-16 text-slate-500">
              <Building2 className="h-12 w-12 mx-auto mb-3 text-slate-300" />
              <p className="font-medium text-lg">No tenants found</p>
              <p className="text-sm mt-1">
                {searchQuery || statusFilter !== 'all' || planFilter !== 'all' 
                  ? 'Try adjusting your filters' 
                  : 'Create your first tenant to get started'}
              </p>
              <Button 
                className="mt-4"
                onClick={() => navigate('/admin/tenants/create')}
              >
                <Plus className="h-4 w-4 mr-2" />
                Create Tenant
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50">
                    <SortableHeader column="tenant_name">Company</SortableHeader>
                    <TableHead>Subdomain</TableHead>
                    <SortableHeader column="status">Status</SortableHeader>
                    <SortableHeader column="plan">Plan</SortableHeader>
                    <TableHead>Seats</TableHead>
                    <TableHead>Modules</TableHead>
                    <TableHead>Storage</TableHead>
                    <TableHead>Trial Expiry</TableHead>
                    <TableHead>Billing</TableHead>
                    <SortableHeader column="updated_at">Last Activity</SortableHeader>
                    <TableHead className="w-[60px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tenants.map((tenant) => {
                    const usedSeats = tenant.current_users || 0;
                    const totalSeats = tenant.seat_limit || 10;
                    const seatPercent = Math.round((usedSeats / totalSeats) * 100);
                    
                    const usedStorageMB = tenant.current_storage_mb || 0;
                    const totalStorageMB = tenant.max_storage_mb || 1024;
                    const storagePercent = Math.round((usedStorageMB / totalStorageMB) * 100);
                    
                    const moduleCount = (tenant.module_entitlements || []).length;
                    
                    const isTrialExpiring = tenant.trial_ends_at && 
                      new Date(tenant.trial_ends_at) <= new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

                    return (
                      <TableRow 
                        key={tenant.id}
                        className="cursor-pointer hover:bg-slate-50 transition-colors"
                        onClick={() => navigate(`/admin/tenants/${tenant.id}`)}
                        data-testid={`tenant-row-${tenant.id}`}
                      >
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center flex-shrink-0">
                              <span className="text-white font-semibold">
                                {(tenant.tenant_name || tenant.company_name)?.[0] || 'T'}
                              </span>
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium text-slate-900 truncate max-w-[180px]">
                                {tenant.tenant_name || tenant.company_name}
                              </p>
                              <p className="text-xs text-slate-500 truncate max-w-[180px]">
                                {tenant.organization_name || tenant.industry || 'No industry'}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-slate-600 font-mono">
                            {tenant.subdomain || '-'}
                          </span>
                        </TableCell>
                        <TableCell>
                          {getStatusBadge(tenant.status)}
                        </TableCell>
                        <TableCell>
                          {getPlanBadge(tenant.plan)}
                        </TableCell>
                        <TableCell>
                          <div className="w-24">
                            <div className="flex items-center justify-between text-xs mb-1">
                              <span className="font-medium">{usedSeats}/{totalSeats}</span>
                              <span className={`${seatPercent >= 90 ? 'text-red-600' : 'text-slate-500'}`}>
                                {seatPercent}%
                              </span>
                            </div>
                            <Progress 
                              value={seatPercent} 
                              className={`h-1.5 ${seatPercent >= 90 ? '[&>div]:bg-red-500' : ''}`}
                            />
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Boxes className="h-3.5 w-3.5 text-slate-400" />
                            <span className="text-sm font-medium">{moduleCount}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="w-20">
                            <div className="flex items-center justify-between text-xs mb-1">
                              <span className="font-medium">{(usedStorageMB / 1024).toFixed(1)}GB</span>
                            </div>
                            <Progress 
                              value={storagePercent} 
                              className={`h-1.5 ${storagePercent >= 90 ? '[&>div]:bg-red-500' : ''}`}
                            />
                          </div>
                        </TableCell>
                        <TableCell>
                          {tenant.trial_ends_at ? (
                            <div className={`flex items-center gap-1 text-sm ${isTrialExpiring ? 'text-amber-600' : 'text-slate-600'}`}>
                              {isTrialExpiring && <AlertTriangle className="h-3.5 w-3.5" />}
                              {new Date(tenant.trial_ends_at).toLocaleDateString()}
                            </div>
                          ) : (
                            <span className="text-sm text-slate-400">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {getBillingBadge(tenant.billing_status)}
                        </TableCell>
                        <TableCell className="text-sm text-slate-500">
                          {tenant.updated_at 
                            ? new Date(tenant.updated_at).toLocaleDateString()
                            : tenant.created_at 
                              ? new Date(tenant.created_at).toLocaleDateString()
                              : '-'
                          }
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); navigate(`/admin/tenants/${tenant.id}`); }}>
                                <Eye className="h-4 w-4 mr-2" />
                                View Details
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              {(tenant.status || '').toLowerCase() === 'active' ? (
                                <DropdownMenuItem onClick={(e) => handleSuspend(tenant.id, e)} className="text-amber-600">
                                  <Pause className="h-4 w-4 mr-2" />
                                  Suspend
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem onClick={(e) => handleActivate(tenant.id, e)} className="text-green-600">
                                  <Play className="h-4 w-4 mr-2" />
                                  Activate
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem onClick={(e) => handleDelete(tenant.id, e)} className="text-red-600">
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
          
          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t bg-slate-50">
              <p className="text-sm text-slate-500">
                Showing {page * limit + 1} - {Math.min((page + 1) * limit, total)} of {total} tenants
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                >
                  Previous
                </Button>
                <span className="text-sm text-slate-600 px-2">
                  Page {page + 1} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default TenantsPage;
