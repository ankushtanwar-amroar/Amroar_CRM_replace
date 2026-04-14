import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, X, Search, ChevronRight, Link2, ArrowLeft } from 'lucide-react';
import { Input } from '../../../components/ui/input';

const API_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';
const MAX_DOT_WALK_DEPTH = 3;

// Field type icons and colors for reference field support
const FIELD_TYPE_CONFIG = {
  lookup: { color: 'text-purple-600', bgColor: 'bg-purple-50', icon: Link2, label: 'Reference' },
  reference: { color: 'text-purple-600', bgColor: 'bg-purple-50', icon: Link2, label: 'Reference' },
  text: { color: 'text-slate-600', bgColor: 'bg-slate-50', label: 'Text' },
  textarea: { color: 'text-slate-600', bgColor: 'bg-slate-50', label: 'Text Area' },
  email: { color: 'text-blue-600', bgColor: 'bg-blue-50', label: 'Email' },
  phone: { color: 'text-green-600', bgColor: 'bg-green-50', label: 'Phone' },
  number: { color: 'text-orange-600', bgColor: 'bg-orange-50', label: 'Number' },
  currency: { color: 'text-emerald-600', bgColor: 'bg-emerald-50', label: 'Currency' },
  date: { color: 'text-indigo-600', bgColor: 'bg-indigo-50', label: 'Date' },
  datetime: { color: 'text-indigo-600', bgColor: 'bg-indigo-50', label: 'DateTime' },
  boolean: { color: 'text-amber-600', bgColor: 'bg-amber-50', label: 'Boolean' },
  select: { color: 'text-cyan-600', bgColor: 'bg-cyan-50', label: 'Picklist' },
  picklist: { color: 'text-cyan-600', bgColor: 'bg-cyan-50', label: 'Picklist' },
};

/**
 * ResourcePickerField - Salesforce-style resource picker with hierarchical structure
 * Shows: All Resources > Global Constants & Quick Resources > Field Selection
 * 
 * ENHANCED: Now supports reference field traversal (dot-walking) like:
 * - Trigger.Contact.Account.Name
 * - Trigger.Contact.Account.Industry
 * 
 * Used in Get Record filter conditions and Create Record value fields for advanced field references
 */
