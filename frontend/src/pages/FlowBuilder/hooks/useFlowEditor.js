/**
 * Flow Editor Hooks - State Management
 * Extracted from FlowEditorPage.js for maintainability
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useNodesState, useEdgesState, useReactFlow } from 'reactflow';
import { useNavigate, useLocation, useParams } from 'react-router-dom';

const API = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';

/**
 * Hook for flow state management
 */
export const useFlowState = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { flowId } = useParams();
  const reactFlowInstance = useReactFlow();
  
  // Check if this is a read-only view
  const searchParams = new URLSearchParams(location.search);
  const isReadOnly = searchParams.get('readonly') === 'true';
  
  // Core flow state
  const [layoutReady, setLayoutReady] = useState(false);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [flowName, setFlowName] = useState('');
  const [flowDescription, setFlowDescription] = useState('');
  const [flowStatus, setFlowStatus] = useState('draft');
  const [flowVersion, setFlowVersion] = useState(1);
  const [selectedNode, setSelectedNode] = useState(null);
  const [configPanelKey, setConfigPanelKey] = useState(0);
  const [triggers, setTriggers] = useState([]);
  const [saving, setSaving] = useState(false);
  
  // UI Panel states
  const [showAddActionMenu, setShowAddActionMenu] = useState(false);
  const [addActionPosition, setAddActionPosition] = useState(null);
  const [insertAfterNodeId, setInsertAfterNodeId] = useState(null);
  const [showAIAssistant, setShowAIAssistant] = useState(false);
  const [showLogsPanel, setShowLogsPanel] = useState(false);
  const [showRunManuallyModal, setShowRunManuallyModal] = useState(false);
  const [showInputVariablesPanel, setShowInputVariablesPanel] = useState(false);
  const [showFlowSettingsPanel, setShowFlowSettingsPanel] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [highlightedNodeId, setHighlightedNodeId] = useState(null);
  
  // Flow configuration
  const [batchSize, setBatchSize] = useState(50);
  const [flowVersions, setFlowVersions] = useState([]);
  const [crmObjects, setCrmObjects] = useState([]);
  const [crmFieldsCache, setCrmFieldsCache] = useState({});
  const [flowVariables, setFlowVariables] = useState([]);
  const [inputVariables, setInputVariables] = useState([]);
  
  // Flow type settings
  const [flowType, setFlowType] = useState(null);
  const [savedFlowType, setSavedFlowType] = useState('trigger');
  const [launchMode, setLaunchMode] = useState('basic');
  const [screenFlowObject, setScreenFlowObject] = useState(null);
  const [decisionOutcomeContext, setDecisionOutcomeContext] = useState(null);
  
  // Ref for pending updates
  const pendingNodeUpdates = useRef({});
  
  return {
    // Navigation
    navigate,
    location,
    flowId,
    reactFlowInstance,
    isReadOnly,
    
    // Core state
    layoutReady, setLayoutReady,
    nodes, setNodes, onNodesChange,
    edges, setEdges, onEdgesChange,
    flowName, setFlowName,
    flowDescription, setFlowDescription,
    flowStatus, setFlowStatus,
    flowVersion, setFlowVersion,
    selectedNode, setSelectedNode,
    configPanelKey, setConfigPanelKey,
    triggers, setTriggers,
    saving, setSaving,
    
    // UI state
    showAddActionMenu, setShowAddActionMenu,
    addActionPosition, setAddActionPosition,
    insertAfterNodeId, setInsertAfterNodeId,
    showAIAssistant, setShowAIAssistant,
    showLogsPanel, setShowLogsPanel,
    showRunManuallyModal, setShowRunManuallyModal,
    showInputVariablesPanel, setShowInputVariablesPanel,
    showFlowSettingsPanel, setShowFlowSettingsPanel,
    showPreview, setShowPreview,
    highlightedNodeId, setHighlightedNodeId,
    
    // Config state
    batchSize, setBatchSize,
    flowVersions, setFlowVersions,
    crmObjects, setCrmObjects,
    crmFieldsCache, setCrmFieldsCache,
    flowVariables, setFlowVariables,
    inputVariables, setInputVariables,
    flowType, setFlowType,
    savedFlowType, setSavedFlowType,
    launchMode, setLaunchMode,
    screenFlowObject, setScreenFlowObject,
    decisionOutcomeContext, setDecisionOutcomeContext,
    
    // Refs
    pendingNodeUpdates,
  };
};

