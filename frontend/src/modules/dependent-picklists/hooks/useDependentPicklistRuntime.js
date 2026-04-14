/**
 * useDependentPicklistRuntime Hook
 * Hook for runtime dependent picklist filtering in forms
 * Updated: Dependencies are now GLOBAL (object-level), not per record type
 * 
 * Usage:
 * const {
 *   getFilteredOptions,
 *   isDependentField,
 *   getControllingField,
 *   handleControllingChange
 * } = useDependentPicklistRuntime(objectName);
 */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import dependentPicklistService from '../services/dependentPicklistService';

export const useDependentPicklistRuntime = (objectName, recordTypeId = null, formData = {}) => {
  // Note: recordTypeId is kept for backward compatibility but is now ignored
  const [dependencies, setDependencies] = useState({});
  const [filteredOptions, setFilteredOptions] = useState({});
  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const previousFormDataRef = useRef({});

  // Load all dependencies for this object (GLOBAL)
  const loadDependencies = useCallback(async () => {
    if (!objectName) {
      setDependencies({});
      setInitialized(true);
      return;
    }

    setLoading(true);
    try {
      // Fetch GLOBAL dependencies for the object (not per record type)
      const data = await dependentPicklistService.getRuntimeDependencies(objectName);
      // Backend returns dependencies directly (keyed by dependent field), not wrapped in "dependencies"
      setDependencies(data || {});
      setInitialized(true);
    } catch (err) {
      console.error('Failed to load dependent picklist runtime config:', err);
      setDependencies({});
      setInitialized(true);
    } finally {
      setLoading(false);
    }
  }, [objectName]);

  // Load on mount and when object changes
  useEffect(() => {
    loadDependencies();
  }, [loadDependencies]);

  // Check if a field is a dependent field
  const isDependentField = useCallback((fieldApiName) => {
    return fieldApiName in dependencies;
  }, [dependencies]);

  // Get the controlling field for a dependent field
  const getControllingField = useCallback((dependentFieldApi) => {
    const dep = dependencies[dependentFieldApi];
    return dep ? dep.controlling_field_api : null;
  }, [dependencies]);

  // Get all dependent fields for a controlling field
  const getDependentFields = useCallback((controllingFieldApi) => {
    return Object.entries(dependencies)
      .filter(([_, dep]) => dep.controlling_field_api === controllingFieldApi)
      .map(([fieldApi]) => fieldApi);
  }, [dependencies]);

  // Get filtered options for a dependent field based on current controlling value
  const getFilteredOptions = useCallback((dependentFieldApi, allOptions = []) => {
    const dep = dependencies[dependentFieldApi];
    if (!dep) {
      return allOptions; // Not a dependent field, return all options
    }

    const controllingValue = formData[dep.controlling_field_api];
    
    if (!controllingValue) {
      // No controlling value selected - return empty or message
      return [];
    }

    const allowedValues = dep.mapping[controllingValue] || [];
    
    if (allowedValues.length === 0) {
      // No mapping for this controlling value - return all options
      return allOptions;
    }

    // Filter options to only allowed values
    return allOptions.filter(opt => {
      const value = typeof opt === 'string' ? opt : (opt.value || opt);
      return allowedValues.includes(value);
    });
  }, [dependencies, formData]);

  // Check if current dependent value is valid
  const isValueValid = useCallback((dependentFieldApi, dependentValue) => {
    const dep = dependencies[dependentFieldApi];
    if (!dep) return true; // Not dependent, always valid

    const controllingValue = formData[dep.controlling_field_api];
    if (!controllingValue) return false; // No controlling value

    const allowedValues = dep.mapping[controllingValue] || [];
    if (allowedValues.length === 0) return true; // No mapping = all allowed

    return allowedValues.includes(dependentValue);
  }, [dependencies, formData]);

  // Get validation message for a dependent field
  const getValidationMessage = useCallback((dependentFieldApi) => {
    const dep = dependencies[dependentFieldApi];
    if (!dep) return null;

    const controllingValue = formData[dep.controlling_field_api];
    if (!controllingValue) {
      return `Please select a value for the controlling field first`;
    }

    return null;
  }, [dependencies, formData]);

  // Process form data changes to update filtered options
  useEffect(() => {
    if (!initialized || Object.keys(dependencies).length === 0) return;

    // Check which controlling fields changed
    const changedControllingFields = new Set();
    
    for (const [dependentField, dep] of Object.entries(dependencies)) {
      const controllingField = dep.controlling_field_api;
      const prevValue = previousFormDataRef.current[controllingField];
      const currentValue = formData[controllingField];
      
      if (prevValue !== currentValue) {
        changedControllingFields.add(controllingField);
      }
    }

    // Update filtered options for affected dependent fields
    if (changedControllingFields.size > 0) {
      const newFilteredOptions = { ...filteredOptions };
      
      for (const [dependentField, dep] of Object.entries(dependencies)) {
        if (changedControllingFields.has(dep.controlling_field_api)) {
          const controllingValue = formData[dep.controlling_field_api];
          newFilteredOptions[dependentField] = controllingValue 
            ? (dep.mapping[controllingValue] || [])
            : [];
        }
      }
      
      setFilteredOptions(newFilteredOptions);
    }

    previousFormDataRef.current = { ...formData };
  }, [formData, dependencies, initialized, filteredOptions]);

  // Get fields that need to be reset when controlling field changes (CASCADING SUPPORT)
  // This recursively finds all fields in the dependency chain that need reset
  const getFieldsToReset = useCallback((controllingFieldApi, newControllingValue) => {
    const fieldsToReset = [];
    const visited = new Set(); // Prevent infinite loops in circular dependencies
    
    const findFieldsToReset = (controllerField, controllerNewValue) => {
      if (visited.has(controllerField)) return;
      visited.add(controllerField);
      
      for (const [dependentField, dep] of Object.entries(dependencies)) {
        if (dep.controlling_field_api === controllerField) {
          const currentValue = formData[dependentField];
          
          // Check if this dependent field's value needs to be reset
          if (currentValue) {
            const allowedValues = dep.mapping[controllerNewValue] || [];
            // If current value not in new allowed values, needs reset
            if (allowedValues.length > 0 && !allowedValues.includes(currentValue)) {
              if (!fieldsToReset.includes(dependentField)) {
                fieldsToReset.push(dependentField);
              }
              // CASCADING: This dependent field is being reset, so any fields depending on IT also need reset
              findFieldsToReset(dependentField, ''); // Empty value means all dependents reset
            }
          } else {
            // Even if no current value, if this field controls others and we're cascading, check children
            // When a controlling value is cleared, cascade the reset
            if (controllerNewValue === '' || controllerNewValue === null || controllerNewValue === undefined) {
              findFieldsToReset(dependentField, '');
            }
          }
        }
      }
    };
    
    findFieldsToReset(controllingFieldApi, newControllingValue);
    return fieldsToReset;
  }, [dependencies, formData]);

  // Get the full dependency chain for a field (useful for cascading UI)
  const getDependencyChain = useCallback((fieldApiName) => {
    const chain = [];
    let currentField = fieldApiName;
    const visited = new Set();
    
    while (currentField && !visited.has(currentField)) {
      visited.add(currentField);
      const dep = dependencies[currentField];
      if (dep) {
        chain.unshift(dep.controlling_field_api);
        currentField = dep.controlling_field_api;
      } else {
        break;
      }
    }
    
    return chain;
  }, [dependencies]);

  // Check if all controlling fields in the chain have values
  const isChainSatisfied = useCallback((dependentFieldApi) => {
    const chain = getDependencyChain(dependentFieldApi);
    
    for (const field of chain) {
      if (!formData[field]) {
        return false;
      }
    }
    
    // Also check direct controlling field
    const dep = dependencies[dependentFieldApi];
    if (dep && !formData[dep.controlling_field_api]) {
      return false;
    }
    
    return true;
  }, [dependencies, formData, getDependencyChain]);

  // Get the first missing field in the dependency chain
  const getFirstMissingInChain = useCallback((dependentFieldApi) => {
    const chain = getDependencyChain(dependentFieldApi);
    
    for (const field of chain) {
      if (!formData[field]) {
        return field;
      }
    }
    
    // Check direct controlling field
    const dep = dependencies[dependentFieldApi];
    if (dep && !formData[dep.controlling_field_api]) {
      return dep.controlling_field_api;
    }
    
    return null;
  }, [dependencies, formData, getDependencyChain]);

  // Computed: Map of dependent field -> controlling field
  const dependencyMap = useMemo(() => {
    const map = {};
    for (const [dependentField, dep] of Object.entries(dependencies)) {
      map[dependentField] = dep.controlling_field_api;
    }
    return map;
  }, [dependencies]);

  // Computed: Map of controlling field -> dependent fields
  const controllerMap = useMemo(() => {
    const map = {};
    for (const [dependentField, dep] of Object.entries(dependencies)) {
      if (!map[dep.controlling_field_api]) {
        map[dep.controlling_field_api] = [];
      }
      map[dep.controlling_field_api].push(dependentField);
    }
    return map;
  }, [dependencies]);

  // Check if a field is a controlling field
  const isControllingField = useCallback((fieldApiName) => {
    return fieldApiName in controllerMap;
  }, [controllerMap]);

  return {
    // State
    dependencies,
    loading,
    initialized,
    filteredOptions,
    
    // Maps
    dependencyMap,
    controllerMap,
    
    // Field checks
    isDependentField,
    isControllingField,
    getControllingField,
    getDependentFields,
    
    // Options & validation
    getFilteredOptions,
    isValueValid,
    getValidationMessage,
    getFieldsToReset,
    
    // Cascading support
    getDependencyChain,
    isChainSatisfied,
    getFirstMissingInChain,
    
    // Actions
    reload: loadDependencies
  };
};

export default useDependentPicklistRuntime;
