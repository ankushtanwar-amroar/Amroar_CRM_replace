/**
 * Roles Management Page
 * Main page for role hierarchy management following target UI design
 */
import React, { useState, useEffect } from 'react';
import { Users, Plus, Settings, ChevronDown, ChevronRight, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { toast } from 'react-hot-toast';
import RoleHierarchyTree from '../components/RoleHierarchyTree';
import RoleDetailPanel from '../components/RoleDetailPanel';
import CreateRoleDialog from '../components/CreateRoleDialog';
import AssignUsersDialog from '../components/AssignUsersDialog';
import { useRoles } from '../hooks/useRoles';
import rolesService from '../services/rolesService';

const RolesPage = () => {
  const { hierarchy, loading, refresh } = useRoles();
  const [selectedRole, setSelectedRole] = useState(null);
  const [expandedNodes, setExpandedNodes] = useState(new Set());
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [editingRole, setEditingRole] = useState(null);
  const [roleDetails, setRoleDetails] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Expand all nodes by default
  useEffect(() => {
    if (hierarchy.length > 0) {
      const allIds = new Set();
      const collectIds = (nodes) => {
        nodes.forEach(node => {
          allIds.add(node.id);
          if (node.children?.length > 0) {
            collectIds(node.children);
          }
        });
      };
      collectIds(hierarchy);
      setExpandedNodes(allIds);
    }
  }, [hierarchy]);

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
      const details = await rolesService.getRole(roleId);
      const users = await rolesService.getRoleUsers(roleId);
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
    collectIds(hierarchy);
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

  const handleSelectRole = (roleId) => {
    setSelectedRole(roleId);
  };

  const handleEditRole = (role) => {
    setEditingRole(role);
    setShowCreateDialog(true);
  };

  const handleDeleteRole = async (roleId) => {
    try {
      await rolesService.deleteRole(roleId);
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

  const handleCreateSuccess = () => {
    setShowCreateDialog(false);
    setEditingRole(null);
    refresh();
    toast.success(editingRole ? 'Role updated successfully' : 'Role created successfully');
  };

  const handleAssignUsers = () => {
    if (selectedRole) {
      setShowAssignDialog(true);
    }
  };

  const handleAssignSuccess = () => {
    setShowAssignDialog(false);
    if (selectedRole) {
      fetchRoleDetails(selectedRole);
    }
    refresh();
  };

  // Get flat list of roles for parent selection
  const flattenRoles = (nodes, list = []) => {
    nodes.forEach(node => {
      list.push({ id: node.id, name: node.name, level: node.level || 0 });
      if (node.children?.length > 0) {
        flattenRoles(node.children, list);
      }
    });
    return list;
  };

  const allRoles = flattenRoles(hierarchy);

  return (
    <div className="flex-1 h-full flex flex-col" data-testid="roles-page">
      {/* Header */}
      <div className="px-6 py-4 border-b bg-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
              <Users className="h-5 w-5 text-indigo-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Roles</h1>
              <p className="text-sm text-slate-500">Manage role hierarchy and user assignments</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={refresh}
              className="text-slate-600"
              data-testid="refresh-roles-btn"
            >
              <RefreshCw className="h-4 w-4 mr-1" />
              Refresh
            </Button>
            <Button
              onClick={() => { setEditingRole(null); setShowCreateDialog(true); }}
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
              <Button
                variant="ghost"
                size="sm"
                onClick={handleExpandAll}
                className="text-xs text-slate-600"
                data-testid="expand-all-btn"
              >
                <ChevronDown className="h-3 w-3 mr-1" />
                Expand All
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCollapseAll}
                className="text-xs text-slate-600"
                data-testid="collapse-all-btn"
              >
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
            ) : hierarchy.length === 0 ? (
              <div className="text-center py-12">
                <Users className="h-12 w-12 mx-auto text-slate-300 mb-4" />
                <p className="text-slate-500 mb-4">No roles defined yet</p>
                <Button
                  onClick={() => { setEditingRole(null); setShowCreateDialog(true); }}
                  variant="outline"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Create First Role
                </Button>
              </div>
            ) : (
              <RoleHierarchyTree
                nodes={hierarchy}
                expandedNodes={expandedNodes}
                selectedRole={selectedRole}
                onToggleExpand={handleToggleExpand}
                onSelectRole={handleSelectRole}
                onEditRole={handleEditRole}
                onDeleteRole={handleDeleteRole}
              />
            )}
          </div>
        </div>

        {/* Right Panel - Role Details */}
        <div className="w-1/2 bg-slate-50 overflow-auto">
          {selectedRole ? (
            <RoleDetailPanel
              role={roleDetails}
              loading={loadingDetails}
              onEdit={() => roleDetails && handleEditRole(roleDetails)}
              onDelete={() => handleDeleteRole(selectedRole)}
              onAssignUsers={handleAssignUsers}
              onRefresh={() => fetchRoleDetails(selectedRole)}
            />
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

      {/* Create/Edit Role Dialog */}
      <CreateRoleDialog
        open={showCreateDialog}
        onOpenChange={(open) => {
          setShowCreateDialog(open);
          if (!open) setEditingRole(null);
        }}
        editingRole={editingRole}
        allRoles={allRoles}
        onSuccess={handleCreateSuccess}
      />

      {/* Assign Users Dialog */}
      {selectedRole && (
        <AssignUsersDialog
          open={showAssignDialog}
          onOpenChange={setShowAssignDialog}
          roleId={selectedRole}
          roleName={roleDetails?.name}
          onSuccess={handleAssignSuccess}
        />
      )}
    </div>
  );
};

export default RolesPage;
