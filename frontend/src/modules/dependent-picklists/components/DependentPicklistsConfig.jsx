/**
 * DependentPicklistsConfig Component
 * Main configuration UI for dependent picklists
 * Updated: Dependencies are now GLOBAL (object-level), not per record type
 * Similar to Salesforce's dependent picklist configuration
 */
import React, { useState, useEffect } from 'react';
import { 
  Plus, Trash2, Edit2, Save, X, Link2, ArrowRight, 
  AlertCircle, CheckCircle, Loader2, ChevronDown, ChevronUp,
  Settings, ToggleLeft, ToggleRight
} from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Label } from '../../../components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../../components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../../components/ui/dialog';
import {
  Alert,
  AlertDescription,
} from '../../../components/ui/alert';
import { Switch } from '../../../components/ui/switch';
import toast from 'react-hot-toast';
import { useDependentPicklists } from '../hooks/useDependentPicklists';
import DependentPicklistMappingEditor from './DependentPicklistMappingEditor';

const DependentPicklistsConfig = ({ 
  objectName, 
  picklistFields = [] // Array of { api_name, label, options: [] }
}) => {
  // Note: recordTypeId/recordTypeName are no longer needed - dependencies are GLOBAL
  const {
    configs,
    loading,
    saving,
    error,
    createConfig,
    updateConfig,
    deleteConfig,
    toggleActive
  } = useDependentPicklists(objectName);

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingConfig, setEditingConfig] = useState(null);
  const [expandedConfig, setExpandedConfig] = useState(null);
  
  // New dependency form state
  const [controllingField, setControllingField] = useState('');
  const [dependentField, setDependentField] = useState('');
  const [mapping, setMapping] = useState({});
  const [formError, setFormError] = useState('');

  // Get picklist fields that can be controlling (single select picklists)
  const controllingFieldOptions = picklistFields.filter(f => 
    f.type === 'picklist' || f.field_type === 'picklist'
  );

  // Get picklist fields that can be dependent (excluding selected controlling)
  const dependentFieldOptions = picklistFields.filter(f => 
    (f.type === 'picklist' || f.field_type === 'picklist') &&
    f.api_name !== controllingField
  );

  // Get field by API name
  const getFieldByApi = (apiName) => {
    return picklistFields.find(f => f.api_name === apiName);
  };

  // Get controlling field options
  const getControllingOptions = () => {
    const field = getFieldByApi(controllingField);
    return field?.options || field?.picklist_values || [];
  };

  // Get dependent field options
  const getDependentOptions = () => {
    const field = getFieldByApi(dependentField);
    return field?.options || field?.picklist_values || [];
  };

  // Reset form
  const resetForm = () => {
    setControllingField('');
    setDependentField('');
    setMapping({});
    setFormError('');
    setEditingConfig(null);
  };

  // Open add dialog
  const handleOpenAdd = () => {
    resetForm();
    setShowAddDialog(true);
  };

  // Open edit dialog
  const handleEdit = (config) => {
    setControllingField(config.controlling_field_api);
    setDependentField(config.dependent_field_api);
    setMapping(config.mapping || {});
    setEditingConfig(config);
    setFormError('');
    setShowAddDialog(true);
  };

  // Close dialog
  const handleCloseDialog = () => {
    setShowAddDialog(false);
    resetForm();
  };

  // Validate form
  const validateForm = () => {
    if (!controllingField) {
      setFormError('Please select a controlling field');
      return false;
    }
    if (!dependentField) {
      setFormError('Please select a dependent field');
      return false;
    }
    if (controllingField === dependentField) {
      setFormError('Controlling and dependent fields must be different');
      return false;
    }
    
    // Check if mapping has at least one entry
    const hasMapping = Object.values(mapping).some(values => values.length > 0);
    if (!hasMapping) {
      setFormError('Please configure at least one value mapping');
      return false;
    }
    
    setFormError('');
    return true;
  };

  // Save configuration
  const handleSave = async () => {
    if (!validateForm()) return;

    const controllingFieldObj = getFieldByApi(controllingField);
    const dependentFieldObj = getFieldByApi(dependentField);

    const data = {
      controlling_field_api: controllingField,
      controlling_field_label: controllingFieldObj?.label || controllingField,
      dependent_field_api: dependentField,
      dependent_field_label: dependentFieldObj?.label || dependentField,
      mapping
    };

    try {
      if (editingConfig) {
        await updateConfig(editingConfig.id, data);
        toast.success('Dependent picklist configuration updated successfully');
      } else {
        await createConfig(data);
        toast.success('Dependent picklist configuration saved successfully');
      }
      handleCloseDialog();
    } catch (err) {
      toast.error(err.message);
    }
  };

  // Delete configuration
  const handleDelete = async (configId) => {
    if (!window.confirm('Are you sure you want to delete this dependent picklist configuration?')) {
      return;
    }

    try {
      await deleteConfig(configId);
      toast.success('Configuration deleted');
    } catch (err) {
      toast.error(err.message);
    }
  };

  // Toggle active status
  const handleToggleActive = async (config) => {
    try {
      await toggleActive(config.id, !config.is_active);
      toast.success(`Configuration ${config.is_active ? 'deactivated' : 'activated'}`);
    } catch (err) {
      toast.error(err.message);
    }
  };

  // Toggle expanded
  const toggleExpanded = (configId) => {
    setExpandedConfig(prev => prev === configId ? null : configId);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
        <span className="ml-2 text-slate-600">Loading dependent picklist configurations...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Dependent Picklists</h3>
          <p className="text-sm text-slate-500">
            Configure dependent picklist relationships for this object. These rules apply to all records regardless of record type.
          </p>
        </div>
        <Button onClick={handleOpenAdd} className="gap-2">
          <Plus className="h-4 w-4" />
          New Dependency
        </Button>
      </div>

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Empty State */}
      {configs.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Link2 className="h-12 w-12 text-slate-300 mb-4" />
            <h4 className="text-lg font-medium text-slate-700 mb-2">No Dependent Picklists</h4>
            <p className="text-sm text-slate-500 text-center max-w-md mb-4">
              Create dependent picklist relationships to control which values appear in one picklist 
              based on the selection in another picklist.
            </p>
            <Button onClick={handleOpenAdd} variant="outline" className="gap-2">
              <Plus className="h-4 w-4" />
              Add First Dependency
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Configurations List */}
      {configs.length > 0 && (
        <div className="space-y-3">
          {configs.map((config) => (
            <Card 
              key={config.id} 
              className={`transition-all ${!config.is_active ? 'opacity-60 bg-slate-50' : ''}`}
            >
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {/* Expand/Collapse */}
                    <button 
                      onClick={() => toggleExpanded(config.id)}
                      className="p-1 hover:bg-slate-100 rounded"
                    >
                      {expandedConfig === config.id ? (
                        <ChevronUp className="h-4 w-4 text-slate-500" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-slate-500" />
                      )}
                    </button>
                    
                    {/* Field Labels */}
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-1 bg-blue-100 text-blue-700 text-sm font-medium rounded">
                        {config.controlling_field_label || config.controlling_field_api}
                      </span>
                      <ArrowRight className="h-4 w-4 text-slate-400" />
                      <span className="px-2 py-1 bg-green-100 text-green-700 text-sm font-medium rounded">
                        {config.dependent_field_label || config.dependent_field_api}
                      </span>
                    </div>
                    
                    {/* Status Badge */}
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      config.is_active 
                        ? 'bg-emerald-100 text-emerald-700' 
                        : 'bg-slate-100 text-slate-500'
                    }`}>
                      {config.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  
                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => handleToggleActive(config)}
                      title={config.is_active ? 'Deactivate' : 'Activate'}
                    >
                      {config.is_active ? (
                        <ToggleRight className="h-4 w-4 text-emerald-600" />
                      ) : (
                        <ToggleLeft className="h-4 w-4 text-slate-400" />
                      )}
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => handleEdit(config)}
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => handleDelete(config.id)}
                      className="text-red-500 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              
              {/* Expanded Mapping Preview */}
              {expandedConfig === config.id && (
                <CardContent className="border-t pt-4">
                  <div className="text-sm text-slate-600 mb-3">Value Mappings:</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {Object.entries(config.mapping || {}).map(([controllingValue, dependentValues]) => (
                      <div key={controllingValue} className="p-3 bg-slate-50 rounded-lg">
                        <div className="font-medium text-slate-700 mb-1">
                          {controllingValue}
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {dependentValues.map(value => (
                            <span 
                              key={value}
                              className="text-xs px-2 py-0.5 bg-white border rounded"
                            >
                              {value}
                            </span>
                          ))}
                          {dependentValues.length === 0 && (
                            <span className="text-xs text-slate-400 italic">No values mapped</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={showAddDialog} onOpenChange={handleCloseDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingConfig ? 'Edit Dependent Picklist' : 'New Dependent Picklist'}
            </DialogTitle>
            <DialogDescription>
              Configure which values appear in the dependent picklist based on the controlling field selection.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Form Error */}
            {formError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            )}

            {/* Step 1: Select Fields */}
            <div className="grid grid-cols-2 gap-6">
              {/* Controlling Field */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">
                  Controlling Field <span className="text-red-500">*</span>
                </Label>
                <Select 
                  value={controllingField} 
                  onValueChange={(v) => {
                    setControllingField(v);
                    setMapping({});
                  }}
                  disabled={!!editingConfig}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select controlling picklist..." />
                  </SelectTrigger>
                  <SelectContent>
                    {controllingFieldOptions.map(field => (
                      <SelectItem key={field.api_name} value={field.api_name}>
                        {field.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-slate-500">
                  The field whose value controls the dependent field options
                </p>
              </div>

              {/* Dependent Field */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">
                  Dependent Field <span className="text-red-500">*</span>
                </Label>
                <Select 
                  value={dependentField} 
                  onValueChange={(v) => {
                    setDependentField(v);
                    setMapping({});
                  }}
                  disabled={!!editingConfig || !controllingField}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select dependent picklist..." />
                  </SelectTrigger>
                  <SelectContent>
                    {dependentFieldOptions.map(field => (
                      <SelectItem key={field.api_name} value={field.api_name}>
                        {field.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-slate-500">
                  The field whose options depend on the controlling field
                </p>
              </div>
            </div>

            {/* Step 2: Mapping Editor */}
            {controllingField && dependentField && (
              <DependentPicklistMappingEditor
                controllingOptions={getControllingOptions()}
                dependentOptions={getDependentOptions()}
                mapping={mapping}
                onMappingChange={setMapping}
                controllingFieldLabel={getFieldByApi(controllingField)?.label || controllingField}
                dependentFieldLabel={getFieldByApi(dependentField)?.label || dependentField}
              />
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleCloseDialog}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingConfig ? 'Update' : 'Save'} Configuration
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DependentPicklistsConfig;
