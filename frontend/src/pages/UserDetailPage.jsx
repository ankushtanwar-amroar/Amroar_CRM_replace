/**
 * UserDetailPage - Enhanced User profile detail view with security management tabs
 * Displays user information, manages permission bundles, permission sets, and effective access
 * Route: /users/:userId
 * 
 * Updated for Security Architecture Phase 2:
 * - Permission Bundles tab with assignment management
 * - Permission Sets tab with direct assignment capability
 * - Enhanced Effective Access summary
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import { 
  ArrowLeft, 
  User, 
  Mail, 
  Shield, 
  Calendar,
  CheckCircle,
  XCircle,
  Snowflake,
  Clock,
  Building2,
  Loader2,
  Users,
  Package,
  Lock,
  Share2,
  Eye,
  Edit,
  Key,
  Layers,
  Activity,
  Plus,
  Trash2,
  AlertTriangle,
  Crown,
  RefreshCw
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../components/ui/alert-dialog';
import UserLicensesTab from '../components/user/UserLicensesTab';
import { useModuleContext, MODULE_STATES } from '../context/ModuleContext';

const API = process.env.REACT_APP_BACKEND_URL;

const UserDetailPage = () => {
  const { userId } = useParams();
  const navigate = useNavigate();
  const { moduleStates } = useModuleContext();
  const crmState = moduleStates?.crm || {};
  const isDocFlowOnly = crmState.state === MODULE_STATES.ADMIN_DISABLED;
  const [user, setUser] = useState(null);
  const [effectiveAccess, setEffectiveAccess] = useState(null);
  const [memberships, setMemberships] = useState(null);
  const [accessBundles, setAccessBundles] = useState([]);
  const [userPermissionSets, setUserPermissionSets] = useState([]);
  const [availablePermissionSets, setAvailablePermissionSets] = useState([]);
  const [availableBundles, setAvailableBundles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  
  // Dialog states
  const [showAssignPSDialog, setShowAssignPSDialog] = useState(false);
  const [showAssignBundleDialog, setShowAssignBundleDialog] = useState(false);
  const [selectedPermissionSet, setSelectedPermissionSet] = useState('');
  const [selectedBundle, setSelectedBundle] = useState('');
  const [removingPS, setRemovingPS] = useState(null);
  const [removingBundle, setRemovingBundle] = useState(null);
  const [assigning, setAssigning] = useState(false);
  
  // Current user state for permission checks
  const [currentUser, setCurrentUser] = useState(null);

  const getAuthHeader = () => {
    const token = localStorage.getItem('token');
    return { Authorization: `Bearer ${token}` };
  };

  const fetchCurrentUser = async () => {
    try {
      const response = await axios.get(`${API}/api/me`, { headers: getAuthHeader() });
      setCurrentUser(response.data);
    } catch (e) {
      console.error('Error fetching current user:', e);
    }
  };

  const fetchUserData = useCallback(async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      if (!token) {
        setError('Not authenticated');
        setLoading(false);
        return;
      }

      // Fetch all data in parallel
      const [userRes, accessRes, membershipsRes, bundlesRes, userPSRes, availablePSRes, availableBundlesRes] = await Promise.allSettled([
        axios.get(`${API}/api/users/${userId}`, { headers: getAuthHeader() }),
        axios.get(`${API}/api/users/${userId}/effective-access`, { headers: getAuthHeader() }),
        axios.get(`${API}/api/users/${userId}/memberships`, { headers: getAuthHeader() }),
        axios.get(`${API}/api/users/${userId}/access-bundles`, { headers: getAuthHeader() }),
        axios.get(`${API}/api/users/${userId}/permission-sets`, { headers: getAuthHeader() }),
        axios.get(`${API}/api/permission-sets`, { headers: getAuthHeader() }),
        axios.get(`${API}/api/access-bundles`, { headers: getAuthHeader() })
      ]);

      if (userRes.status === 'fulfilled') setUser(userRes.value.data);
      if (accessRes.status === 'fulfilled') setEffectiveAccess(accessRes.value.data);
      if (membershipsRes.status === 'fulfilled') setMemberships(membershipsRes.value.data);
      if (bundlesRes.status === 'fulfilled') setAccessBundles(bundlesRes.value.data);
      if (userPSRes.status === 'fulfilled') {
        const psData = userPSRes.value.data;
        // Handle both array and object with permission_sets property
        setUserPermissionSets(Array.isArray(psData) ? psData : (psData?.permission_sets || []));
      }
      if (availablePSRes.status === 'fulfilled') setAvailablePermissionSets(availablePSRes.value.data?.permission_sets || availablePSRes.value.data || []);
      if (availableBundlesRes.status === 'fulfilled') setAvailableBundles(availableBundlesRes.value.data || []);

      setError(null);
    } catch (err) {
      console.error('Error fetching user:', err);
      setError(err.response?.data?.detail || 'Failed to load user details');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchCurrentUser();
    if (userId) {
      fetchUserData();
    }
  }, [userId, fetchUserData]);

  const canManagePermissions = () => {
    return currentUser?.is_super_admin || 
           currentUser?.role_id === 'system_administrator' || 
           currentUser?.role_id === 'system_admin';
  };

  const handleAssignPermissionSet = async () => {
    if (!selectedPermissionSet) return;
    
    setAssigning(true);
    try {
      await axios.post(
        `${API}/api/users/${userId}/permission-sets`,
        { permission_set_id: selectedPermissionSet },
        { headers: getAuthHeader() }
      );
      toast.success('Permission set assigned successfully');
      setShowAssignPSDialog(false);
      setSelectedPermissionSet('');
      fetchUserData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to assign permission set');
    } finally {
      setAssigning(false);
    }
  };

  const handleRemovePermissionSet = async () => {
    if (!removingPS) return;
    
    try {
      await axios.delete(
        `${API}/api/users/${userId}/permission-sets/${removingPS.id}`,
        { headers: getAuthHeader() }
      );
      toast.success('Permission set removed');
      setRemovingPS(null);
      fetchUserData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to remove permission set');
    }
  };

  const handleAssignBundle = async () => {
    if (!selectedBundle) return;
    
    setAssigning(true);
    try {
      await axios.post(
        `${API}/api/access-bundles/${selectedBundle}/assign`,
        { user_id: userId },
        { headers: getAuthHeader() }
      );
      toast.success('Permission bundle assigned successfully');
      setShowAssignBundleDialog(false);
      setSelectedBundle('');
      fetchUserData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to assign bundle');
    } finally {
      setAssigning(false);
    }
  };

  const handleRemoveBundle = async () => {
    if (!removingBundle) return;
    
    try {
      await axios.delete(
        `${API}/api/access-bundles/${removingBundle.id}/users/${userId}`,
        { headers: getAuthHeader() }
      );
      toast.success('Permission bundle removed');
      setRemovingBundle(null);
      fetchUserData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to remove bundle');
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return dateString;
    }
  };

  const getStatusBadge = (user) => {
    const status = user.account_status;
    if (user.is_frozen || status === 'frozen') {
      return (
        <Badge className="bg-blue-100 text-blue-700 border-blue-200">
          <Snowflake className="h-3 w-3 mr-1" />
          Frozen
        </Badge>
      );
    }
    if (status === 'pending_verification') {
      return (
        <Badge className="bg-amber-100 text-amber-700 border-amber-200">
          <Clock className="h-3 w-3 mr-1" />
          Pending Verification
        </Badge>
      );
    }
    if (status === 'pending_invite') {
      return (
        <Badge className="bg-amber-100 text-amber-700 border-amber-200">
          <Clock className="h-3 w-3 mr-1" />
          Pending Invite
        </Badge>
      );
    }
    if (!user.is_active) {
      return (
        <Badge className="bg-red-100 text-red-700 border-red-200">
          <XCircle className="h-3 w-3 mr-1" />
          Inactive
        </Badge>
      );
    }
    return (
      <Badge className="bg-green-100 text-green-700 border-green-200">
        <CheckCircle className="h-3 w-3 mr-1" />
        Active
      </Badge>
    );
  };

  // Get permission sets not yet assigned to user
  const getAvailablePermissionSetsForAssignment = () => {
    const assignedIds = new Set(userPermissionSets.map(ps => ps.permission_set_id));
    return availablePermissionSets.filter(ps => !assignedIds.has(ps.id));
  };

  // Get bundles not yet assigned to user
  const getAvailableBundlesForAssignment = () => {
    const assignedIds = new Set(accessBundles.map(b => b.id));
    return availableBundles.filter(b => !assignedIds.has(b.id));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex items-center gap-3 text-slate-500">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span>Loading user details...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center">
        <div className="text-red-500 mb-4">{error}</div>
        <Button variant="outline" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Go Back
        </Button>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center">
        <div className="text-slate-500 mb-4">User not found</div>
        <Button variant="outline" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Go Back
        </Button>
      </div>
    );
  }

  const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email;

  return (
    <div className="min-h-screen bg-slate-50" data-testid="user-detail-page">
      {/* Header */}
      <div className="bg-white border-b shadow-sm">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center gap-4">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => navigate(-1)}
              className="text-slate-500 hover:text-slate-700"
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
            <div className="h-6 w-px bg-slate-200" />
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white text-lg font-semibold">
                {user.first_name?.[0]?.toUpperCase() || user.email?.[0]?.toUpperCase() || 'U'}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-semibold text-slate-800">{fullName}</h1>
                  {user.is_super_admin && (
                    <Badge className="bg-amber-100 text-amber-700 border-amber-200">
                      <Crown className="h-3 w-3 mr-1" />
                      Super Admin
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-slate-500">{user.email}</p>
              </div>
            </div>
            <div className="ml-auto flex items-center gap-2">
              {getStatusBadge(user)}
              <Button
                variant="ghost"
                size="sm"
                onClick={fetchUserData}
                className="text-slate-500"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Content with Tabs */}
      <div className="max-w-6xl mx-auto px-6 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className={`grid w-full ${isDocFlowOnly ? 'grid-cols-2 lg:w-auto lg:inline-flex' : 'grid-cols-6 lg:w-auto lg:inline-flex'} mb-6`}>
            <TabsTrigger value="overview" className="flex items-center gap-1" data-testid="tab-overview">
              <User className="h-4 w-4" />
              <span className="hidden sm:inline">Overview</span>
            </TabsTrigger>
            <TabsTrigger value="licenses" className="flex items-center gap-1" data-testid="tab-licenses">
              <Key className="h-4 w-4" />
              <span className="hidden sm:inline">Licenses</span>
            </TabsTrigger>
            {!isDocFlowOnly && (
              <>
                <TabsTrigger value="bundles" className="flex items-center gap-1" data-testid="tab-bundles">
                  <Package className="h-4 w-4" />
                  <span className="hidden sm:inline">Permission Bundles</span>
                </TabsTrigger>
                <TabsTrigger value="permission-sets" className="flex items-center gap-1" data-testid="tab-permission-sets">
                  <Lock className="h-4 w-4" />
                  <span className="hidden sm:inline">Permission Sets</span>
                </TabsTrigger>
                <TabsTrigger value="effective-access" className="flex items-center gap-1" data-testid="tab-effective-access">
                  <Eye className="h-4 w-4" />
                  <span className="hidden sm:inline">Effective Access</span>
                </TabsTrigger>
                <TabsTrigger value="membership" className="flex items-center gap-1" data-testid="tab-membership">
                  <Users className="h-4 w-4" />
                  <span className="hidden sm:inline">Membership</span>
                </TabsTrigger>
              </>
            )}
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* User Information Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <User className="h-5 w-5 text-blue-500" />
                    User Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">First Name</label>
                      <p className="text-sm text-slate-800 mt-1">{user.first_name || '-'}</p>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Last Name</label>
                      <p className="text-sm text-slate-800 mt-1">{user.last_name || '-'}</p>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-500 uppercase tracking-wide flex items-center gap-1">
                      <Mail className="h-3 w-3" />
                      Email
                    </label>
                    <p className="text-sm text-slate-800 mt-1">{user.email}</p>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Role</label>
                    <div className="mt-1">
                      <Badge variant="secondary" className="text-sm">
                        {effectiveAccess?.role?.name || user.role_name || 'Standard User'}
                      </Badge>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">User ID</label>
                    <p className="text-xs text-slate-500 mt-1 font-mono">{user.id}</p>
                  </div>
                </CardContent>
              </Card>

              {/* Quick Stats Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Layers className="h-5 w-5 text-purple-500" />
                    Access Summary
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-purple-50 rounded-lg p-4 text-center">
                      <div className="text-2xl font-bold text-purple-700">
                        {accessBundles?.length || 0}
                      </div>
                      <div className="text-xs text-purple-600">Permission Bundles</div>
                    </div>
                    <div className="bg-indigo-50 rounded-lg p-4 text-center">
                      <div className="text-2xl font-bold text-indigo-700">
                        {userPermissionSets?.length || 0}
                      </div>
                      <div className="text-xs text-indigo-600">Direct Permission Sets</div>
                    </div>
                    <div className="bg-green-50 rounded-lg p-4 text-center">
                      <div className="text-2xl font-bold text-green-700">
                        {memberships?.groups?.length || 0}
                      </div>
                      <div className="text-xs text-green-600">Groups</div>
                    </div>
                    <div className="bg-amber-50 rounded-lg p-4 text-center">
                      <div className="text-2xl font-bold text-amber-700">
                        {memberships?.queues?.length || 0}
                      </div>
                      <div className="text-xs text-amber-600">Queues</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Timestamps */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Calendar className="h-5 w-5 text-slate-500" />
                  Account Timeline
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Created</label>
                    <p className="text-sm text-slate-700 mt-1">{formatDate(user.created_at)}</p>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Last Login</label>
                    <p className="text-sm text-slate-700 mt-1">{formatDate(user.last_login_at)}</p>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Updated</label>
                    <p className="text-sm text-slate-700 mt-1">{formatDate(user.updated_at)}</p>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Password Last Changed</label>
                    <p className="text-sm text-slate-700 mt-1">{user.password_hash ? 'Set' : 'Not Set'}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Licenses Tab */}
          <TabsContent value="licenses" className="space-y-6">
            <UserLicensesTab 
              userId={userId} 
              userName={fullName}
              canManage={canManagePermissions()}
            />
          </TabsContent>

          {/* Permission Bundles Tab */}
          <TabsContent value="bundles" className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <Package className="h-5 w-5 text-purple-500" />
                      Assigned Permission Bundles
                    </CardTitle>
                    <CardDescription>
                      Permission bundles group multiple permission sets for easy assignment
                    </CardDescription>
                  </div>
                  {canManagePermissions() && (
                    <Button
                      size="sm"
                      onClick={() => setShowAssignBundleDialog(true)}
                      className="bg-purple-600 hover:bg-purple-700"
                      data-testid="assign-bundle-btn"
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Assign Bundle
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {accessBundles.length === 0 ? (
                  <div className="text-center py-8 text-slate-500">
                    <Package className="h-12 w-12 mx-auto text-slate-300 mb-3" />
                    <p>No permission bundles assigned</p>
                    {canManagePermissions() && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-3"
                        onClick={() => setShowAssignBundleDialog(true)}
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Assign First Bundle
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {accessBundles.map((bundle) => (
                      <div key={bundle.id} className="border rounded-lg p-4 hover:bg-slate-50 transition-colors">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                              <Package className="h-5 w-5 text-purple-600" />
                            </div>
                            <div>
                              <span className="font-medium text-slate-800">{bundle.name}</span>
                              {bundle.description && (
                                <p className="text-xs text-slate-500">{bundle.description}</p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">
                              {bundle.permission_sets?.length || 0} permission sets
                            </Badge>
                            {canManagePermissions() && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-red-500 hover:text-red-700 hover:bg-red-50"
                                onClick={() => setRemovingBundle(bundle)}
                                data-testid={`remove-bundle-${bundle.id}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                        {bundle.permission_sets?.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-3 pt-3 border-t">
                            {bundle.permission_sets.map((ps) => (
                              <Badge key={ps.id} variant="secondary" className="text-xs">
                                <Key className="h-3 w-3 mr-1" />
                                {ps.name || ps.role_name}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Permission Sets Tab */}
          <TabsContent value="permission-sets" className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <Key className="h-5 w-5 text-indigo-500" />
                      Direct Permission Set Assignments
                    </CardTitle>
                    <CardDescription>
                      Permission sets assigned directly to this user (not through bundles or roles)
                    </CardDescription>
                  </div>
                  {canManagePermissions() && (
                    <Button
                      size="sm"
                      onClick={() => setShowAssignPSDialog(true)}
                      className="bg-indigo-600 hover:bg-indigo-700"
                      data-testid="assign-permission-set-btn"
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Assign Permission Set
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {userPermissionSets.length === 0 ? (
                  <div className="text-center py-8 text-slate-500">
                    <Key className="h-12 w-12 mx-auto text-slate-300 mb-3" />
                    <p>No direct permission set assignments</p>
                    {canManagePermissions() && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-3"
                        onClick={() => setShowAssignPSDialog(true)}
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Assign First Permission Set
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-slate-50">
                          <th className="text-left py-3 px-4 font-medium text-slate-600">Permission Set</th>
                          <th className="text-left py-3 px-4 font-medium text-slate-600">Source</th>
                          <th className="text-left py-3 px-4 font-medium text-slate-600">Assigned</th>
                          {canManagePermissions() && (
                            <th className="text-right py-3 px-4 font-medium text-slate-600">Actions</th>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {userPermissionSets.map((ps) => (
                          <tr key={ps.id} className="border-b last:border-b-0 hover:bg-slate-50">
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-2">
                                <Key className="h-4 w-4 text-indigo-500" />
                                <span className="font-medium">{ps.permission_set_name}</span>
                              </div>
                            </td>
                            <td className="py-3 px-4">
                              <Badge variant={ps.source === 'direct' ? 'default' : 'secondary'} className="text-xs">
                                {ps.source}
                              </Badge>
                            </td>
                            <td className="py-3 px-4 text-slate-500 text-xs">
                              {formatDate(ps.assigned_at)}
                            </td>
                            {canManagePermissions() && (
                              <td className="py-3 px-4 text-right">
                                {ps.source === 'direct' && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-red-500 hover:text-red-700 hover:bg-red-50"
                                    onClick={() => setRemovingPS(ps)}
                                    data-testid={`remove-ps-${ps.id}`}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                )}
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Permission Sets from Bundles */}
            {accessBundles.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Package className="h-5 w-5 text-purple-500" />
                    Permission Sets from Bundles
                  </CardTitle>
                  <CardDescription>
                    These permission sets are assigned through permission bundles
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {accessBundles.map((bundle) => (
                      <div key={bundle.id} className="border rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <Package className="h-4 w-4 text-purple-500" />
                          <span className="font-medium text-sm">{bundle.name}</span>
                        </div>
                        {bundle.permission_sets?.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {bundle.permission_sets.map((ps) => (
                              <Badge key={ps.id} variant="secondary" className="text-xs">
                                {ps.name || ps.role_name}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-slate-500">No permission sets in this bundle</p>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Effective Access Tab */}
          <TabsContent value="effective-access" className="space-y-6">
            {/* Access Sources Summary */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Layers className="h-5 w-5 text-green-500" />
                  Access Sources
                </CardTitle>
                <CardDescription>
                  Summary of where this user's permissions come from
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="border rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Shield className="h-5 w-5 text-blue-500" />
                      <span className="font-medium">Role</span>
                    </div>
                    <Badge variant="secondary">
                      {effectiveAccess?.role?.name || user.role_name || 'Standard User'}
                    </Badge>
                    <p className="text-xs text-slate-500 mt-2">
                      Base permissions from assigned role
                    </p>
                  </div>
                  <div className="border rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Package className="h-5 w-5 text-purple-500" />
                      <span className="font-medium">Permission Bundles</span>
                    </div>
                    <span className="text-2xl font-bold text-purple-600">
                      {accessBundles?.length || 0}
                    </span>
                    <p className="text-xs text-slate-500 mt-2">
                      Bundled permission sets
                    </p>
                  </div>
                  <div className="border rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Key className="h-5 w-5 text-indigo-500" />
                      <span className="font-medium">Direct Permission Sets</span>
                    </div>
                    <span className="text-2xl font-bold text-indigo-600">
                      {userPermissionSets?.filter(ps => ps.source === 'direct').length || 0}
                    </span>
                    <p className="text-xs text-slate-500 mt-2">
                      Directly assigned to user
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Effective Permissions by Object */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Eye className="h-5 w-5 text-green-500" />
                  Effective Object Permissions
                </CardTitle>
                <CardDescription>
                  Final calculated permissions after aggregating all sources (most permissive wins)
                </CardDescription>
              </CardHeader>
              <CardContent>
                {effectiveAccess?.effective_permissions && 
                 Object.keys(effectiveAccess.effective_permissions).length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-slate-50">
                          <th className="text-left py-3 px-4 font-medium text-slate-600">Object</th>
                          <th className="text-center py-3 px-2 font-medium text-slate-600">Visible</th>
                          <th className="text-center py-3 px-2 font-medium text-slate-600">Create</th>
                          <th className="text-center py-3 px-2 font-medium text-slate-600">Read</th>
                          <th className="text-center py-3 px-2 font-medium text-slate-600">Update</th>
                          <th className="text-center py-3 px-2 font-medium text-slate-600">Delete</th>
                          <th className="text-center py-3 px-2 font-medium text-slate-600">View All</th>
                          <th className="text-center py-3 px-2 font-medium text-slate-600">Modify All</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(effectiveAccess.effective_permissions).map(([objName, perms]) => (
                          <tr key={objName} className="border-b last:border-b-0 hover:bg-slate-50">
                            <td className="py-3 px-4 font-medium capitalize">{objName}</td>
                            <td className="text-center py-3 px-2">
                              {perms.visible !== false ? <Eye className="h-4 w-4 text-blue-500 mx-auto" /> : <XCircle className="h-4 w-4 text-slate-300 mx-auto" />}
                            </td>
                            <td className="text-center py-3 px-2">
                              {perms.create ? <CheckCircle className="h-4 w-4 text-green-500 mx-auto" /> : <XCircle className="h-4 w-4 text-slate-300 mx-auto" />}
                            </td>
                            <td className="text-center py-3 px-2">
                              {perms.read ? <CheckCircle className="h-4 w-4 text-green-500 mx-auto" /> : <XCircle className="h-4 w-4 text-slate-300 mx-auto" />}
                            </td>
                            <td className="text-center py-3 px-2">
                              {perms.update ? <CheckCircle className="h-4 w-4 text-green-500 mx-auto" /> : <XCircle className="h-4 w-4 text-slate-300 mx-auto" />}
                            </td>
                            <td className="text-center py-3 px-2">
                              {perms.delete ? <CheckCircle className="h-4 w-4 text-green-500 mx-auto" /> : <XCircle className="h-4 w-4 text-slate-300 mx-auto" />}
                            </td>
                            <td className="text-center py-3 px-2">
                              {perms.view_all ? <CheckCircle className="h-4 w-4 text-green-500 mx-auto" /> : <XCircle className="h-4 w-4 text-slate-300 mx-auto" />}
                            </td>
                            <td className="text-center py-3 px-2">
                              {perms.modify_all ? <CheckCircle className="h-4 w-4 text-green-500 mx-auto" /> : <XCircle className="h-4 w-4 text-slate-300 mx-auto" />}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-8 text-slate-500">
                    <Eye className="h-12 w-12 mx-auto text-slate-300 mb-3" />
                    <p>No object permissions configured</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Sharing Rules */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Share2 className="h-5 w-5 text-blue-500" />
                  Applicable Sharing Rules
                </CardTitle>
                <CardDescription>
                  Sharing rules that grant this user additional record access
                </CardDescription>
              </CardHeader>
              <CardContent>
                {effectiveAccess?.sharing_rules_applicable?.length > 0 ? (
                  <div className="space-y-3">
                    {effectiveAccess.sharing_rules_applicable.map((rule) => (
                      <div key={rule.id} className="border rounded-lg p-4 hover:bg-slate-50">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium">{rule.name}</span>
                          <Badge variant={rule.access_level === 'read_only' ? 'secondary' : 'default'}>
                            {rule.access_level === 'read_only' ? 'Read Only' : 'Read/Write'}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-xs text-slate-600">
                          <div>
                            <span className="text-slate-400">Object:</span> 
                            <span className="ml-1 capitalize">{rule.object_name}</span>
                          </div>
                          <div>
                            <span className="text-slate-400">Type:</span> 
                            <span className="ml-1 capitalize">{rule.rule_type}</span>
                          </div>
                          <div>
                            <span className="text-slate-400">Shared via:</span> 
                            <span className="ml-1 capitalize">{rule.shared_to_type}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-slate-500">
                    <Share2 className="h-12 w-12 mx-auto text-slate-300 mb-3" />
                    <p>No sharing rules applicable to this user</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Membership Tab */}
          <TabsContent value="membership" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Groups */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Users className="h-5 w-5 text-green-500" />
                    Group Memberships
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {memberships?.groups?.length > 0 ? (
                    <div className="space-y-2">
                      {memberships.groups.map((group) => (
                        <div key={group.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                          <div>
                            <p className="font-medium text-slate-800">{group.name}</p>
                            <p className="text-xs text-slate-500 capitalize">{group.group_type} group</p>
                          </div>
                          <Badge variant="outline" className="text-xs">
                            {group.membership_type === 'direct' ? 'Direct' : 'Via Role'}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-slate-500">
                      <Users className="h-12 w-12 mx-auto text-slate-300 mb-3" />
                      <p>Not a member of any groups</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Queues */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Building2 className="h-5 w-5 text-amber-500" />
                    Queue Memberships
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {memberships?.queues?.length > 0 ? (
                    <div className="space-y-2">
                      {memberships.queues.map((queue) => (
                        <div key={queue.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                          <div>
                            <p className="font-medium text-slate-800">{queue.name}</p>
                            <p className="text-xs text-slate-500">
                              {queue.supported_objects?.join(', ') || 'No objects'}
                            </p>
                          </div>
                          <Badge variant="outline" className="text-xs">
                            {queue.membership_type === 'direct' ? 'Direct' : 
                             queue.membership_type === 'via_role' ? 'Via Role' : 'Via Group'}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-slate-500">
                      <Building2 className="h-12 w-12 mx-auto text-slate-300 mb-3" />
                      <p>Not a member of any queues</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Assign Permission Set Dialog */}
      <Dialog open={showAssignPSDialog} onOpenChange={setShowAssignPSDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Permission Set</DialogTitle>
            <DialogDescription>
              Select a permission set to assign directly to {fullName}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Select value={selectedPermissionSet} onValueChange={setSelectedPermissionSet}>
              <SelectTrigger data-testid="permission-set-select">
                <SelectValue placeholder="Select permission set" />
              </SelectTrigger>
              <SelectContent>
                {getAvailablePermissionSetsForAssignment().map((ps) => (
                  <SelectItem key={ps.id} value={ps.id}>
                    {ps.name || ps.role_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {getAvailablePermissionSetsForAssignment().length === 0 && (
              <p className="text-sm text-amber-600 mt-2 flex items-center gap-1">
                <AlertTriangle className="h-4 w-4" />
                All available permission sets are already assigned
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAssignPSDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleAssignPermissionSet} 
              disabled={!selectedPermissionSet || assigning}
              className="bg-indigo-600 hover:bg-indigo-700"
            >
              {assigning ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Assign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign Bundle Dialog */}
      <Dialog open={showAssignBundleDialog} onOpenChange={setShowAssignBundleDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Permission Bundle</DialogTitle>
            <DialogDescription>
              Select a permission bundle to assign to {fullName}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Select value={selectedBundle} onValueChange={setSelectedBundle}>
              <SelectTrigger data-testid="bundle-select">
                <SelectValue placeholder="Select permission bundle" />
              </SelectTrigger>
              <SelectContent>
                {getAvailableBundlesForAssignment().map((bundle) => (
                  <SelectItem key={bundle.id} value={bundle.id}>
                    {bundle.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {getAvailableBundlesForAssignment().length === 0 && (
              <p className="text-sm text-amber-600 mt-2 flex items-center gap-1">
                <AlertTriangle className="h-4 w-4" />
                All available bundles are already assigned
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAssignBundleDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleAssignBundle} 
              disabled={!selectedBundle || assigning}
              className="bg-purple-600 hover:bg-purple-700"
            >
              {assigning ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Assign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove Permission Set Confirmation */}
      <AlertDialog open={!!removingPS} onOpenChange={() => setRemovingPS(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Permission Set</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove the "{removingPS?.permission_set_name}" permission set from {fullName}?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleRemovePermissionSet}
              className="bg-red-600 hover:bg-red-700"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Remove Bundle Confirmation */}
      <AlertDialog open={!!removingBundle} onOpenChange={() => setRemovingBundle(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Permission Bundle</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove the "{removingBundle?.name}" permission bundle from {fullName}?
              This will also remove all permission sets included in this bundle.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleRemoveBundle}
              className="bg-red-600 hover:bg-red-700"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default UserDetailPage;
