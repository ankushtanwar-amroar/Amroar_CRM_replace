/**
 * Users Page - Admin Portal
 * Platform-level user listing for monitoring purposes
 * User management actions should be done via Tenant Detail → Users tab
 */
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
  TableRow
} from '../../../components/ui/table';
import {
  Users,
  Search,
  Loader2,
  CheckCircle,
  XCircle,
  Clock,
  Building2,
  UserCog,
  Shield,
  RefreshCw,
  ExternalLink,
  Mail,
  Eye
} from 'lucide-react';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const ADMIN_API = `${BACKEND_URL}/api/admin`;

const UsersPage = () => {
  const { getAdminToken } = useAdminAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const limit = 25;

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const params = {
        skip: page * limit,
        limit,
        search: searchQuery || undefined,
        role: roleFilter !== 'all' ? roleFilter : undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined
      };

      const response = await axios.get(`${ADMIN_API}/users`, {
        headers: { Authorization: `Bearer ${getAdminToken()}` },
        params
      });
      setUsers(response.data.users || []);
      setTotal(response.data.total || 0);
    } catch (error) {
      console.error('Failed to fetch users:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [page, roleFilter, statusFilter]);

  useEffect(() => {
    const delaySearch = setTimeout(() => {
      setPage(0);
      fetchUsers();
    }, 300);
    return () => clearTimeout(delaySearch);
  }, [searchQuery]);

  const getRoleBadge = (role) => {
    const config = {
      admin: { color: 'bg-purple-100 text-purple-700 border-purple-200', icon: Shield },
      owner: { color: 'bg-amber-100 text-amber-700 border-amber-200', icon: Shield },
      manager: { color: 'bg-blue-100 text-blue-700 border-blue-200', icon: UserCog },
      user: { color: 'bg-slate-100 text-slate-700 border-slate-200', icon: Users }
    };
    const { color, icon: Icon } = config[role] || config.user;
    return (
      <Badge variant="outline" className={`${color} flex items-center gap-1`}>
        <Icon className="h-3 w-3" />
        <span className="capitalize">{role}</span>
      </Badge>
    );
  };

  const getStatusBadge = (status) => {
    const config = {
      active: { color: 'bg-green-100 text-green-700 border-green-200', icon: CheckCircle, label: 'Active' },
      disabled: { color: 'bg-red-100 text-red-700 border-red-200', icon: XCircle, label: 'Disabled' },
      invited: { color: 'bg-blue-100 text-blue-700 border-blue-200', icon: Clock, label: 'Invited' }
    };
    const { color, icon: Icon, label } = config[status] || config.active;
    return (
      <Badge variant="outline" className={`${color} flex items-center gap-1`}>
        <Icon className="h-3 w-3" />
        <span>{label}</span>
      </Badge>
    );
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="p-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Platform Users</h1>
            <p className="text-slate-500 mt-1">
              Monitor users across all tenants. Manage users via Tenant Detail → Users tab.
            </p>
          </div>
          <Button 
            variant="outline"
            size="sm"
            onClick={fetchUsers}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="relative flex-1 min-w-[250px] max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search by name or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            <Select value={roleFilter} onValueChange={(v) => { setRoleFilter(v); setPage(0); }}>
              <SelectTrigger className="w-[130px]">
                <SelectValue placeholder="Role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="manager">Manager</SelectItem>
                <SelectItem value="user">User</SelectItem>
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
              <SelectTrigger className="w-[130px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="disabled">Disabled</SelectItem>
                <SelectItem value="invited">Invited</SelectItem>
              </SelectContent>
            </Select>

            {(roleFilter !== 'all' || statusFilter !== 'all' || searchQuery) && (
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => {
                  setRoleFilter('all');
                  setStatusFilter('all');
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

      {/* Users Table */}
      <Card>
        <CardHeader className="pb-3 border-b">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Users className="h-4 w-4 text-slate-500" />
            All Users ({total})
          </CardTitle>
          <CardDescription>
            Platform-wide user monitoring. Click on tenant name to manage users.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
            </div>
          ) : users.length === 0 ? (
            <div className="text-center py-16 text-slate-500">
              <Users className="h-12 w-12 mx-auto mb-3 text-slate-300" />
              <p className="font-medium text-lg">No users found</p>
              <p className="text-sm mt-1">
                {searchQuery || roleFilter !== 'all' || statusFilter !== 'all'
                  ? 'Try adjusting your filters'
                  : 'Users will appear here once tenants have users'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50">
                    <TableHead>User</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Tenant</TableHead>
                    <TableHead>Subdomain</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last Login</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="w-[60px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => (
                    <TableRow 
                      key={user.id}
                      className="hover:bg-slate-50 transition-colors"
                    >
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center flex-shrink-0">
                            <span className="text-white font-medium text-sm">
                              {user.first_name?.[0]}{user.last_name?.[0]}
                            </span>
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-slate-900 truncate">
                              {user.first_name} {user.last_name}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-slate-600">
                          <Mail className="h-3.5 w-3.5 text-slate-400" />
                          <span className="text-sm truncate max-w-[180px]">{user.email}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="link"
                          className="h-auto p-0 text-indigo-600 hover:text-indigo-800"
                          onClick={() => navigate(`/admin/tenants/${user.tenant_id}`)}
                        >
                          <Building2 className="h-3.5 w-3.5 mr-1" />
                          {user.tenant_name}
                        </Button>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-slate-500 font-mono">
                          {user.tenant_subdomain || '-'}
                        </span>
                      </TableCell>
                      <TableCell>
                        {getRoleBadge(user.role)}
                      </TableCell>
                      <TableCell>
                        {getStatusBadge(user.status)}
                      </TableCell>
                      <TableCell className="text-sm text-slate-500">
                        {user.last_login 
                          ? new Date(user.last_login).toLocaleDateString()
                          : <span className="text-slate-400">Never</span>}
                      </TableCell>
                      <TableCell className="text-sm text-slate-500">
                        {user.created_at 
                          ? new Date(user.created_at).toLocaleDateString()
                          : '-'}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => navigate(`/admin/tenants/${user.tenant_id}`)}
                          title="View in Tenant"
                        >
                          <ExternalLink className="h-4 w-4 text-slate-500" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t bg-slate-50">
              <p className="text-sm text-slate-500">
                Showing {page * limit + 1} - {Math.min((page + 1) * limit, total)} of {total} users
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

      {/* Info Note */}
      <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-sm text-blue-800">
          <strong>Note:</strong> This page is for platform monitoring only. To manage users (create, edit, disable), 
          navigate to the specific tenant and use the <strong>Users tab</strong> in the Tenant Detail page.
        </p>
      </div>
    </div>
  );
};

export default UsersPage;
