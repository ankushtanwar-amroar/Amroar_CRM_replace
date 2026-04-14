/**
 * FlowComponent - Embedded Screen Flow Component for Record Pages
 * 
 * Features:
 * - Renders Screen Flows directly on record detail pages
 * - Automatically passes recordId for Record Detail flows
 * - Supports Use Anywhere and Record Detail launch modes
 * - Full multi-step flow navigation (Next, Previous, Finish)
 * 
 * Similar to Salesforce Lightning Flow Component
 */
import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { 
  Play, Loader2, ChevronRight, ChevronLeft, Check, 
  AlertCircle, RefreshCw, X 
} from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Textarea } from '../../../components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '../../../components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

/**
 * Screen Component Renderer
 * Renders individual screen components based on type
 */
const ScreenComponentRenderer = ({ component, value, onChange, error }) => {
  const componentType = component.type?.toLowerCase() || 'text';
  const apiName = component.api_name || component.name;
  const label = component.label || apiName;
  const required = component.required || false;
  const config = component.config || {};
  
  switch (componentType) {
    case 'display_text':
    case 'text_display':
      return (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-md text-blue-800 text-sm">
          {config.value || component.value || label}
        </div>
      );
    
    case 'text':
    case 'text_input':
      return (
        <div>
          <Label htmlFor={apiName} className="text-sm font-medium text-slate-700">
            {label}
            {required && <span className="text-red-500 ml-1">*</span>}
          </Label>
          <Input
            id={apiName}
            value={value || ''}
            onChange={(e) => onChange(apiName, e.target.value)}
            placeholder={config.placeholder || `Enter ${label.toLowerCase()}`}
            className={`mt-1 ${error ? 'border-red-500' : ''}`}
          />
          {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
        </div>
      );
    
    case 'textarea':
    case 'text_area':
    case 'long_text':
      return (
        <div>
          <Label htmlFor={apiName} className="text-sm font-medium text-slate-700">
            {label}
            {required && <span className="text-red-500 ml-1">*</span>}
          </Label>
          <Textarea
            id={apiName}
            value={value || ''}
            onChange={(e) => onChange(apiName, e.target.value)}
            placeholder={config.placeholder || `Enter ${label.toLowerCase()}`}
            rows={config.rows || 3}
            className={`mt-1 ${error ? 'border-red-500' : ''}`}
          />
          {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
        </div>
      );
    
    case 'picklist':
    case 'select':
    case 'dropdown':
      const options = config.options || component.options || [];
      return (
        <div>
          <Label htmlFor={apiName} className="text-sm font-medium text-slate-700">
            {label}
            {required && <span className="text-red-500 ml-1">*</span>}
          </Label>
          <Select
            value={value || ''}
            onValueChange={(val) => onChange(apiName, val)}
          >
            <SelectTrigger className={`mt-1 ${error ? 'border-red-500' : ''}`}>
              <SelectValue placeholder={`Select ${label.toLowerCase()}`} />
            </SelectTrigger>
            <SelectContent>
              {options.map((opt, idx) => {
                const optValue = typeof opt === 'string' ? opt : opt.value;
                const optLabel = typeof opt === 'string' ? opt : (opt.label || opt.value);
                return (
                  <SelectItem key={idx} value={optValue}>
                    {optLabel}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
        </div>
      );
    
    case 'checkbox':
    case 'boolean':
      return (
        <div className="flex items-center space-x-2">
          <input
            type="checkbox"
            id={apiName}
            checked={value === true || value === 'true'}
            onChange={(e) => onChange(apiName, e.target.checked)}
            className="h-4 w-4 rounded border-slate-300"
          />
          <Label htmlFor={apiName} className="text-sm font-medium text-slate-700">
            {label}
            {required && <span className="text-red-500 ml-1">*</span>}
          </Label>
        </div>
      );
    
    case 'number':
    case 'currency':
      return (
        <div>
          <Label htmlFor={apiName} className="text-sm font-medium text-slate-700">
            {label}
            {required && <span className="text-red-500 ml-1">*</span>}
          </Label>
          <Input
            id={apiName}
            type="number"
            value={value || ''}
            onChange={(e) => onChange(apiName, e.target.value)}
            placeholder={config.placeholder || `Enter ${label.toLowerCase()}`}
            className={`mt-1 ${error ? 'border-red-500' : ''}`}
          />
          {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
        </div>
      );
    
    case 'date':
      return (
        <div>
          <Label htmlFor={apiName} className="text-sm font-medium text-slate-700">
            {label}
            {required && <span className="text-red-500 ml-1">*</span>}
          </Label>
          <Input
            id={apiName}
            type="date"
            value={value || ''}
            onChange={(e) => onChange(apiName, e.target.value)}
            className={`mt-1 ${error ? 'border-red-500' : ''}`}
          />
          {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
        </div>
      );
    
    default:
      return (
        <div>
          <Label htmlFor={apiName} className="text-sm font-medium text-slate-700">
            {label}
            {required && <span className="text-red-500 ml-1">*</span>}
          </Label>
          <Input
            id={apiName}
            value={value || ''}
            onChange={(e) => onChange(apiName, e.target.value)}
            placeholder={config.placeholder || `Enter ${label.toLowerCase()}`}
            className={`mt-1 ${error ? 'border-red-500' : ''}`}
          />
          {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
        </div>
      );
  }
};

/**
 * FlowComponent - Main Component
 */
const FlowComponent = ({ 
  config = {},
  record = {},
  recordId,
  objectName,
  autoStart = false, // Auto-start for record detail pages
}) => {
  const flowId = config.flowId;
  const flowName = config.flowName || 'Screen Flow';
  
  const [flow, setFlow] = useState(null);
  const [loading, setLoading] = useState(false);
  const [currentNodeId, setCurrentNodeId] = useState(null);
  const [executionContext, setExecutionContext] = useState({});
  const [isComplete, setIsComplete] = useState(false);
  const [error, setError] = useState(null);
  const [screenHistory, setScreenHistory] = useState([]);
  const [screenData, setScreenData] = useState({});
  const [validationErrors, setValidationErrors] = useState({});
  const [isStarted, setIsStarted] = useState(autoStart);

  // Auto-start effect when on record page with autoStart prop
  useEffect(() => {
    if (autoStart && flowId && !isStarted) {
      setIsStarted(true);
    }
  }, [autoStart, flowId]);

  // Load flow when flowId changes
  useEffect(() => {
    if (flowId && isStarted) {
      loadFlow();
    }
  }, [flowId, isStarted]);

  // Initialize record context
  useEffect(() => {
    if (recordId && objectName && isStarted) {
      const initialContext = {
        'Flow.recordId': recordId,
        'Flow': { recordId },
        'Record': record?.data || record,
      };
      
      // Set flat keys for record fields
      const recordData = record?.data || record;
      if (recordData) {
        Object.keys(recordData).forEach(key => {
          initialContext[`Record.${key}`] = recordData[key];
        });
      }
      
      setExecutionContext(prev => ({ ...prev, ...initialContext }));
    }
  }, [recordId, objectName, record, isStarted]);

  const loadFlow = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await axios.get(`${API_URL}/api/flow-builder/flows/${flowId}`);
      const flowData = response.data;
      
      setFlow(flowData);
      
      // Find the first screen node
      const startNode = findStartNode(flowData);
      if (startNode) {
        setCurrentNodeId(startNode.id);
        setScreenHistory([startNode.id]);
      } else {
        setError({
          title: 'Invalid Screen Flow',
          description: 'This flow does not contain any screen elements.',
        });
      }
    } catch (err) {
      console.error('Error loading flow:', err);
      setError({
        title: 'Failed to Load Flow',
        description: err.response?.data?.detail || 'Unable to load the flow. Please try again.',
      });
    } finally {
      setLoading(false);
    }
  };

  const findStartNode = (flowData) => {
    const nodes = flowData?.nodes || [];
    
    // For screen flows, find the first screen node (skip start/end nodes)
    // screen_flow_start is a special marker node, not an actual screen
    let screenNode = nodes.find(n => {
      const nodeType = n.type || n.data?.nodeType;
      // Must be a screen type, not a start or end marker
      return nodeType === 'screen' && 
             n.id !== 'screen_flow_start' && 
             n.id !== 'screen_flow_end';
    });
    
    // If we have edges, follow them from start
    if (!screenNode && flowData?.edges?.length > 0) {
      // Find what comes after the start node
      const startEdge = flowData.edges.find(e => 
        e.source === 'START' || 
        e.source === 'start' || 
        e.source === 'screen_flow_start' ||
        e.source === 'start-1'
      );
      if (startEdge) {
        screenNode = nodes.find(n => n.id === startEdge.target);
      }
    }
    
    // If still no screen found, try to find any screen type node by checking all properties
    if (!screenNode) {
      screenNode = nodes.find(n => {
        const nodeType = n.type || n.data?.nodeType || n.data?.type;
        return nodeType === 'screen';
      });
    }
    
    return screenNode;
  };

  const getCurrentScreen = () => {
    if (!flow || !currentNodeId) return null;
    return flow.nodes?.find(n => n.id === currentNodeId);
  };

  const getScreenComponents = (screenNode) => {
    if (!screenNode) return [];
    
    // Check multiple possible locations for screen components
    const data = screenNode.data || {};
    const config = data.config || screenNode.config || {};
    
    // Flow Builder stores screen components in config.fields or config.components
    // Priority: config.fields > config.components > data.screen_components > data.components
    if (config.fields && config.fields.length > 0) {
      // Map flow builder fields to component format
      return config.fields.map(field => ({
        type: field.type?.toLowerCase() || 'text',
        api_name: field.name || field.id,
        name: field.name || field.id,
        label: field.label || field.name,
        required: field.required || false,
        config: {
          placeholder: field.helpText || '',
          options: field.options || [],
          defaultValue: field.defaultValue || ''
        }
      }));
    }
    
    if (config.components && config.components.length > 0) {
      return config.components;
    }
    
    // Fallback to other locations
    const components = data.components || 
                       data.screen_components || 
                       data.screenComponents ||
                       screenNode.components ||
                       screenNode.screen_components ||
                       [];
    
    return components;
  };

  const handleInputChange = (apiName, value) => {
    const screenId = currentNodeId;
    setScreenData(prev => ({
      ...prev,
      [screenId]: {
        ...prev[screenId],
        [apiName]: value
      }
    }));
    
    // Clear validation error when user types
    if (validationErrors[apiName]) {
      setValidationErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[apiName];
        return newErrors;
      });
    }
  };

  const validateCurrentScreen = () => {
    const screenNode = getCurrentScreen();
    const components = getScreenComponents(screenNode);
    const currentData = screenData[currentNodeId] || {};
    const errors = {};
    
    components.forEach(comp => {
      const apiName = comp.api_name || comp.name;
      const value = currentData[apiName];
      
      if (comp.required && (!value || value === '')) {
        errors[apiName] = `${comp.label || apiName} is required`;
      }
    });
    
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const findNextNode = (currentId) => {
    if (!flow) return null;
    
    // First, try to use edges if available
    if (flow.edges && flow.edges.length > 0) {
      const outgoingEdge = flow.edges.find(e => e.source === currentId);
      if (outgoingEdge) {
        return flow.nodes?.find(n => n.id === outgoingEdge.target);
      }
    }
    
    // Fallback: If no edges, find next node by position or index
    // This handles flows created without explicit edges
    const nodes = flow.nodes || [];
    const currentIdx = nodes.findIndex(n => n.id === currentId);
    
    if (currentIdx !== -1 && currentIdx < nodes.length - 1) {
      // Look for the next screen or end node
      for (let i = currentIdx + 1; i < nodes.length; i++) {
        const node = nodes[i];
        const nodeType = node.type || node.data?.nodeType;
        
        // Skip non-renderable nodes (start markers, etc.)
        if (nodeType === 'screen_flow_start') continue;
        
        // Found a screen or end node
        if (nodeType === 'screen' || nodeType === 'screen_flow_end' || nodeType === 'end') {
          return node;
        }
      }
    }
    
    return null;
  };

  const handleNext = async () => {
    if (!validateCurrentScreen()) {
      toast.error('Please fill in all required fields');
      return;
    }
    
    // Store current screen data in execution context
    const currentData = screenData[currentNodeId] || {};
    setExecutionContext(prev => ({
      ...prev,
      ...Object.fromEntries(
        Object.entries(currentData).map(([k, v]) => [`Screen.${k}`, v])
      )
    }));
    
    // Find next node
    const nextNode = findNextNode(currentNodeId);
    
    if (!nextNode) {
      // No more nodes - flow is complete
      setIsComplete(true);
      toast.success('Flow completed successfully!');
      return;
    }
    
    // Check if next node is a screen
    if (nextNode.type === 'screen' || nextNode.data?.type === 'screen') {
      setCurrentNodeId(nextNode.id);
      setScreenHistory(prev => [...prev, nextNode.id]);
    } else if (nextNode.type === 'ScreenFlowEnd' || nextNode.type === 'end') {
      setIsComplete(true);
      toast.success('Flow completed successfully!');
    } else {
      // For other node types (decision, action, etc.), try to execute and continue
      const afterNode = findNextNode(nextNode.id);
      if (afterNode) {
        setCurrentNodeId(afterNode.id);
        setScreenHistory(prev => [...prev, afterNode.id]);
      } else {
        setIsComplete(true);
        toast.success('Flow completed successfully!');
      }
    }
  };

  const handlePrevious = () => {
    if (screenHistory.length > 1) {
      const newHistory = [...screenHistory];
      newHistory.pop();
      const previousNodeId = newHistory[newHistory.length - 1];
      setScreenHistory(newHistory);
      setCurrentNodeId(previousNodeId);
      setValidationErrors({});
    }
  };

  const handleRestart = () => {
    setIsComplete(false);
    setScreenData({});
    setScreenHistory([]);
    setValidationErrors({});
    setExecutionContext({});
    setIsStarted(false);
  };

  const handleStart = () => {
    setIsStarted(true);
  };

  // No flow configured
  if (!flowId) {
    return (
      <Card className="border-dashed border-2 border-slate-300 bg-slate-50" data-testid="flow-component-empty">
        <CardContent className="flex flex-col items-center justify-center py-8">
          <Play className="h-10 w-10 text-slate-400 mb-3" />
          <p className="text-sm text-slate-500 text-center">
            No flow selected.<br />
            Configure this component to select a Screen Flow.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Not started yet - show start button
  if (!isStarted) {
    return (
      <Card data-testid="flow-component">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Play className="h-4 w-4 text-blue-600" />
            {flowName}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Button 
            onClick={handleStart}
            className="w-full bg-blue-600 hover:bg-blue-700"
            data-testid="flow-start-btn"
          >
            <Play className="h-4 w-4 mr-2" />
            Start Flow
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Loading state
  if (loading) {
    return (
      <Card data-testid="flow-component">
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          <span className="ml-3 text-slate-600">Loading flow...</span>
        </CardContent>
      </Card>
    );
  }

  // Error state
  if (error) {
    return (
      <Card data-testid="flow-component">
        <CardContent className="py-8">
          <div className="flex flex-col items-center text-center">
            <AlertCircle className="h-10 w-10 text-red-500 mb-3" />
            <h3 className="font-semibold text-red-700 mb-1">{error.title}</h3>
            <p className="text-sm text-slate-600 mb-4">{error.description}</p>
            <Button variant="outline" onClick={handleRestart}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Try Again
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Flow complete
  if (isComplete) {
    return (
      <Card data-testid="flow-component">
        <CardContent className="py-8">
          <div className="flex flex-col items-center text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <Check className="h-8 w-8 text-green-600" />
            </div>
            <h3 className="font-semibold text-green-700 mb-1">Flow Complete</h3>
            <p className="text-sm text-slate-600 mb-4">
              The flow has been completed successfully.
            </p>
            <Button variant="outline" onClick={handleRestart}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Run Again
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Render current screen
  const currentScreen = getCurrentScreen();
  const components = getScreenComponents(currentScreen);
  const currentData = screenData[currentNodeId] || {};
  const screenLabel = currentScreen?.data?.label || currentScreen?.data?.name || 'Screen';
  const canGoBack = screenHistory.length > 1;

  return (
    <Card data-testid="flow-component" className="shadow-sm border-slate-200">
      <CardHeader className="pb-3 border-b bg-slate-50">
        <CardTitle className="text-base flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Play className="h-4 w-4 text-blue-600" />
            {flowName}
          </span>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={handleRestart}
            className="h-7 px-2 text-slate-500 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </Button>
        </CardTitle>
        {screenLabel && (
          <p className="text-sm text-slate-500 mt-1">{screenLabel}</p>
        )}
      </CardHeader>
      <CardContent className="pt-5 pb-5 px-5">
        {/* Screen Components */}
        <div className="space-y-5">
          {components.length > 0 ? (
            components.map((comp, idx) => (
              <ScreenComponentRenderer
                key={comp.api_name || comp.name || idx}
                component={comp}
                value={currentData[comp.api_name || comp.name]}
                onChange={handleInputChange}
                error={validationErrors[comp.api_name || comp.name]}
              />
            ))
          ) : (
            <p className="text-sm text-slate-500 text-center py-4">
              No screen components to display.
            </p>
          )}
        </div>

        {/* Navigation Buttons */}
        <div className="flex justify-between mt-6 pt-4 border-t">
          <Button
            variant="outline"
            onClick={handlePrevious}
            disabled={!canGoBack}
            className={!canGoBack ? 'invisible' : ''}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Previous
          </Button>
          <Button
            onClick={handleNext}
            className="bg-blue-600 hover:bg-blue-700"
          >
            Next
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default FlowComponent;
