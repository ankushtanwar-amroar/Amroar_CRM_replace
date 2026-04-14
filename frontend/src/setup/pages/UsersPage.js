import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Badge } from '../../components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table';
import { Users, UserPlus, Loader, Search, MoreVertical, UserX, UserCheck, Snowflake, Sun, ExternalLink } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '../../components/ui/dropdown-menu';
import InviteUserDialog from '../components/InviteUserDialog';
import DeactivateUserDialog from '../components/DeactivateUserDialog';
import FreezeUserDialog from '../components/FreezeUserDialog';
import { toast } from 'react-hot-toast';
import { useModuleContext, MODULE_STATES } from '../../context/ModuleContext';

const API = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';

const UsersPage = () => {
  const { moduleStates } = useModuleContext();
  const crmState = moduleStates?.crm || {};
  const isDocFlowOnly = crmState.state === MODULE_STATES.ADMIN_DISABLED;
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [showDeactivateDialog, setShowDeactivateDialog] = useState(false);
  const [showFreezeDialog, setShowFreezeDialog] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API}/api/users`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setUsers(response.data);
    } catch (error) {
      console.error('Error fetching users:', error);
      toast.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const handleActivateUser = async (userId) => {
    try {
      setActionLoading(userId);
      const token = localStorage.getItem('token');
      await axios.post(
        `${API}/api/users/${userId}/activate`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success('User activated successfully');
      fetchUsers();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to activate user');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeactivateClick = (user) => {
    setSelectedUser(user);
    setShowDeactivateDialog(true);
  };

  const handleFreezeClick = (user) => {
    setSelectedUser(user);
    setShowFreezeDialog(true);
  };

  const handleUnfreezeUser = async (userId) => {
    try {
      setActionLoading(userId);
      const token = localStorage.getItem('token');
      await axios.post(
        `${API}/api/users/${userId}/unfreeze`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success('User unfrozen successfully');
      fetchUsers();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to unfreeze user');
    } finally {
      setActionLoading(null);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    return date.toLocaleDateString();
  };

  const filteredUsers = users.filter(user => {
    const searchLower = searchTerm.toLowerCase();
    return (
      user.email.toLowerCase().includes(searchLower) ||
      `${user.first_name} ${user.last_name}`.toLowerCase().includes(searchLower)
    );
  });

  return (
    <div className="flex-1 p-8">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
              <Users className="h-5 w-5 text-indigo-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Users</h1>
              <p className="text-sm text-slate-500">Manage user access and invitations</p>
            </div>
          </div>
          <Button onClick={() => setShowInviteDialog(true)}>
            <UserPlus className="mr-2 h-4 w-4" />
            Invite User
          </Button>
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            type="text"
            placeholder="Search users..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader className="h-6 w-6 animate-spin text-indigo-600" />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last Login</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUsers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-slate-500">
                    No users found
                  </TableCell>
                </TableRow>
              ) : (
                filteredUsers.map((user) => (
                  <TableRow key={user.id} className="hover:bg-slate-50">
                    <TableCell className="font-medium">
                      <button
                        onClick={() => navigate(`/users/${user.id}`)}
                        className="text-indigo-600 hover:text-indigo-800 hover:underline flex items-center gap-1"
                        data-testid={`user-link-${user.id}`}
                      >
                        {user.first_name} {user.last_name}
                        <ExternalLink className="h-3 w-3" />
                      </button>
                    </TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>
                      {user.role_name ? (
                        <Badge variant="outline" className={
                          user.role_id === 'system_administrator' 
                            ? 'bg-purple-50 text-purple-700 border-purple-200'
                            : 'bg-blue-50 text-blue-700 border-blue-200'
                        }>
                          {user.role_name}
                        </Badge>
                      ) : (
                        <span className="text-slate-400 text-sm">No role</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {user.is_active ? (
                        user.is_frozen ? (
                          <Badge className="bg-blue-100 text-blue-700">
                            <Snowflake className="h-3 w-3 mr-1 inline" />
                            Frozen
                          </Badge>
                        ) : (
                          <Badge className="bg-green-100 text-green-700">
                            Active
                          </Badge>
                        )
                      ) : (
                        <Badge className="bg-slate-100 text-slate-700">
                          Inactive
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-slate-600 text-sm">
                      {formatDate(user.last_login)}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            disabled={actionLoading === user.id}
                          >
                            {actionLoading === user.id ? (
                              <Loader className="h-4 w-4 animate-spin" />
                            ) : (
                              <MoreVertical className="h-4 w-4" />
                            )}
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {user.is_active && !user.is_frozen && (
                            <>
                              <DropdownMenuItem
                                onClick={() => handleFreezeClick(user)}
                                className="text-blue-600"
                              >
                                <Snowflake className="mr-2 h-4 w-4" />
                                Freeze
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                            </>
                          )}
                          
                          {user.is_frozen && (
                            <>
                              <DropdownMenuItem
                                onClick={() => handleUnfreezeUser(user.id)}
                                className="text-cyan-600"
                              >
                                <Sun className="mr-2 h-4 w-4" />
                                Unfreeze
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                            </>
                          )}
                          
                          {user.is_active ? (
                            <DropdownMenuItem
                              onClick={() => handleDeactivateClick(user)}
                              className="text-red-600"
                            >
                              <UserX className="mr-2 h-4 w-4" />
                              Deactivate
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              onClick={() => handleActivateUser(user.id)}
                              className="text-green-600"
                            >
                              <UserCheck className="mr-2 h-4 w-4" />
                              Activate
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Dialogs */}
      <InviteUserDialog
        open={showInviteDialog}
        onOpenChange={setShowInviteDialog}
        onSuccess={fetchUsers}
        isDocFlowOnly={isDocFlowOnly}
      />
      
      <DeactivateUserDialog
        open={showDeactivateDialog}
        onOpenChange={setShowDeactivateDialog}
        user={selectedUser}
        onSuccess={fetchUsers}
      />
      
      <FreezeUserDialog
        open={showFreezeDialog}
        onOpenChange={setShowFreezeDialog}
        user={selectedUser}
        onSuccess={fetchUsers}
      />
    </div>
  );
};

export default UsersPage;