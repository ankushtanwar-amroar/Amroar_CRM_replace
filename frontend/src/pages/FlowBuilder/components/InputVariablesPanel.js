import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, Settings } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';

const InputVariablesPanel = ({ isOpen, onClose, inputVariables, onSave, flowType, savedFlowType, launchMode }) => {
  const [variables, setVariables] = useState(inputVariables || []);

  // Get system variables based on launch mode
  const getSystemVariables = () => {
    if (flowType !== 'screen-flow' || savedFlowType !== 'screen') return [];
    
    if (launchMode === 'record_detail') {
      return [{
        name: 'recordId',
        label: 'Record ID',
        dataType: 'String',
        required: false,
        defaultValue: '',
        description: 'System variable - Automatically populated with current record ID',
        isSystem: true
      }];
    } else if (launchMode === 'list_view') {
      return [
        {
          name: 'recordIds',
          label: 'Record IDs',
          dataType: 'String',
          required: false,
          defaultValue: '',
          description: 'System variable - Collection of selected record IDs',
          isSystem: true,
          isCollection: true
        },
        {
          name: 'selectedCount',
          label: 'Selected Count',
          dataType: 'Number',
          required: false,
          defaultValue: 0,
          description: 'System variable - Number of selected records',
          isSystem: true
        }
      ];
    }
    return [];
  };

  const systemVariables = getSystemVariables();

  // Sync local state when inputVariables prop changes
  useEffect(() => {
    console.log('🔄 InputVariablesPanel - Syncing state. Input prop:', inputVariables);
    console.log('🔄 InputVariablesPanel - isOpen:', isOpen);
    setVariables(inputVariables || []);
    console.log('✅ InputVariablesPanel - Local state synced, variables count:', (inputVariables || []).length);
  }, [inputVariables, isOpen]); // Re-sync when panel opens or inputVariables change

  const addVariable = () => {
    const systemVarNames = systemVariables.map(v => v.name);
    let newName = `variable_${variables.length + 1}`;
    
    // Ensure new variable name doesn't conflict with system variables
    if (systemVarNames.includes(newName)) {
      newName = `user_variable_${variables.length + 1}`;
    }
    
    setVariables([
      ...variables,
      {
        name: newName,
        label: 'New Variable',
        dataType: 'String',
        required: false,
        defaultValue: '',
        description: '',
        isSystem: false
      }
    ]);
  };

  const removeVariable = (index) => {
    // Prevent removing system variables
    const variable = variables[index];
    if (variable?.isSystem) {
      alert('System variables cannot be removed');
      return;
    }
    setVariables(variables.filter((_, i) => i !== index));
  };

  const updateVariable = (index, field, value) => {
    const variable = variables[index];
    
    // Prevent editing system variables
    if (variable?.isSystem && (field === 'name' || field === 'dataType')) {
      alert('System variables cannot be modified');
      return;
    }
    
    // Prevent duplicate names with system variables
    if (field === 'name') {
      const systemVarNames = systemVariables.map(v => v.name);
      if (systemVarNames.includes(value)) {
        alert(`Cannot use reserved system variable name: ${value}`);
        return;
      }
    }
    
    const updated = [...variables];
    updated[index] = { ...updated[index], [field]: value };
    setVariables(updated);
  };

  const handleSave = () => {
    console.log('💾 InputVariablesPanel - Saving variables:', variables);
    onSave(variables);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b sticky top-0 bg-white z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
              <Settings className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Input Variables</h2>
              <p className="text-sm text-gray-500 mt-0.5">Configure variables for manual run</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* System Variables Section - Screen Flows Only */}
          {systemVariables.length > 0 && (
            <div className="mb-6">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
                <p className="text-sm font-semibold text-amber-900 mb-1">🔒 System Variables (Read-only)</p>
                <p className="text-xs text-amber-700">
                  {launchMode === 'record_detail' && 'recordId is automatically populated when flow is launched from a record page.'}
                  {launchMode === 'list_view' && 'recordIds and selectedCount are automatically populated when flow is launched from a list view.'}
                </p>
              </div>
              
              {systemVariables.map((sysVar, index) => (
                <div key={`system-${index}`} className="p-4 border border-blue-300 rounded-lg bg-blue-50">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Variable Name</label>
                      <div className="flex items-center gap-2">
                        <Input
                          value={sysVar.name}
                          disabled
                          className="bg-blue-100 cursor-not-allowed opacity-75"
                        />
                        <span className="text-xs bg-blue-600 text-white px-2 py-1 rounded font-medium whitespace-nowrap">
                          SYSTEM
                        </span>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Label</label>
                      <Input value={sysVar.label} disabled className="bg-blue-100 cursor-not-allowed opacity-75" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Data Type</label>
                      <Input
                        value={sysVar.isCollection ? `${sysVar.dataType} Collection` : sysVar.dataType}
                        disabled
                        className="bg-blue-100 cursor-not-allowed opacity-75"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Default Value</label>
                      <Input value={sysVar.defaultValue} disabled className="bg-blue-100 cursor-not-allowed opacity-75" />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
                      <Input value={sysVar.description} disabled className="bg-blue-100 cursor-not-allowed opacity-75" />
                    </div>
                  </div>
                </div>
              ))}
              
              <div className="border-t border-slate-200 my-6"></div>
              <p className="text-sm font-medium text-slate-700 mb-2">User-Defined Variables</p>
            </div>
          )}
          
          {variables.length === 0 && systemVariables.length === 0 ? (
            <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
              <Settings className="h-12 w-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-600 mb-4">No input variables defined</p>
              <Button onClick={addVariable} variant="outline" size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Add First Variable
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {variables.map((variable, index) => (
                <div key={index} className="border border-gray-300 rounded-lg p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <h4 className="text-sm font-semibold text-gray-900">Variable {index + 1}</h4>
                    <button
                      onClick={() => removeVariable(index)}
                      className="text-red-500 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Name</label>
                      <Input
                        value={variable.name}
                        onChange={(e) => updateVariable(index, 'name', e.target.value)}
                        placeholder="variable_name"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Label</label>
                      <Input
                        value={variable.label}
                        onChange={(e) => updateVariable(index, 'label', e.target.value)}
                        placeholder="Display Label"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Data Type</label>
                      <select
                        value={variable.dataType}
                        onChange={(e) => updateVariable(index, 'dataType', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      >
                        <option value="String">String</option>
                        <option value="Number">Number</option>
                        <option value="Boolean">Boolean</option>
                        <option value="Date">Date</option>
                        <option value="DateTime">DateTime</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Default Value</label>
                      <Input
                        value={variable.defaultValue}
                        onChange={(e) => updateVariable(index, 'defaultValue', e.target.value)}
                        placeholder="Optional"
                      />
                    </div>
                    <div className="flex items-end">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={variable.required}
                          onChange={(e) => updateVariable(index, 'required', e.target.checked)}
                          className="w-4 h-4 text-indigo-600"
                        />
                        <span className="text-sm text-gray-700">Required</span>
                      </label>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
                    <Input
                      value={variable.description}
                      onChange={(e) => updateVariable(index, 'description', e.target.value)}
                      placeholder="Optional description"
                    />
                  </div>
                </div>
              ))}

              <Button onClick={addVariable} variant="outline" className="w-full">
                <Plus className="h-4 w-4 mr-2" />
                Add Variable
              </Button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t bg-gray-50 sticky bottom-0">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} className="bg-indigo-600 hover:bg-indigo-700 text-white">
            Save Variables
          </Button>
        </div>
      </div>
    </div>
  );
};

export default InputVariablesPanel;
