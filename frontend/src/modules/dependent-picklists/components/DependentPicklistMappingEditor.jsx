/**
 * DependentPicklistMappingEditor Component
 * Matrix/grid UI for mapping controlling values to dependent values
 * Similar to Salesforce's dependent picklist value mapping
 */
import React, { useState, useMemo } from 'react';
import { Check, CheckSquare, Square, AlertCircle } from 'lucide-react';
import { Checkbox } from '../../../components/ui/checkbox';
import { Label } from '../../../components/ui/label';
import { Input } from '../../../components/ui/input';
import { Button } from '../../../components/ui/button';

const DependentPicklistMappingEditor = ({
  controllingOptions = [],
  dependentOptions = [],
  mapping = {},
  onMappingChange,
  controllingFieldLabel = 'Controlling Field',
  dependentFieldLabel = 'Dependent Field'
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  
  // Normalize options to array of strings
  const normalizedControllingOptions = useMemo(() => {
    return controllingOptions.map(opt => 
      typeof opt === 'string' ? opt : (opt.value || opt.label || opt)
    );
  }, [controllingOptions]);

  const normalizedDependentOptions = useMemo(() => {
    return dependentOptions.map(opt => 
      typeof opt === 'string' ? opt : (opt.value || opt.label || opt)
    );
  }, [dependentOptions]);

  // Filter dependent options by search
  const filteredDependentOptions = useMemo(() => {
    if (!searchTerm.trim()) return normalizedDependentOptions;
    const term = searchTerm.toLowerCase();
    return normalizedDependentOptions.filter(opt => 
      opt.toLowerCase().includes(term)
    );
  }, [normalizedDependentOptions, searchTerm]);

  // Check if a dependent value is selected for a controlling value
  const isSelected = (controllingValue, dependentValue) => {
    return mapping[controllingValue]?.includes(dependentValue) || false;
  };

  // Toggle a single cell
  const toggleCell = (controllingValue, dependentValue) => {
    const currentValues = mapping[controllingValue] || [];
    let newValues;
    
    if (currentValues.includes(dependentValue)) {
      newValues = currentValues.filter(v => v !== dependentValue);
    } else {
      newValues = [...currentValues, dependentValue];
    }
    
    onMappingChange({
      ...mapping,
      [controllingValue]: newValues
    });
  };

  // Select all dependent values for a controlling value
  const selectAllForControlling = (controllingValue) => {
    onMappingChange({
      ...mapping,
      [controllingValue]: [...normalizedDependentOptions]
    });
  };

  // Clear all for a controlling value
  const clearAllForControlling = (controllingValue) => {
    const newMapping = { ...mapping };
    delete newMapping[controllingValue];
    onMappingChange(newMapping);
  };

  // Select all for a dependent value (across all controlling values)
  const selectAllForDependent = (dependentValue) => {
    const newMapping = { ...mapping };
    normalizedControllingOptions.forEach(cv => {
      if (!newMapping[cv]) newMapping[cv] = [];
      if (!newMapping[cv].includes(dependentValue)) {
        newMapping[cv] = [...newMapping[cv], dependentValue];
      }
    });
    onMappingChange(newMapping);
  };

  // Clear all for a dependent value
  const clearAllForDependent = (dependentValue) => {
    const newMapping = {};
    Object.entries(mapping).forEach(([cv, values]) => {
      newMapping[cv] = values.filter(v => v !== dependentValue);
    });
    onMappingChange(newMapping);
  };

  // Check if all dependent values selected for a controlling value
  const allSelectedForControlling = (controllingValue) => {
    const values = mapping[controllingValue] || [];
    return normalizedDependentOptions.length > 0 && 
           values.length === normalizedDependentOptions.length;
  };

  // Check if all controlling values have a dependent value
  const allSelectedForDependent = (dependentValue) => {
    return normalizedControllingOptions.every(cv => 
      mapping[cv]?.includes(dependentValue)
    );
  };

  // Count selected for display
  const getSelectedCount = (controllingValue) => {
    return mapping[controllingValue]?.length || 0;
  };

  if (normalizedControllingOptions.length === 0) {
    return (
      <div className="p-6 bg-amber-50 border border-amber-200 rounded-lg">
        <div className="flex items-center gap-2 text-amber-700">
          <AlertCircle className="h-5 w-5" />
          <span>The controlling field has no picklist values defined.</span>
        </div>
      </div>
    );
  }

  if (normalizedDependentOptions.length === 0) {
    return (
      <div className="p-6 bg-amber-50 border border-amber-200 rounded-lg">
        <div className="flex items-center gap-2 text-amber-700">
          <AlertCircle className="h-5 w-5" />
          <span>The dependent field has no picklist values defined.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">Value Mapping</Label>
        <div className="flex items-center gap-2">
          <Input
            type="text"
            placeholder="Search dependent values..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-64 h-8 text-sm"
          />
        </div>
      </div>

      {/* Mapping Matrix */}
      <div className="border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b">
                <th className="sticky left-0 bg-slate-50 px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide min-w-[180px] border-r">
                  {controllingFieldLabel}
                </th>
                {filteredDependentOptions.map((depOpt) => (
                  <th 
                    key={depOpt} 
                    className="px-3 py-3 text-center text-xs font-medium text-slate-600 min-w-[120px]"
                  >
                    <div className="flex flex-col items-center gap-1">
                      <span className="truncate max-w-[100px]" title={depOpt}>{depOpt}</span>
                      <button
                        onClick={() => 
                          allSelectedForDependent(depOpt) 
                            ? clearAllForDependent(depOpt) 
                            : selectAllForDependent(depOpt)
                        }
                        className="text-[10px] text-blue-600 hover:underline"
                      >
                        {allSelectedForDependent(depOpt) ? 'Clear All' : 'Select All'}
                      </button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {normalizedControllingOptions.map((ctrlOpt, idx) => (
                <tr 
                  key={ctrlOpt} 
                  className={`border-b hover:bg-slate-50 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-25'}`}
                >
                  <td className="sticky left-0 bg-inherit px-4 py-2 border-r">
                    <div className="flex items-center justify-between">
                      <div className="flex flex-col">
                        <span className="font-medium text-sm text-slate-800">{ctrlOpt}</span>
                        <span className="text-xs text-slate-400">
                          {getSelectedCount(ctrlOpt)} selected
                        </span>
                      </div>
                      <div className="flex gap-1">
                        <button
                          onClick={() => selectAllForControlling(ctrlOpt)}
                          className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                          title="Select All"
                        >
                          <CheckSquare className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => clearAllForControlling(ctrlOpt)}
                          className="p-1 text-slate-400 hover:bg-slate-100 rounded"
                          title="Clear All"
                        >
                          <Square className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </td>
                  {filteredDependentOptions.map((depOpt) => (
                    <td 
                      key={depOpt} 
                      className="px-3 py-2 text-center"
                    >
                      <Checkbox
                        checked={isSelected(ctrlOpt, depOpt)}
                        onCheckedChange={() => toggleCell(ctrlOpt, depOpt)}
                        className="mx-auto"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Summary */}
      <div className="text-xs text-slate-500">
        <span className="font-medium">{normalizedControllingOptions.length}</span> controlling values × 
        <span className="font-medium ml-1">{normalizedDependentOptions.length}</span> dependent values
        {searchTerm && ` (showing ${filteredDependentOptions.length} filtered)`}
      </div>

      {/* Instructions */}
      <div className="p-3 bg-blue-50 rounded-lg text-xs text-blue-700">
        <p className="font-medium mb-1">How it works:</p>
        <ul className="list-disc list-inside space-y-0.5">
          <li>Check the boxes to indicate which dependent values are allowed for each controlling value</li>
          <li>When a user selects a controlling value, only the checked dependent values will appear</li>
          <li>Unchecked values will be hidden from the dependent picklist</li>
        </ul>
      </div>
    </div>
  );
};

export default DependentPicklistMappingEditor;
