/**
 * Field Permissions Page
 * Configure field-level security per role
 */
import React, { useState } from 'react';
import { Shield, Save } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import ObjectSelector from '../components/ObjectSelector';
import FieldPermissionsTable from '../components/FieldPermissionsTable';
import { useFieldPermissions } from '../hooks/useFieldPermissions';
import { toast } from 'react-hot-toast';

const FieldPermissionsPage = ({ roleId, roleName }) => {
  const [selectedObject, setSelectedObject] = useState('lead');
  const {
    objectFields,
    fieldPermissions,
    loading,
    updateFieldPermission
  } = useFieldPermissions(roleId, selectedObject);

  const handleSave = async () => {
    try {
      toast.success('Field permissions updated (preview mode)');
      console.log('Field permissions to save:', {
        role_id: roleId,
        object: selectedObject,
        field_permissions: fieldPermissions
      });
    } catch (error) {
      toast.error('Failed to save field permissions');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
            <Shield className="h-5 w-5 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Field Permissions</h1>
            <p className="text-sm text-slate-500">
              Configure field-level access for {roleName || 'role'}
            </p>
          </div>
        </div>
        <Button onClick={handleSave}>
          <Save className="h-4 w-4 mr-2" />
          Save Permissions
        </Button>
      </div>

      <div className="bg-white border rounded-lg p-6">
        <ObjectSelector value={selectedObject} onChange={setSelectedObject} />
      </div>

      <div className="bg-white border rounded-lg shadow-sm overflow-hidden">
        <div className="px-6 py-4 bg-slate-50 border-b">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-slate-900">
                {selectedObject ? `${selectedObject.charAt(0).toUpperCase() + selectedObject.slice(1)} Fields` : 'Fields'}
              </h2>
              <p className="text-sm text-slate-500">
                {objectFields.length} fields • Configure read and edit access
              </p>
            </div>
            <Badge variant="outline" className="bg-purple-50 text-purple-700">
              {roleName || 'Role'}
            </Badge>
          </div>
        </div>
        <FieldPermissionsTable
          fields={objectFields}
          permissions={fieldPermissions}
          onUpdate={updateFieldPermission}
          loading={loading}
        />
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
        <p className="font-medium mb-2">⚠️ Field Permission Rules</p>
        <ul className="space-y-1 text-xs">
          <li><strong>Read unchecked:</strong> Field will be hidden from user (Edit automatically disabled)</li>
          <li><strong>Edit unchecked:</strong> Field will be read-only</li>
          <li><strong>System fields:</strong> Some system fields (id, created_at) cannot be edited</li>
        </ul>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
        <p className="font-medium mb-1">ℹ️ Note</p>
        <p>Field-level security is an additional layer on top of object permissions. Users must first have object-level Read/Edit permissions before field permissions apply.</p>
      </div>
    </div>
  );
};

export default FieldPermissionsPage;