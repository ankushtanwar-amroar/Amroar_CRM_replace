import React, { useState } from 'react';
import { Plus, Trash2, GripVertical, ChevronDown, ChevronUp, AlertCircle } from 'lucide-react';
import { Button } from '../../../../components/ui/button';
import { Input } from '../../../../components/ui/input';
import { Label } from '../../../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../../components/ui/select';
import { Textarea } from '../../../../components/ui/textarea';
import { Switch } from '../../../../components/ui/switch';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '../../../../components/ui/accordion';

const ToastRulesEditor = ({ toastConfig, onChange }) => {
  const [expandedRule, setExpandedRule] = useState(null);

  const updateToastConfig = (updates) => {
    onChange({ ...toastConfig, ...updates });
  };

  const addRule = () => {
    const newRule = {
      id: `rule_${Date.now()}`,
      name: `Rule ${(toastConfig.rules?.length || 0) + 1}`,
      condition: '',
      type: 'info',
      title: 'Notification',
      message: 'Enter message here',
      position: 'top-right',
      duration: 3000,
      dismissible: true,
      stopFlow: false
    };

    const updatedRules = [...(toastConfig.rules || []), newRule];
    updateToastConfig({ rules: updatedRules });
    setExpandedRule(`rule-${updatedRules.length - 1}`);
  };

  const updateRule = (index, updates) => {
    const updatedRules = [...toastConfig.rules];
    updatedRules[index] = { ...updatedRules[index], ...updates };
    updateToastConfig({ rules: updatedRules });
  };

  const deleteRule = (index) => {
    const updatedRules = toastConfig.rules.filter((_, i) => i !== index);
    updateToastConfig({ rules: updatedRules });
  };

  const moveRule = (index, direction) => {
    const updatedRules = [...toastConfig.rules];
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    
    if (newIndex >= 0 && newIndex < updatedRules.length) {
      [updatedRules[index], updatedRules[newIndex]] = [updatedRules[newIndex], updatedRules[index]];
      updateToastConfig({ rules: updatedRules });
    }
  };

  return (
    <div className="space-y-4">
      {/* Trigger Timing */}
      <div className="space-y-2">
        <Label className="text-xs font-semibold">Trigger Timing</Label>
        <Select
          value={toastConfig.triggerTiming || 'onLoad'}
          onValueChange={(value) => updateToastConfig({ triggerTiming: value })}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="onLoad">On Screen Load</SelectItem>
            <SelectItem value="onNextClick">On Next Click</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-gray-500">When should the toast be evaluated?</p>
      </div>

      {/* Display Mode */}
      <div className="space-y-2">
        <Label className="text-xs font-semibold">Display Mode</Label>
        <Select
          value={toastConfig.displayMode || 'conditional'}
          onValueChange={(value) => updateToastConfig({ displayMode: value })}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="always">Always Show</SelectItem>
            <SelectItem value="conditional">Conditional Rules</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Conditional Rules */}
      {toastConfig.displayMode === 'conditional' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-semibold">Conditional Rules</Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addRule}
              className="h-7 text-xs"
            >
              <Plus className="w-3 h-3 mr-1" />
              Add Rule
            </Button>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-md p-2">
            <p className="text-xs text-blue-800">
              <AlertCircle className="w-3 h-3 inline mr-1" />
              Rules are evaluated top-to-bottom. First matching rule triggers the toast.
            </p>
          </div>

          {(!toastConfig.rules || toastConfig.rules.length === 0) && (
            <div className="text-center py-6 bg-gray-50 rounded-md border border-dashed">
              <p className="text-xs text-gray-500">No rules defined</p>
              <p className="text-xs text-gray-400 mt-1">Click "Add Rule" to create your first rule</p>
            </div>
          )}

          <Accordion type="single" collapsible value={expandedRule} onValueChange={setExpandedRule}>
            {toastConfig.rules?.map((rule, index) => (
              <AccordionItem key={rule.id} value={`rule-${index}`} className="border rounded-md mb-2">
                <AccordionTrigger className="px-3 py-2 hover:no-underline">
                  <div className="flex items-center gap-2 flex-1">
                    <GripVertical className="w-4 h-4 text-gray-400" />
                    <div className="flex items-center gap-2 flex-1">
                      <span className="text-xs font-medium text-gray-700">
                        {index + 1}. {rule.name || `Rule ${index + 1}`}
                      </span>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        rule.type === 'error' ? 'bg-red-100 text-red-700' :
                        rule.type === 'warning' ? 'bg-amber-100 text-amber-700' :
                        rule.type === 'success' ? 'bg-green-100 text-green-700' :
                        'bg-blue-100 text-blue-700'
                      }`}>
                        {rule.type.toUpperCase()}
                      </span>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-3 pb-3 space-y-3">
                  {/* Rule Name */}
                  <div className="space-y-1">
                    <Label className="text-xs">Rule Name</Label>
                    <Input
                      value={rule.name || ''}
                      onChange={(e) => updateRule(index, { name: e.target.value })}
                      placeholder="e.g., Check Email Format"
                      className="h-8 text-xs"
                    />
                  </div>

                  {/* Condition Formula */}
                  <div className="space-y-1">
                    <Label className="text-xs">
                      Condition Formula {index === 0 && <span className="text-gray-500">(leave empty for default)</span>}
                    </Label>
                    <Textarea
                      value={rule.condition || ''}
                      onChange={(e) => updateRule(index, { condition: e.target.value })}
                      placeholder="e.g., {{Screen.Email}} != '' AND contains({{Screen.Email}}, '@')"
                      className="text-xs font-mono"
                      rows={2}
                    />
                    <p className="text-xs text-gray-500">
                      Use {`{{Screen.FieldName}}`} for field values, operators: ==, !=, &gt;, &lt;, AND, OR
                    </p>
                  </div>

                  {/* Toast Type */}
                  <div className="space-y-1">
                    <Label className="text-xs">Toast Type</Label>
                    <Select
                      value={rule.type}
                      onValueChange={(value) => updateRule(index, { type: value, stopFlow: value === 'error' ? true : rule.stopFlow })}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="info">Info</SelectItem>
                        <SelectItem value="success">Success</SelectItem>
                        <SelectItem value="warning">Warning</SelectItem>
                        <SelectItem value="error">Error</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Title */}
                  <div className="space-y-1">
                    <Label className="text-xs">Title (Optional)</Label>
                    <Input
                      value={rule.title || ''}
                      onChange={(e) => updateRule(index, { title: e.target.value })}
                      placeholder="e.g., Validation Error"
                      className="h-8 text-xs"
                    />
                  </div>

                  {/* Message */}
                  <div className="space-y-1">
                    <Label className="text-xs">Message *</Label>
                    <Textarea
                      value={rule.message || ''}
                      onChange={(e) => updateRule(index, { message: e.target.value })}
                      placeholder="Enter the message to display"
                      className="text-xs"
                      rows={2}
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    {/* Position */}
                    <div className="space-y-1">
                      <Label className="text-xs">Position</Label>
                      <Select
                        value={rule.position || 'top-right'}
                        onValueChange={(value) => updateRule(index, { position: value })}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="top-left">Top Left</SelectItem>
                          <SelectItem value="top-center">Top Center</SelectItem>
                          <SelectItem value="top-right">Top Right</SelectItem>
                          <SelectItem value="bottom-left">Bottom Left</SelectItem>
                          <SelectItem value="bottom-center">Bottom Center</SelectItem>
                          <SelectItem value="bottom-right">Bottom Right</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Duration */}
                    <div className="space-y-1">
                      <Label className="text-xs">Duration (ms)</Label>
                      <Input
                        type="number"
                        value={rule.duration || 3000}
                        onChange={(e) => updateRule(index, { duration: parseInt(e.target.value) || 3000 })}
                        className="h-8 text-xs"
                        min="1000"
                        max="10000"
                      />
                    </div>
                  </div>

                  {/* Dismissible */}
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Dismissible</Label>
                    <Switch
                      checked={rule.dismissible !== false}
                      onCheckedChange={(checked) => updateRule(index, { dismissible: checked })}
                    />
                  </div>

                  {/* Stop Flow (only for ERROR) */}
                  {rule.type === 'error' && (
                    <div className="flex items-center justify-between bg-red-50 p-2 rounded-md border border-red-200">
                      <div>
                        <Label className="text-xs font-semibold text-red-900">Stop Flow on Error</Label>
                        <p className="text-xs text-red-700 mt-0.5">Terminate execution when this error occurs</p>
                      </div>
                      <Switch
                        checked={rule.stopFlow !== false}
                        onCheckedChange={(checked) => updateRule(index, { stopFlow: checked })}
                      />
                    </div>
                  )}

                  {/* Rule Actions */}
                  <div className="flex items-center gap-2 pt-2 border-t">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => moveRule(index, 'up')}
                      disabled={index === 0}
                      className="h-7 text-xs"
                    >
                      <ChevronUp className="w-3 h-3 mr-1" />
                      Move Up
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => moveRule(index, 'down')}
                      disabled={index === toastConfig.rules.length - 1}
                      className="h-7 text-xs"
                    >
                      <ChevronDown className="w-3 h-3 mr-1" />
                      Move Down
                    </Button>
                    <div className="flex-1" />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteRule(index)}
                      className="h-7 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="w-3 h-3 mr-1" />
                      Delete
                    </Button>
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      )}

      {/* Always Show Mode - Simple Config */}
      {toastConfig.displayMode === 'always' && (
        <div className="space-y-3 bg-gray-50 p-3 rounded-md border">
          <p className="text-xs text-gray-600">Configure the toast that will always be displayed:</p>
          
          {/* Use first rule as the "always" config */}
          {toastConfig.rules && toastConfig.rules[0] && (
            <>
              <div className="space-y-1">
                <Label className="text-xs">Toast Type</Label>
                <Select
                  value={toastConfig.rules[0].type}
                  onValueChange={(value) => updateRule(0, { type: value })}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="info">Info</SelectItem>
                    <SelectItem value="success">Success</SelectItem>
                    <SelectItem value="warning">Warning</SelectItem>
                    <SelectItem value="error">Error</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Title</Label>
                <Input
                  value={toastConfig.rules[0].title || ''}
                  onChange={(e) => updateRule(0, { title: e.target.value })}
                  placeholder="e.g., Welcome"
                  className="h-8 text-xs"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Message *</Label>
                <Textarea
                  value={toastConfig.rules[0].message || ''}
                  onChange={(e) => updateRule(0, { message: e.target.value })}
                  placeholder="Enter message"
                  className="text-xs"
                  rows={2}
                  required
                />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default ToastRulesEditor;
