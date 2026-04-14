import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table';
import { Badge } from '../../../components/ui/badge';
import { Lock, Loader2, Check, X } from 'lucide-react';
import { toast } from 'react-hot-toast';

const API = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';

const PermissionsOverview = () => {
  const [permissionSets, setPermissionSets] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPermissionSets();
  }, []);

  const fetchPermissionSets = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API}/api/permission-sets`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = response.data;
      setPermissionSets(Array.isArray(data) ? data : (data.permission_sets || []));
    } catch (error) {
      console.error('Error fetching permission sets:', error);
      toast.error('Failed to load permissions');
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center space-x-3">
        <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
          <Lock className="h-5 w-5 text-indigo-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Permissions Overview</h1>
          <p className="text-sm text-slate-500">View object-level permissions for each role</p>
        </div>
      </div>

      {/* Permissions by Role */}
      {permissionSets.map((permSet) => (
        <div key={permSet.id} className="bg-white border rounded-lg overflow-hidden">
          {/* Role Header */}
          <div className="bg-gradient-to-r from-indigo-500 to-indigo-600 px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">{permSet.role_name}</h2>
                <p className="text-sm text-indigo-100">
                  {permSet.permissions.length} objects configured
                </p>
              </div>
              <Badge className="bg-white/20 text-white border-white/30">
                {permSet.is_system_permission_set ? 'System Role' : 'Custom Role'}
              </Badge>
            </div>
          </div>

          {/* Permissions Table */}
          <Table>
            <TableHeader className="bg-slate-50">
              <TableRow>
                <TableHead className="font-semibold">Object</TableHead>
                <TableHead className="text-center">Create</TableHead>
                <TableHead className="text-center">Read</TableHead>
                <TableHead className="text-center">Edit</TableHead>
                <TableHead className="text-center">Delete</TableHead>
                <TableHead className="text-center">View All</TableHead>
                <TableHead className="text-center">Modify All</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {permSet.permissions.map((perm) => (
                <TableRow key={perm.object_name}>
                  <TableCell className="font-medium capitalize">
                    {perm.object_name}
                  </TableCell>
                  <TableCell className="text-center">
                    {perm.create ? (
                      <Check className="h-4 w-4 text-green-600 mx-auto" />
                    ) : (
                      <X className="h-4 w-4 text-slate-300 mx-auto" />
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    {perm.read ? (
                      <Check className="h-4 w-4 text-green-600 mx-auto" />
                    ) : (
                      <X className="h-4 w-4 text-slate-300 mx-auto" />
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    {perm.edit ? (
                      <Check className="h-4 w-4 text-green-600 mx-auto" />
                    ) : (
                      <X className="h-4 w-4 text-slate-300 mx-auto" />
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    {perm.delete ? (
                      <Check className="h-4 w-4 text-green-600 mx-auto" />
                    ) : (
                      <X className="h-4 w-4 text-red-600 mx-auto" />
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    {perm.view_all ? (
                      <Check className="h-4 w-4 text-green-600 mx-auto" />
                    ) : (
                      <X className="h-4 w-4 text-slate-300 mx-auto" />
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    {perm.modify_all ? (
                      <Check className="h-4 w-4 text-green-600 mx-auto" />
                    ) : (
                      <X className="h-4 w-4 text-slate-300 mx-auto" />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ))}

      {/* Info Footer */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
        <p className="font-medium mb-1">📖 Permission Legend</p>
        <ul className="list-disc list-inside space-y-1 text-xs">
          <li><strong>Create:</strong> Can create new records</li>
          <li><strong>Read:</strong> Can view records</li>
          <li><strong>Edit:</strong> Can modify records</li>
          <li><strong>Delete:</strong> Can delete records</li>
          <li><strong>View All:</strong> Can see all records regardless of ownership</li>
          <li><strong>Modify All:</strong> Can edit all records regardless of ownership</li>
        </ul>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
        <p className="font-medium mb-1">ℹ️ About Permissions</p>
        <p>This is a read-only view of role-based permissions. To modify permissions, please contact your System Administrator. Custom permission sets can be created in future releases.</p>
      </div>
    </div>
  );
};

export default PermissionsOverview;