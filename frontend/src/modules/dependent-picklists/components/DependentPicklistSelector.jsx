/**
 * DependentPicklistSelector Component
 * Runtime picklist component that respects dependent picklist configuration
 * Use this instead of regular Select when field may have dependencies
 */
import React, { useMemo } from 'react';
import { AlertCircle } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select';

const DependentPicklistSelector = ({
  fieldApiName,
  label,
  value,
  onChange,
  allOptions = [],
  filteredOptions = null, // If provided, use these instead of allOptions
  placeholder = 'Select...',
  disabled = false,
  required = false,
  error = null,
  dependencyInfo = null, // { controllingField, controllingValue, hasDependency }
  className = ''
}) => {
  // Determine which options to show
  const displayOptions = useMemo(() => {
    // If filtered options provided, use them
    if (filteredOptions !== null) {
      return filteredOptions;
    }
    
    // Otherwise show all options
    return allOptions;
  }, [filteredOptions, allOptions]);

  // Normalize options to consistent format
  const normalizedOptions = useMemo(() => {
    return displayOptions.map(opt => {
      if (typeof opt === 'string') {
        return { value: opt, label: opt };
      }
      return {
        value: opt.value || opt,
        label: opt.label || opt.value || opt
      };
    });
  }, [displayOptions]);

  // Check if current value is valid
  const isValueInvalid = useMemo(() => {
    if (!value) return false;
    return filteredOptions !== null && 
           filteredOptions.length > 0 && 
           !filteredOptions.some(opt => 
             (typeof opt === 'string' ? opt : opt.value) === value
           );
  }, [value, filteredOptions]);

  // Message when dependent but no controlling value
  const showControllingPrompt = dependencyInfo?.hasDependency && 
    !dependencyInfo?.controllingValue;

  return (
    <div className={`space-y-1 ${className}`}>
      {label && (
        <label className="text-sm font-medium text-slate-700">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      
      <Select
        value={value || ''}
        onValueChange={onChange}
        disabled={disabled || showControllingPrompt}
      >
        <SelectTrigger className={`w-full ${isValueInvalid ? 'border-amber-400' : ''} ${error ? 'border-red-500' : ''}`}>
          <SelectValue placeholder={
            showControllingPrompt 
              ? `Select ${dependencyInfo.controllingField} first`
              : placeholder
          } />
        </SelectTrigger>
        <SelectContent>
          {normalizedOptions.length === 0 ? (
            <div className="px-2 py-3 text-sm text-slate-500 text-center">
              {showControllingPrompt 
                ? 'Please select a controlling value first'
                : 'No options available'}
            </div>
          ) : (
            normalizedOptions.map(opt => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>

      {/* Invalid value warning */}
      {isValueInvalid && (
        <div className="flex items-center gap-1 text-amber-600 text-xs">
          <AlertCircle className="h-3 w-3" />
          <span>Current value is not valid for selected {dependencyInfo?.controllingField || 'controlling field'}</span>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="text-red-500 text-xs">{error}</div>
      )}
    </div>
  );
};

export default DependentPicklistSelector;
