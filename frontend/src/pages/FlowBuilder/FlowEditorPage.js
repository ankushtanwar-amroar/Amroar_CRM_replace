import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import ReactFlow, {
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  useReactFlow,
  ReactFlowProvider,
} from 'reactflow';
import 'reactflow/dist/style.css';
import axios from 'axios';
import { Save, Play, ArrowLeft, Zap, Sparkles, Activity, Plus, Settings, X, Eye } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { toast } from 'sonner';
import NodeConfigPanel from './components/NodeConfigPanel';
import WebhookTriggerConfigPanel from './components/WebhookTriggerConfigPanel';
import ScheduledTriggerConfigPanel from './components/ScheduledTriggerConfigPanel';
import AddButtonNode from './components/AddButtonNode';
import LoopNode from './components/LoopNode';
import DecisionNode from './components/DecisionNode';
import DecisionEdge from './components/DecisionEdge';
import MergeNode from './components/MergeNode';
import DelayNode from './components/DelayNode';
import ScreenNode from './components/ScreenNode';
import AddErrorNode from './components/AddErrorNode';
import FaultNode from './components/nodes/FaultNode';
import FaultEndNode from './components/nodes/FaultEndNode';
import TriggerNode from './components/TriggerNode';
import AddActionMenu from './components/AddActionMenu';
import AIFlowAssistant from './components/AIFlowAssistant';
import ScreenFlowPreviewRunner from './components/ScreenFlowPreviewRunner';
import FlowLogsPanel from './components/FlowLogsPanel';
import RunManuallyModal from '../../components/RunManuallyModal';
import InputVariablesPanel from './components/InputVariablesPanel';
import ScreenFlowStartNode from './components/ScreenFlowStartNode';
import ScreenFlowEndNode from './components/ScreenFlowEndNode';

const API = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';

const VERTICAL_SPACING = 150;

