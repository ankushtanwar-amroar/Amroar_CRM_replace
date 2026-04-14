/**
 * useFieldBehaviorRuntime Hook
 * Runtime hook for evaluating and enforcing field behavior rules
 * on record create/edit/view pages
 */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import fieldBehaviorService from '../services/fieldBehaviorService';
import {
  evaluateAllFieldBehaviors,
  extractParentReferences,
  hasFieldBehaviorRules,
  RULE_MODES
} from '../engine/FieldBehaviorRulesEngine';

/**
 * Hook for runtime field behavior rule evaluation
 * @param {Object} params
 * @param {string} params.objectName - Object name (e.g., 'lead', 'account')
 * @param {Object} params.recordData - Current record field values (reactive)
 * @param {Array} params.fieldConfigs - Field configurations from layout (items array from Record Detail)
 * @param {string} params.pageType - Page type: 'new', 'edit', or 'view'
 * @param {string} params.recordId - Record ID (for edit/view pages, null for new)
 */
export const useFieldBehaviorRuntime = ({
  objectName,
  recordData = {},
  fieldConfigs = [],
  pageType = 'edit',
  recordId = null
}) => {
  const [fieldStates, setFieldStates] = useState({});
  const [parentData, setParentData] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const evaluationTimeoutRef = useRef(null);
  const previousRecordDataRef = useRef(null);
  
  // Only process fields that have behavior rules defined
  const fieldsWithRules = useMemo(() => {
    return fieldConfigs.filter(config => {
      const hasVisRule = config.visibilityRule?.mode === RULE_MODES.CONDITIONAL;
      const hasReqRule = config.requiredRule?.mode === RULE_MODES.ALWAYS || 
                         config.requiredRule?.mode === RULE_MODES.CONDITIONAL;
      const hasRoRule = config.readonlyRule?.mode === RULE_MODES.ALWAYS || 
                        config.readonlyRule?.mode === RULE_MODES.CONDITIONAL;
      return hasVisRule || hasReqRule || hasRoRule;
    });
  }, [fieldConfigs]);
  
  // Check if any rules need evaluation
  const hasRules = useMemo(() => {
    return hasFieldBehaviorRules(fieldConfigs);
  }, [fieldConfigs]);
  
  // Get fields that need formula evaluation (server-side)
  const formulaRuleFields = useMemo(() => {
    return fieldsWithRules.filter(config =>
      config.visibilityRule?.type === 'formula' ||
      config.requiredRule?.type === 'formula' ||
      config.readonlyRule?.type === 'formula'
    );
  }, [fieldsWithRules]);
  
  // Get parent references needed for rule evaluation
  const parentReferences = useMemo(() => {
    return extractParentReferences(fieldsWithRules);
  }, [fieldsWithRules]);
  
  // Load parent data on mount if needed
  useEffect(() => {
    const loadParentData = async () => {
      if (parentReferences.length === 0 || !recordId || pageType === 'new') {
        return;
      }
      
      try {
        const data = await fieldBehaviorService.resolveParentLookups(
          objectName,
          recordId,
          parentReferences
        );
        setParentData(data);
      } catch (err) {
        console.error('Failed to load parent data for field rules:', err);
        // Continue without parent data - rules will evaluate with what we have
      }
    };
    
    loadParentData();
  }, [objectName, recordId, parentReferences, pageType]);
  
  // Merge record data with parent data for evaluation
  const mergedData = useMemo(() => {
    return { ...recordData, ...parentData };
  }, [recordData, parentData]);
  
  // Main evaluation function
  const evaluateRules = useCallback(async () => {
    if (!hasRules) {
      // No rules to evaluate, set all fields to default state
      const defaultStates = {};
      for (const config of fieldConfigs) {
        const fieldKey = config.key || config.fieldApiName;
        if (fieldKey) {
          defaultStates[fieldKey] = {
            isVisible: true,
            isRequired: false,
            isReadonly: pageType === 'view',
            needsServerEval: false,
            evaluationErrors: null
          };
        }
      }
      setFieldStates(defaultStates);
      return;
    }
    
    // First pass: evaluate basic rules locally
    const localResults = evaluateAllFieldBehaviors(fieldsWithRules, recordData, parentData, pageType);
    
    // Check if any fields need server evaluation
    const needsServerEval = formulaRuleFields.length > 0 && 
      Object.values(localResults).some(r => r.needsServerEval);
    
    // Set initial local results
    setFieldStates(prev => {
      const newStates = { ...prev };
      for (const [fieldKey, result] of Object.entries(localResults)) {
        newStates[fieldKey] = result;
      }
      return newStates;
    });
    
    // If server evaluation needed, call the API
    if (needsServerEval) {
      setIsLoading(true);
      try {
        const serverResults = await fieldBehaviorService.evaluateRules({
          objectName,
          recordData: mergedData,
          fieldRules: formulaRuleFields.map(config => ({
            fieldApiName: config.key || config.fieldApiName,
            visibilityRule: config.visibilityRule,
            requiredRule: config.requiredRule,
            readonlyRule: config.readonlyRule
          })),
          pageType
        });
        
        // Merge server results
        setFieldStates(prev => {
          const newStates = { ...prev };
          for (const result of serverResults) {
            newStates[result.fieldApiName] = {
              isVisible: result.isVisible,
              isRequired: result.isRequired && result.isVisible, // Hidden fields can't be required
              isReadonly: result.isReadonly,
              needsServerEval: false,
              evaluationErrors: result.evaluationErrors
            };
          }
          return newStates;
        });
      } catch (err) {
        console.error('Failed to evaluate formula rules on server:', err);
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    }
  }, [hasRules, fieldConfigs, fieldsWithRules, formulaRuleFields, recordData, parentData, mergedData, objectName, pageType]);
  
  // Debounced evaluation when record data changes
  useEffect(() => {
    // Skip if record data hasn't actually changed
    if (JSON.stringify(previousRecordDataRef.current) === JSON.stringify(recordData)) {
      return;
    }
    previousRecordDataRef.current = recordData;
    
    if (evaluationTimeoutRef.current) {
      clearTimeout(evaluationTimeoutRef.current);
    }
    
    evaluationTimeoutRef.current = setTimeout(() => {
      evaluateRules();
    }, 150); // 150ms debounce
    
    return () => {
      if (evaluationTimeoutRef.current) {
        clearTimeout(evaluationTimeoutRef.current);
      }
    };
  }, [recordData, evaluateRules]);
  
  // Initial evaluation on mount and when parent data loads
  useEffect(() => {
    evaluateRules();
  }, [parentData, evaluateRules]);
  
  /**
   * Get the behavior state for a specific field
   * @param {string} fieldApiName - Field API name
   * @returns {Object} Field state with isVisible, isRequired, isReadonly
   */
  const getFieldState = useCallback((fieldApiName) => {
    // Find field config to check if it has rules defined
    const fieldConfig = fieldConfigs.find(c => 
      (c.key || c.fieldApiName) === fieldApiName
    );
    
    // Return stored state or default
    const state = fieldStates[fieldApiName];
    if (state) return state;
    
    // Default state based on page type
    return {
      isVisible: true,
      isRequired: false,
      isReadonly: pageType === 'view',
      needsServerEval: false,
      evaluationErrors: null
    };
  }, [fieldStates, fieldConfigs, pageType]);
  
  /**
   * Check if a field is visible
   */
  const isFieldVisible = useCallback((fieldApiName) => {
    return getFieldState(fieldApiName).isVisible;
  }, [getFieldState]);
  
  /**
   * Check if a field is required
   */
  const isFieldRequired = useCallback((fieldApiName) => {
    return getFieldState(fieldApiName).isRequired;
  }, [getFieldState]);
  
  /**
   * Check if a field is readonly
   */
  const isFieldReadonly = useCallback((fieldApiName) => {
    return getFieldState(fieldApiName).isReadonly;
  }, [getFieldState]);
  
  /**
   * Validate all required fields before save
   * @returns {Array} List of field names that are required but empty
   */
  const validateRequiredFields = useCallback(() => {
    const errors = [];
    
    for (const [fieldApiName, state] of Object.entries(fieldStates)) {
      if (state.isVisible && state.isRequired) {
        const value = recordData[fieldApiName];
        if (value === null || value === undefined || value === '' ||
            (Array.isArray(value) && value.length === 0)) {
          // Find label for better error message
          const config = fieldConfigs.find(c => (c.key || c.fieldApiName) === fieldApiName);
          errors.push({
            fieldApiName,
            label: config?.label || fieldApiName,
            message: `${config?.label || fieldApiName} is required`
          });
        }
      }
    }
    
    return errors;
  }, [fieldStates, recordData, fieldConfigs]);
  
  /**
   * Get all visible required fields (useful for form validation setup)
   */
  const getRequiredFields = useCallback(() => {
    return Object.entries(fieldStates)
      .filter(([_, state]) => state.isVisible && state.isRequired)
      .map(([fieldApiName]) => fieldApiName);
  }, [fieldStates]);
  
  /**
   * Force re-evaluation of rules
   */
  const refreshRules = useCallback(() => {
    previousRecordDataRef.current = null; // Reset to force re-evaluation
    evaluateRules();
  }, [evaluateRules]);
  
  return {
    // State
    fieldStates,
    isLoading,
    error,
    hasRules,
    
    // Field state getters
    getFieldState,
    isFieldVisible,
    isFieldRequired,
    isFieldReadonly,
    
    // Validation
    validateRequiredFields,
    getRequiredFields,
    
    // Actions
    refreshRules
  };
};

export default useFieldBehaviorRuntime;
