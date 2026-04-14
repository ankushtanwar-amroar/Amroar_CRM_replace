import React, { useState, useEffect, useCallback } from 'react';
import { X, Search, ChevronDown, ChevronRight, Database, User, Globe, Settings, Zap, FileText, Hash, Calendar, Briefcase } from 'lucide-react';
import { Input } from '../../../components/ui/input';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';

const API = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';

// Standard fields for common objects
const STANDARD_OBJECT_FIELDS = {
  Contact: ['Id', 'Name', 'Email', 'Phone', 'AccountId', 'OwnerId', 'Title', 'Department', 'MailingCity', 'MailingState'],
  Account: ['Id', 'Name', 'Type', 'Industry', 'Phone', 'Website', 'OwnerId', 'BillingCity', 'BillingState'],
  Lead: ['Id', 'Name', 'Email', 'Phone', 'Company', 'Status', 'OwnerId', 'LeadSource'],
  Opportunity: ['Id', 'Name', 'Amount', 'StageName', 'CloseDate', 'AccountId', 'OwnerId', 'Probability'],
  User: ['Id', 'Name', 'Email', 'Username', 'Department', 'Title', 'ManagerId', 'ProfileId'],
  Case: ['Id', 'Subject', 'Status', 'Priority', 'AccountId', 'ContactId', 'OwnerId'],
  Task: ['Id', 'Subject', 'Status', 'Priority', 'OwnerId', 'WhatId', 'WhoId', 'ActivityDate'],
};

// Reference field mappings for traversal
const REFERENCE_FIELD_MAP = {
  AccountId: { object: 'Account', label: 'Account' },
  ContactId: { object: 'Contact', label: 'Contact' },
  OwnerId: { object: 'User', label: 'Owner' },
  ManagerId: { object: 'User', label: 'Manager' },
  CreatedById: { object: 'User', label: 'Created By' },
  LastModifiedById: { object: 'User', label: 'Last Modified By' },
  ParentId: { object: 'Account', label: 'Parent Account' },
  ReportsToId: { object: 'Contact', label: 'Reports To' },
  ProfileId: { object: 'Profile', label: 'Profile' },
  UserRoleId: { object: 'UserRole', label: 'Role' },
};

// Global variable categories with Salesforce-style structure
const GLOBAL_VARIABLES = {
  '$Api': {
    icon: Globe,
    label: 'API',
    description: 'API information',
    variables: [
      { name: '$Api.Enterprise_Server_URL', label: 'Enterprise Server URL' },
      { name: '$Api.Partner_Server_URL', label: 'Partner Server URL' },
      { name: '$Api.Session_ID', label: 'Session ID' },
    ]
  },
  '$Flow': {
    icon: Zap,
    label: 'Flow',
    description: 'Current flow context',
    variables: [
      { name: '$Flow.CurrentDate', label: 'Current Date' },
      { name: '$Flow.CurrentDateTime', label: 'Current Date/Time' },
      { name: '$Flow.CurrentStage', label: 'Current Stage' },
      { name: '$Flow.InterviewGuid', label: 'Interview GUID' },
      { name: '$Flow.FaultMessage', label: 'Fault Message' },
    ]
  },
  '$Organization': {
    icon: Briefcase,
    label: 'Organization',
    description: 'Organization information',
    variables: [
      { name: '$Organization.Id', label: 'Organization ID' },
      { name: '$Organization.Name', label: 'Organization Name' },
      { name: '$Organization.Division', label: 'Division' },
      { name: '$Organization.Country', label: 'Country' },
      { name: '$Organization.DefaultLocaleSidKey', label: 'Default Locale' },
    ]
  },
  '$Profile': {
    icon: User,
    label: 'Profile',
    description: 'Current user profile',
    variables: [
      { name: '$Profile.Id', label: 'Profile ID' },
      { name: '$Profile.Name', label: 'Profile Name' },
    ]
  },
  '$Record': {
    icon: Database,
    label: 'Record',
    description: 'Current record fields',
    isExpandable: true,
    variables: [
      { name: '$Record.Id', label: 'Record ID' },
      { name: '$Record.Name', label: 'Record Name' },
    ]
  },
  '$System': {
    icon: Settings,
    label: 'System',
    description: 'System values',
    variables: [
      { name: '$System.OriginDateTime', label: 'Origin Date/Time' },
    ]
  },
  '$User': {
    icon: User,
    label: 'User',
    description: 'Current running user',
    isExpandable: true,
    variables: [
      { name: '$User.Id', label: 'User ID' },
      { name: '$User.Name', label: 'User Name' },
      { name: '$User.FirstName', label: 'First Name' },
      { name: '$User.LastName', label: 'Last Name' },
      { name: '$User.Email', label: 'Email' },
      { name: '$User.Username', label: 'Username' },
      { name: '$User.Title', label: 'Title' },
      { name: '$User.Department', label: 'Department' },
      { name: '$User.Manager.Name', label: 'Manager Name' },
      { name: '$User.Profile.Name', label: 'Profile Name' },
    ]
  },
  '$UserRole': {
    icon: Briefcase,
    label: 'User Role',
    description: 'Current user role',
    variables: [
      { name: '$UserRole.Id', label: 'Role ID' },
      { name: '$UserRole.Name', label: 'Role Name' },
    ]
  },
};