const FlowEditorPage = ({ readOnly = false }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { flowId } = useParams();
  const reactFlowInstance = useReactFlow();
  
  // Check if this is a read-only view from URL params
  const searchParams = new URLSearchParams(location.search);
  const isReadOnly = readOnly || searchParams.get('readonly') === 'true';
  
  // Suppress ResizeObserver errors (benign React Flow + custom node interaction)
  useEffect(() => {
    // Suppress in error handler
    const errorHandler = (e) => {
      if (e.message && e.message.includes('ResizeObserver')) {
        const resizeObserverErrDiv = document.getElementById('webpack-dev-server-client-overlay');
        if (resizeObserverErrDiv) {
          resizeObserverErrDiv.style.display = 'none';
        }
        e.stopImmediatePropagation();
      }
    };
    
    // Suppress in global error handler
    const unhandledErrorHandler = (event) => {
      if (event.reason && event.reason.toString().includes('ResizeObserver')) {
        event.preventDefault();
      }
    };
    
    window.addEventListener('error', errorHandler);
    window.addEventListener('unhandledrejection', unhandledErrorHandler);
    
    return () => {
      window.removeEventListener('error', errorHandler);
      window.removeEventListener('unhandledrejection', unhandledErrorHandler);
    };
  }, []);
  
  const [layoutReady, setLayoutReady] = useState(false);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [flowName, setFlowName] = useState('');
  const [flowDescription, setFlowDescription] = useState('');
  const [flowStatus, setFlowStatus] = useState('draft'); // draft, active, archived
  const [flowVersion, setFlowVersion] = useState(1);
  const [selectedNode, setSelectedNode] = useState(null);
  const [configPanelKey, setConfigPanelKey] = useState(0); // Key to force panel remount
  const [triggers, setTriggers] = useState([]);
  const [saving, setSaving] = useState(false);
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
  const [batchSize, setBatchSize] = useState(50); // Default batch size
  const [flowVersions, setFlowVersions] = useState([]);
  const [crmObjects, setCrmObjects] = useState([]);
  const [crmFieldsCache, setCrmFieldsCache] = useState({});
  const [flowVariables, setFlowVariables] = useState([]); // Global flow variables
  const [inputVariables, setInputVariables] = useState([]); // Input variables for manual run
  const [flowType, setFlowType] = useState(null); // 'record-triggered' or 'screen-flow' - start as null (UI display)
  const [savedFlowType, setSavedFlowType] = useState('trigger'); // Backend field: trigger, screen, scheduled, webhook
  const [launchMode, setLaunchMode] = useState('basic'); // For Screen Flows: basic, record_detail, list_view
  const [screenFlowObject, setScreenFlowObject] = useState(null); // For record_detail and list_view: the selected object
  const [decisionOutcomeContext, setDecisionOutcomeContext] = useState(null); // Track which outcome is being edited
  
  // CRITICAL FIX: Use ref to store pending node config updates
  // This ensures we capture the latest changes even if React state hasn't updated yet
  const pendingNodeUpdates = useRef({});
  
  // Debug: Log when flowType or savedFlowType changes
  useEffect(() => {
    console.log('🔍 [FLOW TYPE CHANGED]', {
      flowType,
      savedFlowType,
      timestamp: new Date().toISOString()
    });
  }, [flowType, savedFlowType]);

  // Get flow type from location state (when creating new flow)
  useEffect(() => {
    const automationType = location.state?.automationType;
    const launchModeFromState = location.state?.launchMode;
    const objectFromState = location.state?.object;
    
    if (automationType && flowId === 'new') {
      console.log('🔵 Setting flow type from location state:', automationType);
      console.log('🔵 Launch mode:', launchModeFromState);
      console.log('🔵 Object:', objectFromState);
      
      setFlowType(automationType);
      
      // Map to backend flow type
      const flowTypeMap = {
        'record-triggered': 'trigger',
        'screen-flow': 'screen',
        'scheduled': 'scheduled',
        'webhook': 'webhook'
      };
      setSavedFlowType(flowTypeMap[automationType] || 'trigger');
      
      // Set launch mode for Screen Flows
      if (launchModeFromState) {
        setLaunchMode(launchModeFromState);
      }
      
      // Set trigger object for record_detail and list_view modes
      if (objectFromState && (launchModeFromState === 'record_detail' || launchModeFromState === 'list_view')) {
        console.log('🔵 Setting screen flow object:', objectFromState);
        setScreenFlowObject(objectFromState);
        setTriggers([{
          id: `trigger_${Date.now()}`,
          type: 'trigger',
          config: {
            entity: objectFromState,
            object: objectFromState,
            trigger_event: 'create'
          }
        }]);
      }
    } else if (flowId === 'new' && !automationType) {
      // Default to record-triggered if no type specified
      console.log('🔵 No automation type in location state, defaulting to record-triggered');
      setFlowType('record-triggered');
      setSavedFlowType('trigger');
    }
  }, [location.state, flowId]);

  // Initialize with default nodes for new flows
  useEffect(() => {
    if (flowId === 'new' && nodes.length === 0 && flowType) {
      console.log('🟢 Initializing flow with type:', flowType);
      initializeDefaultFlow();
    } else if (flowId && flowId !== 'new') {
      fetchFlow();
    }
  }, [flowId, flowType]);

  // Handler to create new flow variable
  const handleCreateFlowVariable = useCallback((variable) => {
    const newVariable = {
      id: `var_${Date.now()}`,
      name: variable.name,
      type: variable.type,
      value: variable.value || '',
      createdAt: new Date().toISOString()
    };
    
    setFlowVariables(prev => [...prev, newVariable]);
    toast.success(`Created resource: ${variable.name}`);
    console.log('✅ Created new flow variable:', newVariable);
  }, []);

  // Generate webhook body fields as virtual variables
  const webhookBodyVariables = useMemo(() => {
    if (!triggers || triggers.length === 0) return [];
    
    const webhookTrigger = triggers.find(t => t.type === 'incoming_webhook_trigger' || t.type === 'webhook_trigger');
    if (!webhookTrigger || !webhookTrigger.config || !webhookTrigger.config.body_fields) {
      return [];
    }
    
    return webhookTrigger.config.body_fields.map(field => ({
      id: `webhook_${field.id}`,
      name: `WebhookBody.${field.name}`,
      type: field.type,
      value: '',
      isWebhookField: true,
      required: field.required
    }));
  }, [triggers]);

  // FIX: Generate scheduled trigger object fields as virtual variables
  const scheduledTriggerVariables = useMemo(() => {
    if (!triggers || triggers.length === 0) return [];
    
    const scheduledTrigger = triggers.find(t => t.type === 'scheduled_trigger');
    if (!scheduledTrigger || !scheduledTrigger.config || !scheduledTrigger.config.object) {
      return [];
    }
    
    const objectName = scheduledTrigger.config.object; // e.g., "Lead"
    
    // Generate variables for the selected object's fields
    // These will be available as {ObjectName}.{fieldName}
    const objectVariables = [
      {
        id: `scheduled_${objectName.toLowerCase()}_id`,
        name: `${objectName}.id`,
        type: 'text',
        value: '',
        isScheduledTriggerField: true,
        label: `${objectName} ID`
      },
      {
        id: `scheduled_${objectName.toLowerCase()}_name`,
        name: `${objectName}.name`,
        type: 'text',
        value: '',
        isScheduledTriggerField: true,
        label: `${objectName} Name`
      },
      {
        id: `scheduled_${objectName.toLowerCase()}_email`,
        name: `${objectName}.email`,
        type: 'email',
        value: '',
        isScheduledTriggerField: true,
        label: `${objectName} Email`
      },
      {
        id: `scheduled_${objectName.toLowerCase()}_phone`,
        name: `${objectName}.phone`,
        type: 'phone',
        value: '',
        isScheduledTriggerField: true,
        label: `${objectName} Phone`
      },
      {
        id: `scheduled_${objectName.toLowerCase()}_company`,
        name: `${objectName}.company`,
        type: 'text',
        value: '',
        isScheduledTriggerField: true,
        label: `${objectName} Company`
      },
      {
        id: `scheduled_${objectName.toLowerCase()}_status`,
        name: `${objectName}.status`,
        type: 'text',
        value: '',
        isScheduledTriggerField: true,
        label: `${objectName} Status`
      },
      {
        id: `scheduled_${objectName.toLowerCase()}_createdAt`,
        name: `${objectName}.createdAt`,
        type: 'date',
        value: '',
        isScheduledTriggerField: true,
        label: `${objectName} Created Date`
      },
      {
        id: `scheduled_${objectName.toLowerCase()}_updatedAt`,
        name: `${objectName}.updatedAt`,
        type: 'date',
        value: '',
        isScheduledTriggerField: true,
        label: `${objectName} Updated Date`
      }
    ];
    
    return objectVariables;
  }, [triggers]);

  // Generate screen node input fields as virtual variables
  const screenFieldVariables = useMemo(() => {
    if (!nodes || nodes.length === 0) return [];
    
    const screenVariables = [];
    
    // Find all screen nodes and extract their input fields
    nodes.forEach(node => {
      if (node.data?.nodeType === 'screen' && node.data?.config?.fields) {
        node.data.config.fields.forEach(field => {
          if (field.name) {
            screenVariables.push({
              id: `screen_${node.id}_${field.id}`,
              name: `Screen.${field.name}`,
              type: field.type || 'text',
              value: '',
              isScreenField: true,
              screenNodeId: node.id,
              label: field.label || field.name
            });
          }
        });
      }
    });
    
    return screenVariables;
  }, [nodes]);

  // Combine all available variables
  const allAvailableVariables = useMemo(() => {
    return [...flowVariables, ...inputVariables, ...webhookBodyVariables, ...scheduledTriggerVariables, ...screenFieldVariables];
  }, [flowVariables, inputVariables, webhookBodyVariables, scheduledTriggerVariables, screenFieldVariables]);

  // Fetch CRM objects from Object Manager (including custom objects)
  useEffect(() => {
    const fetchCrmObjects = async () => {
      try {
        // Get tenant_id from localStorage or use a default
        const tenantId = localStorage.getItem('tenant_id') || 'default_tenant';
        
        // Fetch standard CRM objects
        const standardResponse = await axios.get(`${API}/api/console/objects?tenant_id=${tenantId}`);
        const standardObjects = standardResponse.data?.objects || [];
        
        // Fetch custom objects from custom object manager
        let customObjects = [];
        try {
          const customResponse = await axios.get(`${API}/api/custom-objects?tenant_id=${tenantId}`);
          customObjects = customResponse.data?.objects || [];
        } catch (customError) {
          console.log('No custom objects API or no custom objects found');
        }
        
        // Combine standard and custom objects
        const allObjects = [
          ...standardObjects.map(obj => ({
            name: obj.apiName || obj.api_name || obj.id,
            label: obj.label || obj.name,
            isCustom: false
          })),
          ...customObjects.map(obj => ({
            name: obj.object_name || obj.apiName,
            label: obj.object_label || obj.label,
            isCustom: true
          })),
          // Add common custom objects that exist in tenant_objects
          { name: 'invoice', label: 'Invoice', isCustom: true },
          { name: 'test_object', label: 'Test Object', isCustom: true },
        ];
        
        // Remove duplicates based on name
        const uniqueObjects = allObjects.filter((obj, index, self) =>
          index === self.findIndex((t) => t.name === obj.name)
        );
        
        setCrmObjects(uniqueObjects);
        console.log('Fetched CRM objects from Object Manager (including custom):', uniqueObjects);
      } catch (error) {
        console.error('Error fetching CRM objects:', error);
        // Fallback to default objects if API fails (including common custom objects)
        setCrmObjects([
          { name: 'lead', label: 'Lead' },
          { name: 'contact', label: 'Contact' },
          { name: 'account', label: 'Account' },
          { name: 'opportunity', label: 'Opportunity' },
          { name: 'task', label: 'Task' },
          { name: 'event', label: 'Event' },
          { name: 'invoice', label: 'Invoice', isCustom: true },
          { name: 'test_object', label: 'Test Object', isCustom: true },
        ]);
      }
    };

    fetchCrmObjects();
  }, []);

  // Function to fetch fields for a specific object
  const fetchFieldsForObject = async (objectApiName) => {
    // Check if fields are already cached
    if (crmFieldsCache[objectApiName]) {
      return crmFieldsCache[objectApiName];
    }

    try {
      console.log(`Fetching fields for object: ${objectApiName}`);
      // Use the /api/objects/{object_name} endpoint which returns fields from metadata_fields collection
      // Convert to lowercase to match backend database expectations
      const response = await axios.get(`${API}/api/objects/${objectApiName.toLowerCase()}`);
      
      console.log(`API Response for ${objectApiName}:`, response.data);
      
      if (response.data) {
        // Check if fields exist in the response
        const fieldsData = response.data.fields;
        
        // Handle both array and object formats for fields
        let fieldsArray = [];
        if (Array.isArray(fieldsData)) {
          fieldsArray = fieldsData;
        } else if (fieldsData && typeof fieldsData === 'object') {
          // Convert object format to array format
          // API returns: { "field_name": { type, label, ... }, ... }
          fieldsArray = Object.entries(fieldsData).map(([fieldName, fieldConfig]) => ({
            name: fieldName,
            api_name: fieldName,
            label: (fieldConfig && fieldConfig.label) || fieldName,
            type: (fieldConfig && fieldConfig.type) || 'text',
            is_required: (fieldConfig && fieldConfig.required) || false,
            related_object: (fieldConfig && fieldConfig.related_object) || null
          }));
        }
        
        // Transform fields to dropdown format including is_required flag
        const transformedFields = (fieldsArray || []).map(field => ({
          name: field.api_name || field.name,
          label: field.label || field.name,
          is_required: field.is_required || false,
          type: field.type || 'Text',
          related_object: field.related_object || null
        }));
        
        console.log(`Transformed ${transformedFields.length} fields for ${objectApiName}:`, transformedFields);
        
        // If no fields from API, use hardcoded defaults based on object type
        const fieldsToUse = transformedFields.length > 0 ? transformedFields : getDefaultFieldsForObject(objectApiName);
        
        console.log(`Using ${fieldsToUse.length} fields for ${objectApiName}:`, fieldsToUse);
        
        // Cache the fields
        setCrmFieldsCache(prev => ({
          ...prev,
          [objectApiName]: fieldsToUse
        }));
        
        return fieldsToUse;
      }
    } catch (error) {
      console.error(`Error fetching fields for ${objectApiName}:`, error);
      // If API fails, return default fields
      const defaultFields = getDefaultFieldsForObject(objectApiName);
      console.log(`Using default ${defaultFields.length} fields for ${objectApiName} due to error`);
      return defaultFields;
    }
    
    // Fallback to default fields
    const defaultFields = getDefaultFieldsForObject(objectApiName);
    setCrmFieldsCache(prev => ({
      ...prev,
      [objectApiName]: defaultFields
    }));
    return defaultFields;
  };

  // Get default fields based on object type (from console service metadata)
  // Mark standard required fields with is_required flag
  const getDefaultFieldsForObject = (objectApiName) => {
    const fieldMap = {
      'lead': [
        { name: 'first_name', label: 'First Name', is_required: true },
        { name: 'last_name', label: 'Last Name', is_required: true },
        { name: 'email', label: 'Email', is_required: true },
        { name: 'company', label: 'Company', is_required: false },
        { name: 'phone', label: 'Phone', is_required: false },
        { name: 'status', label: 'Status', is_required: true },
        { name: 'title', label: 'Title', is_required: false },
        { name: 'industry', label: 'Industry', is_required: false },
        { name: 'rating', label: 'Rating', is_required: false },
        { name: 'lead_source', label: 'Lead Source', is_required: false },
        { name: 'description', label: 'Description', is_required: false },
      ],
      'account': [
        { name: 'name', label: 'Name', is_required: true },
        { name: 'industry', label: 'Industry', is_required: false },
        { name: 'website', label: 'Website', is_required: false },
        { name: 'phone', label: 'Phone', is_required: false },
        { name: 'type', label: 'Type', is_required: false },
        { name: 'description', label: 'Description', is_required: false },
        { name: 'annual_revenue', label: 'Annual Revenue', is_required: false },
        { name: 'employees', label: 'Number of Employees', is_required: false },
        { name: 'rating', label: 'Account Rating', is_required: false },
        { name: 'billing_address', label: 'Billing Address', is_required: false },
      ],
      'contact': [
        { name: 'first_name', label: 'First Name', is_required: true },
        { name: 'last_name', label: 'Last Name', is_required: true },
        { name: 'email', label: 'Email', is_required: true },
        { name: 'phone', label: 'Phone', is_required: false },
        { name: 'account_name', label: 'Account Name', is_required: false },
        { name: 'title', label: 'Title', is_required: false },
        { name: 'department', label: 'Department', is_required: false },
        { name: 'mobile', label: 'Mobile', is_required: false },
        { name: 'description', label: 'Description', is_required: false },
        { name: 'mailing_address', label: 'Mailing Address', is_required: false },
      ],
      'opportunity': [
        { name: 'name', label: 'Name', is_required: true },
        { name: 'amount', label: 'Amount', is_required: true },
        { name: 'stage', label: 'Stage', is_required: true },
        { name: 'close_date', label: 'Close Date', is_required: false },
        { name: 'account_name', label: 'Account Name', is_required: false },
        { name: 'description', label: 'Description', is_required: false },
        { name: 'type', label: 'Type', is_required: false },
        { name: 'lead_source', label: 'Lead Source', is_required: false },
        { name: 'probability', label: 'Probability (%)', is_required: false },
        { name: 'next_step', label: 'Next Step', is_required: false },
        { name: 'owner', label: 'Owner', is_required: false },
      ],
      'task': [
        { name: 'subject', label: 'Subject', is_required: true },
        { name: 'status', label: 'Status', is_required: true },
        { name: 'priority', label: 'Priority', is_required: true },
        { name: 'due_date', label: 'Due Date', is_required: false },
        { name: 'assigned_to', label: 'Assigned To', is_required: false },
      ],
      'event': [
        { name: 'subject', label: 'Subject', is_required: true },
        { name: 'start_datetime', label: 'Start Date/Time', is_required: true },
        { name: 'end_datetime', label: 'End Date/Time', is_required: true },
        { name: 'event_type', label: 'Event Type', is_required: true },
        { name: 'location', label: 'Location', is_required: false },
      ],
      'invoice': [
        { name: 'invoice_number', label: 'Invoice Number', is_required: true },
        { name: 'customer_name', label: 'Customer Name', is_required: true },
        { name: 'amount', label: 'Amount', is_required: true },
        { name: 'due_date', label: 'Due Date', is_required: true },
        { name: 'status', label: 'Status', is_required: true },
        { name: 'description', label: 'Description', is_required: false },
      ],
      'test_object': [
        { name: 'name', label: 'Name', is_required: true },
        { name: 'description', label: 'Description', is_required: false },
      ],
      'case': [
        { name: 'subject', label: 'Subject', is_required: true },
        { name: 'status', label: 'Status', is_required: true },
        { name: 'priority', label: 'Priority', is_required: true },
        { name: 'description', label: 'Description', is_required: false },
        { name: 'contact_name', label: 'Contact Name', is_required: false },
      ],
      'campaign': [
        { name: 'name', label: 'Name', is_required: true },
        { name: 'type', label: 'Type', is_required: true },
        { name: 'status', label: 'Status', is_required: true },
        { name: 'start_date', label: 'Start Date', is_required: false },
        { name: 'budget', label: 'Budget', is_required: false },
      ],
    };

    const normalizedName = objectApiName?.toLowerCase();
    const fields = fieldMap[normalizedName] || [
      { name: 'name', label: 'Name', is_required: true },
      { name: 'status', label: 'Status', is_required: false },
    ];
    
    console.log(`getDefaultFieldsForObject(${objectApiName}) normalized to ${normalizedName}, returning ${fields.length} fields:`, fields);
    return fields;
  };

  // Fit view after layout is ready and nodes are loaded
  useEffect(() => {
    if (layoutReady && nodes.length > 0 && reactFlowInstance) {
      // Small delay to ensure DOM is ready
      const timer = setTimeout(() => {
        reactFlowInstance.fitView({ 
          padding: 0.3,
          includeHiddenNodes: false,
          duration: 200 
        });
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [layoutReady, nodes.length, reactFlowInstance]);

  useEffect(() => {
    requestAnimationFrame(() => {
      setLayoutReady(true);
    });
  }, []);

  const initializeDefaultFlow = () => {
    console.log('Initializing default flow with type:', flowType);
    
    let startNode;
    
    if (flowType === 'screen-flow') {
      // Screen Flow: Use dedicated non-clickable Start node
      startNode = {
        id: 'screen_flow_start',
        type: 'screen_flow_start',
        position: { x: 300, y: 50 },
        data: {
          label: 'Screen Flow – Start',
          nodeType: 'screen_flow_start',
          isSystemNode: true,  // Mark as non-clickable system node
          config: {}
        },
        selectable: false,  // Prevent selection
        draggable: false,   // Prevent dragging
      };
    } else if (flowType === 'webhook-trigger') {
      // Webhook Trigger: Start with a Webhook Trigger node
      startNode = {
        id: 'webhook_trigger_start',
        type: 'webhook_trigger',
        position: { x: 300, y: 50 },
        data: {
          label: 'Webhook Trigger',
          nodeType: 'webhook_trigger',
          config: { 
            triggerType: 'incoming_webhook'
          },
          triggers: [{
            type: 'webhook_trigger',
            config: { triggerType: 'incoming_webhook' }
          }]
        }
      };
    } else if (flowType === 'scheduled-trigger') {
      // Scheduled Trigger: Start with a Scheduled Trigger node
      startNode = {
        id: 'scheduled_trigger_start',
        type: 'scheduled_trigger',
        position: { x: 300, y: 50 },
        data: {
          label: 'Scheduled Trigger',
          nodeType: 'scheduled_trigger',
          config: { 
            triggerType: 'scheduled_trigger'
          },
          triggers: [{
            type: 'scheduled_trigger',
            config: { triggerType: 'scheduled_trigger' }
          }]
        }
      };
    } else {
      // Record Triggered: Start with a Trigger node
      startNode = {
        id: 'trigger_start',
        type: 'trigger',
        position: { x: 300, y: 50 },
        data: {
          label: 'Record Trigger',
          nodeType: 'trigger',
          config: { entity: 'Lead', event: 'afterInsert' },
          triggers: [{
            type: 'trigger',
            config: { entity: 'Lead', triggerEvent: 'created' }
          }]
        }
      };
    }

    // TriggerNode handles its own styling, screen-flow uses dedicated node component
    // No inline styling needed for screen_flow_start - component handles it
    // Webhook, Scheduled, and Record Trigger nodes use TriggerNode styling

    const addButtonNode = {
      id: 'add_button_1',
      type: 'addButton',
      position: { x: 300, y: 200 },
      data: {
        onClick: () => handleAddButtonClick('add_button_1', startNode.id)
      }
    };

    // Use dedicated Screen Flow End node if screen-flow, else use default End
    const endNode = flowType === 'screen-flow' ? {
      id: 'screen_flow_end',
      type: 'screen_flow_end',
      position: { x: 300, y: 350 },
      data: {
        label: 'End',
        nodeType: 'screen_flow_end',
        isSystemNode: true,  // Mark as non-clickable system node
        config: {}
      },
      selectable: false,  // Prevent selection
      draggable: false,   // Prevent dragging
    } : {
      id: 'end_node',
      type: 'default',
      position: { x: 300, y: 350 },
      data: {
        label: '🏁 END',
        nodeType: 'end',
        config: {}
      },
      style: {
        background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
        border: '2px solid #dc2626',
        borderRadius: '12px',
        padding: '16px',
        fontWeight: 'bold',
        color: 'white',
        minWidth: '180px',
        textAlign: 'center'
      }
    };

    const endNodeId = flowType === 'screen-flow' ? 'screen_flow_end' : 'end_node';

    const initialNodes = [startNode, addButtonNode, endNode];
    const initialEdges = [
      {
        id: `e_${startNode.id}_to_add_button_1`,
        source: startNode.id,
        target: 'add_button_1',
        type: 'smoothstep',  // STRAIGHT edges only
        animated: true,
        style: { stroke: '#94a3b8', strokeWidth: 2 }
      },
      {
        id: `e_add_button_1_to_${endNodeId}`,
        source: 'add_button_1',
        target: endNodeId,
        type: 'smoothstep',  // STRAIGHT edges only
        animated: true,
        style: { stroke: '#94a3b8', strokeWidth: 2 }
      }
    ];

    setNodes(initialNodes);
    setEdges(initialEdges);
    setFlowName(flowType === 'screen-flow' ? 'New Screen Flow' : 'New Automation Flow');
    
    // Don't auto-open config panel for screen-flow start (it's non-clickable)
    if (flowType !== 'screen-flow') {
      setSelectedNode(startNode);
    } else {
      setSelectedNode(null);
    }
  };

  const fetchFlow = async () => {
    try {
      const response = await axios.get(`${API}/api/flow-builder/flows/${flowId}`);
      const flow = response.data;
      
      setFlowName(flow.name);
      setFlowDescription(flow.description || '');
      setFlowStatus(flow.status || 'draft');
      setFlowVersion(flow.version || 1);
      setBatchSize(flow.batch_size || 50); // Load batch size, default to 50
      
      // CRITICAL FIX: Set both flowType (UI) and savedFlowType (backend field)
      const loadedFlowType = flow.flow_type || 'trigger';
      setFlowType(loadedFlowType); // For UI display
      setSavedFlowType(loadedFlowType); // For backend save and preview button detection
      console.log('🔵 Loaded flow type:', loadedFlowType, '(set both flowType and savedFlowType)');
      
      setLaunchMode(flow.launch_mode || 'basic'); // Load launch mode
      setTriggers(flow.triggers || []);
      setInputVariables(flow.input_variables || []); // Load input variables
      
      // Load screen flow object for record_detail and list_view modes
      console.log('🔍 DEBUG: flow.flow_type =', flow.flow_type, ', flow.launch_mode =', flow.launch_mode, ', flow.screen_flow_object =', flow.screen_flow_object);
      if (flow.flow_type === 'screen' && (flow.launch_mode === 'record_detail' || flow.launch_mode === 'list_view')) {
        console.log('🔍 Checking for screen_flow_object...');
        // First check if screen_flow_object is directly on the flow
        if (flow.screen_flow_object) {
          console.log('🔵 Loaded screen flow object from flow.screen_flow_object:', flow.screen_flow_object);
          setScreenFlowObject(flow.screen_flow_object);
        } else if (flow.triggers && flow.triggers.length > 0) {
          // Fallback: check triggers config (legacy)
          const triggerConfig = flow.triggers[0].config || {};
          const objectName = triggerConfig.entity || triggerConfig.object;
          if (objectName) {
            console.log('🔵 Loaded screen flow object from trigger:', objectName);
            setScreenFlowObject(objectName);
          } else {
            console.warn('⚠️ No screen_flow_object found in flow or triggers');
          }
        } else {
          console.warn('⚠️ No screen_flow_object found in flow, no triggers available');
        }
      }
      
      // Reconstruct the flow with trigger, action nodes, add buttons, and end node
      // CRITICAL: Pass loadedFlowType directly since savedFlowType state hasn't updated yet
      const { reconstructedNodes, reconstructedEdges } = reconstructFlowWithAddButtons(
        flow.triggers || [],
        flow.nodes || [],
        flow.edges || [],
        loadedFlowType  // Pass flow type directly to avoid stale state issue
      );
      
      setNodes(reconstructedNodes);
      setEdges(reconstructedEdges);
      
      // FIX: Call fitView after nodes are set to center the canvas on the flow
      // Use setTimeout to ensure React has updated the DOM
      setTimeout(() => {
        if (reactFlowInstance) {
          reactFlowInstance.fitView({ padding: 0.2, duration: 300 });
          console.log('🔄 FitView called after flow load');
        }
      }, 200);
    } catch (error) {
      console.error('Error fetching flow:', error);
      toast.error('Failed to load flow');
    }
  };

  const reconstructFlowWithAddButtons = (triggers, savedNodes, savedEdges, overrideFlowType = null) => {
    const reconstructedNodes = [];
    const reconstructedEdges = [];
    
    // FIXED CENTER X - All nodes must be at same X position for vertical alignment
    const CENTER_X = 300;
    // Consistent vertical spacing between nodes
    const NODE_SPACING = 100;
    // Spacing for add buttons (smaller gap)
    const ADD_BUTTON_GAP = 50;
    
    let currentY = 50;
    let previousNodeId = null;

    console.log('🔄 ===== FLOW RECONSTRUCTION START =====');
    console.log('📦 Received savedNodes:', savedNodes?.length);
    console.log('📦 Override flow type:', overrideFlowType);
    console.log('📦 State savedFlowType:', savedFlowType);

    // Check if this is a screen flow - USE overrideFlowType if provided (fixes stale state bug)
    const effectiveFlowType = overrideFlowType || savedFlowType;
    const isScreenFlow = effectiveFlowType === 'screen' || 
                        triggers.some(t => t.type === 'screen' || t.type === 'screen_flow');
    
    console.log('📦 Effective flow type:', effectiveFlowType, '| isScreenFlow:', isScreenFlow);
    
    // Helper to create straight vertical edge
    const createStraightEdge = (sourceId, targetId, animated = false) => ({
      id: `e_${sourceId}_to_${targetId}`,
      source: sourceId,
      target: targetId,
      type: 'smoothstep',  // STRAIGHT edges only - no curves
      animated,
      style: { stroke: '#94a3b8', strokeWidth: 2 }
    });
    
    // 1. Add Start node
    if (isScreenFlow) {
      const screenFlowStartNode = {
        id: 'screen_flow_start',
        type: 'screen_flow_start',
        position: { x: CENTER_X, y: currentY },
        data: {
          label: 'Screen Flow – Start',
          nodeType: 'screen_flow_start',
          isSystemNode: true,
          config: {}
        },
        selectable: false,
        draggable: false,
      };
      reconstructedNodes.push(screenFlowStartNode);
      previousNodeId = screenFlowStartNode.id;
      currentY += NODE_SPACING;
      console.log('🖥️ Added Screen Flow Start node at Y:', currentY - NODE_SPACING);
    } else if (triggers.length > 0) {
      const trigger = triggers[0];
      let triggerNode;
      
      if (trigger.type === 'webhook_trigger' || trigger.type === 'incoming_webhook_trigger') {
        triggerNode = {
          id: trigger.id || 'webhook_trigger_start',
          type: 'webhook_trigger',
          position: { x: CENTER_X, y: currentY },
          data: {
            label: 'Webhook Trigger',
            nodeType: 'webhook_trigger',
            config: trigger.config || { triggerType: 'incoming_webhook' },
            triggers: [trigger]
          }
        };
      } else if (trigger.type === 'scheduled_trigger') {
        triggerNode = {
          id: trigger.id || 'scheduled_trigger_start',
          type: 'scheduled_trigger',
          position: { x: CENTER_X, y: currentY },
          data: {
            label: 'Scheduled Trigger',
            nodeType: 'scheduled_trigger',
            config: trigger.config || { triggerType: 'scheduled_trigger' },
            triggers: [trigger]
          }
        };
      } else {
        triggerNode = {
          id: trigger.id || 'trigger_start',
          type: 'trigger',
          position: { x: CENTER_X, y: currentY },
          data: {
            label: 'Record Trigger',
            nodeType: 'trigger',
            config: trigger.config || { entity: 'Lead', event: 'afterInsert' },
            triggers: [trigger]
          }
        };
      }
      
      reconstructedNodes.push(triggerNode);
      previousNodeId = triggerNode.id;
      currentY += NODE_SPACING;
    } else {
      // Fallback: No start node conditions met, skip reconstruction
      console.log('⚠️ No start node created - isScreenFlow:', isScreenFlow, 'triggers:', triggers.length);
    }
    
    // SAFETY: If no start node was created, create a default screen flow start
    if (!previousNodeId && savedNodes.length > 0) {
      console.log('🔧 Creating fallback Screen Flow Start node');
      const fallbackStartNode = {
        id: 'screen_flow_start',
        type: 'screen_flow_start',
        position: { x: CENTER_X, y: currentY },
        data: {
          label: 'Screen Flow – Start',
          nodeType: 'screen_flow_start',
          isSystemNode: true,
          config: {}
        },
        selectable: false,
        draggable: false,
      };
      reconstructedNodes.push(fallbackStartNode);
      previousNodeId = 'screen_flow_start';
      currentY += NODE_SPACING;
    }

    // 2. Identify loop nodes and their children
    const loopNodes = savedNodes.filter(n => n.type === 'loop');
    const loopIds = new Set(loopNodes.map(n => n.id));
    
    // Build a map of loop node ID -> nodes inside that loop's For Each branch
    const loopChildrenMap = new Map(); // loopNodeId -> [childNodes]
    const loopConnectorsMap = new Map(); // loopNodeId -> connectorNode
    const forEachBranchNodeIds = new Set();
    
    savedNodes.forEach((node) => {
      // Skip add button nodes - they should not be treated as loop children
      if (node.type === 'addButton' || node.id?.startsWith('add_')) {
        return;
      }
      
      const loopContext = node.loopContext || node.data?.loopContext || node.config?.loopContext;
      const nodeConfig = node.data?.config || node.config;
      
      // Check if this is a loop-back connector
      if (nodeConfig?.connectorType === 'loop_back' && nodeConfig?.loopNodeId) {
        loopConnectorsMap.set(nodeConfig.loopNodeId, node);
        console.log(`🔄 Found loop connector for loop ${nodeConfig.loopNodeId}:`, node.id);
      }
      // Check if this node is inside a loop's For Each branch
      else if (loopContext?.isInsideLoop === true && loopContext?.loopNodeId) {
        forEachBranchNodeIds.add(node.id);
        const loopId = loopContext.loopNodeId;
        if (!loopChildrenMap.has(loopId)) {
          loopChildrenMap.set(loopId, []);
        }
        loopChildrenMap.get(loopId).push(node);
        console.log(`🔄 Found loop child for loop ${loopId}:`, node.id);
      }
    });

    // 3. Sort saved nodes by Y position (main flow only)
    const sortedNodes = [...savedNodes].sort((a, b) => (a.position?.y || 0) - (b.position?.y || 0));

    // Helper to determine React Flow node type
    // Only preserve special node types, all others use React Flow's built-in default
    const getNodeType = (nodeType) => {
      const preservedTypes = ['loop', 'decision', 'delay', 'screen', 'trigger', 'webhook_trigger', 'scheduled_trigger', 'add_error'];
      return preservedTypes.includes(nodeType) ? nodeType : 'default';
    };

    // 4. Process nodes - FORCE VERTICAL ALIGNMENT
    sortedNodes.forEach((node) => {
      // Skip nodes in loop For Each branches (handled when processing loop node)
      if (forEachBranchNodeIds.has(node.id)) return;
      
      // Skip loop connectors (handled when processing loop node)
      const nodeConfig = node.data?.config || node.config;
      if (nodeConfig?.connectorType === 'loop_back') return;
      
      // Skip merge nodes
      if (node.type === 'merge' || node.id.startsWith('merge_')) return;

      // Skip trigger/end nodes (handled separately)
      if (node.type === 'trigger' || node.data?.nodeType === 'trigger' || 
          node.type === 'webhook_trigger' || node.type === 'scheduled_trigger') return;
      if (node.type === 'end' || node.data?.nodeType === 'end' || 
          node.id === 'end_node' || node.id?.startsWith('end_') ||
          node.type === 'screen_flow_end' || node.id === 'screen_flow_end') return;
      
      // Skip start nodes (handled separately)  
      if (node.type === 'screen_flow_start' || node.id === 'screen_flow_start') return;
      
      // Skip add button nodes (will be regenerated)
      if (node.type === 'addButton' || node.id?.startsWith('add_button') || node.id?.startsWith('add_final') || node.id?.startsWith('add_for_each') || node.id?.startsWith('add_after_last')) return;

      console.log(`✅ Processing node: ${node.id} (type: ${node.type})`);

      // Add button BEFORE this node (in main flow)
      if (previousNodeId) {
        const addButtonId = `add_before_${node.id}`;  // Stable ID based on target node
        console.log(`  📍 Creating add button: ${addButtonId} between ${previousNodeId} and ${node.id}`);
        reconstructedNodes.push({
          id: addButtonId,
          type: 'addButton',
          position: { x: CENTER_X, y: currentY },
          data: { onClick: () => handleAddButtonClick(addButtonId, previousNodeId) }
        });
        
        // Edge from previous node to add button
        reconstructedEdges.push(createStraightEdge(previousNodeId, addButtonId));
        currentY += ADD_BUTTON_GAP;
        
        // Edge from add button to this node
        reconstructedEdges.push(createStraightEdge(addButtonId, node.id));
      } else {
        console.log(`  ⚠️ No previousNodeId, skipping add button for ${node.id}`);
      }

      // Preserve node data
      const preservedData = node.data || {};
      
      // Create node at CENTER_X (forced vertical alignment for main flow)
      const actualNode = {
        ...node,
        type: getNodeType(node.type),
        position: { x: CENTER_X, y: currentY },
        data: {
          ...preservedData,
          label: preservedData.label || node.label || node.type?.toUpperCase() || 'ACTION',
          nodeType: node.type,
          config: node.config || preservedData.config || {},
          onOutcomeClick: node.type === 'decision' ? (outcomeIndex) => {
            console.log(`Outcome ${outcomeIndex} clicked for decision ${node.id}`);
          } : undefined,
          onAddOutcome: node.type === 'decision' ? handleAddOutcome : undefined,
          onOutcomePlusClick: node.type === 'decision' ? handleOutcomePlusClick : undefined,
          onHeightChange: node.type === 'decision' ? handleDecisionHeightChange : undefined
        },
        style: node.type === 'loop' ? {} : getNodeStyle(node.type)
      };
      reconstructedNodes.push(actualNode);
      
      previousNodeId = node.id;
      
      // Handle node-type-specific spacing and children
      if (node.type === 'decision') {
        currentY += 350;
      } else if (node.type === 'loop') {
        // ===== LOOP NODE RECONSTRUCTION - PRESERVE FULL STRUCTURE =====
        const LOOP_SPACING = 250;
        const LOOP_VERTICAL = 180;
        const loopNodeId = node.id;
        const loopY = currentY;
        
        // Get saved children and connector for this loop
        const loopChildren = loopChildrenMap.get(loopNodeId) || [];
        const loopConnector = loopConnectorsMap.get(loopNodeId);
        
        console.log(`🔄 Loop ${loopNodeId}: ${loopChildren.length} children, connector: ${loopConnector?.id || 'none'}`);
        
        // ===== FOR EACH BRANCH =====
        const forEachButtonId = `add_for_each_${loopNodeId}`;
        let forEachBranchEndNodeId = forEachButtonId; // Track the last node in For Each branch
        
        if (loopChildren.length > 0) {
          // Sort children by Y position to maintain order
          const sortedChildren = [...loopChildren].sort((a, b) => (a.position?.y || 0) - (b.position?.y || 0));
          
          let childY = loopY + LOOP_VERTICAL;
          let prevChildNodeId = null;
          
          // Add "For Each" add button at the top of the branch
          reconstructedNodes.push({
            id: forEachButtonId,
            type: 'addButton',
            position: { x: CENTER_X - LOOP_SPACING + 20, y: childY },
            data: {
              onClick: () => handleAddButtonClick(forEachButtonId, loopNodeId),
              label: '🔁 Add to For Each',
              loopContext: { loopNodeId, isInsideLoop: true, branchType: 'for_each' }
            }
          });
          
          // Edge: Loop for-each handle -> first add button
          reconstructedEdges.push({
            id: `e_${loopNodeId}_to_for_each`,
            source: loopNodeId,
            sourceHandle: 'for-each',
            target: forEachButtonId,
            type: 'smoothstep',
            style: { stroke: '#f59e0b', strokeWidth: 2 }
          });
          
          childY += ADD_BUTTON_GAP;
          prevChildNodeId = forEachButtonId;
          
          // Add each child node in the For Each branch
          sortedChildren.forEach((childNode, index) => {
            const childPreservedData = childNode.data || {};
            
            // Create the child node with preserved position relative to loop
            const actualChild = {
              ...childNode,
              type: getNodeType(childNode.type),
              position: { x: CENTER_X - LOOP_SPACING + 20, y: childY },
              data: {
                ...childPreservedData,
                label: childPreservedData.label || childNode.label || 'ACTION',
                nodeType: childNode.type,
                config: childNode.config || childPreservedData.config || {},
                loopContext: { loopNodeId, isInsideLoop: true, branchType: 'for_each' }
              },
              style: getNodeStyle(childNode.type)
            };
            reconstructedNodes.push(actualChild);
            
            // Edge from previous node/button to this child
            reconstructedEdges.push({
              id: `e_${prevChildNodeId}_to_${childNode.id}`,
              source: prevChildNodeId,
              target: childNode.id,
              type: 'smoothstep',
              style: { stroke: '#f59e0b', strokeWidth: 2 }
            });
            
            childY += NODE_SPACING;
            
            // Add button after this child (except for the last one, which goes to connector)
            if (index < sortedChildren.length - 1) {
              const childAddButtonId = `add_after_${childNode.id}`;  // Stable ID
              reconstructedNodes.push({
                id: childAddButtonId,
                type: 'addButton',
                position: { x: CENTER_X - LOOP_SPACING + 20, y: childY },
                data: {
                  onClick: () => handleAddButtonClick(childAddButtonId, childNode.id),
                  loopContext: { loopNodeId, isInsideLoop: true, branchType: 'for_each' }
                }
              });
              
              reconstructedEdges.push({
                id: `e_${childNode.id}_to_${childAddButtonId}`,
                source: childNode.id,
                target: childAddButtonId,
                type: 'smoothstep',
                style: { stroke: '#f59e0b', strokeWidth: 2 }
              });
              
              childY += ADD_BUTTON_GAP;
              prevChildNodeId = childAddButtonId;
            } else {
              prevChildNodeId = childNode.id;
            }
          });
          
          forEachBranchEndNodeId = prevChildNodeId;
          
          // Add loop-back connector
          const connectorId = loopConnector?.id || `for_each_connector_${loopNodeId}`;
          const connectorNode = {
            id: connectorId,
            type: 'default',
            position: { x: CENTER_X - LOOP_SPACING + 20, y: childY },
            data: {
              label: '🔄 LOOP BACK',
              nodeType: 'connector',
              config: {
                connectorType: 'loop_back',
                loopNodeId: loopNodeId
              }
            },
            style: {
              background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
              border: '2px dashed #f59e0b',
              borderRadius: '10px',
              padding: '10px 16px',
              fontSize: '12px',
              fontWeight: '700',
              color: '#92400e',
              boxShadow: '0 2px 8px rgba(245, 158, 11, 0.2)'
            }
          };
          reconstructedNodes.push(connectorNode);
          
          // Edge from last child to connector
          reconstructedEdges.push({
            id: `e_${forEachBranchEndNodeId}_to_${connectorId}`,
            source: forEachBranchEndNodeId,
            target: connectorId,
            type: 'smoothstep',
            style: { stroke: '#f59e0b', strokeWidth: 2 }
          });
          
          // Edge from connector back to loop (dashed loop-back)
          reconstructedEdges.push({
            id: `e_${connectorId}_to_${loopNodeId}`,
            source: connectorId,
            target: loopNodeId,
            type: 'smoothstep',
            animated: true,
            style: { stroke: '#f59e0b', strokeWidth: 2, strokeDasharray: '8,4' }
          });
          
        } else {
          // No children - create empty For Each branch with add button and connector
          reconstructedNodes.push({
            id: forEachButtonId,
            type: 'addButton',
            position: { x: CENTER_X - LOOP_SPACING + 20, y: loopY + LOOP_VERTICAL },
            data: {
              onClick: () => handleAddButtonClick(forEachButtonId, loopNodeId),
              label: '🔁 Add to For Each',
              loopContext: { loopNodeId, isInsideLoop: true, branchType: 'for_each' }
            }
          });
          
          reconstructedEdges.push({
            id: `e_${loopNodeId}_to_for_each`,
            source: loopNodeId,
            sourceHandle: 'for-each',
            target: forEachButtonId,
            type: 'smoothstep',
            style: { stroke: '#f59e0b', strokeWidth: 2 }
          });
          
          // Add loop-back connector even with no children
          const connectorId = `for_each_connector_${loopNodeId}`;
          reconstructedNodes.push({
            id: connectorId,
            type: 'default',
            position: { x: CENTER_X - LOOP_SPACING + 20, y: loopY + LOOP_VERTICAL + NODE_SPACING },
            data: {
              label: '🔄 LOOP BACK',
              nodeType: 'connector',
              config: { connectorType: 'loop_back', loopNodeId }
            },
            style: {
              background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
              border: '2px dashed #f59e0b',
              borderRadius: '10px',
              padding: '10px 16px',
              fontSize: '12px',
              fontWeight: '700',
              color: '#92400e'
            }
          });
          
          reconstructedEdges.push({
            id: `e_${forEachButtonId}_to_${connectorId}`,
            source: forEachButtonId,
            target: connectorId,
            type: 'smoothstep',
            style: { stroke: '#f59e0b', strokeWidth: 2 }
          });
          
          reconstructedEdges.push({
            id: `e_${connectorId}_to_${loopNodeId}`,
            source: connectorId,
            target: loopNodeId,
            type: 'smoothstep',
            animated: true,
            style: { stroke: '#f59e0b', strokeWidth: 2, strokeDasharray: '8,4' }
          });
        }
        
        // ===== AFTER LAST BRANCH =====
        const afterLastButtonId = `add_after_last_${loopNodeId}`;
        reconstructedNodes.push({
          id: afterLastButtonId,
          type: 'addButton',
          position: { x: CENTER_X, y: loopY + LOOP_VERTICAL },
          data: {
            onClick: () => handleAddButtonClick(afterLastButtonId, loopNodeId),
            label: '▶️ Continue After Loop'
          }
        });
        
        reconstructedEdges.push({
          id: `e_${loopNodeId}_to_after_last`,
          source: loopNodeId,
          sourceHandle: 'after-last',
          target: afterLastButtonId,
          type: 'smoothstep',
          style: { stroke: '#3b82f6', strokeWidth: 2 }
        });
        
        currentY += LOOP_VERTICAL + NODE_SPACING;
        previousNodeId = afterLastButtonId;
        
        console.log(`🔄 Loop ${loopNodeId} reconstruction complete`);
      } else {
        currentY += NODE_SPACING;
      }
    });

    // 5. Check if last node is terminal
    const lastProcessedNode = reconstructedNodes[reconstructedNodes.length - 1];
    const isLastNodeTerminal = lastProcessedNode?.data?.nodeType === 'add_error' || 
                               lastProcessedNode?.type === 'add_error';

    // 6. Add final add button before end (if not terminal)
    if (!isLastNodeTerminal && previousNodeId) {
      const finalAddButtonId = `add_before_end`;  // Stable ID
      reconstructedNodes.push({
        id: finalAddButtonId,
        type: 'addButton',
        position: { x: CENTER_X, y: currentY },
        data: { onClick: () => handleAddButtonClick(finalAddButtonId, previousNodeId) }
      });
      reconstructedEdges.push(createStraightEdge(previousNodeId, finalAddButtonId));
      currentY += ADD_BUTTON_GAP;
      previousNodeId = finalAddButtonId;
    }

    // 7. Add End node
    const endNode = isScreenFlow ? {
      id: 'screen_flow_end',
      type: 'screen_flow_end',
      position: { x: CENTER_X, y: currentY },
      data: {
        label: 'End',
        nodeType: 'screen_flow_end',
        isSystemNode: true,
        config: {}
      },
      selectable: false,
      draggable: false,
    } : {
      id: 'end_node',
      type: 'default',
      position: { x: CENTER_X, y: currentY },
      data: {
        label: '🏁 END',
        nodeType: 'end',
        config: {}
      },
      style: {
        background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
        border: '2px solid #dc2626',
        borderRadius: '12px',
        padding: '16px',
        fontWeight: 'bold',
        color: 'white',
        minWidth: '180px',
        textAlign: 'center'
      }
    };
    reconstructedNodes.push(endNode);
    
    const endNodeId = isScreenFlow ? 'screen_flow_end' : 'end_node';
    reconstructedEdges.push(createStraightEdge(previousNodeId, endNodeId));

    console.log('✅ Reconstruction complete:', reconstructedNodes.length, 'nodes,', reconstructedEdges.length, 'edges');
    console.log('🔍 All reconstructed nodes:', JSON.stringify(reconstructedNodes.map(n => ({
      id: n.id,
      type: n.type,
      x: n.position?.x,
      y: n.position?.y
    }))));
    return { reconstructedNodes, reconstructedEdges };
  };

  const onConnect = useCallback(
    (params) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  const onNodeClick = useCallback((event, node) => {
    // Don't select add button nodes
    if (node.type !== 'addButton') {
      // Check if this is a non-clickable system node (Screen Flow Start/End)
      const nodeType = node.data?.nodeType || node.type;
      const isSystemNode = node.data?.isSystemNode || 
                          nodeType === 'screen_flow_start' || 
                          nodeType === 'screen_flow_end' ||
                          node.type === 'screen_flow_start' ||
                          node.type === 'screen_flow_end';
      
      if (isSystemNode) {
        console.log('🚫 System node clicked - non-editable, no config panel:', nodeType);
        return; // Do nothing - System nodes are non-clickable
      }
      
      // Requirement #5: End node is non-editable - don't open config panel
      if (nodeType === 'end' || node.id === 'end_node') {
        console.log('🚫 End node clicked - non-editable, no config panel');
        return; // Do nothing - End node is read-only
      }
      
      setSelectedNode(node);
      setConfigPanelKey(prev => prev + 1); // Increment key to force fresh mount
    }
  }, []);

  const handleAddButtonClick = (addButtonId, afterNodeId) => {
    setInsertAfterNodeId(afterNodeId);
    setShowAddActionMenu(true);
    setAddActionPosition(addButtonId);
  };

  const handleActionSelect = (action) => {
    console.log('🎬 Action selected:', action);
    
    // Check if we're adding to a decision outcome
    const decisionOutcome = window._currentDecisionOutcome;
    
    if (decisionOutcome) {
      console.log('📍 Adding node to decision outcome:', decisionOutcome);
      handleAddNodeToDecisionOutcome(action, decisionOutcome);
      window._currentDecisionOutcome = null;
      return;
    }
    
    const newNodeId = `${action.type}_${Date.now()}`;
    
    // Find the position of the add button we clicked
    const addButtonNode = nodes.find(n => n.id === addActionPosition);
    if (!addButtonNode) {
      console.error('Add button not found:', addActionPosition);
      return;
    }

    // Calculate new node position
    const xPosition = addButtonNode.position.x;
    const yPosition = addButtonNode.position.y;
    
    // Check if we're inside a decision branch
    const decisionContext = addButtonNode.data?.decisionContext;
    const loopContext = addButtonNode.data?.loopContext;

    // Create new action node (use custom type for loop, decision, delay, screen, and add_error)
    const newNode = {
      id: newNodeId,
      type: action.nodeType === 'loop' ? 'loop' : 
            (action.nodeType === 'decision' ? 'decision' : 
            (action.nodeType === 'delay' ? 'delay' : 
            (action.nodeType === 'screen' ? 'screen' :
            (action.nodeType === 'add_error' ? 'add_error' : 'default')))),
      position: { x: xPosition, y: yPosition },
      data: {
        label: action.label,
        nodeType: action.nodeType,
        config: action.config || {},
        // Preserve decision context if inside a decision branch
        ...(decisionContext && { decisionContext }),
        // Preserve loop context if inside a loop
        ...(loopContext && { loopContext })
      },
      style: action.nodeType === 'loop' || action.nodeType === 'screen' || action.nodeType === 'add_error' ? {} : getNodeStyle(action.nodeType)
    };

    // Special handling for decision nodes - CLEAN SEPARATION, NO MERGE NODES
    if (action.nodeType === 'decision') {
      // Initialize outcomes if not present
      if (!newNode.data.config.outcomes || newNode.data.config.outcomes.length === 0) {
        newNode.data.config.outcomes = [
          {
            name: 'outcome_1',
            label: 'Outcome 1',
            matchType: 'all',
            conditions: [],
            isDefault: false
          },
          {
            name: 'default',
            label: 'Default Outcome',
            isDefault: true,
            conditions: []
          }
        ];
      }
      
      // Add handlers
      newNode.data.onOutcomePlusClick = handleOutcomePlusClick;
      
      // Update nodes below to make space (decision is tall)
      const updatedNodes = nodes.map(node => {
        const shouldPushDown = node.position.y > yPosition && node.id !== addActionPosition;
        if (shouldPushDown) {
          return {
            ...node,
            position: { ...node.position, y: node.position.y + 400 }
          };
        }
        return node;
      }).filter(n => n.id !== addActionPosition);
      
      // Add decision node
      updatedNodes.push(newNode);
      
      // Create new add button BELOW decision (for merged continuation flow)
      const newAddButtonId = `add_button_after_decision_${Date.now()}`;
      const newAddButton = {
        id: newAddButtonId,
        type: 'addButton',
        position: { x: xPosition, y: yPosition + 360 },
        data: {
          onClick: () => handleAddButtonClick(newAddButtonId, newNodeId)
        }
      };
      updatedNodes.push(newAddButton);
      
      // Build new edges - CLEAN, NO CROSS-CONNECTIONS
      const newEdges = [];
      
      // Keep existing edges that don't involve the add button we're replacing
      edges.forEach(edge => {
        if (edge.source !== addActionPosition && edge.target !== addActionPosition) {
          newEdges.push(edge);
        }
      });
      
      // Edge from previous node to decision TOP
      newEdges.push({
        id: `e_${insertAfterNodeId}_to_${newNodeId}`,
        source: insertAfterNodeId,
        target: newNodeId,
        targetHandle: 'input',
        type: 'smoothstep',
        animated: true,
        style: { strokeWidth: 2 }
      });
      
      // Edge from decision MERGED-OUTPUT (bottom) to new add button
      // This is the ONLY edge from decision in the main flow
      newEdges.push({
        id: `e_${newNodeId}_merged_to_${newAddButtonId}`,
        source: newNodeId,
        sourceHandle: 'merged-output',
        target: newAddButtonId,
        type: 'smoothstep',
        animated: true,
        style: { strokeWidth: 2, stroke: '#94a3b8' }
      });
      
      // Edge from new add button to whatever was after the old add button
      const oldTargetEdge = edges.find(e => e.source === addActionPosition);
      if (oldTargetEdge) {
        newEdges.push({
          id: `e_${newAddButtonId}_to_${oldTargetEdge.target}`,
          source: newAddButtonId,
          target: oldTargetEdge.target,
          type: 'smoothstep',
          animated: true,
          style: { strokeWidth: 2 }
        });
      }

      // DO NOT create any outcome edges here - they will be created when nodes are added to outcomes
      
      setNodes(updatedNodes);
      setEdges(newEdges);
      setShowAddActionMenu(false);
      toast.success('Decision node added! Click + on outcomes to add actions');
      
      // FIX #2: Auto-open config panel for decision node
      setTimeout(() => {
        setSelectedNode(newNode);
        setConfigPanelKey(prev => prev + 1);
        console.log('📝 Auto-opened config panel for decision node:', newNodeId);
      }, 100);
      return;
    }

    // Special handling for loop nodes - Salesforce-like structure
    let loopForEachButtonId, loopAfterLastButtonId, forEachConnectorId;
    if (action.nodeType === 'loop') {
      const LOOP_SPACING = 250; // Horizontal spacing for loop branches
      const LOOP_VERTICAL_SPACING = 180; // Extra vertical spacing for loop structure
      
      // Create a connector node for "For Each" that loops back
      forEachConnectorId = `for_each_connector_${Date.now()}`;
      const forEachConnector = {
        id: forEachConnectorId,
        type: 'default',
        position: { x: 250 - LOOP_SPACING, y: yPosition + (LOOP_VERTICAL_SPACING * 2.5) }, // Left side, below loop content
        data: {
          label: '🔄 LOOP BACK',
          nodeType: 'connector',
          config: {
            connectorType: 'loop_back',
            loopNodeId: newNodeId
          }
        },
        style: {
          background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
          border: '2px dashed #f59e0b',
          borderRadius: '10px',
          padding: '10px 16px',
          fontSize: '12px',
          fontWeight: '700',
          color: '#92400e',
          boxShadow: '0 2px 8px rgba(245, 158, 11, 0.2)'
        }
      };

      // Create add button for "For Each" branch (left side)
      loopForEachButtonId = `add_button_for_each_${Date.now()}`;
      const forEachButton = {
        id: loopForEachButtonId,
        type: 'addButton',
        position: { x: 250 - LOOP_SPACING + 20, y: yPosition + LOOP_VERTICAL_SPACING }, // Left side with offset
        data: {
          onClick: () => handleAddButtonClick(loopForEachButtonId, newNodeId),
          label: '🔁 Add to For Each',
          loopContext: {
            loopNodeId: newNodeId,
            isInsideLoop: true,
            branchType: 'for_each'
          },
          branchInfo: {
            type: 'for_each',
            sourceHandle: 'for-each'
          }
        }
      };

      // Create add button for "After Last" branch (main flow continues)
      loopAfterLastButtonId = `add_button_after_last_${Date.now() + 1}`;
      const afterLastButton = {
        id: loopAfterLastButtonId,
        type: 'addButton',
        position: { x: 250, y: yPosition + LOOP_VERTICAL_SPACING }, // Main flow position
        data: {
          onClick: () => handleAddButtonClick(loopAfterLastButtonId, newNodeId),
          label: '▶️ Continue After Loop',
          // NO loopContext - this is main flow!
          branchInfo: {
            type: 'after_last',
            sourceHandle: 'after-last',
            isMainFlow: true
          }
        }
      };

      // Calculate how much space the loop structure needs
      const loopStructureHeight = LOOP_VERTICAL_SPACING * 3;
      
      // Update all nodes - only push down nodes in MAIN flow (not in other loops)
      const updatedNodes = nodes.map(node => {
        const nodeIsInLoop = node.data?.loopContext?.isInsideLoop;
        const shouldPushDown = node.position.y > yPosition && 
                               node.id !== addActionPosition && 
                               !nodeIsInLoop; // Don't push loop nodes
        
        if (shouldPushDown) {
          return {
            ...node,
            position: { ...node.position, y: node.position.y + loopStructureHeight }
          };
        }
        return node;
      }).filter(n => n.id !== addActionPosition);

      // Insert new nodes
      updatedNodes.push(newNode, forEachButton, afterLastButton, forEachConnector);

      // Build new edges
      const newEdges = [];
      
      edges.forEach(edge => {
        if (edge.source !== addActionPosition && edge.target !== addActionPosition) {
          newEdges.push(edge);
        }
      });
      
      // Edge from previous node to loop node
      newEdges.push({
        id: `e_${insertAfterNodeId}_to_${newNodeId}`,
        source: insertAfterNodeId,
        target: newNodeId,
        type: 'smoothstep',
        animated: true,
        style: { strokeWidth: 2 }
      });
      
      // Edge from loop "For Each" handle to for each add button
      newEdges.push({
        id: `e_${newNodeId}_for_each_to_${loopForEachButtonId}`,
        source: newNodeId,
        sourceHandle: 'for-each',
        target: loopForEachButtonId,
        type: 'smoothstep',
        animated: true,
        style: { stroke: '#f59e0b', strokeWidth: 2.5 } // Amber color
      });

      // Edge from for each add button to connector (loops back)
      newEdges.push({
        id: `e_${loopForEachButtonId}_to_${forEachConnectorId}`,
        source: loopForEachButtonId,
        target: forEachConnectorId,
        type: 'smoothstep',
        animated: true,
        style: { stroke: '#f59e0b', strokeWidth: 2 }
      });

      // Edge from connector back to loop node (creates the loop)
      newEdges.push({
        id: `e_${forEachConnectorId}_to_${newNodeId}`,
        source: forEachConnectorId,
        target: newNodeId,
        type: 'smoothstep',
        animated: true,
        style: { stroke: '#f59e0b', strokeWidth: 2, strokeDasharray: '8,4' }
      });
      
      // Edge from loop "After Last" handle to after last add button
      newEdges.push({
        id: `e_${newNodeId}_after_last_to_${loopAfterLastButtonId}`,
        source: newNodeId,
        sourceHandle: 'after-last',
        target: loopAfterLastButtonId,
        type: 'smoothstep',
        animated: true,
        style: { stroke: '#3b82f6', strokeWidth: 2.5 } // Blue color
      });
      
      // Edge from after last add button to whatever was after the old add button
      const oldTargetEdge = edges.find(e => e.source === addActionPosition);
      if (oldTargetEdge) {
        newEdges.push({
          id: `e_${loopAfterLastButtonId}_to_${oldTargetEdge.target}`,
          source: loopAfterLastButtonId,
          target: oldTargetEdge.target,
          type: 'smoothstep',
          animated: true,
          style: { stroke: '#3b82f6', strokeWidth: 2 }
        });
      }

      setNodes(updatedNodes);
      setEdges(newEdges);
      setShowAddActionMenu(false);
      toast.success('Loop node added! Add actions to "For Each" or continue in main flow');
      
      // FIX #2: Auto-open config panel for loop node
      setTimeout(() => {
        setSelectedNode(newNode);
        setConfigPanelKey(prev => prev + 1);
        console.log('📝 Auto-opened config panel for loop node:', newNodeId);
      }, 100);
      return;
    }

    // Check if we're adding inside a decision branch or For Each loop or in After Last branch
    const addButtonData = nodes.find(n => n.id === addActionPosition)?.data;
    const isInsideLoop = addButtonData?.loopContext?.isInsideLoop; // Only true for "For Each" branch
    const loopNodeId = addButtonData?.loopContext?.loopNodeId;
    const isInsideDecision = addButtonData?.decisionContext?.isInsideDecision;
    const decisionNodeId = addButtonData?.decisionContext?.decisionNodeId;
    const branchInfo = addButtonData?.branchInfo;
    
    // Find the edge that connects TO this add button to determine the correct sourceHandle
    const edgeToAddButton = edges.find(e => e.target === addActionPosition);
    const incomingSourceHandle = edgeToAddButton?.sourceHandle; // Could be 'for-each' or 'after-last' or 'outcome-X'
    
    // Determine branch type - CRITICAL for proper flow separation
    const isAfterLastBranch = branchInfo?.type === 'after_last' || incomingSourceHandle === 'after-last';
    const isForEachBranch = isInsideLoop && branchInfo?.type === 'for_each';
    const isDecisionOutcome = isInsideDecision && branchInfo?.type === 'decision_outcome';
    
    console.log('Adding node:', { 
      isInsideLoop, 
      isInsideDecision,
      isAfterLastBranch, 
      isForEachBranch,
      isDecisionOutcome,
      incomingSourceHandle,
      branchInfo,
      decisionContext
    });

    // Determine X position based on branch type
    const LOOP_OFFSET = 250;
    let baseXPosition = xPosition; // Use button's x position (preserves decision branch positioning)
    
    if (isForEachBranch) {
      // For Each branch: left side
      baseXPosition = 250 - LOOP_OFFSET + 20;
    } else if (isAfterLastBranch) {
      // After Last branch: stays in center (main flow)
      baseXPosition = 250;
    }
    // For decision outcomes, baseXPosition is already set correctly from xPosition
    
    // Create new add button BEFORE this node (for proper Salesforce-style connectors)
    // Position: same Y as where the clicked add button was (it gets replaced by the new structure)
    const newAddButtonBeforeId = `add_button_before_${Date.now()}`;
    const newAddButtonBefore = {
      id: newAddButtonBeforeId,
      type: 'addButton',
      position: { x: baseXPosition, y: yPosition },  // At clicked add button position
      data: {
        onClick: () => handleAddButtonClick(newAddButtonBeforeId, insertAfterNodeId),
        // Preserve context for branches
        ...(isForEachBranch && { 
          loopContext: { 
            loopNodeId, 
            isInsideLoop: true, 
            branchType: 'for_each' 
          }
        }),
        ...(isDecisionOutcome && {
          decisionContext: addButtonData.decisionContext
        }),
        ...(branchInfo && { branchInfo })
      }
    };

    // Create new add button AFTER this node
    const newAddButtonId = `add_button_${Date.now() + 1}`;
    const newAddButton = {
      id: newAddButtonId,
      type: 'addButton',
      position: { x: baseXPosition, y: yPosition + (2 * VERTICAL_SPACING) },  // Two steps down
      data: {
        onClick: () => handleAddButtonClick(newAddButtonId, newNodeId),
        label: isForEachBranch ? '🔁 Add to For Each' : isAfterLastBranch ? '▶️ Continue After Loop' : isDecisionOutcome ? '+ Add Action' : undefined,
        // Only add loopContext for "For Each" branch
        ...(isForEachBranch && { 
          loopContext: { 
            loopNodeId, 
            isInsideLoop: true, 
            branchType: 'for_each' 
          }
        }),
        // Preserve decision context for decision branches
        ...(isDecisionOutcome && {
          decisionContext: addButtonData.decisionContext
        }),
        // Preserve branchInfo for proper tracking
        ...(branchInfo && { branchInfo })
      }
    };

    // Update node position based on branch - place it between the two add buttons
    newNode.position = { x: baseXPosition, y: yPosition + VERTICAL_SPACING };

    // ONLY add loopContext for "For Each" branch nodes
    if (isForEachBranch && loopNodeId) {
      const loopNode = nodes.find(n => n.id === loopNodeId);
      const loopCollectionVariable = loopNode?.data?.config?.collection_variable;
      
      newNode.data.loopContext = {
        loopNodeId,
        collectionVariable: loopCollectionVariable,
        isInsideLoop: true,
        branchType: 'for_each'
      };
      
      console.log(`✅ Added node ${newNodeId} to FOR EACH branch with loopContext:`, newNode.data.loopContext);
    } else {
      console.log(`ℹ️ Added node ${newNodeId} to MAIN FLOW (no loopContext)`);
    }
    // After Last branch nodes should NOT have loopContext - they're in main flow

    // Update all nodes - push down appropriately based on branch
    const updatedNodes = nodes.map(node => {
      // Determine if this node should be pushed down
      let shouldPushDown = false;
      
      if (isForEachBranch) {
        // Pushing down "For Each" nodes: only affect other "For Each" nodes in same loop
        const nodeIsInSameLoop = node.data?.loopContext?.isInsideLoop && 
                                 node.data?.loopContext?.loopNodeId === loopNodeId;
        shouldPushDown = node.position.y > yPosition && 
                        node.id !== addActionPosition && 
                        nodeIsInSameLoop;
      } else {
        // Pushing down main flow nodes: only affect nodes NOT in any loop
        const nodeIsInAnyLoop = node.data?.loopContext?.isInsideLoop;
        shouldPushDown = node.position.y > yPosition && 
                        node.id !== addActionPosition && 
                        !nodeIsInAnyLoop;
      }
      
      if (shouldPushDown) {
        return {
          ...node,
          position: { ...node.position, y: node.position.y + (2 * VERTICAL_SPACING) }
        };
      }
      return node;
    }).filter(n => n.id !== addActionPosition);

    // Insert new nodes (add button before, new node, add button after)
    updatedNodes.push(newAddButtonBefore, newNode, newAddButton);

    // Build new edges
    const newEdges = [];
    
    // Check if we're inserting after a trigger node (start node)
    const isTriggerSource = insertAfterNodeId && (
      insertAfterNodeId.includes('trigger_start') ||
      insertAfterNodeId.includes('webhook_trigger') ||
      insertAfterNodeId.includes('scheduled_trigger') ||
      insertAfterNodeId === 'trigger_start' ||
      insertAfterNodeId === 'webhook_trigger_start' ||
      insertAfterNodeId === 'scheduled_trigger_start'
    );
    
    // Keep all edges that don't involve the old add button
    edges.forEach(edge => {
      if (edge.source !== addActionPosition && edge.target !== addActionPosition) {
        newEdges.push(edge);
      }
    });
    
    // Determine sourceHandle and edge style based on branch
    // CRITICAL: For trigger nodes, don't use sourceHandle as they use default handle
    let sourceHandleForNewNode = isTriggerSource ? undefined : incomingSourceHandle;
    let edgeStyle = { strokeWidth: 2 };
    
    if (isForEachBranch) {
      edgeStyle = { stroke: '#f59e0b', strokeWidth: 2.5 }; // Amber for For Each
    } else if (isAfterLastBranch) {
      edgeStyle = { stroke: '#3b82f6', strokeWidth: 2.5 }; // Blue for After Last
    }
    
    // Edge from previous node (or trigger) to add button BEFORE new node
    // For trigger nodes: use simple edge without sourceHandle
    const edgeFromPrevious = {
      id: `e_${insertAfterNodeId}_to_${newAddButtonBeforeId}`,
      source: insertAfterNodeId,
      target: newAddButtonBeforeId,
      type: 'smoothstep',
      animated: true,
      style: isTriggerSource ? { stroke: '#94a3b8', strokeWidth: 2 } : edgeStyle
    };
    
    // Only add sourceHandle if it's defined and not a trigger source
    if (sourceHandleForNewNode && !isTriggerSource) {
      edgeFromPrevious.sourceHandle = sourceHandleForNewNode;
    }
    
    newEdges.push(edgeFromPrevious);
    
    // Edge from add button BEFORE to new node
    newEdges.push({
      id: `e_${newAddButtonBeforeId}_to_${newNodeId}`,
      source: newAddButtonBeforeId,
      target: newNodeId,
      type: 'smoothstep',
      animated: true,
      style: edgeStyle
    });
    
    // Edge from new node to new add button (only if not a terminal node)
    // Terminal nodes: add_error - these connect directly to END
    // For Add Error: We still want to preserve the ability to add nodes BEFORE it
    // So we only skip creating the add button AFTER the Add Error node
    const isTerminalNode = action.nodeType === 'add_error';
    
    if (!isTerminalNode) {
      newEdges.push({
        id: `e_${newNodeId}_to_${newAddButtonId}`,
        source: newNodeId,
        target: newAddButtonId,
        type: 'smoothstep',
        animated: true,
        style: edgeStyle
      });
    }
    
    // Edge from new add button to whatever was after the old add button (only if not terminal)
    const oldTargetEdge = edges.find(e => e.source === addActionPosition);
    console.log('🔍 Looking for old target edge:', { addActionPosition, oldTargetEdge, allEdges: edges.map(e => ({ id: e.id, source: e.source, target: e.target })) });
    
    if (oldTargetEdge && !isTerminalNode) {
      newEdges.push({
        id: `e_${newAddButtonId}_to_${oldTargetEdge.target}`,
        source: newAddButtonId,
        target: oldTargetEdge.target,
        sourceHandle: oldTargetEdge.sourceHandle,
        targetHandle: oldTargetEdge.targetHandle,
        type: 'smoothstep',
        animated: true,
        style: edgeStyle
      });
    } else if (!isTerminalNode) {
      // FALLBACK: If no edge found from the clicked add button, find the next element in the flow
      // This handles cases where edges might have been lost or not properly created
      console.warn('⚠️ No edge found from clicked add button, attempting fallback...');
      
      // Find the next node by position (the node that was supposed to come after the add button)
      const addButtonY = yPosition;
      const nodesAfterButton = updatedNodes.filter(n => 
        n.position.y > addButtonY && 
        n.id !== newNodeId && 
        n.id !== newAddButtonId && 
        n.id !== newAddButtonBeforeId &&
        n.type !== 'addButton'
      ).sort((a, b) => a.position.y - b.position.y);
      
      // The immediate next node should be either another action node or the END node
      const nextNode = nodesAfterButton[0];
      
      if (nextNode) {
        console.log('✅ Fallback: Found next node by position:', nextNode.id);
        newEdges.push({
          id: `e_${newAddButtonId}_to_${nextNode.id}`,
          source: newAddButtonId,
          target: nextNode.id,
          type: 'smoothstep',
          animated: true,
          style: edgeStyle
        });
      } else {
        // Ultimate fallback: Connect to END node
        const endNode = updatedNodes.find(n => 
          n.data?.nodeType === 'end' || 
          n.id?.startsWith('end_') || 
          n.id === 'end_node'
        );
        
        if (endNode) {
          console.log('✅ Fallback: Connecting to END node:', endNode.id);
          newEdges.push({
            id: `e_${newAddButtonId}_to_${endNode.id}`,
            source: newAddButtonId,
            target: endNode.id,
            type: 'smoothstep',
            animated: true,
            style: edgeStyle
          });
        } else {
          console.error('❌ CRITICAL: Could not find any node to connect to after new add button!');
        }
      }
    }
    
    // For Add Error nodes: Connect directly to the END node (Salesforce behavior)
    // Find the END node in the flow and create a direct connection
    if (isTerminalNode) {
      // Find END node - look in updatedNodes since that's our working array
      // END nodes can be: type='default' with nodeType='end', or id starting with 'end_'
      let endNode = updatedNodes.find(n => 
        n.type === 'end' || 
        n.data?.nodeType === 'end' ||
        n.id?.startsWith('end_') ||
        n.id === 'end' ||
        n.data?.label?.toLowerCase() === 'end'
      );
      
      // Also check in original nodes array if not found
      if (!endNode) {
        endNode = nodes.find(n => 
          n.type === 'end' || 
          n.data?.nodeType === 'end' ||
          n.id?.startsWith('end_') ||
          n.id === 'end' ||
          n.data?.label?.toLowerCase() === 'end'
        );
      }
      
      console.log('🔍 Looking for END node:', { endNode, updatedNodesCount: updatedNodes.length });
      
      if (endNode) {
        // Create direct edge from Add Error to END
        newEdges.push({
          id: `e_${newNodeId}_to_${endNode.id}`,
          source: newNodeId,
          target: endNode.id,
          type: 'smoothstep',
          animated: false,
          style: { stroke: '#64748b', strokeWidth: 2 }  // Gray color for terminal connection
        });
        console.log(`📍 Add Error node connected directly to END: ${endNode.id}`);
      } else {
        // Create a new END node if one doesn't exist
        const newEndId = `end_${Date.now()}`;
        const errorNodeForPosition = updatedNodes.find(n => n.id === newNodeId);
        const newEndNode = {
          id: newEndId,
          type: 'default',
          position: {
            x: errorNodeForPosition?.position?.x || 400,
            y: (errorNodeForPosition?.position?.y || 300) + 120
          },
          data: {
            label: 'End',
            nodeType: 'end',
            config: {}
          }
        };
        updatedNodes.push(newEndNode);
        
        newEdges.push({
          id: `e_${newNodeId}_to_${newEndId}`,
          source: newNodeId,
          target: newEndId,
          type: 'smoothstep',
          animated: false,
          style: { stroke: '#64748b', strokeWidth: 2 }
        });
        console.log(`📍 Created new END node and connected Add Error to it: ${newEndId}`);
      }
      
      // Remove the add button node for terminal nodes (Add Error)
      // This prevents adding nodes AFTER the error node, but nodes can still be added BEFORE
      const addButtonIndex = updatedNodes.findIndex(n => n.id === newAddButtonId);
      if (addButtonIndex !== -1) {
        updatedNodes.splice(addButtonIndex, 1);
        console.log(`🗑️ Removed add button after error: ${newAddButtonId}`);
      }
    }

    // VALIDATION GUARD: Ensure trigger nodes have outgoing edges (auto-repair if needed)
    const triggerNodeIds = ['trigger_start', 'webhook_trigger_start', 'scheduled_trigger_start'];
    const allTriggerNodes = updatedNodes.filter(n => 
      triggerNodeIds.includes(n.id) ||
      n.id?.includes('trigger_start') ||
      n.type === 'trigger' ||
      n.type === 'webhook_trigger' ||
      n.type === 'scheduled_trigger'
    );
    
    allTriggerNodes.forEach(triggerNode => {
      const hasOutgoingEdge = newEdges.some(e => e.source === triggerNode.id);
      if (!hasOutgoingEdge) {
        console.warn(`⚠️ AUTO-REPAIR: Trigger ${triggerNode.id} has no outgoing edge, reconnecting...`);
        // Find the first add button or node by Y position to connect to
        const nodesAfterTrigger = updatedNodes
          .filter(n => n.position.y > triggerNode.position.y && n.id !== triggerNode.id)
          .sort((a, b) => a.position.y - b.position.y);
        
        const nextElement = nodesAfterTrigger[0];
        if (nextElement) {
          newEdges.push({
            id: `e_autorepair_${triggerNode.id}_to_${nextElement.id}`,
            source: triggerNode.id,
            target: nextElement.id,
            type: 'smoothstep',
            animated: false,
            style: { stroke: '#94a3b8', strokeWidth: 2 }
          });
          console.log(`✅ AUTO-REPAIR: Connected ${triggerNode.id} → ${nextElement.id}`);
        }
      }
    });

    setNodes(updatedNodes);
    setEdges(newEdges);
    setShowAddActionMenu(false);
    
    const message = isForEachBranch
      ? `Node added to For Each loop (iterates over collection)` 
      : isAfterLastBranch
        ? 'Node added to After Last branch (runs after loop completes)'
        : 'Node added successfully';
    toast.success(message);
    
    // Log the final state of the new node
    console.log(`📊 Final node state for ${newNodeId}:`, {
      id: newNodeId,
      type: newNode.type,
      position: newNode.position,
      hasLoopContext: !!newNode.data?.loopContext,
      loopContext: newNode.data?.loopContext,
      fullData: newNode.data
    });
    
    // FIX #2: Auto-open config panel for newly added node
    // Use setTimeout to ensure state updates have completed
    setTimeout(() => {
      setSelectedNode(newNode);
      setConfigPanelKey(prev => prev + 1);
      console.log('📝 Auto-opened config panel for new node:', newNodeId);
    }, 100);
  };

  const handleAddNodeToDecisionOutcome = (action, decisionOutcome) => {
    console.log('🎯 Adding node to decision outcome:', { action, decisionOutcome });
    
    const { decisionNodeId, outcomeIndex, isDefault } = decisionOutcome;
    const newNodeId = `${action.type}_${Date.now()}`;
    
    // Find the decision node
    const decisionNode = nodes.find(n => n.id === decisionNodeId);
    if (!decisionNode) {
      console.error('Decision node not found:', decisionNodeId);
      return;
    }
    
    // Create the new node data (NOT a React Flow node, just data)
    const newNodeData = {
      id: newNodeId,
      label: action.label,
      nodeType: action.nodeType,
      config: action.config || {},
      style: action.nodeType === 'loop' || action.nodeType === 'screen' ? {} : getNodeStyle(action.nodeType),
      onClick: (nodeId) => {
        // Handle node click - e.g., open config panel
        const node = nodes.find(n => n.id === decisionNodeId);
        if (node) {
          const outcomeKey = isDefault ? 'default' : outcomeIndex;
          const nodeData = node.data.outcomeNodes?.[outcomeKey]?.find(n => n.id === nodeId);
          if (nodeData) {
            // Open config for this node
            setSelectedNode({
              id: nodeId,
              data: nodeData,
              type: nodeData.nodeType
            });
          }
        }
      }
    };
    
    // Update the Decision Node with new outcome nodes
    setNodes(nds => nds.map(n => {
      if (n.id === decisionNodeId) {
        const outcomeNodes = { ...(n.data.outcomeNodes || {}) };
        const outcomeKey = isDefault ? 'default' : outcomeIndex;
        
        if (!outcomeNodes[outcomeKey]) {
          outcomeNodes[outcomeKey] = [];
        }
        
        outcomeNodes[outcomeKey] = [...outcomeNodes[outcomeKey], newNodeData];
        
        console.log('✅ Updated outcomeNodes:', outcomeNodes);
        
        return {
          ...n,
          data: {
            ...n.data,
            outcomeNodes,
            nodeKey: Date.now(), // Force remount
            onHeightChange: handleDecisionHeightChange // Pass callback
          }
        };
      }
      return n;
    }));
    
    setShowAddActionMenu(false);
    toast.success(`Added ${action.label} to ${isDefault ? 'default outcome' : `outcome ${outcomeIndex + 1}`}`);
  };
  
  // Handle Decision node height changes and reposition nodes below
  const handleDecisionHeightChange = useCallback((decisionNodeId, newHeight) => {
    console.log(`📏 Decision node ${decisionNodeId} height changed to: ${newHeight}px`);
    
    setNodes(nds => {
      const decisionNode = nds.find(n => n.id === decisionNodeId);
      if (!decisionNode) {
        console.error('Decision node not found in handleDecisionHeightChange');
        return nds;
      }
      
      // Calculate END node position based on the maximum Y position of all nodes
      const maxNodeY = nds.reduce((max, node) => {
        if (node.type !== 'default' || node.data?.nodeType !== 'end') {
          return Math.max(max, node.position.y);
        }
        return max;
      }, 0);
      
      const newEndY = maxNodeY + 250; // 250px below the lowest non-END node
      
      console.log(`📍 Calculated END Y position: ${newEndY} (Max node Y: ${maxNodeY} + Gap: 250)`);
      
      return nds.map(n => {
        // Find and reposition END node
        if (n.type === 'default' && n.data?.nodeType === 'end') {
          const currentY = n.position.y;
          console.log(`🎯 Found END node at Y=${currentY}, moving to Y=${newEndY}`);
          return {
            ...n,
            position: {
              ...n.position,
              y: newEndY
            }
          };
        }
        return n;
      });
    });
    
    // Force React Flow to update edges after position change
    setTimeout(() => {
      if (reactFlowInstance) {
        console.log('🔄 Calling fitView to update layout');
        reactFlowInstance.fitView({ duration: 300, padding: 0.2 });
      }
    }, 150);
  }, [reactFlowInstance]);

  const getNodeStyle = (nodeType) => {
    const baseStyles = {
      borderRadius: '12px',
      padding: '16px',
      fontWeight: 'bold',
      minWidth: '180px',
      textAlign: 'center'
    };

    const styles = {
      connector: {
        background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
        border: '2px solid #7c3aed',
        color: 'white',
        ...baseStyles
      },
      mcp: {
        background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
        border: '2px solid #2563eb',
        borderRadius: '12px',
        padding: '16px',
        fontWeight: 'bold',
        color: 'white',
        minWidth: '180px',
        textAlign: 'center'
      },
      webhook: {
        background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
        border: '2px solid #4f46e5',
        borderRadius: '12px',
        padding: '16px',
        fontWeight: 'bold',
        color: 'white',
        minWidth: '180px',
        textAlign: 'center'
      },
      assignment: {
        background: 'linear-gradient(135deg, #a855f7 0%, #9333ea 100%)',
        border: '2px solid #9333ea',
        borderRadius: '12px',
        padding: '16px',
        fontWeight: 'bold',
        color: 'white',
        minWidth: '180px',
        textAlign: 'center'
      },
      decision: {
        borderRadius: '12px',
        padding: '16px',
        fontWeight: 'bold',
        color: 'white',
        minWidth: '180px',
        textAlign: 'center'
      },
      condition: {
        background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
        border: '2px solid #d97706',
        borderRadius: '12px',
        padding: '16px',
        fontWeight: 'bold',
        color: 'white',
        minWidth: '180px',
        textAlign: 'center'
      },
      ai_prompt: {
        background: 'linear-gradient(135deg, #ec4899 0%, #be185d 100%)',
        border: '2px solid #be185d',
        borderRadius: '12px',
        padding: '16px',
        fontWeight: 'bold',
        color: 'white',
        minWidth: '180px',
        textAlign: 'center'
      },
      action: {
        background: 'linear-gradient(135deg, #6b7280 0%, #4b5563 100%)',
        border: '2px solid #4b5563',
        borderRadius: '12px',
        padding: '16px',
        fontWeight: 'bold',
        color: 'white',
        minWidth: '180px',
        textAlign: 'center'
      }
    };
    return styles[nodeType] || styles.action;
  };

  const onUpdateNodeConfig = (nodeId, config, label) => {
    console.log('🔄 ===== onUpdateNodeConfig CALLED =====');
    console.log('🔄 nodeId:', nodeId);
    console.log('🔄 config:', config);
    console.log('🔄 Timestamp:', new Date().toISOString());
    
    // CRITICAL FIX: Store in ref immediately for synchronous access
    pendingNodeUpdates.current[nodeId] = { config, label, timestamp: Date.now() };
    console.log('🔄 ✅ Stored update in pendingNodeUpdates ref for immediate access');
    
    // Log Toast count if this is a screen node
    if (config.fields) {
      const toastCount = config.fields.filter(f => f.type === 'Toast').length;
      console.log(`🔄 Config has ${config.fields.length} components (${toastCount} toasts)`);
      if (toastCount > 0) {
        console.log('🔄 ✅ Toast components in config:', config.fields.filter(f => f.type === 'Toast').map(t => ({
          id: t.id,
          title: t.title,
          message: t.message?.substring(0, 50)
        })));
      }
    }
    
    // Step 1: Update node data
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === nodeId) {
          // FIX: Also update triggers state when trigger node config changes
          // This ensures TriggerNode component displays the latest config
          if (node.type === 'trigger' || node.data?.nodeType === 'trigger') {
            console.log('🔄 Updating triggers state for trigger node');
            setTriggers(prevTriggers => {
              if (prevTriggers.length > 0) {
                return [{
                  ...prevTriggers[0],
                  config: config
                }];
              }
              return [{ type: 'trigger', config: config }];
            });
          }
          
          const updatedNode = {
            ...node,
            data: {
              ...node.data,
              config,
              label: label || node.data.label,
              // Also update triggers array inside the node data for TriggerNode to read
              triggers: node.type === 'trigger' || node.data?.nodeType === 'trigger' 
                ? [{ type: node.data?.nodeType || 'trigger', config: config }]
                : node.data.triggers,
              onOutcomeClick: node.type === 'decision' ? (outcomeIndex) => {
                console.log(`Outcome ${outcomeIndex} clicked for decision ${nodeId}`);
              } : undefined,
              onAddOutcome: node.type === 'decision' ? handleAddOutcome : undefined,
              onOutcomePlusClick: node.type === 'decision' ? handleOutcomePlusClick : undefined,
              onHeightChange: node.type === 'decision' ? handleDecisionHeightChange : undefined
            }
          };
          
          console.log('🔄 Updated node.data.config with new config');
          console.log('🔄 Updated node Toast count:', updatedNode.data.config.fields ? updatedNode.data.config.fields.filter(f => f.type === 'Toast').length : 0);
          
          // CRITICAL: Update selectedNode if this is the currently selected node
          setSelectedNode(prev => prev?.id === nodeId ? updatedNode : prev);
          
          return updatedNode;
        }
        return node;
      })
    );
    
    console.log('🔄 setNodes() called - state update queued (async)');
    console.log('🔄 ===== onUpdateNodeConfig END =====');
    
    // Step 2: If Decision node, regenerate edges with CURRENT nodes state
    setNodes((currentNodes) => {
      const targetNode = currentNodes.find(n => n.id === nodeId);
      if (targetNode?.type === 'decision') {
        // Regenerate edges using the UPDATED node
        const updatedNode = {
          ...targetNode,
          data: {
            ...targetNode.data,
            config,
            label: label || targetNode.data.label
          }
        };
        regenerateDecisionEdgesSync(updatedNode, config, label, currentNodes);
      }
      return currentNodes;
    });
  };
  // Handler for inserting node on specific outcome path
  const handleInsertNodeOnOutcome = useCallback((decisionNodeId, outcomeIndex, isDefault) => {
    console.log(`🎯 Adding node to Decision ${decisionNodeId}, outcome ${outcomeIndex}, isDefault: ${isDefault}`);
    
    // Store the decision context for later use when node is selected from menu
    setInsertAfterNodeId(decisionNodeId);
    setShowAddActionMenu(true);
    
    // Store which outcome this is for
    window._currentDecisionOutcome = {
      decisionNodeId,
      outcomeIndex,
      isDefault
    };
    
  }, []);


  // Add state for decision context
  const [currentDecisionContext, setCurrentDecisionContext] = React.useState(null);

  // Handler for adding a new outcome to Decision node
  const handleAddOutcome = useCallback((decisionNodeId) => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === decisionNodeId && node.type === 'decision') {
          const currentOutcomes = node.data.config?.outcomes || [];
          const regularOutcomes = currentOutcomes.filter(o => !o.isDefault);
          const defaultOutcome = currentOutcomes.find(o => o.isDefault);
          
          // Create new outcome
          const newOutcome = {
            label: `Outcome ${regularOutcomes.length + 1}`,
            matchType: 'all',
            conditions: [],
            isDefault: false
          };
          
          // Add new outcome before default
          const updatedOutcomes = [
            ...regularOutcomes,
            newOutcome,
            defaultOutcome || { label: 'Default Outcome', isDefault: true }
          ];
          
          const updatedConfig = {
            ...node.data.config,
            outcomes: updatedOutcomes
          };
          
          // Update node
          const updatedNode = {
            ...node,
            data: {
              ...node.data,
              config: updatedConfig
            }
          };
          
          // Trigger config update to regenerate edges
          setTimeout(() => {
            onUpdateNodeConfig(decisionNodeId, updatedConfig, node.data.label);
          }, 0);
          
          return updatedNode;
        }
        return node;
      })
    );
    
    toast.success('Outcome added');
  }, [setNodes, onUpdateNodeConfig]);

  // Handler for Plus button on outcome paths
  const handleOutcomePlusClick = useCallback((decisionNodeId, outcomeIndex, isDefault) => {
    console.log('Outcome plus clicked:', decisionNodeId, outcomeIndex, isDefault);
    handleInsertNodeOnOutcome(decisionNodeId, outcomeIndex, isDefault);
  }, [handleInsertNodeOnOutcome]);
  
  // Synchronous edge regeneration with explicit nodes parameter
  const regenerateDecisionEdgesSync = (decisionNode, config, label, currentNodes) => {
    const decisionNodeId = decisionNode.id;
    const outcomes = config?.outcomes || [];
    const regularOutcomes = outcomes.filter(o => !o.isDefault);
    const defaultOutcome = outcomes.find(o => o.isDefault);
    const allOutcomes = [...regularOutcomes, defaultOutcome].filter(Boolean);
    
    // Find or create merge node
    const mergeNodeId = `merge_${decisionNodeId}`;
    let mergeNode = currentNodes.find(n => n.id === mergeNodeId);
    
    if (!mergeNode) {
      // Create merge node
      mergeNode = {
        id: mergeNodeId,
        type: 'merge',
        position: { x: decisionNode.position.x, y: decisionNode.position.y + 250 },
        selectable: false,
        draggable: false,
        data: {
          outcomeCount: allOutcomes.length,
          parentDecisionId: decisionNodeId
        }
      };
      setNodes(nds => [...nds, mergeNode]);
    } else {
      // Update merge node outcome count
      setNodes(nds => nds.map(n => {
        if (n.id === mergeNodeId) {
          return {
            ...n,
            data: {
              ...n.data,
              outcomeCount: allOutcomes.length
            }
          };
        }
        return n;
      }));
    }
    
    // Remove old decision edges and create new ones
    setEdges(eds => {
      // Filter out old decision edges
      const filteredEdges = eds.filter(e => {
        const isDecisionEdge = e.source === decisionNodeId && e.target === mergeNodeId;
        return !isDecisionEdge;
      });
      
      // Get label
      const decisionLabel = label || decisionNode.data?.label || 'Decision';
      
      // Create new edges
      const newEdges = allOutcomes.map((outcome, index) => {
        const isDefault = outcome.isDefault;
        const handleId = isDefault ? 'default' : `outcome-${index}`;
        
        return {
          id: `e_${decisionNodeId}_${handleId}_to_${mergeNodeId}`,
          source: decisionNodeId,
          sourceHandle: handleId,
          target: mergeNodeId,
          targetHandle: `merge-input-${index}`,
          type: 'decision',
          animated: false,
          data: {
            outcomeLabel: outcome.label,
            outcomeIndex: index,
            outcomeCount: allOutcomes.length,
            isDefault: isDefault,
            decisionLabel: decisionLabel,
            onPlusClick: () => {
              handleInsertNodeOnOutcome(decisionNodeId, index, isDefault);
            }
          }
        };
      });
      
      return [...filteredEdges, ...newEdges];
    });
  };
  
  // Helper function to regenerate decision edges when outcomes change
  const regenerateDecisionEdges = (decisionNodeId, config, label) => {
    const outcomes = config?.outcomes || [];
    const regularOutcomes = outcomes.filter(o => !o.isDefault);
    const defaultOutcome = outcomes.find(o => o.isDefault);
    const allOutcomes = [...regularOutcomes, defaultOutcome].filter(Boolean);
    
    // Find or create merge node
    const mergeNodeId = `merge_${decisionNodeId}`;
    let mergeNode = nodes.find(n => n.id === mergeNodeId);
    
    if (!mergeNode) {
      // Find decision node position
      const decisionNode = nodes.find(n => n.id === decisionNodeId);
      if (decisionNode) {
        // Create merge node
        mergeNode = {
          id: mergeNodeId,
          type: 'merge',
          position: { x: decisionNode.position.x, y: decisionNode.position.y + 250 },
          selectable: false,  // Not selectable
          draggable: false,   // Not draggable
          data: {
            outcomeCount: allOutcomes.length,
            parentDecisionId: decisionNodeId
          }
        };
        setNodes(nds => [...nds, mergeNode]);
      }
    } else {
      // Update merge node outcome count
      setNodes(nds => nds.map(n => {
        if (n.id === mergeNodeId) {
          return {
            ...n,
            data: {
              ...n.data,
              outcomeCount: allOutcomes.length
            }
          };
        }
        return n;
      }));
    }
    
    // Remove old decision edges
    setEdges(eds => eds.filter(e => {
      const isDecisionEdge = e.source === decisionNodeId && e.target === mergeNodeId;
      return !isDecisionEdge;
    }));
    
    // Create new decision edges
    const decisionNode = nodes.find(n => n.id === decisionNodeId);
    const decisionLabel = label || decisionNode?.data?.label || 'Decision';
    
    const newEdges = allOutcomes.map((outcome, index) => {
      const isDefault = outcome.isDefault;
      const handleId = isDefault ? 'default' : `outcome-${index}`;
      
      return {
        id: `e_${decisionNodeId}_${handleId}_to_${mergeNodeId}`,
        source: decisionNodeId,
        sourceHandle: handleId,
        target: mergeNodeId,
        targetHandle: `merge-input-${index}`,
        type: 'decision',
        animated: false,
        data: {
          outcomeLabel: outcome.label,
          outcomeIndex: index,
          outcomeCount: allOutcomes.length,
          isDefault: isDefault,
          decisionLabel: decisionLabel,
          onPlusClick: () => {
            handleInsertNodeOnOutcome(decisionNodeId, index, isDefault);
          }
        }
      };
    });
    
    setEdges(eds => [...eds, ...newEdges]);
  };

  const onDeleteNode = useCallback((nodeId) => {
    // Smart auto-reconnect: connect previous node to next node
    const nodeToDelete = nodes.find(n => n.id === nodeId);
    
    // Don't allow deleting trigger, end, or screen_flow system nodes
    if (nodeToDelete?.data?.nodeType === 'trigger' || 
        nodeToDelete?.data?.nodeType === 'end' ||
        nodeToDelete?.type === 'screen_flow_start' ||
        nodeToDelete?.type === 'screen_flow_end' ||
        nodeToDelete?.id === 'screen_flow_start' ||
        nodeToDelete?.id === 'screen_flow_end') {
      toast.error('Cannot delete Trigger, Start, or End node');
      return;
    }
    
    // Check if this is a loop node - special handling needed
    const isLoopNode = nodeToDelete?.type === 'loop';
    
    if (isLoopNode) {
      // Find all nodes and edges connected to this loop
      const loopId = nodeToDelete.id;
      const loopConnectedNodes = nodes.filter(n => 
        n.data?.loopContext?.loopNodeId === loopId || 
        n.data?.config?.loopNodeId === loopId
      );
      
      // Also delete loop-specific nodes (connector, add buttons)
      const nodesToDelete = [
        nodeId,
        ...loopConnectedNodes.map(n => n.id),
        ...nodes.filter(n => 
          n.data?.config?.connectorType === 'loop_back' && 
          n.data?.config?.loopNodeId === loopId
        ).map(n => n.id)
      ];
      
      // Find incoming edge to loop
      const incomingEdge = edges.find(e => e.target === nodeId);
      
      // Find outgoing edge from after-last branch
      const afterLastEdge = edges.find(e => 
        e.source === nodeId && e.sourceHandle === 'after-last'
      );
      
      // Remove all loop-related nodes
      setNodes((nds) => nds.filter((node) => !nodesToDelete.includes(node.id)));
      
      // Remove all loop-related edges and reconnect
      setEdges((eds) => {
        const filteredEdges = eds.filter((edge) => 
          !nodesToDelete.includes(edge.source) && 
          !nodesToDelete.includes(edge.target)
        );
        
        // Reconnect incoming to after-last target if both exist
        if (incomingEdge && afterLastEdge) {
          const reconnectEdge = {
            id: `e_${incomingEdge.source}_to_${afterLastEdge.target}`,
            source: incomingEdge.source,
            sourceHandle: incomingEdge.sourceHandle,
            target: afterLastEdge.target,
            targetHandle: afterLastEdge.targetHandle,
            type: 'smoothstep',
            animated: true,
            style: { strokeWidth: 2 }
          };
          return [...filteredEdges, reconnectEdge];
        }
        
        return filteredEdges;
      });
      
      setSelectedNode(null);
      toast.success('Loop and all its branches deleted');
      return;
    }
    
    // ============ GHOST CONNECTOR FIX ============
    // Regular node deletion with COMPLETE cleanup
    // Structure: PrevNode → AddButton(before) → ThisNode → AddButton(after) → NextNode
    // We need to remove BOTH add buttons and create ONE new add button
    
    console.log('🗑️ Deleting node:', nodeId);
    
    // Helper function to check if a node is an add button
    const isAddButtonNode = (id) => {
      const node = nodes.find(n => n.id === id);
      return node?.type === 'addButton' || id?.startsWith('add_button') || id?.startsWith('add_');
    };
    
    // Find ALL edges connected to this node
    const incomingEdges = edges.filter(e => e.target === nodeId);
    const outgoingEdges = edges.filter(e => e.source === nodeId);
    
    console.log('  Incoming edges:', incomingEdges.map(e => e.id));
    console.log('  Outgoing edges:', outgoingEdges.map(e => e.id));
    
    // Track all nodes and edges to remove
    const nodesToRemove = new Set([nodeId]);
    const edgesToRemove = new Set();
    
    // Find the REAL previous node (not add button)
    let realPreviousNodeId = null;
    let realPreviousSourceHandle = null;
    
    // Find the REAL next node (not add button)
    let realNextNodeId = null;
    
    // Trace back through add buttons to find real previous node
    for (const inEdge of incomingEdges) {
      edgesToRemove.add(inEdge.id);
      let currentId = inEdge.source;
      let currentHandle = inEdge.sourceHandle;
      
      // Keep tracing back while we hit add buttons
      while (isAddButtonNode(currentId)) {
        nodesToRemove.add(currentId);
        console.log('  Removing add button (before):', currentId);
        
        // Find edge pointing to this add button
        const prevEdge = edges.find(e => e.target === currentId);
        if (prevEdge) {
          edgesToRemove.add(prevEdge.id);
          currentId = prevEdge.source;
          currentHandle = prevEdge.sourceHandle;
        } else {
          break;
        }
      }
      realPreviousNodeId = currentId;
      realPreviousSourceHandle = currentHandle;
    }
    
    // Trace forward through add buttons to find real next node
    for (const outEdge of outgoingEdges) {
      edgesToRemove.add(outEdge.id);
      let currentId = outEdge.target;
      
      // Keep tracing forward while we hit add buttons
      while (isAddButtonNode(currentId)) {
        nodesToRemove.add(currentId);
        console.log('  Removing add button (after):', currentId);
        
        // Find edge from this add button
        const nextEdge = edges.find(e => e.source === currentId);
        if (nextEdge) {
          edgesToRemove.add(nextEdge.id);
          currentId = nextEdge.target;
        } else {
          break;
        }
      }
      realNextNodeId = currentId;
    }
    
    console.log('  Real previous node:', realPreviousNodeId);
    console.log('  Real next node:', realNextNodeId);
    console.log('  Nodes to remove:', Array.from(nodesToRemove));
    console.log('  Edges to remove:', Array.from(edgesToRemove));
    
    // Create ONE new add button to maintain flow structure
    const newAddButtonId = `add_button_${Date.now()}`;
    const deletedNodePosition = nodeToDelete.position;
    
    const newAddButton = {
      id: newAddButtonId,
      type: 'addButton',
      position: { x: deletedNodePosition.x, y: deletedNodePosition.y },
      data: {
        onClick: () => handleAddButtonClick(newAddButtonId, realPreviousNodeId)
      }
    };
    
    // Update nodes: remove deleted nodes, add new add button
    setNodes((nds) => {
      const filtered = nds.filter((node) => !nodesToRemove.has(node.id));
      return [...filtered, newAddButton];
    });
    
    // Update edges: remove old edges, create new connections
    setEdges((eds) => {
      const filteredEdges = eds.filter((edge) => !edgesToRemove.has(edge.id));
      const newEdges = [];
      
      // Edge from real previous node to new add button
      if (realPreviousNodeId) {
        newEdges.push({
          id: `e_${realPreviousNodeId}_to_${newAddButtonId}`,
          source: realPreviousNodeId,
          sourceHandle: realPreviousSourceHandle,
          target: newAddButtonId,
          type: 'smoothstep',
          animated: false,
          style: { stroke: '#94a3b8', strokeWidth: 2 }
        });
      }
      
      // Edge from new add button to real next node
      if (realNextNodeId) {
        newEdges.push({
          id: `e_${newAddButtonId}_to_${realNextNodeId}`,
          source: newAddButtonId,
          target: realNextNodeId,
          type: 'smoothstep',
          animated: false,
          style: { stroke: '#94a3b8', strokeWidth: 2 }
        });
      }
      
      console.log('  New edges created:', newEdges.map(e => e.id));
      return [...filteredEdges, ...newEdges];
    });
    
    setSelectedNode(null);
    toast.success('Node deleted');
  }, [nodes, edges, setNodes, setEdges, handleAddButtonClick]);

  /**
   * Add a fault path to a node (Salesforce-style)
   * Creates a red "Fault" node and connects it to an "End" node
   */
  const handleAddFaultPath = useCallback((nodeId) => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) {
      toast.error('Node not found');
      return;
    }

    // Check if node already has a fault path
    const existingFaultEdge = edges.find(e => e.source === nodeId && e.sourceHandle === 'fault');
    if (existingFaultEdge) {
      toast('This node already has a fault path configured', { icon: 'ℹ️' });
      return;
    }

    const timestamp = Date.now();
    const nodePosition = node.position;
    
    // Create a "Fault" connector node (red pill-shaped)
    const faultNodeId = `fault_node_${nodeId}_${timestamp}`;
    const faultNode = {
      id: faultNodeId,
      type: 'faultNode',  // Custom fault node type
      position: { 
        x: nodePosition.x + 220,  // Position to the right
        y: nodePosition.y + 20
      },
      data: {
        label: 'Fault',
        parentNodeId: nodeId
      }
    };

    // Create an Add Button node after the Fault node
    const faultAddButtonId = `add_button_fault_${nodeId}_${timestamp}`;
    const faultAddButton = {
      id: faultAddButtonId,
      type: 'addButton',
      position: { 
        x: nodePosition.x + 220,
        y: nodePosition.y + 80
      },
      data: {
        onClick: () => handleAddButtonClick(faultAddButtonId, faultNodeId, null),
        isFaultPath: true
      }
    };

    // Create an End node for the fault path (white styled like Salesforce)
    const faultEndNodeId = `end_fault_${nodeId}_${timestamp}`;
    const faultEndNode = {
      id: faultEndNodeId,
      type: 'faultEndNode',  // Custom white End node for fault paths
      position: { 
        x: nodePosition.x + 220,
        y: nodePosition.y + 140
      },
      data: {
        label: 'End',
        nodeType: 'end',
        isFaultEnd: true,
        config: {}
      }
    };

    // Create the edges
    const newEdges = [
      // Edge from source node to Fault node (red dashed)
      {
        id: `e_fault_${nodeId}_to_${faultNodeId}`,
        source: nodeId,
        sourceHandle: 'fault',
        target: faultNodeId,
        type: 'smoothstep',
        animated: false,
        style: { 
          strokeWidth: 2, 
          stroke: '#ef4444',
          strokeDasharray: '5,5'  // Dashed line
        }
      },
      // Edge from Fault node to Add Button
      {
        id: `e_${faultNodeId}_to_${faultAddButtonId}`,
        source: faultNodeId,
        target: faultAddButtonId,
        type: 'smoothstep',
        animated: false,
        style: { 
          strokeWidth: 2, 
          stroke: '#ef4444',
          strokeDasharray: '5,5'
        }
      },
      // Edge from Add Button to End node
      {
        id: `e_${faultAddButtonId}_to_${faultEndNodeId}`,
        source: faultAddButtonId,
        target: faultEndNodeId,
        type: 'smoothstep',
        animated: false,
        style: { 
          strokeWidth: 2, 
          stroke: '#ef4444',
          strokeDasharray: '5,5'
        }
      }
    ];

    // Update the source node to indicate it has a fault path
    setNodes((nds) => {
      return nds.map(n => {
        if (n.id === nodeId) {
          return {
            ...n,
            data: {
              ...n.data,
              hasFaultPath: true
            }
          };
        }
        return n;
      }).concat([faultNode, faultAddButton, faultEndNode]);
    });

    setEdges((eds) => [...eds, ...newEdges]);

    toast.success('Fault path added with End node');
  }, [nodes, edges, setNodes, setEdges, handleAddButtonClick]);

  const prepareFlowData = () => {
    console.log('💾 prepareFlowData called');
    
    // CRITICAL FIX: Get latest nodes and merge with pending updates from ref
    // This ensures we capture updates that haven't been applied to React state yet
    let currentNodes = reactFlowInstance ? reactFlowInstance.getNodes() : nodes;
    const currentEdges = reactFlowInstance ? reactFlowInstance.getEdges() : edges;
    
    console.log('💾 Using nodes from:', reactFlowInstance ? 'reactFlowInstance.getNodes()' : 'React state');
    console.log('💾 Total nodes:', currentNodes.length);
    console.log('💾 Pending updates in ref:', Object.keys(pendingNodeUpdates.current).length);
    
    // CRITICAL: Merge pending updates from ref into current nodes
    if (Object.keys(pendingNodeUpdates.current).length > 0) {
      console.log('💾 🔄 Merging pending updates into nodes...');
      currentNodes = currentNodes.map(node => {
        const pendingUpdate = pendingNodeUpdates.current[node.id];
        if (pendingUpdate) {
          console.log(`💾 🔄 Applying pending update to node ${node.id}:`, {
            hasConfig: !!pendingUpdate.config,
            hasFields: !!pendingUpdate.config?.fields,
            fieldsCount: pendingUpdate.config?.fields?.length || 0,
            toastCount: pendingUpdate.config?.fields?.filter(f => f.type === 'Toast').length || 0
          });
          
          return {
            ...node,
            data: {
              ...node.data,
              config: pendingUpdate.config,
              label: pendingUpdate.label || node.data?.label
            }
          };
        }
        return node;
      });
      
      console.log('💾 ✅ Pending updates merged successfully');
    }
    
    // Extract trigger configuration from Trigger nodes
    const triggerNodes = currentNodes.filter(n => {
      const nodeType = n.data?.nodeType || n.type;
      return nodeType === 'trigger' || nodeType === 'webhook_trigger' || nodeType === 'scheduled_trigger';
    });
    
    const extractedTriggers = triggerNodes.map(n => {
      const config = n.data?.config || {};
      const nodeType = n.data?.nodeType || n.type;
      
      console.log('🎯 Extracting trigger from node:', n.id, 'Type:', nodeType, 'Config:', config);
      
      // Handle webhook trigger
      if (nodeType === 'webhook_trigger') {
        // Find existing webhook trigger config from triggers state to preserve body_fields, webhook_secret, etc.
        const existingWebhookTrigger = triggers.find(t => 
          t.type === 'incoming_webhook_trigger' || t.type === 'webhook_trigger' || t.type === 'incoming_webhook'
        );
        
        return {
          id: n.id,
          type: 'incoming_webhook_trigger',
          config: existingWebhookTrigger?.config || {
            triggerType: 'incoming_webhook'
          }
        };
      }
      
      // Handle scheduled trigger
      if (nodeType === 'scheduled_trigger') {
        return {
          id: n.id,
          type: 'scheduled_trigger',
          config: triggers.find(t => t.type === 'scheduled_trigger')?.config || {
            schedule_type: 'one_time',
            enabled: true,
            timezone: 'UTC'
          }
        };
      }
      
      // Handle regular DB trigger
      return {
        id: n.id,
        type: 'db',
        config: {
          entity: config.entity || 'Lead',
          event: config.event || 'afterInsert',
          filter_logic: config.filter_logic || 'none',
          filter_conditions: config.filter_conditions || []
        }
      };
    });

    // Use extracted triggers from nodes, or fall back to separately configured triggers
    let finalTriggers = extractedTriggers.length > 0 ? extractedTriggers : triggers;
    
    // CRITICAL: Ensure all triggers have an id field (required by backend)
    finalTriggers = finalTriggers.map((trigger, index) => {
      if (!trigger.id) {
        console.log('💾 ⚠️ Trigger missing id, generating one:', trigger);
        return {
          ...trigger,
          id: `trigger_${Date.now()}_${index}`
        };
      }
      return trigger;
    });
    
    console.log('💾 Final triggers to save:', finalTriggers);

    // Filter out trigger nodes, add button nodes, end nodes, AND loop connector nodes
    // Also remove any orphan nodes (nodes with stale IDs from deleted operations)
    const actualNodes = currentNodes.filter(n => {
      const nodeType = n.data?.nodeType || n.type;
      const isLoopConnector = n.data?.config?.connectorType === 'loop_back';
      
      // Filter out system/UI nodes
      if (nodeType === 'trigger') return false;
      if (nodeType === 'webhook_trigger') return false;
      if (nodeType === 'scheduled_trigger') return false;
      if (nodeType === 'addButton') return false;
      if (n.type === 'addButton') return false;
      if (nodeType === 'end') return false;
      if (isLoopConnector) return false;
      
      // Filter out nodes with add button-like IDs (ghost nodes)
      if (n.id?.startsWith('add_button')) return false;
      if (n.id?.startsWith('add_final')) return false;
      if (n.id?.startsWith('add_for_each')) return false;
      if (n.id?.startsWith('add_after_last')) return false;
      if (n.id?.startsWith('add_')) return false;  // Catch-all for any add button IDs
      
      return true;
    });
    
    console.log('💾 Saving nodes:', actualNodes.map(n => ({
      id: n.id,
      type: n.type,
      hasLoopContext: !!n.data?.loopContext,
      isInsideLoop: n.data?.loopContext?.isInsideLoop,
      hasDecisionContext: !!n.data?.decisionContext,
      isInsideDecision: n.data?.decisionContext?.isInsideDecision
    })));
    
    // Filter out edges connected to add buttons AND orphan edges
    // An orphan edge is one where source or target doesn't exist in currentNodes
    const nodeIds = new Set(currentNodes.map(n => n.id));
    
    const actualEdges = currentEdges.filter(e => {
      const sourceNode = currentNodes.find(n => n.id === e.source);
      const targetNode = currentNodes.find(n => n.id === e.target);
      const sourceIsAddButton = sourceNode?.type === 'addButton' || e.source?.startsWith('add_');
      const targetIsAddButton = targetNode?.type === 'addButton' || e.target?.startsWith('add_');
      
      // Skip add button edges
      if (sourceIsAddButton || targetIsAddButton) return false;
      
      // Skip orphan edges (edges referencing non-existent nodes)
      // Allow trigger sources and end targets
      const sourceExists = nodeIds.has(e.source) || 
                           e.source?.startsWith('trigger') || 
                           e.source?.startsWith('screen_flow_');
      const targetExists = nodeIds.has(e.target) || 
                           e.target?.startsWith('end_') || 
                           e.target?.startsWith('screen_flow_');
      
      if (!sourceExists || !targetExists) {
        console.log(`💾 Removing orphan edge: ${e.id} (source: ${e.source}, target: ${e.target})`);
        return false;
      }
      
      return true;
    });
    
    console.log(`💾 Edges after cleanup: ${actualEdges.length} (removed ${currentEdges.length - actualEdges.length} orphan/addButton edges)`);
    
    return {
      name: flowName,
      description: flowDescription,
      flow_type: savedFlowType,
      launch_mode: savedFlowType === 'screen' ? launchMode : null, // Only for Screen Flows
      batch_size: batchSize, // Include batch size
      triggers: finalTriggers,
      input_variables: inputVariables,  // Include input variables
      nodes: actualNodes.map(n => {
        const loopContext = n.data?.loopContext;
        const decisionContext = n.data?.decisionContext;
        
        // CRITICAL DEBUG: Log screen node config being saved
        if (n.type === 'screen' || n.data?.nodeType === 'screen') {
          const config = n.data?.config || {};
          const fields = config.fields || [];
          const toastCount = fields.filter(f => f.type === 'Toast').length;
          const fieldCount = fields.filter(f => f.type !== 'Toast').length;
          
          console.log(`💾 📺 SAVING SCREEN NODE ${n.id}:`);
          console.log(`   Total components: ${fields.length} (${fieldCount} fields + ${toastCount} toasts)`);
          console.log(`   node.data.config:`, config);
          console.log(`   node.data.config.fields:`, fields);
          
          if (toastCount > 0) {
            console.log(`   ✅ Toast components in node state:`, fields.filter(f => f.type === 'Toast'));
          } else {
            console.warn(`   ⚠️ NO Toast in node.data.config.fields!`);
          }
        }
        
        // BULLETPROOF: Save loopContext and decisionContext in MULTIPLE places
        return {
          id: n.id,
          type: n.data?.nodeType || n.type || 'action',
          label: n.data?.label || '',
          config: n.data?.config || {},
          position: n.position,
          // Save loopContext at TOP level (for backend compatibility)
          ...(loopContext && { loopContext }),
          // Save decisionContext at TOP level
          ...(decisionContext && { decisionContext }),
          // AND also in data field
          data: {
            label: n.data?.label || '',
            nodeType: n.data?.nodeType || n.type || 'action',
            config: n.data?.config || {},
            ...(loopContext && { loopContext }),
            ...(decisionContext && { decisionContext })
          }
        };
      }),
      edges: actualEdges
    };
  };

  // FIX #4: Validate node configurations before save
  const validateNodeConfigs = () => {
    const errors = [];
    
    // Get actual action nodes (excluding trigger, end, addButton, and screen flow system nodes)
    // FIX: Check node.data.nodeType instead of node.type since reconstructed nodes use type='default'
    const actionNodes = nodes.filter(n => {
      const nodeType = n.data?.nodeType || n.type;
      const config = n.data?.config || {};
      
      // FIX #5: Skip loop_back connector nodes from validation
      const isLoopBackConnector = config.connectorType === 'loop_back';
      
      // Check if this is a screen flow system node (non-clickable Start/End)
      const isScreenFlowSystemNode = nodeType === 'screen_flow_start' || 
                                     nodeType === 'screen_flow_end' ||
                                     n.type === 'screen_flow_start' ||
                                     n.type === 'screen_flow_end' ||
                                     n.data?.isSystemNode;
      
      // Exclude trigger nodes, end nodes, add buttons, loop back connectors, and screen flow system nodes
      return nodeType !== 'trigger' && 
             nodeType !== 'webhook_trigger' &&
             nodeType !== 'scheduled_trigger' &&
             nodeType !== 'end' && 
             n.type !== 'addButton' &&
             n.id !== 'end_node' &&
             !isLoopBackConnector &&
             !isScreenFlowSystemNode;
    });
    
    actionNodes.forEach(node => {
      const config = node.data?.config || node.config || {};
      const nodeLabel = node.data?.label || config.label || node.type;
      const nodeType = node.data?.nodeType || node.type;
      
      // FIX #5: Validate Send Email node with clear error message
      if (nodeType === 'connector' || nodeType === 'send_email' || nodeType === 'email') {
        // Skip loop_back connectors (already filtered but double-check)
        if (config.connectorType === 'loop_back') {
          return; // Skip this node
        }
        
        // FIX: Check recipients array properly - validate that entries have valid type/value
        const recipients = config.recipients || [];
        // A valid recipient has type (custom/user/field) and corresponding value
        const hasValidRecipients = recipients.some(r => {
          if (!r || typeof r !== 'object') return false;
          if (r.type === 'custom' && r.email?.trim()) return true;
          if (r.type === 'user' && (r.id || r.email)) return true;
          if (r.type === 'field' && r.field) return true;
          // Backward compat: recipient without type but with email
          if (r.email?.trim()) return true;
          return false;
        });
        const hasRecipients = recipients.length > 0 && hasValidRecipients;
        const hasSubject = config.subject?.trim();
        const hasBody = config.body?.trim();
        
        // FIX #5: Show clear error message for unconfigured Send Email nodes
        if (!hasRecipients && !hasSubject && !hasBody) {
          errors.push(`Send Email node "${nodeLabel}" is not configured. Please configure required fields (recipients, subject, body).`);
        } else {
          if (!hasRecipients) {
            errors.push(`"${nodeLabel}": At least one recipient is required`);
          }
          if (!hasSubject) {
            errors.push(`"${nodeLabel}": Subject is required`);
          }
          if (!hasBody) {
            errors.push(`"${nodeLabel}": Body is required`);
          }
        }
      }
      
      // Validate CRM Action / MCP node
      if (nodeType === 'mcp' || nodeType === 'crm_action') {
        if (!config.mcp_action && !config.action_type) {
          errors.push(`"${nodeLabel}": Action type is required`);
        }
        if (!config.object && config.mcp_action?.includes('record')) {
          errors.push(`"${nodeLabel}": Target object is required`);
        }
      }
      
      // Validate Decision node
      if (nodeType === 'decision') {
        const outcomes = config.outcomes || [];
        const hasConditions = outcomes.some(o => o.conditions && o.conditions.length > 0);
        if (!hasConditions) {
          errors.push(`"${nodeLabel}": At least one condition is required`);
        }
      }
      
      // Validate Loop node
      if (nodeType === 'loop' || nodeType === 'for_each') {
        if (!config.collection_variable && !config.collection) {
          errors.push(`"${nodeLabel}": Collection variable is required`);
        }
      }
      
      // Validate Screen node (Screen Flow)
      if (nodeType === 'screen') {
        const fields = config.fields || [];
        // Screen can be empty if explicitly allowed, but log a warning
        if (fields.length === 0) {
          console.log(`[VALIDATION] Screen node "${nodeLabel}" has no fields (allowed but noted)`);
        }
      }
      
      // Validate Assignment node
      if (nodeType === 'assignment') {
        const assignments = config.assignments || [];
        if (assignments.length === 0) {
          errors.push(`"${nodeLabel}": At least one assignment is required`);
        }
      }
      
      // Validate Get Records node
      if (nodeType === 'get_records' || nodeType === 'mcp_get_records') {
        if (!config.object) {
          errors.push(`"${nodeLabel}": Target object is required`);
        }
      }
    });
    
    return errors;
  };

  const handleSave = async () => {
    if (!flowName.trim()) {
      toast.error('Please enter a flow name');
      return;
    }

    // Prevent saving read-only flows
    if (isReadOnly) {
      toast.error('Cannot save read-only flow. Create a new version to edit.');
      return;
    }

    // Prevent editing active flows
    if (flowStatus === 'active' && flowId !== 'new') {
      toast.error('Cannot edit active flow. Use "Create New Version" to make changes.');
      return;
    }
    
    // FIX #4: Validate node configurations before save
    const validationErrors = validateNodeConfigs();
    if (validationErrors.length > 0) {
      toast.error(
        <div>
          <strong>Please configure required fields:</strong>
          <ul className="mt-2 text-sm list-disc pl-4">
            {validationErrors.slice(0, 5).map((err, i) => (
              <li key={i}>{err}</li>
            ))}
            {validationErrors.length > 5 && (
              <li>...and {validationErrors.length - 5} more errors</li>
            )}
          </ul>
        </div>,
        { duration: 8000 }
      );
      return;
    }

    setSaving(true);
    try {
      const flowData = prepareFlowData();
      console.log('Saving flow data:', flowData);
      console.log('🚀 ===== DETAILED SAVE PAYLOAD =====');
      console.log('🚀 Nodes with loopContext:', flowData.nodes.filter(n => n.data?.loopContext).map(n => ({
        id: n.id,
        type: n.type,
        loopContext: n.data.loopContext
      })));

      if (flowId && flowId !== 'new') {
        await axios.put(`${API}/api/flow-builder/flows/${flowId}`, flowData);
        toast.success('Flow updated successfully!');
        // Clear pending updates after successful save
        pendingNodeUpdates.current = {};
        console.log('💾 ✅ Cleared pending updates after successful save');
      } else {
        const response = await axios.post(`${API}/api/flow-builder/flows`, flowData);
        toast.success('Flow created successfully!');
        // Clear pending updates after successful create
        pendingNodeUpdates.current = {};
        console.log('💾 ✅ Cleared pending updates after successful create');
        navigate(`/flows/${response.data.id}/edit`, { replace: true });
      }
    } catch (error) {
      console.error('Error saving flow:', error);
      console.log('[SAVE ERROR] Full error object:', JSON.stringify({
        status: error.response?.status,
        data: error.response?.data,
        message: error.message
      }));
      
      // Handle specific error codes
      const statusCode = error.response?.status;
      let errorDetail = error.response?.data?.detail;
      
      // Handle Pydantic validation errors (array of error objects)
      if (Array.isArray(errorDetail)) {
        errorDetail = errorDetail.map(e => 
          typeof e === 'object' ? (e.msg || e.message || JSON.stringify(e)) : e
        ).join(', ');
      } else if (typeof errorDetail === 'object' && errorDetail !== null) {
        errorDetail = errorDetail.msg || errorDetail.message || JSON.stringify(errorDetail);
      }
      
      console.log('[SAVE ERROR] Status code:', statusCode);
      console.log('[SAVE ERROR] Error detail:', errorDetail);
      
      if (statusCode === 409) {
        // FIX: Duplicate flow name error - show prominent toast with exact message
        console.log('[SAVE ERROR] 409 - Showing duplicate name error toast');
        toast.error(`⚠️ No duplicate flow name allowed. Flow name already exists.`, {
          duration: 8000,
          style: {
            background: '#FEF2F2',
            border: '2px solid #EF4444',
            color: '#991B1B',
            fontWeight: '500'
          }
        });
      } else if (statusCode === 400) {
        toast.error(errorDetail || 'Invalid flow data. Please check your configuration.');
      } else if (statusCode === 422) {
        // Validation error
        toast.error(errorDetail || 'Validation error. Please check your flow configuration.');
      } else {
        toast.error(errorDetail || error.message || 'Failed to save flow');
      }
    } finally {
      setSaving(false);
    }
  };

  // Handler for "Create New Version" button
  const handleCreateNewVersion = async () => {
    if (!flowId || flowId === 'new') {
      toast.error('Cannot create version for unsaved flow');
      return;
    }

    try {
      setSaving(true);
      const response = await axios.post(`${API}/api/flow-builder/flows/${flowId}/create-version`);
      
      const newFlowId = response.data.id;  // Backend returns full Flow object
      const newVersion = response.data.version;
      
      toast.success(`Created new draft version v${newVersion}`);
      
      // Navigate to the new draft version for editing
      setTimeout(() => {
        window.location.href = `/flows/${newFlowId}/edit`;
      }, 500);
      
    } catch (error) {
      console.error('Error creating new version:', error);
      toast.error(error.response?.data?.detail || 'Failed to create new version');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAsNewVersion = async () => {
    console.log('🔵 handleSaveAsNewVersion called, flowId:', flowId);
    
    // FIX #4: Validate node configurations before save
    const validationErrors = validateNodeConfigs();
    if (validationErrors.length > 0) {
      toast.error(
        <div>
          <strong>Please configure required fields:</strong>
          <ul className="mt-2 text-sm list-disc pl-4">
            {validationErrors.slice(0, 5).map((err, i) => (
              <li key={i}>{err}</li>
            ))}
            {validationErrors.length > 5 && (
              <li>...and {validationErrors.length - 5} more errors</li>
            )}
          </ul>
        </div>,
        { duration: 8000 }
      );
      return;
    }
    
    // CRITICAL DEBUG: Inspect React Flow nodes state BEFORE prepareFlowData()
    console.log('=' + '='.repeat(79));
    console.log('🔍 [PRE-PREPARE DEBUG] INSPECTING CURRENT REACT FLOW STATE');
    console.log('=' + '='.repeat(79));
    
    // Get latest nodes from ReactFlow instance
    const latestNodes = reactFlowInstance ? reactFlowInstance.getNodes() : nodes;
    console.log('🔍 Total nodes (from', reactFlowInstance ? 'ReactFlow instance' : 'React state', '):', latestNodes.length);
    
    const screenNodesInState = latestNodes.filter(n => n.type === 'screen' || n.data?.nodeType === 'screen');
    console.log('🔍 Screen nodes in React Flow state:', screenNodesInState.length);
    
    screenNodesInState.forEach((node, idx) => {
      const config = node.data?.config || {};
      const fields = config.fields || [];
      const toastCount = fields.filter(f => f.type === 'Toast').length;
      const fieldCount = fields.filter(f => f.type !== 'Toast').length;
      
      console.log(`\n🔍 Screen Node #${idx + 1}: "${node.data?.label}" (ID: ${node.id})`);
      console.log(`   Total components: ${fields.length} (${fieldCount} fields + ${toastCount} toasts)`);
      
      if (toastCount > 0) {
        console.log(`   ✅ TOAST FOUND IN STATE:`, fields.filter(f => f.type === 'Toast').map(t => ({
          id: t.id,
          type: t.type,
          title: t.title,
          message: t.message?.substring(0, 50)
        })));
      } else {
        console.error(`   ❌ NO TOAST IN NODE STATE`);
      }
      
      console.log(`   Full config.fields:`, JSON.stringify(fields, null, 2));
    });
    
    console.log('=' + '='.repeat(79));
    
    try {
      setSaving(true);
      const flowData = prepareFlowData();
      
      // CRITICAL DEBUG: Inspect prepared flowData AFTER prepareFlowData()
      console.log('=' + '='.repeat(79));
      console.log('🔍 [POST-PREPARE DEBUG] INSPECTING PREPARED FLOW DATA');
      console.log('=' + '='.repeat(79));
      
      const screenNodesInData = flowData.nodes.filter(n => n.type === 'screen');
      console.log('🔍 Screen nodes in prepared flowData:', screenNodesInData.length);
      
      screenNodesInData.forEach((node, idx) => {
        const config = node.config || {};
        const fields = config.fields || [];
        const toastCount = fields.filter(f => f.type === 'Toast').length;
        const fieldCount = fields.filter(f => f.type !== 'Toast').length;
        
        console.log(`\n🔍 Prepared Node #${idx + 1}: "${node.label}" (ID: ${node.id})`);
        console.log(`   Total components: ${fields.length} (${fieldCount} fields + ${toastCount} toasts)`);
        
        if (toastCount > 0) {
          console.log(`   ✅ TOAST IN PREPARED DATA:`, fields.filter(f => f.type === 'Toast').map(t => ({
            id: t.id,
            type: t.type,
            title: t.title,
            message: t.message?.substring(0, 50)
          })));
        } else {
          console.error(`   ❌ NO TOAST IN PREPARED DATA`);
        }
      });
      
      console.log('=' + '='.repeat(79));
      console.log('🔍 [DEBUG SUMMARY]');
      
      const toastInState = screenNodesInState.reduce((count, n) => 
        count + (n.data?.config?.fields || []).filter(f => f.type === 'Toast').length, 0);
      const toastInData = screenNodesInData.reduce((count, n) => 
        count + (n.config?.fields || []).filter(f => f.type === 'Toast').length, 0);
      
      console.log(`   Toast in React Flow state: ${toastInState}`);
      console.log(`   Toast in prepared flowData: ${toastInData}`);
      
      if (toastInState !== toastInData) {
        console.error('   ⚠️⚠️⚠️ TOAST LOSS DETECTED DURING prepareFlowData() ⚠️⚠️⚠️');
      } else if (toastInState > 0) {
        console.log('   ✅ Toast count matches - data is consistent');
      }
      
      console.log('=' + '='.repeat(79));
      
      // Check if this is a NEW flow (not yet saved) or an existing flow
      if (flowId === 'new') {
        // NEW FLOW: Create it for the first time
        console.log('💾 Creating new flow (first save)...');
        
        const response = await axios.post(`${API}/api/flow-builder/flows`, flowData);
        const createdFlowId = response.data.id;
        
        console.log('✅ Flow created successfully with ID:', createdFlowId);
        toast.success('Flow created successfully!');
        
        // Navigate to the newly created flow
        navigate(`/flows/${createdFlowId}/edit`);
      } else {
        // EXISTING FLOW: Check if it's draft or active
        console.log('💾 Handling existing flow...');
        
        // Get current flow status
        const currentFlowResponse = await axios.get(`${API}/api/flow-builder/flows/${flowId}`);
        const currentStatus = currentFlowResponse.data.status;
        
        if (currentStatus === 'draft') {
          // DRAFT FLOW: Save changes directly (no new version needed)
          console.log('💾 Saving draft flow changes...');
          await axios.put(`${API}/api/flow-builder/flows/${flowId}`, flowData);
          console.log('✅ Draft saved successfully');
          toast.success('Draft saved successfully');
          // Clear pending updates after successful save
          pendingNodeUpdates.current = {};
          console.log('💾 ✅ Cleared pending updates after successful draft save');
        } else {
          // ACTIVE/INACTIVE FLOW: Must create new version
          console.log('🔄 Creating new version (cannot edit active/inactive flow)...');
          
          // CRITICAL: Log Toast count in current state before creating version
          const currentScreenNodes = nodes.filter(n => n.type === 'screen' || n.data?.nodeType === 'screen');
          const toastCountBefore = currentScreenNodes.reduce((count, node) => {
            const fields = node.data?.config?.fields || [];
            const toasts = fields.filter(f => f.type === 'Toast');
            return count + toasts.length;
          }, 0);
          
          console.log('[VERSION CREATE] Current flow screen nodes:', currentScreenNodes.length);
          console.log('[VERSION CREATE] Current flow Toast count:', toastCountBefore);
          
          if (toastCountBefore > 0) {
            currentScreenNodes.forEach(node => {
              const fields = node.data?.config?.fields || [];
              const toasts = fields.filter(f => f.type === 'Toast');
              if (toasts.length > 0) {
                console.log(`[VERSION CREATE] Screen "${node.data?.label}" has ${toasts.length} Toast(s):`, 
                  toasts.map(t => ({ id: t.id, title: t.title, message: t.message?.substring(0, 30) })));
              }
            });
          }
          
          // CRITICAL FIX: Send current flow data with version creation request
          // This ensures any unsaved changes (like Toast) are included in the new version
          console.log('💾 CRITICAL FIX: Sending current state with version creation...');
          console.log('💾 Current flowData being sent:', flowData);
          
          const response = await axios.post(
            `${API}/api/flow-builder/flows/${flowId}/create-version`,
            flowData  // Send current state as request body
          );
          
          const newFlowId = response.data.id;  // Backend returns full Flow object
          const newVersion = response.data.version;
          
          // CRITICAL: Log FULL response to see exact data structure
          console.log('=' + '='.repeat(79));
          console.log('[NEW VERSION RESPONSE] Full response data:', response.data);
          console.log('=' + '='.repeat(79));
          
          // CRITICAL: Check all possible Toast storage paths in response
          const newFlowNodes = response.data.nodes || [];
          const newScreenNodes = newFlowNodes.filter(n => n.type === 'screen');
          
          console.log('[NEW VERSION RESPONSE] Screen nodes found:', newScreenNodes.length);
          
          newScreenNodes.forEach((node, idx) => {
            console.log(`\n[NEW VERSION RESPONSE] Screen #${idx + 1}: ${node.label} (ID: ${node.id})`);
            
            const config = node.config || {};
            
            // PATH A: config.fields[]
            const fields = config.fields || [];
            const toastsInFields = fields.filter(f => f.type === 'Toast');
            console.log(`   PATH A - config.fields[]: ${fields.length} items, ${toastsInFields.length} Toast components`);
            if (toastsInFields.length > 0) {
              toastsInFields.forEach(t => {
                console.log(`      ✅ Toast in fields: ID=${t.id}, title=${t.title}, message=${t.message?.substring(0, 40)}`);
              });
            }
            
            // PATH B: config.components[]
            const components = config.components || [];
            const toastsInComponents = components.filter(c => c.type === 'toast' || c.type === 'Toast');
            console.log(`   PATH B - config.components[]: ${components.length} items, ${toastsInComponents.length} toast components`);
            if (toastsInComponents.length > 0) {
              toastsInComponents.forEach(t => {
                console.log(`      ✅ Toast in components: ID=${t.id}, type=${t.type}`);
              });
            }
            
            // PATH C: config.toasts[]
            const toasts = config.toasts || [];
            console.log(`   PATH C - config.toasts[]: ${toasts.length} items`);
            if (toasts.length > 0) {
              toasts.forEach(t => {
                console.log(`      ✅ Toast in toasts key:`, t);
              });
            }
            
            const totalToastCount = toastsInFields.length + toastsInComponents.length + toasts.length;
            if (totalToastCount === 0) {
              console.error(`   ❌ NO TOAST IN ANY PATH for screen: ${node.label}`);
            } else {
              console.log(`   ✅ Total Toast count: ${totalToastCount}`);
            }
          });
          
          console.log('=' + '='.repeat(79));
          
          // Calculate total toast count from response
          const toastCountInResponse = newScreenNodes.reduce((count, node) => {
            const config = node.config || {};
            const fieldsToast = (config.fields || []).filter(f => f.type === 'Toast').length;
            const componentsToast = (config.components || []).filter(c => c.type === 'toast' || c.type === 'Toast').length;
            const toastsKey = (config.toasts || []).length;
            return count + fieldsToast + componentsToast + toastsKey;
          }, 0);
          
          if (toastCountBefore !== toastCountInResponse) {
            console.error('[NEW VERSION RESPONSE] ❌ TOAST LOSS! Before:', toastCountBefore, 'In Response:', toastCountInResponse);
            console.error('[NEW VERSION RESPONSE] Toast was lost during backend clone or not saved in original flow');
            toast.error(`Warning: Toast components were lost (${toastCountBefore} → ${toastCountInResponse}). Check console for details.`);
          } else if (toastCountBefore > 0) {
            console.log('[NEW VERSION RESPONSE] ✅ Toast components preserved in API response:', toastCountBefore, 'toasts');
          } else {
            console.log('[NEW VERSION RESPONSE] ℹ️ No Toast components in original flow');
          }
          
          toast.success(`Created new draft version v${newVersion}`);
          
          // Clear pending updates after successful version creation
          pendingNodeUpdates.current = {};
          console.log('💾 ✅ Cleared pending updates after successful version creation');
          
          // Navigate to new version and apply changes there
          console.log(`✅ Navigating to new version: ${newFlowId}`);
          navigate(`/flows/${newFlowId}/edit`);
          
          // Note: User will need to make their edits in the new version
          toast('Make your changes in this new draft version', { icon: 'ℹ️' });
        }
      }
      
    } catch (error) {
      console.error('❌ Error in handleSaveAsNewVersion:', error);
      
      // Handle specific error codes
      const statusCode = error.response?.status;
      let errorDetail = error.response?.data?.detail;
      
      // Handle Pydantic validation errors (array of error objects)
      if (Array.isArray(errorDetail)) {
        errorDetail = errorDetail.map(e => 
          typeof e === 'object' ? (e.msg || e.message || JSON.stringify(e)) : e
        ).join(', ');
      } else if (typeof errorDetail === 'object' && errorDetail !== null) {
        errorDetail = errorDetail.msg || errorDetail.message || JSON.stringify(errorDetail);
      }
      
      console.log('[SAVE AS NEW VERSION ERROR] Status code:', statusCode);
      console.log('[SAVE AS NEW VERSION ERROR] Error detail:', errorDetail);
      
      if (statusCode === 409) {
        // FIX: Duplicate flow name error - show prominent toast with exact message
        console.log('[SAVE AS NEW VERSION ERROR] 409 - Showing duplicate name error toast');
        toast.error(`⚠️ No duplicate flow name allowed. Flow name already exists.`, {
          duration: 8000,
          style: {
            background: '#FEF2F2',
            border: '2px solid #EF4444',
            color: '#991B1B',
            fontWeight: '500'
          }
        });
      } else if (statusCode === 400) {
        toast.error(errorDetail || 'Invalid flow data. Please check your configuration.');
      } else if (statusCode === 422) {
        toast.error(errorDetail || 'Validation error. Please check your flow configuration.');
      } else {
        toast.error(errorDetail || error.message || 'Failed to save flow');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleRun = async () => {
    if (flowId && flowId !== 'new') {
      // Open Run Manually modal
      setShowRunManuallyModal(true);
      
      // Fetch flow versions for the modal (with input_variables)
      try {
        const response = await axios.get(`${API}/api/flow-builder/flows/${flowId}/versions`);
        const versionsWithInputs = response.data.versions || [];
        
        // Add current flow as well if not in versions
        const currentFlowData = {
          id: flowId,
          version: flowVersion,
          status: flowStatus,
          name: flowName,
          input_variables: inputVariables
        };
        
        setFlowVersions(versionsWithInputs.length > 0 ? versionsWithInputs : [currentFlowData]);
      } catch (error) {
        console.error('Error fetching versions:', error);
        // Fallback to current flow only with input variables
        setFlowVersions([{
          id: flowId,
          version: flowVersion,
          status: flowStatus,
          name: flowName,
          input_variables: inputVariables
        }]);
      }
    } else {
      toast.error('Please save the flow first');
    }
  };
  
  const handleRunManually = async (versionId, inputValues) => {
    try {
      const response = await axios.post(`${API}/api/flow-builder/flows/${flowId}/run-manually`, {
        version_id: versionId,
        input_values: inputValues  // Send input values
      });
      
      toast.success('Flow execution started!');
      console.log('Execution:', response.data);
      
      // Open logs panel to show execution
      setShowLogsPanel(true);
    } catch (error) {
      console.error('Error running flow manually:', error);
      toast.error('Failed to run flow: ' + (error.response?.data?.detail || error.message));
    }
  };

  const handleAIFlowGenerated = (generatedFlow) => {
    // Load the AI-generated flow into the editor
    setFlowName(generatedFlow.name || 'AI Generated Flow');
    setFlowDescription(generatedFlow.description || '');
    
    // Reconstruct the flow with add buttons
    // Pass flow_type if available to ensure correct node types
    const { reconstructedNodes, reconstructedEdges } = reconstructFlowWithAddButtons(
      generatedFlow.triggers || [],
      generatedFlow.nodes || [],
      generatedFlow.edges || [],
      generatedFlow.flow_type || null
    );
    
    setNodes(reconstructedNodes);
    setEdges(reconstructedEdges);
    setTriggers(generatedFlow.triggers || []);
    
    // Update flow type if provided
    if (generatedFlow.flow_type) {
      setSavedFlowType(generatedFlow.flow_type);
    }
    
    setShowAIAssistant(false);
    toast.success('AI-generated flow loaded! Review and save when ready.');
  };

  // Define custom node types
  const nodeTypes = useMemo(
    () => ({
      addButton: AddButtonNode,
      loop: LoopNode,
      decision: DecisionNode,
      merge: MergeNode,
      delay: DelayNode,
      screen: ScreenNode,
      add_error: AddErrorNode,
      faultNode: FaultNode,  // Salesforce-style Fault node
      faultEndNode: FaultEndNode,  // White End node for fault paths
      trigger: TriggerNode,
      start: TriggerNode,
      record_trigger: TriggerNode,
      webhook_trigger: TriggerNode,
      scheduled_trigger: TriggerNode,
      screen_flow_start: ScreenFlowStartNode,  // Non-clickable Start for Screen Flows
      screen_flow_end: ScreenFlowEndNode,      // Non-clickable End for Screen Flows
    }),
    []
  );
  
  const edgeTypes = useMemo(
    () => ({
      decision: DecisionEdge
    }),
    []
  );

 const isConfigOpen = layoutReady && selectedNode && selectedNode.type !== 'addButton' && 
    selectedNode.type !== 'screen_flow_start' && selectedNode.type !== 'screen_flow_end' &&
    !selectedNode.data?.isSystemNode;
  const CONFIG_PANEL_WIDTH = 800;

  return (
    <div className="h-screen flex flex-col">
      {/* Suppress ResizeObserver error overlay */}
      <style>{`
        #webpack-dev-server-client-overlay,
        #webpack-dev-server-client-overlay-div {
          display: none !important;
        }
      `}</style>
      {/* Read-Only Banner */}
      {isReadOnly && (
        <div className="bg-yellow-50 border-b-2 border-yellow-400 px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="bg-yellow-400 rounded-full p-1">
                <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-yellow-900">
                  Read-Only Mode: Version {flowVersion} ({flowStatus === 'active' ? 'Active' : 'Archived'})
                </p>
                <p className="text-xs text-yellow-700">
                  This version cannot be edited. {flowStatus === 'active' ? 'Create a new version to make changes.' : 'Archived versions are permanently read-only.'}
                </p>
              </div>
            </div>
            {flowStatus === 'active' && (
              <Button
                onClick={handleCreateNewVersion}
                className="bg-indigo-600 hover:bg-indigo-700 text-white"
                size="sm"
              >
                <Plus className="h-4 w-4 mr-1" />
                Create New Version
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/flows')}
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <div>
            <Input
              value={flowName}
              onChange={(e) => setFlowName(e.target.value)}
              disabled={isReadOnly}
              placeholder="Enter Flow Name..."
              className="
                text-lg font-semibold
                px-3 py-2
                border border-gray-300
                rounded-md
                bg-white
                focus:outline-none
                focus:ring-2 focus:ring-blue-500
                focus:border-blue-500
              "
           />
           <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-slate-500">v{flowVersion}</span>
              <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                flowStatus === 'active' ? 'bg-green-100 text-green-700' :
                flowStatus === 'draft' ? 'bg-yellow-100 text-yellow-700' :
                'bg-gray-100 text-gray-700'
              }`}>
                {flowStatus?.toUpperCase() || 'DRAFT'}
              </span>
              {isReadOnly && (
                <span className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded font-medium">
                  🔒 READ-ONLY
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Only show trigger indicator for Record-Triggered flows */}
          {flowType === 'record-triggered' && (
            <div className="text-sm text-slate-600 mr-2">
              {nodes.filter(n => (n.data?.nodeType || n.type) === 'trigger').length > 0 ? (
                <span className="flex items-center gap-1 bg-orange-50 px-2 py-1 rounded border border-orange-200">
                  <Zap className="h-3 w-3 text-orange-600" />
                  <span className="font-medium text-orange-600">
                    {nodes.filter(n => (n.data?.nodeType || n.type) === 'trigger').length} Trigger
                  </span>
                </span>
              ) : (
                <span className="text-slate-400 text-xs">⚠️ Add Trigger node to enable auto-run</span>
              )}
            </div>
          )}
          <Button
            onClick={() => setShowAIAssistant(true)}
            variant="outline"
            size="sm"
            className="bg-gradient-to-r from-indigo-50 to-purple-50 border-indigo-300 hover:from-indigo-100 hover:to-purple-100"
          >
            <Sparkles className="h-4 w-4 mr-1 text-indigo-600" />
            AI Assistant
          </Button>
          <Button
            onClick={() => setShowFlowSettingsPanel(true)}
            variant="outline"
            size="sm"
            className="bg-gradient-to-r from-slate-50 to-gray-50 border-slate-300 hover:from-slate-100 hover:to-gray-100"
          >
            <Settings className="h-4 w-4 mr-1 text-slate-600" />
            Flow Settings
          </Button>
          <Button
            onClick={() => setShowInputVariablesPanel(true)}
            variant="outline"
            size="sm"
            className="bg-gradient-to-r from-purple-50 to-pink-50 border-purple-300 hover:from-purple-100 hover:to-pink-100"
          >
            <Settings className="h-4 w-4 mr-1 text-purple-600" />
            Input Variables
          </Button>
          <Button
            onClick={() => setShowLogsPanel(true)}
            variant="outline"
            size="sm"
            className="bg-gradient-to-r from-blue-50 to-cyan-50 border-blue-300 hover:from-blue-100 hover:to-cyan-100"
            disabled={!flowId}
          >
            <Activity className="h-4 w-4 mr-1 text-blue-600" />
            View Logs
          </Button>
          
          {/* Run Manually Button - Different behavior for Screen vs Non-Screen flows */}
          {(() => {
            // Robust Screen Flow detection (shared logic)
            const normalize = (val) => String(val || '').toLowerCase().trim();
            const flowTypeNorm = normalize(flowType);
            const savedTypeNorm = normalize(savedFlowType);
            
            // Check multiple conditions
            const isScreenByType = ['screen', 'screen_flow', 'screen-flow', 'screenflow'].some(t => 
              flowTypeNorm.includes(t) || savedTypeNorm.includes(t)
            );
            
            // Check if any node is a screen node
            const hasScreenNode = nodes.some(n => {
              const nodeType = normalize(n?.type || n?.data?.nodeType || '');
              return ['screen', 'start_screen', 'startscreen', 'screennode'].some(t => 
                nodeType.includes(t)
              );
            });
            
            const isScreenFlow = isScreenByType || hasScreenNode;
            
            // Debug log
            console.log('🔍 [RUN MANUALLY BUTTON DETECTION]', {
              flowType,
              savedFlowType,
              isScreenByType,
              hasScreenNode,
              isScreenFlow
            });
            
            // For Screen Flows: Show "Run Manually" that triggers Preview
            if (isScreenFlow) {
              return (
                <Button
                  onClick={() => {
                    console.log('✅ [Screen Flow Run Manually] Opening Preview');
                    setShowPreview(true);
                  }}
                  variant="outline"
                  size="sm"
                  className="bg-gradient-to-r from-purple-50 to-pink-50 border-purple-300 hover:from-purple-100 hover:to-pink-100"
                  title="Run this Screen Flow (Preview Mode)"
                >
                  <Eye className="h-4 w-4 mr-1 text-purple-600" />
                  Run Manually
                </Button>
              );
            }
            
            // For Non-Screen Flows: Show traditional "Run Manually" button
            if (flowId && flowId !== 'new') {
              return (
                <Button
                  onClick={handleRun}
                  variant="outline"
                  size="sm"
                  className="bg-gradient-to-r from-green-50 to-emerald-50 border-green-300 hover:from-green-100 hover:to-emerald-100"
                  title="Run this flow manually"
                >
                  <Play className="h-4 w-4 mr-1 text-green-600" />
                  Run Manually
                </Button>
              );
            }
            
            return null;
          })()}
          
          {!isReadOnly && flowStatus !== 'active' && (
            <>
              <Button
                onClick={handleSave}
                disabled={saving || flowId === 'new'}
                className="bg-indigo-600 hover:bg-indigo-700"
                size="sm"
              >
                <Save className="h-4 w-4 mr-1" />
                {(saving && flowId !== 'new') ? 'Saving...' : 'Save'}
              </Button>
              <Button
                onClick={handleSaveAsNewVersion}
                disabled={saving || (flowId && flowId !== 'new')}
                variant="outline"
                size="sm"
                className="border-indigo-300 text-indigo-600 hover:bg-indigo-50"
              >
                <Save className="h-4 w-4 mr-1" />
                {(saving && flowId === 'new') ? 'Saving...' : 'Save as New Version'}
              </Button>
            </>
          )}
          
          {(isReadOnly || flowStatus === 'active') && flowStatus === 'active' && (
            <Button
              onClick={handleCreateNewVersion}
              className="bg-indigo-600 hover:bg-indigo-700"
              size="sm"
              disabled={saving}
            >
              <Plus className="h-4 w-4 mr-1" />
              {saving ? 'Creating...' : 'Create New Version'}
            </Button>
          )}
          
          {isReadOnly && flowStatus === 'archived' && (
            <div className="px-3 py-2 bg-gray-100 rounded text-sm text-gray-600 font-medium">
              Archived - Read Only
            </div>
          )}
        </div>
      </div>

      {/* Main Content - Full Width Canvas */}
      <div className="flex-1 relative overflow-hidden">
        {/* CSS Override for Decision Node Background */}
        <style>
          {`
            /* Remove yellow/orange background from Decision nodes */
            .react-flow__node.selected .decision-node-salesforce,
            .react-flow__node.selected .decision-node-salesforce > div,
            .react-flow__node .decision-node-salesforce {
              background: transparent !important;
            }
          `}
        </style>
        
        {/* Canvas */}
        <div 
          className="absolute top-0 h-full transition-all duration-300 ease-in-out"
          style={{
            left: 0,
            right: isConfigOpen ? CONFIG_PANEL_WIDTH : 0,
            width: 'auto',
          }}
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={isReadOnly ? () => {} : onNodesChange}
            onEdgesChange={isReadOnly ? () => {} : onEdgesChange}
            onConnect={isReadOnly ? () => {} : onConnect}
            onNodeClick={isReadOnly ? () => {} : onNodeClick}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            fitView
            fitViewOptions={{
              padding: 0.2,
              includeHiddenNodes: false,
            }}
            defaultViewport={{ x: 0, y: 0, zoom: 1 }}
            nodesDraggable={!isReadOnly}
            nodesConnectable={!isReadOnly}
            elementsSelectable={!isReadOnly}
            panOnDrag
            translateExtent={[
              [-2000, -2000],    // Allow more left/up panning
              [3000, 5000],      // Allow more right/down panning
            ]}
            className="h-full w-full"
          >
            <Controls />
            <Background variant="dots" gap={16} size={1} color="#cbd5e1" />
          </ReactFlow>
        </div>

        {/* Config Panel */}
        {isConfigOpen && (
          <div
            className="absolute top-0 right-0 h-full border-l bg-white overflow-y-auto z-10 shadow-lg"
            style={{ width: CONFIG_PANEL_WIDTH }}
          >
          {selectedNode?.data?.nodeType === 'webhook_trigger' ? (
            <WebhookTriggerConfigPanel
              flowId={flowId}
              triggers={triggers}
              onUpdateTriggers={setTriggers}
              onClose={() => setSelectedNode(null)}
            />
          ) : selectedNode?.data?.nodeType === 'scheduled_trigger' ? (
            <ScheduledTriggerConfigPanel
              flowId={flowId}
              triggers={triggers}
              onUpdateTriggers={setTriggers}
              onClose={() => setSelectedNode(null)}
            />
          ) : (
            <NodeConfigPanel
              key={`config-${selectedNode?.id}-${configPanelKey}`}  // Use stable counter instead of Date.now()
              node={selectedNode}
              onUpdate={onUpdateNodeConfig}
              onDelete={onDeleteNode}
              onClose={() => setSelectedNode(null)}
              crmObjects={{...crmObjects, nodes: nodes}}
              fetchFieldsForObject={fetchFieldsForObject}
              flowVariables={allAvailableVariables}  // Include webhook body fields
              onCreateVariable={handleCreateFlowVariable}
              nodes={nodes}
              edges={edges}
              triggers={triggers}
              flowType={flowType}
              launchMode={launchMode}
              screenFlowObject={screenFlowObject}
              onAddFaultPath={handleAddFaultPath}
            />
          )}
          </div>
        )}
      </div>

      {/* Add Action Menu */}
      {showAddActionMenu && (
        <AddActionMenu
          onClose={() => setShowAddActionMenu(false)}
          onSelectAction={handleActionSelect}
          position={addActionPosition}
          flowType={flowType}
          triggers={triggers}
        />
      )}

      {/* AI Flow Assistant */}
      {showAIAssistant && (
        <AIFlowAssistant
          onClose={() => setShowAIAssistant(false)}
          onFlowGenerated={handleAIFlowGenerated}
        />
      )}

      {/* Flow Logs Panel */}
      {showLogsPanel && flowId && (
        <FlowLogsPanel
          flowId={flowId}
          onClose={() => setShowLogsPanel(false)}
        />
      )}
      
      {/* Run Manually Modal */}
      {showRunManuallyModal && (
        <RunManuallyModal
          isOpen={showRunManuallyModal}
          onClose={() => setShowRunManuallyModal(false)}
          onRun={handleRunManually}
          flow={{ 
            id: flowId, 
            name: flowName, 
            version: flowVersion, 
            status: flowStatus,
            input_variables: inputVariables  // Pass input variables
          }}
          versions={flowVersions}
        />
      )}
      
      {/* Flow Settings Panel */}
      {showFlowSettingsPanel && (
        <div className="fixed inset-y-0 right-0 w-96 bg-white shadow-2xl z-50 flex flex-col border-l border-slate-200">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
            <h2 className="text-lg font-semibold text-slate-900">Flow Settings</h2>
            <button
              onClick={() => setShowFlowSettingsPanel(false)}
              className="text-slate-400 hover:text-slate-600 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Launch Mode Setting - ONLY for Screen Flows */}
            {flowType === 'screen-flow' && (
              <div className="space-y-3 border-b border-slate-200 pb-6">
                <div>
                  <label className="text-sm font-medium text-slate-700 block mb-1">
                    Launch Mode
                  </label>
                  <p className="text-xs text-slate-500 mb-2">How will this Screen Flow be launched?</p>
                  <select
                    value={launchMode}
                    onChange={(e) => setLaunchMode(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  >
                    <option value="basic">Use Anywhere (Basic)</option>
                    <option value="record_detail">Record Detail Page (Single Record)</option>
                    <option value="list_view">List View (Multiple Records)</option>
                  </select>
                </div>
                
                {/* Helper Text based on mode */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  {launchMode === 'basic' && (
                    <>
                      <p className="text-xs text-blue-900 font-medium mb-1">ℹ️ Use Anywhere Mode</p>
                      <p className="text-xs text-blue-700 mb-2">
                        Flow runs without record context (Home/App Page). No system variables created.
                      </p>
                      <ul className="text-xs text-blue-700 space-y-1 ml-4 list-disc">
                        <li>Launched from Home or App pages</li>
                        <li>No automatic recordId or object context</li>
                        <li>User creates input variables manually as needed</li>
                      </ul>
                    </>
                  )}
                  {launchMode === 'record_detail' && (
                    <>
                      <p className="text-xs text-blue-900 font-medium mb-1">ℹ️ Record Detail Mode</p>
                      <p className="text-xs text-blue-700 mb-2">
                        System variable <code className="bg-blue-100 px-1 rounded font-mono">recordId</code> automatically created and populated at runtime.
                      </p>
                      <ul className="text-xs text-blue-700 space-y-1 ml-4 list-disc">
                        <li>Launched from Record Detail Page</li>
                        <li><code className="bg-blue-100 px-1 rounded font-mono">recordId</code> is read-only and system-managed</li>
                        <li>Object context inferred from record page</li>
                      </ul>
                    </>
                  )}
                  {launchMode === 'list_view' && (
                    <>
                      <p className="text-xs text-blue-900 font-medium mb-1">ℹ️ List View Mode (Bulk)</p>
                      <p className="text-xs text-blue-700 mb-2">
                        System variables <code className="bg-blue-100 px-1 rounded font-mono">recordIds</code> and 
                        <code className="bg-blue-100 px-1 rounded font-mono ml-1">selectedCount</code> automatically created.
                      </p>
                      <ul className="text-xs text-blue-700 space-y-1 ml-4 list-disc">
                        <li>Launched from List View bulk action</li>
                        <li><code className="bg-blue-100 px-1 rounded font-mono">recordIds</code> contains all selected record IDs</li>
                        <li><code className="bg-blue-100 px-1 rounded font-mono">selectedCount</code> shows number of selected records</li>
                        <li>Object context inferred from list view</li>
                      </ul>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Batch Size Setting */}
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1">
                  Batch Size (Records per Execution)
                </label>
                <input
                  type="number"
                  min="1"
                  max="500"
                  value={batchSize}
                  onChange={(e) => {
                    const value = parseInt(e.target.value);
                    if (!isNaN(value)) {
                      setBatchSize(Math.max(1, Math.min(500, value)));
                    }
                  }}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>

              {/* Helper Text */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-xs text-blue-900 font-medium mb-1">
                  ℹ️ Salesforce Batch Processing
                </p>
                <p className="text-xs text-blue-700 mb-2">
                  Controls how many records are processed per execution batch. 
                  Smaller sizes reduce load but increase total runs.
                </p>
                <p className="text-xs text-blue-700 font-medium mb-1">Applies to:</p>
                <ul className="text-xs text-blue-700 space-y-1 ml-4">
                  <li>✅ Trigger Flows</li>
                  <li>✅ Scheduled Flows</li>
                  <li>✅ Webhook Flows (multi-record)</li>
                  <li>❌ Screen Flows (user-driven)</li>
                </ul>
              </div>

              {/* Warning for large batch sizes */}
              {batchSize > 200 && (
                <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-3">
                  <p className="text-xs text-yellow-900 font-medium mb-1">
                    ⚠️ Performance Warning
                  </p>
                  <p className="text-xs text-yellow-800">
                    Batch size {batchSize} exceeds recommended maximum of 200. 
                    Large batch sizes may impact performance or hit API limits.
                  </p>
                </div>
              )}

              {/* Info about batching */}
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                <p className="text-xs text-slate-700 font-medium mb-2">
                  📊 Batch Calculation Example:
                </p>
                <div className="text-xs text-slate-600 space-y-1">
                  <div className="flex justify-between">
                    <span>1,200 records</span>
                    <span className="font-mono">÷</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-300 pb-1">
                    <span>Batch size {batchSize}</span>
                    <span className="font-mono">=</span>
                  </div>
                  <div className="flex justify-between font-medium text-indigo-600 pt-1">
                    <span>{Math.ceil(1200 / batchSize)} execution batches</span>
                  </div>
                </div>
              </div>

              {/* Range Info */}
              <div className="text-xs text-slate-500 space-y-1">
                <p>• Minimum: 1 record per batch</p>
                <p>• Maximum: 500 records per batch</p>
                <p>• Recommended: 50-200 records</p>
                <p>• Default: 50 records</p>
              </div>
            </div>
          </div>
          <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2">
            <button
              onClick={() => setShowFlowSettingsPanel(false)}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors"
            >
              Close
            </button>
            <button
              onClick={() => {
                setShowFlowSettingsPanel(false);
                toast.success(`Batch size set to ${batchSize} records`);
              }}
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 transition-colors"
            >
              Apply Settings
            </button>
          </div>
        </div>
      )}

      {/* Input Variables Panel */}
      {showInputVariablesPanel && (
        <InputVariablesPanel
          isOpen={showInputVariablesPanel}
          onClose={() => setShowInputVariablesPanel(false)}
          inputVariables={inputVariables}
          flowType={flowType}
          savedFlowType={savedFlowType}
          launchMode={launchMode}
          onSave={(updatedVariables) => {
            console.log('💾 FlowEditorPage - Received updated variables:', updatedVariables);
            setInputVariables(updatedVariables);
            console.log('✅ FlowEditorPage - State updated, inputVariables length:', updatedVariables.length);
            toast.success('Input variables updated');
          }}
        />
      )}

      {/* Screen Flow Preview Runner */}
      {showPreview && (() => {
        // Use same detection logic as Preview button
        const normalize = (val) => String(val || '').toLowerCase().trim();
        const flowTypeNorm = normalize(flowType);
        const savedTypeNorm = normalize(savedFlowType);
        
        const isScreenByType = ['screen', 'screen_flow', 'screen-flow', 'screenflow'].some(t => 
          flowTypeNorm.includes(t) || savedTypeNorm.includes(t)
        );
        
        const hasScreenNode = nodes.some(n => {
          const nodeType = normalize(n?.type || n?.data?.nodeType || '');
          return ['screen', 'start_screen', 'startscreen', 'screennode'].some(t => 
            nodeType.includes(t)
          );
        });
        
        const isScreenFlow = isScreenByType || hasScreenNode;
        
        console.log('[PREVIEW MODAL] Rendering check:', { 
          showPreview, 
          isScreenFlow, 
          flowType, 
          savedFlowType,
          nodeCount: nodes.length 
        });
        
        return isScreenFlow;
      })() && (
        <ScreenFlowPreviewRunner
          flow={{
            id: flowId,
            name: flowName,
            version_number: flowVersion,
            nodes,
            edges,
            variables: flowVariables,
            launch_mode: launchMode,
            flow_type: flowType || savedFlowType || 'screen-flow',
            screen_flow_object: screenFlowObject  // For record context picker
          }}
          onClose={() => {
            console.log('[PREVIEW] Modal closing');
            setShowPreview(false);
            setHighlightedNodeId(null);
          }}
          onNodeHighlight={(nodeId) => {
            console.log('[PREVIEW] Highlighting node:', nodeId);
            setHighlightedNodeId(nodeId);
          }}
          initialContext={{}}
        />
      )}
    </div>
  );
};

// Wrapper component with ReactFlowProvider
const FlowEditorPageWrapper = () => {
  return (
    <ReactFlowProvider>
      <FlowEditorPage />
    </ReactFlowProvider>
  );
};

export default FlowEditorPageWrapper;