/**
 * Hook for CRM data fetching
 */
export const useCRMData = (crmFieldsCache, setCrmFieldsCache, setCrmObjects) => {
  // Fetch CRM objects
  const fetchCrmObjects = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API}/api/objects`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        const objects = data.map(obj => ({
          name: obj.object_name,
          label: obj.label || obj.object_name.charAt(0).toUpperCase() + obj.object_name.slice(1)
        }));
        setCrmObjects(objects);
        return objects;
      }
    } catch (error) {
      console.error('Error fetching CRM objects:', error);
    }
    return [];
  }, [setCrmObjects]);

  // Fetch fields for a specific object
  const fetchFieldsForObject = useCallback(async (objectName) => {
    if (!objectName) return [];
    
    // Check cache first
    if (crmFieldsCache[objectName]) {
      return crmFieldsCache[objectName];
    }
    
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API}/api/objects/${objectName}/fields`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        const fields = Object.entries(data.fields || {}).map(([key, field]) => ({
          name: key,
          api_name: key,
          label: field.label || key,
          type: field.type,
          required: field.required
        }));
        
        // Cache the fields
        setCrmFieldsCache(prev => ({ ...prev, [objectName]: fields }));
        return fields;
      }
    } catch (error) {
      console.error(`Error fetching fields for ${objectName}:`, error);
    }
    return [];
  }, [crmFieldsCache, setCrmFieldsCache]);

  return { fetchCrmObjects, fetchFieldsForObject };
};

/**
 * Hook for flow persistence (save/load)
 */
export const useFlowPersistence = (flowId, API) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Load flow
  const loadFlow = useCallback(async (token) => {
    if (!flowId || flowId === 'new') return null;
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`${API}/api/flow-builder/flows/${flowId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (!response.ok) {
        throw new Error('Failed to load flow');
      }
      
      const data = await response.json();
      setLoading(false);
      return data;
    } catch (err) {
      setError(err.message);
      setLoading(false);
      return null;
    }
  }, [flowId, API]);

  // Save flow
  const saveFlow = useCallback(async (flowData, token, isNew = false) => {
    setLoading(true);
    setError(null);
    
    try {
      const url = isNew 
        ? `${API}/api/flow-builder/flows`
        : `${API}/api/flow-builder/flows/${flowId}`;
      
      const method = isNew ? 'POST' : 'PUT';
      
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(flowData)
      });
      
      if (!response.ok) {
        throw new Error('Failed to save flow');
      }
      
      const data = await response.json();
      setLoading(false);
      return data;
    } catch (err) {
      setError(err.message);
      setLoading(false);
      return null;
    }
  }, [flowId, API]);

  return { loading, error, loadFlow, saveFlow };
};

/**
 * Hook for flow variable management
 */
export const useFlowVariables = (flowVariables, setFlowVariables) => {
  // Create a new variable
  const createVariable = useCallback((variableData) => {
    const newVariable = {
      id: `var_${Date.now()}`,
      name: variableData.name,
      dataType: variableData.dataType || 'String',
      defaultValue: variableData.defaultValue || '',
      description: variableData.description || '',
      isInput: variableData.isInput || false,
      isOutput: variableData.isOutput || false,
      ...variableData
    };
    
    setFlowVariables(prev => [...prev, newVariable]);
    return newVariable;
  }, [setFlowVariables]);

  // Update a variable
  const updateVariable = useCallback((variableId, updates) => {
    setFlowVariables(prev => 
      prev.map(v => v.id === variableId ? { ...v, ...updates } : v)
    );
  }, [setFlowVariables]);

  // Delete a variable
  const deleteVariable = useCallback((variableId) => {
    setFlowVariables(prev => prev.filter(v => v.id !== variableId));
  }, [setFlowVariables]);

  return { createVariable, updateVariable, deleteVariable };
};

export default {
  useFlowState,
  useCRMData,
  useFlowPersistence,
  useFlowVariables
};
