import React, { useState, useEffect } from 'react';
import { Table, Plus, Trash2, MoveUp, MoveDown, Edit3, Database, Link, Search, Filter, ArrowUpDown } from 'lucide-react';
import { Input } from '../../../../components/ui/input';
import { Label } from '../../../../components/ui/label';
import { Button } from '../../../../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../../components/ui/select';
import { Checkbox } from '../../../../components/ui/checkbox';
import { Badge } from '../../../../components/ui/badge';

const API_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';
const MAX_RECORD_LIMIT = 50;

// Filter operators by field type
const OPERATORS_BY_TYPE = {
  text: ['equals', 'not_equals', 'contains', 'starts_with', 'ends_with', 'is_blank', 'is_not_blank'],
  email: ['equals', 'not_equals', 'contains', 'is_blank', 'is_not_blank'],
  phone: ['equals', 'not_equals', 'contains', 'is_blank', 'is_not_blank'],
  number: ['equals', 'not_equals', 'greater_than', 'less_than', 'greater_or_equal', 'less_or_equal', 'is_blank', 'is_not_blank'],
  currency: ['equals', 'not_equals', 'greater_than', 'less_than', 'greater_or_equal', 'less_or_equal', 'is_blank', 'is_not_blank'],
  date: ['equals', 'not_equals', 'before', 'after', 'is_blank', 'is_not_blank'],
  datetime: ['equals', 'not_equals', 'before', 'after', 'is_blank', 'is_not_blank'],
  select: ['equals', 'not_equals', 'is_blank', 'is_not_blank'],
  picklist: ['equals', 'not_equals', 'is_blank', 'is_not_blank'],
  lookup: ['equals', 'not_equals', 'is_blank', 'is_not_blank'],
  boolean: ['equals'],
  default: ['equals', 'not_equals', 'is_blank', 'is_not_blank']
};

const OPERATOR_LABELS = {
  equals: 'Equals',
  not_equals: 'Not Equals',
  contains: 'Contains',
  starts_with: 'Starts With',
  ends_with: 'Ends With',
  greater_than: 'Greater Than',
  less_than: 'Less Than',
  greater_or_equal: 'Greater or Equal',
  less_or_equal: 'Less or Equal',
  before: 'Before',
  after: 'After',
  is_blank: 'Is Blank',
  is_not_blank: 'Is Not Blank'
};

