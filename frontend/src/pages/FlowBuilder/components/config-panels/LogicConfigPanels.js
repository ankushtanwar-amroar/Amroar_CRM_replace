/**
 * Logic Node Config Panels
 * Extracted from NodeConfigPanel.js - handles delay, loop, condition, wait, merge nodes
 */
import React from 'react';
import { Label } from '../../../../components/ui/label';
import { Input } from '../../../../components/ui/input';
import { Textarea } from '../../../../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../../components/ui/select';
import { Button } from '../../../../components/ui/button';
import { Trash2, Plus } from 'lucide-react';
import ComboField from '../ComboField';
import ResourcePickerField from '../ResourcePickerField';

// Utility: Generate API name from label
const generateApiName = (label) => {
  if (!label) return '';
  return label.toLowerCase().trim().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
};

/**
 * Delay Config Panel
 */
export const DelayConfigPanel = ({ config, setConfig, flowVariables }) => {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-slate-900">Delay</h3>
        <p className="text-sm text-slate-600 mt-1">Pause execution for a duration or until a specific date/time</p>
      </div>

      {/* Label */}
      <div>
        <Label className="text-sm font-medium">Label</Label>
        <Input
          className="w-full mt-1"
          value={config.label || 'Wait'}
          onChange={(e) => setConfig({ ...config, label: e.target.value })}
          placeholder="Wait 1 Hour"
        />
      </div>

      {/* Delay Mode */}
      <div className="space-y-3">
        <Label className="text-sm font-medium">Delay Type</Label>
        <div className="flex flex-col gap-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="delayMode"
              value="duration"
              checked={!config.delay_mode || config.delay_mode === 'duration'}
              onChange={() => setConfig({ ...config, delay_mode: 'duration' })}
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
              onChange={() => setConfig({ ...config, delay_mode: 'fixed' })}
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
              onChange={() => setConfig({ ...config, delay_mode: 'dynamic_datetime' })}
              className="w-4 h-4 text-indigo-600"
            />
            <span className="text-sm text-slate-700 font-medium">Until DateTime (Dynamic) ⭐</span>
          </label>
        </div>
      </div>

      {/* Duration Mode */}
      {(!config.delay_mode || config.delay_mode === 'duration') && (
        <div className="space-y-3">
          <Label className="text-sm font-medium">Duration</Label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-slate-600">Value</Label>
              <Input
                type="number"
                min="0"
                className="w-full mt-1"
                value={config.duration_value || 1}
                onChange={(e) => setConfig({ ...config, duration_value: parseInt(e.target.value) || 1 })}
              />
            </div>
            <div>
              <Label className="text-xs text-slate-600">Unit</Label>
              <Select
                value={config.duration_unit || 'hours'}
                onValueChange={(value) => setConfig({ ...config, duration_unit: value })}
              >
                <SelectTrigger className="w-full mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="minutes">Minutes</SelectItem>
                  <SelectItem value="hours">Hours</SelectItem>
                  <SelectItem value="days">Days</SelectItem>
                  <SelectItem value="weeks">Weeks</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-2">
            ℹ️ Execution will pause for {config.duration_value || 1} {config.duration_unit || 'hours'}
          </p>
        </div>
      )}

      {/* Fixed Date Mode */}
      {config.delay_mode === 'fixed' && (
        <div className="space-y-3">
          <Label className="text-sm font-medium">Execute At</Label>
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
        </div>
      )}

      {/* Dynamic DateTime Mode */}
      {config.delay_mode === 'dynamic_datetime' && (
        <div className="space-y-3">
          <Label className="text-sm font-medium">Wait Until (DateTime Field)</Label>
          <ComboField
            value={config.wait_until_field || ''}
            onChange={(value) => setConfig({ ...config, wait_until_field: value })}
            options={(flowVariables || []).map(v => ({
              value: `{{${v.name}}}`,
              label: v.name,
              type: v.dataType
            }))}
            placeholder="Select datetime variable"
          />
          <p className="text-xs text-slate-500">
            Flow will wait until the datetime value in this field
          </p>
          
          {/* Offset */}
          <div className="mt-4 p-3 bg-slate-50 rounded-md">
            <Label className="text-sm font-medium">Time Offset (Optional)</Label>
            <div className="grid grid-cols-3 gap-2 mt-2">
              <Input
                type="number"
                value={config.offset_value || 0}
                onChange={(e) => setConfig({ ...config, offset_value: parseInt(e.target.value) || 0 })}
                placeholder="0"
              />
              <Select
                value={config.offset_unit || 'hours'}
                onValueChange={(value) => setConfig({ ...config, offset_unit: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="minutes">Minutes</SelectItem>
                  <SelectItem value="hours">Hours</SelectItem>
                  <SelectItem value="days">Days</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={config.offset_direction || 'before'}
                onValueChange={(value) => setConfig({ ...config, offset_direction: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="before">Before</SelectItem>
                  <SelectItem value="after">After</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Loop Config Panel
 */
export const LoopConfigPanel = ({ 
  config, 
  setConfig, 
  flowVariables, 
  onCreateVariable 
}) => {
  return (
    <div className="space-y-4">
      <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
        <p className="text-sm text-purple-800 font-medium">🔁 Loop Element</p>
        <p className="text-xs text-purple-600 mt-1">
          Iterate over a collection and execute actions for each item
        </p>
      </div>

      {/* Label and API Name */}
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
            placeholder="e.g., Process Each Contact"
          />
        </div>
        <div>
          <Label>API Name</Label>
          <Input
            className="w-full font-mono bg-slate-50"
            value={config.api_name || ''}
            onChange={(e) => setConfig({ ...config, api_name: e.target.value })}
            placeholder="api_name"
          />
        </div>
      </div>

      {/* Collection Variable */}
      <div>
        <Label>Collection Variable <span className="text-red-500">*</span></Label>
        <ResourcePickerField
          value={config.collection_variable || ''}
          onChange={(value) => setConfig({ ...config, collection_variable: value })}
          flowVariables={(flowVariables || []).filter(v => 
            v.dataType === 'Collection' || 
            v.dataType === 'Record Collection' ||
            v.name?.includes('Collection')
          )}
          onCreateVariable={onCreateVariable}
          placeholder="Select collection variable"
        />
        <p className="text-xs text-slate-500 mt-1">
          The collection to iterate over
        </p>
      </div>

      {/* Loop Variable Name */}
      <div>
        <Label>Current Item Variable Name</Label>
        <Input
          className="w-full"
          value={config.loop_variable || ''}
          onChange={(e) => setConfig({ ...config, loop_variable: e.target.value })}
          placeholder="e.g., CurrentContact"
        />
        <p className="text-xs text-slate-500 mt-1">
          Access current item fields using {'{{'}{config.loop_variable || 'CurrentItem'}_fieldname{'}}'}
        </p>
      </div>

      {/* Direction */}
      <div>
        <Label>Loop Direction</Label>
        <Select
          value={config.direction || 'first_to_last'}
          onValueChange={(value) => setConfig({ ...config, direction: value })}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="first_to_last">First to Last</SelectItem>
            <SelectItem value="last_to_first">Last to First</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
};

/**
 * Condition Config Panel (Simple If/Else)
 */
export const ConditionConfigPanel = ({ 
  config, 
  setConfig, 
  handleConfigChange,
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
      <div>
        <Label>Field</Label>
        <ComboField
          value={config.field || ''}
          onChange={(value) => handleConfigChange('field', value)}
          options={fieldOptions}
          placeholder="Select field"
        />
      </div>
      <div>
        <Label>Operator</Label>
        <Select
          value={config.operator || 'equals'}
          onValueChange={(value) => handleConfigChange('operator', value)}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="equals">Equals</SelectItem>
            <SelectItem value="not_equals">Not Equals</SelectItem>
            <SelectItem value="greater_than">Greater Than</SelectItem>
            <SelectItem value="less_than">Less Than</SelectItem>
            <SelectItem value="contains">Contains</SelectItem>
            <SelectItem value="is_null">Is Null</SelectItem>
            <SelectItem value="is_not_null">Is Not Null</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>Value</Label>
        <ComboField
          value={config.value || ''}
          onChange={(value) => handleConfigChange('value', value)}
          options={flowVariables.map(v => ({
            value: `{{${v.name}}}`,
            label: v.name
          }))}
          placeholder="Enter value or select variable"
        />
      </div>
    </div>
  );
};

/**
 * Wait Config Panel
 */
export const WaitConfigPanel = ({ config, setConfig, handleConfigChange }) => {
  return (
    <div className="space-y-4">
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
        <p className="text-sm text-amber-800 font-medium">⏳ Wait Element</p>
        <p className="text-xs text-amber-600 mt-1">
          Pause execution until specific conditions are met
        </p>
      </div>
      <div>
        <Label>Wait Type</Label>
        <Select
          value={config.wait_type || 'event'}
          onValueChange={(value) => handleConfigChange('wait_type', value)}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="event">Wait for Event</SelectItem>
            <SelectItem value="time">Wait for Time</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>Description</Label>
        <Textarea
          className="w-full"
          value={config.description || ''}
          onChange={(e) => handleConfigChange('description', e.target.value)}
          placeholder="Describe what this wait is for..."
          rows={3}
        />
      </div>
    </div>
  );
};

/**
 * Merge Config Panel
 */
export const MergeConfigPanel = ({ config, setConfig, handleConfigChange }) => {
  return (
    <div className="space-y-4">
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
        <p className="text-sm text-slate-800 font-medium">🔀 Merge Element</p>
        <p className="text-xs text-slate-600 mt-1">
          Combine multiple paths back into a single flow
        </p>
      </div>
      <div>
        <Label>Label</Label>
        <Input
          className="w-full"
          value={config.label || 'Merge'}
          onChange={(e) => handleConfigChange('label', e.target.value)}
          placeholder="Merge Point"
        />
      </div>
    </div>
  );
};

export default {
  DelayConfigPanel,
  LoopConfigPanel,
  ConditionConfigPanel,
  WaitConfigPanel,
  MergeConfigPanel
};
