/**
 * EmbeddableScreenFlowRunner - A modal-friendly version of ScreenFlowRunner
 * 
 * This component wraps the core ScreenFlowRunner logic for use in modals/dialogs.
 * It accepts props instead of URL params and handles completion callbacks.
 * 
 * Features:
 * - Accepts flowId, recordId, objectType as props
 * - Auto-fetches record data for record_detail flows
 * - Supports dynamic picklists with object filters
 * - Calls onComplete/onClose callbacks
 */

import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import ScreenRenderer from './components/ScreenRenderer';

const API = process.env.REACT_APP_BACKEND_URL;

const EmbeddableScreenFlowRunner = ({
  flowId,
  recordId,
  objectType,
  onComplete,
  onClose,
  showHeader = true
}) => {
  const [flow, setFlow] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentNodeId, setCurrentNodeId] = useState(null);
  const [executionContext, setExecutionContext] = useState({});
  const [isComplete, setIsComplete] = useState(false);
  const [error, setError] = useState(null);
  const [screenHistory, setScreenHistory] = useState([]);
  const [screenData, setScreenData] = useState({});

  // Load flow and initialize context
  useEffect(() => {
    const initialize = async () => {
      try {
        setLoading(true);
        
        // Load flow
        const token = localStorage.getItem('token');
        const flowResponse = await axios.get(
          `${API}/api/flow-builder/flows/${flowId}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const flowData = flowResponse.data;
        console.log('[EmbeddableFlow] Flow loaded:', flowData.name);
        setFlow(flowData);
        
        // Initialize context with record data
        let initialContext = {
          'Flow.recordId': recordId,
          'Flow.objectType': objectType,
          recordId: recordId,
          objectType: objectType
        };
        
        // Auto-fetch record for record_detail flows
        if (flowData.launch_mode === 'record_detail' && recordId) {
          const targetObject = flowData.screen_flow_object || objectType;
          console.log('[EmbeddableFlow] Fetching record:', targetObject, recordId);
          
          try {
            // Try object-specific endpoint first
            let recordData;
            try {
              const recordResponse = await axios.get(
                `${API}/api/${targetObject.replace('_', '-')}s/${recordId}`,
                { headers: { Authorization: `Bearer ${token}` } }
              );
              recordData = recordResponse.data;
            } catch {
              // Fallback to generic objects endpoint
              const recordResponse = await axios.get(
                `${API}/api/objects/${targetObject}/records/${recordId}`,
                { headers: { Authorization: `Bearer ${token}` } }
              );
              recordData = recordResponse.data;
            }
            
            // Store as $Record in context
            initialContext['$Record'] = recordData;
            initialContext['Record'] = recordData;
            
            // Also flatten record data fields
            if (recordData.data) {
              Object.entries(recordData.data).forEach(([key, value]) => {
                initialContext[`$Record.${key}`] = value;
                initialContext[`Record.${key}`] = value;
              });
            }
            
            console.log('[EmbeddableFlow] Record loaded:', recordData);
          } catch (err) {
            console.warn('[EmbeddableFlow] Failed to load record:', err);
          }
        }
        
        setExecutionContext(initialContext);
        
        // Find first screen node
        const firstScreen = findFirstScreen(flowData);
        if (firstScreen) {
          setCurrentNodeId(firstScreen.id);
          setScreenHistory([firstScreen.id]);
        } else {
          setError({ message: 'No screens found in flow' });
        }
        
      } catch (err) {
        console.error('[EmbeddableFlow] Error:', err);
        setError({ message: err.response?.data?.detail || 'Failed to load flow' });
      } finally {
        setLoading(false);
      }
    };
    
    if (flowId) {
      initialize();
    }
  }, [flowId, recordId, objectType]);

  // Find first screen node
  const findFirstScreen = (flowData) => {
    const nodes = flowData.nodes || [];
    const edges = flowData.edges || [];
    
    // Find start node
    const startNode = nodes.find(n => 
      n.type === 'screen_flow_start' || n.type === 'start'
    );
    
    if (startNode) {
      // Find edge from start
      const startEdge = edges.find(e => e.source === startNode.id);
      if (startEdge) {
        const targetNode = nodes.find(n => n.id === startEdge.target);
        if (targetNode && targetNode.type === 'screen') {
          return targetNode;
        }
      }
    }
    
    // Fallback: first screen node
    return nodes.find(n => n.type === 'screen');
  };

  // Find next node via edges
  const findNextNode = (fromNodeId) => {
    if (!flow) return null;
    const edge = flow.edges?.find(e => e.source === fromNodeId);
    if (!edge) return null;
    return flow.nodes?.find(n => n.id === edge.target);
  };

  // Get all screen nodes
  const getScreenNodes = () => {
    if (!flow) return [];
    return flow.nodes?.filter(n => n.type === 'screen') || [];
  };

  // Resolve variables in config (e.g., {{$Record.id}}, {{recordId}})
  const resolveVariables = (obj, context) => {
    if (!obj) return obj;
    if (typeof obj === 'string') {
      // Replace {{variable}} patterns
      return obj.replace(/\{\{([^}]+)\}\}/g, (match, varPath) => {
        const trimmed = varPath.trim();
        return context[trimmed] ?? match;
      });
    }
    if (Array.isArray(obj)) {
      return obj.map(item => resolveVariables(item, context));
    }
    if (typeof obj === 'object') {
      const resolved = {};
      for (const [key, value] of Object.entries(obj)) {
        resolved[key] = resolveVariables(value, context);
      }
      return resolved;
    }
    return obj;
  };

  // Execute action node
  const executeAction = async (node, context) => {
    const config = node.data?.config || node.config || {};
    const actionType = config.action_type;
    
    console.log('[EmbeddableFlow] Executing action:', actionType);
    
    const token = localStorage.getItem('token');
    const headers = { Authorization: `Bearer ${token}` };
    
    try {
      // Get Records action (simple query)
      if (actionType === 'get_records') {
        const object = config.object;
        const filter = resolveVariables(config.filter, context);
        
        let url = `${API}/api/objects/${object}/records`;
        if (filter) {
          const params = new URLSearchParams();
          Object.entries(filter).forEach(([key, value]) => {
            params.append(`filter_${key}`, value);
          });
          url += `?${params.toString()}`;
        }
        
        const response = await axios.get(url, { headers });
        console.log('[EmbeddableFlow] Get records result:', response.data);
        
        return {
          success: true,
          records: response.data.records || [],
          total: response.data.total || 0
        };
      }
      
      // Create Service Appointment
      if (actionType === 'create_service_appointment') {
        const payload = resolveVariables({
          data: {
            subject: config.subject || 'Service Appointment',
            work_order_id: config.work_order_id,
            status: 'None',
            start_time: config.start_time,
            end_time: config.end_time
          }
        }, context);
        
        const response = await axios.post(
          `${API}/api/service-appointments`,
          payload,
          { headers }
        );
        
        console.log('[EmbeddableFlow] Service Appointment created:', response.data);
        return { success: true, serviceAppointmentId: response.data.id, data: response.data };
      }
      
      // Generic API call
      if (actionType === 'api_call') {
        const endpoint = config.endpoint;
        const method = (config.method || 'POST').toUpperCase();
        const payload = resolveVariables(config.payload, context);
        
        let response;
        if (method === 'GET') {
          response = await axios.get(`${API}${endpoint}`, { headers, params: payload });
        } else if (method === 'POST') {
          response = await axios.post(`${API}${endpoint}`, payload, { headers });
        } else if (method === 'PUT') {
          response = await axios.put(`${API}${endpoint}`, payload, { headers });
        }
        
        return { success: true, data: response.data };
      }
      
      console.warn('[EmbeddableFlow] Unknown action type:', actionType);
      return { success: false, error: 'Unknown action type' };
      
    } catch (err) {
      console.error('[EmbeddableFlow] Action failed:', err);
      throw err;
    }
  };

  // Handle Next button
  const handleNext = async (submittedData) => {
    console.log('[EmbeddableFlow] Next clicked, data:', submittedData);
    
    // Update context with screen data
    const updatedContext = { ...executionContext, ...submittedData };
    setExecutionContext(updatedContext);
    
    // Store for Previous navigation
    setScreenData(prev => ({ ...prev, [currentNodeId]: submittedData }));
    setScreenHistory(prev => [...prev, currentNodeId]);
    
    // Find next node
    let nextNode = findNextNode(currentNodeId);
    
    // Process non-screen nodes (actions)
    while (nextNode && nextNode.type !== 'screen') {
      if (nextNode.type === 'action') {
        try {
          const result = await executeAction(nextNode, updatedContext);
          if (result) {
            Object.assign(updatedContext, result);
            setExecutionContext(updatedContext);
          }
        } catch (err) {
          toast.error('Action failed: ' + (err.response?.data?.detail || err.message));
          return;
        }
      }
      
      if (nextNode.type === 'screen_flow_end' || nextNode.type === 'end') {
        setIsComplete(true);
        return;
      }
      
      nextNode = findNextNode(nextNode.id);
    }
    
    if (nextNode && nextNode.type === 'screen') {
      setCurrentNodeId(nextNode.id);
    } else {
      // No more screens
      setIsComplete(true);
    }
  };

  // Handle Previous button
  const handlePrevious = () => {
    if (screenHistory.length <= 1) return;
    
    const newHistory = [...screenHistory];
    newHistory.pop();
    const prevNodeId = newHistory[newHistory.length - 1];
    
    setScreenHistory(newHistory);
    setCurrentNodeId(prevNodeId);
    
    // Restore previous screen's data
    if (screenData[prevNodeId]) {
      setExecutionContext(prev => ({ ...prev, ...screenData[prevNodeId] }));
    }
  };

  // Handle Finish button
  const handleFinish = async (submittedData) => {
    console.log('[EmbeddableFlow] Finish clicked, data:', submittedData);
    
    // Update context
    const updatedContext = { ...executionContext, ...submittedData };
    setExecutionContext(updatedContext);
    
    // Execute any remaining action nodes
    let nextNode = findNextNode(currentNodeId);
    while (nextNode) {
      if (nextNode.type === 'action') {
        try {
          const result = await executeAction(nextNode, updatedContext);
          if (result) {
            Object.assign(updatedContext, result);
          }
        } catch (err) {
          toast.error('Action failed: ' + (err.response?.data?.detail || err.message));
          return;
        }
      }
      
      if (nextNode.type === 'screen_flow_end' || nextNode.type === 'end') {
        break;
      }
      
      nextNode = findNextNode(nextNode.id);
    }
    
    setIsComplete(true);
  };

  // Get current screen node
  const currentNode = flow?.nodes?.find(n => n.id === currentNodeId);
  const screenNodes = getScreenNodes();
  const currentScreenIndex = screenNodes.findIndex(n => n.id === currentNodeId);
  const isLastScreen = currentScreenIndex === screenNodes.length - 1;

  // Render loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        <span className="ml-3 text-gray-600">Loading flow...</span>
      </div>
    );
  }

  // Render error state
  if (error) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-900">Error</h3>
        <p className="text-gray-600 mt-2">{error.message}</p>
        <button
          onClick={onClose}
          className="mt-4 px-4 py-2 text-sm text-blue-600 hover:underline"
        >
          Close
        </button>
      </div>
    );
  }

  // Render completion state
  if (isComplete) {
    return (
      <div className="text-center py-12">
        <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-900">Flow Complete</h3>
        <p className="text-gray-600 mt-2">The flow has been completed successfully.</p>
        <button
          onClick={() => {
            onComplete?.();
            onClose?.();
          }}
          className="mt-6 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Done
        </button>
      </div>
    );
  }

  // Render current screen
  if (!currentNode) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">No screen to display</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Step indicator */}
      {showHeader && screenNodes.length > 1 && (
        <div className="flex items-center justify-center gap-2 mb-4">
          {screenNodes.map((node, index) => {
            const isActive = node.id === currentNodeId;
            const isCompleted = screenHistory.includes(node.id) && node.id !== currentNodeId;
            return (
              <React.Fragment key={node.id}>
                <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${
                  isActive ? 'bg-blue-600 text-white' : 
                  isCompleted ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-600'
                }`}>
                  {index + 1}
                </div>
                {index < screenNodes.length - 1 && (
                  <div className={`w-8 h-0.5 ${isCompleted ? 'bg-green-500' : 'bg-gray-200'}`} />
                )}
              </React.Fragment>
            );
          })}
        </div>
      )}
      
      {/* Screen title */}
      {showHeader && (
        <div className="text-center mb-4">
          <h3 className="text-lg font-semibold text-gray-900">
            {currentNode.data?.config?.screenTitle || currentNode.data?.label || currentNode.label || 'Screen'}
          </h3>
          <p className="text-sm text-gray-500">
            Step {currentScreenIndex + 1} of {screenNodes.length}
          </p>
        </div>
      )}
      
      {/* Screen content via ScreenRenderer */}
      <ScreenRenderer
        node={currentNode}
        onNext={handleNext}
        onPrevious={handlePrevious}
        onFinish={handleFinish}
        context={executionContext}
        screenData={screenData[currentNodeId] || {}}
        showPrevious={currentScreenIndex > 0}
        showNext={!isLastScreen}
        showFinish={isLastScreen}
      />
      
      {/* Cancel button */}
      <div className="flex justify-start pt-2 border-t mt-4">
        <button
          onClick={onClose}
          className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
        >
          Cancel
        </button>
      </div>
    </div>
  );
};

export default EmbeddableScreenFlowRunner;
