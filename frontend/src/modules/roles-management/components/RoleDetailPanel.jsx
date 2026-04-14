/**
 * Role Detail Panel Component
 * Shows detailed information about a selected role
 */
import React from 'react';
import { 
  Users, 
  Loader2, 
  Pencil, 
  Trash2, 
  UserPlus, 
  Shield, 
  Eye, 
  GitBranch,
  Settings
} from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { Card } from '../../../components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../../components/ui/tabs';

const DATA_VISIBILITY_LABELS = {
  view_own: 'View Own Records Only',
  view_subordinate: 'View & Edit Subordinate Records',
  view_all: 'View & Edit All Records'
};

const RoleDetailPanel = ({
  role,
  loading,
  onEdit,
  onDelete,
  onAssignUsers,
  onRefresh
}) => {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (!role) {
    return null;
  }

  return (
    <div className="h-full flex flex-col" data-testid="role-detail-panel">
      {/* Header */}
      <div className="px-6 py-4 border-b bg-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-lg flex items-center justify-center">
              <Users className="h-6 w-6 text-white" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-xl font-bold text-slate-900">{role.name}</h2>
                {role.is_system_role && (
                  <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
                    <Shield className="h-3 w-3 mr-1" />
                    System Role
                  </Badge>
                )}
              </div>
              {role.description && (
                <p className="text-sm text-slate-500">{role.description}</p>
              )}
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onEdit}
              disabled={role.is_system_role}
              data-testid="edit-role-btn"
            >
              <Pencil className="h-4 w-4 mr-1" />
              Edit
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-red-600 hover:text-red-700"
              onClick={() => {
                if (window.confirm(`Are you sure you want to delete "${role.name}"?`)) {
                  onDelete();
                }
              }}
              disabled={role.is_system_role || role.assigned_users_count > 0}
              data-testid="delete-role-btn"
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
          <TabsTrigger value="details" className="data-[state=active]:bg-indigo-50">
            Details
          </TabsTrigger>
          <TabsTrigger value="users" className="data-[state=active]:bg-indigo-50">
            Users ({role.assigned_users_count || 0})
          </TabsTrigger>
        </TabsList>

        {/* Details Tab */}
        <TabsContent value="details" className="flex-1 overflow-auto p-6 mt-0">
          <div className="space-y-6">
            {/* Key Info Cards */}
            <div className="grid grid-cols-2 gap-4">
              <Card className="p-4">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                    <GitBranch className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 uppercase tracking-wide">Reports To</p>
                    <p className="font-medium text-slate-900">
                      {role.parent_role_name || 'None (Top Level)'}
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
                    <p className="text-xs text-slate-500 uppercase tracking-wide">Assigned Users</p>
                    <p className="font-medium text-slate-900">
                      {role.assigned_users_count || 0}
                    </p>
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
                  <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Data Visibility</p>
                  <p className="font-medium text-slate-900">
                    {DATA_VISIBILITY_LABELS[role.data_visibility] || role.data_visibility}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    {role.data_visibility === 'view_subordinate' && 
                      'Users in this role can view records owned by users in subordinate roles.'}
                    {role.data_visibility === 'view_own' && 
                      'Users in this role can only view their own records.'}
                    {role.data_visibility === 'view_all' && 
                      'Users in this role have visibility into all records regardless of ownership.'}
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
                  <p className="text-xs text-slate-500 uppercase tracking-wide mb-2">Assigned Permission Sets</p>
                  {role.permission_set_ids && role.permission_set_ids.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {role.permission_set_ids.map((psId, idx) => (
                        <Badge key={idx} variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200">
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

            {/* Metadata */}
            <Card className="p-4 bg-slate-50">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-slate-500">Created</p>
                  <p className="font-medium text-slate-700">
                    {role.created_at 
                      ? new Date(role.created_at).toLocaleDateString() 
                      : 'N/A'}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Last Updated</p>
                  <p className="font-medium text-slate-700">
                    {role.updated_at 
                      ? new Date(role.updated_at).toLocaleDateString() 
                      : 'N/A'}
                  </p>
                </div>
              </div>
            </Card>
          </div>
        </TabsContent>

        {/* Users Tab */}
        <TabsContent value="users" className="flex-1 overflow-auto p-6 mt-0">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-medium text-slate-900">
              Users in this Role
            </h3>
            <Button
              size="sm"
              onClick={onAssignUsers}
              className="bg-indigo-600 hover:bg-indigo-700"
              data-testid="assign-users-btn"
            >
              <UserPlus className="h-4 w-4 mr-2" />
              Assign Users
            </Button>
          </div>

          {role.users && role.users.length > 0 ? (
            <div className="space-y-2">
              {role.users.map(user => (
                <Card key={user.id} className="p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-slate-200 rounded-full flex items-center justify-center">
                        <span className="text-sm font-medium text-slate-600">
                          {(user.first_name?.[0] || '') + (user.last_name?.[0] || '')}
                        </span>
                      </div>
                      <div>
                        <p className="font-medium text-slate-900">
                          {user.first_name} {user.last_name}
                        </p>
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
            <div className="text-center py-12 bg-slate-50 rounded-lg">
              <Users className="h-12 w-12 mx-auto text-slate-300 mb-4" />
              <p className="text-slate-500 mb-4">No users assigned to this role</p>
              <Button variant="outline" onClick={onAssignUsers}>
                <UserPlus className="h-4 w-4 mr-2" />
                Assign Users
              </Button>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default RoleDetailPanel;
