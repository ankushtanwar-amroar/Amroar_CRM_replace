/**
 * SendEmailConfigPanel - Enhanced Send Email Node Configuration
 * Supports:
 * - FROM: Record field, System user, Custom email
 * - TO: Multi-recipient with mixed sources
 * - SUBJECT: Text + variable insertion
 * - BODY: Rich text editor + template support
 */
import React, { useState, useEffect, useCallback } from 'react';
import { X, Plus, Mail, User, Database, FileText, Variable, ChevronDown, Trash2, Bold, Italic, Underline, List, Link, AlignLeft, AlignCenter, AlignRight } from 'lucide-react';
import { Button } from '../../../../components/ui/button';
import { Input } from '../../../../components/ui/input';
import { Label } from '../../../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../../components/ui/select';
import { Badge } from '../../../../components/ui/badge';
import { toast } from 'sonner';
import axios from 'axios';

const API = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';

// Email validation regex
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Common reference fields that point to related objects (defined outside component to avoid re-renders)
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

// Standard fields for common objects
const STANDARD_OBJECT_FIELDS = {
  'Account': ['Id', 'Name', 'Industry', 'Type', 'Phone', 'Website', 'Description', 'BillingCity', 'BillingState', 'BillingCountry'],
  'Contact': ['Id', 'Name', 'FirstName', 'LastName', 'Email', 'Phone', 'Title', 'Department', 'AccountId'],
  'Lead': ['Id', 'Name', 'FirstName', 'LastName', 'Email', 'Phone', 'Company', 'Title', 'Status'],
  'User': ['Id', 'Name', 'FirstName', 'LastName', 'Email', 'Username', 'Title', 'Department'],
  'Opportunity': ['Id', 'Name', 'StageName', 'Amount', 'CloseDate', 'Type', 'Description'],
  'Campaign': ['Id', 'Name', 'Type', 'Status', 'StartDate', 'EndDate'],
};

/**
 * Cross-Object Variable Picker Modal
 * Supports hierarchical field traversal like Trigger.Contact.Account.Name
 * Max depth: 3 levels
 */