/**
 * ResourcePickerModal - Salesforce-style unified resource/variable picker
 * Used in: Add Error, Send Email, Screen Flow, and other nodes
 * 
 * Features:
 * - Global variables ($User, $System, $Record, etc.)
 * - Trigger record fields with traversal
 * - Previous node outputs
 * - Flow variables
 * - Search/filter
 * - Expandable reference fields
 */
const ResourcePickerModal = ({ 
  isOpen, 
  onClose, 
  onSelect,
  context = {},
  title = "Insert a resource...",
  variableSyntax = '{{}}' // '{{}}' or '{!}'
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedCategories, setExpandedCategories] = useState({ global: true, trigger: true, outputs: true });
  const [expandedPaths, setExpandedPaths] = useState({});
  const [objectFields, setObjectFields] = useState({});
  const [loadingFields, setLoadingFields] = useState({});
  
  // Get trigger configuration
  const triggerConfig = context?.triggerConfig || context?.triggers?.[0]?.config || {};
  const triggerEntity = triggerConfig.entity || triggerConfig.object || triggerConfig.trigger_object || 'Record';
  
  // Format variable based on syntax preference
  const formatVariable = (varName) => {
    if (variableSyntax === '{!}') {
      return `{!${varName}}`;
    }
    return `{{${varName}}}`;
  };
  
  // Get fields for an object (with caching)
  const getFieldsForObject = useCallback(async (objectName) => {
    if (objectFields[objectName]) {
      return objectFields[objectName];
    }
    
    setLoadingFields(prev => ({ ...prev, [objectName]: true }));
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API}/api/objects/${objectName.toLowerCase()}/fields`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        const fields = data?.fields || data || [];
        const fieldList = fields.map(f => ({
          name: f.api_name || f.name,
          label: f.label || f.name,
          type: f.type || 'text',
          isReference: f.type === 'reference' || f.type === 'lookup' || !!REFERENCE_FIELD_MAP[f.api_name || f.name]
        }));
        setObjectFields(prev => ({ ...prev, [objectName]: fieldList }));
        return fieldList;
      }
    } catch (e) {
      console.log('Field fetch failed, using defaults');
    } finally {
      setLoadingFields(prev => ({ ...prev, [objectName]: false }));
    }
    
    // Fall back to standard fields
    const standardFields = STANDARD_OBJECT_FIELDS[objectName] || ['Id', 'Name'];
    const fieldList = standardFields.map(f => ({
      name: f,
      label: f.replace(/([A-Z])/g, ' $1').trim(),
      type: REFERENCE_FIELD_MAP[f] ? 'reference' : 'text',
      isReference: !!REFERENCE_FIELD_MAP[f]
    }));
    setObjectFields(prev => ({ ...prev, [objectName]: fieldList }));
    return fieldList;
  }, [objectFields]);
  
  // Load trigger fields on mount
  useEffect(() => {
    if (isOpen && triggerEntity && triggerEntity !== 'Record') {
      getFieldsForObject(triggerEntity);
    }
  }, [isOpen, triggerEntity, getFieldsForObject]);
  
  // Toggle category expansion
  const toggleCategory = (category) => {
    setExpandedCategories(prev => ({ ...prev, [category]: !prev[category] }));
  };
  
  // Toggle path expansion for reference fields
  const togglePath = async (path, objectName) => {
    if (expandedPaths[path]) {
      setExpandedPaths(prev => ({ ...prev, [path]: false }));
    } else {
      await getFieldsForObject(objectName);
      setExpandedPaths(prev => ({ ...prev, [path]: true }));
    }
  };
  
  // Filter items by search term
  const matchesSearch = (item) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      item.name?.toLowerCase().includes(term) ||
      item.label?.toLowerCase().includes(term)
    );
  };
  
  // Render a field item with optional expansion for reference fields
  const renderFieldItem = (field, basePath, depth = 0) => {
    const fullPath = basePath ? `${basePath}.${field.name}` : field.name;
    const isReference = field.isReference || REFERENCE_FIELD_MAP[field.name];
    const referenceInfo = REFERENCE_FIELD_MAP[field.name];
    const isExpanded = expandedPaths[fullPath];
    const canExpand = isReference && referenceInfo && depth < 2;
    
    const relatedObject = referenceInfo?.object || field.name.replace(/Id$/, '').replace(/_id$/, '');
    const relatedFields = objectFields[relatedObject] || [];
    
    if (!matchesSearch(field) && depth === 0) return null;
    
    return (
      <div key={fullPath} style={{ marginLeft: depth * 8 }}>
        <div className="flex items-center gap-1">
          {canExpand ? (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); togglePath(fullPath, relatedObject); }}
              className="p-0.5 hover:bg-slate-200 rounded"
            >
              {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            </button>
          ) : (
            <span className="w-4" />
          )}
          
          <button
            type="button"
            onClick={() => { onSelect(formatVariable(fullPath)); onClose(); }}
            className="flex-1 text-left px-2 py-1.5 rounded hover:bg-blue-50 flex items-center justify-between text-sm group"
          >
            <span className="flex items-center gap-2">
              {field.label || field.name}
              {canExpand && (
                <Badge variant="outline" className="text-[10px] px-1 py-0 text-purple-600">
                  {referenceInfo?.label || relatedObject}
                </Badge>
              )}
            </span>
            <code className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-600 group-hover:bg-blue-100">
              {formatVariable(fullPath)}
            </code>
          </button>
        </div>
        
        {canExpand && isExpanded && (
          <div className="ml-4 mt-1 border-l-2 border-slate-200 pl-2">
            {loadingFields[relatedObject] ? (
              <div className="text-xs text-slate-500 py-2 pl-2">Loading fields...</div>
            ) : relatedFields.length > 0 ? (
              relatedFields.map(relatedField => 
                renderFieldItem(
                  relatedField,
                  basePath ? `${basePath}.${referenceInfo?.label || relatedObject}` : `${referenceInfo?.label || relatedObject}`,
                  depth + 1
                )
              )
            ) : (
              <div className="text-xs text-slate-500 py-2 pl-2">No fields available</div>
            )}
          </div>
        )}
      </div>
    );
  };
  
  // Build previous node outputs
  const getNodeOutputs = () => {
    const outputs = [];
    const previousNodes = context?.previousNodes || context?.nodes || [];
    
    previousNodes.forEach(node => {
      const nodeLabel = (node.data?.label || node.label || node.id || '').replace(/\s+/g, '');
      const nodeDisplayLabel = node.data?.label || node.label || node.id;
      const nodeConfig = node.data?.config || node.config || {};
      const actionType = nodeConfig.action_type;
      const objectType = nodeConfig.object;
      
      // CRM Actions (Get, Create, Update)
      if (node.type === 'mcp' || node.type === 'get_records') {
        const standardFields = objectType ? (STANDARD_OBJECT_FIELDS[objectType] || ['Id', 'Name']) : ['Id', 'Name'];
        
        // For Get Records actions, add collection variables
        const isGetAction = actionType === 'get' || actionType === 'crm.record.get' || 
                           nodeConfig.action === 'get' || nodeConfig.action === 'crm.record.get';
        
        if (isGetAction) {
          // Add collection-specific outputs for Get Records
          outputs.push({
            nodeLabel,
            displayLabel: nodeDisplayLabel,
            objectType,
            actionType: 'get_records_collection',
            isCollection: true,
            fields: standardFields,
            // Collection-specific fields
            collectionFields: [
              { name: 'count', label: 'Record Count', type: 'number', description: 'Total number of records returned' },
              { name: 'records', label: 'Records Collection', type: 'collection', description: 'Array of all returned records' }
            ]
          });
        } else {
          outputs.push({
            nodeLabel,
            displayLabel: nodeDisplayLabel,
            objectType,
            actionType: actionType || 'get',
            fields: standardFields
          });
        }
      }
      
      // Screen variables
      if (node.type === 'screen') {
        const screenFields = nodeConfig.fields || [];
        if (screenFields.length > 0) {
          outputs.push({
            nodeLabel,
            displayLabel: `${nodeDisplayLabel} (Screen)`,
            actionType: 'screen',
            fields: screenFields.map(f => f.name || f.api_name)
          });
        }
      }
      
      // Assignment variables
      if (node.type === 'assignment') {
        const assignments = nodeConfig.assignments || [];
        outputs.push({
          nodeLabel,
          displayLabel: `${nodeDisplayLabel} (Assignment)`,
          actionType: 'assignment',
          fields: assignments.map(a => a.variable || 'value')
        });
      }
    });
    
    return outputs;
  };
  
  // Get flow variables
  const getFlowVariables = () => {
    return context?.flowVariables || context?.variables || [];
  };
  
  if (!isOpen) return null;
  
  const nodeOutputs = getNodeOutputs();
  const flowVariables = getFlowVariables();
  const triggerFields = objectFields[triggerEntity] || STANDARD_OBJECT_FIELDS[triggerEntity] || [
    { name: 'Id', label: 'ID', type: 'text' },
    { name: 'Name', label: 'Name', type: 'text' },
  ];
  
  // Process trigger fields to include proper structure
  const processedTriggerFields = Array.isArray(triggerFields) 
    ? triggerFields.map(f => typeof f === 'string' 
        ? { name: f, label: f.replace(/([A-Z])/g, ' $1').trim(), isReference: !!REFERENCE_FIELD_MAP[f] }
        : { ...f, isReference: f.isReference || !!REFERENCE_FIELD_MAP[f.name] }
      )
    : [];
  
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="p-4 border-b flex justify-between items-center bg-gradient-to-r from-blue-50 to-indigo-50">
          <div>
            <h3 className="font-semibold text-slate-800">{title}</h3>
            <p className="text-xs text-slate-500 mt-0.5">Select a variable or click ▶ to expand relationships</p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        
        {/* Search */}
        <div className="p-3 border-b bg-slate-50">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search resources..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 h-9"
              autoFocus
            />
          </div>
        </div>
        
        {/* Content */}
        <div className="flex-1 overflow-y-auto p-3 space-y-4">
          
          {/* GLOBAL Section */}
          <div>
            <button
              type="button"
              onClick={() => toggleCategory('global')}
              className="w-full flex items-center gap-2 px-2 py-1.5 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
            >
              {expandedCategories.global ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              <Globe className="h-4 w-4 text-blue-600" />
              <span className="text-sm font-semibold text-slate-700">GLOBAL</span>
            </button>
            
            {expandedCategories.global && (
              <div className="mt-2 space-y-2 ml-2">
                {Object.entries(GLOBAL_VARIABLES).map(([key, category]) => {
                  const Icon = category.icon;
                  const categoryExpanded = expandedPaths[key];
                  const filteredVars = category.variables.filter(matchesSearch);
                  
                  if (searchTerm && filteredVars.length === 0) return null;
                  
                  return (
                    <div key={key}>
                      <button
                        type="button"
                        onClick={() => setExpandedPaths(prev => ({ ...prev, [key]: !prev[key] }))}
                        className="w-full flex items-center gap-2 px-2 py-1 hover:bg-slate-50 rounded text-left"
                      >
                        {categoryExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                        <Icon className="h-3.5 w-3.5 text-slate-500" />
                        <span className="text-sm text-slate-700">{category.label}</span>
                        <span className="text-xs text-slate-400 ml-auto">{key}</span>
                      </button>
                      
                      {categoryExpanded && (
                        <div className="ml-6 mt-1 space-y-0.5">
                          {filteredVars.map(v => (
                            <button
                              key={v.name}
                              type="button"
                              onClick={() => { onSelect(formatVariable(v.name)); onClose(); }}
                              className="w-full text-left px-2 py-1.5 rounded hover:bg-blue-50 flex items-center justify-between text-sm group"
                            >
                              <span>{v.label}</span>
                              <code className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded group-hover:bg-blue-100">
                                {formatVariable(v.name)}
                              </code>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          
          {/* TRIGGER Section */}
          {triggerEntity && triggerEntity !== 'Record' && (
            <div>
              <button
                type="button"
                onClick={() => toggleCategory('trigger')}
                className="w-full flex items-center gap-2 px-2 py-1.5 bg-green-50 rounded-lg hover:bg-green-100 transition-colors"
              >
                {expandedCategories.trigger ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                <Database className="h-4 w-4 text-green-600" />
                <span className="text-sm font-semibold text-slate-700">Trigger - {triggerEntity}</span>
              </button>
              
              {expandedCategories.trigger && (
                <div className="mt-2 ml-2">
                  {processedTriggerFields.map(field => 
                    renderFieldItem(field, `Trigger.${triggerEntity}`, 0)
                  )}
                </div>
              )}
            </div>
          )}
          
          {/* FLOW DATA / NODE OUTPUTS Section */}
          {(nodeOutputs.length > 0 || flowVariables.length > 0) && (
            <div>
              <button
                type="button"
                onClick={() => toggleCategory('outputs')}
                className="w-full flex items-center gap-2 px-2 py-1.5 bg-purple-50 rounded-lg hover:bg-purple-100 transition-colors"
              >
                {expandedCategories.outputs ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                <FileText className="h-4 w-4 text-purple-600" />
                <span className="text-sm font-semibold text-slate-700">FLOW DATA</span>
              </button>
              
              {expandedCategories.outputs && (
                <div className="mt-2 space-y-3 ml-2">
                  {/* Previous Node Outputs */}
                  {nodeOutputs.map((node, idx) => (
                    <div key={idx} className="border rounded-lg p-2 bg-slate-50">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="outline" className="text-[10px]">
                          {node.actionType === 'create' ? '➕ Create' : 
                           node.actionType === 'get' ? '🔍 Get' : 
                           node.actionType === 'get_records_collection' ? '📋 Get Records' :
                           node.actionType === 'update' ? '✏️ Update' :
                           node.actionType === 'screen' ? '📱 Screen' :
                           node.actionType === 'assignment' ? '📝 Assign' : node.actionType}
                        </Badge>
                        <span className="text-xs font-medium">{node.displayLabel}</span>
                        {node.objectType && (
                          <span className="text-[10px] text-slate-500">({node.objectType})</span>
                        )}
                        {node.isCollection && (
                          <span className="text-[9px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full">Collection</span>
                        )}
                      </div>
                      
                      {/* Collection Variables for Get Records */}
                      {node.isCollection && node.collectionFields && (
                        <div className="mb-2 pb-2 border-b border-slate-200">
                          <div className="text-[10px] text-slate-500 mb-1 font-medium">Collection Access:</div>
                          <div className="grid grid-cols-2 gap-1">
                            {node.collectionFields.map(cf => (
                              <button
                                key={`${node.nodeLabel}.${cf.name}`}
                                type="button"
                                onClick={() => { onSelect(formatVariable(`${node.nodeLabel}.${cf.name}`)); onClose(); }}
                                className="text-left px-2 py-1 rounded hover:bg-purple-100 border border-purple-200 bg-purple-50 text-xs group"
                                title={cf.description}
                              >
                                <span className="font-medium text-purple-700">{cf.label}</span>
                                <code className="text-[9px] text-purple-500 ml-1 group-hover:text-purple-700">
                                  .{cf.name}
                                </code>
                              </button>
                            ))}
                          </div>
                          {/* Template Helpers */}
                          <div className="text-[10px] text-slate-500 mt-2 mb-1 font-medium">Template Helpers:</div>
                          <div className="grid grid-cols-1 gap-1">
                            <button
                              type="button"
                              onClick={() => { onSelect(`{{count(${node.nodeLabel}.records)}}`); onClose(); }}
                              className="text-left px-2 py-1 rounded hover:bg-blue-100 border border-blue-200 bg-blue-50 text-xs"
                              title="Get total count of records"
                            >
                              <code className="text-blue-700">{'{{count(' + node.nodeLabel + '.records)}}'}</code>
                            </button>
                            <button
                              type="button"
                              onClick={() => { onSelect(`{{join(${node.nodeLabel}.records.Name, ", ")}}`); onClose(); }}
                              className="text-left px-2 py-1 rounded hover:bg-blue-100 border border-blue-200 bg-blue-50 text-xs"
                              title="Join field values with separator"
                            >
                              <code className="text-blue-700">{'{{join(' + node.nodeLabel + '.records.Name, ", ")}}'}</code>
                            </button>
                            <button
                              type="button"
                              onClick={() => { onSelect(`{{#each ${node.nodeLabel}.records}}{{Name}}{{/each}}`); onClose(); }}
                              className="text-left px-2 py-1 rounded hover:bg-green-100 border border-green-200 bg-green-50 text-xs"
                              title="Loop through all records"
                            >
                              <code className="text-green-700">{'{{#each ' + node.nodeLabel + '.records}}...{{/each}}'}</code>
                            </button>
                          </div>
                        </div>
                      )}
                      
                      {/* First Record Fields (backward compatible) */}
                      <div>
                        {node.isCollection && (
                          <div className="text-[10px] text-slate-500 mb-1 font-medium">First Record Fields:</div>
                        )}
                        <div className="grid grid-cols-2 gap-1">
                          {node.fields.slice(0, 6).map(field => (
                            <button
                              key={`${node.nodeLabel}.${field}`}
                              type="button"
                              onClick={() => { onSelect(formatVariable(`${node.nodeLabel}.${field}`)); onClose(); }}
                              className="text-left px-2 py-1 rounded hover:bg-white border border-transparent hover:border-slate-200 text-xs"
                            >
                              <span className="truncate">{field}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  {/* Flow Variables */}
                  {flowVariables.length > 0 && (
                    <div className="border rounded-lg p-2 bg-amber-50">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="outline" className="text-[10px] border-amber-300">
                          📊 Variables
                        </Badge>
                      </div>
                      <div className="space-y-1">
                        {flowVariables.filter(matchesSearch).map((v, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => { onSelect(formatVariable(v.name || v.api_name)); onClose(); }}
                            className="w-full text-left px-2 py-1 rounded hover:bg-white text-xs flex items-center justify-between"
                          >
                            <span>{v.label || v.name}</span>
                            <code className="text-[9px] bg-white px-1 rounded">{v.name || v.api_name}</code>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          
          {/* Webhook Body Fields (for webhook triggers) */}
          {triggerConfig.body_fields && triggerConfig.body_fields.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => toggleCategory('webhook')}
                className="w-full flex items-center gap-2 px-2 py-1.5 bg-orange-50 rounded-lg hover:bg-orange-100 transition-colors"
              >
                {expandedCategories.webhook ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                <Zap className="h-4 w-4 text-orange-600" />
                <span className="text-sm font-semibold text-slate-700">Webhook Body</span>
              </button>
              
              {expandedCategories.webhook && (
                <div className="mt-2 ml-2 space-y-1">
                  {triggerConfig.body_fields.filter(matchesSearch).map((field, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => { onSelect(formatVariable(`WebhookBody.${field.name}`)); onClose(); }}
                      className="w-full text-left px-2 py-1.5 rounded hover:bg-blue-50 flex items-center justify-between text-sm group"
                    >
                      <span>{field.label || field.name}</span>
                      <code className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded group-hover:bg-blue-100">
                        {formatVariable(`WebhookBody.${field.name}`)}
                      </code>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        
        {/* Footer */}
        <div className="p-3 border-t bg-slate-50 text-xs text-slate-500">
          <p><strong>Tip:</strong> Click ▶ to expand reference fields and access related object data (e.g., Account.Owner.Name)</p>
        </div>
      </div>
    </div>
  );
};

export default ResourcePickerModal;
