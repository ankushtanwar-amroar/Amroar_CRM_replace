/**
 * Roles & Hierarchy Page
 * Salesforce-style role management with split panel design
 * Left: Role hierarchy tree
 * Right: Role details panel
 */
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  Plus,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Loader2,
  MoreVertical,
  Pencil,
  Trash2,
  UserPlus,
  Shield,
  Eye,
  GitBranch,
  ArrowLeft
} from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { Card } from '../../../components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../../components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from '../../../components/ui/dropdown-menu';
import { cn } from '../../../lib/utils';
import CreateRoleDialog from '../components/CreateRoleDialog';
import AssignUsersDialog from '../components/AssignUsersDialog';
import { useRoleHierarchy } from '../hooks/useRoleHierarchy';
import roleService from '../services/roleService';
import { toast } from 'react-hot-toast';

const DATA_VISIBILITY_LABELS = {
  view_own: 'View Own Records Only',
  view_subordinate: 'View & Edit Subordinate Records',
  view_all: 'View & Edit All Records'
};

const RolesHierarchyPage = () => {
  const navigate = useNavigate();
  const { roles, hierarchyTree, loading, refresh } = useRoleHierarchy();
  const [expandedNodes, setExpandedNodes] = useState(new Set());
  const [selectedRole, setSelectedRole] = useState(null);
  const [roleDetails, setRoleDetails] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [editingRole, setEditingRole] = useState(null);
  const [parentRole, setParentRole] = useState(null);

  // Expand all nodes by default
  useEffect(() => {
    if (hierarchyTree.length > 0 && expandedNodes.size === 0) {
      const allIds = new Set();
      const collectIds = (nodes) => {
        nodes.forEach(node => {
          allIds.add(node.id);
          if (node.children?.length > 0) {
            collectIds(node.children);
          }
        });
      };
      collectIds(hierarchyTree);
      setExpandedNodes(allIds);
    }
  }, [hierarchyTree]);

  // Fetch role details when selected
  useEffect(() => {
    if (selectedRole) {
      fetchRoleDetails(selectedRole);
    } else {
      setRoleDetails(null);
    }
  }, [selectedRole]);

  const fetchRoleDetails = async (roleId) => {
    try {
      setLoadingDetails(true);
      const details = await roleService.getRole(roleId);
      const users = await roleService.getRoleUsers(roleId);
      setRoleDetails({ ...details, users });
    } catch (error) {
      console.error('Error fetching role details:', error);
      toast.error('Failed to load role details');
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleExpandAll = () => {
    const allIds = new Set();
    const collectIds = (nodes) => {
      nodes.forEach(node => {
        allIds.add(node.id);
        if (node.children?.length > 0) {
          collectIds(node.children);
        }
      });
    };
    collectIds(hierarchyTree);
    setExpandedNodes(allIds);
  };

  const handleCollapseAll = () => {
    setExpandedNodes(new Set());
  };

  const handleToggleExpand = (nodeId) => {
    setExpandedNodes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(nodeId)) {
        newSet.delete(nodeId);
      } else {
        newSet.add(nodeId);
      }
      return newSet;
    });
  };

  const handleEditRole = (role) => {
    setEditingRole(role);
    setParentRole(null);
    setShowCreateDialog(true);
  };

  const handleDeleteRole = async (roleId) => {
    try {
      await roleService.deleteRole(roleId);
      toast.success('Role deleted successfully');
      if (selectedRole === roleId) {
        setSelectedRole(null);
        setRoleDetails(null);
      }
      refresh();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete role');
    }
  };

  const handleAddChildRole = (parentRoleObj) => {
    setEditingRole(null);
    setParentRole(parentRoleObj);
    setShowCreateDialog(true);
  };

  const handleSuccess = () => {
    setShowCreateDialog(false);
    setEditingRole(null);
    setParentRole(null);
    refresh();
    if (selectedRole) {
      fetchRoleDetails(selectedRole);
    }
  };

  // Render tree node recursively
  const renderTreeNode = (node, depth = 0) => {
    const hasChildren = node.children && node.children.length > 0;
    const isExpanded = expandedNodes.has(node.id);
    const isSelected = selectedRole === node.id;

    return (
      <div key={node.id} data-testid={`role-node-${node.id}`}>
        <div
          className={cn(
            "flex items-center py-2 px-3 rounded-lg cursor-pointer transition-colors group",
            isSelected
              ? "bg-indigo-100 border border-indigo-200"
              : "hover:bg-slate-100",
          )}
          style={{ marginLeft: depth * 24 }}
          onClick={() => setSelectedRole(node.id)}
        >
          {/* Expand/Collapse */}
          {hasChildren ? (
            <button
              className="p-1 mr-2 hover:bg-slate-200 rounded"
              onClick={(e) => {
                e.stopPropagation();
                handleToggleExpand(node.id);
              }}
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4 text-slate-500" />
              ) : (
                <ChevronRight className="h-4 w-4 text-slate-500" />
              )}
            </button>
          ) : (
            <div className="w-6 mr-2" />
          )}

          {/* Icon */}
          <div className={cn(
            "w-8 h-8 rounded-lg flex items-center justify-center mr-3",
            isSelected ? "bg-indigo-500" : "bg-slate-200"
          )}>
            <Users className={cn(
              "h-4 w-4",
              isSelected ? "text-white" : "text-slate-600"
            )} />
          </div>

          {/* Name */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center">
              <span className={cn(
                "font-medium truncate",
                isSelected ? "text-indigo-900" : "text-slate-900"
              )}>
                {node.name}
              </span>
              {node.is_system_role && (
                <Badge variant="outline" className="ml-2 text-xs bg-purple-50 text-purple-700 border-purple-200">
                  System
                </Badge>
              )}
            </div>
            <div className="flex items-center text-xs text-slate-500">
              <Users className="h-3 w-3 mr-1" />
              {node.user_count || 0} users
            </div>
          </div>

          {/* Actions */}
          <div className="opacity-0 group-hover:opacity-100 transition-opacity">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={(e) => e.stopPropagation()}>
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleEditRole(node); }}>
                  <Pencil className="h-4 w-4 mr-2" />
                  Edit Role
                </DropdownMenuItem>
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleAddChildRole(node); }}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Subordinate Role
                </DropdownMenuItem>
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setSelectedRole(node.id); setShowAssignDialog(true); }}>
                  <UserPlus className="h-4 w-4 mr-2" />
                  Assign Users
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-red-600"
                  disabled={node.is_system_role}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (window.confirm(`Delete role "${node.name}"?`)) {
                      handleDeleteRole(node.id);
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Role
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Children */}
        {hasChildren && isExpanded && (
          <div className="mt-1">
            {node.children.map(child => renderTreeNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex-1 h-full flex flex-col" data-testid="roles-page">
      {/* Header */}
      <div className="px-6 py-4 border-b bg-white ">
        {/* Header with Back Button */}
        <div className="flex justify-between">



          <div className="flex items-center gap-4 mb-4  ">
            <button
              onClick={() => navigate('/setup')}
              className="flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors"
              data-testid="back-to-setup-btn"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="text-sm font-medium">Back to Setup</span>
            </button>
            <div className="h-8 w-px bg-slate-300" />
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
                <Users className="h-5 w-5 text-indigo-600" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-slate-900">Roles</h1>
                <p className="text-sm text-slate-500">Manage role hierarchy and user assignments</p>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-end space-x-2">
            <Button variant="outline" size="sm" onClick={refresh} data-testid="refresh-roles-btn">
              <RefreshCw className="h-4 w-4 mr-1" />
              Refresh
            </Button>
            <Button
              onClick={() => { setEditingRole(null); setParentRole(null); setShowCreateDialog(true); }}
              className="bg-indigo-600 hover:bg-indigo-700"
              data-testid="add-role-btn"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Role
            </Button>
          </div>
        </div>

      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - Role Hierarchy */}
        <div className="w-1/2 border-r bg-white overflow-auto">
          {/* Tree Controls */}
          <div className="px-4 py-3 border-b bg-slate-50 flex items-center justify-between">
            <span className="text-sm font-medium text-slate-700">Role Hierarchy</span>
            <div className="flex items-center space-x-2">
              <Button variant="ghost" size="sm" onClick={handleExpandAll} className="text-xs text-slate-600">
                <ChevronDown className="h-3 w-3 mr-1" />
                Expand All
              </Button>
              <Button variant="ghost" size="sm" onClick={handleCollapseAll} className="text-xs text-slate-600">
                <ChevronRight className="h-3 w-3 mr-1" />
                Collapse All
              </Button>
            </div>
          </div>

          {/* Tree */}
          <div className="p-4">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
              </div>
            ) : hierarchyTree.length === 0 ? (
              <div className="text-center py-12">
                <Users className="h-12 w-12 mx-auto text-slate-300 mb-4" />
                <p className="text-slate-500 mb-4">No roles defined yet</p>
                <Button variant="outline" onClick={() => setShowCreateDialog(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create First Role
                </Button>
              </div>
            ) : (
              <div className="space-y-1">
                {hierarchyTree.map(node => renderTreeNode(node, 0))}
              </div>
            )}
          </div>
        </div>

        {/* Right Panel - Role Details */}
        <div className="w-1/2 bg-slate-50 overflow-auto">
          {selectedRole ? (
            loadingDetails ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
              </div>
            ) : roleDetails ? (
              <div className="h-full flex flex-col">
                {/* Header */}
                <div className="px-6 py-4 border-b bg-white">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-lg flex items-center justify-center">
                        <Users className="h-6 w-6 text-white" />
                      </div>
                      <div>
                        <div className="flex items-center space-x-2">
                          <h2 className="text-xl font-bold text-slate-900">{roleDetails.name}</h2>
                          {roleDetails.is_system_role && (
                            <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
                              System
                            </Badge>
                          )}
                        </div>
                        {roleDetails.description && (
                          <p className="text-sm text-slate-500">{roleDetails.description}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEditRole(roleDetails)}
                        disabled={roleDetails.is_system_role}
                      >
                        <Pencil className="h-4 w-4 mr-1" />
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-red-600"
                        onClick={() => {
                          if (window.confirm(`Delete "${roleDetails.name}"?`)) {
                            handleDeleteRole(roleDetails.id);
                          }
                        }}
                        disabled={roleDetails.is_system_role || (roleDetails.users?.length || 0) > 0}
                      >
                        <Trash2 className="h-4 w-4 mr-1" />
                        Delete
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Tabs */}
                <Tabs defaultValue="details" className="flex-1 flex flex-col">
                  <TabsList className="px-6 py-2 bg-white border-b justify-start rounded-none">
                    <TabsTrigger value="details">Details</TabsTrigger>
                    <TabsTrigger value="users">Users ({roleDetails.users?.length || 0})</TabsTrigger>
                  </TabsList>

                  <TabsContent value="details" className="flex-1 overflow-auto p-6 mt-0">
                    <div className="space-y-4">
                      {/* Key Info */}
                      <div className="grid grid-cols-2 gap-4">
                        <Card className="p-4">
                          <div className="flex items-center space-x-3">
                            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                              <GitBranch className="h-5 w-5 text-blue-600" />
                            </div>
                            <div>
                              <p className="text-xs text-slate-500 uppercase">Reports To</p>
                              <p className="font-medium text-slate-900">
                                {roleDetails.parent_role_name || 'None (Top Level)'}
                              </p>
                            </div>
                          </div>
                        </Card>
                        <Card className="p-4">
                          <div className="flex items-center space-x-3">
                            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                              <Users className="h-5 w-5 text-green-600" />
                            </div>
                            <div>
                              <p className="text-xs text-slate-500 uppercase">Assigned Users</p>
                              <p className="font-medium text-slate-900">{roleDetails.users?.length || 0}</p>
                            </div>
                          </div>
                        </Card>
                      </div>

                      {/* Data Visibility */}
                      <Card className="p-4">
                        <div className="flex items-start space-x-3">
                          <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
                            <Eye className="h-5 w-5 text-amber-600" />
                          </div>
                          <div>
                            <p className="text-xs text-slate-500 uppercase mb-1">Data Visibility</p>
                            <p className="font-medium text-slate-900">
                              {DATA_VISIBILITY_LABELS[roleDetails.data_visibility] || roleDetails.data_visibility || 'View Own Records'}
                            </p>
                          </div>
                        </div>
                      </Card>

                      {/* Permission Sets */}
                      <Card className="p-4">
                        <div className="flex items-start space-x-3">
                          <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
                            <Shield className="h-5 w-5 text-indigo-600" />
                          </div>
                          <div className="flex-1">
                            <p className="text-xs text-slate-500 uppercase mb-2">Permission Sets</p>
                            {roleDetails.permission_set_ids?.length > 0 ? (
                              <div className="flex flex-wrap gap-2">
                                {roleDetails.permission_set_ids.map((psId, idx) => (
                                  <Badge key={idx} variant="outline" className="bg-indigo-50 text-indigo-700">
                                    {psId}
                                  </Badge>
                                ))}
                              </div>
                            ) : (
                              <p className="text-sm text-slate-500 italic">No permission sets assigned</p>
                            )}
                          </div>
                        </div>
                      </Card>
                    </div>
                  </TabsContent>

                  <TabsContent value="users" className="flex-1 overflow-auto p-6 mt-0">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-medium text-slate-900">Users in this Role</h3>
                      <Button
                        size="sm"
                        onClick={() => setShowAssignDialog(true)}
                        className="bg-indigo-600 hover:bg-indigo-700"
                      >
                        <UserPlus className="h-4 w-4 mr-2" />
                        Assign Users
                      </Button>
                    </div>

                    {roleDetails.users?.length > 0 ? (
                      <div className="space-y-2">
                        {roleDetails.users.map(user => (
                          <Card key={user.id} className="p-3">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center space-x-3">
                                <div className="w-10 h-10 bg-slate-200 rounded-full flex items-center justify-center">
                                  <span className="text-sm font-medium text-slate-600">
                                    {(user.first_name?.[0] || '') + (user.last_name?.[0] || '')}
                                  </span>
                                </div>
                                <div>
                                  <p className="font-medium text-slate-900">{user.first_name} {user.last_name}</p>
                                  <p className="text-sm text-slate-500">{user.email}</p>
                                </div>
                              </div>
                              <Badge className={user.is_active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-700'}>
                                {user.is_active ? 'Active' : 'Inactive'}
                              </Badge>
                            </div>
                          </Card>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-12 bg-white rounded-lg border">
                        <Users className="h-12 w-12 mx-auto text-slate-300 mb-4" />
                        <p className="text-slate-500 mb-4">No users assigned</p>
                        <Button variant="outline" onClick={() => setShowAssignDialog(true)}>
                          <UserPlus className="h-4 w-4 mr-2" />
                          Assign Users
                        </Button>
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              </div>
            ) : null
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <Users className="h-16 w-16 mx-auto text-slate-300 mb-4" />
                <p className="text-slate-500 text-lg mb-2">Select a role</p>
                <p className="text-slate-400 text-sm">Click on a role in the hierarchy to view details</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Dialogs */}
      <CreateRoleDialog
        open={showCreateDialog}
        onOpenChange={(open) => {
          setShowCreateDialog(open);
          if (!open) { setEditingRole(null); setParentRole(null); }
        }}
        roles={roles}
        parentRole={parentRole}
        editingRole={editingRole}
        onSuccess={handleSuccess}
      />

      {selectedRole && roleDetails && (
        <AssignUsersDialog
          open={showAssignDialog}
          onOpenChange={setShowAssignDialog}
          selectedRole={roleDetails}
          onSuccess={() => { handleSuccess(); }}
        />
      )}
    </div>
  );
};

export default RolesHierarchyPage;
