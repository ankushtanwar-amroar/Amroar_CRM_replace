/**
 * VisibilityConditionBuilder - Multi-condition builder UI with AND/OR logic
 * Field-type aware operators and value inputs
 * Uses Salesforce-style cascading field picker modal for compact space
 */
import React, { useState, useCallback, useMemo } from 'react';
import { 
  Plus, Trash2, AlertCircle, Eye, EyeOff, ChevronDown, ChevronRight,
  User, FileText, HelpCircle, Search, Link2, X
} from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Badge } from '../../../components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../../../components/ui/dialog';
import {
  VISIBILITY_MODES,
  LOGIC_OPERATORS,
  CONDITION_SOURCES,
  USER_FIELDS,
  USER_ROLES,
  USER_PROFILES,
  getOperatorsForFieldType,
  operatorRequiresValue,
  createEmptyCondition,
} from '../types/visibilityTypes';
import {
  getFieldType,
  getPicklistOptions,
  formatFieldLabel,
} from '../utils/visibilityUtils';

/**
 * Single Condition Row Component with Cascading Field Picker
 */
const ConditionRow = ({ 
  condition, 
  index,
  objectFields,
  onChange, 
  onRemove,
  canRemove,
  showLogic,
  logic,
  objectName = '',
}) => {
  const [showFieldPicker, setShowFieldPicker] = useState(false);
  const [selectedColumn1, setSelectedColumn1] = useState(null);
  const [selectedColumn2, setSelectedColumn2] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  const { source, left, operator, right } = condition;
  
  // Separate fields into regular and parent groups
  const { regularFields, parentFieldGroups } = useMemo(() => {
    const regular = [];
    const groups = {};
    
    objectFields.forEach(f => {
      if (f.isParent) {
        const parentName = f.parentObject?.charAt(0).toUpperCase() + f.parentObject?.slice(1) || 'Parent';
        if (!groups[parentName]) groups[parentName] = [];
        groups[parentName].push(f);
      } else {
        regular.push(f);
      }
    });
    
    return { regularFields: regular, parentFieldGroups: groups };
  }, [objectFields]);

  const hasParentFields = Object.keys(parentFieldGroups).length > 0;
  
  // Get field type and operators based on selected field
  const fieldType = useMemo(() => {
    if (source === CONDITION_SOURCES.USER) {
      const userField = USER_FIELDS.find(f => f.key === left);
      return userField?.type || 'text';
    }
    return getFieldType(left, objectFields);
  }, [source, left, objectFields]);
  
  const operators = useMemo(() => getOperatorsForFieldType(fieldType), [fieldType]);
  const requiresValue = operatorRequiresValue(operator);
  
  // Get picklist options for value dropdown
  const picklistOptions = useMemo(() => {
    if (source === CONDITION_SOURCES.USER) {
      if (left === 'User.Role') return USER_ROLES;
      if (left === 'User.Profile') return USER_PROFILES;
      return [];
    }
    return getPicklistOptions(left, objectFields);
  }, [source, left, objectFields]);
  
  // Check if current field is a parent reference
  const isParentField = left?.includes('.');
  
  // Get display label for selected field
  const getFieldLabel = () => {
    if (!left) return 'Select field...';
    
    if (source === CONDITION_SOURCES.USER) {
      const userField = USER_FIELDS.find(f => f.key === left);
      return userField?.label || left;
    }
    
    const field = objectFields.find(f => (f.key || f.api_name) === left);
    return field?.label || formatFieldLabel(left);
  };
  
  const handleFieldChange = (field, value) => {
    const updated = { ...condition, [field]: value };
    
    // Reset operator and value when changing source or field
    if (field === 'source' || field === 'left') {
      updated.operator = '=';
      updated.right = '';
    }
    
    onChange(updated);
  };

  // Open field picker modal
  const openFieldPicker = () => {
    setSelectedColumn1('current');
    setSearchTerm('');
    setShowFieldPicker(true);
  };

  // Handle field selection in picker
  const handleSelectField = (fieldKey) => {
    handleFieldChange('left', fieldKey);
    setShowFieldPicker(false);
  };

  // Filter fields by search
  const filteredRegularFields = useMemo(() => {
    if (!searchTerm) return regularFields;
    const search = searchTerm.toLowerCase();
    return regularFields.filter(f => 
      (f.label || f.key || '').toLowerCase().includes(search) ||
      (f.key || f.api_name || '').toLowerCase().includes(search)
    );
  }, [regularFields, searchTerm]);

  const filteredParentFields = useMemo(() => {
    if (!searchTerm) return parentFieldGroups;
    const search = searchTerm.toLowerCase();
    const filtered = {};
    Object.entries(parentFieldGroups).forEach(([parent, fields]) => {
      const matching = fields.filter(f => 
        (f.label || f.key || '').toLowerCase().includes(search) ||
        (f.key || f.api_name || '').toLowerCase().includes(search)
      );
      if (matching.length > 0) {
        filtered[parent] = matching;
      }
    });
    return filtered;
  }, [parentFieldGroups, searchTerm]);
  
  // Determine value input type based on field type
  const renderValueInput = () => {
    if (!requiresValue) return null;
    
    // Boolean field
    if (fieldType === 'boolean' || fieldType === 'checkbox') {
      return (
        <select
          value={right}
          onChange={(e) => handleFieldChange('right', e.target.value)}
          className="h-7 text-xs border rounded px-2 bg-white focus:ring-1 focus:ring-blue-500 min-w-[70px]"
        >
          <option value="">Select...</option>
          <option value="true">True</option>
          <option value="false">False</option>
        </select>
      );
    }
    
    // Picklist field
    if (['picklist', 'select', 'multipicklist'].includes(fieldType) && picklistOptions.length > 0) {
      return (
        <select
          value={right}
          onChange={(e) => handleFieldChange('right', e.target.value)}
          className="h-7 text-xs border rounded px-2 bg-white focus:ring-1 focus:ring-blue-500 min-w-[90px] max-w-[120px]"
        >
          <option value="">Select...</option>
          {picklistOptions.map(opt => (
            <option key={opt.value || opt} value={opt.value || opt}>
              {opt.label || opt}
            </option>
          ))}
        </select>
      );
    }
    
    // Date field
    if (fieldType === 'date' || fieldType === 'datetime') {
      return (
        <Input
          type="date"
          value={right}
          onChange={(e) => handleFieldChange('right', e.target.value)}
          className="h-7 text-xs w-[110px]"
        />
      );
    }
    
    // Number field
    if (['number', 'currency', 'percent', 'integer', 'decimal'].includes(fieldType)) {
      return (
        <Input
          type="number"
          value={right}
          onChange={(e) => handleFieldChange('right', e.target.value)}
          placeholder="Value"
          className="h-7 text-xs w-[70px]"
        />
      );
    }
    
    // Default: text input
    return (
      <Input
        type="text"
        value={right}
        onChange={(e) => handleFieldChange('right', e.target.value)}
        placeholder="Value"
        className="h-7 text-xs min-w-[80px] max-w-[100px]"
      />
    );
  };

  // Render column for cascading picker
  const renderPickerColumn = (items, selectedId, onSelect, emptyMsg) => (
    <div className="w-1/2 overflow-y-auto h-[220px] bg-white">
      {items.length === 0 ? (
        <div className="p-3 text-xs text-gray-400 text-center">{emptyMsg}</div>
      ) : (
        items.map((item, idx) => (
          <button
            key={item.id + idx}
            type="button"
            onClick={() => onSelect(item)}
            className={`w-full text-left px-2 py-1.5 text-xs flex items-center justify-between hover:bg-blue-50 border-b border-gray-100 ${
              selectedId === item.id ? 'bg-blue-100 text-blue-700 font-medium' : 'text-gray-700'
            }`}
          >
            <span className="truncate pr-1">{item.label}</span>
            {item.hasChildren && <ChevronRight className="h-3 w-3 text-gray-400 flex-shrink-0" />}
          </button>
        ))
      )}
    </div>
  );
  
  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5 p-2 bg-slate-50 rounded-lg border border-slate-200">
        {/* Logic indicator (AND/OR) - shown for 2nd condition onwards */}
        {showLogic && (
          <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-white h-5">
            {logic}
          </Badge>
        )}
        
        {/* Source selector */}
        <select
          value={source}
          onChange={(e) => handleFieldChange('source', e.target.value)}
          className="h-7 text-xs border rounded px-1.5 bg-white focus:ring-1 focus:ring-blue-500 w-[70px]"
        >
          <option value={CONDITION_SOURCES.RECORD}>Record</option>
          <option value={CONDITION_SOURCES.USER}>User</option>
        </select>
        
        {/* Field selector - Record fields with cascading picker */}
        {source === CONDITION_SOURCES.RECORD ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs justify-between min-w-[100px] max-w-[140px] font-normal"
            onClick={openFieldPicker}
          >
            <span className={`truncate ${isParentField ? 'text-indigo-600 font-medium' : ''}`}>
              {getFieldLabel()}
            </span>
            <ChevronRight className="h-3 w-3 text-gray-400 ml-1 flex-shrink-0" />
          </Button>
        ) : (
          <select
            value={left}
            onChange={(e) => handleFieldChange('left', e.target.value)}
            className="h-7 text-xs border rounded px-1.5 bg-white focus:ring-1 focus:ring-blue-500 min-w-[90px]"
          >
            <option value="">Select...</option>
            {USER_FIELDS.map(field => (
              <option key={field.key} value={field.key}>
                {field.label}
              </option>
            ))}
          </select>
        )}
        
        {/* Operator selector */}
        <select
          value={operator}
          onChange={(e) => handleFieldChange('operator', e.target.value)}
          className="h-7 text-xs border rounded px-1.5 bg-white focus:ring-1 focus:ring-blue-500 min-w-[70px]"
          disabled={!left}
        >
          {operators.map(op => (
            <option key={op.value} value={op.value}>
              {op.label}
            </option>
          ))}
        </select>
        
        {/* Value input */}
        {renderValueInput()}
        
        {/* Remove button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={onRemove}
          disabled={!canRemove}
          className="h-6 w-6 p-0 text-slate-400 hover:text-red-500 hover:bg-red-50"
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>

      {/* Salesforce-style 3-Column Field Picker Dialog */}
      <Dialog open={showFieldPicker} onOpenChange={setShowFieldPicker}>
        <DialogContent className="sm:max-w-xl p-0 gap-0">
          <DialogHeader className="px-3 py-2 border-b bg-gray-50">
            <DialogTitle className="text-sm font-medium">Insert Field</DialogTitle>
          </DialogHeader>

          {/* Search */}
          <div className="px-3 py-2 border-b">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400" />
              <input
                type="text"
                placeholder="Search fields..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-7 pr-3 py-1.5 border rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Info text */}
          <div className="px-3 py-1.5 border-b bg-blue-50 text-[10px] text-blue-600">
            Labels with &quot;&gt;&quot; have more fields. Click to drill down.
          </div>

          {/* Three-column picker */}
          <div className="flex border-b">
            {/* Column 1: Object categories */}
            <div className="w-1/3 border-r overflow-y-auto h-[220px] bg-gray-50">
              {/* Current Object */}
              <button
                type="button"
                onClick={() => {
                  setSelectedColumn1('current');
                  setSelectedColumn2(null);
                }}
                className={`w-full text-left px-2 py-1.5 text-xs flex items-center justify-between hover:bg-blue-50 border-b ${
                  selectedColumn1 === 'current' ? 'bg-blue-100 text-blue-700 font-medium' : ''
                }`}
              >
                <span className="truncate">{objectName || 'Record'}</span>
                <ChevronRight className="h-3 w-3 text-gray-400 flex-shrink-0" />
              </button>
              
              {/* Parent lookup categories */}
              {Object.keys(parentFieldGroups).map(parentName => (
                <button
                  key={parentName}
                  type="button"
                  onClick={() => {
                    setSelectedColumn1(parentName);
                    setSelectedColumn2(null);
                  }}
                  className={`w-full text-left px-2 py-1.5 text-xs flex items-center justify-between hover:bg-blue-50 border-b ${
                    selectedColumn1 === parentName ? 'bg-blue-100 text-blue-700 font-medium' : ''
                  }`}
                >
                  <span className="flex items-center gap-1 truncate">
                    <Link2 className="h-3 w-3 text-indigo-500 flex-shrink-0" />
                    <span className="truncate">{parentName}</span>
                  </span>
                  <ChevronRight className="h-3 w-3 text-gray-400 flex-shrink-0" />
                </button>
              ))}
            </div>

            {/* Column 2: Fields of selected object */}
            <div className="w-1/3 border-r overflow-y-auto h-[220px] bg-white">
              {selectedColumn1 === 'current' ? (
                filteredRegularFields.length > 0 ? (
                  filteredRegularFields.map(field => {
                    const fieldKey = field.key || field.api_name;
                    const isLookup = fieldKey?.endsWith('_id') && parentFieldGroups[
                      Object.keys(parentFieldGroups).find(k => k.toLowerCase() === fieldKey.replace('_id', '').toLowerCase())
                    ];
                    return (
                      <button
                        key={fieldKey}
                        type="button"
                        onClick={() => {
                          if (isLookup) {
                            const parentKey = Object.keys(parentFieldGroups).find(k => 
                              k.toLowerCase() === fieldKey.replace('_id', '').toLowerCase()
                            );
                            if (parentKey) {
                              setSelectedColumn1(parentKey);
                              setSelectedColumn2(fieldKey);
                            }
                          } else {
                            handleSelectField(fieldKey);
                          }
                        }}
                        className="w-full text-left px-2 py-1.5 text-xs hover:bg-blue-50 border-b border-gray-100 flex items-center justify-between"
                      >
                        <span className="truncate">{field.label || formatFieldLabel(fieldKey)}</span>
                        {isLookup && <ChevronRight className="h-3 w-3 text-indigo-400 flex-shrink-0" />}
                      </button>
                    );
                  })
                ) : (
                  <div className="p-3 text-xs text-gray-400 text-center">No fields</div>
                )
              ) : selectedColumn1 && filteredParentFields[selectedColumn1] ? (
                filteredParentFields[selectedColumn1].map(field => (
                  <button
                    key={field.key || field.api_name}
                    type="button"
                    onClick={() => handleSelectField(field.key || field.api_name)}
                    className="w-full text-left px-2 py-1.5 text-xs hover:bg-indigo-50 border-b border-gray-100"
                  >
                    <span className="truncate">{field.label || formatFieldLabel(field.key || field.api_name)}</span>
                  </button>
                ))
              ) : (
                <div className="p-3 text-xs text-gray-400 text-center">Select a category</div>
              )}
            </div>

            {/* Column 3: Parent fields when a parent category is selected */}
            <div className="w-1/3 overflow-y-auto h-[220px] bg-gray-50">
              {selectedColumn1 && selectedColumn1 !== 'current' && filteredParentFields[selectedColumn1] ? (
                filteredParentFields[selectedColumn1].map(field => (
                  <button
                    key={`path-${field.key || field.api_name}`}
                    type="button"
                    onClick={() => handleSelectField(field.key || field.api_name)}
                    className="w-full text-left px-2 py-1.5 text-xs hover:bg-indigo-50 border-b border-gray-100"
                  >
                    <div className="text-[10px] text-indigo-600 font-mono truncate">
                      {field.key || field.api_name}
                    </div>
                  </button>
                ))
              ) : (
                <div className="p-3 text-xs text-gray-400 text-center">
                  {selectedColumn1 === 'current' ? 'Click lookup → to drill down' : 'Select a category'}
                </div>
              )}
            </div>
          </div>

          <div className="px-3 py-2 bg-gray-50 flex justify-center">
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setShowFieldPicker(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

/**
 * Main Visibility Condition Builder Component
 */
const VisibilityConditionBuilder = ({
  visibility,
  onChange,
  objectFields = [],
  objectName = '',
  className = '',
}) => {
  const [expanded, setExpanded] = useState(true);
  
  // Get current values with defaults
  const mode = visibility?.mode || VISIBILITY_MODES.ALWAYS;
  const logic = visibility?.logic || LOGIC_OPERATORS.AND;
  const conditions = visibility?.conditions || [];
  
  // Update visibility config
  const updateVisibility = useCallback((updates) => {
    onChange({
      mode,
      logic,
      conditions,
      ...visibility,
      ...updates,
    });
  }, [visibility, mode, logic, conditions, onChange]);
  
  // Handle mode change
  const handleModeChange = (newMode) => {
    if (newMode === VISIBILITY_MODES.ALWAYS) {
      // Clear conditions when switching to always
      onChange({ mode: newMode });
    } else {
      // Add empty condition if none exist
      updateVisibility({
        mode: newMode,
        conditions: conditions.length > 0 ? conditions : [createEmptyCondition()],
      });
    }
  };
  
  // Handle logic change
  const handleLogicChange = (newLogic) => {
    updateVisibility({ logic: newLogic });
  };
  
  // Add condition
  const addCondition = () => {
    updateVisibility({
      conditions: [...conditions, createEmptyCondition()],
    });
  };
  
  // Update condition
  const updateCondition = (index, updated) => {
    const newConditions = [...conditions];
    newConditions[index] = updated;
    updateVisibility({ conditions: newConditions });
  };
  
  // Remove condition
  const removeCondition = (index) => {
    const newConditions = conditions.filter((_, i) => i !== index);
    updateVisibility({ conditions: newConditions });
  };
  
  const showConditionBuilder = mode !== VISIBILITY_MODES.ALWAYS;
  
  return (
    <div className={`space-y-2 ${className}`}>
      {/* Section Header */}
      <div 
        className="flex items-center justify-between cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-1.5">
          {mode === VISIBILITY_MODES.HIDE_WHEN ? (
            <EyeOff className="h-3.5 w-3.5 text-orange-500" />
          ) : (
            <Eye className="h-3.5 w-3.5 text-blue-500" />
          )}
          <span className="text-[10px] font-semibold text-slate-700 uppercase">
            Visibility
          </span>
        </div>
        <ChevronDown className={`h-3.5 w-3.5 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </div>
      
      {expanded && (
        <div className="space-y-2">
          {/* Mode Selector - Compact */}
          <div className="space-y-1">
            <div className="grid grid-cols-1 gap-1">
              <label 
                className={`flex items-center gap-1.5 p-1.5 rounded border cursor-pointer transition-colors ${
                  mode === VISIBILITY_MODES.ALWAYS 
                    ? 'border-blue-500 bg-blue-50' 
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <input
                  type="radio"
                  name="visibility-mode"
                  checked={mode === VISIBILITY_MODES.ALWAYS}
                  onChange={() => handleModeChange(VISIBILITY_MODES.ALWAYS)}
                  className="w-3 h-3 text-blue-600"
                />
                <Eye className="h-3 w-3 text-green-500" />
                <span className="text-[10px] font-medium text-slate-700">Always show</span>
              </label>
              
              <label 
                className={`flex items-center gap-1.5 p-1.5 rounded border cursor-pointer transition-colors ${
                  mode === VISIBILITY_MODES.SHOW_WHEN 
                    ? 'border-blue-500 bg-blue-50' 
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <input
                  type="radio"
                  name="visibility-mode"
                  checked={mode === VISIBILITY_MODES.SHOW_WHEN}
                  onChange={() => handleModeChange(VISIBILITY_MODES.SHOW_WHEN)}
                  className="w-3 h-3 text-blue-600"
                />
                <Eye className="h-3 w-3 text-blue-500" />
                <span className="text-[10px] font-medium text-slate-700">Show when match</span>
              </label>
              
              <label 
                className={`flex items-center gap-1.5 p-1.5 rounded border cursor-pointer transition-colors ${
                  mode === VISIBILITY_MODES.HIDE_WHEN 
                    ? 'border-orange-500 bg-orange-50' 
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <input
                  type="radio"
                  name="visibility-mode"
                  checked={mode === VISIBILITY_MODES.HIDE_WHEN}
                  onChange={() => handleModeChange(VISIBILITY_MODES.HIDE_WHEN)}
                  className="w-3 h-3 text-orange-600"
                />
                <EyeOff className="h-3 w-3 text-orange-500" />
                <span className="text-[10px] font-medium text-slate-700">Hide when match</span>
              </label>
            </div>
          </div>
          
          {/* Condition Builder (only for showWhen/hideWhen) */}
          {showConditionBuilder && (
            <div className="space-y-2 pt-2 border-t">
              {/* Logic Selector (AND/OR) - Compact */}
              {conditions.length > 1 && (
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-slate-600">Match:</span>
                  <div className="flex gap-0.5">
                    <button
                      onClick={() => handleLogicChange(LOGIC_OPERATORS.AND)}
                      className={`px-1.5 py-0.5 text-[10px] rounded transition-colors ${
                        logic === LOGIC_OPERATORS.AND
                          ? 'bg-blue-500 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      ALL
                    </button>
                    <button
                      onClick={() => handleLogicChange(LOGIC_OPERATORS.OR)}
                      className={`px-1.5 py-0.5 text-[10px] rounded transition-colors ${
                        logic === LOGIC_OPERATORS.OR
                          ? 'bg-blue-500 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      ANY
                    </button>
                  </div>
                </div>
              )}
              
              {/* Conditions List */}
              <div className="space-y-1.5">
                {conditions.map((condition, index) => (
                  <ConditionRow
                    key={condition.id || index}
                    condition={condition}
                    index={index}
                    objectFields={objectFields}
                    onChange={(updated) => updateCondition(index, updated)}
                    onRemove={() => removeCondition(index)}
                    canRemove={conditions.length > 1}
                    showLogic={index > 0}
                    logic={logic}
                    objectName={objectName}
                  />
                ))}
              </div>
              
              {/* Add Condition Button */}
              <Button
                variant="outline"
                size="sm"
                onClick={addCondition}
                className="w-full h-6 text-[10px] border-dashed"
              >
                <Plus className="h-3 w-3 mr-1" />
                Add Condition
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default VisibilityConditionBuilder;
