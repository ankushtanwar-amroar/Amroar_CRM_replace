import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Play, RotateCcw, AlertCircle, CheckCircle, Clock, ArrowRight, ArrowLeft, Check, AlertTriangle, Info, Database, Search, User, Users, Square, Loader2, BarChart3 } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Textarea } from '../../../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { Switch } from '../../../components/ui/switch';
import { Progress } from '../../../components/ui/progress';
import axios from 'axios';

const API = process.env.REACT_APP_BACKEND_URL || '';

/**
 * Screen Flow Preview Runner
 * Salesforce-like "Debug/Run/Preview" for Screen Flows
 * 
 * Features:
 * - Real runtime execution using flow engine
 * - Screen rendering with validation
 * - Previous/Next/Finish navigation
 * - Safe Preview mode (no DB writes)
 * - Live execution logs
 * - Node highlighting on canvas
 * 
 * RECORD DETAIL MODE:
 * - Select ONE record from dropdown
 * - Auto-prefill screen fields from record
 * - Set recordId and record context variables
 * 
 * LIST VIEW MODE:
 * - Select MULTIPLE records
 * - Execute flow automatically for EACH record
 * - Progress indicator and per-record logs
 * - Summary with success/failure counts
 */
const ScreenFlowPreviewRunner = ({ 
  flow, 
  onClose, 
  onNodeHighlight,
  initialContext = {} 
}) => {
  // =============================================
  // STATE DECLARATIONS
  // =============================================
  const [previewState, setPreviewState] = useState('context_selection');
  // States: context_selection, starting, running, bulk_running, completed, error
  
  const [safeMode, setSafeMode] = useState(true);
  const [executionId, setExecutionId] = useState(null);
  const [currentScreen, setCurrentScreen] = useState(null);
  const [screenData, setScreenData] = useState({});
  const [executionContext, setExecutionContext] = useState(initialContext);
  const [executionLogs, setExecutionLogs] = useState([]);
  const [screenHistory, setScreenHistory] = useState([]);
  const [validationErrors, setValidationErrors] = useState({});
  const [isProcessing, setIsProcessing] = useState(false);
  const lastProcessedNodeRef = useRef(null);
  
  // Toast state
  const [activeToasts, setActiveToasts] = useState([]);
  const [flowTerminatedByToast, setFlowTerminatedByToast] = useState(false);
  const toastTimeoutsRef = useRef([]);
  
  // RECORD CONTEXT STATE
  const [contextReady, setContextReady] = useState(false);
  const [availableRecords, setAvailableRecords] = useState([]);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [recordSearchTerm, setRecordSearchTerm] = useState('');
  const [selectedRecordId, setSelectedRecordId] = useState(null);
  const [selectedRecordData, setSelectedRecordData] = useState(null);
  const [selectedRecordIds, setSelectedRecordIds] = useState([]);
  const [selectedRecordsData, setSelectedRecordsData] = useState([]);
  const [prefillApplied, setPrefillApplied] = useState(false);
  
  // LIST VIEW BULK EXECUTION STATE
  const [bulkExecutionState, setBulkExecutionState] = useState({
    isRunning: false,
    currentIndex: 0,
    totalRecords: 0,
    results: [], // { recordId, recordName, status: 'success'|'failed', logs: [], actions: [], errorMessage? }
    stopOnError: false,
    shouldStop: false
  });

  // Get launch mode and object from flow
  const launchMode = flow?.launch_mode || 'basic';
  const screenFlowObject = flow?.screen_flow_object || null;
  
  console.log('[PREVIEW RUNNER] Flow config:', { launchMode, screenFlowObject, flow });

  // =============================================
  // UTILITY FUNCTIONS
  // =============================================
  
  // Get theme styles from screen config (for preview rendering)
  const getPreviewThemeStyles = (screen) => {
    const theme = screen?.theme || {};
    const styles = {
      pageBackground: {},
      contentCard: {},
      header: {},
      button: {},
      contentPadding: 'p-6'
    };

    if (!theme || Object.keys(theme).length === 0) return styles;

    // Background color map
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

    // Content card background
    if (theme.contentBackground === 'custom' && theme.contentBackgroundCustom) {
      styles.contentCard.backgroundColor = theme.contentBackgroundCustom;
    } else if (bgColorMap[theme.contentBackground]) {
      styles.contentCard.backgroundColor = bgColorMap[theme.contentBackground];
    } else {
      styles.contentCard.backgroundColor = '#ffffff';
    }

    // Border radius
    const radiusMap = {
      'none': '0px',
      'sm': '4px',
      'md': '8px',
      'lg': '12px',
      'xl': '16px',
      '2xl': '24px'
    };
    if (radiusMap[theme.borderRadius]) {
      styles.contentCard.borderRadius = radiusMap[theme.borderRadius];
    }

    // Shadow
    const shadowMap = {
      'none': 'none',
      'sm': '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
      'md': '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
      'lg': '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
      'xl': '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
    };
    if (shadowMap[theme.shadow]) {
      styles.contentCard.boxShadow = shadowMap[theme.shadow];
    }

    // Header style
    const headerGradients = {
      'blue-gradient': 'linear-gradient(to right, #2563eb, #4f46e5)',
      'indigo-gradient': 'linear-gradient(to right, #4f46e5, #9333ea)',
      'purple-gradient': 'linear-gradient(to right, #9333ea, #ec4899)',
      'green-gradient': 'linear-gradient(to right, #16a34a, #0d9488)',
      'orange-gradient': 'linear-gradient(to right, #ea580c, #ef4444)',
      'gray-gradient': 'linear-gradient(to right, #374151, #111827)'
    };
    const headerSolids = {
      'solid-blue': '#2563eb',
      'solid-indigo': '#4f46e5',
      'solid-gray': '#374151'
    };
    
    if (theme.headerStyle === 'custom' && theme.headerCustomStart && theme.headerCustomEnd) {
      styles.header = { background: `linear-gradient(to right, ${theme.headerCustomStart}, ${theme.headerCustomEnd})` };
    } else if (headerGradients[theme.headerStyle]) {
      styles.header = { background: headerGradients[theme.headerStyle] };
    } else if (headerSolids[theme.headerStyle]) {
      styles.header = { backgroundColor: headerSolids[theme.headerStyle] };
    }

    // Button color
    const buttonColors = {
      'blue': { backgroundColor: '#2563eb', hover: '#1d4ed8' },
      'indigo': { backgroundColor: '#4f46e5', hover: '#4338ca' },
      'purple': { backgroundColor: '#9333ea', hover: '#7e22ce' },
      'green': { backgroundColor: '#16a34a', hover: '#15803d' },
      'orange': { backgroundColor: '#ea580c', hover: '#c2410c' },
      'gray': { backgroundColor: '#374151', hover: '#1f2937' }
    };
    if (theme.buttonColor === 'custom' && theme.buttonColorCustom) {
      styles.button = { backgroundColor: theme.buttonColorCustom };
    } else if (buttonColors[theme.buttonColor]) {
      styles.button = buttonColors[theme.buttonColor];
    }

    // Content padding
    const paddingMap = {
      'compact': 'p-4',
      'normal': 'p-6',
      'relaxed': 'p-8',
      'spacious': 'p-12'
    };
    styles.contentPadding = paddingMap[theme.contentPadding] || 'p-6';

    return styles;
  };
  
  // Add log entry
  const addLog = useCallback((type, message, details = null) => {
    const log = {
      timestamp: new Date().toISOString(),
      type,
      message,
      details
    };
    setExecutionLogs(prev => [...prev, log]);
    return log;
  }, []);

  // Normalize field name for matching (remove underscores, lowercase)
  const normalizeFieldName = (name) => {
    if (!name) return '';
    return name.toLowerCase().replace(/_/g, '').replace(/-/g, '').replace(/\s/g, '');
  };

  // Determine if we need record context selection
  const needsContextSelection = launchMode === 'record_detail' || launchMode === 'list_view';

  // =============================================
  // RECORD LOADING
  // =============================================
  
  // Load records for context selection
  const loadRecordsForContext = async () => {
    if (!screenFlowObject) return;
    
    setRecordsLoading(true);
    const objectApiName = screenFlowObject.toLowerCase();
    addLog('info', `🔍 Loading ${screenFlowObject} records for context selection...`);
    
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API}/api/objects/${objectApiName}/records`, {
        params: { limit: 100, search: recordSearchTerm || undefined },
        headers: { Authorization: `Bearer ${token}` }
      });
      
      const records = response.data?.records || response.data || [];
      setAvailableRecords(records);
      addLog('success', `✅ Loaded ${records.length} record(s) for selection`);
    } catch (error) {
      console.error('Error loading records:', error);
      addLog('error', `❌ Failed to load records: ${error.message}`);
      setAvailableRecords([]);
    } finally {
      setRecordsLoading(false);
    }
  };

  // Fetch single record details
  const fetchRecordDetails = async (recordId, objectName) => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(
        `${API}/api/objects/${objectName.toLowerCase()}/records/${recordId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      return response.data;
    } catch (error) {
      console.error('Error fetching record details:', error);
      return null;
    }
  };

  // =============================================
  // AUTO-PREFILL LOGIC
  // =============================================
  
  // Auto-prefill screen fields from record data
  const applyRecordPrefill = useCallback((screenFields, recordData, logFn = addLog) => {
    if (!recordData || !screenFields) return {};
    
    const prefillValues = {};
    const recordFieldMap = {};
    
    // CRM records have actual field data nested under 'data' property
    // So we need to check both the root level and the 'data' property
    const flattenRecord = (record) => {
      const flatMap = {};
      
      // First, add all root-level fields
      Object.keys(record).forEach(key => {
        if (!key.startsWith('_') && key !== 'tenant_id' && key !== 'data') {
          const value = record[key];
          // Skip object/array values at root level (likely metadata)
          if (value !== null && typeof value !== 'object') {
            flatMap[normalizeFieldName(key)] = { key, value };
          }
        }
      });
      
      // Then, if there's a 'data' property (CRM record structure), add those fields
      // These take precedence as they contain the actual field values
      if (record.data && typeof record.data === 'object' && !Array.isArray(record.data)) {
        Object.keys(record.data).forEach(key => {
          if (!key.startsWith('_')) {
            flatMap[normalizeFieldName(key)] = { key: `data.${key}`, value: record.data[key] };
          }
        });
      }
      
      return flatMap;
    };
    
    // Build normalized field map from record (flattened)
    const flatRecord = flattenRecord(recordData);
    Object.assign(recordFieldMap, flatRecord);
    
    logFn('info', '🔄 Applying record prefill to screen fields...');
    logFn('info', `   Available record fields: ${Object.keys(recordFieldMap).join(', ')}`);
    
    screenFields.forEach(field => {
      const fieldApiName = field.name || field.apiName;
      if (!fieldApiName) return;
      
      const normalizedFieldName = normalizeFieldName(fieldApiName);
      const matchingRecordField = recordFieldMap[normalizedFieldName];
      
      if (matchingRecordField && matchingRecordField.value !== undefined && matchingRecordField.value !== null) {
        prefillValues[fieldApiName] = matchingRecordField.value;
        logFn('success', `   ✓ Prefilled ${fieldApiName} from record.${matchingRecordField.key} = "${matchingRecordField.value}"`);
      }
    });
    
    if (Object.keys(prefillValues).length === 0) {
      logFn('info', '   No matching fields found for prefill');
    } else {
      logFn('success', `   Prefilled ${Object.keys(prefillValues).length} field(s) total`);
    }
    
    return prefillValues;
  }, [addLog]);

  // =============================================
  // RECORD SELECTION HANDLERS
  // =============================================
  
  // Handle record selection for record_detail mode
  const handleRecordSelect = (recordId) => {
    const record = availableRecords.find(r => r.id === recordId);
    if (record) {
      setSelectedRecordId(recordId);
      setSelectedRecordData(record);
      addLog('success', `✅ Selected record: ${record.name || record.first_name || record.id}`);
      addLog('info', `📌 Record Detail context selected: recordId = ${recordId}`);
      
      const fieldNames = Object.keys(record).filter(k => !k.startsWith('_') && k !== 'id' && k !== 'tenant_id');
      addLog('info', `📋 Record fields available for prefill: ${fieldNames.join(', ')}`);
    }
  };

  // Handle multi-record selection for list_view mode
  const handleRecordToggle = (recordId) => {
    const record = availableRecords.find(r => r.id === recordId);
    
    if (selectedRecordIds.includes(recordId)) {
      setSelectedRecordIds(prev => prev.filter(id => id !== recordId));
      setSelectedRecordsData(prev => prev.filter(r => r.id !== recordId));
      addLog('info', `➖ Deselected record: ${record?.name || record?.first_name || recordId}`);
    } else {
      setSelectedRecordIds(prev => [...prev, recordId]);
      if (record) {
        setSelectedRecordsData(prev => [...prev, record]);
      }
      addLog('info', `➕ Selected record: ${record?.name || record?.first_name || recordId}`);
    }
  };

  // Select all visible records
  const handleSelectAll = () => {
    const allIds = availableRecords.map(r => r.id);
    setSelectedRecordIds(allIds);
    setSelectedRecordsData([...availableRecords]);
    addLog('info', `✅ Selected all ${availableRecords.length} records`);
  };

  // Clear all selections
  const handleClearSelection = () => {
    setSelectedRecordIds([]);
    setSelectedRecordsData([]);
    addLog('info', '🗑️ Cleared all selections');
  };

  // =============================================
  // FLOW NODE HELPERS
  // =============================================
  
  // Find first screen node in flow
  const findFirstScreenNode = () => {
    const { nodes: flowNodes, edges: flowEdges } = flow;
    
    const startNode = flowNodes.find(n => 
      (n.type === 'start' || n.id === 'start' || n.data?.nodeType === 'start')
    );
    
    if (startNode) {
      const outgoingEdge = flowEdges.find(e => e.source === startNode.id);
      if (outgoingEdge) {
        const targetNode = flowNodes.find(n => n.id === outgoingEdge.target);
        if (targetNode && (targetNode.type === 'screen' || targetNode.data?.nodeType === 'screen')) {
          return targetNode;
        }
      }
    }
    
    return flowNodes.find(n => 
      n.type === 'screen' || n.data?.nodeType === 'screen'
    );
  };

  // Check if flow has screen nodes
  const flowHasScreenNodes = () => {
    return flow.nodes.some(n => n.type === 'screen' || n.data?.nodeType === 'screen');
  };

  // Get screen default values - handles multiple config locations
  const getScreenDefaultValues = (screenNode) => {
    // Check both node.config and node.data.config, preferring the one with actual fields
    const rootConfig = screenNode?.config || {};
    const dataConfig = screenNode?.data?.config || {};
    
    // Merge configs - prefer dataConfig if it has fields
    const rootFields = rootConfig.fields || rootConfig.components || [];
    const dataFields = dataConfig.fields || dataConfig.components || [];
    
    const screenConfig = dataFields.length > rootFields.length ? dataConfig : 
                        (rootFields.length > 0 ? rootConfig : dataConfig);
    const screenFields = screenConfig.fields || screenConfig.components || [];
    
    const defaults = {};
    
    screenFields.forEach(field => {
      const fieldName = field.name || field.apiName;
      if (fieldName && field.defaultValue !== undefined) {
        defaults[fieldName] = field.defaultValue;
      }
    });
    
    return defaults;
  };
  
  // Get screen fields - handles multiple config locations (for bulk mode validation)
  const getScreenFields = (screenNode) => {
    const rootConfig = screenNode?.config || {};
    const dataConfig = screenNode?.data?.config || {};
    
    const rootFields = rootConfig.fields || rootConfig.components || [];
    const dataFields = dataConfig.fields || dataConfig.components || [];
    
    // Return the fields array that has more content
    return dataFields.length > rootFields.length ? dataFields : rootFields;
  };

  // =============================================
  // CONTEXT CONFIRMATION
  // =============================================
  
  const confirmContextSelection = () => {
    if (launchMode === 'record_detail' && !selectedRecordId) {
      addLog('error', '❌ Please select a record to continue');
      return;
    }
    
    if (launchMode === 'list_view' && selectedRecordIds.length === 0) {
      addLog('error', '❌ Please select at least one record to continue');
      return;
    }
    
    if (launchMode === 'record_detail') {
      addLog('success', `✅ Preview context set: recordId = ${selectedRecordId}`);
      setContextReady(true);
      setPreviewState('starting');
    } else if (launchMode === 'list_view') {
      addLog('success', `✅ Preview context set: ${selectedRecordIds.length} record(s) selected for bulk execution`);
      addLog('info', `📌 Context variable: recordIds = [${selectedRecordIds.length} items]`);
      addLog('info', `📌 Context variable: selectedCount = ${selectedRecordIds.length}`);
      
      // Check for screen nodes warning
      if (flowHasScreenNodes()) {
        addLog('warning', '⚠️ Flow contains Screen elements. List View bulk preview will use default values for required inputs.');
      }
      
      setContextReady(true);
      // For list_view, go directly to bulk execution
      setPreviewState('bulk_running');
    }
  };

  // =============================================
  // RECORD DETAIL MODE - START PREVIEW
  // =============================================
  
  const startPreviewAutomatically = async () => {
    try {
      addLog('info', '▶️ Starting Screen Flow Preview', { safeMode });
      
      const firstScreenNode = findFirstScreenNode();
      
      if (!firstScreenNode) {
        addLog('error', '❌ No Screen nodes found in this flow');
        setPreviewState('error');
        return;
      }

      addLog('success', `✅ Found first screen: ${firstScreenNode.data?.label || firstScreenNode.label || 'Untitled'}`);
      
      // Debug: Log the screen node structure
      console.log('[PREVIEW] Screen node structure:', JSON.stringify({
        id: firstScreenNode.id,
        type: firstScreenNode.type,
        hasConfig: !!firstScreenNode.config,
        hasDataConfig: !!firstScreenNode.data?.config,
        configFields: firstScreenNode.config?.fields?.length,
        dataConfigFields: firstScreenNode.data?.config?.fields?.length,
      }));
      
      // Screen fields can be in multiple locations depending on how the flow was saved:
      // 1. node.data.config.fields (most common)
      // 2. node.config.fields (alternative structure)
      // 3. node.data.config.components (alternative naming)
      const screenConfig = firstScreenNode.data?.config || firstScreenNode.config || {};
      const screenFields = screenConfig.fields || screenConfig.components || 
                          firstScreenNode.data?.fields || firstScreenNode.fields || [];
      
      console.log('[PREVIEW] Screen fields extracted:', screenFields.length, screenFields);
      
      addLog('info', `📋 Loaded ${screenFields.length} field(s) from screen configuration`);
      if (screenFields.length > 0) {
        addLog('info', `   Fields: ${screenFields.map(f => f.label || f.name || f.apiName).join(', ')}`);
      } else {
        // If no fields found, log the full structure for debugging
        addLog('warning', '⚠️ No fields found in screen configuration');
        console.log('[PREVIEW] Full screen node:', firstScreenNode);
      }
      
      // Initialize context with record context variables
      const context = {
        ...initialContext,
        variables: {},
        node_outputs: {},
        recordId: selectedRecordId || undefined,
        recordIds: selectedRecordIds.length > 0 ? selectedRecordIds : undefined,
        selectedCount: launchMode === 'list_view' ? selectedRecordIds.length : undefined,
        record: selectedRecordData || undefined,
        selectedRecords: selectedRecordsData.length > 0 ? selectedRecordsData : undefined
      };
      
      // Log context variables for record_detail mode
      if (launchMode === 'record_detail' && selectedRecordId) {
        addLog('info', `📌 Context variable: recordId = ${selectedRecordId}`);
        addLog('info', `📌 Context variable: record = {...} (${Object.keys(selectedRecordData || {}).length} fields)`);
      }
      
      // Apply record prefill for record_detail mode
      let initialScreenData = {};
      if (launchMode === 'record_detail' && selectedRecordData) {
        initialScreenData = applyRecordPrefill(screenFields, selectedRecordData);
        setScreenData(initialScreenData);
        setPrefillApplied(true);
      }
      
      const navigationButtons = screenConfig.navigationButtons || screenConfig.navigation || {};
      
      setCurrentScreen({
        id: firstScreenNode.id,
        label: firstScreenNode.data?.label || 'Screen',
        description: screenConfig.description || '',
        components: screenFields,
        navigationButtons: navigationButtons,
        layout: screenConfig.layout,
        theme: screenConfig.theme, // Include theme for preview styling
        nodeRef: firstScreenNode
      });
      
      lastProcessedNodeRef.current = firstScreenNode.id;
      setExecutionContext(context);
      setPreviewState('running');
      setScreenHistory([{
        screen_config: {
          id: firstScreenNode.id,
          label: firstScreenNode.data?.label || 'Screen',
          components: screenFields,
          navigationButtons: navigationButtons,
          layout: screenConfig.layout,
          theme: screenConfig.theme // Include theme for preview styling
        },
        screen_data: initialScreenData
      }]);
      
      addLog('info', '📱 Screen loaded - ready for input');

    } catch (error) {
      console.error('Preview start error:', error);
      addLog('error', `❌ Failed to start preview: ${error.message}`);
      setPreviewState('error');
    }
  };

  // =============================================
  // LIST VIEW MODE - BULK EXECUTION
  // =============================================
  
  const startBulkExecution = useCallback(async () => {
    const records = selectedRecordsData;
    const totalRecords = records.length;
    
    // Capture stopOnError at the start - it won't change during execution
    const shouldStopOnError = bulkExecutionState.stopOnError;
    
    addLog('info', '═══════════════════════════════════════════════════');
    addLog('info', `🚀 BULK PREVIEW EXECUTION STARTED`);
    addLog('info', `📊 Total Records: ${totalRecords}`);
    addLog('info', `🛡️ Safe Mode: ${safeMode ? 'ON (No DB Writes)' : 'OFF (Real Execution)'}`);
    addLog('info', `⏹️ Stop on Error: ${shouldStopOnError ? 'ON' : 'OFF'}`);
    addLog('info', '═══════════════════════════════════════════════════');
    
    setBulkExecutionState(prev => ({
      ...prev,
      isRunning: true,
      currentIndex: 0,
      totalRecords,
      results: [],
      shouldStop: false
    }));
    
    const results = [];
    let wasStopped = false;
    
    for (let i = 0; i < records.length; i++) {
      // Check if should stop (user clicked Stop button) - read from ref-like pattern
      // Note: We can't read state directly in async loop, so we use a local flag
      // The Stop button sets shouldStop which will be checked via the next render
      
      const record = records[i];
      const recordName = record.name || record.first_name || record.email || record.id;
      
      addLog('info', '');
      addLog('info', `[Record ${i + 1}/${totalRecords}] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      addLog('info', `[Record ${i + 1}/${totalRecords}] Id=${record.id} Started`);
      addLog('info', `[Record ${i + 1}/${totalRecords}] Name: ${recordName}`);
      
      setBulkExecutionState(prev => {
        // Check if Stop was clicked
        if (prev.shouldStop) {
          wasStopped = true;
        }
        return {
          ...prev,
          currentIndex: i + 1
        };
      });
      
      // Check stop flag
      if (wasStopped) {
        addLog('warning', `⏹️ Bulk execution stopped by user at record ${i + 1}/${totalRecords}`);
        break;
      }
      
      // Execute flow for this record
      const result = await executeFlowForRecord(record, i + 1, totalRecords);
      results.push(result);
      
      // Update results in state
      setBulkExecutionState(prev => ({
        ...prev,
        results: [...results]
      }));
      
      // Check stopOnError (using captured value)
      if (result.status === 'failed' && shouldStopOnError) {
        addLog('error', `[Record ${i + 1}/${totalRecords}] 🛑 Stop on error triggered. Halting bulk execution.`);
        break;
      }
      
      // Small delay between records for visibility
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    
    // Summary
    const successCount = results.filter(r => r.status === 'success').length;
    const failedCount = results.filter(r => r.status === 'failed').length;
    
    addLog('info', '');
    addLog('info', '═══════════════════════════════════════════════════');
    addLog('info', `🏁 BULK PREVIEW EXECUTION COMPLETE`);
    addLog('success', `   ✅ Success: ${successCount}`);
    if (failedCount > 0) {
      addLog('error', `   ❌ Failed: ${failedCount}`);
    }
    addLog('info', `   📊 Total: ${results.length}/${totalRecords}`);
    addLog('info', '═══════════════════════════════════════════════════');
    
    setBulkExecutionState(prev => ({
      ...prev,
      isRunning: false,
      results
    }));
    
    setPreviewState('completed');
  }, [selectedRecordsData, safeMode, bulkExecutionState.stopOnError, bulkExecutionState.shouldStop, addLog]);

  // Execute flow for a single record (in bulk mode)
  const executeFlowForRecord = async (record, currentNum, totalNum) => {
    const prefix = `[Record ${currentNum}/${totalNum}]`;
    const recordLogs = [];
    const actions = [];
    
    const logForRecord = (type, message) => {
      const fullMessage = `${prefix} ${message}`;
      addLog(type, fullMessage);
      recordLogs.push({ type, message });
    };
    
    try {
      // Set up context for this record
      const recordContext = {
        recordId: record.id,
        record: record,
        variables: {},
        node_outputs: {}
      };
      
      logForRecord('info', `Context: recordId=${record.id}`);
      
      // Find start node and traverse the flow
      const { nodes: flowNodes, edges: flowEdges } = flow;
      
      // For screen flows, we may not have a traditional "start" node
      // Try to find start node, or fall back to first screen node
      let startNode = flowNodes.find(n => 
        n.type === 'start' || n.id === 'start' || n.data?.nodeType === 'start'
      );
      
      // If no start node, find the first screen node (screen flows start with a screen)
      if (!startNode) {
        startNode = flowNodes.find(n => 
          n.type === 'screen' || n.data?.nodeType === 'screen'
        );
        if (startNode) {
          logForRecord('info', `Starting from screen node: ${startNode.data?.label || startNode.id}`);
        }
      }
      
      if (!startNode) {
        logForRecord('error', 'No start or screen node found');
        return { recordId: record.id, recordName: record.name || record.id, status: 'failed', logs: recordLogs, actions, errorMessage: 'No start node' };
      }
      
      let currentNodeId = startNode.id;
      let currentNode = startNode;
      let iterationCount = 0;
      const maxIterations = 100;
      
      // For screen flows, process the starting screen node first
      if (startNode.type === 'screen' || startNode.data?.nodeType === 'screen') {
        const nodeType = 'screen';
        const nodeLabel = startNode.data?.label || startNode.label || 'Screen';
        
        // In bulk mode, screens are auto-passed with defaults
        const screenFields = getScreenFields(startNode);
        const defaults = getScreenDefaultValues(startNode);
        
        // Check for required fields without defaults
        const missingRequired = screenFields.filter(f => f.required && !defaults[f.name || f.apiName]);
        
        if (missingRequired.length > 0) {
          const fieldNames = missingRequired.map(f => f.label || f.name).join(', ');
          logForRecord('error', `Screen "${nodeLabel}" has required fields without defaults: ${fieldNames}`);
          return { 
            recordId: record.id, 
            recordName: record.name || record.id, 
            status: 'failed', 
            logs: recordLogs, 
            actions, 
            errorMessage: `Missing required screen inputs: ${fieldNames}` 
          };
        }
        
        // Apply defaults to context
        Object.keys(defaults).forEach(key => {
          recordContext[`Screen.${key}`] = defaults[key];
          recordContext.variables[`Screen.${key}`] = defaults[key];
        });
        
        logForRecord('info', `Screen: "${nodeLabel}" (auto-passed with ${screenFields.length} fields)`);
      }
      
      while (iterationCount < maxIterations) {
        iterationCount++;
        
        // Find outgoing edge
        const outgoingEdge = flowEdges.find(e => e.source === currentNodeId);
        if (!outgoingEdge) {
          logForRecord('success', 'Completed ✅');
          break;
        }
        
        const nextNode = flowNodes.find(n => n.id === outgoingEdge.target);
        if (!nextNode) {
          logForRecord('error', `Node not found: ${outgoingEdge.target}`);
          return { recordId: record.id, recordName: record.name || record.id, status: 'failed', logs: recordLogs, actions, errorMessage: 'Node not found' };
        }
        
        const nodeType = nextNode.data?.nodeType || nextNode.type;
        const nodeLabel = nextNode.data?.label || nextNode.label || nodeType;
        
        // Skip UI nodes
        if (['addButton', 'addAction', 'addError'].includes(nodeType)) {
          currentNodeId = nextNode.id;
          continue;
        }
        
        // Handle different node types
        if (nodeType === 'end') {
          logForRecord('success', 'Completed ✅');
          break;
        }
        
        if (nodeType === 'screen') {
          // In bulk mode, screens are auto-passed with defaults
          const screenFields = getScreenFields(nextNode);
          const defaults = getScreenDefaultValues(nextNode);
          
          // Check for required fields without defaults
          const missingRequired = screenFields.filter(f => f.required && !defaults[f.name || f.apiName]);
          
          if (missingRequired.length > 0) {
            const fieldNames = missingRequired.map(f => f.label || f.name).join(', ');
            logForRecord('error', `Screen "${nodeLabel}" has required fields without defaults: ${fieldNames}`);
            return { 
              recordId: record.id, 
              recordName: record.name || record.id, 
              status: 'failed', 
              logs: recordLogs, 
              actions, 
              errorMessage: `Missing required screen inputs: ${fieldNames}` 
            };
          }
          
          // Apply defaults to context
          Object.keys(defaults).forEach(key => {
            recordContext[`Screen.${key}`] = defaults[key];
            recordContext.variables[`Screen.${key}`] = defaults[key];
          });
          
          logForRecord('info', `Screen: "${nodeLabel}" (auto-passed with ${screenFields.length} fields)`);
          currentNodeId = nextNode.id;
          continue;
        }
        
        if (nodeType === 'decision') {
          logForRecord('info', `Decision: "${nodeLabel}" → Default outcome`);
          currentNodeId = nextNode.id;
          continue;
        }
        
        if (nodeType === 'assignment') {
          const assignments = nextNode.data?.config?.assignments || [];
          assignments.forEach(a => {
            logForRecord('info', `Assignment: ${a.variable} = ${a.value}`);
          });
          currentNodeId = nextNode.id;
          continue;
        }
        
        // Handle action nodes (create_record, update_record, etc.)
        const actualNodeType = inferNodeType(nextNode);
        
        if (['create_record', 'update_record', 'delete_record', 'get_records', 'mcp_create_record', 'mcp_update_record', 'mcp_delete_record', 'mcp_get_records'].includes(actualNodeType)) {
          const config = nextNode.config || nextNode.data?.config || {};
          const objectName = config.object || config.entity || config.objectName || 'Record';
          const baseType = actualNodeType.replace('mcp_', '');
          
          if (safeMode) {
            if (baseType === 'create_record') {
              const mockId = `mock_${objectName}_${Date.now()}`;
              logForRecord('success', `Action: Create ${objectName} ✅ SIMULATED (recordId=${mockId})`);
              actions.push({ type: 'create', object: objectName, mockId });
            } else if (baseType === 'update_record') {
              logForRecord('success', `Action: Update ${objectName} ✅ SIMULATED`);
              actions.push({ type: 'update', object: objectName });
            } else if (baseType === 'delete_record') {
              logForRecord('success', `Action: Delete ${objectName} ✅ SIMULATED`);
              actions.push({ type: 'delete', object: objectName });
            } else if (baseType === 'get_records') {
              logForRecord('success', `Action: Get ${objectName} ✅ SIMULATED (1 record)`);
              actions.push({ type: 'get', object: objectName });
            }
          } else {
            // Real execution would happen here
            logForRecord('warning', `Action: ${baseType} ${objectName} (REAL - would write to DB)`);
            actions.push({ type: baseType, object: objectName, real: true });
          }
          
          currentNodeId = nextNode.id;
          continue;
        }
        
        // Unknown node type
        logForRecord('warning', `Unknown node type: ${nodeType} - skipping`);
        currentNodeId = nextNode.id;
      }
      
      if (iterationCount >= maxIterations) {
        logForRecord('error', 'Max iterations reached - possible infinite loop');
        return { recordId: record.id, recordName: record.name || record.id, status: 'failed', logs: recordLogs, actions, errorMessage: 'Max iterations' };
      }
      
      return { recordId: record.id, recordName: record.name || record.id, status: 'success', logs: recordLogs, actions };
      
    } catch (error) {
      logForRecord('error', `Error: ${error.message}`);
      return { recordId: record.id, recordName: record.name || record.id, status: 'failed', logs: recordLogs, actions, errorMessage: error.message };
    }
  };

  // Infer actual node type from node data
  const inferNodeType = (node) => {
    let actualNodeType = node.data?.nodeType || node.type;
    
    if (!actualNodeType || actualNodeType === 'default' || actualNodeType === 'mcp') {
      const config = node.config || node.data?.config || {};
      
      if (actualNodeType === 'mcp') {
        const operation = config.operation || config.action || config.action_type || config.mcp_action;
        const hasObjectConfig = config.object || config.entity || config.objectName || config.objectApiName;
        
        if (operation === 'create_record' || operation === 'create' || (hasObjectConfig && !operation)) {
          return 'mcp_create_record';
        } else if (operation === 'update_record' || operation === 'update') {
          return 'mcp_update_record';
        } else if (operation === 'delete_record' || operation === 'delete') {
          return 'mcp_delete_record';
        } else if (operation === 'get_records' || operation === 'get' || operation === 'query') {
          return 'mcp_get_records';
        } else if (hasObjectConfig) {
          const label = (node.label || node.data?.label || '').toLowerCase();
          if (label.includes('create')) return 'mcp_create_record';
          if (label.includes('update')) return 'mcp_update_record';
          return 'mcp_create_record';
        }
      }
      
      if (config.action_type || config.mcp_action) {
        const actionType = config.action_type || config.mcp_action;
        if (actionType === 'create' || actionType === 'create_record') return 'create_record';
        if (actionType === 'update' || actionType === 'update_record') return 'update_record';
        if (actionType === 'delete' || actionType === 'delete_record') return 'delete_record';
        if (actionType === 'get' || actionType === 'query' || actionType === 'get_records') return 'get_records';
      }
      
      if (config.object || config.entity || config.objectName || config.objectApiName) {
        const label = (node.label || node.data?.label || '').toLowerCase();
        if (label.includes('create')) return 'create_record';
        if (label.includes('update')) return 'update_record';
        if (label.includes('delete')) return 'delete_record';
        if (label.includes('get') || label.includes('query')) return 'get_records';
        return 'create_record';
      }
      
      if (config.assignments) return 'assignment';
      if (config.outcomes) return 'decision';
      if (config.components || config.fields) return 'screen';
    }
    
    return actualNodeType;
  };

  // Stop bulk execution
  const stopBulkExecution = () => {
    setBulkExecutionState(prev => ({
      ...prev,
      shouldStop: true
    }));
    addLog('warning', '⏹️ Stop requested - will halt after current record completes');
  };

  // =============================================
  // LOAD NEXT NODE (for record_detail interactive mode)
  // =============================================
  
  const loadNextNode = async () => {
    try {
      setIsProcessing(true);
      
      const { nodes: flowNodes, edges: flowEdges } = flow;
      const currentNodeId = lastProcessedNodeRef.current || currentScreen?.id;
      
      if (!currentNodeId) {
        addLog('error', '❌ No current node to navigate from');
        setPreviewState('error');
        return;
      }

      let searchNodeId = currentNodeId;
      let nextNode = null;
      let attempts = 0;
      const maxAttempts = 20;
      
      while (attempts < maxAttempts) {
        const outgoingEdge = flowEdges.find(e => e.source === searchNodeId);
        
        if (!outgoingEdge) {
          setPreviewState('completed');
          setCurrentScreen(null);
          addLog('success', '🏁 Flow completed successfully');
          return;
        }

        nextNode = flowNodes.find(n => n.id === outgoingEdge.target);
        
        if (!nextNode) {
          addLog('error', `❌ Next node not found: ${outgoingEdge.target}`);
          setPreviewState('error');
          return;
        }

        const nodeType = nextNode.type || nextNode.data?.nodeType;
        
        if (['addButton', 'addAction', 'addError'].includes(nodeType)) {
          searchNodeId = nextNode.id;
          attempts++;
          continue;
        }
        
        break;
      }
      
      if (attempts >= maxAttempts) {
        addLog('error', '❌ Too many UI nodes in sequence');
        setPreviewState('error');
        return;
      }

      const actualNodeType = inferNodeType(nextNode);
      
      if (onNodeHighlight) {
        onNodeHighlight(nextNode.id);
      }
      
      lastProcessedNodeRef.current = nextNode.id;

      // Handle different node types
      if (actualNodeType === 'screen') {
        const screenConfig = nextNode.data?.config || {};
        const screenFields = screenConfig.fields || screenConfig.components || [];
        const navigationButtons = screenConfig.navigationButtons || screenConfig.navigation || {};
        
        // Apply prefill for record_detail mode on subsequent screens
        let nextScreenData = {};
        if (launchMode === 'record_detail' && selectedRecordData) {
          nextScreenData = applyRecordPrefill(screenFields, selectedRecordData);
        }
        
        const nextScreenConfig = {
          id: nextNode.id,
          label: nextNode.data?.label || 'Screen',
          description: screenConfig.description || '',
          components: screenFields,
          navigationButtons: navigationButtons,
          layout: screenConfig.layout,
          theme: screenConfig.theme, // Include theme for preview styling
          nodeRef: nextNode
        };
        
        setCurrentScreen(nextScreenConfig);
        setScreenData(nextScreenData);
        addLog('info', `📱 Screen: ${nextScreenConfig.label}`);
        
        setScreenHistory(prev => [...prev, {
          screen_config: nextScreenConfig,
          screen_data: nextScreenData
        }]);
        
      } else if (actualNodeType === 'end') {
        setPreviewState('completed');
        setCurrentScreen(null);
        addLog('success', '🏁 Flow completed successfully');
        
      } else if (actualNodeType === 'decision') {
        addLog('info', `⚙️ Decision: ${nextNode.data?.label || 'Untitled'}`);
        const outcomes = nextNode.data?.config?.outcomes || [];
        const defaultOutcome = outcomes.find(o => o.isDefault);
        if (defaultOutcome) {
          addLog('info', `   → Outcome: ${defaultOutcome.label || 'Default'}`);
        }
        setTimeout(() => loadNextNode(), 500);
        return;
        
      } else if (['create_record', 'update_record', 'delete_record', 'get_records', 'mcp_create_record', 'mcp_update_record', 'mcp_delete_record', 'mcp_get_records', 'mcp', 'crm_action'].includes(actualNodeType)) {
        setCurrentScreen(null);
        
        const config = nextNode.config || nextNode.data?.config || {};
        const objectName = config.object || config.entity || config.objectName || config.objectApiName || 'Record';
        const baseType = actualNodeType.replace('mcp_', '').replace('crm_', '');
        
        // For generic 'mcp' type, get action type from config
        let actionLabel = nextNode.label || nextNode.data?.label || actualNodeType;
        let actionType = baseType;
        
        if (actualNodeType === 'mcp' || actualNodeType === 'crm_action') {
          const mcpAction = config.mcp_action || config.action_type || 'record_operation';
          actionType = mcpAction.replace('crm.', '').replace('.', '_');
          actionLabel = nextNode.data?.label || mcpAction;
        }
        
        addLog('info', `⚙️ Executing ${actionType}: ${actionLabel}`);
        addLog('info', `   Object: ${objectName}`);
        
        if (safeMode) {
          addLog('warning', '   Mode: SIMULATED (No DB Write)');
          
          if (baseType === 'create_record') {
            const mockId = `mock_${objectName}_${Date.now()}`;
            setExecutionContext(prev => ({
              ...prev,
              [`${nextNode.id}_recordId`]: mockId,
              [`${nextNode.id}_success`]: true
            }));
            addLog('success', `   ✅ Create ${objectName} simulated successfully`);
            addLog('info', `   recordId=${mockId}`);
          } else {
            setExecutionContext(prev => ({
              ...prev,
              [`${nextNode.id}_success`]: true
            }));
            addLog('success', `   ✅ ${baseType} ${objectName} simulated successfully`);
          }
        } else {
          addLog('warning', '   Mode: REAL (DB Write)');
        }
        
        setTimeout(() => loadNextNode(), 1000);
        return;
        
      } else if (actualNodeType === 'assignment') {
        addLog('info', `⚙️ Assignment: ${nextNode.data?.label || 'Untitled'}`);
        const assignments = nextNode.data?.config?.assignments || [];
        assignments.forEach(assignment => {
          addLog('info', `   Set ${assignment.variable} = ${assignment.value}`);
        });
        setTimeout(() => loadNextNode(), 500);
        return;
        
      } else if (actualNodeType === 'connector' || actualNodeType === 'send_email') {
        // Handle Send Email / Connector nodes
        const config = nextNode.config || nextNode.data?.config || {};
        const connectorType = config.connector_type || config.connectorType || 'sendgrid';
        const label = nextNode.data?.label || 'Send Email';
        
        addLog('info', `📧 Send Email: ${label}`);
        addLog('info', `   Service: ${connectorType}`);
        
        if (safeMode) {
          addLog('warning', '   Mode: SIMULATED (No Email Sent)');
          addLog('success', '   ✅ Email simulated successfully');
        } else {
          addLog('info', '   Mode: REAL (Sending Email)');
        }
        
        setTimeout(() => loadNextNode(), 800);
        return;
        
      } else if (actualNodeType === 'delay') {
        // Handle Delay nodes
        const config = nextNode.config || nextNode.data?.config || {};
        const delayAmount = config.delay_amount || config.delayAmount || 1;
        const delayUnit = config.delay_unit || config.delayUnit || 'seconds';
        const label = nextNode.data?.label || 'Delay';
        
        addLog('info', `⏳ Delay: ${label}`);
        addLog('info', `   Duration: ${delayAmount} ${delayUnit}`);
        
        if (safeMode) {
          addLog('warning', '   Mode: SIMULATED (skipping delay)');
        }
        
        setTimeout(() => loadNextNode(), 500);
        return;
        
      } else if (actualNodeType === 'loop' || actualNodeType === 'for_each') {
        // Handle Loop nodes
        const config = nextNode.config || nextNode.data?.config || {};
        const collection = config.collection_variable || config.collection || 'items';
        const label = nextNode.data?.label || 'Loop';
        
        addLog('info', `🔄 Loop: ${label}`);
        addLog('info', `   Collection: ${collection}`);
        addLog('warning', '   Mode: SIMULATED (loop iterations skipped)');
        
        setTimeout(() => loadNextNode(), 500);
        return;
        
      } else {
        // Log warning but continue processing to avoid blocking the flow
        addLog('warning', `⚠️ Unhandled node type: ${actualNodeType} - proceeding to next node`);
        setTimeout(() => loadNextNode(), 500);
        return;
      }

    } catch (error) {
      console.error('Load next node error:', error);
      addLog('error', `❌ Error: ${error.message}`);
      setPreviewState('error');
    } finally {
      setIsProcessing(false);
    }
  };

  // =============================================
  // SCREEN NAVIGATION HANDLERS
  // =============================================
  
  const handleNext = async () => {
    if (flowTerminatedByToast) {
      addLog('warning', 'Cannot proceed - flow terminated by Error Toast');
      return;
    }
    
    if (!validateScreen()) {
      return;
    }

    const updatedContext = { ...executionContext };
    Object.keys(screenData).forEach(key => {
      updatedContext[`Screen.${key}`] = screenData[key];
      updatedContext.variables = updatedContext.variables || {};
      updatedContext.variables[`Screen.${key}`] = screenData[key];
    });
    setExecutionContext(updatedContext);

    addLog('info', '➡️ Next button clicked', { 
      screenData: Object.keys(screenData).map(k => `${k}=${screenData[k]}`).join(', ')
    });
    
    await loadNextNode();
  };

  const handlePrevious = () => {
    if (screenHistory.length > 1) {
      const newHistory = [...screenHistory];
      newHistory.pop();
      const previousScreen = newHistory[newHistory.length - 1];
      
      setScreenHistory(newHistory);
      setCurrentScreen(previousScreen.screen_config);
      setScreenData(previousScreen.screen_data);
      lastProcessedNodeRef.current = previousScreen.screen_config.id;
      
      addLog('info', '⬅️ Previous button clicked');
    }
  };

  const handleFinish = async () => {
    if (!validateScreen()) {
      return;
    }

    addLog('info', '✅ Finish button clicked', { screen_data: screenData });
    setPreviewState('completed');
    setCurrentScreen(null);
    addLog('success', '🏁 Flow finished by user');
  };

  // =============================================
  // VALIDATION
  // =============================================
  
  const validateScreen = () => {
    if (!currentScreen || !currentScreen.components) {
      return true;
    }

    const errors = {};
    let hasErrors = false;

    currentScreen.components.forEach(component => {
      const apiName = component.apiName || component.name || component.id;
      const value = screenData[apiName];
      
      if (component.required && !value) {
        errors[apiName] = 'This field is required';
        hasErrors = true;
      }

      const componentType = (component.type || component.componentType || '').toLowerCase();
      if (componentType === 'email' && value) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(value)) {
          errors[apiName] = 'Invalid email format';
          hasErrors = true;
        }
      }

      if ((componentType === 'phone' || componentType === 'phonenumber') && value) {
        const phoneRegex = /^[\d\s\-\+\(\)]+$/;
        if (!phoneRegex.test(value)) {
          errors[apiName] = 'Invalid phone format';
          hasErrors = true;
        }
      }
    });

    setValidationErrors(errors);
    
    if (hasErrors) {
      addLog('warning', '⚠️ Validation failed - please fix errors');
    }
    
    return !hasErrors;
  };

  // =============================================
  // RESTART
  // =============================================
  
  const handleRestart = () => {
    // For record_detail mode, keep the record selected but re-prefill
    if (launchMode === 'record_detail' && selectedRecordId) {
      setPreviewState('starting');
      setCurrentScreen(null);
      setScreenData({});
      setExecutionContext(initialContext);
      setExecutionLogs([]);
      setScreenHistory([]);
      setValidationErrors({});
      setIsProcessing(false);
      lastProcessedNodeRef.current = null;
      setActiveToasts([]);
      setFlowTerminatedByToast(false);
      setPrefillApplied(false);
      setContextReady(true);
      
      addLog('info', '🔄 Restarting preview with same record selection...');
      addLog('info', `📌 Record Detail context: recordId = ${selectedRecordId}`);
      
      setTimeout(() => {
        startPreviewAutomatically();
      }, 100);
      return;
    }
    
    // Full reset for other modes
    setPreviewState(needsContextSelection && screenFlowObject ? 'context_selection' : 'starting');
    setExecutionId(null);
    setCurrentScreen(null);
    setScreenData({});
    setExecutionContext(initialContext);
    setExecutionLogs([]);
    setScreenHistory([]);
    setValidationErrors({});
    setIsProcessing(false);
    lastProcessedNodeRef.current = null;
    setActiveToasts([]);
    setFlowTerminatedByToast(false);
    
    setContextReady(!needsContextSelection || !screenFlowObject);
    setSelectedRecordId(null);
    setSelectedRecordData(null);
    setSelectedRecordIds([]);
    setSelectedRecordsData([]);
    setPrefillApplied(false);
    setRecordSearchTerm('');
    
    setBulkExecutionState({
      isRunning: false,
      currentIndex: 0,
      totalRecords: 0,
      results: [],
      stopOnError: false,
      shouldStop: false
    });
    
    toastTimeoutsRef.current.forEach(timeout => clearTimeout(timeout));
    toastTimeoutsRef.current = [];
    
    if (onNodeHighlight) {
      onNodeHighlight(null);
    }
    
    if (needsContextSelection && screenFlowObject) {
      setTimeout(() => {
        loadRecordsForContext();
      }, 100);
    } else {
      setTimeout(() => {
        startPreviewAutomatically();
      }, 100);
    }
  };

  // =============================================
  // EFFECTS
  // =============================================
  
  // Auto-start based on mode
  useEffect(() => {
    if (previewState === 'context_selection') {
      if (needsContextSelection && screenFlowObject) {
        loadRecordsForContext();
        addLog('info', `📋 Preview Context Required: ${launchMode === 'record_detail' ? 'Select a record' : 'Select record(s)'}`);
        addLog('info', `📦 Object: ${screenFlowObject}`);
      } else if (!needsContextSelection) {
        setContextReady(true);
        setPreviewState('starting');
      } else {
        addLog('warning', '⚠️ No object configured for record context');
        setContextReady(true);
        setPreviewState('starting');
      }
    }
  }, []);

  // Start preview when context is ready (record_detail mode)
  useEffect(() => {
    if (previewState === 'starting' && contextReady) {
      startPreviewAutomatically();
    }
  }, [previewState, contextReady]);

  // Start bulk execution (list_view mode)
  useEffect(() => {
    if (previewState === 'bulk_running' && contextReady && !bulkExecutionState.isRunning && selectedRecordsData.length > 0) {
      startBulkExecution();
    }
  }, [previewState, contextReady, bulkExecutionState.isRunning, selectedRecordsData.length]);

  // Search records with debounce
  useEffect(() => {
    if (previewState === 'context_selection' && needsContextSelection && screenFlowObject) {
      const debounceTimer = setTimeout(() => {
        loadRecordsForContext();
      }, 300);
      return () => clearTimeout(debounceTimer);
    }
  }, [recordSearchTerm]);

  // =============================================
  // RENDER SCREEN COMPONENT
  // =============================================
  
  const renderScreenComponent = (component) => {
    const componentType = component.type || component.componentType || component.fieldType || '';
    const apiName = component.apiName || component.name || component.id || '';
    const value = screenData[apiName] || component.defaultValue || '';
    const error = validationErrors[apiName];

    const handleChange = (newValue) => {
      setScreenData(prev => ({
        ...prev,
        [apiName]: newValue
      }));
      if (error) {
        setValidationErrors(prev => {
          const newErrors = { ...prev };
          delete newErrors[apiName];
          return newErrors;
        });
      }
    };

    const commonProps = {
      className: error ? 'border-red-500' : ''
    };

    const normalizedType = componentType.toLowerCase().replace(/[-_\s]/g, '');

    switch (normalizedType) {
      case 'text':
      case 'textinput':
      case 'shorttext':
        return (
          <div key={apiName} className="space-y-2">
            <Label className="text-sm font-medium text-gray-700">
              {component.label}
              {component.required && <span className="text-red-500 ml-1">*</span>}
            </Label>
            <Input
              type="text"
              value={value}
              onChange={(e) => handleChange(e.target.value)}
              placeholder={component.placeholder}
              {...commonProps}
            />
            {component.helpText && <p className="text-xs text-gray-500">{component.helpText}</p>}
            {error && (
              <p className="text-xs text-red-600 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />{error}
              </p>
            )}
          </div>
        );

      case 'email':
        return (
          <div key={apiName} className="space-y-2">
            <Label className="text-sm font-medium text-gray-700">
              {component.label}
              {component.required && <span className="text-red-500 ml-1">*</span>}
            </Label>
            <Input
              type="email"
              value={value}
              onChange={(e) => handleChange(e.target.value)}
              placeholder={component.placeholder}
              {...commonProps}
            />
            {component.helpText && <p className="text-xs text-gray-500">{component.helpText}</p>}
            {error && (
              <p className="text-xs text-red-600 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />{error}
              </p>
            )}
          </div>
        );

      case 'phone':
      case 'phonenumber':
        return (
          <div key={apiName} className="space-y-2">
            <Label className="text-sm font-medium text-gray-700">
              {component.label}
              {component.required && <span className="text-red-500 ml-1">*</span>}
            </Label>
            <Input
              type="tel"
              value={value}
              onChange={(e) => handleChange(e.target.value)}
              placeholder={component.placeholder}
              {...commonProps}
            />
            {component.helpText && <p className="text-xs text-gray-500">{component.helpText}</p>}
            {error && (
              <p className="text-xs text-red-600 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />{error}
              </p>
            )}
          </div>
        );

      case 'number':
      case 'numberinput':
        return (
          <div key={apiName} className="space-y-2">
            <Label className="text-sm font-medium text-gray-700">
              {component.label}
              {component.required && <span className="text-red-500 ml-1">*</span>}
            </Label>
            <Input
              type="number"
              value={value}
              onChange={(e) => handleChange(e.target.value)}
              placeholder={component.placeholder}
              {...commonProps}
            />
            {component.helpText && <p className="text-xs text-gray-500">{component.helpText}</p>}
            {error && (
              <p className="text-xs text-red-600 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />{error}
              </p>
            )}
          </div>
        );

      case 'date':
      case 'datepicker':
        return (
          <div key={apiName} className="space-y-2">
            <Label className="text-sm font-medium text-gray-700">
              {component.label}
              {component.required && <span className="text-red-500 ml-1">*</span>}
            </Label>
            <Input
              type="date"
              value={value}
              onChange={(e) => handleChange(e.target.value)}
              {...commonProps}
            />
            {component.helpText && <p className="text-xs text-gray-500">{component.helpText}</p>}
            {error && (
              <p className="text-xs text-red-600 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />{error}
              </p>
            )}
          </div>
        );

      case 'textarea':
      case 'longtext':
        return (
          <div key={apiName} className="space-y-2">
            <Label className="text-sm font-medium text-gray-700">
              {component.label}
              {component.required && <span className="text-red-500 ml-1">*</span>}
            </Label>
            <Textarea
              value={value}
              onChange={(e) => handleChange(e.target.value)}
              placeholder={component.placeholder}
              rows={component.rows || 4}
              {...commonProps}
            />
            {component.helpText && <p className="text-xs text-gray-500">{component.helpText}</p>}
            {error && (
              <p className="text-xs text-red-600 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />{error}
              </p>
            )}
          </div>
        );

      case 'picklist':
      case 'dropdown':
      case 'select':
        return (
          <div key={apiName} className="space-y-2">
            <Label className="text-sm font-medium text-gray-700">
              {component.label}
              {component.required && <span className="text-red-500 ml-1">*</span>}
            </Label>
            <Select value={value} onValueChange={handleChange}>
              <SelectTrigger {...commonProps}>
                <SelectValue placeholder="Select an option" />
              </SelectTrigger>
              <SelectContent>
                {(component.options || []).map(option => (
                  <SelectItem key={option} value={option}>{option}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {component.helpText && <p className="text-xs text-gray-500">{component.helpText}</p>}
            {error && (
              <p className="text-xs text-red-600 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />{error}
              </p>
            )}
          </div>
        );

      case 'checkbox':
      case 'checkboxinput':
        return (
          <div key={apiName} className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={value === true || value === 'true'}
                onChange={(e) => handleChange(e.target.checked)}
                className="w-4 h-4 text-indigo-600 rounded"
              />
              <span className="text-sm text-gray-700">{component.label}</span>
              {component.required && <span className="text-red-500">*</span>}
            </label>
            {component.helpText && <p className="text-xs text-gray-500 ml-6">{component.helpText}</p>}
          </div>
        );

      case 'displaytext':
      case 'display_text':
        return (
          <div key={apiName} className="space-y-2">
            {component.label && <Label className="text-sm font-medium text-gray-700">{component.label}</Label>}
            <p className="text-sm text-gray-600">{component.text || component.value}</p>
          </div>
        );

      case 'toast':
        return null;

      default:
        return (
          <div key={apiName} className="text-sm text-gray-500 p-2 bg-yellow-50 border border-yellow-200 rounded">
            Unsupported component type: {componentType} ({component.label})
          </div>
        );
    }
  };

  // =============================================
  // RENDER
  // =============================================
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex items-center gap-3">
            <Play className="h-5 w-5 text-indigo-600" />
            <h2 className="text-xl font-semibold text-gray-900">Screen Flow Preview</h2>
            {safeMode && (
              <span className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded font-medium">
                Safe Mode
              </span>
            )}
            {launchMode === 'list_view' && (
              <span className="text-xs px-2 py-1 bg-purple-100 text-purple-700 rounded font-medium">
                Bulk Execution
              </span>
            )}
          </div>
          <Button onClick={onClose} variant="ghost" size="sm">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left: Screen/Execution View */}
          <div className="flex-1 overflow-y-auto p-6">
            
            {/* CONTEXT SELECTION STATE */}
            {previewState === 'context_selection' && needsContextSelection && (
              <div className="max-w-2xl mx-auto">
                {/* Context Header */}
                <div className="mb-6 p-4 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-lg border border-indigo-100">
                  <div className="flex items-center gap-3 mb-2">
                    {launchMode === 'record_detail' ? (
                      <User className="h-6 w-6 text-indigo-600" />
                    ) : (
                      <Users className="h-6 w-6 text-purple-600" />
                    )}
                    <h3 className="text-lg font-semibold text-gray-900">
                      Preview Context: {launchMode === 'record_detail' ? 'Record Detail' : 'List View'} Mode
                    </h3>
                  </div>
                  <p className="text-sm text-gray-600">
                    {launchMode === 'record_detail' 
                      ? 'Select a record to simulate running the flow from a record detail page. The record\'s fields will be used to auto-fill matching screen inputs.'
                      : 'Select one or more records to run the flow automatically for EACH record. This simulates bulk execution from a list view.'
                    }
                  </p>
                </div>

                {/* Object Info */}
                <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-center gap-2 text-sm">
                    <Database className="h-4 w-4 text-blue-600" />
                    <span className="font-medium text-blue-800">Object:</span>
                    <span className="text-blue-700">{screenFlowObject}</span>
                  </div>
                </div>

                {/* List View Options */}
                {launchMode === 'list_view' && (
                  <div className="mb-4 p-3 bg-gray-50 border rounded-lg">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={bulkExecutionState.stopOnError}
                          onCheckedChange={(checked) => 
                            setBulkExecutionState(prev => ({ ...prev, stopOnError: checked }))
                          }
                        />
                        <Label className="text-sm">Stop on first error</Label>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={handleSelectAll}>
                          Select All
                        </Button>
                        <Button variant="outline" size="sm" onClick={handleClearSelection}>
                          Clear
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Search Input */}
                <div className="mb-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      type="text"
                      placeholder={`Search ${screenFlowObject} records...`}
                      value={recordSearchTerm}
                      onChange={(e) => setRecordSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>

                {/* Records List */}
                <div className="border rounded-lg overflow-hidden mb-6">
                  <div className="bg-gray-50 px-4 py-2 border-b">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-700">
                        {launchMode === 'record_detail' ? 'Select a Record' : 'Select Record(s)'}
                      </span>
                      {launchMode === 'list_view' && selectedRecordIds.length > 0 && (
                        <span className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded font-medium">
                          {selectedRecordIds.length} selected
                        </span>
                      )}
                    </div>
                  </div>

                  {recordsLoading ? (
                    <div className="p-8 text-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto mb-3"></div>
                      <p className="text-sm text-gray-500">Loading records...</p>
                    </div>
                  ) : availableRecords.length === 0 ? (
                    <div className="p-8 text-center">
                      <Database className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                      <p className="text-sm text-gray-500">No records found</p>
                    </div>
                  ) : (
                    <div className="max-h-64 overflow-y-auto divide-y">
                      {availableRecords.map((record) => {
                        const displayName = record.name || record.first_name || record.title || record.email || record.id;
                        const secondaryInfo = record.email || record.company || record.status || '';
                        const isSelected = launchMode === 'record_detail' 
                          ? selectedRecordId === record.id
                          : selectedRecordIds.includes(record.id);

                        return (
                          <div
                            key={record.id}
                            onClick={() => launchMode === 'record_detail' 
                              ? handleRecordSelect(record.id)
                              : handleRecordToggle(record.id)
                            }
                            className={`
                              px-4 py-3 flex items-center gap-3 cursor-pointer transition-colors
                              ${isSelected 
                                ? 'bg-indigo-50 border-l-4 border-l-indigo-500' 
                                : 'hover:bg-gray-50 border-l-4 border-l-transparent'}
                            `}
                          >
                            <div className={`
                              w-5 h-5 rounded-${launchMode === 'list_view' ? 'md' : 'full'} border-2 flex items-center justify-center
                              ${isSelected 
                                ? 'bg-indigo-500 border-indigo-500' 
                                : 'border-gray-300'}
                            `}>
                              {isSelected && <Check className="h-3 w-3 text-white" />}
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-sm text-gray-900 truncate">
                                {displayName}
                              </div>
                              {secondaryInfo && (
                                <div className="text-xs text-gray-500 truncate">
                                  {secondaryInfo}
                                </div>
                              )}
                            </div>

                            <div className="text-xs text-gray-400 font-mono">
                              {record.id.slice(0, 8)}...
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Selection Summary */}
                {launchMode === 'list_view' && selectedRecordIds.length > 0 && (
                  <div className="mb-4 p-3 bg-purple-50 border border-purple-200 rounded-lg">
                    <p className="text-sm text-purple-800">
                      <span className="font-medium">{selectedRecordIds.length}</span> record(s) selected for bulk execution.
                      Flow will run automatically for each record.
                    </p>
                  </div>
                )}

                {/* Start Preview Button */}
                <div className="flex justify-end gap-3">
                  <Button variant="outline" onClick={onClose}>
                    Cancel
                  </Button>
                  <Button 
                    onClick={confirmContextSelection}
                    disabled={
                      (launchMode === 'record_detail' && !selectedRecordId) ||
                      (launchMode === 'list_view' && selectedRecordIds.length === 0)
                    }
                    className="bg-indigo-600 hover:bg-indigo-700"
                  >
                    <Play className="h-4 w-4 mr-2" />
                    {launchMode === 'list_view' ? 'Run Bulk Preview' : 'Start Preview'}
                  </Button>
                </div>
              </div>
            )}

            {/* STARTING STATE */}
            {previewState === 'starting' && (
              <div className="h-full flex items-center justify-center">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
                  <p className="text-sm text-gray-600">Loading preview...</p>
                </div>
              </div>
            )}

            {/* BULK RUNNING STATE (List View Mode) */}
            {previewState === 'bulk_running' && (
              <div className="max-w-2xl mx-auto">
                <div className="mb-6 p-4 bg-purple-50 border border-purple-200 rounded-lg">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <Loader2 className="h-6 w-6 text-purple-600 animate-spin" />
                      <h3 className="text-lg font-semibold text-gray-900">
                        Bulk Execution in Progress
                      </h3>
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={stopBulkExecution}
                      className="border-red-300 text-red-600 hover:bg-red-50"
                    >
                      <Square className="h-4 w-4 mr-1" />
                      Stop
                    </Button>
                  </div>
                  
                  <div className="mb-2">
                    <div className="flex justify-between text-sm mb-1">
                      <span>Progress</span>
                      <span>{bulkExecutionState.currentIndex} of {bulkExecutionState.totalRecords}</span>
                    </div>
                    <Progress 
                      value={(bulkExecutionState.currentIndex / bulkExecutionState.totalRecords) * 100} 
                      className="h-2"
                    />
                  </div>
                  
                  <p className="text-sm text-purple-700">
                    Running record {bulkExecutionState.currentIndex} of {bulkExecutionState.totalRecords}...
                  </p>
                </div>

                {/* Live Results */}
                {bulkExecutionState.results.length > 0 && (
                  <div className="border rounded-lg overflow-hidden">
                    <div className="bg-gray-50 px-4 py-2 border-b flex items-center gap-2">
                      <BarChart3 className="h-4 w-4 text-gray-600" />
                      <span className="text-sm font-medium">Execution Results</span>
                    </div>
                    <div className="max-h-64 overflow-y-auto divide-y">
                      {bulkExecutionState.results.map((result, idx) => (
                        <div key={idx} className={`px-4 py-2 flex items-center gap-3 ${
                          result.status === 'success' ? 'bg-green-50' : 'bg-red-50'
                        }`}>
                          {result.status === 'success' ? (
                            <CheckCircle className="h-4 w-4 text-green-600" />
                          ) : (
                            <AlertCircle className="h-4 w-4 text-red-600" />
                          )}
                          <div className="flex-1">
                            <span className="text-sm font-medium">{result.recordName}</span>
                            {result.errorMessage && (
                              <p className="text-xs text-red-600">{result.errorMessage}</p>
                            )}
                          </div>
                          <span className="text-xs text-gray-500">{result.actions.length} action(s)</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* RUNNING STATE (Record Detail Interactive Mode) */}
            {previewState === 'running' && currentScreen && (
              <div className="max-w-2xl mx-auto">
                {/* Prefill indicator */}
                {launchMode === 'record_detail' && prefillApplied && (
                  <div className="mb-4 p-2 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <span className="text-sm text-green-700">
                      Fields auto-prefilled from record: {selectedRecordData?.name || selectedRecordData?.first_name || selectedRecordId}
                    </span>
                  </div>
                )}
                
                {/* Themed Screen Container */}
                <div 
                  className="rounded-lg shadow-lg overflow-hidden"
                  style={getPreviewThemeStyles(currentScreen).contentCard}
                >
                  {/* Themed Screen Header */}
                  <div 
                    className="px-6 py-4"
                    style={getPreviewThemeStyles(currentScreen).header.background 
                      ? { background: getPreviewThemeStyles(currentScreen).header.background }
                      : { backgroundImage: 'linear-gradient(to right, #2563eb, #4f46e5)' }}
                  >
                    <h3 className="text-2xl font-bold text-white">
                      {currentScreen.label || 'Screen'}
                    </h3>
                    {currentScreen.description && (
                      <p className="text-blue-100 text-sm mt-1">{currentScreen.description}</p>
                    )}
                  </div>

                  {/* Screen Body with themed padding */}
                  <div className={getPreviewThemeStyles(currentScreen).contentPadding}>
                    {/* Screen Components */}
                    <div className="space-y-4 mb-6">
                      {(currentScreen.components || []).map(component => renderScreenComponent(component))}
                    </div>

                    {/* Screen Navigation Buttons */}
                    <div className="flex items-center justify-between pt-4 border-t">
                      {(() => {
                        const navConfig = currentScreen.navigationButtons || {};
                        const isFirstScreen = screenHistory.length <= 1;
                        const currentScreenId = currentScreen.id;
                        const hasNextNode = flow.edges.some(e => e.source === currentScreenId);
                        const isLastScreen = !hasNextNode;
                        
                        const showPrevious = navConfig.showPrevious !== undefined 
                          ? navConfig.showPrevious : !isFirstScreen;
                        const showNext = navConfig.showNext !== undefined
                          ? navConfig.showNext : !isLastScreen;
                        const showFinish = navConfig.showFinish !== undefined
                          ? navConfig.showFinish : isLastScreen;
                        
                        const buttonStyle = getPreviewThemeStyles(currentScreen).button;
                        
                        return (
                          <>
                            {showPrevious ? (
                              <Button
                                onClick={handlePrevious}
                                variant="outline"
                                disabled={screenHistory.length <= 1 || isProcessing}
                              >
                                <ArrowLeft className="h-4 w-4 mr-2" />
                                Previous
                              </Button>
                            ) : <div />}

                            <div className="flex gap-2">
                              {showNext && (
                                <Button
                                  onClick={handleNext}
                                  disabled={isProcessing || flowTerminatedByToast}
                                  style={buttonStyle.backgroundColor ? { backgroundColor: buttonStyle.backgroundColor, borderColor: buttonStyle.backgroundColor } : {}}
                                  className={!buttonStyle.backgroundColor ? 'bg-blue-600 hover:bg-blue-700' : ''}
                                >
                                  Next
                                  <ArrowRight className="h-4 w-4 ml-2" />
                                </Button>
                              )}
                              {showFinish && (
                                <Button
                                  onClick={handleFinish}
                                  variant="outline"
                                  className="border-green-500 text-green-700 hover:bg-green-50"
                                  disabled={isProcessing || flowTerminatedByToast}
                                >
                                  <Check className="h-4 w-4 mr-2" />
                                  Finish
                                </Button>
                              )}
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Processing state */}
            {previewState === 'running' && !currentScreen && (
              <div className="h-full flex items-center justify-center">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
                  <p className="text-sm text-gray-600">Processing...</p>
                </div>
              </div>
            )}

            {/* COMPLETED STATE */}
            {previewState === 'completed' && (
              <div className="h-full flex items-center justify-center">
                <div className="text-center max-w-md">
                  <CheckCircle className="h-16 w-16 text-green-600 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    {launchMode === 'list_view' ? 'Bulk Execution Complete' : 'Flow Completed'}
                  </h3>
                  
                  {/* Bulk execution summary */}
                  {launchMode === 'list_view' && bulkExecutionState.results.length > 0 && (
                    <div className="mb-6 p-4 bg-gray-50 rounded-lg text-left">
                      <h4 className="font-medium mb-2">Execution Summary</h4>
                      <div className="grid grid-cols-3 gap-4 text-center">
                        <div className="p-2 bg-white rounded border">
                          <div className="text-2xl font-bold text-gray-900">
                            {bulkExecutionState.results.length}
                          </div>
                          <div className="text-xs text-gray-500">Total</div>
                        </div>
                        <div className="p-2 bg-green-50 rounded border border-green-200">
                          <div className="text-2xl font-bold text-green-600">
                            {bulkExecutionState.results.filter(r => r.status === 'success').length}
                          </div>
                          <div className="text-xs text-green-600">Success</div>
                        </div>
                        <div className="p-2 bg-red-50 rounded border border-red-200">
                          <div className="text-2xl font-bold text-red-600">
                            {bulkExecutionState.results.filter(r => r.status === 'failed').length}
                          </div>
                          <div className="text-xs text-red-600">Failed</div>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  <p className="text-sm text-gray-600 mb-6">
                    {launchMode === 'list_view' 
                      ? 'All selected records have been processed.'
                      : 'The Screen Flow has finished successfully.'}
                  </p>
                  <Button onClick={handleRestart}>
                    <RotateCcw className="h-4 w-4 mr-2" />
                    {launchMode === 'record_detail' && selectedRecordId ? 'Restart with Same Record' : 'Restart Preview'}
                  </Button>
                </div>
              </div>
            )}

            {/* ERROR STATE */}
            {previewState === 'error' && (
              <div className="h-full flex items-center justify-center">
                <div className="text-center">
                  <AlertCircle className="h-16 w-16 text-red-600 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Preview Error</h3>
                  <p className="text-sm text-gray-600 mb-6">
                    An error occurred during preview execution. Check logs for details.
                  </p>
                  <Button onClick={handleRestart}>
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Restart Preview
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Right: Execution Logs */}
          <div className="w-96 border-l bg-gray-50 overflow-y-auto">
            <div className="p-4 border-b bg-white sticky top-0">
              <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Execution Logs
                <span className="text-xs text-gray-500">({executionLogs.length})</span>
              </h3>
            </div>
            <div className="p-4 space-y-2">
              {executionLogs.length === 0 ? (
                <p className="text-xs text-gray-500 text-center py-8">No logs yet</p>
              ) : (
                executionLogs.map((log, index) => (
                  <div
                    key={index}
                    className={`text-xs p-2 rounded ${
                      log.type === 'error' ? 'bg-red-50 text-red-900' :
                      log.type === 'warning' ? 'bg-amber-50 text-amber-900' :
                      log.type === 'success' ? 'bg-green-50 text-green-900' :
                      'bg-blue-50 text-blue-900'
                    }`}
                  >
                    <div className="font-medium whitespace-pre-wrap">{log.message}</div>
                    {log.details && (
                      <div className="mt-1 text-xs opacity-75">
                        {typeof log.details === 'object' 
                          ? JSON.stringify(log.details, null, 2)
                          : log.details
                        }
                      </div>
                    )}
                    <div className="text-xs opacity-50 mt-1">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t bg-gray-50 flex items-center justify-between">
          <div className="text-xs text-gray-600">
            <span>Flow: {flow.name} (v{flow.version_number || 1})</span>
            <span className="mx-2">|</span>
            <span>Mode: {safeMode ? 'Safe' : 'Real'}</span>
            <span className="mx-2">|</span>
            <span className={`${launchMode === 'record_detail' ? 'text-green-600' : launchMode === 'list_view' ? 'text-purple-600' : 'text-gray-600'}`}>
              Launch: {launchMode === 'record_detail' ? 'Record Detail' : launchMode === 'list_view' ? 'List View' : 'Screen'}
            </span>
            {selectedRecordId && (
              <>
                <span className="mx-2">|</span>
                <span className="text-indigo-600">recordId: {selectedRecordId.slice(0, 8)}...</span>
              </>
            )}
            {selectedRecordIds.length > 0 && launchMode === 'list_view' && (
              <>
                <span className="mx-2">|</span>
                <span className="text-purple-600">recordIds: [{selectedRecordIds.length}]</span>
              </>
            )}
          </div>
          <div className="flex gap-2">
            <Button onClick={handleRestart} variant="outline" size="sm" disabled={previewState === 'starting' || previewState === 'bulk_running'}>
              <RotateCcw className="h-3 w-3 mr-1" />
              Restart
            </Button>
            <Button onClick={onClose} variant="outline" size="sm">
              Close
            </Button>
          </div>
        </div>
      </div>

      {/* Active Toasts Overlay */}
      {activeToasts.map(toast => {
        const positionClasses = {
          'top-right': 'top-4 right-4',
          'top-center': 'top-4 left-1/2 -translate-x-1/2',
          'top-left': 'top-4 left-4',
          'bottom-right': 'bottom-4 right-4',
          'bottom-center': 'bottom-4 left-1/2 -translate-x-1/2',
          'bottom-left': 'bottom-4 left-4'
        };
        
        const typeStyles = {
          success: 'bg-green-50 border-green-500 text-green-900',
          error: 'bg-red-50 border-red-500 text-red-900',
          warning: 'bg-amber-50 border-amber-500 text-amber-900',
          info: 'bg-blue-50 border-blue-500 text-blue-900'
        };
        
        const typeIcons = {
          success: <CheckCircle className="h-5 w-5" />,
          error: <AlertCircle className="h-5 w-5" />,
          warning: <AlertTriangle className="h-5 w-5" />,
          info: <Info className="h-5 w-5" />
        };
        
        return (
          <div 
            key={toast.id}
            className={`fixed ${positionClasses[toast.position || 'top-right']} z-[60] max-w-md shadow-2xl rounded-lg border-2 p-4 ${typeStyles[toast.type || 'info']}`}
          >
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0">
                {typeIcons[toast.type || 'info']}
              </div>
              <div className="flex-1 min-w-0">
                {toast.title && (
                  <div className="font-semibold text-sm mb-1">{toast.title}</div>
                )}
                <div className="text-sm">{toast.message}</div>
                {toast.isTerminal && (
                  <div className="mt-2 text-xs font-medium px-2 py-1 bg-red-600 text-white rounded inline-block">
                    🛑 FLOW TERMINATED
                  </div>
                )}
              </div>
              {toast.dismissible !== false && !toast.isTerminal && (
                <button
                  onClick={() => {
                    setActiveToasts(prev => prev.filter(t => t.id !== toast.id));
                    addLog('info', 'Toast dismissed by user');
                  }}
                  className="flex-shrink-0 ml-2 hover:opacity-70 transition-opacity"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default ScreenFlowPreviewRunner;