const ResourcePickerField = ({ 
  value, 
  onChange, 
  nodes = [], 
  availableFields = [], 
  disabled = false,
  placeholder = "Select a resource or type value...",
  showCommonValues = true,
  availableResources = [], // Legacy prop for compatibility
  fetchFieldsForObject = null, // Function to fetch fields for a specific object
  flowVariables = [], // Global flow variables array
  onCreateVariable = null // Callback to create new variable
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [view, setView] = useState('main'); // 'main' | 'resource-fields' | 'create-variable'
  const [selectedResource, setSelectedResource] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [inputValue, setInputValue] = useState(value || '');
  const [resourceFields, setResourceFields] = useState([]); // Dynamic fields for selected resource
  const [newVariableName, setNewVariableName] = useState('');
  const [newVariableType, setNewVariableType] = useState('text');
  const dropdownRef = useRef(null);
  const inputRef = useRef(null);
  const searchInputRef = useRef(null);
  
  // NEW: State for reference field traversal (dot-walking)
  const [navigationPath, setNavigationPath] = useState([]); // [{objectName, fieldName, label, relatedObject}]
  const [currentObjectName, setCurrentObjectName] = useState(null);
  const [fieldsCache, setFieldsCache] = useState({}); // Cache fetched fields per object

  useEffect(() => {
    setInputValue(value || '');
  }, [value]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
        setView('main');
        setSearchTerm('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const handleInputChange = (e) => {
    const newValue = e.target.value;
    setInputValue(newValue);
    onChange(newValue);
  };

  const handleValueSelect = (selectedValue) => {
    setInputValue(selectedValue);
    onChange(selectedValue);
    setIsOpen(false);
    setView('main');
    setSearchTerm('');
  };

  const handleResourceClick = async (resource) => {
    setSelectedResource(resource);
    setView('resource-fields');
    setSearchTerm('');
    
    // Initialize navigation for dot-walking
    setNavigationPath([]);
    setCurrentObjectName(resource.objectType);
    
    // Fetch fields for the selected resource's object
    await fetchFieldsForObjectWithCache(resource.objectType);
  };
  
  // NEW: Fetch fields with caching support for dot-walking
  const fetchFieldsForObjectWithCache = async (objectName) => {
    if (!objectName) {
      setResourceFields([]);
      return;
    }
    
    // Check cache first
    if (fieldsCache[objectName]) {
      setResourceFields(fieldsCache[objectName]);
      return;
    }
    
    if (fetchFieldsForObject) {
      try {
        const fields = await fetchFieldsForObject(objectName);
        // Mark reference fields
        const processedFields = fields.map(f => ({
          ...f,
          isReference: f.type === 'lookup' || f.type === 'reference' || !!f.related_object
        }));
        setFieldsCache(prev => ({ ...prev, [objectName]: processedFields }));
        setResourceFields(processedFields);
        console.log(`✅ Loaded ${processedFields.length} fields for ${objectName}:`, processedFields);
      } catch (error) {
        console.error(`❌ Failed to fetch fields for ${objectName}:`, error);
        setResourceFields([]);
      }
    } else {
      // Direct API call fallback
      try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_URL}/api/objects/${objectName.toLowerCase()}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
          const data = await response.json();
          const fieldsData = data.fields || {};
          
          let fetchedFields = [];
          if (Array.isArray(fieldsData)) {
            fetchedFields = fieldsData.map(f => ({
              name: f.api_name || f.name,
              label: f.label || f.name,
              type: f.type || 'text',
              related_object: f.related_object || f.referenceTo || null,
              isReference: f.type === 'lookup' || f.type === 'reference' || !!f.related_object
            }));
          } else if (typeof fieldsData === 'object') {
            fetchedFields = Object.entries(fieldsData).map(([fieldName, fieldConfig]) => ({
              name: fieldName,
              label: fieldConfig.label || fieldName,
              type: fieldConfig.type || 'text',
              related_object: fieldConfig.related_object || null,
              isReference: fieldConfig.type === 'lookup' || fieldConfig.type === 'reference' || !!fieldConfig.related_object
            }));
          }
          
          setFieldsCache(prev => ({ ...prev, [objectName]: fetchedFields }));
          setResourceFields(fetchedFields);
          console.log(`✅ Loaded ${fetchedFields.length} fields for ${objectName} (direct API)`);
        }
      } catch (error) {
        console.error(`❌ API call failed for ${objectName}:`, error);
        setResourceFields([]);
      }
    }
  };
  
  // NEW: Handle reference field click for dot-walking
  const handleReferenceFieldClick = async (field) => {
    if (!field.isReference || !field.related_object) return;
    
    // Check depth limit
    if (navigationPath.length >= MAX_DOT_WALK_DEPTH - 1) {
      console.log(`⚠️ Max dot-walk depth (${MAX_DOT_WALK_DEPTH}) reached`);
      return;
    }
    
    const relatedObjects = field.related_object.split(',').map(s => s.trim());
    const relatedObject = relatedObjects[0]; // Take first related object
    
    if (relatedObject) {
      // Add to navigation path
      setNavigationPath(prev => [...prev, {
        objectName: currentObjectName,
        fieldName: field.name,
        label: field.label,
        relatedObject: relatedObject
      }]);
      setCurrentObjectName(relatedObject);
      setSearchTerm('');
      
      // Fetch fields for the related object
      await fetchFieldsForObjectWithCache(relatedObject);
    }
  };
  
  // NEW: Handle navigation back in dot-walk
  const handleNavigateBack = async () => {
    if (navigationPath.length > 0) {
      const newPath = [...navigationPath];
      const popped = newPath.pop();
      setNavigationPath(newPath);
      
      // Determine which object to show
      let targetObject;
      if (newPath.length > 0) {
        targetObject = newPath[newPath.length - 1].relatedObject;
      } else {
        targetObject = selectedResource?.objectType;
      }
      
      setCurrentObjectName(targetObject);
      setSearchTerm('');
      
      // Load fields from cache or fetch
      if (targetObject && fieldsCache[targetObject]) {
        setResourceFields(fieldsCache[targetObject]);
      } else if (targetObject) {
        await fetchFieldsForObjectWithCache(targetObject);
      }
    }
  };
  
  // NEW: Build breadcrumb for current navigation
  const getBreadcrumb = () => {
    if (!selectedResource) return [];
    const parts = [{ label: selectedResource.label, objectName: selectedResource.objectType, isStart: true }];
    navigationPath.forEach(p => {
      parts.push({ label: p.label, objectName: p.relatedObject });
    });
    return parts;
  };
  
  // NEW: Get field type config for styling
  const getFieldTypeConfig = (type) => {
    const normalizedType = type?.toLowerCase() || 'text';
    return FIELD_TYPE_CONFIG[normalizedType] || FIELD_TYPE_CONFIG.text;
  };

  const handleBack = () => {
    setView('main');
    setSelectedResource(null);
    setSearchTerm('');
    setNewVariableName('');
    // Reset dot-walk navigation
    setNavigationPath([]);
    setCurrentObjectName(null);
  };

  const handleClear = (e) => {
    e.stopPropagation();
    setInputValue('');
    onChange('');
  };

  const handleCreateVariable = () => {
    if (newVariableName.trim() && onCreateVariable) {
      const variableName = newVariableName.trim();
      onCreateVariable({
        name: variableName,
        type: newVariableType,
        value: ''
      });
      // Use the new variable
      handleValueSelect(`{{${variableName}}}`);
      setNewVariableName('');
      setView('main');
    }
  };

  // Global Constants
  const globalConstants = [
    { value: 'true', label: 'True', description: 'Boolean true value', type: 'constant' },
    { value: 'false', label: 'False', description: 'Boolean false value', type: 'constant' },
    { value: '', label: 'Blank Value (Empty String)', description: 'Empty/null value', type: 'constant' },
  ];

  // Common Formulas
  const commonFormulas = [
    { value: 'TODAY()', label: 'TODAY()', description: 'Current date', type: 'formula' },
    { value: 'NOW()', label: 'NOW()', description: 'Current date and time', type: 'formula' },
    { value: 'TODAY() + 7', label: 'TODAY() + 7', description: 'Date 7 days from now', type: 'formula' },
    { value: 'TODAY() + 30', label: 'TODAY() + 30', description: 'Date 30 days from now', type: 'formula' },
    { value: '"text" + variable', label: 'String Concatenation', description: 'Combine text with variables', type: 'formula' },
    { value: 'LEN(text)', label: 'LEN(text)', description: 'Length of text', type: 'formula' },
  ];

  // Extract variables from Assignment nodes
  const variablesFromAssignments = nodes
    .filter(node => {
      // Check if it's an assignment node - multiple possible structures:
      // 1. type === 'assignment'
      // 2. type === 'default' && data.nodeType === 'assignment'
      // 3. type === 'logic' && data.nodeType === 'assignment'
      const isAssignmentType = node.type === 'assignment';
      const isDefaultWithAssignment = node.type === 'default' && node.data?.nodeType === 'assignment';
      const isLogicWithAssignment = node.type === 'logic' && node.data?.nodeType === 'assignment';
      const hasAssignments = node.data?.config?.assignments && node.data.config.assignments.length > 0;
      
      return (isAssignmentType || isDefaultWithAssignment || isLogicWithAssignment) && hasAssignments;
    })
    .flatMap(node => {
      const assignments = node.data.config.assignments || [];
      return assignments
        .filter(a => a.variable && a.variable.trim() !== '')
        .map(a => ({
          value: a.variable,
          label: a.variable,
          description: `Variable from ${node.data?.label || 'Assignment'}`,
          type: 'variable',
          nodeLabel: node.data?.label || 'Assignment'
        }));
    });

  // Log for debugging
  if (variablesFromAssignments.length > 0) {
    console.log('✅ Variables available:', variablesFromAssignments.map(v => v.label).join(', '));
  }
  
  // Add loop variables if node is inside a loop
  const loopVariables = [];
  nodes.forEach(node => {
    const loopContext = node.data?.loopContext;
    if (loopContext && loopContext.isInsideLoop) {
      // Add currentItem variable
      if (!loopVariables.find(v => v.value === 'currentItem')) {
        loopVariables.push({
          value: 'currentItem',
          label: 'currentItem',
          description: 'Current item in the loop (use currentItem.id, currentItem.data, etc.)',
          type: 'loop-variable',
          nodeLabel: 'Loop'
        });
      }
      
      // Also add an alias based on collection name
      const collectionVar = loopContext.collectionVariable;
      if (collectionVar) {
        const collectionName = collectionVar.replace(/[{}]/g, '').trim();
        // Create short alias: account_records → acc, contact_records → cont
        const alias = collectionName.split('_')[0].substring(0, 3);
        
        if (!loopVariables.find(v => v.value === alias)) {
          loopVariables.push({
            value: alias,
            label: alias,
            description: `Loop item alias for ${collectionName} (same as currentItem)`,
            type: 'loop-variable',
            nodeLabel: 'Loop'
          });
        }
      }
    }
  });
  
  if (loopVariables.length > 0) {
    console.log('✅ Loop variables available:', loopVariables.map(v => v.label).join(', '));
  }

  // Add flow variables (including input variables) to available options
  const flowVariableOptions = (flowVariables || []).map(variable => ({
    value: `{{${variable.name}}}`,
    label: variable.label || variable.name,
    description: `${variable.input ? '📥 Input Variable' : '📦 Flow Variable'} - ${variable.dataType || 'Any'}`,
    type: variable.input ? 'input-variable' : 'flow-variable',
    nodeLabel: 'Variables'
  }));

  if (flowVariableOptions.length > 0) {
    console.log('✅ Flow variables available:', flowVariableOptions.map(v => v.label).join(', '));
  }

  // Quick Resources (previous nodes with objects)
  const quickResources = nodes.map(node => {
    const nodeType = node.data?.nodeType || node.type;
    const config = node.data?.config || {};
    
    // For trigger nodes, get the entity they're triggering on
    const objectType = nodeType === 'trigger' 
      ? config.entity 
      : (config.entity || config.object);
    
    return {
      id: node.id,
      label: node.data?.label || `${node.type} Node`,
      type: nodeType,
      nodeType: nodeType,
      objectType: objectType,
      isTrigger: nodeType === 'trigger'
    };
  }).filter(r => r.objectType); // Only show nodes with objects

  // Filter based on search
  const filterItems = (items) => {
    if (!searchTerm) return items;
    const search = searchTerm.toLowerCase();
    return items.filter(item => 
      item.label?.toLowerCase().includes(search) ||
      item.value?.toLowerCase().includes(search) ||
      item.description?.toLowerCase().includes(search)
    );
  };

  const filteredConstants = filterItems(globalConstants);
  const filteredFormulas = filterItems(commonFormulas);
  const filteredVariables = filterItems([...flowVariableOptions, ...variablesFromAssignments, ...loopVariables]);
  const filteredResources = filterItems(quickResources);
  
  // Use resourceFields when viewing a specific resource, otherwise use availableFields
  const fieldsToDisplay = view === 'resource-fields' ? resourceFields : availableFields;
  const filteredFields = searchTerm 
    ? fieldsToDisplay.filter(f => f.label?.toLowerCase().includes(searchTerm.toLowerCase()))
    : fieldsToDisplay;

  return (
    <div className="relative" ref={dropdownRef}>
      <div className="relative">
        <Input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder}
          disabled={disabled}
          className="pr-16"
        />
        
        <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {inputValue && !disabled && (
            <button
              type="button"
              onClick={handleClear}
              className="p-1 hover:bg-slate-100 rounded"
              title="Clear"
            >
              <X className="h-3.5 w-3.5 text-slate-500" />
            </button>
          )}
          
          <button
            type="button"
            onClick={() => !disabled && setIsOpen(!isOpen)}
            className="p-1 hover:bg-slate-100 rounded"
            disabled={disabled}
          >
            <ChevronDown className={`h-4 w-4 text-slate-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-white shadow-lg max-h-96 overflow-hidden">
          {/* Search Box */}
          <div className="sticky top-0 bg-white border-b p-2 space-y-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                ref={searchInputRef}
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search resources and fields..."
                className="pl-8 h-8"
              />
            </div>
            
            {/* New Resource Button - Only in main view */}
            {view === 'main' && onCreateVariable && (
              <button
                type="button"
                onClick={() => setView('create-variable')}
                className="w-full flex items-center justify-center gap-2 px-3 py-1.5 text-sm font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded border border-indigo-200 transition-colors"
              >
                <span className="text-lg leading-none">+</span>
                <span>New Resource</span>
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-auto">
            {/* Create Variable View */}
            {view === 'create-variable' && (
              <div className="p-4">
                <button
                  type="button"
                  onClick={handleBack}
                  className="flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-700 mb-4"
                >
                  <ChevronRight className="h-4 w-4 rotate-180" />
                  <span>Back</span>
                </button>
                
                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900 mb-3">Create New Resource</h3>
                    <p className="text-xs text-slate-600 mb-4">
                      Create a global variable that can be used throughout your flow.
                    </p>
                  </div>
                  
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Resource Name
                    </label>
                    <Input
                      type="text"
                      value={newVariableName}
                      onChange={(e) => setNewVariableName(e.target.value)}
                      placeholder="e.g., accountsToUpdate, totalCount"
                      className="w-full"
                      autoFocus
                    />
                    <p className="text-xs text-slate-500 mt-1">
                      Use descriptive names like "accountsToUpdate" or "totalAmount"
                    </p>
                  </div>
                  
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Type
                    </label>
                    <select
                      value={newVariableType}
                      onChange={(e) => setNewVariableType(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
                    >
                      <option value="text">Text</option>
                      <option value="number">Number</option>
                      <option value="boolean">Boolean</option>
                      <option value="date">Date</option>
                      <option value="collection">Collection (Array)</option>
                    </select>
                  </div>
                  
                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      onClick={handleCreateVariable}
                      disabled={!newVariableName.trim()}
                      className="flex-1 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors"
                    >
                      Create Resource
                    </button>
                    <button
                      type="button"
                      onClick={handleBack}
                      className="px-4 py-2 bg-white border border-slate-300 text-slate-700 text-sm font-medium rounded hover:bg-slate-50 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}
            
            {/* Main View */}
            {view === 'main' && (
              <>
                {/* Header */}
                <div className="px-3 py-2 bg-slate-50 border-b">
                  <div className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
                    All Resources
                  </div>
                </div>

                {/* Global Constants */}
                {filteredConstants.length > 0 && (
                  <>
                    <div className="px-3 py-1.5 bg-slate-50 border-b">
                      <div className="text-xs font-medium text-slate-600">Global Constants</div>
                    </div>
                    {filteredConstants.map((constant, index) => (
                      <button
                        key={index}
                        type="button"
                        onClick={() => handleValueSelect(constant.value)}
                        className="w-full text-left px-4 py-2 text-sm hover:bg-indigo-50 transition-colors"
                      >
                        <div className="font-medium text-slate-900">{constant.label}</div>
                        <div className="text-xs text-slate-500 mt-0.5">{constant.description}</div>
                      </button>
                    ))}
                  </>
                )}

                {/* Common Formulas */}
                {filteredFormulas.length > 0 && (
                  <>
                    <div className="px-3 py-1.5 bg-slate-50 border-b">
                      <div className="text-xs font-medium text-slate-600">📐 Common Formulas</div>
                    </div>
                    {filteredFormulas.map((formula, index) => (
                      <button
                        key={index}
                        type="button"
                        onClick={() => handleValueSelect(formula.value)}
                        className="w-full text-left px-4 py-2 text-sm hover:bg-blue-50 transition-colors"
                      >
                        <div className="font-medium text-blue-700 font-mono text-sm">{formula.label}</div>
                        <div className="text-xs text-slate-500 mt-0.5">{formula.description}</div>
                      </button>
                    ))}
                  </>
                )}

                {/* Variables from Assignment Nodes */}
                {filteredVariables.length > 0 && (
                  <>
                    <div className="px-3 py-1.5 bg-slate-50 border-b">
                      <div className="text-xs font-medium text-slate-600">📦 Variables</div>
                    </div>
                    {filteredVariables.map((variable, index) => (
                      <button
                        key={index}
                        type="button"
                        onClick={() => handleValueSelect(variable.value)}
                        className="w-full text-left px-4 py-2 text-sm hover:bg-purple-50 transition-colors"
                      >
                        <div className="font-medium text-purple-700 font-mono">{variable.label}</div>
                        <div className="text-xs text-slate-500 mt-0.5">{variable.description}</div>
                      </button>
                    ))}
                  </>
                )}

                {/* Quick Resources */}
                {filteredResources.length > 0 && (
                  <>
                    <div className="px-3 py-1.5 bg-slate-50 border-b">
                      <div className="text-xs font-medium text-slate-600">🎯 Quick Resources</div>
                    </div>
                    {filteredResources.map((resource, index) => (
                      <button
                        key={index}
                        type="button"
                        onClick={() => handleResourceClick(resource)}
                        className="w-full flex items-center justify-between px-4 py-2 text-sm hover:bg-indigo-50 transition-colors group"
                      >
                        <div>
                          <div className="font-medium text-slate-900">
                            {resource.isTrigger && '⚡ '}
                            {resource.label}
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            {resource.objectType} • {resource.isTrigger ? 'Trigger Record' : 'CRM Action'}
                          </div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-slate-400 group-hover:text-indigo-600" />
                      </button>
                    ))}
                  </>
                )}

                {/* No Results */}
                {filteredConstants.length === 0 && filteredFormulas.length === 0 && filteredVariables.length === 0 && filteredResources.length === 0 && (
                  <div className="px-3 py-6 text-sm text-slate-500 text-center">
                    <div>No resources found</div>
                    <div className="text-xs mt-2">You can type formulas directly like:</div>
                    <div className="text-xs mt-1 font-mono bg-slate-100 px-2 py-1 rounded inline-block">TODAY() + 7</div>
                  </div>
                )}
              </>
            )}

            {/* Resource Fields View - ENHANCED with Reference Field Traversal */}
            {view === 'resource-fields' && selectedResource && (
              <>
                {/* Back Button - Shows differently based on navigation depth */}
                {navigationPath.length === 0 ? (
                  <button
                    type="button"
                    onClick={handleBack}
                    className="w-full px-3 py-2 bg-slate-50 border-b text-left text-sm font-medium text-indigo-600 hover:bg-slate-100 flex items-center gap-2"
                  >
                    <ChevronRight className="h-4 w-4 rotate-180" />
                    Back to All Resources
                  </button>
                ) : (
                  /* Breadcrumb Navigation for Dot-Walking */
                  <div className="px-3 py-2 bg-slate-50 border-b flex items-center gap-2 text-xs">
                    <button
                      type="button"
                      onClick={handleNavigateBack}
                      className="p-1 hover:bg-slate-200 rounded flex-shrink-0"
                      title="Go back"
                    >
                      <ArrowLeft className="h-3 w-3" />
                    </button>
                    <div className="flex items-center gap-1 overflow-x-auto">
                      {getBreadcrumb().map((crumb, idx) => (
                        <React.Fragment key={idx}>
                          {idx > 0 && <ChevronRight className="h-3 w-3 text-slate-400 flex-shrink-0" />}
                          <span className={`whitespace-nowrap ${idx === getBreadcrumb().length - 1 ? 'font-medium text-slate-900' : 'text-slate-500'}`}>
                            {crumb.label}
                          </span>
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                )}

                {/* Resource Header */}
                <div className="px-4 py-2 bg-indigo-50 border-b">
                  <div className="text-xs font-medium text-indigo-900">
                    {selectedResource.isTrigger && '⚡ '}
                    {navigationPath.length > 0 
                      ? `${navigationPath[navigationPath.length - 1].label} (${currentObjectName})`
                      : selectedResource.label
                    }
                  </div>
                  <div className="text-xs text-indigo-600 mt-0.5">
                    {currentObjectName || selectedResource.objectType} Fields
                  </div>
                </div>
                
                {/* Special ID field for trigger (only at root level) */}
                {selectedResource.isTrigger && navigationPath.length === 0 && (
                  <>
                    <div className="px-3 py-1.5 bg-slate-50 border-b">
                      <div className="text-xs font-medium text-slate-600">🆔 Special Fields</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleValueSelect(`Trigger.${selectedResource.objectType}.Id`)}
                      className="w-full text-left px-4 py-2 text-sm hover:bg-indigo-50 transition-colors border-b"
                    >
                      <div className="font-medium text-slate-900">⚡ Record ID</div>
                      <div className="text-xs text-slate-500 mt-0.5 font-mono">
                        {`Trigger.${selectedResource.objectType}.Id`}
                      </div>
                    </button>
                  </>
                )}

                {/* Fields List with Reference Field Support */}
                {filteredFields.length > 0 ? (
                  <>
                    {/* Regular Fields Header */}
                    <div className="px-3 py-1.5 bg-slate-50 border-b">
                      <div className="text-xs font-medium text-slate-600">
                        {filteredFields.some(f => f.isReference) 
                          ? '📋 Fields (click reference fields to expand)'
                          : '📋 Fields'
                        }
                      </div>
                    </div>
                    {filteredFields.map((field, index) => {
                      // Build the full dot-walk path
                      const pathParts = navigationPath.map(p => p.fieldName);
                      pathParts.push(field.name);
                      
                      // For trigger nodes, use Trigger.Object.Field.Path format
                      // For other nodes, use {{object_field_path}} format
                      const fieldPath = pathParts.join('.');
                      const fieldReference = selectedResource.isTrigger 
                        ? `Trigger.${selectedResource.objectType}.${fieldPath}`
                        : `{{${selectedResource.objectType}_${fieldPath.replace(/\./g, '_')}}}`;
                      
                      const isReferenceField = field.isReference && navigationPath.length < MAX_DOT_WALK_DEPTH - 1;
                      const typeConfig = getFieldTypeConfig(field.type);
                      const IconComponent = typeConfig.icon;
                      
                      return (
                        <button
                          key={index}
                          type="button"
                          onClick={() => {
                            if (isReferenceField) {
                              handleReferenceFieldClick(field);
                            } else {
                              handleValueSelect(fieldReference);
                            }
                          }}
                          className={`w-full text-left px-4 py-2 text-sm transition-colors flex items-center justify-between group ${
                            isReferenceField ? 'hover:bg-purple-50' : 'hover:bg-indigo-50'
                          }`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              {/* Reference field icon */}
                              {isReferenceField && (
                                <Link2 className="h-4 w-4 text-purple-600 flex-shrink-0" />
                              )}
                              <span className={`font-medium ${isReferenceField ? 'text-purple-900' : 'text-slate-900'}`}>
                                {selectedResource.isTrigger && navigationPath.length === 0 && '⚡ '}
                                {field.label}
                                {field.is_required && <span className="text-red-500 ml-1">*</span>}
                              </span>
                            </div>
                            <div className="text-xs text-slate-500 mt-0.5 font-mono truncate">
                              {fieldReference}
                            </div>
                            {/* Show related object for reference fields */}
                            {isReferenceField && field.related_object && (
                              <div className="text-xs text-purple-600 mt-0.5">
                                → {field.related_object}
                              </div>
                            )}
                          </div>
                          {/* Chevron for reference fields */}
                          {isReferenceField && (
                            <ChevronRight className="h-4 w-4 text-purple-400 group-hover:text-purple-600 flex-shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </>
                ) : (
                  <div className="px-3 py-6 text-sm text-slate-500 text-center">
                    No fields found
                  </div>
                )}
                
                {/* Special fields: ID and Record reference (only for non-trigger at root level) */}
                {selectedResource && !selectedResource.isTrigger && navigationPath.length === 0 && (
                  <>
                    <div className="border-t border-slate-200 my-2"></div>
                    <div className="px-3 py-1.5 bg-slate-50">
                      <div className="text-xs font-medium text-slate-600">Special Fields</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleValueSelect(`{{${selectedResource.objectType}_id}}`)}
                      className="w-full text-left px-4 py-2 text-sm hover:bg-indigo-50 transition-colors"
                    >
                      <div className="font-medium text-slate-900">🆔 Record ID</div>
                      <div className="text-xs text-slate-500 mt-0.5 font-mono">
                        {`{{${selectedResource.objectType}_id}}`}
                      </div>
                    </button>
                  </>
                )}
                
                {/* Help text for reference field traversal */}
                {filteredFields.some(f => f.isReference) && navigationPath.length < MAX_DOT_WALK_DEPTH - 1 && (
                  <div className="px-3 py-2 bg-purple-50 border-t text-xs text-purple-700">
                    💡 Click reference fields (with <Link2 className="inline h-3 w-3" />) to access related object fields
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ResourcePickerField;
