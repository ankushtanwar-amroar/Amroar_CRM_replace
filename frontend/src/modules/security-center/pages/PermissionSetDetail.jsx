/**
 * Permission Set Detail Page
 * View detailed permissions for a permission set
 */
import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Lock, Loader2 } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import permissionSetService from '../services/permissionSetService';
import PermissionMatrix from '../components/PermissionMatrix';

const PermissionSetDetail = () => {
  const navigate = useNavigate();
  const location = useLocation();
  
  // Extract permission set ID from URL pathname
  // URL format: /setup/security-center/permission-sets/{permissionSetId}
  const pathParts = location.pathname.split('/permission-sets/');
  const permissionSetId = pathParts[1] ? pathParts[1].split('/')[0] : null;
  
  const [permissionSet, setPermissionSet] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (permissionSetId) {
      fetchPermissionSet();
    }
  }, [permissionSetId]);

  const fetchPermissionSet = async () => {
    try {
      setLoading(true);
      const data = await permissionSetService.getByRoleId(permissionSetId);
      setPermissionSet(data);
    } catch (error) {
      console.error('Error fetching permission set:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (!permissionSet) {
    return (
      <div className="text-center py-12 text-slate-500">
        Permission set not found
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center space-x-2 text-sm">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/setup/security-center/permission-sets')}
          className="text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Permission Sets
        </Button>
        <span className="text-slate-400">›</span>
        <span className="text-slate-900 font-medium">{permissionSet.name || permissionSet.role_name}</span>
      </div>

      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-500 to-indigo-600 rounded-lg p-6 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="w-16 h-16 bg-white/20 rounded-lg flex items-center justify-center">
              <Lock className="h-8 w-8 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-semibold mb-2">{permissionSet.name || permissionSet.role_name}</h1>
              <p className="text-indigo-100">
                {permissionSet.permissions.length} objects configured
              </p>
            </div>
          </div>
          <Badge className="bg-white/20 text-white border-white/30 text-sm px-4 py-2">
            {permissionSet.is_system_permission_set ? 'System Permission Set' : 'Custom'}
          </Badge>
        </div>
      </div>

      {/* Permission Matrix */}
      <div className="bg-white border rounded-lg overflow-hidden shadow-sm">
        <div className="px-6 py-4 bg-slate-50 border-b">
          <h2 className="font-semibold text-slate-900">Object Permissions</h2>
          <p className="text-sm text-slate-500">Define what actions this role can perform on each object</p>
        </div>
        <PermissionMatrix permissions={permissionSet.permissions} readOnly={true} />
      </div>

      {/* Legend */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
        <p className="font-medium mb-2">📖 Permission Definitions</p>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div><strong>Visible:</strong> Object appears in navigation/menus</div>
          <div><strong>View All:</strong> See all records (ignore ownership)</div>
          <div><strong>Create:</strong> Can create new records</div>
          <div><strong>Modify All:</strong> Edit all records (ignore ownership)</div>
          <div><strong>Read:</strong> Can view records</div>
          <div><strong>Delete:</strong> Can permanently remove records</div>
          <div><strong>Edit:</strong> Can modify owned records</div>
        </div>
      </div>

      {/* Field Permissions Link */}
      <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4\">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-indigo-900 mb-1">🔒 Field-Level Security</p>
            <p className="text-sm text-indigo-700">Configure which fields users can view and edit</p>
          </div>
          <Button
            variant="outline"
            onClick={() => navigate(`/setup/field-permissions/${permissionSet.role_id}`)}
            className="border-indigo-300"
          >
            Configure Field Permissions
          </Button>
        </div>
      </div>

      {/* Read-only notice */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
        <p className="font-medium mb-1">🔒 Read-Only View</p>
        <p>System permission sets cannot be modified. Custom permission sets will be available in future releases.</p>
      </div>
    </div>
  );
};

export default PermissionSetDetail;