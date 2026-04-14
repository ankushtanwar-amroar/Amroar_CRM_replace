/**
 * useVisibilityEvaluation - React hook for component visibility
 * Handles debounced re-evaluation when data changes
 */
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { evaluateComponentVisibility, isComponentVisible } from '../engine/VisibilityRulesEngine';
import { getUserContext } from '../services/userContextService';
import { migrateVisibilityConfig, createVisibilityDebouncer } from '../utils/visibilityUtils';

/**
 * Hook for evaluating visibility of a single component
 */
export const useComponentVisibility = (
  visibilityConfig,
  recordData,
  options = {}
) => {
  const {
    debounceMs = 200,
    userContext: providedUserContext = null,
    uiContext = null,
  } = options;
  
  const [result, setResult] = useState({ visible: false, pending: true, reason: '' });
  const debouncerRef = useRef(null);
  
  // Get user context
  const userContext = useMemo(() => {
    return providedUserContext || getUserContext();
  }, [providedUserContext]);
  
  // Create debouncer on mount
  useEffect(() => {
    debouncerRef.current = createVisibilityDebouncer(debounceMs);
    return () => {
      debouncerRef.current = null;
    };
  }, [debounceMs]);
  
  // Evaluate visibility when dependencies change
  useEffect(() => {
    const evaluate = () => {
      const evalResult = evaluateComponentVisibility(
        visibilityConfig,
        recordData,
        userContext,
        uiContext
      );
      setResult(evalResult);
    };
    
    // Use debouncer if available
    if (debouncerRef.current) {
      debouncerRef.current(evaluate);
    } else {
      evaluate();
    }
  }, [visibilityConfig, recordData, userContext, uiContext]);
  
  return result;
};

/**
 * Hook for evaluating visibility of multiple components
 * Returns filtered array of visible components
 */
export const useComponentsVisibility = (
  components,
  recordData,
  options = {}
) => {
  const {
    debounceMs = 200,
    userContext: providedUserContext = null,
    uiContext = null,
  } = options;
  
  const [visibleComponents, setVisibleComponents] = useState([]);
  const [isEvaluating, setIsEvaluating] = useState(true);
  const debouncerRef = useRef(null);
  
  // Get user context
  const userContext = useMemo(() => {
    return providedUserContext || getUserContext();
  }, [providedUserContext]);
  
  // Create debouncer on mount
  useEffect(() => {
    debouncerRef.current = createVisibilityDebouncer(debounceMs);
    return () => {
      debouncerRef.current = null;
    };
  }, [debounceMs]);
  
  // Evaluate all components
  useEffect(() => {
    if (!components || components.length === 0) {
      setVisibleComponents([]);
      setIsEvaluating(false);
      return;
    }
    
    const evaluate = () => {
      setIsEvaluating(true);
      
      const visible = components.filter(component => {
        // Migrate old visibility format if needed
        const visibility = component.visibility || migrateVisibilityConfig(component);
        
        const result = evaluateComponentVisibility(
          visibility,
          recordData,
          userContext,
          uiContext
        );
        
        return result.visible;
      });
      
      setVisibleComponents(visible);
      setIsEvaluating(false);
    };
    
    // Use debouncer if available
    if (debouncerRef.current) {
      debouncerRef.current(evaluate);
    } else {
      evaluate();
    }
  }, [components, recordData, userContext, uiContext]);
  
  return { visibleComponents, isEvaluating };
};

/**
 * Hook for real-time form field visibility
 * Re-evaluates on every form value change with debounce
 */
export const useFormFieldVisibility = (
  fields,
  formValues,
  options = {}
) => {
  const {
    debounceMs = 150,
    userContext: providedUserContext = null,
  } = options;
  
  const [visibleFields, setVisibleFields] = useState([]);
  const debouncerRef = useRef(null);
  
  const userContext = useMemo(() => {
    return providedUserContext || getUserContext();
  }, [providedUserContext]);
  
  useEffect(() => {
    debouncerRef.current = createVisibilityDebouncer(debounceMs);
    return () => {
      debouncerRef.current = null;
    };
  }, [debounceMs]);
  
  useEffect(() => {
    if (!fields || fields.length === 0) {
      setVisibleFields([]);
      return;
    }
    
    const evaluate = () => {
      const visible = fields.filter(field => {
        const visibility = field.visibility || field.visibilityRule;
        
        if (!visibility) return true; // No config = always visible
        
        const result = evaluateComponentVisibility(
          visibility,
          formValues,
          userContext,
          null
        );
        
        return result.visible;
      });
      
      setVisibleFields(visible);
    };
    
    if (debouncerRef.current) {
      debouncerRef.current(evaluate);
    } else {
      evaluate();
    }
  }, [fields, formValues, userContext]);
  
  return visibleFields;
};

/**
 * Simple synchronous visibility check
 * Use when you don't need React state management
 */
export const checkVisibility = (visibilityConfig, recordData, userContext = null) => {
  return isComponentVisible(
    visibilityConfig,
    recordData,
    userContext || getUserContext(),
    null
  );
};

export default useComponentVisibility;
