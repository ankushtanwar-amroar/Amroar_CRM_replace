/**
 * Actions Hooks
 * React hooks for managing and using actions
 */
import { useState, useEffect, useCallback } from 'react';
import { actionService } from '../services/actionService';

/**
 * Hook for managing actions in admin UI (Object Manager)
 */
export const useActions = (objectApiName) => {
  const [actions, setActions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchActions = useCallback(async () => {
    if (!objectApiName) return;
    
    try {
      setLoading(true);
      setError(null);
      const data = await actionService.getActions(objectApiName);
      setActions(data);
    } catch (err) {
      console.error('Error fetching actions:', err);
      setError(err.response?.data?.detail || 'Failed to load actions');
    } finally {
      setLoading(false);
    }
  }, [objectApiName]);

  useEffect(() => {
    fetchActions();
  }, [fetchActions]);

  const createAction = async (actionData) => {
    const newAction = await actionService.createAction({
      ...actionData,
      object_api_name: objectApiName
    });
    setActions(prev => [...prev, newAction]);
    return newAction;
  };

  const updateAction = async (actionId, updateData) => {
    const updated = await actionService.updateAction(actionId, updateData);
    setActions(prev => prev.map(a => a.id === actionId ? updated : a));
    return updated;
  };

  const deleteAction = async (actionId) => {
    await actionService.deleteAction(actionId);
    setActions(prev => prev.filter(a => a.id !== actionId));
  };

  const cloneAction = async (actionId) => {
    const cloned = await actionService.cloneAction(actionId);
    setActions(prev => [...prev, cloned]);
    return cloned;
  };

  const toggleActive = async (actionId) => {
    const updated = await actionService.toggleActive(actionId);
    setActions(prev => prev.map(a => a.id === actionId ? updated : a));
    return updated;
  };

  return {
    actions,
    loading,
    error,
    refetch: fetchActions,
    createAction,
    updateAction,
    deleteAction,
    cloneAction,
    toggleActive
  };
};

/**
 * Hook for getting runtime actions on record pages
 */
export const useRuntimeActions = (objectApiName, placement = 'RECORD_HEADER') => {
  const [actions, setActions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [executing, setExecuting] = useState(null); // Currently executing action ID

  const fetchActions = useCallback(async () => {
    if (!objectApiName) {
      console.log('[ActionButtons] No objectApiName provided, skipping fetch');
      setActions([]);
      setLoading(false);
      return;
    }
    
    // Normalize object name to lowercase for consistency
    const normalizedObjectName = objectApiName.toLowerCase();
    
    try {
      setLoading(true);
      setError(null);
      console.log(`[ActionButtons] Fetching runtime actions for object: ${normalizedObjectName}, placement: ${placement}`);
      const data = await actionService.getRuntimeActions(normalizedObjectName, placement);
      console.log(`[ActionButtons] Received ${data.length} actions:`, data.map(a => a.label));
      setActions(data);
      
      if (data.length === 0) {
        console.log(`[ActionButtons] No active actions found for ${normalizedObjectName}. Check Object Manager > ${normalizedObjectName} > Actions.`);
      }
    } catch (err) {
      console.error('[ActionButtons] Error fetching runtime actions:', err);
      setError(err.response?.data?.detail || 'Failed to load actions');
      setActions([]);
    } finally {
      setLoading(false);
    }
  }, [objectApiName, placement]);

  useEffect(() => {
    fetchActions();
  }, [fetchActions]);

  const executeAction = async (actionId, recordId, recordData = null, formData = null) => {
    try {
      setExecuting(actionId);
      const result = await actionService.executeAction(actionId, recordId, recordData, formData);
      return result;
    } finally {
      setExecuting(null);
    }
  };

  return {
    actions,
    loading,
    error,
    executing,
    refetch: fetchActions,
    executeAction
  };
};

export default useActions;
