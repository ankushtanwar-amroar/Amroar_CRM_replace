/**
 * Permission Set Editor Page
 * Create and edit permission sets with object permissions
 */
import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Lock, Save, X, Loader2, Plus, Eye, EyeOff, Check, AlertCircle, ChevronDown, ChevronUp, Pencil, Shield } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Badge } from '../../../components/ui/badge';
import { Card } from '../../../components/ui/card';
import { Switch } from '../../../components/ui/switch';
import { Checkbox } from '../../../components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import axios from 'axios';
import toast from 'react-hot-toast';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

const PermissionSetEditor = () => {
  const navigate = useNavigate();
  const location = useLocation();
  
  // Extract permission set ID from URL for edit mode
  const pathParts = location.pathname.split('/permission-sets/');
  const editId = pathParts[1]?.split('/')[0];
  const isEditMode = editId && editId !== 'new';
  
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [objects, setObjects] = useState([]);
  
  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [permissions, setPermissions] = useState([]);
  const [isSystem, setIsSystem] = useState(false);
  
  // Field-Level Security state
  const [fieldPermissions, setFieldPermissions] = useState({});
  const [expandedObject, setExpandedObject] = useState(null);
  const [objectFields, setObjectFields] = useState({});
  
  useEffect(() => {
    fetchObjects();
    if (isEditMode) {
      fetchPermissionSet();
    }
  }, [editId]);
  
  const fetchObjects = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${BACKEND_URL}/api/objects`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setObjects(response.data);
      
      // Initialize permissions for new permission sets
      if (!isEditMode) {
        const initialPerms = response.data.map(obj => ({
          object_name: obj.object_name,
          object_label: obj.label || obj.object_name,
          visible: true,
          create: false,
          read: false,
          edit: false,
          delete: false,
          view_all: false,
          modify_all: false
        }));
        setPermissions(initialPerms);
      }
    } catch (error) {
      console.error('Error fetching objects:', error);
      toast.error('Failed to load objects');
    }
  };
  
  const fetchPermissionSet = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const response = await axios.get(`${BACKEND_URL}/api/permission-sets/${editId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      const ps = response.data;
      setName(ps.name || ps.role_name || '');
      setDescription(ps.description || '');
      setIsSystem(ps.is_system_permission_set || false);
      
      // Map permissions with object labels
      const permsWithLabels = ps.permissions.map(perm => {
        const obj = objects.find(o => o.object_name === perm.object_name);
        return {
          ...perm,
          object_label: obj?.label || perm.object_name,
          visible: perm.visible !== false // Default to true for backward compatibility
        };
      });
      setPermissions(permsWithLabels);
      
      // Load field permissions if present
      if (ps.field_permissions) {
        setFieldPermissions(ps.field_permissions);
      }
      
    } catch (error) {
      console.error('Error fetching permission set:', error);
      toast.error('Failed to load permission set');
    } finally {
      setLoading(false);
    }
  };
  
  // Fetch fields for a specific object (for FLS configuration)
  const fetchObjectFields = async (objectName) => {
    if (objectFields[objectName]) return; // Already fetched
    
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${BACKEND_URL}/api/objects/${objectName}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      const fields = response.data.fields || {};
      setObjectFields(prev => ({
        ...prev,
        [objectName]: Object.entries(fields).map(([key, field]) => ({
          api_name: key,
          label: field.label || key,
          type: field.type,
          required: field.required
        }))
      }));
    } catch (error) {
      console.error(`Error fetching fields for ${objectName}:`, error);
    }
  };
  
  // Toggle expanded object for FLS editing
  const toggleExpandedObject = async (objectName) => {
    if (expandedObject === objectName) {
      setExpandedObject(null);
    } else {
      setExpandedObject(objectName);
      await fetchObjectFields(objectName);
    }
  };
  
  const handlePermissionChange = (objectName, field, value) => {
    setPermissions(prev => prev.map(perm => {
      if (perm.object_name === objectName) {
        return { ...perm, [field]: value };
      }
      return perm;
    }));
  };
  
  const toggleAllForObject = (objectName, enabled) => {
    setPermissions(prev => prev.map(perm => {
      if (perm.object_name === objectName) {
        return {
          ...perm,
          visible: enabled,
          create: enabled,
          read: enabled,
          edit: enabled,
          delete: enabled,
          view_all: false,
          modify_all: false
        };
      }
      return perm;
    }));
  };
  
  // Field-Level Security handlers
  const getFieldPermission = (objectName, fieldName) => {
    const objPerms = fieldPermissions[objectName] || [];
    return objPerms.find(fp => fp.field_name === fieldName) || { hidden: false, editable: true };
  };
  
  const setFieldPermission = (objectName, fieldName, permission) => {
    setFieldPermissions(prev => {
      const objPerms = [...(prev[objectName] || [])];
      const existingIndex = objPerms.findIndex(fp => fp.field_name === fieldName);
      
      if (existingIndex >= 0) {
        objPerms[existingIndex] = { ...objPerms[existingIndex], ...permission, field_name: fieldName };
      } else {
        objPerms.push({ field_name: fieldName, hidden: false, editable: true, ...permission });
      }
      
      return { ...prev, [objectName]: objPerms };
    });
  };
  
  const getFieldAccessLevel = (objectName, fieldName) => {
    const fp = getFieldPermission(objectName, fieldName);
    if (fp.hidden) return 'hidden';
    if (fp.editable === false) return 'read';
    return 'edit';
  };
  
  const setFieldAccessLevel = (objectName, fieldName, level) => {
    switch (level) {
      case 'hidden':
        setFieldPermission(objectName, fieldName, { hidden: true, editable: false });
        break;
      case 'read':
        setFieldPermission(objectName, fieldName, { hidden: false, editable: false });
        break;
      case 'edit':
      default:
        setFieldPermission(objectName, fieldName, { hidden: false, editable: true });
        break;
    }
  };
  
  const setAllFieldsForObject = (objectName, level) => {
    const fields = objectFields[objectName] || [];
    fields.forEach(field => {
      setFieldAccessLevel(objectName, field.api_name, level);
    });
  };
  
  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Please enter a name for the permission set');
      return;
    }
    
    try {
      setSaving(true);
      const token = localStorage.getItem('token');
      
      const payload = {
        name: name.trim(),
        description: description.trim(),
        permissions: permissions.map(p => ({
          object_name: p.object_name,
          visible: p.visible,
          create: p.create,
          read: p.read,
          edit: p.edit,
          delete: p.delete,
          view_all: p.view_all,
          modify_all: p.modify_all
        })),
        field_permissions: fieldPermissions
      };
      
      if (isEditMode) {
        await axios.put(`${BACKEND_URL}/api/permission-sets/${editId}`, payload, {
          headers: { Authorization: `Bearer ${token}` }
        });
        toast.success('Permission set updated successfully');
      } else {
        await axios.post(`${BACKEND_URL}/api/permission-sets`, payload, {
          headers: { Authorization: `Bearer ${token}` }
        });
        toast.success('Permission set created successfully');
      }
      
      navigate('/setup/security-center/permission-sets');
      
    } catch (error) {
      console.error('Error saving permission set:', error);
      toast.error(error.response?.data?.detail || 'Failed to save permission set');
    } finally {
      setSaving(false);
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
        <span className="text-slate-900 font-medium">
          {isEditMode ? 'Edit Permission Set' : 'New Permission Set'}
        </span>
      </div>
      
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-500 to-indigo-600 rounded-lg p-6 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="w-16 h-16 bg-white/20 rounded-lg flex items-center justify-center">
              <Lock className="h-8 w-8 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-semibold mb-2">
                {isEditMode ? 'Edit Permission Set' : 'Create Permission Set'}
              </h1>
              <p className="text-indigo-100">
                {isEditMode ? 'Modify object permissions for this permission set' : 'Define object permissions for users'}
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <Button
              variant="outline"
              onClick={() => navigate('/setup/security-center/permission-sets')}
              className="bg-white/10 border-white/30 text-white hover:bg-white/20"
            >
              <X className="h-4 w-4 mr-2" />
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || isSystem}
              className="bg-white text-indigo-600 hover:bg-white/90"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Save
            </Button>
          </div>
        </div>
      </div>
      
      {/* System Permission Set Warning */}
      {isSystem && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-center space-x-3">
          <AlertCircle className="h-5 w-5 text-amber-600" />
          <div>
            <p className="font-medium text-amber-800">System Permission Set</p>
            <p className="text-sm text-amber-700">
              This is a system permission set and cannot be modified. Create a custom permission set instead.
            </p>
          </div>
        </div>
      )}
      
      {/* Basic Info */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Basic Information</h2>
        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="name">Permission Set Name *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Sales Team Access"
              disabled={isSystem}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
              disabled={isSystem}
            />
          </div>
        </div>
      </Card>
      
      {/* Object Permissions */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Object Permissions</h2>
        <p className="text-sm text-slate-500 mb-4">
          Configure which objects users can access and what actions they can perform.
        </p>
        
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-slate-50">
                <th className="text-left py-3 px-4 font-medium text-slate-600 w-48">Object</th>
                <th className="text-center py-3 px-2 font-medium text-slate-600 w-20">
                  <div className="flex flex-col items-center">
                    <Eye className="h-4 w-4 mb-1" />
                    <span>Visible</span>
                  </div>
                </th>
                <th className="text-center py-3 px-2 font-medium text-slate-600 w-20">Create</th>
                <th className="text-center py-3 px-2 font-medium text-slate-600 w-20">Read</th>
                <th className="text-center py-3 px-2 font-medium text-slate-600 w-20">Edit</th>
                <th className="text-center py-3 px-2 font-medium text-slate-600 w-20">Delete</th>
                <th className="text-center py-3 px-2 font-medium text-slate-600 w-20">View All</th>
                <th className="text-center py-3 px-2 font-medium text-slate-600 w-20">Modify All</th>
                <th className="text-center py-3 px-2 font-medium text-slate-600 w-24">Quick</th>
              </tr>
            </thead>
            <tbody>
              {permissions.map((perm) => (
                <tr key={perm.object_name} className="border-b hover:bg-slate-50">
                  <td className="py-3 px-4 font-medium capitalize">
                    {perm.object_label || perm.object_name}
                  </td>
                  <td className="text-center py-3 px-2">
                    <Checkbox
                      checked={perm.visible}
                      onCheckedChange={(checked) => handlePermissionChange(perm.object_name, 'visible', checked)}
                      disabled={isSystem}
                      className="data-[state=checked]:bg-blue-600"
                    />
                  </td>
                  <td className="text-center py-3 px-2">
                    <Checkbox
                      checked={perm.create}
                      onCheckedChange={(checked) => handlePermissionChange(perm.object_name, 'create', checked)}
                      disabled={isSystem}
                      className="data-[state=checked]:bg-green-600"
                    />
                  </td>
                  <td className="text-center py-3 px-2">
                    <Checkbox
                      checked={perm.read}
                      onCheckedChange={(checked) => handlePermissionChange(perm.object_name, 'read', checked)}
                      disabled={isSystem}
                      className="data-[state=checked]:bg-green-600"
                    />
                  </td>
                  <td className="text-center py-3 px-2">
                    <Checkbox
                      checked={perm.edit}
                      onCheckedChange={(checked) => handlePermissionChange(perm.object_name, 'edit', checked)}
                      disabled={isSystem}
                      className="data-[state=checked]:bg-green-600"
                    />
                  </td>
                  <td className="text-center py-3 px-2">
                    <Checkbox
                      checked={perm.delete}
                      onCheckedChange={(checked) => handlePermissionChange(perm.object_name, 'delete', checked)}
                      disabled={isSystem}
                      className="data-[state=checked]:bg-red-600"
                    />
                  </td>
                  <td className="text-center py-3 px-2">
                    <Checkbox
                      checked={perm.view_all}
                      onCheckedChange={(checked) => handlePermissionChange(perm.object_name, 'view_all', checked)}
                      disabled={isSystem}
                      className="data-[state=checked]:bg-purple-600"
                    />
                  </td>
                  <td className="text-center py-3 px-2">
                    <Checkbox
                      checked={perm.modify_all}
                      onCheckedChange={(checked) => handlePermissionChange(perm.object_name, 'modify_all', checked)}
                      disabled={isSystem}
                      className="data-[state=checked]:bg-purple-600"
                    />
                  </td>
                  <td className="text-center py-3 px-2">
                    <div className="flex items-center justify-center space-x-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleAllForObject(perm.object_name, true)}
                        disabled={isSystem}
                        className="h-7 px-2 text-green-600 hover:text-green-700 hover:bg-green-50"
                      >
                        All
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleAllForObject(perm.object_name, false)}
                        disabled={isSystem}
                        className="h-7 px-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        None
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      
      {/* Field-Level Security */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
              <Shield className="h-5 w-5 text-indigo-600" />
              Field-Level Security
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              Control visibility and editability for individual fields on each object.
            </p>
          </div>
          <Badge variant="outline" className="text-xs">
            Click object row to expand
          </Badge>
        </div>
        
        <div className="border rounded-lg overflow-hidden">
          {permissions.map((perm) => (
            <div key={`fls-${perm.object_name}`} className="border-b last:border-b-0">
              {/* Object Row */}
              <button
                onClick={() => toggleExpandedObject(perm.object_name)}
                disabled={isSystem}
                className="w-full flex items-center justify-between p-4 hover:bg-slate-50 transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  {expandedObject === perm.object_name ? (
                    <ChevronUp className="h-4 w-4 text-slate-400" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-slate-400" />
                  )}
                  <span className="font-medium capitalize">{perm.object_label || perm.object_name}</span>
                </div>
                <div className="flex items-center gap-2">
                  {fieldPermissions[perm.object_name]?.length > 0 ? (
                    <Badge variant="secondary" className="text-xs bg-amber-100 text-amber-700">
                      {fieldPermissions[perm.object_name].length} field rules
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs text-slate-400">
                      No restrictions
                    </Badge>
                  )}
                </div>
              </button>
              
              {/* Expanded Field Permissions */}
              {expandedObject === perm.object_name && (
                <div className="bg-slate-50 border-t p-4">
                  {!objectFields[perm.object_name] ? (
                    <div className="flex items-center justify-center py-4 text-slate-500">
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Loading fields...
                    </div>
                  ) : objectFields[perm.object_name]?.length === 0 ? (
                    <p className="text-sm text-slate-500 text-center py-4">No fields found</p>
                  ) : (
                    <>
                      {/* Quick Actions */}
                      <div className="flex items-center justify-between mb-4 pb-3 border-b">
                        <span className="text-sm font-medium text-slate-600">Quick Set All Fields:</span>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setAllFieldsForObject(perm.object_name, 'edit')}
                            disabled={isSystem}
                            className="text-green-600 border-green-200 hover:bg-green-50"
                          >
                            <Pencil className="h-3 w-3 mr-1" />
                            All Editable
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setAllFieldsForObject(perm.object_name, 'read')}
                            disabled={isSystem}
                            className="text-blue-600 border-blue-200 hover:bg-blue-50"
                          >
                            <Eye className="h-3 w-3 mr-1" />
                            All Read-Only
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setAllFieldsForObject(perm.object_name, 'hidden')}
                            disabled={isSystem}
                            className="text-red-600 border-red-200 hover:bg-red-50"
                          >
                            <EyeOff className="h-3 w-3 mr-1" />
                            All Hidden
                          </Button>
                        </div>
                      </div>
                      
                      {/* Fields Grid */}
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {objectFields[perm.object_name]?.map((field) => {
                          const accessLevel = getFieldAccessLevel(perm.object_name, field.api_name);
                          return (
                            <div
                              key={field.api_name}
                              className="flex items-center justify-between p-3 bg-white rounded-lg border"
                            >
                              <div className="flex-1 min-w-0 mr-3">
                                <p className="text-sm font-medium text-slate-700 truncate">
                                  {field.label}
                                  {field.required && (
                                    <span className="text-red-500 ml-1">*</span>
                                  )}
                                </p>
                                <p className="text-xs text-slate-400 truncate">{field.api_name}</p>
                              </div>
                              <Select
                                value={accessLevel}
                                onValueChange={(value) => setFieldAccessLevel(perm.object_name, field.api_name, value)}
                                disabled={isSystem}
                              >
                                <SelectTrigger className={`w-28 h-8 text-xs ${
                                  accessLevel === 'hidden' ? 'border-red-200 bg-red-50 text-red-700' :
                                  accessLevel === 'read' ? 'border-blue-200 bg-blue-50 text-blue-700' :
                                  'border-green-200 bg-green-50 text-green-700'
                                }`}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="edit" className="text-green-600">
                                    <div className="flex items-center gap-1">
                                      <Pencil className="h-3 w-3" />
                                      Editable
                                    </div>
                                  </SelectItem>
                                  <SelectItem value="read" className="text-blue-600">
                                    <div className="flex items-center gap-1">
                                      <Eye className="h-3 w-3" />
                                      Read Only
                                    </div>
                                  </SelectItem>
                                  <SelectItem value="hidden" className="text-red-600">
                                    <div className="flex items-center gap-1">
                                      <EyeOff className="h-3 w-3" />
                                      Hidden
                                    </div>
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>
      
      {/* Legend */}
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-sm text-slate-600">
        <p className="font-medium mb-2">📖 Permission Definitions</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div><strong className="text-blue-600">Visible:</strong> Object shows in navigation</div>
          <div><strong className="text-green-600">Create:</strong> Create new records</div>
          <div><strong className="text-green-600">Read:</strong> View records</div>
          <div><strong className="text-green-600">Edit:</strong> Modify owned records</div>
          <div><strong className="text-red-600">Delete:</strong> Remove records</div>
          <div><strong className="text-purple-600">View All:</strong> See all records</div>
          <div><strong className="text-purple-600">Modify All:</strong> Edit all records</div>
        </div>
      </div>
    </div>
  );
};

export default PermissionSetEditor;
