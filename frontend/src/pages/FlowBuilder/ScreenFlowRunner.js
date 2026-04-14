import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { ArrowLeft, CheckCircle, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import ScreenRenderer from './components/ScreenRenderer';

const ScreenFlowRunner = () => {
  const { flowId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  // Support for record context (C3) and list view bulk (C5)
  const recordId = searchParams.get('recordId');
  const selectedRecordIds = searchParams.get('selectedRecordIds')?.split(',').filter(Boolean) || [];
  const objectType = searchParams.get('object') || searchParams.get('objectType');
  
  const [flow, setFlow] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentNodeId, setCurrentNodeId] = useState(null);
  const [executionContext, setExecutionContext] = useState({});
  const [isComplete, setIsComplete] = useState(false);
  const [error, setError] = useState(null);
  const [executionHistory, setExecutionHistory] = useState([]);
  
  // SALESFORCE SCREEN FLOW EXECUTION CONTEXT
  // Tracks screen navigation history and data for Previous button
  const [screenHistory, setScreenHistory] = useState([]); // Stack of screen node IDs
  const [screenData, setScreenData] = useState({}); // Screen.* values per screen ID
  
  const API = process.env.REACT_APP_BACKEND_URL;

  // Load flow on mount
  useEffect(() => {
    loadFlow();
  }, [flowId]);

  // Initialize record context from URL params (C3: recordId, C5: selectedRecordIds)
  useEffect(() => {
    const initializeRecordContext = async () => {
      let initialContext = {};
      
      // Set Flow.* variables
      if (recordId) {
        initialContext['Flow.recordId'] = recordId;
        initialContext['Flow'] = { recordId };
        console.log('🎯 Record context: recordId =', recordId);
        
        // Fetch record data for {{Record}} variable (C3)
        if (objectType) {
          try {
            const res = await axios.get(`${API}/api/crm/${objectType.toLowerCase()}/${recordId}`);
            const recordData = res.data;
            initialContext['Record'] = recordData;
            // Also set flat keys for convenience
            Object.keys(recordData).forEach(key => {
              initialContext[`Record.${key}`] = recordData[key];
            });
            console.log('📄 Record data loaded:', recordData);
          } catch (err) {
            console.warn('Failed to load record data:', err);
          }
        }
      }
      
      // Set selectedRecordIds for list view bulk flows (C5)
      if (selectedRecordIds.length > 0) {
        initialContext['Flow.selectedRecordIds'] = selectedRecordIds;
        initialContext['Flow'] = { ...initialContext['Flow'], selectedRecordIds };
        console.log('🎯 List view context: selectedRecordIds =', selectedRecordIds);
      }
      
      if (Object.keys(initialContext).length > 0) {
        setExecutionContext(prev => ({ ...prev, ...initialContext }));
      }
    };
    
    initializeRecordContext();
  }, [recordId, objectType, selectedRecordIds.length]);

  const loadFlow = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API}/api/flow-builder/flows/${flowId}`);
      const flowData = response.data;
      
      console.log('📋 Flow loaded:', flowData.name);
      setFlow(flowData);
      
      // Find the first screen node
      const startNode = findStartNode(flowData);
      if (startNode) {
        setCurrentNodeId(startNode.id);
        console.log('🎬 Starting at node:', startNode.id);
      } else {
        setError({
          title: 'Invalid Screen Flow',
          description: 'This flow does not contain any screen elements.',
          suggestion: 'Please add at least one Screen node to the flow and try again.',
          errorCode: 'NO_SCREENS'
        });
      }
    } catch (err) {
      console.error('Error loading flow:', err);
      
      const statusCode = err.response?.status;
      let errorInfo = {
        title: 'Failed to Load Flow',
        description: 'An unexpected error occurred while loading the flow.',
        suggestion: 'Please try again or contact support.',
        errorCode: 'LOAD_ERROR'
      };
      
      if (statusCode === 404) {
        errorInfo = {
          title: 'Flow Not Found',
          description: 'The requested flow does not exist or has been deleted.',
          suggestion: 'Please check the flow ID or select a different flow.',
          errorCode: 'FLOW_NOT_FOUND'
        };
      } else if (statusCode === 401) {
        errorInfo = {
          title: 'Authentication Required',
          description: 'Your session has expired.',
          suggestion: 'Please log in again to access this flow.',
          errorCode: 'AUTH_ERROR'
        };
      } else if (statusCode === 403) {
        errorInfo = {
          title: 'Access Denied',
          description: 'You do not have permission to run this flow.',
          suggestion: 'Contact your administrator for access.',
          errorCode: 'PERMISSION_ERROR'
        };
      }
      
      setError(errorInfo);
      toast.error(errorInfo.title, {
        description: errorInfo.description,
        duration: 8000
      });
    } finally {
      setLoading(false);
    }
  };

  // Find the first screen node (start of screen flow)
  const findStartNode = (flowData) => {
    const nodes = flowData.nodes || [];
    
    // Look for screen node that's either first or has no incoming edges
    const edges = flowData.edges || [];
    const nodesWithIncoming = new Set(edges.map(e => e.target));
    
    // Find first screen node without incoming edges (or just first screen)
    const screenNodes = nodes.filter(n => 
      (n.type === 'screen' || n.data?.nodeType === 'screen')
    );
    
    if (screenNodes.length === 0) return null;
    
    // Prefer screen without incoming edges
    const startScreen = screenNodes.find(n => !nodesWithIncoming.has(n.id));
    return startScreen || screenNodes[0];
  };

  // NEXT BUTTON: Handle screen submission and move forward
  const handleNext = async (submittedData) => {
    console.log('▶️ NEXT: Screen submitted:', submittedData);
    
    // Store screen data in execution context as Screen.<field>
    const updatedContext = {
      ...executionContext,
      ...submittedData
    };
    setExecutionContext(updatedContext);
    
    // Store screen data for restoration if user clicks Previous
    setScreenData(prev => ({
      ...prev,
      [currentNodeId]: submittedData
    }));
    
    // Add current screen to history stack for Previous navigation
    setScreenHistory(prev => [...prev, currentNodeId]);
    
    // Add to execution history (for summary display)
    setExecutionHistory(prev => [...prev, {
      nodeId: currentNodeId,
      type: 'screen',
      data: submittedData,
      timestamp: new Date()
    }]);
    
    // Find next node via edges
    const nextNode = await findNextNode(currentNodeId, updatedContext);
    
    if (!nextNode) {
      // No next node - flow complete
      setIsComplete(true);
      console.log('🏁 Flow completed');
      return;
    }
    
    console.log('➡️ Moving to next node:', nextNode.id, 'Type:', nextNode.type || nextNode.data?.nodeType);
    
    // Process next node (evaluate decisions, execute actions, render screens)
    await processNode(nextNode, updatedContext);
  };

  // PREVIOUS BUTTON: Navigate back without re-executing logic
  const handlePrevious = () => {
    console.log('◀️ PREVIOUS: Navigating back');
    
    if (screenHistory.length === 0) {
      console.warn('⚠️ No previous screen in history');
      return;
    }
    
    // Pop from screen history stack
    const previousScreenId = screenHistory[screenHistory.length - 1];
    setScreenHistory(prev => prev.slice(0, -1));
    
    // Navigate to previous screen
    setCurrentNodeId(previousScreenId);
    
    // Context remains unchanged (no re-execution of actions/decisions)
    // Screen data will be restored in ScreenRenderer via screenData[previousScreenId]
    console.log('✅ Moved back to screen:', previousScreenId);
  };

  // FINISH BUTTON: Save data, execute remaining nodes, complete flow
  const handleFinish = async (submittedData) => {
    console.log('🏁 FINISH: Completing flow');
    
    // Store final screen data
    const updatedContext = {
      ...executionContext,
      ...submittedData
    };
    setExecutionContext(updatedContext);
    
    // Store screen data
    setScreenData(prev => ({
      ...prev,
      [currentNodeId]: submittedData
    }));
    
    // Add to execution history
    setExecutionHistory(prev => [...prev, {
      nodeId: currentNodeId,
      type: 'screen',
      data: submittedData,
      timestamp: new Date()
    }]);
    
    // Find and execute any remaining non-screen nodes after this screen
    const nextNode = await findNextNode(currentNodeId, updatedContext);
    
    if (nextNode) {
      // Process remaining nodes (actions, assignments, etc.) but not screens
      await processRemainingNodes(nextNode, updatedContext);
    }
    
    // Mark flow as complete
    setIsComplete(true);
    console.log('✅ Flow execution finished');
  };

  // Find next node via edges
  const findNextNode = (fromNodeId, context) => {
    const edges = flow.edges || [];
    const nodes = flow.nodes || [];
    
    // Find outgoing edges from current node
    const outgoingEdges = edges.filter(e => e.source === fromNodeId);
    
    if (outgoingEdges.length === 0) {
      console.log('No outgoing edges - end of flow');
      return null;
    }
    
    // For now, take first edge (decision logic will handle multiple)
    const nextEdge = outgoingEdges[0];
    const nextNode = nodes.find(n => n.id === nextEdge.target);
    
    return nextNode;
  };

  // Process a node based on its type (used for Next button flow)
  const processNode = async (node, context) => {
    const nodeType = node.type || node.data?.nodeType;
    
    console.log('🔄 Processing node:', node.id, 'Type:', nodeType);
    
    switch (nodeType) {
      case 'screen':
        // Render next screen (stops here, waits for user input)
        setCurrentNodeId(node.id);
        break;
        
      case 'decision':
        // Evaluate decision and move to appropriate outcome
        // IMPORTANT: Decisions are evaluated, not stored in history (Previous skips them)
        const outcomeNode = await evaluateDecision(node, context);
        if (outcomeNode) {
          await processNode(outcomeNode, context);
        } else {
          setIsComplete(true);
        }
        break;
        
      case 'mcp':
      case 'action':
        // Execute action (e.g., create record)
        const actionResult = await executeAction(node, context);
        
        // Add to history
        setExecutionHistory(prev => [...prev, {
          nodeId: node.id,
          type: 'action',
          result: actionResult,
          timestamp: new Date()
        }]);
        
        // Move to next node automatically
        const nextNode = await findNextNode(node.id, context);
        if (nextNode) {
          await processNode(nextNode, context);
        } else {
          setIsComplete(true);
        }
        break;
        
      case 'end':
      case 'screen_flow_end':
        // Flow complete
        setIsComplete(true);
        console.log('🏁 Reached end node');
        break;
        
      case 'add_error':
      case 'custom_error':
        // Add Error node - stop flow and show error
        const errorResult = await executeAddError(node, context);
        
        // Add to history
        setExecutionHistory(prev => [...prev, {
          nodeId: node.id,
          type: 'error',
          result: errorResult,
          timestamp: new Date()
        }]);
        
        // Stop flow execution - error is terminal
        setError({
          title: errorResult.errorLabel || 'Flow Error',
          description: errorResult.message,
          suggestion: 'Please review your input and try again.',
          errorCode: 'CUSTOM_ERROR'
        });
        setIsComplete(true);
        console.log('❌ Add Error node triggered - flow stopped');
        break;
        
      case 'delay':
        // Delay node - pause execution
        const delayResult = await executeDelay(node, context);
        
        // Add to history
        setExecutionHistory(prev => [...prev, {
          nodeId: node.id,
          type: 'delay',
          result: delayResult,
          timestamp: new Date()
        }]);
        
        if (delayResult.status === 'immediate') {
          // Continue immediately (delay was 0 or past)
          const nextDelayNode = await findNextNode(node.id, context);
          if (nextDelayNode) {
            await processNode(nextDelayNode, context);
          } else {
            setIsComplete(true);
          }
        } else {
          // Delay is in effect - show waiting state
          toast(`Flow paused for ${delayResult.displayDuration}`, {
            icon: 'ℹ️',
            description: `Will resume at ${new Date(delayResult.resumeAt).toLocaleString()}`,
            duration: 5000
          });
          setIsComplete(true);
          console.log('⏸️ Delay node - execution paused');
        }
        break;
        
      case 'assignment':
        // Execute assignment
        const assignmentResult = await executeAssignment(node, context);
        const updatedCtx = { ...context, ...assignmentResult };
        setExecutionContext(updatedCtx);
        
        // Move to next automatically
        const nextAssignNode = await findNextNode(node.id, updatedCtx);
        if (nextAssignNode) {
          await processNode(nextAssignNode, updatedCtx);
        } else {
          setIsComplete(true);
        }
        break;
        
      default:
        console.warn('⚠️ Unknown node type:', nodeType);
        // Try to continue to next node anyway
        const fallbackNext = await findNextNode(node.id, context);
        if (fallbackNext) {
          await processNode(fallbackNext, context);
        } else {
          setIsComplete(true);
        }
    }
  };

  // Process remaining non-screen nodes for Finish button
  // Executes actions/assignments but stops at screens (flow ends)
  const processRemainingNodes = async (node, context) => {
    const nodeType = node.type || node.data?.nodeType;
    
    console.log('🔄 Processing remaining node:', node.id, 'Type:', nodeType);
    
    switch (nodeType) {
      case 'screen':
        // Stop at screens - Finish ends the flow
        console.log('⛔ Finish stops at screen nodes');
        return;
        
      case 'decision':
        // Evaluate and continue
        const outcomeNode = await evaluateDecision(node, context);
        if (outcomeNode) {
          await processRemainingNodes(outcomeNode, context);
        }
        break;
        
      case 'mcp':
      case 'action':
        // Execute action
        const actionResult = await executeAction(node, context);
        
        setExecutionHistory(prev => [...prev, {
          nodeId: node.id,
          type: 'action',
          result: actionResult,
          timestamp: new Date()
        }]);
        
        // Continue to next
        const nextNode = await findNextNode(node.id, context);
        if (nextNode) {
          await processRemainingNodes(nextNode, context);
        }
        break;
        
      case 'assignment':
        const assignmentResult = await executeAssignment(node, context);
        const updatedCtx = { ...context, ...assignmentResult };
        setExecutionContext(updatedCtx);
        
        const nextAssignNode = await findNextNode(node.id, updatedCtx);
        if (nextAssignNode) {
          await processRemainingNodes(nextAssignNode, updatedCtx);
        }
        break;
        
      case 'end':
      case 'screen_flow_end':
        console.log('✅ Reached end node');
        break;
        
      case 'add_error':
      case 'custom_error':
        // Add Error - stop flow and show error
        const errorResult = await executeAddError(node, context);
        setExecutionHistory(prev => [...prev, {
          nodeId: node.id,
          type: 'error',
          result: errorResult,
          timestamp: new Date()
        }]);
        setError({
          title: errorResult.errorLabel || 'Flow Error',
          description: errorResult.message,
          suggestion: 'Please review your input and try again.',
          errorCode: 'CUSTOM_ERROR'
        });
        console.log('❌ Add Error node - flow stopped');
        // DO NOT continue - error is terminal
        break;
        
      case 'delay':
        // Delay node
        const delayResult = await executeDelay(node, context);
        setExecutionHistory(prev => [...prev, {
          nodeId: node.id,
          type: 'delay',
          result: delayResult,
          timestamp: new Date()
        }]);
        
        if (delayResult.status === 'immediate') {
          // Continue immediately
          const nextDelayNode = await findNextNode(node.id, context);
          if (nextDelayNode) {
            await processRemainingNodes(nextDelayNode, context);
          }
        } else {
          toast(`Flow delayed for ${delayResult.displayDuration}`, { icon: 'ℹ️' });
          console.log('⏸️ Delay - execution paused');
        }
        break;
        
      default:
        console.warn('⚠️ Unknown node type:', nodeType);
        // Try to continue anyway
        const fallbackNext = await findNextNode(node.id, context);
        if (fallbackNext) {
          await processRemainingNodes(fallbackNext, context);
        }
    }
  };

  // Evaluate decision node - Salesforce-like multi-way branching
  const evaluateDecision = async (decisionNode, context) => {
    const config = decisionNode.data?.config || {};
    const outcomes = config.outcomes || [];
    const conditions = config.conditions || [];
    const logicType = config.logic || 'and';
    const edges = flow.edges || [];
    const nodes = flow.nodes || [];
    
    console.log('🔀 Evaluating decision with', outcomes.length, 'outcomes,', conditions.length, 'conditions');
    console.log('📊 Context keys:', Object.keys(context));
    
    // CASE 1: Simple IF format (conditions array without outcomes)
    if (conditions.length > 0 && outcomes.length === 0) {
      const results = [];
      
      for (let i = 0; i < conditions.length; i++) {
        const cond = conditions[i];
        const fieldKey = cond.field || '';
        const operator = cond.operator || 'equals';
        const expectedValue = cond.value;
        
        // Get actual value from context
        let actualValue = getContextValue(fieldKey, context);
        
        // Evaluate condition
        const result = evaluateOperator(actualValue, operator, expectedValue);
        results.push(result);
        
        console.log(`   Condition ${i+1}: ${fieldKey} ${operator} ${expectedValue}`);
        console.log(`   Actual: ${actualValue} → ${result ? '✅ TRUE' : '❌ FALSE'}`);
      }
      
      // Combine results based on logic type
      const finalResult = logicType === 'or' ? results.some(r => r) : results.every(r => r);
      console.log(`📊 Final Decision (${logicType.toUpperCase()}): ${finalResult ? '✅ TRUE' : '❌ FALSE'}`);
      
      // Find edge based on true/false label or first/second edge
      const decisionEdges = edges.filter(e => e.source === decisionNode.id);
      let targetEdge = null;
      
      if (finalResult) {
        // Look for edge labeled 'true', 'True', 'Yes', or first edge
        targetEdge = decisionEdges.find(e => 
          ['true', 'True', 'YES', 'Yes', 'true_path'].includes(e.label || e.sourceHandle)
        ) || decisionEdges[0];
      } else {
        // Look for edge labeled 'false', 'False', 'No', or second edge
        targetEdge = decisionEdges.find(e => 
          ['false', 'False', 'NO', 'No', 'false_path'].includes(e.label || e.sourceHandle)
        ) || decisionEdges[1] || decisionEdges[0];
      }
      
      if (targetEdge) {
        const targetNode = nodes.find(n => n.id === targetEdge.target);
        console.log('➡️ Taking path to:', targetNode?.id);
        return targetNode;
      }
      
      return null;
    }
    
    // CASE 2: Multi-outcome format (Salesforce-like)
    let selectedOutcome = null;
    
    for (const outcome of outcomes) {
      // Skip default for now
      if (outcome.isDefault) continue;
      
      const outcomeConditions = outcome.conditions || [];
      const matchType = outcome.matchType || 'all'; // all = AND, any = OR
      
      // If no conditions, evaluate as simple expression
      if (outcomeConditions.length === 0) {
        const condition = outcome.condition || outcome.criteria;
        if (condition && evaluateSimpleCondition(condition, context)) {
          selectedOutcome = outcome;
          console.log('✅ Outcome matched (simple):', outcome.label);
          break;
        }
        continue;
      }
      
      // Evaluate outcome conditions
      const condResults = [];
      for (const cond of outcomeConditions) {
        const fieldKey = cond.field || '';
        const operator = cond.operator || 'equals';
        const expectedValue = cond.value;
        
        let actualValue = getContextValue(fieldKey, context);
        const result = evaluateOperator(actualValue, operator, expectedValue);
        condResults.push(result);
        
        console.log(`   [${outcome.label}] ${fieldKey} ${operator} ${expectedValue} → ${result ? '✅' : '❌'}`);
      }
      
      const outcomeMatched = matchType === 'any' 
        ? condResults.some(r => r) 
        : condResults.every(r => r);
      
      if (outcomeMatched) {
        selectedOutcome = outcome;
        console.log('✅ Outcome matched:', outcome.label);
        break;
      }
    }
    
    // If no outcome matched, use default
    if (!selectedOutcome) {
      selectedOutcome = outcomes.find(o => o.isDefault);
      console.log('📌 Using default outcome:', selectedOutcome?.label || 'None');
    }
    
    if (!selectedOutcome) {
      console.error('❌ No valid outcome found');
      // Try to find any edge and continue
      const anyEdge = edges.find(e => e.source === decisionNode.id);
      if (anyEdge) {
        return nodes.find(n => n.id === anyEdge.target);
      }
      return null;
    }
    
    // Find edge with this outcome's label or name
    const outcomeEdge = edges.find(e => 
      e.source === decisionNode.id && 
      (e.label === selectedOutcome.label || e.label === selectedOutcome.name || e.sourceHandle === selectedOutcome.name)
    );
    
    if (!outcomeEdge) {
      // Fallback: find any edge from decision node
      const fallbackEdge = edges.find(e => e.source === decisionNode.id);
      console.warn('⚠️ No labeled edge found for outcome, using fallback');
      if (fallbackEdge) {
        return nodes.find(n => n.id === fallbackEdge.target);
      }
      console.error('❌ No edge found for outcome:', selectedOutcome.label);
      return null;
    }
    
    const targetNode = nodes.find(n => n.id === outcomeEdge.target);
    console.log('➡️ Decision → Taking path to:', targetNode?.id);
    return targetNode;
  };

  // Get value from context with support for nested paths
  const getContextValue = (fieldKey, context) => {
    if (!fieldKey) return null;
    
    // Direct lookup first
    if (context[fieldKey] !== undefined) {
      return context[fieldKey];
    }
    
    // Try with Screen. prefix
    if (context[`Screen.${fieldKey}`] !== undefined) {
      return context[`Screen.${fieldKey}`];
    }
    
    // Handle nested paths like "Screen.email", "Trigger.Lead.Name", "Record.status"
    const parts = fieldKey.split('.');
    let value = context;
    
    for (const part of parts) {
      if (value === null || value === undefined) return null;
      if (typeof value === 'object') {
        value = value[part];
      } else {
        return null;
      }
    }
    
    return value;
  };

  // Evaluate operator between actual and expected values
  const evaluateOperator = (actual, operator, expected) => {
    // Normalize operator names
    const op = (operator || 'equals').toLowerCase().replace(/_/g, '').replace(/\s/g, '');
    
    // Handle null/undefined actual values
    if (actual === null || actual === undefined) {
      if (['isnull', 'isempty', 'isblank'].includes(op)) return true;
      if (['isnotnull', 'isnotempty', 'isnotblank'].includes(op)) return false;
      return false;
    }
    
    // Convert to comparable types
    const actualStr = String(actual).toLowerCase();
    const expectedStr = expected !== null && expected !== undefined ? String(expected).toLowerCase() : '';
    const actualNum = parseFloat(actual);
    const expectedNum = parseFloat(expected);
    
    switch (op) {
      case 'equals':
      case 'equal':
      case 'eq':
      case '=':
      case '==':
        return actualStr === expectedStr;
        
      case 'notequals':
      case 'notequal':
      case 'noteq':
      case 'ne':
      case '!=':
      case '<>':
        return actualStr !== expectedStr;
        
      case 'contains':
      case 'like':
        return actualStr.includes(expectedStr);
        
      case 'notcontains':
      case 'doesnotcontain':
        return !actualStr.includes(expectedStr);
        
      case 'startswith':
      case 'beginswith':
        return actualStr.startsWith(expectedStr);
        
      case 'endswith':
        return actualStr.endsWith(expectedStr);
        
      case 'greaterthan':
      case 'gt':
      case '>':
        return !isNaN(actualNum) && !isNaN(expectedNum) && actualNum > expectedNum;
        
      case 'lessthan':
      case 'lt':
      case '<':
        return !isNaN(actualNum) && !isNaN(expectedNum) && actualNum < expectedNum;
        
      case 'greaterthanorequal':
      case 'gte':
      case '>=':
        return !isNaN(actualNum) && !isNaN(expectedNum) && actualNum >= expectedNum;
        
      case 'lessthanorequal':
      case 'lte':
      case '<=':
        return !isNaN(actualNum) && !isNaN(expectedNum) && actualNum <= expectedNum;
        
      case 'isnull':
      case 'isempty':
      case 'isblank':
        return actual === null || actual === undefined || actual === '';
        
      case 'isnotnull':
      case 'isnotempty':
      case 'isnotblank':
        return actual !== null && actual !== undefined && actual !== '';
        
      default:
        console.warn('Unknown operator:', operator);
        return false;
    }
  };

  // Evaluate simple condition expression (legacy support)
  const evaluateSimpleCondition = (condition, context) => {
    try {
      // Replace {{variable}} with actual values
      let expression = condition;
      
      // Find all {{...}} patterns
      const matches = expression.match(/\{\{([^}]+)\}\}/g);
      if (matches) {
        matches.forEach(match => {
          const varName = match.replace(/\{\{|\}\}/g, '').trim();
          const value = getContextValue(varName, context);
          
          // Replace with actual value
          if (typeof value === 'string') {
            expression = expression.replace(match, `"${value}"`);
          } else if (value === null || value === undefined) {
            expression = expression.replace(match, 'null');
          } else {
            expression = expression.replace(match, value);
          }
        });
      }
      
      // Pattern: value != null or value !== null
      if (expression.includes('!= null') || expression.includes('!== null')) {
        const parts = expression.split(/!==?\s*null/);
        const value = parts[0].trim().replace(/"/g, '');
        return value !== 'null' && value !== '' && value !== undefined;
      }
      
      // Pattern: value == "something" or value === "something"
      if (expression.includes('==')) {
        const parts = expression.split(/===?/);
        const left = parts[0].trim().replace(/"/g, '');
        const right = parts[1].trim().replace(/"/g, '');
        return left === right;
      }
      
      // Pattern: value > number
      if (expression.includes('>') && !expression.includes('==') && !expression.includes('>=')) {
        const parts = expression.split('>');
        const left = parseFloat(parts[0].trim());
        const right = parseFloat(parts[1].trim());
        return !isNaN(left) && !isNaN(right) && left > right;
      }
      
      // Pattern: value >= number
      if (expression.includes('>=')) {
        const parts = expression.split('>=');
        const left = parseFloat(parts[0].trim());
        const right = parseFloat(parts[1].trim());
        return !isNaN(left) && !isNaN(right) && left >= right;
      }
      
      // Pattern: value < number
      if (expression.includes('<') && !expression.includes('==') && !expression.includes('<=')) {
        const parts = expression.split('<');
        const left = parseFloat(parts[0].trim());
        const right = parseFloat(parts[1].trim());
        return !isNaN(left) && !isNaN(right) && left < right;
      }
      
      // Pattern: value <= number
      if (expression.includes('<=')) {
        const parts = expression.split('<=');
        const left = parseFloat(parts[0].trim());
        const right = parseFloat(parts[1].trim());
        return !isNaN(left) && !isNaN(right) && left <= right;
      }
      
      console.log('⚠️ Could not evaluate condition:', expression);
      return false;
    } catch (err) {
      console.error('Error evaluating condition:', err);
      return false;
    }
  };

  // Execute Add Error node - stop flow and show error message
  const executeAddError = async (node, context) => {
    const config = node.data?.config || {};
    const errorLabel = config.label || config.errorLabel || 'Custom Error';
    const apiName = config.api_name || config.apiName || node.id;
    
    // Get error messages (support both array and single message)
    let errorMessages = config.errorMessages || [];
    if (errorMessages.length === 0) {
      const singleMessage = config.errorMessage || config.error_message || 'An error occurred in the flow';
      const displayMode = config.displayMode || 'window';
      const targetField = config.targetField;
      errorMessages = [{ type: displayMode, field: targetField, message: singleMessage }];
    }
    
    // Process and substitute variables in messages
    const processedErrors = [];
    for (const err of errorMessages) {
      let message = err.message || '';
      
      // Substitute variables
      const varMatches = message.match(/\{\{([^}]+)\}\}/g);
      if (varMatches) {
        varMatches.forEach(match => {
          const varName = match.replace(/\{\{|\}\}/g, '').trim();
          const value = getContextValue(varName, context) || '';
          message = message.replace(match, value);
        });
      }
      
      processedErrors.push({
        type: err.type || 'window',
        field: err.field,
        message: message
      });
    }
    
    // Show toast for each error
    processedErrors.forEach(err => {
      if (err.type === 'window' || !err.type) {
        toast.error(errorLabel, {
          description: err.message,
          duration: 8000
        });
      }
    });
    
    const combinedMessage = processedErrors.map(e => e.message).join(' | ');
    
    console.log('❌ Add Error:', errorLabel, '-', combinedMessage);
    
    return {
      success: false,
      errorLabel: errorLabel,
      apiName: apiName,
      message: combinedMessage,
      errors: processedErrors
    };
  };

  // Execute Delay node - pause execution
  const executeDelay = async (node, context) => {
    const config = node.data?.config || {};
    const delayMode = config.delay_mode || config.delayMode || 'duration';
    
    let delaySeconds = 0;
    let resumeAt = null;
    let displayDuration = '';
    
    if (delayMode === 'duration') {
      const durationValue = parseInt(config.duration_value || config.durationValue || 0);
      const durationUnit = config.duration_unit || config.durationUnit || 'minutes';
      
      // Convert to seconds
      const unitSeconds = {
        minutes: 60,
        hours: 3600,
        days: 86400,
        weeks: 604800
      };
      
      delaySeconds = durationValue * (unitSeconds[durationUnit] || 60);
      displayDuration = `${durationValue} ${durationUnit}`;
      resumeAt = new Date(Date.now() + delaySeconds * 1000).toISOString();
      
    } else if (delayMode === 'fixed') {
      const executeDate = config.execute_date || config.executeDate;
      const executeTime = config.execute_time || config.executeTime || '00:00';
      
      if (executeDate) {
        resumeAt = new Date(`${executeDate}T${executeTime}:00`).toISOString();
        delaySeconds = Math.max(0, (new Date(resumeAt) - new Date()) / 1000);
        displayDuration = `until ${executeDate} ${executeTime}`;
      }
      
    } else if (delayMode === 'field') {
      const fieldReference = config.fieldReference;
      if (fieldReference) {
        const fieldValue = getContextValue(fieldReference, context);
        if (fieldValue) {
          resumeAt = new Date(fieldValue).toISOString();
          delaySeconds = Math.max(0, (new Date(resumeAt) - new Date()) / 1000);
          displayDuration = `until ${fieldReference}`;
        }
      }
    }
    
    console.log('⏱️ Delay:', displayDuration, '- Resume at:', resumeAt);
    
    // If delay is 0 or past, continue immediately
    if (delaySeconds <= 0) {
      return {
        status: 'immediate',
        delaySeconds: 0,
        displayDuration: 'none (immediate)',
        resumeAt: null
      };
    }
    
    return {
      status: 'waiting',
      delaySeconds: delaySeconds,
      displayDuration: displayDuration,
      resumeAt: resumeAt
    };
  };

  // Execute action node (create record, etc.)
  const executeAction = async (node, context) => {
    const config = node.data?.config || {};
    const actionType = config.action_type || config.mcp_action;
    const nodeName = node.data?.label || node.data?.config?.label || 'Action';
    
    console.log('⚡ Executing action:', actionType);
    
    try {
      if (actionType === 'create' || actionType === 'crm.record.create') {
        // Create record
        const object = config.entity || config.object;
        
        // Convert field_values array to fields object
        let fields = {};
        if (config.field_values && Array.isArray(config.field_values)) {
          config.field_values.forEach(fv => {
            if (fv.field && fv.value !== undefined) {
              fields[fv.field] = fv.value;
            }
          });
        } else if (config.fields) {
          // Legacy support for direct fields object
          fields = config.fields;
        }
        
        // Resolve variables in field values
        fields = resolveVariables(fields, context);
        
        console.log('Creating', object, 'with fields:', fields);
        
        // Call backend API
        const response = await axios.post(
          `${API}/api/crm/${object.toLowerCase()}`,
          fields
        );
        
        console.log('✅ Record created:', response.data);
        return { success: true, recordId: response.data.id };
      }
      
      if (actionType === 'update' || actionType === 'crm.record.update') {
        // Update record
        const object = config.entity || config.object;
        const recordId = resolveVariables({ id: config.recordId || config.record_id }, context).id;
        
        // Convert field_values array to fields object
        let fields = {};
        if (config.field_values && Array.isArray(config.field_values)) {
          config.field_values.forEach(fv => {
            if (fv.field && fv.value !== undefined) {
              fields[fv.field] = fv.value;
            }
          });
        } else if (config.fields) {
          fields = config.fields;
        }
        
        // Resolve variables in field values
        fields = resolveVariables(fields, context);
        
        const response = await axios.patch(
          `${API}/api/crm/${object.toLowerCase()}/${recordId}`,
          fields
        );
        
        console.log('✅ Record updated:', response.data);
        return { success: true, recordId };
      }
      
      if (actionType === 'delete' || actionType === 'crm.record.delete') {
        // Delete record
        const object = config.entity || config.object;
        const recordId = resolveVariables({ id: config.recordId }, context).id;
        
        await axios.delete(`${API}/api/crm/${object.toLowerCase()}/${recordId}`);
        
        console.log('✅ Record deleted');
        return { success: true };
      }

      // Bulk update support (C4/C5)
      if (actionType === 'bulk_update' || actionType === 'crm.record.bulk_update') {
        const object = config.entity || config.object;
        let recordIds = [];
        
        // Get record IDs from variable
        if (config.record_ids_variable) {
          const resolved = resolveVariables({ ids: config.record_ids_variable }, context);
          recordIds = Array.isArray(resolved.ids) ? resolved.ids : [];
        } else if (config.record_ids) {
          recordIds = Array.isArray(config.record_ids) ? config.record_ids : [config.record_ids];
        }
        
        // Convert field_values to updates object
        let updates = {};
        if (config.field_values && Array.isArray(config.field_values)) {
          config.field_values.forEach(fv => {
            if (fv.field && fv.value !== undefined) {
              updates[fv.field] = fv.value;
            }
          });
        } else if (config.updates) {
          updates = config.updates;
        }
        
        // Resolve variables in updates
        updates = resolveVariables(updates, context);
        
        console.log('Bulk updating', object, 'records:', recordIds.length, 'with updates:', updates);
        
        const response = await axios.post(
          `${API}/api/crm/${object.toLowerCase()}/bulk-update`,
          { record_ids: recordIds, updates }
        );
        
        console.log('✅ Bulk update complete:', response.data);
        return { 
          success: true, 
          updatedCount: response.data.updated_count,
          totalRequested: response.data.total_requested
        };
      }

      // Get records (for displaying in table - C4)
      if (actionType === 'get_records' || actionType === 'crm.record.get_records') {
        const object = config.entity || config.object;
        let filter = config.filter || {};
        
        // Resolve variables in filter
        filter = resolveVariables(filter, context);
        
        // Support parent ID filter (e.g., get contacts for account)
        if (config.parent_field && config.parent_id) {
          const parentId = resolveVariables({ id: config.parent_id }, context).id;
          filter[config.parent_field] = parentId;
        }
        
        const response = await axios.get(`${API}/api/crm/${object.toLowerCase()}`, {
          params: { limit: config.limit || 50, skip: config.skip || 0 }
        });
        
        console.log('✅ Records retrieved:', response.data.records?.length);
        return { 
          success: true, 
          records: response.data.records || [],
          total: response.data.total
        };
      }

      // Get records by IDs (C5)
      if (actionType === 'get_records_by_ids' || actionType === 'crm.record.get_by_ids') {
        const object = config.entity || config.object;
        let recordIds = [];
        
        // Get record IDs from variable
        if (config.record_ids_variable) {
          const resolved = resolveVariables({ ids: config.record_ids_variable }, context);
          recordIds = Array.isArray(resolved.ids) ? resolved.ids : [];
        } else if (config.record_ids) {
          recordIds = Array.isArray(config.record_ids) ? config.record_ids : [config.record_ids];
        }
        
        const response = await axios.post(`${API}/api/crm/${object.toLowerCase()}/get-by-ids`, {
          ids: recordIds
        });
        
        console.log('✅ Records by IDs retrieved:', response.data.records?.length);
        return { 
          success: true, 
          records: response.data.records || [],
          found: response.data.found
        };
      }
      
      // =====================================================
      // CUSTOM API CALL ACTION (for Assign Technician, etc.)
      // =====================================================
      if (actionType === 'api_call' || actionType === 'http_request') {
        const endpoint = config.endpoint || config.url;
        const method = (config.method || 'POST').toUpperCase();
        
        // Build payload from config
        let payload = {};
        if (config.payload_mapping && Array.isArray(config.payload_mapping)) {
          config.payload_mapping.forEach(pm => {
            const fieldName = pm.target_field || pm.field;
            let value = pm.source_variable || pm.value;
            
            // Resolve variable from context
            if (typeof value === 'string' && value.startsWith('{{') && value.endsWith('}}')) {
              const varPath = value.slice(2, -2).trim();
              value = getContextValue(varPath, context);
            } else if (typeof value === 'string') {
              // Check if it's a context key
              const resolved = context[value] || context[`Screen.${value}`];
              if (resolved !== undefined) {
                value = resolved;
              }
            }
            
            payload[fieldName] = value;
          });
        } else if (config.payload) {
          // Direct payload object
          payload = resolveVariables(config.payload, context);
        }
        
        console.log(`📡 API Call: ${method} ${endpoint}`);
        console.log('📦 Payload:', JSON.stringify(payload, null, 2));
        
        const token = localStorage.getItem('token');
        const headers = {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        };
        
        let response;
        if (method === 'GET') {
          response = await axios.get(`${API}${endpoint}`, { headers, params: payload });
        } else if (method === 'POST') {
          response = await axios.post(`${API}${endpoint}`, payload, { headers });
        } else if (method === 'PUT') {
          response = await axios.put(`${API}${endpoint}`, payload, { headers });
        } else if (method === 'PATCH') {
          response = await axios.patch(`${API}${endpoint}`, payload, { headers });
        } else if (method === 'DELETE') {
          response = await axios.delete(`${API}${endpoint}`, { headers, data: payload });
        }
        
        console.log('✅ API Response:', response.data);
        
        // Store output in context if configured
        if (config.output_variable && response.data) {
          return { 
            success: true, 
            data: response.data,
            [config.output_variable]: response.data
          };
        }
        
        return { success: true, data: response.data };
      }
      
      // Create Service Appointment action (specific for Field Service flows)
      if (actionType === 'create_service_appointment') {
        const workOrderId = resolveVariables({ id: config.work_order_id }, context).id;
        const subject = resolveVariables({ s: config.subject || 'Service Appointment' }, context).s;
        const startTime = resolveVariables({ t: config.start_time }, context).t;
        const endTime = resolveVariables({ t: config.end_time }, context).t;
        
        const token = localStorage.getItem('token');
        const response = await axios.post(
          `${API}/api/service-appointments`,
          {
            data: {
              subject,
              work_order_id: workOrderId,
              status: 'None',
              start_time: startTime,
              end_time: endTime
            }
          },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        
        console.log('✅ Service Appointment created:', response.data);
        return { 
          success: true, 
          serviceAppointmentId: response.data.id,
          data: response.data
        };
      }
      
      // Helper to get context value
      function getContextValue(fieldKey, ctx) {
        if (!fieldKey) return null;
        if (ctx[fieldKey] !== undefined) return ctx[fieldKey];
        if (ctx[`Screen.${fieldKey}`] !== undefined) return ctx[`Screen.${fieldKey}`];
        
        const parts = fieldKey.split('.');
        let value = ctx;
        for (const part of parts) {
          if (value === null || value === undefined) return null;
          if (typeof value === 'object') value = value[part];
          else return null;
        }
        return value;
      }
      
      // =====================================================
      // END CUSTOM ACTION TYPES
      // =====================================================
      
      // Other action types can be added here
      console.log('⚠️ Action type not implemented:', actionType);
      return { success: false, error: 'Action not implemented' };
    } catch (err) {
      console.error('❌ Action execution failed:', err);
      
      // Create user-friendly error message
      const errorContext = parseFlowError(err, {
        nodeName,
        actionType,
        object: config.entity || config.object
      });
      
      // Show actionable error toast
      toast.error(errorContext.title, {
        description: errorContext.description,
        duration: 8000
      });
      
      // Set error state to show in UI
      setError(errorContext);
      
      return { success: false, error: errorContext.description };
    }
  };
  
  // Parse errors into user-friendly messages
  const parseFlowError = (err, context) => {
    const { nodeName, actionType, object } = context;
    const statusCode = err.response?.status;
    const errorData = err.response?.data;
    const errorDetail = errorData?.detail || errorData?.message || err.message;
    
    // Default error structure
    let title = 'Flow Error';
    let description = 'An unexpected error occurred';
    let suggestion = 'Please try again or contact support';
    let errorCode = 'UNKNOWN_ERROR';
    
    // HTTP status-based errors
    if (statusCode === 400) {
      title = `Invalid Data in "${nodeName}"`;
      description = `The ${object || 'record'} could not be ${actionType === 'create' ? 'created' : 'processed'} due to invalid data.`;
      suggestion = 'Please check the field values and try again.';
      errorCode = 'VALIDATION_ERROR';
      
      // Parse specific field errors
      if (errorData?.errors || errorDetail) {
        const fieldErrors = errorData?.errors || [];
        if (Array.isArray(fieldErrors) && fieldErrors.length > 0) {
          description = `Validation failed: ${fieldErrors.map(e => e.message || e).join(', ')}`;
        } else if (typeof errorDetail === 'string') {
          description = errorDetail;
        }
      }
    } else if (statusCode === 401) {
      title = 'Authentication Required';
      description = 'Your session has expired. Please log in again to continue.';
      suggestion = 'Click "Exit" and log in again.';
      errorCode = 'AUTH_ERROR';
    } else if (statusCode === 403) {
      title = 'Permission Denied';
      description = `You don't have permission to ${actionType === 'create' ? 'create' : actionType === 'update' ? 'update' : actionType === 'delete' ? 'delete' : 'access'} ${object || 'this record'}.`;
      suggestion = 'Contact your administrator for access.';
      errorCode = 'PERMISSION_ERROR';
    } else if (statusCode === 404) {
      title = 'Record Not Found';
      description = `The ${object || 'record'} you're trying to ${actionType === 'update' ? 'update' : actionType === 'delete' ? 'delete' : 'access'} no longer exists.`;
      suggestion = 'The record may have been deleted. Please refresh and try again.';
      errorCode = 'NOT_FOUND';
    } else if (statusCode === 409) {
      title = 'Duplicate Record';
      description = `A ${object || 'record'} with these values already exists.`;
      suggestion = 'Please check for existing records or use different values.';
      errorCode = 'DUPLICATE_ERROR';
    } else if (statusCode === 422) {
      title = `Data Processing Error in "${nodeName}"`;
      description = errorDetail || `Could not process the ${object || 'record'} data.`;
      suggestion = 'Please verify the field mappings in the flow configuration.';
      errorCode = 'PROCESSING_ERROR';
    } else if (statusCode >= 500) {
      title = 'Server Error';
      description = `The server encountered an error while processing "${nodeName}".`;
      suggestion = 'Please try again in a few moments. If the problem persists, contact support.';
      errorCode = 'SERVER_ERROR';
    } else if (err.code === 'ECONNABORTED' || err.message.includes('timeout')) {
      title = 'Request Timeout';
      description = `The operation "${nodeName}" took too long to complete.`;
      suggestion = 'Please try again. If processing large amounts of data, consider breaking it into smaller batches.';
      errorCode = 'TIMEOUT_ERROR';
    } else if (err.code === 'ERR_NETWORK' || !navigator.onLine) {
      title = 'Network Error';
      description = 'Unable to connect to the server. Please check your internet connection.';
      suggestion = 'Verify your internet connection and try again.';
      errorCode = 'NETWORK_ERROR';
    }
    
    return {
      title,
      description,
      suggestion,
      errorCode,
      nodeName,
      raw: errorDetail
    };
  };

  // Execute assignment node
  const executeAssignment = async (node, context) => {
    const config = node.data?.config || {};
    const assignments = config.assignments || [];
    
    const result = {};
    
    assignments.forEach(assignment => {
      const varName = assignment.variable;
      let value = assignment.value;
      
      // Resolve variables in value
      if (typeof value === 'string') {
        value = resolveVariables({ temp: value }, context).temp;
      }
      
      result[varName] = value;
      console.log('📝 Assignment:', varName, '=', value);
    });
    
    return result;
  };

  // Resolve {{variable}} references in object
  const resolveVariables = (obj, context) => {
    if (typeof obj === 'string') {
      let result = obj;
      
      // Handle CONCAT(val1, val2, ...) function
      const concatMatches = result.match(/CONCAT\(([^)]+)\)/gi);
      if (concatMatches) {
        concatMatches.forEach(match => {
          const argsStr = match.replace(/CONCAT\(/i, '').replace(/\)$/, '');
          const args = parseExpressionArgs(argsStr);
          const parts = args.map(arg => {
            const trimmed = arg.trim();
            // Remove quotes
            if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || 
                (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
              return trimmed.slice(1, -1);
            }
            // Resolve variable
            if (trimmed.startsWith('{{') && trimmed.endsWith('}}')) {
              const varName = trimmed.slice(2, -2).trim();
              return getContextValue(varName, context) || '';
            }
            // Try direct context lookup
            return getContextValue(trimmed, context) || trimmed;
          });
          result = result.replace(match, parts.join(''));
        });
      }
      
      // Handle JOIN(collection, separator) function
      const joinMatches = result.match(/JOIN\(([^)]+)\)/gi);
      if (joinMatches) {
        joinMatches.forEach(match => {
          const argsStr = match.replace(/JOIN\(/i, '').replace(/\)$/, '');
          const args = parseExpressionArgs(argsStr);
          if (args.length >= 1) {
            const collectionRef = args[0].trim();
            const separator = args.length > 1 ? args[1].trim().replace(/^["']|["']$/g, '') : ', ';
            
            let collection = null;
            if (collectionRef.startsWith('{{') && collectionRef.endsWith('}}')) {
              const varName = collectionRef.slice(2, -2).trim();
              collection = getContextValue(varName, context);
            } else {
              collection = getContextValue(collectionRef, context);
            }
            
            let joined = '';
            if (Array.isArray(collection)) {
              const items = collection.map(item => {
                if (typeof item === 'object') {
                  return item.name || item.Name || item.first_name || item.firstName || item.title || item.label || String(item);
                }
                return String(item);
              });
              joined = items.join(separator);
            } else if (collection) {
              joined = String(collection);
            }
            
            result = result.replace(match, joined);
          }
        });
      }
      
      // Handle TEXT(value) function - convert to string
      const textMatches = result.match(/TEXT\(([^)]+)\)/gi);
      if (textMatches) {
        textMatches.forEach(match => {
          const inner = match.replace(/TEXT\(/i, '').replace(/\)$/, '').trim();
          const value = resolveVariables(inner, context);
          result = result.replace(match, String(value || ''));
        });
      }
      
      // Replace {{var}} patterns with actual values
      const varMatches = result.match(/\{\{([^}]+)\}\}/g);
      if (varMatches) {
        varMatches.forEach(match => {
          const varName = match.replace(/\{\{|\}\}/g, '').trim();
          const value = getContextValue(varName, context);
          result = result.replace(match, value !== null && value !== undefined ? String(value) : '');
        });
      }
      
      // Handle string concatenation with + operator
      // Pattern: "text" + {{var}} + "more text"
      if (result.includes(' + ')) {
        // Check if this looks like a string concatenation expression
        const hasQuotes = result.includes('"') || result.includes("'");
        const hasVariables = result.includes('{{') || Object.keys(context).some(k => result.includes(k));
        
        if (hasQuotes || hasVariables) {
          const parts = result.split(/\s*\+\s*/);
          const concatenatedParts = parts.map(part => {
            const trimmed = part.trim();
            // String literal
            if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || 
                (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
              return trimmed.slice(1, -1);
            }
            // Already resolved (no brackets)
            return trimmed;
          });
          result = concatenatedParts.join('');
        }
      }
      
      // Simple space-separated variable expansion (e.g., "{{firstName}} {{lastName}}")
      // This happens after {{var}} replacement, so just return the result
      
      return result;
    } else if (Array.isArray(obj)) {
      return obj.map(item => resolveVariables(item, context));
    } else if (typeof obj === 'object' && obj !== null) {
      const resolved = {};
      for (const key in obj) {
        resolved[key] = resolveVariables(obj[key], context);
      }
      return resolved;
    }
    
    return obj;
  };

  // Helper: Parse expression arguments, handling quotes and nested parens
  const parseExpressionArgs = (argsStr) => {
    const args = [];
    let current = '';
    let parenDepth = 0;
    let inQuotes = false;
    let quoteChar = null;
    
    for (const char of argsStr) {
      if ((char === '"' || char === "'") && !inQuotes) {
        inQuotes = true;
        quoteChar = char;
        current += char;
      } else if (char === quoteChar && inQuotes) {
        inQuotes = false;
        quoteChar = null;
        current += char;
      } else if (char === '(' && !inQuotes) {
        parenDepth++;
        current += char;
      } else if (char === ')' && !inQuotes) {
        parenDepth--;
        current += char;
      } else if (char === ',' && parenDepth === 0 && !inQuotes) {
        args.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    
    if (current.trim()) {
      args.push(current.trim());
    }
    
    return args;
  };

  // Render current state
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading flow...</p>
        </div>
      </div>
    );
  }

  if (error) {
    // Support both string errors (legacy) and structured errors (new)
    const errorInfo = typeof error === 'string' 
      ? { title: 'Error', description: error, suggestion: 'Please try again.', errorCode: 'UNKNOWN' }
      : error;
    
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg overflow-hidden">
          {/* Error Header */}
          <div className="bg-red-50 border-b border-red-100 px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                <AlertCircle className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-red-900">{errorInfo.title}</h2>
                <span className="text-xs font-mono text-red-400">{errorInfo.errorCode}</span>
              </div>
            </div>
          </div>
          
          {/* Error Details */}
          <div className="p-6 space-y-4">
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-1">What happened</h3>
              <p className="text-gray-600">{errorInfo.description}</p>
            </div>
            
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
              <h3 className="text-sm font-medium text-blue-800 mb-1">What you can do</h3>
              <p className="text-sm text-blue-700">{errorInfo.suggestion}</p>
            </div>
            
            {/* Node context if available */}
            {errorInfo.nodeName && (
              <div className="text-xs text-gray-500 pt-2 border-t">
                Failed at: <span className="font-medium">{errorInfo.nodeName}</span>
              </div>
            )}
          </div>
          
          {/* Actions */}
          <div className="bg-gray-50 px-6 py-4 flex gap-3">
            <button
              onClick={() => {
                setError(null);
                loadFlow();
              }}
              className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Try Again
            </button>
            <button
              onClick={() => navigate(-1)}
              className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
            >
              Exit Flow
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (isComplete) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-6">
          <div className="text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-10 h-10 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Flow Complete!</h2>
            <p className="text-gray-600 mb-6">
              Your screen flow has been executed successfully.
            </p>
            
            {executionHistory.length > 0 && (
              <div className="bg-gray-50 rounded-lg p-4 mb-6 text-left">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Execution Summary</h3>
                <div className="space-y-2 text-sm">
                  {executionHistory.map((item, idx) => (
                    <div key={idx} className="flex items-start gap-2">
                      <div className="w-2 h-2 rounded-full bg-blue-500 mt-1.5"></div>
                      <div className="flex-1">
                        <span className="text-gray-600">{item.type === 'screen' ? 'Screen completed' : 'Action executed'}</span>
                        {item.result?.recordId && (
                          <span className="text-gray-400 ml-1">(ID: {item.result.recordId})</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            <button
              onClick={() => navigate(-1)}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Flow
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Helper: Find if there's a next Screen node in the flow path
  const findNextScreenInFlow = (fromNodeId) => {
    if (!flow) return false;
    const edges = flow.edges || [];
    const outgoingEdges = edges.filter(e => e.source === fromNodeId);
    return outgoingEdges.length > 0;
  };

  // Render current screen
  const currentNode = flow.nodes.find(n => n.id === currentNodeId);
  
  if (!currentNode) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">No screen to display</p>
        </div>
      </div>
    );
  }

  // Determine button visibility based on Salesforce rules
  const isFirstScreen = screenHistory.length === 0;
  const isLastScreen = !findNextScreenInFlow(currentNodeId);
  
  // Screen properties (can be configured in builder)
  const screenConfig = currentNode.data?.config || {};
  const showPrevious = screenConfig.showPrevious !== false && !isFirstScreen;
  const showNext = screenConfig.showNext !== false && !isLastScreen;
  const showFinish = screenConfig.showFinish === true || isLastScreen;

  // Get page background from theme
  const getPageBackgroundStyle = () => {
    const theme = screenConfig.theme;
    if (!theme?.pageBackground) {
      return { className: 'min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-8 px-4', style: {} };
    }
    
    const bgColorMap = {
      'white': '#ffffff',
      'gray-50': '#f9fafb',
      'gray-100': '#f3f4f6',
      'blue-50': '#eff6ff',
      'indigo-50': '#eef2ff',
      'purple-50': '#faf5ff',
      'green-50': '#f0fdf4',
      'amber-50': '#fffbeb'
    };
    
    if (theme.pageBackground === 'custom' && theme.pageBackgroundCustom) {
      return { className: 'min-h-screen py-8 px-4', style: { backgroundColor: theme.pageBackgroundCustom } };
    } else if (bgColorMap[theme.pageBackground]) {
      return { className: 'min-h-screen py-8 px-4', style: { backgroundColor: bgColorMap[theme.pageBackground] } };
    }
    
    return { className: 'min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-8 px-4', style: {} };
  };

  const pageBackground = getPageBackgroundStyle();

  return (
    <div className={pageBackground.className} style={pageBackground.style}>
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-900">{flow.name}</h1>
              <p className="text-sm text-gray-500">Screen Flow Execution</p>
            </div>
            <button
              onClick={() => navigate(-1)}
              className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Exit
            </button>
          </div>
        </div>

        {/* Screen Renderer with Button Control */}
        <ScreenRenderer
          node={currentNode}
          onNext={handleNext}
          onPrevious={handlePrevious}
          onFinish={handleFinish}
          context={executionContext}
          screenData={screenData[currentNodeId] || {}}
          showPrevious={showPrevious}
          showNext={showNext}
          showFinish={showFinish}
        />
      </div>
    </div>
  );
};

export default ScreenFlowRunner;
