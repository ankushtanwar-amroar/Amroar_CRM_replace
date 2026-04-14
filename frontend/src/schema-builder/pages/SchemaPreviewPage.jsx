/**
 * Schema Builder - Visual ER Diagram (Enhanced)
 * ==============================================
 * 
 * A Salesforce-like visual representation of ALL CRM objects and their relationships.
 * This is a READ-ONLY view powered entirely by backend metadata.
 * 
 * RELATIONSHIP WIRING FEATURES:
 * - Wires anchored from exact field rows to target object headers
 * - Lookup = Dashed line, Master-Detail = Solid line, Broken = Red dotted
 * - Hover tooltips showing relationship details
 * - Click to highlight related objects and wires
 * - Focus mode dims unrelated elements
 * 
 * Data Source: /api/schema-builder/visualization/schema
 * 
 * NOTE: This does NOT create/edit schema - it only visualizes.
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  MarkerType,
  Panel,
  Handle,
  Position,
  getBezierPath,
  BaseEdge,
  EdgeLabelRenderer,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { 
  ArrowLeft, Database, Eye, EyeOff, Link, Link2Off, 
  LayoutGrid, Search, RefreshCw, ZoomIn, ZoomOut,
  X, ChevronRight, ChevronDown, Check, Filter,
  Building, Users, UserPlus, DollarSign, CheckSquare,
  Calendar, Mail, FileText, Hash, Phone, ToggleLeft, List,
  AlignLeft, Lock, AlertTriangle, AlertCircle
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Badge } from '../../components/ui/badge';
import { Separator } from '../../components/ui/separator';
import { Switch } from '../../components/ui/switch';
import { Label } from '../../components/ui/label';
import { Checkbox } from '../../components/ui/checkbox';
import { ScrollArea } from '../../components/ui/scroll-area';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;

// Object icon mapping
const OBJECT_ICONS = {
  'lead': UserPlus,
  'contact': Users,
  'account': Building,
  'opportunity': DollarSign,
  'task': CheckSquare,
  'event': Calendar,
  'emailmessage': Mail,
  'user-plus': UserPlus,
  'users': Users,
  'building': Building,
  'dollar-sign': DollarSign,
  'check-square': CheckSquare,
  'calendar': Calendar,
  'mail': Mail,
  'database': Database,
};

// Field type icons
const FIELD_TYPE_ICONS = {
  text: FileText,
  number: Hash,
  email: Mail,
  phone: Phone,
  date: Calendar,
  datetime: Calendar,
  checkbox: ToggleLeft,
  boolean: ToggleLeft,
  picklist: List,
  multipicklist: List,
  textarea: AlignLeft,
  long_text: AlignLeft,
  lookup: Link,
  master_detail: Link,
  currency: DollarSign,
  percent: Hash,
  url: Link,
};

// Field type colors for badges
const FIELD_TYPE_COLORS = {
  text: 'bg-slate-100 text-slate-700',
  number: 'bg-blue-100 text-blue-700',
  email: 'bg-green-100 text-green-700',
  phone: 'bg-purple-100 text-purple-700',
  date: 'bg-amber-100 text-amber-700',
  datetime: 'bg-amber-100 text-amber-700',
  checkbox: 'bg-emerald-100 text-emerald-700',
  boolean: 'bg-emerald-100 text-emerald-700',
  picklist: 'bg-orange-100 text-orange-700',
  multipicklist: 'bg-rose-100 text-rose-700',
  textarea: 'bg-slate-100 text-slate-700',
  long_text: 'bg-slate-100 text-slate-700',
  lookup: 'bg-indigo-100 text-indigo-700',
  master_detail: 'bg-purple-100 text-purple-700',
  currency: 'bg-emerald-100 text-emerald-700',
  percent: 'bg-lime-100 text-lime-700',
  url: 'bg-sky-100 text-sky-700',
};

const getObjectIcon = (iconName) => {
  return OBJECT_ICONS[iconName?.toLowerCase()] || OBJECT_ICONS.database;
};

// Field row height for calculating handle positions
const FIELD_ROW_HEIGHT = 32;
const HEADER_HEIGHT = 56;
const FIELD_PADDING = 8;
const MAX_DISPLAY_FIELDS = 15;

// ========================================
// Custom Object Node Component with Field Handles
// ========================================
const ObjectNode = React.memo(({ data, selected }) => {
  const { 
    object, 
    isHighlighted, 
    isDimmed,
    showFields, 
    onObjectClick,
    highlightedFields = new Set()
  } = data;
  
  const Icon = getObjectIcon(object.icon || object.api_name);
  
  // Get non-system fields for display - PRIORITIZE lookup fields to ensure handles exist
  const allNonSystemFields = (object.fields || []).filter(f => !f.is_system);
  
  // Sort fields: lookup/master_detail first (for relationship handles), then others
  const sortedFields = [...allNonSystemFields].sort((a, b) => {
    const aIsLookup = a.field_type === 'lookup' || a.field_type === 'master_detail';
    const bIsLookup = b.field_type === 'lookup' || b.field_type === 'master_detail';
    if (aIsLookup && !bIsLookup) return -1;
    if (!aIsLookup && bIsLookup) return 1;
    return 0;
  });
  
  const displayFields = showFields ? sortedFields.slice(0, MAX_DISPLAY_FIELDS) : [];
  const hasMoreFields = allNonSystemFields.length > MAX_DISPLAY_FIELDS;
  const systemFieldCount = (object.fields || []).filter(f => f.is_system).length;
  const lookupFields = allNonSystemFields.filter(f => f.field_type === 'lookup' || f.field_type === 'master_detail');
  
  return (
    <div 
      className={`bg-white rounded-lg shadow-lg border-2 transition-all duration-200 min-w-[300px] max-w-[320px] cursor-pointer relative ${
        isDimmed 
          ? 'opacity-30 border-slate-200'
          : isHighlighted 
            ? 'border-indigo-500 ring-2 ring-indigo-200 shadow-xl z-10' 
            : selected
              ? 'border-indigo-400 shadow-lg'
              : 'border-slate-200 hover:border-indigo-300'
      }`}
      onClick={() => onObjectClick?.(object)}
      data-testid={`schema-object-${object.api_name}`}
    >
      {/* Target Handle - Top center for incoming relationships */}
      <Handle
        type="target"
        position={Position.Top}
        id={`${object.api_name}-target`}
        className="!w-3 !h-3 !bg-indigo-500 !border-2 !border-white"
        style={{ top: -6 }}
      />
      
      {/* Header */}
      <div className={`px-4 py-3 rounded-t-lg relative ${
        isHighlighted ? 'bg-indigo-600' : object.is_standard ? 'bg-slate-700' : 'bg-emerald-600'
      }`}>
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-white" />
          <span className="font-semibold text-white truncate">{object.label}</span>
        </div>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs text-white/70">{object.api_name}</span>
          <Badge 
            variant="secondary" 
            className={`text-xs h-4 px-1.5 ${
              object.is_standard 
                ? 'bg-slate-600 text-slate-200' 
                : 'bg-emerald-700 text-emerald-100'
            }`}
          >
            {object.is_standard ? 'Standard' : 'Custom'}
          </Badge>
        </div>
      </div>

      {/* Fields List */}
      {showFields && (
        <div className="p-2">
          {displayFields.length > 0 ? (
            <div className="space-y-1">
              {displayFields.map((field, idx) => {
                const FieldIcon = FIELD_TYPE_ICONS[field.field_type] || FileText;
                const isLookup = field.field_type === 'lookup' || field.field_type === 'master_detail';
                const isMasterDetail = field.field_type === 'master_detail';
                const isFieldHighlighted = highlightedFields.has(field.name);
                
                return (
                  <div
                    key={`${field.name}-${idx}`}
                    id={`field-${object.api_name}-${field.name}`}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded text-sm relative transition-all ${
                      isFieldHighlighted
                        ? 'bg-indigo-100 border-2 border-indigo-400 shadow-sm'
                        : isLookup 
                          ? isMasterDetail
                            ? 'bg-purple-50 border border-purple-200'
                            : 'bg-indigo-50 border border-indigo-100' 
                          : 'bg-slate-50'
                    }`}
                  >
                    <FieldIcon className={`h-3.5 w-3.5 flex-shrink-0 ${
                      isFieldHighlighted
                        ? 'text-indigo-700'
                        : isLookup 
                          ? isMasterDetail ? 'text-purple-600' : 'text-indigo-600' 
                          : 'text-slate-500'
                    }`} />
                    <span className={`truncate flex-1 text-xs ${
                      isFieldHighlighted ? 'text-indigo-900 font-medium' : 'text-slate-700'
                    }`}>{field.label}</span>
                    {field.is_required && (
                      <span className="text-red-500 text-xs font-bold">*</span>
                    )}
                    {isLookup && field.lookup_object && (
                      <span className={`text-xs flex items-center gap-0.5 ${
                        isMasterDetail ? 'text-purple-600' : 'text-indigo-600'
                      }`}>
                        <ChevronRight className="h-3 w-3" />
                        <span className="truncate max-w-[60px]">{field.lookup_object}</span>
                      </span>
                    )}
                    
                    {/* Source Handle - Right side for each lookup field */}
                    {isLookup && field.lookup_object && (
                      <Handle
                        type="source"
                        position={Position.Right}
                        id={`${object.api_name}-${field.name}`}
                        className={`!w-2.5 !h-2.5 !border-2 !border-white ${
                          isMasterDetail ? '!bg-purple-500' : '!bg-indigo-500'
                        }`}
                        style={{ right: -6 }}
                      />
                    )}
                  </div>
                );
              })}
              
              {hasMoreFields && (
                <div className="text-xs text-slate-400 px-2 py-1 text-center">
                  +{allNonSystemFields.length - MAX_DISPLAY_FIELDS} more fields
                </div>
              )}
            </div>
          ) : (
            <div className="text-xs text-slate-400 px-2 py-2 text-center">
              No custom fields
            </div>
          )}
          
          {/* System fields indicator */}
          {systemFieldCount > 0 && (
            <div className="flex items-center gap-1 text-xs text-slate-400 px-2 pt-2 border-t border-slate-100 mt-2">
              <Lock className="h-3 w-3" />
              <span>{systemFieldCount} system field{systemFieldCount !== 1 ? 's' : ''}</span>
            </div>
          )}
        </div>
      )}

      {/* Collapsed state summary */}
      {!showFields && (
        <div className="px-4 py-2 text-xs text-slate-500 flex items-center gap-2 relative">
          <span>{object.field_count} field{object.field_count !== 1 ? 's' : ''}</span>
          {lookupFields.length > 0 && (
            <>
              <span>•</span>
              <span className="text-indigo-600">
                {lookupFields.length} relationship{lookupFields.length !== 1 ? 's' : ''}
              </span>
            </>
          )}
          
          {/* Collapsed state - single source handle for all relationships */}
          {lookupFields.map((field, idx) => (
            <Handle
              key={field.name}
              type="source"
              position={Position.Right}
              id={`${object.api_name}-${field.name}`}
              className="!w-2 !h-2 !bg-indigo-500 !border-2 !border-white"
              style={{ right: -4, top: `${50 + idx * 8}%` }}
            />
          ))}
        </div>
      )}
    </div>
  );
});

// ========================================
// Custom Relationship Edge with Proper Styling
// ========================================
const RelationshipEdge = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  markerEnd,
  style,
  selected,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  
  const { 
    relationshipType, 
    sourceField, 
    sourceObject,
    targetObject,
    label,
    isHighlighted,
    isDimmed,
    isBroken
  } = data || {};
  
  // Calculate bezier path
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    curvature: 0.3,
  });
  
  // Determine line style based on relationship type
  const getLineStyle = () => {
    if (isBroken) {
      return {
        stroke: '#ef4444', // Red for broken
        strokeWidth: isHighlighted || isHovered ? 3 : 2,
        strokeDasharray: '4 4', // Dotted
        opacity: isDimmed ? 0.2 : 1,
      };
    }
    
    if (relationshipType === 'master_detail') {
      return {
        stroke: isHighlighted || isHovered ? '#7c3aed' : '#a78bfa', // Purple for master-detail
        strokeWidth: isHighlighted || isHovered ? 3 : 2,
        strokeDasharray: 'none', // Solid line
        opacity: isDimmed ? 0.2 : 1,
      };
    }
    
    // Default: lookup - dashed line
    return {
      stroke: isHighlighted || isHovered ? '#6366f1' : '#a5b4fc', // Indigo for lookup
      strokeWidth: isHighlighted || isHovered ? 3 : 2,
      strokeDasharray: '8 4', // Dashed
      opacity: isDimmed ? 0.2 : 1,
    };
  };
  
  const lineStyle = getLineStyle();
  
  // Marker color matches line
  const markerColor = isBroken ? '#ef4444' : relationshipType === 'master_detail' ? '#7c3aed' : '#6366f1';
  
  return (
    <>
      {/* Invisible wider path for easier hover detection */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{ cursor: 'pointer' }}
      />
      
      {/* Visible edge path */}
      <BaseEdge
        id={id}
        path={edgePath}
        style={lineStyle}
        markerEnd={markerEnd}
      />
      
      {/* Tooltip on hover */}
      {isHovered && (
        <EdgeLabelRenderer>
          <div
            className="absolute bg-slate-900 text-white px-3 py-2 rounded-lg shadow-xl text-xs pointer-events-none z-50"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY - 30}px)`,
            }}
          >
            <div className="font-semibold mb-1 flex items-center gap-2">
              {isBroken ? (
                <AlertCircle className="h-3.5 w-3.5 text-red-400" />
              ) : (
                <Link className="h-3.5 w-3.5 text-indigo-400" />
              )}
              <span>{isBroken ? 'Broken Reference' : relationshipType === 'master_detail' ? 'Master-Detail' : 'Lookup'}</span>
            </div>
            <div className="space-y-0.5 text-slate-300">
              <div><span className="text-slate-500">From:</span> {sourceObject}.{sourceField}</div>
              <div><span className="text-slate-500">To:</span> {targetObject}</div>
            </div>
            {/* Arrow indicator */}
            <div 
              className="absolute w-2 h-2 bg-slate-900 transform rotate-45"
              style={{ bottom: -4, left: '50%', marginLeft: -4 }}
            />
          </div>
        </EdgeLabelRenderer>
      )}
      
      {/* Small label on the edge when highlighted */}
      {(isHighlighted || isHovered) && !isDimmed && (
        <EdgeLabelRenderer>
          <div
            className={`absolute px-1.5 py-0.5 rounded text-xs font-medium pointer-events-none ${
              isBroken 
                ? 'bg-red-100 text-red-700' 
                : relationshipType === 'master_detail'
                  ? 'bg-purple-100 text-purple-700'
                  : 'bg-indigo-100 text-indigo-700'
            }`}
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
          >
            {sourceField}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
};

// Node and edge types
const nodeTypes = {
  schemaObject: ObjectNode,
};

const edgeTypes = {
  relationship: RelationshipEdge,
};

// ========================================
// Main Schema Preview Page
// ========================================
export default function SchemaPreviewPage() {
  const navigate = useNavigate();
  const reactFlowWrapper = useRef(null);
  
  // State
  const [schemaData, setSchemaData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showFields, setShowFields] = useState(true);
  const [showRelationships, setShowRelationships] = useState(true);
  const [selectedObject, setSelectedObject] = useState(null);
  const [highlightedObjects, setHighlightedObjects] = useState(new Set());
  const [highlightedRelationships, setHighlightedRelationships] = useState(new Set());
  const [highlightedFields, setHighlightedFields] = useState(new Map()); // object -> Set of fields
  const [visibleObjects, setVisibleObjects] = useState(new Set());
  const [filterType, setFilterType] = useState('all'); // 'all', 'standard', 'custom'
  const [focusMode, setFocusMode] = useState(false);
  
  // React Flow state
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  
  // Auth
  const getToken = () => localStorage.getItem('token');
  const authHeaders = { 'Authorization': `Bearer ${getToken()}`, 'Content-Type': 'application/json' };

  // Fetch schema visualization data
  const fetchSchemaData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(`${API_URL}/api/schema-builder/visualization/schema`, {
        headers: authHeaders
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch schema data');
      }
      
      const data = await response.json();
      setSchemaData(data);
      
      // Initialize all objects as visible
      const allObjectNames = new Set(data.objects.map(o => o.api_name));
      setVisibleObjects(allObjectNames);
      
      toast.success(`Loaded ${data.object_count} objects, ${data.relationship_count} relationships`);
    } catch (err) {
      console.error('Error fetching schema:', err);
      setError(err.message);
      toast.error('Failed to load schema');
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchSchemaData();
  }, [fetchSchemaData]);

  // Filter objects based on search and type
  const filteredObjects = useMemo(() => {
    if (!schemaData?.objects) return [];
    
    return schemaData.objects.filter(obj => {
      // Type filter
      if (filterType === 'standard' && !obj.is_standard) return false;
      if (filterType === 'custom' && obj.is_standard) return false;
      
      // Search filter
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        return obj.label.toLowerCase().includes(term) || 
               obj.api_name.toLowerCase().includes(term);
      }
      
      return true;
    });
  }, [schemaData, searchTerm, filterType]);

  // Toggle object visibility
  const toggleObjectVisibility = useCallback((apiName) => {
    setVisibleObjects(prev => {
      const next = new Set(prev);
      if (next.has(apiName)) {
        next.delete(apiName);
      } else {
        next.add(apiName);
      }
      return next;
    });
  }, []);

  // Select/deselect all
  const selectAll = useCallback(() => {
    const allNames = new Set(filteredObjects.map(o => o.api_name));
    setVisibleObjects(prev => new Set([...prev, ...allNames]));
  }, [filteredObjects]);

  const deselectAll = useCallback(() => {
    const filteredNames = new Set(filteredObjects.map(o => o.api_name));
    setVisibleObjects(prev => {
      const next = new Set(prev);
      filteredNames.forEach(name => next.delete(name));
      return next;
    });
  }, [filteredObjects]);

  // Handle object click - highlight related objects and relationships
  const handleObjectClick = useCallback((object) => {
    setSelectedObject(object);
    setFocusMode(true);
    
    // Highlight related objects
    const relatedObjects = new Set([object.api_name]);
    const relatedRelationships = new Set();
    const fieldHighlights = new Map();
    
    // Outgoing relationships (fields in this object that point to others)
    const thisObjectFields = new Set();
    (object.fields || []).forEach(field => {
      if ((field.field_type === 'lookup' || field.field_type === 'master_detail') && field.lookup_object) {
        relatedObjects.add(field.lookup_object);
        thisObjectFields.add(field.name);
        // Find the relationship ID
        const rel = schemaData?.relationships.find(
          r => r.source_object === object.api_name && r.source_field === field.name
        );
        if (rel) relatedRelationships.add(rel.id);
      }
    });
    if (thisObjectFields.size > 0) {
      fieldHighlights.set(object.api_name, thisObjectFields);
    }
    
    // Incoming relationships (other objects that point to this one)
    if (schemaData?.relationships) {
      schemaData.relationships.forEach(rel => {
        if (rel.target_object === object.api_name) {
          relatedObjects.add(rel.source_object);
          relatedRelationships.add(rel.id);
          // Highlight the source field
          if (!fieldHighlights.has(rel.source_object)) {
            fieldHighlights.set(rel.source_object, new Set());
          }
          fieldHighlights.get(rel.source_object).add(rel.source_field);
        }
      });
    }
    
    setHighlightedObjects(relatedObjects);
    setHighlightedRelationships(relatedRelationships);
    setHighlightedFields(fieldHighlights);
  }, [schemaData]);

  // Clear selection
  const clearSelection = useCallback(() => {
    setSelectedObject(null);
    setHighlightedObjects(new Set());
    setHighlightedRelationships(new Set());
    setHighlightedFields(new Map());
    setFocusMode(false);
  }, []);

  // Generate nodes from visible objects
  useEffect(() => {
    if (!schemaData?.objects) return;
    
    const visibleObjs = schemaData.objects.filter(obj => visibleObjects.has(obj.api_name));
    
    // Calculate layout - grid with 3 columns
    const newNodes = visibleObjs.map((obj, index) => {
      const col = index % 3;
      const row = Math.floor(index / 3);
      const x = 100 + col * 380;
      const y = 100 + row * (showFields ? 420 : 160);
      
      return {
        id: obj.api_name,
        type: 'schemaObject',
        position: { x, y },
        data: {
          object: obj,
          isHighlighted: highlightedObjects.has(obj.api_name),
          isDimmed: focusMode && !highlightedObjects.has(obj.api_name),
          showFields,
          onObjectClick: handleObjectClick,
          highlightedFields: highlightedFields.get(obj.api_name) || new Set(),
        },
        draggable: true,
      };
    });
    
    setNodes(newNodes);
  }, [schemaData, visibleObjects, showFields, highlightedObjects, highlightedFields, focusMode, handleObjectClick, setNodes]);

  // Generate edges from relationships with proper anchoring
  useEffect(() => {
    if (!schemaData?.relationships || !showRelationships) {
      setEdges([]);
      return;
    }
    
    const newEdges = schemaData.relationships
      .filter(rel => visibleObjects.has(rel.source_object) && visibleObjects.has(rel.target_object))
      .map(rel => {
        const isHighlighted = highlightedRelationships.has(rel.id);
        const isDimmed = focusMode && !isHighlighted;
        
        return {
          id: rel.id,
          source: rel.source_object,
          sourceHandle: `${rel.source_object}-${rel.source_field}`, // Connect from specific field
          target: rel.target_object,
          targetHandle: `${rel.target_object}-target`, // Connect to object header
          type: 'relationship',
          data: {
            relationshipType: rel.relationship_type,
            sourceField: rel.source_field,
            sourceObject: rel.source_object,
            targetObject: rel.target_object,
            label: rel.label,
            isHighlighted,
            isDimmed,
            isBroken: false, // TODO: detect if target doesn't exist
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: rel.relationship_type === 'master_detail' ? '#7c3aed' : '#6366f1',
            width: 20,
            height: 20,
          },
          animated: false,
          style: {
            strokeWidth: 2,
          },
        };
      });
    
    setEdges(newEdges);
  }, [schemaData, visibleObjects, showRelationships, highlightedRelationships, focusMode, setEdges]);

  // Auto-layout function
  const handleAutoLayout = useCallback(() => {
    if (!nodes.length) return;
    
    const newNodes = nodes.map((node, index) => {
      const col = index % 3;
      const row = Math.floor(index / 3);
      return {
        ...node,
        position: {
          x: 100 + col * 380,
          y: 100 + row * (showFields ? 420 : 160),
        },
      };
    });
    setNodes(newNodes);
    toast.success('Layout reset');
  }, [nodes, showFields, setNodes]);

  // Handle pane click
  const onPaneClick = useCallback(() => {
    clearSelection();
  }, [clearSelection]);

  // Get stats for display
  const stats = useMemo(() => {
    if (!schemaData) return { visible: 0, total: 0, relationships: 0 };
    return {
      visible: visibleObjects.size,
      total: schemaData.object_count,
      relationships: schemaData.relationships.filter(
        rel => visibleObjects.has(rel.source_object) && visibleObjects.has(rel.target_object)
      ).length,
      totalRelationships: schemaData.relationship_count,
    };
  }, [schemaData, visibleObjects]);

  // Count relationships per object for sidebar badges
  const getObjectRelationshipCount = useCallback((apiName) => {
    if (!schemaData?.relationships) return { outgoing: 0, incoming: 0 };
    
    const outgoing = schemaData.relationships.filter(r => r.source_object === apiName).length;
    const incoming = schemaData.relationships.filter(r => r.target_object === apiName).length;
    
    return { outgoing, incoming, total: outgoing + incoming };
  }, [schemaData]);

  return (
    <div className="h-screen flex flex-col bg-slate-100" data-testid="schema-builder-visualization">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 shadow-sm z-20">
        <div className="px-4 py-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/setup')}
                className="text-slate-600"
                data-testid="back-to-setup-btn"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Setup
              </Button>
              <Separator orientation="vertical" className="h-6" />
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-indigo-100 rounded-lg">
                  <Database className="h-5 w-5 text-indigo-600" />
                </div>
                <div>
                  <h1 className="text-lg font-bold text-slate-800">Schema Builder</h1>
                  <p className="text-xs text-slate-500">Visual ER Diagram • Read-Only</p>
                </div>
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center space-x-3">
              {/* Focus mode indicator */}
              {focusMode && (
                <Badge 
                  variant="secondary" 
                  className="bg-indigo-100 text-indigo-700 cursor-pointer hover:bg-indigo-200"
                  onClick={clearSelection}
                >
                  Focus Mode • Click to exit
                </Badge>
              )}
              
              {/* Toggle Fields */}
              <div className="flex items-center space-x-2 bg-slate-50 px-3 py-1.5 rounded-lg">
                <Switch
                  id="show-fields"
                  checked={showFields}
                  onCheckedChange={setShowFields}
                  className="data-[state=checked]:bg-indigo-600"
                />
                <Label htmlFor="show-fields" className="text-sm text-slate-600 cursor-pointer flex items-center gap-1">
                  {showFields ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                  Fields
                </Label>
              </div>

              {/* Toggle Relationships */}
              <div className="flex items-center space-x-2 bg-slate-50 px-3 py-1.5 rounded-lg">
                <Switch
                  id="show-relationships"
                  checked={showRelationships}
                  onCheckedChange={setShowRelationships}
                  className="data-[state=checked]:bg-indigo-600"
                />
                <Label htmlFor="show-relationships" className="text-sm text-slate-600 cursor-pointer flex items-center gap-1">
                  {showRelationships ? <Link className="h-4 w-4" /> : <Link2Off className="h-4 w-4" />}
                  Wires
                </Label>
              </div>

              {/* Auto Layout */}
              <Button
                variant="outline"
                size="sm"
                onClick={handleAutoLayout}
                data-testid="auto-layout-btn"
              >
                <LayoutGrid className="h-4 w-4 mr-1.5" />
                Reset Layout
              </Button>

              {/* Refresh */}
              <Button
                variant="outline"
                size="sm"
                onClick={fetchSchemaData}
                disabled={loading}
                data-testid="refresh-schema-btn"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar - Object List */}
        <aside className="w-72 bg-white border-r border-slate-200 flex flex-col">
          {/* Search & Filter */}
          <div className="p-3 border-b border-slate-200 space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                type="text"
                placeholder="Search objects..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 h-9"
                data-testid="search-objects-input"
              />
            </div>
            
            {/* Filter Tabs */}
            <div className="flex gap-1">
              {['all', 'standard', 'custom'].map((type) => (
                <Button
                  key={type}
                  variant={filterType === type ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setFilterType(type)}
                  className={`flex-1 h-7 text-xs ${filterType === type ? 'bg-indigo-600' : ''}`}
                >
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </Button>
              ))}
            </div>
            
            {/* Select All / None */}
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={selectAll} className="flex-1 h-7 text-xs">
                Select All
              </Button>
              <Button variant="outline" size="sm" onClick={deselectAll} className="flex-1 h-7 text-xs">
                Clear All
              </Button>
            </div>
          </div>

          {/* Object List */}
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-1">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="h-6 w-6 animate-spin text-indigo-600" />
                </div>
              ) : filteredObjects.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  <Database className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No objects found</p>
                </div>
              ) : (
                filteredObjects.map((obj) => {
                  const Icon = getObjectIcon(obj.icon || obj.api_name);
                  const isVisible = visibleObjects.has(obj.api_name);
                  const isSelected = selectedObject?.api_name === obj.api_name;
                  const relCounts = getObjectRelationshipCount(obj.api_name);
                  
                  return (
                    <div
                      key={obj.api_name}
                      className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors ${
                        isSelected 
                          ? 'bg-indigo-100 border border-indigo-300' 
                          : isVisible 
                            ? 'bg-slate-50 hover:bg-slate-100' 
                            : 'opacity-50 hover:opacity-70'
                      }`}
                      data-testid={`sidebar-object-${obj.api_name}`}
                    >
                      <Checkbox
                        checked={isVisible}
                        onCheckedChange={() => toggleObjectVisibility(obj.api_name)}
                        className="data-[state=checked]:bg-indigo-600 data-[state=checked]:border-indigo-600"
                      />
                      <div 
                        className="flex items-center gap-2 flex-1 min-w-0"
                        onClick={() => {
                          if (isVisible) handleObjectClick(obj);
                        }}
                      >
                        <div className={`p-1.5 rounded ${obj.is_standard ? 'bg-slate-200' : 'bg-emerald-100'}`}>
                          <Icon className={`h-3.5 w-3.5 ${obj.is_standard ? 'text-slate-600' : 'text-emerald-600'}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-slate-800 truncate">{obj.label}</div>
                          <div className="text-xs text-slate-500 truncate">{obj.api_name}</div>
                        </div>
                        {/* Relationship count badges */}
                        {relCounts.total > 0 && (
                          <div className="flex items-center gap-1">
                            {relCounts.outgoing > 0 && (
                              <Badge 
                                variant="outline" 
                                className="text-xs h-5 px-1 bg-indigo-50 text-indigo-600 border-indigo-200"
                                title={`${relCounts.outgoing} outgoing`}
                              >
                                →{relCounts.outgoing}
                              </Badge>
                            )}
                            {relCounts.incoming > 0 && (
                              <Badge 
                                variant="outline" 
                                className="text-xs h-5 px-1 bg-emerald-50 text-emerald-600 border-emerald-200"
                                title={`${relCounts.incoming} incoming`}
                              >
                                ←{relCounts.incoming}
                              </Badge>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </ScrollArea>

          {/* Sidebar Footer - Legend */}
          <div className="p-3 border-t border-slate-200 bg-slate-50 space-y-2">
            <div className="text-xs font-semibold text-slate-600 mb-2">Relationship Types</div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-xs">
                <div className="w-8 h-0 border-t-2 border-dashed border-indigo-400" />
                <span className="text-slate-600">Lookup (loose reference)</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <div className="w-8 h-0 border-t-2 border-solid border-purple-500" />
                <span className="text-slate-600">Master-Detail (ownership)</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <div className="w-8 h-0 border-t-2 border-dotted border-red-400" />
                <span className="text-slate-600">Broken (invalid target)</span>
              </div>
            </div>
            <Separator className="my-2" />
            <div className="text-xs text-slate-500 space-y-1">
              <div className="flex justify-between">
                <span>Visible:</span>
                <span className="font-medium">{stats.visible} / {stats.total}</span>
              </div>
              <div className="flex justify-between">
                <span>Wires:</span>
                <span className="font-medium">{stats.relationships} / {stats.totalRelationships}</span>
              </div>
            </div>
          </div>
        </aside>

        {/* Canvas */}
        <div className="flex-1 relative" ref={reactFlowWrapper}>
          {error ? (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-50">
              <div className="text-center">
                <AlertTriangle className="h-12 w-12 text-red-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-slate-800 mb-2">Failed to load schema</h3>
                <p className="text-sm text-slate-500 mb-4">{error}</p>
                <Button onClick={fetchSchemaData}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Retry
                </Button>
              </div>
            </div>
          ) : visibleObjects.size === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-50">
              <div className="text-center">
                <Database className="h-12 w-12 text-slate-300 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-slate-600 mb-2">No objects selected</h3>
                <p className="text-sm text-slate-500 mb-4">
                  Select objects from the left sidebar to visualize them
                </p>
              </div>
            </div>
          ) : (
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onPaneClick={onPaneClick}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              fitView
              fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
              minZoom={0.1}
              maxZoom={2}
              defaultViewport={{ x: 0, y: 0, zoom: 0.7 }}
              proOptions={{ hideAttribution: true }}
              snapToGrid={true}
              snapGrid={[20, 20]}
              connectionMode="loose"
            >
              <Background color="#cbd5e1" gap={20} size={1} />
              <Controls 
                showZoom={true}
                showFitView={true}
                showInteractive={false}
                position="bottom-right"
              />
              <MiniMap 
                nodeColor={(node) => {
                  if (highlightedObjects.has(node.id)) return '#6366f1';
                  if (focusMode && !highlightedObjects.has(node.id)) return '#e2e8f0';
                  const obj = schemaData?.objects.find(o => o.api_name === node.id);
                  return obj?.is_standard ? '#64748b' : '#10b981';
                }}
                maskColor="rgba(0, 0, 0, 0.08)"
                className="bg-white border border-slate-200 rounded-lg"
                pannable
                zoomable
              />
              
              {/* Legend Panel */}
              <Panel position="top-left" className="bg-white rounded-lg shadow-lg border border-slate-200 p-3">
                <div className="text-xs font-semibold text-slate-700 mb-2">Legend</div>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-3 bg-slate-700 rounded-sm" />
                    <span className="text-xs text-slate-600">Standard Object</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-3 bg-emerald-600 rounded-sm" />
                    <span className="text-xs text-slate-600">Custom Object</span>
                  </div>
                  <Separator className="my-1" />
                  <div className="flex items-center gap-2">
                    <svg width="24" height="12">
                      <line x1="0" y1="6" x2="24" y2="6" stroke="#a5b4fc" strokeWidth="2" strokeDasharray="6 3" />
                    </svg>
                    <span className="text-xs text-slate-600">Lookup</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <svg width="24" height="12">
                      <line x1="0" y1="6" x2="24" y2="6" stroke="#a78bfa" strokeWidth="2" />
                    </svg>
                    <span className="text-xs text-slate-600">Master-Detail</span>
                  </div>
                </div>
              </Panel>
            </ReactFlow>
          )}
        </div>

        {/* Right Panel - Object Details */}
        {selectedObject && (
          <aside className="w-80 bg-white border-l border-slate-200 overflow-y-auto">
            <div className="p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-slate-800">Object Details</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearSelection}
                  className="h-8 w-8 p-0"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* Object Info */}
              <div className="space-y-4">
                <div className={`p-4 rounded-lg ${selectedObject.is_standard ? 'bg-slate-100' : 'bg-emerald-50'}`}>
                  <div className="flex items-center gap-3 mb-2">
                    {React.createElement(getObjectIcon(selectedObject.icon || selectedObject.api_name), {
                      className: `h-5 w-5 ${selectedObject.is_standard ? 'text-slate-600' : 'text-emerald-600'}`
                    })}
                    <span className="font-semibold text-slate-800">{selectedObject.label}</span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="text-xs">{selectedObject.api_name}</Badge>
                    <Badge 
                      variant="secondary" 
                      className={`text-xs ${selectedObject.is_standard ? 'bg-slate-200' : 'bg-emerald-200 text-emerald-800'}`}
                    >
                      {selectedObject.is_standard ? 'Standard' : 'Custom'}
                    </Badge>
                  </div>
                  {selectedObject.description && (
                    <p className="text-sm text-slate-600 mt-2">{selectedObject.description}</p>
                  )}
                </div>

                {/* Outgoing Relationships */}
                {(() => {
                  const outgoing = schemaData?.relationships.filter(r => r.source_object === selectedObject.api_name) || [];
                  if (outgoing.length === 0) return null;
                  
                  return (
                    <div>
                      <h4 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                        <span className="text-indigo-600">→</span>
                        Outgoing ({outgoing.length})
                      </h4>
                      <div className="space-y-1">
                        {outgoing.map((rel, idx) => (
                          <div
                            key={`out-${idx}`}
                            className={`flex items-center gap-2 p-2 rounded text-sm ${
                              rel.relationship_type === 'master_detail' 
                                ? 'bg-purple-50 border border-purple-200' 
                                : 'bg-indigo-50 border border-indigo-200'
                            }`}
                          >
                            <Link className={`h-4 w-4 ${
                              rel.relationship_type === 'master_detail' ? 'text-purple-600' : 'text-indigo-600'
                            }`} />
                            <div className="flex-1 min-w-0">
                              <span className="text-slate-700 truncate">{rel.source_field}</span>
                            </div>
                            <ChevronRight className="h-3 w-3 text-slate-400" />
                            <Badge variant="outline" className="text-xs">
                              {rel.target_object}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {/* Incoming Relationships */}
                {(() => {
                  const incoming = schemaData?.relationships.filter(r => r.target_object === selectedObject.api_name) || [];
                  if (incoming.length === 0) return null;
                  
                  return (
                    <div>
                      <h4 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                        <span className="text-emerald-600">←</span>
                        Incoming ({incoming.length})
                      </h4>
                      <div className="space-y-1">
                        {incoming.map((rel, idx) => (
                          <div
                            key={`in-${idx}`}
                            className="flex items-center gap-2 p-2 bg-emerald-50 border border-emerald-200 rounded text-sm"
                          >
                            <Badge variant="outline" className="text-xs">
                              {rel.source_object}
                            </Badge>
                            <span className="text-slate-600 text-xs">.{rel.source_field}</span>
                            <ChevronRight className="h-3 w-3 text-slate-400" />
                            <span className="text-emerald-700 font-medium">this</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {/* Fields */}
                <div>
                  <h4 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Fields ({selectedObject.field_count})
                  </h4>
                  <ScrollArea className="max-h-48">
                    <div className="space-y-1">
                      {(selectedObject.fields || []).slice(0, 20).map((field, idx) => {
                        const FieldIcon = FIELD_TYPE_ICONS[field.field_type] || FileText;
                        const isLookup = field.field_type === 'lookup' || field.field_type === 'master_detail';
                        
                        return (
                          <div
                            key={`${field.name}-${idx}`}
                            className={`flex items-center justify-between p-2 rounded text-sm ${
                              field.is_system ? 'bg-slate-50 opacity-60' : isLookup ? 'bg-indigo-50' : 'bg-slate-50'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <FieldIcon className={`h-3.5 w-3.5 flex-shrink-0 ${
                                isLookup ? 'text-indigo-600' : 'text-slate-500'
                              }`} />
                              <span className="text-slate-700 truncate">{field.label}</span>
                              {field.is_system && (
                                <Lock className="h-3 w-3 text-slate-400" />
                              )}
                            </div>
                            <Badge className={`text-xs ${FIELD_TYPE_COLORS[field.field_type] || 'bg-slate-100 text-slate-700'}`}>
                              {field.field_type}
                            </Badge>
                          </div>
                        );
                      })}
                      {selectedObject.field_count > 20 && (
                        <div className="text-xs text-slate-400 text-center py-1">
                          +{selectedObject.field_count - 20} more fields
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </div>

                {/* Actions */}
                <div className="pt-4 border-t border-slate-200">
                  <p className="text-xs text-slate-500 italic">
                    This is a read-only view. To edit schema, use the Schema Builder editor.
                  </p>
                </div>
              </div>
            </div>
          </aside>
        )}
      </div>

      {/* Footer Stats */}
      <footer className="bg-white border-t border-slate-200 px-4 py-2 z-10">
        <div className="flex items-center justify-between text-sm text-slate-500">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <Database className="h-4 w-4" />
              {stats.visible} of {stats.total} objects visible
            </span>
            <span className="flex items-center gap-1">
              <Link className="h-4 w-4" />
              {stats.relationships} wire{stats.relationships !== 1 ? 's' : ''} shown
            </span>
          </div>
          <span className="text-xs">
            Drag to reposition • Scroll to zoom • Click object for details • Hover wire for tooltip
          </span>
        </div>
      </footer>
    </div>
  );
}
