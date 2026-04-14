import React, { useState, useEffect, useRef } from 'react';
import { X, Search, ChevronDown, Check, Trash2, GripVertical, Plus, Monitor, AlertTriangle } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Textarea } from '../../../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { Dialog, DialogContent } from '../../../components/ui/dialog';
import ComboField from './ComboField';
import ResourcePickerField from './ResourcePickerField';
import ReferenceFieldPicker from './ReferenceFieldPicker';
import ScreenBuilder from './ScreenBuilder';
import SendEmailConfigPanel from './config-panels/SendEmailConfigPanel';
import SendNotificationConfigPanel from './config-panels/SendNotificationConfigPanel';
import ResourcePickerModal from './ResourcePickerModal';
import ExpressionBuilder from './ExpressionBuilder';
import InsertVariableButton from './InsertVariableButton';
import { ErrorHandlingRules } from '../utils/errorHandlingRules';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

/**
 * Sortable Outcome Item Component for Drag-and-Drop Reordering
 */
const SortableOutcomeItem = ({ outcome, outcomeIndex, children, id }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      {typeof children === 'function' 
        ? children({ dragHandleProps: listeners, isDragging })
        : React.cloneElement(children, {
            dragHandleProps: listeners,
            isDragging,
          })
      }
    </div>
  );
};

/**
 * Utility: Auto-generate API name from label (Salesforce-like)
 * Examples:
 *   "test" → "test"
 *   "test get" → "test_get"
 *   "Test Get Again" → "test_get_again"
 */
const generateApiName = (label) => {
  if (!label) return '';
  return label
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_')  // Replace spaces with underscores
    .replace(/[^a-z0-9_]/g, '');  // Remove special characters
};

