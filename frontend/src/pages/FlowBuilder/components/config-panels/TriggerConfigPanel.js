/**
 * Trigger Node Config Panel
 * Extracted from NodeConfigPanel.js - handles trigger configuration
 */
import React, { useState, useRef, useEffect } from 'react';
import { Label } from '../../../../components/ui/label';
import { Input } from '../../../../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../../components/ui/select';
import { Button } from '../../../../components/ui/button';
import { Trash2, Plus, Search, ChevronDown, Check } from 'lucide-react';
import ResourcePickerField from '../ResourcePickerField';
import SearchableFieldSelect from '../SearchableFieldSelect';

// Searchable Object Select Component
const SearchableObjectSelect = ({ value, onChange, objects, placeholder = 'Select object' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef(null);
  const inputRef = useRef(null);

  const getDisplayLabel = () => {
    if (!value) return placeholder;
    const selectedObj = objects?.find(obj => obj.name === value);
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
    obj.label.toLowerCase().includes(searchQuery.toLowerCase())
  );

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

  useEffect(() => {
    if (isOpen && inputRef.current) inputRef.current.focus();
  }, [isOpen]);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3 py-2 text-left border rounded-md bg-white hover:bg-gray-50"
      >
        <span className={value ? 'text-gray-900' : 'text-gray-400'}>{getDisplayLabel()}</span>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg">
          <div className="p-2 border-b">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                ref={inputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search objects..."
                className="w-full pl-8 pr-3 py-1.5 text-sm border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="max-h-60 overflow-auto py-1">
            {filteredObjects.length === 0 ? (
              <div className="px-3 py-2 text-sm text-gray-500">No objects found</div>
            ) : (
              filteredObjects.map((obj) => (
                <button
                  key={obj.name}
                  type="button"
                  onClick={() => {
                    onChange(obj.name);
                    setIsOpen(false);
                    setSearchQuery('');
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 text-left text-sm hover:bg-gray-100 ${value === obj.name ? 'bg-blue-50 text-blue-700' : ''}`}
                >
                  <span>{obj.label}</span>
                  {value === obj.name && <Check className="w-4 h-4 text-blue-600" />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const TriggerConfigPanel = ({
  config,
  setConfig,
  handleConfigChange,
  objectsList,
  availableFields,
  flowVariables
}) => {
  const fieldOptions = [
    ...(availableFields || []).map(f => ({
      value: f.api_name || f.name,
      label: f.label || f.name
    })),
    ...(flowVariables || []).map(v => ({
      value: `{{${v.name}}}`,
      label: v.name
    }))
  ];

  return (
    <div className="space-y-4">
      {/* Object Type */}
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

      {/* Event Type */}
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
              className="w-4 h-4 text-indigo-600 mt-0.5"
            />
            <div className="flex-1">
              <span className="text-sm font-medium text-slate-900 group-hover:text-indigo-600">Every Time Criteria Matches</span>
              <p className="text-xs text-slate-600 mt-0.5">Flow will execute every time a record meets the criteria</p>
            </div>
          </label>
          <label className="flex items-start gap-3 cursor-pointer group">
            <input
              type="radio"
              name="match_mode"
              value="first_time_only"
              checked={config.match_mode === 'first_time_only'}
              onChange={(e) => handleConfigChange('match_mode', e.target.value)}
              className="w-4 h-4 text-indigo-600 mt-0.5"
            />
            <div className="flex-1">
              <span className="text-sm font-medium text-slate-900 group-hover:text-indigo-600">Only the First Time</span>
              <p className="text-xs text-slate-600 mt-0.5">Flow will execute only once per record for this version</p>
            </div>
          </label>
        </div>
      </div>

      {/* Filter Logic */}
      <div>
        <Label>Filter Logic</Label>
        <Select
          value={config.filter_logic || 'none'}
          onValueChange={(value) => {
            const newConfig = { ...config, filter_logic: value };
            if (value !== 'none') {
              newConfig.filter_conditions = config.filter_conditions || [{ field: '', operator: 'equals', value: '' }];
            } else {
              newConfig.filter_conditions = [];
            }
            setConfig(newConfig);
          }}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No Filter (Trigger on all events)</SelectItem>
            <SelectItem value="and">Match ALL Conditions (AND)</SelectItem>
            <SelectItem value="or">Match ANY Condition (OR)</SelectItem>
            <SelectItem value="custom">Custom Logic Formula</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Filter Conditions */}
      {config.filter_logic && config.filter_logic !== 'none' && (
        <div>
          <Label>Entry Conditions</Label>
          <p className="text-xs text-slate-500 mb-2">Define when this trigger should fire</p>
          <div className="space-y-2 mt-2">
            {(config.filter_conditions || []).map((condition, index) => (
              <div key={index} className="flex items-center gap-2 p-3 bg-slate-50 rounded-md border border-slate-200">
                <span className="text-xs font-mono text-slate-400 w-6">{index + 1}.</span>
                
                {/* Field - Searchable Dropdown */}
                <div className="flex-1">
                  <SearchableFieldSelect
                    value={condition.field || ''}
                    onChange={(value) => {
                      const newConditions = [...(config.filter_conditions || [])];
                      newConditions[index] = { ...newConditions[index], field: value };
                      setConfig({ ...config, filter_conditions: newConditions });
                    }}
                    fields={availableFields || []}
                    placeholder="Select field..."
                  />
                </div>
                
                {/* Operator */}
                <Select
                  value={condition.operator || 'equals'}
                  onValueChange={(value) => {
                    const newConditions = [...(config.filter_conditions || [])];
                    newConditions[index] = { ...newConditions[index], operator: value };
                    setConfig({ ...config, filter_conditions: newConditions });
                  }}
                >
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="equals">Equals (=)</SelectItem>
                    <SelectItem value="not_equals">Not Equals (≠)</SelectItem>
                    <SelectItem value="contains">Contains</SelectItem>
                    <SelectItem value="starts_with">Starts With</SelectItem>
                    <SelectItem value="ends_with">Ends With</SelectItem>
                    <SelectItem value="greater_than">Greater Than (&gt;)</SelectItem>
                    <SelectItem value="less_than">Less Than (&lt;)</SelectItem>
                    <SelectItem value="is_null">Is Null</SelectItem>
                    <SelectItem value="is_not_null">Is Not Null</SelectItem>
                  </SelectContent>
                </Select>
                
                {/* Value - ResourcePickerField with All Resources */}
                <div className="flex-1">
                  <ResourcePickerField
                    value={condition.value || ''}
                    onChange={(value) => {
                      const newConditions = [...(config.filter_conditions || [])];
                      newConditions[index] = { ...newConditions[index], value: value };
                      setConfig({ ...config, filter_conditions: newConditions });
                    }}
                    nodes={[]}
                    availableFields={availableFields}
                    flowVariables={flowVariables}
                    placeholder="Type or select value..."
                  />
                </div>
                
                {(config.filter_conditions || []).length > 1 && (
                  <button
                    type="button"
                    onClick={() => {
                      const newConditions = (config.filter_conditions || []).filter((_, i) => i !== index);
                      setConfig({ ...config, filter_conditions: newConditions });
                    }}
                    className="p-1.5 text-red-600 hover:bg-red-50 rounded"
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
              className="w-full border-dashed"
            >
              <Plus className="w-4 h-4 mr-2" /> Add Condition
            </Button>
          </div>
        </div>
      )}

      {/* Custom Logic */}
      {config.filter_logic === 'custom' && (
        <div>
          <Label>Custom Logic Formula</Label>
          <Input
            className="w-full font-mono"
            value={config.filter_custom_logic || ''}
            onChange={(e) => handleConfigChange('filter_custom_logic', e.target.value)}
            placeholder="e.g., (1 AND 2) OR 3"
          />
          <p className="text-xs text-slate-500 mt-1">Use condition numbers with AND, OR, NOT</p>
        </div>
      )}
    </div>
  );
};

export default TriggerConfigPanel;