const VariablePickerModal = ({ isOpen, onClose, onSelect, context }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedPaths, setExpandedPaths] = useState({});
  const [objectFields, setObjectFields] = useState({});
  const [loadingFields, setLoadingFields] = useState({});
  
  // Get trigger entity
  const triggerEntity = context?.triggerConfig?.entity || context?.triggerConfig?.object || 'Record';
  
  // Get fields for an object (use cached or standard fields)
  const getFieldsForObject = useCallback(async (objectName) => {
    // Check cache first
    if (objectFields[objectName]) {
      return objectFields[objectName];
    }
    
    // Try to fetch from API
    setLoadingFields(prev => ({ ...prev, [objectName]: true }));
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API}/api/objects/${objectName.toLowerCase()}/fields`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const fields = response.data?.fields || response.data || [];
      const fieldList = fields.map(f => ({
        name: f.api_name || f.name,
        label: f.label || f.name,
        type: f.type || 'text',
        isReference: f.type === 'reference' || f.type === 'lookup' || REFERENCE_FIELD_MAP[f.api_name || f.name]
      }));
      setObjectFields(prev => ({ ...prev, [objectName]: fieldList }));
      return fieldList;
    } catch (e) {
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
    } finally {
      setLoadingFields(prev => ({ ...prev, [objectName]: false }));
    }
  }, [objectFields]);
  
  // Load trigger entity fields on mount
  useEffect(() => {
    if (isOpen && triggerEntity && triggerEntity !== 'Record') {
      getFieldsForObject(triggerEntity);
    }
  }, [isOpen, triggerEntity, getFieldsForObject]);
  
  // Early return AFTER hooks
  if (!isOpen) return null;
  
  // Toggle expansion of a path
  const toggleExpand = async (path, objectName) => {
    const isExpanded = expandedPaths[path];
    if (isExpanded) {
      setExpandedPaths(prev => ({ ...prev, [path]: false }));
    } else {
      await getFieldsForObject(objectName);
      setExpandedPaths(prev => ({ ...prev, [path]: true }));
    }
  };
  
  // Render a field item with optional expansion
  const renderFieldItem = (field, basePath, depth = 0) => {
    const fullPath = basePath ? `${basePath}.${field.name}` : field.name;
    const isReference = field.isReference || REFERENCE_FIELD_MAP[field.name];
    const referenceInfo = REFERENCE_FIELD_MAP[field.name];
    const isExpanded = expandedPaths[fullPath];
    const canExpand = isReference && referenceInfo && depth < 2; // Max depth 3 (0, 1, 2)
    
    // Get the related object name (without the Id suffix)
    const relatedObject = referenceInfo?.object || field.name.replace(/Id$/, '').replace(/_id$/, '');
    const relatedFields = objectFields[relatedObject] || [];
    
    return (
      <div key={fullPath} className="ml-2">
        <div className="flex items-center gap-1">
          {canExpand && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); toggleExpand(fullPath, relatedObject); }}
              className="p-0.5 hover:bg-slate-200 rounded"
            >
              <ChevronDown className={`h-3 w-3 transition-transform ${isExpanded ? 'rotate-0' : '-rotate-90'}`} />
            </button>
          )}
          {!canExpand && <span className="w-4" />}
          
          <button
            type="button"
            onClick={() => { 
              // For reference fields, insert the related object path, not the Id
              const insertPath = canExpand && !field.name.endsWith('Id') && !field.name.endsWith('_id')
                ? fullPath 
                : fullPath;
              onSelect(`{{${insertPath}}}`); 
              onClose(); 
            }}
            className="flex-1 text-left px-2 py-1.5 rounded hover:bg-slate-100 flex items-center justify-between text-sm"
          >
            <span className="flex items-center gap-2">
              {field.label || field.name}
              {canExpand && (
                <Badge variant="outline" className="text-[10px] px-1 py-0">
                  {referenceInfo?.label || relatedObject}
                </Badge>
              )}
            </span>
            <code className="text-[10px] bg-slate-100 px-1 rounded text-slate-600">{`{{${fullPath}}}`}</code>
          </button>
        </div>
        
        {/* Expanded related object fields */}
        {canExpand && isExpanded && (
          <div className="ml-4 mt-1 border-l-2 border-slate-200 pl-2">
            {loadingFields[relatedObject] ? (
              <div className="text-xs text-slate-500 py-2">Loading fields...</div>
            ) : relatedFields.length > 0 ? (
              relatedFields.map(relatedField => 
                renderFieldItem(
                  relatedField, 
                  // For the path, use the related object name (Account) not the field name (AccountId)
                  basePath ? `${basePath}.${referenceInfo?.label || relatedObject}` : `Trigger.${triggerEntity}.${referenceInfo?.label || relatedObject}`,
                  depth + 1
                )
              )
            ) : (
              <div className="text-xs text-slate-500 py-2">No fields available</div>
            )}
          </div>
        )}
      </div>
    );
  };
  
  const triggerFields = objectFields[triggerEntity] || [
    { name: 'Id', label: 'ID', type: 'text' },
    { name: 'Name', label: 'Name', type: 'text' },
    { name: 'Email', label: 'Email', type: 'email' },
    { name: 'CreatedAt', label: 'Created At', type: 'datetime' },
    { name: 'AccountId', label: 'Account ID', type: 'reference', isReference: true },
    { name: 'OwnerId', label: 'Owner ID', type: 'reference', isReference: true },
  ];
  
  // Filter fields by search
  const filterFields = (fields) => {
    if (!searchTerm) return fields;
    return fields.filter(f => 
      f.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (f.label && f.label.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  };
  
  // Previous node outputs - B5 FIX: Include CRM action outputs (Create, Update, Get nodes)
  const nodeOutputVariables = [];
  const actionOutputNodes = []; // Nodes with action outputs (GetAccount, CreateContact, etc.)
  
  if (context?.previousNodes) {
    context.previousNodes.forEach(node => {
      const nodeLabel = node.data?.label || node.label || node.id;
      const nodeLabelClean = nodeLabel.replace(/\s+/g, ''); // Remove spaces for variable names
      const nodeConfig = node.data?.config || node.config || {};
      const actionType = nodeConfig.action_type || nodeConfig.mcp_action;
      const objectType = nodeConfig.object || nodeConfig.entity;
      const nodeType = node.data?.nodeType || node.type;
      
      // Get the standard fields for this object type
      const standardFields = objectType ? (STANDARD_OBJECT_FIELDS[objectType] || ['Id', 'Name']) : ['Id', 'Name', 'Email', 'Phone', 'Status', 'Type'];
      
      // Get Records node outputs - ENHANCED: detect by nodeType, config, or action
      const isGetRecordsNode = nodeType === 'get_records' || 
                               nodeType === 'mcp_get_records' || 
                               nodeType === 'mcp' && (actionType === 'get' || actionType === 'crm.record.get') ||
                               nodeConfig.mcp_action?.includes('get') ||
                               nodeLabel.toLowerCase().includes('get');
      
      if (isGetRecordsNode) {
        // Add collection variables
        nodeOutputVariables.push({ 
          name: `${nodeLabelClean}.count`, 
          label: `${nodeLabel} - Record Count`,
          isCollection: true
        });
        nodeOutputVariables.push({ 
          name: `${nodeLabelClean}.records`, 
          label: `${nodeLabel} - Records Collection`,
          isCollection: true
        });
        
        // Add as action output node with collection support
        actionOutputNodes.push({
          nodeLabel: nodeLabelClean,
          displayLabel: nodeLabel,
          objectType: objectType,
          actionType: 'get_records',
          isCollection: true,
          fields: standardFields,
          collectionFields: [
            { name: 'count', label: 'Record Count', type: 'number' },
            { name: 'records', label: 'Records Collection', type: 'array' },
            { name: 'first', label: 'First Record', type: 'object' }
          ]
        });
      }
      // Create Record node outputs (B5 FIX)
      else if (nodeType === 'mcp' && (actionType === 'create' || actionType === 'crm.record.create')) {
        actionOutputNodes.push({
          nodeLabel: nodeLabelClean,
          displayLabel: nodeLabel,
          objectType: objectType,
          actionType: 'create',
          fields: standardFields
        });
      }
      // Update Record node outputs
      else if (nodeType === 'mcp' && (actionType === 'update' || actionType === 'crm.record.update')) {
        actionOutputNodes.push({
          nodeLabel: nodeLabelClean,
          displayLabel: nodeLabel,
          objectType: objectType,
          actionType: 'update',
          fields: ['updated_count', 'updated_ids']
        });
      }
      // Assignment node outputs
      else if (nodeType === 'assignment') {
        const assignments = nodeConfig.assignments || [];
        if (assignments.length > 0) {
          nodeOutputVariables.push({ 
            name: nodeLabelClean, 
            label: `${nodeLabel} (Assignment)` 
          });
        }
      }
      // Loop node - current item reference
      else if (nodeType === 'loop' || nodeType === 'for_each') {
        const collectionVar = nodeConfig.collection_variable || nodeConfig.collection;
        if (collectionVar) {
          nodeOutputVariables.push({ 
            name: '$Record', 
            label: `${nodeLabel} - Current Item` 
          });
        }
      }
    });
  }
  
  // System variables
  const systemVariables = [
    { name: 'System.CurrentDate', label: 'Current Date' },
    { name: 'System.CurrentTime', label: 'Current Time' },
    { name: 'System.CurrentUser', label: 'Current User' },
    { name: 'System.CurrentDateTime', label: 'Current Date & Time' },
  ];
  
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b flex justify-between items-center">
          <div>
            <h3 className="font-semibold">Insert Variable</h3>
            <p className="text-xs text-slate-500 mt-0.5">Click ▶ to expand related object fields</p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        
        <div className="p-3 border-b">
          <Input
            placeholder="Search variables..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="h-8"
          />
        </div>
        
        <div className="flex-1 overflow-y-auto p-3">
          {/* Trigger Fields - Hierarchical */}
          <div className="mb-4">
            <h4 className="text-xs font-semibold text-slate-500 uppercase mb-2 flex items-center gap-2">
              <Database className="h-3 w-3" />
              Trigger - {triggerEntity}
            </h4>
            <div className="space-y-0.5">
              {filterFields(triggerFields).map(field => 
                renderFieldItem(field, `Trigger.${triggerEntity}`, 0)
              )}
            </div>
          </div>
          
          {/* Node Outputs */}
          {nodeOutputVariables.length > 0 && (
            <div className="mb-4">
              <h4 className="text-xs font-semibold text-slate-500 uppercase mb-2">Node Outputs</h4>
              <div className="space-y-1">
                {nodeOutputVariables.filter(v => 
                  !searchTerm || 
                  v.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                  v.label.toLowerCase().includes(searchTerm.toLowerCase())
                ).map(v => (
                  <button
                    key={v.name}
                    type="button"
                    onClick={() => { onSelect(`{{${v.name}}}`); onClose(); }}
                    className="w-full text-left px-3 py-2 rounded hover:bg-slate-100 flex items-center justify-between text-sm"
                  >
                    <span>{v.label}</span>
                    <code className="text-[10px] bg-slate-100 px-1 rounded">{`{{${v.name}}}`}</code>
                  </button>
                ))}
              </div>
            </div>
          )}
          
          {/* B5 FIX: Action Output Variables (GetAccount.Id, CreateContact.Email, etc.) */}
          {actionOutputNodes.length > 0 && (
            <div className="mb-4">
              <h4 className="text-xs font-semibold text-slate-500 uppercase mb-2 flex items-center gap-2">
                <FileText className="h-3 w-3" />
                Flow Data (Node Outputs)
              </h4>
              <div className="space-y-2">
                {actionOutputNodes.filter(node => 
                  !searchTerm || 
                  node.displayLabel.toLowerCase().includes(searchTerm.toLowerCase()) ||
                  node.objectType?.toLowerCase().includes(searchTerm.toLowerCase())
                ).map(node => (
                  <div key={node.nodeLabel} className="border rounded-lg p-2 bg-slate-50">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="outline" className="text-[10px]">
                        {node.actionType === 'create' ? '➕ Create' : 
                         node.actionType === 'get_records' ? '📋 Get Records' :
                         node.actionType === 'get' ? '🔍 Get' : 
                         node.actionType === 'update' ? '✏️ Update' : node.actionType}
                      </Badge>
                      <span className="text-xs font-medium">{node.displayLabel}</span>
                      {node.objectType && (
                        <span className="text-[10px] text-slate-500">({node.objectType})</span>
                      )}
                      {node.isCollection && (
                        <span className="text-[9px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full">Collection</span>
                      )}
                    </div>
                    
                    {/* Collection Access for Get Records */}
                    {node.isCollection && node.collectionFields && (
                      <div className="mb-2 pb-2 border-b border-slate-200">
                        <div className="text-[10px] text-slate-500 mb-1 font-medium">Collection Access:</div>
                        <div className="grid grid-cols-3 gap-1">
                          {node.collectionFields.map(cf => (
                            <button
                              key={`${node.nodeLabel}.${cf.name}`}
                              type="button"
                              onClick={() => { onSelect(`{{${node.nodeLabel}.${cf.name}}}`); onClose(); }}
                              className="text-left px-2 py-1 rounded hover:bg-purple-100 border border-purple-200 bg-purple-50 text-xs"
                              title={`Insert {{${node.nodeLabel}.${cf.name}}}`}
                            >
                              <span className="font-medium text-purple-700">{cf.label}</span>
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
                            <code className="text-blue-700">count({node.nodeLabel}.records)</code>
                          </button>
                          <button
                            type="button"
                            onClick={() => { onSelect(`{{join(${node.nodeLabel}.records.Name, ", ")}}`); onClose(); }}
                            className="text-left px-2 py-1 rounded hover:bg-blue-100 border border-blue-200 bg-blue-50 text-xs"
                            title="Join field values with separator"
                          >
                            <code className="text-blue-700">{`join(${node.nodeLabel}.records.Name, ", ")`}</code>
                          </button>
                        </div>
                      </div>
                    )}
                    
                    {/* Field Access */}
                    <div>
                      {node.isCollection && (
                        <div className="text-[10px] text-slate-500 mb-1 font-medium">First Record Fields:</div>
                      )}
                      <div className="grid grid-cols-2 gap-1">
                        {node.fields.slice(0, 8).map(field => (
                          <button
                            key={`${node.nodeLabel}.${field}`}
                            type="button"
                            onClick={() => { onSelect(`{{${node.nodeLabel}.${field}}}`); onClose(); }}
                            className="text-left px-2 py-1 rounded hover:bg-white border border-transparent hover:border-slate-200 text-xs flex items-center justify-between"
                          >
                            <span>{field}</span>
                            <code className="text-[9px] bg-white px-1 rounded text-slate-500">.{field}</code>
                          </button>
                        ))}
                      </div>
                      {node.isCollection && (
                        <div className="mt-1 text-[10px] text-slate-400">
                          For collection fields use: <code>{node.nodeLabel}.records.FieldName</code>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* System Variables */}
          <div className="mb-4">
            <h4 className="text-xs font-semibold text-slate-500 uppercase mb-2">System</h4>
            <div className="space-y-1">
              {systemVariables.filter(v => 
                !searchTerm || 
                v.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                v.label.toLowerCase().includes(searchTerm.toLowerCase())
              ).map(v => (
                <button
                  key={v.name}
                  type="button"
                  onClick={() => { onSelect(`{{${v.name}}}`); onClose(); }}
                  className="w-full text-left px-3 py-2 rounded hover:bg-slate-100 flex items-center justify-between text-sm"
                >
                  <span>{v.label}</span>
                  <code className="text-[10px] bg-slate-100 px-1 rounded">{`{{${v.name}}}`}</code>
                </button>
              ))}
            </div>
          </div>
        </div>
        
        {/* Help text */}
        <div className="p-3 border-t bg-slate-50 text-xs text-slate-500">
          <p><strong>Tip:</strong> Expand reference fields (e.g., Account ID ▶) to access related object fields like Account.Name</p>
        </div>
      </div>
    </div>
  );
};

/**
 * Template Selector Modal - FIX #3: Dynamic template loading with preview
 */
const TemplateSelectorModal = ({ isOpen, onClose, onSelect }) => {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPreview, setSelectedPreview] = useState(null);
  
  useEffect(() => {
    if (isOpen) {
      fetchTemplates();
      setSelectedPreview(null);
    }
  }, [isOpen]);
  
  const fetchTemplates = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      
      // FIX #3: Try multiple API endpoints for templates
      let templatesData = [];
      
      // Try the email-templates endpoint
      try {
        const response = await axios.get(`${API}/api/email-templates/templates`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        templatesData = response.data || [];
      } catch (e1) {
        console.log('Primary template API not available, trying alternate...');
        // Try alternate endpoint
        try {
          const response2 = await axios.get(`${API}/api/email-templates/templates/list`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          templatesData = response2.data || [];
        } catch (e2) {
          console.log('Alternate template API also not available');
        }
      }
      
      // FIX #3: Normalize template data - API uses html_content, we need body
      if (templatesData.length > 0) {
        const normalizedTemplates = templatesData.map(t => ({
          id: t.id || t._id,
          name: t.name,
          subject: t.subject,
          // FIX #3: Support both 'body' and 'html_content' field names
          body: t.body || t.html_content || t.body_html || ''
        }));
        setTemplates(normalizedTemplates);
      } else {
        // Fallback templates for demo
        setTemplates([
          { id: '1', name: 'Welcome Email', subject: 'Welcome to {{company}}!', body: '<p>Hello {{name}},</p><p>Welcome aboard!</p>' },
          { id: '2', name: 'Follow-up Email', subject: 'Following up on our conversation', body: '<p>Hi {{name}},</p><p>Just following up...</p>' },
          { id: '3', name: 'Thank You Email', subject: 'Thank you for your business', body: '<p>Dear {{name}},</p><p>Thank you for choosing us!</p>' }
        ]);
      }
    } catch (error) {
      console.error('Error fetching templates:', error);
      // Fallback templates for demo
      setTemplates([
        { id: '1', name: 'Welcome Email', subject: 'Welcome to {{company}}!', body: '<p>Hello {{name}},</p><p>Welcome aboard!</p>' },
        { id: '2', name: 'Follow-up Email', subject: 'Following up on our conversation', body: '<p>Hi {{name}},</p><p>Just following up...</p>' },
        { id: '3', name: 'Thank You Email', subject: 'Thank you for your business', body: '<p>Dear {{name}},</p><p>Thank you for choosing us!</p>' }
      ]);
    } finally {
      setLoading(false);
    }
  };
  
  if (!isOpen) return null;
  
  const filtered = templates.filter(t =>
    t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.subject?.toLowerCase().includes(searchTerm.toLowerCase())
  );
  
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b flex justify-between items-center">
          <h3 className="font-semibold">Insert Email Template</h3>
          <Button variant="ghost" size="sm" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        
        <div className="p-4 border-b">
          <Input
            placeholder="Search templates..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        
        <div className="flex-1 overflow-hidden flex">
          {/* Template List */}
          <div className="w-1/2 overflow-y-auto border-r p-4">
            {loading ? (
              <div className="text-center py-8">
                <div className="animate-spin h-6 w-6 border-2 border-indigo-600 border-t-transparent rounded-full mx-auto"></div>
                <p className="text-sm text-slate-500 mt-2">Loading templates...</p>
              </div>
            ) : filtered.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-8">No templates found</p>
            ) : (
              <div className="space-y-2">
                {filtered.map(template => (
                  <button
                    key={template.id}
                    onClick={() => setSelectedPreview(template)}
                    onDoubleClick={() => { onSelect(template); onClose(); }}
                    className={`w-full text-left p-3 rounded border transition-colors ${
                      selectedPreview?.id === template.id 
                        ? 'border-indigo-500 bg-indigo-50' 
                        : 'hover:border-indigo-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="font-medium text-sm">{template.name}</div>
                    {template.subject && (
                      <div className="text-xs text-slate-500 mt-1 truncate">Subject: {template.subject}</div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
          
          {/* FIX #3B: Template Preview Panel */}
          <div className="w-1/2 overflow-y-auto p-4 bg-slate-50">
            {selectedPreview ? (
              <div>
                <h4 className="font-semibold text-sm mb-2">Preview</h4>
                <div className="bg-white rounded border p-3 mb-4">
                  <div className="text-xs text-slate-500 mb-1">Subject:</div>
                  <div className="font-medium text-sm mb-3">{selectedPreview.subject || '(No subject)'}</div>
                  <div className="text-xs text-slate-500 mb-1">Body:</div>
                  <div 
                    className="prose prose-sm max-w-none text-sm border-t pt-2"
                    dangerouslySetInnerHTML={{ __html: selectedPreview.body || '<p>(No body)</p>' }}
                  />
                </div>
                <Button 
                  onClick={() => { onSelect(selectedPreview); onClose(); }}
                  className="w-full"
                >
                  <FileText className="h-4 w-4 mr-2" />
                  Insert Template
                </Button>
              </div>
            ) : (
              <div className="text-center py-8 text-slate-500">
                <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Click a template to preview</p>
                <p className="text-xs mt-1">Double-click to insert</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * Email Preview Section - Shows live preview with sample data
 */
const EmailPreviewSection = ({ config, recipients, fromMode, systemUsers, context }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  // Generate sample data based on trigger context using useMemo
  const sampleData = React.useMemo(() => {
    const entity = context?.triggerConfig?.entity || context?.triggerConfig?.object || 'Contact';
    return {
      [`Trigger.${entity}.Id`]: 'REC-001234',
      [`Trigger.${entity}.Name`]: 'John Smith',
      [`Trigger.${entity}.Email`]: 'john.smith@example.com',
      [`Trigger.${entity}.FirstName`]: 'John',
      [`Trigger.${entity}.LastName`]: 'Smith',
      [`Trigger.${entity}.Company`]: 'Acme Inc.',
      [`Trigger.${entity}.Phone`]: '+1 (555) 123-4567',
      [`Trigger.${entity}.CreatedAt`]: new Date().toLocaleDateString(),
      'Trigger.Id': 'REC-001234',
      'Trigger.Name': 'John Smith',
      'Trigger.Email': 'john.smith@example.com',
      'Trigger.email': 'john.smith@example.com',
      'company': 'Acme Inc.',
      'firstName': 'John',
      'lastName': 'Smith',
      'name': 'John Smith',
      'date': new Date().toLocaleDateString(),
      'year': new Date().getFullYear().toString(),
    };
  }, [context?.triggerConfig?.entity, context?.triggerConfig?.object]);
  
  // Replace variables with sample data
  const replaceVariables = (text) => {
    if (!text) return '';
    let result = text;
    
    // Replace {{variable}} format
    result = result.replace(/\{\{([^}]+)\}\}/g, (match, varName) => {
      const trimmedVar = varName.trim();
      // Check direct match
      if (sampleData[trimmedVar]) return sampleData[trimmedVar];
      // Check case-insensitive
      const lowerVar = trimmedVar.toLowerCase();
      for (const [key, val] of Object.entries(sampleData)) {
        if (key.toLowerCase() === lowerVar) return val;
      }
      // Return highlighted placeholder if no match
      return `[${trimmedVar}]`;
    });
    
    // Replace Trigger.Field format without braces
    result = result.replace(/Trigger\.(\w+)\.(\w+)/g, (match, entity, field) => {
      const fullKey = `Trigger.${entity}.${field}`;
      if (sampleData[fullKey]) return sampleData[fullKey];
      return `[${match}]`;
    });
    
    return result;
  };
  
  // Get sender display
  const getSenderDisplay = () => {
    if (fromMode === 'custom' && config.from_email) {
      return config.from_email;
    } else if (fromMode === 'user' && config.from_user_id) {
      const user = systemUsers.find(u => u.id === config.from_user_id);
      return user ? `${user.first_name} ${user.last_name} <${user.email}>` : 'System User';
    }
    return 'sender@yourcompany.com';
  };
  
  // Get recipients display
  const getRecipientsDisplay = () => {
    if (recipients.length === 0) return 'No recipients configured';
    return recipients.map((r, i) => {
      if (r.type === 'custom') return r.email || 'custom@email.com';
      if (r.type === 'user') {
        const user = systemUsers.find(u => u.id === r.user_id);
        return user ? user.email : 'user@company.com';
      }
      if (r.type === 'field') {
        // Replace with sample data
        return sampleData['Trigger.Email'] || 'contact@example.com';
      }
      return 'recipient@example.com';
    }).join(', ');
  };
  
  const previewSubject = replaceVariables(config.subject || '(No subject)');
  const previewBody = replaceVariables(config.body || '<p>Email body will appear here...</p>');
  
  return (
    <div className="border rounded-lg overflow-hidden mt-6">
      {/* Preview Header */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gradient-to-r from-indigo-50 to-purple-50 hover:from-indigo-100 hover:to-purple-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Mail className="h-4 w-4 text-indigo-600" />
          <span className="font-medium text-sm text-indigo-900">Email Preview</span>
          <Badge variant="secondary" className="text-xs bg-indigo-100 text-indigo-700">
            Live Preview
          </Badge>
        </div>
        <ChevronDown className={`h-4 w-4 text-indigo-600 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
      </button>
      
      {/* Preview Content */}
      {isExpanded && (
        <div className="p-4 bg-white border-t">
          {/* Email Envelope */}
          <div className="bg-slate-50 rounded-lg p-4 mb-4">
            <div className="space-y-2 text-sm">
              <div className="flex">
                <span className="text-slate-500 w-16 flex-shrink-0">From:</span>
                <span className="text-slate-800 font-medium">{getSenderDisplay()}</span>
              </div>
              <div className="flex">
                <span className="text-slate-500 w-16 flex-shrink-0">To:</span>
                <span className="text-slate-800">{getRecipientsDisplay()}</span>
              </div>
              <div className="flex">
                <span className="text-slate-500 w-16 flex-shrink-0">Subject:</span>
                <span className="text-slate-900 font-semibold">{previewSubject}</span>
              </div>
            </div>
          </div>
          
          {/* Email Body Preview */}
          <div className="border rounded-lg">
            <div className="bg-slate-100 px-4 py-2 border-b flex items-center gap-2">
              <div className="flex gap-1">
                <div className="w-3 h-3 rounded-full bg-red-400"></div>
                <div className="w-3 h-3 rounded-full bg-yellow-400"></div>
                <div className="w-3 h-3 rounded-full bg-green-400"></div>
              </div>
              <span className="text-xs text-slate-500 ml-2">Email Body Preview</span>
            </div>
            <div 
              className="p-4 prose prose-sm max-w-none min-h-[100px] max-h-[300px] overflow-y-auto bg-white"
              dangerouslySetInnerHTML={{ __html: previewBody }}
            />
          </div>
          
          {/* Sample Data Notice */}
          <div className="mt-3 flex items-start gap-2 text-xs text-slate-500">
            <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded text-xs font-medium">Note</span>
            <span>Variables are replaced with sample data for preview. Actual values will be resolved at runtime from trigger record.</span>
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Simple Rich Text Editor - FIX #3: Template insertion must update body immediately
 */
const RichTextEditor = ({ value, onChange, onInsertVariable }) => {
  const [showVariablePicker, setShowVariablePicker] = useState(false);
  const editorRef = React.useRef(null);
  
  const execCommand = (command, value = null) => {
    document.execCommand(command, false, value);
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }
  };
  
  const handleInput = () => {
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }
  };
  
  // FIX #3: Update content when value prop changes (e.g., from template insertion)
  useEffect(() => {
    if (editorRef.current) {
      // Only update if value is different from current content to avoid cursor jumping
      const currentContent = editorRef.current.innerHTML;
      if (currentContent !== value) {
        editorRef.current.innerHTML = value || '';
      }
    }
  }, [value]); // Dependency on value ensures editor updates when template is inserted
  
  return (
    <div className="border rounded-lg overflow-hidden">
      {/* Toolbar */}
      <div className="bg-slate-50 border-b px-2 py-1 flex items-center gap-1 flex-wrap">
        <button
          type="button"
          onClick={() => execCommand('bold')}
          className="p-1.5 rounded hover:bg-slate-200"
          title="Bold"
        >
          <Bold className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => execCommand('italic')}
          className="p-1.5 rounded hover:bg-slate-200"
          title="Italic"
        >
          <Italic className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => execCommand('underline')}
          className="p-1.5 rounded hover:bg-slate-200"
          title="Underline"
        >
          <Underline className="h-4 w-4" />
        </button>
        
        <div className="w-px h-4 bg-slate-300 mx-1"></div>
        
        <button
          type="button"
          onClick={() => execCommand('insertUnorderedList')}
          className="p-1.5 rounded hover:bg-slate-200"
          title="Bullet List"
        >
          <List className="h-4 w-4" />
        </button>
        
        <button
          type="button"
          onClick={() => {
            const url = prompt('Enter URL:');
            if (url) execCommand('createLink', url);
          }}
          className="p-1.5 rounded hover:bg-slate-200"
          title="Insert Link"
        >
          <Link className="h-4 w-4" />
        </button>
        
        <div className="w-px h-4 bg-slate-300 mx-1"></div>
        
        <button
          type="button"
          onClick={() => execCommand('justifyLeft')}
          className="p-1.5 rounded hover:bg-slate-200"
          title="Align Left"
        >
          <AlignLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => execCommand('justifyCenter')}
          className="p-1.5 rounded hover:bg-slate-200"
          title="Align Center"
        >
          <AlignCenter className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => execCommand('justifyRight')}
          className="p-1.5 rounded hover:bg-slate-200"
          title="Align Right"
        >
          <AlignRight className="h-4 w-4" />
        </button>
        
        <div className="flex-1"></div>
        
        <button
          type="button"
          onClick={() => onInsertVariable()}
          className="px-2 py-1 text-xs bg-indigo-100 text-indigo-700 rounded hover:bg-indigo-200 flex items-center gap-1"
          title="Insert Variable"
        >
          <Variable className="h-3 w-3" />
          Variable
        </button>
      </div>
      
      {/* Editor */}
      <div
        ref={editorRef}
        contentEditable
        onInput={handleInput}
        className="min-h-[200px] p-3 focus:outline-none prose prose-sm max-w-none"
        style={{ overflowY: 'auto', maxHeight: '300px' }}
        data-testid="rich-text-editor"
      />
    </div>
  );
};

/**
 * Recipient Chip Component
 */
const RecipientChip = ({ recipient, onRemove }) => {
  const getIcon = () => {
    switch (recipient.type) {
      case 'user': return <User className="h-3 w-3" />;
      case 'field': return <Database className="h-3 w-3" />;
      default: return <Mail className="h-3 w-3" />;
    }
  };
  
  const getLabel = () => {
    if (recipient.type === 'user') return recipient.name || recipient.email;
    if (recipient.type === 'field') return `{{${recipient.field}}}`;
    return recipient.email;
  };
  
  return (
    <Badge variant="secondary" className="flex items-center gap-1 pr-1">
      {getIcon()}
      <span className="max-w-[150px] truncate">{getLabel()}</span>
      <button onClick={onRemove} className="ml-1 hover:bg-slate-300 rounded-full p-0.5">
        <X className="h-3 w-3" />
      </button>
    </Badge>
  );
};

/**
 * Main Send Email Config Panel
 */
const SendEmailConfigPanel = ({ config, handleConfigChange, context }) => {
  // State
  const [fromMode, setFromMode] = useState(config.from_mode || 'custom');
  const [recipients, setRecipients] = useState(config.recipients || []);
  const [showVariablePicker, setShowVariablePicker] = useState(false);
  const [variableTarget, setVariableTarget] = useState(null); // 'subject' or 'body'
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [systemUsers, setSystemUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  
  // New recipient input states
  const [addRecipientMode, setAddRecipientMode] = useState('custom');
  const [customRecipientEmail, setCustomRecipientEmail] = useState('');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedField, setSelectedField] = useState('');
  
  // Fetch system users for dropdown
  useEffect(() => {
    fetchSystemUsers();
  }, []);
  
  const fetchSystemUsers = async () => {
    try {
      setLoadingUsers(true);
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API}/api/users`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSystemUsers(response.data || []);
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setLoadingUsers(false);
    }
  };
  
  // FIX: Dynamic email fields based on trigger object
  const [dynamicEmailFields, setDynamicEmailFields] = useState([]);
  const [loadingFields, setLoadingFields] = useState(false);
  
  // Fetch email fields dynamically from the trigger object
  useEffect(() => {
    const fetchDynamicFields = async () => {
      // Extract trigger entity from various context structures
      const triggerEntity = context?.triggerConfig?.entity || 
                           context?.triggerConfig?.object ||
                           context?.triggerConfig?.trigger_object;
      
      console.log('📧 [SendEmail] Checking for trigger entity:', triggerEntity);
      console.log('📧 [SendEmail] Context received:', {
        hasTriggerConfig: !!context?.triggerConfig,
        hasFetchFieldsForObject: !!context?.fetchFieldsForObject,
        triggerEntity
      });
      
      if (!triggerEntity) {
        console.log('📧 [SendEmail] No trigger entity found - using fallback fields');
        // Set fallback email fields for common objects
        setDynamicEmailFields([
          { name: 'Email', label: 'Email', type: 'email' }
        ]);
        return;
      }
      
      if (!context?.fetchFieldsForObject) {
        console.log('📧 [SendEmail] No fetchFieldsForObject function - using fallback');
        setDynamicEmailFields([
          { name: 'Email', label: 'Email', type: 'email' }
        ]);
        return;
      }
      
      try {
        setLoadingFields(true);
        console.log(`📧 [SendEmail] Fetching fields for object: ${triggerEntity}`);
        const fields = await context.fetchFieldsForObject(triggerEntity);
        
        // Filter to only email-type fields
        const emailFields = fields.filter(f => 
          f.type?.toLowerCase() === 'email' || 
          f.data_type?.toLowerCase() === 'email' ||
          f.name?.toLowerCase().includes('email') ||
          f.label?.toLowerCase().includes('email')
        );
        
        console.log(`📧 [SendEmail] Loaded ${emailFields.length} email fields for ${triggerEntity}:`, emailFields);
        
        // If no email fields found, add default
        if (emailFields.length === 0) {
          emailFields.push({ name: 'Email', label: 'Email', type: 'email' });
        }
        
        setDynamicEmailFields(emailFields);
      } catch (error) {
        console.error('📧 [SendEmail] Error fetching email fields:', error);
        // Set fallback on error
        setDynamicEmailFields([
          { name: 'Email', label: 'Email', type: 'email' }
        ]);
      } finally {
        setLoadingFields(false);
      }
    };
    
    fetchDynamicFields();
  }, [context?.triggerConfig, context?.fetchFieldsForObject]);
  
  // Get available email fields from context - Uses Trigger.<field> format
  const getEmailFields = useCallback(() => {
    const fields = [];
    const entity = context?.triggerConfig?.entity || context?.triggerConfig?.object || 'Record';
    const entityCapitalized = entity.charAt(0).toUpperCase() + entity.slice(1);
    
    console.log('📧 [getEmailFields] Building field list:', {
      entity,
      dynamicFieldsCount: dynamicEmailFields.length,
      hasTriggerConfig: !!context?.triggerConfig,
      previousNodesCount: context?.previousNodes?.length || 0,
      previousNodes: context?.previousNodes?.map(n => ({
        id: n.id,
        type: n.type,
        label: n.data?.label || n.label,
        hasConfig: !!(n.data?.config || n.config),
        actionType: (n.data?.config || n.config)?.action_type
      }))
    });
    
    // Use dynamically loaded email fields from trigger object with Trigger.<field> format
    if (dynamicEmailFields.length > 0) {
      dynamicEmailFields.forEach(field => {
        // Format: Trigger.Email (shorthand) - easier for users
        fields.push({
          id: `Trigger.${entityCapitalized}.${field.name}`,
          label: `Trigger.${field.name}`,
          description: `${entityCapitalized} ${field.label || field.name}`
        });
      });
    }
    
    // Always ensure at least one Trigger.Email option if we have trigger config
    if (fields.length === 0 && context?.triggerConfig) {
      fields.push({ 
        id: `Trigger.${entityCapitalized}.Email`, 
        label: `Trigger.Email`,
        description: `${entityCapitalized} Email Address`
      });
    }
    
    // FIX: Add fields from ALL previous action nodes (Get Records, Create Record, Update Record)
    if (context?.previousNodes && context.previousNodes.length > 0) {
      console.log('📧 [getEmailFields] Processing previous nodes...');
      
      context.previousNodes.forEach(node => {
        const nodeLabel = node.data?.label || node.label || node.id;
        const nodeLabelClean = nodeLabel.replace(/\s+/g, ''); // Remove spaces for variable names
        const nodeConfig = node.data?.config || node.config || {};
        const actionType = nodeConfig.action_type || nodeConfig.mcp_action?.split('.').pop();
        const objectType = nodeConfig.object || nodeConfig.entity || 'Record';
        const nodeType = node.type?.toLowerCase() || '';
        const labelLower = nodeLabel.toLowerCase();
        
        console.log(`📧 [getEmailFields] Node: ${nodeLabel}`, { nodeType, actionType, objectType, labelLower });
        
        // Detect action nodes by type, config, OR label pattern
        const isGetAction = nodeType.includes('get') || actionType === 'get' || nodeConfig.mcp_action?.includes('get') ||
                           labelLower.includes('get') || labelLower.includes('find') || labelLower.includes('fetch') || labelLower.includes('query');
        const isCreateAction = actionType === 'create' || nodeConfig.mcp_action?.includes('create') ||
                              labelLower.includes('create') || labelLower.includes('new') || labelLower.includes('add');
        const isUpdateAction = actionType === 'update' || nodeConfig.mcp_action?.includes('update') ||
                              labelLower.includes('update') || labelLower.includes('edit') || labelLower.includes('modify');
        const isMcpNode = nodeType === 'mcp' || nodeType === 'action' || nodeType === 'mcp_action' || nodeType === 'connector';
        
        // Skip trigger and end nodes
        if (nodeType === 'trigger' || nodeType === 'end' || nodeType === 'start') {
          return; // Skip
        }
        
        // Get Records nodes
        if (isGetAction) {
          console.log(`📧 [getEmailFields] Adding GET fields for: ${nodeLabel}`);
          // Add common email-related fields
          ['Email', 'email'].forEach(emailField => {
            fields.push({ 
              id: `${nodeLabelClean}.${emailField}`, 
              label: `${nodeLabel}.${emailField}`,
              description: `Email from ${objectType} (get action)`
            });
          });
          // Also add Id and Name for reference
          fields.push({ 
            id: `${nodeLabelClean}.Id`, 
            label: `${nodeLabel}.Id`,
            description: `ID from ${objectType}`
          });
          fields.push({ 
            id: `${nodeLabelClean}.Name`, 
            label: `${nodeLabel}.Name`,
            description: `Name from ${objectType}`
          });
        }
        
        // Create Record nodes
        if (isCreateAction) {
          console.log(`📧 [getEmailFields] Adding CREATE fields for: ${nodeLabel}`);
          // Add common email-related fields from created record
          ['Email', 'email'].forEach(emailField => {
            fields.push({ 
              id: `${nodeLabelClean}.${emailField}`, 
              label: `${nodeLabel}.${emailField}`,
              description: `Email from created ${objectType}`
            });
          });
          // Also add Id and Name for reference
          fields.push({ 
            id: `${nodeLabelClean}.Id`, 
            label: `${nodeLabel}.Id`,
            description: `ID of created ${objectType}`
          });
          fields.push({ 
            id: `${nodeLabelClean}.Name`, 
            label: `${nodeLabel}.Name`,
            description: `Name of created ${objectType}`
          });
        }
        
        // Update Record nodes
        if (isUpdateAction) {
          fields.push({ 
            id: `${nodeLabelClean}.updated_count`, 
            label: `${nodeLabel}.updated_count`,
            description: `Number of updated ${objectType} records`
          });
        }
      });
    }
    
    // Add WebhookBody fields for webhook triggers
    if (context?.triggerConfig?.body_fields) {
      context.triggerConfig.body_fields.forEach(bf => {
        if (bf.type === 'email' || bf.name.toLowerCase().includes('email')) {
          fields.push({
            id: `WebhookBody.${bf.name}`,
            label: `WebhookBody.${bf.name}`,
            description: `Email from webhook payload`
          });
        }
      });
    }
    
    console.log('📧 [getEmailFields] Final fields:', fields);
    return fields;
  }, [context, dynamicEmailFields]);
  
  // Handle FROM mode change
  const handleFromModeChange = (mode) => {
    setFromMode(mode);
    handleConfigChange('from_mode', mode);
    
    // Clear other from fields
    if (mode === 'custom') {
      handleConfigChange('from_user_id', null);
      handleConfigChange('from_field', null);
    } else if (mode === 'user') {
      handleConfigChange('from_email', null);
      handleConfigChange('from_field', null);
    } else if (mode === 'field') {
      handleConfigChange('from_email', null);
      handleConfigChange('from_user_id', null);
    }
  };
  
  // Add recipient
  const addRecipient = () => {
    let newRecipient = null;
    
    if (addRecipientMode === 'custom') {
      if (!customRecipientEmail) {
        toast.error('Please enter an email address');
        return;
      }
      if (!EMAIL_REGEX.test(customRecipientEmail)) {
        toast.error('Please enter a valid email address');
        return;
      }
      newRecipient = { type: 'custom', email: customRecipientEmail };
      setCustomRecipientEmail('');
    } else if (addRecipientMode === 'user') {
      if (!selectedUserId) {
        toast.error('Please select a user');
        return;
      }
      const user = systemUsers.find(u => u.id === selectedUserId);
      if (user) {
        newRecipient = { type: 'user', user_id: user.id, email: user.email, name: `${user.first_name} ${user.last_name}` };
      }
      setSelectedUserId('');
    } else if (addRecipientMode === 'field') {
      if (!selectedField) {
        toast.error('Please select a field');
        return;
      }
      newRecipient = { type: 'field', field: selectedField };
      setSelectedField('');
    }
    
    if (newRecipient) {
      const updated = [...recipients, newRecipient];
      setRecipients(updated);
      handleConfigChange('recipients', updated);
    }
  };
  
  // Remove recipient
  const removeRecipient = (index) => {
    const updated = recipients.filter((_, i) => i !== index);
    setRecipients(updated);
    handleConfigChange('recipients', updated);
  };
  
  // Insert variable into subject or body
  const handleInsertVariable = (variable) => {
    if (variableTarget === 'subject') {
      const current = config.subject || '';
      handleConfigChange('subject', current + variable);
    } else if (variableTarget === 'body') {
      const current = config.body || '';
      handleConfigChange('body', current + variable);
    }
    setShowVariablePicker(false);
  };
  
  // Insert template - Both subject and body are set in sequence
  const handleInsertTemplate = (template) => {
    console.log('📧 [handleInsertTemplate] Inserting template:', template.name);
    console.log('   Template subject:', template.subject);
    console.log('   Template body length:', template.body?.length || 0);
    
    // Get the new values
    const newSubject = template.subject || '';
    const newBody = template.body || '';
    
    console.log('   Setting subject to:', newSubject);
    handleConfigChange('subject', newSubject);
    
    console.log('   Setting body length:', newBody.length);
    handleConfigChange('body', newBody);
    
    console.log('   ✅ Template insertion complete');
    toast.success(`Template "${template.name}" inserted`);
  };
  
  return (
    <div className="space-y-6">
      {/* Email Service Selection */}
      <div>
        <Label className="text-sm font-medium">Email Service</Label>
        <Select
          value={config.email_service || 'system'}
          onValueChange={(value) => handleConfigChange('email_service', value)}
        >
          <SelectTrigger className="w-full mt-1">
            <SelectValue placeholder="Select email service" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="system">System Email (SMTP)</SelectItem>
            <SelectItem value="sendgrid">SendGrid (API)</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-slate-500 mt-1">
          {config.email_service === 'sendgrid' ? '📧 Using SendGrid API' : '✅ Using system SMTP server'}
        </p>
      </div>
      
      {/* FROM Field */}
      <div className="border rounded-lg p-4 bg-slate-50">
        <Label className="text-sm font-medium flex items-center gap-2">
          <Mail className="h-4 w-4" />
          From (Sender)
        </Label>
        
        <div className="mt-3 space-y-3">
          {/* Mode Selector - FIX #1: Removed "Record Field" option (not supported) */}
          <div className="flex gap-2">
            <Button
              type="button"
              variant={fromMode === 'custom' ? 'default' : 'outline'}
              size="sm"
              onClick={() => handleFromModeChange('custom')}
            >
              <Mail className="h-3 w-3 mr-1" />
              Custom Email
            </Button>
            <Button
              type="button"
              variant={fromMode === 'user' ? 'default' : 'outline'}
              size="sm"
              onClick={() => handleFromModeChange('user')}
            >
              <User className="h-3 w-3 mr-1" />
              System User
            </Button>
          </div>
          
          {/* Custom Email Input */}
          {fromMode === 'custom' && (
            <Input
              value={config.from_email || ''}
              onChange={(e) => handleConfigChange('from_email', e.target.value)}
              placeholder="sender@example.com"
              type="email"
            />
          )}
          
          {/* System User Selector */}
          {fromMode === 'user' && (
            <Select
              value={config.from_user_id || ''}
              onValueChange={(value) => handleConfigChange('from_user_id', value)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a user" />
              </SelectTrigger>
              <SelectContent>
                {systemUsers.map(user => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.first_name} {user.last_name} ({user.email})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>
      
      {/* TO Field (Recipients) */}
      <div className="border rounded-lg p-4 bg-slate-50">
        <Label className="text-sm font-medium flex items-center gap-2">
          <User className="h-4 w-4" />
          To (Recipients) *
        </Label>
        
        {/* Current Recipients */}
        {recipients.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {recipients.map((recipient, index) => (
              <RecipientChip
                key={index}
                recipient={recipient}
                onRemove={() => removeRecipient(index)}
              />
            ))}
          </div>
        )}
        
        {/* Add Recipient */}
        <div className="mt-3 space-y-2">
          <div className="flex gap-2">
            <Select value={addRecipientMode} onValueChange={setAddRecipientMode}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="custom">Custom Email</SelectItem>
                <SelectItem value="user">System User</SelectItem>
                <SelectItem value="field">Record Field</SelectItem>
              </SelectContent>
            </Select>
            
            {addRecipientMode === 'custom' && (
              <Input
                className="flex-1"
                value={customRecipientEmail}
                onChange={(e) => setCustomRecipientEmail(e.target.value)}
                placeholder="recipient@example.com"
                type="email"
              />
            )}
            
            {addRecipientMode === 'user' && (
              <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Select user" />
                </SelectTrigger>
                <SelectContent>
                  {systemUsers.map(user => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.first_name} {user.last_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            
            {addRecipientMode === 'field' && (
              <Select value={selectedField} onValueChange={setSelectedField}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder={loadingFields ? "Loading fields..." : "Select field"} />
                </SelectTrigger>
                <SelectContent>
                  {loadingFields ? (
                    <SelectItem value="_loading" disabled>Loading email fields...</SelectItem>
                  ) : getEmailFields().length === 0 ? (
                    <SelectItem value="_empty" disabled>No email fields found</SelectItem>
                  ) : (
                    getEmailFields().map(field => (
                      <SelectItem key={field.id} value={field.id}>
                        {field.label}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            )}
            
            <Button type="button" onClick={addRecipient} size="sm">
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>
        
        {recipients.length === 0 && (
          <p className="text-xs text-amber-600 mt-2">⚠️ At least one recipient is required</p>
        )}
      </div>
      
      {/* Subject */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <Label className="text-sm font-medium">Subject *</Label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => { setVariableTarget('subject'); setShowVariablePicker(true); }}
            className="text-xs"
          >
            <Variable className="h-3 w-3 mr-1" />
            Insert Variable
          </Button>
        </div>
        <Input
          value={config.subject || ''}
          onChange={(e) => handleConfigChange('subject', e.target.value)}
          placeholder="Email subject (supports {{variables}})"
        />
        <p className="text-xs text-slate-500 mt-1">
          Example: Welcome {'{{Trigger.Contact.Name}}'} — Your Account is Ready
        </p>
      </div>
      
      {/* Body */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <Label className="text-sm font-medium">Body *</Label>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowTemplatePicker(true)}
              className="text-xs"
            >
              <FileText className="h-3 w-3 mr-1" />
              Insert Template
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => { setVariableTarget('body'); setShowVariablePicker(true); }}
              className="text-xs"
            >
              <Variable className="h-3 w-3 mr-1" />
              Insert Variable
            </Button>
          </div>
        </div>
        <RichTextEditor
          value={config.body || ''}
          onChange={(html) => handleConfigChange('body', html)}
          onInsertVariable={() => { setVariableTarget('body'); setShowVariablePicker(true); }}
        />
      </div>
      
      {/* Email Preview Section */}
      <EmailPreviewSection 
        config={config}
        recipients={recipients}
        fromMode={fromMode}
        systemUsers={systemUsers}
        context={context}
      />
      
      {/* Variable Picker Modal */}
      <VariablePickerModal
        isOpen={showVariablePicker}
        onClose={() => setShowVariablePicker(false)}
        onSelect={handleInsertVariable}
        context={context}
      />
      
      {/* Template Selector Modal */}
      <TemplateSelectorModal
        isOpen={showTemplatePicker}
        onClose={() => setShowTemplatePicker(false)}
        onSelect={handleInsertTemplate}
      />
    </div>
  );
};

export default SendEmailConfigPanel;
