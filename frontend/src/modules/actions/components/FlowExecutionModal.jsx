/**
 * FlowExecutionModal - Salesforce-style Screen Flow Execution
 * 
 * Renders and executes Screen Flows from Run Flow actions.
 * 
 * Features:
 * - Automatically passes recordId to the flow
 * - Renders screen components (text inputs, picklists, etc.)
 * - Handles flow navigation (next, back, finish)
 * - Updates record data after flow completion
 */
import React, { useState, useEffect, useCallback } from 'react';
import { X, Loader2, ChevronRight, ChevronLeft, Check, AlertCircle, Play } from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';
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
    
    case 'number':
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
            className={`mt-1 ${error ? 'border-red-500' : ''}`}
          />
          {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
        </div>
      );
    
    case 'checkbox':
    case 'boolean':
      return (
        <div className="flex items-center gap-2 mt-2">
          <input
            type="checkbox"
            id={apiName}
            checked={value === true || value === 'true'}
            onChange={(e) => onChange(apiName, e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
          />
          <Label htmlFor={apiName} className="text-sm font-medium text-slate-700">
            {label}
            {required && <span className="text-red-500 ml-1">*</span>}
          </Label>
          {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
        </div>
      );
    
    default:
      // Default to text input
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
            className={`mt-1 ${error ? 'border-red-500' : ''}`}
          />
          {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
        </div>
      );
  }
};

/**
 * Main FlowExecutionModal Component
 */
const FlowExecutionModal = ({
  action,
  recordId,
  recordData,
  objectName,
  onClose,
  onComplete
}) => {
  // State
  const [loading, setLoading] = useState(true);
  const [flow, setFlow] = useState(null);
  const [executionId, setExecutionId] = useState(null);
  const [currentScreen, setCurrentScreen] = useState(null);
  const [screenValues, setScreenValues] = useState({});
  const [errors, setErrors] = useState({});
  const [flowStatus, setFlowStatus] = useState('loading'); // loading, running, completed, error
  const [flowResult, setFlowResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  
  const config = action?.config_json || {};
  const flowId = config.flow_id;
  const flowName = config.flow_name || 'Screen Flow';

  // Initialize flow execution
  useEffect(() => {
    const initializeFlow = async () => {
      if (!flowId) {
        setFlowStatus('error');
        setFlowResult({ error: 'No flow configured for this action' });
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const token = localStorage.getItem('token');
        
        // 1. Fetch flow details
        const flowResponse = await axios.get(
          `${API_URL}/api/flow-builder/flows/${flowId}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        
        const flowData = flowResponse.data;
        setFlow(flowData);
        
        // 2. Start flow preview/execution with recordId
        const initialContext = {
          recordId: recordId,
          record_id: recordId,
          objectType: objectName,
          recordData: recordData
        };
        
        const previewResponse = await axios.post(
          `${API_URL}/api/flow-builder/flows/${flowId}/preview`,
          {
            safe_mode: false, // Execute for real
            initial_context: initialContext
          },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        
        setExecutionId(previewResponse.data.execution_id);
        
        // 3. Get first screen
        await fetchNextScreen(previewResponse.data.execution_id, {});
        
        setFlowStatus('running');
      } catch (err) {
        console.error('Error initializing flow:', err);
        setFlowStatus('error');
        setFlowResult({ 
          error: err.response?.data?.detail || err.message || 'Failed to start flow' 
        });
      } finally {
        setLoading(false);
      }
    };

    initializeFlow();
  }, [flowId, recordId, objectName, recordData]);

  // Fetch next screen in the flow
  const fetchNextScreen = async (execId, screenData) => {
    try {
      const token = localStorage.getItem('token');
      
      const response = await axios.post(
        `${API_URL}/api/flow-builder/flows/${flowId}/preview/${execId}/next`,
        { screen_data: screenData },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      const result = response.data;
      
      if (result.node_type === 'screen') {
        setCurrentScreen(result.screen_config);
        setScreenValues({}); // Reset values for new screen
        setErrors({});
      } else if (result.node_type === 'end' || result.status === 'completed') {
        setFlowStatus('completed');
        setCurrentScreen(null);
      } else if (result.continue) {
        // Non-screen node (decision, action) - continue to next
        await fetchNextScreen(execId, {});
      }
      
      return result;
    } catch (err) {
      console.error('Error fetching next screen:', err);
      throw err;
    }
  };

  // Handle screen field value change
  const handleValueChange = useCallback((fieldName, value) => {
    setScreenValues(prev => ({ ...prev, [fieldName]: value }));
    // Clear error when user types
    if (errors[fieldName]) {
      setErrors(prev => ({ ...prev, [fieldName]: null }));
    }
  }, [errors]);

  // Validate current screen
  const validateScreen = () => {
    const newErrors = {};
    const components = currentScreen?.components || [];
    
    components.forEach(component => {
      const apiName = component.api_name || component.name;
      const required = component.required;
      const value = screenValues[apiName];
      
      if (required && (value === undefined || value === null || value === '')) {
        newErrors[apiName] = `${component.label || apiName} is required`;
      }
    });
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handle Next button click
  const handleNext = async () => {
    if (!validateScreen()) {
      return;
    }
    
    setSubmitting(true);
    
    try {
      await fetchNextScreen(executionId, screenValues);
    } catch (err) {
      toast.error('Failed to proceed: ' + (err.response?.data?.detail || err.message));
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Finish button click
  const handleFinish = async () => {
    if (!validateScreen()) {
      return;
    }
    
    setSubmitting(true);
    
    try {
      // Submit final screen data
      await fetchNextScreen(executionId, screenValues);
      
      // Notify completion
      toast.success(`${flowName} completed successfully`);
      
      if (onComplete) {
        onComplete({ success: true, flowId, screenValues });
      }
      
      onClose();
    } catch (err) {
      toast.error('Failed to complete flow: ' + (err.response?.data?.detail || err.message));
    } finally {
      setSubmitting(false);
    }
  };

  // Use ref to track execution ID for cleanup (avoids race conditions)
  const executionIdRef = React.useRef(null);
  
  // Update ref when executionId changes
  useEffect(() => {
    executionIdRef.current = executionId;
  }, [executionId]);
  
  // Cleanup on unmount only (empty dependency array)
  useEffect(() => {
    return () => {
      // Stop preview execution on unmount
      const execId = executionIdRef.current;
      if (execId && flowId) {
        const token = localStorage.getItem('token');
        axios.delete(
          `${API_URL}/api/flow-builder/flows/${flowId}/preview/${execId}`,
          { headers: { Authorization: `Bearer ${token}` } }
        ).catch(() => {}); // Ignore cleanup errors
      }
    };
  }, [flowId]); // Only depend on flowId which doesn't change

  // Render loading state
  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" data-testid="flow-modal">
        <div className="bg-white rounded-lg shadow-xl p-8 max-w-md">
          <div className="flex flex-col items-center">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600 mb-4" />
            <p className="text-slate-600">Starting {flowName}...</p>
          </div>
        </div>
      </div>
    );
  }

  // Render error state
  if (flowStatus === 'error') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" data-testid="flow-modal-error">
        <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
          <div className="p-6 border-b border-red-200 bg-red-50 rounded-t-lg">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-6 w-6 text-red-600" />
              <h2 className="text-lg font-semibold text-red-800">Flow Error</h2>
            </div>
          </div>
          <div className="p-6">
            <p className="text-slate-600 mb-4">
              {flowResult?.error || 'An error occurred while running the flow.'}
            </p>
            <Button onClick={onClose} className="w-full">
              Close
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Render completed state
  if (flowStatus === 'completed') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" data-testid="flow-modal-complete">
        <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
          <div className="p-6 border-b border-green-200 bg-green-50 rounded-t-lg">
            <div className="flex items-center gap-3">
              <Check className="h-6 w-6 text-green-600" />
              <h2 className="text-lg font-semibold text-green-800">Flow Completed</h2>
            </div>
          </div>
          <div className="p-6">
            <p className="text-slate-600 mb-4">
              {flowName} has completed successfully.
            </p>
            <Button onClick={() => { onComplete?.({ success: true }); onClose(); }} className="w-full">
              Done
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Render screen
  const screenLabel = currentScreen?.label || currentScreen?.screen_name || 'Screen';
  const screenDescription = currentScreen?.description || '';
  const components = currentScreen?.components || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" data-testid="flow-modal">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-blue-600 to-blue-500">
          <div className="flex items-center gap-3">
            <Play className="h-5 w-5 text-white" />
            <div>
              <h2 className="text-lg font-semibold text-white">{flowName}</h2>
              <p className="text-blue-100 text-sm">{screenLabel}</p>
            </div>
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={onClose}
            className="text-white hover:bg-white/20"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {screenDescription && (
            <p className="text-slate-600 mb-6">{screenDescription}</p>
          )}
          
          <div className="space-y-4">
            {components.map((component, idx) => (
              <ScreenComponentRenderer
                key={component.api_name || idx}
                component={component}
                value={screenValues[component.api_name || component.name]}
                onChange={handleValueChange}
                error={errors[component.api_name || component.name]}
              />
            ))}
          </div>
          
          {components.length === 0 && (
            <div className="text-center py-8 text-slate-500">
              <p>No input fields on this screen.</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 bg-slate-50">
          <div className="text-sm text-slate-500">
            Record: {recordId}
          </div>
          <div className="flex gap-3">
            <Button 
              variant="outline" 
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleNext}
              disabled={submitting}
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FlowExecutionModal;