const DataTableProperties = ({ field, onUpdate, nodes, fetchFieldsForObject }) => {
  // Data source mode: 'getRecords' or 'inlineQuery'
  const dataSourceMode = field.dataSourceMode || 'getRecords';
  
  // Get all Get Records nodes from the flow
  const getRecordsNodes = nodes ? nodes.filter(n => n.type === 'getRecords') : [];
  
  // Get selected data source details
  const selectedNode = field.dataSource?.nodeId ? 
    getRecordsNodes.find(n => n.id === field.dataSource.nodeId) : null;
  
  // Selected object (from Get Records node or inline query)
  const selectedObject = dataSourceMode === 'getRecords' 
    ? (selectedNode?.data?.object || '') 
    : (field.inlineQuery?.object || '');
  
  // State for available objects and fields
  const [availableObjects, setAvailableObjects] = useState([]);
  const [objectFields, setObjectFields] = useState([]);
  const [loadingFields, setLoadingFields] = useState(false);
  
  // Fetch available objects on mount
  useEffect(() => {
    const fetchObjects = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_URL}/api/objects`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
          const data = await response.json();
          setAvailableObjects(data);
        }
      } catch (error) {
        console.error('Failed to fetch objects:', error);
      }
    };
    fetchObjects();
  }, []);
  
  // Fetch fields when object changes
  useEffect(() => {
    const fetchFields = async () => {
      if (!selectedObject) {
        setObjectFields([]);
        return;
      }
      
      setLoadingFields(true);
      try {
        if (fetchFieldsForObject) {
          const fields = await fetchFieldsForObject(selectedObject);
          setObjectFields(fields);
        } else {
          const token = localStorage.getItem('token');
          const response = await fetch(`${API_URL}/api/objects/${selectedObject.toLowerCase()}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (response.ok) {
            const data = await response.json();
            const fieldsData = data.fields || {};
            
            let fields = [];
            if (Array.isArray(fieldsData)) {
              fields = fieldsData.map(f => ({
                name: f.api_name || f.name,
                label: f.label || f.name,
                type: f.type || 'text'
              }));
            } else if (typeof fieldsData === 'object') {
              fields = Object.entries(fieldsData).map(([fieldName, fieldConfig]) => ({
                name: fieldName,
                label: fieldConfig.label || fieldName,
                type: fieldConfig.type || 'text'
              }));
            }
            setObjectFields(fields);
          }
        }
      } catch (error) {
        console.error('Failed to fetch fields:', error);
        setObjectFields([]);
      } finally {
        setLoadingFields(false);
      }
    };
    
    fetchFields();
  }, [selectedObject, fetchFieldsForObject]);
  
  // Get available fields for the selected object
  const getAvailableFields = () => {
    return objectFields;
  };
  
  // Get operators for a field type
  const getOperatorsForType = (fieldType) => {
    return OPERATORS_BY_TYPE[fieldType] || OPERATORS_BY_TYPE.default;
  };

  const handleUpdate = (property, value) => {
    onUpdate(field.id, property, value);
  };
  
  // Handle data source mode change
  const handleDataSourceModeChange = (mode) => {
    handleUpdate('dataSourceMode', mode);
    // Clear the other mode's config
    if (mode === 'getRecords') {
      handleUpdate('inlineQuery', null);
    } else {
      handleUpdate('dataSource', null);
    }
  };
  
  // Handle inline query object change
  const handleInlineQueryObjectChange = (objectName) => {
    handleUpdate('inlineQuery', {
      ...field.inlineQuery,
      object: objectName,
      filters: [],
      limit: 10,
      sortField: null,
      sortOrder: 'asc'
    });
    // Clear columns when object changes
    handleUpdate('columns', []);
  };
  
  // Handle inline query filter updates
  const handleInlineQueryFilterUpdate = (filters) => {
    handleUpdate('inlineQuery', {
      ...field.inlineQuery,
      filters: filters
    });
  };
  
  // Add a new filter condition
  const addFilterCondition = () => {
    const currentFilters = field.inlineQuery?.filters || [];
    const newFilter = {
      field: '',
      operator: 'equals',
      value: '',
      logic: currentFilters.length > 0 ? 'AND' : null
    };
    handleInlineQueryFilterUpdate([...currentFilters, newFilter]);
  };
  
  // Update a filter condition
  const updateFilterCondition = (index, property, value) => {
    const currentFilters = [...(field.inlineQuery?.filters || [])];
    currentFilters[index] = { ...currentFilters[index], [property]: value };
    handleInlineQueryFilterUpdate(currentFilters);
  };
  
  // Remove a filter condition
  const removeFilterCondition = (index) => {
    const currentFilters = [...(field.inlineQuery?.filters || [])];
    currentFilters.splice(index, 1);
    // Update logic for first remaining filter
    if (currentFilters.length > 0 && index === 0) {
      currentFilters[0].logic = null;
    }
    handleInlineQueryFilterUpdate(currentFilters);
  };

  const addColumn = () => {
    const currentColumns = field.columns || [];
    const availableFields = getAvailableFields();
    
    if (availableFields.length === 0) {
      alert('Please select a data source first');
      return;
    }
    
    const firstAvailableField = availableFields[0];
    const newColumn = {
      field: firstAvailableField.name,
      label: firstAvailableField.label,
      type: firstAvailableField.type,
      sortable: true,
      width: 'auto'
    };
    
    handleUpdate('columns', [...currentColumns, newColumn]);
  };

  const updateColumn = (index, property, value) => {
    const currentColumns = [...(field.columns || [])];
    currentColumns[index] = { ...currentColumns[index], [property]: value };
    handleUpdate('columns', currentColumns);
  };

  const removeColumn = (index) => {
    const currentColumns = [...(field.columns || [])];
    currentColumns.splice(index, 1);
    handleUpdate('columns', currentColumns);
  };

  const moveColumn = (index, direction) => {
    const currentColumns = [...(field.columns || [])];
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    
    if (newIndex < 0 || newIndex >= currentColumns.length) return;
    
    [currentColumns[index], currentColumns[newIndex]] = [currentColumns[newIndex], currentColumns[index]];
    handleUpdate('columns', currentColumns);
  };

  return (
    <div className="space-y-4">
      {/* Component Label */}
      <div>
        <Label>Component Label *</Label>
        <Input
          value={field.label || ''}
          onChange={(e) => handleUpdate('label', e.target.value)}
          placeholder="e.g., Select Leads"
        />
      </div>

      {/* Data Source Mode Selection - FIXED overflow */}
      <div className="space-y-3 p-3 bg-slate-50 rounded-lg border overflow-hidden">
        <div className="flex items-center gap-2 mb-2">
          <Database className="w-4 h-4 text-indigo-600" />
          <Label className="text-sm font-semibold">Data Source *</Label>
        </div>
        
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant={dataSourceMode === 'getRecords' ? 'default' : 'outline'}
            size="sm"
            onClick={() => handleDataSourceModeChange('getRecords')}
            className="w-full text-xs px-2 h-9 whitespace-nowrap overflow-hidden"
          >
            <Link className="w-3 h-3 mr-1 flex-shrink-0" />
            <span className="truncate">Get Records</span>
          </Button>
          <Button
            type="button"
            variant={dataSourceMode === 'inlineQuery' ? 'default' : 'outline'}
            size="sm"
            onClick={() => handleDataSourceModeChange('inlineQuery')}
            className="w-full text-xs px-2 h-9 whitespace-nowrap overflow-hidden"
          >
            <Search className="w-3 h-3 mr-1 flex-shrink-0" />
            <span className="truncate">Query Object</span>
          </Button>
        </div>
        
        <p className="text-xs text-slate-600">
          {dataSourceMode === 'getRecords' 
            ? 'Reference a Get Records node from earlier in the flow'
            : 'Query records directly when screen loads (works on first screen!)'}
        </p>
      </div>

      {/* Mode A: Get Records Node Selection */}
      {dataSourceMode === 'getRecords' && (
        <div>
          <Label>Select Get Records Node *</Label>
          <Select 
            value={field.dataSource?.nodeId || ''} 
            onValueChange={(value) => handleUpdate('dataSource', { type: 'getRecords', nodeId: value })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select Get Records node" />
            </SelectTrigger>
            <SelectContent>
              {getRecordsNodes.length === 0 && (
                <SelectItem value="_none" disabled>No Get Records nodes found</SelectItem>
              )}
              {getRecordsNodes.map(node => (
                <SelectItem key={node.id} value={node.id}>
                  {node.data?.label || node.id} ({node.data?.object || 'Unknown'})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {getRecordsNodes.length === 0 && (
            <p className="text-xs text-amber-600 mt-1">
              💡 Tip: Switch to "Query Object Directly" to show data on the first screen
            </p>
          )}
        </div>
      )}

      {/* Mode B: Inline Query Configuration - NEW */}
      {dataSourceMode === 'inlineQuery' && (
        <div className="space-y-4 p-3 border rounded-lg bg-blue-50/30">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-blue-600" />
            <h4 className="text-sm font-semibold text-blue-900">Inline Query Configuration</h4>
          </div>
          
          {/* Object Selection */}
          <div>
            <Label>Object *</Label>
            <Select 
              value={field.inlineQuery?.object || ''} 
              onValueChange={handleInlineQueryObjectChange}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select CRM object" />
              </SelectTrigger>
              <SelectContent>
                {availableObjects.map(obj => (
                  <SelectItem key={obj.object_name} value={obj.object_name}>
                    {obj.object_label || obj.object_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          {/* Filter Criteria Builder */}
          {field.inlineQuery?.object && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Filter Criteria</Label>
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={addFilterCondition}
                  className="h-7 text-xs"
                >
                  <Plus className="w-3 h-3 mr-1" />
                  Add Condition
                </Button>
              </div>
              
              {(!field.inlineQuery?.filters || field.inlineQuery.filters.length === 0) && (
                <p className="text-xs text-slate-500 italic p-2 border rounded bg-white">
                  No filters. All records will be returned (up to limit).
                </p>
              )}
              
              <div className="space-y-2">
                {(field.inlineQuery?.filters || []).map((filter, index) => (
                  <div key={index} className="p-2 border rounded bg-white space-y-2">
                    {/* Logic connector (AND/OR) for non-first filters */}
                    {index > 0 && (
                      <Select
                        value={filter.logic || 'AND'}
                        onValueChange={(value) => updateFilterCondition(index, 'logic', value)}
                      >
                        <SelectTrigger className="h-6 w-20 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="AND">AND</SelectItem>
                          <SelectItem value="OR">OR</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                    
                    <div className="grid grid-cols-12 gap-2 items-end">
                      {/* Field Selection */}
                      <div className="col-span-4">
                        <Label className="text-xs">Field</Label>
                        <Select
                          value={filter.field}
                          onValueChange={(value) => {
                            updateFilterCondition(index, 'field', value);
                            // Reset operator when field changes
                            const fieldDef = objectFields.find(f => f.name === value);
                            if (fieldDef) {
                              const operators = getOperatorsForType(fieldDef.type);
                              updateFilterCondition(index, 'operator', operators[0]);
                            }
                          }}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="Select field" />
                          </SelectTrigger>
                          <SelectContent>
                            {objectFields.map(f => (
                              <SelectItem key={f.name} value={f.name}>{f.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      
                      {/* Operator Selection */}
                      <div className="col-span-3">
                        <Label className="text-xs">Operator</Label>
                        <Select
                          value={filter.operator}
                          onValueChange={(value) => updateFilterCondition(index, 'operator', value)}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {(() => {
                              const fieldDef = objectFields.find(f => f.name === filter.field);
                              const operators = fieldDef ? getOperatorsForType(fieldDef.type) : getOperatorsForType('default');
                              return operators.map(op => (
                                <SelectItem key={op} value={op}>{OPERATOR_LABELS[op]}</SelectItem>
                              ));
                            })()}
                          </SelectContent>
                        </Select>
                      </div>
                      
                      {/* Value Input (hide for is_blank/is_not_blank) */}
                      {!['is_blank', 'is_not_blank'].includes(filter.operator) && (
                        <div className="col-span-4">
                          <Label className="text-xs">Value</Label>
                          <Input
                            value={filter.value || ''}
                            onChange={(e) => updateFilterCondition(index, 'value', e.target.value)}
                            className="h-8 text-xs"
                            placeholder="Enter value"
                          />
                        </div>
                      )}
                      
                      {/* Remove Button */}
                      <div className="col-span-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => removeFilterCondition(index)}
                          className="h-8 w-8 p-0 text-red-600"
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* Record Limit */}
          {field.inlineQuery?.object && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Record Limit * <span className="text-xs text-slate-500">(max {MAX_RECORD_LIMIT})</span></Label>
                <Input
                  type="number"
                  min="1"
                  max={MAX_RECORD_LIMIT}
                  value={field.inlineQuery?.limit || 10}
                  onChange={(e) => {
                    const value = Math.min(parseInt(e.target.value) || 10, MAX_RECORD_LIMIT);
                    handleUpdate('inlineQuery', { ...field.inlineQuery, limit: value });
                  }}
                  className="h-8"
                />
              </div>
              
              {/* Sort Order */}
              <div>
                <Label>Sort By <span className="text-xs text-slate-500">(optional)</span></Label>
                <div className="flex gap-1">
                  <Select
                    value={field.inlineQuery?.sortField || ''}
                    onValueChange={(value) => handleUpdate('inlineQuery', { ...field.inlineQuery, sortField: value })}
                  >
                    <SelectTrigger className="h-8 text-xs flex-1">
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">None</SelectItem>
                      {objectFields.map(f => (
                        <SelectItem key={f.name} value={f.name}>{f.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {field.inlineQuery?.sortField && field.inlineQuery.sortField !== '_none' && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 px-2"
                      onClick={() => handleUpdate('inlineQuery', { 
                        ...field.inlineQuery, 
                        sortOrder: field.inlineQuery?.sortOrder === 'asc' ? 'desc' : 'asc' 
                      })}
                    >
                      <ArrowUpDown className="w-3 h-3 mr-1" />
                      {field.inlineQuery?.sortOrder === 'desc' ? 'Desc' : 'Asc'}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Columns Configuration */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <Label>Columns *</Label>
          <Button 
            size="sm" 
            variant="outline" 
            onClick={addColumn}
            disabled={!selectedObject}
          >
            <Plus className="w-3 h-3 mr-1" />
            Add Column
          </Button>
        </div>
        
        {(!field.columns || field.columns.length === 0) && (
          <p className="text-xs text-gray-500 italic p-3 border rounded">
            No columns added. Click "Add Column" to start.
          </p>
        )}
        
        <div className="space-y-2">
          {(field.columns || []).map((column, index) => (
            <div key={index} className="p-3 border rounded bg-slate-50 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-700">Column {index + 1}</span>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => moveColumn(index, 'up')}
                    disabled={index === 0}
                    className="h-6 w-6 p-0"
                  >
                    <MoveUp className="w-3 h-3" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => moveColumn(index, 'down')}
                    disabled={index === field.columns.length - 1}
                    className="h-6 w-6 p-0"
                  >
                    <MoveDown className="w-3 h-3" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => removeColumn(index)}
                    className="h-6 w-6 p-0 text-red-600"
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Field</Label>
                  <Select
                    value={column.field}
                    onValueChange={(value) => {
                      const fieldDef = getAvailableFields().find(f => f.name === value);
                      updateColumn(index, 'field', value);
                      if (fieldDef) {
                        updateColumn(index, 'label', fieldDef.label);
                        updateColumn(index, 'type', fieldDef.type);
                      }
                    }}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {getAvailableFields().map(f => (
                        <SelectItem key={f.name} value={f.name}>{f.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <Label className="text-xs">Label</Label>
                  <Input
                    value={column.label}
                    onChange={(e) => updateColumn(index, 'label', e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={column.sortable !== false}
                  onChange={(e) => updateColumn(index, 'sortable', e.target.checked)}
                  className="w-3 h-3"
                />
                <Label className="text-xs">Sortable</Label>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Selection Mode */}
      <div>
        <Label>Selection Mode</Label>
        <Select 
          value={field.selectionMode || 'none'} 
          onValueChange={(value) => handleUpdate('selectionMode', value)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">None</SelectItem>
            <SelectItem value="single">Single Select</SelectItem>
            <SelectItem value="multi">Multi Select</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Output Variable Binding */}
      {field.selectionMode && field.selectionMode !== 'none' && (
        <div>
          <Label>Output Variable Name *</Label>
          <Input
            value={field.selectionMode === 'single' ? field.outputSingleVar || '' : field.outputMultiVar || ''}
            onChange={(e) => handleUpdate(
              field.selectionMode === 'single' ? 'outputSingleVar' : 'outputMultiVar', 
              e.target.value
            )}
            placeholder={field.selectionMode === 'single' ? 'e.g., selectedLeadId' : 'e.g., selectedLeadIds'}
          />
          <p className="text-xs text-gray-500 mt-1">
            {field.selectionMode === 'single' ? 
              'Variable to store selected record ID' : 
              'Variable to store array of selected record IDs'}
          </p>
        </div>
      )}

      {/* Required Selection */}
      {field.selectionMode && field.selectionMode !== 'none' && (
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={field.required || false}
            onChange={(e) => handleUpdate('required', e.target.checked)}
            className="w-4 h-4"
          />
          <Label>Required Selection</Label>
        </div>
      )}

      {/* Inline Editing Configuration */}
      <div className="space-y-3 pt-4 border-t">
        <div className="flex items-center gap-2">
          <Edit3 className="w-4 h-4 text-indigo-600" />
          <h4 className="text-sm font-medium">Inline Editing</h4>
        </div>
        
        {/* Table Mode */}
        <div>
          <Label>Table Mode *</Label>
          <Select 
            value={field.tableMode || 'readOnly'} 
            onValueChange={(value) => handleUpdate('tableMode', value)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="readOnly">Read Only</SelectItem>
              <SelectItem value="inlineEditable">Inline Editable</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-gray-500 mt-1">
            {field.tableMode === 'inlineEditable' ? 
              'Users can edit cell values directly in the table' : 
              'Table is view-only, no editing allowed'}
          </p>
        </div>

        {/* Editable Columns - only show when Inline Editable */}
        {field.tableMode === 'inlineEditable' && (
          <>
            <div>
              <Label>Editable Columns *</Label>
              <div className="mt-2 space-y-2 max-h-40 overflow-y-auto border rounded p-2">
                {(field.columns || []).map((column, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <Checkbox
                      checked={(field.editableColumns || []).includes(column.field)}
                      onCheckedChange={(checked) => {
                        const current = field.editableColumns || [];
                        const updated = checked 
                          ? [...current, column.field]
                          : current.filter(f => f !== column.field);
                        handleUpdate('editableColumns', updated);
                      }}
                    />
                    <label className="text-sm cursor-pointer flex-1">
                      {column.label}
                      <span className="text-gray-500 text-xs ml-2">({column.type})</span>
                    </label>
                  </div>
                ))}
              </div>
              {(!field.editableColumns || field.editableColumns.length === 0) && (
                <p className="text-xs text-orange-600 mt-1">⚠ Select at least one editable column</p>
              )}
            </div>

            {/* Edit Save Behavior */}
            <div>
              <Label>Edit Save Behavior *</Label>
              <Select 
                value={field.editSaveBehavior || 'saveLocal'} 
                onValueChange={(value) => handleUpdate('editSaveBehavior', value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="saveLocal">Save changes locally only</SelectItem>
                  <SelectItem value="updateImmediate" disabled>Update records immediately (Phase 2)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500 mt-1">
                Local save: Changes stored in flow context for later use
              </p>
            </div>

            {/* Output Variable for Edited Data */}
            <div>
              <Label>Edited Data Output Variable</Label>
              <Input
                value={field.editedDataVar || ''}
                onChange={(e) => handleUpdate('editedDataVar', e.target.value)}
                placeholder="e.g., editedLeads"
              />
              <p className="text-xs text-gray-500 mt-1">
                Variable to store edited records payload
              </p>
            </div>

            {/* Column Validation Rules */}
            <div>
              <Label>Column Validation Rules</Label>
              <div className="mt-2 space-y-3 border rounded p-3 max-h-60 overflow-y-auto">
                {(field.editableColumns || []).map((fieldName) => {
                  const column = (field.columns || []).find(c => c.field === fieldName);
                  if (!column) return null;
                  
                  const validationKey = `validation_${fieldName}`;
                  const currentValidation = field[validationKey] || {};
                  
                  return (
                    <div key={fieldName} className="bg-gray-50 p-2 rounded space-y-2">
                      <p className="text-xs font-medium text-gray-700">{column.label}</p>
                      
                      <div className="flex items-center gap-2">
                        <Checkbox
                          checked={currentValidation.required || false}
                          onCheckedChange={(checked) => {
                            handleUpdate(validationKey, { ...currentValidation, required: checked });
                          }}
                        />
                        <Label className="text-xs">Required</Label>
                      </div>
                      
                      {column.type === 'text' && (
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-xs">Max Length</Label>
                            <Input
                              type="number"
                              value={currentValidation.maxLength || ''}
                              onChange={(e) => {
                                handleUpdate(validationKey, { 
                                  ...currentValidation, 
                                  maxLength: e.target.value ? parseInt(e.target.value) : null 
                                });
                              }}
                              className="h-7 text-xs"
                              placeholder="e.g., 100"
                            />
                          </div>
                        </div>
                      )}
                      
                      {column.type === 'number' && (
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-xs">Min Value</Label>
                            <Input
                              type="number"
                              value={currentValidation.min || ''}
                              onChange={(e) => {
                                handleUpdate(validationKey, { 
                                  ...currentValidation, 
                                  min: e.target.value ? parseFloat(e.target.value) : null 
                                });
                              }}
                              className="h-7 text-xs"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Max Value</Label>
                            <Input
                              type="number"
                              value={currentValidation.max || ''}
                              onChange={(e) => {
                                handleUpdate(validationKey, { 
                                  ...currentValidation, 
                                  max: e.target.value ? parseFloat(e.target.value) : null 
                                });
                              }}
                              className="h-7 text-xs"
                            />
                          </div>
                        </div>
                      )}
                      
                      {column.type === 'picklist' && (
                        <div>
                          <Label className="text-xs">Allowed Values (comma-separated)</Label>
                          <Input
                            value={currentValidation.allowedValues || ''}
                            onChange={(e) => {
                              handleUpdate(validationKey, { 
                                ...currentValidation, 
                                allowedValues: e.target.value 
                              });
                            }}
                            className="h-7 text-xs"
                            placeholder="New,Working,Qualified,Closed"
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
                
                {(!field.editableColumns || field.editableColumns.length === 0) && (
                  <p className="text-xs text-gray-500 text-center py-4">
                    Select editable columns to configure validation rules
                  </p>
                )}
              </div>
            </div>

            {/* Read-only Locking (Optional) */}
            <div>
              <Label>Row Lock Condition (Optional)</Label>
              <Input
                value={field.rowLockCondition || ''}
                onChange={(e) => handleUpdate('rowLockCondition', e.target.value)}
                placeholder='e.g., {{row.status}} == "Closed"'
              />
              <p className="text-xs text-gray-500 mt-1">
                Formula: Rows matching condition will be read-only
              </p>
            </div>
          </>
        )}
      </div>

      {/* Table Behavior */}
      <div className="space-y-3 pt-4 border-t">
        <h4 className="text-sm font-medium">Table Behavior</h4>
        
        <div>
          <Label>Page Size</Label>
          <Select 
            value={String(field.pageSize || 10)} 
            onValueChange={(value) => handleUpdate('pageSize', parseInt(value))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="5">5 rows</SelectItem>
              <SelectItem value="10">10 rows</SelectItem>
              <SelectItem value="20">20 rows</SelectItem>
              <SelectItem value="50">50 rows</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={field.pagination !== false}
            onChange={(e) => handleUpdate('pagination', e.target.checked)}
            className="w-4 h-4"
          />
          <Label>Enable Pagination</Label>
        </div>
        
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={field.sorting !== false}
            onChange={(e) => handleUpdate('sorting', e.target.checked)}
            className="w-4 h-4"
          />
          <Label>Enable Sorting</Label>
        </div>
        
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={field.search || false}
            onChange={(e) => handleUpdate('search', e.target.checked)}
            className="w-4 h-4"
          />
          <Label>Enable Search</Label>
        </div>
        
        {field.search && (
          <div>
            <Label className="text-xs">Search Placeholder</Label>
            <Input
              value={field.searchPlaceholder || ''}
              onChange={(e) => handleUpdate('searchPlaceholder', e.target.value)}
              placeholder="Search records..."
              className="h-8"
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default DataTableProperties;