// Searchable Select Component for Object Type
const SearchableObjectSelect = ({ value, onChange, objects, placeholder = 'Select object' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef(null);
  const inputRef = useRef(null);

  // Find the label for the current value
  const getDisplayLabel = () => {
    if (!value) return placeholder;
    const selectedObj = objects.find(obj => obj.name === value);
    return selectedObj ? selectedObj.label : value;
  };

  const defaultObjects = [
    { name: 'Lead', label: 'Lead' },
    { name: 'Contact', label: 'Contact' },
    { name: 'Account', label: 'Account' },
    { name: 'Task', label: 'Task' },
    { name: 'Event', label: 'Event' },
    { name: 'Opportunity', label: 'Opportunity' },
  ];

  const allObjects = objects?.length > 0 ? objects : defaultObjects;

  const filteredObjects = allObjects.filter(obj => 
    obj.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    obj.label?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
        setSearchQuery('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Focus input when dropdown opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const handleSelect = (objectName) => {
    onChange(objectName);
    setIsOpen(false);
    setSearchQuery('');
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger Button */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        >
          <span>{getDisplayLabel()}</span>
          <ChevronDown className={`h-4 w-4 opacity-50 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>
        
        {/* Clear button - show only when there's a selected value */}
        {value && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChange('');
              setSearchQuery('');
            }}
            className="absolute right-8 top-1/2 -translate-y-1/2 p-1 hover:bg-slate-100 rounded"
            title="Clear selection"
          >
            <X className="h-3.5 w-3.5 text-slate-500" />
          </button>
        )}
      </div>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-white shadow-lg">
          {/* Search Input */}
          <div className="p-2 border-b">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                ref={inputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={`Search ${placeholder.toLowerCase()}...`}
                className="w-full pl-8 pr-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Options List */}
          <div className="max-h-48 overflow-y-auto py-1">
            {filteredObjects.length === 0 ? (
              <div className="px-3 py-2 text-sm text-slate-500 text-center">
                No objects found
              </div>
            ) : (
              filteredObjects.map((obj) => (
                <button
                  key={obj.name}
                  type="button"
                  onClick={() => handleSelect(obj.name)}
                  className={`w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-indigo-50 ${
                    value === obj.name ? 'bg-indigo-50 text-indigo-700' : 'text-slate-700'
                  }`}
                >
                  <span>{obj.label || obj.name}</span>
                  {value === obj.name && <Check className="h-4 w-4 text-indigo-600" />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// Common reference fields that point to related objects
const REFERENCE_FIELD_MAP = {
  'AccountId': { object: 'Account', label: 'Account' },
  'account_id': { object: 'Account', label: 'Account' },
  'OwnerId': { object: 'User', label: 'Owner' },
  'owner_id': { object: 'User', label: 'Owner' },
  'ContactId': { object: 'Contact', label: 'Contact' },
  'contact_id': { object: 'Contact', label: 'Contact' },
  'LeadId': { object: 'Lead', label: 'Lead' },
  'lead_id': { object: 'Lead', label: 'Lead' },
  'OpportunityId': { object: 'Opportunity', label: 'Opportunity' },
  'opportunity_id': { object: 'Opportunity', label: 'Opportunity' },
  'CampaignId': { object: 'Campaign', label: 'Campaign' },
  'campaign_id': { object: 'Campaign', label: 'Campaign' },
  'CreatedById': { object: 'User', label: 'Created By' },
  'created_by_id': { object: 'User', label: 'Created By' },
  'ModifiedById': { object: 'User', label: 'Modified By' },
  'modified_by_id': { object: 'User', label: 'Modified By' },
  'ParentId': { object: 'Parent', label: 'Parent' },
  'parent_id': { object: 'Parent', label: 'Parent' },
  'ManagerId': { object: 'User', label: 'Manager' },
  'manager_id': { object: 'User', label: 'Manager' },
};

/**
 * HierarchicalFieldPicker - Field selector with reference field expansion
 * Supports parent field traversal like Account.Name, Account.Notes
 * Used in Update Record to select fields from parent objects
 */
const HierarchicalFieldPicker = ({ 
  value, 
  onChange, 
  fields = [], 
  fetchFieldsForObject,
  placeholder = 'Select field',
  maxDepth = 2  // Max traversal depth (0=current, 1=parent, 2=grandparent)
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedPaths, setExpandedPaths] = useState({});
  const [relatedObjectFields, setRelatedObjectFields] = useState({});
  const [loadingFields, setLoadingFields] = useState({});
  const dropdownRef = useRef(null);
  const inputRef = useRef(null);

  // Get display label for selected value
  const getDisplayLabel = () => {
    if (!value) return placeholder;
    // Handle dot-notation paths like Account.Name
    if (value.includes('.')) {
      const parts = value.split('.');
      return parts.join(' → ');
    }
    const selectedField = fields.find(f => f.name === value);
    return selectedField ? (selectedField.label || selectedField.name) : value;
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
        setSearchQuery('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Focus input when dropdown opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Load related object fields
  const loadRelatedFields = async (objectName) => {
    if (relatedObjectFields[objectName] || loadingFields[objectName]) return;
    
    setLoadingFields(prev => ({ ...prev, [objectName]: true }));
    try {
      if (fetchFieldsForObject) {
        const fetchedFields = await fetchFieldsForObject(objectName);
        setRelatedObjectFields(prev => ({ ...prev, [objectName]: fetchedFields || [] }));
      }
    } catch (error) {
      console.error(`Error loading fields for ${objectName}:`, error);
      setRelatedObjectFields(prev => ({ ...prev, [objectName]: [] }));
    } finally {
      setLoadingFields(prev => ({ ...prev, [objectName]: false }));
    }
  };

  // Toggle expansion of a reference field
  const toggleExpand = async (fieldName, objectName) => {
    const isExpanded = expandedPaths[fieldName];
    if (!isExpanded) {
      await loadRelatedFields(objectName);
    }
    setExpandedPaths(prev => ({ ...prev, [fieldName]: !isExpanded }));
  };

  // Check if a field is a reference field
  const isReferenceField = (field) => {
    return field.isReference || 
           field.type === 'reference' || 
           field.type === 'lookup' ||
           REFERENCE_FIELD_MAP[field.name];
  };

  // Get related object name from a reference field
  const getRelatedObject = (field) => {
    const refInfo = REFERENCE_FIELD_MAP[field.name];
    if (refInfo) return refInfo;
    // Try to infer from field name
    const baseName = field.name.replace(/Id$/, '').replace(/_id$/, '');
    return { object: baseName, label: baseName };
  };

  // Handle field selection
  const handleSelect = (fieldPath) => {
    onChange(fieldPath);
    setIsOpen(false);
    setSearchQuery('');
  };

  // Render a field item with optional expansion
  const renderFieldItem = (field, basePath = '', depth = 0) => {
    const fieldPath = basePath ? `${basePath}.${field.name}` : field.name;
    const isRef = isReferenceField(field);
    const canExpand = isRef && depth < maxDepth;
    const isExpanded = expandedPaths[fieldPath];
    const relatedObj = canExpand ? getRelatedObject(field) : null;

    // Filter by search
    const matchesSearch = !searchQuery || 
      field.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (field.label && field.label.toLowerCase().includes(searchQuery.toLowerCase())) ||
      fieldPath.toLowerCase().includes(searchQuery.toLowerCase());

    // Get child fields for expanded reference
    const childFields = canExpand && isExpanded ? (relatedObjectFields[relatedObj.object] || []) : [];

    // Check if any child matches search (for showing parent when child matches)
    const childMatchesSearch = searchQuery && childFields.some(cf => 
      cf.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (cf.label && cf.label.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    if (!matchesSearch && !childMatchesSearch && !isExpanded) return null;

    return (
      <div key={fieldPath} className={depth > 0 ? 'ml-4 border-l-2 border-slate-200 pl-2' : ''}>
        <div className="flex items-center">
          {/* Expand/collapse button for reference fields */}
          {canExpand ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggleExpand(fieldPath, relatedObj.object);
              }}
              className="p-1 hover:bg-slate-200 rounded mr-1"
            >
              <ChevronDown className={`h-3 w-3 transition-transform ${isExpanded ? 'rotate-0' : '-rotate-90'}`} />
            </button>
          ) : (
            <span className="w-5 mr-1" />
          )}

          {/* Field select button */}
          <button
            type="button"
            onClick={() => handleSelect(fieldPath)}
            className={`flex-1 flex items-center justify-between px-2 py-1.5 text-sm rounded hover:bg-indigo-50 ${
              value === fieldPath ? 'bg-indigo-50 text-indigo-700' : 'text-slate-700'
            }`}
          >
            <span className="flex items-center gap-2">
              {field.label || field.name}
              {canExpand && (
                <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">
                  → {relatedObj.label}
                </span>
              )}
            </span>
            {value === fieldPath && <Check className="h-4 w-4 text-indigo-600" />}
          </button>
        </div>

        {/* Expanded child fields */}
        {canExpand && isExpanded && (
          <div className="mt-1">
            {loadingFields[relatedObj.object] ? (
              <div className="text-xs text-slate-500 py-2 pl-6">Loading {relatedObj.label} fields...</div>
            ) : childFields.length > 0 ? (
              childFields.map(childField => 
                renderFieldItem(
                  childField, 
                  basePath ? `${basePath}.${relatedObj.label}` : relatedObj.label,
                  depth + 1
                )
              )
            ) : (
              <div className="text-xs text-slate-500 py-2 pl-6">No fields available</div>
            )}
          </div>
        )}
      </div>
    );
  };

  // Filter top-level fields
  const visibleFields = fields.filter(f => f.name && f.name !== '_id');

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger Button */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        >
          <span className={value ? 'text-slate-900' : 'text-slate-500'}>{getDisplayLabel()}</span>
          <ChevronDown className={`h-4 w-4 opacity-50 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>
        
        {/* Clear button */}
        {value && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChange('');
            }}
            className="absolute right-8 top-1/2 -translate-y-1/2 p-1 hover:bg-slate-100 rounded"
          >
            <X className="h-3.5 w-3.5 text-slate-500" />
          </button>
        )}
      </div>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 mt-1 w-full min-w-[300px] rounded-md border bg-white shadow-lg">
          {/* Search Input */}
          <div className="p-2 border-b">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                ref={inputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search fields..."
                className="w-full pl-8 pr-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Help text */}
          <div className="px-3 py-2 bg-blue-50 border-b text-xs text-blue-700">
            <strong>Tip:</strong> Click ▶ to expand reference fields and access parent object fields (e.g., Account → Name)
          </div>

          {/* Fields List */}
          <div className="max-h-64 overflow-y-auto py-2 px-1">
            {visibleFields.length === 0 ? (
              <div className="px-3 py-2 text-sm text-slate-500 text-center">
                No fields available
              </div>
            ) : (
              visibleFields.map(field => renderFieldItem(field))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const NodeConfigPanel = ({ node, onUpdate, onDelete, onClose, crmObjects = [], fetchFieldsForObject, flowVariables = [], onCreateVariable, nodes = [], edges = [], triggers = [], flowType, launchMode, screenFlowObject, onAddFaultPath }) => {
  const [config, setConfig] = useState((node?.data?.config) || {});
  const [availableFields, setAvailableFields] = useState([]);
  const [targetObjectFields, setTargetObjectFields] = useState([]); // For reference-based updates
  const [showScreenBuilder, setShowScreenBuilder] = useState(false);
  const [dateFields, setDateFields] = useState([]); // For dynamic datetime delay mode
  
  // Resource picker modal state for Custom Error node
  const [showResourcePicker, setShowResourcePicker] = useState(false);
  const [resourcePickerTargetIdx, setResourcePickerTargetIdx] = useState(null);

  // Check if this node supports fault paths
  const nodeType = node?.data?.nodeType || node?.type;
  const canAddFaultPath = ErrorHandlingRules.canAddFaultPath(nodeType, config);
  
  // Check if node already has a fault path
  const hasFaultPath = edges?.some(e => e.source === node?.id && e.sourceHandle === 'fault');

  // useEffect to load DateTime fields for delay node
  useEffect(() => {
    const loadDateFields = async () => {
      // Only load for delay nodes with dynamic_datetime mode
      if (node?.type !== 'delay' || config.delay_mode !== 'dynamic_datetime') {
        return;
      }

      console.log('[DateField useEffect] Loading date fields for delay node');
      console.log('[DateField useEffect] config.delay_mode:', config.delay_mode);

      let triggerObject = null;

      // Method 1: Check triggers prop
      if (triggers && triggers.length > 0) {
        const triggerConfig = triggers[0]?.config || triggers[0] || {};
        const obj = triggerConfig.entity || triggerConfig.object || triggerConfig.trigger_object;
        if (obj) {
          triggerObject = obj;
          console.log('[DateField useEffect] ✅ Found trigger from triggers prop:', obj);
        }
      }

      // Method 2: Check nodes array for trigger/start node
      if (!triggerObject && nodes && nodes.length > 0) {
        const triggerNode = nodes.find(n => n.type === 'trigger' || n.type === 'start' || n.id?.includes('trigger'));
        if (triggerNode) {
          const config1 = triggerNode.data?.config || {};
          const config2 = triggerNode.config || {};
          const obj = config1.entity || config1.object || config1.trigger_object ||
                     config2.entity || config2.object || config2.trigger_object;
          if (obj) {
            triggerObject = obj;
            console.log('[DateField useEffect] ✅ Found trigger from nodes array:', obj);
          }
        }
      }

      // Method 3: Check flow variables for Trigger.
      if (!triggerObject && flowVariables && flowVariables.length > 0) {
        const triggerVar = flowVariables.find(v => v.name?.startsWith('Trigger.'));
        if (triggerVar) {
          const parts = triggerVar.name.split('.');
          if (parts.length > 1) {
            triggerObject = parts[1];
            console.log('[DateField useEffect] ✅ Found trigger from flow variables:', triggerObject);
          }
        }
      }

      // Method 4: For Screen Flows, use screenFlowObject
      if (!triggerObject && flowType === 'screen-flow' && (launchMode === 'record_detail' || launchMode === 'list_view') && screenFlowObject) {
        triggerObject = screenFlowObject;
        console.log('[DateField useEffect] ✅ Found trigger from screenFlowObject (Screen Flow mode):', triggerObject);
      }

      if (!triggerObject) {
        console.log('[DateField useEffect] ⚠️ No trigger object found');
        setDateFields([]);
        return;
      }

      // Fetch date/datetime fields for the trigger object
      console.log('[DateField useEffect] Fetching date fields for object:', triggerObject);
      try {
        if (fetchFieldsForObject) {
          const fields = await fetchFieldsForObject(triggerObject);
          console.log('[DateField useEffect] Fetched fields:', fields?.length || 0);
          
          // Filter for date/datetime fields
          const dateTimeFields = fields.filter(f => 
            f.type === 'Date' || f.type === 'DateTime' || 
            f.type === 'date' || f.type === 'datetime'
          );
          
          console.log('[DateField useEffect] ✅ Date/DateTime fields found:', dateTimeFields.length);
          setDateFields(dateTimeFields);
        }
      } catch (error) {
        console.error('[DateField useEffect] ❌ Error fetching fields:', error);
        setDateFields([]);
      }
    };

    loadDateFields();
  }, [node?.type, config.delay_mode, triggers, nodes, flowVariables, fetchFieldsForObject, flowType, launchMode, screenFlowObject]);

  // Drag and Drop sensors for Decision outcome reordering
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Check if node is inside a loop (For Each context)
  const loopContext = node?.data?.loopContext;
  const isInsideLoop = loopContext?.isInsideLoop;
  const collectionVariable = loopContext?.collectionVariable;
  
  // Extract object name from collection variable (e.g., "{{Account_records}}" -> "Account")
  const loopObjectName = collectionVariable ? 
    collectionVariable.replace(/[{}]/g, '').split('_')[0] : null;

  // Extract nodes from crmObjects (passed from parent)
  const allNodes = crmObjects?.nodes || [];
  
  // Get previous nodes (nodes that come before current node in flow)
  const currentNodeIndex = allNodes.findIndex(n => n.id === node?.id);
  const previousNodes = currentNodeIndex > 0 ? allNodes.slice(0, currentNodeIndex) : [];

  // Debug: Log node type on mount
  useEffect(() => {
    console.log('NodeConfigPanel mounted, node type:', node?.type);
    console.log('Node data:', node);
    console.log('Loop context:', loopContext);
    console.log('Loop object:', loopObjectName);
    console.log('Previous nodes:', previousNodes);
  }, []);

  // Use dynamic CRM objects or fallback to defaults
  const objectsList = crmObjects.length > 0 ? crmObjects : [
    { name: 'Lead', label: 'Lead' },
    { name: 'Contact', label: 'Contact' },
    { name: 'Account', label: 'Account' },
    { name: 'Opportunity', label: 'Opportunity' },
    { name: 'Task', label: 'Task' },
    { name: 'Event', label: 'Event' },
  ];

  // Extract trigger config for reference field options
  const triggerConfig = triggers && triggers.length > 0 
    ? (triggers[0]?.config || triggers[0] || {})
    : {};
  const triggerEntity = triggerConfig.entity || triggerConfig.object || triggerConfig.trigger_object;

  /**
   * Check if a screen node is the first screen in the flow
   * Implements Salesforce behavior: Only first screen can define associated object
   * Uses BFS to find first screen reachable from start/trigger node
   */
  const checkIfFirstScreen = (screenNodeId, flowNodes, flowEdges) => {
    if (!flowNodes || flowNodes.length === 0 || !flowEdges) {
      return true; // If no graph structure, assume first
    }

    // Get all screen nodes
    const screenNodes = flowNodes.filter(n => n.type === 'screen');
    
    if (screenNodes.length === 0) {
      return true;
    }

    // Find the first screen reachable from start/trigger
    const firstScreenId = findFirstScreenInFlow(flowNodes, flowEdges, triggers);
    
    if (!firstScreenId) {
      // No reachable screen found, check if this is the only screen
      return screenNodeId === screenNodes[0]?.id;
    }

    return screenNodeId === firstScreenId;
  };

  /**
   * Find the first screen node reachable from the start of the flow
   * Uses breadth-first search from trigger/start node
   */
  const findFirstScreenInFlow = (flowNodes, flowEdges, flowTriggers) => {
    // Determine start node
    let startNodeId = null;
    
    if (flowTriggers && flowTriggers.length > 0) {
      startNodeId = flowTriggers[0]?.id || 'trigger_start';
    } else {
      // Look for start/trigger node
      const startNode = flowNodes.find(n => n.type === 'trigger' || n.type === 'start');
      if (startNode) {
        startNodeId = startNode.id;
      }
    }

    if (!startNodeId) {
      // No clear start, return first screen by order
      const screenNodes = flowNodes.filter(n => n.type === 'screen');
      return screenNodes[0]?.id || null;
    }

    // BFS from start node to find first screen
    const visited = new Set();
    const queue = [startNodeId];
    visited.add(startNodeId);

    while (queue.length > 0) {
      const currentId = queue.shift();

      // Check if current node is a screen
      const currentNode = flowNodes.find(n => n.id === currentId);
      if (currentNode && currentNode.type === 'screen') {
        return currentId; // Found first screen
      }

      // Add connected nodes to queue
      flowEdges.forEach(edge => {
        if (edge.source === currentId) {
          const targetId = edge.target;
          if (targetId && !visited.has(targetId)) {
            visited.add(targetId);
            queue.push(targetId);
          }
        }
      });
    }

    return null; // No screen reachable from start
  };

  // Initialize config from node data when panel opens/reopens
  // This runs when component mounts or when node.id changes (not on every node object update)
  useEffect(() => {
    console.log('🔵 NodeConfigPanel useEffect triggered');
    console.log('  Node ID:', node?.id);
    console.log('  Node config from data:', node?.data?.config);
    
    // Load config from node data
    setConfig((node?.data?.config) || {});
  }, [node?.id]);

  // Initialize decision node outcomes if not present
  useEffect(() => {
    if (node?.type === 'decision' && config && (!config.outcomes || config.outcomes.length === 0)) {
      const initialOutcomes = [
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
      setConfig({ ...config, outcomes: initialOutcomes });
    }
  }, [node?.type, config]);

  // Fetch fields when object changes OR when inside loop (fetch loop object fields)
  useEffect(() => {
    const loadFields = async () => {
      // First priority: object selected in config (for CRM actions)
      let objectName = config.object || config.entity;
      
      // Second priority: if inside loop and no object selected, use loop object
      if (!objectName && isInsideLoop && loopObjectName) {
        objectName = loopObjectName;
        console.log(`Inside loop - using loop object: ${loopObjectName}`);
      }
      
      if (objectName && fetchFieldsForObject) {
        const fields = await fetchFieldsForObject(objectName);
        console.log(`Loaded ${fields.length} fields for ${objectName}:`, fields);
        
        // Add 'id' field if not already present (for filter conditions)
        const hasIdField = fields.some(f => f.name === 'id' || f.name === 'Id');
        const fieldsWithId = hasIdField ? fields : [
          { name: 'id', label: 'Record ID', type: 'id' },
          ...fields
        ];
        
        setAvailableFields(fieldsWithId);
        
        // Auto-create rows for required fields ONLY in CREATE action
        if (config.object && node?.type === 'mcp' && config.action_type === 'create') {
          console.log('CRM CREATE Action detected, checking for required fields...');
          
          // Filter only required fields
          const requiredFields = fields.filter(field => field.is_required === true);
          console.log(`Found ${requiredFields.length} required fields:`, requiredFields);
          
          if (requiredFields.length > 0) {
            // Check if field_values already exists and has values
            const existingFieldValues = config.field_values || [];
            console.log('Existing field_values:', existingFieldValues);
            
            // Only auto-create if field_values is empty or has default empty row
            const shouldAutoCreate = existingFieldValues.length === 0 || 
              (existingFieldValues.length === 1 && !existingFieldValues[0].field);
            
            console.log('Should auto-create rows?', shouldAutoCreate);
            
            if (shouldAutoCreate) {
              // Create rows with required fields pre-filled
              const newFieldValues = requiredFields.map(field => ({
                field: field.name,
                value: ''
              }));
              
              console.log(`✅ Auto-creating ${newFieldValues.length} rows for required fields:`, newFieldValues);
              
              setConfig(prev => ({
                ...prev,
                field_values: newFieldValues
              }));
            } else {
              console.log('⚠ Skipped auto-creation - field_values already has data');
            }
          } else {
            console.log('⚠ No required fields found for', objectName);
          }
        }
        
        // For UPDATE action, just log available fields (no auto-creation)
        if (config.action_type === 'update') {
          console.log(`✅ UPDATE Action: ${fields.length} fields available for selection:`, fields.map(f => f.label));
        }
      } else {
        // Default fields if no object selected
        setAvailableFields([
          { name: 'name', label: 'Name' },
          { name: 'email', label: 'Email' },
          { name: 'phone', label: 'Phone' },
          { name: 'status', label: 'Status' },
        ]);
      }
    };
    loadFields();
  }, [config.object, config.entity, fetchFieldsForObject, isInsideLoop, loopObjectName]);

  // Load target object fields when using "Update via Reference Field" mode
  useEffect(() => {
    const loadTargetObjectFields = async () => {
      // Only relevant for UPDATE action with reference mode
      if (config.action_type !== 'update' || config.update_mode !== 'reference') {
        setTargetObjectFields([]);
        return;
      }

      const targetObject = config.target_object;
      if (!targetObject || !fetchFieldsForObject) {
        console.log('[TargetObjectFields] No target object or fetchFieldsForObject available');
        setTargetObjectFields([]);
        return;
      }

      console.log(`[TargetObjectFields] Loading fields for target object: ${targetObject}`);
      try {
        const fields = await fetchFieldsForObject(targetObject);
        console.log(`[TargetObjectFields] ✅ Loaded ${fields?.length || 0} fields for ${targetObject}:`, fields);
        
        // Add 'id' field if not already present
        const hasIdField = fields?.some(f => f.name === 'id' || f.name === 'Id');
        const fieldsWithId = hasIdField ? fields : [
          { name: 'id', label: 'Record ID', type: 'id' },
          ...(fields || [])
        ];
        
        setTargetObjectFields(fieldsWithId);
      } catch (error) {
        console.error('[TargetObjectFields] ❌ Error fetching fields:', error);
        setTargetObjectFields([]);
      }
    };

    loadTargetObjectFields();
  }, [config.action_type, config.update_mode, config.target_object, fetchFieldsForObject]);

  // Date fields useEffect removed - field delay mode no longer supported

  const handleConfigChange = (key, value) => {
    console.log(`💡 handleConfigChange called: ${key} = ${value}`);
    // Use functional update to ensure we always get the latest state
    setConfig(prevConfig => {
      const newConfig = { ...prevConfig, [key]: value };
      console.log('💡 New config:', JSON.stringify(newConfig));
      return newConfig;
    });
  };

  // Handle drag end for Decision outcome reordering
  const handleDragEnd = (event) => {
    const { active, over } = event;

    if (active.id !== over.id) {
      const outcomes = config.outcomes || [];
      const oldIndex = outcomes.findIndex((outcome) => outcome.name === active.id);
      const newIndex = outcomes.findIndex((outcome) => outcome.name === over.id);

      // Reorder outcomes (excluding default outcome)
      const regularOutcomes = outcomes.filter(o => !o.isDefault);
      const defaultOutcome = outcomes.find(o => o.isDefault);
      
      const reorderedOutcomes = arrayMove(regularOutcomes, oldIndex, newIndex);
      
      // Add default outcome back at the end
      const finalOutcomes = defaultOutcome ? [...reorderedOutcomes, defaultOutcome] : reorderedOutcomes;

      setConfig({ ...config, outcomes: finalOutcomes });
    }
  };

  // Screen Flow field handlers
  const handleAddScreenField = () => {
    const fields = config.fields || [];
    const newField = {
      id: `field_${Date.now()}`,
      name: `field_${fields.length + 1}`,
      label: `Field ${fields.length + 1}`,
      type: 'Text',
      required: false,
      defaultValue: '',
      helpText: ''
    };
    setConfig({ ...config, fields: [...fields, newField] });
  };

  const handleUpdateScreenField = (index, key, value) => {
    const fields = [...(config.fields || [])];
    fields[index] = { ...fields[index], [key]: value };
    
    // Auto-generate API name when label changes
    if (key === 'label') {
      fields[index].name = generateApiName(value);
    }
    
    setConfig({ ...config, fields });
  };

  const handleDeleteScreenField = (index) => {
    const fields = (config.fields || []).filter((_, i) => i !== index);
    setConfig({ ...config, fields });
  };

  const handleSave = () => {
    const nodeType = node?.data?.nodeType || node?.type;
    
    console.log('💾 NodeConfigPanel handleSave called');
    console.log('  Node ID:', node?.id);
    console.log('  Config to save:', config);
    
    // Ensure connector_type is set for connector nodes
    const finalConfig = { ...config };
    if (nodeType === 'connector' && !finalConfig.connector_type) {
      finalConfig.connector_type = 'sendgrid';
    }
    
    // For MCP nodes (CRM Actions), ensure mcp_action is set based on action_type
    if (nodeType === 'mcp') {
      const actionType = finalConfig.action_type || 'create';
      
      switch(actionType) {
        case 'create':
          finalConfig.mcp_action = 'crm.record.create';
          break;
        case 'update':
          finalConfig.mcp_action = 'crm.record.update';
          break;
        case 'get':
          finalConfig.mcp_action = 'crm.record.get';
          break;
        case 'delete':
          finalConfig.mcp_action = 'crm.record.delete';
          break;
        default:
          finalConfig.mcp_action = 'crm.record.create';
      }
    }
    
    // For webhook nodes, ensure mcp_action is set
    if (nodeType === 'webhook') {
      finalConfig.mcp_action = 'system.webhook';
    }
    
    console.log('💾 Final config to save:', finalConfig);
    
    // Update node data with label (saved to node.data.label for canvas display)
    onUpdate(node.id, finalConfig, finalConfig.label);
    onClose();
  };

  const renderConfigForm = () => {
    const nodeType = node?.data?.nodeType || node?.type;

    switch (nodeType) {
      case 'trigger':
        return (
          <div className="space-y-4">
            {/* <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 mb-4">
              <p className="text-sm text-orange-800 font-medium">⚡ Trigger Node (Flow Start)</p>
              <p className="text-xs text-orange-600 mt-1">
                This node starts the flow automatically when the selected event occurs.
              </p>
            </div> */}
            
            <div>
              <Label>Object Type</Label>
              <SearchableObjectSelect
                value={config.entity || 'Lead'}
                onChange={(value) => handleConfigChange('entity', value)}
                objects={objectsList}
                placeholder="Search objects"
              />
              <p className="text-xs text-slate-500 mt-1">Which CRM object triggers this flow</p>
            </div>

            <div>
              <Label>Event Type</Label>
              <Select
                value={config.event || 'afterInsert'}
                onValueChange={(value) => handleConfigChange('event', value)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select event" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="afterInsert">Created (Insert)</SelectItem>
                  <SelectItem value="afterUpdate">Updated (Update)</SelectItem>
                  <SelectItem value="afterDelete">Deleted (Delete)</SelectItem>
                  {/* <SelectItem value="afterRetrieve">Searched / Retrieved</SelectItem> */}
                  <SelectItem value="undelete">Undelete</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-slate-500 mt-1">When should the flow trigger</p>
            </div>

            {/* Trigger Match Mode */}
            <div>
              <Label className="mb-2 block">Trigger Match Mode</Label>
              <div className="space-y-2 bg-slate-50 p-3 rounded-md border border-slate-200">
                <label className="flex items-start gap-3 cursor-pointer group">
                  <input
                    type="radio"
                    name="match_mode"
                    value="every_time"
                    checked={(config.match_mode || 'every_time') === 'every_time'}
                    onChange={(e) => handleConfigChange('match_mode', e.target.value)}
                    className="w-4 h-4 text-indigo-600 mt-0.5 focus:ring-2 focus:ring-indigo-500"
                  />
                  <div className="flex-1">
                    <span className="text-sm font-medium text-slate-900 group-hover:text-indigo-600">
                      Every Time Criteria Matches
                    </span>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Flow will execute every time a record meets the criteria (default behavior)
                    </p>
                  </div>
                </label>
                <label className="flex items-start gap-3 cursor-pointer group">
                  <input
                    type="radio"
                    name="match_mode"
                    value="first_time_only"
                    checked={(config.match_mode || 'every_time') === 'first_time_only'}
                    onChange={(e) => handleConfigChange('match_mode', e.target.value)}
                    className="w-4 h-4 text-indigo-600 mt-0.5 focus:ring-2 focus:ring-indigo-500"
                  />
                  <div className="flex-1">
                    <span className="text-sm font-medium text-slate-900 group-hover:text-indigo-600">
                      Only the First Time Criteria Matches
                    </span>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Flow will execute only once per record for this version, even if criteria matches again
                    </p>
                  </div>
                </label>
              </div>
              <div className={`mt-2 p-2 rounded-md text-xs ${
                (config.match_mode || 'every_time') === 'every_time' 
                  ? 'bg-blue-50 text-blue-700 border border-blue-200' 
                  : 'bg-amber-50 text-amber-700 border border-amber-200'
              }`}>
                {(config.match_mode || 'every_time') === 'every_time' ? (
                  <span>✅ <strong>Default:</strong> Trigger fires every time conditions are met</span>
                ) : (
                  <span>⚠️ <strong>First Time Only:</strong> Each record will trigger this flow version only once</span>
                )}
              </div>
            </div>

            <div>
              <Label>Filter Logic</Label>
              <Select
                value={config.filter_logic || 'none'}
                onValueChange={(value) => {
                  const newConfig = { ...config, filter_logic: value };
                  // Initialize conditions array if switching to AND/OR/Custom
                  if (value !== 'none') {
                    newConfig.filter_conditions = config.filter_conditions || [{ field: '', operator: 'equals', value: '' }];
                  } else {
                    newConfig.filter_conditions = [];
                  }
                  // Initialize customLogic if switching to custom
                  if (value === 'custom' && !newConfig.filter_custom_logic) {
                    newConfig.filter_custom_logic = '';
                  }
                  setConfig(newConfig);
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select filter logic" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="and">All Conditions Is Met (AND)</SelectItem>
                  <SelectItem value="or">Any Condition Is Met (OR)</SelectItem>
                  <SelectItem value="custom">Custom Condition Logic Is Met</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-slate-500 mt-1">
                {config.filter_logic === 'none' && 'No filtering - trigger for all records'}
                {config.filter_logic === 'and' && 'Trigger only when ALL conditions are true'}
                {config.filter_logic === 'or' && 'Trigger when ANY condition is true'}
                {config.filter_logic === 'custom' && 'Define custom logic with conditions'}
                {(!config.filter_logic || config.filter_logic === 'none') && 'Choose how to filter trigger conditions'}
              </p>
            </div>

            {/* Custom Logic Input - Show when Custom is selected */}
            {config.filter_logic === 'custom' && (
              <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-3">
                <Label className="text-xs font-semibold text-blue-900">Condition Logic *</Label>
                <p className="text-xs text-blue-700 mb-2">
                  Use condition numbers with AND, OR, and parentheses. Example: <code className="bg-blue-100 px-1 rounded">(1 AND 2) OR 3</code>
                </p>
                <Input
                  className="w-full mt-1 font-mono text-sm bg-white"
                  value={config.filter_custom_logic || ''}
                  onChange={(e) => handleConfigChange('filter_custom_logic', e.target.value)}
                  placeholder="e.g., (1 AND 2) OR (3 AND 4)"
                />
                {/* Validation message */}
                {config.filter_custom_logic && (() => {
                  try {
                    const numConditions = (config.filter_conditions || []).length;
                    const expression = config.filter_custom_logic.trim();
                    if (!expression) {
                      return (
                        <p className="text-xs text-red-600 mt-1">
                          ⚠️ Condition Logic is required when Custom Logic is selected
                        </p>
                      );
                    }
                    
                    // Extract numbers
                    const numbers = expression.match(/\d+/g) || [];
                    const invalidNumbers = numbers.filter(n => parseInt(n) < 1 || parseInt(n) > numConditions);
                    
                    if (invalidNumbers.length > 0) {
                      return (
                        <p className="text-xs text-red-600 mt-1">
                          ⚠️ Invalid condition numbers: {invalidNumbers.join(', ')} (must be 1-{numConditions})
                        </p>
                      );
                    }
                    
                    // Check for balanced parentheses
                    const openCount = (expression.match(/\(/g) || []).length;
                    const closeCount = (expression.match(/\)/g) || []).length;
                    if (openCount !== closeCount) {
                      return (
                        <p className="text-xs text-red-600 mt-1">
                          ⚠️ Unbalanced parentheses
                        </p>
                      );
                    }
                    
                    return (
                      <p className="text-xs text-green-600 mt-1">
                        ✅ Logic looks valid
                      </p>
                    );
                  } catch (e) {
                    return null;
                  }
                })()}
                
                {/* Help Examples */}
                <div className="mt-2 text-xs text-blue-700 space-y-1">
                  <p className="font-semibold">Examples:</p>
                  <ul className="list-disc list-inside space-y-0.5 ml-2">
                    <li><code className="bg-blue-100 px-1 rounded">1 AND 2</code> - Both must be true</li>
                    <li><code className="bg-blue-100 px-1 rounded">1 OR 2</code> - Either can be true</li>
                    <li><code className="bg-blue-100 px-1 rounded">(1 AND 2) OR 3</code> - Complex logic</li>
                    <li><code className="bg-blue-100 px-1 rounded">1 AND (2 OR 3)</code> - Grouped conditions</li>
                  </ul>
                </div>
              </div>
            )}

            {config.filter_logic && config.filter_logic !== 'none' && config.filter_logic !== '' && (
              <div className="space-y-3">
                <Label className="text-sm font-medium">Filter Conditions</Label>
                
                {/* Column Headers */}
                <div className="grid grid-cols-3 gap-2 px-3">
                  <div className="text-xs font-medium text-slate-600">Field</div>
                  <div className="text-xs font-medium text-slate-600">Operator</div>
                  <div className="text-xs font-medium text-slate-600">Value</div>
                </div>
                
                {/* Ensure filter_conditions is always an array */}
                {(() => {
                  const conditions = Array.isArray(config.filter_conditions) 
                    ? config.filter_conditions 
                    : [{ field: '', operator: 'equals', value: '' }];
                  
                  return conditions.map((condition, index) => (
                  <div key={index} className="flex items-start gap-2 p-3 bg-slate-50 rounded-md border border-slate-200">
                    {/* Condition Number Badge (for custom logic) */}
                    {config.filter_logic === 'custom' && (
                      <div className="flex-shrink-0">
                        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-blue-600 text-white text-sm font-bold">
                          {index + 1}
                        </span>
                      </div>
                    )}
                    <div className="flex-1 grid grid-cols-3 gap-2">
                      {/* Field - Searchable Dropdown */}
                      <div>
                        <SearchableObjectSelect
                          value={condition.field || ''}
                          onChange={(value) => {
                            const conditions = Array.isArray(config.filter_conditions) 
                              ? config.filter_conditions 
                              : [{ field: '', operator: 'equals', value: '' }];
                            const newConditions = [...conditions];
                            newConditions[index] = { ...newConditions[index], field: value };
                            setConfig({ ...config, filter_conditions: newConditions });
                          }}
                          objects={availableFields.length > 0 ? availableFields : [
                            { name: 'name', label: 'Name' },
                            { name: 'email', label: 'Email' },
                            { name: 'phone', label: 'Phone' },
                            { name: 'status', label: 'Status' },
                          ]}
                          placeholder="Search fields"
                        />
                      </div>

                      {/* Operator - Dropdown */}
                      <div>
                        <Select
                          value={condition.operator || 'equals'}
                          onValueChange={(value) => {
                            const conditions = Array.isArray(config.filter_conditions) 
                              ? config.filter_conditions 
                              : [{ field: '', operator: 'equals', value: '' }];
                            const newConditions = [...conditions];
                            newConditions[index] = { ...newConditions[index], operator: value };
                            setConfig({ ...config, filter_conditions: newConditions });
                          }}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Operator" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="equals">Equals (=)</SelectItem>
                            <SelectItem value="does_not_equal">Does Not Equal (≠)</SelectItem>
                            <SelectItem value="greater_than">Greater Than (&gt;)</SelectItem>
                            <SelectItem value="less_than">Less Than (&lt;)</SelectItem>
                            <SelectItem value="greater_than_or_equal">Greater Than or Equal (≥)</SelectItem>
                            <SelectItem value="less_than_or_equal">Less Than or Equal (≤)</SelectItem>
                            <SelectItem value="starts_with">Starts With</SelectItem>
                            <SelectItem value="ends_with">Ends With</SelectItem>
                            <SelectItem value="contains">Contains</SelectItem>
                            <SelectItem value="is_null">Is Null</SelectItem>
                            <SelectItem value="is_not_null">Is Not Null</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Value - ResourcePickerField for Variables & Formulas */}
                      <div>
                        <ResourcePickerField
                          value={condition.value || ''}
                          onChange={(value) => {
                            const conditions = Array.isArray(config.filter_conditions) 
                              ? config.filter_conditions 
                              : [{ field: '', operator: 'equals', value: '' }];
                            const newConditions = [...conditions];
                            newConditions[index] = { ...newConditions[index], value: value };
                            setConfig({ ...config, filter_conditions: newConditions });
                          }}
                          nodes={previousNodes}
                          availableFields={availableFields}
                          fetchFieldsForObject={fetchFieldsForObject}
                          flowVariables={flowVariables}
                          disabled={condition.operator === 'is_null' || condition.operator === 'is_not_null'}
                          placeholder="Type or select value..."
                          showCommonValues={true}
                        />
                      </div>
                    </div>

                    {/* Delete Button - Recycle Bin Icon */}
                    {(() => {
                      const conditions = Array.isArray(config.filter_conditions) 
                        ? config.filter_conditions 
                        : [{ field: '', operator: 'equals', value: '' }];
                      return conditions.length > 1 ? (
                        <button
                          type="button"
                          onClick={() => {
                            const conditions = Array.isArray(config.filter_conditions) 
                              ? config.filter_conditions 
                              : [{ field: '', operator: 'equals', value: '' }];
                            const newConditions = conditions.filter((_, i) => i !== index);
                            setConfig({ ...config, filter_conditions: newConditions });
                          }}
                          className="mt-0.5 p-2 text-red-600 hover:bg-red-50 rounded-md transition-colors"
                          title="Delete condition"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      ) : null;
                    })()}
                  </div>
                  ));
                })()}

                {/* Add Condition Button */}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const conditions = Array.isArray(config.filter_conditions) 
                      ? config.filter_conditions 
                      : [];
                    const newConditions = [...conditions, { field: '', operator: 'equals', value: '' }];
                    setConfig({ ...config, filter_conditions: newConditions });
                  }}
                  className="w-full border-dashed border-2 hover:border-orange-400 hover:bg-orange-50"
                >
                  <span className="text-orange-600 font-medium">+ Add Condition</span>
                </Button>
              </div>
            )}

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-xs text-blue-800 font-medium mb-1">📝 Example Configuration:</p>
              <p className="text-xs text-blue-600">
                Object: Lead<br/>
                Event: Created<br/>
                Filter: source = Website<br/>
                <span className="font-medium">Result:</span> Flow runs when Lead with source="Website" is created
              </p>
            </div>
          </div>
        );
      
      case 'connector':
        // Build robust trigger config for SendEmailConfigPanel
        let emailTriggerConfig = null;
        let emailTriggerEntity = null;
        
        // Method 1: From triggers prop
        if (triggers && triggers.length > 0) {
          const tc = triggers[0]?.config || triggers[0] || {};
          emailTriggerEntity = tc.entity || tc.object || tc.trigger_object;
          if (emailTriggerEntity) {
            emailTriggerConfig = { entity: emailTriggerEntity, ...tc };
          }
        }
        
        // Method 2: From nodes array (find trigger/start node)
        if (!emailTriggerEntity && nodes && nodes.length > 0) {
          const triggerNode = nodes.find(n => n.type === 'trigger' || n.type === 'start' || n.id?.includes('trigger'));
          if (triggerNode) {
            const cfg1 = triggerNode.data?.config || {};
            const cfg2 = triggerNode.config || {};
            emailTriggerEntity = cfg1.entity || cfg1.object || cfg1.trigger_object ||
                                cfg2.entity || cfg2.object || cfg2.trigger_object;
            if (emailTriggerEntity) {
              emailTriggerConfig = { entity: emailTriggerEntity, ...cfg1, ...cfg2 };
            }
          }
        }
        
        console.log('[SendEmail] Trigger config for email fields:', emailTriggerConfig);
        
        return (
          <SendEmailConfigPanel
            config={config}
            handleConfigChange={handleConfigChange}
            context={{
              triggerConfig: emailTriggerConfig,
              previousNodes: nodes?.filter(n => n.id !== node?.id),
              crmObjects,
              fetchFieldsForObject
            }}
          />
        );

      case 'send_notification':
        // Build trigger config for SendNotificationConfigPanel
        let notifyTriggerConfig = null;
        
        // From triggers prop
        if (triggers && triggers.length > 0) {
          const tc = triggers[0]?.config || triggers[0] || {};
          const entity = tc.entity || tc.object || tc.trigger_object;
          if (entity) {
            notifyTriggerConfig = { entity, ...tc };
          }
        }
        
        // From nodes array (find trigger/start node)
        if (!notifyTriggerConfig && nodes && nodes.length > 0) {
          const triggerNode = nodes.find(n => n.type === 'trigger' || n.type === 'start' || n.id?.includes('trigger'));
          if (triggerNode) {
            const cfg1 = triggerNode.data?.config || {};
            const cfg2 = triggerNode.config || {};
            const entity = cfg1.entity || cfg1.object || cfg1.trigger_object ||
                          cfg2.entity || cfg2.object || cfg2.trigger_object;
            if (entity) {
              notifyTriggerConfig = { entity, ...cfg1, ...cfg2 };
            }
          }
        }
        
        return (
          <SendNotificationConfigPanel
            config={config}
            handleConfigChange={handleConfigChange}
            context={{
              triggerConfig: notifyTriggerConfig,
              previousNodes: nodes?.filter(n => n.id !== node?.id),
              crmObjects
            }}
          />
        );

      case 'mcp':
        return (
          <div className="space-y-4">
            {/* Loop Context Notice */}
            {isInsideLoop && loopObjectName && (
              <div className="bg-amber-50 border border-amber-300 rounded-lg p-3 mb-2">
                <p className="text-sm text-amber-900 font-semibold flex items-center gap-2">
                  <span>🔁</span> Inside Loop Context
                </p>
                <p className="text-xs text-amber-700 mt-1">
                  This action runs for each <strong>{loopObjectName}</strong> in the collection.
                  You can reference current item fields using <code className="bg-amber-100 px-1 rounded">{'{{' + loopObjectName + '_fieldname}}'}</code>
                </p>
              </div>
            )}

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
              <p className="text-sm text-blue-800 font-medium">🔄 CRM Action Node</p>
              <p className="text-xs text-blue-600 mt-1">
                Perform create, update, get, or delete operations on CRM records.
              </p>
            </div>

            {/* Action Type Dropdown */}
            <div>
              <Label>Action Type</Label>
              <Select
                value={config.action_type || 'create'}
                onValueChange={(value) => {
                  setConfig({ 
                    ...config, 
                    action_type: value,
                    // Clear field_values when changing action type
                    field_values: value === 'create' || value === 'update' ? [{ field: '', value: '' }] : undefined,
                    // Clear record_id when changing to create
                    record_id: value === 'create' ? undefined : config.record_id,
                    // Clear filter_conditions when not get
                    filter_conditions: value === 'get' ? [{ field: '', operator: 'equals', value: '' }] : undefined
                  });
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select action type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="create">Create Record</SelectItem>
                  <SelectItem value="update">Update Record</SelectItem>
                  <SelectItem value="get">Get Record</SelectItem>
                  <SelectItem value="delete">Delete Record</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-slate-500 mt-1">
                {config.action_type === 'create' && '➕ Create a new record'}
                {config.action_type === 'update' && '✏️ Update an existing record'}
                {config.action_type === 'get' && '🔍 Retrieve record(s) by filters'}
                {config.action_type === 'delete' && '🗑️ Delete an existing record'}
              </p>
            </div>

            {/* Label and API Name in a row */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Label</Label>
                <Input
                  className="w-full"
                  value={config.label || ''}
                  onChange={(e) => {
                    const newLabel = e.target.value;
                    const currentApiName = config.api_name || '';
                    const oldAutoGeneratedApiName = generateApiName(config.label || '');
                    
                    // Auto-generate API name only if it's empty or matches the previous auto-generated value
                    const shouldAutoGenerate = !currentApiName || currentApiName === oldAutoGeneratedApiName;
                    
                    setConfig({ 
                      ...config, 
                      label: newLabel,
                      api_name: shouldAutoGenerate ? generateApiName(newLabel) : currentApiName
                    });
                  }}
                  placeholder="e.g., Update Lead Status"
                />
              </div>
              <div>
                <Label>API Name</Label>
                <Input
                  className="w-full font-mono bg-slate-50"
                  value={config.api_name || ''}
                  onChange={(e) => setConfig({ ...config, api_name: e.target.value })}
                  placeholder="e.g., update_lead_status"
                />
              </div>
            </div>

            {/* Description */}
            <div>
              <Label>Description</Label>
              <Textarea
                className="w-full"
                value={config.description || ''}
                onChange={(e) => setConfig({ ...config, description: e.target.value })}
                placeholder="Describe what this action does..."
                rows={3}
              />
            </div>

            {/* Object - Searchable */}
            <div>
              <Label>Object</Label>
              <SearchableObjectSelect
                value={config.object || ''}
                onChange={async (value) => {
                  console.log('🔵 Object selected:', value);
                  
                  // For Create action, fetch and auto-create rows for required fields
                  if (value && fetchFieldsForObject && config.action_type === 'create') {
                    console.log('🔵 Fetching fields for:', value);
                    const fields = await fetchFieldsForObject(value);
                    console.log('🔵 Fetched', fields.length, 'fields:', fields);
                    
                    const requiredFields = fields.filter(field => field.is_required === true);
                    console.log('🔵 Required fields found:', requiredFields.length, requiredFields);
                    
                    if (requiredFields.length > 0) {
                      const newFieldValues = requiredFields.map(field => ({
                        field: field.name,
                        value: ''
                      }));
                      console.log('✅ Creating', newFieldValues.length, 'rows for required fields');
                      
                      setConfig(prev => ({
                        ...prev,
                        object: value,
                        field_values: newFieldValues
                      }));
                    } else {
                      setConfig(prev => ({
                        ...prev,
                        object: value,
                        field_values: [{ field: '', value: '' }]
                      }));
                    }
                  } else {
                    setConfig(prev => ({
                      ...prev,
                      object: value
                    }));
                  }
                }}
                objects={objectsList}
                placeholder="Search objects"
              />
              <p className="text-xs text-slate-500 mt-1">Select the CRM object to perform action on</p>
            </div>

            {/* Conditional Fields Based on Action Type */}
            {(
              <>
                {/* CREATE RECORD - Show field values */}
                {(config.action_type === 'create' || !config.action_type) && config.object && (
                  <div className="space-y-3">
                    {/* How to set record field values */}
                    <div>
                      <Label>How to set record field values</Label>
                      <Select
                        value={config.set_values_mode || 'manually'}
                        onValueChange={(value) => setConfig({ ...config, set_values_mode: value })}
                        disabled
                      >
                        <SelectTrigger className="w-full bg-slate-50">
                          <SelectValue placeholder="Select mode" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="manually">Manually</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-slate-500 mt-1">Currently only manual field mapping is supported</p>
                    </div>

                    <Label className="text-sm font-medium">Set Field Values</Label>
                    
                    {/* Formula Help for Create Record */}
                    <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-xs mb-2">
                      <p className="font-semibold text-green-900 mb-2">💡 You can use formulas and variables:</p>
                      <ul className="space-y-1 text-green-800">
                        <li>• <strong>Variables:</strong> <code className="bg-green-100 px-1 rounded">oppName</code>, <code className="bg-green-100 px-1 rounded">oppCloseDate</code></li>
                        <li>• <strong>Trigger fields:</strong> <code className="bg-green-100 px-1 rounded">Trigger.Lead.FirstName</code></li>
                        <li>• <strong>String concat:</strong> <code className="bg-green-100 px-1 rounded">"Score=" + score + " FollowUp=" + nextDate</code></li>
                        <li>• <strong>Date formulas:</strong> <code className="bg-green-100 px-1 rounded">TODAY() + 7</code>, <code className="bg-green-100 px-1 rounded">NOW()</code></li>
                        <li>• <strong>Arithmetic:</strong> <code className="bg-green-100 px-1 rounded">Trigger.Opportunity.Amount / 100</code></li>
                      </ul>
                    </div>
                    
                    {/* Column Headers */}
                    <div className="grid grid-cols-2 gap-2 px-3">
                      <div className="text-xs font-medium text-slate-600">Field</div>
                      <div className="text-xs font-medium text-slate-600">Value</div>
                    </div>
                    
                    {(config.field_values || [{ field: '', value: '' }]).map((fieldValue, index) => (
                      <div key={index} className="flex items-start gap-2 p-3 bg-slate-50 rounded-md border border-slate-200">
                        <div className="flex-1 grid grid-cols-2 gap-2">
                          <div>
                            <SearchableObjectSelect
                              value={fieldValue.field || ''}
                              onChange={(value) => {
                                const newFieldValues = [...(config.field_values || [])];
                                newFieldValues[index] = { ...newFieldValues[index], field: value };
                                setConfig({ ...config, field_values: newFieldValues });
                              }}
                              objects={availableFields.length > 0 ? availableFields : [
                                { name: 'name', label: 'Name' },
                                { name: 'status', label: 'Status' },
                              ]}
                              placeholder="Search fields"
                            />
                          </div>
                          <div>
                            <ExpressionBuilder
                              value={fieldValue.value || ''}
                              onChange={(value) => {
                                const newFieldValues = [...(config.field_values || [])];
                                newFieldValues[index] = { ...newFieldValues[index], value: value };
                                setConfig({ ...config, field_values: newFieldValues });
                              }}
                              availableVariables={[
                                ...flowVariables.map(v => ({ path: v.name, label: v.name, type: v.type })),
                                ...availableFields.map(f => ({ path: `Trigger.${triggerEntity}.${f.name}`, label: `Trigger: ${f.label || f.name}`, type: f.type }))
                              ]}
                              label=""
                              placeholder="Enter value or build expression..."
                              showPreview={false}
                            />
                          </div>
                        </div>
                        {(config.field_values || []).length > 1 && (() => {
                          const currentField = availableFields.find(f => f.name === fieldValue.field);
                          const isRequired = currentField?.is_required === true;
                          return (
                            <button
                              type="button"
                              onClick={() => {
                                if (!isRequired) {
                                  const newFieldValues = (config.field_values || []).filter((_, i) => i !== index);
                                  setConfig({ ...config, field_values: newFieldValues });
                                }
                              }}
                              disabled={isRequired}
                              className={`mt-0.5 p-2 rounded-md transition-colors ${
                                isRequired ? 'text-gray-300 cursor-not-allowed' : 'text-red-600 hover:bg-red-50'
                              }`}
                              title={isRequired ? "Cannot delete required field" : "Delete field"}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          );
                        })()}
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const newFieldValues = [...(config.field_values || []), { field: '', value: '' }];
                        setConfig({ ...config, field_values: newFieldValues });
                      }}
                      className="w-full border-dashed border-2 hover:border-indigo-400 hover:bg-indigo-50"
                    >
                      <span className="text-indigo-600 font-medium">+ Add Field</span>
                    </Button>
                  </div>
                )}

                {/* UPDATE RECORD - Show filter conditions + field values */}
                {config.action_type === 'update' && config.object && (
                  <div className="space-y-3">
                    {/* Update Mode Selection */}
                    <div>
                      <Label className="text-sm font-semibold text-slate-700">Update Mode</Label>
                      <Select
                        value={config.update_mode || 'filter'}
                        onValueChange={(value) => setConfig({ 
                          ...config, 
                          update_mode: value, 
                          record_source: value === 'reference' ? 'reference' : value === 'loop' ? 'loop' : undefined 
                        })}
                      >
                        <SelectTrigger className="w-full mt-1.5">
                          <SelectValue placeholder="Select update mode" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="filter">
                            <div className="flex flex-col py-1">
                              <span className="font-medium">Use Filter Conditions</span>
                              <span className="text-xs text-slate-500">Find and update records matching specific criteria</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="reference">
                            <div className="flex flex-col py-1">
                              <span className="font-medium">Update via Reference Field</span>
                              <span className="text-xs text-slate-500">Update parent record via reference (e.g., Opportunity → Account)</span>
                            </div>
                          </SelectItem>
                          {/* Record from Loop - only show if inside a loop context */}
                          <SelectItem value="loop">
                            <div className="flex flex-col py-1">
                              <span className="font-medium">🔁 Record from Loop</span>
                              <span className="text-xs text-slate-500">Update the current item in a loop iteration</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="collection">
                            <div className="flex flex-col py-1">
                              <span className="font-medium">Update from Collection</span>
                              <span className="text-xs text-slate-500">Bulk update records from a collection variable</span>
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-slate-500 mt-1.5">
                        {config.update_mode === 'collection' 
                          ? 'Update multiple records from a collection created during flow execution (e.g., from a loop)'
                          : config.update_mode === 'reference'
                          ? 'Update a parent record using a reference field (e.g., update Account via Opportunity.AccountId)'
                          : config.update_mode === 'loop'
                          ? 'Update the current record in a loop iteration (uses $CurrentItem.Id automatically)'
                          : 'Find and update records using filter conditions'}
                      </p>
                    </div>

                    {/* Record from Loop Info - Show only if update_mode is 'loop' */}
                    {config.update_mode === 'loop' && (
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                        <div className="flex items-center gap-2 text-amber-800 font-medium mb-2">
                          <span>🔁</span> Record from Loop
                        </div>
                        <p className="text-sm text-amber-700">
                          This will update the <strong>current item</strong> in the loop iteration.
                          The record ID is automatically resolved from <code className="bg-amber-100 px-1 rounded">$CurrentItem.Id</code>.
                        </p>
                        {isInsideLoop && loopObjectName ? (
                          <p className="text-sm text-green-700 mt-2">
                            ✅ Inside loop - will update each <strong>{loopObjectName}</strong> in the collection.
                          </p>
                        ) : (
                          <p className="text-sm text-orange-700 mt-2">
                            ⚠️ This node should be placed inside a Loop node&apos;s &quot;For Each&quot; branch.
                          </p>
                        )}
                      </div>
                    )}

                    {/* Reference Field Selection - Show only if update_mode is 'reference' */}
                    {config.update_mode === 'reference' && (
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
                        <div>
                          <Label className="text-sm font-semibold text-slate-700">Target Object to Update</Label>
                          <Select
                            value={config.target_object || ''}
                            onValueChange={(value) => setConfig({ ...config, target_object: value })}
                          >
                            <SelectTrigger className="w-full mt-1.5">
                              <SelectValue placeholder="Select target object" />
                            </SelectTrigger>
                            <SelectContent>
                              {objectsList.map(obj => {
                                const objName = typeof obj === 'string' ? obj : (obj.name || obj.label);
                                return (
                                  <SelectItem key={objName} value={objName.toLowerCase()}>
                                    {objName.charAt(0).toUpperCase() + objName.slice(1)}
                                  </SelectItem>
                                );
                              })}
                            </SelectContent>
                          </Select>
                        </div>
                        
                        <div>
                          <Label className="text-sm font-semibold text-slate-700">Reference Field (from Trigger)</Label>
                          <Select
                            value={config.reference_field || ''}
                            onValueChange={(value) => setConfig({ ...config, reference_field: value })}
                          >
                            <SelectTrigger className="w-full mt-1.5">
                              <SelectValue placeholder="Select reference field" />
                            </SelectTrigger>
                            <SelectContent>
                              {/* Common reference fields based on trigger entity */}
                              {triggerEntity && (
                                <>
                                  <SelectItem value={`Trigger.${triggerEntity}.AccountId`}>
                                    {triggerEntity} → AccountId (Account)
                                  </SelectItem>
                                  <SelectItem value={`Trigger.${triggerEntity}.account_id`}>
                                    {triggerEntity} → account_id (Account)
                                  </SelectItem>
                                  <SelectItem value={`Trigger.${triggerEntity}.ContactId`}>
                                    {triggerEntity} → ContactId (Contact)
                                  </SelectItem>
                                  <SelectItem value={`Trigger.${triggerEntity}.OwnerId`}>
                                    {triggerEntity} → OwnerId (User)
                                  </SelectItem>
                                  <SelectItem value={`Trigger.${triggerEntity}.CampaignId`}>
                                    {triggerEntity} → CampaignId (Campaign)
                                  </SelectItem>
                                  <SelectItem value={`Trigger.${triggerEntity}.ParentId`}>
                                    {triggerEntity} → ParentId (Parent)
                                  </SelectItem>
                                </>
                              )}
                            </SelectContent>
                          </Select>
                          <p className="text-xs text-blue-700 mt-2 bg-blue-100/50 p-2 rounded">
                            💡 <strong>Example:</strong> To update the Account when an Opportunity changes, select &quot;Trigger.Opportunity.AccountId&quot; as the reference field and &quot;Account&quot; as the target object.
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Collection Variable Selection - Show only if update_mode is 'collection' */}
                    {config.update_mode === 'collection' && (
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                        <Label className="text-sm font-semibold text-slate-700">Collection Variable</Label>
                        <ComboField
                          value={config.collection_variable || ''}
                          onChange={(value) => setConfig({ ...config, collection_variable: value })}
                          options={(() => {
                            const collections = [];
                            
                            // Get collection variables from previous Assignment nodes (add_to_collection operator)
                            previousNodes.forEach(node => {
                              const nodeConfig = node.data?.config || {};
                              
                              // Check if it's an assignment node with add_to_collection operator
                              if (node.data?.nodeType === 'assignment' || node.type === 'assignment') {
                                const assignments = nodeConfig.assignments || [];
                                assignments.forEach(assignment => {
                                  if (assignment.operator === 'add_to_collection' && assignment.variable) {
                                    // This is a collection variable
                                    collections.push({
                                      value: `{{${assignment.variable}}}`,
                                      label: assignment.variable,
                                      description: `Collection from ${node.data?.label || 'Assignment'}`
                                    });
                                  }
                                });
                              }
                            });
                            
                            // If no collections found, show helpful message
                            if (collections.length === 0) {
                              collections.push({
                                value: '',
                                label: 'No collections found',
                                description: 'Create a collection using "Add to Collection" in an Assignment node'
                              });
                            }
                            
                            return collections;
                          })()}
                          placeholder="Select collection variable..."
                          allowCustom={true}
                        />
                        <p className="text-xs text-amber-700 mt-2 bg-amber-100/50 p-2 rounded">
                          💡 <strong>Tip:</strong> Collections are created using the "Add to Collection" operator in Assignment nodes (usually inside loops).
                        </p>
                        {previousNodes.filter(n => n.data?.nodeType === 'assignment' || n.type === 'assignment').length === 0 && (
                          <p className="text-xs text-red-600 mt-2 bg-red-50 p-2 rounded border border-red-200">
                            ⚠️ <strong>No assignment nodes found.</strong> Add an Assignment node with "Add to Collection" operator before this node.
                          </p>
                        )}
                      </div>
                    )}

                    {/* How to set record field values */}
                    <div>
                      <Label>How to set record field values</Label>
                      <Select
                        value={config.set_values_mode || 'manually'}
                        onValueChange={(value) => setConfig({ ...config, set_values_mode: value })}
                        disabled
                      >
                        <SelectTrigger className="w-full bg-slate-50">
                          <SelectValue placeholder="Select mode" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="manually">Manually</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-slate-500 mt-1">Currently only manual field mapping is supported</p>
                    </div>

                    {/* Filter Conditions to Find Record - Show only if update_mode is 'filter' (default) */}
                    {config.update_mode !== 'collection' && config.update_mode !== 'reference' && config.update_mode !== 'loop' && (
                      <div className="space-y-3">
                        <Label className="text-sm font-medium">Filter Conditions to Find Record</Label>
                        <p className="text-xs text-slate-500">Specify conditions to find the record(s) to update. Click ▶ on reference fields to access parent object fields.</p>
                        
                        <div className="grid grid-cols-3 gap-2 px-3">
                          <div className="text-xs font-medium text-slate-600">Field</div>
                          <div className="text-xs font-medium text-slate-600">Operator</div>
                          <div className="text-xs font-medium text-slate-600">Value</div>
                        </div>
                        
                        {(config.filter_conditions || [{ field: '', operator: 'equals', value: '' }]).map((condition, index) => (
                          <div key={index} className="flex items-start gap-2 p-3 bg-slate-50 rounded-md border border-slate-200">
                            <div className="flex-1 grid grid-cols-3 gap-2">
                              <div>
                                {/* Reference-aware field picker with dot-walk support */}
                                <ReferenceFieldPicker
                                  value={condition.field || ''}
                                  onChange={(value) => {
                                    const newConditions = [...(config.filter_conditions || [])];
                                    newConditions[index] = { ...newConditions[index], field: value };
                                    setConfig({ ...config, filter_conditions: newConditions });
                                  }}
                                  objectName={config.object}
                                  fetchFieldsForObject={fetchFieldsForObject}
                                  placeholder="Select field"
                                  allowDotWalk={true}
                                  maxDepth={3}
                                />
                              </div>
                              <div>
                                <Select
                                  value={condition.operator || 'equals'}
                                  onValueChange={(value) => {
                                    const newConditions = [...(config.filter_conditions || [])];
                                    newConditions[index] = { ...newConditions[index], operator: value };
                                    setConfig({ ...config, filter_conditions: newConditions });
                                  }}
                                >
                                  <SelectTrigger className="w-full">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="equals">Equals</SelectItem>
                                    <SelectItem value="notEquals">Not Equals</SelectItem>
                                    <SelectItem value="contains">Contains</SelectItem>
                                    <SelectItem value="startsWith">Starts With</SelectItem>
                                    <SelectItem value="endsWith">Ends With</SelectItem>
                                    <SelectItem value="greaterThan">Greater Than</SelectItem>
                                    <SelectItem value="lessThan">Less Than</SelectItem>
                                    <SelectItem value="greaterThanOrEqual">Greater or Equal</SelectItem>
                                    <SelectItem value="lessThanOrEqual">Less or Equal</SelectItem>
                                    <SelectItem value="isNull">Is Null</SelectItem>
                                    <SelectItem value="isNotNull">Is Not Null</SelectItem>
                                    {/* Date-specific operators */}
                                    <SelectItem value="_date_divider" disabled className="px-2 py-1 text-[10px] text-slate-400 border-t mt-1 cursor-default">Date Filters</SelectItem>
                                    <SelectItem value="last_x_days">📅 Last X Days</SelectItem>
                                    <SelectItem value="next_x_days">📅 Next X Days</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div>
                                {/* Show numeric input for Last X Days / Next X Days operators */}
                                {(condition.operator === 'last_x_days' || condition.operator === 'next_x_days') ? (
                                  <div className="flex items-center gap-2">
                                    <Input
                                      type="number"
                                      min="1"
                                      max="365"
                                      value={condition.value || '7'}
                                      onChange={(e) => {
                                        const newConditions = [...(config.filter_conditions || [])];
                                        newConditions[index] = { ...newConditions[index], value: e.target.value };
                                        setConfig({ ...config, filter_conditions: newConditions });
                                      }}
                                      className="w-20"
                                      placeholder="Days"
                                    />
                                    <span className="text-sm text-slate-500">days</span>
                                  </div>
                                ) : (
                                <ResourcePickerField
                                  value={condition.value || ''}
                                  onChange={(value) => {
                                    const newConditions = [...(config.filter_conditions || [])];
                                    newConditions[index] = { ...newConditions[index], value: value };
                                    setConfig({ ...config, filter_conditions: newConditions });
                                  }}
                                  nodes={previousNodes}
                                  availableFields={availableFields}
                                  fetchFieldsForObject={fetchFieldsForObject}
                                  flowVariables={flowVariables}
                                  disabled={condition.operator === 'isNull' || condition.operator === 'isNotNull'}
                                />
                                )}
                              </div>
                            </div>
                            {(config.filter_conditions || []).length > 1 && (
                              <button
                                type="button"
                                onClick={() => {
                                  const newConditions = (config.filter_conditions || []).filter((_, i) => i !== index);
                                  setConfig({ ...config, filter_conditions: newConditions });
                                }}
                                className="mt-0.5 p-2 text-red-600 hover:bg-red-50 rounded-md"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        ))}
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const newConditions = [...(config.filter_conditions || []), { field: '', operator: 'equals', value: '' }];
                            setConfig({ ...config, filter_conditions: newConditions });
                          }}
                          className="w-full border-dashed border-2 hover:border-indigo-400 hover:bg-indigo-50"
                        >
                          <span className="text-indigo-600 font-medium">+ Add Condition</span>
                        </Button>
                      </div>
                    )}

                    {/* Update Field Values */}
                    <Label className="text-sm font-medium">
                      Update Field Values
                      {config.update_mode === 'reference' && config.target_object && (
                        <span className="ml-2 text-indigo-600 font-normal">
                          ({config.target_object.charAt(0).toUpperCase() + config.target_object.slice(1)} fields)
                        </span>
                      )}
                    </Label>
                    
                    {/* Formula Help for Update Record */}
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs mb-2">
                      <p className="font-semibold text-blue-900 mb-2">💡 You can use formulas and variables:</p>
                      <ul className="space-y-1 text-blue-800">
                        <li>• <strong>String concat:</strong> <code className="bg-blue-100 px-1 rounded">"Score=" + score + " FollowUp=" + nextDate</code></li>
                        <li>• <strong>Variables:</strong> <code className="bg-blue-100 px-1 rounded">newStage</code>, <code className="bg-blue-100 px-1 rounded">score</code></li>
                        <li>• <strong>Trigger fields:</strong> <code className="bg-blue-100 px-1 rounded">Trigger.Opportunity.Amount</code></li>
                        <li>• <strong>Arithmetic:</strong> <code className="bg-blue-100 px-1 rounded">Trigger.Opportunity.Amount / 100</code></li>
                        <li>• <strong>Date formulas:</strong> <code className="bg-blue-100 px-1 rounded">TODAY() + 3</code></li>
                      </ul>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2 px-3">
                      <div className="text-xs font-medium text-slate-600">Field</div>
                      <div className="text-xs font-medium text-slate-600">New Value</div>
                    </div>
                    
                    {(config.field_values || [{ field: '', value: '' }]).map((fieldValue, index) => {
                      // Determine which object to use for field picker
                      // In reference mode, use target_object. Otherwise use selected object.
                      const objectForFieldPicker = config.update_mode === 'reference' 
                        ? config.target_object 
                        : config.object;
                      
                      return (
                        <div key={index} className="flex items-start gap-2 p-3 bg-slate-50 rounded-md border border-slate-200">
                          <div className="flex-1 grid grid-cols-2 gap-2">
                            <div>
                              {/* Reference-aware field picker with dot-walk support */}
                              <ReferenceFieldPicker
                                value={fieldValue.field || ''}
                                onChange={(value) => {
                                  const newFieldValues = [...(config.field_values || [])];
                                  newFieldValues[index] = { ...newFieldValues[index], field: value };
                                  setConfig({ ...config, field_values: newFieldValues });
                                }}
                                objectName={objectForFieldPicker}
                                fetchFieldsForObject={fetchFieldsForObject}
                                placeholder="Select field"
                                allowDotWalk={true}
                                maxDepth={3}
                              />
                            </div>
                            <div>
                              <ExpressionBuilder
                                value={fieldValue.value || ''}
                                onChange={(value) => {
                                  const newFieldValues = [...(config.field_values || [])];
                                  newFieldValues[index] = { ...newFieldValues[index], value: value };
                                  setConfig({ ...config, field_values: newFieldValues });
                                }}
                                availableVariables={[
                                  ...flowVariables.map(v => ({ path: v.name, label: v.name, type: v.type })),
                                  ...availableFields.map(f => ({ path: `Trigger.${triggerEntity}.${f.name}`, label: `Trigger: ${f.label || f.name}`, type: f.type }))
                                ]}
                                label=""
                                placeholder="Enter value or build expression..."
                                showPreview={false}
                              />
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              const newFieldValues = (config.field_values || []).filter((_, i) => i !== index);
                              setConfig({ ...config, field_values: newFieldValues });
                            }}
                            className="mt-0.5 p-2 text-red-600 hover:bg-red-50 rounded-md"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      );
                    })}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const newFieldValues = [...(config.field_values || []), { field: '', value: '' }];
                        setConfig({ ...config, field_values: newFieldValues });
                      }}
                      className="w-full border-dashed border-2 hover:border-indigo-400 hover:bg-indigo-50"
                    >
                      <span className="text-indigo-600 font-medium">+ Add Field</span>
                    </Button>
                  </div>
                )}

                {/* GET RECORD - Show ONLY after object selection */}
                {config.action_type === 'get' && config.object && (
                  <div className="space-y-4">
                    {/* Filter Conditions - Show first, right after object selection */}
                    <div className="space-y-3">
                      <Label className="text-sm font-medium">Filter Conditions</Label>
                      <p className="text-xs text-slate-500">Specify conditions to find the record(s)</p>
                      
                      <div className="grid grid-cols-3 gap-2 px-3">
                        <div className="text-xs font-medium text-slate-600">Field</div>
                        <div className="text-xs font-medium text-slate-600">Operator</div>
                        <div className="text-xs font-medium text-slate-600">Value</div>
                      </div>
                      
                      {(config.filter_conditions || [{ field: '', operator: 'equals', value: '' }]).map((condition, index) => (
                        <div key={index} className="flex items-start gap-2 p-3 bg-slate-50 rounded-md border border-slate-200">
                          <div className="flex-1 grid grid-cols-3 gap-2">
                            <div>
                              {/* Reference-aware field picker with dot-walk support */}
                              <ReferenceFieldPicker
                                value={condition.field || ''}
                                onChange={(value) => {
                                  const newConditions = [...(config.filter_conditions || [])];
                                  newConditions[index] = { ...newConditions[index], field: value };
                                  setConfig({ ...config, filter_conditions: newConditions });
                                }}
                                objectName={config.entity || config.object}
                                fetchFieldsForObject={fetchFieldsForObject}
                                placeholder="Select field"
                                allowDotWalk={true}
                                maxDepth={3}
                              />
                            </div>
                            <div>
                              <Select
                                value={condition.operator || 'equals'}
                                onValueChange={(value) => {
                                  const newConditions = [...(config.filter_conditions || [])];
                                  newConditions[index] = { ...newConditions[index], operator: value };
                                  setConfig({ ...config, filter_conditions: newConditions });
                                }}
                              >
                                <SelectTrigger className="w-full">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="equals">Equals</SelectItem>
                                  <SelectItem value="notEquals">Not Equals</SelectItem>
                                  <SelectItem value="contains">Contains</SelectItem>
                                  <SelectItem value="startsWith">Starts With</SelectItem>
                                  <SelectItem value="endsWith">Ends With</SelectItem>
                                  <SelectItem value="greaterThan">Greater Than</SelectItem>
                                  <SelectItem value="lessThan">Less Than</SelectItem>
                                  <SelectItem value="greaterThanOrEqual">Greater or Equal</SelectItem>
                                  <SelectItem value="lessThanOrEqual">Less or Equal</SelectItem>
                                  <SelectItem value="isNull">Is Null</SelectItem>
                                  <SelectItem value="isNotNull">Is Not Null</SelectItem>
                                  {/* Date-specific operators */}
                                  <SelectItem value="_date_divider" disabled className="px-2 py-1 text-[10px] text-slate-400 border-t mt-1 cursor-default">Date Filters</SelectItem>
                                  <SelectItem value="last_x_days">📅 Last X Days</SelectItem>
                                  <SelectItem value="next_x_days">📅 Next X Days</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              {/* Show numeric input for Last X Days / Next X Days operators */}
                              {(condition.operator === 'last_x_days' || condition.operator === 'next_x_days') ? (
                                <div className="flex items-center gap-2">
                                  <Input
                                    type="number"
                                    min="1"
                                    max="365"
                                    value={condition.value || '7'}
                                    onChange={(e) => {
                                      const newConditions = [...(config.filter_conditions || [])];
                                      newConditions[index] = { ...newConditions[index], value: e.target.value };
                                      setConfig({ ...config, filter_conditions: newConditions });
                                    }}
                                    className="w-20"
                                    placeholder="Days"
                                  />
                                  <span className="text-sm text-slate-500">days</span>
                                </div>
                              ) : (
                              <ResourcePickerField
                                value={condition.value || ''}
                                onChange={(value) => {
                                  const newConditions = [...(config.filter_conditions || [])];
                                  newConditions[index] = { ...newConditions[index], value: value };
                                  setConfig({ ...config, filter_conditions: newConditions });
                                }}
                                nodes={previousNodes}
                                availableFields={availableFields}
                                fetchFieldsForObject={fetchFieldsForObject}
                                flowVariables={flowVariables}
                                disabled={condition.operator === 'isNull' || condition.operator === 'isNotNull'}
                              />
                              )}
                            </div>
                          </div>
                          {(config.filter_conditions || []).length > 1 && (
                            <button
                              type="button"
                              onClick={() => {
                                const newConditions = (config.filter_conditions || []).filter((_, i) => i !== index);
                                setConfig({ ...config, filter_conditions: newConditions });
                              }}
                              className="mt-0.5 p-2 text-red-600 hover:bg-red-50 rounded-md"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      ))}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const newConditions = [...(config.filter_conditions || []), { field: '', operator: 'equals', value: '' }];
                          setConfig({ ...config, filter_conditions: newConditions });
                        }}
                        className="w-full border-dashed border-2 hover:border-indigo-400 hover:bg-indigo-50"
                      >
                        <span className="text-indigo-600 font-medium">+ Add Condition</span>
                      </Button>
                    </div>

                    {/* How Many Records to Store */}
                    <div>
                      <Label>How Many Records to Store</Label>
                      <Select
                        value={config.records_to_store || 'first'}
                        onValueChange={(value) => setConfig({ ...config, records_to_store: value })}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select option" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="first">Only the first record</SelectItem>
                          <SelectItem value="all">All records</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-slate-500 mt-1">
                        {config.records_to_store === 'all' 
                          ? 'Store all matching records (up to 200 records)'
                          : 'Store only the first matching record'}
                      </p>
                    </div>

                    {/* How to Store Record Data */}
                    <div>
                      <Label>How to Store Record Data</Label>
                      <Select
                        value={config.store_mode || 'automatic'}
                        onValueChange={(value) => setConfig({ ...config, store_mode: value })}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select mode" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="automatic">Automatically store all fields</SelectItem>
                          <SelectItem value="manual">Choose fields to store</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-slate-500 mt-1">
                        {config.store_mode === 'manual' 
                          ? 'Manually select which fields to store'
                          : 'All fields will be available in variables'}
                      </p>
                    </div>

                    {/* Fields to Store - Only show if manual mode */}
                    {config.store_mode === 'manual' && (
                      <div>
                        <Label>Fields to Store</Label>
                        <p className="text-xs text-slate-500 mb-2">Select specific fields to store in variables</p>
                        <div className="space-y-2">
                          {(config.fields_to_store || ['']).map((field, index) => (
                            <div key={index} className="flex gap-2">
                              <SearchableObjectSelect
                                value={field || ''}
                                onChange={(value) => {
                                  const newFields = [...(config.fields_to_store || [])];
                                  newFields[index] = value;
                                  setConfig({ ...config, fields_to_store: newFields });
                                }}
                                objects={availableFields}
                                placeholder="Select field"
                              />
                              {(config.fields_to_store || []).length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const newFields = (config.fields_to_store || []).filter((_, i) => i !== index);
                                    setConfig({ ...config, fields_to_store: newFields });
                                  }}
                                  className="p-2 text-red-600 hover:bg-red-50 rounded-md"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              )}
                            </div>
                          ))}
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const newFields = [...(config.fields_to_store || []), ''];
                              setConfig({ ...config, fields_to_store: newFields });
                            }}
                            className="w-full border-dashed border-2 hover:border-indigo-400 hover:bg-indigo-50"
                          >
                            <span className="text-indigo-600 font-medium">+ Add Field</span>
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Sort Order */}
                    <div>
                      <Label>Sort Order</Label>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <SearchableObjectSelect
                            value={config.sort_field || ''}
                            onChange={(value) => setConfig({ ...config, sort_field: value })}
                            objects={[
                              { name: '', label: 'No Sort' },
                              ...availableFields
                            ]}
                            placeholder="Sort by field"
                          />
                        </div>
                        <div>
                          <Select
                            value={config.sort_direction || 'asc'}
                            onValueChange={(value) => setConfig({ ...config, sort_direction: value })}
                            disabled={!config.sort_field}
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Direction" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="asc">Ascending</SelectItem>
                              <SelectItem value="desc">Descending</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">Optional: Sort results by a specific field</p>
                    </div>

                    {/* When No Records Are Found */}
                    <div>
                      <Label>When No Records Are Found</Label>
                      <Select
                        value={config.no_records_action || 'continue'}
                        onValueChange={(value) => setConfig({ ...config, no_records_action: value })}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select action" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="continue">Continue flow execution</SelectItem>
                          <SelectItem value="stop">Stop flow with error</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-slate-500 mt-1">
                        {config.no_records_action === 'stop' 
                          ? 'Flow will stop if no records match the conditions'
                          : 'Flow will continue even if no records are found'}
                      </p>
                    </div>
                  </div>
                )}

                {/* DELETE RECORD - Show filter conditions */}
                {config.action_type === 'delete' && config.object && (
                  <div className="space-y-3">
                    <Label className="text-sm font-medium">Filter Conditions to Find Record</Label>
                    <p className="text-xs text-slate-500">Specify conditions to find the record(s) to delete</p>
                    
                    <div className="grid grid-cols-3 gap-2 px-3">
                      <div className="text-xs font-medium text-slate-600">Field</div>
                      <div className="text-xs font-medium text-slate-600">Operator</div>
                      <div className="text-xs font-medium text-slate-600">Value</div>
                    </div>
                    
                    {(config.filter_conditions || [{ field: '', operator: 'equals', value: '' }]).map((condition, index) => (
                      <div key={index} className="flex items-start gap-2 p-3 bg-slate-50 rounded-md border border-slate-200">
                        <div className="flex-1 grid grid-cols-3 gap-2">
                          <div>
                            <SearchableObjectSelect
                              value={condition.field || ''}
                              onChange={(value) => {
                                const newConditions = [...(config.filter_conditions || [])];
                                newConditions[index] = { ...newConditions[index], field: value };
                                setConfig({ ...config, filter_conditions: newConditions });
                              }}
                              objects={availableFields}
                              placeholder="Field"
                            />
                          </div>
                          <div>
                            <Select
                              value={condition.operator || 'equals'}
                              onValueChange={(value) => {
                                const newConditions = [...(config.filter_conditions || [])];
                                newConditions[index] = { ...newConditions[index], operator: value };
                                setConfig({ ...config, filter_conditions: newConditions });
                              }}
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="equals">Equals</SelectItem>
                                <SelectItem value="notEquals">Not Equals</SelectItem>
                                <SelectItem value="contains">Contains</SelectItem>
                                <SelectItem value="greaterThan">Greater Than</SelectItem>
                                <SelectItem value="lessThan">Less Than</SelectItem>
                                <SelectItem value="isNull">Is Null</SelectItem>
                                <SelectItem value="isNotNull">Is Not Null</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <ResourcePickerField
                              value={condition.value || ''}
                              onChange={(value) => {
                                const newConditions = [...(config.filter_conditions || [])];
                                newConditions[index] = { ...newConditions[index], value: value };
                                setConfig({ ...config, filter_conditions: newConditions });
                              }}
                              nodes={previousNodes}
                              availableFields={availableFields}
                              fetchFieldsForObject={fetchFieldsForObject}
                          flowVariables={flowVariables}
                              disabled={condition.operator === 'isNull' || condition.operator === 'isNotNull'}
                              placeholder="Type or select value..."
                              showCommonValues={true}
                            />
                          </div>
                        </div>
                        {(config.filter_conditions || []).length > 1 && (
                          <button
                            type="button"
                            onClick={() => {
                              const newConditions = (config.filter_conditions || []).filter((_, i) => i !== index);
                              setConfig({ ...config, filter_conditions: newConditions });
                            }}
                            className="mt-0.5 p-2 text-red-600 hover:bg-red-50 rounded-md"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const newConditions = [...(config.filter_conditions || []), { field: '', operator: 'equals', value: '' }];
                        setConfig({ ...config, filter_conditions: newConditions });
                      }}
                      className="w-full border-dashed border-2 hover:border-indigo-400 hover:bg-indigo-50"
                    >
                      <span className="text-indigo-600 font-medium">+ Add Condition</span>
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        );

      case 'ai_prompt':
        return (
          <div className="space-y-4">
            <div>
              <Label>AI Prompt</Label>
              <Textarea
                className="w-full"
                value={config.prompt || ''}
                onChange={(e) => handleConfigChange('prompt', e.target.value)}
                placeholder="Enter your AI prompt here..."
                rows={5}
              />
            </div>
          </div>
        );

      case 'condition':
        return (
          <div className="space-y-4">
            <div>
              <Label>Field</Label>
              <Input
                className="w-full"
                value={config.condition?.field || ''}
                onChange={(e) => handleConfigChange('condition', { ...(config.condition || {}), field: e.target.value })}
                placeholder="Field name"
              />
            </div>
            <div>
              <Label>Operator</Label>
              <Select
                value={config.condition?.operator || 'equals'}
                onValueChange={(value) => handleConfigChange('condition', { ...(config.condition || {}), operator: value })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="equals">Equals</SelectItem>
                  <SelectItem value="not_equals">Not Equals</SelectItem>
                  <SelectItem value="contains">Contains</SelectItem>
                  <SelectItem value="greater_than">Greater Than</SelectItem>
                  <SelectItem value="less_than">Less Than</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Value</Label>
              <Input
                className="w-full"
                value={config.condition?.value || ''}
                onChange={(e) => handleConfigChange('condition', { ...(config.condition || {}), value: e.target.value })}
                placeholder="Comparison value"
              />
            </div>
          </div>
        );

      case 'wait':
        return (
          <div className="space-y-4">
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 mb-4">
              <p className="text-sm text-orange-800 font-medium">⏰ Wait/Delay Node</p>
              <p className="text-xs text-orange-600 mt-1">Pause execution for specified duration.</p>
            </div>
            <div>
              <Label>Duration</Label>
              <Input
                className="w-full"
                type="number"
                value={config.duration || 5}
                onChange={(e) => handleConfigChange('duration', parseInt(e.target.value))}
              />
            </div>
            <div>
              <Label>Unit</Label>
              <Select
                value={config.unit || 'minutes'}
                onValueChange={(value) => handleConfigChange('unit', value)}
              >
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="seconds">Seconds</SelectItem>
                  <SelectItem value="minutes">Minutes</SelectItem>
                  <SelectItem value="hours">Hours</SelectItem>
                  <SelectItem value="days">Days</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        );

      case 'merge':
        return (
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
              <p className="text-sm text-blue-800 font-medium">🔀 Merge Node</p>
            </div>
            <div>
              <Label>Merge Mode</Label>
              <Select value={config.mode || 'combine'} onValueChange={(value) => handleConfigChange('mode', value)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="combine">Combine All</SelectItem>
                  <SelectItem value="wait">Wait for All</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        );

      case 'http_request':
        return (
          <div className="space-y-4">
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4">
              <p className="text-sm text-green-800 font-medium">🌐 HTTP Request</p>
            </div>
            <div>
              <Label>Method</Label>
              <Select value={config.method || 'GET'} onValueChange={(value) => handleConfigChange('method', value)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="GET">GET</SelectItem>
                  <SelectItem value="POST">POST</SelectItem>
                  <SelectItem value="PUT">PUT</SelectItem>
                  <SelectItem value="DELETE">DELETE</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>URL</Label>
              <Input className="w-full" value={config.url || ''} onChange={(e) => handleConfigChange('url', e.target.value)} placeholder="https://api.example.com" />
            </div>
            <div>
              <Label>Body (JSON)</Label>
              <Textarea className="w-full" value={JSON.stringify(config.body || {}, null, 2)} onChange={(e) => { try { handleConfigChange('body', JSON.parse(e.target.value)); } catch(err) {} }} rows={4} />
            </div>
          </div>
        );

      case 'slack':
        return (
          <div className="space-y-4">
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 mb-4">
              <p className="text-sm text-purple-800 font-medium">💬 Slack Message</p>
            </div>
            <div>
              <Label>Channel</Label>
              <Input className="w-full" value={config.channel || ''} onChange={(e) => handleConfigChange('channel', e.target.value)} placeholder="#general" />
            </div>
            <div>
              <Label>Message</Label>
              <Textarea className="w-full" value={config.message || ''} onChange={(e) => handleConfigChange('message', e.target.value)} rows={4} />
            </div>
          </div>
        );

      case 'teams':
        return (
          <div className="space-y-4">
            <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 mb-4">
              <p className="text-sm text-indigo-800 font-medium">👥 Teams</p>
            </div>
            <div>
              <Label>Channel</Label>
              <Input className="w-full" value={config.channel || ''} onChange={(e) => handleConfigChange('channel', e.target.value)} />
            </div>
            <div>
              <Label>Message</Label>
              <Textarea className="w-full" value={config.message || ''} onChange={(e) => handleConfigChange('message', e.target.value)} rows={4} />
            </div>
          </div>
        );

      case 'google_sheets':
        return (
          <div className="space-y-4">
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4">
              <p className="text-sm text-green-800 font-medium">📊 Google Sheets</p>
            </div>
            <div>
              <Label>Spreadsheet ID</Label>
              <Input className="w-full" value={config.spreadsheetId || ''} onChange={(e) => handleConfigChange('spreadsheetId', e.target.value)} />
            </div>
            <div>
              <Label>Range</Label>
              <Input className="w-full" value={config.range || 'A1:Z'} onChange={(e) => handleConfigChange('range', e.target.value)} />
            </div>
          </div>
        );

      case 'database':
        return (
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
              <p className="text-sm text-blue-800 font-medium">🗄️ Database</p>
            </div>
            <div>
              <Label>SQL Query</Label>
              <Textarea className="w-full" value={config.query || ''} onChange={(e) => handleConfigChange('query', e.target.value)} rows={5} />
            </div>
          </div>
        );

      case 'webhook':
        return (
          <div className="space-y-4">
            {/* Header Info */}
            <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3">
              <p className="text-sm text-indigo-800 font-medium">🔗 Webhook Element</p>
              <p className="text-xs text-indigo-600 mt-1">
                Make external API calls to integrate with external systems
              </p>
            </div>

            {/* Label and API Name in a row */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Label</Label>
                <Input
                  className="w-full"
                  value={config.label || ''}
                  onChange={(e) => {
                    const newLabel = e.target.value;
                    const currentApiName = config.api_name || '';
                    const oldAutoGeneratedApiName = generateApiName(config.label || '');
                    const shouldAutoGenerate = !currentApiName || currentApiName === oldAutoGeneratedApiName;
                    
                    setConfig({ 
                      ...config, 
                      label: newLabel,
                      api_name: shouldAutoGenerate ? generateApiName(newLabel) : currentApiName
                    });
                  }}
                  placeholder="e.g., Call External API"
                />
              </div>
              <div>
                <Label>API Name</Label>
                <Input
                  className="w-full font-mono bg-slate-50"
                  value={config.api_name || ''}
                  onChange={(e) => setConfig({ ...config, api_name: e.target.value })}
                  placeholder="e.g., call_external_api"
                />
              </div>
            </div>

            {/* Description */}
            <div>
              <Label>Description</Label>
              <Textarea
                className="w-full"
                value={config.description || ''}
                onChange={(e) => handleConfigChange('description', e.target.value)}
                placeholder="Describe what this webhook does..."
                rows={3}
              />
            </div>

            {/* URL */}
            <div>
              <Label>URL</Label>
              <Input
                className="w-full font-mono"
                value={config.url || ''}
                onChange={(e) => handleConfigChange('url', e.target.value)}
                placeholder="https://api.example.com/endpoint"
              />
              <p className="text-xs text-slate-500 mt-1">The external API endpoint to call</p>
            </div>

            {/* HTTP Method */}
            <div>
              <Label>HTTP Method</Label>
              <Select
                value={config.http_method || 'POST'}
                onValueChange={(value) => handleConfigChange('http_method', value)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select method" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="GET">GET</SelectItem>
                  <SelectItem value="POST">POST</SelectItem>
                  <SelectItem value="PUT">PUT</SelectItem>
                  <SelectItem value="PATCH">PATCH</SelectItem>
                  <SelectItem value="DELETE">DELETE</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Data Format */}
            <div>
              <Label>Data Format</Label>
              <Select
                value={config.data_format || 'json'}
                onValueChange={(value) => handleConfigChange('data_format', value)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select format" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="json">JSON</SelectItem>
                  <SelectItem value="xml">XML</SelectItem>
                  <SelectItem value="form">Form Data</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-slate-500 mt-1">Format of the request body</p>
            </div>

            {/* Headers */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Headers (Optional)</Label>
              
              {/* Column Headers */}
              <div className="grid grid-cols-2 gap-2 px-3">
                <div className="text-xs font-medium text-slate-600">Key</div>
                <div className="text-xs font-medium text-slate-600">Value</div>
              </div>
              
              {(config.headers || [{ key: '', value: '' }]).map((header, index) => (
                <div key={index} className="flex items-start gap-2 p-3 bg-slate-50 rounded-md border border-slate-200">
                  <div className="flex-1 grid grid-cols-2 gap-2">
                    <div>
                      <Input
                        value={header.key || ''}
                        onChange={(e) => {
                          const newHeaders = [...(config.headers || [])];
                          newHeaders[index] = { ...newHeaders[index], key: e.target.value };
                          setConfig({ ...config, headers: newHeaders });
                        }}
                        placeholder="Authorization"
                      />
                    </div>
                    <div>
                      <Input
                        value={header.value || ''}
                        onChange={(e) => {
                          const newHeaders = [...(config.headers || [])];
                          newHeaders[index] = { ...newHeaders[index], value: e.target.value };
                          setConfig({ ...config, headers: newHeaders });
                        }}
                        placeholder="Bearer token123"
                      />
                    </div>
                  </div>

                  {/* Delete Button */}
                  {(config.headers || []).length > 1 && (
                    <button
                      type="button"
                      onClick={() => {
                        const newHeaders = (config.headers || []).filter((_, i) => i !== index);
                        setConfig({ ...config, headers: newHeaders });
                      }}
                      className="mt-0.5 p-2 text-red-600 hover:bg-red-50 rounded-md transition-colors"
                      title="Delete header"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}

              {/* Add Header Button */}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const newHeaders = [...(config.headers || []), { key: '', value: '' }];
                  setConfig({ ...config, headers: newHeaders });
                }}
                className="w-full border-dashed border-2 hover:border-indigo-400 hover:bg-indigo-50"
              >
                <span className="text-indigo-600 font-medium">+ Add Header</span>
              </Button>
            </div>

            {/* Payload Key-Value Pairs */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Payload (Request Body)</Label>
              
              {/* Column Headers */}
              <div className="grid grid-cols-2 gap-2 px-3">
                <div className="text-xs font-medium text-slate-600">Key</div>
                <div className="text-xs font-medium text-slate-600">Value</div>
              </div>
              
              {(config.payload || [{ key: '', value: '' }]).map((item, index) => (
                <div key={index} className="flex items-start gap-2 p-3 bg-slate-50 rounded-md border border-slate-200">
                  <div className="flex-1 grid grid-cols-2 gap-2">
                    <div>
                      <Input
                        value={item.key || ''}
                        onChange={(e) => {
                          const newPayload = [...(config.payload || [])];
                          newPayload[index] = { ...newPayload[index], key: e.target.value };
                          setConfig({ ...config, payload: newPayload });
                        }}
                        placeholder="name"
                      />
                    </div>
                    <div>
                      <ExpressionBuilder
                        value={item.value || ''}
                        onChange={(value) => {
                          const newPayload = [...(config.payload || [])];
                          newPayload[index] = { ...newPayload[index], value: value };
                          setConfig({ ...config, payload: newPayload });
                        }}
                        availableVariables={[
                          ...flowVariables.map(v => ({ path: v.name, label: v.name, type: v.type })),
                          ...availableFields.map(f => ({ path: `Trigger.${triggerEntity}.${f.name}`, label: `Trigger: ${f.label || f.name}`, type: f.type }))
                        ]}
                        label=""
                        placeholder="Enter value or build expression..."
                        showPreview={false}
                      />
                    </div>
                  </div>

                  {/* Delete Button */}
                  {(config.payload || []).length > 1 && (
                    <button
                      type="button"
                      onClick={() => {
                        const newPayload = (config.payload || []).filter((_, i) => i !== index);
                        setConfig({ ...config, payload: newPayload });
                      }}
                      className="mt-0.5 p-2 text-red-600 hover:bg-red-50 rounded-md transition-colors"
                      title="Delete payload item"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}

              {/* Add Payload Item Button */}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const newPayload = [...(config.payload || []), { key: '', value: '' }];
                  setConfig({ ...config, payload: newPayload });
                }}
                className="w-full border-dashed border-2 hover:border-indigo-400 hover:bg-indigo-50"
              >
                <span className="text-indigo-600 font-medium">+ Add Payload Item</span>
              </Button>
            </div>
          </div>
        );

      case 'function':
        return (
          <div className="space-y-4">
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
              <p className="text-sm text-yellow-800 font-medium">⚙️ Function</p>
            </div>
            <div>
              <Label>Code</Label>
              <Textarea className="w-full" value={config.code || 'return items;'} onChange={(e) => handleConfigChange('code', e.target.value)} rows={8} className="font-mono text-sm" />
            </div>
          </div>
        );

      case 'assignment':
        return (
          <div className="space-y-4">
            {/* Loop Context Notice */}
            {isInsideLoop && loopObjectName && (
              <div className="bg-amber-50 border border-amber-300 rounded-lg p-3 mb-2">
                <p className="text-sm text-amber-900 font-semibold flex items-center gap-2">
                  <span>🔁</span> Inside Loop Context
                </p>
                <p className="text-xs text-amber-700 mt-1">
                  This assignment runs for each <strong>{loopObjectName}</strong> in the collection.
                  You can reference current item fields using <code className="bg-amber-100 px-1 rounded">{'{{' + loopObjectName + '_fieldname}}'}</code>
                </p>
              </div>
            )}

            {/* Header Info */}
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
              <p className="text-sm text-purple-800 font-medium">📝 Assignment Element</p>
              <p className="text-xs text-purple-600 mt-1">
                Set or change the value of a variable or field
              </p>
            </div>

            {/* Label and API Name in a row */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Label</Label>
                <Input
                  className="w-full"
                  value={config.label || ''}
                  onChange={(e) => {
                    const newLabel = e.target.value;
                    const currentApiName = config.api_name || '';
                    const oldAutoGeneratedApiName = generateApiName(config.label || '');
                    const shouldAutoGenerate = !currentApiName || currentApiName === oldAutoGeneratedApiName;
                    
                    setConfig({ 
                      ...config, 
                      label: newLabel,
                      api_name: shouldAutoGenerate ? generateApiName(newLabel) : currentApiName
                    });
                  }}
                  placeholder="e.g., Set Account Status"
                />
              </div>
              <div>
                <Label>API Name</Label>
                <Input
                  className="w-full font-mono bg-slate-50"
                  value={config.api_name || ''}
                  onChange={(e) => setConfig({ ...config, api_name: e.target.value })}
                  placeholder="e.g., set_account_status"
                />
              </div>
            </div>

            {/* Description */}
            <div>
              <Label>Description</Label>
              <Textarea
                className="w-full"
                value={config.description || ''}
                onChange={(e) => handleConfigChange('description', e.target.value)}
                placeholder="Describe what this assignment does..."
                rows={2}
              />
            </div>

            {/* Assignment Rows */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Variable Assignments</Label>
              <p className="text-xs text-slate-500">Set values for variables or fields</p>
              
              {/* Formula Help */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs">
                <p className="font-semibold text-blue-900 mb-2">💡 Formula Examples:</p>
                <ul className="space-y-1 text-blue-800">
                  <li>• String: <code className="bg-blue-100 px-1 rounded">"AutoOpp - " + Trigger.Lead.FirstName</code></li>
                  <li>• Date: <code className="bg-blue-100 px-1 rounded">TODAY() + 7</code></li>
                  <li>• Number: <code className="bg-blue-100 px-1 rounded">LEN(Trigger.Lead.LastName) * 100</code></li>
                  <li>• Functions: TODAY(), NOW(), LEN(), FIND(), RIGHT(), CONTAINS()</li>
                </ul>
              </div>
              
              <div className="space-y-2">
                {(config.assignments || [{ variable: '', operator: 'equals', value: '' }]).map((assignment, index) => (
                  <div key={index} className="p-3 bg-slate-50 rounded-md border border-slate-200">
                    <div className="space-y-2">
                      {/* Variable Name */}
                      <div>
                        <Label className="text-xs">Variable</Label>
                        <ComboField
                          value={assignment.variable || ''}
                          onChange={(value) => {
                            const newAssignments = [...(config.assignments || [])];
                            newAssignments[index] = { ...newAssignments[index], variable: value };
                            setConfig({ ...config, assignments: newAssignments });
                          }}
                          options={(() => {
                            const options = [];
                            
                            // If inside loop, show current item fields from loop object
                            if (isInsideLoop && loopObjectName && availableFields.length > 0) {
                              // Add loop object fields
                              availableFields.forEach(field => {
                                options.push({
                                  value: `{!${loopObjectName}_${field.name}}`,
                                  label: `${loopObjectName} ${field.label}`,
                                  description: `Current ${loopObjectName}.${field.name}`
                                });
                              });
                            }
                            
                            // Add generic variables
                            options.push(
                              { value: '{!Counter}', label: 'Counter', description: 'Variable: Counter' },
                              { value: '{!TotalAmount}', label: 'Total Amount', description: 'Variable: TotalAmount' },
                              { value: '{!CurrentIndex}', label: 'Current Index', description: 'Variable: CurrentIndex' }
                            );
                            
                            return options;
                          })()}
                          placeholder="Select or type variable name..."
                          allowCustom={true}
                        />
                      </div>

                      {/* Operator */}
                      <div>
                        <Label className="text-xs">Operator</Label>
                        <Select
                          value={assignment.operator || 'equals'}
                          onValueChange={(value) => {
                            const newAssignments = [...(config.assignments || [])];
                            newAssignments[index] = { ...newAssignments[index], operator: value };
                            setConfig({ ...config, assignments: newAssignments });
                          }}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="equals">Equals (=)</SelectItem>
                            <SelectItem value="add">Add (+)</SelectItem>
                            <SelectItem value="subtract">Subtract (-)</SelectItem>
                            <SelectItem value="multiply">Multiply (*)</SelectItem>
                            <SelectItem value="divide">Divide (/)</SelectItem>
                            <SelectItem value="contains">Contains (string check)</SelectItem>
                            <SelectItem value="concat">Concatenate (join strings)</SelectItem>
                            <SelectItem value="add_to_collection">📥 Add to Collection</SelectItem>
                            <SelectItem value="remove_from_collection">📤 Remove from Collection</SelectItem>
                            <SelectItem value="clear_collection">🗑️ Clear Collection</SelectItem>
                            <SelectItem value="assign_collection">📋 Assign Collection to Collection</SelectItem>
                          </SelectContent>
                        </Select>
                        {assignment.operator === 'add_to_collection' && (
                          <p className="text-xs text-amber-600 mt-1 bg-amber-50 p-2 rounded border border-amber-200">
                            💡 This will add the current item to the specified collection variable. Use this inside loops to collect items for bulk operations.
                          </p>
                        )}
                        {assignment.operator === 'remove_from_collection' && (
                          <p className="text-xs text-amber-600 mt-1 bg-amber-50 p-2 rounded border border-amber-200">
                            💡 This will remove the specified item from the collection (by matching ID).
                          </p>
                        )}
                        {assignment.operator === 'clear_collection' && (
                          <p className="text-xs text-amber-600 mt-1 bg-amber-50 p-2 rounded border border-amber-200">
                            💡 This will remove all items from the collection, making it empty.
                          </p>
                        )}
                        {assignment.operator === 'assign_collection' && (
                          <p className="text-xs text-amber-600 mt-1 bg-amber-50 p-2 rounded border border-amber-200">
                            💡 This will assign one collection to another, replacing all existing items.
                          </p>
                        )}
                      </div>

                      {/* Value - Expression Builder for concatenation support */}
                      <div>
                        <ExpressionBuilder
                          value={assignment.value || ''}
                          onChange={(value) => {
                            const newAssignments = [...(config.assignments || [])];
                            newAssignments[index] = { ...newAssignments[index], value: value };
                            setConfig({ ...config, assignments: newAssignments });
                          }}
                          availableVariables={[
                            ...flowVariables.map(v => ({ path: v.name, label: v.name, type: v.type })),
                            ...availableFields.map(f => ({ path: `Trigger.${triggerEntity}.${f.name}`, label: `Trigger: ${f.label || f.name}`, type: f.type }))
                          ]}
                          label={assignment.operator === 'add_to_collection' ? 'Item to Add' : 'Value'}
                          placeholder={assignment.operator === 'add_to_collection' ? 'Item or variable to add...' : 'Type formula or build expression...'}
                          showPreview={true}
                        />
                      </div>

                      {/* Remove button */}
                      {(config.assignments || []).length > 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            const newAssignments = (config.assignments || []).filter((_, i) => i !== index);
                            setConfig({ ...config, assignments: newAssignments });
                          }}
                          className="text-xs text-red-600 hover:text-red-800 flex items-center gap-1"
                        >
                          <Trash2 className="h-3 w-3" />
                          Remove Assignment
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Add Assignment Button */}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const newAssignments = [...(config.assignments || []), { variable: '', operator: 'equals', value: '' }];
                  setConfig({ ...config, assignments: newAssignments });
                }}
                className="w-full border-dashed border-2 hover:border-purple-400 hover:bg-purple-50"
              >
                <span className="text-purple-600 font-medium">+ Add Assignment</span>
              </Button>
            </div>
          </div>
        );

      case 'decision':
        return (
          <div className="space-y-4">
            {/* Execution Order Alert */}
            <div className="bg-amber-50 border-l-4 border-amber-400 p-3">
              <p className="text-sm font-semibold text-amber-900">⚠️ Outcomes are evaluated in order. First match wins.</p>
              <p className="text-xs text-amber-700 mt-1">
                The flow will execute only ONE outcome path and skip the rest.
              </p>
            </div>

            {/* Node Name */}
            <div>
              <Label className="text-sm font-medium">Decision Name <span className="text-red-500">*</span></Label>
              <Input
                className="w-full mt-1"
                value={config.label || ''}
                onChange={(e) => setConfig({ ...config, label: e.target.value })}
                placeholder="e.g., Route by Opportunity Amount"
              />
            </div>

            {/* Description */}
            <div>
              <Label className="text-sm font-medium">Description <span className="text-slate-400">(Optional)</span></Label>
              <Textarea
                className="w-full mt-1"
                value={config.description || ''}
                onChange={(e) => setConfig({ ...config, description: e.target.value })}
                placeholder="Explain what this decision does..."
                rows={2}
              />
            </div>

            {/* Evaluate Resource */}
            <div>
              <Label className="text-sm font-medium">Evaluate <span className="text-red-500">*</span></Label>
              <Select
                value={config.evaluateResource || 'triggered_record'}
                onValueChange={(value) => setConfig({ ...config, evaluateResource: value })}
              >
                <SelectTrigger className="w-full mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="triggered_record">Triggered Record</SelectItem>
                  <SelectItem value="single_record">Single Record Variable</SelectItem>
                  <SelectItem value="collection">Record Collection (first record)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-slate-500 mt-1">
                What resource to evaluate against conditions
              </p>
            </div>

            {/* Divider */}
            <div className="border-t border-slate-200 my-4"></div>

            {/* Outcomes Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold text-slate-900">Outcome Paths</Label>
                <p className="text-xs text-slate-500">Drag to reorder • First matching outcome is selected</p>
              </div>
              
              {/* Sortable Outcomes List */}
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={(config.outcomes || []).filter(o => !o.isDefault).map(o => o.name)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-3">
                    {(config.outcomes || []).map((outcome, outcomeIndex) => {
                      // Skip default outcome in main list (shown separately)
                      if (outcome.isDefault) return null;
                      
                      const matchType = outcome.matchType || 'all';
                      const conditions = outcome.conditions || [];
                      const hasConditions = conditions.length > 0;
                      
                      return (
                        <SortableOutcomeItem
                          key={outcome.name}
                          id={outcome.name}
                          outcome={outcome}
                          outcomeIndex={outcomeIndex}
                        >
                          {({ dragHandleProps }) => (
                          <div className="border-2 border-indigo-200 rounded-lg bg-white shadow-sm">
                            {/* Outcome Header */}
                            <div className="bg-indigo-50 px-4 py-3 border-b border-indigo-200 flex items-center justify-between">
                              <div className="flex items-center gap-3 flex-1">
                                <div className="flex items-center gap-2">
                                  {/* Drag Handle */}
                                  <button
                                    type="button"
                                    className="text-slate-400 hover:text-slate-600 cursor-grab active:cursor-grabbing"
                                    title="Drag to reorder"
                                    {...dragHandleProps}
                                  >
                                    <GripVertical className="w-5 h-5" />
                                  </button>
                                  <span className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center text-sm font-bold">
                                    {outcomeIndex + 1}
                                  </span>
                                  <Input
                                    className="font-semibold text-slate-900 bg-white border-slate-300"
                                    value={outcome.label || ''}
                                    onChange={(e) => {
                                      const newOutcomes = [...(config.outcomes || [])];
                                      newOutcomes[outcomeIndex] = { 
                                        ...newOutcomes[outcomeIndex], 
                                        label: e.target.value,
                                        name: e.target.value.toLowerCase().replace(/\s+/g, '_')
                                      };
                                      setConfig({ ...config, outcomes: newOutcomes });
                                    }}
                                    placeholder="Outcome Name"
                                  />
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const newOutcomes = (config.outcomes || []).filter((_, i) => i !== outcomeIndex);
                                    setConfig({ ...config, outcomes: newOutcomes });
                                  }}
                                  className="text-red-500 hover:text-red-700"
                                  title="Delete outcome"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            </div>

                      {/* Outcome Body */}
                      <div className="p-4 space-y-4">
                        {/* Match Type Selector */}
                        <div>
                          <Label className="text-xs font-medium text-slate-600">Condition Logic</Label>
                          <Select
                            value={matchType}
                            onValueChange={(value) => {
                              const newOutcomes = [...(config.outcomes || [])];
                              newOutcomes[outcomeIndex] = { ...newOutcomes[outcomeIndex], matchType: value };
                              // Initialize customLogic if switching to custom
                              if (value === 'custom' && !newOutcomes[outcomeIndex].customLogic) {
                                newOutcomes[outcomeIndex].customLogic = '';
                              }
                              setConfig({ ...config, outcomes: newOutcomes });
                            }}
                          >
                            <SelectTrigger className="w-full mt-1">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">All Conditions Must Match (AND)</SelectItem>
                              <SelectItem value="any">Any Condition Can Match (OR)</SelectItem>
                              <SelectItem value="custom">Custom Condition Logic</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        
                        {/* Custom Logic Input */}
                        {matchType === 'custom' && (
                          <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-3">
                            <Label className="text-xs font-semibold text-blue-900">Custom Logic Expression</Label>
                            <p className="text-xs text-blue-700 mb-2">
                              Use condition numbers with AND, OR, and parentheses. Example: <code className="bg-blue-100 px-1 rounded">(1 AND 2) OR 3</code>
                            </p>
                            <Input
                              className="w-full mt-1 font-mono text-sm bg-white"
                              value={outcome.customLogic || ''}
                              onChange={(e) => {
                                const newOutcomes = [...(config.outcomes || [])];
                                newOutcomes[outcomeIndex] = { ...newOutcomes[outcomeIndex], customLogic: e.target.value };
                                setConfig({ ...config, outcomes: newOutcomes });
                              }}
                              placeholder="e.g., (1 AND 2) OR (3 AND 4)"
                            />
                            {/* Validation message */}
                            {outcome.customLogic && (() => {
                              try {
                                // Simple validation - check basic syntax
                                const numConditions = conditions.length;
                                const expression = outcome.customLogic.trim();
                                if (!expression) return null;
                                
                                // Extract numbers
                                const numbers = expression.match(/\d+/g) || [];
                                const invalidNumbers = numbers.filter(n => parseInt(n) < 1 || parseInt(n) > numConditions);
                                
                                if (invalidNumbers.length > 0) {
                                  return (
                                    <p className="text-xs text-red-600 mt-1">
                                      ⚠️ Invalid condition numbers: {invalidNumbers.join(', ')} (must be 1-{numConditions})
                                    </p>
                                  );
                                }
                                
                                // Check for balanced parentheses
                                const openCount = (expression.match(/\(/g) || []).length;
                                const closeCount = (expression.match(/\)/g) || []).length;
                                if (openCount !== closeCount) {
                                  return (
                                    <p className="text-xs text-red-600 mt-1">
                                      ⚠️ Unbalanced parentheses
                                    </p>
                                  );
                                }
                                
                                return (
                                  <p className="text-xs text-green-600 mt-1">
                                    ✅ Logic looks valid
                                  </p>
                                );
                              } catch (e) {
                                return null;
                              }
                            })()}
                            
                            {/* Help Examples */}
                            <div className="mt-2 text-xs text-blue-700 space-y-1">
                              <p className="font-semibold">Examples:</p>
                              <ul className="list-disc list-inside space-y-0.5 ml-2">
                                <li><code className="bg-blue-100 px-1 rounded">1 AND 2</code> - Both must be true</li>
                                <li><code className="bg-blue-100 px-1 rounded">1 OR 2</code> - Either can be true</li>
                                <li><code className="bg-blue-100 px-1 rounded">(1 AND 2) OR 3</code> - Complex logic</li>
                                <li><code className="bg-blue-100 px-1 rounded">1 AND (2 OR 3)</code> - Grouped conditions</li>
                              </ul>
                            </div>
                          </div>
                        )}

                        {/* Condition Group Container */}
                        <div className="border-2 border-dashed border-slate-300 rounded-lg p-3 bg-slate-50">
                          {/* Group Label */}
                          <div className="mb-3 pb-2 border-b border-slate-300">
                            <p className="text-sm font-semibold text-slate-700">
                              {matchType === 'custom'
                                ? `Conditions (reference by number in custom logic)`
                                : matchType === 'all' 
                                  ? `Match: ALL of the following conditions` 
                                  : `Match: ANY of the following conditions`}
                            </p>
                          </div>

                          {/* Empty State */}
                          {!hasConditions && (
                            <div className="text-center py-4">
                              <p className="text-sm text-slate-500 italic">
                                Add at least one condition to define this outcome
                              </p>
                            </div>
                          )}

                          {/* Condition Rows */}
                          {conditions.map((condition, condIndex) => (
                            <div key={condIndex}>
                              {/* AND/OR Connector (only for non-custom logic) */}
                              {condIndex > 0 && matchType !== 'custom' && (
                                <div className="flex items-center justify-center my-2">
                                  <span className="px-3 py-1 bg-slate-200 text-slate-600 text-xs font-bold rounded-full">
                                    {matchType === 'all' ? 'AND' : 'OR'}
                                  </span>
                                </div>
                              )}
                              
                              {/* Spacing for custom logic */}
                              {condIndex > 0 && matchType === 'custom' && (
                                <div className="my-2"></div>
                              )}

                              {/* Condition Row */}
                              <div className="bg-white border border-slate-300 rounded-lg p-3 space-y-2 relative">
                                {/* Condition Number Badge */}
                                <div className="absolute -left-3 -top-3 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-bold shadow-md border-2 border-white">
                                  {condIndex + 1}
                                </div>
                                
                                {/* Field */}
                                <div>
                                  <Label className="text-xs text-slate-600">Field</Label>
                                  <Input
                                    className="w-full mt-1"
                                    value={condition.field || ''}
                                    onChange={(e) => {
                                      const newOutcomes = [...(config.outcomes || [])];
                                      const newConditions = [...(newOutcomes[outcomeIndex].conditions || [])];
                                      newConditions[condIndex] = { ...newConditions[condIndex], field: e.target.value };
                                      newOutcomes[outcomeIndex] = { ...newOutcomes[outcomeIndex], conditions: newConditions };
                                      setConfig({ ...config, outcomes: newOutcomes });
                                    }}
                                    placeholder="e.g., Trigger.Opportunity.Amount"
                                  />
                                </div>

                                {/* Operator and Value */}
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <Label className="text-xs text-slate-600">Operator</Label>
                                    <Select
                                      value={condition.operator || 'equals'}
                                      onValueChange={(value) => {
                                        const newOutcomes = [...(config.outcomes || [])];
                                        const newConditions = [...(newOutcomes[outcomeIndex].conditions || [])];
                                        newConditions[condIndex] = { 
                                          ...newConditions[condIndex], 
                                          operator: value,
                                          // Clear value if changing to null check
                                          value: (value === 'isNull' || value === 'isNotNull') ? '' : newConditions[condIndex].value
                                        };
                                        newOutcomes[outcomeIndex] = { ...newOutcomes[outcomeIndex], conditions: newConditions };
                                        setConfig({ ...config, outcomes: newOutcomes });
                                      }}
                                    >
                                      <SelectTrigger className="mt-1">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="equals">Equals</SelectItem>
                                        <SelectItem value="notEquals">Not Equals</SelectItem>
                                        <SelectItem value="greaterThan">Greater Than</SelectItem>
                                        <SelectItem value="lessThan">Less Than</SelectItem>
                                        <SelectItem value="greaterThanOrEqual">Greater or Equal (≥)</SelectItem>
                                        <SelectItem value="lessThanOrEqual">Less or Equal (≤)</SelectItem>
                                        <SelectItem value="contains">Contains</SelectItem>
                                        <SelectItem value="doesNotContain">Does Not Contain</SelectItem>
                                        <SelectItem value="startsWith">Starts With</SelectItem>
                                        <SelectItem value="endsWith">Ends With</SelectItem>
                                        <SelectItem value="isNull">Is Null</SelectItem>
                                        <SelectItem value="isNotNull">Is Not Null</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <div>
                                    <Label className="text-xs text-slate-600">Value</Label>
                                    <Input
                                      className="w-full mt-1"
                                      value={condition.value || ''}
                                      onChange={(e) => {
                                        const newOutcomes = [...(config.outcomes || [])];
                                        const newConditions = [...(newOutcomes[outcomeIndex].conditions || [])];
                                        newConditions[condIndex] = { ...newConditions[condIndex], value: e.target.value };
                                        newOutcomes[outcomeIndex] = { ...newOutcomes[outcomeIndex], conditions: newConditions };
                                        setConfig({ ...config, outcomes: newOutcomes });
                                      }}
                                      placeholder={
                                        condition.operator === 'isNull' || condition.operator === 'isNotNull' 
                                          ? '(not required)' 
                                          : 'e.g., 50000'
                                      }
                                      disabled={condition.operator === 'isNull' || condition.operator === 'isNotNull'}
                                    />
                                  </div>
                                </div>

                                {/* Remove Button */}
                                <div className="flex justify-end pt-1">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const newOutcomes = [...(config.outcomes || [])];
                                      const newConditions = (newOutcomes[outcomeIndex].conditions || []).filter((_, i) => i !== condIndex);
                                      newOutcomes[outcomeIndex] = { ...newOutcomes[outcomeIndex], conditions: newConditions };
                                      setConfig({ ...config, outcomes: newOutcomes });
                                    }}
                                    className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1"
                                  >
                                    <X className="h-3 w-3" />
                                    Remove Condition
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}

                          {/* Add Condition Button */}
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const newOutcomes = [...(config.outcomes || [])];
                              const newConditions = [...(newOutcomes[outcomeIndex].conditions || []), { field: '', operator: 'equals', value: '' }];
                              newOutcomes[outcomeIndex] = { ...newOutcomes[outcomeIndex], conditions: newConditions };
                              setConfig({ ...config, outcomes: newOutcomes });
                            }}
                            className="w-full mt-3 border-dashed border-2 hover:border-indigo-400 hover:bg-indigo-50"
                          >
                            <span className="text-indigo-600 font-medium">+ Add Condition</span>
                          </Button>
                        </div>

                        {/* Footer Helper */}
                        <p className="text-xs text-slate-500 italic">
                          Conditions are evaluated top to bottom
                        </p>
                      </div>
                    </div>
                          )}
                        </SortableOutcomeItem>
                      );
                    })}
                  </div>
                </SortableContext>
              </DndContext>

              {/* Add Outcome Button */}
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  const nonDefaultOutcomes = (config.outcomes || []).filter(o => !o.isDefault);
                  const defaultOutcomes = (config.outcomes || []).filter(o => o.isDefault);
                  const newOutcomes = [
                    ...nonDefaultOutcomes,
                    {
                      name: `outcome_${Date.now()}`,
                      label: `Outcome ${nonDefaultOutcomes.length + 1}`,
                      matchType: 'all',
                      conditions: [],
                      isDefault: false
                    },
                    ...defaultOutcomes
                  ];
                  setConfig({ ...config, outcomes: newOutcomes });
                }}
                className="w-full border-dashed border-2 hover:border-indigo-400 hover:bg-indigo-50"
              >
                <span className="text-indigo-600 font-medium text-sm">+ Add Outcome</span>
              </Button>

              {/* Default Outcome */}
              <div className="border-2 border-slate-300 rounded-lg bg-slate-100 shadow-sm">
                <div className="bg-slate-200 px-4 py-3 border-b border-slate-300 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="w-8 h-8 rounded-full bg-slate-500 text-white flex items-center justify-center text-sm font-bold">
                      ⚙
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Default Outcome</p>
                      <p className="text-xs text-slate-600">Otherwise</p>
                    </div>
                  </div>
                  <span className="px-3 py-1 bg-slate-600 text-white text-xs font-bold rounded">
                    ALWAYS PRESENT
                  </span>
                </div>
                <div className="p-4">
                  <p className="text-sm text-slate-700">
                    Runs when no other outcome matches. This path cannot be deleted.
                  </p>
                </div>
              </div>
            </div>
          </div>
        );

      case 'delay':
        return (
          <div className="space-y-4">
            <div>
              <h3 className="text-base font-semibold text-slate-900">Delay</h3>
              <p className="text-sm text-slate-600 mt-1">Pause execution for a duration or until a specific date/time</p>
            </div>

            {/* Label */}
            <div>
              <Label className="text-sm font-medium text-slate-700">Label</Label>
              <Input
                className="w-full mt-1"
                value={config.label || 'Wait'}
                onChange={(e) => setConfig({ ...config, label: e.target.value })}
                placeholder="Wait 1 Hour"
              />
            </div>

            {/* SALESFORCE: Delay Mode Selector */}
            <div className="space-y-3">
              <Label className="text-sm font-medium text-slate-700">Delay Type</Label>
              <div className="flex flex-col gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="delayMode"
                    value="duration"
                    checked={!config.delay_mode || config.delay_mode === 'duration'}
                    onChange={(e) => setConfig({ ...config, delay_mode: 'duration' })}
                    className="w-4 h-4 text-indigo-600"
                  />
                  <span className="text-sm text-slate-700">Duration (default)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="delayMode"
                    value="fixed"
                    checked={config.delay_mode === 'fixed'}
                    onChange={(e) => setConfig({ ...config, delay_mode: 'fixed' })}
                    className="w-4 h-4 text-indigo-600"
                  />
                  <span className="text-sm text-slate-700">Fixed Date & Time</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="delayMode"
                    value="dynamic_datetime"
                    checked={config.delay_mode === 'dynamic_datetime'}
                    onChange={(e) => setConfig({ ...config, delay_mode: 'dynamic_datetime' })}
                    className="w-4 h-4 text-indigo-600"
                  />
                  <span className="text-sm text-slate-700 font-medium">Until DateTime (Dynamic) ⭐</span>
                </label>
              </div>
            </div>

            {/* DURATION MODE (EXISTING - PRESERVED) */}
            {(!config.delay_mode || config.delay_mode === 'duration') && (
              <div className="space-y-3">
                <Label className="text-sm font-medium text-slate-700">Duration</Label>
                
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-slate-600">Value</Label>
                    <Input
                      type="number"
                      min="0"
                      className="w-full mt-1"
                      value={config.duration_value || 1}
                      onChange={(e) => setConfig({ ...config, duration_value: parseInt(e.target.value) || 1 })}
                      placeholder="1"
                    />
                  </div>
                  
                  <div>
                    <Label className="text-xs text-slate-600">Unit</Label>
                    <select
                      className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      value={config.duration_unit || 'hours'}
                      onChange={(e) => setConfig({ ...config, duration_unit: e.target.value })}
                    >
                      <option value="minutes">Minutes</option>
                      <option value="hours">Hours</option>
                      <option value="days">Days</option>
                      <option value="weeks">Weeks</option>
                    </select>
                  </div>
                </div>

                <p className="text-xs text-slate-500 mt-2">
                  ℹ️ Execution will pause for {config.duration_value || 1} {config.duration_unit || 'hours'} before continuing to the next action.
                </p>
              </div>
            )}

            {/* FIXED DATE & TIME MODE (EXISTING - PRESERVED) */}
            {config.delay_mode === 'fixed' && (
              <div className="space-y-3">
                <Label className="text-sm font-medium text-slate-700">Execute At</Label>
                
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-slate-600">Date</Label>
                    <Input
                      type="date"
                      className="w-full mt-1"
                      value={config.execute_date || ''}
                      onChange={(e) => setConfig({ ...config, execute_date: e.target.value })}
                      min={new Date().toISOString().split('T')[0]}
                    />
                  </div>
                  
                  <div>
                    <Label className="text-xs text-slate-600">Time</Label>
                    <Input
                      type="time"
                      className="w-full mt-1"
                      value={config.execute_time || ''}
                      onChange={(e) => setConfig({ ...config, execute_time: e.target.value })}
                    />
                  </div>
                </div>

                {/* Show combined date/time preview */}
                {config.execute_date && config.execute_time && (
                  <p className="text-xs text-slate-500 mt-2">
                    ℹ️ Execution will resume on {new Date(config.execute_date + 'T' + config.execute_time).toLocaleString()}
                  </p>
                )}

                {/* Validation warning for past dates */}
                {config.execute_date && config.execute_time && (
                  new Date(config.execute_date + 'T' + config.execute_time) <= new Date() && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-2">
                      <p className="text-xs text-red-800">
                        ⚠️ The selected date/time is in the past. Please select a future date/time.
                      </p>
                    </div>
                  )
                )}
              </div>
            )}

            {/* UNTIL DATETIME (DYNAMIC) MODE - NEW ⭐ */}
            {config.delay_mode === 'dynamic_datetime' && (
              <div className="space-y-4">
                {/* Info Banner */}
                <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border-2 border-indigo-300 rounded-lg p-3">
                  <p className="text-sm text-indigo-900 font-bold mb-1">
                    ⭐ Until DateTime (Dynamic)
                  </p>
                  <p className="text-xs text-indigo-800">
                    Wait until a dynamic DateTime value resolved at runtime from Trigger fields, Get Records outputs, Variables, Inputs, or Formula results. Matches Salesforce "Wait Until DateTime" behavior.
                  </p>
                </div>

                {/* DateTime Source Picker */}
                <div>
                  <Label className="text-sm font-medium text-slate-700">DateTime Source (Required)</Label>
                  <p className="text-xs text-slate-500 mb-2">Select a DateTime-capable source from your flow</p>
                  
                  {(() => {
                    // Build list of available DateTime sources
                    const datetimeSources = [];
                    
                    // Get trigger object dynamically
                    let triggerObject = null;
                    
                    // Method 1: Check triggers prop
                    if (triggers && triggers.length > 0) {
                      const triggerConfig = triggers[0]?.config || triggers[0] || {};
                      triggerObject = triggerConfig.entity || triggerConfig.object || triggerConfig.trigger_object;
                    }
                    
                    // Method 2: Check nodes array for trigger/start node
                    if (!triggerObject && nodes && nodes.length > 0) {
                      const triggerNode = nodes.find(n => n.type === 'trigger' || n.type === 'start' || n.id?.includes('trigger'));
                      if (triggerNode) {
                        const config1 = triggerNode.data?.config || {};
                        const config2 = triggerNode.config || {};
                        triggerObject = config1.entity || config1.object || config1.trigger_object ||
                                       config2.entity || config2.object || config2.trigger_object;
                      }
                    }
                    
                    // Method 3: Check flow variables for Trigger.
                    if (!triggerObject && flowVariables && flowVariables.length > 0) {
                      const triggerVar = flowVariables.find(v => v.name?.startsWith('Trigger.'));
                      if (triggerVar) {
                        const parts = triggerVar.name.split('.');
                        if (parts.length > 1) {
                          triggerObject = parts[1];
                        }
                      }
                    }
                    
                    // Method 4: For Screen Flows, use screenFlowObject
                    if (!triggerObject && flowType === 'screen-flow' && (launchMode === 'record_detail' || launchMode === 'list_view') && screenFlowObject) {
                      triggerObject = screenFlowObject;
                    }
                    
                    // 1. Trigger Record Fields (DateTime only) - USE ACTUAL dateFields
                    if (triggerObject && dateFields && dateFields.length > 0) {
                      const triggerDateFields = dateFields.map(field => ({
                        type: 'trigger_field',
                        label: `Trigger: ${field.label || field.name}`,
                        value: `trigger_field:Trigger.${triggerObject}.${field.name}`,
                        ref: `Trigger.${triggerObject}.${field.name}`
                      }));
                      datetimeSources.push(...triggerDateFields);
                    } else if (triggerObject) {
                      // Fallback to common fields if dateFields not loaded yet
                      const commonFields = [
                        { name: 'CreatedDate', label: 'Created Date' },
                        { name: 'LastModifiedDate', label: 'Last Modified Date' }
                      ];
                      const triggerDateFields = commonFields.map(field => ({
                        type: 'trigger_field',
                        label: `Trigger: ${field.label}`,
                        value: `trigger_field:Trigger.${triggerObject}.${field.name}`,
                        ref: `Trigger.${triggerObject}.${field.name}`
                      }));
                      datetimeSources.push(...triggerDateFields);
                    }
                    
                    // 2. Get Records Step Outputs (DateTime fields)
                    const getRecordsNodes = nodes.filter(n => n.type === 'get_records' || n.data?.nodeType === 'get_records');
                    getRecordsNodes.forEach(grNode => {
                      const stepName = grNode.data?.label || grNode.id;
                      const objectName = grNode.data?.config?.object || grNode.data?.config?.entity;
                      
                      if (objectName) {
                        // For simplicity, show common DateTime fields
                        // In production, you'd fetch actual fields for this object
                        ['CreatedDate', 'LastModifiedDate'].forEach(fieldName => {
                          datetimeSources.push({
                            type: 'get_record_field',
                            label: `Get Records (${stepName}): ${fieldName}`,
                            value: `get_record_field:${stepName}.${fieldName}`,
                            ref: `${stepName}.${fieldName}`
                          });
                        });
                      }
                    });
                    
                    // 3. Assignment Variables (DateTime type)
                    const datetimeVariables = flowVariables.filter(v => 
                      v.dataType === 'DateTime' || 
                      v.type === 'DateTime' ||
                      v.name?.toLowerCase().includes('date') ||
                      v.name?.toLowerCase().includes('time')
                    );
                    datetimeVariables.forEach(v => {
                      datetimeSources.push({
                        type: 'variable',
                        label: `Variable: ${v.name}`,
                        value: `variable:${v.name}`,
                        ref: v.name
                      });
                    });
                    
                    // 4. Input Variables (DateTime type)
                    // Input variables are in flowVariables with isInput flag
                    const inputVariables = flowVariables.filter(v => 
                      v.isInput && (v.dataType === 'DateTime' || v.type === 'DateTime')
                    );
                    inputVariables.forEach(v => {
                      datetimeSources.push({
                        type: 'input',
                        label: `Input: ${v.name}`,
                        value: `input:${v.name}`,
                        ref: v.name
                      });
                    });
                    
                    // 5. Formula Variables (DateTime result)
                    const formulaNodes = nodes.filter(n => n.type === 'formula' || n.data?.nodeType === 'formula');
                    formulaNodes.forEach(fNode => {
                      const formulaName = fNode.data?.config?.variable_name || fNode.data?.label || fNode.id;
                      const resultType = fNode.data?.config?.result_type;
                      
                      if (resultType === 'DateTime' || formulaName?.toLowerCase().includes('date')) {
                        datetimeSources.push({
                          type: 'formula',
                          label: `Formula: ${formulaName}`,
                          value: `formula:${formulaName}`,
                          ref: formulaName
                        });
                      }
                    });
                    
                    // Get current selection
                    const currentSource = config.source;
                    const currentValue = currentSource ? `${currentSource.type}:${currentSource.ref}` : '';
                    
                    // Show dropdown or message
                    if (datetimeSources.length === 0) {
                      return (
                        <div className="w-full mt-1 px-3 py-2 border-2 border-amber-300 rounded-lg bg-amber-50">
                          <p className="text-sm text-amber-900 font-semibold">⚠️ No DateTime sources available</p>
                          <p className="text-xs text-amber-800 mt-1">
                            Add a Trigger with DateTime fields, Get Records step, or DateTime Variables to use this delay mode.
                          </p>
                        </div>
                      );
                    }
                    
                    return (
                      <Select
                        value={currentValue}
                        onValueChange={(value) => {
                          // Parse value format: "type:ref"
                          const [sourceType, ...refParts] = value.split(':');
                          const sourceRef = refParts.join(':');
                          
                          setConfig({
                            ...config,
                            source: {
                              type: sourceType,
                              ref: sourceRef
                            }
                          });
                        }}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select DateTime source..." />
                        </SelectTrigger>
                        <SelectContent>
                          {/* Group by source type */}
                          {datetimeSources.filter(s => s.type === 'trigger_field').length > 0 && (
                            <>
                              <div className="px-2 py-1 text-xs font-semibold text-slate-600 bg-slate-100">
                                Trigger Record Fields
                              </div>
                              {datetimeSources.filter(s => s.type === 'trigger_field').map((source, idx) => (
                                <SelectItem key={`trigger-${idx}`} value={source.value}>
                                  {source.label}
                                </SelectItem>
                              ))}
                            </>
                          )}
                          
                          {getRecordsNodes.length > 0 && (
                            <>
                              <div className="px-2 py-1 text-xs font-semibold text-slate-600 bg-slate-100">
                                Get Records Outputs
                              </div>
                              {datetimeSources.filter(s => s.type === 'get_record_field').map((source, idx) => (
                                <SelectItem key={`get-${idx}`} value={source.value}>
                                  {source.label}
                                </SelectItem>
                              ))}
                            </>
                          )}
                          
                          {datetimeVariables.length > 0 && (
                            <>
                              <div className="px-2 py-1 text-xs font-semibold text-slate-600 bg-slate-100">
                                Variables
                              </div>
                              {datetimeVariables.map((v, idx) => {
                                const source = datetimeSources.find(s => s.type === 'variable' && s.ref === v.name);
                                return source ? (
                                  <SelectItem key={`var-${idx}`} value={source.value}>
                                    {source.label}
                                  </SelectItem>
                                ) : null;
                              })}
                            </>
                          )}
                          
                          {inputVariables.length > 0 && (
                            <>
                              <div className="px-2 py-1 text-xs font-semibold text-slate-600 bg-slate-100">
                                Input Variables
                              </div>
                              {inputVariables.map((v, idx) => {
                                const source = datetimeSources.find(s => s.type === 'input' && s.ref === v.name);
                                return source ? (
                                  <SelectItem key={`input-${idx}`} value={source.value}>
                                    {source.label}
                                  </SelectItem>
                                ) : null;
                              })}
                            </>
                          )}
                          
                          {formulaNodes.length > 0 && (
                            <>
                              <div className="px-2 py-1 text-xs font-semibold text-slate-600 bg-slate-100">
                                Formula Results
                              </div>
                              {datetimeSources.filter(s => s.type === 'formula').map((source, idx) => (
                                <SelectItem key={`formula-${idx}`} value={source.value}>
                                  {source.label}
                                </SelectItem>
                              ))}
                            </>
                          )}
                        </SelectContent>
                      </Select>
                    );
                  })()}
                </div>

                {/* Optional Time Override */}
                <div className="space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.overrideTime?.enabled || false}
                      onChange={(e) => setConfig({
                        ...config,
                        overrideTime: {
                          ...config.overrideTime,
                          enabled: e.target.checked
                        }
                      })}
                      className="w-4 h-4 text-indigo-600 rounded"
                    />
                    <span className="text-sm font-medium text-slate-700">Override Time (Optional)</span>
                  </label>
                  
                  {config.overrideTime?.enabled && (
                    <div>
                      <Label className="text-xs text-slate-600">Time (HH:MM)</Label>
                      <Input
                        type="time"
                        className="w-full mt-1"
                        value={config.overrideTime?.time || ''}
                        onChange={(e) => setConfig({
                          ...config,
                          overrideTime: {
                            ...config.overrideTime,
                            time: e.target.value
                          }
                        })}
                      />
                      <p className="text-xs text-slate-500 mt-1">
                        Wait until the date from source at this specific time (local timezone)
                      </p>
                    </div>
                  )}
                </div>

                {/* Optional Offset */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-slate-700">Offset (Optional)</Label>
                  <p className="text-xs text-slate-500 mb-1">Add or subtract time from the source value</p>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs text-slate-600">Value</Label>
                      <Input
                        type="number"
                        className="w-full mt-1"
                        value={config.offset?.value || 0}
                        onChange={(e) => setConfig({
                          ...config,
                          offset: {
                            ...config.offset,
                            value: parseInt(e.target.value) || 0,
                            unit: config.offset?.unit || 'days'
                          }
                        })}
                        placeholder="0"
                      />
                    </div>
                    
                    <div>
                      <Label className="text-xs text-slate-600">Unit</Label>
                      <select
                        className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        value={config.offset?.unit || 'days'}
                        onChange={(e) => setConfig({
                          ...config,
                          offset: {
                            ...config.offset,
                            value: config.offset?.value || 0,
                            unit: e.target.value
                          }
                        })}
                      >
                        <option value="minutes">Minutes</option>
                        <option value="hours">Hours</option>
                        <option value="days">Days</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Salesforce Behavior Info */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-xs text-blue-900 font-semibold mb-1">
                    📘 Salesforce Flow Behavior
                  </p>
                  <ul className="text-xs text-blue-800 space-y-1 ml-4 list-disc">
                    <li>If source is NULL or invalid → Flow routes to Fault Path</li>
                    <li>If DateTime is in the past → Execution continues immediately</li>
                    <li>If DateTime is in the future → Flow pauses until that exact time</li>
                    <li>Time override and offset are applied after resolving source</li>
                    <li>Backend scheduling ensures execution survives restarts</li>
                  </ul>
                </div>
              </div>
            )}

            {/* Info Box */}
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
              <p className="text-xs text-purple-900">
                <strong>Note:</strong> The flow will pause at this step and automatically resume {
                  config.delay_mode === 'fixed' 
                    ? 'at the specified date and time'
                    : config.delay_mode === 'dynamic_datetime'
                    ? 'when the dynamic DateTime source value is reached'
                    : 'after the specified delay duration'
                }. This is useful for follow-up actions, reminders, or waiting for external processes.
              </p>
            </div>
          </div>
        );

      case 'add_error':
      case 'custom_error':
        // Screen fields for inline error targeting (Salesforce behavior)
        const screenNodes = nodes.filter(n => n.type === 'screen');
        const screenFields = screenNodes.flatMap(screen => {
          const fields = screen.data?.config?.fields || [];
          const screenLabel = screen.data?.label || 'Screen';
          return fields.map(f => ({
            screenLabel,
            fieldName: f.name,
            fieldLabel: f.label || f.name,
            fieldType: f.type
          }));
        });

        // Initialize error messages array if not present (Salesforce-style: each error has its own type, field, message)
        const errorMessages = config.errorMessages || [{ 
          id: 0, 
          type: 'window',  // 'window' or 'inline'
          field: null,     // field name for inline errors
          message: config.errorMessage || '' 
        }];
        
        // Track which error blocks are expanded
        const expandedErrors = config._expandedErrors || {};
        
        // Helper to update a specific error message
        const updateErrorMessage = (msgIdx, updates) => {
          const newMessages = [...errorMessages];
          newMessages[msgIdx] = { ...newMessages[msgIdx], ...updates };
          setConfig({ ...config, errorMessages: newMessages });
        };
        
        // Helper to toggle error block expansion
        const toggleErrorExpanded = (msgIdx) => {
          const newExpanded = { ...expandedErrors, [msgIdx]: !expandedErrors[msgIdx] };
          setConfig({ ...config, _expandedErrors: newExpanded });
        };
        
        // Helper to add variable to specific error message
        const addVariableToMessage = (msgIdx, variable) => {
          const newMessages = [...errorMessages];
          newMessages[msgIdx] = {
            ...newMessages[msgIdx],
            message: (newMessages[msgIdx].message || '') + `{!${variable}}`
          };
          setConfig({ ...config, errorMessages: newMessages });
        };
        
        return (
          <div className="space-y-4">
            {/* Header - Salesforce Style */}
            <div className="flex items-center gap-3 pb-3 border-b border-slate-200">
              <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                <AlertTriangle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-slate-900">Custom Error Message</h3>
                <p className="text-sm text-slate-500">Display error messages and stop flow execution</p>
              </div>
            </div>

            {/* Label - Required */}
            <div>
              <Label className="text-sm font-medium text-slate-700">
                Label <span className="text-red-500">*</span>
              </Label>
              <Input
                className={`w-full mt-1 ${!config.label ? 'border-red-300 focus:border-red-500' : ''}`}
                value={config.label || ''}
                onChange={(e) => {
                  const newLabel = e.target.value;
                  const currentApiName = config.api_name || '';
                  const oldAutoGeneratedApiName = generateApiName(config.label || '');
                  const shouldAutoGenerate = !currentApiName || currentApiName === oldAutoGeneratedApiName;
                  
                  setConfig({
                    ...config,
                    label: newLabel,
                    api_name: shouldAutoGenerate ? generateApiName(newLabel) : currentApiName
                  });
                }}
                placeholder="e.g., Validation Error"
              />
            </div>

            {/* API Name */}
            <div>
              <Label className="text-sm font-medium text-slate-700">API Name</Label>
              <Input
                className="w-full mt-1 font-mono bg-slate-50"
                value={config.api_name || ''}
                onChange={(e) => setConfig({ ...config, api_name: e.target.value })}
                placeholder="e.g., validation_error"
              />
            </div>

            {/* Description (Optional) */}
            <div>
              <Label className="text-sm font-medium text-slate-700">Description</Label>
              <Textarea
                className="w-full mt-1"
                value={config.description || ''}
                onChange={(e) => setConfig({ ...config, description: e.target.value })}
                placeholder="Describe when this error should appear..."
                rows={2}
              />
            </div>

            {/* Error Message Accordion Blocks */}
            <div className="space-y-2">
              {errorMessages.map((errMsg, msgIdx) => {
                const isExpanded = expandedErrors[msgIdx] || false;
                const hasValidationError = errMsg.type === 'inline' && !errMsg.field;
                
                return (
                  <div 
                    key={errMsg.id || msgIdx} 
                    className={`border rounded-lg overflow-hidden transition-all ${
                      isExpanded ? 'border-blue-400 shadow-sm' : 'border-slate-200'
                    }`}
                  >
                    {/* Accordion Header */}
                    <button
                      type="button"
                      onClick={() => toggleErrorExpanded(msgIdx)}
                      className={`w-full px-4 py-3 flex items-center justify-between text-left transition-colors ${
                        isExpanded ? 'bg-blue-50' : 'bg-slate-50 hover:bg-slate-100'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <ChevronDown className={`h-4 w-4 text-slate-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                        <span className={`text-sm font-medium ${isExpanded ? 'text-blue-700' : 'text-slate-700'}`}>
                          Set Error Message {msgIdx + 1} Details
                        </span>
                        {hasValidationError && (
                          <span className="text-xs text-red-500 ml-2">• Requires field selection</span>
                        )}
                      </div>
                      {errorMessages.length > 1 && (
                        <span
                          onClick={(e) => {
                            e.stopPropagation();
                            const newMessages = errorMessages.filter((_, i) => i !== msgIdx);
                            // Also remove from expanded state
                            const newExpanded = { ...expandedErrors };
                            delete newExpanded[msgIdx];
                            setConfig({ ...config, errorMessages: newMessages, _expandedErrors: newExpanded });
                          }}
                          className="text-xs text-red-600 hover:text-red-700 hover:underline px-2 py-1"
                        >
                          Delete
                        </span>
                      )}
                    </button>
                    
                    {/* Accordion Content */}
                    {isExpanded && (
                      <div className="px-4 py-4 space-y-4 bg-white border-t border-slate-200">
                        {/* Where to Show the Error Message */}
                        <div>
                          <Label className="text-sm font-medium text-slate-700 mb-3 block">
                            Where to Show the Error Message:
                          </Label>
                          <div className="space-y-2 ml-1">
                            <label className="flex items-center gap-3 cursor-pointer">
                              <input
                                type="radio"
                                name={`error_type_${msgIdx}`}
                                value="window"
                                checked={(errMsg.type || 'window') === 'window'}
                                onChange={() => updateErrorMessage(msgIdx, { type: 'window', field: null })}
                                className="w-4 h-4 text-blue-600 focus:ring-2 focus:ring-blue-500"
                              />
                              <span className="text-sm text-slate-700">In a window on a record page</span>
                            </label>
                            <label className="flex items-center gap-3 cursor-pointer">
                              <input
                                type="radio"
                                name={`error_type_${msgIdx}`}
                                value="inline"
                                checked={errMsg.type === 'inline'}
                                onChange={() => updateErrorMessage(msgIdx, { type: 'inline' })}
                                className="w-4 h-4 text-blue-600 focus:ring-2 focus:ring-blue-500"
                              />
                              <span className="text-sm text-slate-700">As an inline error on a field</span>
                            </label>
                          </div>
                          
                          {/* Field Selector - Show only when inline is selected */}
                          {errMsg.type === 'inline' && (
                            <div className="mt-3 ml-7">
                              <Select
                                value={errMsg.field || ''}
                                onValueChange={(value) => updateErrorMessage(msgIdx, { field: value })}
                              >
                                <SelectTrigger className={`w-full ${!errMsg.field ? 'border-red-300' : ''}`}>
                                  <SelectValue placeholder="Select a field..." />
                                </SelectTrigger>
                                <SelectContent>
                                  {screenFields.length > 0 ? (
                                    screenFields.map((sf, idx) => (
                                      <SelectItem key={idx} value={sf.fieldName}>
                                        {sf.fieldLabel} ({sf.screenLabel})
                                      </SelectItem>
                                    ))
                                  ) : (
                                    <SelectItem value="_none" disabled>
                                      No screen fields available
                                    </SelectItem>
                                  )}
                                </SelectContent>
                              </Select>
                              {!errMsg.field && (
                                <p className="text-xs text-red-500 mt-1">This field is required.</p>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Error Message */}
                        <div>
                          <Label className="text-sm font-medium text-slate-700 mb-1 block">
                            Error Message <span className="text-red-500">*</span>
                          </Label>
                          <p className="text-xs text-slate-500 mb-2">Maximum 255 characters</p>
                          
                          {/* Insert Resource Button */}
                          <button
                            type="button"
                            onClick={() => {
                              setResourcePickerTargetIdx(msgIdx);
                              setShowResourcePicker(true);
                            }}
                            className="w-full flex items-center justify-between px-3 py-2 mb-2 text-sm bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-md transition-colors cursor-pointer"
                          >
                            <span className="text-slate-500">Insert a resource...</span>
                            <Search className="h-4 w-4 text-slate-400" />
                          </button>
                          
                          {/* Error Message Textarea */}
                          <Textarea
                            className="w-full font-mono text-sm"
                            value={errMsg.message || ''}
                            onChange={(e) => {
                              const value = e.target.value.slice(0, 255); // Max 255 chars
                              updateErrorMessage(msgIdx, { message: value });
                            }}
                            placeholder="Enter error message with variables like {!$User.Name}"
                            rows={3}
                            maxLength={255}
                          />
                          <p className="text-xs text-slate-400 mt-1 text-right">
                            {(errMsg.message || '').length}/255
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Add Error Message Button */}
            <button
              type="button"
              onClick={() => {
                const newId = Date.now();
                const newMessages = [...errorMessages, { 
                  id: newId, 
                  type: 'window', 
                  field: null, 
                  message: '' 
                }];
                // Auto-expand the new error block
                const newExpanded = { ...expandedErrors, [errorMessages.length]: true };
                setConfig({ ...config, errorMessages: newMessages, _expandedErrors: newExpanded });
              }}
              className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg border border-dashed border-blue-300 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Add Error Message
            </button>

            {/* Resource Picker Modal for Custom Error */}
            <ResourcePickerModal
              isOpen={showResourcePicker}
              onClose={() => {
                setShowResourcePicker(false);
                setResourcePickerTargetIdx(null);
              }}
              onSelect={(variable) => {
                // Insert variable at cursor position in the target error message
                if (resourcePickerTargetIdx !== null) {
                  const currentMsg = errorMessages[resourcePickerTargetIdx]?.message || '';
                  const newMsg = (currentMsg + variable).slice(0, 255); // Respect 255 char limit
                  updateErrorMessage(resourcePickerTargetIdx, { message: newMsg });
                }
                setShowResourcePicker(false);
                setResourcePickerTargetIdx(null);
              }}
              context={{
                triggerConfig: triggers && triggers.length > 0 
                  ? (triggers[0]?.config || triggers[0]) 
                  : {},
                previousNodes: nodes?.filter(n => n.id !== node?.id),
                flowVariables: flowVariables,
                nodes: nodes
              }}
              title="Insert a resource..."
              variableSyntax="{!}"  // Salesforce-style {!variable} syntax
            />
          </div>
        );

      case 'loop':
        return (
          <div className="space-y-4">
            {/* Simple Header */}
            <div>
              <h3 className="text-base font-semibold text-slate-900">New Loop</h3>
              <p className="text-sm text-slate-600 mt-1">Iterate over a collection of items</p>
            </div>

            {/* Label */}
            <div>
              <Label className="text-sm font-medium text-slate-700">Label</Label>
              <Input
                className="w-full mt-1"
                value={config.label || ''}
                onChange={(e) => {
                  const newLabel = e.target.value;
                  const currentApiName = config.api_name || '';
                  const oldAutoGeneratedApiName = generateApiName(config.label || '');
                  const shouldAutoGenerate = !currentApiName || currentApiName === oldAutoGeneratedApiName;
                  
                  setConfig({ 
                    ...config, 
                    label: newLabel,
                    api_name: shouldAutoGenerate ? generateApiName(newLabel) : currentApiName
                  });
                }}
                placeholder="Loop 1"
              />
            </div>

            {/* API Name */}
            <div>
              <Label className="text-sm font-medium text-slate-700">API Name</Label>
              <Input
                className="w-full font-mono bg-slate-50 mt-1"
                value={config.api_name || ''}
                onChange={(e) => setConfig({ ...config, api_name: e.target.value })}
                placeholder="Loop_1"
              />
            </div>

            {/* Description */}
            <div>
              <Label className="text-sm font-medium text-slate-700">Description</Label>
              <Textarea
                className="w-full mt-1"
                value={config.description || ''}
                onChange={(e) => handleConfigChange('description', e.target.value)}
                placeholder="Optional description"
                rows={2}
              />
            </div>

            {/* Divider */}
            <div className="border-t border-slate-200 my-4"></div>

            {/* Collection Variable */}
            <div>
              <Label className="text-sm font-medium text-slate-700">Collection Variable</Label>
              <ComboField
                value={config.collection_variable || ''}
                onChange={(value) => setConfig({ ...config, collection_variable: value })}
                options={(() => {
                  const resources = [];
                  
                  // Get previous nodes (nodes before this one)
                  const currentNodeIndex = (crmObjects.nodes || []).findIndex(n => n.id === node?.id);
                  const prevNodes = currentNodeIndex > 0 ? (crmObjects.nodes || []).slice(0, currentNodeIndex) : [];
                  
                  // Add collections from previous Get Record nodes
                  prevNodes.forEach(n => {
                    const nodeConfig = n.data?.config || {};
                    if (nodeConfig.action_type === 'get' && nodeConfig.object) {
                      const objectName = nodeConfig.object;
                      resources.push({
                        value: `{{${objectName}_records}}`,
                        label: `${objectName} Records`,
                        description: `From Get ${objectName} node: ${n.data?.label || 'Get Records'}`
                      });
                    }
                  });
                  
                  // Add collection variables from Assignment nodes (add_to_collection)
                  prevNodes.forEach(n => {
                    const nodeConfig = n.data?.config || {};
                    if (n.data?.nodeType === 'assignment' || n.type === 'assignment') {
                      const assignments = nodeConfig.assignments || [];
                      assignments.forEach(assignment => {
                        if (assignment.operator === 'add_to_collection' && assignment.variable) {
                          resources.push({
                            value: `{{${assignment.variable}}}`,
                            label: assignment.variable,
                            description: `Collection from ${n.data?.label || 'Assignment'}`
                          });
                        }
                      });
                    }
                  });
                  
                  // Show message if no collections found
                  if (resources.length === 0) {
                    resources.push({
                      value: '',
                      label: 'No collections available',
                      description: 'Add a Get Records node before this Loop'
                    });
                  }
                  
                  return resources;
                })()}
                placeholder="Select collection variable"
                allowCustom={true}
              />
              <p className="text-xs text-slate-500 mt-1">
                Select a collection from previous Get Records or Assignment nodes
              </p>
              {(() => {
                const currentNodeIndex = (crmObjects.nodes || []).findIndex(n => n.id === node?.id);
                const prevNodes = currentNodeIndex > 0 ? (crmObjects.nodes || []).slice(0, currentNodeIndex) : [];
                const hasGetRecords = prevNodes.some(n => n.data?.config?.action_type === 'get');
                
                if (!hasGetRecords) {
                  return (
                    <p className="text-xs text-orange-600 mt-2 bg-orange-50 p-2 rounded border border-orange-200">
                      ⚠️ <strong>No Get Records node found.</strong> Add a Get Records node before this Loop to create a collection.
                    </p>
                  );
                }
              })()}
            </div>

            {/* Direction */}
            <div>
              <Label className="text-sm font-medium text-slate-700">Direction</Label>
              <Select
                value={config.iteration_direction || 'first_to_last'}
                onValueChange={(value) => setConfig({ ...config, iteration_direction: value })}
              >
                <SelectTrigger className="w-full mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="first_to_last">First item to last item</SelectItem>
                  <SelectItem value="last_to_first">Last item to first item</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Info Box */}
            <div className="bg-blue-50 border border-blue-200 rounded p-3 text-xs">
              <p className="text-blue-900 font-medium mb-1">How Loop Works:</p>
              <ul className="text-blue-800 space-y-1 ml-4 list-disc">
                <li><strong>For Each</strong>: Runs once per item in the collection</li>
                <li><strong>After Last</strong>: Runs once after all iterations complete</li>
              </ul>
            </div>
          </div>
        );

      case 'screen':
        // Determine if this is the first screen (for Associated Object visibility)
        // Salesforce Rule: Only first screen can define associated object
        const isFirstScreen = checkIfFirstScreen(node.id, nodes, edges);
        
        return (
          <div className="space-y-4">
            {/* Screen Flow Info */}
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-lg p-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
                  <Monitor className="w-6 h-6 text-white" />
                </div>
                <div>
                  <p className="text-sm text-blue-900 font-semibold">Screen Flow Builder</p>
                  <p className="text-xs text-blue-700">Design interactive screens with drag-and-drop</p>
                </div>
              </div>
            </div>

            {/* Object Selection - ONLY show for first screen AND only if NOT a Screen Flow with any launch mode */}
            {/* Screen Flows: Object selection hidden for ALL launch modes (basic, record_detail, list_view) */}
            {/* For Screen Flows: basic mode = no object needed, record_detail/list_view = inferred from context */}
            {isFirstScreen && flowType !== 'screen-flow' ? (
              <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-700">Associated Object (Optional)</Label>
                <Select
                  value={config.associatedObject || '__none__'}
                  onValueChange={(value) => handleConfigChange('associatedObject', value === '__none__' ? '' : value)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select object to associate with screen" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {objectsList.map(obj => (
                      <SelectItem key={obj.name} value={obj.name}>{obj.label || obj.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-500">
                  Object context for this Screen Flow. Defined once on the first screen.
                </p>
              </div>
            ) : flowType === 'screen-flow' && launchMode === 'basic' ? (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-xs text-blue-900 font-medium mb-1">
                  ℹ️ Basic Mode: No Object Required
                </p>
                <p className="text-xs text-blue-700">
                  This flow runs without record context (Home/App Page). No object association is required.
                </p>
              </div>
            ) : flowType === 'screen-flow' && launchMode === 'record_detail' ? (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-xs text-blue-900 font-medium mb-1">
                  ℹ️ Record Detail Mode: Object Inferred from Context
                </p>
                <p className="text-xs text-blue-700">
                  Object is automatically inferred from the record page where this flow is launched. 
                  The <code className="bg-blue-100 px-1 rounded font-mono">recordId</code> system variable is auto-populated.
                </p>
              </div>
            ) : flowType === 'screen-flow' && launchMode === 'list_view' ? (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-xs text-blue-900 font-medium mb-1">
                  ℹ️ List View Mode: Object Inferred from Context
                </p>
                <p className="text-xs text-blue-700">
                  Object is automatically inferred from the list view where this flow is launched. 
                  The <code className="bg-blue-100 px-1 rounded font-mono">recordIds</code> system variable contains all selected record IDs.
                </p>
              </div>
            ) : !isFirstScreen ? (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-xs text-blue-900 font-medium mb-1">
                  ℹ️ Salesforce Behavior: Object Inherited from First Screen
                </p>
                <p className="text-xs text-blue-700">
                  The associated object is defined on the first screen and automatically inherited by all subsequent screens in this flow.
                </p>
              </div>
            ) : null}

            {/* Screen Flow Object - Read-only indicator for Record Detail/List View modes */}
            {flowType === 'screen-flow' && (launchMode === 'record_detail' || launchMode === 'list_view') && isFirstScreen && screenFlowObject && (
              <div className="space-y-2">
                <Label className="text-sm font-medium text-slate-700">
                  Associated Object
                </Label>
                <div className="relative">
                  <Input
                    value={screenFlowObject}
                    readOnly
                    className="bg-gray-50 text-gray-700 font-medium cursor-not-allowed"
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2">
                    <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded font-medium">
                      Read-Only
                    </span>
                  </div>
                </div>
                <p className="text-xs text-gray-500">
                  This object was selected when creating the flow and is automatically used for {launchMode === 'record_detail' ? 'single record' : 'multiple records'} context.
                </p>
              </div>
            )}

            {/* Return URL - Optional redirect after screen */}
            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-700">
                Return URL (Optional)
              </Label>
              <Input
                value={config.return_url || ''}
                onChange={(e) => handleConfigChange('return_url', e.target.value)}
                placeholder="/record/{!varRecordId}"
                className="font-mono text-sm"
              />
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-xs text-blue-900 font-medium mb-1">
                  ℹ️ Salesforce Behavior: Redirect instead of continuing flow
                </p>
                <p className="text-xs text-blue-700 mb-2">
                  If provided, user will be redirected to this URL when clicking "Next" and the flow will terminate.
                </p>
                
                <p className="text-xs text-blue-700 font-medium mb-1">✅ Valid Variable References:</p>
                <ul className="text-xs text-blue-700 space-y-1 ml-4 mb-2">
                  <li>• <strong>Screen variables:</strong> <code className="bg-white px-1 rounded">{'{{Screen.email}}'}</code></li>
                  <li>• <strong>Flow variables:</strong> <code className="bg-white px-1 rounded">{'{{varLeadId}}'}</code></li>
                  <li>• <strong>Action outputs:</strong> <code className="bg-white px-1 rounded">{'{{createdLeadId}}'}</code> (if action executed before this screen)</li>
                  <li>• <strong>Trigger context:</strong> <code className="bg-white px-1 rounded">{'{{Trigger.Lead.Id}}'}</code> (Trigger Flows only)</li>
                </ul>

                <p className="text-xs text-blue-700 font-medium mb-1">📋 Examples:</p>
                <ul className="text-xs text-blue-700 space-y-1 ml-4">
                  <li>• <code className="bg-white px-1 rounded">/record/{'{{createdLeadId}}'}</code></li>
                  <li>• <code className="bg-white px-1 rounded">https://example.com/thank-you?email={'{{Screen.email}}'}</code></li>
                  <li>• <code className="bg-white px-1 rounded">/lightning/r/Lead/{'{{Trigger.Lead.Id}}'}/view</code></li>
                </ul>

                <div className="mt-2 pt-2 border-t border-blue-300">
                  <p className="text-xs text-blue-900 font-medium mb-1">
                    💡 To redirect to a newly created record:
                  </p>
                  <ol className="text-xs text-blue-700 space-y-1 ml-4">
                    <li>1. Add "Create Record" action BEFORE this screen</li>
                    <li>2. Store record ID in a flow variable (e.g., createdLeadId)</li>
                    <li>3. Use that variable in Return URL: <code className="bg-white px-1 rounded">/record/{'{{createdLeadId}}'}</code></li>
                  </ol>
                </div>
              </div>

              {/* Warning about invalid references */}
              {config.return_url && config.return_url.includes('NewRecord') && (
                <div className="bg-red-50 border border-red-300 rounded-lg p-3">
                  <p className="text-xs text-red-900 font-medium mb-1">
                    ⚠️ Invalid Variable Reference
                  </p>
                  <p className="text-xs text-red-800">
                    "NewRecord" is not automatically available. Store the record ID in a variable first using a Create Record action.
                  </p>
                </div>
              )}
            </div>

            {/* Screen Summary */}
            {config.screenTitle && (
              <div className="bg-white border-2 border-slate-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-semibold text-slate-900">Current Screen</h4>
                  <span className="text-xs text-slate-500">{(config.fields || []).length} component{(config.fields || []).length !== 1 ? 's' : ''}</span>
                </div>
                <p className="text-base font-medium text-slate-800 mb-1">{config.screenTitle}</p>
                {config.screenDescription && (
                  <p className="text-xs text-slate-600">{config.screenDescription}</p>
                )}
                {config.associatedObject && (
                  <div className="mt-2">
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                      Object: {config.associatedObject}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Open Screen Builder Button */}
            <Button
              type="button"
              onClick={() => setShowScreenBuilder(true)}
              className="w-full bg-blue-600 hover:bg-blue-700 h-12 text-base font-medium"
            >
              <Monitor className="w-5 h-5 mr-2" />
              {config.screenTitle ? 'Edit Screen in Builder' : 'Open Screen Builder'}
            </Button>

            {/* Quick Info */}
            <div className="bg-gradient-to-r from-gray-50 to-slate-50 border border-slate-200 rounded-lg p-3">
              <p className="text-xs font-semibold text-slate-700 mb-2">💡 Screen Builder Features:</p>
              <ul className="text-xs text-slate-600 space-y-1">
                <li>• Drag & drop components from palette</li>
                <li>• Reorder fields with visual editor</li>
                <li>• Configure properties in real-time</li>
                <li>• Preview responsive layouts</li>
                <li>• Available fields: Text, Number, Email, Phone, Date, Checkbox, Dropdown, Textarea</li>
              </ul>
            </div>

            {/* Screen Builder Modal - MANDATORY: Fixed viewport height */}
            {showScreenBuilder && (
              <Dialog open={showScreenBuilder} onOpenChange={setShowScreenBuilder}>
                <DialogContent 
                  className="max-w-[95vw] p-0 [&>button]:hidden" 
                  style={{ height: '95vh', maxHeight: '95vh', display: 'flex', flexDirection: 'column' }}
                >
                  <ScreenBuilder
                    node={node}
                    nodes={nodes}
                    onUpdate={(updatedConfig) => {
                      console.log('📥 ===== NODE CONFIG: RECEIVED FROM SCREEN BUILDER =====');
                      console.log('📥 Timestamp:', new Date().toISOString());
                      console.log('📥 Updated config:', updatedConfig);
                      
                      const fieldsArray = updatedConfig.fields || [];
                      const toastCount = fieldsArray.filter(f => f.type === 'Toast').length;
                      const fieldCount = fieldsArray.filter(f => f.type !== 'Toast').length;
                      
                      console.log('📥 Components breakdown:', {
                        total: fieldsArray.length,
                        fields: fieldCount,
                        toasts: toastCount
                      });
                      
                      if (toastCount > 0) {
                        console.log('📥 ✅ Toast components received:', fieldsArray.filter(f => f.type === 'Toast').map(t => ({
                          id: t.id,
                          type: t.type,
                          title: t.title,
                          message: t.message,
                          variant: t.variant
                        })));
                      } else {
                        console.warn('📥 ⚠️ NO TOAST COMPONENTS received from Screen Builder!');
                      }
                      
                      console.log('📥 Calling setConfig...');
                      try {
                        setConfig(updatedConfig);
                        console.log('📥 ✅ setConfig completed successfully');
                      } catch (error) {
                        console.error('📥 ❌ setConfig FAILED:', error);
                        throw error;
                      }
                      
                      // CRITICAL FIX: Update the node state immediately so Toast persists
                      console.log('📥 CRITICAL FIX: Updating node state with screen config...');
                      try {
                        onUpdate(node.id, updatedConfig, node.data?.label || 'Screen');
                        console.log('📥 ✅ Node state updated successfully - Toast will persist');
                      } catch (updateError) {
                        console.error('📥 ❌ Node state update FAILED:', updateError);
                        throw updateError;
                      }
                      
                      console.log('📥 Closing Screen Builder...');
                      setShowScreenBuilder(false);
                      console.log('📥 ===== END NODE CONFIG RECEIVED =====');
                    }}
                    onClose={() => setShowScreenBuilder(false)}
                  />
                </DialogContent>
              </Dialog>
            )}
          </div>
        );

      default:
        return (
          <div className="space-y-4">
            <div>
              <Label>Action Type</Label>
              <Input
                className="w-full"
                value={config.action || ''}
                onChange={(e) => handleConfigChange('action', e.target.value)}
                placeholder="Enter action name"
              />
            </div>
          </div>
        );
    }
  };

  return (
    <div className="w-full h-full bg-white px-6 py-3 overflow-y-auto">
    {/* Header */}
    <div className="flex items-center justify-end mb-2">
      {/* <h3 className="text-sm font-semibold text-slate-900">Configure Node</h3> */}
      <Button variant="ghost" size="sm" onClick={onClose}>
        <X className="h-4 w-4" />
      </Button>
    </div>

      {/* <div className="mb-4">
        <p className="text-xs text-slate-600">Node ID: {node?.id || 'unknown'}</p>
        <p className="text-xs text-slate-600">Type: {node?.data?.nodeType || node?.type || 'unknown'}</p>
      </div> */}

      {/* Label Input - Common for all node types */}
      <div className="mb-4">
        <Label className="text-sm font-medium text-slate-700">Node Label (Optional)</Label>
        <Input
          value={config.label || ''}
          onChange={(e) => handleConfigChange('label', e.target.value)}
          placeholder={`e.g., "Extract Domain", "Update All Contacts"...`}
          className="mt-1"
        />
        <p className="text-xs text-slate-500 mt-1">
          Custom label to display on canvas. If empty, shows node type.
        </p>
      </div>

      {renderConfigForm()}

      {/* Fault Path Section - Only show for eligible node types */}
      {canAddFaultPath && (
        <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <span className="text-sm font-medium text-amber-800">Fault Path</span>
            </div>
            {hasFaultPath ? (
              <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full font-medium">
                ✓ Configured
              </span>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  if (onAddFaultPath) {
                    onAddFaultPath(node?.id);
                  }
                }}
                className="text-xs border-amber-400 text-amber-700 hover:bg-amber-100"
              >
                Add Fault Path
              </Button>
            )}
          </div>
          <p className="text-xs text-amber-700 mt-2">
            {hasFaultPath 
              ? 'A fault path is configured. If this action fails, the flow will continue on the fault path instead of stopping.'
              : 'Add a fault path to handle errors gracefully. If this action fails at runtime, the flow will route to the fault path instead of failing completely.'}
          </p>
        </div>
      )}

      <div className="mt-4 space-y-2">
      <div className="flex gap-2">
        <Button onClick={handleSave} className="flex-1 bg-indigo-600 hover:bg-indigo-700">
          Save
        </Button>
        <Button onClick={onClose} variant="outline" className="flex-1">
          Cancel
        </Button>
      </div>

      <Button
        onClick={() => {
          if (window.confirm('Are you sure you want to delete this node?')) {
            onDelete(node?.id);
          }
        }}
        variant="outline"
        className="w-full text-red-600 hover:bg-red-50 border-red-200"
      >
        Delete Node
      </Button>
    </div>
  </div>
  );
};

export default NodeConfigPanel;