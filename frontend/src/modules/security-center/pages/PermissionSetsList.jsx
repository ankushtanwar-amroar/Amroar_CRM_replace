/**
 * Permission Sets List Page
 * Salesforce-style list of permission sets
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Loader2, Eye, Users, Plus, Pencil, ArrowLeft } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { Card } from '../../../components/ui/card';
import { usePermissionSets } from '../hooks/usePermissionSets';

const PermissionSetsList = () => {
  const navigate = useNavigate();
  const { permissionSets, loading } = usePermissionSets();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6" data-testid="permission-sets-page">
      {/* Header with Back Button */}
      <div className="flex items-center gap-4 mb-6">
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
            <Lock className="h-5 w-5 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Permission Sets</h1>
            <p className="text-sm text-slate-500">Manage object and action permissions</p>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center justify-end space-x-3">
        <Button
          onClick={() => navigate('/setup/security-center/permission-sets/assign')}
          variant="outline"
        >
          <Users className="h-4 w-4 mr-2" />
          Assign to Users
        </Button>
        <Button
          onClick={() => navigate('/setup/security-center/permission-sets/new')}
          className="bg-indigo-600 hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4 mr-2" />
          New Permission Set
        </Button>
      </div>

      {/* Permission Sets Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {permissionSets.map((permSet) => (
          <Card key={permSet.id} className="p-6 hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => navigate(`/setup/security-center/permission-sets/${permSet.id}`)}>
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-lg flex items-center justify-center">
                  <Lock className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900">{permSet.name || permSet.role_name}</h3>
                  <p className="text-xs text-slate-500">
                    {permSet.permissions.length} objects configured
                  </p>
                </div>
              </div>
              <Badge variant="outline" className={permSet.is_system_permission_set ? "bg-purple-50 text-purple-700 border-purple-200" : "bg-green-50 text-green-700 border-green-200"}>
                {permSet.is_system_permission_set ? 'System' : 'Custom'}
              </Badge>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-4 gap-2 mb-4">
              <div className="bg-blue-50 rounded p-2 text-center">
                <div className="text-xl font-bold text-blue-700">
                  {permSet.permissions.filter(p => p.visible !== false).length}
                </div>
                <div className="text-xs text-blue-600">Visible</div>
              </div>
              <div className="bg-green-50 rounded p-2 text-center">
                <div className="text-xl font-bold text-green-700">
                  {permSet.permissions.filter(p => p.create).length}
                </div>
                <div className="text-xs text-green-600">Create</div>
              </div>
              <div className="bg-yellow-50 rounded p-2 text-center">
                <div className="text-xl font-bold text-yellow-700">
                  {permSet.permissions.filter(p => p.read).length}
                </div>
                <div className="text-xs text-yellow-600">Read</div>
              </div>
              <div className="bg-red-50 rounded p-2 text-center">
                <div className="text-xl font-bold text-red-700">
                  {permSet.permissions.filter(p => p.delete).length}
                </div>
                <div className="text-xs text-red-600">Delete</div>
              </div>
            </div>

            <div className="flex space-x-2">
              <Button variant="outline" size="sm" className="flex-1" onClick={(e) => {
                e.stopPropagation();
                navigate(`/setup/security-center/permission-sets/${permSet.id}`);
              }}>
                <Eye className="h-4 w-4 mr-2" />
                View
              </Button>
              {!permSet.is_system_permission_set && (
                <Button variant="outline" size="sm" className="flex-1" onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/setup/security-center/permission-sets/${permSet.id}/edit`);
                }}>
                  <Pencil className="h-4 w-4 mr-2" />
                  Edit
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>

      {/* Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
        <p className="font-medium mb-1">ℹ️ About Permission Sets</p>
        <p>Permission sets define what actions users can perform on objects. The <strong>Visible</strong> flag controls whether the object appears in navigation and menus. Assign permission sets directly to users or group them in Permission Bundles.</p>
      </div>
    </div>
  );
};

export default PermissionSetsList;